// ═══════════════════════════════════════════════════════════════════════════
// convert_data.mjs — 把网页端 JS 数据文件转成 Unity 可加载的 JSON
// 用法: node tools/convert_data.mjs <输出目录>
// 输出: provinces.json / cities.json / country_index.json / config.json
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(ROOT, 'js');
const OUT_DIR = process.argv[2] || path.join(ROOT, 'UnityProject', 'Assets', 'Resources', 'Data');

function loadJs(file, exports) {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8')
        + '\n;globalThis.__data = {' + exports.join(',') + '};';
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: file });
    return sandbox.__data;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// —— 城市 ——
const c = loadJs('data_cities.js', ['CITIES']);
fs.writeFileSync(path.join(OUT_DIR, 'cities.json'), JSON.stringify({ cities: c.CITIES }));
console.log('cities.json OK:', c.CITIES.length, '城');

// —— 省份 ——
const p = loadJs('data_provinces.js', ['PROVINCES']);
// 只保留 Unity 需要的字段，省体积（多边形坐标是体积大头，但地图渲染必需）
const provinces = p.PROVINCES.map(pr => ({
    id: pr.id, name: pr.n, country: pr.c, type: pr.t,
    x: pr.x, y: pr.y, rings: pr.r
}));
fs.writeFileSync(path.join(OUT_DIR, 'provinces.json'), JSON.stringify({ provinces }));
console.log('provinces.json OK:', provinces.length, '省');

// —— 国家索引 ——
const ci = loadJs('data_country_index.js', ['COUNTRY_PROVINCES']);
fs.writeFileSync(path.join(OUT_DIR, 'country_index.json'), JSON.stringify({ countryProvinces: ci.COUNTRY_PROVINCES }));
console.log('country_index.json OK');

// —— 配置（subset：Unity 需要的常量）——
const cfg = loadJs('config.js', ['PIXELS_PER_DEGREE','MIN_ZOOM','MAX_ZOOM','STRATEGIC_ZOOM','TACTICAL_ZOOM','KM_PER_DEG','GRAIN_CITY_CFG','UNIT_GRAIN_PER_MONTH','GRAIN_UPGRADE_COST','GRAIN_UPGRADE_DAYS','AGRICULTURAL_CITY_IDS','GRAIN_RATIONS_MAX','GRAIN_STARVE','GRAIN_LOW','RAIL_SPEED_MULT','RAIL_MOUNTAIN_MULT','RAIL_STATION_RADIUS','RAIL_TRIP_COST','COUNTRY_COLORS','COUNTRY_CN','COUNTRY_SHORT','UNIT_FULL_NAME','UNIT_SHORT','TERRAIN_MOVE','MOUNTAIN_MOVE_BY_TYPE','ARTILLERY_MOUNTAIN_RANGE_BONUS','MAP_CENTER_LON','MAP_CENTER_LAT']);
const config = {
    pixelsPerDegree: cfg.PIXELS_PER_DEGREE,    minZoom: cfg.MIN_ZOOM, maxZoom: cfg.MAX_ZOOM,
    strategicZoom: cfg.STRATEGIC_ZOOM, tacticalZoom: cfg.TACTICAL_ZOOM,
    kmPerDeg: cfg.KM_PER_DEG,
    grainCityCfg: cfg.GRAIN_CITY_CFG,
    unitGrainPerMonth: cfg.UNIT_GRAIN_PER_MONTH,
    grainUpgradeCost: cfg.GRAIN_UPGRADE_COST, grainUpgradeDays: cfg.GRAIN_UPGRADE_DAYS,
    agriculturalCityIds: cfg.AGRICULTURAL_CITY_IDS,
    grainRationsMax: cfg.GRAIN_RATIONS_MAX,
    grainStarve: cfg.GRAIN_STARVE, grainLow: cfg.GRAIN_LOW,
    railSpeedMult: cfg.RAIL_SPEED_MULT, railMountainMult: cfg.RAIL_MOUNTAIN_MULT,
    railStationRadius: cfg.RAIL_STATION_RADIUS,
    railTripCost: cfg.RAIL_TRIP_COST,
    countryColors: cfg.COUNTRY_COLORS,
    countryCn: cfg.COUNTRY_CN,
    countryShort: cfg.COUNTRY_SHORT,
    unitFullName: cfg.UNIT_FULL_NAME,
    unitShort: cfg.UNIT_SHORT,
    terrainMove: cfg.TERRAIN_MOVE,
    mountainMoveByType: cfg.MOUNTAIN_MOVE_BY_TYPE,
    artilleryMountainRangeBonus: cfg.ARTILLERY_MOUNTAIN_RANGE_BONUS,
    mapCenterLon: cfg.MAP_CENTER_LON, mapCenterLat: cfg.MAP_CENTER_LAT
};
fs.writeFileSync(path.join(OUT_DIR, 'config.json'), JSON.stringify(config));
console.log('config.json OK');
console.log('输出目录:', OUT_DIR);
