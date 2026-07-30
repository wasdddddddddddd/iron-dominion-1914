// === 海军生产界面（节点面板、建造按钮、舰船列表） ===

let _navyPanelScroll = 0;
let _navyMaxScroll = 0;
const _navyScrollStep = 66;
let _showNavyGuide = false;
let _navyGuideScroll = 0;
let _navyGuideMaxScroll = 0;

function drawNavyPanel(py, ph, startX) {
    if (!G.navyNodes) G.navyNodes = {};
    let panelW = TAB_BTN_W * 4 + 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(startX, py, panelW, ph);
    ctx.clip();

    let x = startX + 8;
    let baseY = py + 4;
    let dy = baseY - _navyPanelScroll;
    G._navyBtns = [];

    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("🚢 海军管理", x, dy);

    // Guide button (right side of header)
    let guideBtnX = startX + panelW - 24;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(guideBtnX, dy, 18, 18);
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📖", guideBtnX + 9, dy + 4);
    G._navyBtns.push({ type: 'toggleGuide', x: guideBtnX, y: dy, w: 18, h: 18 });

    baseY += 18; dy = baseY - _navyPanelScroll;

    if (_showNavyGuide) {
        ctx.restore();
        drawNavyGuideModal();
        return;
    }

    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText("海军节点：建造与升级舰船", x, dy);
    baseY += 16; dy = baseY - _navyPanelScroll;

    if (!G.playerCountry) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText("请先选择国家", x, dy);
        ctx.restore();
        return;
    }

    if (!GREAT_NAVY_POWERS.includes(G.playerCountry)) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText("该国暂无海军体系", x, dy);
        ctx.restore();
        return;
    }

    let myNodes = [];
    for (let id in G.navyNodes) {
        if (G.navyNodes[id].country === G.playerCountry) myNodes.push(G.navyNodes[id]);
    }
    if (myNodes.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText("本国无海军节点", x, dy);
        ctx.restore();
        return;
    }

    let treasury = G.countries[G.playerCountry] ? G.countries[G.playerCountry].treasury : 0;
    let cData = G.countries[G.playerCountry];
    let totalShips = G.ships.filter(s => s.country === G.playerCountry).length;

    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("舰船总数: " + totalShips + "  |  资金: $" + treasury, x, dy);
    baseY += 18; dy = baseY - _navyPanelScroll;

    if (!G.selectedNavyNode && myNodes.length > 0) G.selectedNavyNode = myNodes[0].id;

    // Node cards
    let cardW = panelW - 16;
    let cardH = 62;
    for (let node of myNodes) {
        let visible = dy + cardH > py && dy < py + ph;
        let hovered = mouseX !== undefined && mouseX > x && mouseX < x + cardW
                    && mouseY !== undefined && mouseY > dy && mouseY < dy + cardH;
        let selected = G.selectedNavyNode === node.id;

        if (visible) {
            ctx.fillStyle = selected ? "rgba(255,255,255,0.15)" : (hovered ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.15)");
            ctx.fillRect(x, dy, cardW, cardH);

            if (selected) {
                ctx.fillStyle = "#FFD700";
                ctx.fillRect(x, dy, 3, cardH);
                ctx.strokeStyle = "rgba(255,215,0,0.6)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, dy, cardW, cardH);
            } else {
                ctx.strokeStyle = "rgba(255,255,255,0.08)";
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, dy, cardW, cardH);
            }

            ctx.font = selected ? "bold 12px sans-serif" : "bold 11px sans-serif";
            ctx.fillStyle = selected ? "#FFD700" : "#e8d8b0";
            ctx.textAlign = "left";
            ctx.fillText(node.name || node.id, x + 10, dy + 6);

            ctx.font = "9px sans-serif";
            ctx.fillStyle = "rgba(180,210,255,0.5)";
            ctx.fillText(node.region.replace(/_/g, ' '), x + 10, dy + 22);

            let lvColor = node.level === 3 ? '#FFD700' : (node.level === 2 ? '#4A90D9' : '#888888');
            ctx.fillStyle = lvColor;
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("Lv." + node.level, x + cardW - 60, dy + 6);

            let nodeShips = G.ships.filter(s => s.nodeId === node.id);
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.font = "9px sans-serif";
            ctx.fillText("舰船: " + nodeShips.length, x + cardW - 60, dy + 22);

            if (node.upgradeTimer > 0) {
                node.upgradeProgress = Math.min(1, node.upgradeProgress || 0);
                let barX = x + 10, barY = dy + 36, barW = cardW - 20, barH = 4;
                ctx.fillStyle = "rgba(255,255,255,0.1)";
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = "#4A90D9";
                ctx.fillRect(barX, barY, barW * node.upgradeProgress, barH);
                ctx.font = "8px sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.5)";
                ctx.textAlign = "center";
                ctx.fillText("升级中 " + Math.floor(node.upgradeProgress * 100) + "%", x + cardW / 2, barY + barH + 2);
            } else {
                let btnY = dy + 36;
                let upgradeBtnW = 52, buildBtnW = 70;

                if (node.level < 3) {
                    let nextLv = getNodeLevelDef(node.level + 1);
                    let canUpg = treasury >= nextLv.upgradeCost;
                    let bx = x + 10;
                    ctx.fillStyle = canUpg ? "rgba(60,120,180,0.5)" : "rgba(100,100,100,0.3)";
                    ctx.fillRect(bx, btnY, upgradeBtnW, 18);
                    ctx.fillStyle = canUpg ? "#8ab8d4" : "rgba(255,255,255,0.25)";
                    ctx.font = "9px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("升级 $" + nextLv.upgradeCost, bx + upgradeBtnW / 2, btnY + 5);
                    G._navyBtns.push({ type: 'upgrade', nodeId: node.id, x: bx, y: btnY, w: upgradeBtnW, h: 18 });
                }

                // 检查是否有海军建造队列
                let nq = G.navyBuildQueue || [];
                let nodeQueue = nq.filter(n => n.nodeId === node.id);
                if (nodeQueue.length > 0) {
                    // 显示建造进度条
                    let building = nodeQueue[0]; // 当前正在建造的
                    let progress = building.totalDays > 0 ? Math.max(0, 1 - building.days / building.totalDays) : 0;
                    let barX = x + 10, barY = btnY + 2, barW = cardW - 20, barH = 5;
                    ctx.fillStyle = "rgba(255,255,255,0.1)";
                    ctx.fillRect(barX, barY, barW, barH);
                    ctx.fillStyle = "#4A8AD4";
                    ctx.fillRect(barX, barY, barW * progress, barH);
                    ctx.font = "8px sans-serif";
                    ctx.fillStyle = "rgba(255,255,255,0.5)";
                    ctx.textAlign = "center";
                    ctx.fillText("🚢 建造中 " + Math.floor(progress * 100) + "% (" + Math.ceil(building.days) + "天)", x + cardW / 2, barY + barH + 2);
                    if (nodeQueue.length > 1) {
                        ctx.fillStyle = "rgba(255,255,255,0.3)";
                        ctx.font = "7px sans-serif";
                        ctx.fillText("队列中还有 " + (nodeQueue.length - 1) + " 艘待建造", x + cardW / 2, barY + barH + 2);
                    }
                } else {
                    let cost = 500;
                    let canBuild = treasury >= cost && cData && cData.manpower >= 5;
                    let bx2 = x + cardW - buildBtnW - 10;
                    ctx.fillStyle = canBuild ? "rgba(60,180,100,0.5)" : "rgba(100,100,100,0.3)";
                    ctx.fillRect(bx2, btnY, buildBtnW, 18);
                    ctx.fillStyle = canBuild ? "#8ad4a4" : "rgba(255,255,255,0.25)";
                    ctx.font = "9px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("建造舰船 $" + cost, bx2 + buildBtnW / 2, btnY + 5);
                    G._navyBtns.push({ type: 'build', nodeId: node.id, x: bx2, y: btnY, w: buildBtnW, h: 18 });
                }
            }
        }

        G._navyBtns.push({ type: 'selectNode', nodeId: node.id, x: x, y: dy, w: cardW, h: cardH });

        baseY += cardH + 4;
        dy = baseY - _navyPanelScroll;
    }

    // Selected node ship list
    let selNode = myNodes.find(n => n.id === G.selectedNavyNode);
    if (selNode) {
        baseY += 4; dy = baseY - _navyPanelScroll;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x, dy, cardW, 1);
        baseY += 6; dy = baseY - _navyPanelScroll;

        // Section title with select-all button
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#FFD700";
        ctx.fillText("▸ " + (selNode.name || selNode.id) + " — 舰船列表", x, dy);
        let selectAllBtnX = x + cardW - 50;
        let selectAllBtnY = dy;
        let selectAllHovered = mouseX !== undefined && mouseX > selectAllBtnX && mouseX < selectAllBtnX + 46 && mouseY !== undefined && mouseY > selectAllBtnY && mouseY < selectAllBtnY + 14;
        ctx.fillStyle = selectAllHovered ? "rgba(60,180,255,0.35)" : "rgba(60,180,255,0.15)";
        ctx.fillRect(selectAllBtnX, selectAllBtnY, 46, 14);
        ctx.fillStyle = "#8ab8d4";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("全选舰船", selectAllBtnX + 23, selectAllBtnY + 2);
        G._navyBtns.push({ type: 'selectAllShips', nodeId: selNode.id, x: selectAllBtnX, y: selectAllBtnY, w: 46, h: 14 });
        baseY += 16; dy = baseY - _navyPanelScroll;

        let nodeShips = G.ships.filter(s => s.nodeId === selNode.id);
        if (nodeShips.length === 0) {
            ctx.font = "10px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillText("该节点暂无舰船，点击「建造舰船」", x, dy);
            baseY += 14; dy = baseY - _navyPanelScroll;
        } else {
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(x, dy, cardW, 16);
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.font = "8px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("舰名", x + 6, dy + 4);
            ctx.fillText("速", x + 150, dy + 4);
            ctx.fillText("程", x + 170, dy + 4);
            ctx.fillText("射", x + 190, dy + 4);
            ctx.fillText("威", x + 210, dy + 4);
            ctx.fillText("生", x + 230, dy + 4);
            ctx.fillText("机", x + 250, dy + 4);
            baseY += 18; dy = baseY - _navyPanelScroll;

            for (let ship of nodeShips) {
                if (dy + 20 > py && dy < py + ph) {
                    ctx.fillStyle = "rgba(255,255,255,0.06)";
                    ctx.fillRect(x, dy, cardW, 18);
                    ctx.font = "9px sans-serif";
                    ctx.textAlign = "left";

                    let coCn = COUNTRY_CN[ship.country] || ship.country;
                    let gradeName = SHIP_GRADES[ship.grade] ? SHIP_GRADES[ship.grade].name : '';
                    let suffix = ship.isLegendary ? ('[' + gradeName + ']') : '';
                    let fullName = '(' + coCn + ')' + ship.name + suffix;
                    ctx.fillStyle = ship.color || "#fff";
                    ctx.fillText(fullName, x + 6, dy + 4);

                    ctx.font = "8px sans-serif";
                    let stats = [
                        (ship.speed * 100).toFixed(0) + '%',
                        (ship.range * 100).toFixed(0) + '%',
                        (ship.fireRate * 100).toFixed(0) + '%',
                        (ship.power * 100).toFixed(0) + '%',
                        (ship.hp * 100).toFixed(0) + '%',
                        (ship.maneuver * 100).toFixed(0) + '%',
                    ];
                    let sx = 150;
                    for (let s of stats) {
                        let val = parseFloat(s);
                        ctx.fillStyle = val > 0 ? "rgba(100,220,100,0.6)" : (val < 0 ? "rgba(220,100,100,0.6)" : "rgba(255,255,255,0.35)");
                        ctx.fillText(s, x + sx, dy + 5);
                        sx += 20;
                    }
                }
                baseY += 20;
                dy = baseY - _navyPanelScroll;
            }
        }
    }

    // Scroll buttons (fixed position, top-right/bottom-right of panel)
    _navyMaxScroll = Math.max(0, baseY - (py + ph) + 10);
    if (_navyMaxScroll > 0) {
        if (_navyPanelScroll > 0) {
            let btnX = startX + panelW - 22;
            let btnY = py + 22;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 18, 18);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("▲", btnX + 9, btnY + 4);
            G._navyBtns.push({ type: 'scrollUp', x: btnX, y: btnY, w: 18, h: 18 });
        }
        if (_navyPanelScroll < _navyMaxScroll) {
            let btnX = startX + panelW - 22;
            let btnY = py + ph - 22;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 18, 18);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("▼", btnX + 9, btnY + 4);
            G._navyBtns.push({ type: 'scrollDown', x: btnX, y: btnY, w: 18, h: 18 });
        }
    }

    ctx.restore();
}

// ===== Navy guide modal (screen-centered large window) =====
function drawNavyGuideModal() {
    let cw = canvas.width, ch = canvas.height;
    let mw = Math.min(650, cw - 40), mh = Math.min(550, ch - 60);
    let mx = (cw - mw) / 2, my = (ch - mh) / 2;

    // Dim overlay
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, cw, ch);

    // Window bg
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);

    // Close button
    let closeX = mx + mw - 28, closeY = my + 6;
    ctx.fillStyle = "rgba(255,80,80,0.3)";
    ctx.fillRect(closeX, closeY, 20, 20);
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("✕", closeX + 10, closeY + 3);
    G._navyBtns.push({ type: 'toggleGuide', x: closeX, y: closeY, w: 20, h: 20 });

    // Title bar text
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("海军指南", mx + 14, my + 8);

    // Clip to inner content area
    let innerX = mx + 12, innerY = my + 32, innerW = mw - 24, innerH = mh - 44;
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    let baseY = innerY - _navyGuideScroll + 4;
    let dy = baseY;
    let contentX = innerX + 4;

    // Title
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📖 海军指南", contentX, dy);
    baseY += 26; dy = baseY;

    // ── 属性说明 ──
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("─ 属性说明 ─", contentX, dy);
    baseY += 20; dy = baseY;
    ctx.font = "11px sans-serif";
    let attrLines = [
        "速(Speed): 移动速度修正, 正值更快",
        "程(Range): 攻击距离修正, 正值更远",
        "射(FireRate): 射击间隔修正, 正值更快",
        "威(Power): 伤害修正, 正值更高",
        "生(HP): 生命值修正, 正值更耐打",
        "机(Maneuver): 机动性修正, 正值更灵活",
    ];
    for (let line of attrLines) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText("• " + line, contentX + 10, dy);
        baseY += 18; dy = baseY;
    }
    baseY += 6; dy = baseY;

    // ── 等级概率 ──
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("─ 节点等级与出船概率 ─", contentX, dy);
    baseY += 20; dy = baseY;

    let gradeKeys = ['T1','T2','T3','T4','T5','T6','T7','T8'];
    let gradeNames = gradeKeys.map(k => (SHIP_GRADES[k] ? SHIP_GRADES[k].name : k));
    let colW = Math.floor((innerW - 8) / 8) - 2;

    // Header row
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(contentX, dy, innerW, 18);
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    let cx = contentX + 4;
    ctx.fillStyle = "#e8d8b0";
    ctx.fillText("等级", cx, dy + 4); cx += colW;
    for (let i = 0; i < gradeKeys.length; i++) {
        let gk = gradeKeys[i];
        let gn = gradeNames[i];
        ctx.fillStyle = SHIP_GRADES[gk] ? SHIP_GRADES[gk].color : "#fff";
        ctx.fillText(gn, cx + colW/2, dy + 4); cx += colW;
    }
    baseY += 20; dy = baseY;

    for (let lv of NODE_LEVELS) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(contentX, dy, innerW, 18);
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        let cx = contentX + 4;
        ctx.fillStyle = "#e8d8b0";
        ctx.fillText("Lv." + lv.level, cx, dy + 4); cx += colW;
        for (let gk of gradeKeys) {
            let pct = (lv.probs[gk] || 0) * 100;
            ctx.fillStyle = pct > 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)";
            ctx.fillText(pct > 0 ? pct.toFixed(2) + '%' : '—', cx + colW/2, dy + 4);
            cx += colW;
        }
        baseY += 20; dy = baseY;
    }
    baseY += 6; dy = baseY;

    // ── 等级属性一览 ──
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("─ 舰船等级属性一览 ─", contentX, dy);
    baseY += 20; dy = baseY;

    let statCols = ['等级','词条名','颜色','速度','射程','射速','威力','生命','机动'];
    let statKeys = ['speed','range','fireRate','power','hp','maneuver'];
    let gradeOrder = ['T1','T2','T3','T4','T5','T6','T7','T8'];
    let nCols = statCols.length;
    let scolW = Math.floor(innerW / nCols) - 1;
    let headerH = 18;
    // Header
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(contentX, dy, innerW, headerH);
    ctx.font = "8px sans-serif";
    ctx.textAlign = "center";
    for (let ci = 0; ci < nCols; ci++) {
        ctx.fillStyle = ci === 2 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.5)";
        ctx.fillText(statCols[ci], contentX + scolW/2 + ci * scolW, dy + 4);
    }
    baseY += headerH + 2; dy = baseY;

    for (let gk of gradeOrder) {
        let gd = SHIP_GRADES[gk];
        if (!gd) continue;
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(contentX, dy, innerW, 16);
        ctx.font = "8px sans-serif";
        let cx2 = contentX;
        // 等级
        ctx.fillStyle = gd.color;
        ctx.fillText(gk, cx2 + scolW/2, dy + 4); cx2 += scolW;
        // 词条名
        ctx.fillText(gd.name, cx2 + scolW/2, dy + 4); cx2 += scolW;
        // 颜色 swatch
        ctx.fillStyle = gd.color;
        ctx.fillRect(cx2 + 4, dy + 4, scolW - 8, 8); cx2 += scolW;
        // Stats
        for (let sk of statKeys) {
            let val = gd[sk];
            if (val === undefined || val === null) { ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillText("—", cx2 + scolW/2, dy + 4); }
            else if (gk === 'T8') { ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillText("传奇级", cx2 + scolW/2, dy + 4); }
            else {
                let pct = val * 100;
                let absPct = Math.abs(pct);
                let sign = pct > 0 ? '+' : '';
                ctx.fillStyle = pct > 0 ? "rgba(100,220,100,0.6)" : (pct < 0 ? "rgba(220,100,100,0.6)" : "rgba(255,255,255,0.35)");
                ctx.fillText(sign + absPct.toFixed(0) + '%', cx2 + scolW/2, dy + 4);
            }
            cx2 += scolW;
        }
        baseY += 18; dy = baseY;
    }
    baseY += 6; dy = baseY;

    // ── 升级费用 ──
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("─ 节点升级费用 ─", contentX, dy);
    baseY += 20; dy = baseY;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let lv of NODE_LEVELS) {
        if (lv.level < 3) {
            let next = NODE_LEVELS.find(nl => nl.level === lv.level + 1);
            if (next) ctx.fillText("Lv." + lv.level + " → Lv." + (lv.level + 1) + ":  $" + next.upgradeCost + "铁  " + next.upgradeTime + "秒", contentX + 10, dy);
            baseY += 18; dy = baseY;
        }
    }
    baseY += 6; dy = baseY;

    // ── 各国舰船 ──
    ctx.fillStyle = "#e8d8b0";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("─ 各国舰船一览 ─", contentX, dy);
    baseY += 20; dy = baseY;

    for (let co of GREAT_NAVY_POWERS) {
        let coCn = COUNTRY_CN[co] || co;
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("[" + coCn + "]", contentX, dy);
        baseY += 18; dy = baseY;

        ctx.font = "10px sans-serif";
        for (let gk of gradeKeys) {
            let ships = (SHIP_NAMES[co] && SHIP_NAMES[co][gk]) || [];
            if (ships.length === 0) continue;
            let gn = SHIP_GRADES[gk] ? SHIP_GRADES[gk].name : gk;
            ctx.fillStyle = SHIP_GRADES[gk] ? SHIP_GRADES[gk].color : "#fff";
            let text = gn + ": " + ships.join('、');
            ctx.fillText(text, contentX + 10, dy);
            baseY += 16; dy = baseY;
        }
        baseY += 4; dy = baseY;
    }

    // Guide scroll buttons
    _navyGuideMaxScroll = Math.max(0, baseY - (innerY + innerH) + 10);
    ctx.restore();

    if (_navyGuideMaxScroll > 0) {
        if (_navyGuideScroll > 0) {
            let btnX = mx + mw - 28;
            let btnY = my + 34;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 20, 20);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "top";
            ctx.fillText("▲", btnX + 10, btnY + 3);
            G._navyBtns.push({ type: 'guideScrollUp', x: btnX, y: btnY, w: 20, h: 20 });
        }
        if (_navyGuideScroll < _navyGuideMaxScroll) {
            let btnX = mx + mw - 28;
            let btnY = my + mh - 28;
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(btnX, btnY, 20, 20);
            ctx.fillStyle = "#e8d8b0";
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "top";
            ctx.fillText("▼", btnX + 10, btnY + 3);
            G._navyBtns.push({ type: 'guideScrollDown', x: btnX, y: btnY, w: 20, h: 20 });
        }
    }

    ctx.restore();
}
