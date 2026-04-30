/* proto/renderer.js
 * WebGL renderer + main loop driving Proto.tick().
 *
 * Includes hit-pause: time can be slowed for a brief moment after big impacts
 * so attacks feel weighty.
 */
(function () {
    'use strict';
    const ProtoRenderer = {
        renderer: null,
        canvas: null,
        running: false,
        lastTime: 0,
        timeScale: 1.0,
        timeScaleTarget: 1.0,
        hitPauseRemaining: 0,
        fps: 0, _fpsAccum: 0, _fpsFrames: 0,
    };

    ProtoRenderer.create = function () {
        const canvas = document.getElementById('proto-canvas');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        ProtoRenderer.renderer = renderer;
        ProtoRenderer.canvas = canvas;
        window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight, false));
        return renderer;
    };

    ProtoRenderer.start = function () {
        if (ProtoRenderer.running) return;
        ProtoRenderer.running = true;
        ProtoRenderer.lastTime = performance.now();
        requestAnimationFrame(loop);
    };

    /** Apply a brief hit pause: scales time down to `scale` for `seconds`. */
    ProtoRenderer.hitPause = function (seconds = 0.05, scale = 0.05) {
        ProtoRenderer.hitPauseRemaining = Math.max(ProtoRenderer.hitPauseRemaining, seconds);
        ProtoRenderer.timeScaleTarget = scale;
    };

    function loop(now) {
        if (!ProtoRenderer.running) return;
        const realDt = Math.min(0.05, (now - ProtoRenderer.lastTime) / 1000);
        ProtoRenderer.lastTime = now;

        // Hit pause: shrink dt, then ease back to 1.0
        if (ProtoRenderer.hitPauseRemaining > 0) {
            ProtoRenderer.hitPauseRemaining -= realDt;
            if (ProtoRenderer.hitPauseRemaining <= 0) {
                ProtoRenderer.timeScaleTarget = 1.0;
            }
        }
        ProtoRenderer.timeScale += (ProtoRenderer.timeScaleTarget - ProtoRenderer.timeScale) * 0.25;
        const dt = realDt * ProtoRenderer.timeScale;

        // FPS tracking
        ProtoRenderer._fpsAccum += realDt;
        ProtoRenderer._fpsFrames++;
        if (ProtoRenderer._fpsAccum >= 0.5) {
            ProtoRenderer.fps = Math.round(ProtoRenderer._fpsFrames / ProtoRenderer._fpsAccum);
            ProtoRenderer._fpsAccum = 0; ProtoRenderer._fpsFrames = 0;
            const dbg = document.getElementById('proto-debug');
            if (dbg && window.Proto && Proto.player) {
                const p = Proto.player;
                dbg.textContent = `FPS ${ProtoRenderer.fps} | xz ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)} | ents ${Proto.entities.length}`;
            } else if (dbg) {
                dbg.textContent = 'FPS ' + ProtoRenderer.fps;
            }
        }

        try {
            if (window.Proto && Proto.tick) Proto.tick(dt, realDt);
            if (ProtoScene.scene && ProtoCamera.camera) {
                ProtoRenderer.renderer.render(ProtoScene.scene, ProtoCamera.camera);
            }
        } catch (err) {
            console.error('[proto loop]', err);
        }
        requestAnimationFrame(loop);
    }

    window.ProtoRenderer = ProtoRenderer;
})();
