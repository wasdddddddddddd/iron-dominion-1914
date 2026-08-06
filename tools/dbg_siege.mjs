// 诊断：为何德国10个师围卢森堡600帧打不下来
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
    declareWar('GERMANY','LUXEMBOURG');
    var lux = G.cities['luxembourg'];
    console.log('卢森堡城: hp=' + lux.hp + '/' + lux.maxHp + ' owner=' + lux.owner + ' 位置=' + lux.lon + ',' + lux.lat);
    // 10个德国单位（6炮4步）围城，站在攻城位
    var types = ['artillery','artillery','artillery','artillery','artillery','artillery','infantry','infantry','infantry','infantry'];
    for (var i = 0; i < types.length; i++) {
        var t = types[i];
        var rx, ry;
        if (t === 'artillery') { rx = lux.lon - 0.5; ry = lux.lat; }
        else { rx = lux.lon + 0.2; ry = lux.lat + 0.2; }
        var d = { id: G.divIdCounter++, name: '德攻' + i, type: t, country: 'GERMANY',
            strength: 100, maxStrength: 100, rx: rx, ry: ry, state: 'idle',
            targetX: null, targetY: null, focusTarget: null, focusCity: lux.id, focusFactory: null,
            fireCooldown: 0, maxFireCd: 1, rations: 200, _aiTask: 'ATTACK',
            _aiTaskTarget: { lon: lux.lon, lat: lux.lat } };
        G.divisions.push(d);
    }
    for (var f = 0; f < 300; f++) {
        G.tick++;
        try { fireUnits(0.1); } catch (e) { console.log('fireUnits ERR: ' + e); }
        try { updateProjectiles(0.1); } catch (e) { console.log('updateProjectiles ERR: ' + e); }
        if (f % 50 === 0) {
            console.log('frame' + f + ': 城hp=' + lux.hp.toFixed(1) + ' 炮弹数=' + G.projectiles.length);
        }
        if (lux.hp <= 0) { console.log('★ 城市HP归零 frame' + f); break; }
    }
    console.log('最终: hp=' + lux.hp + ' owner=' + lux.owner + ' projectiles=' + G.projectiles.length);
    try { process.exit(0); } catch (e) {}
})();
`, sandbox);
