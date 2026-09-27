/**
 * Stadium Wave Game - Main JavaScript Entry
 * Handles rendering, input, and the game loop
 */

import { gameAPI } from './engine.js';

// Global state
let canvas = null;
let ctx = null;
let gameState = null;
let lastTime = 0;
let animationId = null;
let isGameRunning = false;
let isPaused = false;
let gameStartTime = 0;
let totalGameTime = 0;
let waveAttempts = 0;
let successfulWaves = 0;
let currentStreak = 0;
let soundEnabled = true;
let audioContext = null;
let masterGain = null;
let compressor = null;
let masterVolume = 1;
let difficulty = 'medium';
let gameMode = 'practice';
let hoveredSector = -1;
let selectedSector = -1; // chosen by tap, click, or arrow keys; target of the Boost button
let blockedSectorFlash = null; // { sector, until } highlights the sector that stopped a wave
let fieldType = 'soccer';
let stadiumType = 'classic';
let weatherType = 'sunny';
let timeOfDay = 'day';
let weatherParticles = [];
let activeEventIndicators = [];
let lastAutoSaveTime = 0;
const AUTO_SAVE_INTERVAL = 30000; // Auto-save every 30 seconds

// Event listener cleanup
let eventListeners = [];

const SOUND_PROFILES = {
    success: {
        wave: 'triangle',
        frequency: { start: 740, end: 880 },
        duration: 0.25,
        gain: 0.35,
        attack: 0.01,
        release: 0.15
    },
    fail: {
        wave: 'sawtooth',
        frequency: { start: 220, end: 120 },
        duration: 0.35,
        gain: 0.25,
        attack: 0.01,
        release: 0.2
    },
    alert: {
        wave: 'square',
        frequency: { start: 660, end: 660 },
        duration: 0.18,
        gain: 0.28,
        attack: 0.005,
        release: 0.12,
        repeat: 2,
        interval: 0.12
    },
    powerup: {
        wave: 'sine',
        frequency: { start: 440, end: 960 },
        duration: 0.45,
        gain: 0.32,
        attack: 0.015,
        release: 0.25
    }
};

// Short labels for the engine's sector block reasons
const READINESS_LABELS = {
    standing: 'Still standing',
    anticipating: 'Getting ready',
    distracted: 'Distracted',
    fatigued: 'Tired',
    low_energy: 'Low energy'
};

// What to tell the player when a sector refuses the wave
const FAILURE_HINTS = {
    standing: 'was still standing. Give sectors time to sit before the wave returns.',
    anticipating: 'was already getting ready. Wait for the current wave to pass.',
    distracted: 'was distracted by the mascot. Boost it to refocus the crowd.',
    fatigued: 'was too tired. Let it rest, or boost it before the wave arrives.',
    low_energy: 'ran out of energy. Boost it before the wave arrives.'
};

const BLOCKED_FLASH_MS = 2500;

// Canvas settings
const STADIUM_RADIUS = 250;
const SECTOR_HEIGHT = 60;
const SOCCER_FIELD_ASPECT = 105 / 68; // landscape: long (105m) side is width
const FOOTBALL_FIELD_ASPECT = 120 / 53.3; // landscape: long (120 yd) side is width
const MAX_WEATHER_PARTICLES = 150;
// Particles are pre-assigned to a few discrete opacity buckets so each
// bucket renders as one batched path instead of per-particle state changes
const RAIN_OPACITY_BUCKETS = [0.3, 0.45, 0.6];
const SNOW_OPACITY_BUCKETS = [0.5, 0.7, 0.9];

function getMaxWeatherParticles() {
    switch (performanceTier) {
        case 'low':
            return 60;
        case 'medium':
            return 100;
        default:
            return MAX_WEATHER_PARTICLES;
    }
}

// Stadium color themes
const STADIUM_THEMES = {
    classic: {
        idle: '#2563eb',
        anticipating: '#fbbf24',
        standing: '#10b981',
        seated: '#6366f1',
        border: 'rgba(255, 255, 255, 0.3)',
        hoverBorder: 'rgba(255, 255, 255, 0.8)'
    },
    modern: {
        idle: '#8b5cf6',
        anticipating: '#f97316',
        standing: '#06b6d4',
        seated: '#a855f7',
        border: 'rgba(255, 255, 255, 0.4)',
        hoverBorder: 'rgba(255, 255, 0, 0.9)'
    },
    retro: {
        idle: '#dc2626',
        anticipating: '#f59e0b',
        standing: '#16a34a',
        seated: '#be123c',
        border: 'rgba(255, 255, 200, 0.4)',
        hoverBorder: 'rgba(255, 255, 100, 0.95)'
    }
};

// Baseball field colors
const BASEBALL_FIELD_COLORS = {
    dirt: '#c68642',
    basePath: '#f5e0c3',
    base: '#f5f5f5',
    pitchersMound: '#d9a066',
    homePlate: '#ffffff',
    foulLine: 'rgba(255, 255, 255, 0.8)'
};

// Baseball field layout constants
const BASEBALL_COS_45 = Math.sqrt(2) / 2;  // ~0.707, for 45-degree angle calculations
const BASEBALL_MOUND_DISTANCE_RATIO = 0.9;  // Pitcher's mound is 90% of base distance from home

// Performance optimization
let sectorPaths = [];
let offscreenCanvas = null;
let offscreenCtx = null;
let overlayCanvas = null;
let overlayCtx = null;
let fieldCacheValid = false;
let overlayCacheValid = false;
let resizeTimeout = null;
let fieldGradients = {};
let triggerCanvasResize = null;
const sectorColorCache = new Map();

// The engine ticks at a lower rate than the render loop; crowd state changes
// over 0.2-1.5s windows, so 30Hz is indistinguishable and halves bridge cost.
const ENGINE_UPDATE_INTERVAL = 1 / 30;
let engineTimeAccumulator = 0;

// Cached HUD element refs and last written values (avoid per-frame
// getElementById lookups and redundant textContent writes)
const hudElements = {};
const lastHudText = {};

// Performance tier and monitoring
let performanceTier = 'high'; // 'low', 'medium', 'high'
let baselinePerformanceTier = 'high'; // detected ceiling; recovery never exceeds it
let goodFpsSeconds = 0;
let effectivePixelRatio = 1;
let isTabVisible = true;
let lastFrameTime = 0;
let frameCount = 0;
let fpsHistory = [];
const TARGET_FPS = 60;
const LOW_FPS_THRESHOLD = 30;
const HIGH_FPS_THRESHOLD = 55;
const TIER_RECOVERY_SECONDS = 30;
const TIER_RANK = { low: 0, medium: 1, high: 2 };
const TIER_BY_RANK = ['low', 'medium', 'high'];
const PERFORMANCE_TIER_LOW_THRESHOLD = 40;
const PERFORMANCE_TIER_MEDIUM_THRESHOLD = 70;
const HIDDEN_TAB_UPDATE_INTERVAL = 200; // milliseconds

// Performance metrics
let performanceMetrics = {
    frameTimings: [],
    renderTimings: [],
    updateTimings: [],
    lastGCTime: 0,
    avgFrameTime: 0
};

// Object pools for performance
const notificationPool = [];
const MAX_POOL_SIZE = 10;

/**
 * Get effective pixel ratio for a given performance tier
 */
function getEffectivePixelRatio(tier) {
    const dpr = window.devicePixelRatio || 1;
    switch (tier) {
        case 'low':
            return Math.min(dpr, 1);
        case 'medium':
            return Math.min(dpr, 1.5);
        case 'high':
        default:
            return dpr;
    }
}

/**
 * Save performance tier to localStorage
 */
function savePerformanceTier() {
    try {
        localStorage.setItem('wave_performance_tier', performanceTier);
    } catch (e) {
        console.warn('Could not save performance tier to localStorage');
    }
}

/**
 * Load previously measured performance tier from localStorage
 */
function loadSavedPerformanceTier() {
    try {
        const tier = localStorage.getItem('wave_performance_tier');
        return TIER_RANK.hasOwnProperty(tier) ? tier : null;
    } catch (e) {
        return null;
    }
}

/**
 * Save game state to localStorage with quota error handling
 */
function saveGameState() {
    if (!gameState) return;

    try {
        const gameData = {
            gameState: gameState,
            waveAttempts: waveAttempts,
            successfulWaves: successfulWaves,
            currentStreak: currentStreak,
            totalGameTime: totalGameTime,
            difficulty: difficulty,
            fieldType: fieldType,
            stadiumType: stadiumType,
            timestamp: Date.now()
        };

        const serialized = JSON.stringify(gameData);

        // Check if we're approaching quota limits (5MB typical limit)
        if (serialized.length > 4 * 1024 * 1024) {
            console.warn('Game state is large, may exceed localStorage quota');
        }

        localStorage.setItem('wave_game_state', serialized);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.error('localStorage quota exceeded. Cannot save game state.');
            showNotification('Storage full - unable to save game state', 'error');
        } else {
            console.warn('Could not save game state to localStorage:', e.message);
        }
    }
}

/**
 * Load game state from localStorage
 * @returns {boolean} true if state was loaded successfully
 */
function loadGameState() {
    try {
        const serialized = localStorage.getItem('wave_game_state');
        if (!serialized) return false;

        const gameData = JSON.parse(serialized);

        // Validate the loaded data has required fields
        if (!gameData.gameState || !gameData.timestamp) {
            console.warn('Invalid game state data in localStorage');
            return false;
        }

        // Check if saved state is not too old (e.g., 7 days)
        const age = Date.now() - gameData.timestamp;
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (age > maxAge) {
            console.log('Saved game state is too old, starting fresh');
            localStorage.removeItem('wave_game_state');
            return false;
        }

        // Restore state
        gameState = gameData.gameState;
        waveAttempts = gameData.waveAttempts || 0;
        successfulWaves = gameData.successfulWaves || 0;
        currentStreak = gameData.currentStreak || 0;
        totalGameTime = gameData.totalGameTime || 0;
        difficulty = gameData.difficulty || 'medium';
        fieldType = gameData.fieldType || 'soccer';
        stadiumType = gameData.stadiumType || 'classic';

        console.log('Game state loaded from localStorage');
        return true;
    } catch (e) {
        console.warn('Could not load game state from localStorage:', e.message);
        // Remove corrupted data
        try {
            localStorage.removeItem('wave_game_state');
        } catch (removeError) {
            // Ignore errors when trying to remove
        }
        return false;
    }
}

/**
 * Clear saved game state from localStorage
 */
function clearGameState() {
    try {
        localStorage.removeItem('wave_game_state');
    } catch (e) {
        console.warn('Could not clear game state from localStorage');
    }
}

/**
 * Detect device capabilities and set performance tier
 */
function detectPerformanceTier() {
    const dpr = window.devicePixelRatio || 1;
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
    };
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Calculate a performance score
    let score = 100;
    
    // High DPR can be expensive (e.g., Retina displays)
    if (dpr > 2) score -= 20;
    else if (dpr > 1.5) score -= 10;
    
    // Small viewports typically indicate mobile devices
    const viewportArea = viewport.width * viewport.height;
    if (viewportArea < 500000) score -= 30; // ~700x700 or smaller
    else if (viewportArea < 1000000) score -= 15; // ~1000x1000 or smaller
    
    // Mobile devices generally have less power
    if (isMobile || isTouch) score -= 20;
    
    // Check if hardware concurrency is available (number of CPU cores)
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
        score -= 15;
    }
    
    // Determine tier based on score
    let detectedTier;
    if (score < PERFORMANCE_TIER_LOW_THRESHOLD) {
        detectedTier = 'low';
    } else if (score < PERFORMANCE_TIER_MEDIUM_THRESHOLD) {
        detectedTier = 'medium';
    } else {
        detectedTier = 'high';
    }

    baselinePerformanceTier = detectedTier;

    // Start from the previously measured tier when it is lower than the
    // heuristic, so a device that auto-downgraded last session doesn't have
    // to re-discover the slowdown. Recovery can step it back up.
    const savedTier = loadSavedPerformanceTier();
    performanceTier = savedTier && TIER_RANK[savedTier] < TIER_RANK[detectedTier]
        ? savedTier
        : detectedTier;

    effectivePixelRatio = getEffectivePixelRatio(performanceTier);

    console.log(`Performance tier: ${performanceTier} (score: ${score}, DPR: ${dpr} -> ${effectivePixelRatio})`);

    // Store in localStorage for consistency
    savePerformanceTier();

    return performanceTier;
}

/**
 * Apply a performance tier change: update DPR, persist, and resize the canvas
 */
function applyPerformanceTierChange() {
    effectivePixelRatio = getEffectivePixelRatio(performanceTier);
    savePerformanceTier();
    fpsHistory = [];
    goodFpsSeconds = 0;
    if (triggerCanvasResize) {
        triggerCanvasResize();
    }
}

/**
 * Monitor FPS and adjust performance tier if needed
 */
function monitorPerformance(timestamp) {
    frameCount++;

    // Calculate FPS every second
    if (timestamp - lastFrameTime >= 1000) {
        const fps = frameCount;
        fpsHistory.push(fps);

        // Keep only last 5 seconds of history
        if (fpsHistory.length > 5) {
            fpsHistory.shift();
        }

        // Calculate average FPS
        const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;

        // Update performance metrics
        performanceMetrics.avgFrameTime = 1000 / avgFps;

        // Auto-downgrade if consistently low FPS
        if (avgFps < LOW_FPS_THRESHOLD && performanceTier !== 'low') {
            console.warn(`Low FPS detected (${avgFps.toFixed(1)}), downgrading performance tier`);
            performanceTier = TIER_BY_RANK[TIER_RANK[performanceTier] - 1];
            applyPerformanceTierChange();
        } else if (avgFps >= HIGH_FPS_THRESHOLD &&
                   TIER_RANK[performanceTier] < TIER_RANK[baselinePerformanceTier]) {
            // Recover one tier after sustained good FPS (never past the
            // detected baseline, to avoid oscillating beyond device limits)
            goodFpsSeconds++;
            if (goodFpsSeconds >= TIER_RECOVERY_SECONDS) {
                console.log(`Sustained ${avgFps.toFixed(1)} FPS, upgrading performance tier`);
                performanceTier = TIER_BY_RANK[TIER_RANK[performanceTier] + 1];
                applyPerformanceTierChange();
            }
        } else {
            goodFpsSeconds = 0;
        }

        frameCount = 0;
        lastFrameTime = timestamp;
    }
}

/**
 * Collect performance metrics
 */
function collectPerformanceMetrics(frameTime, renderTime, updateTime) {
    const metrics = performanceMetrics;

    // Track frame timings (keep last 60 frames)
    metrics.frameTimings.push(frameTime);
    if (metrics.frameTimings.length > 60) {
        metrics.frameTimings.shift();
    }

    // Track render timings
    metrics.renderTimings.push(renderTime);
    if (metrics.renderTimings.length > 60) {
        metrics.renderTimings.shift();
    }

    // Track update timings
    metrics.updateTimings.push(updateTime);
    if (metrics.updateTimings.length > 60) {
        metrics.updateTimings.shift();
    }
}

/**
 * Get performance statistics
 */
function getPerformanceStats() {
    const metrics = performanceMetrics;
    return {
        avgFrameTime: metrics.avgFrameTime,
        // Peak over the last 60 frames, so one bad frame at startup
        // doesn't poison the metric for the whole session
        peakFrameTime: metrics.frameTimings.length > 0
            ? Math.max(...metrics.frameTimings)
            : 0,
        avgRenderTime: metrics.renderTimings.length > 0
            ? metrics.renderTimings.reduce((a, b) => a + b, 0) / metrics.renderTimings.length
            : 0,
        avgUpdateTime: metrics.updateTimings.length > 0
            ? metrics.updateTimings.reduce((a, b) => a + b, 0) / metrics.updateTimings.length
            : 0,
        performanceTier
    };
}

/**
 * Setup Page Visibility API to handle tab backgrounding
 */
function setupVisibilityHandler() {
    // Handle visibility change
    addTrackedEventListener(document, 'visibilitychange', () => {
        isTabVisible = !document.hidden;

        if (isTabVisible) {
            console.log('Tab visible - resuming normal rendering');
            // Reset lastTime to prevent large dt jump
            lastTime = 0;
            // Reset to 0 so first hidden frame after next hide will execute immediately
            lastHiddenUpdateTime = 0;
        } else {
            console.log('Tab hidden - throttling rendering');
            // Initialize hidden update time to current time to start throttling
            lastHiddenUpdateTime = performance.now();
            // Auto-save game state when tab becomes hidden
            if (isGameRunning && gameState) {
                saveGameState();
            }
        }
    });
}

/**
 * Determine if expensive effects should be rendered based on performance tier
 */
function shouldRenderExpensiveEffects() {
    return performanceTier === 'high';
}

/**
 * Determine if detailed animations should be rendered
 */
function shouldRenderDetailedAnimations() {
    return performanceTier !== 'low';
}

/**
 * Initialize a new engine run
 */
function initGame() {
    try {
        const result = gameAPI.init_game(16, fieldType, weatherType, difficulty, gameMode);
        console.log('Game initialized:', result);
        return true;
    } catch (error) {
        console.error('Failed to initialize game:', error);
        return false;
    }
}

/**
 * Advance the engine and apply its state and events (with error handling)
 */
function updateGameState(dt) {
    try {
        // Single engine call per tick returning both state and events as
        // plain objects (no JSON round trip)
        const payload = gameAPI.update_game_with_events(dt);

        gameState = payload.state;
        payload.events.forEach(event => handleGameEvent(event));

        return gameState;
    } catch (error) {
        console.error('Failed to update game state:', error);
        // Attempt recovery by reinitializing if state is corrupted
        if (!gameState) {
            console.warn('Game state corrupted, attempting recovery...');
            try {
                initGame();
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
        }
        return null;
    }
}

/**
 * Handle game events from the engine
 */
function handleGameEvent(event) {
    switch (event.type) {
        case 'wave_started':
            console.log('Wave started at sector', event.data);
            waveAttempts++;
            // Show pattern notification
            if (event.data && event.data.pattern) {
                const patternName = formatPatternName(event.data.pattern);
                const direction = event.data.direction || 'clockwise';
                showNotification(`${patternName} wave started (${direction})!`, 'info');
            }
            break;
        case 'wave_completed':
            const patternBonus = event.data.pattern ? ` (${formatPatternName(event.data.pattern)})` : '';
            showNotification(`Wave Complete${patternBonus}! +${Math.floor(event.data.bonus)} points`, 'success');
            playSound('success');
            successfulWaves++;
            currentStreak++;
            break;
        case 'wave_failed':
            showNotification(describeWaveFailure(event.data), 'failure');
            if (event.data && typeof event.data.sector === 'number') {
                blockedSectorFlash = { sector: event.data.sector, until: performance.now() + BLOCKED_FLASH_MS };
            }
            playSound('fail');
            currentStreak = 0;
            break;
        case 'mascot':
            if (event.data && typeof event.data.sector === 'number') {
                showNotification(`Mascot distraction near sector ${event.data.sector}!`, 'failure');
            } else {
                showNotification('Mascot distraction!', 'failure');
            }
            addEventIndicator('mascot', event.data || {});
            playSound('alert');
            break;
        case 'scoreboard':
            showNotification('Scoreboard hype! Crowd energy boosted.', 'success');
            addEventIndicator('scoreboard', event.data || {});
            playSound('powerup');
            break;
        case 'challenge_completed':
        case 'challenge_failed':
            showChallengeResult(event.type === 'challenge_completed', event.data);
            break;
    }
}

/**
 * End a challenge run and show its result with a retry option
 */
function showChallengeResult(won, data) {
    // Play before stopping: stopping the loop disconnects the audio graph
    playSound(won ? 'success' : 'fail');
    // Refresh the stats panel while the loop is still marked running
    updateStats(0);
    stopGameLoop();
    // Draw the final state so the HUD matches the result
    render();

    document.getElementById('result-title').textContent = won
        ? '🏆 Challenge Complete!'
        : "⏱️ Time's Up!";
    document.getElementById('result-summary').textContent = won
        ? `${data.waves}/${data.target_waves} waves in ${formatTime(data.time_used)}. Score: ${data.score}`
        : `${data.waves}/${data.target_waves} waves completed. Score: ${data.score}`;
    document.getElementById('result-overlay').classList.remove('hidden');
    document.getElementById('retry-btn').focus();
}

function hideChallengeResult() {
    document.getElementById('result-overlay').classList.add('hidden');
}

/**
 * Explain which sector stopped the wave, why, and what to do about it
 */
function describeWaveFailure(data) {
    if (!data || typeof data.sector !== 'number') {
        return 'Wave Failed!';
    }
    const front = data.front === 'secondary' ? 'Second wave failed' : 'Wave failed';
    const hint = FAILURE_HINTS[data.reason] || 'could not join the wave.';
    return `${front}: Sector ${data.sector} ${hint}`;
}

/**
 * Format pattern name for display
 */
function formatPatternName(pattern) {
    switch (pattern) {
        case 'normal': return 'Normal';
        case 'reverse': return 'Reverse';
        case 'double': return 'Double';
        case 'accelerating': return 'Accelerating';
        default: return pattern;
    }
}

/**
 * Show notification message (optimized with object pooling)
 */
function showNotification(message, type = 'success') {
    // Try to reuse existing notification from pool
    let notification = notificationPool.pop();

    if (!notification) {
        // Create new notification if pool is empty
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = type;
    } else {
        // Reset notification properties
        notification.className = type;
    }

    notification.textContent = message;

    // Remove existing notification if any
    const existing = document.getElementById('notification');
    if (existing && existing !== notification) {
        existing.remove();
    }

    document.getElementById('game-container').appendChild(notification);

    // Return notification to pool after use
    setTimeout(() => {
        notification.remove();
        if (notificationPool.length < MAX_POOL_SIZE) {
            notificationPool.push(notification);
        }
    }, 2000);
}

function initAudioContext() {
    if (audioContext || !window.AudioContext) return;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor();

    masterGain.gain.value = masterVolume;
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
}

function resumeAudioContext() {
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function setMasterVolume(value) {
    masterVolume = value;
    if (masterGain && audioContext) {
        masterGain.gain.setTargetAtTime(value, audioContext.currentTime, 0.01);
    }
}

function createTone(profile, startTime) {
    const duration = profile.duration ?? 0.25;
    const attack = profile.attack ?? 0.01;
    const release = profile.release ?? 0.12;
    const endTime = startTime + duration + release;

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    const startFreq = profile.frequency?.start ?? profile.frequency ?? 440;
    const endFreq = profile.frequency?.end ?? startFreq;

    osc.type = profile.wave || 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== startFreq) {
        osc.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
    }

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(profile.gain, startTime + attack);
    gainNode.gain.linearRampToValueAtTime(0.0001, endTime);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(startTime);
    osc.stop(endTime + 0.05);
}

/**
 * Play sound effect via Web Audio API
 */
function playSound(type) {
    if (!soundEnabled) return;

    initAudioContext();
    if (!audioContext || !masterGain) return;

    resumeAudioContext();

    const profile = SOUND_PROFILES[type] || SOUND_PROFILES.success;
    const now = audioContext.currentTime;
    const repeatCount = profile.repeat || 1;
    const interval = profile.interval || profile.duration || 0.2;

    for (let i = 0; i < repeatCount; i++) {
        createTone(profile, now + i * interval);
    }
}

/**
 * Add an on-canvas indicator for special events
 */
function addEventIndicator(type, data = {}) {
    activeEventIndicators.push({
        type,
        data,
        start: performance.now(),
        duration: type === 'mascot' ? 2800 : 2200
    });
}

/**
 * Toggle pause state
 */
function togglePause() {
    isPaused = !isPaused;
    const pauseOverlay = document.getElementById('pause-overlay');
    const pauseBtn = document.getElementById('pause-btn');

    if (isPaused) {
        pauseOverlay.classList.remove('hidden');
        pauseBtn.textContent = '▶';
        pauseBtn.title = 'Resume Game';
        // Auto-save when pausing
        saveGameState();
    } else {
        pauseOverlay.classList.add('hidden');
        pauseBtn.textContent = '⏸';
        pauseBtn.title = 'Pause Game';
        lastTime = 0; // Reset time to prevent large dt jump
    }
}

/**
 * Toggle help overlay
 */
function toggleHelp() {
    const helpOverlay = document.getElementById('help-overlay');
    helpOverlay.classList.toggle('hidden');
}

/**
 * Toggle fullscreen
 */
function toggleFullscreen() {
    const container = document.getElementById('game-container');
    
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.log('Fullscreen request failed:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

/**
 * Format time as MM:SS
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update stats panel
 */
function updateStats(dt) {
    if (!isGameRunning || isPaused) return;
    
    // Update game time
    totalGameTime += dt;
    setHudText('game-time', formatTime(totalGameTime));

    // Update accuracy
    const accuracy = waveAttempts > 0 ? (successfulWaves / waveAttempts * 100).toFixed(0) : '100';
    setHudText('accuracy', accuracy + '%');

    // Update streak
    setHudText('streak', String(currentStreak));

    // Update challenge progress
    const challenge = gameState && gameState.challenge;
    if (challenge) {
        setHudText('challenge-progress', `${gameState.successful_waves}/${challenge.target_waves}`);
        setHudText('challenge-time', formatTime(Math.ceil(challenge.time_remaining)));
    }
}

/**
 * Start wave from specific sector
 */
function startWave(sectorId) {
    try {
        const result = JSON.parse(gameAPI.start_wave_at(sectorId));
        return result.success;
    } catch (error) {
        console.error('Failed to start wave:', error);
        return false;
    }
}

/**
 * Boost sector energy
 */
function boostSector(sectorId) {
    try {
        const result = JSON.parse(gameAPI.boost_sector_energy(sectorId));
        if (result.boosted) {
            showNotification(`Sector ${sectorId} boosted! (${result.charges} left)`, 'success');
        } else if (result.reason === 'no_charges') {
            showNotification(`No boosts left. Next charge in ${Math.ceil(result.recharge_remaining)}s`, 'failure');
        }
        return result.boosted;
    } catch (error) {
        console.error('Failed to boost sector:', error);
        return false;
    }
}

/**
 * Trigger external stadium events (mascot/scoreboard)
 */
function triggerStadiumEvent(eventType, sectorId = null) {
    try {
        gameAPI.trigger_event(eventType, sectorId ?? null);
    } catch (error) {
        console.error('Failed to trigger event:', error);
    }
}

/**
 * Select a sector as the target for the Boost button and keyboard actions
 */
function selectSector(sectorId) {
    if (!gameState) return;
    const total = gameState.sectors.length;
    selectedSector = ((sectorId % total) + total) % total;
}

// Enter on a focused control should activate that control, not the game
function isInteractiveElement(element) {
    return !!element && ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function isWaveRunning() {
    return !!gameState && (gameState.wave_active || gameState.second_wave_active);
}

/**
 * Tap or click: select the sector, and start a wave there if none is running
 */
function activateSector(sectorId) {
    selectSector(sectorId);
    if (!isWaveRunning()) {
        startWave(sectorId);
    }
}

function boostSelectedSector() {
    if (selectedSector < 0) {
        showNotification('Select a sector to boost first', 'failure');
        return;
    }
    boostSector(selectedSector);
}

/**
 * Use the player's Scoreboard Hype, which is limited by a cooldown
 */
function useScoreboardHype() {
    try {
        const result = JSON.parse(gameAPI.use_scoreboard_hype());
        if (!result.used) {
            showNotification(`Scoreboard Hype recharging: ${Math.ceil(result.cooldown_remaining)}s`, 'failure');
        }
    } catch (error) {
        console.error('Failed to use scoreboard hype:', error);
    }
}

function resetEventIndicators() {
    activeEventIndicators = [];
}

/**
 * Debounce function to prevent excessive resize calls
 */
function debounce(func, wait) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(resizeTimeout);
            func.apply(this, args);
        };
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(later, wait);
    };
}

/**
 * Add event listener with cleanup tracking
 */
function addTrackedEventListener(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    eventListeners.push({ element, event, handler, options });
}

/**
 * Remove all tracked event listeners
 */
function removeAllEventListeners() {
    eventListeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
    });
    eventListeners = [];
}

/**
 * Setup high-DPI canvas with proper scaling
 */
function setupHighDPICanvas(canvas, ctx, container) {
    // Use effective pixel ratio based on performance tier
    const devicePixelRatio = effectivePixelRatio;

    // Clear any previously hard-coded inline size so CSS flex can compute
    // the correct height (which excludes the controls bar when it is visible).
    canvas.style.width = '';
    canvas.style.height = '';

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const width = canvasRect.width || containerRect.width;
    const height = canvasRect.height || containerRect.height;

    // Set display size (CSS pixels)
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    // Set actual size (device pixels) - limited by performance tier
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    // Scale context to ensure correct drawing operations
    ctx.scale(devicePixelRatio, devicePixelRatio);

    return { width, height };
}

/**
 * Precompute sector paths for better performance
 */
function precomputeSectorPaths(totalSectors, centerX, centerY) {
    sectorPaths = [];
    const angleWidth = (Math.PI * 2) / totalSectors;
    const innerRadius = STADIUM_RADIUS - SECTOR_HEIGHT;
    const outerRadius = STADIUM_RADIUS;
    
    for (let i = 0; i < totalSectors; i++) {
        const angle = (i / totalSectors) * Math.PI * 2 - Math.PI / 2;
        const startAngle = angle - angleWidth / 2;
        const endAngle = angle + angleWidth / 2;
        
        const path = new Path2D();
        path.arc(centerX, centerY, outerRadius, startAngle, endAngle);
        path.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        path.closePath();
        
        sectorPaths[i] = {
            path,
            angle,
            centerX,
            centerY,
            startAngle,
            endAngle,
            innerRadius,
            outerRadius,
            textX: centerX + Math.cos(angle) * ((innerRadius + outerRadius) / 2),
            textY: centerY + Math.sin(angle) * ((innerRadius + outerRadius) / 2)
        };
    }
}

/**
 * Setup canvas with high-DPI support and performance optimizations
 */
function setupCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    const container = document.getElementById('game-container');
    
    // Initial setup
    const dimensions = setupHighDPICanvas(canvas, ctx, container);
    precomputeSectorPaths(16, dimensions.width / 2, dimensions.height / 2);

    // Offscreen canvases caching the static field and day/night overlay
    // layers, so they're blitted (not re-drawn) every frame
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d');
    overlayCanvas = document.createElement('canvas');
    overlayCtx = overlayCanvas.getContext('2d');

    // Apply initial HUD scaling
    updateHUDScaling();

    // Shared resize logic that handles layout recomputation
    const handleResize = () => {
        const newDimensions = setupHighDPICanvas(canvas, ctx, container);
        precomputeSectorPaths(gameState ? gameState.sectors.length : 16,
                            newDimensions.width / 2, newDimensions.height / 2);

        resetFieldGradients();

        // Update HUD scaling on resize
        updateHUDScaling();

        // Force a redraw without full re-initialization
        // Game state is preserved - only rendering is updated
        if (gameState) {
            render();
        }
    };

    // Expose so the performance monitor can apply tier/DPR changes
    triggerCanvasResize = handleResize;

    // Debounced resize handler for regular resize events
    const debouncedResize = debounce(handleResize, 150);

    // Handle resize events
    addTrackedEventListener(window, 'resize', debouncedResize);

    // Handle orientation changes immediately (no debounce for better responsiveness)
    addTrackedEventListener(window, 'orientationchange', () => {
        // Small delay to ensure viewport has updated after orientation change
        setTimeout(handleResize, 100);
    });
}

/**
 * Get sector position and dimensions (optimized with precomputed values)
 */
function getSectorGeometry(sectorId, totalSectors) {
    if (sectorPaths[sectorId]) {
        return sectorPaths[sectorId];
    }
    
    // Fallback for dynamic calculations
    const centerX = canvas.width / (2 * effectivePixelRatio);
    const centerY = canvas.height / (2 * effectivePixelRatio);
    const angle = (sectorId / totalSectors) * Math.PI * 2 - Math.PI / 2;
    
    return {
        angle,
        centerX,
        centerY,
        innerRadius: STADIUM_RADIUS - SECTOR_HEIGHT,
        outerRadius: STADIUM_RADIUS,
        textX: centerX + Math.cos(angle) * ((STADIUM_RADIUS - SECTOR_HEIGHT + STADIUM_RADIUS) / 2),
        textY: centerY + Math.sin(angle) * ((STADIUM_RADIUS - SECTOR_HEIGHT + STADIUM_RADIUS) / 2)
    };
}

/**
 * Get color for sector based on state
 */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSectorColor(sector) {
    // Quantize energy to 32 steps so colors are served from a small cache
    // instead of re-parsing hex and allocating rgba strings per sector per frame
    const energyStep = Math.min(31, Math.floor(sector.energy * 32));
    const key = sector.state + '|' + energyStep;
    let color = sectorColorCache.get(key);
    if (color) return color;

    const energy = energyStep / 32;
    const theme = STADIUM_THEMES[stadiumType] || STADIUM_THEMES.classic;

    switch (sector.state) {
        case 'idle':
            color = hexToRgba(theme.idle, 0.5 + energy * 0.5);
            break;
        case 'anticipating':
            color = hexToRgba(theme.anticipating, 0.7 + energy * 0.3);
            break;
        case 'standing':
            color = hexToRgba(theme.standing, 0.8 + energy * 0.2);
            break;
        case 'seated':
            color = hexToRgba(theme.seated, 0.4 + energy * 0.4);
            break;
        default:
            color = 'rgba(100, 100, 100, 0.5)';
    }

    sectorColorCache.set(key, color);
    return color;
}

function getEnergyFillColor(energy) {
    if (shouldRenderExpensiveEffects()) {
        if (energy < 0.3) {
            return '#f87171';
        }
        if (energy < 0.6) {
            return '#fbbf24';
        }
        return '#4ade80';
    }

    return energy < 0.5 ? '#fbbf24' : '#4ade80';
}

function drawEnergyIndicator(sector, geom) {
    const baseX = geom.textX;
    const baseY = geom.textY + 15;
    const energyColor = getEnergyFillColor(sector.energy);

    if (performanceTier === 'low') {
        const indicatorWidth = 18;
        const indicatorHeight = 6;
        const indicatorX = baseX - indicatorWidth / 2;
        const indicatorY = baseY;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(indicatorX, indicatorY, indicatorWidth, indicatorHeight);

        ctx.fillStyle = energyColor;
        ctx.fillRect(indicatorX, indicatorY, indicatorWidth * sector.energy, indicatorHeight);
        return;
    }

    const barWidth = 30;
    const barHeight = 5;
    const barX = baseX - barWidth / 2;
    const barY = baseY;

    // Background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = energyColor;
    ctx.fillRect(barX, barY, barWidth * sector.energy, barHeight);

    if (shouldRenderExpensiveEffects()) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
}

/**
 * Draw crowd sector (optimized with precomputed paths)
 */
function drawSector(sector, index, totalSectors) {
    const geom = getSectorGeometry(index, totalSectors);
    const theme = STADIUM_THEMES[stadiumType] || STADIUM_THEMES.classic;

    // Check if this sector is hovered
    const isHovered = index === hoveredSector;

    // Check if this sector is part of the second wave (for double pattern)
    const isSecondWave = gameState.second_wave_active &&
                         index === gameState.second_current_wave_sector;

    // Use precomputed path if available
    if (geom.path) {
        ctx.fillStyle = getSectorColor(sector);
        ctx.fill(geom.path);

        // Hover highlight
        if (isHovered && isGameRunning && !isPaused) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill(geom.path);
        }

        // Second wave highlight (for double pattern)
        if (isSecondWave) {
            ctx.fillStyle = 'rgba(255, 100, 255, 0.3)';
            ctx.fill(geom.path);
        }

        // Border
        ctx.strokeStyle = isHovered ? theme.hoverBorder : theme.border;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke(geom.path);
    } else {
        // Fallback to manual drawing
        const angleWidth = (Math.PI * 2) / totalSectors;
        const startAngle = geom.angle - angleWidth / 2;
        const endAngle = geom.angle + angleWidth / 2;

        ctx.beginPath();
        ctx.arc(geom.centerX, geom.centerY, geom.outerRadius, startAngle, endAngle);
        ctx.arc(geom.centerX, geom.centerY, geom.innerRadius, endAngle, startAngle, true);
        ctx.closePath();

        ctx.fillStyle = getSectorColor(sector);
        ctx.fill();

        // Hover highlight
        if (isHovered && isGameRunning && !isPaused) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
        }

        // Second wave highlight (for double pattern)
        if (isSecondWave) {
            ctx.fillStyle = 'rgba(255, 100, 255, 0.3)';
            ctx.fill();
        }

        ctx.strokeStyle = isHovered ? theme.hoverBorder : theme.border;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();
    }
    
    // Draw standing animation (only for medium and high performance tiers)
    if (shouldRenderDetailedAnimations() && 
        (sector.state === 'standing' || sector.state === 'anticipating')) {
        const heightMultiplier = sector.state === 'standing' ? 1.5 : 1.2;
        const extendedRadius = geom.outerRadius + SECTOR_HEIGHT * (heightMultiplier - 1);
        const centerX = geom.centerX || (canvas.width / (2 * effectivePixelRatio));
        const centerY = geom.centerY || (canvas.height / (2 * effectivePixelRatio));
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, extendedRadius, geom.startAngle, geom.endAngle);
        ctx.arc(centerX, centerY, geom.outerRadius, geom.endAngle, geom.startAngle, true);
        ctx.closePath();
        
        ctx.fillStyle = sector.state === 'standing' 
            ? 'rgba(0, 255, 100, 0.8)' 
            : 'rgba(255, 200, 0, 0.6)';
        ctx.fill();
    }
    
    // Draw sector number (font/alignment set once per frame in render())
    ctx.fillStyle = 'white';
    ctx.fillText(index, geom.textX, geom.textY);

    drawEnergyIndicator(sector, geom);
}

/**
 * Draw stadium field (cached gradients for better performance)
 */
function resetFieldGradients() {
    fieldGradients = {};
    fieldCacheValid = false;
    overlayCacheValid = false;
}

/**
 * Run a draw function against another 2D context. The field/overlay drawing
 * helpers all use the module-level `ctx`, so this temporarily swaps it.
 */
function withContext(targetCtx, drawFn) {
    const previousCtx = ctx;
    ctx = targetCtx;
    try {
        drawFn();
    } finally {
        ctx = previousCtx;
    }
}

/**
 * Re-render the static field layer (background + field markings) into the
 * offscreen canvas. Runs only when size, field type, or tier changes.
 */
function ensureFieldCache() {
    if (fieldCacheValid) return;

    const devicePixelRatio = effectivePixelRatio;
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    offscreenCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    withContext(offscreenCtx, () => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
        drawField();
    });

    fieldCacheValid = true;
}

/**
 * Re-render the static day/night overlay (vignette, floodlights) into its
 * cache canvas. Runs only when size or time-of-day changes.
 */
function ensureOverlayCache() {
    if (overlayCacheValid) return;

    const devicePixelRatio = effectivePixelRatio;
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    overlayCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    withContext(overlayCtx, drawDayNightOverlay);

    overlayCacheValid = true;
}

function getFieldGradient(key, builder) {
    if (!fieldGradients[key]) {
        fieldGradients[key] = builder();
    }
    return fieldGradients[key];
}

function drawGrassBase(centerX, centerY, fieldRadius) {
    const gradient = getFieldGradient('base', () => {
        const baseGradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, fieldRadius
        );
        baseGradient.addColorStop(0, '#2d5016');
        baseGradient.addColorStop(1, '#1a3d0a');
        return baseGradient;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, fieldRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
}

function drawRectGrassBase(fieldRect) {
    const gradientKey = `rect-${Math.round(fieldRect.width)}x${Math.round(fieldRect.height)}`;
    const gradient = getFieldGradient(gradientKey, () => {
        const baseGradient = ctx.createLinearGradient(
            fieldRect.left,
            fieldRect.top,
            fieldRect.left,
            fieldRect.top + fieldRect.height
        );
        baseGradient.addColorStop(0, '#2d5016');
        baseGradient.addColorStop(1, '#1a3d0a');
        return baseGradient;
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(fieldRect.left, fieldRect.top, fieldRect.width, fieldRect.height);
}

function drawSoccerField(centerX, centerY, fieldRect) {
    drawRectGrassBase(fieldRect);

    ctx.save();
    ctx.beginPath();
    ctx.rect(fieldRect.left, fieldRect.top, fieldRect.width, fieldRect.height);
    ctx.clip();

    // fieldRect is landscape: width = 105m direction, height = 68m direction
    const W = fieldRect.width;
    const H = fieldRect.height;
    const fieldLeft = fieldRect.left;
    const fieldRight = fieldRect.left + W;
    const fieldTop = fieldRect.top;
    const fieldBottom = fieldRect.top + H;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;

    // Center circle (9.15 m radius; scale by field height = 68m side)
    const circleRadius = H * (9.15 / 68);
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Halfway line (vertical, divides the 105m length in half)
    ctx.beginPath();
    ctx.moveTo(centerX, fieldTop);
    ctx.lineTo(centerX, fieldBottom);
    ctx.stroke();

    // Center spot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    if (performanceTier !== 'low') {
        // Penalty areas: 16.5m deep × 40.32m wide, on left and right short ends
        const penDepth = W * (16.5 / 105);
        const penHeight = H * (40.32 / 68);
        ctx.strokeRect(fieldLeft, centerY - penHeight / 2, penDepth, penHeight);
        ctx.strokeRect(fieldRight - penDepth, centerY - penHeight / 2, penDepth, penHeight);

        // Goal areas: 5.5m deep × 18.32m wide
        const goalDepth = W * (5.5 / 105);
        const goalHeight = H * (18.32 / 68);
        ctx.strokeRect(fieldLeft, centerY - goalHeight / 2, goalDepth, goalHeight);
        ctx.strokeRect(fieldRight - goalDepth, centerY - goalHeight / 2, goalDepth, goalHeight);

        // Penalty spots (11m from each goal line)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(fieldLeft + W * (11 / 105), centerY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fieldRight - W * (11 / 105), centerY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Corner arcs (1m radius at all four corners)
        const cornerR = Math.max(W * (1 / 105), 4);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(fieldLeft, fieldTop, cornerR, 0, Math.PI / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fieldRight, fieldTop, cornerR, Math.PI / 2, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fieldRight, fieldBottom, cornerR, Math.PI, 3 * Math.PI / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fieldLeft, fieldBottom, cornerR, 3 * Math.PI / 2, 2 * Math.PI);
        ctx.stroke();
    }

    ctx.restore();
}

function getRectangularField(centerX, centerY, fieldRadius, targetAspect = null) {
    const devicePixelRatio = effectivePixelRatio;
    const canvasWidth = canvas.width / devicePixelRatio;
    const canvasHeight = canvas.height / devicePixelRatio;
    const canvasAspect = canvasWidth / canvasHeight || 1;
    const aspect = targetAspect || canvasAspect;

    // Match canvas aspect ratio while fitting inside the available circular area
    const baseScale = (2 * fieldRadius) / Math.sqrt(aspect * aspect + 1);
    let fieldHeight = baseScale;
    let fieldWidth = baseScale * aspect;

    // Ensure the rectangle stays inside the visible canvas bounds with a small margin
    const maxWidth = canvasWidth - 20;
    const maxHeight = canvasHeight - 20;
    const scale = Math.min(1, maxWidth / fieldWidth, maxHeight / fieldHeight);
    fieldWidth *= scale;
    fieldHeight *= scale;

    return {
        width: fieldWidth,
        height: fieldHeight,
        left: centerX - fieldWidth / 2,
        top: centerY - fieldHeight / 2
    };
}

function drawBaseballField(centerX, centerY, fieldRadius) {
    // Draw grass base for entire field
    drawGrassBase(centerX, centerY, fieldRadius);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, fieldRadius, 0, Math.PI * 2);
    ctx.clip();

    // Home plate is at the bottom, diamond extends upward
    // Distance from center to home plate (shifted down)
    const homePlateOffset = fieldRadius * 0.45;
    const homePlateY = centerY + homePlateOffset;
    const homePlateX = centerX;
    
    // Diamond dimensions - going counterclockwise from home
    const baseDistance = fieldRadius * 0.5;
    
    // Base positions (counterclockwise from home at bottom)
    // Home -> 1st (right) -> 2nd (top) -> 3rd (left) -> Home
    const firstBaseX = homePlateX + baseDistance * BASEBALL_COS_45;  // 45 degrees
    const firstBaseY = homePlateY - baseDistance * BASEBALL_COS_45;
    
    const secondBaseX = homePlateX;
    const secondBaseY = homePlateY - baseDistance * BASEBALL_COS_45 * 2;  // Diagonal of diamond
    
    const thirdBaseX = homePlateX - baseDistance * BASEBALL_COS_45;
    const thirdBaseY = homePlateY - baseDistance * BASEBALL_COS_45;
    
    // Draw dirt infield (diamond shape)
    ctx.beginPath();
    ctx.moveTo(homePlateX, homePlateY);
    ctx.lineTo(firstBaseX, firstBaseY);
    ctx.lineTo(secondBaseX, secondBaseY);
    ctx.lineTo(thirdBaseX, thirdBaseY);
    ctx.closePath();
    ctx.fillStyle = BASEBALL_FIELD_COLORS.dirt;
    ctx.fill();
    
    // Draw foul lines from home plate spreading to top edge
    ctx.strokeStyle = BASEBALL_FIELD_COLORS.foulLine;
    ctx.lineWidth = 3;
    
    // Foul lines extend at true 45° from home plate — upper-left (3rd) and upper-right (1st)
    const foulLineLength = fieldRadius * 1.5;
    // Left foul line (3rd base line)
    ctx.beginPath();
    ctx.moveTo(homePlateX, homePlateY);
    ctx.lineTo(homePlateX - foulLineLength * BASEBALL_COS_45, homePlateY - foulLineLength * BASEBALL_COS_45);
    ctx.stroke();

    // Right foul line (1st base line)
    ctx.beginPath();
    ctx.moveTo(homePlateX, homePlateY);
    ctx.lineTo(homePlateX + foulLineLength * BASEBALL_COS_45, homePlateY - foulLineLength * BASEBALL_COS_45);
    ctx.stroke();
    
    // Draw base paths (connecting the bases)
    ctx.strokeStyle = BASEBALL_FIELD_COLORS.basePath;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(homePlateX, homePlateY);
    ctx.lineTo(firstBaseX, firstBaseY);
    ctx.lineTo(secondBaseX, secondBaseY);
    ctx.lineTo(thirdBaseX, thirdBaseY);
    ctx.closePath();
    ctx.stroke();
    
    // Draw bases (as white squares)
    const baseSize = fieldRadius * 0.035;
    
    // First base
    ctx.save();
    ctx.translate(firstBaseX, firstBaseY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = BASEBALL_FIELD_COLORS.base;
    ctx.fillRect(-baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
    
    // Second base
    ctx.save();
    ctx.translate(secondBaseX, secondBaseY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = BASEBALL_FIELD_COLORS.base;
    ctx.fillRect(-baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
    
    // Third base
    ctx.save();
    ctx.translate(thirdBaseX, thirdBaseY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = BASEBALL_FIELD_COLORS.base;
    ctx.fillRect(-baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
    
    // Pitcher's mound (between home and 2nd, realistic baseball proportions)
    const moundX = homePlateX;
    const moundY = homePlateY - baseDistance * BASEBALL_MOUND_DISTANCE_RATIO;
    ctx.beginPath();
    ctx.arc(moundX, moundY, fieldRadius * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = BASEBALL_FIELD_COLORS.pitchersMound;
    ctx.fill();
    
    // Home plate (pentagon shape pointing toward pitcher)
    const plateWidth = fieldRadius * 0.06;
    const plateHeight = fieldRadius * 0.05;
    ctx.beginPath();
    ctx.moveTo(homePlateX, homePlateY - plateHeight);  // Point toward pitcher
    ctx.lineTo(homePlateX + plateWidth / 2, homePlateY);
    ctx.lineTo(homePlateX + plateWidth / 2, homePlateY + plateHeight / 2);
    ctx.lineTo(homePlateX - plateWidth / 2, homePlateY + plateHeight / 2);
    ctx.lineTo(homePlateX - plateWidth / 2, homePlateY);
    ctx.closePath();
    ctx.fillStyle = BASEBALL_FIELD_COLORS.homePlate;
    ctx.fill();
    
    ctx.restore();
}

function drawFootballField(centerX, centerY, fieldRect) {
    drawRectGrassBase(fieldRect);

    // fieldRect is landscape: width = 120 yd direction, height = 53.3 yd direction
    const W = fieldRect.width;
    const H = fieldRect.height;
    const left = fieldRect.left;
    const top = fieldRect.top;
    const right = left + W;
    const bottom = top + H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, W, H);
    ctx.clip();

    // End zones (10 yards each out of 120 total) — distinct dark green
    const endZoneW = W * (10 / 120);
    ctx.fillStyle = 'rgba(0, 80, 0, 0.95)';
    ctx.fillRect(left, top, endZoneW, H);
    ctx.fillRect(right - endZoneW, top, endZoneW, H);

    // Alternating vertical stripes across the 100-yard play field
    const playLeft = left + endZoneW;
    const playW = W - 2 * endZoneW;
    const stripeCount = performanceTier === 'low' ? 5 : 10;
    const stripeW = playW / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(26, 96, 38, 0.85)' : 'rgba(35, 128, 50, 0.85)';
        ctx.fillRect(playLeft + i * stripeW, top, stripeW, H);
    }

    // End zone boundary lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left + endZoneW, top); ctx.lineTo(left + endZoneW, bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(right - endZoneW, top); ctx.lineTo(right - endZoneW, bottom); ctx.stroke();

    // Yard lines every 10 yards (11 vertical lines across the play field)
    for (let i = 0; i <= 10; i++) {
        const x = playLeft + (i / 10) * playW;
        ctx.lineWidth = i === 5 ? 3 : 2; // emphasize the 50-yard line
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
    }

    // Hash marks and end zone text (skip for low performance)
    if (performanceTier !== 'low') {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        const hashLen = H * 0.07;
        const hashTop = top + H * 0.25;
        const hashBottom = top + H * 0.75;
        // Hash marks every 5 yards (21 positions)
        for (let i = 0; i <= 20; i++) {
            const x = playLeft + (i / 20) * playW;
            ctx.beginPath(); ctx.moveTo(x, hashTop - hashLen / 2); ctx.lineTo(x, hashTop + hashLen / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, hashBottom - hashLen / 2); ctx.lineTo(x, hashBottom + hashLen / 2); ctx.stroke();
        }

        // "END ZONE" text rotated in each end zone
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `bold ${Math.max(H * 0.12, 8)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.translate(left + endZoneW / 2, centerY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('END ZONE', 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(right - endZoneW / 2, centerY);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('END ZONE', 0, 0);
        ctx.restore();
    }

    ctx.restore();
}

function drawCricketField(centerX, centerY, fieldRadius) {
    ctx.save();

    // Oval outfield — slightly wider than tall
    const ovalW = fieldRadius * 1.0;
    const ovalH = fieldRadius * 0.85;

    // Green outfield
    const grassGrad = getFieldGradient('cricket-base', () => {
        const g = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, fieldRadius);
        g.addColorStop(0, '#3a8c3a');
        g.addColorStop(0.6, '#2e7a2e');
        g.addColorStop(1, '#1e5c1e');
        return g;
    });
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, ovalW, ovalH, 0, 0, Math.PI * 2);
    ctx.fillStyle = grassGrad;
    ctx.fill();

    // Boundary rope (oval outline)
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, ovalW, ovalH, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 30-yard inner circle
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, ovalW * 0.55, ovalH * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center pitch (22 yards ≈ 20% of diameter, narrow strip)
    const pitchLen = fieldRadius * 0.4;
    const pitchW = fieldRadius * 0.055;
    ctx.fillStyle = '#c8a96e'; // pitch — sandy/brown colour
    ctx.fillRect(centerX - pitchLen / 2, centerY - pitchW / 2, pitchLen, pitchW);

    // Pitch outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerX - pitchLen / 2, centerY - pitchW / 2, pitchLen, pitchW);

    // Creases — batting crease 4% from each end, full-width across pitch
    const creaseOffset = pitchLen * 0.18;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    // Batting crease (left)
    ctx.beginPath();
    ctx.moveTo(centerX - pitchLen / 2 + creaseOffset, centerY - pitchW / 2 - 2);
    ctx.lineTo(centerX - pitchLen / 2 + creaseOffset, centerY + pitchW / 2 + 2);
    ctx.stroke();
    // Batting crease (right)
    ctx.beginPath();
    ctx.moveTo(centerX + pitchLen / 2 - creaseOffset, centerY - pitchW / 2 - 2);
    ctx.lineTo(centerX + pitchLen / 2 - creaseOffset, centerY + pitchW / 2 + 2);
    ctx.stroke();

    // Stumps (3 small dots at each end)
    const stumpY = [centerY - pitchW * 0.25, centerY, centerY + pitchW * 0.25];
    const stumpRadius = Math.max(1.5, fieldRadius * 0.008);
    ctx.fillStyle = '#ffffff';
    for (const sy of stumpY) {
        ctx.beginPath();
        ctx.arc(centerX - pitchLen / 2 + creaseOffset * 0.35, sy, stumpRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX + pitchLen / 2 - creaseOffset * 0.35, sy, stumpRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawDayNightOverlay() {
    if (timeOfDay === 'day') return;

    const devicePixelRatio = effectivePixelRatio;
    const canvasWidth = canvas.width / devicePixelRatio;
    const canvasHeight = canvas.height / devicePixelRatio;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    ctx.save();

    if (timeOfDay === 'dusk') {
        // Warm amber vignette from edges
        const grad = ctx.createRadialGradient(centerX, centerY, STADIUM_RADIUS * 0.5, centerX, centerY, canvasWidth * 0.75);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(160, 60, 0, 0.38)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (timeOfDay === 'night') {
        // Dark navy overlay
        ctx.fillStyle = 'rgba(5, 10, 40, 0.52)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Stadium floodlights — four bright cones from just outside the sector ring
        const floodlightPositions = [
            { angle: Math.PI * 0.25 },
            { angle: Math.PI * 0.75 },
            { angle: Math.PI * 1.25 },
            { angle: Math.PI * 1.75 },
        ];
        const lightRadius = STADIUM_RADIUS + SECTOR_HEIGHT + 10;
        for (const fp of floodlightPositions) {
            const lx = centerX + Math.cos(fp.angle) * lightRadius;
            const ly = centerY + Math.sin(fp.angle) * lightRadius;

            // Cone of light pointing toward center
            const coneGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, STADIUM_RADIUS * 1.2);
            coneGrad.addColorStop(0, 'rgba(255, 250, 200, 0.18)');
            coneGrad.addColorStop(1, 'rgba(255, 250, 200, 0)');
            ctx.fillStyle = coneGrad;
            ctx.beginPath();
            ctx.arc(lx, ly, STADIUM_RADIUS * 1.2, 0, Math.PI * 2);
            ctx.fill();

            // Bright lamp dot
            ctx.beginPath();
            ctx.arc(lx, ly, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 200, 0.95)';
            ctx.fill();
        }
    }

    ctx.restore();
}

function drawWeatherOverlay() {
    if (weatherType === 'sunny') return;

    const devicePixelRatio = effectivePixelRatio;
    const canvasWidth = canvas.width / devicePixelRatio;
    const canvasHeight = canvas.height / devicePixelRatio;

    ctx.save();

    if (weatherType === 'cloudy') {
        const grad = getFieldGradient('cloudy-overlay', () => {
            const g = ctx.createRadialGradient(canvasWidth / 2, 0, 0, canvasWidth / 2, canvasHeight / 2, canvasWidth);
            g.addColorStop(0, 'rgba(100, 110, 130, 0.22)');
            g.addColorStop(1, 'rgba(60, 70, 90, 0.08)');
            return g;
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (weatherType === 'rainy') {
        // Seed new particles
        const maxParticles = getMaxWeatherParticles();
        while (weatherParticles.length < maxParticles) {
            weatherParticles.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                len: 8 + Math.random() * 10,
                speed: 280 + Math.random() * 120,
                bucket: Math.floor(Math.random() * RAIN_OPACITY_BUCKETS.length),
            });
        }
        // Draw raindrops batched per opacity bucket: one path + one stroke each
        ctx.strokeStyle = 'rgba(130, 170, 220, 1)';
        ctx.lineWidth = 1;
        for (let b = 0; b < RAIN_OPACITY_BUCKETS.length; b++) {
            ctx.globalAlpha = RAIN_OPACITY_BUCKETS[b];
            ctx.beginPath();
            for (const p of weatherParticles) {
                if (p.bucket !== b) continue;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.len * 0.25, p.y + p.len);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Subtle blue-gray wash
        ctx.fillStyle = 'rgba(60, 80, 120, 0.12)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (weatherType === 'snowy') {
        const maxParticles = getMaxWeatherParticles();
        while (weatherParticles.length < maxParticles) {
            weatherParticles.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                r: 1.5 + Math.random() * 2.5,
                speed: 35 + Math.random() * 40,
                drift: (Math.random() - 0.5) * 20,
                bucket: Math.floor(Math.random() * SNOW_OPACITY_BUCKETS.length),
            });
        }
        // Draw snowflakes batched per opacity bucket: one path + one fill each
        ctx.fillStyle = '#ffffff';
        for (let b = 0; b < SNOW_OPACITY_BUCKETS.length; b++) {
            ctx.globalAlpha = SNOW_OPACITY_BUCKETS[b];
            ctx.beginPath();
            for (const p of weatherParticles) {
                if (p.bucket !== b) continue;
                ctx.moveTo(p.x + p.r, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Subtle cold tint
        ctx.fillStyle = 'rgba(200, 220, 255, 0.10)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    ctx.restore();
}

function tickWeatherParticles(dt) {
    if (weatherType !== 'rainy' && weatherType !== 'snowy') {
        weatherParticles = [];
        return;
    }

    // Shed excess particles after a performance tier downgrade
    const maxParticles = getMaxWeatherParticles();
    if (weatherParticles.length > maxParticles) {
        weatherParticles.length = maxParticles;
    }

    const devicePixelRatio = effectivePixelRatio;
    const canvasWidth = canvas.width / devicePixelRatio;
    const canvasHeight = canvas.height / devicePixelRatio;

    if (weatherType === 'rainy') {
        for (const p of weatherParticles) {
            p.y += p.speed * dt;
            p.x -= p.speed * 0.25 * dt;
            if (p.y > canvasHeight) {
                p.y = -p.len;
                p.x = Math.random() * canvasWidth;
            }
            if (p.x < 0) p.x = canvasWidth;
        }
    } else if (weatherType === 'snowy') {
        for (const p of weatherParticles) {
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > canvasHeight) {
                p.y = -p.r;
                p.x = Math.random() * canvasWidth;
            }
            if (p.x < 0) p.x = canvasWidth;
            if (p.x > canvasWidth) p.x = 0;
        }
    }
}

function drawField() {
    const devicePixelRatio = effectivePixelRatio;
    const centerX = canvas.width / (2 * devicePixelRatio);
    const centerY = canvas.height / (2 * devicePixelRatio);
    const fieldRadius = STADIUM_RADIUS - SECTOR_HEIGHT - 20;

    switch (fieldType) {
        case 'baseball':
            drawBaseballField(centerX, centerY, fieldRadius);
            break;
        case 'football':
            drawFootballField(
                centerX,
                centerY,
                getRectangularField(centerX, centerY, fieldRadius, FOOTBALL_FIELD_ASPECT)
            );
            break;
        case 'cricket':
            drawCricketField(centerX, centerY, fieldRadius);
            break;
        default:
            drawSoccerField(
                centerX,
                centerY,
                getRectangularField(centerX, centerY, fieldRadius, SOCCER_FIELD_ASPECT)
            );
            break;
    }
}

/**
 * Draw readiness marks, upcoming-sector cues, the selected sector, and the
 * sector that last blocked a wave. Marks use shapes and text, not only color.
 */
function drawSectorGuides(sectors) {
    const total = sectors.length;

    // Readiness marks: a check when the engine says the sector can join,
    // an exclamation mark when it cannot
    ctx.font = 'bold 13px Arial';
    for (let i = 0; i < total; i++) {
        const geom = getSectorGeometry(i, total);
        const ready = sectors[i].ready;
        ctx.fillStyle = ready ? '#4ade80' : '#fbbf24';
        ctx.fillText(ready ? '✓' : '!', geom.textX, geom.textY - 17);
    }
    ctx.font = 'bold 16px Arial';

    // Upcoming sector for each active front, with its travel direction
    const direction = gameState.wave_direction || 1;
    drawNextSectorCue(gameState.next_wave_sector, total, direction, 'rgba(255, 255, 255, 0.95)');
    drawNextSectorCue(gameState.second_next_wave_sector, total, direction, 'rgba(255, 120, 255, 0.95)');

    if (selectedSector >= 0 && selectedSector < total) {
        strokeSector(selectedSector, total, '#facc15', 4, []);
    }

    if (blockedSectorFlash) {
        if (performance.now() < blockedSectorFlash.until && blockedSectorFlash.sector < total) {
            strokeSector(blockedSectorFlash.sector, total, '#ef4444', 4, [4, 3]);
            const geom = getSectorGeometry(blockedSectorFlash.sector, total);
            ctx.fillStyle = '#ef4444';
            ctx.fillText('✕', geom.textX, geom.textY - 34);
        } else {
            blockedSectorFlash = null;
        }
    }
}

function strokeSector(index, total, color, width, dash) {
    const geom = getSectorGeometry(index, total);
    if (!geom.path) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke(geom.path);
    ctx.restore();
}

function drawNextSectorCue(index, total, direction, color) {
    if (typeof index !== 'number' || index < 0 || index >= total) return;

    strokeSector(index, total, color, 3, [6, 4]);

    // Arrow just inside the ring, pointing along the wave's travel direction
    const geom = getSectorGeometry(index, total);
    const radius = geom.innerRadius - 14;
    const x = geom.centerX + Math.cos(geom.angle) * radius;
    const y = geom.centerY + Math.sin(geom.angle) * radius;
    const heading = geom.angle + (direction >= 0 ? Math.PI / 2 : -Math.PI / 2);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawEventIndicators() {
    if (!gameState || activeEventIndicators.length === 0) return;

    const devicePixelRatio = effectivePixelRatio;
    const centerX = canvas.width / (2 * devicePixelRatio);
    const centerY = canvas.height / (2 * devicePixelRatio);

    const remainingIndicators = [];
    const now = performance.now();

    activeEventIndicators.forEach(indicator => {
        const progress = (now - indicator.start) / indicator.duration;
        if (progress >= 1) {
            return;
        }

        let x = centerX;
        let y = centerY - STADIUM_RADIUS * 0.4;

        if (indicator.type === 'mascot' && typeof indicator.data?.sector === 'number') {
            const geom = getSectorGeometry(indicator.data.sector, gameState.sectors.length);
            const radius = (geom.innerRadius + geom.outerRadius) / 2;
            x = geom.centerX + Math.cos(geom.angle) * radius;
            y = geom.centerY + Math.sin(geom.angle) * radius;
        }

        const label = indicator.type === 'mascot' ? 'Mascot' : 'Scoreboard';
        const color = indicator.type === 'mascot'
            ? 'rgba(244, 114, 182, 0.85)'
            : 'rgba(56, 189, 248, 0.85)';
        const floatOffset = progress * 16;

        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - floatOffset, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y - floatOffset);
        ctx.restore();

        remainingIndicators.push(indicator);
    });

    activeEventIndicators = remainingIndicators;
}

/**
 * Render game frame (optimized for high-DPI and performance)
 */
function render() {
    if (!gameState) return;
    
    const devicePixelRatio = effectivePixelRatio;
    const canvasWidth = canvas.width / devicePixelRatio;
    const canvasHeight = canvas.height / devicePixelRatio;

    // Blit the cached static layer (background + field markings)
    ensureFieldCache();
    ctx.drawImage(offscreenCanvas, 0, 0, canvasWidth, canvasHeight);

    // Draw all sectors (batch operations for better performance)
    const sectors = gameState.sectors;

    // Update precomputed paths if sector count changed
    if (sectorPaths.length !== sectors.length) {
        precomputeSectorPaths(sectors.length, canvasWidth / 2, canvasHeight / 2);
    }

    // Set shared text state once for all sector labels
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    sectors.forEach((sector, index) => {
        drawSector(sector, index, sectors.length);
    });

    drawSectorGuides(sectors);

    drawEventIndicators();

    // Draw atmospheric overlays (day/night then weather on top)
    if (timeOfDay !== 'day') {
        ensureOverlayCache();
        ctx.drawImage(overlayCanvas, 0, 0, canvasWidth, canvasHeight);
    }
    drawWeatherOverlay();

    // Update HUD
    updateHUD();
}

/**
 * Calculate and apply responsive HUD scaling based on canvas width
 */
function updateHUDScaling() {
    const container = document.getElementById('game-container');
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Define breakpoints
    const BREAKPOINT_MOBILE = 480;
    const BREAKPOINT_TABLET = 768;

    // Calculate base font sizes as percentages of container width
    // Use clamp to ensure min/max bounds for readability
    let hudLabelSize, hudValueSize, hudPanelPadding, hudTop, hudHorizontalPadding;

    if (containerWidth <= BREAKPOINT_MOBILE) {
        // Small mobile: smaller fonts, compact padding
        hudLabelSize = Math.max(10, Math.min(12, containerWidth * 0.028));  // ~2.8% of width, min 10px, max 12px
        hudValueSize = Math.max(14, Math.min(18, containerWidth * 0.045));  // ~4.5% of width, min 14px, max 18px
        hudPanelPadding = Math.max(6, Math.min(10, containerWidth * 0.025)); // ~2.5% of width
        hudTop = Math.max(40, containerHeight * 0.08); // 8% from top or min 40px
        hudHorizontalPadding = Math.max(5, containerWidth * 0.015);
    } else if (containerWidth <= BREAKPOINT_TABLET) {
        // Tablet: medium fonts
        hudLabelSize = Math.max(11, Math.min(14, containerWidth * 0.018)); // ~1.8% of width
        hudValueSize = Math.max(16, Math.min(20, containerWidth * 0.026)); // ~2.6% of width
        hudPanelPadding = Math.max(8, Math.min(12, containerWidth * 0.02));
        hudTop = Math.max(50, containerHeight * 0.1);
        hudHorizontalPadding = Math.max(5, containerWidth * 0.015);
    } else {
        // Desktop: larger fonts
        hudLabelSize = Math.max(14, Math.min(16, containerWidth * 0.012)); // ~1.2% of width
        hudValueSize = Math.max(22, Math.min(28, containerWidth * 0.022)); // ~2.2% of width
        hudPanelPadding = Math.max(15, Math.min(25, containerWidth * 0.022));
        hudTop = 100;
        hudHorizontalPadding = 20;
    }

    // Apply via CSS custom properties for smooth scaling
    const root = document.documentElement;
    root.style.setProperty('--hud-label-size', `${hudLabelSize}px`);
    root.style.setProperty('--hud-value-size', `${hudValueSize}px`);
    root.style.setProperty('--hud-panel-padding-v', `${hudPanelPadding}px`);
    root.style.setProperty('--hud-panel-padding-h', `${hudPanelPadding * 1.5}px`);
    root.style.setProperty('--hud-top', `${hudTop}px`);
    root.style.setProperty('--hud-horizontal-padding', `${hudHorizontalPadding}px`);

    // Handle vertical stacking on very narrow screens
    const hud = document.getElementById('hud');
    if (hud) {
        if (containerWidth < 400) {
            // Stack vertically on very narrow screens
            hud.style.flexDirection = 'column';
            hud.style.alignItems = 'flex-start';
            hud.style.gap = '8px';
        } else if (containerWidth <= BREAKPOINT_TABLET) {
            // Horizontal with wrap on tablets
            hud.style.flexDirection = 'row';
            hud.style.alignItems = 'stretch';
            hud.style.gap = '5px';
        } else {
            // Side-by-side on desktop
            hud.style.flexDirection = 'row';
            hud.style.alignItems = 'stretch';
            hud.style.gap = '';
        }
    }
}

/**
 * Write text to a HUD element, skipping the DOM entirely when the value is
 * unchanged (element refs are looked up once and cached)
 */
function setHudText(id, value) {
    if (lastHudText[id] === value) return;

    let element = hudElements[id];
    if (!element) {
        element = document.getElementById(id);
        if (!element) return;
        hudElements[id] = element;
    }

    element.textContent = value;
    lastHudText[id] = value;
}

/**
 * Update HUD display
 */
function updateHUD() {
    if (!gameState) return;

    setHudText('score', String(gameState.score));
    setHudText('combo', gameState.combo + 'x');
    setHudText('waves', String(gameState.successful_waves));
    setHudText('max-combo', gameState.max_combo + 'x');
    updateResourceControls();
}

/**
 * Show boost charges and the Scoreboard Hype cooldown before the player acts
 */
function updateResourceControls() {
    const charges = gameState.boost_charges;
    const recharge = charges < gameState.max_boost_charges
        ? ` (+1 in ${Math.ceil(gameState.boost_recharge_remaining)}s)`
        : '';
    setHudText('boost-status', `⚡ Boosts ${charges}/${gameState.max_boost_charges}${recharge}`);

    const selected = selectedSector >= 0 ? gameState.sectors[selectedSector] : null;
    setHudText('boost-btn', selected ? `⚡ Boost ${selectedSector}` : '⚡ Boost');
    const boostDisabled = !selected || charges < 1;
    if (hudElements['boost-btn'] && hudElements['boost-btn'].disabled !== boostDisabled) {
        hudElements['boost-btn'].disabled = boostDisabled;
    }
    setHudText('selected-sector-info', selected
        ? `Sector ${selectedSector}: ${selected.ready ? '✓ Ready' : '! ' + (READINESS_LABELS[selected.block_reason] || 'Not ready')}`
        : 'Tap a sector to select it');

    const hypeRemaining = Math.ceil(gameState.hype_cooldown_remaining);
    setHudText('scoreboard-btn', hypeRemaining > 0
        ? `📣 Hype in ${hypeRemaining}s`
        : '📣 Scoreboard Hype');

    const hypeReady = hypeRemaining <= 0;
    if (hudElements['scoreboard-btn'] && hudElements['scoreboard-btn'].disabled === hypeReady) {
        hudElements['scoreboard-btn'].disabled = !hypeReady;
    }
}

/**
 * Game loop (optimized with performance tracking)
 */
let lastHiddenUpdateTime = 0;
function gameLoop(timestamp) {
    if (!isGameRunning) return;

    const frameStartTime = performance.now();

    // Monitor performance
    monitorPerformance(timestamp);

    const dt = lastTime ? (timestamp - lastTime) / 1000 : 0;
    lastTime = timestamp;

    // Cap dt to prevent large jumps
    const cappedDt = Math.min(dt, 0.1);

    // Throttle updates when tab is hidden (reduce to ~5 FPS)
    if (!isTabVisible && !isPaused) {
        // Only update every HIDDEN_TAB_UPDATE_INTERVAL when hidden
        const timeSinceLastHiddenUpdate = timestamp - lastHiddenUpdateTime;
        if (timeSinceLastHiddenUpdate < HIDDEN_TAB_UPDATE_INTERVAL) {
            // Skip this frame but continue loop
            animationId = requestAnimationFrame(gameLoop);
            return;
        }
        lastHiddenUpdateTime = timestamp;
    }

    let updateTime = 0;
    let renderTime = 0;

    // Only update if not paused
    if (!isPaused) {
        const updateStartTime = performance.now();

        // Update game state at the engine tick rate (~30Hz); the engine
        // consumes accumulated dt so gameplay timing is unaffected
        engineTimeAccumulator += cappedDt;
        if (!gameState || engineTimeAccumulator >= ENGINE_UPDATE_INTERVAL) {
            updateGameState(engineTimeAccumulator);
            engineTimeAccumulator = 0;
        }

        // Advance weather particle positions every frame for smooth motion
        tickWeatherParticles(cappedDt);

        // Update stats
        updateStats(cappedDt);

        // Periodic auto-save (every 30 seconds)
        if (timestamp - lastAutoSaveTime > AUTO_SAVE_INTERVAL) {
            saveGameState();
            lastAutoSaveTime = timestamp;
        }

        updateTime = performance.now() - updateStartTime;
    }

    // Always render (so we can see pause state)
    const renderStartTime = performance.now();
    render();
    renderTime = performance.now() - renderStartTime;

    // Collect performance metrics
    const frameTime = performance.now() - frameStartTime;
    collectPerformanceMetrics(frameTime, renderTime, updateTime);

    // Continue loop
    animationId = requestAnimationFrame(gameLoop);
}

/**
 * Start game loop
 */
function startGameLoop() {
    if (isGameRunning) return;
    
    isGameRunning = true;
    lastTime = 0;
    engineTimeAccumulator = 0;
    animationId = requestAnimationFrame(gameLoop);
}

/**
 * Stop game loop (with cleanup)
 */
function stopGameLoop() {
    isGameRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Clean up audio nodes to prevent memory leaks
    if (audioContext && audioContext.state !== 'closed') {
        // Note: We don't close the audio context as it may be reused
        // Just disconnect nodes
        if (masterGain) {
            masterGain.disconnect();
        }
        if (compressor) {
            compressor.disconnect();
        }
    }
}

/**
 * Get sector at mouse position (adjusted for high-DPI)
 */
function getSectorAtPosition(x, y) {
    if (!gameState) return -1;
    
    const devicePixelRatio = effectivePixelRatio;
    const centerX = (canvas.width / devicePixelRatio) / 2;
    const centerY = (canvas.height / devicePixelRatio) / 2;
    
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check if click is in crowd area
    const innerRadius = STADIUM_RADIUS - SECTOR_HEIGHT;
    if (distance < innerRadius || distance > STADIUM_RADIUS) {
        return -1;
    }
    
    // Calculate angle
    let angle = Math.atan2(dy, dx);
    angle = angle + Math.PI / 2; // Adjust so sector 0 is at top
    if (angle < 0) angle += Math.PI * 2;

    const totalSectors = gameState.sectors.length;
    // Sectors are drawn centered on their angle (see precomputeSectorPaths),
    // so shift by half a sector before bucketing. Without this, the hit region
    // is rotated half a sector and clicks/hover land on the neighboring sector.
    const angleWidth = (Math.PI * 2) / totalSectors;
    const sectorIndex = Math.floor(((angle + angleWidth / 2) / (Math.PI * 2)) * totalSectors);

    return sectorIndex % totalSectors;
}

/**
 * Setup input handlers
 */
function setupInputHandlers() {
    // Mouse move for hover effects
    addTrackedEventListener(canvas, 'mousemove', (e) => {
        if (!isGameRunning || isPaused) {
            hoveredSector = -1;
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        hoveredSector = getSectorAtPosition(x, y);
    });
    
    // Mouse leave
    addTrackedEventListener(canvas, 'mouseleave', () => {
        hoveredSector = -1;
    });

    // Click to start wave
    addTrackedEventListener(canvas, 'click', (e) => {
        if (!isGameRunning || isPaused) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const sectorId = getSectorAtPosition(x, y);
        if (sectorId >= 0) {
            activateSector(sectorId);
        }
    });
    
    // Right-click to boost energy
    addTrackedEventListener(canvas, 'contextmenu', (e) => {
        e.preventDefault();
        if (!isGameRunning || isPaused) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const sectorId = getSectorAtPosition(x, y);
        if (sectorId >= 0) {
            selectSector(sectorId);
            boostSector(sectorId);
        }
    });
    
    // Touch support for mobile devices
    let touchStartTime = 0;
    let touchStartSector = -1;
    
    addTrackedEventListener(canvas, 'touchstart', (e) => {
        if (!isGameRunning || isPaused) return;
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        touchStartSector = getSectorAtPosition(x, y);
        touchStartTime = Date.now();
    }, { passive: false });
    
    addTrackedEventListener(canvas, 'touchmove', (e) => {
        if (!isGameRunning || isPaused) {
            hoveredSector = -1;
            return;
        }
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        hoveredSector = getSectorAtPosition(x, y);
    }, { passive: false });

    addTrackedEventListener(canvas, 'touchend', (e) => {
        if (!isGameRunning || isPaused) return;
        e.preventDefault();

        const touchDuration = Date.now() - touchStartTime;

        if (touchStartSector >= 0) {
            // Long press (>500ms) = boost energy
            // Short tap = start wave
            if (touchDuration > 500) {
                selectSector(touchStartSector);
                boostSector(touchStartSector);
            } else {
                activateSector(touchStartSector);
            }
        }

        touchStartSector = -1;
        touchStartTime = 0;
        hoveredSector = -1;
    }, { passive: false });
    
    // Keyboard controls
    addTrackedEventListener(document, 'keydown', (e) => {
        if (!isGameRunning) return;
        
        if (e.code === 'Space' && !isPaused) {
            e.preventDefault();
            startWave(selectedSector >= 0 ? selectedSector : 0);
        } else if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && !isPaused) {
            e.preventDefault();
            const step = e.code === 'ArrowRight' ? 1 : -1;
            selectSector(selectedSector >= 0 ? selectedSector + step : 0);
        } else if (e.code === 'Enter' && !isPaused && selectedSector >= 0 &&
                   !isInteractiveElement(e.target)) {
            e.preventDefault();
            startWave(selectedSector);
        } else if (e.code === 'KeyB' && !isPaused) {
            e.preventDefault();
            boostSelectedSector();
        } else if (e.code === 'KeyP') {
            e.preventDefault();
            togglePause();
        } else if (e.code === 'KeyH') {
            e.preventDefault();
            toggleHelp();
        } else if (e.code === 'KeyF') {
            e.preventDefault();
            toggleFullscreen();
        } else if (e.code === 'Escape') {
            e.preventDefault();
            // Close help if open, otherwise pause
            const helpOverlay = document.getElementById('help-overlay');
            if (!helpOverlay.classList.contains('hidden')) {
                toggleHelp();
            } else if (!isPaused) {
                togglePause();
            }
        }
    });
    
    // Button handlers
    addTrackedEventListener(document.getElementById('help-toggle'), 'click', toggleHelp);
    addTrackedEventListener(document.getElementById('pause-btn'), 'click', togglePause);
    addTrackedEventListener(document.getElementById('resume-btn'), 'click', togglePause);
    addTrackedEventListener(document.getElementById('restart-btn'), 'click', restartGame);
    addTrackedEventListener(document.getElementById('setup-btn'), 'click', returnToSetup);
    addTrackedEventListener(document.getElementById('retry-btn'), 'click', restartGame);
    addTrackedEventListener(document.getElementById('result-setup-btn'), 'click', returnToSetup);

    const mascotBtn = document.getElementById('mascot-btn');
    if (mascotBtn) {
        addTrackedEventListener(mascotBtn, 'click', () => {
            if (!gameState) return;
            const targetSector = hoveredSector >= 0
                ? hoveredSector
                : Math.floor(Math.random() * gameState.sectors.length);
            triggerStadiumEvent('mascot', targetSector);
        });
    }

    const boostBtn = document.getElementById('boost-btn');
    if (boostBtn) {
        addTrackedEventListener(boostBtn, 'click', () => {
            if (!gameState || isPaused) return;
            boostSelectedSector();
        });
    }

    const scoreboardBtn = document.getElementById('scoreboard-btn');
    if (scoreboardBtn) {
        addTrackedEventListener(scoreboardBtn, 'click', () => {
            if (!gameState) return;
            useScoreboardHype();
        });
    }
    
    // Settings handlers
    const soundToggle = document.getElementById('sound-toggle');
    const soundTogglePause = document.getElementById('sound-toggle-pause');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeLabel = document.getElementById('volume-label');
    const fieldTypeSelect = document.getElementById('field-type-select');
    const stadiumTypeSelect = document.getElementById('stadium-type-select');
    const weatherSelect = document.getElementById('weather-select');
    const timeSelect = document.getElementById('time-select');
    fieldType = fieldTypeSelect ? fieldTypeSelect.value : 'soccer';
    stadiumType = stadiumTypeSelect ? stadiumTypeSelect.value : 'classic';
    weatherType = weatherSelect ? weatherSelect.value : 'sunny';
    timeOfDay = timeSelect ? timeSelect.value : 'day';

    addTrackedEventListener(soundToggle, 'change', (e) => {
        soundEnabled = e.target.checked;
        soundTogglePause.checked = soundEnabled;
    });

    addTrackedEventListener(soundTogglePause, 'change', (e) => {
        soundEnabled = e.target.checked;
        soundToggle.checked = soundEnabled;
    });

    addTrackedEventListener(document.getElementById('difficulty-select'), 'change', (e) => {
        difficulty = e.target.value;
        console.log('Difficulty set to:', difficulty);
    });

    if (fieldTypeSelect) {
        addTrackedEventListener(fieldTypeSelect, 'change', (e) => {
            fieldType = e.target.value;
            resetFieldGradients();
            // Notify engine of venue change
            if (gameState) {
                gameAPI.set_venue(fieldType);
                render();
            }
        });
    }

    if (stadiumTypeSelect) {
        addTrackedEventListener(stadiumTypeSelect, 'change', (e) => {
            stadiumType = e.target.value;
            sectorColorCache.clear();

            if (gameState) {
                render();
            }
        });
    }

    if (weatherSelect) {
        addTrackedEventListener(weatherSelect, 'change', (e) => {
            weatherType = e.target.value;
            weatherParticles = [];
            if (gameState) {
                gameAPI.set_weather(weatherType);
            }
        });
    }

    if (timeSelect) {
        addTrackedEventListener(timeSelect, 'change', (e) => {
            timeOfDay = e.target.value;
            resetFieldGradients();
            if (gameState) {
                render();
            }
        });
    }

    if (volumeSlider && volumeLabel) {
        const initialVolume = Number(volumeSlider.value) / 100;
        setMasterVolume(initialVolume);
        volumeLabel.textContent = `${volumeSlider.value}%`;

        addTrackedEventListener(volumeSlider, 'input', (e) => {
            const volume = Number(e.target.value);
            volumeLabel.textContent = `${volume}%`;
            setMasterVolume(volume / 100);
        });
    }
}

/**
 * Start the game
 */
function startGame() {
    document.getElementById('tutorial').classList.add('hidden');
    document.getElementById('game-title').classList.remove('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');
    document.getElementById('help-toggle').classList.remove('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
    document.getElementById('stats-panel').classList.remove('hidden');

    if (soundEnabled) {
        initAudioContext();
        resumeAudioContext();
    }
    
    // Reset game stats
    gameStartTime = Date.now();
    totalGameTime = 0;
    waveAttempts = 0;
    successfulWaves = 0;
    currentStreak = 0;
    
    // Get settings
    soundEnabled = document.getElementById('sound-toggle').checked;
    difficulty = document.getElementById('difficulty-select').value;
    const modeSelectElem = document.getElementById('mode-select');
    gameMode = modeSelectElem ? modeSelectElem.value : 'practice';
    document.getElementById('challenge-item').classList.toggle('hidden', gameMode !== 'challenge');
    const fieldTypeSelectElem = document.getElementById('field-type-select');
    const stadiumTypeSelectElem = document.getElementById('stadium-type-select');
    const weatherSelectElem = document.getElementById('weather-select');
    const timeSelectElem = document.getElementById('time-select');
    fieldType = fieldTypeSelectElem ? fieldTypeSelectElem.value : 'soccer';
    stadiumType = stadiumTypeSelectElem ? stadiumTypeSelectElem.value : 'classic';
    weatherType = weatherSelectElem ? weatherSelectElem.value : 'sunny';
    timeOfDay = timeSelectElem ? timeSelectElem.value : 'day';
    weatherParticles = [];
    resetFieldGradients();
    sectorColorCache.clear();
    resetEventIndicators();
    selectedSector = -1;
    blockedSectorFlash = null;

    initGame();
    startGameLoop();
}

/**
 * Restart the game
 */
function restartGame() {
    // Stop the current game loop
    stopGameLoop();
    
    // Reset game stats
    gameStartTime = Date.now();
    totalGameTime = 0;
    waveAttempts = 0;
    successfulWaves = 0;
    currentStreak = 0;
    
    // Hide pause and result overlays if they're showing
    document.getElementById('pause-overlay').classList.add('hidden');
    hideChallengeResult();
    isPaused = false;
    
    // Reset pause button
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.textContent = '⏸';
    pauseBtn.title = 'Pause Game';

    // Re-initialize game
    resetFieldGradients();
    resetEventIndicators();
    selectedSector = -1;
    blockedSectorFlash = null;
    initGame();
    startGameLoop();
}

/**
 * Return to the setup screen so players can change options
 */
function returnToSetup() {
    stopGameLoop();
    isPaused = false;
    gameState = null;
    hoveredSector = -1;
    selectedSector = -1;
    blockedSectorFlash = null;
    resetFieldGradients();
    resetEventIndicators();

    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.textContent = '⏸';
    pauseBtn.title = 'Pause Game';

    document.getElementById('pause-overlay').classList.add('hidden');
    hideChallengeResult();
    document.getElementById('help-overlay').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    document.getElementById('help-toggle').classList.add('hidden');
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('stats-panel').classList.add('hidden');
    document.getElementById('game-title').classList.add('hidden');
    document.getElementById('tutorial').classList.remove('hidden');

    // Reset surface stats for the next run
    setHudText('game-time', '0:00');
    setHudText('accuracy', '100%');
    setHudText('streak', '0');
    setHudText('score', '0');
    setHudText('combo', '0x');
    setHudText('waves', '0');
    setHudText('max-combo', '0x');
    setHudText('scoreboard-btn', '📣 Scoreboard Hype');
    const scoreboardBtn = document.getElementById('scoreboard-btn');
    if (scoreboardBtn) scoreboardBtn.disabled = false;
}

/**
 * Publish read-only diagnostics so the active engine can be verified in a
 * deployed build. Loading the page with `?e2e` additionally exposes the
 * engine API so smoke tests can drive deterministic scenarios.
 */
function exposeDiagnostics() {
    const diagnostics = {
        engine: 'javascript',
        getState: () => gameState
    };
    if (new URLSearchParams(window.location.search).has('e2e')) {
        diagnostics.api = gameAPI;
    }
    window.waveDiagnostics = diagnostics;
}

/**
 * Main initialization
 */
async function main() {
    console.log('Initializing Stadium Wave Game...');
    
    // Detect device capabilities and set performance tier
    detectPerformanceTier();
    
    // Setup visibility handler for tab backgrounding
    setupVisibilityHandler();
    
    // Setup canvas
    setupCanvas();
    
    // Hide loading screen
    document.getElementById('loading').classList.add('hidden');
    console.log('Running with JavaScript engine');

    // Setup input handlers
    setupInputHandlers();

    // Setup start button
    addTrackedEventListener(document.getElementById('start-btn'), 'click', startGame);

    exposeDiagnostics();

    console.log('Game ready!');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
