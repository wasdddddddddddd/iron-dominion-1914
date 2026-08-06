// 诊断 aiEconomy 工厂分支为何从不生效
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const noop = () => {};
const ctxStub = new Proxy({ canvas: { width: 800, height: 600 } }, {
    get: (t, p) => { if (p === 'canvas') return t.canvas; if (p === 'measureText') return () => ({ width: 10 }); return typeof p === 'string' ? () => {} : undefined; },
    set: () => true,
});
const fakeEl = () => ({ getContext: () => ctxStub, style: {}, width: 800, height: 600, addEventListener: noop, appendChild: noop });
const canvasEl = fakeEl();
const windowStub = {
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    performance: { now: () => Date.now() },
    Image: class { constructor() { this.onload = null; } set src(v) {} },
    Audio: class { play() { return { catch: noop }; } addEventListener() {} },
};
const sandbox = {
    console, window: windowStub, canvas: canvasEl, ctx: ctxStub,
    document: { createElement: fakeEl, getElementById: id => id === 'gameCanvas' ? canvasEl : null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, body: { style: {} }, title: '', documentElement: { style: {} } },
    requestAnimationFrame: windowStub.requestAnimationFrame,
    setTimeout, clearTimeout, setInterval, clearInterval,
    process: process, localStorage: windowStub.localStorage, performance: windowStub.performance,
    navigator: { userAgent: 'node', platform: 'node' },
    location: { href: 'http://localhost:1914/', search: '', host: 'localhost:1914', reload: noop },
    Image: windowStub.Image, Audio: windowStub.Audio,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, Error, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    alert: noop, confirm: () => true, prompt: () => null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const FILES = [
    'js/data_terrain.js', 'js/config.js', 'js/data_provinces.js', 'js/data_railways.js',
    'js/data_province_name_cn.js', 'js/data_cities.js', 'js/data_country_index.js',
    'js/data_factories.js', 'js/data_events.js', 'js/game_state.js', 'js/game_ui.js',
    'js/command/commanderData.js', 'js/command/commanderState.js', 'js/command/commanderSystem.js',
    'js/navy/shipGrades.js', 'js/navy/shipData.js', 'js/navy/shipNaming.js', 'js/navy/navyNode.js',
    'js/terrain_b64.js', 'js/game_core.js', 'js/ai/ai_pathfinding.js',
    'js/ai/ai_strategy.js', 'js/ai/ai_tactics.js',
    'js/ai/ai_battle.js', 'js/ai/ai_controller.js',
];
for (const f of FILES) {
    try { vm.runInContext(load(f), sandbox, { filename: f }); }
    catch (e) { console.log('LOAD FAIL ' + f + ': ' + String(e)); process.exit(1); }
}
vm.runInContext(`
(function(){
    G.date = new Date(1914, 7, 4);
    G.paused = false; G.speed = 16; G.tick = 0;
    G.playerCountry = 'UK';
    G.multiplayerHumanCountries = ['UK'];
    G.multiplayerMode = null;
    G._aiStrategy = {}; G.surrendered = {};
    G.divisions = []; G.divIdCounter = 5000;
    G.germanyDeclaredWar = true; G._ententeJoined = true;
    declareWar('GERMANY','FRANCE'); declareWar('GERMANY','BELGIUM'); declareWar('GERMANY','LUXEMBOURG');
    declareWar('RUSSIA','GERMANY'); declareWar('RUSSIA','AUSTRIA_HUNGARY');
    declareWar('UK','GERMANY'); declareWar('FRANCE','AUSTRIA_HUNGARY');
    // 给德国初始军队
    var berlin = null;
    for (var cid in G.cities) { var c = G.cities[cid]; if (c.id === 'berlin') { berlin = c; break; } }
    for (var i = 0; i < 10; i++) {
        G.divisions.push({ id: G.divIdCounter++, name: '德' + (i+1), type: 'infantry', country: 'GERMANY',
            strength: 100, maxStrength: 100, rx: berlin.lon, ry: berlin.lat, state: 'idle',
            targetX: null, targetY: null, focusTarget: null, focusCity: null, focusFactory: null,
            fireCooldown: 0, maxFireCd: 1, rations: 200 });
    }
    G.countries['GERMANY'].divCount = 10;
    var ger = G.countries['GERMANY'];
    ger.treasury = 5000; // 确保资金充足
    var allGer = getCountryProvinces('GERMANY');
    console.log('getCountryProvinces(GERMANY) 总数: ' + allGer.length);
    var withFac = allGer.filter(function(p){ return (p.factories || 0) < 3; });
    var withCenter = allGer.filter(function(p){ return p.center; });
    var withBoth = allGer.filter(function(p){ return (p.factories || 0) < 3 && p.center; });
    console.log('厂<3: ' + withFac.length + ' 有center: ' + withCenter.length + ' 两者都有: ' + withBoth.length);
    for (var dbgi = 0; dbgi < Math.min(5, allGer.length); dbgi++) {
        var dp = allGer[dbgi];
        console.log('  省份 ' + dp.id + ' 厂=' + dp.factories + ' center=' + (dp.center ? '有' : '无') + ' country=' + dp.country);
    }
    var provs = withBoth;
    console.log('可建厂省份数: ' + provs.length);
    // 打印前8个省份的工厂评分
    var scores = [];
    for (var pi = 0; pi < provs.length && pi < 10; pi++) {
        var p = provs[pi];
        var sc = 0;
        try { sc = getFactoryScore(p.id, 'GERMANY'); } catch (e) { console.log('getFactoryScore ERR ' + p.id + ': ' + e); sc = 'ERR'; }
        scores.push(p.id + ':' + sc);
    }
    console.log('工厂评分: ' + scores.join(' '));
    // 城市查找测试：对评分最高的省份找 city
    try {
        var bestP = null, bestS = -999;
        for (var pi2 = 0; pi2 < provs.length; pi2++) {
            var s2 = getFactoryScore(provs[pi2].id, 'GERMANY');
            if (s2 > bestS) { bestS = s2; bestP = provs[pi2]; }
        }
        console.log('最高分省份: ' + (bestP ? bestP.id : 'NULL') + ' score=' + bestS);
        if (bestP) {
            var city = null;
            for (var cid2 in G.cities) {
                var ct2 = G.cities[cid2];
                if (ct2.provinceId === bestP.id && ct2.owner === 'GERMANY') { city = ct2; break; }
            }
            console.log('匹配城市: ' + (city ? city.id : 'NULL (provinceId不匹配!)') + ' (省份id=' + bestP.id + ')');
        }
    } catch (e) { console.log('查找ERR: ' + e); }
    // 直接调用 aiEconomy 5 次，检查 buildQueue
    var pers = getPersonality('GERMANY');
    for (var t = 0; t < 5; t++) {
        try { aiEconomy('GERMANY', ger, pers); } catch (e) { console.log('aiEconomy ERR: ' + e); }
    }
    console.log('5次aiEconomy后队列: ' + (G.buildQueue ? G.buildQueue.length : 0) + ' 金=' + ger.treasury);
    if (G.buildQueue) {
        for (var qi = 0; qi < G.buildQueue.length && qi < 5; qi++) {
            console.log('  #' + qi + ' ' + G.buildQueue[qi].type + ' city=' + G.buildQueue[qi].cityId);
        }
    }
    try { process.exit(0); } catch (e) {}
})();
`, sandbox);
