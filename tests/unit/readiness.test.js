/**
 * Tests for engine-reported readiness and failure details (issue #125)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CrowdSector, WaveGame, SectorState } from '../../engine.js';

function readySector() {
    const sector = new CrowdSector(0);
    sector.energy = 1.0;
    sector.enthusiasm = 0.8;
    sector.fatigue = 0;
    sector.distractions = 0;
    return sector;
}

function preparedGame(pattern = null) {
    const game = new WaveGame(16);
    for (const sector of game.sectors) {
        sector.energy = 1.0;
        sector.enthusiasm = 0.8;
        sector.fatigue = 0;
        sector.distractions = 0;
    }
    if (pattern) game.start_wave(0, pattern);
    return game;
}

function runUntilIdle(game, hz = 30) {
    for (let t = 0; (game.wave_active || game.second_wave_active) && t < 60; t += 1 / hz) {
        game.update(1 / hz);
    }
}

describe('sector readiness', () => {
    test('a rested sector is ready with no block reason', () => {
        const sector = readySector();
        assert.equal(sector.block_reason(), null);
        assert.ok(sector.can_wave());
    });

    test('reports standing and anticipating sectors', () => {
        const sector = readySector();
        sector.state = SectorState.STANDING;
        assert.equal(sector.block_reason(), 'standing');
        sector.state = SectorState.ANTICIPATING;
        assert.equal(sector.block_reason(), 'anticipating');
    });

    test('names distraction when it is the main drag', () => {
        const sector = readySector();
        sector.distractions = 0.6;
        assert.equal(sector.block_reason(), 'distracted');
    });

    test('names fatigue when it is the main drag', () => {
        const sector = readySector();
        sector.fatigue = 0.6;
        sector.distractions = 0.1;
        assert.equal(sector.block_reason(), 'fatigued');
    });

    test('otherwise reports low energy', () => {
        const sector = readySector();
        sector.energy = 0.2;
        assert.equal(sector.block_reason(), 'low_energy');
    });

    test('displayed readiness always agrees with engine eligibility', () => {
        const game = preparedGame();
        let seed = 7;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const states = Object.values({ ...SectorState });

        for (let i = 0; i < 500; i++) {
            const sector = game.sectors[i % 16];
            sector.energy = rand();
            sector.enthusiasm = rand();
            sector.fatigue = rand() * 0.5;
            sector.distractions = rand() * 0.5;
            sector.state = states[Math.floor(rand() * states.length)];

            const shown = sector.to_dict();
            assert.equal(shown.ready, sector.can_wave());
            assert.equal(shown.ready, shown.block_reason === null);
            // The sector really joins a wave exactly when it is shown as ready
            assert.equal(sector.start_wave(), shown.ready);
        }
    });

    test('state includes readiness for every sector', () => {
        const state = preparedGame().get_state();
        for (const sector of state.sectors) {
            assert.equal(typeof sector.readiness, 'number');
            assert.equal(sector.ready, true);
            assert.equal(sector.block_reason, null);
        }
    });
});

describe('upcoming sectors', () => {
    test('no upcoming sector without a wave', () => {
        const state = preparedGame().get_state();
        assert.equal(state.next_wave_sector, -1);
        assert.equal(state.second_next_wave_sector, -1);
    });

    test('normal and accelerating waves head clockwise', () => {
        for (const pattern of ['normal', 'accelerating']) {
            const state = preparedGame(pattern).get_state();
            assert.equal(state.next_wave_sector, 1, pattern);
            assert.equal(state.wave_direction, 1, pattern);
        }
    });

    test('reverse wave heads counter-clockwise', () => {
        const state = preparedGame('reverse').get_state();
        assert.equal(state.next_wave_sector, 15);
        assert.equal(state.wave_direction, -1);
    });

    test('double wave reports both fronts', () => {
        const state = preparedGame('double').get_state();
        assert.equal(state.next_wave_sector, 1);
        assert.equal(state.second_next_wave_sector, 9);
    });

    test('no upcoming sector on the final step back to the start', () => {
        const game = preparedGame('normal');
        game.current_wave_sector = 15;
        assert.equal(game.get_state().next_wave_sector, -1);
    });
});

describe('failure details', () => {
    test('identifies the sector that refused the wave and why', () => {
        const game = preparedGame();
        game.sectors[5].distractions = 0.9;
        game.start_wave(0, 'normal');
        runUntilIdle(game);

        const failure = game.get_events().find(e => e.type === 'wave_failed');
        assert.ok(failure);
        assert.equal(failure.data.sector, 5);
        assert.equal(failure.data.from_sector, 4);
        assert.equal(failure.data.front, 'primary');
        assert.equal(failure.data.reason, 'distracted');
    });

    test('identifies the blocking sector on a reverse wave', () => {
        const game = preparedGame();
        game.sectors[13].energy = 0;
        game.sectors[13].enthusiasm = 0.2;
        game.start_wave(0, 'reverse');
        runUntilIdle(game);

        const failure = game.get_events().find(e => e.type === 'wave_failed');
        assert.equal(failure.data.sector, 13);
        assert.equal(failure.data.reason, 'low_energy');
    });

    test('identifies the blocking sector on the secondary front of a double wave', () => {
        const game = preparedGame();
        game.sectors[11].fatigue = 0.8;
        game.start_wave(0, 'double');
        runUntilIdle(game);

        const failure = game.get_events().find(e => e.type === 'wave_failed');
        assert.equal(failure.data.sector, 11);
        assert.equal(failure.data.from_sector, 10);
        assert.equal(failure.data.front, 'secondary');
        assert.equal(failure.data.reason, 'fatigued');
    });
});
