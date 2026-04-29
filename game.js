// Game Core
class Game {
    constructor() {
        this.currentScreen = 'mainMenu';
        this.heroes = [];
        
        // Create UIManager early so it's available
        this.uiManager = new UIManager(this);

        // Create Tutorial system
        this.tutorial = new Tutorial(this);
        
        this.currentBattle = null;
        this.selectedTier = null;
        this.pendingBattleResults = null; // Store results until popup is closed
        this.autoBattle = false; // Auto Battle state
        this.autoReplay = false; // Auto Replay state
        this.autoReplayTimer = null; // Timer for auto replay
        this.collectionLog = this.loadCollectionLog();
        this.collectionPopupQueue = [];
        this.collectionPopupActive = false;
        this.maxPartySize = 3; // Start with 3 party slots
        this.hasCheckedForTutorial = false; // Track if we've checked for new game tutorial
        this.tutorialCompleted = false; // Track if tutorial has been completed
        this.startFresh = true; // Set false for easier testing
        

        // Arena system
        this.arena = new Arena(this);
        this.arenaMode = null; // 'spar' or 'pvp'
        this.arenaOpponents = null; // array of Enemy objects

        // Create autosell system
        this.autosell = new AutoSell(this);

        // Progression tracking
        this.progression = {
            unlockedFeatures: {
                party: true,
                stash: false,
                arena: false
            },
            unlockedTiers: ['Easy'],
            completedDungeons: {}, // {dungeonId: {completions: 0, bestTime: null}}
            completedArenas: {} // {team_0: {completions: 0, bestTime: null, lowestDeaths: null}}
        };
        this.loadProgression(); // Load saved progression

        // Sort settings for items
        this.sortSettings = {
            order: ['rarity', 'stars', 'quality', 'level', 'name'],
            direction: {
                rarity: 'desc',
                stars: 'desc',
                quality: 'desc',
                level: 'desc',
                name: 'asc'
            }
        };
        this.loadSortSettings(); // Load saved settings
        
        // Initialize stashes for all class families including villager
        this.stashes = {
            'Villager': { gold: 100000, items: [] },
            'Acolyte': { gold: 0, items: [] },
            'Archer': { gold: 0, items: [] },
            'Druid': { gold: 0, items: [] },
            'Initiate': { gold: 0, items: [] },
            'Swordsman': { gold: 0, items: [] },
            'Templar': { gold: 0, items: [] },
            'Thief': { gold: 0, items: [] },
            'Witch Hunter': { gold: 0, items: [] }
        };
        
        // Load dungeon tiers from JSON data
        this.dungeonTiers = {};
        if (dungeonData && dungeonData.tiers) {
            // Build dungeonTiers from the loaded data
            Object.keys(dungeonData.tiers).forEach(tierName => {
                const tierData = dungeonData.tiers[tierName];
                this.dungeonTiers[tierName] = {
                    ...tierData,
                    dungeons: []
                };
            });
            
            // Now populate dungeons for each tier
            Object.keys(dungeonData.dungeons).forEach(dungeonId => {
                const dungeon = dungeonData.dungeons[dungeonId];
                if (this.dungeonTiers[dungeon.tier]) {
                    this.dungeonTiers[dungeon.tier].dungeons.push({
                        id: dungeonId,
                        name: dungeon.name,
                        boss: dungeon.boss,
                        subtitle: dungeon.subtitle,
                        level: dungeon.level
                    });
                }
            });
        }
        
        // Load class families from JSON data
        this.classFamilies = unitData?.classFamilies || [];                
        this.init();
    }

    // Helper method to get game coordinates from mouse/touch events
getGameCoordinates(event) {
    // Handle both mouse and touch events
    let clientX, clientY;
    
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    // Convert to game coordinates
    return window.scalingSystem.viewportToGame(clientX, clientY);
}

calculateMaxPartySize() {
    // Base size of 3 + 1 for each unique dungeon completed
    const uniqueDungeonsCompleted = Object.keys(this.progression.completedDungeons).filter(
        dungeonId => this.progression.completedDungeons[dungeonId].completions > 0
    ).length;
    
    this.maxPartySize = 3 + uniqueDungeonsCompleted;
    return this.maxPartySize;
}
    
    getTierOrder() {
        // Get tier order from loaded data, sorted by tier number
        return Object.keys(this.dungeonTiers)
            .sort((a, b) => this.dungeonTiers[a].tier - this.dungeonTiers[b].tier)
            .map(tierName => tierName);
    }

    getTierByIndex(index) {
        const tierOrder = this.getTierOrder();
        return tierOrder[index] || null;
    }

    getTierInfo(tierName) {
        return this.dungeonTiers[tierName] || null;
    }

    getDungeonLevelRange(tierName) {
        const tierDungeons = this.dungeonTiers[tierName]?.dungeons || [];
        if (tierDungeons.length === 0) return '';
        
        const levels = tierDungeons.map(d => d.level).sort((a, b) => a - b);
        const minLevel = levels[0];
        const maxLevel = levels[levels.length - 1];
        
        return minLevel === maxLevel ? `(${minLevel})` : `(${minLevel}-${maxLevel})`;
    }

    filterStashSlots(source) {
        // Hide any existing tooltips before DOM manipulation
        this.uiManager.hideItemTooltip();
        this.uiManager.hideAbilityTooltip();

        if (source === 'gear') {
            // Store the current filter value
            const select = document.getElementById('gearStashFilterSelect');
            if (select) {
                this.uiManager.currentGearFilter = select.value;
            }
            // Refresh the gear tab
            this.uiManager.showGearTab(this.heroes[this.uiManager.selectedHero], document.getElementById('heroContent'));
        } else if (source === 'individual') {
            // Store the current filter value for individual stash
            const select = document.getElementById('stashSlotFilterSelect');
            if (select) {
                this.uiManager.currentStashFilter = select.value;
            }
            // Refresh the individual stash screen
            if (this.currentStashFamily) {
                this.uiManager.showIndividualStash(this.currentStashFamily);
            }
        }
    }
    
    toggleAutoBattleInBattle(enabled) {
        // Update auto battle state
        this.toggleAutoBattle(enabled);
        
        // If we have a current battle, update its auto mode
        if (this.currentBattle) {
            this.currentBattle.toggleAutoMode(enabled);
        }
    }
    
// Consolidated star generation function
generateStars(config) {
    let starCount = 0;
    let colorClass = 'normal';
    
    // Use hero logic for heroes OR hero-like enemies
    if (config.type === 'hero' || config.isHeroLike) {
        // Hero star logic
        if (config.awakened) {
            starCount = 6;
            colorClass = 'awakened';
        } else {
            // Tier 0 (villager) = 1 star, Tier 1 = 2 stars, etc.
            starCount = (config.classTier || 0) + 1;
        }
    } else {
        // Regular enemy logic
        const level = config.level;
        if (level < 50) starCount = 1;
        else if (level < 100) starCount = 2;
        else if (level < 200) starCount = 3;
        else if (level < 300) starCount = 4;
        else if (level < 400) starCount = 5;
        else if (level < 500) starCount = 6;
        else if (level < 800) starCount = 7;
        else if (level < 900) starCount = 8;
        else if (level < 1000) starCount = 9;
        else starCount = 10;
        
        // Boss units get +1 star and can have up to 10 stars
        if (config.isBoss) {
            // Add +1 star for being a boss
            starCount += 1;
            
            // Bosses can exceed normal star limits
            if (level >= 1000) starCount = 10;
            else if (level >= 900) starCount = 9;
            else if (level >= 800) starCount = 8;
            // Use calculated starCount for levels below 800
            
            // Color class based on final star count
            if (starCount >= 7) {
                colorClass = 'red';
            } else if (starCount >= 5) {
                colorClass = 'purple';
            }
        } else {
            // Non-boss enemies cap at 6 stars
            if (starCount > 6) starCount = 6;
        }
    }
    
    // Generate the star HTML
    const stars = '★'.repeat(starCount);
    return {
        count: starCount,
        html: stars,
        colorClass: colorClass,
        fullHtml: stars ? `<span class="${config.cssClass || 'stars'} ${colorClass}">${stars}</span>` : ''
    };
}

//init init init
init() {
    
    if (!this.startFresh){
        // Create 8 starting villagers
        this.heroes = [];
        for (let i = 0; i < 16; i++) {
            this.heroes.push(new Hero());
        }

        // Hero 0: Tester (Level 50 with godlike stats)
        this.heroes[0] = new Hero('tester_male');
        this.heroes[0].gender = 'male';
        this.heroes[0].level = 50;
        this.heroes[0].exp = 0;
        this.heroes[0].expToNext = this.heroes[0].calculateExpToNext();

        this.heroes[1].level = 50;
        this.heroes[1].expToNext = this.heroes[1].calculateExpToNext();
        this.heroes[2].level = 50;
        this.heroes[2].expToNext = this.heroes[2].calculateExpToNext();
        this.heroes[3].level = 50;
        this.heroes[3].expToNext = this.heroes[3].calculateExpToNext();
        this.heroes[4].level = 50;
        this.heroes[4].expToNext = this.heroes[4].calculateExpToNext();
        this.heroes[5].level = 50;
        this.heroes[5].expToNext = this.heroes[5].calculateExpToNext();
    }

}

    // Progression Methods
    loadProgression() {
        // In a real implementation, load from localStorage
        // For now, keep default values
    }

    saveProgression() {
        // In a real implementation, save to localStorage
        // localStorage.setItem('teveProgression', JSON.stringify(this.progression));
    }

    isDungeonCompleted(dungeonId) {
        return this.progression.completedDungeons[dungeonId] && 
               this.progression.completedDungeons[dungeonId].completions > 0;
    }

markDungeonComplete(dungeonId, timeString) {
    // Check if this is a first-time completion BEFORE updating
    const isFirstCompletion = !this.progression.completedDungeons[dungeonId] || 
                             this.progression.completedDungeons[dungeonId].completions === 0;
    
    if (!this.progression.completedDungeons[dungeonId]) {
        this.progression.completedDungeons[dungeonId] = {
            completions: 0,
            bestTime: null
        };
    }
    
    const dungeonData = this.progression.completedDungeons[dungeonId];
    dungeonData.completions++;
    
    // Update best time if better
    if (!dungeonData.bestTime || timeString < dungeonData.bestTime) {
        dungeonData.bestTime = timeString;
    }
    
    // Recalculate max party size
    const oldSize = this.maxPartySize;
    this.calculateMaxPartySize();
    
    // Log if party size increased
    if (this.maxPartySize > oldSize) {
        console.log(`First time completing ${dungeonId}! Max party size increased to ${this.maxPartySize}`);
    }
    
    // Check for unlocks
    this.checkProgressionUnlocks(dungeonId);
    this.saveProgression();
    
    // Save the game state after dungeon completion
    saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save
}

    checkProgressionUnlocks(completedDungeonId) {
        // Get dungeon info
        const dungeonInfo = dungeonData.dungeons[completedDungeonId];
        if (!dungeonInfo) return;
        
        // Check if this completes a tier
        const tierDungeons = Object.keys(dungeonData.dungeons).filter(id => 
            dungeonData.dungeons[id].tier === dungeonInfo.tier
        );
        
        const allTierComplete = tierDungeons.every(id => this.isDungeonCompleted(id));
        
        // Unlock next tier if all dungeons in current tier are complete
        if (allTierComplete) {
            const tierOrder = this.getTierOrder();
            const currentIndex = tierOrder.indexOf(dungeonInfo.tier);
            if (currentIndex < tierOrder.length - 1) {
                const nextTier = tierOrder[currentIndex + 1];
                if (!this.progression.unlockedTiers.includes(nextTier)) {
                    this.progression.unlockedTiers.push(nextTier);
                    console.log(`Unlocked new tier: ${nextTier}`);
                }
            }
        }
        
        // Unlock features based on specific dungeons
if (completedDungeonId === 'satyrs_glade' && !this.progression.unlockedFeatures.arena) {
    this.progression.unlockedFeatures.arena = true;
    
    // Bob announces the arena is open
    setTimeout(() => {
        this.tutorial.npcDialogue('Bob', [
            "Hey there, champion! Bob here.",
            "Word travels fast. I hear you cleared the Satyr's Glade!",
            "That means you're ready for the real action. The Arena is now OPEN!",
            "Come find me at the Arena when you want to test your mettle against some real warriors!"
        ], true);
    }, 1000);
}
if (completedDungeonId === 'murkin_wetlands' && !this.progression.unlockedFeatures.stash) {
    this.progression.unlockedFeatures.stash = true;
    
    // Arnold and Squeaky introduce themselves
    setTimeout(() => {
        this.tutorial.npcDialogue('Arnold', [
            "Well well, look who made it through the Murkin Wetlands!",
            "Name's Arnold. I run the storage facilities here in the city.",
            "I've just opened up the Class Stashes for business. Each class family gets their own secure vault.",
            "Come visit me when you need to store your gear and gold!"
        ], true, () => {
            // Chain Squeaky's dialogue after Arnold's
            setTimeout(() => {
                this.tutorial.npcDialogue('Squeaky', [
                    "Oh my, a new hero emerges from the wetlands!",
                    "I'm Squeaky, the city's... information specialist.",
                    "I keep track of all the creatures and heroes in these lands.",
                    "Visit me anytime to browse my Unit Compendium. Knowledge is power!"
                ], true);
            }, 500);
        });
    }, 1000);
}

if (this.uiManager) {
    this.uiManager.drawProgressionTrails();
}
        
    }

    isDungeonAccessible(dungeonId) {
        const dungeon = dungeonData.dungeons[dungeonId];
        if (!dungeon) return false;
        
        // Get all dungeons in this tier
        const tierDungeons = Object.keys(dungeonData.dungeons)
            .filter(id => dungeonData.dungeons[id].tier === dungeon.tier)
            .sort((a, b) => {
                const levelA = dungeonData.dungeons[a].level;
                const levelB = dungeonData.dungeons[b].level;
                return levelA - levelB;
            });
        
        const dungeonIndex = tierDungeons.indexOf(dungeonId);
        
        // First dungeon is always accessible
        if (dungeonIndex === 0) return true;
        
        // Otherwise, check if previous dungeon is completed
        const previousDungeonId = tierDungeons[dungeonIndex - 1];
        return this.isDungeonCompleted(previousDungeonId);
    }

    isArenaTeamCompleted(teamIndex) {
    const teamId = `team_${teamIndex}`;
    return this.progression.completedArenas[teamId] && 
           this.progression.completedArenas[teamId].completions > 0;
}

markArenaTeamComplete(teamIndex, timeString, deathCount) {
    const teamId = `team_${teamIndex}`;
    
    if (!this.progression.completedArenas[teamId]) {
        this.progression.completedArenas[teamId] = {
            completions: 0,
            bestTime: null,
            lowestDeaths: null
        };
    }
    
    const arenaData = this.progression.completedArenas[teamId];
    arenaData.completions++;
    
    // Update best time if better
    if (!arenaData.bestTime || timeString < arenaData.bestTime) {
        arenaData.bestTime = timeString;
    }
    
    // Update lowest deaths if better (or first completion)
    if (arenaData.lowestDeaths === null || deathCount < arenaData.lowestDeaths) {
        arenaData.lowestDeaths = deathCount;
    }
    
    this.saveProgression();
}

isArenaTeamAccessible(teamIndex) {
    // First team is always accessible
    if (teamIndex === 0) return true;
    
    // Otherwise, check if previous team is completed
    return this.isArenaTeamCompleted(teamIndex - 1);
}

enterDungeon(tierName, dungeonIndex) {
    // Clear any arena state when entering dungeon
    this.arenaMode = null;
    this.arenaOpponents = null;
    this.currentArenaTeam = 0;
    
    const dungeon = this.dungeonTiers[tierName].dungeons[dungeonIndex];
    this.currentDungeon = dungeon;
        
        // Get dungeon ID from the dungeon object
        const dungeonId = dungeon.id || dungeon.name.toLowerCase().replace(/ /g, '_').replace('?', '');

        // Store dungeon data for rewards display
        this.currentDungeonData = dungeonData.dungeons[dungeonId];
        
        // Load waves from dungeon data
        if (dungeonData && dungeonData.dungeons[dungeonId]) {
            const dungeonConfig = dungeonData.dungeons[dungeonId];
            
            // Create enemy waves from configuration
            this.dungeonWaves = dungeonConfig.waves.map(wave => {
                return wave.enemies.map(enemyConfig => {
                    return new Enemy(enemyConfig.id, enemyConfig.level);
                });
            });
            
            // Handle special gauntlet dungeon
            if (dungeonConfig.special === 'gauntlet') {
                // TODO: Implement gauntlet mode (all dungeons in sequence)
                this.dungeonWaves = [[new Enemy('cosmic_archon', 500)]]; // Placeholder
            }
        } else {
            // Return to main menu if dungeon data is missing
            console.warn(`No dungeon data found for: ${dungeonId}`);
            alert(`Dungeon "${dungeon.name}" is not yet implemented.`);
            this.uiManager.showMainMenu();
            return;
        }
        
        // Reset preview to first wave
        this.uiManager.currentPreviewWave = 0;
        
        // Set current enemy for display purposes (first enemy of last wave)
        this.currentEnemy = this.dungeonWaves[this.dungeonWaves.length - 1][0];
        
        // Get the last wave for enemy display
        this.lastWaveEnemies = this.dungeonWaves[this.dungeonWaves.length - 1];
        
        // Reset party selection
        this.selectedParty = [null, null, null, null, null];
        
        // Show party select screen
        this.uiManager.showPartySelect();
    }

handleNPCClick(npcName) {
    if (this.tutorial) {
        this.tutorial.handleNPCClick(npcName);
    }
}

    loadCollectionLog() {
        // In a real implementation, this would load from localStorage
        // For now, return empty collection
        return {};
    }

    saveCollectionLog() {
        // In a real implementation, this would save to localStorage
        // localStorage.setItem('teveCollectionLog', JSON.stringify(this.collectionLog));
    }

    initializeDungeonCollection(dungeonId) {
        if (!this.collectionLog[dungeonId]) {
            this.collectionLog[dungeonId] = {};
        }
    }

    checkItemForCollection(item, heroName, heroClass) {
        // Only process items from dungeon rewards
        if (!this.currentDungeon) return;
        
        const dungeonId = this.currentDungeon.id;
        this.initializeDungeonCollection(dungeonId);
        
        // Count total rolls on the item
        let totalRolls = 0;
        if (item.quality1 > 0) totalRolls++;
        if (item.quality2 > 0) totalRolls++;
        if (item.quality3 > 0) totalRolls++;
        if (item.quality4 > 0) totalRolls++;
        
        // Check if ALL rolls are perfect (5/5)
        let allPerfect = true;
        if (totalRolls >= 1 && item.quality1 !== 5) allPerfect = false;
        if (totalRolls >= 2 && item.quality2 !== 5) allPerfect = false;
        if (totalRolls >= 3 && item.quality3 !== 5) allPerfect = false;
        if (totalRolls >= 4 && item.quality4 !== 5) allPerfect = false;
        
        // Only count if ALL rolls are perfect
        if (totalRolls > 0 && allPerfect) {
            const collectionKey = `${item.id}_${totalRolls}`;
            
            if (!this.collectionLog[dungeonId][collectionKey]) {
                // New collection!
                this.collectionLog[dungeonId][collectionKey] = {
                    itemId: item.id,
                    qualityLevel: totalRolls,
                    heroName: heroName,
                    heroClass: heroClass,
                    timestamp: new Date().toISOString()
                };
                
                this.saveCollectionLog();
                this.uiManager.showCollectionCompletePopup(item, totalRolls, heroName, heroClass);
            }
        }
    }

getDungeonCollectionStats(dungeonId) {
    const dungeonInfo = dungeonData.dungeons[dungeonId];  // Changed from window.dungeonData
    if (!dungeonInfo || !dungeonInfo.rewards || !dungeonInfo.rewards.items) {
        return { total: 0, collected: 0, percentage: 0 };
    }
    
    // Calculate total possible collection slots (4 quality levels per item)
    const dungeonTotal = dungeonInfo.rewards.items.length * 4;
    
    // Count collected items for this dungeon
    const dungeonCollection = this.collectionLog[dungeonId] || {};
    const dungeonCollected = Object.keys(dungeonCollection).length;
    
    const percentage = dungeonTotal > 0 ? Math.floor((dungeonCollected / dungeonTotal) * 100) : 0;
    
    return {
        total: dungeonTotal,
        collected: dungeonCollected,
        percentage: percentage
    };
}

    getTotalCollectionCount() {
    let totalCollected = 0;
    Object.keys(this.collectionLog).forEach(dungeonId => {
        const dungeonCollection = this.collectionLog[dungeonId] || {};
        totalCollected += Object.keys(dungeonCollection).length;
    });
    return totalCollected;
}

getCollectionDropBonus() {
    // Each collection slot adds 0.03% chance, capped at 90%
    const totalSlots = this.getTotalCollectionCount();
    const bonusChance = Math.min(totalSlots * 0.0003, 0.9); // 0.03% = 0.0003
    return bonusChance;
}

getItemCollectionBonuses(itemId) {
    // Check all dungeons for this item's collection status
    const bonuses = {
        quality1Bonus: 0,
        quality2Bonus: 0,
        quality3Bonus: 0,
        quality4Bonus: 0
    };
    
    // Search through all dungeon collections
    Object.keys(this.collectionLog).forEach(dungeonId => {
        const dungeonCollection = this.collectionLog[dungeonId] || {};
        
        // Check each quality level (1-4 stars)
        for (let stars = 1; stars <= 4; stars++) {
            const collectionKey = `${itemId}_${stars}`;
            if (dungeonCollection[collectionKey]) {
                // Apply +2 bonus to the corresponding quality slot
                bonuses[`quality${stars}Bonus`] = 2;
            }
        }
    });
    
    return bonuses;
}

    openStash(family) {
        console.log(`Opening ${family.name} stash`);
        this.currentStashFamily = family;
        this.uiManager.showIndividualStash(family);
    }
    
showItemOptions(item, itemIndex, family, isEquipped = false, slot = null) {
    // Hide item tooltip first
    this.uiManager.hideItemTooltip();
    
    // Close any existing context menu
    this.uiManager.closeItemContextMenu();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'itemContextMenu';
    menu.id = 'itemContextMenu';
    
    // Store item reference for later use
    this.contextMenuItem = { item, itemIndex, family, isEquipped, slot };
    
    // Get stash for gold checks
    const familyName = isEquipped ? 
        this.getClassFamily(this.heroes[this.uiManager.selectedHero].className, this.heroes[this.uiManager.selectedHero].classTier) : 
        family.name;
    const stash = this.stashes[familyName];
    
    // Add options
    const options = [];
    
    // Equip/Unequip option
    if (isEquipped) {
        options.push({
            text: 'Unequip',
            action: () => {
                this.unequipGear(slot);
                this.uiManager.closeItemContextMenu();
            }
        });
    } else if (this.currentScreen === 'heroesScreen' && this.uiManager.selectedHero !== undefined) {
        options.push({
            text: 'Equip',
            action: () => {
                this.equipFromContextMenu();
                this.uiManager.closeItemContextMenu();
            }
        });
    }
    
    // Refine option
    const refineCost = item.getRefineCost();
    const canAfford = stash.gold >= refineCost;
    options.push({
        text: `Refine`,
        cost: refineCost,
        disabled: item.refined || !canAfford,
        action: () => {
            if (stash.gold >= refineCost && item.canRefine()) {
                this.uiManager.closeItemContextMenu();
                this.showRefinementPopup(item, itemIndex, family, isEquipped, slot);
            } else {
                this.uiManager.closeItemContextMenu();
            }
        }
    });
    
    // Sell option (with confirmation)
    options.push({
        text: 'Sell',
        cost: -item.sellcost,
        action: () => {
            this.uiManager.closeItemContextMenu();
            this.showSellConfirmation(item, itemIndex, family, isEquipped, slot, false);
        }
    });
    
    // Mass Sell option (only for stash items)
    if (!isEquipped) {
        // Calculate how many items would be sold
        const massSelInfo = this.calculateMassSell(item, itemIndex, family);
        if (massSelInfo.count > 0) {
            options.push({
                text: 'Mass Sell',
                cost: -massSelInfo.totalValue,
                action: () => {
                    this.uiManager.closeItemContextMenu();
                    this.showSellConfirmation(item, itemIndex, family, isEquipped, slot, true);
                }
            });
        }
    }
    
    // Create menu HTML
    let menuHTML = '';
    options.forEach(option => {
        let className = 'itemContextOption';
        if (option.disabled) className += ' disabled';
        
        let costText = '';
        if (option.cost !== undefined) {
            if (option.cost < 0) {
                costText = `<span class="costText">+${Math.abs(option.cost)}g</span>`;
            } else {
                costText = `<span class="costText">-${option.cost}g</span>`;
            }
        }
        
        menuHTML += `<div class="${className}">${option.text}${costText}</div>`;
    });
    
    menu.innerHTML = menuHTML;
    
    // Add click handlers
    const menuOptions = menu.querySelectorAll('.itemContextOption');
    menuOptions.forEach((elem, index) => {
        if (!options[index].disabled) {
            elem.onclick = options[index].action;
        }
    });
    
    // Position menu at cursor using scaling system
const gameContainer = document.getElementById('gameContainer');
gameContainer.appendChild(menu);

// Get click position in viewport coordinates
const rect = event.target.getBoundingClientRect();
const clickX = rect.right;
const clickY = rect.top;

// Convert to game coordinates using scaling system
const gameCoords = window.scalingSystem.viewportToGame(clickX, clickY);

// Set initial position
let menuLeft = gameCoords.x;
let menuTop = gameCoords.y;

menu.style.left = menuLeft + 'px';
menu.style.top = menuTop + 'px';

// Check if menu would go off screen and adjust
// With CSS zoom, offsetWidth/Height are already in game coordinates
const menuWidth = menu.offsetWidth;
const menuHeight = menu.offsetHeight;

// Adjust if menu goes off game bounds (1920x1080)
if (menuLeft + menuWidth > 1920) {
    // Position to the left of the click point
    const leftRect = event.target.getBoundingClientRect();
    const leftCoords = window.scalingSystem.viewportToGame(leftRect.left, leftRect.top);
    menuLeft = leftCoords.x - menuWidth;
    menu.style.left = menuLeft + 'px';
}
if (menuTop + menuHeight > 1080) {
    menuTop = 1080 - menuHeight - 10;
    menu.style.top = menuTop + 'px';
}
    
    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', this.uiManager.closeItemContextMenu.bind(this.uiManager), { once: true });
    }, 10);
}

    calculateMassSell(item, itemIndex, family) {
    const familyName = family.name;
    const stash = this.stashes[familyName];
    
    // Get current filter value
    let filterValue = 'all';
    if (this.currentScreen === 'heroesScreen' && this.uiManager.currentGearFilter) {
        filterValue = this.uiManager.currentGearFilter;
    } else if (this.currentScreen === 'individualStashScreen' && this.uiManager.currentStashFilter) {
        filterValue = this.uiManager.currentStashFilter;
    }
    
    // Filter items
    let itemsToCheck = stash.items;
    if (filterValue !== 'all') {
        itemsToCheck = stash.items.filter(i => i.slot === filterValue);
    }
    
    // Sort items using current sort settings
    const sortedItems = this.sortItems(itemsToCheck);
    
    // Find the position of our item in the sorted list
    const sortedIndex = sortedItems.indexOf(item);
    if (sortedIndex === -1) {
        return { count: 0, totalValue: 0, items: [] };
    }
    
    // Get all items after this one in the sorted list
    const itemsToSell = sortedItems.slice(sortedIndex + 1);
    
    // Calculate total value
    const totalValue = itemsToSell.reduce((sum, i) => sum + i.sellcost, 0);
    
    return {
        count: itemsToSell.length,
        totalValue: totalValue,
        items: itemsToSell
    };
}

showSellConfirmation(item, itemIndex, family, isEquipped, slot, isMassSell) {
    const modal = document.getElementById('sellConfirmModal');
    const confirmText = document.getElementById('sellConfirmText');
    const confirmDetails = document.getElementById('sellConfirmDetails');
    
    // Store context for confirmation
    this.pendingSell = {
        item: item,
        itemIndex: itemIndex,
        family: family,
        isEquipped: isEquipped,
        slot: slot,
        isMassSell: isMassSell
    };
    
    if (isMassSell) {
        const massSelInfo = this.calculateMassSell(item, itemIndex, family);
        
        // Lock in the items to sell at this moment
        this.pendingSell.itemsToSell = massSelInfo.items;
        this.pendingSell.totalItems = massSelInfo.count + 1; // +1 for the clicked item
        this.pendingSell.totalValue = massSelInfo.totalValue + item.sellcost;
        
        confirmText.innerHTML = `Are you sure you wish to sell<br><br><b>Level ${item.level} ${item.name}</b><br><br>AND mass sell every item currently sorted below it?`;
        confirmDetails.innerHTML = `Selling: ${this.pendingSell.totalItems} items<br>Sell Value: +${this.pendingSell.totalValue}g`;
    } else {
        confirmText.innerHTML = `Are you sure you wish to sell<br><br><b>Level ${item.level} ${item.name}</b>?<br>`;
        confirmDetails.innerHTML = `Sell Value: +${item.sellcost}g`;
    }
    
    modal.style.display = 'flex';
}

confirmSell() {
    const modal = document.getElementById('sellConfirmModal');
    modal.style.display = 'none';
    
    if (!this.pendingSell) return;
    
    const { item, itemIndex, family, isEquipped, slot, isMassSell } = this.pendingSell;
    const familyName = isEquipped ? 
        this.getClassFamily(this.heroes[this.uiManager.selectedHero].className, this.heroes[this.uiManager.selectedHero].classTier) : 
        family.name;
    const stash = this.stashes[familyName];
    
    if (isMassSell) {
        // Mass sell - remove all locked-in items
        const itemsToRemove = [item, ...this.pendingSell.itemsToSell];
        
        // Remove items from stash (filter out the items to sell)
        stash.items = stash.items.filter(stashItem => !itemsToRemove.includes(stashItem));
        
        // Add total gold
        stash.gold += this.pendingSell.totalValue;
    } else {
        // Single sell
        if (isEquipped) {
            // Unequip first
            this.heroes[this.uiManager.selectedHero].unequipItem(slot);
        } else {
            // Remove from stash
            const actualIndex = stash.items.indexOf(item);
            if (actualIndex !== -1) {
                stash.items.splice(actualIndex, 1);
            }
        }
        
        // Add gold
        stash.gold += item.sellcost;
    }
    
    saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after selling
    
    // Refresh display based on current screen
    if (this.currentScreen === 'heroesScreen') {
        this.uiManager.showGearTab(this.heroes[this.uiManager.selectedHero], document.getElementById('heroContent'));
    } else {
        this.uiManager.showIndividualStash(family);
    }
    
    // Clear pending sell
    this.pendingSell = null;
}

cancelSell() {
    const modal = document.getElementById('sellConfirmModal');
    modal.style.display = 'none';
    this.pendingSell = null;
}

    showItemOptionsFromGearTab(itemIndex, familyName) {
        const family = { name: familyName };
        const item = this.stashes[familyName].items[itemIndex];
        this.showItemOptions(item, itemIndex, family, false, null);
    }

    showEquippedItemOptions(slot) {
        const hero = this.heroes[this.uiManager.selectedHero];
        const item = hero.gear[slot];
        if (!item) return;
        
        const familyName = this.getClassFamily(hero.className, hero.classTier);
        const family = { name: familyName };
        
        this.showItemOptions(item, null, family, true, slot);
    }
    
    // Item Refinement Popup Functions
    showRefinementPopup(item, itemIndex, family, isEquipped = false, slot = null) {
        // Show overlay
        document.getElementById('refinementOverlay').style.display = 'block';
        
        const popup = document.getElementById('itemRefinementPopup');
        const cost = item.getRefineCost();
        
        // Store refinement context
        this.refinementContext = {
            item: item,
            itemIndex: itemIndex,
            family: family,
            isEquipped: isEquipped,
            slot: slot,
            cost: cost,
            originalStats: JSON.parse(JSON.stringify(item)) // Deep copy for preview
        };
        
        // Update header
        document.getElementById('refinementGoldCost').textContent = cost.toLocaleString();
        
        // Show current item
        this.showCurrentItemInRefinement();
        
        // Show preview
        this.showRefinementPreview();
        
        // Reset to initial state
        document.getElementById('refinementColumns').style.display = 'flex';
        document.getElementById('refinementResult').style.display = 'none';
        document.getElementById('refinementButtons').style.display = 'flex';
        document.getElementById('refinementCloseButton').style.display = 'none';
        document.getElementById('refinementResultLabel').textContent = 'Current Item';

        // Clear the refined item slot to prevent showing previous item
        document.getElementById('refinedItemSlot').innerHTML = '';
        
        popup.style.display = 'block';
    }

    showCurrentItemInRefinement() {
        const item = this.refinementContext.item;
        const display = document.getElementById('currentItemDisplay');
        
        // Build custom HTML with quality percentages
        let html = `
            <div class="itemName">${item.name}${item.refined ? '<span style="float: right; font-size: 16px;">*</span>' : ''}</div>
            <div class="itemLevelText">Level ${item.level}</div>
            <div class="itemQualityText">Quality: ${item.getQualityPercent()}%</div>
        `;
        
        // Add stars if any
        const starData = item.getStars();
        if (starData.html) {
            html += `<div class="itemStarsInline ${item.getRarity()}">${starData.html}</div>`;
        }
        
        html += `<div class="itemDivider"></div>`;
        html += `<div class="itemImage"><img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" alt="${item.name}" onerror="this.style.display='none'"></div>`;
        
        // Add stats with quality percentages
        if (item.quality1 > 0) {
            const value = Math.floor(item.value1 * (item.quality1 / 5));
            const qualityPercent = Math.round((item.quality1 / 5) * 100);
            html += this.getRefinementStatLine(item.roll1, value, qualityPercent, item.getRarity());
        }
        if (item.quality2 > 0) {
            const value = Math.floor(item.value2 * (item.quality2 / 5));
            const qualityPercent = Math.round((item.quality2 / 5) * 100);
            html += this.getRefinementStatLine(item.roll2, value, qualityPercent, item.getRarity());
        }
        if (item.quality3 > 0) {
            const value = Math.floor(item.value3 * (item.quality3 / 5));
            const qualityPercent = Math.round((item.quality3 / 5) * 100);
            html += this.getRefinementStatLine(item.roll3, value, qualityPercent, item.getRarity());
        }
        if (item.quality4 > 0) {
            const value = Math.floor(item.value4 * (item.quality4 / 5));
            const qualityPercent = Math.round((item.quality4 / 5) * 100);
            html += this.getRefinementStatLine(item.roll4, value, qualityPercent, item.getRarity());
        }
        if (item.quality5 > 0) {
            html += `<div class="itemStat" style="color: #ffd700; text-shadow: 0 0 5px rgba(255, 215, 0, 0.5); display: flex; justify-content: space-between;">
                <span>+10 All Stats</span>
                <span style="color: #ffd700;">100%</span>
            </div>`;
        }
        
        html += `<div class="itemSellValue">Sell Value: <span class="goldText">${item.sellcost}g</span></div>`;
        
        display.innerHTML = html;
        display.className = `refinementItemDisplay ${item.getRarity()}`;
    }

    getRefinementStatLine(rollType, value, qualityPercent, rarity = 'green', isBold = false) {
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
        
        const boldStyle = isBold ? 'font-weight: bold;' : '';
        
        return `<div class="itemStat ${rarity}" style="display: flex; justify-content: space-between; ${boldStyle}">
            <span>${statText} ${statName}</span>
            <span style="color: #6a9aaa;">${qualityPercent}%</span>
        </div>`;
    }   

    getStatDisplayName(rollType) {
        const names = {
            'str': 'STR',
            'agi': 'AGI',
            'int': 'INT',
            'allstats': 'All Stats',
            'hp': 'HP',
            'armor': 'Armor',
            'resist': 'Resist',
            'hpRegen': 'HP Regen',
            'attack': 'Attack',
            'attackSpeed': 'Attack Speed'
        };
        return names[rollType] || rollType.toUpperCase();
    }
    
    showRefinementPreview() {
        const context = this.refinementContext;
        const item = context.item;
        
        // Create a preview item
        const previewItem = new Item(item.id);
        Object.assign(previewItem, JSON.parse(JSON.stringify(item))); // Deep copy
        
        // Determine what will happen
        let explanation = '';
        let rollCount = 0;
        if (item.quality1 > 0) rollCount++;
        if (item.quality2 > 0) rollCount++;
        if (item.quality3 > 0) rollCount++;
        if (item.quality4 > 0) rollCount++;
        
        const isPerfect4Roll = rollCount === 4 && 
                              item.quality1 === 5 && 
                              item.quality2 === 5 && 
                              item.quality3 === 5 && 
                              item.quality4 === 5;
        
        let boldRoll = null;
        
        // Determine the preview rarity FIRST
        let previewRarity = item.getRarity();
        
        if (isPerfect4Roll) {
            // Will add divine roll
            previewItem.roll5 = 'allstats';
            previewItem.quality5 = 5;
            explanation = 'Divine enhancement unlocked! +10 All Stats';
            context.refinementType = 'divine';
            boldRoll = 5;
            previewRarity = 'gold';
        } else if (rollCount < 4) {
            // Will add new roll
            if (item.quality2 === 0) {
                explanation = `New stat roll will be added: ${previewItem.roll2.toUpperCase()}`;
                context.refinementType = 'newroll';
                context.newRollSlot = 2;
                boldRoll = 2;
                previewRarity = 'blue';
            } else if (item.quality3 === 0) {
                explanation = `New stat roll will be added: ${previewItem.roll3.toUpperCase()}`;
                context.refinementType = 'newroll';
                context.newRollSlot = 3;
                boldRoll = 3;
                previewRarity = 'purple';
            } else if (item.quality4 === 0) {
                explanation = `New stat roll will be added: ${previewItem.roll4.toUpperCase()}`;
                context.refinementType = 'newroll';
                context.newRollSlot = 4;
                boldRoll = 4;
                previewRarity = 'red';
            }
        } else {
            // Will upgrade lowest roll
            let lowestValue = 5;
            let lowestRoll = null;
            let lowestStat = '';
            
            if (item.quality1 < lowestValue) {
                lowestValue = item.quality1;
                lowestRoll = 1;
                lowestStat = item.roll1;
            }
            if (item.quality2 < lowestValue) {
                lowestValue = item.quality2;
                lowestRoll = 2;
                lowestStat = item.roll2;
            }
            if (item.quality3 < lowestValue) {
                lowestValue = item.quality3;
                lowestRoll = 3;
                lowestStat = item.roll3;
            }
            if (item.quality4 < lowestValue) {
                lowestValue = item.quality4;
                lowestRoll = 4;
                lowestStat = item.roll4;
            }
            
            // Calculate stat values for explanation
            const oldValue = Math.floor(item[`value${lowestRoll}`] * (lowestValue / 5));
            const newValue = item[`value${lowestRoll}`];
            
            // Format the stat display
            let statDisplay = '';
            const statName = this.getStatDisplayName(lowestStat);
            
            if (lowestStat === 'hpRegen') {
                statDisplay = `+${(oldValue * 0.1).toFixed(1)} → +${(newValue * 0.1).toFixed(1)} ${statName}`;
            } else if (lowestStat === 'attackSpeed') {
                statDisplay = `+${oldValue}% → +${newValue}% ${statName}`;
            } else {
                statDisplay = `+${oldValue} → +${newValue} ${statName}`;
            }
            
            explanation = `Lowest quality roll upgraded to perfect! ${statDisplay}`;
            
            // Set preview
            if (lowestRoll === 1) previewItem.quality1 = 5;
            else if (lowestRoll === 2) previewItem.quality2 = 5;
            else if (lowestRoll === 3) previewItem.quality3 = 5;
            else if (lowestRoll === 4) previewItem.quality4 = 5;
            
            context.refinementType = 'upgrade';
            context.upgradedRoll = lowestRoll;
            context.upgradedStat = lowestStat;
            boldRoll = lowestRoll;
            
            // Check if this upgrade will result in all perfect rolls
            let willBeAllPerfect = true;
            for (let i = 1; i <= 4; i++) {
                const quality = i === lowestRoll ? 5 : item[`quality${i}`];
                if (quality > 0 && quality < 5) {
                    willBeAllPerfect = false;
                    break;
                }
            }
            if (willBeAllPerfect && rollCount === 4) {
                previewRarity = 'red';
            }
        }
        
        // Build preview HTML with quality percentages
        const display = document.getElementById('previewItemDisplay');
        let html = `
            <div class="itemName">${previewItem.name}${previewItem.refined ? '<span style="float: right; font-size: 16px;">*</span>' : ''}</div>
            <div class="itemLevelText">Level ${previewItem.level}</div>
            <div class="itemQualityText">Quality: ${previewItem.getQualityPercent()}%</div>
        `;
        
        // Add stars if any
        const starData = previewItem.getStars();
        if (starData.html) {
            html += `<div class="itemStarsInline ${previewRarity}">${starData.html}</div>`;
        }
        
        html += `<div class="itemDivider"></div>`;
        html += `<div class="itemImage"><img src="https://puzzle-drops.github.io/TEVE/img/items/${previewItem.id}.png" alt="${previewItem.name}" onerror="this.style.display='none'"></div>`;
        
        // Add stats with appropriate formatting
        for (let i = 1; i <= 5; i++) {
            const quality = previewItem[`quality${i}`];
            const roll = previewItem[`roll${i}`];
            const value = previewItem[`value${i}`];
            
            if (i === 5 && boldRoll === 5) {
                // Divine roll
                html += `<div class="itemStat" style="color: #ffd700; text-shadow: 0 0 5px rgba(255, 215, 0, 0.5); display: flex; justify-content: space-between; font-weight: bold;">
                    <span>+10 All Stats</span>
                    <span style="color: #ffd700;">100%</span>
                </div>`;
            } else if (boldRoll === i && context.refinementType === 'newroll') {
                // New roll - show range
                const minValue = Math.floor(value * 0.2);
                const maxValue = value;
                let rangeText = `(${minValue}-${maxValue})`;
                
                if (roll === 'hpRegen') {
                    rangeText = `(${(minValue * 0.1).toFixed(1)}-${(maxValue * 0.1).toFixed(1)})`;
                } else if (roll === 'attackSpeed') {
                    rangeText = `(${minValue}%-${maxValue}%)`;
                }
                
                const statName = this.getStatDisplayName(roll);
                html += `<div class="itemStat ${previewRarity}" style="display: flex; justify-content: space-between; font-weight: bold;">
                    <span>+${rangeText} ${statName}</span>
                    <span style="color: #6a9aaa;">20-100%</span>
                </div>`;
            } else if (quality > 0) {
                // Existing roll
                const actualValue = Math.floor(value * (quality / 5));
                const qualityPercent = boldRoll === i ? 100 : Math.round((quality / 5) * 100);
                html += this.getRefinementStatLine(roll, actualValue, qualityPercent, previewRarity, boldRoll === i);
            }
        }
        
        html += `<div class="itemSellValue">Sell Value: <span class="goldText">${previewItem.sellcost}g</span></div>`;
        
        display.innerHTML = html;
        display.className = `refinementItemDisplay ${previewRarity}`;
        
        // Show explanation
        document.getElementById('refinementExplanation').innerHTML = explanation;
    }

    confirmRefinement() {
        const context = this.refinementContext;
        const familyName = context.isEquipped ? 
            this.getClassFamily(this.heroes[this.uiManager.selectedHero].className, this.heroes[this.uiManager.selectedHero].classTier) : 
            context.family.name;
        const stash = this.stashes[familyName];
        
        // Check gold
        if (stash.gold < context.cost) {
            alert('Not enough gold!');
            return;
        }
        
        // Immediately hide buttons to prevent spam
        document.getElementById('refinementButtons').style.display = 'none';
        
        // Deduct gold
        stash.gold -= context.cost;
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after gold deduction
        
        // Hide preview elements
        document.getElementById('refinementArrow').style.display = 'none';
        document.getElementById('previewColumn').style.display = 'none';
        
        // Flash gold and fade
        const popup = document.getElementById('itemRefinementPopup');
        popup.classList.add('refinement-flash');

        // After flash animation, perform refinement
        setTimeout(() => {
            popup.classList.remove('refinement-flash');
            this.performRefinementAnimation();
        }, 600);
    }

    cancelRefinement() {
        // Hide buttons immediately
        document.getElementById('refinementButtons').style.display = 'none';
        
        // Close the popup
        this.uiManager.closeRefinementPopup();
    }

    performRefinementAnimation() {
        const context = this.refinementContext;
        const item = context.item;

        // Clear the refined item slot right before showing result
        document.getElementById('refinedItemSlot').innerHTML = '';
        
        // Perform the actual refinement
        const oldRarity = item.getRarity();
        
        // Get the roll text before refinement
        let statText = '';
        let qualityText = '';

        if (context.refinementType === 'divine') {
            statText = '+10 All Stats!';
            qualityText = 'Divine!';
        } else if (context.refinementType === 'newroll') {
            const rollSlot = context.newRollSlot;
            const statName = this.getStatDisplayName(item[`roll${rollSlot}`]);
            
            // Actually perform the roll
            item[`quality${rollSlot}`] = Math.floor(Math.random() * 5) + 1;
            const quality = item[`quality${rollSlot}`];
            const qualityPercent = Math.round((quality / 5) * 100);
            
            statText = statName;
            if (quality === 5) {
                qualityText = `Perfect! 100%`;
            } else {
                qualityText = `${qualityPercent}%`;
            }
        } else if (context.refinementType === 'upgrade') {
            const statName = this.getStatDisplayName(context.upgradedStat);
            statText = statName;
            qualityText = 'Perfect! 100%';
            // Upgrade the roll
            const rollSlot = context.upgradedRoll;
            item[`quality${rollSlot}`] = 5;
        }
        
        // Mark as refined
item.refined = true;

// Apply divine roll if needed
if (context.refinementType === 'divine') {
    item.roll5 = 'allstats';
    item.quality5 = 5;
}

        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after refinement

const newRarity = item.getRarity();

// If item is equipped, force hero to recalculate stats
if (context.isEquipped) {
    const hero = this.heroes[this.uiManager.selectedHero];
    if (hero) {
        // Force recalculation of gear stats
        hero.updateGearStats();
    }
}

// Show floating text with delayed timing
setTimeout(() => {
    this.showRefinementRollText(statText, qualityText);
}, 600);

        // Update display after floating texts are done
        setTimeout(() => {
            // Clear the refined item slot right before showing result
            document.getElementById('refinedItemSlot').innerHTML = '';
            
            // Hide columns and show result
            document.getElementById('refinementColumns').style.display = 'none';
            document.getElementById('refinementResult').style.display = 'block';
            document.getElementById('refinementResultLabel').textContent = 'Refined Item';
            
            // Build refined item display with bolded changed roll
            const display = document.getElementById('refinedItemDisplay');
            let html = `
                <div class="itemName">${item.name}${item.refined ? '<span style="float: right; font-size: 16px;">*</span>' : ''}</div>
                <div class="itemLevelText">Level ${item.level}</div>
                <div class="itemQualityText">Quality: ${item.getQualityPercent()}%</div>
            `;
            
            // Add stars if any
            const starData = item.getStars();
            if (starData.html) {
                html += `<div class="itemStarsInline ${item.getRarity()}">${starData.html}</div>`;
            }
            
            html += `<div class="itemDivider"></div>`;
            html += `<div class="itemImage"><img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" alt="${item.name}" onerror="this.style.display='none'"></div>`;
            
            // Add stats with quality percentages, bolding the changed one
            const boldRoll = context.refinementType === 'divine' ? 5 : 
                            context.refinementType === 'newroll' ? context.newRollSlot : 
                            context.upgradedRoll;
            
            for (let i = 1; i <= 5; i++) {
                const quality = item[`quality${i}`];
                if (quality > 0) {
                    const value = Math.floor(item[`value${i}`] * (quality / 5));
                    const qualityPercent = Math.round((quality / 5) * 100);
                    
                    if (i === 5) {
                        html += `<div class="itemStat" style="color: #ffd700; text-shadow: 0 0 5px rgba(255, 215, 0, 0.5); display: flex; justify-content: space-between; ${boldRoll === 5 ? 'font-weight: bold;' : ''}">
                            <span>+10 All Stats</span>
                            <span style="color: #ffd700;">100%</span>
                        </div>`;
                    } else {
                        html += this.getRefinementStatLine(item[`roll${i}`], value, qualityPercent, item.getRarity(), boldRoll === i);
                    }
                }
            }
            
            html += `<div class="itemSellValue">Sell Value: <span class="goldText">${item.sellcost}g</span></div>`;
            
            display.innerHTML = html;
            
            // Animate border color change if rarity changed
            if (oldRarity !== newRarity) {
                display.className = `refinementItemDisplay ${oldRarity}`;
                setTimeout(() => {
                    display.className = `refinementItemDisplay ${newRarity}`;
                }, 100);
            } else {
                display.className = `refinementItemDisplay ${newRarity}`;
            }
            
            // Show refined item in slot after delay
                this.showRefinedItemInSlot();
            
            // Update buttons
            document.getElementById('refinementButtons').style.display = 'none';
            document.getElementById('refinementCloseButton').style.display = 'flex';
        }, 1600);
    }

    showRefinementRollText(statText, qualityText) {
        // Show stat text first
        this.showSingleRefinementText(statText, 0);
        
        // Show quality text after 300ms delay
        setTimeout(() => {
            this.showSingleRefinementText(qualityText, 20); // 20px offset for second text
        }, 600);
    }

    showSingleRefinementText(text, verticalOffset = 0) {
        // Get the refinement popup and result display
const popup = document.getElementById('itemRefinementPopup');
const resultDisplay = document.getElementById('refinementResult');

// Use the result display if visible, otherwise use the popup
const targetElement = resultDisplay.style.display !== 'none' ? resultDisplay : popup;
const rect = targetElement.getBoundingClientRect();

// Get game container for appending
const gameContainer = document.getElementById('gameContainer');

const floatText = document.createElement('div');
floatText.className = 'refinementRollText';
floatText.textContent = text;

// Calculate center position in viewport coordinates
const viewportCenterX = rect.left + rect.width / 2;
const viewportCenterY = rect.top + rect.height / 2;

// Convert to game coordinates using scaling system
const gameCoords = window.scalingSystem.viewportToGame(viewportCenterX, viewportCenterY);

// Apply vertical offset in game space
const centerX = gameCoords.x;
const centerY = gameCoords.y + verticalOffset;

floatText.style.left = centerX + 'px';
floatText.style.top = centerY + 'px';

// Append to game container
gameContainer.appendChild(floatText);
        
        // Remove after animation
        setTimeout(() => {
            floatText.remove();
        }, 1500);
    }

    showRefinedItemInSlot() {
        const context = this.refinementContext;
        const item = context.item;
        const slot = document.getElementById('refinedItemSlot');
        
        const starData = item.getStars();
        const rarity = item.getRarity();
        
        slot.innerHTML = `
            <div class="itemContainer">
                <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                     alt="${item.name}"
                     onerror="this.style.display='none'">
                ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                ${starData.html ? `<div class="itemStars ${starData.colorClass}">${starData.html}</div>` : ''}
                <div class="itemLevel">${item.level}</div>
                <div class="itemQuality">${item.getQualityPercent()}%</div>
            </div>
        `;
        
        slot.className = `refinedItemSlot show`;
        slot.classList.add(rarity);
        
        // Add hover and right-click handlers
        slot.onmouseover = (e) => this.uiManager.showItemTooltip(e, item);
        slot.onmouseout = () => this.uiManager.hideItemTooltip();
        slot.oncontextmenu = (e) => {
            e.preventDefault();
            this.showRefinedItemContextMenu(e);
        };
    }

    showRefinedItemContextMenu(e) {
        const context = this.refinementContext;
        const item = context.item;
        
        // Close any existing menu
        this.uiManager.closeItemContextMenu();
        
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'itemContextMenu';
        menu.id = 'itemContextMenu';
        
        const options = [];
        
        // If in hero screen and not equipped
        if (this.currentScreen === 'heroesScreen' && !context.isEquipped) {
            options.push({
                text: 'Equip',
                action: () => {
                    this.equipRefinedItem();
                    this.uiManager.closeItemContextMenu();
                }
            });
        }
        
        // Sell option
        options.push({
            text: 'Sell',
            cost: -item.sellcost,
            action: () => {
                this.sellRefinedItem();
                this.uiManager.closeItemContextMenu();
            }
        });
        
        // Create menu HTML
        let menuHTML = '';
        options.forEach(option => {
            let costText = '';
            if (option.cost !== undefined) {
                costText = `<span class="costText">+${Math.abs(option.cost)}g</span>`;
            }
            
            menuHTML += `<div class="itemContextOption">${option.text}${costText}</div>`;
        });
        
        menu.innerHTML = menuHTML;
        
        // Add click handlers
        const menuOptions = menu.querySelectorAll('.itemContextOption');
        menuOptions.forEach((elem, index) => {
            elem.onclick = options[index].action;
        });
        
        // Position menu using scaling system
const gameContainer = document.getElementById('gameContainer');
gameContainer.appendChild(menu);

// Get click position in viewport coordinates
const rect = e.target.getBoundingClientRect();
const clickX = rect.right;
const clickY = rect.top;

// Convert to game coordinates using scaling system
const gameCoords = window.scalingSystem.viewportToGame(clickX, clickY);

// Set initial position
let menuLeft = gameCoords.x;
let menuTop = gameCoords.y;

menu.style.left = menuLeft + 'px';
menu.style.top = menuTop + 'px';

// Check if menu would go off screen and adjust
// With CSS zoom, offsetWidth is already in game coordinates
const menuWidth = menu.offsetWidth;

// Adjust if menu goes off game bounds (1920x1080)
if (menuLeft + menuWidth > 1920) {
    // Position to the left of the click point
    const leftCoords = window.scalingSystem.viewportToGame(rect.left, rect.top);
    menuLeft = leftCoords.x - menuWidth;
    menu.style.left = menuLeft + 'px';
}
        
        // Close when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', this.uiManager.closeItemContextMenu.bind(this.uiManager), { once: true });
        }, 10);
    }

    equipRefinedItem() {
        const context = this.refinementContext;
        const item = context.item;
        const hero = this.heroes[this.uiManager.selectedHero];
        const slot = item.slot;
        
        // Remove from stash if it was there
        if (!context.isEquipped && context.itemIndex !== null) {
            this.stashes[context.family.name].items.splice(context.itemIndex, 1);
        }
        
        // Unequip current item if any
        const currentItem = hero.gear[slot];
        if (currentItem) {
            this.stashes[context.family.name].items.push(currentItem);
        }
        
        // Equip the refined item
        hero.equipItem(item, slot);
        
        // Force hero to recalculate stats with new item
hero.calculateGearStats();
hero.calculateTotalStats();
saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after equipping refined item

// Close popup and refresh
this.uiManager.closeRefinementPopup();
    }

    sellRefinedItem() {
        const context = this.refinementContext;
        const item = context.item;
        
        // Add gold
        const familyName = context.isEquipped ? 
            this.getClassFamily(this.heroes[this.uiManager.selectedHero].className, this.heroes[this.uiManager.selectedHero].classTier) : 
            context.family.name;
        this.stashes[familyName].gold += item.sellcost;
        
        // Remove item
        if (context.isEquipped) {
            this.heroes[this.uiManager.selectedHero].unequipItem(context.slot);
        } else if (context.itemIndex !== null) {
            this.stashes[familyName].items.splice(context.itemIndex, 1);
        }
        
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after selling refined item

        // Close popup and refresh
        this.uiManager.closeRefinementPopup();
        if (this.currentScreen === 'heroesScreen') {
            this.uiManager.showGearTab(this.heroes[this.uiManager.selectedHero], document.getElementById('heroContent'));
        } else {
            this.uiManager.showIndividualStash(context.family);
        }
    }

    equipFromContextMenu() {
        if (!this.contextMenuItem) return;
        const { item, itemIndex, family } = this.contextMenuItem;
        
        // Remove from stash
        this.stashes[family.name].items.splice(itemIndex, 1);
        
        // Equip to current hero
        const hero = this.heroes[this.uiManager.selectedHero];
        const slot = item.slot;
        
        // If there's already an item equipped, put it back in stash
        const currentItem = hero.gear[slot];
        if (currentItem) {
            this.stashes[family.name].items.push(currentItem);
        }
        
        // Equip the new item
        hero.equipItem(item, slot);
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after equipping

        // Refresh display
        this.uiManager.showHeroTab(this.uiManager.currentTab);
    }

    refineFromContextMenu() {
        if (!this.contextMenuItem) return;
        const { item, itemIndex, family } = this.contextMenuItem;
        
        const cost = item.getRefineCost();
        const stash = this.stashes[family.name];
        
        if (stash.gold >= cost && item.canRefine()) {
            // Deduct gold
            stash.gold -= cost;
            
            // Refine the item
            item.refine();
            
            // Refresh display
            this.uiManager.showIndividualStash(family);
        }
    }

    sellFromContextMenu() {
        if (!this.contextMenuItem) return;
        const { item, itemIndex, family } = this.contextMenuItem;
        
        // Remove item from stash
        this.stashes[family.name].items.splice(itemIndex, 1);
        
        // Add gold
        this.stashes[family.name].gold += item.sellcost;
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after selling

        // Refresh display
        this.uiManager.showIndividualStash(family);
    }

    loadSortSettings() {
        // Always start with default settings
        this.sortSettings = {
            order: ['itemScore', 'rarity', 'stars', 'quality', 'level', 'name'],
            direction: {
                itemScore: 'desc',
                rarity: 'desc',
                stars: 'desc',
                quality: 'desc',
                level: 'desc',
                name: 'asc'
            }
        };
        
        // Then override with saved settings if they exist
        const saved = localStorage.getItem('teveSortSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                // Merge saved settings with defaults to ensure all properties exist
                this.sortSettings.order = settings.order || this.sortSettings.order;
                this.sortSettings.direction = {...this.sortSettings.direction, ...settings.direction};
            } catch (e) {
                console.error('Failed to load sort settings:', e);
            }
        }
    }

    saveSortSettings() {
        localStorage.setItem('teveSortSettings', JSON.stringify(this.sortSettings));
    }

    toggleSortDirection(criteria, source) {
        this.sortSettings.direction[criteria] = 
            this.sortSettings.direction[criteria] === 'desc' ? 'asc' : 'desc';
        
        this.saveSortSettings();
        this.uiManager.showSortSettings(source);
        
        // Refresh the current view
        if (source === 'gear') {
            this.uiManager.showGearTab(this.heroes[this.uiManager.selectedHero], document.getElementById('heroContent'));
        } else if (source === 'stash') {
            this.uiManager.showIndividualStash(this.currentStashFamily);
        }
    }

    resetSortSettings(source) {
        this.sortSettings = {
            order: ['itemScore', 'rarity', 'stars', 'quality', 'level', 'name'],
            direction: {
                itemScore: 'desc',
                rarity: 'desc',
                stars: 'desc',
                quality: 'desc',
                level: 'desc',
                name: 'asc'
            }
        };
        
        this.saveSortSettings();
        this.uiManager.showSortSettings(source);
        
        // Refresh the current view
        if (source === 'gear') {
            this.uiManager.showGearTab(this.heroes[this.uiManager.selectedHero], document.getElementById('heroContent'));
        } else if (source === 'stash') {
            this.uiManager.showIndividualStash(this.currentStashFamily);
        }
    }

    sortItems(items) {
        const rarityOrder = { gold: 5, red: 4, purple: 3, blue: 2, green: 1 };
        const slotOrder = { weapon: 1, offhand: 2, head: 3, chest: 4, legs: 5, trinket: 6 };
        
        return [...items].sort((a, b) => {
            for (const criteria of this.sortSettings.order) {
                let comparison = 0;
                const direction = this.sortSettings.direction[criteria];
                
                switch (criteria) {
                    case 'itemScore':
                        comparison = a.getItemScore() - b.getItemScore();
                        break;
                    case 'level':
                        comparison = a.level - b.level;
                        break;
                    case 'rarity':
                        const aRarity = rarityOrder[a.getRarity()];
                        const bRarity = rarityOrder[b.getRarity()];
                        comparison = aRarity - bRarity;
                        break;
                    case 'stars':
                        const aStars = a.getStars().count;
                        const bStars = b.getStars().count;
                        comparison = aStars - bStars;
                        break;
                    case 'quality':
                        comparison = a.getQualityPercent() - b.getQualityPercent();
                        break;
                    case 'name':
                        comparison = a.name.localeCompare(b.name);
                        break;
                }
                
                if (comparison !== 0) {
                    return direction === 'desc' ? -comparison : comparison;
                }
            }
            
            // Final tiebreaker: slot order
            const aSlot = slotOrder[a.slot] || 7;
            const bSlot = slotOrder[b.slot] || 7;
            return aSlot - bSlot;
        });
    }
    
startBattle(mode = null) {
    // Clean up any existing battle timer interval
    if (this.currentBattle && this.currentBattle.timerInterval) {
        clearInterval(this.currentBattle.timerInterval);
        this.currentBattle.timerInterval = null;
    }
    
    // Determine mode automatically if not provided
    if (mode === null) {
        mode = this.arenaMode === 'spar' ? 'arena' : 'dungeon';
    }
    
    // Store mode for later
    this.currentBattleMode = mode;
    
    // Create party array from selected heroes
    const party = this.selectedParty.map(heroIndex => 
        heroIndex !== null ? this.heroes[heroIndex] : null
    ).filter(hero => hero !== null);
    
    // Show battle screen
    this.uiManager.showBattle();
    
    if (mode === 'arena') {
        // Store compositions for rematch
        this.lastArenaParty = [...this.selectedParty];
        this.lastArenaOpponents = this.arenaOpponents;
        
        // Create and start arena battle
        this.currentBattle = new Battle(this, party, [this.arenaOpponents], 'arena');

        // If auto replay is on, ensure auto battle is also on
        if (this.autoReplay && !this.autoBattle) {
            this.toggleAutoBattle(true);
        }
        
        // Set auto mode if enabled (same as dungeon)
if (this.autoBattle) {
    this.currentBattle.autoMode = true;
}
        
    } else {
        // Dungeon mode - use existing dungeonWaves
        
        // If auto replay is on, ensure auto battle is also on
        if (this.autoReplay && !this.autoBattle) {
            this.toggleAutoBattle(true);
        }
        
        // Create and start battle with waves
        this.currentBattle = new Battle(this, party, this.dungeonWaves, 'dungeon');
        
        // Set auto mode if enabled
        if (this.autoBattle) {
            this.currentBattle.autoMode = true;
        }
    }
    
    this.currentBattle.start();
}

rematchArena() {
    // Close results popup
    document.getElementById('arenaResultsPopup').style.display = 'none';
    
    // Results already applied in endBattle, just clear pending results
    this.pendingBattleResults = null;
    
    // Restore last compositions
    this.selectedParty = [...this.lastArenaParty];
    this.arenaOpponents = this.lastArenaOpponents;
    // Return to party select (arena mode)
    this.uiManager.showPartySelect('arena');
}

continueFromArena() {
    // Close results popup
    document.getElementById('arenaResultsPopup').style.display = 'none';
    
    // Results already applied in endBattle, just clear pending results
    this.pendingBattleResults = null;
    
    // Just return to party select
    this.uiManager.showPartySelect('arena');
}
    
    toggleAutoBattle(enabled) {
        this.autoBattle = enabled;
        // Update both toggle elements
        const battleToggle = document.getElementById('autoModeToggle');
        if (battleToggle) battleToggle.checked = enabled;
        const partyToggle = document.getElementById('autoBattleToggle');
        if (partyToggle) partyToggle.checked = enabled;
        
        // If disabling auto battle while auto replay is on, turn off auto replay
        if (!enabled && this.autoReplay) {
            this.toggleAutoReplay(false);
        }
        
        // Update current battle if running
        if (this.currentBattle) {
            this.currentBattle.toggleAutoMode(enabled);
            // If enabling auto mode during a battle, it should persist
            if (enabled) {
                this.currentBattle.autoMode = true;
            }
        }
    }
    
    toggleAutoReplay(enabled) {
        this.autoReplay = enabled;
        // Update both toggle elements
        const battleToggle = document.getElementById('autoReplayToggle');
        if (battleToggle) battleToggle.checked = enabled;
        const partyToggle = document.getElementById('autoReplayToggleParty');
        if (partyToggle) partyToggle.checked = enabled;
        
        // If enabling auto replay, also enable auto battle
        if (enabled) {
            this.toggleAutoBattle(true);
        }
        
        // Cancel any existing timer if disabling
        if (!enabled) {
            if (this.autoReplayTimer) {
                clearTimeout(this.autoReplayTimer);
                this.autoReplayTimer = null;
                this.uiManager.updateAutoReplayText(null);
            }
            // Reset automatic mode tracking
            this.automaticModeStartTime = null;
            this.automaticModeCompletions = 0;
            // Remove automatic mode display if it exists
            const autoDisplay = document.getElementById('automaticModeDisplay');
            if (autoDisplay) {
                autoDisplay.remove();
            }
        } else {
            // If enabling during battle, create the automatic mode display
            if (this.currentBattle && this.currentBattle.running) {
                this.currentBattle.createAutomaticModeDisplay();
            }
        }
    }
    
    exitBattle() {
    if (this.currentBattle) {

        // Clear the battle timer interval FIRST
        if (this.currentBattle.timerInterval) {
            clearInterval(this.currentBattle.timerInterval);
            this.currentBattle.timerInterval = null;
        }
        
        // Reset battlefield position
        const battleField = document.querySelector('.battleField');
        if (battleField) {
            battleField.style.transition = 'none';
            battleField.style.top = '0%';
        }
                    
            // Clear any active targeting
            if (this.currentBattle.targetingState) {
                this.currentBattle.clearTargeting();
            }
            
            // Stop the battle and clean up
            this.currentBattle.running = false;
            
            // Reset pending exp for all heroes in the party since battle was abandoned
            this.currentBattle.party.forEach(unit => {
                if (unit && unit.source) {
                    unit.source.pendingExp = 0;
                    // Clear all buffs and debuffs
                    unit.buffs = [];
                    unit.debuffs = [];
                }
            });
            
            // Clean up enemy buffs/debuffs too
            this.currentBattle.enemies.forEach(unit => {
                if (unit) {
                    unit.buffs = [];
                    unit.debuffs = [];
                }
            });
            
            // Clean up all UI elements when exiting
            const elementsToRemove = ['waveCounter', 'dungeonNameDisplay', 'automaticModeDisplay'];
            elementsToRemove.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.remove();
                }
            });

            // Show exit button in case it was hidden
            const exitButton = document.querySelector('.exitBattleButton');
            if (exitButton) {
                exitButton.style.display = '';
            }          
            // Clear ability panel
            document.getElementById('abilityPanel').innerHTML = '';
            
            // Clean up level indicator event listeners
            for (let i = 1; i <= 5; i++) {
                ['party', 'enemy'].forEach(type => {
                    const element = document.getElementById(`${type}${i}`);
                    if (element) {
                        const levelIndicator = element.querySelector('.levelIndicator');
                        if (levelIndicator && levelIndicator._unitInfoHandler) {
                            levelIndicator.removeEventListener('click', levelIndicator._unitInfoHandler);
                            delete levelIndicator._unitInfoHandler;
                        }
                    }
                });
            }

            // Close any open popup
            this.uiManager.closeHeroInfo();

            // Clear any auto replay timer
            if (this.autoReplayTimer) {
                clearInterval(this.autoReplayTimer);
                this.autoReplayTimer = null;
            }

            // Reset automatic mode if not auto replaying
            if (!this.autoReplay) {
                this.automaticModeStartTime = null;
                this.automaticModeCompletions = 0;
            }
            
            // Reset party's action bars for next battle
            this.selectedParty.forEach(heroIndex => {
                if (heroIndex !== null) {
                    const hero = this.heroes[heroIndex];
                    // Reset cooldowns if needed
                }
            });
            
            // Only reset battle instance, not dungeon data
            this.currentBattle = null;
        }
        
        // Return to appropriate screen based on mode
if (this.arenaMode === 'spar') {
    this.exitArenaMode();
} else if (this.currentDungeon) {
    this.uiManager.showPartySelect();
} else {
    this.uiManager.showMainMenu();
}
    }

closePartySelect() {
    if (this.arenaMode === 'spar') {
        // Exit arena mode
        this.exitArenaMode();
    } else {
        // Return to dungeon select
        this.uiManager.closeDungeonSelect();
    }
}
    
    exitArenaMode() {
    // Reset party selection
    this.selectedParty = [null, null, null, null, null];
    // Clear arena state
    this.arenaMode = null;
    this.arenaOpponents = null;
    this.currentArenaTeam = 0;
    // Return to arena home
    this.uiManager.showArena();
}
    
    selectHero(index) {
    this.uiManager.selectedHero = index;
    const hero = this.heroes[index];
    
    // Update portrait with backdrop
    const portrait = document.getElementById('heroPortrait');
    
    // Get class family and format for backdrop filename
    const familyName = this.getClassFamily(hero.className, hero.classTier);
    const backdropName = familyName.toLowerCase().replace(/ /g, '_');
    
    portrait.innerHTML = `
        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_battle.png" alt="${hero.displayClassName}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 180 180\\'><rect fill=\\'%23555\\' width=\\'180\\' height=\\'180\\'/><text x=\\'90\\' y=\\'90\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'20\\'>${hero.displayClassName}</text></svg>'">
        <div class="heroPortraitShadow"></div>
    `;
    
    // Set backdrop as background image
    portrait.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/backdrops/${backdropName}_backdrop.png')`;
    
    // Only update selection state, not rebuild the entire list
    this.uiManager.updateHeroSelection();
    
    // Refresh current tab
    this.uiManager.showHeroTab(this.uiManager.currentTab);
}

    unequipGear(slot) {
        // Hide item tooltip first
        this.uiManager.hideItemTooltip();
        
        const hero = this.heroes[this.uiManager.selectedHero];
        const item = hero.unequipItem(slot);
        
        if (item) {
            // Add to stash
            const familyName = this.getClassFamily(hero.className, hero.classTier);
            this.stashes[familyName].items.push(item);
            saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after unequipping
            
            // Refresh gear tab
            this.uiManager.showGearTab(hero, document.getElementById('heroContent'));
        }
    }
    
    equipFromStash(itemIndex, slot) {
        // Hide item tooltip first
        this.uiManager.hideItemTooltip();
        
        const hero = this.heroes[this.uiManager.selectedHero];
        const familyName = this.getClassFamily(hero.className, hero.classTier);
        const stash = this.stashes[familyName];
        const item = stash.items[itemIndex];
        
        if (item && item.slot === slot) {
            // Check villager restriction
            if ((hero.className.includes('villager') || hero.className.includes('tester')) && item.level > 70) {
                alert('Villagers can only equip items level 70 and below!');
                return;
            }
            
            // Remove from stash
            stash.items.splice(itemIndex, 1);
            
            // If there's already an item equipped, put it back in stash
            const currentItem = hero.gear[slot];
            if (currentItem) {
                stash.items.push(currentItem);
            }
            
            // Equip the new item
            hero.equipItem(item, slot);
            saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after equipping

            // Refresh gear tab
            this.uiManager.showGearTab(hero, document.getElementById('heroContent'));
        }
    }

    getClassFamily(className, classTier = null) {
        // Special case for villager and tester
        if (className.includes('villager') || className.includes('tester')) {
            return 'Villager';
        }
        
        // Extract base class name by removing gender suffix
        const baseClass = className.replace(/_male$|_female$/, '');
        
        // Find the family that contains this class
        for (const family of this.classFamilies) {
            // Check if any class in the family matches (after removing gender)
            for (const familyClass of family.classes) {
                const familyBaseClass = familyClass.toLowerCase().replace(/ /g, '_');
                if (familyBaseClass === baseClass) {
                    return family.name;
                }
            }
        }
        
        // If not found, return the base class name
        return baseClass;
    }

    selectSkill(index) {
        const hero = this.heroes[this.uiManager.selectedHero];
        const skill = hero.abilities[index];
        const desc = document.getElementById('skillDescription');
        
        // Store current skill index for alt key updates
        this.uiManager.currentSkillIndex = index;
        
        // Update selected skill visual
        const skillBoxes = document.querySelectorAll('.skillBox');
        skillBoxes.forEach((box, i) => {
            if (i === index) {
                box.classList.add('selected');
            } else {
                box.classList.remove('selected');
            }
        });
        
        // Format ability tooltip with hero unit
        desc.innerHTML = this.uiManager.formatAbilityTooltip(skill, skill.level, hero, false);
    }

    promoteHero(newClass) {
        const hero = this.heroes[this.uiManager.selectedHero];
        
        if (newClass === 'Awaken') {
            // Awakening costs gold
            const cost = 10000000;
            const familyName = this.getClassFamily(hero.className, hero.classTier);
            const stash = this.stashes[familyName];
            
            if (stash.gold >= cost) {
                stash.gold -= cost;
                if (hero.promote(newClass)) {
                    // Update portrait remains the same
                    const portrait = document.getElementById('heroPortrait');
                    portrait.innerHTML = `
                        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_battle.png" alt="${hero.displayClassName}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 180 180\\'><rect fill=\\'%23555\\' width=\\'180\\' height=\\'180\\'/><text x=\\'90\\' y=\\'90\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'20\\'>${hero.displayClassName}</text></svg>'">
                        <div class="heroPortraitShadow"></div>
                    `;
                    
                    // Update backdrop (should remain the same for awakening)
                    const familyName = this.getClassFamily(hero.className, hero.classTier);
                    const backdropName = familyName.toLowerCase().replace(/ /g, '_');
                    portrait.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/backdrops/${backdropName}_backdrop.png')`;
                    
                    this.uiManager.showHeroTab('info');
                    this.uiManager.updateHeroList();
                    saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after awakening
                }
            } else {
                alert('Not enough gold!');
            }
        } else {
            const cost = 1000 * Math.pow(10, hero.classTier);
            const familyName = this.getClassFamily(hero.className, hero.classTier);
            const stash = this.stashes[familyName];
            
            if (stash.gold >= cost) {
                stash.gold -= cost;
                if (hero.promote(newClass)) {
                    // Update portrait immediately after promotion
                    const portrait = document.getElementById('heroPortrait');
                    portrait.innerHTML = `
                        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_battle.png" alt="${hero.displayClassName}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 180 180\\'><rect fill=\\'%23555\\' width=\\'180\\' height=\\'180\\'/><text x=\\'90\\' y=\\'90\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'20\\'>${hero.displayClassName}</text></svg>'">
                        <div class="heroPortraitShadow"></div>
                    `;
                    
                    // Update backdrop for new class
                    const familyName = this.getClassFamily(hero.className, hero.classTier);
                    const backdropName = familyName.toLowerCase().replace(/ /g, '_');
                    portrait.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/backdrops/${backdropName}_backdrop.png')`;
                    
                    this.uiManager.showHeroTab('info');
                    this.uiManager.updateHeroList();
                    saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after promotion
                }
            } else {
                alert('Not enough gold!');
            }
        }
    }

    confirmPromotion() {
        const modal = document.getElementById('confirmModal');
        modal.style.display = 'none';
        
        if (this.pendingPromotion) {
            this.promoteHero(this.pendingPromotion);
            this.pendingPromotion = null;
        }
    }

    editHeroName() {
        const hero = this.heroes[this.uiManager.selectedHero];
        const nameElement = document.getElementById('heroNameText');
        
        // Create an input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = hero.name;
        input.style.cssText = 'font-size: 18px; color: #6a9aaa; background: rgba(10, 25, 41, 0.8); border: 1px solid #2a6a8a; padding: 2px 5px;';
        
        // Replace the span with the input
        nameElement.parentNode.replaceChild(input, nameElement);
        input.focus();
        input.select();
        
        let saved = false;
        
        // Handle saving
        const saveEdit = () => {
            if (saved) return;
            saved = true;
            
            const newName = input.value.trim();
            if (newName && newName !== hero.name) {
                hero.name = newName;
                this.uiManager.updateHeroList();
            }
            saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after name change
            
            // Recreate the span
            const newSpan = document.createElement('span');
            newSpan.id = 'heroNameText';
            newSpan.textContent = hero.name;
            
            if (input.parentNode) {
                input.parentNode.replaceChild(newSpan, input);
            }
        };
        
        // Save on Enter or blur
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            }
        });
        
        input.addEventListener('blur', () => {
            setTimeout(saveEdit, 10);
        });
    }

    toggleHeroSelection(heroIndex) {
    // Check if hero is already selected
    const currentIndex = this.selectedParty.indexOf(heroIndex);
    
    if (currentIndex !== -1) {
        // Remove from party
        this.selectedParty[currentIndex] = null;
    } else {
        // Find first empty slot
        const emptySlot = this.selectedParty.indexOf(null);
        if (emptySlot !== -1) {
            this.selectedParty[emptySlot] = heroIndex;
        }
    }
    
    // Update UI - just update the selected state instead of rebuilding
    this.uiManager.updateHeroSelectionState(heroIndex);
    this.uiManager.updatePartySlots();
    
    // Enable/disable start button
    const hasHeroes = this.selectedParty.some(h => h !== null);
    document.getElementById('startBattleBtn').disabled = !hasHeroes;
}

    calculateSpellValue(spell, unit, valueType = 'damage') {
        if (!spell || !unit) return 0;
        
        const spellLevel = unit.abilities ? 
            (unit.abilities.find(a => a.id === spell.id)?.level || 1) : 
            (unit.spellLevel || 1);
        const levelIndex = Math.max(0, Math.min(4, spellLevel - 1));
        
        let value = 0;
        
        // Handle different calculation types
        if (valueType === 'damage' && spell.scaling) {
            // Base damage
            if (spell.scaling.base) {
                value += spell.scaling.base[levelIndex] || spell.scaling.base[0] || 0;
            }
            
            // Attack scaling
            if (spell.scaling.attack) {
                const attackScaling = spell.scaling.attack[levelIndex] || spell.scaling.attack[0] || 0;
                value += unit.attack * attackScaling;
            }
            
            // Stat scalings
            const stats = unit.totalStats || unit.baseStats || unit.stats || {};
            
            if (spell.scaling.str) {
                const strScaling = spell.scaling.str[levelIndex] || spell.scaling.str[0] || 0;
                value += (stats.str || 0) * strScaling;
            }
            
            if (spell.scaling.agi) {
                const agiScaling = spell.scaling.agi[levelIndex] || spell.scaling.agi[0] || 0;
                value += (stats.agi || 0) * agiScaling;
            }
            
            if (spell.scaling.int) {
                const intScaling = spell.scaling.int[levelIndex] || spell.scaling.int[0] || 0;
                value += (stats.int || 0) * intScaling;
            }
            
            // Special case for HP-based damage
            if (spell.scaling.percent && unit.maxHp) {
                const percent = spell.scaling.percent[levelIndex] || spell.scaling.percent[0] || 0;
                const percentDamage = unit.maxHp * percent;
                
                if (spell.scaling.cap) {
                    const cap = spell.scaling.cap[levelIndex] || spell.scaling.cap[0] || 0;
                    value = Math.min(percentDamage, cap);
                } else if (spell.scaling.floor) {
                    const floor = spell.scaling.floor[levelIndex] || spell.scaling.floor[0] || 0;
                    value = Math.max(percentDamage, floor);
                } else {
                    value = percentDamage;
                }
            }
        } else if (valueType === 'shield' && spell.shieldAmount) {
            value = spell.shieldAmount[levelIndex] || spell.shieldAmount[0] || 0;
        } else if (valueType === 'heal' && spell.healAmount) {
            value = spell.healAmount[levelIndex] || spell.healAmount[0] || 0;
        }
        
        return Math.floor(value);
    }

    closeBattleResults() {
        const popup = document.getElementById('battleResultsPopup');
        popup.style.display = 'none';

        // Show exit button again
        const exitButton = document.querySelector('.exitBattleButton');
        if (exitButton) {
            exitButton.style.display = '';
        }
        
        // Check if this was a manual click during auto replay
        const wasManualClick = this.autoReplayTimer !== null;
        
        // Clear any auto replay timer
        if (this.autoReplayTimer) {
            clearInterval(this.autoReplayTimer);
            this.autoReplayTimer = null;
            this.uiManager.updateAutoReplayText(null);
        }
        
        if (this.pendingBattleResults) {
            // Results already applied in endBattle, just handle auto-replay logic
            
            // Increment completions counter if victory and automatic mode
            if (this.pendingBattleResults.victory && this.autoReplay) {
                this.automaticModeCompletions = (this.automaticModeCompletions || 0) + 1;
            }
            
            // Check if auto replay is enabled and it was a victory, but NOT a manual click
            const shouldAutoReplay = this.autoReplay && this.pendingBattleResults.victory && !wasManualClick;
            
            // Clear pending results
this.pendingBattleResults = null;

if (shouldAutoReplay) {
    // Auto start next battle
    this.startBattle();
} else {
    if (!this.autoReplay) {
        this.automaticModeStartTime = null;
        this.automaticModeCompletions = 0;
    }
    // Return to appropriate screen based on battle mode
    if (this.currentBattleMode === 'arena') {
// Stay in party select for arena
        this.uiManager.showPartySelect('arena');
    } else {
        // Return to party select for dungeons
        this.uiManager.showPartySelect();
    }
}
        }
    }

replayBattle() {
    const popup = document.getElementById('battleResultsPopup');
    popup.style.display = 'none';

    // Show exit button again
    const exitButton = document.querySelector('.exitBattleButton');
    if (exitButton) {
        exitButton.style.display = '';
    }
    
    // Check if this was a manual click during auto replay
    const wasManualClick = this.autoReplayTimer !== null;
    
    // Clear any auto replay timer
    if (this.autoReplayTimer) {
        clearInterval(this.autoReplayTimer);
        this.autoReplayTimer = null;
        this.uiManager.updateAutoReplayText(null);
    }
    
    if (this.pendingBattleResults) {
        // Results already applied in endBattle
        
        // Increment completions counter if victory and automatic mode
        if (this.pendingBattleResults.victory && this.autoReplay) {
            this.automaticModeCompletions = (this.automaticModeCompletions || 0) + 1;
        }
        
        // Clear pending results
        this.pendingBattleResults = null;
        
        // Always start next battle when clicking Replay
        this.startBattle();
    }
}

returnToMap() {
    const popup = document.getElementById('battleResultsPopup');
    popup.style.display = 'none';

    // Show exit button again
    const exitButton = document.querySelector('.exitBattleButton');
    if (exitButton) {
        exitButton.style.display = '';
    }
    
    // Clear any auto replay timer
    if (this.autoReplayTimer) {
        clearInterval(this.autoReplayTimer);
        this.autoReplayTimer = null;
        this.uiManager.updateAutoReplayText(null);
    }
    
    // Reset automatic mode
    this.automaticModeStartTime = null;
    this.automaticModeCompletions = 0;
    
    // Results already applied in endBattle, just clear pending results
    this.pendingBattleResults = null;
    
    // Return to main menu
    this.uiManager.showMainMenu();
}
    
    applyBattleResults() {
    if (!this.pendingBattleResults) return;
    
    const results = this.pendingBattleResults;
    
    // Apply gold changes - add to appropriate stashes
    results.heroResults.forEach(result => {
        if (result.survived || result.gold) {
            const familyName = this.getClassFamily(result.hero.className, result.hero.classTier);
            if (result.gold) {
                this.stashes[familyName].gold += result.gold;
            }
            
            // Add items to stash
            if (result.item) {
                this.stashes[familyName].items.push(result.item);
                
                // Check for collection
                if (result.survived) {
                    this.checkItemForCollection(result.item, result.hero.name, result.hero.displayClassName);
                }
            }
        }
    });
    
    // Reset pending exp for all heroes (already applied in showBattleResults)
    results.heroResults.forEach(result => {
        result.hero.pendingExp = 0;
    });

    // Mark dungeon or arena as completed if victory
if (results.victory) {
            console.log("Mode");
        console.log(this.currentBattleMode);
    if (this.currentBattleMode === 'arena' && results.currentArenaTeam !== null) {
        // Arena completion - count deaths
        const deathCount = results.partyDeaths || 0;
        this.markArenaTeamComplete(results.currentArenaTeam, results.time, deathCount);
    } else if (this.currentDungeon) {
        // Dungeon completion
        this.markDungeonComplete(this.currentDungeon.id, results.time);
    }
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after battle completion

}
}

    addExpToHero(hero, expAmount) {
        if (hero.level >= 500) return; // Max level
        
        hero.exp += expAmount;
        
        // Handle level ups
        while (hero.exp >= hero.expToNext && hero.level < 500) {
            hero.exp -= hero.expToNext;
            hero.level++;
            hero.expToNext = hero.calculateExpToNext();
            
            // Update abilities if needed
            hero.abilities = hero.getClassAbilities();
            
            console.log(`${hero.name} leveled up to ${hero.level}!`);
        }
        
        // Cap exp at max level
        if (hero.level >= 500) {
            hero.exp = 0;
            hero.expToNext = 0;
        }
    }
}
