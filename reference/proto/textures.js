/* proto/textures.js
 * Texture cache + procedural noise textures for terrain/particles.
 */
(function () {
    'use strict';
    const ProtoTex = { cache: new Map(), loader: null };

    ProtoTex.load = function (path, opts = {}) {
        const key = path + '|' + (opts.filter || 'linear');
        if (ProtoTex.cache.has(key)) return ProtoTex.cache.get(key);
        if (!ProtoTex.loader) ProtoTex.loader = new THREE.TextureLoader();
        const tex = ProtoTex.loader.load(path);
        if (opts.filter === 'nearest') {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        if (opts.repeatX || opts.repeatY) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
        }
        ProtoTex.cache.set(key, tex);
        return tex;
    };

    /** Build a soft radial alpha texture used for particles (glows). */
    ProtoTex.softCircle = function (color = '#ffffff') {
        const size = 64;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0,   color);
        grad.addColorStop(0.4, color + 'aa');
        grad.addColorStop(1,   color + '00');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };

    /** Real grass texture from the textures/ folder, tiled. */
    ProtoTex.proceduralGround = function () {
        return ProtoTex.load('textures/Summer_Grass_A.png', { repeatX: 60, repeatY: 60 });
    };

    /** Plaza texture — flowery patch. */
    ProtoTex.proceduralPath = function () {
        return ProtoTex.load('textures/Summer_Flowers.png', { repeatX: 4, repeatY: 4 });
    };

    window.ProtoTex = ProtoTex;
})();
