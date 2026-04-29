// saveManager.js - Handles all save/load operations with data validation
class SaveManager {
    constructor() {
        this.version = '2.0.0'; // Bumped version for new save format
        this.maxSaveSlots = 3;
        this.currentSlot = null;
        this.autoSaveInterval = 60000; // Auto-save every 60 seconds
        this.autoSaveTimer = null;
        this.defaultSlot = this.loadDefaultSlot();
        
        // Encryption key - in production, this should be more secure
        this.encryptionKey = 'TEVE_2025_TWILIGHT';
    }

    // Initialize save manager
    init(game) {
        this.game = game;
        this.startAutoSave();
    }

    // Load default slot preference
loadDefaultSlot() {
    const saved = localStorage.getItem('teveDefaultSlot');
    return saved ? parseInt(saved) : null;
}

// Set default slot
setDefaultSlot(slot) {
    this.defaultSlot = slot;
    if (slot) {
        localStorage.setItem('teveDefaultSlot', slot.toString());
    } else {
        localStorage.removeItem('teveDefaultSlot');
    }
}

// Check for default save and auto-load
autoLoadDefaultSave() {
    const slots = this.getSaveSlots();
    
    // Check if current default slot has a valid save
    let defaultHasValidSave = false;
    if (this.defaultSlot) {
        const defaultSlotInfo = slots.find(s => s.slot === this.defaultSlot);
        defaultHasValidSave = defaultSlotInfo && defaultSlotInfo.exists && !defaultSlotInfo.corrupted;
    }
    
    // If no default set OR default doesn't have a valid save, find the best slot
    if (!this.defaultSlot || !defaultHasValidSave) {
        // Find the first slot with a valid save
        const firstValidSlot = slots.find(s => s.exists && !s.corrupted);
        
        if (firstValidSlot) {
            // Set the first valid save slot as default
            this.setDefaultSlot(firstValidSlot.slot);
            console.log(`Default slot updated to slot ${firstValidSlot.slot} (first valid save)`);
        } else {
            // No valid saves found, default to slot 1
            this.setDefaultSlot(1);
            console.log('No valid saves found, defaulting to slot 1');
        }
    }
    
    // Always set current slot to default slot
    this.currentSlot = this.defaultSlot;
    
    // Try to load from default slot if it has a save
    const defaultSlotInfo = slots.find(s => s.slot === this.defaultSlot);
    
    if (defaultSlotInfo && defaultSlotInfo.exists && !defaultSlotInfo.corrupted) {
        console.log(`Auto-loading save from default slot ${this.defaultSlot}`);
        return this.loadFromSlot(this.defaultSlot);
    } else {
        console.log(`Default slot ${this.defaultSlot} is empty, starting fresh`);
        return false;
    }
}

// Update the deleteSlot method to handle default slot
deleteSlot(slot) {
    if (confirm(`Are you sure you want to delete Save Slot ${slot}? This cannot be undone!`)) {
        localStorage.removeItem(`teveSave_slot${slot}`);
        
        // If deleting current slot, clear it
        if (this.currentSlot === slot) {
            this.currentSlot = null;
        }
        
        // If deleting default slot, clear default
        if (this.defaultSlot === slot) {
            this.setDefaultSlot(null);
        }
        
        return true;
    }
    return false;
}

    // Start auto-save timer
    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = setInterval(() => {
            if (this.currentSlot !== null) {
                this.saveToSlot(this.currentSlot, true); // Silent auto-save
            }
        }, this.autoSaveInterval);
    }

    // Get all save slots info
    getSaveSlots() {
        const slots = [];
        
        for (let i = 1; i <= this.maxSaveSlots; i++) {
            const saveKey = `teveSave_slot${i}`;
            const savedData = localStorage.getItem(saveKey);
            
            if (savedData) {
                try {
                    const decrypted = this.decrypt(savedData);
                    const saveData = JSON.parse(decrypted);
                    
                    // Validate save data
                    if (this.validateSaveData(saveData)) {
                        slots.push({
                            slot: i,
                            exists: true,
                            heroCount: saveData.heroes.length,
                            highestLevel: Math.max(...saveData.heroes.map(h => h.level)),
                            playtime: saveData.playtime || 0,
                            lastSaved: saveData.timestamp,
                            version: saveData.version
                        });
                    } else {
                        slots.push({ slot: i, exists: false, corrupted: true });
                    }
                } catch (e) {
                    slots.push({ slot: i, exists: false, corrupted: true });
                }
            } else {
                slots.push({ slot: i, exists: false });
            }
        }
        
        return slots;
    }

    // Save game to specific slot
    saveToSlot(slot, silent = false) {
        if (!this.game) return false;
        
        try {
            const saveData = this.createSaveData();
            const validated = this.validateSaveData(saveData);
            
            if (!validated) {
                if (!silent) alert('Failed to validate save data!');
                return false;
            }
            
            // Add checksum
            saveData.checksum = this.generateChecksum(saveData);
            
            // Encrypt and save
            const encrypted = this.encrypt(JSON.stringify(saveData));
            localStorage.setItem(`teveSave_slot${slot}`, encrypted);
            
            // Update current slot
            this.currentSlot = slot;

            // Update UI to show current slot if save/load screen is open
if (this.game.currentScreen === 'saveLoadScreen') {
    this.game.uiManager.updateSaveSlots();
}
            
            if (!silent) {
                this.game.uiManager.showSaveNotification(`Game saved to Slot ${slot}`);
            }
            
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            if (!silent) alert('Failed to save game!');
            return false;
        }
    }

    // Load game from specific slot
    loadFromSlot(slot) {
        try {
            const savedData = localStorage.getItem(`teveSave_slot${slot}`);
            if (!savedData) {
                alert('No save data found in this slot!');
                return false;
            }
            
            // Decrypt
            const decrypted = this.decrypt(savedData);
            const saveData = JSON.parse(decrypted);
            
            // Validate checksum
            const checksum = saveData.checksum;
            delete saveData.checksum;
            
            if (checksum !== this.generateChecksum(saveData)) {
                alert('Save data appears to be corrupted or tampered with!');
                return false;
            }
            
            // Validate save data structure
            if (!this.validateSaveData(saveData)) {
                alert('Invalid save data format!');
                return false;
            }
            
            // Check if this is an old version save that needs migration
            if (this.needsMigration(saveData)) {
                console.log('Migrating old save format to new format...');
                saveData = this.migrateSaveData(saveData);
            }
            
            // Apply save data to game
            this.applySaveData(saveData);
            
            // Update current slot
            this.currentSlot = slot;

            // Update UI to show current slot if save/load screen is open
if (this.game.uiManager && this.game.currentScreen === 'saveLoadScreen') {
    this.game.uiManager.updateSaveSlots();
}
            
            // Show success message
if (this.game.uiManager) {
    // Check if this is an auto-load (no UI manager means we're still loading)
    if (!document.getElementById('gameContainer') || document.getElementById('gameContainer').style.display === 'none') {
        // Queue notification for after UI is ready
        setTimeout(() => {
            this.game.uiManager.showAutoLoadNotification(slot);
        }, 500);
    } else {
        this.game.uiManager.showSaveNotification(`Game loaded from Slot ${slot}`);
    }
}
            
            return true;
        } catch (e) {
            console.error('Load failed:', e);
            alert('Failed to load save data!');
            return false;
        }
    }

    // Delete save slot
    deleteSlot(slot) {
        if (confirm(`Are you sure you want to delete Save Slot ${slot}? This cannot be undone!`)) {
            localStorage.removeItem(`teveSave_slot${slot}`);
            
            // If deleting current slot, clear it
            if (this.currentSlot === slot) {
                this.currentSlot = null;
            }
            
            return true;
        }
        return false;
    }

    // Check if save data needs migration
    needsMigration(saveData) {
        // Check version or look for old format indicators
        if (!saveData.version || saveData.version < '2.0.0') {
            return true;
        }
        
        // Check if items have the old format (storing name, level, etc)
        if (saveData.heroes && saveData.heroes[0] && saveData.heroes[0].gear) {
            const firstItem = Object.values(saveData.heroes[0].gear).find(item => item !== null);
            if (firstItem && firstItem.name) {
                return true; // Old format stores name
            }
        }
        
        return false;
    }

    // Migrate old save data to new format
    migrateSaveData(saveData) {
        console.log('Migrating save data from old format...');
        
        // Migrate items in hero gear
        if (saveData.heroes) {
            saveData.heroes.forEach(heroData => {
                if (heroData.gear) {
                    Object.keys(heroData.gear).forEach(slot => {
                        if (heroData.gear[slot]) {
                            heroData.gear[slot] = this.migrateItem(heroData.gear[slot]);
                        }
                    });
                }
                
                // Remove the 'initial' stats if present (let it be recalculated)
                delete heroData.initial;
            });
        }
        
        // Migrate items in stashes
        if (saveData.stashes) {
            Object.keys(saveData.stashes).forEach(family => {
                if (saveData.stashes[family].items) {
                    saveData.stashes[family].items = saveData.stashes[family].items.map(item => 
                        this.migrateItem(item)
                    );
                }
            });
        }
        
        // Update version
        saveData.version = this.version;
        
        return saveData;
    }

    // Migrate a single item to new format
    migrateItem(oldItem) {
        if (!oldItem) return null;
        
        // New format only stores essential data
        return {
            id: oldItem.id,
            quality1: oldItem.quality1 || 0,
            quality2: oldItem.quality2 || 0,
            quality3: oldItem.quality3 || 0,
            quality4: oldItem.quality4 || 0,
            quality5: oldItem.quality5 || 0,
            refined: oldItem.refined || false
        };
    }

    // Create save data object
    createSaveData() {
        const game = this.game;
        
        return {
            version: this.version,
            timestamp: new Date().toISOString(),
            playtime: this.calculatePlaytime(),
            
            // Heroes - now without 'initial' stats
            heroes: game.heroes.map(hero => ({
                name: hero.name,
                gender: hero.gender,
                className: hero.className,
                level: hero.level,
                exp: hero.exp,
                expToNext: hero.expToNext,
                awakened: hero.awakened,
                // Remove 'initial' - it will be loaded from class data
                gear: {
                    head: this.serializeItem(hero.gear.head),
                    chest: this.serializeItem(hero.gear.chest),
                    legs: this.serializeItem(hero.gear.legs),
                    weapon: this.serializeItem(hero.gear.weapon),
                    offhand: this.serializeItem(hero.gear.offhand),
                    trinket: this.serializeItem(hero.gear.trinket)
                }
            })),
            
            // Stashes
            stashes: Object.entries(game.stashes).reduce((acc, [family, stash]) => {
                acc[family] = {
                    gold: stash.gold,
                    items: stash.items.map(item => this.serializeItem(item))
                };
                return acc;
            }, {}),
            
            // Progression
            progression: {
                unlockedFeatures: game.progression.unlockedFeatures,
                unlockedTiers: game.progression.unlockedTiers,
                completedDungeons: game.progression.completedDungeons,
                completedArenas: game.progression.completedArenas
            },
            
            // Collection log
            collectionLog: game.collectionLog,
            
            // Settings
            settings: {
                sortSettings: game.sortSettings,
                autoBattle: game.autoBattle,
                autoReplay: game.autoReplay,
                tutorialCompleted: game.tutorialCompleted
            },
            
            // Current state (optional)
            currentState: {
                currentScreen: game.currentScreen,
                selectedHero: game.uiManager.selectedHero,
                currentTab: game.uiManager.currentTab
            }
        };
    }

    // Apply save data to game
    applySaveData(saveData) {
        const game = this.game;
        
        // Clear existing data
        game.heroes = [];
        
        // Load heroes
        saveData.heroes.forEach(heroData => {
            const hero = new Hero(heroData.className);
            hero.name = heroData.name;
            hero.gender = heroData.gender;
            hero.level = heroData.level;
            hero.exp = heroData.exp;
            hero.expToNext = heroData.expToNext;
            hero.awakened = heroData.awakened || false;
            
            // Don't load 'initial' - let the hero class calculate it from the class data
            
            // Load gear
            Object.entries(heroData.gear).forEach(([slot, itemData]) => {
                if (itemData) {
                    hero.gear[slot] = this.deserializeItem(itemData);
                }
            });
            
            // Update gear stats
            hero.updateGearStats();
            
            // Update abilities for current level
            hero.abilities = hero.getClassAbilities();
            
            game.heroes.push(hero);
        });
        
        // Load stashes
        Object.entries(saveData.stashes).forEach(([family, stashData]) => {
            game.stashes[family] = {
                gold: stashData.gold,
                items: stashData.items.map(itemData => this.deserializeItem(itemData))
            };
        });
        
        // Load progression
        game.progression = saveData.progression;

        game.calculateMaxPartySize(); // Recalculate based on actual completions
        
        // Load collection log
        game.collectionLog = saveData.collectionLog || {};
        
        // Load settings
        if (saveData.settings) {
            game.sortSettings = saveData.settings.sortSettings || game.sortSettings;
            game.autoBattle = saveData.settings.autoBattle || false;
            game.autoReplay = saveData.settings.autoReplay || false;
            game.tutorialCompleted = saveData.settings.tutorialCompleted || false;
        }
        
        // Update UI toggles
        const autoBattleToggle = document.getElementById('autoModeToggle');
        if (autoBattleToggle) autoBattleToggle.checked = game.autoBattle;
        const autoReplayToggle = document.getElementById('autoReplayToggle');
        if (autoReplayToggle) autoReplayToggle.checked = game.autoReplay;
        
        // Mark tutorial as checked so it doesn't restart
        game.hasCheckedForTutorial = true;
        
        // Go to splash screen
game.uiManager.showSplashScreen();

// Set up splash screen handler
const splashHandler = (e) => {
    if (game.currentScreen === 'splashScreen') {
        e.preventDefault();
        document.removeEventListener('keydown', splashHandler);
        document.removeEventListener('click', splashHandler);
        game.uiManager.showMainMenu();
    }
};

// Add event listeners after a short delay
setTimeout(() => {
    document.addEventListener('keydown', splashHandler);
    document.addEventListener('click', splashHandler);
}, 100);
    }

    // Serialize item for saving - NEW MINIMAL FORMAT
    serializeItem(item) {
        if (!item) return null;
        
        // Only save the essential data
        return {
            id: item.id,
            quality1: item.quality1,
            quality2: item.quality2,
            quality3: item.quality3,
            quality4: item.quality4,
            quality5: item.quality5,
            refined: item.refined
        };
    }

    // Deserialize item from save data - RECONSTRUCT FROM TEMPLATE
    deserializeItem(itemData) {
        if (!itemData) return null;
        
        // Create new item from template
        const item = new Item(itemData.id);
        
        // Apply only the saved qualities and refined state
        item.quality1 = itemData.quality1 || 0;
        item.quality2 = itemData.quality2 || 0;
        item.quality3 = itemData.quality3 || 0;
        item.quality4 = itemData.quality4 || 0;
        item.quality5 = itemData.quality5 || 0;
        item.refined = itemData.refined || false;
        
        return item;
    }

    // Generate checksum for data integrity
    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(16);
    }

    // Simple encryption (base64 + rotation)
    encrypt(text) {
        // Convert to base64
        let encrypted = btoa(text);
        
        // Rotate characters based on key
        let rotated = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i);
            const keyChar = this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
            rotated += String.fromCharCode((charCode + keyChar) % 256);
        }
        
        return btoa(rotated);
    }

    // Simple decryption
    decrypt(encrypted) {
        try {
            // Decode outer base64
            const rotated = atob(encrypted);
            
            // Reverse rotation
            let decrypted = '';
            for (let i = 0; i < rotated.length; i++) {
                const charCode = rotated.charCodeAt(i);
                const keyChar = this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
                decrypted += String.fromCharCode((charCode - keyChar + 256) % 256);
            }
            
            // Decode inner base64
            return atob(decrypted);
        } catch (e) {
            throw new Error('Decryption failed');
        }
    }

    // Validate save data structure
    validateSaveData(data) {
        // Check required fields
        if (!data.version || !data.timestamp || !data.heroes || !data.stashes) {
            return false;
        }
        
        // Validate heroes
        if (!Array.isArray(data.heroes)) return false;
        
        for (const hero of data.heroes) {
            if (!hero.name || !hero.className || typeof hero.level !== 'number') {
                return false;
            }
        }
        
        // Validate stashes
        if (typeof data.stashes !== 'object') return false;
        
        // Basic validation passed
        return true;
    }

    // Calculate playtime (would need to track session start time)
    calculatePlaytime() {
        // For now, return 0. In a full implementation, track session time
        return 0;
    }

    // Export save to file
    exportSave(slot) {
        const saveData = localStorage.getItem(`teveSave_slot${slot}`);
        if (!saveData) {
            alert('No save data in this slot!');
            return;
        }
        
        const blob = new Blob([saveData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TEVE_Save_Slot${slot}_${new Date().toISOString().split('T')[0]}.sav`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Import save from file
    async importSave(file, slot) {
        try {
            const text = await file.text();
            
            // Validate it's encrypted save data
            try {
                const decrypted = this.decrypt(text);
                const saveData = JSON.parse(decrypted);
                
                if (!this.validateSaveData(saveData)) {
                    alert('Invalid save file!');
                    return false;
                }
            } catch (e) {
                alert('Invalid or corrupted save file!');
                return false;
            }
            
            // Save to slot
            localStorage.setItem(`teveSave_slot${slot}`, text);
            alert(`Save imported to Slot ${slot}!`);
            return true;
        } catch (e) {
            alert('Failed to import save file!');
            return false;
        }
    }
}

// Create global save manager instance
window.saveManager = new SaveManager();
