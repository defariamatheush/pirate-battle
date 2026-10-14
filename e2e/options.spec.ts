import { expect, test, SESSION_FIELD, SPAWN_FIELD } from './helpers';

test.describe('Options', () => {
  test('navigates to Options and back', async ({ game, page }) => {
    await game.open();
    await page.getByTestId('options-button').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.getByTestId('back-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('validates session time and spawn interval', async ({ game, page }) => {
    await game.open();
    await page.getByTestId('options-button').click();
    const session = page.getByLabel(SESSION_FIELD);
    const spawn = page.getByLabel(SPAWN_FIELD);

    for (const bad of ['59', '181', '', '90.5']) {
      await session.fill(bad);
      await page.getByTestId('save-options').click();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(session).toHaveAttribute('aria-invalid', 'true');
    }
    await session.fill('90');
    for (const bad of ['0', '-1', '0.5', '15.5', '']) {
      await spawn.fill(bad);
      await page.getByTestId('save-options').click();
      await expect(spawn).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId('options-status')).toHaveText('');
    }
    // Boundaries are valid.
    await session.fill('60');
    await spawn.fill('1');
    await page.getByTestId('save-options').click();
    await expect(page.getByTestId('options-status')).toContainText('saved');
    await session.fill('180');
    await spawn.fill('15');
    await page.getByTestId('save-options').click();
    await expect(page.getByTestId('options-status')).toContainText('saved');
  });

  test('persists saved options after a refresh and applies them to the match', async ({ game, page }) => {
    await game.open();
    await game.setOptions(75, 2.5);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByText('Match: 75s · New enemy every 2.5s')).toBeVisible();
    await page.getByTestId('options-button').click();
    await expect(page.getByLabel(SESSION_FIELD)).toHaveValue('75');
    await expect(page.getByLabel(SPAWN_FIELD)).toHaveValue('2.5');
    await page.getByTestId('back-button').click();
    await game.play();
    expect((await game.state()).timeLeft).toBe(75);
  });

  test('invalid edits are not saved', async ({ game, page }) => {
    await game.open();
    await game.setOptions(100, 3);
    await page.getByTestId('options-button').click();
    await page.getByLabel(SESSION_FIELD).fill('500');
    await page.getByTestId('save-options').click();
    await page.getByTestId('back-button').click();
    await page.reload();
    await expect(page.getByText('Match: 100s · New enemy every 3s')).toBeVisible();
  });

  test('menu is keyboard operable with visible focus', async ({ game, page }) => {
    await game.open();
    await page.getByRole('tab', { name: 'Play' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Ranking' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Match History' })).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('play-button')).toBeFocused();
    const outline = await page.getByTestId('play-button').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
