/* proto/scene.js
 * Three.js scene with rich lighting + atmosphere.
 */
(function () {
    'use strict';

    const ProtoScene = {
        scene: null,
        worldRoot: null,
        entityRoot: null,
        effectsRoot: null,
        groundMesh: null,
        sun: null,
    };

    ProtoScene.create = function () {
        const scene = new THREE.Scene();
        // Cool dusk sky
        scene.background = new THREE.Color(0x4a5d7a);
        scene.fog = new THREE.FogExp2(0x4a5d7a, 0.0085);

        // Lights — warm sun + cool ambient hemi + small fill
        const hemi = new THREE.HemisphereLight(0xfff0d4, 0x2c3a4a, 0.85);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2d6, 1.25);
        sun.position.set(45, 80, 30);
        scene.add(sun);
        ProtoScene.sun = sun;
        const fill = new THREE.DirectionalLight(0x9cb8e0, 0.45);
        fill.position.set(-40, 50, -25);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xd6c4ff, 0.25);
        rim.position.set(0, 30, -50);
        scene.add(rim);

        // Roots
        ProtoScene.worldRoot = new THREE.Group();
        scene.add(ProtoScene.worldRoot);
        ProtoScene.entityRoot = new THREE.Group();
        scene.add(ProtoScene.entityRoot);
        ProtoScene.effectsRoot = new THREE.Group();
        scene.add(ProtoScene.effectsRoot);

        ProtoScene.scene = scene;
        return scene;
    };

    /** Flat textured ground — kept perfectly level so ground decals (selection
     *  rings, click feedback, AoE telegraphs, indicator rings) sit cleanly on
     *  top instead of clipping into hills. */
    ProtoScene.buildOverworldGround = function (size = 600) {
        const geo = new THREE.PlaneGeometry(size, size, 1, 1);
        geo.rotateX(-Math.PI / 2);
        const tex = ProtoTex.proceduralGround();
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isGround = true;
        // Ground writes to depth normally, but the decals we put on top use
        // depthTest:false + renderOrder to stay visible regardless.
        ProtoScene.groundMesh = mesh;
        ProtoScene.worldRoot.add(mesh);
        return mesh;
    };

    /** A circular paved area used as town center. */
    ProtoScene.buildPlaza = function (cx, cz, radius = 12) {
        const geo = new THREE.CircleGeometry(radius, 48);
        geo.rotateX(-Math.PI / 2);
        const tex = ProtoTex.proceduralPath();
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, 0.05, cz);
        ProtoScene.worldRoot.add(mesh);
        return mesh;
    };

    /** Helper to dispose a Three node tree. */
    ProtoScene.disposeNode = function (node) {
        node.traverse(n => {
            if (n.geometry) n.geometry.dispose();
            if (n.material) {
                if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
                else n.material.dispose();
            }
        });
    };

    window.ProtoScene = ProtoScene;
})();
