// UI Manager - Handles all UI rendering and DOM manipulation
class UIManager {
    constructor(game) {
        this.game = game;
        
        // UI state variables (moved from game.js)
        this.selectedHero = 0;
        this.currentTab = 'info';
        this.expandedDungeon = null;
        this.currentGearFilter = null;
        this.currentStashFilter = null;
        this.currentSkillIndex = undefined;
        this.currentPreviewWave = 0;
        this.selectedCollectionTier = 'Easy';
        
        // UI state
        this.currentTooltips = {
            item: null,
            ability: null,
            stat: null,
            gold: null
        };
        
        // Bind methods to preserve context
        this.showItemTooltip = this.showItemTooltip.bind(this);
        this.hideItemTooltip = this.hideItemTooltip.bind(this);
        this.showAbilityTooltip = this.showAbilityTooltip.bind(this);
        this.hideAbilityTooltip = this.hideAbilityTooltip.bind(this);
    }

// Screen Management
hideAllScreens() {
    document.getElementById('splashScreen').style.display = 'none';
    document.getElementById('mainMenuScreen').style.display = 'none';
    document.getElementById('battleScene').style.display = 'none';
    document.getElementById('heroesScreen').style.display = 'none';
    document.getElementById('stashScreen').style.display = 'none';
    document.getElementById('partySelectScreen').style.display = 'none';
    document.getElementById('individualStashScreen').style.display = 'none';
    document.getElementById('collectionLogScreen').style.display = 'none';
    document.getElementById('dungeonSelectScreen').style.display = 'none';
    document.getElementById('arenaScreen').style.display = 'none';
    document.getElementById('saveLoadScreen').style.display = 'none';  // ADD THIS LINE
}

showSaveLoad() {
    this.hideAllScreens();
    this.closeHeroInfo();
    this.game.currentScreen = 'saveLoadScreen';
    document.getElementById('saveLoadScreen').style.display = 'block';
    this.updateSaveSlots();
}

updateSaveSlots() {
    const slots = saveManager.getSaveSlots();
    
    slots.forEach(slotInfo => {
        const slotElement = document.getElementById(`saveSlot${slotInfo.slot}`);
        const infoDiv = slotElement.querySelector('.slotInfo');
        const loadBtn = slotElement.querySelector('.loadButton');
        const deleteBtn = slotElement.querySelector('.deleteButton');
        const exportBtn = slotElement.querySelector('.exportButton');
        const defaultBtn = slotElement.querySelector('.defaultButton');
        const defaultIndicator = slotElement.querySelector('.defaultIndicator');
        
        // Update default indicator
if (saveManager.defaultSlot === slotInfo.slot) {
    defaultIndicator.style.display = 'inline';
    defaultBtn.textContent = 'Remove Default';
} else {
    defaultIndicator.style.display = 'none';
    defaultBtn.textContent = 'Set Default';
}

// Remove both classes first
slotElement.classList.remove('defaultSlot');
slotElement.classList.remove('currentSlot');

// Add currentSlot class to the currently loaded slot
if (saveManager.currentSlot === slotInfo.slot) {
    slotElement.classList.add('currentSlot');
}
        
        if (slotInfo.exists && !slotInfo.corrupted) {
            const date = new Date(slotInfo.lastSaved);
            infoDiv.innerHTML = `
                <div class="slotDetails">
                    <div>Heroes: ${slotInfo.heroCount} | Max Level: ${slotInfo.highestLevel}</div>
                    <div class="slotDate">Last saved: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                </div>
            `;
            loadBtn.disabled = false;
            deleteBtn.disabled = false;
            exportBtn.disabled = false;
            defaultBtn.disabled = false;
        } else if (slotInfo.corrupted) {
            infoDiv.innerHTML = '<div class="slotCorrupted">Corrupted Save</div>';
            loadBtn.disabled = true;
            deleteBtn.disabled = false;
            exportBtn.disabled = true;
            defaultBtn.disabled = true;
        } else {
    infoDiv.innerHTML = `
        <div class="slotEmpty">Empty</div>
        <button class="newGameSlotButton" onclick="game.uiManager.startNewGameInSlot(${slotInfo.slot})">New Game</button>
    `;
    loadBtn.disabled = true;
    deleteBtn.disabled = true;
    exportBtn.disabled = true;
    defaultBtn.disabled = true;
}
    });
}

toggleDefaultSlot(slot) {
    if (saveManager.defaultSlot === slot) {
        // Remove default
        saveManager.setDefaultSlot(null);
    } else {
        // Set as default
        saveManager.setDefaultSlot(slot);
    }
    this.updateSaveSlots();
}

deleteSaveSlot(slot) {
    if (saveManager.deleteSlot(slot)) {
        this.updateSaveSlots();
    }
}

handleImportSave(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Ask which slot to import to
    const slot = prompt('Import to which slot? (1-3)');
    if (!slot || slot < 1 || slot > 3) {
        alert('Invalid slot number!');
        return;
    }
    
    saveManager.importSave(file, parseInt(slot)).then(() => {
        this.updateSaveSlots();
        event.target.value = ''; // Clear file input
    });
}

    startNewGameInSlot(slot) {
    if (confirm(`Start a new game in Slot ${slot}? This will reset all progress but won't affect other save files.`)) {
        // Store the target slot for the new game
        this.newGameTargetSlot = slot;
        
        // Reset game state
        this.game.heroes = [];
        this.game.stashes = {
            'Villager': { gold: 0, items: [] },
            'Acolyte': { gold: 0, items: [] },
            'Archer': { gold: 0, items: [] },
            'Druid': { gold: 0, items: [] },
            'Initiate': { gold: 0, items: [] },
            'Swordsman': { gold: 0, items: [] },
            'Templar': { gold: 0, items: [] },
            'Thief': { gold: 0, items: [] },
            'Witch Hunter': { gold: 0, items: [] }
        };
        this.game.progression = {
            unlockedFeatures: {
                party: true,
                stash: false,
                arena: false
            },
            unlockedTiers: ['Easy'],
            completedDungeons: {},
            completedArenas: {}
        };
        this.game.collectionLog = {};
        this.game.maxPartySize = 3;
        this.game.tutorialCompleted = false;
        this.game.hasCheckedForTutorial = false;
        
        // Set current slot to the target slot
        saveManager.currentSlot = slot;
        
        // Show splash screen
        this.showSplashScreen();
        
        // Set up splash screen handler that will start tutorial after
        const splashHandler = (e) => {
            if (this.game.currentScreen === 'splashScreen') {
                e.preventDefault();
                document.removeEventListener('keydown', splashHandler);
                document.removeEventListener('click', splashHandler);
                
                // Mark that we're starting fresh
                this.game.isNewGameStart = true;
                
                // Show main menu (which will trigger tutorial)
                this.showMainMenu();
            }
        };
        
        // Add event listeners for splash screen
        setTimeout(() => {
            document.addEventListener('keydown', splashHandler);
            document.addEventListener('click', splashHandler);
        }, 100);
    }
}

showSaveNotification(message) {
    const notification = document.getElementById('saveNotification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

    showAutoLoadNotification(slot) {
    const notification = document.getElementById('saveNotification');
    notification.textContent = `Auto-loaded from Slot ${slot}`;
    notification.style.borderColor = '#4dd0e1';
    notification.style.color = '#4dd0e1';
    notification.style.boxShadow = '0 0 20px rgba(77, 208, 225, 0.5)';
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
        // Reset styles
        notification.style.borderColor = '';
        notification.style.color = '';
        notification.style.boxShadow = '';
    }, 3000);
}

    showSplashScreen() {
        this.hideAllScreens();
        this.closeHeroInfo();
        this.game.currentScreen = 'splashScreen';
        document.getElementById('splashScreen').style.display = 'flex';
    }

    showMainMenu() {
        this.hideAllScreens();
        this.closeHeroInfo();
        this.game.currentScreen = 'mainMenuScreen';
        document.getElementById('mainMenuScreen').style.display = 'block';
        
        // Apply preloaded map image if available
    if (window.preloadedImages && window.preloadedImages['Map Background']) {
        const worldMap = document.querySelector('.worldMap');
        if (worldMap) {
            // The image is already loaded, so setting the background-image will be instant
            worldMap.style.backgroundImage = `url('${window.preloadedImages['Map Background'].src}')`;
        }
    }
        
        // Update visibility based on progression
        const stashButton = document.querySelector('.stashesButton');
        if (stashButton) {
            stashButton.style.display = this.game.progression.unlockedFeatures.stash ? '' : 'none';
        }
        
        const arenaButton = document.querySelector('.arenaButton');
        if (arenaButton) {
            arenaButton.style.display = this.game.progression.unlockedFeatures.arena ? '' : 'none';
        }
        
        // Dungeon tier orbs
        const tierOrder = this.game.getTierOrder();
        tierOrder.forEach((tier, index) => {
            const orbElement = document.querySelector(`.dungeonOrb${index}`);
            if (orbElement) {
                orbElement.style.display = this.game.progression.unlockedTiers.includes(tier) ? '' : 'none';
            }
        });

        // Handle heroes button and Easy tier based on tutorial completion
const heroesButton = document.querySelector('.heroesButton');
const easyOrb = document.querySelector('.dungeonOrb0');

if (!this.game.tutorialCompleted) {
    // Disable heroes button
    if (heroesButton) {
        //heroesButton.style.opacity = '0.5';
        heroesButton.style.pointerEvents = 'none';
        const heroesImg = heroesButton.querySelector('.menuNavImage');
        if (heroesImg) {
            heroesImg.style.cursor = 'default';
            heroesImg.onclick = (e) => { e.preventDefault(); };
        }
        const heroesPlaceholder = heroesButton.querySelector('.menuNavPlaceholder');
        if (heroesPlaceholder) {
            heroesPlaceholder.onclick = (e) => { e.preventDefault(); };
            heroesPlaceholder.style.cursor = 'default';
        }
    }
    
    // Disable Easy dungeon orb
    if (easyOrb) {
        //easyOrb.style.opacity = '0.5';
        easyOrb.style.pointerEvents = 'none';
        const easyImg = easyOrb.querySelector('.menuNavImage');
        if (easyImg) {
            easyImg.style.cursor = 'default';
            easyImg.onclick = (e) => { e.preventDefault(); };
        }
        const easyPlaceholder = easyOrb.querySelector('.menuNavPlaceholder');
        if (easyPlaceholder) {
            easyPlaceholder.onclick = (e) => { e.preventDefault(); };
            easyPlaceholder.style.cursor = 'default';
        }
    }
} else {
    // Re-enable heroes button after tutorial
    if (heroesButton) {
        //heroesButton.style.opacity = '1';
        heroesButton.style.pointerEvents = 'auto';
        const heroesImg = heroesButton.querySelector('.menuNavImage');
        if (heroesImg) {
            heroesImg.style.cursor = 'pointer';
            heroesImg.onclick = () => this.showHeroes();
        }
        const heroesPlaceholder = heroesButton.querySelector('.menuNavPlaceholder');
        if (heroesPlaceholder) {
            heroesPlaceholder.onclick = () => this.showHeroes();
            heroesPlaceholder.style.cursor = 'pointer';
        }
    }
    
    // Re-enable Easy dungeon orb after tutorial
    if (easyOrb) {
        //easyOrb.style.opacity = '1';
        easyOrb.style.pointerEvents = 'auto';
        const easyImg = easyOrb.querySelector('.menuNavImage');
        if (easyImg) {
            easyImg.style.cursor = 'pointer';
            easyImg.onclick = () => this.showDungeonBladeScreen('Easy');
        }
        const easyPlaceholder = easyOrb.querySelector('.menuNavPlaceholder');
        if (easyPlaceholder) {
            easyPlaceholder.onclick = () => this.showDungeonBladeScreen('Easy');
            easyPlaceholder.style.cursor = 'pointer';
        }
    }
}

        // Initialize trail system if not already done
        if (!this.trailCanvas) {
            this.initializeTrailSystem();
        }
        
        // Resize canvas to match window
        this.resizeTrailCanvas();

        // Check if this is first time showing main menu and player needs tutorial
    if (!this.game.hasCheckedForTutorial) {
        this.game.hasCheckedForTutorial = true;
        
        // Check if this is a new game (no heroes)
        if (this.game.heroes.length === 0) {
            // Start new game tutorial
            this.game.tutorial.newGameStart();
        }
    }
        
    }

    // Trail System Methods
    initializeTrailSystem() {
        this.trailCanvas = document.getElementById('progressionTrailCanvas');
        this.trailCtx = this.trailCanvas ? this.trailCanvas.getContext('2d') : null;
        this.portalRotation = 0;
        this.portalPulse = 0;
        
        // Trail connections with specific curve directions
        this.trailConnections = [
            { from: 'heroesButton', to: 'dungeonOrb0', tier: 'Easy', curve: 'south' },
            { from: 'dungeonOrb0', to: 'dungeonOrb1', tier: 'Medium', curve: 'east' },
            { from: 'dungeonOrb1', to: 'dungeonOrb2', tier: 'Hard', curve: 'east' },
            { from: 'dungeonOrb2', to: 'dungeonOrb3', tier: 'Forsaken', curve: 'north' },
            { from: 'dungeonOrb3', to: 'dungeonOrb4', tier: 'Nightmare', curve: 'west' },
            { from: 'dungeonOrb4', to: 'dungeonOrb5', tier: 'Hell', curve: 'west' },
            { from: 'dungeonOrb5', to: 'dungeonOrb6', tier: 'Impossible', curve: 'south' },
            { from: 'dungeonOrb6', to: 'dungeonOrb7', tier: 'Mythical', curve: 'west' },
            { from: 'dungeonOrb7', to: 'dungeonOrb8', tier: 'Divine', curve: 'west' },
            { from: 'dungeonOrb8', to: 'portal', tier: 'Ascended', special: 'to-portal' },
            { from: 'offscreen', to: 'dungeonOrb9', tier: 'Ascended', special: 'from-portal', curve: 'south' },
            { from: 'dungeonOrb9', to: 'dungeonOrb10', tier: 'Transcendent', curve: 'east' },
            { from: 'dungeonOrb10', to: 'dungeonOrb11', tier: 'Twilight', curve: 'east' }
        ];
        
        // Additional feature connections
        this.featureConnections = [
            { from: 'heroesButton', to: 'arenaButton', feature: 'arena', curve: 'east' },
            { from: 'arenaButton', to: 'stashesButton', feature: 'stash', curve: 'west' }
        ];
        
        // Start animation loop for portal
        if (this.trailCanvas) {
            this.animateTrails();
        }
    }
    
resizeTrailCanvas() {
    if (!this.trailCanvas) return;
    // Canvas should always be 1920x1080 to match game resolution
    this.trailCanvas.width = 1920;
    this.trailCanvas.height = 1080;
    this.drawProgressionTrails();
}
    
    getElementCenter(elementClass) {
    // Special positions for portal effect
    if (elementClass === 'portal') {
        const orb8 = document.querySelector('.dungeonOrb8');
        if (!orb8) return { x: 0, y: 0 };
        // Get position relative to game container, not viewport
        const gameContainer = document.getElementById('gameContainer');
        const containerRect = gameContainer.getBoundingClientRect();
        const elemRect = orb8.getBoundingClientRect();
        
        // Calculate position relative to the 1920x1080 game space
        const scaleX = 1920 / containerRect.width;
        const scaleY = 1080 / containerRect.height;
        
        return {
            x: (elemRect.left - containerRect.left) * scaleX + (elemRect.width * scaleX) / 2,
            y: (elemRect.top - containerRect.top) * scaleY - 100 // Portal position above orb 8
        };
    }
    if (elementClass === 'offscreen') {
        return {
            x: 1920 + 100, // Off screen to the right of game area
            y: 1080 - 100 // Near bottom of game area
        };
    }
    
    const elem = document.querySelector('.' + elementClass);
    if (!elem) return { x: 0, y: 0 };
    
    // Get position relative to game container
    const gameContainer = document.getElementById('gameContainer');
    const containerRect = gameContainer.getBoundingClientRect();
    const elemRect = elem.getBoundingClientRect();
    
    // Calculate position relative to the 1920x1080 game space
    const scaleX = 1920 / containerRect.width;
    const scaleY = 1080 / containerRect.height;
    
    return {
        x: (elemRect.left - containerRect.left) * scaleX + (elemRect.width * scaleX) / 2,
        y: (elemRect.top - containerRect.top) * scaleY + (elemRect.height * scaleY) / 2
    };
}
    
    drawMapTrail(from, to, curveDirection) {
        const start = this.getElementCenter(from);
        const end = this.getElementCenter(to);
        const ctx = this.trailCtx;
        
        ctx.save();
        
        // Check if this is a portal-related trail
        const isToPortal = to === 'portal';
        const isFromPortal = from === 'offscreen';
        
        // Set up the dotted line style
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]); // Dotted pattern
        ctx.lineCap = 'round';
        
        // Add subtle shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        // Draw the path
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        
        // Calculate control point based on specified curve direction
        let controlX = (start.x + end.x) / 2;
        let controlY = (start.y + end.y) / 2;
        const curveAmount = 40; // Increased from 20 for more pronounced curves
        
        switch(curveDirection) {
            case 'north':
                controlY -= curveAmount;
                break;
            case 'south':
                controlY += curveAmount;
                break;
            case 'east':
                controlX += curveAmount;
                break;
            case 'west':
                controlX -= curveAmount;
                break;
        }
        
        // Create gradient for portal fade effects
        if (isToPortal || isFromPortal) {
            const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            if (isToPortal) {
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else {
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
            }
            ctx.strokeStyle = gradient;
        }
        
        // Draw the curved path
        ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
        ctx.stroke();
        
        // Draw a second pass with lower opacity for glow effect
        if (!isToPortal && !isFromPortal) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 8;
            ctx.shadowBlur = 0;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawPortal(x, y) {
        const ctx = this.trailCtx;
        ctx.save();
        
        // Pulsating scale
        const pulseScale = 1 + Math.sin(this.portalPulse) * 0.1;
        
        // Translate to portal center for rotation
        ctx.translate(x, y);
        ctx.scale(pulseScale, pulseScale);
        
        // Outer glow effect - multiple layers for intensity
        ctx.shadowColor = '#d896ff';
        ctx.shadowBlur = 30;
        
        // First glow layer
        const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
        glowGradient.addColorStop(0, 'rgba(216, 150, 255, 0.4)');
        glowGradient.addColorStop(0.3, 'rgba(216, 150, 255, 0.3)');
        glowGradient.addColorStop(0.6, 'rgba(138, 42, 138, 0.2)');
        glowGradient.addColorStop(1, 'rgba(138, 42, 138, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(0, 0, 50, 0, Math.PI * 2);
        ctx.fill();
        
        // Main portal gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
        gradient.addColorStop(0, 'rgba(216, 150, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(138, 42, 138, 0.6)');
        gradient.addColorStop(1, 'rgba(138, 42, 138, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner dark portal
        ctx.fillStyle = 'rgba(40, 0, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Portal edge with enhanced glow
        ctx.strokeStyle = '#d896ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#d896ff';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        
        // Additional inner glow ring
        ctx.strokeStyle = 'rgba(255, 200, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        
        // Rotating swirling effect
        ctx.rotate(this.portalRotation);
        ctx.strokeStyle = 'rgba(216, 150, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.shadowBlur = 5;
        
        // Multiple swirl arms
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, 25, (Math.PI * 2 / 3) * i, (Math.PI * 2 / 3) * i + Math.PI);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(0, 0, 30, (Math.PI * 2 / 3) * i + Math.PI, (Math.PI * 2 / 3) * i + Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawProgressionTrails() {
        if (!this.trailCtx) return;
        
        this.trailCtx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
        
        // Draw dungeon trails based on unlocked tiers
        this.trailConnections.forEach((connection) => {
            if (this.game.progression.unlockedTiers.includes(connection.tier)) {
                if (connection.special === 'to-portal') {
                    // Draw trail to portal with west curve
                    this.drawMapTrail(connection.from, connection.to, 'west');
                    const portalPos = this.getElementCenter('portal');
                    this.drawPortal(portalPos.x, portalPos.y);
                } else {
                    this.drawMapTrail(connection.from, connection.to, connection.curve);
                }
            }
        });
        
        // Draw feature trails (arena and stash)
        this.featureConnections.forEach((connection) => {
            if (this.game.progression.unlockedFeatures[connection.feature]) {
                this.drawMapTrail(connection.from, connection.to, connection.curve);
            }
        });
    }
    
animateTrails() {
        // Update portal animation values - both at the same slow speed
        this.portalRotation += 0.003; // Slow rotation
        this.portalPulse += 0.003; // Matching slow pulse
        
        // Redraw trails
        this.drawProgressionTrails();
        
        // Continue animation loop
        requestAnimationFrame(() => this.animateTrails());
    }
    
showHeroes() {
    this.hideAllScreens();
    this.closeHeroInfo();
    this.currentGearFilter = null;
    this.game.currentScreen = 'heroesScreen';
    document.getElementById('heroesScreen').style.display = 'block';
    
    // Save scroll position before updating
    const heroList = document.getElementById('heroList');
    const scrollPosition = heroList ? heroList.scrollLeft : 0;
    
    this.updateHeroList();
    
    // Restore scroll position
    if (heroList) {
        heroList.scrollLeft = scrollPosition;
    }
    
    // Get the sorted heroes and select the first one
    const sortedHeroes = [...this.game.heroes].sort((a, b) => {
        if (a.awakened !== b.awakened) return b.awakened ? 1 : -1;
        if (a.classTier !== b.classTier) return b.classTier - a.classTier;
        return b.level - a.level;
    });
    
    if (sortedHeroes.length > 0) {
    this.game.selectHero(this.game.heroes.indexOf(sortedHeroes[0]));
}

// Check if we need to create more heroes
if (this.game.tutorial) {
    this.game.tutorial.skypperAdditionalRecruit("A new soul wishes to join your party! Come forth, brave one.");
}
    
}

    showDungeonBladeScreen(tierName) {
        this.hideAllScreens();
        this.closeHeroInfo();
        this.game.currentScreen = 'dungeonSelectScreen';
        document.getElementById('dungeonSelectScreen').style.display = 'block';
        
        const tierData = this.game.dungeonTiers[tierName];
        const dungeons = tierData.dungeons;
        
        // Update all three blades
        for (let i = 0; i < 3; i++) {
            const blade = document.getElementById(`dungeonBlade${i + 1}`);
            const backdrop = blade.querySelector('.bladeBackdrop');
            const nameElement = blade.querySelector('.bladeDungeonName');
            const levelElement = blade.querySelector('.bladeDungeonLevel');
            const starsElement = blade.querySelector('.bladeDungeonStars');
            
            if (i < dungeons.length) {
                const dungeon = dungeons[i];
                const isAccessible = this.game.isDungeonAccessible(dungeon.id);
                
                // Set background image
                const dungeonName = dungeon.name.toLowerCase().replace(/ /g, '_');
                backdrop.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/${dungeonName}.png')`;
                
                // Set content
                nameElement.textContent = dungeon.name;
                levelElement.textContent = `Level ${dungeon.level}`;
                
                // Generate stars
                const starData = this.game.generateStars({
                    type: 'enemy',
                    level: dungeon.level,
                    isBoss: true
                });
                starsElement.textContent = starData.html;
                starsElement.className = `bladeDungeonStars ${starData.colorClass}`;
                
                // Handle accessibility
                if (isAccessible) {
                    blade.classList.remove('disabled', 'locked');
                    blade.onclick = () => this.game.enterDungeon(tierName, i);
                    
                    // Remove any lock overlay
                    const lockOverlay = blade.querySelector('.bladeLockOverlay');
                    if (lockOverlay) {
                        lockOverlay.remove();
                    }
                } else {
                    blade.classList.add('disabled', 'locked');
                    blade.onclick = null;
                    
                    // Add lock overlay if not present
                    if (!blade.querySelector('.bladeLockOverlay')) {
                        const lockOverlay = document.createElement('div');
                        lockOverlay.className = 'bladeLockOverlay';
                        lockOverlay.innerHTML = '<div class="bladeLockIcon">🔒</div>';
                        blade.appendChild(lockOverlay);
                    }
                }
            } else {
                // Empty blade
                backdrop.style.backgroundImage = '';
                nameElement.textContent = 'Coming Soon';
                levelElement.textContent = '';
                starsElement.textContent = '';
                blade.classList.add('disabled');
                blade.onclick = null;
            }
        }
    }

    showStash() {
        this.hideAllScreens();
        this.closeHeroInfo();
        this.currentGearFilter = null;
        this.currentStashFilter = null;
        this.game.currentScreen = 'stashScreen';
        document.getElementById('stashScreen').style.display = 'block';
        this.renderStashList();
    }

    renderStashList() {
        const stashList = document.getElementById('stashList');
        stashList.innerHTML = '';
        
        // Include Villager stash
        const allFamilies = [
            { name: 'Villager', icon: '👥', classes: ['Villager', 'Tester'] },
            ...this.game.classFamilies
        ];
        
        allFamilies.forEach((family, index) => {
            const stashItem = document.createElement('div');
            stashItem.className = 'stashItem';
            
            // Format family name for backdrop image
            const backdropName = family.name.toLowerCase().replace(/ /g, '_');
            
            // Set the background image
            stashItem.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/backdrops/${backdropName}_stashback.png')`;
            stashItem.style.backgroundSize = 'cover';
            stashItem.style.backgroundPosition = 'center';
            stashItem.style.backgroundRepeat = 'no-repeat';
            
            stashItem.innerHTML = `
                <div class="stashIcon">${family.icon}</div>
                <div class="stashName">${family.name}</div>
            `;
            
            stashItem.onclick = () => this.game.openStash(family);
            stashList.appendChild(stashItem);
        });
    }

    showIndividualStash(family) {
        // Hide any existing tooltips before DOM manipulation
        this.hideItemTooltip();
        this.hideAbilityTooltip();

        this.hideAllScreens();
        this.game.currentScreen = 'individualStashScreen';
        document.getElementById('individualStashScreen').style.display = 'block';
        
        // Update header
        const items = this.game.stashes[family.name].items;
        const goldAmount = this.game.stashes[family.name].gold.toLocaleString();
        
        // Always show filter, but default based on item count only if no filter is set
        let filterValue;
        if (this.currentStashFilter) {
            // User has selected a filter, always use it
            filterValue = this.currentStashFilter;
        } else {
            // No filter selected yet, use smart defaults
            filterValue = items.length > 250 ? 'trinket' : 'all';
        }
        
        // Build header HTML with filter (always show)
        let headerHTML = `<div style="display: flex; align-items: center; justify-content: center; width: 100%;">
            <span>${family.name} Stash</span>
            <span style="color: #ffd700; margin-left: 20px;">💰 ${goldAmount}</span>
            <div class="stashSlotFilter">
                <label>Filter:</label>
                <select id="stashSlotFilterSelect" onchange="game.filterStashSlots('individual')">
                    <option value="all" ${filterValue === 'all' ? 'selected' : ''}>All (${items.length})</option>
                    <option value="trinket" ${filterValue === 'trinket' ? 'selected' : ''}>Trinket</option>
                    <option value="head" ${filterValue === 'head' ? 'selected' : ''}>Head</option>
                    <option value="chest" ${filterValue === 'chest' ? 'selected' : ''}>Chest</option>
                    <option value="legs" ${filterValue === 'legs' ? 'selected' : ''}>Legs</option>
                    <option value="weapon" ${filterValue === 'weapon' ? 'selected' : ''}>Weapon</option>
                    <option value="offhand" ${filterValue === 'offhand' ? 'selected' : ''}>Offhand</option>
                </select>
            </div>
            <button id="stashSortButton" class="sortSettingsButton" onclick="game.uiManager.toggleSortSettings('stash')" title="Sort Settings">↕️</button>
        </div>`;
        document.getElementById('stashFamilyName').innerHTML = headerHTML;
        
        document.getElementById('stashGoldAmount').textContent = goldAmount;
        
        // Show items
        const inventory = document.getElementById('stashInventory');
        inventory.innerHTML = '';
        
        // Filter items based on selection
        let itemsToShow = items;
        if (filterValue !== 'all') {
            itemsToShow = items.filter(item => item.slot === filterValue);
        }
        
        // Sort items using custom sort settings
        const sortedItems = this.game.sortItems(itemsToShow);
        
        if (sortedItems.length === 0) {
            inventory.innerHTML = '<p style="text-align: center; color: #6a9aaa; margin-top: 50px;">No items in stash</p>';
        } else {
            sortedItems.forEach((item, index) => {
                // Find the original index of this item in the unsorted array
                const originalIndex = items.indexOf(item);
                const starData = item.getStars();
                
                const itemDiv = document.createElement('div');
                itemDiv.className = `stashItemSlot ${item.getRarity()}`;
                itemDiv.innerHTML = `
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
                
                // Add click handler
                itemDiv.onclick = () => {
                    if (this.game.currentScreen === 'heroesScreen' && this.selectedHero !== undefined) {
                        this.game.equipFromStash(originalIndex, item.slot);
                    }
                };

                // Right click for context menu
                itemDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.game.showItemOptions(item, originalIndex, family);
                };
                
                // Add hover tooltip with alt key detection
                itemDiv.onmouseenter = (e) => this.showItemTooltip(e, item);
                itemDiv.onmouseleave = () => this.hideItemTooltip();
                
                inventory.appendChild(itemDiv);
            });
        }
        // Hide any lingering tooltips after DOM update
        this.hideItemTooltip();
        this.hideAbilityTooltip();
    }

showArena() {
    this.hideAllScreens();
    this.closeHeroInfo();
    this.game.currentScreen = 'arenaScreen';
    document.getElementById('arenaScreen').style.display = 'block';
}

    showCollectionLog() {
        this.hideAllScreens();
        this.closeHeroInfo();
        this.game.currentScreen = 'collectionLogScreen';
        document.getElementById('collectionLogScreen').style.display = 'block';
        this.renderCollectionLog();
    }

    renderCollectionLog() {
        // First render the tier sidebar
        this.renderCollectionTierSidebar();
        
        // Then render content for selected tier
        this.renderCollectionContent(this.selectedCollectionTier);
        
        // Calculate and display total progress
        this.updateCollectionProgress();
        
        // Display roll chances
        this.updateRollChancesDisplay();
    }

    updateRollChancesDisplay() {
        // Get the collection drop bonus
        const bonusChance = this.game.getCollectionDropBonus();
        const bonusPercent = bonusChance * 100; // Convert to percentage
        
        // Calculate current chances
        const roll2Chance = (0.45 + bonusChance) * 100;
        const roll3Chance = (0.40 + bonusChance) * 100;
        const roll4Chance = (0.35 + bonusChance) * 100;
        
        // Check if element already exists
        let rollChancesDiv = document.getElementById('collectionRollChances');
        if (!rollChancesDiv) {
            // Create the element
            rollChancesDiv = document.createElement('div');
            rollChancesDiv.id = 'collectionRollChances';
            rollChancesDiv.className = 'collectionRollChances';
            
            // Find the back button and insert after it
            const backButton = document.querySelector('#collectionLogScreen .backButton');
            if (backButton && backButton.parentNode) {
                backButton.parentNode.insertBefore(rollChancesDiv, backButton.nextSibling);
            }
        }
        
        // Update the content
        rollChancesDiv.innerHTML = `
            <div class="rollChancesTitle">Chances at additional item rolls: +${bonusPercent.toFixed(2)}% (.03% per slot unlocked):</div>
            <div class="rollChancesList">
                <div class="rollChanceItem">Roll 2: <span class="rollChanceValue">${roll2Chance.toFixed(2)}%</span> <span class="rollChanceBase">(Base 45%)</span></div>
                <div class="rollChanceItem">Roll 3: <span class="rollChanceValue">${roll3Chance.toFixed(2)}%</span> <span class="rollChanceBase">(Base 40%)</span></div>
                <div class="rollChanceItem">Roll 4: <span class="rollChanceValue">${roll4Chance.toFixed(2)}%</span> <span class="rollChanceBase">(Base 35%)</span></div>
            </div>
        `;
    }

    renderCollectionTierSidebar() {
        const sidebar = document.getElementById('tierSidebar');
        sidebar.innerHTML = '';
        
        // Get all tiers
        const tierOrder = this.game.getTierOrder();
        
        tierOrder.forEach(tierName => {
            // Calculate tier progress
            let tierTotal = 0;
            let tierCollected = 0;
            
            // Get dungeons for this tier
            const tierData = dungeonData.tiers[tierName];
            if (!tierData) return;
            
            const tierDungeons = Object.keys(dungeonData.dungeons).filter(dungeonId => {
                const dungeon = dungeonData.dungeons[dungeonId];
                return dungeon.tier === tierName && dungeon.rewards && dungeon.rewards.items && dungeon.rewards.items.length > 0;
            });
            
            tierDungeons.forEach(dungeonId => {
                const dungeon = dungeonData.dungeons[dungeonId];
                if (dungeon.rewards && dungeon.rewards.items) {
                    tierTotal += dungeon.rewards.items.length * 4; // 4 qualities per item
                    
                    // Count collected
                    const dungeonCollection = this.game.collectionLog[dungeonId] || {};
                    tierCollected += Object.keys(dungeonCollection).length;
                }
            });
            
            // Create tier button
            const tierButton = document.createElement('div');
            tierButton.className = 'tierButton';
            if (tierName === this.selectedCollectionTier) {
                tierButton.classList.add('active');
            }
            if (tierTotal > 0 && tierCollected === tierTotal) {
                tierButton.classList.add('completed');
            }
            
            const progressPercent = tierTotal > 0 ? (tierCollected / tierTotal * 100) : 0;
            
            tierButton.innerHTML = `
                <div class="tierButtonContent">
                    <span class="tierName">${tierName}</span>
                    <span class="tierProgress">${tierCollected}/${tierTotal}</span>
                </div>
                <div class="tierProgressBar">
                    <div class="tierProgressFill" style="width: ${progressPercent}%"></div>
                </div>
            `;
            
            tierButton.onclick = () => {
                this.selectedCollectionTier = tierName;
                this.renderCollectionLog();
            };
            
            sidebar.appendChild(tierButton);
        });
    }

    renderCollectionContent(tierName) {
        const content = document.getElementById('collectionContent');
        content.innerHTML = '';
        
        // Get dungeons for this tier
        const tierDungeons = Object.keys(dungeonData.dungeons).filter(dungeonId => {
            const dungeon = dungeonData.dungeons[dungeonId];
            return dungeon.tier === tierName && dungeon.rewards && dungeon.rewards.items && dungeon.rewards.items.length > 0;
        });
        
        // Render each dungeon
        tierDungeons.forEach(dungeonId => {
            const dungeon = dungeonData.dungeons[dungeonId];
            const dungeonDiv = document.createElement('div');
            dungeonDiv.className = 'dungeonCollection';

            // Add background image
            const dungeonName = dungeon.name.toLowerCase().replace(/ /g, '_');
            dungeonDiv.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/${dungeonName}.png')`;
            
            // Count collection for this dungeon
            const collectionStats = this.game.getDungeonCollectionStats(dungeonId);
            const isCompleted = collectionStats.collected === collectionStats.total;
            
            if (isCompleted) {
                dungeonDiv.classList.add('completed');
            }
            
            // Header
            const headerDiv = document.createElement('div');
            headerDiv.className = 'dungeonCollectionHeader';
            headerDiv.textContent = `[${collectionStats.collected}/${collectionStats.total}] ${dungeon.name}`;
            dungeonDiv.appendChild(headerDiv);
            
            // Items container
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'dungeonCollectionItems';
            
            // Render items exactly as before
            dungeon.rewards.items.forEach(itemId => {
                const itemTemplate = itemData.items[itemId];
                if (!itemTemplate) return;
                
                const rowDiv = document.createElement('div');
                rowDiv.className = 'itemCollectionRow';
                
                const gridDiv = document.createElement('div');
                gridDiv.className = 'itemQualityGrid';
                
                // Create 4 item thumbnails (1-roll green, 2-roll blue, 3-roll purple, 4-roll red)
                for (let quality = 1; quality <= 4; quality++) {
                    // Create display item with specific number of rolls
                    const displayItem = new Item(itemId);
                    
                    // First, clear all qualities to 0
                    displayItem.quality1 = 0;
                    displayItem.quality2 = 0;
                    displayItem.quality3 = 0;
                    displayItem.quality4 = 0;
                    displayItem.quality5 = 0;
                    
                    // Then set only the exact number of perfect rolls
                    for (let i = 1; i <= quality; i++) {
                        displayItem[`quality${i}`] = 5;
                    }
                    
                    const starData = displayItem.getStars();
                    const rarity = displayItem.getRarity();
                    
                    // Check if this quality is collected
                    const collectionKey = `${itemId}_${quality}`;
                    const collectionData = this.game.collectionLog[dungeonId] && this.game.collectionLog[dungeonId][collectionKey];
                    const isCollected = !!collectionData;
                    
                    // Create item thumbnail using stashItemSlot class
                    const thumbnailDiv = document.createElement('div');
                    thumbnailDiv.className = `stashItemSlot ${rarity} ${isCollected ? 'collected' : ''}`;
                    thumbnailDiv.style.opacity = isCollected ? '1' : '0.4';
                    thumbnailDiv.innerHTML = `
                        <div class="itemContainer">
                            <img src="https://puzzle-drops.github.io/TEVE/img/items/${itemId}.png" 
                                 alt="${itemTemplate.name}"
                                 onerror="this.style.display='none'">
                            ${starData.html ? `<div class="itemStars ${starData.colorClass}">${starData.html}</div>` : ''}
                            <div class="itemLevel">${itemTemplate.level}</div>
                            <div class="itemQuality">100%</div>
                            ${isCollected ? '<div class="collectionCheckmark">✓</div>' : ''}
                        </div>
                    `;
                    
                    // Add hover tooltip
                    if (isCollected) {
                        thumbnailDiv.onmouseover = (e) => {
                            this.showCollectionTooltip(e, itemId, quality, collectionData);
                        };
                        thumbnailDiv.onmouseout = () => {
                            this.hideItemTooltip();
                        };
                    } else {
                        thumbnailDiv.onmouseenter = (e) => {
                            // Create a fresh item for tooltip with proper quality
                            const hoverItem = new Item(itemId);
                            // Clear all qualities first
                            hoverItem.quality1 = 0;
                            hoverItem.quality2 = 0;
                            hoverItem.quality3 = 0;
                            hoverItem.quality4 = 0;
                            hoverItem.quality5 = 0;
                            // Set only the exact number of perfect rolls
                            for (let i = 1; i <= quality; i++) {
                                hoverItem[`quality${i}`] = 5;
                            }
                            this.showItemTooltip(e, hoverItem);
                        };
                        thumbnailDiv.onmouseleave = () => {
                            this.hideItemTooltip();
                        };
                    }
                    
                    gridDiv.appendChild(thumbnailDiv);
                }
                
                rowDiv.appendChild(gridDiv);
                itemsDiv.appendChild(rowDiv);
            });
            
            dungeonDiv.appendChild(itemsDiv);
            content.appendChild(dungeonDiv);
        });
    }

    updateCollectionProgress() {
        // Calculate total progress across all tiers
        let totalSlots = 0;
        let collectedSlots = 0;
        
        // Get all dungeons that have items
        Object.keys(dungeonData.dungeons).forEach(dungeonId => {
            const dungeon = dungeonData.dungeons[dungeonId];
            if (dungeon.rewards && dungeon.rewards.items && dungeon.rewards.items.length > 0) {
                totalSlots += dungeon.rewards.items.length * 4;
                
                const dungeonCollection = this.game.collectionLog[dungeonId] || {};
                collectedSlots += Object.keys(dungeonCollection).length;
            }
        });
        
        // Update progress display
        document.getElementById('collectionProgressText').textContent = 
            `${collectedSlots}/${totalSlots} collected`;
        const progressPercent = totalSlots > 0 ? (collectedSlots / totalSlots * 100) : 0;
        document.getElementById('collectionProgressFill').style.width = progressPercent + '%';
        document.getElementById('collectionProgressPercent').textContent = 
            Math.floor(progressPercent) + '%';
    }

    showBattle() {
    this.hideAllScreens();
    this.closeHeroInfo();
    this.game.currentScreen = 'battleScene';
    document.getElementById('battleScene').style.display = 'block';
    
    // Ensure exit button is visible by default
    const exitButton = document.querySelector('.exitBattleButton');
    if (exitButton) {
        exitButton.style.display = '';
    }
        
        // Set battlefield background based on current battle mode
const battleFieldBg = document.querySelector('.battleFieldBackground');
if (battleFieldBg) {
    // Check arena mode first since currentBattle might not exist yet
    if (this.game.arenaMode === 'spar') {
        battleFieldBg.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/arena.png')`;
    } else if (this.game.currentDungeon) {
        const dungeonName = this.game.currentDungeon.name.toLowerCase().replace(/ /g, '_');
        battleFieldBg.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/${dungeonName}.png')`;
    }
}
                    
        // Set auto toggles based on saved states
        document.getElementById('autoModeToggle').checked = this.game.autoBattle;
        document.getElementById('autoReplayToggle').checked = this.game.autoReplay;
            
        // Update UI with actual units
        this.updateBattleUI();
    }

    updateBattleUI() {
        // Hide all unit slots first
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`party${i}`).style.display = 'none';
            document.getElementById(`enemy${i}`).style.display = 'none';
        }
        
        // Show party units
        const partyUnits = this.game.selectedParty.map(heroIndex => 
            heroIndex !== null ? this.game.heroes[heroIndex] : null
        ).filter(hero => hero !== null);
        
        partyUnits.forEach((hero, index) => {
            const slot = document.getElementById(`party${index + 1}`);
            if (slot) {
                slot.style.display = 'block';
                let unitDiv = slot.querySelector('.unit');
                
                // Create unit div if it doesn't exist
                if (!unitDiv) {
                    unitDiv = document.createElement('div');
                    unitDiv.className = 'unit';
                    slot.appendChild(unitDiv);
                }
                
                unitDiv.innerHTML = `
                    <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_portrait.png" alt="${hero.displayClassName}" 
                         style="width: 100%; image-rendering: pixelated; object-fit: contain;"
                         onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'font-size: 9px; text-align: center; line-height: 1.2;\\'><div>${hero.name}</div><div style=\\'color: #6a9aaa;\\'>Lv${hero.level}</div></div>'">
                `;
            }
        });
    }

showPartySelect(mode = 'dungeon') {
    this.hideAllScreens();
    this.game.currentScreen = 'partySelectScreen';
    document.getElementById('partySelectScreen').style.display = 'block';
    
    // Ensure battle preview is visible
    const battlePreview = document.querySelector('.battlePreview');
    if (battlePreview) {
        battlePreview.style.display = '';
    }
    
    // Set battlefield background based on mode
    const battlefieldBg = document.querySelector('.partySelectBattlefield');
    if (battlefieldBg) {
        if (mode === 'arena') {
            battlefieldBg.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/arena.png')`;
        } else if (this.game.currentDungeon) {
            const dungeonName = this.game.currentDungeon.name.toLowerCase().replace(/ /g, '_');
            battlefieldBg.style.backgroundImage = `url('https://puzzle-drops.github.io/TEVE/img/fields/${dungeonName}.png')`;
        }
    }
    
    // Reset party selection if entering fresh (not from battle)
    if (!this.game.currentBattle) {
        this.game.selectedParty = [null, null, null, null, null];
    }
    
    // Update dungeon info or arena title
    if (mode === 'arena') {
        document.getElementById('dungeonName').textContent = 'Arena - Spar Mode';
    } else {
        document.getElementById('dungeonName').textContent = this.game.currentDungeon.name;
    }

    // Hide/show elements based on mode
    if (mode === 'arena') {
        
        // Show records section for arena (different from dungeons)
        const recordsSection = document.querySelector('#recordsContent').parentElement.parentElement;
        if (recordsSection) recordsSection.style.display = '';
        
        // Update the records content for arena format
        const recordsContent = document.getElementById('recordsContent');
        if (recordsContent) {
            recordsContent.innerHTML = `
                <div class="rewardStats">
                    <div class="rewardStat">
                        <span class="recordIcon">⏱️</span>
                        <span id="dungeonBestTime">--:--</span>
                    </div>
                    <div class="rewardStat">
                        <span class="recordIcon">🏆</span>
                        <span id="dungeonCompletions">0</span>
                    </div>
                    <div class="rewardStat">
                        <span class="recordIcon">💀</span>
                        <span id="dungeonCollectionPercent">-- deaths</span>
                    </div>
                </div>
            `;
        }
        
        // Update records display for current arena team
        this.updateArenaRecordsDisplay();
        
        // Keep wave navigation visible for arena team selection
        const waveNav = document.getElementById('waveNavigation');
        if (waveNav) waveNav.style.display = '';
        
        const rewardsSection = document.querySelector('#rewardsContent').parentElement.parentElement;
        if (rewardsSection) rewardsSection.style.display = 'none';

        // Ensure battle preview is visible for arena
        const battlePreview = document.querySelector('.battlePreview');
        if (battlePreview) {
            battlePreview.style.display = '';  // Explicitly show it
        }
        
        // Hide autosell for arena mode
const autosellButton = document.getElementById('autosellButtonContainer');
if (autosellButton) {
    autosellButton.style.display = 'none';
}
    } else {
        // Show all elements for dungeon mode
        const recordsSection = document.querySelector('#recordsContent').parentElement.parentElement;
        if (recordsSection) recordsSection.style.display = '';
        
        // Reset records content to dungeon format (with book emoji)
        const recordsContent = document.getElementById('recordsContent');
        if (recordsContent) {
            recordsContent.innerHTML = `
                <div class="rewardStats">
                    <div class="rewardStat">
                        <span class="recordIcon">⏱️</span>
                        <span id="dungeonBestTime">--:--</span>
                    </div>
                    <div class="rewardStat">
                        <span class="recordIcon">🏆</span>
                        <span id="dungeonCompletions">0</span>
                    </div>
                    <div class="rewardStat">
                        <span class="recordIcon">📖</span>
                        <span id="dungeonCollectionPercent">0%</span>
                    </div>
                </div>
            `;
        }
        
        const waveNav = document.getElementById('waveNavigation');
        if (waveNav) waveNav.style.display = '';
        
        const rewardsSection = document.querySelector('#rewardsContent').parentElement.parentElement;
        if (rewardsSection) rewardsSection.style.display = '';
        
        // Show auto toggles
        const autoBattleToggle = document.getElementById('autoBattleToggle');
        if (autoBattleToggle) autoBattleToggle.parentElement.style.display = '';
        
        const autoReplayToggle = document.getElementById('autoReplayToggleParty');
        if (autoReplayToggle) autoReplayToggle.parentElement.style.display = '';
        
        // Set toggle states
        if (autoBattleToggle) autoBattleToggle.checked = this.game.autoBattle;
        if (autoReplayToggle) autoReplayToggle.checked = this.game.autoReplay;

        // Ensure battle preview is visible for dungeons
        const battlePreview = document.querySelector('.battlePreview');
        if (battlePreview) {
            battlePreview.style.display = '';  // Explicitly show it
        }
    }
    
// Save scroll position before rendering
const heroSelectList = document.getElementById('heroSelectList');
const scrollPosition = heroSelectList ? heroSelectList.scrollLeft : 0;

// Render hero selection list
this.renderHeroSelectList();

// Restore scroll position after rendering
setTimeout(() => {
    const heroSelectList = document.getElementById('heroSelectList');
    if (heroSelectList) {
        heroSelectList.scrollLeft = scrollPosition;
    }
}, 0);
    
    // Clear party slots
    this.updatePartySlots();
    
    // Update enemy formation
    if (mode === 'arena') {
        this.updateArenaEnemyFormation();
    } else {
        this.updateEnemyFormation();
    }

    // Update displays based on mode
    if (mode === 'dungeon') {
        this.updateRewardsDisplay();
        this.updateRecordsDisplay();
        
        // Show autosell button and update its state
const autosellButton = document.getElementById('autosellButtonContainer');
if (autosellButton) {
    autosellButton.style.display = 'block';
            
            // Update toggle state
            const toggle = document.getElementById('autosellToggleSwitch');
            if (toggle) {
                toggle.checked = this.game.autosell.enabled;
            }
            
            // Update preset text
            const presetText = document.getElementById('autosellPresetText');
            if (presetText) {
                presetText.textContent = this.game.autosell.preset.charAt(0).toUpperCase() + this.game.autosell.preset.slice(1) + ' preset';
            }
        }
    }
}

showAutosellSettings() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'autosellOverlay';
    overlay.id = 'autosellOverlay';
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            this.closeAutosellSettings();
        }
    };
    
    // Create popup
    const popup = document.createElement('div');
    popup.className = 'autosellPopup';
    
    // Build popup content
    const autosell = this.game.autosell;
    
    popup.innerHTML = `
        <div class="autosellHeader">
            <h2>Autosell Settings</h2>
            <button class="closeButton" onclick="game.uiManager.closeAutosellSettings()">×</button>
        </div>
        
        <div class="autosellEnableRow">
            <label>
                <input type="checkbox" id="autosellEnableCheckbox" 
                       ${autosell.enabled ? 'checked' : ''} 
                       onchange="game.autosell.enabled = this.checked; game.autosell.saveSettings(); document.getElementById('autosellToggleSwitch').checked = this.checked;">
                Enable Autosell
            </label>
        </div>
        
        <div class="autosellPresets">
            <h3>Presets</h3>
            <div class="presetButtons">
                <button class="presetButton ${autosell.preset === 'basic' ? 'active' : ''}" 
                        onclick="game.uiManager.selectAutosellPreset('basic')">Basic</button>
                <button class="presetButton ${autosell.preset === 'strict' ? 'active' : ''}" 
                        onclick="game.uiManager.selectAutosellPreset('strict')">Strict</button>
                <button class="presetButton ${autosell.preset === 'balanced' ? 'active' : ''}" 
                        onclick="game.uiManager.selectAutosellPreset('balanced')">Balanced</button>
                <button class="presetButton ${autosell.preset === 'relaxed' ? 'active' : ''}" 
                        onclick="game.uiManager.selectAutosellPreset('relaxed')">Relaxed</button>
                <button class="presetButton ${autosell.preset === 'custom' ? 'active' : ''}" 
                        onclick="game.uiManager.selectAutosellPreset('custom')">Custom</button>
            </div>
        </div>
        
        <div id="autosellDescription" class="autosellDescription" style="${autosell.preset === 'basic' ? '' : 'display: none;'}">
            ${autosell.presets.basic.description}
        </div>
        
        <div id="autosellCriteria" class="autosellCriteria" style="${autosell.preset === 'basic' ? 'display: none;' : ''}">
            <h3>Sell if:</h3>
            
            <div class="criteriaRow">
                <label>Below level:</label>
                <input type="number" id="levelBelowInput" value="${autosell.criteria.levelBelow || ''}" 
                       ${autosell.preset !== 'custom' ? 'disabled' : ''}
                       onchange="game.uiManager.updateAutosellCriteria('levelBelow', this.value)">
            </div>
            
            <div class="criteriaRow">
                <label>Score below:</label>
                <input type="number" id="scoreBelowInput" value="${autosell.criteria.scoreBelow || ''}" 
                       ${autosell.preset !== 'custom' ? 'disabled' : ''}
                       onchange="game.uiManager.updateAutosellCriteria('scoreBelow', this.value)">
            </div>
            
            <div class="criteriaRow">
                <label>Quality below %:</label>
                <input type="number" id="qualityBelowInput" value="${autosell.criteria.qualityBelow || ''}" 
                       min="0" max="100"
                       ${autosell.preset !== 'custom' ? 'disabled' : ''}
                       onchange="game.uiManager.updateAutosellCriteria('qualityBelow', this.value)">
            </div>
            
            <div class="criteriaRow">
                <label>Stars below:</label>
                <input type="number" id="starsBelowInput" value="${autosell.criteria.starsBelow || ''}" 
                       min="0" max="4"
                       ${autosell.preset !== 'custom' ? 'disabled' : ''}
                       onchange="game.uiManager.updateAutosellCriteria('starsBelow', this.value)">
            </div>
            
            <div class="criteriaRow">
                <label>Always sell rarities:</label>
                <div class="rarityCheckboxes">
                    <label class="rarityCheckbox">
                        <input type="checkbox" ${autosell.criteria.sellRarities.green ? 'checked' : ''} 
                               ${autosell.preset !== 'custom' ? 'disabled' : ''}
                               onchange="game.uiManager.updateAutosellRarity('green', this.checked)">
                        <span class="green">Green</span>
                    </label>
                    <label class="rarityCheckbox">
                        <input type="checkbox" ${autosell.criteria.sellRarities.blue ? 'checked' : ''} 
                               ${autosell.preset !== 'custom' ? 'disabled' : ''}
                               onchange="game.uiManager.updateAutosellRarity('blue', this.checked)">
                        <span class="blue">Blue</span>
                    </label>
                    <label class="rarityCheckbox">
                        <input type="checkbox" ${autosell.criteria.sellRarities.purple ? 'checked' : ''} 
                               ${autosell.preset !== 'custom' ? 'disabled' : ''}
                               onchange="game.uiManager.updateAutosellRarity('purple', this.checked)">
                        <span class="purple">Purple</span>
                    </label>
                    <label class="rarityCheckbox">
                        <input type="checkbox" ${autosell.criteria.sellRarities.red ? 'checked' : ''} 
                               ${autosell.preset !== 'custom' ? 'disabled' : ''}
                               onchange="game.uiManager.updateAutosellRarity('red', this.checked)">
                        <span class="red">Red</span>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="autosellActions">
            <button class="applyButton" onclick="game.uiManager.applyAutosellSettings()">Apply</button>
        </div>
        
        <div class="autosellStats">
            <h3>Autosell Tracking</h3>
            <div class="statsGrid">
                <div class="statItem">Items Sold: <span id="itemsSoldStat">${autosell.stats.itemsSold.toLocaleString()}</span></div>
                <div class="statItem">Gold Gained: <span id="goldGainedStat">${autosell.stats.goldGained.toLocaleString()}</span></div>
                <div class="statItem">Items Saved: <span id="itemsSavedStat">${autosell.stats.itemsSaved.toLocaleString()}</span></div>
            </div>
            <button class="resetStatsButton" onclick="game.uiManager.resetAutosellStats()">Reset Tracking</button>
        </div>
    `;
    
overlay.appendChild(popup);
// Add to scaleWrapper instead of body for proper scaling
const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(overlay);
} else {
    // Fallback to gameContainer if scaleWrapper not found
    const gameContainer = document.getElementById('gameContainer');
    gameContainer.appendChild(overlay);
}
}

closeAutosellSettings() {
    const overlay = document.getElementById('autosellOverlay');
    if (overlay) {
        overlay.remove();
    }
}

selectAutosellPreset(preset) {
    const autosell = this.game.autosell;
    autosell.applyPreset(preset);
    
    // Update UI
    document.querySelectorAll('.presetButton').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === preset);
    });
    
    // Show/hide description and criteria
    const descDiv = document.getElementById('autosellDescription');
    const criteriaDiv = document.getElementById('autosellCriteria');
    
    if (preset === 'basic') {
        descDiv.style.display = 'block';
        criteriaDiv.style.display = 'none';
    } else {
        descDiv.style.display = 'none';
        criteriaDiv.style.display = 'block';
        
        // Update criteria inputs
        const criteria = preset === 'custom' ? autosell.criteria : autosell.presets[preset];
        document.getElementById('levelBelowInput').value = criteria.levelBelow || '';
        document.getElementById('scoreBelowInput').value = criteria.scoreBelow || '';
        document.getElementById('qualityBelowInput').value = criteria.qualityBelow || '';
        document.getElementById('starsBelowInput').value = criteria.starsBelow || '';
        
        // Update checkboxes
        document.querySelectorAll('.rarityCheckbox input').forEach((checkbox, index) => {
            const rarities = ['green', 'blue', 'purple', 'red'];
            checkbox.checked = criteria.sellRarities[rarities[index]];
        });
        
        // Enable/disable inputs
        const isCustom = preset === 'custom';
        document.querySelectorAll('#autosellCriteria input').forEach(input => {
            input.disabled = !isCustom;
        });
    }
}

updateAutosellCriteria(field, value) {
    if (this.game.autosell.preset === 'custom') {
        if (value === '') {
            this.game.autosell.criteria[field] = null;
        } else {
            this.game.autosell.criteria[field] = parseInt(value);
        }
    }
}

updateAutosellRarity(rarity, checked) {
    if (this.game.autosell.preset === 'custom') {
        this.game.autosell.criteria.sellRarities[rarity] = checked;
    }
}

applyAutosellSettings() {
    this.game.autosell.saveSettings();
    
    // Update preset text in party select
    const presetText = document.getElementById('autosellPresetText');
    if (presetText) {
        presetText.textContent = this.game.autosell.preset.charAt(0).toUpperCase() + this.game.autosell.preset.slice(1) + ' preset';
    }
    
    this.closeAutosellSettings();
}

resetAutosellStats() {
    this.game.autosell.resetStats();
    document.getElementById('itemsSoldStat').textContent = '0';
    document.getElementById('goldGainedStat').textContent = '0';
    document.getElementById('itemsSavedStat').textContent = '0';
}

    renderHeroSelectList() {
        const container = document.getElementById('heroSelectList');
        container.innerHTML = '';
        
        // Sort heroes by same criteria as hero list
        const sortedHeroes = [...this.game.heroes].sort((a, b) => {
            if (a.awakened !== b.awakened) return b.awakened ? 1 : -1;
            if (a.classTier !== b.classTier) return b.classTier - a.classTier;
            return b.level - a.level;
        });
        
        sortedHeroes.forEach((hero, index) => {
            const heroIndex = this.game.heroes.indexOf(hero);
            const heroThumb = this.createSelectableHeroThumb(hero, heroIndex);
            container.appendChild(heroThumb);
        });
    }

updateHeroSelectionState(changedHeroIndex) {
    // Find all hero elements
    const heroElements = document.querySelectorAll('.selectableHero');
    
    heroElements.forEach(element => {
        const elementHeroIndex = parseInt(element.dataset.heroIndex);
        
        // Check if this hero is in the selected party
        const isSelected = this.game.selectedParty.includes(elementHeroIndex);
        
        // Update the selected class
        if (isSelected) {
            element.classList.add('selected');
        } else {
            element.classList.remove('selected');
        }
    });
}

    createSelectableHeroThumb(hero, heroIndex) {
        const wrapper = document.createElement('div');
        wrapper.className = 'selectableHero';
        wrapper.dataset.heroIndex = heroIndex;
        
        // Check if hero is already selected
        if (this.game.selectedParty.includes(heroIndex)) {
            wrapper.classList.add('selected');
        }
        
        // Create the same thumb structure as hero list
        const thumb = document.createElement('div');
        thumb.className = 'heroThumb';
        
        // Generate stars using consolidated function
        const starData = hero.getStars();

        thumb.innerHTML = `
            <div style="position: relative; width: 100px; height: 100px;">
                <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_portrait.png" alt="${hero.displayClassName}" 
                     style="width: 100%; height: 100%; object-fit: cover; object-position: top center; image-rendering: pixelated;"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><rect fill=\\'%23666\\' width=\\'100\\' height=\\'100\\'/><text x=\\'50\\' y=\\'55\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'14\\'>${hero.displayClassName}</text></svg>'">
                 
                ${starData.html ? `<div class="thumbStars ${starData.colorClass}">${starData.html}</div>` : ''}

                <div class="thumbLevel">${hero.level}</div>
            </div>

            <div class="thumbClass">${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span></div>
            <div class="thumbName">${hero.name}</div>
        `;

        
        wrapper.appendChild(thumb);
        
        // Click to select/deselect
        wrapper.onclick = () => this.game.toggleHeroSelection(heroIndex);
        
        // Long press for info
        let pressTimer;
        wrapper.addEventListener('mousedown', () => {
            pressTimer = setTimeout(() => this.showHeroInfoPopup(hero), 500);
        });
        wrapper.addEventListener('mouseup', () => clearTimeout(pressTimer));
        wrapper.addEventListener('mouseleave', () => clearTimeout(pressTimer));

        // Right-click for info
        wrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showHeroInfoPopup(hero);
        });
        
        return wrapper;
    }

    updatePartySlots() {
        const slots = document.querySelectorAll('.partySlot');
        
        slots.forEach((slot, index) => {
            const heroIndex = this.game.selectedParty[index];
            
            if (heroIndex !== null) {
                const hero = this.game.heroes[heroIndex];
                
                // Generate stars using consolidated function
                const starData = hero.getStars();
                
                slot.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <div style="position: relative; width: 100px; height: 100px;">
                            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_portrait.png" alt="${hero.displayClassName}" 
                                 style="width: 100%; height: 100%; object-fit: cover; object-position: top center; image-rendering: pixelated;"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 60 60\\'><rect fill=\\'%23666\\' width=\\'60\\' height=\\'60\\'/><text x=\\'30\\' y=\\'35\\' text-anchor=\\'middle\\' fill=\\'white\\'>${hero.displayClassName}</text></svg>'">
                            ${starData.html ? `<div class="thumbStars ${starData.colorClass}">${starData.html}</div>` : ''}
                            <div class="thumbLevel">${hero.level}</div>
                        </div>
                        <div class="thumbClass">${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span></div>

                    </div>
                `;

                //                        <div class="thumbName">${hero.name}</div> << add this back in under thumbClass if you want it
                slot.classList.add('filled');
                
                // Make slot draggable
                slot.draggable = true;
                slot.dataset.heroIndex = heroIndex;
                slot.dataset.slotIndex = index;
                
                // Add drag event handlers
                slot.ondragstart = (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    slot.classList.add('dragging');
                    this.game.draggedSlotIndex = index;
                };
                
                slot.ondragend = () => {
                    slot.classList.remove('dragging');
                };
                
                // Add long press handler for hero info
                let pressTimer;
                slot.addEventListener('mousedown', (e) => {
                    if (e.button === 0 && !e.ctrlKey && !e.shiftKey) { // Left click only, no modifiers
                        pressTimer = setTimeout(() => this.showHeroInfoPopup(hero), 500);
                    }
                });
                slot.addEventListener('mouseup', () => clearTimeout(pressTimer));
                slot.addEventListener('mouseleave', () => clearTimeout(pressTimer));

                // Add right-click handler for hero info
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showHeroInfoPopup(hero);
                });
                
                // Add click handler for removal (but not if dragging)
                slot.onclick = (e) => {
                    if (!slot.classList.contains('dragging')) {
                        this.game.selectedParty[index] = null;
                        this.renderHeroSelectList();
                        this.updatePartySlots();
                        document.getElementById('startBattleBtn').disabled = !this.game.selectedParty.some(h => h !== null);
                    }
                };
            } else {
                slot.innerHTML = '<div class="slotPlaceholder">⬡</div>';
                slot.classList.remove('filled');
                slot.draggable = false;
                slot.onclick = null;
                slot.ondragstart = null;
                slot.ondragend = null;
            }
            
            // Add drop zone handlers for all slots
            slot.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                slot.classList.add('dragover');
            };
            
            slot.ondragleave = () => {
                slot.classList.remove('dragover');
            };
            
            slot.ondrop = (e) => {
                e.preventDefault();
                slot.classList.remove('dragover');
                
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                
                if (fromIndex !== toIndex) {
                    // Swap heroes
                    const temp = this.game.selectedParty[fromIndex];
                    this.game.selectedParty[fromIndex] = this.game.selectedParty[toIndex];
                    this.game.selectedParty[toIndex] = temp;
                    
                    // Update display
                    this.updatePartySlots();
                }
            };
        });
    }

    updateEnemyFormation() {
        const enemyFormation = document.getElementById('enemyFormation');
        const slots = enemyFormation.querySelectorAll('.enemySlot');
        
        // Clear all enemy slots first
        slots.forEach(slot => {
            slot.innerHTML = '<div class="slotPlaceholder">⬡</div>';
            slot.classList.remove('filled');
        });
        
        // Get the current wave enemies
        const currentWaveEnemies = this.game.dungeonWaves[this.currentPreviewWave];
        
        // Update wave counter
        const waveNav = document.getElementById('waveNavigation');
        if (waveNav) {
            const waveText = waveNav.querySelector('.waveText');
            if (waveText) {
                waveText.textContent = `Wave ${this.currentPreviewWave + 1}/${this.game.dungeonWaves.length}`;
            }
        }
        
        // Populate with current wave enemies
        currentWaveEnemies.forEach((enemy, index) => {
            if (index < 5) { // Ensure we don't exceed 5 slots
                const slot = slots[index];
                
                // Generate stars using consolidated function
                const starData = enemy.getStars();
                
                slot.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <div style="position: relative; width: 100px; height: 100px;">
                            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/enemies/${enemy.enemyId}.png"
                                 alt="${enemy.name}" 
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 60 60\\'><rect fill=\\'%23666\\' width=\\'60\\' height=\\'60\\'/><text x=\\'30\\' y=\\'35\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'10\\'>${enemy.name}</text></svg>'">
                            ${starData.html ? `<div class="enemyStars ${starData.colorClass}">${starData.html}</div>` : ''}
                            <div class="enemyLevel">${enemy.level}</div>
                        </div>
                        <div class="enemyName">${enemy.name}</div>
                    </div>
                `;
                slot.classList.add('filled');
                
                // Add click handler for enemy info
                slot.style.cursor = 'pointer';
                slot.onclick = (e) => {
                    e.stopPropagation();
                    this.showEnemyInfoPopup(enemy);
                };
                // Add right-click handler for enemy info
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showEnemyInfoPopup(enemy);
                });
            }
        });
    }

updateArenaEnemyFormation() {
    const enemyFormation = document.getElementById('enemyFormation');
    const slots = enemyFormation.querySelectorAll('.enemySlot');
    
    // Clear all enemy slots first
    slots.forEach(slot => {
        slot.innerHTML = '<div class="slotPlaceholder">⬡</div>';
        slot.classList.remove('filled');
    });
    
    // Update wave navigation for arena teams
    const waveNav = document.getElementById('waveNavigation');
    if (waveNav && this.game.arenaTeams) {
        waveNav.style.display = '';
        const waveText = waveNav.querySelector('.waveText');
        if (waveText) {
            const currentTeam = this.game.arenaTeams[this.game.currentArenaTeam];
            const teamName = currentTeam ? currentTeam.name : 'No Team';
            const isAccessible = this.game.isArenaTeamAccessible(this.game.currentArenaTeam);
            
            // Show lock icon if not accessible
            if (!isAccessible) {
                waveText.innerHTML = `🔒 ${teamName}`;
            } else {
                waveText.textContent = teamName;
            }
        }
        
        // Disable/enable navigation arrows
const prevArrow = waveNav.querySelector('.waveArrow:first-child');
const nextArrow = waveNav.querySelector('.waveArrow:last-child');

if (prevArrow) {
    // Never disable the prev arrow - allow wrap around
    prevArrow.disabled = false;
    prevArrow.style.opacity = '1';
    prevArrow.style.cursor = 'pointer';
}
        
        if (nextArrow) {
            const canGoNext = this.game.currentArenaTeam < this.game.arenaTeams.length - 1 && 
                            this.game.isArenaTeamAccessible(this.game.currentArenaTeam + 1);
            nextArrow.disabled = !canGoNext;
            nextArrow.style.opacity = nextArrow.disabled ? '0.5' : '1';
            nextArrow.style.cursor = nextArrow.disabled ? 'default' : 'pointer';
        }
    }
    
    // Only show opponents if team is accessible
    if (this.game.isArenaTeamAccessible(this.game.currentArenaTeam) && this.game.arenaOpponents) {
        this.game.arenaOpponents.forEach((enemy, index) => {
            if (index < 5) {
                const slot = slots[index];
                
// Get class data for display name
const classData = unitData?.classes[enemy.className];
const classTier = classData?.tier || 0;

// Generate stars - arena enemies are hero-like
const starData = this.game.generateStars({ 
    type: 'enemy',
    isHeroLike: true,
    classTier: classTier,
    awakened: enemy.awakened || false 
});
                
                // Get display class name from unitData
                const displayClassName = classData?.name || enemy.className;
                
                slot.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <div style="position: relative; width: 100px; height: 100px;">
                            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${enemy.className}_portrait.png"
                                 alt="${enemy.name}" 
                                 style="width: 100%; height: 100%; object-fit: cover; object-position: top center; image-rendering: pixelated;"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 60 60\\'><rect fill=\\'%23666\\' width=\\'100\\' height=\\'100\\'/><text x=\\'30\\' y=\\'35\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'18\\'>${enemy.name}</text></svg>'">
                            ${starData.html ? `<div class="thumbStars ${starData.colorClass}" style="position: absolute; bottom: 0; left: 2; font-size: 18px;">${starData.html}</div>` : ''}
                            <div class="enemyLevel">${enemy.level}</div>
                        </div>
                        <div class="enemyName">${displayClassName} <span class="gender-${enemy.gender}">${enemy.gender === 'male' ? '♂' : '♀'}</span></div>
                    </div>
                `;
                slot.classList.add('filled');
                
                // Add click handler for enemy info
                slot.style.cursor = 'pointer';
                slot.onclick = (e) => {
                    e.stopPropagation();
                    this.showArenaEnemyInfoPopup(enemy);
                };
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showArenaEnemyInfoPopup(enemy);
                });
            }
        });
    } else {
        // Show locked state
        const centerSlot = slots[2]; // Middle slot
        if (centerSlot) {
            centerSlot.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <div style="font-size: 48px;">🔒</div>
                    <div style="color: #6a9aaa; font-size: 12px;">Beat previous team to unlock</div>
                </div>
            `;
        }
    }
}

showArenaEnemyInfoPopup(enemy) {
    // Similar to showEnemyInfoPopup but shows gear
    const popup = document.getElementById('heroInfoPopup');
    popup._currentHero = enemy;
    
    // Show full format like heroes
    const classData = unitData?.classes[enemy.className];
    const displayClassName = classData?.name || enemy.className;
    document.getElementById('popupHeroName').innerHTML = `Lv.${enemy.level} ${displayClassName} <span class="gender-${enemy.gender}">${enemy.gender === 'male' ? '♂' : '♀'}</span> | ${enemy.name}`;
    
    // Show stats
    const stats = enemy.totalStats || enemy.baseStats;
    const statsHtml = `
        <div style="display: flex; gap: 40px;">
            <div style="flex: 1;">
                ${this.renderPopupStatRow('Health Points', 'HP', enemy.hp)}
                ${this.renderPopupStatRow('Attack', 'Attack', enemy.attack)}
                ${this.renderPopupStatRow('Strength', 'STR', stats.str, enemy.mainstat === 'str', enemy)}
                ${this.renderPopupStatRow('Agility', 'AGI', stats.agi, enemy.mainstat === 'agi', enemy)}
                ${this.renderPopupStatRow('Intelligence', 'INT', stats.int, enemy.mainstat === 'int', enemy)}
            </div>
            <div style="flex: 1;">
                ${this.renderPopupStatRow('HP Regeneration', 'Regen', enemy.hpRegen.toFixed(1))}
                ${this.renderPopupStatRow('Attack Speed', 'Atk Spd', enemy.actionBarSpeed.toFixed(1) + '%')}
                <div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Armor')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Armor</span>
    <span class="statValue">${Math.floor(enemy.armor)}<br><span style="color: #6a9aaa;">(${(enemy.physicalDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
<div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Resistance')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Resist</span>
    <span class="statValue">${Math.floor(enemy.resist)}<br><span style="color: #6a9aaa;">(${(enemy.magicDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
            </div>
        </div>
    `;
    document.getElementById('popupStats').innerHTML = statsHtml;
    
    // Show abilities
    const abilityIconsHtml = `
        <div style="display: flex; gap: 8px; margin-top: 10px;">
            ${enemy.abilities.map((ability, index) => {
                const isPassive = ability.passive === true;
                return `
                    <div class="abilityIconSmall ${isPassive ? 'passive' : ''}" 
                         data-ability-index="${index}"
                         data-hero-type="enemy">
                        ${isPassive ? `
                            <div class="waterbrush-overlay-1">
                                <div class="waterbrush-blob-1"></div>
                                <div class="waterbrush-blob-2"></div>
                            </div>
                        ` : ''}
                        <img src="https://puzzle-drops.github.io/TEVE/img/spells/${ability.id}.png" 
                             style="width: 64px; height: 64px;" 
                             alt="${ability.name}" 
                             onerror="this.style.display='none'">
                    </div>
                `;
            }).join('')}
        </div>
    `;
    document.getElementById('popupAbilities').innerHTML = abilityIconsHtml;
    
    // Add event listeners for tooltips
    const abilityIcons = document.querySelectorAll('#popupAbilities .abilityIconSmall');
    abilityIcons.forEach((icon, index) => {
        icon.addEventListener('mouseenter', (e) => {
            const ability = enemy.abilities[index];
            const showFormula = e.altKey;
            const tooltipHtml = this.formatAbilityTooltip(ability, ability.level || enemy.spellLevel, enemy, showFormula);
            this.showAbilityTooltipFromHTML(e, tooltipHtml);
        });
        icon.addEventListener('mouseleave', () => {
            this.hideAbilityTooltip();
        });
    });
    
// Show gear with gear score
const gearHtml = `
    <div class="gearGrid">
        ${this.renderArenaGearSlot(enemy, 'trinket')}
        ${this.renderArenaGearSlot(enemy, 'head')}
        ${this.renderArenaGearSlot(enemy, 'weapon')}
        ${this.renderArenaGearSlot(enemy, 'chest')}
        ${this.renderArenaGearSlot(enemy, 'offhand')}
        ${this.renderArenaGearSlot(enemy, 'legs')}
    </div>
    <div style="text-align: left; margin-top: 10px; font-size: 16px; color: #4dd0e1;">
        Gear Score: ${enemy.getGearScore()}
    </div>
`;
document.getElementById('popupGear').innerHTML = gearHtml;
    
    popup.style.display = 'block';
}

renderArenaGearSlot(enemy, slot) {
    const slotLabels = {
        trinket: 'Trinket',
        head: 'Head',
        weapon: 'Weapon',
        chest: 'Chest',
        offhand: 'Offhand',
        legs: 'Legs'
    };
    
    const item = enemy.gear[slot];
    return `
        <div class="gearSlot">
            <div class="gearLabel">${slotLabels[slot]}</div>
            ${item ? 
                `<div class="gearItem ${item.getRarity()}"
onmouseenter="game.uiManager.showItemTooltip(event, document.getElementById('heroInfoPopup')._currentHero.gear.${slot})"
onmouseleave="game.uiManager.hideItemTooltip()">
                    <div class="itemContainer">
                        <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                             alt="${item.name}"
                             onerror="this.style.display='none'">
                        ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                        ${item.getStars().html ? `<div class="itemStars ${item.getStars().colorClass}">${item.getStars().html}</div>` : ''}
                        <div class="itemLevel">${item.level}</div>
                        <div class="itemQuality">${item.getQualityPercent()}%</div>
                    </div>
                </div>` 
                : ''}
        </div>
    `;
}
    
    updateRewardsDisplay() {
        if (!this.game.currentDungeonData) return;
        
        const rewards = this.game.currentDungeonData.rewards || { gold: 0, exp: 0, items: [] };
        
        // Update gold and exp display
        document.getElementById('dungeonGoldReward').textContent = rewards.gold.toLocaleString() + 'g';
        document.getElementById('dungeonExpReward').textContent = `${rewards.exp.toLocaleString()} EXP`;
        
        // Update items grid
        const itemsGrid = document.getElementById('rewardItemsGrid');
        itemsGrid.innerHTML = '';
        
        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(itemId => {
                // Create a perfect 4-roll item for display
                const displayItem = new Item(itemId);
                
                // Set all qualities to 5/5 if the item has the rolls
                if (displayItem.roll1) displayItem.quality1 = 5;
                if (displayItem.roll2) displayItem.quality2 = 5;
                if (displayItem.roll3) displayItem.quality3 = 5;
                if (displayItem.roll4) displayItem.quality4 = 5;
                
                const starData = displayItem.getStars();
                const rarity = displayItem.getRarity();
                
                const itemSlot = document.createElement('div');
                itemSlot.className = `rewardItemSlot ${rarity}`;
                itemSlot.innerHTML = `
                    <div class="itemContainer">
                        <img src="https://puzzle-drops.github.io/TEVE/img/items/${itemId}.png" 
                             alt="${displayItem.name}"
                             style="width: 100%; height: 100%;"
                             onerror="this.style.display='none'">
                        ${starData.html ? `<div class="itemStars ${starData.colorClass}">${starData.html}</div>` : ''}
                        <div class="itemLevel">${displayItem.level}</div>
                    </div>
                `;
                
                // Add hover tooltip
                itemSlot.onmouseenter = (e) => {
                    // Create a temporary reference for the tooltip
                    this.game.tempRewardItem = displayItem;
                    this.showItemTooltip(e, displayItem);
                };
                itemSlot.onmouseleave = () => {
                    this.hideItemTooltip();
                    delete this.game.tempRewardItem;
                };
                
                itemsGrid.appendChild(itemSlot);
            });
        }
    }

updateRecordsDisplay() {
    if (!this.game.currentDungeon) return;
    
    const dungeonId = this.game.currentDungeon.id;
    const dungeonProgress = this.game.progression.completedDungeons[dungeonId] || { completions: 0, bestTime: null };
    
    // Update best time
    const bestTimeElement = document.getElementById('dungeonBestTime');
    bestTimeElement.textContent = dungeonProgress.bestTime || '--:--';
    
    // Update completions
    const completionsElement = document.getElementById('dungeonCompletions');
    completionsElement.textContent = `${dungeonProgress.completions} completed`;
    
    // Update collection percentage using the shared method
    const collectionStats = this.game.getDungeonCollectionStats(dungeonId);
    const collectionElement = document.getElementById('dungeonCollectionPercent');
    collectionElement.textContent = `${collectionStats.percentage}%`;
}

    updateArenaRecordsDisplay() {
    if (this.game.arenaMode !== 'spar' || this.game.currentArenaTeam === undefined) return;
    
    const teamId = `team_${this.game.currentArenaTeam}`;
    const arenaProgress = this.game.progression.completedArenas[teamId] || { 
        completions: 0, 
        bestTime: null, 
        lowestDeaths: null 
    };
    
    // Update best time
    const bestTimeElement = document.getElementById('dungeonBestTime');
    if (bestTimeElement) {
        bestTimeElement.textContent = arenaProgress.bestTime || '--:--';
    }
    
    // Update completions
    const completionsElement = document.getElementById('dungeonCompletions');
    if (completionsElement) {
        completionsElement.textContent = `${arenaProgress.completions} completed`;
    }
    
    // Update deaths record (using collection percent element)
    const deathsElement = document.getElementById('dungeonCollectionPercent');
    if (deathsElement) {
        if (arenaProgress.lowestDeaths !== null) {
            deathsElement.textContent = `${arenaProgress.lowestDeaths} deaths`;
        } else {
            deathsElement.textContent = '-- deaths';
        }
    }
}

    updateHeroList() {
        const heroList = document.getElementById('heroList');
        heroList.innerHTML = '';
        
        // Sort heroes by awakened status, then tier, then level
        const sortedHeroes = [...this.game.heroes].sort((a, b) => {
            // Awakened heroes first
            if (a.awakened !== b.awakened) return b.awakened ? 1 : -1;
            // Then by tier
            if (a.classTier !== b.classTier) return b.classTier - a.classTier;
            // Finally by level
            return b.level - a.level;
        });
        
        sortedHeroes.forEach((hero, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'heroThumb';
            if (this.game.heroes.indexOf(hero) === this.selectedHero) {
                thumb.classList.add('selected');
            }
            
            // Generate stars using consolidated function
            const starData = hero.getStars();
            
            // Check if hero can promote (but not if already awakened)
            const canPromote = hero.canPromote() && !hero.awakened;
            const isAwakenable = hero.classTier === 4 && hero.level >= 400 && !hero.awakened;

// Store the actual hero index as a data attribute
thumb.dataset.heroIndex = this.game.heroes.indexOf(hero);

thumb.innerHTML = `
    <div style="position: relative; width: 100px; height: 100px;">
        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_portrait.png" alt="${hero.displayClassName}" 
             style="width: 100%; height: 100%; object-fit: cover; object-position: top center; image-rendering: pixelated;"
             onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><rect fill=\\'%23666\\' width=\\'100\\' height=\\'100\\'/><text x=\\'50\\' y=\\'55\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'14\\'>${hero.displayClassName}</text></svg>'">
     
    ${starData.html ? `<div class="thumbStars ${starData.colorClass}">${starData.html}</div>` : ''}

    <div class="thumbLevel">${hero.level}</div>

    ${canPromote ? `<div class="promoteArrowThumb ${isAwakenable ? 'awaken' : 'normal'}">^</div>` : ''}
</div>

<div class="thumbClass">${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span></div>
<div class="thumbName">${hero.name}</div>
`;

thumb.onclick = () => this.game.selectHero(this.game.heroes.indexOf(hero));
heroList.appendChild(thumb);
        });
    }

updateHeroSelection() {
    // Just update the selected state without rebuilding the entire list
    const heroThumbs = document.querySelectorAll('.heroThumb');
    heroThumbs.forEach((thumb, index) => {
        const heroIndex = parseInt(thumb.dataset.heroIndex);
        if (heroIndex === this.selectedHero) {
            thumb.classList.add('selected');
        } else {
            thumb.classList.remove('selected');
        }
    });
}


    
    // Tab Content Rendering
    showHeroTab(tab) {
        this.currentTab = tab;
        const hero = this.game.heroes[this.selectedHero];
        const content = document.getElementById('heroContent');
        
        // Update tab buttons
        document.querySelectorAll('.tabButton').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
        });
        
        switch(tab) {
            case 'info':
                this.showInfoTab(hero, content);
                break;
            case 'skills':
                this.showSkillsTab(hero, content);
                break;
            case 'promote':
                this.showPromoteTab(hero, content);
                break;
            case 'gear':
                this.showGearTab(hero, content);
                break;
            case 'log':
                this.showLogTab(hero, content);
                break;
        }
    }

    showInfoTab(hero, content) {
        // Generate stars using consolidated function
        const starData = hero.getStars();
            
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                ${starData.html ? `<div style="font-size: 70px; font-weight: bold; margin-top: -24px; ${starData.colorClass === 'awakened' ? 'color: #d896ff;' : 'color: #ffd700;'} text-shadow: 0 0 12px ${starData.colorClass === 'awakened' ? 'rgba(216, 150, 255, 0.9)' : 'rgba(255, 215, 0, 0.9)'}, 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 3px rgba(255, 255, 255, 0.6); letter-spacing: 2px;">${starData.html}</div>` : ''}
                <div class="heroName">${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span></div>
                <div style="font-size: 40px; color: #6a9aaa; cursor: pointer;" onclick="game.editHeroName()">
                    <span id="heroNameText">${hero.name}</span>
                </div>
                <div style="font-size: 44px; color: #4dd0e1; margin-top: 30px;">Level ${hero.level}</div>
            </div>
            <div class="expBar" style="position: relative; height: 60px; border: 1px solid #2a6a8a;">
                <div class="expFill" style="width: ${hero.level >= 500 ? '100' : Math.max(0, Math.min((hero.exp / hero.expToNext) * 100, 100))}%; height: 100%; background: ${hero.level >= 500 && hero.awakened ? 'linear-gradient(90deg, #d896ff 0%, #a855f7 100%)' : 'linear-gradient(90deg, #0066cc 0%, #0099ff 100%)'}; box-shadow: 0 0 10px ${hero.level >= 500 && hero.awakened ? 'rgba(216, 150, 255, 0.5)' : 'rgba(0, 153, 255, 0.5)'};"></div>
                <div class="expText" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 42px; color: ${hero.level >= 500 ? '#fff' : '#6a9aaa'};">
                    ${hero.level >= 500 ? 'Max Level' : `${hero.exp} / ${hero.expToNext} (${((hero.exp / hero.expToNext) * 100).toFixed(1)}%)`}
                </div>
            </div>
            
<div style="margin-top: 24px; display: flex; gap: 20px; align-items: flex-start;">
    <div style="flex: 0 0 auto; min-width: 220px; justify-items: anchor-center;">
        <div class="gearGrid" style="margin-top: 0; gap: 10px; pointer-events: none; grid-template-columns: 100px 100px; width: auto;">
            ${this.renderGearSlotReadOnly(hero, 'trinket', this.selectedHero)}
            ${this.renderGearSlotReadOnly(hero, 'head', this.selectedHero)}
            ${this.renderGearSlotReadOnly(hero, 'weapon', this.selectedHero)}
            ${this.renderGearSlotReadOnly(hero, 'chest', this.selectedHero)}
            ${this.renderGearSlotReadOnly(hero, 'offhand', this.selectedHero)}
            ${this.renderGearSlotReadOnly(hero, 'legs', this.selectedHero)}
        </div>
        <div style="text-align: left; margin-top: 16px; font-size: 28px; color: #4dd0e1;">
            Gear Score: ${hero.getGearScore()}
        </div>
    </div>
              
                <div style="flex: 1; min-width: 220px;">
                    ${this.renderStatLine('Health Points', 'HP', hero.baseStats.hp, hero.gearStats.hp, this.selectedHero)}
                    ${this.renderStatLine('Attack', 'Atk', hero.baseStats.attack, hero.gearStats.attack, this.selectedHero)}
                    ${this.renderStatLine('Strength', 'Str', hero.baseStats.str, hero.gearStats.str, this.selectedHero, hero.mainstat === 'str')}
                    ${this.renderStatLine('Agility', 'Agi', hero.baseStats.agi, hero.gearStats.agi, this.selectedHero, hero.mainstat === 'agi')}
                    ${this.renderStatLine('Intelligence', 'Int', hero.baseStats.int, hero.gearStats.int, this.selectedHero, hero.mainstat === 'int')}
                </div>
                
                <div style="flex: 1; min-width: 220px;">
                    ${this.renderStatLine('HP Regeneration', 'HP Reg', hero.baseStats.hpRegen.toFixed(1), hero.gearStats.hpRegen > 0 ? hero.gearStats.hpRegen.toFixed(1) : 0, this.selectedHero)}
                    ${this.renderStatLine('Attack Speed', 'Atk Spd', hero.baseStats.attackSpeed.toFixed(1) + '%', hero.gearStats.attackSpeed > 0 ? hero.gearStats.attackSpeed.toFixed(1) + '%' : 0, this.selectedHero)}
                    <div class="statLine" onmouseover="game.uiManager.showStatTooltip(event, 'Armor')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statName">Armor</span>
    <span class="statValue">${Math.floor(hero.baseStats.armor)} ${hero.gearStats.armor > 0 ? `<span class="statBonus">+${hero.gearStats.armor}</span>` : ''}<br><span style="color: #6a9aaa;">(${(hero.physicalDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
<div class="statLine" onmouseover="game.uiManager.showStatTooltip(event, 'Resistance')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statName">Resist</span>
    <span class="statValue">${Math.floor(hero.baseStats.resist)} ${hero.gearStats.resist > 0 ? `<span class="statBonus">+${hero.gearStats.resist}</span>` : ''}<br><span style="color: #6a9aaa;">(${(hero.magicDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
                </div>
            </div>
        `;
    }

    renderGearSlotReadOnly(hero, slot, heroIndex) {
        const slotLabels = {
            trinket: 'Trinket',
            head: 'Head',
            weapon: 'Weapon',
            chest: 'Chest',
            offhand: 'Offhand',
            legs: 'Legs'
        };
        
        const item = hero.gear[slot];
        return `
            <div class="gearSlot" style="cursor: default;">
                <div class="gearLabel" style="font-size: 24px;">${slotLabels[slot]}</div>
                ${item ? 
                    `<div class="gearItem ${item.getRarity()}" 
                         style="pointer-events: all;"
                         onmouseenter="game.uiManager.showItemTooltip(event, game.heroes[${heroIndex}].gear.${slot})"
                         onmouseleave="game.uiManager.hideItemTooltip()">
                        <div class="itemContainer">
                            <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                                 alt="${item.name}"
                                 onerror="this.style.display='none'">
                            ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                            ${item.getStars().html ? `<div class="itemStars ${item.getStars().colorClass}">${item.getStars().html}</div>` : ''}
                            <div class="itemLevel">${item.level}</div>
                            <div class="itemQuality">${item.getQualityPercent()}%</div>
                        </div>
                    </div>` 
                    : ''}
            </div>
        `;
    }

    renderStatLine(tooltip, label, base, bonus, heroIndex, isMainStat = false) {
        const bonusText = bonus > 0 ? `<span class="statBonus">+${bonus}</span>` : '';
        return `
            <div class="statLine" onmouseover="game.uiManager.showStatTooltip(event, '${tooltip}', game.heroes[${heroIndex}])" onmouseout="game.uiManager.hideStatTooltip()">
                <span class="statName ${isMainStat ? 'mainstat' : ''}">${label}</span>
                <span class="statValue">${base} ${bonusText}</span>
            </div>
        `;
    }

    showSkillsTab(hero, content) {
        // Check if we have a previously selected skill index
        const selectedIndex = this.currentSkillIndex !== undefined ? this.currentSkillIndex : 0;
        
        content.innerHTML = `
            <div class="skillsContainer">
                ${hero.abilities.map((ability, index) => {
                    const isPassive = ability.passive === true;
                    const isSelected = index === selectedIndex;
                    return `
                        <div class="skillBox ${isPassive ? 'passive' : ''} ${isSelected ? 'selected' : ''}" onclick="game.selectSkill(${index})">
                            ${isPassive ? `
                                <div class="waterbrush-overlay-1">
                                    <div class="waterbrush-blob-1"></div>
                                    <div class="waterbrush-blob-2"></div>
                                </div>
                            ` : ''}
                            <img src="https://puzzle-drops.github.io/TEVE/img/spells/${ability.id}.png" alt="${ability.name}" onerror="this.style.display='none'">
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="skillDescription" id="skillDescription">
                Click on a skill to see its description
            </div>
        `;
        
        // Automatically select the stored skill or first skill
        if (hero.abilities.length > 0) {
            this.game.selectSkill(selectedIndex);
        }
    }

    showPromoteTab(hero, content) {
        const canPromote = hero.canPromote();
        const promotions = hero.getPromotionOptions();
        
        // Special case for Awakening
        if (promotions.includes('Awaken')) {
            content.innerHTML = `
                <div class="promoteContent">
                    <div class="classCard">
                        <h2>Awaken</h2>
                        <div style="font-size: 32px; font-weight: bold; color: #d896ff; text-shadow: 0 0 12px rgba(216, 150, 255, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 3px rgba(255, 255, 255, 0.6); letter-spacing: 2px;">★★★★★★</div>
                        <button class="promoteButton ${canPromote ? '' : 'disabled'}" 
                            style="${canPromote ? 'background: linear-gradient(135deg, #d896ff 0%, #a855f7 100%); box-shadow: 0 0 20px rgba(216, 150, 255, 0.5); color: #0a1929;' : ''}" 
                            onclick="${canPromote ? 'game.uiManager.showPromotionConfirm(\'Awaken\')' : ''}" 
                            onmouseover="${canPromote ? 'this.style.background=\'linear-gradient(135deg, #e6b0ff 0%, #d896ff 100%)\'; this.style.boxShadow=\'0 0 30px rgba(230, 176, 255, 0.7)\'' : ''}"
                            onmouseout="${canPromote ? 'this.style.background=\'linear-gradient(135deg, #d896ff 0%, #a855f7 100%)\'; this.style.boxShadow=\'0 0 20px rgba(216, 150, 255, 0.5)\'' : ''}"
                            ${canPromote ? '' : 'disabled'}>
                            ${canPromote ? 'Awaken<br><span style="font-size: 30px;">💰 -10000000</span>' : `Requires:<br><span style="font-size: 30px;">Level 400</span>`}
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        // Already awakened
        if (hero.awakened) {
            content.innerHTML = `
                <div class="promoteContent">
                    <h2>No promotions available</h2>
                    <p>Hero has been awakened!</p>
                </div>
            `;
            return;
        }
        
        // Get promotion level requirement
        const promoteLevels = { 0: 50, 1: 100, 2: 200, 3: 300, 4: 400 };
        const requiredLevel = promoteLevels[hero.classTier] || 999;
        
        // Determine if this is a villager (has 8 promotion options)
        const isVillager = hero.classTier === 0 && promotions.length === 8;
        const promoteClass = isVillager ? 'promoteOptionsVillager' : 'promoteOptions';
        
        content.innerHTML = `
            <div class="promoteContent">
                <div class="${promoteClass}">
                    ${promotions.map(promo => {
                        const promoClass = unitData?.classes[promo];
                        if (!promoClass) return '';
                        
                        // Generate stars for promotion class
                        const promoStarData = this.game.generateStars({ 
                            type: 'hero', 
                            classTier: promoClass.tier, 
                            awakened: false 
                        });
                        
                        // Get display name
                        let displayName = promoClass.name;
                        
                        const cost = 1000 * Math.pow(10, hero.classTier);
                        
                        return `
                            <div class="classCard">
                                <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${promo}_portrait.png" alt="${displayName}" 
                                     style="width: 128px; height: 128px; object-fit: cover; object-position: top center; image-rendering: pixelated;"
                                     onerror="this.style.display='none'">
                                <div class="classStars" style="font-size: 32px; font-weight: bold; color: #ffd700; text-shadow: 0 0 12px rgba(255, 215, 0, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 3px rgba(255, 255, 255, 0.6); letter-spacing: 2px;">${promoStarData.html}</div>
                                <h2>${displayName}</h2>
                                <button class="promoteButton ${canPromote ? '' : 'disabled'}" 
                                    onclick="${canPromote ? `game.uiManager.showPromotionConfirm('${promo}')` : ''}"
                                    ${canPromote ? '' : 'disabled'}>
                                    ${canPromote ? 
                                        `Promote<br><span style="font-size: 30px;">💰 -${cost}</span>` : 
                                        `Requires:<br><span style="font-size: 30px;">Level ${requiredLevel}</span>`
                                    }
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    showGearTab(hero, content) {
        // Hide any existing tooltips before DOM manipulation
        this.hideItemTooltip();
        this.hideAbilityTooltip();

        // Get the stash for this hero's class family
        const familyName = this.game.getClassFamily(hero.className, hero.classTier);
        if (!this.game.currentStashFamily) {
            this.game.currentStashFamily = this.game.classFamilies.find(f => f.name === familyName) || { name: familyName, classes: [] };
            // Special case for Villager
            if (familyName === 'Villager') {
                this.game.currentStashFamily = { name: 'Villager', icon: '👥', classes: ['Villager', 'Tester'] };
            }
        }
        
        // Get the stash for this hero's class family
        const stash = this.game.stashes[familyName];
        const items = stash.items;
        
        // Always show filter, but default based on item count only if no filter is set
        let filterValue;
        if (this.currentGearFilter) {
            // User has selected a filter, always use it
            filterValue = this.currentGearFilter;
        } else {
            // No filter selected yet, use smart defaults
            filterValue = items.length > 100 ? 'trinket' : 'all';
        }
        
        // Filter items based on selection
        let itemsToShow = items;
        if (filterValue !== 'all') {
            itemsToShow = items.filter(item => item.slot === filterValue);
        }

        // Sort stash items using custom sort settings
        const sortedStashItems = this.game.sortItems(itemsToShow);

        content.innerHTML = `
            <div style="display: flex; gap: 20px; height: 100%;">
                <div style="flex: 0 0 auto;">
                    <h3>Gear</h3>
                    <div class="gearGrid">
                        ${this.renderGearSlot(hero, 'trinket', this.selectedHero)}
                        ${this.renderGearSlot(hero, 'head', this.selectedHero)}
                        ${this.renderGearSlot(hero, 'weapon', this.selectedHero)}
                        ${this.renderGearSlot(hero, 'chest', this.selectedHero)}
                        ${this.renderGearSlot(hero, 'offhand', this.selectedHero)}
                        ${this.renderGearSlot(hero, 'legs', this.selectedHero)}
                    </div>
                    <div class="gearStatsPreview">
    <div style="text-align: center; margin-bottom: 20px; margin-top: 10px; font-size: 24px; color: #4dd0e1;">
        Gear Score: ${hero.getGearScore()}
    </div>
    <h4>Total Stats</h4>
    <div class="gearStatsGrid">
                            ${this.renderGearStatLine('Health Points', 'HP:', hero.hp, false)}
                            ${this.renderGearStatLine('HP Regeneration', 'REG:', hero.hpRegen.toFixed(1), false)}
                            ${this.renderGearStatLine('Attack', 'ATK:', hero.attack, false)}
                            ${this.renderGearStatLine('Attack Speed', 'SPD:', hero.actionBarSpeed.toFixed(1), false)}
                            ${this.renderGearStatLine('Strength', 'STR:', hero.totalStats.str, hero.mainstat === 'str', this.selectedHero)}
                            ${this.renderGearStatLine('Agility', 'AGI:', hero.totalStats.agi, hero.mainstat === 'agi', this.selectedHero)}
                            ${this.renderGearStatLine('Intelligence', 'INT:', hero.totalStats.int, hero.mainstat === 'int', this.selectedHero)}
                            ${this.renderGearStatLine('Armor', 'ARM:', Math.floor(hero.armor), false)}
                            ${this.renderGearStatLine('Armor', 'PHYS RED:', (hero.physicalDamageReduction * 100).toFixed(1) + '%', false)}
                            ${this.renderGearStatLine('Resistance', 'RES:', Math.floor(hero.resist), false)}
                            ${this.renderGearStatLine('Resistance', 'MAG RED:', (hero.magicDamageReduction * 100).toFixed(1) + '%', false)}
                        </div>
                    </div>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <h3 style="text-align: center; font-size: 38px; margin-bottom: 0px;">
                        ${familyName} Stash 
                        <span style="color: #ffd700; margin-left: 10px;">💰 ${stash.gold.toLocaleString()}</span>
                        <div class="stashSlotFilter" style="display: inline-flex; margin-left: 20px;">
                            <label>Filter:</label>
                            <select id="gearStashFilterSelect" onchange="game.filterStashSlots('gear')">
                                <option value="all" ${filterValue === 'all' ? 'selected' : ''}>All (${items.length})</option>
                                <option value="trinket" ${filterValue === 'trinket' ? 'selected' : ''}>Trinket</option>
                                <option value="head" ${filterValue === 'head' ? 'selected' : ''}>Head</option>
                                <option value="chest" ${filterValue === 'chest' ? 'selected' : ''}>Chest</option>
                                <option value="legs" ${filterValue === 'legs' ? 'selected' : ''}>Legs</option>
                                <option value="weapon" ${filterValue === 'weapon' ? 'selected' : ''}>Weapon</option>
                                <option value="offhand" ${filterValue === 'offhand' ? 'selected' : ''}>Offhand</option>
                            </select>
                        </div>
                        <button id="gearSortButton" class="sortSettingsButton" onclick="game.uiManager.toggleSortSettings('gear')" title="Sort Settings">↕️</button>
                    </h3>
                    <div style="flex: 1; background: rgba(10, 25, 41, 0.8); padding: 10px; overflow-y: auto;">
                        ${stash && sortedStashItems.length > 0 ? `
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, 100px); gap: 10px;">
                                ${sortedStashItems.map((item, sortedIndex) => {
                                    // Find the original index of this item in the unsorted array
                                    const originalIndex = stash.items.indexOf(item);
                                    const starData = item.getStars();
                                    return `
                                        <div class="stashItemSlot ${item.getRarity()}" 
                                             onclick="game.equipFromStash(${originalIndex}, '${item.slot}')"
                                             oncontextmenu="event.preventDefault(); game.showItemOptionsFromGearTab(${originalIndex}, '${familyName}')"
                                             onmouseenter="game.uiManager.showItemTooltip(event, game.stashes['${familyName}'].items[${originalIndex}], true)"
                                             onmouseleave="game.uiManager.hideItemTooltip()">
                                            <div class="itemContainer">
                                                <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                                                     alt="${item.name}"
                                                     onerror="this.style.display='none'">
                                                ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                                                ${starData.html ? `<div class="itemStars ${starData.colorClass}">${starData.html}</div>` : ''}
                                                <div class="itemLevel">${item.level}</div>
                                                <div class="itemQuality">${item.getQualityPercent()}%</div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : '<p style="text-align: center; color: #6a9aaa;">No items in stash</p>'}
                    </div>
                </div>
            </div>
        `;

        // Hide any lingering tooltips after DOM update
        this.hideItemTooltip();
        this.hideAbilityTooltip();
    }

    renderGearSlot(hero, slot, heroIndex) {
        const slotLabels = {
            trinket: 'Trinket',
            head: 'Head',
            weapon: 'Weapon',
            chest: 'Chest',
            offhand: 'Offhand',
            legs: 'Legs'
        };
        
        const item = hero.gear[slot];
        return `
            <div class="gearSlot">
                <div class="gearLabel">${slotLabels[slot]}</div>
                ${item ? 
                    `<div class="gearItem ${item.getRarity()}" 
                         onclick="game.unequipGear('${slot}')"
                         oncontextmenu="event.preventDefault(); game.showEquippedItemOptions('${slot}')"
                         onmouseenter="game.uiManager.showItemTooltip(event, game.heroes[${heroIndex}].gear.${slot})"
                         onmouseleave="game.uiManager.hideItemTooltip()">
                        <div class="itemContainer">
                            <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                                 alt="${item.name}"
                                 onerror="this.style.display='none'">
                            ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                            ${item.getStars().html ? `<div class="itemStars ${item.getStars().colorClass}">${item.getStars().html}</div>` : ''}
                            <div class="itemLevel">${item.level}</div>
                            <div class="itemQuality">${item.getQualityPercent()}%</div>
                        </div>
                    </div>` 
                    : ''}
            </div>
        `;
    }

    renderGearStatLine(tooltip, label, value, isMainStat = false, heroIndex = null) {
        const heroParam = heroIndex !== null ? `, game.heroes[${heroIndex}]` : '';
        return `
            <div class="gearStatLine" onmouseover="game.uiManager.showStatTooltip(event, '${tooltip}'${heroParam})" onmouseout="game.uiManager.hideStatTooltip()">
                <span class="gearStatLabel ${isMainStat ? 'mainstat' : ''}">${label}</span>
                <span class="gearStatValue">${value}</span>
            </div>
        `;
    }

    showLogTab(hero, content) {
        content.innerHTML = `
            <h3>Activity Log</h3>
            <div style="margin-top: 20px; background: #2a2a2a; padding: 20px; height: 90%; font-size: 24px; overflow-y: auto;">
                <p style="color: #888;">No recent activity</p>
            </div>
        `;
    }

    // Popup/Modal Functions
    showHeroInfoPopup(hero) {
        const popup = document.getElementById('heroInfoPopup');
        popup._currentHero = hero;
        document.getElementById('popupHeroName').innerHTML = `Lv.${hero.level} ${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span> | ${hero.name}`;
        
        // Show stats in double column format
        const stats = hero.totalStats;
        const statsHtml = `
            <div style="display: flex; gap: 40px;">
                <div style="flex: 1;">
                    ${this.renderPopupStatRow('Health Points', 'HP', hero.hp)}
                    ${this.renderPopupStatRow('Attack', 'Attack', hero.attack)}
                    ${this.renderPopupStatRow('Strength', 'STR', stats.str, hero.mainstat === 'str', hero)}
                    ${this.renderPopupStatRow('Agility', 'AGI', stats.agi, hero.mainstat === 'agi', hero)}
                    ${this.renderPopupStatRow('Intelligence', 'INT', stats.int, hero.mainstat === 'int', hero)}
                </div>
                <div style="flex: 1;">
                    ${this.renderPopupStatRow('HP Regeneration', 'Regen', hero.hpRegen.toFixed(1))}
                    ${this.renderPopupStatRow('Attack Speed', 'Atk Spd', hero.actionBarSpeed.toFixed(1) + '%')}
                   <div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Armor')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Armor</span>
    <span class="statValue">${Math.floor(hero.armor)}<br><span style="color: #6a9aaa;">(${(hero.physicalDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
<div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Resistance')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Resist</span>
    <span class="statValue">${Math.floor(hero.resist)}<br><span style="color: #6a9aaa;">(${(hero.magicDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
                </div>
            </div>
        `;
        document.getElementById('popupStats').innerHTML = statsHtml;
                    
        // Show ability icons with tooltips
        const abilityIconsHtml = `
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                ${hero.abilities.map((ability, index) => {
                    const isPassive = ability.passive === true;
                    return `
                        <div class="abilityIconSmall ${isPassive ? 'passive' : ''}" 
                             data-ability-index="${index}"
                             data-hero-type="hero">
                            ${isPassive ? `
                                <div class="waterbrush-overlay-1">
                                    <div class="waterbrush-blob-1"></div>
                                    <div class="waterbrush-blob-2"></div>
                                </div>
                            ` : ''}
                            <img src="https://puzzle-drops.github.io/TEVE/img/spells/${ability.id}.png" 
                                 style="width: 64px; height: 64px;" 
                                 alt="${ability.name}" 
                                 onerror="this.style.display='none'">
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        document.getElementById('popupAbilities').innerHTML = abilityIconsHtml;
        
        // Add event listeners for tooltips
        const abilityIcons = document.querySelectorAll('#popupAbilities .abilityIconSmall');
        abilityIcons.forEach((icon, index) => {
            icon.addEventListener('mouseenter', (e) => {
                const ability = hero.abilities[index];
                const showFormula = e.altKey;
                const tooltipHtml = this.formatAbilityTooltip(ability, ability.level, hero, showFormula);
                this.showAbilityTooltipFromHTML(e, tooltipHtml);
            });
            icon.addEventListener('mouseleave', () => {
                this.hideAbilityTooltip();
            });
        });
                    
        // Show gear in grid format with gear score
const gearHtml = `
    <div class="gearGrid">
        ${this.renderPopupGearSlot(hero, 'trinket', this.game.heroes.indexOf(hero))}
        ${this.renderPopupGearSlot(hero, 'head', this.game.heroes.indexOf(hero))}
        ${this.renderPopupGearSlot(hero, 'weapon', this.game.heroes.indexOf(hero))}
        ${this.renderPopupGearSlot(hero, 'chest', this.game.heroes.indexOf(hero))}
        ${this.renderPopupGearSlot(hero, 'offhand', this.game.heroes.indexOf(hero))}
        ${this.renderPopupGearSlot(hero, 'legs', this.game.heroes.indexOf(hero))}
    </div>
    <div style="text-align: center; margin-top: 15px; font-size: 18px; color: #4dd0e1;">
        Gear Score: ${hero.getGearScore()}
    </div>
`;
document.getElementById('popupGear').innerHTML = gearHtml;
        
        popup.style.display = 'block';
    }

    renderPopupStatRow(tooltip, label, value, isMainStat = false, hero = null) {
        const heroParam = hero ? ', document.getElementById(\'heroInfoPopup\')._currentHero' : '';
        return `
            <div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, '${tooltip}'${heroParam})" onmouseout="game.uiManager.hideStatTooltip()">
                <span class="statLabel ${isMainStat ? 'mainstat' : ''}">${label}</span>
                <span class="statValue">${value}</span>
            </div>
        `;
    }

    renderPopupGearSlot(hero, slot, heroIndex) {
        const slotLabels = {
            trinket: 'Trinket',
            head: 'Head',
            weapon: 'Weapon',
            chest: 'Chest',
            offhand: 'Offhand',
            legs: 'Legs'
        };
        
        const item = hero.gear[slot];
        return `
            <div class="gearSlot">
                <div class="gearLabel">${slotLabels[slot]}</div>
                ${item ? 
                    `<div class="gearItem ${item.getRarity()}"
                         onmouseenter="game.uiManager.showItemTooltip(event, game.heroes[${heroIndex}].gear.${slot})"
                         onmouseleave="game.uiManager.hideItemTooltip()">
                        <div class="itemContainer">
                            <img src="https://puzzle-drops.github.io/TEVE/img/items/${item.id}.png" 
                                 alt="${item.name}"
                                 onerror="this.style.display='none'">
                            ${item.refined ? '<div class="itemRefined">*</div>' : ''}
                            ${item.getStars().html ? `<div class="itemStars ${item.getStars().colorClass}">${item.getStars().html}</div>` : ''}
                            <div class="itemLevel">${item.level}</div>
                            <div class="itemQuality">${item.getQualityPercent()}%</div>
                        </div>
                    </div>` 
                    : ''}
            </div>
        `;
    }

    showEnemyInfoPopup(enemy) {
        const popup = document.getElementById('heroInfoPopup');
        popup._currentHero = enemy;
        
        // Check if this is an arena enemy (has className)
        if (enemy.className) {
            // Arena enemy - show full format like heroes
            const classData = unitData?.classes[enemy.className];
            const displayClassName = classData?.name || enemy.className;
            document.getElementById('popupHeroName').innerHTML = `Lv.${enemy.level} ${displayClassName} <span class="gender-${enemy.gender}">${enemy.gender === 'male' ? '♂' : '♀'}</span> | ${enemy.name}`;
        } else {
            // Regular enemy - just show level and name
            document.getElementById('popupHeroName').textContent = `Lv.${enemy.level} ${enemy.name}`;
        }
        
        // Show stats in double column format
        const stats = enemy.totalStats || enemy.baseStats;
        const statsHtml = `
            <div style="display: flex; gap: 40px;">
                <div style="flex: 1;">
                    ${this.renderPopupStatRow('Health Points', 'HP', enemy.hp)}
                    ${this.renderPopupStatRow('Attack', 'Attack', enemy.attack)}
                    ${this.renderPopupStatRow('Strength', 'STR', stats.str, enemy.mainstat === 'str', enemy)}
                    ${this.renderPopupStatRow('Agility', 'AGI', stats.agi, enemy.mainstat === 'agi', enemy)}
                    ${this.renderPopupStatRow('Intelligence', 'INT', stats.int, enemy.mainstat === 'int', enemy)}
                </div>
                <div style="flex: 1;">
                    ${this.renderPopupStatRow('HP Regeneration', 'Regen', enemy.hpRegen.toFixed(1))}
                    ${this.renderPopupStatRow('Attack Speed', 'Atk Spd', enemy.actionBarSpeed.toFixed(1) + '%')}
                    <div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Armor')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Armor</span>
    <span class="statValue">${Math.floor(enemy.armor)}<br><span style="color: #6a9aaa;">(${(enemy.physicalDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
<div class="statRow" onmouseover="game.uiManager.showStatTooltip(event, 'Resistance')" onmouseout="game.uiManager.hideStatTooltip()">
    <span class="statLabel">Resist</span>
    <span class="statValue">${Math.floor(enemy.resist)}<br><span style="color: #6a9aaa;">(${(enemy.magicDamageReduction * 100).toFixed(1)}%)</span></span>
</div>
                </div>
            </div>
        `;
        document.getElementById('popupStats').innerHTML = statsHtml;
        
        // Show ability icons with tooltips
        const abilityIconsHtml = `
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                ${enemy.abilities.map((ability, index) => {
                    const isPassive = ability.passive === true;
                    return `
                        <div class="abilityIconSmall ${isPassive ? 'passive' : ''}" 
                             data-ability-index="${index}"
                             data-hero-type="enemy">
                            ${isPassive ? `
                                <div class="waterbrush-overlay-1">
                                    <div class="waterbrush-blob-1"></div>
                                    <div class="waterbrush-blob-2"></div>
                                </div>
                            ` : ''}
                            <img src="https://puzzle-drops.github.io/TEVE/img/spells/${ability.id}.png" 
                                 style="width: 64px; height: 64px;" 
                                 alt="${ability.name}" 
                                 onerror="this.style.display='none'">
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        document.getElementById('popupAbilities').innerHTML = abilityIconsHtml;
        
        // Add event listeners for tooltips
        const abilityIcons = document.querySelectorAll('#popupAbilities .abilityIconSmall');
        abilityIcons.forEach((icon, index) => {
            icon.addEventListener('mouseenter', (e) => {
                const ability = enemy.abilities[index];
                const showFormula = e.altKey;
                const tooltipHtml = this.formatAbilityTooltip(ability, ability.level || enemy.spellLevel, enemy, showFormula);
                this.showAbilityTooltipFromHTML(e, tooltipHtml);
            });
            icon.addEventListener('mouseleave', () => {
                this.hideAbilityTooltip();
            });
        });
        
        // Check if enemy has gear (arena enemies)
if (enemy.gear && Object.keys(enemy.gear).some(slot => enemy.gear[slot] !== null)) {
    // Show gear for arena enemies
    const gearHtml = `
        <div class="gearGrid">
            ${this.renderArenaGearSlot(enemy, 'trinket')}
            ${this.renderArenaGearSlot(enemy, 'head')}
            ${this.renderArenaGearSlot(enemy, 'weapon')}
            ${this.renderArenaGearSlot(enemy, 'chest')}
            ${this.renderArenaGearSlot(enemy, 'offhand')}
            ${this.renderArenaGearSlot(enemy, 'legs')}
        </div>
        <div style="text-align: center; margin-top: 15px; font-size: 18px; color: #4dd0e1;">
            Gear Score: ${enemy.getGearScore()}
        </div>
    `;
    document.getElementById('popupGear').innerHTML = gearHtml;
        } else {
            // Show empty gear grid for regular enemies
            const emptyGearHtml = `
                <div class="gearGrid">
                    <div class="gearSlot">
                        <div class="gearLabel">Trinket</div>
                    </div>
                    <div class="gearSlot">
                        <div class="gearLabel">Head</div>
                    </div>
                    <div class="gearSlot">
                        <div class="gearLabel">Weapon</div>
                    </div>
                    <div class="gearSlot">
                        <div class="gearLabel">Chest</div>
                    </div>
                    <div class="gearSlot">
                        <div class="gearLabel">Offhand</div>
                    </div>
                    <div class="gearSlot">
                        <div class="gearLabel">Legs</div>
                    </div>
                </div>
            `;
            document.getElementById('popupGear').innerHTML = emptyGearHtml;
        }
        
        popup.style.display = 'block';
    }

    closeHeroInfo() {
        document.getElementById('heroInfoPopup').style.display = 'none';
        this.hideAbilityTooltip();
    }

    showPromotionConfirm(newClass) {
        const hero = this.game.heroes[this.selectedHero];
        const modal = document.getElementById('confirmModal');
        const confirmText = document.getElementById('confirmText');
        const confirmCost = document.getElementById('confirmCost');
        
        this.game.pendingPromotion = newClass;
        
        if (newClass === 'Awaken') {
            confirmText.textContent = `Awaken ${hero.name} the ${hero.displayClassName}?`;
            confirmCost.innerHTML = `💰 -10000000`;
        } else {
            const promoClass = unitData?.classes[newClass];
            const displayName = promoClass ? promoClass.name : newClass;
            confirmText.textContent = `Promote ${hero.name} the ${hero.displayClassName} to ${displayName}?`;
            const cost = 1000 * Math.pow(10, hero.classTier);
            confirmCost.innerHTML = `💰 -${cost}`;
        }
        
        modal.style.display = 'flex';
    }

    showBattleResults() {
        if (!this.game.pendingBattleResults) return;

        // Hide exit button when showing results
        const exitButton = document.querySelector('.exitBattleButton');
        if (exitButton) {
            exitButton.style.display = 'none';
        }
        
        const results = this.game.pendingBattleResults;
        
        // Apply exp and track level ups BEFORE showing the popup
        const levelUps = [];
        results.heroResults.forEach(result => {
            if (result.survived && result.expGained > 0) {
                const hero = result.hero;
                const startLevel = hero.level;
                
                // Apply the exp
                this.game.addExpToHero(hero, result.expGained);
                
                // Track if hero leveled up
                if (hero.level > startLevel) {
                    result.leveledUp = true;
                    result.levelsGained = hero.level - startLevel;
                    result.newLevel = hero.level;
                }
            }
        });
        
        const popup = document.getElementById('battleResultsPopup');
        
        // Update header
        const titleElement = document.getElementById('resultsTitle');
        titleElement.textContent = results.victory ? 'Victory!' : 'Defeat!';
        titleElement.className = `resultsTitle ${results.victory ? 'victory' : 'defeat'}`;
        
        const infoElement = document.getElementById('dungeonInfo');
        const actionText = results.victory ? 'Defeated' : 'Failed';
        infoElement.textContent = `${actionText} ${results.dungeonName} in ${results.time}`;
        
        // Generate hero results
        const heroGrid = document.getElementById('heroResultsGrid');
        heroGrid.innerHTML = '';
        
        results.heroResults.forEach(result => {
            const hero = result.hero;
            const heroDiv = document.createElement('div');
            heroDiv.className = `heroResult ${result.survived ? '' : 'dead'}`;
            
            // Add item rarity border if hero got an item
            if (result.item) {
                heroDiv.classList.add(result.item.getRarity());
            }
            
            // Generate stars using consolidated function
            const starData = hero.getStars();
            
            // Calculate exp bar fill
            const expPercent = hero.level >= 500 ? 100 : (hero.expToNext > 0 ? (hero.exp / hero.expToNext * 100) : 0);
            
            // Create item/gold slot HTML
            let rewardSlotHTML = '';
            if (result.item) {
                const itemStarData = result.item.getStars();
                rewardSlotHTML = `<div class="itemSlot" onmouseenter="game.uiManager.showItemTooltip(event, game.pendingBattleResults.heroResults[${results.heroResults.indexOf(result)}].item)" onmouseleave="game.uiManager.hideItemTooltip()">
                    <div class="itemContainer">
                        <img src="https://puzzle-drops.github.io/TEVE/img/items/${result.item.id}.png" alt="${result.item.name}" style="width: 100%; height: 100%;" onerror="this.style.display='none'">
                        ${result.item.refined ? '<div class="itemRefined">*</div>' : ''}
                        ${itemStarData.html ? `<div class="itemStars ${itemStarData.colorClass}">${itemStarData.html}</div>` : ''}
                        <div class="itemLevel">${result.item.level}</div>
                        <div class="itemQuality">${result.item.getQualityPercent()}%</div>
                    </div>
                </div>`;
            } else if (result.gold > 0) {
    // Check if this was an autosold item
    if (result.soldItem) {
        const soldItemStarData = result.soldItem.getStars();
        rewardSlotHTML = `<div class="itemSlot golden" onmouseenter="game.uiManager.showGoldTooltip(event, ${result.gold}, ${!results.victory})" onmouseleave="game.uiManager.hideGoldTooltip()">
            <div class="itemContainer" style="position: relative;">
                <!-- Sold item image (greyed out) -->
                <img src="https://puzzle-drops.github.io/TEVE/img/items/${result.soldItem.id}.png" 
                     alt="${result.soldItem.name}"
                     style="width: 100%; height: 100%; filter: grayscale(100%) brightness(0.3); opacity: 0.5;"
                     onerror="this.style.display='none'">
                ${result.soldItem.refined ? '<div class="itemRefined" style="opacity: 0.3;">*</div>' : ''}
                ${soldItemStarData.html ? `<div class="itemStars ${soldItemStarData.colorClass}" style="opacity: 0.3;">${soldItemStarData.html}</div>` : ''}
                <div class="itemLevel" style="opacity: 0.3;">${result.soldItem.level}</div>
                <div class="itemQuality" style="opacity: 0.3;">${result.soldItem.getQualityPercent()}%</div>
                
                <!-- Gold overlay -->
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                            width: 48px; height: 48px; z-index: 10;">
                    <img src="https://puzzle-drops.github.io/TEVE/img/items/gold.png" 
                         alt="Gold" 
                         style="width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.8));">
                </div>
                
                <!-- Gold amount text -->
                <div style="position: absolute; bottom: 2px; right: 2px; 
                            color: #ffd700; font-weight: bold; font-size: 14px; 
                            text-shadow: 0 0 4px rgba(0, 0, 0, 1), 1px 1px 2px rgba(0, 0, 0, 1);
                            z-index: 11;">
                    +${result.gold}
                </div>
            </div>
        </div>`;
    } else {
    // Just gold (no item was rolled)
    rewardSlotHTML = `<div class="itemSlot golden" onmouseenter="game.uiManager.showGoldTooltip(event, ${result.gold}, ${!results.victory})" onmouseleave="game.uiManager.hideGoldTooltip()">
        <div class="itemContainer" style="position: relative;">
            <img src="https://puzzle-drops.github.io/TEVE/img/items/gold.png" 
                 alt="Gold" 
                 style="width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.8));">
            
            <!-- Gold amount text -->
            <div style="position: absolute; bottom: 2px; right: 2px; 
                        color: #ffd700; font-weight: bold; font-size: 14px; 
                        text-shadow: 0 0 4px rgba(0, 0, 0, 1), 1px 1px 2px rgba(0, 0, 0, 1);
                        z-index: 11;">
                +${result.gold}
            </div>
        </div>
    </div>`;
}
            } else {
                rewardSlotHTML = '<div class="itemSlot"></div>';
            }
            
            heroDiv.innerHTML = `
                <div class="heroResultThumb">
                    <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_portrait.png" 
                         alt="${hero.displayClassName}"
                         style="width: 100%; height: 100%; object-fit: cover; object-position: top center; image-rendering: pixelated;"
                         onerror="this.style.display='none'">
                    ${starData.html ? `<div class="thumbStars ${starData.colorClass}" style="position: absolute; bottom: 0; left: 0; font-size: 12px;">${starData.html}</div>` : ''}
                    <div class="thumbLevel" style="position: absolute; bottom: 0; right: 0; font-size: 14px;">${hero.level}</div>
                </div>
                <div class="heroResultClass">${hero.name}</div>
                <div class="heroResultName">${hero.displayClassName} <span class="gender-${hero.gender}">${hero.gender === 'male' ? '♂' : '♀'}</span></div>
                ${result.survived ? `
                    <div class="expGainBar">
                        <div class="expGainFill" style="width: 0%"></div>
                        <div class="expGainText">+${result.expGained} EXP</div>
                    </div>
                    <div class="levelUpContainer" style="height: 30px; margin-top: 20px;">
                        ${result.leveledUp ? `<div style="color: #ffd700; font-size: 14px; font-weight: bold; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);">Level Up! +${result.levelsGained}</div>` : ''}
                    </div>
                ` : '<div style="color: #ff4444; font-size: 12px;">Did not survive</div>'}
                ${rewardSlotHTML}
            `;
            
            heroGrid.appendChild(heroDiv);
            
            // Animate exp bar after a delay
            if (result.survived) {
                setTimeout(() => {
                    const fillElement = heroDiv.querySelector('.expGainFill');
                    if (fillElement) {
                        fillElement.style.width = `${expPercent}%`;
                    }
                }, 100);
            }
        });    
        popup.style.display = 'block';
        
        // Handle auto replay if enabled and victory
if (this.game.autoReplay && results.victory) {
    let countdown = 6;
    this.updateAutoReplayText(countdown);
    
    this.game.autoReplayTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(this.game.autoReplayTimer);
            this.game.autoReplayTimer = null;
            this.game.replayBattle();
        } else {
            this.updateAutoReplayText(countdown);
        }
    }, 1000);
}
    }
    
showArenaResults() {
    if (!this.game.pendingBattleResults) return;
    
    const results = this.game.pendingBattleResults;
    const stats = results.battleStats || {};
    
    // Hide exit button
    const exitButton = document.querySelector('.exitBattleButton');
    if (exitButton) {
        exitButton.style.display = 'none';
    }
    
    // Update header
    const duration = Math.floor((this.game.currentBattle.endTime - this.game.currentBattle.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('arenaMatchInfo').textContent = `Spar Mode - Time: ${timeString}`;
    
    // Helper function to create stat row
const createStatRow = (unit, stats) => {
    const unitStats = stats[unit.name] || {
        kills: 0, deaths: 0, turnsTaken: 0, damageDealt: 0, damageTaken: 0,
        healingDone: 0, shieldingApplied: 0, buffsApplied: 0, debuffsApplied: 0,
        buffsDispelled: 0, debuffsCleansed: 0
    };
    
    // Get portrait URL and class info
    let portraitUrl;
    let className = '';
    let displayClassName = '';
    if (unit.source) {
        portraitUrl = `https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${unit.source.className}_portrait.png`;
        className = unit.source.className;
        // Get display class name
        const classData = unitData?.classes[className];
        displayClassName = classData?.name || className;
    }
    
    // Format name with class and gender
    const genderSymbol = unit.source.gender === 'male' ? '♂' : '♀';
    const formattedName = `${displayClassName} ${genderSymbol} | ${unit.name}`;
    
    return `
        <div class="arenaUnitInfo">
            <img src="${portraitUrl}" alt="${unit.name}" class="arenaUnitPortrait">
            <div class="arenaUnitDetails">
                <div class="arenaUnitName" title="${formattedName}">${formattedName}</div>
                <div class="arenaUnitLevel">Lv ${unit.source.level}</div>
            </div>
        </div>
        <div class="arenaStat">
            <span class="arenaKDA">
                <span class="kdKills">${unitStats.kills}</span><span class="kdSeparator">/</span><span class="kdDeaths">${unitStats.deaths}</span><span class="kdSeparator">/</span><span class="kdTurns">${unitStats.turnsTaken}</span>
            </span>
        </div>
        <div class="arenaStat arenaStatStacked">
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Damage dealt')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">💥</span> <span class="arenaStatValue">${unitStats.damageDealt}</span>
    </div>
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Damage taken')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">💢</span> <span class="arenaStatValue">${unitStats.damageTaken}</span>
    </div>
</div>
<div class="arenaStat arenaStatStacked">
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Healing done')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">💚</span> <span class="arenaStatValue">${unitStats.healingDone}</span>
    </div>
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Shielding applied')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">🛡️</span> <span class="arenaStatValue">${unitStats.shieldingApplied}</span>
    </div>
</div>
<div class="arenaStat arenaStatStacked">
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Buffs applied')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">🔆</span> <span class="arenaStatValue">${unitStats.buffsApplied}</span>
    </div>
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Buffs dispelled')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">🧹</span> <span class="arenaStatValue">${unitStats.buffsDispelled}</span>
    </div>
</div>
<div class="arenaStat arenaStatStacked">
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Debuffs applied')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">🕸️</span> <span class="arenaStatValue">${unitStats.debuffsApplied}</span>
    </div>
    <div class="arenaStatLine" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Debuffs cleansed')" onmouseout="game.uiManager.hideArenaStatTooltip()">
        <span class="arenaStatIcon">🧼</span> <span class="arenaStatValue">${unitStats.debuffsCleansed}</span>
    </div>
</div>
    `;
};
    
    // Create header row HTML
const createHeaderRow = () => {
    return `
        <div class="arenaStatsHeader">
            <div class="arenaHeaderUnit">Unit</div>
            <div class="arenaHeaderStat">K/D/T</div>
            <div class="arenaHeaderStat" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Damage dealt / Damage taken')" onmouseout="game.uiManager.hideArenaStatTooltip()">Damage</div>
            <div class="arenaHeaderStat" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Healing / Shielding')" onmouseout="game.uiManager.hideArenaStatTooltip()">Support</div>
            <div class="arenaHeaderStat" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Buffs applied / Buffs dispelled')" onmouseout="game.uiManager.hideArenaStatTooltip()">Buffs</div>
            <div class="arenaHeaderStat" onmouseover="game.uiManager.showArenaStatTooltip(event, 'Debuffs applied / Debuffs cleansed')" onmouseout="game.uiManager.hideArenaStatTooltip()">Debuffs</div>
        </div>
    `;
};
    
    // Get arena team name for enemy header
    const currentArenaTeam = this.game.arenaTeams && this.game.arenaTeams[this.game.currentArenaTeam];
    const enemyTeamName = currentArenaTeam ? currentArenaTeam.name : 'Enemy Team';
    
    // Populate team stats
    const playerTeamStats = document.getElementById('playerTeamStats');
    const enemyTeamStats = document.getElementById('enemyTeamStats');
    
    // Clear existing content
    playerTeamStats.innerHTML = '';
    enemyTeamStats.innerHTML = '';
    
    // Add headers
    playerTeamStats.innerHTML = '<h3>Your Team</h3>';
    enemyTeamStats.innerHTML = `<h3>${enemyTeamName}</h3>`;
    
    // Create grid containers
    const playerGrid = document.createElement('div');
    playerGrid.className = 'arenaStatsGrid';
    playerGrid.innerHTML = createHeaderRow();
    
    const enemyGrid = document.createElement('div');
    enemyGrid.className = 'arenaStatsGrid';
    enemyGrid.innerHTML = createHeaderRow();
    
    // Add player team stats
    this.game.currentBattle.party.forEach(unit => {
        if (unit) {
            const row = document.createElement('div');
            row.className = 'arenaStatRow';
            row.innerHTML = createStatRow(unit, stats);
            playerGrid.appendChild(row);
        }
    });
    
    // Add enemy team stats
    this.game.currentBattle.enemies.forEach(unit => {
        if (unit) {
            const row = document.createElement('div');
            row.className = 'arenaStatRow';
            row.innerHTML = createStatRow(unit, stats);
            enemyGrid.appendChild(row);
        }
    });
    
    playerTeamStats.appendChild(playerGrid);
    enemyTeamStats.appendChild(enemyGrid);
    
    // Show popup
    document.getElementById('arenaResultsPopup').style.display = 'block';
}
    
updateAutoReplayText(countdown) {
    const replayBtn = document.querySelector('.replayBtn');
    if (replayBtn) {
        if (countdown !== null) {
            replayBtn.textContent = `Auto Replay in ${countdown}...`;
        } else {
            replayBtn.textContent = 'Replay';
        }
    }
}

    showCollectionCompletePopup(item, qualityLevel, heroName, heroClass) {
        // Add to queue
        this.game.collectionPopupQueue.push({
            item: item,
            qualityLevel: qualityLevel,
            heroName: heroName,
            heroClass: heroClass
        });
        
        // If no popup is currently active, show the next one
        if (!this.game.collectionPopupActive) {
            this.showNextCollectionPopup();
        }
    }

    showNextCollectionPopup() {
        // Check if there are popups in queue
        if (this.game.collectionPopupQueue.length === 0) {
            this.game.collectionPopupActive = false;
            return;
        }
        
        // Get the next popup data
        const popupData = this.game.collectionPopupQueue.shift();
        this.game.collectionPopupActive = true;
        
        const popup = document.getElementById('collectionCompletePopup');
        const itemDiv = document.getElementById('collectionCompleteItem');
        const infoDiv = document.getElementById('collectionCompleteInfo');
        
        // Create perfect display item with exact number of rolls
        const displayItem = new Item(popupData.item.id);
        
        // First, clear all qualities
        displayItem.quality1 = 0;
        displayItem.quality2 = 0;
        displayItem.quality3 = 0;
        displayItem.quality4 = 0;
        
        // Then set only the exact number of perfect rolls
        for (let i = 1; i <= popupData.qualityLevel; i++) {
            displayItem[`quality${i}`] = 5;
        }
        
        const starData = displayItem.getStars();
        const rarity = displayItem.getRarity();
        
        // Update popup styling based on rarity
        const rarityColors = {
            green: '#00ff88',
            blue: '#00c3ff',
            purple: '#d896ff',
            red: '#ff4444'
        };
        const color = rarityColors[rarity] || '#00ff88';
        
        popup.style.borderColor = color;
        popup.style.boxShadow = `0 0 50px ${color.replace('#', '#')}88`;
        const titleElement = popup.querySelector('.collectionCompleteTitle');
        if (titleElement) {
            titleElement.style.color = color;
            titleElement.style.textShadow = `0 0 20px ${color.replace('#', '#')}88`;
        }
        
        itemDiv.innerHTML = `
            <div class="stashItemSlot ${rarity}" style="margin: 0 auto;">
                <div class="itemContainer">
                    <img src="https://puzzle-drops.github.io/TEVE/img/items/${popupData.item.id}.png" 
                         alt="${displayItem.name}"
                         onerror="this.style.display='none'">
                    ${starData.html ? `<div class="itemStars ${starData.colorClass}">${starData.html}</div>` : ''}
                    <div class="itemLevel">${displayItem.level}</div>
                    <div class="itemQuality">100%</div>
                </div>
            </div>
        `;
        
        const timestamp = new Date().toLocaleString();
        infoDiv.innerHTML = `
            Obtained by ${popupData.heroName}, the ${popupData.heroClass}.<br>
            ${timestamp}
        `;
        
        popup.style.display = 'block';
        
        // Remove any existing handlers
        const oldHandler = popup._closeHandler;
        if (oldHandler) {
            popup.removeEventListener('click', oldHandler);
        }
        
        // Add click handler to close and show next
        const closeHandler = () => {
            popup.style.display = 'none';
            popup.removeEventListener('click', closeHandler);
            popup._closeHandler = null;
            // Show next popup if any
            this.showNextCollectionPopup();
        };
        
        popup._closeHandler = closeHandler;
        
        setTimeout(() => {
            popup.addEventListener('click', closeHandler);
        }, 100);
    }

addComparisonIndicators(newItemHTML, newItem, equippedItem) {
    // Helper function to create indicator HTML with right-aligned percentages
    const getIndicator = (newValue, oldValue, hasNewRoll = false, hasOldRoll = true, percentText = '') => {
        let arrow = '';
        
        // If new item has a roll and old doesn't, it's always better
        if (hasNewRoll && !hasOldRoll) {
            arrow = '↑';
        }
        // If old item has a roll and new doesn't, it's worse
        else if (!hasNewRoll && hasOldRoll) {
            arrow = '↓';
        }
        // Normal comparison
        else if (newValue > oldValue) {
            arrow = '↑';
        } else if (newValue < oldValue) {
            arrow = '↓';
        } else {
            arrow = '=';
        }
        
        // Create a fixed-width container for the indicator
        let color = '';
        if (arrow === '↑') color = '#00ff88';
        else if (arrow === '↓') color = '#ff4444';
        else color = 'inherit';
        
        // Return just the arrow in a colored span - we'll handle alignment differently
        return `<span style="color: ${color};">${arrow}</span>`;
    };
    
    // Same function for header stats (no spacing needed)
    const getIndicatorSimple = (newValue, oldValue) => {
        if (newValue > oldValue) {
            return '<span style="color: #00ff88; margin-right: 5px;">↑</span>';
        } else if (newValue < oldValue) {
            return '<span style="color: #ff4444; margin-right: 5px;">↓</span>';
        } else {
            return '<span style="color: inherit; margin-right: 5px;">=</span>';
        }
    };
    
    // Compare basic stats
    const newLevel = newItem.level;
    const oldLevel = equippedItem.level;
    const newScore = newItem.getItemScore();
    const oldScore = equippedItem.getItemScore();
    const newQuality = newItem.getQualityPercent();
    const oldQuality = equippedItem.getQualityPercent();
    
    // Replace Level line
    newItemHTML = newItemHTML.replace(
        /<div class="itemLevelText">Level (\d+)<\/div>/,
        `<div class="itemLevelText">${getIndicatorSimple(newLevel, oldLevel)}Level $1</div>`
    );
    
    // Replace Score line
    newItemHTML = newItemHTML.replace(
        /<div class="itemScoreText">Score: (\d+)<\/div>/,
        `<div class="itemScoreText">${getIndicatorSimple(newScore, oldScore)}Score: $1</div>`
    );
    
    // Replace Quality line
    newItemHTML = newItemHTML.replace(
        /<div class="itemQualityText">Quality: (\d+)%<\/div>/,
        `<div class="itemQualityText">${getIndicatorSimple(newQuality, oldQuality)}Quality: $1%</div>`
    );
    
    // Track which percentages we've already processed
    const processedPercentages = new Set();
    
    // Compare individual stat qualities
    for (let i = 1; i <= 4; i++) {
        const newStatQuality = newItem[`quality${i}`];
        const oldStatQuality = equippedItem[`quality${i}`];
        const newStatRoll = newItem[`roll${i}`];
        
        if (newStatQuality > 0) {
            const newPercent = Math.round((newStatQuality / 5) * 100);
            const percentText = newPercent + '%';
            
            // Skip if we've already processed this percentage value
            if (processedPercentages.has(newPercent)) {
                continue;
            }
            processedPercentages.add(newPercent);
            
            // Check if this specific roll exists on the old item
            let hasMatchingRoll = false;
            let oldPercent = 0;
            
            if (oldStatQuality > 0) {
                // Direct comparison if same slot has a roll
                hasMatchingRoll = true;
                oldPercent = Math.round((oldStatQuality / 5) * 100);
            }
            
            // Create the indicator
const indicator = getIndicator(newPercent, oldPercent, true, hasMatchingRoll, percentText);

// Find and replace ALL occurrences of this percentage
const oldSpan = `<span style="color: #6a9aaa;">${newPercent}%</span>`;
// Create a container with fixed positioning for arrow and percentage
const newSpan = `<span style="color: #6a9aaa; display: inline-flex; width: 60px; align-items: center;">` +
    `<span style="display: inline-block; width: 15px; text-align: center;">${indicator}</span>` +
    `<span style="flex: 1; text-align: right;">${newPercent}%</span>` +
    `</span>`;

// Replace all occurrences
newItemHTML = newItemHTML.split(oldSpan).join(newSpan);
        }
    }
    
    return newItemHTML;
}
    
    // Tooltip Functions
    showItemTooltip(event, item, isStashItem = false) {
        // Check if alt key is held
        const showMax = event.altKey;
        
        // Check if we should show comparison (only in hero gear tab hovering stash items)
        let showComparison = false;
        let equippedItem = null;
        if (isStashItem && this.game.currentScreen === 'heroesScreen' && this.currentTab === 'gear' && this.selectedHero !== undefined) {
            const hero = this.game.heroes[this.selectedHero];
            equippedItem = hero.gear[item.slot];
            showComparison = equippedItem !== null;
        }
        
        // Create or get tooltip element
        let tooltip = document.getElementById('itemTooltipDiv');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'itemTooltipDiv';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #2a6a8a;
                padding: 16px;
                border-radius: 4px;
                z-index: 10000;
                pointer-events: none;
                max-height: 600px;
                overflow-y: auto;
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
        }
        
        // Store item reference for alt key updates
        tooltip._currentItem = item;
        tooltip._isComparison = showComparison;
        tooltip._equippedItem = equippedItem;
        
        // Build tooltip HTML
        let tooltipHTML = '';
        
        if (showComparison) {
    // Comparison layout
    tooltipHTML = '<div style="display: flex; gap: 20px;">';
    
    // Hovered item (left) - with comparison indicators
    tooltipHTML += '<div style="flex: 1;">';
    tooltipHTML += '<div style="text-align: center; color: #6a9aaa; margin-bottom: 10px; font-size: 14px;">New Item</div>';
    
    // Get the new item tooltip and add comparison indicators
    let newItemTooltip = item.getTooltip(showMax);
    newItemTooltip = this.addComparisonIndicators(newItemTooltip, item, equippedItem);
    tooltipHTML += newItemTooltip;
    
    tooltipHTML += '</div>';
    
    // Separator
    tooltipHTML += '<div style="width: 1px; background: #2a6a8a; margin: 0 10px;"></div>';
    
    // Equipped item (right)
    tooltipHTML += '<div style="flex: 1;">';
    tooltipHTML += '<div style="text-align: center; color: #6a9aaa; margin-bottom: 10px; font-size: 14px;">Currently Equipped</div>';
    tooltipHTML += equippedItem.getTooltip(showMax);
    tooltipHTML += '</div>';
    
    tooltipHTML += '</div>';
} else {
            // Single item tooltip
            tooltipHTML = item.getTooltip(showMax);
        }
        
        // Add colored border based on rarity
        const rarity = item.getRarity();
        switch(rarity) {
            case 'red':
                tooltip.style.borderColor = '#ff4444';
                tooltip.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.5)';
                break;
            case 'purple':
                tooltip.style.borderColor = '#d896ff';
                tooltip.style.boxShadow = '0 0 20px rgba(216, 150, 255, 0.3)';
                break;
            case 'blue':
                tooltip.style.borderColor = '#4dd0e1';
                tooltip.style.boxShadow = '0 0 20px rgba(77, 208, 225, 0.3)';
                break;
            case 'green':
                tooltip.style.borderColor = '#00ff88';
                tooltip.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.3)';
                break;
            case 'gold':
                tooltip.style.borderColor = '#ffd700';
                tooltip.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
                break;
            default:
                tooltip.style.borderColor = '#2a6a8a';
                tooltip.style.boxShadow = '';
        }
        
        tooltip.innerHTML = tooltipHTML;
        tooltip.style.display = 'block';
        
        // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.right + 10, rect.top);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipGameCoords = window.scalingSystem.viewportToGame(tooltipRect.left, tooltipRect.top);
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (tooltipGameCoords.x + tooltipWidth > 1920) {
    const leftCoords = window.scalingSystem.viewportToGame(rect.left - 10, rect.top);
    tooltip.style.left = (leftCoords.x - tooltipWidth) + 'px';
}
if (tooltipGameCoords.y + tooltipHeight > 1080) {
    tooltip.style.top = (1080 - tooltipHeight - 10) + 'px';
}
    }

    hideItemTooltip() {
        const tooltip = document.getElementById('itemTooltipDiv');
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip._currentItem = null;
        }
    }

    showAbilityTooltip(event, name, level, cooldown, description) {
        // This old method is still called by battle.js showPlayerAbilities
        // We'll convert it to use the new format
        const ability = {
            name: name,
            description: description,
            cooldown: cooldown,
            effects: []
        };
        
        const html = this.formatAbilityTooltip(ability, level);
        this.showAbilityTooltipFromHTML(event, html);
    }
    
    showAbilityTooltipFromHTML(event, html) {
        // Create or get tooltip element
        let tooltip = document.getElementById('abilityTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'abilityTooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #2a6a8a;
                padding: 16px;
                border-radius: 4px;
                z-index: 1002;
                min-width: 440px;
                max-width: 600px;
                box-shadow: 0 0 20px rgba(0,0,0,0.8);
                pointer-events: none;
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
        }
        
        tooltip.innerHTML = html;
        
        // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.left, rect.bottom + 5);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';
tooltip.style.display = 'block';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (gameCoords.x + tooltipWidth > 1920) {
    tooltip.style.left = (1920 - tooltipWidth - 10) + 'px';
}
if (gameCoords.y + tooltipHeight > 1080) {
    const topCoords = window.scalingSystem.viewportToGame(rect.left, rect.top - 5);
    tooltip.style.top = (topCoords.y - tooltipHeight) + 'px';
}
    }

    hideAbilityTooltip() {
        const tooltip = document.getElementById('abilityTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    showStatTooltip(event, statName, hero = null) {
        // Check if this is the hero's main stat
        const isMainStat = hero && hero.mainstat && 
            ((statName === 'Strength' && hero.mainstat === 'str') ||
             (statName === 'Agility' && hero.mainstat === 'agi') ||
             (statName === 'Intelligence' && hero.mainstat === 'int'));
        
        // Define tooltip content with stat name as first line
        const mainStatText = isMainStat ? ' <span style="color: #ffd700;">(Main Stat)</span>' : '';
        
        const tooltipData = {
            "Strength": `<b>Strength${mainStatText}</b><br>Increases Max HP, HP Regeneration, and Armor.<br>Boosts Strength-based abilities.`,
            "Agility": `<b>Agility${mainStatText}</b><br>Increases Attack Speed and slightly boosts Armor.<br>Boosts Agility-based abilities.`,
            "Intelligence": `<b>Intelligence${mainStatText}</b><br>Increases Resistance (magic defense).<br>Boosts Intelligence-based abilities.`,

            "Health Points": "<b>Health Points</b><br>Your health pool. Increased by Strength.",
            "HP Regeneration": "<b>HP Regeneration</b><br>Your health regeneration. Increased by Strength.",
            "Attack": "<b>Attack</b><br>Your total offensive power.<br>Increases with your mainstat.",
            "Attack Speed": "<b>Attack Speed</b><br>Increases how fast you attack. Scales with Agility.",

            "Armor": `<b>Armor</b><br>Reduces incoming physical damage.<br><br>
    Physical Damage Reduction: Percentage of physical damage blocked.`,

            "Resistance": `<b>Resistance</b><br>Reduces magical damage taken.<br><br>
    Magical Damage Reduction: Percentage of magical damage blocked.`
        };

        // Create or get stat tooltip element
        let tooltip = document.getElementById('statTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'statTooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #2a6a8a;
                padding: 10px;
                border-radius: 4px;
                z-index: 1002;
                box-shadow: 0 0 20px rgba(0,0,0,0.8);
                pointer-events: none;
                font-size: 14px;
                color: #b0e0f0;
                max-width: 500px;
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
        }

        // Update border color if it's a main stat
        if (isMainStat) {
            tooltip.style.borderColor = '#ffd700';
            tooltip.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
        } else {
            tooltip.style.borderColor = '#2a6a8a';
            tooltip.style.boxShadow = '0 0 20px rgba(0,0,0,0.8)';
        }

        // Set tooltip content
        tooltip.innerHTML = tooltipData[statName] || "No tooltip available.";
        tooltip.style.display = 'block';

        // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.left, rect.bottom + 5);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (gameCoords.x + tooltipWidth > 1920) {
    tooltip.style.left = (1920 - tooltipWidth - 10) + 'px';
}
if (gameCoords.y + tooltipHeight > 1080) {
    const topCoords = window.scalingSystem.viewportToGame(rect.left, rect.top - 5);
    tooltip.style.top = (topCoords.y - tooltipHeight) + 'px';
}
    }

    hideStatTooltip() {
        const tooltip = document.getElementById('statTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    showGoldTooltip(event, amount, isDefeat = false) {
        // Create or get gold tooltip element
        let tooltip = document.getElementById('goldTooltipDiv');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'goldTooltipDiv';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #ffd700;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
        }
        
        const sign = isDefeat ? '-' : '+';
        tooltip.innerHTML = `<div style="font-size: 20px; color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);">${sign}${amount} Gold</div>`;
        tooltip.style.display = 'block';
        
        // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.right + 10, rect.top);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipGameCoords = window.scalingSystem.viewportToGame(tooltipRect.left, tooltipRect.top);
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (tooltipGameCoords.x + tooltipWidth > 1920) {
    const leftCoords = window.scalingSystem.viewportToGame(rect.left - 10, rect.top);
    tooltip.style.left = (leftCoords.x - tooltipWidth) + 'px';
}
if (tooltipGameCoords.y + tooltipHeight > 1080) {
    tooltip.style.top = (1080 - tooltipHeight - 10) + 'px';
}
    }

    hideGoldTooltip() {
        const tooltip = document.getElementById('goldTooltipDiv');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    showArenaStatTooltip(event, text) {
    // Create or get arena stat tooltip element
    let tooltip = document.getElementById('arenaStatTooltipDiv');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'arenaStatTooltipDiv';
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(10, 15, 26, 0.95);
            border: 2px solid #4dd0e1;
            padding: 8px 12px;
            border-radius: 4px;
            z-index: 10000;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(77, 208, 225, 0.3);
            font-size: 14px;
            color: #b0e0f0;
            white-space: nowrap;
        `;
        const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
    }
    
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    
    // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.left, rect.bottom + 5);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (gameCoords.x + tooltipWidth > 1920) {
    tooltip.style.left = (1920 - tooltipWidth - 10) + 'px';
}
if (gameCoords.y + tooltipHeight > 1080) {
    const topCoords = window.scalingSystem.viewportToGame(rect.left, rect.top - 5);
    tooltip.style.top = (topCoords.y - tooltipHeight) + 'px';
}
}

hideArenaStatTooltip() {
    const tooltip = document.getElementById('arenaStatTooltipDiv');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

    showCollectionTooltip(event, itemId, qualityLevel, collectionData) {
        // Create item with exact number of rolls for display
        const displayItem = new Item(itemId);
        
        // Clear all qualities first
        displayItem.quality1 = 0;
        displayItem.quality2 = 0;
        displayItem.quality3 = 0;
        displayItem.quality4 = 0;
        
        // Set only the exact number of rolls to perfect
        for (let i = 1; i <= qualityLevel; i++) {
            displayItem[`quality${i}`] = 5;
        }

        // Get base tooltip
        let tooltipHTML = displayItem.getTooltip(false);
        
        // Add collection info
        const timestamp = new Date(collectionData.timestamp).toLocaleString();
        tooltipHTML = tooltipHTML.replace('</div>', 
            `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #2a6a8a; color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);">
                Obtained by ${collectionData.heroName}, the ${collectionData.heroClass}<br>
                ${timestamp}
            </div></div>`);
        
        // Show tooltip
        let tooltip = document.getElementById('itemTooltipDiv');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'itemTooltipDiv';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #2a6a8a;
                padding: 16px;
                border-radius: 4px;
                z-index: 10000;
                pointer-events: none;
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(tooltip);
} else {
    // Fallback
    document.body.appendChild(tooltip);
}
        }
        
        tooltip.innerHTML = tooltipHTML;
        tooltip.style.display = 'block';

        // Add colored border based on rarity
        const rarity = displayItem.getRarity();
        switch(rarity) {
            case 'red':
                tooltip.style.borderColor = '#ff4444';
                tooltip.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.5)';
                break;
            case 'purple':
                tooltip.style.borderColor = '#d896ff';
                tooltip.style.boxShadow = '0 0 20px rgba(216, 150, 255, 0.3)';
                break;
            case 'blue':
                tooltip.style.borderColor = '#4dd0e1';
                tooltip.style.boxShadow = '0 0 20px rgba(77, 208, 225, 0.3)';
                break;
            case 'green':
                tooltip.style.borderColor = '#00ff88';
                tooltip.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.3)';
                break;
            case 'gold':
                tooltip.style.borderColor = '#ffd700';
                tooltip.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
                break;
            default:
                tooltip.style.borderColor = '#2a6a8a';
                tooltip.style.boxShadow = '';
        }
        
        // Position tooltip using scaling system
const rect = event.target.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.right + 10, rect.top);
tooltip.style.left = gameCoords.x + 'px';
tooltip.style.top = gameCoords.y + 'px';

// Adjust if tooltip goes off game area
const tooltipRect = tooltip.getBoundingClientRect();
const tooltipGameCoords = window.scalingSystem.viewportToGame(tooltipRect.left, tooltipRect.top);
const tooltipWidth = tooltipRect.width;
const tooltipHeight = tooltipRect.height;

if (tooltipGameCoords.x + tooltipWidth > 1920) {
    const leftCoords = window.scalingSystem.viewportToGame(rect.left - 10, rect.top);
    tooltip.style.left = (leftCoords.x - tooltipWidth) + 'px';
}
if (tooltipGameCoords.y + tooltipHeight > 1080) {
    tooltip.style.top = (1080 - tooltipHeight - 10) + 'px';
}
    }

    // Sort Settings Functions
    toggleSortSettings(source) {
        const panel = document.getElementById('sortSettingsPanel');
        const button = document.querySelector(`#${source}SortButton`);
        
        if (panel && panel.style.display === 'block') {
            panel.style.display = 'none';
            button.classList.remove('active');
        } else {
            this.showSortSettings(source);
            button.classList.add('active');
        }
    }

    showSortSettings(source) {
        // Close any existing panel
        const existingPanel = document.getElementById('sortSettingsPanel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // Remove active class from all buttons
        document.querySelectorAll('.sortSettingsButton').forEach(btn => btn.classList.remove('active'));
        
        // Create new panel
        const panel = document.createElement('div');
        panel.id = 'sortSettingsPanel';
        panel.className = 'sortSettingsPanel';
        
        // Build sort criteria list
        const criteriaHTML = this.game.sortSettings.order.map((criteria, index) => {
            const labels = {
                itemScore: 'Item Score',
                rarity: 'Rarity',
                stars: 'Stars',
                quality: 'Quality %',
                level: 'Level',
                name: 'Name'
            };
            const direction = this.game.sortSettings.direction[criteria];
            const arrow = direction === 'desc' ? '↓' : '↑';
                
            return `
                <li class="sortCriteriaItem" draggable="true" data-criteria="${criteria}" data-index="${index}">
                    <span class="dragHandle">≡</span>
                    <span class="sortCriteriaLabel">${labels[criteria]}</span>
                    <button class="sortDirectionToggle" onclick="game.toggleSortDirection('${criteria}', '${source}')">${arrow}</button>
                </li>
            `;
        }).join('');
        
        panel.innerHTML = `
            <h4>Sort Order</h4>
            <ul class="sortCriteriaList">
                ${criteriaHTML}
            </ul>
            <button class="resetSortButton" onclick="game.resetSortSettings('${source}')">Reset to Default</button>
        `;
        
        // Position panel below the button using scaling system
const button = document.querySelector(`#${source}SortButton`);
const rect = button.getBoundingClientRect();
const gameCoords = window.scalingSystem.viewportToGame(rect.left, rect.bottom + 5);
panel.style.position = 'absolute';
panel.style.top = gameCoords.y + 'px';
panel.style.left = gameCoords.x + 'px';
        
        const scaleWrapper = document.getElementById('scaleWrapper');
if (scaleWrapper) {
    scaleWrapper.appendChild(panel);
} else {
    // Fallback
    document.body.appendChild(panel);
}
        
        // Add drag and drop event listeners
        this.setupSortDragDrop(source);
        
        // Close panel when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!panel.contains(e.target) && e.target.id !== `${source}SortButton`) {
                    panel.style.display = 'none';
                    button.classList.remove('active');
                }
            }, { once: true });
        }, 10);
    }

    setupSortDragDrop(source) {
        const items = document.querySelectorAll('.sortCriteriaItem');
        let draggedItem = null;
        
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                if (item !== draggedItem) {
                    item.classList.add('dragover');
                }
            });
            
            item.addEventListener('dragleave', () => {
                item.classList.remove('dragover');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('dragover');
                
                if (item !== draggedItem) {
                    const allItems = [...items];
                    const draggedIndex = allItems.indexOf(draggedItem);
                    const targetIndex = allItems.indexOf(item);
                    
                    // Update sort order
                    const newOrder = [...this.game.sortSettings.order];
                    const [removed] = newOrder.splice(draggedIndex, 1);
                    newOrder.splice(targetIndex, 0, removed);
                    this.game.sortSettings.order = newOrder;
                    
                    // Save and refresh
                    this.game.saveSortSettings();
                    this.showSortSettings(source);
                    
                    // Refresh the current view
                    if (source === 'gear') {
                        this.showGearTab(this.game.heroes[this.selectedHero], document.getElementById('heroContent'));
                    } else if (source === 'stash') {
                        this.showIndividualStash(this.game.currentStashFamily);
                    }
                }
            });
        });
    }

    // Navigation Methods (moved from game.js)
    navigateWave(direction) {
    if (this.game.arenaMode === 'spar') {
        // Navigate arena teams
        if (!this.game.arenaTeams || this.game.arenaTeams.length === 0) return;
        
        const currentTeam = this.game.currentArenaTeam;
        let newTeam = currentTeam;
        
        if (direction === 'prev') {
            newTeam = currentTeam - 1;
            if (newTeam < 0) {
                // Find the highest unlocked team to wrap around to
                let highestUnlocked = 0;
                for (let i = this.game.arenaTeams.length - 1; i >= 0; i--) {
                    if (this.game.isArenaTeamAccessible(i)) {
                        highestUnlocked = i;
                        break;
                    }
                }
                newTeam = highestUnlocked;
            }
        } else {
            newTeam = currentTeam + 1;
            if (newTeam >= this.game.arenaTeams.length) {
                newTeam = this.game.arenaTeams.length - 1;
            }
            
            // Check if new team is accessible
            if (!this.game.isArenaTeamAccessible(newTeam)) {
                return; // Don't navigate to locked team
            }
        }
        
        if (newTeam !== currentTeam) {
            this.game.currentArenaTeam = newTeam;
            
            // Generate new opponents
            const currentTeamData = this.game.arenaTeams[this.game.currentArenaTeam];
            this.game.arenaOpponents = this.game.arena.generateArenaTeamOpponents(currentTeamData);
            
            // Update display
            this.updateArenaEnemyFormation();
            this.updateArenaRecordsDisplay();
        }
    } else {
        // Normal dungeon wave navigation
        if (!this.game.dungeonWaves || this.game.dungeonWaves.length === 0) return;
        
        if (direction === 'prev') {
            this.currentPreviewWave--;
            if (this.currentPreviewWave < 0) {
                this.currentPreviewWave = this.game.dungeonWaves.length - 1;
            }
        } else {
            this.currentPreviewWave++;
            if (this.currentPreviewWave >= this.game.dungeonWaves.length) {
                this.currentPreviewWave = 0;
            }
        }
        
        this.updateEnemyFormation();
    }
}

// Ability Tooltip Formatting
formatAbilityTooltip(ability, level, unit = null, showFormula = false) {
    const spell = spellManager ? spellManager.getSpell(ability.id) : null;
    if (!spell) return `<h3>${ability.name} (Level ${level})</h3><p>${ability.description}</p>`;
    
    // Get the description
    let description = spell.description;
    const levelIndex = Math.max(0, Math.min(4, level - 1)); // Clamp between 0-4
    
    if (typeof description === 'string') {
        if (showFormula) {
            // When showing formula, replace individual placeholders with values
            description = description.replace(/{(\w+(?:\.\w+)*)}/g, (match, property) => {
                // Get the value for this property
                let value = null;
                
                // Handle nested properties like scaling.base
                if (property.includes('.')) {
                    const parts = property.split('.');
                    let temp = spell;
                    for (const part of parts) {
                        temp = temp?.[part];
                    }
                    if (Array.isArray(temp)) {
                        value = temp[levelIndex] || temp[0];
                    } else {
                        value = temp;
                    }
                } else if (spell[property] && Array.isArray(spell[property])) {
                    value = spell[property][levelIndex] || spell[property][0];
                } else if (spell.scaling && spell.scaling[property] && Array.isArray(spell.scaling[property])) {
                    value = spell.scaling[property][levelIndex] || spell.scaling[property][0];
                }
                
                // Format the value
                if (value !== null && value !== undefined) {
                    // Format percentages
                    if (typeof value === 'number') {
                        // Properties that are percentages (0-1 range)
                        const percentageProperties = [
                            'actionBarGrant', 'actionBarGain', 'actionBarDrain', 'actionBarSteal', 'actionBarRefill',
                            'actionBarPerDebuff', 'actionBarChance', 'actionBarThreshold', 'actionBarPerBuff',
                            'bleedChance', 'stunChance', 'silenceChance', 'markChance', 'defenseChance', 
                            'procChance', 'extraAttackChance', 'critChance', 'dodgeChance', 'retributionChance',
                            'armorPierce', 'damageReduction', 'hpThreshold', 'executeThreshold',
                            'hpCost', 'shieldPercent', 'healPercent', 'spilloverPercent',
                            'hpPercentDamage', 'missingHpPercent', 'knockbackPercent',
                            'speedBonus', 'attackBonus', 'magicalDamageBonus',
                            'dodgePure', 'dodgeMagical', 'dodgePhysical',
                            'blightChance', 'slowChance', 'reflectPercent',
                            'maxPercent', 'finalActionBarPercent', 'debuffChance'
                        ];
                        
                        // Properties that are multipliers (show as percentages but stored as 1.5 for 150%)
                        const multiplierProperties = [
                            'damageBonus', 'damageMultiplier', 'bleedBonus', 'markBonus',
                            'reducedDefenseBonus', 'silencedMultiplier', 'maxBonus', 'debuffBonus'
                        ];
                        
                        // Check if this property should be shown as a percentage
                        if (percentageProperties.includes(property) || property.includes('Percent') || property.includes('Chance')) {
                            if (value > 0 && value <= 1) {
                                value = Math.round(value * 100) + '%';
                            }
                        } else if (multiplierProperties.includes(property) || property.includes('Bonus') || property.includes('Multiplier')) {
                            // For multipliers, show as percentage (1.5 = 150%)
                            value = Math.round(value * 100) + '%';
                        }
                    } else if (typeof value === 'number' && (property === 'attack' || property === 'str' || 
                                       property === 'agi' || property === 'int')) {
                        // For scaling values, add 'x' suffix
                        value = value + 'x';
                    }
                    
                    // Special case for base - don't show the property name
                    if (property === 'base') {
                        return value.toString();
                    }
                    
                    return `${value} (${property})`;
                }
                
                return match;
            });
            
            // Remove square brackets when showing formula
            description = description.replace(/\[|\]/g, '');
        } else {
            // When not showing formula, calculate totals for bracketed sections
            description = description.replace(/\[([^\]]+)\]/g, (match, bracketContent) => {
                // Calculate the total value for everything in brackets
                if (unit && spell.scaling) {
                    const damage = this.calculateSpellValue(spell, unit, 'damage');
                    return damage.toString();
                }
                return match;
            });
            
            // Handle individual placeholders outside of brackets
            description = description.replace(/{(\w+(?:\.\w+)*)}/g, (match, property) => {
                // Special handling for specific properties that aren't part of damage calculation
                if (property === 'shieldAmount' && unit) {
                    const shield = this.calculateSpellValue(spell, unit, 'shield');
                    return shield;
                }
                
                // For duration, cooldown, chances, etc.
                let value = null;
                
                if (property.includes('.')) {
                    const parts = property.split('.');
                    let temp = spell;
                    for (const part of parts) {
                        temp = temp?.[part];
                    }
                    if (Array.isArray(temp)) {
                        value = temp[levelIndex] || temp[0];
                    } else {
                        value = temp;
                    }
                } else if (spell[property] && Array.isArray(spell[property])) {
                    value = spell[property][levelIndex] || spell[property][0];
                } else if (spell.scaling && spell.scaling[property] && Array.isArray(spell.scaling[property])) {
                    value = spell.scaling[property][levelIndex] || spell.scaling[property][0];
                }
                
                if (value !== null && value !== undefined) {
                    // Format percentages
                    if (typeof value === 'number') {
                        // Properties that are percentages (0-1 range)
                        const percentageProperties = [
                            'actionBarGrant', 'actionBarGain', 'actionBarDrain', 'actionBarSteal', 'actionBarRefill',
                            'actionBarPerDebuff', 'actionBarChance', 'actionBarThreshold', 'actionBarPerBuff',
                            'bleedChance', 'stunChance', 'silenceChance', 'markChance', 'defenseChance', 
                            'procChance', 'extraAttackChance', 'critChance', 'dodgeChance', 'retributionChance',
                            'armorPierce', 'damageReduction', 'hpThreshold', 'executeThreshold',
                            'hpCost', 'shieldPercent', 'healPercent', 'spilloverPercent',
                            'hpPercentDamage', 'missingHpPercent', 'knockbackPercent',
                            'speedBonus', 'attackBonus', 'magicalDamageBonus',
                            'dodgePure', 'dodgeMagical', 'dodgePhysical',
                            'blightChance', 'slowChance', 'reflectPercent',
                            'maxPercent', 'finalActionBarPercent', 'debuffChance'
                        ];
                        
                        // Properties that are multipliers (show as percentages but stored as 1.5 for 150%)
                        const multiplierProperties = [
                            'damageBonus', 'damageMultiplier', 'bleedBonus', 'markBonus',
                            'reducedDefenseBonus', 'silencedMultiplier', 'maxBonus', 'debuffBonus'
                        ];
                        
                        // Check if this property should be shown as a percentage
                        if (percentageProperties.includes(property) || property.includes('Percent') || property.includes('Chance')) {
                            if (value > 0 && value <= 1) {
                                return Math.round(value * 100) + '%';
                            }
                        } else if (multiplierProperties.includes(property) || property.includes('Bonus') || property.includes('Multiplier')) {
                            // For multipliers, show as percentage (1.5 = 150%)
                            return Math.round(value * 100) + '%';
                        }
                    }
                    return value;
                }
                
                return match;
            });
        }
    }
    
    // Build effect tags in specific order
    let effectTags = '';
    const effects = spell.effects || [];
    
    // Define the order of effects and their display names
    const effectOrder = [
        // Core effects
        { key: 'passive', display: 'Passive' },
        { key: 'aoe', display: 'AOE' },
        
        // Damage types
        { key: 'physical', display: 'Physical' },
        { key: 'magical', display: 'Magical' },
        { key: 'pure', display: 'Pure' },
        
        // Special effects
        { key: 'heal', display: 'Heal' },
        { key: 'evasion', display: 'Evasion' },
        { key: 'cleanse', display: 'Cleanse' },
        { key: 'dispel', display: 'Dispel' },
        { key: 'shield_break', display: 'Shield Break' },
        { key: 'support', display: 'Support' },

        // Buffs
        { key: 'buff_boss', display: 'Boss' },
        { key: 'buff_increase_attack', display: 'Increase Attack' },
        { key: 'buff_increase_speed', display: 'Increase Speed' },
        { key: 'buff_increase_defense', display: 'Increase Defense' },
        { key: 'buff_immune', display: 'Immune' },
        { key: 'buff_shield', display: 'Shield' },
        { key: 'buff_frost_armor', display: 'Frost Armor' },
        
        // Debuffs
        { key: 'debuff_reduce_attack', display: 'Reduce Attack' },
        { key: 'debuff_reduce_speed', display: 'Reduce Speed' },
        { key: 'debuff_reduce_defense', display: 'Reduce Defense' },
        { key: 'debuff_blight', display: 'Blight' },
        { key: 'debuff_bleed', display: 'Bleed' },
        { key: 'debuff_stun', display: 'Stun' },
        { key: 'debuff_taunt', display: 'Taunt' },
        { key: 'debuff_silence', display: 'Silence' },
        { key: 'debuff_mark', display: 'Mark' },
    ];

    // Add effect tags in the specified order
    effectOrder.forEach(effect => {
        if (effects.includes(effect.key)) {
            effectTags += `<span class="abilityEffectTag ${effect.key}">${effect.display}</span>`;
        }
    });
    
    // Format cooldown with level scaling
    let cooldownText = 'Cooldown: ';
    if (ability.passive || effects.includes('passive')) {
        cooldownText += 'Passive';
    } else {
        let cooldownValue = 0;
        if (Array.isArray(spell.cooldown)) {
            cooldownValue = spell.cooldown[levelIndex] || spell.cooldown[0];
        } else {
            cooldownValue = ability.cooldown || 0;
        }
        
        if (cooldownValue === 0) {
            cooldownText += 'none';
        } else {
            cooldownText += `${cooldownValue} turns`;
        }
    }
    
    // Add formula indicator if showing formula
    const formulaIndicator = showFormula ? ' <span style="color: #ffd700;">[Formula]</span>' : '';
    
    return `
        <div style="font-size: 60px; color: #4dd0e1; margin-bottom: 20px;">${ability.name} (Level ${level})${formulaIndicator}</div>
        <div style="margin-bottom: 20px;">${effectTags}</div>
        <div style="font-size: 40px; color: #6a9aaa; margin-bottom: 20px;">${cooldownText}</div>
        <div style="font-size: 40px; color: #b0e0f0;">${description}</div>
        ${!showFormula && unit ? '<div style="font-size: 30px; color: #6a9aaa; margin-top: 30px;">Hold Alt to see damage formula</div>' : ''}
    `;
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

    // Dev Console Toggle (moved from game.js)
    toggleDevConsole() {
        if (window.devConsole) {
            window.devConsole.toggle();
        }
    }

    // Refinement Popup Close (moved from game.js)
    closeRefinementPopup() {
        // Hide overlay
        document.getElementById('refinementOverlay').style.display = 'none';
        
        const popup = document.getElementById('itemRefinementPopup');
        popup.style.display = 'none';
        
        // Update UI based on current screen
if (this.game.refinementContext) {
    if (this.game.currentScreen === 'heroesScreen') {
        // If the item was equipped, refresh the current tab to show updated stats
        if (this.game.refinementContext.isEquipped) {
            // Refresh whatever tab is currently active
            this.showHeroTab(this.currentTab);
        } else {
            // Just refresh gear tab to show updated gold
            this.showGearTab(this.game.heroes[this.selectedHero], document.getElementById('heroContent'));
        }
    } else if (this.game.currentScreen === 'individualStashScreen') {
        // Refresh stash to show updated gold
        this.showIndividualStash(this.game.refinementContext.family);
    }
}
        
        // Clean up context
        this.game.refinementContext = null;
        
        // Reset popup to initial state for next use
        document.getElementById('refinementColumns').style.display = 'flex';
        document.getElementById('refinementResult').style.display = 'none';
        document.getElementById('refinementButtons').style.display = 'flex';
        document.getElementById('refinementCloseButton').style.display = 'none';
        document.getElementById('refinementArrow').style.display = 'block';
        document.getElementById('previewColumn').style.display = 'block';
        document.getElementById('refinementResultLabel').textContent = 'Current Item';
    }


// Context Menu Functions
closeItemContextMenu() {
    const menu = document.getElementById('itemContextMenu');
    if (menu) {
        menu.remove();
    }
    this.game.contextMenuItem = null;
}

// Dungeon Selection Functions  
closeDungeonSelect() {
    this.closeHeroInfo(); // Close any open popups
    this.game.selectedTier = null;
    this.showMainMenu();
}

// Promotion Modal Functions
showPromotionConfirm(newClass) {
    const hero = this.game.heroes[this.selectedHero];
    const modal = document.getElementById('confirmModal');
    const confirmText = document.getElementById('confirmText');
    const confirmCost = document.getElementById('confirmCost');
    
    this.game.pendingPromotion = newClass;
    
    if (newClass === 'Awaken') {
        confirmText.textContent = `Awaken ${hero.name} the ${hero.displayClassName}?`;
        confirmCost.innerHTML = `💰 -10000000`;
    } else {
        const promoClass = unitData?.classes[newClass];
        const displayName = promoClass ? promoClass.name : newClass;
        confirmText.textContent = `Promote ${hero.name} the ${hero.displayClassName} to ${displayName}?`;
        const cost = 1000 * Math.pow(10, hero.classTier);
        confirmCost.innerHTML = `💰 -${cost}`;
    }
    
    modal.style.display = 'flex';
}

cancelPromotion() {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    this.game.pendingPromotion = null;
}
    
    

}
