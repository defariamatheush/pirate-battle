import { expect, test, pointerDown, pointerUp } from './helpers';

test.describe('Touch controls', () => {
  test.beforeEach(async ({ game }) => {
    await game.open({ touch: 1, playerHp: 100000 });
    await game.play();
    await game.placePlayer(300, 450, 0);
  });

  test('all six controls are rendered and labelled', async ({ page }) => {
    for (const c of ['turnLeft', 'forward', 'turnRight', 'fireLeft', 'fireFront', 'fireRight']) {
      const b = page.getByTestId(`touch-${c}`);
      await expect(b).toBeVisible();
      const box = await b.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('hold-to-sail and release stops accelerating', async ({ game, page }) => {
    const fwd = page.getByTestId('touch-forward');
    await pointerDown(fwd, 1);
    await game.advance(800);
    const moving = await game.state();
    expect(moving.player.x).toBeGreaterThan(350);
    await pointerUp(fwd, 1);
    await game.advance(2000);
    const stopped = await game.state();
    expect(stopped.player.speed).toBe(0);
  });

  test('two fingers: sail + fire at the same time, turning on release', async ({ game, page }) => {
    const fwd = page.getByTestId('touch-forward');
    const fire = page.getByTestId('touch-fireFront');
    await pointerDown(fwd, 1);
    await pointerDown(fire, 2);
    await game.advance(80);
    const s = await game.state();
    expect(s.player.speed).toBeGreaterThan(0);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);
    await pointerUp(fire, 2);
    await pointerUp(fwd, 1);
    const right = page.getByTestId('touch-turnRight');
    await pointerDown(right, 3);
    await game.advance(500);
    await pointerUp(right, 3);
    expect((await game.state()).player.heading).toBeGreaterThan(0.8);
  });

  test('broadside buttons fire three projectiles', async ({ game, page }) => {
    await pointerDown(page.getByTestId('touch-fireLeft'), 1);
    await pointerUp(page.getByTestId('touch-fireLeft'), 1);
    await game.advance(40);
    expect((await game.state()).projectiles).toHaveLength(3);
  });

  test('touch input is cleared on pause', async ({ game, page }) => {
    await pointerDown(page.getByTestId('touch-forward'), 1);
    await game.advance(200);
    await page.getByTestId('pause-button').click();
    await page.getByTestId('resume-button').click();
    const x = (await game.state()).player.x;
    await game.advance(800);
    expect((await game.state()).player.x).toBeLessThanOrEqual(x + 40); // coasting only
    await pointerUp(page.getByTestId('touch-forward'), 1);
  });
});
