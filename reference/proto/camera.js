/* proto/camera.js
 * Top-down follow camera with smooth pursuit, mouse-wheel zoom, and shake.
 */
(function () {
    'use strict';

    const ProtoCamera = {
        camera: null,
        target: new THREE.Vector3(),
        zoom: 22,
        zoomMin: 14,
        zoomMax: 76,
        pitch: Math.PI / 3.0,    // ~60° down
        yaw: 0,
        followLerp: 9,
        shakeMag: 0,
        shakeDecay: 6,
        _follow: null,
        _snapNext: false,
    };

    ProtoCamera.create = function () {
        const cam = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 600);
        ProtoCamera.camera = cam;
        ProtoCamera.update(0, true);

        window.addEventListener('wheel', e => {
            ProtoCamera.zoom = Math.max(ProtoCamera.zoomMin, Math.min(ProtoCamera.zoomMax, ProtoCamera.zoom + Math.sign(e.deltaY) * 1.6));
        }, { passive: true });

        window.addEventListener('resize', () => {
            cam.aspect = window.innerWidth / window.innerHeight;
            cam.updateProjectionMatrix();
        });
        return cam;
    };

    ProtoCamera.followTarget = function (entity) {
        ProtoCamera._follow = entity;
        ProtoCamera._snapNext = true;
    };
    ProtoCamera.snap = function () { ProtoCamera._snapNext = true; };

    /** Add a transient camera shake. magnitude in world units. */
    ProtoCamera.shake = function (mag = 0.4) {
        ProtoCamera.shakeMag = Math.max(ProtoCamera.shakeMag, mag);
    };

    ProtoCamera.update = function (dt, snap) {
        const cam = ProtoCamera.camera;
        if (!cam) return;
        const doSnap = snap || ProtoCamera._snapNext;
        ProtoCamera._snapNext = false;
        if (ProtoCamera._follow) {
            const t = ProtoCamera._follow.position;
            if (doSnap) {
                ProtoCamera.target.set(t.x, t.y, t.z);
            } else {
                const k = Math.min(1, ProtoCamera.followLerp * dt);
                ProtoCamera.target.x += (t.x - ProtoCamera.target.x) * k;
                ProtoCamera.target.y += (t.y - ProtoCamera.target.y) * k;
                ProtoCamera.target.z += (t.z - ProtoCamera.target.z) * k;
            }
        }
        const d = ProtoCamera.zoom;
        const cy = Math.sin(ProtoCamera.pitch) * d;
        const horiz = Math.cos(ProtoCamera.pitch) * d;
        const cx = Math.sin(ProtoCamera.yaw) * horiz;
        const cz = Math.cos(ProtoCamera.yaw) * horiz;
        // Apply shake offset
        const sx = (Math.random() - 0.5) * ProtoCamera.shakeMag;
        const sz = (Math.random() - 0.5) * ProtoCamera.shakeMag;
        cam.position.set(ProtoCamera.target.x + cx + sx, ProtoCamera.target.y + cy, ProtoCamera.target.z + cz + sz);
        cam.lookAt(ProtoCamera.target.x, ProtoCamera.target.y + 1, ProtoCamera.target.z);
        // Decay shake
        ProtoCamera.shakeMag = Math.max(0, ProtoCamera.shakeMag - dt * ProtoCamera.shakeDecay);
    };

    window.ProtoCamera = ProtoCamera;
})();
