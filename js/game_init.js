// Country selection and game initialization

const SELECTABLE_COUNTRIES = [
    { id:'GERMANY', name:'德意志帝国', desc:'强大的中央帝国，两线作战的挑战', color:'#7899a5', treasury:500, divs:6 },
    { id:'FRANCE', name:'法兰西共和国', desc:'复仇与保卫祖国，抵御德国入侵', color:'#5b8cb5', treasury:400, divs:5 },
    { id:'UK', name:'大不列颠', desc:'日不落帝国，制海权与全球利益', color:'#c44a4a', treasury:600, divs:4 },
    { id:'AUSTRIA_HUNGARY', name:'奥匈帝国', desc:'多民族帝国，在巴尔干与东线苦战', color:'#a08060', treasury:300, divs:4 },
    { id:'ITALY', name:'意大利王国', desc:'新生强国，伺机而动选择阵营', color:'#5a9c6a', treasury:250, divs:3 },
    { id:'RUSSIA', name:'俄罗斯帝国', desc:'压路机般的人力优势，虽落后但庞大', color:'#6a8a5a', treasury:350, divs:5 },
    { id:'TURKEY', name:'奥斯曼帝国', desc:'病夫之躯，控制海峡与中东', color:'#8a7a5a', treasury:200, divs:3 },
];

function showCountrySelect() {
    let list = document.getElementById('countryList');
    if (!list) return;
    list.innerHTML = '';
    for (let c of SELECTABLE_COUNTRIES) {
        let card = document.createElement('div');
        card.style.cssText = `
            background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
            border-radius:6px;padding:16px;cursor:pointer;transition:all 0.2s;
            text-align:center;
        `;
        card.innerHTML = `
            <div style="width:100%;height:4px;background:${c.color};margin-bottom:10px;border-radius:2px;"></div>
            <div style="font-size:18px;font-weight:bold;color:#e8d8b0;">${c.name}</div>
            <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,0.4);">${c.desc}</div>
            <div style="font-size:11px;margin-top:8px;color:rgba(255,255,255,0.3);">
                💰${c.treasury} ⚔${c.divs}师团
            </div>
        `;
        card.onmouseenter = () => {
            card.style.background = 'rgba(255,255,255,0.1)';
            card.style.borderColor = c.color;
            card.style.transform = 'scale(1.03)';
        };
        card.onmouseleave = () => {
            card.style.background = 'rgba(255,255,255,0.05)';
            card.style.borderColor = 'rgba(255,255,255,0.1)';
            card.style.transform = 'scale(1)';
        };
        card.onclick = () => startGame(c.id);
        list.appendChild(card);
    }
}

function startGame(countryId) {
    G.playerCountry = countryId;
    document.getElementById('countrySelect').style.display = 'none';
    G.paused = true; // 暂停游戏，先看操作指南
    addGameLog("选择国家: " + (COUNTRY_CN[countryId]||countryId));
    showTutorial();
}

function showTutorial() {
    var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    var overlay = document.createElement('div');
    overlay.id = 'tutorialOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;';

    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,25,40,0.97);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:30px 36px;max-width:560px;width:90vw;max-height:85vh;overflow-y:auto;color:#e0d8c0;text-align:center;';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:24px;color:#c8b88a;margin-bottom:6px;';
    title.textContent = '操作指南';

    var subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:20px;';
    subtitle.textContent = isMobile ? '触屏操作' : '键鼠操作';

    var content = document.createElement('div');
    content.style.cssText = 'text-align:left;font-size:14px;line-height:1.8;';

    if (isMobile) {
        content.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">' +
            '<div style="color:rgba(255,255,255,0.5);">单指拖拽</div><div>平移地图</div>' +
            '<div style="color:rgba(255,255,255,0.5);">双指捏合</div><div>缩放地图</div>' +
            '<div style="color:rgba(255,255,255,0.5);">单击单位/城市</div><div>选中目标</div>' +
            '<div style="color:rgba(255,255,255,0.5);">单击空地</div><div>移动选中单位</div>' +
            '<div style="color:rgba(255,255,255,0.5);">长按敌方</div><div>集火攻击（右键）</div>' +
            '<div style="color:rgba(255,255,255,0.5);">点击顶部按钮</div><div>外交/生产/存档</div>' +
            '<div style="color:rgba(255,255,255,0.5);">点击底栏标签</div><div>切换面板</div>' +
            '</div>';
    } else {
        content.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">' +
            '<div style="color:rgba(255,255,255,0.5);">鼠标拖拽</div><div>平移地图</div>' +
            '<div style="color:rgba(255,255,255,0.5);">滚轮</div><div>缩放地图</div>' +
            '<div style="color:rgba(255,255,255,0.5);">左键点击单位</div><div>选中 / 框选</div>' +
            '<div style="color:rgba(255,255,255,0.5);">左键点击空地</div><div>移动选中单位</div>' +
            '<div style="color:rgba(255,255,255,0.5);">右键点击敌方</div><div>集火攻击目标</div>' +
            '<div style="color:rgba(255,255,255,0.5);">点击顶部按钮</div><div>外交 / 生产 / 存档</div>' +
            '<div style="color:rgba(255,255,255,0.5);">点击底栏标签</div><div>切换功能面板</div>' +
            '<div style="color:rgba(255,255,255,0.5);">空格键</div><div>暂停 / 继续</div>' +
            '</div>';
    }

    var hint = document.createElement('div');
    hint.style.cssText = 'margin-top:10px;font-size:11px;color:rgba(255,255,255,0.25);';
    hint.textContent = '选中单位后，右下角会出现操作按钮（驻守/巡逻/前线等）';

    var btn = document.createElement('div');
    btn.style.cssText = 'margin-top:24px;padding:10px 40px;background:rgba(200,184,138,0.2);border:1px solid rgba(200,184,138,0.5);border-radius:6px;color:#c8b88a;font-size:16px;cursor:pointer;display:inline-block;transition:all 0.2s;';
    btn.textContent = '开始游戏';
    btn.onmouseenter = function() { btn.style.background = 'rgba(200,184,138,0.35)'; };
    btn.onmouseleave = function() { btn.style.background = 'rgba(200,184,138,0.2)'; };
    btn.onclick = function() {
        overlay.remove();
        G.paused = false;
    };
    // 移动端触摸反馈
    btn.ontouchstart = function() { btn.style.background = 'rgba(200,184,138,0.35)'; };
    btn.ontouchend = function() { btn.style.background = 'rgba(200,184,138,0.2)'; };

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
    setTimeout(() => {
        document.getElementById("loading").classList.add("hidden");
        showCountrySelect();
    }, 500);
});
