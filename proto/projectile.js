/* proto/projectile.js
 * Glowing projectile with particle trail. Optional homing / arc travel.
 */
(function () {
    'use strict';

    const ProtoProj = { list: [] };

    ProtoProj.spawn = function (opts) {
        const p = new ProjectileEntity(opts);
        ProtoProj.list.push(p);
        return p;
    };

    ProtoProj.tick = function (dt) {
        for (let i = ProtoProj.list.length - 1; i >= 0; i--) {
            const p = ProtoProj.list[i];
            p.tick(dt);
            if (p.dead) ProtoProj.list.splice(i, 1);
        }
    };

    ProtoProj.clearAll = function () {
        for (const p of ProtoProj.list) { try { p.kill(); } catch {} }
        ProtoProj.list.length = 0;
    };

    class ProjectileEntity {
        constructor(opts) {
            this.from = opts.from;
            this.target = opts.to || null;
            this.direction = opts.direction || null;       // {dx,dz} (normalized) for directional
            this.maxRange = opts.maxRange || 0;             // for directional
            this.speed = opts.speed || 28;
            this.damage = opts.damage || 0;
            this.damageType = opts.damageType || 'physical';
            this.color = opts.color || 0xffd388;
            this.scale = opts.scale || 1.0;
            this.life = 0; this.maxLife = opts.maxLife || 4;
            this.homing = !!this.target;
            this.onHit = opts.onHit || null;
            this.dead = false;
            this._trailAccum = 0;
            this._distTraveled = 0;

            const mat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 1.0 });
            this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22 * this.scale, 12, 8), mat);
            this.mesh.position.set(opts.from.position.x, 1.2, opts.from.position.z);
            // Halo
            const haloMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.4, depthWrite: false });
            const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55 * this.scale, 12, 8), haloMat);
            this.mesh.add(halo);
            ProtoScene.entityRoot.add(this.mesh);
        }

        tick(dt) {
            this.life += dt;
            if (this.life > this.maxLife) { this.kill(); return; }

            // ---- Directional projectile (no target lock) ----
            if (this.direction) {
                const step = this.speed * dt;
                this.mesh.position.x += this.direction.dx * step;
                this.mesh.position.z += this.direction.dz * step;
                this._distTraveled += step;
                if (this.maxRange && this._distTraveled >= this.maxRange) { this.kill(); return; }
                // Sweep test against hostiles
                const radius = 0.55 * this.scale;
                for (const e of ProtoCombat.allHostilesOf(this.from)) {
                    const dx = e.position.x - this.mesh.position.x;
                    const dz = e.position.z - this.mesh.position.z;
                    if (Math.hypot(dx, dz) <= radius + (e.collisionRadius || 0.55)) {
                        ProtoCombat.dealDamage(this.from, e, this.damage, this.damageType);
                        ProtoEffects.spawnHitFlash(e.position, hexToCss(this.color));
                        ProtoEffects.spawnSparkBurst(e.position.x, 1.0, e.position.z, hexToCss(this.color), 12);
                        ProtoCamera.shake(0.10);
                        ProtoRenderer.hitPause(0.04, 0.2);
                        if (this.onHit) { try { this.onHit(e); } catch {} }
                        this.kill();
                        return;
                    }
                }
                this._tickTrail(dt);
                return;
            }

            // ---- Homing projectile (target lock) ----
            if (!this.target || this.target.dead) { this.kill(); return; }
            const dx = this.target.position.x - this.mesh.position.x;
            const dz = this.target.position.z - this.mesh.position.z;
            const d = Math.hypot(dx, dz);
            if (d <= 0.6) {
                ProtoCombat.dealDamage(this.from, this.target, this.damage, this.damageType);
                ProtoEffects.spawnHitFlash(this.target.position, hexToCss(this.color));
                ProtoEffects.spawnSparkBurst(this.target.position.x, 1.0, this.target.position.z, hexToCss(this.color), 12);
                ProtoCamera.shake(0.10);
                ProtoRenderer.hitPause(0.04, 0.2);
                if (this.onHit) { try { this.onHit(this.target); } catch {} }
                this.kill(); return;
            }
            const step = this.speed * dt;
            const k = step / d;
            this.mesh.position.x += dx * k;
            this.mesh.position.z += dz * k;
            this._tickTrail(dt);
        }

        _tickTrail(dt) {
            this._trailAccum += dt;
            if (this._trailAccum >= 0.025) {
                this._trailAccum = 0;
                spawnTrailPuff(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, this.color, this.scale);
            }
        }

        kill() {
            this.dead = true;
            if (this.mesh && this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
                this.mesh.children.forEach(c => { c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); });
                this.mesh.geometry && this.mesh.geometry.dispose();
                this.mesh.material && this.mesh.material.dispose();
            }
        }
    }

    function spawnTrailPuff(x, y, z, color, scale = 1.0) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, depthWrite: false });
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 8, 6), mat);
        m.position.set(x, y, z);
        ProtoScene.effectsRoot.add(m);
        ProtoEffects.anim3d.push({
            mesh: m, ttl: 0.30, age: 0,
            fn(self) {
                const t = self.age / self.ttl;
                self.mesh.scale.setScalar(1 - t * 0.5);
                self.mesh.material.opacity = (1 - t) * 0.65;
            },
        });
    }

    function hexToCss(hex) {
        return '#' + hex.toString(16).padStart(6, '0');
    }

    window.ProtoProj = ProtoProj;
})();
