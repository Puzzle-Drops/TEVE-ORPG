/* proto/charsheet.js
 * Toggleable character sheet (C key). Shows full TEVE-style stat breakdown.
 */
(function () {
    'use strict';

    const ProtoCharSheet = { panelEl: null, isOpen: false };

    ProtoCharSheet.toggle = function () {
        if (ProtoCharSheet.isOpen) ProtoCharSheet.hide();
        else ProtoCharSheet.show();
    };
    ProtoCharSheet.show = function () {
        if (ProtoCharSheet.panelEl) ProtoCharSheet.panelEl.remove();
        const panel = document.createElement('div');
        panel.className = 'cs-panel';
        document.getElementById('proto-overlay').appendChild(panel);
        ProtoCharSheet.panelEl = panel;
        ProtoCharSheet.isOpen = true;
        render();
    };
    ProtoCharSheet.hide = function () {
        if (ProtoCharSheet.panelEl) ProtoCharSheet.panelEl.remove();
        ProtoCharSheet.panelEl = null;
        ProtoCharSheet.isOpen = false;
    };
    ProtoCharSheet.refresh = function () { if (ProtoCharSheet.isOpen) render(); };

    function render() {
        const p = Proto.player;
        if (!p || !ProtoCharSheet.panelEl) return;
        const physDR = (0.9 * p.armor) / (p.armor + 500) * 100;
        const magDR  = (0.3 * p.resist) / (p.resist + 1000) * 100;
        const cdr    = Math.max(0, 1 - 200 / Math.max(50, p.actionBarSpeed)) * 100;
        const baInt  = (2.0 * 200 / Math.max(50, p.actionBarSpeed));

        ProtoCharSheet.panelEl.innerHTML = `
            <div class="cs-title">Character — ${p.name}</div>
            <div class="cs-close">×</div>
            <div style="margin-bottom: 8px; color: #aaa; font-size: 12px;">Level ${p.level} • XP ${Math.floor(p.exp)}/${p.expToNext}</div>
            <div class="cs-grid">
                <div class="cs-section">
                    <div class="cs-section-title">Attributes</div>
                    ${row('STR', p.stats.str)}
                    ${row('AGI', p.stats.agi)}
                    ${row('INT', p.stats.int)}
                    ${row('Mainstat', p.mainstat.toUpperCase())}
                </div>
                <div class="cs-section">
                    <div class="cs-section-title">Resources</div>
                    ${row('Max HP', p.maxHp)}
                    ${row('HP Regen', p.hpRegen.toFixed(2) + '/s')}
                    ${row('Max MP', p.maxMp)}
                    ${row('MP Regen', p.mpRegen.toFixed(2) + '/s')}
                </div>
                <div class="cs-section">
                    <div class="cs-section-title">Combat</div>
                    ${row('Attack', p.attack)}
                    ${row('Basic Attack', baInt.toFixed(2) + 's')}
                    ${row('Crit Chance', '5%')}
                </div>
                <div class="cs-section">
                    <div class="cs-section-title">Defense</div>
                    ${row('Armor', p.armor + ' → ' + physDR.toFixed(1) + '% DR')}
                    ${row('Resist', p.resist + ' → ' + magDR.toFixed(1) + '% DR')}
                </div>
                <div class="cs-section" style="grid-column: span 2">
                    <div class="cs-section-title">Tempo</div>
                    ${row('Speed', p.actionBarSpeed)}
                    ${row('Cooldown Reduction', cdr.toFixed(1) + '%')}
                </div>
            </div>
        `;
        ProtoCharSheet.panelEl.querySelector('.cs-close').onclick = () => ProtoCharSheet.hide();
    }

    function row(label, val) {
        return `<div class="cs-row"><span>${label}</span><b>${val}</b></div>`;
    }

    window.ProtoCharSheet = ProtoCharSheet;
})();
