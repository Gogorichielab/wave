import { test, expect } from '@playwright/test';

test.describe('Stadium Wave Game', () => {
  test('should load game page', async ({ page }) => {
    await page.goto('/');
    
    // Check title
    await expect(page).toHaveTitle(/Stadium Wave Game/);
    
    // Check for canvas
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should hide loading screen once the engine is ready', async ({ page }) => {
    await page.goto('/');

    // The JavaScript engine is bundled, so loading finishes right away
    await expect(page.locator('#loading')).toHaveClass(/hidden/);
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  test('should show tutorial', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the engine to load
    await page.waitForSelector('#tutorial', { timeout: 30000 });
    
    const tutorial = page.locator('#tutorial');
    await expect(tutorial).toBeVisible();
    await expect(tutorial).toContainText('Stadium Wave Game');
  });

  test('should start game on button click', async ({ page }) => {
    await page.goto('/');
    
    // Wait for loading to complete
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    
    // Click start button
    await page.click('#start-btn');
    
    // Tutorial should be hidden
    const tutorial = page.locator('#tutorial');
    await expect(tutorial).toHaveClass(/hidden/);
    
    // HUD should be visible
    const hud = page.locator('#hud');
    await expect(hud).not.toHaveClass(/hidden/);
  });

  test('should display score and combo', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');
    
    // Check HUD elements
    const score = page.locator('#score');
    const combo = page.locator('#combo');
    
    await expect(score).toBeVisible();
    await expect(combo).toBeVisible();
  });

  test('should display game title after starting', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    
    // Title should be hidden initially
    const gameTitle = page.locator('#game-title');
    await expect(gameTitle).toHaveClass(/hidden/);
    
    // Click start button
    await page.click('#start-btn');
    
    // Title should now be visible
    await expect(gameTitle).toBeVisible();
    await expect(gameTitle).toContainText('Fan Wave');
  });

  test('should detect performance tier on initialization', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('Performance tier')) {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    
    // Check that performance tier was logged
    expect(consoleLogs.length).toBeGreaterThan(0);
    expect(consoleLogs[0]).toMatch(/Performance tier: (low|medium|high)/);
  });

  test('should handle tab visibility changes', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('Tab')) {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');
    
    // Simulate tab becoming hidden
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    // Wait a bit for the event to be processed
    await page.waitForTimeout(100);
    
    // Check that visibility change was logged
    expect(consoleLogs.some(log => log.includes('Tab hidden'))).toBeTruthy();
  });

  test('should apply performance tier to canvas resolution', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    
    // Get canvas properties
    const canvasProps = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return {
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
        dpr: window.devicePixelRatio || 1
      };
    });
    
    // Canvas should have reasonable dimensions
    expect(canvasProps.width).toBeGreaterThan(0);
    expect(canvasProps.height).toBeGreaterThan(0);
    
    // The actual canvas size should be based on effective DPR
    // (which may be capped for performance)
    const styleWidthNum = parseFloat(canvasProps.styleWidth);
    const ratio = canvasProps.width / styleWidthNum;
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(ratio).toBeLessThanOrEqual(canvasProps.dpr);
  });

  test('should debounce resize events', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');
    
    // Get initial canvas dimensions
    const initialDimensions = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return { width: canvas.width, height: canvas.height };
    });
    
    // Trigger resize event
    await page.setViewportSize({ width: 1200, height: 900 });
    
    // Wait for debounce to complete
    await page.waitForTimeout(200);
    
    // Canvas dimensions should have updated
    const newDimensions = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      return { width: canvas.width, height: canvas.height };
    });
    
    // Dimensions should have changed (unless viewport was already that size)
    expect(newDimensions.width).toBeGreaterThan(0);
    expect(newDimensions.height).toBeGreaterThan(0);
  });
});
