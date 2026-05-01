/* proto/character.js
 * Procedural 3D character built from primitives. Composite hierarchy of named
 * parts that we animate per frame: torso, head, arms (L/R), legs (L/R), held
 * weapon. Supports walk / idle / attack / cast / death animations.
 *
 * Returns an API object the entity uses each tick:
 *   character.tick(dt, state)  // state: { moving:bool, casting:bool, dead:bool }
 *   character.playSwing(direction)   // brief weapon swing
 *   character.playCast(durationSec)  // brief two-arm raise
 *   character.playHurt()             // brief flinch + tint flash
 *   character.setFacing(dx, dz)      // turn smoothly toward direction
 *   character.group  // root THREE.Group; entity adds this to scene
 */
(function () {
    'use strict';

    const PRESETS = {
        warrior: {
            bodyColor: 0x803c2c, accentColor: 0xc8a050, skin: 0xf2c8a0,
            weapon: 'sword',
            scale: 1.0,
        },
        ranger: {
            bodyColor: 0x2c5a3a, accentColor: 0xa9d18e, skin: 0xf2c8a0,
            weapon: 'bow',
            scale: 1.0,
        },
        mage: {
            bodyColor: 0x3a3a82, accentColor: 0x88aaff, skin: 0xf2c8a0,
            weapon: 'staff',
            scale: 1.0,
        },
        // Generic enemy preset — slightly hunched, different proportions
        beast: {
            bodyColor: 0x6a4030, accentColor: 0x3a2418, skin: 0x8a5630,
            weapon: 'claws',
            scale: 0.95, hunched: true,
        },
    };

    const ProtoChar = {};

    /** Build a character from a preset key. */
    ProtoChar.create = function (presetKey = 'warrior', opts = {}) {
        // GLB-backed presets — only available once ProtoModels.preload() resolved.
        if ((presetKey === 'satyr_1h' || presetKey === 'satyr_2h') &&
            window.ProtoModels && ProtoModels.loaded) {
            return createSatyr(presetKey, opts);
        }
        const p = Object.assign({}, PRESETS[presetKey] || PRESETS.warrior, opts);
        const root = new THREE.Group();

        // Materials
        const matBody  = new THREE.MeshLambertMaterial({ color: p.bodyColor });
        const matAcc   = new THREE.MeshLambertMaterial({ color: p.accentColor });
        const matSkin  = new THREE.MeshLambertMaterial({ color: p.skin });
        const matDark  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

        // Hip pivot (the parent we move/rotate)
        const hip = new THREE.Group();
        hip.position.y = 1.05 * p.scale;
        root.add(hip);

        // Torso
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * p.scale, 0.7 * p.scale, 8, 14), matBody);
        torso.position.y = 0.0;
        hip.add(torso);

        // Belt
        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.38 * p.scale, 0.06, 8, 18), matAcc);
        belt.rotation.x = Math.PI / 2;
        belt.position.y = -0.30 * p.scale;
        hip.add(belt);

        // Shoulders (small spheres so arms look attached)
        const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.13 * p.scale, 10, 8), matBody);
        const shoulderR = shoulderL.clone();
        shoulderL.position.set(-0.36 * p.scale, 0.32 * p.scale, 0);
        shoulderR.position.set( 0.36 * p.scale, 0.32 * p.scale, 0);
        hip.add(shoulderL, shoulderR);

        // Neck + head
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * p.scale, 0.10 * p.scale, 0.18 * p.scale, 8), matSkin);
        neck.position.y = 0.50 * p.scale;
        hip.add(neck);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.30 * p.scale, 16, 12), matSkin);
        head.position.y = 0.78 * p.scale;
        hip.add(head);
        // Hair / cap
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32 * p.scale, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), matDark);
        hair.position.y = 0.84 * p.scale;
        hair.rotation.x = -0.05;
        hip.add(hair);
        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04 * p.scale, 6, 4), eyeMat);
        const eyeR = eyeL.clone();
        eyeL.position.set(-0.10 * p.scale, 0.78 * p.scale, 0.27 * p.scale);
        eyeR.position.set( 0.10 * p.scale, 0.78 * p.scale, 0.27 * p.scale);
        hip.add(eyeL, eyeR);

        // Arms (pivot from shoulder so they swing naturally).
        const armL = new THREE.Group(); armL.position.copy(shoulderL.position);
        const armR = new THREE.Group(); armR.position.copy(shoulderR.position);
        const upperL = new THREE.Mesh(new THREE.CapsuleGeometry(0.10 * p.scale, 0.40 * p.scale, 6, 8), matBody);
        upperL.position.y = -0.28 * p.scale;
        armL.add(upperL);
        const handL = new THREE.Mesh(new THREE.SphereGeometry(0.10 * p.scale, 8, 6), matSkin);
        handL.position.y = -0.55 * p.scale;
        armL.add(handL);
        const upperR = upperL.clone(); armR.add(upperR);
        const handR = handL.clone(); armR.add(handR);
        hip.add(armL, armR);

        // Weapon attached to right hand (arm tip)
        const weapon = buildWeapon(p.weapon, p.accentColor);
        if (weapon) {
            weapon.position.set(0, -0.6 * p.scale, 0.15);
            armR.add(weapon);
        }

        // Legs (pivot from hip)
        const legL = new THREE.Group(); legL.position.set(-0.16 * p.scale, -0.45 * p.scale, 0);
        const legR = new THREE.Group(); legR.position.set( 0.16 * p.scale, -0.45 * p.scale, 0);
        const lowerLegL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * p.scale, 0.55 * p.scale, 6, 8), matDark);
        lowerLegL.position.y = -0.32 * p.scale;
        legL.add(lowerLegL);
        const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.22 * p.scale, 0.13 * p.scale, 0.32 * p.scale), matAcc);
        bootL.position.set(0, -0.68 * p.scale, 0.04 * p.scale);
        legL.add(bootL);
        const lowerLegR = lowerLegL.clone(); legR.add(lowerLegR);
        const bootR = bootL.clone(); legR.add(bootR);
        hip.add(legL, legR);

        // Cape (just for visual flair — single plane behind shoulders)
        const capeMat = new THREE.MeshLambertMaterial({ color: p.accentColor, side: THREE.DoubleSide });
        const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * p.scale, 0.95 * p.scale), capeMat);
        cape.position.set(0, 0.05 * p.scale, -0.32 * p.scale);
        cape.rotation.x = 0.15;
        hip.add(cape);

        // Shadow disc on the ground
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55 * p.scale, 24), shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        root.add(shadow);

        // ---- API + animation state ----
        const state = {
            walkPhase: 0,
            facingTarget: 0,
            facing: 0,
            swingT: 0, swingTotal: 0, swingSign: 1,
            castT: 0, castTotal: 0,
            hurtT: 0,
            deathT: 0, dying: false,
            preset: p,
            armL, armR, legL, legR, hip, torso, head, cape, weapon, shadow,
            allMaterials: collectMaterials(root),
        };
        if (p.hunched) {
            torso.rotation.x = 0.2;
            head.position.z += 0.10 * p.scale;
        }

        const api = {
            group: root,
            state,
            setFacing(dx, dz) {
                if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
                state.facingTarget = Math.atan2(dx, dz);
            },
            playSwing(side = 1) {
                state.swingT = state.swingTotal = 0.32;
                state.swingSign = side >= 0 ? 1 : -1;
            },
            playCast(durationSec = 0.4) {
                state.castT = state.castTotal = durationSec;
            },
            playHurt() { state.hurtT = 0.15; },
            playDeath() { state.dying = true; state.deathT = 0; },
            reset() {
                state.dying = false; state.deathT = 0;
                hip.rotation.set(0, state.facing, 0);
                root.position.y = 0;
                root.rotation.set(0, 0, 0);
                state.allMaterials.forEach(m => { if (m && m.opacity != null) m.opacity = 1; });
                shadow.material.opacity = 0.35;
            },
            tick(dt, ctrl) {
                tickCharacter(state, dt, ctrl);
            },
        };
        return api;
    };

    function buildWeapon(kind, accentColor) {
        if (kind === 'sword') {
            const grp = new THREE.Group();
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.18), new THREE.MeshLambertMaterial({ color: 0xc4cfe0 }));
            blade.position.y = 0.45;
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, 0.10), new THREE.MeshLambertMaterial({ color: accentColor }));
            guard.position.y = 0.05;
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
            grip.position.y = -0.05;
            const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: accentColor }));
            pommel.position.y = -0.16;
            grp.add(blade, guard, grip, pommel);
            return grp;
        }
        if (kind === 'staff') {
            const grp = new THREE.Group();
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x4a2a14 }));
            shaft.position.y = 0.4;
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshBasicMaterial({ color: 0x88aaff }));
            orb.position.y = 1.15;
            const claws = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), new THREE.MeshLambertMaterial({ color: accentColor }));
            claws.position.y = 1.15;
            claws.rotation.x = Math.PI / 2;
            grp.add(shaft, orb, claws);
            return grp;
        }
        if (kind === 'bow') {
            const grp = new THREE.Group();
            const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 16, Math.PI * 1.2), new THREE.MeshLambertMaterial({ color: 0x5a3520 }));
            bow.position.y = 0.3;
            bow.rotation.set(Math.PI / 2, 0, 0);
            const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.78, 4), new THREE.MeshBasicMaterial({ color: 0xddccaa }));
            string.position.y = 0.3;
            grp.add(bow, string);
            return grp;
        }
        if (kind === 'claws') {
            const grp = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
                c.position.set((i - 1) * 0.07, 0.05, 0.05);
                c.rotation.x = Math.PI / 2;
                grp.add(c);
            }
            return grp;
        }
        return null;
    }

    function collectMaterials(root) {
        const out = [];
        root.traverse(n => {
            if (n.material) {
                if (Array.isArray(n.material)) out.push(...n.material);
                else out.push(n.material);
            }
        });
        return out;
    }

    /* ---- Animation update ---- */
    function tickCharacter(s, dt, ctrl = {}) {
        const { armL, armR, legL, legR, hip, torso, head, cape, weapon, shadow } = s;

        // Smooth facing turn
        const yawDiff = wrap(s.facingTarget - s.facing);
        const turnRate = 12;
        s.facing += yawDiff * Math.min(1, turnRate * dt);
        hip.rotation.y = s.facing;

        // Death animation: fall + fade
        if (s.dying) {
            s.deathT += dt;
            const t = Math.min(1, s.deathT / 1.4);
            hip.rotation.x = t * 1.4;
            hip.position.y = 1.05 - t * 0.9;
            const fade = 1 - t;
            s.allMaterials.forEach(m => { if (m && m.opacity != null) { m.transparent = true; m.opacity = fade; } });
            shadow.material.opacity = fade * 0.35;
            return;
        }

        // Walk vs idle phase
        const moving = !!ctrl.moving;
        const speed = moving ? 8 : 1.0;
        s.walkPhase += dt * speed;

        if (moving) {
            const swing = Math.sin(s.walkPhase * 1.3) * 0.6;
            legL.rotation.x =  swing;
            legR.rotation.x = -swing;
            armL.rotation.x = -swing * 0.7;
            armR.rotation.x =  swing * 0.7;
            // Subtle vertical bob
            hip.position.y = 1.05 + Math.abs(Math.sin(s.walkPhase * 1.3)) * 0.05;
            // Cape wave
            cape.rotation.x = 0.15 + Math.sin(s.walkPhase * 1.3) * 0.10;
        } else {
            // Idle: subtle breathing + slow arm sway
            const breath = Math.sin(s.walkPhase * 0.6) * 0.04;
            hip.position.y = 1.05 + breath;
            torso.rotation.z = Math.sin(s.walkPhase * 0.5) * 0.025;
            // Ease legs/arms back to neutral
            legL.rotation.x *= 0.85; legR.rotation.x *= 0.85;
            armL.rotation.x *= 0.85; armR.rotation.x *= 0.85;
            cape.rotation.x = 0.15;
        }

        // Swing animation: forward arc on right arm
        if (s.swingT > 0) {
            s.swingT = Math.max(0, s.swingT - dt);
            const k = 1 - s.swingT / s.swingTotal;
            const arc = Math.sin(k * Math.PI);
            armR.rotation.x = -1.2 * arc * s.swingSign;
            // Body lean into swing
            torso.rotation.y = arc * 0.25 * s.swingSign;
        } else {
            torso.rotation.y *= 0.85;
        }

        // Cast animation: both arms raised + slight body lift
        if (s.castT > 0) {
            s.castT = Math.max(0, s.castT - dt);
            const k = 1 - s.castT / s.castTotal;
            const arc = Math.sin(k * Math.PI);
            armL.rotation.x = -1.5 * arc;
            armR.rotation.x = -1.5 * arc;
            armL.rotation.z =  0.4 * arc;
            armR.rotation.z = -0.4 * arc;
            hip.position.y += arc * 0.10;
        } else {
            armL.rotation.z *= 0.8;
            armR.rotation.z *= 0.8;
        }

        // Hurt flinch: brief shake + red tint
        if (s.hurtT > 0) {
            s.hurtT = Math.max(0, s.hurtT - dt);
            const k = s.hurtT / 0.15;
            torso.rotation.x = (Math.random() - 0.5) * 0.2 * k;
            // Tint body materials briefly toward red
            s.allMaterials.forEach(m => {
                if (m && m.color && m._origColor === undefined) m._origColor = m.color.getHex();
            });
            s.allMaterials.forEach(m => {
                if (m && m._origColor !== undefined) {
                    const orig = new THREE.Color(m._origColor);
                    const flash = new THREE.Color(0xff5050);
                    if (m.color) m.color.copy(orig.lerp(flash, 0.5 * k));
                }
            });
        } else {
            // Restore color
            s.allMaterials.forEach(m => {
                if (m && m._origColor !== undefined) { m.color && m.color.setHex(m._origColor); delete m._origColor; }
            });
            torso.rotation.x = 0;
        }
    }

    function wrap(a) {
        while (a > Math.PI)  a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    /* =========================================================================
     *  GLB-backed satyr character
     *  ---------------------------------------------------------------------
     *  Mirrors the procedural API surface (tick / playSwing / playDeath /
     *  setFacing / playHurt / reset / group) but drives an imported skinned
     *  mesh via THREE.AnimationMixer. The 8 clip names are produced by the
     *  Blender FBX→GLB pipeline:
     *    Armature|Idle_<Variant>|BaseLayer_Armature
     *    Armature|Walk_<Variant>|BaseLayer_Armature
     *    Armature|Attack_<Variant>|BaseLayer_Armature
     *    Armature|Death_<Variant>|BaseLayer_Armature
     *  where <Variant> is "1H_WepR" or "2H".
     * =======================================================================*/

    const SATYR_VARIANTS = {
        satyr_1h: { animSuffix: '1H_WepR' },
        satyr_2h: { animSuffix: '2H'      },
    };

    function createSatyr(presetKey, opts = {}) {
        const variant = SATYR_VARIANTS[presetKey];
        const tpl = ProtoModels.satyr;
        const scaleMul = (opts.scale != null) ? opts.scale : 1.0;

        const root = new THREE.Group();

        // Clone the rigged satyr (SkeletonUtils preserves bone bindings).
        const model = window.cloneSkeleton(tpl.template);
        model.scale.setScalar(tpl.scaleFactor * scaleMul);
        // FBX import puts the root on its feet at y=0 already; no offset needed.
        root.add(model);

        // Drop shadow disc, same as the procedural character.
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false,
        });
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55 * scaleMul, 24), shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        root.add(shadow);

        // Animation setup
        const mixer = new THREE.AnimationMixer(model);
        const clips = tpl.animations;
        const idleClip   = ProtoModels.findClip(clips, 'Idle_'   + variant.animSuffix);
        const walkClip   = ProtoModels.findClip(clips, 'Walk_'   + variant.animSuffix);
        const attackClip = ProtoModels.findClip(clips, 'Attack_' + variant.animSuffix);
        const deathClip  = ProtoModels.findClip(clips, 'Death_'  + variant.animSuffix);

        const idleAction   = idleClip   ? mixer.clipAction(idleClip)   : null;
        const walkAction   = walkClip   ? mixer.clipAction(walkClip)   : null;
        const attackAction = attackClip ? mixer.clipAction(attackClip) : null;
        const deathAction  = deathClip  ? mixer.clipAction(deathClip)  : null;

        if (attackAction) {
            attackAction.setLoop(THREE.LoopOnce);
            attackAction.clampWhenFinished = false;
        }
        if (deathAction) {
            deathAction.setLoop(THREE.LoopOnce);
            deathAction.clampWhenFinished = true;
        }
        if (idleAction) idleAction.play();

        // Track materials for hurt-flash tinting.
        const allMaterials = [];
        model.traverse((n) => {
            if (n.material) {
                if (Array.isArray(n.material)) allMaterials.push(...n.material);
                else allMaterials.push(n.material);
            }
        });

        const state = {
            facing: 0,
            facingTarget: 0,
            current: 'idle',  // 'idle' | 'walk' | 'attack' | 'death'
            attackingT: 0,
            attackTotal: attackClip ? attackClip.duration : 0,
            hurtT: 0,
            dying: false,
        };

        function setAnim(name) {
            if (state.dying || state.current === name) return;
            const fadeOut = (a) => { if (a && a.isRunning()) a.fadeOut(0.15); };
            const fadeIn = (a) => { if (a) a.reset().fadeIn(0.15).play(); };
            if (state.current === 'idle')   fadeOut(idleAction);
            if (state.current === 'walk')   fadeOut(walkAction);
            if (state.current === 'attack') fadeOut(attackAction);
            if (name === 'idle')   fadeIn(idleAction);
            if (name === 'walk')   fadeIn(walkAction);
            if (name === 'attack') fadeIn(attackAction);
            state.current = name;
        }

        return {
            group: root,
            state,
            setFacing(dx, dz) {
                if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
                state.facingTarget = Math.atan2(dx, dz);
            },
            playSwing(/* side */) {
                if (state.dying || !attackAction) return;
                state.attackingT = state.attackTotal;
                if (idleAction && idleAction.isRunning()) idleAction.fadeOut(0.1);
                if (walkAction && walkAction.isRunning()) walkAction.fadeOut(0.1);
                attackAction.reset().fadeIn(0.1).play();
                state.current = 'attack';
            },
            playCast(/* durationSec */) {
                // No dedicated cast clip in our filtered set — reuse attack.
                this.playSwing(1);
            },
            playHurt() { state.hurtT = 0.15; },
            playDeath() {
                if (state.dying) return;
                state.dying = true;
                if (idleAction)   idleAction.fadeOut(0.15);
                if (walkAction)   walkAction.fadeOut(0.15);
                if (attackAction) attackAction.fadeOut(0.15);
                if (deathAction)  deathAction.reset().fadeIn(0.15).play();
            },
            reset() {
                state.dying = false;
                state.current = 'idle';
                state.attackingT = 0;
                if (deathAction)  deathAction.stop();
                if (attackAction) attackAction.stop();
                if (walkAction)   walkAction.stop();
                if (idleAction)   idleAction.reset().play();
                shadow.material.opacity = 0.35;
                allMaterials.forEach(m => {
                    if (m && m._origColor !== undefined) {
                        m.color && m.color.setHex(m._origColor);
                        delete m._origColor;
                    }
                });
            },
            tick(dt, ctrl = {}) {
                // Smooth facing turn — rotate the inner model, NOT the root.
                // The HP bar and selection ring are attached by entity.js as
                // children of the root (the entity's mesh), and we want them
                // to stay aligned in world space when the satyr turns. The
                // procedural character does the same trick by rotating its
                // hip sub-group while keeping root unrotated.
                const yawDiff = wrapAngle(state.facingTarget - state.facing);
                state.facing += yawDiff * Math.min(1, 12 * dt);
                model.rotation.y = state.facing;

                mixer.update(dt);

                if (state.dying) return;

                // Drive the locomotion blend off `ctrl.moving`. Don't override
                // the attack while it's playing.
                if (state.attackingT > 0) {
                    state.attackingT -= dt;
                    if (state.attackingT <= 0) {
                        // Attack finished — return to idle/walk. The next tick
                        // will pick the right one based on current ctrl.moving.
                        state.attackingT = 0;
                        state.current = 'attack-finished';
                    }
                } else {
                    setAnim(ctrl.moving ? 'walk' : 'idle');
                }

                // Hurt flash (same idea as procedural; works on Standard mats).
                if (state.hurtT > 0) {
                    state.hurtT = Math.max(0, state.hurtT - dt);
                    const k = state.hurtT / 0.15;
                    allMaterials.forEach(m => {
                        if (!m || !m.color) return;
                        if (m._origColor === undefined) m._origColor = m.color.getHex();
                        const orig = new THREE.Color(m._origColor);
                        const flash = new THREE.Color(0xff5050);
                        m.color.copy(orig.lerp(flash, 0.5 * k));
                    });
                } else {
                    allMaterials.forEach(m => {
                        if (m && m._origColor !== undefined) {
                            m.color && m.color.setHex(m._origColor);
                            delete m._origColor;
                        }
                    });
                }
            },
        };
    }

    function wrapAngle(a) {
        while (a > Math.PI)  a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    window.ProtoChar = ProtoChar;
})();
