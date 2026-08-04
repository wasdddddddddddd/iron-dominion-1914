// ============================================================
//  Iron & Dominion 1914 — 资源视图（地图标注 + 右下角切换按钮）
//  开启后：本国城市上方显示 名称 + 粮X/Y 铁X/Y
//  已连接 → 绿色 / 未连接 → 红色；悬停显示详细信息
// ============================================================

(function () {
    const BTN_W = 44, BTN_H = 28;
    // 「穿过」阈值（世界度），须与 resourceNational.js / game_core.js 的 RAIL_PASS_DIST 一致（0.15）
    const RAIL_NEAR_DIST = 0.15;

    function distToSegment(px, py, x1, y1, x2, y2) {
        let dx = x2 - x1, dy = y2 - y1;
        let len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // 资源视图下的铁路连接情况：本国可用段绿色高亮；邻近自动接入的小城市画绿色虚线支线
    function drawRailLines() {
        if (!G.resourceView || !G.cities || !G.playerCountry || !G.railways) return;
        let country = G.playerCountry;
        let usable = [];
        for (let key in G.railways) {
            let sep = key.indexOf('|');
            if (sep < 1) continue;
            let a = key.slice(0, sep), b = key.slice(sep + 1);
            let ca = G.cities[a], cb = G.cities[b];
            if (!ca || !cb) continue;
            if (ca.owner !== country || cb.owner !== country) continue;
            usable.push({ a: a, b: b, ca: ca, cb: cb });
        }
        if (usable.length === 0) return;

        ctx.save();
        ctx.lineCap = "round";
        for (let s of usable) {
            let p1 = worldToScreen(s.ca.lon, s.ca.lat);
            let p2 = worldToScreen(s.cb.lon, s.cb.lat);
            ctx.strokeStyle = "rgba(110,220,130,0.5)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();
        }
        // 邻近接入虚线
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c || c.owner !== country) continue;
            let hasDirect = false;
            for (let s of usable) {
                if (s.a === cid || s.b === cid) { hasDirect = true; break; }
            }
            if (hasDirect) continue;
            let best = Infinity, fpx = null, fpy = null;
            for (let s of usable) {
                let d = distToSegment(c.lon, c.lat, s.ca.lon, s.ca.lat, s.cb.lon, s.cb.lat);
                if (d < best) {
                    best = d;
                    let dx = s.cb.lon - s.ca.lon, dy = s.cb.lat - s.ca.lat;
                    let len2 = dx * dx + dy * dy;
                    let t = ((c.lon - s.ca.lon) * dx + (c.lat - s.ca.lat) * dy) / len2;
                    t = Math.max(0, Math.min(1, t));
                    fpx = s.ca.lon + dx * t;
                    fpy = s.ca.lat + dy * t;
                }
            }
            if (best < RAIL_NEAR_DIST && fpx !== null) {
                let p1 = worldToScreen(c.lon, c.lat);
                let p2 = worldToScreen(fpx, fpy);
                ctx.strokeStyle = "rgba(110,220,130,0.35)";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(p1[0], p1[1]);
                ctx.lineTo(p2[0], p2[1]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        ctx.restore();
    }

    // 右下角资源视图切换按钮（城市视图按钮上方）
    function drawButton() {
        let isActive = !!G.resourceView;
        let btnX = canvas.width - BTN_W - 8, btnY = canvas.height - BOTTOM_BAR_HEIGHT - 182;
        ctx.save();
        ctx.fillStyle = isActive ? "rgba(120,180,80,0.35)" : "rgba(22,16,10,0.85)";
        CT.roundRectPath(ctx, btnX, btnY, BTN_W, BTN_H, 4);
        ctx.fill();
        ctx.strokeStyle = isActive ? "rgba(120,180,80,0.7)" : "rgba(180,140,80,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = isActive ? "#a8e0a0" : "#d4c0a0";
        ctx.fillText("📊", btnX + BTN_W / 2, btnY + BTN_H / 2);
        if (isActive) {
            ctx.fillStyle = "rgba(120,180,80,0.3)";
            ctx.fillRect(btnX, btnY + BTN_H - 2, BTN_W, 2);
        }
        window._resBtnRect = { x: btnX, y: btnY, w: BTN_W, h: BTN_H };
        ctx.restore();
    }

    function findHoverCity() {
        if (mouseX === undefined || mouseY === undefined) return null;
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (c.owner !== G.playerCountry) continue;
            let p = worldToScreen(c.lon, c.lat);
            if (Math.abs(mouseX - p[0]) < 70 && Math.abs(mouseY - p[1]) < 16) return c;
        }
        return null;
    }

    // 地图标注（render 中调用，须在世界坐标绘制之后）
    function drawLabels() {
        if (!G.resourceView || !G.cities || !G.playerCountry) return;
        let totals = calcNationalResources(G.playerCountry);
        let hoverCity = findHoverCity();

        ctx.save();
        ctx.textBaseline = "top";
        drawRailLines();
        for (let cid in G.cities) {
            let c = G.cities[cid];
            if (!c || !c.owner) continue;
            let p = worldToScreen(c.lon, c.lat);
            let sx = p[0], sy = p[1];
            if (sx < -120 || sx > canvas.width + 120 || sy < -80 || sy > canvas.height + 80) continue;

            if (c.owner !== G.playerCountry) {
                // 外国城市：只显示潜力（蓝框=有潜在资源，红框=全T1），不显示当前等级
                let r = getCityRes(c);
                let hasPot = r.grainPot > 1 || r.ironPot > 1;
                let info = "粮T" + r.grainPot + " 铁T" + r.ironPot;
                ctx.font = "bold 11px Georgia,serif";
                let infoW = ctx.measureText(info).width;
                let bw = infoW + 10, bh = 15;
                let bx = sx - bw / 2, by = sy - 10;
                ctx.fillStyle = hasPot ? "rgba(30,50,90,0.6)" : "rgba(70,30,30,0.55)";
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeStyle = hasPot ? "rgba(90,150,255,0.55)" : "rgba(200,100,80,0.4)";
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, bw, bh);
                ctx.textAlign = "center";
                ctx.fillStyle = hasPot ? "#9cc8ff" : "#f0a090";
                ctx.fillText(info, sx, by + 2);
                continue;
            }

            let r = getCityRes(c);
            let conn = totals.connected[cid];
            // 潜力着色：粮或铁潜力 ≥T2 = 绿；全 T1 = 红（连接状态用 ✅/❌ 标注）
            let hasPot = r.grainPot > 1 || r.ironPot > 1;
            let name = c.name + (conn ? ' ✅' : ' ❌');
            let info = "粮" + r.grainCur + "/" + r.grainPot + " 铁" + r.ironCur + "/" + r.ironPot;

            ctx.font = "bold 13px Georgia,serif";
            let nameW = ctx.measureText(name).width;
            ctx.font = "12px Georgia,serif";
            let infoW = ctx.measureText(info).width;
            let bw = Math.max(nameW, infoW) + 14, bh = 30;
            let bx = sx - bw / 2, by = sy - 20;

            // 半透明底（潜力：有 T2+ = 绿，全 T1 = 红）
            ctx.fillStyle = hasPot ? "rgba(30,60,30,0.55)" : "rgba(70,30,30,0.55)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = hasPot ? "rgba(120,200,120,0.35)" : "rgba(200,100,80,0.35)";
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, bh);

            // 名称字大、等级字小
            ctx.textAlign = "center";
            ctx.font = "bold 13px Georgia,serif";
            ctx.fillStyle = hasPot ? "#b8f0c0" : "#f0a090";
            ctx.fillText(name, sx, by + 2);
            ctx.font = "12px Georgia,serif";
            ctx.fillStyle = hasPot ? "#7ac88a" : "#d07a6a";
            ctx.fillText(info, sx, by + 16);
        }
        ctx.restore();

        if (hoverCity) drawTooltip(hoverCity, totals);
    }

    function drawTooltip(city, totals) {
        let r = getCityRes(city);
        let conn = totals.connected[city.id];
        let lines = [
            "🏰 " + city.name,
            "🌾 粮食 T" + r.grainCur + "/T" + r.grainPot + " · 月产 " + Math.round(resGrainMonthly(city)) + " · " + Math.floor(city.grain || 0) + "/" + Math.floor(city.grainMax || 0),
            "🏭 铁矿 T" + r.ironCur + "/T" + r.ironPot + " · 月产 " + Math.round(resIronMonthly(city)) + " · " + Math.floor(city.iron || 0) + "/" + Math.floor(city.ironMax || 0),
            conn ? ((conn.bySea ? "⚓ 海路连接 ✓" : "🚂 铁路连接 ✓") + " · 计入国家总量") : "✗ 未连接 · 不计入国家总量",
        ];
        let tx = mouseX + 14, ty = mouseY + 10;
        ctx.save();
        ctx.font = "12px Georgia,serif";
        let tw = 0;
        for (let l of lines) tw = Math.max(tw, ctx.measureText(l).width);
        let th = lines.length * 17 + 12;
        if (tx + tw + 16 > canvas.width) tx = mouseX - tw - 24;
        if (ty + th > canvas.height) ty = mouseY - th - 10;
        ctx.fillStyle = "rgba(20,14,8,0.92)";
        ctx.fillRect(tx, ty, tw + 16, th);
        ctx.strokeStyle = conn ? "rgba(120,200,120,0.5)" : "rgba(200,100,80,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tw + 16, th);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = "bold 12px Georgia,serif";
        ctx.fillStyle = conn ? "#b8f0c0" : "#f0a090";
        ctx.fillText(lines[0], tx + 8, ty + 6);
        ctx.font = "12px Georgia,serif";
        ctx.fillStyle = "#d4c0a0";
        for (let i = 1; i < lines.length; i++) ctx.fillText(lines[i], tx + 8, ty + 6 + i * 17);
        ctx.restore();
    }

    window.drawResButton = drawButton;
    window.resDrawViewLabels = drawLabels;
})();
