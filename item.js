// Item class
class Item {
    constructor(itemId, skipRoll = false) {
        const template = itemData.items[itemId];
        if (!template) {
            console.error(`Item template not found: ${itemId}`);
            return;
        }
        
        //console.log(`Creating item: ${itemId}`);
        
        this.id = itemId;
        
        // Always load these from template - never save them
        this.name = template.name;
        this.slot = template.slot;
        this.level = template.level;
        this.sellcost = template.sellcost;
        this.logicKey = template.logicKey;
        
        // Initialize quality rolls (1-5)
        this.quality1 = 0;
        this.quality2 = 0;
        this.quality3 = 0;
        this.quality4 = 0;
	this.quality5 = 0;
	this.refined = false; // +5 all stats after refining a perfect item
        
        // Stats this item can roll - always from template
        this.roll1 = template.roll1;
        this.roll2 = template.roll2;
        this.roll3 = template.roll3;
        this.roll4 = template.roll4;
	this.roll5 = null; // +5 all stats after refining a perfect item
        
        // Max values for each roll - always from template
        this.value1 = template.value1 || Math.floor(this.level / 2);
        this.value2 = template.value2 || Math.floor(this.level / 2);
        this.value3 = template.value3 || Math.floor(this.level / 2);
        this.value4 = template.value4 || Math.floor(this.level / 2);
	this.value5 = 5; // + 5 all stats after refining a perfect item
        
// Store collection bonuses if provided (only for new drops)
this.collectionBonuses = null;

// Only roll if not loading from save
if (!skipRoll) {
    this.rollItem();
}
        
        //console.log(`Item created: ${this.name} (${this.getRarity()}) - Quality: ${this.getQualityPercent()}%`);
    }
    
rollItem(collectionBonuses = null) {
    // Store collection bonuses if provided
    if (collectionBonuses) {
        this.collectionBonuses = collectionBonuses;
    }
    
    // First roll is guaranteed, rolls 1-5 quality
    this.quality1 = Math.floor(Math.random() * 5) + 1;
	
    // Apply collection bonus to quality1 if available
    if (this.collectionBonuses && this.collectionBonuses.quality1Bonus) {
        this.quality1 = Math.min(5, this.quality1 + this.collectionBonuses.quality1Bonus);
    }
    
    //console.log(`  Roll 1 (${this.roll1}): ${this.quality1}/5`);
    
    // Check for additional roll chance from collection
    let bonusRollChance = 0;
    if (this.collectionBonuses && this.collectionBonuses.globalDropBonus) {
        bonusRollChance = this.collectionBonuses.globalDropBonus;
    }
    
    // Second roll has 45% chance + collection bonus
    if (this.roll2 && Math.random() < (0.45 + bonusRollChance)) {
        this.quality2 = Math.floor(Math.random() * 5) + 1;
        
        // Apply collection bonus to quality2 if available
        if (this.collectionBonuses && this.collectionBonuses.quality2Bonus) {
            this.quality2 = Math.min(5, this.quality2 + this.collectionBonuses.quality2Bonus);
        }
        
        //console.log(`  Roll 2 (${this.roll2}): ${this.quality2}/5`);
        
        // Third roll has 40% chance + collection bonus (only if got second and roll3 exists)
        if (this.roll3 && Math.random() < (0.4 + bonusRollChance)) {
            this.quality3 = Math.floor(Math.random() * 5) + 1;
            
            // Apply collection bonus to quality3 if available
            if (this.collectionBonuses && this.collectionBonuses.quality3Bonus) {
                this.quality3 = Math.min(5, this.quality3 + this.collectionBonuses.quality3Bonus);
            }
            
            //console.log(`  Roll 3 (${this.roll3}): ${this.quality3}/5`);
            
            // Fourth roll has 35% chance + collection bonus (only if third and roll4 exists)
            if (this.roll4 && Math.random() < (0.35 + bonusRollChance)) {
                this.quality4 = Math.floor(Math.random() * 5) + 1;
                
                // Apply collection bonus to quality4 if available
                if (this.collectionBonuses && this.collectionBonuses.quality4Bonus) {
                    this.quality4 = Math.min(5, this.quality4 + this.collectionBonuses.quality4Bonus);
                }
                
                //console.log(`  Roll 4 (${this.roll4}): ${this.quality4}/5`);
            }
        }
    }
}

// Create an item with fixed quality values
setFixedQuality(quality1 = 1, quality2 = 0, quality3 = 0, quality4 = 0, quality5 = 0) {
    this.quality1 = quality1;
    this.quality2 = quality2;
    this.quality3 = quality3;
    this.quality4 = quality4;
    this.quality5 = quality5;
    console.log(`Fixed quality item created: ${this.name} (${this.getRarity()}) - Quality: ${this.getQualityPercent()}%`);
}
	
    getRarity() {
	if (this.quality5 > 0) return 'gold';
        if (this.quality4 > 0) return 'red';
        if (this.quality3 > 0) return 'purple';
        if (this.quality2 > 0) return 'blue';
        return 'green';
    }
    
    getQualityPercent() {
    // Calculate quality based on average of existing rolls
    let totalQuality = 0;
    let rollCount = 0;
    
    if (this.quality1 > 0) {
        totalQuality += this.quality1;
        rollCount++;
    }
    if (this.quality2 > 0) {
        totalQuality += this.quality2;
        rollCount++;
    }
    if (this.quality3 > 0) {
        totalQuality += this.quality3;
        rollCount++;
    }
    if (this.quality4 > 0) {
        totalQuality += this.quality4;
        rollCount++;
    }
    if (this.quality5 > 0) {  // Add this block
        totalQuality += this.quality5;
        rollCount++;
    }
    
    if (rollCount === 0) return 0;
    
    // Calculate average quality (1-5) and convert to percentage
    const averageQuality = totalQuality / rollCount;
    return Math.floor((averageQuality / 5) * 100);
}
    
getStats() {
    const stats = {
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
    
    // Process each roll with its quality percentage
    if (this.quality1 > 0) {
        const value = Math.floor(this.value1 * (this.quality1 / 5));
        this.applyStatValue(stats, this.roll1, value);
    }
    if (this.quality2 > 0) {
        const value = Math.floor(this.value2 * (this.quality2 / 5));
        this.applyStatValue(stats, this.roll2, value);
    }
    if (this.quality3 > 0) {
        const value = Math.floor(this.value3 * (this.quality3 / 5));
        this.applyStatValue(stats, this.roll3, value);
    }
    if (this.quality4 > 0) {
        const value = Math.floor(this.value4 * (this.quality4 / 5));
        this.applyStatValue(stats, this.roll4, value);
    }
    if (this.quality5 > 0) {  // Add this block for 5th roll
        // 5th roll is always allstats with value 10
        stats.str += 10;
        stats.agi += 10;
        stats.int += 10;
    }
    
    return stats;
}

getStars() {
    let starCount = 0;
    
    // Count 5/5 quality rolls only
    if (this.quality1 === 5) starCount++;
    if (this.quality2 === 5) starCount++;
    if (this.quality3 === 5) starCount++;
    if (this.quality4 === 5) starCount++;
    if (this.quality5 === 5) starCount++;
    
    // Stars color matches item rarity
    const rarity = this.getRarity();
    let colorClass;
    switch(rarity) {
        case 'gold':
            colorClass = 'gold';
            break;
        case 'red':
            colorClass = 'red';
            break;
        case 'purple':
            colorClass = 'purple';
            break;
        case 'blue':
            colorClass = 'blue';
            break;
        case 'green':
        default:
            colorClass = 'green';
            break;
    }
    
    const stars = '★'.repeat(starCount);
    
    return {
        count: starCount,
        html: stars,
        colorClass: colorClass,
        fullHtml: stars ? `<span class="itemStars ${colorClass}">${stars}</span>` : ''
    };
}
	
    applyStatValue(stats, rollType, value) {
        switch(rollType) {
            case 'str':
                stats.str += value;
                break;
            case 'agi':
                stats.agi += value;
                break;
            case 'int':
                stats.int += value;
                break;
            case 'allstats':
                // All stats get same value (no doubling)
                stats.str += value;
                stats.agi += value;
                stats.int += value;
                break;
            case 'hp':
                stats.hp += value;
                break;
            case 'armor':
                stats.armor += value;
                break;
            case 'resist':
                stats.resist += value;
                break;
            case 'hpRegen':
                stats.hpRegen += value * 0.1;
                break;
	    case 'attack':
		stats.attack += value;
		break;
            case 'attackSpeed':
                stats.attackSpeed += value;
                break;
        }
    }
    
getTooltip(showMax = false) {
    const stats = this.getStats();
    const rarity = this.getRarity();
    const starData = this.getStars();
    
    let tooltip = `<div class="itemTooltip ${rarity}">`;
    tooltip += `<div class="itemName">${this.name}${this.refined ? '<span style="float: right; font-size: 16px;">*</span>' : ''}</div>`;
	
// Level on its own line
tooltip += `<div class="itemLevelText">Level ${this.level}</div>`;

const itemScore = this.getItemScore();
tooltip += `<div class="itemScoreText">Score: ${itemScore}</div>`;

// Quality
tooltip += `<div class="itemQualityText">Quality: ${this.getQualityPercent()}%</div>`;
    
// Stars if they exist
if (starData.html) {
    tooltip += `<div class="itemStarsInline ${rarity}">${starData.html}</div>`;
}
    
    // Always show divider line
    tooltip += `<div class="itemDivider"></div>`;
    
    // Show item image if available
    tooltip += `<div class="itemImage"><img src="https://puzzle-drops.github.io/TEVE/img/items/${this.id}.png" alt="${this.name}" onerror="this.style.display='none'"></div>`;
    
// Always show quality%, but only show range if alt is held
if (this.quality1 > 0) {
    const value = Math.floor(this.value1 * (this.quality1 / 5));
    const qualityPercent = Math.round((this.quality1 / 5) * 100);
    const rangeInfo = showMax ? {
        min: Math.floor(this.value1 * 0.2), // 1/5 = 20%
        max: this.value1
    } : null;
    tooltip += this.getStatLine(this.roll1, value, qualityPercent, rangeInfo, rarity);
}
if (this.quality2 > 0) {
    const value = Math.floor(this.value2 * (this.quality2 / 5));
    const qualityPercent = Math.round((this.quality2 / 5) * 100);
    const rangeInfo = showMax ? {
        min: Math.floor(this.value2 * 0.2), // 1/5 = 20%
        max: this.value2
    } : null;
    tooltip += this.getStatLine(this.roll2, value, qualityPercent, rangeInfo, rarity);
}
if (this.quality3 > 0) {
    const value = Math.floor(this.value3 * (this.quality3 / 5));
    const qualityPercent = Math.round((this.quality3 / 5) * 100);
    const rangeInfo = showMax ? {
        min: Math.floor(this.value3 * 0.2),
        max: this.value3
    } : null;
    tooltip += this.getStatLine(this.roll3, value, qualityPercent, rangeInfo, rarity);
}
if (this.quality4 > 0) {
    const value = Math.floor(this.value4 * (this.quality4 / 5));
    const qualityPercent = Math.round((this.quality4 / 5) * 100);
    const rangeInfo = showMax ? {
        min: Math.floor(this.value4 * 0.2),
        max: this.value4
    } : null;
    tooltip += this.getStatLine(this.roll4, value, qualityPercent, rangeInfo, rarity);
}
if (this.quality5 > 0) {
    tooltip += `<div class="itemStat" style="color: #ffd700; text-shadow: 0 0 5px rgba(255, 215, 0, 0.5); display: flex; justify-content: space-between;">
        <span>+5 All Stats</span>
        <span style="color: #ffd700;">100%</span>
    </div>`;
}
    
    tooltip += `<div class="itemSellValue">Sell Value: <span class="goldText">${this.sellcost}g</span></div>`;
    tooltip += `</div>`;
    
    return tooltip;
}

	canRefine() {
    return !this.refined;
}

getRefineCost() {
    const qualityPercent = this.getQualityPercent() / 100;
    return Math.floor((this.level + (this.level * qualityPercent)) * 500)*2;
}

refine() {
    if (this.refined) return false;
    
    // Count current rolls
    let rollCount = 0;
    if (this.quality1 > 0) rollCount++;
    if (this.quality2 > 0) rollCount++;
    if (this.quality3 > 0) rollCount++;
    if (this.quality4 > 0) rollCount++;
    
    // Check if all 4 rolls are perfect 5/5
    const isPerfect4Roll = rollCount === 4 && 
                          this.quality1 === 5 && 
                          this.quality2 === 5 && 
                          this.quality3 === 5 && 
                          this.quality4 === 5;
    
    if (isPerfect4Roll) {
        // Add 5th roll: +5 all stats
        this.roll5 = 'allstats';
        this.quality5 = 5;
        console.log(`Refining: Added perfect 5th roll (+5 All Stats)`);
    } else if (rollCount < 4) {
        // Add a new roll
        if (this.quality2 === 0) {
            this.quality2 = Math.floor(Math.random() * 5) + 1;
            console.log(`Refining: Added roll 2 (${this.roll2}): ${this.quality2}/5`);
        } else if (this.quality3 === 0) {
            this.quality3 = Math.floor(Math.random() * 5) + 1;
            console.log(`Refining: Added roll 3 (${this.roll3}): ${this.quality3}/5`);
        } else if (this.quality4 === 0) {
            this.quality4 = Math.floor(Math.random() * 5) + 1;
            console.log(`Refining: Added roll 4 (${this.roll4}): ${this.quality4}/5`);
        }
    } else {
        // Find lowest quality roll and make it 5/5
        let lowestValue = 5;
        let lowestRoll = null;
        
        if (this.quality1 < lowestValue) {
            lowestValue = this.quality1;
            lowestRoll = 1;
        }
        if (this.quality2 < lowestValue) {
            lowestValue = this.quality2;
            lowestRoll = 2;
        }
        if (this.quality3 < lowestValue) {
            lowestValue = this.quality3;
            lowestRoll = 3;
        }
        if (this.quality4 < lowestValue) {
            lowestValue = this.quality4;
            lowestRoll = 4;
        }
        
        // Set the lowest roll to 5/5
        if (lowestRoll === 1) this.quality1 = 5;
        else if (lowestRoll === 2) this.quality2 = 5;
        else if (lowestRoll === 3) this.quality3 = 5;
        else if (lowestRoll === 4) this.quality4 = 5;
        
        console.log(`Refining: Upgraded roll ${lowestRoll} from ${lowestValue}/5 to 5/5`);
    }
    
    this.refined = true;
    console.log(`Item refined: ${this.name} - New quality: ${this.getQualityPercent()}%`);
    return true;
}
	
getStatLine(rollType, value, qualityPercent, rangeInfo, rarity = 'green') {
    let statText = '';
    let statName = '';
    
    // Determine base text and name
    switch(rollType) {
        case 'str':
            statText = `+${value}`;
            statName = 'STR';
            break;
        case 'agi':
            statText = `+${value}`;
            statName = 'AGI';
            break;
        case 'int':
            statText = `+${value}`;
            statName = 'INT';
            break;
        case 'allstats':
            statText = `+${value}`;
            statName = 'All Stats';
            break;
        case 'hp':
            statText = `+${value}`;
            statName = 'HP';
            break;
        case 'armor':
            statText = `+${value}`;
            statName = 'Armor';
            break;
        case 'resist':
            statText = `+${value}`;
            statName = 'Resist';
            break;
        case 'hpRegen':
            statText = `+${(value * 0.1).toFixed(1)}`;
            statName = 'HP Regen';
            break;
        case 'attack':
            statText = `+${value}`;
            statName = 'Attack';
            break;
        case 'attackSpeed':
            statText = `+${value}%`;
            statName = 'Attack Speed';
            break;
        default:
            return '';
    }
    
    // If showing range info (Alt key held)
if (rangeInfo) {
    // Calculate min display value based on stat type
    let minDisplay = rangeInfo.min;
    let maxDisplay = rangeInfo.max;
    
    if (rollType === 'hpRegen') {
        minDisplay = (rangeInfo.min * 0.1).toFixed(1);
        maxDisplay = (rangeInfo.max * 0.1).toFixed(1);
    }
    
    const range = `(${minDisplay}-${maxDisplay})`;
    
    // Create a formatted line with range and percentage
    return `<div class="itemStat ${rarity}" style="display: flex; justify-content: space-between;">
        <span>${statText} ${range} ${statName}</span>
        <span style="color: #6a9aaa;">${qualityPercent}%</span>
    </div>`;
} else {
    // Normal display with just percentage
    return `<div class="itemStat ${rarity}" style="display: flex; justify-content: space-between;">
        <span>${statText} ${statName}</span>
        <span style="color: #6a9aaa;">${qualityPercent}%</span>
    </div>`;
}
}

	
getItemScore() {
    // Count number of rolls
    let rollCount = 0;
    if (this.quality1 > 0) rollCount++;
    if (this.quality2 > 0) rollCount++;
    if (this.quality3 > 0) rollCount++;
    if (this.quality4 > 0) rollCount++;
    if (this.quality5 > 0) rollCount++;
    
    // Get quality as decimal (0-1)
    const qualityDecimal = this.getQualityPercent() / 100;
    
    // Calculate score: (level × rolls) × quality
    const score = Math.floor((this.level * rollCount) * qualityDecimal);
    
    return score;
}


}
