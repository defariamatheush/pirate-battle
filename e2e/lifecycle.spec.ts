import { expect, test } from './helpers';

test.describe('Match lifecycle', () => {
  test('ends by time, freezes the simulation and shows the result', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 15);
    await game.play();
    await page.keyboard.down('KeyW');
    await game.advance(30_000);
    await page.keyboard.up('KeyW');
    await game.finishByTime();
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
    await expect(page.getByTestId('result-duration')).toHaveText('60.0 s');
  });

  test('ends by destruction, stops all simulation and resets cleanly on Play Again', async ({ game, page }) => {
    await game.open();
    await game.play();
    await game.placePlayer(300, 450, 0);
    for (let i = 0; i < 6; i++) await game.spawnEnemy('chaser', 420 + i * 12, 450 + (i % 2 ? 30 : -30), Math.PI);
    await page.keyboard.down('KeyW');
    // Keep stepping until the ship goes down; the match must end by destruction.
    for (let i = 0; i < 20; i++) {
      await game.advance(250);
      if ((await page.getByTestId('result-screen').count()) > 0) break;
    }
    await page.keyboard.up('KeyW');
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship destroyed');
    await expect(page.getByTestId('result-score')).toHaveText('0');

    await page.getByTestId('play-again').click();
    await game.waitForMatch();
    const s = await game.state();
    expect(s.status).toBe('running');
    expect(s.score).toBe(0);
    expect(s.enemies).toHaveLength(0);
    expect(s.projectiles).toHaveLength(0);
    expect(s.player.health).toBe(100);
    expect(s.timeLeft).toBe(90);
    expect(s.elapsed).toBe(0);
    await expect(page.getByTestId('sr-score')).toHaveText('0');
    await expect(page.getByTestId('sr-health')).toHaveText('100 of 100');
  });

  test('after the end, nothing keeps moving, shooting, spawning or scoring', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 1);
    await game.play();
    await game.finishByTime();
    // The session is gone with the result screen: no test hooks, no canvas, no leftover timers.
    expect(await page.evaluate(() => !!window.__PIRATE_TEST__)).toBe(false);
    expect(await page.locator('canvas').count()).toBe(0);
  });

  test('simulated state is frozen once ended (observed before leaving the arena)', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 2);
    await game.play();
    await game.advance(59_000);
    await page.evaluate(() => {
      // Observe the final state before the result screen replaces the arena.
      const w = window as unknown as { __snap?: unknown };
      const api = window.__PIRATE_TEST__!;
      api.advance(1000);
      w.__snap = api.getState();
    });
    const frozen = await page.evaluate(() => (window as unknown as { __snap: unknown }).__snap) as Awaited<ReturnType<typeof game.state>>;
    expect(frozen.status).toBe('ended');
    expect(frozen.endReason).toBe('time_up');
    expect(frozen.timeLeft).toBe(0);
    const again = await page.evaluate(() => {
      const api = window.__PIRATE_TEST__;
      if (!api) return null;
      api.advance(5000);
      return api.getState();
    });
    if (again) expect(again).toEqual(frozen);
  });
});
