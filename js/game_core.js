// Iron & Dominion 1914 - Core Game Logic

let triggeredEvents = new Set();
let eventHistory = [];
let saveSlots = [];
let showSavePanel = false;
// ===== Initialize =====
try {
initProvinceData();
initCountries();

// Merge Alsace-Lorraine
let alsaceIds = ["FRA.Bas-Rhin","FRA.Haut-Rhin","FRA.Moselle"];
for (let pid of alsaceIds) {
    if (G.provinceData[pid]) {
        G.provinceData[pid].country = "GERMANY";
        G.provinceOwners[pid] = "GERMANY";
        G.provinceData[pid].originalCountry = "GERMANY";
        G.provinceData[pid].income = 0.3 + (G.provinceData[pid].factories || 0) * 2.0;
        for (let fact of G.factories) {
            if (fact.provinceId === pid) {
                fact.country = "GERMANY";
            }
        }
    }
}
if (typeof PROVINCES !== 'undefined') {
    for (let p of PROVINCES) { if (alsaceIds.includes(p.id)) p.c = "GERMANY"; }
}
if (typeof COUNTRY_PROVINCES !== 'undefined') {
    for (let pid of alsaceIds) {
        let fi = (COUNTRY_PROVINCES["FRANCE"]||[]).indexOf(pid);
        if (fi>=0) COUNTRY_PROVINCES["FRANCE"].splice(fi,1);
        if (!COUNTRY_PROVINCES["GERMANY"]) COUNTRY_PROVINCES["GERMANY"]=[];
        if (!COUNTRY_PROVINCES["GERMANY"].includes(pid)) COUNTRY_PROVINCES["GERMANY"].push(pid);
    }
}

for (let c of ['GERMANY','FRANCE','UK','ITALY','AUSTRIA_HUNGARY']) {
    let provs = Object.values(G.provinceData).filter(p => p.country === c);
    let count = c === 'GERMANY' ? 6 : c === 'FRANCE' ? 5 : c === 'UK' ? 4 : c === 'AUSTRIA_HUNGARY' ? 4 : 3;
    for (let i = 0; i < count && i < provs.length; i++) {
        createDivision(provs[i].id, c, ['infantry','infantry','infantry','artillery','engineer'][i%5]);
    }
}

if (typeof initCities === 'function') initCities();

// 所有大城市初始刷1个士兵（60%步兵随机）
for (let country of Object.keys(G.countries)) {
    let majorCityIds = CITIES.filter(c => {
        if (c.country !== country) return false;
        return c.isCapital || isMajorCity(c.id);
    });
    for (let city of majorCityIds) {
        let rand = Math.random();
        let type = rand < 0.6 ? 'infantry' : rand < 0.75 ? 'engineer' : rand < 0.9 ? 'cavalry' : 'artillery';
        let pd = G.provinceData[G.cities[city.id]?.provinceId];
        if (!pd || !pd.center) continue;
        let d = createDivision(G.cities[city.id].provinceId, country, type, true);
        if (d) {
            d.rx = city.lon + (Math.random() - 0.5) * 0.03;
            d.ry = city.lat + (Math.random() - 0.5) * 0.03;
        }
    }
}

updateEconomy(1); // 进游戏时立即更新一次经济

// Historical navies at sea near ports
function initHistoricalNavy() {
    if (typeof NAVAL_BASES === 'undefined') return;
    for (let nb of NAVAL_BASES) {
        let country = nb.country;
        if (!G.countries[country]) continue;
        // 六大列强使用新海军节点系统
        if (typeof GREAT_NAVY_POWERS !== 'undefined' && GREAT_NAVY_POWERS.includes(country)) continue;
        let seaPos = findSeaPosition(nb.lon, nb.lat);
        if (!seaPos) continue;
        let bestProv = null, bestDist = 999;
        for (let pid in G.provinceData) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center) continue;
            let dist = Math.hypot(seaPos[0] - pd.center[0], seaPos[1] - pd.center[1]);
            if (dist < bestDist) { bestDist = dist; bestProv = pid; }
        }
        if (!bestProv) continue;
        let pd = G.provinceData[bestProv];
        let cData = G.countries[country];
        if (!cData) continue;
        G.divisions.push({
            id: G.divIdCounter++, name: '(' + (COUNTRY_CN[country] || country) + ') ' + G.divIdCounter + '.',
            type: 'navy', province: bestProv, country: country,
            strength: 100, maxStrength: 100,
            rx: seaPos[0], ry: seaPos[1],
            state: 'idle', targetX: null, targetY: null,
            attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
            fireCooldown: 0, maxFireCd: 0, exp: 0,
        });
        pd.garrison = (pd.garrison || 0) + 1;
        cData.divCount = (cData.divCount || 0) + 1;
    }
}

function findSeaPosition(lon, lat) {
    // Return a position near the port center
    return [lon + (Math.random() - 0.5) * 0.08, lat + (Math.random() - 0.5) * 0.08];
}

function applyNavyShipStats(div, ship) {
    let b = UNIT_TYPES.navy;
    if (ship) {
        div.navySpd = b.speed * (1 + (ship.speed || 0));
        div.navyRng = b.range * (1 + (ship.range || 0));
        div.navyFr = b.fireRate / (1 + (ship.fireRate || 0));
        div.navyDmg = b.damage * (1 + (ship.power || 0));
        div.navyMvr = ship.maneuver || 0;
        let maxHp = b.maxStr * (1 + (ship.hp || 0));
        div.maxStrength = maxHp;
        div.strength = maxHp;
    }
}

if (typeof PROVINCES !== 'undefined' && typeof CITIES !== 'undefined') initHistoricalNavy();

// === 多边形邻接寻路系统（替代旧网格寻路） ===
let PROVINCE_ADJ = null; // { provinceId: [adjacentProvinceId, ...] }

function buildProvinceGraph() {
    let adj = {};
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        adj[p.id] = [];
    }
    let ids = Object.keys(adj);
    for (let i = 0; i < ids.length; i++) {
        let pi = PROVINCES.find(p => p.id === ids[i]);
        if (!pi) continue;
        let bb1 = getPolygonBBox(pi.r);
        for (let j = i + 1; j < ids.length; j++) {
            let pj = PROVINCES.find(p => p.id === ids[j]);
            if (!pj) continue;
            let bb2 = getPolygonBBox(pj.r);
            if (!bboxOverlap(bb1, bb2)) continue;
            if (polygonsTouch(pi.r, pj.r)) {
                adj[ids[i]].push(ids[j]);
                adj[ids[j]].push(ids[i]);
            }
        }
    }
    return adj;
}
function getPolygonBBox(rings) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let ring of rings) {
        for (let pt of ring) {
            if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        }
    }
    return { minX, maxX, minY, maxY };
}
function bboxOverlap(a, b) {
    return a.minX < b.maxX + 0.02 && a.maxX > b.minX - 0.02 && a.minY < b.maxY + 0.02 && a.maxY > b.minY - 0.02;
}
function polygonsTouch(ringsA, ringsB) {
    let THRESH = 0.008;
    for (let ra of ringsA) {
        for (let i = 0; i < ra.length; i++) {
            let x1 = ra[i][0], y1 = ra[i][1];
            let x2 = ra[(i + 1) % ra.length][0], y2 = ra[(i + 1) % ra.length][1];
            for (let rb of ringsB) {
                for (let j = 0; j < rb.length; j++) {
                    let x3 = rb[j][0], y3 = rb[j][1];
                    let x4 = rb[(j + 1) % rb.length][0], y4 = rb[(j + 1) % rb.length][1];
                    if (segDist(x1, y1, x2, y2, x3, y3) < THRESH || segDist(x1, y1, x2, y2, x4, y4) < THRESH) return true;
                }
            }
        }
    }
    return false;
}
function segDist(x1, y1, x2, y2, x, y) {
    let dx = x2 - x1, dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(x - x1, y - y1);
    let t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function isProvinceAccessible(provinceId, country) {
    let owner = G.provinceOwners[provinceId];
    if (owner === country) return true;
    if (canEnterProvince(provinceId, country)) return true;
    if (G.alliances && G.alliances[country] && G.alliances[country][owner]) return true;
    if (isSameFaction(country, owner)) return true;
    if (isVassalOf(owner, country) || isVassalOf(country, owner)) return true;
    if (G.militaryAccess && G.militaryAccess[owner] && G.militaryAccess[owner][country]) return true;
    return false;
}
function findProvincePath(fromProvince, toProvince, country) {
    if (!PROVINCE_ADJ) return null;
    if (fromProvince === toProvince) return [];
    let open = [{ id: fromProvince, f: 0 }];
    let g = {}; g[fromProvince] = 0;
    let parent = {}; parent[fromProvince] = null;
    let visited = new Set();
    let coord = {};
    for (let p of PROVINCES) { if (p.x < 900) coord[p.id] = [p.x, p.y]; }
    let endCenter = coord[toProvince];
    if (!endCenter) return null;
    while (open.length) {
        let bestIdx = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
        let cur = open.splice(bestIdx, 1)[0];
        if (cur.id === toProvince) break;
        if (visited.has(cur.id)) continue;
        visited.add(cur.id);
        for (let nb of (PROVINCE_ADJ[cur.id] || [])) {
            if (visited.has(nb)) continue;
            if (!isProvinceAccessible(nb, country)) continue;
            let c1 = coord[cur.id] || endCenter;
            let c2 = coord[nb] || endCenter;
            let ng = g[cur.id] + Math.hypot(c1[0] - c2[0], c1[1] - c2[1]);
            if (ng < (g[nb] || Infinity)) {
                g[nb] = ng;
                let h = endCenter ? Math.hypot(c2[0] - endCenter[0], c2[1] - endCenter[1]) : 0;
                parent[nb] = cur.id;
                open.push({ id: nb, f: ng + h });
            }
        }
    }
    if (parent[toProvince] === undefined) return null;
    let path = [];
    let cur = toProvince;
    while (cur !== null) { path.push(cur); cur = parent[cur]; }
    path.reverse();
    return path;
}

// Old grid constants kept for coastal water cache
const NAV_RES = 0.4, NAV_MIN_LON = -16, NAV_MAX_LON = 22, NAV_MIN_LAT = 28, NAV_MAX_LAT = 60;
let NAV_GRID = null, NAV_COLS = 0, NAV_ROWS = 0;

function initNavGrid() {
    NAV_COLS = Math.ceil((NAV_MAX_LON - NAV_MIN_LON) / NAV_RES);
    NAV_ROWS = Math.ceil((NAV_MAX_LAT - NAV_MIN_LAT) / NAV_RES);
    NAV_GRID = new Uint8Array(NAV_COLS * NAV_ROWS);
    for (let row = 0; row < NAV_ROWS; row++) {
        for (let col = 0; col < NAV_COLS; col++) {
            let lon = NAV_MIN_LON + (col + 0.5) * NAV_RES;
            let lat = NAV_MIN_LAT + (row + 0.5) * NAV_RES;
            if (isLandPoint(lon, lat)) NAV_GRID[row * NAV_COLS + col] = 1;
        }
    }
}
initNavGrid();

let _coastalWaterCache = null;

function invalidateCoastalWater() { _coastalWaterCache = null; }

function getCoastalWater() {
    if (_coastalWaterCache) return _coastalWaterCache;
    _coastalWaterCache = new Set();
    if (!NAV_GRID || !G.playerCountry) return _coastalWaterCache;
    let ports = (typeof NAVAL_BASES !== 'undefined' ? NAVAL_BASES : []).filter(nb => {
        return nb.country === G.playerCountry;
    });
    let r = 0.8;
    for (let p of ports) {
        let mc = Math.max(0, Math.floor((p.lon - r - NAV_MIN_LON) / NAV_RES));
        let MC = Math.min(NAV_COLS - 1, Math.floor((p.lon + r - NAV_MIN_LON) / NAV_RES));
        let mr = Math.max(0, Math.floor((p.lat - r - NAV_MIN_LAT) / NAV_RES));
        let MR = Math.min(NAV_ROWS - 1, Math.floor((p.lat + r - NAV_MIN_LAT) / NAV_RES));
        for (let row = mr; row <= MR; row++) {
            for (let col = mc; col <= MC; col++) {
                if (NAV_GRID[row * NAV_COLS + col]) continue;
                let lon = NAV_MIN_LON + (col + 0.5) * NAV_RES;
                let lat = NAV_MIN_LAT + (row + 0.5) * NAV_RES;
                if (Math.hypot(lon - p.lon, lat - p.lat) < r) _coastalWaterCache.add(row + ',' + col);
            }
        }
    }
    return _coastalWaterCache;
}

function drawCoastalWaters() {
    if (!G.playerCountry) return;
    let cw = getCoastalWater();
    if (!cw || !cw.size) return;
    let color = typeof COUNTRY_COLORS !== 'undefined' ? COUNTRY_COLORS[G.playerCountry] : null;
    if (!color) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    for (let key of cw) {
        let parts = key.split(',');
        let row = parseInt(parts[0]), col = parseInt(parts[1]);
        let x = NAV_MIN_LON + col * NAV_RES;
        let y = NAV_MIN_LAT + row * NAV_RES;
        let p1 = worldToScreen(x, y);
        let p2 = worldToScreen(x + NAV_RES, y + NAV_RES);
        let w = Math.abs(p2[0] - p1[0]);
        let h = Math.abs(p2[1] - p1[1]);
        if (w < 2 || h < 2) continue;
        ctx.fillRect(p1[0], p1[1], w, h);
    }
    ctx.restore();
}

// No initial wars — player/AI starts at peace. Diplomacy decides.
if (!G.atWar) G.atWar = {};

if (!G.alliances) G.alliances = {};
if (!G.alliances['GERMANY']) G.alliances['GERMANY'] = {};
if (!G.alliances['AUSTRIA_HUNGARY']) G.alliances['AUSTRIA_HUNGARY'] = {};
G.alliances['GERMANY']['AUSTRIA_HUNGARY'] = true;
G.alliances['AUSTRIA_HUNGARY']['GERMANY'] = true;
} catch(e) { console.error("Init:", e); }

// Build province adjacency graph for polygon-based pathfinding
if (typeof PROVINCES !== 'undefined') {
    PROVINCE_ADJ = buildProvinceGraph();
    console.log("Province graph built:", Object.keys(PROVINCE_ADJ).length, "nodes");
}

// Initialize navy node system and create initial ships for great powers
if (typeof initNavyNodes === 'function' && typeof NAVAL_BASES !== 'undefined') {
    initNavyNodes();
    let initShipCounts = { UK: 6, GERMANY: 5, FRANCE: 4, RUSSIA: 3, AUSTRIA_HUNGARY: 3, ITALY: 3 };
    let created = {};
    let nodeList = Object.keys(G.navyNodes);
    // Distribute ships round-robin across nodes up to country cap
    for (let pass = 0; pass < 8; pass++) {
        for (let id of nodeList) {
            let node = G.navyNodes[id];
            if (!created[node.country]) created[node.country] = 0;
            if (created[node.country] >= (initShipCounts[node.country] || 3)) continue;
            let ship = createShip(id, node.country, 'T3');
            if (ship) {
                let seaPos = findSeaPosition(node.lon, node.lat);
                let bestProv = findNearestProvince(node.lon, node.lat);
                if (bestProv) {
                    let _div = {
                        id: G.divIdCounter++, name: '(' + (COUNTRY_CN[node.country] || node.country) + ')' + ship.name,
                        type: 'navy', province: bestProv, country: node.country,
                        rx: seaPos[0], ry: seaPos[1],
                        state: 'idle', targetX: null, targetY: null,
                        attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
                        fireCooldown: 0, maxFireCd: 0, exp: 0,
                        shipId: ship.id,
                    };
                    applyNavyShipStats(_div, ship);
                    G.divisions.push(_div);
                    let pd = G.provinceData[bestProv];
                    if (pd) pd.garrison = (pd.garrison || 0) + 1;
                    let cData = G.countries[node.country];
                    if (cData) cData.divCount = (cData.divCount || 0) + 1;
                    created[node.country]++;
                }
            }
        }
    }
    console.log("Navy nodes initialized:", nodeList.length, "nodes,", G.ships.length, "ships");
}

function saveGame(slotName) {
    saveSlots.push({name:slotName,date:new Date(G.date.getTime()),state:JSON.parse(JSON.stringify(G))});
    if (saveSlots.length > 20) saveSlots.shift();
}

function loadGame(idx) {
    if (idx<0||idx>=saveSlots.length) return;
    let s=saveSlots[idx];
    Object.assign(G,JSON.parse(JSON.stringify(s.state)));
    G.date=new Date(s.date.getTime());
    G.paused=true;
    addGameLog("Load: "+s.name);
}

// ===== Game Update =====
function updateGame(dtMs) {
    processBuildQueue(dtMs);
    if (G.paused) return;
    let speed=[2,4,8,16,32,64,128][G.speed]||1;
    let dayMs=12000/speed;
    let days=dtMs/dayMs;
    if (days<0.001) days=0.001;
    G.tick++;
    G.date.setTime(G.date.getTime()+days*86400000);
    if (G.tick%Math.max(1,Math.floor(3/days))===0) updateEconomy(days);
    updateDivisions(days);
    updateFireZones(days);
    // moveUnits/fireUnits/updateProjectiles 已在 gameLoop 子步循环中调用，此处移除重复调用
    if (typeof updatePathfinding === 'function') updatePathfinding(days);
    if (typeof updatePatrol === 'function') updatePatrol(days);
    updateEngineerDemolish(days);
    updateEngineerRepair(days);
    if (G.tick%Math.max(1,Math.floor(5/days))===0) updateAI();
    if (G.tick%Math.max(1,Math.floor(8/days))===0) updateAIOccupation();
    if (G.tick%Math.max(1,Math.floor(3/days))===0) updateFrontlineAdvance(days);
    checkSurrender();

    // Process navy node upgrade timers
    if (typeof G.navyNodes !== 'undefined') {
        let upgraded = false;
        let speed = [2,4,8,16,32,64,128][G.speed] || 1;
        for (let id in G.navyNodes) {
            let node = G.navyNodes[id];
            if (node.upgradeTimer > 0) {
                node.upgradeProgress = (node.upgradeProgress || 0) + (dtMs / 1000) * speed / (node.upgradeTimer || 1);
                if (node.upgradeProgress >= 1) {
                    node.level++;
                    node.upgradeTimer = 0;
                    node.upgradeProgress = 0;
                    upgraded = true;
                }
            }
        }
        if (upgraded) {
            addGameLog("海军节点升级完成！");
        }
    }
    // UK enters war if Germany invades Belgium
    if (areAtWar('GERMANY', 'BELGIUM') && !canEngage('UK', 'GERMANY')) {
        declareWar('UK', 'GERMANY');
        if (!G.newsBanner || G.newsTimer <= 0) {
            G.newsBanner = "🇬🇧 英国因德国入侵比利时而参战！";
            G.newsTimer = 400;
        }
        addGameLog("英国参战！");
    }
}

function canEnterProvince(provinceId, country) {
    let prov = PROVINCES.find(p => p.id === provinceId);
    if (!prov) return false;
    // 海洋地块（x>=900）对所有国家自由通行，不受外交限制
    if (prov.x >= 900) return true;
    let owner = G.provinceOwners[provinceId];
    if (!owner) return false;
    if (owner === country) return true;
    if (canEngage(country, owner)) return true;
    if (G.alliances && G.alliances[country] && G.alliances[country][owner]) return true;
    if (G.militaryAccess && G.militaryAccess[owner] && G.militaryAccess[owner][country]) return true;
    // 同阵营视为盟友，可自由通行
    if (isSameFaction(country, owner)) return true;
    // 宗主国可在附属国领土行军
    if (isVassalOf(owner, country)) return true;
    // 附属国可在宗主国领土行军
    if (isVassalOf(country, owner)) return true;
    return false;
}

function getProvinceAt(x, y) {
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        let bb = PROVINCE_BBOX[p.id];
        if (!bb) continue;
        if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
        for (let ring of p.r) {
            if (ring.length >= 3 && isPointInPolygon(x, y, ring)) return p.id;
        }
    }
    return null;
}

function moveUnits(days) {
    let separation = 0.008;
    let effectiveDays = Math.min(days, 0.04);
    effectiveDays = Math.max(effectiveDays, 0);
outer: for (let d of G.divisions) {
        if (d.rx===undefined) {
            let c=G.provinceData[d.province];
            if(c&&c.center){d.rx=c.center[0];d.ry=c.center[1];}
        }
        if ((d.state==='moving')&&d.targetX!==null) {
            // 海洋封锁：陆军禁止下海
            if (d.type !== 'navy' && typeof isOceanPoint === 'function') {
                if (isOceanPoint(d.rx, d.ry) || isOceanPoint(d.targetX, d.targetY)) {
                    d.state='idle'; d.targetX=null; d.targetY=null; d.path=null;
                    continue;
                }
            }
            let ut=UNIT_TYPES[d.type]||UNIT_TYPES.infantry;
            let speed=ut.speed*effectiveDays;
            speed *= 2.5;

            // Navy ship-specific speed
            if (d.type === 'navy' && d.navySpd !== undefined) {
                speed = d.navySpd * effectiveDays * 2.5;
            }

            // Navy: must be at sea
            if (d.type === 'navy') {
                let _onLand = false;
                if (typeof gPF !== 'undefined' && gPF && gPF.navyLand) {
                    let cx = Math.floor((d.rx - gPF.minLon) / PF_CELL), cy = Math.floor((d.ry - gPF.minLat) / PF_CELL);
                    _onLand = cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows && gPF.navyLand[cy * gPF.cols + cx] === 0;
                } else if (typeof isLandPoint === 'function') {
                    _onLand = isLandPoint(d.rx, d.ry);
                }
                if (_onLand) { d.state = 'idle'; d.targetX = null; d.targetY = null; addGameLog("海军在陆地上无法移动"); continue; }
                if (d.navySpd === undefined) speed *= 2;
            }

            // Predictive province border check (land units)
            if (d.type !== 'navy') {
                let curPid = getProvinceAt(d.rx, d.ry);
                if (curPid && canEnterProvince(curPid, d.country)) {
                    let dx=d.targetX-d.rx;let dy=d.targetY-d.ry;
                    let dist=Math.hypot(dx,dy);
                    let checkDist = Math.min(0.03, dist);
                    if (dist > 0 && checkDist > 0.001) {
                        let checkX = d.rx + (dx/dist) * checkDist;
                        let checkY = d.ry + (dy/dist) * checkDist;
                        let checkPid = getProvinceAt(checkX, checkY);
                        if (checkPid && checkPid !== curPid && !canEnterProvince(checkPid, d.country)) {
                            // Obstacle detected — try to recalculate path around it
                            let endProv = d._finalTargetProv || getProvinceAt(d._finalTargetX || d.targetX, d._finalTargetY || d.targetY);
                            if (endProv && curPid !== endProv && typeof findProvincePath === 'function') {
                                let newPath = findProvincePath(curPid, endProv, d.country);
                                if (newPath && newPath.length > 0) {
                                    // Convert to waypoints
                                    let path = [];
                                    for (let i = 1; i < newPath.length; i++) {
                                        let pid = newPath[i];
                                        let p = PROVINCES.find(pp => pp.id === pid);
                                        if (p && p.x < 900) path.push({ x: p.x, y: p.y });
                                    }
                                    if (path.length > 0) {
                                        d.path = path; d.pathIndex = 0;
                                        d.targetX = path[0].x; d.targetY = path[0].y;
                                        continue outer;
                                    }
                                }
                            }
                            // No path found — stop
                            d.state='idle'; d.targetX=null; d.targetY=null; d.path=null;
                            continue outer;
                        }
                    }
                }
            }

            // Waypoint path following (land + navy)
            if (d.path && d.pathIndex < d.path.length) {
                let wp = d.path[d.pathIndex];
                let wpDist = Math.hypot(d.rx - wp.x, d.ry - wp.y);
                if (wpDist < 0.15) {
                    d.pathIndex++;
                    if (d.pathIndex >= d.path.length) {
                        d.path = null;
                    } else {
                        d.targetX = d.path[d.pathIndex].x;
                        d.targetY = d.path[d.pathIndex].y;
                    }
                } else {
                    d.targetX = wp.x;
                    d.targetY = wp.y;
                }
            }

            // Actual movement
            let dx=d.targetX-d.rx;let dy=d.targetY-d.ry;
            let dist=Math.hypot(dx,dy);
            if(dist>speed){
                d.rx+=(dx/dist)*speed;d.ry+=(dy/dist)*speed;
            }else{
                d.rx=d.targetX;d.ry=d.targetY;
                d.state='idle';d.targetX=null;d.targetY=null;
                d.path = null;
            }
        }
    }
    for (let d of G.divisions) {
        for (let e of G.divisions) {
            if(d.id>=e.id) continue;
            let dx=d.rx-e.rx;
            if (Math.abs(dx) > separation) continue;
            let dy=d.ry-e.ry;
            if (Math.abs(dy) > separation) continue;
            let dist=Math.hypot(dx,dy);
            if(dist<separation&&dist>0.001){
                let push=(separation-dist)/separation*0.01;
                let nx=dx/dist;let ny=dy/dist;
                d.rx+=nx*push;d.ry+=ny*push;
                e.rx-=nx*push;e.ry-=ny*push;
            }
        }
    }
    // Line formation: arrange navy units perpendicular to movement direction
    // 支持多个独立阵型（按formationGroup分组）
    let formDivs = G.divisions.filter(d => d.formation === 'line' && d.type === 'navy');
    if (formDivs.length > 1) {
        // 按formationGroup分组
        let groups = {};
        for (let d of formDivs) {
            let gid = d.formationGroup || 'default';
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(d);
        }
        for (let gid in groups) {
            let group = groups[gid];
            if (group.length < 2) continue;
            // 计算平均前进方向
            let avgDx = 0, avgDy = 0;
            let count = 0;
            for (let d of group) {
                if (d.targetX !== null) { avgDx += d.targetX - d.rx; avgDy += d.targetY - d.ry; count++; }
            }
            // 如果都不在移动，使用上次移动方向或默认水平方向
            if (count === 0) {
                if (group[0]._lastMoveDx !== undefined) {
                    avgDx = group[0]._lastMoveDx;
                    avgDy = group[0]._lastMoveDy;
                } else {
                    avgDx = 1; avgDy = 0;
                }
            }
            let dirLen = Math.hypot(avgDx, avgDy);
            if (dirLen > 0.001) {
                avgDx /= dirLen; avgDy /= dirLen;
                // 保存方向
                for (let d of group) { d._lastMoveDx = avgDx; d._lastMoveDy = avgDy; }
                // 垂直方向（前进方向逆时针旋转90°）
                let perpX = -avgDy, perpY = avgDx;
                let spacing = 0.12; // 缩短一字阵间距
                let half = (group.length - 1) / 2;

                // 取所有舰船的平均位置作为阵型锚点
                let anchorX = 0, anchorY = 0;
                for (let d of group) { anchorX += d.rx; anchorY += d.ry; }
                anchorX /= group.length; anchorY /= group.length;

                // 沿垂直方向排序
                group.sort((a, b) => {
                    let projA = (a.rx - anchorX) * perpX + (a.ry - anchorY) * perpY;
                    let projB = (b.rx - anchorX) * perpX + (b.ry - anchorY) * perpY;
                    return projA - projB;
                });

                for (let i = 0; i < group.length; i++) {
                    let d = group[i];
                    let offset = (i - half) * spacing;
                    let targetX = anchorX + perpX * offset;
                    let targetY = anchorY + perpY * offset;
                    // 渐进移动至阵型位置
                    let dx = targetX - d.rx;
                    let dy = targetY - d.ry;
                    let dist = Math.hypot(dx, dy);
                    if (dist > 0.001) {
                        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                        let spd = ut.speed * effectiveDays * 2.5;
                        if (d.type === 'navy' && d.navySpd !== undefined) {
                            spd = d.navySpd * effectiveDays * 2.5;
                        }
                        // 阵型调整速度加倍
                        spd *= 2;
                        if (dist > spd) {
                            d.rx += (dx / dist) * spd;
                            d.ry += (dy / dist) * spd;
                        } else {
                            d.rx = targetX;
                            d.ry = targetY;
                        }
                    }
                }
            }
        }
    }
}

function fireUnits(days) {
    // Spatial index: group divisions by 0.5° grid cells for fast neighbor lookup
    let CELL = 0.5;
    let buckets = Object.create(null);
    for (let e of G.divisions) {
        if (e.strength <= 0) continue;
        let key = Math.floor(e.rx / CELL) + ',' + Math.floor(e.ry / CELL);
        (buckets[key] || (buckets[key] = [])).push(e);
    }

    for (let d of G.divisions) {
        let ut=UNIT_TYPES[d.type];
        if(!ut) continue;
        // Use navy-specific stats if available
        let vRange = (d.type === 'navy' && d.navyRng !== undefined) ? d.navyRng : ut.range;
        let vDamage = (d.type === 'navy' && d.navyDmg !== undefined) ? d.navyDmg : ut.damage;
        let vFireCd = (d.type === 'navy' && d.navyFr !== undefined) ? d.navyFr : ut.fireRate;
        d.fireCooldown=Math.max(0,(d.fireCooldown||0)-days);
        if(d.fireCooldown>0) continue;

        // Navy on land cannot attack
        if (d.type === 'navy' && typeof gPF !== 'undefined' && gPF && gPF.navyLand) {
            let cx = Math.floor((d.rx - gPF.minLon) / PF_CELL), cy = Math.floor((d.ry - gPF.minLat) / PF_CELL);
            if (cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows && gPF.navyLand[cy * gPF.cols + cx] === 0) continue;
        } else if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) continue;

        // Step 1: pick a target (any distance — for focus visual / targeting)
        let fireTarget=null;       // the one we actually shoot at (must be in range)
        let lockTarget=null;       // the one we track (visual lock, any range)

        let isPlayer = d.country === G.playerCountry;

        // Focus target: player right-clicked enemy
        if (d.focusTarget) {
            let ft=G.divisions.find(x=>x.id===d.focusTarget);
            if(ft&&ft.strength>0&&ft.country!==d.country){
                lockTarget = ft;
                let dist=Math.hypot(d.rx-ft.rx,d.ry-ft.ry);
                if(dist<vRange) fireTarget = ft;
            } else {
                d.focusTarget=null;
            }
        }

        // Focus city: player right-clicked enemy city
        if (!fireTarget && d.focusCity) {
            let fc = G.cities[d.focusCity];
            if (fc && fc.hp > 0 && fc.owner !== d.country && canEngage(d.country, fc.owner)) {
                let dist = Math.hypot(d.rx - fc.lon, d.ry - fc.lat);
                if (dist < vRange) {
                    // Fire at the city like firing at a soldier
                    d.fireCooldown = vFireCd; d.maxFireCd = vFireCd;
                    let bulletSpeed = 0.15 * (ut.bulletSpeed || 1);
                    let dx = fc.lon - d.rx, dy = fc.lat - d.ry;
                    let td = Math.hypot(dx, dy);
                    let ex = fc.lon, ey = fc.lat;
                    if (td > 0.01) {
                        let nx = dx / td, ny = dy / td;
                        ex = d.rx + nx * vRange;
                        ey = d.ry + ny * vRange;
                    }
                    G.projectiles.push({
                    x: d.rx, y: d.ry, type: d.type,
                    life: vRange / bulletSpeed, lifeMax: vRange / bulletSpeed,
                    startX: d.rx, startY: d.ry,
                    endX: ex, endY: ey,
                    arcUp: d.type === 'artillery', arcHeight: d.type === 'artillery' ? 0.3 : 0,
                    splash: d.type === 'artillery' ? 0.05 : 0.02,
                    baseDamage: vDamage, shooterCountry: d.country,
                    targetCity: fc, targetType: 'city',
                });
                // 限制投射物数量，防止卡顿
                if (G.projectiles.length > 50) G.projectiles.shift();
                    continue; // skip to next unit after firing
                }
            } else {
                d.focusCity = null;
            }
        }

        // Focus factory: player right-clicked enemy factory
        if (!fireTarget && d.focusFactory) {
            let ff = G.factories.find(f => f.id === d.focusFactory);
            if (ff && ff.hp > 0 && ff.country !== d.country && canEngage(d.country, ff.country)) {
                let dist = Math.hypot(d.rx - ff.rx, d.ry - ff.ry);
                if (dist < vRange) {
                    d.fireCooldown = vFireCd; d.maxFireCd = vFireCd;
                    let bulletSpeed = 0.15 * (ut.bulletSpeed || 1);
                    let dx = ff.rx - d.rx, dy = ff.ry - d.ry;
                    let td = Math.hypot(dx, dy);
                    let ex = ff.rx, ey = ff.ry;
                    if (td > 0.01) {
                        let nx = dx / td, ny = dy / td;
                        ex = d.rx + nx * vRange;
                        ey = d.ry + ny * vRange;
                    }
                    G.projectiles.push({
                        x: d.rx, y: d.ry, type: d.type,
                        life: vRange / bulletSpeed, lifeMax: vRange / bulletSpeed,
                        startX: d.rx, startY: d.ry,
                        endX: ex, endY: ey,
                        arcUp: d.type === 'artillery', arcHeight: d.type === 'artillery' ? 0.3 : 0,
                        splash: d.type === 'artillery' ? 0.05 : 0.02,
                        baseDamage: vDamage, shooterCountry: d.country,
                        targetFactory: ff, targetType: 'factory',
                    });
                    if (G.projectiles.length > 50) G.projectiles.shift();
                    continue;
                }
            } else {
                d.focusFactory = null;
            }
        }

        // Auto-shoot: scan nearby cells for any enemy in range (both AI and player)
        if (!fireTarget) {
            let bestE=null,bestD=999;
            let maxRange = vRange * 1.5;
            let bx = Math.floor(d.rx / CELL), by = Math.floor(d.ry / CELL);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    let bucket = buckets[(bx+dx) + ',' + (by+dy)];
                    if (!bucket) continue;
                    for (let e of bucket) {
                        if (e.country === d.country) continue;
                        let ddx = Math.abs(d.rx - e.rx);
                        let ddy = Math.abs(d.ry - e.ry);
                        if (ddx > maxRange || ddy > maxRange) continue;
                        if (!canEngage(d.country, e.country)) continue;
                        let dist = Math.hypot(ddx, ddy);
                        if (dist < vRange && dist < bestD) { bestE = e; bestD = dist; }
                    }
                }
            }
            if(bestE) fireTarget = bestE;
        }

        // Auto-lock scan (AI only — track far enemies visually)
        if (!isPlayer && !lockTarget) {
            let bestL=null,bestDL=999;
            let bx = Math.floor(d.rx / CELL), by = Math.floor(d.ry / CELL);
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    let bucket = buckets[(bx+dx) + ',' + (by+dy)];
                    if (!bucket) continue;
                    for (let e of bucket) {
                        if (e.country === d.country) continue;
                        let ddx = Math.abs(d.rx - e.rx);
                        let ddy = Math.abs(d.ry - e.ry);
                        if (ddx > 2 || ddy > 2) continue;
                        if (!canEngage(d.country, e.country)) continue;
                        let dist = Math.hypot(ddx, ddy);
                        if (dist < bestDL) { bestL = e; bestDL = dist; }
                    }
                }
            }
            if(bestL) lockTarget = bestL;
        }

        // Nothing at all to engage — clear focus
        if(!lockTarget && !fireTarget && !d.focusCity && !d.focusFactory){d.focusTarget=null;continue;}
        // If we have a lock but no fire target: move toward target to get in range
        // (Only for AI units, or player units with an explicit right-click focus target)
        if(!fireTarget) {
            let shouldMove = d.country !== G.playerCountry;
            if (!shouldMove && d.focusTarget) {
                let ft = G.divisions.find(x=>x.id===d.focusTarget);
                if(ft) shouldMove = true;
            }
            if (!shouldMove && d.focusCity) {
                let fc = G.cities[d.focusCity];
                if (fc && fc.hp > 0 && fc.owner !== d.country && canEngage(d.country, fc.owner)) shouldMove = true;
            }
            if (!shouldMove && d.focusFactory) {
                let ff = G.factories.find(f => f.id === d.focusFactory);
                if (ff && ff.hp > 0 && ff.country !== d.country && canEngage(d.country, ff.country)) shouldMove = true;
            }
            if (shouldMove) {
                let moveTarget = null;
                let tX, tY;
                if (d.focusTarget) {
                    moveTarget = G.divisions.find(x=>x.id===d.focusTarget) || lockTarget;
                } else if (d.focusCity) {
                    let fc = G.cities[d.focusCity];
                    if (fc) { tX = fc.lon; tY = fc.lat; }
                } else if (d.focusFactory) {
                    let ff = G.factories.find(f => f.id === d.focusFactory);
                    if (ff) { tX = ff.rx; tY = ff.ry; }
                }
                if (moveTarget) { tX = moveTarget.rx; tY = moveTarget.ry; }
                if (tX !== undefined && tY !== undefined) {
                    let dx = tX - d.rx, dy = tY - d.ry;
                    let dist = Math.hypot(dx, dy);
                    let desiredDist = vRange * 0.9;
                    if (dist > desiredDist) {
                        d.state = "moving";
                        d.targetX = d.rx + (dx / dist) * (dist - desiredDist);
                        d.targetY = d.ry + (dy / dist) * (dist - desiredDist);
                    } else if (d.state === 'moving') {
                        d.state = 'idle'; d.targetX = null; d.targetY = null;
                    }
                }
            }
            continue;
        }

        d.fireCooldown=vFireCd; d.maxFireCd=vFireCd;
        if (G.patrolTargets[d.id] && d.patrolChase > 0) d.patrolFired = true;

        let targetX=fireTarget.rx;
        let targetY=fireTarget.ry;
        let bulletSpeed=0.15 * (ut.bulletSpeed || 1);
        let dx=targetX-d.rx;
        let dy=targetY-d.ry;
        let travelDist=Math.hypot(dx,dy);
        let isArtillery=d.type==='artillery';
        let arcHeight=isArtillery ? 0.3 : 0;
        // Bullet flies full range distance in target direction
        let bulletLife = vRange / bulletSpeed;
        let endX = targetX, endY = targetY;
        if (travelDist > 0.01) {
            let nx = dx/travelDist, ny = dy/travelDist;
            endX = d.rx + nx * vRange;
            endY = d.ry + ny * vRange;
        }
        G.projectiles.push({
            x:d.rx,y:d.ry,type:d.type,
            life:bulletLife,lifeMax:bulletLife,
            startX:d.rx,startY:d.ry,
            endX:endX,endY:endY,
            arcUp:isArtillery,arcHeight:arcHeight,
            splash:isArtillery?0.05:0.02,
            baseDamage:vDamage,shooterCountry:d.country,
        });
        if (G.projectiles.length > 50) G.projectiles.shift();
    }
}

function updateProjectiles(days) {
    G.projectiles=G.projectiles.filter(p=>{
        p.life-=days;
        if(p.life<=0){
            if(p.splash&&p.splash>0){
                // 火炮命中地面生成火焰
                if (p.arcUp) {
                    if (!G.fireZones) G.fireZones = [];
                    let fireRadius = 0.08;
                    G.fireZones.push({
                        x: p.endX, y: p.endY,
                        radius: fireRadius,
                        life: 1, lifeMax: 1,
                        damage: 13,
                        shooterCountry: p.shooterCountry,
                    });
                    // 限制火焰数量（最多20个，防止卡顿）
                    if (G.fireZones.length > 20) G.fireZones.shift();
                }
                let splashRadius=p.splash;
                let splashDamage=p.baseDamage*0.5;
                for(let d of G.divisions){
                    if(d.country===p.shooterCountry) continue;
                    let dx = Math.abs(p.endX - d.rx);
                    let dy = Math.abs(p.endY - d.ry);
                    if (dx > splashRadius || dy > splashRadius) continue;
                    let dist=Math.hypot(dx, dy);
                    if(dist<splashRadius){
                        d.strength=Math.max(0,d.strength-splashDamage*(1-(dist/splashRadius)*0.5));
                        d.hitFlash=6;
                        if(d.strength<=0){
                            let msg = d.type === 'navy' ? (d.name + " 💀⚓") : (d.name + " 被溅射消灭");
                            removeDivision(d); addGameLog(msg);
                        }
                    }
                }
            }
            return false;
        }
        let t=1-(p.life/p.lifeMax);
        p.progress=t;
        let baseX=p.startX+(p.endX-p.startX)*t;
        let baseY=p.startY+(p.endY-p.startY)*t;
        let arcOffset=0;
        if(p.arcUp) arcOffset=p.arcHeight*Math.sin(t*Math.PI);
        p.x=baseX;p.y=baseY+arcOffset;
        // 精准命中判定：子弹必须打到emoji图像上才算击中
        // 单位渲染半径约7像素，折算为世界坐标度数
        let unitHitRadius = Math.max(0.004, 0.01 / (typeof zoom !== 'undefined' ? Math.max(0.1, zoom) : 1));
        for(let d of G.divisions){
            if(d.country===p.shooterCountry||d.strength<=0) continue;
            let dx = Math.abs(p.x - d.rx);
            let dy = Math.abs(p.y - d.ry);
            if (dx > unitHitRadius * 3 || dy > unitHitRadius * 3) continue;
            if(Math.hypot(dx, dy)<unitHitRadius){
                // Maneuver dodge check (navy ships)
                if (d.navyMvr !== undefined && d.navyMvr > 0 && Math.random() < d.navyMvr) continue;
                d.strength=Math.max(0,d.strength-p.baseDamage);
                d.hitFlash=6;
                if(d.strength<=0){
                    let msg = d.type === 'navy' ? (d.name + " 💀⚓") : (d.name + " 被命中消灭");
                    removeDivision(d); addGameLog(msg);
                }
                return false;
            }
        }
        // Check city/factory hit
        let targetHitRadius = Math.max(0.006, 0.015 / (typeof zoom !== 'undefined' ? Math.max(0.1, zoom) : 1));
        if (p.targetType === 'city' && p.targetCity) {
            let city = p.targetCity;
            if (city.hp > 0 && Math.hypot(p.x - city.lon, p.y - city.lat) < targetHitRadius) {
                city.hp = Math.max(0, city.hp - p.baseDamage);
                if (city.hp <= 0) handleCityCapture(city, p.shooterCountry);
                return false;
            }
        }
        if (p.targetType === 'factory' && p.targetFactory) {
            let fact = p.targetFactory;
            if (fact.hp > 0 && Math.hypot(p.x - fact.rx, p.y - fact.ry) < targetHitRadius) {
                fact.hp = Math.max(0, fact.hp - p.baseDamage);
                if (fact.hp <= 0) {
                    let pd = G.provinceData[fact.provinceId];
                    if (pd) pd.factories = Math.max(0, (pd.factories || 1) - 1);
                    addGameLog(getProvinceName({id:fact.provinceId}) + " 的工厂被摧毁");
                    let idx = G.factories.indexOf(fact);
                    if (idx >= 0) G.factories.splice(idx, 1);
                }
                return false;
            }
        }
        return true;
    });
}

function updateFireZones(days) {
    if (!G.fireZones || G.fireZones.length === 0) return;
    G.fireZones = G.fireZones.filter(fz => {
        fz.life -= days;
        if (fz.life <= 0) return false;
        // 火焰半径内敌人扣血
        for (let d of G.divisions) {
            if (d.country === fz.shooterCountry || d.strength <= 0) continue;
            let dist = Math.hypot(d.rx - fz.x, d.ry - fz.y);
            if (dist < fz.radius) {
                d.strength = Math.max(0, d.strength - fz.damage * days);
                d.hitFlash = 6;
                if (d.strength <= 0) {
                    let msg = d.type === 'navy' ? (d.name + " 💀⚓") : (d.name + " 被火焰烧死");
                    removeDivision(d); addGameLog(msg);
                }
            }
        }
        return true;
    });
}

// ===== 城市占领处理（由投射物命中触发） =====
function handleCityCapture(city, capturer) {
    let prevOwner = city.owner;
    // 如果原主夺回
    if (city.occupierFlag && capturer === city.originalOwner) {
        city.owner = capturer;
        city.occupierFlag = null;
        city.hp = city.originalMaxHp || city.maxHp;
        city.maxHp = city.originalMaxHp || city.maxHp;
        addGameLog(city.name + " 被 " + (COUNTRY_CN[capturer]||capturer) + " 光复");
    } else if (!city.occupierFlag) {
        // 第一次被占领
        city.originalOwner = city.owner;
        city.originalMaxHp = city.maxHp;
        city.owner = capturer;
        city.occupierFlag = capturer;
        city.maxHp = Math.floor(city.originalMaxHp * 0.5);
        city.hp = city.maxHp;
        addGameLog(city.name + " 被 " + (COUNTRY_CN[capturer]||capturer) + " 占领");
    } else {
        // 已占领城市被第三国占领
        city.owner = capturer;
        city.occupierFlag = capturer;
        city.hp = city.maxHp;
        addGameLog(city.name + " 被 " + (COUNTRY_CN[capturer]||capturer) + " 占领");
    }
    // 不改变省份归属——城市被占领不影响领地颜色
    // 只保留城市圈显示
    // 清除所有对该城市的集火
    for (let d of G.divisions) {
        if (d.focusCity === city.id) d.focusCity = null;
    }
}

function updateDivisions(days) {
    for (let div of G.divisions) {
        if (div.moving&&div.moveTarget) {
            div.moveProgress+=days*0.3;
            if (div.moveProgress>=1) {
                if (!canEnterProvince(div.moveTarget, div.country)) {
                    div.moving=false;div.moveTarget=null;div.moveProgress=0;
                    div.state='idle';div.targetX=null;div.targetY=null;
                    continue;
                }
                let pd = G.provinceData[div.province];
                if (pd) pd.garrison = Math.max(0, (pd.garrison || 1) - 1);
                div.province = div.moveTarget;
                div.moving = false; div.moveTarget = null; div.moveProgress = 0;
                pd = G.provinceData[div.province];
                if (pd) pd.garrison = (pd.garrison || 0) + 1;
            }
        }
    }

    // 城市守军维修——先按省份分组避免O(cities*divisions)
    if (G.cities) {
        let divByProvince = {};
        for (let d of G.divisions) {
            if (d.strength <= 0 || !d.province) continue;
            if (!divByProvince[d.province]) divByProvince[d.province] = [];
            divByProvince[d.province].push(d);
        }
        for (let cityId in G.cities) {
            let city = G.cities[cityId];
            if (!city || !city.provinceId || city.hp >= city.maxHp) continue;
            let divs = divByProvince[city.provinceId];
            if (!divs) continue;
            let hasDefender = divs.some(d => {
                if (d.country !== city.owner) return false;
                return Math.hypot(d.rx - city.lon, d.ry - city.lat) < 0.15;
            });
            if (hasDefender) {
                city.hp = Math.min(city.maxHp, city.hp + 0.2 * days);
            }
        }
    }

    // Province occupation: 已移除——领土颜色仅在城市被占领时变更（handleCityCapture），军队存在不影响颜色

    // Factory damage now handled by projectile system (see fireUnits/updateProjectiles)
    // Clean up destroyed factories
    if (G.factories) {
        for (let i = G.factories.length - 1; i >= 0; i--) {
            let fact = G.factories[i];
            if (!fact || fact.hp <= 0) { G.factories.splice(i, 1); continue; }
        }
    }
}

function processBuildQueue(dtMs) {
    if (!G.playerCountry) return;
    let speed=[2,4,8,16,32,64,128][G.speed]||1;
    let days=dtMs/(12000/speed);
    let q=G.buildQueue||[];

    // 城市生产：每个城市只处理队列的第一个项目（串行，FIFO）
    let processedCities = {};
    for(let i=0;i<q.length;i++){
        let cityKey = q[i].cityId;
        if (processedCities[cityKey]) continue; // 该城市已有项目在处理中
        processedCities[cityKey] = true;
        q[i].days-=days;
        if(q[i].days<=0){
            let pd=G.provinceData[q[i].province];
            if (q[i].type === 'unit') {
                // 单位生产完成
                let d = createDivision(q[i].province, G.playerCountry, q[i].unitType, true);
                if (d) {
                    d.rx = (q[i].cityLon || pd.center[0]) + (Math.random() - 0.5) * 0.05;
                    d.ry = (q[i].cityLat || pd.center[1]) + (Math.random() - 0.5) * 0.05;
                }
            } else if (q[i].type === 'upgrade_city') {
                // 城市升级完成
                if (G.cities[q[i].cityId]) {
                    MAJOR_CITY_IDS.add(q[i].cityId);
                    G.cities[q[i].cityId].maxHp = 200;
                    G.cities[q[i].cityId].hp = 200;
                }
                addGameLog(q[i].cityName + " 已升级为大城市");
            } else {
                // 工厂建造完成
                if(pd){
                    pd.factories=(pd.factories||0)+1;
                    let cityLon = q[i].cityLon || pd.center[0];
                    let cityLat = q[i].cityLat || pd.center[1];
                    let angle = Math.random() * Math.PI * 2;
                    let radius = 0.02 + Math.random() * 0.04;
                    let fact = {
                        id: 'fact_' + G.divIdCounter++,
                        provinceId: q[i].province,
                        country: pd.country || G.provinceOwners[q[i].province],
                        rx: cityLon + Math.cos(angle) * radius,
                        ry: cityLat + Math.sin(angle) * radius,
                        hp: 30,
                        maxHp: 30,
                    };
                    if (!G.factories) G.factories = [];
                    G.factories.push(fact);
                }
            }
            q.splice(i,1);
            i--; // 调整索引
        }
    }

    // 海军建造队列（每个节点串行处理）
    let nq = G.navyBuildQueue || [];
    let processedNodes = {};
    for(let i=nq.length-1;i>=0;i--){
        let nodeKey = nq[i].nodeId;
        if (processedNodes[nodeKey]) continue;
        processedNodes[nodeKey] = true;
        nq[i].days-=days;
        if(nq[i].days<=0){
            // 海军建造完成
            let node = G.navyNodes[nq[i].nodeId];
            if (node && typeof createShip === 'function') {
                let ship = createShip(nq[i].nodeId, G.playerCountry);
                if (ship) {
                    let seaPos = findSeaPosition(node.lon, node.lat);
                    let bestProv = findNearestProvince(node.lon, node.lat);
                    if (bestProv) {
                        let divName = '(' + (COUNTRY_CN[G.playerCountry] || G.playerCountry) + ')' + ship.name;
                        let _div3 = {
                            id: G.divIdCounter++, name: divName,
                            type: 'navy', province: bestProv, country: G.playerCountry,
                            rx: seaPos[0], ry: seaPos[1],
                            state: 'idle', targetX: null, targetY: null,
                            attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
                            fireCooldown: 0, maxFireCd: 0, exp: 0,
                            shipId: ship.id,
                        };
                        applyNavyShipStats(_div3, ship);
                        G.divisions.push(_div3);
                        let pd = G.provinceData[bestProv];
                        if (pd) pd.garrison = (pd.garrison || 0) + 1;
                        let cData = G.countries[G.playerCountry];
                        if (cData) cData.divCount = (cData.divCount || 0) + 1;
                    }
                    let gradeName = SHIP_GRADES[ship.grade] ? SHIP_GRADES[ship.grade].name : '';
                    let suffix = ship.isLegendary ? ('[' + gradeName + ']') : '';
                    addGameLog("在" + (node.name || "海军节点") + "建造了(" + (COUNTRY_CN[G.playerCountry] || G.playerCountry) + ")" + ship.name + suffix);
                }
            }
            nq.splice(i,1);
        }
    }
}

function updateEconomy(days) {
    for (let[c,data] of Object.entries(G.countries)) {
        
        let inc=calcCountryIncome(c);
        let exp=(data.divCount||0)*1.5;
        // 占领敌方城市减维护费：每占领1个敌方城市，减1金币/天
        let occupiedCities = 0;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct && ct.owner === c && ct.originalOwner && ct.originalOwner !== c) {
                occupiedCities++;
            }
        }
        // 占领敌方城市增维护费：每占领1个敌方城市，加1金币/天
        exp += occupiedCities;
        data.income=Math.round(inc*10)/10;
        data.expenses=Math.round(exp*10)/10;
        data.treasury+=inc-exp;
        data.treasury=Math.round(data.treasury*10)/10;
        if (data.manpower !== undefined) {
            data.manpower = Math.min(data.maxManpower, data.manpower + data.maxManpower * 0.001 * days);
            data.manpower = Math.round(data.manpower);
        }
        if (data.treasury<-200) data.treasury=-200;
        if (data.treasury>9999) data.treasury=9999;
    }
    // 附属国上缴20%收入给宗主国
    for (let [vassal, suzerain] of Object.entries(VASSAL_OF)) {
        let vData = G.countries[vassal];
        let sData = G.countries[suzerain];
        if (!vData || !sData) continue;
        let tribute = Math.round(vData.income * 0.2 * 10) / 10;
        if (tribute > 0) {
            vData.treasury -= tribute;
            sData.treasury += tribute;
            sData.income = Math.round((sData.income + tribute) * 10) / 10;
        }
    }
}

// ===== Frontline AI behavior: 指挥线推进（按组） =====
function updateFrontlineAdvance(days) {
    if (!G.frontlines) G.frontlines = {};
    if (!G.frontlineGroups) G.frontlineGroups = [];
    if (!G.playerCountry) return;
    let enemies = getEnemiesOf(G.playerCountry);
    if (!enemies || !enemies.length) return;

    // 清理死单位
    for (let did in G.frontlines) {
        let d = G.divisions.find(x => x.id == did);
        if (!d || d.strength <= 0) delete G.frontlines[did];
    }

    // 收集还活跃的前线组
    let activeGroups = new Set();
    for (let did in G.frontlines) activeGroups.add(G.frontlines[did]);
    // 清理无单位的前线组
    G.frontlineGroups = G.frontlineGroups.filter(g => activeGroups.has(g.id));
    if (G.frontlineGroups.length === 0) return;

    // 收集敌方边境城市
    let playerProvs = Object.values(G.provinceData).filter(p => p.country === G.playerCountry);
    let enemyCities = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0) continue;
        if (!enemies.includes(ct.owner)) continue;
        if (ct.owner === G.playerCountry) continue;
        let nearBorder = false;
        let cityProv = ct.provinceId ? G.provinceData[ct.provinceId] : null;
        let cbb = cityProv ? PROVINCE_BBOX[cityProv.id] : null;
        if (cbb) {
            for (let pp of playerProvs) {
                let pbb = PROVINCE_BBOX[pp.id];
                if (!pbb) continue;
                if (pbb.maxX + 0.15 >= cbb.minX && cbb.maxX + 0.15 >= pbb.minX &&
                    pbb.maxY + 0.15 >= cbb.minY && cbb.maxY + 0.15 >= pbb.minY) {
                    nearBorder = true; break;
                }
            }
        }
        if (nearBorder) enemyCities.push(ct);
    }

    // 按组迭代
    for (let grp of G.frontlineGroups) {
        // 计算该组的垂直方向
        let dx = grp.end.x - grp.start.x;
        let dy = grp.end.y - grp.start.y;
        let dirX = dx, dirY = dy;
        let len = Math.hypot(dx, dy);
        if (len > 0) { dirX /= len; dirY /= len; }
        let perpX = -dirY, perpY = dirX;
        let centerX = (grp.start.x + grp.end.x) / 2;
        let centerY = (grp.start.y + grp.end.y) / 2;
        let testX = centerX + perpX * 0.5;
        let testY = centerY + perpY * 0.5;
        let testProv = findProvinceAt(testX, testY);
        if (testProv && G.provinceOwners[testProv.id] === G.playerCountry) {
            perpX = -perpX; perpY = -perpY;
        }

        // 收集该组的单位
        let groupUnits = [];
        for (let did in G.frontlines) {
            if (G.frontlines[did] !== grp.id) continue;
            let d = G.divisions.find(x => x.id == did);
            if (d && d.strength > 0) groupUnits.push(d);
        }

        for (let d of groupUnits) {
            if (d.state === 'moving') continue;
            // 优先：找靠近指挥线的敌方单位
            let bestEnemy = null, bestEnemyDist = 999;
            for (let ed of G.divisions) {
                if (ed.strength <= 0) continue;
                if (!enemies.includes(ed.country)) continue;
                let distToLine = distPointToLine(ed.rx, ed.ry, grp.start.x, grp.start.y, grp.end.x, grp.end.y);
                if (distToLine < 2) {
                    let dist = Math.hypot(d.rx - ed.rx, d.ry - ed.ry);
                    if (dist < bestEnemyDist) { bestEnemy = ed; bestEnemyDist = dist; }
                }
            }
            if (bestEnemy) {
                d.state = 'moving';
                d.targetX = bestEnemy.rx;
                d.targetY = bestEnemy.ry;
                d.focusTarget = bestEnemy.id;
                continue;
            }
            // 其次：找靠近该组指挥线的敌方城市
            let nearest = null, nearDist = 999;
            for (let ct of enemyCities) {
                let distToLine = distPointToLine(ct.lon, ct.lat, grp.start.x, grp.start.y, grp.end.x, grp.end.y);
                if (distToLine < 3) {
                    let dist = Math.hypot(d.rx - ct.lon, d.ry - ct.lat);
                    if (dist < nearDist) { nearest = ct; nearDist = dist; }
                }
            }
            if (nearest) {
                d.state = 'moving';
                d.targetX = nearest.lon + (Math.random() - 0.5) * 0.04;
                d.targetY = nearest.lat + (Math.random() - 0.5) * 0.04;
                d.focusCity = nearest.id;
            } else {
                d.state = 'moving';
                d.targetX = d.rx + perpX * 2;
                d.targetY = d.ry + perpY * 2;
            }
        }
    }
}

// 点到线段的距离
function distPointToLine(px, py, x1, y1, x2, y2) {
    let dx = x2 - x1, dy = y2 - y1;
    let lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ===== AI functions (also defined in js/ai/ai_controller.js) =====
function updateAI() {
    let cs=G.countries;
    let allCountries = Object.keys(cs).filter(c => c !== G.playerCountry  && cs[c].treasury !== undefined);

    // GERMANY SPECIAL: If player is not Germany, Germany is aggressive toward France
    let playerIsGermany = G.playerCountry === 'GERMANY';
    // AI Germany declares war on France + Belgium on Aug 3 1914 if player is not Germany
    if (!playerIsGermany && !G.germanyDeclaredWar && G.date >= new Date(1914, 7, 3)) {
        G.germanyDeclaredWar = true;
        if (!areAtWar('GERMANY', 'FRANCE')) declareWar('GERMANY', 'FRANCE');
        if (!areAtWar('GERMANY', 'BELGIUM')) declareWar('GERMANY', 'BELGIUM');
        G.newsBanner = "⚔️ 德意志帝国向法国和比利时宣战！";
        G.newsTimer = 600;
    }

    for (let co of allCountries) {
        let cd=cs[co];
        if (!cd) continue;

        let atWar = isCountryAtWar(co);
        let atWarWithList = getEnemiesOf(co);

        let enemyCount = 0;
        for (let enemy of atWarWithList) {
            enemyCount += G.divisions.filter(d => d.country === enemy && d.strength > 0).length;
        }
        let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;

        let myProvinceCenters = getCountryProvinces(co).filter(p=>p.center).map(p=>p.center);
        let enemyInTerritory = atWar && G.divisions.some(d => {
            if (d.country === co || d.strength <= 0) return false;
            let isEnemy = atWarWithList.includes(d.country);
            if (!isEnemy) return false;
            return myProvinceCenters.some(ctr => Math.hypot(d.rx-ctr[0], d.ry-ctr[1]) < 1.5);
        });

        let inDanger = atWar && (myCount < enemyCount * 0.8 || enemyInTerritory);

        // France special: much more responsive to German threat
        let franceBonus = (co === 'FRANCE' && atWar) ? 0.3 : 0;
        let trainChance = inDanger ? 0.8 + franceBonus : atWar ? 0.4 + franceBonus : 0.12;
        let maxDivs = inDanger ? 100 : atWar ? 60 : 25;
        let minTreasury = 20;

        if (cd.treasury > minTreasury && cd.divCount < maxDivs && Math.random() < trainChance) {
            let ps = getCountryProvinces(co).filter(p => p.garrison < 3);
            if (ps.length > 0) {
                let affordable = [];
                for (let ut of ['infantry','engineer','cavalry','artillery']) {
                    if (cd.treasury >= UNIT_TYPES[ut].cost * 1.15) affordable.push(ut);
                }
                if (cd.treasury >= UNIT_TYPES.navy.cost * 1.15 && NAVAL_BASES && NAVAL_BASES.some(nb => nb.country === co)) {
                    affordable.push('navy');
                }
                if (affordable.length > 0) {
                    let type = affordable[Math.floor(Math.random() * affordable.length)];
                    if (inDanger && affordable.includes('artillery') && Math.random() > 0.4) type = 'artillery';
                    let prov = ps[Math.floor(Math.random()*ps.length)];
                    if (type === 'navy') {
                        let nbCountry = NAVAL_BASES ? NAVAL_BASES.filter(nb => nb.country === co) : [];
                        if (nbCountry.length > 0) {
                            let nb = nbCountry[Math.floor(Math.random() * nbCountry.length)];
                            let bestProv = null, bestDist = 999;
                            for (let pid in G.provinceData) {
                                let pd = G.provinceData[pid];
                                if (!pd || !pd.center) continue;
                                let dist = Math.hypot(nb.lon - pd.center[0], nb.lat - pd.center[1]);
                                if (dist < bestDist) { bestDist = dist; bestProv = pd; }
                            }
                            if (bestProv) prov = bestProv;
                        }
                    }
                    if (type === 'navy' && typeof GREAT_NAVY_POWERS !== 'undefined' && GREAT_NAVY_POWERS.includes(co) && typeof createShip === 'function') {
                        // Great powers: build named ship via navy node system
                        let myNodeIds = Object.keys(G.navyNodes || {}).filter(id => G.navyNodes[id].country === co);
                        if (myNodeIds.length > 0) {
                            let nodeId = myNodeIds[Math.floor(Math.random() * myNodeIds.length)];
                            let node = G.navyNodes[nodeId];
                            if (cd.treasury >= 500 && cd.manpower >= 5) {
                                cd.treasury -= 500;
                                cd.manpower -= 5;
                                let ship = createShip(nodeId, co);
                                if (ship) {
                                    let seaPos = findSeaPosition(node.lon, node.lat);
                                    let bestProv = findNearestProvince(node.lon, node.lat);
                                    if (bestProv) {
                                        let divName = '(' + (COUNTRY_CN[co] || co) + ')' + ship.name;
                                        let _div2 = {
                                            id: G.divIdCounter++, name: divName,
                                            type: 'navy', province: bestProv, country: co,
                                            rx: seaPos[0], ry: seaPos[1],
                                            state: 'idle', targetX: null, targetY: null,
                                            attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
                                            fireCooldown: 0, maxFireCd: 0, exp: 0,
                                            shipId: ship.id,
                                        };
                                        applyNavyShipStats(_div2, ship);
                                        G.divisions.push(_div2);
                                        let pd = G.provinceData[bestProv];
                                        if (pd) pd.garrison = (pd.garrison || 0) + 1;
                                        cd.divCount = (cd.divCount || 0) + 1;
                                    }
                                }
                            }
                        }
                    } else {
                        createDivision(prov.id, co, type);
                    }
                }
            }
        }

        // AI patrol: station units at border provinces with enemy
        if (atWar && co !== 'FRANCE' && co !== 'UK' && myCount > 5 && Math.random() < 0.02) {
            let borderProvs = getCountryProvinces(co).filter(p => {
                if (!p.center) return false;
                return G.divisions.some(e => {
                    if (e.country === co || e.strength <= 0) return false;
                    let atWar = atWarWithList.includes(e.country);
                    if (!atWar) return false;
                    return Math.hypot(p.center[0] - e.rx, p.center[1] - e.ry) < 1.5;
                });
            });
            if (borderProvs.length > 0) {
                let idleUnits = G.divisions.filter(d => d.country === co && d.state === 'idle' && d.strength > 0 && !G.patrolTargets[d.id]);
                if (idleUnits.length > 0) {
                    let unit = idleUnits[Math.floor(Math.random() * idleUnits.length)];
                    let targetProv = borderProvs[Math.floor(Math.random() * borderProvs.length)];
                    G.patrolTargets[unit.id] = [targetProv.id];
                }
            }
        }
    }

    // SECOND PHASE: AI ATTACK MOVEMENT
    for (let d of G.divisions) {
        if (d.state==='moving' || d.strength <= 0) continue;
        if (d.country === G.playerCountry) continue;
        // Navies on land cannot move in AI phase (wait for player command)
        if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) continue;
        // France and UK are defensive
        if (d.country === 'FRANCE' || d.country === 'UK') {
            let en = isCountryAtWar(d.country);
            if (!en) continue;
            let nearestEnemy = null, bestDist = 999;
            for (let e of G.divisions) {
                if (e.country === d.country || e.strength <= 0) continue;
                let atWarWith = canEngage(d.country, e.country);
                if (!atWarWith) continue;
                let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
                if (dist < bestDist) { nearestEnemy = e; bestDist = dist; }
            }
            if (!nearestEnemy) continue;
            // France/UK: engage if enemy is reasonably close
            if (bestDist < 5 && Math.random() < 0.3) {
                d.state = "moving";
                let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                let desiredDist = ut.range * 0.9;
                let dx = nearestEnemy.rx - d.rx, dy = nearestEnemy.ry - d.ry;
                let dist = Math.hypot(dx, dy);
                let tx = d.rx + (dx/dist) * (dist - desiredDist);
                let ty = d.ry + (dy/dist) * (dist - desiredDist);
                if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(tx, ty)) continue;
                d.targetX = tx; d.targetY = ty;
            }
            continue;
        }

        // Other countries: check at war
        let isAtWar = isCountryAtWar(d.country);
        if (!isAtWar) continue;

        // If player is not Germany, AI Germany invades Belgium by late 1914 (already handled via date check above)

        let target=null, bestDist=999;
        for (let e of G.divisions) {
            if (e.country===d.country || e.strength<=0) continue;
            let atWarWith = canEngage(d.country, e.country);
            if (!atWarWith) continue;
            let dist=Math.hypot(d.rx-e.rx,d.ry-e.ry);
            if (dist<bestDist) { target=e; bestDist=dist; }
        }
        if (!target) continue;

        let engageRate = d.country === 'GERMANY' ? 0.45 : 0.3;
        if (bestDist < 6 && Math.random() < engageRate) {
            d.state="moving";
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            let desiredDist = ut.range * 0.9;
            let dx = target.rx - d.rx, dy = target.ry - d.ry;
            let dist = Math.hypot(dx, dy);
            let tx = d.rx + (dx/dist) * (dist - desiredDist);
            let ty = d.ry + (dy/dist) * (dist - desiredDist);
            if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(tx, ty)) continue;
            d.targetX = tx; d.targetY = ty;
        }
        if (bestDist > 10 && Math.random() < 0.04) {
            d.state = "moving";
            let tx = target.rx; let ty = target.ry;
            if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(tx, ty)) continue;
            d.targetX = target.rx; d.targetY = target.ry;
        }
    }
}// AI functions moved to js/ai/ai_controller.js

// ===== 新前线系统：指挥线 =====
// 多前线颜色（不同深浅的橙色）
const FRONTLINE_COLORS = [
    { main: 'rgba(255,130,25,0.9)', glow: 'rgba(255,150,30,0.35)', fill: 'rgba(255,90,30,0.12)', dash: 'rgba(255,130,25,0.7)' },
    { main: 'rgba(255,95,15,0.9)',  glow: 'rgba(255,110,20,0.35)', fill: 'rgba(255,65,15,0.12)', dash: 'rgba(255,95,15,0.7)' },
    { main: 'rgba(255,170,45,0.9)', glow: 'rgba(255,185,50,0.35)', fill: 'rgba(255,110,40,0.12)', dash: 'rgba(255,170,45,0.7)' },
    { main: 'rgba(255,200,70,0.9)', glow: 'rgba(255,215,75,0.35)', fill: 'rgba(255,140,55,0.12)', dash: 'rgba(255,200,70,0.7)' },
    { main: 'rgba(255,145,10,0.9)', glow: 'rgba(255,155,20,0.35)', fill: 'rgba(255,90,20,0.12)', dash: 'rgba(255,145,10,0.7)' },
];

// 部署部队到指挥线
function deployFrontlineUnits(divIds, cmdStart, cmdEnd) {
    let units = divIds.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
    if (units.length === 0) return;
    if (!G.frontlines) G.frontlines = {};
    if (!G.frontlineGroups) G.frontlineGroups = [];
    G.frontlineGroupCounter = (G.frontlineGroupCounter || 0) + 1;
    let groupId = 'fl_' + G.frontlineGroupCounter;
    let colorIdx = (G.frontlineGroupCounter - 1) % FRONTLINE_COLORS.length;

    G.frontlineGroups.push({
        id: groupId,
        start: { x: cmdStart.x, y: cmdStart.y },
        end: { x: cmdEnd.x, y: cmdEnd.y },
        colorIdx: colorIdx
    });

    let dx = cmdEnd.x - cmdStart.x;
    let dy = cmdEnd.y - cmdStart.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.1) {
        for (let u of units) {
            u.state = 'moving';
            u.targetX = cmdStart.x + (Math.random() - 0.5) * 0.1;
            u.targetY = cmdStart.y + (Math.random() - 0.5) * 0.1;
            G.frontlines[u.id] = groupId;
        }
    } else {
        let ux = dx / len, uy = dy / len;
        let px = -uy, py = ux;
        let testX = (cmdStart.x + cmdEnd.x) / 2 + px * 0.5;
        let testY = (cmdStart.y + cmdEnd.y) / 2 + py * 0.5;
        let testProv = findProvinceAt(testX, testY);
        if (testProv) {
            let testOwner = G.provinceOwners[testProv.id];
            if (testOwner === G.playerCountry) { px = -px; py = -py; }
        }
        for (let i = 0; i < units.length; i++) {
            let t = units.length === 1 ? 0.5 : i / (units.length - 1);
            let u = units[i];
            let baseX = cmdStart.x + dx * t;
            let baseY = cmdStart.y + dy * t;
            let offset = 0.05 + Math.random() * 0.06;
            u.state = 'moving';
            u.targetX = baseX - px * offset + (Math.random() - 0.5) * 0.03;
            u.targetY = baseY - py * offset + (Math.random() - 0.5) * 0.03;
            G.frontlines[u.id] = groupId;
        }
    }
    addGameLog("前线部署: " + units.length + " 单位沿指挥线均匀分布");
}

function drawFrontlineOverlay() {
    if (!G.playerCountry) return;
    ctx.save();

    let enemies = getEnemiesOf(G.playerCountry);
    let hasEnemies = enemies && enemies.length > 0;

    // === 绘制模式：高亮敌国边境 ===
    if (G.frontlineDrawing && hasEnemies) {
        let drawnEnemy = new Set();
        let playerProvs = Object.values(G.provinceData).filter(p => p.country === G.playerCountry);
        let enemyProvs = Object.values(G.provinceData).filter(p => enemies.includes(p.country));
        for (let pp of playerProvs) {
            let pbb = PROVINCE_BBOX[pp.id];
            if (!pbb) continue;
            for (let ep of enemyProvs) {
                let ebb = PROVINCE_BBOX[ep.id];
                if (!ebb) continue;
                if (pbb.maxX + 0.15 < ebb.minX || ebb.maxX + 0.15 < pbb.minX ||
                    pbb.maxY + 0.15 < ebb.minY || ebb.maxY + 0.15 < pbb.minY) continue;
                if (drawnEnemy.has(ep.id)) continue;
                drawnEnemy.add(ep.id);
                let epoly = PROVINCES.find(p => p.id === ep.id);
                if (!epoly) continue;
                for (let ring of epoly.r) {
                    if (ring.length < 3) continue;
                    ctx.beginPath();
                    let first = ring[0];
                    ctx.moveTo(...worldToScreen(first[0], first[1]));
                    for (let i = 1; i < ring.length; i++) ctx.lineTo(...worldToScreen(ring[i][0], ring[i][1]));
                    ctx.closePath();
                    ctx.strokeStyle = "rgba(255,100,40,0.8)";
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.fillStyle = "rgba(255,80,30,0.15)";
                    ctx.fill();
                }
            }
        }
        // 提示
        if (!G.frontlineCmdStart) {
            let [tx, ty] = worldToScreen(5, 55);
            ctx.fillStyle = "rgba(255,180,60,0.9)";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText("点击并拖动以画出指挥线（方向指向敌方）", tx, ty);
        }
    }

    // === 绘制已存在的所有前线组（持久显示） ===
    if (!G.frontlineGroups) G.frontlineGroups = [];
    if (!G.frontlines) G.frontlines = {};

    // 清理无单位的前线组
    let activeGroups = new Set();
    for (let did in G.frontlines) {
        let d = G.divisions.find(x => x.id == did);
        if (d && d.strength > 0) activeGroups.add(G.frontlines[did]);
        else delete G.frontlines[did];
    }
    G.frontlineGroups = G.frontlineGroups.filter(g => activeGroups.has(g.id));

    // 绘制每个前线组
    for (let grp of G.frontlineGroups) {
        let cols = FRONTLINE_COLORS[grp.colorIdx % FRONTLINE_COLORS.length];
        let [sx1, sy1] = worldToScreen(grp.start.x, grp.start.y);
        let [sx2, sy2] = worldToScreen(grp.end.x, grp.end.y);

        // 发光外圈
        ctx.strokeStyle = cols.glow;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        // 主线
        ctx.strokeStyle = cols.main;
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 6]);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        ctx.setLineDash([]);
        // 箭头
        let angle = Math.atan2(sy2 - sy1, sx2 - sx1);
        let arrowLen = 14;
        ctx.fillStyle = cols.main;
        ctx.beginPath();
        ctx.moveTo(sx2, sy2);
        ctx.lineTo(sx2 - arrowLen * Math.cos(angle - 0.5), sy2 - arrowLen * Math.sin(angle - 0.5));
        ctx.lineTo(sx2 - arrowLen * Math.cos(angle + 0.5), sy2 - arrowLen * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fill();

        // 虚线连接单位到前线
        for (let did in G.frontlines) {
            if (G.frontlines[did] !== grp.id) continue;
            let d = G.divisions.find(x => x.id == did);
            if (!d || d.strength <= 0) continue;
            let [ux, uy] = worldToScreen(d.rx, d.ry);
            // 找单位在指挥线上的最近点
            let dx = grp.end.x - grp.start.x;
            let dy = grp.end.y - grp.start.y;
            let lenSq = dx * dx + dy * dy;
            let t = lenSq === 0 ? 0.5 : Math.max(0, Math.min(1,
                ((d.rx - grp.start.x) * dx + (d.ry - grp.start.y) * dy) / lenSq));
            let [lx, ly] = worldToScreen(grp.start.x + dx * t, grp.start.y + dy * t);
            ctx.strokeStyle = cols.dash;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(ux, uy);
            ctx.lineTo(lx, ly);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // === 正在绘制中的临时指挥线 ===
    if (G.frontlineDrawingLine && G.frontlineCmdStart && G.frontlineCmdEnd) {
        let [sx1, sy1] = worldToScreen(G.frontlineCmdStart.x, G.frontlineCmdStart.y);
        let [sx2, sy2] = worldToScreen(G.frontlineCmdEnd.x, G.frontlineCmdEnd.y);
        ctx.strokeStyle = "rgba(255,150,30,0.4)";
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
        ctx.strokeStyle = "rgba(255,120,20,0.9)";
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 6]);
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
        ctx.setLineDash([]);
        let angle = Math.atan2(sy2 - sy1, sx2 - sx1);
        let arrowLen = 14;
        ctx.fillStyle = "rgba(255,120,20,0.9)";
        ctx.beginPath();
        ctx.moveTo(sx2, sy2);
        ctx.lineTo(sx2 - arrowLen * Math.cos(angle - 0.5), sy2 - arrowLen * Math.sin(angle - 0.5));
        ctx.lineTo(sx2 - arrowLen * Math.cos(angle + 0.5), sy2 - arrowLen * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function updatePatrol(days) {
    const PATROL_RANGE = 0.8; // 驻军追击范围
    for (let d of G.divisions) {
        if (!G.patrolTargets[d.id] || G.patrolTargets[d.id].length === 0) continue;
        if (d.state === 'moving') continue;

        // 驻军城市位置
        let homeLon = d.garrisonCityLon;
        let homeLat = d.garrisonCityLat;
        if (homeLon === undefined || homeLat === undefined) {
            // 兼容旧巡逻数据
            let homeProvId = G.patrolTargets[d.id][0];
            let homeProv = G.provinceData[homeProvId];
            if (!homeProv || !homeProv.center) continue;
            homeLon = homeProv.center[0];
            homeLat = homeProv.center[1];
        }

        if (d.patrolChase === undefined) d.patrolChase = 0;
        if (d.patrolFired === undefined) d.patrolFired = false;

        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;

        // 查找范围内最近的敌人
        let nearestEnemy = null, bestDist = PATROL_RANGE;
        for (let e of G.divisions) {
            if (e.country === d.country || e.strength <= 0) continue;
            if (!canEngage(d.country, e.country)) continue;
            let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
            if (dist < bestDist) { nearestEnemy = e; bestDist = dist; }
        }

        if (nearestEnemy) {
            // 有敌人在范围内，追击
            d.patrolChase = 3;
            d.patrolFired = false;
            let dx = nearestEnemy.rx - d.rx, dy = nearestEnemy.ry - d.ry;
            let dist = Math.hypot(dx, dy);
            let desiredDist = ut.range * 0.85;
            if (dist > desiredDist) {
                d.state = 'moving';
                d.targetX = d.rx + (dx / dist) * (dist - desiredDist);
                d.targetY = d.ry + (dy / dist) * (dist - desiredDist);
            } else {
                if (d.state === 'moving') { d.state = 'idle'; d.targetX = null; d.targetY = null; }
                d.patrolFired = true;
            }
            continue;
        }

        // 没有敌人在范围内：检查是否在追逐中
        if (d.patrolChase > 0) {
            d.patrolChase -= days;
            // 追逐期间扩大搜索范围
            for (let e of G.divisions) {
                if (e.country === d.country || e.strength <= 0) continue;
                if (!canEngage(d.country, e.country)) continue;
                let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
                if (dist < PATROL_RANGE * 1.5 && dist < bestDist) { nearestEnemy = e; bestDist = dist; }
            }
            if (nearestEnemy) {
                let dx = nearestEnemy.rx - d.rx, dy = nearestEnemy.ry - d.ry;
                let dist = Math.hypot(dx, dy);
                let desiredDist = ut.range * 0.85;
                if (dist > desiredDist) {
                    d.state = 'moving';
                    d.targetX = d.rx + (dx / dist) * (dist - desiredDist);
                    d.targetY = d.ry + (dy / dist) * (dist - desiredDist);
                }
            }
            if (d.patrolChase <= 0) {
                // 追逐结束，返回城市
                let distToHome = Math.hypot(d.rx - homeLon, d.ry - homeLat);
                if (distToHome > 0.04) {
                    d.state = 'moving';
                    d.targetX = homeLon;
                    d.targetY = homeLat;
                } else {
                    d.state = 'idle'; d.targetX = null; d.targetY = null;
                }
            }
        } else {
            // 空闲：返回城市附近
            let distToHome = Math.hypot(d.rx - homeLon, d.ry - homeLat);
            if (distToHome > 0.04) {
                d.state = 'moving';
                d.targetX = homeLon;
                d.targetY = homeLat;
            }
        }
    }
}

// ===== 工兵自动拆除工厂 =====
const ENGINEER_DEMOLISH_RANGE = 0.5; // 工兵拆除圈半径
function updateEngineerDemolish(days) {
    if (!G.factories || G.factories.length === 0) return;
    for (let d of G.divisions) {
        if (d.type !== 'engineer' || d.strength <= 0 || d.state === 'moving') continue;
        // 跳过巡逻中的单位
        if (G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0) continue;
        // 查找范围内最近的敌方工厂
        let nearest = null, bestDist = ENGINEER_DEMOLISH_RANGE;
        for (let fact of G.factories) {
            if (!fact || fact.hp <= 0) continue;
            if (fact.country === d.country) continue;
            if (!canEngage(d.country, fact.country)) continue;
            let dist = Math.hypot(d.rx - fact.rx, d.ry - fact.ry);
            if (dist < bestDist) { nearest = fact; bestDist = dist; }
        }
        if (nearest) {
            // 走向工厂
            let dx = nearest.rx - d.rx, dy = nearest.ry - d.ry;
            let dist = Math.hypot(dx, dy);
            if (dist > 0.04) {
                d.state = 'moving';
                d.targetX = nearest.rx;
                d.targetY = nearest.ry;
            } else {
                // 足够近，自动拆除
                d.focusFactory = nearest.id;
                d.focusTarget = null;
                d.focusCity = null;
            }
        }
    }
}

// ===== 工兵修复本国受伤建筑 =====
const ENGINEER_REPAIR_RANGE = 0.3;
const ENGINEER_REPAIR_RATE = 20; // 20HP每天
function updateEngineerRepair(days) {
    for (let d of G.divisions) {
        if (d.type !== 'engineer' || d.strength <= 0) continue;
        if (d.state === 'moving') continue;
        if (G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0) continue;
        // 修理附近的本国受伤工厂
        if (G.factories) {
            for (let fact of G.factories) {
                if (!fact || fact.hp <= 0 || fact.hp >= fact.maxHp) continue;
                if (fact.country !== d.country) continue;
                let dist = Math.hypot(d.rx - fact.rx, d.ry - fact.ry);
                if (dist < ENGINEER_REPAIR_RANGE) {
                    fact.hp = Math.min(fact.maxHp, fact.hp + ENGINEER_REPAIR_RATE * days);
                    if (fact.hp >= fact.maxHp) fact.hp = fact.maxHp;
                    break; // 一次只修理一个建筑
                }
            }
        }
        // 修理附近的本国受伤城市
        if (G.cities) {
            for (let cityId in G.cities) {
                let city = G.cities[cityId];
                if (!city || city.hp >= city.maxHp) continue;
                if (city.owner !== d.country) continue;
                let dist = Math.hypot(d.rx - city.lon, d.ry - city.lat);
                if (dist < ENGINEER_REPAIR_RANGE) {
                    city.hp = Math.min(city.maxHp, city.hp + ENGINEER_REPAIR_RATE * days);
                    break;
                }
            }
        }
    }
}

// ===== AI Occupation: capture undefended enemy provinces =====
function updateAIOccupation() {
    let allCountries = Object.keys(G.countries).filter(c =>
        c !== G.playerCountry  &&
        G.countries[c].treasury !== undefined && !G.surrendered[c]
    );

    for (let co of allCountries) {
        // Find idle units not on patrol
        let idleUnits = G.divisions.filter(d =>
            d.country === co && d.strength > 0 &&
            d.state !== 'moving' &&
            !G.patrolTargets[d.id]
        );
        if (idleUnits.length < 2) continue; // need at least some spare units

        // Find undefended enemy provinces adjacent to our territory
        let ownedProvIds = Object.values(G.provinceData)
            .filter(p => p.country === co && p.center)
            .map(p => p.id);

        let targetable = [];
        for (let pid of ownedProvIds) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center) continue;
            // Scan nearby provinces for enemies
            let nearbyProvs = Object.values(G.provinceData).filter(p =>
                p.country !== co && p.center &&
                Math.hypot(p.center[0] - pd.center[0], p.center[1] - pd.center[1]) < 3 &&
                isAtWarWith(co, p.country)
            );
            for (let np of nearbyProvs) {
                if (targetable.some(t => t.id === np.id)) continue;
                // Check if enemy has any troops in this province
                let enemyPresent = G.divisions.some(d =>
                    d.country !== co && d.strength > 0 &&
                    isAtWarWith(co, d.country) &&
                    d.province === np.id
                );
                // Also check if any of our units already heading there
                let alreadyGoing = G.divisions.some(d =>
                    d.country === co && d.state === 'moving' &&
                    d.targetX !== null && np.center &&
                    Math.hypot(d.targetX - np.center[0], d.targetY - np.center[1]) < 0.3
                );
                if (!enemyPresent && !alreadyGoing) {
                    targetable.push({ id: np.id, dist: Math.hypot(np.center[0] - pd.center[0], np.center[1] - pd.center[1]) });
                }
            }
        }

        // Sort by distance (closest first)
        targetable.sort((a, b) => a.dist - b.dist);

        // Send units to occupy
        let unitsUsed = 0;
        for (let target of targetable) {
            if (unitsUsed >= idleUnits.length) break;
            let targetPd = G.provinceData[target.id];
            if (!targetPd || !targetPd.center) continue;

            // Send one unit per province
            let unitIdx = idleUnits.findIndex(d =>
                !d.moving && d.state !== 'moving' && !G.patrolTargets[d.id]
            );
            if (unitIdx < 0) break;

            let unit = idleUnits[unitIdx];
            unit.state = 'moving';
            unit.targetX = targetPd.center[0];
            unit.targetY = targetPd.center[1];
            // Set patrol so unit will guard after arrival
            G.patrolTargets[unit.id] = [target.id];

            idleUnits.splice(unitIdx, 1);
            unitsUsed++;
        }
    }
}

function isAtWarWith(countryA, countryB) {
    if (!countryA || !countryB) return false;
    if (areAtWar(countryA, countryB)) return true;
    if (G.atWar && G.atWar[countryA]) {
        for (let e in G.atWar[countryA]) {
            if (e === countryB) return true;
            if (G.alliances && G.alliances[countryB] && G.alliances[countryB][e]) return true;
        }
    }
    // Check if A's allies are at war with B
    if (G.alliances && G.alliances[countryA]) {
        for (let ally of Object.keys(G.alliances[countryA])) {
            if (areAtWar(ally, countryB)) return true;
        }
    }
    return false;
}

// 投降后，将投降国剩余领土转移给占领其城市的国家
function transferRemainingProvincesOnSurrender(co) {
    let provs = getCountryProvinces(co);
    // 统计各敌国占领了投降国多少城市
    let occupierCities = {};
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.country === co && ct.owner !== co && ct.owner) {
            occupierCities[ct.owner] = (occupierCities[ct.owner] || 0) + 1;
        }
    }
    // 找出占领城市最多的国家作为默认接收者
    let defaultOwner = null;
    let maxCities = 0;
    for (let oc in occupierCities) {
        if (occupierCities[oc] > maxCities) {
            maxCities = occupierCities[oc];
            defaultOwner = oc;
        }
    }
    if (!defaultOwner) return;

    // 将投降国剩余城市的所有权也转移给占领者
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.country === co && ct.owner === co) {
            ct.owner = defaultOwner;
            ct.occupierFlag = defaultOwner;
        }
    }

    for (let pd of provs) {
        if (pd.country !== co) continue; // 已被占领的跳过
        let pid = pd.id;
        // 找最近的已被占领的邻省
        let bestOwner = null;
        let bestDist = 0.5; // 0.5度以内视为邻省
        let myCtr = pd.center;
        if (!myCtr) continue;
        for (let nid in G.provinceData) {
            let npd = G.provinceData[nid];
            if (!npd || npd.country === co || npd.country === pd.originalCountry) continue;
            let nCtr = npd.center;
            if (!nCtr) continue;
            let dist = Math.hypot(nCtr[0] - myCtr[0], nCtr[1] - myCtr[1]);
            if (dist < bestDist) {
                bestDist = dist;
                bestOwner = npd.country;
            }
        }
        if (!bestOwner) bestOwner = defaultOwner;
        pd.country = bestOwner;
        G.provinceOwners[pid] = bestOwner;
        let provRef = PROVINCES.find(p => p.id === pid);
        if (provRef) provRef.c = bestOwner;
    }
}

function checkSurrender() {
    for (let co in G.countries) {
        if (G.surrendered[co]) continue;
        let cd = G.countries[co];
        if (!cd) continue;

        // 获取该国所有城市（原始owner为该国的城市）
        let allCities = Object.values(G.cities).filter(c => c.country === co);
        if (allCities.length === 0) continue;

        let surrendered = false;

        if (isGreatPower(co)) {
            // 列强：首都沦陷 + 所有大城市沦陷 → 投降
            let capitalCity = allCities.find(c => c.isCapital);
            let capitalLost = capitalCity ? capitalCity.owner !== co : true;
            let majorCities = allCities.filter(c => isMajorCity(c.id));
            let allMajorLost = majorCities.length > 0 && majorCities.every(c => c.owner !== co);

            if (capitalLost && allMajorLost) {
                surrendered = true;
                G.newsBanner = (COUNTRY_CN[co]||co) + " 宣布投降！";
                G.newsTimer = 400;
                addGameLog((COUNTRY_CN[co]||co) + " 首都与大城市全部沦陷，战败投降！");
            }
        } else {
            // 非列强：所有城市沦陷 → 投降
            let allLost = allCities.every(c => c.owner !== co);

            if (allLost) {
                surrendered = true;
                G.newsBanner = (COUNTRY_CN[co]||co) + " 宣布投降！";
                G.newsTimer = 400;
                addGameLog((COUNTRY_CN[co]||co) + " 所有城市沦陷，战败投降！");
            }
        }

        if (surrendered) {
            G.surrendered[co] = true;
            // 投降后，将所有剩余领土转移给占领者
            transferRemainingProvincesOnSurrender(co);
        }
    }

    if (G.alliances) {
        // Check victory: if all members of one faction have surrendered
        let germanyAllies = ['GERMANY'];
        let ententeMembers = ['FRANCE','UK'];
        if (G.alliances['GERMANY']) {
            for (let ally in G.alliances['GERMANY']) {
                if (!germanyAllies.includes(ally)) germanyAllies.push(ally);
            }
        }
        if (G.alliances['FRANCE']) {
            for (let ally in G.alliances['FRANCE']) {
                if (!ententeMembers.includes(ally)) ententeMembers.push(ally);
            }
        }
        if (G.alliances['UK']) {
            for (let ally in G.alliances['UK']) {
                if (!ententeMembers.includes(ally)) ententeMembers.push(ally);
            }
        }

        let allGermansSurrendered = germanyAllies.every(c => G.surrendered[c]);
        let allEntenteSurrendered = ententeMembers.every(c => G.surrendered[c]);

        if (allEntenteSurrendered && !G.paused) {
            G.gameOver = true;
            G.gameOverMessage = "🏆 同盟国获得最终胜利！";
            G.newsBanner = "🏆 同盟国获得最终胜利！";
            G.newsTimer = 9999;
            G.paused = true;
            addGameLog("游戏结束：同盟国胜利！");
        } else if (allGermansSurrendered && !G.paused) {
            G.gameOver = true;
            G.gameOverMessage = "🏆 协约国获得最终胜利！";
            G.newsBanner = "🏆 协约国获得最终胜利！";
            G.newsTimer = 9999;
            G.paused = true;
            addGameLog("游戏结束：协约国胜利！");
        }

        if (G.playerCountry && G.surrendered[G.playerCountry] && !G.paused) {
            G.gameOver = true;
            G.gameOverMessage = (COUNTRY_CN[G.playerCountry]||G.playerCountry) + " 战败了！";
            G.newsBanner = (COUNTRY_CN[G.playerCountry]||G.playerCountry) + " 战败了！";
            G.newsTimer = 9999;
            G.paused = true;
            addGameLog("游戏结束：" + (COUNTRY_CN[G.playerCountry]||G.playerCountry) + " 战败了！");
        }
    }

    // 1919年僵局结束
    if (G.date && G.date.getFullYear() >= 1919 && !G.gameOver && !G.paused) {
        G.gameOver = true;
        G.gameOverMessage = "⏰ 1919年到了，战争陷入僵局！协议和平。";
        G.newsBanner = G.gameOverMessage;
        G.newsTimer = 9999;
        G.paused = true;
        addGameLog("1919年，战争以僵局告终");
    }
}

function checkEvents() {
    let y=G.date.getFullYear(),m=G.date.getMonth()+1,d=G.date.getDate();
    for (let ev of EVENTS) {
        let key=ev.y+'-'+ev.m+'-'+ev.d;
        if (triggeredEvents.has(key)) continue;
        if (y===ev.y&&m===ev.m&&d===ev.d) {
            G.activeEvent=ev;
            triggeredEvents.add(key);
            G.paused=true;
            saveGame(ev.t||ev.title);
            addGameLog("Event: "+(ev.t||ev.title));
            break;
        }
    }
}

function resolveEvent(idx) {
    if (!G.activeEvent) return;
    let opts=G.activeEvent.o||G.activeEvent.options||[];
    let opt=opts[idx];
    if (opt) {
        addGameLog("Choice: "+(opt.t||opt.text));
        let e=opt.e||opt.effect;
        if (e==='ger_prep' && G.playerCountry) G.countries[G.playerCountry].treasury+=200;
        else if (e==='schlieffen' && G.playerCountry) {
            G.countries[G.playerCountry].treasury+=300;
            for (let d of G.divisions.filter(d=>d.country===G.playerCountry)) d.strength=Math.min(d.maxStrength,d.strength+10);
        } else if (e==='italy_entente') {
            declareWar('ITALY', 'AUSTRIA_HUNGARY');
            addGameLog("意大利加入协约国！");
            G.newsBanner = "🇮🇹 意大利加入协约国！";
            G.newsTimer = 300;
        } else if (e==='italy_alliance') {
            declareWar('ITALY', 'FRANCE');
            declareWar('ITALY', 'UK');
            addGameLog("意大利加入同盟国！");
            G.newsBanner = "🇮🇹 意大利加入同盟国！";
            G.newsTimer = 300;
        } else if (e==='italy_neutral') {
            addGameLog("意大利继续中立");
        } else if (G.playerCountry) G.countries[G.playerCountry].treasury+=100;
        eventHistory.push({name:G.activeEvent.t||G.activeEvent.title,choice:opt.t||opt.text,date:new Date(G.date)});
    }
    G.activeEvent=null;
    G.paused=false;
}

// ===== UI Click Handler =====
function handleUIClick(mx,my) {
    let w=canvas.width,h=canvas.height;
    if (!G.playerCountry) return true;

    // Sidebar form button clicks (remove individual from formation) — MUST be before side panel rect check
    if (window._sibFormBtn) {
        for (let b of window._sibFormBtn) {
            if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                let d = G.divisions.find(x => x.id === b.divId);
                if (d) { d.formation = null; d.formationGroup = null; }
                addGameLog((d.name||'单位') + " 已移除阵型");
                return true;
            }
        }
    }

    // Sidebar buttons — MUST be before side panel rect check to allow button clicks
    if (window._sibBtns) {
        for (let b of window._sibBtns) {
            if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                if (b.enabled === false) continue;
                // Patrol/garrison buttons: no selectedProvince required
                if (b.id === "patrol_add") {
                    // 海军只能驻守海军节点
                    let hasNavy = G.selectedDivisions.some(did => {
                        let d = G.divisions.find(x => x.id === did);
                        return d && d.type === 'navy';
                    });
                    G.garrisonMode = true;
                    G.garrisonUnitIds = [...G.selectedDivisions];
                    if (hasNavy) {
                        addGameLog("选中海军单位，请点击海军节点以驻守");
                    }
                    addGameLog("请点击目标城市以驻守 " + G.selectedDivisions.length + " 单位");
                    return true;
                }
                if (b.id === "patrol_remove") {
                    for (let did of G.selectedDivisions) {
                        delete G.patrolTargets[did];
                        delete G.patrolIndex[did];
                        let d = G.divisions.find(x => x.id === did);
                        if (d) { d.garrisonCityId = null; d.garrisonCityLon = null; d.garrisonCityLat = null; }
                    }
                    addGameLog("已取消驻守");
                    return true;
                }
                let co = selectedProvince ? G.provinceOwners[selectedProvince.id] : (G.diplomacyFocus || null);
                let pc = G.playerCountry;
                // Frontline button: no selectedProvince needed
                if (b.id === "frontline") {
                    if (G.frontlineDrawing) {
                        G.frontlineDrawing = false;
                        G.frontlineCmdStart = null;
                        G.frontlineCmdEnd = null;
                        addGameLog("前线绘制已取消");
                    } else {
                        if (G.frontlineGroups && G.frontlineGroups.length > 0) {
                            // 有活跃前线，取消全部
                            G.frontlines = {};
                            G.frontlineGroups = [];
                            G.frontlineCmdStart = null;
                            G.frontlineCmdEnd = null;
                            G.frontlineDrawing = false;
                            addGameLog("所有前线已取消");
                        } else if (G.selectedDivisions.length === 0) {
                            addGameLog("请先选中要部署的部队");
                        } else {
                            G.frontlineDrawing = true;
                            G.frontlineCmdStart = null;
                            G.frontlineCmdEnd = null;
                            addGameLog("在敌国边境上点击并拖动，画出指挥线方向");
                        }
                    }
                    return true;
                }
                // Navy formation buttons (no selectedProvince required)
                if (b.id === "formation_apply") {
                    let groupId = 'form_' + (G._formationGroupCounter || 0);
                    G._formationGroupCounter = (G._formationGroupCounter || 0) + 1;
                    for (let did of G.selectedDivisions) {
                        let d = G.divisions.find(x => x.id === did);
                        if (d && d.type === 'navy') {
                            d.formation = 'line';
                            d.formationGroup = groupId;
                        }
                    }
                    addGameLog("海军已排列一字阵 (组" + (G._formationGroupCounter) + ")");
                    return true;
                }
                if (b.id === "formation_remove") {
                    for (let did of G.selectedDivisions) {
                        let d = G.divisions.find(x => x.id === did);
                        if (d && d.type === 'navy') { d.formation = null; d.formationGroup = null; }
                    }
                    addGameLog("海军阵型已解除");
                    return true;
                }
                if (!co) continue;
                if (b.id === "war" && co !== pc) {
                    let result = declareWar(pc, co);
                    if (result !== false) {
                        G.countries[pc].stability -= 5;
                    }
                    return true;
                }
                if (b.id === "peace" && co !== pc) {
                    makePeace(pc, co, 0);
                    return true;
                }
                if (b.id === "alliance" && co !== pc) {
                    if (!isSameFaction(pc, co)) {
                        if (!G.alliances[pc]) G.alliances[pc] = {};
                        G.alliances[pc][co] = true;
                        if (!G.alliances[co]) G.alliances[co] = {};
                        G.alliances[co][pc] = true;
                        addGameLog("与" + (COUNTRY_CN[co]||co) + "成立同盟");
                    }
                    return true;
                }
                if (b.id === "access" && co !== pc) {
                    if (!G.militaryAccess[pc]) G.militaryAccess[pc] = {};
                    G.militaryAccess[pc][co] = !G.militaryAccess[pc][co];
                    addGameLog((G.militaryAccess[pc][co] ? "授予" : "撤销") + (COUNTRY_CN[co]||co) + "军事通行权");
                    return true;
                }
                if (b.id === "guarantee" && co !== pc) {
                    if (!G.guarantees) G.guarantees = {};
                    if (!G.guarantees[pc]) G.guarantees[pc] = [];
                    G.guarantees[pc].push(co);
                    addGameLog("保障" + (COUNTRY_CN[co]||co) + "独立");
                    return true;
                }
                if (b.id === "remove_guarantee" && co !== pc) {
                    if (!G.guarantees) G.guarantees = {};
                    if (G.guarantees[pc]) {
                        let idx = G.guarantees[pc].indexOf(co);
                        if (idx >= 0) G.guarantees[pc].splice(idx, 1);
                    }
                    addGameLog("取消保障" + (COUNTRY_CN[co]||co) + "独立");
                    return true;
                }
                if (b.id === "nap" && co !== pc) {
                    let napKey = [pc, co].sort().join('_');
                    if (!G.nonAggression) G.nonAggression = {};
                    if (G.nonAggression[napKey]) {
                        delete G.nonAggression[napKey];
                        addGameLog("撕毁与" + (COUNTRY_CN[co]||co) + "的互不侵犯条约");
                    } else {
                        G.nonAggression[napKey] = true;
                        addGameLog("与" + (COUNTRY_CN[co]||co) + "签订互不侵犯条约");
                    }
                    return true;
                }
                if (b.id === "rel" && co !== pc) {
                    if (G.countries[pc] && G.countries[pc].treasury >= 50) {
                        G.countries[pc].treasury -= 50;
                        if (!G.relations) G.relations = {};
                        G.relations[co] = (G.relations[co] || 0) + 10;
                        addGameLog("改善与" + (COUNTRY_CN[co]||co) + "的关系");
                    }
                    return true;
                }
                if (b.id === "trade" && co !== pc) {
                    if (G.countries[pc] && G.countries[pc].treasury >= 30) {
                        G.countries[pc].treasury -= 30;
                        if (!G.relations) G.relations = {};
                        G.relations[co] = (G.relations[co] || 0) + 15;
                        addGameLog("与" + (COUNTRY_CN[co]||co) + "签订贸易协定");
                    }
                    return true;
                }
                if (b.id === "leave_faction" && co !== pc) {
                    // 退出阵营
                    if (G.alliances && G.alliances[pc]) {
                        for (let ally in G.alliances[pc]) {
                            if (G.alliances[ally]) delete G.alliances[ally][pc];
                        }
                        G.alliances[pc] = {};
                    }
                    addGameLog("退出阵营");
                    return true;
                }
            }
        }
    }

    // 详情栏（侧边单位面板）点击区域拦截，防止穿透到背景（但上面已处理按钮点击）
    if (window._sidePanelRect && window._sidePanelRect.x !== undefined) {
        let sp = window._sidePanelRect;
        if (mx > sp.x && mx < sp.x + sp.w && my > sp.y && my < sp.y + sp.h) {
            return true;
        }
    }

    if (my>h-28&&my<h-4) {
        if (mx>10&&mx<90) {showSavePanel=!showSavePanel;return true;}
        if (showSavePanel) {
            for (let i=0;i<saveSlots.length;i++) {
                let sy=h-30-(saveSlots.length-i)*20;
                if (my>sy&&my<sy+18&&mx>100&&mx<400) {loadGame(i);showSavePanel=false;return true;}
            }
        }
        return false;
    }

    if (my<TOP_BAR_HEIGHT) {
        // 暂停按钮点击
        if (G._pauseBtn && mx > G._pauseBtn.x && mx < G._pauseBtn.x + G._pauseBtn.w && my > G._pauseBtn.y && my < G._pauseBtn.y + G._pauseBtn.h) {
            G.paused = !G.paused;
            return true;
        }
        // 速度按钮点击
        if (G._spdBtns) {
            for (let i = 0; i < G._spdBtns.length; i++) {
                let b = G._spdBtns[i];
                if (b && mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                    G.speed = i;
                    return true;
                }
            }
        }
        return false;
    }

    // 城市面板按钮点击（右侧）
    if (window._cityBtns) {
        for (let btn of window._cityBtns) {
            if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h && btn.enabled) {
                let city = G.selectedCity;
                if (!city || !city.provinceId) return true;
                if (btn.id === 'build_factory') {
                    if (!G.buildQueue) G.buildQueue = [];
                    let cityFactories = CITY_FACTORIES[city.id] || 0;
                    G.countries[G.playerCountry].treasury -= 50;
                    G.buildQueue.push({ type: 'factory', province: city.provinceId, days: 10, totalDays: 10, cityId: city.id, cityLon: city.lon, cityLat: city.lat });
                    return true;
                }
                if (btn.id === 'upgrade_city') {
                    G.countries[G.playerCountry].treasury -= 150;
                    if (!G.buildQueue) G.buildQueue = [];
                    G.buildQueue.push({ type: 'upgrade_city', province: city.provinceId, days: 40, totalDays: 40, cityId: city.id, cityLon: city.lon, cityLat: city.lat, cityName: city.name });
                    addGameLog(city.name + " 开始升级为大城市 (40天)");
                    return true;
                }
                // 单位生产加入队列（带进度）
                let ut = UNIT_TYPES[btn.id];
                if (!ut) return true;
                let cData = G.countries[G.playerCountry];
                let manpowerCost = ut.manpower || 10;
                if (!cData || cData.treasury < ut.cost || cData.manpower < manpowerCost) return true;
                cData.treasury -= ut.cost;
                cData.manpower -= manpowerCost;
                if (!G.buildQueue) G.buildQueue = [];
                let buildDays = { infantry: 3, engineer: 3, cavalry: 4, artillery: 5 }[btn.id] || 20;
                G.buildQueue.push({ type: 'unit', unitType: btn.id, province: city.provinceId, days: buildDays, totalDays: buildDays, cityId: city.id, cityLon: city.lon, cityLat: city.lat });
                return true;
            }
        }
    }

    // 城市面板区域拦截
    if (window._cityPanelRect && mx > window._cityPanelRect.x && mx < window._cityPanelRect.x + window._cityPanelRect.w && my > window._cityPanelRect.y && my < window._cityPanelRect.y + window._cityPanelRect.h) {
        // 检查置顶按钮
        if (window._cityPinBtns) {
            for (let pb of window._cityPinBtns) {
                if (mx > pb.x && mx < pb.x + pb.w && my > pb.y && my < pb.y + pb.h) {
                    // 将该建造项目移到队列最前面
                    if (!G.buildQueue) G.buildQueue = [];
                    let cityItems = [];
                    for (let i = 0; i < G.buildQueue.length; i++) {
                        if (G.buildQueue[i].cityId === pb.cityId) cityItems.push({ item: G.buildQueue[i], index: i });
                    }
                    if (pb.bqIndex < cityItems.length) {
                        let target = cityItems[pb.bqIndex];
                        // 移除该项
                        G.buildQueue.splice(target.index, 1);
                        // 插入到该城市队列的最前面
                        let insertIdx = -1;
                        for (let i = 0; i < G.buildQueue.length; i++) {
                            if (G.buildQueue[i].cityId === pb.cityId) { insertIdx = i; break; }
                        }
                        if (insertIdx >= 0) {
                            G.buildQueue.splice(insertIdx, 0, target.item);
                        } else {
                            G.buildQueue.unshift(target.item);
                        }
                    }
                    return true;
                }
            }
        }
        return true;
    }

    // 侧边栏国旗按钮点击（跳转到该国外交界面）
    if (G._countryFlagBtns) {
        for (let btn of G._countryFlagBtns) {
            if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h) {
                G.diplomacyFocus = btn.co;
                G.activeTab = 'diplomacy';
                G.selectedProvince = null;
                return true;
            }
        }
    }

    // Block clicks within sidebar panel area (prevent map interaction behind it)
    if (G._sidebarBounds) {
        let sb = G._sidebarBounds;
        if (mx > sb.x && mx < sb.x + sb.w && my > sb.y && my < sb.y + sb.h) return true;
    }
    return false;
}

// ===== Find unit at screen position =====
function findUnitAtScreen(sx, sy) {
    // 缩放到大城市级别（zoom>0.35）时才允许选中陆军单位
    let best = null;
    let bestDist = 14;
    for (let d of G.divisions) {
        let rx = d.rx!==undefined ? d.rx : null;
        let ry = d.ry!==undefined ? d.ry : null;
        if (rx===null) {
            let dp = G.provinceData[d.province];
            if (!dp||!dp.center) continue;
            rx = dp.center[0]; ry = dp.center[1];
        }
        let [ux, uy] = worldToScreen(rx, ry);
        // 视野外不可选中
        if (ux < -100 || ux > canvas.width + 100 || uy < -100 || uy > canvas.height + 100) continue;
        // 缩放级别检查：非海军单位在zoom<=0.35时不可选中
        if (d.type !== 'navy' && zoom <= 0.35) continue;
        let divsHere = G.divisions.filter(dd => dd.province === d.province);
        let idx = divsHere.indexOf(d);
        if (idx < 0) idx = 0;
        let ox = (idx % 4) * 7 - 10;
        let oy_off = Math.floor(idx / 4) * 7 - 5;
        let dist = Math.hypot(sx - (ux + ox), sy - (uy + oy_off));
        if (dist < bestDist) { best = d; bestDist = dist; }
    }
    return best;
}

// ===== Find naval base at screen position (for garrison mode) =====
function findNavalBaseAtScreen(sx, sy) {
    if (typeof NAVAL_BASES === 'undefined') return null;
    let best = null, bestDist = 20;
    for (let nb of NAVAL_BASES) {
        let [bx, by] = worldToScreen(nb.lon, nb.lat);
        let dist = Math.hypot(sx - bx, sy - by);
        if (dist < bestDist) { best = nb; bestDist = dist; }
    }
    return best;
}

// ===== Event Handlers =====
let boxStartX = 0, boxStartY = 0;
let boxSelecting = false;
let panDragStartX = 0, panDragStartY = 0;
let panDragCamStartX = 0, panDragCamStartY = 0;
let panDragging = false;
let panDragMoved = false;
let activeCapture = null;

window.addEventListener("contextmenu",(e)=>{e.preventDefault();});

canvas.addEventListener("wheel",(e)=>{
    e.preventDefault();
    let r=canvas.getBoundingClientRect();
    let sx=e.clientX-r.left,sy=e.clientY-r.top;

    // Check if mouse is over a tab panel area
    if (G.activeTab) {
        let tabBtnY = canvas.height - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT;
        let panelY = tabBtnY - TAB_PANEL_HEIGHT;
        let cx2 = canvas.width / 2;
        let startX2 = cx2 - (TAB_BTN_W * 4 + 30) / 2;
        let panelX = startX2 - 10, panelW = TAB_BTN_W * 4 + 50;
        let inPanel = sx > panelX && sx < panelX + panelW && sy > panelY && sy < tabBtnY;

        if (inPanel) {
            if (G.activeTab === 'navy') {
                if (_showNavyGuide) {
                    _navyGuideScroll = Math.max(0, Math.min(_navyGuideMaxScroll || 0, _navyGuideScroll + e.deltaY));
                } else {
                    _navyPanelScroll = Math.max(0, Math.min(_navyMaxScroll || 0, _navyPanelScroll + e.deltaY));
                }
                return;
            }
            if (G.activeTab === 'diplomacy') {
                _diploScroll = Math.max(0, Math.min(_diploMaxScroll || 0, _diploScroll + e.deltaY));
                return;
            }
        }
    }

    // Outside any panel → zoom map
    let wb=screenToWorld(sx,sy);
    let nz=zoom*(1+(e.deltaY>0?-1:1)*ZOOM_SPEED);
    nz=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,nz));
    if (nz===zoom) return;
    zoom=nz;
    let s=zoom*PIXELS_PER_DEGREE;
    camX=wb[0]-(sx-canvas.width/2)/s;
    camY=wb[1]+(sy-canvas.height/2)/s;
    clampCamera();
},{passive:false});

canvas.addEventListener("pointerdown",(e)=>{
    if (e.button===0) {
        // 前线模式：开始画指挥线
        if (G.frontlineDrawing) {
            canvas.setPointerCapture(e.pointerId);
            activeCapture = e.pointerId;
            G.frontlineDrawingLine = true;
            let r = canvas.getBoundingClientRect();
            let sx = e.clientX - r.left, sy = e.clientY - r.top;
            let [wx, wy] = screenToWorld(sx, sy);
            G.frontlineCmdStart = { x: wx, y: wy };
            G.frontlineCmdEnd = { x: wx, y: wy };
            return;
        }
        canvas.setPointerCapture(e.pointerId);
        activeCapture=e.pointerId;
        isDragging=false;
        dragStartX=e.clientX;dragStartY=e.clientY;
        dragCamStartX=camX;dragCamStartY=camY;
        boxStartX=e.clientX;boxStartY=e.clientY;
        boxSelecting=true;
    } else if (e.button===1) {
        canvas.setPointerCapture(e.pointerId);
        activeCapture=e.pointerId;
        panDragging=true;
        panDragStartX=e.clientX;panDragStartY=e.clientY;
        panDragCamStartX=camX;panDragCamStartY=camY;
        panDragMoved=false;
        e.preventDefault();
    } else if (e.button===2) {
        canvas.setPointerCapture(e.pointerId);
        activeCapture=e.pointerId;
    }
});

canvas.addEventListener("pointermove",(e)=>{
    mouseX=e.clientX;mouseY=e.clientY;
    if (G.frontlineDrawingLine) {
        let r = canvas.getBoundingClientRect();
        let sx = e.clientX - r.left, sy = e.clientY - r.top;
        let [wx, wy] = screenToWorld(sx, sy);
        G.frontlineCmdEnd = { x: wx, y: wy };
        return;
    }
    if (boxSelecting) {
        let dx=e.clientX-dragStartX,dy=e.clientY-dragStartY;
        if (Math.abs(dx)>3||Math.abs(dy)>3) isDragging=true;
        if (isDragging) {
            G.selBox={x1:boxStartX,y1:boxStartY,x2:e.clientX,y2:e.clientY};
            camX=dragCamStartX;camY=dragCamStartY;
        }
    }
    if (panDragging) {
        let dx=e.clientX-panDragStartX,dy=e.clientY-panDragStartY;
        if (Math.abs(dx)>3||Math.abs(dy)>3) panDragMoved=true;
        if (panDragMoved) {
            let s=zoom*PIXELS_PER_DEGREE;
            camX=panDragCamStartX-dx/s;camY=panDragCamStartY+dy/s;
            clampCamera();
        }
    }
    let[wx,wy]=screenToWorld(mouseX,mouseY);
    hoveredProvince=findProvinceAt(wx,wy);
});

canvas.addEventListener("pointerup",(e)=>{
    let w=canvas.width,h=canvas.height;
    if (e.button===0) {
        // 前线模式：完成指挥线绘制
        if (G.frontlineDrawingLine) {
            G.frontlineDrawingLine = false;
            // 部署单位到指挥线
            if (G.frontlineCmdStart && G.frontlineCmdEnd && G.selectedDivisions.length > 0) {
                deployFrontlineUnits(G.selectedDivisions, G.frontlineCmdStart, G.frontlineCmdEnd);
                G.selectedDivisions = [];
            }
            G.frontlineDrawing = false;
            return;
        }
        if (boxSelecting && isDragging) {
            if (G.selBox) {
                G.selectedDivisions=[];
                let x1=Math.min(G.selBox.x1,G.selBox.x2),y1=Math.min(G.selBox.y1,G.selBox.y2);
                let x2=Math.max(G.selBox.x1,G.selBox.x2),y2=Math.max(G.selBox.y1,G.selBox.y2);
                for(let d of G.divisions){
                    if(d.country!==G.playerCountry) continue;
                    let rx=d.rx!==undefined?d.rx:0, ry=d.ry!==undefined?d.ry:0;
                    if(!rx){let dp=G.provinceData[d.province];if(dp&&dp.center){rx=dp.center[0];ry=dp.center[1];}}
                    let[tx,ty]=worldToScreen(rx,ry);
                    if(tx>x1&&tx<x2&&ty>y1&&ty<y2) G.selectedDivisions.push(d.id);
                }
            }
            selectedProvince = null;
            G.selectedProvince = null;
            G.selBox=null; boxSelecting=false; isDragging=false;
            return;
        }
        boxSelecting=false; G.selBox=null;
        if (isDragging) { isDragging=false; return; }

        let r=canvas.getBoundingClientRect();
        let sx=e.clientX-r.left,sy=e.clientY-r.top;

        if (G.activeEvent) {
            let bw=420,bh=220,bx=canvas.width/2-bw/2,by=canvas.height/2-bh/2;
            let opts=G.activeEvent.o||G.activeEvent.options||[];
            for (let i=0;i<opts.length;i++) {
                let oy=by+bh-65+i*30;
                if (sx>bx+20&&sx<bx+bw-20&&sy>oy&&sy<oy+26) { resolveEvent(i);isDragging=false;return; }
            }
        }

        if (handleUIClick(sx,sy)) { isDragging=false; return; }
        if (handleTabClick(sx, sy)) { isDragging=false; return; }

        let clickedUnit = findUnitAtScreen(sx, sy);
        if (clickedUnit) {
            if (e.shiftKey) {
                let idx=G.selectedDivisions.indexOf(clickedUnit.id);
                if (idx>=0) G.selectedDivisions.splice(idx,1);
                else G.selectedDivisions.push(clickedUnit.id);
            } else {
                let now = Date.now();
                if (G.lastClickedUnitId === clickedUnit.id && now - G.lastClickTime < 400) {
                    G.selectedDivisions = G.divisions
                        .filter(d => d.country === G.playerCountry && d.type === clickedUnit.type)
                        .map(d => d.id);
                    addGameLog("选中所有" + (UNIT_TYPES[clickedUnit.type]?.label || clickedUnit.type));
                } else {
                    G.selectedDivisions = [clickedUnit.id];
                }
                G.lastClickTime = now;
                G.lastClickedUnitId = clickedUnit.id;
            }
            selectedProvince=null;
            G.selectedProvince=null;
            isDragging=false; return;
        }

        let _panelTop = h - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT - TAB_PANEL_HEIGHT;
        if (G.activeTab && sy > _panelTop && sy < h - BOTTOM_BAR_HEIGHT) { isDragging=false; return; }

        let[wx,wy]=screenToWorld(sx,sy);

        // 检测城市点击（优先于省份）
        let clickedCity = findCityAtScreen(sx, sy);
        if (clickedCity) {
            let cityOwner = clickedCity.country;
            // 驻军模式：选择城市作为驻军目标
            if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
                let cityProv = null;
                for (let p of PROVINCES) {
                    if (p.x >= 900) continue;
                    for (let ring of p.r) {
                        if (ring.length >= 3 && isPointInPolygon(clickedCity.lon, clickedCity.lat, ring)) {
                            cityProv = p.id; break;
                        }
                    }
                    if (cityProv) break;
                }
                if (cityProv) cityOwner = G.provinceOwners[cityProv] || clickedCity.country;
                // 分配驻军——走过去，不瞬移
                let cityData = G.cities[clickedCity.id];
                let cityHp = cityData ? cityData.hp : 50;
                for (let uid of G.garrisonUnitIds) {
                    let d = G.divisions.find(x => x.id === uid);
                    if (d && d.strength > 0) {
                        // 海军不能驻守城市
                        if (d.type === 'navy') continue;
                        if (!G.patrolTargets[d.id]) G.patrolTargets[d.id] = [];
                        G.patrolTargets[d.id] = [cityOwner === G.playerCountry ? '' : clickedCity.id];
                        d.garrisonCityId = clickedCity.id;
                        d.garrisonCityLon = clickedCity.lon;
                        d.garrisonCityLat = clickedCity.lat;
                        d.patrolChase = 0; d.patrolFired = false;
                        // 走过去，不瞬移
                        d.state = 'moving';
                        d.targetX = clickedCity.lon + (Math.random() - 0.5) * 0.03;
                        d.targetY = clickedCity.lat + (Math.random() - 0.5) * 0.03;
                        d.path = null; d.pathIndex = 0;
                    }
                }
                addGameLog(G.garrisonUnitIds.length + " 单位前往驻守 " + clickedCity.name);
                G.garrisonMode = false;
                G.garrisonUnitIds = [];
                isDragging = false;
                return;
            }
            // 正常城市点击
            let cityProv = null;
            for (let p of PROVINCES) {
                if (p.x >= 900) continue;
                for (let ring of p.r) {
                    if (ring.length >= 3 && isPointInPolygon(clickedCity.lon, clickedCity.lat, ring)) {
                        cityProv = p.id; break;
                    }
                }
                if (cityProv) break;
            }
            if (cityProv) cityOwner = G.provinceOwners[cityProv] || clickedCity.country;
            G.selectedCity = { ...clickedCity, owner: cityOwner, provinceId: cityProv };
            selectedProvince = null;
            G.selectedProvince = null;
            G.diplomacyFocus = null;
            isDragging = false;
            return;
        }

        G.selectedCity = null;

        // 驻军模式：海军驻守海军节点
        if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
            let clickedNavalBase = findNavalBaseAtScreen(sx, sy);
            if (clickedNavalBase) {
                // 只处理海军单位
                let navalCount = 0;
                let nodeId = null;
                for (let id in G.navyNodes) {
                    let node = G.navyNodes[id];
                    if (node.country === G.playerCountry &&
                        Math.abs(node.lon - clickedNavalBase.lon) < 0.01 &&
                        Math.abs(node.lat - clickedNavalBase.lat) < 0.01) {
                        nodeId = id; break;
                    }
                }
                for (let uid of G.garrisonUnitIds) {
                    let d = G.divisions.find(x => x.id === uid);
                    if (d && d.strength > 0 && d.type === 'navy') {
                        if (!G.patrolTargets[d.id]) G.patrolTargets[d.id] = [];
                        G.patrolTargets[d.id] = [clickedNavalBase.name || clickedNavalBase.region];
                        d.garrisonCityId = null;
                        d.garrisonCityLon = clickedNavalBase.lon;
                        d.garrisonCityLat = clickedNavalBase.lat;
                        d.patrolChase = 0; d.patrolFired = false;
                        d.state = 'moving';
                        d.targetX = clickedNavalBase.lon;
                        d.targetY = clickedNavalBase.lat;
                        d.path = null; d.pathIndex = 0;
                        navalCount++;
                    }
                }
                if (navalCount > 0) {
                    addGameLog(navalCount + " 艘海军前往驻守 " + (clickedNavalBase.name || "海军基地"));
                }
                G.garrisonMode = false;
                G.garrisonUnitIds = [];
                isDragging = false;
                return;
            }
        }

        selectedProvince=findProvinceAt(wx,wy);
        G.selectedProvince=selectedProvince;
        G.diplomacyFocus = null;

        if (selectedProvince) {
            // Just show province info, don't auto-select
        } else G.selectedDivisions=[];
    }

    if (e.button===1) { panDragging=false; }

    if (e.button===2 && e.pointerId===activeCapture) {
        try { canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
        activeCapture=null; return;
    }

    if (e.pointerId===activeCapture && e.button!==2) {
        try { canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
        activeCapture=null;
    }
});

// ===== Right-click: Move / Attack =====
canvas.addEventListener("contextmenu",(e)=>{
    e.preventDefault();
    if (panDragMoved||panDragging) { panDragMoved=false; panDragging=false; return; }
    if (G.selectedDivisions.length===0||G.activeEvent) return;
    let r=canvas.getBoundingClientRect();
    let sx=e.clientX-r.left,sy=e.clientY-r.top;
    let[wx,wy]=screenToWorld(sx,sy);

    let enemyTarget=null;
    for(let d of G.divisions){
        if(d.country===G.playerCountry) continue;
        let rx=d.rx!==undefined?d.rx:0; let ry=d.ry!==undefined?d.ry:0;
        if(!rx){let dp=G.provinceData[d.province];if(dp&&dp.center){rx=dp.center[0];ry=dp.center[1];}}
        let[ux,uy]=worldToScreen(rx,ry);
        if(Math.hypot(sx-ux,sy-uy)<16){enemyTarget=d;break;}
    }

    if (enemyTarget) {
        for(let did of G.selectedDivisions){
            let d=G.divisions.find(x=>x.id===did);
            if(d){
                d.focusTarget = enemyTarget.id;
                d.focusFactory = null;
                d.focusCity = null;
                // Don't need to move if we're just locking — stay in place and fire
                d.state = 'idle';
                d.targetX = null;
                d.targetY = null;
            }
        }
        addGameLog("集火目标已标记");
        return;
    }

    // Check factory target
    if (G.factories) {
        for (let fact of G.factories) {
            if (!fact || fact.hp <= 0) continue;
            let [fx, fy] = worldToScreen(fact.rx, fact.ry);
            if (Math.hypot(sx - fx, sy - fy) < 16) {
                for (let did of G.selectedDivisions) {
                    let d = G.divisions.find(x => x.id === did);
                    if (d) { d.focusFactory = fact.id; d.focusTarget = null; d.focusCity = null; }
                }
                addGameLog("集火工厂已标记");
                return;
            }
        }
    }

    // Check city target (enemy cities)
    if (G.cities) {
        for (let cityId in G.cities) {
            let city = G.cities[cityId];
            if (!city || city.hp <= 0) continue;
            if (city.owner === G.playerCountry) continue;
            if (!canEngage(G.playerCountry, city.owner)) continue;
            let [cx, cy] = worldToScreen(city.lon, city.lat);
            if (Math.hypot(sx - cx, sy - cy) < 18) {
                for (let did of G.selectedDivisions) {
                    let d = G.divisions.find(x => x.id === did);
                    if (d) { d.focusCity = cityId; d.focusTarget = null; d.focusFactory = null; }
                }
                addGameLog("集火城市 " + city.name + " 已标记");
                return;
            }
        }
    }

    let best=null,bestDist=999;
    for(let pid in G.provinceData){
        let pp=G.provinceData[pid];if(!pp||!pp.center)continue;
        let dist=Math.hypot(wx-pp.center[0],wy-pp.center[1]);
        if(dist<bestDist){best=pid;bestDist=dist;}
    }

    // Check if click target is in a valid province for the first selected unit
    let clickProv = getProvinceAt(wx, wy);
    let firstDiv = G.selectedDivisions.length > 0 ? G.divisions.find(x => x.id === G.selectedDivisions[0]) : null;
    if (firstDiv && clickProv && clickProv !== best) {
        // Click is inside a specific province — use that as target if valid
        if (canEnterProvince(clickProv, firstDiv.country)) {
            best = clickProv;
        }
    }

    for(let did of G.selectedDivisions){
        let d=G.divisions.find(x=>x.id===did);
        if(!d) continue;
        d.path = null; d.pathIndex = 0;

        // Determine final target: snap to province center if target province is restricted (land only)
        let targetProv = getProvinceAt(wx, wy);
        let finalX = wx, finalY = wy;
        if (d.type !== 'navy' && targetProv && !canEnterProvince(targetProv, d.country) && best && G.provinceData[best] && G.provinceData[best].center) {
            // Target province is restricted — snap to nearest valid province center
            finalX = G.provinceData[best].center[0];
            finalY = G.provinceData[best].center[1];
        }
        // Save final target for path recalculation
        d._finalTargetX = finalX; d._finalTargetY = finalY;
        d._finalTargetProv = targetProv;

        if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) {
            addGameLog("海军在陆地上无法移动");
            continue;
        }

        // Province-based pathfinding for land units
        if (d.type !== 'navy' && typeof findProvincePath === 'function') {
            let startProv = getProvinceAt(d.rx, d.ry);
            let endProv = getProvinceAt(finalX, finalY);
            if (startProv && endProv && startProv !== endProv) {
                let provPath = findProvincePath(startProv, endProv, d.country);
                if (provPath && provPath.length > 0) {
                    // Convert province path to coordinate waypoints (skip starting province)
                    let path = [];
                    for (let i = 1; i < provPath.length; i++) {
                        let pid = provPath[i];
                        let p = PROVINCES.find(pp => pp.id === pid);
                        if (p && p.x < 900) path.push({ x: p.x, y: p.y });
                    }
                    if (path.length > 0) {
                        d.path = path; d.pathIndex = 0;
                        d.targetX = path[0].x; d.targetY = path[0].y;
                    } else {
                        d.targetX = finalX; d.targetY = finalY;
                    }
                } else {
                    d.targetX = finalX; d.targetY = finalY;
                }
            } else {
                d.targetX = finalX; d.targetY = finalY;
            }
        } else {
            d.targetX = finalX; d.targetY = finalY;
        }
        d.state = "moving";
        // 单艘海军脱离阵型：右键移动时自动解除一字阵
        if (G.selectedDivisions.length === 1 && d.formation === 'line') {
            d.formation = null;
            d.formationGroup = null;
        }
        // New move command cancels any existing focus target
        d.focusTarget = null;
        d.focusFactory = null;
        d.focusCity = null;
        // Add green move line
        if (!G.moveLines) G.moveLines = [];
        G.moveLines.push({fromX: d.rx, fromY: d.ry, toX: wx, toY: wy, startTime: Date.now()});
    }
    addGameLog("行军");
});

document.addEventListener("keydown",(e)=>{
    if ((e.key==="r"||e.key==="R") && !G.gameOver) {camX=10;camY=51;zoom=0.5;selectedProvince=null;G.selectedDivisions=[];clampCamera();}
    if (e.key==="Escape") { G.selectedDivisions=[]; selectedProvince=null; G.selectedProvince=null; G.selectedCity=null; G.navyProductionMode=false; G.selectedNavyNode=null; G.activeTab=null; _showNavyGuide=false; _navyGuideScroll=0; G.garrisonMode=false; G.garrisonUnitIds=[]; }
    if ((e.key==="r"||e.key==="R") && G.gameOver) { resetGame(); }

    if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        let num = parseInt(e.key);
        if (G.selectedDivisions.length > 0) {
            G.armyGroups[num] = [...G.selectedDivisions];
            addGameLog("编队 ["+num+"] 已保存 ("+G.selectedDivisions.length+" 单位)");
        } else {
            G.armyGroups[num] = [];
            addGameLog("编队 ["+num+"] 已清空");
        }
        e.preventDefault();
    }
    if (!e.ctrlKey && e.key >= "1" && e.key <= "9" && !e.shiftKey) {
        let num = parseInt(e.key);
        if (G.armyGroups[num] && G.armyGroups[num].length > 0) {
            G.armyGroups[num] = G.armyGroups[num].filter(id => G.divisions.some(d => d.id === id));
            if (G.armyGroups[num].length > 0) {
                G.selectedDivisions = [...G.armyGroups[num]];
                selectedProvince = null; G.selectedProvince = null;
                addGameLog("选中编队 ["+num+"] ("+G.selectedDivisions.length+" 单位)");
            }
        }
        e.preventDefault();
    }

    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        if (G.selectedDivisions.length > 0) {
            for (let did of G.selectedDivisions) {
                let d = G.divisions.find(x => x.id === did);
                if (d && d.province) {
                    G.patrolTargets[d.id] = [d.province];
                }
            }
            addGameLog(G.selectedDivisions.length + " 单位已设置驻守");
        }
        e.preventDefault();
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        for (let did of G.selectedDivisions) {
            delete G.patrolTargets[did];
            delete G.patrolIndex[did];
        }
        addGameLog("清除巡逻");
        e.preventDefault();
    }
});

// ===== Game Loop =====
let lastTime=0;
let loopSpeed=0;
let fpsFrameCount=0, fpsLastTime=0, fpsDisplay=0;
function gameLoop(timestamp) {
    try {
    if (lastTime===0) lastTime=timestamp;
    let dt=Math.min(timestamp-lastTime,200);
    lastTime=timestamp;
    // FPS tracking
    fpsFrameCount++;
    if (!fpsLastTime) fpsLastTime = timestamp;
    if (timestamp - fpsLastTime >= 1000) {
        fpsDisplay = Math.round(fpsFrameCount * 1000 / (timestamp - fpsLastTime));
        window._fps = fpsDisplay;
        fpsFrameCount = 0;
        fpsLastTime = timestamp;
    }
    if (dt>0) {
        let spd=[2,4,8,16,32,64,128][G.speed]||1;
        loopSpeed=spd;
        let dayMs=12000/spd;
        let daysVis=dt/dayMs;
        updateGame(dt);checkEvents();
        // Single sub-tick at all speeds for performance
        let subticks = 1;
        let subDays = daysVis / subticks;
        for (let s = 0; s < subticks; s++) {
            moveUnits(subDays);
            fireUnits(subDays);
            updateProjectiles(subDays);
        }
    } else {
        moveUnits(0);fireUnits(0);updateProjectiles(0.05);
    }
    render();
    } catch(e) {console.error("Loop:",e);try{ctx.fillStyle="red";ctx.font="14px monospace";ctx.fillText("ERR:"+e.message,10,60);}catch(e2){}}
    requestAnimationFrame(gameLoop);
}
function resetGame() {
    location.reload();
}
camX=10;camY=51;zoom=0.5;
addGameLog("Game started");
requestAnimationFrame(gameLoop);
console.log("game_core initialized OK");
