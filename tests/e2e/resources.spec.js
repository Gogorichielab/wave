import { test, expect } from '@playwright/test';

test.describe('Difficulty and player resources', () => {
  async function startGame(page, difficulty) {
    await page.goto('/?e2e');
    await page.selectOption('#difficulty-select', difficulty);
    await page.click('#start-btn');
    await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  }

  test('selected difficulty reaches the engine', async ({ page }) => {
    await startGame(page, 'hard');
    await expect.poll(() => page.evaluate(() => window.waveDiagnostics.getState()?.difficulty)).toBe('hard');
    await expect(page.locator('#boost-status')).toContainText('Boosts 2/2');
  });

  test('boost charges are shown and spent', async ({ page }) => {
    await startGame(page, 'medium');
    await expect(page.locator('#boost-status')).toContainText('Boosts 3/3');

    // Right-click the top sector (sector 0) to boost it
    const box = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 220, { button: 'right' });

    await expect(page.locator('#boost-status')).toContainText('Boosts 2/3');
  });

  test('scoreboard hype shows its cooldown and cannot be spammed', async ({ page }) => {
    await startGame(page, 'medium');
    const button = page.locator('#scoreboard-btn');
    await expect(button).toBeEnabled();

    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toContainText(/Hype in \d+s/);
  });
});
