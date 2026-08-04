// 一战指挥系统 — UI（底部快捷栏、集团军详情面板、指挥官选择弹窗、总司令顶栏显示）

const CMD_BAR_H = 66;
const CMD_CARD_W = 118;
const CMD_CARD_GAP = 6;
const CMD_STAT_CN = { atk: '攻击', hp: '血量', spd: '移速', logi: '后勤' };

function cmdPct(v) { return Math.round((v || 0) * 100) + '%'; }

function cmdAuraText(aura) {
    if (!aura) return "无光环";
    let list = Array.isArray(aura) ? aura : [aura];
    return list.map(a => {
        let label = CMD_STAT_CN[a.stat] || a.stat;
        let v = a.value || 0;
        let sign = v < 0 ? '-' : '+';
        return label + sign + cmdPct(Math.abs(v));
    }).join('/');
}

function cmdStatsText(cmdr, withLogiMinus) {
    let parts = [];
    if (cmdr.atk) parts.push('攻击+' + cmdPct(cmdr.atk));
    if (cmdr.hp) parts.push('血量+' + cmdPct(cmdr.hp));
    if (cmdr.spd) parts.push('移速+' + cmdPct(cmdr.spd));
    if (cmdr.logi) parts.push('后勤+' + cmdPct(cmdr.logi));
    return parts.length > 0 ? parts.join(' ') : '无加成';
}

function cmdTrunc(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
}

// ===== 底部指挥官快捷栏（钢铁雄心风格） =====
function drawCommanderBar() {
    window._cmdBtns = [];
    window._cmdBarRect = null;
    if (!G.playerCountry || G.activeTab) return;
    let cs = G.commanderState;
    if (!cs) return;
    let h = canvas.height;
    let allGroups = cs.groups.filter(g => g.country === G.playerCountry);
    let groups = allGroups.slice(0, 6);
    let poolCount = getCommanderPool(G.playerCountry).length + getChiefPool(G.playerCountry).length;
    let cards = [];
    for (let g of groups) {
        let cmdr = commanderDataOf(g.country, g.commanderId);
        cards.push({ type: 'group', group: g, cmdr: cmdr });
    }
    cards.push({ type: 'pool', poolCount: poolCount });
    cards.push({ type: 'empty' });

    let barTop = h - BOTTOM_BAR_HEIGHT - BOTTOM_TAB_BAR_HEIGHT - CMD_BAR_H - 6;
    let cardW = CMD_CARD_W, cardH = 44;
    let innerW = cards.length * (cardW + CMD_CARD_GAP) - CMD_CARD_GAP;
    let x0 = canvas.width / 2 - innerW / 2;
    let barW = innerW + 16;
    window._cmdBarRect = { x: x0 - 4, y: barTop, w: barW + 8, h: CMD_BAR_H + 8 };

    ctx.save();
    CT.drawPanel(ctx, x0 - 4, barTop, barW + 8, CMD_BAR_H + 8, { accentColor: "#8a6a3a", radius: 2, noShadow: true });
    ctx.fillStyle = "rgba(200,180,150,0.55)";
    ctx.font = "9px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("⚔️ 指挥系统" + (allGroups.length > 6 ? "（共" + allGroups.length + "个集团军）" : ""), x0, barTop + 3);

    let y = barTop + 14;
    for (let i = 0; i < cards.length; i++) {
        let card = cards[i];
        let cx = x0 + i * (cardW + CMD_CARD_GAP);
        let hovered = mouseX !== undefined && mouseX > cx && mouseX < cx + cardW && mouseY > y && mouseY < y + cardH;
        let isSel = card.type === 'group' && G.selectedArmyGroupId === card.group.id;
        let borderColor = card.type === 'group' ? getGroupColor(card.group) : (card.type === 'pool' ? "#c8a830" : "#5a5a6a");

        CT.drawPanel(ctx, cx, y, cardW, cardH, {
            accentColor: isSel ? "#ffd700" : borderColor,
            radius: 2,
            fill: hovered ? "rgba(45,32,16,0.95)" : "rgba(28,20,10,0.9)",
            noShadow: true,
        });
        if (isSel) {
            ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 1.5;
            ctx.strokeRect(cx + 0.75, y + 0.75, cardW - 1.5, cardH - 1.5);
        }

        ctx.textAlign = "center"; ctx.textBaseline = "top";
        if (card.type === 'group' && card.cmdr) {
            ctx.font = "bold 11px Georgia,serif";
            ctx.fillStyle = borderColor;
            ctx.fillText("🎖️" + cmdTrunc(card.cmdr.name, 5), cx + cardW / 2, y + 3);
            ctx.font = "10px Georgia,serif";
            ctx.fillStyle = "#c8b88a";
            ctx.fillText(card.group.name + " " + card.group.divisionIds.length + "个师", cx + cardW / 2, y + 19);
            ctx.font = "9px Georgia,serif";
            ctx.fillStyle = "rgba(200,180,150,0.6)";
            ctx.fillText('⭐'.repeat(Math.max(1, card.cmdr.stars || 1)), cx + cardW / 2, y + 31);
            window._cmdBtns.push({ type: 'group', groupId: card.group.id, x: cx, y: y, w: cardW, h: cardH });
        } else if (card.type === 'pool') {
            ctx.font = "bold 11px Georgia,serif";
            ctx.fillStyle = "#c8a830";
            ctx.fillText("🚩", cx + cardW / 2, y + 3);
            ctx.font = "9px Georgia,serif";
            ctx.fillStyle = "#c8b88a";
            ctx.fillText("后备指挥官 " + card.poolCount + "位", cx + cardW / 2, y + 20);
            window._cmdBtns.push({ type: 'pool', x: cx, y: y, w: cardW, h: cardH });
        } else {
            ctx.font = "bold 11px Georgia,serif";
            ctx.fillStyle = "#6a6a7a";
            ctx.fillText("──", cx + cardW / 2, y + 3);
            ctx.font = "9px Georgia,serif";
            ctx.fillStyle = "rgba(200,180,150,0.45)";
            ctx.fillText("空位", cx + cardW / 2, y + 20);
            window._cmdBtns.push({ type: 'empty', x: cx, y: y, w: cardW, h: cardH });
        }

        // 悬停提示
        if (hovered && card.type === 'group' && card.cmdr) {
            let tip = card.cmdr.name + ' ' + '⭐'.repeat(card.cmdr.stars) + '\n' +
                '可指挥' + card.cmdr.cap + ' · ' + cmdStatsText(card.cmdr) +
                (card.cmdr.aura ? ' · 光环:' + cmdAuraText(card.cmdr.aura) : '') +
                '\n' + card.group.divisionIds.length + '个师';
            drawCmdTooltip(tip, cx + cardW / 2, barTop - 6);
        } else if (hovered && card.type === 'pool') {
            drawCmdTooltip("查看后备指挥官列表", cx + cardW / 2, barTop - 6);
        } else if (hovered && card.type === 'empty') {
            drawCmdTooltip("选中师团后点击\"编入集团军\"：可加入现有集团军，也可1个师就编成新集团军；点击下方空位/后备池可直接编成空集团军", cx + cardW / 2, barTop - 6);
        }
    }
    ctx.restore();
}

function drawCmdTooltip(text, tx, ty) {
    ctx.save();
    ctx.font = "10px Georgia,serif";
    let lines = text.split('\n');
    let tw = 0;
    for (let l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    let pw = tw + 20, ph = lines.length * 14 + 10;
    let px = Math.max(4, Math.min(canvas.width - pw - 4, tx - pw / 2));
    let py = ty - ph;
    CT.drawPanel(ctx, px, py, pw, ph, { radius: 2, fill: "rgba(22,16,10,0.95)" });
    ctx.fillStyle = "#c8b88a";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], px + 10, py + 6 + i * 14);
    }
    ctx.restore();
}

// ===== 集团军详情面板 =====
function drawArmyGroupPanel() {
    window._cmdPanelBtns = [];
    window._cmdPanelRect = null;
    if (!G.selectedArmyGroupId || G.activeTab || G.selectedDivisions.length > 0) return;
    let cs = G.commanderState;
    if (!cs) return;
    let group = getGroupById(G.selectedArmyGroupId);
    if (!group || group.country !== G.playerCountry) { G.selectedArmyGroupId = null; return; }
    if (window._cmdLastGroup !== group.id) { G._cmdPanelScroll = 0; window._cmdLastGroup = group.id; }
    let cmdr = commanderDataOf(group.country, group.commanderId);
    if (!cmdr) return;
    let members = getGroupMembers(group);
    let maxVisible = 12;
    let rowH = 22;
    let visibleCount = Math.min(members.length, maxVisible);

    let x = canvas.width - 310, y = TOP_BAR_HEIGHT + 10, w = 300;
    let h = 232 + visibleCount * rowH + 30;
    if (h > canvas.height - TOP_BAR_HEIGHT - 120) h = canvas.height - TOP_BAR_HEIGHT - 120;
    window._cmdPanelRect = { x: x, y: y, w: w, h: h };
    window._cmdPanelBtns = [];

    ctx.save();
    CT.drawPanel(ctx, x, y, w, h, { accentColor: getGroupColor(group) });

    let ly = y + 6;
    ctx.font = "bold 13px Georgia,serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#e8d8b0";
    ctx.fillText("🎖️ " + group.name, x + 12, ly);
    ly += 20;

    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = "#c8a84a";
    ctx.fillText("指挥官：" + cmdTrunc(cmdr.name, 10), x + 12, ly);
    ctx.textAlign = "right";
    ctx.fillText('⭐'.repeat(cmdr.stars), x + w - 12, ly);
    ctx.textAlign = "left";
    ly += 18;

    ctx.font = "11px Georgia,serif";
    ctx.fillStyle = "#7a9a5a";
    ctx.fillText(cmdStatsText(cmdr), x + 12, ly);
    ly += 14;

    ctx.fillStyle = "rgba(200,180,150,0.7)";
    ctx.fillText("可指挥上限：" + cmdr.cap + "（已用" + members.length + "）", x + 12, ly);
    ly += 14;

    let total = getGroupTotalStrength(group);
    ctx.fillStyle = "#7ab8d4";
    ctx.fillText("总兵力：约" + (total / 1000).toFixed(1) + "万人", x + 12, ly);
    ly += 18;

    CT.drawSeparator(ctx, x + 10, ly, w - 20);
    ly += 8;
    ctx.font = "bold 10px Georgia,serif";
    ctx.fillStyle = "#e8d8b0";
    ctx.fillText("下属师列表（滚轮滚动）:", x + 12, ly);
    ly += 14;

    // 成员列表：可滚动显示全部
    let listY0 = ly;
    let listH = visibleCount * rowH;
    G._cmdPanelMaxScroll = Math.max(0, members.length * rowH - listH);
    G._cmdPanelScroll = Math.min(G._cmdPanelScroll || 0, G._cmdPanelMaxScroll);
    let scroll = G._cmdPanelScroll || 0;
    let first = Math.floor(scroll / rowH);
    let last = Math.min(members.length, first + Math.ceil(listH / rowH) + 1);
    for (let i = first; i < last; i++) {
        let d = members[i];
        let ry = listY0 + (i - first) * rowH - (scroll % rowH);
        if (ry < listY0 - rowH || ry > listY0 + listH) continue;
        let ut = UNIT_TYPES[d.type] || UNIT_TYPES.infantry;
        ctx.fillStyle = "rgba(200,180,150,0.85)";
        ctx.font = "11px Georgia,serif";
        ctx.fillText((ut.sym || '') + " " + cmdTrunc(d.name, 12) + " [" + Math.floor(d.strength) + "]", x + 12, ry);
        // 脱离按钮
        let bx = x + w - 46, bw = 34;
        let bh = 16;
        let hovered = mouseX !== undefined && mouseX > bx && mouseX < bx + bw && mouseY > ry && mouseY < ry + bh;
        ctx.fillStyle = hovered ? "rgba(200,80,60,0.9)" : "rgba(160,60,50,0.55)";
        ctx.fillRect(bx, ry, bw, bh);
        ctx.fillStyle = "#f0d0c0";
        ctx.font = "10px Georgia,serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("脱离", bx + bw / 2, ry + bh / 2 + 1);
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        window._cmdPanelBtns.push({ id: 'member_out_' + d.id, x: bx, y: ry, w: bw, h: bh, tooltip: "该师脱离集团军，失去加成" });
    }
    // 成员列表滚动条
    if (G._cmdPanelMaxScroll > 0) {
        let sbX = x + w - 14, sbH = listH;
        let thumbH = Math.max(20, sbH * (visibleCount / members.length));
        let thumbY = listY0 + (sbH - thumbH) * (scroll / G._cmdPanelMaxScroll);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(sbX, listY0, 6, sbH);
        ctx.fillStyle = "rgba(200,168,48,0.7)";
        ctx.fillRect(sbX, thumbY, 6, thumbH);
    }
    ly = listY0 + listH;

    // 底部按钮：更换指挥官 / 删除集团军 / 解散集团军
    let by2 = y + h - 34;
    let bw3 = (w - 40) / 3;
    { // 更换指挥官
        let hovered = mouseX !== undefined && mouseX > x + 10 && mouseX < x + 10 + bw3 && mouseY > by2 && mouseY < by2 + 24;
        CT.drawRoundedBtn(ctx, x + 10, by2, bw3, 24, "🔄 更换", { hovered: hovered, style: "info", font: "bold 10px Georgia,serif" });
        window._cmdPanelBtns.push({ id: 'group_replace', x: x + 10, y: by2, w: bw3, h: 24, tooltip: "更换集团军指挥官" });
    }
    { // 删除集团军（立即生效）
        let bx2 = x + 15 + bw3;
        let hovered = mouseX !== undefined && mouseX > bx2 && mouseX < bx2 + bw3 && mouseY > by2 && mouseY < by2 + 24;
        CT.drawRoundedBtn(ctx, bx2, by2, bw3, 24, "🗑️ 删除", { hovered: hovered, style: "danger", font: "bold 10px Georgia,serif" });
        window._cmdPanelBtns.push({ id: 'group_delete', x: bx2, y: by2, w: bw3, h: 24, tooltip: "删除本集团军（立即生效），指挥官返回可用池" });
    }
    { // 解散集团军（确认）
        let bx3 = x + 20 + bw3 * 2;
        let hovered = mouseX !== undefined && mouseX > bx3 && mouseX < bx3 + bw3 && mouseY > by2 && mouseY < by2 + 24;
        CT.drawRoundedBtn(ctx, bx3, by2, bw3, 24, "解散", { hovered: hovered, style: "danger", font: "bold 10px Georgia,serif" });
        window._cmdPanelBtns.push({ id: 'group_disband', x: bx3, y: by2, w: bw3, h: 24, tooltip: "解散集团军（需确认），指挥官返回可用池" });
    }
    ctx.restore();
}

// ===== 指挥官选择/确认弹窗 =====
function drawCommanderModal() {
    window._cmdModalBtns = [];
    window._cmdModalRect = null;
    let m = G._cmdModal;
    if (!m) return;
    let cw = canvas.width, ch = canvas.height;
    let mw = Math.min(720, cw - 40), mh = Math.min(700, ch - 60);
    let mx0 = Math.max(8, (cw - mw) / 2), my0 = Math.max(8, (ch - mh) / 2);
    window._cmdModalRect = { x: mx0, y: my0, w: mw, h: mh };
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, cw, ch);
    CT.drawPanel(ctx, mx0, my0, mw, mh, { accentColor: "#c8a830", radius: 4 });

    // 标题 + 关闭按钮
    ctx.font = "bold 15px Georgia,serif";
    ctx.fillStyle = "#e8d080";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    let title = m.mode === 'form' ? "⚔️ 编成集团军 — 选择指挥官" :
        m.mode === 'join' ? "⚔️ 编入/编成集团军" :
        m.mode === 'replace' ? "🔄 更换指挥官" :
        m.mode === 'pool' ? "🚩 后备指挥官" :
        m.mode === 'chief' ? "🎖️ 设置总司令" : "解散集团军";
    ctx.fillText(title, mx0 + mw / 2, my0 + 10);
    window._cmdModalBtns.push({ id: 'modal_close', x: mx0 + mw - 30, y: my0 + 8, w: 22, h: 22 });

    let yy = my0 + 38;

    if (m.mode === 'form') {
        let landSel = G.selectedDivisions.map(id => G.divisions.find(d => d.id === id)).filter(d => d && d.country === G.playerCountry && !isSeaType(d.type));
        ctx.font = "10px Georgia,serif";
        ctx.fillStyle = "rgba(200,180,150,0.6)";
        ctx.textAlign = "left";
        ctx.fillText("当前选中 " + landSel.length + " 个师团（1个师即可），点击指挥官编成集团军", mx0 + 14, yy);
        yy += 8;
        drawCmdList(m, mx0, yy, mw, mh - (yy - my0) - 10, 'form', landSel.length);
    } else if (m.mode === 'replace') {
        let group = getGroupById(m.groupId);
        if (group) {
            ctx.font = "10px Georgia,serif";
            ctx.fillStyle = "rgba(200,180,150,0.6)";
            ctx.textAlign = "left";
            ctx.fillText(group.name + " 现有 " + group.divisionIds.length + " 个师，选择新指挥官", mx0 + 14, yy);
            yy += 8;
            drawCmdList(m, mx0, yy, mw, mh - (yy - my0) - 10, 'replace', group.divisionIds.length);
        }
    } else if (m.mode === 'join') {
        let selDivs = G.selectedDivisions.map(id => G.divisions.find(d => d.id === id)).filter(d => d && d.country === G.playerCountry && !isSeaType(d.type));
        let onlyId = selDivs.length === 1 ? selDivs[0].id : null;
        let curGroup = onlyId ? getGroupOfDivision(onlyId) : null;
        ctx.font = "10px Georgia,serif";
        ctx.fillStyle = "rgba(200,180,150,0.6)";
        ctx.textAlign = "left";
        ctx.fillText(selDivs.length >= 2
            ? "选择已有集团军将" + selDivs.length + "个师并入，或选后备指挥官编成新集团军"
            : "选择已有集团军将选中师编入，或选后备指挥官编成新集团军（1个师即可）", mx0 + 14, yy);
        yy += 8;
        drawCmdJoinList(m, mx0, yy, mw, mh - (yy - my0) - 10, curGroup ? curGroup.id : null, selDivs.length);
    } else if (m.mode === 'pool') {
        let avail = getAvailableCommanders(G.playerCountry);
        let myGroups = (G.commanderState.groups || []).filter(g => g.country === G.playerCountry).length;
        ctx.font = "10px Georgia,serif";
        ctx.fillStyle = "rgba(200,180,150,0.6)";
        ctx.textAlign = "left";
        if (myGroups >= 6) {
            ctx.fillStyle = "rgba(230,160,140,0.95)";
            ctx.fillText("⚠️ 集团军已达上限（" + myGroups + "/6），请先在集团军管理面板删除部分集团军", mx0 + 14, yy);
        } else {
            ctx.fillText("集团军 " + myGroups + "/6 · 点击指挥官即编成新集团军（可暂无师团，编成后再让部队加入）", mx0 + 14, yy);
        }
        yy += 8;
        drawCmdList(m, mx0, yy, mw, mh - (yy - my0) - 10, 'pool', 0);
    } else if (m.mode === 'chief') {
        ctx.font = "10px Georgia,serif";
        ctx.fillStyle = "rgba(200,180,150,0.6)";
        ctx.textAlign = "left";
        ctx.fillText("设置总司令：光环对本国全部师团生效（现任总司令不可担任集团军指挥官）", mx0 + 14, yy);
        yy += 8;
        drawChiefList(m, mx0, yy, mw, mh - (yy - my0) - 10);
    } else if (m.mode === 'confirmDisband') {
        let group = getGroupById(m.groupId);
        ctx.font = "13px Georgia,serif";
        ctx.fillStyle = "#c8b88a";
        ctx.textAlign = "center";
        ctx.fillText("确认解散" + (group ? "「" + group.name + "」" : "该集团军") + "？", mx0 + mw / 2, yy + 10);
        ctx.font = "11px Georgia,serif";
        ctx.fillStyle = "rgba(200,180,150,0.6)";
        ctx.fillText("各师团恢复独立，" + (group && group.commanderId ? commanderDataOf(group.country, group.commanderId).name : "指挥官") + " 返回可用池", mx0 + mw / 2, yy + 34);
        let bW = 130, bH = 34;
        let bx = mx0 + mw / 2 - bW - 12;
        let by = my0 + mh - 70;
        let h1 = mouseX !== undefined && mouseX > bx && mouseX < bx + bW && mouseY > by && mouseY < by + bH;
        CT.drawRoundedBtn(ctx, bx, by, bW, bH, "✅ 确认解散", { hovered: h1, style: "danger", font: "bold 12px Georgia,serif" });
        window._cmdModalBtns.push({ id: 'confirm_disband_yes', x: bx, y: by, w: bW, h: bH });
        bx = mx0 + mw / 2 + 12;
        let h2 = mouseX !== undefined && mouseX > bx && mouseX < bx + bW && mouseY > by && mouseY < by + bH;
        CT.drawRoundedBtn(ctx, bx, by, bW, bH, "取消", { hovered: h2, style: "default", font: "bold 12px Georgia,serif" });
        window._cmdModalBtns.push({ id: 'modal_close', x: bx, y: by, w: bW, h: bH });
    }
    ctx.restore();
}

function drawCmdList(m, mx0, yy, mw, areaH, action, divCount) {
    let code = G.playerCountry;
    let avail = getAvailableCommanders(code);
    let rowH = 62;
    G._cmdModalMaxScroll = Math.max(0, avail.length * rowH - areaH);
    G._cmdModalScroll = Math.min(G._cmdModalScroll || 0, G._cmdModalMaxScroll);
    let scroll = G._cmdModalScroll || 0;
    let x = mx0 + 12, w = mw - 24;

    let first = Math.floor(scroll / rowH);
    let last = Math.min(avail.length, first + Math.ceil(areaH / rowH) + 1);
    for (let i = first; i < last; i++) {
        let item = avail[i];
        let d = item.data;
        let ry = yy + i * rowH - scroll;
        if (ry < yy - rowH || ry > yy + areaH) continue;
        let hovered = mouseX !== undefined && mouseX > x && mouseX < x + w && mouseY > ry && mouseY < ry + rowH - 4;
        let overCap = action !== 'pool' && d.cap < divCount;
        ctx.fillStyle = hovered ? (overCap ? "rgba(150,60,50,0.45)" : "rgba(200,168,48,0.22)") : "rgba(255,255,255,0.045)";
        ctx.fillRect(x, ry, w, rowH - 4);
        if (overCap) {
            ctx.strokeStyle = "rgba(200,80,60,0.6)"; ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, ry + 0.5, w - 1, rowH - 5);
        }

        ctx.font = "bold 14px Georgia,serif";
        ctx.fillStyle = overCap ? "rgba(230,160,140,0.9)" : "#f0e4c0";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        let tag = item.source === 'chief' ? "（现任总司令）" : item.source === 'chiefPool' ? "（后备总司令）" : "";
        ctx.fillText('⭐'.repeat(d.stars) + " " + cmdTrunc(d.name, 14) + tag, x + 8, ry + 8);
        ctx.font = "12px Georgia,serif";
        ctx.fillStyle = overCap ? "rgba(230,160,140,0.8)" : "rgba(228,218,188,0.9)";
        ctx.fillText("可指挥" + d.cap + " · " + cmdStatsText(d), x + 8, ry + 33);
        if (d.aura) {
            ctx.font = "11px Georgia,serif";
            ctx.fillStyle = "#d8b84a";
            ctx.fillText("光环：" + cmdAuraText(d.aura), x + 8, ry + 51);
        }

        if (action === 'form' || action === 'pool') window._cmdModalBtns.push({ id: 'form_cmd_' + d.id, x: x, y: ry, w: w, h: rowH - 4 });
        else if (action === 'replace') window._cmdModalBtns.push({ id: 'replace_cmd_' + d.id, x: x, y: ry, w: w, h: rowH - 4 });
    }

    // 滚动条
    if (G._cmdModalMaxScroll > 0) {
        let sbX = mx0 + mw - 14, sbH = areaH;
        let trackH = sbH;
        let thumbH = Math.max(24, trackH * (areaH / (avail.length * rowH)));
        let thumbY = yy + (trackH - thumbH) * (scroll / G._cmdModalMaxScroll);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(sbX, yy, 6, trackH);
        ctx.fillStyle = "rgba(200,168,48,0.7)";
        ctx.fillRect(sbX, thumbY, 6, thumbH);
    }
}

// 总司令选择列表（现任 + 后备总司令，可滚动）
function drawChiefList(m, mx0, yy, mw, areaH) {
    let code = G.playerCountry;
    let chief = getActiveChief(code);
    let pool = getChiefPool(code);
    let items = [];
    if (chief) items.push({ data: chief, tag: "（现任总司令）", isCurrent: true });
    for (let cid of pool) {
        let d = commanderDataOf(code, cid);
        if (d) items.push({ data: d, tag: "（后备总司令）", isCurrent: false });
    }
    let rowH = 62;
    G._cmdModalMaxScroll = Math.max(0, items.length * rowH - areaH);
    G._cmdModalScroll = Math.min(G._cmdModalScroll || 0, G._cmdModalMaxScroll);
    let scroll = G._cmdModalScroll || 0;
    let x = mx0 + 12, w = mw - 24;

    let first = Math.floor(scroll / rowH);
    let last = Math.min(items.length, first + Math.ceil(areaH / rowH) + 1);
    for (let i = first; i < last; i++) {
        let item = items[i];
        let d = item.data;
        let ry = yy + i * rowH - scroll;
        if (ry < yy - rowH || ry > yy + areaH) continue;
        let hovered = mouseX !== undefined && mouseX > x && mouseX < x + w && mouseY > ry && mouseY < ry + rowH - 4;
        ctx.fillStyle = hovered ? "rgba(200,168,48,0.22)" : "rgba(255,255,255,0.045)";
        ctx.fillRect(x, ry, w, rowH - 4);

        ctx.font = "bold 14px Georgia,serif";
        ctx.fillStyle = item.isCurrent ? "#f0e4c0" : "#e8d8b0";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText('⭐'.repeat(d.stars) + " " + cmdTrunc(d.name, 14) + " " + item.tag, x + 8, ry + 8);
        ctx.font = "12px Georgia,serif";
        ctx.fillStyle = "rgba(228,218,188,0.9)";
        ctx.fillText("可指挥" + d.cap + " · " + cmdStatsText(d), x + 8, ry + 33);
        if (d.aura) {
            ctx.font = "11px Georgia,serif";
            ctx.fillStyle = "#d8b84a";
            ctx.fillText("光环：" + cmdAuraText(d.aura), x + 8, ry + 51);
        }
        if (!item.isCurrent) window._cmdModalBtns.push({ id: 'chief_set_' + d.id, x: x, y: ry, w: w, h: rowH - 4 });
    }

    // 滚动条
    if (G._cmdModalMaxScroll > 0) {
        let sbX = mx0 + mw - 14, sbH = areaH;
        let thumbH = Math.max(24, sbH * (areaH / (items.length * rowH)));
        let thumbY = yy + (sbH - thumbH) * (scroll / G._cmdModalMaxScroll);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(sbX, yy, 6, sbH);
        ctx.fillStyle = "rgba(200,168,48,0.7)";
        ctx.fillRect(sbX, thumbY, 6, thumbH);
    }
}

// 可加入的集团军列表（未满员、可排除当前所在集团军）
function getJoinableGroups(code, excludeGroupId) {
    let cs = G.commanderState;
    if (!cs) return [];
    return cs.groups.filter(g => g.country === code && g.id !== excludeGroupId)
        .filter(g => {
            let cmdr = commanderDataOf(g.country, g.commanderId);
            return cmdr && g.divisionIds.length < cmdr.cap;
        });
}

// 加入集团军弹窗：已有集团军（可加入）在前 + 后备指挥官在后
function drawCmdJoinList(m, mx0, yy, mw, areaH, excludeGroupId, divCount) {
    let code = G.playerCountry;
    let grps = getJoinableGroups(code, excludeGroupId);
    let cmds = getAvailableCommanders(code);
    let rows = [];
    for (let g of grps) rows.push({ type: 'group', g: g });
    if (grps.length > 0 && cmds.length > 0) rows.push({ type: 'sep' });
    for (let c of cmds) rows.push({ type: 'cmdr', c: c });

    let rowH = 62;
    G._cmdModalMaxScroll = Math.max(0, rows.length * rowH - areaH);
    G._cmdModalScroll = Math.min(G._cmdModalScroll || 0, G._cmdModalMaxScroll);
    let scroll = G._cmdModalScroll || 0;
    let x = mx0 + 12, w = mw - 24;

    let first = Math.floor(scroll / rowH);
    let last = Math.min(rows.length, first + Math.ceil(areaH / rowH) + 1);
    for (let i = first; i < last; i++) {
        let row = rows[i];
        let ry = yy + i * rowH - scroll;
        if (ry < yy - rowH || ry > yy + areaH) continue;
        if (row.type === 'sep') {
            ctx.textAlign = "left"; ctx.textBaseline = "top";
            ctx.font = "bold 10px Georgia,serif";
            ctx.fillStyle = "#c8a84a";
            ctx.fillText("──── 后备指挥官（编成新集团军，1个师即可） ────", x + 8, ry + 26);
            continue;
        }
        if (row.type === 'group') {
            let g = row.g;
            let cmdr = commanderDataOf(g.country, g.commanderId);
            if (!cmdr) continue;
            let hovered = mouseX !== undefined && mouseX > x && mouseX < x + w && mouseY > ry && mouseY < ry + rowH - 4;
            ctx.fillStyle = hovered ? "rgba(200,168,48,0.22)" : "rgba(255,255,255,0.045)";
            ctx.fillRect(x, ry, w, rowH - 4);
            ctx.textAlign = "left"; ctx.textBaseline = "top";
            ctx.font = "bold 14px Georgia,serif";
            ctx.fillStyle = getGroupColor(g);
            ctx.fillText("🎖️ " + g.name + "（" + g.divisionIds.length + "/" + cmdr.cap + "师）", x + 8, ry + 8);
            ctx.font = "12px Georgia,serif";
            ctx.fillStyle = "rgba(228,218,188,0.9)";
            ctx.fillText("指挥官：" + cmdTrunc(cmdr.name, 12) + " · " + cmdStatsText(cmdr) +
                (cmdr.aura ? " · 光环:" + cmdAuraText(cmdr.aura) : ""), x + 8, ry + 33);
            window._cmdModalBtns.push({ id: 'join_group_' + g.id, x: x, y: ry, w: w, h: rowH - 4 });
        } else {
            let item = row.c;
            let d = item.data;
            let overCap = divCount >= 2 && d.cap < divCount;
            let hovered = mouseX !== undefined && mouseX > x && mouseX < x + w && mouseY > ry && mouseY < ry + rowH - 4;
            ctx.fillStyle = hovered ? (overCap ? "rgba(150,60,50,0.45)" : "rgba(200,168,48,0.22)") : "rgba(255,255,255,0.045)";
            ctx.fillRect(x, ry, w, rowH - 4);
            if (overCap) {
                ctx.strokeStyle = "rgba(200,80,60,0.6)"; ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, ry + 0.5, w - 1, rowH - 5);
            }
            ctx.textAlign = "left"; ctx.textBaseline = "top";
            ctx.font = "bold 14px Georgia,serif";
            ctx.fillStyle = overCap ? "rgba(230,160,140,0.9)" : "#f0e4c0";
            let tag = item.source === 'chief' ? "（现任总司令）" : item.source === 'chiefPool' ? "（后备总司令）" : "";
            ctx.fillText('⭐'.repeat(d.stars) + " " + cmdTrunc(d.name, 14) + tag, x + 8, ry + 8);
            ctx.font = "12px Georgia,serif";
            ctx.fillStyle = overCap ? "rgba(230,160,140,0.8)" : "rgba(228,218,188,0.9)";
            ctx.fillText("可指挥" + d.cap + " · " + cmdStatsText(d), x + 8, ry + 33);
            if (d.aura) {
                ctx.font = "11px Georgia,serif";
                ctx.fillStyle = "#d8b84a";
                ctx.fillText("光环：" + cmdAuraText(d.aura), x + 8, ry + 51);
            }
            window._cmdModalBtns.push({ id: 'form_cmd_' + d.id, x: x, y: ry, w: w, h: rowH - 4 });
        }
    }

    // 滚动条
    if (G._cmdModalMaxScroll > 0) {
        let sbX = mx0 + mw - 14, sbH = areaH;
        let trackH = sbH;
        let thumbH = Math.max(24, trackH * (areaH / (rows.length * rowH)));
        let thumbY = yy + (trackH - thumbH) * (scroll / G._cmdModalMaxScroll);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(sbX, yy, 6, trackH);
        ctx.fillStyle = "rgba(200,168,48,0.7)";
        ctx.fillRect(sbX, thumbY, 6, thumbH);
    }
}
