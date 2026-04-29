// battleAI.js - AI decision making system for TEVE

class BattleAI {
    constructor(battle) {
        this.battle = battle;
        this.debugAI = true; // AI decision making shown in console
    }

    // Main AI decision entry point
    executeAITurn(unit) {
        // Check if unit has taunt debuff and must attack specific target
        const tauntDebuff = unit.debuffs.find(d => d.name === 'Taunt' && d.tauntTarget);
        
        if (tauntDebuff && tauntDebuff.tauntTarget && tauntDebuff.tauntTarget.isAlive) {
            // Force basic attack on taunting unit
            const target = tauntDebuff.tauntTarget;
            // Find first non-passive ability (usually skill 1)
            let attackIndex = -1;
            for (let i = 0; i < unit.abilities.length; i++) {
                const ability = unit.abilities[i];
                if (ability && !ability.passive) {
                    attackIndex = i;
                    break;
                }
            }
            if (attackIndex >= 0) {
                this.battle.executeAbility(unit, attackIndex, target);
            }
            this.battle.endTurn();
            return;
        }
        
        // Pre-calculate sorted lists once for this turn
        const aliveEnemies = this.battle.getEnemies(unit).filter(e => e.isAlive);
        const aliveAllies = this.battle.getParty(unit).filter(a => a.isAlive);
        
        const sortedLists = {
            // Enemy sorted lists
            enemiesByArmor: [...aliveEnemies].sort((a, b) => a.armor - b.armor),
            enemiesByResist: [...aliveEnemies].sort((a, b) => a.resist - b.resist),
            enemiesByTotalDefense: [...aliveEnemies].sort((a, b) => (a.armor + a.resist) - (b.armor + b.resist)),
            enemiesByAttack: [...aliveEnemies].sort((a, b) => b.source.attack - a.source.attack),
            enemiesByHealth: [...aliveEnemies].sort((a, b) => a.currentHp - b.currentHp),
            enemiesByActionBar: [...aliveEnemies].sort((a, b) => b.actionBar - a.actionBar),
            enemiesByBuffCount: [...aliveEnemies].sort((a, b) => b.countableBuffs.length - a.countableBuffs.length),
            
            // Ally sorted lists
            alliesByTotalDefense: [...aliveAllies].sort((a, b) => (a.armor + a.resist) - (b.armor + b.resist)),
            alliesByDebuffCount: [...aliveAllies].sort((a, b) => b.debuffs.length - a.debuffs.length),
            alliesByHealth: [...aliveAllies].sort((a, b) => a.currentHp - b.currentHp),
            alliesByAttack: [...aliveAllies].sort((a, b) => b.source.attack - a.source.attack),
            alliesByActionBar: [...aliveAllies].sort((a, b) => a.actionBar - b.actionBar),
            
            // Counts for quick access
            aliveEnemiesCount: aliveEnemies.length,
            aliveAlliesCount: aliveAllies.length
        };
        
        // Get all possible actions
        const possibleActions = this.getAllPossibleActions(unit);
        
        if (possibleActions.length === 0) {
            // This should NEVER happen - skill 1 has no cooldown
            console.error(`CRITICAL: ${unit.name} has NO available abilities! This is a bug!`);
            this.battle.log(`ERROR: ${unit.name} cannot act - no abilities available!`);
            this.battle.endTurn();
            return;
        }
        
        // Calculate score for each action
        possibleActions.forEach(action => {
            action.score = this.calculateAbilityScore(unit, action.abilityIndex, action.target, action.spell, sortedLists);
        });
        
        // Sort by score (highest first)
        possibleActions.sort((a, b) => b.score - a.score);
        
        // If best score is still negative, force use skill 1 on random target
        if (possibleActions[0].score < 0) {
            console.warn(`${unit.name} has only negative scoring options. Forcing skill 1.`);
            
            // Find skill 1 actions (first non-passive ability)
            const skill1Actions = possibleActions.filter(a => {
                const ability = unit.abilities[a.abilityIndex];
                return ability && !ability.passive && a.abilityIndex === 0;
            });
            
            if (skill1Actions.length > 0) {
                // Pick random target from skill 1 options
                const randomAction = skill1Actions[Math.floor(Math.random() * skill1Actions.length)];
                this.battle.executeAbility(unit, randomAction.abilityIndex, randomAction.target);
                this.battle.endTurn();
                return;
            }
        }
        
        // Execute the best action
        const bestAction = possibleActions[0];
        
        // Debug logging for AI decisions (optional)
        /*
        if (this.debugAI) {
            console.log(`AI Decision for ${unit.name}:`);
            console.log(`Chosen: ${bestAction.ability.name} on ${bestAction.target.name || 'all'} (score: ${bestAction.score.toFixed(1)})`);
            console.log('Top 3 options:', possibleActions.slice(0, 3).map(a => 
                `${a.ability.name} → ${a.target.name || 'all'} (${a.score.toFixed(1)})`
            ));
        }
        */
        this.battle.executeAbility(unit, bestAction.abilityIndex, bestAction.target);
        this.battle.endTurn();
    }

    getAllPossibleActions(unit) {
        const actions = [];
        
        // Check all abilities
        unit.abilities.forEach((ability, index) => {
            // Skip passives and abilities on cooldown
            if (ability.passive || !unit.canUseAbility(index)) return;
            
            const spell = spellManager.getSpell(ability.id);
            if (!spell) return;
            
            // Get all possible targets for this ability
            const targets = this.getPossibleTargets(unit, spell);
            
            // Create an action for each valid target
            targets.forEach(target => {
                actions.push({
                    abilityIndex: index,
                    ability: ability,
                    spell: spell,
                    target: target,
                    score: 0 // Will be calculated
                });
            });
        });
        
        return actions;
    }
    
    getPossibleTargets(unit, spell) {
        const targets = [];
        
        switch (spell.target) {
            case 'enemy':
                const enemies = unit.isEnemy ? 
                    this.battle.party.filter(p => p && p.isAlive) : 
                    this.battle.enemies.filter(e => e && e.isAlive);
                targets.push(...enemies);
                break;
                
            case 'ally':
                const allies = unit.isEnemy ? 
                    this.battle.enemies.filter(e => e && e.isAlive) : 
                    this.battle.party.filter(p => p && p.isAlive);
                targets.push(...allies);
                break;
                
            case 'self':
                targets.push(unit);
                break;
                
            case 'all_enemies':
            case 'all_allies':
            case 'all':
                targets.push('all'); // Special marker for AOE
                break;
        }
        
        return targets;
    }

    getBuffNameFromEffect(effect) {
        const mapping = {
            'buff_increase_attack': 'Increase Attack',
            'buff_increase_speed': 'Increase Speed',
            'buff_increase_defense': 'Increase Defense',
            'buff_immune': 'Immune',
            'buff_shield': 'Shield'
        };
        return mapping[effect] || '';
    }

    getDebuffNameFromEffect(effect) {
        const mapping = {
            'debuff_reduce_attack': 'Reduce Attack',
            'debuff_reduce_speed': 'Reduce Speed',
            'debuff_reduce_defense': 'Reduce Defense',
            'debuff_blight': 'Blight',
            'debuff_bleed': 'Bleed',
            'debuff_stun': 'Stun',
            'debuff_taunt': 'Taunt',
            'debuff_silence': 'Silence',
            'debuff_mark': 'Mark'
        };
        return mapping[effect] || '';
    }

    calculateHealthDeficit(caster, target) {
        // Calculate how much health is "missing" including shield considerations
        const maxHp = target.maxHp;
        const currentHp = target.currentHp;
        const currentShield = target.currentShield;
        
        // Base health deficit
        let deficit = (maxHp - currentHp) / maxHp;
        
        // Check for overheal passive abilities on the caster
        if (caster.prophetMalePassive) {
            // Prophet Male can create shields up to 25% max HP from overhealing
            const potentialShield = maxHp * 0.25;
            const shieldDeficit = Math.max(0, potentialShield - currentShield);
            deficit += shieldDeficit / maxHp;
        }
        
        // Consider Champion Female passive shield regeneration
        if (target.championFemalePassive && !currentShield) {
            // They can regenerate a 20% shield
            deficit += 0.2;
        }
        
        return Math.min(deficit, 1.0); // Cap at 100% deficit
    }

    debugLogAllPossibleActions(unit) {
        if (!this.debugAI) return;
        console.log(`\n=======================`);
        console.log(`\n========== AI Debug for ${unit.source.className} - ${unit.name}==========`);
        
        // Pre-calculate sorted lists once
        const aliveEnemies = this.battle.getEnemies(unit).filter(e => e.isAlive);
        const aliveAllies = this.battle.getParty(unit).filter(a => a.isAlive);
        
        const sortedLists = {
            enemiesByArmor: [...aliveEnemies].sort((a, b) => a.armor - b.armor),
            enemiesByResist: [...aliveEnemies].sort((a, b) => a.resist - b.resist),
            enemiesByTotalDefense: [...aliveEnemies].sort((a, b) => (a.armor + a.resist) - (b.armor + b.resist)),
            enemiesByAttack: [...aliveEnemies].sort((a, b) => b.source.attack - a.source.attack),
            enemiesByHealth: [...aliveEnemies].sort((a, b) => a.currentHp - b.currentHp),
            enemiesByActionBar: [...aliveEnemies].sort((a, b) => b.actionBar - a.actionBar),
            enemiesByBuffCount: [...aliveEnemies].sort((a, b) => b.buffs.length - a.buffs.length),
            
            alliesByTotalDefense: [...aliveAllies].sort((a, b) => (a.armor + a.resist) - (b.armor + b.resist)),
            alliesByDebuffCount: [...aliveAllies].sort((a, b) => b.debuffs.length - a.debuffs.length),
            alliesByHealth: [...aliveAllies].sort((a, b) => a.currentHp - b.currentHp),
            alliesByAttack: [...aliveAllies].sort((a, b) => b.source.attack - a.source.attack),
            alliesByActionBar: [...aliveAllies].sort((a, b) => a.actionBar - b.actionBar),
            
            aliveEnemiesCount: aliveEnemies.length,
            aliveAlliesCount: aliveAllies.length
        };
        
        // Get all possible actions
        const possibleActions = this.getAllPossibleActions(unit);
        
        // Calculate score for each action
        possibleActions.forEach(action => {
            action.score = this.calculateAbilityScore(unit, action.abilityIndex, action.target, action.spell, sortedLists);
        });
        
        // Sort by score (highest first)
        possibleActions.sort((a, b) => b.score - a.score);
        
        // Log top 10 actions
        const actionsToLog = possibleActions.slice(0, 10);
        
        actionsToLog.forEach((action, index) => {
            const targetInfo = action.target === 'all' ? 'ALL' : 
                `${action.target.name} (Lv${action.target.source.level}, ${Math.floor(action.target.currentHp)}hp)`;
            
            console.log(`${action.score.toFixed(1)}: ${action.ability.name} -> ${targetInfo}`);
        });
        
        console.log(`Total possible actions: ${possibleActions.length}`);
        console.log(`=======================================\n`);
    }

    // AI Scoring System
    calculateAbilityScore(caster, abilityIndex, target, spell, sortedLists) {
        let score = 0;
        const ability = caster.abilities[abilityIndex];
        const effects = spell.effects || [];
        
        // Base score for using any ability
        score += 10;
        
        // Prefer abilities with longer cooldowns
        score += ability.cooldown * 3;
        
        // Check if it's an AOE ability
        const isAOE = effects.includes('aoe') || 
                      spell.target === 'all_enemies' || 
                      spell.target === 'all_allies' || 
                      spell.target === 'all';
        
        // For AOE abilities, we'll calculate scores for each target and average
        let aoeScores = [];
        let potentialTargets = [];
        
        if (isAOE) {
            if (spell.target === 'all_enemies') {
                potentialTargets = this.battle.getEnemies(caster).filter(e => e.isAlive);
            } else if (spell.target === 'all_allies') {
                potentialTargets = this.battle.getParty(caster).filter(a => a.isAlive);
            } else if (spell.target === 'all') {
                // For abilities that can target either team, evaluate both
                const enemies = this.battle.getEnemies(caster).filter(e => e.isAlive);
                const allies = this.battle.getParty(caster).filter(a => a.isAlive);
                // Determine which team would benefit more
                potentialTargets = enemies.length > 0 ? enemies : allies;
            }
        }
        
        // Function to calculate effect scores for a single target
        const calculateEffectScoreForTarget = (currentTarget) => {
            let targetScore = 0;
            
            // Rank bonuses for tiebreaking (small values)
            const rankBonus = [2.5, 2.0, 1.5, 1.0, 0.5];
            
            // Get spell duration for buff/debuff scoring
            const spellLevel = ability.level || caster.spellLevel || 1;
            const levelIndex = spellLevel - 1;
            const spellDuration = spell.duration ? (spell.duration[levelIndex] || spell.duration[0] || 1) : 1;
            
            // Check if target has Twilight's End pending
            if (currentTarget && currentTarget !== 'all' && currentTarget.twilightsEndPending) {
                targetScore += 10; // Base bonus for targeting Twilight's caster
                // Huge bonus for any disruptive action
                if (effects.includes('debuff_stun') || 
                    effects.includes('debuff_silence') || 
                    effects.includes('debuff_taunt') ||
                    effects.includes('physical') || 
                    effects.includes('magical') || 
                    effects.includes('pure')) {
                    targetScore += 50; // Priority to stop Twilight's End
                }
            }
            
            // Calculate damage multiplier based on buffs/debuffs
            let damageMultiplier = 1.0;
            if (caster.buffs.some(b => b.name === 'Increase Attack')) {
                damageMultiplier *= 1.3; // 30% bonus for having attack buff
            }
            if (currentTarget && currentTarget !== 'all' && currentTarget.isAlive) {
                if (currentTarget.debuffs.some(d => d.name === 'Reduce Defense')) {
                    damageMultiplier *= 1.25; // 25% bonus for defense debuff
                }
                if (currentTarget.debuffs.some(d => d.name === 'Mark')) {
                    damageMultiplier *= 1.2; // 20% bonus for marked target
                }
            }
            
            // Track total effect scores for multi-effect abilities
            let totalEffectScore = 0;
            
            // Process each effect
            effects.forEach(effect => {
                let effectScore = 0;
                
                // UPDATED DAMAGE SCORING
                if (effect === 'physical' || effect === 'magical' || effect === 'pure') {
                    if (currentTarget && currentTarget !== 'all' && currentTarget.isAlive) {
                        let estimatedDamage = 0;
                        
                        // Check if spell has standard scaling
                        if (spell.scaling) {
                            // Calculate estimated damage based on spell scaling
                            const baseDamage = spell.scaling.base ? (spell.scaling.base[levelIndex] || spell.scaling.base[0] || 50) : 50;
                            const attackScaling = spell.scaling.attack ? (spell.scaling.attack[levelIndex] || spell.scaling.attack[0] || 1.0) : 1.0;
                            
                            estimatedDamage = baseDamage + (caster.source.attack * attackScaling);
                        } else {
                            // Handle special damage calculations (like Corpse Explosion)
                            if (spell.missingHpPercent) {
                                // Corpse Explosion style - damage based on missing HP
                                const missingHp = currentTarget.maxHp - currentTarget.currentHp;
                                const missingHpDamage = missingHp * (spell.missingHpPercent[levelIndex] || spell.missingHpPercent[0] || 0.2);
                                const baseDamage = spell.baseDamage ? (spell.baseDamage[levelIndex] || spell.baseDamage[0] || 50) : 50;
                                estimatedDamage = baseDamage + missingHpDamage;
                            } else {
                                // Default fallback damage
                                estimatedDamage = 50 + caster.source.attack;
                            }
                        }
                        
                        // Add stat scaling if present
                        if (spell.scaling) {
                            if (spell.scaling.str && caster.stats.str) {
                                const strScaling = spell.scaling.str[levelIndex] || spell.scaling.str[0] || 0;
                                estimatedDamage += caster.stats.str * strScaling;
                            }
                            if (spell.scaling.int && caster.stats.int) {
                                const intScaling = spell.scaling.int[levelIndex] || spell.scaling.int[0] || 0;
                                estimatedDamage += caster.stats.int * intScaling;
                            }
                            if (spell.scaling.agi && caster.stats.agi) {
                                const agiScaling = spell.scaling.agi[levelIndex] || spell.scaling.agi[0] || 0;
                                estimatedDamage += caster.stats.agi * agiScaling;
                            }
                        }
                        
                        // Apply damage multipliers
                        estimatedDamage *= damageMultiplier;
                        
                        // NEW DAMAGE SCORING: 5 + 1 per 1% of max HP
                        const damagePercent = (estimatedDamage / currentTarget.maxHp) * 100;
                        effectScore += 5 + damagePercent;
                        
                        // Bonus for potential kill
                        const currentHpPercent = (currentTarget.currentHp / currentTarget.maxHp) * 100;
                        if (damagePercent >= currentHpPercent) {
                            effectScore += 50; // Killing blow bonus
                        }
                        
                        // Action bar consideration for near-death enemies
                        const actionBarPercent = currentTarget.actionBar / 10000;
                        if (actionBarPercent >= 0.9 && damagePercent >= currentHpPercent * 0.8) {
                            effectScore += 20; // Bonus for preventing imminent turn
                        }
                        
                        // Penalties for defensive buffs
                        if (currentTarget.buffs.some(b => b.name === 'Frost Armor')) {
                            effectScore -= 25; // Will get slowed if attacking
                        }
                        if (currentTarget.buffs.some(b => b.name === 'Increase Defense')) {
                            effectScore -= 20; // Significant damage reduction
                        }
                        if (currentTarget.buffs.some(b => b.name === 'Shield')) {
                            effectScore -= 5; // Minor penalty for shield absorption
                        }
                    } else {
                        // No specific target (shouldn't happen for damage)
                        effectScore += 5; // Minimum value
                    }
                }
                
                // Healing effects
                if (effect === 'heal') {
                    if (currentTarget && currentTarget !== 'all') {
                        // Check if target is blighted (can't be healed)
                        if (currentTarget.debuffs.some(d => d.name === 'Blight')) {
                            effectScore -= 100; // Strong negative for impossible heal
                            totalEffectScore += effectScore;
                            return;
                        }
                        
                        // Calculate health deficit including potential shields
                        const healthDeficit = this.calculateHealthDeficit(caster, currentTarget);
                        effectScore += healthDeficit * 100; // Higher score for more injured/shieldless allies
                        
                        // Slight preference for healing squishier allies
                        if (sortedLists.aliveAlliesCount > 1) {
                            const defenseRank = sortedLists.alliesByTotalDefense.indexOf(currentTarget);
                            if (defenseRank !== -1) {
                                effectScore += rankBonus[defenseRank] || 0;
                            }
                        }
                    }
                }
                
                // Buff effects - score EACH buff
                if (effect.startsWith('buff_')) {
                    if (currentTarget && currentTarget !== 'all') {
                        // Check if target is marked (can't receive buffs)
                        if (currentTarget.debuffs.some(d => d.name === 'Mark')) {
                            effectScore -= 100; // Negative score for trying to buff marked target
                            totalEffectScore += effectScore;
                            return;
                        }
                        
                        const buffName = this.getBuffNameFromEffect(effect);
                        const hasBuff = currentTarget.buffs.some(b => b.name === buffName);
                        
                        if (!hasBuff) {
                            effectScore += 40 * spellDuration; // Good to apply new buff, scaled by duration
                            
                            // Special cases for high-value buffs
                            if (effect === 'buff_increase_attack') {
                                effectScore += 20 * spellDuration; // Attack buffs are high value
                            } else if (effect === 'buff_increase_speed') {
                                effectScore += 20 * spellDuration; // Speed buffs are valuable
                            } else if (effect === 'buff_shield') {
                                const shieldDeficit = this.calculateHealthDeficit(caster, currentTarget);
                                effectScore += shieldDeficit * 50; // Shield value doesn't scale with duration
                            } else if (effect === 'buff_immune') {
                                effectScore += 25 * spellDuration; // Immunity is very valuable
                            }
                        } else {
                            // Check if we should refresh expiring buffs
                            const existingBuff = currentTarget.buffs.find(b => b.name === buffName);
                            if (existingBuff && existingBuff.duration > 0 && existingBuff.duration <= 2) {
                                effectScore += 15 * spellDuration; // Moderate value for refreshing
                            } else {
                                effectScore -= 10; // Small penalty for redundant buff
                            }
                        }
                    }
                }
                
                // SIMPLIFIED TAUNT SCORING
                if (effect === 'debuff_taunt') {
                    if (currentTarget && currentTarget !== 'all') {
                        // Check if target is immune
                        if (currentTarget.buffs.some(b => b.name === 'Immune')) {
                            effectScore -= 50; // Can't debuff immune targets
                            totalEffectScore += effectScore;
                            return;
                        }
                        
                        // Check if already taunted by ANYONE
                        const alreadyTaunted = currentTarget.debuffs.some(d => d.name === 'Taunt');
                        
                        if (alreadyTaunted) {
                            // Target is already taunted - no value in taunting again
                            effectScore -= 35; // Big penalty
                            totalEffectScore += effectScore;
                            return;
                        }
                        
                        // Target is not taunted - calculate value
                        let tauntScore = 20; // Base value
                        
                        // HP check for self
                        const casterHpPercent = caster.currentHp / caster.maxHp;
                        if (casterHpPercent < 0.5) {
                            tauntScore -= 10; // Big penalty if below 50% HP
                        } else if (casterHpPercent < 0.7) {
                            tauntScore -= 5; // Small penalty if below 70% HP
                        }
                        
                        // Bonus for allies in danger
                        if (sortedLists.alliesByHealth.length > 0) {
                            const lowestAlly = sortedLists.alliesByHealth[0];
                            if ((lowestAlly.currentHp / lowestAlly.maxHp) < 0.4) {
                                tauntScore += 15; // Big bonus if someone is low
                            }
                        }
                        
                        // Count allies below 60% HP
                        const vulnerableAllies = sortedLists.alliesByHealth.filter(ally => 
                            (ally.currentHp / ally.maxHp) < 0.6
                        ).length;
                        tauntScore += vulnerableAllies * 5;
                        
                        // Bonus for defensive buffs on self
                        if (caster.buffs.some(b => ['Shield', 'Increase Defense', 'Frost Armor'].includes(b.name))) {
                            tauntScore += 5;
                        }
                        
                        // Bonus for taunting high-damage enemies
                        if (sortedLists.aliveEnemiesCount > 1) {
                            const attackRank = sortedLists.enemiesByAttack.indexOf(currentTarget);
                            if (attackRank === 0) {
                                tauntScore += 8; // Highest damage enemy
                            } else if (attackRank === 1) {
                                tauntScore += 4; // Second highest
                            }
                        }
                        
                        effectScore += tauntScore * spellDuration;
                    }
                }
                
                // Other debuff effects
                else if (effect.startsWith('debuff_') && effect !== 'debuff_taunt') {
                    if (currentTarget && currentTarget !== 'all') {
                        // Check if target is immune
                        if (currentTarget.buffs.some(b => b.name === 'Immune')) {
                            effectScore -= 50; // Can't debuff immune targets
                            totalEffectScore += effectScore;
                            return;
                        }
                        
                        const debuffName = this.getDebuffNameFromEffect(effect);
                        const hasDebuff = currentTarget.debuffs.some(d => d.name === debuffName);
                        
                        if (!hasDebuff) {
                            effectScore += 35 * spellDuration; // Good to apply new debuff, scaled by duration
                            
                            // Bonus for debuffing buffed enemies (excluding Boss buff)
                            const countableBuffCount = currentTarget.countableBuffs.length;
                            if (countableBuffCount > 0) {
                                effectScore += countableBuffCount * 3 * spellDuration; // +3 per buff they have, scaled by duration
                            }
                            
                            // Special high-value debuffs
                            if (effect === 'debuff_stun') {
                                effectScore += 30 * spellDuration; // Stuns are very valuable
                                // Extra bonus for stunning high action bar enemies
                                if (currentTarget.actionBar >= 9000) {
                                    effectScore += 15;
                                }
                            } else if (effect === 'debuff_mark') {
                                effectScore += 25 * spellDuration; // Mark is valuable (prevents buffs + damage increase)
                            } else if (effect === 'debuff_reduce_defense') {
                                effectScore += 20 * spellDuration; // Defense reduction helps entire team
                                // Slight preference for high defense targets
                                if (sortedLists.aliveEnemiesCount > 1) {
                                    const defenseRank = sortedLists.enemiesByTotalDefense.indexOf(currentTarget);
                                    if (defenseRank !== -1) {
                                        const reversedRank = sortedLists.aliveEnemiesCount - 1 - defenseRank;
                                        effectScore += rankBonus[reversedRank] || 0;
                                    }
                                }
                            } else if (effect === 'debuff_reduce_attack') {
                                effectScore += 15 * spellDuration; // Attack reduction is defensive
                                // Slight preference for high attack targets
                                if (sortedLists.aliveEnemiesCount > 1) {
                                    const attackRank = sortedLists.enemiesByAttack.indexOf(currentTarget);
                                    if (attackRank !== -1) {
                                        effectScore += rankBonus[attackRank] || 0;
                                    }
                                }
                            } else if (effect === 'debuff_silence') {
                                effectScore += 20 * spellDuration; // Silence prevents abilities
                            } else if (effect === 'debuff_reduce_speed') {
                                effectScore += 15 * spellDuration; // Speed reduction is useful
                            }
                        } else {
                            // Small penalty for redundant debuff unless it stacks (like bleed)
                            if (effect === 'debuff_bleed') {
                                effectScore += 15 * spellDuration; // Bleeds stack duration
                            } else {
                                const existingDebuff = currentTarget.debuffs.find(d => d.name === debuffName);
                                if (existingDebuff && existingDebuff.duration > 0 && existingDebuff.duration <= 2) {
                                    effectScore += 10 * spellDuration; // Some value for refreshing expiring debuff
                                } else {
                                    effectScore -= 20; // Small penalty for redundant
                                }
                            }
                        }
                    }
                }
                
                // Cleanse effects (remove debuffs from allies)
                if (effect === 'cleanse') {
                    if (currentTarget && currentTarget !== 'all') {
                        effectScore += currentTarget.debuffs.length * 20; // High value per debuff removed
                        // Extra value for removing dangerous debuffs
                        if (currentTarget.debuffs.some(d => d.name === 'Stun')) effectScore += 20;
                        if (currentTarget.debuffs.some(d => d.name === 'Mark')) effectScore += 15;
                        if (currentTarget.debuffs.some(d => d.name === 'Blight')) effectScore += 15;
                        
                        // Slight preference for allies with more debuffs
                        if (sortedLists.aliveAlliesCount > 1) {
                            const debuffRank = sortedLists.alliesByDebuffCount.indexOf(currentTarget);
                            if (debuffRank !== -1) {
                                effectScore += rankBonus[debuffRank] || 0;
                            }
                        }
                    }
                }
                
                // Dispel effects (remove buffs from enemies)
                if (effect === 'dispel') {
                    if (currentTarget && currentTarget !== 'all') {
                        const countableBuffCount = currentTarget.countableBuffs.length;
                        effectScore += countableBuffCount * 20; // High value per buff removed (excluding Boss)
                        // Extra value for removing powerful buffs
                        if (currentTarget.buffs.some(b => b.name === 'Immune')) effectScore += 30;
                        if (currentTarget.buffs.some(b => b.name === 'Shield')) effectScore += 20;
                        if (currentTarget.buffs.some(b => b.name === 'Increase Attack')) effectScore += 15;
                        
                        // Slight preference for enemies with more buffs
                        if (sortedLists.aliveEnemiesCount > 1) {
                            const buffRank = sortedLists.enemiesByBuffCount.indexOf(currentTarget);
                            if (buffRank !== -1) {
                                effectScore += rankBonus[buffRank] || 0;
                            }
                        }
                    }
                }
                
                // Shield break effects
                if (effect === 'shield_break') {
                    if (currentTarget && currentTarget !== 'all' && currentTarget.isAlive) {
                        const hasShield = currentTarget.buffs.some(b => b.name === 'Shield');
                        if (hasShield) {
                            effectScore += 40; // High value for breaking shields
                        } else {
                            effectScore += 5; // Small value even without shield (preventative)
                        }
                    }
                }
                
                // Support effects (action bar manipulation, etc)
                if (effect === 'support') {
                    effectScore += 15; // General support value
                    
                    // Extra points for action bar manipulation on high action bar enemies
                    if (currentTarget && currentTarget !== 'all' && currentTarget.isAlive) {
                        const actionBarPercent = currentTarget.actionBar / 10000;
                        effectScore += actionBarPercent * 20;
                    }
                }
                
                totalEffectScore += effectScore;
            });
            
            targetScore += totalEffectScore;
            return targetScore;
        };
        
        // UPDATED AOE SCORING
        if (isAOE && potentialTargets.length > 0) {
            // Calculate score for each target
            potentialTargets.forEach(t => {
                aoeScores.push(calculateEffectScoreForTarget(t));
            });
            
            // Average the scores
            const avgScore = aoeScores.reduce((sum, s) => sum + s, 0) / aoeScores.length;
            
            // NEW: Apply AOE multiplier (0.75 × number of targets)
            const aoeMultiplier = 0.75 * potentialTargets.length;
            score += avgScore * aoeMultiplier;
        } else {
            // Single target ability
            score += calculateEffectScoreForTarget(target);
        }
        
        // Special ability synergies and considerations (organized at bottom)
        if (target && target !== 'all' && target.isAlive) {
            // Blade Strike synergy with bleeding targets
            if (spell.id === 'blade_strike' && target.debuffs.some(d => d.name === 'Bleed')) {
                score += 30; // Significant bonus for 150% damage
            }
            
            // Void Strike synergy with debuffed targets
            if (spell.id === 'void_strike') {
                const debuffCount = target.debuffs ? target.debuffs.length : 0;
                score += debuffCount * 15; // Bonus per debuff since it hits multiple times
            }
            
            // Assassinate conditions (REBALANCED)
            if (spell.id === 'assassinate') {
                if ((target.currentHp / target.maxHp) < 0.3 && target.debuffs.length > 0) {
                    score += 100; // Reduced from 200
                } else {
                    score -= 50; // Reduced from 100
                }
            }
            
            // Double Shot gets bonus if target doesn't have reduce defense yet
            if (spell.id === 'double_shot' && !target.debuffs.some(d => d.name === 'Reduce Defense')) {
                score += 15; // Bonus for applying new debuff
            }
            
            // Divine Light bonus for debuffed allies
            if (spell.id === 'divine_light' && target.debuffs.length > 0) {
                score += 20; // Bonus for using on debuffed ally
            }
            
            // Hunter's Mark bonus for unmarked targets
            if (spell.id === 'hunters_mark' && !target.debuffs.some(d => d.name === 'Mark')) {
                score += 15; // Extra value for this powerful debuff combo
            }
            
            // Cheap Shot synergies
            if (spell.id === 'cheap_shot') {
                // MAJOR bonus if caster has debuffs to transfer
                if (caster.debuffs && caster.debuffs.length > 0) {
                    score += 30 * caster.debuffs.length; // +30 per debuff we can transfer
                }
                // Phantom Assassin Female - bonus if target is below 50% HP
                if (caster.phantomAssassinFemalePassive && (target.currentHp / target.maxHp) < 0.5) {
                    score += 25; // Will deal pure damage
                }
            }
            
            // Psychic Mark with Dark Arch Templar Female passive
            if (spell.id === 'psychic_mark' && caster.darkArchTemplarFemalePassive) {
                score += 10; // Extra value for applying 3 debuffs at once
            }
            
            // Protective Barrier - prefer low HP allies (uses sorted list)
            if (spell.id === 'protective_barrier') {
                const lowestHpAlly = sortedLists.alliesByHealth[0];
                if (lowestHpAlly) {
                    const hpPercent = lowestHpAlly.currentHp / lowestHpAlly.maxHp;
                    score += (1 - hpPercent) * 30; // Higher value for lower HP allies
                }
            }
            
            // NEW: Helping Hand - extremely powerful action bar fill
            if (spell.id === 'helping_hand' && target !== 'all') {
                // Huge value if target has low action bar
                const actionBarPercent = target.actionBar / 10000;
                score += (1 - actionBarPercent) * 40; // Up to +40 for empty action bar
                // Extra value if target is a high damage dealer
                const attackRank = sortedLists.alliesByAttack.indexOf(target);
                if (attackRank === 0) score += 10; // Best attacker
            }
            
            // NEW: Steal Magic - buff transfer is very powerful
            if (spell.id === 'steal_magic' && target !== 'all') {
                // Extra points for quality buffs to steal (excluding Boss buff)
                const stealableBuffs = target.countableBuffs;
                if (stealableBuffs.some(b => b.name === 'Increase Attack')) score += 10;
                if (stealableBuffs.some(b => b.name === 'Increase Speed')) score += 8;
            }
            
            // NEW: Shadowstep - triple debuff application
            if (spell.id === 'shadowstep' && target !== 'all') {
                // Bonus for applying 3 debuffs at once
                if (!target.debuffs.some(d => ['Taunt', 'Mark', 'Bleed'].includes(d.name))) {
                    score += 15; // Extra value for fresh target
                }
            }

            // Force bite and slash to target highest HP enemy
            if ((spell.id === 'bite' || spell.id === 'slash') && target !== 'all') {
                // Find highest HP enemy
                const highestHpEnemy = sortedLists.enemiesByHealth[sortedLists.enemiesByHealth.length - 1];
                
                if (highestHpEnemy) {
                    if (target === highestHpEnemy) {
                        // Massive bonus for targeting highest HP
                        score += 1000;
                    } else {
                        // Massive penalty for any other target
                        score -= 1000;
                    }
                }
            }

            // Mirror Image - high value when debuffed or low HP
            if (spell.id === 'mirror_image') {
                const debuffCount = caster.debuffs ? caster.debuffs.length : 0;
                score += debuffCount * 25; // High value for removing debuffs
                
                const hpPercent = caster.currentHp / caster.maxHp;
                if (hpPercent < 0.5) {
                    score += 40; // Extra value when low HP for dodge
                }
            }

            // Ancestral Vigor - prefer low HP allies
            if (spell.id === 'ancestral_vigor' && target !== 'all') {
                const hpPercent = target.currentHp / target.maxHp;
                score += (1 - hpPercent) * 30; // Higher value for lower HP allies
            }

            // Blood Rage - high value when multiple allies have bleed (for Warmaster synergy)
            if (spell.id === 'blood_rage' && caster.warmasterPassive) {
                const bleedingAllies = sortedLists.alliesByHealth.filter(ally => 
                    ally.debuffs && ally.debuffs.some(d => d.name === 'Bleed')
                ).length;
                score += bleedingAllies * 15;
            }

            // Thunderous Charge - bonus based on current action bar
            if (spell.id === 'thunderous_charge') {
                const actionBarPercent = caster.actionBar / 10000;
                score += actionBarPercent * 50; // Up to +50 for full action bar
            }

            // NEW: Whirling Step - value for speed buff and double attack
            if (spell.id === 'whirling_step') {
                // Extra value if caster has high damage attacks
                if (caster.source.attack > 100) {
                    score += 30; // High value for doubling strong attacks
                }
                
                // Less value if already has speed buffs
                const currentSpeedStacks = caster.buffs.filter(b => b.name === 'Increase Speed').length;
                if (currentSpeedStacks >= 2) {
                    score -= 15; // Diminishing returns
                }
            }
        }
        
        // Multi-effect ability synergies
        if (spell.id === 'rally_banner') {
            const lowActionAllies = sortedLists.alliesByActionBar.filter(a => 
                a.actionBar < 5000
            );
            score += lowActionAllies.length * 15;
        }
        
        if (spell.id === 'mass_heal') {
            const injuredAllies = sortedLists.alliesByHealth.filter(a => 
                a.currentHp < a.maxHp * 0.7
            );
            score += injuredAllies.length * 10;
        }
        
        if (spell.id === 'natures_balance') {
            const debuffedAllies = sortedLists.alliesByDebuffCount.filter(a => a.debuffs.length > 0);
            const buffedEnemies = sortedLists.enemiesByBuffCount.filter(e => e.buffs.length > 0);
            score += Math.max(debuffedAllies.length * 15, buffedEnemies.length * 15);
        }
        
        // Sanctuary - debuff conversion is unique
        if (spell.id === 'sanctuary') {
            const debuffedAllies = sortedLists.alliesByDebuffCount.filter(a => a.debuffs.length > 0);
            score += debuffedAllies.length * 20; // High value per ally that will get converted buffs
        }
        
        // Self-harm abilities
        if (spell.id === 'blood_pact') {
            score -= 20; // Penalty for self-bleed
            const tauntedEnemies = this.battle.getEnemies(caster).filter(e => 
                e.isAlive && e.debuffs.some(d => d.name === 'Taunt' && d.tauntTarget === caster)
            );
            score += tauntedEnemies.length * 10;
        }
        
        // Passive synergies
        if (caster.archSageMalePassive || caster.archSageFemalePassive) {
            if (spell.effects.some(e => e.startsWith('debuff_')) && target === caster) {
                score += 30; // Bonus for self-debuffing with Arch Sage passive
            }
        }
        
        if (spell.id === 'natures_blessing' && (caster.summonerMalePassive || caster.summonerFemalePassive)) {
            score += 15; // Extra value for enhanced version
        }
        
        if (spell.id === 'psi_shift' && caster.grandTemplarFemalePassive) {
            score += 20; // Sets to 0% instead of 25%
        }
        
        if (effects.includes('cleanse') && (caster.whiteWizardMalePassive || caster.whiteWitchFemalePassive)) {
            score += 10; // Their cleanses apply buffs
        }

        // Ancient Knowledge - very powerful buff steal
        if (spell.id === 'ancient_knowledge') {
            const buffedEnemies = sortedLists.enemiesByBuffCount.filter(e => e.countableBuffs.length > 0);
            score += buffedEnemies.length * 20; // High value per enemy with buffs
            // Extra value if allies need buffs
            const unbuffedAllies = sortedLists.alliesByHealth.filter(a => a.buffs.length === 0);
            score += unbuffedAllies.length * 10;
        }
        
        // Tribal Chant - cleanse and regen is powerful
        if (spell.id === 'tribal_chant') {
            const debuffedAllies = sortedLists.alliesByDebuffCount.filter(a => a.debuffs.length > 0);
            const injuredAllies = sortedLists.alliesByHealth.filter(a => a.currentHp < a.maxHp * 0.8);
            score += debuffedAllies.length * 15 + injuredAllies.length * 10;
        }
        
        // Master of Deception - single target buff reversal
        if (spell.id === 'master_of_deception' && target !== 'all') {
            const buffCount = target.countableBuffs ? target.countableBuffs.length : 0;
            score += buffCount * 25; // Very high value per buff to convert
        }
        
        // Eternal Winter - powerful AoE drain and shield
        if (spell.id === 'eternal_winter') {
            // Value based on enemy current HP
            let totalDrainable = 0;
            sortedLists.enemiesByHealth.forEach(enemy => {
                totalDrainable += Math.floor(enemy.maxHp * 0.1);
            });
            score += (totalDrainable / 100) * 2; // 2 points per 100 HP drained
            
            // Extra value if allies need shields
            const unshieldedAllies = sortedLists.alliesByHealth.filter(a => 
                !a.buffs || !a.buffs.some(b => b.name === 'Shield')
            );
            score += unshieldedAllies.length * 10;
        }
        
        // Test spell overrides - ALWAYS prioritize win, NEVER use lose
        if (spell.id === 'win') {
            score = 999999; // Massive positive score to ensure it's always chosen
        }

        if (spell.id === 'lose') {
            score = -999999; // Massive negative score to ensure it's never chosen
        }

        // ==== NEW ENHANCED SCORING FOR REQUESTED SPELLS ====
        
        // TIDAL SURGE - Mass action bar reset is EXTREMELY powerful
        if (spell.id === 'tidal_surge') {
            // Calculate total action bar that will be reset
            let totalActionBarToReset = 0;
            sortedLists.enemiesByActionBar.forEach(enemy => {
                totalActionBarToReset += enemy.actionBar;
            });
            
            // Each 1000 action bar reset is worth 15 points
            score += (totalActionBarToReset / 1000) * 15;
            
            // Huge bonus if multiple enemies are close to acting
            const enemiesAbove80Percent = sortedLists.enemiesByActionBar.filter(e => e.actionBar >= 8000).length;
            score += enemiesAbove80Percent * 50;
            
            // Base value for mass reset
            score += 100;
        }
        
        // REALITY TWIST - Mass buff corruption
        if (spell.id === 'reality_twist') {
            // Count total buffs across all enemies
            let totalBuffsToConvert = 0;
            sortedLists.enemiesByBuffCount.forEach(enemy => {
                totalBuffsToConvert += enemy.countableBuffs.length;
            });
            
            // Each buff converted is worth 50 points
            score += totalBuffsToConvert * 50;
            
            // Extra bonus if multiple enemies are heavily buffed
            const heavilyBuffedEnemies = sortedLists.enemiesByBuffCount.filter(e => e.countableBuffs.length >= 3).length;
            score += heavilyBuffedEnemies * 30;
        }
        
        // MASTER OF DECEPTION - Single target buff reversal (already implemented above, enhancing)
        if (spell.id === 'master_of_deception' && target !== 'all') {
            // Additional scoring for quality of buffs
            if (target.buffs.some(b => b.name === 'Immune')) score += 50;
            if (target.buffs.some(b => b.name === 'Shield')) score += 30;
            if (target.buffs.some(b => b.name === 'Increase Attack')) score += 25;
            if (target.buffs.some(b => b.name === 'Increase Speed')) score += 20;
        }
        
        // SMOKE AND MIRRORS - 50% dodge for 3 turns
        if (spell.id === 'smoke_and_mirrors') {
            const hpPercent = caster.currentHp / caster.maxHp;
            
            // High value when low HP
            if (hpPercent < 0.3) {
                score += 80;
            } else if (hpPercent < 0.5) {
                score += 60;
            } else if (hpPercent < 0.7) {
                score += 40;
            } else {
                score += 20;
            }
            
            // Extra value if debuffed
            score += caster.debuffs.length * 10;
            
            // Extra value if enemies have high attack
            if (sortedLists.enemiesByAttack.length > 0) {
                const highestAttackEnemy = sortedLists.enemiesByAttack[0];
                if (highestAttackEnemy.source.attack > 150) {
                    score += 30;
                }
            }
        }
        
        // MIRROR IMAGE - 50% physical dodge for 2 turns + cleanse + speed
        if (spell.id === 'mirror_image') {
            // Already has some scoring above, adding dodge-specific scoring
            const hpPercent = caster.currentHp / caster.maxHp;
            
            // Dodge value based on HP
            if (hpPercent < 0.4) {
                score += 50;
            } else if (hpPercent < 0.6) {
                score += 35;
            } else {
                score += 20;
            }
            
            // Extra value against physical attackers
            const physicalThreats = sortedLists.enemiesByAttack.filter(e => 
                e.source.attack > e.source.magicPower
            ).length;
            score += physicalThreats * 10;
        }
        
        // ETERNAL WINTER - HP drain to shield conversion (enhanced scoring)
        if (spell.id === 'eternal_winter') {
            // Calculate actual HP that can be drained (10% of current HP)
            let totalDrainableHP = 0;
            sortedLists.enemiesByHealth.forEach(enemy => {
                totalDrainableHP += Math.floor(enemy.currentHp * 0.1);
            });
            
            // Each 50 HP drained is worth 5 points
            score += (totalDrainableHP / 50) * 5;
            
            // Bonus if allies are low HP and need shields
            const lowHpAlliesNeedingShields = sortedLists.alliesByHealth.filter(ally => 
                (ally.currentHp / ally.maxHp) < 0.5 && !ally.buffs.some(b => b.name === 'Shield')
            ).length;
            score += lowHpAlliesNeedingShields * 25;
        }
        
        // PSYCHIC STORM - 30% missing HP damage to all enemies
        if (spell.id === 'psychic_storm') {
            // Calculate total missing HP damage
            let totalMissingHpDamage = 0;
            sortedLists.enemiesByHealth.forEach(enemy => {
                const missingHp = enemy.maxHp - enemy.currentHp;
                const damage = missingHp * 0.3;
                totalMissingHpDamage += damage;
                
                // Bonus for potential kills
                if (damage >= enemy.currentHp) {
                    score += 50;
                }
            });
            
            // Score based on total damage potential
            score += (totalMissingHpDamage / enemy.maxHp) * 100;
            
            // Extra value when multiple enemies are injured
            const injuredEnemies = sortedLists.enemiesByHealth.filter(e => 
                (e.currentHp / e.maxHp) < 0.6
            ).length;
            score += injuredEnemies * 20;
        }
        
        // CORPSE EXPLOSION - AOE damage based on missing HP
        if (spell.id === 'corpse_explosion') {
            // Calculate damage for each enemy
            let totalDamage = 0;
            let killCount = 0;
            
            sortedLists.enemiesByHealth.forEach(enemy => {
                const missingHp = enemy.maxHp - enemy.currentHp;
                const damage = 50 + (missingHp * 0.2); // Base 50 + 20% missing HP
                totalDamage += damage;
                
                // Check for kills
                if (damage >= enemy.currentHp) {
                    killCount++;
                    score += 40; // Bonus per kill
                }
            });
            
            // Score based on average damage per enemy
            const avgDamagePercent = (totalDamage / sortedLists.aliveEnemiesCount) / 
                                   (sortedLists.enemiesByHealth[0]?.maxHp || 100) * 100;
            score += avgDamagePercent * 1.5;
            
            // Extra bonus for multi-kills
            if (killCount >= 2) score += 30;
            if (killCount >= 3) score += 50;
        }
        
        // FIRE DANCE - Next attack becomes AOE
        if (spell.id === 'fire_dance') {
            // Value based on caster's attack power
            const attackPower = caster.source.attack;
            
            // Base value for making next attack AOE
            score += 30;
            
            // Scale with attack power
            if (attackPower > 200) {
                score += 40;
            } else if (attackPower > 150) {
                score += 30;
            } else if (attackPower > 100) {
                score += 20;
            } else {
                score += 10;
            }
            
            // Bonus based on enemy count
            score += sortedLists.aliveEnemiesCount * 10;
            
            // Extra value if caster's next likely ability is a strong single target attack
            const nextLikelyAbility = caster.abilities.find(a => !a.passive && a.cooldown === 0);
            if (nextLikelyAbility && spellManager.getSpell(nextLikelyAbility.id)?.effects?.includes('physical')) {
                score += 20;
            }
        }
        
        // WHIRLING STEP - Next attack hits twice (already has some scoring above)
        if (spell.id === 'whirling_step') {
            // Additional scoring based on what the next attack might be
            const attackPower = caster.source.attack;
            
            // Value of doubling next attack
            if (attackPower > 200) {
                score += 35;
            } else if (attackPower > 150) {
                score += 25;
            } else {
                score += 15;
            }
            
            // Check if any enemy is low HP (double attack could secure kill)
            const lowHpEnemies = sortedLists.enemiesByHealth.filter(e => 
                (e.currentHp / e.maxHp) < 0.3
            ).length;
            score += lowHpEnemies * 15;
        }
        
        // HUNTER'S FOCUS - Next attack deals double damage
        if (spell.id === 'hunters_focus') {
            const attackPower = caster.source.attack;
            
            // Base value for doubling damage
            score += 40;
            
            // Scale with attack power
            if (attackPower > 200) {
                score += 40;
            } else if (attackPower > 150) {
                score += 30;
            } else if (attackPower > 100) {
                score += 20;
            }
            
            // Check for potential one-shot kills with double damage
            sortedLists.enemiesByHealth.forEach(enemy => {
                // Estimate if double damage could kill
                const estimatedDamage = attackPower * 2 * 2; // Rough estimate
                if (estimatedDamage >= enemy.currentHp) {
                    score += 30;
                }
            });
            
            // Less value if already has attack buffs (diminishing returns)
            if (caster.buffs.some(b => b.name === 'Increase Attack')) {
                score -= 10;
            }
        }

        // Add small random noise (-1.5 to +1.5)
        const noise = (Math.random() - 0.5) * 3;
        return score + noise;
    }
}
