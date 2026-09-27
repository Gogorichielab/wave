import { test, expect } from '@playwright/test';

// Screen position of a sector's center (sectors sit on a 190-250px ring
// around the canvas center; sector 0 is at the top)
async function sectorPoint(page, index, total = 16) {
  const box = await page.locator('#game-canvas').boundingBox();
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: box.x + box.width / 2 + Math.cos(angle) * 220,
    y: box.y + box.height / 2 + Math.sin(angle) * 220,
  };
}

async function startGame(page) {
  await page.goto('/?e2e');
  await page.click('#start-btn');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  // Rest the crowd and silence ambient events so scenarios are deterministic
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

test.describe('Readiness and feedback', () => {
  test('keyboard users can select a sector and boost it', async ({ page }) => {
    await startGame(page);
    const boostBtn = page.locator('#boost-btn');
    await expect(boostBtn).toBeDisabled();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(boostBtn).toHaveText('⚡ Boost 1');
    await expect(page.locator('#selected-sector-info')).toHaveText('Sector 1: ✓ Ready');

    await page.keyboard.press('KeyB');
    await expect(page.locator('#boost-status')).toContainText('Boosts 2/3');
  });

  test('Space starts the wave at the selected sector', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('ArrowLeft'); // selects 0
    await page.keyboard.press('ArrowLeft'); // wraps to 15
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.waveDiagnostics.getState()?.current_wave_sector)).toBe(15);
  });

  test('selected sector info explains why a sector is not ready', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => { window.waveDiagnostics.api.game.sectors[3].distractions = 0.9; });
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('#selected-sector-info')).toHaveText('Sector 3: ! Distracted');
  });

  test('failure names the blocking sector and suggests a fix', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      const { api } = window.waveDiagnostics;
      api.game.sectors[1].distractions = 0.9;
      api.start_wave_at(0, 'normal');
    });
    const notification = page.locator('#notification');
    await expect(notification).toContainText('Sector 1', { timeout: 5000 });
    await expect(notification).toContainText('distracted');
    await expect(notification).toContainText('Boost');
  });

  test('upcoming sector and direction are reported during a wave', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => window.waveDiagnostics.api.start_wave_at(0, 'reverse'));
    await expect.poll(() => page.evaluate(() => {
      const state = window.waveDiagnostics.getState();
      return state && [state.next_wave_sector, state.wave_direction];
    })).toEqual([15, -1]);
  });
});

test.describe('Touch boost', () => {
  test.use({ hasTouch: true });

  test('tap selects a sector during a wave and the Boost button boosts it', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => window.waveDiagnostics.api.start_wave_at(0, 'normal'));

    const point = await sectorPoint(page, 4);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('#boost-btn')).toHaveText('⚡ Boost 4');

    // The running wave is untouched: a tap during a wave only selects
    const waveStart = await page.evaluate(() => window.waveDiagnostics.api.game.wave_start_sector);
    expect(waveStart).toBe(0);

    await page.locator('#boost-btn').tap();
    await expect(page.locator('#boost-status')).toContainText('Boosts 2/3');
  });
});
