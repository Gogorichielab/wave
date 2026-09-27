/**
 * Tests for complete save and restore (issue #126)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { WaveGame, SAVE_VERSION, SaveError, gameAPI } from '../../engine.js';

const rng = () => 0.5;

function preparedGame(options = {}) {
    const { difficulty = 'medium', mode = 'practice', venue = 'soccer', weather = 'sunny' } = options;
    const game = new WaveGame(16, venue, weather, difficulty, rng, mode);
    for (const sector of game.sectors) {
        sector.energy = 1.0;
        sector.enthusiasm = 0.8;
        sector.fatigue = 0;
        sector.distractions = 0;
    }
    return game;
}

function step(game, seconds, hz = 30) {
    const events = [];
    for (let t = 0; t < seconds - 1e-9; t += 1 / hz) {
        game.update(1 / hz);
        events.push(...game.get_events().map(e => e.type));
    }
    return events;
}

function roundTrip(game) {
    return WaveGame.deserialize(JSON.parse(game.save_state()), rng);
}

describe('complete save format', () => {
    test('is versioned', () => {
        assert.equal(preparedGame().serialize().version, SAVE_VERSION);
    });

    test('restores every field', () => {
        const game = preparedGame({ difficulty: 'hard', venue: 'cricket', weather: 'rainy' });
        game.start_wave(0, 'double');
        step(game, 2.5);
        game.boost_sector(3);
        game.use_scoreboard_hype();
        game.get_events();

        assert.deepEqual(roundTrip(game).serialize(), game.serialize());
    });

    for (const pattern of ['normal', 'reverse', 'double', 'accelerating']) {
        test(`resuming mid-wave continues a ${pattern} wave identically`, () => {
            const original = preparedGame();
            original.start_wave(0, pattern);
            step(original, 3.4);
            original.get_events();
            assert.ok(original.wave_active, 'wave should still be running at the save point');

            const restored = roundTrip(original);
            assert.equal(restored.current_wave_sector, original.current_wave_sector);
            assert.equal(restored.wave_timer, original.wave_timer);

            const originalEvents = step(original, 20);
            const restoredEvents = step(restored, 20);
            assert.deepEqual(restoredEvents, originalEvents);
            assert.ok(originalEvents.includes('wave_completed'), `${pattern} wave should complete`);
            assert.deepEqual(restored.serialize(), original.serialize());
        });
    }

    test('restores difficulty tuning with the simulation', () => {
        const restored = roundTrip(preparedGame({ difficulty: 'easy' }));
        assert.equal(restored.difficulty, 'easy');
        assert.equal(restored.tuning.boost_charges, 5);
        assert.equal(restored.max_boost_charges, 5);
        assert.ok(Math.abs(restored.sectors[0]._energy_rate_mult - 1.25) < 1e-9);
    });

    test('restores a running challenge clock', () => {
        const game = preparedGame({ mode: 'challenge' });
        step(game, 10);
        const restored = roundTrip(game);
        assert.equal(restored.mode, 'challenge');
        assert.equal(restored.challenge.status, 'running');
        assert.ok(Math.abs(restored.challenge.time_remaining - 80) < 0.05);
    });

    test('load_state replaces the whole game', () => {
        const source = preparedGame();
        source.start_wave(0, 'reverse');
        step(source, 2.2);
        source.score = 4321;

        const target = new WaveGame(8);
        target.load_state(source.save_state());
        assert.equal(target.num_sectors, 16);
        assert.equal(target.score, 4321);
        assert.equal(target.wave_pattern, 'reverse');
        assert.equal(target.current_wave_sector, source.current_wave_sector);
    });
});

describe('unreadable or incompatible saves', () => {
    function corrupt(mutate) {
        const data = preparedGame().serialize();
        mutate(data);
        return data;
    }

    const cases = {
        'another version': d => { d.version = 1; },
        'missing version (legacy render snapshot)': d => { delete d.version; },
        'wrong sector count': d => { d.sectors.pop(); },
        'unknown sector state': d => { d.sectors[2].state = 'dancing'; },
        'non-numeric energy': d => { d.sectors[0].energy = 'lots'; },
        'NaN timer': d => { d.wave_timer = NaN; },
        'unknown venue': d => { d.venue = 'moon'; },
        'unknown pattern': d => { d.wave_pattern = 'sideways'; },
        'out-of-range sector index': d => { d.current_wave_sector = 99; },
        'active wave without a sector': d => { d.wave_active = true; d.current_wave_sector = -1; },
        'challenge without state': d => { d.mode = 'challenge'; d.challenge = null; },
    };

    for (const [name, mutate] of Object.entries(cases)) {
        test(`rejects ${name}`, () => {
            assert.throws(() => WaveGame.deserialize(corrupt(mutate)), SaveError);
        });
    }

    test('API reports malformed JSON and keeps the current game', () => {
        gameAPI.init_game(16);
        const before = gameAPI.game;
        const result = JSON.parse(gameAPI.load_game('{"version": 2, "sectors": [}'));
        assert.equal(result.status, 'error');
        assert.equal(gameAPI.game, before);
    });

    test('API reports incompatible saves and keeps the current game', () => {
        gameAPI.init_game(16);
        const before = gameAPI.game;
        const result = JSON.parse(gameAPI.load_game(JSON.stringify({ score: 10 })));
        assert.equal(result.status, 'error');
        assert.match(result.message, /version/);
        assert.equal(gameAPI.game, before);
    });

    test('check_save validates without loading', () => {
        gameAPI.init_game(16);
        const before = gameAPI.game;
        assert.deepEqual(JSON.parse(gameAPI.check_save(gameAPI.save_game())), { valid: true });
        assert.equal(JSON.parse(gameAPI.check_save('nope')).valid, false);
        assert.equal(gameAPI.game, before);
    });
});
