import { test, expect } from '@playwright/test';

// Smoke tests for the built artifact. `npm run test:e2e:prod` runs them (and
// the rest of the e2e suite) against dist/ served by `vite preview`.
test.describe('Production build smoke', () => {
  test('loads without failed requests or page errors', async ({ page }) => {
    const failedRequests = [];
    const pageErrors = [];
    page.on('response', response => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => failedRequests.push(`failed ${request.url()}`));
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#loading')).toHaveClass(/hidden/);

    const engine = await page.evaluate(() => window.waveDiagnostics?.engine);
    expect(engine).toBe('javascript');
    expect(failedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('starts, scores, and completes a wave', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?e2e');
    await page.click('#start-btn');
    await expect(page.locator('#hud')).not.toHaveClass(/hidden/);

    // Prepare a fully rested crowd so the scenario is deterministic
    const started = await page.evaluate(() => {
      const { api } = window.waveDiagnostics;
      for (const sector of api.game.sectors) {
        sector.energy = 1.0;
        sector.enthusiasm = 0.8;
        sector.fatigue = 0;
        sector.distractions = 0;
      }
      return JSON.parse(api.start_wave_at(0, 'normal')).success;
    });
    expect(started).toBe(true);

    await expect.poll(
      () => page.evaluate(() => window.waveDiagnostics.getState()?.successful_waves),
      { timeout: 30000 }
    ).toBe(1);

    const score = Number(await page.locator('#score').textContent());
    expect(score).toBeGreaterThan(0);
    await expect(page.locator('#waves')).toHaveText('1');
  });
});
