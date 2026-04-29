// Enemy Class
class Enemy {
    constructor(enemyId, level, spellLevel = null) {
        this.enemyId = enemyId;
        this.level = level;
        this.spellLevel = spellLevel || Math.max(1, Math.min(5, Math.floor(level / 100) + 1));
        this.stars = this.calculateStars(level);

	// Add awakened property for tier 4 enemies
        this.awakened = false;
        
        // Add gear system
        this.gear = {
            head: null,
            chest: null,
            legs: null,
            weapon: null,
            offhand: null,
            trinket: null
        };
        this.gearStats = { 
            str: 0, 
            agi: 0, 
            int: 0,
            hp: 0,
            armor: 0,
            resist: 0,
            hpRegen: 0,
            attack: 0,
            attackSpeed: 0
        };
                
        // Try to load from enemies first, then classes
        let enemyData = unitData?.enemies[enemyId];
        let isHeroLike = false;
        
        if (!enemyData) {
            // Try loading from classes (for arena enemies)
            enemyData = unitData?.classes[enemyId];
            isHeroLike = true;
        }

	this.isHeroLike = isHeroLike;
        
        if (enemyData) {
            this.name = enemyData.name;
            this.isBoss = enemyData.boss || false;
            this.modifiers = enemyData.modifiers;
            this._mainstat = enemyData.mainstat || 'str';
            this.className = isHeroLike ? enemyId : null;
            
            // Add default initial values
            this.initial = {
                hp: 0,
                hpRegen: 0,
                attack: 0,
                attackSpeed: 0,
                str: 0,
                agi: 0,
                int: 0,
                armor: 0,
                resist: 0
            };

            // Override with enemy-specific initial values if they exist
            if (enemyData && enemyData.initial) {
                Object.assign(this.initial, enemyData.initial);
            }
            
            // Get abilities based on type
            if (isHeroLike) {
                this.abilities = this.getClassAbilities(enemyData.spells);
            } else {
                this.abilities = this.getAbilities(enemyData.spells);
            }
        } else {
            // Fallback values
            this.name = enemyId;
            this.isBoss = false;
            this.modifiers = { str: 1.0, agi: 1.0, int: 1.0 };
            this.abilities = [];
            this._mainstat = 'str';
            this.className = null;
                    
                    // Default initial values
                    this.initial = {
                        hp: 0,
                        hpRegen: 0,
                        attack: 0,
                        attackSpeed: 0,
                        str: 0,
                        agi: 0,
                        int: 0,
                        armor: 0,
                        resist: 0
                    };
                }
            }

            calculateStars(level) {
                if (level < 50) return 1;
                if (level < 100) return 2;
                if (level < 200) return 3;
                if (level < 300) return 4;
                if (level < 400) return 5;
                if (level < 500) return 6;
                if (level < 800) return 7;
                return 8;
            }
            
            getStars() {
    // For hero-like enemies, we need to pass classTier
    if (this.isHeroLike) {
        const classData = unitData?.classes[this.className];
        return game.generateStars({ 
            type: 'enemy',
            isHeroLike: true,
            classTier: classData?.tier || 0,
            awakened: this.awakened
        });
    } else {
        return game.generateStars({ 
            type: 'enemy', 
            level: this.level, 
            isBoss: this.isBoss
        });
    }
}

get baseStats() {
    const str = Math.floor(this.initial.str + (this.level * this.modifiers.str));
    const agi = Math.floor(this.initial.agi + (this.level * this.modifiers.agi));
    const int = Math.floor(this.initial.int + (this.level * this.modifiers.int));
    
    // Get the mainstat value for attack calculation
    const mainstatValue = this.mainstat === 'str' ? str : (this.mainstat === 'agi' ? agi : int);
    
    return {
        str: str,
        agi: agi,
        int: int,
        hp: Math.floor(this.initial.hp + (str * this.modifiers.hp)),
        hpRegen: this.initial.hpRegen + (str * 0.01),
        attack: Math.floor(this.initial.attack + (mainstatValue * this.modifiers.attack)),
        attackSpeed: this.initial.attackSpeed + (100 + 100 * (agi / (agi + 1000))),
        armor: Math.floor(this.initial.armor + (this.modifiers.armor * this.level) + (0.05 * str) + (0.01 * agi)),
        resist: Math.floor(this.initial.resist + (this.modifiers.resist * this.level) + (0.05 * int))
    };
}

	get totalStats() {
    const base = this.baseStats;
    return {
        str: base.str + this.gearStats.str,
        agi: base.agi + this.gearStats.agi,
        int: base.int + this.gearStats.int
    };
}

get mainstat() {
    return this._mainstat || 'str';
}

	get hp() {
    return Math.floor(this.baseStats.hp + this.gearStats.hp);
}

get attack() {
    return Math.floor(this.baseStats.attack + this.gearStats.attack);
}
		
get armor() {
    return Math.floor(this.baseStats.armor + this.gearStats.armor);
}

get resist() {
    return Math.floor(this.baseStats.resist + this.gearStats.resist);
}

get hpRegen() {
    return this.baseStats.hpRegen + this.gearStats.hpRegen;
}

get actionBarSpeed() {
    return this.baseStats.attackSpeed + this.gearStats.attackSpeed;
}

get physicalDamageReduction() {
    const totalArmor = this.armor;
    return (0.9 * totalArmor) / (totalArmor + 500);
}

get magicDamageReduction() {
    const totalResist = this.resist;
    return (0.3 * totalResist) / (totalResist + 1000);
}

            getAbilities(spellIds) {
    if (!spellIds || !spellManager) return [];
    
    const abilities = [];
    const spells = spellManager.getSpellsByIds(spellIds);
    
    spells.forEach((spell, index) => {
    if (spell) {
        // Get the correct cooldown for this spell level
        let cooldownValue = 0;
        if (Array.isArray(spell.cooldown)) {
            const cooldownIndex = Math.max(0, Math.min(4, this.spellLevel - 1));
            cooldownValue = spell.cooldown[cooldownIndex] || spell.cooldown[0];
        } else {
            cooldownValue = spell.cooldown || 0;
        }
        
        abilities.push({
            id: spell.id,
            name: spell.name,
            description: spell.description,
            cooldown: cooldownValue,
            currentCooldown: 0,
            level: this.spellLevel,
            icon: `${spell.id}.png`,
            effects: spell.effects,
            passive: spell.passive || false
        });
    }
});
    
    return abilities;
}

equipItem(item, slot) {
    if (!item || item.slot !== slot) return false;
    
    // Unequip current item if any
    if (this.gear[slot]) {
        this.unequipItem(slot);
    }
    
    // Equip new item
    this.gear[slot] = item;
    
    // Update gear stats
    this.updateGearStats();
    
    return true;
}

unequipItem(slot) {
    const item = this.gear[slot];
    if (!item) return null;
    
    this.gear[slot] = null;
    this.updateGearStats();
    
    return item;
}

updateGearStats() {
    // Reset gear stats
    this.gearStats = {
        str: 0,
        agi: 0,
        int: 0,
        hp: 0,
        armor: 0,
        resist: 0,
        hpRegen: 0,
        attack: 0,
        attackSpeed: 0,
    };
    
    // First pass: Add direct stats from all equipped items
    Object.values(this.gear).forEach(item => {
        if (item) {
            const itemStats = item.getStats();
            Object.keys(itemStats).forEach(stat => {
                this.gearStats[stat] += itemStats[stat];
            });
        }
    });
    
    // Second pass: Add derived stats from gear STR/AGI/INT
    const mods = this.modifiers;
    const mainstat = this.mainstat;
    
    // Store the direct stat values before adding derived bonuses
    const gearStr = this.gearStats.str;
    const gearAgi = this.gearStats.agi;
    const gearInt = this.gearStats.int;
    
    // Add derived bonuses from gear primary stats
    this.gearStats.hp += Math.floor(gearStr * mods.hp);
    this.gearStats.hpRegen += gearStr * 0.01;
    this.gearStats.armor += Math.floor((gearStr * 0.05) + (gearAgi * 0.01));
    this.gearStats.resist += Math.floor(gearInt * 0.05);
    
    // Add attack bonus from gear mainstat
    if (mainstat === 'str') {
        this.gearStats.attack += Math.floor(gearStr * mods.attack);
    } else if (mainstat === 'agi') {
        this.gearStats.attack += Math.floor(gearAgi * mods.attack);
    } else if (mainstat === 'int') {
        this.gearStats.attack += Math.floor(gearInt * mods.attack);
    }
    
    // Add attack speed bonus from gear AGI (using the same formula as baseStats)
    this.gearStats.attackSpeed += 100 * (gearAgi / (gearAgi + 1000));
}

getClassAbilities(spellIds) {
    const abilities = [];
    
    if (!spellIds || spellIds.length === 0) {
        return abilities;
    }
    
    // Get spell data from manager
    const spells = spellManager ? spellManager.getSpellsByIds(spellIds) : [];
    
    // Use the spellLevel property
    const abilityLevel = this.spellLevel;
    
    // Add abilities from spell list
    spells.forEach((spell, index) => {
        if (spell) {
            // Skip the 4th spell (index 3) if not awakened
            if (index === 3 && !this.awakened) {
                return; // Skip the 4th ability
            }
            
            // Get the correct cooldown for this spell level
            let cooldownValue = 0;
            if (Array.isArray(spell.cooldown)) {
                const cooldownIndex = Math.max(0, Math.min(4, abilityLevel - 1));
                cooldownValue = spell.cooldown[cooldownIndex] || spell.cooldown[0];
            } else {
                cooldownValue = spell.cooldown || 0;
            }
            
            const ability = {
                id: spell.id,
                name: spell.name,
                cooldown: cooldownValue,
                currentCooldown: 0,
                level: abilityLevel,
                description: spell.description,
                icon: `${spell.id}.png`,
                effects: spell.effects,
                passive: spell.passive || false
            };
            
            abilities.push(ability);
        }
    });
                
    return abilities;
}
	
getGearScore() {
    let totalScore = 0;
    const slots = ['trinket', 'head', 'weapon', 'chest', 'offhand', 'legs'];
    
    slots.forEach(slot => {
        if (this.gear[slot]) {
            totalScore += this.gear[slot].getItemScore();
        }
    });
    
    return totalScore;
}

	
}
