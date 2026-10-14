import { expect, test, holdKey } from './helpers';

test.describe('Player movement', () => {
  test.beforeEach(async ({ game }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
  });

  test('sails forward only while the key is held, then coasts to a stop', async ({ game, page }) => {
    await game.placePlayer(800, 700, 0);
    const before = await game.state();
    await holdKey(page, 'ArrowUp', () => game.advance(1000));
    const moving = await game.state();
    expect(moving.player.x).toBeGreaterThan(before.player.x + 120);
    expect(Math.abs(moving.player.y - before.player.y)).toBeLessThan(1);
    await game.advance(2000);
    const stopped = await game.state();
    expect(stopped.player.speed).toBe(0);
    await game.advance(500);
    expect((await game.state()).player.x).toBe(stopped.player.x);
  });

  test('rotates to both sides, and can move while turning', async ({ game, page }) => {
    await game.placePlayer(800, 700, 0);
    await holdKey(page, 'ArrowRight', () => game.advance(500));
    const right = await game.state();
    expect(right.player.heading).toBeGreaterThan(0.9);
    await holdKey(page, 'ArrowLeft', () => game.advance(1000));
    const left = await game.state();
    expect(left.player.heading).toBeLessThan(right.player.heading - 1.8);
    // Turning while sailing curves the path.
    await game.placePlayer(800, 700, 0);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await game.advance(1000);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    const s = await game.state();
    expect(s.player.x).toBeGreaterThan(800);
    expect(s.player.y).toBeGreaterThan(700);
  });

  test('stays inside the visible arena on every side', async ({ game, page }) => {
    const { arena, player } = await game.state();
    const r = 34;
    for (const [heading, axis, limit] of [
      [0, 'x', arena.width - r],
      [Math.PI, 'x', r],
      [Math.PI / 2, 'y', arena.height - r],
      [-Math.PI / 2, 'y', r],
    ] as const) {
      // Start on the open lane (y/x free of islands).
      await game.placePlayer(heading === 0 || heading === Math.PI ? 800 : 60, heading === 0 || heading === Math.PI ? 870 : 60, heading);
      if (heading === Math.PI) await game.placePlayer(800, 880, Math.PI);
      if (Math.abs(heading) === Math.PI / 2) await game.placePlayer(1500, 450, heading);
      await holdKey(page, 'ArrowUp', () => game.advanceBy(8000, 1000));
      const s = await game.state();
      expect(Math.abs(s.player[axis] - limit), `heading ${heading}`).toBeLessThanOrEqual(0.5);
    }
    expect(player.x).toBeGreaterThan(0);
  });

  test('cannot sail through islands', async ({ game, page }) => {
    const { islands } = await game.state();
    for (const isl of islands) {
      // Approach each island head-on from the left.
      await game.placePlayer(Math.max(60, isl.x - isl.radius - 160), isl.y, 0);
      await holdKey(page, 'ArrowUp', () => game.advanceBy(3000, 250));
      const s = await game.state();
      const dist = Math.hypot(s.player.x - isl.x, s.player.y - isl.y);
      expect(dist, isl.id).toBeGreaterThanOrEqual(isl.radius + 34 - 0.5);
    }
  });
});
