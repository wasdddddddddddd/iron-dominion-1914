// ============================================================
//  Iron & Dominion 1914 — 国际贸易系统（伦敦市场）
//  出口从国家总量扣除（仅计连接首都的城市：铁路连通 或 港口无封锁）
//  伦敦定价 = f(全球库存)：有效库存 = 全局库存×30%，缺货系数驱动价格
// ============================================================

// 可贸易国家：15 个地图国家 + 3 个离岸大国（美国/中国/日本，无地图实体，库存为固定虚拟份额）
const MARKET_TRADABLE = [
    'GERMANY','FRANCE','UK','AUSTRIA_HUNGARY','ITALY','RUSSIA','TURKEY','SPAIN',
    'BELGIUM','NETHERLANDS','SWITZERLAND','SWEDEN','ROMANIA','BULGARIA','GREECE',
    'USA','CHINA','JAPAN',
];
const MARKET_VIRTUAL_CN = { USA:'美国', CHINA:'中国', JAPAN:'日本' };
// 虚拟国占「开局全球库存」的固定份额（美国 30% 为需求固定参数，中国/日本按 1914 世界规模适配）
const MARKET_VIRTUAL_SHARE = { USA: 0.30, CHINA: 0.10, JAPAN: 0.05 };
const MARKET_BASE_TAX = 15;   // 默认基准税率 %
const MARKET_TAX_MIN = 0;
const MARKET_TAX_MAX = 30;
const MARKET_EXPORT_RATIO = 0.30;   // 单次出口 ≤ 国家总量×30%
const MARKET_PRICE_GRAIN_BASE = 40;
const MARKET_PRICE_IRON_BASE = 80;
const MARKET_PRICE_GRAIN_MIN = 15, MARKET_PRICE_GRAIN_MAX = 200;
const MARKET_PRICE_IRON_MIN = 25, MARKET_PRICE_IRON_MAX = 350;
const MARKET_AI_EXPORT_TH = 0.60;   // AI 库存 > 上限×60% 自动出口
const MARKET_AI_IMPORT_TH = 0.30;   // AI 库存 < 上限×30% 尝试进口

function marketState() {
    if (!G.market) {
        G.market = { _v: 1 };
    }
    let m = G.market;
    if (!m.virtual) {
        m.virtual = {};
        for (let code in MARKET_VIRTUAL_SHARE) {
            m.virtual[code] = { grain: 0, iron: 0 };
        }
    }
    if (!m.init) m.init = { grain: 0, iron: 0 };
    if (!m.quotes) m.quotes = { grain: MARKET_PRICE_GRAIN_BASE, iron: MARKET_PRICE_IRON_BASE, totalGrain: 0, totalIron: 0, effGrain: 0, effIron: 0 };
    if (m.baseTax === undefined) m.baseTax = MARKET_BASE_TAX;
    if (!m.overrides) m.overrides = {};
    if (m.acc === undefined) m.acc = 0;
    if (m.sel === undefined) m.sel = 500;
    if (m.custom === undefined) m.custom = 0;
    if (m.customFocus === undefined) m.customFocus = false;
    if (m.monthKey === undefined || !m.monthKey) m.monthKey = marketMonthKey();
    if (m.thisMonth === undefined) m.thisMonth = 0;
    if (m.lastMonth === undefined) m.lastMonth = 0;
    if (m.scroll === undefined) m.scroll = 0;
    if (!m.aiTax) m.aiTax = {};
    if (!m._initDone) {
        // 开局基线：城市开局统一为 grainMax×0.8（initCities），以此作为「开局全球库存」
        // 开局全球库存 = Σ城市库存 + Σ虚拟国份额（美国 30% 计入）
        let g0 = 0, i0 = 0;
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c) continue;
            g0 += c.grain || 0;
            i0 += c.iron || 0;
        }
        let vg = 0, vi = 0;
        for (let code in MARKET_VIRTUAL_SHARE) {
            m.virtual[code].grain = Math.round(g0 * MARKET_VIRTUAL_SHARE[code]);
            m.virtual[code].iron = Math.round(i0 * MARKET_VIRTUAL_SHARE[code]);
            vg += m.virtual[code].grain;
            vi += m.virtual[code].iron;
        }
        m.init.grain = g0 + vg;
        m.init.iron = i0 + vi;
        m._initDone = true;
    }
    return m;
}

// 当前月份键（年×12+月），用于月度统计滚动
function marketMonthKey() {
    let d = G.date || new Date();
    return d.getFullYear() * 12 + (d.getMonth() + 1);
}

// 全球库存：Σ 所有城市实时库存 + 虚拟离岸大国库存
function marketGlobalStock(m) {
    let g = 0, i = 0;
    for (let cid in G.cities) {
        let c = G.cities[cid];
        if (!c) continue;
        g += c.grain || 0;
        i += c.iron || 0;
    }
    for (let code in m.virtual) {
        g += m.virtual[code].grain || 0;
        i += m.virtual[code].iron || 0;
    }
    return { grain: g, iron: i };
}

// 伦敦定价（每日刷新）：有效库存 = 全局×30%；库存比 = 有效÷开局有效（30% 约分）
// 缺货系数 = (1−库存比)×2；价格 = 基价×(1+缺货系数)²，截断 [min,max]
function marketCompute(m) {
    let { grain, iron } = marketGlobalStock(m);
    let initG = m.init.grain || 1, initI = m.init.iron || 1;
    let rg = Math.max(0.05, grain / initG), ri = Math.max(0.05, iron / initI);
    let sg = Math.max(0, (1 - rg) * 2), si = Math.max(0, (1 - ri) * 2);
    let pg = MARKET_PRICE_GRAIN_BASE * Math.pow(1 + sg, 2);
    let pi = MARKET_PRICE_IRON_BASE * Math.pow(1 + si, 2);
    pg = Math.max(MARKET_PRICE_GRAIN_MIN, Math.min(MARKET_PRICE_GRAIN_MAX, pg));
    pi = Math.max(MARKET_PRICE_IRON_MIN, Math.min(MARKET_PRICE_IRON_MAX, pi));
    m.quotes.grain = Math.round(pg * 10) / 10;
    m.quotes.iron = Math.round(pi * 10) / 10;
    m.quotes.totalGrain = grain;
    m.quotes.totalIron = iron;
    m.quotes.effGrain = grain * 0.3;
    m.quotes.effIron = iron * 0.3;
}

// 玩家实际税率：国别覆盖（若有）否则基准
function marketTaxFor(m, code) {
    let t = m.overrides[code];
    return (t === undefined || t === null) ? m.baseTax : t;
}

// 国家可贸易总量（连接首都的城市库存，calcNationalResources：铁路连通或港口无封锁）
function marketNationalStock(country) {
    if (typeof calcNationalResources !== 'function') return { grain: 0, iron: 0, connectedCount: 0 };
    let r = calcNationalResources(country);
    return { grain: r.grain || 0, iron: r.iron || 0, connectedCount: r.connectedCount || 0 };
}

// 国家可出口上限 = 国家总量×30%（需求：单次出口 ≤ 国家总量×30%）
function marketExportCap(country, type) {
    let st = marketNationalStock(country);
    let total = type === 'grain' ? st.grain : st.iron;
    return Math.min(total, total * MARKET_EXPORT_RATIO);
}

// 玩家出口：amount 从连接首都的城市库存按比例扣除 → 全球库存随之变化 → 价格联动
// 收入 = amount/100 × 伦敦基准价 × (1−实际税率)
function doMarketExport(country, type, amount, taxOverride) {
    let m = marketState();
    let st = marketNationalStock(country);
    let total = type === 'grain' ? st.grain : st.iron;
    if (total <= 0) return { ok: false, reason: '国家总量为 0' };
    if (st.connectedCount <= 0) return { ok: false, reason: '无可用通道（需港口或铁路连接）' };
    if (amount <= 0) return { ok: false, reason: '数量需大于 0' };
    let cap = total * MARKET_EXPORT_RATIO;
    if (amount > cap) return { ok: false, reason: '单次出口不能超过总量 30%（上限 ' + Math.floor(cap) + '）' };
    let r = calcNationalResources(country);
    let connected = r.connected || {};
    // 按比例从连接城市扣除
    let remain = amount;
    let queue = [];
    for (let cid in connected) {
        let c = G.cities[cid];
        if (!c) continue;
        let stock = type === 'grain' ? (c.grain || 0) : (c.iron || 0);
        if (stock <= 0) continue;
        queue.push({ c: c, stock: stock });
    }
    if (queue.length === 0) return { ok: false, reason: '连接城市无库存' };
    let totalStock = 0;
    for (let q of queue) totalStock += q.stock;
    let remain2 = amount;
    for (let q of queue) {
        let share = amount * q.stock / totalStock;
        let take = Math.min(q.stock, share);
        if (type === 'grain') q.c.grain = Math.max(0, (q.c.grain || 0) - take);
        else q.c.iron = Math.max(0, (q.c.iron || 0) - take);
        remain2 -= take;
    }
    if (remain2 > 0.5) {
        // 取整误差兜底：从第一个有库存的城市扣
        for (let q of queue) {
            let stock = type === 'grain' ? (q.c.grain || 0) : (q.c.iron || 0);
            if (stock > 0) {
                if (type === 'grain') q.c.grain = Math.max(0, stock - remain2);
                else q.c.iron = Math.max(0, stock - remain2);
                break;
            }
        }
    }
    let price = type === 'grain' ? m.quotes.grain : m.quotes.iron;
    let tax = taxOverride !== undefined ? taxOverride :
        (typeof m.overrides['LONDON'] !== 'undefined' ? m.overrides['LONDON'] : m.baseTax);
    let income = amount / 100 * price * (1 - tax / 100);
    let cd = G.countries && G.countries[country];
    if (cd) {
        cd.treasury = Math.round(((cd.treasury || 0) + income) * 10) / 10;
    }
    m.thisMonth = Math.round((m.thisMonth + income) * 10) / 10;
    return { ok: true, income: Math.round(income * 10) / 10, price: price, amount: amount };
}

// AI 进口：从「其他国家」城市库存按比例买入 → 本国连接城市接收；金币不足则提高基准税率
function aiMarketImport(m, country, amount, type) {
    let buyers = {};
    let connected = {};
    let r = null;
    if (typeof calcNationalResources === 'function') r = calcNationalResources(country);
    if (r) connected = r.connected || {};
    let pool = [];
    let poolTotal = 0;
    for (let cid in G.cities) {
        let c = G.cities[cid];
        if (!c || c.owner === country) continue;
        let stock = type === 'grain' ? (c.grain || 0) : (c.iron || 0);
        if (stock <= 1) continue;
        pool.push({ c: c, stock: stock });
        poolTotal += stock;
    }
    if (pool.length === 0 || poolTotal < amount) return false;
    let remain = amount;
    for (let p of pool) {
        let take = Math.min(p.stock, amount * p.stock / poolTotal);
        if (type === 'grain') p.c.grain = Math.max(0, (p.c.grain || 0) - take);
        else p.c.iron = Math.max(0, (p.c.iron || 0) - take);
        remain -= take;
    }
    // 本国接收：优先连接城市，其次任意本国城市
    let got = false;
    for (let cid in connected) {
        let c = G.cities[cid];
        if (!c) continue;
        let maxC = type === 'grain' ? (c.grainMax || 500) : (c.ironMax || 500);
        let room = maxC - (type === 'grain' ? (c.grain || 0) : (c.iron || 0));
        if (room > amount * 0.5) {
            if (type === 'grain') c.grain = Math.min(maxC, (c.grain || 0) + amount);
            else c.iron = Math.min(maxC, (c.iron || 0) + amount);
            got = true;
            break;
        }
    }
    if (!got) {
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c || c.owner !== country) continue;
            let maxC = type === 'grain' ? (c.grainMax || 500) : (c.ironMax || 500);
            let room = maxC - (type === 'grain' ? (c.grain || 0) : (c.iron || 0));
            if (room > amount * 0.5) {
                if (type === 'grain') c.grain = Math.min(maxC, (c.grain || 0) + amount);
                else c.iron = Math.min(maxC, (c.iron || 0) + amount);
                got = true;
                break;
            }
        }
    }
    return got;
}

// ===== 主循环：每日价格刷新 + 月度统计滚动 =====
function marketTick(days) {
    let m = marketState();
    if (!m._initDone) return;
    m.acc = (m.acc || 0) + (days || 0);
    if (m.acc >= 1) {
        m.acc = 0;
        marketCompute(m);
    }
    // 月度统计：跨月时 上月=本月 归零
    let mk = marketMonthKey();
    if (mk !== m.monthKey) {
        m.lastMonth = m.thisMonth || 0;
        m.thisMonth = 0;
        m.monthKey = mk;
    }
}

// ===== AI 决策（每 ~5 天由 updateAI 调用） =====
// 上限 = 该国全部自有城市库存上限之和；库存 = 连接首都的可贸易库存
function marketAICap(country, type) {
    let cap = 0;
    for (let cid in G.cities) {
        let c = G.cities[cid];
        if (!c || c.owner !== country) continue;
        cap += type === 'grain' ? (c.grainMax || 500) : (c.ironMax || 500);
    }
    return cap;
}

function marketAI() {
    let m = marketState();
    if (!m._initDone || !G.countries) return;
    let human = G.playerCountry || null;
    for (let co in G.countries) {
        if (co === human) continue;
        let cd = G.countries[co];
        if (!cd || cd.treasury === undefined) continue;
        if (G.surrendered && G.surrendered[co]) continue;
        // 无贸易通道（无港口亦无铁路连接）的国家不参与国际贸易
        let channel = marketNationalStock(co);
        if (channel.connectedCount <= 0) continue;
        for (let type of ['grain', 'iron']) {
            let stock = channel[type];
            let cap = marketAICap(co, type);
            if (cap <= 0) continue;
            if (stock > cap * MARKET_AI_EXPORT_TH) {
                // 库存 > 上限×60%：自动出口（最多单次 30% 上限）
                let surplus = stock - cap * MARKET_AI_EXPORT_TH;
                let amount = Math.min(stock * MARKET_EXPORT_RATIO, surplus);
                amount = Math.floor(amount);
                if (amount > 0) {
                    let res = doMarketExport(co, type, amount, aiTaxFor(co));
                    if (res.ok) {
                        if (typeof addGameLog === 'function') addGameLog("📊 " + (COUNTRY_CN[co] || co) + " 出口" + (type === 'grain' ? '粮食' : '铁矿') + " " + amount + "（" + res.income + " 金币）");
                    }
                }
            } else if (stock < cap * MARKET_AI_IMPORT_TH) {
                // 库存 < 上限×30%：尝试从其他国家进口
                let want = Math.ceil(cap * MARKET_AI_IMPORT_TH - stock);
                let price = type === 'grain' ? m.quotes.grain : m.quotes.iron;
                let cost = want / 100 * price;
                if ((cd.treasury || 0) >= cost && want > 0) {
                    let ok = aiMarketImport(m, co, want, type);
                    if (ok) {
                        cd.treasury = Math.round(((cd.treasury || 0) - cost) * 10) / 10;
                        if (typeof addGameLog === 'function') addGameLog("📊 " + (COUNTRY_CN[co] || co) + " 进口" + (type === 'grain' ? '粮食' : '铁矿') + " " + want);
                    }
                } else if (want > 0 && (m.aiTax[co] === undefined || (m.aiTax[co] || 0) < MARKET_TAX_MAX)) {
                    // 金币不足：提高基准税率以增加收入
                    m.aiTax[co] = Math.min(MARKET_TAX_MAX, (m.aiTax[co] || MARKET_BASE_TAX) + 1);
                }
            }
        }
    }
}

// AI 出口税率：玩家对该国的覆盖 或 该国自持税率 或 默认基准
function aiTaxFor(co) {
    let m = marketState();
    let t = m.overrides[co];
    if (t !== undefined && t !== null) return t;
    return m.aiTax[co] !== undefined ? m.aiTax[co] : MARKET_BASE_TAX;
}

// ===== 市场面板 UI =====
let _marketScrollMax = 0;

function drawMarketPanel(px, py, pw, ph) {
    let m = marketState();
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();

    let btns = [];
    let x = px, y = py;
    let dy = y - m.scroll;

    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#e8d8b0";
    ctx.fillText("📊 国际贸易", x, dy);
    let g = G.playerCountry && G.countries[G.playerCountry];
    if (!g) { ctx.restore(); return; }

    dy += 20;
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = "#d4c0a0";
    ctx.fillText("💰 金币: " + Math.floor(g.treasury || 0), x, dy); dy += 17;

    // 伦敦价格
    ctx.fillStyle = "#c8b888";
    ctx.fillText("伦敦价格", x, dy); dy += 15;
    ctx.fillStyle = "#e8d8a0";
    ctx.fillText("🌾 粮食: " + m.quotes.grain + " 金币/100", x + 8, dy); dy += 15;
    ctx.fillText("🏭 铁: " + m.quotes.iron + " 金币/100", x + 8, dy); dy += 17;

    // 全球库存
    ctx.fillStyle = "#c8b888";
    ctx.fillText("全球库存: 粮 " + Math.floor(m.quotes.totalGrain) + " | 铁 " + Math.floor(m.quotes.totalIron), x, dy); dy += 15;
    ctx.fillStyle = "#b0a080";
    ctx.fillText("有效库存(30%): 粮 " + Math.floor(m.quotes.effGrain) + " | 铁 " + Math.floor(m.quotes.effIron), x, dy); dy += 15;
    ctx.fillStyle = "#b0a080";
    let usaShare = m.virtual.USA ? (m.virtual.USA.grain + m.virtual.USA.iron) : 0;
    let totalVirtual = m.quotes.totalGrain + m.quotes.totalIron;
    ctx.fillText("美国占比: " + (totalVirtual > 0 ? Math.round(usaShare / totalVirtual * 1000) / 10 : 0) + "%", x, dy); dy += 17;

    // 分隔线
    dy += 2;
    ctx.strokeStyle = "rgba(180,140,80,0.25)";
    ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x + pw, dy); ctx.stroke();
    dy += 8;

    // === 滚动内容区 ===
    let contentTop = dy;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, contentTop, pw, Math.max(40, ph - (contentTop - py) - 34));
    ctx.clip();

    // 粮食出口
    drawMarketExportRow(btns, m, x, dy, 'grain', '🌾 粮食出口'); dy += 92;
    drawMarketExportRow(btns, m, x, dy, 'iron', '🏭 铁矿出口'); dy += 92;

    // 税率
    dy += 4;
    ctx.font = "bold 12px Georgia,serif";
    ctx.fillStyle = "#c8b888";
    ctx.fillText("⚙️ 税率设定", x, dy); dy += 16;
    ctx.font = "11px Georgia,serif";
    ctx.fillText("基准税率:", x, dy);
    let taxL = x + 62, taxW = 22, taxH = 16;
    let th = dy;
    drawMiniBtn(btns, { type: 'taxDown', x: taxL, y: th, w: taxW, h: taxH, label: '−', color: "#6a8aba" });
    ctx.fillStyle = "#e8d8a0";
    ctx.textAlign = "center";
    ctx.fillText(m.baseTax + "%", taxL + taxW + 12, th + 2);
    ctx.textAlign = "left";
    drawMiniBtn(btns, { type: 'taxUp', x: taxL + taxW + 26, y: th, w: taxW, h: taxH, label: '+', color: "#6a8aba" });
    dy += 24;

    // 国别税率
    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = "#c8b888";
    ctx.fillText("国别税率（点击循环调整 5% 步进）", x, dy); dy += 16;
    for (let code of MARKET_TRADABLE) {
        if (dy > py + ph) break;
        let isEnemy = (typeof areAtWar === 'function' && areAtWar(G.playerCountry, code));
        let ov = m.overrides[code];
        let tax = ov === undefined ? m.baseTax : ov;
        let isVirtual = !!MARKET_VIRTUAL_CN[code];
        if (isVirtual) {
            ctx.fillStyle = isEnemy ? "rgba(200,100,80,0.9)" : "#d4c0a0";
            ctx.fillText("🌐 " + MARKET_VIRTUAL_CN[code], x, dy);
        } else {
            if (typeof drawCountryFlag === 'function') drawCountryFlag(code, x, dy + 1, 14, 10);
            ctx.fillStyle = isEnemy ? "rgba(200,100,80,0.9)" : "#d4c0a0";
            ctx.fillText(COUNTRY_CN[code] || code, x + 18, dy);
        }
        ctx.textAlign = "right";
        ctx.fillStyle = ov === undefined ? "rgba(200,180,150,0.45)" : "#e8d8a0";
        ctx.fillText(ov === undefined ? "未设置(" + m.baseTax + "%)" : tax + "%", x + pw - 4, dy);
        ctx.textAlign = "left";
        btns.push({ type: 'taxCountry', code: code, x: x, y: dy, w: pw, h: 14 });
        dy += 14;
    }
    _marketScrollMax = Math.max(0, dy - contentTop - (ph - (contentTop - py) - 34));
    ctx.restore();

    // 固定底部：本月/上月 + 滚动按钮
    let fy = py + ph - 34;
    ctx.strokeStyle = "rgba(180,140,80,0.25)";
    ctx.beginPath(); ctx.moveTo(x, fy - 4); ctx.lineTo(x + pw, fy - 4); ctx.stroke();
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = "#b0a080";
    ctx.fillText("📊 本月: " + Math.floor(m.thisMonth) + "  上月: " + Math.floor(m.lastMonth), x, fy + 4);
    if (_marketScrollMax > 0) {
        drawMiniBtn(btns, { type: 'scrollUp', x: x + pw - 44, y: fy, w: 20, h: 14, label: '▲', color: "#6a8aba" });
        drawMiniBtn(btns, { type: 'scrollDown', x: x + pw - 22, y: fy, w: 20, h: 14, label: '▼', color: "#6a8aba" });
    }
    G._marketBtns = btns;
    ctx.restore();
}

function drawMiniBtn(btns, b) {
    let hovered = mouseX !== undefined && mouseX > b.x && mouseX < b.x + b.w && mouseY !== undefined && mouseY > b.y && mouseY < b.y + b.h;
    ctx.fillStyle = hovered ? "rgba(" + (b.color || "#8a8aaa") + ",0.35)" : "rgba(60,60,90,0.35)";
    ctx.strokeStyle = "rgba(180,140,80,0.4)";
    ctx.beginPath();
    CT.roundRectPath(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8d8a0";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    btns.push({ type: b.type, code: b.code, x: b.x, y: b.y, w: b.w, h: b.h });
}

function drawMarketExportRow(btns, m, x, y, type, title) {
    let st = marketNationalStock(G.playerCountry);
    let total = type === 'grain' ? st.grain : st.iron;
    let cap = total * MARKET_EXPORT_RATIO;
    ctx.font = "bold 11px Georgia,serif";
    ctx.fillStyle = "#c8b888";
    ctx.fillText(title, x, y); y += 15;
    ctx.font = "10px Georgia,serif";
    ctx.fillStyle = "#b0a080";
    ctx.fillText("国家总量: " + Math.floor(total) + "  可出口: " + Math.floor(cap), x, y); y += 14;
    // 预设按钮
    let bw = 34, bh = 16, bx = x, by = y;
    let presets = [500, 1000, 2000];
    for (let i = 0; i < presets.length; i++) {
        let pv = presets[i];
        let active = m.sel === pv && !m.customFocus;
        ctx.fillStyle = active ? "rgba(120,180,120,0.4)" : "rgba(60,60,90,0.3)";
        ctx.strokeStyle = active ? "rgba(140,200,140,0.6)" : "rgba(180,140,80,0.35)";
        CT.roundRectPath(ctx, bx, by, bw, bh, 3);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = active ? "#d8f0d8" : "#c8b888";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("" + pv, bx + bw / 2, by + bh / 2 + 0.5);
        btns.push({ type: 'preset', res: type, val: pv, x: bx, y: by, w: bw, h: bh });
        bx += bw + 4;
    }
    // 自定义
    let customActive = m.sel === 'custom' && m.customFocus;
    let cw = 44;
    ctx.fillStyle = customActive ? "rgba(120,180,120,0.4)" : "rgba(60,60,90,0.3)";
    ctx.strokeStyle = customActive ? "rgba(140,200,140,0.6)" : "rgba(180,140,80,0.35)";
    CT.roundRectPath(ctx, bx, by, cw, bh, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#c8b888";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let customTxt = (m.sel === 'custom' && m.customFocus) ? String(m.custom || 0) : (m.sel === 'custom' ? String(m.custom || 0) : '自定义');
    ctx.fillText(customTxt, bx + cw / 2, by + bh / 2 + 0.5);
    if (customActive && Date.now() % 1000 < 500) {
        ctx.fillStyle = "#e8d8a0";
        ctx.fillRect(bx + cw - 10, by + 3, 1, bh - 6);
    }
    btns.push({ type: 'custom', res: type, x: bx, y: by, w: cw, h: bh });
    bx += cw + 4;
    // 出口按钮
    let ew = 48;
    ctx.fillStyle = "rgba(60,120,180,0.35)";
    ctx.strokeStyle = "rgba(120,180,220,0.5)";
    CT.roundRectPath(ctx, bx, by, ew, bh, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#a8d8f0";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("出口", bx + ew / 2, by + bh / 2 + 0.5);
    btns.push({ type: 'export', res: type, x: bx, y: by, w: ew, h: bh });
    y += 20;
    // 预计收入
    let qty = m.sel === 'custom' ? (m.custom || 0) : m.sel;
    let price = type === 'grain' ? m.quotes.grain : m.quotes.iron;
    let inc = qty / 100 * price * (1 - m.baseTax / 100);
    ctx.font = "10px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#b0a080";
    ctx.fillText("预计收入: " + Math.floor(inc) + " 金币", x, y); y += 16;
    return y;
}

// ===== 市场面板点击 =====
function handleMarketClick(mx, my) {
    let m = marketState();
    if (G._marketBtns) {
        for (let b of G._marketBtns) {
            if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) {
                if (b.type === 'preset') {
                    m.sel = b.val;
                    m.customFocus = false;
                } else if (b.type === 'custom') {
                    m.sel = 'custom';
                    m.customFocus = true;
                } else if (b.type === 'export') {
                    let qty = m.sel === 'custom' ? Math.max(0, Math.floor(m.custom || 0)) : m.sel;
                    let res = doMarketExport(G.playerCountry, b.res, qty);
                    if (typeof addGameLog === 'function') {
                        if (res.ok) addGameLog("📊 出口" + (b.res === 'grain' ? '粮食' : '铁矿') + " " + qty + " → " + res.income + " 金币");
                        else addGameLog("📊 出口失败: " + res.reason);
                    }
                } else if (b.type === 'taxDown') {
                    m.baseTax = Math.max(MARKET_TAX_MIN, m.baseTax - 5);
                } else if (b.type === 'taxUp') {
                    m.baseTax = Math.min(MARKET_TAX_MAX, m.baseTax + 5);
                } else if (b.type === 'taxCountry') {
                    let ov = m.overrides[b.code];
                    let cur = ov === undefined ? m.baseTax : ov;
                    let nxt = (cur + 5) > MARKET_TAX_MAX ? undefined : (cur + 5);
                    m.overrides[b.code] = nxt;
                } else if (b.type === 'scrollUp') {
                    m.scroll = Math.max(0, m.scroll - 60);
                } else if (b.type === 'scrollDown') {
                    m.scroll = Math.min(_marketScrollMax, m.scroll + 60);
                }
                return true;
            }
        }
    }
    return false;
}

function marketKeydown(e) {
    let m = marketState();
    if (G.leftPanel !== 'market') return false;
    if (m.customFocus) {
        if (e.key === 'Escape' || e.key === 'Enter') { m.customFocus = false; e.preventDefault(); return true; }
        if (e.key === 'Backspace') { m.custom = Math.floor((m.custom || 0) / 10); e.preventDefault(); return true; }
        if (/^[0-9]$/.test(e.key)) {
            m.custom = Math.min(999999, (m.custom || 0) * 10 + parseInt(e.key));
            e.preventDefault();
            return true;
        }
        return false;
    }
    if (e.key === 'Escape') {
        G.leftPanel = null;
        e.preventDefault();
        return true;
    }
    return false;
}

// 初始化：脚本加载时 G.cities 已由 game_core 初始化（index.html 中 market.js 位于 game_core 之后）
marketState();
