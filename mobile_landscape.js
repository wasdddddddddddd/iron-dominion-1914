// ═══════════════════════════════════════════════════════════════════════════
// mobile_landscape.js — 手机横屏显示适配（非侵入式）
// ───────────────────────────────────────────────────────────────────────────
// 目标：让「铁与权柄：1914」在手机横屏下正常显示 UI，且【完全不改动任何游戏
//      逻辑 / 渲染源码】——game_core.js、game_ui.js、game_panels.js、config.js、
//      commanderUI.js 等全部保持原样。另一方只需丢入本文件 + ui/mobile_landscape.css
//      并在 index.html 增加两行引用即可整合，不会与任何逻辑改动冲突。
//
// 原理：
//  1) 手机横屏矮屏时，画布按「设计分辨率」渲染：高度补足到 ≥500px，使原本为桌面
//     设计的固定面板高度（顶栏40 + 底栏48 + 标签条36 + 标签面板350 ≈ 474）不致
//     溢出屏幕顶部。画布位图（设计分辨率）再由浏览器等比缩放到物理屏幕，整套 UI
//     按比例缩小、不裁剪、不重叠。设计宽高比 = 物理宽高比，故无拉伸畸变。
//  2) 游戏输入直接把 e.clientX 当作画布坐标（依赖画布铺满视口、1:1）。引入设计
//     分辨率后，在 document 的「捕获阶段」监听器里把 clientX/clientY 重映射到设计
//     坐标——这样游戏的 pointerdown/move/up、wheel、contextmenu 等处理器拿到的就是
//     与画布一致的设计坐标，其余代码完全无感知。桌面端 scale=1 时重映射为恒等，零影响。
//  3) 手机竖屏时弹出「请横屏使用」提示，不进行缩放（宽 UI 不适合竖屏）。
//
// 注意：本文件必须在 mobile.js 之后加载（defer 顺序），以保证 mobile.js 合成的
//       wheel/contextmenu 事件也会经过这里的坐标重映射。
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    // —— 兼容兜底：补声明游戏遗漏的滚动变量（与手机适配无关，属游戏原有 bug）——
    // game_core.js 的滚轮处理器读取 _diploScroll / _diploMaxScroll，但这两个变量
    // 从未用 let/var 声明（对比 _navyPanelScroll 等已在 shipProductionUI.js 声明）。
    // 外交面板未绘制时滚轮进入 diplomacy 分支会抛 ReferenceError。此处补 0 初值，
    // 不改变任何已赋值状态（typeof 检查），逻辑方可在 game_panels.js 正式声明覆盖。
    if (typeof window._diploScroll === 'undefined') window._diploScroll = 0;
    if (typeof window._diploMaxScroll === 'undefined') window._diploMaxScroll = 0;

    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // 设计分辨率高度下限：保证桌面固定面板不溢出（见上方注释的 474 估算，留余量取 500）
    var MIN_DESIGN_H = 500;

    // 运行时状态
    var active = false;        // 是否启用了横屏设计分辨率（即是否需要坐标重映射）
    var scaleX = 1, scaleY = 1; // 设计坐标 = (物理 clientX - rect.left) * scaleX

    // —— 窄屏提亮暗色文字（仅触屏横屏窄屏，不改游戏代码）——
    // 游戏 CT.textD(0.3透明度) / CT.textM(0.5透明度) 及多处硬编码
    // rgba(200,180,150,0.3~0.6) 在手机小屏上过暗难读。
    // 窄屏时：①覆写 CT.textD/textM 提亮；②拦截 ctx.fillStyle 将该色系提亮。
    // 桌面端完全不受影响（不 hook、不覆写）。
    var _origCT_textD = null, _origCT_textM = null, _ctSaved = false;
    function updateTextBrightness(narrow) {
        if (typeof CT === 'undefined') return;
        if (!_ctSaved) { _origCT_textD = CT.textD; _origCT_textM = CT.textM; _ctSaved = true; }
        if (narrow) {
            CT.textD = 'rgba(212,192,160,0.85)';
            CT.textM = 'rgba(212,192,160,0.9)';
        } else {
            CT.textD = _origCT_textD;
            CT.textM = _origCT_textM;
        }
    }
    // 拦截 ctx.fillStyle：将硬编码的暗色文字 rgba(200,180,150,≤0.7) 提亮
    var _fsHooked = false, _fsDesc = null;
    function hookFillStyle() {
        if (_fsHooked) return;
        if (typeof ctx === 'undefined') return;
        _fsDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
        if (!_fsDesc || !_fsDesc.set) return;
        Object.defineProperty(ctx, 'fillStyle', {
            get: function () { return _fsDesc.get.call(this); },
            set: function (v) {
                if (typeof v === 'string' && v.indexOf('rgba(200,180,150,') === 0) {
                    var m = v.match(/rgba\(200,180,150,\s*([\d.]+)\)/);
                    if (m && parseFloat(m[1]) < 0.8) v = 'rgba(212,192,160,0.88)';
                }
                _fsDesc.set.call(this, v);
            },
            configurable: true
        });
        _fsHooked = true;
    }
    function unhookFillStyle() {
        if (!_fsHooked) return;
        try { delete ctx.fillStyle; } catch (e) {} // 恢复原型 getter/setter
        _fsHooked = false;
    }

    function isLandscape() {
        // 多信号综合判断：不同浏览器/系统对方向 API 支持不一，任一明确信号即可决断。
        // 优先级：screen.orientation > window.orientation > matchMedia > screen 尺寸 > inner 尺寸
        // 1) screen.orientation.type（现代标准，Chrome/Firefox/Android/iOS16.4+）
        if (screen && screen.orientation && typeof screen.orientation.type === 'string') {
            return screen.orientation.type.indexOf('landscape') >= 0;
        }
        // 2) window.orientation（老 iOS，0/180=竖屏，90/-90=横屏；已废弃但仍可用）
        if (typeof window.orientation === 'number') {
            return window.orientation === 90 || window.orientation === -90;
        }
        // 3) matchMedia（广泛支持，但个别国产内核可能滞后）
        if (window.matchMedia) {
            return window.matchMedia('(orientation: landscape)').matches;
        }
        // 4) screen 物理尺寸（多数设备旋转会交换；iOS 部分版本不交换，故靠后）
        if (screen && screen.width && screen.height) {
            return screen.width >= screen.height;
        }
        // 5) 最终兜底：视口尺寸
        return window.innerWidth >= window.innerHeight;
    }

    // —— 接管游戏原 resizeCanvas（game_ui.js 顶层 function 声明产生 window.resizeCanvas）——
    function applyResize() {
        var w = window.innerWidth, h = window.innerHeight;

        if (isTouch && isLandscape() && h < MIN_DESIGN_H) {
            // 横屏矮屏（手机）：使用设计分辨率，等比放大高度使面板不溢出
            var designH = MIN_DESIGN_H;
            var designW = Math.round(designH * (w / h));
            canvas.width = designW;
            canvas.height = designH;
            scaleX = designW / w;
            scaleY = designH / h;
            active = true;
            hideRotateHint();
            updateTextBrightness(true);   // 窄屏提亮暗色文字
            hookFillStyle();              // 拦截硬编码暗色
        } else {
            // 桌面 / 平板 / 竖屏 / 已足够高：物理分辨率，恒等映射（与原游戏完全一致）
            canvas.width = w;
            canvas.height = h;
            scaleX = 1; scaleY = 1;
            active = false;
            if (isTouch && !isLandscape()) showRotateHint(); else hideRotateHint();
            updateTextBrightness(false);  // 恢复原始色值
            unhookFillStyle();            // 移除拦截
        }
        updateFsBtn();
        updateZoomSlider();
    }

    // 移除游戏自带的 resize 监听（避免它把画布重置回物理分辨率），改用本函数
    try {
        if (window.resizeCanvas) window.removeEventListener('resize', window.resizeCanvas);
    } catch (e) { /* 忽略 */ }
    window.resizeCanvas = applyResize;
    window.addEventListener('resize', applyResize);
    // orientationchange 时多次延迟检查，覆盖不同浏览器的尺寸更新时序
    window.addEventListener('orientationchange', function () {
        setTimeout(applyResize, 100);
        setTimeout(applyResize, 300);
        setTimeout(applyResize, 600);
    });
    // matchMedia change
    if (window.matchMedia) {
        var mq = window.matchMedia('(orientation: landscape)');
        if (mq.addEventListener) mq.addEventListener('change', applyResize);
        else if (mq.addListener) mq.addListener(applyResize); // 老浏览器
    }
    // screen.orientation change（现代 API，部分浏览器仅此事件触发）
    if (screen && screen.orientation) {
        if (screen.orientation.addEventListener) screen.orientation.addEventListener('change', applyResize);
        else if (screen.orientation.onchange !== undefined) screen.orientation.onchange = applyResize;
    }
    // 可见性恢复时重新检查（切回标签页兜底）
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) setTimeout(applyResize, 100);
    });
    // 窗口聚焦时重新检查（部分浏览器切应用回来不触发 resize）
    window.addEventListener('focus', function () { setTimeout(applyResize, 120); });
    // —— 低频轮询兜底：部分浏览器/系统旋转时以上事件均不触发或不及时 ——
    //    每 700ms 比较一次方向，仅变化时才 applyResize，开销可忽略。
    var lastLandscape = isLandscape();
    setInterval(function () {
        var cur = isLandscape();
        if (cur !== lastLandscape) { lastLandscape = cur; applyResize(); }
    }, 700);
    applyResize();

    // —— 输入坐标重映射：在捕获阶段把 clientX/clientY 改写为设计坐标 ——
    //    挂在 document（而非 canvas）的捕获阶段，可保证在任何 canvas 监听器之前执行。
    function remap(e) {
        if (!active) return;
        if (Math.abs(scaleX - 1) < 1e-4 && Math.abs(scaleY - 1) < 1e-4) return;
        // 仅处理目标是画布的事件（HTML 覆盖层如国家选择/联机面板走自身 CSS，无需重映射）
        if (e.target !== canvas) return;
        var r = canvas.getBoundingClientRect();
        var nx = (e.clientX - r.left) * scaleX;
        var ny = (e.clientY - r.top) * scaleY;
        try {
            Object.defineProperty(e, 'clientX', { get: function () { return nx; }, configurable: true });
            Object.defineProperty(e, 'clientY', { get: function () { return ny; }, configurable: true });
        } catch (err) { /* 极少数老浏览器不支持，静默回退 */ }
    }
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'contextmenu', 'click', 'dblclick'].forEach(function (t) {
        document.addEventListener(t, remap, true); // true = 捕获阶段
    });

    // —— 单指平移 / 双指框选（仅触屏）——
    // 游戏原逻辑：左键(button0)拖拽=框选，中键(button1)拖拽=平移。手机触摸产生 button0，
    // 故单指拖拽会触发框选而非平移。此处【不改游戏代码】，在 canvas 的捕获阶段拦截触屏
    // 指针事件：
    //   · 单指拖拽 → 直接改写 camX/camY 实现平移，阻断框选
    //   · 双指拖拽 → 以两指实时位置为对角顶点绘制矩形框（用 touchmove 追踪两指位置）
    //   · 三指 → 交给 mobile.js 三指缩放
    //   · 轻点 → 放行让游戏处理点击；长按 → 放行让 mobile.js 合成的 contextmenu（右键）生效
    // 注意：移动端 pointermove 对第二指不可靠（pointer capture 干扰），故双指框选
    //       使用 touchmove 事件（e.touches 包含所有活跃触摸点）来追踪两指实时位置。
    var panSt = { id: null, sx: 0, sy: 0, camX0: 0, camY0: 0, moved: false, t0: 0 };
    var touchPtrs = {};             // pointerId → true（仅用于计数）
    var boxMode = false;            // 双指框选模式标记

    // 将物理坐标重映射为设计坐标（与 remap() 逻辑一致）
    function toDesign(px, py) {
        var r = canvas.getBoundingClientRect();
        return [(px - r.left) * scaleX, (py - r.top) * scaleY];
    }

    canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch') return;
        touchPtrs[e.pointerId] = true;
        var n = Object.keys(touchPtrs).length;
        if (n === 2) {
            // 第二指落下：切换到框选模式，停止平移
            panSt.id = null;
            boxMode = true;
            // 立即用两指当前位置初始化 selBox
            if (typeof G !== 'undefined') {
                G.selBox = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
                isDragging = true;
                boxSelecting = true;
            }
            return;
        }
        if (n >= 3) {
            // 三指：交给 mobile.js 缩放，停止平移和框选
            panSt.id = null;
            boxMode = false;
            try { boxSelecting = false; isDragging = false; if (typeof G !== 'undefined') G.selBox = null; } catch (err) {}
            return;
        }
        if (n !== 1) return;
        if (e.button !== 0) return;
        // 前线绘制模式：不拦截，交给游戏处理
        if (typeof G !== 'undefined' && G.frontlineDrawing) { panSt.id = null; return; }
        boxMode = false;
        panSt.id = e.pointerId;
        panSt.sx = e.clientX; panSt.sy = e.clientY;
        panSt.camX0 = camX; panSt.camY0 = camY;
        panSt.moved = false;
        panSt.t0 = Date.now();
        // 不阻断 pointerdown：让游戏正常 setPointerCapture / 置 boxSelecting=true，
        // 后续靠阻断 pointermove 使 isDragging 保持 false、G.selBox 不生成。
    }, true);

    // pointermove：仅在非 boxMode 时处理（单指平移）
    canvas.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'touch') return;
        // boxMode 下的 pointermove 全部阻断（框选由 touchmove 处理）
        if (boxMode) {
            e.stopImmediatePropagation();
            return;
        }
        if (panSt.id === null || e.pointerId !== panSt.id) return;
        // 阻断游戏的框选拖拽（使其不置 isDragging/G.selBox、不重置 camX）
        e.stopImmediatePropagation();
        var dx = e.clientX - panSt.sx, dy = e.clientY - panSt.sy;
        if (!panSt.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // 死区，避免微抖动误判
        panSt.moved = true;
        var s = zoom * PIXELS_PER_DEGREE;
        if (s > 0) {
            camX = panSt.camX0 - dx / s;
            camY = panSt.camY0 + dy / s;
            if (typeof clampCamera === 'function') clampCamera();
        }
    }, true);

    // touchmove：boxMode 下以两指实时位置为对角顶点设置 G.selBox
    // touchmove 的 e.touches 包含所有活跃触摸点，比 pointermove 对多指更可靠
    canvas.addEventListener('touchmove', function (e) {
        if (!boxMode) return;
        if (e.touches.length < 2) return;
        e.preventDefault(); // 阻止页面滚动
        var t0 = e.touches[0], t1 = e.touches[1];
        var p0 = toDesign(t0.clientX, t0.clientY);
        var p1 = toDesign(t1.clientX, t1.clientY);
        if (typeof G !== 'undefined') {
            G.selBox = { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] };
            isDragging = true;
            boxSelecting = true;
        }
    }, { passive: false });

    function panPointerEnd(e) {
        if (e.pointerType !== 'touch') return;
        delete touchPtrs[e.pointerId];
        var remaining = Object.keys(touchPtrs).length;

        if (boxMode) {
            if (remaining === 0) {
                // 最后一指抬起：放行 pointerup 让游戏执行框选命中
                // （此时 boxSelecting=true, isDragging=true, G.selBox 已就绪）
                boxMode = false;
                return; // 不阻断 → 游戏 pointerup 处理框选
            } else {
                // 先抬一指，仍有一指在屏：阻断 pointerup 防止游戏提前处理
                e.stopImmediatePropagation();
                return;
            }
        }

        // 非框选模式：单指平移/轻点/长按
        if (remaining > 0) return; // 其他手指仍在屏上
        if (panSt.id !== e.pointerId) return;
        var moved = panSt.moved;
        var heldLong = (Date.now() - panSt.t0) > 450;
        panSt.id = null;
        if (moved || heldLong) {
            // 平移或长按：阻断游戏的 pointerup，避免误触发点击/框选
            e.stopImmediatePropagation();
            try { boxSelecting = false; isDragging = false; if (typeof G !== 'undefined') G.selBox = null; } catch (err) {}
        }
        // 否则（短点）：放行，让游戏的 pointerup 执行点击命中（选单位/城市/面板按钮）
    }
    canvas.addEventListener('pointerup', panPointerEnd, true);
    canvas.addEventListener('pointercancel', panPointerEnd, true);

    // —— 窄屏缩放滑动条（仅触屏横屏窄屏，不改游戏代码）——
    // 三指缩放在多数手机上不稳定，故在左侧栏旁添加缩放滑动条作为可靠替代。
    // zoom 范围 MIN_ZOOM(0.08) ~ MAX_ZOOM(30.0)，用对数刻度映射到滑动条 0~1000。
    var zoomSlider = null, zoomRange = null, zoomSyncTimer = null;
    function zoomToSlider(z) {
        var lz = Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);
        return Math.round(Math.max(0, Math.min(1, lz)) * 1000);
    }
    function sliderToZoom(v) {
        var t = v / 1000;
        return MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, t);
    }
    function ensureZoomSlider() {
        if (zoomSlider) return;
        zoomSlider = document.createElement('div');
        zoomSlider.id = 'mlZoomSlider';
        var label = document.createElement('span');
        label.className = 'ml-zoom-label';
        label.textContent = '🔍';
        zoomRange = document.createElement('input');
        zoomRange.type = 'range';
        zoomRange.id = 'mlZoomRange';
        zoomRange.min = 0; zoomRange.max = 1000; zoomRange.value = zoomToSlider(zoom);
        zoomRange.setAttribute('aria-label', '地图缩放');
        // 滑动时更新 zoom，保持屏幕中心不变
        zoomRange.addEventListener('input', function (e) {
            e.stopPropagation();
            var nz = sliderToZoom(parseFloat(zoomRange.value));
            nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz));
            if (nz === zoom) return;
            // 保持屏幕中心：记录当前中心世界坐标，缩放后恢复
            var cx = canvas.width / 2, cy = canvas.height / 2;
            var [wx, wy] = screenToWorld(cx, cy);
            zoom = nz;
            var s = zoom * PIXELS_PER_DEGREE;
            camX = wx - (cx - canvas.width / 2) / s;
            camY = wy + (cy - canvas.height / 2) / s;
            if (typeof clampCamera === 'function') clampCamera();
        });
        // 阻止滑动条上的触摸事件传到画布
        ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel'].forEach(function (ev) {
            zoomRange.addEventListener(ev, function (e) { e.stopPropagation(); }, true);
        });
        zoomSlider.appendChild(label);
        zoomSlider.appendChild(zoomRange);
        document.body.appendChild(zoomSlider);
        // 轮询同步：游戏滚轮/其他方式改变 zoom 时更新滑动条
        zoomSyncTimer = setInterval(function () {
            if (!zoomRange) return;
            var expected = zoomToSlider(zoom);
            if (Math.abs(expected - parseFloat(zoomRange.value)) > 2) {
                zoomRange.value = expected;
            }
        }, 200);
    }
    function updateZoomSlider() {
        ensureZoomSlider();
        if (isNarrowMobile()) {
            zoomSlider.style.display = 'flex';
        } else {
            zoomSlider.style.display = 'none';
        }
    }

    // —— 全屏支持（移动端隐藏浏览器地址栏 / 工具栏，占满整个屏幕）——
    //    Fullscreen API 必须由用户手势触发：① 横屏首次触摸自动尝试；② 右上角按钮手动切换。
    //    Android Chrome 生效；iOS Safari 不支持 Fullscreen API（静默失败，靠滚动隐藏地址栏）。
    var fsBtn = null;
    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    function enterFullscreen() {
        var el = document.documentElement;
        var fn = el.requestFullscreen || el.webkitRequestFullscreen;
        if (fn) { try { fn.call(el); } catch (e) { /* iOS 不支持，静默 */ } }
    }
    function toggleFullscreen() {
        if (isFullscreen()) {
            var fn = document.exitFullscreen || document.webkitExitFullscreen;
            if (fn) { try { fn.call(document); } catch (e) {} }
        } else {
            enterFullscreen();
        }
    }
    function ensureFsBtn() {
        if (!fsBtn) {
            fsBtn = document.createElement('div');
            fsBtn.id = 'mlFullscreenBtn';
            fsBtn.innerHTML = '⛶';
            fsBtn.title = '全屏 / 退出全屏';
            fsBtn.addEventListener('click', function (e) {
                e.stopPropagation(); toggleFullscreen();
            });
            document.body.appendChild(fsBtn);
        }
    }
    function updateFsBtn() {
        ensureFsBtn();
        // 仅触屏横屏 且 当前非全屏时显示按钮；已全屏则隐藏（用浏览器自带方式退出）
        if (isTouch && isLandscape() && !isFullscreen()) {
            fsBtn.style.display = 'flex';
        } else {
            fsBtn.style.display = 'none';
        }
    }
    document.addEventListener('fullscreenchange', updateFsBtn);
    document.addEventListener('webkitfullscreenchange', updateFsBtn);
    // 横屏首次触摸自动尝试全屏（仅在横屏时消费，避免竖屏误触）
    function tryAutoFullscreen() {
        if (!isTouch || !isLandscape() || isFullscreen()) return;
        enterFullscreen();
        document.removeEventListener('touchend', tryAutoFullscreen);
        document.removeEventListener('pointerup', tryAutoFullscreen);
    }
    document.addEventListener('touchend', tryAutoFullscreen);
    document.addEventListener('pointerup', tryAutoFullscreen);

    // —— 竖屏旋转提示 ——
    var hint = null;
    function showRotateHint() {
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'rotateHint';
            hint.innerHTML =
                '<div class="rh-icon">⟳</div>' +
                '<div class="rh-title">请横屏使用</div>' +
                '<div class="rh-sub">Rotate your device to landscape</div>';
            document.body.appendChild(hint);
        }
        hint.style.display = 'flex';
    }
    function hideRotateHint() { if (hint) hint.style.display = 'none'; }

    // —— 窄屏面板互斥（仅触屏横屏窄屏，不改游戏代码）——
    // 问题：国家侧边栏(x=10,w=350) 与 左侧标签栏(x=0,w=34) + 左侧展开面板(x=38,w=310)
    // 的 x 坐标大量重叠。桌面屏幕够宽影响不大，手机横屏则严重拥挤。
    // 修复：窄屏下两者互斥——展开左侧面板时不画国家侧边栏（并清除其点击拦截区）。
    // 游戏本身已有类似互斥（打开城市/海军节点面板时关闭左侧面板），此为对称补充。
    function isNarrowMobile() {
        return isTouch && isLandscape() && window.innerHeight < MIN_DESIGN_H;
    }
    // 覆写 drawCountrySidebar：窄屏下整体右移避开左侧栏，并修正点击拦截区
    if (typeof drawCountrySidebar === 'function') {
        var origDrawCountrySidebar = drawCountrySidebar;
        var NARROW_SIDEBAR_DX = 30; // 右移量：避开左侧标签栏(34)
        var NARROW_SIDEBAR_DY = -6; // 上移量：整体上移靠近顶栏
        drawCountrySidebar = function () {
            if (isNarrowMobile() && typeof G !== 'undefined' && G.leftPanel) {
                if (typeof G !== 'undefined') G._sidebarBounds = null; // 清除点击拦截，避免点击穿透
                return;
            }
            if (!isNarrowMobile()) return origDrawCountrySidebar.apply(this, arguments);
            // 窄屏：用 ctx.translate 平移整体绘制，再修正 bounds 供点击拦截使用
            ctx.save();
            ctx.translate(NARROW_SIDEBAR_DX, NARROW_SIDEBAR_DY);
            origDrawCountrySidebar.apply(this, arguments);
            ctx.restore();
            // 修正点击拦截区坐标（原函数内部用的是未平移的逻辑坐标）
            if (G && G._sidebarBounds) {
                G._sidebarBounds.x += NARROW_SIDEBAR_DX;
                G._sidebarBounds.y += NARROW_SIDEBAR_DY;
            }
        };
    }
    // 覆写 drawLeftSidebar：国家侧边栏显示时不展开左侧面板内容（保留标签栏可点）
    if (typeof drawLeftSidebar === 'function') {
        var origDrawLeftSidebar = drawLeftSidebar;
        drawLeftSidebar = function () {
            var hasSidebar = (typeof G !== 'undefined') && (G.selectedProvince || G.diplomacyFocus) && !G.selectedCity;
            if (isNarrowMobile() && hasSidebar && G.leftPanel) {
                var saved = G.leftPanel;
                G.leftPanel = null;       // 临时不展开面板内容
                origDrawLeftSidebar.apply(this, arguments);
                G.leftPanel = saved;       // 恢复状态，用户点标签时仍可切换
                return;
            }
            origDrawLeftSidebar.apply(this, arguments);
        };
    }

    // —— 窄屏：缩短中上新闻横幅宽度（仅触屏横屏窄屏，不改游戏代码）——
    // 原 drawNewsBanner 用固定 bw=500，窄屏过宽。改为按画布宽度自适应缩短。
    if (typeof drawNewsBanner === 'function') {
        var origDrawNewsBanner = drawNewsBanner;
        drawNewsBanner = function () {
            if (!isNarrowMobile()) return origDrawNewsBanner.apply(this, arguments);
            // 临时让 ctx.fillText 绘制时按窄宽度换行：直接复用原函数，但先缩放画布宽度上下文不可行，
            // 故此处自行实现一个窄屏版横幅（逻辑与原函数一致，仅 bw 自适应 + 文字换行）
            if ((!G.newsBanner || G.newsTimer <= 0) && G.newsQueue && G.newsQueue.length > 0) {
                G.newsBanner = G.newsQueue.shift();
                G.newsTimer = 300;
            }
            if (!G.newsBanner || G.newsTimer <= 0) return;
            var alpha = Math.min(1, G.newsTimer / 60);
            var cw = canvas.width;
            var bw = Math.min(320, cw - 100); // 大幅缩短，两侧各留 50px
            var bh = 38;
            var bx = cw / 2 - bw / 2, by = TOP_BAR_HEIGHT + 18;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "rgba(22,16,10,0.9)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = "rgba(255,215,0,0.6)";
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.fillStyle = "#c8a830";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            // 文字过长则逐步缩小字号，保证单行不溢出
            var txt = G.newsBanner;
            var sizes = [15, 13, 11, 10, 9];
            var fontPx = 15;
            for (var si = 0; si < sizes.length; si++) {
                ctx.font = "bold " + sizes[si] + "px sans-serif";
                if (ctx.measureText(txt).width <= bw - 16) { fontPx = sizes[si]; break; }
                fontPx = sizes[si];
            }
            ctx.font = "bold " + fontPx + "px sans-serif";
            ctx.fillText(txt, cw / 2, by + bh / 2);
            ctx.restore();
            G.newsTimer -= 1;
            if (G.newsTimer <= 0) G.newsBanner = null;
        };
    }

    // —— 窄屏：游戏日志位置自适应（仅触屏横屏窄屏，不改游戏代码）——
    // 原 drawGameLog 从 x=4 贴左绘制，与左侧标签栏(w=34)和顶栏重叠。
    // 窄屏下：国家详情页显示时日志移至屏幕右侧，否则在左侧避开标签栏。
    // drawCountrySidebar(行1128) 先于 drawGameLog(行1172) 执行，故 G._sidebarBounds
    // 已在此处就绪，可据此判断国家详情页是否正在显示。
    if (typeof drawGameLog === 'function') {
        var origDrawGameLog = drawGameLog;
        drawGameLog = function () {
            if (!isNarrowMobile()) return origDrawGameLog.apply(this, arguments);
            if (typeof gameLogs === 'undefined' || gameLogs.length === 0) return;
            var LEFT_TAB_W_VAL = 34;
            var yOffset = (selectedProvince && G.playerCountry && G.provinceOwners[selectedProvince.id] === G.playerCountry ? 90 : 45);
            if (G.activeTab) yOffset += 350 + 36;
            var ly = canvas.height - 48 - yOffset;
            // 国家侧边栏可见时（G._sidebarBounds 由 drawCountrySidebar 设置），日志移至屏幕右侧
            var sidebarVisible = (typeof G !== 'undefined') && G._sidebarBounds;
            var logW = Math.min(260, canvas.width - 100);
            var logX = sidebarVisible ? (canvas.width - logW - 10) : (LEFT_TAB_W_VAL + 8);
            var maxLines = 2; // 窄屏只显示 2 行
            ctx.save();
            ctx.fillStyle = "rgba(22,16,10,0.5)";
            ctx.fillRect(logX, ly - 4, logW, maxLines * 14 + 8);
            ctx.fillStyle = "rgba(212,192,160,0.88)";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "top"; // 文字顶部对齐 y，背景与文字对齐
            for (var i = 0; i < Math.min(gameLogs.length, maxLines); i++) {
                ctx.fillText(gameLogs[i].text, logX + 6, ly + i * 14);
            }
            ctx.restore();
        };
    }
})();
