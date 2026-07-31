// ═══════════════════════════════════════════════════════════════════════════
// Iron & Dominion 1914 — Canvas 渲染主题注入
// 一战沉浸式效果：晕影 · 胶片颗粒 · 暖色调 · 做旧质感
// 非侵入式：通过 requestAnimationFrame 后处理实现
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ─── 主题颜色配置 ───
  const T = {
    // 面板色
    panelBg: 'rgba(22,16,10,0.92)',
    panelBgLight: 'rgba(28,20,14,0.88)',
    panelBorder: 'rgba(180,140,80,0.28)',
    panelBorderStrong: 'rgba(200,168,48,0.4)',

    // 文字色
    text: '#d4c0a0',
    textBright: '#e8d8b0',
    textMuted: 'rgba(200,180,150,0.45)',
    textDim: 'rgba(200,180,150,0.25)',

    // 黄铜色
    gold: '#c8a830',
    goldBright: '#e8d080',
    goldDim: 'rgba(200,168,48,0.35)',
    goldGlow: 'rgba(200,168,48,0.08)',

    // 顶栏
    topBarBg: 'rgba(18,12,6,0.9)',
    topBarBorder: 'rgba(180,140,80,0.22)',

    // 按钮
    btnBg: 'rgba(50,38,20,0.55)',
    btnBorder: 'rgba(180,140,80,0.28)',
    btnText: '#c8b070',
    btnHoverBg: 'rgba(70,52,28,0.65)',
    btnHoverBorder: 'rgba(200,168,48,0.45)',

    // 速度按钮
    speedActive: '#c8a830',
    speedActiveBg: 'rgba(200,168,48,0.2)',
    speedInactiveBg: 'rgba(180,140,80,0.08)',
    speedTextActive: '#1a1008',
    speedTextInactive: 'rgba(200,180,150,0.35)',

    // 标签页
    tabActiveBg: 'rgba(200,168,48,0.1)',
    tabActiveBorder: 'rgba(200,168,48,0.4)',
    tabInactiveBg: 'rgba(30,20,12,0.6)',
    tabInactiveBorder: 'rgba(180,140,80,0.1)',
    tabTextActive: '#e8d8b0',
    tabTextInactive: 'rgba(200,180,150,0.35)',

    // 功能色
    success: '#7a9a5a',
    danger: '#b05040',
    warning: '#b89840',
    info: '#6a8aaa',

    // 地图
    water: '#1a2a38',
    waterDeep: '#0f1a28',
    landNeutral: 'rgba(70,60,45,0.3)',

    // 选择
    selectionBox: 'rgba(200,180,140,0.2)',
    selectionBorder: 'rgba(200,168,48,0.5)',
    focusRing: 'rgba(200,100,40,0.45)',

    // 血量
    hpGreen: '#7a9a5a',
    hpYellow: '#c8a840',
    hpRed: '#b05040',

    // 新闻
    newsBg: 'rgba(28,18,10,0.94)',
    newsBorder: 'rgba(200,168,48,0.3)',
    newsText: '#d4c0a0',

    // 生产面板
    prodBg: 'rgba(22,16,10,0.88)',
    prodBorder: 'rgba(180,140,80,0.22)',
  };

  // 暴露给其他模块使用
  window.UI_THEME = T;

  // ═════════════════════════════════════════════════════════════
  // 帧计数器与后处理状态
  // ═════════════════════════════════════════════════════════════
  let frameCount = 0;
  let lastProcessedFrame = -1;
  let initialized = false;
  let cachedVignette = null;
  let cachedW = 0, cachedH = 0;

  // ═════════════════════════════════════════════════════════════
  // 核心后处理：轻量晕影（缓存渐变，仅在resize时重建）
  // 移除颗粒纹理（高倍速闪烁来源）和多重合成操作
  // ═════════════════════════════════════════════════════════════
  function applyPostEffects(canvas) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    const gameCtx = canvas.getContext('2d');
    if (!gameCtx) return;

    // 缓存渐变 — 只在尺寸变化时重建
    if (!cachedVignette || cachedW !== w || cachedH !== h) {
      cachedW = w; cachedH = h;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w; offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d');

      // 晕影
      const vignette = offCtx.createRadialGradient(
        w * 0.5, h * 0.45, Math.min(w, h) * 0.4,
        w * 0.5, h * 0.45, Math.max(w, h) * 0.72
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.5, 'rgba(8,5,2,0.01)');
      vignette.addColorStop(1, 'rgba(8,5,2,0.12)');
      offCtx.fillStyle = vignette;
      offCtx.fillRect(0, 0, w, h);

      // 暖色调
      offCtx.globalAlpha = 0.02;
      offCtx.fillStyle = '#c8a030';
      offCtx.fillRect(0, 0, w, h);
      offCtx.globalAlpha = 1;

      cachedVignette = offCanvas;
    }

    gameCtx.save();
    gameCtx.globalCompositeOperation = 'source-atop';
    gameCtx.drawImage(cachedVignette, 0, 0);
    gameCtx.restore();
  }

  // ═════════════════════════════════════════════════════════════
  // Hook requestAnimationFrame 实现后处理
  // ═════════════════════════════════════════════════════════════
  let rafHooked = false;

  function hookRAF() {
    if (rafHooked) return;
    rafHooked = true;

    const origRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
      return origRAF.call(window, function(timestamp) {
        frameCount++;
        callback(timestamp);

        // 每5帧处理一次，高倍速(≥32x)时跳过以减少闪烁
        if (frameCount % 5 !== 0) return;
        try {
          // 高倍速时跳过晕影叠加，避免画面抖动
          if (typeof G !== 'undefined' && G.speed >= 32) return;
          const canvas = document.getElementById('gameCanvas');
          if (canvas && frameCount !== lastProcessedFrame) {
            lastProcessedFrame = frameCount;
            applyPostEffects(canvas);
          }
        } catch(e) { /* 静默 */ }
      });
    };
  }

  // ═════════════════════════════════════════════════════════════
  // 启动
  // ═════════════════════════════════════════════════════════════
  function init() {
    if (initialized) return;
    initialized = true;
    hookRAF();
    console.log('[Theme] 一战沉浸式Canvas主题已注入（轻量晕影）');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 600));
  } else {
    setTimeout(init, 600);
  }

})();