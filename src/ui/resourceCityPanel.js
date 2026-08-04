// ============================================================
//  Iron & Dominion 1914 — 城市面板资源区块
//  显示：粮食/铁矿等级（当前/潜力）、月产、库存、连接状态、升级按钮
// ============================================================

(function () {
    function canAfford(cost) {
        return !!(G.countries && G.countries[G.playerCountry] && G.countries[G.playerCountry].treasury >= cost);
    }

    // 区块高度（与 draw 的布局严格对应）
    function panelH(city) {
        let h = 8 + 18 + 16 + 16 + 16 + 16 + 18; // 分隔线 + 标题 + 粮2行 + 铁2行 + 连接状态
        if (resUpgradeInfo(city, 'grain') || resIsUpgrading(city.id, 'grain')) h += 34; // 按钮26 + 分隔线8
        if (resUpgradeInfo(city, 'iron') || resIsUpgrading(city.id, 'iron')) h += 34;
        return h;
    }

    function drawUpgradeSlot(x, w, ly, city, res, btnId, label) {
        let info = resUpgradeInfo(city, res);
        let upgrading = resIsUpgrading(city.id, res);
        if (upgrading) {
            let bq = G.buildQueue.find(b => b.type === (res === 'grain' ? 'upgrade_grain' : 'upgrade_iron') && b.cityId === city.id);
            let prog = bq && bq.totalDays > 0 ? Math.max(0, 1 - bq.days / bq.totalDays) : 0;
            let remain = bq ? Math.ceil(bq.days) : 0;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 26, label + " 升级中 " + Math.floor(prog * 100) + "%（" + remain + "天）", { style: "default", font: "12px Georgia,serif" });
            CT.drawProgressBar(ctx, x + 14, ly + 20, w - 36, 4, prog, CT.warning);
        } else if (info) {
            let can = canAfford(info.cost);
            let hovered = mouseY !== undefined && mouseY > ly && mouseY < ly + 26 && mouseX > x + 8 && mouseX < x + w - 8;
            CT.drawRoundedBtn(ctx, x + 8, ly, w - 16, 26, "⬆️ " + label + " →T" + (info.cur + 1) + " ($" + info.cost + " · " + info.days + "天)", {
                hovered: hovered && can,
                style: can ? "highlight" : "default",
                font: "12px Georgia,serif"
            });
            window._cityBtns.push({ id: btnId, x: x + 8, y: ly, w: w - 16, h: 26, enabled: can });
        }
        return ly + 26;
    }

    // 在给定 ly 处绘制，返回新的 ly
    function draw(x, w, ly, city) {
        let r = getCityRes(city);
        if (!r) return ly;
        // 面板传入的可能是 G.selectedCity 的浅拷贝（快照），库存/上限必须读实时对象
        let live = (G.cities && G.cities[city.id]) || city;
        let conn = null;
        if (G.playerCountry) {
            let totals = calcNationalResources(G.playerCountry);
            conn = totals.connected[city.id] || null;
        }
        ctx.save();
        ctx.textBaseline = "top";

        CT.drawSeparator(ctx, x + 10, ly, w - 20);
        ly += 8;

        ctx.fillStyle = "#c8a840";
        ctx.font = "bold 13px Georgia,serif";
        ctx.textAlign = "center";
        ctx.fillText("— 资源 —", x + w / 2, ly);
        ly += 18;
        ctx.textAlign = "left";
        ctx.font = "12px Georgia,serif";

        // 粮食（当前/上限 + 月产）
        ctx.fillStyle = "#d4b860";
        ctx.fillText("🌾 粮食 T" + r.grainCur + "/T" + r.grainPot, x + 12, ly);
        ly += 16;
        ctx.fillStyle = "#a8d868";
        ctx.fillText("月产 " + Math.round(resGrainMonthly(city)) + " · " + Math.floor(live.grain || 0) + "/" + Math.floor(live.grainMax || 500), x + 12, ly);
        ly += 16;

        // 铁矿（当前/上限 + 月产）
        ctx.fillStyle = "#b0b8c8";
        ctx.fillText("🏭 铁矿 T" + r.ironCur + "/T" + r.ironPot, x + 12, ly);
        ly += 16;
        ctx.fillStyle = "#8ab8e8";
        ctx.fillText("月产 " + Math.round(resIronMonthly(city)) + " · " + Math.floor(live.iron || 0) + "/" + Math.floor(live.ironMax || 500), x + 12, ly);
        ly += 16;

        // 连接状态
        if (conn) {
            ctx.fillStyle = "#8ad4a4";
            ctx.fillText((conn.bySea ? "⚓ 海路连接" : "🚂 铁路连接") + " ✓ 计入国家总量", x + 12, ly);
        } else {
            ctx.fillStyle = "#e07a6a";
            ctx.fillText("⚠ 未连接（不计入国家总量）", x + 12, ly);
        }
        ly += 18;

        // 升级按钮
        if (resUpgradeInfo(city, 'grain') || resIsUpgrading(city.id, 'grain')) {
            ly = drawUpgradeSlot(x, w, ly, city, 'grain', 'res_upgrade_grain', '升级粮食');
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 8;
        }
        if (resUpgradeInfo(city, 'iron') || resIsUpgrading(city.id, 'iron')) {
            ly = drawUpgradeSlot(x, w, ly, city, 'iron', 'res_upgrade_iron', '升级铁矿');
            CT.drawSeparator(ctx, x + 10, ly, w - 20);
            ly += 8;
        }

        ctx.restore();
        return ly;
    }

    window.resPanelH = panelH;
    window.resDrawCityPanel = draw;
})();
