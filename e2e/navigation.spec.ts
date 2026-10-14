import { expect, test } from './helpers';

test.describe('Abandoning and navigating', () => {
  test('reloading during a match abandons it without recording anything', async ({ game, page }) => {
    await game.open();
    await game.play();
    await game.advance(5000);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('last-result-card')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    expect(await page.evaluate(() => window.__MOCK__!.confirmedCount())).toBe(0);
  });

  test('repeated menu ⇄ match navigation releases the canvas, listeners and keyboard capture', async ({ game, page }) => {
    await game.open();
    for (let i = 0; i < 5; i++) {
      await game.play();
      expect(await page.locator('canvas').count()).toBe(1);
      await page.keyboard.press('Escape');
      await page.getByTestId('quit-button').click();
      await expect(page.getByTestId('main-menu')).toBeVisible();
      expect(await page.locator('canvas').count()).toBe(0);
      expect(await page.evaluate(() => !!window.__PIRATE_TEST__)).toBe(false);
    }
    // Game keys are inert on the menu: Space on a focused button still activates it.
    await page.getByTestId('options-button').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('options-screen')).toBeVisible();
    // Arrow keys / Space are not swallowed outside gameplay.
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test('game keys are captured only during gameplay', async ({ game, page }) => {
    await game.open();
    await game.play();
    const during = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(during).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByTestId('quit-button').click();
    const after = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(after).toBe(false);
  });

  test('screen-reader mirror exposes score, time and hull; announcements are event-driven', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await expect(page.getByTestId('sr-score')).toHaveText('0');
    await expect(page.getByTestId('sr-time')).toHaveText('01:30');
    await expect(page.getByTestId('announcer')).toHaveAttribute('aria-live', 'polite');
    const before = await page.getByTestId('announcer').textContent();
    await game.advance(5000);
    expect(await page.getByTestId('announcer').textContent()).toBe(before); // no per-second chatter
    await expect(page.getByTestId('sr-time')).toHaveText('01:25');
  });
});
