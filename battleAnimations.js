// battleAnimations.js - Animation system for TEVE battles

class BattleAnimations {
    constructor(battle) {
        this.battle = battle;
        // Add buff/debuff text queue
        this.buffDebuffTextQueues = new Map(); // Map of unit -> queue
        this.processingUnits = new Set(); // Track which units are processing
    }

    showDamageAnimation(attacker, target, damage, damageType) {
        // Show damage number
        const targetId = target.isEnemy ? `enemy${target.position + 1}` : `party${target.position + 1}`;
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            // Get health bar position for damage number spawn
            const healthBar = targetElement.querySelector('.healthBar');
            const healthFill = healthBar ? healthBar.querySelector('.healthFill') : null;
            
            if (healthBar && healthFill) {
                // Calculate position at end of health fill
                const fillWidth = parseFloat(healthFill.style.width || '100');
                const fillPixelWidth = (healthBar.offsetWidth * fillWidth) / 100;
                
                // Create damage number
                const damageNum = document.createElement('div');
                damageNum.className = 'damageNumber';
                damageNum.textContent = `-${damage}`;
                
                // Add damage type class for color
                if (damageType === 'physical') damageNum.classList.add('physical');
                else if (damageType === 'magical') damageNum.classList.add('magical');
                else if (damageType === 'pure') damageNum.classList.add('pure');
                else damageNum.classList.add('physical'); // default
                
                // Position at end of health fill
                damageNum.style.left = `${54 + fillPixelWidth}px`; // 54px is the healthBar left offset
                damageNum.style.top = '0px'; // Start from health bar position
                
                targetElement.appendChild(damageNum);
                
                // Remove after animation
                setTimeout(() => {
                    if (damageNum.parentNode) {
                        damageNum.remove();
                    }
                }, 1500);
            }
        }
        
        // Animate attacker lunge
        const attackerId = attacker.isEnemy ? `enemy${attacker.position + 1}` : `party${attacker.position + 1}`;
        const attackerElement = document.getElementById(attackerId);
        
        if (attackerElement) {
            const attackerAnimContainer = attackerElement.querySelector('.unitAnimationContainer');
            if (attackerAnimContainer) {
                // Add directional lunge class based on attacker's side
                if (attacker.isEnemy) {
                    attackerAnimContainer.classList.add('unit-lunge-left');
                } else {
                    attackerAnimContainer.classList.add('unit-lunge-right');
                }
                setTimeout(() => {
                    attackerAnimContainer.classList.remove('unit-lunge-left', 'unit-lunge-right');
                }, 600);
            }
        }
        
        // Animate target recoil
        if (targetElement) {
            const targetAnimContainer = targetElement.querySelector('.unitAnimationContainer');
            if (targetAnimContainer) {
                // Add directional recoil class based on target's side
                if (target.isEnemy) {
                    targetAnimContainer.classList.add('unit-recoil-right');
                } else {
                    targetAnimContainer.classList.add('unit-recoil-left');
                }
                setTimeout(() => {
                    targetAnimContainer.classList.remove('unit-recoil-left', 'unit-recoil-right');
                }, 600);
            }
        }
    }

    showDodgeAnimation(target) {
        const targetId = target.isEnemy ? `enemy${target.position + 1}` : `party${target.position + 1}`;
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            // Create dodge text
            const dodgeText = document.createElement('div');
            dodgeText.className = 'dodgeText';
            dodgeText.textContent = 'Dodge!';
            dodgeText.style.cssText = `
                position: absolute;
                left: 50%;
                top: 30%;
                transform: translateX(-50%);
                color: #4dd0e1;
                font-size: 24px;
                font-weight: bold;
                text-shadow: 0 0 10px rgba(77, 208, 225, 0.8);
                animation: dodgeFloat 1s ease-out;
                pointer-events: none;
                z-index: 100;
            `;
            
            targetElement.appendChild(dodgeText);
            
            // Animate target dodge
            const animContainer = targetElement.querySelector('.unitAnimationContainer');
            if (animContainer) {
                animContainer.classList.add('unit-dodge');
                setTimeout(() => {
                    animContainer.classList.remove('unit-dodge');
                }, 600);
            }
            
            // Remove dodge text after animation
            setTimeout(() => {
                if (dodgeText.parentNode) {
                    dodgeText.remove();
                }
            }, 1000);
        }
    }

showSpellAnimation(caster, spellName, effects, abilityId) {
        // Clear any pending buff/debuff texts for the caster
        this.clearUnitQueue(caster);
        
    // Clear any existing spell animations first
    document.querySelectorAll('.spellText').forEach(text => text.remove());
    
    const elementId = caster.isEnemy ? `enemy${caster.position + 1}` : `party${caster.position + 1}`;
    const unitSlot = document.getElementById(elementId);
    
    if (unitSlot) {
        // Get animation container
        const animContainer = unitSlot.querySelector('.unitAnimationContainer');
        if (!animContainer) return;
        
        // Clear any existing spell text in this container
        const existingSpellText = animContainer.querySelector('.spellText');
        if (existingSpellText) {
            existingSpellText.remove();
        }
        
        // Check if effects contains any buff_* or debuff_* effects
        const hasBuff = effects.some(effect => effect.startsWith('buff_'));
        const hasDebuff = effects.some(effect => effect.startsWith('debuff_'));
        const hasDamage = effects.includes('physical') || effects.includes('magical') || effects.includes('pure');
        
        // Determine animation type based on spell effects with priority
        let animationClass = 'casting-damage'; // default
        
        // Priority order: damage > heal > shield > buff > debuff
        if (hasDamage) {
            animationClass = 'casting-damage';
        } else if (effects.includes('heal')) {
            animationClass = 'casting-heal';
        } else if (effects.includes('buff_shield')) {
            animationClass = 'casting-shield';
        } else if (hasBuff) {
            animationClass = 'casting-buff';
        } else if (hasDebuff) {
            animationClass = 'casting-debuff';
        }
        
        // Remove any existing animation classes
        animContainer.classList.remove('casting-damage', 'casting-heal', 'casting-shield', 'casting-buff', 'casting-debuff');
        
        // Add animation
        animContainer.classList.add(animationClass);
        setTimeout(() => animContainer.classList.remove(animationClass), 800);
        
        // Create spell text inside animation container
        const spellText = document.createElement('div');
        spellText.className = 'spellText';

        // Only add icon if we have an abilityId (not for passives or special cases)
        if (abilityId) {
            // Create spell icon
            const spellIcon = document.createElement('img');
            spellIcon.src = `https://puzzle-drops.github.io/TEVE/img/spells/${abilityId}.png`;
            spellIcon.className = 'spellIcon';
            spellIcon.onerror = () => spellIcon.style.display = 'none'; // Hide if image fails to load
            
            // Create text span
            const spellNameText = document.createElement('span');
            spellNameText.textContent = spellName;
            spellNameText.className = 'spellNameText';
            
            // Add both to spell text (flex container handles the layout)
            spellText.appendChild(spellIcon);
            spellText.appendChild(spellNameText);
        } else {
            // Fallback to text only (for passives or when no abilityId provided)
            spellText.textContent = spellName;
        }
        
        // Add appropriate color class based on spell type with priority
        if (effects.includes('physical')) {
            spellText.classList.add('damage-physical');
        } else if (effects.includes('magical')) {
            spellText.classList.add('damage-magical');
        } else if (effects.includes('pure')) {
            spellText.classList.add('damage-pure');
        } else if (effects.includes('heal')) {
            spellText.classList.add('heal');
        } else if (effects.includes('buff_shield')) {
            spellText.classList.add('shield');
        } else if (hasBuff) {
            spellText.classList.add('buff');
        } else if (hasDebuff) {
            spellText.classList.add('debuff');
        } else {
            spellText.classList.add('damage-physical'); // default
        }
        
        animContainer.appendChild(spellText);
        
        // Add empty item to queue to create a gap before buff/debuff text
        this.queueBuffDebuffText(caster, '', false);
        
        // Remove spell text after animation
        setTimeout(() => {
            if (spellText.parentNode) {
                spellText.remove();
            }
        }, 1500); // Reduced from 3000 to match the animation duration
    }
}

    triggerDeathAnimation(unit) {
        const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
        const element = document.getElementById(elementId);
        
        if (element) {
            const animContainer = element.querySelector('.unitAnimationContainer');
            if (animContainer) {
                const unitDiv = animContainer.querySelector('.unit');
                const unitShadow = animContainer.querySelector('.unitShadow');
                
                if (unitDiv && !unitDiv.classList.contains('dying')) {
                    // Only add dying class if it doesn't already have it
                    unitDiv.classList.add('dying');
                    
                    // Hide shadow immediately when dying
                    if (unitShadow) {
                        unitShadow.style.display = 'none';
                    }
                    
                    // Hide UI elements after animation
                    setTimeout(() => {
                        // Double-check element still exists and unit is still dead
                        const currentElement = document.getElementById(elementId);
                        if (currentElement && unit.isDead) {
                            const healthBar = currentElement.querySelector('.healthBar');
                            const actionBar = currentElement.querySelector('.actionBar');
                            const levelIndicator = currentElement.querySelector('.levelIndicator');
                            const buffDebuffContainer = currentElement.querySelector('.buffDebuffContainer');
                            
                            if (healthBar) healthBar.style.display = 'none';
                            if (actionBar) actionBar.style.display = 'none';
                            if (levelIndicator) levelIndicator.style.display = 'none';
                            if (buffDebuffContainer) buffDebuffContainer.style.display = 'none';
                        }
                    }, 800); // Match CSS animation duration
                }
            }
        }
    }

    updateStunVisuals(unit) {
        const elementId = unit.isEnemy ? `enemy${unit.position + 1}` : `party${unit.position + 1}`;
        const element = document.getElementById(elementId);
        
        if (!element) return;
        
        const animContainer = element.querySelector('.unitAnimationContainer');
        if (!animContainer) return;
        
        const unitDiv = animContainer.querySelector('.unit');
        if (!unitDiv) return;
        
        const isStunned = unit.debuffs.some(d => d.name === 'Stun' || d.stunned);
        
        if (isStunned) {
            // Apply stun visuals to unit img only
            const tiltDegrees = unit.isEnemy ? -4 : 4;
            unitDiv.style.transform = `rotate(${tiltDegrees}deg)`;
            unitDiv.style.opacity = '0.75';
            unitDiv.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        } else {
            // Remove stun visuals from unit img
            unitDiv.style.transform = '';
            unitDiv.style.opacity = '';
            unitDiv.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        }
    }

    applyBossScaling(enemies, currentWave) {

        // Check if boss scaling is enabled
        if (!this.battle.enableBossScaling) {
            return;
        }

        // Remove any existing boss scaling classes
        for (let i = 1; i <= 5; i++) {
            const element = document.getElementById(`enemy${i}`);
            if (element) {
                element.classList.remove('boss-wave3', 'boss-wave5');
            }
        }

        // Check if first enemy is a boss and apply appropriate scaling
        if (enemies.length > 0 && enemies[0] && enemies[0].source.isBoss) {
            const element = document.getElementById('enemy1');
            if (element) {
                // Wave 3 (index 2) = 125% scale
                if (currentWave === 2) {
                    element.classList.add('boss-wave3');
                }
                // Wave 5 (index 4) = 150% scale
                else if (currentWave === 4) {
                    element.classList.add('boss-wave5');
                }
            }
        }
    }

    removeBossScaling() {
        // Remove boss scaling classes from all enemy slots
        for (let i = 1; i <= 5; i++) {
            const element = document.getElementById(`enemy${i}`);
            if (element) {
                element.classList.remove('boss-wave3', 'boss-wave5');
            }
        }
    }

    queueBuffDebuffText(target, text, isDebuff = false) {
        // Get or create queue for this unit
        if (!this.buffDebuffTextQueues.has(target)) {
            this.buffDebuffTextQueues.set(target, []);
        }
        
        // Add to unit's queue
        const queue = this.buffDebuffTextQueues.get(target);
        queue.push({
            target: target,
            text: text,
            isDebuff: isDebuff
        });
        
        // Start processing if not already doing so for this unit
        if (!this.processingUnits.has(target)) {
            this.processBuffDebuffQueue(target);
        }
    }
    
    processBuffDebuffQueue(unit) {
        const queue = this.buffDebuffTextQueues.get(unit);
        
        if (!queue || queue.length === 0) {
            this.processingUnits.delete(unit);
            this.buffDebuffTextQueues.delete(unit);
            return;
        }
        
        this.processingUnits.add(unit);
        
        // Get next item from queue
        const item = queue.shift();
        
        // Show the text only if it's not empty
        if (item.text !== '') {
            this.showBuffDebuffText(item.target, item.text, item.isDebuff);
        }
        
        // Process next item after a delay
        setTimeout(() => {
            this.processBuffDebuffQueue(unit);
        }, 200); // Reduced to 200ms for faster processing
    }
    
    clearUnitQueue(unit) {
        // Clear any pending texts for this unit
        if (this.buffDebuffTextQueues.has(unit)) {
            this.buffDebuffTextQueues.set(unit, []);
        }
    }
    
    showBuffDebuffText(target, text, isDebuff = false) {
        const elementId = target.isEnemy ? `enemy${target.position + 1}` : `party${target.position + 1}`;
        const unitSlot = document.getElementById(elementId);
        
        if (unitSlot) {
            // Get animation container
            const animContainer = unitSlot.querySelector('.unitAnimationContainer');
            if (!animContainer) return;
            
            // Create buff/debuff text
            const buffDebuffText = document.createElement('div');
            buffDebuffText.className = 'buffDebuffText';
            buffDebuffText.classList.add(isDebuff ? 'debuff' : 'buff');
            buffDebuffText.textContent = text;
            
            animContainer.appendChild(buffDebuffText);
            
            // Remove text after animation
            setTimeout(() => {
                if (buffDebuffText.parentNode) {
                    buffDebuffText.remove();
                }
            }, 1500); // Match the animation duration
        }
    }
    
}
