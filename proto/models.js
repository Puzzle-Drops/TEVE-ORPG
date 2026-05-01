/* proto/models.js
 * GLB asset preloader. Loads the satyr body GLB and its texture once at boot,
 * caches the template so character.js can clone it per-instance.
 */
(function () {
    'use strict';

    const ProtoModels = {
        loaded: false,
        satyr: null,        // { template, animations, scaleFactor }
    };

    const SATYR_TARGET_HEIGHT = 1.9; // world units, matches procedural character ~1.8m

    /** Load a PNG texture as a sRGB-correct map. */
    function loadTexture(path) {
        const tex = new THREE.TextureLoader().load(path);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function loadGLB(path) {
        return new Promise((resolve, reject) => {
            new window.GLTFLoader().load(path, resolve, undefined, reject);
        });
    }

    /** Replace every mesh material with a textured Standard material so the
     *  bundle's lighting reads correctly. */
    function applyTexture(model, diffusePath) {
        const diffuse = loadTexture(diffusePath);
        model.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: diffuse,
                    roughness: 0.85,
                    metalness: 0.05,
                });
            }
        });
    }

    /** Auto-scale a model so its bounding box height matches `targetHeight`. */
    function computeScale(model, targetHeight) {
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        return size.y > 0 ? targetHeight / size.y : 1;
    }

    ProtoModels.preload = async function () {
        if (ProtoModels.loaded) return;
        const base = 'proto/assets/models/satyr/';
        const v = '?v=' + Date.now(); // bust browser cache while we iterate on the GLB

        const satyrGltf = await loadGLB(base + 'Satyr.glb' + v);

        applyTexture(satyrGltf.scene, base + 'T_Satyr_Body_Br_D.png');
        const scale = computeScale(satyrGltf.scene, SATYR_TARGET_HEIGHT);
        ProtoModels.satyr = {
            template: satyrGltf.scene,
            animations: satyrGltf.animations,
            scaleFactor: scale,
        };
        console.log('[ProtoModels] Satyr loaded — animations:',
            satyrGltf.animations.map(a => a.name));

        ProtoModels.loaded = true;
    };

    /** Find a clip whose name contains the given substring (e.g. "Idle_2H"). */
    ProtoModels.findClip = function (clips, substring) {
        return clips.find(c => c.name.includes(substring)) || null;
    };

    window.ProtoModels = ProtoModels;
})();
