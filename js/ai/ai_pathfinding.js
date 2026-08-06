// Iron & Dominion 1914 — 红警风格网格寻路 v2
// ============================================
// 简化版：粗网格 + 海岸代价 + 节流A* + 卡死检测
// ============================================

// ===== 0. 保存原版 moveUnits =====
if (typeof moveUnits === 'function' && !window._origMoveUnits) {
    window._origMoveUnits = moveUnits;
}

// ===== 1. 导航网格 =====
const PF_CELL = 0.04;       // ~4km/格，高精度
const NAVY_BUFFER = PF_CELL * 0.35; // 海军距陆最小距离（~1.4km）
const MAX_ASTAR_ITER = 8000;
const MAX_ASTAR_PER_FRAME = 16;
const STUCK_FRAMES = 15;

let gPF = null; // {cols,rows,minLon,minLat,land:Uint8Array,cost:Float32Array,owner:Array}
let _pfReq = [];
let _pfCount = 0;
let _pfCtx = null; // { country } — 外交上下文，在 A* / 移动时传给 costFn

// 每帧 A* 总迭代预算（约 1-2ms）；单搜索切片 4000 迭代
const PF_FRAME_BUDGET = 40000;
const PF_SEARCH_SLICE = 4000;
// 路径缓存：同目标+同起始区域(8×8格≈0.32°)+同国家共享，命中后逐段重新校验
const PF_CACHE_TTL = 2000;
let _pfCache = new Map();
function _pfCacheValid(wp, isNavy, fromX, fromY) {
    let prevX = fromX, prevY = fromY;
    for (let i = 0; i < wp.length; i++) {
        const b = wp[i];
        const dx = b.x - prevX, dy = b.y - prevY;
        const dist = Math.hypot(dx, dy);
        let steps = Math.max(1, Math.ceil(dist / PF_CELL));
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const px = prevX + dx * t, py = prevY + dy * t;
            if (isNavy ? !_onNavyGrid(px, py) : !_onLandGrid(px, py)) return false;
        }
        prevX = b.x; prevY = b.y;
    }
    return true;
}

function cellIdx(cx, cy) { return cy * gPF.cols + cx; }
function lon2c(lon) { return Math.floor((lon - gPF.minLon) / PF_CELL); }
function lat2c(lat) { return Math.floor((lat - gPF.minLat) / PF_CELL); }
function c2lon(cx) { return gPF.minLon + (cx + 0.5) * PF_CELL; }
function c2lat(cy) { return gPF.minLat + (cy + 0.5) * PF_CELL; }

function _onLandGrid(lon, lat) {
    if (!gPF) return isLandPoint(lon, lat);
    let cx = lon2c(lon), cy = lat2c(lat);
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return isLandPoint(lon, lat);
    return gPF.land[cy * gPF.cols + cx] === 1;
}
function _onNavyGrid(lon, lat) {
    if (!gPF) return !isLandPoint(lon, lat);
    let cx = lon2c(lon), cy = lat2c(lat);
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return !isLandPoint(lon, lat);
    return gPF.navyLand[cy * gPF.cols + cx] === 1;
}

function isWalkable(cx, cy) {
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return false;
    return gPF.land[cellIdx(cx, cy)] === 1;
}

// 外交通行判定（统一：交战公告 / 同盟 / 军事通行权 / 同阵营 / 附属国）
// A*、直线验证、移动层、路径缓存校验四处共用，避免判定逻辑分叉
function pfNationAllowed(country, owner) {
    if (!owner || owner === country) return true;
    if (typeof canEngage === 'function' && canEngage(country, owner)) return true;
    if (G.alliances && G.alliances[country] && G.alliances[country][owner]) return true;
    if (G.militaryAccess && G.militaryAccess[owner] && G.militaryAccess[owner][country]) return true;
    if (typeof isSameFaction === 'function' && isSameFaction(country, owner)) return true;
    if (typeof isVassalOf === 'function' && (isVassalOf(owner, country) || isVassalOf(country, owner))) return true;
    return false;
}

function cellCost(cx, cy) {
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return 9999;
    let idx = cellIdx(cx, cy);
    if (_pfCtx && gPF.owner[idx]) {
        let owner = G.provinceOwners[gPF.owner[idx]];
        if (owner && !pfNationAllowed(_pfCtx.country, owner)) return 9999;
    }
    return gPF.cost[idx];
}
function navyIsWalkable(cx, cy) {
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return false;
    return gPF.navyLand[cellIdx(cx, cy)] === 1;
}
function navyCellCost(cx, cy) {
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return 9999;
    return gPF.navyCost[cellIdx(cx, cy)];
}

// 构建网格
function buildPF() {
    if (gPF) return;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (let p of PROVINCES) {
        for (let ring of p.r) for (let v of ring) {
            if (v[0] < minLon) minLon = v[0]; if (v[0] > maxLon) maxLon = v[0];
            if (v[1] < minLat) minLat = v[1]; if (v[1] > maxLat) maxLat = v[1];
        }
    }
    let cols = Math.ceil((maxLon - minLon) / PF_CELL) + 1;
    let rows = Math.ceil((maxLat - minLat) / PF_CELL) + 1;
    let n = cols * rows;
    // 先赋值给 gPF，后续 c2lon/c2lat 才能用
    gPF = { cols, rows, minLon, minLat, land: null, cost: null };
    // A* 零分配工作区（版本化数组 + 预分配堆）
    // 注意：_aG/_heapF 必须 float64 —— float32 存值四舍五入后，与 float64 计算出的 ng 比较会产生
    // 1e-8 级伪重松弛，堆被重复条目淹没，搜索空转
    _aG = new Float64Array(n);
    _aP = new Int32Array(n);
    _aSt = new Int32Array(n);
    _aClosed = new Int32Array(n);
    _heapF = new Float64Array(_HEAP_CAP);
    _heapIdx = new Int32Array(_HEAP_CAP);
    _aVer = 0; _heapLen = 0; _pfBudgetLeft = 0;
    let land = new Uint8Array(n);
    let cost = new Float32Array(n);
    // 离线标定：陆海 + 所属省份
    for (let i = 0; i < n; i++) {
        let cy = Math.floor(i / cols), cx = i % cols;
        let lon = c2lon(cx), lat = c2lat(cy);
        // 格内多点验证：中心+四偏0.45格，任一入海则标记为海（防窄半岛穿海）
        let safe = true;
        let offs = [[0,0],[0.45,0],[-0.45,0],[0,0.45],[0,-0.45]];
        for (let o of offs) {
            if (!isLandPoint(lon + o[0]*PF_CELL, lat + o[1]*PF_CELL)) { safe = false; break; }
        }
        land[i] = safe ? 1 : 0;
    }
    // 所属省份（陆军外交封锁用）—— 用省份自身 rasterize 代替逐格 getProvinceAt
    let owner = new Array(n).fill(0);
    for (let p of PROVINCES) {
        if (p.x >= 900) continue;
        let bb = PROVINCE_BBOX[p.id];
        if (!bb) continue;
        let minCx = Math.max(0, lon2c(bb.minX));
        let maxCx = Math.min(cols - 1, lon2c(bb.maxX));
        let minCy = Math.max(0, lat2c(bb.minY));
        let maxCy = Math.min(rows - 1, lat2c(bb.maxY));
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                let idx = cy * cols + cx;
                if (land[idx] === 1 && owner[idx] === 0) {
                    for (let ring of p.r) {
                        if (ring.length >= 3 && isPointInPolygon(c2lon(cx), c2lat(cy), ring)) {
                            owner[idx] = p.id; break;
                        }
                    }
                }
            }
        }
    }
    // 海岸代价：三重缓冲，梯度远离海岸
    // 第一层（紧邻海洋）高代价，第二层中等，第三层轻微
    let coast1 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (land[cellIdx(nx, ny)] === 0) { coast1[idx] = 1; break; }
            }
        }
    }
    let coast2 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0 || coast1[idx]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (coast1[cellIdx(nx, ny)]) { coast2[idx] = 1; break; }
            }
        }
    }
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0) { cost[idx] = 9999; continue; }
            if (coast1[idx]) { cost[idx] = 3.0; continue; }
            if (coast2[idx]) { cost[idx] = 2.0; continue; }
            // 第三层：距海2格
            let coast3 = false;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (coast2[cellIdx(nx, ny)]) { coast3 = true; break; }
            }
            cost[idx] = coast3 ? 1.3 : 1.0;
        }
    }
    gPF.land = land; gPF.cost = cost; gPF.owner = owner;

    // 边境代价梯度（完全复制海岸线结构 3.0/2.0/1.3）
    // 第一层（紧邻不同国家的边境）高代价，第二层中等，第三层轻微
    let border1 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0) continue;
            let pid = owner[idx];
            if (!pid) continue;
            let myCtry = G.provinceOwners ? G.provinceOwners[pid] : null;
            if (!myCtry) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                let nidx = cellIdx(nx, ny);
                if (land[nidx] === 0) continue;
                let npid = owner[nidx];
                if (npid && npid !== pid) {
                    let nCtry = G.provinceOwners ? G.provinceOwners[npid] : null;
                    if (nCtry && nCtry !== myCtry) { border1[idx] = 1; break; }
                }
            }
        }
    }
    let border2 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0 || border1[idx]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (border1[cellIdx(nx, ny)]) { border2[idx] = 1; break; }
            }
        }
    }
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (land[idx] === 0) continue;
            if (border1[idx]) { cost[idx] = Math.max(cost[idx], 3.0); continue; }
            if (border2[idx]) { cost[idx] = Math.max(cost[idx], 2.0); continue; }
            // 第三层：距边境2格
            let border3 = false;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (border2[cellIdx(nx, ny)]) { border3 = true; break; }
            }
            if (border3) cost[idx] = Math.max(cost[idx], 1.3);
        }
    }

    // ===== 海军网格（与陆军陆地反相，使用五点验证） =====
    let navyLand = new Uint8Array(n);
    let navyCost = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        navyLand[i] = land[i] === 0 ? 1 : 0;
    }
    // 海军海岸代价：四重缓冲，强制舰队远离海岸线
    let nCoast1 = new Uint8Array(n); // 邻陆水面
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (navyLand[idx] === 0) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (land[cellIdx(nx, ny)] === 1) { nCoast1[idx] = 1; break; }
            }
        }
    }
    let nCoast2 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (navyLand[idx] === 0 || nCoast1[idx]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (nCoast1[cellIdx(nx, ny)]) { nCoast2[idx] = 1; break; }
            }
        }
    }
    let nCoast3 = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (navyLand[idx] === 0 || nCoast1[idx] || nCoast2[idx]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (nCoast2[cellIdx(nx, ny)]) { nCoast3[idx] = 1; break; }
            }
        }
    }
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let idx = cellIdx(cx, cy);
            if (navyLand[idx] === 0) { navyCost[idx] = 9999; continue; }
            if (nCoast1[idx]) { navyCost[idx] = 5.0; continue; }
            if (nCoast2[idx]) { navyCost[idx] = 3.0; continue; }
            if (nCoast3[idx]) { navyCost[idx] = 1.5; continue; }
            navyCost[idx] = 1.0;
        }
    }
    gPF.navyLand = navyLand; gPF.navyCost = navyCost;
}

// ===== 2. A* 寻路（零分配版：版本化数组 + 预分配堆，替代每搜索数万小对象） =====
// _aG  g 值；_aP 父节点索引(-1=无)；_aSt 版本戳（==_aVer 表示 _aG/_aP 有效）；_aClosed 已扩展标记
let _aG = null, _aP = null, _aSt = null, _aClosed = null;
let _aVer = 0;
let _lastIters = 0;
let _lastHeapPeak = 0;
const _HEAP_CAP = 131072;
let _heapF = null, _heapIdx = null, _heapLen = 0;
let _lastPopF = 0;
// 每帧 A* 迭代预算（6e 设置，_aStarGeneric 逐迭代消耗，到 0 即返回最优可行部分路径）
let _pfBudgetLeft = 0;

function _heapPush(idx, f) {
    let i = _heapLen++;
    if (i > _lastHeapPeak) _lastHeapPeak = i;
    _heapIdx[i] = idx; _heapF[i] = f;
    while (i > 0) {
        let p = (i - 1) >> 1;
        if (_heapF[p] <= _heapF[i]) break;
        let t = _heapIdx[i]; _heapIdx[i] = _heapIdx[p]; _heapIdx[p] = t;
        let tf = _heapF[i]; _heapF[i] = _heapF[p]; _heapF[p] = tf;
        i = p;
    }
}
function _heapPop() {
    _lastPopF = _heapF[0];
    let top = _heapIdx[0];
    let ln = --_heapLen;
    if (ln > 0) {
        _heapIdx[0] = _heapIdx[ln]; _heapF[0] = _heapF[ln];
        let i = 0;
        while (true) {
            let m = i, l = (i << 1) + 1, r = (i << 1) + 2;
            if (l < ln && _heapF[l] < _heapF[m]) m = l;
            if (r < ln && _heapF[r] < _heapF[m]) m = r;
            if (m === i) break;
            let t = _heapIdx[i]; _heapIdx[i] = _heapIdx[m]; _heapIdx[m] = t;
            let tf = _heapF[i]; _heapF[i] = _heapF[m]; _heapF[m] = tf;
            i = m;
        }
    }
    return top;
}

function _aStarGeneric(sx, sy, ex, ey, wlkFn, costFn, skipDiag) {
    if (!gPF || !gPF.land || !_aP) return null;
    sx = Math.max(0, Math.min(gPF.cols - 1, sx));
    sy = Math.max(0, Math.min(gPF.rows - 1, sy));
    ex = Math.max(0, Math.min(gPF.cols - 1, ex));
    ey = Math.max(0, Math.min(gPF.rows - 1, ey));
    if (!wlkFn(sx, sy)) return null;
    if (sx === ex && sy === ey) return [];

    // 新搜索：版本戳 +1（防溢出全清），堆清空
    if (++_aVer >= 2000000000) { _aVer = 1; _aSt.fill(0); }
    _heapLen = 0;
    _lastHeapPeak = 0;
    const cols = gPF.cols;
    const sk = sy * cols + sx, ek = ey * cols + ex;
    _aSt[sk] = _aVer; _aG[sk] = 0; _aP[sk] = -1;
    let adx = sx > ex ? sx - ex : ex - sx, ady = sy > ey ? sy - ey : ey - sy;
    const h0 = adx < ady ? adx * 0.414 + ady : ady * 0.414 + adx;
    _heapPush(sk, h0);
    let iters = 0;
    let bestKey = sk, bestDist = h0;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

    while (_heapLen && iters < MAX_ASTAR_ITER && _pfBudgetLeft > 0) {
        iters++;
        _pfBudgetLeft--;
        const ci = _heapPop();
        if (ci === ek) { bestKey = ek; break; }
        if (_aClosed[ci] === _aVer) continue;
        const cx = ci % cols, cy = (ci / cols) | 0;
        const hx = cx > ex ? cx - ex : ex - cx, hy = cy > ey ? cy - ey : ey - cy;
        const h = hx < hy ? hx * 0.414 + hy : hy * 0.414 + hx;
        // 陈旧条目检测（节点被更低 g 重新松弛后会再压入新条目）：f 与当前 g+h 不符则跳过
        if (Math.abs(_lastPopF - (_aG[ci] + h)) > 0.25) continue;
        if (h < bestDist) { bestDist = h; bestKey = ci; }
        _aClosed[ci] = _aVer;

        const gci = _aG[ci];
        for (let d = 0; d < 8; d++) {
            const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
            if (nx < 0 || nx >= gPF.cols || ny < 0 || ny >= gPF.rows) continue;
            if (!wlkFn(nx, ny)) continue;
            if (!skipDiag && d >= 4) {
                if (!wlkFn(cx + dirs[d][0], cy) && !wlkFn(cx, cy + dirs[d][1])) continue;
            }
            const nk = ny * cols + nx;
            const moveCost = d >= 4 ? 1.414 : 1.0;
            const ng = gci + moveCost * costFn(nx, ny);
            if (_aClosed[nk] === _aVer) continue; // 已扩展节点 g 已最优（一致性启发），跳过
            if (_aSt[nk] !== _aVer || ng < _aG[nk]) {
                _aSt[nk] = _aVer; _aG[nk] = ng; _aP[nk] = ci;
                const hdx = nx > ex ? nx - ex : ex - nx, hdy = ny > ey ? ny - ey : ey - ny;
                const hh = hdx < hdy ? hdx * 0.414 + hdy : hdy * 0.414 + hdx;
                _heapPush(nk, ng + hh);
            }
        }
    }

    const endKey = (_aSt[ek] === _aVer && _aP[ek] >= 0) ? ek : bestKey;
    _lastIters = iters;
    if (endKey === sk) return [];
    if (_aP[endKey] < 0) return null;
    const path = [];
    let p = endKey;
    while (p >= 0) {
        path.push({ x: p % cols, y: (p / cols) | 0 });
        p = _aP[p];
    }
    path.reverse();
    return path;
}

function aStar(sx, sy, ex, ey) {
    return _aStarGeneric(sx, sy, ex, ey, isWalkable, cellCost);
}
function navyAStar(sx, sy, ex, ey) {
    return _aStarGeneric(sx, sy, ex, ey, navyIsWalkable, navyCellCost);
}

// ===== 3. 路径简化（去共线） =====
function simplify(gpath) {
    if (!gpath || gpath.length < 3) return gpath;
    let r = [gpath[0]];
    for (let i = 1; i < gpath.length - 1; i++) {
        let prev = r[r.length - 1], cur = gpath[i], next = gpath[i + 1];
        let dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
        let dx2 = next.x - cur.x, dy2 = next.y - cur.y;
        let len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
        if (len1 < 0.01 || len2 < 0.01) continue;
        let dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
        if (dot < 0.995) r.push(cur);
    }
    r.push(gpath[gpath.length - 1]);
    return r;
}

// ===== 4. 寻路世界坐标接口 =====
function findPathCommon(fromX, fromY, toX, toY) {
    if (!gPF) buildPF();
    if (!gPF) return null;
    // Grid-based start check (代替 isLandPoint 多边形判断)
    let scx = lon2c(fromX), scy = lat2c(fromY);
    if (scx < 0 || scx >= gPF.cols || scy < 0 || scy >= gPF.rows || gPF.land[scy * gPF.cols + scx] === 0) return null;
    let ecx = lon2c(toX), ecy = lat2c(toY);
    if (ecx < 0 || ecx >= gPF.cols || ecy < 0 || ecy >= gPF.rows || gPF.land[ecy * gPF.cols + ecx] === 0) {
        let nl = nearestLand(toX, toY);
        if (!nl) return null;
        toX = nl[0]; toY = nl[1];
        ecx = lon2c(toX); ecy = lat2c(toY);
    }
    // 快速检查：起终点在同一国家且都不在海岸/边境缓冲区，走直线
    let sidx = scy * gPF.cols + scx, eidx = ecy * gPF.cols + ecx;
    let spid = gPF.owner[sidx], epid = gPF.owner[eidx];
    let sameCountry = spid && epid && spid === epid;
    let lowCost = gPF.cost[sidx] <= 1.0 && gPF.cost[eidx] <= 1.0;
    if (sameCountry && lowCost) {
        let dx = toX - fromX, dy = toY - fromY;
        let dist = Math.hypot(dx, dy);
        let coarseSteps = Math.max(3, Math.ceil(dist / (PF_CELL * 8)));
        let ok = true;
        for (let s = 1; s <= coarseSteps; s++) {
            let t = s / coarseSteps;
            let hcx = lon2c(fromX + dx * t), hcy = lat2c(fromY + dy * t);
            if (hcx < 0 || hcx >= gPF.cols || hcy < 0 || hcy >= gPF.rows) { ok = false; break; }
            let h = hcy * gPF.cols + hcx;
            if (gPF.land[h] === 0) { ok = false; break; }
            if (gPF.cost[h] > 1.0) { ok = false; break; }
            if (gPF.owner[h] !== spid) { ok = false; break; }
        }
        if (ok) return { wp: [{ x: toX, y: toY }], scx: null, scy: null, ecx: null, ecy: null, toX, toY };
    }
    // 常规检查：网格查询替代 isLandPoint
    let dx = toX - fromX, dy = toY - fromY;
    let dist = Math.hypot(dx, dy);
    let steps = Math.max(5, Math.ceil(dist / PF_CELL));
    let ok = true;
    for (let s = 1; s <= steps; s++) {
        let t = s / steps;
        let px = fromX + dx * t, py = fromY + dy * t;
        let hcx = lon2c(px), hcy = lat2c(py);
        if (hcx < 0 || hcx >= gPF.cols || hcy < 0 || hcy >= gPF.rows) { ok = false; break; }
        if (gPF.land[hcy * gPF.cols + hcx] === 0) { ok = false; break; }
        if (_pfCtx && gPF.owner) {
            let ownerProv = gPF.owner[hcy * gPF.cols + hcx];
            if (ownerProv) {
                let owner = G.provinceOwners[ownerProv];
                if (owner && owner !== _pfCtx.country) { ok = false; break; }
            }
        }
    }
    if (ok) return { wp: [{ x: toX, y: toY }], scx: null, scy: null, ecx: null, ecy: null, toX, toY };
    return { wp: null, scx, scy, ecx, ecy, toX, toY };
}
function findPath(fromX, fromY, toX, toY) {
    let r = findPathCommon(fromX, fromY, toX, toY);
    if (!r) return null;
    if (r.wp) return r.wp;
    let gp = aStar(r.scx, r.scy, r.ecx, r.ecy);
    if (!gp || gp.length === 0) return null;
    let sp = simplify(gp);
    let wp = [];
    for (let p of sp) wp.push({ x: c2lon(p.x), y: c2lat(p.y) });
    let lp = wp[wp.length - 1];
    let lcx = lon2c(lp.x), lcy = lat2c(lp.y);
    if (lcx === r.ecx && lcy === r.ecy) wp[wp.length - 1] = { x: r.toX, y: r.toY };
    return wp;
}

function findPathRaw(fromX, fromY, toX, toY) {
    let r = findPathCommon(fromX, fromY, toX, toY);
    if (!r) return null;
    if (r.wp) return r.wp;
    let gp = aStar(r.scx, r.scy, r.ecx, r.ecy);
    if (!gp || gp.length === 0) return null;

    // 构建完整网格路径 + 逐段高分辨率验证
    // 遇穿海或越界：将入海/越界格子永久封锁（cost=9999），返回 null 强制下一帧重算
    let prev = { x: c2lon(gp[0].x), y: c2lat(gp[0].y) };
    for (let i = 1; i < gp.length; i++) {
        let cur = gp[i];
        let cx = c2lon(cur.x), cy = c2lat(cur.y);
        let dx = cx - prev.x, dy = cy - prev.y;
        let segLen = Math.hypot(dx, dy);
        let steps = Math.max(2, Math.ceil(segLen / (PF_CELL * 0.5)));
        for (let s = 1; s <= steps; s++) {
            let t = s / steps;
            let px = prev.x + dx * t, py = prev.y + dy * t;
            let hcx = lon2c(px), hcy = lat2c(py);
            if (hcx < 0 || hcx >= gPF.cols || hcy < 0 || hcy >= gPF.rows) return null;
            let hidx = cellIdx(hcx, hcy);
            if (gPF.land[hidx] === 0) {
                if (gPF.cost[hidx] < 9999) {
                    gPF.cost[hidx] = 9999;
                    if (!gPF._blocked) gPF._blocked = [];
                    gPF._blocked.push({ x: hcx, y: hcy });
                }
                return null;
            }
            if (_pfCtx) {
                let ownerProv = gPF.owner[hidx];
                if (ownerProv) {
                    let owner = G.provinceOwners[ownerProv];
                    if (owner && !pfNationAllowed(_pfCtx.country, owner)) {
                        if (gPF.cost[hidx] < 9999) {
                            gPF.cost[hidx] = 9999;
                            if (!gPF._blocked) gPF._blocked = [];
                            gPF._blocked.push({ x: hcx, y: hcy });
                        }
                        return null;
                    }
                }
            }
        }
        prev = { x: cx, y: cy };
    }

    // 全部通过验证
    let wp = [{ x: c2lon(gp[0].x), y: c2lat(gp[0].y) }];
    for (let i = 1; i < gp.length; i++) wp.push({ x: c2lon(gp[i].x), y: c2lat(gp[i].y) });
    let lp = wp[wp.length - 1];
    let lcx = lon2c(lp.x), lcy = lat2c(lp.y);
    if (lcx === r.ecx && lcy === r.ecy) wp[wp.length - 1] = { x: r.toX, y: r.toY };
    return wp;
}

function _navyOk(lon, lat) {
    if (!gPF) return !isLandPoint(lon, lat);
    let cx = lon2c(lon), cy = lat2c(lat);
    if (cx < 0 || cx >= gPF.cols || cy < 0 || cy >= gPF.rows) return false;
    return gPF.navyLand[cy * gPF.cols + cx] === 1;
}

function navyFindPathCommon(fromX, fromY, toX, toY) {
    if (!gPF) buildPF();
    if (!gPF) return null;
    if (!_navyOk(fromX, fromY)) return null;
    if (!_navyOk(toX, toY)) {
        let nw = nearestWater(toX, toY);
        if (!nw) return null;
        toX = nw[0]; toY = nw[1];
    }
    let dx = toX - fromX, dy = toY - fromY;
    let dist = Math.hypot(dx, dy);
    let steps = Math.max(5, Math.ceil(dist / PF_CELL));
    let ok = true;
    for (let s = 1; s <= steps; s++) {
        let t = s / steps;
        if (!_navyOk(fromX + dx * t, fromY + dy * t)) { ok = false; break; }
    }
    if (ok) return { wp: [{ x: toX, y: toY }], scx: null, scy: null, ecx: null, ecy: null, toX, toY };
    let scx = lon2c(fromX), scy = lat2c(fromY);
    let ecx = lon2c(toX), ecy = lat2c(toY);
    return { wp: null, scx, scy, ecx, ecy, toX, toY };
}

function navyFindPathRaw(fromX, fromY, toX, toY) {
    let r = navyFindPathCommon(fromX, fromY, toX, toY);
    if (!r) return null;
    if (r.wp) return r.wp;
    let gp = navyAStar(r.scx, r.scy, r.ecx, r.ecy);
    if (!gp || gp.length === 0) return null;

    // 逐段验证：路径全程在水里（A* 的 navyCost 已处理沿岸避让）
    let prev = { x: c2lon(gp[0].x), y: c2lat(gp[0].y) };
    for (let i = 1; i < gp.length; i++) {
        let cur = gp[i];
        let cx = c2lon(cur.x), cy = c2lat(cur.y);
        let dx = cx - prev.x, dy = cy - prev.y;
        let segLen = Math.hypot(dx, dy);
        let steps = Math.max(2, Math.ceil(segLen / (PF_CELL * 0.5)));
        for (let s = 1; s <= steps; s++) {
            let t = s / steps;
            let px = prev.x + dx * t, py = prev.y + dy * t;
            if (!_navyOk(px, py)) return null;
        }
        prev = { x: cx, y: cy };
    }

    let wp = [{ x: c2lon(gp[0].x), y: c2lat(gp[0].y) }];
    for (let i = 1; i < gp.length; i++) wp.push({ x: c2lon(gp[i].x), y: c2lat(gp[i].y) });
    let lp = wp[wp.length - 1];
    let lcx = lon2c(lp.x), lcy = lat2c(lp.y);
    if (lcx === r.ecx && lcy === r.ecy) wp[wp.length - 1] = { x: r.toX, y: r.toY };
    return wp;
}

// ===== 5. 最近陆地 =====
function nearestLand(lon, lat, maxD) {
    if (maxD === undefined) maxD = 2.0;
    if (isLandPoint(lon, lat)) return [lon, lat];
    for (let d = PF_CELL; d <= maxD; d += PF_CELL) {
        let n = Math.max(4, Math.floor(2 * Math.PI * d / PF_CELL));
        for (let i = 0; i < n; i++) {
            let a = (i / n) * 2 * Math.PI;
            let lx = lon + Math.cos(a) * d, ly = lat + Math.sin(a) * d;
            if (isLandPoint(lx, ly)) return [lx, ly];
        }
    }
    return null;
}

// 最近水体（海军用）
function nearestWater(lon, lat, maxD) {
    if (maxD === undefined) maxD = 2.0;
    if (!isLandPoint(lon, lat)) return [lon, lat];
    for (let d = PF_CELL; d <= maxD; d += PF_CELL) {
        let n = Math.max(4, Math.floor(2 * Math.PI * d / PF_CELL));
        for (let i = 0; i < n; i++) {
            let a = (i / n) * 2 * Math.PI;
            let lx = lon + Math.cos(a) * d, ly = lat + Math.sin(a) * d;
            if (!isLandPoint(lx, ly)) return [lx, ly];
        }
    }
    return null;
}

// ===== 6. 完全覆盖 moveUnits =====
moveUnits = function(days) {
    let ed = Math.min(Math.max(days, 0.0001), 0.04);
    _pfCount = 0;

    // 6a. 初始化位置
    for (let d of G.divisions) {
        if (d.rx === undefined) {
            let pd = G.provinceData[d.province];
            if (pd && pd.center) { d.rx = pd.center[0]; d.ry = pd.center[1]; }
        }
    }

    // 6c. 陆军移动（航点跟随 + 入海倒退 + 卡死重算）
    for (let d of G.divisions) {
        if (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') continue;
        if (d.state !== 'moving' || d.targetX === null) continue;
        if (d.rx === undefined) continue;
        // 铁路运兵单位（步行接驳/乘车）由 game_core 的 moveRailUnit 统一处理
        if (d.railTrip) { moveRailUnit(d, ed); continue; }

        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        let spd = ut.speed * ed * 2.5;

        // ===== 补给惩罚（断粮/短缺） =====
        if (d.supplyStatus === 'starve' && typeof GRAIN_STARVE !== 'undefined') spd *= GRAIN_STARVE.speed;
        else if (d.supplyStatus === 'low' && typeof GRAIN_LOW !== 'undefined') spd *= GRAIN_LOW.speed;

        // ===== 水中央倒退（不瞬移）——空军可飞越水域，跳过 =====
        if (!_onLandGrid(d.rx, d.ry) && d.type !== 'airplane') {
            if (!d._retreatDir) {
                // 第一次入海：记住来路方向
                let bx = d._prevX || d.rx, by = d._prevY || d.ry;
                let bdx = bx - d.rx, bdy = by - d.ry;
                let bd = Math.hypot(bdx, bdy);
                if (bd < 0.0001) { bdx = 0; bdy = -PF_CELL; bd = PF_CELL; }
                d._retreatDir = { x: bdx / bd, y: bdy / bd };
                d.path = null;
            }
            d.rx += d._retreatDir.x * spd * 2;
            d.ry += d._retreatDir.y * spd * 2;
            // 回到陆地后清除倒退状态，触发重算路径
            if (_onLandGrid(d.rx, d.ry)) {
                d._retreatDir = undefined;
                d._stuck = STUCK_FRAMES; // 下一帧立即重算
            }
            d._prevX = d.rx; d._prevY = d.ry;
            continue;
        } else if (d._retreatDir) {
            d._retreatDir = undefined;
        }

        // 目标在水上：陆军修正到最近陆地；空军直接飞过去
        if (!_onLandGrid(d.targetX, d.targetY) && d.type !== 'airplane') {
            let nl = nearestLand(d._finalTargetX || d.targetX, d._finalTargetY || d.targetY);
            if (nl) { d._finalTargetX = nl[0]; d._finalTargetY = nl[1]; d.targetX = nl[0]; d.targetY = nl[1]; }
            else { d.state = 'idle'; continue; }
        }

        // ===== 航点推进 =====
        if (d.path && d.pathIndex < (d.path.length || 0)) {
            let wp = d.path[d.pathIndex];
            let wd = Math.hypot(d.rx - wp.x, d.ry - wp.y);
            let thr = PF_CELL * 0.6;
            if (wd < thr) {
                d.pathIndex++;
                if (d.pathIndex >= d.path.length) {
                    d.path = null;
                    if (d._finalTargetX !== undefined && Math.hypot(d.rx - d._finalTargetX, d.ry - d._finalTargetY) > 0.02) {
                        d.targetX = d._finalTargetX; d.targetY = d._finalTargetY;
                    }
                } else {
                    d.targetX = d.path[d.pathIndex].x; d.targetY = d.path[d.pathIndex].y;
                }
            } else {
                d.targetX = wp.x; d.targetY = wp.y;
            }
        }

        // ===== 海岸减速（空军无视） =====
        if (d.type !== 'airplane' && gPF && gPF.cost && _onLandGrid(d.rx, d.ry)) {
            let cx = lon2c(d.rx), cy = lat2c(d.ry);
            if (cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows) {
                let c = gPF.cost[cy * gPF.cols + cx];
                if (c >= 3.0) spd *= 0.5;
                else if (c >= 2.0) spd *= 0.7;
                else if (c >= 1.3) spd *= 0.85;
            }
        }

        // ===== 山地减速（按兵种，山地师团几乎免疫；空军无视地形） =====
        if (d.type !== 'airplane' && typeof terrainAt === 'function') {
            let _t = terrainAt(d.rx, d.ry);
            if (_t === 'mountains') {
                let _mv = (typeof MOUNTAIN_MOVE_BY_TYPE !== 'undefined' && MOUNTAIN_MOVE_BY_TYPE[d.type]) ? MOUNTAIN_MOVE_BY_TYPE[d.type] : ((typeof TERRAIN_MOVE !== 'undefined' && TERRAIN_MOVE.mountains) || 0.55);
                spd *= _mv;
            } else if (_t === 'flat' && typeof TERRAIN_MOVE !== 'undefined' && TERRAIN_MOVE.flat) {
                spd *= TERRAIN_MOVE.flat;
            }
        }

        // ===== 移动 =====
        let dx = d.targetX - d.rx, dy = d.targetY - d.ry;
        let dist = Math.hypot(dx, dy);
        if (dist > spd) { d.rx += (dx / dist) * spd; d.ry += (dy / dist) * spd; }
        else { d.rx = d.targetX; d.ry = d.targetY; d.state = 'idle'; d.targetX = null; d.targetY = null; d.path = null; }
        d.moveDx = dx;
        // 更新朝向
        if (Math.abs(dx) > Math.abs(dy)) {
            d.facing = dx > 0 ? 'e' : 'w';
        } else {
            d.facing = dy > 0 ? 's' : 'n';
        }

        // ===== 卡死检测（阈值为当帧最大移动距离的10%，低倍速不误判） =====
        if (d._prevX !== undefined && d._prevY !== undefined) {
            let minMove = Math.max(0.00005, spd * 0.1);
            if (Math.hypot(d.rx - d._prevX, d.ry - d._prevY) < minMove) {
                d._stuck = (d._stuck || 0) + 1;
            } else {
                d._stuck = 0;
            }
        }

        // ===== 外交边界检查（陆军禁止越界；空军飞越国界） =====
        if (d.type !== 'airplane' && gPF && gPF.owner) {
            let cx = lon2c(d.rx), cy = lat2c(d.ry);
            if (cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows) {
                let ownerProv = gPF.owner[cy * gPF.cols + cx];
                if (ownerProv) {
                    let owner = G.provinceOwners[ownerProv];
                    if (owner && !pfNationAllowed(d.country, owner)) {
                        // 越界：回退一帧 + 立即重算（不再蹭边境等 15 帧）
                        d.rx = d._prevX !== undefined ? d._prevX : d.rx;
                        d.ry = d._prevY !== undefined ? d._prevY : d.ry;
                        d._stuck = STUCK_FRAMES;
                        d.path = null;
                    }
                }
            }
        }

        d._prevX = d.rx; d._prevY = d.ry;
    }

    // 6c2. 海军/潜艇移动（结构与陆军对称，但水/陆逻辑相反）
    for (let d of G.divisions) {
        if (d.formation === 'line') continue; // 一字阵由 6c3 整队驱动
        if (typeof isSeaType === 'function' ? !isSeaType(d.type) : d.type !== 'navy') continue;
        if (d.state !== 'moving' || d.targetX === null) continue;
        if (d.rx === undefined) continue;

        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.battleship;
        let spd = ut.speed * ed * 2.5;

        // ===== 搁浅倒退 =====
        if (!_onNavyGrid(d.rx, d.ry)) {
            if (!d._retreatDir) {
                let bx = d._prevX || d.rx, by = d._prevY || d.ry;
                let bdx = bx - d.rx, bdy = by - d.ry;
                let bd = Math.hypot(bdx, bdy);
                if (bd < 0.0001) { bdx = 0; bdy = -PF_CELL; bd = PF_CELL; }
                d._retreatDir = { x: bdx / bd, y: bdy / bd };
                d.path = null;
            }
            d.rx += d._retreatDir.x * spd * 2;
            d.ry += d._retreatDir.y * spd * 2;
            if (_onNavyGrid(d.rx, d.ry)) {
                d._retreatDir = undefined;
                d._stuck = STUCK_FRAMES;
            }
            d._prevX = d.rx; d._prevY = d.ry;
            continue;
        } else if (d._retreatDir) {
            d._retreatDir = undefined;
        }

        if (!_onNavyGrid(d.targetX, d.targetY)) {
            let nw = nearestWater(d._finalTargetX || d.targetX, d._finalTargetY || d.targetY);
            if (nw) { d._finalTargetX = nw[0]; d._finalTargetY = nw[1]; d.targetX = nw[0]; d.targetY = nw[1]; }
            else { d.state = 'idle'; continue; }
        }

        // ===== 航点推进 =====
        if (d.path && d.pathIndex < (d.path.length || 0)) {
            let wp = d.path[d.pathIndex];
            let wd = Math.hypot(d.rx - wp.x, d.ry - wp.y);
            let thr = PF_CELL * 0.6;
            if (wd < thr) {
                d.pathIndex++;
                if (d.pathIndex >= d.path.length) {
                    d.path = null;
                    if (d._finalTargetX !== undefined && Math.hypot(d.rx - d._finalTargetX, d.ry - d._finalTargetY) > 0.02) {
                        d.targetX = d._finalTargetX; d.targetY = d._finalTargetY;
                    }
                } else {
                    d.targetX = d.path[d.pathIndex].x; d.targetY = d.path[d.pathIndex].y;
                }
            } else {
                d.targetX = wp.x; d.targetY = wp.y;
            }
        }

        // ===== 近岸减速 =====
        if (gPF && gPF.navyCost) {
            let cx = lon2c(d.rx), cy = lat2c(d.ry);
            if (cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows) {
                let c = gPF.navyCost[cy * gPF.cols + cx];
                if (c >= 3.0) spd *= 0.5;
                else if (c >= 2.0) spd *= 0.7;
            }
        }

        // ===== 移动（寻路已验证距陆，移动层无附加校验） =====
        let dx = d.targetX - d.rx, dy = d.targetY - d.ry;
        let dist = Math.hypot(dx, dy);
        if (dist > spd) { d.rx += (dx / dist) * spd; d.ry += (dy / dist) * spd; }
        else { d.rx = d.targetX; d.ry = d.targetY; d.state = 'idle'; d.targetX = null; d.targetY = null; d.path = null; }
        d.moveDx = dx;
        // 更新朝向（海军）
        if (Math.abs(dx) > Math.abs(dy)) {
            d.facing = dx > 0 ? 'e' : 'w';
        } else {
            d.facing = dy > 0 ? 's' : 'n';
        }

        // ===== 卡死检测（同陆军，比例阈值） =====
        if (d._prevX !== undefined && d._prevY !== undefined) {
            let minMove = Math.max(0.00005, spd * 0.1);
            if (Math.hypot(d.rx - d._prevX, d.ry - d._prevY) < minMove) {
                d._stuck = (d._stuck || 0) + 1;
            } else {
                d._stuck = 0;
            }
        }
        d._prevX = d.rx; d._prevY = d.ry;
    }

    // 6c3. 一字阵型：阵线朝向固定、无命令静止不动、新船补两端、移动时整队平移
    let formDivs = G.divisions.filter(d => d.formation === 'line' && (typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy'));
    if (formDivs.length > 1) {
        let groups = {};
        for (let d of formDivs) {
            let gid = d.formationGroup || 'default';
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(d);
        }
        let metaMap = window._formMetaMap || (window._formMetaMap = {});
        for (let gid in groups) {
            let group = groups[gid];
            if (group.length < 2) continue;
            // 阵型元数据：阵线方向（垂直前进方向）跨帧固定
            let g = metaMap[gid];
            if (!g) {
                let avgDx = 0, avgDy = 0, cnt = 0;
                for (let d of group) {
                    if (d.targetX !== null) { avgDx += d.targetX - d.rx; avgDy += d.targetY - d.ry; cnt++; }
                }
                if (cnt === 0) {
                    if (group[0]._lastMoveDx !== undefined) { avgDx = group[0]._lastMoveDx; avgDy = group[0]._lastMoveDy; }
                    else { avgDx = 1; avgDy = 0; }
                }
                let dl = Math.hypot(avgDx, avgDy);
                if (dl < 0.001) { avgDx = 1; avgDy = 0; }
                else { avgDx /= dl; avgDy /= dl; }
                g = metaMap[gid] = { dirX: -avgDy, dirY: avgDx };
                // 惰性分配 formationIndex：沿阵线方向排序，中心为 0、奇数步长（offset = idx*spacing/2）
                let ax = 0, ay = 0;
                for (let d of group) { ax += d.rx; ay += d.ry; }
                ax /= group.length; ay /= group.length;
                let order = group.slice().sort((a, b) => {
                    let pa = (a.rx - ax) * g.dirX + (a.ry - ay) * g.dirY;
                    let pb = (b.rx - ax) * g.dirX + (b.ry - ay) * g.dirY;
                    return pa - pb;
                });
                order.forEach((d, i) => d.formationIndex = i * 2 - (order.length - 1));
            }
            // 新成员补两端（优先补人少的一侧，绝不插中间）
            for (let d of group) {
                if (d.formationIndex === undefined || d.formationIndex === null) {
                    let idxs = group.filter(x => x.formationIndex !== undefined && x.formationIndex !== null).map(x => x.formationIndex);
                    if (idxs.length === 0) { d.formationIndex = 0; continue; }
                    let left = idxs.filter(i => i < 0).length, right = idxs.filter(i => i > 0).length;
                    let mn = Math.min(...idxs), mx = Math.max(...idxs);
                    d.formationIndex = left <= right ? mn - 2 : mx + 2;
                }
            }
            // 无移动命令：保持一字阵静止，不强制归位
            let movers = group.filter(d => d.targetX !== null);
            if (movers.length === 0) continue;
            // 锚船 = 居中的舰（|formationIndex| 最小）；命令点取锚船或任一移动船
            let anchor = group.slice().sort((a, b) => Math.abs(a.formationIndex) - Math.abs(b.formationIndex))[0];
            let leader = movers.includes(anchor) ? anchor : movers[0];
            let tgtX = leader.targetX, tgtY = leader.targetY;
            let spacing = 0.12;
            let allArrived = true;
            for (let d of group) {
                // 各船目标 = 锚船命令点 + 保持相对阵线偏移（整体平移，阵线朝向不变）
                let relOff = (d.formationIndex - anchor.formationIndex) * spacing / 2;
                let targetX = tgtX + g.dirX * relOff;
                let targetY = tgtY + g.dirY * relOff;
                let dx = targetX - d.rx, dy = targetY - d.ry;
                let dist = Math.hypot(dx, dy);
                if (dist > 0.001) {
                    let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
                    let spd = ut.speed * ed * 2.5;
                    if ((typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy') && d.navySpd !== undefined) spd = d.navySpd * ed * 2.5;
                    spd *= 2;
                    if (dist > spd) {
                        d.rx += (dx / dist) * spd; d.ry += (dy / dist) * spd;
                        allArrived = false;
                        if (Math.abs(dx) > Math.abs(dy)) d.facing = dx > 0 ? 'e' : 'w';
                        else d.facing = dy > 0 ? 's' : 'n';
                    } else {
                        d.rx = targetX; d.ry = targetY;
                    }
                }
            }
            // 整队到位：清除命令，保持一字阵静止
            if (allArrived) {
                for (let d of movers) { d.targetX = null; d.targetY = null; d.state = 'idle'; d.path = null; }
            }
        }
    }

    // 6c4. 碰撞分离（原版在 _origMoveUnits 内，但 6b 恢复了位置）
    // 空间网格分桶（0.25°），只检查同格+邻格，避免 O(N²) 两两配对
    // 乘车中（on_train）单位不受推挤；步行接驳/普通单位照常受单位间分离影响
    let separation = 0.037;
    {
        let SC = 0.25;
        let sepBuckets = Object.create(null);
        for (let d of G.divisions) {
            if (d.rx === undefined) continue;
            let k = Math.floor(d.rx / SC) + ',' + Math.floor(d.ry / SC);
            (sepBuckets[k] || (sepBuckets[k] = [])).push(d);
        }
        for (let d of G.divisions) {
            if (d.rx === undefined) continue;
            if (d.railTrip && d.railTrip.stage === 'on_train') continue;
            let bx = Math.floor(d.rx / SC), by = Math.floor(d.ry / SC);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    let b = sepBuckets[(bx + dx) + ',' + (by + dy)];
                    if (!b) continue;
                    for (let e of b) {
                        if (d.id >= e.id) continue;
                        if (e.railTrip && e.railTrip.stage === 'on_train') continue;
                        let sdx = d.rx - e.rx;
                        if (Math.abs(sdx) > separation) continue;
                        let sdy = d.ry - e.ry;
                        if (Math.abs(sdy) > separation) continue;
                        let dist = Math.hypot(sdx, sdy);
                        if (dist < separation && dist > 0.001) {
                            let push = (separation - dist) / separation * 0.01;
                            let nx = sdx / dist, ny = sdy / dist;
                            d.rx += nx * push; d.ry += ny * push;
                            e.rx -= nx * push; e.ry -= ny * push;
                        }
                    }
                }
            }
        }
    }

    // 6c5. 建筑碰撞分离（只对城市生效，碰撞箱=选中圈大小）
    // 战略缩放时裁剪小城市（仅首都/大城市参与），减少 O(城×师) 开销
    {
        let bEffZoom = typeof zoom !== 'undefined' ? Math.max(zoom, typeof TACTICAL_ZOOM !== 'undefined' ? TACTICAL_ZOOM : 1.8) : 1.8;
        let PPD = typeof PIXELS_PER_DEGREE !== 'undefined' ? PIXELS_PER_DEGREE : 100;

        if (typeof CITIES !== 'undefined') {
            for (let city of CITIES) {
                let cityData = G.cities[city.id];
                if (!cityData || cityData.hp <= 0) continue;
                if (!city.isCapital && (typeof zoom === 'undefined' || zoom <= 0.35)) continue;
                let isMajor = (typeof _MAJOR_CITIES !== 'undefined' && _MAJOR_CITIES.has(city.id)) || (typeof isMajorCity === 'function' && isMajorCity(city.id));
                if (!city.isCapital && !isMajor && (typeof zoom === 'undefined' || zoom <= 0.7)) continue;
                // 选中圈=碰撞箱=点击圈：首都 2.5*effZoom，大城市 4.5*effZoom，小城市 2.5*effZoom
                let selR = city.isCapital ? 2.5 * bEffZoom : (isMajor ? 4.5 * bEffZoom : 2.5 * bEffZoom);
                let bR = selR / (zoom * PPD);

                for (let d of G.divisions) {
                    if (d.rx === undefined) continue;
                    // 乘车中（on_train）不受建筑推挤
                    if (d.railTrip && d.railTrip.stage === 'on_train') continue;
                    // 步行接驳：目标车站不推挤（否则永远到不了站）；其他建筑推挤照常
                    if (d.railTrip && d.railTrip.stage === 'walk_to_station' && d.targetX === city.lon && d.targetY === city.lat) continue;
                    let sdx = d.rx - city.lon;
                    let sdy = d.ry - city.lat;
                    let dist = Math.hypot(sdx, sdy);
                    let minDist = bR;
                    if (dist < minDist && dist > 0.001) {
                        let push = (minDist - dist) / minDist * 0.05;
                        let nx = sdx / dist, ny = sdy / dist;
                        d.rx += nx * push; d.ry += ny * push;
                    }
                }
            }
        }
    }

    // 6d. 寻路排程
    _pfReq = [];
    for (let d of G.divisions) {
        if (d.state !== 'moving' || d.targetX === null) continue;
        if (d.path && d.path.length > 0) continue;
        if (d.rx === undefined) continue;
        let isNavy = typeof isSeaType === 'function' ? isSeaType(d.type) : d.type === 'navy';
        let stuck = (d._stuck || 0) >= STUCK_FRAMES;
        let needPath = !d.path || d.path.length === 0;
        if (stuck || needPath) {
            let tx = d._finalTargetX || d.targetX;
            let ty = d._finalTargetY || d.targetY;
            if (Math.hypot(tx - d.rx, ty - d.ry) < 0.03) continue;
            // 快速检查：起终点同国且不在缓冲区，走直线
            let directOk = false;
            if (!isNavy && gPF && gPF.owner && gPF.cost) {
                let scx = lon2c(d.rx), scy = lat2c(d.ry), ecx = lon2c(tx), ecy = lat2c(ty);
                if (scx >= 0 && scx < gPF.cols && scy >= 0 && scy < gPF.rows && ecx >= 0 && ecx < gPF.cols && ecy >= 0 && ecy < gPF.rows) {
                    let spid = gPF.owner[scy * gPF.cols + scx], epid = gPF.owner[ecy * gPF.cols + ecx];
                    // 起点/终点同省份（必然同国）且两侧 cost 无惩罚 → 可直线
                    if (spid && epid && spid === epid && gPF.cost[scy * gPF.cols + scx] <= 1.0 && gPF.cost[ecy * gPF.cols + ecx] <= 1.0) {
                        directOk = true;
                    }
                }
            }
            if (!directOk) {
                let steps = Math.max(3, Math.ceil(Math.hypot(tx - d.rx, ty - d.ry) / (PF_CELL * 4)));
                directOk = true;
                for (let s = 1; s <= steps; s++) {
                    let t = s / steps;
                    let px = d.rx + (tx - d.rx) * t, py = d.ry + (ty - d.ry) * t;
                    if (isNavy) {
                        if (!_onNavyGrid(px, py)) { directOk = false; break; }
                    } else {
                        if (!_onLandGrid(px, py)) { directOk = false; break; }
                        // 国境检查：直线途经的外国领土必须允许通行，否则交给 A* 绕行
                        if (gPF && gPF.owner) {
                            let hcx = lon2c(px), hcy = lat2c(py);
                            if (hcx >= 0 && hcx < gPF.cols && hcy >= 0 && hcy < gPF.rows) {
                                let op = gPF.owner[hcy * gPF.cols + hcx];
                                if (op) {
                                    let owner = G.provinceOwners[op];
                                    if (owner && !pfNationAllowed(d.country, owner)) { directOk = false; break; }
                                }
                            }
                        }
                    }
                }
            }
            if (directOk && !stuck) continue;
            _pfReq.push({ d: d, tx: tx, ty: ty, navy: isNavy });
        }
    }

    // 6e. 执行寻路（共享每帧迭代预算 + 同目标/同区域/同国家路径缓存）
    // 预算：A* 按迭代计费，本帧总迭代上限 PF_FRAME_BUDGET（约 1-2ms），
    // 单个搜索切片 4000 迭代；切片用尽时返回最优可行部分路径，单位先移动、下帧续算。
    let budget = PF_FRAME_BUDGET;
    for (let i = 0; i < _pfReq.length && _pfCount < MAX_ASTAR_PER_FRAME && budget > 0; i++) {
        let r = _pfReq[i];
        let isNavy = r.navy;
        let costArr = (gPF && (isNavy ? gPF.navyCost : gPF.cost)) || null;
        let blockedKey = isNavy ? '_navyBlockedCell' : '_blockedCell';
        // 卡死时封锁当前格
        if (r.d._stuck >= STUCK_FRAMES && gPF && costArr) {
            let cx = lon2c(r.d.rx), cy = lat2c(r.d.ry);
            if (cx >= 0 && cx < gPF.cols && cy >= 0 && cy < gPF.rows) {
                let idx = cellIdx(cx, cy);
                if (costArr[idx] < 9999) {
                    r.d[blockedKey] = { x: cx, y: cy, cost: costArr[idx] };
                    costArr[idx] = 9999;
                }
            }
        }
        // 路径缓存：起始格量化到 8×8 格（≈0.32°），同目标+同区域+同国家共享路径
        let ckey = null;
        let wp = null;
        if (gPF) {
            let ecx = lon2c(r.tx), ecy = lat2c(r.ty);
            if (ecx >= 0 && ecx < gPF.cols && ecy >= 0 && ecy < gPF.rows) {
                let qsx = Math.floor(lon2c(r.d.rx) / 8), qsy = Math.floor(lat2c(r.d.ry) / 8);
                ckey = (isNavy ? 'n|' : 'l|') + qsx + ',' + qsy + '|' + ecx + ',' + ecy + '|' + r.d.country;
                let ent = _pfCache.get(ckey);
                if (ent && performance.now() - ent.at < PF_CACHE_TTL) {
                    if (_pfCacheValid(ent.wp, isNavy, r.d.rx, r.d.ry)) {
                        wp = ent.wp;
                    } else {
                        _pfCache.delete(ckey);
                    }
                }
            }
        }
        if (!wp) {
            _pfBudgetLeft = Math.min(PF_SEARCH_SLICE, budget);
            _pfCtx = { country: r.d.country };
            wp = isNavy ? navyFindPathRaw(r.d.rx, r.d.ry, r.tx, r.ty) : findPathRaw(r.d.rx, r.d.ry, r.tx, r.ty);
            _pfCtx = null;
            budget -= (PF_SEARCH_SLICE - Math.max(0, _pfBudgetLeft));
            if (ckey && wp && wp.length > 0) {
                if (_pfCache.size >= 256) {
                    const fk = _pfCache.keys().next().value;
                    if (fk !== undefined) _pfCache.delete(fk);
                }
                _pfCache.set(ckey, { wp: wp, at: performance.now() });
            }
        }
        if (r.d[blockedKey]) {
            let bc = r.d[blockedKey];
            if (bc.x >= 0 && bc.x < gPF.cols && bc.y >= 0 && bc.y < gPF.rows) {
                costArr[cellIdx(bc.x, bc.y)] = bc.cost;
            }
            delete r.d[blockedKey];
        }
        _pfCount++;
        r.d._stuck = 0;
        if (wp && wp.length > 0) {
            r.d.path = wp; r.d.pathIndex = 0;
            r.d.targetX = wp[0].x; r.d.targetY = wp[0].y;
            let lw = wp[wp.length - 1];
            r.d._finalTargetX = lw.x; r.d._finalTargetY = lw.y;
        } else {
            let onLand = isNavy ? !_onNavyGrid(r.d.rx, r.d.ry) : _onLandGrid(r.d.rx, r.d.ry);
            if (!onLand) {
                r.d.state = 'moving'; // 在正确介质中，下帧重试
            } else {
                r.d.state = 'idle'; r.d.targetX = null; r.d.targetY = null; r.d.path = null;
            }
        }
    }
    // findPathRaw 的永久封锁不需要恢复
    // gPF._blocked 留作记录（或用于调试）
};

// ===== 7. 外部接口 =====
function assignPath(div, wx, wy) {
    if (!div || div.strength <= 0) return;
    if (typeof isSeaType === 'function' ? isSeaType(div.type) : div.type === 'navy') {
        if (!_onNavyGrid(wx, wy)) {
            let nw = nearestWater(wx, wy);
            if (!nw) { div.state = 'idle'; return; }
            wx = nw[0]; wy = nw[1];
        }
        div._finalTargetX = wx; div._finalTargetY = wy;
        div.path = null; div.targetX = wx; div.targetY = wy;
        div._stuck = 0; div.state = 'moving';
        return;
    }
    let nl = nearestLand(wx, wy);
    if (!nl) { div.state = 'idle'; return; }
    div._finalTargetX = nl[0]; div._finalTargetY = nl[1];
    div.path = null; div.targetX = nl[0]; div.targetY = nl[1];
    div._stuck = 0; div.state = 'moving';
}
function aiMoveTo(div, tx, ty) { assignPath(div, tx, ty); }
// AI 移动到目标点（走寻路）。
// 修复历史遗漏：ai_controller.js 大量调用 aiMoveToTarget 但从未定义，此前全部落到
// 直线移动 fallback（绕过 A*，导致 AI 穿山过河）；现补上走寻路的正式实现。
// 注意：headless 验证时若此函数引发原生崩溃，先检查 buildPF 是否完成（gPF 为 null 时
// assignPath → nearestLand 可能访问未初始化网格）。
function aiMoveToTarget(div, tx, ty) { aiMoveTo(div, tx, ty); }
function aiMoveToEnemy(div, enemy) {
    if (!div || !enemy || enemy.strength <= 0) return;
    let ut = UNIT_TYPES[div.type] || UNIT_TYPES.infantry;
    let dd = ut.range * 0.85;
    let dx = enemy.rx - div.rx, dy = enemy.ry - div.ry;
    let dist = Math.hypot(dx, dy);
    let tx = dist > dd ? div.rx + (dx / dist) * (dist - dd) : enemy.rx;
    let ty = dist > dd ? div.ry + (dy / dist) * (dist - dd) : enemy.ry;
    assignPath(div, tx, ty);
}

// ===== 8. 兼容旧调用 =====
function updatePathfinding(days) {}

// ===== 9. 启动 =====
if (typeof PROVINCES !== 'undefined') setTimeout(buildPF, 0);
// 测试钩子：设置 A* 帧预算（生产环境由 moveUnits 6e 每帧管理）
if (typeof window !== 'undefined') window._pfSetBudget = function (v) { _pfBudgetLeft = v; };
if (typeof window !== 'undefined') window._pfDebug = function () { return { iters: _lastIters, heapPeak: _lastHeapPeak, budget: _pfBudgetLeft }; };
