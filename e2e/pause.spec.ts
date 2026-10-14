import { expect, test } from './helpers';

test.describe('Pause', () => {
  test('manual pause freezes time and cooldowns; resume needs an action and carries nothing over', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await game.placePlayer(300, 450, 0);
    await page.keyboard.press('Space');
    await game.advance(200);
    const before = await game.state();
    expect(before.player.cooldowns.front).toBeGreaterThan(0);

    await page.getByTestId('pause-button').click();
    const dialog = page.getByTestId('pause-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('resume-button')).toBeFocused();
    await game.advance(5000); // the clock tries to run while paused
    const paused = await game.state();
    expect(paused.paused).toBe(true);
    expect(paused.elapsed).toBe(before.elapsed);
    expect(paused.player.cooldowns).toEqual(before.player.cooldowns);

    // Keys pressed while paused must not be remembered.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('KeyQ');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('KeyQ');
    await page.getByTestId('resume-button').click();
    await expect(dialog).toBeHidden();
    await game.advance(1000);
    const after = await game.state();
    expect(after.paused).toBe(false);
    expect(after.player.x).toBe(before.player.x);
    expect(after.elapsed).toBeCloseTo(before.elapsed + 1, 1);
    expect(after.player.cooldowns.left).toBe(0); // the Q press during the pause never fired a broadside
  });

  test('Escape toggles pause, and keys held before pausing do not continue after resuming', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await game.placePlayer(300, 450, 0);
    await page.keyboard.down('ArrowUp');
    await game.advance(300);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    const x = (await game.state()).player.x;
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
    await page.keyboard.down('ArrowUp'); // re-press is required
    await page.keyboard.up('ArrowUp');
    await game.advance(1000);
    const s = await game.state();
    expect(s.paused).toBe(false);
    expect(s.player.x).toBeGreaterThan(x - 1); // only coasting / the new tap, never accumulated movement
  });

  test('losing focus or hiding the tab pauses automatically and stays paused', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await game.advance(500);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await expect(page.getByTestId('pause-dialog')).toContainText('lost focus');
    const t = (await game.state()).elapsed;
    await game.advance(3000);
    expect((await game.state()).elapsed).toBe(t);
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('pause-dialog')).toBeHidden();

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    await expect(page.getByTestId('pause-dialog')).toBeVisible(); // returning to the tab does not resume by itself
    await page.getByTestId('resume-button').click();
    expect((await game.state()).paused).toBe(false);
  });

  test('real-time clock: the timer does not advance while paused', async ({ game, page }) => {
    await game.open({ clock: 'real', playerHp: 100000 });
    await game.play();
    await page.waitForTimeout(700);
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    const a = await game.state();
    await page.waitForTimeout(1500);
    const b = await game.state();
    expect(b.elapsed).toBe(a.elapsed);
    expect(b.timeLeft).toBe(a.timeLeft);
    await page.getByTestId('resume-button').click();
    await page.waitForTimeout(500);
    const c = await game.state();
    expect(c.elapsed).toBeGreaterThan(a.elapsed);
    expect(c.elapsed - a.elapsed).toBeLessThan(1.2); // no catch-up for the paused period
  });

  test('the dialog traps focus and Main Menu abandons without recording', async ({ game, page }) => {
    await game.open();
    await game.play();
    await page.getByTestId('pause-button').click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      // Focus may only ever be inside the dialog (or nowhere, e.g. browser chrome) — never on the page behind it.
      const escaped = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && a !== document.body && !a.closest('dialog');
      });
      expect(escaped).toBe(false);
    }
    await page.getByTestId('quit-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('last-result-card')).toHaveCount(0);
    expect(await page.locator('canvas').count()).toBe(0);
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});
