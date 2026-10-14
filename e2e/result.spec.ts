import { expect, test } from './helpers';

test.describe('Result screen', () => {
  test('shows score, time played, reason and registration status; persists after a refresh', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 15);
    await game.play();
    await game.finishByTime();
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('result-title')).toHaveText('Voyage complete!');
    await expect(page.getByTestId('result-score')).toHaveText('0');
    await expect(page.getByTestId('result-duration')).toHaveText('60.0 s');
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('play-again')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('last-result-card')).toContainText('0 pts');
    await page.getByTestId('view-last-result').click();
    await expect(page.getByTestId('result-duration')).toHaveText('60.0 s');
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved');
    await page.getByTestId('main-menu-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('Play Again starts a fresh match and Main Menu returns', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 15);
    await game.play();
    await game.finishByTime();
    await page.getByTestId('play-again').click();
    await game.waitForMatch();
    const s = await game.state();
    expect(s.elapsed).toBe(0);
    expect(s.timeLeft).toBe(60);
    expect(s.score).toBe(0);
  });
});
