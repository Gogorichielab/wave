import { test, expect } from '@playwright/test';

test.describe('Orientation and Persistence Handling', () => {
  test('should handle orientation changes and preserve game state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Get initial canvas dimensions
    const initialDimensions = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return {
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height
      };
    });

    // Trigger orientation change by changing viewport
    await page.setViewportSize({ width: 900, height: 1200 });

    // Dispatch orientationchange event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    // Wait for orientation change handler to complete
    await page.waitForTimeout(200);

    // Verify canvas was resized
    const newDimensions = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return {
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height
      };
    });

    // Canvas should have updated
    expect(newDimensions.width).toBeGreaterThan(0);
    expect(newDimensions.height).toBeGreaterThan(0);

    // Verify game state is still accessible (not lost)
    const gameStateExists = await page.evaluate(() => {
      // Check HUD is still showing values
      const score = document.getElementById('score');
      return score && score.textContent !== '';
    });

    expect(gameStateExists).toBeTruthy();
  });

  test('should recompute layout on orientationchange events', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Trigger orientation change
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    // Wait for handler to execute
    await page.waitForTimeout(200);

    // Canvas should still be rendering
    const canvasVisible = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return canvas && canvas.width > 0 && canvas.height > 0;
    });

    expect(canvasVisible).toBeTruthy();
  });

  test('should save game state to localStorage on pause', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Wait a moment for game to be running
    await page.waitForTimeout(500);

    // Click pause button
    await page.click('#pause-btn');

    // Check that localStorage has saved game state
    const savedState = await page.evaluate(() => {
      return localStorage.getItem('wave_game_state');
    });

    expect(savedState).toBeTruthy();

    // Validate it's valid JSON with expected fields
    const parsedState = JSON.parse(savedState);
    expect(parsedState).toHaveProperty('format');
    expect(parsedState).toHaveProperty('savedAt');
    expect(parsedState).toHaveProperty('stats');
    expect(parsedState.engine).toHaveProperty('version');
    expect(parsedState.engine).toHaveProperty('difficulty');
  });

  test('should save game state when tab becomes hidden', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Wait for game to be running
    await page.waitForTimeout(500);

    // Clear localStorage first
    await page.evaluate(() => {
      localStorage.removeItem('wave_game_state');
    });

    // Simulate tab becoming hidden
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for save to complete
    await page.waitForTimeout(100);

    // Check that localStorage has saved game state
    const savedState = await page.evaluate(() => {
      return localStorage.getItem('wave_game_state');
    });

    expect(savedState).toBeTruthy();
  });

  test('should handle localStorage quota errors gracefully', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warn') {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Mock localStorage to throw quota exceeded error
    await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'wave_game_state') {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return originalSetItem.call(this, key, value);
      };
    });

    // Trigger pause (which should try to save)
    await page.click('#pause-btn');

    // Wait for error handling
    await page.waitForTimeout(100);

    // Should have logged an error but not crashed
    const hasQuotaError = consoleLogs.some(log =>
      log.includes('quota exceeded') || log.includes('QuotaExceededError')
    );
    expect(hasQuotaError).toBeTruthy();

    // Game should still be functional
    const gameStillRunning = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      return !hud.classList.contains('hidden');
    });

    expect(gameStillRunning).toBeTruthy();
  });

  test('should validate localStorage operations work correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Wait for game to be running
    await page.waitForTimeout(500);

    // Pause to trigger save
    await page.click('#pause-btn');

    // Wait for save to complete
    await page.waitForTimeout(100);

    // Check that localStorage has recent saved game state
    const savedState = await page.evaluate(() => {
      const data = localStorage.getItem('wave_game_state');
      if (!data) return null;

      const parsed = JSON.parse(data);
      const age = Date.now() - parsed.savedAt;

      // Should be saved within last 2 seconds
      return age < 2000;
    });

    expect(savedState).toBeTruthy();
  });

  test('should preserve game state across resize operations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');

    // Get initial score
    const initialScore = await page.evaluate(() => {
      return document.getElementById('score').textContent;
    });

    // Trigger multiple resizes
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.waitForTimeout(200);

    // Score should still be the same (game logic not affected by resize)
    const finalScore = await page.evaluate(() => {
      return document.getElementById('score').textContent;
    });

    expect(finalScore).toBe(initialScore);

    // Game should still be running
    const gameRunning = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      return !hud.classList.contains('hidden');
    });

    expect(gameRunning).toBeTruthy();
  });
});
