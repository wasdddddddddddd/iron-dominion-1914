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

// ===== 主AI入口 =====
function updateAI() {
    let cs = G.countries;
    let allCountries = Object.keys(cs).filter(c => c !== G.playerCountry && cs[c].treasury !== undefined && !G.surrendered[c]);

    // 德国历史宣战
    let playerIsGermany = G.playerCountry === 'GERMANY';
    if (!playerIsGermany && !G.germanyDeclaredWar && G.date >= new Date(1914, 7, 3)) {
        G.germanyDeclaredWar = true;
        if (!areAtWar('GERMANY', 'FRANCE')) declareWar('GERMANY', 'FRANCE');
        if (!areAtWar('GERMANY', 'BELGIUM')) declareWar('GERMANY', 'BELGIUM');
        if (!areAtWar('GERMANY', 'NETHERLANDS')) declareWar('GERMANY', 'NETHERLANDS');
        G.newsBanner = "⚔️ 德意志帝国向法国、比利时和荷兰宣战！";
        G.newsTimer = 600;
    }

    // 每 50 tick 更新战略评估
    let tick = G.tick || 0;
    if (tick % 50 === 0) {
        for (let co of allCountries) {
            if (typeof reevaluateStrategy === 'function') reevaluateStrategy(co);
        }
    }

    for (let co of allCountries) {
        let cd = cs[co]; if (!cd) continue;
        let pers = typeof getPersonality === 'function' ? getPersonality(co) : null;
        if (!pers) continue;

        // ========== 0. 撤退处理 ==========
        if (typeof processRetreats === 'function') processRetreats(co);

        // ========== 1. 经济运营 ==========
        aiEconomy(co, cd, pers);

        // ========== 2. 生产工厂军队 ==========
        aiProduction(co, cd, pers);

        // ========== 3. 外交策略 ==========
        aiDiplomacy(co, cd, pers, allCountries);

        // ========== 4. 应对入侵 ==========
        aiDefenseResponse(co, cd, pers);
    }

    // ========== 4.5 战术编组更新 ==========
    for (let co of allCountries) {
        if (typeof updateTacticalGroups === 'function') updateTacticalGroups(co);
    }

    // ========== 4.6 海军战略 ==========
    if (typeof aiNavyStrategy === 'function') aiNavyStrategy(allCountries);

    // ========== 5. AI 攻击移动 ==========
    aiAttackMovement(allCountries);

    // ========== 6. AI 求和 ==========
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
}

// ========== 2. 生产工厂军队 ==========
function aiProduction(co, cd, pers) {
    let atWar = isCountryAtWar(co);
    let atWarWithList = getEnemiesOf(co);
    let enemyCount = 0;
    for (let enemy of atWarWithList) {
        enemyCount += G.divisions.filter(d => d.country === enemy && d.strength > 0).length;
    }
    let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;

    // 威胁评估
    let myProvinceCenters = getCountryProvinces(co).filter(p => p.center).map(p => p.center);
    let enemyInTerritory = atWar && G.divisions.some(d => {
        if (d.country === co || d.strength <= 0) return false;
        if (!atWarWithList.includes(d.country)) return false;
        return myProvinceCenters.some(ctr => Math.hypot(d.rx - ctr[0], d.ry - ctr[1]) < 1.5);
    });

    let inDanger = atWar && (myCount < enemyCount * 0.8 || enemyInTerritory);

    // 列强更大的军队上限
    let isGP = isGreatPower(co);
    let maxDivs = inDanger ? (isGP ? 180 : 120) : atWar ? (isGP ? 140 : 80) : (isGP ? 60 : 35);
    let minTreasury = atWar ? 10 : 25;

    // 国库充裕时多生产：每轮可生产多个单位
    let rounds = 1;
    if (atWar && cd.treasury > 500) rounds = 3;
    else if (atWar && cd.treasury > 250) rounds = 2;
    else if (!atWar && cd.treasury > 800) rounds = 2;

    for (let r = 0; r < rounds; r++) {
        if (cd.treasury <= minTreasury) break;
        if (cd.divCount >= maxDivs) break;

        // 战时或国库充裕时提高训练概率
        let trainChance = inDanger ? 0.90 : atWar ? 0.60 : 0.15;
        // 国库充裕进一步加码
        if (cd.treasury > 400) trainChance = Math.min(0.95, trainChance * 1.3);
        // 法国战时加成
        if (co === 'FRANCE' && atWar) trainChance = Math.min(0.95, trainChance + 0.15);

        if (Math.random() > trainChance) continue;

        let ps = getCountryProvinces(co).filter(p => p.garrison < 3);
        if (ps.length === 0) break;

        // 自适应目标兵力构成
        let infantryRatio = atWar ? 0.35 : 0.50;
        let engineerRatio = 0.10;
        let cavalryRatio = pers.preferCavalry * 0.25;
        let artilleryRatio = pers.preferArtillery * 0.35;
        if (atWar) { artilleryRatio += 0.20; engineerRatio += 0.08; }

        // 根据敌方构成调整
        let enemyTypes = {infantry:0,engineer:0,cavalry:0,artillery:0,navy:0};
        for (let e of G.divisions) {
            if (e.strength <= 0 || !atWarWithList.includes(e.country)) continue;
            enemyTypes[e.type] = (enemyTypes[e.type] || 0) + 1;
        }
        let eTotal = enemyTypes.infantry + enemyTypes.engineer + enemyTypes.cavalry + enemyTypes.artillery;
        if (eTotal > 0) {
            let eCavR = enemyTypes.cavalry / eTotal;
            let eArtR = enemyTypes.artillery / eTotal;
            if (eCavR > 0.20) infantryRatio += 0.10;
            if (eArtR > 0.20) cavalryRatio += 0.10;
        }
        // 防守战略→更多炮兵
        let strat = typeof getStrategy === 'function' ? getStrategy(co) : null;
        if (strat && strat.goal === 'DEFENSIVE') artilleryRatio += 0.10;

        let myInfantry = G.divisions.filter(d => d.country === co && d.type === 'infantry' && d.strength > 0).length;
        let myEngineer = G.divisions.filter(d => d.country === co && d.type === 'engineer' && d.strength > 0).length;
        let myCavalry = G.divisions.filter(d => d.country === co && d.type === 'cavalry' && d.strength > 0).length;
        let myArtillery = G.divisions.filter(d => d.country === co && d.type === 'artillery' && d.strength > 0).length;
        let total = myCount || 1;

        let affordable = [];
        let ut = UNIT_TYPES;
        if (cd.treasury >= ut.infantry.cost && cd.manpower >= (ut.infantry.manpower || 10)) affordable.push('infantry');
        if (cd.treasury >= ut.engineer.cost && cd.manpower >= (ut.engineer.manpower || 10)) affordable.push('engineer');
        if (cd.treasury >= ut.cavalry.cost && cd.manpower >= (ut.cavalry.manpower || 10)) affordable.push('cavalry');
        if (cd.treasury >= ut.artillery.cost && cd.manpower >= (ut.artillery.manpower || 10)) affordable.push('artillery');

        if (affordable.length === 0) break;

        let deficits = {
            infantry: Math.max(0, infantryRatio - myInfantry / total),
            engineer: Math.max(0, engineerRatio - myEngineer / total),
            cavalry: Math.max(0, cavalryRatio - myCavalry / total),
            artillery: Math.max(0, artilleryRatio - myArtillery / total),
        };

        let maxDeficit = 0;
        for (let t of affordable) {
            if (deficits[t] > maxDeficit) { maxDeficit = deficits[t]; type = t; }
        }
        if (maxDeficit < 0.05) {
            type = affordable[Math.floor(Math.random() * affordable.length)];
        }

        // 战时炮兵和工兵优先
        if (inDanger && affordable.includes('artillery') && Math.random() > 0.4) type = 'artillery';
        if (atWar && affordable.includes('engineer') && myEngineer < 3 && Math.random() > 0.6) type = 'engineer';

        let prov = ps[Math.floor(Math.random() * ps.length)];
        // AI 单位通过城市生产队列产出（从建筑附近走出来）
        let aiCity = null;
        if (G.cities) {
            for (let cid in G.cities) {
                let c = G.cities[cid];
                if (c.owner === co && c.hp > 0 && c.provinceId === prov.id) { aiCity = c; break; }
            }
            if (!aiCity) {
                for (let cid in G.cities) {
                    let c = G.cities[cid];
                    if (c.owner === co && c.hp > 0) { aiCity = c; break; }
                }
            }
        }
        if (aiCity && cd.treasury >= UNIT_TYPES[type].cost) {
            let buildDays = { infantry: 3, engineer: 3, cavalry: 4, artillery: 5 }[type] || 20;
            let mc = UNIT_TYPES[type].manpower || 10;
            if (cd.manpower >= mc) {
                cd.treasury -= UNIT_TYPES[type].cost;
                cd.manpower -= mc;
                if (!G.buildQueue) G.buildQueue = [];
                G.buildQueue.push({ type: 'unit', unitType: type, province: aiCity.provinceId, days: buildDays, totalDays: buildDays, cityId: aiCity.id, cityLon: aiCity.lon, cityLat: aiCity.lat, country: co });
            } else {
                createDivision(prov.id, co, type);
            }
        } else {
            createDivision(prov.id, co, type);
        }
    }

    // AI 海军建造（直接调用 createShip，不经过玩家队列）
    if (typeof createShip === 'function' && typeof GREAT_NAVY_POWERS !== 'undefined') {
        let isGP = GREAT_NAVY_POWERS.includes(co);
        if (isGP && G.navyNodes) {
            let myNodes = Object.keys(G.navyNodes).filter(id => G.navyNodes[id].country === co);
            if (myNodes.length > 0 && cd.treasury >= 350 && cd.manpower >= 3) {
                let myNavy = G.divisions.filter(d => d.country === co && (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') && d.strength > 0).length;
                let enemyNavyCount = 0;
                let atWarList = typeof getEnemiesOf === 'function' ? getEnemiesOf(co) : [];
                for (let e of G.divisions) {
                    if ((typeof isSeaType === 'function' ? isSeaType(e.type) : e.type === 'navy') && e.strength > 0 && atWarList.includes(e.country)) enemyNavyCount++;
                }
                let maxShips = myNodes.reduce((sum, nid) => sum + ((G.navyNodes[nid].level || 1) * 4), 0);
                let needNavy = atWarList.length > 0 && myNavy < Math.min(maxShips, Math.max(3, enemyNavyCount * 0.5));
                if (!needNavy && atWarList.length === 0) needNavy = myNavy < Math.min(maxShips, 2);
                if (needNavy && Math.random() < 0.015) {
                    let nodeId = myNodes[0];
                    let bestNode = null, bestLv = -1;
                    for (let nid of myNodes) {
                        let n = G.navyNodes[nid];
                        if (n.level > bestLv) { bestLv = n.level; bestNode = n; }
                    }
                    if (bestNode) nodeId = bestNode.id;
                    // 德国有机会造潜艇
                    let buildSub = co === 'GERMANY' && Math.random() < 0.4 && cd.treasury >= 350 && cd.manpower >= 3;
                    if (buildSub) {
                        let seaPos = typeof findSeaPosition === 'function' ? findSeaPosition(G.navyNodes[nodeId].lon, G.navyNodes[nodeId].lat) : null;
                        let bestProv = typeof findNearestProvince === 'function' ? findNearestProvince(G.navyNodes[nodeId].lon, G.navyNodes[nodeId].lat) : null;
                        if (seaPos && bestProv) {
                            let divName = generateUnitName(co, 'submarine');
                            let _sub = {
                                id: G.divIdCounter++, name: divName,
                                type: 'submarine', province: bestProv, country: co,
                                rx: seaPos[0], ry: seaPos[1],
                                state: 'idle', targetX: null, targetY: null,
                                attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
                                fireCooldown: 0, maxFireCd: 0, exp: 0,
                                submerged: false,
                            };
                            let ut = UNIT_TYPES.submarine;
                            _sub.maxStrength = ut.maxStr; _sub.strength = ut.maxStr;
                            G.divisions.push(_sub);
                            cd.treasury -= 350; cd.manpower -= 3;
                            if (cd) cd.divCount = (cd.divCount || 0) + 1;
                        }
                    } else {
                        let ship = createShip(nodeId, co);
                        if (ship) {
                            let seaPos = typeof findSeaPosition === 'function' ? findSeaPosition(G.navyNodes[nodeId].lon, G.navyNodes[nodeId].lat) : null;
                            let bestProv = typeof findNearestProvince === 'function' ? findNearestProvince(G.navyNodes[nodeId].lon, G.navyNodes[nodeId].lat) : null;
                            if (seaPos && bestProv) {
                                let divName = generateUnitName(co, 'navy') + ' ' + ship.name;
                                let _div = {
                                    id: G.divIdCounter++, name: divName,
                                    type: 'navy', province: bestProv, country: co,
                                    rx: seaPos[0], ry: seaPos[1],
                                    state: 'idle', targetX: null, targetY: null,
                                    attackTarget: null, focusTarget: null, focusFactory: null, focusCity: null,
                                    fireCooldown: 0, maxFireCd: 0, exp: 0,
                                    shipId: ship.id,
                                };
                                if (typeof applyNavyShipStats === 'function') applyNavyShipStats(_div, ship);
                                G.divisions.push(_div);
                                cd.treasury -= 500;
                                cd.manpower -= 5;
                                if (cd) cd.divCount = (cd.divCount || 0) + 1;
                            }
                        }
                    }
                }
            }
            // AI 升级海军节点
            if (cd.treasury > 800 && Math.random() < 0.05) {
                for (let nid of myNodes) {
                    let node = G.navyNodes[nid];
                    if (node.upgradeTimer > 0) continue;
                    let nextLv = null;
                    for (let nl of (typeof NODE_LEVELS !== 'undefined' ? NODE_LEVELS : [])) {
                        if (nl.level === node.level + 1) { nextLv = nl; break; }
                    }
                    if (nextLv && cd.treasury >= nextLv.upgradeCost) {
                        cd.treasury -= nextLv.upgradeCost;
                        node.upgradeTimer = nextLv.upgradeTime;
                        node.upgradeProgress = 0;
                        break;
                    }
                }
            }
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

    // === 城市驻防：每个边境城市保持至少1个师的驻军 ===
    if (pers.fortify > 0.2 && G.cities) {
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner !== co || ct.isCapital) continue;
            let isBorderCity = false;
            for (let pid in G.provinceData) {
                let pd = G.provinceData[pid];
                if (pd.country === co || !pd.center) continue;
                if (Math.hypot(pd.center[0] - ct.lon, pd.center[1] - ct.lat) < 2.0) { isBorderCity = true; break; }
            }
            if (!isBorderCity) continue;
            let nearbyDefenders = G.divisions.filter(d =>
                d.country === co && d.strength > 0 &&
                Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5
            ).length;
            let neededGarrison = Math.min(2, Math.ceil(cd.divCount * 0.05));
            if (nearbyDefenders >= neededGarrison) continue;
            let idleUnit = null;
            for (let d of G.divisions) {
                if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id]) {
                    idleUnit = d; break;
                }
            }
            if (idleUnit) {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(idleUnit, ct.lon, ct.lat);
                else { idleUnit.state = 'moving'; idleUnit.targetX = ct.lon; idleUnit.targetY = ct.lat; }
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
                    if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id]) {
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
                }
            }
            return;
        }
    }

    // === 常规防御：调动空闲部队到敌人附近 ===
    if (enemyUnits.length === 0) return;
    let idleUnits = [];
    for (let d of G.divisions) {
        if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id]) {
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
                if (d.country === co && d.state === 'idle' && d.strength > 0 && !G.patrolTargets[d.id]) {
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

// ========== 5. AI攻击移动 ==========
function aiAttackMovement(allCountries) {
    let cityLossCache = {};
    let enemyCityCache = {};
    let alliedCache = {};
    let frontTargetCache = {}; // frontTargetCache[co] = [{lon,lat}, ...] 进攻方向目标

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
        let enemyCities = [];
        if (atWarList.length > 0) {
            let allySet = new Set();
            if (G.alliances && G.alliances[co]) {
                for (let ally in G.alliances[co]) allySet.add(ally);
            }
            alliedCache[co] = allySet;
            enemyCities = [];
            for (let cid in G.cities) {
                let ct = G.cities[cid];
                if (!ct || ct.hp <= 0 || ct.owner === co || ct.owner === G.playerCountry) continue;
                if (!atWarList.includes(ct.owner)) continue;
                if (allySet.has(ct.owner)) continue;
                enemyCities.push(ct);
            }
            enemyCityCache[co] = enemyCities;
        }
        // 计算进攻方向目标
        let frontTargets = [];
        if (atWarList.length > 0) {
            let strategy = typeof getStrategy === 'function' ? getStrategy(co) : null;
            if (strategy && strategy.theaterPlans) {
                for (let tp of strategy.theaterPlans) {
                    if (tp.targetCities) {
                        for (let tc of tp.targetCities) {
                            frontTargets.push({ lon: tc.lon, lat: tc.lat });
                        }
                    }
                }
            }
            if (frontTargets.length === 0) {
                let myProvs = getCountryProvinces ? getCountryProvinces(co) : [];
                for (let p of myProvs) {
                    if (!p.center) continue;
                    for (let pid in G.provinceData) {
                        let np = G.provinceData[pid];
                        if (!np.center || !atWarList.includes(np.country)) continue;
                        if (Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 2.0) {
                            frontTargets.push({ lon: np.center[0] + (Math.random() - 0.5) * 0.3, lat: np.center[1] + (Math.random() - 0.5) * 0.3 });
                            break;
                        }
                    }
                }
            }
            if (frontTargets.length === 0 && enemyCities.length > 0) {
                for (let ec of enemyCities) {
                    frontTargets.push({ lon: ec.lon, lat: ec.lat });
                }
            }
        }
        frontTargetCache[co] = frontTargets;
    }

    for (let d of G.divisions) {
        if (d.state === 'moving' || d.state === 'retreating' || d.strength <= 0) continue;
        if (d.country === G.playerCountry) continue;
        if ((typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) continue;

        let co = d.country;
        let atWarWithList = getEnemiesOf(co);
        if (atWarWithList.length === 0) continue;

        // ====== 海军/潜艇 AI ======
        if (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') {
            let acted = false;
            let hpRatio = d.strength / (d.maxStrength || (d.type === 'submarine' ? 200 : 500));
            if (!acted && hpRatio < 0.3 && G.navyNodes) {
                let bestNode = null, bestDist = Infinity;
                for (let nid in G.navyNodes) {
                    let node = G.navyNodes[nid];
                    if (node.country !== co) continue;
                    let dist = Math.hypot(node.lon - d.rx, node.lat - d.ry);
                    if (dist < bestDist) { bestDist = dist; bestNode = node; }
                }
                if (bestNode) {
                    let nw = typeof nearestWater === 'function' ? nearestWater(bestNode.lon, bestNode.lat) : null;
                    if (nw) { aiMoveTo(d, nw[0], nw[1]); acted = true; }
                }
            }
            if (!acted) {
                let enemyNavy = null, bestNavyDist = Infinity;
                for (let e of G.divisions) {
                    if ((typeof isSeaType === 'function' ? !isSeaType(e.type) : e.type !== 'navy') || e.country === co || e.strength <= 0 || e.submerged) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    if (G.navyNodes) {
                        let inNode = false;
                        for (let nid in G.navyNodes) {
                            let node = G.navyNodes[nid];
                            if (node.country === e.country && Math.hypot(node.lon - e.rx, node.lat - e.ry) < (node.healRadius || 0.15) * 3) {
                                inNode = true; break;
                            }
                        }
                        if (inNode) continue;
                    }
                    let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
                    if (dx > 20 || dy > 20) continue;
                    let dist = Math.hypot(dx, dy);
                    if (dist < bestNavyDist) { enemyNavy = e; bestNavyDist = dist; }
                }
                if (enemyNavy) {
                    let ut = UNIT_TYPES[d.type] || UNIT_TYPES.navy;
                    if (bestNavyDist > ut.range * 0.85) aiMoveToEnemy(d, enemyNavy);
                    acted = true;
                }
            }
            if (!acted) {
                let cityTarget = null, bestCityDist = Infinity;
                let enemyCities = enemyCityCache[co];
                if (enemyCities) {
                    for (let ct of enemyCities) {
                        let dx = Math.abs(d.rx - ct.lon), dy = Math.abs(d.ry - ct.lat);
                        if (dx > 15 || dy > 15) continue;
                        let dist = Math.hypot(dx, dy);
                        if (dist < bestCityDist) { cityTarget = ct; bestCityDist = dist; }
                    }
                }
                if (cityTarget) {
                    let ut = UNIT_TYPES[d.type] || UNIT_TYPES.navy;
                    let desiredDist = ut.range * 0.85;
                    let dx = cityTarget.lon - d.rx, dy = cityTarget.lat - d.ry;
                    let dist = Math.hypot(dx, dy);
                    if (dist > desiredDist) {
                        let tx = d.rx + (dx / dist) * (dist - desiredDist);
                        let ty = d.ry + (dy / dist) * (dist - desiredDist);
                        if (!isLandPoint(tx, ty)) { aiMoveTo(d, tx, ty); acted = true; }
                        else {
                            let nw = nearestWater(cityTarget.lon, cityTarget.lat);
                            if (nw) { aiMoveTo(d, nw[0], nw[1]); acted = true; }
                        }
                    } else { acted = true; }
                }
            }
            if (!acted) {
                let fallbackTarget = null, fallbackDist = Infinity;
                for (let e of G.divisions) {
                    if (e.country === co || e.strength <= 0) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    let dist = Math.hypot(e.rx - d.rx, e.ry - d.ry);
                    if (dist < fallbackDist) { fallbackTarget = e; fallbackDist = dist; }
                }
                if (fallbackTarget && fallbackDist > 5 && Math.random() < 0.04) {
                    let tx = fallbackTarget.rx, ty = fallbackTarget.ry;
                    if (isLandPoint(tx, ty)) {
                        let nw = nearestWater(tx, ty);
                        if (nw) { tx = nw[0]; ty = nw[1]; }
                    }
                    aiMoveTo(d, tx, ty); acted = true;
                }
            }
            if (acted) continue;
        }

        let pers = getPersonality(co);
        let defensiveMode = cityLossCache[co] > 0.3;

        if (defensiveMode) {
            let myProvinceCenters = getCountryProvinces(co).filter(p => p.center).map(p => p.center);
            let homeEnemy = null, bestHomeDist = 999;
            for (let e of G.divisions) {
                if (e.country === co || e.strength <= 0) continue;
                if (!atWarWithList.includes(e.country)) continue;
                let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
                if (dx > 8 || dy > 8) continue;
                let dist = Math.hypot(dx, dy);
                if (dist >= bestHomeDist) continue;
                let isInMyLand = myProvinceCenters.some(ctr => {
                    let cdx = Math.abs(e.rx - ctr[0]), cdy = Math.abs(e.ry - ctr[1]);
                    return cdx <= 1.5 && cdy <= 1.5 && cdx*cdx + cdy*cdy < 2.25;
                });
                if (isInMyLand) { homeEnemy = e; bestHomeDist = dist; }
            }
            if (homeEnemy && bestHomeDist < 8) {
                let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                let desiredDist = ut.range * 0.85;
                let dx = homeEnemy.rx - d.rx, dy = homeEnemy.ry - d.ry;
                let dist = Math.hypot(dx, dy);
                d.state = "moving";
                d.targetX = d.rx + (dx / dist) * (dist - desiredDist);
                d.targetY = d.ry + (dy / dist) * (dist - desiredDist);
                continue;
            }
        }

        // == 攻城/交火/进军 三阶段目标选择 ==
        // 0. 炮兵优先攻城（西线加强）
        let enemyCities = enemyCityCache[co];
        if (d.type === 'artillery' && enemyCities && enemyCities.length > 0) {
            let bestCity = null, bestCityD = 999;
            for (let ct of enemyCities) {
                let dx = Math.abs(d.rx - ct.lon), dy = Math.abs(d.ry - ct.lat);
                if (dx > 25 || dy > 25) continue;
                let dist = Math.hypot(dx, dy);
                if (dist < bestCityD) { bestCity = ct; bestCityD = dist; }
            }
            if (bestCity) {
                d.focusCity = bestCity.id;
                let dx = bestCity.lon - d.rx, dy = bestCity.lat - d.ry;
                let dist = Math.hypot(dx, dy);
                let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                let desiredDist = ut.range * 0.85;
                if (dist > desiredDist) {
                    let tx = d.rx + (dx / dist) * (dist - desiredDist);
                    let ty = d.ry + (dy / dist) * (dist - desiredDist);
                    if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                    else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
                }
                continue;
            }
        }

        // 0.5 低血量城市抢占（评估守军）
        if (enemyCities) {
            let rushTarget = null, rushScore = 999;
            for (let ct of enemyCities) {
                let dx = Math.abs(d.rx - ct.lon), dy = Math.abs(d.ry - ct.lat);
                if (dx > 15 || dy > 15) continue;
                let dist = Math.hypot(dx, dy);
                if (dist > rushScore) continue;
                let cData = G.cities[ct.id];
                if (!cData || cData.hp <= 0) continue;
                let hpRatio = cData.hp / cData.maxHp;
                if (hpRatio > 0.2) continue;
                // 检查守军
                let defenders = 0;
                for (let e of G.divisions) {
                    if (e.country === ct.owner && e.strength > 0 && Math.hypot(ct.lon - (e.rx||0), ct.lat - (e.ry||0)) < 1.0) defenders++;
                }
                if (defenders > 3) continue;
                rushTarget = ct; rushScore = dist;
            }
            if (rushTarget) {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, rushTarget.lon, rushTarget.lat);
                else { d.state = "moving"; d.targetX = rushTarget.lon; d.targetY = rushTarget.lat; }
                continue;
            }
        }

        // 1. 攻城：附近有敌方城市
        let targetCity = null, bestCityScore = 999;
        if (enemyCities) {
            let strategy = typeof getStrategy === 'function' ? getStrategy(co) : null;
            let theaterTargetIds = new Set();
            if (strategy && strategy.theaterPlans) {
                for (let tp of strategy.theaterPlans) {
                    if (tp.targetCities) {
                        for (let tc of tp.targetCities) { theaterTargetIds.add(tc.id); }
                    }
                }
            }
            for (let ct of enemyCities) {
                let dx = Math.abs(d.rx - ct.lon), dy = Math.abs(d.ry - ct.lat);
                if (dx > 20 || dy > 20) continue;
                let dist = Math.hypot(dx, dy);
                let score = dist;
                if (ct.isCapital) score -= 8;
                else if (isMajorCity(ct.id)) {
                    let cf = typeof CITY_FACTORIES !== 'undefined' ? (CITY_FACTORIES[ct.id] || 0) : 0;
                    score -= 4 + cf * 2;
                }
                for (let pid in G.provinceData) {
                    let pd = G.provinceData[pid];
                    if (pd.country === co && pd.center && Math.hypot(pd.center[0] - ct.lon, pd.center[1] - ct.lat) < 1.5) {
                        score -= 2; break;
                    }
                }
                if (theaterTargetIds.has(ct.id)) score -= 5;
                if (d.type === 'artillery') score -= 3;
                if (score < bestCityScore) { targetCity = ct; bestCityScore = score; }
            }
        }

        if (targetCity && bestCityScore < 20) {
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            d.focusCity = targetCity.id;
            let dx = targetCity.lon - d.rx, dy = targetCity.lat - d.ry;
            let dist = Math.hypot(dx, dy);
            if (dist > ut.range) {
                let desiredDist = ut.range * 0.85;
                let tx = d.rx + (dx / dist) * (dist - desiredDist);
                let ty = d.ry + (dy / dist) * (dist - desiredDist);
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
            } else {
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, targetCity.lon, targetCity.lat);
                else { d.state = "moving"; d.targetX = targetCity.lon; d.targetY = targetCity.lat; }
            }
            continue;
        }

        // 2. 交火：附近有敌方单位
        let target = null, bestDist = 999;
        let isAH = co === 'AUSTRIA_HUNGARY';
        let isFR = co === 'FRANCE';
        for (let e of G.divisions) {
            if (e.country === co || e.strength <= 0) continue;
            if (!atWarWithList.includes(e.country)) continue;
            let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
            if (dx > 10 || dy > 10) continue;
            let dist = Math.hypot(dx, dy);
            if (isAH && e.country === 'RUSSIA') dist *= 0.5;
            if (isFR) {
                if (e.country === 'GERMANY') dist *= 0.4;
                else dist *= 2.0;
            }
            if (dist < bestDist) { target = e; bestDist = dist; }
        }
        if (target) {
            let engageRate = defensiveMode ? pers.aggression * 0.3 : pers.aggression * 0.5;
            if (co === 'FRANCE' || co === 'UK') engageRate = defensiveMode ? 0.25 : 0.35;
            if (bestDist < 8 && Math.random() < engageRate) {
                let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                let desiredDist = ut.range * 0.9;
                let dx = target.rx - d.rx, dy = target.ry - d.ry;
                let dist = Math.hypot(dx, dy);
                let tx = d.rx + (dx / dist) * (dist - desiredDist);
                let ty = d.ry + (dy / dist) * (dist - desiredDist);
                if (typeof aiMoveToEnemy === 'function') aiMoveToEnemy(d, target);
                else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
                continue;
            }
            if (bestDist > 10 && Math.random() < 0.04) {
                let tx = target.rx, ty = target.ry;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
                continue;
            }
        }

        // 3. 进军：无目标时向敌方边境/战区目标前进
        let frontTargets = frontTargetCache[co];
        if (frontTargets && frontTargets.length > 0) {
            let bestFront = null, bestFrontDist = 999;
            for (let ft of frontTargets) {
                let dx = Math.abs(d.rx - ft.lon), dy = Math.abs(d.ry - ft.lat);
                if (dx > 50 || dy > 50) continue;
                let dist = Math.hypot(dx, dy);
                if (dist < bestFrontDist) { bestFront = ft; bestFrontDist = dist; }
            }
            if (bestFront) {
                let tx = bestFront.lon + (Math.random() - 0.5) * 0.5;
                let ty = bestFront.lat + (Math.random() - 0.5) * 0.5;
                if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
                else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
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
function updateAIOccupation() {
    let allCountries = Object.keys(G.countries).filter(c =>
        c !== G.playerCountry &&
        G.countries[c].treasury !== undefined && !G.surrendered[c]
    );

    for (let co of allCountries) {
        let idleUnits = G.divisions.filter(d =>
            d.country === co && d.strength > 0 &&
            d.state !== 'moving' &&
            !G.patrolTargets[d.id]
        );
        if (idleUnits.length < 2) continue;

        let ownedProvIds = Object.values(G.provinceData)
            .filter(p => p.country === co && p.center)
            .map(p => p.id);

        let targetable = [];
        for (let pid of ownedProvIds) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center) continue;
            let nearbyProvs = Object.values(G.provinceData).filter(p =>
                p.country !== co && p.center &&
                Math.hypot(p.center[0] - pd.center[0], p.center[1] - pd.center[1]) < 3 &&
                isAtWarWith(co, p.country)
            );
            for (let np of nearbyProvs) {
                if (targetable.some(t => t.id === np.id)) continue;
                let enemyPresent = G.divisions.some(d =>
                    d.country !== co && d.strength > 0 &&
                    isAtWarWith(co, d.country) &&
                    d.province === np.id
                );
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