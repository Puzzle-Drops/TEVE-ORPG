// Battle System for TEVE

class Battle {
constructor(game, party, enemyWaves, mode = 'dungeon') {
    this.game = game;
    this.mode = mode;
    this.turn = 0;
        this.currentUnit = null;
        this.waitingForPlayer = false;
        this.autoMode = false;
        this.pendingAutoMode = null;
        this.battleLog = [];
        this.gameSpeed = 1;
        this.running = true;
        this.processingWaveTransition = false;
        this.targetingState = null;
        this.battlePaused = false; // Pause for animations
        this.enableBossScaling = false;

        // Clear any existing timer interval from previous battles
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Clean up any lingering UI state from previous battles
        for (let i = 1; i <= 5; i++) {
            const partyElement = document.getElementById(`party${i}`);
            if (partyElement) {
                partyElement.style.display = 'none';
                partyElement.innerHTML = '';
            }
            const enemyElement = document.getElementById(`enemy${i}`);
            if (enemyElement) {
                enemyElement.style.display = 'none';
                enemyElement.innerHTML = '';
            }
        }
        
        // Add timer tracking
        this.startTime = Date.now();
        this.endTime = null;
        
        // Wave management
        this.enemyWaves = enemyWaves;
        this.currentWave = 0;
        this.waveExpCalculated = false; // Track if exp was calculated for current wave
        
        console.log('Battle created with enemyWaves:', enemyWaves ? enemyWaves.length : 0);
        
        // Store the original wave data for exp calculation
        this.dungeonWaves = enemyWaves;
        
        // Track exp earned per wave for each hero
        this.waveExpEarned = [];

    // Initialize tracking for ALL battles (not just arena)
this.battleStats = {};

    // Track party deaths for arena
this.partyDeaths = 0;
        
        // Create battle units for party and ensure they're properly initialized
        this.party = party.map((hero, index) => {
            if (!hero) return null;
            const unit = new BattleUnit(hero, false, index);
            // Ensure party members start alive
            unit.currentHp = unit.maxHp;
            unit.isDead = false;
            unit.deathAnimated = false;
            unit.uiInitialized = false; // Force UI creation
            unit.battle = this; // Add reference to battle for stun visual updates
            return unit;
        }).filter(u => u);
        
        // Initialize with first wave of enemies
        this.enemies = [];
        this.loadWave(0);
        
        this.allUnits = [...this.party, ...this.enemies];
        
        // Apply initial passives
        this.applyInitialPassives();

        // Initialize battle stats
        this.initializeBattleStats();

        // Initialize UI elements for all units
        this.initializeAllUI();
        
        // Force initial UI update to ensure party is visible
        this.party.forEach(unit => {
            const elementId = `party${unit.position + 1}`;
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'block';
                element.style.opacity = '1';
                element.style.visibility = 'visible';
            }
        });

        this.ai = new BattleAI(this);
        this.animations = new BattleAnimations(this);
        
    }
    
    loadWave(waveIndex) {
        if (waveIndex >= this.enemyWaves.length) {
            return false;
        }
        
        this.currentWave = waveIndex;
        this.waveExpCalculated = false; // Reset exp calculation flag for new wave
        const wave = this.enemyWaves[waveIndex];

        // Clean up previous wave's enemy UI completely
        this.cleanupEnemyUI();
        
        // Clear enemies array
        this.enemies = [];
        
        // Create battle units for this wave
        wave.forEach((enemy, index) => {
            if (enemy) {
                const newUnit = new BattleUnit(enemy, true, index);
                // Ensure HP is set properly
                newUnit.currentHp = newUnit.maxHp;
                newUnit.isDead = false;
                newUnit.deathAnimated = false; // Reset death animation flag
                newUnit.uiInitialized = false;
                newUnit.battle = this; // Add reference to battle for stun visual updates
                this.enemies.push(newUnit);
            }
        });
        
        // Update all units list
        this.allUnits = [...this.party, ...this.enemies];
        
        // Reset action bars for enemies
        this.enemies.forEach(enemy => {
            enemy.actionBar = 0;
        });
        
        this.log(`Wave ${waveIndex + 1} begins!`);
        this.log(`Enemies: ${this.enemies.map(u => u.name).join(', ')}`);
        
        // Update wave counter
        this.updateWaveCounter();
        
        // Initialize UI for new enemies
        this.initializeEnemyUI();

        // Force complete UI update
        this.updateUI();

        // Apply boss buff to boss enemies
this.enemies.forEach(enemy => {
    if (enemy.source.isBoss) {
        this.applyBuff(enemy, 'Boss', -1, {
            damageReduction: 0.25,
            stunResistance: 0.5
        });
        this.log(`${enemy.name} is a boss gaining stun resistance and damage reduction!`);
    }
});

// Apply passive abilities to newly spawned enemies
this.applyInitialPassives(this.enemies);
        
        // Apply boss scaling for specific waves if animations is available
        if (this.animations) {
            this.animations.applyBossScaling(this.enemies, this.currentWave);
            
            // Add special log messages for scaled bosses
            if (this.enemies.length > 0 && this.enemies[0] && this.enemies[0].source.isBoss) {
                if (this.currentWave === 2) {
                    this.log(`${this.enemies[0].name} appears larger than usual!`);
                } else if (this.currentWave === 4) {
                    this.log(`${this.enemies[0].name} looms over the battlefield!`);
                }
            }
        }

        // Initialize battle stats for new wave enemies
this.enemies.forEach(enemy => {
    if (!this.battleStats[enemy.name]) {
        this.battleStats[enemy.name] = {
            kills: 0,
            deaths: 0,
            turnsTaken: 0,
            damageDealt: 0,
            damageTaken: 0,
            healingDone: 0,
            shieldingApplied: 0,
            buffsApplied: 0,
            debuffsApplied: 0,
            buffsDispelled: 0,
            debuffsCleansed: 0
        };
    }
});
        
        return true;
    }

    cleanupEnemyUI() {
        // Completely clean up all enemy UI elements
        for (let i = 1; i <= 5; i++) {
            const element = document.getElementById(`enemy${i}`);
            if (element) {
                // Clear all content
                element.innerHTML = '';
                
                // Hide the slot
                element.style.display = 'none';
                element.style.border = '';
                element.style.boxShadow = '';
                element.style.cursor = '';
                element.style.filter = '';
                element.style.opacity = '';
                element.style.visibility = '';
            }
        }
        
        // Remove boss scaling classes if animations is available
        if (this.animations) {
            this.animations.removeBossScaling();
        }
    }

    initializeAllUI() {
        // Initialize party UI - ensure all party slots are properly shown
        this.party.forEach((unit, index) => {
            // First ensure the slot is visible
            const elementId = `party${unit.position + 1}`;
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'block';
                element.style.opacity = '1';
                element.style.visibility = 'visible';
            }
            
            // Force recreate the UI
            unit.uiInitialized = false;
            this.createUnitUI(unit);
            unit.uiInitialized = true;
        });
        
        // Hide unused party slots
        for (let i = this.party.length + 1; i <= 5; i++) {
            const element = document.getElementById(`party${i}`);
            if (element) {
                element.style.display = 'none';
            }
        }
        
        // Initialize enemy UI
        this.initializeEnemyUI();
        
        // Force an initial UI update to ensure health bars are correct
        setTimeout(() => this.updateUI(), 0);
    }

    initializeEnemyUI() {
        // Initialize UI for current wave enemies
        this.enemies.forEach(unit => {
            if (!unit.uiInitialized) {
                this.createUnitUI(unit);
                unit.uiInitialized = true;
            }
        });
        
        // Show/hide enemy slots based on enemy count
        for (let i = 1; i <= 5; i++) {
            const element = document.getElementById(`enemy${i}`);
            if (element) {
                if (i <= this.enemies.length) {
                    element.style.display = 'block';
                } else {
                    element.style.display = 'none';
                }
            }
        }
    }

    createUnitUI(unit) {
        const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
        const element = document.getElementById(elementId);
        
        if (!element) return;
        
        // Make sure element is visible
        element.style.display = 'block';
        element.style.opacity = '1';
        element.style.visibility = 'visible';
        
        // Clear any previous content to ensure fresh UI
        element.innerHTML = '';
        
        // Create animation container for unit, shadow, and active circle
        const animContainer = document.createElement('div');
        animContainer.className = 'unitAnimationContainer';
        element.appendChild(animContainer);
        
        // Create unit div inside animation container
        const unitDiv = document.createElement('div');
        unitDiv.className = 'unit';
        unitDiv.style.display = 'block';
        unitDiv.style.opacity = '1';
        animContainer.appendChild(unitDiv);
        
        // Set unit sprite/content
if (unit.isEnemy) {
    const enemyId = unit.source.enemyId;
    unitDiv.innerHTML = `
        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/enemies/${enemyId}.png" alt="${unit.name}" 
             style="image-rendering: pixelated; object-fit: contain;"
             draggable="false"
             onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'font-size: 9px; text-align: center; line-height: 1.2;\\'><div>${unit.name}</div><div style=\\'color: #6a9aaa;\\'>Lv${unit.source.level}</div></div>'">
    `;
} else {
    const hero = unit.source;
    unitDiv.innerHTML = `
        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${hero.className}_battle.png" alt="${hero.displayClassName}" 
             style="image-rendering: pixelated; object-fit: contain;"
             draggable="false"
             onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'font-size: 9px; text-align: center; line-height: 1.2;\\'><div>${hero.name}</div><div style=\\'color: #6a9aaa;\\'>Lv${hero.level}</div></div>'">
    `;
}
        
        // Create shadow inside animation container
        const shadow = document.createElement('div');
        shadow.className = 'unitShadow';
        animContainer.appendChild(shadow);
        
        // Create active turn circle inside animation container
        const activeCircle = document.createElement('div');
        activeCircle.className = 'unitActiveCircle';
        activeCircle.style.display = 'none'; // Hidden by default
        animContainer.appendChild(activeCircle);
        
        // Create health bar container (static)
        const healthBarContainer = document.createElement('div');
        healthBarContainer.className = 'healthBarContainer';
        element.appendChild(healthBarContainer);
        
        // Create health bar elements
        const healthBar = document.createElement('div');
        healthBar.className = 'healthBar';
        healthBarContainer.appendChild(healthBar);
        
        // Create health fill
        const healthFill = document.createElement('div');
        healthFill.className = 'healthFill';
        healthFill.style.width = '100%';
        healthBar.appendChild(healthFill);
        
        // Create shield fill
        const shieldFill = document.createElement('div');
        shieldFill.className = 'shieldFill';
        shieldFill.style.width = '0%';
        shieldFill.style.display = 'none';
        healthBar.appendChild(shieldFill);
        
        // Create health text
        const healthText = document.createElement('div');
        healthText.className = 'healthText';
        healthText.textContent = unit.currentHp;
        healthBar.appendChild(healthText);
        
        // Create action bar (static)
        const actionBar = document.createElement('div');
        actionBar.className = 'actionBar';
        
        const actionFill = document.createElement('div');
        actionFill.className = 'actionFill';
        actionFill.style.width = '0%';
        
        actionBar.appendChild(actionFill);
        element.appendChild(actionBar);
        
        // Create level indicator (static)
        const levelIndicator = document.createElement('div');
        levelIndicator.className = 'levelIndicator';
        element.appendChild(levelIndicator);
        
        // Add click handler for unit info
        levelIndicator.style.cursor = 'pointer';
        const clickHandler = (e) => {
            e.stopPropagation();
            this.game.uiManager.closeHeroInfo();
            if (unit.isEnemy) {
                this.game.uiManager.showEnemyInfoPopup(unit.source);
            } else {
                this.game.uiManager.showHeroInfoPopup(unit.source);
            }
        };
        levelIndicator._unitInfoHandler = clickHandler;
        levelIndicator.addEventListener('click', clickHandler);
        levelIndicator.addEventListener('selectstart', (e) => e.preventDefault());
        
        // Update level indicator content
        const starData = unit.isEnemy ? unit.source.getStars() : unit.source.getStars();
        let html = '<div class="levelNumber">' + unit.source.level + '</div>';
        if (starData.html) {
            html += '<div class="levelStars ' + starData.colorClass + '">' + starData.html + '</div>';
        }
        levelIndicator.innerHTML = html;
        
        // Add right-click handler for the entire unit slot
        const rightClickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.game.uiManager.closeHeroInfo();
            if (unit.isEnemy) {
                this.game.uiManager.showEnemyInfoPopup(unit.source);
            } else {
                this.game.uiManager.showHeroInfoPopup(unit.source);
            }
        };
        element._rightClickHandler = rightClickHandler;
        element.addEventListener('contextmenu', rightClickHandler);
        
        // Create buff/debuff container (static)
        const buffDebuffContainer = document.createElement('div');
        buffDebuffContainer.className = 'buffDebuffContainer';
        element.appendChild(buffDebuffContainer);
        
        // Initialize last buff/debuff state tracking
        unit._lastBuffDebuffState = '';
        
        // Apply stun visuals if unit is already stunned
        if (unit.debuffs.some(d => d.name === 'Stun' || d.stunned)) {
            this.animations.updateStunVisuals(unit);
        }
    }

applyInitialPassives(units = null) {
    // Apply passive abilities to specified units (or all units if not specified)
    const unitsToProcess = units || this.allUnits;
    unitsToProcess.forEach(unit => {
        // Apply Champion Female passive shield
        if (unit.championFemalePassive || unit.shieldRegenAmount) {
            const shieldAmount = Math.floor(unit.maxHp * 0.2);
            this.applyBuff(unit, 'Shield', -1, { shieldAmount: shieldAmount });
            unit.shieldRegenTimer = 0;
            unit.shieldRegenTurns = 4;
            unit.shieldRegenAmount = shieldAmount;
        }
        
        unit.abilities.forEach((ability, index) => {
            if (ability.passive) {
                // Get spell data
                const spell = spellManager.getSpell(ability.id);
                
                if (spell && spell.logicKey && spellLogic[spell.logicKey]) {
                    try {
                        const spellLevel = ability.level || unit.spellLevel || 1;
                        // Pass all required parameters including spell and spellLevel
                        spellLogic[spell.logicKey](this, unit, unit, spell, spellLevel);
                    } catch (error) {
                        console.error(`Error applying passive ${ability.name}:`, error);
                    }
                }
            }
        });
        
// Apply Lord's Presence passive effects
if (unit.lordsPresencePassive) {
    const allies = this.getParty(unit);
    allies.forEach(ally => {
        if (ally.isAlive) {
            this.applyBuff(ally, 'Increase Attack', unit.lordsPresenceBuffDuration || 1, { damageMultiplier: 1.5 });
            ally.stunImmunity = true;
        }
    });
    this.log(`${unit.name}'s presence empowers all allies!`);
}

// Ancient Shell passive - Frost Armor at battle start
if (unit.ancientShellPassive || unit.ancientShellFrostArmorDuration) {
    const duration = unit.ancientShellFrostArmorDuration || 3;
    this.applyBuff(unit, 'Frost Armor', duration, {});
    this.log(`${unit.name}'s ancient shell provides protection!`);
}


        
    });
}

processShieldRegeneration(unit, shieldPercent, regenTurns, passiveName) {
        // Initialize timer if not exists
        if (unit.shieldRegenTimer === undefined) {
            unit.shieldRegenTimer = 0;
        }
        
        unit.shieldRegenTimer++;
        
        if (unit.shieldRegenTimer >= regenTurns) {
            unit.shieldRegenTimer = 0;
            const shieldAmount = Math.floor(unit.maxHp * shieldPercent);
            const existingShield = unit.buffs.find(b => b.name === 'Shield');
            
            if (!existingShield) {
                this.applyBuff(unit, 'Shield', -1, { shieldAmount: shieldAmount });
                this.log(`${unit.name}'s ${passiveName} generates a shield!`);
            }
        }
    }
    
    processHealingOverTime(unit, durationProp, regenProp, effectName) {
        if (unit[regenProp] && unit.isAlive && unit[durationProp] > 0) {
            unit[durationProp]--;
            
            if (!unit.debuffs.some(d => d.name === 'Blight')) {
                const regenAmount = Math.floor(unit.maxHp * unit[regenProp]);
                const actualRegen = Math.min(regenAmount, unit.maxHp - unit.currentHp);
                
                if (actualRegen > 0) {
                    unit.currentHp += actualRegen;
                    this.log(`${unit.name} regenerates ${actualRegen} HP from ${effectName}.`);
                }
            }
            
            if (unit[durationProp] <= 0) {
                unit[regenProp] = null;
                unit[durationProp] = null;
            }
        }
    }

initializeBattleStats() {
    // For each unit in this.allUnits:
    this.allUnits.forEach(unit => {
        this.battleStats[unit.name] = {
            kills: 0,
            deaths: 0,
            turnsTaken: 0,
            damageDealt: 0,
            damageTaken: 0,
            healingDone: 0,
            shieldingApplied: 0,
            buffsApplied: 0,
            debuffsApplied: 0,
            buffsDispelled: 0,
            debuffsCleansed: 0
        };
    });
}

trackBattleStat(unitName, stat, value) {
    if (this.battleStats && this.battleStats[unitName]) {
        this.battleStats[unitName][stat] += value;
    } else {
        console.warn(`Battle stat tracking failed for ${unitName} - ${stat}`);
    }
}
    
    start() {
    this.log("Battle started!");
    this.log(`Your party: ${this.party.map(u => u.name).join(', ')}`);
    
    // Animate entire battlefield pan down
const battleField = document.querySelector('.battleField');
if (battleField) {
    // Set to top position first (without transition)
    battleField.style.transition = 'none';
    battleField.style.top = '86px';  // 8% of 1080 = 86.4px
    
    // Force reflow to ensure the position is set before transition
    battleField.offsetHeight;
    
    // Re-enable transition and animate to final position
    setTimeout(() => {
        battleField.style.transition = 'top 3s cubic-bezier(0.4, 0, 0.2, 1)';
        battleField.style.top = '0px';
    }, 100);
}
    
    // Ensure all party members start alive and visible
    this.party.forEach(unit => {
            if (unit) {
                unit.currentHp = unit.maxHp;
                unit.isDead = false;
                unit.deathAnimated = false;
                unit.actionBar = 0;
                
                // Force UI refresh for party member
                const elementId = `party${unit.position + 1}`;
                const element = document.getElementById(elementId);
                if (element) {
                    element.style.display = 'block';
                    element.style.opacity = '1';
                    element.style.visibility = 'visible';
                    
                    // Ensure all UI elements are visible
                    const healthBar = element.querySelector('.healthBar');
                    const actionBar = element.querySelector('.actionBar');
                    const levelIndicator = element.querySelector('.levelIndicator');
                    const buffDebuffContainer = element.querySelector('.buffDebuffContainer');
                    const animContainer = element.querySelector('.unitAnimationContainer');
                    const unitDiv = animContainer ? animContainer.querySelector('.unit') : null;
                    const unitActiveCircle = animContainer ? animContainer.querySelector('.unitActiveCircle') : null;
                    
                    if (healthBar) healthBar.style.display = '';
                    if (actionBar) actionBar.style.display = '';
                    if (levelIndicator) levelIndicator.style.display = '';
                    if (buffDebuffContainer) buffDebuffContainer.style.display = '';
                    if (unitActiveCircle) unitActiveCircle.style.display = 'none'; // Ensure it's hidden
                    if (unitDiv) {
                        unitDiv.style.opacity = '1';
                        unitDiv.style.display = 'block';
                        unitDiv.classList.remove('dying');
                    }
                }
            }
        });
        
        // Reset start time for this battle
        this.startTime = Date.now();
        
        // Clear any existing timer interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Create UI elements
        this.createBattleUI();
        
        // Initial UI update
        this.updateUI();
        
        // Start the battle loop with a small delay
        setTimeout(() => this.battleLoop(), 500);
        
        // Start timer update
        this.startTimerUpdate();
    }

    createBattleUI() {
        // Create wave counter (with timer)
        this.createWaveCounter();
        
        // Create dungeon name display
        this.createDungeonNameDisplay();
        
        // Create automatic mode display
        if (this.game.autoReplay) {
            this.createAutomaticModeDisplay();
        }
    }

createDungeonNameDisplay() {
        // Remove any existing dungeon name
        const existingName = document.getElementById('dungeonNameDisplay');
        if (existingName) {
            existingName.remove();
        }
        
        // Create new dungeon name display
        const nameDisplay = document.createElement('div');
        nameDisplay.id = 'dungeonNameDisplay';
        nameDisplay.className = 'dungeonNameDisplay';
        
        if (this.mode === 'arena') {
            // Show arena team name
            const currentTeam = this.game.arenaTeams && this.game.arenaTeams[this.game.currentArenaTeam];
            nameDisplay.textContent = currentTeam ? currentTeam.name : 'Arena Battle';
        } else {
            // Show dungeon name
            nameDisplay.textContent = this.game.currentDungeon ? this.game.currentDungeon.name : '';
        }
        
        const battleScene = document.getElementById('battleScene');
        if (battleScene) {
            battleScene.appendChild(nameDisplay);
        }
    }

    createAutomaticModeDisplay() {
        // Remove any existing automatic mode display
        const existingDisplay = document.getElementById('automaticModeDisplay');
        if (existingDisplay) {
            existingDisplay.remove();
        }
        
        // Create new automatic mode display
        const autoDisplay = document.createElement('div');
        autoDisplay.id = 'automaticModeDisplay';
        autoDisplay.className = 'automaticModeDisplay';
        
        // Initialize automatic mode tracking if not exists
        if (!this.game.automaticModeStartTime) {
            this.game.automaticModeStartTime = Date.now();
            this.game.automaticModeCompletions = 0;
        }
        
        autoDisplay.innerHTML = `
            <div class="autoModeTitle">Automatic Mode</div>
            <div class="autoModeTime">00:00</div>
            <div class="autoModeCompletions">Completions: ${this.game.automaticModeCompletions}</div>
        `;
        
        const battleScene = document.getElementById('battleScene');
        if (battleScene) {
            battleScene.appendChild(autoDisplay);
        }
    }

    startTimerUpdate() {
        // Clear any existing interval first
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Update timer every second
        this.timerInterval = setInterval(() => {
            this.updateTimer();
            this.updateAutomaticModeDisplay();
        }, 1000);
    }

    updateTimer() {
        const waveCounter = document.getElementById('waveCounter');
        if (waveCounter && this.startTime) {
            const timerElement = waveCounter.querySelector('.battleTimerText');
            if (timerElement) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }

    updateAutomaticModeDisplay() {
        const autoDisplay = document.getElementById('automaticModeDisplay');
        if (autoDisplay && this.game.automaticModeStartTime) {
            const elapsed = Math.floor((Date.now() - this.game.automaticModeStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeElement = autoDisplay.querySelector('.autoModeTime');
            if (timeElement) {
                timeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }

    createWaveCounter() {
        // Remove any existing wave counter
        const existingCounter = document.getElementById('waveCounter');
        if (existingCounter) {
            existingCounter.remove();
        }
        
        // Create new wave counter with timer
        const waveCounter = document.createElement('div');
        waveCounter.id = 'waveCounter';
        waveCounter.className = 'waveCounter';
        waveCounter.innerHTML = `
            <div class="waveText">Wave: ${this.currentWave + 1}/${this.enemyWaves.length}</div>
            <div class="battleTimerText">00:00</div>        
        `;
        
        const battleScene = document.getElementById('battleScene');
        if (battleScene) {
            battleScene.appendChild(waveCounter);
        }
    }
    
    updateWaveCounter() {
        const waveCounter = document.getElementById('waveCounter');
        if (waveCounter) {
            const waveText = waveCounter.querySelector('.waveText');
            if (waveText) {
                waveText.textContent = `Wave: ${this.currentWave + 1}/${this.enemyWaves.length}`;
            }
        }
    }
    
    battleLoop() {
        if (!this.running) return;
        
        // Check for battle end first
        if (this.checkBattleEnd()) return;
        
        // If processing wave transition, wait
        if (this.processingWaveTransition) {
            setTimeout(() => this.battleLoop(), 100);
            return;
        }

        // If battle is paused for animations, wait
        if (this.battlePaused) {
            setTimeout(() => this.battleLoop(), 100);
            return;
        }

        // If waiting for player, don't progress
        if (this.waitingForPlayer) {
            setTimeout(() => this.battleLoop(), 100);
            return;
        }
        
        // Check for pending auto mode changes at cycle start
        if (this.pendingAutoMode !== null) {
            this.autoMode = this.pendingAutoMode;
            this.pendingAutoMode = null;
        }
        
        // Progress action bars for all living units
        let highestActionBar = 0;
        this.allUnits.forEach(unit => {
            if (unit.isAlive) {
                let speed = unit.actionBarSpeed;
                
                // Apply speed buffs (hardcoded +33%)
                unit.buffs.forEach(buff => {
                    if (buff.name === 'Increase Speed') {
                        speed *= 1.33;
                    }
                });

                // Apply speed debuffs (hardcoded -33%)
                unit.debuffs.forEach(debuff => {
                    if (debuff.name === 'Reduce Speed') {
                        speed *= 0.67;
                    }
                });
                
                unit.actionBar += speed;
                if (unit.actionBar > highestActionBar) {
                    highestActionBar = unit.actionBar;
                }
            }
        });
        
        // Update UI to show action bar progress
        this.updateUI();
        
        // Check if anyone can act
        const readyUnits = this.allUnits.filter(u => u.isAlive && u.actionBar >= 10000);
        
        if (readyUnits.length > 0) {
            // Sort by action bar value (highest first)
            readyUnits.sort((a, b) => b.actionBar - a.actionBar);
            this.currentUnit = readyUnits[0];
            
            // Subtract action bar
            this.currentUnit.actionBar -= 10000;
            
            // Log who's taking a turn
            this.log(`${this.currentUnit.name}'s turn! (Action: ${Math.floor(this.currentUnit.actionBar)})`);
            
            // Process turn
            this.processTurn();
        } else {
            // Continue the loop
            setTimeout(() => this.battleLoop(), 50);
        }
    }
    
processTurn() {
    const unit = this.currentUnit;
    
    // Debug log all possible actions if debugging is enabled
    this.ai.debugLogAllPossibleActions(unit);

    // Burning Fury passive - check for bleed on any unit
    if (unit.burningFuryPassive && unit.isAlive) {
        const anyUnitHasBleed = this.allUnits.some(u => 
            u.isAlive && buffDebuffHelpers.hasDebuff(u, 'Bleed')
        );
        
        if (anyUnitHasBleed && !buffDebuffHelpers.hasBuff(unit, 'Increase Attack')) {
            this.applyBuff(unit, 'Increase Attack', unit.burningFuryDuration || 1, { damageMultiplier: 1.5 });
            this.log(`${unit.name}'s burning fury ignites!`);
        }
    }

    // Eternal Tide passive - every turn, lowest HP ally gains shield and removes debuff
    if (unit.eternalTidePassive && unit.isAlive) {
        const allies = this.getParty(unit);
        const aliveAllies = allies.filter(a => a && a.isAlive);
        
        if (aliveAllies.length > 0) {
            // Find lowest HP ally
            aliveAllies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
            const lowestHpAlly = aliveAllies[0];
            
            // Apply shield
            const shieldAmount = Math.floor(lowestHpAlly.maxHp * (unit.eternalTideShieldPercent || 0.2));
            this.applyBuff(lowestHpAlly, 'Shield', -1, { shieldAmount: shieldAmount });
            
            // Remove one debuff
            if (lowestHpAlly.debuffs && lowestHpAlly.debuffs.length > 0) {
                lowestHpAlly.debuffs.shift();
                this.log(`Eternal tide protects and cleanses ${lowestHpAlly.name}!`);
            } else {
                this.log(`Eternal tide protects ${lowestHpAlly.name}!`);
            }
        }
    }

    // Tribal Leader passive - apply buffs to all allies at turn start
    if (unit.tribalLeaderPassive && unit.auraBuffs && unit.isAlive) {
        const allies = this.getParty(unit);
        allies.forEach(ally => {
            if (ally.isAlive && ally !== unit) {
                unit.auraBuffs.forEach(buffName => {
                    // Check if ally already has the buff
                    const hasBuff = ally.buffs.some(b => b.name === buffName);
                    if (!hasBuff) {
                        this.applyBuff(ally, buffName, unit.auraDuration || 1, {});
                    }
                });
            }
        });
    }

    // Sovereign's Presence passive - apply Immune and Increase Speed to all allies at turn start
    if (unit.sovereignsPresencePassive && unit.isAlive) {
        const allies = this.getParty(unit);
        allies.forEach(ally => {
            if (ally.isAlive) {
                // Apply Immune buff
                this.applyBuff(ally, 'Immune', unit.sovereignBuffDuration || 1, { immunity: true });
                // Apply Increase Speed buff
                this.applyBuff(ally, 'Increase Speed', unit.sovereignBuffDuration || 1, {});
            }
        });
        this.log(`${unit.name}'s sovereign presence protects and hastens all allies!`);
    }

    // Mirror of Truth passive - copy enemy buffs at turn start
if (unit.mirrorOfTruthPassive && unit.isAlive) {
    // Check if unit can act (not stunned, silenced, or taunted)
    const canAct = !unit.debuffs.some(d => 
        d.name === 'Stun' || d.stunned || 
        d.name === 'Silence' || 
        d.name === 'Taunt'
    );
    
    if (canAct) {
        // Collect all unique buff names from enemies
        const enemyBuffNames = new Set();
        const enemies = battle.getEnemies(unit);
        enemies.forEach(enemy => {
            if (enemy.isAlive) {
                buffDebuffHelpers.getBuffs(enemy).forEach(buff => {
                    if (buff.name !== 'Boss') {
                        enemyBuffNames.add(buff.name);
                    }
                });
            }
        });
        
        // Apply missing buffs to self
        enemyBuffNames.forEach(buffName => {
            if (!buffDebuffHelpers.hasBuff(unit, buffName)) {
                // Apply buff with duration 1 (until next turn)
                if (buffName === 'Shield') {
                    battle.applyBuff(unit, buffName, -1, { shieldAmount: 50 });
                } else if (buffName === 'Increase Attack') {
                    battle.applyBuff(unit, buffName, 1, { damageMultiplier: 1.5 });
                } else {
                    battle.applyBuff(unit, buffName, 1, {});
                }
            }
        });
        
        if (enemyBuffNames.size > 0) {
            battle.log(`${unit.name}'s mirror reflects enemy power!`);
        }
    }
}
    
    // Check for Twilight's End
    if (unit.twilightsEndPending) {
        // Check if stunned, taunted, silenced, or dead
        const canCast = !unit.isDead && !unit.debuffs.some(d => 
            d.name === 'Stun' || d.stunned || 
            d.name === 'Taunt' || 
            d.name === 'Silence'
        );
        
        if (canCast) {
            // Execute Twilight's End
            unit.twilightsEndPending = false;
            this.log(`${unit.name} unleashes Twilight's End!`);
            
            // Find the twilights_promise ability to get its level
            const twilightAbility = unit.abilities.find(a => a.id === 'twilights_promise');
            const spellLevel = twilightAbility ? twilightAbility.level : 1;
            
            // Add validation for spell manager
            if (spellManager && spellManager.getSpell) {
                const spell = spellManager.getSpell('twilights_promise');
                if (spell) {
                    // Execute the logic
                    spellLogic.twilightsEndLogic(this, unit, 'all', spell, spellLevel);
                } else {
                    console.error('Twilight\'s Promise spell not found in spell manager');
                    this.log(`${unit.name}'s Twilight's End fizzles!`);
                }
            } else {
                console.error('Spell manager not available');
                this.log(`${unit.name}'s Twilight's End fizzles!`);
            }
            
            // Continue with rest of turn
        } else {
            // Cannot cast, remove pending status
            unit.twilightsEndPending = false;
            this.log(`${unit.name}'s Twilight's End was interrupted!`);
        }
    }
    
    // Show active circle for current unit
    if (unit) {
        const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
        const element = document.getElementById(elementId);
        if (element) {
            const animContainer = element.querySelector('.unitAnimationContainer');
            if (animContainer) {
                const activeCircle = animContainer.querySelector('.unitActiveCircle');
                if (activeCircle) {
                    activeCircle.style.display = 'block';
                }
            }
        }
    }
    
    // Check if unit is stunned
    if (unit.debuffs.some(d => d.name === 'Stun' || d.stunned)) {
        this.log(`${unit.name} is stunned!`);
        // End turn immediately - no actions allowed
        this.endTurn();
        return;
    }

    // Check if unit is silenced
    const silenceDebuff = unit.debuffs.find(d => d.name === 'Silence');
    if (silenceDebuff) {
        this.log(`${unit.name} is silenced and must use basic attack!`);
        // Force skill 1 on random enemy
        const enemies = unit.isEnemy ? this.party.filter(p => p && p.isAlive) : this.enemies.filter(e => e && e.isAlive);
        if (enemies.length > 0) {
            const randomTarget = enemies[Math.floor(Math.random() * enemies.length)];
            // Find first non-passive ability (skill 1)
            let skill1Index = -1;
            for (let i = 0; i < unit.abilities.length; i++) {
                if (unit.abilities[i] && !unit.abilities[i].passive) {
                    skill1Index = i;
                    break;
                }
            }
            if (skill1Index >= 0) {
                this.executeAbility(unit, skill1Index, randomTarget);
            }
        }
        this.endTurn();
        return;
    }
    
    // Check if unit is taunted
    const tauntDebuff = unit.debuffs.find(d => d.name === 'Taunt' && d.tauntTarget);
    const isTaunted = tauntDebuff && tauntDebuff.tauntTarget && tauntDebuff.tauntTarget.isAlive;

    // Track turn taken - unit made it past stun, silence, and taunt checks
    this.trackBattleStat(unit.name, 'turnsTaken', 1);
    
    // Check if it's a player unit and not in auto mode and not taunted
    if (!unit.isEnemy && !this.autoMode && !isTaunted) {
        this.waitingForPlayer = true;
        this.showPlayerAbilities(unit);
    } else {
        // AI turn (or taunted player unit)
        if (isTaunted && !unit.isEnemy && !this.autoMode) {
            this.log(`${unit.name} is taunted and must attack ${tauntDebuff.tauntTarget.name}!`);
        }
        this.ai.executeAITurn(unit);
    }
}

executeAbility(caster, abilityIndex, target) {
    const ability = caster.abilities[abilityIndex];
    if (!ability || !caster.useAbility(abilityIndex)) return;
    
    const spell = spellManager.getSpell(ability.id);
    if (!spell) return;

    caster.lastAbilityUsed = ability.id;
    
    // Check for Grand Templar Male passive stun chance
    if (caster.grandTemplarMalePassive && caster.globalStunChance && target && target !== 'all' && target.isAlive) {
        if (Math.random() < caster.globalStunChance) {
            this.applyDebuff(target, 'Stun', 1, { stunned: true });
            this.log(`${caster.name}'s mastery stuns ${target.name}!`);
        }
    }
    
    // Show spell animation
    this.animations.showSpellAnimation(caster, ability.name, spell.effects, ability.id);
    
    // Execute spell logic
    if (spellLogic[spell.logicKey]) {
        try {
            const spellLevel = ability.level || caster.spellLevel || 1;
            
            // Check for Fire Dance AoE effect
            if (caster.nextAttackIsAoE && (spell.effects.includes('physical') || spell.effects.includes('magical'))) {
                caster.nextAttackIsAoE = false;
                this.log(`${caster.name}'s fire dance spreads the attack to all enemies!`);
                
                // Execute the ability on all enemies
                const enemies = this.getEnemies(caster);
                enemies.forEach(enemy => {
                    if (enemy.isAlive) {
                        spellLogic[spell.logicKey](this, caster, enemy, spell, spellLevel);
                    }
                });
            } else {
                // Normal execution
                spellLogic[spell.logicKey](this, caster, target, spell, spellLevel);
            }
            
            // Check for Whirling Step double attack
            if (caster.nextAttackHitsTwice && spell.effects.includes('physical')) {
                caster.nextAttackHitsTwice = false;
                this.log(`${caster.name}'s whirling momentum grants a second strike!`);
                // Execute the same ability again
                spellLogic[spell.logicKey](this, caster, target, spell, spellLevel);
            }
        } catch (error) {
            console.error(`Error executing ${ability.name}:`, error);
            this.log(`${caster.name} failed to use ${ability.name}!`);
        }
    }
    
    // Alpha's Call passive - check if any ally has Increase Speed after attacking
    if (caster.alphasCallPassive && !ability.passive && (spell.effects.includes('physical') || spell.effects.includes('magical'))) {
        const allies = this.getParty(caster);
        const hasSpeedBuffAlly = allies.some(ally => 
            ally.isAlive && ally.buffs && ally.buffs.some(b => b.name === 'Increase Speed')
        );
        
        if (hasSpeedBuffAlly) {
            this.applyBuff(caster, 'Increase Attack', caster.alphasCallBuffDuration || 2, { damageMultiplier: 1.5 });
            this.log(`${caster.name}'s alpha leadership inspires greater strength!`);
        }
    }
    
    // Blade Mastery passive - chance for extra attack
    if (caster.bladeMasteryPassive && !ability.passive && spell.effects.includes('physical')) {
        if (Math.random() < (caster.bladeMasteryExtraAttackChance || 0.3)) {
            this.log(`${caster.name}'s blade mastery grants an extra strike!`);
            // Execute the same ability again on the same target if they're still alive
            if (target && target !== 'all' && target.isAlive) {
                // Use spell logic directly to avoid cooldown/ability use
                try {
                    const spellLevel = ability.level || caster.spellLevel || 1;
                    spellLogic[spell.logicKey](this, caster, target, spell, spellLevel);
                } catch (error) {
                    console.error(`Error executing blade mastery extra attack:`, error);
                }
            }
        }
    }
}
    
    endTurn() {
        if (this.currentUnit) {
            // Hydra's Command passive - random ally attacks
            if (this.currentUnit.hydrasCommandPassive && this.currentUnit.isAlive) {
                const allies = this.getParty(this.currentUnit);
                const aliveAllies = allies.filter(a => a && a.isAlive && a !== this.currentUnit);
                
                if (aliveAllies.length > 0) {
                    const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                    
                    // Find first non-passive ability
                    let firstAbilityIndex = -1;
                    for (let i = 0; i < randomAlly.abilities.length; i++) {
                        if (randomAlly.abilities[i] && !randomAlly.abilities[i].passive) {
                            firstAbilityIndex = i;
                            break;
                        }
                    }
                    
                    if (firstAbilityIndex >= 0) {
                        // Get random enemy target
                        const enemies = this.getEnemies(randomAlly);
                        const aliveEnemies = enemies.filter(e => e && e.isAlive);
                        
                        if (aliveEnemies.length > 0) {
                            const randomTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                            this.log(`Hydra commands ${randomAlly.name} to attack!`);
                            this.executeAbility(randomAlly, firstAbilityIndex, randomTarget);
                        }
                    }
                }
            }

            // Hide active circle for current unit
            const elementId = this.currentUnit.isEnemy ? `enemy${this.currentUnit.position + 1}` : `party${this.currentUnit.position + 1}`;
            const element = document.getElementById(elementId);
            if (element) {
                const animContainer = element.querySelector('.unitAnimationContainer');
                if (animContainer) {
                    const activeCircle = animContainer.querySelector('.unitActiveCircle');
                    if (activeCircle) {
                        activeCircle.style.display = 'none';
                    }
                }
            }
            
            // Champion Female passive shield regeneration
            if (this.currentUnit.shieldRegenTimer !== undefined && this.currentUnit.shieldRegenAmount) {
                const shieldPercent = this.currentUnit.shieldRegenAmount / this.currentUnit.maxHp;
                this.processShieldRegeneration(
                    this.currentUnit, 
                    shieldPercent, 
                    this.currentUnit.shieldRegenTurns, 
                    'shield regenerates'
                );
            }

            // Reinforced Plating passive shield regeneration
            if (this.currentUnit.reinforcedPlatingPassive && this.currentUnit.shieldRegenPercent) {
                this.processShieldRegeneration(
                    this.currentUnit,
                    this.currentUnit.shieldRegenPercent,
                    this.currentUnit.shieldRegenTurns,
                    'reinforced plating'
                );
            }

            // Ancestral Vigor healing effect
            if (this.currentUnit.ancestralVigorRegen && this.currentUnit.ancestralVigorDuration) {
                this.processHealingOverTime(
                    this.currentUnit,
                    'ancestralVigorDuration',
                    'ancestralVigorRegen',
                    'Ancestral Vigor'
                );
            }

            // Tribal Chant healing effect
            if (this.currentUnit.tribalChantRegen && this.currentUnit.tribalChantDuration) {
                this.processHealingOverTime(
                    this.currentUnit,
                    'tribalChantDuration',
                    'tribalChantRegen',
                    'Tribal Chant'
                );
            }
            
            // Apply HP regen after turn
            if (this.currentUnit.isAlive && !this.currentUnit.debuffs.some(d => d.name === 'Blight')) {
                const regen = Math.floor(this.currentUnit.isEnemy ? 
                    this.currentUnit.stats.str * 0.05 : 
                    this.currentUnit.source.hpRegen);
                if (regen > 0) {
                    const actualRegen = Math.min(regen, this.currentUnit.maxHp - this.currentUnit.currentHp);
                    if (actualRegen > 0) {
                        this.currentUnit.currentHp += actualRegen;
                        this.log(`${this.currentUnit.name} regenerates ${actualRegen} HP.`);
                    }
                }
            }

            // Regenerative Roots passive healing
if (this.currentUnit.regenerativeRootsPassive && this.currentUnit.isAlive) {
    const hpPercent = this.currentUnit.currentHp / this.currentUnit.maxHp;
    if (hpPercent < this.currentUnit.regenHpThreshold && !this.currentUnit.debuffs.some(d => d.name === 'Blight')) {
        const healAmount = Math.floor(this.currentUnit.maxHp * this.currentUnit.regenHealPercent);
        const actualHeal = Math.min(healAmount, this.currentUnit.maxHp - this.currentUnit.currentHp);
        if (actualHeal > 0) {
            this.currentUnit.currentHp += actualHeal;
            this.log(`${this.currentUnit.name}'s regenerative roots heal ${actualHeal} HP.`);
        }
    }
}

            // Lord's Presence passive - apply Increase Attack to all allies each turn
            if (this.currentUnit.lordsPresencePassive && this.currentUnit.isAlive) {
                const allies = this.getParty(this.currentUnit);
                allies.forEach(ally => {
                    if (ally.isAlive) {
                        this.applyBuff(ally, 'Increase Attack', this.currentUnit.lordsPresenceBuffDuration || 1, { damageMultiplier: 1.5 });
                    }
                });
                this.log(`${this.currentUnit.name}'s presence continues to empower allies!`);
            }

            // Apply DOT effects first (before buff/debuff duration update)
            this.applyDotEffects(this.currentUnit);
            // Then update buff/debuff durations
            this.currentUnit.updateBuffsDebuffs();
            this.currentUnit.reduceCooldowns();

            // Mirror Image dodge duration tracking
if (this.currentUnit.mirrorImageDodge && this.currentUnit.mirrorImageDuration !== undefined) {
    this.currentUnit.mirrorImageDuration--;
    if (this.currentUnit.mirrorImageDuration <= 0) {
        this.currentUnit.dodgePhysical = (this.currentUnit.dodgePhysical || 0) - 0.5;
        this.currentUnit.mirrorImageDodge = false;
        this.currentUnit.mirrorImageDuration = undefined;
        this.log(`${this.currentUnit.name}'s mirror images fade away.`);
    }
}

            // Smoke and Mirrors dodge duration tracking
if (this.currentUnit.smokeAndMirrorsDodge && this.currentUnit.smokeAndMirrorsDuration !== undefined) {
    this.currentUnit.smokeAndMirrorsDuration--;
    if (this.currentUnit.smokeAndMirrorsDuration <= 0) {
        this.currentUnit.dodgePhysical = (this.currentUnit.dodgePhysical || 0) - 0.5;
        this.currentUnit.dodgeMagical = (this.currentUnit.dodgeMagical || 0) - 0.5;
        this.currentUnit.smokeAndMirrorsDodge = false;
        this.currentUnit.smokeAndMirrorsDuration = undefined;
        this.log(`${this.currentUnit.name}'s illusions disappear.`);
    }
}
            
        }
        
        // Clear any active targeting before ending turn
        if (this.targetingState) {
            this.clearTargeting();
        }
        
        this.currentUnit = null;
        this.waitingForPlayer = false;
        this.turn++;
        
        // Hide ability panel
        this.hidePlayerAbilities();
        
        // Update UI
        this.updateUI();
        
        // Continue battle loop after delay
        setTimeout(() => this.battleLoop(), 1000);
    }
    
    // Combat methods referenced by spells
dealDamage(attacker, target, amount, damageType = 'physical', options = {}) {
    if (!target.isAlive) return 0;
    
    let damage = Math.round(amount);

    // Check for damage calculation modifiers
    if (attacker.onDamageCalculation) {
        attacker.onDamageCalculation.forEach(calc => {
            if (calc.type === 'executioner' && (target.currentHp / target.maxHp) < calc.hpThreshold) {
                damage *= calc.damageBonus;
            } else if (calc.type === 'missing_hp_damage' && attacker.savageMomentumPassive) {
                // Savage Momentum - bonus damage based on missing HP
                const missingHpPercent = 1 - (attacker.currentHp / attacker.maxHp);
                const damageBonus = 1 + (missingHpPercent * calc.maxBonus);
                damage *= damageBonus;
            } else if (calc.type === 'blade_mastery' && attacker.buffs.some(b => b.name === 'Increase Speed')) {
                damage *= calc.damageBonus;
            }
        });
    }

    // Check if target can dodge (Marked prevents all dodging)
    const isMarked = target.debuffs.some(d => d.name === 'Mark');

    // Check for Professional Witcher Female passive - Unavoidable Strike against silenced enemies
    const isPurgeSlashAgainstSilenced = attacker.professionalWitcherFemalePassive && 
                                       attacker.lastAbilityUsed === 'purge_slash' && 
                                       target.debuffs.some(d => d.name === 'Silence');

    // Check for dodge chances from Master Stalker passives
    let dodgeChance = 0;
    if (!isMarked && !isPurgeSlashAgainstSilenced) {
        if (damageType === 'physical') {
            dodgeChance = target.physicalDodgeChance || target.dodgePhysical || 0;
        } else if (damageType === 'magical') {
            dodgeChance = target.magicalDodgeChance || target.dodgeMagical || 0;
        } else if (damageType === 'pure') {
            dodgeChance = target.dodgePure || 0;
        }
        
        if (dodgeChance > 0 && Math.random() < dodgeChance) {
            this.log(`${target.name} dodges the attack!`);
            this.animations.showDodgeAnimation(target);
            return 0;
        }
    }
    
    // Apply attacker's damage modifiers from buffs
    attacker.buffs.forEach(buff => {
        if (buff.name === 'Increase Attack' || buff.damageMultiplier) {
            damage *= 1.5;
        }
    });

    // Commander's Presence passive - bonus damage if any ally is buffed
const allies = this.getParty(attacker);
const commanderAlly = allies.find(ally => ally.isAlive && ally.commandersPresencePassive);
if (commanderAlly && allies.some(ally => ally.isAlive && ally.buffs.length > 0)) {
    damage *= (1 + commanderAlly.commandersAttackBonus);
}

    // Hunter's Focus - double damage on next attack
if (attacker.huntersFocusActive) {
    damage *= 2;
    attacker.huntersFocusActive = false; // Consume the buff
    this.log(`${attacker.name}'s focused shot deals double damage!`);
}

    // Predator's Instinct passive - bonus damage vs low HP enemies
if (attacker.predatorsInstinctPassive && target.isAlive) {
    const targetHpPercent = target.currentHp / target.maxHp;
    if (targetHpPercent < attacker.predatorsHpThreshold) {
        damage *= attacker.predatorsDamageBonus;
        this.log(`${attacker.name}'s predator instincts trigger!`);
    }
}

    // Apply magical damage bonus from Cinder Lord passive
    if (damageType === 'magical' && attacker.magicalDamageBonus) {
        damage *= (1 + attacker.magicalDamageBonus);
    }

    // Warmaster passive - check if attacker has bleed and if any ally has warmaster passive
    if (attacker.debuffs.some(d => d.name === 'Bleed')) {
        const allies = this.getParty(attacker);
        const warmasterAlly = allies.find(ally => ally.isAlive && ally.warmasterPassive);
        if (warmasterAlly) {
            damage *= 1.25; // 25% damage bonus
            // Only log once per turn to avoid spam
            if (!attacker._warmasterBonusLogged) {
                this.log(`${attacker.name} gains Warmaster's fury!`);
                attacker._warmasterBonusLogged = true;
            }
        }
    }
    
    // Apply Reduce Defense damage increase (25% more base damage)
    const hasReduceDefense = target.debuffs.some(d => d.name === 'Reduce Defense');
    if (hasReduceDefense) {
        damage = Math.round(damage * 1.25);
    }
    
    // Apply Increase Defense damage reduction (25% less base damage)
    const hasIncreaseDefense = target.buffs.some(b => b.name === 'Increase Defense');
    if (hasIncreaseDefense) {
        damage = Math.round(damage * 0.75);
    }

    // Apply Frost Armor damage reduction (25% less damage, calculated separately)
    const hasFrostArmor = target.buffs.some(b => b.name === 'Frost Armor');
    if (hasFrostArmor) {
        damage = Math.round(damage * 0.75);
    }
    
    // Apply damage reduction based on type (skip for pure damage)
if (damageType !== 'pure') {
    if (damageType === 'physical') {
        let physicalDR = target.physicalDamageReduction;
        
        // Apply armor piercing if specified
        if (options && options.armorPierce) {
            physicalDR *= (1 - options.armorPierce);
        }
        
        // Apply Reduce Defense (flat -25 percentage points)
        if (hasReduceDefense) {
            physicalDR = Math.max(0, physicalDR - 0.25);
        }        
            // Apply Increase Defense (flat +25 percentage points, capped at 90%)
            if (hasIncreaseDefense) {
                physicalDR = Math.min(0.9, physicalDR + 0.25);
            }

            damage = damage * (1 - physicalDR);
        } else if (damageType === 'magical') {
            // All non-physical, non-pure damage is considered magical
            let magicalDR = target.magicDamageReduction;
            
            // Apply Reduce Defense (flat -25 percentage points)
            if (hasReduceDefense) {
                magicalDR = Math.max(0, magicalDR - 0.25);
            }
            
            // Apply Increase Defense (flat +25 percentage points, capped at 50%)
            if (hasIncreaseDefense) {
                magicalDR = Math.min(0.5, magicalDR + 0.25);
            }
            
            damage = damage * (1 - magicalDR);
        }
    }
    
    // Check for shields first
    const shield = target.buffs.find(b => b.name === 'Shield');
    let shieldDamageAbsorbed = 0;
    if (shield && shield.shieldAmount > 0) {
        const shieldDamage = Math.min(damage, shield.shieldAmount);
        shield.shieldAmount -= shieldDamage;
        damage -= shieldDamage;
        shieldDamageAbsorbed = shieldDamage;
        
        if (shield.shieldAmount <= 0) {
    target.buffs = target.buffs.filter(b => b !== shield);
    battle.log(`${target.name}'s shield breaks!`);
    
    // Molten Shield - disable retaliation when shield breaks
    if (target.moltenShieldActive) {
        target.moltenShieldActive = false;
        target.moltenShieldDamage = null;
    }
    
    // Oceanic Resilience passive - when shield breaks, apply Increase Defense
            const allies = this.getParty(target);
            const oceanicResilienceAlly = allies.find(ally => 
                ally.isAlive && ally.oceanicResiliencePassive
            );
            
            if (oceanicResilienceAlly) {
                this.applyBuff(target, 'Increase Defense', oceanicResilienceAlly.oceanicResilienceBuffDuration || 2, {});
                this.log(`${target.name} gains defense from oceanic resilience!`);
            }
        }
    }
    
    // Apply remaining damage reduction from buffs
    target.buffs.forEach(buff => {
        if (buff.damageReduction) {
            damage *= (1 - buff.damageReduction);
        }
    });
    
    // Apply damage increase from debuffs
    target.debuffs.forEach(debuff => {
        if (debuff.damageTakenMultiplier) {
            damage *= debuff.damageTakenMultiplier;
        }
    });

    // Apply Mark damage increase (25% more damage)
    if (target.debuffs.some(d => d.name === 'Mark')) {
        damage *= 1.25;
    }
    
    // Apply Reduce Attack LAST
    attacker.debuffs.forEach(debuff => {
        if (debuff.name === 'Reduce Attack') {
            damage *= 0.5;
        }
    });
    
    // Apply passive damage reduction (like Thick Hide and Patchwork Body) - skip for pure damage
    if (damageType !== 'pure') {
        if (target.damageReduction) {
            damage *= (1 - target.damageReduction);
        }
        if (target.globalDamageReduction) {
            damage *= (1 - target.globalDamageReduction);
        }
    }

    // DEAL THE DAMAGE
    damage = Math.round(damage);
    const previousHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - damage);
    
    // Calculate actual damage dealt (for life drain calculations)
    const actualDamage = previousHp - target.currentHp;

    // Track damage stats
    this.trackBattleStat(attacker.name, 'damageDealt', actualDamage);
    this.trackBattleStat(target.name, 'damageTaken', actualDamage);

    // AFTER DAMAGE TAKEN EFFECTS BELOW

    // Acidic Body reflection - based on shield damage absorbed
    if (target.acidicBodyReflect && shieldDamageAbsorbed > 0 && attacker.isAlive) {
        const reflectDamage = Math.floor(shieldDamageAbsorbed * target.acidicBodyReflect);
        attacker.currentHp = Math.max(0, attacker.currentHp - reflectDamage);
        this.log(`${attacker.name} takes ${reflectDamage} acidic damage from hitting the shield!`);
        
        if (attacker.currentHp <= 0 && !attacker.isDead) {
            this.handleUnitDeath(attacker, target);
        }
    }

    // Toxic Blood passive - chance to apply Blight when damaged
    if (target.toxicBloodPassive && target.isAlive && actualDamage > 0) {
        if (Math.random() < (target.toxicBloodChance || 0.3)) {
            this.applyDebuff(attacker, 'Blight', target.toxicBloodDuration || 2, { noHeal: true });
            this.log(`${attacker.name} is infected by toxic blood!`);
        }
    }

// Burning Wounds passive - chance to apply Bleed when attacked
if (target.burningWoundsPassive && target.isAlive && actualDamage > 0 && attacker.isAlive) {
    if (Math.random() < (target.burningWoundsChance || 0.3)) {
        this.applyDebuff(attacker, 'Bleed', target.burningWoundsBleedDuration || 1, {});
        this.log(`${attacker.name} starts bleeding from ${target.name}'s burning wounds!`);
    }
}

// Runemaster Female passive - retaliate with Nature's Blessing when taking magical damage
if (target.runemasterFemalePassive && target.isAlive && actualDamage > 0 && damageType === 'magical' && !target.isDead) {
    // Find first non-passive ability (spell 1)
    let spell1Index = -1;
    for (let i = 0; i < target.abilities.length; i++) {
        if (target.abilities[i] && !target.abilities[i].passive) {
            spell1Index = i;
            break;
        }
    }
    
    if (spell1Index >= 0) {
        // Get random enemy
        const enemies = this.getEnemies(target);
        const aliveEnemies = enemies.filter(e => e && e.isAlive);
        
        if (aliveEnemies.length > 0) {
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const ability = target.abilities[spell1Index];
            const spell = spellManager.getSpell(ability.id);
            
            if (spell && spellLogic[spell.logicKey]) {
                // Execute the spell without consuming cooldown or action bar
                const spellLevel = ability.level || target.spellLevel || 1;
                this.log(`${target.name}'s Nature's Revenge triggers ${ability.name}!`);
                
                // Show spell animation
                this.animations.showSpellAnimation(target, ability.name, spell.effects);
                
                // Execute spell logic directly
                try {
                    spellLogic[spell.logicKey](this, target, randomEnemy, spell, spellLevel);
                } catch (error) {
                    console.error(`Error executing Nature's Revenge retaliation:`, error);
                }
            }
        }
    }
}
    
    // Check for on-hit effects from attacker
    if (attacker.onHitEffects && target.isAlive) {
        attacker.onHitEffects.forEach(effect => {
            if (effect.type === 'debuff' && Math.random() < effect.chance) {
                this.applyDebuff(target, effect.debuffName, effect.duration, {});
            }
        });
    }

    // Rotting Presence passive - attacks apply Blight
    if (attacker.rottingPresencePassive && target.isAlive && actualDamage > 0) {
        this.applyDebuff(target, 'Blight', attacker.rottingPresenceBlightDuration || 1, { noHeal: true });
    }

    // Stalker's Mark passive - attacks apply Mark
if (attacker.stalkersMarkPassive && target.isAlive && actualDamage > 0) {
    this.applyDebuff(target, 'Mark', attacker.markDuration || 1, {});
}

    // Check for on-damage-taken effects from target
    if (target.onDamageTaken && target.isAlive && damage > 0) {
        target.onDamageTaken.forEach(effect => {
            if (effect.type === 'buff') {
                // Log Pack Fury activation
                if (effect.buffName === 'Increase Attack' && target.packFuryApplied) {
                    this.log(`${target.name}'s Pack Fury activates!`);
                }
                this.applyBuff(target, effect.buffName, effect.duration, effect.buffEffects || {});
            } else if (effect.type === 'stun_counter' && Math.random() < effect.chance) {
                // Champion Male passive
                this.applyDebuff(attacker, 'Stun', effect.duration, { stunned: true });
                this.log(`${target.name} stuns ${attacker.name} with a counter!`);
            } else if (effect.type === 'grant_speed_to_ally' && target.eyeOfTheStormPassive) {
                const allies = this.getParty(target);
                const aliveAllies = allies.filter(a => a && a.isAlive && a !== target);
                if (aliveAllies.length > 0) {
                    const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                    this.applyBuff(randomAlly, 'Increase Speed', target.eyeOfTheStormDuration || 1, {});
                    this.log(`Storm's eye grants ${randomAlly.name} speed!`);
                }
            } else if (effect.type === 'frozen_heart_defense' && damageType === 'magical') {
                this.applyBuff(target, 'Increase Defense', effect.duration || 1, {});
                this.log(`${target.name}'s frozen heart grants defense against magic!`);
            }
        });
    }

    // Demolition Expert passive - AOE retaliation
    if (target.demolitionExpertPassive && target.isAlive && actualDamage > 0) {
        // Check if target has any debuffs
        if (!target.debuffs || target.debuffs.length === 0) {
            const retaliationDamage = actualDamage * 0.3;
            const enemies = this.getEnemies(target);
            enemies.forEach(enemy => {
                if (enemy.isAlive && enemy !== attacker) {
                    enemy.currentHp = Math.max(0, enemy.currentHp - retaliationDamage);
                    this.log(`${target.name}'s demolition expertise deals ${Math.floor(retaliationDamage)} damage to ${enemy.name}!`);
                    
                    // Check if enemy died from retaliation
                    if (enemy.currentHp <= 0 && !enemy.isDead) {
                        this.handleUnitDeath(enemy, target);
                    }
                }
            });
            // Also damage the original attacker
            if (attacker.isAlive) {
                attacker.currentHp = Math.max(0, attacker.currentHp - retaliationDamage);
                this.log(`${target.name}'s demolition expertise deals ${Math.floor(retaliationDamage)} damage to ${attacker.name}!`);
                
                if (attacker.currentHp <= 0 && !attacker.isDead) {
                    this.handleUnitDeath(attacker, target);
                }
            }
        }
    }

    // Avenger Female passive - gain action bar when damaged
    if (target.actionBarGainOnDamage && target.isAlive && damage > 0) {
        const actionBarGain = target.actionBarGainOnDamage * 10000;
        target.actionBar += actionBarGain;
        this.log(`${target.name} gains ${Math.floor(actionBarGain / 100)}% action bar!`);
    }

    // Avenger Male passive - apply blight when attacked by taunted unit
if (target.avengerBlightOnTauntedAttack && target.isAlive && damage > 0) {
    const attackerTaunt = attacker.debuffs.find(d => d.name === 'Taunt' && d.tauntTarget === target);
    if (attackerTaunt) {
        const blightDuration = target.avengerBlightDuration || 2;
        this.applyDebuff(attacker, 'Blight', blightDuration, { noHeal: true });
        this.log(`${attacker.name} is blighted by ${target.name}'s vengeance!`);
    }
}

    // Corrosive Splash passive - chance to reduce attacker's attack
    if (target.corrosiveSplashPassive && target.isAlive && damage > 0) {
        if (Math.random() < target.corrosiveSplashChance) {
            this.applyDebuff(attacker, 'Reduce Attack', target.corrosiveSplashDuration, {});
            this.log(`${attacker.name} is weakened by ${target.name}'s corrosive splash!`);
        }
    }

    // Nature's Vengeance passive - chance to reduce attacker's speed
    if (target.naturesVengeancePassive && target.isAlive && damage > 0 && attacker.isAlive) {
        if (Math.random() < target.naturesVengeanceChance) {
            this.applyDebuff(attacker, 'Reduce Speed', target.naturesVengeanceDuration, {});
            this.log(`${attacker.name} is slowed by ${target.name}'s nature's vengeance!`);
        }
    }
    
    // Check for Frost Armor retaliation
    if (target.isAlive && damage > 0 && hasFrostArmor) {
        // Apply or stack reduce speed on the attacker
        const existingSlowDebuff = attacker.debuffs.find(d => d.name === 'Reduce Speed');
        if (existingSlowDebuff) {
            // Stack the duration
            existingSlowDebuff.duration += 1;
            this.log(`${target.name}'s Frost Armor adds Reduce Speed to ${attacker.name} (${existingSlowDebuff.duration} turns)!`);
        } else {
            // Apply new reduce speed
            this.applyDebuff(attacker, 'Reduce Speed', 1, {});
            this.log(`${target.name}'s Frost Armor slows ${attacker.name}!`);
        }
    }
    
    // Hellfire Aura passive retaliation
    if (target.hellfireAuraPassive && target.isAlive && damage > 0 && attacker.isAlive) {
        const retaliationDamage = target.hellfireRetaliationDamage || 50;
        attacker.currentHp = Math.max(0, attacker.currentHp - retaliationDamage);
        this.log(`${attacker.name} takes ${retaliationDamage} hellfire damage!`);
        
        this.applyDebuff(attacker, 'Reduce Speed', target.hellfireSlowDuration || 1, {});
        
        if (attacker.currentHp <= 0 && !attacker.isDead) {
            this.handleUnitDeath(attacker, target);
        }
    }

    // Burning Aura passive retaliation
    if (target.burningAuraPassive && target.isAlive && damage > 0 && attacker.isAlive) {
        if (Math.random() < (target.burningAuraProcChance || 0.3)) {
            const retaliationDamage = target.burningAuraRetaliationDamage || 50;
            attacker.currentHp = Math.max(0, attacker.currentHp - retaliationDamage);
            this.log(`${attacker.name} takes ${retaliationDamage} burning damage!`);
            
            this.applyDebuff(attacker, 'Reduce Attack', target.burningAuraDebuffDuration || 1, {});
            
            if (attacker.currentHp <= 0 && !attacker.isDead) {
                this.handleUnitDeath(attacker, target);
            }
        }
    }
    
    // Molten Shield retaliation
    if (target.moltenShieldActive && target.isAlive && damage > 0 && attacker.isAlive) {
        const retaliationDamage = target.moltenShieldDamage || 75;
        attacker.currentHp = Math.max(0, attacker.currentHp - retaliationDamage);
        this.log(`${attacker.name} takes ${retaliationDamage} molten damage from hitting the shield!`);
        
        if (attacker.currentHp <= 0 && !attacker.isDead) {
            this.handleUnitDeath(attacker, target);
        }
    }
    
    // Burning Aura passive - chance to apply bleed when attacked
    if (attacker.burningAuraPassive && attacker.isAlive && damage > 0 && target.isAlive) {
        if (Math.random() < (attacker.burningAuraChance || 0.3)) {
            this.applyDebuff(target, 'Bleed', attacker.burningAuraBleedDuration || 1, {});
            this.log(`${target.name} starts bleeding from ${attacker.name}'s burning aura!`);
        }
    }
    
    // Check for From Ashes trigger
    if (target.fromAshesReady && !target.fromAshesTriggered && target.isAlive && 
        (target.currentHp / target.maxHp) <= (target.fromAshesThreshold || 0.25)) {
        target.fromAshesTriggered = true;
        const healPercent = target.fromAshesHealPercent || 0.25;
        
        const allies = this.getParty(target);
        allies.forEach(ally => {
            if (ally.isAlive) {
                const healAmount = Math.floor(ally.maxHp * healPercent);
                this.healUnit(ally, healAmount);
            }
        });
        this.log(`${target.name} rises from near death, healing all allies!`);
    }
    
    this.log(`${attacker.name} deals ${damage} ${damageType} damage to ${target.name}!`);
    
    // Show damage animation
    this.animations.showDamageAnimation(attacker, target, damage, damageType);

    // Check if target died
    if (previousHp > 0 && target.currentHp <= 0) {
        this.handleUnitDeath(target, attacker);
    }
    
    return actualDamage;
}

handleUnitDeath(unit, killer = null) {
    // Prevent double death handling
    if (unit.isDead) return;

    // Check for Undying Will passive
    if (unit.undyingWillPassive && !unit.undyingWillUsed) {
        unit.undyingWillUsed = true;
        unit.currentHp = Math.floor(unit.maxHp * unit.undyingWillHealPercent);
        this.log(`${unit.name}'s undying will prevents death! Healed to ${unit.currentHp} HP!`);
        return;
    }
    
    unit.isDead = true;
    // Track death
    this.trackBattleStat(unit.name, 'deaths', 1);
    
    // Hide active circle on death
    const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
    const element = document.getElementById(elementId);
    if (element) {
        const animContainer = element.querySelector('.unitAnimationContainer');
        if (animContainer) {
            const activeCircle = animContainer.querySelector('.unitActiveCircle');
            if (activeCircle) {
                activeCircle.style.display = 'none';
            }
        }
    }
    
    // Check for kill effects from killer
    if (killer && killer.isAlive) {
        // Track kill for ANY killer
        this.trackBattleStat(killer.name, 'kills', 1);

        // Check for Queen's Lament passive on any living unit
        this.allUnits.forEach(otherUnit => {
            if (otherUnit.isAlive && otherUnit.queensLamentPassive) {
                // Heal 10% HP
                const healAmount = Math.floor(otherUnit.maxHp * otherUnit.queensLamentHealPercent);
                this.healUnit(otherUnit, healAmount);
                
                // Apply Increase Attack buff
                this.applyBuff(otherUnit, 'Increase Attack', otherUnit.queensLamentBuffDuration, { damageMultiplier: 1.5 });
                
                this.log(`${otherUnit.name} gains power from ${unit.name}'s death!`);
            }
        });

        // Check for Shatter passive on the dying unit
        if (unit.shatterPassive && unit.shatterDamage) {
            // Deal AOE damage to all enemies
            const enemies = this.getEnemies(unit);
            enemies.forEach(enemy => {
                if (enemy.isAlive) {
                    enemy.currentHp = Math.max(0, enemy.currentHp - unit.shatterDamage);
                    this.log(`${enemy.name} takes ${unit.shatterDamage} damage from shatter!`);
                    
                    // Apply Reduce Speed
                    if (unit.shatterSlowDuration) {
                        this.applyDebuff(enemy, 'Reduce Speed', unit.shatterSlowDuration, {});
                    }
                    
                    // Check if enemy died from shatter damage
                    if (enemy.currentHp <= 0 && !enemy.isDead) {
                        this.handleUnitDeath(enemy, unit);
                    }
                }
            });
            this.log(`${unit.name} shatters on death!`);
        }

        // Check for Shattered Reflection passive on the dying unit
if (unit.shatteredReflectionPassive && unit.shatteredReflectionImmuneDuration) {
    spellHelpers.forEachAliveAlly(battle, unit, ally => {
        battle.applyBuff(ally, 'Immune', unit.shatteredReflectionImmuneDuration, { immunity: true });
    });
    battle.log(`${unit.name}'s shattered reflection protects all allies!`);
}

        // Check for Corpse Bloat passive on the dying unit
if (unit.corpseBloatPassive && unit.corpseBloatBlightDuration) {
    // Apply Blight to all enemies
    const enemies = this.getEnemies(unit);
    enemies.forEach(enemy => {
        if (enemy.isAlive) {
            applyConfiguredDebuff(this, enemy, 'Blight', unit.corpseBloatBlightDuration);
        }
    });
    this.log(`${unit.name}'s corpse explodes with disease!`);
}
        
        // Check for Death's Domain passive
        this.allUnits.forEach(otherUnit => {
            if (otherUnit.isAlive && otherUnit.deathsDomainPassive) {
                const shieldPercent = otherUnit.deathsDomainShieldPercent || 0.2;
                const shieldAmount = Math.floor(otherUnit.maxHp * shieldPercent);
                this.applyBuff(otherUnit, 'Shield', -1, { shieldAmount: shieldAmount });
                this.applyBuff(otherUnit, 'Increase Speed', otherUnit.deathsDomainSpeedDuration || 2, {});
                this.log(`${otherUnit.name} gains power from death itself!`);
            }
        });
        
        // Check for Hivemind passive - when any ally dies
        if (!unit.isEnemy) { // If a party member died
            this.party.forEach(ally => {
                if (ally.isAlive && ally.hivemindPassive) {
                    const healAmount = Math.floor(ally.maxHp * (ally.hivemindHealPercent || 0.2));
                    this.healUnit(ally, healAmount);
                    this.applyBuff(ally, 'Increase Attack', ally.hivemindBuffDuration || 2, { damageMultiplier: 1.5 });
                    this.log(`${ally.name}'s hivemind grows stronger from ${unit.name}'s death!`);
                }
            });
        }
        
        // Sniper Female passive - speed buff on kill
        if (killer.onKillEffects) {
            killer.onKillEffects.forEach(effect => {
                if (effect.type === 'buff') {
                    this.applyBuff(killer, effect.buffName, effect.duration, {});
                    this.log(`${killer.name} gains ${effect.buffName} from the kill!`);
                }
            });
        }
        
        // Phantom Assassin Male passive - refill action bar on assassinate kill
if (killer.phantomAssassinMalePassive && killer.actionBarRefillOnKill) {
    // Check if the last ability used was Assassinate
    if (killer.lastAbilityUsed === 'assassinate') {
        killer.actionBar = Math.floor(10000 * killer.actionBarRefillOnKill);
        battle.log(`${killer.name}'s action bar refills to ${Math.floor(killer.actionBarRefillOnKill * 100)}%!`);
    }
}
        
        // Dark Arch Templar Male passive - spread debuffs on kill
        if (killer.darkArchTemplarMalePassive && unit.debuffs.length > 0) {
            const enemies = killer.isEnemy ? this.party.filter(p => p && p.isAlive) : this.enemies.filter(e => e && e.isAlive);
            if (enemies.length > 0) {
                const debuffsToSpread = [...unit.debuffs];
                debuffsToSpread.forEach(debuff => {
                    const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                    this.applyDebuff(randomEnemy, debuff.name, debuff.duration, { ...debuff });
                });
                this.log(`${unit.name}'s debuffs spread to the enemy team!`);
            }
        }
    }
    
    // Check if this unit was the source of any taunts
    this.allUnits.forEach(otherUnit => {
        if (otherUnit.isAlive) {
            // Remove any taunts where this unit was the taunt target
            otherUnit.debuffs = otherUnit.debuffs.filter(debuff => {
                if (debuff.name === 'Taunt' && debuff.tauntTarget === unit) {
                    this.log(`${otherUnit.name}'s taunt ends as ${unit.name} has fallen!`);
                    return false;
                }
                return true;
            });
        }
    });
    
    // Trigger death animation only if not already animated
    if (!unit.deathAnimated) {
        unit.deathAnimated = true;
        this.animations.triggerDeathAnimation(unit);
    }
}

    healUnit(target, amount) {
        if (!target.isAlive) return 0;
        
        // Check for blight
        if (target.debuffs.some(d => d.name === 'Blight')) {
            this.log(`${target.name} cannot be healed due to Blight!`);
            return 0;
        }
        
        let heal = Math.floor(amount);
        
        // Apply healing received modifiers
        if (target.healingReceived) {
            heal *= target.healingReceived;
        }
        
        heal = Math.floor(heal);
        const actualHeal = Math.min(heal, target.maxHp - target.currentHp);
        const overheal = heal - actualHeal;
        
        target.currentHp += actualHeal;

// Track healing done (use currentUnit as healer)
if (this.currentUnit && this.currentUnit.isAlive) {
    this.trackBattleStat(this.currentUnit.name, 'healingDone', actualHeal);
}
        
        // Handle overhealing for Prophet Male passive
if (overheal > 0) {
    // Check if healer has Prophet Male passive
    const healer = this.currentUnit;
    if (healer && healer.prophetMalePassive && healer.overhealingSpillover) {
        // Find next lowest HP ally (excluding current target)
        const allies = this.getParty(healer);
        const aliveAllies = allies.filter(a => a && a.isAlive && a !== target);
        
        if (aliveAllies.length > 0) {
            aliveAllies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
            const nextTarget = aliveAllies[0];
            
            // Calculate spillover healing
            const spilloverAmount = Math.floor(overheal * healer.overhealingSpillover);
            if (spilloverAmount > 0) {
                const spilloverHeal = Math.min(spilloverAmount, nextTarget.maxHp - nextTarget.currentHp);
                nextTarget.currentHp += spilloverHeal;
                this.log(`Divine spillover heals ${nextTarget.name} for ${spilloverHeal} HP!`);
                
                // Track healing done for spillover healing
                this.trackBattleStat(healer.name, 'healingDone', spilloverHeal);
            }
        }
    }
}
        
        this.log(`${target.name} is healed for ${actualHeal} HP!`);
        
        return actualHeal;
    }
    
    applyBuff(target, buffName, duration, effects) {
        if (!target.isAlive) return;
        
        // Check if target is marked (prevents gaining buffs)
        if (target.debuffs.some(d => d.name === 'Mark')) {
            this.log(`${target.name} is marked and cannot gain buffs!`);
            return;
        }
        
        // Special handling for shields
        if (buffName === 'Shield' && effects.shieldAmount !== undefined) {
            // Check if shield already exists
            const existingShield = target.buffs.find(b => b.name === 'Shield');
            
            if (existingShield) {
                // Compare shield amounts and keep the higher one
                if (effects.shieldAmount > existingShield.shieldAmount) {
                    existingShield.shieldAmount = effects.shieldAmount;
                    existingShield.duration = duration;
                    this.log(`${target.name}'s shield is strengthened to ${effects.shieldAmount} HP!`);
                } else {
                    this.log(`${target.name} already has a stronger shield (${existingShield.shieldAmount} HP)!`);
                }
            } else {
                // Create new shield
                const shield = {
                    name: buffName,
                    duration: duration,
                    shieldAmount: effects.shieldAmount,
                    ...effects
                };
                
                target.buffs.push(shield);
this.log(`${target.name} gains a ${effects.shieldAmount} HP shield!`);

// Track shield application  
if (this.currentUnit && this.currentUnit.isAlive) {
    this.trackBattleStat(this.currentUnit.name, 'shieldingApplied', effects.shieldAmount);
}
            }
            return;
        }
        
        // Check if caster is buffing themselves during their turn
        let adjustedDuration = duration;
        if (target === this.currentUnit) {
            adjustedDuration = duration + 1;
        }
        
        // Check if buff already exists
        const existingBuff = target.buffs.find(b => b.name === buffName);
        
        if (existingBuff) {
            // Update duration to the higher value
            const oldDuration = existingBuff.duration;
            existingBuff.duration = Math.max(existingBuff.duration, adjustedDuration);
            
            // Update other effects if provided
            Object.assign(existingBuff, effects);
            
            // Log if duration was increased
            if (existingBuff.duration > oldDuration) {
                this.log(`${target.name}'s ${buffName} is refreshed to ${existingBuff.duration} turns!`);
            } else {
                this.log(`${target.name} already has ${buffName} with ${oldDuration} turns remaining!`);
            }
        } else {
            // Create new buff
            const buff = {
                name: buffName,
                duration: adjustedDuration,
                ...effects
            };
            
        target.buffs.push(buff);
        this.log(`${target.name} gains ${buffName}!`);

        // Track buff application
        if (this.currentUnit && this.currentUnit.isAlive) {
            this.trackBattleStat(this.currentUnit.name, 'buffsApplied', 1);
        }
        
        // Queue buff text animation (no delay needed - spell text creates the gap)
        if (this.animations) {
            this.animations.queueBuffDebuffText(target, buffName, false);
        }
            
        }
        
    }
    
    applyDebuff(target, debuffName, duration, effects) {
    if (!target.isAlive) return;
    
    // Check for immunity
    if (target.buffs.some(b => b.name === 'Immune' || b.immunity)) {
        this.log(`${target.name} is immune to debuffs!`);
        return;
    }

// Check for specific debuff immunities
const immunityMap = {
    'Reduce Speed': 'immuneToReduceSpeed',
    'Reduce Attack': 'immuneToReduceAttack',
    'Reduce Defense': 'immuneToReduceDefense',
    'Blight': 'immuneToBlight',
    'Bleed': 'immuneToBleed',
    'Stun': 'immuneToStun',
    'Taunt': 'immuneToTaunt',
    'Silence': 'immuneToSilence',
    'Mark': 'immuneToMark'
};

const immunityProperty = immunityMap[debuffName];
if (immunityProperty && target[immunityProperty]) {
    this.log(`${target.name} is immune to ${debuffName}!`);
    return;
}
    
    // Check for boss stun resistance
    if (debuffName === 'Stun') {
        const bossBuff = target.buffs.find(b => b.name === 'Boss');
        if (bossBuff && bossBuff.stunResistance) {
            if (Math.random() < bossBuff.stunResistance) {
                this.log(`${target.name} is a boss and shrugged off your stun attempt!`);
                return;
            }
        }
    }
    
    // Check for Patient Zero passive - immune to Blight and Bleed, heals instead
    if (target.patientZeroPassive && (debuffName === 'Blight' || debuffName === 'Bleed')) {
        const healAmount = Math.floor(target.maxHp * (target.patientZeroHealPercent || 0.05));
        const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
        if (actualHeal > 0) {
            target.currentHp += actualHeal;
            this.log(`${target.name}'s toxic immunity converts ${debuffName} into ${actualHeal} healing!`);
        }
        return;
    }
    
    // Check if caster is debuffing themselves during their turn
    let adjustedDuration = duration;
    if (target === this.currentUnit) {
        adjustedDuration = duration + 1;
    }
    
    // Check if debuff already exists
    const existingDebuff = target.debuffs.find(d => d.name === debuffName);
    
    if (existingDebuff) {
        // Special handling for Bleed - it stacks duration
        if (debuffName === 'Bleed') {
            existingDebuff.duration += adjustedDuration;
            this.log(`${target.name}'s ${debuffName} stacks to ${existingDebuff.duration} turns!`);
        } else {
            // Normal debuffs - update duration to the higher value
            const oldDuration = existingDebuff.duration;
            existingDebuff.duration = Math.max(existingDebuff.duration, adjustedDuration);
            
            // Update other effects if provided
            Object.assign(existingDebuff, effects);
            
            // Log if duration was increased
            if (existingDebuff.duration > oldDuration) {
                this.log(`${target.name}'s ${debuffName} is refreshed to ${existingDebuff.duration} turns!`);
            } else {
                this.log(`${target.name} already has ${debuffName} with ${oldDuration} turns remaining!`);
            }
        }
    } else {
        // Create new debuff
        const debuff = {
            name: debuffName,
            duration: adjustedDuration,
            ...effects
        };
        
        target.debuffs.push(debuff);
        this.log(`${target.name} suffers from ${debuffName}!`);

        // Track debuff application
        if (this.currentUnit && this.currentUnit.isAlive) {
            this.trackBattleStat(this.currentUnit.name, 'debuffsApplied', 1);
        }
        
        // Queue debuff text animation
        if (this.animations) {
            this.animations.queueBuffDebuffText(target, debuffName, true);
        }
        
        // Apply stun visuals if it's a stun debuff
        if (debuffName === 'Stun' || effects.stunned) {
            this.animations.updateStunVisuals(target);
        }
    }
    
    // Arch Sage passives - gain buff when receiving debuff
    if (target.archSageMalePassive || target.archSageFemalePassive) {
        if (target.archSageMalePassive) {
            this.applyBuff(target, 'Increase Attack', adjustedDuration, { damageMultiplier: 1.5 });
        }
        if (target.archSageFemalePassive) {
            this.applyBuff(target, 'Increase Speed', adjustedDuration, {});
        }
    }
}
    
    applyShield(target, amount) {
        if (!target.isAlive) return;
        
        // Apply shield as a buff
        this.applyBuff(target, 'Shield', 3, { shieldAmount: Math.floor(amount) });
    }
    
removeBuffs(target) {
    // Count buffs that will be removed (excluding permanent buffs and Boss buff)
    const removedCount = target.buffs.filter(buff => 
        buff.duration !== -1 && buff.name !== 'Boss'
    ).length;
    
    // Remove all buffs except permanent ones and Boss buff
    target.buffs = target.buffs.filter(buff => 
        buff.duration === -1 || buff.name === 'Boss'
    );
    
    // Track buffs dispelled
    if (this.currentUnit && removedCount > 0) {
        this.trackBattleStat(this.currentUnit.name, 'buffsDispelled', removedCount);
    }
}
    
removeDebuffs(target) {
    // Store if unit was stunned before removing
    const wasStunned = target.debuffs.some(d => d.name === 'Stun' || d.stunned);
    
    const removedCount = target.debuffs.length;
    target.debuffs = [];
    
    // Track debuffs cleansed
    if (this.currentUnit && removedCount > 0) {
        this.trackBattleStat(this.currentUnit.name, 'debuffsCleansed', removedCount);
        
    }
}
    
    getParty(unit) {
        return unit.isEnemy ? this.enemies : this.party;
    }
    
    getEnemies(unit) {
        return unit.isEnemy ? this.party : this.enemies;
    }
    
    applyDotEffects(unit) {
        unit.debuffs.forEach(debuff => {
            if (debuff.dotDamage && unit.isAlive) {
                const damage = Math.floor(debuff.dotDamage);
                const previousHp = unit.currentHp;
                unit.currentHp = Math.max(0, unit.currentHp - damage);
                this.log(`${unit.name} takes ${damage} damage from ${debuff.name}!`);
                
                // Check if unit died from DOT
                if (previousHp > 0 && unit.currentHp <= 0) {
                    this.handleUnitDeath(unit);
                }
            } else if (debuff.name === 'Bleed' && unit.isAlive) {
                const damage = Math.ceil(unit.maxHp * 0.05);
                const previousHp = unit.currentHp;
                unit.currentHp = Math.max(0, unit.currentHp - damage);
                this.log(`${unit.name} bleeds for ${damage} damage!`);
                
                // Check if unit died from DOT
                if (previousHp > 0 && unit.currentHp <= 0) {
                    this.handleUnitDeath(unit);
                }
            }
        });
    }

    checkBattleEnd() {
        const partyAlive = this.party.some(u => u && u.isAlive);
        const enemiesAlive = this.enemies.some(u => u && u.isAlive);
        
        if (!partyAlive) {
            this.log("Defeat! Your party has been wiped out!");
            this.endBattle(false);
            return true;
        }
        
        if (!enemiesAlive) {
            // Only calculate exp once per wave
            if (!this.waveExpCalculated) {
                this.waveExpCalculated = true;
                
                // Calculate exp for this wave before transitioning
                const waveExp = this.calculateWaveExp();
                console.log(`Wave ${this.currentWave + 1} cleared, exp calculated: ${waveExp}`);
                this.waveExpEarned.push(waveExp);
                
                // Award exp to alive heroes
                this.party.forEach((unit, index) => {
                    if (unit && unit.isAlive) {
                        const hero = unit.source;
                        const prevExp = hero.pendingExp;
                        hero.pendingExp += waveExp;
                        this.log(`${hero.name} earned ${waveExp} exp from wave ${this.currentWave + 1} (total pending: ${hero.pendingExp})`);
                    }
                });
            }
            
            // Check if there are more waves
            if (this.currentWave < this.enemyWaves.length - 1) {
                // Prevent multiple wave transitions
                if (!this.processingWaveTransition) {
                    this.processingWaveTransition = true;
                    this.log("Wave cleared!");
                    
                    // Only update UI for living party members - don't revive dead ones
this.party.forEach((unit, index) => {
    if (unit && unit.isAlive && !unit.isDead) {
        // Only ensure UI is properly shown for LIVING party members
        const elementId = `party${unit.position + 1}`;
        const element = document.getElementById(elementId);
        
        if (element) {
            element.style.display = 'block';
            
            const healthBar = element.querySelector('.healthBar');
            const actionBar = element.querySelector('.actionBar');
            const levelIndicator = element.querySelector('.levelIndicator');
            const buffDebuffContainer = element.querySelector('.buffDebuffContainer');
            const animContainer = element.querySelector('.unitAnimationContainer');
            const unitActiveCircle = animContainer ? animContainer.querySelector('.unitActiveCircle') : null;
            
            if (healthBar) healthBar.style.display = '';
            if (actionBar) actionBar.style.display = '';
            if (levelIndicator) levelIndicator.style.display = '';
            if (buffDebuffContainer) buffDebuffContainer.style.display = '';
            if (unitActiveCircle) unitActiveCircle.style.display = 'none'; // Ensure it's hidden
        }
    }
});
                    
                    // Load next wave
                    setTimeout(() => {
                        this.loadWave(this.currentWave + 1);
                        this.processingWaveTransition = false;
                        this.waveExpCalculated = false; // Reset for next wave
                    }, 1000);
                }
                return false; // Battle continues
            } else {
                this.log("Victory! All waves defeated!");
                this.endBattle(true);
                return true;
            }
        }
        
        return false;
    }
    
    calculateWaveExp() {
        // Base exp per enemy level
        const baseExpPerLevel = 25;
        let totalExp = 0;
        
        // Safety check
        if (!this.dungeonWaves || !Array.isArray(this.dungeonWaves)) {
            return 0;
        }
        
        if (this.currentWave >= this.dungeonWaves.length) {
            return 0;
        }
        
        // Get the current wave configuration
        const currentWaveEnemies = this.dungeonWaves[this.currentWave];
        
        if (!currentWaveEnemies) {
            return 0;
        }
        
        // Calculate exp based on enemy levels
        currentWaveEnemies.forEach(enemy => {
            if (enemy) {
                const expFromEnemy = enemy.level * baseExpPerLevel;
                totalExp += expFromEnemy;
            }
        });
        
        return totalExp;
    }
    
    endBattle(victory) {
    this.running = false;
    this.endTime = Date.now();

    // Clear timer interval
    if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    // Clear all buffs and debuffs from all units
    this.allUnits.forEach(unit => {
        unit.buffs = [];
        unit.debuffs = [];
    });
    
    // Clear pending exp for all party members if defeat
    if (!victory) {
        this.party.forEach(unit => {
            if (unit && unit.source) {
                unit.source.pendingExp = 0;
            }
        });
    }

    // Clear any active targeting
    if (this.targetingState) {
        this.clearTargeting();
    }
    
    // Clean up level indicator event listeners for both party and enemies
    for (let i = 1; i <= 5; i++) {
        ['party', 'enemy'].forEach(type => {
            const element = document.getElementById(`${type}${i}`);
            if (element) {
                const levelIndicator = element.querySelector('.levelIndicator');
                if (levelIndicator && levelIndicator._unitInfoHandler) {
                    levelIndicator.removeEventListener('click', levelIndicator._unitInfoHandler);
                    delete levelIndicator._unitInfoHandler;
                }
                
                // Also clean up right-click handlers
                if (element._rightClickHandler) {
                    element.removeEventListener('contextmenu', element._rightClickHandler);
                    delete element._rightClickHandler;
                }
            }
        });
    }

    // Hide exit button when showing results
    const exitButton = document.querySelector('.exitBattleButton');
    if (exitButton) {
        exitButton.style.display = 'none';
    }
    
    // Close any open popup
    this.game.uiManager.closeHeroInfo();

    // Calculate battle duration
    const duration = Math.floor((this.endTime - this.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
// Get dungeon data (only for dungeon mode)
    let dungeonId = null;
    let dungeonConfig = null;
    let rewards = { gold: 0, exp: 0, items: [] };
    
    if (this.mode === 'dungeon' && this.game.currentDungeon) {
        dungeonId = this.game.currentDungeon.id;
        dungeonConfig = dungeonData.dungeons[dungeonId];
        rewards = dungeonConfig.rewards || { gold: 0, exp: 0, items: [] };
    }
    
// Process items only on victory and in dungeon mode
const itemRolls = [];
if (victory && this.mode === 'dungeon' && dungeonConfig) {
    // Get global collection drop bonus once
    const globalDropBonus = this.game.getCollectionDropBonus();
    
    // Only roll items if we won
    this.party.forEach(unit => {
        if (!unit || !unit.source) return;
        
        const hero = unit.source;
        
        // Check if villager (they only get items from first 3 dungeons and only gold after that)
        const isVillager = hero.className.includes('villager') || hero.className.includes('tester');
        const dungeonLevel = dungeonConfig ? dungeonConfig.level : 0;
        
        if (isVillager) {
            // Villagers only get items from dungeons level 50 and below (first 3 easy dungeons)
            if (dungeonLevel > 50 || !unit.isAlive) {
                // Only gold for villagers in harder dungeons or if dead
                itemRolls.push({
                    hero: hero,
                    gold: Math.floor(rewards.gold / this.party.length),
                    item: null
                });
            } else if (unit.isAlive) {
                // 50% chance for item in easy dungeons
                if (Math.random() < 0.5) {
                    // Get item from dungeon rewards
                    if (rewards.items && rewards.items.length > 0) {
                        const itemId = rewards.items[Math.floor(Math.random() * rewards.items.length)];
                        
                        // Get collection bonuses for this item
                        const itemBonuses = this.game.getItemCollectionBonuses(itemId);
                        const collectionBonuses = {
                            globalDropBonus: globalDropBonus,
                            ...itemBonuses
                        };
                        
                        // Create item with collection bonuses
                        const item = new Item(itemId);
                        item.rollItem(collectionBonuses);
                        
                        // Check collection BEFORE autoselling
                        this.game.checkItemForCollection(item, hero.name, hero.displayClassName);
                        
                        // Process through autosell
                        const processedRoll = this.game.autosell.processItemRoll({
                            hero: hero,
                            gold: 0,
                            item: item
                        });
                        
                        itemRolls.push(processedRoll);
                    } else {
                        // No items available, give gold instead
                        itemRolls.push({
                            hero: hero,
                            gold: Math.floor(rewards.gold / this.party.length),
                            item: null
                        });
                    }
                } else {
                    // Failed item roll, get gold
                    itemRolls.push({
                        hero: hero,
                        gold: Math.floor(rewards.gold / this.party.length),
                        item: null
                    });
                }
            } else {
                // Dead villagers get nothing
                itemRolls.push({
                    hero: hero,
                    gold: 0,
                    item: null
                });
            }
        } else {
            // Non-villager heroes - original logic
            if (unit.isAlive) {
                // 50% chance for item
                if (Math.random() < 0.5) {
                    // Get item from dungeon rewards
                    if (rewards.items && rewards.items.length > 0) {
                        const itemId = rewards.items[Math.floor(Math.random() * rewards.items.length)];
                        
                        // Get collection bonuses for this item
                        const itemBonuses = this.game.getItemCollectionBonuses(itemId);
                        const collectionBonuses = {
                            globalDropBonus: globalDropBonus,
                            ...itemBonuses
                        };
                        
                        // Create item with collection bonuses
                        const item = new Item(itemId);
                        item.rollItem(collectionBonuses);
                        
                        // Check collection BEFORE autoselling
                        this.game.checkItemForCollection(item, hero.name, hero.displayClassName);
                        
                        // Process through autosell
                        const processedRoll = this.game.autosell.processItemRoll({
                            hero: hero,
                            gold: 0,
                            item: item
                        });
                        
                        itemRolls.push(processedRoll);
                    } else {
                        // No items available, give gold instead
                        itemRolls.push({
                            hero: hero,
                            gold: Math.floor(rewards.gold / this.party.length),
                            item: null
                        });
                    }
                } else {
                    // Failed item roll, get gold
                    itemRolls.push({
                        hero: hero,
                        gold: Math.floor(rewards.gold / this.party.length),
                        item: null
                    });
                }
            } else {
                // Dead heroes get nothing
                itemRolls.push({
                    hero: hero,
                    gold: 0,
                    item: null
                });
            }
        }
    });
    
    // Save autosell stats after processing
    this.game.autosell.saveSettings();
} else {
    // On defeat, no items are rolled - just empty entries
    this.party.forEach(unit => {
        if (!unit || !unit.source) return;
        itemRolls.push({
            hero: unit.source,
            gold: 0,
            item: null
        });
    });
}
    
// Calculate party deaths from battleStats
let partyDeaths = 0;
this.party.forEach(unit => {
    if (unit && this.battleStats[unit.name]) {
        partyDeaths += this.battleStats[unit.name].deaths || 0;
    }
});

// Store battle results
    this.game.pendingBattleResults = {
        victory: victory,
        dungeonName: this.mode === 'arena' ? 'Arena Battle' : (this.game.currentDungeon ? this.game.currentDungeon.name : 'Unknown'),
        time: timeString,
        goldChange: 0, // No longer used at this level
        dungeonBonusExp: victory ? rewards.exp : 0,
        battleStats: this.battleStats, // Add this line here
        partyDeaths: partyDeaths, // Add calculated party deaths
        currentArenaTeam: this.mode === 'arena' ? this.game.currentArenaTeam : null, // Add this line
        // In endBattle method, when creating heroResults:
        heroResults: this.party.map((unit, index) => {
            if (!unit) return null;
            const hero = unit.source;
            const waveExp = hero.pendingExp;
            const dungeonBonus = victory && unit.isAlive ? rewards.exp : 0;
            const totalExp = waveExp + dungeonBonus;
            
            const itemRoll = itemRolls[index];
            
            return {
                hero: hero,
                expGained: totalExp,
                survived: unit.isAlive,
                item: itemRoll.item,
                gold: itemRoll.gold,
                soldItem: itemRoll.soldItem,
                autosold: itemRoll.autosold
            };
        }).filter(r => r !== null)
    };
    
    // Apply battle results immediately (both victory and defeat)
    console.log('Applying battle results immediately');
    this.game.applyBattleResults();
    
    // Save game immediately after applying results
    if (this.game && saveManager && saveManager.currentSlot) {
        console.log('Saving game after battle results applied');
        saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save
    }
    
// Show results popup - use arena results for arena mode
setTimeout(() => {
    if (this.mode === 'arena') {
        this.game.uiManager.showArenaResults();
    } else {
        this.game.uiManager.showBattleResults();
    }
}, 1000);
}

exitBattle() {
    if (this.mode === 'arena') {
        // Return to arena party select
        this.game.uiManager.showPartySelect('arena');
    } else {
        // Return to main menu
        this.game.uiManager.showMainMenu();
    }
}
    
    log(message) {
        this.battleLog.push(message);
        const logElement = document.getElementById('battleLog');
        if (logElement) {
            logElement.innerHTML = this.battleLog.slice(-50).join('<br>') + '<br>';
            logElement.scrollTop = logElement.scrollHeight;
        }
    }
    
    showPlayerAbilities(unit) {
    const abilityPanel = document.getElementById('abilityPanel');
    abilityPanel.innerHTML = '';
    
    // Show all abilities including passives
    unit.abilities.forEach((ability, index) => {
        const abilityDiv = document.createElement('div');
        abilityDiv.className = 'ability';
        
        if (!unit.canUseAbility(index)) {
            abilityDiv.classList.add('onCooldown');
        }
        
        // Add passive class if it's a passive ability
        const isPassive = ability.passive === true;
        if (isPassive) {
            abilityDiv.classList.add('passive');
        }
        
        const spell = spellManager.getSpell(ability.id);
        const iconUrl = `https://puzzle-drops.github.io/TEVE/img/spells/${ability.id}.png`;
        
        abilityDiv.innerHTML = `
            ${isPassive ? `
                <div class="waterbrush-overlay-1">
                    <div class="waterbrush-blob-1"></div>
                    <div class="waterbrush-blob-2"></div>
                </div>
            ` : ''}
            <img src="${iconUrl}" alt="${ability.name}" style="width: 100px; height: 100px;" onerror="this.style.display='none'">
            ${unit.cooldowns[index] > 0 && !isPassive ? `<span class="cooldownText">${unit.cooldowns[index]}</span>` : ''}
        `;
        
        // Add tooltip on hover using the new format
        abilityDiv.onmouseover = (e) => {
            const showFormula = e.altKey;
            const tooltipHtml = game.uiManager.formatAbilityTooltip(ability, ability.level, unit.source, showFormula);
            game.uiManager.showAbilityTooltipFromHTML(e, tooltipHtml);
        };
        abilityDiv.onmouseout = () => {
            game.uiManager.hideAbilityTooltip();
        };
        
        // Add click handler only to non-passive abilities
        if (!isPassive) {
            abilityDiv.onclick = () => {
                // Hide tooltip when clicked
                game.uiManager.hideAbilityTooltip();
                
                // If we're already targeting, clear it first
                if (this.targetingState) {
                    this.clearTargeting();
                }
                
                // Re-enable all abilities first
                const allAbilities = abilityPanel.querySelectorAll('.ability');
                allAbilities.forEach(ab => {
                    ab.style.opacity = '';
                });
                
                // If this ability can't be used, just return after clearing
                if (!unit.canUseAbility(index)) {
                    return;
                }
                
                // Visually disable all other abilities (but keep them clickable)
                allAbilities.forEach(ab => {
                    if (ab !== abilityDiv) {
                        ab.style.opacity = '0.5';
                    }
                });
                
                if (spell) {
                    // For targeted abilities, highlight valid targets
                    if (spell.target === 'enemy' || spell.target === 'ally') {
                        this.selectTarget(unit, index, spell.target);
                    } else {
                        this.executeAbility(unit, index, spell.target === 'self' ? unit : 'all');
                        this.endTurn();
                    }
                }
            };
        }
        
        abilityPanel.appendChild(abilityDiv);
    });
    
    // Apply centering based on ability count
    abilityPanel.style.width = '100%';
}

    hidePlayerAbilities() {
        const abilityPanel = document.getElementById('abilityPanel');
        if (abilityPanel) {
            abilityPanel.innerHTML = '';
        }
        // Don't trigger any targeting clear here - just hide the abilities
    }
    
    selectTarget(caster, abilityIndex, targetType) {
        // Store targeting state
        this.targetingState = {
            caster: caster,
            abilityIndex: abilityIndex,
            targetType: targetType
        };

        // Highlight valid targets - only alive units
        const validTargets = targetType === 'enemy' ? 
            this.enemies.filter(e => e && e.isAlive && !e.isDead) : 
            this.party.filter(p => p && p.isAlive && !p.isDead);
        
        // Add click handlers to valid targets
        validTargets.forEach(target => {
            const element = document.getElementById(target.isEnemy ? `enemy${target.position + 1}` : `party${target.position + 1}`);
            if (element) {
                element.style.cursor = 'pointer';
                element.style.filter = 'brightness(1.2)';
                
                // Add target arrow
                let targetArrow = element.querySelector('.targetArrow');
                if (!targetArrow) {
                    targetArrow = document.createElement('div');
                    targetArrow.className = 'targetArrow';
                    targetArrow.innerHTML = '▼';
                    element.appendChild(targetArrow);
                }
                
                const clickHandler = (e) => {
                    // Don't trigger if clicking on level indicator
                    if (e.target.closest('.levelIndicator')) {
                        return;
                    }
                    
                    // Remove all handlers and highlighting
                    this.clearTargeting();
                    
                    // Execute ability
                    this.executeAbility(caster, abilityIndex, target);
                    this.endTurn();
                };
                
                // Store handler reference so we can remove it later
                element._targetingHandler = clickHandler;
                element.addEventListener('click', clickHandler);
            }
        });
    }
    
    clearTargeting() {
        // Clear targeting state
        this.targetingState = null;
        
        // Re-enable all abilities
        const abilityPanel = document.getElementById('abilityPanel');
        if (abilityPanel) {
            const allAbilities = abilityPanel.querySelectorAll('.ability');
            allAbilities.forEach(ab => {
                ab.style.opacity = '';
            });
        }
        
        // Remove all targeting highlights and handlers
        this.allUnits.forEach(unit => {
            const element = document.getElementById(unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`);
            if (element) {
                // Always clean up targeting visuals
                element.style.cursor = '';
                element.style.filter = '';
                
                // Remove target arrow
                const targetArrow = element.querySelector('.targetArrow');
                if (targetArrow) {
                    targetArrow.remove();
                }
                
                // Remove targeting handler if exists
                if (element._targetingHandler) {
                    element.removeEventListener('click', element._targetingHandler);
                    delete element._targetingHandler;
                }
                
                // Skip further DOM manipulation for dead units
                if (unit.isDead || !unit.isAlive) {
                    return;
                }
            }
        });
    }
    
    toggleAutoMode(enabled) {
        // Set pending auto mode change
        this.pendingAutoMode = enabled;
        
        // If currently waiting for player and auto mode is enabled, execute AI turn
        if (enabled && this.waitingForPlayer) {
            this.ai.executeAITurn(this.currentUnit);
        }
    }

    updateUI() {
        // Update all unit displays
        this.allUnits.forEach(unit => {
            const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
            const element = document.getElementById(elementId);
            
            if (!element) return;
            
            // Skip dead units entirely - no UI updates for them
            if (!unit.isAlive || unit.isDead) {
                return;
            }
            
            // Update health and shield bars
            const healthBar = element.querySelector('.healthBar');
            const healthFill = element.querySelector('.healthFill');
            const shieldFill = element.querySelector('.shieldFill');
            const healthText = element.querySelector('.healthText');
            
            if (healthBar && healthFill && shieldFill) {
                const currentShield = unit.currentShield;
                const totalMax = unit.maxHp + currentShield;
                
                // Calculate percentages
                const hpPercent = (unit.currentHp / totalMax) * 100;
                const shieldPercent = (currentShield / totalMax) * 100;
                
                // Update health bar width and position
                healthFill.style.width = `${hpPercent}%`;
                healthFill.style.position = 'absolute';
                healthFill.style.left = '0';
                
                // Update shield bar
                if (currentShield > 0) {
                    shieldFill.style.display = 'block';
                    shieldFill.style.width = `${shieldPercent}%`;
                    shieldFill.style.position = 'absolute';
                    shieldFill.style.left = `${hpPercent}%`;
                } else {
                    shieldFill.style.display = 'none';
                }
                
                // Change health bar color based on HP percentage (of max HP, not total)
                const hpOfMaxPercent = (unit.currentHp / unit.maxHp) * 100;
                if (hpOfMaxPercent > 60) {
                    healthFill.style.background = 'linear-gradient(90deg, #00ff88 0%, #00cc66 100%)';
                } else if (hpOfMaxPercent > 30) {
                    healthFill.style.background = 'linear-gradient(90deg, #ffaa00 0%, #ff8800 100%)';
                } else {
                    healthFill.style.background = 'linear-gradient(90deg, #ff4444 0%, #cc0000 100%)';
                }
            }
            
            if (healthText) {
                // Show current HP with shield if present
                if (unit.currentShield > 0) {
                    healthText.textContent = `${Math.floor(unit.currentHp)}+${Math.floor(unit.currentShield)}`;
                } else {
                    healthText.textContent = `${Math.floor(unit.currentHp)}`;
                }
            }
            
            // Update action bar fill
            const actionFill = element.querySelector('.actionFill');
            if (actionFill) {
                const actionPercent = Math.min((unit.actionBar / 10000) * 100, 100);
                actionFill.style.width = `${actionPercent}%`;
                
                // Glow when ready
                if (actionPercent >= 100) {
                    actionFill.style.boxShadow = '0 0 10px rgba(77, 208, 225, 1)';
                } else {
                    actionFill.style.boxShadow = '0 0 5px rgba(77, 208, 225, 0.5)';
                }
            }
            
            // Update buffs and debuffs display only if changed
            const currentBuffDebuffState = JSON.stringify({
                buffs: unit.buffs.map(b => ({ name: b.name, duration: b.duration, shieldAmount: b.shieldAmount })),
                debuffs: unit.debuffs.map(d => ({ name: d.name, duration: d.duration }))
            });
            
            if (unit._lastBuffDebuffState !== currentBuffDebuffState) {
                unit._lastBuffDebuffState = currentBuffDebuffState;
                
                // Hide tooltip when buff/debuff state changes since icons are being recreated
                this.hideBuffDebuffTooltip();
                
                const buffDebuffContainer = element.querySelector('.buffDebuffContainer');
                if (buffDebuffContainer) {
                    buffDebuffContainer.innerHTML = '';
                    
                    // Display buffs first
                    unit.buffs.forEach((buff, index) => {
                        const buffDiv = document.createElement('div');
                        buffDiv.className = 'buffIcon';
                        const iconName = this.getBuffIconName(buff.name);
                        
                        buffDiv.innerHTML = `
                            <img src="https://puzzle-drops.github.io/TEVE/img/buffs/${iconName}.png" 
                                 alt="${buff.name}"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><rect fill=\\'%2300c3ff\\' width=\\'24\\' height=\\'24\\'/><text x=\\'12\\' y=\\'16\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'12\\'>B</text></svg>'">
                            ${buff.duration > 0 ? `<div class="buffDebuffDuration">${buff.duration}</div>` : ''}
                        `;
                        
                        // Add tooltip on hover
                        buffDiv.onmouseenter = (e) => {
                            this.showBuffDebuffTooltip(e, buff, true);
                        };
                        
                        buffDiv.onmouseleave = () => {
                            this.hideBuffDebuffTooltip();
                        };
                        
                        buffDebuffContainer.appendChild(buffDiv);
                    });
                    
                    // Display debuffs after buffs
                    unit.debuffs.forEach((debuff, index) => {
                        const debuffDiv = document.createElement('div');
                        debuffDiv.className = 'debuffIcon';
                        const iconName = this.getDebuffIconName(debuff.name);
                        
                        debuffDiv.innerHTML = `
                            <img src="https://puzzle-drops.github.io/TEVE/img/buffs/${iconName}.png" 
                                 alt="${debuff.name}"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><rect fill=\\'%23ff4444\\' width=\\'24\\' height=\\'24\\'/><text x=\\'12\\' y=\\'16\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'12\\'>D</text></svg>'">
                            ${debuff.duration > 0 ? `<div class="buffDebuffDuration">${debuff.duration}</div>` : ''}
                        `;
                        
                        // Add tooltip on hover
                        debuffDiv.onmouseenter = (e) => {
                            this.showBuffDebuffTooltip(e, debuff, false);
                        };
                        
                        debuffDiv.onmouseleave = () => {
                            this.hideBuffDebuffTooltip();
                        };
                        
                        buffDebuffContainer.appendChild(debuffDiv);
                    });
                }
            }
        });
    }

    getBuffIconName(buffName) {
    const iconMap = {
        'Boss': 'boss',
        'Increase Attack': 'increase_attack',
        'Increase Speed': 'increase_speed',
        'Increase Defense': 'increase_defense',
        'Immune': 'immune',
        'Shield': 'shield',
        'Frost Armor': 'frost_armor'
    };
    return iconMap[buffName] || 'buff';
}

    getDebuffIconName(debuffName) {
        const iconMap = {
            'Reduce Attack': 'reduce_attack',
            'Reduce Speed': 'reduce_speed',
            'Reduce Defense': 'reduce_defense',
            'Blight': 'blight',
            'Bleed': 'bleed',
            'Stun': 'stun',
            'Taunt': 'taunt',
            'Silence': 'silence',
            'Mark': 'mark'
        };
        return iconMap[debuffName] || 'debuff';
    }

    showBuffDebuffTooltip(event, buffDebuff, isBuff) {
        // Ensure we have valid buff/debuff data
        if (!buffDebuff || !buffDebuff.name) {
            console.warn('Invalid buff/debuff data for tooltip');
            return;
        }

        let tooltip = document.getElementById('buffDebuffTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'buffDebuffTooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(10, 15, 26, 0.95);
                border: 2px solid #2a6a8a;
                padding: 12px;
                border-radius: 4px;
                z-index: 10002;
                pointer-events: none;
                max-width: 300px;
                display: none;
            `;
            const scaleWrapper = document.getElementById('scaleWrapper');
            if (scaleWrapper) {
                scaleWrapper.appendChild(tooltip);
            } else {
                document.body.appendChild(tooltip);
            }
        }
        
        const descriptions = {
    // Buffs
    'Boss': '50% stun resistance, 25% damage reduction',
    'Increase Attack': '+50% attack damage',
    'Increase Speed': '+33% action bar progress',
    'Increase Defense': '+25% damage reduction, and -25% damage taken',
    'Immune': 'Cannot gain debuffs',
    'Shield': `Absorbs ${Math.round(buffDebuff.shieldAmount || 0)} damage`,
    'Frost Armor': '+25% damage reduction, attackers are slowed',
            
            // Debuffs
            'Reduce Attack': '-50% attack damage',
            'Reduce Speed': '-33% action bar progress',
            'Reduce Defense': '-25% damage reduction, and +25% damage taken',
            'Blight': 'No health regen, cannot be healed',
            'Bleed': 'Takes 5% max HP damage each turn',
            'Stun': 'Cannot act on next turn',
            'Taunt': 'Must attack the unit that taunted',
            'Silence': 'Forces skill 1 attack on random enemy',
            'Mark': '+25% damage taken, cannot gain buffs or evade'
        };
        
        tooltip.className = isBuff ? 'buff' : 'debuff';
        tooltip.innerHTML = `
            <div class="buffDebuffTooltipTitle">${buffDebuff.name}</div>
            <div class="buffDebuffTooltipDesc">${descriptions[buffDebuff.name] || 'Unknown effect'}</div>
            ${buffDebuff.duration > 0 ? `<div style="margin-top: 5px; color: #6a9aaa;">Turns remaining: ${buffDebuff.duration}</div>` : ''}
        `;
        
        tooltip.style.display = 'block';

        // Position tooltip using game coordinates
        const rect = event.target.getBoundingClientRect();
        const gameCoords = window.scalingSystem.viewportToGame(rect.left, rect.bottom + 5);
        tooltip.style.left = gameCoords.x + 'px';
        tooltip.style.top = gameCoords.y + 'px';

        // Adjust if tooltip goes off game area
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        const tooltipGameCoords = window.scalingSystem.viewportToGame(tooltipRect.left, tooltipRect.top);
        if (tooltipGameCoords.x + tooltipWidth > 1920) {
            tooltip.style.left = (1920 - tooltipWidth - 10) + 'px';
        }
        if (tooltipGameCoords.y + tooltipHeight > 1080) {
            const topCoords = window.scalingSystem.viewportToGame(rect.left, rect.top - 5);
            tooltip.style.top = (topCoords.y - tooltipHeight) + 'px';
        }
    }

    hideBuffDebuffTooltip() {
        const tooltip = document.getElementById('buffDebuffTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
            // Clear tooltip content to prevent stale data
            tooltip.innerHTML = '';
        }
    }
}
