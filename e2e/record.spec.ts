import { expect, goToLastPage, test, type Game } from './helpers';

/** Plays a quick 60 s match to completion with the test clock. */
async function finishQuickMatch(game: Game, interval = 15) {
  await game.setOptions(60, interval);
  await game.play();
  await game.finishByTime();
  await expect(game.page.getByTestId('result-screen')).toBeVisible();
}

const confirmed = (game: Game) => game.page.evaluate(() => window.__MOCK__!.confirmedCount());
const pendingCount = (game: Game) => game.page.evaluate(() => JSON.parse(localStorage.getItem('pb.pending.v1') ?? '[]').length as number);

test.describe('Recording a completed match', () => {
  test('is saved once and appears in both tabs', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await finishQuickMatch(game);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved');
    expect(await confirmed(game)).toBe(1);
    expect(await pendingCount(game)).toBe(0);

    await page.getByTestId('main-menu-button').click();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row')).toContainText('Time is up');
    await expect(page.getByTestId('history-row')).toContainText('60s / 15s');

    await page.getByRole('tab', { name: 'Ranking' }).click();
    // Ranking is keyed by settings: the current options are 60s / 15s. A score of 0 ranks last.
    await expect(page.getByTestId('ranking-panel')).toContainText('60s');
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    await goToLastPage(page);
    const mine = page.getByTestId('ranking-row').filter({ hasText: '(you)' });
    await expect(mine).toHaveCount(1);
  });

  test('ranking only compares matches played with the same configuration', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await finishQuickMatch(game);
    await page.getByTestId('main-menu-button').click();
    await game.setOptions(90, 4);
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    await goToLastPage(page);
    await expect(page.getByTestId('ranking-row').filter({ hasText: '(you)' })).toHaveCount(0);
  });

  test('a failed save stays queued across a refresh and is saved after recovery without duplicates', async ({ game, page }) => {
    await game.open({ scenario: 'post-unavailable', playerHp: 100000 });
    await finishQuickMatch(game);
    const status = page.getByTestId('registration-status');
    await expect(status).toHaveAttribute('data-state', 'failed');
    await expect(status).toContainText('temporarily unavailable');
    expect(await confirmed(game)).toBe(0);
    expect(await pendingCount(game)).toBe(1);

    // The player can start another match while one is pending.
    await page.getByTestId('play-again').click();
    await game.waitForMatch();
    await page.keyboard.press('Escape');
    await page.getByTestId('quit-button').click();

    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('pending-banner')).toBeVisible();
    expect(await pendingCount(game)).toBe(1);

    await page.evaluate(() => window.__MOCK__!.set({ scenario: 'success' }));
    const retry = page.getByTestId('pending-banner').getByRole('button', { name: 'Retry now' });
    await retry.dblclick();
    await expect(page.getByTestId('pending-banner')).toHaveCount(0);
    expect(await confirmed(game)).toBe(1);
    expect(await pendingCount(game)).toBe(0);
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('a timeout after the server committed is recovered without duplicating the record', async ({ game, page }) => {
    await game.open({ scenario: 'post-timeout-after-commit', apiTimeout: 700, retries: 2, playerHp: 100000 });
    await finishQuickMatch(game);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
    expect(await confirmed(game)).toBe(1);
    await page.getByTestId('main-menu-button').click();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    await goToLastPage(page);
    await expect(page.getByTestId('ranking-row').filter({ hasText: '(you)' })).toHaveCount(1);
  });

  test('retrying after exhausted attempts (timeout) also keeps a single record', async ({ game, page }) => {
    await game.open({ scenario: 'post-timeout-after-commit', apiTimeout: 500, retries: 0, playerHp: 100000 });
    await finishQuickMatch(game);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'failed', { timeout: 10_000 });
    expect(await confirmed(game)).toBe(1); // committed server-side although the client never heard back
    await page.getByTestId('retry-save').click();
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
    expect(await confirmed(game)).toBe(1);
    expect(await pendingCount(game)).toBe(0);
  });

  test('late responses never overwrite newer data', async ({ game, page }) => {
    await game.open({ scenario: 'out-of-order', mockLatency: 1, playerHp: 100000 });
    const tab = (name: 'Ranking' | 'Match History') => page.getByRole('tab', { name }).click();
    const post = (id: string) =>
      page.evaluate(async (matchId) => {
        const player = JSON.parse(localStorage.getItem('pb.player.v1')!) as { id: string };
        await fetch('/api/matches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            matchId,
            playerId: player.id,
            playerName: 'You',
            endedAt: new Date().toISOString(),
            score: 99,
            durationSeconds: 60,
            endReason: 'time_up',
            config: { sessionSeconds: 90, spawnIntervalSeconds: 4, configKey: 's90-i4' },
          }),
        });
      }, id);
    const mine = page.getByTestId('ranking-row').filter({ hasText: '(you)' });

    await tab('Ranking'); // GET #1 (odd): slow
    await expect(page.getByTestId('ranking-row').first()).toBeVisible({ timeout: 8000 });
    await post('late-1');
    await tab('Match History');
    await tab('Ranking'); // GET #2 (even): fast, sees late-1
    await expect(mine).toHaveCount(1);
    await tab('Match History');
    await tab('Ranking'); // GET #3 (odd): slow, its snapshot only contains late-1
    await post('late-2');
    await tab('Match History');
    await tab('Ranking'); // GET #4 (even): fast, sees both records and supersedes #3
    await expect(mine).toHaveCount(2);
    await page.waitForTimeout(3200); // the slow, stale reply would arrive now
    await expect(mine).toHaveCount(2);
  });
});
