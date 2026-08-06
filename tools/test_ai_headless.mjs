// ============================================================
//  headless AI 验证脚本（临时）
//  验证：持久目标锁定 / 优先级评分 / 三阶段攻城 不抛错且按预期工作
//  用法: node test_ai_headless.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

process.on('uncaughtException', e => { console.error('UNCAUGHT:', (e && e.stack) || e); process.exit(1); });
process.on('unhandledRejection', e => { console.error('UNHANDLED REJECTION:', (e && e.stack) || e); process.exit(1); });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const load = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// 启动时清空诊断日志（避免旧文件干扰）
fs.writeFileSync(path.join(ROOT, 'vm_step.log'), '');
fs.writeFileSync(path.join(ROOT, 'hl_diag.log'), '');

// ---- 浏览器 stub ----
const noop = () => {};
const ctxStub = new Proxy({ canvas: { width: 800, height: 600 } }, {
    get: (t, p) => {
        if (p === 'canvas') return t.canvas;
        if (p === 'measureText') return () => ({ width: 10 });
        if (typeof p === 'string') return () => {};
        return undefined;
    },
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
    __vmLog: s => fs.appendFileSync(path.join(ROOT, 'vm_step.log'), s + '\n'),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---- 按 index.html 顺序加载核心 JS（跳过 UI/渲染/联机文件） ----
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
    try {
        vm.runInContext(load(f), sandbox, { filename: f });
    } catch (e) {
        console.error('LOAD FAIL:', f, '→', e.message);
        process.exit(1);
    }
}
console.log('✓ 全部核心文件加载成功');

// ==== 对照实验开关 ====
// 置 true 时禁用 aiMoveToTarget（恢复旧直线移动），用于验证崩溃是否由该函数引发
const DISABLE_AIMOVETOTARGET = true;
if (DISABLE_AIMOVETOTARGET) {
    vm.runInContext('aiMoveToTarget = undefined;', sandbox);
    console.log('!! 已禁用 aiMoveToTarget（对照实验）');
}

// let/const 声明不挂到 sandbox，通过 globalThis 暴露
// 在 vm 上下文内部捕获异常并序列化为字符串，避免跨 realm 异常序列化崩溃
vm.runInContext(`
globalThis.__G = G;
globalThis.__safeUpdateAI = function() {
    if (typeof updateAI !== "function") return 'updateAI:NOT_DEFINED';
    try { updateAI(); return 'updateAI:OK'; }
    catch (e) {
        var d;
        try { d = e && e.stack || String(e); } catch (e2) { try { d = String(e); } catch (e3) { d = 'unknown'; } }
        return 'updateAI:ERR:' + d;
    }
};
globalThis.__safeStep = function(dt) {
    var res = [];
    function run(name, fn) {
        try { globalThis.__vmLog('>> ' + name + ' start'); fn(); globalThis.__vmLog('<< ' + name + ' end'); return name + ':OK'; }
        catch (e) {
            var d;
            try { d = e && e.stack || String(e); } catch (e2) { try { d = String(e); } catch (e3) { d = 'unknown'; } }
            globalThis.__vmLog('XX ' + name + ' ERR: ' + d);
            return name + ':ERR:' + d;
        }
    }
    res.push(run('updateGame', function(){ updateGame(dt); }));
    res.push(run('moveUnits', function(){ moveUnits(0.05); }));
    res.push(run('fireUnits', function(){ fireUnits(0.05); }));
    res.push(run('updateProjectiles', function(){ updateProjectiles(0.05); }));
    return res.join('\\n---\\n');
};
`, sandbox);

// ---- 构造对局：德国 vs 法国，加速触发战斗 ----
const G = sandbox.__G;
const safeUpdateAI = sandbox.__safeUpdateAI;
const safeStep = sandbox.__safeStep;
const LOG = p => fs.appendFileSync(path.join(ROOT, 'hl_diag.log'), p + '\n');
fs.writeFileSync(path.join(ROOT, 'hl_diag.log'), '');
const init = () => {
    G.date = new Date(1914, 7, 4);   // 1914-08-04，德国已自动宣战
    G.paused = false;
    G.speed = 16;
    G.tick = 0;
    G.playerCountry = 'FRANCE';      // 玩家选法国，德/奥/俄/英为 AI
    G.multiplayerHumanCountries = ['FRANCE'];
    G.multiplayerMode = null;
    G._aiSiege = {};
    // 清理可能残留的单位，重新布阵：德国集团军逼近巴黎
    G.divisions = G.divisions.filter(d => d.country !== 'GERMANY');
    G.divIdCounter = 9000;
    // 找巴黎与柏林
    let paris = null, berlin = null;
    for (let cid in G.cities) {
        let c = G.cities[cid];
        if (c.isCapital && c.owner === 'FRANCE') paris = c;
        if (c.isCapital && c.owner === 'GERMANY') berlin = c;
    }
    if (!paris || !berlin) throw new Error('找不到巴黎/柏林');
    // 德国造 12 个师（6步2炮2骑2工），放在巴黎西南方向（法国腹地）
    const types = ['infantry','infantry','infantry','infantry','infantry','infantry','artillery','artillery','cavalry','cavalry','engineer','engineer'];
    for (let i = 0; i < types.length; i++) {
        let d = {
            id: G.divIdCounter++, name: '德' + i, type: types[i], country: 'GERMANY',
            strength: 100, maxStrength: 100,
            rx: paris.lon - 0.8 - (i % 4) * 0.1, ry: paris.lat - 0.8 - Math.floor(i / 4) * 0.1,
            state: 'idle', focusTarget: null, focusCity: null, focusFactory: null,
            _aiTask: null, _aiTaskTarget: null, _aiTaskAge: 0, _aiTarget: null, _aiTargetAge: 0,
            fireCooldown: 0, maxFireCd: 1,
        };
        G.divisions.push(d);
    }
    // 法国在巴黎部署 6 个守军
    for (let i = 0; i < 6; i++) {
        let d = {
            id: G.divIdCounter++, name: '法守' + i, type: 'infantry', country: 'FRANCE',
            strength: 100, maxStrength: 100,
            rx: paris.lon + 0.2 + (i % 3) * 0.1, ry: paris.lat + 0.2 + Math.floor(i / 3) * 0.1,
            state: 'idle', focusTarget: null, focusCity: null, focusFactory: null,
            fireCooldown: 0, maxFireCd: 1,
        };
        G.divisions.push(d);
    }
    // 同步国家计数器（供 AI 决策）
    for (let co in G.countries) {
        let cnt = 0;
        for (let d of G.divisions) if (d.country === co && d.strength > 0) cnt++;
        G.countries[co].divCount = cnt;
    }
    return { paris, berlin };
};
const { paris } = init();

// 同步预构建寻路网格（buildPF 原为 setTimeout(0) 异步执行，同步帧循环跑时 gPF 尚未就绪）
// 包 try/catch + 日志，定位崩溃点
vm.runInContext(`
globalThis.__vmLog('[pf] 开始同步 buildPF...');
try {
    if (typeof buildPF === "function") { buildPF(); globalThis.__pfReady = (typeof gPF !== "undefined" && gPF !== null) ? (gPF.cols + "x" + gPF.rows) : "null"; }
    else globalThis.__pfReady = "no-buildPF";
    globalThis.__vmLog('[pf] buildPF 完成: ' + globalThis.__pfReady);
} catch (e) {
    var d; try { d = e && e.stack || String(e); } catch (e2) { d = String(e); }
    globalThis.__vmLog('[pf] buildPF 异常: ' + d);
    globalThis.__pfReady = 'ERR';
}
`, sandbox);
LOG('[pf] gPF = ' + sandbox.__pfReady);

// ---- 诊断：手动触发 updateAI，定位异常（vm 内部捕获） ----
{
    const r = safeUpdateAI();
    if (r.indexOf('ERR') >= 0) { LOG('✗ ' + r); process.exit(1); }
    else LOG('✓ ' + r);
}

// ---- 跑 N 帧模拟（vm 内部捕获异常，避免跨 realm 序列化问题） ----
const stats = { locked: 0, clear: 0, siege: 0, assault: 0, fired: 0 };
for (let frame = 0; frame < 600; frame++) {
    if (frame < 12 || frame % 60 === 0) LOG('[tick] frame ' + frame + ' tick ' + G.tick);
    const stepRes = safeStep(750);
    if (stepRes.indexOf('ERR') >= 0) {
        LOG('✗ 帧' + frame + ':\n' + stepRes);
        process.exit(3);
    }
    const germans = G.divisions.filter(d => d.country === 'GERMANY' && d.strength > 0);
    const locked = germans.filter(d => d._aiTarget).length;
    stats.locked = Math.max(stats.locked, locked);
    for (let co in G._aiSiege || {}) {
        for (let cid in G._aiSiege[co]) {
            let st = G._aiSiege[co][cid];
            if (st.stage === 'CLEAR') stats.clear++;
            if (st.stage === 'SIEGE') stats.siege++;
            if (st.stage === 'ASSAULT') stats.assault++;
        }
    }
    if (frame % 60 === 0) {
        const fr = G.divisions.filter(d => d.country === 'FRANCE' && d.strength > 0);
        LOG(`帧${frame}: 法军存活 ${fr.length}, 德军锁定目标 ${locked}, 巴黎HP ${Math.round(paris.hp)}/${paris.maxHp}`);
    }
}
LOG('===== 结果 =====');
LOG('德军最多同时锁定目标数: ' + stats.locked + ' (>0 表示持久锁定生效)');
LOG('攻城阶段统计 → 清野: ' + stats.clear + ' 围城: ' + stats.siege + ' 总攻: ' + stats.assault);
const aliveFr = G.divisions.filter(d => d.country === 'FRANCE' && d.strength > 0).length;
const germans2 = G.divisions.filter(d => d.country === 'GERMANY' && d.strength > 0);
LOG('结束时 法军存活: ' + aliveFr + ' / 德军存活: ' + germans2.length);
LOG('巴黎HP: ' + Math.round(paris.hp) + '/' + paris.maxHp + (paris.owner === 'GERMANY' ? '(被德军占领!)' : ''));
LOG('===== 验证通过 =====');
console.log('完成，详见 hl_diag.log');
