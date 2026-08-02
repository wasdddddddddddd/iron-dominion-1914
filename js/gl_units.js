// ===== GLU：WebGL 单位批量渲染器（方案B：混合WebGL） =====
// 只渲染"单位本体 sprite"，UI/装饰/弹道仍用 Canvas2D。
// 原理：全部单位贴图打包进一张图集纹理；每帧把可见单位展开成顶点缓冲，一次 drawArrays 完成，
// 单位数量从 ~800 次 drawImage 降为 1 次 GPU 调用。
// GL canvas 叠在主 canvas 之上，用 fragment discard 挖掉 UI 面板区域（顶栏/底栏/侧栏/弹窗）。
(function () {
    'use strict';
    const VS = [
        'attribute vec2 aCorner;',
        'attribute vec2 aUV;',
        'attribute float aAlpha;',
        'attribute vec3 aColor;',
        'uniform vec2 uViewport;',
        'varying vec2 vUV;',
        'varying float vAlpha;',
        'varying vec3 vColor;',
        'void main(){',
        '  vUV = aUV; vAlpha = aAlpha; vColor = aColor;',
        '  vec2 ndc = aCorner / uViewport * 2.0 - 1.0;',
        '  gl_Position = vec4(ndc, 0.0, 1.0);',
        '}'
    ].join('\n');
    const FS = [
        'precision mediump float;',
        'uniform sampler2D uAtlas;',
        'uniform vec4 uRects[8];',
        'uniform int uRectCount;',
        'uniform bool uDiscardAll;',
        'varying vec2 vUV;',
        'varying float vAlpha;',
        'varying vec3 vColor;',
        'void main(){',
        '  if (uDiscardAll) discard;',
        '  for (int i = 0; i < 8; i++) {',
        '    if (i >= uRectCount) break;',
        '    vec4 r = uRects[i];',
        '    if (gl_FragCoord.x >= r.x && gl_FragCoord.x <= r.x + r.z &&',
        '        gl_FragCoord.y >= r.y && gl_FragCoord.y <= r.y + r.w) discard;',
        '  }',
        '  vec4 c = texture2D(uAtlas, vUV);',
        '  gl_FragColor = vec4(c.rgb * vColor * c.a * vAlpha, c.a * vAlpha);',
        '}'
    ].join('\n');

    let canvasGL = null, gl = null, prog = null, buf = null;
    let aCorner = -1, aUV = -1, aAlpha = -1, aColor = -1;
    let uViewport = null, uAtlas = null, uRects = null, uRectCount = null, uDiscardAll = null;
    let enabled = false;
    let dustUV = null;

    // 图集
    const ATLAS_SIZE = 2048;
    let atlas = null, atlasUV = new Map(), atlasDirty = true;
    let curX = 2, curY = 2, curRowH = 0;

    // 顶点缓冲（单位级数据池，flush 时展开）
    const MAX_UNITS = 16384;
    // 预分配对象池：避免每帧 push 大量小对象造成 GC 卡顿
    let unitPool = new Array(MAX_UNITS);
    for (let i = 0; i < MAX_UNITS; i++) unitPool[i] = { img: null, sx: 0, sy: 0, w: 0, h: 0, flip: false, a: 1, cr: 1, cg: 1, cb: 1, dust: false };
    let unitN = 0;       // 本帧已入池数量
    let verts = new Float32Array(MAX_UNITS * 6 * 8); // 6 顶点 × 8 floats
    let W = 0, H = 0;
    let lastRects = [];

    function makeDustCanvas() {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(4, 4, 0.5, 4, 4, 4);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 8, 8);
        return c;
    }

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('GLU shader error:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    function buildAtlas() {
        if (!atlas) { atlas = document.createElement('canvas'); atlas.width = ATLAS_SIZE; atlas.height = ATLAS_SIZE; }
        const ac = atlas.getContext('2d');
        ac.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
        atlasUV.clear();
        curX = 2; curY = 2; curRowH = 0;
        // 扬尘渐变贴图（程序生成，随图集一起上传）
        const dustCanvas = makeDustCanvas();
        ac.drawImage(dustCanvas, curX, curY);
        dustUV = [curX / ATLAS_SIZE, curY / ATLAS_SIZE, (curX + 8) / ATLAS_SIZE, (curY + 8) / ATLAS_SIZE];
        curX += 10; curRowH = 8;
        const ATLAS_IMG_MAX = 96; // 单位贴图统一降采样上限（原图可达1920×1920，显示时仅十几像素）
        for (let key in UNIT_IMAGES) {
            const img = UNIT_IMAGES[key];
            if (!img || !img.complete || !img.width || !img.height) continue;
            let dw = img.width, dh = img.height;
            const mx = Math.max(dw, dh);
            if (mx > ATLAS_IMG_MAX) { dw = Math.round(dw * ATLAS_IMG_MAX / mx); dh = Math.round(dh * ATLAS_IMG_MAX / mx); }
            if (curX + dw + 2 > ATLAS_SIZE) { curX = 2; curY += curRowH + 2; curRowH = 0; }
            if (curY + dh + 2 > ATLAS_SIZE) { console.warn('GLU atlas full'); break; }
            ac.imageSmoothingEnabled = true;
            if (dw === img.width && dh === img.height) ac.drawImage(img, curX, curY);
            else ac.drawImage(img, curX, curY, dw, dh);
            atlasUV.set(img, [curX / ATLAS_SIZE, curY / ATLAS_SIZE, (curX + dw) / ATLAS_SIZE, (curY + dh) / ATLAS_SIZE]);
            curX += dw + 2;
            curRowH = Math.max(curRowH, dh);
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        } catch (e) {
            // 本地 file:// 打开时图片会污染 canvas，无法上传 GPU → 回退 2D 渲染
            console.warn('GLU: texImage2D failed（本地文件方式打开？）:', e.message);
            gl.deleteTexture(tex);
            enabled = false;
            if (canvasGL && canvasGL.parentNode) canvasGL.parentNode.removeChild(canvasGL);
            if (typeof showToast === 'function' && !window._gluTaintWarned) {
                window._gluTaintWarned = true;
                showToast('WebGL单位加速不可用（直接双击打开html会导致图片跨域）。请用本地服务器：node server/server.js 后访问 http://localhost:1914');
            }
            return;
        }
        atlasDirty = false;
    }

    function init() {
        try {
            canvasGL = document.createElement('canvas');
            canvasGL.id = 'gameGL';
            canvasGL.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
            document.body.appendChild(canvasGL);
            gl = canvasGL.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
            if (!gl) { console.warn('GLU: WebGL unavailable, fallback to Canvas2D'); return false; }
            const vs = compile(gl.VERTEX_SHADER, VS);
            const fs = compile(gl.FRAGMENT_SHADER, FS);
            if (!vs || !fs) return false;
            prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('GLU link error:', gl.getProgramInfoLog(prog)); return false; }
            gl.useProgram(prog);
            aCorner = gl.getAttribLocation(prog, 'aCorner');
            aUV = gl.getAttribLocation(prog, 'aUV');
            aAlpha = gl.getAttribLocation(prog, 'aAlpha');
            aColor = gl.getAttribLocation(prog, 'aColor');
            uViewport = gl.getUniformLocation(prog, 'uViewport');
            uAtlas = gl.getUniformLocation(prog, 'uAtlas');
            uRects = gl.getUniformLocation(prog, 'uRects');
            uRectCount = gl.getUniformLocation(prog, 'uRectCount');
            uDiscardAll = gl.getUniformLocation(prog, 'uDiscardAll');
            buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(aCorner);
            gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 32, 0);
            gl.enableVertexAttribArray(aUV);
            gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 32, 8);
            gl.enableVertexAttribArray(aAlpha);
            gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 32, 16);
            gl.enableVertexAttribArray(aColor);
            gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 32, 20);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            resize();
            enabled = true;
            console.log('GLU: WebGL unit renderer initialized');
        } catch (e) {
            console.error('GLU init failed:', e);
            enabled = false;
        }
        return enabled;
    }

    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        if (!gl) return;
        canvasGL.width = W; canvasGL.height = H;
        gl.viewport(0, 0, W, H);
    }

    function isEnabled() { return enabled; }

    // img: 单位贴图对象; sx/sy: 屏幕中心; w: 显示宽度(像素); h: 显示高度; flip: 水平翻转; alpha
    function pushUnit(img, sx, sy, w, h, flip, alpha) {
        if (!enabled || !img || unitN >= MAX_UNITS) return false;
        if (!atlasUV.has(img)) {
            if (img.complete && img.width) { atlasDirty = true; return false; } // 图集未含此图，稍后重建
            return false; // 未加载完成，2D 兜底
        }
        const u = unitPool[unitN++];
        u.dust = false;
        u.img = img; u.sx = sx; u.sy = sy; u.w = w; u.h = h;
        u.flip = !!flip; u.a = alpha; u.cr = 1; u.cg = 1; u.cb = 1;
        return true;
    }

    // 扬尘粒子（使用程序生成的径向渐变纹理，非图集）
    function pushDust(sx, sy, size, alpha, r, g, b) {
        if (!enabled || unitN >= MAX_UNITS) return;
        const u = unitPool[unitN++];
        u.dust = true;
        u.img = null; u.sx = sx; u.sy = sy; u.w = size; u.h = size;
        u.a = alpha; u.cr = r; u.cg = g; u.cb = b;
    }

    function flush(rects) {
        if (!enabled) return;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (atlasDirty) { buildAtlas(); if (!enabled) return; }
        const n = unitN;
        if (n === 0) { unitN = 0; return; }
        gl.useProgram(prog);
        gl.uniform2f(uViewport, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(uAtlas, 0);
        const useRects = rects || lastRects;
        const rc = Math.min(useRects.length, 8);
        gl.uniform1i(uRectCount, rc);
        gl.uniform1i(uDiscardAll, rc === 0 ? 0 : 0);
        if (rc > 0) {
            const arr = new Float32Array(rc * 4);
            for (let i = 0; i < rc; i++) {
                const r = useRects[i];
                arr[i * 4] = r[0];
                arr[i * 4 + 1] = H - r[1] - r[3];   // y 翻转（GL 坐标向上）
                arr[i * 4 + 2] = r[2];
                arr[i * 4 + 3] = r[3];
            }
            gl.uniform4fv(uRects, arr);
        }
        lastRects = useRects;
        let vi = 0;
        for (let i = 0; i < n; i++) {
            const u = unitPool[i];
            let uv = u.dust ? dustUV : atlasUV.get(u.img);
            if (!uv) continue;
            const hw = u.w / 2, hh = u.h / 2;
            const xl = u.sx - hw, xr = u.sx + hw;
            const yt = u.sy - hh, yb = u.sy + hh;
            const ytF = H - yt, ybF = H - yb;   // y 翻转
            let u0 = uv[0], u1 = uv[2];
            if (u.flip) { const t = u0; u0 = u1; u1 = t; }
            const v0 = uv[1], v1 = uv[3];
            const cr = u.cr, cg = u.cg, cb = u.cb;
            // tri1
            verts[vi++] = xl; verts[vi++] = ytF; verts[vi++] = u0; verts[vi++] = v0; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
            verts[vi++] = xr; verts[vi++] = ytF; verts[vi++] = u1; verts[vi++] = v0; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
            verts[vi++] = xr; verts[vi++] = ybF; verts[vi++] = u1; verts[vi++] = v1; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
            // tri2
            verts[vi++] = xl; verts[vi++] = ytF; verts[vi++] = u0; verts[vi++] = v0; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
            verts[vi++] = xr; verts[vi++] = ybF; verts[vi++] = u1; verts[vi++] = v1; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
            verts[vi++] = xl; verts[vi++] = ybF; verts[vi++] = u0; verts[vi++] = v1; verts[vi++] = u.a; verts[vi++] = cr; verts[vi++] = cg; verts[vi++] = cb;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, vi), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, vi / 8);
        unitN = 0;
    }

    window.GLU = { init: init, resize: resize, isEnabled: isEnabled, pushUnit: pushUnit, pushDust: pushDust, flush: flush };
    window._gluInited = false;
})();

if (typeof GLU !== 'undefined') {
    GLU.init();
    window._gluInited = true;
}
