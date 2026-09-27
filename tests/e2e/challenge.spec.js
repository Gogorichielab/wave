import { test, expect } from '@playwright/test';

test.describe('Challenge mode', () => {
  async function startChallenge(page) {
    await page.goto('/?e2e');
    await page.selectOption('#mode-select', 'challenge');
    await page.click('#start-btn');
    await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  }

  test('shows the objective and a countdown', async ({ page }) => {
    await startChallenge(page);
    await expect(page.locator('#challenge-item')).toBeVisible();
    await expect(page.locator('#challenge-progress')).toHaveText('0/3');
    await expect(page.locator('#challenge-time')).toHaveText(/1:(29|30)/);
  });

  test('practice mode hides the challenge objective', async ({ page }) => {
    await page.goto('/');
    await page.click('#start-btn');
    await expect(page.locator('#challenge-item')).toBeHidden();
  });

  test('shows a result screen when time runs out and retry starts a fresh run', async ({ page }) => {
    await startChallenge(page);
    await page.evaluate(() => { window.waveDiagnostics.api.game.challenge.time_remaining = 0.3; });

    const overlay = page.locator('#result-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#result-title')).toContainText("Time's Up");
    await expect(page.locator('#result-summary')).toContainText('0/3 waves');

    await page.click('#retry-btn');
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.waveDiagnostics.getState()?.challenge?.status)).toBe('running');
    await expect(page.locator('#challenge-time')).toHaveText(/1:(29|30)/);
  });

  test('shows a win screen when the target is reached', async ({ page }) => {
    await startChallenge(page);
    await page.evaluate(() => {
      const { game } = window.waveDiagnostics.api;
      game.successful_waves = 2;
      game.complete_wave();
    });

    await expect(page.locator('#result-overlay')).toBeVisible();
    await expect(page.locator('#result-title')).toContainText('Challenge Complete');
    await expect(page.locator('#challenge-progress')).toHaveText('3/3');

    await page.click('#result-setup-btn');
    await expect(page.locator('#tutorial')).toBeVisible();
  });
});
