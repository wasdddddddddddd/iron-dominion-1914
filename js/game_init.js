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
    G.paused = false;
    addGameLog("选择国家: " + (COUNTRY_CN[countryId]||countryId));
    // No initial wars. Player can declare war via diplomacy panel.
}

// Show country selection when page loads
window.addEventListener("load", () => {
    setTimeout(() => {
        document.getElementById("loading").classList.add("hidden");
        showCountrySelect();
    }, 500);
});
