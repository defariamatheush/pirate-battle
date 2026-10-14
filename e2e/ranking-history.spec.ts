import { expect, test, type Game } from './helpers';

async function openTab(game: Game, name: 'Ranking' | 'Match History') {
  await game.page.getByRole('tab', { name }).click();
}

test.describe('Ranking and Match History tabs', () => {
  test('ranking lists fixtures ordered by score with ranks and the settings used', async ({ game, page }) => {
    await game.open();
    await openTab(game, 'Ranking');
    const rows = page.getByTestId('ranking-row');
    await expect(rows).toHaveCount(8);
    await expect(page.getByTestId('ranking-panel')).toContainText('90s');
    const scores = await rows.locator('td:nth-child(3)').allTextContents();
    const sorted = [...scores].map(Number).sort((a, b) => b - a);
    expect(scores.map(Number)).toEqual(sorted);
    await expect(rows.first().locator('td').first()).toHaveText('1');
  });

  test('paginates a long ranking (many pages) forwards and backwards', async ({ game, page }) => {
    await game.open({ scenario: 'many-pages' });
    await openTab(game, 'Ranking');
    const indicator = page.getByTestId('page-indicator');
    await expect(indicator).toHaveText('Page 1 of 25');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(indicator).toHaveText('Page 2 of 25');
    await expect(page.getByTestId('ranking-row').first().locator('td').first()).toHaveText('9');
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(indicator).toHaveText('Page 1 of 25');
    for (let i = 0; i < 24; i++) await page.getByRole('button', { name: 'Next page' }).click();
    await expect(indicator).toHaveText('Page 25 of 25');
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  test('history paginates and shows date, score, duration and reason', async ({ game, page }) => {
    await game.open({ scenario: 'many-pages' });
    await openTab(game, 'Match History');
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 5');
    const first = page.getByTestId('history-row').first();
    await expect(first).toContainText('UTC');
    await expect(first).toContainText(/\d+\.\d s/);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 5');
  });

  test('empty lists show friendly empty states', async ({ game, page }) => {
    await game.open({ scenario: 'empty' });
    await openTab(game, 'Ranking');
    await expect(page.getByTestId('empty-state')).toContainText('No scores yet');
    await openTab(game, 'Match History');
    await expect(page.getByTestId('empty-state')).toContainText('No matches yet');
  });

  test('shows a loading state while the request is slow', async ({ game, page }) => {
    await game.open({ scenario: 'slow', mockLatency: 1, apiTimeout: 8000 });
    await openTab(game, 'Ranking');
    await expect(page.getByRole('status').filter({ hasText: 'Loading the ranking' })).toBeVisible();
    await expect(page.getByTestId('ranking-row').first()).toBeVisible({ timeout: 8000 });
  });

  for (const [scenario, tab, what] of [
    ['ranking-fail', 'Ranking', 'the ranking'],
    ['history-fail', 'Match History', 'your match history'],
    ['http-5xx', 'Ranking', 'the ranking'],
    ['http-4xx', 'Match History', 'your match history'],
    ['network-error', 'Ranking', 'the ranking'],
    ['timeout', 'Match History', 'your match history'],
  ] as const) {
    test(`reports ${scenario} accessibly and recovers with Try again`, async ({ game, page }) => {
      await game.open({ scenario, apiTimeout: 600 });
      await openTab(game, tab);
      const alert = page.getByRole('alert').filter({ hasText: `Couldn’t load ${what}` });
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => window.__MOCK__!.set({ scenario: 'success' }));
      await alert.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId(tab === 'Ranking' ? 'ranking-row' : 'empty-state').first()).toBeVisible();
      await expect(alert).toHaveCount(0);
    });
  }

  test('the Network scenarios dialog switches scenario and resets state', async ({ game, page }) => {
    await game.open();
    await page.getByTestId('open-lab').click();
    const lab = page.getByTestId('network-lab');
    await expect(lab).toBeVisible();
    await lab.getByRole('radio', { name: /Empty lists/ }).check();
    expect(await page.evaluate(() => window.__MOCK__!.settings().scenario)).toBe('empty');
    await lab.getByTestId('reset-mocks').click();
    expect(await page.evaluate(() => window.__MOCK__!.settings().scenario)).toBe('success');
    await page.keyboard.press('Escape');
    await expect(lab).toBeHidden();
  });
});
