// 最小分步定位脚本
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const step = s => { try { fs.appendFileSync(path.join(ROOT, 'step.log'), s + '\n'); } catch (e) {} };
fs.writeFileSync(path.join(ROOT, 'step.log'), 'start\n');

const noop = () => {};
const ctxStub = new Proxy({ canvas: { width: 800, height: 600 } }, {
    get: (t, p) => { if (p === 'canvas') return t.canvas; if (p === 'measureText') return () => ({ width: 10 }); if (typeof p === 'string') return () => {}; return undefined; },
    set: () => true,
});
const fakeEl = () => ({ getContext: () => ctxStub, style: {}, width: 800, height: 600, addEventListener: noop, appendChild: noop });
const canvasEl = fakeEl();
const windowStub = {
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 16),
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
    localStorage: windowStub.localStorage, performance: windowStub.performance,
    navigator: { userAgent: 'node', platform: 'node' },
    location: { href: 'http://localhost:1914/', search: '', host: 'localhost:1914', reload: noop },
    Image: windowStub.Image, Audio: windowStub.Audio,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, Error, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    alert: noop, confirm: () => true, prompt: () => null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
step('sandbox ready');

const FILES = [
    'js/data_terrain.js', 'js/config.js', 'js/data_provinces.js', 'js/data_railways.js',
    'js/data_province_name_cn.js', 'js/data_cities.js', 'js/data_country_index.js',
    'js/data_factories.js', 'js/data_events.js', 'js/game_state.js', 'js/game_ui.js',
    'js/command/commanderData.js', 'js/command/commanderState.js', 'js/command/commanderSystem.js',
    'js/navy/shipGrades.js', 'js/navy/shipData.js', 'js/navy/shipNaming.js', 'js/navy/navyNode.js',
    'js/terrain_b64.js', 'js/game_core.js', 'js/ai/ai_pathfinding.js',
    'js/ai/ai_strategy.js', 'js/ai/ai_tactics.js', 'js/ai/ai_controller.js',
];
for (const f of FILES) {
    step('loading ' + f);
    try {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    } catch (e) {
        step('LOAD FAIL ' + f + ': ' + String(e));
        process.exit(1);
    }
}
step('all files loaded');
vm.runInContext('globalThis.__G = G; globalThis.__safeUpdateAI = function(){ try { updateAI(); return "OK"; } catch(e){ return "ERR:" + String(e); } };', sandbox);
step('G exposed, G exists: ' + (typeof sandbox.__G !== 'undefined'));
step('updateAI direct: ' + sandbox.__safeUpdateAI());
step('done');
console.log('ALL DONE');
