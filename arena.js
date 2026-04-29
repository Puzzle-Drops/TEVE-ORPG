// Arena System
class Arena {
    constructor(game) {
        this.game = game;
    }
    
enterSparMode() {
    // Reset party selection first
    this.game.selectedParty = [null, null, null, null, null];
    
    // Set arena mode
    this.game.arenaMode = 'spar';
    
    // Load arena teams from data
    this.game.arenaTeams = arenaData ? arenaData.teams : [];
    
    // Start at first accessible team (should always be 0, but just in case)
    this.game.currentArenaTeam = 0;
    while (this.game.currentArenaTeam < this.game.arenaTeams.length && 
           !this.game.isArenaTeamAccessible(this.game.currentArenaTeam)) {
        this.game.currentArenaTeam++;
    }
    
    // If no accessible teams, default to 0
    if (this.game.currentArenaTeam >= this.game.arenaTeams.length) {
        this.game.currentArenaTeam = 0;
    }
    
    // Get selected party heroes (don't auto-select like dungeons)
    let partyHeroes = [];
    if (this.game.selectedParty && this.game.selectedParty.some(h => h !== null)) {
        // Use existing selection
        partyHeroes = this.game.selectedParty
            .filter(index => index !== null)
            .map(index => this.game.heroes[index]);
    } else {
        // Start with empty selection like dungeons
        this.game.selectedParty = [null, null, null, null, null];
    }
    
    // Generate opponents from first team
    if (this.game.arenaTeams.length > 0) {
        this.game.arenaOpponents = this.generateArenaTeamOpponents(this.game.arenaTeams[0]);
    } else {
        this.game.arenaOpponents = [];
    }
    
    // Show party select in arena mode
    this.game.uiManager.showPartySelect('arena');
}
    
generateArenaTeamOpponents(teamData) {
    const opponents = [];
    
    teamData.heroes.forEach(heroData => {
        // Check awakened status BEFORE creating the enemy
        let isAwakened = false;
        const classData = unitData.classes[heroData.className];
        if (classData && classData.tier >= 4 && heroData.level >= 400) {
            isAwakened = true;
        }
        
        // Create an Enemy object that looks like a hero
        const enemy = new Enemy(heroData.className, heroData.level);
        
        // Override the name
        enemy.name = heroData.name;
        enemy.gender = heroData.gender;
        
        // Set awakened status if needed
        if (isAwakened) {
            enemy.awakened = true;
            // Re-get abilities now that awakened is set
            enemy.abilities = enemy.getClassAbilities(classData.spells);
        }
    
        
        // Equip gear properly using the new gear system
        Object.entries(heroData.gear || {}).forEach(([slot, gearData]) => {
            const item = new Item(gearData.id);
            // Set specific quality values
            item.quality1 = gearData.quality[0] || 0;
            item.quality2 = gearData.quality[1] || 0;
            item.quality3 = gearData.quality[2] || 0;
            item.quality4 = gearData.quality[3] || 0;
            item.quality5 = gearData.quality[4] || 0;
            item.refined = gearData.refined || false;
            
            // Use the enemy's equipItem method
            enemy.equipItem(item, slot);
        });
        
        opponents.push(enemy);
    });
    
    return opponents;
}
    
    generateHeroGear(hero, targetLevel) {
        const gear = {
            weapon: null,
            offhand: null,
            head: null,
            chest: null,
            legs: null,
            trinket: null
        };
        
        // Find all items within 15 levels of target
        const minLevel = Math.max(1, targetLevel - 15);
        const maxLevel = targetLevel + 15;
        
        // Get available items for each slot
        const itemsBySlot = {
            weapon: [],
            offhand: [],
            head: [],
            chest: [],
            legs: [],
            trinket: []
        };
        
        // Collect items by slot
        Object.keys(itemData.items).forEach(itemId => {
            const itemTemplate = itemData.items[itemId];
            if (itemTemplate.level >= minLevel && itemTemplate.level <= maxLevel) {
                if (itemsBySlot[itemTemplate.slot]) {
                    itemsBySlot[itemTemplate.slot].push(itemId);
                }
            }
        });
        
        // Generate an item for each slot
        Object.keys(gear).forEach(slot => {
            if (itemsBySlot[slot].length > 0) {
                // Pick a random item from this slot
                const itemId = itemsBySlot[slot][Math.floor(Math.random() * itemsBySlot[slot].length)];
                const item = new Item(itemId);
                
                // Set all qualities to 4/5 (80%)
                item.quality1 = 4;
                if (item.roll2) item.quality2 = 4;
                if (item.roll3) item.quality3 = 4;
                if (item.roll4) item.quality4 = 4;
                
                gear[slot] = item;
            }
        });
        
        return gear;
    }
    
}
