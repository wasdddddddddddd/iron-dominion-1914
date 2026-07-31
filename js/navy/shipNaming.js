// === 舰船命名系统 ===
// 优先使用预设名，用完后以"首个预设名+罗马数字"递增

const ROMAN_NUMERALS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

function getGradeKey(gradeName) {
    for (let k in SHIP_GRADES) {
        if (SHIP_GRADES[k].name === gradeName) return k;
    }
    return 'T3';
}

function generateShipName(country, gradeName) {
    let gradeKey = getGradeKey(gradeName);
    let pool = (SHIP_NAMES[country] && SHIP_NAMES[country][gradeKey]) || [];
    if (pool.length === 0 && SHIP_NAMES.COMMON && SHIP_NAMES.COMMON[gradeKey]) {
        pool = SHIP_NAMES.COMMON[gradeKey];
    }
    let counterKey = country + '_' + gradeKey;
    if (!G.shipNameCounters) G.shipNameCounters = {};
    if (!G.shipNameCounters[counterKey]) G.shipNameCounters[counterKey] = { index: -1, used: [] };

    let state = G.shipNameCounters[counterKey];

    // 找第一个未使用的预设名
    for (let i = 0; i < pool.length; i++) {
        if (!state.used.includes(i)) {
            state.used.push(i);
            return pool[i];
        }
    }
    // 预设名用完 → 首个预设名 + 罗马数字
    let base = pool.length > 0 ? pool[0] : (gradeName + '舰');
    state.index++;
    let num = ROMAN_NUMERALS[state.index] || (state.index + 1);
    return base.replace('号', '') + num + '号';
}
