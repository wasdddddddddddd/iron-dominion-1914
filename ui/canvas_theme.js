// ═══════════════════════════════════════════════════════════════════════════
// Iron & Dominion 1914 — Canvas 绘制主题
// 一战沉浸式：圆角面板 · 装饰边框 · 黄铜角饰 · 羊皮纸质感
// ═══════════════════════════════════════════════════════════════════════════

const CT = {

  // ─── 颜色常量 ─────────────────────────────────
  bg:       'rgba(22,16,10,0.94)',
  bgLight:  'rgba(28,20,13,0.92)',
  bgDeep:   'rgba(18,12,6,0.96)',
  border:   'rgba(180,140,80,0.28)',
  borderH:  'rgba(200,168,48,0.45)',
  brass:    '#c8a830',
  brassL:   '#d4c070',
  brassD:   '#8a7030',
  text:     '#d4c0a0',
  textH:    '#e8d8b0',
  textM:    'rgba(200,180,150,0.5)',
  textD:    'rgba(200,180,150,0.3)',
  ink:      '#1a0e04',
  success:  '#7a9a5a',
  danger:   '#b05040',
  warning:  '#c8a830',
  info:     '#6a8aaa',

  // ─── 绘制圆角矩形路径 ─────────────────────────
  roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // ─── 绘制面板背景（圆角 + 渐变 + 双线边框 + 角饰） ──
  drawPanel(ctx, x, y, w, h, opts) {
    opts = opts || {};
    let r = opts.radius !== undefined ? opts.radius : 3;
    let borderAlpha = opts.borderAlpha || 1;
    let fill = opts.fill || CT.bg;
    let accentColor = opts.accentColor || null;

    ctx.save();

    // 面板阴影（每帧重绘的热面板传 noShadow 跳过，避免软件渲染开销）
    if (!opts.noShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
    }

    // 主体填充（渐变）
    CT.roundRectPath(ctx, x, y, w, h, r);
    let grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, fill);
    grad.addColorStop(1, 'rgba(18,12,6,0.96)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 外边框
    CT.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = CT.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 内边框（轻微偏移）
    CT.roundRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1);
    ctx.strokeStyle = 'rgba(200,168,48,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 顶部高光线
    ctx.beginPath();
    ctx.moveTo(x + r + 2, y + 1);
    ctx.lineTo(x + w - r - 2, y + 1);
    ctx.strokeStyle = 'rgba(200,168,48,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 左侧强调色条（如果提供）
    if (accentColor) {
      ctx.fillStyle = accentColor;
      CT.roundRectPath(ctx, x + 1, y + 4, 2.5, h - 8, 1);
      ctx.fill();
    }

    // 四角装饰（微小黄铜点）
    let dotR = 2;
    let dotOffset = 6;
    ctx.fillStyle = 'rgba(200,168,48,0.35)';
    [[x+dotOffset, y+dotOffset], [x+w-dotOffset, y+dotOffset],
     [x+dotOffset, y+h-dotOffset], [x+w-dotOffset, y+h-dotOffset]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  },

  // ─── 绘制面板内分隔线 ─────────────────────────
  drawSeparator(ctx, x, y, w) {
    ctx.save();
    // 左线
    ctx.strokeStyle = 'rgba(180,140,80,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + w - 4, y);
    ctx.stroke();
    ctx.restore();
  },

  // ─── 绘制面板标题 ─────────────────────────────
  drawTitle(ctx, x, y, w, text, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || CT.textH;
    ctx.font = opts.font || 'bold 13px Georgia,serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);

    // 标题下方短装饰线
    let lineY = y + (opts.lineHeight || 18);
    ctx.strokeStyle = 'rgba(200,168,48,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + Math.min(w - 10, ctx.measureText(text).width + 10), lineY);
    ctx.stroke();
    ctx.restore();

    return lineY + 6;
  },

  // ─── 绘制黄铜按钮 ─────────────────────────────
  drawButton(ctx, x, y, w, h, text, opts) {
    opts = opts || {};
    let hovered = opts.hovered || false;
    let active = opts.active || false;
    let disabled = opts.disabled || false;
    let style = opts.style || 'default'; // default, success, danger, info
    let r = opts.radius !== undefined ? opts.radius : 2;

    ctx.save();

    if (disabled) {
      ctx.globalAlpha = 0.35;
    }

    // 按钮底色
    let baseColor, hoverColor, borderColor, textColor;
    switch (style) {
      case 'success':
        baseColor = 'rgba(60,80,45,0.5)';
        hoverColor = 'rgba(80,110,55,0.6)';
        borderColor = 'rgba(120,160,90,0.35)';
        textColor = '#a0c090';
        break;
      case 'danger':
        baseColor = 'rgba(80,40,30,0.5)';
        hoverColor = 'rgba(110,50,35,0.6)';
        borderColor = 'rgba(180,80,60,0.35)';
        textColor = '#d09080';
        break;
      case 'info':
        baseColor = 'rgba(40,55,70,0.5)';
        hoverColor = 'rgba(50,70,90,0.6)';
        borderColor = 'rgba(100,140,170,0.35)';
        textColor = '#90b0c0';
        break;
      default:
        baseColor = 'rgba(50,38,20,0.55)';
        hoverColor = 'rgba(70,52,28,0.65)';
        borderColor = 'rgba(180,140,80,0.28)';
        textColor = '#c8b070';
    }

    let bg = hovered ? hoverColor : baseColor;
    let bd = hovered ? CT.borderH : borderColor;

    // 按钮背景（圆角 + 渐变）
    CT.roundRectPath(ctx, x, y, w, h, r);
    let grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, bg.replace('0.5', '0.6').replace('0.6', '0.7'));
    ctx.fillStyle = grad;
    ctx.fill();

    // 边框
    CT.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = bd;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 顶部高光
    ctx.beginPath();
    ctx.moveTo(x + r + 1, y + 1);
    ctx.lineTo(x + w - r - 1, y + 1);
    ctx.strokeStyle = 'rgba(200,168,48,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 文字
    ctx.fillStyle = textColor;
    ctx.font = opts.font || 'bold 11px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);

    ctx.restore();

    // 返回悬停区域
    return { x, y, w, h };
  },

  // ─── 绘制标签页按钮 ───────────────────────────
  drawTab(ctx, x, y, w, h, text, active, hovered) {
    ctx.save();
    let r = 3;

    // 底色
    if (active) {
      CT.roundRectPath(ctx, x, y, w, h, r);
      let grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(200,168,48,0.15)');
      grad.addColorStop(1, 'rgba(200,168,48,0.06)');
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      CT.roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = hovered ? 'rgba(40,30,18,0.5)' : 'rgba(25,18,10,0.6)';
      ctx.fill();
    }

    // 边框
    CT.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = active ? CT.borderH : (hovered ? 'rgba(180,140,80,0.2)' : 'rgba(180,140,80,0.1)');
    ctx.lineWidth = active ? 1.5 : 1;
    ctx.stroke();

    // 活跃时底部高亮线
    if (active) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + h - 1);
      ctx.lineTo(x + w - 4, y + h - 1);
      ctx.strokeStyle = CT.brass;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 文字
    ctx.fillStyle = active ? CT.textH : (hovered ? '#c0b090' : CT.textM);
    ctx.font = 'bold 12px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);

    ctx.restore();
  },

  // ─── 绘制速度按钮 ─────────────────────────────
  drawSpeedBtn(ctx, x, y, w, h, speed, active, disabled) {
    ctx.save();
    let r = 2;

    CT.roundRectPath(ctx, x, y, w, h, r);
    if (disabled) {
      ctx.fillStyle = active ? 'rgba(200,168,48,0.08)' : 'rgba(180,140,80,0.04)';
    } else {
      ctx.fillStyle = active ? 'rgba(200,168,48,0.2)' : 'rgba(180,140,80,0.08)';
    }
    ctx.fill();

    CT.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = active ? CT.brass : 'rgba(180,140,80,0.15)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = active
      ? (disabled ? 'rgba(200,184,138,0.5)' : CT.ink)
      : (disabled ? 'rgba(200,180,150,0.15)' : CT.textD);
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x' + speed, x + w / 2, y + h / 2);

    ctx.restore();
  },

  // ─── 绘制信息标签（左侧色条 + 文字） ──────────
  drawInfoRow(ctx, x, y, w, label, value, valueColor) {
    ctx.save();
    ctx.fillStyle = CT.textM;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y);

    if (value !== undefined && value !== null) {
      ctx.fillStyle = valueColor || CT.text;
      ctx.textAlign = 'right';
      ctx.fillText(String(value), x + w - 10, y);
    }
    ctx.restore();
  },

  // ─── 绘制进度条 ───────────────────────────────
  drawProgressBar(ctx, x, y, w, h, ratio, color) {
    ctx.save();
    // 背景
    CT.roundRectPath(ctx, x, y, w, h, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // 进度
    if (ratio > 0) {
      CT.roundRectPath(ctx, x, y, w * Math.max(0, Math.min(1, ratio)), h, 1);
      ctx.fillStyle = color || CT.success;
      ctx.fill();
    }

    // 细边框
    CT.roundRectPath(ctx, x, y, w, h, 1);
    ctx.strokeStyle = 'rgba(180,140,80,0.15)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  },

  // ─── 绘制面板顶部装饰线 ──────────────────────
  drawOrnamentLine(ctx, x, y, w) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,168,48,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();
  },

  // ─── 绘制面板顶部装饰横幅 ────────────────────
  drawHeaderBanner(ctx, x, y, w, text, accentColor) {
    ctx.save();
    // 装饰线
    CT.drawOrnamentLine(ctx, x + 8, y + 2, w - 16);

    // 标题
    ctx.fillStyle = CT.textH;
    ctx.font = 'bold 13px Georgia,serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + 12, y + 10);

    // 标题下方短线
    ctx.strokeStyle = accentColor || CT.brass;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 28);
    ctx.lineTo(x + 12 + ctx.measureText(text).width + 8, y + 28);
    ctx.stroke();

    ctx.restore();
    return y + 34;
  },

  // ─── 徽标/纹章装饰圆形 ───────────────────────
  drawHeraldicBadge(ctx, cx, cy, r, color) {
    ctx.save();
    // 外环
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color || CT.brass;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 内环
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,168,48,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 中心十字
    ctx.strokeStyle = color || CT.brass;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx, cy + r * 0.5);
    ctx.stroke();
    ctx.restore();
  },

  // ─── 绘制关闭按钮（圆角 + 悬停态） ──────────────────
  drawCloseButton(ctx, x, y, w, h, hovered) {
    ctx.save();
    CT.roundRectPath(ctx, x, y, w, h, 2);
    ctx.fillStyle = hovered ? 'rgba(200,60,40,0.5)' : 'rgba(180,60,40,0.2)';
    ctx.fill();
    CT.roundRectPath(ctx, x, y, w, h, 2);
    ctx.strokeStyle = hovered ? 'rgba(255,100,80,0.5)' : 'rgba(200,80,60,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hovered ? '#ff8080' : '#cc6666';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', x + w / 2, y + h / 2);
    ctx.restore();
    return { x, y, w, h };
  },

  // ─── 绘制圆角矩形按钮（含点击区域返回） ──────────────────
  drawRoundedBtn(ctx, x, y, w, h, text, opts) {
    opts = opts || {};
    let hovered = opts.hovered || false;
    let active = opts.active || false;
    let style = opts.style || 'default';
    let r = opts.radius !== undefined ? opts.radius : 2;
    let font = opts.font || 'bold 10px Georgia,serif';

    ctx.save();
    let baseColor, borderColor, textColor;
    switch (style) {
      case 'success':
        baseColor = hovered ? 'rgba(80,110,55,0.65)' : 'rgba(50,70,35,0.55)';
        borderColor = hovered ? 'rgba(140,180,100,0.5)' : 'rgba(100,140,80,0.35)';
        textColor = '#a0c090';
        break;
      case 'danger':
        baseColor = hovered ? 'rgba(110,50,35,0.65)' : 'rgba(70,30,20,0.55)';
        borderColor = hovered ? 'rgba(200,100,70,0.5)' : 'rgba(160,70,50,0.35)';
        textColor = '#d09080';
        break;
      case 'info':
        baseColor = hovered ? 'rgba(50,70,90,0.65)' : 'rgba(35,50,65,0.55)';
        borderColor = hovered ? 'rgba(120,160,190,0.5)' : 'rgba(90,130,160,0.35)';
        textColor = '#90b0c0';
        break;
      case 'highlight':
        baseColor = hovered ? 'rgba(80,60,25,0.65)' : 'rgba(60,40,18,0.55)';
        borderColor = hovered ? 'rgba(220,180,80,0.5)' : 'rgba(200,150,60,0.4)';
        textColor = '#d4b060';
        break;
      default:
        baseColor = hovered ? 'rgba(60,45,25,0.65)' : 'rgba(40,30,16,0.55)';
        borderColor = hovered ? 'rgba(200,168,48,0.45)' : 'rgba(180,140,80,0.25)';
        textColor = '#c8b070';
    }

    CT.roundRectPath(ctx, x, y, w, h, r);
    let grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, baseColor.replace(/0\.\d+/, (m) => String(parseFloat(m) + 0.1)));
    ctx.fillStyle = grad;
    ctx.fill();

    CT.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 顶部高光
    ctx.beginPath();
    ctx.moveTo(x + r + 1, y + 1);
    ctx.lineTo(x + w - r - 1, y + 1);
    ctx.strokeStyle = 'rgba(200,168,48,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();

    return { x, y, w, h };
  },

  // ─── 绘制小图标按钮（emoji按钮） ──────────────────
  drawIconBtn(ctx, x, y, w, h, emoji, label, hovered, style) {
    ctx.save();
    style = style || 'default';
    let baseColor, borderColor;
    switch (style) {
      case 'success': baseColor = hovered ? 'rgba(80,110,55,0.6)' : 'rgba(50,70,35,0.5)'; borderColor = 'rgba(120,160,90,0.35)'; break;
      case 'danger': baseColor = hovered ? 'rgba(110,50,35,0.6)' : 'rgba(70,30,20,0.5)'; borderColor = 'rgba(180,80,60,0.35)'; break;
      case 'info': baseColor = hovered ? 'rgba(50,70,90,0.6)' : 'rgba(35,50,65,0.5)'; borderColor = 'rgba(100,140,170,0.35)'; break;
      default: baseColor = hovered ? 'rgba(60,45,25,0.6)' : 'rgba(40,30,16,0.5)'; borderColor = 'rgba(180,140,80,0.25)'; break;
    }
    CT.roundRectPath(ctx, x, y, w, h, 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    CT.roundRectPath(ctx, x, y, w, h, 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = CT.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x + w / 2, y + h / 2 - 1);
    if (label) {
      ctx.fillStyle = CT.textM;
      ctx.font = '8px sans-serif';
      ctx.fillText(label, x + w / 2, y + h / 2 + 10);
    }
    ctx.restore();
    return { x, y, w, h };
  },

  // ─── 绘制快速面板（轻量圆角矩形） ──────────────────
  drawQuickPanel(ctx, x, y, w, h, accentColor) {
    ctx.save();
    CT.roundRectPath(ctx, x, y, w, h, 3);
    ctx.fillStyle = CT.bg;
    ctx.fill();
    CT.roundRectPath(ctx, x, y, w, h, 3);
    ctx.strokeStyle = CT.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (accentColor) {
      ctx.fillStyle = accentColor;
      CT.roundRectPath(ctx, x + 1, y + 4, 2.5, h - 8, 1);
      ctx.fill();
    }
    ctx.restore();
    return { x, y, w, h };
  },

  // ─── 绘制信息行（左标签 + 右值，含分隔线） ──────────────────
  drawInfoLine(ctx, x, y, w, label, value, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.labelColor || CT.textM;
    ctx.font = opts.font || '10px Georgia,serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y);

    if (value !== undefined && value !== null) {
      ctx.fillStyle = opts.valueColor || CT.text;
      ctx.textAlign = 'right';
      ctx.fillText(String(value), x + w - 8, y);
    }

    if (opts.withSeparator) {
      ctx.strokeStyle = 'rgba(180,140,80,0.06)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 16);
      ctx.lineTo(x + w - 4, y + 16);
      ctx.stroke();
    }
    ctx.restore();
  },
};

// 暴露到全局
window.CT = CT;