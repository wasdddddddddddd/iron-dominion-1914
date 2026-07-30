// mobile.js — 手机触控适配 & 响应式布局
(function() {
    var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return; // PC 端跳过

    // ===== 双指缩放 =====
    var lastPinchDist = 0;
    var pinchCenter = null;

    canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            pinchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && lastPinchDist > 0) {
            e.preventDefault();
            var dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            var delta = (lastPinchDist - dist) * 2;
            lastPinchDist = dist;

            var r = canvas.getBoundingClientRect();
            var sx = pinchCenter.x - r.left;
            var sy = pinchCenter.y - r.top;

            canvas.dispatchEvent(new WheelEvent('wheel', {
                deltaX: 0, deltaY: delta, deltaZ: 0,
                clientX: pinchCenter.x, clientY: pinchCenter.y,
                bubbles: true, cancelable: true
            }));
        }
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) {
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