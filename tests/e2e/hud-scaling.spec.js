/**
 * E2E tests for HUD scaling on different screen sizes
 */
const { test, expect } = require('@playwright/test');

test.describe('HUD Scaling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: 30000 });
    await page.click('#start-btn');
    await page.waitForSelector('#hud:not(.hidden)');
  });

  test('should scale HUD properly on desktop (1200px)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500); // Wait for resize debounce

    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();

    // Check CSS custom properties are set
    const labelSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-label-size');
    });
    const valueSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-value-size');
    });

    expect(labelSize).toBeTruthy();
    expect(valueSize).toBeTruthy();

    // Desktop should have larger fonts
    const labelPx = parseFloat(labelSize);
    const valuePx = parseFloat(valueSize);
    expect(labelPx).toBeGreaterThanOrEqual(14);
    expect(valuePx).toBeGreaterThanOrEqual(22);
  });

  test('should scale HUD properly on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await page.waitForTimeout(500);

    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();

    const labelSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-label-size');
    });
    const valueSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-value-size');
    });

    expect(labelSize).toBeTruthy();
    expect(valueSize).toBeTruthy();

    // Tablet should have medium fonts
    const labelPx = parseFloat(labelSize);
    const valuePx = parseFloat(valueSize);
    expect(labelPx).toBeGreaterThanOrEqual(11);
    expect(labelPx).toBeLessThan(14);
    expect(valuePx).toBeGreaterThanOrEqual(16);
    expect(valuePx).toBeLessThan(22);
  });

  test('should scale HUD properly on mobile (480px)', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(500);

    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();

    const labelSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-label-size');
    });
    const valueSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-value-size');
    });

    expect(labelSize).toBeTruthy();
    expect(valueSize).toBeTruthy();

    // Mobile should have smaller fonts
    const labelPx = parseFloat(labelSize);
    const valuePx = parseFloat(valueSize);
    expect(labelPx).toBeGreaterThanOrEqual(10);
    expect(labelPx).toBeLessThanOrEqual(12);
    expect(valuePx).toBeGreaterThanOrEqual(14);
    expect(valuePx).toBeLessThanOrEqual(18);
  });

  test('should stack HUD vertically on very narrow screens (350px)', async ({ page }) => {
    await page.setViewportSize({ width: 350, height: 600 });
    await page.waitForTimeout(500);

    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();

    // Check flex direction is column for vertical stacking
    const flexDirection = await hud.evaluate(el => {
      return getComputedStyle(el).flexDirection;
    });

    expect(flexDirection).toBe('column');
  });

  test('should not overlap with canvas on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    await page.waitForTimeout(500);

    const hud = page.locator('#hud');
    const canvas = page.locator('#game-canvas');

    await expect(hud).toBeVisible();
    await expect(canvas).toBeVisible();

    // Get bounding boxes
    const hudBox = await hud.boundingBox();
    const canvasBox = await canvas.boundingBox();

    expect(hudBox).toBeTruthy();
    expect(canvasBox).toBeTruthy();

    // HUD should be positioned over canvas but not obscure too much
    // HUD top should be within canvas area (positioned absolutely)
    expect(hudBox.y).toBeGreaterThanOrEqual(canvasBox.y);
  });

  test('should maintain HUD legibility with small fonts', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); // iPhone 5/SE
    await page.waitForTimeout(500);

    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();

    // Check that fonts meet minimum size for legibility
    const labelSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-label-size');
    });
    const valueSize = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--hud-value-size');
    });

    const labelPx = parseFloat(labelSize);
    const valuePx = parseFloat(valueSize);

    // Minimum legible sizes
    expect(labelPx).toBeGreaterThanOrEqual(10);
    expect(valuePx).toBeGreaterThanOrEqual(14);
  });

  test('should update HUD values correctly regardless of screen size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Check HUD elements are present and have initial values
    const score = page.locator('#score');
    const combo = page.locator('#combo');
    const waves = page.locator('#waves');

    await expect(score).toBeVisible();
    await expect(combo).toBeVisible();
    await expect(waves).toBeVisible();

    // Values should be readable
    const scoreText = await score.textContent();
    const comboText = await combo.textContent();
    const wavesText = await waves.textContent();

    expect(scoreText).toMatch(/^\d+$/);
    expect(comboText).toMatch(/^\d+x$/);
    expect(wavesText).toMatch(/^\d+$/);
  });
});
