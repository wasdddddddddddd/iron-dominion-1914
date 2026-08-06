// ============================================================
// Iron & Dominion 1914 — HOI4 风格战线系统 (ai_frontline_hoi.js)
// 职责：战线生成、兵力沿战线分配、计划加成、动态变化
// ============================================================

// —— 全局战线存储 ——
// G._frontlines[myCountry] = [Frontline, ...]
// 每条 Frontline 对应一对交战国（myCountry vs enemyCountry）

// —— 战线数据结构 ——
// {
//   id, myCountry, enemyCountry, theater,
//   checkpoints: [{lon, lat, provinceA, provinceB}],  // 边境检查点
//   segments: [{  // 战线分段
//     id, startLon, startLat, endLon, endLat, midLon, midLat, length,
//     myStrength, enemyStrength, tension, planningBonus, groupId
//   }],
//   totalLength, lastRecalc
// }

// ============================================================ 战线生成 ============================================================

// —— 1. 找两国之间的边境省份对 ——
function findBorderProvincePairs(countryA, countryB) {
    let pairs = [];
    if (!PROVINCE_ADJ) return pairs;
    
    let provsA = [];
    let provsB = [];
    
    // 收集两国的省份
    for (let pid in G.provinceData) {
        let pd = G.provinceData[pid];
        if (!pd) continue;
        if (pd.country === countryA) provsA.push(pid);
        else if (pd.country === countryB) provsB.push(pid);
    }
    // 也检查 G.provinceOwners（战时省份易主）
    if (G.provinceOwners) {
        for (let pid in G.provinceOwners) {
            let owner = G.provinceOwners[pid];
            if (!owner || !G.provinceData[pid]) continue;
            if (owner === countryA && !provsA.includes(pid)) provsA.push(pid);
            else if (owner === countryB && !provsB.includes(pid)) provsB.push(pid);
        }
    }
    
    // 找邻接对
    let adjA = {}, adjB = {};
    for (let pid of provsA) {
        if (!PROVINCE_ADJ[pid]) continue;
        for (let nid of PROVINCE_ADJ[pid]) {
            if (provsB.includes(nid)) {
                pairs.push({ provinceA: pid, provinceB: nid });
            }
        }
    }
    
    return pairs;
}

// —— 2. 从边境省份对生成检查点 ——
function pairsToCheckpoints(pairs) {
    let checkpoints = [];
    for (let p of pairs) {
        let pa = G.provinceData[p.provinceA];
        let pb = G.provinceData[p.provinceB];
        if (!pa || !pb || !pa.center || !pb.center) continue;
        
        // 检查点 = 两个省中心的中点
        let lon = (pa.center[0] + pb.center[0]) / 2;
        let lat = (pa.center[1] + pb.center[1]) / 2;
        checkpoints.push({ lon, lat, provinceA: p.provinceA, provinceB: p.provinceB });
    }
    return checkpoints;
}

// —— 3. 排序检查点形成连续战线 ——
// 贪心排序：从最北端点开始，每次找最近的未访问点
function sortCheckpoints(checkpoints) {
    if (checkpoints.length <= 1) return checkpoints;
    
    // 从最北（最大 lat）的点开始
    let sorted = [];
    let remaining = [...checkpoints];
    
    // 找最北端点
    let startIdx = 0, maxLat = -999;
    for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].lat > maxLat) { maxLat = remaining[i].lat; startIdx = i; }
    }
    sorted.push(remaining.splice(startIdx, 1)[0]);
    
    // 贪心连接最近的
    while (remaining.length > 0) {
        let last = sorted[sorted.length - 1];
        let bestIdx = 0, bestDist = 999;
        for (let i = 0; i < remaining.length; i++) {
            let d = Math.hypot(remaining[i].lon - last.lon, remaining[i].lat - last.lat);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        sorted.push(remaining.splice(bestIdx, 1)[0]);
    }
    
    return sorted;
}

// —— 4. 将战线均分为 N 段 ——
function segmentFrontline(checkpoints, numSegments) {
    if (checkpoints.length < 2) return [];
    
    // 计算沿线总长度和累计长度
    let cumLen = [0];
    for (let i = 1; i < checkpoints.length; i++) {
        let d = Math.hypot(
            checkpoints[i].lon - checkpoints[i-1].lon,
            checkpoints[i].lat - checkpoints[i-1].lat
        );
        cumLen.push(cumLen[i-1] + d);
    }
    let totalLen = cumLen[cumLen.length - 1];
    if (totalLen <= 0) return [];
    
    // 每段目标长度
    let segLen = totalLen / numSegments;
    
    // 沿折线采样点，生成均分段
    let segments = [];
    for (let s = 0; s < numSegments; s++) {
        let t0 = s * segLen;
        let t1 = (s + 1) * segLen;
        let p0 = interpolateOnLine(checkpoints, cumLen, t0, totalLen);
        let p1 = interpolateOnLine(checkpoints, cumLen, t1, totalLen);
        
        segments.push({
            id: 'seg_' + s,
            startLon: p0.lon, startLat: p0.lat,
            endLon: p1.lon, endLat: p1.lat,
            midLon: (p0.lon + p1.lon) / 2,
            midLat: (p0.lat + p1.lat) / 2,
            length: segLen,
            myStrength: 0,
            enemyStrength: 0,
            tension: 0,
            planningBonus: 0,
            groupId: null
        });
    }
    
    return { segments, totalLength: totalLen };
}

// 沿折线插值
function interpolateOnLine(points, cumLen, targetDist, totalLen) {
    if (points.length <= 1) return { lon: points[0].lon, lat: points[0].lat };
    let t = Math.max(0, Math.min(totalLen, targetDist));
    
    for (let i = 1; i < points.length; i++) {
        if (cumLen[i] >= t) {
            let segDist = cumLen[i] - cumLen[i-1];
            if (segDist <= 0) return { lon: points[i].lon, lat: points[i].lat };
            let frac = (t - cumLen[i-1]) / segDist;
            return {
                lon: points[i-1].lon + (points[i].lon - points[i-1].lon) * frac,
                lat: points[i-1].lat + (points[i].lat - points[i-1].lat) * frac
            };
        }
    }
    return { lon: points[points.length-1].lon, lat: points[points.length-1].lat };
}

// —— 5. 主函数：为两国生成战线 ——
function generateFrontline(countryA, countryB) {
    let pairs = findBorderProvincePairs(countryA, countryB);
    if (pairs.length === 0) return null;
    
    let checkpoints = pairsToCheckpoints(pairs);
    if (checkpoints.length < 2) return null;
    
    let sorted = sortCheckpoints(checkpoints);
    let totalLen = 0;
    for (let i = 1; i < sorted.length; i++) {
        totalLen += Math.hypot(sorted[i].lon - sorted[i-1].lon, sorted[i].lat - sorted[i-1].lat);
    }
    
    // 段数 = max(2, 总长度 / 4°) 但最少2段
    let numSeg = Math.max(2, Math.floor(totalLen / 4.0));
    let result = segmentFrontline(sorted, numSeg);
    if (!result || result.segments.length === 0) return null;
    
    return {
        id: 'fl_' + (G._flIdCounter || 10001),
        myCountry: countryA,
        enemyCountry: countryB,
        theater: getTheaterForCountries(countryA, countryB),
        checkpoints: sorted,
        segments: result.segments,
        totalLength: result.totalLength,
        lastRecalc: G.tick || 0
    };
}

// 根据两国判断战区
function getTheaterForCountries(a, b) {
    let WEST = ['FRANCE', 'BELGIUM', 'NETHERLANDS', 'UK'];
    let EAST = ['RUSSIA'];
    let ITALIAN = ['ITALY'];
    let BALKAN = ['AUSTRIA_HUNGARY', 'SERBIA', 'MONTENEGRO', 'BULGARIA', 'ROMANIA', 'GREECE', 'TURKEY'];
    
    let set = new Set([a, b]);
    if (set.size < 2) return 'UNKNOWN';
    
    if (WEST.some(c => set.has(c)) && (WEST.some(c => set.has(c)) || set.has('GERMANY'))) return 'WESTERN';
    if (EAST.some(c => set.has(c))) return 'EASTERN';
    if (ITALIAN.some(c => set.has(c))) return 'ITALIAN';
    if (BALKAN.some(c => set.has(c))) return 'BALKAN';
    return 'OTHER';
}

// ============================================================ 战线更新（每 tick 调用） ============================================================

// —— 6. 所有交战国的战线维护 ——
function updateAllFrontlines() {
    if (!G._frontlines) G._frontlines = {};
    if (!G._flIdCounter) G._flIdCounter = 20000;
    
    let tick = G.tick || 0;
    let allCountries = Object.keys(G.countries).filter(c => !G.surrendered[c]);
    
    for (let co of allCountries) {
        if (!isCountryAtWar(co)) {
            delete G._frontlines[co];
            continue;
        }
        
        let enemies = getEnemiesOf(co);
        if (enemies.length === 0) {
            delete G._frontlines[co];
            continue;
        }
        
        if (!G._frontlines[co]) G._frontlines[co] = [];
        let frontlines = G._frontlines[co];
        
        // 为每个交战邻国维护一条战线
        for (let ec of enemies) {
            // 检查是否接壤
            let pairs = findBorderProvincePairs(co, ec);
            if (pairs.length === 0) {
                // 不接壤，清除该战线
                frontlines = frontlines.filter(fl => fl.enemyCountry !== ec);
                continue;
            }
            
            // 每 30 tick 重算一次（或首次创建）
            let existingFl = frontlines.find(fl => fl.enemyCountry === ec);
            if (!existingFl || tick - existingFl.lastRecalc > 30) {
                let newFl = generateFrontline(co, ec);
                if (newFl) {
                    // 保留旧的兵力分配和计划加成
                    if (existingFl) {
                        newFl.segments.forEach((seg, i) => {
                            if (existingFl.segments[i]) {
                                seg.planningBonus = existingFl.segments[i].planningBonus || 0;
                                seg.groupId = existingFl.segments[i].groupId;
                            }
                        });
                    }
                    newFl.lastRecalc = tick;
                    // 替换
                    frontlines = frontlines.filter(fl => fl.enemyCountry !== ec);
                    frontlines.push(newFl);
                }
            }
        }
        
        // 清除不相邻的交战国战线
        frontlines = frontlines.filter(fl => {
            let p = findBorderProvincePairs(co, fl.enemyCountry);
            return p.length > 0;
        });
        
        G._frontlines[co] = frontlines;
    }
}

// ============================================================ 兵力分配 ============================================================

// —— 7. 分布兵力到战线段 ——
function distributeForcesToFrontline(country) {
    if (!G._frontlines || !G._frontlines[country]) return;
    let frontlines = G._frontlines[country];
    
    for (let fl of frontlines) {
        distributeForcesToSingleFrontline(fl, country);
    }
}

function distributeForcesToSingleFrontline(fl, country) {
    let enemies = getEnemiesOf(country);
    let segments = fl.segments;
    if (segments.length === 0) return;
    
    // 计算每段已有的敌我兵力
    for (let seg of segments) {
        seg.myStrength = 0;
        seg.enemyStrength = 0;
        
        for (let d of G.divisions) {
            if (d.strength <= 0) continue;
            let dist = Math.hypot(d.rx - seg.midLon, d.ry - seg.midLat);
            if (dist > 2.0) continue;
            
            if (d.country === country) seg.myStrength++;
            else if (enemies.includes(d.country)) seg.enemyStrength++;
        }
        
        seg.tension = Math.min(1.0, seg.enemyStrength / Math.max(1, seg.myStrength));
    }
    
    // 获取该战线的集团军（防守和预备）
    let armyGroups = [];
    if (G._armyGroups && G._armyGroups[country]) {
        armyGroups = G._armyGroups[country].filter(g =>
            (g.type === 'DEFENSIVE' || g.type === 'OFFENSIVE' || g.type === 'RESERVE') &&
            g.unitIds.length > 0
        );
    }
    
    // 如果没有集团军，直接分配散兵
    if (armyGroups.length === 0) {
        distributeLooseForces(country, fl);
        return;
    }
    
    // 分配集团军到战线段
    // 按紧张度排序段（高紧张的段优先获得兵力）
    let segCopy = segments.map((s, i) => ({ ...s, idx: i }));
    segCopy.sort((a, b) => b.tension - a.tension);
    
    // 集团军按大小排序（大组到高紧张段）
    armyGroups.sort((a, b) => b.unitIds.length - a.unitIds.length);
    
    let groupsUsed = new Set();
    for (let sg of segCopy) {
        let segIdx = sg.idx;
        let neededUnits = Math.max(1, Math.ceil(fl.totalLength / segments.length / 2));
        neededUnits += Math.ceil(sg.tension * 3); // 紧张段多要兵
        
        // 找最近的未分配集团军
        let bestGroup = null, bestDist = 999;
        for (let g of armyGroups) {
            if (groupsUsed.has(g.id)) continue;
            let d = Math.hypot(g.centerLon - segments[segIdx].midLon, g.centerLat - segments[segIdx].midLat);
            if (d < bestDist) { bestDist = d; bestGroup = g; }
        }
        
        if (bestGroup) {
            segments[segIdx].groupId = bestGroup.id;
            groupsUsed.add(bestGroup.id);
            
            // 移动集团军到战线段中点
            let members = getGroupMembers(bestGroup);
            moveToFrontlineSegment(members, segments[segIdx]);
        }
    }
}

// 散兵直接分配
function distributeLooseForces(country, fl) {
    let enemies = getEnemiesOf(country);
    let looseUnits = G.divisions.filter(d =>
        d.country === country && d.strength > 0 &&
        d.type !== 'navy' && d.type !== 'submarine' &&
        d.state !== 'retreating' &&
        !d._agId // 不在集团军内
    );
    
    if (looseUnits.length === 0) return;
    
    // 沿战线均匀分布
    spreadUnitsAlongLine(looseUnits, fl.segments);
}

function moveToFrontlineSegment(members, segment) {
    let count = members.length;
    if (count === 0) return;
    
    // 沿线段均匀分布
    let dx = segment.endLon - segment.startLon;
    let dy = segment.endLat - segment.startLat;
    
    for (let i = 0; i < count; i++) {
        let u = members[i];
        if (u.state === 'moving' || u.state === 'retreating') continue;
        
        let t = count > 1 ? (i + 0.5) / count : 0.5;
        let sx = segment.startLon + dx * t;
        let sy = segment.startLat + dy * t;
        
        // 后方偏置（不在战线正上方，后方 0.3°~0.5°）
        let offsetDist = 0.3 + Math.random() * 0.2;
        let nx = -(dy) / Math.max(0.5, Math.hypot(dx, dy));
        let ny = dx / Math.max(0.5, Math.hypot(dx, dy));
        sx += nx * offsetDist;
        sy += ny * offsetDist;
        
        let d = Math.hypot(u.rx - sx, u.ry - sy);
        if (d > 0.3) {
            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, sx, sy);
            else { u.state = 'moving'; u.targetX = sx; u.targetY = sy; }
        }
        u._aiTask = 'DEFEND_LINE';
        u._aiTaskTarget = { lon: sx, lat: sy };
    }
}

function spreadUnitsAlongLine(units, segments) {
    if (units.length === 0 || segments.length === 0) return;
    
    // 按紧张度加权分配
    let totalTension = 0;
    for (let seg of segments) totalTension += seg.tension + 0.1;
    
    let unitIdx = 0;
    for (let seg of segments) {
        let alloc = Math.max(1, Math.ceil(units.length * (seg.tension + 0.1) / totalTension));
        alloc = Math.min(alloc, units.length - unitIdx);
        
        let segUnits = units.slice(unitIdx, unitIdx + alloc);
        moveToFrontlineSegment(segUnits, seg);
        unitIdx += alloc;
        if (unitIdx >= units.length) break;
    }
}

// ============================================================ 计划加成 ============================================================

// —— 8. 计划加成积累 ——
function updatePlanningBonus(country) {
    if (!G._frontlines || !G._frontlines[country]) return;
    let tick = G.tick || 0;
    
    for (let fl of G._frontlines[country]) {
        for (let seg of fl.segments) {
            // 根据交战状态调整
            if (seg.tension > 0.8) {
                seg.planningBonus = Math.max(0, (seg.planningBonus || 0) - 3); // 大规模交战，计划被打乱
            } else if (seg.tension > 0.3) {
                seg.planningBonus = Math.min(100, (seg.planningBonus || 0) + 1); // 小规模交火，缓慢准备
            } else {
                seg.planningBonus = Math.min(100, (seg.planningBonus || 0) + 2); // 无交战，全速准备
            }
        }
    }
}

// —— 9. 获取计划加成（用于进攻/防守修饰） ——
function getPlanningBonusForGroup(groupId, country) {
    if (!G._frontlines || !G._frontlines[country]) return 0;
    
    for (let fl of G._frontlines[country]) {
        for (let seg of fl.segments) {
            if (seg.groupId === groupId) {
                return seg.planningBonus || 0;
            }
        }
    }
    return 0;
}

// —— 10. 总攻时消耗计划加成 ——
function consumePlanningBonus(groupId, country) {
    if (!G._frontlines || !G._frontlines[country]) return 0;
    
    for (let fl of G._frontlines[country]) {
        for (let seg of fl.segments) {
            if (seg.groupId === groupId) {
                let bonus = seg.planningBonus || 0;
                seg.planningBonus = 0; // 归零
                return bonus;
            }
        }
    }
    return 0;
}

// ============================================================ 战线可视化数据 ============================================================

// —— 11. 获取渲染数据（给 Canvas 用） ——
function getFrontlineRenderData() {
    let result = [];
    
    for (let co in G._frontlines) {
        for (let fl of G._frontlines[co]) {
            let data = {
                myCountry: co,
                enemyCountry: fl.enemyCountry,
                checkpoints: fl.checkpoints,
                segments: fl.segments.map(seg => ({
                    startLon: seg.startLon, startLat: seg.startLat,
                    endLon: seg.endLon, endLat: seg.endLat,
                    tension: seg.tension,
                    planningBonus: seg.planningBonus,
                    myStrength: seg.myStrength,
                    enemyStrength: seg.enemyStrength
                }))
            };
            result.push(data);
        }
    }
    
    return result;
}

// —— 12. 获取战线下一个目标城市（用于进攻集团军选目标） ——
function getFrontlineTargetCity(groupId, country) {
    if (!G._frontlines || !G._frontlines[country]) return null;
    let enemies = getEnemiesOf(country);
    
    for (let fl of G._frontlines[country]) {
        for (let seg of fl.segments) {
            if (seg.groupId !== groupId) continue;
            
            // 找该段前方最近的敌方城市
            let bestCity = null, bestScore = 9999;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
                let d = Math.hypot(ct.lon - seg.midLon, ct.lat - seg.midLat);
                let score = d - (ct.isCapital ? 3 : 0) - (ct.hp / (ct.maxHp || 100) < 0.5 ? 2 : 0);
                if (score < bestScore && d < 5.0) { bestScore = score; bestCity = ct; }
            }
            return bestCity;
        }
    }
    return null;
}

// ============================================================ 主调度 ============================================================

// —— 13. 每 tick 调用（轻量） ——
function updateFrontlineSystem(country) {
    let tick = G.tick || 0;
    
    // 战线几何更新（30 tick 一次）
    if (tick % 30 === 0) {
        updateAllFrontlines();
    }
    
    // 兵力分布更新（15 tick 一次）
    if (tick % 15 === 0) {
        distributeForcesToFrontline(country);
    }
    
    // 计划加成累积（每 tick）
    updatePlanningBonus(country);
}
