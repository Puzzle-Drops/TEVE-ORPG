/* proto/hud.js
 * LoL-style HUD: portrait + bars (left), basic-attack + Q/W/E/R + passive (center).
 * Buff/debuff strip above the portrait.
 */
(function () {
    'use strict';

    const ProtoHud = {
        rootEl: null,
        portraitLevel: null,
        nameEl: null,
        hpFill: null, hpText: null,
        mpFill: null, mpText: null,
        xpFill: null,
        slots: [],         // {wrap, key, sweep, cdText, costEl, glyph} per ability
        baSlot: null, baSweep: null, baCdText: null,
        passiveEl: null,
        comboLog: null,
        buffStripEl: null,
        topStats: { gold: null, level: null },
    };

    ProtoHud.init = function () {
        const root = document.getElementById('proto-hud');
        root.innerHTML = '';

        // Top bar — gold only (stats now live in the player frame, WC3-style)
        const top = document.createElement('div');
        top.className = 'hud-top';
        top.innerHTML = `<div class="hud-top-stat"><span class="lbl">GOLD</span><span class="val" data-gold>0</span></div>`;
        root.appendChild(top);
        ProtoHud.topStats.gold = top.querySelector('[data-gold]');

        // Player frame — bordered panel; portrait + bars attached; stat cards
        // with TEVE icons below.
        const left = document.createElement('div');
        left.className = 'hud-left';
        left.innerHTML = `
            <div class="player-frame">
                <div class="pf-top">
                    <div class="pf-portrait">
                        <div class="pf-portrait-clip"><img class="pf-portrait-img" alt=""></div>
                        <div class="pf-portrait-lv" data-lv>5</div>
                    </div>
                    <div class="pf-side">
                        <div class="pf-name-row">
                            <div class="hud-name">Hero</div>
                        </div>
                        <div class="pf-stars-row" data-stars></div>
                        <div class="hud-bar hp" data-tooltip="hp"><div class="hud-bar-fill"></div><div class="hud-bar-text"></div></div>
                        <div class="hud-bar mp" data-tooltip="mp"><div class="hud-bar-fill"></div><div class="hud-bar-text"></div></div>
                        <div class="hud-bar xp" data-tooltip="xp"><div class="hud-bar-fill"></div></div>
                    </div>
                </div>
                <div class="pf-stats-row">
                    <div class="stat-card s-str" data-tooltip="strength"><img class="sc-ico" src="img/ui/strength.png"><div class="sc-val" data-str>0</div></div>
                    <div class="stat-card s-agi" data-tooltip="agility"><img class="sc-ico" src="img/ui/agility.png"><div class="sc-val" data-agi>0</div></div>
                    <div class="stat-card s-int" data-tooltip="intelligence"><img class="sc-ico" src="img/ui/intelligence.png"><div class="sc-val" data-int>0</div></div>
                    <div class="stat-divider"></div>
                    <div class="stat-card" data-tooltip="attack"><img class="sc-ico" src="img/ui/attack.png"><div class="sc-val" data-atk>0</div></div>
                    <div class="stat-card" data-tooltip="armor"><img class="sc-ico" src="img/ui/armor.png"><div class="sc-val" data-arm>0</div></div>
                    <div class="stat-card" data-tooltip="resist"><img class="sc-ico" src="img/ui/resist.png"><div class="sc-val" data-res>0</div></div>
                </div>
            </div>
        `;
        root.appendChild(left);
        ProtoHud.portraitLevel = left.querySelector('.pf-portrait-lv');
        ProtoHud.portraitImg = left.querySelector('.pf-portrait-img');
        ProtoHud.starsEl = left.querySelector('[data-stars]');
        ProtoHud.nameEl = left.querySelector('.hud-name');
        // Default portrait (random hero from existing TEVE art)
        ProtoHud.portraitImg.src = 'img/sprites/heroes/champion_male_portrait.png';
        ProtoHud.hpFill = left.querySelector('.hp .hud-bar-fill');
        ProtoHud.hpText = left.querySelector('.hp .hud-bar-text');
        ProtoHud.mpFill = left.querySelector('.mp .hud-bar-fill');
        ProtoHud.mpText = left.querySelector('.mp .hud-bar-text');
        ProtoHud.xpFill = left.querySelector('.xp .hud-bar-fill');
        ProtoHud.topStats.level = left.querySelector('[data-lv]');
        ProtoHud.topStats.str = left.querySelector('[data-str]');
        ProtoHud.topStats.agi = left.querySelector('[data-agi]');
        ProtoHud.topStats.int = left.querySelector('[data-int]');
        ProtoHud.topStats.atk = left.querySelector('[data-atk]');
        ProtoHud.topStats.arm = left.querySelector('[data-arm]');
        ProtoHud.topStats.res = left.querySelector('[data-res]');

        // Center: ability bar
        const center = document.createElement('div');
        center.className = 'hud-center';
        // Basic attack tile
        const baIcon = (window.ProtoAb && ProtoAb.basicAttack && ProtoAb.basicAttack.iconPath) || 'img/ui/combat.png';
        const ba = makeAbSlot('A', 'basic', baIcon);
        ba.wrap.dataset.tooltip = 'basicattack';
        center.appendChild(ba.wrap);
        ProtoHud.baSlot = ba.wrap;
        ProtoHud.baSweep = ba.sweep;
        ProtoHud.baCdText = ba.cdText;
        ba.wrap.addEventListener('mouseenter', () => { if (window.ProtoInd) ProtoInd.previewAttackMove(); });
        ba.wrap.addEventListener('mouseleave', () => { if (window.ProtoInd) ProtoInd.endPreview(); });

        // QWER tiles — icon set when player.abilities is populated
        for (let i = 0; i < 4; i++) {
            const key = ['Q','W','E','R'][i];
            const slot = makeAbSlot(key, 'ability', null);
            slot.wrap.dataset.tooltip = 'ability:' + i;
            center.appendChild(slot.wrap);
            ProtoHud.slots.push(slot);
            slot.wrap.addEventListener('mouseenter', () => {
                const def = Proto.player && Proto.player.abilities[i];
                if (def && window.ProtoInd) ProtoInd.previewAbility(i, def);
            });
            slot.wrap.addEventListener('mouseleave', () => { if (window.ProtoInd) ProtoInd.endPreview(); });
        }
        // Passive — icon set on first tick
        const pas = document.createElement('div');
        pas.className = 'passive-slot';
        pas.dataset.tooltip = 'passive';
        pas.innerHTML = `<div class="passive-icon"></div>`;
        center.appendChild(pas);
        ProtoHud.passiveEl = pas;
        ProtoHud.passiveIconEl = pas.querySelector('.passive-icon');

        root.appendChild(center);

        // Combat log
        const log = document.createElement('div');
        log.className = 'combat-log';
        root.appendChild(log);
        ProtoHud.comboLog = log;

        // Target frame (top-left) — populated when an enemy is selected
        const tgt = document.createElement('div');
        tgt.className = 'target-frame';
        tgt.style.display = 'none';
        tgt.innerHTML = `
            <div class="tf-top">
                <div class="tf-portrait">
                    <div class="tf-portrait-clip"><img class="tf-portrait-img" alt=""></div>
                    <div class="tf-portrait-tier" data-tier>1</div>
                </div>
                <div class="tf-side">
                    <div class="tf-name-row">
                        <div class="tf-name" data-name>—</div>
                    </div>
                    <div class="tf-stars-row" data-stars></div>
                    <div class="hud-bar hp" data-tooltip="hp"><div class="hud-bar-fill"></div><div class="hud-bar-text" data-hp></div></div>
                    <div class="hud-bar mp empty"><div class="hud-bar-fill"></div><div class="hud-bar-text">—</div></div>
                    <div class="hud-bar xp empty"><div class="hud-bar-fill"></div></div>
                </div>
            </div>
            <div class="tf-stats-row">
                <div class="stat-card s-str" data-tooltip="strength"><img class="sc-ico" src="img/ui/strength.png"><div class="sc-val" data-str>0</div></div>
                <div class="stat-card s-agi" data-tooltip="agility"><img class="sc-ico" src="img/ui/agility.png"><div class="sc-val" data-agi>0</div></div>
                <div class="stat-card s-int" data-tooltip="intelligence"><img class="sc-ico" src="img/ui/intelligence.png"><div class="sc-val" data-int>0</div></div>
                <div class="stat-divider"></div>
                <div class="stat-card" data-tooltip="attack"><img class="sc-ico" src="img/ui/attack.png"><div class="sc-val" data-atk>0</div></div>
                <div class="stat-card" data-tooltip="armor"><img class="sc-ico" src="img/ui/armor.png"><div class="sc-val" data-arm>0</div></div>
                <div class="stat-card" data-tooltip="resist"><img class="sc-ico" src="img/ui/resist.png"><div class="sc-val" data-res>0</div></div>
            </div>
        `;
        root.appendChild(tgt);
        ProtoHud.targetFrame = {
            root: tgt,
            name: tgt.querySelector('[data-name]'),
            tier: tgt.querySelector('[data-tier]'),
            hpFill: tgt.querySelector('.hp .hud-bar-fill'),
            hpText: tgt.querySelector('[data-hp]'),
            str: tgt.querySelector('[data-str]'),
            agi: tgt.querySelector('[data-agi]'),
            int: tgt.querySelector('[data-int]'),
            atk: tgt.querySelector('[data-atk]'),
            arm: tgt.querySelector('[data-arm]'),
            res: tgt.querySelector('[data-res]'),
            portraitImg: tgt.querySelector('.tf-portrait-img'),
            stars: tgt.querySelector('[data-stars]'),
        };

        // Buff strip
        const bs = document.createElement('div');
        bs.className = 'buff-strip';
        root.appendChild(bs);
        ProtoHud.buffStripEl = bs;

        ProtoHud.rootEl = root;
    };

    function lerp(a, b, k) { return a + (b - a) * Math.min(1, Math.max(0, k)); }

    /** TEVE-style star ratings — only renders filled gold stars (no empties). */
    function renderStars(el, filled) {
        if (!el) return;
        const want = '' + filled;
        if (el.dataset.state === want) return;
        el.dataset.state = want;
        let html = '';
        for (let i = 0; i < filled; i++) html += '<span class="star on">★</span>';
        el.innerHTML = html;
    }
    /** Player level → stars: 1 star per 100 levels, capped at 5 (like TEVE tiers). */
    function playerStars(level) {
        if (level >= 400) return 5;
        if (level >= 300) return 4;
        if (level >= 200) return 3;
        if (level >= 100) return 2;
        return 1;
    }

    function makeAbSlot(key, kind, iconPath) {
        const wrap = document.createElement('div');
        wrap.className = 'ab-slot ' + kind;
        const icoStyle = iconPath ? `style="background-image:url('${iconPath}')"` : '';
        wrap.innerHTML = `
            <div class="ab-icon ico-${key}" ${icoStyle}></div>
            <div class="ab-sweep"></div>
            <div class="ab-key">${key}</div>
            <div class="ab-cd-text"></div>
            <div class="ab-cost"></div>
        `;
        return {
            wrap,
            iconEl: wrap.querySelector('.ab-icon'),
            sweep: wrap.querySelector('.ab-sweep'),
            cdText: wrap.querySelector('.ab-cd-text'),
            cost: wrap.querySelector('.ab-cost'),
        };
    }

    ProtoHud.log = function (msg) {
        if (!ProtoHud.comboLog) return;
        const line = document.createElement('div');
        line.className = 'combat-log-line';
        line.textContent = msg;
        ProtoHud.comboLog.appendChild(line);
        while (ProtoHud.comboLog.children.length > 30) ProtoHud.comboLog.removeChild(ProtoHud.comboLog.firstChild);
        ProtoHud.comboLog.scrollTop = ProtoHud.comboLog.scrollHeight;
    };

    ProtoHud.tick = function () {
        const p = window.Proto && Proto.player;
        if (!p) return;

        // Player frame stats + gold
        ProtoHud.topStats.gold.textContent = (Proto.gold || 0);
        ProtoHud.topStats.level.textContent = p.level;
        ProtoHud.topStats.str.textContent = p.stats.str;
        ProtoHud.topStats.agi.textContent = p.stats.agi;
        ProtoHud.topStats.int.textContent = p.stats.int;
        ProtoHud.topStats.atk.textContent = p.attack;
        ProtoHud.topStats.arm.textContent = p.armor;
        ProtoHud.topStats.res.textContent = p.resist;

        // Player frame (portrait + name + stars)
        ProtoHud.portraitLevel.textContent = p.level;
        ProtoHud.nameEl.textContent = p.name;
        renderStars(ProtoHud.starsEl, playerStars(p.level));
        // HP / MP / XP — smooth toward target each frame for polish
        const hpPct = p.maxHp ? p.currentHp / p.maxHp : 0;
        ProtoHud._hpDisp = lerp(ProtoHud._hpDisp == null ? hpPct : ProtoHud._hpDisp, hpPct, 0.18);
        ProtoHud.hpFill.style.width = (ProtoHud._hpDisp * 100) + '%';
        ProtoHud.hpText.textContent = Math.ceil(p.currentHp) + ' / ' + p.maxHp;

        const mpPct = p.maxMp ? p.currentMp / p.maxMp : 0;
        ProtoHud._mpDisp = lerp(ProtoHud._mpDisp == null ? mpPct : ProtoHud._mpDisp, mpPct, 0.22);
        ProtoHud.mpFill.style.width = (ProtoHud._mpDisp * 100) + '%';
        ProtoHud.mpText.textContent = Math.ceil(p.currentMp) + ' / ' + p.maxMp;

        const xpPct = p.expToNext ? p.exp / p.expToNext : 0;
        ProtoHud._xpDisp = lerp(ProtoHud._xpDisp == null ? xpPct : ProtoHud._xpDisp, xpPct, 0.10);
        ProtoHud.xpFill.style.width = (ProtoHud._xpDisp * 100) + '%';

        // Vignette when low HP
        const vig = document.getElementById('proto-vignette');
        if (vig) vig.classList.toggle('danger', hpPct < 0.30);

        // Basic attack
        const baTotal = p.basicAttackCooldownTotal || 1.0;
        const baCd = p.basicAttackCooldown || 0;
        if (baCd > 0) {
            ProtoHud.baSlot.classList.remove('ready'); ProtoHud.baSlot.classList.add('cd');
            const ang = Math.min(360, (baCd / baTotal) * 360);
            ProtoHud.baSweep.style.background = `conic-gradient(rgba(0,0,0,0.7) 0deg ${ang}deg, transparent ${ang}deg 360deg)`;
            ProtoHud.baCdText.textContent = baCd < 1 ? baCd.toFixed(1) : Math.ceil(baCd);
        } else {
            ProtoHud.baSlot.classList.add('ready'); ProtoHud.baSlot.classList.remove('cd');
            ProtoHud.baSweep.style.background = '';
            ProtoHud.baCdText.textContent = '';
        }

        // Abilities
        for (let i = 0; i < 4; i++) {
            const def = p.abilities[i];
            const slot = ProtoHud.slots[i];
            slot.cost.textContent = def ? (def.manaCost + 'm') : '';
            // Icon — set once on first sight of this ability
            if (def && def.iconPath && slot.iconEl.dataset.icon !== def.iconPath) {
                slot.iconEl.style.backgroundImage = `url('${def.iconPath}')`;
                slot.iconEl.dataset.icon = def.iconPath;
            }
            if (!def) {
                slot.wrap.className = 'ab-slot ability cd';
                slot.sweep.style.background = '';
                slot.cdText.textContent = '';
                continue;
            }
            const cd = p.cooldowns[i] || 0;
            const cdTotal = ProtoAb.cooldownFor(p, def) || 1;
            const noMana = p.currentMp < def.manaCost;
            let cls = 'ab-slot ability';
            if (p.castInProgress && p.castInProgress.slot === i) cls += ' casting';
            else if (cd > 0) cls += ' cd';
            else if (noMana) cls += ' no-mana';
            else cls += ' ready';

            // Trigger just-ready glow on cooldown→ready transition
            const wasCd = slot._wasCd === true;
            const nowReady = cls.endsWith(' ready');
            if (wasCd && nowReady) {
                cls += ' just-ready';
                setTimeout(() => slot.wrap.classList.remove('just-ready'), 520);
            }
            slot._wasCd = (cd > 0);
            slot.wrap.className = cls;
            if (cd > 0) {
                const ang = Math.min(360, (cd / cdTotal) * 360);
                slot.sweep.style.background = `conic-gradient(rgba(0,0,0,0.7) 0deg ${ang}deg, transparent ${ang}deg 360deg)`;
                slot.cdText.textContent = cd < 1 ? cd.toFixed(1) : Math.ceil(cd);
            } else {
                slot.sweep.style.background = '';
                slot.cdText.textContent = '';
            }
            slot.wrap.title = def.name + ' — ' + def.description + '\nCooldown: ' + cdTotal.toFixed(1) + 's';
        }

        // Passive
        if (p.passive) {
            ProtoHud.passiveEl.title = p.passive.name + ' — ' + p.passive.description;
            if (p.passive.iconPath && ProtoHud.passiveIconEl.dataset.icon !== p.passive.iconPath) {
                ProtoHud.passiveIconEl.style.backgroundImage = `url('${p.passive.iconPath}')`;
                ProtoHud.passiveIconEl.dataset.icon = p.passive.iconPath;
            }
        }

        // Buff strip
        renderBuffStrip(p);

        // Selected enemy target frame
        renderTargetFrame();
    };

    function renderTargetFrame() {
        const tf = ProtoHud.targetFrame;
        if (!tf) return;
        const sel = Proto.selectedEnemy;
        if (!sel || sel.dead) { tf.root.style.display = 'none'; return; }
        tf.root.style.display = 'block';
        const t = sel.template || {};
        tf.name.textContent = sel.name || t.name || 'Enemy';
        const tier = sel.tier || t.tier || 1;
        tf.tier.textContent = tier;
        // Use the actual TEVE enemy sprite as portrait
        const spriteId = (t && t.spriteId) || sel.templateId || 'aberration';
        const wantSprite = `img/sprites/enemies/${spriteId}.png`;
        if (tf.portraitImg.dataset.src !== wantSprite) {
            tf.portraitImg.src = wantSprite;
            tf.portraitImg.dataset.src = wantSprite;
        }
        // Stars: tier directly maps to star count (1..5)
        renderStars(tf.stars, Math.min(5, tier));
        const pct = sel.maxHp ? sel.currentHp / sel.maxHp : 0;
        tf.hpFill.style.width = (pct * 100) + '%';
        tf.hpText.textContent = Math.ceil(sel.currentHp) + ' / ' + sel.maxHp;
        const stats = sel.stats || { str: 0, agi: 0, int: 0 };
        tf.str.textContent = stats.str | 0;
        tf.agi.textContent = stats.agi | 0;
        tf.int.textContent = stats.int | 0;
        tf.atk.textContent = sel.attack | 0;
        tf.arm.textContent = sel.armor | 0;
        tf.res.textContent = sel.resist | 0;
    }

    function renderBuffStrip(p) {
        const el = ProtoHud.buffStripEl;
        if (!el) return;
        el.innerHTML = '';
        const all = [
            ...(p.buffs || []).map(b => ({ ...b, kind: 'buff' })),
            ...(p.debuffs || []).map(d => ({ ...d, kind: 'debuff' })),
        ];
        for (const fx of all) {
            const w = document.createElement('div');
            w.className = 'buff-chip ' + fx.kind;
            w.style.color = (fx.color || '#fff');
            w.textContent = fx.glyph || fx.name[0];
            w.title = fx.name + (fx.duration === -1 ? '' : ' (' + Math.ceil(fx.duration) + 's)');
            const dur = (fx.duration === -1) ? '∞' : (fx.duration < 10 ? fx.duration.toFixed(1) : Math.ceil(fx.duration));
            const lab = document.createElement('span');
            lab.className = 'buff-chip-dur';
            lab.textContent = dur;
            w.appendChild(lab);
            el.appendChild(w);
        }
    }

    window.ProtoHud = ProtoHud;
})();
