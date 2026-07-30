// Iron & Dominion 1914 — 游戏UI面板（地图绘制、师团、炮弹、面板）

// ===== 加载旗帜贴图 =====
const FLAG_IMAGES = {};
const FLAG_COUNTRIES = ['uk','greece','russia','spain','portugal','albania','austria','montenegro'];
const FLAG_COUNTRY_MAP = {
    'UK': 'uk', 'GREECE': 'greece', 'RUSSIA': 'russia',
    'SPAIN': 'spain', 'PORTUGAL': 'portugal', 'ALBANIA': 'albania',
    'AUSTRIA_HUNGARY': 'austria', 'MONTENEGRO': 'montenegro',
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
            ctx.fillStyle='#ffd700';
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
                    let ty = p.startY + (p.endY - p.startY) * t + Math.sin(t*Math.PI) * 0.3;
                    let [ptx, pty] = worldToScreen(tx, ty);
                    ctx.lineTo(ptx, pty);
                }
                ctx.strokeStyle = "rgba(255,200,50,0.12)"; ctx.lineWidth = 1; ctx.setLineDash([3,4]);
                ctx.stroke(); ctx.setLineDash([]);
            }
            let r = p.type === 'artillery' ? 4 : 2.5;
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2);
            ctx.fillStyle = "#ffcc00"; ctx.fill();
            ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 10;
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
        ctx.save();

        // === Unit background circle (diplomatic) ===
        let bgColor = null;
        let bgRadius = r + 4;
        let isAlly = G.alliances && G.playerCountry && G.alliances[G.playerCountry] && G.alliances[G.playerCountry][div.country];
        let isAtWar = isAtWarWithPlayer(div.country);

        if (isPlayer) {
            bgColor = "rgba(80,255,80,0.18)"; // player = light green
        } else if (isAtWar) {
            bgColor = "rgba(255,80,80,0.20)"; // enemy = light red
        } else if (isAlly) {
            bgColor = "rgba(80,160,255,0.18)"; // ally = light blue
        } else {
            bgColor = "rgba(255,255,150,0.12)"; // neutral = light yellow
        }
        if (bgColor) {
            ctx.beginPath(); ctx.arc(sx, sy, bgRadius, 0, Math.PI*2);
            ctx.fillStyle = bgColor; ctx.fill();
            ctx.strokeStyle = bgColor.replace('0.20','0.4').replace('0.15','0.3');
            ctx.lineWidth = 1.5; ctx.stroke();
        }

        if (isSel) { ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
        ctx.fillStyle = COUNTRY_COLORS[div.country] || "#888"; ctx.fill();
        ctx.shadowBlur = 0;
        if (isSel) { ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2; ctx.stroke(); }

        // === 工兵紫色拆除圈（仅选中时显示） ===
        if (div.type === 'engineer' && isPlayer && isSel) {
            let demolishRange = 0.5;
            let [rx3, ry3] = worldToScreen(rx + demolishRange, ry);
            let dPixels = Math.abs(rx3 - sx);
            ctx.save();
            ctx.beginPath(); ctx.arc(sx, sy, dPixels, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(160,80,220,0.4)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "rgba(160,80,220,0.05)"; ctx.fill();
            ctx.restore();
        }

        // === Draw emoji with fallback ===
        let emoji = ut.sym;
        ctx.save();
        ctx.font = (r*1.5)+"px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(emoji, sx, sy-1);
        ctx.restore();

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
            ctx.fillStyle = div.strength > 50 ? "#5a8a4a" : "#d47a4a";
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
        ctx.restore();
    }
    } // end zoom check for unit drawing

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
    ctx.fillStyle = "rgba(10,15,26,0.88)";
    ctx.fillRect(0, 0, canvas.width, h);
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
        ctx.fillStyle = "#e8d8b0";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(COUNTRY_CN[G.playerCountry] || G.playerCountry, lx, cy);
        lx += ctx.measureText(COUNTRY_CN[G.playerCountry] || G.playerCountry).width + 14;

        // 分隔符
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(lx, cy - 8, 1, 16);
        lx += 8;

        // 💰 国库
        ctx.fillStyle = ge.treasury >= 0 ? "#e8d8b0" : "#d47a4a";
        ctx.font = "11px sans-serif";
        ctx.fillText("💰" + Math.floor(ge.treasury), lx, cy);
        lx += ctx.measureText("💰" + Math.floor(ge.treasury)).width + 8;

        // 📈 收入/支出
        ctx.fillStyle = ge.income >= ge.expenses ? "rgba(100,200,100,0.7)" : "rgba(200,100,100,0.7)";
        ctx.fillText("📈+" + ge.income + "/-" + ge.expenses, lx, cy);
        lx += ctx.measureText("📈+" + ge.income + "/-" + ge.expenses).width + 8;

        // 分隔符
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(lx, cy - 8, 1, 16);
        lx += 8;

        // 👥 人口
        ctx.fillStyle = ge.manpower > (ge.maxManpower || 1000000) * 0.2 ? "#7ab8d4" : "#d47a4a";
        ctx.fillText("👥" + Math.floor((ge.manpower || 0) / 1000) + "M", lx, cy);
        lx += ctx.measureText("👥" + Math.floor((ge.manpower || 0) / 1000) + "M").width + 8;

        // 分隔符
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(lx, cy - 8, 1, 16);
        lx += 8;

        // ⚔️ 师团
        let army = ge.divCount || 0;
        ctx.fillStyle = "#d4a44a";
        ctx.fillText("⚔️" + army + "师", lx, cy);
    }

    // === RIGHT SIDE: 日期 + 时间控制 ===
    let rx = canvas.width - 12;

    // === CENTER: FPS 实时显示 ===
    let fps = window._fps || 0;
    ctx.fillStyle = fps >= 30 ? "rgba(100,200,100,0.85)" : "rgba(220,80,80,0.85)";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(fps + " FPS", canvas.width / 2, cy);

    // 速度按钮 (从右往左)
    let spd = [1, 2, 4, 8, 16, 32, 64];
    let spdIdx = G.speed || 0;
    G._spdBtns = [];
    for (let i = spd.length - 1; i >= 0; i--) {
        let bw = 26;
        let bx = rx - bw;
        ctx.fillStyle = spdIdx === i ? "#c8b88a" : "rgba(255,255,255,0.12)";
        ctx.fillRect(bx, cy - 10, bw, 20);
        ctx.fillStyle = spdIdx === i ? "#0a0f1a" : "rgba(255,255,255,0.45)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("x" + spd[i], bx + bw / 2, cy);
        G._spdBtns[i] = { x: bx, y: cy - 10, w: bw, h: 20 };
        rx = bx - 4;
    }

    // 暂停按钮
    let pauseW = 26;
    ctx.fillStyle = G.paused ? "#d47a4a" : "rgba(100,200,100,0.3)";
    ctx.fillRect(rx - pauseW, cy - 10, pauseW, 20);
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(G.paused ? "▶" : "■", rx - pauseW / 2, cy);
    // Store pause button bounds for click detection
    G._pauseBtn = { x: rx - pauseW, y: cy - 10, w: pauseW, h: 20 };
    rx -= pauseW + 8;

    // 日期文本
    let ds = G.date.getFullYear() + "." + (G.date.getMonth()+1) + "." + G.date.getDate();
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 11px Georgia,serif";
    ctx.textAlign = "right";
    ctx.fillText(ds, rx, cy);

    ctx.restore();
}

// ===== 底部状态栏 =====
function drawGameBottomBar() {
    let barY = canvas.height - BOTTOM_BAR_HEIGHT;
    ctx.save();
    ctx.fillStyle = "rgba(10,15,26,0.7)";
    ctx.fillRect(0, barY, canvas.width, BOTTOM_BAR_HEIGHT);
    let layerName = "战略层";
    let layerColor = "#7ab8d4";
    if (zoom >= STRATEGIC_ZOOM && zoom < TACTICAL_ZOOM) { layerName = "战役层"; layerColor = "#c4a86a"; }
    else if (zoom >= TACTICAL_ZOOM) { layerName = "战术层"; layerColor = "#d47a7a"; }
    ctx.font = "bold 12px Georgia,serif";
    ctx.textAlign = "left";
    ctx.fillStyle = layerColor;
    ctx.fillText(layerName, 16, barY + 15);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("滚轮缩放 · 中键拖移 · 左键框选 · Ctrl+数字编组", 16, barY + 33);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px monospace";
    ctx.fillText("x" + zoom.toFixed(2), canvas.width - 16, barY + 15);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px sans-serif";
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
    }
}

// ===== 城市详情面板（右侧） =====
function drawCityPanel() {
    let city = G.selectedCity;
    if (!city) return;
    let isOwn = city.owner === G.playerCountry;
    let treasury = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0;
    let cityFactories = CITY_FACTORIES[city.id] || 0;
    let manpower = isOwn && G.countries[G.playerCountry] ? G.countries[G.playerCountry].manpower : 0;

    // 城市血量
    let cityData = G.cities[city.id];
    let cityHp = cityData ? cityData.hp : 50;
    let cityMaxHp = cityData ? cityData.maxHp : 50;

    // 检查该城市的建造队列
    let cityQueue = [];
    if (isOwn && G.buildQueue) {
        cityQueue = G.buildQueue.filter(bq => bq.cityId === city.id);
    }

    let x = canvas.width - 180;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 170;
    let typeCount = isOwn ? (isMajorCity(city.id) ? 5 : 1) : 0;
    let queueH = cityQueue.length > 0 ? 10 + cityQueue.length * 20 : 0;
    let upgradeH = (isOwn && !isMajorCity(city.id)) ? 30 : 0;
    let baseH = isOwn ? 100 + typeCount * 28 + queueH + upgradeH : 110;
    let h = baseH;

    ctx.save();
    ctx.fillStyle = "rgba(10,15,26,0.95)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    let accentColor = isOwn ? "#ffd700" : (COUNTRY_COLORS[city.owner] || "#888");
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3, h);

    // 注册点击区域
    window._cityPanelRect = { x: x, y: y, w: w, h: h };

    // 城市名称 + 归属国
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("🏰 " + city.name, x + 12, y + 6);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px sans-serif";
    ctx.fillText(COUNTRY_CN[city.owner] || city.owner, x + 12, y + 22);

    // 城市血量
    let hpText = "❤️ 血量: " + Math.floor(cityHp) + "/" + Math.floor(cityMaxHp);
    if (cityHp < cityMaxHp) {
        let hpRatio = cityHp / cityMaxHp;
        let hpColor = hpRatio > 0.6 ? "#4a8a2a" : hpRatio > 0.3 ? "#c89820" : "#b83020";
        ctx.fillStyle = hpColor;
    } else {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
    }
    ctx.font = "10px sans-serif";
    ctx.fillText(hpText, x + 12, y + 36);
    // 血量条
    let hpBarW = w - 24;
    let hpBarX = x + 12;
    let hpBarY = y + 48;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(hpBarX, hpBarY, hpBarW, 4);
    ctx.fillStyle = cityHp > cityMaxHp * 0.6 ? "#4a8a2a" : cityHp > cityMaxHp * 0.3 ? "#c89820" : "#b83020";
    ctx.fillRect(hpBarX, hpBarY, hpBarW * Math.max(0, cityHp / cityMaxHp), 4);

    // 工厂数（仅本国显示）
    if (isOwn) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "10px sans-serif";
        ctx.fillText("🏭 工厂: " + cityFactories, x + 12, y + 56);
    }

    let ly = isOwn ? y + 76 : y + 60;
    if (!isOwn) {
        // 外国城市：显示驻军信息
        ly += 6;
        let garrisoned = G.divisions.filter(d => d.garrisonCityId === city.id && d.country === G.playerCountry);
        if (garrisoned.length > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(x + 10, ly, w - 20, 1);
            ly += 6;
            ctx.fillStyle = "#8ab8d4";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("🛡️ 驻军: " + garrisoned.length + " 单位", x + 12, ly + 2);
            ly += 20;
        }
        // 显示敌对关系
        if (G.playerCountry && areAtWar(G.playerCountry, city.owner)) {
            ctx.fillStyle = "#d44";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("⚔️ 交战中", x + w/2, ly);
            ly += 18;
        } else if (G.playerCountry && isSameFaction(G.playerCountry, city.owner)) {
            ctx.fillStyle = "rgba(100,200,150,0.8)";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🤝 同盟", x + w/2, ly);
            ly += 18;
        }
        ctx.restore();
        return;
    }

    // === 本国城市：建造队列 & 生产 ===
    if (!window._cityBtns) window._cityBtns = [];
    window._cityBtns = [];
    if (!window._cityPinBtns) window._cityPinBtns = [];
    window._cityPinBtns = [];
    // 建造队列
    if (cityQueue.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 10, ly, w - 20, 1);
        ly += 4;
        ctx.fillStyle = "#4a8ad4";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("📋 建造队列:", x + 12, ly + 2);
        ly += 16;
        for (let bq of cityQueue) {
            let progress = bq.totalDays > 0 ? Math.round((1 - bq.days / bq.totalDays) * 100) : 0;
            let label = bq.type === 'factory' ? '🏗️ 工厂' : (UNIT_TYPES[bq.unitType] ? UNIT_TYPES[bq.unitType].sym + ' ' + UNIT_TYPES[bq.unitType].label : '单位');
            let remaining = Math.ceil(bq.days);
            // 置顶按钮（最左侧，仅当非第一项时显示）
            let isFirst = (cityQueue.indexOf(bq) === 0);
            let pinX = x + 10;
            let pinHovered = !isFirst && mouseY !== undefined && mouseY > ly && mouseY < ly + 18 && mouseX > pinX - 2 && mouseX < pinX + 16;
            let pinColor = pinHovered ? "#ffd700" : "rgba(255,255,255,0.2)";
            if (!isFirst) {
                ctx.fillStyle = pinHovered ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.05)";
                ctx.fillRect(pinX - 2, ly, 16, 18);
                ctx.fillStyle = pinColor;
                ctx.font = "11px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("▴", pinX + 6, ly + 6);
                window._cityPinBtns.push({ cityId: city.id, bqIndex: cityQueue.indexOf(bq), x: pinX - 2, y: ly, w: 16, h: 18 });
            }
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(label + " " + progress + "% (" + remaining + "天)", x + 28, ly + 2);
            // 迷你进度条
            let barW2 = w - 52;
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillRect(x + 28, ly + 12, barW2, 3);
            ctx.fillStyle = "#4a8ad4";
            ctx.fillRect(x + 28, ly + 12, barW2 * (progress / 100), 3);
            ly += 20;
        }
        ly += 2;
    }
    // 分隔线
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 10, ly, w - 20, 1);
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
            ctx.fillStyle = "rgba(180,140,40,0.25)";
            ctx.fillRect(x + 8, ly, w - 16, 27);
            ctx.strokeStyle = "rgba(255,215,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 27);
            ctx.fillStyle = "#ffd700";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText("⬆️ 升级大城市 " + Math.floor(progress * 100) + "% (" + remaining + "天)", x + 14, ly + 8);
            // 进度条
            let barW2 = w - 36;
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillRect(x + 14, ly + 18, barW2, 4);
            ctx.fillStyle = "#ffd700";
            ctx.fillRect(x + 14, ly + 18, barW2 * progress, 4);
            ly += 31;
            // 分隔线
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(x + 10, ly, w - 20, 1);
            ly += 8;
        } else {
            let canUpgrade = treasury >= 150;
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            ctx.fillStyle = hovered && canUpgrade ? "rgba(180,140,40,0.6)" : canUpgrade ? "rgba(180,140,40,0.35)" : "rgba(128,128,128,0.2)";
            ctx.fillRect(x + 8, ly, w - 16, 22);
            ctx.strokeStyle = hovered && canUpgrade ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 22);
            ctx.fillStyle = canUpgrade ? "#ffd700" : "rgba(255,255,255,0.3)";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText("⬆️ 升级为大城市 ($150)", x + 14, ly + 11);
            window._cityBtns.push({ id: 'upgrade_city', x: x + 8, y: ly, w: w - 16, h: 22, enabled: canUpgrade });
            ly += 26;
            // 分隔线
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(x + 10, ly, w - 20, 1);
            ly += 8;
        }
    }

    // 生产选项
    ctx.fillStyle = "#8ab8d4";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("— 生产 —", x + w/2, ly);
    ly += 18;

    let types = [];
    let isOccupied = cityData && cityData.occupierFlag;
    if (isOccupied) {
        // 占领城市只能生产步兵
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#5a8a4a', manpower:15});
    } else if (isMajorCity(city.id)) {
        types.push({id:'build_factory', label:'🏗️ 建工厂', cost:50, color:'#6a8a4a', desc: '当前' + cityFactories + '座'});
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#5a8a4a', manpower:15});
        types.push({id:'engineer', label:'⚙️ 工兵', cost:70, color:'#4a7a8a', manpower:12});
        types.push({id:'cavalry',  label:'🏇 骑兵', cost:80, color:'#8a7a4a', manpower:10});
        types.push({id:'artillery',label:'💥 炮兵', cost:120, color:'#8a4a5a', manpower:8});
    } else {
        // 小城市只能生产步兵
        types.push({id:'infantry', label:'⚔️ 步兵', cost:50, color:'#5a8a4a', manpower:15});
    }

    for (let t of types) {
        let can = treasury >= t.cost && (manpower === undefined || manpower >= (t.manpower || 0));
        let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        ctx.fillStyle = hovered && can ? t.color : can ? t.color + "88" : "rgba(128,128,128,0.2)";
        ctx.fillRect(x + 8, ly, w - 16, 22);
        ctx.strokeStyle = hovered && can ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 8, ly, w - 16, 22);
        ctx.fillStyle = can ? "#fff" : "rgba(255,255,255,0.3)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(t.label + " ($" + t.cost + ")", x + 14, ly + 11);
        if (t.desc) {
            ctx.fillStyle = can ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)";
            ctx.font = "8px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(t.desc, x + w - 14, ly + 11);
        }
        window._cityBtns.push({ id: t.id, x: x + 8, y: ly, w: w - 16, h: 22, enabled: can });
        ly += 26;
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
    ctx.fillStyle = "rgba(10,15,26,0.85)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    let color = COUNTRY_COLORS[co] || "#888";
    ctx.fillStyle = color;
    ctx.fillRect(panelX, panelY, 4, panelH);
    ctx.fillStyle = "#f0e6d0";
    ctx.font = "bold 14px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(getProvinceName(p), panelX + 14, panelY + 8);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px sans-serif";
    let cn = COUNTRY_CN[co] || co;
    ctx.fillText(cn, panelX + 14, panelY + 28);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "11px sans-serif";
    let y = panelY + 48;
    ctx.fillText("收入: " + pd.income.toFixed(1) + "  工厂: " + (pd.factories || 0) + "  储备: " + (pd.garrison || 0), panelX + 14, y);
    if (pd.fortification > 0) {
        ctx.fillText("防御工事: " + pd.fortification, panelX + 14, y + 16);
    }
    y += 32;
    if (divs.length > 0) {
        ctx.fillStyle = "#e8d8b0";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("部队 (" + divs.length + ")", panelX + 14, y);
        ctx.font = "10px sans-serif";
        for (let i = 0; i < Math.min(divs.length, 4); i++) {
            let d = divs[i];
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            ctx.fillStyle = d.strength > 50 ? "rgba(255,255,255,0.6)" : "#d47a4a";
            ctx.fillText(ut.label + " [" + Math.floor(d.strength) + "/" + d.maxStrength + "]", panelX + 20, y + 14 + i * 14);
        }
        if (divs.length > 4) {
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillText("..." + (divs.length - 4) + " 更多", panelX + 20, y + 14 + 4 * 14);
        }
    }
    if (moving.length > 0) {
        y += (divs.length > 0 ? Math.min(divs.length, 4) * 14 + 20 : 0);
        ctx.fillStyle = "#7ab8d4";
        ctx.font = "10px sans-serif";
        ctx.fillText("行军中: " + moving.length + " 支部队", panelX + 14, y + 14);
    }
    if (cData) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "10px sans-serif";
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

    let x = 10, y = TOP_BAR_HEIGHT + 10, w = 350;
    let baseH = 500;
    let h = baseH + extraLines * 16;
    // Clamp max height
    if (h > canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 20) h = canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 20;

    ctx.save();
    // Background — fully opaque with border
    ctx.fillStyle = "rgba(10,15,26,0.98)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(138,184,212,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    // Store sidebar bounds for click interception
    G._sidebarBounds = { x, y, w, h };
    // Country color bar
    ctx.fillStyle = COUNTRY_COLORS[co] || "#888";
    ctx.fillRect(x, y, 4, h);

    // 国旗
    drawCountryFlag(co, x + 12, y + 8, 50, 30);

    if (G.diplomacyFocus) {
        ctx.fillStyle = "rgba(255,200,100,0.4)";
        ctx.font = "8px sans-serif";
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
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(fullName[co] || COUNTRY_CN[co] || co, x + 68, y + 10);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(COUNTRY_CN[co] || co, x + 68, y + 25);

    // ===== 基础数据 =====
    let sy = y + 42;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 12, sy, w - 24, 1); sy += 6;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("💰 国库: " + Math.floor(cd.treasury), x + 16, sy); sy += 16;
    ctx.fillStyle = cd.income >= cd.expenses ? "rgba(100,200,100,0.7)" : "rgba(200,100,100,0.7)";
    ctx.fillText("📊 收入: +" + cd.income + "  支出: -" + cd.expenses, x + 16, sy); sy += 16;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("⚔️ 师团: " + (cd.divCount || 0), x + 16, sy); sy += 16;
    ctx.fillStyle = cd.stability > 70 ? "rgba(100,200,100,0.6)" : cd.stability > 40 ? "rgba(200,200,100,0.6)" : "rgba(200,100,100,0.6)";
    ctx.fillText("📈 稳定: " + Math.floor(cd.stability) + "%", x + 16, sy); sy += 16;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px sans-serif";
    ctx.fillText("稳定度<30%可能触发内部叛乱", x + 16, sy); sy += 14;

    // ===== 阵营 =====
    if (faction) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 12, sy, w - 24, 1); sy += 6;
        ctx.font = "11px sans-serif";
        ctx.fillStyle = faction === '同盟国' ? "rgba(220,180,100,0.8)" : "rgba(100,160,220,0.8)";
        ctx.fillText("🏴 阵营: " + faction, x + 16, sy); sy += 16;
    }

    // ===== 列强标识 =====
    if (isGreatPower(co)) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 12, sy, w - 24, 1); sy += 5;
        ctx.fillStyle = "rgba(255,200,80,0.15)";
        ctx.fillRect(x + 12, sy, w - 24, 18);
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#ffd700";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("⭐ 列  强", x + 16, sy + 3);
        sy += 22;
    }

    // ===== 附属国关系 =====
    if (suzerain || vassals.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 12, sy, w - 24, 1); sy += 6;
        if (suzerain) {
            // 本是附属国，显示宗主
            ctx.fillStyle = "rgba(180,140,60,0.15)";
            ctx.fillRect(x + 12, sy, w - 24, 18);
            ctx.font = "bold 11px sans-serif";
            ctx.fillStyle = "rgba(220,180,80,0.9)";
            ctx.fillText("👑 附属国", x + 16, sy + 2); sy += 14;
            ctx.font = "10px sans-serif";
            ctx.fillStyle = "rgba(200,200,200,0.7)";
            ctx.fillText("宗主: " + (COUNTRY_CN[suzerain]||suzerain), x + 24, sy); sy += 14;
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.font = "9px sans-serif";
            ctx.fillText("向宗主上缴20%收入", x + 24, sy); sy += 12;
        }
        if (vassals.length > 0) {
            // 本是宗主国，显示附属
            ctx.fillStyle = "rgba(180,140,60,0.15)";
            ctx.fillRect(x + 12, sy, w - 24, 16 + vassals.length * 14);
            ctx.font = "bold 11px sans-serif";
            ctx.fillStyle = "rgba(220,180,80,0.9)";
            ctx.fillText("👑 宗主国", x + 16, sy + 2); sy += 14;
            ctx.font = "10px sans-serif";
            for (let v of vassals) {
                drawCountryFlag(v, x + 24, sy, 14, 10);
                ctx.fillStyle = "rgba(200,200,200,0.7)";
                ctx.fillText(COUNTRY_CN[v] || v, x + 42, sy);
                sy += 14;
            }
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.font = "9px sans-serif";
            ctx.fillText("可自由通行附属领土", x + 24, sy); sy += 12;
        }
        sy += 2;
    }

    // ===== 同盟国 =====
    if (allies.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 12, sy, w - 24, 1); sy += 6;
        ctx.font = "11px sans-serif";
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
                ctx.font = "9px sans-serif";
                ctx.textAlign = "center";
                let tw = ctx.measureText(name).width + 6;
                let tx = fx + flagW2 / 2 - tw / 2;
                ctx.fillStyle = "rgba(10,15,26,0.9)";
                ctx.fillRect(tx, fy + flagH2 + 2, tw, 13);
                ctx.fillStyle = "#e8d8b0";
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
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 12, sy, w - 24, 1); sy += 6;
        ctx.font = "11px sans-serif";
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
                ctx.font = "9px sans-serif";
                ctx.textAlign = "center";
                let tw = ctx.measureText(name).width + 6;
                let tx = fx + flagW2 / 2 - tw / 2;
                ctx.fillStyle = "rgba(10,15,26,0.9)";
                ctx.fillRect(tx, fy + flagH2 + 2, tw, 13);
                ctx.fillStyle = "#e8d8b0";
                ctx.fillText(name, fx + flagW2 / 2, fy + flagH2 + 4);
            }
            drawCountryFlag(e, fx, fy, flagW2, flagH2);
            G._countryFlagBtns.push({ co: e, x: fx - 2, y: fy - 2, w: flagW2 + 4, h: flagH2 + 4 });
        }
        sy += Math.ceil(wars.length / cols2) * (flagH2 + gapY2) + 2;
        sy += 2;
    }

    // ===== 外交按钮 =====
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 12, sy, w - 24, 1); sy += 8;

    if (G.playerCountry && co !== G.playerCountry) {
        let rel = G.relations[co] || 0;
        let atWar = G.playerCountry && areAtWar(G.playerCountry, co);
        let isAlly = G.alliances && G.alliances[G.playerCountry] && G.alliances[G.playerCountry][co];
        let hasAccess = G.militaryAccess && G.militaryAccess[co] && G.militaryAccess[co][G.playerCountry];
        let alreadyAlly = isAlly;
        let alreadyAccess = hasAccess;

        // 关系值显示
        ctx.font = "11px sans-serif";
        ctx.fillStyle = rel > 0 ? "rgba(100,200,100,0.7)" : rel < -30 ? "rgba(200,100,100,0.7)" : "rgba(255,255,255,0.5)";
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
            btns.push({ id:"war", label:"⚔️ 宣战", tip: allied ? "同盟国之间不能宣战" : sameFaction ? "同阵营不能宣战" : "向"+(COUNTRY_CN[co]||co)+"宣战！稳定度-5", color:"#d47a4a", enabled: canWar });
            btns.push({ id:"rel", label:"🤝 改善关系 (💰50)", tip:"花费50金币，好感度+10", color:"#6a8aba", enabled: (cd.treasury||0) >= 50 });

            // 同盟申请 — 同阵营不能申请（已经是），好感度≥80
            let allianceReady = rel >= 80 && !alreadyAlly && !sameFaction;
            let allianceTip = alreadyAlly ? " [已同盟]" : sameFaction ? " [同阵营]" : "需要好感度≥80 (当前:"+rel+")";
            btns.push({ id:"alliance", label:"🤝 申请同盟", tip: allianceReady ? "与"+(COUNTRY_CN[co]||co)+"建立正式同盟（自动加入我方阵营）" : allianceTip,
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
                    btns.push({ id:"guarantee", label:"🛡️ 保障独立", tip:"保证"+(COUNTRY_CN[co]||co)+"的独立，他国攻击时自动宣战", color:"#6aaa8a", enabled: true });
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
            ctx.font = "9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("🛡️ 受" + guarantorsHere.map(g => COUNTRY_CN[g]||g).join(",") + "保障", x + 16, sy + 4);
            sy += 20;
        }

        for (let b of btns) {
            let bh = 26;
            let hovered = b.enabled && mouseY !== undefined && mouseY > sy && mouseY < sy + bh && mouseX > x + 8 && mouseX < x + w - 8;
            let alpha = b.enabled ? 1 : 0.55;
            // 按钮背景
            ctx.fillStyle = hovered ? b.color + "44" : "rgba(200,180,140,0.06)";
            ctx.globalAlpha = alpha;
            ctx.fillRect(x + 8, sy, w - 16, bh);
            ctx.strokeStyle = hovered ? b.color + "88" : "rgba(255,255,255,0.06)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, sy, w - 16, bh);
            // 按钮文字
            ctx.fillStyle = b.enabled ? (hovered ? "#fff" : "#c8b88a") : "rgba(255,255,255,0.5)";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(b.label, x + 16, sy + bh / 2);
            // 右侧状态指示
            if (!b.enabled && b.tip.includes("已")) {
                ctx.fillStyle = "rgba(100,200,100,0.4)";
                ctx.textAlign = "right";
                ctx.fillText("✓", x + w - 16, sy + bh / 2);
            } else if (!b.enabled) {
                ctx.fillStyle = "rgba(255,255,255,0.15)";
                ctx.textAlign = "right";
                ctx.fillText("🔒", x + w - 16, sy + bh / 2);
            }
            ctx.globalAlpha = 1;

            // Tooltip — 始终显示
            if (hovered) {
                let tipX = x + w + 8;
                let tipY = sy;
                if (tipX + 220 > canvas.width) tipX = x - 228;
                let tipW = 220, tipH = 32;
                ctx.fillStyle = "rgba(10,15,26,0.96)";
                ctx.fillRect(tipX, tipY, tipW, tipH);
                ctx.strokeStyle = b.color + "66";
                ctx.lineWidth = 1;
                ctx.strokeRect(tipX, tipY, tipW, tipH);
                ctx.fillStyle = "#e0d8c0";
                ctx.font = "10px sans-serif";
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
            let rel = G.relations[otherCo] || 0;
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
            ctx.fillStyle = hovered ? b.color + "44" : "rgba(200,180,140,0.08)";
            ctx.fillRect(x + 8, sy, w - 16, bh);
            ctx.strokeStyle = hovered ? b.color + "66" : "rgba(255,255,255,0.05)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, sy, w - 16, bh);
            ctx.fillStyle = hovered ? "#fff" : "#c8b88a";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(b.label, x + 16, sy + bh / 2);
            if (hovered) {
                let tipX = x + w + 8;
                ctx.fillStyle = "rgba(10,15,26,0.95)";
                ctx.fillRect(tipX, sy, 220, 32);
                ctx.strokeStyle = b.color + "66";
                ctx.lineWidth = 1;
                ctx.strokeRect(tipX, sy, 220, 32);
                ctx.fillStyle = "#c0b8a0";
                ctx.font = "10px sans-serif";
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
    ctx.fillStyle = "#c8b88a";
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
    ctx.fillStyle = "rgba(20,25,40,0.95)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(200,180,140,0.3)";
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
        ctx.fillStyle="rgba(200,180,140,0.15)";
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
    ctx.fillStyle = "rgba(10,15,26,0.9)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,215,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "#ffd700";
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
    ctx.fillStyle = "rgba(10,15,26,0.5)";
    ctx.fillRect(4, ly - 4, 300, Math.min(gameLogs.length * 14 + 8, 120));
    ctx.fillStyle = "rgba(255,255,255,0.3)";
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
    ctx.fillStyle="rgba(10,15,26,0.8)";
    ctx.fillRect(100,canvas.height-30-saveSlots.length*20,300,saveSlots.length*20);
    for(let i=0;i<saveSlots.length;i++){
        let sy=canvas.height-30-(saveSlots.length-i)*20;
        ctx.fillStyle="rgba(255,255,255,0.3)"; ctx.font="11px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="middle";
        ctx.fillText((i+1)+". "+saveSlots[i].name,110,sy+10);
    }
    ctx.restore();
}

// ===== 事件历史 =====
function drawEventHistory() {
    if (eventHistory.length===0) return;
    ctx.save();
    ctx.fillStyle="rgba(10,15,26,0.5)";
    let x=canvas.width-250, y=TOP_BAR_HEIGHT+200, w=240;
    ctx.fillRect(x,y,w,Math.min(eventHistory.length*14+8,100));
    ctx.fillStyle="rgba(255,255,255,0.2)";
    ctx.font="9px sans-serif";
    ctx.textAlign="left";
    for(let i=0;i<Math.min(eventHistory.length,6);i++){
        let ev=eventHistory[i];
        ctx.fillText(ev.name+": "+ev.choice,x+5,y+12+i*14);
    }
    ctx.restore();
}

// ===== 底部三标签系统（维多利亚3风格） =====
let _diploScroll = 0;
let _diploMaxScroll = 0;
const _diploScrollStep = 44;
const TAB_BTN_W = 120;
const TAB_BTN_H = 30;
const TAB_NAMES = { military: "⚔️ 军队", economy: "💰 经济", diplomacy: "🤝 外交", navy: "🚢 海军" };

function drawBottomTabs() {
    let tabBtnY = canvas.height - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT;
    let panelY = tabBtnY - TAB_PANEL_HEIGHT;
    let cx = canvas.width / 2;
    let startX = cx - (TAB_BTN_W * 4 + 30) / 2;
    ctx.save();

    // Draw tab buttons
    let tabs = ['military', 'economy', 'diplomacy', 'navy'];
    G.hoveredTabBtn = null;
    for (let i = 0; i < 4; i++) {
        let tab = tabs[i];
        let bx = startX + i * (TAB_BTN_W + 10);
        let isActive = G.activeTab === tab;
        let hovered = mouseY !== undefined && mouseY > tabBtnY && mouseY < tabBtnY + TAB_BTN_H && mouseX > bx && mouseX < bx + TAB_BTN_W;
        if (hovered) G.hoveredTabBtn = tab;

        ctx.fillStyle = isActive ? "#3a4a6a" : hovered ? "#2a3040" : "#1a2030";
        ctx.fillRect(bx, tabBtnY, TAB_BTN_W, TAB_BTN_H);
        ctx.strokeStyle = isActive ? "#8ab8d4" : "rgba(255,255,255,0.1)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(bx, tabBtnY, TAB_BTN_W, TAB_BTN_H);

        ctx.fillStyle = isActive ? "#e8d8b0" : hovered ? "#c0b090" : "rgba(255,255,255,0.4)";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(TAB_NAMES[tab], bx + TAB_BTN_W / 2, tabBtnY + TAB_BTN_H / 2);
    }

    // Draw panel content if active (extends upward from tab buttons)
    if (G.activeTab) {
        ctx.fillStyle = "rgba(10,15,26,0.88)";
        ctx.fillRect(startX - 10, panelY, TAB_BTN_W * 4 + 50, TAB_PANEL_HEIGHT);
        ctx.strokeStyle = "rgba(138,184,212,0.2)";
        ctx.lineWidth = 1;
        ctx.strokeRect(startX - 10, panelY, TAB_BTN_W * 4 + 50, TAB_PANEL_HEIGHT);
        ctx.restore();
        ctx.save();

        // Close button (X) for active panel
        let closeBtnX = startX + TAB_BTN_W * 4 + 25;
        let closeBtnY = panelY + 8;
        let closeHovered = mouseX !== undefined && mouseX > closeBtnX && mouseX < closeBtnX + 18 && mouseY !== undefined && mouseY > closeBtnY && mouseY < closeBtnY + 18;
        ctx.fillStyle = closeHovered ? "rgba(255,80,80,0.4)" : "rgba(255,80,80,0.2)";
        ctx.fillRect(closeBtnX, closeBtnY, 18, 18);
        ctx.fillStyle = closeHovered ? "#ff6666" : "#cc6666";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("✕", closeBtnX + 9, closeBtnY + 3);
        G._closeTabBtn = { x: closeBtnX, y: closeBtnY, w: 18, h: 18 };

        if (G.activeTab === 'military') drawMilitaryPanel(panelY + 5, TAB_PANEL_HEIGHT - 10, startX);
        else if (G.activeTab === 'economy') drawEconomyPanel(panelY + 5, TAB_PANEL_HEIGHT - 10, startX);
        else if (G.activeTab === 'diplomacy') drawDiplomacyPanel(panelY + 5, TAB_PANEL_HEIGHT - 10, startX);
        else if (G.activeTab === 'navy') drawNavyPanel(panelY + 5, TAB_PANEL_HEIGHT - 10, startX);
    }
    ctx.restore();
}

function drawMilitaryPanel(py, ph, startX) {
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("军队管理", startX, py);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("Ctrl+数字键 编组 · 数字键 选中编组", startX, py + 18);

    // Show army groups
    let agY = py + 40;
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#b8a880";
    ctx.fillText("编队:", startX, agY);
    for (let k = 1; k <= 9; k++) {
        let grp = G.armyGroups[k];
        let bx = startX + (k - 1) * 65;
        if (bx + 60 > startX + TAB_BTN_W * 3 + 20) break;
        let hovered = mouseY !== undefined && mouseY > agY && mouseY < agY + 22 && mouseX > bx && mouseX < bx + 58;
        ctx.fillStyle = grp ? (hovered ? "#3a4a5a" : "#2a3040") : (hovered ? "#1a2030" : "rgba(20,25,35,0.5)");
        ctx.fillRect(bx, agY, 58, 22);
        ctx.strokeStyle = grp ? "rgba(138,184,212,0.4)" : "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, agY, 58, 22);
        ctx.fillStyle = grp ? "#c8b88a" : "rgba(255,255,255,0.2)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (grp && grp.length > 0) {
            let count = grp.filter(id => G.divisions.some(d => d.id === id)).length;
            ctx.fillText("[" + k + "] " + count + "队", bx + 29, agY + 11);
        } else {
            ctx.fillText("[" + k + "] 空", bx + 29, agY + 11);
        }
    }

    // Selected units info
    let selDivs = G.selectedDivisions.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
    if (selDivs.length > 0) {
        let sy = agY + 35;
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#e8d8b0";
        ctx.fillText("已选 " + selDivs.length + " 单位:", startX, sy);
        for (let i = 0; i < Math.min(selDivs.length, 8); i++) {
            let d = selDivs[i];
            let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
            let shipInfo = (d.type === 'navy' && typeof getDivisionShipInfo === 'function') ? getDivisionShipInfo(d) : null;
            ctx.fillStyle = shipInfo ? shipInfo.color : (d.focusTarget ? "#d47a4a" : "rgba(255,255,255,0.5)");
            ctx.font = "10px sans-serif";
            let txt;
            if (shipInfo) {
                txt = ut.sym + " " + d.name + "[" + shipInfo.gradeName + "]" + (d.focusTarget ? " ⚡集火" : "");
            } else {
                txt = ut.sym + " " + d.name + " [" + Math.floor(d.strength) + "HP]" + (d.focusTarget ? " ⚡集火" : "");
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
            ctx.fillStyle = hovered ? "rgba(255,80,80,0.5)" : "rgba(255,80,80,0.25)";
            ctx.fillRect(patrolX, patrolY, btnW, 24);
            ctx.strokeStyle = "rgba(255,80,80,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(patrolX, patrolY, btnW, 24);
            ctx.fillStyle = "#d47a4a";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🗑️ 取消巡逻", patrolX + btnW/2, patrolY + 12);
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_remove", x:patrolX, y:patrolY, w:btnW, h:24, tooltip:"取消选中单位的驻守"});
        } else {
            let hovered = mouseY !== undefined && mouseY > patrolY && mouseY < patrolY + 24 && mouseX > patrolX && mouseX < patrolX + btnW;
            ctx.fillStyle = hovered ? "rgba(100,150,255,0.5)" : "rgba(60,100,200,0.35)";
            ctx.fillRect(patrolX, patrolY, btnW, 24);
            ctx.strokeStyle = "rgba(100,150,255,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(patrolX, patrolY, btnW, 24);
            ctx.fillStyle = "#8ab8d4";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🛡️ 驻守", patrolX + btnW/2, patrolY + 12);
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_add", x:patrolX, y:patrolY, w:btnW, h:24, tooltip:"选择城市驻守，遇敌出击，远敌退回"});
        }
    }

    // Keyboard hint
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("集火: 选中部队后右键点击敌方单位", startX + TAB_BTN_W * 3 + 20, py + ph - 5);
    ctx.textAlign = "left";
    ctx.fillText("巡逻: 选中部队后Ctrl+P或在面板添加巡逻点", startX + TAB_BTN_W * 3 + 20 - 200, py + ph - 5);
}

function drawEconomyPanel(py, ph, startX) {
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("经济概况", startX, py);

    let g = G.playerCountry && G.countries[G.playerCountry];
    if (!g) return;
    let gy = py + 25;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("国库: " + Math.floor(g.treasury), startX, gy); gy += 16;
    ctx.fillStyle = g.income >= g.expenses ? "#5a8a4a" : "#d47a4a";
    ctx.fillText("收入: +" + g.income + "/天", startX, gy); gy += 16;
    ctx.fillText("支出: -" + g.expenses + "/天 (师团维护)", startX, gy); gy += 20;
    ctx.fillStyle = "rgba(255,255,255,0.5)";

    // Daily net balance
    let net = g.income - g.expenses;
    ctx.fillStyle = net >= 0 ? "#5a8a4a" : "#d47a4a";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("净收支: " + (net >= 0 ? "+" : "") + net.toFixed(1) + "/天", startX, gy); gy += 18;
    ctx.font = "11px sans-serif";

    // Projected days until treasury depleted (if negative)
    if (net < 0 && g.treasury > 0) {
        let daysLeft = Math.floor(g.treasury / Math.abs(net));
        ctx.fillStyle = "#d4a84a";
        ctx.fillText("国库可维持: " + daysLeft + " 天", startX, gy); gy += 16;
    }

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("师团总数: " + G.divisions.filter(d => d.country === G.playerCountry).length, startX, gy); gy += 16;
    ctx.fillText("控制省份: " + Object.values(G.provinceData).filter(p => p.country === G.playerCountry).length, startX, gy); gy += 16;
    let totalFactories = Object.values(G.provinceData)
        .filter(p => p.country === G.playerCountry)
        .reduce((s, p) => s + (p.factories || 0), 0);
    ctx.fillText("工厂总数: " + totalFactories, startX, gy); gy += 16;

    // All countries income overview
    let cy = py + ph - 60;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
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
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("外交", startX, py);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
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

        if (fy + flagH > py + ph - 10) { ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillText("...", startX, dy); break; }
        if (fy < py) continue; // 在裁剪区域上方

        let atWar = G.playerCountry && areAtWar(G.playerCountry, co);
        let isAlly = G.playerCountry && isSameFaction(G.playerCountry, co);
        let isFocused = G.diplomacyFocus === co;
        let hovered = mouseY !== undefined && mouseY > fy && mouseY < fy + flagH && mouseX > fx && mouseX < fx + flagW;

        // 背景高亮
        if (hovered || isFocused) {
            ctx.fillStyle = isFocused ? "rgba(255,255,100,0.25)" : "rgba(255,255,255,0.15)";
            ctx.fillRect(fx - 2, fy - 2, flagW + 4, flagH + 4);
            // 边框状态色
            ctx.strokeStyle = atWar ? "rgba(200,80,80,0.7)" : isAlly ? "rgba(80,200,80,0.7)" : "rgba(138,184,212,0.5)";
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
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            let tw = ctx.measureText(name).width + 8;
            let tx = fx + flagW / 2 - tw / 2;
            let ty = fy + flagH + 2;
            ctx.fillStyle = "rgba(10,15,26,0.9)";
            ctx.fillRect(tx, ty, tw, 14);
            ctx.fillStyle = "#e8d8b0";
            ctx.fillText(name, fx + flagW / 2, ty + 2);

            // 存储悬停信息用于详情面板
            let cd = G.countries[co];
            G.hoveredDiploBtn = {
                co, name: COUNTRY_CN[co] || co,
                atWar, isAlly,
                rel: G.relations[co] || 0,
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
        ctx.fillStyle = "rgba(10,15,26,0.95)";
        ctx.fillRect(tipX, tipY, 220, 118);
        ctx.strokeStyle = "rgba(138,184,212,0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(tipX, tipY, 220, 118);
        ctx.fillStyle = "#e8d8b0";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        drawCountryFlag(h.co, tipX + 8, tipY + 4, 24, 16);
        ctx.fillText(h.name, tipX + 36, tipY + 6);
        ctx.font = "10px sans-serif";
        ctx.fillStyle = h.atWar ? "#d47a4a" : h.isAlly ? "#8aca8a" : "rgba(255,255,255,0.5)";
        ctx.fillText("状态: " + (h.atWar ? "⚔️ 交战中" : h.isAlly ? "🤝 同盟" : "☮️ 中立"), tipX + 8, tipY + 24);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText("关系值: " + h.rel, tipX + 8, tipY + 40);
        ctx.fillText("国库: " + h.treasury, tipX + 8, tipY + 54);
        ctx.fillText("师团: " + h.divs, tipX + 8, tipY + 68);
        ctx.fillText("舰船: " + (h.navy || 0), tipX + 8, tipY + 82);
        let gs = getGuarantors ? getGuarantors(h.co) : [];
        if (gs.length > 0) {
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            ctx.fillText("🛡️ 受" + gs.map(g => COUNTRY_CN[g]||g).join(",") + "保障", tipX + 8, tipY + 96);
        }
    }

    // 滚动按钮
    if (_diploMaxScroll > 0) {
        if (_diploScroll > 0) {
            let btnX = startX + panelW - 22;
            let btnY = py + 4;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 18, 18);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("▲", btnX + 9, btnY + 4);
            G._navyBtns = G._navyBtns || [];
            G._navyBtns.push({ type: 'diploScrollUp', x: btnX, y: btnY, w: 18, h: 18 });
        }
        if (_diploScroll < _diploMaxScroll) {
            let btnX = startX + panelW - 22;
            let btnY = py + ph - 22;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 18, 18);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("▼", btnX + 9, btnY + 4);
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
    ctx.fillStyle = "rgba(10,15,26,0.85)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Central Powers (同盟国)
    ctx.fillStyle = "#8ab8d4";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("⚔️ 同盟国", x + w/2, y + 5);
    let ly = y + 22;
    for (let co of germanyAllies) {
        let cd = G.countries[co];
        let atWar = isCountryAtWar(co);
        let surr = G.surrendered && G.surrendered[co];
        ctx.fillStyle = COUNTRY_COLORS[co] || "#888";
        ctx.fillRect(x + 8, ly, 3, 16);
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = surr ? "rgba(200,100,100,0.5)" : atWar ? "#d4a84a" : "rgba(255,255,255,0.6)";
        let txt = (COUNTRY_CN[co] || co).substring(0, 5);
        ctx.fillText(txt, x + 15, ly + 3);
        if (cd) {
            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.font = "9px sans-serif";
            ctx.fillText("💰" + Math.floor(cd.treasury) + " ⚔" + (cd.divCount||0), x + w - 8, ly + 3);
        }
        if (surr) {
            ctx.fillStyle = "rgba(200,50,50,0.6)";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🏳️投降", x + w/2, ly + 14);
        }
        ly += 22;
    }

    // Divider
    ly += 4;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 10, ly, w - 20, 1);
    ly += 8;

    // Entente (协约国)
    ctx.fillStyle = "#d47a4a";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🤝 协约国", x + w/2, ly);
    ly += 18;
    for (let co of ententeMembers) {
        let cd = G.countries[co];
        let atWar = isCountryAtWar(co);
        let surr = G.surrendered && G.surrendered[co];
        ctx.fillStyle = COUNTRY_COLORS[co] || "#888";
        ctx.fillRect(x + 8, ly, 3, 16);
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = surr ? "rgba(200,100,100,0.5)" : atWar ? "#d4a84a" : "rgba(255,255,255,0.6)";
        let txt = (COUNTRY_CN[co] || co).substring(0, 5);
        ctx.fillText(txt, x + 15, ly + 3);
        if (cd) {
            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.font = "9px sans-serif";
            ctx.fillText("💰" + Math.floor(cd.treasury) + " ⚔" + (cd.divCount||0), x + w - 8, ly + 3);
        }
        if (surr) {
            ctx.fillStyle = "rgba(200,50,50,0.6)";
            ctx.font = "9px sans-serif";
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

    // Count navy divisions
    let navySel = selDivs.filter(d => d.type === 'navy');
    let hasNavyFormation = navySel.length > 1;

    let x = canvas.width - 180;
    let y = TOP_BAR_HEIGHT + 10;
    let w = 170;
    let extraH = hasNavyFormation ? 90 : 0;
    let h = Math.min(selDivs.length, 10) * 24 + 60 + extraH;

    ctx.save();
    ctx.fillStyle = "rgba(10,15,26,0.95)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = COUNTRY_COLORS[G.playerCountry] || "#888";
    ctx.fillRect(x, y, 3, h);

    // 注册详情栏点击区域，防止穿透到背景
    if (!window._sidePanelRect) window._sidePanelRect = {};
    window._sidePanelRect = { x: x, y: y, w: w, h: h };

    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("已选 " + selDivs.length + " 单位", x + 12, y + 6);

    let ly = y + 26;
    for (let i = 0; i < Math.min(selDivs.length, 10); i++) {
        let d = selDivs[i];
        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        let shipInfo = (d.type === 'navy' && typeof getDivisionShipInfo === 'function') ? getDivisionShipInfo(d) : null;
        if (shipInfo) {
            ctx.fillStyle = shipInfo.color;
        } else {
            ctx.fillStyle = d.focusTarget ? "#d47a4a" : "rgba(255,255,255,0.6)";
        }
        ctx.font = "10px sans-serif";
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
        ctx.fillText(txt, x + 12, ly);
        // Invisible hit area for formation removal
        if (d.formation === 'line') {
            if (!window._sibFormBtn) window._sibFormBtn = [];
            window._sibFormBtn.push({divId:d.id, x:x+8, y:ly-4, w:w-16, h:18});
        }
        ly += 22;
    }

    // Formation buttons (when multiple navy selected)
    if (hasNavyFormation) {
        ly += 4;
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 10, ly, w - 20, 1);
        ly += 10;

        ctx.fillStyle = "#8ab8d4";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚓ 海军阵型", x + w/2, ly);
        ly += 20;

        // Check if all selected navy have 'line' formation already
        let allLine = navySel.every(d => d.formation === 'line');

        if (allLine) {
            // Cancel formation button
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            ctx.fillStyle = hovered ? "rgba(255,80,80,0.5)" : "rgba(255,80,80,0.25)";
            ctx.fillRect(x + 8, ly, w - 16, 22);
            ctx.strokeStyle = "rgba(255,80,80,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 22);
            ctx.fillStyle = "#d47a4a";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("✖ 解除阵型", x + w/2, ly + 11);
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"formation_remove", x:x+8, y:ly, w:w-16, h:22, tooltip:"解除所有选中海军的一字阵"});
        } else {
            // Line formation button
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 22 && mouseX > x + 8 && mouseX < x + w - 8;
            ctx.fillStyle = hovered ? "rgba(60,200,255,0.5)" : "rgba(60,200,255,0.25)";
            ctx.fillRect(x + 8, ly, w - 16, 22);
            ctx.strokeStyle = "rgba(60,200,255,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, ly, w - 16, 22);
            ctx.fillStyle = "#8ab8d4";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("— 一字阵", x + w/2, ly + 11);
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"formation_apply", x:x+8, y:ly, w:w-16, h:22, tooltip:"将选中海军排列成一字阵（垂直于前进方向）"});
        }
        ly += 26;

        // Formation status info
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("点击单位后可移除阵型", x + w/2, ly);
    }

    // Patrol + Frontline buttons (always visible when units are selected)
    let btnY = y + h - 28;
    // Check if any selected unit is on patrol
    let anyPatrol = selDivs.some(d => G.patrolTargets[d.id] && G.patrolTargets[d.id].length > 0);

    if (anyPatrol) {
        // Cancel patrol button (red) — full width
        let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > x + 8 && mouseX < x + w - 8;
        ctx.fillStyle = hovered ? "rgba(255,80,80,0.5)" : "rgba(255,80,80,0.25)";
        ctx.fillRect(x + 8, btnY, w - 16, 22);
        ctx.strokeStyle = "rgba(255,80,80,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 8, btnY, w - 16, 22);
        ctx.fillStyle = "#d47a4a";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🗑️ 取消巡逻", x + w/2, btnY + 11);
        if (!window._sibBtns) window._sibBtns = [];
        window._sibBtns.push({id:"patrol_remove", x:x+8, y:btnY, w:w-16, h:22, tooltip:"取消选中单位的驻守"});
    } else {
        // Two buttons: Patrol (left) + Frontline (right)
        let btnW2 = (w - 20) / 2;
        { // Patrol
            let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > x + 8 && mouseX < x + 8 + btnW2;
            ctx.fillStyle = hovered ? "rgba(60,200,255,0.5)" : "rgba(60,200,255,0.25)";
            ctx.fillRect(x + 8, btnY, btnW2, 22);
            ctx.strokeStyle = "rgba(60,200,255,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 8, btnY, btnW2, 22);
            ctx.fillStyle = "#8ab8d4";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🛡️ 驻守", x + 8 + btnW2/2, btnY + 11);
            if (!window._sibBtns) window._sibBtns = [];
            window._sibBtns.push({id:"patrol_add", x:x+8, y:btnY, w:btnW2, h:22, tooltip:"在选中单位的当前省份驻守"});
        }
        { // Frontline
            let flBtnX = x + 12 + btnW2;
            let hovered = mouseY !== undefined && mouseY > btnY && mouseY < btnY + 22 && mouseX > flBtnX && mouseX < flBtnX + btnW2;
            ctx.fillStyle = hovered ? "rgba(255,200,50,0.5)" : "rgba(255,200,50,0.25)";
            ctx.fillRect(flBtnX, btnY, btnW2, 22);
            ctx.strokeStyle = "rgba(255,200,50,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(flBtnX, btnY, btnW2, 22);
            ctx.fillStyle = "#d4c84a";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            let hasActiveFrontlines = G.frontlineGroups && G.frontlineGroups.length > 0;
            let flBtnText = G.frontlineDrawing ? "✅ 绘制中" : (hasActiveFrontlines ? "⏏️ 取消" : "⚔️ 前线");
            ctx.fillText(flBtnText, flBtnX + btnW2/2, btnY + 11);
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
    ctx.fillStyle = "rgba(10,15,26,0.92)";
    ctx.fillRect(x, y - 30, 180, 28);
    ctx.strokeStyle = "rgba(138,184,212,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 30, 180, 28);
    ctx.fillStyle = "#c0b8a0";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 8, y - 16);
    ctx.restore();
}

// ===== 处理底部标签点击 =====
function handleTabClick(mx, my) {
    let tabBtnY = canvas.height - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT;
    let cx = canvas.width / 2;
    let startX = cx - (TAB_BTN_W * 4 + 30) / 2;
    let tabs = ['military', 'economy', 'diplomacy', 'navy'];

    // Check tab buttons
    for (let i = 0; i < 4; i++) {
        let bx = startX + i * (TAB_BTN_W + 10);
        if (my > tabBtnY && my < tabBtnY + TAB_BTN_H && mx > bx && mx < bx + TAB_BTN_W) {
            G.activeTab = (G.activeTab === tabs[i]) ? null : tabs[i];
            if (G.activeTab === null) G.selectedNavyNode = null;
            return true;
        }
    }

    // Close button (X) for active panel
    if (G.activeTab && G._closeTabBtn) {
        let cb = G._closeTabBtn;
        if (mx > cb.x && mx < cb.x + cb.w && my > cb.y && my < cb.y + cb.h) {
            G.activeTab = null;
            _showNavyGuide = false;
            G.selectedNavyNode = null;
            return true;
        }
    }

    // Check navy panel build/upgrade buttons
    if (G.activeTab === 'navy') {
        // Click outside guide modal closes it
        if (_showNavyGuide) {
            let cw = canvas.width, ch = canvas.height;
            let mw = Math.min(650, cw - 40), mh = Math.min(550, ch - 60);
            let mgx = (cw - mw) / 2, mgy = (ch - mh) / 2;
            if (mx < mgx || mx > mgx + mw || my < mgy || my > mgy + mh) {
                _showNavyGuide = false;
                _navyGuideScroll = 0;
                return true;
            }
        }
        if (G._navyBtns) {
        for (let btn of G._navyBtns) {
            if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h) {
                if (btn.type === 'build') {
                    let node = G.navyNodes[btn.nodeId];
                    if (!node) return true;
                    let cData = G.countries[G.playerCountry];
                    if (!cData || cData.treasury < 500 || cData.manpower < 5) return true;
                    cData.treasury -= 500;
                    cData.manpower -= 5;
                    // 加入海军建造队列（30天）
                    if (!G.navyBuildQueue) G.navyBuildQueue = [];
                    G.navyBuildQueue.push({ type: 'navy', nodeId: btn.nodeId, days: 30, totalDays: 30 });
                    addGameLog("在" + (node.name || "海军节点") + "开始建造舰船 (30天)");
                    return true;
                }
                if (btn.type === 'upgrade') {
                    let node = G.navyNodes[btn.nodeId];
                    if (!node || node.upgradeTimer > 0) return true;
                    let nextLv = null;
                    for (let nl of NODE_LEVELS) {
                        if (nl.level === node.level + 1) { nextLv = nl; break; }
                    }
                    if (!nextLv) return true;
                    let cData = G.countries[G.playerCountry];
                    if (!cData || cData.treasury < nextLv.upgradeCost) return true;
                    cData.treasury -= nextLv.upgradeCost;
                    node.upgradeTimer = nextLv.upgradeTime;
                    node.upgradeProgress = 0;
                    addGameLog("开始升级" + (node.name || "海军节点") + " (Lv." + node.level + "→" + nextLv.level + ")");
                    return true;
                }
                if (btn.type === 'selectNode') {
                    G.selectedNavyNode = btn.nodeId;
                    return true;
                }
                if (btn.type === 'selectAllShips') {
                    let nodeShips = G.ships.filter(s => s.nodeId === btn.nodeId && s.country === G.playerCountry);
                    let divIds = [];
                    for (let ship of nodeShips) {
                        let div = G.divisions.find(d => d.shipId === ship.id);
                        if (div) divIds.push(div.id);
                    }
                    if (divIds.length > 0) {
                        G.selectedDivisions = divIds;
                        addGameLog("已选中 " + divIds.length + " 艘舰船");
                    }
                    return true;
                }
                if (btn.type === 'scrollUp') {
                    _navyPanelScroll = Math.max(0, _navyPanelScroll - _navyScrollStep);
                    return true;
                }
                if (btn.type === 'scrollDown') {
                    _navyPanelScroll = Math.min(_navyMaxScroll, _navyPanelScroll + _navyScrollStep);
                    return true;
                }
                if (btn.type === 'toggleGuide') {
                    _showNavyGuide = !_showNavyGuide;
                    _navyGuideScroll = 0;
                    return true;
                }
                if (btn.type === 'guideScrollUp') {
                    _navyGuideScroll = Math.max(0, _navyGuideScroll - 80);
                    return true;
                }
                if (btn.type === 'guideScrollDown') {
                    _navyGuideScroll = Math.min(_navyGuideMaxScroll || 0, _navyGuideScroll + 80);
                    return true;
                }
                if (btn.type === 'diploScrollUp') {
                    _diploScroll = Math.max(0, _diploScroll - _diploScrollStep);
                    return true;
                }
                if (btn.type === 'diploScrollDown') {
                    _diploScroll = Math.min(_diploMaxScroll, _diploScroll + _diploScrollStep);
                    return true;
                }
            }
        }
    }
    if (G.activeTab === 'diplomacy' && G._diploSwitchRows) {
        for (let row of G._diploSwitchRows) {
            if (mx > row.x && mx < row.x + row.w && my > row.y && my < row.y + row.h) {
                G.diplomacyFocus = row.co;
                G.selectedProvince = null;
                return true;
            }
        }
    }

    // Block clicks within diplomacy panel that didn't hit any row/button
    if (G.activeTab === 'diplomacy' && G._diploPanelBounds) {
        let b = G._diploPanelBounds;
        if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
            return true;
        }
    }

    // Check diplomacy action buttons inside panel
    if (G.activeTab === 'diplomacy' && G._diploBtns) {
        for (let btn of G._diploBtns) {
            if (mx > btn.x && mx < btn.x + btn.w && my > btn.y && my < btn.y + btn.h) {
                if (btn.atWar) {
                    if (G.playerCountry) {
                        let wsDiff = getWarScoreDiff(G.playerCountry, btn.co);
                        let reparations = 0;
                        if (wsDiff > 20) {
                            let maxRep = Math.floor(G.countries[btn.co].treasury * 0.6);
                            reparations = Math.min(maxRep, Math.floor(Math.abs(wsDiff) * 2));
                        } else if (wsDiff < -20) {
                            let maxRep = Math.floor(G.countries[G.playerCountry].treasury * 0.4);
                            reparations = Math.min(maxRep, Math.floor(Math.abs(wsDiff) * 2));
                        }
                        makePeace(G.playerCountry, btn.co, reparations);
                    }
                    if (G.countries[G.playerCountry]) G.countries[G.playerCountry].stability = Math.min(100, (G.countries[G.playerCountry].stability || 85) + 5);
                    addGameLog("与" + (COUNTRY_CN[btn.co]||btn.co) + "议和");
                    G.activeTab = null;
                    return true;
                } else if (mx < btn.x + 44) {
                    // 宣战
                    if (G.playerCountry) {
                        let result = declareWar(G.playerCountry, btn.co);
                        if (result !== false) {
                            if (G.countries[G.playerCountry]) G.countries[G.playerCountry].stability -= 5;
                        }
                    }
                    addGameLog("向" + (COUNTRY_CN[btn.co]||btn.co) + "宣战");
                    G.activeTab = null;
                    return true;
                } else {
                    // 改善关系
                    if (G.countries[G.playerCountry] && G.countries[G.playerCountry].treasury >= 50) {
                        G.countries[G.playerCountry].treasury -= 50;
                        if (!G.relations) G.relations = {};
                        G.relations[btn.co] = (G.relations[btn.co] || 0) + 10;
                        addGameLog("改善与" + (COUNTRY_CN[btn.co]||btn.co) + "的关系");
                    }
                    G.activeTab = null;
                    return true;
                }
            }
        }
    }

    // Check military panel - army group clicks
    if (G.activeTab === 'military') {
        let _panelY = tabBtnY - TAB_PANEL_HEIGHT;
        let _agY = _panelY + 40;
        for (let k = 1; k <= 9; k++) {
            let bx = startX + (k - 1) * 65;
            if (bx + 60 > startX + TAB_BTN_W * 3 + 20) break;
            if (my > _agY && my < _agY + 22 && mx > bx && mx < bx + 58) {
                let grp = G.armyGroups[k];
                if (grp && grp.length > 0) {
                    G.armyGroups[k] = grp.filter(id => G.divisions.some(d => d.id === id));
                    if (G.armyGroups[k].length > 0) {
                        G.selectedDivisions = [...G.armyGroups[k]];
                        selectedProvince = null;
                        G.selectedProvince = null;
                        addGameLog("选中编队 ["+k+"] ("+G.armyGroups[k].length+" 单位)");
                    }
                }
                return true;
            }
        }
    }

    return false;
}
}
