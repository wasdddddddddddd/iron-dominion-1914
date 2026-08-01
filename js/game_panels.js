// Iron & Dominion 1914 — 游戏UI面板（地图绘制、师团、炮弹、面板）

// ===== 师团像素图片缓存 =====
// 预加载所有单位类型和建筑物的像素风格图片，自动去除白色背景
const UNIT_IMAGES = {};
const BUILDING_IMAGES = {};

function _removeWhiteBg(img) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width, h = canvas.height;

        // 四角 + 四条边中点采样，避开主体可能延伸到的区域
        const cornerSize = Math.max(3, Math.floor(Math.min(w, h) * 0.08));
        const samples = [];
        // 四角密集采样（每个角取 5x5 像素区域）
        const corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
        for (let [cx, cy] of corners) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    let sx = cx + dx, sy = cy + dy;
                    if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                        samples.push([sx, sy]);
                    }
                }
            }
        }
        // 四条边中点附近采样（各3个点）
        const midX = Math.floor(w/2), midY = Math.floor(h/2);
        samples.push([midX, 0], [midX, 1], [midX, 2]);           // 上边中点
        samples.push([midX, h-1], [midX, h-2], [midX, h-3]);     // 下边中点
        samples.push([0, midY], [1, midY], [2, midY]);           // 左边中点
        samples.push([w-1, midY], [w-2, midY], [w-3, midY]);     // 右边中点

        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let [sx, sy] of samples) {
            if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
            let idx = (sy * w + sx) * 4;
            sumR += data[idx]; sumG += data[idx + 1]; sumB += data[idx + 2];
            count++;
        }

        if (count === 0) return canvas;
        let avgR = Math.round(sumR / count);
        let avgG = Math.round(sumG / count);
        let avgB = Math.round(sumB / count);

        // 如果检测到的背景色太暗（亮度<180），说明采样到了主体，回退到近白色去除
        let bgR = avgR, bgG = avgG, bgB = avgB;
        let brightness = (avgR + avgG + avgB) / 3;
        if (brightness < 180) {
            bgR = 255; bgG = 255; bgB = 255;
        }

        // 用背景色 ±60 阈值去除背景
        const threshold = 60;
        for (let i = 0; i < data.length; i += 4) {
            if (Math.abs(data[i] - bgR) < threshold &&
                Math.abs(data[i + 1] - bgG) < threshold &&
                Math.abs(data[i + 2] - bgB) < threshold) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    } catch (e) {
        console.warn('White bg removal failed for image, using raw:', e.message);
        return img;
    }
}

function _loadAndProcess(src, targetObj, key, pixelate = false) {
    const img = new Image();
    img.onload = function() {
        let processed = img;
        if (pixelate) {
            // 降低分辨率实现像素化效果
            const offCanvas = document.createElement('canvas');
            const scale = 0.4;
            offCanvas.width = Math.max(1, Math.floor(img.width * scale));
            offCanvas.height = Math.max(1, Math.floor(img.height * scale));
            const oc = offCanvas.getContext('2d');
            oc.imageSmoothingEnabled = false;
            oc.drawImage(img, 0, 0, offCanvas.width, offCanvas.height);
            processed = offCanvas;
        }
        targetObj[key] = processed;
    };
    img.onerror = function() {
        console.warn('Failed to load image:', src);
    };
    img.src = src;
}

// 国家专属贴图文件夹映射
const COUNTRY_IMG_FOLDER = {
    'UK': 'uk', 'FRANCE': 'france', 'GERMANY': 'germany',
    'AUSTRIA_HUNGARY': 'austria', 'ITALY': 'italy', 'RUSSIA': 'russia'
};
// 国家专属贴图类型（步兵、骑兵、海军；工兵/炮兵/潜艇不区分国家）
const COUNTRY_SPECIFIC_TYPES = ['infantry', 'cavalry', 'navy'];

function preloadUnitImages() {
    // 通用单位贴图（工兵/炮兵/潜艇所有国家共用，步兵/骑兵/海军非列强国家使用）
    // 海军不像素化，其余单位降低分辨率实现像素化效果
    for (let [type, cfg] of Object.entries(UNIT_TYPES)) {
        if (cfg.img) _loadAndProcess(cfg.img, UNIT_IMAGES, type, type !== 'navy');
    }
    // 加载六大列强国家专属贴图（步兵、骑兵像素化，海军不像素化）
    for (let [country, folder] of Object.entries(COUNTRY_IMG_FOLDER)) {
        for (let type of COUNTRY_SPECIFIC_TYPES) {
            _loadAndProcess('images/' + folder + '/' + type + '.png', UNIT_IMAGES, country + '_' + type, type !== 'navy');
        }
    }
    // 建筑物图片（不像素化）
    _loadAndProcess('images/building_capital.png', BUILDING_IMAGES, 'capital');
    _loadAndProcess('images/building_major.png', BUILDING_IMAGES, 'major');
    _loadAndProcess('images/building_small.png', BUILDING_IMAGES, 'small');
    _loadAndProcess('images/building_factory.png', BUILDING_IMAGES, 'factory');
    _loadAndProcess('images/building_naval.png', BUILDING_IMAGES, 'naval');
}

// ===== 地形底图（由 exportImage.tiff 转换，海面已透明） =====
function preloadTerrain() {
    const img = new Image();
    img.onload = function() { window.TERRAIN_IMG = img; };
    img.onerror = function() { console.warn('Failed to load terrain image'); window.TERRAIN_IMG = null; };
    img.src = 'images/terrain_land.png';
    window.TERRAIN_IMG = img;
    // 山地图层（DEM 提取的 hillshade 光影 + 真实山脊线）
    const mtn = new Image();
    mtn.onload = function() { window.MOUNTAIN_IMG = mtn; };
    mtn.onerror = function() { console.warn('Failed to load mountain layer'); window.MOUNTAIN_IMG = null; };
    mtn.src = 'images/mountain_layer.png';
    window.MOUNTAIN_IMG = mtn;
}
function terrainReady() {
    return !!(typeof window.TERRAIN_IMG !== 'undefined' && window.TERRAIN_IMG && window.TERRAIN_IMG.complete && window.TERRAIN_IMG.naturalWidth > 0);
}
function mountainReady() {
    return !!(typeof window.MOUNTAIN_IMG !== 'undefined' && window.MOUNTAIN_IMG && window.MOUNTAIN_IMG.complete && window.MOUNTAIN_IMG.naturalWidth > 0);
}

// ===== 加载旗帜贴图 =====
const FLAG_IMAGES = {};
const FLAG_COUNTRIES = ['uk','greece','russia','spain','portugal','albania','austria','montenegro',
    'germany','france','italy','turkey','belgium','netherlands','switzerland','denmark',
    'sweden','luxembourg','norway','serbia','bulgaria','romania','finland'];
const FLAG_COUNTRY_MAP = {
    'UK': 'uk', 'GREECE': 'greece', 'RUSSIA': 'russia',
    'SPAIN': 'spain', 'PORTUGAL': 'portugal', 'ALBANIA': 'albania',
    'AUSTRIA_HUNGARY': 'austria', 'MONTENEGRO': 'montenegro',
    'GERMANY': 'germany', 'FRANCE': 'france', 'ITALY': 'italy', 'TURKEY': 'turkey',
    'BELGIUM': 'belgium', 'NETHERLANDS': 'netherlands', 'SWITZERLAND': 'switzerland',
    'DENMARK': 'denmark', 'SWEDEN': 'sweden', 'LUXEMBOURG': 'luxembourg',
    'NORWAY': 'norway', 'SERBIA': 'serbia', 'BULGARIA': 'bulgaria',
    'ROMANIA': 'romania', 'FINLAND': 'finland',
};
for (let fc of FLAG_COUNTRIES) {
    let img = new Image();
    img.src = 'flags/' + fc + '.png';
    img.onerror = function() { FLAG_IMAGES[fc] = null; };
    img.onload = function() { FLAG_IMAGES[fc] = img; };
    FLAG_IMAGES[fc] = img;
}

// ===== 一战国旗绘制函数 =====
function drawCountryFlag(country, x, y, w, h) {
    // 先尝试使用贴图旗帜
    let flagKey = FLAG_COUNTRY_MAP[country];
    if (flagKey && FLAG_IMAGES[flagKey] && FLAG_IMAGES[flagKey].complete && FLAG_IMAGES[flagKey].naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(FLAG_IMAGES[flagKey], x, y, w, h);
        ctx.restore();
        return;
    }
    // 无贴图则用Canvas绘制
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    switch(country) {
        case 'GERMANY':
            ctx.fillStyle='#000'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#c00'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'FRANCE':
            ctx.fillStyle='#002395'; ctx.fillRect(x,y,w/3,h);
            ctx.fillStyle='#fff'; ctx.fillRect(x+w/3,y,w/3,h);
            ctx.fillStyle='#ed2939'; ctx.fillRect(x+2*w/3,y,w/3,h);
            break;
        case 'UK':
            // 蓝底
            ctx.fillStyle='#012169'; ctx.fillRect(x,y,w,h);
            // 白色对角十字（圣安德鲁）
            ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1,h*0.12);
            ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y+h); ctx.moveTo(x+w,y); ctx.lineTo(x,y+h); ctx.stroke();
            // 白色正十字（圣乔治）
            ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w/2,y+h); ctx.moveTo(x,y+h/2); ctx.lineTo(x+w,y+h/2); ctx.stroke();
            // 红色对角十字（圣帕特里克，偏移显示）
            ctx.strokeStyle='#c8102e'; ctx.lineWidth=Math.max(1,h*0.06);
            ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
            let offset = Math.max(1, h*0.04);
            ctx.beginPath(); ctx.moveTo(x-offset,y); ctx.lineTo(x+w-offset,y+h); ctx.moveTo(x+w+offset,y); ctx.lineTo(x+offset,y+h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x,y+h/2-offset); ctx.lineTo(x+w,y+h/2-offset); ctx.moveTo(x,y+h/2+offset); ctx.lineTo(x+w,y+h/2+offset); ctx.stroke();
            ctx.restore();
            break;
        case 'ITALY':
            ctx.fillStyle='#009246'; ctx.fillRect(x,y,w/3,h);
            ctx.fillStyle='#fff'; ctx.fillRect(x+w/3,y,w/3,h);
            ctx.fillStyle='#ce2b37'; ctx.fillRect(x+2*w/3,y,w/3,h);
            break;
        case 'AUSTRIA_HUNGARY':
            // 左半（奥地利红白红）
            ctx.fillStyle='#ed2939'; ctx.fillRect(x,y,w/2,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x,y+h/3,w/2,h/3);
            ctx.fillStyle='#ed2939'; ctx.fillRect(x,y+2*h/3,w/2,h/3);
            // 右半（匈牙利红白绿）
            ctx.fillStyle='#ed2939'; ctx.fillRect(x+w/2,y,w/2,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x+w/2,y+h/3,w/2,h/3);
            ctx.fillStyle='#477050'; ctx.fillRect(x+w/2,y+2*h/3,w/2,h/3);
            // 中间分割线
            ctx.strokeStyle='#333'; ctx.lineWidth=Math.max(1,h*0.03);
            ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w/2,y+h); ctx.stroke();
            // 中间盾徽
            ctx.fillStyle='#c8a830';
            ctx.beginPath(); ctx.arc(x+w/2,y+h*0.5,Math.max(3,h*0.12),0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#ed2939';
            ctx.beginPath(); ctx.arc(x+w/2,y+h*0.5,Math.max(2,h*0.08),0,Math.PI*2); ctx.fill();
            break;
        case 'RUSSIA':
            ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#0039a6'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#d52b1e'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'TURKEY':
            ctx.fillStyle='#e30a17'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fff';
            let cx=x+w*0.42, cy2=y+h*0.5, r=h*0.28;
            ctx.beginPath(); ctx.arc(cx,cy2,r,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#e30a17'; ctx.beginPath(); ctx.arc(cx+r*0.18,cy2,r*0.78,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#fff';
            let sx2=x+w*0.6, sy2=y+h*0.35, sr=h*0.1;
            ctx.beginPath(); ctx.arc(sx2,sy2,sr,0,Math.PI*2); ctx.fill();
            break;
        case 'SPAIN':
            ctx.fillStyle='#c60b1e'; ctx.fillRect(x,y,w,h*0.25);
            ctx.fillStyle='#ffc400'; ctx.fillRect(x,y+h*0.25,w,h*0.5);
            ctx.fillStyle='#c60b1e'; ctx.fillRect(x,y+h*0.75,w,h*0.25);
            ctx.fillStyle='#8B4513';
            ctx.beginPath(); ctx.arc(x+w*0.38,y+h*0.5,h*0.12,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#ffc400';
            ctx.beginPath(); ctx.arc(x+w*0.38,y+h*0.5,h*0.08,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#c60b1e';
            ctx.fillRect(x+w*0.36,y+h*0.42,h*0.04,h*0.05);
            ctx.fillRect(x+w*0.36,y+h*0.55,h*0.04,h*0.05);
            break;
        case 'PORTUGAL':
            ctx.fillStyle='#006600'; ctx.fillRect(x,y,w*0.4,h);
            ctx.fillStyle='#ff0000'; ctx.fillRect(x+w*0.4,y,w*0.6,h);
            ctx.fillStyle='#006600';
            ctx.beginPath(); ctx.arc(x+w*0.4,y+h*0.5,h*0.2,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#ffc400';
            ctx.beginPath(); ctx.arc(x+w*0.4,y+h*0.5,h*0.14,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#006600';
            ctx.beginPath(); ctx.arc(x+w*0.4,y+h*0.5,h*0.09,0,Math.PI*2); ctx.fill();
            break;
        case 'BELGIUM':
            ctx.fillStyle='#000'; ctx.fillRect(x,y,w/3,h);
            ctx.fillStyle='#fdda44'; ctx.fillRect(x+w/3,y,w/3,h);
            ctx.fillStyle='#ef3340'; ctx.fillRect(x+2*w/3,y,w/3,h);
            break;
        case 'NETHERLANDS':
            ctx.fillStyle='#ae1c28'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#21468b'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'SWITZERLAND':
            ctx.fillStyle='#d52b1e'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fff';
            let cw=w*0.5, ch=h*0.18, ccx=x+w/2, ccy=y+h/2;
            ctx.fillRect(ccx-cw/2,ccy-ch/2,cw,ch);
            ctx.fillRect(ccx-ch/2,ccy-cw/2,ch,cw);
            break;
        case 'DENMARK':
            ctx.fillStyle='#c60c30'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fff';
            ctx.fillRect(x,y+h*0.38,w,h*0.12);
            ctx.fillRect(x+w*0.28,y,w*0.12,h);
            break;
        case 'SWEDEN':
            ctx.fillStyle='#006aa7'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fecc02';
            ctx.fillRect(x,y+h*0.36,w,h*0.15);
            ctx.fillRect(x+w*0.32,y,w*0.12,h);
            break;
        case 'LUXEMBOURG':
            ctx.fillStyle='#ed2939'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#00a1de'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'NORWAY':
            ctx.fillStyle='#ba0c2e'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fff';
            ctx.fillRect(x,y+h*0.36,w,h*0.18);
            ctx.fillRect(x+w*0.28,y,w*0.16,h);
            ctx.fillStyle='#00205b';
            ctx.fillRect(x,y+h*0.40,w,h*0.10);
            ctx.fillRect(x+w*0.32,y,w*0.08,h);
            break;
        case 'SERBIA':
            ctx.fillStyle='#c6363c'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#0c4076'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#fff'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'MONTENEGRO':
            ctx.fillStyle='#c40308'; ctx.fillRect(x,y,w,h);
            ctx.strokeStyle='#daa520'; ctx.lineWidth=Math.max(1,h*0.08);
            ctx.strokeRect(x+2,y+2,w-4,h-4);
            break;
        case 'BULGARIA':
            ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h/3);
            ctx.fillStyle='#00966e'; ctx.fillRect(x,y+h/3,w,h/3);
            ctx.fillStyle='#d62612'; ctx.fillRect(x,y+2*h/3,w,h/3);
            break;
        case 'ROMANIA':
            ctx.fillStyle='#002b7f'; ctx.fillRect(x,y,w/3,h);
            ctx.fillStyle='#fcd116'; ctx.fillRect(x+w/3,y,w/3,h);
            ctx.fillStyle='#ce1126'; ctx.fillRect(x+2*w/3,y,w/3,h);
            break;
        case 'GREECE':
            ctx.fillStyle='#0d5eaf'; ctx.fillRect(x,y,w,h);
            for(let i=0;i<9;i++){
                ctx.fillStyle=(i%2===0)?'#fff':'#0d5eaf';
                ctx.fillRect(x,y+i*h/9,w,h/9);
            }
            ctx.fillStyle='#0d5eaf'; ctx.fillRect(x,y,w*0.4,h*0.44);
            ctx.fillStyle='#fff';
            ctx.fillRect(x+w*0.18,y+h*0.18,w*0.04,h*0.08);
            ctx.fillRect(x+w*0.14,y+h*0.20,w*0.12,h*0.04);
            break;
        case 'ALBANIA':
            ctx.fillStyle='#e41e20'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#000';
            let ex=x+w/2, ey=y+h*0.35;
            ctx.beginPath(); ctx.moveTo(ex,ey);
            ctx.lineTo(ex-w*0.15,ey+h*0.35); ctx.lineTo(ex+w*0.15,ey+h*0.35);
            ctx.closePath(); ctx.fill();
            break;
        case 'FINLAND':
            ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#003580';
            ctx.fillRect(x,y+h*0.36,w,h*0.15);
            ctx.fillRect(x+w*0.28,y,w*0.12,h);
            break;
        default:
            ctx.fillStyle=COUNTRY_COLORS[country]||'#666'; ctx.fillRect(x,y,w,h);
            ctx.fillStyle='#fff'; ctx.font=Math.max(8,h*0.4)+'px sans-serif';
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(country.substring(0,2),x+w/2,y+h/2);
    }
    ctx.restore();
}

// ===== 地图上绘制师团和炮弹 =====
function drawSelBox(){
if(!G.selBox)return;
let s=G.selBox;
ctx.save();
ctx.strokeStyle="rgba(255,200,50,0.5)";
ctx.fillStyle="rgba(255,200,50,0.08)";
ctx.lineWidth=1;
ctx.setLineDash([4,4]);
let rx=Math.min(s.x1,s.x2),ry=Math.min(s.y1,s.y2),rw=Math.abs(s.x2-s.x1),rh=Math.abs(s.y2-s.y1);
ctx.strokeRect(rx,ry,rw,rh);
ctx.fillRect(rx,ry,rw,rh);
ctx.setLineDash([]);
ctx.restore();
}

function drawDivisions() {
    // 1) Projectiles
    if (G.projectiles) {
        for (let p of G.projectiles) {
            let [px, py] = worldToScreen(p.x, p.y);
            if (px < -50 || px > canvas.width+50 || py < -50 || py > canvas.height+50) continue;
            ctx.save();
            if (p.type === 'artillery') {
                let [sx, sy] = worldToScreen(p.startX, p.startY);
                ctx.beginPath(); ctx.moveTo(sx, sy);
                for (let i=1; i<=20; i++) {
                    let t = i/20;
                    let tx = p.startX + (p.endX - p.startX) * t;
                    let ty = p.startY + (p.endY - p.startY) * t + Math.sin(t*Math.PI) * (p.arcHeight || 0.3);
                    let [ptx, pty] = worldToScreen(tx, ty);
                    ctx.lineTo(ptx, pty);
                }
                ctx.strokeStyle = "rgba(255,200,50,0.12)"; ctx.lineWidth = 1; ctx.setLineDash([3,4]);
                ctx.stroke(); ctx.setLineDash([]);
            }
            let r = p.type === 'artillery' ? 4 : p.torpedo ? 4 : 2.5;
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2);
            ctx.fillStyle = p.torpedo ? "#44aaff" : (p.red ? "#ff4444" : "#ffcc00");
            ctx.fill();
            ctx.shadowColor = p.torpedo ? "#4488ff" : (p.red ? "#ff4444" : "#ffaa00");
            ctx.shadowBlur = p.torpedo ? 8 : 10;
            ctx.fill(); ctx.shadowBlur = 0;
            ctx.restore();
        }
    }
    // 2) Units - fixed pixel size regardless of zoom
    // Draw range circle for single-selected unit
    let singleSel = (G.selectedDivisions.length === 1 && !selectedProvince) ? G.divisions.find(d => d.id === G.selectedDivisions[0]) : null;
    if (singleSel) {
        let rx = (singleSel.rx!==undefined) ? singleSel.rx : null;
        let ry = (singleSel.ry!==undefined) ? singleSel.ry : null;
        if (rx===null) { let pd = G.provinceData[singleSel.province]; if(pd&&pd.center){rx=pd.center[0];ry=pd.center[1];} }
        let [sx, sy] = worldToScreen(rx, ry);
        let ut = UNIT_TYPES[singleSel.type] || UNIT_TYPES.infantry;
        let [rx2, ry2] = worldToScreen(rx + ut.range, ry);
        let rPixels = Math.abs(rx2 - sx);
        ctx.save();
        ctx.beginPath(); ctx.arc(sx, sy, rPixels, 0, Math.PI*2);
        ctx.strokeStyle = "rgba(255,200,50,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([5,5]);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,200,50,0.04)"; ctx.fill();
        ctx.restore();
    }

    // City attack range circle when selected
    if (G.selectedCity) {
        let city = G.selectedCity;
        let cityData = G.cities[city.id];
        if (cityData && cityData.hp > 0) {
            let [sx, sy] = worldToScreen(city.lon, city.lat);
            let isCap = city.isCapital || false;
            let isMaj = typeof isMajorCity === 'function' && isMajorCity(city.id);
            let vRange = (isCap || isMaj) ? 0.30 : 0.24;
            let [rx2, ry2] = worldToScreen(city.lon + vRange, city.lat);
            let rPixels = Math.abs(rx2 - sx);
            let ownerColor = COUNTRY_COLORS[city.owner] || '#fff';
            let r = parseInt(ownerColor.slice(1,3),16), g = parseInt(ownerColor.slice(3,5),16), b = parseInt(ownerColor.slice(5,7),16);
            let brightness = (r*299 + g*587 + b*114) / 1000;
            let useWhite = brightness < 180;
            ctx.save();
            ctx.beginPath(); ctx.arc(sx, sy, rPixels, 0, Math.PI*2);
            ctx.strokeStyle = useWhite ? "rgba(200,180,150,0.6)" : "rgba(0,0,0,0.6)";
            ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = useWhite ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
            ctx.fill();
            ctx.restore();
        }
    }

    // Helper to check at-war status
    function isAtWarWithPlayer(country) {
        return G.playerCountry && areAtWar(G.playerCountry, country);
    }

    // Check if a unit has focus target (for focus fire visual)
    // 陆军/海军缩放到大城市级别（zoom>0.35）时显示
    if (zoom > 0.35) {
    for (let div of G.divisions) {
        let rx = (div.rx!==undefined) ? div.rx : null;
        let ry = (div.ry!==undefined) ? div.ry : null;
        if (rx===null) {
            let pd = G.provinceData[div.province];
            if (!pd||!pd.center) continue;
            rx = pd.center[0]; ry = pd.center[1];
        }
        let [sx, sy] = worldToScreen(rx, ry);
        if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) continue;
        let isPlayer = div.country === G.playerCountry;
        let isSel = G.selectedDivisions.includes(div.id);
        let BASE = 7;
        let r = isSel ? BASE + 3 : BASE;
        let ut = UNIT_TYPES[div.type] || UNIT_TYPES.infantry;

        // === 选中时才显示外交圈 ===
        if (isSel) {
            let isAlly = G.alliances && G.playerCountry && G.alliances[G.playerCountry] && G.alliances[G.playerCountry][div.country];
            let isAtWar = isAtWarWithPlayer(div.country);
            let bgColor;
            if (isPlayer) bgColor = "rgba(80,255,80,0.22)";
            else if (isAtWar) bgColor = "rgba(255,80,80,0.24)";
            else if (isAlly) bgColor = "rgba(80,160,255,0.22)";
            else bgColor = "rgba(255,255,150,0.16)";
            ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI*2);
            ctx.fillStyle = bgColor; ctx.fill();
            ctx.strokeStyle = bgColor.replace('0.24','0.5').replace('0.22','0.45').replace('0.16','0.35');
            ctx.lineWidth = 2; ctx.stroke();
        }

        // 国家色圆点（始终显示，但未选中时更小更淡）
        if (isSel) {
            ctx.shadowColor = "#c8a830"; ctx.shadowBlur = 10;
        }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
        ctx.fillStyle = COUNTRY_COLORS[div.country] || "#888";
        ctx.fill();
        ctx.shadowBlur = 0;
        if (isSel) { ctx.strokeStyle = "#c8a830"; ctx.lineWidth = 2; ctx.stroke(); }

        // === 脚底阴影（在单位贴图下方，潜水艇下潜时不显示） ===
        let imgSize = div.type === 'navy' ? r * 9 : r * 3.5;
        if (div.type !== 'submarine' || !div.submerged) {
            let shadowY = sy + imgSize * 0.5;
            let shadowRX = imgSize * 0.38;
            let shadowRY = imgSize * 0.06;
            ctx.beginPath();
            ctx.ellipse(sx, shadowY, shadowRX, shadowRY, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fill();
        }

        // === Draw pixel art unit image (country-specific, Canvas flip for direction) ===
        let countryImg = UNIT_IMAGES[div.country + '_' + div.type];
        let img = countryImg || UNIT_IMAGES[div.type];
        ctx.save();
        if (div.type === 'submarine') {
            let subAlpha = 1;
            if (div.submerged) subAlpha = 0.3;
            else if (div.diving) subAlpha = 0.3 + 0.7 * (1 - (div.diveProgress || 0));
            ctx.globalAlpha = subAlpha;
        }
        if (img && img.width > 0) {
            // 非潜艇单位轻微透明，让像素图融入纯色地图
            if (div.type !== 'submarine') {
                ctx.globalAlpha = div.type === 'navy' ? 0.92 : 0.85;
            }
            // 像素化单位关闭平滑以保留锯齿效果，海军保持原样
            if (div.type !== 'navy') ctx.imageSmoothingEnabled = false;
            // 方向翻转：德奥俄贴图默认朝左，英法意默认朝右，镜像逻辑相反
            const LEFT_FACING_COUNTRIES = ['GERMANY', 'AUSTRIA_HUNGARY', 'RUSSIA'];
            const isLeftFacing = LEFT_FACING_COUNTRIES.includes(div.country);
            // 右朝向贴图：朝西(w)时翻转；左朝向贴图：朝东(e)或无朝向时翻转
            const shouldFlip = (div.facing === 'w' && !isLeftFacing) ||
                               ((div.facing === 'e' || !div.facing) && isLeftFacing);
            if (shouldFlip) {
                ctx.translate(sx, sy);
                ctx.scale(-1, 1);
                ctx.drawImage(img, -imgSize/2, -imgSize/2, imgSize, imgSize);
            } else {
                ctx.drawImage(img, sx - imgSize/2, sy - imgSize/2, imgSize, imgSize);
            }
            if (div.type !== 'navy') ctx.imageSmoothingEnabled = true;
        } else {
            // 后备：图片未加载完成时显示emoji
            ctx.font = (r*1.5)+"px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = "#fff";
            ctx.fillText(ut.sym, sx, sy-1);
        }
        // 下潜状态提示（水波纹）
        if (div.submerged) {
            ctx.font = "7px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillStyle = "rgba(60,200,255,0.7)";
            ctx.fillText("🌊", sx, sy - r - 6);
        }
        ctx.restore();

        // === 陆军移动扬尘效果 ===
        let isMoving = div.state === 'moving' || div.moving || (div.targetX !== null && div.targetX !== undefined);
        if (isMoving && div.type !== 'navy' && div.type !== 'submarine') {
            let realNow = performance.now();
            let dustCount = 6;
            let dustBaseY = sy + imgSize * 0.45;
            for (let i = 0; i < dustCount; i++) {
                let seed = div.id * 100 + i;
                let angle = (realNow / 900 + seed * 1.7) % (Math.PI * 2);
                let dist = r * 1.0 + Math.sin(realNow / 500 + seed) * r * 0.5;
                let dx = Math.cos(angle) * dist;
                let dy = Math.sin(angle) * dist * 0.3;
                let alpha = 0.18 + Math.sin(realNow / 350 + seed * 2.3) * 0.10;
                let size = 1.5 + Math.sin(realNow / 280 + seed * 0.9) * 0.8;
                ctx.beginPath();
                ctx.arc(sx + dx, dustBaseY + dy, size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(160,140,115,' + alpha.toFixed(2) + ')';
                ctx.fill();
            }
        }

        // === Patrol shield icon above unit ===
        if (G.patrolTargets[div.id] && G.patrolTargets[div.id].length > 0) {
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(60,200,255,0.9)";
            ctx.fillText("🛡️", sx, sy - r - (div.formation === 'line' ? 20 : 8));
        }

        // Show focus target indicator
        if (div.focusTarget) {
            ctx.strokeStyle = "rgba(255,50,50,0.7)";
            ctx.lineWidth = 2;
            ctx.setLineDash([3,3]);
            ctx.beginPath(); ctx.arc(sx, sy, r+6, 0, Math.PI*2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Formation indicator chain icon
        if (div.formation === 'line') {
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(60,200,255,0.9)";
            ctx.fillText("⛓️", sx, sy - r - 8);
        }

        if (div.strength < div.maxStrength) {
            ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(sx - r - 1, sy - r - 5, (r+1)*2, 2);
            ctx.fillStyle = div.strength > 50 ? "#7a9a5a" : "#b05040";
            ctx.fillRect(sx - r - 1, sy - r - 5, (r+1)*2 * (div.strength / div.maxStrength), 2);
        }

        // === Reload cooldown bar (blue) below unit ===
        if (div.fireCooldown > 0 && div.maxFireCd > 0) {
            let barW = (r + 1) * 2;
            let barH = 4;
            let barY = sy + r + 4;
            let progress = 1 - (div.fireCooldown / div.maxFireCd);
            // 暗底
            ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(sx - r - 1, barY, barW, barH);
            // 亮蓝色进度
            ctx.fillStyle = "rgba(40,140,255,0.95)";
            ctx.fillRect(sx - r - 1, barY, barW * progress, barH);
            // 边框
            ctx.strokeStyle = "rgba(100,180,255,0.5)"; ctx.lineWidth = 0.5;
            ctx.strokeRect(sx - r - 1, barY, barW, barH);
        }

        // Hit flash: red overlay when damaged
        if (div.hitFlash > 0) {
            ctx.beginPath(); ctx.arc(sx, sy, r+2, 0, Math.PI*2);
            ctx.fillStyle = "rgba(255,0,0," + Math.min(1, div.hitFlash / 4) + ")";
            ctx.fill();
            div.hitFlash--;
        }
        // 手动重置状态（替代 save/restore，避免 GPU 状态栈开销）
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
    }
    } // end zoom check for unit drawing

    // ===== 集团军边框：同色圆环；选中集团军时脉冲高亮 =====
    if (zoom > 0.35 && G.commanderState && G.commanderState.groups && G.commanderState.groups.length > 0) {
        let t = Date.now() / 400;
        for (let div of G.divisions) {
            if (!div.armyGroupId) continue;
            let group = typeof getGroupById === 'function' ? getGroupById(div.armyGroupId) : null;
            if (!group || group.country !== G.playerCountry) continue;
            let rx = (div.rx !== undefined) ? div.rx : null;
            let ry = (div.ry !== undefined) ? div.ry : null;
            if (rx === null) { let pd = G.provinceData[div.province]; if (!pd || !pd.center) continue; rx = pd.center[0]; ry = pd.center[1]; }
            let [sx, sy] = worldToScreen(rx, ry);
            if (sx < -60 || sx > canvas.width + 60 || sy < -60 || sy > canvas.height + 60) continue;
            let col = typeof getGroupColor === 'function' ? getGroupColor(group) : "#888";
            let isSelGroup = G.selectedArmyGroupId === group.id;
            if (isSelGroup) {
                let pulse = 1 + 0.18 * Math.sin(t * 3);
                ctx.strokeStyle = col;
                ctx.lineWidth = 2.5;
                ctx.shadowColor = col; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(sx, sy, 11 * pulse, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = "rgba(255,215,0,0.9)";
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(sx, sy, 14.5 * pulse, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.85;
                ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    }

    // ===== Focus fire visual: red ring on enemy + red dashed lines from shooters (仅玩家) =====
    ctx.save();
    let drawnTargets = new Set();
    for (let div of G.divisions) {
        if (div.country !== G.playerCountry) continue;
        let targetId = div.focusTarget;
        if (!targetId) continue;
        let target = G.divisions.find(d => d.id === targetId);
        if (!target || target.strength <= 0) { div.focusTarget = null; continue; }

        let [sx, sy] = worldToScreen(div.rx, div.ry);
        let [tx, ty] = worldToScreen(target.rx, target.ry);

        // Red ring on target (draw once per target)
        if (!drawnTargets.has(target.id)) {
            drawnTargets.add(target.id);
            ctx.beginPath(); ctx.arc(tx, ty, 14, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(255,0,0,0.9)";
            ctx.lineWidth = 3;
            ctx.setLineDash([4,4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(tx, ty, 16, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(255,50,50,0.3)";
            ctx.lineWidth = 6;
            ctx.stroke();
        }

        // Red dashed line from shooter to target (ALWAYS drawn)
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.strokeStyle = "rgba(255,0,0,0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4,6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();

    // ===== Formation connecting lines =====
    // 快速检查：是否有任何一字阵单位
    let hasLine = false;
    for (let d of G.divisions) { if (d.formation === 'line') { hasLine = true; break; } }
    if (hasLine) {
    ctx.save();
    ctx.strokeStyle = "rgba(60,200,255,0.25)";
    ctx.lineWidth = 1.5;
    for (let d of G.divisions) {
        if (d.formation !== 'line') continue;
        for (let e of G.divisions) {
            if (e.formation !== 'line' || d.id >= e.id) continue;
            let dist = Math.hypot(d.rx - e.rx, d.ry - e.ry);
            if (dist < 0.5) {
                let [x1, y1] = worldToScreen(d.rx, d.ry);
                let [x2, y2] = worldToScreen(e.rx, e.ry);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }
        }
    }
    ctx.restore();
    }

    // ===== Focus factory visual (仅玩家) =====
    ctx.save();
    let drawnFactoryTargets = new Set();
    for (let div of G.divisions) {
        if (div.country !== G.playerCountry) continue;
        if (!div.focusFactory || !G.factories) continue;
        let fact = G.factories.find(f => f && f.id === div.focusFactory);
        if (!fact || fact.hp <= 0) continue;
        let [sx, sy] = worldToScreen(div.rx, div.ry);
        let [fx, fy] = worldToScreen(fact.rx, fact.ry);
        // Orange ring on factory target
        if (!drawnFactoryTargets.has(div.focusFactory)) {
            drawnFactoryTargets.add(div.focusFactory);
            ctx.beginPath(); ctx.arc(fx, fy, 14, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(255,150,0,0.9)";
            ctx.lineWidth = 3;
            ctx.setLineDash([4,4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // Orange dashed line from shooter to factory
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy);
        ctx.strokeStyle = "rgba(255,150,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4,6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();

    // ===== Focus city visual (仅玩家) =====
    ctx.save();
    let drawnCityTargets = new Set();
    for (let div of G.divisions) {
        if (div.country !== G.playerCountry) continue;
        if (!div.focusCity || !G.cities) continue;
        let city = G.cities[div.focusCity];
        if (!city || city.hp <= 0) continue;
        let [sx, sy] = worldToScreen(div.rx, div.ry);
        let [cx, cy] = worldToScreen(city.lon, city.lat);
        // Purple ring on city target
        if (!drawnCityTargets.has(div.focusCity)) {
            drawnCityTargets.add(div.focusCity);
            ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(200,50,200,0.9)";
            ctx.lineWidth = 3;
            ctx.setLineDash([4,4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // Purple dashed line from shooter to city
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy);
        ctx.strokeStyle = "rgba(200,50,200,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4,6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();

    // ===== Green move lines (like Red Alert) =====
    ctx.save();
    if (G.moveLines) {
        let now = Date.now();
        G.moveLines = G.moveLines.filter(line => {
            let elapsed = now - line.startTime;
            if (elapsed > 3000) return false; // fade out after 3s
            let [sx, sy] = worldToScreen(line.fromX, line.fromY);
            let [ex, ey] = worldToScreen(line.toX, line.toY);
            let alpha = 1 - elapsed / 4000;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = `rgba(80,255,80,${0.6 * alpha})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            // Arrowhead
            let angle = Math.atan2(ey - sy, ex - sx);
            let headLen = 8;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
            ctx.strokeStyle = `rgba(80,255,80,${0.8 * alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            return true;
        });
    }
    ctx.restore();

    // ===== Patrol indicator: show which units are on patrol (single-province home guard) =====
    ctx.save();
    for (let did in G.patrolTargets) {
        let d = G.divisions.find(x => x.id == did);
        if (!d) continue;
        let [sx, sy] = worldToScreen(d.rx, d.ry);
        ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(60,200,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3,5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

// ===== 顶层状态栏（游戏版） =====
function drawGameTopBar() {
    let h = TOP_BAR_HEIGHT;
    ctx.save();

    // 渐变背景（深色羊皮纸质感）
    let grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(22,16,10,0.92)");
    grad.addColorStop(1, "rgba(18,12,6,0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, h);

    // 底部黄铜装饰线
    CT.drawOrnamentLine(ctx, 0, h - 1, canvas.width);

    ctx.textBaseline = "middle";
    let cy = h / 2;

    // === LEFT SIDE: 国旗 + 经济 + 军队 + 人口 ===
    let lx = 12;
    let ge = G.playerCountry && G.countries && G.countries[G.playerCountry];
    if (ge) {
        // 国旗 (18x12)
        drawCountryFlag(G.playerCountry, lx, cy - 7, 18, 14);
        lx += 24;

        // 国家名
        ctx.fillStyle = CT.textH;
        ctx.font = "bold 11px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillText(COUNTRY_CN[G.playerCountry] || G.playerCountry, lx, cy);
        lx += ctx.measureText(COUNTRY_CN[G.playerCountry] || G.playerCountry).width + 14;

        // 分隔符
        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        // 💰 国库
        ctx.fillStyle = ge.treasury >= 0 ? CT.textH : CT.danger;
        ctx.font = "11px Georgia,serif";
        ctx.fillText("💰" + Math.floor(ge.treasury), lx, cy);
        lx += ctx.measureText("💰" + Math.floor(ge.treasury)).width + 8;

        // 📈 收入/支出
        ctx.fillStyle = ge.income >= ge.expenses ? "rgba(120,180,120,0.7)" : "rgba(200,120,120,0.7)";
        ctx.fillText("📈+" + ge.income + "/-" + ge.expenses, lx, cy);
        lx += ctx.measureText("📈+" + ge.income + "/-" + ge.expenses).width + 8;

        // 分隔符
        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        // 👥 人口
        ctx.fillStyle = ge.manpower > (ge.maxManpower || 1000000) * 0.2 ? "#7ab8d4" : CT.danger;
        ctx.fillText("👥" + Math.floor((ge.manpower || 0) / 1000) + "M", lx, cy);
        lx += ctx.measureText("👥" + Math.floor((ge.manpower || 0) / 1000) + "M").width + 8;

        // 分隔符
        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        // ⚔️ 师团
        let army = ge.divCount || 0;
        ctx.fillStyle = "#d4a44a";
        ctx.fillText("⚔️" + army + "师", lx, cy);
        lx += ctx.measureText("⚔️" + army + "师").width + 8;

        // 分隔符
        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        // 🏛️ 外交点数
        let dp = G.diplomacyPoints ? Math.floor(G.diplomacyPoints[G.playerCountry] || 0) : 0;
        ctx.fillStyle = dp >= 20 ? "#7ab8d4" : CT.danger;
        ctx.fillText("🏛️" + dp, lx, cy);
    }

    // === RIGHT SIDE: 日期 + 时间控制 ===
    let rx = canvas.width - 12;

    // === CENTER: 联机模式指示器 ===
    if (G.multiplayerMode) {
        ctx.fillStyle = G.multiplayerMode === 'host' ? "rgba(200,168,48,0.85)" : "rgba(100,160,200,0.85)";
        ctx.font = "bold 10px Georgia,serif";
        ctx.textAlign = "center";
        let mpLabel = G.multiplayerMode === 'host' ? '🏠 房主' : '🔗 客户端';
        let playerCount = (G.multiplayerSeats || []).filter(s => !s.isAI).length;
        ctx.fillText(mpLabel + ' | ' + playerCount + '位玩家', canvas.width / 2, cy);
    } else {
        // === CENTER: FPS 实时显示 ===
        let fps = window._fps || 0;
        ctx.fillStyle = fps >= 30 ? "rgba(120,200,120,0.85)" : "rgba(220,80,80,0.85)";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(fps + " FPS", canvas.width / 2, cy);
    }

    // 速度按钮 — 联机/单机两套独立系统
    G._spdBtns = [];
    if (G.multiplayerMode) {
        // 联机：1x 2x 4x 8x 16x
        let spd = [1, 2, 4, 8, 16];
        let curSpd = G.speed || 4;
        let isHost = G.multiplayerMode === 'host';
        for (let i = spd.length - 1; i >= 0; i--) {
            let bw = 26;
            let bx = rx - bw;
            let active = curSpd === spd[i];
            CT.drawSpeedBtn(ctx, bx, cy - 10, bw, 20, spd[i], active, !isHost);
            if (isHost) G._spdBtns.push({ x: bx, y: cy - 10, w: bw, h: 20, speed: spd[i] });
            rx = bx - 4;
        }
    } else {
        // 单机：2x 4x 8x 16x 32x 64x 128x
        let spd = [2, 4, 8, 16, 32, 64, 128];
        let curSpd = G.speed || 4;
        for (let i = spd.length - 1; i >= 0; i--) {
            let bw = 26;
            let bx = rx - bw;
            CT.drawSpeedBtn(ctx, bx, cy - 10, bw, 20, spd[i], curSpd === spd[i], false);
            G._spdBtns.push({ x: bx, y: cy - 10, w: bw, h: 20, speed: spd[i] });
            rx = bx - 4;
        }
    }

    // 暂停按钮
    let pauseW = 26;
    CT.drawButton(ctx, rx - pauseW, cy - 10, pauseW, 20, G.paused ? "▶" : "■", {
        style: G.paused ? "danger" : "success",
        font: "bold 12px Georgia,serif",
        radius: 2
    });
    G._pauseBtn = { x: rx - pauseW, y: cy - 10, w: pauseW, h: 20 };
    rx -= pauseW + 8;

    // 日期文本
    let ds = G.date.getFullYear() + "." + (G.date.getMonth()+1) + "." + G.date.getDate();
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "right";
    ctx.fillText(ds, rx, cy);

    ctx.restore();
}

// ===== 底部状态栏 =====
function drawGameBottomBar() {
    let barY = canvas.height - BOTTOM_BAR_HEIGHT;
    ctx.save();

    // 渐变背景
    let grad = ctx.createLinearGradient(0, barY, 0, barY + BOTTOM_BAR_HEIGHT);
    grad.addColorStop(0, "rgba(18,12,6,0.75)");
    grad.addColorStop(1, "rgba(22,16,10,0.7)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, barY, canvas.width, BOTTOM_BAR_HEIGHT);

    // 顶部黄铜装饰线
    CT.drawOrnamentLine(ctx, 0, barY, canvas.width);

    let layerName = "战略层";
    let layerColor = "#7ab8d4";
    if (zoom >= STRATEGIC_ZOOM && zoom < TACTICAL_ZOOM) { layerName = "战役层"; layerColor = "#c4a86a"; }
    else if (zoom >= TACTICAL_ZOOM) { layerName = "战术层"; layerColor = "#d47a7a"; }
    ctx.font = "bold 12px Georgia,serif";
    ctx.textAlign = "left";
    ctx.fillStyle = layerColor;
    ctx.fillText(layerName, 16, barY + 15);
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = CT.textD;
    ctx.fillText("滚轮缩放 · 中键拖移 · 左键框选 · Ctrl+数字编组", 16, barY + 33);
    ctx.textAlign = "right";
    ctx.fillStyle = CT.textD;
    ctx.font = "10px monospace";
    ctx.fillText("x" + zoom.toFixed(2), canvas.width - 16, barY + 15);
    ctx.textAlign = "right";
    ctx.fillStyle = CT.textM;
    ctx.font = "10px Georgia,serif";
    if (G.playerCountry) {
        ctx.fillText((COUNTRY_CN[G.playerCountry]||G.playerCountry) + "师团: " + G.divisions.filter(d => d.country === G.playerCountry).length, canvas.width - 16, barY + 33);
    } else {
        ctx.fillText("请选择国家", canvas.width - 16, barY + 33);
    }
    ctx.restore();
}

// ===== 选中省份/城市操作栏 =====
function drawActionBar() {
    if (!G.playerCountry) return;
    // 城市选中模式 — 已移至右侧面板 drawCityPanel()
    if (G.selectedCity) {
        drawCityPanel();
    } else if (G.selectedDivisions.length === 0 && G.selectedCities && G.selectedCities.length > 0) {
        // 框选多城市：同时选中单位时只显示单位
        drawMultiCityPanel();
    }
    // 海军节点选中模式 — 类似城市的生产界面 + 属性详情
    if (G.selectedNavyNodeOnMap && G.selectedNavyNode) {
        drawNavyNodePanel();
    }
}

// ===== 城市详情面板（右侧） =====
function drawCityPanel() {
    let city = G.selectedCity;
    if (!city) return;
    // 实时归属：以 G.cities 里的当前 owner 为准（避免快照过期，0HP 中立城市不显示旧归属）
    let cityData = G.cities[city.id];
    let liveOwner = (cityData && cityData.owner !== undefined) ? cityData.owner : city.owner;
    let isOwn = liveOwner === G.playerCountry;
    let treasury = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0;
    let cityFactories = CITY_FACTORIES[city.id] || 0;
    let manpower = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].manpower : 0;

    // 城市血量
    let cityHp = cityData ? cityData.hp : 50;
    let cityMaxHp = cityData ? cityData.maxHp : 50;
    // 检查该城市的建造队列
    let cityQueue = [];
    if (isOwn && G.buildQueue) {
        cityQueue = G.buildQueue.filter(bq => bq.cityId === city.id);
    }

    let x = canvas.width - 310;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 300;
    // 面板高度：按实际布局逐项计算并留底部空白，避免建造队列被截断
    let isOccupiedCity = cityData && cityData.occupierFlag;
    let typeCount = isOwn ? (isOccupiedCity ? 1 : (isMajorCity(city.id) ? 5 : 1)) : 0;
    let queueH = cityQueue.length > 0 ? 22 + cityQueue.length * 20 : 0;
    let upgradeH = 0;
    if (isOwn && !isMajorCity(city.id)) {
        let upgrading = G.buildQueue && G.buildQueue.some(bq => bq.type === 'upgrade_city' && bq.cityId === city.id);
        upgradeH = upgrading ? 39 : 30;
    }
    let baseH = isOwn ? 148 + typeCount * 26 + queueH + upgradeH : 150;
    let h = baseH;

    ctx.save();

    let accentColor = isOwn ? "#c8a830" : (liveOwner ? (COUNTRY_COLORS[liveOwner] || "#888") : "#666");

    // 使用 CT.drawPanel 绘制面板背景
    CT.drawPanel(ctx, x, y, w, h, { accentColor: accentColor });

    // 注册点击区域
    window._cityPanelRect = { x: x, y: y, w: w, h: h };

    // 城市名称 + 归属国
    ctx.fillStyle = "#c8a830";
    ctx.font = "bold 14px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("🏰 " + city.name, x + 12, y + 6);
    ctx.fillStyle = CT.textM;
    ctx.font = "12px Georgia,serif";
    ctx.fillText(liveOwner ? (COUNTRY_CN[liveOwner] || liveOwner) : "⚖️ 中立", x + 12, y + 24);

    // 城市血量
    let hpText = "❤️ 血量: " + Math.floor(cityHp) + "/" + Math.floor(cityMaxHp);
    if (cityHp < cityMaxHp) {
        let hpRatio = cityHp / cityMaxHp;
        let hpColor = hpRatio > 0.6 ? CT.success : hpRatio > 0.3 ? CT.warning : CT.danger;
        ctx.fillStyle = hpColor;
    } else {
        ctx.fillStyle = CT.textM;
    }
    ctx.font = "12px Georgia,serif";
    ctx.fillText(hpText, x + 12, y + 42);

    // 血量条
    let hpBarW = w - 24;
    let hpBarX = x + 12;
    let hpBarY = y + 56;
    let hpRatio = Math.max(0, cityHp / cityMaxHp);
    let hpColor = cityHp > cityMaxHp * 0.6 ? CT.success : cityHp > cityMaxHp * 0.3 ? CT.warning : CT.danger;
    CT.drawProgressBar(ctx, hpBarX, hpBarY, hpBarW, 4, hpRatio, hpColor);

    // 城市攻击冷却条
    let cityCdY = y + 63;
    if (cityData) {
        let cd = cityData.fireCooldown || 0;
        if (cd > 0) {
            let progress = 1 - (cd / (cityData.maxFireCd || 1));
            CT.drawProgressBar(ctx, x + 12, cityCdY, w - 24, 3, progress, "rgba(40,140,255,0.9)");
        }
        // 显示城市射程/伤害
        let isCap = city.isCapital || false;
        let isMaj = typeof isMajorCity === 'function' && isMajorCity(city.id);
        let cityRange = (isCap || isMaj) ? 0.30 : 0.24;
        let cityDmg = (isCap || isMaj) ? 50 : 30;
        ctx.fillStyle = "rgba(255,150,100,0.6)";
        ctx.font = "11px Georgia,serif";
        ctx.fillText("⚔ " + (isCap || isMaj ? "大" : "小") + "城 伤害:" + cityDmg + " 射程:" + cityRange, x + 12, cityCdY + (cd > 0 ? 5 : 2));
    }

    // 工厂数（仅本国显示）
    if (isOwn) {
        ctx.fillStyle = CT.textM;
        ctx.font = "12px Georgia,serif";
        ctx.fillText("🏭 工厂: " + cityFactories, x + 12, y + 76);
        if (city.isCapital || isMajorCity(city.id)) {
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            ctx.fillText("🏛️ 外交 +1.5/年", x + 12, y + 90);
        }
    }

    let ly = isOwn ? y + 100 : y + 76;
    if (!isOwn) {
        // 外国城市：显示驻军信息
        ly += 6;
        let garrisoned = G.divisions.filter(d => d.garrisonCityId === city.id && d.country === G.playerCountry);
        if (garrisoned.length > 0) {
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 6;
            ctx.fillStyle = CT.info;
            ctx.font = "bold 10px Georgia,serif";
            ctx.textAlign = "left";
            ctx.fillText("🛡️ 驻军: " + garrisoned.length + " 单位", x + 12, ly + 2);
            ly += 20;
        }
        // 显示敌对关系
        if (G.playerCountry && areAtWar(G.playerCountry, liveOwner)) {
            ctx.fillStyle = "#d44";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("⚔️ 交战中", x + w/2, ly);
            ly += 18;
        } else if (G.playerCountry && isSameFaction(G.playerCountry, liveOwner)) {
            ctx.fillStyle = "rgba(100,200,150,0.8)";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("🤝 同盟", x + w/2, ly);
            ly += 18;
        }
        if (!liveOwner && cityHp <= 0) {
            ctx.fillStyle = "#8ad4a4";
            ctx.font = "bold 10px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("⚖️ 中立 — 部队靠近即可占领", x + w/2, ly + 2);
            ly += 18;
        }
        ctx.restore();
        return;
    }

    // === 本国城市：生产 & 建造队列 ===
    if (!window._cityBtns) window._cityBtns = [];
    window._cityBtns = [];
    if (!window._cityPinBtns) window._cityPinBtns = [];
    window._cityPinBtns = [];
    // 分隔线
    CT.drawSeparator(ctx, x + 10, ly, w - 20);
    ly += 8;

    // 小城市升级按钮/进度条
    if (!isMajorCity(city.id)) {
        // 检查是否有正在进行的升级
        let upgradeItem = null;
        if (G.buildQueue) {
            for (let bq of G.buildQueue) {
                if (bq.type === 'upgrade_city' && bq.cityId === city.id) {
                    upgradeItem = bq; break;
                }
            }
        }
        if (upgradeItem) {
            // 显示升级进度条
            let progress = upgradeItem.totalDays > 0 ? Math.max(0, 1 - upgradeItem.days / upgradeItem.totalDays) : 0;
            let remaining = Math.ceil(upgradeItem.days);
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 27, "", { style: "default", radius: 2 });
            ctx.fillStyle = "#c8a830";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText("⬆️ 升级大城市 " + Math.floor(progress * 100) + "% (" + remaining + "天)", x + 14, ly + 8);
            // 进度条
            let barW2 = w - 36;
            CT.drawProgressBar(ctx, x + 14, ly + 18, barW2, 4, progress, CT.warning);
            ly += 31;
            // 分隔线
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 8;
        } else {
            let canUpgrade = treasury >= 150;
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "⬆️ 升级为大城市 ($150)", {
                hovered: hovered && canUpgrade,
                style: canUpgrade ? "highlight" : "default",
                font: "10px Georgia,serif"
            });
            window._cityBtns.push({ id: 'upgrade_city', x: x + 8, y: ly, w: w - 16, h: 22, enabled: canUpgrade });
            ly += 26;
            // 分隔线
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 8;
        }
    }

    // 生产选项
    ctx.fillStyle = CT.info;
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "center";
    ctx.fillText("— 生产 —", x + w/2, ly);
    ly += 18;

    let types = [];
    let isOccupied = cityData && cityData.occupierFlag;
    if (isOccupied) {
        // 占领城市只能生产步兵
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#7a9a5a', manpower:15});
    } else if (isMajorCity(city.id)) {
        types.push({id:'build_factory', label:'🏗️ 建工厂', cost:50, color:'#6a8a4a', desc: '当前' + cityFactories + '座'});
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#7a9a5a', manpower:15});
        types.push({id:'engineer', label:'⚙️ 工兵', cost:70, color:'#4a7a8a', manpower:12});
        types.push({id:'cavalry',  label:'🏇 骑兵', cost:80, color:'#8a7a4a', manpower:10});
        types.push({id:'artillery',label:'💥 炮兵', cost:120, color:'#8a4a5a', manpower:8});
    } else {
        // 小城市只能生产步兵
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#7a9a5a', manpower:15});
    }

    for (let t of types) {
        let can = treasury >= t.cost && (manpower === undefined || manpower >= (t.manpower || 0));
        let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        let style = 'default';
        if (t.id === 'build_factory') style = 'success';
        else if (t.id === 'infantry') style = 'success';
        else if (t.id === 'engineer') style = 'info';
        else if (t.id === 'cavalry') style = 'highlight';
        else if (t.id === 'artillery') style = 'danger';
        CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, t.label + " ($" + t.cost + ")", {
            hovered: hovered && can,
            style: can ? style : "default",
            font: "11px Georgia,serif"
        });
        if (t.desc) {
            ctx.fillStyle = can ? CT.textM : CT.textD;
            ctx.font = "9px Georgia,serif";
            ctx.textAlign = "right";
            ctx.fillText(t.desc, x + w - 14, ly + 11);
        }
        window._cityBtns.push({ id: t.id, x: x + 8, y: ly, w: w - 16, h: 22, enabled: can });
        ly += 26;
    }

    // 建造队列（显示在生产按钮下方）
    if (cityQueue.length > 0) {
        CT.drawSeparator(ctx, x + 10, ly, w - 20);
        ly += 6;
        ctx.fillStyle = "#4a8ad4";
        ctx.font = "bold 10px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillText("📋 建造队列:", x + 12, ly + 2);
        ly += 16;
        for (let bq of cityQueue) {
            let progress = bq.totalDays > 0 ? Math.round((1 - bq.days / bq.totalDays) * 100) : 0;
            let label = bq.type === 'factory' ? '🏗️ 工厂' : (UNIT_TYPES[bq.unitType] ? '[' + UNIT_TYPES[bq.unitType].label + ']' : '单位');
            let remaining = Math.ceil(bq.days);
            // 置顶按钮（最左侧，仅当非第一项时显示）
            let isFirst = (cityQueue.indexOf(bq) === 0);
            let pinX = x + 10;
            let pinHovered = !isFirst && mouseY !== undefined && mouseY > ly && mouseY < ly + 18 && mouseX > pinX - 2 && mouseX < pinX + 16;
            let pinColor = pinHovered ? CT.brass : CT.textD;
            if (!isFirst) {
                ctx.fillStyle = pinHovered ? "rgba(255,215,0,0.2)" : "rgba(180,140,80,0.05)";
                ctx.fillRect(pinX - 2, ly, 16, 18);
                ctx.fillStyle = pinColor;
                ctx.font = "11px Georgia,serif";
                ctx.textAlign = "center";
                ctx.fillText("▴", pinX + 6, ly + 6);
                window._cityPinBtns.push({ cityId: city.id, bqIndex: cityQueue.indexOf(bq), x: pinX - 2, y: ly, w: 16, h: 18 });
            }
            ctx.fillStyle = CT.textM;
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "left";
            ctx.fillText(label + " " + progress + "% (" + remaining + "天)", x + 28, ly + 2);
            // 迷你进度条
            let barW2 = w - 52;
            CT.drawProgressBar(ctx, x + 28, ly + 12, barW2, 3, progress / 100, "#4a8ad4");
            ly += 20;
        }
    }

    ctx.restore();
}

// ===== 海军节点详情面板（右侧，类似城市，含生产界面与属性详情） =====
function drawNavyNodePanel() {
    if (!G.selectedNavyNodeOnMap || !G.selectedNavyNode) return;
    let node = G.navyNodes[G.selectedNavyNode];
    if (!node) return;
    let isOwn = node.country === G.playerCountry;
    let treasury = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0;
    let manpower = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].manpower : 0;

    // 节点战斗属性（与 fireUnits 一致）
    let nRange = (UNIT_TYPES.navy.range || 1.2) * 1.2;
    let nDmg = 60;
    let nCd = (UNIT_TYPES.infantry.fireRate || 1) * 0.5;

    // 该节点建造队列
    let nodeQueue = [];
    if (isOwn && G.navyBuildQueue) {
        nodeQueue = G.navyBuildQueue.filter(bq => bq.nodeId === node.id);
    }
    let subCost = typeof UNIT_TYPES !== 'undefined' && UNIT_TYPES.submarine ? UNIT_TYPES.submarine.cost : 300;
    let canSub = typeof SUBMARINE_POWERS !== 'undefined' && SUBMARINE_POWERS.includes(G.playerCountry);
    let nextLv = null;
    if (typeof NODE_LEVELS !== 'undefined') {
        for (let nl of NODE_LEVELS) {
            if (nl.level === node.level + 1) { nextLv = nl; break; }
        }
    }

    let nBtn = (isOwn ? 1 : 0) + (isOwn && canSub ? 1 : 0) + (isOwn && nextLv ? 1 : 0);
    let queueH = nodeQueue.length > 0 ? 30 + nodeQueue.length * 22 : 0;
    let baseH = isOwn ? 128 + nBtn * 26 + queueH : 118;

    let x = canvas.width - 240;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 230;
    let h = baseH;

    ctx.save();
    let accent = isOwn ? "#c8a830" : (COUNTRY_COLORS[node.country] || "#888");
    CT.drawPanel(ctx, x, y, w, h, { accentColor: accent });
    window._navyNodeRect = { x: x, y: y, w: w, h: h };
    if (!window._navyNodeBtns) window._navyNodeBtns = [];
    window._navyNodeBtns = [];

    ctx.fillStyle = "#c8a830";
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("⚓ " + node.name, x + 12, y + 6);
    ctx.fillStyle = CT.textM;
    ctx.font = "11px Georgia,serif";
    ctx.fillText((COUNTRY_CN[node.country] || node.country) + " · Lv." + node.level + (node.region ? " · " + node.region : ""), x + 12, y + 24);

    // 节点血量
    let hp = node.hp || 0, maxHp = node.maxHp || 3000;
    ctx.fillStyle = hp < maxHp ? CT.danger : CT.textM;
    ctx.font = "11px Georgia,serif";
    ctx.fillText("❤️ 血量: " + Math.floor(hp) + "/" + Math.floor(maxHp), x + 12, y + 42);
    let hpRatio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    let hpColor = hpRatio > 0.6 ? CT.success : hpRatio > 0.3 ? CT.warning : CT.danger;
    CT.drawProgressBar(ctx, x + 12, y + 56, w - 24, 4, hpRatio, hpColor);

    // 攻击冷却条
    let cd = node.fireCooldown || 0;
    if (cd > 0) {
        CT.drawProgressBar(ctx, x + 12, y + 63, w - 24, 3, Math.max(0, 1 - cd / (node.maxFireCd || 1)), "rgba(40,140,255,0.9)");
    }

    // 属性详情（射程以步兵为基准换算）
    let nRangeMult = (UNIT_TYPES.infantry.range || 0.204) > 0 ? nRange / (UNIT_TYPES.infantry.range || 0.204) : 4.8;
    ctx.fillStyle = "rgba(255,150,100,0.6)";
    ctx.font = "10px Georgia,serif";
    ctx.fillText("⚔ 伤害:" + nDmg + " 射程:" + (Math.round(nRangeMult * 10) / 10), x + 12, y + 70);
    ctx.fillStyle = "rgba(150,180,140,0.6)";
    ctx.fillText("⚡ 射速:" + (Math.round(nCd * 10) / 10) + "天/发 生命:" + Math.floor(maxHp), x + 12, y + 82);

    if (!isOwn) {
        // 敌方/中立节点：显示关系与驻舰
        let ly = y + 98;
        let myShips = G.ships.filter(s => s.nodeId === node.id && s.country === G.playerCountry);
        if (myShips.length > 0) {
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 8;
            ctx.fillStyle = CT.info;
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "left";
            ctx.fillText("⚓ 我方驻舰: " + myShips.length, x + 12, ly + 2);
            ly += 18;
        }
        if (G.playerCountry && areAtWar(G.playerCountry, node.country)) {
            ctx.fillStyle = "#d44";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("⚔️ 交战中 — 生命归零即消失", x + w/2, ly + 2);
        } else if (G.playerCountry && isSameFaction(G.playerCountry, node.country)) {
            ctx.fillStyle = "rgba(100,200,150,0.8)";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("🤝 同盟", x + w/2, ly + 2);
        }
        ctx.restore();
        return;
    }

    // 本国节点：生产 & 建造队列
    let ly = y + 96;
    CT.drawSeparator(ctx, x + 10, ly, w - 20);
    ly += 8;
    ctx.fillStyle = CT.info;
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "center";
    ctx.fillText("— 生产 —", x + w/2, ly);
    ly += 18;

    // 建造舰船
    let canShip = treasury >= 500 && manpower >= 5;
    let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
    CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "⚓ 建造舰船 ($500, 5人力)", {
        hovered: hovered && canShip,
        style: canShip ? "info" : "default",
        font: "11px Georgia,serif"
    });
    window._navyNodeBtns.push({ type: 'build', nodeId: node.id, x: x + 8, y: ly, w: w - 16, h: 22, enabled: canShip });
    ly += 26;

    // 建造潜艇（仅潜艇强国）
    if (canSub) {
        let canSubB = treasury >= subCost && manpower >= 3;
        hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "🌊 建造潜艇 ($" + subCost + ", 3人力)", {
            hovered: hovered && canSubB,
            style: canSubB ? "success" : "default",
            font: "11px Georgia,serif"
        });
        window._navyNodeBtns.push({ type: 'buildSub', nodeId: node.id, x: x + 8, y: ly, w: w - 16, h: 22, enabled: canSubB });
        ly += 26;
    }

    // 升级节点
    if (nextLv) {
        if (node.upgradeTimer > 0) {
            // 升级进度
            let progress = nextLv.upgradeTime > 0 ? Math.max(0, 1 - node.upgradeTimer / nextLv.upgradeTime) : 0;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "", { style: "default", radius: 2 });
            ctx.fillStyle = "#c8a830";
            ctx.font = "10px Georgia,serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText("⬆️ 升级 Lv." + node.level + "→" + nextLv.level + " " + Math.floor(progress * 100) + "% (" + Math.ceil(node.upgradeTimer) + "天)", x + 14, ly + 11);
            ly += 26;
        } else {
            let canUpgrade = treasury >= nextLv.upgradeCost;
            hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "⬆️ 升级节点 Lv." + node.level + "→" + nextLv.level + " ($" + nextLv.upgradeCost + ", " + nextLv.upgradeTime + "天)", {
                hovered: hovered && canUpgrade,
                style: canUpgrade ? "highlight" : "default",
                font: "10px Georgia,serif"
            });
            window._navyNodeBtns.push({ type: 'upgrade', nodeId: node.id, x: x + 8, y: ly, w: w - 16, h: 22, enabled: canUpgrade });
            ly += 26;
        }
    }

    // 建造队列
    if (nodeQueue.length > 0) {
        CT.drawSeparator(ctx, x + 10, ly, w - 20);
        ly += 8;
        ctx.fillStyle = "#4a8ad4";
        ctx.font = "bold 10px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillText("📋 建造队列:", x + 12, ly + 2);
        ly += 16;
        for (let bq of nodeQueue) {
            let progress = bq.totalDays > 0 ? Math.round((1 - bq.days / bq.totalDays) * 100) : 0;
            let label = bq.type === 'submarine' ? '🌊 潜艇' : '⚓ 舰船';
            let remaining = Math.ceil(bq.days);
            ctx.fillStyle = CT.textM;
            ctx.font = "10px Georgia,serif";
            ctx.fillText(label + " " + progress + "% (" + remaining + "天)", x + 12, ly + 2);
            let barW2 = w - 24;
            CT.drawProgressBar(ctx, x + 12, ly + 12, barW2, 3, progress / 100, "#4a8ad4");
            ly += 22;
        }
    }

    ctx.restore();
}

// ===== 多城市生产面板（框选多个城市，大城市/小城市分组） =====
function drawMultiCityPanel() {
    if (!G.selectedCities || G.selectedCities.length === 0) return;
    if (G.selectedDivisions.length > 0) return;
    let cities = G.selectedCities.map(id => G.cities[id]).filter(c => c && c.owner === G.playerCountry);
    if (cities.length === 0) return;
    let treasury = G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0;
    let manpower = G.countries[G.playerCountry] ? G.countries[G.playerCountry].manpower : 0;

    let isMaj = c => c.isCapital || (typeof isMajorCity === 'function' && isMajorCity(c.id));
    let majCities = cities.filter(isMaj);
    let minCities = cities.filter(c => !isMaj(c));

    // 汇总所选城市的建造队列
    let cityIds = {};
    for (let c of cities) cityIds[c.id] = true;
    let cityQueue = [];
    if (G.buildQueue) cityQueue = G.buildQueue.filter(bq => cityIds[bq.cityId]);

    let majOcc = majCities.some(c => c.occupierFlag);
    let majBtns = majOcc ? ['infantry'] : ['build_factory','infantry','engineer','cavalry','artillery'];
    let minBtns = ['infantry'];

    let h = 48;
    if (majCities.length > 0) h += 26 + 26 * majBtns.length;
    if (minCities.length > 0) h += 26 + 26 * minBtns.length;
    if (cityQueue.length > 0) h += 24 + cityQueue.length * 20;

    let x = canvas.width - 240;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 230;

    ctx.save();
    ctx.fillStyle = "rgba(22,16,10,0.95)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(180,140,80,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#c8a830";
    ctx.fillRect(x, y, 3, h);
    window._multiCityRect = { x: x, y: y, w: w, h: h };
    if (!window._multiCityBtns) window._multiCityBtns = [];
    window._multiCityBtns = [];

    ctx.fillStyle = "#c8a830";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("🏰 已选 " + cities.length + " 座城市", x + 12, y + 6);
    ctx.fillStyle = "rgba(200,180,150,0.5)";
    ctx.font = "11px sans-serif";
    if (cities.length <= 3) {
        ctx.fillText(cities.map(c => c.name).join(" · "), x + 12, y + 24);
    } else {
        ctx.fillText("大城市 " + majCities.length + " 座 · 小城市 " + minCities.length + " 座", x + 12, y + 24);
    }
    let ly = y + 44;

    let typeDefs = {
        'build_factory': { label: '🏗️ 建工厂', cost: 50, manpower: 0, color: '#6a8a4a' },
        'infantry': { label: '⚔️ 步兵', cost: 50, manpower: 15, color: '#7a9a5a' },
        'engineer': { label: '⚙️ 工兵', cost: 70, manpower: 12, color: '#4a7a8a' },
        'cavalry': { label: '🏇 骑兵', cost: 80, manpower: 10, color: '#8a7a4a' },
        'artillery': { label: '💥 炮兵', cost: 120, manpower: 8, color: '#8a4a5a' },
    };

    // 大城市组
    if (majCities.length > 0) {
        ctx.fillStyle = "#6a8aaa";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("— 大城市 ×" + majCities.length + " —", x + w/2, ly);
        ly += 18;
        for (let tid of majBtns) {
            let td = typeDefs[tid];
            let n = majCities.length;
            let total = td.cost * n;
            let needMp = td.manpower * n;
            let can = treasury >= total && (needMp === 0 || manpower >= needMp);
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            ctx.fillStyle = hovered && can ? td.color + "cc" : can ? td.color + "88" : "rgba(128,128,128,0.2)";
            ctx.fillRect(x + 8, ly, w - 16, 22);
            ctx.strokeStyle = hovered && can ? "rgba(200,180,150,0.3)" : "rgba(180,140,80,0.08)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 22);
            ctx.fillStyle = can ? "#fff" : "rgba(200,180,150,0.3)";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(td.label + " ×" + n + " ($" + total + ")", x + 14, ly + 11);
            window._multiCityBtns.push({ id: tid, cities: majCities, x: x + 8, y: ly, w: w - 16, h: 22, enabled: can });
            ly += 26;
        }
    }

    // 小城市组
    if (minCities.length > 0) {
        ly += 2;
        ctx.fillStyle = "rgba(180,140,80,0.08)";
        ctx.fillRect(x + 10, ly - 6, w - 20, 1);
        ctx.fillStyle = "#6a8aaa";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("— 小城市 ×" + minCities.length + " —", x + w/2, ly);
        ly += 18;
        for (let tid of minBtns) {
            let td = typeDefs[tid];
            let n = minCities.length;
            let total = td.cost * n;
            let needMp = td.manpower * n;
            let can = treasury >= total && (needMp === 0 || manpower >= needMp);
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            ctx.fillStyle = hovered && can ? td.color + "cc" : can ? td.color + "88" : "rgba(128,128,128,0.2)";
            ctx.fillRect(x + 8, ly, w - 16, 22);
            ctx.strokeStyle = hovered && can ? "rgba(200,180,150,0.3)" : "rgba(180,140,80,0.08)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 22);
            ctx.fillStyle = can ? "#fff" : "rgba(200,180,150,0.3)";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(td.label + " ×" + n + " ($" + total + ")", x + 14, ly + 11);
            window._multiCityBtns.push({ id: tid, cities: minCities, x: x + 8, y: ly, w: w - 16, h: 22, enabled: can });
            ly += 26;
        }
    }

    // 建造队列汇总
    if (cityQueue.length > 0) {
        ly += 2;
        ctx.fillStyle = "rgba(180,140,80,0.08)";
        ctx.fillRect(x + 10, ly - 4, w - 20, 1);
        ly += 6;
        ctx.fillStyle = "#4a8ad4";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("📋 建造队列:", x + 12, ly + 2);
        ly += 16;
        for (let bq of cityQueue) {
            let progress = bq.totalDays > 0 ? Math.round((1 - bq.days / bq.totalDays) * 100) : 0;
            let label = bq.type === 'factory' ? '🏗️ 工厂' : (UNIT_TYPES[bq.unitType] ? '[' + UNIT_TYPES[bq.unitType].label + ']' : '单位');
            let remaining = Math.ceil(bq.days);
            ctx.fillStyle = "rgba(200,180,150,0.4)";
            ctx.font = "10px sans-serif";
            ctx.fillText(label + " " + progress + "% (" + remaining + "天)", x + 12, ly + 2);
            let barW2 = w - 24;
            ctx.fillStyle = "rgba(180,140,80,0.1)";
            ctx.fillRect(x + 12, ly + 12, barW2, 3);
            ctx.fillStyle = "#4a8ad4";
            ctx.fillRect(x + 12, ly + 12, barW2 * (progress / 100), 3);
            ly += 20;
        }
    }

    ctx.restore();
}

// ===== 省份信息面板（增强版） =====
function drawGameInfo() {
    if (!selectedProvince) return;
    let p = selectedProvince;
    let pd = G.provinceData[p.id];
    if (!pd) return;
    let co = G.provinceOwners[p.id];
    let cData = G.countries[co];
    let divs = getDivisionsInProvince(p.id);
    let moving = getMovingDivisionsTo(p.id);
    let panelX = canvas.width - 270;
    let panelY = TOP_BAR_HEIGHT + 10;
    let panelW = 250, panelH = 180;
    ctx.save();

    let color = COUNTRY_COLORS[co] || "#888";
    CT.drawPanel(ctx, panelX, panelY, panelW, panelH, { accentColor: color });

    ctx.fillStyle = CT.text;
    ctx.font = "bold 14px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(getProvinceName(p), panelX + 14, panelY + 8);
    ctx.fillStyle = CT.textM;
    ctx.font = "11px Georgia,serif";
    let cn = COUNTRY_CN[co] || co;
    ctx.fillText(cn, panelX + 14, panelY + 28);
    ctx.fillStyle = CT.text;
    ctx.font = "11px Georgia,serif";
    let y = panelY + 48;
    ctx.fillText("收入: " + pd.income.toFixed(1) + "  工厂: " + (pd.factories || 0) + "  储备: " + (pd.garrison || 0), panelX + 14, y);
    if (pd.fortification > 0) {
        ctx.fillText("防御工事: " + pd.fortification, panelX + 14, y + 16);
    }
    y += 32;
    if (divs.length > 0) {
        ctx.fillStyle = CT.textH;
        ctx.font = "bold 11px Georgia,serif";
        ctx.fillText("部队 (" + divs.length + ")", panelX + 14, y);
        ctx.font = "10px Georgia,serif";
        for (let i = 0; i < Math.min(divs.length, 4); i++) {
            let d = divs[i];
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            ctx.fillStyle = d.strength > 50 ? CT.text : CT.danger;
            ctx.fillText(ut.label + " [" + Math.floor(d.strength) + "/" + d.maxStrength + "]", panelX + 20, y + 14 + i * 14);
        }
        if (divs.length > 4) {
            ctx.fillStyle = CT.textD;
            ctx.fillText("..." + (divs.length - 4) + " 更多", panelX + 20, y + 14 + 4 * 14);
        }
    }
    if (moving.length > 0) {
        y += (divs.length > 0 ? Math.min(divs.length, 4) * 14 + 20 : 0);
        ctx.fillStyle = "#7ab8d4";
        ctx.font = "10px Georgia,serif";
        ctx.fillText("行军中: " + moving.length + " 支部队", panelX + 14, y + 14);
    }
    if (cData) {
        ctx.fillStyle = CT.textD;
        ctx.font = "10px Georgia,serif";
        ctx.fillText("国库: " + Math.floor(cData.treasury) + "  稳定: " + Math.floor(cData.stability), panelX + 14, panelY + panelH - 14);
    }
    ctx.restore();
}

// ===== 国别侧栏（钢铁雄心风格，更大更多交互） =====
function drawCountrySidebar() {
    if (G.selectedCity) return; // 选中城市时跳过国家侧边栏
    let co;
    if (G.diplomacyFocus) {
        co = G.diplomacyFocus;
    } else {
        if (!selectedProvince) return;
        co = G.provinceOwners[selectedProvince.id];
    }
    if (!co) return;
    let cd = G.countries[co];
    if (!cd) return;

    // Reset flag buttons each frame
    G._countryFlagBtns = [];

    // Helper: get all wars for a country
    function getWars(c) {
        let enemies = [];
        if (G.atWar && G.atWar[c]) {
            for (let e in G.atWar[c]) {
                if (G.atWar[c][e]) enemies.push(e);
            }
        }
        // Also check if allies are at war (defensive pacts)
        if (G.alliances && G.alliances[c]) {
            for (let ally of Object.keys(G.alliances[c])) {
                if (G.atWar && G.atWar[ally]) {
                    for (let e in G.atWar[ally]) {
                        if (G.atWar[ally][e] && !enemies.includes(e) && e !== c) enemies.push(e);
                    }
                }
            }
        }
        return [...new Set(enemies)];
    }

    // Helper: get all allies for a country (including faction allies)
    function getAllies(c) {
        let allies = [];
        if (G.alliances && G.alliances[c]) {
            for (let a in G.alliances[c]) {
                if (G.alliances[c][a]) allies.push(a);
            }
        }
        // 同阵营也算盟友
        let centralCore = ['GERMANY', 'AUSTRIA_HUNGARY'];
        let ententeCore = ['FRANCE', 'UK'];
        function belongsTo(cc, core) {
            if (core.includes(cc)) return true;
            if (G.alliances && G.alliances[cc]) {
                for (let al of Object.keys(G.alliances[cc])) {
                    if (core.includes(al)) return true;
                }
            }
            return false;
        }
        let myCentral = belongsTo(c, centralCore);
        let myEntente = belongsTo(c, ententeCore);
        for (let other of Object.keys(G.countries)) {
            if (other === c || allies.includes(other)) continue;
            let otherCentral = belongsTo(other, centralCore);
            let otherEntente = belongsTo(other, ententeCore);
            if ((myCentral && otherCentral) || (myEntente && otherEntente)) {
                allies.push(other);
            }
        }
        return allies;
    }

    let wars = getWars(co);
    let allies = getAllies(co);
    let faction = getFaction(co);
    let suzerain = getSuzerain(co);
    let vassals = getVassals(co);

    // Dynamic height based on content
    let extraLines = 0;
    if (wars.length > 0) extraLines += 1 + wars.length;
    if (allies.length > 0) extraLines += 1 + allies.length;
    if (faction) extraLines += 1;
    if (suzerain) extraLines += 1;
    if (vassals.length > 0) extraLines += 1;
    // 总司令行（本国或八大列强显示）
    let chiefLine = 0;
    if (typeof getActiveChief === 'function') {
        let chf = getActiveChief(co);
        if (chf || co === G.playerCountry) chiefLine = 1;
    }
    extraLines += chiefLine;

    let x = 10, y = TOP_BAR_HEIGHT + 10, w = 350;
    let baseH = 500;
    let h = baseH + extraLines * 16;
    // Clamp max height
    if (h > canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 20) h = canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 20;

    ctx.save();
    // Background — fully opaque with border
    CT.drawPanel(ctx, x, y, w, h, { accentColor: COUNTRY_COLORS[co] || "#888" });
    // Store sidebar bounds for click interception
    G._sidebarBounds = { x, y, w, h };

    // 国旗
    drawCountryFlag(co, x + 12, y + 8, 50, 30);

    if (G.diplomacyFocus) {
        ctx.fillStyle = "rgba(255,200,100,0.4)";
        ctx.font = "8px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillText("📍 外交视图（点击地图切换）", x + 14, y + 44);
    }

    // 国家全称
    let fullName = {
        'GERMANY': '德意志帝国', 'FRANCE': '法兰西共和国', 'UK': '大不列颠及爱尔兰联合王国',
        'ITALY': '意大利王国', 'SPAIN': '西班牙王国', 'PORTUGAL': '葡萄牙共和国',
        'BELGIUM': '比利时王国', 'NETHERLANDS': '荷兰王国', 'LUXEMBOURG': '卢森堡大公国',
        'SWITZERLAND': '瑞士联邦', 'AUSTRIA_HUNGARY': '奥匈帝国', 'SERBIA': '塞尔维亚王国',
        'MONTENEGRO': '黑山王国', 'BULGARIA': '保加利亚王国', 'ROMANIA': '罗马尼亚王国',
        'ALBANIA': '阿尔巴尼亚公国', 'GREECE': '希腊王国', 'NORWAY': '挪威王国',
        'SWEDEN': '瑞典王国', 'DENMARK': '丹麦王国', 'FINLAND': '芬兰大公国',
        'RUSSIA': '俄罗斯帝国', 'TURKEY': '奥斯曼帝国'
    };
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 12px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(fullName[co] || COUNTRY_CN[co] || co, x + 68, y + 10);
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = CT.textM;
    ctx.fillText(COUNTRY_CN[co] || co, x + 68, y + 25);

    // ===== 基础数据 =====
    let sy = y + 42;
    CT.drawSeparator(ctx, x + 12, sy, w - 24);
    sy += 6;
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = CT.text;
    ctx.fillText("💰 国库: " + Math.floor(cd.treasury), x + 16, sy); sy += 16;
    ctx.fillStyle = cd.income >= cd.expenses ? "rgba(120,200,120,0.7)" : "rgba(200,120,120,0.7)";
    ctx.fillText("📊 收入: +" + cd.income + "  支出: -" + cd.expenses, x + 16, sy); sy += 16;
    ctx.fillStyle = CT.text;
    ctx.fillText("⚔️ 师团: " + (cd.divCount || 0), x + 16, sy); sy += 16;
    ctx.fillStyle = cd.stability > 70 ? "rgba(120,200,120,0.6)" : cd.stability > 40 ? "rgba(200,200,100,0.6)" : "rgba(200,100,100,0.6)";
    ctx.fillText("📈 稳定: " + Math.floor(cd.stability) + "%", x + 16, sy); sy += 16;
    ctx.fillStyle = CT.textD;
    ctx.font = "9px Georgia,serif";
    ctx.fillText("稳定度<30%可能触发内部叛乱", x + 16, sy); sy += 14;

    // 外交点数
    let dp = G.diplomacyPoints ? Math.floor(G.diplomacyPoints[co] || 0) : 0;
    ctx.fillStyle = dp >= 20 ? "#7ab8d4" : CT.danger;
    ctx.font = "11px Georgia,serif";
    ctx.fillText("🏛️ 外交点数: " + dp, x + 16, sy); sy += 16;

    // ===== 总司令（本国可更换，他国只读展示） =====
    if (chiefLine === 1) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        let chf = typeof getActiveChief === 'function' ? getActiveChief(co) : null;
        ctx.font = "11px Georgia,serif";
        if (chf) {
            let auraTxt = "无光环";
            if (chf.aura) {
                let fx = Array.isArray(chf.aura) ? chf.aura : [chf.aura];
                let parts = [];
                for (let ef of fx) {
                    let statCN = ef.stat === 'atk' ? "攻击" : ef.stat === 'hp' ? "血量" : ef.stat === 'spd' ? "移速" : "后勤";
                    let v = ef.value || 0;
                    let sign = v < 0 ? '-' : (ef.stat === 'logi' ? '-' : '+');
                    parts.push(statCN + sign + Math.round(Math.abs(v) * 100) + "%");
                }
                auraTxt = "光环:" + parts.join("/");
            }
            ctx.fillStyle = "#d8b84a";
            ctx.fillText("🎖️ 总司令: " + chf.name + " · " + auraTxt, x + 16, sy);
        } else {
            ctx.fillStyle = "rgba(200,180,150,0.6)";
            ctx.fillText("🎖️ 总司令: （现任已被指派集团军，光环失效）", x + 16, sy);
        }
        if (co === G.playerCountry && typeof setChief === 'function') {
            let bX = x + w - 88, bY = sy - 4, bW = 76, bH = 20;
            let bh = mouseX !== undefined && mouseX > bX && mouseX < bX + bW && mouseY > bY && mouseY < bY + bH;
            CT.drawRoundedBtn(ctx, bX, bY, bW, bH, "更换总司令", { hovered: bh, style: "highlight", font: "bold 10px Georgia,serif" });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({ id: 'set_chief', x: bX, y: bY, w: bW, h: bH, tooltip: "任命新总司令（光环对全国师团生效）" });
        }
        sy += 16;
    }

    // ===== 阵营 =====
    if (faction) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        ctx.font = "11px Georgia,serif";
        ctx.fillStyle = faction === '同盟国' ? "rgba(220,180,100,0.8)" : "rgba(100,160,220,0.8)";
        ctx.fillText("🏴 阵营: " + faction, x + 16, sy); sy += 16;
    }

    // ===== 列强标识 =====
    if (isGreatPower(co)) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 5;
        CT.drawRoundedBtn(ctx, x + 12, sy, w - 24, 18, "", { style: "highlight", radius: 2 });
        ctx.font = "bold 10px Georgia,serif";
        ctx.fillStyle = CT.brass;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("⭐ 列  强", x + 16, sy + 3);
        sy += 22;
    }

    // ===== 保障关系 =====
    let myGuarantees = typeof getGuarantees === 'function' ? getGuarantees(co) : [];
    let myGuarantors = typeof getGuarantors === 'function' ? getGuarantors(co) : [];
    if (myGuarantees.length > 0 || myGuarantors.length > 0) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        if (myGuarantees.length > 0) {
            ctx.font = "10px Georgia,serif";
            ctx.fillStyle = "rgba(100,200,255,0.7)";
            ctx.fillText("🛡️ 保障:", x + 16, sy);
            let gx = x + 70;
            for (let g of myGuarantees) {
                drawCountryFlag(g, gx, sy, 14, 10);
                if (mouseX !== undefined && mouseX > gx && mouseX < gx + 14 && mouseY > sy && mouseY < sy + 10) {
                    CT.drawPanel(ctx, gx - 2, sy - 14, 60, 12, { radius: 2, fill: "rgba(22,16,10,0.9)" });
                    ctx.fillStyle = CT.textH;
                    ctx.font = "8px Georgia,serif";
                    ctx.fillText(COUNTRY_CN[g] || g, gx, sy - 12);
                }
                G._countryFlagBtns.push({ co: g, x: gx - 2, y: sy - 2, w: 18, h: 14 });
                gx += 18;
            }
            sy += 14;
        }
        if (myGuarantors.length > 0) {
            ctx.font = "10px Georgia,serif";
            ctx.fillStyle = "rgba(100,200,255,0.7)";
            ctx.fillText("🛡️ 受保:", x + 16, sy);
            let gx = x + 70;
            for (let g of myGuarantors) {
                drawCountryFlag(g, gx, sy, 14, 10);
                if (mouseX !== undefined && mouseX > gx && mouseX < gx + 14 && mouseY > sy && mouseY < sy + 10) {
                    ctx.fillStyle = "rgba(22,16,10,0.9)";
                    ctx.fillRect(gx - 2, sy - 14, 60, 12);
                    ctx.fillStyle = CT.textH;
                    ctx.font = "8px Georgia,serif";
                    ctx.fillText(COUNTRY_CN[g] || g, gx, sy - 12);
                }
                G._countryFlagBtns.push({ co: g, x: gx - 2, y: sy - 2, w: 18, h: 14 });
                gx += 18;
            }
            sy += 14;
        }
        sy += 2;
    }

    // ===== 附属国关系 =====
    if (suzerain || vassals.length > 0) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        if (suzerain) {
            // 本是附属国，显示宗主
            ctx.fillStyle = "rgba(180,140,60,0.15)";
            ctx.fillRect(x + 12, sy, w - 24, 18);
            ctx.font = "bold 11px Georgia,serif";
            ctx.fillStyle = "rgba(220,180,80,0.9)";
            ctx.fillText("👑 附属国", x + 16, sy + 2); sy += 14;
            ctx.font = "10px Georgia,serif";
            ctx.fillStyle = "rgba(200,200,200,0.7)";
            ctx.fillText("宗主: " + (COUNTRY_CN[suzerain]||suzerain), x + 24, sy); sy += 14;
            ctx.fillStyle = CT.textD;
            ctx.font = "9px Georgia,serif";
            ctx.fillText("向宗主上缴20%收入", x + 24, sy); sy += 12;
        }
        if (vassals.length > 0) {
            // 本是宗主国，显示附属
            ctx.fillStyle = "rgba(180,140,60,0.15)";
            ctx.fillRect(x + 12, sy, w - 24, 16 + vassals.length * 14);
            ctx.font = "bold 11px Georgia,serif";
            ctx.fillStyle = "rgba(220,180,80,0.9)";
            ctx.fillText("👑 宗主国", x + 16, sy + 2); sy += 14;
            ctx.font = "10px Georgia,serif";
            for (let v of vassals) {
                drawCountryFlag(v, x + 24, sy, 14, 10);
                ctx.fillStyle = "rgba(200,200,200,0.7)";
                ctx.fillText(COUNTRY_CN[v] || v, x + 42, sy);
                sy += 14;
            }
            ctx.fillStyle = CT.textD;
            ctx.font = "9px Georgia,serif";
            ctx.fillText("可自由通行附属领土", x + 24, sy); sy += 12;
        }
        sy += 2;
    }

    // ===== 同盟国 =====
    if (allies.length > 0) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        ctx.font = "11px Georgia,serif";
        ctx.fillStyle = "rgba(100,200,150,0.8)";
        ctx.fillText("🤝 同盟:", x + 16, sy); sy += 14;
        // 国旗网格（仅显示国旗，悬停显示名字，点击跳转）
        let flagW2 = 16, flagH2 = 11, gapX2 = 6, gapY2 = 4;
        let cols2 = Math.floor((w - 40) / (flagW2 + gapX2));
        for (let i = 0; i < allies.length; i++) {
            let a = allies[i];
            let col = i % cols2, row = Math.floor(i / cols2);
            let fx = x + 20 + col * (flagW2 + gapX2);
            let fy = sy + row * (flagH2 + gapY2);
            let hovered = mouseY !== undefined && mouseY > fy && mouseY < fy + flagH2 && mouseX > fx && mouseX < fx + flagW2;
            if (hovered) {
                ctx.fillStyle = "rgba(100,200,150,0.3)";
                ctx.fillRect(fx - 2, fy - 2, flagW2 + 4, flagH2 + 4);
                // 悬停显示名字
                let name = COUNTRY_CN[a] || a;
                ctx.font = "9px Georgia,serif";
                ctx.textAlign = "center";
                let tw = ctx.measureText(name).width + 6;
                let tx = fx + flagW2 / 2 - tw / 2;
                ctx.fillStyle = "rgba(22,16,10,0.9)";
                ctx.fillRect(tx, fy + flagH2 + 2, tw, 13);
                ctx.fillStyle = CT.textH;
                ctx.fillText(name, fx + flagW2 / 2, fy + flagH2 + 4);
            }
            drawCountryFlag(a, fx, fy, flagW2, flagH2);
            G._countryFlagBtns.push({ co: a, x: fx - 2, y: fy - 2, w: flagW2 + 4, h: flagH2 + 4 });
        }
        sy += Math.ceil(allies.length / cols2) * (flagH2 + gapY2) + 2;
        sy += 2;
    }

    // ===== 交战国 =====
    if (wars.length > 0) {
        CT.drawSeparator(ctx, x + 12, sy, w - 24);
        sy += 6;
        ctx.font = "11px Georgia,serif";
        ctx.fillStyle = "rgba(220,80,80,0.8)";
        ctx.fillText("⚔️ 交战:", x + 16, sy); sy += 14;
        let flagW2 = 16, flagH2 = 11, gapX2 = 6, gapY2 = 4;
        let cols2 = Math.floor((w - 40) / (flagW2 + gapX2));
        for (let i = 0; i < wars.length; i++) {
            let e = wars[i];
            let col = i % cols2, row = Math.floor(i / cols2);
            let fx = x + 20 + col * (flagW2 + gapX2);
            let fy = sy + row * (flagH2 + gapY2);
            let hovered = mouseY !== undefined && mouseY > fy && mouseY < fy + flagH2 && mouseX > fx && mouseX < fx + flagW2;
            if (hovered) {
                ctx.fillStyle = "rgba(220,80,80,0.3)";
                ctx.fillRect(fx - 2, fy - 2, flagW2 + 4, flagH2 + 4);
                let ws = getWarScoreDiff(co, e);
                let name = (COUNTRY_CN[e] || e) + " [" + (ws > 0 ? "+" : "") + ws.toFixed(0) + "]";
                ctx.font = "9px Georgia,serif";
                ctx.textAlign = "center";
                let tw = ctx.measureText(name).width + 6;
                let tx = fx + flagW2 / 2 - tw / 2;
                ctx.fillStyle = "rgba(22,16,10,0.9)";
                ctx.fillRect(tx, fy + flagH2 + 2, tw, 13);
                ctx.fillStyle = CT.textH;
                ctx.fillText(name, fx + flagW2 / 2, fy + flagH2 + 4);
            }
            drawCountryFlag(e, fx, fy, flagW2, flagH2);
            G._countryFlagBtns.push({ co: e, x: fx - 2, y: fy - 2, w: flagW2 + 4, h: flagH2 + 4 });
        }
        sy += Math.ceil(wars.length / cols2) * (flagH2 + gapY2) + 2;
        sy += 2;
    }

    // ===== 外交按钮 =====
    CT.drawSeparator(ctx, x + 12, sy, w - 24);
    sy += 8;

    if (G.playerCountry && co !== G.playerCountry) {
        let rel = (G.relations && G.relations[G.playerCountry] && G.relations[G.playerCountry][co]) || 0;
        let atWar = G.playerCountry && areAtWar(G.playerCountry, co);
        let isAlly = G.alliances && G.alliances[G.playerCountry] && G.alliances[G.playerCountry][co];
        let hasAccess = G.militaryAccess && G.militaryAccess[co] && G.militaryAccess[co][G.playerCountry];
        let alreadyAlly = isAlly;
        let alreadyAccess = hasAccess;

        // 关系值显示
        ctx.font = "11px Georgia,serif";
        ctx.fillStyle = rel > 0 ? "rgba(120,200,120,0.7)" : rel < -30 ? "rgba(200,100,100,0.7)" : CT.textM;
        ctx.fillText("🤝 好感度: " + rel, x + 16, sy); sy += 18;

        // 按钮列表: 所有按钮始终显示，条件不够变灰
        let btns = [];
        let sameFaction = isSameFaction(G.playerCountry, co);
        let allied = isAllied(G.playerCountry, co);
        if (atWar) {
            let wsDiff = getWarScoreDiff(G.playerCountry, co);
            let wsTip = "战争分数差: " + (wsDiff > 0 ? "+" : "") + wsDiff.toFixed(0);
            btns.push({ id:"peace", label:"☮️ 求和 [" + (wsDiff > 0 ? "+" : "") + wsDiff.toFixed(0) + "]", tip: "战争分数差 " + (wsDiff > 0 ? "+" : "") + wsDiff.toFixed(0) + "，与"+(COUNTRY_CN[co]||co)+"议和", color:"#6aaa6a", enabled:true });
        } else {
            // 宣战：同盟/同阵营不可宣
            let canWar = !allied && !sameFaction;
            btns.push({ id:"war", label:"⚔️ 宣战（🏛️5）", tip: allied ? "同盟国之间不能宣战" : sameFaction ? "同阵营不能宣战" : "向"+(COUNTRY_CN[co]||co)+"宣战！稳定度-5", color:"#b05040", enabled: canWar && (G.diplomacyPoints && G.diplomacyPoints[G.playerCountry] >= 5) });
            btns.push({ id:"rel", label:"🤝 改善关系 (💰50)", tip:"花费50金币，好感度+10", color:"#6a8aba", enabled: (cd.treasury||0) >= 50 });

            // 同盟申请 — 同阵营不能申请（已经是），好感度≥80
            let allianceReady = rel >= 80 && !alreadyAlly && !sameFaction && G.diplomacyPoints && G.diplomacyPoints[G.playerCountry] >= 10;
            let allianceTip = alreadyAlly ? " [已同盟]" : sameFaction ? " [同阵营]" : "需要好感度≥80 (当前:"+rel+")";
            btns.push({ id:"alliance", label:"🤝 申请同盟（🏛️10）", tip: allianceReady ? "与"+(COUNTRY_CN[co]||co)+"建立正式同盟（自动加入我方阵营）" : allianceTip,
                color:"#6aaa8a", enabled: allianceReady });

            // 军事通行权 — 同阵营不能签（已可自由通行）
            let accessReady = rel >= 55 && !alreadyAccess && !sameFaction;
            let accessTip = sameFaction ? " [同阵营自由通行]" : alreadyAccess ? " [已获得]" : "需要好感度≥55 (当前:"+rel+")";
            btns.push({ id:"access", label:"🛂 军事通行权", tip: accessReady ? "获准在"+(COUNTRY_CN[co]||co)+"领土行军" : accessTip,
                color:"#8a9a6a", enabled: accessReady });

            // 互不侵犯条约 — 同阵营不能签
            let napKey = [G.playerCountry, co].sort().join('_');
            let hasNap = G.nonAggression && G.nonAggression[napKey];
            let napReady = rel >= 30 && !hasNap && !sameFaction;
            let napTip = sameFaction ? " [同阵营]" : hasNap ? " [已有条约]" : "需要好感度≥30 (当前:"+rel+")";
            btns.push({ id:"nap", label:"📜 互不侵犯条约", tip: napReady ? "双方承诺不主动宣战" : napTip,
                color:"#7a8aaa", enabled: napReady });

            // 贸易协定 — 好感度≥40
            let tradeReady = rel >= 40;
            btns.push({ id:"trade", label:"📦 贸易协定 (💰30)", tip: tradeReady ? "花费30金币，双方收入+15%" : "需要好感度≥40 (当前:"+rel+")",
                color:"#aa9a5a", enabled: tradeReady && (cd.treasury||0) >= 30 });

            // 保障独立 — 仅列强对非列强
            let isGuaranteeing = isGuaranteedBy(co, G.playerCountry);
            if (isGreatPower(G.playerCountry) && !isGreatPower(co) && !atWar) {
                if (isGuaranteeing) {
                    btns.push({ id:"remove_guarantee", label:"🛡️ 取消保障", tip:"撤销对"+(COUNTRY_CN[co]||co)+"的独立保障", color:"#aa7a4a", enabled: true });
                } else {
                    btns.push({ id:"guarantee", label:"🛡️ 保障独立（🏛️10）", tip:"保证"+(COUNTRY_CN[co]||co)+"的独立，他国攻击时自动宣战", color:"#6aaa8a", enabled: (G.diplomacyPoints && G.diplomacyPoints[G.playerCountry] >= 10) });
                }
            }
            // 显示被保障状态
            let myGuarantors = getGuarantors(co);
            if (myGuarantors.length > 0 && !isGuaranteeing) {
                btns.push({ id:"", label:"", tip:"", color:"", enabled: false });
            }
        }

        // 在按钮上方显示该国的保障信息
        let guarantorsHere = getGuarantors(co);
        if (guarantorsHere.length > 0) {
            ctx.fillStyle = "rgba(100,200,255,0.08)";
            ctx.fillRect(x + 12, sy - 2, w - 24, 18);
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            ctx.font = "9px Georgia,serif";
            ctx.textAlign = "left";
            ctx.fillText("🛡️ 受" + guarantorsHere.map(g => COUNTRY_CN[g]||g).join(",") + "保障", x + 16, sy + 4);
            sy += 20;
        }

        for (let b of btns) {
            let bh = 26;
            let hovered = b.enabled && mouseY !== undefined && mouseY > sy && mouseY < sy + bh && mouseX > x + 8 && mouseX < x + w - 8;
            // 使用 CT.drawRoundedBtn 绘制按钮
            let style = 'default';
            if (b.color === '#6aaa6a' || b.color === '#6aaa8a') style = 'success';
            else if (b.color === '#b05040') style = 'danger';
            else if (b.color === '#6a8aba') style = 'info';
            else if (b.color === '#aa9a5a') style = 'highlight';
            else if (b.color === '#aa7a4a') style = 'highlight';
            CT.drawRoundedBtn(ctx, x + 8, sy, w - 16, bh, b.label, {
                hovered: hovered,
                style: b.enabled ? style : "default",
                font: "11px Georgia,serif"
            });

            // Tooltip — 始终显示
            if (hovered) {
                let tipX = x + w + 8;
                let tipY = sy;
                if (tipX + 220 > canvas.width) tipX = x - 228;
                let tipW = 220, tipH = 32;
                ctx.fillStyle = "rgba(22,16,10,0.96)";
                ctx.fillRect(tipX, tipY, tipW, tipH);
                ctx.strokeStyle = b.color + "66";
                ctx.lineWidth = 1;
                ctx.strokeRect(tipX, tipY, tipW, tipH);
                ctx.fillStyle = CT.textH;
                ctx.font = "10px Georgia,serif";
                ctx.textAlign = "left"; ctx.textBaseline = "top";
                ctx.fillText(b.tip, tipX + 6, tipY + 6);
            }

            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({ id:b.id, x:x+8, y:sy, w:w-16, h:bh, tooltip:b.tip, enabled:b.enabled });
            sy += bh + 3;
        }
    } else if (G.playerCountry && co === G.playerCountry) {
        let btns = [];
        // 退出阵营按钮
        let myFaction = getFaction(co);
        if (myFaction) {
            let coreCamps = { '同盟国': ['GERMANY','AUSTRIA_HUNGARY'], '协约国': ['FRANCE','UK'] };
            let coreLeaders = coreCamps[myFaction] || [];
            let canLeave = !coreLeaders.includes(co);
            btns.push({ id:"leave_faction", label:"🚪 退出" + myFaction,
                tip: canLeave ? "退出当前阵营，变为中立国，稳定度-15" : (COUNTRY_CN[co]||co) + " 是" + myFaction + "核心国，无法退出",
                color:"#aa6a6a", enabled: canLeave });
        }
        let otherCo = selectedProvince ? G.provinceOwners[selectedProvince.id] : null;
        if (otherCo && otherCo !== G.playerCountry) {
            let rel = (G.relations && G.relations[G.playerCountry] && G.relations[G.playerCountry][otherCo]) || 0;
            let isAlly = G.alliances && G.alliances[G.playerCountry] && G.alliances[G.playerCountry][otherCo];
            let atWar = G.playerCountry && areAtWar(G.playerCountry, otherCo);
            let sameF = isSameFaction(G.playerCountry, otherCo);
            if (!atWar && !isAlly && rel >= 60) {
                btns.push({ id:"recruit_faction", label:"🤝 拉拢加入阵营", tip:"花费100金币拉拢"+(COUNTRY_CN[otherCo]||otherCo)+"加入"+(COUNTRY_CN[G.playerCountry]||G.playerCountry)+"阵营", color:"#6aaa8a" });
            }
        }
        for (let b of btns) {
            let bh = 28;
            let hovered = mouseY !== undefined && mouseY > sy && mouseY < sy + bh && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, sy, w - 16, bh, b.label, {
                hovered: hovered,
                style: b.enabled !== false ? (b.color === '#aa6a6a' ? 'danger' : 'highlight') : 'default',
                font: "11px Georgia,serif"
            });
            if (hovered) {
                let tipX = x + w + 8;
                ctx.fillStyle = "rgba(22,16,10,0.95)";
                ctx.fillRect(tipX, sy, 220, 32);
                ctx.strokeStyle = b.color + "66";
                ctx.lineWidth = 1;
                ctx.strokeRect(tipX, sy, 220, 32);
                ctx.fillStyle = CT.text;
                ctx.font = "10px Georgia,serif";
                ctx.textAlign = "left"; ctx.textBaseline = "top";
                ctx.fillText(b.tip, tipX + 6, sy + 6);
                ctx.fillText(b.tip, tipX + 6, sy + 15);
            }
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({ id:b.id, x:x+8, y:sy, w:w-16, h:bh, tooltip:b.tip });
            sy += bh + 4;
        }
    }
    ctx.restore();
}

function drawSibBtn(x, y, w, text, id) {
    if (!window._sibBtns) window._sibBtns = [];
    window._sibBtns.push({id:id, x:x+5, y:y, w:w-10, h:26});
    ctx.fillStyle = "rgba(200,180,140,0.12)";
    ctx.fillRect(x + 5, y, w - 10, 26);
    ctx.fillStyle = "#c8a830";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + w/2, y + 13);
}

// ===== 事件弹窗 =====
function drawEventPopup() {
    if (!G.activeEvent) return;
    let ev = G.activeEvent;
    let bw = 420, bh = 220;
    let bx = canvas.width/2 - bw/2, by = canvas.height/2 - bh/2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(25,18,14,0.95)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(180,140,80,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 16px Georgia,serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(ev.t||ev.title, canvas.width/2, by + 16);
    ctx.fillStyle = "#c0b8a0";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    try{let txt=ev.x||ev.text||"";if(txt)wrapText(ctx,txt,canvas.width/2,by+50,bw-40,20);}catch(e){}
    let opts=ev.o||ev.options||[];
    for (let i=0;i<opts.length;i++) {
        let opt=opts[i];
        let oy=by+bh-65+i*30;
        ctx.fillStyle="rgba(180,140,80,0.15)";
        ctx.fillRect(bx+20,oy,bw-40,26);
        ctx.fillStyle="#e8d8b0";
        ctx.font="12px sans-serif";
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(opt.t||opt.text,canvas.width/2,oy+13);
    }
    ctx.restore();
}

// ===== 游戏日志面板 =====
function drawNewsBanner() {
    // 从队列取出新消息
    if ((!G.newsBanner || G.newsTimer <= 0) && G.newsQueue && G.newsQueue.length > 0) {
        G.newsBanner = G.newsQueue.shift();
        G.newsTimer = 300; // 固定显示时间，不受时间流速影响
    }
    if (!G.newsBanner || G.newsTimer <= 0) return;
    let alpha = Math.min(1, G.newsTimer / 60);
    ctx.save();
    ctx.globalAlpha = alpha;
    let bw = 500, bh = 50;
    let bx = canvas.width/2 - bw/2, by = TOP_BAR_HEIGHT + 20;
    ctx.fillStyle = "rgba(22,16,10,0.9)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,215,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "#c8a830";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(G.newsBanner, canvas.width/2, by + bh/2);
    ctx.restore();
    // 固定衰减速度，不受G.speed影响
    G.newsTimer -= 1;
    if (G.newsTimer <= 0) G.newsBanner = null;
}

function drawGameLog() {
    if (gameLogs.length === 0) return;
    ctx.save();
    let _yOffset = (selectedProvince && G.playerCountry && G.provinceOwners[selectedProvince.id]===G.playerCountry ? 90 : 45);
    if (G.activeTab) _yOffset += TAB_PANEL_HEIGHT + BOTTOM_TAB_BAR_HEIGHT;
    let ly = canvas.height - BOTTOM_BAR_HEIGHT - _yOffset;
    ctx.fillStyle = "rgba(22,16,10,0.5)";
    ctx.fillRect(4, ly - 4, 300, Math.min(gameLogs.length * 14 + 8, 120));
    ctx.fillStyle = "rgba(200,180,150,0.3)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i < Math.min(gameLogs.length, 8); i++) {
        ctx.fillText(gameLogs[i].text, 10, ly + i * 14);
    }
    ctx.restore();
}

// ===== 辅助：文字换行 =====
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    let words = text.split('');
    let line = '';
    let ly = y;
    for (let i = 0; i < words.length; i++) {
        let testLine = line + words[i];
        if (ctx.measureText(testLine).width > maxWidth && i > 0) {
            ctx.fillText(line, x, ly);
            line = words[i];
            ly += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, ly);
}

// ===== 存档面板 =====
function drawSavePanel() {
    if (!showSavePanel||saveSlots.length===0) return;
    ctx.save();
    let panelW = 300, panelH = saveSlots.length * 20 + 10;
    let panelX = 100, panelY = canvas.height - 30 - panelH;
    CT.drawPanel(ctx, panelX, panelY, panelW, panelH);
    for(let i=0;i<saveSlots.length;i++){
        let sy = panelY + 5 + i * 20;
        ctx.fillStyle = CT.textD;
        ctx.font = "11px Georgia,serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText((i+1)+". "+saveSlots[i].name, 110, sy + 10);
    }
    ctx.restore();
}

// ===== 事件历史 =====
function drawEventHistory() {
    if (eventHistory.length===0) return;
    ctx.save();
    let x=canvas.width-250, y=TOP_BAR_HEIGHT+200, w=240;
    CT.drawPanel(ctx, x, y, w, Math.min(eventHistory.length*14+8,100), { fill: "rgba(22,16,10,0.5)" });
    ctx.fillStyle="rgba(200,180,150,0.2)";
    ctx.font="9px Georgia,serif";
    ctx.textAlign="left";
    for(let i=0;i<Math.min(eventHistory.length,6);i++){
        let ev=eventHistory[i];
        ctx.fillText(ev.name+": "+ev.choice,x+5,y+12+i*14);
    }
    ctx.restore();
}

// ===== 底部标签系统（已移除，功能移至左侧面板） =====
const TAB_BTN_W = 120;
const TAB_BTN_H = 30;
function drawBottomTabs() {
    // 底部标签已整合到左侧面板
}

function drawMilitaryPanel(py, ph, startX) {
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("军队管理", startX, py);
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = CT.textM;
    ctx.fillText("Ctrl+数字键 编组 · 数字键 选中编组", startX, py + 18);

    // Show army groups
    let agY = py + 40;
    ctx.font = "bold 11px Georgia,serif";
    ctx.fillStyle = "#b8a880";
    ctx.fillText("编队:", startX, agY);
    for (let k = 1; k <= 9; k++) {
        let grp = G.armyGroups[k];
        let bx = startX + (k - 1) * 65;
        if (bx + 60 > startX + TAB_BTN_W * 3 + 20) break;
        let hovered = mouseY !== undefined && mouseY > agY && mouseY < agY + 22 && mouseX > bx && mouseX < bx + 58;
        CT.drawRoundedBtn(ctx, bx, agY, 58, 22, grp && grp.length > 0
            ? "[" + k + "] " + grp.filter(id => G.divisions.some(d => d.id === id)).length + "队"
            : "[" + k + "] 空", {
            hovered: hovered,
            style: grp ? "highlight" : "default",
            font: "10px Georgia,serif",
            radius: 2
        });
    }

    // Selected units info
    let selDivs = G.selectedDivisions.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
    if (selDivs.length > 0) {
        let sy = agY + 35;
        ctx.font = "bold 11px Georgia,serif";
        ctx.fillStyle = CT.textH;
        ctx.fillText("已选 " + selDivs.length + " 单位:", startX, sy);
        for (let i = 0; i < Math.min(selDivs.length, 8); i++) {
            let d = selDivs[i];
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            let shipInfo = (d.type === 'navy' && typeof getDivisionShipInfo === 'function') ? getDivisionShipInfo(d) : null;
            ctx.fillStyle = shipInfo ? shipInfo.color : (d.focusTarget ? CT.danger : CT.textM);
            ctx.font = "10px Georgia,serif";
            let txt;
            if (shipInfo) {
                txt = "[" + ut.label + "] " + d.name + "[" + shipInfo.gradeName + "]" + (d.focusTarget ? " ⚡集火" : "");
            } else {
                txt = "[" + ut.label + "] " + d.name + " [" + Math.floor(d.strength) + "HP]" + (d.focusTarget ? " ⚡集火" : "");
            }
            ctx.fillText(txt, startX, sy + 14 + i * 13);
        }
    }

    // Patrol controls next to the title
    if (G.selectedDivisions.length > 0) {
        let patrolY = py + 37;
        let patrolX = startX + TAB_BTN_W * 2 + 30;
        let btnW = 130;
        let anyPatrol = G.selectedDivisions.some(did => {
            let d = G.divisions.find(x => x.id === did);
            return d && G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0;
        });
        if (anyPatrol) {
            let hovered = mouseY !== undefined && mouseY > patrolY && mouseY < patrolY + 24 && mouseX > patrolX && mouseX < patrolX + btnW;
            CT.drawRoundedBtn(ctx, patrolX, patrolY, btnW, 24, "🗑️ 取消巡逻", {
                hovered: hovered,
                style: "danger",
                font: "bold 11px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_remove", x:patrolX, y:patrolY, w:btnW, h:24, tooltip:"取消选中单位的驻守"});
        } else {
            let hovered = mouseY !== undefined && mouseY > patrolY && mouseY < patrolY + 24 && mouseX > patrolX && mouseX < patrolX + btnW;
            CT.drawRoundedBtn(ctx, patrolX, patrolY, btnW, 24, "🛡️ 驻守", {
                hovered: hovered,
                style: "info",
                font: "bold 11px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_add", x:patrolX, y:patrolY, w:btnW, h:24, tooltip:"选择城市驻守，遇敌出击，远敌退回"});
        }
    }

    // Keyboard hint
    ctx.fillStyle = CT.textD;
    ctx.font = "9px Georgia,serif";
    ctx.textAlign = "right";
    ctx.fillText("集火: 选中部队后右键点击敌方单位", startX + TAB_BTN_W * 3 + 20, py + ph - 5);
    ctx.textAlign = "left";
    ctx.fillText("巡逻: 选中部队后Ctrl+P或在面板添加巡逻点", startX + TAB_BTN_W * 3 + 20 - 200, py + ph - 5);
}

function drawEconomyPanel(py, ph, startX) {
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("经济概况", startX, py);

    let g = G.playerCountry && G.countries[G.playerCountry];
    if (!g) return;
    let gy = py + 25;
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = CT.text;
    ctx.fillText("国库: " + Math.floor(g.treasury), startX, gy); gy += 16;
    ctx.fillStyle = g.income >= g.expenses ? CT.success : CT.danger;
    ctx.fillText("收入: +" + g.income + "/天", startX, gy); gy += 16;
    ctx.fillText("支出: -" + g.expenses + "/天 (师团维护)", startX, gy); gy += 20;
    ctx.fillStyle = CT.textM;

    // Daily net balance
    let net = g.income - g.expenses;
    ctx.fillStyle = net >= 0 ? CT.success : CT.danger;
    ctx.font = "bold 12px Georgia,serif";
    ctx.fillText("净收支: " + (net >= 0 ? "+" : "") + net.toFixed(1) + "/天", startX, gy); gy += 18;
    ctx.font = "11px Georgia,serif";

    // Projected days until treasury depleted (if negative)
    if (net < 0 && g.treasury > 0) {
        let daysLeft = Math.floor(g.treasury / Math.abs(net));
        ctx.fillStyle = "#d4a84a";
        ctx.fillText("国库可维持: " + daysLeft + " 天", startX, gy); gy += 16;
    }

    ctx.fillStyle = CT.textM;
    ctx.fillText("师团总数: " + G.divisions.filter(d => d.country === G.playerCountry).length, startX, gy); gy += 16;
    ctx.fillText("控制省份: " + Object.values(G.provinceData).filter(p => p.country === G.playerCountry).length, startX, gy); gy += 16;
    let totalFactories = Object.values(G.provinceData)
        .filter(p => p.country === G.playerCountry)
        .reduce((s, p) => s + (p.factories || 0), 0);
    ctx.fillText("工厂总数: " + totalFactories, startX, gy); gy += 16;

    // All countries income overview
    let cy = py + ph - 60;
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = CT.border;
    for (let [co, data] of Object.entries(G.countries)) {
        if (data.income === 0 && data.expenses === 0) continue;
        ctx.fillText(COUNTRY_CN[co] + " 国库:" + Math.floor(data.treasury) +
            " 收支:" + (data.income - data.expenses >= 0 ? "+" : "") +
            (data.income - data.expenses).toFixed(1), startX, cy);
        cy += 13;
        if (cy > py + ph - 10) break;
    }
}

function drawDiplomacyPanel(py, ph, startX) {
    G._diploBtns = [];
    G._diploSwitchRows = [];
    G._diploPanelBounds = null;
    G.hoveredDiploBtn = null;
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("外交", startX, py);
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = CT.textD;
    ctx.fillText("点击国旗查看详情 ｜ 悬停显示国名", startX, py + 16);

    let panelW = TAB_BTN_W * 3 + 50;
    G._diploPanelBounds = { x: startX, y: py, w: panelW, h: ph };

    // 国旗网格布局
    let flagW = 28, flagH = 19, gapX = 6, gapY = 6;
    let cols = Math.floor((panelW - 20) / (flagW + gapX));
    let startFlagX = startX + 10;
    let dyStart = py + 36;

    let allCountries = Object.keys(COUNTRY_CN).filter(co => co !== G.playerCountry && G.countries[co]);
    // 排序：同盟在前，然后中立，最后交战
    allCountries.sort((a, b) => {
        let aWar = G.playerCountry && areAtWar(G.playerCountry, a);
        let bWar = G.playerCountry && areAtWar(G.playerCountry, b);
        if (aWar !== bWar) return aWar ? 1 : -1;
        let aAlly = G.playerCountry && isSameFaction(G.playerCountry, a);
        let bAlly = G.playerCountry && isSameFaction(G.playerCountry, b);
        return (bAlly ? 1 : 0) - (aAlly ? 1 : 0);
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(startX, py, panelW, ph);
    ctx.clip();

    let dy = dyStart - (_diploScroll || 0);
    let itemH = flagH + gapY;

    for (let i = 0; i < allCountries.length; i++) {
        let co = allCountries[i];
        let col = i % cols;
        let row = Math.floor(i / cols);
        let fx = startFlagX + col * (flagW + gapX);
        let fy = dy + row * itemH;

        if (fy + flagH > py + ph - 10) { ctx.fillStyle = "rgba(200,180,150,0.2)"; ctx.fillText("...", startX, dy); break; }
        if (fy < py) continue; // 在裁剪区域上方

        let atWar = G.playerCountry && areAtWar(G.playerCountry, co);
        let isAlly = G.playerCountry && isSameFaction(G.playerCountry, co);
        let isFocused = G.diplomacyFocus === co;
        let hovered = mouseY !== undefined && mouseY > fy && mouseY < fy + flagH && mouseX > fx && mouseX < fx + flagW;

        // 背景高亮
        if (hovered || isFocused) {
            let hlStyle = isFocused ? "highlight" : "default";
            CT.drawRoundedBtn(ctx, fx - 2, fy - 2, flagW + 4, flagH + 4, "", {
                hovered: false,
                style: hlStyle,
                radius: 1
            });
            // 边框状态色
            ctx.strokeStyle = atWar ? "rgba(200,80,80,0.7)" : isAlly ? "rgba(80,200,80,0.7)" : "rgba(180,140,80,0.5)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(fx - 2, fy - 2, flagW + 4, flagH + 4);
        }

        // 国旗
        drawCountryFlag(co, fx, fy, flagW, flagH);

        // 点击区域
        if (!G._diploSwitchRows) G._diploSwitchRows = [];
        G._diploSwitchRows.push({ co, x: fx - 2, y: fy - 2, w: flagW + 4, h: flagH + 4 });

        // 悬停时显示名字
        if (hovered) {
            let name = COUNTRY_CN[co] || co;
            ctx.font = "9px Georgia,serif";
            ctx.textAlign = "center";
            let tw = ctx.measureText(name).width + 8;
            let tx = fx + flagW / 2 - tw / 2;
            let ty = fy + flagH + 2;
            CT.drawPanel(ctx, tx, ty, tw, 14, { radius: 2, fill: "rgba(22,16,10,0.9)" });
            ctx.fillStyle = "#e8d8b0";
            ctx.fillText(name, fx + flagW / 2, ty + 2);

            // 存储悬停信息用于详情面板
            let cd = G.countries[co];
            G.hoveredDiploBtn = {
                co, name: COUNTRY_CN[co] || co,
                atWar, isAlly,
                rel: (G.relations && G.relations[G.playerCountry] && G.relations[G.playerCountry][co]) || 0,
                treasury: Math.floor(cd.treasury || 0),
                divs: cd.divCount || 0,
                navy: G.ships ? G.ships.filter(s => s.country === co).length : 0
            };
        }
    }

    let totalRows = Math.ceil(allCountries.length / cols);
    let totalContentH = totalRows * itemH;
    _diploMaxScroll = Math.max(0, totalContentH - (ph - 40));
    if (_diploScroll > _diploMaxScroll) _diploScroll = _diploMaxScroll;
    ctx.restore();

    // 详情面板（右侧悬浮）
    if (G.hoveredDiploBtn) {
        let h = G.hoveredDiploBtn;
        let tipX = startX + panelW + 10;
        let tipY = py;
        if (tipX > canvas.width - 230) tipX = canvas.width - 230;
        let gs = getGuarantors ? getGuarantors(h.co) : [];
        let myG = getGuarantees ? getGuarantees(h.co) : [];
        let tipH = myG.length > 0 ? 134 : (gs.length > 0 ? 118 : 104);
        CT.drawPanel(ctx, tipX, tipY, 220, tipH);
        ctx.fillStyle = "#e8d8b0";
        ctx.font = "bold 12px Georgia,serif";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        drawCountryFlag(h.co, tipX + 8, tipY + 4, 24, 16);
        ctx.fillText(h.name, tipX + 36, tipY + 6);
        ctx.font = "10px Georgia,serif";
        ctx.fillStyle = h.atWar ? "#b05040" : h.isAlly ? "#8aca8a" : "rgba(200,180,150,0.5)";
        ctx.fillText("状态: " + (h.atWar ? "⚔️ 交战中" : h.isAlly ? "🤝 同盟" : "☮️ 中立"), tipX + 8, tipY + 24);
        ctx.fillStyle = "rgba(200,180,150,0.5)";
        ctx.fillText("关系值: " + h.rel, tipX + 8, tipY + 40);
        ctx.fillText("国库: " + h.treasury, tipX + 8, tipY + 54);
        ctx.fillText("师团: " + h.divs, tipX + 8, tipY + 68);
        ctx.fillText("舰船: " + (h.navy || 0), tipX + 8, tipY + 82);
        if (gs.length > 0) {
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            ctx.fillText("🛡️ 受" + gs.map(g => COUNTRY_CN[g]||g).join(",") + "保障", tipX + 8, tipY + 96);
        }
        if (myG.length > 0) {
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            ctx.fillText("🛡️ 保障" + myG.map(g => COUNTRY_CN[g]||g).join(","), tipX + 8, tipY + 108);
        }
    }

    // 滚动按钮
    if (_diploMaxScroll > 0) {
        if (_diploScroll > 0) {
            let btnX = startX + panelW - 22;
            let btnY = py + 4;
            CT.drawRoundedBtn(ctx, btnX, btnY, 18, 18, "▲", { style: "info", font: "12px Georgia,serif" });
            G._navyBtns = G._navyBtns || [];
            G._navyBtns.push({ type: 'diploScrollUp', x: btnX, y: btnY, w: 18, h: 18 });
        }
        if (_diploScroll < _diploMaxScroll) {
            let btnX = startX + panelW - 22;
            let btnY = py + ph - 22;
            CT.drawRoundedBtn(ctx, btnX, btnY, 18, 18, "▼", { style: "info", font: "12px Georgia,serif" });
            G._navyBtns = G._navyBtns || [];
            G._navyBtns.push({ type: 'diploScrollDown', x: btnX, y: btnY, w: 18, h: 18 });
        }
    }
    ctx.restore();
}

// ===== 海军建造面板 =====
// drawNavyPanel is now defined in js/navy/shipProductionUI.js

// ===== 右侧阵营状态栏 (called from render) =====
function drawWarStatusSidebar() {
    let x = canvas.width - 180;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 170;
    let germanyAllies = ['GERMANY'];
    let ententeMembers = ['FRANCE', 'UK'];

    // Build faction lists from alliances
    if (G.alliances) {
        if (G.alliances['GERMANY']) {
            for (let ally in G.alliances['GERMANY']) {
                if (!germanyAllies.includes(ally) && G.alliances[ally] && G.alliances[ally]['GERMANY']) {
                    germanyAllies.push(ally);
                }
            }
        }
        if (G.alliances['FRANCE']) {
            for (let ally in G.alliances['FRANCE']) {
                if (!ententeMembers.includes(ally) && G.alliances[ally] && G.alliances[ally]['FRANCE']) {
                    ententeMembers.push(ally);
                }
            }
        }
        // Also check UK alliances
        if (G.alliances['UK']) {
            for (let ally in G.alliances['UK']) {
                if (!ententeMembers.includes(ally) && G.alliances[ally] && G.alliances[ally]['UK']) {
                    ententeMembers.push(ally);
                }
            }
        }
    }

    let h = Math.max(germanyAllies.length, ententeMembers.length) * 22 + 50;

    ctx.save();
    // Background
    CT.drawPanel(ctx, x, y, w, h);

    // Central Powers (同盟国)
    ctx.fillStyle = CT.info;
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("⚔️ 同盟国", x + w/2, y + 5);
    let ly = y + 22;
    for (let co of germanyAllies) {
        let cd = G.countries[co];
        let atWar = isCountryAtWar(co);
        let surr = G.surrendered && G.surrendered[co];
        ctx.fillStyle = COUNTRY_COLORS[co] || "#888";
        ctx.fillRect(x + 8, ly, 3, 16);
        ctx.font = "10px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillStyle = surr ? "rgba(200,100,100,0.5)" : atWar ? "#d4a84a" : CT.text;
        let txt = (COUNTRY_CN[co] || co).substring(0, 5);
        ctx.fillText(txt, x + 15, ly + 3);
        if (cd) {
            ctx.textAlign = "right";
            ctx.fillStyle = CT.textD;
            ctx.font = "9px Georgia,serif";
            ctx.fillText("💰" + Math.floor(cd.treasury) + " ⚔" + (cd.divCount||0), x + w - 8, ly + 3);
        }
        if (surr) {
            ctx.fillStyle = "rgba(200,50,50,0.6)";
            ctx.font = "9px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("🏳️投降", x + w/2, ly + 14);
        }
        ly += 22;
    }

    // Divider
    ly += 4;
    CT.drawSeparator(ctx, x + 10, ly, w - 20);
    ly += 8;

    // Entente (协约国)
    ctx.fillStyle = CT.danger;
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "center";
    ctx.fillText("🤝 协约国", x + w/2, ly);
    ly += 18;
    for (let co of ententeMembers) {
        let cd = G.countries[co];
        let atWar = isCountryAtWar(co);
        let surr = G.surrendered && G.surrendered[co];
        ctx.fillStyle = COUNTRY_COLORS[co] || "#888";
        ctx.fillRect(x + 8, ly, 3, 16);
        ctx.font = "10px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillStyle = surr ? "rgba(200,100,100,0.5)" : atWar ? "#d4a84a" : CT.text;
        let txt = (COUNTRY_CN[co] || co).substring(0, 5);
        ctx.fillText(txt, x + 15, ly + 3);
        if (cd) {
            ctx.textAlign = "right";
            ctx.fillStyle = CT.textD;
            ctx.font = "9px Georgia,serif";
            ctx.fillText("💰" + Math.floor(cd.treasury) + " ⚔" + (cd.divCount||0), x + w - 8, ly + 3);
        }
        if (surr) {
            ctx.fillStyle = "rgba(200,50,50,0.6)";
            ctx.font = "9px Georgia,serif";
            ctx.textAlign = "center";
            ctx.fillText("🏳️投降", x + w/2, ly + 14);
        }
        ly += 22;
    }

    ctx.restore();
}

// ===== 选中单位侧栏 =====
function drawSelectedUnitSidebar() {
    if (G.selectedDivisions.length === 0) return;
    let selDivs = G.selectedDivisions.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
    if (selDivs.length === 0) return;

    // 既选中陆军又选中海军时只显示海军（潜艇也算海军）
    let hasSea = selDivs.some(d => typeof isSeaType === 'function' && isSeaType(d.type));
    let hasLand = selDivs.some(d => typeof isSeaType === 'function' && !isSeaType(d.type));
    if (hasSea && hasLand) selDivs = selDivs.filter(d => isSeaType(d.type));

    // Count navy divisions
    let navySel = selDivs.filter(d => d.type === 'navy');
    let hasNavyFormation = navySel.length > 1;
    let hasSub = selDivs.some(d => d.type === 'submarine');

    // 指挥系统：本国陆军可编入集团军（1个师即可编成新集团军，可编成空集团军）
    let landSel = selDivs.filter(d => typeof isSeaType === 'function' && !isSeaType(d.type));
    let canFormGroup = landSel.length >= 1;

    let x = canvas.width - 310;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 300;
    let detailH = selDivs.length === 1 ? 220 : 0;
    let extraH = (hasNavyFormation ? 90 : 0) + (hasSub ? 30 : 0) + detailH + (canFormGroup ? 30 : 0);
    let h = Math.min(selDivs.length, 8) * 25 + 60 + extraH;

    ctx.save();
    CT.drawPanel(ctx, x, y, w, h, { accentColor: COUNTRY_COLORS[G.playerCountry] || "#888" });

    // 注册详情栏点击区域，防止穿透到背景
    if (!window._sidePanelRect) window._sidePanelRect = {};
    window._sidePanelRect = { x: x, y: y, w: w, h: h };

    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("已选 " + selDivs.length + " 单位", x + 12, y + 6);

    let ly = y + 28;
    let rowH = 25;
    let maxRows = 8;
    let visCount = Math.min(selDivs.length, maxRows);
    let listH = visCount * rowH;
    window._sibScrollMax = Math.max(0, selDivs.length * rowH - listH);
    let selKey = G.selectedDivisions.slice().sort().join(',');
    if (window._sibLastKey !== selKey) { G._sibScroll = 0; window._sibLastKey = selKey; }
    G._sibScroll = Math.min(G._sibScroll || 0, window._sibScrollMax);
    let scroll = G._sibScroll || 0;
    let first = Math.floor(scroll / rowH);
    let last = Math.min(selDivs.length, first + Math.ceil(listH / rowH) + 1);
    for (let i = first; i < last; i++) {
        let d = selDivs[i];
        let ry = ly + (i - first) * rowH - (scroll % rowH);
        if (ry < ly - rowH || ry > ly + listH) continue;
        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        let shipInfo = (d.type === 'navy' && typeof getDivisionShipInfo === 'function') ? getDivisionShipInfo(d) : null;
        if (shipInfo) {
            ctx.fillStyle = shipInfo.color;
        } else {
            ctx.fillStyle = d.focusTarget ? "#b05040" : "rgba(200,180,150,0.6)";
        }
        ctx.font = "12px Georgia,serif";
        let shield = (G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0) ? "🛡️" : "";
        let txt;
        if (shipInfo) {
            txt = ut.sym + " " + d.name + "[" + shipInfo.gradeName + "]" + shield;
        } else {
            txt = ut.sym + " " + d.name + " [" + Math.floor(d.strength) + "]" + shield;
        }
        if (d.focusTarget) txt += " ⚡";
        // Clickable remove from formation indicator
        if (d.formation === 'line') txt += " ⛓️";
        ctx.fillText(txt, x + 12, ry);
        // 点击该行：仅选中该单位，取消其余
        if (!window._sibBtns) window._sibBtns = [];
        window._sibBtns.push({ id: 'unit_row_' + d.id, x: x + 8, y: ry - 4, w: w - 16, h: rowH, tooltip: "仅选中该单位" });
        // Invisible hit area for formation removal
        if (d.formation === 'line') {
            if (!window._sibFormBtn) window._sibFormBtn = [];
            window._sibFormBtn.push({divId:d.id, x:x+8, y:ry-4, w:w-16, h:20});
        }
    }
    // 单位列表滚动条（多选超10个时）
    if (window._sibScrollMax > 0) {
        let sbX = x + w - 14, sbH = listH;
        let thumbH = Math.max(20, sbH * (visCount / selDivs.length));
        let thumbY = ly + (sbH - thumbH) * (scroll / window._sibScrollMax);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(sbX, ly, 6, sbH);
        ctx.fillStyle = "rgba(200,168,48,0.7)";
        ctx.fillRect(sbX, thumbY, 6, thumbH);
    }
    ly = y + 28 + listH;
    if (selDivs.length > maxRows) {
        ctx.fillStyle = "rgba(200,180,150,0.45)";
        ctx.font = "10px Georgia,serif";
        ctx.textAlign = "right";
        ctx.fillText("共 " + selDivs.length + " 个（滚轮查看）", x + w - 22, ly - 12);
        ctx.textAlign = "left";
    }

    // ===== 单选单位：详细属性（移速/射程以步兵=1为基准换算） =====
    if (selDivs.length === 1) {
        let d = selDivs[0];
        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        // 海军舰船：使用计算后的属性（含品级加成）
        let range = d.navyRng !== undefined ? d.navyRng : ut.range;
        let speed = d.navySpd !== undefined ? d.navySpd : ut.speed;
        let dmg = d.navyDmg !== undefined ? d.navyDmg : ut.damage;
        let fr = d.navyFr !== undefined ? d.navyFr : ut.fireRate;
        let maxHp = d.maxStrength !== undefined ? d.maxStrength : ut.maxStr;

        let subNote = "";
        let speedNote = "";
        if (d.type === 'submarine') {
            if (d.submerged) { subNote = "水下"; speedNote = "（水下）"; }
            else if (d.diving) { subNote = "下潜中"; speedNote = "（水下）"; }
            else if (d.surfacing) { subNote = "上浮中"; }
            // 下潜/已下潜时移速减半
            if (d.submerged || d.diving) speed *= 0.5;
        }

        ly += 4;
        CT.drawSeparator(ctx, x + 10, ly, w - 20);
        ly += 10;
        ctx.fillStyle = "#e8d8b0";
        ctx.font = "bold 13px Georgia,serif";
        ctx.textAlign = "center";
        ctx.fillText("— " + ut.label + " 详情 —", x + w / 2, ly);
        ly += 18;

        // 指挥系统：集团军指挥官/总司令光环加成（联机模式返回0）
        let bonuses = (typeof getDivisionBonuses === 'function') ? getDivisionBonuses(d) : null;
        let hasBonus = bonuses && (bonuses.atk > 0 || bonuses.hp > 0 || bonuses.spd > 0 || bonuses.logi > 0);

        ctx.font = "12px Georgia,serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "#b05040";
        ctx.fillText("⚔️ 伤害: " + (Math.round(dmg * 10) / 10), x + 12, ly);
        if (bonuses && bonuses.atk > 0) {
            let baseW = ctx.measureText("⚔️ 伤害: " + (Math.round(dmg * 10) / 10)).width;
            ctx.fillStyle = "#a0d860";
            ctx.fillText("+" + (Math.round(dmg * bonuses.atk * 10) / 10), x + 12 + baseW + 4, ly);
        }
        ctx.fillStyle = "#6a8aaa";
        ctx.fillText("🔫 射速: " + (Math.round(fr * 10) / 10) + " 天/发", x + 12, ly + 18);
        ctx.fillStyle = "#7a9a5a";
        ctx.fillText("❤️ 生命: " + Math.floor(maxHp), x + 12, ly + 36);
        if (bonuses && bonuses.hp > 0) {
            let baseW2 = ctx.measureText("❤️ 生命: " + Math.floor(maxHp)).width;
            ctx.fillStyle = "#a0d860";
            ctx.fillText("+" + Math.round(maxHp * bonuses.hp), x + 12 + baseW2 + 4, ly + 36);
        }
        // 射程/移速以步兵为基准（步兵 = 1），其他单位换算为倍数
        let baseRange = UNIT_TYPES.infantry.range || 0.204;
        let baseSpeed = UNIT_TYPES.infantry.speed || 0.0432;
        let rangeMult = range / baseRange;
        let speedMult = speed / baseSpeed;
        ctx.fillStyle = "#c8a84a";
        ctx.fillText("🎯 射程: " + (Math.round(rangeMult * 10) / 10), x + 12, ly + 54);
        ctx.fillStyle = "#4a9ad4";
        ctx.fillText("🏃 移速: " + (Math.round(speedMult * 10) / 10) + speedNote, x + 12, ly + 72);
        if (bonuses && bonuses.spd > 0) {
            let baseW3 = ctx.measureText("🏃 移速: " + (Math.round(speedMult * 10) / 10) + speedNote).width;
            ctx.fillStyle = "#a0d860";
            ctx.fillText("+" + (Math.round(speedMult * bonuses.spd * 10) / 10), x + 12 + baseW3 + 4, ly + 72);
        }

        if (d.type === 'navy' && d.navyMvr !== undefined) {
            let dodge = typeof navyDodgeRate === 'function' ? navyDodgeRate(d) : 0;
            ctx.fillStyle = "#9b59b6";
            ctx.fillText("⚓ 机动: " + (Math.round(dodge * 1000) / 10) + "%（闪避子弹）", x + 12, ly + 90);
        }
        if (subNote) {
            ctx.fillStyle = "#8ad4d4";
            ctx.fillText("🌊 状态: " + subNote, x + 12, ly + 108);
        }
        // 指挥加成汇总（集团军指挥官 + 总司令光环 叠加显示）
        if (hasBonus) {
            let parts = [];
            if (bonuses.atk > 0) parts.push("攻击+" + Math.round(bonuses.atk * 100) + "%");
            if (bonuses.hp > 0) parts.push("血量+" + Math.round(bonuses.hp * 100) + "%");
            if (bonuses.spd > 0) parts.push("移速+" + Math.round(bonuses.spd * 100) + "%");
            if (bonuses.logi > 0) parts.push("后勤-" + Math.round(bonuses.logi * 100) + "%");
            // 明细拆分：集团军一行 + 总司令光环一行
            let bd = (typeof getBonusBreakdown === 'function') ? getBonusBreakdown(d) : null;
            let sumLines = 0;
            ctx.fillStyle = "#c8a84a";
            ctx.font = "11px Georgia,serif";
            if (bd && bd.group) {
                let g = bd.group;
                let gparts = [];
                if (g.atk > 0) gparts.push("攻击+" + Math.round(g.atk * 100) + "%");
                if (g.hp > 0) gparts.push("血量+" + Math.round(g.hp * 100) + "%");
                if (g.spd > 0) gparts.push("移速+" + Math.round(g.spd * 100) + "%");
                if (g.logi > 0) gparts.push("后勤-" + Math.round(g.logi * 100) + "%");
                if (gparts.length > 0) {
                    ctx.fillText("🎖️ " + g.name + "加成: " + gparts.join(" "), x + 12, ly + 128 + sumLines * 18);
                    sumLines++;
                }
            }
            if (bd && bd.aura) {
                let aparts = [];
                for (let ef of bd.aura.effects) {
                    let statCN = ef.stat === 'atk' ? "攻击" : ef.stat === 'hp' ? "血量" : ef.stat === 'spd' ? "移速" : "后勤";
                    let v = ef.value || 0;
                    let sign = v < 0 ? '-' : (ef.stat === 'logi' ? '-' : '+');
                    aparts.push(statCN + sign + Math.round(Math.abs(v) * 100) + "%");
                }
                ctx.fillText("🎖️ 总司令光环(" + bd.aura.name + "): " + aparts.join("/"), x + 12, ly + 128 + sumLines * 18);
                sumLines++;
            }
            if (sumLines === 0) {
                ctx.fillText("🎖️ 加成: " + parts.join(" "), x + 12, ly + 128);
                sumLines = 1;
            }
            // 简介与造价按汇总行数下移
            let descLy = hasBonus ? (ly + 128 + sumLines * 18 + 4) : ly + 126;
            ctx.fillStyle = "rgba(200,180,150,0.45)";
            ctx.font = "10px Georgia,serif";
            ctx.fillText("📜 " + (ut.desc || ""), x + 12, descLy);
            ctx.fillStyle = "rgba(200,180,150,0.25)";
            ctx.fillText("造价 " + ut.cost + "金 / 人力 " + (ut.manpower || 0) + "千", x + 12, descLy + 16);
        } else {
            let descLy = ly + 126;
            ctx.fillStyle = "rgba(200,180,150,0.45)";
            ctx.font = "10px Georgia,serif";
            ctx.fillText("📜 " + (ut.desc || ""), x + 12, descLy);
            ctx.fillStyle = "rgba(200,180,150,0.25)";
            ctx.fillText("造价 " + ut.cost + "金 / 人力 " + (ut.manpower || 0) + "千", x + 12, descLy + 16);
        }
    }

    // Formation buttons (when multiple navy selected)
    if (hasNavyFormation) {
        ly += 4;
        CT.drawSeparator(ctx, x + 10, ly, w - 20);
        ly += 10;

        ctx.fillStyle = "#6a8aaa";
        ctx.font = "bold 10px Georgia,serif";
        ctx.textAlign = "center";
        ctx.fillText("⚓ 海军阵型", x + w/2, ly);
        ly += 20;

        // Check if all selected navy have 'line' formation already
        let allLine = navySel.every(d => d.formation === 'line');

        if (allLine) {
            // Cancel formation button
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "✖ 解除阵型", {
                hovered: hovered,
                style: "danger",
                font: "bold 10px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"formation_remove", x:x+8, y:ly, w:w-16, h:22, tooltip:"解除所有选中海军的一字阵"});
        } else {
            // Line formation button
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 22, "— 一字阵", {
                hovered: hovered,
                style: "info",
                font: "bold 10px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"formation_apply", x:x+8, y:ly, w:w-16, h:22, tooltip:"将选中海军排列成一字阵（垂直于前进方向）"});
        }
        ly += 26;

        // Formation status info
        ctx.fillStyle = "rgba(200,180,150,0.4)";
        ctx.font = "9px Georgia,serif";
        ctx.textAlign = "center";
        ctx.fillText("点击单位后可移除阵型", x + w/2, ly);
    }

    // Submarine dive button
    if (hasSub) {
        let btnY2 = y + h - 58 - (canFormGroup ? 30 : 0);
        let allSubmerged = selDivs.filter(d => d.type === 'submarine').every(d => d.submerged);
        let label = allSubmerged ? "🔼 上浮" : "⬇️ 下潜";
        let hovered = mouseY !== undefined && mouseY > btnY2 && mouseY < btnY2 + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        CT.drawRoundedBtn(ctx, x + 8, btnY2, w - 16, 22, label, {
            hovered: hovered,
            style: "info",
            font: "bold 11px Georgia,serif"
        });
        if (!window._sibBtns) window._sibBtns = [];
        window._sibBtns.push({id:"sub_dive", x:x+8, y:btnY2, w:w-16, h:22, tooltip: allSubmerged ? "上浮至水面" : "下潜至水下（隐身，无法攻击）"});
    }

    // 指挥系统：编入集团军按钮（本国陆军），置于驻守/前线按钮下方
    if (canFormGroup) {
        let gy = y + h - 28;
        let hovered = mouseY !== undefined && mouseY > gy && mouseY < gy + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        CT.drawRoundedBtn(ctx, x + 8, gy, w - 16, 22, "⚔️ 编入集团军", {
            hovered: hovered,
            style: "success",
            font: "bold 11px Georgia,serif"
        });
        if (!window._sibBtns) window._sibBtns = [];
        window._sibBtns.push({id:"armygroup_form", x:x+8, y:gy, w:w-16, h:22, tooltip:"加入现有集团军，或1个师即编成新集团军（已在集团军中的师也可移入其他集团军）" });
    }

    // Patrol + Frontline buttons (always visible when units are selected)
    let btnY = y + h - 28;
    if (canFormGroup) btnY -= 30;
    // Check if any selected unit is on patrol
    let anyPatrol = selDivs.some(d => G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0);

    if (anyPatrol) {
        // Cancel patrol button (red) — full width
        let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        CT.drawRoundedBtn(ctx, x + 8, btnY, w - 16, 22, "🗑️ 取消巡逻", {
            hovered: hovered,
            style: "danger",
            font: "bold 10px Georgia,serif"
        });
        if (!window._sibBtns) window._sibBtns = [];
        window._sibBtns.push({id:"patrol_remove", x:x+8, y:btnY, w:w-16, h:22, tooltip:"取消选中单位的驻守"});
    } else {
        // Two buttons: Patrol (left) + Frontline (right)
        let btnW2 = (w - 20) / 2;
        { // Patrol
            let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > x + 8 && mouseX < x + 8 + btnW2;
            CT.drawRoundedBtn(ctx, x + 8, btnY, btnW2, 22, "🛡️ 驻守", {
                hovered: hovered,
                style: "info",
                font: "bold 10px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_add", x:x+8, y:btnY, w:btnW2, h:22, tooltip:"在选中单位的当前省份驻守"});
        }
        { // Frontline
            let flBtnX = x + 12 + btnW2;
            let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > flBtnX && mouseX < flBtnX + btnW2;
            let hasActiveFrontlines = G.frontlineGroups && G.frontlineGroups.length > 0;
            let flBtnText = G.frontlineDrawing ? "✅ 绘制中" : (hasActiveFrontlines ? "⏏️ 取消" : "⚔️ 前线");
            CT.drawRoundedBtn(ctx, flBtnX, btnY, btnW2, 22, flBtnText, {
                hovered: hovered,
                style: "default",
                font: "bold 10px Georgia,serif"
            });
            if (!window._sibBtns) window._sibBtns = [];
            let tip = G.frontlineDrawing ? "再次点击取消绘制" : (hasActiveFrontlines ? "再次点击取消所有前线" : "选中部队后点击，然后在敌国边境画指挥线");
            window._sibBtns.push({id:"frontline", x:flBtnX, y:btnY, w:btnW2, h:22, tooltip: tip});
        }
    }

    ctx.restore();
}
function drawDiploTooltip(text, x, y) {
    if (!text) return;
    ctx.save();
    CT.drawPanel(ctx, x, y - 30, 180, 28, { radius: 2, fill: "rgba(22,16,10,0.92)" });
    ctx.fillStyle = "#c0b8a0";
    ctx.font = "10px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 8, y - 16);
    ctx.restore();
}

// ===== 处理底部标签点击（已移除） =====
function handleTabClick(mx, my) {
    return false;
}

// ===== 沉船信息面板 =====
function showNavyGraveInfo(grave) {
    G.navyGraveInfo = grave;
    // 关闭左侧面板
    G.leftPanel = null;
    // 3秒后自动关闭
    if (G._graveInfoTimeout) clearTimeout(G._graveInfoTimeout);
    G._graveInfoTimeout = setTimeout(() => { G.navyGraveInfo = null; }, 4000);
}

function drawNavyGraveInfoPanel() {
    if (!G.navyGraveInfo) return;
    let g = G.navyGraveInfo;
    let [sx, sy] = typeof worldToScreen === 'function' ? worldToScreen(g.x, g.y) : [0, 0];
    if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) return;

    let pw = 240, ph = 85;
    let px = Math.min(Math.max(sx - pw / 2, 10), canvas.width - pw - 10);
    let py = sy - ph - 20;
    if (py < 10) py = sy + 20;

    ctx.save();
    // 面板背景
    CT.drawPanel(ctx, px, py, pw, ph);
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 12px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("💀⚓ 沉船标记", px + 12, py + 10);

    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = CT.text;
    let infoY = py + 30;
    if (g.name) {
        ctx.fillText("舰名: " + g.name, px + 12, infoY); infoY += 16;
    }
    ctx.fillText("类型: " + (g.type === 'submarine' ? '潜艇' : '海军'), px + 12, infoY); infoY += 16;
    ctx.fillText("国籍: " + (COUNTRY_CN[g.country] || g.country), px + 12, infoY); infoY += 16;
    ctx.fillText("沉没时间: " + new Date(g.deathTime).toLocaleDateString('zh-CN'), px + 12, infoY);

    // 点击关闭提示
    ctx.fillStyle = CT.textD;
    ctx.font = "9px Georgia,serif";
    ctx.fillText("点击任意处关闭", px + pw - 90, py + ph - 12);
    ctx.restore();
}

// ===== 左侧垂直标签栏系统 =====
G.leftPanel = G.leftPanel || null;
const LEFT_TAB_W = 34, LEFT_TAB_H = 72, LEFT_PANEL_W = 310;

function drawLeftSidebar() {
    if (!G.playerCountry) return;
    let tabX = 0;
    let tabStartY = TOP_BAR_HEIGHT + 4;
    let availableH = canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 8;
    let tabGap = 6;
    let totalTabH = LEFT_TAB_H * 2 + tabGap;
    let tabY = tabStartY + (availableH - totalTabH) / 2;

    ctx.save();
    G._leftSidebarTabs = [];

    // 标签背景底条
    ctx.fillStyle = "rgba(18,12,6,0.75)";
    ctx.fillRect(0, TOP_BAR_HEIGHT, LEFT_TAB_W, canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT);

    // 顶部装饰线
    CT.drawOrnamentLine(ctx, LEFT_TAB_W, TOP_BAR_HEIGHT, canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT);

    // 经济标签
    let econActive = G.leftPanel === 'economy';
    drawLeftTab(tabX, tabY, LEFT_TAB_W, LEFT_TAB_H, "💰", "经济", econActive);
    G._leftSidebarTabs.push({ x: tabX, y: tabY, w: LEFT_TAB_W, h: LEFT_TAB_H, panel: 'economy' });
    tabY += LEFT_TAB_H + tabGap;

    // 海军标签
    let navyActive = G.leftPanel === 'navy';
    drawLeftTab(tabX, tabY, LEFT_TAB_W, LEFT_TAB_H, "🚢", "海军", navyActive);
    G._leftSidebarTabs.push({ x: tabX, y: tabY, w: LEFT_TAB_W, h: LEFT_TAB_H, panel: 'navy' });

    ctx.restore();

    // 展开面板
    if (G.leftPanel) drawLeftPanelContent();
}

function drawLeftTab(x, y, w, h, icon, label, active) {
    let hovered = mouseX !== undefined && mouseX > x && mouseX < x + w && mouseY !== undefined && mouseY > y && mouseY < y + h;

    // 背景
    if (active) {
        ctx.fillStyle = "rgba(180,140,60,0.25)";
    } else if (hovered) {
        ctx.fillStyle = "rgba(180,140,60,0.1)";
    } else {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
    }
    ctx.fillRect(x, y, w, h);

    // 左侧激活指示条
    if (active) {
        ctx.fillStyle = "#c4a040";
        ctx.fillRect(x, y, 3, h);
    }

    // 图标
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x + w / 2, y + h * 0.38);

    // 标签文字（竖排，逐字）
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = active ? "#e8d8a0" : (hovered ? "#c8b880" : "rgba(180,160,130,0.6)");
    let chars = label.split('');
    let charH = 12;
    let startCharY = y + h * 0.55 - (chars.length - 1) * charH / 2;
    for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], x + w / 2, startCharY + i * charH);
    }
}

function drawLeftPanelContent() {
    let px = LEFT_TAB_W + 4;
    let py = TOP_BAR_HEIGHT + 4;
    let pw = LEFT_PANEL_W;
    let ph = canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 8;

    ctx.save();
    CT.drawPanel(ctx, px, py, pw, ph);
    G._leftPanelRect = { x: px, y: py, w: pw, h: ph };

    // 关闭按钮
    let closeX = px + pw - 22, closeY = py + 8;
    let closeHovered = mouseX !== undefined && mouseX > closeX && mouseX < closeX + 16 && mouseY !== undefined && mouseY > closeY && mouseY < closeY + 16;
    CT.drawCloseButton(ctx, closeX, closeY, 16, 16, closeHovered);
    G._leftPanelClose = { x: closeX, y: closeY, w: 16, h: 16 };

    if (G.leftPanel === 'economy') {
        drawLeftEconomyPanel(px + 10, py + 5, pw - 20, ph - 10);
    } else if (G.leftPanel === 'navy') {
        drawLeftNavyPanel2(px + 8, py + 5, pw - 16, ph - 10);
    }
    ctx.restore();
}

function handleLeftPanelClick(mx, my) {
    // 检查左侧标签栏
    if (G._leftSidebarTabs) {
        for (let btn of G._leftSidebarTabs) {
            if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h) {
                G.leftPanel = (G.leftPanel === btn.panel) ? null : btn.panel;
                G.activeTab = null;
                // 切换面板时重置滚动位置
                if (G.leftPanel === 'navy') _navyPanelScroll = 0;
                if (G.leftPanel === 'economy') _econScroll = 0;
                return true;
            }
        }
    }
    // 关闭按钮
    if (G.leftPanel && G._leftPanelClose) {
        let cb = G._leftPanelClose;
        if (mx > cb.x && mx < cb.x + cb.w && my > cb.y && my < cb.y + cb.h) {
            G.leftPanel = null;
            return true;
        }
    }
    // 海军面板按钮
    if (G.leftPanel === 'navy' && G._leftPanelRect) {
        if (typeof _showNavyGuide !== 'undefined' && _showNavyGuide) {
            let gr = window._navyGuideRect;
            if (gr && (mx < gr.x || mx > gr.x + gr.w || my < gr.y || my > gr.y + gr.h)) {
                _showNavyGuide = false;
                _navyGuideScroll = 0;
                return true;
            }
        }
        if (G._navyBtns) {
            for (let btn of G._navyBtns) {
                if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h) {
                    handleNavyButton(btn);
                    return true;
                }
            }
        }
    }
    // 点击面板内部阻止穿透
    if (G.leftPanel && G._leftPanelRect) {
        let r = G._leftPanelRect;
        if (mx > r.x && mx < r.x + r.w && my > r.y && my < r.y + r.h) {
            return true;
        }
    }
    return false;
}

function handleNavyButton(btn) {
    if (btn.type === 'build') {
        let node = G.navyNodes[btn.nodeId];
        if (!node) return;
        let cData = G.countries[G.playerCountry];
        if (!cData || cData.treasury < 500 || cData.manpower < 5) return;
        cData.treasury -= 500; cData.manpower -= 5;
        if (!G.navyBuildQueue) G.navyBuildQueue = [];
        G.navyBuildQueue.push({ type: 'navy', nodeId: btn.nodeId, days: 30, totalDays: 30 });
        addGameLog("在" + (node.name || "海军节点") + "开始建造舰船 (30天)");
    } else if (btn.type === 'buildSub') {
        let node = G.navyNodes[btn.nodeId];
        if (!node) return;
        let cData = G.countries[G.playerCountry];
        let subCost = UNIT_TYPES.submarine.cost;
        if (!cData || cData.treasury < subCost || cData.manpower < 3) return;
        if (typeof SUBMARINE_POWERS === 'undefined' || !SUBMARINE_POWERS.includes(G.playerCountry)) return;
        cData.treasury -= subCost; cData.manpower -= 3;
        if (!G.navyBuildQueue) G.navyBuildQueue = [];
        G.navyBuildQueue.push({ type: 'submarine', nodeId: btn.nodeId, days: 20, totalDays: 20 });
        addGameLog("在" + (node.name || "海军节点") + "开始建造潜艇 (20天)");
    } else if (btn.type === 'upgrade') {
        let node = G.navyNodes[btn.nodeId];
        if (!node || node.upgradeTimer > 0) return;
        let nextLv = null;
        for (let nl of NODE_LEVELS) { if (nl.level === node.level + 1) { nextLv = nl; break; } }
        if (!nextLv) return;
        let cData = G.countries[G.playerCountry];
        if (!cData || cData.treasury < nextLv.upgradeCost) return;
        cData.treasury -= nextLv.upgradeCost;
        node.upgradeTimer = nextLv.upgradeTime; node.upgradeProgress = 0;
        addGameLog("开始升级" + (node.name || "海军节点") + " (Lv." + node.level + "→" + nextLv.level + ")");
    } else if (btn.type === 'selectNode') {
        G.selectedNavyNode = btn.nodeId;
    } else if (btn.type === 'selectAllShips') {
        let nodeShips = G.ships.filter(s => s.nodeId === btn.nodeId && s.country === G.playerCountry);
        let divIds = [];
        for (let ship of nodeShips) { let div = G.divisions.find(d => d.shipId === ship.id); if (div) divIds.push(div.id); }
        if (divIds.length > 0) { G.selectedDivisions = divIds; addGameLog("已选中 " + divIds.length + " 艘舰船"); }
    } else if (btn.type === 'scrollUp') {
        _navyPanelScroll = Math.max(0, _navyPanelScroll - _navyScrollStep);
    } else if (btn.type === 'scrollDown') {
        _navyPanelScroll = Math.min(_navyMaxScroll, _navyPanelScroll + _navyScrollStep);
    } else if (btn.type === 'toggleGuide') {
        _showNavyGuide = !_showNavyGuide; _navyGuideScroll = 0;
    } else if (btn.type === 'guideScrollUp') {
        _navyGuideScroll = Math.max(0, _navyGuideScroll - 80);
    } else if (btn.type === 'guideScrollDown') {
        _navyGuideScroll = Math.min(_navyGuideMaxScroll || 0, _navyGuideScroll + 80);
    }
}

// ===== 左侧经济面板 =====
function drawLeftEconomyPanel(px, py, pw, ph) {
    ctx.fillStyle = CT.textH;
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("💰 经济概况", px, py);

    let g = G.playerCountry && G.countries[G.playerCountry];
    if (!g) return;
    let gy = py + 25;
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = CT.text;
    ctx.fillText("国库: " + Math.floor(g.treasury), px, gy); gy += 18;
    ctx.fillStyle = g.income >= g.expenses ? CT.success : CT.danger;
    ctx.fillText("收入: +" + g.income + "/天", px, gy); gy += 18;
    ctx.fillText("支出: -" + g.expenses + "/天 (师团维护)", px, gy); gy += 20;

    let net = g.income - g.expenses;
    ctx.fillStyle = net >= 0 ? CT.success : CT.danger;
    ctx.font = "bold 12px Georgia,serif";
    ctx.fillText("净收支: " + (net >= 0 ? "+" : "") + net.toFixed(1) + "/天", px, gy); gy += 20;
    ctx.font = "11px Georgia,serif";

    if (net < 0 && g.treasury > 0) {
        let daysLeft = Math.floor(g.treasury / Math.abs(net));
        ctx.fillStyle = "#d4a84a";
        ctx.fillText("国库可维持: " + daysLeft + " 天", px, gy); gy += 18;
    }

    ctx.fillStyle = CT.textM;
    ctx.fillText("师团总数: " + G.divisions.filter(d => d.country === G.playerCountry).length, px, gy); gy += 18;
    ctx.fillText("控制省份: " + Object.values(G.provinceData).filter(p => p.country === G.playerCountry).length, px, gy); gy += 18;
    let totalFactories = Object.values(G.provinceData).filter(p => p.country === G.playerCountry).reduce((s, p) => s + (p.factories || 0), 0);
    ctx.fillText("工厂总数: " + totalFactories, px, gy); gy += 18;

    gy += 4;
    ctx.fillStyle = CT.border;
    ctx.font = "10px Georgia,serif";
    ctx.fillText("─ 各国经济 ─", px, gy); gy += 14;
    for (let [co, data] of Object.entries(G.countries)) {
        if (data.income === 0 && data.expenses === 0) continue;
        ctx.fillText(COUNTRY_CN[co] + " 国库:" + Math.floor(data.treasury) +
            " 收支:" + (data.income - data.expenses >= 0 ? "+" : "") +
            (data.income - data.expenses).toFixed(1), px, gy);
        gy += 13; if (gy > py + ph - 10) break;
    }
}

// ===== 左侧海军面板（适配窄宽度） =====
function drawLeftNavyPanel2(px, py, pw, ph) {
    if (!G.navyNodes) G.navyNodes = {};
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();

    let x = px;
    let baseY = py;
    let dy = baseY - _navyPanelScroll;
    G._navyBtns = [];

    // 标题行
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("🚢 海军管理", x, dy);

    // 指南按钮
    let guideBtnX = px + pw - 20;
    let guideHovered = mouseX !== undefined && mouseX > guideBtnX && mouseX < guideBtnX + 16 && mouseY !== undefined && mouseY > dy && mouseY < dy + 16;
    ctx.fillStyle = guideHovered ? "rgba(180,140,80,0.25)" : "rgba(180,140,80,0.12)";
    ctx.fillRect(guideBtnX, dy, 16, 16);
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📖", guideBtnX + 8, dy + 4);
    G._navyBtns.push({ type: 'toggleGuide', x: guideBtnX, y: dy, w: 16, h: 16 });

    baseY += 20; dy = baseY - _navyPanelScroll;

    if (_showNavyGuide) {
        ctx.restore();
        drawNavyGuideModal();
        return;
    }

    if (!G.playerCountry) {
        ctx.fillStyle = "rgba(200,180,150,0.3)"; ctx.font = "10px sans-serif";
        ctx.fillText("请先选择国家", x, dy); ctx.restore(); return;
    }

    let myNodes = [];
    for (let id in G.navyNodes) {
        if (G.navyNodes[id].country === G.playerCountry) myNodes.push(G.navyNodes[id]);
    }
    if (myNodes.length === 0) {
        ctx.fillStyle = "rgba(200,180,150,0.3)"; ctx.font = "10px sans-serif";
        ctx.fillText("本国无海军节点", x, dy); ctx.restore(); return;
    }

    if (!G.selectedNavyNode && myNodes.length > 0) G.selectedNavyNode = myNodes[0].id;

    let cData = G.countries[G.playerCountry];
    let treasury = cData ? cData.treasury : 0;
    let totalShips = G.ships.filter(s => s.country === G.playerCountry).length;

    ctx.fillStyle = "rgba(200,180,150,0.45)";
    ctx.font = "10px Georgia,serif";
    ctx.fillText("舰船: " + totalShips + "  |  资金: $" + treasury, x, dy);
    baseY += 18; dy = baseY - _navyPanelScroll;

    // 节点卡片
    let cardW = pw;
    let cardH = 54;
    for (let node of myNodes) {
        let visible = dy + cardH > py && dy < py + ph;
        let hovered = mouseX !== undefined && mouseX > x && mouseX < x + cardW
                    && mouseY !== undefined && mouseY > dy && mouseY < dy + cardH;
        let selected = G.selectedNavyNode === node.id;

        if (visible) {
            // 卡片背景
            ctx.fillStyle = selected ? "rgba(180,140,80,0.18)" : (hovered ? "rgba(180,140,80,0.08)" : "rgba(0,0,0,0.15)");
            ctx.fillRect(x, dy, cardW, cardH);
            if (selected) {
                ctx.fillStyle = "#FFD700"; ctx.fillRect(x, dy, 3, cardH);
                ctx.strokeStyle = "rgba(255,215,0,0.5)"; ctx.lineWidth = 1;
                ctx.strokeRect(x, dy, cardW, cardH);
            } else {
                ctx.strokeStyle = "rgba(180,140,80,0.08)"; ctx.lineWidth = 0.5;
                ctx.strokeRect(x, dy, cardW, cardH);
            }

            // 节点名称和等级
            ctx.font = "bold 11px sans-serif";
            ctx.fillStyle = selected ? "#FFD700" : "#e8d8b0";
            ctx.textAlign = "left";
            ctx.fillText(node.name || node.id, x + 10, dy + 5);

            let lvColor = node.level === 3 ? '#FFD700' : (node.level === 2 ? '#4A90D9' : '#888888');
            ctx.fillStyle = lvColor; ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText("Lv." + node.level, x + cardW - 10, dy + 5);

            // 区域名和舰船数
            ctx.font = "9px sans-serif";
            ctx.fillStyle = "rgba(180,210,255,0.45)";
            ctx.textAlign = "left";
            ctx.fillText(node.region.replace(/_/g, ' '), x + 10, dy + 20);

            let nodeShips = G.ships.filter(s => s.nodeId === node.id);
            ctx.fillStyle = "rgba(200,180,150,0.4)";
            ctx.textAlign = "right";
            ctx.fillText("舰船: " + nodeShips.length, x + cardW - 10, dy + 20);

            // 按钮区域
            let btnY = dy + 32;
            ctx.textAlign = "center";
            if (node.upgradeTimer > 0) {
                node.upgradeProgress = Math.min(1, node.upgradeProgress || 0);
                let barY = btnY + 2, barW = cardW - 20;
                ctx.fillStyle = "rgba(180,140,80,0.1)";
                ctx.fillRect(x + 10, barY, barW, 4);
                ctx.fillStyle = "#4A90D9";
                ctx.fillRect(x + 10, barY, barW * node.upgradeProgress, 4);
                ctx.font = "8px sans-serif"; ctx.fillStyle = "rgba(200,180,150,0.5)";
                ctx.fillText("升级中 " + Math.floor(node.upgradeProgress * 100) + "%", x + cardW / 2, barY + 6);
            } else {
                let nq = G.navyBuildQueue || [];
                let nodeQueue = nq.filter(n => n.nodeId === node.id);
                if (nodeQueue.length > 0) {
                    let building = nodeQueue[0];
                    let progress = building.totalDays > 0 ? Math.max(0, 1 - building.days / building.totalDays) : 0;
                    ctx.fillStyle = "rgba(180,140,80,0.1)";
                    ctx.fillRect(x + 10, btnY + 2, cardW - 20, 4);
                    ctx.fillStyle = "#4A8AD4";
                    ctx.fillRect(x + 10, btnY + 2, (cardW - 20) * progress, 4);
                    ctx.font = "8px sans-serif"; ctx.fillStyle = "rgba(200,180,150,0.5)";
                    ctx.fillText("建造中 " + Math.floor(progress * 100) + "%", x + cardW / 2, btnY + 8);
                } else {
                    let btnH = 16;
                    // 升级按钮
                    if (node.level < 3) {
                        let nextLv = getNodeLevelDef(node.level + 1);
                        let canUpg = treasury >= nextLv.upgradeCost;
                        let bx = x + 10, bw = 52;
                        ctx.fillStyle = canUpg ? "rgba(60,120,180,0.5)" : "rgba(100,100,100,0.3)";
                        ctx.fillRect(bx, btnY, bw, btnH);
                        ctx.fillStyle = canUpg ? "#6a8aaa" : "rgba(200,180,150,0.25)";
                        ctx.font = "8px sans-serif";
                        ctx.fillText("升级 $" + nextLv.upgradeCost, bx + bw / 2, btnY + 4);
                        G._navyBtns.push({ type: 'upgrade', nodeId: node.id, x: bx, y: btnY, w: bw, h: btnH });
                    }
                    // 潜艇按钮
                    let canSub = treasury >= UNIT_TYPES.submarine.cost && cData && cData.manpower >= 3 && typeof SUBMARINE_POWERS !== 'undefined' && SUBMARINE_POWERS.includes(G.playerCountry);
                    let sbw = 50, sbx = x + cardW - sbw - 10 - 66 - 4;
                    ctx.fillStyle = canSub ? "rgba(80,140,200,0.5)" : "rgba(100,100,100,0.3)";
                    ctx.fillRect(sbx, btnY, sbw, btnH);
                    ctx.fillStyle = canSub ? "#6a8aaa" : "rgba(200,180,150,0.25)";
                    ctx.font = "8px sans-serif";
                    ctx.fillText("🦈 $" + UNIT_TYPES.submarine.cost, sbx + sbw / 2, btnY + 4);
                    G._navyBtns.push({ type: 'buildSub', nodeId: node.id, x: sbx, y: btnY, w: sbw, h: btnH });

                    // 建造按钮
                    let cost = 500;
                    let canBuild = treasury >= cost && cData && cData.manpower >= 5;
                    let bbw = 62, bbx = x + cardW - bbw - 10;
                    ctx.fillStyle = canBuild ? "rgba(60,180,100,0.5)" : "rgba(100,100,100,0.3)";
                    ctx.fillRect(bbx, btnY, bbw, btnH);
                    ctx.fillStyle = canBuild ? "#7a9a5a" : "rgba(200,180,150,0.25)";
                    ctx.font = "8px sans-serif";
                    ctx.fillText("建造 $" + cost, bbx + bbw / 2, btnY + 4);
                    G._navyBtns.push({ type: 'build', nodeId: node.id, x: bbx, y: btnY, w: bbw, h: btnH });
                }
            }
        }
        G._navyBtns.push({ type: 'selectNode', nodeId: node.id, x: x, y: dy, w: cardW, h: cardH });
        baseY += cardH + 4; dy = baseY - _navyPanelScroll;
    }

    // 舰船列表
    let selNode = myNodes.find(n => n.id === G.selectedNavyNode);
    if (selNode) {
        baseY += 4; dy = baseY - _navyPanelScroll;
        ctx.fillStyle = "rgba(180,140,80,0.15)"; ctx.fillRect(x, dy, pw, 1);
        baseY += 6; dy = baseY - _navyPanelScroll;

        ctx.font = "bold 11px sans-serif"; ctx.fillStyle = "#FFD700";
        ctx.textAlign = "left";
        ctx.fillText("▸ " + (selNode.name || selNode.id) + " 舰船", x, dy);

        // 全选按钮
        let selAllX = x + pw - 60;
        let selAllHovered = mouseX !== undefined && mouseX > selAllX && mouseX < selAllX + 56 && mouseY !== undefined && mouseY > dy && mouseY < dy + 14;
        ctx.fillStyle = selAllHovered ? "rgba(60,180,255,0.35)" : "rgba(60,180,255,0.15)";
        ctx.fillRect(selAllX, dy, 56, 14);
        ctx.fillStyle = "#6a8aaa"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("全选舰船", selAllX + 28, dy + 3);
        G._navyBtns.push({ type: 'selectAllShips', nodeId: selNode.id, x: selAllX, y: dy, w: 56, h: 14 });
        baseY += 16; dy = baseY - _navyPanelScroll;

        let nodeShips = G.ships.filter(s => s.nodeId === selNode.id);
        if (nodeShips.length === 0) {
            ctx.font = "10px sans-serif"; ctx.fillStyle = "rgba(200,180,150,0.3)";
            ctx.textAlign = "left";
            ctx.fillText("暂无舰船，点击建造", x, dy);
        } else {
            // 表头
            ctx.fillStyle = "rgba(180,140,80,0.08)"; ctx.fillRect(x, dy, pw, 14);
            ctx.fillStyle = "rgba(200,180,150,0.4)"; ctx.font = "8px sans-serif"; ctx.textAlign = "left";
            ctx.fillText("舰名", x + 4, dy + 4);
            ctx.fillText("速", x + 130, dy + 4);
            ctx.fillText("程", x + 152, dy + 4);
            ctx.fillText("火", x + 174, dy + 4);
            ctx.fillText("威", x + 196, dy + 4);
            ctx.fillText("生", x + 218, dy + 4);
            ctx.fillText("动", x + 240, dy + 4);
            baseY += 16; dy = baseY - _navyPanelScroll;

            for (let ship of nodeShips) {
                if (dy + 16 > py && dy < py + ph) {
                    // 行背景交替
                    ctx.fillStyle = "rgba(180,140,80,0.04)";
                    ctx.fillRect(x, dy, pw, 16);

                    ctx.font = "8px sans-serif"; ctx.textAlign = "left";
                    ctx.fillStyle = ship.color || "#fff";
                    let displayName = ship.name;
                    if (displayName.length > 14) displayName = displayName.substring(0, 13) + '…';
                    ctx.fillText(displayName, x + 4, dy + 4);

                    ctx.font = "7px sans-serif";
                    let stats = [
                        (ship.speed * 100).toFixed(0) + '%',
                        (ship.range * 100).toFixed(0) + '%',
                        (ship.fireRate * 100).toFixed(0) + '%',
                        (ship.power * 100).toFixed(0) + '%',
                        (ship.hp * 100).toFixed(0) + '%',
                        (ship.maneuver * 100).toFixed(0) + '%',
                    ];
                    let statX = [130, 152, 174, 196, 218, 240];
                    for (let si = 0; si < stats.length; si++) {
                        let val = parseFloat(stats[si]);
                        ctx.fillStyle = val >= 100 ? "#7ad47a" : val >= 80 ? "#c8c8c8" : "rgba(200,180,150,0.5)";
                        ctx.fillText(stats[si], x + statX[si], dy + 4);
                    }
                }
                baseY += 16; dy = baseY - _navyPanelScroll;
            }
        }
    }

    // 滚动条
    _navyMaxScroll = Math.max(0, baseY - py - ph + 20);
    if (_navyMaxScroll > 0) {
        let scrollBarX = px + pw - 5;
        let scrollH = Math.max(20, ph * ph / Math.max(1, baseY - py));
        let scrollY = py + _navyPanelScroll / _navyMaxScroll * (ph - scrollH);
        ctx.fillStyle = "rgba(180,140,80,0.3)";
        ctx.fillRect(scrollBarX, scrollY, 3, scrollH);
    }

    ctx.restore();
}

// 渲染入口
function drawLeftPanelIfNeeded() {
    drawLeftSidebar();
    drawNavyGraveInfoPanel();
}
