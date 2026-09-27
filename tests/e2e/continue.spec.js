import { test, expect } from '@playwright/test';

async function startPreparedGame(page, { mode = 'practice' } = {}) {
  await page.goto('/?e2e');
  await page.selectOption('#mode-select', mode);
  await page.selectOption('#difficulty-select', 'hard');
  await page.selectOption('#weather-select', 'rainy');
  await page.selectOption('#time-select', 'night');
  await page.click('#start-btn');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.evaluate(() => {
    const { game } = window.waveDiagnostics.api;
    game.tuning = { ...game.tuning, mascot_interval: 1e9 };
    for (const sector of game.sectors) {
      sector.energy = 1.0;
      sector.enthusiasm = 0.8;
      sector.fatigue = 0;
      sector.distractions = 0;
    }
  });
}

test.describe('Continue saved games', () => {
  test('no Continue button without a save', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#continue-btn')).toBeHidden();
    await expect(page.locator('#start-btn')).toHaveText("Let's Go!");
  });

  test('reloading mid-wave restores the wave, stats, and settings', async ({ page }) => {
    await startPreparedGame(page);
    await page.evaluate(() => window.waveDiagnostics.api.start_wave_at(0, 'reverse'));
    // Let the wave travel a few sectors (hard = 0.8s per sector)
    await expect.poll(() => page.evaluate(() => window.waveDiagnostics.getState()?.current_wave_sector)).toBe(13);

    const before = await page.evaluate(() => {
      const state = window.waveDiagnostics.getState();
      return { score: state.score, combo: state.combo, sector: state.current_wave_sector };
    });

    await page.reload();
    const continueBtn = page.locator('#continue-btn');
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toContainText('Practice');
    await expect(page.locator('#start-btn')).toHaveText('New Game');

    await continueBtn.click();
    await expect(page.locator('#hud')).not.toHaveClass(/hidden/);

    const after = await page.evaluate(() => {
      const state = window.waveDiagnostics.getState();
      return {
        wave_active: state.wave_active,
        pattern: state.wave_pattern,
        sector: state.current_wave_sector,
        score: state.score,
        combo: state.combo,
        difficulty: state.difficulty,
        weather: state.weather,
      };
    });
    expect(after.wave_active).toBe(true);
    expect(after.pattern).toBe('reverse');
    expect(after.sector).toBeLessThanOrEqual(before.sector);
    expect(after.score).toBeGreaterThanOrEqual(before.score);
    expect(after.combo).toBeGreaterThanOrEqual(before.combo);
    expect(after.difficulty).toBe('hard');
    expect(after.weather).toBe('rainy');

    await expect(page.locator('#score')).toHaveText(String(after.score));
    await expect(page.locator('#difficulty-select')).toHaveValue('hard');
    await expect(page.locator('#time-select')).toHaveValue('night');
  });

  test('New Game starts fresh and discards the save', async ({ page }) => {
    await startPreparedGame(page);
    await page.evaluate(() => { window.waveDiagnostics.api.game.score = 999; });
    await page.click('#setup-btn');
    await expect(page.locator('#continue-btn')).toContainText('score 999');

    await page.click('#start-btn');
    await expect.poll(() => page.evaluate(() => window.waveDiagnostics.getState()?.score)).toBe(0);

    await page.click('#setup-btn');
    // Returning to setup saves the new run, not the old one
    await expect(page.locator('#continue-btn')).toContainText('score 0');
  });

  test('a corrupt save offers a clear recovery path', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('wave_game_state', JSON.stringify({
        format: 1,
        savedAt: Date.now(),
        engine: { version: 2, sectors: 'broken' },
      }));
    });
    await page.reload();

    await expect(page.locator('#save-notice')).toBeVisible();
    await expect(page.locator('#save-notice')).toContainText("couldn't be restored");
    await expect(page.locator('#continue-btn')).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem('wave_game_state'));
    expect(stored).toBeNull();

    await page.click('#start-btn');
    await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  });

  test('a save from before complete snapshots is discarded quietly', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('wave_game_state', JSON.stringify({
        gameState: { score: 50, sectors: [] },
        timestamp: Date.now(),
        difficulty: 'medium',
      }));
    });
    await page.reload();

    await expect(page.locator('#continue-btn')).toBeHidden();
    await expect(page.locator('#save-notice')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('wave_game_state'))).toBeNull();
  });

  test('a finished challenge cannot be continued', async ({ page }) => {
    await startPreparedGame(page, { mode: 'challenge' });
    await page.evaluate(() => { window.waveDiagnostics.api.game.challenge.time_remaining = 0.2; });
    await expect(page.locator('#result-overlay')).toBeVisible();

    await page.click('#result-setup-btn');
    await expect(page.locator('#continue-btn')).toBeHidden();
  });

  test('a running challenge resumes with its clock', async ({ page }) => {
    await startPreparedGame(page, { mode: 'challenge' });
    await page.evaluate(() => { window.waveDiagnostics.api.game.challenge.time_remaining = 42; });
    await page.click('#setup-btn');
    await expect(page.locator('#continue-btn')).toContainText('Challenge');

    await page.click('#continue-btn');
    await expect(page.locator('#challenge-item')).toBeVisible();
    await expect(page.locator('#challenge-time')).toHaveText(/0:4[12]/);
  });
});
