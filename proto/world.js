/* proto/world.js
 * Single open arena: ground + town plaza + scattered trees/rocks + mob spawns.
 * Spawns enemies in clusters; respawns them after a delay if no player nearby.
 */
(function () {
    'use strict';

    const ProtoWorld = {
        clusters: [],   // { x, z, templateId, count, members: [], radius, respawnSec, members:[{ent, deadAt}] }
        decor: null,
    };

    /** Build the arena. Called once after scene exists. */
    ProtoWorld.build = function () {
        ProtoScene.buildOverworldGround(600);
        // Town plaza at origin (a flat paved circle)
        ProtoScene.buildPlaza(0, 0, 14);

        // Decor (trees, rocks) — keep a wide clear zone around the plaza so mob
        // clusters at radius ~18-22 aren't hidden behind tree foliage.
        const CLEAR_RADIUS = 32;
        const decor = new THREE.Group();
        for (let i = 0; i < 90; i++) {
            const x = (Math.random() - 0.5) * 320;
            const z = (Math.random() - 0.5) * 320;
            if (Math.hypot(x, z) < CLEAR_RADIUS) continue;
            decor.add(makeTree(x, z, 0.8 + Math.random() * 0.7));
        }
        for (let i = 0; i < 40; i++) {
            const x = (Math.random() - 0.5) * 300;
            const z = (Math.random() - 0.5) * 300;
            if (Math.hypot(x, z) < CLEAR_RADIUS) continue;
            decor.add(makeRock(x, z, 0.7 + Math.random() * 0.7));
        }
        // A simple campfire on the plaza for warmth
        decor.add(makeCampfire(0, -6));

        ProtoScene.worldRoot.add(decor);
        ProtoWorld.decor = decor;

        // Mob clusters ringing the plaza, slightly further from spawn so the
        // player can step out without immediate combat.
        ProtoWorld._addCluster({ x:  24, z:   0, templateId: 'grunt',   count: 4, radius: 4 });
        ProtoWorld._addCluster({ x: -24, z:   0, templateId: 'grunt',   count: 4, radius: 4 });
        ProtoWorld._addCluster({ x:   0, z:  26, templateId: 'stalker', count: 3, radius: 4 });
        ProtoWorld._addCluster({ x:   0, z: -26, templateId: 'stalker', count: 3, radius: 4 });
        ProtoWorld._addCluster({ x:  22, z: -22, templateId: 'brute',   count: 2, radius: 4 });
        ProtoWorld._addCluster({ x: -22, z:  22, templateId: 'brute',   count: 2, radius: 4 });
    };

    ProtoWorld._addCluster = function (cfg) {
        const cluster = Object.assign({ members: [], respawnSec: 8 }, cfg);
        for (let i = 0; i < cluster.count; i++) {
            spawnInCluster(cluster);
        }
        ProtoWorld.clusters.push(cluster);
    };

    function spawnInCluster(cluster) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * cluster.radius;
        const x = cluster.x + Math.cos(a) * r;
        const z = cluster.z + Math.sin(a) * r;
        const enemy = new ProtoEnemy(cluster.templateId, { x, z });
        cluster.members.push({ ent: enemy, deadAt: 0 });
        Proto.entities.push(enemy);
    }

    ProtoWorld.notifyEnemyDied = function (enemy) {
        const t = performance.now() / 1000;
        for (const c of ProtoWorld.clusters) {
            for (const m of c.members) {
                if (m.ent === enemy) m.deadAt = t;
            }
        }
    };

    ProtoWorld.tick = function (dt) {
        const t = performance.now() / 1000;
        for (const c of ProtoWorld.clusters) {
            for (let i = c.members.length - 1; i >= 0; i--) {
                const m = c.members[i];
                // Respawn purely on timer — don't gate on player proximity, so
                // close-in clusters keep refilling while the player is fighting.
                if (m.ent.dead && m.deadAt > 0 && t - m.deadAt > c.respawnSec) {
                    const idx = Proto.entities.indexOf(m.ent);
                    if (idx >= 0) Proto.entities.splice(idx, 1);
                    if (m.ent.mesh && m.ent.mesh.parent) m.ent.mesh.parent.remove(m.ent.mesh);
                    c.members.splice(i, 1);
                    spawnInCluster(c);
                }
            }
        }
    };

    function playerNear(cluster, dist) {
        const p = window.Proto && Proto.player;
        if (!p) return false;
        const dx = p.position.x - cluster.x; const dz = p.position.z - cluster.z;
        return (dx * dx + dz * dz) <= dist * dist;
    }

    /* ---- Decor primitives ---- */
    function makeTree(x, z, scale) {
        const grp = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.30 * scale, 1.4 * scale, 8), new THREE.MeshLambertMaterial({ color: 0x6b4226 }));
        trunk.position.y = 0.7 * scale;
        const fol1 = new THREE.Mesh(new THREE.ConeGeometry(1.3 * scale, 1.7 * scale, 8), new THREE.MeshLambertMaterial({ color: 0x2f6b2a }));
        fol1.position.y = 1.6 * scale;
        const fol2 = fol1.clone(); fol2.scale.multiplyScalar(0.78); fol2.position.y = 2.4 * scale;
        const fol3 = fol1.clone(); fol3.scale.multiplyScalar(0.55); fol3.position.y = 3.0 * scale;
        grp.add(trunk, fol1, fol2, fol3);
        grp.position.set(x, 0, z);
        grp.rotation.y = Math.random() * Math.PI * 2;
        // Tagging for the sway tick (use grp itself)
        grp.userData.isTree = true;
        grp.userData.swayPhase = Math.random() * Math.PI * 2;
        grp.userData.foliage = [fol1, fol2, fol3];
        return grp;
    }
    function makeRock(x, z, scale) {
        const grp = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
        for (let i = 0; i < 3; i++) {
            const r = (0.3 + Math.random() * 0.5) * scale;
            const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
            m.position.set((Math.random() - 0.5) * 0.6, r * 0.6, (Math.random() - 0.5) * 0.6);
            m.rotation.set(Math.random(), Math.random(), Math.random());
            grp.add(m);
        }
        grp.position.set(x, 0, z);
        return grp;
    }
    function makeCampfire(x, z) {
        const grp = new THREE.Group();
        const stoneMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
            s.position.set(Math.cos(a) * 0.6, 0.18, Math.sin(a) * 0.6);
            grp.add(s);
        }
        // Logs
        const wood = new THREE.MeshLambertMaterial({ color: 0x4a2a14 });
        const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), wood);
        l1.rotation.z = Math.PI / 2; l1.position.y = 0.3;
        const l2 = l1.clone(); l2.rotation.x = Math.PI / 2;
        grp.add(l1, l2);
        // Fire glow (point light + sphere)
        const fire = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.9 }));
        fire.position.y = 0.7;
        const light = new THREE.PointLight(0xff7733, 1.5, 12);
        light.position.set(0, 1.0, 0);
        grp.add(fire, light);
        // Animate flame
        const startTime = performance.now();
        fire.userData.tick = (now) => {
            const t = (now - startTime) / 1000;
            fire.scale.y = 1 + Math.sin(t * 8) * 0.2;
            fire.material.opacity = 0.85 + Math.sin(t * 12) * 0.1;
            light.intensity = 1.4 + Math.sin(t * 10) * 0.5;
        };
        // Hook into Proto loop via decor.userData.tick — handled in main
        grp.userData.tickAnim = true;
        grp.userData.fireMesh = fire;
        grp.userData.fireLight = light;
        grp.userData.fireStart = startTime;
        grp.position.set(x, 0, z);
        return grp;
    }

    /** Per-frame decor animation (tree sway, campfire flicker). */
    ProtoWorld.tickDecor = function () {
        if (!ProtoWorld.decor) return;
        const now = performance.now() / 1000;
        ProtoWorld.decor.traverse(n => {
            if (n.userData && n.userData.tickAnim && n.userData.fireMesh) {
                const t = now - (n.userData.fireStart / 1000);
                n.userData.fireMesh.scale.y = 1 + Math.sin(t * 8) * 0.2;
                n.userData.fireMesh.material.opacity = 0.85 + Math.sin(t * 12) * 0.1;
                n.userData.fireLight.intensity = 1.4 + Math.sin(t * 10) * 0.5;
            }
            if (n.userData && n.userData.isTree) {
                const wave = Math.sin(now * 0.9 + n.userData.swayPhase) * 0.05;
                for (const f of n.userData.foliage) {
                    f.rotation.z = wave;
                }
            }
        });
    };

    window.ProtoWorld = ProtoWorld;
})();
