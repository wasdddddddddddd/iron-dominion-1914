// ============================================================
// Iron & Dominion 1914 — AI 集团军系统 (ai_army_group.js)
// 职责：集团军创建、管理、任务分配、协同行动
// 核心理念：集团军是唯一的行动单元，步兵火炮不离散
// ============================================================

// —— 集团军类型 ——
const AG_TYPE = {
    OFFENSIVE: 'OFFENSIVE',   // 进攻型：主动攻敌
    DEFENSIVE: 'DEFENSIVE',   // 防御型：守前线
    GARRISON: 'GARRISON',     // 驻守型：和平邻国边境
    RESERVE: 'RESERVE',       // 预备型：后方待命支援
    NEUTRAL: 'NEUTRAL'        // 占领型：占中立城市
};

// —— 集团军任务 ——
const AG_TASK = {
    ATTACK_CITY: 'ATTACK_CITY',           // 攻占指定城市
    DEFEND_LINE: 'DEFEND_LINE',           // 防守前线
    GARRISON_BORDER: 'GARRISON_BORDER',   // 驻守和平边境
    RESERVE_STANDBY: 'RESERVE_STANDBY',   // 后方待命
    CAPTURE_NEUTRAL: 'CAPTURE_NEUTRAL',   // 占领中立城市
    REINFORCE: 'REINFORCE'                // 支援被攻城市
};

// —— 全局集团军存储 ——
// G._armyGroups = { country -> [group, ...] }
// 每个 group 结构：{ id, type, country, unitIds[], task, target, theater,
//                     centerLon, centerLat, taskAge, lastMoveTick }

function initArmyGroups(country) {
    if (!G._armyGroups) G._armyGroups = {};
    if (!G._armyGroups[country]) G._armyGroups[country] = [];
    if (!G._agIdCounter) G._agIdCounter = 10000;
}

// —— 1. 创建/重组集团军 ——
function createArmyGroups(country) {
    initArmyGroups(country);
    let groups = G._armyGroups[country];
    let atWar = typeof isCountryAtWar === 'function' ? isCountryAtWar(country) : false;
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    
    // 获取所有可用陆军单位
    let allUnits = G.divisions.filter(d => 
        d.country === country && d.strength > 0 &&
        d.type !== 'navy' && d.type !== 'submarine' &&
        d.state !== 'retreating'
    );
    
    if (allUnits.length < 3) return; // 至少3个单位才编组
    
    // 标记已分配到集团军的单位
    let assigned = new Set();
    for (let g of groups) {
        // 清理已死单位
        g.unitIds = g.unitIds.filter(uid => {
            let u = G.divisions.find(d => d.id === uid);
            if (u && u.strength > 0 && u.country === country && u.state !== 'retreating') {
                assigned.add(uid);
                return true;
            }
            return false;
        });
        if (g.unitIds.length === 0) continue;
        updateGroupCenter(g);
    }
    // 移除空集团军
    G._armyGroups[country] = groups.filter(g => g.unitIds.length > 0);
    groups = G._armyGroups[country];
    
    // 为未分配单位创建新集团军
    let unassigned = allUnits.filter(d => !assigned.has(d.id));
    
    // 按位置聚类未分配单位（3° 内聚为一组）
    let clusters = [];
    let used = new Set();
    for (let u of unassigned) {
        if (used.has(u.id)) continue;
        let cluster = [u];
        used.add(u.id);
        for (let v of unassigned) {
            if (used.has(v.id)) continue;
            if (Math.hypot(u.rx - v.rx, u.ry - v.ry) < 3.0) {
                cluster.push(v);
                used.add(v.id);
            }
        }
        if (cluster.length >= 2) clusters.push(cluster);
    }
    // 剩余散兵单独一组
    let leftovers = unassigned.filter(d => !used.has(d.id));
    if (leftovers.length >= 2) clusters.push(leftovers);
    
    for (let cl of clusters) {
        if (cl.length < 2) continue;
        let g = {
            id: G._agIdCounter++,
            type: atWar ? '_UNASSIGNED' : 'GARRISON', // 暂未分配任务类型
            country: country,
            unitIds: cl.map(u => u.id),
            task: null,
            taskTarget: null,
            theater: null,
            centerLon: 0,
            centerLat: 0,
            taskAge: 0,
            lastMoveTick: 0,
            siegeTicks: 0,
            targetCityId: null,
            gatherStage: null, // APPROACH / GATHER / SIEGE / ASSAULT
        };
        updateGroupCenter(g);
        // 标记单位所属集团军
        for (let uid of g.unitIds) {
            let u = G.divisions.find(d => d.id === uid);
            if (u) u._agId = g.id;
        }
        groups.push(g);
    }
}

// —— 2. 分配集团军任务 ——
function assignArmyGroupTasks(country) {
    initArmyGroups(country);
    let groups = G._armyGroups[country];
    let atWar = typeof isCountryAtWar === 'function' ? isCountryAtWar(country) : false;
    let totalUnits = G.divisions.filter(d => d.country === country && d.strength > 0 && d.type !== 'navy' && d.type !== 'submarine').length;
    if (totalUnits === 0) return;
    
    // 统计各类型已有数量
    let typeCount = { OFFENSIVE: 0, DEFENSIVE: 0, GARRISON: 0, RESERVE: 0, NEUTRAL: 0 };
    for (let g of groups) {
        if (g.type in typeCount) typeCount[g.type] += g.unitIds.length;
    }
    
    let totalAssigned = Object.values(typeCount).reduce((a, b) => a + b, 0);
    
    if (!atWar) {
        // —— 和平时期 ——
        let fCities = typeof getFrontlineCitiesAI === 'function' ? getFrontlineCitiesAI(country) : [];
        let pCities = typeof getPeaceBorderCitiesAI === 'function' ? getPeaceBorderCitiesAI(country) : [];
        
        for (let g of groups) {
            if (g.type !== '_UNASSIGNED') continue;
            // 所有集团军驻守前线/边境
            g.type = AG_TYPE.GARRISON;
            g.task = AG_TASK.GARRISON_BORDER;
            // 选一个前线/边境城市
            let target = fCities.length > 0 ? fCities[0].city :
                        pCities.length > 0 ? pCities[0] : null;
            if (target) {
                g.taskTarget = { lon: target.lon, lat: target.lat };
                g.targetCityId = target.id;
            }
        }
        return;
    }
    
    // —— 战争时期 ——
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let enemyTotal = G.divisions.filter(d => d.strength > 0 && enemies.includes(d.country) && d.type !== 'navy' && d.type !== 'submarine').length;
    
    // 目标分配比例
    let offTarget = Math.floor(totalUnits * 0.60);
    let defTarget = Math.floor(totalUnits * 0.15);
    let garTarget = Math.floor(totalUnits * 0.05);
    let resTarget = Math.floor(totalUnits * 0.10);
    // 剩余给中立占城
    
    // 为未分配类型的集团军指定类型（按组大小排序：大组进攻，小组防守）
    // 排序：大组优先，进攻优先
    let untyped = groups.filter(g => g.type === '_UNASSIGNED');
    untyped.sort((a, b) => b.unitIds.length - a.unitIds.length);
    
    for (let g of untyped) {
        if (typeCount.OFFENSIVE < offTarget) {
            g.type = AG_TYPE.OFFENSIVE;
            g.task = AG_TASK.ATTACK_CITY;
            typeCount.OFFENSIVE += g.unitIds.length;
        } else if (typeCount.DEFENSIVE < defTarget) {
            g.type = AG_TYPE.DEFENSIVE;
            g.task = AG_TASK.DEFEND_LINE;
            typeCount.DEFENSIVE += g.unitIds.length;
        } else if (typeCount.RESERVE < resTarget) {
            g.type = AG_TYPE.RESERVE;
            g.task = AG_TASK.RESERVE_STANDBY;
            typeCount.RESERVE += g.unitIds.length;
        } else if (typeCount.GARRISON < garTarget) {
            g.type = AG_TYPE.GARRISON;
            g.task = AG_TASK.GARRISON_BORDER;
            typeCount.GARRISON += g.unitIds.length;
        } else {
            g.type = AG_TYPE.OFFENSIVE; // 超额全部进攻
            g.task = AG_TASK.ATTACK_CITY;
            typeCount.OFFENSIVE += g.unitIds.length;
        }
    }
}

// —— 3. 集团军行为主循环 ——
function executeArmyGroups(country) {
    initArmyGroups(country);
    let groups = G._armyGroups[country];
    
    for (let g of groups) {
        // 跳过空集团军
        if (g.unitIds.length === 0) continue;
        
        switch (g.type) {
            case AG_TYPE.OFFENSIVE:
                offensiveGroupBehavior(g, country);
                break;
            case AG_TYPE.DEFENSIVE:
                defensiveGroupBehavior(g, country);
                break;
            case AG_TYPE.GARRISON:
                garrisonGroupBehavior(g, country);
                break;
            case AG_TYPE.RESERVE:
                reserveGroupBehavior(g, country);
                break;
        }
    }
}

// —— 4. 进攻集团军行为 ——
function offensiveGroupBehavior(group, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    let members = getGroupMembers(group);
    if (members.length === 0) return;
    
    // 如果当前有目标且目标有效，继续
    if (group.targetCityId && group.gatherStage !== 'REDIRECT') {
        let tc = G.cities[group.targetCityId];
        if (tc && tc.hp > 0 && enemies.includes(tc.owner)) {
            // 目标仍有效，继续攻城流程
            executeAssault(group, tc, members, country, enemies);
            group.taskAge = (group.taskAge || 0) + 1;
            // 30 天无进展 → 放弃
            if (group.taskAge > 30 && group.gatherStage === 'SIEGE') {
                group.gatherStage = 'REDIRECT';
            }
            return;
        }
    }
    
    // 选择新目标
    let enCities = typeof getEnemyCitiesAI === 'function' ? getEnemyCitiesAI(country) : [];
    if (enCities.length === 0) return;
    
    // 选最近且守军最少的敌城
    let bestTarget = null, bestScore = 9999;
    for (let ec of enCities) {
        let dist = Math.hypot(group.centerLon - ec.city.lon, group.centerLat - ec.city.lat);
        let dCount = ec.defenders || 0;
        let score = dist * 3 + dCount * 20 - ec.score * 0.1;
        if (ec.city.isCapital) score -= 50; // 首都优先级高
        if (score < bestScore) {
            bestScore = score;
            bestTarget = ec;
        }
    }
    
    if (bestTarget) {
        group.targetCityId = bestTarget.city.id;
        group.taskTarget = { lon: bestTarget.city.lon, lat: bestTarget.city.lat };
        group.gatherStage = 'APPROACH';
        group.taskAge = 0;
        group.siegeTicks = 0;
        group.task = AG_TASK.ATTACK_CITY;
    }
}

// —— 5. 攻城执行 ——
function executeAssault(group, targetCity, members, country, enemies) {
    updateGroupCenter(group);
    let cx = group.centerLon, cy = group.centerLat;
    let tx = targetCity.lon, ty = targetCity.lat;
    let dist = Math.hypot(cx - tx, cy - ty);
    
    // 分类兵种
    let infantry = members.filter(d => d.type === 'infantry' || d.type === 'mountain');
    let artillery = members.filter(d => d.type === 'artillery');
    let cavalry = members.filter(d => d.type === 'cavalry');
    let engineers = members.filter(d => d.type === 'engineer');
    let allUnits = members;
    
    // 统计守军
    let defenders = 0;
    for (let d of G.divisions) {
        if (d.strength > 0 && d.country === targetCity.owner &&
            Math.hypot(d.rx - tx, d.ry - ty) < 0.5) defenders++;
    }
    let hpRatio = (targetCity.hp || 100) / (targetCity.maxHp || 100);
    
    // 弱城检测：守军 < 己方兵力 × 0.5 → 直接总攻
    let isWeakCity = defenders < members.length * 0.5;
    
    // 阶段转换
    let stage = group.gatherStage || 'APPROACH';
    if (isWeakCity || hpRatio < 0.3) {
        stage = 'ASSAULT';
    } else if (stage === 'APPROACH' && dist < 0.8) {
        stage = 'SIEGE';
    } else if (stage === 'SIEGE' && defenders === 0 && dist < 0.5) {
        stage = 'ASSAULT';
    }
    group.gatherStage = stage;
    
    if (stage === 'APPROACH') {
        // —— 接近阶段：全体向目标移动，保持编队 ——
        moveGroupTo(group, tx, ty, 0.7);
        for (let u of members) {
            u._aiTask = 'ATTACK';
            u._aiTaskTarget = { lon: tx, lat: ty };
        }
    } else if (stage === 'SIEGE') {
        // —— 围城阶段 ——
        // 火炮在 85% 射程处
        for (let art of artillery) {
            if (art.state === 'moving') continue;
            let artRange = (UNIT_TYPES[art.type] || UNIT_TYPES.infantry).range || 0.6;
            let desiredDist = artRange * 0.85;
            let ad = Math.hypot(art.rx - tx, art.ry - ty);
            if (ad > artRange) {
                moveUnitToward(art, tx, ty, desiredDist);
            } else if (ad < artRange * 0.35) {
                moveUnitAway(art, tx, ty, desiredDist);
            } else {
                art.state = 'idle';
                art.focusCity = targetCity.id;
            }
            art._aiTask = 'ATTACK';
            art._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 步兵围在城外 0.4°
        for (let inf of infantry) {
            if (inf.state === 'moving') continue;
            let id = Math.hypot(inf.rx - tx, inf.ry - ty);
            if (id > 0.6) {
                moveUnitToward(inf, tx, ty, 0.4);
            }
            inf.focusCity = null; // 围城不打城，等火炮削
            inf._aiTask = 'ATTACK';
            inf._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 骑兵找周围残血
        for (let cav of cavalry) {
            if (cav.state === 'moving') continue;
            let huntTarget = findHuntTarget(cav, country, enemies, tx, ty, 2.5);
            if (huntTarget) {
                cav.focusTarget = huntTarget.id;
                let cr = (UNIT_TYPES.cavalry || { range: 0.12 }).range;
                moveUnitToward(cav, huntTarget.rx, huntTarget.ry, cr * 2);
            }
            cav._aiTask = 'ATTACK';
            cav._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 工兵待命
        for (let eng of engineers) {
            if (eng.state === 'moving') continue;
            let ed = Math.hypot(eng.rx - tx, eng.ry - ty);
            if (ed > 0.7) moveUnitToward(eng, tx, ty, 0.6);
            eng._aiTask = 'ATTACK';
            eng._aiTaskTarget = { lon: tx, lat: ty };
        }
    } else if (stage === 'ASSAULT') {
        // —— 总攻阶段：全体压上 ——
        // 火炮保持射程
        for (let art of artillery) {
            if (art.state === 'moving') continue;
            let artRange = (UNIT_TYPES[art.type] || UNIT_TYPES.infantry).range || 0.6;
            let desiredDist = artRange * 0.85;
            let ad = Math.hypot(art.rx - tx, art.ry - ty);
            if (ad > artRange) moveUnitToward(art, tx, ty, desiredDist);
            else { art.state = 'idle'; art.focusCity = targetCity.id; }
            art._aiTask = 'ATTACK';
            art._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 步兵冲城
        for (let inf of infantry) {
            if (inf.state === 'moving') continue;
            let id = Math.hypot(inf.rx - tx, inf.ry - ty);
            if (id > 0.2) {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(inf, tx, ty);
                else { inf.state = 'moving'; inf.targetX = tx; inf.targetY = ty; }
            } else {
                inf.focusCity = targetCity.id;
            }
            inf._aiTask = 'ATTACK';
            inf._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 骑兵冲城侧翼
        for (let ci = 0; ci < cavalry.length; ci++) {
            let cav = cavalry[ci];
            if (cav.state === 'moving') continue;
            let cd = Math.hypot(cav.rx - tx, cav.ry - ty);
            if (cd > 0.3) {
                let angle = Math.atan2(ty - cav.ry, tx - cav.rx);
                let side = angle + (Math.PI / 4) * (ci % 2 === 0 ? 1 : -1);
                let sx = tx - Math.cos(side) * 0.25;
                let sy = ty - Math.sin(side) * 0.25;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, sx, sy);
                else { cav.state = 'moving'; cav.targetX = sx; cav.targetY = sy; }
            } else {
                cav.focusCity = targetCity.id;
            }
            cav._aiTask = 'ATTACK';
            cav._aiTaskTarget = { lon: tx, lat: ty };
        }
        // 工兵跟进
        for (let eng of engineers) {
            if (eng.state === 'moving') continue;
            let ed = Math.hypot(eng.rx - tx, eng.ry - ty);
            if (ed > 0.4) {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, tx, ty);
                else { eng.state = 'moving'; eng.targetX = tx; eng.targetY = ty; }
            }
            eng.focusCity = targetCity.id;
            eng._aiTask = 'ATTACK';
            eng._aiTaskTarget = { lon: tx, lat: ty };
        }
    }
}

// —— 6. 防御集团军行为 ——
function defensiveGroupBehavior(group, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    let members = getGroupMembers(group);
    if (members.length === 0) return;
    
    // 检查是否需要支援（该国任一城市 HP 下降）
    let threatened = typeof getThreatenedCitiesAI === 'function' ? getThreatenedCitiesAI(country) : [];
    if (threatened.length > 0) {
        // 选最近受威胁城市去支援
        let best = threatened[0];
        let bestDist = 999;
        for (let t of threatened) {
            let d = Math.hypot(group.centerLon - t.lon, group.centerLat - t.lat);
            if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best && bestDist < 10.0) {
            group.task = AG_TASK.REINFORCE;
            group.targetCityId = best.id;
            group.taskTarget = { lon: best.lon, lat: best.lat };
            moveGroupTo(group, best.lon, best.lat, 0.5);
            for (let u of members) {
                u._aiTask = 'DEFEND_CITY';
                u._aiTaskTarget = { lon: best.lon, lat: best.lat };
            }
            return;
        }
    }
    
    // 部署到最近的前线城市
    let fCities = typeof getFrontlineCitiesAI === 'function' ? getFrontlineCitiesAI(country) : [];
    if (fCities.length === 0) return;
    
    // 选最近且威胁最高的前线/边境城
    let bestFC = null, bestFCScore = -9999;
    for (let fc of fCities) {
        let d = Math.hypot(group.centerLon - fc.city.lon, group.centerLat - fc.city.lat);
        let s = fc.threat - d * 5;
        if (s > bestFCScore) { bestFCScore = s; bestFC = fc; }
    }
    
    if (bestFC) {
        group.task = AG_TASK.DEFEND_LINE;
        group.targetCityId = bestFC.city.id;
        group.taskTarget = { lon: bestFC.city.lon, lat: bestFC.city.lat };
        moveGroupTo(group, bestFC.city.lon, bestFC.city.lat, 0.5);
        for (let u of members) {
            u._aiTask = 'DEFEND_CITY';
            u._aiTaskTarget = { lon: bestFC.city.lon, lat: bestFC.city.lat };
        }
    }
}

// —— 7. 驻守集团军行为 ——
function garrisonGroupBehavior(group, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length > 0) {
        // 战时：抽调 50% 单位去进攻/防御
        // 如果已经不在和平邻国，转为防御
        group.type = AG_TYPE.DEFENSIVE;
        group.task = AG_TASK.DEFEND_LINE;
        return;
    }
    
    // 和平时期：驻守和平邻国边境城市
    let pCities = typeof getPeaceBorderCitiesAI === 'function' ? getPeaceBorderCitiesAI(country) : [];
    if (pCities.length === 0) return;
    
    let members = getGroupMembers(group);
    if (!group.targetCityId || !G.cities[group.targetCityId]) {
        // 选最近的和平边境城市
        let best = pCities[0], bestDist = 999;
        for (let pc of pCities) {
            let d = Math.hypot(group.centerLon - pc.lon, group.centerLat - pc.lat);
            if (d < bestDist) { bestDist = d; best = pc; }
        }
        group.targetCityId = best.id;
        group.taskTarget = { lon: best.lon, lat: best.lat };
    }
    group.task = AG_TASK.GARRISON_BORDER;
    moveGroupTo(group, group.taskTarget.lon, group.taskTarget.lat, 0.5);
    for (let u of members) {
        u._aiTask = 'GARRISON';
        u._aiTaskTarget = group.taskTarget;
    }
}

// —— 8. 预备集团军行为 ——
function reserveGroupBehavior(group, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    
    // 检查前线城市是否需要支援
    let threatened = typeof getThreatenedCitiesAI === 'function' ? getThreatenedCitiesAI(country) : [];
    if (threatened.length > 0) {
        let best = threatened[0];
        let bestDist = 999;
        for (let t of threatened) {
            let d = Math.hypot(group.centerLon - t.lon, group.centerLat - t.lat);
            if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best && bestDist < 15.0) {
            group.task = AG_TASK.REINFORCE;
            group.targetCityId = best.id;
            group.taskTarget = { lon: best.lon, lat: best.lat };
            moveGroupTo(group, best.lon, best.lat, 0.5);
            for (let u of getGroupMembers(group)) {
                u._aiTask = 'DEFEND_CITY';
                u._aiTaskTarget = { lon: best.lon, lat: best.lat };
            }
            return;
        }
    }
    
    // 找首都附近集合点
    let capital = null;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.isCapital && ct.owner === country) { capital = ct; break; }
    }
    if (!capital) return;
    
    group.task = AG_TASK.RESERVE_STANDBY;
    group.taskTarget = { lon: capital.lon, lat: capital.lat };
    moveGroupTo(group, capital.lon, capital.lat, 1.5);
    for (let u of getGroupMembers(group)) {
        u._aiTask = 'RESERVE';
        u._aiTaskTarget = group.taskTarget;
    }
}

// —— ===== 辅助函数 ===== ——

// 获取集团军成员
function getGroupMembers(group) {
    let result = [];
    for (let uid of group.unitIds) {
        let u = G.divisions.find(d => d.id === uid);
        if (u && u.strength > 0) result.push(u);
    }
    return result;
}

// 更新集团军中心
function updateGroupCenter(group) {
    let sx = 0, sy = 0, cnt = 0;
    for (let uid of group.unitIds) {
        let u = G.divisions.find(d => d.id === uid);
        if (u && u.rx !== undefined && u.strength > 0) {
            sx += u.rx; sy += u.ry; cnt++;
        }
    }
    if (cnt > 0) { group.centerLon = sx / cnt; group.centerLat = sy / cnt; }
}

// 移动整个集团军到目标点（保持编队，全部单位一起移动）
function moveGroupTo(group, tx, ty, offset) {
    let members = getGroupMembers(group);
    for (let i = 0; i < members.length; i++) {
        let u = members[i];
        if (u.state === 'moving' || u.state === 'retreating') continue;
        
        let d = Math.hypot(u.rx - tx, u.ry - ty);
        if (d <= offset) continue; // 已在范围内
        
        // 每单位稍偏一点（避免叠在一个点上）
        let spreadX = (Math.random() - 0.5) * 0.2;
        let spreadY = (Math.random() - 0.5) * 0.2;
        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, tx + spreadX, ty + spreadY);
        else { u.state = 'moving'; u.targetX = tx + spreadX; u.targetY = ty + spreadY; }
    }
}

// 移动单个单位朝向目标（保持距离）
function moveUnitToward(u, tx, ty, desiredDist) {
    let dx = tx - u.rx, dy = ty - u.ry;
    let dist = Math.max(0.01, Math.hypot(dx, dy));
    let mx = u.rx + (dx / dist) * (dist - desiredDist);
    let my = u.ry + (dy / dist) * (dist - desiredDist);
    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, mx, my);
    else { u.state = 'moving'; u.targetX = mx; u.targetY = my; }
}

// 移动单个单位远离目标
function moveUnitAway(u, tx, ty, desiredDist) {
    let dx = u.rx - tx, dy = u.ry - ty;
    let dist = Math.max(0.01, Math.hypot(dx, dy));
    let mx = u.rx + (dx / dist) * (desiredDist * 0.8);
    let my = u.ry + (dy / dist) * (desiredDist * 0.8);
    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, mx, my);
    else { u.state = 'moving'; u.targetX = mx; u.targetY = my; }
}

// 找骑兵猎物（2.5°内残血/火炮/工兵）
function findHuntTarget(cav, country, enemies, cx, cy, range) {
    let best = null, bestScore = -9999;
    for (let e of G.divisions) {
        if (e.strength <= 0 || e.country === country || !enemies.includes(e.country)) continue;
        let ed = Math.hypot(cav.rx - e.rx, cav.ry - e.ry);
        if (ed > range) continue;
        let hpR = e.strength / (e.maxStrength || 100);
        let score = -ed + (hpR < 0.5 ? 50 : 0) + (e.type === 'artillery' ? 40 : 0) + (e.type === 'engineer' ? 30 : 0) - (e.type === 'infantry' ? 15 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
}

// —— 获取单位任务面板显示文字 ——
function getGroupTaskDisplay(group) {
    if (!group) return '未编组';
    let taskNames = {
        ATTACK_CITY: '进攻城市',
        DEFEND_LINE: '防守前线',
        GARRISON_BORDER: '驻守边境',
        RESERVE_STANDBY: '预备待命',
        CAPTURE_NEUTRAL: '占领中立',
        REINFORCE: '支援前线'
    };
    let typeNames = {
        OFFENSIVE: '进攻', DEFENSIVE: '防御', GARRISON: '驻守', RESERVE: '预备', NEUTRAL: '占领'
    };
    let task = taskNames[group.task] || '待命';
    let type = typeNames[group.type] || '未知';
    let target = '';
    if (group.targetCityId && G.cities[group.targetCityId]) {
        let c = G.cities[group.targetCityId];
        target = ' → ' + (c.name || c.id) + (c.owner ? '(' + c.owner + ')' : '(中立)');
    }
    return type + '集团军:' + task + target;
}

function getUnitTaskDisplay(unit) {
    if (!unit) return '无数据';
    let group = null;
    if (unit._agId && G._armyGroups) {
        for (let co in G._armyGroups) {
            for (let g of G._armyGroups[co]) {
                if (g.id === unit._agId) { group = g; break; }
            }
            if (group) break;
        }
    }
    let groupInfo = group ? getGroupTaskDisplay(group) : '无集团军';
    let state = unit.state === 'moving' ? '移动中' : unit.state === 'idle' ? '待命' : unit.state;
    return '所属:' + groupInfo + ' | 状态:' + state;
}
