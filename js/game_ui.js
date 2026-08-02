// Iron & Dominion 1914 — 渲染引擎（省份版）

const canvas = document.getElementById("gameCanvas");
let ctx = canvas.getContext("2d", { willReadFrequently: false });

let camX = 10, camY = 51, zoom = 0.5;
let isDragging = false, dragStartX, dragStartY, dragCamStartX, dragCamStartY;
let selectedProvince = null, hoveredProvince = null, hoveredCity = null;
let mouseX = 0, mouseY = 0;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (typeof GLU !== 'undefined' && GLU.isEnabled()) GLU.resize();
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

function drawCoastGrid() {
    ctx.beginPath();
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            const first = ring[0];
            ctx.moveTo(...worldToScreen(first[0], first[1]));
            for (let i = 1; i < ring.length; i++) {
                ctx.lineTo(...worldToScreen(ring[i][0], ring[i][1]));
            }
            ctx.closePath();
        }
    }
    ctx.strokeStyle = "rgba(60,140,170,0.25)";
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.strokeStyle = "rgba(60,140,170,0.5)";
    ctx.lineWidth = 6;
    ctx.stroke();
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
        ctx.strokeStyle = "rgba(50,100,140,0.45)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (pts.length > 2) {
            const mi = Math.floor(pts.length/2);
            ctx.font = "11px Georgia,serif";
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3;
            ctx.fillStyle = "rgba(50,100,140,0.55)";
            ctx.fillText(r.name, pts[mi][0], pts[mi][1]-4);
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

function drawProvinces() {
    let terAlpha = terrainReady() ? (typeof TERRAIN_FILL_ALPHA !== 'undefined' ? TERRAIN_FILL_ALPHA : 0.8) : 1;
    if (terAlpha < 1) { ctx.save(); ctx.globalAlpha = terAlpha; }
    let isFactionView = zoom <= MIN_ZOOM * 1.5;
    let centralPowers = ['GERMANY','AUSTRIA_HUNGARY','BULGARIA','TURKEY'];
    let entente = ['FRANCE','UK','RUSSIA','SERBIA','BELGIUM','MONTENEGRO'];
    for (let p of PROVINCES) {
        let pd = G.provinceData[p.id];
        let origCountry = (pd && pd.originalCountry) ? pd.originalCountry : p.c;
        let color;
        if (isFactionView) {
            if (centralPowers.includes(origCountry)) color = COUNTRY_COLORS['GERMANY'];
            else if (entente.includes(origCountry)) color = COUNTRY_COLORS['FRANCE'];
            else color = "#c8a830";
        } else {
            color = COUNTRY_COLORS[origCountry] || "#888";
        }

        // 检查该省份内所有城市是否全部被占领（使用预计算缓存）
        let citiesHere = G._provinceCities ? (G._provinceCities[p.id] || []) : Object.values(G.cities).filter(c => c.provinceId === p.id);
        let allCitiesCaptured = citiesHere.length > 0 && citiesHere.every(c => c.owner !== origCountry);
        let countrySurrendered = G.surrendered && G.surrendered[origCountry] === true;

        if (allCitiesCaptured || countrySurrendered) {
            // 省内所有城市都被占领，显示占领国颜色+斜线
            let capturerColor;
            let capturerCountry = citiesHere.length > 0 ? citiesHere[0].owner : null;
            if (isFactionView) {
                if (centralPowers.includes(p.c)) capturerColor = COUNTRY_COLORS['GERMANY'];
                else if (entente.includes(p.c)) capturerColor = COUNTRY_COLORS['FRANCE'];
                else capturerColor = "#c8a830";
            } else if (capturerCountry) {
                capturerColor = COUNTRY_COLORS[capturerCountry] || "#888";
            } else if (countrySurrendered) {
                capturerColor = "rgba(180,180,180,0.15)";
            } else {
                capturerColor = COUNTRY_COLORS[p.c] || "#888";
            }
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
                ctx.fillStyle = capturerColor;
                ctx.fill();
                // Subtle diagonal hatch
                ctx.save();
                ctx.clip();
                ctx.strokeStyle = `rgba(180,140,80,0.08)`;
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
        } else {
            // 未完全占领：显示原始国家颜色
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
    if (terAlpha < 1) ctx.restore();
}

// ---- 预计算国际边界（两国交界的粗黑线） ----
let INTL_BORDERS = [];

function precomputeInternationalBorders() {
    const TOLERANCE = 0.006;
    let edgeMap = {};
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            for (let i = 0; i < ring.length; i++) {
                let a1 = ring[i], a2 = ring[(i + 1) % ring.length];
                // 生成规范键（排序端点 + 四舍五入到容差）
                let sx1, sy1, sx2, sy2;
                if (a1[0] < a2[0] - 1e-7 || (Math.abs(a1[0] - a2[0]) < 1e-7 && a1[1] < a2[1])) {
                    sx1 = a1[0]; sy1 = a1[1]; sx2 = a2[0]; sy2 = a2[1];
                } else {
                    sx1 = a2[0]; sy1 = a2[1]; sx2 = a1[0]; sy2 = a1[1];
                }
                let rx1 = Math.round(sx1 / TOLERANCE), ry1 = Math.round(sy1 / TOLERANCE);
                let rx2 = Math.round(sx2 / TOLERANCE), ry2 = Math.round(sy2 / TOLERANCE);
                let key = rx1 + ',' + ry1 + '-' + rx2 + ',' + ry2;
                if (!edgeMap[key]) {
                    edgeMap[key] = { countries: new Set(), edge: { x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1] } };
                }
                edgeMap[key].countries.add(p.c);
            }
        }
    }
    INTL_BORDERS = [];
    for (let key in edgeMap) {
        if (edgeMap[key].countries.size > 1) {
            INTL_BORDERS.push(edgeMap[key].edge);
        }
    }
}
precomputeInternationalBorders();

// ---- 预计算海岸线（陆地与海洋交界的边） ----
let COASTLINE_EDGES = [];

function precomputeCoastline() {
    const TOLERANCE = 0.006;
    let edgeMap = {};
    for (let p of PROVINCES) {
        let isSea = p.x >= 900;
        for (let ring of p.r) {
            if (ring.length < 3) continue;
            for (let i = 0; i < ring.length; i++) {
                let a1 = ring[i], a2 = ring[(i + 1) % ring.length];
                let sx1, sy1, sx2, sy2;
                if (a1[0] < a2[0] - 1e-7 || (Math.abs(a1[0] - a2[0]) < 1e-7 && a1[1] < a2[1])) {
                    sx1 = a1[0]; sy1 = a1[1]; sx2 = a2[0]; sy2 = a2[1];
                } else {
                    sx1 = a2[0]; sy1 = a2[1]; sx2 = a1[0]; sy2 = a1[1];
                }
                let rx1 = Math.round(sx1 / TOLERANCE), ry1 = Math.round(sy1 / TOLERANCE);
                let rx2 = Math.round(sx2 / TOLERANCE), ry2 = Math.round(sy2 / TOLERANCE);
                let key = rx1 + ',' + ry1 + '-' + rx2 + ',' + ry2;
                if (!edgeMap[key]) {
                    edgeMap[key] = { hasLand: false, hasSea: false, edge: { x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1] } };
                }
                if (isSea) edgeMap[key].hasSea = true;
                else edgeMap[key].hasLand = true;
            }
        }
    }
    COASTLINE_EDGES = [];
    for (let key in edgeMap) {
        let e = edgeMap[key];
        if (e.hasLand && e.hasSea) {
            COASTLINE_EDGES.push(e.edge);
        }
    }
}
precomputeCoastline();

function drawBorders() {
    // 先画所有省份细边框
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
    // 再画国际边界——粗黑线
    if (INTL_BORDERS.length > 0) {
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let seg of INTL_BORDERS) {
            let [sx1, sy1] = worldToScreen(seg.x1, seg.y1);
            let [sx2, sy2] = worldToScreen(seg.x2, seg.y2);
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx2, sy2);
        }
        ctx.stroke();
    }
    // 再画海岸线——淡蓝色（宽底+细边，向陆地方向加粗视觉效果）
    if (COASTLINE_EDGES.length > 0) {
        ctx.strokeStyle = "rgba(80,200,240,0.35)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        for (let seg of COASTLINE_EDGES) {
            let [sx1, sy1] = worldToScreen(seg.x1, seg.y1);
            let [sx2, sy2] = worldToScreen(seg.x2, seg.y2);
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx2, sy2);
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(80,200,240,0.80)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
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
            ctx.shadowColor = "#c8a830";
            ctx.shadowBlur = 12;
            ctx.strokeStyle = "#c8a830";
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.shadowBlur = 0;
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
        ctx.shadowColor = "rgba(22,16,10,0.7)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "rgba(200,180,150,0.5)";
        ctx.fillText(name, sx, sy);
        ctx.restore();
    }
}

// ── 城市 Emoji 位图缓存 ──
const _cityEmojiCache = {};
function _getCityEmojiBitmap(emoji, size) {
    const key = emoji + '_' + Math.round(size);
    if (_cityEmojiCache[key]) return _cityEmojiCache[key];
    const off = document.createElement('canvas');
    const dim = Math.ceil(size * 2.5);
    off.width = dim; off.height = dim;
    const oc = off.getContext('2d');
    oc.font = size + 'px sans-serif';
    oc.textAlign = 'center'; oc.textBaseline = 'middle';
    oc.fillText(emoji, dim / 2, dim / 2);
    _cityEmojiCache[key] = off;
    return off;
}

// ── 较大城市列表（模块级常量，避免每帧重建 Set）──
const _MAJOR_CITIES = new Set([
    // 德国（17个含首都）
    'hamburg','munich','cologne','frankfurt','leipzig','dresden','nuremberg','breslau','danzig','konigsberg',
    'bremen','hannover','aachen','rostock','kiel','strasbourg',
    // 法国（11个非首都）
    'lyon','marseille','bordeaux','lille','toulouse','nice','nantes',
    'reims','verdun','amiens','orleans_fr',
    // 英国
    'manchester','birmingham','glasgow','liverpool','bristol','edinburgh','dublin','leeds',
    // 意大利
    'naples','turin','milan','genoa','venice','florence','palermo','trieste',
    // 俄国
    'saint_petersburg','moscow','kiev','odessa','warsaw','minsk','riga',
    'rostov','sevastopol',
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

function drawCities() {
    // 缩放层级：首都最早显示，较大城市次之，小城市最晚
    const capitalZoom = 0.15;
    const majorZoom = 0.35;
    const minorZoom = 0.7;

    // 缩放极小时完全跳过（无任何城市可见）
    if (zoom <= capitalZoom) return;

    for (let city of CITIES) {
        const [sx, sy] = worldToScreen(city.lon, city.lat);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        // 根据城市等级和缩放决定是否显示
        if (city.isCapital && zoom <= capitalZoom) continue;
        let isMajor = _MAJOR_CITIES.has(city.id) || (typeof isMajorCity === 'function' && isMajorCity(city.id));
        if (!city.isCapital && isMajor && zoom <= majorZoom) continue;
        if (!city.isCapital && !isMajor && zoom <= minorZoom) continue;

        let cityData = G.cities[city.id];
        let hp = cityData ? cityData.hp : 50;
        let maxHp = cityData ? cityData.maxHp : 50;
        let owner = cityData ? cityData.owner : city.country;

        // 使用像素贴图渲染城市（一战风格建筑）
        let buildingImg = null;
        let fontSize, nameColor;
        if (city.isCapital) {
            let origCountry = city.country;
            buildingImg = BUILDING_IMAGES[origCountry + '_capital'] || BUILDING_IMAGES['capital'];
            fontSize = 22; nameColor = "#c8a830";
        } else if (isMajor) {
            buildingImg = BUILDING_IMAGES['major'];
            fontSize = 18; nameColor = "#e8d0a0";
        } else {
            buildingImg = BUILDING_IMAGES['small'];
            fontSize = 14; nameColor = "#e8e0d0";
        }

        ctx.save();
        // 战术层以下建筑大小固定（不随视野拉远缩小），战术层以上随缩放
        let bEffZoom = Math.max(zoom, typeof TACTICAL_ZOOM !== 'undefined' ? TACTICAL_ZOOM : 1.8);
        let bImgSize = city.isCapital ? (5 * bEffZoom * 3) : ((isMajor ? 5 : 6.75) * bEffZoom * 2);
        let bCenterY = sy - 10;
        // 脚底阴影（首都除外）
        if (!city.isCapital) {
            let shadowOffset = isMajor ? 0.44 : 0.08;
            ctx.beginPath();
            ctx.ellipse(sx, bCenterY + bImgSize * shadowOffset, bImgSize * 0.42, bImgSize * 0.14, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fill();
        }
        if (buildingImg && buildingImg.width > 0) {
            let imgSize = bImgSize;
            let ix = sx - imgSize/2, iy = sy - 10 - imgSize/2;
            ctx.drawImage(buildingImg, ix, iy, imgSize, imgSize);
        } else {
            // 后备：贴图未加载时使用emoji
            let emoji = city.isCapital ? "🏛️" : (isMajor ? "🏰" : "🏠");
            ctx.font = fontSize + "px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
            ctx.fillText(emoji, sx, sy - 10);
            ctx.shadowBlur = 0;
        }

        // 选中光圈（单选或框选城市），选中圈=碰撞箱
        let isSelCity = (G.selectedCity && G.selectedCity.id === city.id) ||
                        (G.selectedCities && G.selectedCities.indexOf(city.id) >= 0);
        if (isSelCity) {
            let selR = city.isCapital ? 2.5 * bEffZoom : (isMajor ? 4.5 * bEffZoom : 2.5 * bEffZoom);
            ctx.beginPath(); ctx.arc(sx, sy - 10, selR, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(200,168,48,0.10)";
            ctx.fill();
            ctx.strokeStyle = "#c8a830";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // City name below
        let nameY = sy - 10 + bImgSize * 0.58 + 12;
        ctx.font = city.isCapital ? "bold 12px sans-serif" : "10px sans-serif";
        ctx.fillStyle = nameColor;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
        ctx.fillText(city.name, sx, nameY);
        ctx.shadowBlur = 0;

        // HP bar — only show if damaged
        if (hp < maxHp) {
            let barW = bImgSize * 0.4, barH = 4;
            let hpY = sy - 10 + bImgSize * 0.58;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(sx - barW/2 - 1, hpY, barW + 2, barH + 2);
            ctx.fillStyle = hp > maxHp * 0.6 ? "#7a9a5a" : hp > maxHp * 0.3 ? "#c8a830" : "#b05040";
            ctx.fillRect(sx - barW/2, hpY + 1, barW * Math.max(0, hp / maxHp), barH);
        }

        // 占领国旗（显示在名称上方，取代小色块）— 直接调用国旗贴图（flags/ 目录 PNG）
        let flagCountry = null;
        if (cityData && cityData.owner && city.country !== cityData.owner) {
            flagCountry = cityData.owner;
        } else if (cityData && cityData.occupierFlag) {
            flagCountry = cityData.occupierFlag;
        }
        if (flagCountry) {
            let fw = 22, fh = 15;
            let fx = sx - fw/2, fy = sy - fontSize - 18;
            drawCountryFlag(flagCountry, fx, fy, fw, fh);
            ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=0.5;
            ctx.strokeRect(fx,fy,fw,fh);
        }

        // 生产进度条（蓝色）
        if (G.buildQueue && G.playerCountry && city.owner === G.playerCountry) {
            let building = G.buildQueue.find(bq => bq.cityId === city.id);
            if (building) {
                let barW = 30, barH = 4;
                let progress = building.totalDays > 0 ? Math.max(0, 1 - building.days / building.totalDays) : 0;
                let barY = sy - 28;
                ctx.fillStyle = "rgba(0,0,0,0.7)";
                ctx.fillRect(sx - barW/2 - 1, barY, barW + 2, barH + 2);
                ctx.fillStyle = "#6a8aaa";
                ctx.fillRect(sx - barW/2, barY + 1, barW * progress, barH);
                // 小图标标识
                if (building.type === 'factory') {
                    ctx.font = "8px sans-serif";
                    ctx.fillStyle = "rgba(200,180,150,0.7)";
                    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
                    ctx.fillText('🏭', sx, barY - 2);
                } else {
                    let ut = UNIT_TYPES[building.unitType];
                    let uimg = ut && UNIT_IMAGES[building.unitType];
                    if (uimg && uimg.width > 0) {
                        let isz = 10;
                        ctx.drawImage(uimg, sx - isz/2, barY - isz - 2, isz, isz);
                    } else {
                        ctx.font = "8px sans-serif";
                        ctx.fillStyle = "rgba(200,180,150,0.7)";
                        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
                        ctx.fillText(ut ? ut.sym : '⚔️', sx, barY - 2);
                    }
                }
            }
        }

        // 工兵修复 / 升级小图标
        {
            let beingRepaired = (cityData && cityData._repairing);
            let beingUpgraded = G.buildQueue && G.buildQueue.some(bq => bq.type === 'upgrade_city' && bq.cityId === city.id);
            if (beingRepaired || beingUpgraded) {
                ctx.font = "10px sans-serif";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center"; ctx.textBaseline = "bottom";
                ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
                ctx.fillText("🔨", sx, sy - fontSize - 18);
                ctx.shadowBlur = 0;
            }
        }

        // 驻军模式城市高亮（海军驻守时不亮城市，只亮海军节点）
        if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
            let hasNavy = G.garrisonUnitIds.some(uid => {
                let d = G.divisions.find(x => x.id === uid);
                return d && d.type === 'navy';
            });
            if (!hasNavy) {
                let ct = Date.now() / 1000;
                let pulse = 0.5 + 0.5 * Math.sin(ct * 4);
                ctx.fillStyle = "rgba(100,200,255," + (0.15 + pulse * 0.15) + ")";
                ctx.beginPath();
                ctx.arc(sx, sy - 10, fontSize + 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(100,200,255," + (0.5 + pulse * 0.4) + ")";
                ctx.lineWidth = 2.5;
                ctx.stroke();
                // 驻军图标
                ctx.font = "12px sans-serif";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🛡️", sx, sy - 10 - fontSize);
            }
        }

        // 中立城市标记（0HP 无归属）
        if (!owner && hp <= 0) {
            ctx.font = city.isCapital ? "bold 11px sans-serif" : "10px sans-serif";
            let nw = ctx.measureText(city.name).width;
            ctx.fillStyle = "#8ad4a4";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
            ctx.fillText("⚖️中立", sx + nw/2 + 3, sy + 6);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}

function drawFireZones() {
    if (!G.fireZones || G.fireZones.length === 0) return;
    ctx.save();
    for (let fz of G.fireZones) {
        let [sx, sy] = worldToScreen(fz.x, fz.y);
        if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) continue;
        let rPixels = Math.abs(worldToScreen(fz.x + fz.radius, fz.y)[0] - sx);
        let alpha = Math.max(0.1, fz.life / fz.lifeMax);
        // 火焰红色范围 + 火焰emoji
        ctx.beginPath(); ctx.arc(sx, sy, rPixels, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200,50,30," + (alpha * 0.2) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(200,70,30," + (alpha * 0.5) + ")";
        ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.stroke(); ctx.setLineDash([]);
        // 火焰emoji
        ctx.font = (rPixels * 0.8) + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🔥", sx, sy);
    }
    ctx.restore();
}

function drawFactories() {
    if (!G.factories) return;
    // 工厂视图模式下始终显示，否则仅在缩放到小城市级别（zoom>0.7）时显示
    if (!G._factoryView && zoom <= 0.7) return;
    for (let fact of G.factories) {
        if (!fact || fact.hp <= 0) continue;
        let [sx, sy] = worldToScreen(fact.rx, fact.ry);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;
        ctx.save();
        let fEffZoom = Math.max(zoom, typeof TACTICAL_ZOOM !== 'undefined' ? TACTICAL_ZOOM : 1.8);
        let fSize = 9 * fEffZoom * 2;
        let fImg = BUILDING_IMAGES['factory'];
        // 脚底阴影（先于图像绘制）
        ctx.beginPath();
        ctx.ellipse(sx, sy + fSize * 0.30, fSize * 0.42, fSize * 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();
        if (fImg && fImg.width > 0) {
            let fix = sx - fSize/2, fiy = sy - fSize/2;
            ctx.drawImage(fImg, fix, fiy, fSize, fSize);
        } else {
            ctx.font = "16px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3;
            ctx.fillText("🏭", sx, sy);
            ctx.shadowBlur = 0;
        }
        // HP bar — only show if damaged
        if (fact.hp < fact.maxHp) {
            let barW = 26, barH = 4;
            let hpY = sy + fSize * 0.42;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(sx - barW/2 - 1, hpY - 1, barW + 2, barH + 2);
            ctx.fillStyle = fact.hp > fact.maxHp * 0.6 ? "#7a9a5a" : fact.hp > fact.maxHp * 0.3 ? "#c8a830" : "#b05040";
            ctx.fillRect(sx - barW/2, hpY, barW * Math.max(0, fact.hp / fact.maxHp), barH);
        }
        // 双击选中的工厂高亮金框
        if (G.selectedFactories && G.selectedFactories.indexOf(fact.id) >= 0) {
            let selSize = 14; // 固定选中框，不随缩放变化
            ctx.strokeStyle = "rgba(200,168,48,0.9)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx - selSize - 2, sy - selSize - 2, (selSize + 2) * 2, (selSize + 2) * 2);
        }
        ctx.restore();
    }
}

function drawNavalBases() {
    if (typeof NAVAL_BASES === 'undefined') return;
    // 海军节点缩放到大城市级别（zoom>0.35）时显示
    if (zoom <= 0.35) return;
    for (let nb of NAVAL_BASES) {
        // 实时节点数据：被摧毁（hp<=0 从 G.navyNodes 删除）后不再显示
        let liveNode = null;
        if (G.navyNodes) {
            for (let id in G.navyNodes) {
                let n = G.navyNodes[id];
                if (Math.abs(n.lon - nb.lon) < 0.01 && Math.abs(n.lat - nb.lat) < 0.01) { liveNode = n; break; }
            }
        }
        if (!liveNode) continue;

        const [sx, sy] = worldToScreen(nb.lon, nb.lat);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        const owner = nb.country;
        const color = COUNTRY_COLORS[owner] || '#888';
        const nodeHpRatio = liveNode.maxHp > 0 ? Math.max(0, (liveNode.hp || 0) / liveNode.maxHp) : 0;

        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        // 受损节点淡化颜色
        let drawColor = nodeHpRatio < 0.3 ? 'rgba(184,48,32,0.9)' : nodeHpRatio < 0.6 ? 'rgba(200,152,32,0.9)' : color;

        // Naval base pixel art
        let nImg = BUILDING_IMAGES['naval'];
        let nEffZoom = Math.max(zoom, typeof TACTICAL_ZOOM !== 'undefined' ? TACTICAL_ZOOM : 1.8);
        let nSize = 20 * nEffZoom * 2;
        if (nImg && nImg.width > 0) {
            let nix = sx - nSize/2, niy = sy - nSize/2;
            ctx.drawImage(nImg, nix, niy, nSize, nSize);
        } else {
            ctx.font = '18px sans-serif';
            ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
            ctx.fillText('⚓', sx, sy);
            ctx.shadowBlur = 0;
        }

        // Anchor ring
        ctx.beginPath(); ctx.arc(sx, sy, nSize * 0.32, 0, Math.PI * 2);
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 节点血量条（受损时显示）
        if (nodeHpRatio < 1) {
            let hpBarW = 40, hpBarH = 4;
            let hpY = sy + nSize * 0.43;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(sx - hpBarW/2 - 1, hpY, hpBarW + 2, hpBarH + 2);
            ctx.fillStyle = nodeHpRatio > 0.6 ? "#7a9a5a" : nodeHpRatio > 0.3 ? "#c8a830" : "#b05040";
            ctx.fillRect(sx - hpBarW/2, hpY + 1, hpBarW * nodeHpRatio, hpBarH);
        }

        // 海军驻军模式高亮海军节点
        if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
            let hasNavy = G.garrisonUnitIds.some(uid => {
                let d = G.divisions.find(x => x.id === uid);
                return d && d.type === 'navy';
            });
            if (hasNavy) {
                let ct = Date.now() / 1000;
                let pulse = 0.5 + 0.5 * Math.sin(ct * 4);
                ctx.beginPath(); ctx.arc(sx, sy, nSize * 0.32, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(100,200,255," + (0.15 + pulse * 0.15) + ")";
                ctx.fill();
                ctx.strokeStyle = "rgba(100,200,255," + (0.5 + pulse * 0.4) + ")";
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.font = "12px sans-serif";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🛡️", sx, sy - nSize * 0.32);
            }
        }

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
        ctx.fillStyle = "rgba(180,140,80,0.15)";
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
    ctx.strokeStyle = "rgba(180,140,80,0.1)";
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
    ctx.fillStyle = "rgba(200,180,150,0.5)";
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
    ctx.fillStyle = "rgba(200,180,150,0.3)";
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
    let layerColor = "#6a8aaa";
    if (zoom >= STRATEGIC_ZOOM && zoom < TACTICAL_ZOOM) { layerName = "战役层"; layerColor = "#c8a830"; }
    else if (zoom >= TACTICAL_ZOOM) { layerName = "战术层"; layerColor = "#b05040"; }

    ctx.save();
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = layerColor;
    ctx.fillText(layerName + " · 省份视图", canvas.width / 2, barY + BOTTOM_BAR_HEIGHT / 2);
    ctx.restore();

    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(200,180,150,0.3)";
    ctx.fillText("x" + zoom.toFixed(2), canvas.width - 16, barY + 24);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(180,140,80,0.15)";
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
    ctx.fillStyle = "rgba(200,180,150,0.3)";
    ctx.fillText("— GADM 省份地图 —", 170, TOP_BAR_HEIGHT / 2);
    // 粮食显示：库存 + 净产（产-耗）
    if (G.playerCountry && G.cities && G.countries && G.cities[Object.keys(G.cities)[0]] && G.cities[Object.keys(G.cities)[0]].grainMax !== undefined) {
        let grain = 0, prod = 0, cons = 0;
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (c.owner === G.playerCountry && c.grainMax !== undefined) { grain += Math.floor(c.grain || 0); prod += (c.grainPerMonth || 0); }
        }
        for (let d of G.divisions) { if (d.country === G.playerCountry) cons += (typeof unitGrainPerMonth === 'function') ? unitGrainPerMonth(d) : 0; }
        let net = Math.round(prod - cons);
        ctx.font = "12px Georgia,serif";
        ctx.textAlign = "right";
        ctx.fillStyle = net < 0 ? "#e0a050" : "#a8d868";
        ctx.fillText("🌾 粮食 " + grain.toLocaleString() + "（" + (net >= 0 ? "+" : "") + net + "/月）", canvas.width - 16, TOP_BAR_HEIGHT / 2);
        ctx.textAlign = "left";
    }
    ctx.restore();
}

// ---- 鼠标坐标 ----
function drawMouseCoords() {
    const [wx, wy] = screenToWorld(mouseX, mouseY);
    ctx.save();
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(200,180,150,0.2)";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(wx.toFixed(2) + "°, " + wy.toFixed(2) + "°", 12, canvas.height - BOTTOM_BAR_HEIGHT - 8);
    ctx.restore();
}

// ---- 悬停地形提示（服务端生成的地形网格，0=海 1=平原 2=山地） ----
let _terrainGridData = null, _hoverCache = null, _hoverCachePos = null;
function terrainAt(wx, wy) {
    const g = typeof TERRAIN_GRID !== 'undefined' ? TERRAIN_GRID : null;
    if (!g) return null;
    if (wx < g.lon0 || wx > g.lon0 + g.cols * g.cell || wy < g.lat1 - g.rows * g.cell || wy > g.lat1) return null;
    const cx = Math.floor((wx - g.lon0) / g.cell), cy = Math.floor((g.lat1 - wy) / g.cell);
    const idx = cy * g.cols + cx;
    const key = idx;
    if (_hoverCachePos === key) return _hoverCache;
    if (!_terrainGridData) {
        try { _terrainGridData = Uint8Array.from(atob(g.b64), c => c.charCodeAt(0)); }
        catch (e) { return null; }
    }
    const v = (_terrainGridData[idx >> 2] >> ((idx & 3) * 2)) & 3;
    _hoverCache = v === 2 ? 'mountains' : v === 1 ? 'flat' : null;
    _hoverCachePos = key;
    return _hoverCache;
}
function drawTerrainHover() {
    const [wx, wy] = screenToWorld(mouseX, mouseY);
    const t = terrainAt(wx, wy);
    if (!t) return;
    const isM = t === 'mountains';
    const text = isM ? "山地" : "平原";
    ctx.save();
    ctx.font = "12px sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 8, bw = tw + padX * 2 + 14, bh = 22;
    let bx = mouseX + 14, by = mouseY + 16;
    if (bx + bw > canvas.width) bx = mouseX - bw - 10;
    if (by + bh > canvas.height) by = mouseY - bh - 10;
    ctx.fillStyle = "rgba(18,14,10,0.85)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = isM ? "rgba(180,140,80,0.55)" : "rgba(120,160,110,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = isM ? "#c89a5a" : "#8ab06a";
    ctx.fillRect(bx + padX, by + bh / 2 - 4, 8, 8);
    ctx.fillStyle = "#f0e6d0";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, bx + padX + 14, by + bh / 2 + 1);
    ctx.restore();
}

// ---- 缩放指示器 ----
function drawZoomIndicator() {
    const barX = 16, barY = canvas.height - BOTTOM_BAR_HEIGHT - 70;
    const barW = 4, barH = 60;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(barX - 6, barY - 6, barW + 12, barH + 12);
    ctx.fillStyle = "rgba(180,140,80,0.1)";
    ctx.fillRect(barX, barY, barW, barH);
    const t = 1 - (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    ctx.fillStyle = "#c8a830";
    ctx.fillRect(barX - 1, barY + t * barH - 2, barW + 2, 4);
    ctx.save();
    ctx.font = "8px sans-serif"; ctx.fillStyle = "rgba(200,180,150,0.4)";
    ctx.textAlign = "left";
    ctx.fillText("战", barX + barW + 4, barY + 8);
    ctx.fillText("战", barX + barW + 4, barY + barH/2 + 3);
    ctx.fillText("战", barX + barW + 4, barY + barH - 2);
    ctx.restore();
}

// ===== 墓碑绘制 =====
// ===== 铁路网绘制（每帧动态：归属随占领变化） =====
// 节点=城市；直线双轨（两端收拢进站）+ 低频淡色枕木；铁锈棕哑光配色
// G.railwaysView 控制显示（默认开，右下角按钮可切换）
// ---- 铁路段是否穿过山地（惰性缓存：采样沿线 3 点地形，任一为山地即记） ----
let _railMtnCache = null;
function ensureRailMtnCache() {
    if (_railMtnCache && typeof TERRAIN_GRID !== 'undefined') return _railMtnCache;
    _railMtnCache = {};
    if (typeof TERRAIN_GRID === 'undefined') return _railMtnCache;
    for (let key in (G.railways || {})) {
        let sep = key.indexOf('|');
        let a = key.slice(0, sep), b = key.slice(sep + 1);
        let cA = G.cities[a], cB = G.cities[b];
        if (!cA || !cB) continue;
        let m = false;
        for (let i = 1; i <= 3; i++) {
            let t = i / 4;
            if (terrainAt(cA.lon + (cB.lon - cA.lon) * t, cA.lat + (cB.lat - cA.lat) * t) === 'mountains') { m = true; break; }
        }
        _railMtnCache[key] = m;
    }
    return _railMtnCache;
}
function railwayIsMountain(key) { return !!(ensureRailMtnCache()[key]); }

function drawRailways() {
    if (!G.railways) return;
    if (G.railwaysView === false) return;
    let w = canvas.width, h = canvas.height;
    let mtnCache = ensureRailMtnCache();
    ctx.save();
    ctx.lineCap = 'round';
    for (let key in G.railways) {
        let sep = key.indexOf('|');
        let a = key.slice(0, sep), b = key.slice(sep + 1);
        let cA = G.cities[a], cB = G.cities[b];
        if (!cA || !cB) continue;
        let [x1, y1] = worldToScreen(cA.lon, cA.lat);
        let [x2, y2] = worldToScreen(cB.lon, cB.lat);
        // 线段包围盒与视野相交才画（任一端点在视野外、线段穿过屏幕也画，避免最大缩放时消失）
        let minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        let minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        if (maxX < -80 || minX > w + 80 || maxY < -80 || minY > h + 80) continue;
        // 铁路样式统一（铁锈棕 + 深色枕木），不按归属变色——各国铁路观感一致
        // 穿过山地的段为"艰难路段"：颜色偏暗偏冷，运兵速度只有平原段的一半
        let isMtn = mtnCache[key];
        let col = isMtn ? 'rgba(132,108,86,0.75)' : 'rgba(176,130,86,0.85)';
        // 直线方向
        let dx = x2 - x1, dy = y2 - y1;
        let len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len, ny = dx / len;
        // 双轨：法线 ±2px，两端收拢进站（轨道汇聚于城市点）
        let off = 2;
        for (let side = -1; side <= 1; side += 2) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + nx * off * side, y1 + ny * off * side);
            ctx.lineTo(x2 + nx * off * side, y2 + ny * off * side);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        // 枕木：每 22px 一根，淡色短横木（低对比，不抢眼）
        ctx.strokeStyle = 'rgba(60,50,40,0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        let sleepCount = 0;
        let segs = Math.max(1, Math.round(len / 22));
        for (let s = 0; s < segs && sleepCount < 500; s++) {
            let t = (s + 0.5) / segs;
            let px = x1 + dx * t, py = y1 + dy * t;
            ctx.moveTo(px - nx * 2.5, py - ny * 2.5);
            ctx.lineTo(px + nx * 2.5, py + ny * 2.5);
            sleepCount++;
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ===== 铁路视图切换按钮（右下角，补给按钮上方） =====
function drawRailButton() {
    let isActive = G.railwaysView !== false;
    let btnW = 44, btnH = 28;
    let btnX = canvas.width - btnW - 8, btnY = canvas.height - BOTTOM_BAR_HEIGHT - 110;
    ctx.save();
    ctx.fillStyle = isActive ? "rgba(176,130,86,0.35)" : "rgba(22,16,10,0.85)";
    CT.roundRectPath(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = isActive ? "rgba(176,130,86,0.7)" : "rgba(180,140,80,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = isActive ? "#e0c68c" : "#d4c0a0";
    ctx.fillText("🚂", btnX + btnW / 2, btnY + btnH / 2);
    if (isActive) {
        ctx.fillStyle = "rgba(176,130,86,0.3)";
        ctx.fillRect(btnX, btnY + btnH - 2, btnW, 2);
    }
    window._railBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
}

// ===== 城市视图按钮（右下角，铁路按钮上方） =====
function drawCityViewButton() {
    let isActive = !!G.cityViewMode;
    let btnW = 44, btnH = 28;
    let btnX = canvas.width - btnW - 8, btnY = canvas.height - BOTTOM_BAR_HEIGHT - 146;
    ctx.save();
    ctx.fillStyle = isActive ? "rgba(80,180,200,0.35)" : "rgba(22,16,10,0.85)";
    CT.roundRectPath(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = isActive ? "rgba(80,180,200,0.7)" : "rgba(180,140,80,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = isActive ? "#88c8e0" : "#d4c0a0";
    ctx.fillText("🏙️", btnX + btnW/2, btnY + btnH/2);
    if (isActive) {
        ctx.fillStyle = "rgba(80,180,200,0.3)";
        ctx.fillRect(btnX, btnY + btnH - 2, btnW, 2);
    }
    window._cityViewBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
}

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

function drawNavyGraves() {
    if (!G.navyGraves || G.navyGraves.length === 0) return;
    // 缩放到军队级别（zoom>0.35）时才显示沉船标记
    if (zoom <= 0.35) return;
    let now = G.date.getTime();
    let twoYearsMs = 2 * 365 * 24 * 3600 * 1000;
    // 使用真实时间做浮动动画，避免高倍速下游戏时间飞速流逝导致图标抖动
    let realNow = performance.now();
    for (let i = G.navyGraves.length - 1; i >= 0; i--) {
        let g = G.navyGraves[i];
        let age = now - g.deathTime;
        if (age > twoYearsMs) {
            G.navyGraves.splice(i, 1);
            continue;
        }
        let [sx, sy] = worldToScreen(g.x, g.y);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;
        // 永久显示，不淡化
        let alpha = 1;
        // 浮动效果：用真实时间 + 世界坐标做相位，稳定缓慢微摆
        let floatY = sy + Math.sin(realNow / 1200 + g.x * 0.5) * 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        // 深色水纹底色
        ctx.fillStyle = "rgba(0,40,80,0.5)";
        ctx.beginPath(); ctx.arc(sx, floatY, 12, 0, Math.PI*2); ctx.fill();
        // 外圈可点击提示
        ctx.strokeStyle = "rgba(200,160,80,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText("💀⚓", sx, floatY - 2);
        // 舰名
        if (g.name) {
            ctx.font = "8px Georgia,serif";
            ctx.fillStyle = "rgba(200,180,150,0.7)";
            ctx.textBaseline = "top";
            let displayName = g.name.length > 10 ? g.name.substring(0, 9) + '…' : g.name;
            ctx.fillText(displayName, sx, floatY + 8);
        }
        ctx.restore();
    }
}

// 检测屏幕坐标是否点击了沉船标记
function findNavyGraveAtScreen(sx, sy) {
    if (!G.navyGraves || G.navyGraves.length === 0) return null;
    let best = null;
    let bestDist = 18; // 18px 检测半径
    for (let g of G.navyGraves) {
        let [gx, gy] = worldToScreen(g.x, g.y);
        let dist = Math.hypot(sx - gx, sy - gy);
        if (dist < bestDist) {
            best = g;
            bestDist = dist;
        }
    }
    return best;
}

// ---- 主渲染 ----
// ===== 山地三层绘制（range 半透明棕/ shade 光影 / ridge 山脊线），使用当前 ctx =====
function drawTerrainMountainLayers() {
    // 范围层（画在省份上、阴影之下）
    if (mountainRangeReady()) {
        const tl = worldToScreen(-12, 72);
        const br = worldToScreen(65, 33);
        const ma = typeof MOUNTAIN_RANGE_ALPHA !== 'undefined' ? MOUNTAIN_RANGE_ALPHA : 1;
        if (ma < 1) ctx.save();
        ctx.globalAlpha = ma;
        ctx.drawImage(window.MOUNTAIN_RANGE_IMG, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
        if (ma < 1) ctx.restore();
    }
    // 阴影层（hillshade 光影+山地棕调）
    if (mountainShadeReady()) {
        const tl = worldToScreen(-12, 72);
        const br = worldToScreen(65, 33);
        const ma = typeof MOUNTAIN_SHADE_ALPHA !== 'undefined' ? MOUNTAIN_SHADE_ALPHA : 1;
        if (ma < 1) ctx.save();
        ctx.globalAlpha = ma;
        ctx.drawImage(window.MOUNTAIN_SHADE_IMG, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
        if (ma < 1) ctx.restore();
    }
    // 山脊线层
    if (mountainRidgeReady()) {
        const tl = worldToScreen(-12, 72);
        const br = worldToScreen(65, 33);
        const ma = typeof MOUNTAIN_RIDGE_ALPHA !== 'undefined' ? MOUNTAIN_RIDGE_ALPHA : 1;
        if (ma < 1) ctx.save();
        ctx.globalAlpha = ma;
        ctx.drawImage(window.MOUNTAIN_RIDGE_IMG, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
        if (ma < 1) ctx.restore();
    }
}

function render() { window._sibBtns = []; window._sibFormBtn = []; window._sidePanelRect = {}; G._countryFlagBtns = []; window._railModalBtns = []; window._railModalRect = {};
    try {
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw ocean (gradient background)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, OCEAN_COLOR_TOP);
    grad.addColorStop(1, OCEAN_COLOR_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ===== 地形底图（TIFF 转换，海面透明，贴在世界范围内） =====
    if (typeof TERRAIN_BG_ENABLED === 'undefined' || TERRAIN_BG_ENABLED) {
        if (terrainReady()) {
            const tl = worldToScreen(-12, 72);
            const br = worldToScreen(65, 33);
            ctx.drawImage(window.TERRAIN_IMG, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
        }
    }

    // ===== Offscreen cache for static geometry =====
    // 三层静态内容都依赖 worldToScreen（相机偏移），必须与相机同步：
    // panKey 按 8px 量化重建，拖动中仅小幅步进，消除每帧全量重绘的周期性卡顿
    let shapeKey = Math.round(zoom * 100) + ',' + w + ',' + h;
    let panKey = Math.round(camX * zoom * PIXELS_PER_DEGREE / 8) + ',' + Math.round(camY * zoom * PIXELS_PER_DEGREE / 8) + ',' + shapeKey;
    let needCache = window._staticViewKey !== panKey || !window._provinceCache;
    if (needCache && typeof PROVINCES !== 'undefined') {
        // Province fills (blit first, under borders)
        if (!window._provinceCache || window._provinceCache.width !== w || window._provinceCache.height !== h) {
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            window._provinceCache = c;
        }
        let pc = window._provinceCache.getContext('2d');
        let sc = ctx;
        ctx = pc; pc.clearRect(0, 0, w, h);
        drawProvinces();
        ctx = sc;

        // Coast grid cache (blit between province fills and borders)
        if (!window._coastCache || window._coastCache.width !== w || window._coastCache.height !== h) {
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            window._coastCache = c;
        }
        let cc = window._coastCache.getContext('2d');
        ctx = cc; cc.clearRect(0, 0, w, h);
        drawCoastGrid();
        ctx = sc;

        // Borders + rivers + 山地三层 cache (blit last, on top)
        if (!window._borderCache || window._borderCache.width !== w || window._borderCache.height !== h) {
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            window._borderCache = c;
        }
        let bc = window._borderCache.getContext('2d');
        ctx = bc; bc.clearRect(0, 0, w, h);
        drawRivers();
        drawBorders();
        drawTerrainMountainLayers();
        ctx = sc;

        window._staticViewKey = panKey;
    }
    if (window._coastCache) ctx.drawImage(window._coastCache, 0, 0);
    if (window._provinceCache) ctx.drawImage(window._provinceCache, 0, 0);
    if (window._borderCache) ctx.drawImage(window._borderCache, 0, 0);
    drawRailways();
    drawGravestones();
    drawNavyGraves();

    // UI on top (screen coordinates)
    drawSelection();
    drawCountryNames();
    // 工厂视图模式：显示工厂 + 城市名称 + 军队；正常模式则隐藏工厂
    if (G._factoryView) {
        drawFactories();
    }
    drawCities();
    drawNavalBases();
    drawDivisions();
    drawFireZones();
    drawCountrySidebar();
    drawSelBox();
    drawGameInfo();
    drawMouseCoords();
    drawTerrainHover();
    drawGameTopBar();
    drawBorder();
    drawGameBottomBar();
    // 指挥系统：底部快捷栏 + 集团军详情面板 + 弹窗
    if (typeof drawCommanderBar === 'function') drawCommanderBar();
    if (typeof drawArmyGroupPanel === 'function') drawArmyGroupPanel();
    if (typeof drawCommanderModal === 'function') drawCommanderModal();
    // FPS 左上角显示
    if (window._fps !== undefined) {
        ctx.save();
        ctx.fillStyle = "rgba(22,16,10,0.7)";
        ctx.fillRect(4, 4, 50, 16);
        ctx.fillStyle = window._fps >= 30 ? "#7a9a5a" : "#b05040";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(window._fps + " FPS", 8, 6);
        ctx.restore();
    }
    // 驻军模式提示
    if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
        ctx.save();
        let bannerY = TOP_BAR_HEIGHT + 4;
        let bannerX = canvas.width / 2;
        ctx.fillStyle = "rgba(22,16,10,0.9)";
        let text = "🛡️ 请点击目标城市以驻守 " + G.garrisonUnitIds.length + " 单位 (ESC取消)";
        ctx.font = "13px sans-serif";
        let tw = ctx.measureText(text).width + 20;
        ctx.fillRect(bannerX - tw/2, bannerY, tw, 28);
        ctx.strokeStyle = "rgba(180,140,80,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bannerX - tw/2, bannerY, tw, 28);
        ctx.fillStyle = "#6a8aaa";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, bannerX, bannerY + 14);
        ctx.restore();
    }
    drawActionBar();
    drawSelectedUnitSidebar();
    drawRailModal();
    drawGameLog();
    drawEventPopup();
    drawSavePanel();
    drawNewsBanner();
    drawBottomTabs();
    drawLeftPanelIfNeeded();
    drawFrontlineOverlay();
    drawGameOverPanel();
    drawSupplyView();
    drawFactoryToggle();
    drawSupplyButton();
    drawRailButton();
    drawCityViewButton();
    // ===== WebGL 单位层：在全部 2D 绘制之后 flush（GL canvas 叠在最上层，面板区域用 discard 挖洞） =====
    if (typeof GLU !== 'undefined' && GLU.isEnabled()) {
        let rects = [];
        rects.push([0, 0, w, TOP_BAR_HEIGHT]);
        rects.push([0, h - BOTTOM_BAR_HEIGHT, w, BOTTOM_BAR_HEIGHT]);
        let sp = window._sidePanelRect;
        if (sp && sp.x !== undefined) rects.push([sp.x, sp.y, sp.w, sp.h]);
        let cs = window._countrySidebarRect;
        if (cs && cs.x !== undefined) rects.push([cs.x, cs.y, cs.w, cs.h]);
        let rm = window._railModalRect;
        if (rm && rm.x !== undefined) rects.push([rm.x, rm.y, rm.w, rm.h]);
        let cm = window._cmdModalRect;
        if (cm && cm.x !== undefined) rects.push([cm.x, cm.y, cm.w, cm.h]);
        let cb = window._cmdBarRect;
        if (cb && cb.x !== undefined) rects.push([cb.x, cb.y, cb.w, cb.h]);
        let ls = window._leftSidebarRect;
        if (ls && ls.x !== undefined) rects.push([ls.x, ls.y, ls.w, ls.h]);
        GLU.flush(rects.slice(0, 8));
    }
} catch(e) { console.error(e); }
}

// ===== 补给视图：己方城市补给圈（按类型着色，重叠加深）+ 城市名(X个师) =====
// LOD 分级：小城市任何缩放都画淡虚线（不再被跳过）；填充/标签只在放大后出现，避免大城市圈糊成一片
function drawSupplyView() {
    if (!G.supplyView || !G.cities || !G.playerCountry) return;
    ctx.save();
    let kmPerDeg = (typeof KM_PER_DEG !== 'undefined') ? KM_PER_DEG : 111;
    // 缩放淡出系数：最小缩放 0.35 倍淡，zoom≈0.78 起全亮
    let faint = 0.35 + 0.65 * Math.min(1, Math.max(0, (zoom - MIN_ZOOM) / 0.7));
    let showFill = zoom > 0.6;   // 填充只在放大后画
    let showLabel = zoom > 0.9;  // 标签只在局部视图画（避免“X个师”糊成一片）
    for (let cid in G.cities) {
        let c = G.cities[cid];
        if (!c || c.grainMax === undefined || c.owner !== G.playerCountry || c.hp <= 0) continue;
        let k = (typeof cityGrainCfgKey === 'function') ? cityGrainCfgKey(c) : 'small';
        let cfg = (typeof GRAIN_CITY_CFG !== 'undefined' && GRAIN_CITY_CFG[k]) ? GRAIN_CITY_CFG[k] : { color: '#9aa0a8' };
        let isSmall = k === 'small';
        let isCap = k === 'capital';
        let [sx, sy] = worldToScreen(c.lon, c.lat);
        if (sx < -400 || sx > canvas.width + 400 || sy < -400 || sy > canvas.height + 400) continue;
        let rDeg = (c.supplyRadius || 50) / kmPerDeg / Math.max(0.2, Math.cos(c.lat * Math.PI / 180));
        let [rx2, ry2] = worldToScreen(c.lon + rDeg, c.lat);
        let rPix = Math.abs(rx2 - sx);
        let hexA = function (a) { return Math.round(a * 255).toString(16).padStart(2, '0'); };
        ctx.beginPath(); ctx.arc(sx, sy, rPix, 0, Math.PI * 2);
        if (isSmall) {
            // 小城市：始终显示细虚线圈，无填充无标签；低缩放淡化
            ctx.strokeStyle = cfg.color + hexA(0.22 * faint);
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.stroke(); ctx.setLineDash([]);
        } else {
            if (showFill) {
                ctx.fillStyle = cfg.color + hexA(0.14 * faint);
                ctx.fill();
            }
            ctx.strokeStyle = cfg.color + hexA((isCap ? 0.75 : 0.5) * faint);
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 5]);
            ctx.stroke(); ctx.setLineDash([]);
            if (showLabel) {
                let label = c.name + " (" + (c.suppliedDivs || 0) + "个师)";
                ctx.font = "10px Georgia,serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                let tw = ctx.measureText(label).width;
                ctx.fillStyle = "rgba(10,12,18,0.75)";
                ctx.fillRect(sx - tw/2 - 4, sy - 14, tw + 8, 14);
                ctx.fillStyle = cfg.color;
                ctx.fillText(label, sx, sy - 7);
            }
        }
    }
    ctx.restore();
}

// ===== 补给视图按钮（右下角，工厂按钮上方） =====
function drawSupplyButton() {
    let isActive = !!G.supplyView;
    let btnW = 44, btnH = 28;
    let btnX = canvas.width - btnW - 8, btnY = canvas.height - BOTTOM_BAR_HEIGHT - 74;
    ctx.save();
    ctx.fillStyle = isActive ? "rgba(120,180,90,0.35)" : "rgba(22,16,10,0.85)";
    CT.roundRectPath(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = isActive ? "rgba(120,180,90,0.7)" : "rgba(180,140,80,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = isActive ? "#a8d868" : "#d4c0a0";
    ctx.fillText("🌾", btnX + btnW/2, btnY + btnH/2);
    if (isActive) {
        ctx.fillStyle = "rgba(120,180,90,0.3)";
        ctx.fillRect(btnX, btnY + btnH - 2, btnW, 2);
    }
    window._supplyBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
}

function drawFactoryToggle() {
    let isActive = !!G._factoryView;
    let btnW = isActive ? 56 : 44, btnH = 28;
    let btnX = canvas.width - btnW - 8, btnY = canvas.height - BOTTOM_BAR_HEIGHT - 38;
    ctx.save();
    ctx.fillStyle = isActive ? "rgba(200,168,48,0.35)" : "rgba(22,16,10,0.85)";
    CT.roundRectPath(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = isActive ? "rgba(200,168,48,0.7)" : "rgba(180,140,80,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (isActive) {
        ctx.font = "bold 11px Georgia,serif";
        ctx.fillStyle = "#e8d8b0";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("返回", btnX + btnW/2, btnY + btnH/2);
    } else {
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🏭", btnX + btnW/2, btnY + btnH/2);
    }
    if (isActive) {
        ctx.fillStyle = "rgba(200,168,48,0.3)";
        ctx.fillRect(btnX, btnY + btnH - 2, btnW, 2);
    }
    window._factoryBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.restore();
}

function drawGameOverPanel() {
    if (!G.gameOver) return;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#c8a830";
    ctx.font = "bold 36px sans-serif";
    ctx.fillText(G.gameOverMessage, cx, cy - 60);
    ctx.fillStyle = "rgba(200,180,150,0.6)";
    ctx.font = "16px sans-serif";
    ctx.fillText("按 R 键重新开始", cx, cy + 20);
    ctx.fillText("按 Esc 关闭", cx, cy + 50);
}