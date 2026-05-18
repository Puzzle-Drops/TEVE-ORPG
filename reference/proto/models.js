/* proto/models.js
 * GLB asset preloader. Loads the three satyr-variant GLBs (each ships the body
 * with its weapon baked in) and caches per-variant templates so character.js
 * can clone the right one per-instance.
 *
 * All three GLBs share the same animation library; what differs is which mesh
 * geometry is in the file. Pick clips by suffix ('1H_WepR', '1H_DualWield',
 * '2H') so the visible weapon swings consistently.
 */
(function () {
    'use strict';

    const ProtoModels = {
        loaded: false,
        satyrT1: null, // 1H axe in right hand
        satyrT2: null, // dual-wield axes
        satyrT3: null, // 2H axe
    };

    const SATYR_TARGET_HEIGHT = 1.9; // world units, matches procedural character ~1.8m

    function loadGLB(path) {
        return new Promise((resolve, reject) => {
            new window.GLTFLoader().load(path, resolve, undefined, reject);
        });
    }

    function computeScale(model, targetHeight) {
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        return size.y > 0 ? targetHeight / size.y : 1;
    }

    /** Build a cached entry from a loaded GLTF result. */
    function makeEntry(gltf) {
        return {
            template: gltf.scene,
            animations: gltf.animations,
            scaleFactor: computeScale(gltf.scene, SATYR_TARGET_HEIGHT),
        };
    }

    ProtoModels.preload = async function () {
        if (ProtoModels.loaded) return;
        const base = 'proto/assets/models/satyr/';
        const v = '?v=' + Date.now(); // bust browser cache while we iterate

        const [t1, t2, t3] = await Promise.all([
            loadGLB(base + 'Satyr_t1_1H_Axe_Right.glb' + v),
            loadGLB(base + 'Satyr_t2_Dualwield_Axe.glb' + v),
            loadGLB(base + 'Satyr_t3_2H_Axe.glb' + v),
        ]);

        ProtoModels.satyrT1 = makeEntry(t1);
        ProtoModels.satyrT2 = makeEntry(t2);
        ProtoModels.satyrT3 = makeEntry(t3);

        console.log('[ProtoModels] Satyr T1/T2/T3 loaded —',
            t1.animations.length + ' clips per variant.');

        ProtoModels.loaded = true;
    };

    /** Find a clip whose name contains the given substring. The web-converted
     *  GLBs use bare names like 'Idle_1H_WepR' (no Armature|... wrapping). */
    ProtoModels.findClip = function (clips, substring) {
        return clips.find(c => c.name.includes(substring)) || null;
    };

    window.ProtoModels = ProtoModels;
})();
