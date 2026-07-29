// === 舰船等级定义 T1~T8 ===
// 属性为百分比修正值（如 speed: 0.12 表示 +12% 速度）

const SHIP_GRADES = {
    T1: { name: '朽坏',  color: '#888888', speed: -0.10, range: -0.10, fireRate: -0.10, power: -0.12, hp: -0.12, maneuver: 0.06 },
    T2: { name: '老旧',  color: '#8B7D3C', speed: -0.12, range:  0.06, fireRate: -0.12, power: -0.08, hp: -0.10, maneuver: -0.08 },
    T3: { name: '普通',  color: '#FFFFFF', speed:  0,     range:  0,    fireRate:  0,    power:  0,    hp:  0,    maneuver: 0 },
    T4: { name: '精锐',  color: '#4A90D9', speed:  0.08, range:  0.05, fireRate:  0.10, power:  0.06, hp:  0.08, maneuver: -0.04 },
    T5: { name: '新锐',  color: '#00C8C8', speed:  0.16, range: -0.04, fireRate:  0.16, power:  0.04, hp:  0.05, maneuver: 0.12 },
    T6: { name: '旗舰',  color: '#9B59B6', speed:  0.04, range:  0.12, fireRate: -0.04, power:  0.06, hp:  0.16, maneuver: -0.06 },
    T7: { name: '英雄级', color: '#FF8C00', speed:  0.10, range:  0.14, fireRate:  0.08, power:  0.16, hp:  0.12, maneuver: 0.10 },
    T8: { name: '传奇级', color: '#FFD700', speed:  0,    range:  0,    fireRate:  0,    power:  0,    hp:  0,    maneuver: 0 },
};

// T8 传奇级舰船专属属性（覆盖 SHIP_GRADES.T8 默认值）
const T8_LEGENDARY_SHIPS = {
    '巴伐利亚号': { country: 'GERMANY', speed: 0.12, range: 0.20, fireRate: 0.10, power: 0.28, hp: 0.18, maneuver: 0.10 },
    '国王号':     { country: 'GERMANY', speed: 0.14, range: 0.16, fireRate: 0.14, power: 0.18, hp: 0.24, maneuver: 0.12 },
    '无畏号':     { country: 'UK',       speed: 0.14, range: 0.24, fireRate: 0.12, power: 0.18, hp: 0.16, maneuver: 0.10 },
    '皇家橡树号': { country: 'UK',       speed: 0.10, range: 0.16, fireRate: 0.12, power: 0.22, hp: 0.20, maneuver: 0.10 },
    '法兰西号':   { country: 'FRANCE',   speed: 0.08, range: 0.18, fireRate: 0.20, power: 0.20, hp: 0.16, maneuver: 0.10 },
};
