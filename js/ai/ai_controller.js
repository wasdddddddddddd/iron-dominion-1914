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

    for (let co of allCountries) {
        let cd = cs[co]; if (!cd) continue;
        let pers = getPersonality(co);

        // ========== 1. 经济运营 ==========
        aiEconomy(co, cd, pers);

        // ========== 2. 生产工厂军队 ==========
        aiProduction(co, cd, pers);

        // ========== 3. 外交策略 ==========
        aiDiplomacy(co, cd, pers, allCountries);

        // ========== 4. 应对入侵 ==========
        aiDefenseResponse(co, cd, pers);
    }

    // ========== 5. AI 攻击移动 ==========
    aiAttackMovement(allCountries);

    // ========== 6. AI 求和 ==========
    aiPeaceSeeking(allCountries);
}

// ========== 1. 经济运营 ==========
function aiEconomy(co, cd, pers) {
    let atWar = isCountryAtWar(co);
    let income = calcCountryIncome(co);

    // 战时工厂建造：钱多就多造
    let provs = getCountryProvinces(co).filter(p => p.factories < 3 && p.center);
    let buildChance = atWar ? (pers.economy * 0.35) : (pers.economy * 0.12);
    // 国库充裕时大幅提高建造概率
    if (cd.treasury > 500) buildChance = Math.min(0.95, buildChance * 2.5);
    else if (cd.treasury > 300) buildChance = Math.min(0.80, buildChance * 1.8);

    if (cd.treasury > 80 && provs.length > 0 && Math.random() < buildChance) {
        let prov = provs[Math.floor(Math.random() * provs.length)];
        let city = null;
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.provinceId === prov.id && ct.owner === co) { city = ct; break; }
        }
        if (city) {
            cd.treasury -= 50;
            if (!G.buildQueue) G.buildQueue = [];
            G.buildQueue.push({ type: 'factory', province: prov.id, days: 10, totalDays: 10, cityId: city.id, cityLon: city.lon, cityLat: city.lat });
        }
    }

    // 升级小城市：AI 大城市没用，极大降低优先级
    let upgradeChance = atWar ? (pers.economy * 0.01) : (pers.economy * 0.015);
    if (cd.treasury > 1500) upgradeChance = Math.min(0.3, upgradeChance * 2);
    else if (cd.treasury > 1000) upgradeChance = Math.min(0.15, upgradeChance * 1.5);

    if (cd.treasury > 800 && Math.random() < upgradeChance) {
        let smallCities = [];
        for (let cid in G.cities) {
            let ct = G.cities[cid];
            if (ct.owner === co && !isMajorCity(ct.id) && !ct.occupierFlag) {
                smallCities.push(ct);
            }
        }
        if (smallCities.length > 0) {
            let city = smallCities[Math.floor(Math.random() * smallCities.length)];
            cd.treasury -= 150;
            if (!G.buildQueue) G.buildQueue = [];
            G.buildQueue.push({ type: 'upgrade_city', province: city.provinceId, days: 40, totalDays: 40, cityId: city.id, cityLon: city.lon, cityLat: city.lat, cityName: city.name });
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

        // 计算目标兵力构成
        let infantryRatio = atWar ? 0.35 : 0.5;
        let engineerRatio = 0.15;
        let cavalryRatio = pers.preferCavalry * 0.3;
        let artilleryRatio = pers.preferArtillery * 0.4;

        if (atWar) {
            artilleryRatio += 0.20;
            engineerRatio += 0.05;
        }

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

        let type = 'infantry';
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
        createDivision(prov.id, co, type);
    }
}

// ========== 3. 外交策略 ==========
function aiDiplomacy(co, cd, pers, allCountries) {
    if (Math.random() > 0.25) return; // 降低外交频率
    let atWar = isCountryAtWar(co);
    let atWarWithList = getEnemiesOf(co);

    // 计算当前同盟数量
    let currentAllies = 0;
    if (G.alliances && G.alliances[co]) {
        currentAllies = Object.keys(G.alliances[co]).length;
    }

    for (let other of allCountries) {
        if (other === co) continue;
        if (G.surrendered[other]) continue;
        let isGreatPowerOther = isGreatPower(other);

        // === 宣战逻辑 ===
        if (!atWar && !areAtWar(co, other) && pers.aggression > 0.3) {
            let shouldDeclare = false;
            let otherCount = G.divisions.filter(d => d.country === other && d.strength > 0).length;
            // 计算目标及其同盟的总兵力
            let totalEnemyCount = otherCount;
            if (G.alliances && G.alliances[other]) {
                for (let ally in G.alliances[other]) {
                    totalEnemyCount += G.divisions.filter(d => d.country === ally && d.strength > 0).length;
                }
            }
            let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
            let powerRatio = myCount / Math.max(1, totalEnemyCount);

            // 边境接壤判定
            let borderProvs = getCountryProvinces(co).filter(p => {
                return Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 1.0
                );
            });

            // 目标有同盟列强 → 不敢打
            let hasGreatPowerAlly = false;
            if (G.alliances && G.alliances[other]) {
                for (let ally in G.alliances[other]) {
                    if (isGreatPower(ally)) { hasGreatPowerAlly = true; break; }
                }
            }

            if (!hasGreatPowerAlly && !isGreatPower(other)) {
                // 只能对邻国宣战：兵力3倍以上
                if (borderProvs.length > 0 && powerRatio > 3 && pers.expansionPower > 0.5 && Math.random() < pers.aggression * 0.04) {
                    shouldDeclare = true;
                }
                // 边境接壤：兵力2倍以上
                if (borderProvs.length > 0 && powerRatio > 2 && Math.random() < pers.aggression * 0.03) {
                    shouldDeclare = true;
                }
            }

            if (shouldDeclare) {
                declareWar(co, other);
                addGameLog((COUNTRY_CN[co] || co) + "向" + (COUNTRY_CN[other] || other) + "宣战！");
            }
        }

        // === 结盟逻辑（最多2个同盟，优先邻居） ===
        if (!areAtWar(co, other) && !G.alliances[co]?.[other] && !G.alliances[other]?.[co] && currentAllies < 2) {
            // 禁止跨阵营结盟：同盟国不能与协约国核心成员结盟
            let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY', 'BULGARIA', 'TURKEY'];
            let ententeCore = ['FRANCE', 'UK', 'RUSSIA', 'SERBIA'];
            let coIsCentral = centralCore.includes(co);
            let coIsEntente = ententeCore.includes(co);
            let otherIsCentral = centralCore.includes(other);
            let otherIsEntente = ententeCore.includes(other);
            if ((coIsCentral && otherIsEntente) || (coIsEntente && otherIsCentral)) continue;
            let shouldAlly = false;

            // 计算边境接壤
            let borderProvs = getCountryProvinces(co).filter(p => {
                return Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 1.0
                );
            });

            // 必须接壤或有共同敌人才考虑结盟
            let isNeighbor = borderProvs.length > 0;
            let commonEnemies = atWarWithList.filter(e => getEnemiesOf(other).includes(e));

            // 条件1：邻国且有共同敌人（最优先）
            if (isNeighbor && commonEnemies.length > 0 && Math.random() < pers.diplomacy * 0.25) {
                shouldAlly = true;
            }
            // 条件2：邻国且关系好（rel > 40）
            let rel = G.relations?.[co]?.[other] || 0;
            if (isNeighbor && rel > 40 && Math.random() < pers.diplomacy * 0.12) {
                shouldAlly = true;
            }
            // 条件3：弱国寻求邻国强国保护（必须接壤）
            if (!isGreatPower(co) && isGreatPowerOther && isNeighbor && cd.divCount < 10 && Math.random() < pers.diplomacy * 0.15) {
                shouldAlly = true;
            }

            if (shouldAlly) {
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
            // 强国保障弱国
            if (isGreatPower(co) && !isGreatPowerOther && cd.divCount > 15 && Math.random() < pers.diplomacy * 0.05) {
                shouldGuarantee = true;
            }
            // 邻国保障
            let borderProvs = getCountryProvinces(co).filter(p => {
                return Object.values(G.provinceData).some(np =>
                    np.country === other && np.center && p.center &&
                    Math.hypot(np.center[0] - p.center[0], np.center[1] - p.center[1]) < 0.8
                );
            });
            if (borderProvs.length > 0 && !isGreatPowerOther && pers.diplomacy > 0.5 && Math.random() < 0.08) {
                shouldGuarantee = true;
            }

            if (shouldGuarantee) {
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

    // 检测领土内的敌人 - 优化：先算bbox再检查，避免O(n*m)全扫描
    let myProvinceCenters = getCountryProvinces(co).filter(p => p.center).map(p => p.center);
    if (myProvinceCenters.length === 0) return;
    // 计算国土bbox
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
        // 快速bbox排除
        if (d.rx < minX || d.rx > maxX || d.ry < minY || d.ry > maxY) continue;
        for (let ctr of myProvinceCenters) {
            let dx = Math.abs(d.rx - ctr[0]), dy = Math.abs(d.ry - ctr[1]);
            if (dx > 1.5 || dy > 1.5) continue;
            if (dx*dx + dy*dy < 2.25) { enemyUnits.push(d); break; }
        }
    }

    if (enemyUnits.length === 0) return;

    // 动员防御：调动空闲部队到敌人附近
    let idleUnits = [];
    for (let d of G.divisions) {
        if (d.country === co && d.strength > 0 && d.state === 'idle' && !G.patrolTargets[d.id]) {
            idleUnits.push(d);
        }
    }

    // 按威胁程度排序敌人（奥匈优先应对俄国）
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

    // 边界巡逻：复用已找到的 enemyUnits 避免重复扫描
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

// ========== 5. AI攻击移动 ==========
function aiAttackMovement(allCountries) {
    // 预计算：每个国家的城市沦陷比例（避免每个师团重复计算）
    let cityLossCache = {};
    let enemyCityCache = {}; // 每个国家的敌对城市列表
    let alliedCache = {}; // 每个国家的同盟集合

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

        // 预计算敌对城市列表
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

    for (let d of G.divisions) {
        if (d.state === 'moving' || d.strength <= 0) continue;
        if (d.country === G.playerCountry) continue;
        if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(d.rx, d.ry)) continue;

        let co = d.country;
        let atWarWithList = getEnemiesOf(co);
        if (atWarWithList.length === 0) continue;

        // ====== 海军 AI：血量低→撤退，否则先打敌方海军，再沿岸支援 ======
        if (d.type === 'navy') {
            let acted = false;
            let hpRatio = d.strength / (d.maxStrength || 500);
            // 1) 血量 < 30% → 撤回最近海军节点
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

            // 2) 搜索敌方海军
            if (!acted) {
                let enemyNavy = null, bestNavyDist = Infinity;
                for (let e of G.divisions) {
                    if (e.type !== 'navy' || e.country === co || e.strength <= 0) continue;
                    if (!atWarWithList.includes(e.country)) continue;
                    let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
                    if (dx > 20 || dy > 20) continue;
                    let dist = Math.hypot(dx, dy);
                    if (dist < bestNavyDist) { enemyNavy = e; bestNavyDist = dist; }
                }
                if (enemyNavy) {
                    if (bestNavyDist > 2) aiMoveToEnemy(d, enemyNavy);
                    acted = true;
                }
            }

            // 3) 无敌方海军 → 沿岸轰炸
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

            // 4) 无事可做：随便找一个敌人单位靠近
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

            if (acted) continue; // 有动作才跳过陆战逻辑，否则交给下面的陆战判断
        }

        let pers = getPersonality(co);
        let defensiveMode = cityLossCache[co] > 0.3;

        if (defensiveMode) {
            // 防守模式：寻找本国领土内的敌人
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

        // 攻城模式：使用预计算的敌对城市列表
        let enemyCities = enemyCityCache[co];
        let targetCity = null, bestCityDist = 999;
        if (enemyCities) {
            let isAH = co === 'AUSTRIA_HUNGARY';
            let isGer = co === 'GERMANY';
            for (let ct of enemyCities) {
                let dx = Math.abs(d.rx - ct.lon), dy = Math.abs(d.ry - ct.lat);
                if (dx > 15 || dy > 15) continue;
                let dist = Math.hypot(dx, dy);
                let weight = 1.0;
                if (isAH && ct.owner === 'RUSSIA') weight = 0.5;
                if (isGer && (ct.owner === 'FRANCE' || ct.owner === 'BELGIUM' || ct.owner === 'NETHERLANDS')) weight = 0.7;
                let weightedDist = (isMajorCity(ct.id) ? dist * 1.5 : dist) * weight;
                if (weightedDist < bestCityDist) { targetCity = ct; bestCityDist = weightedDist; }
            }
        }

        if (targetCity && bestCityDist < 15) {
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

        // 找一个最近的敌人单位
        let target = null, bestDist = 999;
        let isAH = co === 'AUSTRIA_HUNGARY';
        for (let e of G.divisions) {
            if (e.country === co || e.strength <= 0) continue;
            if (!atWarWithList.includes(e.country)) continue;
            let dx = Math.abs(d.rx - e.rx), dy = Math.abs(d.ry - e.ry);
            if (dx > 10 || dy > 10) continue;
            let dist = Math.hypot(dx, dy);
            if (isAH && e.country === 'RUSSIA') dist *= 0.5;
            if (dist < bestDist) { target = e; bestDist = dist; }
        }
        if (!target) continue;

        let engageRate = defensiveMode ? pers.aggression * 0.3 : pers.aggression * 0.5;
        if (co === 'FRANCE' || co === 'UK') engageRate = defensiveMode ? 0.2 : 0.3;

        if (bestDist < 6 && Math.random() < engageRate) {
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            let desiredDist = ut.range * 0.9;
            let dx = target.rx - d.rx, dy = target.ry - d.ry;
            let dist = Math.hypot(dx, dy);
            let tx = d.rx + (dx / dist) * (dist - desiredDist);
            let ty = d.ry + (dy / dist) * (dist - desiredDist);
            if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(tx, ty)) continue;
            if (typeof aiMoveToEnemy === 'function') aiMoveToEnemy(d, target);
            else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
        }
        if (bestDist > 10 && Math.random() < 0.04) {
            let tx = target.rx, ty = target.ry;
            if (d.type === 'navy' && typeof isLandPoint === 'function' && isLandPoint(tx, ty)) {
                let angle = Math.random() * Math.PI * 2;
                tx = target.rx + Math.cos(angle) * 0.3;
                ty = target.ry + Math.sin(angle) * 0.3;
            }
            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(d, tx, ty);
            else { d.state = "moving"; d.targetX = tx; d.targetY = ty; }
        }
    }
}

// ========== 6. 求和 ==========
function aiPeaceSeeking(allCountries) {
    for (let co of allCountries) {
        if (!isCountryAtWar(co)) continue;
        if (G.surrendered[co] || isGreatPower(co)) continue;
        let enemies = getEnemiesOf(co);
        for (let enemy of enemies) {
            let wsDiff = getWarScoreDiff(co, enemy);
            let myCount = G.divisions.filter(d => d.country === co && d.strength > 0).length;
            if (wsDiff < -50 && myCount < 5 && Math.random() < 0.15) {
                let reparations = Math.min(Math.floor(Math.abs(wsDiff) * 1.5), Math.floor((G.countries[co]?.treasury || 0) * 0.5));
                makePeace(co, enemy, reparations);
                addGameLog((COUNTRY_CN[co] || co) + "因战况不利向" + (COUNTRY_CN[enemy] || enemy) + "求和并支付赔款");
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