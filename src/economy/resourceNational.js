// ============================================================
//  Iron & Dominion 1914 — 国家资源总量（铁路 / 海运连通性）
//  仅计入连接首都的城市：
//    · 铁路连通：沿 G.railways 段（两端城市均属本国）BFS 可达首都
//    · 港口城市：未铁路连通时，若附近（0.12 世界度）无敌方海军/潜艇则海路畅通
//  国家总量 = Σ(已连接城市实时库存)：粮食 c.grain / 铁矿 c.iron
// ============================================================

(function () {
    // 「穿过」阈值（世界度，≈16km）：铁路段必须实际经过城市才算该城市接入铁路
    // 与 game_core.js 的 RAIL_PASS_DIST 保持一致的语义（0.15）
    const RAIL_NEAR_DIST = 0.15;

    function distToSegment(px, py, x1, y1, x2, y2) {
        let dx = x2 - x1, dy = y2 - y1;
        let len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // 铁路邻接表（本国可用段 + 邻近接入），供可达集/连通分量共用
    function railAdj(country) {
        let adj = {};
        let usableSegs = [];
        let edges = G.railways || {};
        for (let key in edges) {
            let parts = key.split('|');
            let a = parts[0], b = parts[1];
            if (!a || !b) continue;
            let ca = G.cities[a], cb = G.cities[b];
            if (!ca || !cb) continue;
            // 动态归属：段两端城市 owner 为同一方（本国）方可通行
            if (ca.owner !== country || cb.owner !== country) continue;
            usableSegs.push({ a: a, b: b, ca: ca, cb: cb });
            (adj[a] = adj[a] || []).push(b);
            (adj[b] = adj[b] || []).push(a);
        }
        // 邻近接入：无直接铁路段的本国城市，距任一可用段 < RAIL_NEAR_DIST → 虚拟接入段两端
        if (usableSegs.length > 0) {
            for (let cid in G.cities) {
                let c = G.cities[cid];
                if (!c || c.owner !== country) continue;
                if (adj[cid]) continue;
                let best = Infinity, ba = null, bb = null;
                for (let s of usableSegs) {
                    let d = distToSegment(c.lon, c.lat, s.ca.lon, s.ca.lat, s.cb.lon, s.cb.lat);
                    if (d < best) { best = d; ba = s.a; bb = s.b; }
                }
                if (best < RAIL_NEAR_DIST && ba) {
                    adj[cid] = [ba, bb];
                    (adj[ba] = adj[ba] || []).push(cid);
                    (adj[bb] = adj[bb] || []).push(cid);
                }
            }
        }
        return { adj: adj, usableSegs: usableSegs };
    }

    function railReachableSet(country, capId) {
        let { adj } = railAdj(country);
        let reach = {};
        if (capId) {
            let stack = [capId];
            reach[capId] = true;
            while (stack.length) {
                let cur = stack.pop();
                for (let nb of (adj[cur] || [])) {
                    if (!reach[nb]) { reach[nb] = true; stack.push(nb); }
                }
            }
        }
        return reach;
    }

    // 本国铁路连通分量（不含孤立城市）
    function railComponents(country) {
        let { adj } = railAdj(country);
        let seen = {};
        let comps = [];
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c || c.owner !== country || seen[cid] || !adj[cid]) continue;
            let comp = [];
            let stack = [cid];
            seen[cid] = true;
            while (stack.length) {
                let cur = stack.pop();
                comp.push(cur);
                for (let nb of (adj[cur] || [])) {
                    if (!seen[nb]) { seen[nb] = true; stack.push(nb); }
                }
            }
            comps.push(comp);
        }
        return comps;
    }

    // 海路畅通：城市自身及「城市→首都」海路沿线（4 个采样点）无敌方海军/潜艇
    function seaClear(city, country, capCity) {
        if (!G.divisions) return true;
        let pts = [{ x: city.lon, y: city.lat }];
        if (capCity) {
            for (let t = 1; t <= 4; t++) {
                let f = t / 4;
                pts.push({ x: city.lon + (capCity.lon - city.lon) * f, y: city.lat + (capCity.lat - city.lat) * f });
            }
        }
        for (let d of G.divisions) {
            if (!d || !d.country || d.country === country) continue;
            if (d.type !== 'navy' && d.type !== 'submarine') continue;
            if (typeof areAtWar === 'function' && !areAtWar(d.country, country)) continue;
            if (d.strength <= 0) continue;
            for (let p of pts) {
                let dist = Math.hypot(p.x - (d.rx || 0), p.y - (d.ry || 0));
                if (dist < 0.12) return false;
            }
        }
        return true;
    }

    // 计算某国资源总量与每城连接状态
    // 返回 { grain, iron, connected: {cityId:{byRail,bySea}}, connectedCount }
    // grain/iron = 已连接城市实时库存之和（粮食 c.grain / 铁矿 c.iron）
    // 250ms TTL 缓存：库存/归属仅在 3 天 tick 或操作时变化，无需每帧重算铁路 BFS + 海军扫描
    let _natCache = {}, _natCacheAt = 0;
    function calcNationalResources(country) {
        let now = Date.now();
        if (now - _natCacheAt < 250 && _natCache[country]) return _natCache[country];
        let empty = { grain: 0, iron: 0, connected: {}, connectedCount: 0 };
        if (!G.cities || !country) return empty;
        let capId = null;
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (c.owner === country && c.isCapital) { capId = cid; break; }
        }
        let reach = railReachableSet(country, capId);
        let connected = {};
        let grainSum = 0, ironSum = 0, count = 0;
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (c.owner !== country) continue;
            let byRail = !!reach[cid];
            let bySea = false;
            if (!byRail && typeof PORT_CITY_IDS !== 'undefined' && PORT_CITY_IDS.has(cid)) {
                bySea = seaClear(c, country, capId ? G.cities[capId] : null);
            }
            if (byRail || bySea) {
                connected[cid] = { byRail: byRail, bySea: bySea };
                grainSum += c.grain || 0;
                ironSum += c.iron || 0;
                count++;
            }
        }
        let res = {
            grain: grainSum,
            iron: ironSum,
            connected: connected,
            connectedCount: count,
        };
        _natCache = { [country]: res };
        _natCacheAt = now;
        return res;
    }

    // 城市满仓后的盈余转移：转到最近的、铁路连接且有余量的本国城市
    // 无铁路连接（或无余量目标）→ 不转移，保持上限
    function transferSurplus(country, fromCityId, res, amount) {
        if (!G.cities || !country || !fromCityId || amount <= 0) return;
        let from = G.cities[fromCityId];
        if (!from || from.owner !== country) return;
        let reach = railReachableSet(country, fromCityId);
        let best = null, bestD = Infinity;
        for (let cid in G.cities) {
            if (cid === fromCityId) continue;
            let c = G.cities[cid];
            if (!c || c.owner !== country) continue;
            if (!reach[cid]) continue; // 必须铁路可达（含段穿过城市）
            let cap = res === 'grain' ? (c.grainMax || 500) : (c.ironMax || 500);
            let stock = res === 'grain' ? (c.grain || 0) : (c.iron || 0);
            if (stock >= cap - 0.001) continue;
            let dd = Math.hypot(c.lon - from.lon, c.lat - from.lat);
            if (dd < bestD) { bestD = dd; best = c; }
        }
        if (!best) return;
        let cap = res === 'grain' ? (best.grainMax || 500) : (best.ironMax || 500);
        let stock = res === 'grain' ? (best.grain || 0) : (best.iron || 0);
        let t = Math.min(amount, cap - stock);
        if (t <= 0) return;
        if (res === 'grain') { from.grain -= t; best.grain = (best.grain || 0) + t; }
        else { from.iron -= t; best.iron = (best.iron || 0) + t; }
        if (amount - t > 0.001) transferSurplus(country, fromCityId, res, amount - t);
    }

    // ===== 铁路线粮食再分配 =====
    // 缺口阈值：库存低于该值的城市视为缺口城市（需要补给）
    const GRAIN_SHARE_THRESHOLD = 300;
    // 每 3 游戏天流转缺口/富余的比例（逐步流出，非瞬间运输）
    const GRAIN_SHARE_RATE = 0.15;

    // 同一铁路连通分量内：缺口城市（<300）由所有库存 >300 的城市补给；
    // 供给方动用其全部 >300 的库存，接收方最多补到 300（不超过上限）
    function redistributeGrain(country, days) {
        if (!G.cities || !country) return;
        let comps = railComponents(country);
        let step = (days || 3) / 3;
        for (let comp of comps) {
            let demand = [], supply = [];
            for (let cid of comp) {
                let c = G.cities[cid];
                let g = c.grain || 0;
                if (g < GRAIN_SHARE_THRESHOLD) demand.push({ c: c, gap: GRAIN_SHARE_THRESHOLD - g });
                else if (g > GRAIN_SHARE_THRESHOLD) supply.push({ c: c, excess: g - GRAIN_SHARE_THRESHOLD });
            }
            if (demand.length === 0 || supply.length === 0) continue;
            let totalDemand = 0, totalExcess = 0;
            for (let d of demand) totalDemand += d.gap;
            for (let s of supply) totalExcess += s.excess;
            let flow = Math.min(totalDemand, totalExcess) * GRAIN_SHARE_RATE * step;
            if (flow < 0.01) continue;
            // 按缺口/富余比例分摊，保证不瞬间运输、供给方不跌破 300、接收方不超 300/上限
            for (let d of demand) d.recv = flow * (d.gap / totalDemand);
            for (let s of supply) s.send = flow * (s.excess / totalExcess);
            for (let s of supply) s.c.grain = Math.max(0, (s.c.grain || 0) - s.send);
            for (let d of demand) d.c.grain = Math.min(d.c.grainMax || GRAIN_SHARE_THRESHOLD, (d.c.grain || 0) + d.recv);
        }
    }

    window.calcNationalResources = calcNationalResources;
    window.transferSurplus = transferSurplus;
    window.redistributeGrain = redistributeGrain;
})();
