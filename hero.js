// Hero Class
        class Hero {
            constructor(className = null) {
    
    // Determine gender from className if provided, otherwise random
    if (className) {
        // Extract gender from className (all class names end with _male or _female)
        if (className.includes('_male')) {
            this.gender = 'male';
        } else if (className.includes('_female')) {
            this.gender = 'female';
        } else {
            // Fallback to random if className doesn't contain gender
            this.gender = Math.random() < 0.5 ? 'male' : 'female';
        }
        this.className = className;
    } else {
        // No className provided, assign random gender and create villager class
        this.gender = Math.random() < 0.5 ? 'male' : 'female';
        this.className = `villager_${this.gender}`;
    }
    this.name = this.generateName();
    this.level = 5;
    this.exp = 0;
    this.expToNext = this.calculateExpToNext();
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
    this.awakened = false;
    
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

    // Override with class-specific initial values if they exist
    if (this.classData.initial) {
        Object.assign(this.initial, this.classData.initial);
    }
    
    this.abilities = this.getClassAbilities();
    this.pendingExp = 0;


}

            generateName() {
                const maleNames = ['Aelar', 'Brin', 'Dain', 'Finn', 'Hal', 'Kael', 'Liam', 'Magnus', 
                                   'Nolan', 'Owen', 'Quinn', 'Rowan', 'Soren', 'Thane', 'Ulric', 'Viktor'];
                const femaleNames = ['Aria', 'Cara', 'Eira', 'Gwen', 'Ivy', 'Jade', 'Kira', 'Luna', 
                                     'Maya', 'Nova', 'Ophelia', 'Piper', 'Rose', 'Sage', 'Tara', 'Vera'];
                
                const nameList = this.gender === 'male' ? maleNames : femaleNames;
                return nameList[Math.floor(Math.random() * nameList.length)];
            }

            get classData() {
                return unitData?.classes[this.className] || {
                    name: this.className,
                    tier: 0,
                    modifiers: { str: 1, agi: 1, int: 1 },
		    initial: {},
                    spells: []
                };
            }

            get displayClassName() {
                // Now the display name is directly in the unit data
                return this.classData.name || this.className;
            }

            get classTier() {
                return this.classData.tier;
            }

get spellLevel() {
    // Check for override first
    if (this._overrideSpellLevel !== undefined) {
        return this._overrideSpellLevel;
    }
    // Implementation varies based on class tier and awakened status
    if (this.classTier === 0) return 1;
    if (this.classTier === 1) return 1;
    if (this.classTier === 2) return 2;
    if (this.classTier === 3) return 3;
    if (this.classTier === 4 && !this.awakened) return 4;
    if (this.classTier === 4 && this.awakened) return 5;
    return 1;
}

set spellLevel(value) {
    this._overrideSpellLevel = value;
}

get baseStats() {
    const mods = this.classData.modifiers;
    const str = Math.floor(this.initial.str + (this.level * mods.str));
    const agi = Math.floor(this.initial.agi + (this.level * mods.agi));
    const int = Math.floor(this.initial.int + (this.level * mods.int));
    
    // Get the mainstat value for attack calculation
    const mainstat = this.classData.mainstat || 'str';
    const mainstatValue = mainstat === 'str' ? str : (mainstat === 'agi' ? agi : int);
    
    return {
        str: str,
        agi: agi,
        int: int,
        hp: Math.floor(this.initial.hp + (str * mods.hp)),
        hpRegen: this.initial.hpRegen + (str * 0.01),
        attack: Math.floor(this.initial.attack + (mainstatValue * mods.attack)),
        attackSpeed: this.initial.attackSpeed + (100 + 100 * (agi / (agi + 1000))),
        armor: Math.floor(this.initial.armor + (mods.armor * this.level) + (0.05 * str) + (0.01 * agi)),
        resist: Math.floor(this.initial.resist + (mods.resist * this.level) + (0.05 * int))
    };
}
            
            getStars() {
                return game.generateStars({ 
                    type: 'hero', 
                    classTier: this.classTier, 
                    awakened: this.awakened 
                });
            }

            get totalStats() {
                const base = this.baseStats;
                return {
                    str: base.str + this.gearStats.str,
                    agi: base.agi + this.gearStats.agi,
                    int: base.int + this.gearStats.int
                };
            }

get hp() {
    return Math.floor(this.baseStats.hp + this.gearStats.hp);
}

get attack() {
    return Math.floor(this.baseStats.attack + this.gearStats.attack);
}

get mainstat() {
    return this.classData.mainstat || 'str';
}
		
get hpRegen() {
    return this.baseStats.hpRegen + this.gearStats.hpRegen;
}

get actionBarSpeed() {
    return this.baseStats.attackSpeed + this.gearStats.attackSpeed;
}
			
get armor() {
    return Math.floor(this.baseStats.armor + this.gearStats.armor);
}

get resist() {
    return Math.floor(this.baseStats.resist + this.gearStats.resist);
}

get physicalDamageReduction() {
    const totalArmor = this.armor;
    return (0.9 * totalArmor) / (totalArmor + 500);
}

get magicDamageReduction() {
    const totalResist = this.resist;
    return (0.3 * totalResist) / (totalResist + 1000);
}

            getClassAbilities() {
    const classInfo = this.classData;
    const abilities = [];
    
    if (!classInfo.spells || classInfo.spells.length === 0) {
        return abilities;
    }
    
    // Get spell data from manager
    const spellIds = classInfo.spells;
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

            calculateExpToNext() {
                // Scaling should be a mix of linear and parabolic
                // Getting to level 450 is the same exp as getting to level 500
                if (this.level >= 500) return 0;
                
                const baseExp = 1000;
                const linearComponent = this.level * 100;
                const parabolicComponent = Math.pow(this.level, 1.8) * 10;
                
                return Math.floor(baseExp + linearComponent + parabolicComponent);
            }

            canPromote() {
    const promoteLevels = { 0: 50, 1: 100, 2: 200, 3: 300, 4: 400 };
    // For tier 4, check if trying to awaken
    if (this.classTier === 4 && !this.awakened) {
        return this.level >= 400;
    }
    return this.level >= (promoteLevels[this.classTier] || 999);
}

getPromotionOptions() {
    const classInfo = this.classData;
    
    // Special case for Awakening at Class 4
    if (this.classTier === 4 && !this.awakened) {
        return ['Awaken'];
    }
    
    return classInfo.promotesTo || [];
}
		
            promote(newClass) {
    // Special case for Awakening
    if (newClass === 'Awaken' && this.classTier === 4 && this.level >= 400) {
        this.awakened = true;
        // Don't reset level for awakening
        this.abilities = this.getClassAbilities();
        return true;
    }
    
    if (!this.canPromote() || !this.getPromotionOptions().includes(newClass)) {
        return false;
    }
    
    this.className = newClass;
    this.level = 10 * this.classTier;
    this.exp = 0;
    this.expToNext = this.calculateExpToNext();
    
    // Update initial stats to match the new class
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
    
    // Override with new class-specific initial values if they exist
    if (this.classData.initial) {
        Object.assign(this.initial, this.classData.initial);
    }
    
    this.abilities = this.getClassAbilities();
    return true;
}
            
equipItem(item, slot) {
    if (!item || item.slot !== slot) return false;
    
    // Villagers can only equip items level 60 and below
    if ((this.className.includes('villager') || this.className.includes('tester')) && item.level > 70) {
        alert('Villagers can only equip items level 70 and below!');
        return false;
    }
    
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
                const mods = this.classData.modifiers;
                const mainstat = this.classData.mainstat || 'str';
                
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
