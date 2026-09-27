/**
 * Regression tests for wave pacing (issue #123)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { WaveGame } from '../../engine.js';

const SECTORS = 16;

function preparedGame() {
    const game = new WaveGame(SECTORS);
    for (const sector of game.sectors) {
        sector.energy = 1.0;
        sector.enthusiasm = 0.8;
        sector.fatigue = 0;
        sector.distractions = 0;
    }
    return game;
}

/**
 * Run a wave to its end at a fixed update rate and record when each front
 * moved to a new sector.
 */
function runWave(game, pattern, hz, maxSeconds = 60) {
    const dt = 1 / hz;
    assert.ok(game.start_wave(0, pattern), `${pattern} wave should start`);

    const moves = [];
    let lastPrimary = game.current_wave_sector;
    let t = 0;
    while ((game.wave_active || game.second_wave_active) && t < maxSeconds) {
        game.update(dt);
        t += dt;
        if (game.current_wave_sector !== lastPrimary) {
            moves.push({ sector: game.current_wave_sector, t });
            lastPrimary = game.current_wave_sector;
        }
    }

    const events = game.get_events().map(e => e.type);
    return {
        completed: events.includes('wave_completed'),
        failed: events.includes('wave_failed'),
        duration: t,
        moves
    };
}

function assertNear(actual, expected, tolerance, message) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${message}: expected ${expected} ± ${tolerance}, got ${actual}`
    );
}

describe('wave pacing', () => {
    for (const pattern of ['normal', 'reverse']) {
        test(`${pattern} wave respects the one-second sector interval`, () => {
            const result = runWave(preparedGame(), pattern, 30);
            assert.ok(result.completed);
            assertNear(result.duration, SECTORS * 1.0, 1 / 30 + 1e-9, 'completion time');

            result.moves.forEach((move, i) => {
                assertNear(move.t, (i + 1) * 1.0, 1 / 30 + 1e-9, `move ${i + 1}`);
            });
        });
    }

    test('reverse wave visits sectors counter-clockwise', () => {
        const result = runWave(preparedGame(), 'reverse', 30);
        assert.deepEqual(
            result.moves.slice(0, 3).map(m => m.sector),
            [15, 14, 13]
        );
    });

    for (const pattern of ['normal', 'reverse', 'double', 'accelerating']) {
        test(`${pattern} wave has the same outcome at 30 Hz and 60 Hz`, () => {
            const at30 = runWave(preparedGame(), pattern, 30);
            const at60 = runWave(preparedGame(), pattern, 60);
            assert.equal(at30.completed, at60.completed);
            assert.equal(at30.moves.length, at60.moves.length);
            assertNear(at30.duration, at60.duration, 1 / 30 + 1e-9, 'completion time');
        });
    }

    test('a large update step still advances one sector per interval', () => {
        // 0.25s steps divide the interval evenly, so every move lands exactly
        const result = runWave(preparedGame(), 'normal', 4);
        assert.ok(result.completed);
        assertNear(result.duration, SECTORS * 1.0, 1e-9, 'completion time');
    });

    test('double wave completes with a rested, energized crowd', () => {
        const game = preparedGame();
        const result = runWave(game, 'double', 30);
        assert.ok(result.completed, 'double wave should complete');
        assert.ok(!result.failed);
        assert.equal(game.successful_waves, 1);
        assertNear(result.duration, SECTORS * 1.0, 1 / 30 + 1e-9, 'completion time');
    });

    test('a new wave cannot start while the second front is still running', () => {
        const game = preparedGame();
        game.start_wave(0, 'double');
        game.wave_active = false; // simulate the first front finishing first
        assert.equal(game.start_wave(4, 'normal'), false);
    });

    test('accelerating wave follows the speed curve', () => {
        const result = runWave(preparedGame(), 'accelerating', 60);
        assert.ok(result.completed);

        // The interval before move n is max(0.1, 1.0 - 0.025 * n)
        let expected = 0;
        result.moves.forEach((move, n) => {
            expected += Math.max(0.1, 1.0 - 0.025 * n);
            assertNear(move.t, expected, 1 / 60 + 1e-9, `move ${n + 1}`);
        });

        let total = 0;
        for (let n = 0; n < SECTORS; n++) {
            total += Math.max(0.1, 1.0 - 0.025 * n);
        }
        assertNear(result.duration, total, 1 / 60 + 1e-9, 'completion time');
    });

    test('accelerating uses the same step whether chosen or random', () => {
        const chosen = preparedGame();
        chosen.start_wave(0, 'accelerating');

        const random = preparedGame();
        let found = false;
        for (let i = 0; i < 200 && !found; i++) {
            random.selectWavePattern();
            found = random.wave_pattern === 'accelerating';
        }
        assert.ok(found);
        assert.equal(random.speed_increment, chosen.speed_increment);
    });
});

describe('wave failure timing', () => {
    test('wave fails when it reaches an exhausted sector, not before', () => {
        const game = preparedGame();
        game.sectors[5].energy = 0;
        game.sectors[5].enthusiasm = 0.1;

        const result = runWave(game, 'normal', 30);
        assert.ok(result.failed);
        assert.ok(!result.completed);
        assertNear(result.duration, 5.0, 1 / 30 + 1e-9, 'failure time');
        assert.equal(game.failed_waves, 1);
        assert.equal(game.combo, 0);
    });

    test('double wave fails when the second front hits an exhausted sector', () => {
        const game = preparedGame();
        // Second front starts at 8 and reaches 11 after three intervals
        game.sectors[11].energy = 0;
        game.sectors[11].enthusiasm = 0.1;

        const result = runWave(game, 'double', 30);
        assert.ok(result.failed);
        assertNear(result.duration, 3.0, 1 / 30 + 1e-9, 'failure time');
        assert.ok(!game.wave_active && !game.second_wave_active);
    });
});
