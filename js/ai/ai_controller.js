// Iron & Dominion 1914 — AI Controller (全面重写)
// 涵盖：生产、经济运营、入侵应对、宣战、同盟、保障、好感提升

// ===== 国家个性配置 =====
const AI_PERSONALITY = {
    GERMANY:       { aggression: 0.85, economy: 0.7, diplomacy: 0.5, preferArtillery: 0.35, preferCavalry: 0.15, fortify: 0.3, expansionPower: 0.9 },
    FRANCE:        { aggression: 0.55, economy: 0.65, diplomacy: 0.7, preferArtillery: 0.25, preferCavalry: 0.1, fortify: 0.6, expansionPower: 0.4 },
    UK:            { aggression: 0.4, economy: 0.8, diplomacy: 0.85, preferArtillery: 0.15, preferCavalry: 0.1, fortify: 0.3, expansionPower: 0.3 },
    AUSTRIA_HUNGARY:{ aggression: 0.7, economy: 0.55, diplomacy: 0.55, preferArtillery: 0.25, preferCavalry: 0.15, fortify: 0.4, expansionPower: 0.6 },
    ITALY:         { aggression: 0.5, economy: 0.5, diplomacy: 0.6, preferArtillery: 0.15, preferCavalry: 0.1, fortify: 0.4, expansionPower: 0.4 },
    RUSSIA:        { aggression: 0.65, economy: 0.4, diplomacy: 0.45, preferArtillery: 0.15, preferCavalry: 0.2, fortify: 0.3, expansionPower: 0.7 },
    TURKEY:        { aggression: 0.45, economy: 0.4, diplomacy: 0.5, preferArtillery: 0.1, preferCavalry: 0.15, fortify: 0.4, expansionPower: 0.35 },
    BELGIUM:       { aggression: 0.15, economy: 0.5, diplomacy: 0.7, preferArtillery: 0.05, preferCavalry: 0.05, fortify: 0.7, expansionPower: 0.1 },
    NETHERLANDS:   { aggression: 0.1, economy: 0.6, diplomacy: 0.75, preferArtillery: 0.05, preferCavalry: 0.05, fortify: 0.5, expansionPower: 0.1 },
    SPAIN:         { aggression: 0.2, economy: 0.45, diplomacy: 0.6, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.4, expansionPower: 0.2 },
    PORTUGAL:      { aggression: 0.1, economy: 0.4, diplomacy: 0.7, preferArtillery: 0.05, preferCavalry: 0.05, fortify: 0.4, expansionPower: 0.1 },
    SWEDEN:        { aggression: 0.15, economy: 0.55, diplomacy: 0.7, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.5, expansionPower: 0.15 },
    DENMARK:       { aggression: 0.1, economy: 0.5, diplomacy: 0.7, preferArtillery: 0.05, preferCavalry: 0.05, fortify: 0.5, expansionPower: 0.1 },
    NORWAY:        { aggression: 0.1, economy: 0.45, diplomacy: 0.65, preferArtillery: 0.05, preferCavalry: 0.05, fortify: 0.4, expansionPower: 0.1 },
    SWITZERLAND:   { aggression: 0.0, economy: 0.6, diplomacy: 0.8, preferArtillery: 0.0, preferCavalry: 0.0, fortify: 0.9, expansionPower: 0.0 },
    SERBIA:        { aggression: 0.5, economy: 0.3, diplomacy: 0.5, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.5, expansionPower: 0.3 },
    BULGARIA:      { aggression: 0.5, economy: 0.35, diplomacy: 0.5, preferArtillery: 0.1, preferCavalry: 0.15, fortify: 0.4, expansionPower: 0.3 },
    ROMANIA:       { aggression: 0.35, economy: 0.4, diplomacy: 0.55, preferArtillery: 0.1, preferCavalry: 0.15, fortify: 0.5, expansionPower: 0.25 },
    GREECE:        { aggression: 0.3, economy: 0.35, diplomacy: 0.55, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.5, expansionPower: 0.2 },
    FINLAND:       { aggression: 0.15, economy: 0.4, diplomacy: 0.6, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.5, expansionPower: 0.15 },
    LUXEMBOURG:    { aggression: 0.0, economy: 0.4, diplomacy: 0.7, preferArtillery: 0.0, preferCavalry: 0.0, fortify: 0.6, expansionPower: 0.0 },
    MONTENEGRO:    { aggression: 0.3, economy: 0.25, diplomacy: 0.5, preferArtillery: 0.05, preferCavalry: 0.1, fortify: 0.5, expansionPower: 0.15 },
    ALBANIA:       { aggression: 0.2, economy: 0.2, diplomacy: 0.5, preferArtillery: 0.05, preferCavalry: 0.1, fortify: 0.4, expansionPower: 0.1 },
};

// 默认个性
const DEFAULT_PERSONALITY = { aggression: 0.3, economy: 0.4, diplomacy: 0.5, preferArtillery: 0.1, preferCavalry: 0.1, fortify: 0.4, expansionPower: 0.2 };

function getPersonality(co) { return AI_PERSONALITY[co] || DEFAULT_PERSONALITY; }

// ============================================================
// 动态前线工具（修复：前线不写死为"国界"，而是"敌军/敌占区方向"）
// ============================================================

// 获取某国当前所有"前线城市"：距最近敌军 < 3° 或距最近敌占城市 < 2.5° 的己方/中立城市
// 打到敌国本土后，新占领的城市也会成为前线，防御/生产会跟着前移
// 判断城市对某国是否为"中立"（可占领）：
// 无主城市 或 未交战国家城市（游戏里未参战国城市 owner 是其国家代码，不是 null）
function isNeutralCity(ct, co) {
    if (!ct || ct.hp <= 0) return false;
    if (ct.owner === co) return false;
    if (ct.owner === null || ct.owner === undefined) return true;
    if (G.playerCountry && ct.owner === G.playerCountry) return false; // 玩家城市不算中立
    let atWar = typeof getEnemiesOf === 'function' ? getEnemiesOf(co) : [];
    if (atWar.includes(ct.owner)) return false; // 交战城市不算中立
    return true; // 未交战国家 = 中立
}

function getDynamicFrontlineCities(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let frontline = [];
    if (enemies.length === 0) return frontline;
    // 预收集敌军单位位置与敌占城市位置
    let enemyUnits = [];
    for (let d of G.divisions) {
        if (d.strength > 0 && enemies.includes(d.country)) enemyUnits.push(d);
    }
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0) continue;
        if (ct.owner !== country && !isNeutralCity(ct, country)) continue; // 只要己方/中立城市
        // 距最近敌军单位
        let minDist = 999;
        for (let e of enemyUnits) {
            let d = Math.hypot(ct.lon - e.rx, ct.lat - e.ry);
            if (d < minDist) minDist = d;
        }
        // 距最近敌占城市
        let minCityDist = 999;
        for (let cid2 in G.cities) {
            let ec = G.cities[cid2];
            if (!ec || ec.hp <= 0 || !enemies.includes(ec.owner)) continue;
            let d = Math.hypot(ct.lon - ec.lon, ct.lat - ec.lat);
            if (d < minCityDist) minCityDist = d;
        }
        let isFront = (minDist < 3.0) || (minCityDist < 2.5);
        if (isFront) frontline.push({ city: ct, enemyDist: minDist, enemyCityDist: minCityDist });
    }
    // 按威胁程度排序（敌越近越靠前）
    frontline.sort((a, b) => a.enemyDist - b.enemyDist);
    return frontline;
}

// 判断某城市是否在前线（距敌军 < 3°）
function isCityOnFrontline(lon, lat, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    for (let d of G.divisions) {
        if (d.strength > 0 && enemies.includes(d.country)) {
            if (Math.hypot(lon - d.rx, lat - d.ry) < 3.0) return true;
        }
    }
    return false;
}

// 计算某点附近的局部兵力比（供"局部优势突破"判断）
// 返回 { my, enemy, ratio }——my/enemy 为 3° 半径内的师团数
function localForceAt(lon, lat, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let my = 0, enemy = 0;
    for (let d of G.divisions) {
        if (d.strength <= 0) continue;
        let dist = Math.hypot(lon - d.rx, lat - d.ry);
        if (dist > 3.0) continue;
        if (d.country === country) my++;
        else if (enemies.includes(d.country)) enemy++;
    }
    return { my: my, enemy: enemy, ratio: my / Math.max(1, enemy) };
}

// ===== 主AI入口 =====
function updateAI() {
    let cs = G.countries;
    let humanCountries = G.multiplayerHumanCountries && G.multiplayerHumanCountries.length > 0 ? G.multiplayerHumanCountries : (G.playerCountry ? [G.playerCountry] : []);
    let allCountries = Object.keys(cs).filter(c => !humanCountries.includes(c) && cs[c].treasury !== undefined && !G.surrendered[c]);

    // ═══ 性能优化：全局缓存单次遍历 G.divisions（替代200+次.filter()） ═══
    if (!G._divCacheVer || G._divCacheVer !== G.tick) {
        G._divCacheVer = G.tick;
        let allDivs = G.divisions;
        // 按国家预分组（一次遍历）
        let byCountry = Object.create(null);
        let byCountryCombat = Object.create(null); // 非海军战斗单位
        for (let d of allDivs) {
            if (!byCountry[d.country]) byCountry[d.country] = [];
            byCountry[d.country].push(d);
            if (d.strength > 0 && d.type !== 'navy' && d.type !== 'submarine') {
                if (!byCountryCombat[d.country]) byCountryCombat[d.country] = [];
                byCountryCombat[d.country].push(d);
            }
        }
        G._divCache = { byCountry: byCountry, byCountryCombat: byCountryCombat, all: allDivs };
    }
    // 便捷访问函数（零分配）
    window._divsOf = function(co) { return (G._divCache && G._divCache.byCountry[co]) || []; };
    window._combatDivsOf = function(co) { return (G._divCache && G._divCache.byCountryCombat[co]) || []; };

    // 德国历史宣战（史丽芬计划：借道比利时/卢森堡，不宣荷兰——保持荷兰中立，避免英军经荷兰登陆侧翼）
    let playerIsGermany = G.playerCountry === 'GERMANY';
    if (!playerIsGermany && !G.germanyDeclaredWar && G.date >= new Date(1914, 7, 3)) {
        G.germanyDeclaredWar = true;
        if (!areAtWar('GERMANY', 'FRANCE')) declareWar('GERMANY', 'FRANCE');
        if (!areAtWar('GERMANY', 'BELGIUM')) declareWar('GERMANY', 'BELGIUM');
        if (!areAtWar('GERMANY', 'LUXEMBOURG')) declareWar('GERMANY', 'LUXEMBOURG');
        G.newsBanner = "⚔️ 德意志帝国启动史丽芬计划，向法国、比利时和卢森堡宣战！";
        G.newsTimer = 600;
    }

    // 历史参战系统：俄、英自动加入协约国
    if (!G._ententeJoined && G.germanyDeclaredWar && G.date >= new Date(1914, 7, 3)) {
        G._ententeJoined = true;
        // 俄罗斯对德国和奥匈宣战
        if (!areAtWar('RUSSIA', 'GERMANY')) declareWar('RUSSIA', 'GERMANY');
        if (!areAtWar('RUSSIA', 'AUSTRIA_HUNGARY')) declareWar('RUSSIA', 'AUSTRIA_HUNGARY');
        G.newsBanner = "⚔️ 俄罗斯帝国响应协约国义务，向德国和奥匈帝国宣战！";
        G.newsTimer = 600;
        // 英国对德国宣战
        if (!areAtWar('UK', 'GERMANY')) declareWar('UK', 'GERMANY');
        G.newsBanner = "⚔️ 大英帝国向德意志帝国宣战！";
        G.newsTimer = 600;
    }

    // 每 50 tick 更新战略评估
    let tick = G.tick || 0;
    if (tick % 50 === 0) {
        for (let co of allCountries) {
            if (typeof reevaluateStrategy === 'function') reevaluateStrategy(co);
            if (typeof evaluateStrategicSituation === 'function') {
                evaluateStrategicSituation(co);
            }
        }
    }

    // ===== ═══════════════════════════════════════════
    // AI 战斗系统（ai_battle.js — 四条硬规则）
    // ═══════════════════════════════════════════ =====
    for (let co of allCountries) {
        if (typeof updateAIBattle === 'function') updateAIBattle(co);
    }

    // ===== 经济/生产/外交（每 tick） =====
    for (let co of allCountries) {
        let cd = cs[co]; if (!cd) continue;
        let pers = typeof getPersonality === 'function' ? getPersonality(co) : null;
        if (!pers) continue;
        aiEconomy(co, cd, pers);
        aiProduction(co, cd, pers);
        aiDiplomacy(co, cd, pers, allCountries);
    }

    // ===== 撤退处理 =====
    for (let co of allCountries) {
        if (tick % 10 === 0 && typeof processRetreats === 'function') processRetreats(co);
    }

    // ========== 海军战略 ==========
    if (typeof aiNavyStrategy === 'function') aiNavyStrategy(allCountries);

    // ========== AI求和 ==========
    aiPeaceSeeking(allCountries);
}

// ========== 1. 经济运营 ==========
function aiEconomy(co, cd, pers) {
    let atWar = isCountryAtWar(co);
    let income = calcCountryIncome(co);

    // 使用优先级系统建造工厂
    let provs = getCountryProvinces(co).filter(p => p.factories < 3 && p.center);
    let strat = typeof getStrategy === 'function' ? getStrategy(co) : null;
    let alloc = strat && strat.alloc ? strat.alloc : {fb:0.6,ms:0.5,cu:0.5,ns:0.3,rr:0.15};
    let buildChance = alloc.fb * 0.15 * (atWar ? 1.5 : 0.8);
    if (cd.treasury > 500) buildChance = Math.min(0.90, buildChance * 2.0);
    else if (cd.treasury > 200) buildChance = Math.min(0.70, buildChance * 1.5);

    if (cd.treasury > 60 && provs.length > 0 && Math.random() < buildChance) {
        let bestProv = null, bestScore = -999;
        for (let p of provs) {
            let score = typeof getFactoryScore === 'function' ? getFactoryScore(p.id, co) : 0;
            if (score > bestScore) { bestScore = score; bestProv = p; }
        }
        if (bestProv && bestScore > 0) {
            let city = null;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (ct.provinceId === bestProv.id && ct.owner === co) { city = ct; break; }
            }
            if (city) {
                cd.treasury -= 50;
                if (!G.buildQueue) G.buildQueue = [];
                G.buildQueue.push({ type: 'factory', province: bestProv.id, days: 10, totalDays: 10, cityId: city.id, cityLon: city.lon, cityLat: city.lat });
            }
        }
    }

    // 优先级城市升级
    let upgradeChance = alloc.cu * 0.02 * (atWar ? 0.5 : 1.0);
    if (cd.treasury > 1200) upgradeChance = Math.min(0.4, upgradeChance * 2);
    else if (cd.treasury > 800) upgradeChance = Math.min(0.25, upgradeChance * 1.5);

    if (cd.treasury > 600 && Math.random() < upgradeChance) {
        let candidates = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner !== co || ct.isCapital || isMajorCity(ct.id) || ct.occupierFlag) continue;
            let score = typeof getCityUpgradeScore === 'function' ? getCityUpgradeScore(ct) : 0;
            if (score >= 0) candidates.push({city:ct,score:score});
        }
        candidates.sort((a,b) => b.score - a.score);
        if (candidates.length > 0 && candidates[0].score > 0) {
            let city = candidates[0].city;
            cd.treasury -= 150;
            if (!G.buildQueue) G.buildQueue = [];
            G.buildQueue.push({ type: 'upgrade_city', province: city.id, days: 40, totalDays: 40, cityId: city.id, cityLon: city.lon, cityLat: city.lat, cityName: city.name });
        }
    }

    // AI 升级小城市粮食产量（金钱充足时，优先前线/接近敌国城市的小城市）
    if (cd.treasury > ((typeof GRAIN_UPGRADE_COST !== 'undefined') ? GRAIN_UPGRADE_COST : 100) * 3 && Math.random() < (atWar ? 0.15 : 0.10)) {
        let grainCands = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner !== co || ct.cityType !== 'small' || ct.grainUpgraded || ct.grainUpgradeProgress > 0) continue;
            let score = 10;
            for (let ec in G.cities) {
                let ec2 = G.cities[ec];
                if (!ec2 || ec2.owner === co) continue;
                let _d = Math.hypot(ct.lon - ec2.lon, ct.lat - ec2.lat);
                if (_d < 3) score += 20;
                else if (_d < 6) score += 8;
            }
            grainCands.push({ city: ct, score: score });
        }
        grainCands.sort((a, b) => b.score - a.score);
        if (grainCands.length > 0) {
            let gc = grainCands[0].city;
            cd.treasury -= (typeof GRAIN_UPGRADE_COST !== 'undefined') ? GRAIN_UPGRADE_COST : 100;
            gc.grainUpgradeProgress = (typeof GRAIN_UPGRADE_DAYS !== 'undefined') ? GRAIN_UPGRADE_DAYS : 30;
            addGameLog(COUNTRY_CN[co] + " 开始升级 " + gc.name + " 粮食产量（" + ((typeof GRAIN_UPGRADE_DAYS !== 'undefined') ? GRAIN_UPGRADE_DAYS : 30) + "天）");
        }
    }
}

// ========== 2. 生产工厂军队（全面重写：花光所有余钱） ==========
function aiProduction(co, cd, pers) {
    let atWar = isCountryAtWar(co);
    let atWarWithList = getEnemiesOf(co);
    let enemyCount = atWarWithList.length > 0 ? atWarWithList.reduce((sum, e) => sum + G.divisions.filter(d => d.country === e && d.strength > 0).length, 0) : 0;
    let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
    let isGP = isGreatPower(co);

    // 军队上限：列强极大，小国也大幅提高（经济交由用户后续自行调整）
    let maxDivs = isGP ? 800 : (atWar ? 400 : 200);
    if (cd.divCount >= maxDivs) return;

    // 最低保留金币：0！花光所有钱（经济由用户后续自行调整，AI 不干预）
    let minTreasury = 0;
    let availableGold = cd.treasury - minTreasury;
    if (availableGold < 50) return; // 连最便宜的步兵都买不起
    if (cd.manpower < 5) return;
    // 计算能造多少轮次：国库全部投入
    // 步兵50金是最便宜的，用最大值估算轮次
    let maxPossible = Math.floor(availableGold / 50);
    // 每轮造兵数量取决于国库，但不设硬上限——有多少钱就造多少兵
    // 避免一轮内花太多导致卡顿，上限设为每tick造20个
    let rounds = Math.min(maxPossible, 20);
    // 战时且缺兵时，每tick造更多
    if (atWar && myCount < enemyCount * 0.8) rounds = Math.min(maxPossible, 30);
    // 和平时期也保持造兵，国库充裕造更多
    if (!atWar && cd.treasury > 500) rounds = Math.min(maxPossible, 15);

    // 兵种成本表
    let unitCosts = {
        infantry: 50, engineer: 70, cavalry: 80, mountain: 85, artillery: 120
    };

    for (let r = 0; r < rounds; r++) {
        if (cd.treasury < 50) break; // 没钱了
        if (cd.divCount >= maxDivs) break;
        if (cd.manpower < 5) break;

        // 统计当前各兵种数量
        let myInf = G.divisions.filter(d => d.country === co && d.type === 'infantry' && d.strength > 0).length;
        let myArt = G.divisions.filter(d => d.country === co && d.type === 'artillery' && d.strength > 0).length;
        let myCav = G.divisions.filter(d => d.country === co && d.type === 'cavalry' && d.strength > 0).length;
        let myEng = G.divisions.filter(d => d.country === co && d.type === 'engineer' && d.strength > 0).length;
        let myMtn = G.divisions.filter(d => d.country === co && d.type === 'mountain' && d.strength > 0).length;
        let total = myCount || 1;

        // 目标比例。山地国家保持 20%，非山地国家降至 2%（全局几乎不出山地师）
        // 山地国家列表：阿尔卑斯、喀尔巴阡、巴尔干、高加索地区
        const MOUNTAIN_NATIONS = { ITALY: true, SWITZERLAND: true, AUSTRIA_HUNGARY: true, TURKEY: true, BULGARIA: true, GREECE: true, MONTENEGRO: true, SERBIA: true, ALBANIA: true, ROMANIA: true };
        let mtnTarget = MOUNTAIN_NATIONS[co] ? 0.20 : 0.005;
        let infTarget = 0.55, artTarget = 0.15, cavTarget = 0.10, engTarget = 0.05;
        if (atWar) {
            artTarget = 0.20; // 战时稍多炮兵
            engTarget = 0.05; // 工兵仍极少
            infTarget = 0.48; // 步兵占绝对主导
        }
        // 非山地国家的山地兵配额让给步兵
        if (!MOUNTAIN_NATIONS[co]) {
            infTarget += (0.20 - mtnTarget); // 非山地国步兵比例吃掉山地兵的部分
        }

        let needInf = (total * infTarget) - myInf;
        let needArt = (total * artTarget) - myArt;
        let needCav = (total * cavTarget) - myCav;
        let needEng = (total * engTarget) - myEng;
        let needMtn = (total * mtnTarget) - myMtn;

        // 选择最缺且买得起的兵种
        let type = 'infantry';
        let maxNeed = needInf;

        // 按优先级排序检查
        let candidates = [
            { type: 'artillery', need: needArt, cost: 120 },
            { type: 'engineer', need: needEng, cost: 70 },
            { type: 'mountain', need: needMtn, cost: 85 },
            { type: 'cavalry', need: needCav, cost: 80 },
            { type: 'infantry', need: needInf, cost: 50 },
        ];
        // 按需求排序（需求高的优先）
        candidates.sort((a, b) => b.need - a.need);
        for (let c of candidates) {
            if (c.need > maxNeed && cd.treasury >= c.cost) {
                maxNeed = c.need;
                type = c.type;
            }
        }

        // 如果最需要的买不起，买最便宜的
        if (cd.treasury < unitCosts[type]) {
            let cheapest = 'infantry';
            for (let t of ['infantry', 'engineer', 'cavalry', 'mountain', 'artillery']) {
                if (cd.treasury >= unitCosts[t]) { cheapest = t; break; }
            }
            type = cheapest;
        }
        if (cd.treasury < unitCosts[type]) break;

        // 找可生产省份
        let ps = getCountryProvinces ? getCountryProvinces(co).filter(p => p.garrison < 3) : [];
        if (ps.length === 0) {
            // 没有空余省份，直接通过城市生产
            let anyCity = null;
            // 全国暴兵：前线城市权重高但后方城市也能生产（加权随机选城）
            let atWarE = getEnemiesOf(co);
            let candidates = [];
            for (let cid in G.cities) {
                let c = G.cities[cid];
                if (c.owner !== co || c.hp <= 0) continue;
                let nearestEnemy = 999;
                for (let eid in G.cities) {
                    let ec = G.cities[eid];
                    if (!ec || ec.hp <= 0) continue;
                    if (atWarE.length > 0 && !atWarE.includes(ec.owner)) continue;
                    if (atWarE.length === 0 && ec.owner === co) continue;
                    let dist = Math.hypot(c.lon - ec.lon, c.lat - ec.lat);
                    if (dist < nearestEnemy) nearestEnemy = dist;
                }
                let weight = nearestEnemy < 2.0 ? 5 : (nearestEnemy < 5.0 ? 3 : 1);
                if (c.isCapital) weight = Math.max(1, weight - 1);
                candidates.push({ city: c, weight: weight });
            }
            if (candidates.length > 0) {
                // 加权随机选取：前线权重高但后方也有概率
                let totalW = 0;
                for (let cnd of candidates) totalW += cnd.weight;
                let r = Math.random() * totalW;
                let sum = 0;
                for (let cnd of candidates) { sum += cnd.weight; if (r <= sum) { anyCity = cnd.city; break; } }
                if (!anyCity) anyCity = candidates[0].city;
            }
            if (!anyCity) {
                for (let cid in G.cities) { let c = G.cities[cid]; if (c.owner === co && c.hp > 0) { anyCity = c; break; } }
            }
            if (anyCity) {
                let buildDays = { infantry: 3, engineer: 3, cavalry: 4, artillery: 5, mountain: 3 }[type] || 20;
                let mc = unitCosts[type] || 10;
                if (cd.manpower >= mc) {
                    cd.treasury -= unitCosts[type];
                    cd.manpower -= mc;
                    // divCount由createDivision处理，此处不手动增加
                    if (!G.buildQueue) G.buildQueue = [];
                    G.buildQueue.push({ type: 'unit', unitType: type, province: anyCity.provinceId, days: buildDays, totalDays: buildDays, cityId: anyCity.id, cityLon: anyCity.lon, cityLat: anyCity.lat, country: co });
                    continue;
                }
            }
            break;
        }
        let prov = ps[Math.floor(Math.random() * ps.length)];

        // 通过城市生产队列——全国暴兵加权随机选城
        if (G.cities) {
            let aiCity = null;
            let atWarE = getEnemiesOf(co);
            let candidates = [];
            for (let cid in G.cities) {
                let c = G.cities[cid];
                if (c.owner !== co || c.hp <= 0) continue;
                let nearestEnemy = 999;
                for (let eid in G.cities) {
                    let ec = G.cities[eid];
                    if (!ec || ec.hp <= 0) continue;
                    if (atWarE.length > 0 && !atWarE.includes(ec.owner)) continue;
                    if (atWarE.length === 0 && ec.owner === co) continue;
                    let dist = Math.hypot(c.lon - ec.lon, c.lat - ec.lat);
                    if (dist < nearestEnemy) nearestEnemy = dist;
                }
                let weight = nearestEnemy < 2.0 ? 5 : (nearestEnemy < 5.0 ? 3 : 1);
                if (c.isCapital) weight = Math.max(1, weight - 1);
                candidates.push({ city: c, weight: weight });
            }
            if (candidates.length > 0) {
                let totalW = 0;
                for (let cnd of candidates) totalW += cnd.weight;
                let r = Math.random() * totalW;
                let sum = 0;
                for (let cnd of candidates) { sum += cnd.weight; if (r <= sum) { aiCity = cnd.city; break; } }
                if (!aiCity) aiCity = candidates[0].city;
            }
            if (!aiCity) {
                for (let cid in G.cities) { let c = G.cities[cid]; if (c.owner === co && c.hp > 0) { aiCity = c; break; } }
            }
            if (aiCity && cd.treasury >= unitCosts[type]) {
                let buildDays = { infantry: 3, engineer: 3, cavalry: 4, artillery: 5, mountain: 3 }[type] || 20;
                let mc = unitCosts[type] || 10;
                if (cd.manpower >= mc) {
                    cd.treasury -= unitCosts[type];
                    cd.manpower -= mc;
                    // divCount由createDivision处理，此处不手动增加
                    if (!G.buildQueue) G.buildQueue = [];
                    G.buildQueue.push({ type: 'unit', unitType: type, province: aiCity.provinceId, days: buildDays, totalDays: buildDays, cityId: aiCity.id, cityLon: aiCity.lon, cityLat: aiCity.lat, country: co });
                    continue;
                }
            }
        }
        // 直接创建（兜底）
        if (typeof createDivision === 'function') {
            createDivision(prov.id, co, type);
            // divCount由createDivision处理，不手动增加
        } else {
            break;
        }
    }
}

// ========== 3. 外交策略 ==========
// AI 外交行动同样消耗外交点数（与玩家一致：宣战5/同盟10/保障10），点数不足则放弃
function aiSpendDiplomacy(co, cost) {
    if (!G.diplomacyPoints) return false;
    if ((G.diplomacyPoints[co] || 0) < cost) return false;
    G.diplomacyPoints[co] -= cost;
    return true;
}

function aiDiplomacy(co, cd, pers, allCountries) {
    if (Math.random() > 0.25) return;
    let atWar = isCountryAtWar(co);
    let atWarWithList = getEnemiesOf(co);

    let currentAllies = 0;
    if (G.alliances && G.alliances[co]) {
        currentAllies = Object.keys(G.alliances[co]).length;
    }

    // === 同盟义务：盟友已参战则自动加入（进攻方也触发） ===
    if (!atWar && G.alliances && G.alliances[co] && pers.diplomacy > 0.3) {
        for (let ally in G.alliances[co]) {
            if (!isCountryAtWar(ally)) continue;
            let allyEnemies = getEnemiesOf(ally);
            for (let enemy of allyEnemies) {
                if (atWarWithList.includes(enemy) || areAtWar(co, enemy)) continue;
                let enemyCount = G.divisions.filter(d => d.country === enemy && d.strength > 0).length;
                let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
                let powerRatio = myCount / Math.max(1, enemyCount);
                let borderProvs = getCountryProvinces(co).filter(p =>
                    Object.values(G.provinceData).some(np =>
                        np.country === enemy && np.center && p.center &&
                        Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 1.0
                    )
                );
                let shouldJoin = false;
                if (borderProvs.length > 0 && powerRatio > 0.8) shouldJoin = true;
                else if (powerRatio > 1.5 && pers.aggression > 0.4) shouldJoin = true;
                else if (powerRatio > 2.5) shouldJoin = true;
                if (shouldJoin && Math.random() < pers.diplomacy * 0.3 && aiSpendDiplomacy(co, 5)) {
                    declareWar(co, enemy);
                    addGameLog((COUNTRY_CN[co] || co) + "履行同盟义务向" + (COUNTRY_CN[enemy] || enemy) + "宣战！");
                    atWarWithList.push(enemy);
                }
            }
        }
    }

    for (let other of allCountries) {
        if (other === co) continue;
        if (G.surrendered[other]) continue;
        let isGreatPowerOther = isGreatPower(other);

        // === 宣战逻辑 ===
        if (co === 'FRANCE' && other === 'AUSTRIA_HUNGARY') continue;
        if (!atWar && !areAtWar(co, other) && pers.aggression > 0.2) {
            let shouldDeclare = false;
            let otherCount = G.divisions.filter(d => d.country === other && d.strength > 0).length;
            let totalEnemyCount = otherCount;
            if (G.alliances && G.alliances[other]) {
                for (let ally in G.alliances[other]) {
                    totalEnemyCount += G.divisions.filter(d => d.country === ally && d.strength > 0).length;
                }
            }
            let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
            let powerRatio = myCount / Math.max(1, totalEnemyCount);

            let borderProvs = getCountryProvinces(co).filter(p =>
                Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 1.0
                )
            );

            let hasGreatPowerAlly = false;
            if (G.alliances && G.alliances[other]) {
                for (let ally in G.alliances[other]) {
                    if (isGreatPower(ally)) { hasGreatPowerAlly = true; break; }
                }
            }

            if (!hasGreatPowerAlly) {
                let threshold = pers.aggression > 0.7 ? 1.3 : (pers.aggression > 0.5 ? 1.8 : 2.5);
                if (borderProvs.length > 0 && powerRatio > threshold && Math.random() < pers.aggression * 0.04) {
                    shouldDeclare = true;
                }
                if (borderProvs.length > 0 && !isGreatPowerOther && powerRatio > 1.2 && Math.random() < pers.aggression * 0.03) {
                    shouldDeclare = true;
                }
            }
            if (hasGreatPowerAlly && borderProvs.length > 0 && powerRatio > 2.5 && pers.aggression > 0.6 && Math.random() < 0.02) {
                shouldDeclare = true;
            }

            if (shouldDeclare && aiSpendDiplomacy(co, 5)) {
                declareWar(co, other);
                addGameLog((COUNTRY_CN[co] || co) + "向" + (COUNTRY_CN[other] || other) + "宣战！");
            }
        }

        // === 结盟逻辑（最多2个同盟，优先邻居） ===
        if (!areAtWar(co, other) && !G.alliances[co]?.[other] && !G.alliances[other]?.[co] && currentAllies < 2) {
            let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY', 'BULGARIA', 'TURKEY'];
            let ententeCore = ['FRANCE', 'UK', 'RUSSIA', 'SERBIA'];
            let coIsCentral = centralCore.includes(co);
            let coIsEntente = ententeCore.includes(co);
            let otherIsCentral = centralCore.includes(other);
            let otherIsEntente = ententeCore.includes(other);
            if ((coIsCentral && otherIsEntente) || (coIsEntente && otherIsCentral)) continue;
            let shouldAlly = false;

            let borderProvs = getCountryProvinces(co).filter(p =>
                Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 1.0
                )
            );

            let isNeighbor = borderProvs.length > 0;
            let commonEnemies = atWarWithList.filter(e => getEnemiesOf(other).includes(e));

            if (isNeighbor && commonEnemies.length > 0 && Math.random() < pers.diplomacy * 0.25) {
                shouldAlly = true;
            }
            let rel = G.relations?.[co]?.[other] || 0;
            if (isNeighbor && rel > 40 && Math.random() < pers.diplomacy * 0.12) {
                shouldAlly = true;
            }
            if (!isGreatPower(co) && isGreatPowerOther && isNeighbor && cd.divCount < 10 && Math.random() < pers.diplomacy * 0.15) {
                shouldAlly = true;
            }

            if (shouldAlly && aiSpendDiplomacy(co, 10)) {
                if (!G.alliances[co]) G.alliances[co] = {};
                G.alliances[co][other] = true;
                if (!G.alliances[other]) G.alliances[other] = {};
                G.alliances[other][co] = true;
                currentAllies++;
                addGameLog((COUNTRY_CN[co] || co) + "与" + (COUNTRY_CN[other] || other) + "结为同盟！");
            }
        }

        // === 保障独立 ===
        if (!areAtWar(co, other) && !isGuaranteedBy(other, co)) {
            let shouldGuarantee = false;
            if (isGreatPower(co) && !isGreatPowerOther && cd.divCount > 15 && Math.random() < pers.diplomacy * 0.05) {
                shouldGuarantee = true;
            }
            let borderProvs = getCountryProvinces(co).filter(p =>
                Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 0.8
                )
            );
            if (borderProvs.length > 0 && !isGreatPowerOther && pers.diplomacy > 0.5 && Math.random() < 0.08) {
                shouldGuarantee = true;
            }

            if (shouldGuarantee && aiSpendDiplomacy(co, 10)) {
                guaranteeIndependence(co, other);
                addGameLog((COUNTRY_CN[co] || co) + "保障" + (COUNTRY_CN[other] || other) + "独立");
            }
        }

        // === 提升好感 ===
        if (!areAtWar(co, other) && Math.random() < pers.diplomacy * 0.12) {
            if (!G.relations) G.relations = {};
            if (!G.relations[co]) G.relations[co] = {};
            if (!G.relations[other]) G.relations[other] = {};
            let currentRel = G.relations[co][other] || 0;
            if (currentRel < 80) {
                let increase = 1 + Math.random() * 3;
                G.relations[co][other] = Math.min(100, currentRel + increase);
                G.relations[other][co] = (G.relations[other][co] || 0) + increase * 0.5;
            }
        }
    }
}

// ========== 4. 应对入侵 ==========
function aiDefenseResponse(co, cd, pers) {
    let atWarWithList = getEnemiesOf(co);
    if (atWarWithList.length === 0) return;

    let myProvinceCenters = getCountryProvinces(co).filter(p => p.center).map(p => p.center);
    if (myProvinceCenters.length === 0) return;
    let minX = 999, maxX = -999, minY = 999, maxY = -999;
    for (let ctr of myProvinceCenters) {
        if (ctr[0] < minX) minX = ctr[0]; if (ctr[0] > maxX) maxX = ctr[0];
        if (ctr[1] < minY) minY = ctr[1]; if (ctr[1] > maxY) maxY = ctr[1];
    }
    minX -= 1.5; maxX += 1.5; minY -= 1.5; maxY += 1.5;

    let enemyUnits = [];
    for (let d of G.divisions) {
        if (d.country === co || d.strength <= 0) continue;
        if (!atWarWithList.includes(d.country)) continue;
        if (d.rx < minX || d.rx > maxX || d.ry < minY || d.ry > maxY) continue;
        for (let ctr of myProvinceCenters) {
            let dx = Math.abs(d.rx - ctr[0]), dy = Math.abs(d.ry - ctr[1]);
            if (dx > 1.5 || dy > 1.5) continue;
            if (dx*dx + dy*dy < 2.25) { enemyUnits.push(d); break; }
        }
    }

    // === 城市驻防：每个城市（包括首都）保持至少1个师的驻军 ===
    if (pers.fortify > 0.1 && G.cities) {
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner !== co) continue;
            let isBorderCity = ct.isCapital; // 首都始终需要驻防
            if (!ct.isCapital) {
                for (let pid in G.provinceData) {
                    let pd = G.provinceData[pid];
                    if (pd.country === co || !pd.center) continue;
                    if (Math.hypot(pd.center[0] - ct.lon, pd.center[1] - ct.lat) < 2.0) { isBorderCity = true; break; }
                }
            }
            if (!isBorderCity) continue;
            let nearbyDefenders = G.divisions.filter(d =>
                d.country === co && d.strength > 0 &&
                Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5
            ).length;
            let neededGarrison = ct.isCapital ? Math.min(4, Math.ceil(cd.divCount * 0.08)) : Math.min(2, Math.ceil(cd.divCount * 0.05));
            if (nearbyDefenders >= neededGarrison) continue;
            let idleUnit = null;
            for (let d of G.divisions) {
                if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id] && !d._aiTask) {
                    idleUnit = d; break;
                }
            }
            if (idleUnit) {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(idleUnit, ct.lon, ct.lat);
                else { idleUnit.state = 'moving'; idleUnit.targetX = ct.lon; idleUnit.targetY = ct.lat; }
                idleUnit._aiTask = 'DEFEND_CITY';
                idleUnit._aiTaskTarget = { lon: ct.lon, lat: ct.lat };
                idleUnit._aiTaskAge = 0;
            }
        }
    }

    // === 突破点防御：发现多处敌单位聚集区域，集中己方兵力 ===
    if (enemyUnits.length > 3) {
        let clusters = [];
        for (let e of enemyUnits) {
            let found = false;
            for (let cl of clusters) {
                if (Math.hypot(cl.cx - e.rx, cl.cy - e.ry) < 1.5) { cl.count++; cl.totalStr += e.strength; found = true; break; }
            }
            if (!found) clusters.push({ cx: e.rx, cy: e.ry, count: 1, totalStr: e.strength });
        }
        clusters.sort((a, b) => b.count - a.count);
        if (clusters.length > 0 && clusters[0].count > 2) {
            let breachPt = clusters[0];
            let nearbyDefenders = G.divisions.filter(d =>
                d.country === co && d.strength > 0 &&
                Math.hypot(d.rx - breachPt.cx, d.ry - breachPt.cy) < 2.5
            ).length;
            let needed = Math.min(clusters[0].count + 1, Math.ceil(cd.divCount * 0.2));
            if (nearbyDefenders < needed) {
                let idleForBreach = [];
                for (let d of G.divisions) {
                    if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id] && !d._aiTask) {
                        idleForBreach.push(d);
                    }
                }
                let shortfall = needed - nearbyDefenders;
                for (let i = 0; i < Math.min(shortfall, idleForBreach.length); i++) {
                    let d = idleForBreach[i];
                    let tx = breachPt.cx + (Math.random() - 0.5) * 0.5;
                    let ty = breachPt.cy + (Math.random() - 0.5) * 0.5;
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                    else { d.state = 'moving'; d.targetX = tx; d.targetY = ty; }
                    d._aiTask = 'DEFEND_BREACH';
                    d._aiTaskTarget = { lon: tx, lat: ty };
                    d._aiTaskAge = 0;
                }
            }
            return;
        }
    }

    // === 常规防御：调动空闲部队到敌人附近（跳过有_aiTask标记的单位） ===
    if (enemyUnits.length === 0) return;
    let idleUnits = [];
    for (let d of G.divisions) {
        if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id] && !d._aiTask) {
            idleUnits.push(d);
        }
    }

    let russiaPriority = co === 'AUSTRIA_HUNGARY';
    for (let enemy of enemyUnits) {
        let priority = (russiaPriority && enemy.country === 'RUSSIA') ? 2.0 : 1.0;
        let nearest = null, bestDist = 999;
        for (let unit of idleUnits) {
            let dx = unit.rx - enemy.rx, dy = unit.ry - enemy.ry;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) continue;
            let dist = Math.hypot(dx, dy) / priority;
            if (dist < bestDist) { nearest = unit; bestDist = dist; }
        }
        if (nearest && bestDist < 10) {
            if (typeof aiMoveToEnemy === 'function') {
                aiMoveToEnemy(nearest, enemy);
            } else {
                nearest.state = 'moving';
                let ut = UNIT_TYPES[nearest.type] || UNIT_TYPES.infantry;
                let desiredDist = ut.range * 0.85;
                let dx = enemy.rx - nearest.rx, dy = enemy.ry - nearest.ry;
                let dist = Math.hypot(dx, dy);
                nearest.targetX = nearest.rx + (dx / dist) * (dist - desiredDist);
                nearest.targetY = nearest.ry + (dy / dist) * (dist - desiredDist);
            }
            idleUnits = idleUnits.filter(u => u.id !== nearest.id);
        }
    }

    if (Math.random() < pers.fortify * 0.25) {
        let borderProvs = [];
        for (let p of getCountryProvinces(co)) {
            if (!p.center) continue;
            for (let e of enemyUnits) {
                let dx = Math.abs(p.center[0] - e.rx), dy = Math.abs(p.center[1] - e.ry);
                if (dx > 1.5 || dy > 1.5) continue;
                if (dx*dx + dy*dy < 2.25) { borderProvs.push(p); break; }
            }
        }
        if (borderProvs.length > 0) {
            let idleForPatrol = [];
            for (let d of G.divisions) {
                if (d.country === co && d.state === 'idle' && d.strength > 0 && !G.patrolTargets[d.id] && !d._aiTask) {
                    idleForPatrol.push(d);
                }
            }
            if (idleForPatrol.length > 0) {
                let unit = idleForPatrol[Math.floor(Math.random() * idleForPatrol.length)];
                let targetProv = borderProvs[Math.floor(Math.random() * borderProvs.length)];
                G.patrolTargets[unit.id] = [targetProv.id];
            }
        }
    }
}

// ========== 4.6 海军战略（舰队集中） ==========
function aiNavyStrategy(allCountries) {
    for (let co of allCountries) {
        let atWarWithList = getEnemiesOf(co);
        if (atWarWithList.length === 0) continue;
        if (typeof isGreatPower !== 'function' || !isGreatPower(co)) continue;
        let isNavalPower = ['UK', 'GERMANY', 'FRANCE', 'ITALY', 'RUSSIA', 'TURKEY', 'AUSTRIA_HUNGARY'].includes(co);
        if (!isNavalPower) continue;

        let myShips = G.divisions.filter(d => d.country === co && d.type === 'navy' && d.strength > 0);
        if (myShips.length < 3) continue;

        let enemyShips = G.divisions.filter(d =>
            d.type === 'navy' && d.strength > 0 &&
            atWarWithList.includes(d.country)
        );

        // 舰队集中：将分散的己方舰船聚集成群（距离 > 3 的拉近距离）
        for (let i = 0; i < myShips.length; i++) {
            let si = myShips[i];
            if (si.state === 'moving' || si.state === 'retreating') continue;
            let nearestFriend = null, bestDist = Infinity;
            for (let j = 0; j < myShips.length; j++) {
                if (i === j) continue;
                let sj = myShips[j];
                let dist = Math.hypot(si.rx - sj.rx, si.ry - sj.ry);
                if (dist < bestDist) { nearestFriend = sj; bestDist = dist; }
            }
            if (nearestFriend && bestDist > 3 && Math.random() < 0.1) {
                let tx = (si.rx + nearestFriend.rx) / 2;
                let ty = (si.ry + nearestFriend.ry) / 2;
                if (!isLandPoint(tx, ty)) { aiMoveTo(si, tx, ty); }
            }
        }
    }
}

// ========== 5. AI攻击移动（全面重写：集团化进攻，多兵种协同） ==========
function aiAttackMovement(allCountries) {
    // 缓存每个国家的数据
    let cityLossCache = {};
    let enemyCityCache = {};
    let alliedCache = {};

    for (let co of allCountries) {
        let myCities = 0, myTotal = 0;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!ct) continue;
            let origOwner = ct.originalCountry || ct.country;
            if (origOwner === co) myTotal++;
            if (ct.owner === co) myCities++;
        }
        cityLossCache[co] = myTotal > 0 ? 1 - (myCities / myTotal) : 0;

        let atWarList = getEnemiesOf(co);
        if (atWarList.length > 0) {
            let allySet = new Set();
            if (G.alliances && G.alliances[co]) {
                for (let ally in G.alliances[co]) allySet.add(ally);
            }
            alliedCache[co] = allySet;
            let enemyCities = [];
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (!ct || ct.hp <= 0 || ct.owner === co || ct.owner === G.playerCountry) continue;
                if (!atWarList.includes(ct.owner)) continue;
                if (allySet.has(ct.owner)) continue;
                enemyCities.push(ct);
            }
            enemyCityCache[co] = enemyCities;
        }
    }

    // ===== 核心：以国家为单位，集团化分配目标 =====
    for (let co of allCountries) {
        let atWarWithList = getEnemiesOf(co);
        if (atWarWithList.length === 0) {
            // 和平时期：向边境集结
            aiPeaceTimeDeployment(co);
            continue;
        }

        let pers = getPersonality(co);
        let enemyCities = enemyCityCache[co] || [];
        if (enemyCities.length === 0) continue;

        // 获取所有非海军、非撤退的单位
        let myUnits = G.divisions.filter(d => 
            d.country === co && d.strength > 0 && 
            d.state !== 'retreating' &&
            d.type !== 'navy' && d.type !== 'submarine'
        );
        if (myUnits.length === 0) continue;

        // 对已有攻击任务且目标仍存在的单位，保留其任务（不重新分配）
        for (let d of myUnits) {
            if (d._aiTask === 'ATTACK' && d._aiTaskTarget) {
                // 检查目标是否仍然有效（敌方城市还存在）
                let targetValid = false;
                for (let cid in G.cities) {
                    let ct = G.cities[cid];
                    if (ct && ct.hp > 0 && atWarWithList.includes(ct.owner) && 
                        Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.5) {
                        targetValid = true;
                        break;
                    }
                }
                if (!targetValid) {
                    d._aiTask = null;
                    d._aiTaskTarget = null;
                }
                // 有效目标则保留，不参与重新分配
            }
        }
        // 只处理无任务或空闲的单位
        myUnits = myUnits.filter(d => !d._aiTask && d.state !== 'moving');

        // ===== 中立城市优先占领（Bug修复：每个附近中立城市分1个单位，确保不被遗忘） =====
        // 修复根因：中立城市排在敌方城市后面，史丽芬加权的比利时城市评分极高（600+），
        // 中立城市永远轮不到。现在在正式进攻分配之前，先为每个中立城市指派一个最近的单位。
        let neutralPreAssign = [];
        // 内联计算中立城市（不能引用后面才声明的 neutralCities）
        let _tempNeutralCities = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!isNeutralCity(ct, co)) continue;
            let nearMyCity = 999;
            for (let cid2 in G.cities) {
                let oc = G.cities[cid2];
                if (!oc || oc.hp <= 0 || oc.owner !== co) continue;
                let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
                if (d < nearMyCity) nearMyCity = d;
            }
            if (nearMyCity > 3.5) continue;
            _tempNeutralCities.push(ct);
        }
        for (let nc of _tempNeutralCities) {
            if (nc.owner === co) continue;
            let bestUnit = null, bestDist = 999;
            for (let u of myUnits) {
                if (u._aiTask || u.state === 'moving') continue;
                if (u.type === 'artillery') continue; // 火炮不去占中立城
                let dd = Math.hypot(u.rx - nc.lon, u.ry - nc.lat);
                if (dd < bestDist && dd < 8.0) { bestDist = dd; bestUnit = u; }
            }
            if (bestUnit) {
                // 标记该单位已分配（避免后续攻击分配重复使用）
                bestUnit._aiTask = 'ATTACK';
                bestUnit._aiTaskTarget = { lon: nc.lon, lat: nc.lat };
                bestUnit._aiTaskAge = 0;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(bestUnit, nc.lon, nc.lat);
                else { bestUnit.state = 'moving'; bestUnit.targetX = nc.lon; bestUnit.targetY = nc.lat; }
            }
        }
        // 重新过滤仍可用的单位（排除已分配给中立城市的）
        myUnits = myUnits.filter(d => !d._aiTask && d.state !== 'moving');

        // 计算总体兵力对比
        let myTotal = G.divisions.filter(d => d.country === co && d.strength > 0 && d.type !== 'navy').length;
        let enemyTotal = 0;
        for (let d of G.divisions) {
            if (d.strength > 0 && atWarWithList.includes(d.country) && d.type !== 'navy') enemyTotal++;
        }
        // 侵略性分级（方案5+11）：国家个性为主，兵力比为辅
        // 德国(0.85)/俄国(0.65)等侵略性高的国家：始终高侵略（除非损失惨重）——不再被全局兵力比压制
        // 侵略性低的国家：兵力占优才进攻
        let forceRatio = enemyTotal > 0 ? myTotal / enemyTotal : 999;
        let lossRatio = cityLossCache[co] || 0;
        function getAggressionLevel() {
            // 高侵略个性（德国0.85、俄国0.65、奥匈0.7）：除非本土沦陷>20%，否则保持高侵略
            if (pers.aggression >= 0.65 && lossRatio < 0.2) return 'high';
            // 中等个性：兵力占优才高侵略
            if (forceRatio > 1.5 && pers.aggression > 0.4) return 'high';
            if (forceRatio > 1.3) return 'high';
            if (lossRatio > 0.3 || forceRatio < 0.6) return 'low';
            return 'normal';
        }
        let aggressionLvl = getAggressionLevel();
        let forceAdvantage = aggressionLvl === 'high' ? true : // 高侵略：不看全局兵力，局部优势判断放组内
                              aggressionLvl === 'low' ? (myTotal > enemyTotal * 2.0) :
                              (myTotal > enemyTotal * 1.2);

        // ===== 1. 对敌方城市排序（优先级） =====
        // 获取己方领土中心（用于计算边境城市）
        let myProvs = getCountryProvinces ? getCountryProvinces(co) : [];
        let myProvCenters = myProvs.filter(p => p.center).map(p => p.center);

        // ===== 己方沦陷城市（修复#8：优先收复——收复权重再提高，任何国家都必须积极收复） =====
        let reclaimedCities = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.hp <= 0 || ct.originalOwner !== co || ct.owner === co) continue;
            // 收复优先级：首都 400 / 大城市 220 / 农业 180 / 普通 150——比绝大多数敌方城市高
            let score = ct.isCapital ? 400 : (typeof isMajorCity === 'function' && isMajorCity(ct.id) ? 220 : (ct.cityType === 'agri' ? 180 : 150));
            // 沦陷时间越长、距己方越近越优先
            for (let pc of myProvCenters) {
                let d = Math.hypot(pc[0] - ct.lon, pc[1] - ct.lat);
                if (d < 3.0) { score += 80; break; }
                else if (d < 8.0) score += 40;
            }
            // 距己方控制城市近的沦陷城（动态前线收复）
            let nearMyCity = 999;
            for (let cid2 in G.cities) {
                let oc = G.cities[cid2];
                if (!oc || oc.hp <= 0 || oc.owner !== co) continue;
                let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
                if (d < nearMyCity) nearMyCity = d;
            }
            if (nearMyCity < 4.0) score += 100; // 就在家门口的沦陷城：绝对优先
            reclaimedCities.push({ city: ct, score: score, defenders: 0, owner: ct.owner, isReclaim: true });
        }
        reclaimedCities.sort((a, b) => b.score - a.score);

        // ===== 中立城市（修复#3：优先占领，范围放宽到己方控制区周边） =====
        // 游戏里未参战国城市 owner 是国家代码（非 null），用 isNeutralCity 判定
        let neutralCities = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!isNeutralCity(ct, co)) continue;
            // 距最近己方城市（已控制区域）的距离——不要求身边已有军队，主动去占
            let nearMyCity = 999;
            for (let cid2 in G.cities) {
                let oc = G.cities[cid2];
                if (!oc || oc.hp <= 0 || oc.owner !== co) continue;
                let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
                if (d < nearMyCity) nearMyCity = d;
            }
            if (nearMyCity > 3.5) continue; // 只占"家门口"的中立城（太远让给别的国家，主力不分散）
            let score = ct.isCapital ? 100 : (typeof isMajorCity === 'function' && isMajorCity(ct.id) ? 70 : 55);
            // 离己方控制区越近越优先
            score += Math.max(0, 40 - nearMyCity * 8);
            // 中立城市附近无敌军就更优先
            let enemyNear = 0;
            for (let d of G.divisions) {
                if (d.strength > 0 && atWarWithList.includes(d.country) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) enemyNear++;
            }
            if (enemyNear === 0) score += 40;
            neutralCities.push({ city: ct, score: score, defenders: 0, owner: null, isNeutral: true });
        }
        neutralCities.sort((a, b) => b.score - a.score);

        let scoredCities = enemyCities.map(ct => {
            let score = 0;
            // 前线距离：动态判定——到最近"己方控制城市"的距离（含占领的敌城，不写死国界）
            // 打到哪里，哪里就是前线；敌国城市被占后成为己方前线基点
            let frontlineDist = 999;
            for (let cid in G.cities) {
                let oc = G.cities[cid];
                if (!oc || oc.hp <= 0 || oc.owner !== co) continue;
                let d = Math.hypot(oc.lon - ct.lon, oc.lat - ct.lat);
                if (d < frontlineDist) frontlineDist = d;
            }
            // 兜底：无己方城市时退回省份中心
            if (frontlineDist >= 999) {
                for (let pc of myProvCenters) {
                    let d = Math.hypot(pc[0] - ct.lon, pc[1] - ct.lat);
                    if (d < frontlineDist) frontlineDist = d;
                }
            }
            // ── 核心：前线优先，腹地扣分 ──
            // 前线城市（距己方控制区 < 2°）：基础分极高，优先拿下
            if (frontlineDist < 2.0) score += 120;
            else if (frontlineDist < 4.0) score += 60;
            else if (frontlineDist < 6.0) score += 20;
            else score -= 30; // 深远腹地：扣分，等前线清完再说
            // 首都/大城市（仅在离前线不远时有效，太远的首都别再被优先）
            if (ct.isCapital) score += (frontlineDist < 3.0 ? 80 : (frontlineDist < 6.0 ? 40 : 0));
            if (isMajorCity(ct.id)) score += (frontlineDist < 3.0 ? 30 : (frontlineDist < 5.0 ? 15 : 0));
            // 农业城市
            if (ct.cityType === 'agri') score += 20;
            // 低血量城市优先
            let hpRatio = (ct.hp || 100) / (ct.maxHp || 100);
            if (hpRatio < 0.3) score += 50;
            else if (hpRatio < 0.5) score += 20;
            // 守军少的城市优先（范围评估核心：软柿子加成——守军越少越容易拿下）
            let defenders = 0;
            for (let d of G.divisions) {
                if (d.strength > 0 && d.country === ct.owner && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.0) defenders++;
            }
            score -= defenders * 10;
            // 软柿子加成：守军≤1 且距己方控制区近（<4°）→ 集群兵力优先拿下
            if (defenders === 0 && frontlineDist < 4.0) score += 90;
            else if (defenders <= 1 && frontlineDist < 3.0) score += 60;
            else if (defenders <= 2 && frontlineDist < 2.0) score += 30;
            // 距离越近分越高（线性衰减）
            score += Math.max(0, 60 - frontlineDist * 8);
            // 敌方国家重要性加权（国家角度优先于局部距离——先看这个国家该不该打，再看距离）
            let enemyCountryWeight = 1.0;
            // 史丽芬计划（修复#4）：德国在比利时与卢森堡均被彻底征服前，国家级硬性优先攻击这两个国家
            // 国家被灭判定：首都沦陷或已投降或已无己方城市
            function countryDefeated(c) {
                if (G.surrendered && G.surrendered[c]) return true;
                let hasCity = false;
                for (let cid in G.cities) {
                    let cc = G.cities[cid];
                    if (cc && cc.hp > 0 && cc.owner === c) { hasCity = true; break; }
                }
                return !hasCity;
            }
            if (co === 'GERMANY' && !countryDefeated('BELGIUM')) {
                if (ct.owner === 'BELGIUM') enemyCountryWeight = 6.0; // 比利时：国家硬性最高优先（叠加固定大分）
                else if (ct.owner === 'LUXEMBOURG') enemyCountryWeight = 4.0;
                else if (ct.owner === 'FRANCE') enemyCountryWeight = 0.8; // 比利时未灭：法国暂缓
                else enemyCountryWeight = 0.3; // 其他方向（东线）极低
            } else if (co === 'GERMANY' && !countryDefeated('LUXEMBOURG')) {
                if (ct.owner === 'LUXEMBOURG') enemyCountryWeight = 5.0;
                else if (ct.owner === 'BELGIUM') enemyCountryWeight = 3.0;
                else if (ct.owner === 'FRANCE') enemyCountryWeight = 1.2;
                else enemyCountryWeight = 0.4;
            } else if (co === 'GERMANY' && countryDefeated('BELGIUM') && countryDefeated('LUXEMBOURG')) {
                // 低地两国已灭 → 全力南下法国
                if (ct.owner === 'FRANCE') enemyCountryWeight = 3.0;
                else if (ct.owner === 'RUSSIA') enemyCountryWeight = 1.0;
                else enemyCountryWeight = 0.5;
            } else if (atWarWithList.length > 1) {
                // 主敌判定 = 历史敌对优先 + 兵力排名辅助（修复：不能只按兵力，否则土耳其会抢俄国的主敌位）
                let HISTORICAL_RIVALS = {
                    'GERMANY': ['FRANCE', 'RUSSIA'], 'FRANCE': ['GERMANY'],
                    'UK': ['GERMANY'], 'RUSSIA': ['GERMANY', 'AUSTRIA_HUNGARY', 'TURKEY'],
                    'AUSTRIA_HUNGARY': ['RUSSIA', 'SERBIA', 'ITALY'], 'ITALY': ['AUSTRIA_HUNGARY'],
                    'SERBIA': ['AUSTRIA_HUNGARY'], 'TURKEY': ['RUSSIA', 'GREECE'],
                    'BULGARIA': ['SERBIA', 'ROMANIA'], 'ROMANIA': ['BULGARIA', 'AUSTRIA_HUNGARY'],
                    'GREECE': ['TURKEY'], 'BELGIUM': ['GERMANY'], 'NETHERLANDS': ['GERMANY'],
                };
                // 计算每个敌国的总兵力
                let enemyForces = {};
                for (let d of G.divisions) {
                    if (d.strength > 0 && atWarWithList.includes(d.country)) {
                        enemyForces[d.country] = (enemyForces[d.country] || 0) + 1;
                    }
                }
                let enemySorted = [];
                for (let ec in enemyForces) {
                    enemySorted.push({ country: ec, force: enemyForces[ec] });
                }
                enemySorted.sort((a, b) => b.force - a.force);
                // 历史宿敌优先：从交战敌国里找历史敌对国，选兵力最大的那个为主敌
                let rivals = HISTORICAL_RIVALS[co] || [];
                let rivalEnemies = enemySorted.filter(e => rivals.includes(e.country));
                let mainEnemy = null;
                if (rivalEnemies.length > 0) {
                    mainEnemy = rivalEnemies[0].country; // 历史宿敌中兵力最大者
                } else {
                    mainEnemy = enemySorted.length > 0 ? enemySorted[0].country : null;
                }
                if (mainEnemy && ct.owner === mainEnemy) {
                    enemyCountryWeight = 3.0; // 主敌国城市权重3倍
                } else if (mainEnemy && ct.owner !== mainEnemy) {
                    // 次要敌人：历史宿敌中的次席也保留一定权重；非宿敌敌人进一步压低
                    let rank = enemySorted.findIndex(e => e.country === ct.owner);
                    if (rivals.includes(ct.owner)) {
                        enemyCountryWeight = rank <= 1 ? 1.2 : 0.6; // 历史敌对但非主敌
                    } else if (rank === 1) {
                        enemyCountryWeight = 0.4;
                    } else {
                        enemyCountryWeight = 0.2;
                    }
                }
            }
            // 国家角度优先：权重转成"硬性优先层"——权重>1.5 的国家城市加固定大分，绝对压过距离衰减
            // 距离只影响同国家内部的先后，不影响"先打哪个国家"
            let nationalBonus = 0;
            if (enemyCountryWeight >= 5.0) nationalBonus = 600;      // 硬性首要目标国（如史丽芬中的比利时）
            else if (enemyCountryWeight >= 3.0) nationalBonus = 350; // 明确目标国
            else if (enemyCountryWeight >= 1.5) nationalBonus = 150; // 主攻方向
            else if (enemyCountryWeight < 0.5) nationalBonus = -120; // 暂缓方向
            score = Math.round(score * Math.max(0.2, enemyCountryWeight)) + nationalBonus;
            return { city: ct, score: score, defenders: defenders, owner: ct.owner, nationalWeight: enemyCountryWeight };
        });
        scoredCities.sort((a, b) => b.score - a.score);

        // 沦陷城市 + 中立城市 插到 scoredCities 最前面（最高优先级）
        if (reclaimedCities.length > 0) {
            scoredCities = reclaimedCities.concat(scoredCities);
        }
        if (neutralCities.length > 0) {
            // 中立城市插在沦陷城市之后、敌方城市之前
            scoredCities = scoredCities.slice(0, reclaimedCities.length).concat(neutralCities).concat(scoredCities.slice(reclaimedCities.length));
        }

        // ===== 2. 将己方单位按区域分组 =====
        // 每个组共享一个目标城市
        let groups = [];
        let assigned = new Set();

        // 先处理已移动中的单位（保持其目标）
        // 处理空闲单位
        let idleUnits = myUnits.filter(d => d.state !== 'moving');
        // ===== 集团军整群进攻（修复#3）：同一集团军成员强制同组，共享一个进攻目标 =====
        // 先按 armyGroupId 分组（整群移动），剩余散兵再按位置聚类
        let armyGroupMap = {};
        for (let d of idleUnits) {
            if (!d.armyGroupId) continue;
            if (!armyGroupMap[d.armyGroupId]) armyGroupMap[d.armyGroupId] = [];
            armyGroupMap[d.armyGroupId].push(d);
        }
        for (let gid in armyGroupMap) {
            let mems = armyGroupMap[gid];
            if (mems.length === 0) continue;
            let cx = 0, cy = 0;
            for (let m of mems) { cx += m.rx; cy += m.ry; }
            groups.push({ units: mems, cx: cx / mems.length, cy: cy / mems.length, isArmyGroup: true });
            for (let m of mems) assigned.add(m.id);
        }
        // 按位置聚类（距离<3.0的归为一组，剩余散兵成组）
        for (let d of idleUnits) {
            if (assigned.has(d.id)) continue;
            let group = { units: [d], cx: d.rx, cy: d.ry };
            assigned.add(d.id);
            for (let other of idleUnits) {
                if (assigned.has(other.id)) continue;
                let dist = Math.hypot(d.rx - other.rx, d.ry - other.ry);
                if (dist < 3.0) {
                    group.units.push(other);
                    assigned.add(other.id);
                    // 更新组中心
                    group.cx = (group.cx + other.rx) / 2;
                    group.cy = (group.cy + other.ry) / 2;
                }
            }
            if (group.units.length >= 1) {
                groups.push(group);
            }
        }

        // 按组大小排序（大的在前）
        groups.sort((a, b) => b.units.length - a.units.length);

        // ===== 3. 为每个组分配目标城市 =====
        // 修复：允许多个组攻打同一个最高优先级城市，不再强制每个城市只分配一个组
        // 同时添加兵力集中度检查：兵力不足时等待集结
        // 战区分配（修复#7）：德国等多线国家按战区比例分兵
        let theaterSplit = null; // { theater -> { cities, targetPct, assignedGroups } }
        let tpStr = typeof getStrategy === 'function' ? getStrategy(co) : null;
        let tp = tpStr ? tpStr.theaterPlan : null;
        if (tp && atWarWithList.length > 1) {
            theaterSplit = {};
            let totalTcp = 0;
            for (let tk in tp) { if (tp[tk].priority > 0) totalTcp += tp[tk].targetPercent; }
            for (let tk in tp) {
                if (tp[tk].priority <= 0 || tp[tk].targetPercent <= 0.1) continue;
                let tCities = [];
                for (let sc of scoredCities) {
                    if (typeof THEATER_DEFS !== 'undefined' && THEATER_DEFS[tk] && THEATER_DEFS[tk].cos.includes(sc.city.owner)) {
                        tCities.push(sc);
                    }
                }
                if (tCities.length > 0) {
                    theaterSplit[tk] = { cities: tCities, targetPct: tp[tk].targetPercent / totalTcp, assignedGroups: 0 };
                }
            }
        }
        let cityGroupCount = {}; // 记录每个城市已分配的组数
        for (let gi = 0; gi < groups.length; gi++) {
            let g = groups[gi];
            let gSize = g.units.length;

            // 战区配额：限制该战区城市搜索范围
            let searchCities = scoredCities;
            // 国家级硬性目标优先（用户要求的"国家>范围>城市"层级）：
            // 硬目标只覆盖"部分组"——史丽芬主力（前70%的组）去打比利时，剩余30%保持战区分兵
            // 避免把东线/边境防御抽空（修复：德国边境城市沦陷还去打比利时的根因）
            let hardTargetCity = null;
            for (let sc of searchCities) {
                if (sc.city && sc.city.owner && sc.nationalWeight >= 5.0 && sc.score >= 300) { hardTargetCity = sc; break; }
            }
            let useHardTarget = false;
            if (hardTargetCity && atWarWithList.includes(hardTargetCity.city.owner)) {
                // 确认该国尚未被灭
                let stillAlive = false;
                for (let cid in G.cities) {
                    let cc = G.cities[cid];
                    if (cc && cc.hp > 0 && cc.owner === hardTargetCity.city.owner) { stillAlive = true; break; }
                }
                // 本土损失过大时取消硬目标：边境城市大量沦陷 → 先回防/收复，不闭眼打比利时
                let homelandLoss = cityLossCache[co] || 0;
                let homelandUnderAttack = false;
                if (homelandLoss > 0.25) {
                    // 确认确有己方城市被占（不只看比例——初始损失为0）
                    for (let cid2 in G.cities) {
                        let cc2 = G.cities[cid2];
                        if (cc2 && cc2.hp > 0 && cc2.originalOwner === co && cc2.owner !== co) { homelandUnderAttack = true; break; }
                    }
                }
                if (stillAlive && !homelandUnderAttack) {
                    // 普鲁士兵打俄国：组成员位置判断——成员多数在德国东部（lon>11）则不打西线硬目标
                    // 普鲁士地区（柏林13.4 / 柯尼斯堡/东普鲁士 20.4）天然离俄国近，征去打比利时太南辕北辙
                    let eastCount = 0, westCount = 0;
                    for (let u of g.units) { if (u.rx > 11.0) eastCount++; else westCount++; }
                    let groupIsEastern = eastCount > westCount;
                    // 只有"前60%的组"被硬目标征召；后面的组（编号后40%）回到正常分兵，保东线/保边境
                    // 普鲁士地区的组直接跳过硬目标（去打东线俄国）
                    if (!groupIsEastern && gi < Math.max(1, Math.floor(groups.length * 0.6))) {
                        useHardTarget = true;
                        // 硬目标过滤时保留收复城市+中立城市（边境沦陷时回防优先于继续入侵）
                        searchCities = scoredCities.filter(sc =>
                            sc.city.owner === hardTargetCity.city.owner || sc.isReclaim || sc.isNeutral
                        );
                        if (searchCities.length === 0) searchCities = scoredCities;
                    } else if (groupIsEastern) {
                        // 普鲁士兵主动定向俄国：searchCities 强制过滤为俄国城市
                        searchCities = scoredCities.filter(sc => sc.city.owner === 'RUSSIA');
                        if (searchCities.length === 0) searchCities = scoredCities;
                    }
                }
            }
            // 集团军持久战区（每个集团军只打自己的方向）——但硬目标优先时不限制
            if (!useHardTarget && typeof G !== 'undefined' && G.commanderState && G.commanderState.groups) {
                // 找出本组任一成员所属的集团军，取其 _theater
                let grpTheater = null;
                for (let u of g.units) {
                    if (!u.armyGroupId) continue;
                    let gr = G.commanderState.groups.find(gg => gg.id === u.armyGroupId);
                    if (gr && gr._theater) { grpTheater = gr._theater; break; }
                }
                if (grpTheater && typeof THEATER_DEFS !== 'undefined' && THEATER_DEFS[grpTheater]) {
                    let th = THEATER_DEFS[grpTheater];
                    let thCities = searchCities.filter(sc => th.cos.includes(sc.city.owner));
                    if (thCities.length > 0) searchCities = thCities;
                }
            }
            if (!useHardTarget && theaterSplit && Object.keys(theaterSplit).length >= 2) {
                // 按战区配额分配：哪个战区还没满就给它
                let bestTheater = null, bestUnder = -1;
                for (let tk in theaterSplit) {
                    let ts = theaterSplit[tk];
                    let expected = Math.max(1, Math.floor(groups.length * ts.targetPct));
                    let under = expected - ts.assignedGroups;
                    if (under > bestUnder && ts.cities.length > 0 && ts.assignedGroups < expected + 1) {
                        bestUnder = under; bestTheater = tk;
                    }
                }
                if (bestTheater && theaterSplit[bestTheater]) {
                    searchCities = theaterSplit[bestTheater].cities;
                    // 若该战区无城市可选，回退到全局
                    if (searchCities.length === 0) searchCities = scoredCities;
                }
            }

            // 找最佳目标城市（允许重复分配同一城市，但最多3个组）
            let bestCity = null, bestScore = -9999;
            for (let sc of searchCities) {
                let cityAssignedCount = cityGroupCount[sc.city.id] || 0;
                // 最高优先级城市（前3名）允许最多3个组同时攻打
                // 低优先级城市每个只能1个组
                let maxGroupsPerCity = (searchCities.indexOf(sc) < 3) ? 3 : 1;
                if (cityAssignedCount >= maxGroupsPerCity) continue;
                
                let dist = Math.hypot(g.cx - sc.city.lon, g.cy - sc.city.lat);
                // 距离越近、城市优先级越高、组越大，得分越高
                let score = sc.score - dist * 5 + gSize * 3;
                // 如果该组兵力太少而城市守军很多，降低得分（等待集结）
                let defenders = sc.defenders || 0;
                if (gSize < defenders * 0.5) score -= 30; // 兵力不足，降低优先级
                if (score > bestScore) { bestScore = score; bestCity = sc; }
            }

            if (!bestCity) break; // 没有可攻击的城市了

            // 记录此城市已被分配
            cityGroupCount[bestCity.city.id] = (cityGroupCount[bestCity.city.id] || 0) + 1;
            // 战区计数（bestTheater 仅在非硬目标分支定义，防御式访问）
            if (theaterSplit && typeof bestTheater !== 'undefined' && bestTheater && theaterSplit[bestTheater]) {
                theaterSplit[bestTheater].assignedGroups++;
            }

            // 兵力不足时跳过，等待更多单位就位
            // 计算此组+附近组的总兵力（半径5度内）
            let totalAssignedToCity = 0;
            for (let other of groups) {
                if (Math.hypot(other.cx - bestCity.city.lon, other.cy - bestCity.city.lat) < 5) {
                    totalAssignedToCity += other.units.length;
                }
            }
            // 同时计算该城市附近的守军数量
            let defenders = 0;
            for (let d of G.divisions) {
                if (d.strength > 0 && d.country === bestCity.city.owner && 
                    Math.hypot(d.rx - bestCity.city.lon, d.ry - bestCity.city.lat) < 1.0) {
                    defenders++;
                }
            }
            // 合理兵力评估（避免送死）：按城市等级设定最低师团数
            // 小城需要至少3个师（有炮时2个），大城5个（有炮时4个），首都10个（有炮时8个）
            // 守军每多1个，需求 +0.5（向上取整）
            let cityLevel = bestCity.city.isCapital ? 'capital' : 
                (typeof isMajorCity === 'function' && isMajorCity(bestCity.city.id) ? 'major' : 'small');
            const BASE_FORCE = { capital: 10, major: 5, small: 3 };
            let minForce = BASE_FORCE[cityLevel] || 3;
            minForce += Math.ceil(defenders * 0.5); // 守军增加需求
            // 火炮支援：有炮可降低步兵需求
            let hasArtillery = g.units.some(u => u.type === 'artillery');
            if (hasArtillery) minForce = Math.max(cityLevel === 'small' ? 1 : 2, minForce - 1);
            // 城市血量越低越容易攻破
            let hpRatio = (bestCity.city.hp || 100) / (bestCity.city.maxHp || 100);
            if (hpRatio < 0.4) minForce = Math.max(1, Math.floor(minForce * 0.7));
            if (hpRatio < 0.2) minForce = Math.max(1, Math.floor(minForce * 0.5));
            // 进攻方至少占 1.2 倍守军优势
            let needAdvantage = defenders === 0 || (totalAssignedToCity >= defenders * 1.2);
            // 中立城市/沦陷城市/已集结的部队放宽条件
            if (bestCity.isNeutral) { minForce = 1; needAdvantage = true; }
            if (bestCity.isReclaim) { minForce = Math.max(1, Math.ceil(minForce * 0.6)); needAdvantage = true; }
            if (Math.hypot(g.cx - bestCity.city.lon, g.cy - bestCity.city.lat) < 1.5 && gSize >= Math.max(2, Math.ceil(minForce * 0.7))) {
                needAdvantage = true; // 已兵临城下
            }
            // 前线敌军稀少时主动推进：城市 3° 内敌方总数 < 己方组兵力的 0.5 倍 → 取消兵力门槛
            let frontEnemyCount = 0;
            for (let d of G.divisions) {
                if (d.strength > 0 && atWarWithList.includes(d.country) && Math.hypot(d.rx - bestCity.city.lon, d.ry - bestCity.city.lat) < 3.0) frontEnemyCount++;
            }
            if (frontEnemyCount < gSize && gSize >= 2) {
                minForce = Math.min(minForce, Math.max(2, Math.ceil(frontEnemyCount * 0.8)));
                needAdvantage = true;
            }
            // 局部优势突破（修复#4）：城市 3° 内己方师团数 ≥ 敌方师团数 → 这是"局部打得到优势的仗"
            // 即使全局劣势，只要局部能突破就打——兵团不等人
            // 门槛：势均力敌（己方≥敌方）即允许突破，避免中期双方对峙无人进攻
            let lf = localForceAt(bestCity.city.lon, bestCity.city.lat, co);
            if (lf.my >= lf.enemy && lf.my >= 2) {
                needAdvantage = true;
                minForce = Math.min(minForce, Math.max(2, lf.my));
            }
            // 高侵略国家（德国/俄国/奥匈）：门槛再降——有3个师就敢打
            if (aggressionLvl === 'high') {
                minForce = Math.max(1, Math.floor(minForce * 0.6));
                needAdvantage = needAdvantage || (totalAssignedToCity >= defenders * 0.8);
            }
            if ((gSize < minForce && totalAssignedToCity < minForce) || !needAdvantage) {
                // 兵力不足或不占优势，尝试找次优目标（更软的柿子），而非无限等待集结
                // 修复根因：之前 skip→continue 导致组空闲等待集结，新兵到达后也加入等待，叠成"排队送死"
                let fallbackCity = null, fallbackScore = -9999;
                for (let sc2 of searchCities) {
                    if (sc2.city.id === bestCity.city.id) continue;
                    let c2assigned = cityGroupCount[sc2.city.id] || 0;
                    if (c2assigned >= 2) continue;
                    let d2 = Math.hypot(g.cx - sc2.city.lon, g.cy - sc2.city.lat);
                    let s2 = sc2.score - d2 * 3 + gSize * 2;
                    // 更软的柿子：守军少 + 血量低 + 中立城市优先
                    if (sc2.isNeutral) s2 += 200;
                    if (sc2.isReclaim) s2 += 100;
                    let def2 = sc2.defenders || 0;
                    let hpR2 = (sc2.city.hp || 100) / (sc2.city.maxHp || 100);
                    if (def2 <= 1 && hpR2 < 0.5) s2 += 150;
                    if (def2 === 0) s2 += 100;
                    if (s2 > fallbackScore) { fallbackScore = s2; fallbackCity = sc2; }
                }
                if (fallbackCity) {
                    // 用 fallback 替换 bestCity
                    cityGroupCount[bestCity.city.id] = Math.max(0, cityGroupCount[bestCity.city.id] - 1);
                    bestCity = fallbackCity;
                    bestScore = fallbackScore;
                    cityGroupCount[bestCity.city.id] = (cityGroupCount[bestCity.city.id] || 0) + 1;
                    // 重算新目标的守军等
                    defenders = 0;
                    for (let d2 of G.divisions) {
                        if (d2.strength > 0 && d2.country === bestCity.city.owner &&
                            Math.hypot(d2.rx - bestCity.city.lon, d2.ry - bestCity.city.lat) < 1.0) defenders++;
                    }
                    // 中立城市放宽
                    if (bestCity.isNeutral) { minForce = 1; needAdvantage = true; }
                    if (bestCity.isReclaim) { minForce = Math.max(1, Math.ceil(minForce * 0.4)); needAdvantage = true; }
                } else {
                    // 实在没有软柿子：退回防守关键城市而非原地发呆
                    cityGroupCount[bestCity.city.id] = Math.max(0, cityGroupCount[bestCity.city.id] - 1);
                    continue;
                }
            }

            // ===== 4. 根据兵种分配不同角色 =====
            // 组内单位分工：炮兵远程、步兵正面、骑兵侧翼、工兵攻城
            let artilleries = g.units.filter(d => d.type === 'artillery');
            let engineers = g.units.filter(d => d.type === 'engineer');
            let cavalries = g.units.filter(d => d.type === 'cavalry');
            let infantry = g.units.filter(d => d.type === 'infantry' || d.type === 'mountain');

            // 标记该组的目标城市
            let targetCity = bestCity.city;

            // ===== 中立城市：直接占领（跳过攻城阶段，立即冲上去） =====
            if (bestCity.isNeutral && isNeutralCity(targetCity, co)) {
                for (let u of g.units) {
                    if (u.state === 'moving' || u.state === 'retreating') continue;
                    let d = Math.hypot(u.rx - targetCity.lon, u.ry - targetCity.lat);
                    if (d > 0.3) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, targetCity.lon, targetCity.lat);
                        else { u.state = 'moving'; u.targetX = targetCity.lon; u.targetY = targetCity.lat; }
                    }
                    u._aiTask = 'ATTACK'; u._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat }; u._aiTaskAge = 0;
                }
                continue; // 跳过攻城阶段处理
            }

            // ===== 三阶段攻城（方案E）：清野 CLEAR → 围城 SIEGE → 总攻 ASSAULT =====
            // 状态持久化在 G._aiSiege[co][cityId]，城市易主时自动重置
            if (!G._aiSiege) G._aiSiege = {};
            let sieges = G._aiSiege[co] || (G._aiSiege[co] = {});
            let st = sieges[targetCity.id];
            if (!st || st.cityOwner !== targetCity.owner) {
                st = { stage: 'CLEAR', cityOwner: targetCity.owner };
                sieges[targetCity.id] = st;
            }
            // 统计城市周围 0.4° 内的敌我单位（清野目标 / 守军）
            let guardEnemy = null, guardEnemyDist = 999, guardEnemyCount = 0;
            let defendersAround = 0;
            let cityHpRatio = (targetCity.hp || 100) / (targetCity.maxHp || 100);
            for (let e of G.divisions) {
                if (e.strength <= 0) continue;
                let ed = Math.hypot(e.rx - targetCity.lon, e.ry - targetCity.lat);
                if (ed > 0.4) continue;
                if (e.country === targetCity.owner) { defendersAround++; continue; }
                if (e.country === co) continue;
                if (!atWarWithList.includes(e.country)) continue;
                guardEnemyCount++;
                if (ed < guardEnemyDist) { guardEnemyDist = ed; guardEnemy = e; }
            }
            // 阶段转移
            if (cityHpRatio <= 0.1 && defendersAround < 2) {
                st.stage = 'ASSAULT';               // 残血城 + 守军少 → 直接总攻
            } else if (st.stage === 'CLEAR') {
                if (guardEnemyCount <= 2) st.stage = 'SIEGE';   // 周围基本清理干净 → 围城
            } else if (st.stage === 'SIEGE') {
                if (cityHpRatio <= 0.3) st.stage = 'ASSAULT';   // 血量耗尽 → 总攻
                else if (guardEnemyCount > 2) st.stage = 'CLEAR'; // 援军到来 → 退回清野
            } else if (st.stage === 'ASSAULT' && cityHpRatio > 0.3) {
                st.stage = 'SIEGE';                 // 援军稳住局面 → 退回围城
            }

            // ===== 清野阶段：战斗单位集中消灭城市周围敌军，暂不攻城 =====
            // 炮兵不参与清野冲锋——在城外围 1.0° 处远程待命（清野交给步兵/骑兵）
            if (st.stage === 'CLEAR' && guardEnemy) {
                for (let art of artilleries) {
                    if (art.state === 'moving' || art.state === 'retreating') continue;
                    let ad = Math.hypot(art.rx - targetCity.lon, art.ry - targetCity.lat);
                    if (ad < 0.8) {
                        // 太近了，后撤到安全距离
                        let tdx = art.rx - targetCity.lon, tdy = art.ry - targetCity.lat;
                        let td = Math.max(0.01, Math.hypot(tdx, tdy));
                        let tx = art.rx + (tdx / td) * 0.8, ty = art.ry + (tdy / td) * 0.8;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                        else { art.state = 'moving'; art.targetX = tx; art.targetY = ty; }
                    } else {
                        art.focusTarget = guardEnemy.id; // 远程支援清野
                    }
                    art._aiTask = 'ATTACK';
                    art._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    art._aiTaskAge = 0;
                }
                for (let fu of g.units) {
                    if (fu.type === 'engineer' || fu.type === 'artillery' || fu.state === 'moving' || fu.state === 'retreating') continue;
                    // 锁定周围敌军（fireUnits 的 focusTarget 会优先开火）
                    fu.focusTarget = guardEnemy.id;
                    fu.focusCity = null;
                    fu.focusFactory = null;
                    let fd = Math.hypot(fu.rx - guardEnemy.rx, fu.ry - guardEnemy.ry);
                    let fr = (UNIT_TYPES[fu.type] || UNIT_TYPES.infantry).range;
                    if (fd > fr * 0.85) {
                        if (typeof aiMoveToEnemy === 'function') aiMoveToEnemy(fu, guardEnemy);
                        else { fu.state = 'moving'; fu.targetX = guardEnemy.rx; fu.targetY = guardEnemy.ry; }
                    }
                    fu._aiTask = 'ATTACK';
                    fu._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    fu._aiTaskAge = 0;
                }
                // 工兵：清野阶段在城外待命（不参战）
                for (let eng of engineers) {
                    if (eng.state === 'moving' || eng.state === 'retreating') continue;
                    if (Math.hypot(eng.rx - targetCity.lon, eng.ry - targetCity.lat) > 1.0) {
                        let ex = targetCity.lon + 0.5, ey = targetCity.lat + 0.5;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, ex, ey);
                        else { eng.state = 'moving'; eng.targetX = ex; eng.targetY = ey; }
                    }
                    eng._aiTask = 'ATTACK';
                    eng._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    eng._aiTaskAge = 0;
                }
                continue; // 本组进入清野，跳过下面攻城分块
            }

            // 炮兵：保持在射程 85% 处远程轰击（不往前冲）
            for (let art of artilleries) {
                if (art.state === 'moving' || art.state === 'retreating') continue;
                let ut = UNIT_TYPES[art.type] || UNIT_TYPES.infantry;
                let dx = targetCity.lon - art.rx, dy = targetCity.lat - art.ry;
                let dist = Math.hypot(dx, dy);
                // 理想距离：射程的 85%，保证能打到且不被反击
                let desiredDist = ut.range * 0.85;
                if (dist > ut.range) {
                    // 太远了，靠近到理想射程距离
                    let tx = art.rx + (dx / dist) * (dist - desiredDist);
                    let ty = art.ry + (dy / dist) * (dist - desiredDist);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                    else { art.state = "moving"; art.targetX = tx; art.targetY = ty; }
                } else if (dist < ut.range * 0.35) {
                    // 太近了，后撤到安全距离（后撤幅度加大）
                    let tx = art.rx - (dx / dist) * (desiredDist * 0.8);
                    let ty = art.ry - (dy / dist) * (desiredDist * 0.8);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                    else { art.state = "moving"; art.targetX = tx; art.targetY = ty; }
                } else {
                    // 已在合适位置，停止移动专心轰击
                    art.state = 'idle'; art.targetX = null; art.targetY = null;
                    art.focusCity = targetCity.id;
                }
                art._aiTask = 'ATTACK';
                art._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                art._aiTaskAge = 0;
            }

            // 工兵：攻城阶段行为（围城/清野在城外待命，专职修复；总攻才跟进进城）
            for (let eng of engineers) {
                if (eng.state === 'moving' || eng.state === 'retreating') continue;
                let engDist = Math.hypot(eng.rx - targetCity.lon, eng.ry - targetCity.lat);
                if (st.stage === 'ASSAULT') {
                    // 总攻：工兵跟进进城
                    if (engDist > 0.4) {
                        eng.focusCity = targetCity.id;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, targetCity.lon, targetCity.lat);
                        else { eng.state = "moving"; eng.targetX = targetCity.lon; eng.targetY = targetCity.lat; }
                    }
                } else {
                    // 围城：工兵在城外 0.55 距离待命（不冲城送死）
                    if (engDist > 0.7 || engDist < 0.35) {
                        let ex = targetCity.lon + 0.55, ey = targetCity.lat + 0.55;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, ex, ey);
                        else { eng.state = "moving"; eng.targetX = ex; eng.targetY = ey; }
                    }
                }
                eng._aiTask = 'ATTACK';
                eng._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                eng._aiTaskAge = 0;
            }

            // 骑兵：不正面冲城，找敌军残血/炮兵单位绕侧翼收割
            let flankAngle = 0;
            for (let cav of cavalries) {
                if (cav.state === 'moving' || cav.state === 'retreating') continue;
                // 在攻城区域附近找最近的敌方残血/炮兵单位
                let huntTarget = null, huntScore = -9999;
                let huntRange = 2.5;
                for (let e of G.divisions) {
                    if (e.strength <= 0 || e.country === co || !atWarWithList.includes(e.country)) continue;
                    let ed = Math.hypot(cav.rx - e.rx, cav.ry - e.ry);
                    if (ed > huntRange) continue;
                    let hpR = e.strength / (e.maxStrength || 100);
                    let score = -ed + (hpR < 0.5 ? 50 : 0) + (e.type === 'artillery' ? 40 : 0) + (e.type === 'engineer' ? 30 : 0) - (e.type === 'infantry' ? 15 : 0);
                    if (score > huntScore) { huntScore = score; huntTarget = e; }
                }
                if (huntTarget) {
                    let ed = Math.hypot(cav.rx - huntTarget.rx, cav.ry - huntTarget.ry);
                    let cavRange = (UNIT_TYPES.cavalry || { range: 0.12 }).range;
                    if (ed > cavRange * 2) {
                        // 从侧面 45° 靠近，不正面冲
                        let angle = Math.atan2(huntTarget.ry - cav.ry, huntTarget.rx - cav.rx);
                        let side = angle + (Math.PI / 4) * (cavalries.indexOf(cav) % 2 === 0 ? 1 : -1);
                        let tx = huntTarget.rx - Math.cos(side) * cavRange * 1.5;
                        let ty = huntTarget.ry - Math.sin(side) * cavRange * 1.5;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, tx, ty);
                        else { cav.state = "moving"; cav.targetX = tx; cav.targetY = ty; }
                    }
                    cav.focusTarget = huntTarget.id;
                    cav.focusCity = null;
                } else if (cityHpRatio < 0.25) {
                    // 敌方城市快残了才冲城捡人头
                    let dist = Math.hypot(cav.rx - targetCity.lon, cav.ry - targetCity.lat);
                    if (dist > 0.4) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, targetCity.lon, targetCity.lat);
                        else { cav.state = "moving"; cav.targetX = targetCity.lon; cav.targetY = targetCity.lat; }
                    }
                    cav.focusCity = targetCity.id;
                    cav.focusTarget = null;
                } else {
                    // 无残血无快残城 → 骑兵在外围游弋（不冲城）
                    let dist = Math.hypot(cav.rx - targetCity.lon, cav.ry - targetCity.lat);
                    if (dist > 1.5 || dist < 0.6) {
                        let angle = Math.atan2(targetCity.lat - cav.ry, targetCity.lon - cav.rx);
                        let fA = angle + (Math.PI / 4) * (cavalries.indexOf(cav) % 2 === 0 ? 1 : -1);
                        let tx = targetCity.lon - Math.cos(fA) * 0.9;
                        let ty = targetCity.lat - Math.sin(fA) * 0.9;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, tx, ty);
                        else { cav.state = "moving"; cav.targetX = tx; cav.targetY = ty; }
                    }
                }
                cav._aiTask = 'ATTACK';
                cav._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                cav._aiTaskAge = 0;
            }

            // 步兵/山地兵：正面推进，攻击城市和敌方单位
            for (let inf of infantry) {
                if (inf.state === 'moving' || inf.state === 'retreating') continue;
                
                // 检查附近是否有敌方单位需要交战
                let nearEnemy = null, nearDist = 999;
                for (let e of G.divisions) {
                    if (e.country === co || e.strength <= 0) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    let d = Math.hypot(inf.rx - e.rx, inf.ry - e.ry);
                    if (d < 3.0 && d < nearDist) { nearEnemy = e; nearDist = d; }
                }

                let engaged = false;
                if (nearEnemy && nearDist < 1.5) {
                    // 近距离交战——但禁止被敌人"钓"离目标城市太远（>3° 放弃追击回阵地）
                    // 以及同一目标交战超过 40 tick 无进展 → 停止缠斗继续城市任务（防僵持卡死）
                    let distToCity = Math.hypot(inf.rx - targetCity.lon, inf.ry - targetCity.lat);
                    if (inf._aiCombatId !== nearEnemy.id) { inf._aiCombatId = nearEnemy.id; inf._aiCombatAge = 0; }
                    else inf._aiCombatAge = (inf._aiCombatAge || 0) + 1;
                    if (distToCity < 3.0 && inf._aiCombatAge <= 40) {
                        engaged = true;
                        let ut = UNIT_TYPES[inf.type] || UNIT_TYPES.infantry;
                        let dx = nearEnemy.rx - inf.rx, dy = nearEnemy.ry - inf.ry;
                        let dist = Math.hypot(dx, dy);
                        let desiredDist = Math.max(ut.range * 0.8, 0.3);
                        if (dist > desiredDist) {
                            let tx = inf.rx + (dx / dist) * (dist - desiredDist);
                            let ty = inf.ry + (dy / dist) * (dist - desiredDist);
                            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(inf, tx, ty);
                            else { inf.state = "moving"; inf.targetX = tx; inf.targetY = ty; }
                        }
                    } else {
                        inf._aiCombatId = null; inf._aiCombatAge = 0;
                    }
                }
                if (!engaged) {
                    // 向目标城市推进：围城→包围圈站定（包而不进），总攻→收紧包围冲城
                    inf.focusCity = targetCity.id;
                    let dist = Math.hypot(inf.rx - targetCity.lon, inf.ry - targetCity.lat);
                    // 多个单位向同一个目标前进，但稍微分散以免重叠
                    let offset = (st.stage === 'ASSAULT') ? 0.15 : 0.35;
                    let idx = infantry.indexOf(inf);
                    let angle = (idx / infantry.length) * Math.PI * 2;
                    let tx = targetCity.lon + Math.cos(angle) * offset;
                    let ty = targetCity.lat + Math.sin(angle) * offset;
                    let minDist = (st.stage === 'ASSAULT') ? 0.2 : offset;
                    if (dist > minDist) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(inf, tx, ty);
                        else { inf.state = "moving"; inf.targetX = tx; inf.targetY = ty; }
                    }
                }
                inf._aiTask = 'ATTACK';
                inf._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                inf._aiTaskAge = 0;
            }
        }

        // ===== 4.5 独立中立城市占领（修复#5：派离中立城最近的兵去占，任务单位也可抽调） =====
        // 关键：只调"离得最近的兵"——哪怕是正在进攻/防守的单位，占中立城收益更高
        // 但绝不抽调正在激烈交战的单位（敌人<0.8° 内的），也不调火炮（炮不冲锋）
        let neutralToTake = neutralCities.filter(nc => {
            let taken = cityGroupCount[nc.city.id] || 0;
            return taken < 2; // 最多2组去占
        });
        for (let nc of neutralToTake) {
            // 就近找步兵/山地/骑兵/工兵：优先空闲单位；任务单位只在无人可用时才抽调
            // 半径 5°（只派离中立城近的兵，不让主力绕远路）
            let occUnits = G.divisions.filter(d =>
                d.country === co && d.strength > 0 &&
                d.type !== 'artillery' && d.type !== 'navy' && d.type !== 'submarine' &&
                d.state !== 'retreating' &&
                !d.armyGroupId && // 不抽调集团军成员（主力不打散）
                Math.hypot(d.rx - nc.city.lon, d.ry - nc.city.lat) < 5.0
            ).sort((a, b) => {
                let ai = a._aiTask ? 1000 : 0, bi = b._aiTask ? 1000 : 0;
                return (ai - bi) || (Math.hypot(a.rx - nc.city.lon, a.ry - nc.city.lat) - Math.hypot(b.rx - nc.city.lon, b.ry - nc.city.lat));
            });
            // 过滤掉正在近身交战的单位（敌人<0.8°，抽调会送死）
            occUnits = occUnits.filter(u => {
                for (let e of G.divisions) {
                    if (e.strength > 0 && atWarWithList.includes(e.country) && Math.hypot(u.rx - e.rx, u.ry - e.ry) < 0.8) return false;
                }
                return true;
            });
            if (occUnits.length === 0) continue;
            // 只派 1 个兵去占（中立城无守军，1 个足够；除非附近有敌军才派 2 个）
            let need = 1;
            for (let d of G.divisions) {
                if (d.strength > 0 && atWarWithList.includes(d.country) && Math.hypot(d.rx - nc.city.lon, d.ry - nc.city.lat) < 1.5) { need = 2; break; }
            }
            let sent = 0;
            for (let u of occUnits) {
                if (sent >= need) break;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, nc.city.lon, nc.city.lat);
                else { u.state = 'moving'; u.targetX = nc.city.lon; u.targetY = nc.city.lat; }
                u._aiTask = 'ATTACK';
                u._aiTaskTarget = { lon: nc.city.lon, lat: nc.city.lat };
                u._aiTaskAge = 0;
                sent++;
            }
            cityGroupCount[nc.city.id] = (cityGroupCount[nc.city.id] || 0) + 1;
        }

        // ===== 5. 处理未分组的单位（空闲且无任务） =====
        // 让无任务的空闲单位向高优先级目标城市集结（自然汇聚形成集团军）
        // 火炮除外：火炮不参与单兵集结（避免无意义冲锋），必须等集团军/步兵组一起行动
        let idleWithoutTask = G.divisions.filter(d => 
            d.country === co && d.strength > 0 && 
            !d._aiTask && d.state !== 'moving' && d.state !== 'retreating' &&
            d.type !== 'navy' && d.type !== 'submarine' &&
            d.type !== 'artillery' // 火炮不单兵冲锋
        );
        if (idleWithoutTask.length > 0 && scoredCities.length > 0) {
            // 找最高优先级目标城市
            let topTarget = scoredCities[0];
            // 集结半径：距离目标城市3-5度
            let gatherRadius = 3.0 + Math.random() * 2.0;
            for (let idle of idleWithoutTask) {
                if (idle._aiTask) continue;
                let distToTarget = Math.hypot(idle.rx - topTarget.city.lon, idle.ry - topTarget.city.lat);
                // 如果单位在目标城市附近（5-15度），向目标城市移动集结
                if (distToTarget > gatherRadius && distToTarget < 15.0) {
                    // 向目标城市方向移动，但停在集结半径处（不直接冲上去）
                    let dx = topTarget.city.lon - idle.rx, dy = topTarget.city.lat - idle.ry;
                    let d = Math.hypot(dx, dy);
                    let tx = idle.rx + (dx / d) * (d - gatherRadius);
                    let ty = idle.ry + (dy / d) * (d - gatherRadius);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(idle, tx, ty);
                    else { idle.state = "moving"; idle.targetX = tx; idle.targetY = ty; }
                    // 不给ATTACK任务标记，让后续aiAttackMovement重新分组
                }
            }
        }
        
        // ===== 6. 处理防御模式（丢失城市>30%）=====
        if (cityLossCache[co] > 0.3) {
            let defensiveMode = true;
            let myProvinceCenters = myProvCenters;
            // 己方领土内的敌人，优先清除
            for (let d of G.divisions) {
                if (d.country !== co || d.strength <= 0 || d.state === 'moving' || d.state === 'retreating') continue;
                let enemiesInTerritory = [];
                for (let e of G.divisions) {
                    if (e.country === co || e.strength <= 0) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    let isInMyLand = myProvinceCenters.some(ctr => Math.hypot(ctr[0] - e.rx, ctr[1] - e.ry) < 1.5);
                    if (isInMyLand) enemiesInTerritory.push(e);
                }
                if (enemiesInTerritory.length > 0 && d.type !== 'artillery') {
                    // 找最近的领土内敌人
                    let nearest = null, nearDist = 999;
                    for (let e of enemiesInTerritory) {
                        let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
                        if (dist < nearDist) { nearDist = dist; nearest = e; }
                    }
                    if (nearest && nearDist < 8) {
                        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                        let dx = nearest.rx - d.rx, dy = nearest.ry - d.ry;
                        let dist = Math.hypot(dx, dy);
                        let desiredDist = Math.max(ut.range * 0.8, 0.3);
                        if (dist > desiredDist) {
                            let tx = d.rx + (dx / dist) * (dist - desiredDist);
                            let ty = d.ry + (dy / dist) * (dist - desiredDist);
                            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                            else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
                        }
                    }
                }
            }
        }
    }
}

// ===== 和平时期边境部署 =====
// ===== 攻城持续行为（修复：单位到达城市后不再"清任务→重分配"死循环） =====
// 组分配只负责"选目标+初次就位"；本函数每帧驱动围攻单位的持续行为：
// 阶段转移（CLEAR→SIEGE→ASSAULT）+ 炮兵保持射程 + 步兵围城 + 骑兵侧翼 + 工兵待命
// 这样单位到达城下后稳定执行攻城，不会因为任务被清除而原地打转
function aiSiegeBehavior(allCountries) {
    if (!G._aiSiege) return;
    for (let co of allCountries) {
        let sieges = G._aiSiege[co];
        if (!sieges) continue;
        let atWarWithList = getEnemiesOf(co);
        if (atWarWithList.length === 0) continue;
        for (let cityId in sieges) {
            let st = sieges[cityId];
            let targetCity = G.cities[cityId];
            if (!targetCity || targetCity.hp <= 0) { delete sieges[cityId]; continue; }
            // 城市已易主/已属己方 → 攻城结束，清除记录
            if (targetCity.owner === co || st.cityOwner !== targetCity.owner) { delete sieges[cityId]; continue; }

            // 围攻计时：同一城久攻不下（150 tick 且血量无明显下降）→ 放弃围攻换目标
            // 防止战线僵持：全部兵力围着一个打不动的城，其他地方都停摆
            st.siegeTicks = (st.siegeTicks || 0) + 1;
            let hpNow = (targetCity.hp || 100) / (targetCity.maxHp || 100);
            if (st.siegeTicks > 150 && hpNow > 0.6 && st.siegeTicks % 10 === 0) {
                // 释放围攻：清除该城附近所有己方单位的围攻任务，让组分配重选软柿子
                for (let d of G.divisions) {
                    if (d.country === co && d.strength > 0 && d._aiTask === 'ATTACK' && d._aiTaskTarget) {
                        let dd = Math.hypot(d.rx - targetCity.lon, d.ry - targetCity.lat);
                        if (dd < 3.0) { d._aiTask = null; d._aiTaskTarget = null; d._aiTaskAge = 0; }
                    }
                }
                st.siegeTicks = 0;
                continue;
            }

            // 找该城市 3° 内的己方作战单位（不限任务——围攻中的单位持续被驱动）
            let myUnitsHere = G.divisions.filter(d =>
                d.country === co && d.strength > 0 &&
                d.type !== 'navy' && d.type !== 'submarine' &&
                d.state !== 'retreating' &&
                Math.hypot(d.rx - targetCity.lon, d.ry - targetCity.lat) < 3.0
            );
            if (myUnitsHere.length === 0) continue;

            let artilleries = myUnitsHere.filter(d => d.type === 'artillery');
            let engineers = myUnitsHere.filter(d => d.type === 'engineer');
            let cavalries = myUnitsHere.filter(d => d.type === 'cavalry');
            let infantry = myUnitsHere.filter(d => d.type === 'infantry' || d.type === 'mountain');

            // 统计城市周围 0.4° 内的敌我单位
            let guardEnemy = null, guardEnemyDist = 999, guardEnemyCount = 0;
            let defendersAround = 0;
            let cityHpRatio = (targetCity.hp || 100) / (targetCity.maxHp || 100);
            for (let e of G.divisions) {
                if (e.strength <= 0) continue;
                let ed = Math.hypot(e.rx - targetCity.lon, e.ry - targetCity.lat);
                if (ed > 0.4) continue;
                if (e.country === targetCity.owner) { defendersAround++; continue; }
                if (e.country === co) continue;
                if (!atWarWithList.includes(e.country)) continue;
                guardEnemyCount++;
                if (ed < guardEnemyDist) { guardEnemyDist = ed; guardEnemy = e; }
            }
            // 阶段转移
            // 1. 城几乎被攻破（血<10%）且守军极少 → 直接总攻
            if (cityHpRatio <= 0.1 && defendersAround < 2) {
                st.stage = 'ASSAULT';
            }
            // 2. 守军很少（<3）→ 兵力足够直接上（不等血掉），跳过集结直接 ASSAULT
            else if (defendersAround < 3 && st.stage !== 'ASSAULT') {
                st.stage = 'ASSAULT';
            }
            // 3. CLEAR 完成：周围敌军基本清完 → 转 GATHER（集结等火炮）
            else if (st.stage === 'CLEAR') {
                if (guardEnemyCount <= 2) st.stage = 'GATHER';
            }
            // 4. GATHER：等己方兵力集结+火炮到位 → 转 SIEGE（不开眼攻城）
            // 超时保护：等 60 tick 火炮仍不到位（如西线无炮）→ 步兵直接攻城，不无限等
            else if (st.stage === 'GATHER') {
                st.gatherTicks = (st.gatherTicks || 0) + 1;
                let myCount = myUnitsHere.length;
                let artilleryReady = artilleries.filter(a => Math.hypot(a.rx - targetCity.lon, a.ry - targetCity.lat) < 0.8).length;
                if (myCount >= 3 && (artilleryReady >= Math.max(1, Math.ceil(myCount * 0.15)) || st.gatherTicks > 60)) {
                    st.stage = 'SIEGE';
                } else if (guardEnemyCount > 3) {
                    st.stage = 'CLEAR'; // 援军到 → 退回清野
                }
            }
            // 5. SIEGE：城市血量低 或 兵力占绝对优势 → 总攻；援军到 → 退回 GATHER
            else if (st.stage === 'SIEGE') {
                if (cityHpRatio <= 0.3) st.stage = 'ASSAULT';
                else if (myUnitsHere.length >= Math.max(5, defendersAround * 2)) st.stage = 'ASSAULT'; // 兵力 2 倍于守军
                else if (guardEnemyCount > 3) st.stage = 'GATHER';
            }
            else if (st.stage === 'ASSAULT' && cityHpRatio > 0.3 && defendersAround >= 3) {
                st.stage = 'GATHER'; // 总攻失败（血又回升/守军增）退回集结
            }

            // ===== 清野阶段：战斗单位集中消灭城市周围敌军 =====
            if (st.stage === 'CLEAR' && guardEnemy) {
                for (let art of artilleries) {
                    if (art.state === 'moving' || art.state === 'retreating') continue;
                    let ad = Math.hypot(art.rx - targetCity.lon, art.ry - targetCity.lat);
                    if (ad < 0.8) {
                        let tdx = art.rx - targetCity.lon, tdy = art.ry - targetCity.lat;
                        let td = Math.max(0.01, Math.hypot(tdx, tdy));
                        let tx = art.rx + (tdx / td) * 0.8, ty = art.ry + (tdy / td) * 0.8;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                        else { art.state = 'moving'; art.targetX = tx; art.targetY = ty; }
                    } else {
                        art.focusTarget = guardEnemy.id;
                    }
                    art._aiTask = 'ATTACK';
                    art._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    art._aiTaskAge = 0;
                }
                for (let fu of myUnitsHere) {
                    if (fu.type === 'engineer' || fu.type === 'artillery' || fu.state === 'moving' || fu.state === 'retreating') continue;
                    fu.focusTarget = guardEnemy.id;
                    fu.focusCity = null;
                    fu.focusFactory = null;
                    let fd = Math.hypot(fu.rx - guardEnemy.rx, fu.ry - guardEnemy.ry);
                    let fr = (UNIT_TYPES[fu.type] || UNIT_TYPES.infantry).range;
                    if (fd > fr * 0.85) {
                        if (typeof aiMoveToEnemy === 'function') aiMoveToEnemy(fu, guardEnemy);
                        else { fu.state = 'moving'; fu.targetX = guardEnemy.rx; fu.targetY = guardEnemy.ry; }
                    }
                    fu._aiTask = 'ATTACK';
                    fu._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    fu._aiTaskAge = 0;
                }
                for (let eng of engineers) {
                    if (eng.state === 'moving' || eng.state === 'retreating') continue;
                    if (Math.hypot(eng.rx - targetCity.lon, eng.ry - targetCity.lat) > 1.0) {
                        let ex = targetCity.lon + 0.5, ey = targetCity.lat + 0.5;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, ex, ey);
                        else { eng.state = 'moving'; eng.targetX = ex; eng.targetY = ey; }
                    }
                    eng._aiTask = 'ATTACK';
                    eng._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                    eng._aiTaskAge = 0;
                }
                continue;
            }

            // ===== 炮兵：保持在射程 85% 处远程轰击（协同作战，不单兵冲锋） =====
            for (let art of artilleries) {
                if (art.state === 'moving' || art.state === 'retreating') continue;
                let ut = UNIT_TYPES[art.type] || UNIT_TYPES.infantry;
                let dx = targetCity.lon - art.rx, dy = targetCity.lat - art.ry;
                let dist = Math.hypot(dx, dy);
                let desiredDist = ut.range * 0.85;
                if (dist > ut.range) {
                    let tx = art.rx + (dx / dist) * (dist - desiredDist);
                    let ty = art.ry + (dy / dist) * (dist - desiredDist);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                    else { art.state = "moving"; art.targetX = tx; art.targetY = ty; }
                } else if (dist < ut.range * 0.35) {
                    let tx = art.rx - (dx / dist) * (desiredDist * 0.8);
                    let ty = art.ry - (dy / dist) * (desiredDist * 0.8);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(art, tx, ty);
                    else { art.state = "moving"; art.targetX = tx; art.targetY = ty; }
                } else {
                    art.state = 'idle'; art.targetX = null; art.targetY = null;
                    art.focusCity = targetCity.id;
                }
                art._aiTask = 'ATTACK';
                art._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                art._aiTaskAge = 0;
            }

            // ===== 工兵：围城在城外待命，总攻才跟进 =====
            for (let eng of engineers) {
                if (eng.state === 'moving' || eng.state === 'retreating') continue;
                let engDist = Math.hypot(eng.rx - targetCity.lon, eng.ry - targetCity.lat);
                if (st.stage === 'ASSAULT') {
                    if (engDist > 0.4) {
                        eng.focusCity = targetCity.id;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, targetCity.lon, targetCity.lat);
                        else { eng.state = "moving"; eng.targetX = targetCity.lon; eng.targetY = targetCity.lat; }
                    }
                } else {
                    if (engDist > 0.7 || engDist < 0.35) {
                        let ex = targetCity.lon + 0.55, ey = targetCity.lat + 0.55;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(eng, ex, ey);
                        else { eng.state = "moving"; eng.targetX = ex; eng.targetY = ey; }
                    }
                }
                eng._aiTask = 'ATTACK';
                eng._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                eng._aiTaskAge = 0;
            }

            // ===== 骑兵：不正面冲城，找残血/炮兵绕侧翼收割；城快残才冲城 =====
            for (let ci = 0; ci < cavalries.length; ci++) {
                let cav = cavalries[ci];
                if (cav.state === 'moving' || cav.state === 'retreating') continue;
                let huntTarget = null, huntScore = -9999;
                let huntRange = 2.5;
                for (let e of G.divisions) {
                    if (e.strength <= 0 || e.country === co || !atWarWithList.includes(e.country)) continue;
                    let ed = Math.hypot(cav.rx - e.rx, cav.ry - e.ry);
                    if (ed > huntRange) continue;
                    let hpR = e.strength / (e.maxStrength || 100);
                    let score = -ed + (hpR < 0.5 ? 50 : 0) + (e.type === 'artillery' ? 40 : 0) + (e.type === 'engineer' ? 30 : 0) - (e.type === 'infantry' ? 15 : 0);
                    if (score > huntScore) { huntScore = score; huntTarget = e; }
                }
                if (huntTarget) {
                    let ed = Math.hypot(cav.rx - huntTarget.rx, cav.ry - huntTarget.ry);
                    let cavRange = (UNIT_TYPES.cavalry || { range: 0.12 }).range;
                    if (ed > cavRange * 2) {
                        let angle = Math.atan2(huntTarget.ry - cav.ry, huntTarget.rx - cav.rx);
                        let side = angle + (Math.PI / 4) * (ci % 2 === 0 ? 1 : -1);
                        let tx = huntTarget.rx - Math.cos(side) * cavRange * 1.5;
                        let ty = huntTarget.ry - Math.sin(side) * cavRange * 1.5;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, tx, ty);
                        else { cav.state = "moving"; cav.targetX = tx; cav.targetY = ty; }
                    }
                    cav.focusTarget = huntTarget.id;
                    cav.focusCity = null;
                } else if (cityHpRatio < 0.25) {
                    let dist = Math.hypot(cav.rx - targetCity.lon, cav.ry - targetCity.lat);
                    if (dist > 0.4) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, targetCity.lon, targetCity.lat);
                        else { cav.state = "moving"; cav.targetX = targetCity.lon; cav.targetY = targetCity.lat; }
                    }
                    cav.focusCity = targetCity.id;
                    cav.focusTarget = null;
                } else {
                    let dist = Math.hypot(cav.rx - targetCity.lon, cav.ry - targetCity.lat);
                    if (dist > 1.5 || dist < 0.6) {
                        let angle = Math.atan2(targetCity.lat - cav.ry, targetCity.lon - cav.rx);
                        let fA = angle + (Math.PI / 4) * (ci % 2 === 0 ? 1 : -1);
                        let tx = targetCity.lon - Math.cos(fA) * 0.9;
                        let ty = targetCity.lat - Math.sin(fA) * 0.9;
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(cav, tx, ty);
                        else { cav.state = "moving"; cav.targetX = tx; cav.targetY = ty; }
                    }
                }
                cav._aiTask = 'ATTACK';
                cav._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                cav._aiTaskAge = 0;
            }

            // ===== 步兵/山地兵：正面围城，总攻收紧（防被敌军钓走+交战超时） =====
            for (let ii = 0; ii < infantry.length; ii++) {
                let inf = infantry[ii];
                if (inf.state === 'moving' || inf.state === 'retreating') continue;
                let nearEnemy = null, nearDist = 999;
                for (let e of G.divisions) {
                    if (e.country === co || e.strength <= 0) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    let d = Math.hypot(inf.rx - e.rx, inf.ry - e.ry);
                    if (d < 3.0 && d < nearDist) { nearEnemy = e; nearDist = d; }
                }
                let engaged2 = false;
                if (nearEnemy && nearDist < 1.5) {
                    // 只追目标城市 3° 内的敌人；同一目标交战超 40 tick 放弃缠斗（防僵持卡死）
                    let distToCity = Math.hypot(inf.rx - targetCity.lon, inf.ry - targetCity.lat);
                    if (inf._aiCombatId !== nearEnemy.id) { inf._aiCombatId = nearEnemy.id; inf._aiCombatAge = 0; }
                    else inf._aiCombatAge = (inf._aiCombatAge || 0) + 1;
                    if (distToCity < 3.0 && inf._aiCombatAge <= 40) {
                        engaged2 = true;
                        let ut = UNIT_TYPES[inf.type] || UNIT_TYPES.infantry;
                        let dx = nearEnemy.rx - inf.rx, dy = nearEnemy.ry - inf.ry;
                        let dist = Math.hypot(dx, dy);
                        let desiredDist = Math.max(ut.range * 0.8, 0.3);
                        if (dist > desiredDist) {
                            let tx = inf.rx + (dx / dist) * (dist - desiredDist);
                            let ty = inf.ry + (dy / dist) * (dist - desiredDist);
                            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(inf, tx, ty);
                            else { inf.state = "moving"; inf.targetX = tx; inf.targetY = ty; }
                        }
                    } else {
                        inf._aiCombatId = null; inf._aiCombatAge = 0;
                    }
                }
                if (!engaged2) {
                    let distToCity = Math.hypot(inf.rx - targetCity.lon, inf.ry - targetCity.lat);
                    // 围城站位：GATHER=0.7°（城火外远集结，等火炮到位），SIEGE=0.5°（围住城火外），ASSAULT=0.15°（冲城）
                    // ——避免"排队送命"：城火范围仅 0.30°，GATHER/SIEGE 都在城火外安全站位
                    let offset = 0.7;
                    if (st.stage === 'SIEGE') offset = 0.5;
                    else if (st.stage === 'ASSAULT') offset = 0.15;
                    let angle = (ii / infantry.length) * Math.PI * 2;
                    let tx = targetCity.lon + Math.cos(angle) * offset;
                    let ty = targetCity.lat + Math.sin(angle) * offset;
                    // 仅当偏离围城位置 0.15° 以上才移动（避免抖动）
                    if (Math.abs(distToCity - offset) > 0.15) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(inf, tx, ty);
                        else { inf.state = "moving"; inf.targetX = tx; inf.targetY = ty; }
                    }
                    // ASSAULT 阶段才攻击城市（focusCity）；GATHER/SIEGE 阶段不开眼（等火炮削城防）
                    if (st.stage === 'ASSAULT') {
                        inf.focusCity = targetCity.id;
                        inf.focusTarget = null;
                    } else {
                        inf.focusCity = null;
                        inf.focusTarget = null;
                    }
                }
                inf._aiTask = 'ATTACK';
                inf._aiTaskTarget = { lon: targetCity.lon, lat: targetCity.lat };
                inf._aiTaskAge = 0;
            }
        }
    }
}

function aiPeaceTimeDeployment(co) {
    let myUnits = G.divisions.filter(d => 
        d.country === co && d.strength > 0 && 
        d.state !== 'retreating' &&
        d.type !== 'navy' && d.type !== 'submarine'
    );
    if (myUnits.length < 1) return;

    // 识别即将交战国（好感< -30）+ 历史敌对
    let imminentEnemies = [];
    let potentialEnemies = [];
    for (let other of Object.keys(G.countries)) {
        if (other === co) continue;
        let rel = (G.relations[co] && G.relations[co][other]) || 0;
        if (rel < -30) imminentEnemies.push(other);
    }
    let historicalRivals = {
        'GERMANY': ['FRANCE', 'RUSSIA'], 'FRANCE': ['GERMANY'],
        'UK': ['GERMANY'], 'RUSSIA': ['GERMANY', 'AUSTRIA_HUNGARY'],
        'AUSTRIA_HUNGARY': ['RUSSIA', 'SERBIA'], 'ITALY': ['AUSTRIA_HUNGARY'],
        'SERBIA': ['AUSTRIA_HUNGARY'], 'TURKEY': ['RUSSIA'],
        'BULGARIA': ['SERBIA'], 'ROMANIA': ['BULGARIA'],
    };
    let rivals = historicalRivals[co] || [];
    let myProvs = getCountryProvinces ? getCountryProvinces(co) : [];

    // 即将交战优先级最高
    let targetEnemies = imminentEnemies.length > 0 ? imminentEnemies : rivals;
    // 补充邻国
    for (let pid in G.provinceData) {
        let np = G.provinceData[pid];
        if (!np || np.country === co || !np.center) continue;
        for (let mp of myProvs) {
            if (!mp.center) continue;
            if (Math.hypot(np.center[0] - mp.center[0], np.center[1] - mp.center[1]) < 2.0) {
                if (!targetEnemies.includes(np.country)) targetEnemies.push(np.country);
                break;
            }
        }
    }
    if (targetEnemies.length === 0) return;

    // 找到面向敌国的边境城市（比省份中心更精准，城市有补给）
    let borderCities = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.owner !== co || ct.hp <= 0) continue;
        for (let ec of targetEnemies) {
            let enemyProvs = getCountryProvinces ? getCountryProvinces(ec) : [];
            for (let ep of enemyProvs) {
                if (!ep.center) continue;
                if (Math.hypot(ct.lon - ep.center[0], ct.lat - ep.center[1]) < 3.0) {
                    borderCities.push(ct);
                    break;
                }
            }
            if (borderCities.includes(ct)) break;
        }
    }
    if (borderCities.length === 0) return;

    // 将部队部署到边境城市（按区域分组后分配到最近边境城市）
    let groups = [];
    let assigned = new Set();
    for (let d of myUnits) {
        if (assigned.has(d.id)) continue;
        let group = { units: [d], cx: d.rx, cy: d.ry };
        assigned.add(d.id);
        for (let other of myUnits) {
            if (assigned.has(other.id)) continue;
            if (Math.hypot(d.rx - other.rx, d.ry - other.ry) < 3.0) {
                group.units.push(other);
                assigned.add(other.id);
            }
        }
        groups.push(group);
    }
    groups.sort((a, b) => b.units.length - a.units.length);

    let bcAssigned = new Set();
    for (let g of groups) {
        if (bcAssigned.size >= borderCities.length) bcAssigned.clear(); // 一轮分配完则重新开始
        let bestBC = null, bestDist = 999;
        for (let bc of borderCities) {
            if (bcAssigned.has(bc.id)) continue;
            let dist = Math.hypot(g.cx - bc.lon, g.cy - bc.lat);
            if (dist < bestDist) { bestDist = dist; bestBC = bc; }
        }
        if (!bestBC) break;
        bcAssigned.add(bestBC.id);
        
        for (let d of g.units) {
            if (d.state === 'moving' && d._finalTargetX !== undefined) continue;
            let dist = Math.hypot(d.rx - bestBC.lon, d.ry - bestBC.lat);
            if (dist > 0.3) {
                let tx = bestBC.lon + (Math.random() - 0.5) * 0.15;
                let ty = bestBC.lat + (Math.random() - 0.5) * 0.15;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
                // 和平时期不打ATTACK标记，但记录为"正在部署"
                d._aiTaskTarget = { lon: tx, lat: ty };
            }
        }
    }
}

// ========== 6. 求和 ==========
function aiPeaceSeeking(allCountries) {
    for (let co of allCountries) {
        if (!isCountryAtWar(co)) continue;
        if (G.surrendered[co]) continue;
        let cd = G.countries[co];
        let enemies = getEnemiesOf(co);
        let isGP = isGreatPower(co);
        for (let enemy of enemies) {
            let wsDiff = getWarScoreDiff(co, enemy);
            let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
            let warDur = typeof getWarDuration === 'function' ? getWarDuration(co) : 0;

            if (!isGP && wsDiff < -50 && myCount < 5 && Math.random() < 0.15) {
                let reparations = Math.min(Math.floor(Math.abs(wsDiff) * 1.5), Math.floor((cd?.treasury || 0) * 0.5));
                makePeace(co, enemy, reparations);
                addGameLog((COUNTRY_CN[co] || co) + "因战况不利向" + (COUNTRY_CN[enemy] || enemy) + "求和并支付赔款");
            }

            if (isGP && wsDiff < -80 && myCount < 3 && Math.random() < 0.1) {
                let reparations = Math.min(Math.floor(Math.abs(wsDiff) * 1.0), Math.floor((cd?.treasury || 0) * 0.3));
                makePeace(co, enemy, reparations);
                addGameLog((COUNTRY_CN[co] || co) + "因战况极度不利向" + (COUNTRY_CN[enemy] || enemy) + "求和");
            }
            if (isGP && warDur > 365 && wsDiff < -30 && myCount < Math.max(10, Math.ceil((cd?.divCount || myCount) * 0.3)) && Math.random() < 0.05) {
                let reparations = Math.min(Math.floor(Math.abs(wsDiff) * 0.8), Math.floor((cd?.treasury || 0) * 0.2));
                makePeace(co, enemy, reparations);
                addGameLog((COUNTRY_CN[co] || co) + "因长期战争向" + (COUNTRY_CN[enemy] || enemy) + "求和");
            }
        }
    }
}

// ===== 占领无防御省份 =====
// 索引化：敌方师按省份分组、每国交战集合一次构建，去掉原 O(P²)+O(候选×师) 扫描
function updateAIOccupation() {
    let humanCountries = G.multiplayerHumanCountries && G.multiplayerHumanCountries.length > 0 ? G.multiplayerHumanCountries : (G.playerCountry ? [G.playerCountry] : []);
    let allCountries = Object.keys(G.countries).filter(c =>
        !humanCountries.includes(c) &&
        G.countries[c].treasury !== undefined && !G.surrendered[c]
    );

    // 省份 → 其中的单位列表（供 enemyPresent 快速判断）
    let divsByProv = null;
    function _provDivs(pid) {
        if (!divsByProv) {
            divsByProv = new Map();
            for (let d of G.divisions) {
                if (!d || d.strength <= 0 || !d.province) continue;
                let arr = divsByProv.get(d.province);
                if (!arr) { arr = []; divsByProv.set(d.province, arr); }
                arr.push(d);
            }
        }
        return divsByProv.get(pid);
    }

    for (let co of allCountries) {
        let idleUnits = G.divisions.filter(d =>
            d.country === co && d.strength > 0 &&
            d.state !== 'moving' &&
            !G.patrolTargets[d.id]
        );
        if (idleUnits.length < 2) continue;

        let ownedProvIds = [];
        for (let pid in G.provinceData) {
            let p = G.provinceData[pid];
            if (p.country === co && p.center) ownedProvIds.push(p.id);
        }

        // 与 co 交战的国家集合（一次性构建；含交战但场上暂无部队的国家，与原逐省 isAtWarWith 语义一致）
        let enemySet = new Set();
        for (let cc in G.countries) {
            if (cc === co) continue;
            if (isAtWarWith(co, cc)) enemySet.add(cc);
        }
        // co 的移动中单位（惰性构建，供 alreadyGoing 判断）
        let movingUnits = null;

        let targetable = [];
        let seenTargetable = new Set();
        for (let pid of ownedProvIds) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center) continue;
            for (let npid in G.provinceData) {
                let np = G.provinceData[npid];
                if (!np || np.country === co || !np.center) continue;
                if (seenTargetable.has(npid)) continue;
                if (!enemySet.has(np.country)) continue;
                let d0 = np.center[0] - pd.center[0], d1 = np.center[1] - pd.center[1];
                if (d0 * d0 + d1 * d1 >= 9) continue;
                let edivs = _provDivs(npid);
                let enemyPresent = edivs ? edivs.some(d => enemySet.has(d.country)) : false;
                if (enemyPresent) continue;
                if (!movingUnits) {
                    movingUnits = [];
                    for (let d of G.divisions) {
                        if (d.country === co && d.state === 'moving' && d.targetX !== null && d.targetY !== null) movingUnits.push(d);
                    }
                }
                let alreadyGoing = false;
                for (let m of movingUnits) {
                    let mx = m.targetX - np.center[0], my = m.targetY - np.center[1];
                    if (mx * mx + my * my < 0.09) { alreadyGoing = true; break; }
                }
                if (!alreadyGoing) {
                    seenTargetable.add(npid);
                    targetable.push({ id: npid, dist: Math.hypot(np.center[0] - pd.center[0], np.center[1] - pd.center[1]) });
                }
            }
        }

        targetable.sort((a, b) => a.dist - b.dist);

        let unitsUsed = 0;
        for (let target of targetable) {
            if (unitsUsed >= idleUnits.length) break;
            let targetPd = G.provinceData[target.id];
            if (!targetPd || !targetPd.center) continue;

            let unitIdx = idleUnits.findIndex(d =>
                !d.moving && d.state !== 'moving' && !G.patrolTargets[d.id]
            );
            if (unitIdx < 0) break;

            let unit = idleUnits[unitIdx];
            if (typeof aiMoveToTarget === 'function') {
                aiMoveToTarget(unit, targetPd.center[0], targetPd.center[1]);
            } else {
                unit.state = 'moving';
                unit.targetX = targetPd.center[0];
                unit.targetY = targetPd.center[1];
            }
            G.patrolTargets[unit.id] = [target.id];

            idleUnits.splice(unitIdx, 1);
            unitsUsed++;
        }
    }
}

// ========== 修复：战略态势评估（不过度恐慌） ==========
function evaluateStrategicSituation(country) {
    if (!G._aiSituation) G._aiSituation = {};
    let atWar = isCountryAtWar(country);
    let threatInfo = typeof calculateThreatLevel === 'function' ? calculateThreatLevel(country) : null;
    if (!threatInfo) return;
    
    let sit = {
        myDivCount: threatInfo.myDivs || 0,
        enemyDivCount: threatInfo.enemyDivs || 0,
        capitalThreat: threatInfo.capitalThreat || 0,
        totalLossRatio: threatInfo.totalLossRatio || 0,
        forceRatio: threatInfo.forceRatio || 1.0,
        frontlineStability: threatInfo.frontlineStability || 0,
        capitalEnemyDist: threatInfo.capitalEnemyDist || 999,
        capitalEnemyCount: threatInfo.capitalEnemyCount || 0,
        emergencyLevel: threatInfo.emergencyLevel || 0,
    };
    
    // 降低紧急等级：只有真正严重时才触发高级别
    // 原代码中紧急等级由calculateCapitalRisk计算，阈值偏激
    // 这里重新评估：如果不在战争中，降低紧急等级
    if (!atWar) {
        sit.emergencyLevel = Math.min(sit.emergencyLevel, 1); // 和平时期最多1级
    }
    
    // 推荐策略
    let newStrategy = 'BALANCED';
    if (sit.emergencyLevel >= 3) newStrategy = 'EMERGENCY_DEFENSE';
    else if (sit.emergencyLevel >= 2 && sit.totalLossRatio > 0.3) newStrategy = 'CAPITAL_DEFENSE';
    else if (sit.totalLossRatio > 0.5) newStrategy = 'LAST_STAND';
    else if (sit.totalLossRatio > 0.3) newStrategy = 'STRATEGIC_DEFENSE';
    else if (sit.forceRatio < 0.4) newStrategy = 'ELASTIC_DEFENSE'; // 从0.6改为0.4
    else if (atWar && sit.forceRatio > 1.5 && sit.frontlineStability > 0) newStrategy = 'ALL_OUT_OFFENSIVE';
    else if (atWar && sit.forceRatio > 1.2) newStrategy = 'FOCUSED_OFFENSIVE';
    sit.recommendedStrategy = newStrategy;
    
    G._aiSituation[country] = sit;
    
    // 更新战略
    let strat = typeof getStrategy === 'function' ? getStrategy(country) : null;
    if (strat) {
        if (typeof mapNewStrategyToGoal === 'function') {
            strat.goal = mapNewStrategyToGoal(newStrategy);
        }
        strat.emergency = sit.emergencyLevel;
        if (typeof getEmergencyAllocation === 'function') {
            strat.alloc = getEmergencyAllocation(newStrategy, sit);
        }
    }
}

// ========== 新增：集团军编成（修复：确保所有士兵编入指挥官） ==========
function aiFormArmyGroups(country) {
    let cs = G.commanderState;
    if (!cs || !G.date) return;
    // 检查指挥官系统是否初始化
    if (!cs.groups) return;
    
    let myDivs = G.divisions.filter(d => 
        d.country === country && d.strength > 0 && 
        d.type !== 'navy' && d.type !== 'submarine'
    );
    // 至少需要能组成一个集团军（2个师）才开始编成
    if (myDivs.length < 2) return;
    
    // 1. 已有集团军补充（不限距离，尽量补满）
    for (let g of cs.groups) {
        if (g.country !== country) continue;
        let cmdr = typeof commanderDataOf === 'function' ? commanderDataOf(country, g.commanderId) : null;
        if (!cmdr) continue;
        let need = (cmdr.cap || 12) - g.divisionIds.length;
        if (need <= 0) continue;
        
        // 不限距离，优先找最近的未分配单位
        let candidates = myDivs.filter(d => 
            !d.armyGroupId && d.state !== 'retreating'
        ).sort((a, b) => {
            let center = typeof getGroupCenter === 'function' ? getGroupCenter(g) : { lon: 0, lat: 0 };
            return Math.hypot(a.rx - center.lon, a.ry - center.lat) - 
                   Math.hypot(b.rx - center.lon, b.ry - center.lat);
        });
        let take = Math.min(need, candidates.length);
        for (let i = 0; i < take; i++) {
            if (typeof addDivisionToGroup === 'function') {
                addDivisionToGroup(candidates[i].id, g.id);
            }
        }
    }
    
    // 2. 获取未分配单位
    let unassigned = myDivs.filter(d => !d.armyGroupId && d.state !== 'retreating');
    if (unassigned.length < 2) return; // 不足2个师，不新建集团军
    
    // 获取可用指挥官
    let availableCmds = typeof getAvailableCommanders === 'function' ? getAvailableCommanders(country) : [];
    if (availableCmds.length > 0) {
        availableCmds.sort((a, b) => (b.data.stars || 0) - (a.data.stars || 0));
        
        let myGroupCount = cs.groups.filter(g => g.country === country).length;
        let maxGroups = 10;
        
        // 新建集团军
        for (let cmd of availableCmds) {
            if (unassigned.length < 2) break;
            myGroupCount = cs.groups.filter(g => g.country === country).length;
            if (myGroupCount >= maxGroups) break;
            
            let cap = cmd.data.cap || 12;
            let refPos = { rx: unassigned[0].rx, ry: unassigned[0].ry };
            let sorted = [...unassigned].sort((a, b) => 
                Math.hypot(a.rx - refPos.rx, a.ry - refPos.ry) - 
                Math.hypot(b.rx - refPos.rx, b.ry - refPos.ry)
            );
            let take = Math.min(cap, sorted.length);
            if (take < 2) continue;
            
            // 单位太分散时限制编组规模
            if (unassigned.length >= 3) {
                let maxDist = 0;
                for (let i = 0; i < Math.min(take, 10); i++) {
                    for (let j = i + 1; j < Math.min(take, 10); j++) {
                        let d = Math.hypot(sorted[i].rx - sorted[j].rx, sorted[i].ry - sorted[j].ry);
                        if (d > maxDist) maxDist = d;
                    }
                }
                if (maxDist > 4.0 && unassigned.length > 3) {
                    take = Math.min(take, 5);
                }
            }
            
            let divIds = sorted.slice(0, take).map(d => d.id);
            if (typeof createArmyGroup === 'function') {
                let result = createArmyGroup(country, cmd.data.id, divIds);
                if (result && result.ok) {
                    // 持久化战区分配：按"战略优先级"分配（修复：不能只看地理距离，否则莫斯科近中东
                    // 会把俄国集团军分到打土耳其；应优先分到战略上的主攻战区）
                    // 主攻战区 = 该国家 theaterPlan 里 priority 最高的战区
                    let grp = result.group;
                    let cx = 0, cy = 0;
                    for (let did of divIds) {
                        let dd = G.divisions.find(x => x.id === did);
                        if (dd) { cx += dd.rx; cy += dd.ry; }
                    }
                    cx /= Math.max(1, divIds.length); cy /= Math.max(1, divIds.length);
                    if (typeof THEATER_DEFS !== 'undefined') {
                        // 史丽芬强制：德国在比利时/卢森堡未被彻底征服前，所有集团军都分到 WESTERN（西线）
                        // ——柏林附近的部队也要先西进，不允许主力被东线吸走
                        let schlieffenActive = false;
                        if (country === 'GERMANY') {
                            let belAlive = false, luxAlive = false;
                            for (let cid in G.cities) {
                                let cc = G.cities[cid];
                                if (cc && cc.hp > 0 && cc.owner === 'BELGIUM') belAlive = true;
                                if (cc && cc.hp > 0 && cc.owner === 'LUXEMBOURG') luxAlive = true;
                            }
                            schlieffenActive = belAlive || luxAlive;
                        }
                        if (schlieffenActive) {
                            grp._theater = 'WESTERN';
                        } else {
                        // 1. 战略优先级：优先分配 priority 最高且该方向有敌军的战区
                        let strat = typeof getStrategy === 'function' ? getStrategy(country) : null;
                        let tp = strat ? strat.theaterPlan : null;
                        let bestTk = null, bestScore = -999;
                        let atWar = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
                        for (let tk in THEATER_DEFS) {
                            let th = THEATER_DEFS[tk];
                            if (!th.cos.includes(country)) continue;
                            let hasEnemyHere = atWar.some(e => th.cos.includes(e));
                            if (!hasEnemyHere) continue;
                            let prio = (tp && tp[tk]) ? tp[tk].priority : 0;
                            // 战略优先级为主，地理距离为辅（距离近 + 战略高 → 最大分）
                            let nearestE = 999;
                            for (let ec of atWar) {
                                if (!th.cos.includes(ec)) continue;
                                for (let cid in G.cities) {
                                    let c = G.cities[cid];
                                    if (!c || c.owner !== ec) continue;
                                    let d = Math.hypot(cx - c.lon, cy - c.lat);
                                    if (d < nearestE) nearestE = d;
                                }
                            }
                            let score = prio * 10 - (nearestE === 999 ? 50 : nearestE * 0.5);
                            if (score > bestScore) { bestScore = score; bestTk = tk; }
                        }
                        grp._theater = bestTk; // 持久标记：只攻此战区的城市
                        }
                    }
                    unassigned = unassigned.filter(d => !divIds.includes(d.id));
                    if (typeof addGameLog === 'function') {
                        addGameLog((typeof COUNTRY_CN !== 'undefined' ? (COUNTRY_CN[country] || country) : country) + 
                            "编成了集团军：" + (result.group.name || '') + 
                            "（指挥官" + cmd.data.name + "，统率" + take + "个师，专攻" + (grp._theater || '全域') + "）");
                    }
                }
            }
        }
    }
    
    // 3. 兜底：将仍然未分配的单位分给最近的有空位集团军（不限距离）
    // 这一步始终执行，确保所有健全单位都编入集团军
    unassigned = myDivs.filter(d => !d.armyGroupId && d.state !== 'retreating');
    if (unassigned.length === 0) return;
    for (let g of cs.groups) {
        if (g.country !== country) continue;
        let cmdr = typeof commanderDataOf === 'function' ? commanderDataOf(country, g.commanderId) : null;
        if (!cmdr) continue;
        let need = (cmdr.cap || 12) - g.divisionIds.length;
        if (need <= 0) continue;
        // 找最近的未分配单位，不限距离
        let center = typeof getGroupCenter === 'function' ? getGroupCenter(g) : { lon: 0, lat: 0 };
        let localCandidates = [...unassigned].sort((a, b) => 
            Math.hypot(a.rx - center.lon, a.ry - center.lat) - 
            Math.hypot(b.rx - center.lon, b.ry - center.lat)
        );
        let take = Math.min(need, localCandidates.length);
        for (let i = 0; i < take; i++) {
            if (typeof addDivisionToGroup === 'function') {
                addDivisionToGroup(localCandidates[i].id, g.id);
            }
        }
        unassigned = unassigned.filter(d => !localCandidates.slice(0, take).find(x => x.id === d.id));
        if (unassigned.length === 0) break;
    }
}

function getGroupCenter(group) {
    let members = typeof getGroupMembers === 'function' ? getGroupMembers(group) : [];
    let sx = 0, sy = 0, cnt = 0;
    for (let m of members) {
        if (m && m.rx !== undefined) { sx += m.rx; sy += m.ry; cnt++; }
    }
    return cnt > 0 ? { lon: sx / cnt, lat: sy / cnt } : { lon: 0, lat: 0 };
}

// ========== 新增：分配集团军任务 ==========
function assignArmyGroupTask(group, country) {
    if (!group) return;
    let sit = G._aiSituation ? G._aiSituation[country] : null;
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    // 紧急情况：所有集团军防御
    if (sit && sit.emergencyLevel >= 2) {
        group._aiTask = 'DEFEND_CAPITAL';
        group._aiTaskTarget = null;
        // 找首都
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.isCapital && ct.owner === country) {
                group._aiTaskTarget = { lon: ct.lon, lat: ct.lat };
                break;
            }
        }
        return;
    }
    
    // 进攻/防御分配
    let allGroups = [];
    let cs = G.commanderState;
    if (cs) allGroups = cs.groups.filter(g => g.country === country);
    let groupIdx = allGroups.indexOf(group);
    
    if (groupIdx >= 0 && groupIdx < Math.ceil(allGroups.length * 0.5) && sit && sit.forceRatio > 1.0) {
        // 前50%的集团军进攻
        group._aiTask = 'OFFENSIVE';
        let target = typeof getGroupTargetCity === 'function' ? getGroupTargetCity(group, country) : null;
        if (target) {
            group._aiTaskTarget = { lon: target.lon, lat: target.lat };
        }
    } else {
        // 后50%防守
        group._aiTask = 'DEFENSIVE';
        // 找最受威胁的己方城市
        let bestCity = null, bestThreat = -999;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner !== country || ct.hp <= 0) continue;
            let enemiesNear = 0;
            for (let d of G.divisions) {
                if (d.strength > 0 && enemies.includes(d.country) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 2.0) {
                    enemiesNear++;
                }
            }
            let threat = enemiesNear * 30 - (ct.isCapital ? 0 : 100);
            if (threat > bestThreat) { bestThreat = threat; bestCity = ct; }
        }
        if (bestCity) {
            group._aiTaskTarget = { lon: bestCity.lon, lat: bestCity.lat };
        }
    }
}

// ========== 新增：防御部署 ==========
// ========== 新增：防线系统（沿边境形成连续防线，坚守阵地） ==========
function aiFormDefensiveLine(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    let myProvs = (typeof getCountryProvinces === 'function' ? getCountryProvinces(country) : []).filter(p => p.center);
    if (myProvs.length === 0) return;
    
    // 1. 识别前线省份（动态：与敌军单位/敌占城市接近的己方省份，不写死国界）
    let borderProvs = [];
    // 敌军单位与敌占城市位置缓存
    let enemyUnits = [];
    for (let d of G.divisions) if (d.strength > 0 && enemies.includes(d.country)) enemyUnits.push(d);
    let enemyCityList = [];
    for (let cid in G.cities) { let c = G.cities[cid]; if (c && c.hp > 0 && enemies.includes(c.owner)) enemyCityList.push(c); }
    for (let mp of myProvs) {
        let threat = 0; // 敌军单位威胁度
        for (let e of enemyUnits) {
            let d = Math.hypot(mp.center[0] - e.rx, mp.center[1] - e.ry);
            if (d < 3.0) threat += 2;
            else if (d < 5.0) threat += 1;
        }
        // 敌占城市威胁度
        let enemyCount = 0;
        for (let ec of enemyCityList) {
            let d = Math.hypot(mp.center[0] - ec.lon, mp.center[1] - ec.lat);
            if (d < 3.0) { enemyCount++; threat += 2; }
            else if (d < 5.0) threat += 1;
        }
        if (threat > 0) {
            borderProvs.push({ prov: mp, enemyCount: Math.max(1, enemyCount), threat: threat });
        }
    }
    if (borderProvs.length === 0) return;
    
    // 2. 按纬度/经度排序（形成连续防线跨度）
    borderProvs.sort((a, b) => a.prov.center[0] - b.prov.center[0] + (a.prov.center[1] - b.prov.center[1]) * 0.3);
    
    // 3. 对每个边境省份，检查已有守军
    let totalEnemies = 0;
    for (let d of G.divisions) {
        if (d.strength > 0 && enemies.includes(d.country)) totalEnemies++;
    }
    let totalFriendlies = G.divisions.filter(d => d.country === country && d.strength > 0).length;
    let enemyRatio = totalEnemies / Math.max(1, totalFriendlies);
    
    // 防线密度：敌人越多，防线越密集
    let provsPerUnit = enemyRatio > 1.5 ? 1 : (enemyRatio > 0.8 ? 2 : 3);
    
    // 4. 分配防线防守任务
    for (let bp of borderProvs) {
        let cx = bp.prov.center[0], cy = bp.prov.center[1];
        
        // 检查该段防线已有守军（附近1.5度内且有DEFEND_LINE标记的单位）
        let existingDefenders = 0;
        for (let d of G.divisions) {
            if (d.country !== country || d.strength <= 0) continue;
            if (d._aiTask !== 'DEFEND_LINE' && d._aiTask !== 'DEFEND_CITY') continue;
            if (Math.hypot(d.rx - cx, d.ry - cy) < 1.5) existingDefenders++;
        }
        
        // 计算需要的守军（按威胁度，敌军单位附近防线更密）
        let needed = Math.max(1, Math.ceil((bp.threat || bp.enemyCount) / provsPerUnit));
        // 总兵力不足时，集中防守关键区域
        let capital = null;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.isCapital && ct.owner === country) { capital = ct; break; }
        }
        let isCritical = capital && Math.hypot(cx - capital.lon, cy - capital.lat) < 5.0;
        if (isCritical) needed = Math.max(needed, 3);
        
        let shortage = needed - existingDefenders;
        if (shortage <= 0) continue;
        
        // 找空闲单位（无_aiTask标记的非海军单位）
        let idleUnits = G.divisions.filter(d => 
            d.country === country && d.strength > 0 && 
            d.type !== 'navy' && d.type !== 'submarine' &&
            !d._aiTask && !d._aiTaskTarget &&
            d.state !== 'retreating' &&
            Math.hypot(d.rx - cx, d.ry - cy) < 12.0
        ).sort((a, b) => 
            Math.hypot(a.rx - cx, a.ry - cy) - 
            Math.hypot(b.rx - cx, b.ry - cy)
        );
        
        let assigned = 0;
        for (let u of idleUnits) {
            if (assigned >= shortage) break;
            // 分散部署在边境线附近（不扎堆）
            let spreadX = (Math.random() - 0.5) * 0.8;
            let spreadY = (Math.random() - 0.5) * 0.8;
            let tx = cx + spreadX, ty = cy + spreadY;
            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, tx, ty);
            else { u.state = 'moving'; u.targetX = tx; u.targetY = ty; }
            u._aiTask = 'DEFEND_LINE';
            u._aiTaskTarget = { lon: tx, lat: ty };
            u._aiTaskAge = 0;
            assigned++;
        }
    }
}

function aiDefenseDeployment(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    if (!G._aiDefenseOrders) G._aiDefenseOrders = {};
    // 阿尔萨斯-洛林（法德交界）：历史上德意志领土，一战爆发后战略要冲，重点防御
    const ALSACE_LORRAINE = ['strasbourg', 'colmar', 'metz', 'mulhouse'];
    
    // 清理不再受威胁的 DEFEND_CITY 任务（仅当城市 HP 已受损 → 确认真受威胁过才解除）
    // 修复：之前判定过于激进（2.5° 内暂时无敌军就清理）→ 阿尔萨斯-洛林等边境城市 HP 未损时被反复释放
    // 现在：城市 HP 满（未被打过）→ 保留守军；HP 已损（被攻击过）+ 2.5° 内已无敌军 → 释放
    for (let d of G.divisions) {
        if (d.country !== country || d._aiTask !== 'DEFEND_CITY' || !d._aiTaskTarget) continue;
        let cityUnderAttack = false, cityThreatened = false;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (!ct || ct.hp <= 0) continue;
            if (Math.hypot(ct.lon - d._aiTaskTarget.lon, ct.lat - d._aiTaskTarget.lat) < 0.4) {
                cityUnderAttack = (ct.hp || 100) < (ct.maxHp || 100); // HP 受损 = 已被攻击
                for (let e of G.divisions) {
                    if (e.strength > 0 && enemies.includes(e.country) && Math.hypot(e.rx - ct.lon, e.ry - ct.lat) < 2.5) {
                        cityThreatened = true; break;
                    }
                }
                break;
            }
        }
        // 阿尔萨斯-洛林守军永不清理（战略要冲，持续防守）
        let isAlsaceLorraine = false;
        for (let cid2 in G.cities) {
            let ct2 = G.cities[cid2];
            if (ct2 && Math.hypot(ct2.lon - d._aiTaskTarget.lon, ct2.lat - d._aiTaskTarget.lat) < 0.4 &&
                (ct2.id === 'strasbourg' || ct2.id === 'colmar' || ct2.id === 'metz' || ct2.id === 'mulhouse')) {
                isAlsaceLorraine = true; break;
            }
        }
        // 阿尔萨斯-洛林守军永不释放；其他城：HP 未受损保留，已受损+敌军远离才释放
        if (!isAlsaceLorraine && cityUnderAttack && !cityThreatened) {
            d._aiTask = null;
            d._aiTaskTarget = null;
        }
    }
    
    // 计算每个城市防御优先级
    let cities = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.owner !== country || ct.hp <= 0) continue;
        
        let priority = 0;
        // 是否前线城市（先判定，priority 计算要用 borderCity）
        // ① 2.5° 内有敌军单位（被动）
        // ② 3° 内有敌国城市（地理边境——主动布防，不等敌军贴脸）
        let isFrontline = false, borderCity = false;
        for (let d of G.divisions) {
            if (d.strength > 0 && enemies.includes(d.country) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 2.5) {
                isFrontline = true; break;
            }
        }
        if (!isFrontline) {
            for (let cidE in G.cities) {
                let ec = G.cities[cidE];
                if (!ec || ec.hp <= 0 || !enemies.includes(ec.owner)) continue;
                if (Math.hypot(ec.lon - ct.lon, ec.lat - ct.lat) < 3.0) { isFrontline = true; borderCity = true; break; }
            }
        }
        if (ct.isCapital) priority += 1000;
        else if (typeof isMajorCity === 'function' && isMajorCity(ct.id)) priority += 300;
        else if (ct.cityType === 'agri') priority += 150;
        else priority += 50;
        priority += (ct.factories || 0) * 40;
        // 阿尔萨斯-洛林重点防御加成（即使没被敌军贴近也优先部署）
        if (ALSACE_LORRAINE.includes(ct.id)) priority += 800;
        // 与敌国城市接壤的边境城市加成——保证新兵主动集结到边境（不只守城）
        if (borderCity) priority += 400;

        // 非前线城市 + 非首都：不需要守军，把兵力全放前线
        if (!isFrontline && !ct.isCapital) {
            priority = 0; // 后方城市不抢占兵力
        }
        // 首都无威胁时也只保留最低限度
        if (ct.isCapital && !isFrontline) { priority = Math.floor(priority * 0.3); }
        
        // 敌军密度——主力聚集处加强防御（修复：动态调整防御重点）
        let nearbyEnemies = 0;
        for (let d of G.divisions) {
            if (d.strength > 0 && enemies.includes(d.country) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) {
                nearbyEnemies++;
            }
        }
        // 3° 范围内敌军总量当作"主力压迫强度"
        let enemyPressure = 0;
        for (let d of G.divisions) {
            if (d.strength > 0 && enemies.includes(d.country) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 3.0) {
                enemyPressure++;
            }
        }
        // 敌军主力聚集：每个近距敌人 +60（原30），压迫强度每单位 +20
        priority += nearbyEnemies * 60 + enemyPressure * 20;
        
        let defenders = 0;
        for (let d of G.divisions) {
            if (d.country === country && d.strength > 0 && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 0.5) {
                defenders++;
            }
        }
        priority -= defenders * 25;
        
        let hpRatio = ct.hp / Math.max(1, ct.maxHp || 100);
        if (hpRatio < 0.3) priority += 80;
        else if (hpRatio < 0.5) priority += 40;
        
        if (ct.isCapital) {
            priority += nearbyEnemies * 50;
            if (nearbyEnemies > 5) priority = 9999;
        }
        
        cities.push({ city: ct, priority: Math.max(0, priority), defenders: defenders, isFrontline: isFrontline, borderCity: borderCity });
    }
    cities.sort((a, b) => b.priority - a.priority);
    
    // 按优先级分配守军（防御总兵力上限 30%——修复：原15%太低，边境城市+阿尔萨斯沦陷）
    let sit = G._aiSituation ? G._aiSituation[country] : null;
    let totalDivs = G.divisions.filter(d => d.country === country && d.strength > 0 && d.type !== 'navy').length;
    let defenseCap = Math.max(3, Math.floor(totalDivs * 0.20)); // 防御上限 20%（修正：原30%太高导致法国全员窝城）
    // 已有的 DEFEND_CITY 单位也计入上限（防止历史残留累计超限）
    // 但阿尔萨斯-洛林守军不计入普通上限（战略要冲，永不释放）
    let totalAssignedDefense = G.divisions.filter(d => d.country === country && d._aiTask === 'DEFEND_CITY' && d.strength > 0).length;
    // 超额时先解除多余的防御任务（跳过阿尔萨斯-洛林守军）
    if (totalAssignedDefense > defenseCap) {
        let excess = totalAssignedDefense - defenseCap;
        for (let d of G.divisions) {
            if (excess <= 0) break;
            if (d.country === country && d._aiTask === 'DEFEND_CITY') {
                // 阿尔萨斯-洛林守军永不释放（战略要冲）
                let isAlsaceLorraine = false;
                if (d._aiTaskTarget) {
                    for (let cidAL in G.cities) {
                        let ctAL = G.cities[cidAL];
                        if (ctAL && ALSACE_LORRAINE.includes(ctAL.id) &&
                            Math.hypot(ctAL.lon - d._aiTaskTarget.lon, ctAL.lat - d._aiTaskTarget.lat) < 0.4) {
                            isAlsaceLorraine = true; break;
                        }
                    }
                }
                if (isAlsaceLorraine) continue;
                d._aiTask = null; d._aiTaskTarget = null;
                excess--;
            }
        }
        totalAssignedDefense = defenseCap;
    }
    for (let cd of cities) {
        let needed = 1;
        if (cd.city.isCapital) needed = cd.isFrontline ? 3 : 1;      // 前线首都 3 个（原5）
        else if (typeof isMajorCity === 'function' && isMajorCity(cd.city.id)) needed = cd.isFrontline ? 2 : 0; // 大城2（原3）
        else if (cd.city.cityType === 'agri') needed = cd.isFrontline ? 1 : 0;  // 农城1（原2）
        else needed = cd.isFrontline ? 1 : 0; // 非前线不守
        // 阿尔萨斯-洛林重点城市独立 needed（不受大城2个上限约束）
        if (ALSACE_LORRAINE.includes(cd.city.id)) needed = Math.max(needed, 2);
        // 与敌国城市接壤的边境城市（borderCity）独立 needed——保证每个边境城市至少 1 个守军
        if (cd.borderCity && !ALSACE_LORRAINE.includes(cd.city.id)) needed = Math.max(needed, 1);

        let shortage = needed - cd.defenders;
        if (shortage <= 0) continue;
        // 防御总量上限：普通城市 20%（defenseCap），边境城市+阿尔萨斯-洛林 35%（borderCap）
        let borderCap = Math.max(4, Math.floor(totalDivs * 0.35));
        shortage = (ALSACE_LORRAINE.includes(cd.city.id) || cd.borderCity)
            ? Math.min(shortage, borderCap - totalAssignedDefense)
            : Math.min(shortage, defenseCap - totalAssignedDefense);
        if (shortage <= 0) break;
        
        // 找空闲单位去防守（跳过有_aiTask标记的单位）
        let assigned = 0;
        let idleUnits = G.divisions.filter(d => 
            d.country === country && d.strength > 0 && 
            !d._aiTask && !d._aiTaskTarget && // 跳过有任务标记的单位
            (d.state === 'idle' || (d.state === 'moving' && !G.patrolTargets[d.id])) &&
            d.type !== 'artillery' && d.type !== 'navy' && d.type !== 'submarine' && // 火炮/海军不守城
            // 德国东部单位（普鲁士/柏林）不参与西部防御——留给东线打俄国
            !(country === 'GERMANY' && d.rx > 11.0) &&
            Math.hypot(d.rx - cd.city.lon, d.ry - cd.city.lat) < 15.0
        ).sort((a, b) => 
            Math.hypot(a.rx - cd.city.lon, a.ry - cd.city.lat) - 
            Math.hypot(b.rx - cd.city.lon, b.ry - cd.city.lat)
        );
        
        for (let u of idleUnits) {
            if (assigned >= shortage) break;
            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(u, cd.city.lon, cd.city.lat);
            else { u.state = 'moving'; u.targetX = cd.city.lon; u.targetY = cd.city.lat; }
            u._aiTask = 'DEFEND_CITY';
            u._aiTaskTarget = { lon: cd.city.lon, lat: cd.city.lat };
            u._aiTaskAge = 0;
            if (!G._aiDefenseOrders[cd.city.id]) G._aiDefenseOrders[cd.city.id] = [];
            G._aiDefenseOrders[cd.city.id].push(u.id);
            assigned++;
            totalAssignedDefense++;
        }
        
        // 从低优先级城市抽调
        if (assigned < shortage) {
            for (let lc of [...cities].reverse()) {
                if (lc.city.id === cd.city.id) continue;
                let lcDefenders = G.divisions.filter(d => 
                    d.country === country && d.strength > 0 &&
                    Math.hypot(d.rx - lc.city.lon, d.ry - lc.city.lat) < 0.5
                );
                for (let def of lcDefenders) {
                    if (assigned >= shortage) break;
                    if (Math.hypot(def.rx - cd.city.lon, def.ry - cd.city.lat) < 5.0) {
                        if (typeof aiMoveToTarget === 'function') aiMoveToTarget(def, cd.city.lon, cd.city.lat);
                        else { def.state = 'moving'; def.targetX = cd.city.lon; def.targetY = cd.city.lat; }
                        assigned++;
                    }
                }
            }
        }
    }
}

// ========== 修复：紧急防御（不再抽空整条防线） ==========
function aiEmergencyDefense(country) {
    let sit = G._aiSituation ? G._aiSituation[country] : null;
    if (!sit || sit.emergencyLevel < 1) return;
    
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    let capital = null;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.isCapital && ct.owner === country) { capital = ct; break; }
    }
    if (!capital) return;
    
    // 计算总兵力，限制召回比例
    let totalUnits = 0;
    for (let d of G.divisions) {
        if (d.country === country && d.strength > 0 && (typeof isSeaType !== 'function' || !isSeaType(d.type))) totalUnits++;
    }
    let maxRecall = Math.max(5, Math.floor(totalUnits * 0.50)); // 最多召回50%的部队（从35%提升到50%）
    let recalledCount = 0;
    
    // 检查哪些单位正在前线交战
    let isInCombat = function(d) {
        for (let e of G.divisions) {
            if (e.strength <= 0 || !enemies.includes(e.country)) continue;
            if (Math.hypot(d.rx - e.rx, d.ry - e.ry) < 0.5) return true;
        }
        return false;
    };
    
    // 紧急等级2：召回首都附近8度内的部队（跳过有_aiTask标记的单位）
    if (sit.emergencyLevel >= 2) {
        for (let d of G.divisions) {
            if (d.country !== country || d.strength <= 0) continue;
            if (recalledCount >= maxRecall) break;
            if (d._aiTask) continue; // 有任务标记的单位不召回
            if (isInCombat(d)) continue; // 正在交战的部队不回防
            let dist = Math.hypot(d.rx - capital.lon, d.ry - capital.lat);
            // 检查该单位是否在前线（附近有敌方城市）
            let isAtFrontline = false;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (enemies.includes(ct.owner) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) {
                    isAtFrontline = true; break;
                }
            }
            if (isAtFrontline) continue; // 前线部队不回防
            if (dist < 8.0 && dist > 0.3 && d.state !== 'retreating' && d.state !== 'moving') {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, capital.lon, capital.lat);
                else { d.state = 'moving'; d.targetX = capital.lon; d.targetY = capital.lat; }
                d._aiTask = 'DEFEND_CAPITAL';
                d._aiTaskTarget = { lon: capital.lon, lat: capital.lat };
                d._aiTaskAge = 0;
                recalledCount++;
            }
        }
    }
    
    // 紧急等级3：全力召回，把15度内且不在前线的部队回防（跳过有_aiTask标记的单位）
    if (sit.emergencyLevel >= 3) {
        for (let d of G.divisions) {
            if (d.country !== country || d.strength <= 0) continue;
            if (recalledCount >= maxRecall) break;
            if (d._aiTask) continue; // 有任务标记的单位不召回
            if (isInCombat(d)) continue;
            let dist = Math.hypot(d.rx - capital.lon, d.ry - capital.lat);
            // 检查该单位是否在前线
            let isAtFrontline = false;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (enemies.includes(ct.owner) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) {
                    isAtFrontline = true; break;
                }
            }
            if (isAtFrontline) continue;
            if (dist > 1.0 && dist < 15.0 && d.state !== 'retreating' && d.state !== 'moving') {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, capital.lon, capital.lat);
                else { d.state = 'moving'; d.targetX = capital.lon; d.targetY = capital.lat; }
                d._aiTask = 'DEFEND_CAPITAL';
                d._aiTaskTarget = { lon: capital.lon, lat: capital.lat };
                d._aiTaskAge = 0;
                recalledCount++;
            }
        }
    }
}

// ========== 新增：战线增援 ==========
function aiReinforceFrontline(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;
    
    // 获取前线省份
    let myProvs = (typeof getCountryProvinces === 'function' ? getCountryProvinces(country) : []).filter(p => p.center);
    let frontProvs = [];
    for (let p of myProvs) {
        for (let nid in G.provinceData) {
            let np = G.provinceData[nid];
            if (!np.center || !enemies.includes(np.country)) continue;
            if (Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 2.0) {
                frontProvs.push(p);
                break;
            }
        }
    }
    if (frontProvs.length === 0) return;
    
    // 计算每个前线省份的兵力对比
    for (let fp of frontProvs) {
        let myNearby = 0, enemyNearby = 0;
        for (let d of G.divisions) {
            if (d.strength <= 0) continue;
            let dist = Math.hypot(d.rx - fp.center[0], d.ry - fp.center[1]);
            if (dist > 2.0) continue;
            if (d.country === country) myNearby++;
            else if (enemies.includes(d.country)) enemyNearby++;
        }
        
        // 如果敌人兵力优势，从后方调兵
        if (enemyNearby > myNearby * 1.2) { // 从1.5降到1.2，更容易触发增援
            let shortfall = Math.min(5, Math.ceil(enemyNearby * 0.6 - myNearby));
            let reinforcements = G.divisions.filter(d => 
                d.country === country && d.strength > 0 && 
                !d._aiTask && // 跳过有任务标记的单位
                (d.state === 'idle' || (d.state === 'moving' && !G.patrolTargets[d.id])) &&
                Math.hypot(d.rx - fp.center[0], d.ry - fp.center[1]) > 2.0 &&
                Math.hypot(d.rx - fp.center[0], d.ry - fp.center[1]) < 15.0
            ).sort((a, b) => 
                Math.hypot(a.rx - fp.center[0], a.ry - fp.center[1]) - 
                Math.hypot(b.rx - fp.center[0], b.ry - fp.center[1])
            );
            
            let sent = 0;
            for (let r of reinforcements) {
                if (sent >= shortfall) break;
                let tx = fp.center[0] + (Math.random() - 0.5) * 0.3;
                let ty = fp.center[1] + (Math.random() - 0.5) * 0.3;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(r, tx, ty);
                else { r.state = 'moving'; r.targetX = tx; r.targetY = ty; }
                r._aiTask = 'REINFORCE_FRONT';
                r._aiTaskTarget = { lon: tx, lat: ty };
                r._aiTaskAge = 0;
                sent++;
            }
        }
    }
}

// ========== 新增：释放防御单位用于进攻（解决俄国在边境集结不进攻的问题） ==========
function aiReleaseDefensiveForOffense(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return;

    // 计算总体兵力对比
    let myTotal = 0, enemyTotal = 0;
    for (let d of G.divisions) {
        if (d.strength <= 0) continue;
        if (d.type === 'navy' || d.type === 'submarine') continue;
        if (d.country === country) myTotal++;
        else if (enemies.includes(d.country)) enemyTotal++;
    }
    if (myTotal < 3) return; // 兵太少，继续防守

    // 计算己方城市丢失比例
    let myTotalCities = 0, myLostCities = 0;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct) continue;
        let origOwner = ct.originalCountry || ct.country;
        if (origOwner === country) {
            myTotalCities++;
            if (ct.owner !== country) myLostCities++;
        }
    }
    let cityLossRatio = myTotalCities > 0 ? myLostCities / myTotalCities : 0;

    // 判断是否应该释放防御单位：
    // 1. 兵力优势（我方兵力 >= 敌方兵力 * 1.2）且城市丢失不多（<20%）
    // 2. 或者兵力远大于敌方（>1.5倍）即使城市丢失较多（<40%）
    // 3. 或者敌人距离很远（最近敌人 > 5度）
    let shouldRelease = false;
    let nearestEnemyDist = 999;
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        if (d.type === 'navy' || d.type === 'submarine') continue;
        for (let myD of G.divisions) {
            if (myD.country !== country || myD.strength <= 0) continue;
            let dist = Math.hypot(myD.rx - d.rx, myD.ry - d.ry);
            if (dist < nearestEnemyDist) nearestEnemyDist = dist;
        }
    }

    if (myTotal >= enemyTotal * 1.5 && cityLossRatio < 0.4) {
        shouldRelease = true; // 兵力远大于敌方，出击
    } else if (myTotal >= enemyTotal * 1.2 && cityLossRatio < 0.2) {
        shouldRelease = true; // 兵力优势且领土完整，出击
    } else if (nearestEnemyDist > 5.0 && myTotal > enemyTotal) {
        shouldRelease = true; // 敌人很远而我有兵力优势，出击
    }

    if (!shouldRelease) return;

    // 统计哪些城市有防守任务且防守充足
    let defenseTaskCounts = {};
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        if (d._aiTask === 'DEFEND_CITY' || d._aiTask === 'DEFEND_LINE' || d._aiTask === 'REINFORCE_FRONT') {
            let key = d._aiTaskTarget ? `${d._aiTaskTarget.lon},${d._aiTaskTarget.lat}` : 'unknown';
            defenseTaskCounts[key] = (defenseTaskCounts[key] || 0) + 1;
        }
    }

    // 释放过量的防御单位（同一防守位置超过3个的，释放多余的）
    let released = 0;
    let maxRelease = Math.max(3, Math.floor(myTotal * 0.35)); // 最多释放35%的总兵力

    // 按防守任务分组，每个任务保留2个防御单位，多余的释放
    let taskUnitCounts = {};
    for (let d of G.divisions) {
        if (d.country !== country || d.strength <= 0) continue;
        if (d._aiTask === 'DEFEND_CITY' || d._aiTask === 'DEFEND_LINE' || d._aiTask === 'REINFORCE_FRONT') {
            let key = d._aiTaskTarget ? `${d._aiTaskTarget.lon},${d._aiTaskTarget.lat}` : 'unknown';
            if (!taskUnitCounts[key]) taskUnitCounts[key] = [];
            taskUnitCounts[key].push(d);
        }
    }

    for (let key in taskUnitCounts) {
        if (released >= maxRelease) break;
        let units = taskUnitCounts[key];
        if (units.length <= 2) continue; // 每个防守位置至少保留2个

        // 取多余的单位释放（保留最近的2个，释放较远的）
        let keyParts = key.split(',');
        let targetLon = parseFloat(keyParts[0]);
        let targetLat = parseFloat(keyParts[1]);
        if (isNaN(targetLon) || isNaN(targetLat)) continue;
        units.sort((a, b) => {
            let distA = Math.hypot(a.rx - targetLon, a.ry - targetLat);
            let distB = Math.hypot(b.rx - targetLon, b.ry - targetLat);
            return distA - distB;
        });

        for (let i = 2; i < units.length; i++) {
            if (released >= maxRelease) break;
            let d = units[i];
            // 检查该单位是否正在交战（附近有敌人）
            let inCombat = false;
            for (let e of G.divisions) {
                if (e.strength <= 0 || !enemies.includes(e.country)) continue;
                if (Math.hypot(d.rx - e.rx, d.ry - e.ry) < 0.5) {
                    inCombat = true;
                    break;
                }
            }
            if (inCombat) continue; // 交战中不释放

            // 检查该单位附近是否有敌人城市（前线单位不释放）
            let atFrontline = false;
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (enemies.includes(ct.owner) && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) {
                    atFrontline = true;
                    break;
                }
            }
            if (atFrontline) continue; // 前线单位不释放（后方防御单位才释放）

            // 释放该单位
            d._aiTask = null;
            d._aiTaskTarget = null;
            d._aiTaskAge = 0;
            released++;
        }
    }

    // 如果释放的数量不够，再释放DEFEND_CAPITAL之外的多余防守单位
    if (released < maxRelease * 0.5) {
        // 检查有防守任务但防守位置安全的单位（没有敌人靠近）
        for (let d of G.divisions) {
            if (d.country !== country || d.strength <= 0) continue;
            if (released >= maxRelease) break;
            if (d._aiTask === 'DEFEND_CAPITAL') continue; // 首都守卫不释放
            if (d._aiTask !== 'DEFEND_CITY' && d._aiTask !== 'DEFEND_LINE') continue;

            // 检查防守位置是否安全（附近没有敌人）
            let targetLon = d._aiTaskTarget ? d._aiTaskTarget.lon : d.rx;
            let targetLat = d._aiTaskTarget ? d._aiTaskTarget.lat : d.ry;
            let nearbyEnemies = 0;
            for (let e of G.divisions) {
                if (e.strength <= 0 || !enemies.includes(e.country)) continue;
                if (Math.hypot(e.rx - targetLon, e.ry - targetLat) < 2.0) {
                    nearbyEnemies++;
                }
            }
            if (nearbyEnemies === 0) {
                // 安全位置，释放
                d._aiTask = null;
                d._aiTaskTarget = null;
                d._aiTaskAge = 0;
                released++;
            }
        }
    }
}