/**
 * Tests for difficulty tuning and player resource limits (issue #124)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { WaveGame, DIFFICULTY_PRESETS, gameAPI } from '../../engine.js';

function advance(game, seconds, hz = 30) {
    const dt = 1 / hz;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
        game.update(dt);
    }
}

describe('difficulty presets', () => {
    test('defaults to medium and falls back to medium for unknown values', () => {
        assert.equal(new WaveGame(8).difficulty, 'medium');
        assert.equal(new WaveGame(8, 'soccer', 'sunny', 'impossible').difficulty, 'medium');
    });

    test('harder settings are measurably harder on every axis', () => {
        const { easy, medium, hard } = DIFFICULTY_PRESETS;
        // Faster waves leave less time to react
        assert.ok(easy.wave_interval > medium.wave_interval && medium.wave_interval > hard.wave_interval);
        assert.ok(easy.energy_rate > medium.energy_rate && medium.energy_rate > hard.energy_rate);
        assert.ok(easy.mascot_interval > medium.mascot_interval && medium.mascot_interval > hard.mascot_interval);
        assert.ok(easy.distraction_strength < medium.distraction_strength && medium.distraction_strength < hard.distraction_strength);
        assert.ok(easy.boost_charges > medium.boost_charges && medium.boost_charges > hard.boost_charges);
        assert.ok(easy.boost_recharge < medium.boost_recharge && medium.boost_recharge < hard.boost_recharge);
        assert.ok(easy.hype_cooldown < medium.hype_cooldown && medium.hype_cooldown < hard.hype_cooldown);
    });

    for (const difficulty of Object.keys(DIFFICULTY_PRESETS)) {
        test(`${difficulty} applies its wave interval`, () => {
            const game = new WaveGame(16, 'soccer', 'sunny', difficulty);
            for (const sector of game.sectors) {
                sector.energy = 1.0;
                sector.enthusiasm = 0.8;
            }
            game.start_wave(0, 'normal');
            const interval = DIFFICULTY_PRESETS[difficulty].wave_interval;

            advance(game, interval - 0.05);
            assert.equal(game.current_wave_sector, 0);
            advance(game, 0.1);
            assert.equal(game.current_wave_sector, 1);
        });
    }

    test('difficulty scales energy recovery on top of venue and weather', () => {
        const easy = new WaveGame(8, 'cricket', 'rainy', 'easy');
        const hard = new WaveGame(8, 'cricket', 'rainy', 'hard');
        assert.ok(Math.abs(easy.sectors[0]._energy_rate_mult - 0.9 * 0.7 * 1.25) < 1e-9);
        assert.ok(Math.abs(hard.sectors[0]._energy_rate_mult - 0.9 * 0.7 * 0.8) < 1e-9);
    });

    test('mascot distraction strength follows difficulty', () => {
        const easy = new WaveGame(8, 'soccer', 'sunny', 'easy');
        const hard = new WaveGame(8, 'soccer', 'sunny', 'hard');
        easy.trigger_event('mascot', 3);
        hard.trigger_event('mascot', 3);
        assert.ok(Math.abs(easy.sectors[3].distractions - 0.2) < 1e-9);
        assert.ok(Math.abs(hard.sectors[3].distractions - 0.4) < 1e-9);
    });

    test('ambient mascot visits follow the difficulty interval', () => {
        for (const difficulty of ['easy', 'hard']) {
            const game = new WaveGame(8, 'soccer', 'sunny', difficulty, () => 0.5);
            const interval = DIFFICULTY_PRESETS[difficulty].mascot_interval;

            advance(game, interval - 0.5);
            assert.ok(!game.get_events().some(e => e.type === 'mascot'), `${difficulty}: too early`);

            advance(game, 1.0);
            const mascot = game.get_events().find(e => e.type === 'mascot');
            assert.ok(mascot, `${difficulty}: mascot should visit`);
            assert.equal(mascot.data.sector, 4); // rng 0.5 * 8 sectors
        }
    });

    test('state reports difficulty', () => {
        assert.equal(new WaveGame(8, 'soccer', 'sunny', 'hard').get_state().difficulty, 'hard');
    });
});

describe('boost charges', () => {
    test('each boost spends one charge', () => {
        const game = new WaveGame(8, 'soccer', 'sunny', 'medium');
        assert.equal(game.boost_charges, 3);
        assert.deepEqual(game.boost_sector(1), { boosted: true });
        assert.equal(game.boost_charges, 2);
    });

    test('repeated boosts cannot exceed the budget', () => {
        const game = new WaveGame(8, 'soccer', 'sunny', 'hard');
        for (const sector of game.sectors) sector.energy = 0;

        const results = [];
        for (let i = 0; i < 10; i++) {
            results.push(game.boost_sector(2).boosted);
        }
        assert.equal(results.filter(Boolean).length, DIFFICULTY_PRESETS.hard.boost_charges);
        assert.deepEqual(game.boost_sector(2), { boosted: false, reason: 'no_charges' });
        assert.equal(game.boost_charges, 0);
    });

    test('failed boosts leave the sector unchanged', () => {
        const game = new WaveGame(8);
        game.boost_charges = 0;
        game.sectors[2].energy = 0.1;
        game.boost_sector(2);
        assert.equal(game.sectors[2].energy, 0.1);
    });

    test('invalid sectors do not spend a charge', () => {
        const game = new WaveGame(8);
        assert.deepEqual(game.boost_sector(99), { boosted: false, reason: 'invalid_sector' });
        assert.deepEqual(game.boost_sector(-1), { boosted: false, reason: 'invalid_sector' });
        assert.equal(game.boost_charges, 3);
    });

    test('charges recharge one at a time up to the maximum', () => {
        const game = new WaveGame(8, 'soccer', 'sunny', 'medium');
        const recharge = DIFFICULTY_PRESETS.medium.boost_recharge;
        game.boost_sector(0);
        game.boost_sector(0);
        assert.equal(game.boost_charges, 1);

        advance(game, recharge - 0.5);
        assert.equal(game.boost_charges, 1);
        assert.ok(game.get_state().boost_recharge_remaining > 0);

        advance(game, 1.0);
        assert.equal(game.boost_charges, 2);

        advance(game, recharge * 5);
        assert.equal(game.boost_charges, 3);
        assert.equal(game.get_state().boost_recharge_remaining, 0);
    });

    test('state exposes charges and recharge time before the player acts', () => {
        const state = new WaveGame(8, 'soccer', 'sunny', 'easy').get_state();
        assert.equal(state.boost_charges, 5);
        assert.equal(state.max_boost_charges, 5);
        assert.equal(state.boost_recharge_time, DIFFICULTY_PRESETS.easy.boost_recharge);
    });

    test('API reports the outcome and remaining charges', () => {
        gameAPI.init_game(8, 'soccer', 'sunny', 'hard');
        assert.equal(JSON.parse(gameAPI.boost_sector_energy(1)).charges, 1);
        assert.equal(JSON.parse(gameAPI.boost_sector_energy(1)).charges, 0);
        const denied = JSON.parse(gameAPI.boost_sector_energy(1));
        assert.equal(denied.boosted, false);
        assert.equal(denied.reason, 'no_charges');
        assert.ok(denied.recharge_remaining > 0);
    });
});

describe('scoreboard hype cooldown', () => {
    test('hype boosts the crowd and then cools down', () => {
        const game = new WaveGame(8, 'soccer', 'sunny', 'medium');
        for (const sector of game.sectors) sector.energy = 0.2;

        assert.deepEqual(game.use_scoreboard_hype(), { used: true });
        assert.ok(game.sectors.every(s => s.energy > 0.2));
        assert.equal(game.hype_cooldown_remaining, DIFFICULTY_PRESETS.medium.hype_cooldown);
    });

    test('repeated clicks cannot bypass the cooldown', () => {
        const game = new WaveGame(8);
        game.use_scoreboard_hype();
        game.get_events();

        for (let i = 0; i < 5; i++) {
            assert.deepEqual(game.use_scoreboard_hype(), { used: false, reason: 'cooldown' });
        }
        assert.equal(game.get_events().filter(e => e.type === 'scoreboard').length, 0);
    });

    test('hype is available again after the cooldown', () => {
        const game = new WaveGame(8, 'soccer', 'sunny', 'easy');
        game.use_scoreboard_hype();
        advance(game, DIFFICULTY_PRESETS.easy.hype_cooldown + 0.1);
        assert.equal(game.hype_cooldown_remaining, 0);
        assert.deepEqual(game.use_scoreboard_hype(), { used: true });
    });

    test('API reports the remaining cooldown', () => {
        gameAPI.init_game(8);
        assert.equal(JSON.parse(gameAPI.use_scoreboard_hype()).used, true);
        const denied = JSON.parse(gameAPI.use_scoreboard_hype());
        assert.equal(denied.used, false);
        assert.ok(denied.cooldown_remaining > 0);
    });
});
