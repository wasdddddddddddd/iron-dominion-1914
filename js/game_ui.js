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
    ctx.strokeStyle = "rgba(80,200,240,0.30)";
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.strokeStyle = "rgba(80,200,240,0.65)";
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
            if (isFactionView) {
                if (centralPowers.includes(p.c)) capturerColor = COUNTRY_COLORS['GERMANY'];
                else if (entente.includes(p.c)) capturerColor = COUNTRY_COLORS['FRANCE'];
                else capturerColor = "#c8a830";
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

    // 较大城市列表（与MAJOR_CITY_IDS保持一致）
    const majorCities = new Set([
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
    for (let city of CITIES) {
        const [sx, sy] = worldToScreen(city.lon, city.lat);
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        // 根据城市等级和缩放决定是否显示
        if (city.isCapital && zoom <= capitalZoom) continue;
        let isMajor = majorCities.has(city.id) || (typeof isMajorCity === 'function' && isMajorCity(city.id));
        if (!city.isCapital && isMajor && zoom <= majorZoom) continue;
        if (!city.isCapital && !isMajor && zoom <= minorZoom) continue;

        let cityData = G.cities[city.id];
        let hp = cityData ? cityData.hp : 50;
        let maxHp = cityData ? cityData.maxHp : 50;
        let owner = cityData ? cityData.owner : city.country;

        // 三层图标：🏛️首都 🏰较大城市 🏠小城市
        let emoji, fontSize, nameColor;
        if (city.isCapital) {
            emoji = "🏛️"; fontSize = 22; nameColor = "#ffd700";
        } else if (isMajor) {
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

        // 占领国旗
        if (cityData && cityData.occupierFlag) {
            let flagColor = COUNTRY_COLORS[cityData.occupierFlag] || "#888";
            // 占领半径圈
            let occRadius = fontSize + 16;
            ctx.beginPath(); ctx.arc(sx, sy - 10, occRadius, 0, Math.PI * 2);
            ctx.fillStyle = flagColor.replace(')', ',0.12)').replace('rgb', 'rgba');
            if (flagColor.startsWith('#')) {
                let r = parseInt(flagColor.slice(1,3), 16);
                let g = parseInt(flagColor.slice(3,5), 16);
                let b = parseInt(flagColor.slice(5,7), 16);
                ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
            }
            ctx.fill();
            ctx.strokeStyle = flagColor.replace(')', ',0.3)').replace('rgb', 'rgba');
            if (flagColor.startsWith('#')) {
                let r = parseInt(flagColor.slice(1,3), 16);
                let g = parseInt(flagColor.slice(3,5), 16);
                let b = parseInt(flagColor.slice(5,7), 16);
                ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
            }
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            let flagY = sy - 14;
            ctx.fillStyle = flagColor;
            ctx.fillRect(sx - 7, flagY - 7, 14, 10);
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - 7, flagY - 7, 14, 10);
            ctx.font = "7px sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText((COUNTRY_CN[cityData.occupierFlag] || cityData.occupierFlag).substring(0, 2), sx, flagY);
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
                ctx.fillStyle = "#4a8ad4";
                ctx.fillRect(sx - barW/2, barY + 1, barW * progress, barH);
                // 小图标标识
                let icon = building.type === 'factory' ? '🏭' : (UNIT_TYPES[building.unitType] ? UNIT_TYPES[building.unitType].sym : '⚔️');
                ctx.font = "8px sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.textAlign = "center"; ctx.textBaseline = "bottom";
                ctx.fillText(icon, sx, barY - 2);
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
        ctx.fillStyle = "rgba(255,40,0," + (alpha * 0.2) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,80,0," + (alpha * 0.5) + ")";
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
    // 工厂只在缩放到小城市级别（zoom>0.7）时显示
    if (zoom <= 0.7) return;
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
    // 海军节点缩放到大城市级别（zoom>0.35）时显示
    if (zoom <= 0.35) return;
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

        // 海军驻军模式高亮海军节点
        if (G.garrisonMode && G.garrisonUnitIds && G.garrisonUnitIds.length > 0) {
            let hasNavy = G.garrisonUnitIds.some(uid => {
                let d = G.divisions.find(x => x.id === uid);
                return d && d.type === 'navy';
            });
            if (hasNavy) {
                let ct = Date.now() / 1000;
                let pulse = 0.5 + 0.5 * Math.sin(ct * 4);
                ctx.beginPath(); ctx.arc(sx, sy, 18, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(100,200,255," + (0.15 + pulse * 0.15) + ")";
                ctx.fill();
                ctx.strokeStyle = "rgba(100,200,255," + (0.5 + pulse * 0.4) + ")";
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.font = "12px sans-serif";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🛡️", sx, sy - 18);
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

        // 海军建造进度条
        if (G.navyBuildQueue && G.playerCountry && nb.country === G.playerCountry) {
            let nodeId = null;
            for (let id in G.navyNodes) {
                if (G.navyNodes[id].country === G.playerCountry &&
                    Math.abs(G.navyNodes[id].lon - nb.lon) < 0.01 &&
                    Math.abs(G.navyNodes[id].lat - nb.lat) < 0.01) {
                    nodeId = id; break;
                }
            }
            if (nodeId) {
                let building = G.navyBuildQueue.find(nq => nq.nodeId === nodeId);
                if (building) {
                    let barW = 36, barH = 4;
                    let progress = building.totalDays > 0 ? Math.max(0, 1 - building.days / building.totalDays) : 0;
                    let barY = sy + 38;
                    ctx.fillStyle = "rgba(0,0,0,0.7)";
                    ctx.fillRect(sx - barW/2 - 1, barY, barW + 2, barH + 2);
                    ctx.fillStyle = "#4a8ad4";
                    ctx.fillRect(sx - barW/2, barY + 1, barW * progress, barH);
                    ctx.font = "7px sans-serif";
                    ctx.fillStyle = "rgba(200,220,255,0.9)";
                    ctx.textAlign = "center";
                    ctx.fillText("🚢", sx, barY - 2);
                }
            }
        }

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
function render() { window._sibBtns = []; window._sibFormBtn = []; window._sidePanelRect = {}; G._countryFlagBtns = [];
    try {
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw ocean (gradient background)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, OCEAN_COLOR_TOP);
    grad.addColorStop(1, OCEAN_COLOR_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ===== Offscreen cache for static geometry =====
    let viewKey = camX.toFixed(3) + ',' + camY.toFixed(3) + ',' + zoom.toFixed(5) + ',' + w + ',' + h;
    let needCache = window._staticViewKey !== viewKey || !window._coastCache;
    if (needCache && typeof PROVINCES !== 'undefined') {
        // Coast grid cache (drawn before province fills)
        if (!window._coastCache || window._coastCache.width !== w || window._coastCache.height !== h) {
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            window._coastCache = c;
        }
        let cc = window._coastCache.getContext('2d');
        let sc = ctx;
        ctx = cc; cc.clearRect(0, 0, w, h);
        drawCoastGrid();
        ctx = sc;

        // Borders + rivers cache (drawn after province fills)
        if (!window._borderCache || window._borderCache.width !== w || window._borderCache.height !== h) {
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            window._borderCache = c;
        }
        let bc = window._borderCache.getContext('2d');
        ctx = bc; bc.clearRect(0, 0, w, h);
        drawRivers();
        drawBorders();
        ctx = sc;

        window._staticViewKey = viewKey;
    }
    if (window._coastCache) ctx.drawImage(window._coastCache, 0, 0);

    // Draw provinces directly (native canvas handles ~200 polygons at 60fps)
    drawProvinces();

    // Blit borders + rivers cache on top of province fills
    ctx.drawImage(window._borderCache, 0, 0);
    drawGravestones();

    // UI on top (screen coordinates)
    drawSelection();
    drawCountryNames();
    drawCities();
    drawNavalBases();
    drawFactories();
    drawFireZones();
    drawDivisions();
    drawCountrySidebar();
    drawSelBox();
    drawGameInfo();
    drawMouseCoords();
    drawGameTopBar();
    drawBorder();
    drawGameBottomBar();
    // FPS 左上角显示
    if (window._fps !== undefined) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(4, 4, 50, 16);
        ctx.fillStyle = window._fps >= 30 ? "#4a4" : "#d44";
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
        ctx.fillStyle = "rgba(10,15,26,0.9)";
        let text = "🛡️ 请点击目标城市以驻守 " + G.garrisonUnitIds.length + " 单位 (ESC取消)";
        ctx.font = "13px sans-serif";
        let tw = ctx.measureText(text).width + 20;
        ctx.fillRect(bannerX - tw/2, bannerY, tw, 28);
        ctx.strokeStyle = "rgba(100,200,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bannerX - tw/2, bannerY, tw, 28);
        ctx.fillStyle = "#8ab8d4";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, bannerX, bannerY + 14);
        ctx.restore();
    }
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