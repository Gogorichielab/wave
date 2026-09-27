/**
 * Unit tests for the Stadium Wave game engine
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CrowdSector, WaveGame, SectorState, gameAPI } from '../../engine.js';

function readyAll(game, energy = 0.8, enthusiasm = 0.8) {
    for (const sector of game.sectors) {
        sector.energy = energy;
        sector.enthusiasm = enthusiasm;
    }
}

describe('CrowdSector', () => {
    test('initializes correctly', () => {
        const sector = new CrowdSector(0);
        assert.equal(sector.sector_id, 0);
        assert.equal(sector.state, SectorState.IDLE);
        assert.ok(sector.energy >= 0 && sector.energy <= 1);
        assert.ok(sector.enthusiasm >= 0 && sector.enthusiasm <= 1);
    });

    test('checks wave readiness', () => {
        const sector = new CrowdSector(0);
        sector.energy = 0.8;
        sector.enthusiasm = 0.8;
        sector.fatigue = 0.0;
        assert.ok(sector.can_wave());

        sector.fatigue = 0.9;
        assert.ok(!sector.can_wave());
    });

    test('follows the state machine', () => {
        const sector = new CrowdSector(0);
        sector.energy = 0.8;
        sector.enthusiasm = 0.8;

        assert.ok(sector.start_wave());
        assert.equal(sector.state, SectorState.ANTICIPATING);

        assert.ok(sector.stand_up());
        assert.equal(sector.state, SectorState.STANDING);

        sector.sit_down();
        assert.equal(sector.state, SectorState.SEATED);
    });

    test('boosts energy without exceeding 1', () => {
        const sector = new CrowdSector(0);
        const initial = sector.energy;
        sector.boost_energy(0.3);
        assert.ok(sector.energy > initial);
        assert.ok(sector.energy <= 1.0);
    });

    test('sits down after standing long enough', () => {
        const sector = new CrowdSector(0);
        sector.state = SectorState.STANDING;
        sector.timer = 0;
        sector.update(2.0);
        assert.equal(sector.state, SectorState.SEATED);
    });

    test('serializes to a dict', () => {
        const data = new CrowdSector(5).to_dict();
        assert.equal(data.id, 5);
        assert.ok('state' in data);
        assert.ok('energy' in data);
    });
});

describe('WaveGame', () => {
    test('initializes correctly', () => {
        const game = new WaveGame(16);
        assert.equal(game.sectors.length, 16);
        assert.equal(game.score, 0);
        assert.equal(game.combo, 0);
        assert.ok(!game.wave_active);
    });

    test('starts a wave', () => {
        const game = new WaveGame(8);
        game.sectors[0].energy = 0.8;
        game.sectors[0].enthusiasm = 0.8;

        assert.ok(game.start_wave(0));
        assert.ok(game.wave_active);
        assert.equal(game.wave_start_sector, 0);
    });

    test('propagates a wave', () => {
        const game = new WaveGame(8);
        readyAll(game);
        game.start_wave(0);
        assert.equal(game.current_wave_sector, 0);

        game.update(0.5);
        assert.ok([SectorState.STANDING, SectorState.SEATED].includes(game.sectors[0].state));
    });

    test('rejects invalid sector ids', () => {
        const game = new WaveGame(8);
        readyAll(game);
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            assert.equal(game.start_wave(-1), false);
            assert.equal(game.start_wave(8), false);
            assert.equal(game.start_wave(1.5), false);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('boosts a sector', () => {
        const game = new WaveGame(8);
        game.sectors[3].energy = 0.2;
        game.boost_sector(3);
        assert.ok(game.sectors[3].energy > 0.2);
    });

    test('includes the expected fields in state', () => {
        const state = new WaveGame(8).get_state();
        assert.ok('sectors' in state);
        assert.ok('score' in state);
        assert.ok('combo' in state);
        assert.equal(state.sectors.length, 8);
    });

    test('saves and loads score data', () => {
        const game = new WaveGame(8);
        game.score = 1000;
        game.max_combo = 15;

        const saveData = game.save_state();
        assert.ok(saveData);

        const restored = new WaveGame(8);
        restored.load_state(saveData);
        assert.equal(restored.score, 1000);
        assert.equal(restored.max_combo, 15);
    });

    test('queues and drains events', () => {
        const game = new WaveGame(8);
        game.schedule_event('test_event', { data: 'test' });

        const events = game.get_events();
        assert.equal(events.length, 1);
        assert.equal(events[0].type, 'test_event');
        assert.equal(game.get_events().length, 0);
    });

    test('applies external events', () => {
        const game = new WaveGame(8);

        game.trigger_event('mascot', 3);
        assert.ok(game.sectors[3].distractions > 0);

        const initialEnergy = game.sectors.map(s => s.energy);
        game.trigger_event('scoreboard');
        game.sectors.forEach((sector, i) => assert.ok(sector.energy >= initialEnergy[i]));

        const types = new Set(game.get_events().map(e => e.type));
        assert.ok(types.has('mascot'));
        assert.ok(types.has('scoreboard'));
    });
});

describe('gameAPI', () => {
    test('init_game', () => {
        const data = JSON.parse(gameAPI.init_game(12));
        assert.equal(data.status, 'initialized');
        assert.equal(data.sectors, 12);
    });

    test('update_game', () => {
        gameAPI.init_game(8);
        const state = JSON.parse(gameAPI.update_game(0.016));
        assert.ok('sectors' in state);
        assert.ok('score' in state);
    });

    test('update_game_with_events returns plain objects', () => {
        gameAPI.init_game(8);
        gameAPI.trigger_event('scoreboard');
        const payload = gameAPI.update_game_with_events(0.016);
        assert.ok(Array.isArray(payload.state.sectors));
        assert.ok(payload.events.some(e => e.type === 'scoreboard'));
    });

    test('start_wave_at', () => {
        gameAPI.init_game(8);
        const data = JSON.parse(gameAPI.start_wave_at(0));
        assert.ok('success' in data);
        assert.equal(data.sector, 0);
    });

    test('get_game_state', () => {
        gameAPI.init_game(8);
        assert.ok('sectors' in JSON.parse(gameAPI.get_game_state()));
    });

    test('trigger_event', () => {
        gameAPI.init_game(8);
        gameAPI.trigger_event('scoreboard');
        const events = JSON.parse(gameAPI.get_events());
        assert.ok(events.some(e => e.type === 'scoreboard'));
    });

    test('save_game and load_game', () => {
        gameAPI.init_game(8);
        const saveData = gameAPI.save_game();
        assert.ok(saveData);
        assert.equal(JSON.parse(gameAPI.load_game(saveData)).status, 'loaded');
    });

    test('load_game reports malformed data', () => {
        gameAPI.init_game(8);
        assert.equal(JSON.parse(gameAPI.load_game('{not json')).status, 'error');
    });
});

describe('special wave patterns', () => {
    test('reverse wave propagates counter-clockwise', () => {
        const game = new WaveGame(8);
        readyAll(game);

        game.start_wave(0, 'reverse');
        assert.equal(game.wave_pattern, 'reverse');
        assert.equal(game.wave_direction, -1);
        assert.equal(game.current_wave_sector, 0);

        game.update(1.1);
        assert.ok(
            game.current_wave_sector === 7 ||
            [SectorState.ANTICIPATING, SectorState.STANDING].includes(game.sectors[7].state)
        );
    });

    test('double wave starts two fronts', () => {
        const game = new WaveGame(16);
        readyAll(game);

        game.start_wave(0, 'double');
        assert.equal(game.wave_pattern, 'double');
        assert.ok(game.wave_active);
        assert.ok(game.second_wave_active);
        assert.equal(game.wave_start_sector, 0);
        assert.equal(game.second_wave_start_sector, 8);
    });

    test('accelerating wave speeds up', () => {
        const game = new WaveGame(8);
        readyAll(game);

        game.start_wave(0, 'accelerating');
        assert.equal(game.wave_pattern, 'accelerating');
        const initialSpeed = game.wave_speed;

        for (let i = 0; i < 3; i++) {
            game.update(0.55);
        }
        assert.ok(game.wave_speed < initialSpeed);
    });

    test('special patterns score a bonus', () => {
        const reverse = new WaveGame(8);
        reverse.wave_pattern = 'reverse';
        reverse.combo = 5;
        reverse.complete_wave();

        const normal = new WaveGame(8);
        normal.wave_pattern = 'normal';
        normal.combo = 5;
        normal.complete_wave();

        assert.ok(reverse.score > normal.score);
    });

    test('random pattern selection uses valid patterns', () => {
        const game = new WaveGame(8);
        const patterns = new Set();
        for (let i = 0; i < 50; i++) {
            game.selectWavePattern();
            patterns.add(game.wave_pattern);
        }
        assert.ok(patterns.size >= 2);
        for (const p of patterns) {
            assert.ok(['normal', 'reverse', 'double', 'accelerating'].includes(p));
        }
    });

    test('state includes pattern information', () => {
        const game = new WaveGame(8);
        readyAll(game);
        game.start_wave(0, 'reverse');

        const state = game.get_state();
        assert.equal(state.wave_pattern, 'reverse');
        assert.equal(state.wave_direction, -1);
        assert.ok('second_wave_active' in state);
        assert.ok('second_current_wave_sector' in state);
    });
});

describe('venue modifiers', () => {
    test('cricket has a higher readiness threshold', () => {
        const soccer = new WaveGame(8, 'soccer');
        const cricket = new WaveGame(8, 'cricket');
        assert.ok(cricket.sectors[0]._readiness_threshold > soccer.sectors[0]._readiness_threshold);
    });

    test('cricket has a lower energy rate', () => {
        const soccer = new WaveGame(8, 'soccer');
        const cricket = new WaveGame(8, 'cricket');
        assert.ok(cricket.sectors[0]._energy_rate_mult < soccer.sectors[0]._energy_rate_mult);
    });

    test('baseball sits between soccer and cricket', () => {
        const soccer = new WaveGame(8, 'soccer').sectors[0]._readiness_threshold;
        const baseball = new WaveGame(8, 'baseball').sectors[0]._readiness_threshold;
        const cricket = new WaveGame(8, 'cricket').sectors[0]._readiness_threshold;
        assert.ok(soccer < baseball && baseball < cricket);
    });

    test('set_venue updates all sectors', () => {
        const game = new WaveGame(8, 'soccer');
        const original = game.sectors[0]._readiness_threshold;
        game.set_venue('cricket');
        for (const sector of game.sectors) {
            assert.ok(sector._readiness_threshold > original);
        }
    });

    test('state includes venue', () => {
        assert.equal(new WaveGame(8, 'cricket').get_state().venue, 'cricket');
    });
});

describe('weather modifiers', () => {
    test('rain lowers the energy rate', () => {
        const sunny = new WaveGame(8, 'soccer', 'sunny');
        const rainy = new WaveGame(8, 'soccer', 'rainy');
        assert.ok(rainy.sectors[0]._energy_rate_mult < sunny.sectors[0]._energy_rate_mult);
    });

    test('snow lowers the energy rate', () => {
        const sunny = new WaveGame(8, 'soccer', 'sunny');
        const snowy = new WaveGame(8, 'soccer', 'snowy');
        assert.ok(snowy.sectors[0]._energy_rate_mult < sunny.sectors[0]._energy_rate_mult);
    });

    test('weather slows energy recovery', () => {
        const sector = new WaveGame(8, 'soccer', 'rainy').sectors[0];
        sector.energy = 0.0;
        sector.fatigue = 0.0;
        sector.state = SectorState.IDLE;
        sector.update(1.0);
        assert.ok(sector.energy < 0.1);
    });

    test('set_weather updates all sectors', () => {
        const game = new WaveGame(8, 'soccer', 'sunny');
        const original = game.sectors[0]._energy_rate_mult;
        game.set_weather('rainy');
        for (const sector of game.sectors) {
            assert.ok(sector._energy_rate_mult < original);
        }
    });

    test('venue and weather multipliers combine', () => {
        const game = new WaveGame(8, 'cricket', 'rainy');
        assert.ok(Math.abs(game.sectors[0]._energy_rate_mult - 0.9 * 0.7) < 1e-9);
    });

    test('state includes weather', () => {
        assert.equal(new WaveGame(8, 'soccer', 'snowy').get_state().weather, 'snowy');
    });
});
