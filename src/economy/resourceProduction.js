// ============================================================
//  Iron & Dominion 1914 — 资源生产与升级（粮食/铁矿）
//  粮食月产 = 75 × 等级系数 × 城市规模系数（供给军队：30/师/月）
//  铁矿月产 = 10 × 等级系数（潜力 <T2 的城市不产铁）
//  库存统一存于城市对象：c.grain ≤ c.grainMax、c.iron ≤ c.ironMax
//  升级链：T1→T2 100金/15天 · T2→T3 250金/30天 · T3→T4 500金/45天 · T4→T5 1000金/60天
// ============================================================

(function () {
    const GRADE = { 1: 1.0, 2: 1.5, 3: 2.2, 4: 3.2, 5: 4.5 };
    const SIZE = { capital: 1.2, major: 1.0, small: 0.8 };
    const UP_COST = { 1: 100, 2: 250, 3: 500, 4: 1000 };
    const UP_DAYS = { 1: 15, 2: 30, 3: 45, 4: 60 };

    // 城市规模系数（cityType 优先，兜底 isMajorCity）
    function sizeMult(city) {
        if (!city) return 0.8;
        if (city.cityType === 'capital' || city.isCapital) return SIZE.capital;
        if (city.cityType === 'major' || (typeof isMajorCity === 'function' && isMajorCity(city.id))) return SIZE.major;
        return SIZE.small;
    }

    // 惰性初始化运行时状态（兼容旧存档：G 里没有该字段时重建；铁储量/上限补齐）
    function ensureRuntime() {
        if (!G.resRuntime) G.resRuntime = {};
        for (let cid in G.cities) {
            let city = G.cities[cid];
            if (!city) continue;
            if (city.ironMax === undefined) city.ironMax = city.grainMax || 500;
            if (city.iron === undefined) city.iron = Math.round((city.ironMax || 500) * 0.8);
            if (G.resRuntime[cid]) continue;
            let base = (typeof RESOURCE_DATA !== 'undefined' && RESOURCE_DATA[cid]) || [1, 1, 1, 1];
            G.resRuntime[cid] = { grainCur: base[0], grainPot: base[1], ironCur: base[2], ironPot: base[3] };
        }
    }

    function getCityRes(city) {
        if (!city) return null;
        ensureRuntime();
        let r = G.resRuntime[city.id];
        if (!r) {
            let base = (typeof RESOURCE_DATA !== 'undefined' && RESOURCE_DATA[city.id]) || [1, 1, 1, 1];
            r = G.resRuntime[city.id] = { grainCur: base[0], grainPot: base[1], ironCur: base[2], ironPot: base[3] };
        }
        return r;
    }

    // 库存统一读城市对象（粮食 c.grain ≤ c.grainMax；铁矿 c.iron ≤ c.ironMax）
    function getCityStock(city) {
        if (!city) return { grain: 0, iron: 0 };
        return { grain: city.grain || 0, iron: city.iron || 0 };
    }

    function grainMonthly(city) {
        let r = getCityRes(city);
        if (!r) return 0;
        return RES_GRAIN_BASE * (GRADE[r.grainCur] || GRADE[1]) * sizeMult(city);
    }

    function ironMonthly(city) {
        let r = getCityRes(city);
        if (!r) return 0;
        if ((r.ironPot || 0) < 2) return 0;
        return RES_IRON_BASE * (GRADE[r.ironCur] || GRADE[1]);
    }

    // 升级信息：{ cost, days, cur, pot }；不可升级（满级/铁潜力<2）返回 null
    function upgradeInfo(city, res) {
        let r = getCityRes(city);
        if (!r) return null;
        let cur = res === 'grain' ? r.grainCur : r.ironCur;
        let pot = res === 'grain' ? r.grainPot : r.ironPot;
        if (res === 'iron' && (pot || 0) < 2) return null;
        if (cur >= pot || cur >= 5) return null;
        return { cost: UP_COST[cur] || 0, days: UP_DAYS[cur] || 0, cur: cur, pot: pot };
    }

    function isUpgrading(cityId, res) {
        let type = res === 'grain' ? 'upgrade_grain' : 'upgrade_iron';
        return !!(G.buildQueue && G.buildQueue.some(bq => bq.type === type && bq.cityId === cityId));
    }

    // 发起升级（校验 + 扣款 + 入队）。country 为发起国。
    function resStartUpgrade(city, res, country) {
        let info = upgradeInfo(city, res);
        if (!info) return { ok: false, reason: '已达等级上限，无法升级' };
        if (isUpgrading(city.id, res)) return { ok: false, reason: '该资源正在升级中' };
        let cd = G.countries && G.countries[country];
        if (!cd) return { ok: false, reason: '国家数据缺失' };
        if (cd.treasury < info.cost) return { ok: false, reason: '金币不足（需 $' + info.cost + '）' };
        cd.treasury -= info.cost;
        if (!G.buildQueue) G.buildQueue = [];
        G.buildQueue.push({
            type: res === 'grain' ? 'upgrade_grain' : 'upgrade_iron',
            province: city.provinceId || city.id,
            days: info.days, totalDays: info.days,
            cityId: city.id, cityLon: city.lon, cityLat: city.lat, cityName: city.name,
        });
        addGameLog(city.name + " 开始升级" + (res === 'grain' ? '粮食' : '铁矿') + " →T" + (info.cur + 1) + "（" + info.days + "天 · 花费$" + info.cost + "）");
        return { ok: true };
    }

    // 升级完成回调（由 processBuildQueue 调用）
    function resCompleteUpgrade(item) {
        let city = G.cities && G.cities[item.cityId];
        if (!city) return;
        let r = getCityRes(city);
        if (!r) return;
        if (item.type === 'upgrade_grain') {
            if (r.grainCur < r.grainPot) r.grainCur++;
            addGameLog(city.name + " 粮食升级完成（T" + r.grainCur + "/T" + r.grainPot + " · 月产 " + Math.round(grainMonthly(city)) + "）");
        } else {
            if (r.ironCur < r.ironPot) r.ironCur++;
            addGameLog(city.name + " 铁矿升级完成（T" + r.ironCur + "/T" + r.ironPot + " · 月产 " + Math.round(ironMonthly(city)) + "）");
        }
    }

    // 每 3 天结算一次：铁矿库存累积（带上限；粮食由 game_core.updateGrain 结算并供应军队）
    // 城市满仓后盈余转给最近的铁路连接且有余量的城市；无铁路连接则维持上限
    function resUpdate(days) {
        if (!G.cities) return;
        ensureRuntime();
        let overflowList = [];
        for (let cid in G.cities) {
            let city = G.cities[cid];
            if (!city || city.owner === null || city.owner === undefined) continue;
            let cap = city.ironMax || 500;
            let add = ironMonthly(city) * days / 30;
            let room = cap - (city.iron || 0);
            let inc = Math.min(room, add);
            city.iron = (city.iron || 0) + inc;
            let overflow = add - inc;
            if (overflow > 0.001) overflowList.push({ city: city, amount: overflow });
        }
        for (let o of overflowList) {
            if (typeof transferSurplus === 'function') transferSurplus(o.city.owner, o.city.id, 'iron', o.amount);
        }
    }

    // 城市易主：升级进度清零、等级/库存重置为基准值
    function resOnCityOwnerChange(city) {
        if (!city) return;
        ensureRuntime();
        let base = (typeof RESOURCE_DATA !== 'undefined' && RESOURCE_DATA[city.id]) || [1, 1, 1, 1];
        G.resRuntime[city.id] = { grainCur: base[0], grainPot: base[1], ironCur: base[2], ironPot: base[3] };
        city.iron = Math.round((city.ironMax || city.grainMax || 500) * 0.8);
        city.grain = Math.round((city.grainMax || 500) * 0.8);
        if (G.buildQueue) {
            for (let i = G.buildQueue.length - 1; i >= 0; i--) {
                let bq = G.buildQueue[i];
                if (bq.cityId === city.id && (bq.type === 'upgrade_grain' || bq.type === 'upgrade_iron')) {
                    G.buildQueue.splice(i, 1);
                }
            }
        }
    }

    window.getCityRes = getCityRes;
    window.getCityStock = getCityStock;
    window.resGrainMonthly = grainMonthly;
    window.resIronMonthly = ironMonthly;
    window.resUpgradeInfo = upgradeInfo;
    window.resIsUpgrading = isUpgrading;
    window.resStartUpgrade = resStartUpgrade;
    window.resCompleteUpgrade = resCompleteUpgrade;
    window.resUpdate = resUpdate;
    window.resOnCityOwnerChange = resOnCityOwnerChange;
})();
