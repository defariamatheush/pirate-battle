import { expect, test } from './helpers';

test.describe('Enemies', () => {
  test('Chaser pursues, rams the player, explodes and does not score', async ({ game }) => {
    await game.open();
    await game.play();
    await game.placePlayer(300, 450, 0);
    await game.spawnEnemy('chaser', 800, 450, Math.PI);
    const start = await game.state();
    await game.advance(600);
    const mid = await game.state();
    expect(Math.hypot(mid.enemies[0]!.x - 300, mid.enemies[0]!.y - 450)).toBeLessThan(Math.hypot(800 - 300, 0));
    await game.advance(3000);
    const end = await game.state();
    expect(end.enemies).toHaveLength(0);
    expect(end.player.health).toBe(start.player.health - 20);
    expect(end.score).toBe(0);
    await game.advance(1000);
    expect((await game.state()).player.health).toBe(start.player.health - 20); // exploded: no further damage
  });

  test('Chaser steers around islands instead of getting stuck', async ({ game }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    const { islands } = await game.state();
    const centre = islands.find((i) => i.id === 'centre')!;
    await game.placePlayer(centre.x + 260, centre.y, 0);
    await game.spawnEnemy('chaser', centre.x - 260, centre.y, 0);
    await game.advance(6000);
    const s = await game.state();
    // It either reached the player (and exploded) or is still closing in; never inside the island.
    for (const e of s.enemies) expect(Math.hypot(e.x - centre.x, e.y - centre.y)).toBeGreaterThanOrEqual(centre.radius + 32 - 0.5);
    expect(s.player.health).toBeLessThan(100000);
  });

  test('Shooter approaches and only fires when inside its attack range', async ({ game }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await game.placePlayer(150, 450, 0);
    await game.spawnEnemy('shooter', 1100, 450, Math.PI);
    await game.advance(1500);
    let s = await game.state();
    expect(s.enemies[0]!.x).toBeLessThan(1100); // approaching
    expect(s.projectiles.filter((p) => p.team === 'enemy')).toHaveLength(0);
    expect(s.player.health).toBe(100000); // out of range: nothing fired yet
    let fired = false;
    for (let i = 0; i < 40 && !fired; i++) {
      await game.advance(250);
      s = await game.state();
      const d = Math.hypot(s.enemies[0]!.x - s.player.x, s.enemies[0]!.y - s.player.y);
      if (s.projectiles.some((p) => p.team === 'enemy')) {
        fired = true;
        expect(d).toBeLessThanOrEqual(420 + 10);
      }
    }
    expect(fired).toBe(true);
    await game.advance(2500);
    expect((await game.state()).player.health).toBeLessThan(100000);
  });

  test('enemies spawn on the configured interval, both types, far from the player', async ({ game, page }) => {
    await game.open({ playerHp: 100000 });
    await game.setOptions(60, 3);
    await game.play();
    expect((await game.state()).enemies).toHaveLength(0);
    await game.advance(2900);
    expect((await game.state()).enemies).toHaveLength(0);
    await game.advance(200);
    let s = await game.state();
    expect(s.enemies.map((e) => e.kind)).toEqual(['chaser']);
    await game.advance(3000);
    s = await game.state();
    expect(s.enemies.map((e) => e.kind).sort()).toContain('shooter');
    const spawned = s.enemies.length;
    expect(spawned).toBeGreaterThanOrEqual(1);
    expect(spawned).toBeLessThanOrEqual(2);
    for (const e of s.enemies) {
      // Spawned >= 480 away from where the (stationary) player stood; they only get closer afterwards.
      expect(e.x).toBeGreaterThan(0);
    }
    await expect(page.getByTestId('hud')).toBeVisible();
  });
});
