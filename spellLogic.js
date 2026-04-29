// Helper Functions
const spellHelpers = {
    // Parameter extraction helper
getParam: function(spell, paramName, levelIndex, defaultValue = null) {
    // Handle nested property paths like 'scaling.base'
    const keys = paramName.split('.');
    let value = spell;
    
    for (const key of keys) {
        value = value?.[key];
        if (value === undefined) {
            return defaultValue;
        }
    }
    
    // Now value should be the array, get the level-specific value
    if (Array.isArray(value)) {
        return value[levelIndex] ?? value[0] ?? defaultValue;
    }
    
    return value ?? defaultValue;
},

    // Damage calculation helper
calculateDamage: function(spell, levelIndex, caster, scalingTypes = {}) {
    const baseDamage = this.getParam(spell, 'scaling.base', levelIndex, 0);
    let damage = baseDamage;
    
    if (scalingTypes.attack !== false && spell.scaling?.attack) {
        const attackScaling = this.getParam(spell, 'scaling.attack', levelIndex, 1.0);
        damage += caster.source.attack * attackScaling;
    }
    
    if (scalingTypes.str && spell.scaling?.str) {
        const strScaling = this.getParam(spell, 'scaling.str', levelIndex, 0);
        damage += caster.stats.str * strScaling;
    }
    
    if (scalingTypes.int && spell.scaling?.int) {
        const intScaling = this.getParam(spell, 'scaling.int', levelIndex, 0);
        damage += caster.stats.int * intScaling;
    }
    
    if (scalingTypes.agi && spell.scaling?.agi) {
        const agiScaling = this.getParam(spell, 'scaling.agi', levelIndex, 0);
        damage += caster.stats.agi * agiScaling;
    }
    
    return damage;
},

    // Find lowest HP ally
    getLowestHpAlly: function(battle, caster) {
        const allies = battle.getParty(caster);
        const aliveAllies = allies.filter(a => a && a.isAlive);
        
        if (aliveAllies.length === 0) return null;
        
        aliveAllies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
        return aliveAllies[0];
    },

    // Apply effect to all alive enemies
    forEachAliveEnemy: function(battle, caster, callback) {
        const enemies = battle.getEnemies(caster);
        enemies.forEach(enemy => {
            if (enemy.isAlive) {
                callback(enemy);
            }
        });
    },

    // Apply effect to all alive allies
    forEachAliveAlly: function(battle, caster, callback) {
        const allies = battle.getParty(caster);
        allies.forEach(ally => {
            if (ally.isAlive) {
                callback(ally);
            }
        });
    },

    // Basic damage spell template
    basicDamageSpell: function(battle, caster, target, spell, spellLevel, options = {}) {
        const levelIndex = spellLevel - 1;
        const damage = this.calculateDamage(spell, levelIndex, caster, options.scalingTypes || {attack: true});
        
        const actualDamage = options.damageModifier ? damage * options.damageModifier : damage;
        battle.dealDamage(caster, target, actualDamage, options.damageType || 'physical', options.damageOptions);
        
        if (options.afterDamage) {
            options.afterDamage(battle, caster, target, spell, levelIndex);
        }
    },

    // AoE damage spell template
    aoeDamageSpell: function(battle, caster, spell, spellLevel, options = {}) {
        const levelIndex = spellLevel - 1;
        const damage = this.calculateDamage(spell, levelIndex, caster, options.scalingTypes || {attack: true});
        
        this.forEachAliveEnemy(battle, caster, enemy => {
            const actualDamage = options.getDamageModifier ? damage * options.getDamageModifier(enemy) : damage;
            battle.dealDamage(caster, enemy, actualDamage, options.damageType || 'physical', options.damageOptions);
            
            if (options.perEnemyEffect) {
                options.perEnemyEffect(battle, caster, enemy, spell, levelIndex);
            }
        });
    }
};

// Buff/Debuff helper functions
const buffDebuffHelpers = {
    // Safe getters
    getBuffs: function(unit) {
        return unit.buffs || [];
    },
    
    getDebuffs: function(unit) {
        return unit.debuffs || [];
    },
    
    // Check existence
    hasBuff: function(unit, buffName) {
        return this.getBuffs(unit).some(b => b.name === buffName);
    },
    
    hasDebuff: function(unit, debuffName) {
        return this.getDebuffs(unit).some(d => d.name === debuffName);
    },
    
    // Count
    countBuffs: function(unit, excludeNames = []) {
        return this.getBuffs(unit).filter(b => !excludeNames.includes(b.name)).length;
    },
    
    countDebuffs: function(unit) {
        return this.getDebuffs(unit).length;
    },
    
    // Remove specific
    removeBuff: function(unit, buffName) {
        if (!unit.buffs) return false;
        const index = unit.buffs.findIndex(b => b.name === buffName);
        if (index !== -1) {
            unit.buffs.splice(index, 1);
            return true;
        }
        return false;
    },

    removeDebuff: function(unit, debuffName) {
    if (!unit.debuffs) return false;
    const index = unit.debuffs.findIndex(d => d.name === debuffName);
    if (index !== -1) {
        unit.debuffs.splice(index, 1);
        return true;
    }
    return false;
},
    
    removeFirstDebuff: function(unit) {
        if (unit.debuffs && unit.debuffs.length > 0) {
            return unit.debuffs.shift();
        }
        return null;
    },
    
    // Clear all
    clearBuffs: function(unit, excludeNames = ['Boss']) {
        if (!unit.buffs) return [];
        const removed = unit.buffs.filter(b => !excludeNames.includes(b.name));
        unit.buffs = unit.buffs.filter(b => excludeNames.includes(b.name));
        return removed;
    },
    
    clearDebuffs: function(unit) {
        const removed = unit.debuffs || [];
        unit.debuffs = [];
        return removed;
    },
    
    // Transfer
    transferBuffs: function(source, target, excludeNames = ['Boss']) {
        const transferred = [];
        if (source.buffs) {
            source.buffs = source.buffs.filter(buff => {
                if (!excludeNames.includes(buff.name)) {
                    target.buffs = target.buffs || [];
                    target.buffs.push(buff);
                    transferred.push(buff);
                    return false;
                }
                return true;
            });
        }
        return transferred;
    },
    
    stealRandomDebuff: function(source, target) {
        const debuffs = this.getDebuffs(source);
        if (debuffs.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * debuffs.length);
        const debuff = debuffs.splice(randomIndex, 1)[0];
        
        target.debuffs = target.debuffs || [];
        target.debuffs.push(debuff);
        return debuff;
    }
};

// Debuff configurations
const debuffConfigs = {
    'Bleed': { bleedDamage: true },
    'Blight': { noHeal: true },
    'Stun': { stunned: true },
    'Taunt': (caster) => ({ 
        tauntTarget: caster,
        forcedTarget: caster.position,
        forcedTargetIsEnemy: caster.isEnemy
    }),
    'Reduce Attack': { attackMultiplier: 0.5 },
    'Silence': {},
    'Mark': {},
    'Reduce Speed': {},
    'Reduce Defense': {}
};

// Apply configured debuff
function applyConfiguredDebuff(battle, target, debuffName, duration, caster = null) {
    const config = debuffConfigs[debuffName];
    const props = typeof config === 'function' ? config(caster) : (config || {});
    battle.applyDebuff(target, debuffName, duration, props);
}

// Action bar manipulation helpers
const actionBarHelpers = {
    drain: function(target, percent, battle = null) {
        const oldActionBar = target.actionBar;
        const drain = oldActionBar * percent;
        target.actionBar = Math.max(0, oldActionBar - drain);
        if (battle) {
            battle.log(`${target.name}'s action bar drained by ${Math.floor(percent * 100)}%!`);
        }
        return drain;
    },
    
    grant: function(target, percent, battle = null) {
        const oldActionBar = target.actionBar;
        const amount = percent * 10000;
        target.actionBar = Math.min(10000, oldActionBar + amount);
        if (battle && amount > 0) {
            battle.log(`${target.name} gains ${Math.floor(percent * 100)}% action bar!`);
        }
        return amount;
    },
    
    steal: function(from, to, percent = 1.0, battle = null) {
        const stolen = from.actionBar * percent;
        from.actionBar = Math.max(0, from.actionBar - stolen);
        to.actionBar = Math.min(10000, to.actionBar + stolen);
        if (battle && stolen > 0) {
            battle.log(`${to.name} steals ${Math.floor(percent * 100)}% action bar from ${from.name}!`);
        }
        return stolen;
    },
    
    fill: function(target, battle = null) {
        target.actionBar = 10000;
        if (battle) {
            battle.log(`${target.name}'s action bar filled to 100%!`);
        }
    },
    
    reduce: function(target, percent, battle = null) {
        const oldActionBar = target.actionBar;
        target.actionBar = Math.floor(oldActionBar * (1 - percent));
        if (battle) {
            battle.log(`${target.name}'s action bar reduced by ${Math.floor(percent * 100)}%!`);
        }
    }
};

// HP-based calculations
const hpHelpers = {
    missingHp: (unit) => unit.maxHp - unit.currentHp,
    hpPercent: (unit) => unit.currentHp / unit.maxHp,
    isBelowThreshold: (unit, threshold) => (unit.currentHp / unit.maxHp) < threshold,
    percentOfMaxHp: (unit, percent) => Math.floor(unit.maxHp * percent),
    
    drainHpPercent: function(unit, percent, minHp = 1) {
        const drainAmount = Math.floor(unit.maxHp * percent);
        const actualDrain = Math.min(drainAmount, unit.currentHp - minHp);
        unit.currentHp -= actualDrain;
        return actualDrain;
    }
};

// Conditional damage helpers
const conditionalDamageHelpers = {
    ifDebuffed: function(target, debuffName, multiplier, battle, logMessage) {
        if (buffDebuffHelpers.hasDebuff(target, debuffName)) {
            if (logMessage && battle) battle.log(logMessage);
            return multiplier;
        }
        return 1;
    },
    
    ifBelowHp: function(target, threshold, multiplier, battle, logMessage) {
        if (hpHelpers.isBelowThreshold(target, threshold)) {
            if (logMessage && battle) battle.log(logMessage);
            return multiplier;
        }
        return 1;
    }
};

// Passive ability helpers
const passiveHelpers = {
    addOnHitEffect: function(caster, effect) {
        caster.onHitEffects = caster.onHitEffects || [];
        caster.onHitEffects.push(effect);
    },
    
    addOnDamageTaken: function(caster, effect) {
        caster.onDamageTaken = caster.onDamageTaken || [];
        caster.onDamageTaken.push(effect);
    },
    
    addOnKillEffect: function(caster, effect) {
        caster.onKillEffects = caster.onKillEffects || [];
        caster.onKillEffects.push(effect);
    },
    
    addDamageCalculation: function(caster, calculation) {
        caster.onDamageCalculation = caster.onDamageCalculation || [];
        caster.onDamageCalculation.push(calculation);
    }
};

// Multi-application helpers
const multiApplyHelpers = {
    applyDebuffStacks: function(battle, target, debuffName, count, duration, caster = null) {
        for (let i = 0; i < count; i++) {
            applyConfiguredDebuff(battle, target, debuffName, duration, caster);
        }
    },
    
    applyRandomDebuffs: function(battle, targets, debuffTypes, count, duration, caster = null) {
    const debuffCaps = {
        'Stun': 1,
        'Silence': 2,
        'Taunt': 0 // Don't apply taunt through random debuffs
    };
    
    // Track applied debuffs per target
    const targetDebuffs = {};
    targets.forEach(target => {
        targetDebuffs[target.name] = {};
        // Count existing debuffs
        target.debuffs.forEach(d => {
            targetDebuffs[target.name][d.name] = d.duration;
        });
    });
    
    for (let i = 0; i < count && targets.length > 0; i++) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        let debuffApplied = false;
        let attempts = 0;
        
        while (!debuffApplied && attempts < 10) {
            let debuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
            
            // Replace Taunt with Mark
            if (debuff === 'Taunt') {
                debuff = 'Mark';
            }
            
            const currentDuration = targetDebuffs[target.name][debuff] || 0;
            const cap = debuffCaps[debuff];
            
            if (cap === undefined || currentDuration < cap) {
                // Can apply this debuff
                applyConfiguredDebuff(battle, target, debuff, duration, caster);
                
                // Update tracking
                if (!targetDebuffs[target.name][debuff]) {
                    targetDebuffs[target.name][debuff] = 0;
                }
                targetDebuffs[target.name][debuff] += duration;
                
                debuffApplied = true;
            }
            
            attempts++;
        }
        
        // Fallback to Mark if couldn't apply anything else
        if (!debuffApplied) {
            applyConfiguredDebuff(battle, target, 'Mark', duration);
        }
    }
},
    
    convertBuffsToDebuffs: function(battle, target, caster) {
    // Get all buffs with their durations (excluding Boss)
    const buffsToConvert = buffDebuffHelpers.getBuffs(target).filter(b => b.name !== 'Boss');
    buffDebuffHelpers.clearBuffs(target, ['Boss']);
    
    if (buffsToConvert.length === 0) return;
    
    // Debuff types that can be applied
    const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Blight', 'Bleed', 'Mark'];
    
    // Track debuffs to apply and their current durations
    const debuffsToApply = {};
    const debuffCaps = {
        'Stun': 1,
        'Silence': 2,
        // No caps for other debuffs
    };
    
    // Convert each buff to a random debuff, preserving duration
    buffsToConvert.forEach(buff => {
        const duration = buff.duration === -1 ? 1 : buff.duration; // Convert permanent buffs to 1 turn
        
        // Keep trying until we find a debuff that isn't already capped
        let attempts = 0;
        let debuffApplied = false;
        
        while (!debuffApplied && attempts < 10) {
            const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
            
            // Check if this debuff is already at cap
            const currentDuration = debuffsToApply[randomDebuff] || 0;
            const cap = debuffCaps[randomDebuff];
            
            if (!cap || currentDuration < cap) {
                // Can apply this debuff
                if (!debuffsToApply[randomDebuff]) {
                    debuffsToApply[randomDebuff] = 0;
                }
                
                if (cap) {
                    // Add only up to the cap
                    debuffsToApply[randomDebuff] = Math.min(currentDuration + duration, cap);
                } else {
                    // No cap, add full duration
                    debuffsToApply[randomDebuff] += duration;
                }
                
                debuffApplied = true;
            }
            
            attempts++;
        }
        
        // Fallback: if we couldn't find an uncapped debuff after 10 tries, 
        // just add to Mark (which has no cap)
        if (!debuffApplied) {
            if (!debuffsToApply['Mark']) {
                debuffsToApply['Mark'] = 0;
            }
            debuffsToApply['Mark'] += duration;
        }
    });
    
    // Apply the accumulated debuffs
    Object.entries(debuffsToApply).forEach(([debuffName, totalDuration]) => {
        if (debuffName === 'Taunt') {
            // Skip taunt since we need a valid target - replace with Mark
            applyConfiguredDebuff(battle, target, 'Mark', totalDuration);
        } else {
            applyConfiguredDebuff(battle, target, debuffName, totalDuration);
        }
    });
}
};

// Resource stealing and redistribution
function stealAndRedistribute(battle, enemies, allies, extractFn, applyFn, logMessage) {
    const collected = [];
    enemies.forEach(enemy => {
        if (enemy.isAlive) {
            collected.push(...extractFn(enemy));
        }
    });
    
    while (collected.length > 0 && allies.length > 0) {
        const ally = allies[Math.floor(Math.random() * allies.length)];
        applyFn(ally, collected.shift());
    }
    
    if (logMessage && battle) {
        battle.log(logMessage);
    }
}

// Spell Logic Functions
const spellLogic = {
    // Villager Spells
    punchLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true},
            damageType: 'physical'
        });
    },

    furyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    throwRockLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
            }
        });
    },

    // Acolyte Family Spells
holySmiteLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.3);
    
    const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const actualDamage = battle.dealDamage(caster, target, damage, 'magical');
    
    const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
    if (lowestHpAlly && actualDamage > 0) {
        const healAmount = actualDamage * healPercent;
        battle.healUnit(lowestHpAlly, healAmount);
    }
},

divineLightLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healAmount = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    
    // Check if target is at full HP before healing
    const isFullHp = target.currentHp >= target.maxHp;
    
    // Heal the target
    const actualHeal = battle.healUnit(target, healAmount);
    
    // If target was full HP, apply shield and immune
    if (isFullHp) {
        const shieldAmount = Math.floor(healAmount / 2);
        battle.applyBuff(target, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(target, 'Immune', 1, { immunity: true });
        battle.log(`${target.name} is already at full health! Gains shield and immunity!`);
    }
    
    // Remove up to 3 debuffs
    let debuffsRemoved = 0;
    for (let i = 0; i < 3; i++) {
        if (buffDebuffHelpers.removeFirstDebuff(target)) {
            debuffsRemoved++;
        } else {
            break; // No more debuffs to remove
        }
    }
    
    if (debuffsRemoved > 0) {
        battle.log(`Removed ${debuffsRemoved} debuff${debuffsRemoved > 1 ? 's' : ''} from ${target.name}!`);
    }
    
    // Hierophant Male passive - Divine Retribution
    if (caster.hierophantMalePassive && caster.divineRetributionChance && Math.random() < caster.divineRetributionChance) {
        const enemies = battle.getEnemies(caster);
        const aliveEnemies = enemies.filter(e => e && e.isAlive);
        
        if (aliveEnemies.length > 0) {
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            battle.log(`Divine retribution! ${target.name} strikes ${randomEnemy.name}!`);
            
            // Deal damage based on the healed target's attack
            const retributionDamage = target.source.attack;
            battle.dealDamage(target, randomEnemy, retributionDamage, 'physical');
        }
    }
},

sanctuaryLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        // Apply both buffs to all allies
        battle.applyBuff(ally, 'Increase Defense', duration, {});
        battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        
        // Remove one random debuff using helper
        const debuffs = buffDebuffHelpers.getDebuffs(ally);
        if (debuffs.length > 0) {
            // Pick random debuff and remove it
            const randomIndex = Math.floor(Math.random() * debuffs.length);
            const randomDebuff = debuffs[randomIndex];
            if (buffDebuffHelpers.removeDebuff(ally, randomDebuff.name)) {
                battle.log(`Sanctuary cleanses ${randomDebuff.name} from ${ally.name}!`);
            }
        }
    });
    
    // Hierophant Female passive - Sanctuary Momentum
    if (caster.hierophantFemalePassive && caster.sanctuaryActionBarGrant) {
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            actionBarHelpers.grant(ally, caster.sanctuaryActionBarGrant, battle);
        });
        battle.log(`Sanctuary's divine energy accelerates all allies!`);
    }
},

massHealLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healAmount = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.healUnit(ally, healAmount);
        battle.applyBuff(ally, 'Immune', 2, { immunity: true });
    });
    
    // Prophetess Female passive - Mass Momentum
    if (caster.prophetessFemalePassive && caster.massHealActionBarChance && Math.random() < caster.massHealActionBarChance) {
        actionBarHelpers.fill(caster, battle);
        battle.log(`${caster.name}'s mass healing momentum fills their action bar!`);
    }
},

hierophantMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.hierophantMalePassive = true;
    caster.divineRetributionChance = spell.retributionChance || 1.0;
},

hierophantFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.hierophantFemalePassive = true;
    caster.sanctuaryActionBarGrant = spell.actionBarGrant || 0.2;
},

prophetMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.prophetMalePassive = true;
    caster.overhealingSpillover = spell.spilloverPercent || 0.5;
},

prophetessFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.prophetessFemalePassive = true;
    caster.massHealActionBarChance = spell.actionBarChance || 0.5;
    caster.massHealActionBarGain = spell.actionBarGain || 1.0;
},

    // Archer Family Spells
    aimedShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const armorPierce = spellHelpers.getParam(spell, 'armorPierce', levelIndex, 0.25);
        
        // Shield break using helper
        if (buffDebuffHelpers.removeBuff(target, 'Shield')) {
            battle.log(`${target.name}'s shield was broken!`);
        }
        
        // Damage using helper with proper options
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            damageOptions: { armorPierce: armorPierce },
            afterDamage: (battle, caster, target) => {
                // Monster Hunter Male passive - apply bleed
                if (caster.aimedShotAppliesBleed && target.isAlive) {
                    applyConfiguredDebuff(battle, target, 'Bleed', caster.aimedShotBleedDuration || 1);
                }
                
                // Monster Hunter Female passive - action bar per debuff
                if (caster.aimedShotActionBarPerDebuff && target.isAlive) {
                    const debuffCount = buffDebuffHelpers.countDebuffs(target);
                    if (debuffCount > 0) {
                        actionBarHelpers.grant(caster, debuffCount * caster.aimedShotActionBarPerDebuff, battle);
                    }
                }
            }
        });
    },

    huntersMarkLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        applyConfiguredDebuff(battle, target, 'Mark', duration);
        applyConfiguredDebuff(battle, target, 'Blight', duration);
    },

    doubleShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 1);
        
        // First shot with Reduce Defense
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', debuffDuration);
            }
        });
        
        // Second shot to random enemy with Bleed
        const enemies = battle.getEnemies(caster);
        const aliveEnemies = enemies.filter(e => e && e.isAlive);
        if (aliveEnemies.length > 0) {
            const randomTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            spellHelpers.basicDamageSpell(battle, caster, randomTarget, spell, spellLevel, {
                scalingTypes: {attack: true, agi: true},
                damageType: 'physical',
                afterDamage: () => {
                    applyConfiguredDebuff(battle, randomTarget, 'Bleed', debuffDuration);
                }
            });
        }
    },

rainOfArrowsLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffBonus = spellHelpers.getParam(spell, 'debuffBonus', levelIndex, 20);
    
    // Calculate base damage once
    const baseDamage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, agi: true});
    
    // Apply damage to each enemy with debuff bonus
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const debuffCount = buffDebuffHelpers.countDebuffs(enemy);
        const totalDamage = baseDamage + (debuffBonus * debuffCount);
        battle.dealDamage(caster, enemy, totalDamage, 'physical');
    });
},

    sniperMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        passiveHelpers.addDamageCalculation(caster, {
            type: 'executioner',
            damageBonus: 1.5,
            hpThreshold: 0.3
        });
    },

    sniperFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const speedDuration = spellHelpers.getParam(spell, 'speedDuration', levelIndex, 2);
        
        passiveHelpers.addOnKillEffect(caster, {
            type: 'buff',
            buffName: 'Increase Speed',
            duration: speedDuration
        });
    },

    monsterHunterMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 1);
        
        caster.aimedShotAppliesBleed = true;
        caster.aimedShotBleedDuration = bleedDuration;
    },

    monsterHunterFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarPerDebuff = spellHelpers.getParam(spell, 'actionBarPerDebuff', levelIndex, 0.05);
        
        caster.aimedShotActionBarPerDebuff = actionBarPerDebuff;
    },

    // Druid Family Spells
naturesBlessingLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
    
    const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
    if (lowestHpAlly) {
        actionBarHelpers.grant(lowestHpAlly, actionBarGrant, battle);
        
        if (caster.summonerFemalePassive) {
    const healAmount = hpHelpers.percentOfMaxHp(lowestHpAlly, caster.summonerFemaleHealPercent || 0.05);
    battle.healUnit(lowestHpAlly, healAmount);
}
    }
        
        if (caster.summonerMalePassive) {
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    
    if (aliveEnemies.length > 0) {
        aliveEnemies.sort((a, b) => hpHelpers.hpPercent(a) - hpHelpers.hpPercent(b));
        const lowestHpEnemy = aliveEnemies[0];
        actionBarHelpers.drain(lowestHpEnemy, caster.summonerMaleActionBarDrain || 0.05, battle);
    }
}
    },

barkskinLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.15);
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.08);
    
    battle.applyBuff(target, 'Increase Defense', duration, {});
    
    const healAmount = hpHelpers.percentOfMaxHp(target, healPercent);
    battle.healUnit(target, healAmount);
    
    const shieldAmount = hpHelpers.percentOfMaxHp(target, shieldPercent);
    battle.applyBuff(target, 'Shield', -1, { shieldAmount: shieldAmount });
},

    primalRoarLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
                
                if (caster.runemasterMalePassive) {
                    applyConfiguredDebuff(battle, enemy, 'Taunt', 1, caster);
                }
            }
        });
    },

naturesBalanceLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healAmount = spellHelpers.getParam(spell, 'healAmount', levelIndex, 10);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        buffDebuffHelpers.clearDebuffs(ally);
        battle.healUnit(ally, healAmount);
        battle.log(`${ally.name} cleansed and healed!`);
    });
    
    // Use aoeDamageSpell helper for damage portion
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            buffDebuffHelpers.clearBuffs(enemy);
            battle.log(`${enemy.name} dispelled!`);
        }
    });
},

    runemasterMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.runemasterMalePassive = true;
    },

    runemasterFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.runemasterFemalePassive = true;
        caster.retaliateWithNaturesBlessing = true;
    },

    summonerMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.summonerMalePassive = true;
    caster.summonerMaleActionBarDrain = spell.actionBarDrain || 0.05;
},

    summonerFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.summonerFemalePassive = true;
    caster.summonerFemaleHealPercent = spell.healPercent || 0.05;
},

    // Initiate Family Spells
arcaneMissilesLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Hit the primary target using helper
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
    
    // Hit each debuffed enemy (including the original target if it has debuffs)
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
    if (buffDebuffHelpers.countDebuffs(enemy) > 0) {
        spellHelpers.basicDamageSpell(battle, caster, enemy, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    }
});
},

    frostArmorLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        battle.applyBuff(caster, 'Frost Armor', duration, {});
    },

helpingHandLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const debuffCount = buffDebuffHelpers.countDebuffs(target);
    buffDebuffHelpers.clearDebuffs(target);
    battle.log(`All debuffs removed from ${target.name}!`);
    
    actionBarHelpers.fill(target, battle);
    
    // White Wizard/Witch passives - always give Frost Armor, conditionally give extra buff
    if (caster.whiteWizardMalePassive) {
        battle.applyBuff(target, 'Frost Armor', 2, {});
        if (debuffCount >= 2) {
            battle.applyBuff(target, 'Increase Attack', 1, { damageMultiplier: 1.5 });
            battle.log(`${target.name} gains attack power from empowering cleanse!`);
        }
    }
    
    if (caster.whiteWitchFemalePassive) {
        battle.applyBuff(target, 'Frost Armor', 2, {});
        if (debuffCount >= 2) {
            battle.applyBuff(target, 'Increase Speed', 1, {});
            battle.log(`${target.name} gains speed from hastening cleanse!`);
        }
    }
},

twilightsPromiseLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const actionBarDrain = spell.actionBarDrain || 0.1;
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        actionBarHelpers.reduce(ally, actionBarDrain);
    });
    
    caster.twilightsEndPending = true;
    battle.log(`${caster.name} prepares Twilight's End!`);
},

twilightsEndLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarReduction = spellHelpers.getParam(spell, 'actionBarReduction', levelIndex, 0.5);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            actionBarHelpers.reduce(enemy, actionBarReduction);
        }
    });
},

    whiteWizardMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.whiteWizardMalePassive = true;
    },

    whiteWitchFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.whiteWitchFemalePassive = true;
    },

    archSageMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.archSageMalePassive = true;
    },

    archSageFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.archSageFemalePassive = true;
    },

    // Swordsman Family Spells
bladeStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedBonus = spellHelpers.getParam(spell, 'bleedBonus', levelIndex, 1.5);
    const damageMultiplier = conditionalDamageHelpers.ifDebuffed(target, 'Bleed', bleedBonus, battle, 'Critical strike on bleeding target!');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageModifier: damageMultiplier
    });
},

    shieldBashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 25);
        
        applyConfiguredDebuff(battle, target, 'Taunt', tauntDuration, caster);
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    },

rallyBannerLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Taunt', duration, caster);
    });
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        actionBarHelpers.grant(ally, actionBarGrant, battle);
    });
},

    bloodPactLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        multiApplyHelpers.applyDebuffStacks(battle, caster, 'Bleed', spell.bleedStacks, bleedDuration);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', bleedDuration, caster);
            multiApplyHelpers.applyDebuffStacks(battle, enemy, 'Bleed', spell.bleedStacks, bleedDuration);
        });
    },

championMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.2);
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    
    passiveHelpers.addOnDamageTaken(caster, {
        type: 'stun_counter',
        chance: stunChance,
        duration: stunDuration
    });
},

championFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.2);
    const regenerateTurns = spellHelpers.getParam(spell, 'regenerateTurns', levelIndex, 4);
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    caster.shieldRegenTimer = 0;
    caster.shieldRegenTurns = regenerateTurns;
    caster.shieldRegenAmount = shieldAmount;
    caster.championFemalePassive = true;
},

avengerMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const blightDuration = spellHelpers.getParam(spell, 'blightDuration', levelIndex, 2);
    
    caster.avengerBlightOnTauntedAttack = true;
    caster.avengerBlightDuration = blightDuration;
},

avengerFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGain = spellHelpers.getParam(spell, 'actionBarGain', levelIndex, 0.15);
    
    caster.actionBarGainOnDamage = actionBarGain;
},

    // Templar Family Spells
psiStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.05);
    const actionBarThreshold = spellHelpers.getParam(spell, 'actionBarThreshold', levelIndex, 0.3);
    
    const damageType = target.actionBar >= (10000 * actionBarThreshold) ? 'physical' : 'pure';
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: damageType,
        afterDamage: (battle, caster, target) => {
            if (damageType === 'physical' && target.isAlive) {
                actionBarHelpers.drain(target, actionBarDrain, battle);
            }
        }
    });
},

    psychicMarkLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        applyConfiguredDebuff(battle, target, 'Mark', duration);
        applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
        
        if (caster.darkArchTemplarFemalePassive) {
            applyConfiguredDebuff(battle, target, 'Blight', duration);
        }
    },

voidStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const debuffCount = buffDebuffHelpers.countDebuffs(target);
    
    if (debuffCount > 0) {
        // Get the actual psi_strike spell for consistent scaling
        const psiStrikeSpell = spellManager.getSpell('psi_strike');
        if (psiStrikeSpell) {
            for (let i = 0; i < debuffCount; i++) {
                spellLogic.psiStrikeLogic(battle, caster, target, psiStrikeSpell, spellLevel);
            }
        } else {
            // Fallback using helper functions
            const levelIndex = spellLevel - 1;
            const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.05);
            const actionBarThreshold = spellHelpers.getParam(spell, 'actionBarThreshold', levelIndex, 0.3);
            
            for (let i = 0; i < debuffCount; i++) {
                const damage = spellHelpers.calculateDamage({
                    scaling: {
                        base: [14, 55, 110, 220, 385],
                        attack: [1.0, 1.0, 1.0, 1.0, 1.0],
                        int: [0.5, 0.52, 0.54, 0.56, 0.58]
                    }
                }, levelIndex, caster, {attack: true, int: true});
                
                if (target.actionBar >= (10000 * actionBarThreshold)) {
                    battle.dealDamage(caster, target, damage, 'physical');
                    actionBarHelpers.drain(target, actionBarDrain, battle);
                } else {
                    battle.dealDamage(caster, target, damage, 'pure');
                }
            }
        }
    } else {
        battle.log(`${target.name} has no debuffs, Void Strike fizzles!`);
    }
},

psiShiftLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const finalActionBarPercent = spellHelpers.getParam(spell, 'finalActionBarPercent', levelIndex, 0.25);
    
    actionBarHelpers.steal(target, caster, 1.0, battle);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
    
    target.actionBar = caster.grandTemplarFemalePassive ? 0 : Math.floor(10000 * finalActionBarPercent);
},

    darkArchTemplarMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.darkArchTemplarMalePassive = true;
    },

    darkArchTemplarFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.darkArchTemplarFemalePassive = true;
    },

    grandTemplarMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.grandTemplarMalePassive = true;
        caster.globalStunChance = spell.stunChance;
    },

    grandTemplarFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.grandTemplarFemalePassive = true;
    },

    // Thief Family Spells
cheapShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    
    const debuff = buffDebuffHelpers.stealRandomDebuff(caster, target);
    if (debuff) {
        battle.log(`${caster.name} transfers ${debuff.name} to ${target.name}!`);
    }
    
    let damageType = 'physical';
    if (caster.phantomAssassinFemalePassive && caster.cheapShotPureThreshold) {
        if (hpHelpers.isBelowThreshold(target, caster.cheapShotPureThreshold)) {
            damageType = 'pure';
        }
    }
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: damageType,
        afterDamage: (battle, caster, target) => {
            if (caster.cheapShotAddsBleed && target.isAlive) {
                const bleedDuration = caster.cheapShotBleedDuration || 2;
                applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
            }
        }
    });
},

crippleLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
    applyConfiguredDebuff(battle, target, 'Reduce Attack', duration);
    applyConfiguredDebuff(battle, target, 'Bleed', duration);
},

assassinateLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpThreshold = spellHelpers.getParam(spell, 'hpThreshold', levelIndex, 0.3);
    
    if (hpHelpers.isBelowThreshold(target, hpThreshold) && buffDebuffHelpers.countDebuffs(target) > 0) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'pure'
        });
    } else {
        battle.log(`Assassinate conditions not met!`);
    }
},

shadowstepLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Taunt', duration, caster);
    applyConfiguredDebuff(battle, target, 'Mark', duration);
    applyConfiguredDebuff(battle, target, 'Bleed', duration);
},

phantomAssassinMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarRefill = spellHelpers.getParam(spell, 'actionBarRefill', levelIndex, 0.75);
    
    caster.phantomAssassinMalePassive = true;
    caster.actionBarRefillOnKill = actionBarRefill;
},

phantomAssassinFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpThreshold = spellHelpers.getParam(spell, 'hpThreshold', levelIndex, 0.5);
    
    caster.phantomAssassinFemalePassive = true;
    caster.cheapShotPureThreshold = hpThreshold;
},

masterStalkerMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const dodgePure = spellHelpers.getParam(spell, 'dodgePure', levelIndex, 0.1);
    const dodgeMagical = spellHelpers.getParam(spell, 'dodgeMagical', levelIndex, 0.2);
    const dodgePhysical = spellHelpers.getParam(spell, 'dodgePhysical', levelIndex, 0.3);
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    caster.masterStalkerMalePassive = true;
    caster.dodgePure = dodgePure;
    caster.dodgeMagical = dodgeMagical;
    caster.dodgePhysical = dodgePhysical;
    caster.cheapShotAddsBleed = true;
    caster.cheapShotBleedDuration = bleedDuration;
},

masterStalkerFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const dodgePure = spellHelpers.getParam(spell, 'dodgePure', levelIndex, 0.1);
    const dodgePhysical = spellHelpers.getParam(spell, 'dodgePhysical', levelIndex, 0.2);
    const dodgeMagical = spellHelpers.getParam(spell, 'dodgeMagical', levelIndex, 0.3);
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    caster.masterStalkerFemalePassive = true;
    caster.dodgePure = dodgePure;
    caster.dodgePhysical = dodgePhysical;
    caster.dodgeMagical = dodgeMagical;
    caster.cheapShotAddsBleed = true;
    caster.cheapShotBleedDuration = bleedDuration;
},

    // Witch Hunter Family Spells
purgeSlashLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    let buffsRemoved = 0;
    let damageType = 'physical';
    
    // Store the ability being used for passive checks
    caster.lastAbilityUsed = 'purge_slash';
    
    // Grand Inquisitor Female removes ALL buffs
    if (caster.grandInquisitorFemalePassive && caster.purgeSlashRemoveAll) {
        // Count buffs before removal (excluding Boss)
        const buffsBeforeRemoval = buffDebuffHelpers.countBuffs(target, ['Boss']);
        
        // Remove all buffs except Boss
        const removedBuffs = buffDebuffHelpers.clearBuffs(target, ['Boss']);
        buffsRemoved = removedBuffs.length;
        
        if (buffsRemoved > 0) {
            battle.log(`Removed ALL ${buffsRemoved} buff${buffsRemoved > 1 ? 's' : ''} from ${target.name}!`);
        }
    } else {
        // Normal behavior - remove specific number of buffs
        const baseBuffsToRemove = spellHelpers.getParam(spell, 'buffsToRemove', levelIndex, 1);
        
        // Remove buffs using helper to handle Boss buff
        const currentBuffCount = buffDebuffHelpers.countBuffs(target, ['Boss']);
        if (currentBuffCount > 0) {
            const buffsToRemove = Math.min(baseBuffsToRemove, currentBuffCount);
            for (let i = 0; i < buffsToRemove; i++) {
                const buffs = buffDebuffHelpers.getBuffs(target);
                const removableBuffIndex = buffs.findIndex(b => b.name !== 'Boss');
                if (removableBuffIndex !== -1) {
                    target.buffs.splice(removableBuffIndex, 1);
                    buffsRemoved++;
                }
            }
            if (buffsRemoved > 0) {
                battle.log(`Removed ${buffsRemoved} buff${buffsRemoved > 1 ? 's' : ''} from ${target.name}!`);
            }
        }
    }
    
    // Grand Inquisitor Male passive - pure damage if no buffs removed
    if (caster.grandInquisitorMalePassive && buffsRemoved === 0) {
        damageType = 'pure';
    }
    
    // Professional Witcher Male passive - pure damage vs silenced
    if (buffDebuffHelpers.hasDebuff(target, 'Silence')) {
        if (caster.professionalWitcherMalePassive) {
            damageType = 'pure';
        }
    }
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: damageType
    });
},

nullbladeCleaveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const buffBonus = spellHelpers.getParam(spell, 'buffBonus', levelIndex, 10);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'physical',
        perEnemyEffect: (battle, caster, enemy) => {
            // Calculate bonus damage after the base hit
            const buffCount = buffDebuffHelpers.countBuffs(enemy, ['Boss']);
            if (buffCount > 0) {
                const bonusDamage = buffBonus * buffCount;
                battle.dealDamage(caster, enemy, bonusDamage, 'physical');
                battle.log(`+${bonusDamage} bonus damage from ${buffCount} buffs!`);
            }
        }
    });
},

stealMagicLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    // Get stealable buffs (excluding Boss)
    const stealableBuffs = buffDebuffHelpers.getBuffs(target).filter(b => b.name !== 'Boss');
    
    if (stealableBuffs.length > 0) {
        const allies = battle.getParty(caster);
        const aliveAllies = allies.filter(a => a && a.isAlive);
        
        // Clear all buffs except Boss
        buffDebuffHelpers.clearBuffs(target, ['Boss']);
        
        // Distribute stolen buffs randomly to allies
        stealableBuffs.forEach(buff => {
            if (aliveAllies.length > 0) {
                const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                randomAlly.buffs = randomAlly.buffs || [];
                randomAlly.buffs.push(buff);
                battle.log(`${buff.name} stolen and given to ${randomAlly.name}!`);
            }
        });
    } else {
        battle.log(`No buffs to steal from ${target.name}, applying Reduce Defense instead!`);
        applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
    }
},

hexLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Silence', duration);
},

grandInquisitorMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.grandInquisitorMalePassive = true;
},

grandInquisitorFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.grandInquisitorFemalePassive = true;
    caster.purgeSlashRemoveAll = true;
},

professionalWitcherMalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.professionalWitcherMalePassive = true;
},

professionalWitcherFemalePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.professionalWitcherFemalePassive = true;
},

    // Boss/Enemy Spells
    slashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const percent = spellHelpers.getParam(spell, 'scaling.percent', levelIndex, 0.01);
        const cap = spellHelpers.getParam(spell, 'scaling.cap', levelIndex, 5);
        
        const damage = Math.min(hpHelpers.percentOfMaxHp(target, percent), cap);
        battle.dealDamage(caster, target, damage, 'physical');
    },

    biteLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const percent = spellHelpers.getParam(spell, 'scaling.percent', levelIndex, 0.05);
        const floor = spellHelpers.getParam(spell, 'scaling.floor', levelIndex, 5);
        
        const damage = Math.max(hpHelpers.percentOfMaxHp(target, percent), floor);
        battle.dealDamage(caster, target, damage, 'physical');
    },

    spearThrustLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.3);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < bleedChance) {
                    applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
                }
            }
        });
    },

    defensiveFormationLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        battle.applyBuff(caster, 'Increase Defense', duration, {});
    },

    crushingStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    armorBreakLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', debuffDuration);
            }
        });
    },

    crystalShardLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    protectiveBarrierLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 20);
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            battle.applyBuff(lowestHpAlly, 'Shield', -1, { shieldAmount: shieldAmount });
        }
    },

    staffWhackLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    ancientProtectionLogic: function(battle, caster, target, spell, spellLevel = 1) {
        if (!caster.ancientProtectionApplied) {
            caster.ancientProtectionApplied = true;
            const levelIndex = spellLevel - 1;
            caster.physicalDodgeChance = spellHelpers.getParam(spell, 'dodgeChance', levelIndex, 0.4);
        }
    },

    ancestralTauntLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
        });
    },

    chieftainsHammerLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.15);
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < stunChance) {
                    applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                }
            }
        });
    },

    warCryLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const allyBuffDuration = spellHelpers.getParam(spell, 'allyBuffDuration', levelIndex, 2);
        const selfSpeedDuration = spellHelpers.getParam(spell, 'selfSpeedDuration', levelIndex, 1);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', allyBuffDuration, { damageMultiplier: 1.5 });
        });
        
        battle.applyBuff(caster, 'Increase Speed', selfSpeedDuration, {});
    },

    axeThrowLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.4);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < bleedChance) {
                    applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
                }
            }
        });
    },

    berserkerRageLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    dualAxesLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.5);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
        const hitCount = spellHelpers.getParam(spell, 'hitCount', levelIndex, 2);
        
        for (let i = 0; i < hitCount; i++) {
            spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
                scalingTypes: {attack: true, agi: true},
                damageType: 'physical',
                afterDamage: (battle, caster, target) => {
                    if (Math.random() < bleedChance) {
                        applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
                    }
                }
            });
        }
    },

    rallyingCryLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Speed', duration, {});
        });
    },

    frostBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.15);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: (battle, caster, target) => {
                if (target.isAlive) {
                    actionBarHelpers.drain(target, actionBarDrain, battle);
                }
            }
        });
    },

    chillingTouchLogic: function(battle, caster, target, spell, spellLevel = 1) {
        if (!caster.chillingTouchApplied) {
            caster.chillingTouchApplied = true;
            const levelIndex = spellLevel - 1;
            const slowChance = spellHelpers.getParam(spell, 'slowChance', levelIndex, 0.3);
            const slowDuration = spellHelpers.getParam(spell, 'slowDuration', levelIndex, 2);
            
            passiveHelpers.addOnHitEffect(caster, {
                type: 'debuff',
                debuffName: 'Reduce Speed',
                chance: slowChance,
                duration: slowDuration
            });
        }
    },

    savageBiteLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    packFuryLogic: function(battle, caster, target, spell, spellLevel = 1) {
        if (!caster.packFuryApplied) {
            caster.packFuryApplied = true;
            const levelIndex = spellLevel - 1;
            const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
            
            passiveHelpers.addOnDamageTaken(caster, {
                type: 'buff',
                buffName: 'Increase Attack',
                duration: buffDuration
            });
        }
    },

    chillingHowlLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 3);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', debuffDuration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', debuffDuration);
        });
    },

    crushingBlowLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    thickHideLogic: function(battle, caster, target, spell, spellLevel = 1) {
        if (!caster.thickHideApplied) {
            caster.thickHideApplied = true;
            const levelIndex = spellLevel - 1;
            const damageReduction = spellHelpers.getParam(spell, 'damageReduction', levelIndex, 0.15);
            caster.damageReduction = (caster.damageReduction || 0) + damageReduction;
        }
    },

    maulLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
            }
        });
    },

    rampageLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 4);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Bleed', bleedDuration);
        });
        battle.log(`${caster.name} goes on a rampage, causing all enemies to bleed!`);
    },

    frostBreathLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const slowDuration = spellHelpers.getParam(spell, 'slowDuration', levelIndex, 2);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', slowDuration);
        }
    });
},

    // Sorrowshade Hollow Spells
    spiritTouchLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    bansheeWailLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const silenceChance = spellHelpers.getParam(spell, 'silenceChance', levelIndex, 0.3);
    const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            if (Math.random() < silenceChance) {
                applyConfiguredDebuff(battle, enemy, 'Silence', silenceDuration);
            }
        }
    });
},

    phaseShiftLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        buffDebuffHelpers.clearDebuffs(caster);
        battle.log(`${caster.name} phases out, removing all debuffs!`);
        
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    rootSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    entanglingRootsLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        applyConfiguredDebuff(battle, target, 'Taunt', duration, caster);
        applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
    },

    sludgeBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    toxicPoolLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Blight', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
        });
    },

    corrosiveSplashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.corrosiveSplashPassive = true;
        const levelIndex = spellLevel - 1;
        caster.corrosiveSplashChance = spellHelpers.getParam(spell, 'procChance', levelIndex, 0.3);
        caster.corrosiveSplashDuration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    },

    shadowBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    shadowVeilLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        battle.applyBuff(target, 'Increase Speed', duration, {});
    },

    darkBlessingLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(target, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        
        if (buffDebuffHelpers.removeFirstDebuff(target)) {
            battle.log(`Removed a debuff from ${target.name}!`);
        }
    },

    spectralSlashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                actionBarHelpers.drain(target, actionBarDrain, battle);
            }
        });
    },

    deathShriekLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Silence', silenceDuration);
        }
    });
},

    mournfulPresenceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            actionBarHelpers.drain(enemy, actionBarDrain);
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
        });
        battle.log(`Mournful presence drains action bars and slows enemies!`);
    },

    branchWhipLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.4);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < bleedChance) {
                    applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
                }
            }
        });
    },

    naturesCorruptionLogic: function(battle, caster, target, spell, spellLevel = 1) {
        multiApplyHelpers.convertBuffsToDebuffs(battle, target, caster);
        battle.log(`${target.name}'s buffs corrupted into debuffs!`);
    },

    thornedEmbraceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
        const bleedStacks = spell.bleedStacks || 2;
        
        applyConfiguredDebuff(battle, target, 'Taunt', tauntDuration, caster);
        multiApplyHelpers.applyDebuffStacks(battle, target, 'Bleed', bleedStacks, bleedDuration);
    },

    phantomStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const silencedMultiplier = conditionalDamageHelpers.ifDebuffed(
            target, 'Silence', spell.silencedMultiplier || 2.0, battle, 'Phantom strike critical on silenced target!'
        );
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            damageModifier: silencedMultiplier
        });
    },

wailingChorusLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Mark', duration);
        }
    });
},

    spiritualDrainLogic: function(battle, caster, target, spell, spellLevel = 1) {
    if (buffDebuffHelpers.countBuffs(target) > 0) {
        const stolen = buffDebuffHelpers.clearBuffs(target);
        caster.buffs = caster.buffs || [];
        caster.buffs.push(...stolen);
        battle.log(`${caster.name} steals all buffs from ${target.name}!`);
    }
    
    actionBarHelpers.steal(target, caster, 1.0, battle);
},

    queensLamentPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.queensLamentPassive = true;
        caster.queensLamentHealPercent = spell.healPercent || 0.1;
        caster.queensLamentBuffDuration = spell.buffDuration || 2;
    },

    // Forgotten Crypt Spells
    boneStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        if (buffDebuffHelpers.removeBuff(target, 'Shield')) {
            battle.log(`${target.name}'s shield was shattered!`);
        }
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    necroticStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Blight', duration);
            }
        });
    },

    deathsAdvanceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
        
        battle.applyBuff(caster, 'Increase Speed', duration, {});
        battle.applyBuff(caster, 'Immune', duration, { immunity: true });
    },

    cursedArrowLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const markChance = spellHelpers.getParam(spell, 'markChance', levelIndex, 0.5);
        const markDuration = spellHelpers.getParam(spell, 'markDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < markChance) {
                    applyConfiguredDebuff(battle, target, 'Mark', markDuration);
                }
            }
        });
    },

    volleyOfDecayLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
            }
        });
    },

    piercingShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            // Find first removable buff (not Boss)
            const removableBuffIndex = target.buffs.findIndex(b => b.name !== 'Boss');
            if (removableBuffIndex !== -1) {
                const removedBuff = target.buffs.splice(removableBuffIndex, 1)[0];
                battle.log(`Piercing shot removes ${removedBuff.name} from ${target.name}!`);
            }
        }
    });
},

    deathBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    darkRitualLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            const healAmount = hpHelpers.percentOfMaxHp(ally, healPercent);
            battle.healUnit(ally, healAmount);
        });
    },

    corpseShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const targetCount = spellHelpers.getParam(spell, 'targetCount', levelIndex, 2);
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 30);
        
        const allies = battle.getParty(caster);
        const aliveAllies = allies.filter(a => a && a.isAlive);
        
        if (aliveAllies.length > 0) {
            aliveAllies.sort((a, b) => hpHelpers.hpPercent(a) - hpHelpers.hpPercent(b));
            
            const targetsToShield = Math.min(targetCount, aliveAllies.length);
            for (let i = 0; i < targetsToShield; i++) {
                battle.applyBuff(aliveAllies[i], 'Shield', -1, { shieldAmount: shieldAmount });
            }
        }
    },

    drainLifeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.3);
        
        const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
        const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
        
        const healAmount = damageDealt * healPercent;
        battle.healUnit(caster, healAmount);
    },

    unholyPresenceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        });
    },

    curseOfWeaknessLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
        });
    },

    bloodFangLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.5);
        
        const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, agi: true});
        const damageDealt = battle.dealDamage(caster, target, damage, 'physical');
        
        const healAmount = damageDealt * healPercent;
        battle.healUnit(caster, healAmount);
    },

    crimsonThirstLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedStacks = spellHelpers.getParam(spell, 'bleedStacks', levelIndex, 2);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        multiApplyHelpers.applyDebuffStacks(battle, target, 'Bleed', bleedStacks, duration);
    },

    batFormLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Increase Speed', duration, {});
        battle.applyBuff(caster, 'Frost Armor', duration, {});
    },

    frostStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
            }
        });
    },

    deathGripLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', duration, caster);
        });
    },

    unholyShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 40);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(caster, 'Increase Defense', duration, {});
    },

    deathPactLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const hpCost = spell.hpCost || 0.2;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        const hpSacrifice = hpHelpers.drainHpPercent(caster, hpCost);
        battle.log(`${caster.name} sacrifices ${hpSacrifice} HP!`);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        });
    },

    fleshRendLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const bleedBonus = conditionalDamageHelpers.ifDebuffed(
            target, 'Bleed', spell.bleedBonus || 1.5, battle, 'Flesh rend tears into bleeding wounds!'
        );
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            damageModifier: bleedBonus
        });
    },

    corpseExplosionLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const missingHpPercent = spellHelpers.getParam(spell, 'missingHpPercent', levelIndex, 0.2);
        const baseDamage = spellHelpers.getParam(spell, 'baseDamage', levelIndex, 50);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            const missingHp = hpHelpers.missingHp(enemy);
            const damage = baseDamage + (missingHp * missingHpPercent);
            battle.dealDamage(caster, enemy, damage, 'magical');
        });
    },

    unholyFrenzyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const stackCount = spell.stackCount || 2;
        
        for (let i = 0; i < stackCount; i++) {
            battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            battle.applyBuff(caster, 'Increase Speed', duration, {});
        }
    },

    patchworkBodyPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.patchworkBodyPassive = true;
        caster.globalDamageReduction = (caster.globalDamageReduction || 0) + (spell.damageReduction || 0.25);
    },

    // Bandit Den Spells
    dirtyStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffChance = spellHelpers.getParam(spell, 'debuffChance', levelIndex, 0.4);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < debuffChance) {
                    applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
                }
            }
        });
    },

    suckerPunchLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.3);
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < stunChance) {
                    applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                }
            }
        });
    },

    serratedBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Bleed', duration);
            }
        });
    },

    lacerateLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedStacks = spellHelpers.getParam(spell, 'bleedStacks', levelIndex, 3);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        multiApplyHelpers.applyDebuffStacks(battle, target, 'Bleed', bleedStacks, duration);
    },

    poisonArrowLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const blightChance = spellHelpers.getParam(spell, 'blightChance', levelIndex, 0.4);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < blightChance) {
                    applyConfiguredDebuff(battle, target, 'Blight', duration);
                }
            }
        });
    },

    suppressingFireLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
            }
        });
    },

    heavyStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Attack', duration);
            }
        });
    },

    intimidateLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', duration, caster);
        });
    },

    captainsStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster) => {
                const allies = battle.getParty(caster);
                allies.forEach(ally => {
                    if (ally.isAlive && ally !== caster) {
                        actionBarHelpers.grant(ally, actionBarGrant);
                    }
                });
                battle.log(`Captain's strike rallies the troops!`);
            }
        });
    },

    rallyThievesLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            battle.applyBuff(ally, 'Increase Speed', duration, {});
        });
    },

dirtyFightingLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Mark', 'Stun'];
    const debuffCount = spellHelpers.getParam(spell, 'debuffCount', levelIndex, 3);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    
    multiApplyHelpers.applyRandomDebuffs(battle, aliveEnemies, debuffTypes, debuffCount, duration, caster);
    battle.log(`Dirty fighting afflicts enemies with random debuffs!`);
},

    executeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const executeThreshold = spell.executeThreshold || 0.25;
        
        if (hpHelpers.isBelowThreshold(target, executeThreshold)) {
            target.currentHp = 0;
            battle.log(`${caster.name} executes ${target.name}!`);
        } else {
            spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
                scalingTypes: {attack: true, str: true},
                damageType: 'pure'
            });
        }
    },

    shadowStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Mark', duration);
            }
        });
    },

    smokeBombLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 3);
        const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Increase Speed', buffDuration, {});
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', debuffDuration);
        });
    },

lordsBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const buffStealCount = spell.buffStealCount || 1;
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            for (let i = 0; i < buffStealCount && buffDebuffHelpers.countBuffs(target) > 0; i++) {
                const stolenBuff = target.buffs.shift();
                caster.buffs = caster.buffs || [];
                caster.buffs.push(stolenBuff);
                battle.log(`${caster.name} steals ${stolenBuff.name}!`);
            }
        }
    });
},

    banditsGambitLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const enemies = battle.getEnemies(caster);
        const allies = battle.getParty(caster).filter(a => a && a.isAlive);
        
        stealAndRedistribute(
            battle,
            enemies,
            allies,
            (enemy) => buffDebuffHelpers.clearBuffs(enemy),
            (ally, buff) => {
                ally.buffs = ally.buffs || [];
                ally.buffs.push(buff);
            },
            `Bandit's gambit redistributes the wealth!`
        );
    },

plunderLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarSteal = spellHelpers.getParam(spell, 'actionBarSteal', levelIndex, 0.3);
    
    let totalStolenAmount = 0;
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        totalStolenAmount += actionBarHelpers.drain(enemy, actionBarSteal);
    });
    
    const allies = battle.getParty(caster);
    const aliveAllies = allies.filter(a => a && a.isAlive);
    if (aliveAllies.length > 0 && totalStolenAmount > 0) {
        const perAllyAmount = totalStolenAmount / aliveAllies.length;
        aliveAllies.forEach(ally => {
            ally.actionBar = Math.min(10000, ally.actionBar + perAllyAmount);
        });
    }
    
    battle.log(`Plunder steals action bar from all enemies!`);
},

    callToArmsLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 50);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
            battle.applyBuff(ally, 'Increase Defense', duration, {});
        });
    },

    // Gold Mine Spells
    wrenchTossLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
            }
        });
    },

    makeshift_shieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 40);
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    },

    grenadeLobLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const reducedDefenseBonus = conditionalDamageHelpers.ifDebuffed(
            target, 'Reduce Defense', spell.reducedDefenseBonus || 1.5, battle, 'Grenade explodes on weakened armor!'
        );
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            damageModifier: reducedDefenseBonus
        });
    },

    smokeScreenLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
        });
    },

    repairBotLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.15);
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 30);
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            const healAmount = hpHelpers.percentOfMaxHp(lowestHpAlly, healPercent);
            battle.healUnit(lowestHpAlly, healAmount);
            battle.applyBuff(lowestHpAlly, 'Shield', -1, { shieldAmount: shieldAmount });
        }
    },

    overclockLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            battle.applyBuff(ally, 'Increase Speed', duration, {});
        });
    },

    bombVestLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const selfDamagePercent = spell.selfDamagePercent || 0.2;
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster) => {
                const selfDamage = hpHelpers.drainHpPercent(caster, selfDamagePercent);
                battle.log(`${caster.name} takes ${selfDamage} explosive damage!`);
            }
        });
    },

    detonateLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
            applyConfiguredDebuff(battle, enemy, 'Stun', 1);
        });
    },

    shrapnelBlastLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Bleed', bleedDuration);
            }
        });
    },

    demolitionExpertPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.demolitionExpertPassive = true;
        passiveHelpers.addOnDamageTaken(caster, {
            type: 'aoe_retaliation',
            damagePercent: 0.3
        });
    },

    drillChargeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            damageOptions: { armorPierce: 0.5 }
        });
    },

    defenseShredderLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        const stackCount = spell.stackCount || 2;
        
        multiApplyHelpers.applyDebuffStacks(battle, target, 'Reduce Defense', stackCount, duration);
        applyConfiguredDebuff(battle, target, 'Mark', duration);
    },

    scrapCannonLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffBonus = spell.debuffBonus || 50;
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            getDamageModifier: (enemy) => {
                const baseDamage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
                const debuffCount = buffDebuffHelpers.countDebuffs(enemy);
                return (baseDamage + (debuffBonus * debuffCount)) / baseDamage;
            }
        });
    },

    reinforcedPlatingPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.reinforcedPlatingPassive = true;
    caster.globalDamageReduction = (caster.globalDamageReduction || 0) + (spell.damageReduction || 0.3);
    caster.shieldRegenPercent = spell.shieldRegenPercent || 0.1;
    caster.shieldRegenTurns = spell.shieldRegenTurns || 3;
},

    // Centaur Cliffs Spells
    arrowVolleyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const markDuration = spellHelpers.getParam(spell, 'markDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Mark', markDuration);
            }
        });
    },

    swiftGallopLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const actionBarGain = spellHelpers.getParam(spell, 'actionBarGain', levelIndex, 0.25);
    
    battle.applyBuff(caster, 'Increase Speed', duration, {});
    actionBarHelpers.grant(caster, actionBarGain, battle);
},

    hoofStompLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.25);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < stunChance) {
                    applyConfiguredDebuff(battle, target, 'Stun', 1);
                }
            }
        });
    },

    battleChargeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Taunt', 1, caster);
            }
        });
    },

    earthenBlessingLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healAmount = spellHelpers.getParam(spell, 'healAmount', levelIndex, 40);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.healUnit(ally, healAmount);
            battle.applyBuff(ally, 'Increase Defense', duration, {});
        });
    },

    ancestralVigorLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.03);
    
    battle.applyBuff(target, 'Increase Speed', duration, {});
    
    if (!target.ancestralVigorRegen) {
        target.ancestralVigorRegen = healPercent;
        target.ancestralVigorDuration = duration;
    }
},

    stampedeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const knockbackPercent = spellHelpers.getParam(spell, 'knockbackPercent', levelIndex, 0.3);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        perEnemyEffect: (battle, caster, enemy) => {
            actionBarHelpers.reduce(enemy, knockbackPercent);
        }
    });
},

    warStompLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
        });
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        });
    },

rallyingHornLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        actionBarHelpers.grant(ally, actionBarGrant, battle);
        battle.applyBuff(ally, 'Increase Speed', duration, {});
    });
},

tribalLeaderPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.tribalLeaderPassive = true;
    caster.auraBuffs = ['Increase Attack', 'Increase Defense'];
    caster.auraDuration = spell.auraDuration || 1;
},

hornGoreLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
    const bleedStacks = spellHelpers.getParam(spell, 'bleedStacks', levelIndex, 2);
    const armorPierce = spellHelpers.getParam(spell, 'armorPierce', levelIndex, 0.3);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageOptions: { armorPierce: armorPierce },
        afterDamage: () => {
            multiApplyHelpers.applyDebuffStacks(battle, target, 'Bleed', bleedStacks, bleedDuration);
        }
    });
},

bloodRageLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 3);
    
    for (let i = 0; i < stackCount; i++) {
        battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    }
},

    thunderousChargeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const actionBarPercent = caster.actionBar / 10000;
        const damageMultiplier = 1 + actionBarPercent;
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            damageModifier: damageMultiplier,
            afterDamage: () => {
                caster.actionBar = 0;
            }
        });
    },

savageMomentumPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.savageMomentumPassive = true;
    passiveHelpers.addDamageCalculation(caster, {
        type: 'missing_hp_damage',
        maxBonus: spell.maxBonus || 0.5
    });
},

    // Orc Warlands Spells
    brutalSwingLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

bloodlustLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const hpCost = spellHelpers.getParam(spell, 'hpCost', levelIndex, 0.1);
    
    const hpSacrifice = hpHelpers.drainHpPercent(caster, hpCost);
    battle.log(`${caster.name} sacrifices ${hpSacrifice} HP!`);
    
    battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
    battle.applyBuff(caster, 'Increase Speed', duration, {});
},

recklessAssaultLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const selfDebuffDuration = spellHelpers.getParam(spell, 'selfDebuffDuration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster) => {
            applyConfiguredDebuff(battle, caster, 'Reduce Defense', selfDebuffDuration);
        }
    });
},

furyStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hitCount = spellHelpers.getParam(spell, 'hitCount', levelIndex, 3);
    
    for (let i = 0; i < hitCount; i++) {
        if (target.isAlive) {
            spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
                scalingTypes: {attack: true, str: true},
                damageType: 'physical'
            });
        }
    }
},

    lightningBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical'
        });
    },

    bloodlustTotemLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            applyConfiguredDebuff(battle, ally, 'Bleed', 1);
        });
    },

executeSwingLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const executeThreshold = spellHelpers.getParam(spell, 'executeThreshold', levelIndex, 0.35);
    const multiplier = conditionalDamageHelpers.ifBelowHp(
        target, executeThreshold, 3, battle, 'Execute swing devastates the wounded target!'
    );
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageModifier: multiplier
    });
},

    intimidatingShoutLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
        });
    },

    commandPresenceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 60);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(caster, 'Increase Defense', duration, {});
        
        const enemies = battle.getEnemies(caster);
        const aliveEnemies = enemies.filter(e => e && e.isAlive);
        if (aliveEnemies.length > 0) {
            aliveEnemies.sort((a, b) => b.source.attack - a.source.attack);
            applyConfiguredDebuff(battle, aliveEnemies[0], 'Taunt', duration, caster);
        }
    },

warmasterPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.warmasterPassive = true;
    caster.warmasterAttackBonus = spell.attackBonus || 0.25;
},

bladeFlurryLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const critChance = spellHelpers.getParam(spell, 'critChance', levelIndex, 0.3);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        getDamageModifier: () => {
            const isCrit = Math.random() < critChance;
            if (isCrit) {
                battle.log(`Critical blade strike!`);
            }
            return isCrit ? 2 : 1;
        }
    });
},

mirrorImageLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const dodgePhysical = spellHelpers.getParam(spell, 'dodgePhysical', levelIndex, 0.5);
    
    buffDebuffHelpers.clearDebuffs(caster);
    battle.applyBuff(caster, 'Increase Speed', duration, {});
    
    if (!caster.mirrorImageDodge) {
        caster.mirrorImageDodge = true;
        caster.dodgePhysical = (caster.dodgePhysical || 0) + dodgePhysical;
        caster.mirrorImageDuration = duration;
    }
},

    windWalkLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical'
        });
        
        for (let i = 0; i < 2; i++) {
            battle.applyBuff(caster, 'Increase Speed', duration, {});
        }
    },

bladeMasteryPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.bladeMasteryPassive = true;
    caster.bladeMasteryExtraAttackChance = spell.extraAttackChance || 0.3;
},

    // Snapdragon Swamp Spells
    venomSpitLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const blightChance = spellHelpers.getParam(spell, 'blightChance', levelIndex, 0.5);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < blightChance) {
                    applyConfiguredDebuff(battle, target, 'Blight', duration);
                }
            }
        });
    },

    toxicSporesLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Blight', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
        });
    },

regenerativeRootsPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.regenerativeRootsPassive = true;
    caster.regenHealPercent = spellHelpers.getParam(spell, 'healPercent', spellLevel - 1, 0.03);
    caster.regenHpThreshold = spellHelpers.getParam(spell, 'hpThreshold', spellLevel - 1, 0.5);
},

brutalClubLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const markBonus = spellHelpers.getParam(spell, 'markBonus', levelIndex, 1.5);
    const damageModifier = conditionalDamageHelpers.ifDebuffed(
        target, 'Mark', markBonus, battle, 'Brutal club crushes the marked target!'
    );
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageModifier: damageModifier
    });
},

    intimidatingRoarLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
            applyConfiguredDebuff(battle, enemy, 'Taunt', duration, caster);
        });
    },

    thickSkullLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 50);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(caster, 'Increase Defense', duration, {});
    },

    hexBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const silenceChance = spellHelpers.getParam(spell, 'silenceChance', levelIndex, 0.3);
        const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < silenceChance) {
                    applyConfiguredDebuff(battle, target, 'Silence', silenceDuration);
                }
            }
        });
    },

    swampCurseLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        applyConfiguredDebuff(battle, target, 'Mark', duration);
        applyConfiguredDebuff(battle, target, 'Blight', duration);
        applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
    },

    darkRitualSwampLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healAmount = spellHelpers.getParam(spell, 'healAmount', levelIndex, 40);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            battle.healUnit(lowestHpAlly, healAmount);
            battle.applyBuff(lowestHpAlly, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        }
    },

ambushStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffThreshold = spellHelpers.getParam(spell, 'debuffThreshold', levelIndex, 3);
    const damageType = buffDebuffHelpers.countDebuffs(target) >= debuffThreshold ? 'pure' : 'physical';
    
    if (damageType === 'pure') {
        battle.log(`Ambush strike finds all weaknesses!`);
    }
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: damageType
    });
},

    murkyDisappearanceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        buffDebuffHelpers.clearDebuffs(caster);
        battle.log(`${caster.name} disappears into the murk!`);
        
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    stalkersMarkPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.stalkersMarkPassive = true;
        caster.markDuration = spell.markDuration || 1;
    },

    crushingTendrilsLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.3);
        const stunDuration = spell.stunDuration || 1;
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < stunChance) {
                    applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                }
            }
        });
    },

    bogArmorLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 80);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(caster, 'Frost Armor', duration, {});
    },

    swampsEmbraceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 3);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
            applyConfiguredDebuff(battle, enemy, 'Bleed', bleedDuration);
        });
    },

    naturesVengeancePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.naturesVengeancePassive = true;
        caster.naturesVengeanceChance = spell.procChance || 0.3;
        caster.naturesVengeanceDuration = spell.duration || 2;
    },

    rendingTalonsLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        if (buffDebuffHelpers.removeBuff(target, 'Shield')) {
            battle.log(`${target.name}'s shield was shredded!`);
        }
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Bleed', duration);
            }
        });
    },

    wisdomsCallLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            battle.applyBuff(ally, 'Increase Speed', duration, {});
        });
    },

    moonlitBarrierLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 60);
        const targetCount = spell.targetCount || 3;
        
        const allies = battle.getParty(caster);
        const aliveAllies = allies.filter(a => a && a.isAlive);
        
        if (aliveAllies.length > 0) {
            aliveAllies.sort((a, b) => hpHelpers.hpPercent(a) - hpHelpers.hpPercent(b));
            
            const targetsToShield = Math.min(targetCount, aliveAllies.length);
            for (let i = 0; i < targetsToShield; i++) {
                battle.applyBuff(aliveAllies[i], 'Shield', -1, { shieldAmount: shieldAmount });
            }
        }
    },

    ancientKnowledgeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const enemies = battle.getEnemies(caster);
        const allies = battle.getParty(caster).filter(a => a && a.isAlive);
        
        stealAndRedistribute(
            battle,
            enemies,
            allies,
            (enemy) => buffDebuffHelpers.clearBuffs(enemy, ['Boss']),
            (ally, buff) => {
                ally.buffs = ally.buffs || [];
                ally.buffs.push(buff);
            },
            `${caster.name} steals enemy knowledge and shares it with allies!`
        );
    },

    // Lizardman Volcano Spells
    scaleSlashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Bleed', duration);
            }
        });
    },

    battleFrenzyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        battle.applyBuff(caster, 'Increase Speed', duration, {});
        applyConfiguredDebuff(battle, caster, 'Reduce Defense', debuffDuration);
    },

    warriorsChallengeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        applyConfiguredDebuff(battle, target, 'Taunt', duration, caster);
        applyConfiguredDebuff(battle, target, 'Mark', duration);
    },

    spiritFlameLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const healPercent = spell.healPercent || 0.3;
        
        const damage = spellHelpers.calculateDamage(spell, spellLevel - 1, caster, {attack: true, int: true});
        const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            const healAmount = damageDealt * healPercent;
            battle.healUnit(lowestHpAlly, healAmount);
        }
    },

    ancestralWardLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 40);
        const immuneDuration = spell.immuneDuration || 1;
        
        battle.applyBuff(target, 'Shield', -1, { shieldAmount: shieldAmount });
        battle.applyBuff(target, 'Immune', immuneDuration, { immunity: true });
    },

    tribalChantLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const regenPercent = spellHelpers.getParam(spell, 'regenPercent', levelIndex, 0.03);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            if (buffDebuffHelpers.removeFirstDebuff(ally)) {
                battle.log(`Cleansed a debuff from ${ally.name}!`);
            }
            
            ally.tribalChantRegen = regenPercent;
            ally.tribalChantDuration = duration;
            battle.log(`${ally.name} begins regenerating ${Math.floor(regenPercent * 100)}% HP per turn!`);
        });
    },

    precisionShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const armorPierce = spell.armorPierce || 0.25;
        const actionBarDrain = spell.actionBarDrain || 0.1;
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            damageOptions: { armorPierce: armorPierce },
            afterDamage: () => {
                actionBarHelpers.drain(target, actionBarDrain, battle);
            }
        });
    },

    huntersFocusLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.huntersFocusActive = true;
        battle.log(`${caster.name} focuses for a devastating shot!`);
    },

    predatorsInstinctPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.predatorsInstinctPassive = true;
        caster.predatorsDamageBonus = spell.damageBonus || 1.5;
        caster.predatorsHpThreshold = spell.hpThreshold || 0.3;
    },

    moltenStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
            }
        });
    },

    lavaShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const maxPercent = spellHelpers.getParam(spell, 'maxPercent', levelIndex, 0.3);
        
        const missingHp = hpHelpers.missingHp(caster);
        const shieldAmount = Math.min(missingHp, hpHelpers.percentOfMaxHp(caster, maxPercent));
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    },

burningAuraPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.burningAuraPassive = true;
    const levelIndex = spellLevel - 1;
    caster.burningAuraRetaliationDamage = spellHelpers.getParam(spell, 'retaliationDamage', levelIndex, 50);
    caster.burningAuraProcChance = spellHelpers.getParam(spell, 'procChance', levelIndex, 0.3);
    caster.burningAuraDebuffDuration = spell.debuffDuration || 1;
},

    warchiefsBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    },

    rallyTheTribeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        const actionBarGrant = spell.actionBarGrant || 0.3;
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Defense', duration, {});
            actionBarHelpers.grant(ally, actionBarGrant);
        });
    },

    featheredFuryLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const hitCount = spell.hitCount || 3;
        const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Blight', 'Mark'];
        
        for (let i = 0; i < hitCount; i++) {
            if (target.isAlive) {
                spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
                    scalingTypes: {attack: true, str: true},
                    damageType: 'physical',
                    afterDamage: () => {
                        const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
                        applyConfiguredDebuff(battle, target, randomDebuff, 2);
                    }
                });
            }
        }
    },

    commandersPresencePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.commandersPresencePassive = true;
        caster.commandersAttackBonus = spell.attackBonus || 0.1;
    },

trickStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const buffStealCount = spell.buffStealCount || 2;
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            // Use helpers to count and validate
            const availableBuffs = buffDebuffHelpers.getBuffs(target).filter(b => b.name !== 'Boss');
            const stealCount = Math.min(buffStealCount, availableBuffs.length);
            
            for (let i = 0; i < stealCount; i++) {
                // Find and remove first non-Boss buff
                const buffIndex = target.buffs.findIndex(b => b.name !== 'Boss');
                if (buffIndex !== -1) {
                    const stolenBuff = target.buffs.splice(buffIndex, 1)[0];
                    caster.buffs = caster.buffs || [];
                    caster.buffs.push(stolenBuff);
                    battle.log(`${caster.name} steals ${stolenBuff.name}!`);
                }
            }
        }
    });
},

smokeAndMirrorsLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const dodgePhysical = spell.dodgePhysical || 0.5;
    const dodgeMagical = spell.dodgeMagical || 0.5;
    const speedStacks = spell.speedStacks || 2;
    
    // Only apply dodge if not already active
    if (!caster.smokeAndMirrorsDodge) {
        caster.smokeAndMirrorsDodge = true;
        caster.dodgePhysical = (caster.dodgePhysical || 0) + dodgePhysical;
        caster.dodgeMagical = (caster.dodgeMagical || 0) + dodgeMagical;
        caster.smokeAndMirrorsDuration = duration;
    } else {
        // Refresh duration if already active
        caster.smokeAndMirrorsDuration = duration;
    }
    
    for (let i = 0; i < speedStacks; i++) {
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    }
},

chaosToxinLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffCount = spellHelpers.getParam(spell, 'debuffCount', levelIndex, 3);
    const targetCount = spellHelpers.getParam(spell, 'targetCount', levelIndex, 3);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Blight', 'Mark', 'Stun', 'Silence'];
    
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    
    if (aliveEnemies.length === 0) {
        battle.log(`No enemies to afflict with chaos toxin!`);
        return;
    }
    
    // Select up to targetCount unique enemies
    const selectedEnemies = [];
    const enemiesCopy = [...aliveEnemies];
    
    const actualTargetCount = Math.min(targetCount, enemiesCopy.length);
    for (let i = 0; i < actualTargetCount; i++) {
        const randomIndex = Math.floor(Math.random() * enemiesCopy.length);
        selectedEnemies.push(enemiesCopy.splice(randomIndex, 1)[0]);
    }
    
    // Apply debuffCount debuffs to each selected enemy
    selectedEnemies.forEach(enemy => {
        // Create a separate array for this enemy to ensure they get exactly debuffCount debuffs
        multiApplyHelpers.applyRandomDebuffs(battle, [enemy], debuffTypes, debuffCount, duration, caster);
    });
    
    battle.log(`Chaos toxin afflicts ${selectedEnemies.length} enemies with random debuffs!`);
},

masterOfDeceptionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    
    multiApplyHelpers.convertBuffsToDebuffs(battle, target, caster);
    battle.log(`${caster.name} twists ${target.name}'s buffs into debuffs!`);
},

    // Puzzle Sanctuary Spells
    frostStrikeRevenantLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
            }
        });
    },

icyGraspLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
    
    applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
    actionBarHelpers.drain(target, actionBarDrain, battle);
    battle.log(`${target.name} is frozen in place!`);
},

frozenSoulPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const magicResist = spellHelpers.getParam(spell, 'magicResist', levelIndex, 0.2);
    
    caster.frozenSoulPassive = true;
    caster.immuneToReduceSpeed = true;
    caster.magicDamageReduction = (caster.magicDamageReduction || 0) + magicResist;
},

chillTouchLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const frostArmorDuration = spellHelpers.getParam(spell, 'frostArmorDuration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
            if (lowestHpAlly) {
                battle.applyBuff(lowestHpAlly, 'Frost Armor', frostArmorDuration, {});
            }
        }
    });
},

    spectralWailLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Silence', duration);
        });
    },

phaseWalkLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.5);
    
    buffDebuffHelpers.clearDebuffs(target);
    battle.log(`${target.name} phases through reality!`);
    
    actionBarHelpers.grant(target, actionBarGrant, battle);
},

    stoneSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
            }
        });
    },

    crystallineShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 100);
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
        });
    },

shatterPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.shatterPassive = true;
    caster.shatterDamage = spellHelpers.getParam(spell, 'aoeDamage', levelIndex, 200);
    caster.shatterSlowDuration = spellHelpers.getParam(spell, 'slowDuration', levelIndex, 2);
},

soulDrainLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.5);
    
    const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
    
    const healAmount = damageDealt * healPercent;
    battle.healUnit(caster, healAmount);
},

    wraithFormLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
        
        battle.applyBuff(caster, 'Immune', duration, { immunity: true });
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

lifeTapLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpCost = spellHelpers.getParam(spell, 'hpCost', levelIndex, 0.2);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    const hpSacrifice = hpHelpers.drainHpPercent(caster, hpCost);
    battle.log(`${caster.name} sacrifices ${hpSacrifice} HP!`);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
    });
},

    tombStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Mark', duration);
                applyConfiguredDebuff(battle, target, 'Blight', duration);
            }
        });
    },

    eternalGuardLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 50);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
        });
        
        battle.applyBuff(caster, 'Increase Defense', duration, {});
    },

    deathsDoorLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const missingHpPercent = spellHelpers.getParam(spell, 'missingHpPercent', levelIndex, 0.3);
        const baseDamage = spellHelpers.getParam(spell, 'baseDamage', levelIndex, 100);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            const missingHp = hpHelpers.missingHp(enemy);
            const damage = baseDamage + (missingHp * missingHpPercent);
            battle.dealDamage(caster, enemy, damage, 'magical');
        });
    },

undyingWillPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.undyingWillPassive = true;
    caster.undyingWillHealPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.3);
},

    frozenSoulBlastLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
                applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
            }
        });
    },

lichsPhylacteryLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.5);
    
    let totalBuffsStolen = 0;
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const stolen = buffDebuffHelpers.clearBuffs(enemy);
        if (stolen.length > 0) {
            caster.buffs = caster.buffs || [];
            caster.buffs.push(...stolen);
            totalBuffsStolen += stolen.length;
        }
    });
    
    if (totalBuffsStolen > 0) {
        battle.log(`${caster.name} steals ${totalBuffsStolen} buffs!`);
    }
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
},

deathAndDecayLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Blight', duration);
        applyConfiguredDebuff(battle, enemy, 'Bleed', duration);
        actionBarHelpers.drain(enemy, actionBarDrain, battle);
    });
    
    battle.log(`Death and decay spreads across the battlefield!`);
},

eternalWinterLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpDrainPercent = spellHelpers.getParam(spell, 'hpDrainPercent', levelIndex, 0.1);
    let totalDrained = 0;
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const drained = hpHelpers.drainHpPercent(enemy, hpDrainPercent);
        totalDrained += drained;
        battle.log(`${enemy.name} loses ${drained} HP to eternal winter!`);
    });
    
    const aliveAllies = [];
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        aliveAllies.push(ally);
    });
    
    if (aliveAllies.length > 0 && totalDrained > 0) {
        const shieldPerAlly = Math.floor(totalDrained / aliveAllies.length);
        aliveAllies.forEach(ally => {
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldPerAlly });
        });
        battle.log(`Allies gain ${shieldPerAlly} shield from the stolen life force!`);
    }
},
    
    // Bloodleaf Depths Spells
    huntersShotLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.05);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                actionBarHelpers.drain(target, actionBarDrain, battle);
            }
        });
    },

    trackPreyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const markDuration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const speedDuration = spellHelpers.getParam(spell, 'speedDuration', levelIndex, 2);
        
        applyConfiguredDebuff(battle, target, 'Mark', markDuration);
        battle.applyBuff(caster, 'Increase Speed', speedDuration, {});
    },

swiftArrowLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.1);
    
    // Store reference for closure
    const grantAmount = actionBarGrant;
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster) => {
            const allies = battle.getParty(caster);
            const aliveAllies = allies.filter(a => a && a.isAlive && a !== caster);
            if (aliveAllies.length > 0) {
                const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                actionBarHelpers.grant(randomAlly, grantAmount, battle);
            }
        }
    });
},

    elvenVolleyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical'
        });
    },

    elvenSwiftnessLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    lupineStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.4);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (Math.random() < bleedChance) {
                    applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
                }
            }
        });
    },

    packHowlLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.15);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            actionBarHelpers.grant(ally, actionBarGrant, battle);
            battle.applyBuff(ally, 'Increase Speed', duration, {});
        });
    },

alphasCallPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.alphasCallPassive = true;
    caster.alphasCallBuffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
},

    shadowStrikeElfLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarSteal = spellHelpers.getParam(spell, 'actionBarSteal', levelIndex, 0.1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical',
            afterDamage: () => {
                actionBarHelpers.steal(target, caster, actionBarSteal, battle);
            }
        });
    },

    smokeScreenElfLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        buffDebuffHelpers.clearDebuffs(caster);
        battle.log(`${caster.name} removes all debuffs!`);
        
        applyConfiguredDebuff(battle, target, 'Reduce Attack', duration);
    },

    vanishLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        battle.applyBuff(caster, 'Frost Armor', duration, {});
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    },

    dancingBladesLogic: function(battle, caster, target, spell, spellLevel = 1) {
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: 'physical'
        });
    },

    whirlingStepLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 2);
        
        for (let i = 0; i < stackCount; i++) {
            battle.applyBuff(caster, 'Increase Speed', duration, {});
        }
        
        caster.nextAttackHitsTwice = true;
        battle.log(`${caster.name}'s next attack will hit twice!`);
    },

    evasiveManeuversLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            actionBarHelpers.grant(ally, actionBarGrant, battle);
            if (buffDebuffHelpers.removeFirstDebuff(ally)) {
                battle.log(`Removed a debuff from ${ally.name}!`);
            }
        });
    },

bladeDancerPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    passiveHelpers.addDamageCalculation(caster, {
        type: 'blade_mastery',
        damageBonus: spell.damageBonus || 1.5
    });
},

    royalCommandLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarThreshold = spellHelpers.getParam(spell, 'actionBarThreshold', levelIndex, 0.5);
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'physical',
            afterDamage: (battle, caster, target) => {
                if (target.actionBar < (10000 * actionBarThreshold)) {
                    applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                    battle.log(`${target.name} is stunned by royal command!`);
                }
            }
        });
    },

    forestsGraceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.3);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
            battle.applyBuff(ally, 'Increase Speed', duration, {});
            actionBarHelpers.grant(ally, actionBarGrant, battle);
        });
    },

    naturesWrathLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarPerBuff = spellHelpers.getParam(spell, 'actionBarPerBuff', levelIndex, 0.1);
        let totalBuffsRemoved = 0;
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            const buffCount = buffDebuffHelpers.countBuffs(enemy);
            buffDebuffHelpers.clearBuffs(enemy);
            totalBuffsRemoved += buffCount;
        });
        
        if (totalBuffsRemoved > 0) {
            const totalActionBar = actionBarPerBuff * totalBuffsRemoved;
            spellHelpers.forEachAliveAlly(battle, caster, ally => {
                actionBarHelpers.grant(ally, totalActionBar, battle);
            });
            battle.log(`Removed ${totalBuffsRemoved} buffs, granting allies action bar!`);
        }
    },

    sovereignsPresencePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.sovereignsPresencePassive = true;
        const levelIndex = spellLevel - 1;
        caster.sovereignBuffDuration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
},

    // Naga Ruins Spells
    scaleBashLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
            }
        });
    },

    coiledDefenseLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.3);
        const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
        
        const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
        });
    },

    serpentsResolveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.1);
        
        battle.applyBuff(caster, 'Increase Defense', duration, {});
        
        const healAmount = hpHelpers.percentOfMaxHp(caster, healPercent);
        battle.healUnit(caster, healAmount);
    },

    tidalWaveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.15);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                actionBarHelpers.drain(target, actionBarDrain, battle);
            }
        });
    },

    oceansBlessingLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.4);
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            const shieldAmount = hpHelpers.percentOfMaxHp(lowestHpAlly, shieldPercent);
            battle.applyBuff(lowestHpAlly, 'Shield', -1, { shieldAmount: shieldAmount });
        }
    },

    ebbAndFlowLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.05);
        const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.05);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            const healAmount = hpHelpers.percentOfMaxHp(ally, healPercent);
            battle.healUnit(ally, healAmount);
            
            const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
        });
    },

    constrictLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
            }
        });
    },

    petrifyingGazeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.5);
        const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
        
        if (Math.random() < stunChance) {
            applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
            battle.log(`${target.name} is petrified!`);
        } else {
            battle.log(`${target.name} resists petrification!`);
        }
    },

    serpentsCoilLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarSteal = spellHelpers.getParam(spell, 'actionBarSteal', levelIndex, 0.3);
        
        actionBarHelpers.steal(target, caster, actionBarSteal, battle);
    },

    sirensSongLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Silence', silenceDuration);
            }
        });
    },

    mesmerizeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            actionBarHelpers.drain(enemy, actionBarDrain, battle);
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
        });
    },

    enchantingVoiceLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const stolenBuffs = buffDebuffHelpers.clearBuffs(target);
        if (stolenBuffs.length > 0) {
            caster.buffs = caster.buffs || [];
            caster.buffs.push(...stolenBuffs);
            battle.log(`${caster.name} steals all buffs from ${target.name}!`);
        }
    },

    tridentStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const armorPierce = spellHelpers.getParam(spell, 'armorPierce', levelIndex, 0.3);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            damageOptions: { armorPierce: armorPierce }
        });
    },

    seaLordsProtectionLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.25);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
            battle.applyBuff(ally, 'Increase Defense', duration, {});
        });
    },

    tidalSurgeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.5);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            enemy.actionBar = 0;
        });
        battle.log(`Tidal surge resets all enemy action bars!`);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            actionBarHelpers.grant(ally, actionBarGrant, battle);
        });
    },

    oceanicResiliencePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.oceanicResiliencePassive = true;
        caster.oceanicResilienceBuffDuration = spell.buffDuration || 2;
    },

    serpentsWrathLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Mark', duration);
                applyConfiguredDebuff(battle, target, 'Blight', duration);
            }
        });
    },

imperialCommandLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffCount = spellHelpers.getParam(spell, 'debuffCount', levelIndex, 3);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Blight', 'Mark'];
    
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    
    multiApplyHelpers.applyRandomDebuffs(battle, aliveEnemies, debuffTypes, debuffCount * aliveEnemies.length, duration, caster);
},

    abyssalShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.5);
        const immuneDuration = spellHelpers.getParam(spell, 'immuneDuration', levelIndex, 1);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
            battle.applyBuff(ally, 'Immune', immuneDuration, { immunity: true });
        });
    },

    eternalTidePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.eternalTidePassive = true;
        caster.eternalTideShieldPercent = spell.shieldPercent || 0.2;
    },

    // Forgotten Sewers Spells
    infectedStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Blight', duration);
                applyConfiguredDebuff(battle, target, 'Bleed', duration);
            }
        });
    },

    spreadDiseaseLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffThreshold = spellHelpers.getParam(spell, 'debuffThreshold', levelIndex, 2);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        if (buffDebuffHelpers.countDebuffs(target) >= debuffThreshold) {
            spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
                applyConfiguredDebuff(battle, enemy, 'Blight', duration);
            });
            battle.log(`Disease spreads to all enemies!`);
        }
    },

    toxicBloodPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.toxicBloodPassive = true;
        caster.toxicBloodChance = spell.procChance || 0.3;
        caster.toxicBloodDuration = spell.blightDuration || 2;
    },

    corrosiveTouchLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            afterDamage: () => {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
            }
        });
    },

    noxiousPoolLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
        });
    },

    acidicBodyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 80);
        
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
        caster.acidicBodyReflect = spell.reflectPercent || 0.2;
        battle.log(`${caster.name} gains acidic shield!`);
    },

    vialTossLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const debuffTypes = ['Blight', 'Bleed', 'Reduce Defense'];
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            afterDamage: () => {
                const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
                applyConfiguredDebuff(battle, target, randomDebuff, duration);
            }
        });
    },

mutationLogic: function(battle, caster, target, spell, spellLevel = 1) {
    multiApplyHelpers.convertBuffsToDebuffs(battle, target, caster);
    battle.log(`${target.name}'s buffs mutated into debuffs!`);
},

    toxicRemedyLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.2);
        const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
        
        const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
        if (lowestHpAlly) {
            const healAmount = hpHelpers.percentOfMaxHp(lowestHpAlly, healPercent);
            battle.healUnit(lowestHpAlly, healAmount);
            applyConfiguredDebuff(battle, lowestHpAlly, 'Bleed', bleedDuration);
            battle.log(`${lowestHpAlly.name} healed but poisoned!`);
        }
    },

    ambushLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffThreshold = spellHelpers.getParam(spell, 'debuffThreshold', levelIndex, 3);
        
        const debuffCount = buffDebuffHelpers.countDebuffs(target);
        const damageType = debuffCount >= debuffThreshold ? 'pure' : 'physical';
        
        if (damageType === 'pure') {
            battle.log(`Perfect ambush on weakened target!`);
        }
        
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, agi: true},
            damageType: damageType
        });
    },

    festeringWoundLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const bleedStacks = spellHelpers.getParam(spell, 'bleedStacks', levelIndex, 3);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
        
        multiApplyHelpers.applyDebuffStacks(battle, target, 'Bleed', bleedStacks, duration);
    },

    fromTheShadowsLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.3);
        
        buffDebuffHelpers.clearDebuffs(caster);
        battle.applyBuff(caster, 'Increase Speed', duration, {});
        actionBarHelpers.grant(caster, actionBarGrant, battle);
    },

    putridSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical',
            perEnemyEffect: (battle, caster, enemy) => {
                applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
            }
        });
    },

    toxicExplosionLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const hpCost = spellHelpers.getParam(spell, 'hpCost', levelIndex, 0.2);
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        
        const hpSacrifice = hpHelpers.drainHpPercent(caster, hpCost);
        battle.log(`${caster.name} sacrifices ${hpSacrifice} HP!`);
        
        spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
            applyConfiguredDebuff(battle, enemy, 'Blight', duration);
            applyConfiguredDebuff(battle, enemy, 'Bleed', duration);
        });
    },

    regenerateLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.15);
        const maxShieldPercent = spellHelpers.getParam(spell, 'maxShieldPercent', levelIndex, 0.4);
        
        const healAmount = hpHelpers.percentOfMaxHp(caster, healPercent);
        battle.healUnit(caster, healAmount);
        
        const missingHp = hpHelpers.missingHp(caster);
        const shieldAmount = Math.min(missingHp, hpHelpers.percentOfMaxHp(caster, maxShieldPercent));
        battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    },

    rottingPresencePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.rottingPresencePassive = true;
        caster.rottingPresenceBlightDuration = spell.blightDuration || 1;
    },

    epidemicLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const debuffBonus = spellHelpers.getParam(spell, 'debuffBonus', levelIndex, 0.2);
        
        spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
            scalingTypes: {attack: true, int: true},
            damageType: 'magical',
            getDamageModifier: (enemy) => {
                const debuffCount = buffDebuffHelpers.countDebuffs(enemy);
                return 1 + (debuffBonus * debuffCount);
            }
        });
    },

    quarantineLogic: function(battle, caster, target, spell, spellLevel = 1) {
        const levelIndex = spellLevel - 1;
        const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
        const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.5);
        
        applyConfiguredDebuff(battle, target, 'Mark', duration);
        applyConfiguredDebuff(battle, target, 'Silence', duration);
        actionBarHelpers.drain(target, actionBarDrain, battle);
    },

blackDeathLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const blightDuration = spellHelpers.getParam(spell, 'blightDuration', levelIndex, 3);
    const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
    
    // Apply Blight to all enemies
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Blight', blightDuration);
    });
    
    // Cleanse Blight from allies and give them Increase Attack
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        // Check if ally has Blight and remove it
        if (buffDebuffHelpers.hasDebuff(ally, 'Blight')) {
            buffDebuffHelpers.removeDebuff(ally, 'Blight');
            
            // Apply Increase Attack
            battle.applyBuff(ally, 'Increase Attack', buffDuration, { damageMultiplier: 1.5 });
            battle.log(`${ally.name} converted Blight to power!`);
        }
    });
},

    patientZeroPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
        caster.patientZeroPassive = true;
        caster.patientZeroHealPercent = spell.healPercent || 0.05;
        caster.immuneToDebuffs = caster.immuneToDebuffs || [];
        caster.immuneToDebuffs.push('Blight', 'Bleed');
    },

deathsDomainPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.deathsDomainPassive = true;
    caster.deathsDomainShieldPercent = spell.shieldPercent || 0.2;
    caster.deathsDomainSpeedDuration = spell.speedDuration || 2;
},

// Demon Spells
hellfireBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const defenseChance = spellHelpers.getParam(spell, 'defenseChance', levelIndex, 0.3);
    const defenseDebuffDuration = spellHelpers.getParam(spell, 'defenseDebuffDuration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: (battle, caster, target) => {
            if (Math.random() < defenseChance) {
                applyConfiguredDebuff(battle, target, 'Reduce Defense', defenseDebuffDuration);
            }
        }
    });
},

tormentLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Mark', duration);
    applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
},

demonicGiggleLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.1);
    const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 2);
    
    // Grant 10% action bar to all enemies
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        actionBarHelpers.grant(enemy, actionBarGrant, battle);
    });
    
    // Apply random debuff to random enemy
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    if (aliveEnemies.length > 0) {
        const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Blight', 'Mark'];
        const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
        applyConfiguredDebuff(battle, randomEnemy, randomDebuff, debuffDuration);
        battle.log(`${caster.name}'s demonic giggle confuses ${randomEnemy.name}!`);
    }
},

infernalBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.4);
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            if (Math.random() < bleedChance) {
                applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
            }
        }
    });
},

hellishVigorLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.25);
    
    battle.applyBuff(caster, 'Increase Defense', duration, {});
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
},

damnedChargeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
    const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
    });
    
    battle.applyBuff(caster, 'Increase Attack', buffDuration, { damageMultiplier: 1.5 });
},

drainingKissLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.3);
    
    const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
    
    const healAmount = damageDealt * healPercent;
    battle.healUnit(caster, healAmount);
},

charmLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 2);
    const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Taunt', tauntDuration, caster);
    applyConfiguredDebuff(battle, target, 'Reduce Attack', debuffDuration);
},

infernalTempoLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarSteal = spellHelpers.getParam(spell, 'actionBarSteal', levelIndex, 0.2);
    
    let totalStolen = 0;
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const stolen = actionBarHelpers.drain(enemy, actionBarSteal);
        totalStolen += stolen;
    });
    
    const allies = battle.getParty(caster);
    const aliveAllies = allies.filter(a => a && a.isAlive);
    if (aliveAllies.length > 0 && totalStolen > 0) {
        const perAllyAmount = totalStolen / aliveAllies.length;
        aliveAllies.forEach(ally => {
            ally.actionBar = Math.min(10000, ally.actionBar + perAllyAmount);
        });
        battle.log(`${caster.name} redistributes stolen action bar to allies!`);
    }
},

hellsImpactLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const reducedDefenseBonus = spellHelpers.getParam(spell, 'reducedDefenseBonus', levelIndex, 1.5);
    const hasReduceDefense = buffDebuffHelpers.hasDebuff(target, 'Reduce Defense');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageModifier: hasReduceDefense ? reducedDefenseBonus : 1
    });
    
    if (hasReduceDefense) {
        battle.log(`Crushing blow exploits weakened defenses!`);
    }
},

hellfireAuraPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.hellfireAuraPassive = true;
    caster.hellfireRetaliationDamage = spellHelpers.getParam(spell, 'retaliationDamage', levelIndex, 50);
    caster.hellfireSlowDuration = spellHelpers.getParam(spell, 'slowDuration', levelIndex, 1);
},

demonsWrathLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const randomTargets = spellHelpers.getParam(spell, 'randomTargets', levelIndex, 2);
    
    // Heavy physical damage to main target
    const physicalDamage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, str: true});
    battle.dealDamage(caster, target, physicalDamage, 'physical');
    
    // Magical damage to random enemies
    const magicalDamage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive && e !== target);
    
    for (let i = 0; i < randomTargets && aliveEnemies.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * aliveEnemies.length);
        const randomEnemy = aliveEnemies.splice(randomIndex, 1)[0];
        battle.dealDamage(caster, randomEnemy, magicalDamage, 'magical');
    }
},

summonHellfireLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const blightDuration = spellHelpers.getParam(spell, 'blightDuration', levelIndex, 3);
    const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Blight', blightDuration);
    });
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Increase Attack', buffDuration, { damageMultiplier: 1.5 });
    });
},

infernalCommandLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.3);
    
    // Reset all enemy action bars to 0
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        enemy.actionBar = 0;
    });
    battle.log(`${caster.name} resets all enemy action bars!`);
    
    // Grant action bar to all allies
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        actionBarHelpers.grant(ally, actionBarGrant, battle);
    });
},

lordsPresencePassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.lordsPresencePassive = true;
    caster.lordsPresenceBuffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 1);
},

soulReaperLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const executeThreshold = spellHelpers.getParam(spell, 'executeThreshold', levelIndex, 0.3);
    
    if (hpHelpers.isBelowThreshold(target, executeThreshold)) {
        // Pure damage execution
        const damage = target.currentHp;
        battle.dealDamage(caster, target, damage, 'pure');
        battle.log(`Soul reaper executes the weakened target!`);
    } else {
        // Heavy physical damage
        spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
            scalingTypes: {attack: true, str: true},
            damageType: 'physical'
        });
    }
},

underworldGatesLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Mark', duration);
        applyConfiguredDebuff(battle, enemy, 'Blight', duration);
        actionBarHelpers.drain(enemy, actionBarDrain, battle);
    });
},

eternalTormentLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        multiApplyHelpers.applyDebuffStacks(battle, enemy, 'Bleed', stackCount, duration);
        multiApplyHelpers.applyDebuffStacks(battle, enemy, 'Blight', stackCount, duration);
        multiApplyHelpers.applyDebuffStacks(battle, enemy, 'Reduce Defense', stackCount, duration);
    });
},

deathsDomainPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.deathsDomainPassive = true;
    caster.deathsDomainShieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.2);
    caster.deathsDomainSpeedDuration = spellHelpers.getParam(spell, 'speedDuration', levelIndex, 2);
},

psychicLashLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            actionBarHelpers.drain(target, actionBarDrain, battle);
        }
    });
},

mindFogLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Silence', duration);
    applyConfiguredDebuff(battle, target, 'Reduce Attack', duration);
},

telepathicSurgeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const speedDuration = spellHelpers.getParam(spell, 'speedDuration', levelIndex, 2);
    
    // Steal all buffs from target
    const stolenBuffs = buffDebuffHelpers.clearBuffs(target);
    if (stolenBuffs.length > 0) {
        caster.buffs = caster.buffs || [];
        caster.buffs.push(...stolenBuffs);
        battle.log(`${caster.name} steals all buffs from ${target.name}!`);
    }
    
    battle.applyBuff(caster, 'Increase Speed', speedDuration, {});
},

phaseStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const isMarked = buffDebuffHelpers.hasDebuff(target, 'Mark');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: isMarked ? 'pure' : 'physical'
    });
    
    if (isMarked) {
        battle.log(`Phase strike pierces through the mark!`);
    }
},

voidStepLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 2);
    
    buffDebuffHelpers.clearDebuffs(caster);
    
    for (let i = 0; i < stackCount; i++) {
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    }
},

shadowRealmPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.shadowRealmPassive = true;
    const damageReduction = spellHelpers.getParam(spell, 'damageReduction', levelIndex, 0.3);
    caster.physicalDamageReduction = (caster.physicalDamageReduction || 0) + damageReduction;
    caster.magicDamageReduction = (caster.magicDamageReduction || 0) + damageReduction;
},

tentacleSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
        }
    });
},

maddeningPresenceLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.15);
    const debuffDuration = spellHelpers.getParam(spell, 'debuffDuration', levelIndex, 2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        actionBarHelpers.drain(enemy, actionBarDrain, battle);
        
        const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Bleed', 'Blight', 'Mark'];
        const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
        applyConfiguredDebuff(battle, enemy, randomDebuff, debuffDuration);
    });
},

eldritchResilienceLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.4);
    const immuneDuration = spellHelpers.getParam(spell, 'immuneDuration', levelIndex, 1);
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    battle.applyBuff(caster, 'Immune', immuneDuration, { immunity: true });
},

phantomBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffThreshold = spellHelpers.getParam(spell, 'debuffThreshold', levelIndex, 3);
    const damageMultiplier = spellHelpers.getParam(spell, 'damageMultiplier', levelIndex, 2);
    const debuffCount = buffDebuffHelpers.countDebuffs(target);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        damageModifier: debuffCount >= debuffThreshold ? damageMultiplier : 1
    });
    
    if (debuffCount >= debuffThreshold) {
        battle.log(`Phantom bolt devastates the heavily debuffed target!`);
    }
},

mirrorImagesLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Frost Armor', duration, {});
    });
},

realityTwistLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        // Get all buffs (excluding Boss)
        const buffsToConvert = buffDebuffHelpers.getBuffs(enemy).filter(b => b.name !== 'Boss');
        buffDebuffHelpers.clearBuffs(enemy, ['Boss']);
        
        if (buffsToConvert.length === 0) return;
        
        // Debuff types that can be applied
        const debuffTypes = ['Reduce Attack', 'Reduce Speed', 'Reduce Defense', 'Blight', 'Bleed', 'Mark'];
        
        // Convert each buff to a random debuff with the spell's duration
        buffsToConvert.forEach(buff => {
            const randomDebuff = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
            applyConfiguredDebuff(battle, enemy, randomDebuff, duration);
        });
    });
    
    battle.log(`Reality twists, converting all enemy buffs to debuffs!`);
},

dimensionalSlashLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const armorPierce = spellHelpers.getParam(spell, 'armorPierce', levelIndex, 0.5);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        damageOptions: { armorPierce: armorPierce }
    });
},

mazeShiftLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
        actionBarHelpers.drain(enemy, actionBarDrain, battle);
    });
},

guardiansWardLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.3);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
        battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
        
        if (buffDebuffHelpers.removeFirstDebuff(ally)) {
            battle.log(`Cleansed a debuff from ${ally.name}!`);
        }
    });
},

eternalVigilPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.eternalVigilPassive = true;
    caster.immuneToReduceSpeed = true;
    const speedBonus = spellHelpers.getParam(spell, 'speedBonus', levelIndex, 0.25);
    caster.actionBarSpeed = Math.floor(caster.actionBarSpeed * (1 + speedBonus));
},

mindSpikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const markDuration = spellHelpers.getParam(spell, 'markDuration', levelIndex, 3);
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    const isMarked = buffDebuffHelpers.hasDebuff(target, 'Mark');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            if (isMarked) {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                battle.log(`Mind spike stuns the marked target!`);
            } else {
                applyConfiguredDebuff(battle, target, 'Mark', markDuration);
            }
        }
    });
},

psychicStormLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const missingHpPercent = spellHelpers.getParam(spell, 'missingHpPercent', levelIndex, 0.3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const missingHp = hpHelpers.missingHp(enemy);
        const damage = missingHp * missingHpPercent;
        battle.dealDamage(caster, enemy, damage, 'magical');
    });
},

madnessCascadeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Silence', silenceDuration);
        applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
        applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
    });
},

hivemindPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.hivemindPassive = true;
    caster.hivemindHealPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.2);
    caster.hivemindBuffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
    
    // Note: The actual effect is handled in handleUnitDeath
},

lavaBurstLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
        }
    });
},

moltenShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.2);
    const retaliationDamage = spellHelpers.getParam(spell, 'retaliationDamage', levelIndex, 75);
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    
    caster.moltenShieldActive = true;
    caster.moltenShieldDamage = retaliationDamage;
},

eruptionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Bleed', bleedDuration);
        }
    });
},

burningStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.05);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: () => {
            actionBarHelpers.drain(target, actionBarDrain, battle);
        }
    });
},

fireDanceLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 2);
    
    for (let i = 0; i < stackCount; i++) {
        battle.applyBuff(caster, 'Increase Speed', duration, {});
    }
    battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
    
    caster.nextAttackIsAoE = true;
    battle.log(`${caster.name}'s next attack will hit all enemies!`);
},

ignitionTrailPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.ignitionTrailPassive = true;
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 1);
    
    passiveHelpers.addOnHitEffect(caster, {
        type: 'debuff',
        debuffName: 'Bleed',
        chance: 1.0,
        duration: bleedDuration
    });
},

volcanicSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.25);
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            if (Math.random() < stunChance) {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
            }
        }
    });
},

hardenedLavaLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    battle.applyBuff(caster, 'Increase Defense', duration, {});
    battle.applyBuff(caster, 'Frost Armor', duration, {});
},

moltenCoreLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpCost = spellHelpers.getParam(spell, 'hpCost', levelIndex, 0.2);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    const hpSacrifice = hpHelpers.drainHpPercent(caster, hpCost);
    battle.log(`${caster.name} sacrifices ${hpSacrifice} HP!`);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
        applyConfiguredDebuff(battle, enemy, 'Bleed', duration);
    });
},

flameFeatherLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.3);
    
    const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
    
    const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
    if (lowestHpAlly) {
        const healAmount = damageDealt * healPercent;
        battle.healUnit(lowestHpAlly, healAmount);
    }
},

rebirthLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        buffDebuffHelpers.clearDebuffs(ally);
        battle.applyBuff(ally, 'Increase Speed', duration, {});
    });
},

fromAshesLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.25);
    const hpThreshold = spellHelpers.getParam(spell, 'hpThreshold', levelIndex, 0.25);
    
    // Set up the trigger for when HP drops below threshold
    caster.fromAshesReady = true;
    caster.fromAshesThreshold = hpThreshold;
    caster.fromAshesHealPercent = healPercent;
    caster.fromAshesTriggered = false;
    
    battle.log(`${caster.name} prepares to rise from ashes!`);
},

pyroblastLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const hasBleeding = buffDebuffHelpers.hasDebuff(target, 'Bleed');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: hasBleeding ? 'pure' : 'magical'
    });
    
    if (hasBleeding) {
        battle.log(`Pyroblast ignites the bleeding wounds!`);
    }
},

flameWaveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
        }
    });
},

infernalRageLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const stackCount = spellHelpers.getParam(spell, 'stackCount', levelIndex, 3);
    
    // Apply stacks to self
    for (let i = 0; i < stackCount; i++) {
        battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
    }
    
    // Apply speed to all allies
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Increase Speed', duration, {});
    });
},

burningWoundsPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.burningWoundsPassive = true;
    caster.burningWoundsChance = spellHelpers.getParam(spell, 'procChance', levelIndex, 0.3);
    caster.burningWoundsBleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 1);
},

soulfireLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpPercentDamage = spellHelpers.getParam(spell, 'hpPercentDamage', levelIndex, 0.1);
    
    const damage = target.currentHp * hpPercentDamage;
    battle.dealDamage(caster, target, damage, 'magical');
},

eternalFlameLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    const bleedStacks = spellHelpers.getParam(spell, 'bleedStacks', levelIndex, 3);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Blight', duration);
        multiApplyHelpers.applyDebuffStacks(battle, enemy, 'Bleed', bleedStacks, duration);
    });
},

phoenixRisingLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpThreshold = spellHelpers.getParam(spell, 'hpThreshold', levelIndex, 0.25);
    const immuneDuration = spellHelpers.getParam(spell, 'immuneDuration', levelIndex, 1);
    
    if (hpHelpers.isBelowThreshold(caster, hpThreshold)) {
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            ally.currentHp = ally.maxHp;
            battle.applyBuff(ally, 'Immune', immuneDuration, { immunity: true });
        });
        battle.log(`${caster.name} rises like a phoenix, healing all allies!`);
    } else {
        battle.log(`${caster.name} must be below ${Math.floor(hpThreshold * 100)}% HP to activate Phoenix Rising!`);
    }
},

cinderLordPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    caster.cinderLordPassive = true;
    caster.immuneToReduceAttack = true;
    const magicalDamageBonus = spellHelpers.getParam(spell, 'magicalDamageBonus', levelIndex, 0.15);
    
    // Apply magical damage bonus to all allies
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        ally.magicalDamageBonus = (ally.magicalDamageBonus || 0) + magicalDamageBonus;
    });
    
    battle.log(`${caster.name}'s flames enhance all magical attacks!`);
},

    // Plague/Disease themed spells
rabidBiteLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedChance = spellHelpers.getParam(spell, 'bleedChance', levelIndex, 0.8);
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            if (Math.random() < bleedChance) {
                applyConfiguredDebuff(battle, target, 'Bleed', bleedDuration);
            }
        }
    });
},

festeringWoundDogLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    // Apply Blight to self
    applyConfiguredDebuff(battle, caster, 'Blight', duration);
    
    // Apply Blight to all enemies
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Blight', duration);
    });
    
    battle.log(`${caster.name} spreads disease to everyone!`);
},

savageLeapLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
    
    // Gain speed buff
    battle.applyBuff(caster, 'Increase Speed', duration, {});
    
    // Drain action bar from target
    actionBarHelpers.drain(target, actionBarDrain, battle);
},

toxicPrayerLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.15);
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.15);
    
    // Heal the target ally
    const healAmount = hpHelpers.percentOfMaxHp(target, healPercent);
    battle.healUnit(target, healAmount);
    
    // Find lowest HP enemy and drain their action bar
    const enemies = battle.getEnemies(caster);
    const aliveEnemies = enemies.filter(e => e && e.isAlive);
    
    if (aliveEnemies.length > 0) {
        aliveEnemies.sort((a, b) => hpHelpers.hpPercent(a) - hpHelpers.hpPercent(b));
        const lowestHpEnemy = aliveEnemies[0];
        actionBarHelpers.drain(lowestHpEnemy, actionBarDrain, battle);
    }
},

spreadCorruptionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Reduce Defense', duration);
    });
},

darkBlessingPlagueLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        // Apply buffs
        battle.applyBuff(ally, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        battle.applyBuff(ally, 'Increase Defense', duration, {});
        
        // Apply bleed debuff
        applyConfiguredDebuff(battle, ally, 'Bleed', bleedDuration);
    });
    
    battle.log(`Dark blessing empowers allies but at a cost!`);
},

putridShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 120);
    const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
    
    // Gain shield
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    
    // Taunt all enemies
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
    });
},

diseasedStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    const hasBlightBeforeAttack = buffDebuffHelpers.hasDebuff(target, 'Blight');
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            // Only stun if target had Blight before the attack
            if (hasBlightBeforeAttack && target.isAlive) {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
                battle.log(`Diseased strike stuns the blighted target!`);
            }
        }
    });
},

corpseBloatPassiveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // This is a passive that triggers on death
    // We need to add this to battle.js handleUnitDeath function
    caster.corpseBloatPassive = true;
    caster.corpseBloatBlightDuration = spell.blightDuration || 1;
},

plagueBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bonusPercent = spellHelpers.getParam(spell, 'bonusPercent', levelIndex, 0.25);
    const debuffCount = buffDebuffHelpers.countDebuffs(target);
    const damageMultiplier = 1 + (bonusPercent * debuffCount);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        damageModifier: damageMultiplier
    });
    
    if (debuffCount > 0) {
        battle.log(`Plague bolt gains power from ${debuffCount} debuffs!`);
    }
},

toxicCloudLogic: function(battle, caster, target, spell, spellLevel = 1) {
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
},

siphonVitalityLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.5);
    
    const damage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
    const damageDealt = battle.dealDamage(caster, target, damage, 'magical');
    
    const healAmount = damageDealt * healPercent;
    battle.healUnit(caster, healAmount);
},

poisonedBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Blight', duration);
            applyConfiguredDebuff(battle, target, 'Mark', duration);
        }
    });
},

cripplingStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
        }
    });
},

vanishInSmokeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    // Remove all debuffs
    buffDebuffHelpers.clearDebuffs(caster);
    
    // Apply buffs
    battle.applyBuff(caster, 'Increase Speed', duration, {});
    battle.applyBuff(caster, 'Immune', duration, { immunity: true });
},

unholySermonLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Silence', silenceDuration);
        }
    });
},

corruptBlessingLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const markDuration = spellHelpers.getParam(spell, 'markDuration', levelIndex, 2);
    const buffDuration = spellHelpers.getParam(spell, 'buffDuration', levelIndex, 2);
    
    const buffTypes = ['Increase Attack', 'Increase Speed', 'Increase Defense'];
    
    // All enemies gain one random buff and Mark debuff
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const randomBuff = buffTypes[Math.floor(Math.random() * buffTypes.length)];
        if (randomBuff === 'Increase Attack') {
            battle.applyBuff(enemy, randomBuff, buffDuration, { damageMultiplier: 1.5 });
        } else {
            battle.applyBuff(enemy, randomBuff, buffDuration, {});
        }
        applyConfiguredDebuff(battle, enemy, 'Mark', markDuration);
    });
    
    // All allies gain one random buff
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        const randomBuff = buffTypes[Math.floor(Math.random() * buffTypes.length)];
        if (randomBuff === 'Increase Attack') {
            battle.applyBuff(ally, randomBuff, buffDuration, { damageMultiplier: 1.5 });
        } else {
            battle.applyBuff(ally, randomBuff, buffDuration, {});
        }
    });
    
    battle.log(`Corrupt blessing affects everyone!`);
},

divinePlagueLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Blight', duration);
            applyConfiguredDebuff(battle, target, 'Silence', duration);
        }
    });
},

// Trickster/Illusionist Spells
mirrorStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.05);
    
    // Deal physical damage
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical'
    });
    
    // Shield allies without debuffs
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        if (buffDebuffHelpers.countDebuffs(ally) === 0) {
            const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
            battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
        }
    });
},

falseImageLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    battle.applyBuff(caster, 'Frost Armor', duration, {});
    battle.applyBuff(caster, 'Increase Defense', duration, {});
},

deceptiveGuardLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const tauntDuration = spellHelpers.getParam(spell, 'tauntDuration', levelIndex, 1);
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.1);
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.1);
    
    // Taunt all enemies
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Taunt', tauntDuration, caster);
    });
    
    // Heal self
    const healAmount = hpHelpers.percentOfMaxHp(caster, healPercent);
    battle.healUnit(caster, healAmount);
    
    // Shield all allies
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
        battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
    });
},

illusionBoltLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const immuneDuration = spellHelpers.getParam(spell, 'immuneDuration', levelIndex, 1);
    
    // Deal magical damage
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
    
    // Grant random ally Immune
    const allies = battle.getParty(caster);
    const aliveAllies = allies.filter(a => a && a.isAlive);
    if (aliveAllies.length > 0) {
        const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        battle.applyBuff(randomAlly, 'Immune', immuneDuration, { immunity: true });
    }
},

veilOfDeceptionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.1);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        // Heal
        const healAmount = hpHelpers.percentOfMaxHp(ally, healPercent);
        battle.healUnit(ally, healAmount);
        
        // Apply buffs
        battle.applyBuff(ally, 'Immune', duration, { immunity: true });
        battle.applyBuff(ally, 'Increase Speed', duration, {});
    });
},

realityBlurLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        // Remove all debuffs
        buffDebuffHelpers.clearDebuffs(ally);
        
        // Grant shield
        const shieldAmount = hpHelpers.percentOfMaxHp(ally, shieldPercent);
        battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
    });
    
    battle.log(`Reality blurs, cleansing and protecting all allies!`);
},

phantomStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const buffStealCount = spellHelpers.getParam(spell, 'buffStealCount', levelIndex, 1);
    
    // Deal physical damage
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            // Steal buffs
            const availableBuffs = buffDebuffHelpers.getBuffs(target).filter(b => b.name !== 'Boss');
            const stealCount = Math.min(buffStealCount, availableBuffs.length);
            
            for (let i = 0; i < stealCount; i++) {
                const buffIndex = target.buffs.findIndex(b => b.name !== 'Boss');
                if (buffIndex !== -1) {
                    const stolenBuff = target.buffs.splice(buffIndex, 1)[0];
                    caster.buffs = caster.buffs || [];
                    caster.buffs.push(stolenBuff);
                    battle.log(`${caster.name} steals ${stolenBuff.name}!`);
                }
            }
        }
    });
},

smokeAndDaggersLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    applyConfiguredDebuff(battle, target, 'Mark', duration);
    applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
},

illusoryDoubleLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Get all debuffs from self
    const myDebuffs = [...buffDebuffHelpers.getDebuffs(caster)];
    
    if (myDebuffs.length > 0) {
        // Get all alive enemies
        const enemies = battle.getEnemies(caster);
        const aliveEnemies = enemies.filter(e => e && e.isAlive);
        
        if (aliveEnemies.length > 0) {
            // Apply each debuff to a random enemy
            myDebuffs.forEach(debuff => {
                const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                applyConfiguredDebuff(battle, randomEnemy, debuff.name, debuff.duration);
            });
            
            battle.log(`${caster.name}'s illusory double transfers debuffs to enemies!`);
        }
    }
    
    // Cleanse self
    buffDebuffHelpers.clearDebuffs(caster);
},

nightmareTouchLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.1);
    
    // Deal magical damage
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            actionBarHelpers.drain(target, actionBarDrain, battle);
        }
    });
},

sleepParalysisLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    const actionBarThreshold = spellHelpers.getParam(spell, 'actionBarThreshold', levelIndex, 0.5);
    
    if (target.actionBar < (10000 * actionBarThreshold)) {
        applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
        battle.log(`${target.name} is paralyzed in their sleep!`);
    } else {
        battle.log(`${target.name} resists sleep paralysis!`);
    }
},

dreamFeastLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarDrain = spellHelpers.getParam(spell, 'actionBarDrain', levelIndex, 0.2);
    const maxHealPercent = spellHelpers.getParam(spell, 'maxHealPercent', levelIndex, 0.3);
    
    // Drain action bar from all enemies and track total
    let totalDrained = 0;
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        const drained = actionBarHelpers.drain(enemy, actionBarDrain);
        totalDrained += drained;
    });
    
    // Convert drained action bar to healing
    if (totalDrained > 0) {
        const healPercent = Math.min((totalDrained / 10000) * 0.1, maxHealPercent);
        
        spellHelpers.forEachAliveAlly(battle, caster, ally => {
            const healAmount = hpHelpers.percentOfMaxHp(ally, healPercent);
            battle.healUnit(ally, healAmount);
        });
        
        battle.log(`Dreams consumed! Allies heal from stolen energy!`);
    }
},

mirrorBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Check if caster and target share any buffs
    const casterBuffNames = buffDebuffHelpers.getBuffs(caster).map(b => b.name);
    const targetBuffNames = buffDebuffHelpers.getBuffs(target).map(b => b.name);
    const sharedBuffs = casterBuffNames.filter(name => targetBuffNames.includes(name));
    
    const damageModifier = sharedBuffs.length > 0 ? 2 : 1;
    
    if (sharedBuffs.length > 0) {
        battle.log(`Mirror blade reflects shared power!`);
    }
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        damageModifier: damageModifier
    });
},

perfectCopyLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Copy all buffs from target
    const targetBuffs = buffDebuffHelpers.getBuffs(target);
    
    targetBuffs.forEach(buff => {
        if (buff.name !== 'Boss') {
            const buffCopy = { ...buff };
            caster.buffs = caster.buffs || [];
            caster.buffs.push(buffCopy);
        }
    });
    
    if (targetBuffs.length > 0) {
        battle.log(`${caster.name} perfectly copies all buffs from ${target.name}!`);
    }
},

shatteredReflectionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const immuneDuration = spellHelpers.getParam(spell, 'immuneDuration', levelIndex, 1);
    
    // This is a passive that needs to be handled in handleUnitDeath
    caster.shatteredReflectionPassive = true;
    caster.shatteredReflectionImmuneDuration = immuneDuration;
},

shellSlamLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.3);
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        afterDamage: (battle, caster, target) => {
            if (Math.random() < stunChance) {
                applyConfiguredDebuff(battle, target, 'Stun', stunDuration);
            }
        }
    });
},

fortressShellLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldPercent = spellHelpers.getParam(spell, 'shieldPercent', levelIndex, 0.5);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 3);
    
    const shieldAmount = hpHelpers.percentOfMaxHp(caster, shieldPercent);
    battle.applyBuff(caster, 'Shield', -1, { shieldAmount: shieldAmount });
    battle.applyBuff(caster, 'Increase Defense', duration, {});
},

tsunamiLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarMultiplier = spellHelpers.getParam(spell, 'actionBarMultiplier', levelIndex, 0.5);
    
    // Halve all enemy action bars
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        enemy.actionBar = Math.floor(enemy.actionBar * actionBarMultiplier);
    });
    
    battle.log(`Tsunami crashes down, washing away enemy momentum!`);
    
    // Deal AOE magical damage
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical'
    });
},

ancientShellLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Set up passive properties
    caster.ancientShellPassive = true;
    caster.ancientShellFrostArmorDuration = spell.frostArmorDuration || 3;
},

phantomBladeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // Choose damage type based on lower defense
    const damageType = target.physicalDamageReduction > target.magicDamageReduction ? 'magical' : 'physical';
    const scalingType = damageType === 'magical' ? 'int' : 'agi';
    
    battle.log(`Phantom blade strikes as ${damageType} damage!`);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, [scalingType]: true},
        damageType: damageType
    });
},

perfectIllusionLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    // Remove all debuffs
    buffDebuffHelpers.clearDebuffs(caster);
    
    // Apply buffs
    battle.applyBuff(caster, 'Increase Speed', duration, {});
    battle.applyBuff(caster, 'Frost Armor', duration, {});
},

shimmeringAssaultLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const buffStealCount = spellHelpers.getParam(spell, 'buffStealCount', levelIndex, 1);
    
    // Deal AOE damage and steal buffs
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        perEnemyEffect: (battle, caster, enemy) => {
            // Steal buffs from each enemy
            const availableBuffs = buffDebuffHelpers.getBuffs(enemy).filter(b => b.name !== 'Boss');
            const stealCount = Math.min(buffStealCount, availableBuffs.length);
            
            for (let i = 0; i < stealCount; i++) {
                const buffIndex = enemy.buffs.findIndex(b => b.name !== 'Boss');
                if (buffIndex !== -1) {
                    const stolenBuff = enemy.buffs.splice(buffIndex, 1)[0];
                    caster.buffs = caster.buffs || [];
                    caster.buffs.push(stolenBuff);
                    battle.log(`${caster.name} steals ${stolenBuff.name} from ${enemy.name}!`);
                }
            }
        }
    });
},

mirrorOfTruthLogic: function(battle, caster, target, spell, spellLevel = 1) {
    // This is a passive that needs to be handled in processTurn
    caster.mirrorOfTruthPassive = true;
},

lightningBreathLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const stunChance = spellHelpers.getParam(spell, 'stunChance', levelIndex, 0.25);
    const stunDuration = spellHelpers.getParam(spell, 'stunDuration', levelIndex, 1);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            if (Math.random() < stunChance) {
                applyConfiguredDebuff(battle, enemy, 'Stun', stunDuration);
            }
        }
    });
},

stormShieldLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 60);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Shield', -1, { shieldAmount: shieldAmount });
    });
},

eyeOfTheStormLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    caster.eyeOfTheStormPassive = true;
    caster.eyeOfTheStormDuration = duration;
    
    passiveHelpers.addOnDamageTaken(caster, {
        type: 'grant_speed_to_ally',
        duration: duration
    });
},

shadowFlameLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: () => {
            applyConfiguredDebuff(battle, target, 'Mark', duration);
            applyConfiguredDebuff(battle, target, 'Blight', duration);
        }
    });
},

corruptingDarknessLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const silenceDuration = spellHelpers.getParam(spell, 'silenceDuration', levelIndex, 1);
    
    spellHelpers.forEachAliveEnemy(battle, caster, enemy => {
        applyConfiguredDebuff(battle, enemy, 'Silence', silenceDuration);
    });
    
    battle.log(`${caster.name}'s corrupting darkness silences all enemies!`);
},

shadowVeilLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const markChance = spellHelpers.getParam(spell, 'markChance', levelIndex, 0.3);
    const markDuration = spellHelpers.getParam(spell, 'markDuration', levelIndex, 1);
    
    caster.shadowVeilPassive = true;
    
    passiveHelpers.addOnHitEffect(caster, {
        type: 'debuff',
        debuffName: 'Mark',
        chance: markChance,
        duration: markDuration
    });
},

scorchingBreathLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedDuration = spellHelpers.getParam(spell, 'bleedDuration', levelIndex, 2);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Bleed', bleedDuration);
        }
    });
},

infernoWaveLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const bleedBonus = spellHelpers.getParam(spell, 'bleedBonus', levelIndex, 1.5);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, str: true},
        damageType: 'physical',
        getDamageModifier: (enemy) => {
            const hasBleed = buffDebuffHelpers.hasDebuff(enemy, 'Bleed');
            if (hasBleed) {
                battle.log(`Inferno wave burns bleeding wounds!`);
            }
            return hasBleed ? bleedBonus : 1;
        }
    });
},

burningFuryLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    // This is a passive that triggers each turn
    caster.burningFuryPassive = true;
    caster.burningFuryDuration = duration;
    
    // Check if any unit has bleed at battle start
    const anyUnitHasBleed = battle.allUnits.some(unit => 
        unit.isAlive && buffDebuffHelpers.hasDebuff(unit, 'Bleed')
    );
    
    if (anyUnitHasBleed) {
        battle.applyBuff(caster, 'Increase Attack', duration, { damageMultiplier: 1.5 });
        battle.log(`${caster.name}'s burning fury ignites!`);
    }
},

frostBreathDragonLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        perEnemyEffect: (battle, caster, enemy) => {
            applyConfiguredDebuff(battle, enemy, 'Reduce Speed', duration);
            applyConfiguredDebuff(battle, enemy, 'Reduce Attack', duration);
        }
    });
},

glacialBarrierLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Frost Armor', duration, {});
    });
},

frozenHeartLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const magicReduction = spellHelpers.getParam(spell, 'magicReduction', levelIndex, 0.5);
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    caster.frozenHeartPassive = true;
    caster.frozenHeartMagicReduction = magicReduction;
    caster.frozenHeartDefenseDuration = duration;
    
    // Apply magic damage reduction
    caster.magicDamageReduction = (caster.magicDamageReduction || 0) + magicReduction;
    
    passiveHelpers.addOnDamageTaken(caster, {
        type: 'frozen_heart_defense',
        duration: duration
    });
},

elementalDevastationLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const debuffBonus = spellHelpers.getParam(spell, 'debuffBonus', levelIndex, 50);
    
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        getDamageModifier: (enemy) => {
            const baseDamage = spellHelpers.calculateDamage(spell, levelIndex, caster, {attack: true, int: true});
            const debuffCount = buffDebuffHelpers.countDebuffs(enemy);
            const bonusDamage = debuffBonus * debuffCount;
            return (baseDamage + bonusDamage) / baseDamage;
        }
    });
},

regeneratingHeadsLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const hpThreshold = spellHelpers.getParam(spell, 'hpThreshold', levelIndex, 0.3);
    
    // Check if below threshold and hasn't triggered yet
    if (hpHelpers.isBelowThreshold(caster, hpThreshold) && !caster.regeneratingHeadsUsed) {
        caster.regeneratingHeadsUsed = true;
        
        // Full heal
        caster.currentHp = caster.maxHp;
        
        // Cleanse all debuffs
        buffDebuffHelpers.clearDebuffs(caster);
        
        battle.log(`${caster.name}'s heads regenerate! Full health restored!`);
    }
},

hydrasCommandLogic: function(battle, caster, target, spell, spellLevel = 1) {
    caster.hydrasCommandPassive = true;
},

swiftStrikeLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, agi: true},
        damageType: 'physical',
        afterDamage: (battle, caster) => {
            battle.applyBuff(caster, 'Increase Speed', duration, {});
        }
    });
},

aerialSupportLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    const healPercent = spellHelpers.getParam(spell, 'healPercent', levelIndex, 0.15);
    
    // Grant speed to all allies
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.applyBuff(ally, 'Increase Speed', duration, {});
    });
    
    // Heal lowest HP ally
    const lowestHpAlly = spellHelpers.getLowestHpAlly(battle, caster);
    if (lowestHpAlly) {
        const healAmount = hpHelpers.percentOfMaxHp(lowestHpAlly, healPercent);
        battle.healUnit(lowestHpAlly, healAmount);
    }
},

purifyingFlameLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const buffsToRemove = spellHelpers.getParam(spell, 'buffsToRemove', levelIndex, 1);
    
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: {attack: true, int: true},
        damageType: 'magical',
        afterDamage: (battle, caster, target) => {
            // Remove specified number of buffs
            const currentBuffCount = buffDebuffHelpers.countBuffs(target, ['Boss']);
            const removeCount = Math.min(buffsToRemove, currentBuffCount);
            
            for (let i = 0; i < removeCount; i++) {
                const buffs = buffDebuffHelpers.getBuffs(target);
                const removableBuffIndex = buffs.findIndex(b => b.name !== 'Boss');
                if (removableBuffIndex !== -1) {
                    target.buffs.splice(removableBuffIndex, 1);
                }
            }
            
            if (removeCount > 0) {
                battle.log(`Purifying flame removes ${removeCount} buff${removeCount > 1 ? 's' : ''}!`);
            }
        }
    });
},

youthfulEnergyLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const actionBarGrant = spellHelpers.getParam(spell, 'actionBarGrant', levelIndex, 0.2);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        actionBarHelpers.grant(ally, actionBarGrant, battle);
    });
    
    battle.log(`${caster.name}'s youthful energy energizes all allies!`);
},

// Test Spells
winLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 5);
    
    // Use AoE helper for cleaner code
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: {attack: false}, // Pure damage, no attack scaling
        damageType: 'pure'
    });
    
    battle.applyBuff(caster, 'Increase Speed', duration, {});
},

loseLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const baseDamage = spellHelpers.getParam(spell, 'scaling.base', levelIndex, 10000000);
    
    spellHelpers.forEachAliveAlly(battle, caster, ally => {
        battle.dealDamage(caster, ally, baseDamage, 'pure');
    });
},

increaseAttackTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    battle.applyBuff(target, 'Increase Attack', duration, { damageMultiplier: 1.5 });
},

increaseSpeedTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    battle.applyBuff(target, 'Increase Speed', duration, {});
},

increaseDefenseTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    battle.applyBuff(target, 'Increase Defense', duration, {});
},

immuneTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    battle.applyBuff(target, 'Immune', duration, { immunity: true });
},

shieldTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const shieldAmount = spellHelpers.getParam(spell, 'shieldAmount', levelIndex, 50);
    battle.applyBuff(target, 'Shield', -1, { shieldAmount: shieldAmount });
},

frostArmorTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    battle.applyBuff(target, 'Frost Armor', duration, {});
},

reduceAttackTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Reduce Attack', duration);
},

reduceSpeedTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Reduce Speed', duration);
},

reduceDefenseTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Reduce Defense', duration);
},

blightTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Blight', duration);
},

bleedTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Bleed', duration);
},

stunTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 1);
    applyConfiguredDebuff(battle, target, 'Stun', duration);
},

tauntTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Taunt', duration, caster);
},

silenceTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Silence', duration);
},

markTestLogic: function(battle, caster, target, spell, spellLevel = 1) {
    const levelIndex = spellLevel - 1;
    const duration = spellHelpers.getParam(spell, 'duration', levelIndex, 2);
    applyConfiguredDebuff(battle, target, 'Mark', duration);
}
    
};

// Spell Manager Class
class SpellManager {
    constructor() {
        this.spells = {};
        this.loaded = false;
    }

    async loadSpells() {
        try {
            const response = await fetch('spells.json');
            const spellData = await response.json();
            
            this.spells = spellData;
            
            this.loaded = true;
            console.log('Spells loaded:', Object.keys(this.spells).length);
        } catch (error) {
            console.error('Failed to load spells:', error);
        }
    }

    getSpell(spellId) {
        return this.spells[spellId] || null;
    }

    getSpellsByIds(spellIds) {
        return spellIds.map(id => this.getSpell(id)).filter(spell => spell !== null);
    }

    executeSpell(spellId, battle, caster, target) {
        const spell = this.getSpell(spellId);
        if (!spell) {
            console.error(`Spell not found: ${spellId}`);
            return false;
        }

        const logicFunction = spellLogic[spell.logicKey];
        if (!logicFunction) {
            console.error(`Logic function not found: ${spell.logicKey}`);
            return false;
        }

        try {
            logicFunction(battle, caster, target, spell);
            return true;
        } catch (error) {
            console.error(`Error executing spell ${spellId}:`, error);
            return false;
        }
    }
}
