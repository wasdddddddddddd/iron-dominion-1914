// Country selection and game initialization
// 资金分配：德国 9999（强大AI），其他列强 3000，小国 500
const SELECTABLE_COUNTRIES = [
    { id:'GERMANY', name:'德意志帝国', desc:'强大的中央帝国，两线作战的挑战', color:'#7899a5', treasury:9999, divs:6 },
    { id:'FRANCE', name:'法兰西共和国', desc:'复仇与保卫祖国，抵御德国入侵', color:'#5b8cb5', treasury:3000, divs:5 },
    { id:'UK', name:'大不列颠', desc:'日不落帝国，制海权与全球利益', color:'#c44a4a', treasury:3000, divs:4 },
    { id:'AUSTRIA_HUNGARY', name:'奥匈帝国', desc:'多民族帝国，在巴尔干与东线苦战', color:'#a08060', treasury:3000, divs:4 },
    { id:'ITALY', name:'意大利王国', desc:'新生强国，伺机而动选择阵营', color:'#5a9c6a', treasury:3000, divs:3 },
    { id:'RUSSIA', name:'俄罗斯帝国', desc:'压路机般的人力优势，虽落后但庞大', color:'#6a8a5a', treasury:3000, divs:5 },
    { id:'TURKEY', name:'奥斯曼帝国', desc:'病夫之躯，控制海峡与中东', color:'#8a7a5a', treasury:500, divs:3 },
    { id:'SPAIN', name:'西班牙王国', desc:'从辉煌中苏醒，维护殖民帝国尊严', color:'#D4A843', treasury:500, divs:3 },
];

function showCountrySelect() {
    let list = document.getElementById('countryList');
    if (!list) return;
    list.innerHTML = '';
    for (let c of SELECTABLE_COUNTRIES) {
        let card = document.createElement('div');
        card.style.cssText = `
            background:linear-gradient(180deg,rgba(40,28,14,0.55),rgba(28,18,8,0.65));border:1px solid rgba(180,140,80,0.18);
            border-radius:3px;padding:16px;cursor:pointer;transition:all 0.3s;
            text-align:center;
        `;
        card.innerHTML = `
            <div style="width:100%;height:3px;background:${c.color};margin-bottom:12px;border-radius:1px;opacity:0.8;"></div>
            <div style="font-size:17px;font-weight:bold;color:#e0d0b0;letter-spacing:1px;">${c.name}</div>
            <div style="font-size:11px;margin-top:8px;color:rgba(200,180,150,0.5);line-height:1.5;">${c.desc}</div>
            <div style="font-size:11px;margin-top:10px;color:rgba(200,180,150,0.35);letter-spacing:1px;">
                ${c.treasury} 金 · ${c.divs} 师团
            </div>
        `;
        card.onmouseenter = () => {
            card.style.background = 'linear-gradient(180deg,rgba(60,40,18,0.65),rgba(40,24,10,0.75))';
            card.style.borderColor = c.color;
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.45),0 0 30px rgba(200,168,48,0.08)';
        };
        card.onmouseleave = () => {
            card.style.background = 'linear-gradient(180deg,rgba(40,28,14,0.55),rgba(28,18,8,0.65))';
            card.style.borderColor = 'rgba(180,140,80,0.18)';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        };
        card.onclick = () => startGame(c.id);
        list.appendChild(card);
    }
}

// ===== 开发者模式设置（开局经济/维护费） =====
window.DEV_SETTINGS = {
    on: false,
    maint: 1.5,          // 维护费 金币/师团/天
    treasury: {},        // { 国家码: 开局金币 }；未含覆盖时用默认
    allMajors: null,     // 全部列强统一金币（null = 不统一）
    minors: null         // 小国统一开局金币（null = 不统一）
};
var DEV_SETTINGS = window.DEV_SETTINGS;
const DEV_MAJORS = ['GERMANY', 'FRANCE', 'UK', 'AUSTRIA_HUNGARY', 'ITALY', 'RUSSIA'];
const DEV_MINORS = ['TURKEY', 'SPAIN', 'PORTUGAL', 'BELGIUM', 'NETHERLANDS', 'LUXEMBOURG',
    'SWITZERLAND', 'SERBIA', 'MONTENEGRO', 'BULGARIA', 'ROMANIA', 'ALBANIA', 'GREECE',
    'NORWAY', 'SWEDEN', 'DENMARK', 'FINLAND'];

function devSettingsLoad() {
    try {
        let s = JSON.parse(localStorage.getItem('id1914_dev') || 'null');
        if (s && typeof s === 'object') {
            DEV_SETTINGS.on    = !!s.on;
            DEV_SETTINGS.maint = isFinite(s.maint) ? s.maint : 1.5;
            DEV_SETTINGS.treasury = s.treasury && typeof s.treasury === 'object' ? s.treasury : {};
            DEV_SETTINGS.majorTreasury = isFinite(s.majorTreasury) ? s.majorTreasury : null;
            DEV_SETTINGS.minors = isFinite(s.minors) ? s.minors : null;
        }
    } catch (e) {}
}
function _devStore() {
    try {
        localStorage.setItem('id1914_dev', JSON.stringify({
            on: DEV_SETTINGS.on, maint: DEV_SETTINGS.maint, treasury: DEV_SETTINGS.treasury,
            majorTreasury: DEV_SETTINGS.majorTreasury, minors: DEV_SETTINGS.minors
        }));
    } catch (e) {}
}

function setupDevPanel() {
    let wrap = document.getElementById('devPanelWrap');
    if (!wrap || document.getElementById('devPanel')) return;

    // 开关按钮
    let toggle = document.createElement('div');
    toggle.id = 'devToggle';
    toggle.style.cssText = 'display:inline-block;margin-top:10px;padding:8px 22px;border:1px solid rgba(200,168,48,0.35);color:#c8a830;cursor:pointer;font-size:12px;letter-spacing:2px;user-select:none;';
    toggle.textContent = DEV_SETTINGS.on ? '⚙️ 开发者模式：开' : '⚙️ 开发者模式：关';
    toggle.onclick = function () {
        DEV_SETTINGS.on = !DEV_SETTINGS.on;
        toggle.textContent = DEV_SETTINGS.on ? '⚙️ 开发者模式：开' : '⚙️ 开发者模式：关';
        let p = document.getElementById('devPanel');
        if (p) p.style.display = DEV_SETTINGS.on ? 'block' : 'none';
        _devStore();
    };
    wrap.appendChild(toggle);

    function devInputId(c) { return 'devT_' + c; }

    // 设置面板
    let panel = document.createElement('div');
    panel.id = 'devPanel';
    panel.style.cssText = 'max-width:720px;width:95vw;margin:12px auto 0;background:rgba(30,22,12,0.85);border:1px solid rgba(200,168,48,0.25);padding:14px 18px;text-align:left;color:#c8b898;font-size:12px;line-height:1.6;display:' + (DEV_SETTINGS.on ? 'block' : 'none');
    panel.innerHTML = `
        <div style="color:#e8d080;letter-spacing:2px;margin-bottom:10px;">⚙️ 开发者设置</div>
        <div style="display:grid;grid-template-columns:220px 1fr;gap:6px 10px;align-items:center;">
            <div>军队维护费（金币/师团/天）</div>
            <div><input id="devMaint" type="number" min="0" max="20" step="0.1" value="${DEV_SETTINGS.maint}" style="width:90px;">（0=关闭）</div>
            <div style="grid-column:1/3;margin-top:8px;color:#a09870;">开局国库（列强可单个调整，也可一键统一）</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 150px 1fr 150px;gap:6px 10px;margin-top:4px;align-items:center;">
            <div>★ 德国</div><div><input id="devT_GERMANY" type="number" min="0" step="500" style="width:150px;"></div>
            <div>★ 法国</div><div><input id="devT_FRANCE" type="number" min="0" step="500" style="width:150px;"></div>
            <div>★ 大不列颠</div><div><input id="devT_UK" type="number" min="0" step="500" style="width:150px;"></div>
            <div>★ 奥匈</div><div><input id="devT_AUSTRIA_HUNGARY" type="number" min="0" step="500" style="width:150px;"></div>
            <div>★ 意大利</div><div><input id="devT_ITALY" type="number" min="0" step="500" style="width:150px;"></div>
            <div>★ 俄国</div><div><input id="devT_RUSSIA" type="number" min="0" step="500" style="width:150px;"></div>
            <div style="color:#d4a44a;">◆ 全部列强统一</div><div><input id="devT_ALL" type="number" min="0" step="500" style="width:150px;"> <span id="devApplyAll" style="color:#c8a830;cursor:pointer;font-size:11px;">应用</span></div>
            <div style="color:#b8a080;">▪ 小国统一</div><div><input id="devT_MINORS" type="number" min="0" step="500" style="width:150px;"> <span id="devApplyMinors" style="color:#c8a830;cursor:pointer;font-size:11px;">应用</span></div>
        </div>
        <div style="margin-top:12px;color:rgba(200,180,150,0.45);font-size:11px;">游戏开始时应用。留空的国家用默认开局资金。非开发者模式不受影响。首次选择国家后自动保存。</div>
    `;

    // 单行预填（若有已保存值）
    let saved = DEV_SETTINGS.treasury || {};
    for (let c of DEV_MAJORS) {
        let el = panel.querySelector('#' + devInputId(c));
        if (el && saved[c] !== undefined) el.value = saved[c];
    }
    let ma = panel.querySelector('#devT_ALL');
    if (DEV_SETTINGS.majorTreasury !== null) ma.value = DEV_SETTINGS.majorTreasury;
    let mi = panel.querySelector('#devT_MINORS');
    if (DEV_SETTINGS.minors !== null) mi.value = DEV_SETTINGS.minors;

    wrap.appendChild(panel);

    function devCollectFromUI() {
        let t = {};
        for (let c of DEV_MAJORS) {
            let el = panel.querySelector('#' + devInputId(c));
            if (el && el.value !== '') { let v = parseFloat(el.value); if (isFinite(v)) t[c] = v; }
        }
        return t;
    }
    panel.querySelector('#devApplyAll').onclick = function () {
        let v = parseFloat(ma.value);
        if (!isFinite(v)) return;
        for (let c of DEV_MAJORS) { let el = panel.querySelector('#' + devInputId(c)); if (el) el.value = v; }
        DEV_SETTINGS.majorTreasury = v;
        DEV_SETTINGS.treasury = devCollectFromUI();
        _devStore();
    };
    panel.querySelector('#devApplyMinors').onclick = function () {
        let v = parseFloat(mi.value);
        if (!isFinite(v)) return;
        DEV_SETTINGS.minors = v;
        _devStore();
    };
    function devSaveUI() {
        let mv = parseFloat(panel.querySelector('#devMaint').value);
        DEV_SETTINGS.maint = isFinite(mv) && mv >= 0 ? mv : 0;
        DEV_SETTINGS.treasury = devCollectFromUI();
        let av = parseFloat(ma.value);
        DEV_SETTINGS.majorTreasury = isFinite(av) ? av : null;
        let nv = parseFloat(mi.value);
        DEV_SETTINGS.minors = isFinite(nv) ? nv : null;
        _devStore();
    }
    panel.querySelector('#devMaint').oninput = devSaveUI;
    for (let c of DEV_MAJORS) {
        let el = panel.querySelector('#' + devInputId(c));
        if (el) el.oninput = devSaveUI;
    }
    ma.oninput = devSaveUI;
    mi.oninput = devSaveUI;
}

/** 应用开发者设置到游戏开局（startGame → initGame 间调用） */
function applyDevSetup() {
    if (!DEV_SETTINGS.on) return;
    if (typeof G === 'object' && G) G.devMode = true;
    // 军队维护费全局（供 updateEconomy 读取）
    window._devMaintOverride = DEV_SETTINGS.maint;
    // 金币
    let t = DEV_SETTINGS.treasury || {};
    for (let c of DEV_MAJORS) {
        if (G.countries[c]) {
            if (t[c] !== undefined && t[c] !== null) G.countries[c].treasury = Math.max(0, t[c]);
            else if (DEV_SETTINGS.majorTreasury !== null) G.countries[c].treasury = Math.max(0, DEV_SETTINGS.majorTreasury);
        }
    }
    if (DEV_SETTINGS.minors !== null) {
        for (let c of DEV_MINORS) if (G.countries[c]) G.countries[c].treasury = Math.max(0, DEV_SETTINGS.minors);
    }
    try { if (typeof addGameLog === 'function') addGameLog('⚙️ 已应用开发者经济设置'); } catch (e) {}
}
devSettingsLoad();

function startGame(countryId) {
    // 标记已选择国家，利用用户点击手势触发音频播放（绕过浏览器自动播放限制）
    try {
        if (typeof MUSIC_QUEUE !== 'undefined') {
            MUSIC_QUEUE.playerCountry = countryId;
            MUSIC_QUEUE._countrySelected = true;
            if (!MUSIC_QUEUE.audio && typeof startBGM === 'function') {
                startBGM();
            }
            // 确保在用户手势下恢复/启动播放（解决浏览器自动播放拦截）
            if (MUSIC_QUEUE.audio) {
                var p = MUSIC_QUEUE.audio.play();
                if (p) p.catch(function(){});
            }
        }
    } catch(e) {
        console.warn('BGM setup failed:', e);
    }
    initGame(countryId, false);
    applyDevSetup();
}

function devSetupPanelHook() {
    if (typeof setupDevPanel === 'function') setupDevPanel();
}

// Show country selection when page loads
window.addEventListener("load", () => {
    showCountrySelect();
    setupDevPanel();
});

function showTutorial() {
    var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    var overlay = document.createElement('div');
    overlay.id = 'tutorialOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(5,3,0,0.9);z-index:300;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;';

    var box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(180deg,rgba(30,22,12,0.98),rgba(20,14,8,0.98));border:2px solid rgba(180,140,80,0.3);border-radius:4px;padding:30px 36px;max-width:560px;width:90vw;max-height:85vh;overflow-y:auto;color:#d4c0a0;text-align:center;box-shadow:0 0 40px rgba(0,0,0,0.6),inset 0 0 60px rgba(200,168,48,0.03);';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:26px;color:#c8a830;margin-bottom:6px;letter-spacing:4px;';
    title.textContent = '操作指南';

    var subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:12px;color:rgba(200,180,150,0.4);margin-bottom:24px;letter-spacing:2px;';
    subtitle.textContent = isMobile ? '触屏操作' : '键鼠操作';

    var content = document.createElement('div');
    content.style.cssText = 'text-align:left;font-size:14px;line-height:1.8;color:#c8b898;';

    if (isMobile) {
        content.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">' +
            '<div style="color:rgba(200,180,150,0.45);">单指拖拽</div><div>平移地图</div>' +
            '<div style="color:rgba(200,180,150,0.45);">双指捏合</div><div>缩放地图</div>' +
            '<div style="color:rgba(200,180,150,0.45);">单击单位/城市</div><div>选中目标</div>' +
            '<div style="color:rgba(200,180,150,0.45);">单击空地</div><div>移动选中单位</div>' +
            '<div style="color:rgba(200,180,150,0.45);">长按敌方</div><div>集火攻击（右键）</div>' +
            '<div style="color:rgba(200,180,150,0.45);">点击顶部按钮</div><div>外交/生产/存档</div>' +
            '<div style="color:rgba(200,180,150,0.45);">点击底栏标签</div><div>切换面板</div>' +
            '</div>';
    } else {
        content.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">' +
            '<div style="color:rgba(200,180,150,0.45);">鼠标拖拽</div><div>平移地图</div>' +
            '<div style="color:rgba(200,180,150,0.45);">滚轮</div><div>缩放地图</div>' +
            '<div style="color:rgba(200,180,150,0.45);">左键点击单位</div><div>选中 / 框选</div>' +
            '<div style="color:rgba(200,180,150,0.45);">左键点击空地</div><div>移动选中单位</div>' +
            '<div style="color:rgba(200,180,150,0.45);">右键点击敌方</div><div>集火攻击目标</div>' +
            '<div style="color:rgba(200,180,150,0.45);">点击顶部按钮</div><div>外交 / 生产 / 存档</div>' +
            '<div style="color:rgba(200,180,150,0.45);">点击底栏标签</div><div>切换功能面板</div>' +
            '<div style="color:rgba(200,180,150,0.45);">空格键</div><div>暂停 / 继续</div>' +
            '</div>';
    }

    var hint = document.createElement('div');
    hint.style.cssText = 'margin-top:10px;font-size:11px;color:rgba(200,180,150,0.3);letter-spacing:1px;';
    hint.textContent = '选中单位后，右下角会出现操作按钮（驻守/巡逻/前线等）';

    var btn = document.createElement('div');
    btn.style.cssText = 'margin-top:24px;padding:10px 40px;background:linear-gradient(180deg,rgba(60,50,25,0.5),rgba(40,30,15,0.6));border:1px solid rgba(200,168,48,0.4);border-radius:2px;color:#c8b070;font-size:16px;cursor:pointer;display:inline-block;transition:all 0.2s;letter-spacing:2px;';
    btn.textContent = '开始游戏';
    btn.onmouseenter = function() { btn.style.background = 'linear-gradient(180deg,rgba(80,60,30,0.6),rgba(50,35,18,0.7))'; btn.style.borderColor = 'rgba(200,168,48,0.6)'; };
    btn.onmouseleave = function() { btn.style.background = 'linear-gradient(180deg,rgba(60,50,25,0.5),rgba(40,30,15,0.6))'; btn.style.borderColor = 'rgba(200,168,48,0.4)'; };
    btn.onclick = function() {
        overlay.remove();
        G.paused = false;
    };
    // 移动端触摸反馈
    btn.ontouchstart = function() { btn.style.background = 'linear-gradient(180deg,rgba(80,60,30,0.6),rgba(50,35,18,0.7))'; };
    btn.ontouchend = function() { btn.style.background = 'linear-gradient(180deg,rgba(60,50,25,0.5),rgba(40,30,15,0.6))'; };

    box.appendChild(title);
    box.appendChild(subtitle);
    box.appendChild(content);
    box.appendChild(hint);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// Show country selection when page loads
window.addEventListener("load", () => {
    showCountrySelect();
    if (typeof setupDevPanel === 'function') setupDevPanel();
});
