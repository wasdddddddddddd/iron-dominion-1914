// ============================================================
//  AI 决策模拟器（headless）——聚焦决策层，绕开渲染/寻路
//  验证：史丽芬计划 / 东线德俄互动 / 奥匈参战 / 兵种构成
//  用法: node ai_sim.mjs <帧数> <输出片段>
// ============================================================
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LOGF = path.join(ROOT, 'ai_sim.log');
const log = s => fs.appendFileSync(LOGF, s + '\n');
fs.writeFileSync(LOGF, 'AI 决策模拟器启动\n');

// ---- 浏览器 stub（最小化） ----
const noop = () => {};
const ctxStub = new Proxy({ canvas: { width: 800, height: 600 } }, {
    get: (t, p) => { if (p === 'canvas') return t.canvas; if (p === 'measureText') return () => ({ width: 10 }); return typeof p === 'string' ? () => {} : undefined; },
    set: () => true,
});
const fakeEl = () => ({ getContext: () => ctxStub, style: {}, width: 800, height: 600, addEventListener: noop, appendChild: noop });
const canvasEl = fakeEl();
const windowStub = {
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 16),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    _devMaintOverride: 1.5, // 经济由用户调整，模拟器保持原值 1.5
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
    process: process,
    localStorage: windowStub.localStorage, performance: windowStub.performance,
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
    catch (e) { log('LOAD FAIL ' + f + ': ' + String(e)); process.exit(1); }
}
log('✓ 全部核心文件加载成功');

// 暴露全局（let/const 不挂 sandbox）
vm.runInContext(`
globalThis.__G = G;
globalThis.__updateAI = typeof updateAI === 'function' ? updateAI : null;
globalThis.__fireUnits = typeof fireUnits === 'function' ? fireUnits : null;
globalThis.__aiFormArmyGroups = typeof aiFormArmyGroups === 'function' ? aiFormArmyGroups : null;
globalThis.__buildPF = typeof buildPF === 'function' ? buildPF : null;
globalThis.__declareWar = typeof declareWar === 'function' ? declareWar : null;
globalThis.__findCity = function(owner, isCap) {
    for (var cid in G.cities) {
        var c = G.cities[cid];
        if (c.owner === owner && (isCap === undefined || c.isCapital === isCap)) return c;
    }
    return null;
};
globalThis.__spawnDivs = function(country, city, types, label) {
    for (var i = 0; i < types.length; i++) {
        G.divisions.push({
            id: G.divIdCounter++, name: label + (i + 1), type: types[i], country: country,
            strength: 100, maxStrength: 100,
            rx: city.lon + (Math.random() - 0.5) * 0.3, ry: city.lat + (Math.random() - 0.5) * 0.3,
            state: 'idle', focusTarget: null, focusCity: null, focusFactory: null,
            _aiTask: null, _aiTaskTarget: null, _aiTaskAge: 0, _aiTarget: null, _aiTargetAge: 0,
            fireCooldown: 0, maxFireCd: 1, armyGroupId: null, supplyStatus: null, rations: 50,
        });
    }
};
`, sandbox);
const G = sandbox.__G;

// ---- vm 内日志（直接写文件，绕开 stdout 管道问题） ----
sandbox.__fslog = (s) => fs.appendFileSync(LOGF, s + '\n');
vm.runInContext('globalThis.__vmLog = function(s){ __fslog(s); };', sandbox);

// ---- 城市易主检测状态：vm 外 Map，与 G 解耦（避免 G 属性赋值异常） ----
const simOwnerMap = new Map();
sandbox.__simOwnerGet = (cid) => simOwnerMap.has(cid) ? simOwnerMap.get(cid) : undefined;
sandbox.__simOwnerSet = (cid, owner) => simOwnerMap.set(cid, owner);
// sandbox 属性在 vm 内直接可访问，无需包装

// ===== 场景构造 + 模拟循环：整个放进 vm 上下文执行（异常同 realm，安全处理） =====
const N = parseInt(process.argv[2] || '120', 10);
const PHASE_EVERY = parseInt(process.argv[3] || '30', 10);
const SIM_CODE = `
(function() {
    var L = globalThis.__vmLog;
    try {
        G.date = new Date(1914, 7, 4);
        G.paused = false; G.speed = 16; G.tick = 0;
        G.playerCountry = 'UK';
        G.multiplayerHumanCountries = ['UK'];
        G.multiplayerMode = null;
        G._aiSiege = {}; G._aiStrategy = {}; G._aiSituation = {};
        G._aiWarRushed = {}; G._aiDefenseOrders = {}; G.surrendered = {};
        G.germanyDeclaredWar = true; G._ententeJoined = true;
        G.divisions = []; G.divIdCounter = 5000;
        declareWar('GERMANY', 'FRANCE'); declareWar('GERMANY', 'BELGIUM'); declareWar('GERMANY', 'LUXEMBOURG');
        declareWar('RUSSIA', 'GERMANY'); declareWar('RUSSIA', 'AUSTRIA_HUNGARY');
        declareWar('UK', 'GERMANY'); declareWar('FRANCE', 'AUSTRIA_HUNGARY');
        // 加速：无关国家标记投降，让 allCountries 只剩交战相关国家（大幅降低每帧开销）
        var ACTIVE = ['GERMANY','FRANCE','BELGIUM','LUXEMBOURG','RUSSIA','AUSTRIA_HUNGARY','UK','ITALY','SERBIA','TURKEY'];
        for (var co0 in G.countries) {
            if (ACTIVE.indexOf(co0) === -1) { G.surrendered[co0] = true; }
        }
        L('surrendered: ' + Object.keys(G.surrendered).length + ' 国被标记退出');

        // ── 资金配置（与用户约定一致：德9999 / 其他列强3000 / 小国500）──
        var GP_TRES = { GERMANY: 9999, FRANCE: 3000, UK: 3000, AUSTRIA_HUNGARY: 3000, ITALY: 3000, RUSSIA: 3000 };
        for (var coT in G.countries) {
            if (!G.countries[coT] || G.countries[coT].treasury === undefined) continue;
            G.countries[coT].treasury = (GP_TRES[coT] !== undefined) ? GP_TRES[coT] : 500;
        }
        L('资金: 德' + G.countries['GERMANY'].treasury + ' 法' + G.countries['FRANCE'].treasury + ' 俄' + G.countries['RUSSIA'].treasury);

        function spawnDivs(country, city, types, label) {
            if (!city) { L('spawnDivs SKIP ' + country + ' (no city)'); return; }
            for (var i = 0; i < types.length; i++) {
                G.divisions.push({
                    id: G.divIdCounter++, name: label + (i + 1), type: types[i], country: country,
                    strength: 100, maxStrength: 100,
                    rx: city.lon + (Math.random() - 0.5) * 0.3, ry: city.lat + (Math.random() - 0.5) * 0.3,
                    state: 'idle', focusTarget: null, focusCity: null, focusFactory: null,
                    _aiTask: null, _aiTaskTarget: null, _aiTaskAge: 0, _aiTarget: null, _aiTargetAge: 0,
                    fireCooldown: 0, maxFireCd: 1, armyGroupId: null, supplyStatus: null,
                    province: city.provinceId || null, rations: 200,
                    _theater: (country === 'GERMANY' && city.lon > 16.0) ? 'EAST' : 'WEST',
                });
            }
        }
        function findCityAny(owner, preferCap) {
            var fallback = null;
            for (var cid in G.cities) { var c = G.cities[cid]; if (c.owner === owner) { if (c.isCapital === preferCap) return c; if (!fallback) fallback = c; } }
            return fallback;
        }
        function findCity(owner, isCap) {
            for (var cid in G.cities) { var c = G.cities[cid]; if (c.owner === owner && (isCap === undefined || c.isCapital === isCap)) return c; }
            return null;
        }
        var berlin = findCityAny('GERMANY', true), cologne = G.cities['cologne'] || findCityAny('GERMANY', false);
        var paris = findCityAny('FRANCE', true), brussels = findCityAny('BELGIUM', true);
        var warsaw = G.cities['warsaw'] || findCityAny('RUSSIA', false), krakow = G.cities['krakow'] || findCityAny('AUSTRIA_HUNGARY', false);
        L('findCity: berlin=' + (berlin ? berlin.id : 'NULL') + ' paris=' + (paris ? paris.id : 'NULL') + ' warsaw=' + (warsaw ? warsaw.id : 'NULL') + ' brussels=' + (brussels ? brussels.id : 'NULL') + ' krakow=' + (krakow ? krakow.id : 'NULL'));
        // ── 德国收入 130（原70）+ 99→130 金库略增，形成"相对优势"（法50/俄34/奥44）──
        // 开局兵力保持原样（德20/法14/比6/俄16/奥12），靠收入优势慢慢滚雪球，验证战斗 AI。
        spawnDivs('GERMANY', berlin, ['infantry','infantry','infantry','infantry','infantry','infantry','cavalry','cavalry','artillery','artillery'], '德');
        spawnDivs('GERMANY', cologne, ['infantry','infantry','infantry','infantry','infantry','cavalry','cavalry','artillery','artillery','mountain'], '德西');
        spawnDivs('FRANCE', paris, ['infantry','infantry','infantry','infantry','infantry','infantry','infantry','infantry','artillery','artillery','artillery','cavalry','cavalry','engineer'], '法');
        spawnDivs('BELGIUM', brussels, ['infantry','infantry','infantry','infantry','artillery','cavalry'], '比');
        // 俄军部署在华沙（前线），而非莫斯科（离前线 20° 太远，AI 进攻半径 12° 够不着德军）
        spawnDivs('RUSSIA', warsaw, ['infantry','infantry','infantry','infantry','infantry','infantry','infantry','infantry','cavalry','cavalry','cavalry','cavalry','artillery','artillery','artillery','engineer'], '俄');
        spawnDivs('AUSTRIA_HUNGARY', krakow, ['infantry','infantry','infantry','infantry','infantry','cavalry','cavalry','artillery','artillery','mountain','mountain','engineer'], '奥');
        // 德国收入 70 → 130：直接给德国国库每天补贴 60（模拟经济优势，不改游戏数值）
        // 用 frame 循环外的全局变量，在每帧 updateEconomy 后追加
        var GER_INC_BONUS = 60;
        for (var co in G.countries) { var cnt = 0; for (var di = 0; di < G.divisions.length; di++) { var d = G.divisions[di]; if (d.country === co && d.strength > 0) cnt++; } G.countries[co].divCount = cnt; }
        var simSurrenderedLog = {};
        // 跳过 buildPF（headless 下同步调用会原生崩溃）；AI 决策不依赖寻路网格
        L('divisions=' + G.divisions.length);
        L('开局: 德20 法14 比6 俄16 奥12');

        for (var frame = 0; frame < ${N}; frame++) {
            G.tick++;
            G.date.setTime(G.date.getTime() + 1 * 86400000);
            // ── 意大利选择阵营：到 1915-05-23 必定加入同盟国（对英法宣战）──
            if (!G._italyJoined && G.date >= new Date(1915, 4, 23)) {
                G._italyJoined = true;
                if (typeof areAtWar !== 'function' || !areAtWar('ITALY', 'FRANCE')) declareWar('ITALY', 'FRANCE');
                if (typeof areAtWar !== 'function' || !areAtWar('ITALY', 'UK')) declareWar('ITALY', 'UK');
                L('★ 意大利加入同盟国 frame' + frame + '（对法国/英国宣战）');
            }
            var t0 = Date.now();
            if (frame === 0 || frame === 5 || frame % 60 === 0) L('frame ' + frame + ' tick ' + G.tick + ' start');
            // ── AI 决策 + 经济/补给/生产/占领：每 3 帧（=3 游戏天）结算一次，显著提速 ──
            // （与真实 gameLoop 节奏一致：真实游戏 updateAI 也是每 ~5 游戏天一次）
            var SIM_EVERY = 3;
            if (frame % SIM_EVERY === 0) {
                updateAI();
                try { updateEconomy(SIM_EVERY); } catch (e) {}
                // 德国收入补贴：70→130（模拟相对优势，不修改游戏数值）
                try { if (G.countries['GERMANY']) G.countries['GERMANY'].treasury += GER_INC_BONUS * SIM_EVERY; } catch (e) {}
                try { processBuildQueue(750 * SIM_EVERY); } catch (e) {}
                try { updateGrain(SIM_EVERY); } catch (e) {}
                try { updateDivisions(SIM_EVERY); } catch (e) {}
                try { updateNeutralCityCapture(SIM_EVERY); } catch (e) {}
            }
            var t1 = Date.now();
            if (frame === 0 || frame === 5 || frame % 60 === 0 || (t1 - t0) > 5000) L('frame ' + frame + ' updateAI done ' + (t1 - t0) + 'ms');
            // 炮弹结算：开火→飞行→命中（此前从未调用，城市 HP 永远不掉）
            try { fireUnits(0.1); } catch (e) {}
            try { updateProjectiles(0.1); } catch (e) {}
            try { updateFireZones(0.1); } catch (e) {}
            // 投降判定（内部自节流 30 帧）
            try { checkSurrender(); } catch (e) {}
            // 无防御省份占领（每 9 帧一次）
            if (frame % 9 === 0) { try { updateAIOccupation(); } catch (e) {} }
            // 轻量移动（速度提升 + 到达钳制 + 陆地单位不可越水，避免出现"奥匈打进伦敦"的穿海奇观）
            for (var i = 0; i < G.divisions.length; i++) {
                var d = G.divisions[i];
                if (d.strength <= 0) continue;
                var isNaval = (d.type === 'navy' || d.type === 'submarine');
                if (d.state === 'moving' && d.targetX !== undefined && d.targetX !== null) {
                    var dx = d.targetX - d.rx, dy = d.targetY - d.ry, dist = Math.hypot(dx, dy);
                    var step = 0.12;
                    if (dist < step) { d.rx = d.targetX; d.ry = d.targetY; d.state = 'idle'; }
                    else {
                        var nx = d.rx + (dx / dist) * step, ny = d.ry + (dy / dist) * step;
                        // 陆地单位下一步是海 → 不移动（等真实寻路/换目标）
                        if (!isNaval && typeof isLandPoint === 'function' && !isLandPoint(nx, ny)) {
                            d.state = 'idle'; d.targetX = null; d.targetY = null;
                        } else { d.rx = nx; d.ry = ny; }
                    }
                }
                if (d._aiTask && d._aiTaskTarget && d.state === 'moving' && d.targetX === undefined) {
                    var dx2 = d._aiTaskTarget.lon - d.rx, dy2 = d._aiTaskTarget.lat - d.ry, dist2 = Math.hypot(dx2, dy2);
                    if (dist2 > 0.06) {
                        var nx2 = d.rx + (dx2 / dist2) * 0.06, ny2 = d.ry + (dy2 / dist2) * 0.06;
                        if (!isNaval && typeof isLandPoint === 'function' && !isLandPoint(nx2, ny2)) {
                            d.state = 'idle'; d._aiTask = null; d._aiTaskTarget = null;
                        } else { d.rx = nx2; d.ry = ny2; }
                    }
                }
            }
            // 投降日志（一次性）
            for (var sco in G.surrendered) {
                if (G.surrendered[sco] && !simSurrenderedLog[sco]) {
                    L('★ 投降 frame' + frame + ': ' + sco + ' 向德国投降');
                    simSurrenderedLog[sco] = true;
                }
            }
            // 目标达成（法国+俄国都投降）→ 提前结束
            if (G.surrendered['FRANCE'] && G.surrendered['RUSSIA']) {
                L('★★ 目标达成 frame' + frame + ': 法国与俄国均已向德国投降！★★');
                break;
            }

            // 城市占领变化记录（每帧检查，状态存 vm 外 Map）
            for (var cid in G.cities) {
                var cc = G.cities[cid];
                if (!cc) continue;
                var prev = globalThis.__simOwnerGet(cid);
                if (prev === undefined) { globalThis.__simOwnerSet(cid, cc.owner); }
                else if (prev !== cc.owner) {
                    L('★ 城市易主 frame' + frame + ': ' + cc.id + ' ' + (cc.name || '') + ' ' + prev + '→' + (cc.owner || '中立'));
                    globalThis.__simOwnerSet(cid, cc.owner);
                }
            }

            if ((frame + 1) % ${PHASE_EVERY} === 0) {
                L('───── 第 ' + (frame + 1) + ' 天 ─────');
                // 城市占领统计：各国控制城市数 + 德国城市沦陷数
                var ownerCount = {};
                for (var cidO in G.cities) {
                    var ccO = G.cities[cidO];
                    if (!ccO || ccO.hp <= 0) continue;
                    var ok = ccO.owner || '中立';
                    ownerCount[ok] = (ownerCount[ok] || 0) + 1;
                }
                L('城市控制: ' + Object.keys(ownerCount).map(function(k) { return k + ':' + ownerCount[k]; }).join(' '));
                // 经济诊断：金库/人力/师数/收入/工厂
                var ecoInfo = ['GERMANY','FRANCE','RUSSIA','AUSTRIA_HUNGARY'].map(function(cc) {
                    var cd = G.countries[cc];
                    var _inc = 0, _fac = 0;
                    try { _inc = calcCountryIncome(cc); } catch (e) {}
                    for (var pp in G.provinceData) { var _pd = G.provinceData[pp]; if (_pd.country === cc) _fac += (_pd.factories || 0); }
                    return cc + '(金' + Math.floor(cd.treasury) + ' 收' + Math.floor(_inc) + ' 厂' + _fac + ' 师' + (cd.divCount || 0) + ')';
                }).join(' ');
                L('经济: ' + ecoInfo);
                // 德国城市沦陷（originalOwner=GERMANY 但 owner 非 GERMANY）
                var gerLost = [], gerTotal = 0;
                for (var cidL in G.cities) {
                    var ccL = G.cities[cidL];
                    if (!ccL || ccL.hp <= 0) continue;
                    if (ccL.originalCountry === 'GERMANY' || ccL.country === 'GERMANY') {
                        gerTotal++;
                        if (ccL.owner !== 'GERMANY') gerLost.push(ccL.id + '(' + (ccL.owner || '中立') + ')');
                    }
                }
                L('德国城市: ' + (gerTotal - gerLost.length) + '/' + gerTotal + ' 存续，沦陷: ' + (gerLost.join(' ') || '无'));
                // 比利时城市 HP（围攻进展）
                var belCities = [];
                for (var cidB in G.cities) {
                    var ccB = G.cities[cidB];
                    if (ccB && ccB.owner === 'BELGIUM' && ccB.hp > 0) belCities.push(ccB.id + ':' + Math.round(ccB.hp / (ccB.maxHp || 100) * 100) + '%');
                }
                L('比利时城市: ' + (belCities.join(' ') || '无'));
                // 围攻阶段诊断
                if (G._aiSiege) {
                    var siegeInfo = [];
                    for (var sCo in G._aiSiege) {
                        for (var sCid in G._aiSiege[sCo]) {
                            var st = G._aiSiege[sCo][sCid];
                            var sCity = G.cities[sCid];
                            siegeInfo.push((sCity ? sCity.id : sCid) + '[' + sCo + ']' + (st.stage || '?'));
                        }
                    }
                    L('围攻状态: ' + (siegeInfo.join(' ') || '无'));
                }
                var countries = ['GERMANY', 'RUSSIA', 'AUSTRIA_HUNGARY', 'FRANCE', 'BELGIUM'];
                for (var c = 0; c < countries.length; c++) {
                    var co2 = countries[c];
                    var myDivs = G.divisions.filter(function(d) { return d.country === co2 && d.strength > 0; });
                    if (myDivs.length === 0) { L(co2 + ': 无单位'); continue; }
                    var targetStats = {}, idleCount = 0, idleNoTask = 0;
                    var artAlone = 0, artInGroup = 0, artIdle = 0;
                    for (var j = 0; j < myDivs.length; j++) {
                        var dd = myDivs[j];
                        if (!dd._aiTask) idleNoTask++;
                        if (dd.state === 'idle' && !dd._aiTask) idleCount++;
                        if (dd.type === 'artillery') {
                            if (dd.armyGroupId || dd._aiTask === 'ATTACK') artInGroup++;
                            else { artAlone++; if (!dd._aiTask) artIdle++; }
                        }
                        if (!dd._aiTaskTarget) continue;
                        var owner = '?', bestD = 999;
                        for (var cid2 in G.cities) { var cc2 = G.cities[cid2]; if (!cc2) continue; var dist3 = Math.hypot(cc2.lon - dd._aiTaskTarget.lon, cc2.lat - dd._aiTaskTarget.lat); if (dist3 < bestD) { bestD = dist3; owner = cc2.owner || '中立'; } }
                        if (owner !== '?') targetStats[owner] = (targetStats[owner] || 0) + 1;
                    }
                    var ts = Object.keys(targetStats).map(function(k) { return k + ':' + targetStats[k]; }).join(' ') || '无目标';
                    var comp = {};
                    for (var k = 0; k < myDivs.length; k++) comp[myDivs[k].type] = (comp[myDivs[k].type] || 0) + 1;
                    var cs = Object.keys(comp).map(function(k2) { return k2 + ':' + comp[k2]; }).join(' ');
                    var ax = 0, ay = 0;
                    for (var m = 0; m < myDivs.length; m++) { ax += myDivs[m].rx; ay += myDivs[m].ry; }
                    ax /= myDivs.length; ay /= myDivs.length;
                    L(co2 + ' [兵种 ' + cs + '] [目标→' + ts + '] [呆兵 ' + idleCount + '/' + idleNoTask + '] [火炮 独' + artAlone + ' 组' + artInGroup + '] [位置 ' + ax.toFixed(1) + ',' + ay.toFixed(1) + ']');
                }
                // 德国详细诊断：边境守军 + 呆兵位置分布
                var gerDivs = G.divisions.filter(function(d) { return d.country === 'GERMANY' && d.strength > 0; });
                var gerIdleSpots = {};
                for (var gi = 0; gi < gerDivs.length; gi++) {
                    var gd = gerDivs[gi];
                    if (gd.state === 'idle' && !gd._aiTask) {
                        var key = gd.rx.toFixed(1) + ',' + gd.ry.toFixed(1);
                        gerIdleSpots[key] = (gerIdleSpots[key] || 0) + 1;
                    }
                }
                var spots = Object.keys(gerIdleSpots).map(function(k2) { return k2 + 'x' + gerIdleSpots[k2]; }).slice(0, 8).join(' ');
                L('德国呆兵分布: ' + (spots || '无'));
                // 任务分布诊断：各国 DEFEND/ATTACK/空闲 数 + 德国攻击目标
                var taskCounts = ['GERMANY', 'RUSSIA', 'FRANCE', 'AUSTRIA_HUNGARY'].map(function(cc) {
                    var cd_ = G.divisions.filter(function(dd4) { return dd4.country === cc && dd4.strength > 0; });
                    var nDef = 0, nAtk = 0, nIdle = 0;
                    for (var ti = 0; ti < cd_.length; ti++) {
                        if (cd_[ti]._aiTask === 'DEFEND_CITY') nDef++;
                        else if (cd_[ti]._aiTask === 'ATTACK') nAtk++;
                        else nIdle++;
                    }
                    return cc + '(守' + nDef + ' 攻' + nAtk + ' 闲' + nIdle + ')';
                }).join(' ');
                L('任务分布: ' + taskCounts);
                // 德国攻击目标明细（正在攻哪些敌城）
                var gerAtkTargets = {};
                for (var gt = 0; gt < gerDivs.length; gt++) {
                    var gtd = gerDivs[gt];
                    if (gtd._aiTask !== 'ATTACK' || !gtd._aiTaskTarget) continue;
                    var bd2 = 999, bt = '?';
                    for (var cid7 in G.cities) {
                        var cc7 = G.cities[cid7];
                        if (!cc7) continue;
                        var d8 = Math.hypot(cc7.lon - gtd._aiTaskTarget.lon, cc7.lat - gtd._aiTaskTarget.lat);
                        if (d8 < bd2) { bd2 = d8; bt = cc7.id + '(' + (cc7.owner || '中立') + ')'; }
                    }
                    if (bt !== '?') gerAtkTargets[bt] = (gerAtkTargets[bt] || 0) + 1;
                }
                var gatk = Object.keys(gerAtkTargets).map(function(k3) { return k3 + 'x' + gerAtkTargets[k3]; }).join(' ') || '无';
                L('德国攻击目标: ' + gatk);
                L('德国单位数: ' + gerDivs.length);
                // ── 重诊断（遍历全部城市×单位，非常耗时）：每 300 帧输出一次 ──
                if ((frame + 1) % 300 === 0) {
                    // 德法边境德军（离法国城市<3°的德军）
                    var frCities = [];
                    for (var cid3 in G.cities) { var fc = G.cities[cid3]; if (fc && fc.owner === 'FRANCE') frCities.push(fc); }
                    var borderCount = 0;
                    for (var gi2 = 0; gi2 < gerDivs.length; gi2++) {
                        var gd2 = gerDivs[gi2];
                        var nearestFr = 999;
                        for (var fi = 0; fi < frCities.length; fi++) {
                            var d5 = Math.hypot(frCities[fi].lon - gd2.rx, frCities[fi].lat - gd2.ry);
                            if (d5 < nearestFr) nearestFr = d5;
                        }
                        if (nearestFr < 3.0) borderCount++;
                    }
                    L('德国本土守军: ' + gerDivs.filter(function(d) { return d.rx > 8.0; }).length + ' 法境前线德军: ' + borderCount);
                    // 德国各单位位置分布（诊断：谁在动、谁卡住、目标是谁）
                    var gerDetail = gerDivs.slice(0, 22).map(function(d) {
                        var tOwner = '?';
                        if (d._aiTaskTarget) {
                            var bd = 999;
                            for (var cid5 in G.cities) { var cc5 = G.cities[cid5]; if (!cc5) continue; var d6 = Math.hypot(cc5.lon - d._aiTaskTarget.lon, cc5.lat - d._aiTaskTarget.lat); if (d6 < bd) { bd = d6; tOwner = cc5.id + '(' + (cc5.owner || '中立') + ')'; } }
                        }
                        return d.type[0] + '@' + d.rx.toFixed(1) + ',' + d.ry.toFixed(1) + (d.state === 'moving' ? '→' : '·') + (tOwner === '?' ? '无' : tOwner);
                    }).join(' ');
                    L('德国单位: ' + gerDetail);
                    // 中立城市诊断（与 ai_controller isNeutralCity 一致：未交战国家城市）
                    var neutralList = [];
                    var gerAtWar = (typeof getEnemiesOf === 'function') ? getEnemiesOf('GERMANY') : [];
                    for (var cidN in G.cities) {
                        var ncN = G.cities[cidN];
                        if (!ncN || ncN.hp <= 0) continue;
                        if (ncN.owner === 'GERMANY' || (ncN.owner && gerAtWar.indexOf(ncN.owner) !== -1)) continue;
                        var nd = 999;
                        for (var cidM in G.cities) { var ocM = G.cities[cidM]; if (!ocM || ocM.owner !== 'GERMANY') continue; var dN = Math.hypot(ncN.lon - ocM.lon, ncN.lat - ocM.lat); if (dN < nd) nd = dN; }
                        if (nd < 10) neutralList.push(ncN.id + '(' + (ncN.owner || '无主') + ')@' + ncN.lon.toFixed(1) + ',' + ncN.lat.toFixed(1) + '距' + nd.toFixed(1));
                    }
                    L('德国附近中立城: ' + (neutralList.join(' ') || '无'));
                    var neutralTargetCount = 0;
                    for (var gi3 = 0; gi3 < gerDivs.length; gi3++) {
                        var gd3 = gerDivs[gi3];
                        if (!gd3._aiTaskTarget) continue;
                        for (var cidN2 in G.cities) { var ncN2 = G.cities[cidN2]; if (!ncN2 || ncN2.hp <= 0) continue; if (ncN2.owner === 'GERMANY' || (ncN2.owner && gerAtWar.indexOf(ncN2.owner) !== -1)) continue; var dN2 = Math.hypot(ncN2.lon - gd3._aiTaskTarget.lon, ncN2.lat - gd3._aiTaskTarget.lat); if (dN2 < 0.5) { neutralTargetCount++; break; } }
                    }
                    L('德国目标中立城单位数: ' + neutralTargetCount);
                    // 奥匈目标明细诊断
                    var ahDivs = G.divisions.filter(function(d) { return d.country === 'AUSTRIA_HUNGARY' && d.strength > 0; });
                    var ahDetail = ahDivs.map(function(d) {
                        var tOwner = '?';
                        if (d._aiTaskTarget) {
                            var bd = 999;
                            for (var cid6 in G.cities) { var cc6 = G.cities[cid6]; if (!cc6) continue; var d7 = Math.hypot(cc6.lon - d._aiTaskTarget.lon, cc6.lat - d._aiTaskTarget.lat); if (d7 < bd) { bd = d7; tOwner = cc6.id + '(' + (cc6.owner || '中立') + ')'; } }
                        }
                        return d.type[0] + '@' + d.rx.toFixed(1) + ',' + d.ry.toFixed(1) + (d.state === 'moving' ? '→' : '·') + (tOwner === '?' ? '无' : tOwner);
                    }).join(' ');
                    L('奥匈单位: ' + ahDetail);
                }
            }
        }
        L('===== 模拟完成 =====');
    } catch (e) {
        var em = 'unknown';
        try { em = e && e.stack || String(e); } catch (e2) { try { em = String(e); } catch (e3) { em = '?'; } }
        L('✗ 模拟异常: ' + em);
    }
    try { process.exit(0); } catch (e) {}
})();
`;
try {
    vm.runInContext(SIM_CODE, sandbox, { filename: 'sim' });
} catch (e) {
    var em2 = 'unknown';
    try { em2 = e && e.stack || String(e); } catch (e2) { try { em2 = String(e); } catch (e3) { em2 = '?'; } }
    log('✗ vm 执行异常: ' + em2);
}
