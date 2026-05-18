/* proto/effects.js
 * Rich VFX library:
 *   - Animated click rings (expand + fade)
 *   - AoE telegraph rings with fill animation
 *   - Damage / heal / mana floating text (DOM-projected)
 *   - Hit flashes (sphere burst)
 *   - Particle bursts (sparks, sparkles, magic motes)
 *   - Lingering ground decals (impact stains)
 *   - Swing arcs for melee
 *   - Cast windup glow at caster's feet
 *   - Death particle puffs
 *   - Vignette flash for low HP
 */
(function () {
    'use strict';

    const ProtoEffects = {
        damageNums: [],         // {el, world, vy, ttl, age, arc}
        anim3d: [],             // {mesh, ttl, age, opts, fn}
        particles: [],          // grouped systems
    };

    /* ---------- Damage / heal / mana numbers ---------- */
    ProtoEffects.spawnDamageNumber = function (worldPos, amount, kind = 'physical', isCrit = false) {
        const el = document.createElement('div');
        el.className = 'dmg-num ' + (isCrit ? 'crit' : kind);
        el.textContent = (kind === 'heal' ? '+' : '') + Math.max(0, Math.floor(amount));
        document.body.appendChild(el);
        ProtoEffects.damageNums.push({
            el, world: { x: worldPos.x, y: worldPos.y || 1.5, z: worldPos.z },
            ttl: 1.0, age: 0,
            vy: 1.4 + Math.random() * 0.4,
            vx: (Math.random() - 0.5) * 0.6,
            vz: (Math.random() - 0.5) * 0.6,
        });
    };
    ProtoEffects.spawnFloatText = function (worldPos, text, color = '#f1d28a', size = 14) {
        const el = document.createElement('div');
        el.className = 'float-text';
        el.style.color = color;
        el.style.fontSize = size + 'px';
        el.textContent = text;
        document.body.appendChild(el);
        ProtoEffects.damageNums.push({
            el, world: { x: worldPos.x, y: worldPos.y || 1.6, z: worldPos.z },
            ttl: 1.4, age: 0, vy: 1.0, vx: 0, vz: 0,
        });
    };

    /* ---------- Click feedback (animated ring, always on top) ---------- */
    ProtoEffects.spawnClickRing = function (x, z, color = '#6ef58e') {
        const c = new THREE.Color(color);
        const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 32), mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.04, z);
        ring.renderOrder = 7500;
        ProtoScene.effectsRoot.add(ring);
        const startOuter = 0.28, endR = 1.4;
        ProtoEffects.anim3d.push({
            mesh: ring, ttl: 0.55, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                const s = 1 + t * (endR / startOuter - 1);
                self.mesh.scale.setScalar(s);
                self.mesh.material.opacity = (1 - t) * 0.95;
            },
        });
        const dotMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.20, 16), dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, 0.045, z);
        dot.renderOrder = 7501;
        ProtoScene.effectsRoot.add(dot);
        ProtoEffects.anim3d.push({
            mesh: dot, ttl: 0.30, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(1 - t);
                self.mesh.material.opacity = (1 - t) * 0.9;
            },
        });
    };
    ProtoEffects.spawnAttackRing = function (x, z) {
        ProtoEffects.spawnClickRing(x, z, '#ec5050');
    };

    /* ---------- AoE telegraph (cast wind-up + brief reveal, always on top) ---------- */
    ProtoEffects.spawnAoeTelegraph = function (x, z, radius, durationSec, color = '#ec5050') {
        const c = new THREE.Color(color);
        const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05, radius - 0.18), radius, 64), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.06, z);
        ring.renderOrder = 7600;
        ProtoScene.effectsRoot.add(ring);
        const fillMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
        const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(x, 0.055, z);
        fill.renderOrder = 7599;
        fill.scale.setScalar(0.05);
        ProtoScene.effectsRoot.add(fill);
        ProtoEffects.anim3d.push({
            mesh: ring, ttl: durationSec, age: 0,
            fn(self) { self.mesh.material.opacity = 0.95 * (1 - self.age / self.ttl); },
        });
        ProtoEffects.anim3d.push({
            mesh: fill, ttl: durationSec, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(t);
                self.mesh.material.opacity = 0.30 - t * 0.12;
            },
        });
    };

    /* ---------- Hit flash + spark burst ---------- */
    ProtoEffects.spawnHitFlash = function (worldPos, color = '#ffe0a0', intensity = 1.0) {
        const c = new THREE.Color(color);
        const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 * intensity, depthWrite: false });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.55 * intensity, 16, 12), mat);
        sphere.position.set(worldPos.x, (worldPos.y || 0) + 1.0, worldPos.z);
        ProtoScene.effectsRoot.add(sphere);
        ProtoEffects.anim3d.push({
            mesh: sphere, ttl: 0.18, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(1 + t * 1.2);
                self.mesh.material.opacity = (1 - t) * 0.85;
            },
        });
        // Spark particles
        spawnSparkBurst(worldPos.x, (worldPos.y || 0) + 1.0, worldPos.z, color, 8 * intensity);
    };

    function spawnSparkBurst(x, y, z, colorHex, count = 8) {
        const c = new THREE.Color(colorHex);
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1.0, depthWrite: false });
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat);
            m.position.set(x, y, z);
            const ang = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 4;
            const vx = Math.cos(ang) * speed;
            const vz = Math.sin(ang) * speed;
            const vy = 2 + Math.random() * 3;
            ProtoScene.effectsRoot.add(m);
            ProtoEffects.anim3d.push({
                mesh: m, ttl: 0.45, age: 0,
                opts: { vx, vy, vz, gravity: -8 },
                fn(self, dt) {
                    self.opts.vy += self.opts.gravity * dt;
                    self.mesh.position.x += self.opts.vx * dt;
                    self.mesh.position.y += self.opts.vy * dt;
                    self.mesh.position.z += self.opts.vz * dt;
                    self.mesh.material.opacity = 1 - self.age / self.ttl;
                },
            });
        }
    }
    ProtoEffects.spawnSparkBurst = spawnSparkBurst;

    /* ---------- Cast windup glow at caster's feet ---------- */
    ProtoEffects.spawnCastBurst = function (x, z, color = '#c599ff') {
        const c = new THREE.Color(color);
        // Expanding ring at feet
        const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 48), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.08, z);
        ProtoScene.effectsRoot.add(ring);
        ProtoEffects.anim3d.push({
            mesh: ring, ttl: 0.45, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(1 + t * 2.0);
                self.mesh.material.opacity = (1 - t) * 0.9;
            },
        });
        // Upward magic motes
        for (let i = 0; i < 12; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1.0, depthWrite: false });
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat);
            const ang = Math.random() * Math.PI * 2;
            const r = 0.4 + Math.random() * 0.6;
            m.position.set(x + Math.cos(ang) * r, 0.1, z + Math.sin(ang) * r);
            ProtoScene.effectsRoot.add(m);
            ProtoEffects.anim3d.push({
                mesh: m, ttl: 0.55 + Math.random() * 0.2, age: 0,
                opts: { vy: 2 + Math.random() * 2 },
                fn(self, dt) {
                    self.mesh.position.y += self.opts.vy * dt;
                    self.opts.vy *= 0.95;
                    self.mesh.material.opacity = 1 - self.age / self.ttl;
                },
            });
        }
    };

    /* ---------- Melee swing arc ---------- */
    ProtoEffects.spawnSwingArc = function (fromPos, toPos, color = '#ffd388') {
        const c = new THREE.Color(color);
        const dx = toPos.x - fromPos.x, dz = toPos.z - fromPos.z;
        const len = Math.hypot(dx, dz) || 1.5;
        const inner = Math.max(0.8, len * 0.55);
        const outer = inner + 0.55;
        const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        const arc = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 24, 1, -Math.PI / 4, Math.PI / 2), mat);
        arc.rotation.x = -Math.PI / 2;
        arc.rotation.z = -Math.atan2(dz, dx);
        arc.position.set(fromPos.x, 1.0, fromPos.z);
        ProtoScene.effectsRoot.add(arc);
        ProtoEffects.anim3d.push({
            mesh: arc, ttl: 0.22, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.material.opacity = (1 - t) * 0.95;
                self.mesh.position.y = 1.0 + t * 0.4;
            },
        });
    };

    /* ---------- Lightning bolt (vertical strike at a ground point) ---------- */
    ProtoEffects.spawnLightningStrike = function (x, z, color = '#c599ff', height = 12) {
        const c = new THREE.Color(color);
        // Bright vertical beam
        const beamMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.04, height, 8, 1), beamMat);
        beam.position.set(x, height / 2, z);
        ProtoScene.effectsRoot.add(beam);
        ProtoEffects.anim3d.push({
            mesh: beam, ttl: 0.18, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.x = 1 - t * 0.8;
                self.mesh.scale.z = 1 - t * 0.8;
                self.mesh.material.opacity = (1 - t) * 0.95;
            },
        });
        // Ground impact ring
        const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 32), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.07, z);
        ProtoScene.effectsRoot.add(ring);
        ProtoEffects.anim3d.push({
            mesh: ring, ttl: 0.45, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(1 + t * 4);
                self.mesh.material.opacity = (1 - t) * 0.95;
            },
        });
        spawnSparkBurst(x, 0.4, z, color, 16);
    };

    /* ---------- Death puff ---------- */
    ProtoEffects.spawnDeathPuff = function (worldPos, color = '#666666') {
        const c = new THREE.Color(color);
        for (let i = 0; i < 10; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false });
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat);
            m.position.set(worldPos.x + (Math.random() - 0.5) * 0.6, 0.4, worldPos.z + (Math.random() - 0.5) * 0.6);
            ProtoScene.effectsRoot.add(m);
            const vy = 1 + Math.random();
            ProtoEffects.anim3d.push({
                mesh: m, ttl: 0.7 + Math.random() * 0.3, age: 0,
                opts: { vy },
                fn(self, dt) {
                    self.mesh.position.y += self.opts.vy * dt;
                    self.opts.vy *= 0.94;
                    const t = self.age / self.ttl;
                    self.mesh.scale.setScalar(1 + t * 1.5);
                    self.mesh.material.opacity = (1 - t) * 0.85;
                },
            });
        }
    };

    /* ---------- Tick (advance everything) ---------- */
    ProtoEffects.tick = function (dt) {
        // 3D animations
        const cam = ProtoCamera.camera;
        for (let i = ProtoEffects.anim3d.length - 1; i >= 0; i--) {
            const a = ProtoEffects.anim3d[i];
            a.age += dt;
            if (a.fn) a.fn(a, dt);
            if (a.age >= a.ttl) {
                ProtoScene.effectsRoot.remove(a.mesh);
                if (a.mesh.geometry) a.mesh.geometry.dispose();
                if (a.mesh.material) a.mesh.material.dispose();
                ProtoEffects.anim3d.splice(i, 1);
            }
        }
        // Damage numbers (DOM projection)
        if (cam) {
            const tmp = new THREE.Vector3();
            for (let i = ProtoEffects.damageNums.length - 1; i >= 0; i--) {
                const dn = ProtoEffects.damageNums[i];
                dn.age += dt;
                if (dn.age >= dn.ttl) {
                    dn.el.remove();
                    ProtoEffects.damageNums.splice(i, 1);
                    continue;
                }
                dn.world.x += dn.vx * dt;
                dn.world.y += dn.vy * dt;
                dn.world.z += dn.vz * dt;
                dn.vy *= 0.95; // ease
                tmp.set(dn.world.x, dn.world.y, dn.world.z).project(cam);
                const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
                const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
                const opacity = 1 - dn.age / dn.ttl;
                dn.el.style.left = sx + 'px';
                dn.el.style.top  = sy + 'px';
                dn.el.style.opacity = opacity;
                dn.el.style.transform = 'translate(-50%, -50%)';
            }
        }
    };

    /** Clear everything (zone change). */
    ProtoEffects.clearAll = function () {
        for (const dn of ProtoEffects.damageNums) { try { dn.el.remove(); } catch {} }
        ProtoEffects.damageNums.length = 0;
        for (const a of ProtoEffects.anim3d) {
            try { ProtoScene.effectsRoot.remove(a.mesh); a.mesh.geometry && a.mesh.geometry.dispose(); a.mesh.material && a.mesh.material.dispose(); } catch {}
        }
        ProtoEffects.anim3d.length = 0;
    };

    window.ProtoEffects = ProtoEffects;
})();
