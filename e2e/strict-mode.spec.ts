import { expect, test } from './helpers';

// Runs against the Vite dev server, where React.StrictMode double-invokes effects.
test.describe('React StrictMode (dev server)', () => {
  test('mounts a single game session and tears everything down on exit', async ({ game, page }) => {
    await game.open();
    for (let round = 0; round < 3; round++) {
      await game.play();
      expect(await page.locator('canvas').count()).toBe(1);
      await game.advance(1000);
      expect((await game.state()).elapsed).toBe(1); // a leaked second session would double-step or throw
      await page.keyboard.press('Escape');
      await page.getByTestId('quit-button').click();
      await expect(page.getByTestId('main-menu')).toBeVisible();
      expect(await page.locator('canvas').count()).toBe(0);
      expect(await page.evaluate(() => !!window.__PIRATE_TEST__)).toBe(false);
    }
  });

  test('real-time clock advances once per frame (no duplicate tickers)', async ({ game, page }) => {
    await game.open({ clock: 'real' });
    await game.play();
    const t0 = (await game.state()).elapsed;
    await expect.poll(async () => (await game.state()).elapsed - t0, { timeout: 15_000 }).toBeGreaterThan(0.9);
    // One ticker: simulated time never runs ahead of wall-clock time (a duplicate would double it).
    const wallStart = Date.now();
    const s0 = (await game.state()).elapsed;
    await page.waitForTimeout(1000);
    const simulated = (await game.state()).elapsed - s0;
    expect(simulated).toBeLessThan((Date.now() - wallStart) / 1000 + 0.25);
  });

  test('a match finishes and is recorded exactly once', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 15);
    await game.play();
    await game.finishByTime();
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved');
    expect(await page.evaluate(() => window.__MOCK__!.confirmedCount())).toBe(1);
  });
});
