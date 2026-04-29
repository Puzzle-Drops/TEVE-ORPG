// tutorial.js - Tutorial and new hero creation functionality
class Tutorial {
    constructor(game) {
        this.game = game;
        this.selectedGender = null;

        // New game tutorial state
        this.isNewGameTutorial = false;
        this.newGameHeroCount = 0;
        
        // Dialogue system properties
        this.currentDialogueQueue = [];
        this.currentDialogueIndex = 0;
        this.isTyping = false;
        this.canContinue = false;
        this.typewriterTimeout = null;
        this.continueTimeout = null;
        
        // Bind the click handler
        this.handleDialogueClick = this.handleDialogueClick.bind(this);

        // Wiki state
        this.currentWikiTopic = 'overview';

        // Male and female name lists for random selection
        this.maleNames = [
            'Marcus', 'Felix', 'Darius', 'Cassius', 'Maximus', 'Lucius', 'Gaius', 
            'Titus', 'Julius', 'Augustus', 'Claudius', 'Nero', 'Hadrian', 'Trajan',
            'Valen', 'Dorian', 'Lysander', 'Theron', 'Orion', 'Atlas', 'Phoenix',
            'Zephyr', 'Cyrus', 'Atticus', 'Evander', 'Leander', 'Xander', 'Caius'
        ];
        
        this.femaleNames = [
            'Luna', 'Aurora', 'Diana', 'Minerva', 'Victoria', 'Livia', 'Julia',
            'Claudia', 'Valeria', 'Flavia', 'Octavia', 'Aurelia', 'Cassia', 'Lyra',
            'Selene', 'Athena', 'Iris', 'Cora', 'Delia', 'Thalia', 'Nyx', 'Aria',
            'Seraphina', 'Lydia', 'Celeste', 'Nova', 'Stella', 'Vera', 'Elara'
        ];

        
    }

    // NPC Click Handler
    handleNPCClick(npcName) {
        const npcNameLower = npcName.toLowerCase();
        
        switch(npcNameLower) {
            case 'squeaky':
                this.showBestiary();
                break;
            case 'arnold':
                // Future implementation for Arnold's shop/services
                console.log('Arnold clicked - not yet implemented');
                break;
            case 'bob':
                this.showWiki();
                break;
            default:
                console.log(`NPC ${npcName} clicked - not yet implemented`);
        }
    }

    // Wiki System
    showWiki() {
        // Create wiki overlay within scaleWrapper
        const scaleWrapper = document.getElementById('scaleWrapper');
        
        const overlay = document.createElement('div');
        overlay.id = 'wikiOverlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 1920px;
            height: 1080px;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create wiki container
        const container = document.createElement('div');
        container.id = 'wikiContainer';
        container.style.cssText = `
            background: rgba(10, 25, 41, 0.98);
            border: 2px solid #2a6a8a;
            border-radius: 8px;
            width: 1920px;
            height: 1080px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 30px rgba(42, 106, 138, 0.5);
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px;
            border-bottom: 2px solid #2a6a8a;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <h1 style="color: #4dd0e1; margin: 0; font-size: 28px;">Bob's Arena Guide</h1>
            <button id="closeWikiBtn" style="
                background: #cc0000;
                color: white;
                border: none;
                padding: 10px 20px;
                font-size: 18px;
                cursor: pointer;
                border-radius: 4px;
            ">✕ Close</button>
        `;

        // Create main content area with sidebar and content
        const mainContent = document.createElement('div');
        mainContent.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

        // Create sidebar
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            width: 350px;
            background: rgba(10, 15, 26, 0.5);
            border-right: 2px solid #2a6a8a;
            padding: 20px;
            overflow-y: auto;
        `;

        // Define wiki topics
        const wikiTopics = [
            { id: 'overview', title: 'Items Overview', icon: '📖' },
            { id: 'properties', title: 'Item Properties', icon: '🔧' },
            { id: 'quality', title: 'Quality System', icon: '💎' },
            { id: 'rarity', title: 'Rarity & Stars', icon: '⭐' },
            { id: 'score', title: 'Item Score', icon: '📊' },
            { id: 'refinement', title: 'Refinement System', icon: '🔨' },
            { id: 'collection', title: 'Collection Log', icon: '📚' },
            { id: 'equipment', title: 'Equipment & Storage', icon: '🎒' },
            { id: 'autosell', title: 'Autosell System', icon: '💰' }
        ];

        // Create topic buttons
        wikiTopics.forEach(topic => {
            const button = document.createElement('button');
            button.className = 'wikiTopicButton';
            if (topic.id === this.currentWikiTopic) {
                button.classList.add('active');
            }
            button.style.cssText = `
                width: 100%;
                padding: 15px;
                margin-bottom: 10px;
                background: ${topic.id === this.currentWikiTopic ? '#0066cc' : '#004499'};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-align: left;
                font-size: 18px;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.2s;
            `;
            button.innerHTML = `<span style="font-size: 24px;">${topic.icon}</span> ${topic.title}`;
            button.onmouseover = () => {
                if (topic.id !== this.currentWikiTopic) {
                    button.style.background = '#0055aa';
                }
            };
            button.onmouseout = () => {
                if (topic.id !== this.currentWikiTopic) {
                    button.style.background = '#004499';
                }
            };
            button.onclick = () => {
                this.showWikiTopic(topic.id);
                // Update button states
                sidebar.querySelectorAll('.wikiTopicButton').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = '#004499';
                });
                button.classList.add('active');
                button.style.background = '#0066cc';
            };
            sidebar.appendChild(button);
        });

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = 'wikiContent';
        contentArea.style.cssText = `
            flex: 1;
            padding: 30px;
            overflow-y: auto;
            color: #b0e0f0;
            font-size: 18px;
            line-height: 1.6;
        `;

        // Assemble container
        mainContent.appendChild(sidebar);
        mainContent.appendChild(contentArea);
        container.appendChild(header);
        container.appendChild(mainContent);
        overlay.appendChild(container);
        scaleWrapper.appendChild(overlay);

        // Event listeners
        document.getElementById('closeWikiBtn').onclick = () => this.closeWiki();

        // Show default topic
        this.showWikiTopic(this.currentWikiTopic);
    }

    closeWiki() {
        const overlay = document.getElementById('wikiOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    showWikiTopic(topicId) {
        this.currentWikiTopic = topicId;
        const content = document.getElementById('wikiContent');
        if (!content) return;

        // Clear existing content
        content.innerHTML = '';

        // Add content based on topic
        switch(topicId) {
            case 'overview':
                this.showWikiOverview(content);
                break;
            case 'properties':
                this.showWikiProperties(content);
                break;
            case 'quality':
                this.showWikiQuality(content);
                break;
            case 'rarity':
                this.showWikiRarity(content);
                break;
            case 'score':
                this.showWikiScore(content);
                break;
            case 'refinement':
                this.showWikiRefinement(content);
                break;
            case 'collection':
                this.showWikiCollection(content);
                break;
            case 'equipment':
                this.showWikiEquipment(content);
                break;
            case 'autosell':
                this.showWikiAutosell(content);
                break;
        }
    }

    showWikiOverview(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Items Overview</h2>
            <p>Items are equipment pieces that provide stat bonuses to heroes when equipped. Each item has specific properties that determine its power and effectiveness.</p>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Key Concepts</h3>
            <ul style="list-style: none; padding: 0;">
                <li style="margin-bottom: 15px;">
                    <span style="color: #ffd700;">⚔️ Equipment Slots</span> - Items can be equipped in one of six slots: Head, Chest, Legs, Weapon, Offhand, or Trinket
                </li>
                <li style="margin-bottom: 15px;">
                    <span style="color: #00ff88;">📊 Stats</span> - Items provide bonuses to various hero statistics like Strength, Agility, Intelligence, HP, Attack, etc.
                </li>
                <li style="margin-bottom: 15px;">
                    <span style="color: #4dd0e1;">💎 Quality</span> - Each stat roll has a quality from 1-5, determining how much of the maximum value is provided
                </li>
                <li style="margin-bottom: 15px;">
                    <span style="color: #d896ff;">⭐ Stars</span> - Perfect quality rolls (5/5) are shown as stars, with color matching the item's rarity
                </li>
                <li style="margin-bottom: 15px;">
                    <span style="color: #ff4444;">🔨 Refinement</span> - Items can be refined once to improve their stats or add new ones
                </li>
            </ul>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Item Generation</h3>
            <p>When an item drops:</p>
            <ol>
                <li>The first stat roll always occurs with random quality (1-5)</li>
                <li>Additional rolls have a chance to occur (45%, 40%, 35% base chances)</li>
                <li>Each successful roll gets a random quality value</li>
                <li>Collection bonuses can improve quality of specific rolls</li>
            </ol>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Visual Indicators</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #4dd0e1;">On Items:</strong>
                    <ul style="margin-top: 10px;">
                        <li>Border color shows rarity</li>
                        <li>Stars (★) indicate perfect rolls</li>
                        <li>Level shown bottom-right</li>
                        <li>Quality % shown top-right</li>
                        <li>Refined items show * top-left</li>
                    </ul>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #4dd0e1;">Rarity Colors:</strong>
                    <ul style="margin-top: 10px;">
                        <li><span style="color: #00ff88;">Green</span> - 1 stat roll</li>
                        <li><span style="color: #00c3ff;">Blue</span> - 2 stat rolls</li>
                        <li><span style="color: #d896ff;">Purple</span> - 3 stat rolls</li>
                        <li><span style="color: #ff4444;">Red</span> - 4 stat rolls</li>
                        <li><span style="color: #ffd700;">Gold</span> - 5 stat rolls (refined only)</li>
                    </ul>
                </div>
            </div>
        `;
    }

    showWikiProperties(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Item Properties</h2>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Core Properties</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <tr style="border-bottom: 1px solid #2a6a8a;">
                    <th style="text-align: left; padding: 10px; color: #4dd0e1;">Property</th>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1;">Description</th>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>ID</strong></td>
                    <td style="padding: 10px;">Unique identifier for the item template</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Name</strong></td>
                    <td style="padding: 10px;">Display name of the item</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Level</strong></td>
                    <td style="padding: 10px;">Numerical value determining base stat values</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Slot</strong></td>
                    <td style="padding: 10px;">Equipment slot where the item can be equipped</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Sell Cost</strong></td>
                    <td style="padding: 10px;">Gold value when selling the item</td>
                </tr>
            </table>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Equipment Slots</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">🎩</div>
                    <strong>Head</strong>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">👕</div>
                    <strong>Chest</strong>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">👖</div>
                    <strong>Legs</strong>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">⚔️</div>
                    <strong>Weapon</strong>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">🛡️</div>
                    <strong>Offhand</strong>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 32px;">💍</div>
                    <strong>Trinket</strong>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Stat Types</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <strong style="color: #ffd700;">Primary Stats:</strong>
                        <ul style="margin-top: 10px;">
                            <li><strong>STR</strong> - Strength</li>
                            <li><strong>AGI</strong> - Agility</li>
                            <li><strong>INT</strong> - Intelligence</li>
                            <li><strong>All Stats</strong> - Increases all three equally</li>
                        </ul>
                    </div>
                    <div>
                        <strong style="color: #ffd700;">Secondary Stats:</strong>
                        <ul style="margin-top: 10px;">
                            <li><strong>HP</strong> - Health Points</li>
                            <li><strong>Attack</strong> - Attack power</li>
                            <li><strong>Attack Speed</strong> - Attack speed %</li>
                            <li><strong>HP Regen</strong> - Health regeneration</li>
                            <li><strong>Armor</strong> - Physical defense</li>
                            <li><strong>Resist</strong> - Magical defense</li>
                        </ul>
                    </div>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Stat Rolls</h3>
            <p>Each item template defines up to 4 possible stat rolls:</p>
            <ul>
                <li><strong>Roll 1</strong> - Primary stat (always present)</li>
                <li><strong>Roll 2</strong> - Secondary stat (45% base chance)</li>
                <li><strong>Roll 3</strong> - Tertiary stat (40% base chance, requires roll 2)</li>
                <li><strong>Roll 4</strong> - Quaternary stat (35% base chance, requires roll 3)</li>
                <li><strong>Roll 5</strong> - Special fifth roll (only from refining perfect items)</li>
            </ul>
        `;
    }

    showWikiQuality(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Quality System</h2>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Quality Values</h3>
            <p>Each active stat roll has a quality value from 1 to 5:</p>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin: 20px 0;">
                <table style="width: 100%; text-align: center;">
                    <tr>
                        <th style="color: #4dd0e1; padding: 10px;">Quality</th>
                        <th style="color: #4dd0e1; padding: 10px;">Percentage</th>
                        <th style="color: #4dd0e1; padding: 10px;">Example (100 max)</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">1/5</td>
                        <td style="padding: 10px;">20%</td>
                        <td style="padding: 10px;">20</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">2/5</td>
                        <td style="padding: 10px;">40%</td>
                        <td style="padding: 10px;">40</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">3/5</td>
                        <td style="padding: 10px;">60%</td>
                        <td style="padding: 10px;">60</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">4/5</td>
                        <td style="padding: 10px;">80%</td>
                        <td style="padding: 10px;">80</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; color: #ffd700;">5/5 ★</td>
                        <td style="padding: 10px; color: #ffd700;">100%</td>
                        <td style="padding: 10px; color: #ffd700;">100</td>
                    </tr>
                </table>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Quality Calculation</h3>
            <p>The actual stat value is calculated as:</p>
            <div style="background: rgba(0, 0, 0, 0.5); padding: 15px; border-radius: 4px; margin: 20px 0; font-family: monospace;">
                actual_value = Math.floor(max_value × (quality / 5))
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Item Quality Percentage</h3>
            <p>Overall item quality is the average quality of all active rolls:</p>
            <div style="background: rgba(0, 0, 0, 0.5); padding: 15px; border-radius: 4px; margin: 20px 0; font-family: monospace;">
                quality% = Math.floor((sum of all roll qualities / number of active rolls) / 5 × 100)
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Examples</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #00ff88;">Green Item (1 roll)</strong>
                    <ul style="margin-top: 10px;">
                        <li>Roll 1: Quality 3/5</li>
                        <li>Item Quality: 60%</li>
                        <li>Stars: 0</li>
                    </ul>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #00c3ff;">Blue Item (2 rolls)</strong>
                    <ul style="margin-top: 10px;">
                        <li>Roll 1: Quality 5/5 ★</li>
                        <li>Roll 2: Quality 3/5</li>
                        <li>Item Quality: 80%</li>
                        <li>Stars: 1</li>
                    </ul>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #d896ff;">Purple Item (3 rolls)</strong>
                    <ul style="margin-top: 10px;">
                        <li>Roll 1: Quality 5/5 ★</li>
                        <li>Roll 2: Quality 5/5 ★</li>
                        <li>Roll 3: Quality 4/5</li>
                        <li>Item Quality: 93%</li>
                        <li>Stars: 2</li>
                    </ul>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 4px;">
                    <strong style="color: #ff4444;">Red Item (4 rolls)</strong>
                    <ul style="margin-top: 10px;">
                        <li>Roll 1-4: Quality 5/5 ★</li>
                        <li>Item Quality: 100%</li>
                        <li>Stars: 4</li>
                        <li>Perfect item!</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Quality Display</h3>
            <ul>
                <li>Individual rolls show quality as percentage in tooltips (20%, 40%, 60%, 80%, 100%)</li>
                <li>Overall item quality shown as aggregate percentage in top-right corner</li>
                <li>Perfect rolls (5/5) are highlighted and contribute to star count</li>
            </ul>
        `;
    }

    showWikiRarity(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Rarity & Stars System</h2>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Rarity Tiers</h3>
            <p>Item rarity is determined by the number of active stat rolls:</p>
            
            <div style="margin-top: 20px;">
                <div style="background: rgba(0, 255, 136, 0.1); border: 2px solid #00ff88; padding: 20px; margin-bottom: 15px; border-radius: 4px;">
                    <h4 style="color: #00ff88; margin: 0;">Green Items</h4>
                    <p style="margin: 10px 0;">1 stat roll - Common items with a single stat bonus</p>
                    <div style="font-size: 24px;">Example: +25 Strength</div>
                </div>
                
                <div style="background: rgba(0, 195, 255, 0.1); border: 2px solid #00c3ff; padding: 20px; margin-bottom: 15px; border-radius: 4px;">
                    <h4 style="color: #00c3ff; margin: 0;">Blue Items</h4>
                    <p style="margin: 10px 0;">2 stat rolls - Uncommon items with two stat bonuses</p>
                    <div style="font-size: 24px;">Example: +25 Strength, +18 HP</div>
                </div>
                
                <div style="background: rgba(216, 150, 255, 0.1); border: 2px solid #d896ff; padding: 20px; margin-bottom: 15px; border-radius: 4px;">
                    <h4 style="color: #d896ff; margin: 0;">Purple Items</h4>
                    <p style="margin: 10px 0;">3 stat rolls - Rare items with three stat bonuses</p>
                    <div style="font-size: 24px;">Example: +25 Strength, +18 HP, +12 Attack</div>
                </div>
                
                <div style="background: rgba(255, 68, 68, 0.1); border: 2px solid #ff4444; padding: 20px; margin-bottom: 15px; border-radius: 4px;">
                    <h4 style="color: #ff4444; margin: 0;">Red Items</h4>
                    <p style="margin: 10px 0;">4 stat rolls - Epic items with four stat bonuses</p>
                    <div style="font-size: 24px;">Example: +25 Strength, +18 HP, +12 Attack, +8% Attack Speed</div>
                </div>
                
                <div style="background: rgba(255, 215, 0, 0.1); border: 2px solid #ffd700; padding: 20px; border-radius: 4px;">
                    <h4 style="color: #ffd700; margin: 0;">Gold Items</h4>
                    <p style="margin: 10px 0;">5 stat rolls - Legendary items (only achievable through refinement)</p>
                    <div style="font-size: 24px;">Example: All of the above + <span style="color: #ffd700;">+10 All Stats</span></div>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Star System</h3>
            <p>Stars represent perfect quality rolls (5/5):</p>
            
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 15px;">
                        <span style="font-size: 24px; color: #ffd700;">★</span> = One roll with perfect 5/5 quality (100%)
                    </li>
                    <li style="margin-bottom: 15px;">
                        <span style="font-size: 24px; color: #ffd700;">★★</span> = Two rolls with perfect quality
                    </li>
                    <li style="margin-bottom: 15px;">
                        <span style="font-size: 24px; color: #ffd700;">★★★</span> = Three rolls with perfect quality
                    </li>
                    <li style="margin-bottom: 15px;">
                        <span style="font-size: 24px; color: #ffd700;">★★★★</span> = Four rolls with perfect quality (Perfect red item!)
                    </li>
                </ul>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #2a6a8a;">
                    <strong>Visual Details:</strong>
                    <ul style="margin-top: 10px;">
                        <li>Star color matches item rarity (green, blue, purple, red, or gold)</li>
                        <li>Stars use -3px letter-spacing for compact display</li>
                        <li>Displayed in bottom-left corner of item slots</li>
                        <li>Maximum stars = number of active rolls</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Drop Chances</h3>
            <p>When an item drops, additional rolls are determined by chance:</p>
            <table style="width: 100%; margin-top: 20px;">
                <tr>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1;">Roll</th>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1;">Base Chance</th>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1;">Requirement</th>
                </tr>
                <tr style="border-top: 1px solid #2a6a8a;">
                    <td style="padding: 10px;">Roll 1</td>
                    <td style="padding: 10px;">100%</td>
                    <td style="padding: 10px;">Always occurs</td>
                </tr>
                <tr style="border-top: 1px solid #1a4a6a;">
                    <td style="padding: 10px;">Roll 2</td>
                    <td style="padding: 10px;">45%</td>
                    <td style="padding: 10px;">-</td>
                </tr>
                <tr style="border-top: 1px solid #1a4a6a;">
                    <td style="padding: 10px;">Roll 3</td>
                    <td style="padding: 10px;">40%</td>
                    <td style="padding: 10px;">Only if Roll 2 succeeded</td>
                </tr>
                <tr style="border-top: 1px solid #1a4a6a;">
                    <td style="padding: 10px;">Roll 4</td>
                    <td style="padding: 10px;">35%</td>
                    <td style="padding: 10px;">Only if Roll 3 succeeded</td>
                </tr>
            </table>
            <p style="margin-top: 15px;"><em>Note: These chances can be increased by collection bonuses!</em></p>
        `;
    }

    showWikiScore(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Item Score</h2>
            
            <p>Item score provides a quick numerical comparison value for items. It combines level, number of rolls, and quality into a single number.</p>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Score Formula</h3>
            <div style="background: rgba(0, 0, 0, 0.5); padding: 20px; border-radius: 4px; margin: 20px 0; font-family: monospace; font-size: 20px; text-align: center;">
                Score = Math.floor((Level × Number of Rolls) × (Quality% / 100))
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Score Examples</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #00ff88;">Example 1: Green Item</h4>
                    <ul style="margin-top: 10px;">
                        <li>Level: 100</li>
                        <li>Rolls: 1</li>
                        <li>Quality: 60%</li>
                        <li><strong>Score: 60</strong></li>
                    </ul>
                    <div style="margin-top: 10px; padding: 10px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                        (100 × 1) × (60 / 100) = 60
                    </div>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #00c3ff;">Example 2: Blue Item</h4>
                    <ul style="margin-top: 10px;">
                        <li>Level: 100</li>
                        <li>Rolls: 2</li>
                        <li>Quality: 80%</li>
                        <li><strong>Score: 160</strong></li>
                    </ul>
                    <div style="margin-top: 10px; padding: 10px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                        (100 × 2) × (80 / 100) = 160
                    </div>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #d896ff;">Example 3: Purple Item</h4>
                    <ul style="margin-top: 10px;">
                        <li>Level: 150</li>
                        <li>Rolls: 3</li>
                        <li>Quality: 73%</li>
                        <li><strong>Score: 328</strong></li>
                    </ul>
                    <div style="margin-top: 10px; padding: 10px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                        (150 × 3) × (73 / 100) = 328
                    </div>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #ff4444;">Example 4: Perfect Red Item</h4>
                    <ul style="margin-top: 10px;">
                        <li>Level: 200</li>
                        <li>Rolls: 4</li>
                        <li>Quality: 100%</li>
                        <li><strong>Score: 800</strong></li>
                    </ul>
                    <div style="margin-top: 10px; padding: 10px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                        (200 × 4) × (100 / 100) = 800
                    </div>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Using Item Score</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <p><strong>Item score is useful for:</strong></p>
                <ul style="margin-top: 15px;">
                    <li style="margin-bottom: 10px;">📊 <strong>Quick Comparison</strong> - Higher score generally means better item</li>
                    <li style="margin-bottom: 10px;">📦 <strong>Sorting Items</strong> - Default sort order uses item score</li>
                    <li style="margin-bottom: 10px;">💰 <strong>Autosell Decisions</strong> - Can set minimum score thresholds</li>
                    <li style="margin-bottom: 10px;">🎯 <strong>Upgrade Targets</strong> - Identify lowest score items to replace</li>
                </ul>
                
                <div style="margin-top: 20px; padding: 15px; background: rgba(255, 215, 0, 0.1); border: 1px solid #ffd700; border-radius: 4px;">
                    <strong style="color: #ffd700;">⚠️ Important Note:</strong>
                    <p style="margin-top: 10px;">Item score is a general guideline. Sometimes a lower score item might be better for your hero if it has the specific stats they need (like mainstat bonuses).</p>
                </div>
            </div>
        `;
    }

    showWikiRefinement(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Refinement System</h2>
            
            <p>Items can be refined once to improve their power. Refined items are marked with a <span style="color: #ffd700;">*</span> symbol.</p>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Refinement Cost</h3>
            <div style="background: rgba(0, 0, 0, 0.5); padding: 20px; border-radius: 4px; margin: 20px 0; font-family: monospace; font-size: 18px; text-align: center;">
                Cost = Math.floor((Level + (Level × Quality%)) × 500) × 2
            </div>
            
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <strong>Example Costs:</strong>
                <ul style="margin-top: 10px;">
                    <li>Level 100, 60% quality: 160,000 gold</li>
                    <li>Level 200, 80% quality: 360,000 gold</li>
                    <li>Level 300, 100% quality: 600,000 gold</li>
                </ul>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Refinement Effects</h3>
            <p>The effect depends on the current state of the item:</p>
            
            <div style="margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #00ff88;">
                    <h4 style="color: #00ff88; margin: 0;">Items with &lt; 4 rolls</h4>
                    <p style="margin: 10px 0;"><strong>Effect:</strong> Adds a new roll with random quality (1-5)</p>
                    <div style="background: rgba(0, 0, 0, 0.5); padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <strong>Example:</strong> Green item → Blue item<br>
                        Blue item → Purple item<br>
                        Purple item → Red item
                    </div>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #4dd0e1;">
                    <h4 style="color: #4dd0e1; margin: 0;">4-roll items (not perfect)</h4>
                    <p style="margin: 10px 0;"><strong>Effect:</strong> Sets the lowest quality roll to 5/5</p>
                    <div style="background: rgba(0, 0, 0, 0.5); padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <strong>Example:</strong> Red item with qualities 5/5, 4/5, 3/5, 2/5<br>
                        After refine: 5/5, 4/5, 3/5, <span style="color: #ffd700;">5/5</span> ★
                    </div>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; border-left: 4px solid #ffd700;">
                    <h4 style="color: #ffd700; margin: 0;">Perfect 4-star items</h4>
                    <p style="margin: 10px 0;"><strong>Effect:</strong> Adds a 5th roll: <span style="color: #ffd700;">+10 All Stats</span></p>
                    <div style="background: rgba(0, 0, 0, 0.5); padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <strong>Result:</strong> Item becomes <span style="color: #ffd700;">Gold rarity</span><br>
                        The only way to achieve 5-roll items!<br>
                        +10 STR, +10 AGI, +10 INT (always perfect quality)
                    </div>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Refinement Strategy</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #00ff88;">Best Value</h4>
                    <p>Refining items with fewer rolls gives the biggest improvement:</p>
                    <ul style="margin-top: 10px;">
                        <li>Green → Blue: +100% rolls</li>
                        <li>Blue → Purple: +50% rolls</li>
                        <li>Purple → Red: +33% rolls</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #ff4444;">Best Power</h4>
                    <p>Refining perfect 4-star items creates the strongest items:</p>
                    <ul style="margin-top: 10px;">
                        <li>Becomes gold rarity</li>
                        <li>+10 to all primary stats</li>
                        <li>Maximum possible item power</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Refinement Tips</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 15px;">💡 <strong>Check the preview</strong> - See exactly what will happen before confirming</li>
                    <li style="margin-bottom: 15px;">💰 <strong>Save gold</strong> - High level items are expensive to refine</li>
                    <li style="margin-bottom: 15px;">🎯 <strong>Target key slots</strong> - Weapon and mainstat items often give biggest impact</li>
                    <li style="margin-bottom: 15px;">⭐ <strong>Perfect items are special</strong> - Consider saving perfect 4-stars for gold upgrade</li>
                    <li style="margin-bottom: 15px;">🚫 <strong>One time only</strong> - Items can only be refined once, choose wisely!</li>
                </ul>
            </div>
        `;
    }

    showWikiCollection(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Collection Log System</h2>
            
            <p>The Collection Log tracks when you find items with ALL perfect quality rolls. It provides permanent bonuses to future item drops!</p>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">How Collection Works</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <p><strong>Items are collected when:</strong></p>
                <ul style="margin-top: 15px;">
                    <li>ALL active rolls have 5/5 quality (100%)</li>
                    <li>The item drops from a dungeon</li>
                    <li>That specific quality level hasn't been collected before</li>
                </ul>
                
                <div style="margin-top: 20px; padding: 15px; background: rgba(255, 215, 0, 0.1); border: 1px solid #ffd700; border-radius: 4px;">
                    <strong style="color: #ffd700;">Example:</strong>
                    <p style="margin-top: 10px;">A blue sword with 2 rolls, both at 5/5 quality = Collected as "sword_2"</p>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Collection Tracking</h3>
            <p>Each dungeon tracks collection separately. For each item, there are 4 possible collection slots:</p>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 20px;">
                <div style="background: rgba(0, 255, 136, 0.2); border: 2px solid #00ff88; padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 24px; color: #00ff88;">★</div>
                    <strong>1-Star Perfect</strong>
                    <div style="font-size: 14px; margin-top: 5px;">Green with 1 perfect roll</div>
                </div>
                <div style="background: rgba(0, 195, 255, 0.2); border: 2px solid #00c3ff; padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 24px; color: #00c3ff;">★★</div>
                    <strong>2-Star Perfect</strong>
                    <div style="font-size: 14px; margin-top: 5px;">Blue with 2 perfect rolls</div>
                </div>
                <div style="background: rgba(216, 150, 255, 0.2); border: 2px solid #d896ff; padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 24px; color: #d896ff;">★★★</div>
                    <strong>3-Star Perfect</strong>
                    <div style="font-size: 14px; margin-top: 5px;">Purple with 3 perfect rolls</div>
                </div>
                <div style="background: rgba(255, 68, 68, 0.2); border: 2px solid #ff4444; padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 24px; color: #ff4444;">★★★★</div>
                    <strong>4-Star Perfect</strong>
                    <div style="font-size: 14px; margin-top: 5px;">Red with 4 perfect rolls</div>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Collection Bonuses</h3>
            
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <h4 style="color: #ffd700;">🌟 Global Drop Bonus</h4>
                <p style="margin-top: 10px;">Each collected slot provides +0.03% to ALL item drop chances</p>
                <ul style="margin-top: 15px;">
                    <li>100 slots collected = +3% to all roll chances</li>
                    <li>1000 slots collected = +30% to all roll chances</li>
                    <li>Maximum bonus: 90% (at 3000 slots)</li>
                </ul>
                
                <div style="margin-top: 20px; padding: 15px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                    <strong>Modified drop chances with bonus:</strong>
                    <ul style="margin-top: 10px;">
                        <li>Roll 2: 45% + bonus</li>
                        <li>Roll 3: 40% + bonus</li>
                        <li>Roll 4: 35% + bonus</li>
                    </ul>
                </div>
            </div>
            
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <h4 style="color: #4dd0e1;">🎯 Item-Specific Bonus</h4>
                <p style="margin-top: 10px;">When you've collected a specific item, future drops of that item get bonuses:</p>
                
                <div style="margin-top: 15px; padding: 15px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                    <strong>If you've collected a 3-star perfect sword:</strong>
                    <ul style="margin-top: 10px;">
                        <li>Future swords that roll 3+ stats get +2 quality to their 3rd roll</li>
                        <li>This can push a 3/5 roll to 5/5 automatically!</li>
                        <li>Bonus is capped at 5/5 maximum</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Collection Display</h3>
            <ul>
                <li>Access via Collection Log button in stash</li>
                <li>Shows progress per tier and per dungeon</li>
                <li>Completed slots show ✓ and collection details on hover</li>
                <li>Track overall progress with percentage complete</li>
                <li>See current drop bonus percentages</li>
            </ul>

            <div style="margin-top: 30px; padding: 20px; background: rgba(255, 215, 0, 0.1); border: 2px solid #ffd700; border-radius: 4px;">
                <h4 style="color: #ffd700; margin: 0;">💡 Collection Tips</h4>
                <ul style="margin-top: 15px;">
                    <li>Focus on lower tier dungeons first - easier to get perfect items</li>
                    <li>Every slot counts - even 1-star perfects give bonuses</li>
                    <li>Collection bonuses are permanent and account-wide</li>
                    <li>The more you collect, the easier it becomes to find perfect items!</li>
                </ul>
            </div>
        `;
    }

    showWikiEquipment(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Equipment & Storage</h2>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">Hero Equipment</h3>
            <p>Each hero has 6 equipment slots:</p>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">🎩</div>
                    <h4 style="color: #4dd0e1;">Head</h4>
                    <p style="font-size: 14px;">Helmets, hats, crowns</p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">👕</div>
                    <h4 style="color: #4dd0e1;">Chest</h4>
                    <p style="font-size: 14px;">Armor, robes, vests</p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">👖</div>
                    <h4 style="color: #4dd0e1;">Legs</h4>
                    <p style="font-size: 14px;">Pants, greaves, boots</p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">⚔️</div>
                    <h4 style="color: #4dd0e1;">Weapon</h4>
                    <p style="font-size: 14px;">Swords, staves, bows</p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">🛡️</div>
                    <h4 style="color: #4dd0e1;">Offhand</h4>
                    <p style="font-size: 14px;">Shields, orbs, quivers</p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 48px;">💍</div>
                    <h4 style="color: #4dd0e1;">Trinket</h4>
                    <p style="font-size: 14px;">Rings, amulets, charms</p>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Stash System</h3>
            <p>Items are stored in class family-specific stashes. Each class family has its own shared storage:</p>
            
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin: 20px 0;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    <div><strong style="color: #4dd0e1;">👥 Villager</strong> - Starting class</div>
                    <div><strong style="color: #4dd0e1;">✨ Acolyte</strong> - Healers & support</div>
                    <div><strong style="color: #4dd0e1;">🏹 Archer</strong> - Ranged attackers</div>
                    <div><strong style="color: #4dd0e1;">🍃 Druid</strong> - Nature magic</div>
                    <div><strong style="color: #4dd0e1;">🔮 Initiate</strong> - Mages & wizards</div>
                    <div><strong style="color: #4dd0e1;">⚔️ Swordsman</strong> - Melee fighters</div>
                    <div><strong style="color: #4dd0e1;">🛡️ Templar</strong> - Holy warriors</div>
                    <div><strong style="color: #4dd0e1;">🗡️ Thief</strong> - Rogues & assassins</div>
                    <div><strong style="color: #4dd0e1;">🔥 Witch Hunter</strong> - Hybrid fighters</div>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: rgba(0, 0, 0, 0.5); border-radius: 4px;">
                    <strong>Each stash tracks:</strong>
                    <ul style="margin-top: 10px;">
                        <li>💰 Gold amount (shared by all heroes in that family)</li>
                        <li>📦 Items array (no size limit)</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Equipment Restrictions</h3>
            <div style="background: rgba(255, 215, 0, 0.1); border: 2px solid #ffd700; padding: 20px; border-radius: 4px; margin: 20px 0;">
                <strong style="color: #ffd700;">⚠️ Villager Restriction</strong>
                <p style="margin-top: 10px;">Villagers (and Testers) can only equip items level 70 and below. Promote to a new class to use higher level gear!</p>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Item Management</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #4dd0e1;">Sorting Options</h4>
                    <p>Items can be sorted by:</p>
                    <ul style="margin-top: 10px;">
                        <li>Item Score (default ↓)</li>
                        <li>Rarity (default ↓)</li>
                        <li>Stars (default ↓)</li>
                        <li>Quality % (default ↓)</li>
                        <li>Level (default ↓)</li>
                        <li>Name (default ↑)</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px;">
                    <h4 style="color: #4dd0e1;">Context Menu (Right-Click)</h4>
                    <ul style="margin-top: 10px;">
                        <li><strong>Equip</strong> - Put on hero</li>
                        <li><strong>Unequip</strong> - Remove from hero</li>
                        <li><strong>Refine</strong> - Improve item (costs gold)</li>
                        <li><strong>Sell</strong> - Convert to gold</li>
                        <li><strong>Mass Sell</strong> - Sell this + all below</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Mass Sell Feature</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <p>The Mass Sell option sells the clicked item plus all items below it in the current sort order.</p>
                
                <div style="margin-top: 15px; padding: 15px; background: rgba(255, 68, 68, 0.1); border: 1px solid #ff4444; border-radius: 4px;">
                    <strong style="color: #ff4444;">⚠️ Be Careful!</strong>
                    <p style="margin-top: 10px;">Mass sell uses your current sort settings. Make sure items are sorted how you want before using this feature!</p>
                </div>
                
                <div style="margin-top: 15px;">
                    <strong>Example:</strong>
                    <ol style="margin-top: 10px;">
                        <li>Sort by Item Score (high to low)</li>
                        <li>Right-click an item with score 150</li>
                        <li>Select "Mass Sell"</li>
                        <li>All items with score ≤150 will be sold</li>
                    </ol>
                </div>
            </div>
        `;
    }

    showWikiAutosell(content) {
        content.innerHTML = `
            <h2 style="color: #4dd0e1; margin-top: 0;">Autosell System</h2>
            
            <p>The autosell system automatically evaluates and sells items based on configurable criteria, saving you time and inventory management!</p>
            
            <h3 style="color: #4dd0e1; margin-top: 30px;">How It Works</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin: 20px 0;">
                <ol>
                    <li style="margin-bottom: 10px;">Enable autosell in party select screen</li>
                    <li style="margin-bottom: 10px;">Choose a preset or customize criteria</li>
                    <li style="margin-bottom: 10px;">When items drop, they're automatically evaluated</li>
                    <li style="margin-bottom: 10px;">Items meeting sell criteria are instantly converted to gold</li>
                    <li style="margin-bottom: 10px;">Gold is added to your rewards</li>
                </ol>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Presets</h3>
            
            <div style="margin-top: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #4dd0e1;">
                    <h4 style="color: #4dd0e1; margin: 0;">Basic Preset</h4>
                    <p style="margin: 10px 0;">Sells items below the item score of your current hero's equipped item in that slot</p>
                    <ul style="margin-top: 10px;">
                        <li>Compares new item score with equipped item score</li>
                        <li>Keeps items if no item equipped in that slot</li>
                        <li>Simple and effective for maintaining upgrades</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #ff4444;">
                    <h4 style="color: #ff4444; margin: 0;">Strict Preset</h4>
                    <ul style="margin-top: 10px;">
                        <li>Quality Below: 80%</li>
                        <li>Stars Below: 2</li>
                        <li>Sell Rarities: Green, Blue, Purple</li>
                        <li>Keeps only high-quality red items</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #ffd700;">
                    <h4 style="color: #ffd700; margin: 0;">Balanced Preset</h4>
                    <ul style="margin-top: 10px;">
                        <li>Quality Below: 60%</li>
                        <li>Stars Below: 0 (no star requirement)</li>
                        <li>Sell Rarities: Green, Blue</li>
                        <li>Good middle ground</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; margin-bottom: 15px; border-radius: 4px; border-left: 4px solid #00ff88;">
                    <h4 style="color: #00ff88; margin: 0;">Relaxed Preset</h4>
                    <ul style="margin-top: 10px;">
                        <li>Quality Below: 50%</li>
                        <li>Stars Below: 0</li>
                        <li>Sell Rarities: Green only</li>
                        <li>Keeps most items</li>
                    </ul>
                </div>
                
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; border-left: 4px solid #d896ff;">
                    <h4 style="color: #d896ff; margin: 0;">Custom Preset</h4>
                    <p style="margin: 10px 0;">Configure your own criteria:</p>
                    <ul style="margin-top: 10px;">
                        <li>Set specific level thresholds</li>
                        <li>Choose minimum item score</li>
                        <li>Define quality requirements</li>
                        <li>Select which rarities to sell</li>
                    </ul>
                </div>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Selling Criteria (OR Logic)</h3>
            <p>For non-basic presets, items are sold if they meet ANY of these criteria:</p>
            
            <table style="width: 100%; margin-top: 20px;">
                <tr>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1; border-bottom: 2px solid #2a6a8a;">Criterion</th>
                    <th style="text-align: left; padding: 10px; color: #4dd0e1; border-bottom: 2px solid #2a6a8a;">Description</th>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Level Below</strong></td>
                    <td style="padding: 10px;">Item level is less than threshold</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Score Below</strong></td>
                    <td style="padding: 10px;">Item score is less than threshold</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Quality Below</strong></td>
                    <td style="padding: 10px;">Item quality % is less than threshold</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Stars Below</strong></td>
                    <td style="padding: 10px;">Perfect roll count is less than threshold</td>
                </tr>
                <tr style="border-bottom: 1px solid #1a4a6a;">
                    <td style="padding: 10px;"><strong>Rarity</strong></td>
                    <td style="padding: 10px;">Item matches selected rarities to sell</td>
                </tr>
            </table>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Visual Indicators</h3>
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 4px; margin-top: 20px;">
                <p>In battle results, autosold items appear as:</p>
                <ul style="margin-top: 15px;">
                    <li>Gold coin icon with amount</li>
                    <li>Greyed out item image in background</li>
                    <li>Shows what was sold and for how much</li>
                </ul>
            </div>

            <h3 style="color: #4dd0e1; margin-top: 30px;">Statistics Tracking</h3>
            <p>The autosell system tracks:</p>
            <ul style="margin-top: 10px;">
                <li>📊 <strong>Items Sold</strong> - Total count of autosold items</li>
                <li>💰 <strong>Gold Gained</strong> - Total gold earned from autoselling</li>
                <li>📦 <strong>Items Saved</strong> - Items that passed criteria and were kept</li>
            </ul>

            <div style="margin-top: 30px; padding: 20px; background: rgba(255, 215, 0, 0.1); border: 2px solid #ffd700; border-radius: 4px;">
                <h4 style="color: #ffd700; margin: 0;">💡 Autosell Tips</h4>
                <ul style="margin-top: 15px;">
                    <li>Start with Relaxed preset and adjust as needed</li>
                    <li>Basic preset is great for maintaining gear upgrades</li>
                    <li>Check statistics regularly to ensure you're not selling valuable items</li>
                    <li>Custom preset gives you full control over what to keep</li>
                    <li>Remember: Perfect items for collection are never autosold!</li>
                </ul>
            </div>
        `;
    }
    
    // New game tutorial
    newGameStart() {
        this.isNewGameTutorial = true;
        this.newGameHeroCount = 0;
        
        // Initial Skypper dialogue
        this.npcDialogue('Skypper', [
            "Ahh, there you are. I wasn't sure anyone would answer the call.",
            "Name's Skypper. I was a hero, once... Now I help spot the next ones.",
            "You won't start with legends. You start with potential. Raw, restless, and real.",
            "You three will do. Give me your names, one day, folk'll know those names. Maybe even fear 'em."
        ], true, () => {
            // After initial dialogue, create first hero
            this.continueNewGameTutorial();
        });
    }

continueNewGameTutorial() {
    if (this.newGameHeroCount === 0) {
        // First hero
        this.skypperAdditionalRecruit();
    } else if (this.newGameHeroCount === 1) {
        // Second hero
        this.skypperAdditionalRecruit();
    } else if (this.newGameHeroCount === 2) {
        // Third hero
        this.skypperAdditionalRecruit();
    } else if (this.newGameHeroCount === 3) {
        // All heroes created, final dialogue
        this.npcDialogue('Skypper', [
            "Alright then. That's your squad. Might not look like much, yet. But there's fire there. Let's use that.",
            "The Satyrs have gotten bold just past the gate. Let's see what this crew can do."
        ], true, () => {
            // Tutorial complete, go to main menu
this.isNewGameTutorial = false;
this.game.tutorialCompleted = true; // Mark tutorial as complete

// Save to the current slot (which should always be set now)
if (!saveManager.currentSlot) {
    // Fallback: ensure we have a current slot
    saveManager.currentSlot = saveManager.defaultSlot || 1;
}

console.log(`Tutorial complete, saving to slot ${saveManager.currentSlot}`);
saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save

// Ensure this slot remains the default
saveManager.setDefaultSlot(saveManager.currentSlot);

// Show a notification
this.game.uiManager.showSaveNotification(`Game saved to Slot ${saveManager.currentSlot}`);

this.game.uiManager.showMainMenu();
        });
    }
}
    
showBestiary() {
    // Create bestiary overlay within scaleWrapper
    const scaleWrapper = document.getElementById('scaleWrapper');
    
    const overlay = document.createElement('div');
    overlay.id = 'bestiaryOverlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 1920px;
        height: 1080px;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Create bestiary container
    const container = document.createElement('div');
    container.id = 'bestiaryContainer';
    container.style.cssText = `
        background: rgba(10, 25, 41, 0.98);
        border: 2px solid #2a6a8a;
        border-radius: 8px;
        width: 1920px;
        height: 1080px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 0 30px rgba(42, 106, 138, 0.5);
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px;
        border-bottom: 2px solid #2a6a8a;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <h1 style="color: #4dd0e1; margin: 0; font-size: 28px;">Squeaky's Unit Compendium</h1>
        <button id="closeBestiaryBtn" style="
            background: #cc0000;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 18px;
            cursor: pointer;
            border-radius: 4px;
        ">✕ Close</button>
    `;

    // Create tabs
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = `
        display: flex;
        gap: 10px;
        padding: 20px 20px 0 20px;
    `;
    tabContainer.innerHTML = `
        <button class="bestiaryTab active" data-tab="heroes-male" style="
            padding: 10px 30px;
            font-size: 18px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
        ">Hero Classes <span class="gender-male">♂</span></button>
        <button class="bestiaryTab" data-tab="heroes-female" style="
            padding: 10px 30px;
            font-size: 18px;
            background: #004499;
            color: white;
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
        ">Hero Classes <span class="gender-female">♀</span></button>
        <button class="bestiaryTab" data-tab="enemies" style="
            padding: 10px 30px;
            font-size: 18px;
            background: #004499;
            color: white;
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
        ">Enemy Units</button>
    `;

    // Create content area
    const content = document.createElement('div');
    content.id = 'bestiaryContent';
    content.style.cssText = `
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        background: rgba(10, 15, 26, 0.5);
        position: relative;
    `;

    // Assemble container
    container.appendChild(header);
    container.appendChild(tabContainer);
    container.appendChild(content);
    overlay.appendChild(container);
    scaleWrapper.appendChild(overlay);

    // Event listeners
    document.getElementById('closeBestiaryBtn').onclick = () => this.closeBestiary();
    
    const tabs = tabContainer.querySelectorAll('.bestiaryTab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = '#004499';
            });
            tab.classList.add('active');
            tab.style.background = '#0066cc';
            
            if (tab.dataset.tab === 'heroes-male') {
                this.showHeroClasses('male');
            } else if (tab.dataset.tab === 'heroes-female') {
                this.showHeroClasses('female');
            } else {
                this.showEnemyUnits();
            }
        };
    });

    // Show male heroes by default
    this.showHeroClasses('male');
}
    
    closeBestiary() {
        const overlay = document.getElementById('bestiaryOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
showHeroClasses(gender) {
    const content = document.getElementById('bestiaryContent');
    content.innerHTML = '';

    // Create SVG for paths
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;';
    content.appendChild(svg);

    // Create hero tree container
    const treeContainer = document.createElement('div');
    treeContainer.style.cssText = 'position: relative; width: 100%; height: 100%;';
    content.appendChild(treeContainer);

    // Render hero tree for specified gender
    this.renderHeroTrees(treeContainer, svg, gender);
}
    
renderHeroTrees(container, svg, gender) {
    const cellWidth = 120;
    const cellHeight = 170;
    const startX = -24;
    const startY = 50;
    
    // Track all positions for drawing paths
    const positions = {};
    
    // Place villager at row 0, centered (between columns 8 and 9)
    const villagerClass = gender === 'male' ? 'villager_male' : 'villager_female';
    const villagerData = unitData.classes[villagerClass];
    if (villagerData) {
        const villagerX = startX + (8 * cellWidth); // Centered between columns 8 and 9
        const villagerY = startY;
        const villagerDiv = this.createHeroThumb(villagerClass, villagerData, villagerX, villagerY);
        container.appendChild(villagerDiv);
        positions['villager'] = { x: villagerX + 76, y: villagerY + 76 }; // Store without gender suffix for parent lookup
    }
    
    // Define class layout with specific positions
    const classLayout = [
        // Acolyte family (columns 0-1)
        { name: 'acolyte', row: 1, col: 0, parent: 'villager' },
        { name: 'cleric', row: 2, col: 0, parent: 'acolyte' },
        { name: 'priest', row: 3, col: 0, parent: 'cleric', gender: 'male' },
        { name: 'priestess', row: 3, col: 0, parent: 'cleric', gender: 'female' },
        { name: 'hierophant', row: 4, col: 0, parent: gender === 'male' ? 'priest' : 'priestess' },
        { name: 'patriarch', row: 3, col: 1, parent: 'cleric', gender: 'male' },
        { name: 'matriarch', row: 3, col: 1, parent: 'cleric', gender: 'female' },
        { name: 'prophet', row: 4, col: 1, parent: 'patriarch', gender: 'male' },
        { name: 'prophetess', row: 4, col: 1, parent: 'matriarch', gender: 'female' },
        
        // Archer family (columns 2-3)
        { name: 'archer', row: 1, col: 2, parent: 'villager' },
        { name: 'ranger', row: 2, col: 2, parent: 'archer' },
        { name: 'marksman', row: 3, col: 2, parent: 'ranger' },
        { name: 'sniper', row: 4, col: 2, parent: 'marksman' },
        { name: 'tracker', row: 3, col: 3, parent: 'ranger' },
        { name: 'monster_hunter', row: 4, col: 3, parent: 'tracker' },
        
        // Druid family (columns 4-5)
        { name: 'druid', row: 1, col: 4, parent: 'villager' },
        { name: 'arch_druid', row: 2, col: 4, parent: 'druid' },
        { name: 'shapeshifter', row: 3, col: 4, parent: 'arch_druid' },
        { name: 'runemaster', row: 4, col: 4, parent: 'shapeshifter' },
        { name: 'shaman', row: 3, col: 5, parent: 'arch_druid' },
        { name: 'summoner', row: 4, col: 5, parent: 'shaman' },
        
        // Initiate family (columns 6-7)
        { name: 'initiate', row: 1, col: 6, parent: 'villager' },
        { name: 'mage', row: 2, col: 6, parent: 'initiate' },
        { name: 'wizard', row: 3, col: 6, parent: 'mage', gender: 'male' },
        { name: 'witch', row: 3, col: 6, parent: 'mage', gender: 'female' },
        { name: 'white_wizard', row: 4, col: 6, parent: 'wizard', gender: 'male' },
        { name: 'white_witch', row: 4, col: 6, parent: 'witch', gender: 'female' },
        { name: 'sage', row: 3, col: 7, parent: 'mage' },
        { name: 'arch_sage', row: 4, col: 7, parent: 'sage' },
        
        // Swordsman family (columns 8-9)
        { name: 'swordsman', row: 1, col: 8, parent: 'villager' },
        { name: 'knight', row: 2, col: 8, parent: 'swordsman' },
        { name: 'imperial_knight', row: 3, col: 8, parent: 'knight' },
        { name: 'champion', row: 4, col: 8, parent: 'imperial_knight' },
        { name: 'crusader', row: 3, col: 9, parent: 'knight' },
        { name: 'avenger', row: 4, col: 9, parent: 'crusader' },
        
        // Templar family (columns 10-11)
        { name: 'templar', row: 1, col: 10, parent: 'villager' },
        { name: 'arch_templar', row: 2, col: 10, parent: 'templar' },
        { name: 'dark_templar', row: 3, col: 10, parent: 'arch_templar' },
        { name: 'dark_arch_templar', row: 4, col: 10, parent: 'dark_templar' },
        { name: 'high_templar', row: 3, col: 11, parent: 'arch_templar' },
        { name: 'grand_templar', row: 4, col: 11, parent: 'high_templar' },
        
        // Thief family (columns 12-13)
        { name: 'thief', row: 1, col: 12, parent: 'villager' },
        { name: 'rogue', row: 2, col: 12, parent: 'thief' },
        { name: 'assassin', row: 3, col: 12, parent: 'rogue' },
        { name: 'phantom_assassin', row: 4, col: 12, parent: 'assassin' },
        { name: 'stalker', row: 3, col: 13, parent: 'rogue' },
        { name: 'master_stalker', row: 4, col: 13, parent: 'stalker' },
        
        // Witch Hunter family (columns 14-15)
        { name: 'witch_hunter', row: 1, col: 14, parent: 'villager' },
        { name: 'slayer', row: 2, col: 14, parent: 'witch_hunter' },
        { name: 'inquisitor', row: 3, col: 14, parent: 'slayer' },
        { name: 'grand_inquisitor', row: 4, col: 14, parent: 'inquisitor' },
        { name: 'witcher', row: 3, col: 15, parent: 'slayer' },
        { name: 'professional_witcher', row: 4, col: 15, parent: 'witcher' }
    ];
    
    // Process and place each class
    classLayout.forEach(classInfo => {
        // Skip gender-specific classes that don't match current gender
        if (classInfo.gender && classInfo.gender !== gender) {
            return;
        }
        
        const className = classInfo.name + '_' + gender;
        const classData = unitData.classes[className];
        
        if (classData) {
            const x = startX + (classInfo.col * cellWidth);
            const y = startY + (classInfo.row * cellHeight);
            
            const div = this.createHeroThumb(className, classData, x, y);
            container.appendChild(div);
            
            // Store position with simple name for parent lookup
            positions[classInfo.name] = { x: x + 76, y: y + 76 };
            
            // Draw path from parent
            if (positions[classInfo.parent]) {
                this.drawPath(svg, positions[classInfo.parent], positions[classInfo.name]);
            }
        }
    });
}
    
    createHeroThumb(className, classData, x, y) {
        const div = document.createElement('div');
        div.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: 120px;
            height: 120px;
            cursor: pointer;
            z-index: 2;
            text-align: center;
        `;
        
        div.innerHTML = `
            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${className}_battle.png"
                 style="width: 120px; height: 120px; image-rendering: pixelated;"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 96 96\\'><rect fill=\\'%23666\\' width=\\'96\\' height=\\'96\\'/><text x=\\'48\\' y=\\'48\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'12\\'>${classData.name}</text></svg>'">
            <div style="color: #b0e0f0; font-size: 20px; margin-top: 4px;">${classData.name}</div>
        `;
        
        div.onclick = () => this.showUnitDetails(className, classData, 'hero');
        
        return div;
    }

    drawPath(svg, from, to) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Create curved path
        const midY = (from.y + to.y) / 2;
        const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
        
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#2a6a8a');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        
        svg.appendChild(path);
    }

    showEnemyUnits() {
        const content = document.getElementById('bestiaryContent');
        content.innerHTML = '';

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, 140px);
            gap: 20px;
            padding: 20px;
        `;

        // Add all enemies
        Object.entries(unitData.enemies).forEach(([enemyId, enemyData]) => {
            const div = document.createElement('div');
            div.style.cssText = `
                cursor: pointer;
                text-align: center;
                transition: transform 0.2s;
            `;
            
            div.innerHTML = `
                <img src="https://puzzle-drops.github.io/TEVE/img/sprites/enemies/${enemyId}.png"
                     style="width: 128px; height: 128px; image-rendering: pixelated;"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 96 96\\'><rect fill=\\'%23666\\' width=\\'96\\' height=\\'96\\'/><text x=\\'48\\' y=\\'48\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'12\\'>${enemyData.name}</text></svg>'">
                <div style="color: #b0e0f0; font-size: 20px; margin-top: 4px;">${enemyData.name}</div>
            `;
            
            div.onmouseover = () => div.style.transform = 'scale(1.1)';
            div.onmouseout = () => div.style.transform = 'scale(1)';
            div.onclick = () => this.showUnitDetails(enemyId, enemyData, 'enemy');
            
            grid.appendChild(div);
        });

        content.appendChild(grid);
    }

    calculateStatsAtLevel(unitData, level, unitType) {
        const mods = unitData.modifiers;
        const initial = unitData.initial;
        
        // Calculate base stats
        const str = Math.floor(initial.str + (level * mods.str));
        const agi = Math.floor(initial.agi + (level * mods.agi));
        const int = Math.floor(initial.int + (level * mods.int));
        
        // Get mainstat value for attack calculation
        const mainstat = unitData.mainstat || 'str';
        const mainstatValue = mainstat === 'str' ? str : (mainstat === 'agi' ? agi : int);
        
        return {
            str: str,
            agi: agi,
            int: int,
            hp: Math.floor(initial.hp + (str * mods.hp)),
            attack: Math.floor(initial.attack + (mainstatValue * mods.attack)),
            attackSpeed: Math.floor(initial.attackSpeed + (95 + 100 * (agi / (agi + 1000)))),
            armor: Math.floor(initial.armor + (mods.armor * level) + (0.05 * str) + (0.01 * agi)),
            resist: Math.floor(initial.resist + (mods.resist * level) + (0.05 * int))
        };
    }

    getMaxValuesForTier(tier, level) {
        // Calculate max values based on the modifier ranges provided:
        // STR/AGI/INT: 2.5 to 8 per level
        // HP: 2.5 to 6.1 per str point
        // Attack: 0.1 to 0.82 per mainstat
        
        const maxStatModifier = 8;
        const maxHPModifier = 6.1;
        const maxAttackModifier = 0.82;
        
        // Calculate theoretical max stats at each level
        const maxPrimaryStat = level * maxStatModifier;
        const maxHP = maxPrimaryStat * maxHPModifier;
        const maxAttack = maxPrimaryStat * maxAttackModifier;
        
        // For armor and resist, use approximate scaling
        const maxArmor = level * 1.5 + (maxPrimaryStat * 0.05);
        const maxResist = level * 1.5 + (maxPrimaryStat * 0.05);
        
        return {
            str: maxPrimaryStat,
            agi: maxPrimaryStat,
            int: maxPrimaryStat,
            hp: Math.floor(maxHP),
            attack: Math.floor(maxAttack),
            attackSpeed: 205, // Max attack speed
            armor: Math.floor(maxArmor),
            resist: Math.floor(maxResist)
        };
    }

    createStatBar(value, maxValue, label, color, isAttackSpeed = false) {
        let percentage;
        
        if (isAttackSpeed) {
            // For attack speed, 95 is 0% and 205 is 100%
            const adjustedValue = value - 95;
            const adjustedMax = 110; // 205 - 95
            percentage = Math.min((adjustedValue / adjustedMax) * 100, 100);
            percentage = Math.max(0, percentage); // Ensure it's not negative
        } else {
            percentage = Math.min((value / maxValue) * 100, 100);
        }
        
        return `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span style="color: #b0e0f0; font-size: 40px;">${label}</span>
                    <span style="color: #b0e0f0; font-size: 40px;">${value}</span>
                </div>
                <div style="width: 100%; height: 20px; background: rgba(0, 0, 0, 0.5); border: 1px solid #2a6a8a; border-radius: 3px;">
                    <div style="width: ${percentage}%; height: 100%; background: ${color}; border-radius: 2px; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    showUnitDetails(unitId, unitData, unitType) {
    // Create popup overlay within scaleWrapper
    const scaleWrapper = document.getElementById('scaleWrapper');
    
    const popup = document.createElement('div');
    popup.id = 'unitDetailsPopup';
    popup.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 1920px;
        height: 1080px;
        background: rgba(10, 25, 41, 0.98);
        z-index: 10001;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    `;

    // Header with close button
    let headerContent = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 30px; border-bottom: 2px solid #2a6a8a;">
        <h2 style="color: #4dd0e1; margin: 0; font-size: 28px;">
            ${unitData.name}${unitType === 'hero' ? ` <span class="gender-${unitId.includes('_male') ? 'male' : 'female'}">${unitId.includes('_male') ? '♂' : '♀'}</span>` : ''}
        </h2>
        <button onclick="document.getElementById('unitDetailsPopup').remove()" style="
                background: #cc0000;
                color: white;
                border: none;
                padding: 10px 20px;
                font-size: 18px;
                cursor: pointer;
                border-radius: 4px;
            ">✕</button>
        </div>
    `;

    // Main content area with 3 columns
    let mainContent = `<div style="flex: 1; display: flex; padding: 30px; gap: 30px; align-items: flex-start;">`;

    // Column 1: Portrait with backdrop
    mainContent += `<div style="flex: 0 0 300px; display: flex; align-items: center; justify-content: center;">`;
    
    if (unitType === 'hero') {
        // Get class family for backdrop
        const familyName = this.game.getClassFamily(unitId.replace(/_male$|_female$/, ''), unitData.tier);
        const backdropName = familyName.toLowerCase().replace(/ /g, '_');
        
        mainContent += `
    <div style="text-align: center;">
        <div style="position: relative; width: 256px; height: 256px; 
                    background-image: url('https://puzzle-drops.github.io/TEVE/img/backdrops/${backdropName}_backdrop.png');
                    background-size: cover; background-position: center;
                    border: 2px solid #2a6a8a; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    margin-bottom: 15px;">
            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${unitId}_battle.png"
                 style="width: 90%; height: 90%; image-rendering: pixelated; z-index: 1;"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 256 256\\'><rect fill=\\'%23666\\' width=\\'256\\' height=\\'256\\'/><text x=\\'128\\' y=\\'128\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'20\\'>${unitData.name}</text></svg>'">
        </div>
        <div style="font-size: 36px; color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);">${'★'.repeat(unitData.tier + 1)}</div>
    </div>
`;
    } else {
    // Enemy portrait with universal enemy backdrop
    mainContent += `
        <div style="text-align: center;">
            <div style="width: 256px; height: 256px; 
                        background-image: url('https://puzzle-drops.github.io/TEVE/img/backdrops/enemy_backdrop.png');
                        background-size: cover; background-position: center;
                        border: 2px solid #2a6a8a; border-radius: 8px;
                        display: flex; align-items: center; justify-content: center;
                        margin-bottom: 15px;">
                <img src="https://puzzle-drops.github.io/TEVE/img/sprites/enemies/${unitId}.png"
                     style="width: 90%; height: 90%; image-rendering: pixelated;"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 256 256\\'><rect fill=\\'%23666\\' width=\\'256\\' height=\\'256\\'/><text x=\\'128\\' y=\\'128\\' text-anchor=\\'middle\\' fill=\\'white\\' font-size=\\'20\\'>${unitData.name}</text></svg>'">
            </div>
            ${unitData.boss ? '<div style="color: #ff4444; font-size: 40px; font-weight: bold; text-align: center;">BOSS</div>' : ''}
        </div>
    `;
}
    
    mainContent += `</div>`;

    // Column 2: Stats Bar Graph
    mainContent += `<div style="flex: 1; min-width: 400px;">`;

    // Determine the level to show stats at
    let statLevel;
    if (unitType === 'hero') {
        const promoteLevels = { 0: 50, 1: 100, 2: 200, 3: 300, 4: 500 };
        statLevel = promoteLevels[unitData.tier] || 500;
    } else {
        // For enemies, show stats at level 100 as a reasonable comparison
        statLevel = 100;
    }

    // Calculate stats at the appropriate level
    const stats = this.calculateStatsAtLevel(unitData, statLevel, unitType);

    // Get max values based on tier/level
    const maxValues = this.getMaxValuesForTier(unitData.tier || 0, statLevel);

    // Stats Bar Graph
    mainContent += `
        <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #4dd0e1; margin-top: 0; margin-bottom: 20px; font-size: 50px;">Stats (Level ${statLevel})</h3>
            ${this.createStatBar(stats.str, maxValues.str, 'Strength', '#ff6b6b')}
            ${this.createStatBar(stats.agi, maxValues.agi, 'Agility', '#66d9ef')}
            ${this.createStatBar(stats.int, maxValues.int, 'Intelligence', '#bd93f9')}
            ${this.createStatBar(stats.hp, maxValues.hp, 'Health', '#50fa7b')}
            ${this.createStatBar(stats.attack, maxValues.attack, 'Attack', '#ffb86c')}
            ${this.createStatBar(stats.attackSpeed, maxValues.attackSpeed, 'Attack Speed', '#f1fa8c', true)}
            ${this.createStatBar(stats.armor, maxValues.armor, 'Armor', '#8be9fd')}
            ${this.createStatBar(stats.resist, maxValues.resist, 'Resistance', '#ff79c6')}
        </div>
    `;

    // Promotion paths (heroes only)
    if (unitType === 'hero') {
        // Get the base unit ID without gender suffix
        const baseUnitId = unitId.replace(/_male$|_female$/, '');
        const gender = unitId.includes('_male') ? 'male' : 'female';
        
        // Promotes from
        const promotesFrom = [];
        if (window.unitData && window.unitData.classes) {
            Object.entries(window.unitData.classes).forEach(([className, classData]) => {
                if (classData.promotesTo) {
                    // Check if this class promotes to our base unit
                    const promotesToBase = classData.promotesTo.some(promo => {
                        const promoWithGender = promo + '_' + gender;
                        return promoWithGender === unitId;
                    });
                    
                    if (promotesToBase) {
                        promotesFrom.push({ id: className, data: classData });
                    }
                }
            });
        }
        
        if (promotesFrom.length > 0) {
            mainContent += `
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #4dd0e1; margin-top: 0;">Promotes From</h3>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;">
            `;
            promotesFrom.forEach(parent => {
                mainContent += `
                    <div style="cursor: pointer; text-align: center;" onclick="window.game.tutorial.showUnitDetails('${parent.id}', unitData.classes['${parent.id}'], 'hero')">
                        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${parent.id}_portrait.png"
                             style="width: 64px; height: 64px; image-rendering: pixelated; border: 1px solid #2a6a8a;"
                             onerror="this.style.display='none'">
                        <div style="color: #b0e0f0; font-size: 12px; margin-top: 4px;">${parent.data.name}</div>
                    </div>
                `;
            });
            mainContent += '</div></div>';
        }

        // Promotes to
        if (unitData.promotesTo && unitData.promotesTo.length > 0 && window.unitData && window.unitData.classes) {
            mainContent += `
                <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 8px;">
                    <h3 style="color: #4dd0e1; margin-top: 0;">Promotes To</h3>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;">
            `;
            unitData.promotesTo.forEach(childId => {
                const childIdWithGender = childId + '_' + gender;
                const childData = window.unitData.classes[childIdWithGender];
                if (childData) {
                    mainContent += `
                        <div style="cursor: pointer; text-align: center;" onclick="window.game.tutorial.showUnitDetails('${childIdWithGender}', unitData.classes['${childIdWithGender}'], 'hero')">
                            <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/${childIdWithGender}_portrait.png"
                                 style="width: 64px; height: 64px; image-rendering: pixelated; border: 1px solid #2a6a8a;"
                                 onerror="this.style.display='none'">
                            <div style="color: #b0e0f0; font-size: 12px; margin-top: 4px;">${childData.name}</div>
                        </div>
                    `;
                }
            });
            mainContent += '</div></div>';
        }
    }

    mainContent += `</div>`; // Close column 2

    // Column 3: Abilities
    mainContent += `<div style="flex: 1; min-width: 400px;">`;
    
    if (unitData.spells && unitData.spells.length > 0) {
        mainContent += `
            <div style="background: rgba(0, 0, 0, 0.3); padding: 20px; border-radius: 8px;">
                <h3 style="color: #4dd0e1; margin-top: 0; margin-bottom: 20px; font-size: 40px;">Abilities | Level 1/2/3/4/5</h3>
        `;
        
        unitData.spells.forEach(spellId => {
            const spell = spellManager?.getSpell(spellId);
            if (spell) {
                mainContent += `
                    <div style="margin-bottom: 20px; padding: 15px; background: rgba(10, 25, 41, 0.5); border: 1px solid #2a6a8a; border-radius: 4px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="https://puzzle-drops.github.io/TEVE/img/spells/${spellId}.png"
                                 style="width: 64px; height: 64px; border: 1px solid #2a6a8a;"
                                 onerror="this.style.display='none'">
                            <div style="flex: 1;">
                                <div style="font-size: 32px; color: #4dd0e1; font-weight: bold;">${spell.name}</div>
                                <div style="color: #6a9aaa; margin-top: 0px; font-size: 20px;">
                                    ${spell.passive || (spell.effects && spell.effects.includes('passive')) ? 'Passive' : `Cooldown: ${Array.isArray(spell.cooldown) ? spell.cooldown.join('/') : spell.cooldown} turns`}
                                </div>
                                <div style="color: #b0e0f0; margin-top: 20px; line-height: 1.5; font-size: 20px;">
                                    ${this.formatSpellDescription(spell)}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        mainContent += '</div>';
    }

    mainContent += `</div></div>`;

    popup.innerHTML = headerContent + mainContent;
    scaleWrapper.appendChild(popup);
}

    formatSpellDescription(spell) {
        let description = spell.description || '';
        
        // Replace placeholders with actual values (showing all levels)
        description = description.replace(/{(\w+(?:\.\w+)*)}/g, (match, property) => {
            // Get the value for this property
            let values = null;
            
            // Handle nested properties
            if (property.includes('.')) {
                const parts = property.split('.');
                let temp = spell;
                for (const part of parts) {
                    temp = temp?.[part];
                }
                values = temp;
            } else if (spell[property]) {
                values = spell[property];
            } else if (spell.scaling && spell.scaling[property]) {
                values = spell.scaling[property];
            }
            
            // Format the values
            if (Array.isArray(values)) {
                const formattedValues = values.map((v, i) => {
                    if (typeof v === 'number' && v < 1 && v > 0 && property.includes('percent')) {
                        return Math.round(v * 100) + '%';
                    }
                    return v;
                }).join('/');
                
                // Add brackets around the values
                let formattedOutput = `[${formattedValues}]`;
                
                // For scaling properties (attack, str, agi, int), add 'x (property)'
                if (['attack', 'str', 'agi', 'int'].includes(property)) {
                    formattedOutput += `x (${property})`;
                }
                
                return formattedOutput;
            } else if (values !== null && values !== undefined) {
                return values;
            }
            
            return match;
        });
        
        // Bracket cleanup - remove double brackets
        description = description.replace(/\[\[+/g, '[').replace(/\]\]+/g, ']');
        description = description.replace(/\[(?![^\]]*[/%x])/g, '').replace(/(?<![/%\d])\]/g, '');
        
        return description;
    }

    // NPC Dialogue System
    npcDialogue(npcName, dialogueText, blur = false, onComplete = null) {
    // Clear any existing dialogue
    this.clearDialogue();
    
    // Store the callback
    this.dialogueCompleteCallback = onComplete;
    
    // Convert single string to array for consistency
    let dialogueArray = Array.isArray(dialogueText) ? dialogueText : [dialogueText];
        
        // Format NPC name properly (capitalize first letter)
        const formattedNPCName = npcName.charAt(0).toUpperCase() + npcName.slice(1).toLowerCase();
        
        // Prepend NPC name to each dialogue line
        this.currentDialogueQueue = dialogueArray.map(text => `${formattedNPCName}: ${text}`);
        this.currentDialogueIndex = 0;
        
        // Show overlay with optional blocking
        const overlay = document.getElementById('npcDialogueOverlay');
        overlay.style.display = 'block';
        if (blur) {
            overlay.classList.add('blocking');
        } else {
            overlay.classList.remove('blocking');
        }
        
        // Set NPC portrait
        const validNPCs = ['skypper', 'bob', 'arnold', 'squeaky'];
        const npcNameLower = npcName.toLowerCase();
        if (validNPCs.includes(npcNameLower)) {
            const portraitImg = document.getElementById('npcPortraitImage');
            portraitImg.src = `https://puzzle-drops.github.io/TEVE/img/npc/${npcNameLower}_dialogue.png`;
        }
        
        // Add click handler
        overlay.addEventListener('click', this.handleDialogueClick);
        
        // Start first dialogue
        this.showNextDialogue();
    }
    
    showNextDialogue() {
        if (this.currentDialogueIndex >= this.currentDialogueQueue.length) {
            this.closeDialogue();
            return;
        }
        
        const text = this.currentDialogueQueue[this.currentDialogueIndex];
        this.typewriterEffect(text);
        this.currentDialogueIndex++;
    }
    
    typewriterEffect(text) {
        this.isTyping = true;
        this.canContinue = false;
        
        const textElement = document.getElementById('npcDialogueText');
        const continueElement = document.getElementById('npcDialogueContinue');
        
        textElement.textContent = '';
        continueElement.style.display = 'none';
        
        let charIndex = 0;
        const typeSpeed = 10; // milliseconds per character
        
        const typeNextChar = () => {
            if (charIndex < text.length) {
                textElement.textContent += text[charIndex];
                charIndex++;
                this.typewriterTimeout = setTimeout(typeNextChar, typeSpeed);
            } else {
                // Typing complete
                this.isTyping = false;
                // Wait .3 seconds before allowing continue
                this.continueTimeout = setTimeout(() => {
                    this.canContinue = true;
                    continueElement.style.display = 'block';
                }, 300);
            }
        };
        
        typeNextChar();
    }
    
    handleDialogueClick(event) {
        // Prevent clicking through to game elements
        event.stopPropagation();
        
        if (this.isTyping) {
            // Skip typewriter effect
            clearTimeout(this.typewriterTimeout);
            const textElement = document.getElementById('npcDialogueText');
            const currentText = this.currentDialogueQueue[this.currentDialogueIndex - 1];
            textElement.textContent = currentText;
            this.isTyping = false;
            
            // Still wait before allowing continue
            clearTimeout(this.continueTimeout);
            this.continueTimeout = setTimeout(() => {
                this.canContinue = true;
                document.getElementById('npcDialogueContinue').style.display = 'block';
            }, 250);
        } else if (this.canContinue) {
            this.showNextDialogue();
        }
    }
    
    closeDialogue() {
    const overlay = document.getElementById('npcDialogueOverlay');
    overlay.style.display = 'none';
    overlay.classList.remove('blocking');
    overlay.removeEventListener('click', this.handleDialogueClick);
    
    // Clear timeouts
    clearTimeout(this.typewriterTimeout);
    clearTimeout(this.continueTimeout);
    
    // Reset state
    this.currentDialogueQueue = [];
    this.currentDialogueIndex = 0;
    this.isTyping = false;
    this.canContinue = false;
    
    // Execute callback if provided
    if (this.dialogueCompleteCallback) {
        const callback = this.dialogueCompleteCallback;
        this.dialogueCompleteCallback = null; // Clear it
        setTimeout(() => callback(), 100); // Small delay for smooth transition
    }
}
    
    clearDialogue() {
        // Force clear any existing dialogue
        this.closeDialogue();
        document.getElementById('npcDialogueText').textContent = '';
        document.getElementById('npcDialogueContinue').style.display = 'none';
    }
    
    // Test function for Arnold
    testDialogueArnold() {
        this.npcDialogue('Arnold', [
            "Hello there, adventurer! My name is Arnold.",
            "I've been waiting for someone like you to arrive.",
            "The City of New Lights needs heroes now more than ever.",
            "Are you ready to begin your journey?"
        ], false);
    }

    // Test function for Bob
    testDialogueBob() {
        this.npcDialogue('Bob', [
            "Welcome to the Arena! I'm Bob, the arena master.",
            "This is where the bravest warriors test their mettle.",
            "You'll find challenges here that push you to your limits.",
            "Think you have what it takes to become a champion?"
        ], false);
    }

    // Test function for Squeaky
    testDialogueSqueaky() {
        this.npcDialogue('Squeaky', [
            "Squeak squeak! Oh, I mean... Hello there!",
            "I'm Squeaky, the city's... um... information broker.",
            "I hear things. Lots of things. Tiny mouse ears, you know?",
            "If you need to know something, just ask! *squeak*"
        ], false);
    }

    // Test function for Skypper
    testDialogueSkypper() {
        this.npcDialogue('Skypper', [
            "Greetings, traveler. I am Skypper.",
            "I have watched over these lands for countless years.",
            "Ancient secrets and forgotten powers lie dormant here.",
            "Perhaps you are the one destined to awaken them..."
        ], false);
    }

    showNewHeroCreation() {
        // Create overlay within scaleWrapper
        const scaleWrapper = document.getElementById('scaleWrapper');
        
        const overlay = document.createElement('div');
        overlay.id = 'newHeroOverlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 1920px;
            height: 1080px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create villager select container
        const dialog = document.createElement('div');
        dialog.id = 'newHeroDialog';
        dialog.style.cssText = `
            background: rgba(10, 25, 41, 0.95);
            border: 2px solid #2a6a8a;
            border-radius: 8px;
            padding: 30px;
            width: 600px;
            box-shadow: 0 0 30px rgba(42, 106, 138, 0.5);
        `;

        // Build villager select content
        dialog.innerHTML = `
            <h2 style="color: #4dd0e1; text-align: center; margin-bottom: 20px; font-size: 28px;">Create New Hero</h2>
            
            <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                <div id="maleOption" class="genderOption" style="flex: 1; border: 2px solid #2a6a8a; border-radius: 8px; cursor: pointer; transition: all 0.3s; overflow: hidden;">
                    <div style="position: relative; height: 200px; background-image: url('https://puzzle-drops.github.io/TEVE/img/backdrops/villager_backdrop.png'); background-size: cover; background-position: center;">
                        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/villager_male_battle.png" 
                             style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); height: 180px; image-rendering: pixelated;">
                    </div>
                    <div style="padding: 15px; text-align: center; background: rgba(10, 25, 41, 0.8);">
                        <div style="color: #b0e0f0; font-size: 20px;">Villager <span class="gender-male">♂</span></div>
                    </div>
                </div>
                
                <div id="femaleOption" class="genderOption" style="flex: 1; border: 2px solid #2a6a8a; border-radius: 8px; cursor: pointer; transition: all 0.3s; overflow: hidden;">
                    <div style="position: relative; height: 200px; background-image: url('https://puzzle-drops.github.io/TEVE/img/backdrops/villager_backdrop.png'); background-size: cover; background-position: center;">
                        <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/villager_female_battle.png" 
                             style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); height: 180px; image-rendering: pixelated;">
                    </div>
                    <div style="padding: 15px; text-align: center; background: rgba(10, 25, 41, 0.8);">
                        <div style="color: #b0e0f0; font-size: 20px;">Villager <span class="gender-female">♀</span></div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="color: #6a9aaa; display: block; margin-bottom: 10px; font-size: 18px;">Hero Name:</label>
                <input type="text" id="heroNameInput" style="width: 100%; padding: 10px; font-size: 18px; background: rgba(10, 25, 41, 0.8); border: 1px solid #2a6a8a; color: #b0e0f0; border-radius: 4px;">
            </div>
            
            <div style="display: flex; gap: 20px; justify-content: center;">
                <button id="confirmHeroBtn" style="padding: 10px 30px; font-size: 18px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; opacity: 0.5;" disabled>
                    Confirm
                </button>
                <button id="cancelHeroBtn" style="padding: 10px 30px; font-size: 18px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        scaleWrapper.appendChild(overlay);

        // Add event listeners
        this.setupNewHeroEventListeners();
    }

    setupNewHeroEventListeners() {
        const maleOption = document.getElementById('maleOption');
        const femaleOption = document.getElementById('femaleOption');
        const nameInput = document.getElementById('heroNameInput');
        const confirmBtn = document.getElementById('confirmHeroBtn');
        const cancelBtn = document.getElementById('cancelHeroBtn');

        // Gender selection
maleOption.onclick = () => {
    this.selectedGender = 'male';
    maleOption.style.borderColor = '#4dd0e1';
    maleOption.style.boxShadow = '0 0 20px rgba(77, 208, 225, 0.5)';
    femaleOption.style.borderColor = '#2a6a8a';
    femaleOption.style.boxShadow = 'none';
    
    // Auto-fill random male name
    const randomName = this.maleNames[Math.floor(Math.random() * this.maleNames.length)];
    nameInput.value = randomName;
    
    this.checkFormValidity();
};

femaleOption.onclick = () => {
    this.selectedGender = 'female';
    femaleOption.style.borderColor = '#4dd0e1';
    femaleOption.style.boxShadow = '0 0 20px rgba(77, 208, 225, 0.5)';
    maleOption.style.borderColor = '#2a6a8a';
    maleOption.style.boxShadow = 'none';
    
    // Auto-fill random female name
    const randomName = this.femaleNames[Math.floor(Math.random() * this.femaleNames.length)];
    nameInput.value = randomName;
    
    this.checkFormValidity();
};

        // Name input
        nameInput.oninput = () => {
            this.checkFormValidity();
        };

        // Focus name input
        nameInput.focus();

        // Confirm button
        confirmBtn.onclick = () => {
            if (this.selectedGender && nameInput.value.trim()) {
                this.createNewHero(nameInput.value.trim(), this.selectedGender);
                this.closeNewHeroDialog();
            }
        };

        // Cancel button
cancelBtn.onclick = () => {
    // Only allow cancel if we have at least 3 heroes
    if (this.game.heroes.length >= 3) {
        this.closeNewHeroDialog();
    }
};

// Disable cancel button if less than 3 heroes
if (this.game.heroes.length < 3 || this.isNewGameTutorial) {
    cancelBtn.disabled = true;
    cancelBtn.style.opacity = '0.5';
    cancelBtn.style.cursor = 'default';
}

        // Enter key support
        nameInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !confirmBtn.disabled) {
                confirmBtn.click();
            }
        };
    }

    checkFormValidity() {
        const nameInput = document.getElementById('heroNameInput');
        const confirmBtn = document.getElementById('confirmHeroBtn');
        
        if (this.selectedGender && nameInput.value.trim()) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        } else {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.cursor = 'default';
        }
    }

    closeNewHeroDialog() {
        const overlay = document.getElementById('newHeroOverlay');
        if (overlay) {
            overlay.remove();
        }
        this.selectedGender = null;
    }

    createNewHero(name, gender) {
    // Create new hero
    const newHero = new Hero(`villager_${gender}`);
    newHero.name = name;
    newHero.gender = gender;
    newHero.level = 5;
    newHero.exp = 0;
    newHero.expToNext = newHero.calculateExpToNext();
    
    // Add to game's hero array
    this.game.heroes.push(newHero);
    saveManager.saveToSlot(saveManager.currentSlot, true); // Silent save after creating hero

    // If on heroes screen, update the display
    if (this.game.currentScreen === 'heroesScreen') {
        this.game.uiManager.updateHeroList();
    }
    
    console.log(`Created new hero: ${name} (${gender} villager, level 5)`);
    
    // If this is part of new game tutorial, continue the sequence
    if (this.isNewGameTutorial) {
        this.newGameHeroCount++;
        // Small delay before continuing to next hero
        setTimeout(() => {
            this.continueNewGameTutorial();
        }, 500);
    }
}
    
    skypperAdditionalRecruit(dialogueText = null) {
    // Check if we need to create more heroes
    if (this.game.maxPartySize > this.game.heroes.length) {
        if (dialogueText) {
            // If dialogue text is provided, show dialogue first
            this.npcDialogue('Skypper', dialogueText, false, () => {
                this.showNewHeroCreation();
            });
        } else {
            // If no dialogue text, go straight to hero creation
            this.showNewHeroCreation();
        }
    }
}


    
}

// Initialize tutorial system when game loads
window.addEventListener('DOMContentLoaded', () => {
    // This will be initialized after the game is created
});
