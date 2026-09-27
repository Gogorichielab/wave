/**
 * Tests for challenge mode (issue #124)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { WaveGame, CHALLENGE, gameAPI } from '../../engine.js';

function challengeGame(difficulty = 'medium') {
    const game = new WaveGame(16, 'soccer', 'sunny', difficulty, () => 0.5, 'challenge');
    for (const sector of game.sectors) {
        sector.enthusiasm = 0.9;
    }
    return game;
}

function rest(game) {
    for (const sector of game.sectors) {
        sector.energy = 1.0;
        sector.fatigue = 0;
        sector.distractions = 0;
    }
}

function runUntilIdle(game, hz = 30) {
    const dt = 1 / hz;
    while ((game.wave_active || game.second_wave_active) && !game.game_over) {
        game.update(dt);
    }
}

describe('challenge mode', () => {
    test('defaults to practice with no objective', () => {
        const game = new WaveGame(8);
        assert.equal(game.mode, 'practice');
        assert.equal(game.get_state().challenge, null);
    });

    test('starts with the objective and full clock', () => {
        const state = challengeGame().get_state();
        assert.equal(state.mode, 'challenge');
        assert.deepEqual(state.challenge, {
            target_waves: CHALLENGE.target_waves,
            time_limit: CHALLENGE.time_limit,
            time_remaining: CHALLENGE.time_limit,
            status: 'running',
        });
    });

    test('completing the target waves wins and ends the run', () => {
        const game = challengeGame();
        for (let i = 0; i < CHALLENGE.target_waves; i++) {
            rest(game);
            assert.ok(game.start_wave(0, 'normal'), `wave ${i + 1} should start`);
            runUntilIdle(game);
        }

        assert.equal(game.challenge.status, 'won');
        assert.ok(game.game_over);
        const event = game.get_events().find(e => e.type === 'challenge_completed');
        assert.ok(event);
        assert.equal(event.data.waves, CHALLENGE.target_waves);
        assert.ok(event.data.time_used > 0 && event.data.time_used < CHALLENGE.time_limit);
    });

    test('running out of time loses, even mid-wave', () => {
        const game = challengeGame();
        rest(game);
        game.challenge.time_remaining = 2;
        game.start_wave(0, 'normal');

        for (let i = 0; i < 90; i++) game.update(1 / 30);

        assert.equal(game.challenge.status, 'lost');
        assert.ok(!game.wave_active);
        assert.equal(game.challenge.time_remaining, 0);
        const event = game.get_events().find(e => e.type === 'challenge_failed');
        assert.ok(event);
        assert.equal(event.data.waves, 0);
    });

    test('a finished run freezes and rejects new waves', () => {
        const game = challengeGame();
        game.challenge.time_remaining = 0.01;
        game.update(0.1);
        assert.ok(game.game_over);

        const elapsed = game.time_elapsed;
        game.update(1.0);
        assert.equal(game.time_elapsed, elapsed);
        rest(game);
        assert.equal(game.start_wave(0, 'normal'), false);
    });

    test('the result event fires once', () => {
        const game = challengeGame();
        game.challenge.time_remaining = 0.01;
        for (let i = 0; i < 10; i++) game.update(0.1);
        assert.equal(game.get_events().filter(e => e.type === 'challenge_failed').length, 1);
    });

    test('practice mode never ends on its own', () => {
        const game = new WaveGame(8);
        for (let i = 0; i < 200; i++) game.update(1.0);
        assert.ok(!game.game_over);
    });

    test('init_game selects the mode', () => {
        gameAPI.init_game(16, 'soccer', 'sunny', 'easy', 'challenge');
        assert.equal(JSON.parse(gameAPI.get_game_state()).mode, 'challenge');
        gameAPI.init_game(16, 'soccer', 'sunny', 'easy', 'bogus');
        assert.equal(JSON.parse(gameAPI.get_game_state()).mode, 'practice');
    });
});
