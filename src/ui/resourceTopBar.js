// ============================================================
//  Iron & Dominion 1914 — 顶部栏资源显示（🌾 粮食 / 🏭 铁矿）
//  显示格式：🌾 粮食：12,400/20,000 | 🏭 铁矿：8,200/15,000 | 💰 金币：1,500
//  数值为国家总量（连接首都城市的实时库存之和）
// ============================================================

(function () {
    function fmt(n) {
        return Math.floor(n).toLocaleString('en-US');
    }

    // 在金币之前绘制粮食/铁矿，返回新的 lx（供调用方继续布局）
    function draw(lx, cy) {
        if (!G.playerCountry) return lx;
        let totals = calcNationalResources(G.playerCountry);
        if (!totals) return lx;
        ctx.save();
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "11px Georgia,serif";

        let capSum = 0;
        for (let cid in totals.connected) {
            let c = G.cities[cid];
            if (c) capSum += c.grainMax || 0;
        }

        ctx.fillStyle = "#d4b860";
        ctx.fillText("🌾 粮食:" + fmt(totals.grain) + "/" + fmt(capSum), lx, cy);
        lx += ctx.measureText("🌾 粮食:" + fmt(totals.grain) + "/" + fmt(capSum)).width + 8;

        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        let ironCapSum = 0;
        for (let cid in totals.connected) {
            let c = G.cities[cid];
            if (c) ironCapSum += c.ironMax || 0;
        }

        ctx.fillStyle = "#b0b8c8";
        ctx.fillText("🏭 铁矿:" + fmt(totals.iron) + "/" + fmt(ironCapSum), lx, cy);
        lx += ctx.measureText("🏭 铁矿:" + fmt(totals.iron) + "/" + fmt(ironCapSum)).width + 8;

        CT.drawSeparator(ctx, lx, cy, 16);
        lx += 8;

        ctx.restore();
        return lx;
    }

    window.resDrawTopBar = draw;
})();
