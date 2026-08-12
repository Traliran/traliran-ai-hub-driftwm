/* ============================================================
   DriftWM Infinite Canvas Engine
   Camera (pan/zoom), window manager (drag/resize/snap),
   floating dock (Floating Bar), persistence.
   Global API exposed as window.CANVAS.
   ============================================================ */
(function () {
    'use strict';

    var WS_KEY = 'driftwm_workspace_v1';
    var MIN_SCALE = 0.2;
    var MAX_SCALE = 2.0;
    var SNAP = 14; // snap threshold in world px
    var MIN_W = 240;
    var MIN_H = 130;

    var MODULES = {
        hub:        { id: 'hub',        title: 'Main Hub',       icon: '💎', elementId: 'chatColumn',    def: { x: 40, y: 40, w: 560, h: 640 }, openOnStart: true },
        chats:      { id: 'chats',      title: 'Chat History',   icon: '💬', elementId: 'chatsPanel',    def: { x: 40, y: 720, w: 300, h: 480 }, openOnStart: true },
        config:     { id: 'config',     title: 'Agent Config',   icon: '⚙️', elementId: 'sidebar',       def: { x: 380, y: 720, w: 320, h: 560 }, openOnStart: true },
        notes:      { id: 'notes',      title: 'Notes',          icon: '📝', elementId: 'notesPage',     def: { x: 740, y: 40, w: 520, h: 520 }, openOnStart: true },
        ide:        { id: 'ide',        title: 'AI IDE',         icon: '⚡', iframe: 'ide.html',          def: { x: 1300, y: 40, w: 660, h: 560 }, openOnStart: true },
        sandbox:    { id: 'sandbox',    title: 'Sandbox',        icon: '💻', elementId: 'sandboxColumn', def: { x: 740, y: 600, w: 520, h: 420 }, openOnStart: false },
        playground: { id: 'playground', title: 'RAG Playground', icon: '📚', iframe: 'playground.html',   def: { x: 1300, y: 640, w: 620, h: 480 }, openOnStart: false }
    };

    var ORDER = ['hub', 'chats', 'config', 'notes', 'ide', 'sandbox', 'playground'];

    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
    function mod(v, m) { return ((v % m) + m) % m; }
    function isEditable(t) {
        return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
    }
    function winById(id) {
        for (var i = 0; i < C.windows.length; i++) if (C.windows[i].id === id) return C.windows[i];
        return null;
    }
    function activeWindow() { return C.activeId ? winById(C.activeId) : null; }
    function winByModule(moduleId, pred) {
        for (var i = 0; i < C.windows.length; i++) {
            var w = C.windows[i];
            if (w.module === moduleId && pred(w)) return w;
        }
        return null;
    }

    var C = {
        viewport: null,
        world: null,
        camera: { x: 0, y: 0, scale: 1 },
        windows: [],
        activeId: null,
        zc: 10,
        seq: 0,
        spaceHeld: false,
        panning: false,
        pan: null,
        drag: null,
        dragShift: false,
        autoPan: { on: false, last: 0 },
        resize: null,
        claimed: {},
        dock: null,
        addMenu: null,
        zoomLabel: null,
        guideX: null,
        guideY: null,
        saveTimer: null,
        hint: null,
        tiling: false
    };

    /* ---------------- Rendering ---------------- */

    function render() {
        C.world.style.transform = 'translate(' + C.camera.x + 'px, ' + C.camera.y + 'px) scale(' + C.camera.scale + ')';
        updateGrid();
        if (C.tiling) tileWindows();
    }

    function updateGrid() {
        var minor = 26 * C.camera.scale;
        var major = 130 * C.camera.scale;
        C.viewport.style.backgroundSize = minor + 'px ' + minor + 'px, ' + major + 'px ' + major + 'px';
        C.viewport.style.backgroundPosition =
            mod(C.camera.x, minor) + 'px ' + mod(C.camera.y, minor) + 'px, ' +
            mod(C.camera.x, major) + 'px ' + mod(C.camera.y, major) + 'px';
    }

    function applyPos(w) {
        w.el.style.left = w.x + 'px';
        w.el.style.top = w.y + 'px';
        w.el.style.width = w.w + 'px';
        w.el.style.height = (w.minimized ? 'auto' : w.h + 'px');
    }

    /* ---------------- Window creation ---------------- */

    function ensureContent(w) {
        var content = w.el.querySelector('.drift-content');
        var mod = MODULES[w.module];
        if (mod.iframe) {
            if (!w.iframe) {
                var f = document.createElement('iframe');
                f.className = 'drift-iframe';
                f.loading = 'lazy';
                f.title = w.title;
                f.src = mod.iframe;
                w.iframe = f;
            }
            if (w.iframe.parentNode !== content) content.appendChild(w.iframe);
        } else if (mod.elementId) {
            var el = document.getElementById(mod.elementId);
            if (el) {
                if (el.parentNode !== content) {
                    el.classList.remove('hidden');
                    content.appendChild(el);
                    C.claimed[mod.id] = w.id;
                } else {
                    el.classList.remove('hidden');
                }
            }
        }
    }

    function buildWindowEl(w) {
        var el = document.createElement('div');
        el.className = 'drift-window';
        el.dataset.module = w.module;
        el.dataset.id = w.id;
        el.innerHTML =
            '<div class="drift-header">' +
            '  <span class="drift-dot"></span>' +
            '  <span class="drift-title"></span>' +
            '  <button class="drift-header-btn drift-min" title="Minimize">–</button>' +
            '  <button class="drift-header-btn drift-close" title="Close">✕</button>' +
            '</div>' +
            '<div class="drift-content"></div>' +
            '<div class="drift-resize"></div>';
        el.querySelector('.drift-title').textContent = w.title;

        el.querySelector('.drift-min').addEventListener('click', function (e) {
            e.stopPropagation();
            toggleMinimize(w.id);
        });
        el.querySelector('.drift-close').addEventListener('click', function (e) {
            e.stopPropagation();
            closeWindow(w.id);
        });

        // Focus on any primary click inside the window (capture phase).
        // Window focus only affects z-order/highlight, never DOM focus,
        // so it is safe even when clicking into inputs.
        el.addEventListener('pointerdown', function (e) {
            if (e.button === 0) focus(w.id);
        }, true);

        // Header drag.
        var header = el.querySelector('.drift-header');
        header.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || C.spaceHeld || C.tiling) return;
            if (e.target.closest('.drift-header-btn')) return;
            e.preventDefault();
            startDrag(w, e);
        });

        // Resize handle.
        el.querySelector('.drift-resize').addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || C.tiling) return;
            e.preventDefault();
            e.stopPropagation();
            focus(w.id);
            C.resize = { id: w.id, sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h };
            document.addEventListener('pointermove', onResizeMove);
            document.addEventListener('pointerup', onResizeEnd);
        });

        C.world.appendChild(el);
        return el;
    }

    function createWindow(moduleId, opts) {
        var mod = MODULES[moduleId];
        if (!mod) return null;
        // DOM modules are singletons.
        if (mod.elementId && C.claimed[moduleId]) return winById(C.claimed[moduleId]);

        opts = opts || {};
        var w = {
            id: opts.id || 'win_' + (++C.seq) + '_' + Date.now(),
            module: moduleId,
            title: opts.title || mod.title,
            x: (opts.x !== undefined ? opts.x : mod.def.x),
            y: (opts.y !== undefined ? opts.y : mod.def.y),
            w: (opts.w !== undefined ? opts.w : mod.def.w),
            h: (opts.h !== undefined ? opts.h : mod.def.h),
            minimized: !!opts.minimized,
            closed: !!opts.closed,
            z: (opts.z !== undefined ? opts.z : ++C.zc),
            el: null,
            iframe: null
        };
        w.el = buildWindowEl(w);
        applyPos(w);
        C.windows.push(w);
        if (w.closed) w.el.classList.add('drift-closed');
        if (w.minimized) w.el.classList.add('drift-minimized');
        ensureContent(w);
        if (!w.closed && !w.minimized) w.el.style.zIndex = w.z;
        return w;
    }

    /* ---------------- Focus / open / close / minimize ---------------- */

    function focus(id) {
        var w = winById(id);
        if (!w) return;
        C.activeId = id;
        w.z = ++C.zc;
        w.el.style.zIndex = w.z;
        C.windows.forEach(function (o) {
            o.el.classList.toggle('drift-focused', o.id === id);
        });
        updateDock();
        saveSoon();
    }

    function openWindow(id) {
        var w = winById(id);
        if (!w) return;
        w.closed = false;
        w.minimized = false;
        w.el.classList.remove('drift-closed', 'drift-minimized');
        ensureContent(w);
        applyPos(w);
        focus(w.id);
        if (C.tiling) tileWindows();
    }

    function closeWindow(id) {
        var w = winById(id);
        if (!w) return;
        w.closed = true;
        w.el.classList.add('drift-closed');
        if (C.activeId === id) {
            C.activeId = null;
            var best = null;
            C.windows.forEach(function (o) {
                if (!o.closed && !o.minimized && (!best || o.z > best.z)) best = o;
            });
            if (best) focus(best.id);
        }
        if (C.tiling) tileWindows();
        updateDock();
        saveSoon();
    }

    function toggleMinimize(id) {
        var w = winById(id);
        if (!w) return;
        w.minimized = !w.minimized;
        w.el.classList.toggle('drift-minimized', w.minimized);
        if (!w.minimized) focus(w.id);
        applyPos(w);
        if (C.tiling) tileWindows();
        saveSoon();
    }

    function openModule(moduleId) {
        var mod = MODULES[moduleId];
        if (!mod) return;
        var w;
        if (mod.elementId && C.claimed[moduleId]) {
            w = winById(C.claimed[moduleId]);
        } else {
            w = winByModule(moduleId, function (x) { return !x.closed; });
            if (!w) w = winByModule(moduleId, function () { return true; });
        }
        if (w) {
            openWindow(w.id);
            centerOn(w.id);
        } else {
            w = createWindow(moduleId);
            if (w) { openWindow(w.id); centerOn(w.id); }
        }
    }

    function spawnModule(moduleId) {
        var mod = MODULES[moduleId];
        if (!mod) return;
        var w;
        if (mod.elementId) {
            openModule(moduleId);
            return;
        }
        var count = 0;
        C.windows.forEach(function (x) { if (x.module === moduleId) count++; });
        w = createWindow(moduleId, { title: mod.title + (count > 0 ? ' ' + (count + 1) : '') });
        if (w) { openWindow(w.id); centerOn(w.id); }
    }

    function centerOn(id, animate) {
        var w = winById(id);
        if (!w || w.closed) return;
        var rect = C.viewport.getBoundingClientRect();
        var vw = rect.width, vh = rect.height;
        var scale = clamp(Math.min(vw / w.w, vh / w.h, 1.1), 0.35, 1.2);
        C.camera.scale = Math.round(scale * 100) / 100;
        C.camera.x = vw / 2 - (w.x + w.w / 2) * C.camera.scale;
        C.camera.y = vh / 2 - (w.y + w.h / 2) * C.camera.scale;
        if (animate !== false && !C.tiling) {
            C.world.classList.add('animating');
            clearTimeout(C.animTimer);
            C.animTimer = setTimeout(function () { C.world.classList.remove('animating'); }, 520);
        }
        focus(w.id);
        render();
        updateZoomLabel();
        saveSoon();
    }

    function resetView() {
        C.camera.scale = 1;
        C.camera.x = 0;
        C.camera.y = 0;
        animate();
        render();
        updateZoomLabel();
        saveSoon();
    }

    // Focus a window AND smoothly center the camera on it:
    //   Xc = ViewportWidth / 2  - (WindowX + WindowWidth / 2)
    //   Yc = ViewportHeight / 2 - (WindowY + WindowHeight / 2)
    function focusWindow(id, animate) {
        var w = winById(id);
        if (!w) return;
        openWindow(id);
        centerOn(id, animate);
    }

    function animate() {
        C.world.classList.add('animating');
        clearTimeout(C.animTimer);
        C.animTimer = setTimeout(function () { C.world.classList.remove('animating'); }, 520);
    }

    function zoomAt(cx, cy, factor) {
        var wx = (cx - C.camera.x) / C.camera.scale;
        var wy = (cy - C.camera.y) / C.camera.scale;
        var s = clamp(C.camera.scale * factor, MIN_SCALE, MAX_SCALE);
        s = Math.round(s * 100) / 100;
        C.camera.scale = s;
        C.camera.x = cx - wx * s;
        C.camera.y = cy - wy * s;
        render();
        updateZoomLabel();
        saveSoon();
    }

    /* ---------------- Drag / snap / auto-follow ---------------- */

    function startDrag(w, e) {
        focus(w.id);
        var rect = C.viewport.getBoundingClientRect();
        var px = e.clientX - rect.left;
        var py = e.clientY - rect.top;
        // Store the grab offset so the window stays under the pointer even
        // while the camera pans (edge auto-follow).
        C.drag = {
            id: w.id,
            px: px,
            py: py,
            offX: w.x - (px - C.camera.x) / C.camera.scale,
            offY: w.y - (py - C.camera.y) / C.camera.scale
        };
        C.dragShift = false;
        C.autoPan.on = true;
        C.autoPan.last = performance.now();
        requestAnimationFrame(autoPanTick);
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
    }

    function onDragMove(e) {
        var d = C.drag;
        if (!d) return;
        C.dragShift = !!e.shiftKey;
        var rect = C.viewport.getBoundingClientRect();
        d.px = e.clientX - rect.left;
        d.py = e.clientY - rect.top;
        applyDragPosition();
    }

    function applyDragPosition() {
        var d = C.drag;
        if (!d) return;
        var w = winById(d.id);
        if (!w) return;
        var nx = (d.px - C.camera.x) / C.camera.scale + d.offX;
        var ny = (d.py - C.camera.y) / C.camera.scale + d.offY;
        if (C.dragShift) {
            var snap = computeSnap(w, nx, ny);
            nx = snap.x;
            ny = snap.y;
            showGuides(snap.gx, snap.gy);
        } else {
            hideGuides();
        }
        w.x = Math.round(nx);
        w.y = Math.round(ny);
        applyPos(w);
    }

    function onDragEnd() {
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        C.autoPan.on = false;
        hideGuides();
        C.drag = null;
        C.dragShift = false;
        saveSoon();
    }

    // Edge auto-follow: while the dragged window's pointer sits near the
    // viewport border, smoothly pan the camera in that direction and keep
    // the window glued to the pointer.
    function autoPanTick(now) {
        if (!C.autoPan.on || !C.drag) return;
        var dt = (now - C.autoPan.last) / 1000;
        C.autoPan.last = now;
        if (dt > 0.05) dt = 0.05;
        var rect = C.viewport.getBoundingClientRect();
        var zone = 64;
        var speed = 850; // screen px per second
        var vx = 0, vy = 0;
        if (C.drag.px < zone) vx = (1 - C.drag.px / zone) * speed;
        else if (C.drag.px > rect.width - zone) vx = -(1 - (rect.width - C.drag.px) / zone) * speed;
        if (C.drag.py < zone) vy = (1 - C.drag.py / zone) * speed;
        else if (C.drag.py > rect.height - zone) vy = -(1 - (rect.height - C.drag.py) / zone) * speed;
        if (vx !== 0 || vy !== 0) {
            C.camera.x += vx * dt;
            C.camera.y += vy * dt;
            render();
            applyDragPosition();
        }
        requestAnimationFrame(autoPanTick);
    }

    function computeSnap(w, nx, ny) {
        var right = nx + w.w;
        var bottom = ny + w.h;
        var bestDx = 0, bestDy = 0, gx = null, gy = null;
        var bx = Infinity, by = Infinity;
        C.windows.forEach(function (o) {
            if (o.id === w.id || o.closed || o.minimized) return;
            var l2 = o.x, r2 = o.x + o.w, t2 = o.y, b2 = o.y + o.h;
            var cx2 = l2 + o.w / 2, cy2 = t2 + o.h / 2;
            var candsX = [
                { d: Math.abs(nx - l2), v: l2 },
                { d: Math.abs(nx - r2), v: r2 },
                { d: Math.abs(right - l2), v: l2 - w.w },
                { d: Math.abs(right - r2), v: r2 - w.w },
                { d: Math.abs((nx + w.w / 2) - cx2), v: cx2 - w.w / 2 }
            ];
            candsX.forEach(function (c) {
                if (c.d < SNAP && c.d < bx) { bx = c.d; bestDx = c.v - nx; gx = c.v; }
            });
            var candsY = [
                { d: Math.abs(ny - t2), v: t2 },
                { d: Math.abs(ny - b2), v: b2 },
                { d: Math.abs(bottom - t2), v: t2 - w.h },
                { d: Math.abs(bottom - b2), v: b2 - w.h },
                { d: Math.abs((ny + w.h / 2) - cy2), v: cy2 - w.h / 2 }
            ];
            candsY.forEach(function (c) {
                if (c.d < SNAP && c.d < by) { by = c.d; bestDy = c.v - ny; gy = c.v; }
            });
        });
        return { x: nx + bestDx, y: ny + bestDy, gx: gx, gy: gy };
    }

    function showGuides(gx, gy) {
        var rect = C.viewport.getBoundingClientRect();
        if (gx !== null) {
            C.guideX.style.display = 'block';
            C.guideX.style.left = (C.camera.x + gx * C.camera.scale - rect.left) + 'px';
            C.guideX.style.top = '0px';
            C.guideX.style.width = '1px';
            C.guideX.style.height = rect.height + 'px';
        }
        if (gy !== null) {
            C.guideY.style.display = 'block';
            C.guideY.style.top = (C.camera.y + gy * C.camera.scale - rect.top) + 'px';
            C.guideY.style.left = '0px';
            C.guideY.style.height = '1px';
            C.guideY.style.width = rect.width + 'px';
        }
    }

    function hideGuides() {
        C.guideX.style.display = 'none';
        C.guideY.style.display = 'none';
    }

    /* ---------------- Resize ---------------- */

    function onResizeMove(e) {
        var r = C.resize;
        if (!r) return;
        var w = winById(r.id);
        if (!w) return;
        var dw = (e.clientX - r.sx) / C.camera.scale;
        var dh = (e.clientY - r.sy) / C.camera.scale;
        w.w = Math.max(MIN_W, Math.round(r.ow + dw));
        w.h = Math.max(MIN_H, Math.round(r.oh + dh));
        applyPos(w);
    }

    function onResizeEnd() {
        document.removeEventListener('pointermove', onResizeMove);
        document.removeEventListener('pointerup', onResizeEnd);
        C.resize = null;
        saveSoon();
    }

    /* ---------------- Pan (Space + LMB / MMB) ---------------- */

    function onViewportPointerDown(e) {
        if (C.pan) return;
        var wantPan = (e.button === 1) || (e.button === 0 && C.spaceHeld);
        if (!wantPan) return;
        if (isEditable(e.target)) return;
        e.preventDefault();
        C.pan = { sx: e.clientX, sy: e.clientY, ox: C.camera.x, oy: C.camera.y, id: e.pointerId };
        C.panning = true;
        C.viewport.classList.add('panning');
        try { C.viewport.setPointerCapture(e.pointerId); } catch (err) {}
    }

    function onViewportPointerMove(e) {
        if (!C.pan) return;
        C.camera.x = C.pan.ox + (e.clientX - C.pan.sx);
        C.camera.y = C.pan.oy + (e.clientY - C.pan.sy);
        render();
    }

    function onViewportPointerUp(e) {
        if (!C.pan || e.pointerId !== C.pan.id) return;
        try { C.viewport.releasePointerCapture(e.pointerId); } catch (err) {}
        C.pan = null;
        C.panning = false;
        C.viewport.classList.remove('panning');
        saveSoon();
    }

    /* ---------------- Zoom ---------------- */

    function onWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        var rect = C.viewport.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomAt(cx, cy, factor);
    }

    /* ---------------- Keyboard ---------------- */

    function onKeyDown(e) {
        if (isEditable(e.target)) return;
        if (e.code === 'Space') {
            if (e.target === document.body || e.target === C.viewport) {
                e.preventDefault();
                if (!C.spaceHeld) {
                    C.spaceHeld = true;
                    C.viewport.classList.add('space-held');
                }
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); resetView(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            var rect = C.viewport.getBoundingClientRect();
            zoomAt(rect.width / 2, rect.height / 2, 1.12);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
            e.preventDefault();
            var rect2 = C.viewport.getBoundingClientRect();
            zoomAt(rect2.width / 2, rect2.height / 2, 1 / 1.12);
        }
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            setTiling(!C.tiling);
        }
    }

    function onKeyUp(e) {
        if (e.code === 'Space') {
            C.spaceHeld = false;
            C.viewport.classList.remove('space-held');
        }
    }

    /* ---------------- Dock (Floating Bar) ---------------- */

    function buildDock() {
        var dock = document.createElement('div');
        dock.id = 'drift-dock';

        ORDER.forEach(function (id) {
            var mod = MODULES[id];
            var btn = document.createElement('button');
            btn.className = 'drift-dock-btn';
            btn.type = 'button';
            btn.innerHTML = '<span>' + mod.icon + '</span><span class="tip">' + mod.title + '</span>';
            btn.title = mod.title;
            btn.addEventListener('click', function () {
                openModule(id);
            });
            mod.dockBtn = btn;
            dock.appendChild(btn);
        });

        var sep = document.createElement('div');
        sep.className = 'drift-dock-sep';
        dock.appendChild(sep);

        var add = document.createElement('button');
        add.className = 'drift-dock-btn drift-dock-add';
        add.type = 'button';
        add.innerHTML = '<span>+</span><span class="tip">New window</span>';
        add.title = 'Add module window';
        add.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleAddMenu();
        });
        dock.appendChild(add);

        var sep2 = document.createElement('div');
        sep2.className = 'drift-dock-sep';
        dock.appendChild(sep2);

        var zOut = document.createElement('button');
        zOut.className = 'drift-dock-zoom';
        zOut.textContent = '−';
        zOut.title = 'Zoom out';
        zOut.addEventListener('click', function () {
            var rect = C.viewport.getBoundingClientRect();
            zoomAt(rect.width / 2, rect.height / 2, 1 / 1.15);
        });
        dock.appendChild(zOut);

        C.zoomLabel = document.createElement('button');
        C.zoomLabel.className = 'drift-dock-zoom';
        C.zoomLabel.title = 'Reset view (100%)';
        C.zoomLabel.addEventListener('click', resetView);
        dock.appendChild(C.zoomLabel);

        var zIn = document.createElement('button');
        zIn.className = 'drift-dock-zoom';
        zIn.textContent = '+';
        zIn.title = 'Zoom in';
        zIn.addEventListener('click', function () {
            var rect = C.viewport.getBoundingClientRect();
            zoomAt(rect.width / 2, rect.height / 2, 1.15);
        });
        dock.appendChild(zIn);

        document.body.appendChild(dock);
        C.dock = dock;
        updateZoomLabel();
    }

    function updateZoomLabel() {
        if (C.zoomLabel) C.zoomLabel.textContent = Math.round(C.camera.scale * 100) + '%';
    }

    function buildAddMenu() {
        var menu = document.createElement('div');
        menu.id = 'drift-add-menu';
        ORDER.forEach(function (id) {
            var mod = MODULES[id];
            var item = document.createElement('button');
            item.className = 'menu-item';
            item.type = 'button';
            var sub = mod.iframe ? 'new' : 'focus';
            item.innerHTML = '<span>' + mod.icon + '</span><span>' + mod.title + '</span><span class="mi-sub">' + sub + '</span>';
            item.addEventListener('click', function () {
                hideAddMenu();
                spawnModule(id);
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        C.addMenu = menu;

        document.addEventListener('pointerdown', function (e) {
            if (C.addMenu.style.display === 'flex' && !e.target.closest('#drift-add-menu') && !e.target.closest('.drift-dock-add')) {
                hideAddMenu();
            }
        });
    }

    function toggleAddMenu() {
        if (C.addMenu.style.display === 'flex') { hideAddMenu(); return; }
        var dr = C.dock.getBoundingClientRect();
        C.addMenu.style.display = 'flex';
        C.addMenu.style.right = (window.innerWidth - dr.left + 8) + 'px';
        C.addMenu.style.top = (dr.top + dr.height / 2 - 20) + 'px';
    }

    function hideAddMenu() {
        C.addMenu.style.display = 'none';
    }

    function updateDock() {
        var activeMod = activeWindow() ? activeWindow().module : null;
        ORDER.forEach(function (id) {
            var btn = MODULES[id].dockBtn;
            if (!btn) return;
            btn.classList.toggle('active', activeMod === id);
            var anyOpen = C.windows.some(function (w) { return w.module === id && !w.closed; });
            btn.classList.toggle('off', !anyOpen);
        });
    }

    function buildGuides() {
        C.guideX = document.createElement('div');
        C.guideX.className = 'drift-snap-guide';
        C.guideY = document.createElement('div');
        C.guideY.className = 'drift-snap-guide';
        C.viewport.appendChild(C.guideX);
        C.viewport.appendChild(C.guideY);
    }

    function buildHint() {
        var h = document.createElement('div');
        h.id = 'drift-hint';
        h.innerHTML =
            '<span><kbd>Space</kbd>+Drag / <kbd>MMB</kbd> Pan</span>' +
            '<span><kbd>Ctrl</kbd>+<kbd>Wheel</kbd> Zoom</span>' +
            '<span><kbd>Shift</kbd>+Drag Snap</span>' +
            '<span><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> Tiling</span>';
        document.body.appendChild(h);
    }

    /* ---------------- Persistence ---------------- */

    function saveSoon() {
        clearTimeout(C.saveTimer);
        C.saveTimer = setTimeout(saveState, 400);
    }

    function saveState() {
        var data = {
            v: 1,
            camera: C.camera,
            active: C.activeId,
            tiling: C.tiling,
            windows: C.windows.map(function (w) {
                return {
                    id: w.id,
                    module: w.module,
                    title: w.title,
                    x: w.x, y: w.y, w: w.w, h: w.h,
                    minimized: w.minimized,
                    closed: w.closed,
                    z: w.z
                };
            })
        };
        try { localStorage.setItem(WS_KEY, JSON.stringify(data)); } catch (err) {}
    }

    function restoreState() {
        var raw = null;
        try { raw = localStorage.getItem(WS_KEY); } catch (err) {}
        if (raw) {
            var data = null;
            try { data = JSON.parse(raw); } catch (err) {}
            if (data && data.camera && data.camera.scale) {
                C.camera.x = data.camera.x;
                C.camera.y = data.camera.y;
                C.camera.scale = clamp(data.camera.scale, MIN_SCALE, MAX_SCALE);
                (data.windows || []).forEach(function (s) {
                    if (!MODULES[s.module]) return;
                    if (MODULES[s.module].elementId && C.claimed[s.module]) return;
                    createWindow(s.module, s);
                });
                if (C.windows.length === 0) defaultLayout();
                // Focus most recently focused open window.
                var target = data.active && winById(data.active);
                if (!target || target.closed) {
                    var best = null;
                    C.windows.forEach(function (o) {
                        if (!o.closed && !o.minimized && (!best || o.z > best.z)) best = o;
                    });
                    target = best;
                }
                if (target) { focus(target.id); }
                render();
                if (data.tiling) setTiling(true);
                return;
            }
        }
        defaultLayout();
        var hub = winByModule('hub', function () { return true; });
        if (hub) {
            C.camera.scale = 1;
            var rect = C.viewport.getBoundingClientRect();
            C.camera.x = rect.width / 2 - (hub.x + hub.w / 2);
            C.camera.y = rect.height / 2 - (hub.y + hub.h / 2);
            focus(hub.id);
        }
        render();
    }

    function defaultLayout() {
        ORDER.forEach(function (id) {
            var mod = MODULES[id];
            createWindow(id, { closed: !mod.openOnStart });
        });
    }

    /* ---------------- Auto-tiling ---------------- */

    // Arrange every visible window into a grid that fills the on-screen
    // area (the current camera view, in world coordinates). Re-runs on
    // camera moves/zooms, window open/close/minimize and viewport resizes.
    function tileWindows() {
        if (!C.tiling) return;
        if (!C.viewport || !C.world) return;
        var rect = C.viewport.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var scale = C.camera.scale || 1;
        var vw = rect.width / scale;
        var vh = rect.height / scale;
        var ox = -C.camera.x / scale;
        var oy = -C.camera.y / scale;

        var list = [];
        C.windows.forEach(function (w) {
            if (!w.closed && !w.minimized) list.push(w);
        });
        if (list.length === 0) return;

        var GAP = 6; // px between tiles (world space)
        var cols = Math.ceil(Math.sqrt(list.length));
        var rows = Math.ceil(list.length / cols);
        var gw = (vw - (cols - 1) * GAP) / cols;
        var gh = (vh - (rows - 1) * GAP) / rows;

        list.forEach(function (w, i) {
            var col = i % cols;
            var row = Math.floor(i / cols);
            w.x = Math.round(ox + col * (gw + GAP));
            w.y = Math.round(oy + row * (gh + GAP));
            w.w = Math.round(gw);
            w.h = Math.round(gh);
            applyPos(w);
        });
    }

    function setTiling(on) {
        C.tiling = !!on;
        var btn = document.getElementById('tilingToggleBtn');
        if (btn) btn.classList.toggle('on', C.tiling);
        document.body.classList.toggle('drift-tiling-active', C.tiling);
        if (C.tiling) tileWindows();
        saveSoon();
    }

    /* ---------------- Init ---------------- */

    function bindEvents() {
        C.viewport.addEventListener('pointerdown', onViewportPointerDown);
        C.viewport.addEventListener('pointermove', onViewportPointerMove);
        C.viewport.addEventListener('pointerup', onViewportPointerUp);
        C.viewport.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('resize', function () { updateGrid(); if (C.tiling) tileWindows(); });
        window.addEventListener('beforeunload', saveState);
        window.addEventListener('blur', function () {
            if (C.drag) onDragEnd();
            if (C.resize) onResizeEnd();
            if (C.pan) {
                C.pan = null;
                C.panning = false;
                C.viewport.classList.remove('panning');
            }
        });
    }

    function init() {
        C.viewport = document.getElementById('viewport');
        C.world = document.getElementById('canvas-world');
        if (!C.viewport || !C.world) return;
        buildGuides();
        buildDock();
        buildAddMenu();
        buildHint();

        var tilingBtn = document.getElementById('tilingToggleBtn');
        if (tilingBtn) {
            tilingBtn.addEventListener('click', function () { setTiling(!C.tiling); });
            setTiling(C.tiling);
        }

        bindEvents();
        restoreState();
        updateDock();
        updateZoomLabel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ---------------- Public API ---------------- */
    window.CANVAS = {
        openModule: openModule,
        spawnModule: spawnModule,
        closeModule: function (moduleId) {
            var w = winByModule(moduleId, function () { return true; });
            if (w) closeWindow(w.id);
        },
        toggleModule: function (moduleId) {
            var mod = MODULES[moduleId];
            if (!mod) return;
            var w = mod.elementId
                ? (C.claimed[moduleId] ? winById(C.claimed[moduleId]) : null)
                : winByModule(moduleId, function (x) { return !x.closed; });
            if (w && !w.closed && !w.minimized) {
                closeWindow(w.id);
            } else {
                openModule(moduleId);
            }
        },
        getWindowByModule: function (moduleId) { return winByModule(moduleId, function () { return true; }); },
        centerOn: centerOn,
        focus: focus,
        focusWindow: focusWindow,
        closeWindow: closeWindow,
        toggleMinimize: toggleMinimize,
        setTiling: setTiling,
        toggleTiling: function () { setTiling(!C.tiling); },
        resetView: resetView,
        zoomAt: zoomAt,
        getWindow: winById,
        getState: function () { return { camera: C.camera, active: C.activeId, windows: C.windows }; }
    };
})();
