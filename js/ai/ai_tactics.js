// === AI 战术层：撤退、编组、目标优先级、预备队管理 ===

const RETREAT_HP_RATIO = 0.25;
const TACTICAL_GROUP_RADIUS = 0.3;
const TACTICAL_GROUP_MIN_UNITS = 3;
const TACTICAL_GROUP_MAX_UNITS = 12;
const RESERVE_RATIO = 0.15;

// === 撤退系统 ===
function processRetreats(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    for (let d of G.divisions) {
        if (d.country !== country || (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') || d.strength <= 0) continue;
        if (d.state === 'retreating') {
            continueRetreat(d);
            continue;
        }
        let hpRatio = d.strength / (d.maxStrength || 100);
        if (hpRatio < RETREAT_HP_RATIO && (d.state === 'moving' || d.state === 'idle')) {
            startRetreat(d);
        }
    }
}

function startRetreat(d) {
    let target = findSafestCity(d);
    if (!target) return;
    d.state = 'retreating';
    d._retreatTarget = target;
    d.focusTarget = null;
    d.focusCity = null;
    d.focusFactory = null;
    let tx = target.lon, ty = target.lat;
    if (typeof isLandPoint === 'function' && isLandPoint(tx, ty)) {
        let nw = typeof nearestWater === 'function' ? nearestWater(tx, ty) : null;
        if (nw) { tx = nw[0]; ty = nw[1]; }
    }
    if (typeof aiMoveTo === 'function') aiMoveTo(d, tx, ty);
    else { d.targetX = tx; d.targetY = ty; d.state = 'moving'; }
}

function continueRetreat(d) {
    if (!d._retreatTarget) { d.state = 'idle'; return; }
    let cityData = G.cities[d._retreatTarget];
    if (!cityData || cityData.hp <= 0) { d.state = 'idle'; return; }
    let dist = Math.hypot(d.rx - cityData.lon, d.ry - cityData.lat);
    if (dist < 0.15) {
        d.state = 'idle';
        d.targetX = null; d.targetY = null;
        d._retreatTarget = null;
        return;
    }
    // 如果中途遇到敌人，继续撤退不攻击
    let hpRatio = d.strength / (d.maxStrength || 100);
    if (hpRatio > 0.5) {
        d.state = 'idle';
        d._retreatTarget = null;
        return;
    }
}

function findSafestCity(d) {
    let best = null, bestDist = 999;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.owner !== d.country || ct.hp <= 0) continue;
        let dist = Math.hypot(ct.lon - d.rx, ct.lat - d.ry);
        if (dist < bestDist) {
            let enemyDist = getMinEnemyDistToPoint(ct.lon, ct.lat, d.country);
            if (enemyDist > 1.0) { bestDist = dist; best = ct; }
        }
    }
    return best || findNearestCity(d);
}

function findNearestCity(d) {
    let best = null, bestDist = 999;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.owner !== d.country || ct.hp <= 0) continue;
        let dist = Math.hypot(ct.lon - d.rx, ct.lat - d.ry);
        if (dist < bestDist) { bestDist = dist; best = ct; }
    }
    return best;
}

// === 战术编组 ===
function updateTacticalGroups(country) {
    if (!G._tacticalGroups) G._tacticalGroups = {};
    let groups = G._tacticalGroups;
    let divisions = G.divisions.filter(d => d.country === country && (typeof isSeaType !== 'function' || !isSeaType(d.type)) && d.strength > 0);
    let assigned = new Set();
    for (let gid in groups) {
        let g = groups[gid];
        if (g.country !== country) { delete groups[gid]; continue; }
        g.units = g.units.filter(uid => {
            let d = G.divisions.find(x => x.id === uid);
            return d && d.strength > 0 && d.country === country;
        });
        for (let uid of g.units) assigned.add(uid);
        if (g.units.length === 0) { delete groups[gid]; continue; }
        updateGroupCenter(g);
    }
    let unassigned = divisions.filter(d => !assigned.has(d.id) && d.state !== 'retreating');
    for (let d of unassigned) {
        if (d.state === 'moving' && d._finalTargetX !== undefined) continue;
        let bestGroup = findBestGroup(d, groups, country);
        if (bestGroup && bestGroup.units.length < TACTICAL_GROUP_MAX_UNITS) {
            bestGroup.units.push(d.id);
            assigned.add(d.id);
        } else if (Object.keys(groups).length < 20) {
            let gid = 'tg_' + country + '_' + (G._tgCounter || 0);
            if (!G._tgCounter) G._tgCounter = 1;
            G._tgCounter++;
            groups[gid] = {id:gid,country:country,units:[d.id],centerLon:d.rx,centerLat:d.ry,task:'ATTACK'};
            assigned.add(d.id);
        }
    }
}

function findBestGroup(d, groups, country) {
    let best = null, bestDist = 999;
    for (let gid in groups) {
        let g = groups[gid];
        if (g.country !== country || g.units.length >= TACTICAL_GROUP_MAX_UNITS) continue;
        let dist = Math.hypot(d.rx - g.centerLon, d.ry - g.centerLat);
        if (dist < TACTICAL_GROUP_RADIUS && dist < bestDist) { bestDist = dist; best = g; }
    }
    return best;
}

function updateGroupCenter(g) {
    let sx = 0, sy = 0, count = 0;
    for (let uid of g.units) {
        let d = G.divisions.find(x => x.id === uid);
        if (d && d.rx !== undefined) { sx += d.rx; sy += d.ry; count++; }
    }
    if (count > 0) { g.centerLon = sx / count; g.centerLat = sy / count; }
}

// 获取战术群的任务类型
function getGroupTask(group, country) {
    let strat = getStrategy(country);
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return 'IDLE';
    let nearestEnemyDist = 999;
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        let dist = Math.hypot(d.rx - group.centerLon, d.ry - group.centerLat);
        if (dist < nearestEnemyDist) nearestEnemyDist = dist;
    }
    if (nearestEnemyDist < 0.3) return 'ENGAGING';
    if (nearestEnemyDist < 2.0) return 'ADVANCING';
    let tp = strat.theaterPlan || {};
    let hasOffensive = false;
    for (let tk in tp) {
        if (tp[tk].strategy === 'OFFENSIVE' && tp[tk].priority > 0.3) { hasOffensive = true; break; }
    }
    return hasOffensive ? 'ADVANCING' : 'DEFENDING';
}

// === 预备队管理 ===
function manageReserves(country) {
    let cData = G.countries[country];
    if (!cData) return;
    let strat = getStrategy(country);
    let reserveTarget = strat.alloc ? strat.alloc.rr : RESERVE_RATIO;
    let totalDivs = cData.divCount || 0;
    let movingDivs = 0;
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        if (d.state === 'moving' || d.state === 'retreating') movingDivs++;
    }
    let idleDivs = totalDivs - movingDivs;
    let reserveCount = Math.max(1, Math.floor(totalDivs * reserveTarget));
    let currentIdle = 0;
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        if (d.state === 'idle') currentIdle++;
    }
    return {
        totalDivs: totalDivs,
        movingDivs: movingDivs,
        idleDivs: idleDivs,
        reserveTarget: reserveCount,
        currentIdle: currentIdle,
        needMoreReserve: currentIdle < reserveCount && totalDivs > 10,
    };
}

// === 目标优先级 ===
function getPriorityTarget(d, enemies) {
    if (!enemies || enemies.length === 0) return null;
    let best = null, bestScore = -999;
    for (let e of G.divisions) {
        if (e.strength <= 0 || !enemies.includes(e.country)) continue;
        let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
        if (dx > 5 || dy > 5) continue;
        let dist = Math.hypot(dx, dy);
        let score = 100 - dist * 10;
        if (e.type === 'artillery') score += 20;
        if (e.type === 'engineer') score += 10;
        if (isUnitLowHp(e)) score += 15;
        if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
}

function isUnitLowHp(d) {
    let maxHp = d.maxStrength || (d.type === 'navy' ? 500 : d.type === 'submarine' ? 200 : 100);
    return (d.strength / maxHp) < 0.35;
}

// 找最近的己方单位位置（用于集结）
function findNearestFriendlyPosition(lon, lat, country) {
    let bestDist = 999, bestPos = null;
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        let dist = Math.hypot(d.rx - lon, d.ry - lat);
        if (dist < bestDist && dist > 0.01) { bestDist = dist; bestPos = {rx:d.rx,ry:d.ry}; }
    }
    return bestPos;
}
