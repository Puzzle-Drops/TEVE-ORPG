/* proto/tooltip.js
 * One global tooltip element that appears on hover of any DOM element with a
 * `data-tooltip` attribute. Content is looked up from a registry of known IDs;
 * dynamic content (current values, cooldowns, mana) is filled by getter
 * functions per ID.
 *
 * Usage in HTML:
 *   <div data-tooltip="strength">...</div>
 *   <div data-tooltip="ability:0">...</div>     // ability slot index
 *   <div data-tooltip="hp">...</div>            // resource bars
 *
 * To add new content, extend ProtoTooltip.entries.
 */
(function () {
    'use strict';

    const ProtoTooltip = {
        el: null,
        active: null,        // current data-tooltip key
    };

    /** Static + dynamic content per data-tooltip id.
     *  Each entry: { name, lines: [{text, kind?}], colorClass? }
     *  Functions can return content live from game state. */
    const entries = {
        // ---- Stats ----
        strength: () => ({
            name: 'Strength',
            iconPath: 'img/ui/strength.png',
            colorClass: 'tt-str',
            lines: [
                { text: 'Increases your maximum HP and physical attack.' },
                { text: '+5% physical damage and +5 HP per point.', kind: 'muted' },
            ],
        }),
        agility: () => ({
            name: 'Agility',
            iconPath: 'img/ui/agility.png',
            colorClass: 'tt-agi',
            lines: [
                { text: 'Increases attack speed and cooldown reduction.' },
                { text: 'Higher AGI = more attacks and abilities per second.', kind: 'muted' },
            ],
        }),
        intelligence: () => ({
            name: 'Intelligence',
            iconPath: 'img/ui/intelligence.png',
            colorClass: 'tt-int',
            lines: [
                { text: 'Increases your maximum Mana and magical damage.' },
                { text: '+1 mana regen per 10 INT.', kind: 'muted' },
            ],
        }),
        attack: () => ({
            name: 'Attack',
            iconPath: 'img/ui/attack.png',
            lines: [
                { text: 'Damage dealt by basic attacks and abilities.' },
                { text: 'Scales with your mainstat.', kind: 'muted' },
            ],
        }),
        armor: () => ({
            name: 'Armor',
            iconPath: 'img/ui/armor.png',
            lines: [
                { text: 'Reduces physical damage taken.' },
                { text: 'DR = 0.9 × ARM / (ARM + 500). Caps at 90%.', kind: 'muted' },
            ],
        }),
        resist: () => ({
            name: 'Resistance',
            iconPath: 'img/ui/resist.png',
            lines: [
                { text: 'Reduces magical damage taken.' },
                { text: 'DR = 0.3 × RES / (RES + 1000). Caps at 30%.', kind: 'muted' },
            ],
        }),

        // ---- Resource bars ----
        hp: () => {
            const p = Proto.player;
            return {
                name: 'Health',
                iconPath: 'img/ui/hp.png',
                colorClass: 'tt-hp',
                lines: [
                    p ? { text: `${Math.ceil(p.currentHp)} / ${p.maxHp}` } : null,
                    { text: 'When this reaches 0 you die.', kind: 'muted' },
                    p ? { text: `Regeneration: ${p.hpRegen.toFixed(2)}/s`, kind: 'muted' } : null,
                ].filter(Boolean),
            };
        },
        mp: () => {
            const p = Proto.player;
            return {
                name: 'Mana',
                colorClass: 'tt-mp',
                lines: [
                    p ? { text: `${Math.ceil(p.currentMp)} / ${p.maxMp}` } : null,
                    { text: 'Spent to cast abilities.', kind: 'muted' },
                    p ? { text: `Regeneration: ${p.mpRegen.toFixed(2)}/s`, kind: 'muted' } : null,
                ].filter(Boolean),
            };
        },
        xp: () => {
            const p = Proto.player;
            return {
                name: 'Experience',
                colorClass: 'tt-xp',
                lines: [
                    p ? { text: `Level ${p.level} — ${Math.floor(p.exp)} / ${p.expToNext} XP` } : null,
                    { text: 'Earned from killing enemies. Level up to grow stronger.', kind: 'muted' },
                ].filter(Boolean),
            };
        },

        // ---- Ability dynamic ----
        // data-tooltip="ability:N" where N is the slot index
        // data-tooltip="basicattack"
        // data-tooltip="passive"
        basicattack: () => {
            const def = (window.ProtoAb && ProtoAb.basicAttack) || {};
            const p = Proto.player;
            const interval = p ? (2.0 * 200 / Math.max(50, p.actionBarSpeed)).toFixed(2) : '—';
            return {
                name: def.name || 'Basic Attack',
                iconPath: def.iconPath,
                lines: [
                    { text: def.description || '', kind: 'muted' },
                    { text: `Auto-attack interval: ${interval}s` },
                    p ? { text: `Range: ${p.basicAttackRange.toFixed(1)}` } : null,
                ].filter(Boolean),
            };
        },
        passive: () => {
            const def = (Proto.player && Proto.player.passive) || {};
            return {
                name: def.name || 'Passive',
                iconPath: def.iconPath,
                colorClass: 'tt-passive',
                lines: [{ text: def.description || '', kind: 'muted' }],
            };
        },
    };

    /** Build content for an ability:N tooltip. */
    function abilityTooltip(idx) {
        const p = Proto.player;
        const def = p && p.abilities && p.abilities[idx];
        if (!def) return { name: '—', lines: [] };
        const cd = (window.ProtoAb && ProtoAb.cooldownFor(p, def)) || def.cooldown || 0;
        const lines = [
            { text: def.description || '', kind: 'muted' },
        ];
        const meta = [];
        if (def.manaCost) meta.push(`<span class="tt-cost">Mana ${def.manaCost}</span>`);
        if (cd) meta.push(`<span class="tt-cd">CD ${cd.toFixed(1)}s</span>`);
        if (def.range && def.targetType !== 'self') meta.push(`<span>Range ${def.range}</span>`);
        if (def.aoeRadius) meta.push(`<span>AoE ${def.aoeRadius}</span>`);
        if (meta.length) lines.push({ html: meta.join(' &nbsp; '), kind: 'meta' });
        return {
            name: def.name + ` <span class="tt-key">[${def.key || '?'}]</span>`,
            iconPath: def.iconPath,
            lines,
        };
    }

    ProtoTooltip.init = function () {
        const el = document.createElement('div');
        el.className = 'proto-tooltip';
        el.style.display = 'none';
        document.body.appendChild(el);
        ProtoTooltip.el = el;
        // Delegate hover events
        document.body.addEventListener('mouseover', onOver);
        document.body.addEventListener('mouseout', onOut);
        document.body.addEventListener('mousemove', onMove);
    };

    function onOver(e) {
        const t = closestTip(e.target);
        if (!t) return;
        const id = t.dataset.tooltip;
        ProtoTooltip.show(id, e.clientX, e.clientY);
    }
    function onOut(e) {
        const t = closestTip(e.target);
        const r = e.relatedTarget && closestTip(e.relatedTarget);
        if (t && t !== r) ProtoTooltip.hide();
    }
    function onMove(e) {
        if (!ProtoTooltip.active) return;
        position(e.clientX, e.clientY);
    }
    function closestTip(el) {
        while (el && el !== document.body) {
            if (el.dataset && el.dataset.tooltip) return el;
            el = el.parentElement;
        }
        return null;
    }

    ProtoTooltip.show = function (id, x, y) {
        if (!ProtoTooltip.el) return;
        let content;
        if (id.startsWith('ability:')) {
            const idx = parseInt(id.slice('ability:'.length), 10);
            content = abilityTooltip(idx);
        } else {
            const fn = entries[id];
            if (!fn) return;
            content = fn();
        }
        ProtoTooltip.active = id;
        renderInto(ProtoTooltip.el, content);
        ProtoTooltip.el.style.display = 'block';
        position(x, y);
    };
    ProtoTooltip.hide = function () {
        ProtoTooltip.active = null;
        if (ProtoTooltip.el) ProtoTooltip.el.style.display = 'none';
    };

    function position(x, y) {
        const el = ProtoTooltip.el;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = x + 16, top = y + 12;
        if (left + w > window.innerWidth - 8)  left = x - w - 16;
        if (top + h > window.innerHeight - 8)  top = y - h - 12;
        el.style.left = left + 'px';
        el.style.top  = top + 'px';
    }

    function renderInto(el, c) {
        let html = '';
        html += `<div class="tt-head ${c.colorClass || ''}">`;
        if (c.iconPath) html += `<img class="tt-ico" src="${c.iconPath}">`;
        html += `<div class="tt-name">${c.name || ''}</div>`;
        html += `</div>`;
        if (c.lines && c.lines.length) {
            html += `<div class="tt-body">`;
            for (const ln of c.lines) {
                const cls = 'tt-line' + (ln.kind ? ' ' + ln.kind : '');
                html += `<div class="${cls}">${ln.html != null ? ln.html : (ln.text || '')}</div>`;
            }
            html += `</div>`;
        }
        el.innerHTML = html;
    }

    window.ProtoTooltip = ProtoTooltip;
})();
