// ============================================================
//  Iron & Dominion 1914 — 城市管理面板（左侧栏第三标签）
//  左侧栏「城市」标签展开；顶部本国资源总览（金币/粮食/铁矿）；
//  仅显示本国城市；支持排序（8种+升降序）、筛选（7种）、搜索；
//  面板内直接升级（确认对话框）；点击城市名地图定位
// ============================================================

(function () {
    const ITEM_H = 84;
    // 与 game_panels.js 左侧栏系统对齐：LEFT_TAB_W=34, LEFT_PANEL_W=310
    const PANEL_X = 38, PANEL_W = 310;

    const SORT_OPTIONS = [
        ['grainPot', '粮食潜力'],
        ['ironPot', '铁矿潜力'],
        ['grainCur', '粮食当前'],
        ['ironCur', '铁矿当前'],
        ['grainStock', '粮食储量'],
        ['ironStock', '铁矿储量'],
        ['name', '城市名'],
        ['conn', '连接状态'],
    ];
    const FILTER_OPTIONS = [
        ['all', '全部城市'],
        ['connected', '仅已连接'],
        ['disconnected', '仅未连接'],
        ['capital', '仅首都'],
        ['major', '仅大城市'],
        ['small', '仅小城市'],
        ['upgradable', '仅可升级'],
    ];

    function state() {
        if (!G.cityMgrState) {
            G.cityMgrState = {
                sort: 'grainPot', desc: true, filter: 'all',
                search: '', searchFocus: false,
                scroll: 0, dropdown: null, confirm: null,
                connCache: null,
            };
        }
        return G.cityMgrState;
    }

    function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

    function hit(b, sx, sy) {
        return b && sx > b.x && sx < b.x + b.w && sy > b.y && sy < b.y + b.h;
    }

    function panelRect() {
        return {
            x: PANEL_X, y: TOP_BAR_HEIGHT + 4,
            w: PANEL_W, h: canvas.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - 8
        };
    }

    function cityTypeLabel(c) {
        if (c.isCapital) return '首都';
        if (c.cityType === 'major' || (typeof isMajorCity === 'function' && isMajorCity(c.id))) return '大城市';
        return '小城市';
    }

    function invalidateCache() {
        let s = G.cityMgrState;
        if (s) s.connCache = null;
    }

    // ---- 列表数据：本国城市 + 过滤 + 排序 ----
    function buildItems(s) {
        if (!s.connCache) {
            s.connCache = {};
            if (G.playerCountry) s.connCache[G.playerCountry] = calcNationalResources(G.playerCountry);
        }
        let q = s.search.toLowerCase();
        let items = [];
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c || !c.id) continue;
            if (c.owner !== G.playerCountry) continue; // 只显示本国城市
            if (q) {
                if (c.name.toLowerCase().indexOf(q) < 0 && c.id.toLowerCase().indexOf(q) < 0) continue;
            }
            let data = getCityRes(c);
            let stock = getCityStock(c);
            let conn = null;
            if (c.owner && s.connCache[c.owner]) conn = s.connCache[c.owner].connected[cid] || null;
            // 筛选
            switch (s.filter) {
                case 'connected': if (!conn) continue; break;
                case 'disconnected': if (conn) continue; break;
                case 'capital': if (!c.isCapital) continue; break;
                case 'major': if (!(c.cityType === 'major' || (typeof isMajorCity === 'function' && isMajorCity(c.id)))) continue; break;
                case 'small': if (c.isCapital || c.cityType === 'major' || (typeof isMajorCity === 'function' && isMajorCity(c.id))) continue; break;
                case 'upgradable':
                    if (!resUpgradeInfo(c, 'grain') && !resUpgradeInfo(c, 'iron')) continue;
                    break;
            }
            items.push({ city: c, data: data, stock: stock, conn: conn });
        }
        let dir = s.desc ? -1 : 1;
        items.sort((a, b) => {
            let ka, kb;
            switch (s.sort) {
                case 'grainPot': ka = a.data.grainPot; kb = b.data.grainPot; break;
                case 'ironPot': ka = a.data.ironPot; kb = b.data.ironPot; break;
                case 'grainCur': ka = a.data.grainCur; kb = b.data.grainCur; break;
                case 'ironCur': ka = a.data.ironCur; kb = b.data.ironCur; break;
                case 'grainStock': ka = a.stock.grain; kb = b.stock.grain; break;
                case 'ironStock': ka = a.stock.iron; kb = b.stock.iron; break;
                case 'name':
                    return dir * a.city.name.localeCompare(b.city.name, 'zh-Hans-CN');
                case 'conn': {
                    let ca = a.conn ? 1 : 0, cb = b.conn ? 1 : 0;
                    return dir * (ca - cb);
                }
                default: ka = 0; kb = 0;
            }
            if (ka === kb) return a.city.name.localeCompare(b.city.name, 'zh-Hans-CN');
            return dir * (ka > kb ? 1 : -1);
        });
        return items;
    }

    // ---- 升级状态 ----
    function upgStatus(city, res) {
        let info = resUpgradeInfo(city, res);
        let upgrading = resIsUpgrading(city.id, res);
        let remain = 0;
        if (upgrading) {
            let bq = G.buildQueue.find(b => b.type === (res === 'grain' ? 'upgrade_grain' : 'upgrade_iron') && b.cityId === city.id);
            if (bq) remain = Math.ceil(bq.days);
        }
        let affordable = !!info && !!G.countries[G.playerCountry] && G.countries[G.playerCountry].treasury >= info.cost;
        return { info: info, upgrading: upgrading, remain: remain, affordable: affordable };
    }

    function doUpgrade(cityId, res) {
        let city = G.cities[cityId];
        if (!city || !G.playerCountry) return;
        if (G.multiplayerMode === 'client') {
            MP.sendAction({ type: res === 'grain' ? 'upgrade_grain' : 'upgrade_iron', province: city.provinceId, cityId: city.id, cityLon: city.lon, cityLat: city.lat, cityName: city.name });
            addGameLog('已向Host发送' + (res === 'grain' ? '粮食' : '铁矿') + '升级指令');
        } else if (typeof resStartUpgrade === 'function') {
            let r = resStartUpgrade(city, res, G.playerCountry);
            if (!r.ok) addGameLog(city.name + ' 升级失败：' + r.reason);
        }
    }

    function focusCity(cityId) {
        let c = G.cities[cityId];
        if (!c) return;
        camX = c.lon;
        camY = c.lat;
        zoom = Math.max(zoom, 1.5);
        if (typeof clampCamera === 'function') clampCamera();
        G.selectedCity = c;
        G.selectedCities = [c];
        G.selectedDivisions = [];
        G.selectedProvince = null;
        G.selBox = null;
    }

    // ================= 绘制 =================

    function drawUpgButton(it, res, x, y, w, h, s) {
        let city = it.city;
        let st = upgStatus(city, res);
        let label, color;
        if (st.upgrading) { label = '⏳ ' + st.remain + '天'; color = '#8a8a8a'; }
        else if (st.info) { label = '⬆升级'; color = st.affordable ? '#ffd700' : '#7a7a7a'; }
        else { label = '已满级'; color = '#5a5a5a'; }
        let can = !st.upgrading && !!st.info && st.affordable;
        ctx.save();
        ctx.fillStyle = can ? 'rgba(255,215,0,0.14)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = can ? 'rgba(255,215,0,0.55)' : 'rgba(120,120,130,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = color;
        ctx.font = '11px Georgia,serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2 + 1);
        ctx.restore();
        if (can) window._cityMgrBtns.push({ id: 'upg:' + city.id + ':' + res, x: x, y: y, w: w, h: h });
    }

    function drawItem(it, x, y, w, s) {
        let c = it.city, d = it.data, st = it.stock;
        let connected = !!it.conn;
        let base = connected ? '#e8e0d0' : '#ff6b6b';
        ctx.save();
        ctx.textBaseline = 'top';
        if (s.hover === c.id) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x, y, w, ITEM_H);
        }
        ctx.textAlign = 'left';
        // 行1：城市名（粗体）+ 类型小字 + 连接状态（右侧）
        ctx.font = 'bold 14px Georgia,serif';
        ctx.fillStyle = base;
        ctx.fillText('📍 ' + c.name, x + 4, y + 2);
        let nmW = ctx.measureText('📍 ' + c.name).width;
        ctx.font = '11px Georgia,serif';
        ctx.fillStyle = connected ? 'rgba(230,220,200,0.55)' : 'rgba(255,130,120,0.7)';
        ctx.fillText('（' + cityTypeLabel(c) + '）', x + 6 + nmW, y + 4);
        ctx.font = '12px Georgia,serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = connected ? '#8ad4a4' : '#ff6b6b';
        ctx.fillText(connected ? '✅ 已连接' : '❌ 未连接', x + w - 6, y + 3);
        window._cityMgrBtns.push({ id: 'city:' + c.id, x: x + 2, y: y + 2, w: w - 90, h: 18 });
        // 行2：等级 + 升级按钮（右侧两枚）
        ctx.textAlign = 'left';
        ctx.font = '12px Georgia,serif';
        ctx.fillStyle = '#d4b860';
        ctx.fillText('粮 T' + d.grainCur + '/T' + d.grainPot, x + 4, y + 22);
        ctx.fillStyle = '#b0b8c8';
        ctx.fillText('铁 T' + d.ironCur + '/T' + d.ironPot, x + 78, y + 22);
        let btnW = 74, btnH = 18;
        drawUpgButton(it, 'grain', x + w - 12 - 74 - btnW, y + 20, btnW, btnH, s);
        drawUpgButton(it, 'iron', x + w - 12 - btnW, y + 20, btnW, btnH, s);
        // 行3：库存（当前/上限）
        ctx.font = '11px Georgia,serif';
        ctx.fillStyle = connected ? 'rgba(230,220,200,0.75)' : 'rgba(255,130,120,0.85)';
        ctx.fillText('粮：' + Math.floor(st.grain) + '/' + Math.floor(c.grainMax || 0) + '    铁：' + Math.floor(st.iron) + '/' + Math.floor(c.ironMax || 0), x + 4, y + 42);
        // 行4：月产
        ctx.fillText('月产粮：' + Math.round(resGrainMonthly(c)) + '    月产铁：' + Math.round(resIronMonthly(c)), x + 4, y + 57);
        // 分隔线
        ctx.fillStyle = 'rgba(74,74,90,0.35)';
        ctx.fillRect(x + 2, y + ITEM_H - 1, w - 4, 1);
        ctx.restore();
    }

    function drawDropdown(r, s) {
        if (!s.dropdown) return;
        let opts, anchor, cur, key;
        if (s.dropdown === 'sort') { opts = SORT_OPTIONS; anchor = window._cityMgrSortRect; cur = s.sort; key = 'optRects'; }
        else if (s.dropdown === 'filter') { opts = FILTER_OPTIONS; anchor = window._cityMgrFilterRect; cur = s.filter; key = 'filterRects'; }
        if (!opts || !anchor) return;
        let dw = 150, optH = 22;
        let dy = anchor.y + anchor.h + 2;
        ctx.save();
        ctx.fillStyle = 'rgba(22,20,26,0.98)';
        ctx.fillRect(anchor.x, dy, dw, opts.length * optH);
        ctx.strokeStyle = '#4a4a5a';
        ctx.lineWidth = 1;
        ctx.strokeRect(anchor.x + 0.5, dy + 0.5, dw - 1, opts.length * optH - 1);
        let rects = [];
        for (let i = 0; i < opts.length; i++) {
            let oy = dy + i * optH;
            let sel = opts[i][0] === cur;
            let hov = mouseX !== undefined && mouseX > anchor.x && mouseX < anchor.x + dw && mouseY > oy && mouseY < oy + optH;
            if (sel) ctx.fillStyle = 'rgba(255,215,0,0.12)';
            else if (hov) ctx.fillStyle = 'rgba(255,255,255,0.06)';
            else ctx.fillStyle = 'transparent';
            ctx.fillRect(anchor.x, oy, dw, optH);
            ctx.fillStyle = sel ? '#ffd700' : '#d4c0a0';
            ctx.font = '12px Georgia,serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(opts[i][1], anchor.x + 8, oy + optH / 2 + 1);
            rects.push({ x: anchor.x, y: oy, w: dw, h: optH });
        }
        let dd = window._cityMgrDropdownRects || {};
        dd[key] = rects;
        window._cityMgrDropdownRects = dd;
        ctx.restore();
    }

    function drawConfirm(r, s) {
        if (!s.confirm) return;
        let city = G.cities[s.confirm.cityId];
        if (!city) { s.confirm = null; return; }
        let res = s.confirm.res;
        let info = resUpgradeInfo(city, res);
        if (!info) { s.confirm = null; return; }
        let cd = G.countries[G.playerCountry];
        let treasury = cd ? cd.treasury : 0;
        let resName = res === 'grain' ? '粮食' : '铁矿';
        let lines = [
            '升级' + resName + '等级',
            city.name + ' ' + resName + '：T' + info.cur + ' → T' + (info.cur + 1),
            '消耗：' + info.cost + ' 金币',
            '耗时：' + info.days + ' 天',
            '当前金币：' + fmt(treasury),
        ];
        let dw = 264, dh = lines.length * 20 + 68;
        let dx = r.x + (r.w - dw) / 2, dy = r.y + 110;
        ctx.save();
        ctx.fillStyle = 'rgba(18,14,10,0.98)';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.strokeStyle = '#c8a830';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 14px Georgia,serif';
        ctx.fillStyle = '#e8d080';
        ctx.fillText(lines[0], dx + 16, dy + 12);
        ctx.font = '12px Georgia,serif';
        ctx.fillStyle = '#d4c0a0';
        for (let i = 1; i < lines.length; i++) ctx.fillText(lines[i], dx + 16, dy + 38 + (i - 1) * 20);
        // 按钮
        let by = dy + dh - 42;
        let bw = (dw - 48) / 2;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = '12px Georgia,serif';
        ctx.fillStyle = 'rgba(255,215,0,0.15)';
        ctx.fillRect(dx + 16, by, bw, 28);
        ctx.strokeStyle = 'rgba(255,215,0,0.5)';
        ctx.strokeRect(dx + 16.5, by + 0.5, bw - 1, 27);
        ctx.fillStyle = '#ffd700';
        ctx.fillText('确认升级', dx + 16 + bw / 2, by + 14);
        window._cityMgrBtns.push({ id: 'confirm_yes', x: dx + 16, y: by, w: bw, h: 28 });
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(dx + 16 + bw + 16, by, bw, 28);
        ctx.strokeStyle = 'rgba(120,120,130,0.5)';
        ctx.strokeRect(dx + 16 + bw + 16.5, by + 0.5, bw - 1, 27);
        ctx.fillStyle = '#c8b8a0';
        ctx.fillText('取消', dx + 16 + bw + 16 + bw / 2, by + 14);
        window._cityMgrBtns.push({ id: 'confirm_no', x: dx + 16 + bw + 16, y: by, w: bw, h: 28 });
        ctx.restore();
    }

    function draw() {
        if (G.leftPanel !== 'cities') return; // 仅左侧栏「城市」标签展开时绘制
        let s = state();
        window._cityMgrBtns = [];
        window._cityMgrDropdownRects = null;

        let r = panelRect();
        window._cityMgrRect = { x: r.x, y: r.y, w: r.w, h: r.h };
        let items = buildItems(s);
        let totals = G.playerCountry ? calcNationalResources(G.playerCountry) : { grain: 0, iron: 0, connectedCount: 0 };

        ctx.save();
        // 背景（无描边，避免面板右侧出现竖黑边）
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.textBaseline = 'top';
        let x0 = r.x + 12, w0 = r.w - 24;

        // 标题栏
        ctx.textAlign = 'left';
        ctx.font = 'bold 15px Georgia,serif';
        ctx.fillStyle = '#e8d8b0';
        ctx.fillText('🏙 城市管理', x0, r.y + 10);
        let cx = r.x + r.w - 34, cy = r.y + 8, cw = 26, chh = 24;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(cx, cy, cw, chh);
        ctx.strokeStyle = 'rgba(120,120,130,0.5)';
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, chh - 1);
        ctx.fillStyle = '#d4c0a0';
        ctx.font = '13px Georgia,serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', cx + cw / 2, cy + chh / 2 + 1);
        ctx.textBaseline = 'top';
        window._cityMgrBtns.push({ id: 'close', x: cx, y: cy, w: cw, h: chh });
        let y = r.y + 40;

        // 顶部资源总览
        CT.drawSeparator(ctx, x0, y, w0); y += 10;
        ctx.textAlign = 'left';
        ctx.font = '13px Georgia,serif';
        ctx.fillStyle = '#e8c840';
        ctx.fillText('💰 金币：' + fmt(G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0), x0, y);
        y += 19;
        ctx.fillStyle = '#d4b860';
        ctx.fillText('🌾 粮食：' + fmt(totals.grain), x0, y);
        ctx.fillStyle = 'rgba(212,184,96,0.55)';
        ctx.font = '11px Georgia,serif';
        ctx.fillText('（已连接城市）', x0 + 18 + ctx.measureText('🌾 粮食：' + fmt(totals.grain)).width, y + 2);
        y += 19;
        ctx.font = '13px Georgia,serif';
        ctx.fillStyle = '#b0b8c8';
        ctx.fillText('🏭 铁矿：' + fmt(totals.iron), x0, y);
        ctx.fillStyle = 'rgba(176,184,200,0.55)';
        ctx.font = '11px Georgia,serif';
        ctx.fillText('（已连接城市）', x0 + 18 + ctx.measureText('🏭 铁矿：' + fmt(totals.iron)).width, y + 2);
        y += 21;
        CT.drawSeparator(ctx, x0, y, w0); y += 8;

        // 统计行（本国城市数）
        ctx.font = '12px Georgia,serif';
        ctx.fillStyle = 'rgba(212,192,160,0.85)';
        ctx.textAlign = 'left';
        ctx.fillText('共 ' + items.length + ' 座本国城市   │   已连接首都：' + (totals.connectedCount || 0) + ' 座', x0, y);
        y += 22;
        CT.drawSeparator(ctx, x0, y, w0); y += 8;

        // 控制行1：排序 / 降序 / 筛选
        let btnH2 = 22;
        function ctrlBtn(bx2, bw2, label, active) {
            ctx.fillStyle = active ? 'rgba(255,215,0,0.14)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(bx2, y, bw2, btnH2);
            ctx.strokeStyle = active ? 'rgba(255,215,0,0.5)' : 'rgba(120,120,130,0.45)';
            ctx.strokeRect(bx2 + 0.5, y + 0.5, bw2 - 1, btnH2 - 1);
            ctx.fillStyle = active ? '#ffd700' : '#d4c0a0';
            ctx.font = '12px Georgia,serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bx2 + bw2 / 2, y + btnH2 / 2 + 1);
            ctx.textBaseline = 'top';
        }
        let sortLabel = SORT_OPTIONS.find(o => o[0] === s.sort);
        let filterLabel = FILTER_OPTIONS.find(o => o[0] === s.filter);
        ctrlBtn(x0, 108, '排序：' + (sortLabel ? sortLabel[1] : '') + ' ▼', s.dropdown === 'sort');
        window._cityMgrSortRect = { x: x0, y: y, w: 108, h: btnH2 };
        ctrlBtn(x0 + 112, 58, (s.desc ? '降序 [▼]' : '升序 [▲]'), false);
        window._cityMgrDescRect = { x: x0 + 112, y: y, w: 58, h: btnH2 };
        ctrlBtn(x0 + 174, w0 - 174, '筛选：' + (filterLabel ? filterLabel[1] : '') + ' ▼', s.dropdown === 'filter');
        window._cityMgrFilterRect = { x: x0 + 174, y: y, w: w0 - 174, h: btnH2 };
        y += btnH2 + 6;

        // 控制行2：搜索框
        let sh2 = 22;
        ctx.fillStyle = s.searchFocus ? 'rgba(40,36,28,0.9)' : 'rgba(20,18,14,0.7)';
        ctx.fillRect(x0, y, w0, sh2);
        ctx.strokeStyle = s.searchFocus ? 'rgba(255,215,0,0.6)' : 'rgba(74,74,90,0.6)';
        ctx.strokeRect(x0 + 0.5, y + 0.5, w0 - 1, sh2 - 1);
        ctx.font = '12px Georgia,serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#b0a888';
        ctx.fillText('🔍 ', x0 + 6, y + sh2 / 2 + 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 30, y + 2, w0 - 36, sh2 - 4);
        ctx.clip();
        ctx.fillStyle = '#e8e0d0';
        ctx.fillText(s.search, x0 + 30, y + sh2 / 2 + 1);
        if (s.searchFocus && Date.now() % 1000 < 500) {
            let tx = x0 + 30 + ctx.measureText(s.search).width;
            ctx.fillRect(tx + 2, y + 4, 1, sh2 - 8);
        }
        ctx.restore();
        ctx.textBaseline = 'top';
        window._cityMgrSearchRect = { x: x0, y: y, w: w0, h: sh2 };
        y += sh2 + 8;

        window._cityMgrListTop = y;

        // 列表区（可滚动）
        let listH = r.y + r.h - y - 8;
        window._cityMgrMaxScroll = Math.max(0, items.length * ITEM_H - listH);
        if (s.scroll > window._cityMgrMaxScroll) s.scroll = window._cityMgrMaxScroll;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 - 4, y, w0 + 8, listH);
        ctx.clip();
        let y0 = y - s.scroll;
        for (let i = 0; i < items.length; i++) {
            let iy = y0 + i * ITEM_H;
            if (iy + ITEM_H < y) continue;
            if (iy > y + listH) break;
            drawItem(items[i], x0 - 4, iy, w0 + 8, s);
        }
        ctx.restore();
        // 滚动条
        if (window._cityMgrMaxScroll > 0) {
            let barH = Math.max(24, listH * listH / (items.length * ITEM_H));
            let barY = y + (listH - barH) * (s.scroll / window._cityMgrMaxScroll);
            ctx.fillStyle = 'rgba(200,180,150,0.25)';
            ctx.fillRect(r.x + r.w - 5, barY, 3, barH);
        }

        drawDropdown(r, s);
        drawConfirm(r, s);
        ctx.restore();
    }

    // ================= 交互 =================

    function click(sx, sy) {
        let s = state();
        let r = panelRect();
        if (sx < r.x || sx >= r.x + r.w || sy < r.y || sy >= r.y + r.h) return false;

        // 确认对话框优先
        if (s.confirm) {
            for (let b of window._cityMgrBtns) {
                if ((b.id === 'confirm_yes' || b.id === 'confirm_no') && hit(b, sx, sy)) {
                    if (b.id === 'confirm_yes') doUpgrade(s.confirm.cityId, s.confirm.res);
                    s.confirm = null;
                    return true;
                }
            }
            s.confirm = null;
            return true;
        }

        // 下拉选项
        let dd = window._cityMgrDropdownRects;
        if (dd) {
            if (s.dropdown === 'sort' && dd.optRects) {
                for (let i = 0; i < dd.optRects.length; i++) {
                    if (hit(dd.optRects[i], sx, sy)) { s.sort = SORT_OPTIONS[i][0]; s.dropdown = null; return true; }
                }
            }
            if (s.dropdown === 'filter' && dd.filterRects) {
                for (let i = 0; i < dd.filterRects.length; i++) {
                    if (hit(dd.filterRects[i], sx, sy)) { s.filter = FILTER_OPTIONS[i][0]; s.dropdown = null; return true; }
                }
            }
        }
        // 关闭按钮
        for (let b of window._cityMgrBtns) {
            if (b.id === 'close' && hit(b, sx, sy)) { G.leftPanel = null; return true; }
        }
        // 搜索框
        if (hit(window._cityMgrSearchRect, sx, sy)) { s.searchFocus = true; return true; }
        // 升级按钮 / 城市名定位
        for (let b of window._cityMgrBtns) {
            if (!hit(b, sx, sy)) continue;
            if (b.id.indexOf('upg:') === 0) {
                let parts = b.id.split(':');
                let city = G.cities[parts[1]];
                let st = upgStatus(city, parts[2]);
                if (st.info && st.affordable) s.confirm = { cityId: parts[1], res: parts[2] };
                return true;
            }
            if (b.id.indexOf('city:') === 0) {
                focusCity(b.id.slice(5));
                return true;
            }
        }
        // 排序 / 降序 / 筛选 按钮
        if (hit(window._cityMgrSortRect, sx, sy)) { s.dropdown = s.dropdown === 'sort' ? null : 'sort'; s.searchFocus = false; return true; }
        if (hit(window._cityMgrDescRect, sx, sy)) { s.desc = !s.desc; return true; }
        if (hit(window._cityMgrFilterRect, sx, sy)) { s.dropdown = s.dropdown === 'filter' ? null : 'filter'; s.searchFocus = false; return true; }
        s.searchFocus = false;
        s.dropdown = null;
        return true; // 面板内其他点击：不穿透到地图
    }

    function wheel(dy, sx, sy) {
        let s = state();
        let r = panelRect();
        if (sx < r.x || sx >= r.x + r.w || sy < r.y || sy >= r.y + r.h) return false;
        s.scroll = Math.max(0, Math.min(window._cityMgrMaxScroll || 0, s.scroll + dy));
        return true;
    }

    function keydown(e) {
        let s = state();
        if (s.searchFocus) {
            if (e.key === 'Escape' || e.key === 'Enter') { s.searchFocus = false; }
            else if (e.key === 'Backspace') { s.search = s.search.slice(0, -1); }
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { s.search += e.key; }
            e.preventDefault();
            return true;
        }
        if (G.leftPanel === 'cities' && e.key === 'Escape') {
            G.leftPanel = null;
            s.confirm = null; s.dropdown = null;
            e.preventDefault();
            return true;
        }
        return false;
    }

    window.drawCityManager = draw;
    window.cityMgrClick = click;
    window.cityMgrWheel = wheel;
    window.cityMgrKeydown = keydown;
    window.cityMgrInvalidateCache = invalidateCache;
    window.cityMgrBuildItems = buildItems;
})();
