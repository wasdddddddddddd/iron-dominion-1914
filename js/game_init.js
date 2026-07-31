// Country selection and game initialization

const SELECTABLE_COUNTRIES = [
    { id:'GERMANY', name:'德意志帝国', desc:'强大的中央帝国，两线作战的挑战', color:'#7899a5', treasury:500, divs:6 },
    { id:'FRANCE', name:'法兰西共和国', desc:'复仇与保卫祖国，抵御德国入侵', color:'#5b8cb5', treasury:400, divs:5 },
    { id:'UK', name:'大不列颠', desc:'日不落帝国，制海权与全球利益', color:'#c44a4a', treasury:600, divs:4 },
    { id:'AUSTRIA_HUNGARY', name:'奥匈帝国', desc:'多民族帝国，在巴尔干与东线苦战', color:'#a08060', treasury:300, divs:4 },
    { id:'ITALY', name:'意大利王国', desc:'新生强国，伺机而动选择阵营', color:'#5a9c6a', treasury:250, divs:3 },
    { id:'RUSSIA', name:'俄罗斯帝国', desc:'压路机般的人力优势，虽落后但庞大', color:'#6a8a5a', treasury:350, divs:5 },
    { id:'TURKEY', name:'奥斯曼帝国', desc:'病夫之躯，控制海峡与中东', color:'#8a7a5a', treasury:200, divs:3 },
    { id:'SPAIN', name:'西班牙王国', desc:'从辉煌中苏醒，维护殖民帝国尊严', color:'#D4A843', treasury:300, divs:3 },
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

function startGame(countryId) {
    initGame(countryId, false);
}

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
});
