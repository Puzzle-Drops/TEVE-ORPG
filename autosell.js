// autosell.js - Autosell system for managing item filtering and selling
class AutoSell {
    constructor(game) {
        this.game = game;
        
        // Settings
        this.enabled = false;
        this.preset = 'basic'; // basic, strict, balanced, relaxed, custom
        
        // Custom criteria
        this.criteria = {
            levelBelow: null,
            scoreBelow: null,
            qualityBelow: null,
            starsBelow: null,
            sellRarities: {
                green: false,
                blue: false,
                purple: false,
                red: false
            }
        };
        
        // Statistics
        this.stats = {
            itemsSold: 0,
            goldGained: 0,
            itemsSaved: 0
        };
        
        // Preset definitions
        this.presets = {
            basic: {
                description: "Basic preset sells any items below the item score of your current hero's item in that slot. If you don't know what you are doing, select basic preset.",
                criteria: null // Special handling for basic
            },
            strict: {
                levelBelow: null,
                scoreBelow: null,
                qualityBelow: 80,
                starsBelow: 2,
                sellRarities: {
                    green: true,
                    blue: true,
                    purple: true,
                    red: false
                }
            },
            balanced: {
                levelBelow: null,
                scoreBelow: null,
                qualityBelow: 60,
                starsBelow: 0,
                sellRarities: {
                    green: true,
                    blue: true,
                    purple: false,
                    red: false
                }
            },
            relaxed: {
                levelBelow: null,
                scoreBelow: null,
                qualityBelow: 50,
                starsBelow: 0,
                sellRarities: {
                    green: true,
                    blue: false,
                    purple: false,
                    red: false
                }
            }
        };
        
        this.loadSettings();
    }
    
    loadSettings() {
        const saved = localStorage.getItem('teveAutosellSettings');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.enabled = data.enabled || false;
                this.preset = data.preset || 'basic';
                this.criteria = data.criteria || this.criteria;
                this.stats = data.stats || this.stats;
            } catch (e) {
                console.error('Failed to load autosell settings:', e);
            }
        }
    }
    
    saveSettings() {
        const data = {
            enabled: this.enabled,
            preset: this.preset,
            criteria: this.criteria,
            stats: this.stats
        };
        localStorage.setItem('teveAutosellSettings', JSON.stringify(data));
    }
    
    resetStats() {
        this.stats = {
            itemsSold: 0,
            goldGained: 0,
            itemsSaved: 0
        };
        this.saveSettings();
    }
    
    applyPreset(presetName) {
        if (presetName === 'custom') {
            // Don't change criteria for custom
            this.preset = 'custom';
            return;
        }
        
        this.preset = presetName;
        
        if (presetName === 'basic') {
            // Basic preset doesn't use criteria
            return;
        }
        
        const preset = this.presets[presetName];
        if (preset) {
            this.criteria = JSON.parse(JSON.stringify(preset)); // Deep copy
        }
    }
    
    shouldSellItem(item, hero) {
        if (!this.enabled) return false;
        
        // Basic preset - compare with equipped item score
        if (this.preset === 'basic') {
            const equippedItem = hero.gear[item.slot];
            if (!equippedItem) {
                // No equipped item, keep the new one
                return false;
            }
            
            // Compare item scores
            const newScore = item.getItemScore();
            const equippedScore = equippedItem.getItemScore();
            
            return newScore < equippedScore;
        }
        
        // Other presets - use criteria with OR logic
        const criteria = this.criteria;
        
        // Check level
        if (criteria.levelBelow !== null && criteria.levelBelow !== '') {
            const level = parseInt(criteria.levelBelow);
            if (!isNaN(level) && item.level < level) {
                return true;
            }
        }
        
        // Check score
        if (criteria.scoreBelow !== null && criteria.scoreBelow !== '') {
            const score = parseInt(criteria.scoreBelow);
            if (!isNaN(score) && item.getItemScore() < score) {
                return true;
            }
        }
        
        // Check quality
        if (criteria.qualityBelow !== null && criteria.qualityBelow !== '') {
            const quality = parseInt(criteria.qualityBelow);
            if (!isNaN(quality) && item.getQualityPercent() < quality) {
                return true;
            }
        }
        
        // Check stars (perfect rolls)
        if (criteria.starsBelow !== null && criteria.starsBelow !== '') {
            const stars = parseInt(criteria.starsBelow);
            if (!isNaN(stars) && item.getStars().count < stars) {
                return true;
            }
        }
        
        // Check rarity
        const rarity = item.getRarity();
        if (criteria.sellRarities[rarity]) {
            return true;
        }
        
        // No criteria matched, don't sell
        return false;
    }
    
    processItemRoll(itemRoll) {
        if (!this.enabled || !itemRoll.item) return itemRoll;
        
        const item = itemRoll.item;
        const hero = itemRoll.hero;
        
        // Check if item should be sold
        if (this.shouldSellItem(item, hero)) {
            // Update stats
            this.stats.itemsSold++;
            this.stats.goldGained += item.sellcost;
            
            // Convert item to gold

            console.log('[AUTOSELL] Item sold:', item.name, 'for', item.sellcost, 'gold');
            console.log('[AUTOSELL] Sold item object:', item);

            return {
                hero: hero,
                gold: itemRoll.gold + item.sellcost,
                item: null,
                soldItem: item,
                autosold: true
            };
        } else {
            // Keep the item
            this.stats.itemsSaved++;
            return itemRoll;
        }
    }
}
