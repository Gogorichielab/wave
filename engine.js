/**
 * Stadium Wave game engine
 * Owns the crowd simulation, wave propagation, scoring and persistence.
 * The renderer in main.js talks to it only through `gameAPI`.
 */

export const VENUE_MODIFIERS = {
    soccer:   { energy_rate: 1.00, fatigue_rate: 1.00, readiness_threshold: 0.30 },
    baseball: { energy_rate: 0.95, fatigue_rate: 1.05, readiness_threshold: 0.32 },
    football: { energy_rate: 1.00, fatigue_rate: 1.00, readiness_threshold: 0.30 },
    cricket:  { energy_rate: 0.90, fatigue_rate: 1.10, readiness_threshold: 0.35 },
};

export const WEATHER_MODIFIERS = {
    sunny:  { energy_rate: 1.00, fatigue_rate: 1.00 },
    cloudy: { energy_rate: 0.95, fatigue_rate: 1.00 },
    rainy:  { energy_rate: 0.70, fatigue_rate: 1.20 },
    snowy:  { energy_rate: 0.50, fatigue_rate: 1.30 },
};

// Seconds a sector anticipates before standing once the wave reaches it
const STAND_DELAY = 0.2;
// Accelerating waves shorten each sector interval by this much, down to the minimum
const ACCELERATING_SPEED_STEP = -0.025;
const MIN_WAVE_INTERVAL = 0.1;

export class SectorState {
    static IDLE = "idle";
    static ANTICIPATING = "anticipating";
    static STANDING = "standing";
    static SEATED = "seated";
}

export class CrowdSector {
    constructor(sectorId, size = 100) {
        this.sector_id = sectorId;
        this.size = size;
        this.state = SectorState.IDLE;
        this.energy = 0.5;
        this.fatigue = 0.0;
        this.enthusiasm = Math.random() * 0.3 + 0.6;
        this.distractions = 0.0;
        this.timer = 0;
        this._energy_rate_mult = 1.0;
        this._fatigue_rate_mult = 1.0;
        this._readiness_threshold = 0.30;
    }

    update(dt) {
        // Validate dt to prevent NaN or negative values
        if (!Number.isFinite(dt) || dt < 0) {
            dt = 0.0;
        }

        if (this.fatigue > 0) {
            this.fatigue = Math.max(0, this.fatigue - dt * 0.05 * this._fatigue_rate_mult);
        }

        if (this.energy < 1.0) {
            this.energy = Math.min(1.0, this.energy + dt * 0.1 * this._energy_rate_mult);
        }

        if (this.state === SectorState.STANDING) {
            this.timer += dt;
            if (this.timer > 1.5) {
                this.sit_down();
            }
        } else if (this.state === SectorState.ANTICIPATING) {
            this.timer += dt;
            if (this.timer > 0.5) {
                this.state = SectorState.IDLE;
                this.timer = 0;
            }
        }
    }

    can_wave() {
        const readiness = (this.energy * this.enthusiasm) - (this.fatigue + this.distractions);
        return readiness > this._readiness_threshold &&
               (this.state === SectorState.IDLE || this.state === SectorState.SEATED);
    }

    start_wave() {
        if (this.can_wave()) {
            this.state = SectorState.ANTICIPATING;
            this.timer = 0;
            return true;
        }
        return false;
    }

    stand_up() {
        if (this.state === SectorState.ANTICIPATING) {
            this.state = SectorState.STANDING;
            this.timer = 0;
            this.energy = Math.max(0, this.energy - 0.2);
            this.fatigue = Math.min(1.0, this.fatigue + 0.1);
            return true;
        }
        return false;
    }

    sit_down() {
        this.state = SectorState.SEATED;
        this.timer = 0;
    }

    boost_energy(amount = 0.3) {
        this.energy = Math.min(1.0, this.energy + amount);
        this.distractions = Math.max(0, this.distractions - 0.1);
    }

    to_dict() {
        return {
            id: this.sector_id,
            state: this.state,
            energy: this.energy,
            fatigue: this.fatigue,
            enthusiasm: this.enthusiasm,
            distractions: this.distractions
        };
    }
}

export class WaveGame {
    constructor(num_sectors = 16, venue = 'soccer', weather = 'sunny') {
        this.num_sectors = num_sectors;
        this.sectors = [];
        for (let i = 0; i < num_sectors; i++) {
            this.sectors.push(new CrowdSector(i, Math.floor(Math.random() * 40) + 80));
        }
        this.score = 0;
        this.combo = 0;
        this.max_combo = 0;
        this.wave_active = false;
        this.wave_start_sector = -1;
        this.current_wave_sector = -1;
        this.time_elapsed = 0.0;
        this.successful_waves = 0;
        this.failed_waves = 0;
        this.wave_speed = 1.0;
        this.wave_timer = 0.0;
        this.events = [];
        this.stadium_level = 1;
        this.unlocks = [];

        // Special wave pattern support
        this.wave_pattern = 'normal';  // normal, reverse, double, accelerating
        this.wave_direction = 1;  // 1 for clockwise, -1 for counter-clockwise
        this.base_wave_speed = 1.0;
        this.speed_increment = 0.0;  // for accelerating pattern
        this.sectors_traveled = 0;

        // Double wave support
        this.second_wave_active = false;
        this.second_wave_start_sector = -1;
        this.second_current_wave_sector = -1;
        this.second_wave_timer = 0.0;

        // Venue and weather
        this.venue = venue;
        this.weather = weather;
        this._applyModifiers();
    }

    _applyModifiers() {
        const vm = VENUE_MODIFIERS[this.venue] || VENUE_MODIFIERS.soccer;
        const wm = WEATHER_MODIFIERS[this.weather] || WEATHER_MODIFIERS.sunny;
        const energyRate = vm.energy_rate * wm.energy_rate;
        const fatigueRate = vm.fatigue_rate * wm.fatigue_rate;
        const threshold = vm.readiness_threshold;
        for (const sector of this.sectors) {
            sector._energy_rate_mult = energyRate;
            sector._fatigue_rate_mult = fatigueRate;
            sector._readiness_threshold = threshold;
        }
    }

    set_venue(venue) {
        this.venue = venue;
        this._applyModifiers();
    }

    set_weather(weather) {
        this.weather = weather;
        this._applyModifiers();
    }

    selectWavePattern() {
        // Randomly select a wave pattern
        const patterns = ['normal', 'reverse', 'double', 'accelerating'];
        const rand = Math.random();

        if (rand < 0.4) {
            this.wave_pattern = 'normal';
        } else if (rand < 0.6) {
            this.wave_pattern = 'reverse';
        } else if (rand < 0.8) {
            this.wave_pattern = 'double';
        } else {
            this.wave_pattern = 'accelerating';
        }

        if (this.wave_pattern === 'reverse') {
            this.wave_direction = -1;
        } else if (this.wave_pattern === 'double') {
            this.wave_direction = 1;
        } else if (this.wave_pattern === 'accelerating') {
            this.wave_direction = 1;
            this.speed_increment = ACCELERATING_SPEED_STEP;  // Get faster over time
        } else {  // normal
            this.wave_direction = 1;
        }

        this.sectors_traveled = 0;
        this.wave_speed = this.base_wave_speed;
    }

    start_wave(sector_id, pattern = null) {
        // A double wave's second front can still be running after the first finishes
        if (this.wave_active || this.second_wave_active) {
            return false;
        }

        // Validate sector_id
        if (!Number.isInteger(sector_id) || sector_id < 0 || sector_id >= this.num_sectors) {
            console.warn(`Invalid sector_id: ${sector_id}`);
            return false;
        }


        const sector = this.sectors[sector_id];
        if (sector.start_wave()) {
            // Select pattern (use provided or random)
            if (pattern) {
                this.wave_pattern = pattern;
                // Set direction and speed based on pattern
                if (this.wave_pattern === 'reverse') {
                    this.wave_direction = -1;
                } else if (this.wave_pattern === 'double') {
                    this.wave_direction = 1;
                } else if (this.wave_pattern === 'accelerating') {
                    this.wave_direction = 1;
                    this.speed_increment = ACCELERATING_SPEED_STEP;
                } else {  // normal
                    this.wave_direction = 1;
                }
                this.sectors_traveled = 0;
                this.wave_speed = this.base_wave_speed;
            } else {
                this.selectWavePattern();
            }

            this.wave_active = true;
            this.wave_start_sector = sector_id;
            this.current_wave_sector = sector_id;
            this.wave_timer = 0.0;

            // For double wave, start second wave on opposite side
            if (this.wave_pattern === 'double') {
                const opposite_sector = (sector_id + Math.floor(this.num_sectors / 2)) % this.num_sectors;
                if (this.sectors[opposite_sector].start_wave()) {
                    this.second_wave_active = true;
                    this.second_wave_start_sector = opposite_sector;
                    this.second_current_wave_sector = opposite_sector;
                    this.second_wave_timer = 0.0;
                }
            }

            this.schedule_event('wave_started', {
                sector: sector_id,
                pattern: this.wave_pattern,
                direction: this.wave_direction === 1 ? 'clockwise' : 'counter-clockwise'
            });
            return true;
        }
        return false;
    }

    update(dt) {
        // Validate dt to prevent NaN or negative values
        if (!Number.isFinite(dt) || dt < 0) {
            console.warn(`Invalid dt value in game update: ${dt}, resetting to 0`);
            dt = 0.0;
        }

        this.time_elapsed += dt;

        for (const sector of this.sectors) {
            sector.update(dt);
        }

        // Handle wave propagation for first wave
        if (this.wave_active) {
            this._updateWave(dt, false);
        }

        // Handle second wave for double pattern
        if (this.second_wave_active) {
            this._updateWave(dt, true);
        }
    }

    _updateWave(dt, isSecondWave = false) {
        const timerKey = isSecondWave ? 'second_wave_timer' : 'wave_timer';
        const activeKey = isSecondWave ? 'second_wave_active' : 'wave_active';

        this[timerKey] += dt;

        while (this[activeKey]) {
            this._standIfDue(isSecondWave);
            if (this[timerKey] < this.wave_speed) {
                break;
            }
            // Carry the remainder into the next sector's interval so pacing
            // does not depend on the update rate
            this[timerKey] -= this.wave_speed;
            this._advanceFront(isSecondWave);
        }
    }

    _standIfDue(isSecondWave) {
        const timer = isSecondWave ? this.second_wave_timer : this.wave_timer;
        const sectorId = isSecondWave ? this.second_current_wave_sector : this.current_wave_sector;
        const current = this.sectors[sectorId];
        if (current.state === SectorState.ANTICIPATING && timer > STAND_DELAY) {
            if (current.stand_up()) {
                this.combo += 1;
                this.score += 10 * this.combo;
            }
        }
    }

    _advanceFront(isSecondWave) {
        const currentSector = isSecondWave ? this.second_current_wave_sector : this.current_wave_sector;
        const startSector = isSecondWave ? this.second_wave_start_sector : this.wave_start_sector;

        // For accelerating pattern, shorten the interval for the next sector
        if (this.wave_pattern === 'accelerating' && !isSecondWave) {
            this.wave_speed = Math.max(MIN_WAVE_INTERVAL, this.wave_speed + this.speed_increment);
            this.sectors_traveled += 1;
        }

        const next_sector_id = (currentSector + this.wave_direction + this.num_sectors) % this.num_sectors;

        // Check if wave completed full circle
        if (next_sector_id === startSector) {
            if (isSecondWave) {
                this.second_wave_active = false;
                // Check if both waves completed
                if (!this.wave_active) {
                    this.complete_wave();
                }
            } else {
                // For double wave, wait for second wave to complete
                this.wave_active = false;
                if (!this.second_wave_active || this.wave_pattern !== 'double') {
                    this.complete_wave();
                }
            }
            return;
        }

        if (this.sectors[next_sector_id].start_wave()) {
            if (isSecondWave) {
                this.second_current_wave_sector = next_sector_id;
            } else {
                this.current_wave_sector = next_sector_id;
            }
        } else {
            // Wave failed; a failure on either front ends both
            this.fail_wave();
        }
    }

    complete_wave() {
        this.wave_active = false;
        this.second_wave_active = false;
        this.successful_waves += 1;

        // Bonus multiplier for special patterns
        let pattern_bonus = 1.0;
        if (this.wave_pattern === 'reverse') {
            pattern_bonus = 1.5;
        } else if (this.wave_pattern === 'double') {
            pattern_bonus = 2.0;
        } else if (this.wave_pattern === 'accelerating') {
            pattern_bonus = 1.3;
        }

        const bonus = 100 * (1 + this.combo * 0.5) * pattern_bonus;
        this.score += Math.floor(bonus);
        this.max_combo = Math.max(this.max_combo, this.combo);
        this.schedule_event('wave_completed', {
            combo: this.combo,
            bonus: bonus,
            pattern: this.wave_pattern
        });
    }

    fail_wave() {
        this.wave_active = false;
        this.second_wave_active = false;
        this.failed_waves += 1;
        this.combo = 0;
        this.schedule_event('wave_failed', {
            sector: this.current_wave_sector,
            pattern: this.wave_pattern
        });
    }

    boost_sector(sector_id) {
        if (sector_id >= 0 && sector_id < this.num_sectors) {
            this.sectors[sector_id].boost_energy();
        }
    }

    trigger_event(event_type, sector_id = null) {
        if (event_type === 'mascot') {
            if (sector_id !== null && sector_id !== undefined) {
                for (let i = -1; i <= 1; i++) {
                    const idx = (sector_id + i + this.num_sectors) % this.num_sectors;
                    this.sectors[idx].distractions = Math.min(1.0, this.sectors[idx].distractions + 0.3);
                }
            }

            const affected = sector_id === null || sector_id === undefined
                ? []
                : [-1, 0, 1].map(i => (sector_id + i + this.num_sectors) % this.num_sectors);

            this.schedule_event('mascot', {
                sector: sector_id,
                affected,
                effect: 'distraction'
            });
        } else if (event_type === 'scoreboard') {
            this.sectors.forEach(sector => sector.boost_energy(0.2));
            this.schedule_event('scoreboard', {
                boost: 0.2,
                effect: 'energy'
            });
        }
    }

    schedule_event(event_type, data = null) {
        this.events.push({
            type: event_type,
            data: data,
            time: this.time_elapsed
        });
    }

    get_events() {
        const events = [...this.events];
        this.events = [];
        return events;
    }

    get_state() {
        return {
            sectors: this.sectors.map(s => s.to_dict()),
            score: this.score,
            combo: this.combo,
            max_combo: this.max_combo,
            wave_active: this.wave_active,
            current_wave_sector: this.current_wave_sector,
            successful_waves: this.successful_waves,
            failed_waves: this.failed_waves,
            stadium_level: this.stadium_level,
            time_elapsed: this.time_elapsed,
            wave_pattern: this.wave_pattern,
            wave_direction: this.wave_direction,
            second_wave_active: this.second_wave_active,
            second_current_wave_sector: this.second_current_wave_sector,
            venue: this.venue,
            weather: this.weather,
        };
    }

    save_state() {
        const state = this.get_state();
        state.unlocks = this.unlocks;
        return JSON.stringify(state);
    }

    load_state(json_str) {
        const state = JSON.parse(json_str);
        this.score = state.score || 0;
        this.max_combo = state.max_combo || 0;
        this.successful_waves = state.successful_waves || 0;
        this.stadium_level = state.stadium_level || 1;
        this.unlocks = state.unlocks || [];
    }
}

// Engine API used by the renderer
export const gameAPI = {
    game: null,

    init_game(num_sectors = 16, venue = 'soccer', weather = 'sunny') {
        this.game = new WaveGame(num_sectors, venue, weather);
        return JSON.stringify({ status: 'initialized', sectors: num_sectors });
    },
    
    update_game(dt) {
        this.game.update(dt);
        return JSON.stringify(this.game.get_state());
    },

    // Fast path for the render loop: returns plain objects so the caller
    // avoids a JSON stringify/parse round trip every frame.
    update_game_with_events(dt) {
        this.game.update(dt);
        return { state: this.game.get_state(), events: this.game.get_events() };
    },
    
    start_wave_at(sector_id, pattern = null) {
        const success = this.game.start_wave(sector_id, pattern);
        return JSON.stringify({ success, sector: sector_id, pattern: this.game.wave_pattern });
    },
    
    boost_sector_energy(sector_id) {
        this.game.boost_sector(sector_id);
        return JSON.stringify({ boosted: sector_id });
    },
    
    get_game_state() {
        return JSON.stringify(this.game.get_state());
    },
    
    get_events() {
        return JSON.stringify(this.game.get_events());
    },
    
    save_game() {
        return this.game.save_state();
    },

    load_game(save_data) {
        try {
            this.game.load_state(save_data);
            return JSON.stringify({ status: 'loaded' });
        } catch (e) {
            return JSON.stringify({ status: 'error', message: e.message });
        }
    },

    trigger_event(event_type, sector_id = null) {
        this.game.trigger_event(event_type, sector_id);
        return JSON.stringify({ status: 'triggered', event: event_type, sector: sector_id });
    },

    set_venue(venue) {
        this.game.set_venue(venue);
        return JSON.stringify({ status: 'ok', venue });
    },

    set_weather(weather) {
        this.game.set_weather(weather);
        return JSON.stringify({ status: 'ok', weather });
    },
};
