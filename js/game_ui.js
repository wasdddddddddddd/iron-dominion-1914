// Iron & Dominion 1914 — 渲染引擎（省份版）

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let camX = 10, camY = 51, zoom = 0.5;
let isDragging = false, dragStartX, dragStartY, dragCamStartX, dragCamStartY;
let selectedProvince = null, hoveredProvince = null, hoveredCity = null;
let mouseX = 0, mouseY = 0;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---- 坐标变换 ----
function worldToScreen(wx, wy) {
    const s = zoom * PIXELS_PER_DEGREE;
    return [(wx - camX) * s + canvas.width / 2, -(wy - camY) * s + canvas.height / 2];
}


function clampCamera() {
    const s = zoom * PIXELS_PER_DEGREE;
    const w = canvas.width / 2 / s;
    const h = canvas.height / 2 / s;
    camX = Math.max(-20, Math.min(40, camX));
    camY = Math.max(40, Math.min(62, camY));
}
function screenToWorld(sx, sy) {
    const s = zoom * PIXELS_PER_DEGREE;
    return [(sx - canvas.width / 2) / s + camX, -(sy - canvas.height / 2) / s + camY];
}

// ---- 点在多边形内检测（射线法） ----
function isPointInPolygon(px, py, polygon) {
    if (polygon.length < 3) return false;
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        if (yi === yj) continue;
        const ymin = Math.min(yi, yj);
        const ymax = Math.max(yi, yj);
        if (py < ymin - 1e-10 || py >= ymax - 1e-10) continue;
        const xIntersect = (py - yi) / (yj - yi) * (xj - xi) + xi;
        if (px < xIntersect + 1e-10) inside = !inside;
    }
    return inside;
}

// ---- 点到多边形距离（后备用） ----
function pointToPolygonDist(px, py, polygon) {
    let minDist = Infinity;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const x1 = polygon[i][0], y1 = polygon[i][1];
        const x2 = polygon[j][0], y2 = polygon[j][1];
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + t * dx, cy = y1 + t * dy;
        const d = Math.hypot(px - cx, py - cy);
        if (d < minDist) minDist = d;
    }
    return minDist;
}

// ---- 省份中文名辅助 ----
function getProvinceName(p) {
    if (typeof PROVINCE_CN !== 'undefined' && p && p.id && PROVINCE_CN[p.id]) return PROVINCE_CN[p.id];
    if (p && p.n && p.n !== "NA") return p.n;
    return p ? p.n || "未知" : "未知";
}

// ---- 查找点击的省份 ----
function findProvinceAt(wx, wy) {
    let best = null, bestDist = Infinity;
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            if (isPointInPolygon(wx, wy, ring)) return p;
            const d = pointToPolygonDist(wx, wy, ring);
            if (d < bestDist) { bestDist = d; best = p; }
        }
    }
    if (best && bestDist < 0.3) return best;
    return null;
}

// ---- 渲染 ----
function drawOcean() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, OCEAN_COLOR_TOP);
    g.addColorStop(1, OCEAN_COLOR_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRivers() {
    if (typeof RIVERS === "undefined") return;
    ctx.save();
    for (let r of RIVERS) {
        if (!r.pts || r.pts.length < 2) continue;
        const pts = r.pts.map(p2 => worldToScreen(p2[0], p2[1]));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = "rgba(60,130,180,0.5)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (pts.length > 2) {
            const mi = Math.floor(pts.length/2);
            ctx.font = "11px Georgia,serif";
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3;
            ctx.fillStyle = "rgba(60,130,180,0.7)";
            ctx.fillText(r.name, pts[mi][0], pts[mi][1]-4);
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

function drawProvinces() {
    let now = Date.now() / 1000;
    for (let p of PROVINCES) {
        let color = COUNTRY_COLORS[p.c] || "#888";
        let pd = G.provinceData[p.id];

        // Contested: both friendly and enemy inside — blend
        if (pd && pd.contested) {
            let origColor = COUNTRY_COLORS[pd.originalCountry] || "#888";
            let enemyColor = COUNTRY_COLORS[p.c] || "#888";
            let blend = 0.5 + 0.5 * Math.sin(now * 2 + p.id.length);
            for (let ring of p.r) {
                if (ring.length < 3) continue;
                ctx.beginPath();
                const first = ring[0];
                ctx.moveTo(...worldToScreen(first[0], first[1]));
                for (let i = 1; i < ring.length; i++) {
                    const pt = ring[i];
                    ctx.lineTo(...worldToScreen(pt[0], pt[1]));
                }
                ctx.closePath();
                // Layer original, then overlay enemy with varying alpha
                ctx.fillStyle = origColor;
                ctx.fill();
                ctx.fillStyle = enemyColor;
                ctx.globalAlpha = blend * 0.4;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
        // Occupied: enemy owns, no friendly
        else if (pd && pd.originalCountry && pd.country !== pd.originalCountry) {
            for (let ring of p.r) {
                if (ring.length < 3) continue;
                ctx.beginPath();
                const first = ring[0];
                ctx.moveTo(...worldToScreen(first[0], first[1]));
                for (let i = 1; i < ring.length; i++) {
                    const pt = ring[i];
                    ctx.lineTo(...worldToScreen(pt[0], pt[1]));
                }
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                // Subtle diagonal hatch
                ctx.save();
                ctx.clip();
                ctx.strokeStyle = `rgba(255,255,255,0.08)`;
                ctx.lineWidth = 1;
                let pts = ring.map(pt => worldToScreen(pt[0], pt[1]));
                let minX = Math.min(...pts.map(pt => pt[0]));
                let maxX = Math.max(...pts.map(pt => pt[0]));
                let minY = Math.min(...pts.map(pt => pt[1]));
                let maxY = Math.max(...pts.map(pt => pt[1]));
                let spacing = 8;
                for (let y = minY - 20; y < maxY + 20; y += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(minX - 20, y + (maxX - minX + 40));
                    ctx.lineTo(minX - 20 + (maxX - minX + 40), y);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
        // Normal: own original territory
        else {
            for (let ring of p.r) {
                if (ring.length < 3) continue;
                ctx.beginPath();
                const first = ring[0];
                ctx.moveTo(...worldToScreen(first[0], first[1]));
                for (let i = 1; i < ring.length; i++) {
                    const pt = ring[i];
                    ctx.lineTo(...worldToScreen(pt[0], pt[1]));
                }
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
    }
}

function drawBorders() {
    for (let p of PROVINCES) {
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            ctx.beginPath();
            const first = ring[0];
            ctx.moveTo(...worldToScreen(first[0], first[1]));
            for (let i = 1; i < ring.length; i++) {
                ctx.lineTo(...worldToScreen(ring[i][0], ring[i][1]));
            }
            ctx.closePath();
            ctx.strokeStyle = BORDER_COLOR;
            ctx.lineWidth = BORDER_WIDTH;
            ctx.stroke();
        }
    }
}

function drawSelection() {
    ctx.save();
    if (selectedProvince) {
        const p = selectedProvince;
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            const pts = ring.map(pt => worldToScreen(pt[0], pt[1]));
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 12;
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    // Navy node highlight on map
    if (G.selectedNavyNode && G.navyNodes && G.navyNodes[G.selectedNavyNode]) {
        let node = G.navyNodes[G.selectedNavyNode];
        let [sx, sy] = worldToScreen(node.lon, node.lat);
        ctx.fillStyle = "rgba(255,215,0,0.2)";
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("⚓", sx, sy);
    }

    // City/building highlight
    if (G.selectedCity) {
        let city = G.selectedCity;
        let [sx, sy] = worldToScreen(city.lon, city.lat);
        if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50) {
            ctx.shadowColor = "#4A90D9";
            ctx.shadowBlur = 16;
            ctx.strokeStyle = "#4A90D9";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(sx, sy, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(74,144,217,0.15)";
            ctx.beginPath();
            ctx.arc(sx, sy, 20, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawCountryNames() {
    if (zoom > 1.0) {
        // 战役/战术层只显示选中国家
        if (!selectedProvince) return;
        const cid = selectedProvince.c;
        const name = COUNTRY_CN[cid];
        if (!name) return;
        const provs = PROVINCES.filter(pp => pp.c === cid && pp.x < 900);
        if (!provs.length) return;
        let lon = 0, lat = 0, n = 0;
        for (let pp of provs) { lon += pp.x; lat += pp.y; n++; }
        const [sx, sy] = worldToScreen(lon/n, lat/n);
        ctx.save();
        ctx.font = "bold 22px Georgia,serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = COUNTRY_COLORS[cid] || "#fff";
        ctx.globalAlpha = 0.7;
        ctx.fillText(name, sx, sy);
        ctx.restore();
        return;
    }
    // 战略层显示所有国家名
    const seen = new Set();
    for (let p of PROVINCES) {
        if (seen.has(p.c)) continue;
        seen.add(p.c);
        const name = COUNTRY_CN[p.c];
        if (!name) continue;
        const provs = PROVINCES.filter(pp => pp.c === p.c && pp.x < 900);
        if (!provs.length) continue;
        let lon = 0, lat = 0, n = 0;
        for (let pp of provs) { lon += pp.x; lat += pp.y; n++; }
        const [sx, sy] = worldToScreen(lon/n, lat/n);
        ctx.save();
        ctx.font = "bold 16px Georgia,serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(name, sx, sy);
        ctx.restore();
    }
}

function drawCities() {
    // 缩放层级：首都最早显示，较大城市次之，小城市最晚
    const capitalZoom = 0.15;   // 首都在zoom>0.15时显示
    const majorZoom = 0.35;    // 较大城市在zoom>0.35时显示
    const minorZoom = 0.7;     // 小城市在zoom>0.7时显示

    // 较大城市列表（非首都的历史重要城市用🏰）
    const majorCities = new Set([
        // 德国
        'hamburg','munich','cologne','frankfurt','leipzig','dresden','nuremberg','breslau',
        // 法国
        'lyon','marseille','bordeaux','lille','toulouse','nice','nantes','strasbourg','nancy',
        // 英国
        'manchester','birmingham','glasgow','liverpool','bristol','edinburgh','dublin','leeds',
        // 意大利
        'naples','turin','milan','genoa','venice','florence','palermo','trieste',
        // 俄国
        'saint_petersburg','moscow','kiev','odessa','warsaw','minsk','riga','samara',
        'kharkov','ekaterinburg','rostov','nizhny','kazan','sevastopol','smolensk',
        // 奥匈
        'budapest','prague','krakow','zagreb','bratislava','lemberg','kassa','brasso',
        // 西班牙
        'barcelona','seville','bilbao','valencia_sp','zaragoza',
        // 土耳其
        'izmir','ankara','trabzon',
        // 荷兰
        'rotterdam','thehague',
        // 比利时
        'antwerp','liege','charleroi',
        // 瑞典
        'gothenburg','malmo',
        // 挪威
        'bergen',
        // 罗马尼亚
        'brasov','cluj','iasi','constanta',
        // 保加利亚
        'plovdiv','varna',
        // 希腊
        'thessaloniki',
        // 葡萄牙
        'porto',
        // 芬兰
        'turku',
        // 丹麦
        'aarhus',
        // 瑞士
        'zurich','basel',
        // 塞尔维亚
        'nis',
        // 黑山
        'cetinje',
        // 阿尔巴尼亚
        'durres',
        // 卢森堡
        'luxembourg',
    ]);
    for (let city of CITIES) {
        const [sx, sy] = worldToScreen(city.lon, city.lat);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        // 根据城市等级和缩放决定是否显示
        if (city.isCapital && zoom <= capitalZoom) continue;
        if (!city.isCapital && majorCities.has(city.id) && zoom <= majorZoom) continue;
        if (!city.isCapital && !majorCities.has(city.id) && zoom <= minorZoom) continue;

        let cityData = G.cities[city.id];
        let hp = cityData ? cityData.hp : 50;
        let maxHp = cityData ? cityData.maxHp : 50;
        let owner = cityData ? cityData.owner : city.country;

        // 三层图标：🏛️首都 🏰较大城市 🏠小城市
        let emoji, fontSize, nameColor;
        if (city.isCapital) {
            emoji = "🏛️"; fontSize = 22; nameColor = "#ffd700";
        } else if (majorCities.has(city.id)) {
            emoji = "🏰"; fontSize = 18; nameColor = "#e8d0a0";
        } else {
            emoji = "🏠"; fontSize = 14; nameColor = "#e8e0d0";
        }

        ctx.save();
        ctx.font = fontSize + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
        ctx.fillText(emoji, sx, sy - 10);
        ctx.shadowBlur = 0;

        // City name below
        ctx.font = city.isCapital ? "bold 11px sans-serif" : "10px sans-serif";
        ctx.fillStyle = nameColor;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
        ctx.fillText(city.name, sx, sy + 6);
        ctx.shadowBlur = 0;

        // HP bar — only show if damaged
        if (hp < maxHp) {
            let barW = 30, barH = 4;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(sx - barW/2 - 1, sy + 19, barW + 2, barH + 2);
            ctx.fillStyle = hp > maxHp * 0.6 ? "#4a8a2a" : hp > maxHp * 0.3 ? "#c89820" : "#b83020";
            ctx.fillRect(sx - barW/2, sy + 20, barW * Math.max(0, hp / maxHp), barH);
        }

        // Owner indicator (colored ring)
        if (owner) {
            ctx.beginPath(); ctx.arc(sx, sy - 10, fontSize/2 + 2, 0, Math.PI*2);
            ctx.strokeStyle = COUNTRY_COLORS[owner] || "#888";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }
}

function drawFactories() {
    if (!G.factories) return;
    for (let fact of G.factories) {
        if (!fact || fact.hp <= 0) continue;
        let [sx, sy] = worldToScreen(fact.rx, fact.ry);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;
        ctx.save();
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3;
        ctx.fillText("🏭", sx, sy);
        ctx.shadowBlur = 0;
        // HP bar — only show if damaged
        if (fact.hp < fact.maxHp) {
            let barW = 26, barH = 4;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(sx - barW/2 - 1, sy + 9, barW + 2, barH + 2);
            ctx.fillStyle = fact.hp > fact.maxHp * 0.6 ? "#4a8a2a" : fact.hp > fact.maxHp * 0.3 ? "#c89820" : "#b83020";
            ctx.fillRect(sx - barW/2, sy + 10, barW * Math.max(0, fact.hp / fact.maxHp), barH);
        }
        ctx.restore();
    }
}

function drawNavalBases() {
    if (typeof NAVAL_BASES === 'undefined') return;
    for (let nb of NAVAL_BASES) {
        const [sx, sy] = worldToScreen(nb.lon, nb.lat);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        const owner = nb.country;
        const color = COUNTRY_COLORS[owner] || '#888';

        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        // Anchor emoji
        ctx.font = '18px sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
        ctx.fillText('⚓', sx, sy);
        ctx.shadowBlur = 0;

        // Anchor ring
        ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Name label
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
        ctx.fillText(nb.name, sx, sy + 14);
        ctx.shadowBlur = 0;

        // Region label
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(180,210,255,0.7)';
        ctx.fillText(nb.region.replace(/_/g, ' '), sx, sy + 25);

        ctx.restore();
    }
}

// ---- 信息面板 ----
function drawInfoPanel() {
    if (!selectedProvince) {
        // 显示操作提示
        ctx.save();
        ctx.font = "13px Georgia,serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillText("点击省份查看详情 · 滚轮缩放 · 拖拽平移", canvas.width/2, canvas.height - BOTTOM_BAR_HEIGHT - 12);
        ctx.restore();
        return;
    }
    const p = selectedProvince;
    const countryName = COUNTRY_CN[p.c] || p.c;
    const terrainName = TERRAIN_CN[p.t] || p.t;

    const panelX = canvas.width - 260;
    const panelY = TOP_BAR_HEIGHT + 10;
    const panelW = 240, panelH = 150;

    ctx.save();
    // 背景
    ctx.fillStyle = "rgba(10,15,26,0.8)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // 国家色条
    ctx.fillStyle = COUNTRY_COLORS[p.c] || "#888";
    ctx.fillRect(panelX, panelY, 4, panelH);

    // 标题：省份名
    ctx.fillStyle = "#f0e6d0";
    ctx.font = "bold 15px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(getProvinceName(p) || "Unknown", panelX + 16, panelY + 10);

    // 国家
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "12px sans-serif";
    ctx.fillText("所属: " + countryName, panelX + 16, panelY + 32);

    // 地形
    const terrainColors = {flat:"#6a9a5a",hills:"#9a8a5a",mountains:"#8a7a7a",urban:"#7a7a8a"};
    const tc = terrainColors[p.t] || "#888";
    ctx.fillStyle = tc;
    ctx.fillRect(panelX + 16, panelY + 54, 10, 10);
    ctx.fillStyle = "#e8e0d0";
    ctx.font = "12px sans-serif";
    ctx.fillText("地形: " + terrainName, panelX + 32, panelY + 54);

    // Info
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px sans-serif";
    ctx.fillText("坐标: " + p.x.toFixed(2) + "°, " + p.y.toFixed(2) + "°", panelX + 16, panelY + 74);
    ctx.fillText("ID: " + p.id, panelX + 16, panelY + 90);

    // 省份编号/总数
    const sameCountry = PROVINCES.filter(pp => pp.c === p.c).length;
    ctx.fillText("该国省份数: " + sameCountry, panelX + 16, panelY + 106);
    ctx.restore();
}

// ---- 底部层级栏 ----

function drawBorder() {
    ctx.save();
    ctx.strokeStyle = "rgba(180,160,120,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.restore();
}
function drawBottomBar() {
    const barY = canvas.height - BOTTOM_BAR_HEIGHT;
    ctx.fillStyle = "rgba(10,15,26,0.7)";
    ctx.fillRect(0, barY, canvas.width, BOTTOM_BAR_HEIGHT);

    let layerName = "战略层";
    let layerColor = "#7ab8d4";
    if (zoom >= STRATEGIC_ZOOM && zoom < TACTICAL_ZOOM) { layerName = "战役层"; layerColor = "#c4a86a"; }
    else if (zoom >= TACTICAL_ZOOM) { layerName = "战术层"; layerColor = "#d47a7a"; }

    ctx.save();
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = layerColor;
    ctx.fillText(layerName + " · 省份视图", canvas.width / 2, barY + BOTTOM_BAR_HEIGHT / 2);
    ctx.restore();

    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("x" + zoom.toFixed(2), canvas.width - 16, barY + 24);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "10px sans-serif";
    ctx.fillText("滚轮缩放 · 拖拽平移 · 点击省份查看信息", 16, barY + 24);
}

// ---- 顶层状态栏 ----
function drawTopBar() {
    ctx.fillStyle = "rgba(10,15,26,0.6)";
    ctx.fillRect(0, 0, canvas.width, TOP_BAR_HEIGHT);
    ctx.save();
    ctx.font = "bold 16px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#c8b88a";
    ctx.fillText("铁与权柄：1914  ", 16, TOP_BAR_HEIGHT / 2);
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("— GADM 省份地图 —", 170, TOP_BAR_HEIGHT / 2);
    ctx.restore();
}

// ---- 鼠标坐标 ----
function drawMouseCoords() {
    const [wx, wy] = screenToWorld(mouseX, mouseY);
    ctx.save();
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(wx.toFixed(2) + "°, " + wy.toFixed(2) + "°", 12, canvas.height - BOTTOM_BAR_HEIGHT - 8);
    ctx.restore();
}

// ---- 缩放指示器 ----
function drawZoomIndicator() {
    const barX = 16, barY = canvas.height - BOTTOM_BAR_HEIGHT - 70;
    const barW = 4, barH = 60;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(barX - 6, barY - 6, barW + 12, barH + 12);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(barX, barY, barW, barH);
    const t = 1 - (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(barX - 1, barY + t * barH - 2, barW + 2, 4);
    ctx.save();
    ctx.font = "8px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "left";
    ctx.fillText("战", barX + barW + 4, barY + 8);
    ctx.fillText("战", barX + barW + 4, barY + barH/2 + 3);
    ctx.fillText("战", barX + barW + 4, barY + barH - 2);
    ctx.restore();
}

// ===== 墓碑绘制 =====
function drawGravestones() {
    if (!G.gravestones || G.gravestones.length === 0) return;
    let now = G.date.getTime();
    let threeYearsMs = 3 * 365 * 24 * 3600 * 1000;
    for (let i = G.gravestones.length - 1; i >= 0; i--) {
        let g = G.gravestones[i];
        let age = now - g.deathTime;
        if (age > threeYearsMs) {
            G.gravestones.splice(i, 1);
            continue;
        }
        let [sx, sy] = worldToScreen(g.x, g.y);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;
        let alpha = 1 - (age / threeYearsMs);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#888";
        ctx.fillText("🪦", sx, sy);
        ctx.restore();
    }
}

// ---- 主渲染 ----
function render() { window._sibBtns = [];
    try {
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw ocean (gradient background)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, OCEAN_COLOR_TOP);
    grad.addColorStop(1, OCEAN_COLOR_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw provinces directly (no cache — native canvas handles ~200 polygons at 60fps)
    drawProvinces();
    drawRivers();
    drawBorders();
    drawGravestones();

    // UI on top (screen coordinates)
    drawSelection();
    drawCountryNames();
    drawCities();
    drawNavalBases();
    drawFactories();
    drawDivisions();
    drawCountrySidebar();
    drawSelBox();
    drawGameInfo();
    drawMouseCoords();
    drawGameTopBar();
    drawBorder();
    drawGameBottomBar();
    drawActionBar();
    drawSelectedUnitSidebar();
    drawGameLog();
    drawEventPopup();
    drawSavePanel();
    drawEventHistory();
    drawNewsBanner();
    drawBottomTabs();
    drawFrontlineOverlay();
    drawCoastalWaters();
    drawGameOverPanel();
} catch(e) { console.error(e); }
}

function drawGameOverPanel() {
    if (!G.gameOver) return;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 36px sans-serif";
    ctx.fillText(G.gameOverMessage, cx, cy - 60);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "16px sans-serif";
    ctx.fillText("按 R 键重新开始", cx, cy + 20);
    ctx.fillText("按 Esc 关闭", cx, cy + 50);
}