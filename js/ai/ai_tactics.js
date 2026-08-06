// === AI 战术层：撤退、编组、目标优先级、预备队管理 ===

const RETREAT_HP_RATIO = 0.15; // 从0.25降到0.15，残血才撤退
const RETREAT_COOLDOWN_TICKS = 120; // 撤退冷却120tick（约2分钟）
const TACTICAL_GROUP_RADIUS = 0.3;
const TACTICAL_GROUP_MIN_UNITS = 3;
const TACTICAL_GROUP_MAX_UNITS = 12;
const RESERVE_RATIO = 0.08; // 后方预备队 8%（原 15%→减半，避免后方囤兵过多）

// === 撤退系统（修复：增加冷却、降低阈值、尊重_aiTask标记） ===
function processRetreats(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    for (let d of G.divisions) {
        if (d.country !== country || (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') || d.strength <= 0) continue;
        
        // 有攻击任务标记的单位不撤退（坚守阵地）
        if (d._aiTask === 'ATTACK' || d._aiTask === 'DEFEND_LINE') continue;
        
        // 撤退冷却中
        if (d._retreatCooldown > 0) {
            d._retreatCooldown--;
            continue;
        }
        
        if (d.state === 'retreating') {
            continueRetreat(d);
            continue;
        }
        
        // 只有极低血量才触发撤退，且必须有正在交战（附近有敌人）
        let hpRatio = d.strength / (d.maxStrength || 100);
        let nearbyEnemy = false;
        for (let e of G.divisions) {
            if (e.strength <= 0 || e.id === d.id) continue;
            if (!enemies.includes(e.country)) continue;
            if (Math.hypot(d.rx - e.rx, d.ry - e.ry) < 0.5) { nearbyEnemy = true; break; }
        }
        
        if (hpRatio < RETREAT_HP_RATIO && nearbyEnemy && (d.state === 'moving' || d.state === 'idle')) {
            startRetreat(d);
            d._retreatCooldown = RETREAT_COOLDOWN_TICKS;
            continue;
        }
        
        // 被包围且完全无路可走：周围0.3度内敌方 > 己方*5 且无友军支援
        if (d.state === 'moving' || d.state === 'idle') {
            let nearbyEnemies = 0, nearbyFriendlies = 0;
            for (let e of G.divisions) {
                if (e.strength <= 0 || e.id === d.id) continue;
                let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
                if (dist > 0.3) continue;
                if (enemies.includes(e.country)) nearbyEnemies++;
                else if (e.country === country) nearbyFriendlies++;
            }
            // 只在被绝对包围且孤立无援时撤退
            if (nearbyEnemies >= 5 && nearbyFriendlies === 0) {
                startRetreat(d);
                d._retreatCooldown = RETREAT_COOLDOWN_TICKS;
            }
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
    if (!cityData || cityData.hp <= 0) { d.state = 'idle'; d._retreatTarget = null; return; }
    let dist = Math.hypot(d.rx - cityData.lon, d.ry - cityData.lat);
    if (dist < 0.15) {
        d.state = 'idle';
        d.targetX = null; d.targetY = null;
        // 到达安全城市后每tick恢复2%血量
        d.strength = Math.min(d.maxStrength || 100, d.strength + (d.maxStrength || 100) * 0.02);
        // 血量恢复到70%以上后移除撤退标记，恢复正常状态
        if (d.strength / (d.maxStrength || 100) >= 0.7) {
            d._retreatTarget = null;
        }
        return;
    }
    // 继续撤退不攻击，中途不中断撤退
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
        let score = 100 - dist * 8;
        if (e.type === 'artillery') score += 30;
        if (e.type === 'engineer') score += 20;
        if (e.type === 'cavalry') score += 5;
        if (isUnitLowHp(e)) score += 25;
        if (e.type === 'infantry') score -= 10;
        // 正在攻击己方城市的敌人优先级高
        if (d._aiTarget && d._aiTarget === e.id) score += 15; // 已有目标加成
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

// === 新增：威胁等级计算（综合评估） ===
function calculateThreatLevel(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return { capitalThreat: 0, totalLossRatio: 0, forceRatio: 1.0, frontlineStability: 0 };
    
    // 首都威胁
    let capitalRisk = calculateCapitalRisk(country);
    
    // 城市丢失比例
    let totalLossRatio = typeof getCityLossRatio === 'function' ? getCityLossRatio(country) : 0;
    
    // 兵力对比
    let myDivs = G.divisions.filter(d => d.country === country && d.strength > 0).length;
    let enemyDivs = G.divisions.filter(d => enemies.includes(d.country) && d.strength > 0).length;
    let forceRatio = myDivs / Math.max(1, enemyDivs);
    
    // 前线稳定性（己方领土内敌人密度）
    let myProvs = (typeof getCountryProvinces === 'function' ? getCountryProvinces(country) : []).filter(p => p.center);
    let enemyInTerritory = 0;
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        for (let p of myProvs) {
            if (Math.hypot(d.rx - p.center[0], d.ry - p.center[1]) < 1.5) {
                enemyInTerritory++;
                break;
            }
        }
    }
    let frontlineStability = Math.round((10 - enemyInTerritory) * 10);
    
    return {
        capitalThreat: capitalRisk.threat,
        totalLossRatio: totalLossRatio,
        forceRatio: forceRatio,
        frontlineStability: frontlineStability,
        capitalEnemyDist: capitalRisk.capitalEnemyDist,
        capitalEnemyCount: capitalRisk.capitalEnemyCount,
        emergencyLevel: capitalRisk.emergencyLevel,
        myDivs: myDivs,
        enemyDivs: enemyDivs,
    };
}

// === 修复：首都风险计算（降低紧急等级阈值） ===
function calculateCapitalRisk(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let capital = null;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.isCapital && ct.owner === country) { capital = ct; break; }
    }
    if (!capital) return { threat: 100, emergencyLevel: 3, capitalEnemyDist: 0, capitalEnemyCount: 999 };
    
    let nearestDist = 999, nearbyCount = 0;
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        let dist = Math.hypot(d.rx - capital.lon, d.ry - capital.lat);
        if (dist < nearestDist) nearestDist = dist;
        if (dist < 3.0) nearbyCount++;
    }
    
    let threat = 0;
    if (nearestDist < 0.5) threat += 100;
    else if (nearestDist < 1.0) threat += 70;
    else if (nearestDist < 2.0) threat += 40;
    else if (nearestDist < 3.0) threat += 20;
    else if (nearestDist < 5.0) threat += 10;
    else if (nearestDist < 8.0) threat += 5;
    threat += nearbyCount * 3;
    threat = Math.min(100, threat);
    
    let emergencyLevel = 0;
    if (threat > 85) emergencyLevel = 3;
    else if (threat > 65) emergencyLevel = 2;
    else if (threat > 45) emergencyLevel = 1;
    
    return { threat, emergencyLevel, capitalEnemyDist: nearestDist, capitalEnemyCount: nearbyCount };
}

// === 新增：交战决策 ===
function shouldEngage(group, enemyForce) {
    let myForce = 0;
    let members = typeof getGroupMembers === 'function' ? getGroupMembers(group) : [];
    for (let m of members) {
        if (m && m.strength) myForce += m.strength;
    }
    if (myForce <= 0) return false;
    let ratio = myForce / Math.max(1, enemyForce);
    let sit = G._aiSituation ? G._aiSituation[group.country] : null;
    
    if (sit && sit.emergencyLevel >= 2) return false;
    if (ratio > 2.0) return true;
    if (ratio > 1.5) return Math.random() < 0.7;
    if (ratio > 0.8) return Math.random() < 0.3;
    return false;
}

// === 新增：撤退决策 ===
function shouldRetreat(group) {
    let members = typeof getGroupMembers === 'function' ? getGroupMembers(group) : [];
    let totalStrength = 0, maxStrength = 0;
    for (let m of members) {
        if (m && m.strength) totalStrength += m.strength;
        if (m && m.maxStrength) maxStrength += m.maxStrength;
    }
    if (maxStrength <= 0) return false;
    let hpRatio = totalStrength / maxStrength;
    if (hpRatio < 0.3) return true;
    let sit = G._aiSituation ? G._aiSituation[group.country] : null;
    if (sit && sit.emergencyLevel >= 3) return true;
    return false;
}

// === 新增：集团军目标选择（选择最近的敌方城市） ===
function getGroupTargetCity(group, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return null;
    let members = typeof getGroupMembers === 'function' ? getGroupMembers(group) : [];
    let cx = 0, cy = 0, cnt = 0;
    for (let m of members) {
        if (m && m.rx !== undefined) { cx += m.rx; cy += m.ry; cnt++; }
    }
    if (cnt === 0) return null;
    cx /= cnt; cy /= cnt;
    
    let best = null, bestScore = 999;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
        let dist = Math.hypot(ct.lon - cx, ct.lat - cy);
        let score = dist;
        if (ct.isCapital) score -= 8;
        if (typeof isMajorCity === 'function' && isMajorCity(ct.id)) score -= 5;
        if (score < bestScore) { bestScore = score; best = ct; }
    }
    return best;
}

// === 新增：敌方单位聚类 ===
function clusterEnemyUnits(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let enemyUnits = G.divisions.filter(d => d.strength > 0 && enemies.includes(d.country));
    let clusters = [];
    for (let e of enemyUnits) {
        let found = false;
        for (let cl of clusters) {
            if (Math.hypot(cl.cx - e.rx, cl.cy - e.ry) < 1.5) {
                cl.count++; cl.totalStr += e.strength; found = true; break;
            }
        }
        if (!found) clusters.push({ cx: e.rx, cy: e.ry, count: 1, totalStr: e.strength });
    }
    clusters.sort((a, b) => b.count - a.count);
    return clusters;
}
