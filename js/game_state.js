// Iron & Dominion 1914 — 游戏状态

let G = {
    date: new Date(1914, 6, 26),
    speed: 1,
    paused: false,
    playerCountry: null,
    tick: 0,
    countries: {},
    divisions: [],
    projectiles: [],
    divIdCounter: 1,
    selectedProvince: null,
    selectedDivision: null,
    selectedDivisions: [],
    selBox: null,
    provinceOwners: {},
    provinceData: {},
    atWar: {},
    relations: {},
    alliances: {},
    militaryAccess: {},
    events: [],
    activeEvent: null,
    buildQueue: [],
    totalDivisions: {},
    armyGroups: {},
    activeTab: null,
    hoveredTabBtn: null,
    hoveredDiploBtn: null,
    cities: {},
    factories: [],
    focusFireLines: [],
    lastClickTime: 0,
    lastClickedUnitId: null,
    patrolTargets: {},
    patrolIndex: {},
    newsBanner: null,
    newsTimer: 0,
    factions: {},
    surrendered: {},
    warAnnouncements: {},
    moveLines: [],
    frontlines: {},
    frontlineDrawing: false,
    frontTargets: [],
    germanyDeclaredWar: false,
    navyProductionMode: false,
    selectedCity: null,
    gravestones: [],
    nonAggression: {},
    newsQueue: [],
    guarantees: {}, // guarantees[guarantor] = [guaranteedCountry, ...]
    diplomacyFocus: null, // 外交面板聚焦的国家，点击国旗切换
    warScore: {}, // warScore[attacker][defender] = number (positive = attacker winning)
    gameOver: false,
    gameOverMessage: "",
    selectedNavyNode: null, // 当前选中的海军节点ID
    ships: [],
    navyNodes: {},
    shipIdCounter: 1,
    shipNameCounters: {},
};
// bbox: { minX, maxX, minY, maxY } for each province (precomputed)
let PROVINCE_BBOX = {};

// == Historical population data (1914 estimates, in millions) ==
const POPULATION = {"GERMANY":67,"FRANCE":39,"UK":52,"ITALY":35,"AUSTRIA_HUNGARY":51,"RUSSIA":170,"TURKEY":23,"BELGIUM":8,"NETHERLANDS":6,"SPAIN":20,"PORTUGAL":6,"DENMARK":3,"SWITZERLAND":4,"LUXEMBOURG":0.3,"NORWAY":2.5,"SWEDEN":6,"GREECE":5,"SERBIA":4.5,"MONTENEGRO":0.5,"ALBANIA":1,"BULGARIA":4.5,"ROMANIA":8,"FINLAND":3};

// Manpower consumed per unit type (thousands of men)
const MANPOWER_COST = {
    infantry: 15, engineer: 12, cavalry: 10, artillery: 8,
    navy: 5,
};

// Unit type configs — COSTS BALANCED (higher costs, lower income)
const UNIT_TYPES = {
    infantry: { cost:50, range:0.12, fireRate:5, damage:8, speed:0.027, sym:"⚔️", label:"步兵", desc:"近距快速", manpower:15 },
    engineer: { cost:70, range:0.08, fireRate:5, damage:6, speed:0.022, sym:"⚙️", label:"工兵", desc:"短射程", manpower:12 },
    cavalry:  { cost:80, range:0.096, fireRate:3, damage:7, speed:0.057, sym:"🏇", label:"骑兵", desc:"高速机动", manpower:10 },
    artillery:{ cost:120, range:0.36, fireRate:18, damage:25, speed:0.013, sym:"💥", label:"炮兵", desc:"远程抛物线", manpower:8 },
    navy:     { cost:500, range:1.5, fireRate:30, damage:60, speed:0.045, sym:"🚢", label:"海军", desc:"远程重火力", manpower:5 },
};

function initProvinceData() {
    // Build city lookup: provinceId → list of cities in that province
    let provinceCities = {};
    for (let city of CITIES) {
        for (let p of PROVINCES) {
            if (p.x >= 900) continue;
            for (let ring of p.r) {
                if (ring.length >= 3 && isPointInPolygon(city.lon, city.lat, ring)) {
                    if (!provinceCities[p.id]) provinceCities[p.id] = [];
                    provinceCities[p.id].push(city);
                    break;
                }
            }
        }
    }

    for (let p of PROVINCES) {
        let co = p.c;
        let pid = p.id;

        // Count factories from cities in this province
        let factCount = 0;
        let citiesHere = provinceCities[pid] || [];
        for (let city of citiesHere) {
            let cf = CITY_FACTORIES[city.id];
            if (cf !== undefined) factCount += cf;
        }

        // Base income = rural income (factories add separate income)
        let baseIncome = 0.3;
        if (factCount > 0) {
            baseIncome = 0.2; // provinces with factories have less rural income
        }

        G.provinceData[pid] = {
            id: pid, name: p.n, country: co,
            originalCountry: co,
            income: baseIncome,
            factories: factCount,
            garrison: 0, fortification: 0,
            center: [p.x, p.y],
        };
        G.provinceOwners[pid] = co;
    }
    // Precompute bounding boxes for all provinces (fast rejection)
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let ring of p.r) {
            for (let v of ring) {
                if (v[0] < minX) minX = v[0];
                if (v[0] > maxX) maxX = v[0];
                if (v[1] < minY) minY = v[1];
                if (v[1] > maxY) maxY = v[1];
            }
        }
        PROVINCE_BBOX[p.id] = { minX, maxX, minY, maxY };
    }

    // Create factory entities AT CITY LOCATIONS
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        let pid = p.id;
        let citiesHere = provinceCities[pid] || [];
        for (let city of citiesHere) {
            let cf = CITY_FACTORIES[city.id];
            if (cf > 0) {
                for (let i = 0; i < cf; i++) {
                    // Place factory at city location with small random offset
                    let fact = {
                        id: 'fact_' + G.divIdCounter++,
                        provinceId: pid,
                        country: p.c,
                        rx: city.lon + (Math.random() - 0.5) * 0.03,
                        ry: city.lat + (Math.random() - 0.5) * 0.03,
                        hp: 30,
                        maxHp: 30,
                    };
                    if (!G.factories) G.factories = [];
                    G.factories.push(fact);
                }
            }
        }
    }
}

function isLandPoint(x, y) {
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        let bb = PROVINCE_BBOX[p.id];
        if (!bb) continue;
        if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
        for (let ring of p.r) {
            if (ring.length >= 3 && isPointInPolygon(x, y, ring)) return true;
        }
    }
    return false;
}

function createFactoryEntity(provinceId, country) {
    let pd = G.provinceData[provinceId];
    if (!pd || !pd.center) return null;
    let rx = pd.center[0] + (Math.random() - 0.5) * 0.08;
    let ry = pd.center[1] + (Math.random() - 0.5) * 0.08;
    let fact = {
        id: 'fact_' + G.divIdCounter++,
        provinceId: provinceId,
        country: country,
        rx: rx, ry: ry,
        hp: 30,
        maxHp: 30,
    };
    if (!G.factories) G.factories = [];
    G.factories.push(fact);
    return fact;
}

function initCountries() {
    const init = {
        GERMANY: { treasury: 550, stability: 85, flag: 0 },
        FRANCE: { treasury: 450, stability: 80, flag: 1 },
        UK: { treasury: 650, stability: 90, flag: 2 },
        BELGIUM: { treasury: 80, stability: 80, flag: 3 },
        NETHERLANDS: { treasury: 100, stability: 85, flag: 4 },
        LUXEMBOURG: { treasury: 15, stability: 90, flag: 5 },
        SWITZERLAND: { treasury: 70, stability: 95, flag: 6 },
        DENMARK: { treasury: 60, stability: 90, flag: 7 },
        ITALY: { treasury: 280, stability: 75, flag: 8 },
        AUSTRIA_HUNGARY: { treasury: 350, stability: 70, flag: 9 },
        SPAIN: { treasury: 220, stability: 80, flag: 10 },
        PORTUGAL: { treasury: 70, stability: 85, flag: 11 },
        RUSSIA: { treasury: 400, stability: 60, flag: 12 },
        TURKEY: { treasury: 250, stability: 55, flag: 13 },
        SERBIA: { treasury: 50, stability: 70, flag: 14 },
        MONTENEGRO: { treasury: 20, stability: 75, flag: 15 },
        BULGARIA: { treasury: 60, stability: 65, flag: 16 },
        ROMANIA: { treasury: 100, stability: 60, flag: 17 },
        GREECE: { treasury: 70, stability: 70, flag: 18 },
        ALBANIA: { treasury: 15, stability: 50, flag: 19 },
        NORWAY: { treasury: 50, stability: 90, flag: 20 },
        SWEDEN: { treasury: 100, stability: 85, flag: 21 },
        FINLAND: { treasury: 40, stability: 80, flag: 22 },
    };
    for (let [c, d] of Object.entries(init)) {
        let pop = (POPULATION[c] || 1) * 1000; // convert to thousands
        G.countries[c] = { ...d, name: c, income: 0, expenses: 0, divCount: 0, manpower: pop, maxManpower: pop };
    }
}

function createDivision(provinceId, country, type) {
    let pd = G.provinceData[provinceId];
    if (!pd) return null;
    type = type || 'infantry';
    let ut = UNIT_TYPES[type];
    if (!ut) return null;
    let cost = ut.cost;
    let cData = G.countries[country];
    if (!cData || cData.treasury < cost) return null;
    // Check manpower
    let manpowerCost = ut.manpower || 10;
    if (cData.manpower < manpowerCost) { addGameLog("人口不足！"); return null; }
    cData.treasury -= cost;
    cData.manpower -= manpowerCost;
    let c = pd.center;
    // Random offset around province center (avoid stacking)
    let offX = (Math.random() - 0.5) * 0.06;
    let offY = (Math.random() - 0.5) * 0.06;

    let div = {
        id: G.divIdCounter++,
        name: country + ' ' + G.divIdCounter + '.',
        type: type,
        province: provinceId,
        country: country,
        strength: 100,
        maxStrength: 100,
        rx: c[0] + offX, ry: c[1] + offY,
        state: 'idle',
        targetX: null, targetY: null,
        attackTarget: null,
        focusTarget: null,
        focusFactory: null,
        fireCooldown: 0,
        exp: 0,
    };
    G.divisions.push(div);
    pd.garrison = (pd.garrison || 0) + 1;
    cData.divCount = (cData.divCount || 0) + 1;
    return div;
}

function getCountryProvinces(country) {
    return Object.values(G.provinceData).filter(p => p.country === country);
}

// 附属国体系
function getSuzerain(country) { return VASSAL_OF[country] || null; }
function getVassals(country) { return Object.entries(VASSAL_OF).filter(([v, s]) => s === country).map(([v]) => v); }
function isVassalOf(vassal, suzerain) { return VASSAL_OF[vassal] === suzerain; }

// 阵营判断：同一阵营视为盟友
function isSameFaction(a, b) {
    if (!a || !b || a === b) return false;
    // 同盟国阵营核心
    let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY'];
    // 协约国阵营核心
    let ententeCore = ['FRANCE', 'UK'];
    // 通过联盟链判断
    function belongsTo(c, core) {
        if (core.includes(c)) return true;
        if (G.alliances && G.alliances[c]) {
            for (let ally of Object.keys(G.alliances[c])) {
                if (core.includes(ally)) return true;
            }
        }
        return false;
    }
    let aCentral = belongsTo(a, centralCore);
    let bCentral = belongsTo(b, centralCore);
    let aEntente = belongsTo(a, ententeCore);
    let bEntente = belongsTo(b, ententeCore);
    return (aCentral && bCentral) || (aEntente && bEntente);
}

function calcCountryIncome(country) {
    let provs = getCountryProvinces(country);
    let total = 0;
    for (let p of provs) {
        // Income = base income + factories × 2.0 per factory
        // Each factory produces 2.0 income/day — enough to sustain ~1.3 infantry divisions
        let base = p.income || 0.3;
        let factIncome = (p.factories || 0) * 2.0;
        total += base + factIncome;
    }
    return Math.round(total * 10) / 10;
}

function initCities() {
    for (let city of CITIES) {
        // Find province containing this city
        let provId = null;
        for (let p of PROVINCES) {
            if (p.x >= 900) continue;
            for (let ring of p.r) {
                if (ring.length >= 3 && isPointInPolygon(city.lon, city.lat, ring)) {
                    provId = p.id;
                    break;
                }
            }
            if (provId) break;
        }
        G.cities[city.id] = {
            ...city,
            hp: 50,
            maxHp: 50,
            provinceId: provId,
            garrison: 0,
            owner: city.country,
        };
    }
}

// Check if point in polygon (duplicate for module independence)
function isPointInPolygon(px, py, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function removeDivision(d) {
    // 创建墓碑
    if (d.rx !== undefined && d.ry !== undefined) {
        if (!G.gravestones) G.gravestones = [];
        G.gravestones.push({
            x: d.rx, y: d.ry,
            deathTime: G.date.getTime(),
            country: d.country,
            type: d.type,
        });
    }
    let pd = G.provinceData[d.province];
    if (pd) pd.garrison = Math.max(0, (pd.garrison || 0) - 1);
    let cData = G.countries[d.country];
    if (cData) cData.divCount = Math.max(0, (cData.divCount || 0) - 1);
    let idx = G.divisions.indexOf(d);
    if (idx>=0) G.divisions.splice(idx,1);
    if (G.selectedDivisions.includes(d.id)) G.selectedDivisions = G.selectedDivisions.filter(x=>x!==d.id);
}

// === 保障独立系统 ===
function guaranteeIndependence(guarantor, target) {
    if (!G.guarantees) G.guarantees = {};
    if (!G.guarantees[guarantor]) G.guarantees[guarantor] = [];
    if (!G.guarantees[guarantor].includes(target)) {
        G.guarantees[guarantor].push(target);
    }
}
function removeGuarantee(guarantor, target) {
    if (!G.guarantees || !G.guarantees[guarantor]) return;
    G.guarantees[guarantor] = G.guarantees[guarantor].filter(c => c !== target);
}
function getGuarantees(guarantor) {
    if (!G.guarantees || !G.guarantees[guarantor]) return [];
    return G.guarantees[guarantor];
}
function getGuarantors(target) {
    if (!G.guarantees) return [];
    let list = [];
    for (let g of Object.keys(G.guarantees)) {
        if (G.guarantees[g].includes(target)) list.push(g);
    }
    return list;
}
function isGuaranteedBy(target, guarantor) {
    return getGuarantors(target).includes(guarantor);
}

// === Bilateral war system ===
// G.newsQueue = ["msg1", "msg2", ...] — sequential news display
function declareWar(attacker, defender) {
    if (!G.atWar) G.atWar = {};
    if (!G.atWar[attacker]) G.atWar[attacker] = {};
    if (!G.atWar[defender]) G.atWar[defender] = {};

    // 同盟国之间不能宣战
    if (isAllied(attacker, defender)) {
        addGameLog("同盟国之间不能互相宣战！");
        return false;
    }

    // 同阵营不能宣战
    if (isSameFaction(attacker, defender)) {
        addGameLog("同一阵营不能互相宣战！");
        return false;
    }

    G.atWar[attacker][defender] = true;
    G.atWar[defender][attacker] = true;

    // Check NAP — breaking it causes extra stability hit
    let napKey = [attacker, defender].sort().join('_');
    if (G.nonAggression && G.nonAggression[napKey]) {
        delete G.nonAggression[napKey];
        if (G.countries[attacker]) G.countries[attacker].stability = Math.max(0, (G.countries[attacker].stability || 50) - 10);
        addGameLog("违反互不侵犯条约！稳定度-10");
    }

    // 加入消息队列
    queueNews("⚔️ " + (COUNTRY_CN[attacker]||attacker) + "向" + (COUNTRY_CN[defender]||defender) + "宣战！");
    addGameLog((COUNTRY_CN[attacker]||attacker) + "向" + (COUNTRY_CN[defender]||defender) + "宣战");

    if (!G.warAnnouncements) G.warAnnouncements = {};
    let key = [attacker, defender].sort().join('-');
    G.warAnnouncements[key] = true;

    // 保障独立：如果defender被保障，保障国自动向attacker宣战
    let guarantors = getGuarantors(defender);
    for (let g of guarantors) {
        if (g === attacker) continue;
        if (G.atWar[attacker] && G.atWar[attacker][g]) continue;
        if (!G.atWar[attacker]) G.atWar[attacker] = {};
        if (!G.atWar[g]) G.atWar[g] = {};
        G.atWar[attacker][g] = true;
        G.atWar[g][attacker] = true;
        queueNews("⚔️ " + (COUNTRY_CN[g]||g) + "履行保障义务，向" + (COUNTRY_CN[attacker]||attacker) + "宣战！");
        G.warAnnouncements[[attacker, g].sort().join('-')] = true;
        addGameLog((COUNTRY_CN[g]||g) + "因保障义务向" + (COUNTRY_CN[attacker]||attacker) + "宣战");
    }

    // 对同阵营宣战 → 自动宣战阵营内所有国家
    cascadeFactionWar(attacker, defender);
    return true;
}

// 检查两国是否为同盟关系（通过alliances字典）
function isAllied(a, b) {
    if (!a || !b || a === b) return false;
    return G.alliances && G.alliances[a] && G.alliances[a][b];
}

// 连锁阵营宣战：如果D在同一阵营，该阵营所有成员自动向A宣战（反向也触发）
function cascadeFactionWar(attacker, defender) {
    // 找到defender阵营的所有成员
    let defenderFaction = getFactionMembers(defender);
    if (defenderFaction.length === 0) return;
    for (let member of defenderFaction) {
        if (member === defender) continue;
        if (G.atWar[attacker] && G.atWar[attacker][member]) continue; // 已经在交战
        // 阵营成员自动向attacker宣战
        if (!G.atWar[attacker]) G.atWar[attacker] = {};
        if (!G.atWar[member]) G.atWar[member] = {};
        G.atWar[attacker][member] = true;
        G.atWar[member][attacker] = true;
        queueNews("⚔️ " + (COUNTRY_CN[member]||member) + "加入对" + (COUNTRY_CN[attacker]||attacker) + "的战争！");
        if (!G.warAnnouncements) G.warAnnouncements = {};
        G.warAnnouncements[[attacker, member].sort().join('-')] = true;
    }
    // 反向：attacker阵营也自动参战
    let attackerFaction = getFactionMembers(attacker);
    for (let member of attackerFaction) {
        if (member === attacker) continue;
        if (G.atWar[member] && G.atWar[member][defender]) continue;
        if (!G.atWar[member]) G.atWar[member] = {};
        if (!G.atWar[defender]) G.atWar[defender] = {};
        G.atWar[member][defender] = true;
        G.atWar[defender][member] = true;
        queueNews("⚔️ " + (COUNTRY_CN[member]||member) + "加入对" + (COUNTRY_CN[defender]||defender) + "的战争！");
        if (!G.warAnnouncements) G.warAnnouncements = {};
        G.warAnnouncements[[member, defender].sort().join('-')] = true;
    }
}

// 获取国家所属阵营名称
function getFaction(c) {
    if (!c) return null;
    if (c === 'GERMANY' || c === 'AUSTRIA_HUNGARY') return '同盟国';
    if (c === 'FRANCE' || c === 'UK') return '协约国';
    let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY'];
    let ententeCore = ['FRANCE', 'UK'];
    function belongsTo(cc, core) {
        if (core.includes(cc)) return true;
        if (G.alliances && G.alliances[cc]) {
            for (let al of Object.keys(G.alliances[cc])) {
                if (core.includes(al)) return true;
            }
        }
        return false;
    }
    if (belongsTo(c, centralCore)) return '同盟国';
    if (belongsTo(c, ententeCore)) return '协约国';
    return null;
}

// 获取同一阵营的所有成员
function getFactionMembers(country) {
    let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY'];
    let ententeCore = ['FRANCE', 'UK'];
    function belongsTo(c, core) {
        if (core.includes(c)) return true;
        if (G.alliances && G.alliances[c]) {
            for (let ally of Object.keys(G.alliances[c])) {
                if (core.includes(ally)) return true;
            }
        }
        return false;
    }
    let members = [];
    let myCentral = belongsTo(country, centralCore);
    let myEntente = belongsTo(country, ententeCore);
    for (let other of Object.keys(G.countries)) {
        if (other === country) continue;
        let otherCentral = belongsTo(other, centralCore);
        let otherEntente = belongsTo(other, ententeCore);
        if ((myCentral && otherCentral) || (myEntente && otherEntente)) {
            members.push(other);
        }
    }
    return members;
}

// 公屏消息队列（不受时间流速影响）
function queueNews(msg) {
    if (!G.newsQueue) G.newsQueue = [];
    G.newsQueue.push(msg);
}

function getWarScore(a, b) {
    if (!G.warScore) G.warScore = {};
    let key = [a, b].sort().join('_');
    if (!G.warScore[key]) G.warScore[key] = { score: 0 };
    return G.warScore[key].score;
}
function getWarScoreDiff(a, b) {
    // Positive = a is winning against b
    return getWarScore(a, b) - getWarScore(b, a);
}
function updateWarScore() {
    if (!G.atWar) return;
    if (!G.warScore) G.warScore = {};
    for (let a in G.atWar) {
        for (let b in G.atWar[a]) {
            if (!G.atWar[a][b]) continue;
            let key = [a, b].sort().join('_');
            if (!G.warScore[key]) G.warScore[key] = { score: 0 };
            // Points for occupying enemy provinces
            let aProvinces = Object.values(G.provinceData).filter(p => p.originalCountry === b && p.country === a).length;
            let bProvinces = Object.values(G.provinceData).filter(p => p.originalCountry === a && p.country === b).length;
            G.warScore[key].score += (aProvinces - bProvinces) * 0.5;
            // Decay toward 0 daily
            G.warScore[key].score *= 0.995;
        }
    }
}
function makePeace(a, b, reparations) {
    if (!G.atWar) return;
    if (G.atWar[a]) delete G.atWar[a][b];
    if (G.atWar[b]) delete G.atWar[b][a];
    if (reparations && G.countries[a] && G.countries[b]) {
        let payer = getWarScoreDiff(a, b) < 0 ? a : b;
        let receiver = payer === a ? b : a;
        let amount = Math.min(reparations, G.countries[payer].treasury || 0);
        G.countries[payer].treasury -= amount;
        G.countries[receiver].treasury += amount;
        addGameLog((COUNTRY_CN[payer]||payer) + "向" + (COUNTRY_CN[receiver]||receiver) + "支付" + amount + "战争赔款");
    }
    let msg = "☮️ " + (COUNTRY_CN[a]||a) + "与" + (COUNTRY_CN[b]||b) + "议和";
    queueNews(msg);
    addGameLog(msg);
}
function areAtWar(a, b) {
    if (!a || !b || a === b) return false;
    if (!G.atWar) return false;
    if (G.atWar[a] && G.atWar[a][b]) return true;
    if (G.atWar[b] && G.atWar[b][a]) return true;
    return false;
}
function isWarAnnounced(a, b) {
    if (!G.warAnnouncements) return false;
    let key = [a, b].sort().join('-');
    return !!G.warAnnouncements[key];
}
function canEngage(a, b) {
    // Can only attack if war was publicly announced
    if (!areAtWar(a, b)) return false;
    if (!isWarAnnounced(a, b)) return false;
    return true;
}
function isCountryAtWar(country) {
    if (!G.atWar) return false;
    if (G.atWar[country] && Object.keys(G.atWar[country]).length > 0) return true;
    for (let c in G.atWar) {
        if (G.atWar[c] && G.atWar[c][country]) return true;
    }
    return false;
}
function getEnemiesOf(country) {
    let enemies = [];
    if (!G.atWar) return enemies;
    if (G.atWar[country]) {
        for (let e in G.atWar[country]) enemies.push(e);
    }
    for (let c in G.atWar) {
        if (G.atWar[c] && G.atWar[c][country] && !enemies.includes(c)) enemies.push(c);
    }
    return enemies;
}

function getDivisionsInProvince(provinceId) {
    return G.divisions.filter(d => d.province === provinceId && !d.moving);
}

function getMovingDivisionsTo(provinceId) {
    return G.divisions.filter(d => d.moveTarget === provinceId && d.moving);
}

function isPortCity(cityId) {
    let city = G.cities[cityId];
    if (!city) return false;
    return NAVAL_BASES && NAVAL_BASES.some(nb => nb.country === city.country);
}

// ===== Game Log (declared + defined in first script that loads before game_core) =====
var gameLogs = [];
function addGameLog(msg) {
    gameLogs.unshift({text:msg,time:new Date(G.date)});
    if (gameLogs.length>50) gameLogs.pop();
}

// ===== 城市点击检测 =====
const MAJOR_CITY_IDS = new Set([
    // 德国
    'hamburg','munich','cologne','frankfurt','leipzig','dresden','nuremberg','breslau',
    // 法国
    'lyon','marseille','bordeaux','lille','toulouse','nice','nantes','strasbourg','nancy',
    // 英国
    'manchester','birmingham','glasgow','liverpool','bristol','edinburgh','dublin','leeds',
    // 意大利
    'naples','turin','milan','genoa','venice','florence','palermo','trieste',
    // 俄国
    'saint_petersburg','moscow','kiev','odessa','warsaw','minsk','riga','samara',
    'kharkov','ekaterinburg','rostov','nizhny','kazan','sevastopol','smolensk',
    // 奥匈
    'budapest','prague','krakow','zagreb','bratislava','lemberg','kassa','brasso',
    // 西班牙
    'barcelona','seville','bilbao','valencia_sp','zaragoza',
    // 土耳其
    'izmir','ankara','trabzon',
    // 荷兰
    'rotterdam','thehague',
    // 比利时
    'antwerp','liege','charleroi',
    // 瑞典
    'gothenburg','malmo',
    // 挪威
    'bergen',
    // 罗马尼亚
    'brasov','cluj','iasi','constanta',
    // 保加利亚
    'plovdiv','varna',
    // 希腊
    'thessaloniki',
    // 葡萄牙
    'porto',
    // 芬兰
    'turku',
    // 丹麦
    'aarhus',
    // 瑞士
    'zurich','basel',
    // 塞尔维亚
    'nis',
    // 黑山
    'cetinje',
    // 阿尔巴尼亚
    'durres',
    // 卢森堡
    'luxembourg',
]);

function isCapitalCity(cityId) {
    let city = CITIES.find(c => c.id === cityId);
    return city ? !!city.isCapital : false;
}

function isMajorCity(cityId) {
    return MAJOR_CITY_IDS.has(cityId) || isCapitalCity(cityId);
}

function findCityAtScreen(sx, sy) {
    if (typeof worldToScreen === 'undefined') return null;
    let best = null, bestDist = 20;
    for (let city of CITIES) {
        let [cx, cy] = worldToScreen(city.lon, city.lat);
        let dist = Math.hypot(sx - cx, sy - cy);
        if (dist < bestDist) { best = city; bestDist = dist; }
    }
    return best;
}
