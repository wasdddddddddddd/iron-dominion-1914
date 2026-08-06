// ============================================================
// Iron & Dominion 1914 — AI 战斗系统（通用化重写）
//
// 设计原则：不针对任何国家写死策略（希腊是德国也能打赢）。
// 一切决策由"当前局势"推导：
//
//  1. 防御：先评估本国每座城市的威胁（首都>大城市>小城；被围攻/掉血/敌近 → 高分），
//     按威胁从高到低分配守军；防御总配额随兵力对比自适应
//     （劣势多守 40% → 碾压少守 8%）；威胁消失的守军自动释放回进攻。
//  2. 进攻：所有非守军单位按地理位置聚成"战区簇"，每簇独立评估敌城：
//     近的、残血的、守军少的、价值高的、友军正在围攻的 → 集中打同一个目标。
//     已围攻目标加权极高（不半途而废），不会全军跨地图乱跑。
//  3. 中立占领：有余力才派 1~2 个单位踩附近中立城。
//  4. 卡住处理：卡 20tick 绕路，卡 40tick 放弃重新评估。
// ============================================================

// —— 工具函数 ——

// 获取本国有战斗力的陆地单位（使用updateAI中的全局缓存，零分配）
function getMyCombatUnits(country) {
    return (G._divCache && G._divCache.byCountryCombat[country]) || [];
}

// 单位距离
function unitDist(u, tx, ty) {
    return Math.hypot(u.rx - tx, u.ry - ty);
}

// 找最近的空闲非火炮单位（无任何任务标记）
function findNearestFreeUnit(city, country, maxDist, excludeArtillery) {
    let best = null, bestDist = maxDist || 999;
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0 || d.state === 'retreating') continue;
        if (d._aiTask) continue; // 已有任何任务的不调
        if (excludeArtillery && d.type === 'artillery') continue;
        if (d.type === 'navy' || d.type === 'submarine') continue;
        let dd = unitDist(d, city.lon, city.lat);
        if (dd < bestDist) { bestDist = dd; best = d; }
    }
    return best;
}

// 移动单位到目标
function moveTo(u, lon, lat) {
    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, lon, lat);
    else { u.state = 'moving'; u.targetX = lon; u.targetY = lat; }
}

// —— 寻路修复：检查路径是否经过中立国领土 ——
function isPointInNeutralCountry(lon, lat, myCountry) {
    if (typeof getProvinceAt !== 'function') return false;
    let pid = getProvinceAt(lon, lat);
    if (!pid) return false;
    let pd = G.provinceData[pid];
    if (!pd || !pd.country) return false;
    if (pd.country === myCountry) return false;
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(myCountry) : [];
    if (enemies.includes(pd.country)) return false; // 敌国领土不是中立
    return true; // 是中立国
}

function pathBlockedByNeutral(fromLon, fromLat, toLon, toLat, myCountry) {
    let dx = toLon - fromLon, dy = toLat - fromLat;
    let totalDist = Math.hypot(dx, dy);
    if (totalDist < 0.2) return false;
    let steps = 5;
    for (let i = 1; i < steps; i++) {
        let t = i / steps;
        let sx = fromLon + dx * t;
        let sy = fromLat + dy * t;
        if (isPointInNeutralCountry(sx, sy, myCountry)) return true;
    }
    return false;
}

// 找一个绕路点：在目标方向的己方城市
function findWaypointAroundNeutral(fromLon, fromLat, toLon, toLat, myCountry) {
    let dx = toLon - fromLon, dy = toLat - fromLat;
    let bestCity = null, bestScore = -9999;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.owner !== myCountry || ct.hp <= 0) continue;
        let toTarget = Math.hypot(ct.lon - toLon, ct.lat - toLat);
        if (toTarget > 15) continue;
        let proj = ((ct.lon - fromLon) * dx + (ct.lat - fromLat) * dy) / Math.max(0.01, dx * dx + dy * dy);
        if (proj < 0.2) continue;
        if (pathBlockedByNeutral(ct.lon, ct.lat, toLon, toLat, myCountry)) continue;
        let distCurrent = Math.hypot(ct.lon - fromLon, ct.lat - fromLat);
        let score = -distCurrent + toTarget * (-0.5);
        if (score > bestScore) { bestScore = score; bestCity = ct; }
    }
    return bestCity;
}

// 安全移动：自动绕开中立国
function safeMoveTo(u, lon, lat, myCountry) {
    if (!pathBlockedByNeutral(u.rx, u.ry, lon, lat, myCountry)) {
        moveTo(u, lon, lat);
        return;
    }
    let wp = findWaypointAroundNeutral(u.rx, u.ry, lon, lat, myCountry);
    if (wp) {
        moveTo(u, wp.lon, wp.lat);
        u._waypoint = { lon: lon, lat: lat };
    } else {        moveTo(u, lon, lat);
    }
}

// 处理到达绕路点的单位——继续走向真实目标
function handleWaypoints(country) {
    for (let d of G.divisions) {
        if (d.country !== country || !d._waypoint) continue;
        if (d.state !== 'idle') continue;
        let dist = Math.hypot(d.rx - d._waypoint.lon, d.ry - d._waypoint.lat);
        if (dist < 0.5) {
            d._waypoint = null;
        } else {
            safeMoveTo(d, d._waypoint.lon, d._waypoint.lat, country);
        }
    }
}

// ============================================================
// 1. 态势评估（通用）：兵力对比 + 本国城市威胁表
// ============================================================
function assessSituation(country, enemies) {
    let myCount = getMyCombatUnits(country).length;
    let enemyCount = 0;
    for (let d of G.divisions) {
        if (d.strength <= 0 || d.type === 'navy' || d.type === 'submarine') continue;
        if (enemies.includes(d.country)) enemyCount++;
    }
    let ratio = myCount / Math.max(1, enemyCount);

    // 城市威胁表：只收录"值得守"的城市
    let threats = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0 || ct.owner !== country) continue;
        let hpR = (ct.hp || 100) / (ct.maxHp || 100);
        let threat = 0;
        let enemyNear = 0, enemyDist = 999;
        for (let d of G.divisions) {
            if (d.strength <= 0 || !enemies.includes(d.country)) continue;
            if (G.surrendered && G.surrendered[d.country]) continue; // 投降国残兵不算威胁
            let dist = Math.hypot(d.rx - ct.lon, d.ry - ct.lat);
            if (dist < enemyDist) enemyDist = dist;
            if (dist < 1.5) enemyNear++;
        }
        if (enemyDist < 0.5) threat += 60;      // 敌人在城下
        else if (enemyDist < 1.0) threat += 40;
        else if (enemyDist < 2.0) threat += 20;
        else if (enemyDist < 3.5) threat += 8;
        threat += enemyNear * 8;
        if (hpR < 0.9) threat += (1 - hpR) * 40; // 掉血越多越危险
        if (ct.isCapital) threat += 25;           // 首都保底权重
        else if (typeof isMajorCity === 'function' && isMajorCity(ct.id)) threat += 10;

        if (threat > 0) threats.push({ city: ct, threat, enemyDist });
    }
    threats.sort((a, b) => b.threat - a.threat);
    return { myCount, enemyCount, ratio, threats };
}

// ============================================================
// 2. 防御分配（通用）：按威胁从高到低给城市派守军
// ============================================================

// 该城当前己方守军数
function countDefendersAt(city, country) {
    let n = 0;
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'DEFEND_CITY' || !d._aiTaskTarget) continue;
        if (Math.hypot(d._aiTaskTarget.lon - city.lon, d._aiTaskTarget.lat - city.lat) < 0.3) n++;
    }
    return n;
}

// 释放失守/失威胁的守军（回进攻池）
// 核心：只看"城周围 1.5° 内有没有敌军"——有才守，没有就释放（不管城血，伤城自己会修复）。
// 并强制防御上限：守军总数超过配额时，从威胁最低的城逐批释放，绝不把主力拖在后方。
function releaseStaleDefenders(country, enemies, defCap) {
    // 第一步：逐单位释放失威胁守军
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'DEFEND_CITY' || !d._aiTaskTarget) continue;
        if (d.strength <= 0) { d._aiTask = null; d._aiTaskTarget = null; continue; }
        let hasThreat = false;
        for (let e of G.divisions) {
            if (e.strength <= 0) continue;
            if (!enemies.includes(e.country)) continue;
            // 已投降国家的残兵不算威胁（法国投降后其残兵不应让守军死守不释放）
            if (G.surrendered && G.surrendered[e.country]) continue;
            if (Math.hypot(e.rx - d._aiTaskTarget.lon, e.ry - d._aiTaskTarget.lat) < 1.5) {
                hasThreat = true; break;
            }
        }
        if (!hasThreat) {
            d._peaceTicks = (d._peaceTicks || 0) + 1;
            if (d._peaceTicks > 15) {
                d._aiTask = null; d._aiTaskTarget = null; d._peaceTicks = 0;
            }
        } else {
            d._peaceTicks = 0;
        }
    }
    // 第二步：超过防御配额 → 释放威胁最低的守军（按守军离城距离/城市威胁粗排）
    let defenders = [];
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'DEFEND_CITY' || !d._aiTaskTarget) continue;
        defenders.push(d);
    }
    if (defenders.length > defCap) {
        // 按"最近敌军距离"升序排（越危险越保留）；每个守军取它目标城附近的敌军最小距离
        let scored = defenders.map(d => {
            let minEd = 999;
            for (let e of G.divisions) {
                if (e.strength > 0 && enemies.includes(e.country)) {
                    if (G.surrendered && G.surrendered[e.country]) continue; // 投降国残兵不算
                    let dd = Math.hypot(e.rx - d._aiTaskTarget.lon, e.ry - d._aiTaskTarget.lat);
                    if (dd < minEd) minEd = dd;
                }
            }
            return { d, minEd };
        });
        scored.sort((a, b) => b.minEd - a.minEd); // 敌军最远的先释放
        let excess = scored.length - defCap;
        for (let i = 0; i < excess && i < scored.length; i++) {
            scored[i].d._aiTask = null; scored[i].d._aiTaskTarget = null; scored[i].d._peaceTicks = 0;
        }
    }
}

// 计算防御配额（通用，供释放与分配共用）
// 原则：① 兵力劣势多守、优势少守；② 被围攻的城市越多守得越多（两线作战不能只守15%）。
function computeDefCap(sit) {
    let defRatio = 0.15;
    if (sit.ratio < 0.5) defRatio = 0.40;
    else if (sit.ratio < 0.8) defRatio = 0.30;
    else if (sit.ratio < 1.2) defRatio = 0.22;
    else if (sit.ratio > 2.5) defRatio = 0.08;
    // 正在被围攻/掉血的城市数：≥3 个前线告急时，防御配额最低 30%（两线作战防崩盘）
    let urgent = sit.threats.filter(t => t.threat >= 40).length;
    if (urgent >= 5) defRatio = Math.max(defRatio, 0.35);
    else if (urgent >= 3) defRatio = Math.max(defRatio, 0.28);
    else if (urgent >= 1) defRatio = Math.max(defRatio, 0.18);
    let maxThreat = sit.threats.length ? sit.threats[0].threat : 0;
    if (maxThreat >= 80) defRatio = Math.max(defRatio, 0.45);
    if (sit.threats.length === 0) defRatio = Math.min(defRatio, 0.06); // 无威胁几乎不守
    return Math.max(3, Math.floor(sit.myCount * defRatio));
}

function assignDefenders(country, enemies, sit, defCap) {
    let used = 0;
    for (let t of sit.threats) {
        // 只守"真威胁"城市：敌人在 1° 内或城市掉血（threat≥45）；边境远处有敌军不算
        if (t.threat < 45) continue;
        if (used >= defCap && t.threat < 80) break; // 配额用尽，只保留正在被围攻的城
        let have = countDefendersAt(t.city, country);
        let need = t.threat >= 80 ? 3 : 2;
        let shortage = Math.max(0, need - have);
        for (let i = 0; i < shortage; i++) {
            if (used >= defCap && t.threat < 80) break;
            let u = findNearestFreeUnit(t.city, country, 25, true);
            if (!u) {
                // 自由单位不够 → 从进攻单位中撤最近的回来防守（退回战线守本土）
                u = recallNearestAttacker(t.city, country);
                if (!u) break;
            }
            safeMoveTo(u, t.city.lon, t.city.lat, country);
            u._aiTask = 'DEFEND_CITY';
            u._aiTaskTarget = { lon: t.city.lon, lat: t.city.lat };
            u._stuckTicks = 0; u._peaceTicks = 0;
            used++;
        }
    }
    return used;
}

// 本土被围攻但无自由单位可守时：撤回离守城最近的攻击单位（放弃进攻，回来守本土）
function recallNearestAttacker(city, country) {
    let best = null, bestDist = 999;
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'ATTACK' || !d._aiTaskTarget) continue;
        if (d.strength <= 0 || d.state === 'retreating') continue;
        if (d.type === 'artillery') continue; // 火炮不撤（在后方开火）
        let dist = Math.hypot(d.rx - city.lon, d.ry - city.lat);
        if (dist < bestDist) { bestDist = dist; best = d; }
    }
    if (best) {
        best._aiTask = null; best._aiTaskTarget = null; best._peaceTicks = 0; // 释放回防守池
    }
    return best;
}

// ============================================================
// 3. 进攻分配（通用）：按地理位置聚簇，每簇集中打一个目标
// ============================================================

// 收集所有可参战单位（空闲 + 已有ATTACK任务；校验旧目标是否还有效）
function collectFreeUnits(country, enemies) {
    let list = [];
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0 || d.state === 'retreating') continue;
        if (d.type === 'navy' || d.type === 'submarine') continue;
        if (d._aiTask === 'DEFEND_CITY') continue;
        if (d._aiTask === 'ATTACK' && d._aiTaskTarget) {
            // 校验旧目标是否还是敌城（且该国未投降），无效则清除
            let valid = false;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (ct && ct.hp > 0 && enemies.includes(ct.owner) &&
                    !(G.surrendered && G.surrendered[ct.owner]) &&
                    Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.4) {
                    valid = true; break;
                }
            }
            if (!valid) { d._aiTask = null; d._aiTaskTarget = null; }
            else { list.push(d); continue; }
        }
        if (!d._aiTask) list.push(d);
    }
    return list;
}

// 单位按位置聚簇（战区簇，5°内一簇）
function clusterUnits(units) {
    let clusters = [];
    let used = new Set();
    // 按 x 坐标排序：聚类时只比较相邻单位，把 O(n²) 降为近似 O(n log n)
    let sorted = units.slice().sort((a, b) => a.rx - b.rx);
    for (let u of sorted) {
        if (used.has(u.id)) continue;
        let cl = [u]; used.add(u.id);
        for (let v of sorted) {
            if (used.has(v.id)) continue;
            // x 差 > 5° 就不可能在同一簇（簇半径 5°），提前终止内层循环
            if (v.rx - u.rx > 5.0) break;
            if (Math.hypot(u.rx - v.rx, u.ry - v.ry) < 5.0) { cl.push(v); used.add(v.id); }
        }
        clusters.push(cl);
    }
    // 大簇拆分：>35 个单位的簇按空间分成多个子簇，每个子簇独立选目标
    // → 并行攻城，避免几十个师全堆同一座城（串行推进，灭大国太慢）
    let out = [];
    for (let cl of clusters) {
        if (cl.length <= 35) { out.push(cl); continue; }
        for (let s of splitCluster(cl)) out.push(s);
    }
    return out;
}

// 把一个簇按空间拆成多个 ≤25 人的子簇（最近邻归组）
function splitCluster(cl) {
    let subs = [];
    let remaining = cl.slice();
    while (remaining.length > 0) {
        let sub = [remaining[0]];
        remaining.splice(0, 1);
        for (let i = remaining.length - 1; i >= 0; i--) {
            let v = remaining[i];
            if (sub.length >= 25) break;
            let near = false;
            for (let m of sub) {
                if (Math.hypot(m.rx - v.rx, m.ry - v.ry) < 2.5) { near = true; break; }
            }
            if (near) { sub.push(v); remaining.splice(i, 1); }
        }
        subs.push(sub);
    }
    return subs;
}

// 派单位进入攻城位（火炮保持射程外、骑兵侧翼、步兵贴城）
// 关键：任何单位在移动中遇到"射程内的敌军" → 立即停住接火，绝不继续突进送死。
// 火炮尤其：永远站在敌人射程边缘外，绝不跑到敌军面前。
function moveUnitToSiege(u, city, country) {
    let tx = city.lon, ty = city.lat;
    let _ut = UNIT_TYPES[u.type] || UNIT_TYPES.infantry;
    let myRange = _ut.range || 0.2;
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    // 已就位保护：正在围攻该城（focusCity 已设且距离在射程内）→ 直接返回，不重复下移动命令打断开火
    let udInit = Math.hypot(u.rx - tx, u.ry - ty);
    let reachInit = Math.max(0.32, myRange * 1.35 + 0.05);
    if (u.focusCity === city.id && udInit <= reachInit && u.state === 'idle') return;

    // 身边有敌军在射程内 → 停火迎战（炮兵阈值更严，1.15×射程就停，保持距离）
    let engageRange = myRange * (u.type === 'artillery' ? 1.15 : 1.5);
    let stopAndFight = false;
    for (let e of G.divisions) {
        if (e.strength <= 0 || e.country === country) continue;
        if (e.type === 'navy' || e.type === 'submarine') continue;
        if (!enemies.includes(e.country)) continue;
        if (Math.hypot(e.rx - u.rx, e.ry - u.ry) < engageRange) { stopAndFight = true; break; }
    }
    if (stopAndFight) {
        u.state = 'idle';
        u.targetX = null; u.targetY = null;
        // 清除攻城焦点，交给 fireUnits 自动索敌开火（避免死磕城市、无视眼前敌人）
        if (u.focusCity === city.id) u.focusCity = null;
        u.focusFactory = null;
        return;
    }

    // ── 集结机制（杜绝"一个一个排队送死"）──
    // 目标城 3° 内的己方围攻编队（含集结圈内外 + 正在赶来的）不足 RALLY_MIN 人时，
    // 单位先停在外围集结位等待，不进入射程、不单独开打；等队友陆续到达凑够编队，
    // 再一起进入射程围攻。炮兵例外：本身在射程外开火，不需贴脸集结。
    if (u.type !== 'artillery') {
        let formation = 0;
        for (let f of G.divisions) {
            if (f.country !== country || f.strength <= 0 || f.type === 'navy' || f.type === 'submarine') continue;
            if (f._aiTask === 'DEFEND_CITY') continue;
            if (Math.hypot(f.rx - tx, f.ry - ty) < 3.0) formation++;
        }
        const RALLY_MIN = 6;
        const RALLY_DIST = 1.8; // 集结圈半径：编队不足时停在此处，不进射程
        let udNow = Math.hypot(u.rx - tx, u.ry - ty);
        // 集结等待计时：连续等待过久（编队实在凑不够）→ 即使 3 人也要开打，避免永远发呆
        if (formation < RALLY_MIN && udNow > 0.6) {
            u._rallyTicks = (u._rallyTicks || 0) + 1;
        } else {
            u._rallyTicks = 0;
        }
        if (formation < RALLY_MIN && u._rallyTicks < 120 && udNow > 0.6) {
            // 移到距城 RALLY_DIST 的集结位（从当前位置向城方向，保持 RALLY_DIST 距离）
            let dx = tx - u.rx, dy = ty - u.ry;
            let dist = Math.max(0.01, Math.hypot(dx, dy));
            let mx = u.rx + (dx / dist) * (dist - RALLY_DIST);
            let my = u.ry + (dy / dist) * (dist - RALLY_DIST);
            safeMoveTo(u, mx, my, country);
            u.focusCity = null; // 不设攻城焦点 → 不会进射程
            return;
        }
    }

    if (u.type === 'artillery') {
        let artRange = (UNIT_TYPES.artillery || { range: 0.675 }).range;
        let desiredDist = artRange * 0.85;
        let dx = tx - u.rx, dy = ty - u.ry;
        let dist = Math.max(0.01, Math.hypot(dx, dy));
        let mx = u.rx + (dx / dist) * (dist - desiredDist);
        let my = u.ry + (dy / dist) * (dist - desiredDist);
        safeMoveTo(u, mx, my, country);
        if (dist <= artRange) {
            u.state = 'idle'; u.targetX = null; u.targetY = null;
            u.focusCity = city.id;
        }
    } else if (u.type === 'cavalry') {
        let angle = Math.atan2(ty - u.ry, tx - u.rx);
        let side = angle + Math.PI / 4;
        safeMoveTo(u, tx - Math.cos(side) * 0.3, ty - Math.sin(side) * 0.3, country);
    } else {
        safeMoveTo(u, tx, ty, country);
    }
    // 到位判定（按射程放宽，nearestLand 偏移也能开眼打城）
    let ud = Math.hypot(u.rx - tx, u.ry - ty);
    let reach = Math.max(0.32, myRange * 1.35 + 0.05);
    if (u.type !== 'artillery' && u.type !== 'cavalry' && ud <= reach) {
        u.state = 'idle'; u.targetX = null; u.targetY = null;
        u.focusCity = city.id;
    }
}

// ── 陆地/海洋网格缓存（地形静态，一次性构建，供穿海判定 O(1) 查询）──
let _landGrid = null;
function landGrid() {
    if (_landGrid) return _landGrid;
    let CELL = 0.1, minLon = -12, maxLon = 50, minLat = 28, maxLat = 76;
    let cols = Math.ceil((maxLon - minLon) / CELL), rows = Math.ceil((maxLat - minLat) / CELL);
    let g = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (isLandPoint(minLon + (c + 0.5) * CELL, minLat + (r + 0.5) * CELL)) g[r * cols + c] = 1;
        }
    }
    _landGrid = { g, cols, rows, minLon, minLat, CELL };
    return _landGrid;
}
function gridIsLand(lon, lat) {
    let lg = _landGrid;
    let cx = Math.floor((lon - lg.minLon) / lg.CELL), cy = Math.floor((lat - lg.minLat) / lg.CELL);
    if (cx < 0 || cx >= lg.cols || cy < 0 || cy >= lg.rows) return false;
    return lg.g[cy * lg.cols + cx] === 1;
}

// 直线是否穿海（网格 O(1) 查询 + 每 0.3° 采样，能识别英吉利海峡这类窄水道）
function pathCrossesWater(cx, cy, lon, lat) {
    if (typeof isLandPoint !== 'function') return false;
    if (!_landGrid) landGrid(); // 惰性构建一次
    let dx = lon - cx, dy = lat - cy;
    let total = Math.hypot(dx, dy);
    if (total < 0.3) return false;
    let steps = Math.max(6, Math.ceil(total / 0.3));
    for (let i = 1; i < steps; i++) {
        let t = i / steps;
        if (!gridIsLand(cx + dx * t, cy + dy * t)) return true;
    }
    return false;
}

// 选"主攻方向"敌国（通用，不写死国家）：
// 原则 = 集中兵力打"陆路打得赢、值得打"的敌人，其余敌人只防守牵制（击破逐个）。
// 评分：该敌国可触达城市价值 - 其可触达兵力（弱敌优先打，价值高优先打）。
// 修复：隔海国家（如英国）即使弱也不能当主攻——到不了，去了就是白送。
function pickMainEnemy(country, enemies, units) {
    if (!enemies || enemies.length === 0) return null;
    if (enemies.length === 1) return enemies[0];
    // 用"我方城市质心"而非单位质心：单位质心会随部队调动漂移（德军主力在东线→质心偏东→
    // 主攻误选俄国），城市质心稳定，确保主攻选择不随战局抖动。
    let cx = 0, cy = 0, myN = 0;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct && ct.hp > 0 && ct.owner === country) { cx += ct.lon; cy += ct.lat; myN++; }
    }
    if (myN > 0) { cx /= myN; cy /= myN; }
    else { for (let u of units) { cx += u.rx; cy += u.ry; } if (units.length > 0) { cx /= units.length; cy /= units.length; } }

    let bestE = null, bestScore = -9999;
    // 硬规则：只要还有未投降的列强敌人，主攻就只在列强里选（打赢列强=赢下战争，小国顺手灭）。
    // 之前列强只是+60软加分，法国兵多被"兵力弱优先"惩罚（-3/单位），卢森堡兵少反而得高分
    // → 德国148个师全去堆卢森堡一座城，不打法国。改为硬规则后绝无此问题。
    let hasGPRival = false;
    for (let e of enemies) {
        if (G.surrendered[e]) continue;
        if (typeof isGreatPower === 'function' && isGreatPower(e)) { hasGPRival = true; break; }
    }
    for (let e of enemies) {
        if (G.surrendered[e]) continue;
        let eIsGP = (typeof isGreatPower === 'function') ? isGreatPower(e) : false;
        if (hasGPRival && !eIsGP) continue; // 有列强敌人在 → 小国不参选主攻

        let ePower = 0, eValue = 0, reachableCity = false, eThreat = 0;
        // 该敌国在"我方城市质心" 25° 内的兵力
        for (let d of G.divisions) {
            if (d.strength <= 0 || d.type === 'navy' || d.type === 'submarine' || d.country !== e) continue;
            if (Math.hypot(d.rx - cx, d.ry - cy) < 25) ePower++;
            // 威胁：该敌国单位深入我方领土（我方城市 8° 内）→ 正在进攻本土 = 最高优先级
            let nearHome = false;
            for (let cidH in G.cities) {
                let ctH = G.cities[cidH];
                if (!ctH || ctH.hp <= 0 || ctH.owner !== country) continue;
                if (Math.hypot(d.rx - ctH.lon, d.ry - ctH.lat) < 8) { nearHome = true; break; }
            }
            if (nearHome) eThreat++;
        }
        // 该敌国可触达城市的战略价值（隔海的城不算）
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!ct || ct.hp <= 0 || ct.owner !== e) continue;
            if (Math.hypot(ct.lon - cx, ct.lat - cy) > 25) continue;
            if (pathCrossesWater(cx, cy, ct.lon, ct.lat)) continue; // 隔海 → 不可达，不算价值
            reachableCity = true;
            if (ct.isCapital) eValue += 5;
            else if (typeof isMajorCity === 'function' && isMajorCity(ct.id)) eValue += 2;
            else eValue += 1;
        }
        if (!reachableCity) continue; // 一个陆路可达的城都没有 → 不能当主攻
        // 击破进度：已被我方/盟友占领的该国城市越多 → 越要乘胜追击彻底灭掉（完成击杀）
        let captured = 0;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!ct || ct.originalCountry !== e || ct.owner === e || ct.hp <= 0) continue;
            captured++;
        }
        // 评分：价值高 + 威胁大（进攻我方本土优先打）+ 击破进度 + 兵力弱（弱敌优先逐个击破）
        let score = eValue * 2.0 - ePower * 3.0 + captured * 1.0 + eThreat * 5.0;
        if (score > bestScore) { bestScore = score; bestE = e; }
    }
    return bestE;
}

// 为一簇单位选最优攻击目标（通用评分；主攻方向内选，够不着才打本地其他敌）
function bestTargetForCluster(cluster, country, enemies, mainEnemy) {
    // 簇中心
    let cx = 0, cy = 0;
    for (let u of cluster) { cx += u.rx; cy += u.ry; }
    cx /= cluster.length; cy /= cluster.length;

    // 可调用兵力：簇本身 + 10° 内非守军友军
    let myStrength = cluster.length;
    for (let f of G.divisions) {
        if (f.country !== country || f.strength <= 0 || f._aiTask === 'DEFEND_CITY') continue;
        if (f.type === 'navy' || f.type === 'submarine') continue;
        if (Math.hypot(f.rx - cx, f.ry - cy) < 10) myStrength++;
    }

    // 己方正在围攻的敌城（含本簇 + 其他簇）→ 轻加权（并行攻城，避免全堆一城）
    // 由 assignAttackers 一次性构建传入，避免每簇重复 O(n×m)
    let siegedSet = arguments.length > 4 ? arguments[4] : null;
    if (!siegedSet) {
        siegedSet = new Set();
        for (let d of G.divisions) {
            if (d.country !== country || d._aiTask !== 'ATTACK' || !d._aiTaskTarget) continue;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (ct && ct.hp > 0 && enemies.includes(ct.owner) &&
                    Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.4) {
                    siegedSet.add(cid); break;
                }
            }
        }
    }

    let best = null, bestScore = -9999;
    // 先粗筛：收集 18° 内敌城，按廉价预评分取前 24 名，再做完整判定（控制开销）
    // 18° 覆盖德国西线→巴黎/里昂/波尔多整条法国战线（13° 会漏南部法国城 → 跑去打卢森堡）
    let cands = [];
    let reachMain = false; // 本簇是否够得着主攻敌国
    if (mainEnemy) {
        for (let cid2 in G.cities) {
            let ct2 = G.cities[cid2];
            if (ct2 && ct2.hp > 0 && ct2.owner === mainEnemy &&
                Math.hypot(ct2.lon - cx, ct2.lat - cy) <= 18) { reachMain = true; break; }
        }
    }
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
        if (G.surrendered && G.surrendered[ct.owner]) continue; // 投降国城市不再打
        let dist = Math.hypot(ct.lon - cx, ct.lat - cy);
        if (dist > 18) continue; // 只打 18° 内（防跨地图乱跑）
        // 主攻方向硬过滤：一旦选定主攻敌国，所有簇只打主攻敌国（够不着就待命，
        // 绝不跑去打其他敌国开第二条战线——两线作战是兵力分散、谁都打不穿的根源）。
        if (mainEnemy && ct.owner !== mainEnemy) continue;
        // 直线穿海 → 不可达（英吉利海峡等窄水道也要识别，避免隔海打城白送）
        if (pathCrossesWater(cx, cy, ct.lon, ct.lat)) continue;
        let pre = -dist * 2 + (ct.isCapital ? 30 : 0) + (ct.hp < (ct.maxHp || 100) * 0.5 ? 50 : 0);
        cands.push({ ct, dist, pre });
    }
    cands.sort((a, b) => b.pre - a.pre);
    if (cands.length > 24) cands.length = 24;

    for (let cd of cands) {
        let ct = cd.ct, cid = ct.id, dist = cd.dist;
        // 主攻方向围攻数限制：已在围攻的敌城 ≥3 座时，新簇只能增援已有围攻城，
        // 不能新开战线（集中兵力快速拿下，避免 300 师分散打 10 座城谁都打不动）。
        // 例外：主攻敌国剩余城市 ≤8（残敌收尾）→ 解除限制，全力歼灭所有剩余城。
        let moppingUp = false;
        if (mainEnemy) {
            let remain = 0;
            for (let cidR in G.cities) {
                let ctR = G.cities[cidR];
                if (ctR && ctR.hp > 0 && ctR.owner === mainEnemy) remain++;
            }
            if (remain <= 8) moppingUp = true;
        }
        if (!moppingUp && siegedSet.size >= 3 && !siegedSet.has(cid)) continue;
        // 守军：统计城下 1.5° 内该敌国全部单位（含附近能增援的，避免以弱冲强送死）
        let defenders = 0;
        for (let d of G.divisions) {
            if (d.strength > 0 && d.country === ct.owner &&
                Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) defenders++;
        }
        let hpR = (ct.hp || 100) / (ct.maxHp || 100);

        // 打得下才打：本地兵力 ≥ 守军×1.25（残血城×0.8）——留安全余量，杜绝送死
        let minRatio = hpR < 0.5 ? 0.8 : 1.25;
        if (myStrength < defenders * minRatio) continue;

        // 评分：近 + 残血 + 少守军 + 首都/大城市重权（灭国必须打首都才能触发投降）+ 已围攻增援
        let score = -dist * 2
            + (hpR < 0.5 ? 50 : 0)
            + (defenders <= 1 ? 40 : 0)
            + (ct.isCapital ? 80 : 0)
            + (typeof isMajorCity === 'function' && isMajorCity(ct.id) ? 30 : 0)
            - defenders * 8;
        // 友军正在围攻 → 强增援加权（集中兵力打同一批城，快速拿下再开新城）
        if (siegedSet.has(cid)) score += 40;
        if (score > bestScore) { bestScore = score; best = { city: ct, score }; }
    }
    return best;
}

function assignAttackers(country, enemies, units) {
    if (units.length === 0) return;
    // ── 战区划分（通用）：有 _theater 标记的单位按战区独立决策；无标记的按位置归属 ──
    // 德国东部（东普鲁士/但泽/布雷斯劳，rx>16）生产单位 _theater='EAST' → 只打俄国；
    // 西部单位 _theater='WEST' → 只打西线（法国/比利时/卢森堡）。每个战区独立选主攻、
    // 独立组集团军，保证东线有兵压俄国、西线全力打法国，不会全部涌向一个方向。
    let theaterGroups = {};
    for (let u of units) {
        let th = u._theater || (u.rx > 16.0 && country === 'GERMANY' ? 'EAST' : 'WEST');
        if (!theaterGroups[th]) theaterGroups[th] = [];
        theaterGroups[th].push(u);
    }
    for (let th in theaterGroups) {
        let tUnits = theaterGroups[th];
        if (tUnits.length === 0) continue;
        // 该战区可选敌人：EAST 战区只打俄国方向，WEST 战区只打西线方向
        let tEnemies = enemies;
        if (th === 'EAST') {
            let eastEnemies = enemies.filter(e => ['RUSSIA', 'FINLAND'].includes(e));
            if (eastEnemies.length > 0) tEnemies = eastEnemies;
        } else if (th === 'WEST') {
            let westEnemies = enemies.filter(e => ['FRANCE', 'BELGIUM', 'LUXEMBOURG', 'UK', 'NETHERLANDS', 'SPAIN', 'PORTUGAL', 'ITALY'].includes(e));
            if (westEnemies.length > 0) tEnemies = westEnemies;
        }
        if (tEnemies.length === 0) continue;
        // 主攻方向（战区独立）
        let mainEnemy = pickMainEnemy(country, tEnemies, tUnits);
        if (!mainEnemy) continue;
        // 一次性构建该战区"正被围攻的敌城"集合
        let siegedSet = new Set();
        for (let d of G.divisions) {
            if (d.country !== country || d._aiTask !== 'ATTACK' || !d._aiTaskTarget) continue;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (ct && ct.hp > 0 && tEnemies.includes(ct.owner) &&
                    Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.4) {
                    siegedSet.add(cid); break;
                }
            }
        }
        // ── 集团军集中（稳扎稳打，杜绝排队送死）──
        // 兵力少（<60）→ 整个战区合并成一个大集团军，全部打同一座城：
        // 50 个师分 10 队各自进攻 = 每队 5 人送死；50 个师一起围一座城 = 破城。
        // 兵力多（≥60）→ 才拆成子集团军并行打 2-3 座城。
        let clusters;
        if (tUnits.length < 60) {
            clusters = [tUnits]; // 全员一个集团军，只打一座城
        } else {
            clusters = clusterUnits(tUnits);
        }
        for (let cl of clusters) {
            if (cl.length === 0) continue;
            let target = bestTargetForCluster(cl, country, tEnemies, mainEnemy, siegedSet);
            if (!target) continue; // 没得打就待命（不瞎跑）
            for (let u of cl) {
                moveUnitToSiege(u, target.city, country);
                u._aiTask = 'ATTACK';
                u._aiTaskTarget = { lon: target.city.lon, lat: target.city.lat };
                u._stuckTicks = 0;
            }
        }
    }
}

// ============================================================
// 4. 中立城市自动占领（通用，仅少量兵力）
// ============================================================
function captureNearbyNeutrals(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let alreadyCapturing = 0;
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'ATTACK' || !d._aiTaskTarget) continue;
        let isNeutral = true;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct && ct.hp > 0 && Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.4) {
                if (enemies.includes(ct.owner) || ct.owner === country) isNeutral = false;
                break;
            }
        }
        if (isNeutral) alreadyCapturing++;
    }
    // 占领上限：兵力很充足才派（防御没压力 + 本国兵力 > 敌军*1.5）
    let myCount = getMyCombatUnits(country).length;
    let enemyCount = 0;
    for (let d of G.divisions) {
        if (d.strength > 0 && enemies.includes(d.country) && d.type !== 'navy' && d.type !== 'submarine') enemyCount++;
    }
    let cap = (myCount > enemyCount * 1.5) ? 3 : 0;
    if (cap === 0 || alreadyCapturing >= cap) return;

    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0) continue;
        // 中立判定
        if (ct.owner === country) continue;
        if (ct.owner && enemies.includes(ct.owner)) continue;
        if (G.playerCountry && ct.owner === G.playerCountry) continue;
        // 距己方城市 3.5° 内
        let nearMy = 999;
        for (let cid2 in G.cities) {
            let oc = G.cities[cid2];
            if (!oc || oc.hp <= 0 || oc.owner !== country) continue;
            let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
            if (d < nearMy) nearMy = d;
        }
        if (nearMy > 3.5) continue;
        // 已有人去占
        let alreadyAssigned = false;
        for (let d of G.divisions) {
            if (d.country === country && d.strength > 0 && d._aiTask === 'ATTACK' &&
                d._aiTaskTarget && Math.hypot(d._aiTaskTarget.lon - ct.lon, d._aiTaskTarget.lat - ct.lat) < 0.3) {
                alreadyAssigned = true; break;
            }
        }
        if (alreadyAssigned) continue;
        if (alreadyCapturing >= cap) break;
        let u = findNearestFreeUnit(ct, country, 8, true);
        if (u) {
            safeMoveTo(u, ct.lon, ct.lat, country);
            u._aiTask = 'ATTACK';
            u._aiTaskTarget = { lon: ct.lon, lat: ct.lat };
            u._stuckTicks = 0;
            alreadyCapturing++;
        }
    }
}

// ============================================================
// 5. 卡住处理（通用）
// ============================================================
function handleStuck(country, enemies) {
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        if (d._aiTask !== 'ATTACK' || !d._aiTaskTarget) continue;

        let dist = Math.hypot(d.rx - d._aiTaskTarget.lon, d.ry - d._aiTaskTarget.lat);
        // 已到位（射程内）→ 专注攻城
        let _ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        let reach = Math.max(0.35, (_ut.range || 0.2) * 1.3 + 0.05);
        if (dist <= reach && d.state === 'moving') {
            d.state = 'idle'; d.targetX = null; d.targetY = null;
            // 就近标记敌城
            let bestC = null, bestCd = reach;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
                if (G.surrendered && G.surrendered[ct.owner]) continue;
                let dd = Math.hypot(ct.lon - d.rx, ct.lat - d.ry);
                if (dd < bestCd) { bestCd = dd; bestC = cid; }
            }
            if (bestC) d.focusCity = bestC;
        }
        // 停驻但没开眼（nearestLand 偏移/骑兵侧翼）→ 补标
        else if (d.state === 'idle' && !d.focusCity) {
            let bestC = null, bestCd = Math.max(reach, 0.65);
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
                if (G.surrendered && G.surrendered[ct.owner]) continue;
                let dd = Math.hypot(ct.lon - d.rx, ct.lat - d.ry);
                if (dd < bestCd) { bestCd = dd; bestC = cid; }
            }
            if (bestC) { d.focusCity = bestC; d.targetX = null; d.targetY = null; }
        }

        // 卡住检测
        if (!d._lastPos) d._lastPos = { rx: d.rx, ry: d.ry };
        let moved = Math.hypot(d.rx - d._lastPos.rx, d.ry - d._lastPos.ry);
        if (moved < 0.05 && dist > 0.3) {
            d._stuckTicks = (d._stuckTicks || 0) + 1;
            if (d._stuckTicks > 20 && d._stuckTicks < 25) {
                // 尝试绕中立国
                let wp = findWaypointAroundNeutral(d.rx, d.ry, d._aiTaskTarget.lon, d._aiTaskTarget.lat, country);
                if (wp && Math.hypot(wp.lon - d.rx, wp.lat - d.ry) > 0.3) {
                    moveTo(d, wp.lon, wp.lat);
                    d._waypoint = { lon: d._aiTaskTarget.lon, lat: d._aiTaskTarget.lat };
                }
            }
            if (d._stuckTicks > 40) {
                d._aiTask = null; d._aiTaskTarget = null; d._stuckTicks = 0; d._waypoint = null;
            }
        } else {
            d._stuckTicks = 0;
        }
        d._lastPos = { rx: d.rx, ry: d.ry };
    }
    handleWaypoints(country);
}

// ============================================================
// 主入口：每 tick 每国调用一次（通用，任何国家同一套逻辑）
// ============================================================
function updateAIBattle(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;

    // 1. 态势评估
    let sit = assessSituation(country, enemies);
    // 防御配额（全局一致，释放与分配共用）
    let defCap = computeDefCap(sit);

    // 2. 释放失威胁守军 → 回进攻池（并强制防御上限）
    releaseStaleDefenders(country, enemies, defCap);

    // 3. 防御：按威胁分配守军（自由单位不够会自动从进攻单位撤回来守本土）
    assignDefenders(country, enemies, sit, defCap);

    // 4. 进攻：剩余兵力按战区簇集中打敌城
    //    看形势：本土被围攻的城市很多 或 兵力严重劣势 → 少进攻多防守（先稳住战线）
    let freeUnits = collectFreeUnits(country, enemies);
    if (freeUnits.length === 0) { /* 无兵可攻 */ }
    else {
        // 本土危急程度：正在被围攻（threat≥45）的城市数
        let besieged = sit.threats.filter(t => t.threat >= 45).length;
        // 进攻意愿：默认全力；本土危急（≥3城被围攻）或兵力劣势（<0.7）→ 只派一半进攻
        let attackCap = freeUnits.length;
        if (besieged >= 3) attackCap = Math.floor(freeUnits.length * 0.5);
        else if (besieged >= 1 && sit.ratio < 0.7) attackCap = Math.floor(freeUnits.length * 0.6);
        else if (sit.ratio < 0.5) attackCap = Math.floor(freeUnits.length * 0.3);
        if (attackCap < freeUnits.length) freeUnits.length = attackCap;
        assignAttackers(country, enemies, freeUnits);
    }

    // 5. 中立占领（有余力才占）
    captureNearbyNeutrals(country);

    // 6. 卡住处理 + 绕路
    handleStuck(country, enemies);
}
