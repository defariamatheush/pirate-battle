import { expect, test } from './helpers';

test.describe('Player weapons', () => {
  test.beforeEach(async ({ game }) => {
    await game.open({ playerHp: 100000 });
    await game.play();
    await game.placePlayer(150, 600, 0);
  });

  test('front cannon fires one projectile and respects its cooldown', async ({ game, page }) => {
    await page.keyboard.down('Space');
    await game.advance(50);
    const first = await game.state();
    expect(first.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);
    expect(first.player.cooldowns.front).toBeGreaterThan(0.3);
    // Holding fire does not exceed the cooldown (0.5 s): ~2 shots in 0.6 s.
    await game.advance(550);
    await page.keyboard.up('Space');
    const shots = (await game.state()).projectiles.length;
    expect(shots).toBeLessThanOrEqual(2);
    expect(shots).toBeGreaterThanOrEqual(1);
  });

  test('broadside fires three parallel projectiles to each side', async ({ game, page }) => {
    await page.keyboard.press('KeyQ');
    await game.advance(30);
    let s = await game.state();
    expect(s.projectiles).toHaveLength(3);
    // Left of an east-facing ship is north: all three go up, in parallel.
    const xs = s.projectiles.map((p) => p.x);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(3);
    await game.advance(400);
    const ys = (await game.state()).projectiles.map((p) => p.y);
    expect(ys.every((y) => y < 450)).toBe(true);

    await game.advance(2000); // clear the field + cooldown
    await page.keyboard.press('KeyE');
    await game.advance(30);
    s = await game.state();
    expect(s.projectiles).toHaveLength(3);
    await game.advance(300);
    expect((await game.state()).projectiles.every((p) => p.y > 450)).toBe(true);
  });

  test('weapons keep independent cooldowns and can fire together while sailing', async ({ game, page }) => {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyQ');
    await game.advance(60);
    const s = await game.state();
    expect(s.projectiles).toHaveLength(4); // 1 front + 3 broadside
    expect(s.player.speed).toBeGreaterThan(0);
    expect(s.player.cooldowns.left).toBeGreaterThan(1.2);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyQ');
  });

  test('a hit damages once, removes the projectile and scores exactly one point per kill', async ({ game, page }) => {
    await game.spawnEnemy('shooter', 520, 600, Math.PI); // 60 hp; holds fire for its first second
    await page.keyboard.press('Space');
    await game.advance(900);
    let s = await game.state();
    const shooter = s.enemies[0]!;
    expect(shooter.health).toBe(60 - 25);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(0);
    expect(s.score).toBe(0);

    await page.keyboard.press('Space'); // 35 -> 10
    await game.advance(900);
    expect((await game.state()).enemies[0]!.health).toBe(10);
    await page.keyboard.press('Space'); // 10 -> destroyed
    await game.advance(900);
    s = await game.state();
    expect(s.enemies.find((e) => e.id === shooter.id)).toBeUndefined();
    expect(s.score).toBe(1);
    await game.advance(3000);
    expect((await game.state()).score).toBe(1);
  });

  test('projectiles stop at islands', async ({ game, page }) => {
    const { islands } = await game.state();
    const isl = islands.find((i) => i.id === 'centre')!;
    await game.placePlayer(isl.x - 300, isl.y, 0);
    await game.spawnEnemy('shooter', isl.x + 300, isl.y, Math.PI);
    await page.keyboard.press('Space');
    await game.advance(1000);
    const s = await game.state();
    expect(s.enemies[0]!.health).toBe(60);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(0);
  });
});
