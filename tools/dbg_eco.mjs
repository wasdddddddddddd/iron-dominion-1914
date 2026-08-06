// 快速诊断：为什么 AI 不建工厂 / 生产队列不结算
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
const G = sandbox.G;

vm.runInContext(`
globalThis.__G = G;
globalThis.__declareWar = typeof declareWar === 'function' ? declareWar : null;
`, sandbox);

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
    // 给德国初始军队（让 aiEconomy/aiProduction 走真实路径）
    var berlin = null;
    for (var cid in G.cities) { var c = G.cities[cid]; if (c.id === 'berlin') { berlin = c; break; } }
    for (var i = 0; i < 10; i++) {
        G.divisions.push({ id: G.divIdCounter++, name: '德' + (i+1), type: 'infantry', country: 'GERMANY',
            strength: 100, maxStrength: 100, rx: berlin.lon, ry: berlin.lat, state: 'idle',
            targetX: null, targetY: null, focusTarget: null, focusCity: null, focusFactory: null,
            fireCooldown: 0, maxFireCd: 1, rations: 200 });
    }
    G.countries['GERMANY'].divCount = 10;
    // 计数工厂
    function countFactories(co) {
        var n = 0;
        for (var p in G.provinceData) { if (G.provinceData[p].country === co) n += (G.provinceData[p].factories || 0); }
        return n;
    }
    var ger = G.countries['GERMANY'];
    console.log('初始: 金=' + ger.treasury + ' 厂=' + countFactories('GERMANY') + ' 队列=' + (G.buildQueue ? G.buildQueue.length : 0));
    // 直接调用 aiEconomy 10 次（模拟10个tick）
    var pers = getPersonality('GERMANY');
    for (var t = 0; t < 10; t++) {
        G.tick++;
        G.date.setTime(G.date.getTime() + 86400000);
        try { aiEconomy('GERMANY', ger, pers); } catch (e) { console.log('aiEconomy ERR: ' + e); }
        try { aiProduction('GERMANY', ger, pers); } catch (e) { console.log('aiProduction ERR: ' + e); }
    }
    console.log('10 tick后: 金=' + ger.treasury + ' 厂=' + countFactories('GERMANY') + ' 队列=' + (G.buildQueue ? G.buildQueue.length : 0) + ' 单位=' + G.divisions.length);
    if (G.buildQueue) {
        var fac = G.buildQueue.filter(function(x){ return x.type === 'factory'; }).length;
        var unit = G.buildQueue.filter(function(x){ return x.type === 'unit'; }).length;
        console.log('队列明细: factory=' + fac + ' unit=' + unit + ' 总=' + G.buildQueue.length);
        for (var qi = 0; qi < Math.min(5, G.buildQueue.length); qi++) {
            var item = G.buildQueue[qi];
            console.log('  #' + qi + ' ' + item.type + ' days=' + item.days.toFixed(1) + ' city=' + item.cityId + ' prov=' + item.province);
        }
    }
    // 直接结算队列 10 次
    for (var tt = 0; tt < 10; tt++) {
        try { processBuildQueue(750 * 3); } catch (e) { console.log('processBuildQueue ERR: ' + e); }
    }
    console.log('结算10次后: 金=' + ger.treasury + ' 厂=' + countFactories('GERMANY') + ' 队列=' + (G.buildQueue ? G.buildQueue.length : 0) + ' 单位=' + G.divisions.length);

    // ===== 带收入流的完整经济循环测试：60 tick（每tick: 收入→经济→生产→结算） =====
    console.log('---- 完整经济循环（60 tick，含收入流入） ----');
    for (var t2 = 0; t2 < 60; t2++) {
        G.tick++;
        G.date.setTime(G.date.getTime() + 86400000);
        try { updateEconomy(1); } catch (e) { console.log('updateEconomy ERR: ' + e); }
        try { aiEconomy('GERMANY', ger, pers); } catch (e) { console.log('aiEconomy2 ERR: ' + e); }
        try { aiProduction('GERMANY', ger, pers); } catch (e) { console.log('aiProduction2 ERR: ' + e); }
        try { processBuildQueue(750); } catch (e) { console.log('processBuildQueue2 ERR: ' + e); }
    }
    console.log('60 tick完整循环后: 金=' + ger.treasury.toFixed(1) + ' 厂=' + countFactories('GERMANY') + ' 队列=' + (G.buildQueue ? G.buildQueue.length : 0) + ' 单位=' + G.divisions.length);
    try { process.exit(0); } catch (e) {}
})();
`, sandbox);
