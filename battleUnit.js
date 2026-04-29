// battleUnit.js - Battle Unit class for TEVE

class BattleUnit {
    constructor(source, isEnemy = false, position = 0) {
        this.source = source; // Reference to Hero or Enemy object
        this.isEnemy = isEnemy;
        this.position = position;
        
        // Battle stats - ensure proper initialization
        this.currentHp = this.maxHp;
        this.actionBar = 0;
        this.buffs = [];
        this.debuffs = [];
        this.cooldowns = {};
        this.isDead = false; // Explicitly set to false at start
        this.deathAnimated = false; // Track if death animation has been played
        this.uiInitialized = false; // Track if UI has been created
        
        // Initialize cooldowns
        const abilities = this.abilities;
        if (abilities && abilities.length > 0) {
            abilities.forEach((ability, index) => {
                if (ability.cooldown > 0) {
                    this.cooldowns[index] = 0;
                }
            });
        }
    }
    
    get name() {
        return this.source.name;
    }
    
    get maxHp() {
        return this.isEnemy ? this.source.hp : this.source.hp;
    }
    
    get stats() {
        return this.isEnemy ? this.source.baseStats : this.source.totalStats;
    }

    get armor() {
        if (this.isEnemy) {
            return this.source.armor;
        } else {
            return this.source.armor;
        }
    }

    get resist() {
        if (this.isEnemy) {
            return this.source.resist;
        } else {
            return this.source.resist;
        }
    }

    get physicalDamageReduction() {
        const totalArmor = this.armor;
        return (0.9 * totalArmor) / (totalArmor + 500);
    }

    get magicDamageReduction() {
        const totalResist = this.resist;
        return (0.3 * totalResist) / (totalResist + 1000);
    }
    
    get actionBarSpeed() {
        const agi = this.stats.agi;
        // DOUBLED action bar speed
        let speed = this.isEnemy ? 200 + 200 * (agi / (agi + 1000)) : this.source.actionBarSpeed * 2;
        
        // Apply buffs/debuffs
        this.buffs.forEach(buff => {
            if (buff.actionBarMultiplier) {
                speed *= buff.actionBarMultiplier;
            }
        });
        
        this.debuffs.forEach(debuff => {
            if (debuff.actionBarSpeed) {
                speed *= debuff.actionBarSpeed;
            }
        });
        
        return speed;
    }
    
    get isAlive() {
        return this.currentHp > 0 && !this.isDead;
    }
    
    get abilities() {
        return this.source.abilities || [];
    }
    
    get countableBuffs() {
        return this.buffs.filter(b => b.name !== 'Boss');
    }
    
    get spellLevel() {
        return this.source.spellLevel || 1;
    }

    get currentShield() {
        const shieldBuff = this.buffs.find(b => b.name === 'Shield');
        return shieldBuff ? shieldBuff.shieldAmount : 0;
    }
    
    canUseAbility(abilityIndex) {
        const ability = this.abilities[abilityIndex];
        if (!ability) return false;
        
        // Check cooldown
        if (this.cooldowns[abilityIndex] > 0) return false;
        
        // Check if stunned
        if (this.debuffs.some(d => d.stunned)) return false;
        
        return true;
    }
    
    useAbility(abilityIndex) {
        const ability = this.abilities[abilityIndex];
        if (!ability || !this.canUseAbility(abilityIndex)) return false;
        
        // Set cooldown
        if (ability.cooldown > 0) {
            this.cooldowns[abilityIndex] = ability.cooldown;
        }
        
        return true;
    }
    
    reduceCooldowns() {
        Object.keys(this.cooldowns).forEach(key => {
            if (this.cooldowns[key] > 0) {
                this.cooldowns[key]--;
            }
        });
    }
    
    updateBuffsDebuffs() {
        // Store if unit was stunned before update
        const wasStunned = this.debuffs.some(d => d.name === 'Stun' || d.stunned);
        
        // Simple duration reduction - decrement all durations by 1
        this.buffs = this.buffs.filter(buff => {
            if (buff.duration > 0) {
                buff.duration--;
                return buff.duration > 0;
            }
            return buff.duration === -1; // Permanent buffs
        });
        
        this.debuffs = this.debuffs.filter(debuff => {
            if (debuff.duration > 0) {
                debuff.duration--;
                return debuff.duration > 0;
            }
            return debuff.duration === -1; // Permanent debuffs
        });
        
        // Check if stun status changed
        const isStunned = this.debuffs.some(d => d.name === 'Stun' || d.stunned);
        if (wasStunned !== isStunned) {
            // Find the battle instance and update stun visuals
            if (this.battle && this.battle.animations) {
                this.battle.animations.updateStunVisuals(this);
            }
        }
    }
}
