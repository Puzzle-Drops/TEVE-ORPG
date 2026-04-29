// Loading manager
class LoadingManager {
    constructor() {
        this.totalAssets = 22; // 6 JSON files + 14 JS files + map image
        this.loadedAssets = 0;
        this.failedAssets = []; // Track which assets failed
        this.preloadedImages = {}; // Store preloaded images
        this.loadingScreen = document.getElementById('loadingScreen');
        this.loadingFill = document.querySelector('.loadingFill');
        this.loadingText = document.querySelector('.loadingText');
        this.loadingError = document.querySelector('.loadingError');
        this.gameContainer = document.getElementById('gameContainer');
    }

    updateProgress(assetName) {
        this.loadedAssets++;
        const progress = (this.loadedAssets / this.totalAssets) * 100;
        this.loadingFill.style.width = progress + '%';
        this.loadingText.textContent = `Loading ${assetName}... (${this.loadedAssets}/${this.totalAssets})`;
        
        if (this.loadedAssets === this.totalAssets) {
            this.loadingText.textContent = 'Starting game...';
            setTimeout(() => this.hideLoadingScreen(), 500);
        }
    }

    showError(error) {
        console.error('Loading error:', error);
        this.loadingText.style.display = 'none';
        
        // Build detailed error message
        let errorMessage = '<p>Failed to load game resources:</p><ul style="text-align: left; margin: 10px 20px;">';
        this.failedAssets.forEach(asset => {
            errorMessage += `<li>${asset}</li>`;
        });
        errorMessage += '</ul><p>Please refresh the page to try again.</p>';
        
        this.loadingError.innerHTML = errorMessage;
        this.loadingError.style.display = 'block';
    }
    
    async loadScript(src, name) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                this.updateProgress(name);
                resolve();
            };
            script.onerror = () => {
                this.failedAssets.push(name);
                reject(new Error(`Failed to load ${name}`));
            };
            document.head.appendChild(script);
        });
    }
    
    async loadImage(src, name) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            this.preloadedImages[name] = img;
            this.updateProgress(name);
            resolve(img);
        };
        img.onerror = () => {
            this.failedAssets.push(name);
            reject(new Error(`Failed to load ${name}`));
        };
        img.src = src;
    });
}

hideLoadingScreen() {
    this.loadingScreen.style.display = 'none';
    this.gameContainer.style.display = 'flex';
    
    // Initialize scaling after game is visible
    if (window.scalingSystem) {
        window.scalingSystem.updateScale();
    }
}

    
}

const loadingManager = new LoadingManager();

// Initialize data loading
async function loadGameData() {
    // First load all JavaScript files
    const scriptLoaders = [
        { src: 'spellLogic.js', name: 'Spell Logic' },
        { src: 'battleUnit.js', name: 'Battle Unit' },
        { src: 'battleAI.js', name: 'Battle AI' },
        { src: 'battleAnimations.js', name: 'Battle Animations' },
        { src: 'battle.js', name: 'Battle System' },
        { src: 'devConsole.js', name: 'Dev Console' },
        { src: 'item.js', name: 'Item System' },
        { src: 'autosell.js', name: 'Autosell System' },
        { src: 'uiManager.js', name: 'UI Manager' },
        { src: 'hero.js', name: 'Hero System' },
        { src: 'enemy.js', name: 'Enemy System' },
        { src: 'arena.js', name: 'Arena System' },
        { src: 'tutorial.js', name: 'Tutorial System' },
        { src: 'saveManager.js', name: 'Save Manager' },
        { src: 'game.js', name: 'Game Core' }
    ];
    
    // Load scripts sequentially to maintain dependencies
    for (const script of scriptLoaders) {
        try {
            loadingManager.loadingText.textContent = `Loading ${script.name}...`;
            await loadingManager.loadScript(script.src, script.name);
        } catch (error) {
            console.error(`Failed to load ${script.name}:`, error);
            loadingManager.failedAssets.push(script.name);
        }
    }
    
    // Preload critical images
try {
    loadingManager.loadingText.textContent = 'Loading map background...';
    await loadingManager.loadImage('https://puzzle-drops.github.io/TEVE/img/menu/map.png', 'Map Background');
} catch (error) {
    console.error('Failed to load map background:', error);
    // Don't treat this as critical - game can still work without preloaded image
}
    
    // Then load data files
    const assetLoaders = [
        {
            name: 'spells.json',
            load: async () => {
                loadingManager.loadingText.textContent = 'Loading spells...';
                spellManager = new SpellManager();
                await spellManager.loadSpells();
                loadingManager.updateProgress('spells');
            }
        },
        {
    name: 'heroes.json',
    load: async () => {
        loadingManager.loadingText.textContent = 'Loading heroes...';
        const heroesResponse = await fetch('heroes.json');
        if (!heroesResponse.ok) throw new Error('Failed to load heroes.json');
        const heroData = await heroesResponse.json();
        console.log('Hero data loaded');
        
        // Initialize unitData with hero data
        unitData = {
            classes: heroData.classes,
            classFamilies: heroData.classFamilies,
            promotionRequirements: heroData.promotionRequirements,
            promotionCosts: heroData.promotionCosts,
            enemies: {} // Will be populated when enemies.json loads
        };
        
        loadingManager.updateProgress('heroes');
    }
},
{
    name: 'enemies.json',
    load: async () => {
        loadingManager.loadingText.textContent = 'Loading enemies...';
        const enemiesResponse = await fetch('enemies.json');
        if (!enemiesResponse.ok) throw new Error('Failed to load enemies.json');
        const enemyData = await enemiesResponse.json();
        console.log('Enemy data loaded');
        
        // Add enemies to existing unitData
        if (!unitData) {
            throw new Error('Heroes must be loaded before enemies');
        }
        unitData.enemies = enemyData;
        
        console.log('Complete unit data assembled');
        loadingManager.updateProgress('enemies');
    }
},
        {
            name: 'dungeons.json',
            load: async () => {
                loadingManager.loadingText.textContent = 'Loading dungeons...';
                const dungeonsResponse = await fetch('dungeons.json');
                if (!dungeonsResponse.ok) throw new Error('Failed to load dungeons.json');
                dungeonData = await dungeonsResponse.json();
                console.log('Dungeon data loaded');
                loadingManager.updateProgress('dungeons');
            }
        },
        {
            name: 'items.json',
            load: async () => {
                loadingManager.loadingText.textContent = 'Loading items...';
                const itemsResponse = await fetch('items.json');
                if (!itemsResponse.ok) throw new Error('Failed to load items.json');
                itemData = await itemsResponse.json();
                console.log('Item data loaded');
                loadingManager.updateProgress('items');
            }
        },
        {
            name: 'arena.json',
            load: async () => {
                loadingManager.loadingText.textContent = 'Loading arena...';
                const arenaResponse = await fetch('arena.json');
                if (!arenaResponse.ok) throw new Error('Failed to load arena.json');
                arenaData = await arenaResponse.json();
                console.log('Arena data loaded');
                loadingManager.updateProgress('arena');
            }
        }
    ];
    
    let hasErrors = false;
    
    // Check if we had script loading errors
    if (loadingManager.failedAssets.length > 0) {
        hasErrors = true;
    }
    
    // Load data assets
    for (const asset of assetLoaders) {
        try {
            await asset.load();
        } catch (error) {
            console.error(`Failed to load ${asset.name}:`, error);
            loadingManager.failedAssets.push(asset.name);
            hasErrors = true;
        }
    }
    
    if (hasErrors) {
        loadingManager.showError(new Error('Some assets failed to load'));
        return false;
    }
    
    // Add a small delay to ensure all classes are fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
}

// Make preloaded images globally accessible
window.preloadedImages = loadingManager.preloadedImages;
