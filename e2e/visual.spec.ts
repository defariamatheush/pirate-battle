import { expect, test } from './helpers';

test.describe('Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
  });

  test('main menu', async ({ game, page }) => {
    await game.open();
    await expect(page.getByTestId('play-button')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ game, page }) => {
    await game.open();
    await game.play();
    await game.placePlayer(260, 650, -0.5);
    await game.spawnEnemy('chaser', 760, 300, 2.4);
    await game.spawnEnemy('shooter', 1010, 560, 3.4);
    await game.advance(0);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('arena.png', { timeout: 40_000 });
  });

  test('result screen', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 15);
    await game.play();
    await game.finishByTime();
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('result.png');
  });
});
