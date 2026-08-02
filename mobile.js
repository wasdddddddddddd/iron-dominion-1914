// mobile.js — 手机触控适配 & 响应式布局
(function() {
    var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return; // PC 端跳过

    // ===== 三指缩放 =====
    var lastPinchDist = 0;
    var pinchCenter = null;

    canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length === 3) {
            lastPinchDist = Math.hypot(
                (e.touches[0].clientX + e.touches[1].clientX) / 2 - e.touches[2].clientX,
                (e.touches[0].clientY + e.touches[1].clientY) / 2 - e.touches[2].clientY
            );
            pinchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3,
                y: (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3
            };
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
        if (e.touches.length === 3 && lastPinchDist > 0) {
            e.preventDefault();
            // 用三指形成的三角形平均边长变化来衡量缩放
            var d01 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            var d12 = Math.hypot(e.touches[1].clientX - e.touches[2].clientX, e.touches[1].clientY - e.touches[2].clientY);
            var d20 = Math.hypot(e.touches[2].clientX - e.touches[0].clientX, e.touches[2].clientY - e.touches[0].clientY);
            var avgDist = (d01 + d12 + d20) / 3;
            var delta = (lastPinchDist - avgDist) * 2;
            lastPinchDist = avgDist;

            pinchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3,
                y: (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3
            };

            canvas.dispatchEvent(new WheelEvent('wheel', {
                deltaX: 0, deltaY: delta, deltaZ: 0,
                clientX: pinchCenter.x, clientY: pinchCenter.y,
                bubbles: true, cancelable: true
            }));
        }
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
        if (e.touches.length < 3) {
            lastPinchDist = 0;
            pinchCenter = null;
        }
    });

    // ===== 长按 = 右键 =====
    var longPressTimer = null;
    var longPressTriggered = false;

    canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        longPressTriggered = false;
        longPressTimer = setTimeout(function() {
            longPressTriggered = true;
            var t = e.touches[0] || e.changedTouches[0];
            canvas.dispatchEvent(new PointerEvent('contextmenu', {
                clientX: t.clientX, clientY: t.clientY,
                button: 2, bubbles: true, cancelable: true,
                pointerType: 'touch'
            }));
        }, 600);
    });

    canvas.addEventListener('touchmove', function() {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });

    canvas.addEventListener('touchend', function() {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });

    // ===== 国家选择界面响应式 =====
    function makeCountrySelectResponsive() {
        var list = document.getElementById('countryList');
        if (!list) return;
        var isSmall = window.innerWidth < 600;
        list.style.gridTemplateColumns = isSmall ? '1fr' : '1fr 1fr 1fr';
        list.style.maxWidth = isSmall ? '90vw' : '600px';
        list.style.gap = isSmall ? '8px' : '12px';
    }

    window.addEventListener('resize', makeCountrySelectResponsive);
    // 在 DOM 准备好后执行
    var observer = new MutationObserver(function() {
        var list = document.getElementById('countryList');
        if (list && list.children.length > 0) {
            makeCountrySelectResponsive();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ===== 防止双击缩放和意外滚动 =====
    document.addEventListener('dblclick', function(e) {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    });
})();
