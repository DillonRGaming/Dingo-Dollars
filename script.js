/* START OF FILE script.js */

const COLS = 5;
const ROWS = 3;
const TOTAL_SLOTS = 15;
const MAX_CAPACITY = 8;

const COIN_HEIGHT = 13;
const COIN_DEPTH = 4;
const COIN_GAP = 2;
const SLOT_PADDING = 4;

const board = document.getElementById('game-board');
const mergeBtn = document.getElementById('merge-btn');
const pouchGrid = document.getElementById('pouch-grid');
const failOverlay = document.getElementById('fail-overlay');
const failText = document.getElementById('fail-text');

const sfx = {
    move: new Audio(),
    merge: new Audio(),
    levelup: new Audio(),
    fail: new Audio()
};

let stacks = [];
let lockedState = [];
let pouch = [];
let currentLvl = 1;
let cashBalance = 0;
let selectedIdx = null;
let selectedCount = 0;
let isAnimating = false;
let coinElements = new Map();
let highestCoinCheckpoint = null;

// New Global for Dev Feature
let devDestroyMode = false;

let settings = {
    sound: true,
    haptics: true,
    darkMode: false,
    backgroundType: 'none',
    purchasedThemes: [],
    infiniteMoney: false,
    hardMode: false,
    accentColor: '#ff9f43',
    version: 5
};

const shopItems = [];

const savedData = localStorage.getItem('dingoDollarsSave');
if (savedData) {
    try {
        const d = JSON.parse(savedData);
        if (d.settings) {
            if (d.settings.darkMode) document.body.classList.add('dark-mode');
        }
    } catch(e) {}
}

function init() {
    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        ls.classList.add('fade-out');
    }, 1500);

    board.innerHTML = '';
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const s = document.createElement('div');
        s.className = 'slot';
        s.id = `slot-${i}`;
        s.onclick = () => handleSlotClick(i);
        board.appendChild(s);
    }

    if (savedData) {
        try {
            const d = JSON.parse(savedData);
            stacks = d.stacks;
            lockedState = d.lockedState;
            pouch = d.pouch || [];
            currentLvl = d.currentLvl || 1;
            cashBalance = d.cashBalance || 0;
            settings = d.settings ? { ...settings, ...d.settings } : settings;
            highestCoinCheckpoint = d.highestCoinCheckpoint || null;

            if (pouch.length > 0 && typeof pouch[0] === 'number') {
                pouch = pouch.map(val => ({ val: val, type: 'normal' }));
            }

            if (stacks.length !== TOTAL_SLOTS) {
                const newStacks = Array.from({ length: TOTAL_SLOTS }, () => []);
                const newLocked = Array.from({ length: TOTAL_SLOTS }, (_, i) => i < 10);
                for(let i=0; i<Math.min(stacks.length, TOTAL_SLOTS); i++) {
                    newStacks[i] = stacks[i];
                    newLocked[i] = lockedState[i]; 
                }
                for(let i=10; i<15; i++) newLocked[i] = false;
                stacks = newStacks;
                lockedState = newLocked;
            }
        } catch (e) { newGame(); }
    } else {
        newGame();
    }

    render();
    renderPouch();
    renderShop();
    const canMerge = checkMergeState();
    if (!highestCoinCheckpoint) recordHighLevelCheckpoint();
    evaluateStuck(canMerge);
    setupSettings();
    setupDevControls();
    applyCosmeticThemes();
    updateBackground();
    initCustomSelect('#background-select');
    initCustomSelect('#dev-type-select');
}

function playSound(type) {
    if (settings.sound && sfx[type]) {
        try {
            sfx[type].currentTime = 0;
            sfx[type].play().catch(() => {});
        } catch (e) {}
    }
}

const dropdownParents = new Map();

function initCustomSelect(selector) {
    const selectEl = document.querySelector(selector);
    const trigger = selectEl.querySelector('.custom-select-trigger');
    const options = selectEl.querySelectorAll('.custom-option');
    const optionsContainer = selectEl.querySelector('.custom-options');
    const originalParent = optionsContainer.parentNode;
    dropdownParents.set(selectEl, originalParent);

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = selectEl.classList.contains('open');
        
        document.querySelectorAll('.custom-select').forEach(s => {
            s.classList.remove('open');
            const opts = s.querySelector('.custom-options');
            if(opts) opts.classList.remove('show');
            const parent = dropdownParents.get(s);
            if(opts && parent && opts.parentNode === document.body) {
                parent.appendChild(opts);
            }
        });

        if (!isOpen) {
            selectEl.classList.add('open');
            optionsContainer.classList.add('show');
            document.body.appendChild(optionsContainer);
            updateDropdownPosition(trigger, optionsContainer);
        }
    });

    options.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedOption = selectEl.querySelector('.custom-option.selected');
            if(selectedOption) selectedOption.classList.remove('selected');
            option.classList.add('selected');

            trigger.querySelector('span').textContent = option.textContent;
            selectEl.dataset.value = option.dataset.value;

            selectEl.classList.remove('open');
            optionsContainer.classList.remove('show');
            
            const originalParent = dropdownParents.get(selectEl);
            if (originalParent) {
                originalParent.appendChild(optionsContainer);
            }

            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    function handleScrollResize() {
        if (selectEl.classList.contains('open')) {
            updateDropdownPosition(trigger, optionsContainer);
        }
    }

    window.addEventListener('scroll', handleScrollResize, true); 
    window.addEventListener('resize', handleScrollResize);
}

function updateDropdownPosition(trigger, optionsContainer) {
    const rect = trigger.getBoundingClientRect();
    optionsContainer.style.position = 'fixed';
    optionsContainer.style.top = `${rect.bottom}px`;
    optionsContainer.style.left = `${rect.left}px`;
    optionsContainer.style.width = `${rect.width}px`;
    optionsContainer.style.zIndex = '9999999';
}

window.addEventListener('click', (e) => {
    document.querySelectorAll('.custom-select').forEach(select => {
        const optionsContainer = select.querySelector('.custom-options');
        const isOptionsInBody = optionsContainer.parentNode === document.body;
        
        if (!select.contains(e.target) && !optionsContainer.contains(e.target)) {
            select.classList.remove('open');
            optionsContainer.classList.remove('show');
            const originalParent = dropdownParents.get(select);
            if (isOptionsInBody && originalParent) {
                originalParent.appendChild(optionsContainer);
            }
        }
    });
});

function updateAccentColor(color) {
    settings.accentColor = color;
    document.documentElement.style.setProperty('--accent', color);
    
    document.querySelectorAll('.swatch').forEach(sw => {
        if (sw.dataset.color === color) {
            sw.classList.add('active');
        } else {
            sw.classList.remove('active');
        }
    });
    save();
}

function applyCosmeticThemes() {
    const purchased = settings.purchasedThemes || [];
    if (purchased.includes('coin_pattern_stars')) document.body.classList.add('coin-pattern-stars');
    if (purchased.includes('coin_pattern_stripes')) document.body.classList.add('coin-pattern-stripes');
    if (purchased.includes('bg_gradient')) document.body.classList.add('bg-gradient');
    if (purchased.includes('coin_colors')) document.body.classList.add('coin-colors-set2');
    if (purchased.includes('board_theme')) document.body.classList.add('premium-board-theme');
    updateBackground();
}

function setupSettings() {
    const soundToggle = document.getElementById('sound-toggle');
    const hapticsToggle = document.getElementById('haptics-toggle');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const hardModeBtn = document.getElementById('hard-mode-btn');
    const backgroundSelect = document.getElementById('background-select');

    soundToggle.checked = settings.sound;
    hapticsToggle.checked = settings.haptics;
    darkModeToggle.checked = settings.darkMode;
    
    if (settings.hardMode) {
        hardModeBtn.classList.add('active');
    }

    const initialBgOption = backgroundSelect.querySelector(`.custom-option[data-value="${settings.backgroundType}"]`);
    if (initialBgOption) {
        backgroundSelect.querySelector('.custom-select-trigger span').textContent = initialBgOption.textContent;
        backgroundSelect.dataset.value = settings.backgroundType;
    }

    soundToggle.addEventListener('change', (e) => { settings.sound = e.target.checked; save(); });
    hapticsToggle.addEventListener('change', (e) => { settings.haptics = e.target.checked; save(); });
    darkModeToggle.addEventListener('change', (e) => {
        settings.darkMode = e.target.checked;
        updateTheme();
        save();
    });
    
    hardModeBtn.addEventListener('click', () => {
        settings.hardMode = !settings.hardMode;
        hardModeBtn.classList.toggle('active', settings.hardMode);
        save();
    });

    backgroundSelect.addEventListener('change', (e) => {
        settings.backgroundType = e.target.dataset.value;
        updateBackground();
        save();
    });

    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => updateAccentColor(sw.dataset.color));
    });

    updateTheme();
    updateBackground();
    updateAccentColor(settings.accentColor || '#ff9f43');
}

function setupDevControls() {
    const infiniteMoneyToggle = document.getElementById('infinite-money-toggle');
    const destroyModeToggle = document.getElementById('dev-destroy-toggle');
    const devTypeSelect = document.getElementById('dev-type-select');

    if (infiniteMoneyToggle) {
        infiniteMoneyToggle.checked = settings.infiniteMoney;
        infiniteMoneyToggle.addEventListener('change', (e) => {
            settings.infiniteMoney = e.target.checked;
            save();
            render();
        });
    }

    if (destroyModeToggle) {
        destroyModeToggle.checked = false;
        destroyModeToggle.addEventListener('change', (e) => {
            devDestroyMode = e.target.checked;
            // Clear selection if entering destroy mode
            if(devDestroyMode) {
                selectedIdx = null;
                selectedCount = 0;
                render();
            }
        });
    }

    const initialDevType = 'normal';
    const initialDevOption = devTypeSelect.querySelector(`.custom-option[data-value="${initialDevType}"]`);
    if (initialDevOption) {
        devTypeSelect.querySelector('.custom-select-trigger span').textContent = initialDevOption.textContent;
        devTypeSelect.dataset.value = initialDevType;
    }
}

function updateTheme() {
    document.body.classList.toggle('dark-mode', settings.darkMode);
}

function updateBackground() {
    const gameBoardContainer = document.getElementById('game-board-container');
    document.body.classList.remove('bg-none', 'bg-checkerboard', 'bg-lines');
    gameBoardContainer.classList.remove('bg-none', 'bg-checkerboard', 'bg-lines');

    switch (settings.backgroundType) {
        case 'checkerboard': document.body.classList.add('bg-checkerboard'); break;
        case 'lines': document.body.classList.add('bg-lines'); break;
        default: document.body.classList.add('bg-none'); break;
    }
}

function newGame() {
    stacks = Array.from({ length: TOTAL_SLOTS }, () => []);
    lockedState = Array.from({ length: TOTAL_SLOTS }, (_, i) => i < 10);
    pouch = [];
    currentLvl = 1;
    cashBalance = 0;
    coinElements.clear();
    highestCoinCheckpoint = null;
    recordHighLevelCheckpoint();
    save();
}

function toggleLeftPanel(id) {
    const panels = ['shop-panel', 'coin-pouch', 'settings-panel'];
    const clickedPanel = document.getElementById(id);
    const isOpen = clickedPanel.classList.contains('open');

    panels.forEach(pid => {
        const panel = document.getElementById(pid);
        if (panel.classList.contains('open')) {
            setTimeout(() => { panel.style.zIndex = 5000; }, 300);
        }
        panel.classList.remove('open')
    });

    if (!isOpen) {
        clickedPanel.style.zIndex = 5001;
        clickedPanel.classList.add('open');
    }
}

function toggleRightPanel() {
    document.getElementById('dev-panel').classList.toggle('open');
}

function addRandomCoins(n) {
    let available = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (!lockedState[i] && stacks[i].length < MAX_CAPACITY) {
            available.push(i);
        }
    }
    
    if (available.length === 0) {
        const canMerge = checkMergeState();
        evaluateStuck(canMerge);
        return;
    }

    for (let k = 0; k < n; k++) {
        let currentAvail = available.filter(x => stacks[x].length < MAX_CAPACITY);
        if (currentAvail.length === 0) break;
        const idx = currentAvail[Math.floor(Math.random() * currentAvail.length)];

        let type = 'normal';
        let val = 1;
        const r = Math.random();
        
        const limit = Math.max(currentLvl, 1);
        val = Math.floor(Math.random() * limit) + 1;

        if (currentLvl >= 5 && r > 0.97) {
            // Metallic Logic Fix: Detect uncollected metallics
            let possibleMetallics = [];
            for (let v = 1; v <= limit; v++) {
                if (!pouch.some(p => p.val === v && p.type === 'metallic')) {
                    possibleMetallics.push(v);
                }
            }

            if (possibleMetallics.length > 0) {
                // Found uncollected metallic coins, pick one
                type = 'metallic';
                val = possibleMetallics[Math.floor(Math.random() * possibleMetallics.length)];
            } else {
                // No uncollected metallics available, force normal to prevent stuck duplicates
                type = 'normal';
                // val is already set to a valid random number
            }
        }
        else if (currentLvl >= 15 && r > 0.97) {
            type = 'wild';
            val = 1;
        }
        else if (currentLvl >= 8 && r > 0.95) {
            type = 'bomb';
            val = 1;
        }
        stacks[idx].push({ val, type, id: Math.random().toString(36).substring(2, 9) });
    }
    
    save(); 
    render(); 
    const canMerge = checkMergeState(); 
    evaluateStuck(canMerge);
}

function spawnCoins() {
    if (isAnimating) return;
    addRandomCoins(5);
}

function handleSlotClick(idx) {
    if (isAnimating) return;

    // Handle Dev Destroy Mode
    if (devDestroyMode) {
        if (!lockedState[idx] && stacks[idx].length > 0) {
            stacks[idx].pop();
            playSound('move');
            save();
            render();
            checkMergeState();
        }
        return;
    }

    if (lockedState[idx]) {
        const req = getUnlockLevel(idx);
        if (currentLvl >= req) {
            lockedState[idx] = false;
            save(); render();
        }
        return;
    }

    const stack = stacks[idx];

    if (selectedIdx === null && stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === 'metallic') {
            if (!pouch.some(p => p.val === top.val)) collectToPouch(idx, top);
            return;
        }
    }

    if (selectedIdx === null) {
        if (stack.length > 0) {
            selectedIdx = idx;
            calculateSelection(idx);
            render();
        }
        return;
    }

    if (selectedIdx === idx) {
        selectedIdx = null;
        selectedCount = 0;
        render();
        return;
    }

    if (isValidMove(selectedIdx, idx)) {
        performMove(selectedIdx, idx);
    } else {
        if (stacks[idx].length > 0) {
            selectedIdx = idx;
            calculateSelection(idx);
        } else {
            selectedIdx = null;
            selectedCount = 0;
        }
        render();
    }
}

function calculateSelection(idx) {
    const stack = stacks[idx];
    if (stack.length === 0) { selectedCount = 0; return; }
    const topCard = stack[stack.length - 1];
    if (topCard.type === 'wild' || topCard.type === 'bomb') { selectedCount = 1; return; }
    let count = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].val === topCard.val && stack[i].type !== 'wild') count++;
        else break;
    }
    selectedCount = count;
}

function isValidMove(src, tgt) {
    if (src === tgt) return false;
    if (stacks[tgt].length >= MAX_CAPACITY) return false;

    const srcStack = stacks[src];
    const card = srcStack[srcStack.length - 1];

    if (stacks[tgt].length === 0) return true;

    const tgtCard = stacks[tgt][stacks[tgt].length - 1];
    if (card.type === 'wild' || tgtCard.type === 'wild') return true;
    if (card.type === 'bomb') return true;

    return card.val === tgtCard.val;
}

function performMove(src, tgt) {
    isAnimating = true;
    playSound('move');
    const availableSpace = MAX_CAPACITY - stacks[tgt].length;
    const actualMoveCount = Math.min(selectedCount, availableSpace);
    selectedIdx = null;
    finishMoveLogic(src, tgt, actualMoveCount);
}

function finishMoveLogic(src, tgt, moveCount) {
    const srcStack = stacks[src];
    const tgtStack = stacks[tgt];
    const movingType = srcStack[srcStack.length - moveCount].type;

    if (movingType === 'bomb') {
        srcStack.splice(-1);
        tgtStack.splice(-3);
    } else {
        const moving = srcStack.splice(-moveCount);
        
        if (moving[0].type === 'wild' && tgtStack.length > 0) {
            const targetCoin = tgtStack[tgtStack.length - 1];
            if (targetCoin.type !== 'wild' && targetCoin.type !== 'bomb') {
                moving[0].type = targetCoin.type === 'metallic' ? 'metallic' : 'normal';
                moving[0].val = targetCoin.val;
            }
        }
        
        moving.forEach(c => tgtStack.push(c));
    }

    selectedCount = 0;
    isAnimating = false;
    save(); render(); const canMerge = checkMergeState(); evaluateStuck(canMerge);
}

function checkMergeState() {
    let can = false;
    stacks.forEach((s, i) => {
        if (lockedState[i]) return;
        const slotEl = document.getElementById(`slot-${i}`);
        if (s.length === MAX_CAPACITY) {
            const v = s[0].val;
            if (s.every(c => c.val === v && c.type !== 'wild' && c.type !== 'bomb')) {
                can = true;
                slotEl.classList.add('ready-to-merge');
            } else {
                slotEl.classList.remove('ready-to-merge');
            }
        } else {
            slotEl.classList.remove('ready-to-merge');
        }
    });
    mergeBtn.classList.toggle('active', can);
    return can;
}

function triggerMerge() {
    if (isAnimating) return;
    let merged = false;
    let newHighReached = false;

    stacks.forEach((s, i) => {
        if (lockedState[i]) return;
        if (s.length === MAX_CAPACITY) {
            const v = s[0].val;
            if (s.every(c => c.val === v && c.type !== 'wild')) {
                const nV = v + 1;
                
                if (nV > currentLvl) {
                    currentLvl = nV;
                    newHighReached = true;
                }

                if (!settings.infiniteMoney) {
                    cashBalance += v;
                }

                stacks[i] = [{ val: nV, type: 'normal', id: Math.random().toString(36).substring(2, 9) }];
                merged = true;
                const el = document.getElementById(`slot-${i}`);
                el.classList.remove('merging');
                void el.offsetWidth;
                el.classList.add('merging');
            }
        }
    });

    if (merged) { 
        if(newHighReached) {
            playSound('levelup');
            recordHighLevelCheckpoint();
        } else {
            playSound('merge');
        }
        
        save(); 
        render(); 
        const canMerge = checkMergeState(); 
        evaluateStuck(canMerge); 
    }
}

function collectToPouch(idx, coin) {
    isAnimating = true;
    if (!document.getElementById('coin-pouch').classList.contains('open')) {
        toggleLeftPanel('coin-pouch');
    }
    setTimeout(() => {
        stacks[idx].pop();
        pouch.push({ val: coin.val, type: coin.type });
        renderPouch(); save(); render();
        isAnimating = false;
    }, 400);
}

function render() {
    document.getElementById('max-display').innerText = currentLvl;
    if (settings.infiniteMoney) {
        document.getElementById('cash-display').innerHTML = '&infin;';
    } else {
        document.getElementById('cash-display').innerText = cashBalance;
    }

    const activeIds = new Set();

    stacks.forEach((stack, slotIdx) => {
        const slotEl = document.getElementById(`slot-${slotIdx}`);

        if (lockedState[slotIdx]) {
            slotEl.classList.add('locked');
            const req = getUnlockLevel(slotIdx);
            slotEl.innerHTML = currentLvl >= req
                ? '<i class="fa-solid fa-lock-open" style="color:#2ecc71"></i>'
                : `<i class="fa-solid fa-lock"></i><span style="font-size:0.7rem;margin-top:5px">${req}</span>`;
            return;
        } else {
            slotEl.classList.remove('locked');
            if (slotEl.querySelector('.fa-lock') || slotEl.querySelector('.fa-lock-open')) slotEl.innerHTML = '';
        }

        stack.forEach((coin, cIdx) => {
            activeIds.add(coin.id);
            let coinEl = coinElements.get(coin.id);

            if (!coinEl) {
                coinEl = document.createElement('div');
                coinEl.className = `coin ${coin.type}`;
                if (coin.type === 'wild') coinEl.innerHTML = '<i class="fa-solid fa-star"></i>';
                else if (coin.type === 'bomb') coinEl.innerHTML = '<i class="fa-solid fa-bomb"></i>';
                else coinEl.innerText = coin.val;

                coinElements.set(coin.id, coinEl);
                slotEl.appendChild(coinEl);
            }

            if (coinEl) {
                coinEl.style.opacity = 1;
                coinEl.className = `coin ${coin.type}`;
                if (coin.type === 'wild') coinEl.innerHTML = '<i class="fa-solid fa-star"></i>';
                else if (coin.type === 'bomb') coinEl.innerHTML = '<i class="fa-solid fa-bomb"></i>';
                else coinEl.innerText = coin.val;

                const hue = (coin.val * 41) % 360;
                coinEl.style.setProperty('--hue', hue);

                if (coinEl.parentElement !== slotEl) slotEl.appendChild(coinEl);

                const bottomPos = SLOT_PADDING + (cIdx * (COIN_HEIGHT + COIN_GAP));
                coinEl.style.setProperty('--coin-bottom', `${bottomPos}px`);
                coinEl.style.top = 'auto';

                coinEl.classList.remove('selected');
                if (selectedIdx === slotIdx && !isAnimating) {
                    if (cIdx >= stack.length - selectedCount) {
                        coinEl.classList.add('selected');
                    }
                }
            }
        });
    });

    for (const [id, el] of coinElements) {
        if (!activeIds.has(id)) {
            el.remove();
            coinElements.delete(id);
        }
    }
}

function renderPouch() {
    pouchGrid.innerHTML = '';
    const limit = Math.max(20, currentLvl + 5);
    for (let i = 1; i <= limit; i++) {
        const row = document.createElement('div');
        row.className = 'pouch-row';

        const numDiv = document.createElement('div');
        numDiv.className = 'pouch-number';
        numDiv.innerText = i;

        const coinDiv = document.createElement('div');
        coinDiv.className = 'exact-coin';

        const pouchItem = pouch.find(item => item.val === i);

        if (pouchItem) {
            coinDiv.classList.add('collected');
            coinDiv.style.setProperty('--hue', (i * 41) % 360);
            coinDiv.innerText = i;

            if (pouchItem.type === 'metallic') coinDiv.classList.add('metallic');
            else if (pouchItem.type === 'wild') coinDiv.classList.add('wild');
            else if (pouchItem.type === 'bomb') coinDiv.classList.add('bomb');
        } else {
            coinDiv.innerText = '?';
            coinDiv.style.color = '#888';
        }
        row.appendChild(numDiv);
        row.appendChild(coinDiv);
        pouchGrid.appendChild(row);
    }
}

function renderShop() {
    const shopContent = document.getElementById('shop-content');
    shopContent.innerHTML = '';

    if (shopItems.length === 0) {
        shopContent.innerHTML = '<div style="text-align: center; color: #888; padding: 20px 0;">No items available</div>';
        return;
    }

    shopItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'shop-item';
        itemDiv.innerHTML = `
            <div class="shop-item-name">${item.name}</div>
            <div class="shop-item-desc">${item.desc}</div>
            <div class="shop-item-cost">Cost: ${item.cost} cash</div>
            <button class="shop-buy-btn" onclick="buyItem('${item.id}')" ${(!settings.infiniteMoney && cashBalance < item.cost) ? 'disabled' : ''}>Buy</button>
        `;
        shopContent.appendChild(itemDiv);
    });
}

function buyItem(id) {
    const item = shopItems.find(i => i.id === id);
    if (!item) return;

    if (!settings.infiniteMoney && cashBalance < item.cost) return;

    if (!settings.infiniteMoney) {
        cashBalance -= item.cost;
    }

    if (id === 'coin_pattern_stars') {
        document.body.classList.add('coin-pattern-stars');
        if (!settings.purchasedThemes.includes('coin_pattern_stars')) settings.purchasedThemes.push('coin_pattern_stars');
    } else if (id === 'coin_pattern_stripes') {
        document.body.classList.add('coin-pattern-stripes');
        if (!settings.purchasedThemes.includes('coin_pattern_stripes')) settings.purchasedThemes.push('coin_pattern-stripes');
    } else if (id === 'bg_gradient') {
        document.body.classList.add('bg-gradient');
        if (!settings.purchasedThemes.includes('bg_gradient')) settings.purchasedThemes.push('bg_gradient');
    } else if (id === 'custom_sound') {
        if (!settings.purchasedThemes.includes('custom_sound')) settings.purchasedThemes.push('custom_sound');
    } else if (id === 'coin_colors') {
        document.body.classList.add('coin-colors-set2');
        if (!settings.purchasedThemes.includes('coin_colors')) settings.purchasedThemes.push('coin_colors');
    } else if (id === 'board_theme') {
        document.body.classList.add('premium-board-theme');
        if (!settings.purchasedThemes.includes('board_theme')) settings.purchasedThemes.push('board_theme');
    }

    save(); render(); renderShop();
}

function getUnlockLevel(i) {
    if (i < 5) return (i + 1) * 2 + 10;
    if (i < 10) return ((i - 5) + 1) * 2;
    return 0;
}

function showFail(text) {
    failText.innerText = text;
    failOverlay.classList.add('visible');
    playSound('fail');
    setTimeout(() => {
        failOverlay.classList.remove('visible');
    }, 2000);
}

function save() { localStorage.setItem('dingoDollarsSave', JSON.stringify({ stacks, lockedState, pouch, currentLvl, cashBalance, settings, highestCoinCheckpoint })); }
function hardReset() {
    let savedSettings = null;
    const savedData = localStorage.getItem('dingoDollarsSave');
    if (savedData) {
        try {
            const d = JSON.parse(savedData);
            if (d.settings) {
                savedSettings = d.settings;
            }
        } catch (e) { console.error("Error parsing saved data for reset:", e); }
    }
    
    newGame();
    
    if (savedSettings) {
        settings = { ...settings, ...savedSettings };
    }
    
    save();
    location.reload();
}
function devSpawn() {
    const v = parseInt(document.getElementById('dev-val').value);
    const t = document.getElementById('dev-type-select').dataset.value || 'normal';
    const count = parseInt(document.getElementById('dev-count').value) || 1;

    for (let j = 0; j < count; j++) {
        let spawned = false;
        for (let i = 0; i < TOTAL_SLOTS; i++) {
            if (!lockedState[i] && stacks[i].length < MAX_CAPACITY) {
                stacks[i].push({ val: v, type: t, id: Math.random().toString(36).substring(2, 9) });
                spawned = true;
                break;
            }
        }
        if (!spawned) break;
    }
    
    save(); 
    render(); 
    const canMerge = checkMergeState(); 
    evaluateStuck(canMerge);
}

function snapshotState() {
    return {
        stacks: JSON.parse(JSON.stringify(stacks)),
        lockedState: [...lockedState],
        pouch: JSON.parse(JSON.stringify(pouch)),
        currentLvl,
        cashBalance,
        settings: JSON.parse(JSON.stringify(settings))
    };
}

function applyState(snap) {
    stacks = JSON.parse(JSON.stringify(snap.stacks));
    lockedState = [...snap.lockedState];
    pouch = JSON.parse(JSON.stringify(snap.pouch));
    currentLvl = snap.currentLvl;
    cashBalance = snap.cashBalance;
    settings = JSON.parse(JSON.stringify(snap.settings));
}

function isBoardFull() {
    let hasSpace = false;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (!lockedState[i]) {
            if (stacks[i].length < MAX_CAPACITY) {
                hasSpace = true;
                break;
            }
        }
    }
    return !hasSpace;
}

function recordHighLevelCheckpoint() {
    highestCoinCheckpoint = snapshotState();
    save();
}

function restoreHighLevelCheckpoint() {
    if (highestCoinCheckpoint) {
        applyState(highestCoinCheckpoint);
        render();
        checkMergeState();
        save();
    } else {
        newGame();
    }
}

function evaluateStuck(canMerge) {
    const full = isBoardFull();
    if (full && !canMerge) {
        if (settings.hardMode) {
            showFail("GAME OVER");
            setTimeout(() => hardReset(), 2000);
        } else {
            showFail("STUCK");
            setTimeout(() => {
                restoreHighLevelCheckpoint();
            }, 2000);
        }
    }
}

init();