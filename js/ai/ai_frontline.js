// ============================================================
// Iron & Dominion 1914 — AI 前线城市系统 (ai_frontline.js)
// 职责：前线城市动态检测、中立城市自动占领、受威胁城市判定
// ============================================================

// —— 中立城市判定（独立于 ai_controller.js，避免循环依赖） ——
// 游戏里未参战国城市的 owner 是其国家代码（非 null）
function isNeutralCityAI(ct, co) {
    if (!ct || ct.hp <= 0) return false;
    if (ct.owner === co) return false;
    if (ct.owner === null || ct.owner === undefined) return true;
    if (G.playerCountry && ct.owner === G.playerCountry) return false;
    let atWar = typeof getEnemiesOf === 'function' ? getEnemiesOf(co) : [];
    if (atWar.includes(ct.owner)) return false;
    return true; // 未交战国家 = 中立
}

// —— 1. 前线城市判定 ——
// 满足任一：
//   ① 3° 半径内有敌国城市
//   ② 3° 半径内有敌国领土（provinceData 的 country ≠ 自己）
//   ③ 2.5° 半径内有敌方军事单位
//   ④ 和平时期：2° 内有接壤国家领土
function isFrontlineCityAI(city, country) {
    if (!city || city.owner !== country || city.hp <= 0) return false;
    
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    
    // ① 3° 内有敌国城市
    for (let cid in G.cities) {
        let ec = G.cities[cid];
        if (!ec || ec.hp <= 0 || ec.owner === country) continue;
        if (enemies.length > 0 && !enemies.includes(ec.owner)) continue;
        if (enemies.length === 0 && ec.owner === country) continue;
        if (Math.hypot(ec.lon - city.lon, ec.lat - city.lat) < 3.0) return true;
    }
    
    // ② 3° 内有敌国领土
    if (G.provinceData) {
        for (let pid in G.provinceData) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center || pd.country === country) continue;
            if (enemies.length > 0 && !enemies.includes(pd.country)) continue;
            if (Math.hypot(pd.center[0] - city.lon, pd.center[1] - city.lat) < 3.0) return true;
        }
    }
    
    // ③ 2.5° 内有敌方军事单位
    for (let d of G.divisions) {
        if (d.strength <= 0) continue;
        if (enemies.length > 0 && !enemies.includes(d.country)) continue;
        if (d.country === country) continue;
        if (Math.hypot(d.rx - city.lon, d.ry - city.lat) < 2.5) return true;
    }
    
    // ④ 和平时期：2° 内有接壤国家领土（视为前线）
    if (enemies.length === 0 && G.provinceData) {
        for (let pid in G.provinceData) {
            let pd = G.provinceData[pid];
            if (!pd || !pd.center || pd.country === country) continue;
            if (Math.hypot(pd.center[0] - city.lon, pd.center[1] - city.lat) < 2.0) return true;
        }
    }
    
    return false;
}

// —— 2. 获取某国所有前线城市（按威胁度排序） ——
function getFrontlineCitiesAI(country) {
    let result = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.owner !== country || ct.hp <= 0) continue;
        if (isFrontlineCityAI(ct, country)) {
            let threat = getCityThreatScore(ct, country);
            result.push({ city: ct, threat: threat });
        }
    }
    result.sort((a, b) => b.threat - a.threat);
    return result;
}

// —— 3. 计算城市威胁分 ——
function getCityThreatScore(city, country) {
    let score = 0;
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    
    // 城市价值
    if (city.isCapital) score += 1000;
    else if (typeof isMajorCity === 'function' && isMajorCity(city.id)) score += 300;
    else if (city.cityType === 'agri') score += 150;
    else score += 50;
    score += (city.factories || 0) * 40;
    
    // 敌军密度
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        let dist = Math.hypot(d.rx - city.lon, d.ry - city.lat);
        if (dist < 1.5) score += 60;
        else if (dist < 3.0) score += 20;
    }
    
    // 城市血量越低越紧急
    let hpRatio = (city.hp || 100) / (city.maxHp || 100);
    if (hpRatio < 0.3) score += 200;
    else if (hpRatio < 0.6) score += 80;
    
    return score;
}

// —— 4. 获取受攻击城市（HP < 100% 且有敌军在附近） ——
function getThreatenedCitiesAI(country) {
    let result = [];
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.owner !== country || ct.hp <= 0) continue;
        if ((ct.hp || 100) >= (ct.maxHp || 100)) continue; // 满血的不算受攻击
        let hasEnemyNear = false;
        for (let d of G.divisions) {
            if (d.strength <= 0 || !enemies.includes(d.country)) continue;
            if (Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.5) { hasEnemyNear = true; break; }
        }
        if (hasEnemyNear) result.push(ct);
    }
    return result;
}

// —— 5. 获取可占领的中立城市列表 ——
function getNeutralCitiesInRangeAI(country, maxDistDeg) {
    maxDistDeg = maxDistDeg || 3.5;
    let result = [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!isNeutralCityAI(ct, country)) continue;
        // 距己方最近城市的距离
        let nearMy = 999;
        for (let cid2 in G.cities) {
            let oc = G.cities[cid2];
            if (!oc || oc.hp <= 0 || oc.owner !== country) continue;
            let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
            if (d < nearMy) nearMy = d;
        }
        if (nearMy > maxDistDeg) continue;
        result.push({ city: ct, dist: nearMy });
    }
    result.sort((a, b) => a.dist - b.dist);
    return result;
}

// —— 6. 中立城市自动占领（半径 1.0°） ——
// 任何己方单位（非火炮非海军）进入中立城市 1.0° 半径，自动转向占领
function autoCaptureNeutralAI(country) {
    let neutralCities = getNeutralCitiesInRangeAI(country, 8.0); // 放宽范围，实际触发靠距离
    if (neutralCities.length === 0) return 0;
    
    let captured = 0;
    for (let nc of neutralCities) {
        // 找到 1.0° 内最近的己方空闲或移动中单位
        let bestUnit = null, bestDist = 999;
        for (let d of G.divisions) {
            if (d.country !== country || d.strength <= 0) continue;
            if (d.state === 'retreating') continue;
            if (d.type === 'artillery' || d.type === 'navy' || d.type === 'submarine') continue;
            if (d._aiTask === 'DEFEND_CITY' || d._aiTask === 'DEFEND_CAPITAL') continue; // 防守单位不调动
            let dd = Math.hypot(d.rx - nc.city.lon, d.ry - nc.city.lat);
            if (dd < 1.0 && dd < bestDist) { bestDist = dd; bestUnit = d; }
        }
        if (bestUnit && Math.hypot(bestUnit.rx - nc.city.lon, bestUnit.ry - nc.city.lat) > 0.3) {
            if (typeof aiMoveToTarget === 'function') aiMoveToTarget(bestUnit, nc.city.lon, nc.city.lat);
            else { bestUnit.state = 'moving'; bestUnit.targetX = nc.city.lon; bestUnit.targetY = nc.city.lat; }
            bestUnit._aiTask = 'ATTACK';
            bestUnit._aiTaskTarget = { lon: nc.city.lon, lat: nc.city.lat };
            bestUnit._aiTaskAge = 0;
            captured++;
        }
    }
    return captured;
}

// —— 7. 获取与和平邻国接壤的城市列表 ——
function getPeaceBorderCitiesAI(country) {
    let result = [];
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.owner !== country || ct.hp <= 0) continue;
        
        // 检查是否有接壤的非敌对国家
        let hasPeaceBorder = false;
        if (G.provinceData) {
            for (let pid in G.provinceData) {
                let pd = G.provinceData[pid];
                if (!pd || !pd.center || pd.country === country) continue;
                if (enemies.includes(pd.country)) continue; // 交战国的不是和平邻国
                if (Math.hypot(pd.center[0] - ct.lon, pd.center[1] - ct.lat) < 2.0) {
                    hasPeaceBorder = true; break;
                }
            }
        }
        if (hasPeaceBorder) result.push(ct);
    }
    return result;
}

// —— 8. 获取敌国战区城市（用于进攻目标选择） ——
function getEnemyCitiesAI(country) {
    let result = [];
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    if (enemies.length === 0) return result;
    
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (!ct || ct.hp <= 0 || !enemies.includes(ct.owner)) continue;
        
        // 距己方控制区最近距离
        let frontDist = 999;
        for (let cid2 in G.cities) {
            let oc = G.cities[cid2];
            if (!oc || oc.hp <= 0 || oc.owner !== country) continue;
            let d = Math.hypot(ct.lon - oc.lon, ct.lat - oc.lat);
            if (d < frontDist) frontDist = d;
        }
        
        // 守军数量
        let defenders = 0;
        for (let d of G.divisions) {
            if (d.strength > 0 && d.country === ct.owner && Math.hypot(d.rx - ct.lon, d.ry - ct.lat) < 1.0) defenders++;
        }
        
        // 评分
        let score = 0;
        if (ct.isCapital) score += 100;
        if (typeof isMajorCity === 'function' && isMajorCity(ct.id)) score += 50;
        if (frontDist < 2.0) score += 120;
        else if (frontDist < 4.0) score += 60;
        else if (frontDist < 6.0) score += 20;
        else score -= 30;
        
        let hpRatio = (ct.hp || 100) / (ct.maxHp || 100);
        if (hpRatio < 0.3) score += 80;
        else if (hpRatio < 0.5) score += 40;
        
        // 薄弱城市加成：守军少且近距离
        if (defenders === 0 && frontDist < 4.0) score += 90;
        else if (defenders <= 1 && frontDist < 3.0) score += 60;
        
        score -= defenders * 10;
        score += Math.max(0, 60 - frontDist * 8);
        
        result.push({ city: ct, score: score, defenders: defenders, frontDist: frontDist });
    }
    result.sort((a, b) => b.score - a.score);
    return result;
}
