// === 海军节点系统（建造、升级、舰船生产） ===

const GREAT_NAVY_POWERS = ['GERMANY','UK','FRANCE','RUSSIA','AUSTRIA_HUNGARY','ITALY'];

const NODE_LEVELS = [
    { level: 1, upgradeCost: 0,   upgradeTime: 0,   probs: { T1:0.12, T2:0.22, T3:0.35, T4:0.20, T5:0.08, T6:0.03, T7:0,    T8:0    } },
    { level: 2, upgradeCost: 800, upgradeTime: 45,  probs: { T1:0,    T2:0.14, T3:0.34, T4:0.26, T5:0.15, T6:0.07, T7:0.04, T8:0    } },
    { level: 3, upgradeCost: 3000,upgradeTime: 120, probs: { T1:0,    T2:0.06, T3:0.24, T4:0.28, T5:0.22, T6:0.10, T7:0.08, T8:0.02 } },
];

function getNodeLevelDef(level) {
    return NODE_LEVELS.find(nl => nl.level === level) || NODE_LEVELS[0];
}

function rollShipGrade(nodeLevel) {
    let def = getNodeLevelDef(nodeLevel);
    if (!def) return 'T3';
    let r = Math.random();
    let cum = 0;
    for (let key of ['T1','T2','T3','T4','T5','T6','T7','T8']) {
        cum += def.probs[key] || 0;
        if (r < cum) return key;
    }
    return 'T3';
}

function findNearestProvince(lon, lat) {
    let best = null, bestDist = 999;
    for (let pid in G.provinceData) {
        let pd = G.provinceData[pid];
        if (!pd || !pd.center) continue;
        let dist = Math.hypot(lon - pd.center[0], lat - pd.center[1]);
        if (dist < bestDist) { bestDist = dist; best = pid; }
    }
    return best;
}

function initNavyNodes() {
    if (typeof NAVAL_BASES === 'undefined') return;
    if (!G.navyNodes) G.navyNodes = {};
    if (!G.ships) G.ships = [];
    if (!G.shipNameCounters) G.shipNameCounters = {};

    for (let nb of NAVAL_BASES) {
        if (!GREAT_NAVY_POWERS.includes(nb.country)) continue;
        let provinceId = findNearestProvince(nb.lon, nb.lat);
        G.navyNodes[nb.id] = {
            id: nb.id,
            country: nb.country,
            lon: nb.lon,
            lat: nb.lat,
            name: nb.name,
            region: nb.region,
            level: 1,
            upgradeProgress: 0,
            upgradeTimer: 0,
            provinceId: provinceId,
        };
    }
}

function createShip(nodeId, country, forcedGrade) {
    let node = G.navyNodes[nodeId];
    if (!node) return null;
    let co = country || node.country;
    let cData = G.countries[co];
    if (!cData) return null;

    let gradeKey = forcedGrade || rollShipGrade(node.level);
    let grade = SHIP_GRADES[gradeKey];
    let shipName = generateShipName(co, grade.name);

    // 传奇级特殊属性
    let isLegendary = gradeKey === 'T8';
    let isHero = gradeKey === 'T7';
    let spd = grade.speed, rng = grade.range, fr = grade.fireRate;
    let pwr = grade.power, hp = grade.hp, man = grade.maneuver;
    if (isLegendary && T8_LEGENDARY_SHIPS[shipName]) {
        let ls = T8_LEGENDARY_SHIPS[shipName];
        spd = ls.speed; rng = ls.range; fr = ls.fireRate;
        pwr = ls.power; hp = ls.hp; man = ls.maneuver;
    }

    let ship = {
        id: 'ship_' + (G.shipIdCounter || 0),
        name: shipName,
        country: co,
        grade: gradeKey,
        speed: spd, range: rng, fireRate: fr,
        power: pwr, hp: hp, maneuver: man,
        color: grade.color,
        nodeId: nodeId,
        isLegendary: isLegendary,
        isHero: isHero,
    };
    if (!G.shipIdCounter) G.shipIdCounter = 1;
    G.shipIdCounter++;
    G.ships.push(ship);
    return ship;
}

// 获取国家拥有节点数
function getCountryNodeCount(country) {
    let count = 0;
    for (let id in G.navyNodes) {
        if (G.navyNodes[id].country === country) count++;
    }
    return count;
}

// 获取国家舰船数
function getCountryShipCount(country) {
    return G.ships.filter(s => s.country === country).length;
}

// 根据师团获取舰船显示信息（颜色、等级名）
function getDivisionShipInfo(d) {
    if (d && d.shipId && G.ships) {
        let ship = G.ships.find(s => s.id === d.shipId);
        if (ship && SHIP_GRADES[ship.grade]) {
            return { color: ship.color, gradeName: SHIP_GRADES[ship.grade].name };
        }
    }
    return null;
}
