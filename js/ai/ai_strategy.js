// === AI 战略层：目标选择、战区规划、经济优先级 ===

// 战略目标
const STRATEGY_BLITZ = 'BLITZ';           // 速攻决战
const STRATEGY_TOTAL_WAR = 'TOTAL_WAR';   // 总体战
const STRATEGY_DEFENSIVE = 'DEFENSIVE';   // 固守待机
const STRATEGY_ECONOMIC = 'ECONOMIC';     // 经济发展
const STRATEGY_NAVAL = 'NAVAL';           // 海上争霸
const STRATEGY_BALANCE = 'BALANCE';       // 均衡发展

const DEFAULT_STRATEGY = {
    GERMANY:{p:STRATEGY_ECONOMIC,w:STRATEGY_BLITZ,ws:365,wt:STRATEGY_TOTAL_WAR},
    FRANCE:{p:STRATEGY_DEFENSIVE,w:STRATEGY_DEFENSIVE,ws:180,wt:STRATEGY_TOTAL_WAR},
    UK:{p:STRATEGY_NAVAL,w:STRATEGY_NAVAL,ws:365,wt:STRATEGY_TOTAL_WAR},
    RUSSIA:{p:STRATEGY_BALANCE,w:STRATEGY_BLITZ,ws:200,wt:STRATEGY_DEFENSIVE},
    AUSTRIA_HUNGARY:{p:STRATEGY_BALANCE,w:STRATEGY_BLITZ,ws:150,wt:STRATEGY_DEFENSIVE},
    ITALY:{p:STRATEGY_ECONOMIC,w:STRATEGY_DEFENSIVE,ws:200,wt:STRATEGY_BALANCE},
    TURKEY:{p:STRATEGY_ECONOMIC,w:STRATEGY_DEFENSIVE,ws:300,wt:STRATEGY_DEFENSIVE},
};

const DEFAULT_STRATEGY_CONFIG = {p:STRATEGY_ECONOMIC,w:STRATEGY_DEFENSIVE};

const STRATEGY_ALLOC = {};
STRATEGY_ALLOC[STRATEGY_BLITZ]={fb:0.3,ms:1.0,cu:0.2,ns:0.1,rr:0.10};
STRATEGY_ALLOC[STRATEGY_TOTAL_WAR]={fb:0.6,ms:0.8,cu:0.3,ns:0.3,rr:0.15};
STRATEGY_ALLOC[STRATEGY_DEFENSIVE]={fb:0.5,ms:0.6,cu:0.6,ns:0.4,rr:0.20};
STRATEGY_ALLOC[STRATEGY_ECONOMIC]={fb:1.0,ms:0.2,cu:0.8,ns:0.3,rr:0.30};
STRATEGY_ALLOC[STRATEGY_NAVAL]={fb:0.4,ms:0.5,cu:0.3,ns:1.0,rr:0.15};
STRATEGY_ALLOC[STRATEGY_BALANCE]={fb:0.6,ms:0.5,cu:0.5,ns:0.3,rr:0.15};

// 获取国家当前战略
function getStrategy(country) {
    if (!G._aiStrategy) G._aiStrategy = {};
    if (!G._aiStrategy[country]) {
        G._aiStrategy[country] = {goal:STRATEGY_ECONOMIC,theaterPlan:{},lastTick:0};
    }
    return G._aiStrategy[country];
}

// 重新评估战略
function reevaluateStrategy(country) {
    let pers = typeof getPersonality === 'function' ? getPersonality(country) : null;
    if (!pers) return;
    let cData = G.countries[country];
    if (!cData) return;
    let atWar = isCountryAtWar(country);
    let ds = DEFAULT_STRATEGY[country] || DEFAULT_STRATEGY_CONFIG;
    let goal = ds.p;
    if (atWar) {
        goal = ds.w;
        let dur = getWarDuration(country);
        if (ds.ws && dur > ds.ws && ds.wt) goal = ds.wt;
        let loss = getCityLossRatio(country);
        if (loss > 0.4) goal = STRATEGY_DEFENSIVE;
        if (isCapitalLost(country)) goal = STRATEGY_DEFENSIVE;
        let md = cData.divCount || 0;
        let ed = getTotalEnemyDivs(country);
        if (ed > 0 && md / ed > 2.5 && goal === STRATEGY_DEFENSIVE) goal = STRATEGY_TOTAL_WAR;
    }
    if (atWar && !G._warStartDates) G._warStartDates = {};
    if (atWar && !G._warStartDates[country]) G._warStartDates[country] = new Date(G.date);
    let strat = getStrategy(country);
    strat.goal = goal;
    strat.lastTick = G.tick || 0;
    strat.alloc = STRATEGY_ALLOC[goal] || STRATEGY_ALLOC[STRATEGY_BALANCE];
    strat.theaterPlan = generateTheaterPlan(country, goal);
    return strat;
}

function getCityLossRatio(country) {
    let t = 0, l = 0;
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.originalOwner !== country) continue;
        t++;
        if (ct.owner !== country) l++;
    }
    return t > 0 ? l / t : 0;
}

function isCapitalLost(country) {
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.isCapital && ct.originalOwner === country && ct.owner !== country) return true;
    }
    return false;
}

function getWarDuration(country) {
    if (!G._warStartDates || !G._warStartDates[country] || !G.date) return 0;
    return (G.date.getTime() - G._warStartDates[country].getTime()) / 86400000;
}

function getTotalEnemyDivs(country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let t = 0;
    for (let e of enemies) {
        let cd = G.countries[e];
        if (cd) t += cd.divCount || 0;
    }
    return t;
}

// 战区定义
const THEATER_DEFS = {
    WESTERN:{name:'西线',cos:['GERMANY','FRANCE','BELGIUM','NETHERLANDS','UK']},
    EASTERN:{name:'东线',cos:['GERMANY','RUSSIA','AUSTRIA_HUNGARY']},
    ITALIAN:{name:'意大利',cos:['ITALY','AUSTRIA_HUNGARY']},
    BALKAN:{name:'巴尔干',cos:['AUSTRIA_HUNGARY','SERBIA','MONTENEGRO','BULGARIA','ROMANIA','GREECE','TURKEY']},
    MIDDLE_EAST:{name:'中东',cos:['TURKEY','UK','RUSSIA']},
    NORTH_SEA:{name:'北海',cos:['GERMANY','UK','BELGIUM','NETHERLANDS','DENMARK','NORWAY']},
    MEDITERRANEAN:{name:'地中海',cos:['UK','FRANCE','ITALY','AUSTRIA_HUNGARY','SPAIN','GREECE','TURKEY']},
    BALTIC:{name:'波罗的海',cos:['GERMANY','RUSSIA','SWEDEN','DENMARK','FINLAND']},
};

function generateTheaterPlan(country, goal) {
    let plan = {};
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    for (let tk in THEATER_DEFS) {
        let th = THEATER_DEFS[tk];
        if (!th.cos.includes(country)) continue;
        let hasEnemy = enemies.some(e => th.cos.includes(e));
        let priority = 0;
        let str = 'DEFENSIVE';
        if (hasEnemy) {
            priority = 0.5;
            let ed = 0;
            for (let e of enemies) {
                if (th.cos.includes(e)) {
                    let cd = G.countries[e];
                    if (cd) ed += cd.divCount || 0;
                }
            }
            if (ed > 0) priority = Math.min(1.0, 0.3 + ed * 0.01);
            if (goal === STRATEGY_BLITZ || goal === STRATEGY_TOTAL_WAR) {
                str = priority > 0.6 ? 'OFFENSIVE' : 'DEFENSIVE';
            } else if (goal === STRATEGY_DEFENSIVE) {
                str = 'DEFENSIVE';
            } else {
                str = priority > 0.7 ? 'OFFENSIVE' : 'DEFENSIVE';
            }
        }
        plan[tk] = {priority:priority,strategy:str,targetPercent:0};
    }
    let totalP = 0;
    for (let tk in plan) totalP += plan[tk].priority;
    if (totalP > 0) {
        for (let tk in plan) plan[tk].targetPercent = plan[tk].priority / totalP;
    }
    plan.HOME = {priority:0.3,strategy:'GARRISON',targetPercent:Math.max(0.1,1-totalP)};
    return plan;
}

// === 经济优先级 ===

function getFactoryScore(pid, country) {
    let pd = G.provinceData[pid];
    if (!pd || !pd.center || pd.country !== country) return -1;
    if ((pd.factories || 0) >= 3) return -1;
    let score = (pd.income || 0.3) * 20 + (3 - (pd.factories || 0)) * 5;
    let city = getProvinceMainCity(pid);
    if (city) {
        if (city.isCapital) score += 20;
        else if (isMajorCity(city.id)) score += 15;
    }
    let dist = getMinEnemyDistToPoint(pd.center[0], pd.center[1], country);
    if (dist < 2) score -= 15;
    else if (dist < 5) score -= 5;
    return score;
}

function getProvinceMainCity(pid) {
    for (let cid in G.cities) {
        let ct = G.cities[cid];
        if (ct.provinceId === pid) return ct;
    }
    return null;
}

function getCityUpgradeScore(city) {
    if (!city || city.isCapital || isMajorCity(city.id)) return -1;
    let cData = G.cities[city.id];
    if (!cData || cData.owner !== (cData.originalOwner || cData.owner)) return -1;
    let score = 0;
    if (isBorderCity(city)) score += 20;
    let cf = typeof CITY_FACTORIES !== 'undefined' ? (CITY_FACTORIES[city.id] || 0) : 0;
    score += cf * 10;
    return score;
}

function isBorderCity(city) {
    let pid = null;
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        if (isPointInPolygon(city.lon, city.lat, p.r)) { pid = p.id; break; }
    }
    if (!pid) return false;
    let adj = PROVINCE_ADJ ? PROVINCE_ADJ[pid] : null;
    if (!adj) return false;
    for (let ap of adj) {
        if (G.provinceOwners[ap] && G.provinceOwners[ap] !== city.owner) return true;
    }
    return false;
}

function getMinEnemyDistToPoint(lon, lat, country) {
    let enemies = typeof getEnemiesOf === 'function' ? getEnemiesOf(country) : [];
    let md = 999;
    for (let d of G.divisions) {
        if (d.strength <= 0 || !enemies.includes(d.country)) continue;
        let dist = Math.hypot(d.rx - lon, d.ry - lat);
        if (dist < md) md = dist;
    }
    return md;
}
