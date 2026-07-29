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
            id: G.divIdCounter++, name: country + ' ' + G.divIdCounter + '.',
            type: 'navy', province: bestProv, country: country,
            strength: 100, maxStrength: 100,
            rx: seaPos[0], ry: seaPos[1],
            state: 'idle', targetX: null, targetY: null,
            attackTarget: null, focusTarget: null, focusFactory: null,
            fireCooldown: 0, exp: 0,
        });
        pd.garrison = (pd.garrison || 0) + 1;
        cData.divCount = (cData.divCount || 0) + 1;
    }
}

function findSeaPosition(lon, lat) {
    // Return a position near the port center
    return [lon + (Math.random() - 0.5) * 0.08, lat + (Math.random() - 0.5) * 0.08];
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
                    G.divisions.push({
                        id: G.divIdCounter++, name: '(' + (COUNTRY_CN[node.country] || node.country) + ')' + ship.name,
                        type: 'navy', province: bestProv, country: node.country,
                        strength: 100, maxStrength: 100,
                        rx: seaPos[0], ry: seaPos[1],
                        state: 'idle', targetX: null, targetY: null,
                        attackTarget: null, focusTarget: null, focusFactory: null,
                        fireCooldown: 0, exp: 0,
                        shipId: ship.id,
                    });
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
    let speed=[1,2,4,8,16,32,64][G.speed]||1;
    let dayMs=12000/speed;
    let days=dtMs/dayMs;
    if (days<0.001) days=0.001;
    G.tick++;
    G.date.setTime(G.date.getTime()+days*86400000);
    if (G.tick%Math.max(1,Math.floor(3/days))===0) updateEconomy(days);
    updateDivisions(days);
    updateProjectiles(days);
    moveUnits(days);
    fireUnits(days);
    updatePatrol(days);
    if (G.tick%Math.max(1,Math.floor(5/days))===0) updateAI();
    if (G.tick%Math.max(1,Math.floor(8/days))===0) updateAIOccupation();
    if (G.tick%Math.max(1,Math.floor(3/days))===0) updateFrontlineAdvance(days);
    if (G.tick%Math.max(1,Math.floor(2/days))===0) updateWarScore();
    checkSurrender();

    // Process navy node upgrade timers
    if (typeof G.navyNodes !== 'undefined') {
        let upgraded = false;
        let speed = [1,2,4,8,16,32,64][G.speed] || 1;
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
    if (prov && prov.x >= 900) return false;
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
    let separation = 0.02;
    let effectiveDays = Math.min(days, 0.02);
    effectiveDays = Math.max(effectiveDays, 0.001);
outer: for (let d of G.divisions) {
        if (d.rx===undefined) {
            let c=G.provinceData[d.province];
            if(c&&c.center){d.rx=c.center[0];d.ry=c.center[1];}
        }
        if ((d.state==='moving')&&d.targetX!==null) {
            let ut=UNIT_TYPES[d.type]||UNIT_TYPES.infantry;
            let speed=ut.speed*effectiveDays;
            speed *= 2.5;

            // Navy: must be at sea
            if (d.type === 'navy') {
                if (typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) {
                    d.state = 'idle'; d.targetX = null; d.targetY = null;
                    addGameLog("海军在陆地上无法移动");
                    continue;
                }
                speed *= 2;
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
            let dx=d.rx-e.rx;let dy=d.ry-e.ry;
            let dist=Math.hypot(dx,dy);
            if(dist<separation&&dist>0.001){
                let push=(separation-dist)/separation*0.01;
                let nx=dx/dist;let ny=dy/dist;
                d.rx+=nx*push;d.ry+=ny*push;
                e.rx-=nx*push;e.ry-=ny*push;
            }
        }
    }
}

function fireUnits(days) {
    for (let d of G.divisions) {
        let ut=UNIT_TYPES[d.type];
        if(!ut) continue;
        d.fireCooldown=Math.max(0,(d.fireCooldown||0)-days);
        if(d.fireCooldown>0) continue;

        // Navy on land cannot attack
        if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) continue;

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
                if(dist<ut.range) fireTarget = ft;
            } else {
                d.focusTarget=null;
            }
        }

        // Auto-shoot: scan for any enemy in range (both AI and player)
        if (!fireTarget) {
            let bestE=null,bestD=999;
            for(let e of G.divisions){
                if(e.country===d.country||e.strength<=0) continue;
                let atWarWith=canEngage(d.country, e.country);
                if(!atWarWith) continue;
                let dist=Math.hypot(d.rx-e.rx,d.ry-e.ry);
                if(dist<ut.range&&dist<bestD){bestE=e;bestD=dist;}
            }
            if(bestE) fireTarget = bestE;
        }

        // Auto-lock scan (AI only — track far enemies visually)
        if (!isPlayer && !lockTarget) {
            let bestL=null,bestDL=999;
            for(let e of G.divisions){
                if(e.country===d.country||e.strength<=0) continue;
                let atWarWith=canEngage(d.country, e.country);
                if(!atWarWith) continue;
                let dist=Math.hypot(d.rx-e.rx,d.ry-e.ry);
                if(dist<bestDL){bestL=e;bestDL=dist;}
            }
            if(bestL) lockTarget = bestL;
        }

        // Nothing at all to engage — clear focus
        if(!lockTarget && !fireTarget){d.focusTarget=null;continue;}
        // If we have a lock but no fire target: move toward target to get in range
        // (Only for AI units, or player units with an explicit right-click focus target)
        if(!fireTarget) {
            let shouldMove = d.country !== G.playerCountry;
            if (!shouldMove && d.focusTarget) {
                let ft = G.divisions.find(x=>x.id===d.focusTarget);
                if(ft) shouldMove = true;
            }
            if (shouldMove) {
                let moveTarget = d.focusTarget ? (G.divisions.find(x=>x.id===d.focusTarget) || lockTarget) : lockTarget;
                let dx=moveTarget.rx-d.rx,dy=moveTarget.ry-d.ry;
                let dist=Math.hypot(dx,dy);
                let desiredDist = ut.range * 0.9;
                if (dist > desiredDist) {
                    d.state="moving";
                    d.targetX = d.rx + (dx/dist) * (dist - desiredDist);
                    d.targetY = d.ry + (dy/dist) * (dist - desiredDist);
                } else if (d.state === 'moving') {
                    d.state='idle'; d.targetX=null; d.targetY=null;
                }
            }
            continue;
        }

        d.fireCooldown=ut.fireRate;
        if (G.patrolTargets[d.id] && d.patrolChase > 0) d.patrolFired = true;

        let targetX=fireTarget.rx;
        let targetY=fireTarget.ry;
        let speed=0.15;
        let dx=targetX-d.rx;
        let dy=targetY-d.ry;
        let travelDist=Math.hypot(dx,dy);
        let isArtillery=d.type==='artillery';
        let arcHeight=isArtillery?0.8:0;
        // Bullet flies full range distance in target direction
        let bulletLife = ut.range / speed;
        let endX = targetX, endY = targetY;
        if (travelDist > 0.01) {
            let nx = dx/travelDist, ny = dy/travelDist;
            endX = d.rx + nx * ut.range;
            endY = d.ry + ny * ut.range;
        }
        G.projectiles.push({
            x:d.rx,y:d.ry,type:d.type,
            life:bulletLife,lifeMax:bulletLife,
            startX:d.rx,startY:d.ry,
            endX:endX,endY:endY,
            arcUp:isArtillery,arcHeight:arcHeight,
            splash:isArtillery?0.05:0.02,
            baseDamage:ut.damage,shooterCountry:d.country,
        });
    }
}

function updateProjectiles(days) {
    G.projectiles=G.projectiles.filter(p=>{
        p.life-=days;
        if(p.life<=0){
            if(p.splash&&p.splash>0){
                let splashRadius=p.splash;
                let splashDamage=p.baseDamage*0.5;
                for(let d of G.divisions){
                    if(d.country===p.shooterCountry) continue;
                    let dist=Math.hypot(p.endX-d.rx,p.endY-d.ry);
                    if(dist<splashRadius){
                        d.strength=Math.max(0,d.strength-splashDamage*(1-(dist/splashRadius)*0.5));
                        if(d.strength<=0){removeDivision(d);addGameLog(d.name+" 被溅射消灭");}
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
        for(let d of G.divisions){
            if(d.country===p.shooterCountry||d.strength<=0) continue;
            if(Math.hypot(p.x-d.rx,p.y-d.ry)<0.03){
                d.strength=Math.max(0,d.strength-p.baseDamage);
                d.hitFlash=6;
                if(d.strength<=0){removeDivision(d);addGameLog(d.name+" 被命中消灭");}
                return false;
            }
        }
        return true;
    });
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

    // City capture
    if (G.cities) {
        for (let cityId in G.cities) {
            let city = G.cities[cityId];
            if (!city || !city.provinceId) continue;
            let attackers = G.divisions.filter(d => {
                if (d.country === city.owner || d.strength <= 0) return false;
                let atWarWith = canEngage(d.country, city.owner);
                if (!atWarWith) return false;
                let dist = Math.hypot(d.rx - city.lon, d.ry - city.lat);
                return dist < 0.1;
            });
            let defenders = G.divisions.filter(d => {
                if (d.country !== city.owner || d.strength <= 0) return false;
                let dist = Math.hypot(d.rx - city.lon, d.ry - city.lat);
                return dist < 0.15;
            });
            if (attackers.length > 0 && defenders.length === 0) {
                city.hp -= attackers.length * 0.5 * days;
                if (city.hp <= 0) {
                    let capturer = attackers[0].country;
                    city.owner = capturer;
                    city.hp = city.maxHp * 0.5;
                    addGameLog(city.name + " 被 " + (COUNTRY_CN[capturer]||capturer) + " 占领");
                }
            } else if (defenders.length > 0 && city.hp < city.maxHp) {
                city.hp = Math.min(city.maxHp, city.hp + 0.2 * days);
            }
        }
    }

    // Province occupation: polygon-based detection
    for (let pid in G.provinceData) {
        let pd = G.provinceData[pid];
        if (!pd) continue;
        if (!pd.originalCountry) pd.originalCountry = pd.country;
        let orig = pd.originalCountry;
        let provPoly = null;
        for (let p of PROVINCES) { if (p.id === pid) { provPoly = p; break; } }
        if (!provPoly) continue;

        let enemyHere = 0, origFriendlyHere = 0;
        let firstEnemy = null;
        for (let d of G.divisions) {
            if (d.strength <= 0) continue;
            let inside = false;
            for (let ring of provPoly.r) {
                if (ring.length >= 3 && isPointInPolygon(d.rx, d.ry, ring)) { inside = true; break; }
            }
            if (!inside) continue;
            if (d.country === orig) { origFriendlyHere++; }
            else {
                let atWarWith = canEngage(d.country, orig);
                if (atWarWith) { enemyHere++; if (!firstEnemy) firstEnemy = d; }
            }
        }

        pd.contested = (enemyHere > 0 && origFriendlyHere > 0);

        // Occupy: enemy present, no original owner troops (even if original country surrendered, occupation stands)
        if (enemyHere > 0 && origFriendlyHere === 0 && firstEnemy && pd.country !== firstEnemy.country) {
            pd.country = firstEnemy.country;
            G.provinceOwners[pid] = firstEnemy.country;
            let provRef = PROVINCES.find(p => p.id === pid);
            if (provRef) provRef.c = firstEnemy.country;
            addGameLog(getProvinceName({id:pid}) + " 被 " + (COUNTRY_CN[firstEnemy.country]||firstEnemy.country) + " 占领");
        }
        // Liberation: only if enemy country hasn't surrendered
        if (enemyHere === 0 && pd.country !== orig && !G.surrendered[pd.country] && !G.surrendered[orig]) {
            pd.country = orig;
            G.provinceOwners[pid] = orig;
            let provRef = PROVINCES.find(p => p.id === pid);
            if (provRef) provRef.c = orig;
            addGameLog(getProvinceName({id:pid}) + " 被 " + (COUNTRY_CN[orig]||orig) + " 光复");
        }
    }

    // Factory damage
    // Factories: only take damage from focused fire (focusFactory), NOT from standing in province
    if (G.factories) {
        for (let i = G.factories.length - 1; i >= 0; i--) {
            let fact = G.factories[i];
            if (!fact || fact.hp <= 0) { G.factories.splice(i, 1); continue; }
            // Find units targeting this factory via focusFactory
            let attackers = 0;
            for (let d of G.divisions) {
                if (d.country === fact.country || d.strength <= 0) continue;
                if (!canEngage(d.country, fact.country)) continue;
                if (d.focusFactory === fact.id) {
                    let dist = Math.hypot(d.rx - fact.rx, d.ry - fact.ry);
                    if (dist < 1.5) attackers++;
                }
            }
            if (attackers > 0) {
                fact.hp -= attackers * 2 * days;
                if (fact.hp <= 0) {
                    let pd = G.provinceData[fact.provinceId];
                    if (pd) pd.factories = Math.max(0, (pd.factories || 1) - 1);
                    addGameLog(getProvinceName({id:fact.provinceId}) + " 的工厂被摧毁");
                    G.factories.splice(i, 1);
                }
            }
        }
    }
}

function processBuildQueue(dtMs) {
    if (!G.playerCountry) return;
    let speed=[1,2,4,8,16,32,64][G.speed]||1;
    let days=dtMs/(12000/speed);
    let q=G.buildQueue||[];
    for(let i=q.length-1;i>=0;i--){
        q[i].days-=days;
        if(q[i].days<=0){
            let pd=G.provinceData[q[i].province];
            if(pd){pd.factories=(pd.factories||0)+1; createFactoryEntity(q[i].province, pd.country || G.provinceOwners[q[i].province]); addGameLog("工厂建成: "+pd.name);}
            q.splice(i,1);
        }
    }
}

function updateEconomy(days) {
    for (let[c,data] of Object.entries(G.countries)) {
        
        let inc=calcCountryIncome(c);
        let exp=(data.divCount||0)*1.5;
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

// ===== Frontline AI behavior for garrisoned units =====
function updateFrontlineAdvance(days) {
    if (!G.frontlines) G.frontlines = {};
    if (!G.frontTargets) G.frontTargets = [];
    // For player: auto-expand targets — captured targets add adjacent enemy neighbors
    let playerEnemies = isCountryAtWar(G.playerCountry) ? getEnemiesOf(G.playerCountry) : [];
    if (playerEnemies && playerEnemies.length && G.frontTargets.length) {
        let newTargets = [];
        for (let tpid of G.frontTargets) {
            let tp = G.provinceData[tpid];
            if (!tp || tp.country === G.playerCountry) {
                // Target captured! Add adjacent enemy neighbors
                for (let pid in G.provinceData) {
                    let p2 = G.provinceData[pid];
                    if (!p2 || p2.country === G.playerCountry || !p2.center) continue;
                    if (!playerEnemies.some(e => e === p2.country)) continue;
                    if (Math.hypot(tp.center[0] - p2.center[0], tp.center[1] - p2.center[1]) < 2.5) {
                        if (!G.frontTargets.includes(pid) && !newTargets.includes(pid)) newTargets.push(pid);
                    }
                }
            }
        }
        for (let n of newTargets) if (!G.frontTargets.includes(n)) G.frontTargets.push(n);
    }
    // Collect frontliners for each country
    let countryFrontliners = {};
    for (let did in G.frontlines) {
        let d = G.divisions.find(x => x.id == did);
        if (!d || d.strength <= 0) continue;
        if (!countryFrontliners[d.country]) countryFrontliners[d.country] = [];
        countryFrontliners[d.country].push(d);
    }
    for (let co in countryFrontliners) {
        if (co === G.playerCountry) continue;
        let units = countryFrontliners[co];
        if (units.length === 0) continue;
        let atWar = isCountryAtWar(co);
        if (!atWar) continue;
        let enemies = getEnemiesOf(co);
        let ownedProvs = getCountryProvinces(co).filter(p => p.center);
        let targetProvs = [];
        // For player: prioritize frontTargets
        if (co === G.playerCountry && G.frontTargets && G.frontTargets.length) {
            for (let tpid of G.frontTargets) {
                let tp = G.provinceData[tpid];
                if (!tp || tp.country === co) continue;
                if (!enemies.some(e => e === tp.country)) continue;
                let enemyPresent = G.divisions.some(d => d.country !== co && d.strength > 0 && d.province === tpid);
                if (!enemyPresent && !targetProvs.some(t => t.id === tpid)) targetProvs.push(tp);
            }
        } else {
            for (let op of ownedProvs) {
                for (let pid2 in G.provinceData) {
                    let p2 = G.provinceData[pid2];
                    if (!p2 || p2.country === co || !p2.center) continue;
                    if (!enemies.some(e => e === p2.country)) continue;
                    if (Math.hypot(op.center[0] - p2.center[0], op.center[1] - p2.center[1]) < 2.5) {
                        let enemyPresent = G.divisions.some(d => d.country !== co && d.strength > 0 && d.province === p2.id);
                        if (!enemyPresent && !targetProvs.some(t => t.id === p2.id)) targetProvs.push(p2);
                    }
                }
            }
        }
        let lostProvs = [];
        for (let pid in G.provinceData) {
            let p = G.provinceData[pid];
            if (!p || !p.originalCountry || !p.center) continue;
            if (p.originalCountry === co && p.country !== co && enemies.includes(p.country)) {
                let friendlyNearby = G.divisions.some(d => d.country === co && d.strength > 0 &&
                    Math.hypot(d.rx - p.center[0], d.ry - p.center[1]) < 3);
                if (!friendlyNearby) lostProvs.push(p);
            }
        }
        for (let u of units) {
            if (u.state === 'moving') continue;
            if (lostProvs.length > 0) {
                let nearest = null, nearDist = 999;
                for (let lp of lostProvs) {
                    let d = Math.hypot(u.rx - lp.center[0], u.ry - lp.center[1]);
                    if (d < nearDist) { nearest = lp; nearDist = d; }
                }
                if (nearest) {
                    u.state = 'moving';
                    u.targetX = nearest.center[0];
                    u.targetY = nearest.center[1];
                    continue;
                }
            }
            if (targetProvs.length > 0) {
                let nearest = null, nearDist = 999;
                for (let tp of targetProvs) {
                    let d = Math.hypot(u.rx - tp.center[0], u.ry - tp.center[1]);
                    if (d < nearDist) { nearest = tp; nearDist = d; }
                }
                if (nearest) {
                    u.state = 'moving';
                    u.targetX = nearest.center[0];
                    u.targetY = nearest.center[1];
                    targetProvs = targetProvs.filter(t => t.id !== nearest.id);
                    continue;
                }
            }
        }
    }
}

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
                                        G.divisions.push({
                                            id: G.divIdCounter++, name: divName,
                                            type: 'navy', province: bestProv, country: co,
                                            strength: 100, maxStrength: 100,
                                            rx: seaPos[0], ry: seaPos[1],
                                            state: 'idle', targetX: null, targetY: null,
                                            attackTarget: null, focusTarget: null, focusFactory: null,
                                            fireCooldown: 0, exp: 0,
                                            shipId: ship.id,
                                        });
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

    // AI PEACE SEEKING: if war score is very negative and losing badly, seek peace
    for (let co of allCountries) {
        if (!isCountryAtWar(co)) continue;
        if (G.surrendered[co] || isGreatPower(co)) continue;
        let enemies = getEnemiesOf(co);
        for (let enemy of enemies) {
            let wsDiff = getWarScoreDiff(co, enemy);
            let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
            if (wsDiff < -50 && myCount < 5 && Math.random() < 0.15) {
                let reparations = Math.min(Math.floor(Math.abs(wsDiff) * 1.5), Math.floor((cs[co]?.treasury || 0) * 0.5));
                makePeace(co, enemy, reparations);
                addGameLog((COUNTRY_CN[co]||co) + "因战况不利向" + (COUNTRY_CN[enemy]||enemy) + "求和并支付赔款");
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
}

// ===== Frontline deployment and overlay =====
function deployFrontlineToProvinces(divIds, targetProvIds) {
    try {
        let units = divIds.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
        if (units.length === 0 || targetProvIds.length === 0) return;
        if (!G.frontlines) G.frontlines = {};
        // For each target (enemy province), find all adjacent friendly provinces
        let deploySpots = [];
        for (let tpid of targetProvIds) {
            let tp = G.provinceData[tpid];
            if (!tp || !tp.center) continue;
            for (let pid in G.provinceData) {
                let pp = G.provinceData[pid];
                if (!pp || pp.country !== G.playerCountry || !pp.center) continue;
                if (Math.hypot(pp.center[0] - tp.center[0], pp.center[1] - tp.center[1]) < 2.5) {
                    let key = pid + '|' + tpid;
                    if (!deploySpots.some(s => s.key === key)) deploySpots.push({ pid, tpid, center: pp.center, key });
                }
            }
        }
        if (deploySpots.length === 0) { addGameLog("目标省份没有邻接的己方省份"); return; }
        for (let i = 0; i < units.length; i++) {
            let d = units[i];
            let spot = deploySpots[i % deploySpots.length];
            let targetPd = G.provinceData[spot.tpid];
            if (!targetPd || !targetPd.center) continue;
            d.state = "moving";
            d.targetX = spot.center[0] + (Math.random() - 0.5) * 0.04;
            d.targetY = spot.center[1] + (Math.random() - 0.5) * 0.04;
            G.frontlines[d.id] = spot.tpid;
        }
        addGameLog("前线部署: " + units.length + " 单位已布置到 " + deploySpots.length + " 个集结点");
    } catch(e) { console.error("deployToProvinces:", e); }
}

function drawFrontlineOverlay() {
    if (!G.frontlineDrawing) return;
    if (!G.playerCountry) return;
    if (!G.frontTargets) G.frontTargets = [];
    let enemies = getEnemiesOf(G.playerCountry);
    if (!enemies || !enemies.length) return;
    let playerProvs = getCountryProvinces(G.playerCountry).filter(p => p.center);
    ctx.save();
    // Draw enemy border provinces: red unselected, green selected
    let drawnEnemy = new Set();
    for (let pp of playerProvs) {
        for (let pid in G.provinceData) {
            let p2 = G.provinceData[pid];
            if (!p2 || p2.country === G.playerCountry || !p2.center) continue;
            if (!enemies.some(e => e === p2.country)) continue;
            if (Math.hypot(pp.center[0] - p2.center[0], pp.center[1] - p2.center[1]) >= 2.5) continue;
            if (drawnEnemy.has(pid)) continue;
            drawnEnemy.add(pid);
            let epoly = PROVINCES.find(p => p.id === pid);
            if (!epoly) continue;
            let isTarget = G.frontTargets.includes(pid);
            for (let ring of epoly.r) {
                if (ring.length < 3) continue;
                ctx.beginPath();
                let first = ring[0];
                ctx.moveTo(...worldToScreen(first[0], first[1]));
                for (let i = 1; i < ring.length; i++) ctx.lineTo(...worldToScreen(ring[i][0], ring[i][1]));
                ctx.closePath();
                ctx.strokeStyle = isTarget ? "rgba(80,255,80,0.9)" : "rgba(255,60,60,0.7)";
                ctx.lineWidth = isTarget ? 4 : 3;
                ctx.stroke();
            }
        }
    }
    // Also highlight friendly border provinces with blue
    let drawnFriendly = new Set();
    for (let pp of playerProvs) {
        let isBorder = false;
        for (let pid in G.provinceData) {
            let p2 = G.provinceData[pid];
            if (!p2 || p2.country === G.playerCountry || !p2.center) continue;
            if (!enemies.some(e => e === p2.country)) continue;
            if (Math.hypot(pp.center[0] - p2.center[0], pp.center[1] - p2.center[1]) < 2.5) { isBorder = true; break; }
        }
        if (!isBorder) continue;
        if (drawnFriendly.has(pp.id)) continue;
        drawnFriendly.add(pp.id);
        let ppoly = PROVINCES.find(p => p.id === pp.id);
        if (!ppoly) continue;
        for (let ring of ppoly.r) {
            if (ring.length < 3) continue;
            ctx.beginPath();
            let first = ring[0];
            ctx.moveTo(...worldToScreen(first[0], first[1]));
            for (let i = 1; i < ring.length; i++) ctx.lineTo(...worldToScreen(ring[i][0], ring[i][1]));
            ctx.closePath();
            ctx.strokeStyle = "rgba(60,140,255,0.4)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
    ctx.restore();
}

function updatePatrol(days) {
    for (let d of G.divisions) {
        if (!G.patrolTargets[d.id] || G.patrolTargets[d.id].length === 0) continue;
        let homeProvId = G.patrolTargets[d.id][0];
        let homeProv = G.provinceData[homeProvId];
        if (!homeProv || !homeProv.center) continue;
        if (d.state === 'moving') continue;

        if (d.patrolChase === undefined) d.patrolChase = 0;
        if (d.patrolFired === undefined) d.patrolFired = false;

        let provPoly = PROVINCES.find(p => p.id === homeProvId);

        // Find enemy inside home province
        let enemyInProvince = null;
        if (provPoly) {
            for (let e of G.divisions) {
                if (e.country === d.country || e.strength <= 0) continue;
                if (!canEngage(d.country, e.country)) continue;
                for (let ring of provPoly.r) {
                    if (ring.length >= 3 && isPointInPolygon(e.rx, e.ry, ring)) {
                        enemyInProvince = e; break;
                    }
                }
                if (enemyInProvince) break;
            }
        }

        if (enemyInProvince) {
            // Engage enemy in province, reset chase timer
            d.patrolChase = 3;
            d.patrolFired = false;
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            let dx = enemyInProvince.rx - d.rx, dy = enemyInProvince.ry - d.ry;
            let dist = Math.hypot(dx, dy);
            let desiredDist = ut.range * 0.9;
            if (dist > desiredDist) {
                let tx = d.rx + (dx/dist) * (dist - desiredDist);
                let ty = d.ry + (dy/dist) * (dist - desiredDist);
                d.state = 'moving'; d.targetX = tx; d.targetY = ty;
            }
            continue;
        }

        // No enemy in province: chase or return
        if (d.patrolChase > 0) {
            d.patrolChase -= days;

            // Chase nearest enemy
            let nearestEnemy = null, bestDist = 999;
            for (let e of G.divisions) {
                if (e.country === d.country || e.strength <= 0) continue;
                if (!canEngage(d.country, e.country)) continue;
                let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
                if (dist < bestDist) { nearestEnemy = e; bestDist = dist; }
            }

            if (nearestEnemy) {
                let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                let dx = nearestEnemy.rx - d.rx, dy = nearestEnemy.ry - d.ry;
                let dist = Math.hypot(dx, dy);
                let desiredDist = ut.range * 0.9;
                if (dist > desiredDist) {
                    d.state = 'moving';
                    d.targetX = d.rx + (dx/dist) * (dist - desiredDist);
                    d.targetY = d.ry + (dy/dist) * (dist - desiredDist);
                } else {
                    if (d.state === 'moving') { d.state = 'idle'; d.targetX = null; d.targetY = null; }
                    d.patrolFired = true;
                }
            }

            if (d.patrolChase <= 0 && !d.patrolFired) {
                // Chase expired without firing: give up, return home
                d.patrolChase = 0;
                let distToHome = Math.hypot(d.rx - homeProv.center[0], d.ry - homeProv.center[1]);
                if (distToHome > 0.05) {
                    d.state = 'moving';
                    d.targetX = homeProv.center[0];
                    d.targetY = homeProv.center[1];
                }
            }
        } else {
            // No chase: return to home center
            let distToHome = Math.hypot(d.rx - homeProv.center[0], d.ry - homeProv.center[1]);
            if (distToHome > 0.05) {
                d.state = 'moving';
                d.targetX = homeProv.center[0];
                d.targetY = homeProv.center[1];
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

function checkSurrender() {
    for (let co in G.countries) {
        if (G.surrendered[co]) continue;
        let cd = G.countries[co];
        if (!cd) continue;
        let capitalCities = Object.values(G.cities).filter(c => c.country === co && c.isCapital);
        let capitalLost = capitalCities.length > 0 && capitalCities.some(c => {
            let owner = G.provinceOwners[c.provinceId];
            return owner !== co;
        });
        let totalProvinces = Object.values(G.provinceData).filter(p => (p.originalCountry || p.country) === co).length;
        let ownedProvinces = Object.values(G.provinceData).filter(p => p.country === co).length;
        let lossPercent = totalProvinces > 0 ? (totalProvinces - ownedProvinces) / totalProvinces : 0;

        if (capitalLost && lossPercent > 0.7 && !isGreatPower(co)) {
            G.surrendered[co] = true;
            // When a country surrenders, all its occupied provinces stay with the occupier permanently
            // (originalCountry is preserved for reference but province ownership doesn't revert)
            G.newsBanner = (COUNTRY_CN[co]||co) + " 宣布投降！";
            G.newsTimer = 400;
            addGameLog((COUNTRY_CN[co]||co) + " 战败投降！");
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

    let _barY = h - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT - TAB_PANEL_HEIGHT - 50;

    // 城市操作栏点击
    if (G.selectedCity && my > _barY && my < _barY + 40) {
        let city = G.selectedCity;
        if (city.owner === G.playerCountry) {
            let types = [];
            if (isMajorCity(city.id)) types.push({id:'build_factory', label:'建工厂', cost:50});
            types.push({id:'infantry', label:'步兵', cost:50});
            types.push({id:'engineer', label:'工兵', cost:70});
            types.push({id:'cavalry', label:'骑兵', cost:80});
            types.push({id:'artillery', label:'炮兵', cost:120});
            if (NAVAL_BASES && NAVAL_BASES.some(nb => nb.country === G.playerCountry && Math.hypot(nb.lon - city.lon, nb.lat - city.lat) < 3)) {
                types.push({id:'navy', label:'海军', cost:500});
            }
            let wide = types.length * 105 + 20;
            let startX = w / 2 - wide / 2;
            for (let i = 0; i < types.length; i++) {
                let t = types[i];
                let bx = startX + i * 105;
                let can = G.countries[G.playerCountry] && G.countries[G.playerCountry].treasury >= t.cost;
                if (mx > bx && mx < bx + 100 && my > _barY && my < _barY + 30 && can) {
                    if (t.id === 'build_factory') {
                        // 建造工厂
                        if (!G.buildQueue) G.buildQueue = [];
                        let cityFactories = CITY_FACTORIES[city.id] || 0;
                        G.countries[G.playerCountry].treasury -= 50;
                        G.buildQueue.push({ province: city.provinceId, days: 10, cityId: city.id });
                        addGameLog("开始在" + city.name + "建造工厂 (当前" + cityFactories + "座)");
                        return true;
                    }
                    // 训练部队
                    let d = createDivision(city.provinceId, G.playerCountry, t.id);
                    if (d) {
                        // 将部队放在城市附近
                        d.rx = city.lon + (Math.random() - 0.5) * 0.05;
                        d.ry = city.lat + (Math.random() - 0.5) * 0.05;
                        addGameLog("在" + city.name + "训练了" + (UNIT_TYPES[t.id]?.label || t.id));
                    }
                    return true;
                }
            }
        }
        return false;
    }

    // Sidebar buttons — ONLY process buttons that match their id
    if (window._sibBtns) {
        for (let b of window._sibBtns) {
            if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                if (b.enabled === false) continue;
                // Patrol/garrison buttons: no selectedProvince required
                if (b.id === "patrol_add") {
                    for (let did of G.selectedDivisions) {
                        let d = G.divisions.find(x => x.id === did);
                        if (d && d.province) {
                            if (!G.patrolTargets[d.id]) G.patrolTargets[d.id] = [];
                            G.patrolTargets[d.id] = [d.province];
                            d.state = 'idle'; d.targetX = null; d.targetY = null;
                            d.patrolChase = 0; d.patrolFired = false;
                        }
                    }
                    addGameLog(G.selectedDivisions.length + " 单位已设置驻守");
                    return true;
                }
                if (b.id === "patrol_remove") {
                    for (let did of G.selectedDivisions) {
                        delete G.patrolTargets[did];
                        delete G.patrolIndex[did];
                    }
                    addGameLog("已取消巡逻");
                    return true;
                }
                let co = selectedProvince ? G.provinceOwners[selectedProvince.id] : null;
                let pc = G.playerCountry;
                // Frontline button: no selectedProvince needed
                if (b.id === "frontline") {
                    if (G.frontlineDrawing) {
                        if (G.frontTargets && G.frontTargets.length > 0) {
                            deployFrontlineToProvinces(G.selectedDivisions, G.frontTargets);
                            G.frontlineDrawing = false;
                            G.selectedDivisions = [];
                        } else {
                            G.frontlineDrawing = false;
                            G.frontTargets = [];
                            addGameLog("前线已取消");
                        }
                    } else {
                        if (G.selectedDivisions.length === 0) {
                            addGameLog("请先选中要部署的部队");
                        } else {
                            G.frontlineDrawing = true;
                            G.frontTargets = [];
                            addGameLog("点击敌国边境省份标记为进攻目标(红变绿)，再点前线按钮部署");
                        }
                    }
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
                    let wsDiff = getWarScoreDiff(pc, co);
                    let reparations = 0;
                    if (wsDiff > 20) {
                        // 大胜 → 向对方索要赔款
                        let maxRep = Math.floor(G.countries[co].treasury * 0.6);
                        reparations = Math.min(maxRep, Math.floor(Math.abs(wsDiff) * 2));
                        addGameLog("迫使" + (COUNTRY_CN[co]||co) + "支付" + reparations + "战争赔款");
                    } else if (wsDiff < -20) {
                        // 劣势 → 支付赔款求和
                        let maxRep = Math.floor(G.countries[pc].treasury * 0.4);
                        reparations = Math.min(maxRep, Math.floor(Math.abs(wsDiff) * 2));
                        addGameLog("向" + (COUNTRY_CN[co]||co) + "支付" + reparations + "战争赔款求和");
                    }
                    makePeace(pc, co, reparations);
                    return true;
                }
                if (b.id === "rel" && co !== pc) {
                    if (G.countries[pc].treasury >= 50) {
                        G.countries[pc].treasury -= 50;
                        if (!G.relations) G.relations = {};
                        G.relations[co] = (G.relations[co]||0) + 10;
                        addGameLog("改善与" + (COUNTRY_CN[co]||co) + "的关系");
                    }
                    return true;
                }
                if (b.id === "alliance") {
                    if (!G.alliances) G.alliances = {};
                    if (!G.alliances[pc]) G.alliances[pc] = {};
                    if (!G.alliances[co]) G.alliances[co] = {};
                    G.alliances[pc][co] = true;
                    G.alliances[co][pc] = true;
                    // 自动加入对方阵营
                    let pcFaction = getFaction(pc);
                    let coFaction = getFaction(co);
                    if (pcFaction && !coFaction) {
                        // pc有阵营，co加入pc阵营：把co的核心盟友也拉入
                        queueNews((COUNTRY_CN[co]||co) + " 加入" + pcFaction + "！");
                    } else if (coFaction && !pcFaction) {
                        queueNews((COUNTRY_CN[pc]||pc) + " 加入" + coFaction + "！");
                    } else if (pcFaction && pcFaction === coFaction) {
                        // 同阵营，不需要额外操作
                    }
                    addGameLog("与" + (COUNTRY_CN[co]||co) + "建立同盟");
                    return true;
                }
                if (b.id === "access") {
                    if (!G.militaryAccess) G.militaryAccess = {};
                    if (!G.militaryAccess[co]) G.militaryAccess[co] = {};
                    G.militaryAccess[co][pc] = true;
                    addGameLog("获得" + (COUNTRY_CN[co]||co) + "的军事通行权");
                    return true;
                }
                if (b.id === "recruit_faction" && co !== pc) {
                    if (G.countries[pc].treasury >= 100) {
                        G.countries[pc].treasury -= 100;
                        if (!G.alliances) G.alliances = {};
                        if (!G.alliances[pc]) G.alliances[pc] = {};
                        if (!G.alliances[co]) G.alliances[co] = {};
                        G.alliances[pc][co] = true;
                        G.alliances[co][pc] = true;
                        queueNews((COUNTRY_CN[co]||co) + " 加入" + (COUNTRY_CN[pc]||pc) + "阵营！");
                        addGameLog((COUNTRY_CN[co]||co) + " 加入阵营");
                    }
                    return true;
                }
                if (b.id === "leave_faction" && co === pc) {
                    let faction = getFaction(pc);
                    if (!faction) return true;
                    let coreCamps = { '同盟国': ['GERMANY','AUSTRIA_HUNGARY'], '协约国': ['FRANCE','UK'] };
                    let coreLeaders = coreCamps[faction];
                    // 核心国不能退出阵营
                    if (coreLeaders.includes(pc)) {
                        addGameLog(pc + " 是" + faction + "核心国，无法退出");
                        return true;
                    }
                    // 断开与阵营内所有成员的同盟
                    let allMembers = getFactionMembers(pc);
                    if (G.alliances && G.alliances[pc]) {
                        for (let key of Object.keys(G.alliances[pc])) {
                            if (allMembers.includes(key) || coreLeaders.includes(key)) {
                                delete G.alliances[pc][key];
                                if (G.alliances[key]) delete G.alliances[key][pc];
                            }
                        }
                    }
                    G.countries[pc].stability = Math.max(0, (G.countries[pc].stability || 50) - 15);
                    queueNews((COUNTRY_CN[pc]||pc) + " 退出" + faction + "！");
                    addGameLog("退出" + faction + "，稳定度-15");
                    return true;
                }
                if (b.id === "nap" && co !== pc) {
                    if (!G.nonAggression) G.nonAggression = {};
                    let napKey = [pc, co].sort().join('_');
                    G.nonAggression[napKey] = true;
                    addGameLog("与" + (COUNTRY_CN[co]||co) + "签订互不侵犯条约");
                    return true;
                }
                if (b.id === "trade" && co !== pc) {
                    if (G.countries[pc] && G.countries[pc].treasury >= 30) {
                        G.countries[pc].treasury -= 30;
                        G.countries[pc].income = Math.floor((G.countries[pc].income || 0) * 1.15);
                        if (G.countries[co]) G.countries[co].income = Math.floor((G.countries[co].income || 0) * 1.15);
                        addGameLog("与" + (COUNTRY_CN[co]||co) + "签订贸易协定，收入+15%");
                    }
                    return true;
                }
                if (b.id === "guarantee" && co !== pc) {
                    guaranteeIndependence(pc, co);
                    addGameLog("保障" + (COUNTRY_CN[co]||co) + "的独立");
                    return true;
                }
                if (b.id === "remove_guarantee" && co !== pc) {
                    removeGuarantee(pc, co);
                    addGameLog("取消对" + (COUNTRY_CN[co]||co) + "的保障");
                    return true;
                }
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
    // Navy panel scrolling when navy tab active
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
    let r=canvas.getBoundingClientRect();
    let sx=e.clientX-r.left,sy=e.clientY-r.top;
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
        let _trainBarTop = _panelTop - 50;
        if (G.selectedCity && sy > _trainBarTop && sy < _trainBarTop + 40) { isDragging=false; return; }
        if (G.activeTab && sy > _panelTop && sy < h - BOTTOM_BAR_HEIGHT) { isDragging=false; return; }

        let[wx,wy]=screenToWorld(sx,sy);

        // 检测城市点击（优先于省份）
        let clickedCity = findCityAtScreen(sx, sy);
        if (clickedCity && isMajorCity(clickedCity.id)) {
            let cityOwner = clickedCity.country;
            // 检查是否被占领（通过省份所有者）
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
            selectedProvince = findProvinceAt(wx, wy);
            G.selectedProvince = selectedProvince;
            isDragging = false;
            return;
        }

        G.selectedCity = null;
        selectedProvince=findProvinceAt(wx,wy);
        G.selectedProvince=selectedProvince;
        G.diplomacyFocus = null;

        if (G.frontlineDrawing) {
            if (!G.frontTargets) G.frontTargets = [];
            if (selectedProvince) {
                let provOwner = G.provinceOwners[selectedProvince.id];
                if (provOwner !== G.playerCountry) {
                    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(G.playerCountry) : [];
                    if (enemies && enemies.some(e => e === provOwner)) {
                        let idx = G.frontTargets.indexOf(selectedProvince.id);
                        if (idx >= 0) G.frontTargets.splice(idx, 1);
                        else G.frontTargets.push(selectedProvince.id);
                    }
                }
            }
            return;
        }

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
                    if (d) { d.focusFactory = fact.id; d.focusTarget = null; }
                }
                addGameLog("集火工厂已标记");
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

        // Determine final target: snap to province center if target province is restricted
        let targetProv = getProvinceAt(wx, wy);
        let finalX = wx, finalY = wy;
        if (targetProv && !canEnterProvince(targetProv, d.country) && best && G.provinceData[best] && G.provinceData[best].center) {
            // Target province is restricted — snap to nearest valid province center
            finalX = G.provinceData[best].center[0];
            finalY = G.provinceData[best].center[1];
        }

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
        // New move command cancels any existing focus target
        d.focusTarget = null;
        d.focusFactory = null;
        // Add green move line
        if (!G.moveLines) G.moveLines = [];
        G.moveLines.push({fromX: d.rx, fromY: d.ry, toX: wx, toY: wy, startTime: Date.now()});
    }
    addGameLog("行军");
});

document.addEventListener("keydown",(e)=>{
    if ((e.key==="r"||e.key==="R") && !G.gameOver) {camX=10;camY=51;zoom=0.5;selectedProvince=null;G.selectedDivisions=[];clampCamera();}
    if (e.key==="Escape") { G.selectedDivisions=[]; selectedProvince=null; G.selectedProvince=null; G.navyProductionMode=false; G.selectedNavyNode=null; G.activeTab=null; _showNavyGuide=false; _navyGuideScroll=0; }
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
function gameLoop(timestamp) {
    try {
    if (lastTime===0) lastTime=timestamp;
    let dt=Math.min(timestamp-lastTime,100);
    lastTime=timestamp;
    if (dt>0) {
        let spd=[1,2,4,8,16,32,64][G.speed]||1;
        loopSpeed=spd;
        let dayMs=12000/spd;
        let daysVis=dt/dayMs;
        updateGame(dt);checkEvents();
        // Multiple sub-ticks at low speeds for smooth animation
        let subticks = G.speed <= 1 ? 4 : G.speed <= 2 ? 2 : 1;
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
