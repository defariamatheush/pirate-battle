import { expect, test } from './helpers';

test.describe('Asset loading', () => {
  test('shows loading progress before combat starts', async ({ game, page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __sawLoading: boolean }).__sawLoading = false;
      new MutationObserver(() => {
        if (document.querySelector('[role="progressbar"]')) (window as unknown as { __sawLoading: boolean }).__sawLoading = true;
      }).observe(document, { subtree: true, childList: true });
    });
    await game.open();
    await game.play();
    expect(await page.evaluate(() => (window as unknown as { __sawLoading: boolean }).__sawLoading)).toBe(true);
  });

  test('reports a failed asset load and recovers on retry', async ({ game, page }) => {
    await game.open({ scenario: 'assets-flaky' });
    await page.getByTestId('play-button').click();
    const error = page.getByTestId('load-error');
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error.getByRole('alert')).toContainText("didn’t load");
    // No simulation exists yet: nothing to observe, and the HUD must not be shown.
    await expect(page.getByTestId('hud')).toHaveCount(0);
    await page.getByTestId('retry-assets').click();
    await game.waitForMatch();
    await expect(page.getByTestId('load-error')).toHaveCount(0);
    expect((await game.state()).status).toBe('running');
  });

  test('can leave from the error screen and start again', async ({ game, page }) => {
    await game.open({ scenario: 'assets-flaky' });
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await game.play();
  });
});
