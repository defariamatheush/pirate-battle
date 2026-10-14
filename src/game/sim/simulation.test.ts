import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMEPLAY, buildGameplayConfig } from '@/config/gameplay';
import { STEP, Simulation } from './simulation';

const cfg = () => buildGameplayConfig({ sessionSeconds: 60, spawnIntervalSeconds: 4 });
const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step(STEP);
};
const empty = { islands: [] };

describe('Simulation', () => {
  it('moves forward and rotates, staying inside the arena', () => {
    const sim = new Simulation(cfg(), 1);
    sim.debugPlacePlayer(800, 450, 0);
    sim.setInput({ forward: true });
    run(sim, 1);
    expect(sim.player.x).toBeGreaterThan(850);
    sim.setInput({ turnRight: true });
    const h = sim.player.heading;
    run(sim, 0.5);
    expect(sim.player.heading).toBeGreaterThan(h);
    sim.setInput({ turnRight: false, turnLeft: false });
    sim.debugPlacePlayer(1500, 450, 0);
    sim.setInput({ forward: true });
    run(sim, 3);
    expect(sim.player.x).toBeLessThanOrEqual(DEFAULT_GAMEPLAY.arena.width - sim.player.radius);
  });

  it('blocks ships at islands', () => {
    const sim = new Simulation(cfg(), 1);
    const isl = sim.map.islands[2]!;
    sim.debugPlacePlayer(isl.x - 300, isl.y, 0);
    sim.setInput({ forward: true });
    run(sim, 4);
    expect(Math.hypot(sim.player.x - isl.x, sim.player.y - isl.y)).toBeGreaterThanOrEqual(isl.radius + sim.player.radius - 0.01);
  });

  it('front shot respects cooldown and damages an enemy exactly once per projectile', () => {
    const sim = new Simulation(cfg(), 1, empty);
    sim.debugPlacePlayer(300, 450, 0);
    const e = sim.debugSpawnEnemy('shooter', 600, 450, Math.PI);
    e.cooldowns.front = 99;
    sim.setInput({ fireFront: true });
    run(sim, 0.45); // only one shot fits before the 0.5s cooldown elapses
    expect(e.health).toBe(e.maxHealth - DEFAULT_GAMEPLAY.player.front.damage);
    run(sim, 0.55);
    expect(e.health).toBe(e.maxHealth - 2 * DEFAULT_GAMEPLAY.player.front.damage);
  });

  it('fires a three-projectile broadside on each side', () => {
    const sim = new Simulation(cfg(), 1, empty);
    sim.debugPlacePlayer(800, 450, 0);
    sim.setInput({ fireLeft: true });
    sim.step(STEP);
    expect(sim.projectiles).toHaveLength(3);
    expect(sim.projectiles.every((p) => p.vy < 0)).toBe(true);
    sim.setInput({ fireLeft: false, fireRight: true });
    sim.step(STEP);
    expect(sim.projectiles.filter((p) => p.vy > 0)).toHaveLength(3);
  });

  it('scores 1 per player kill but not for a chaser ramming the player', () => {
    const sim = new Simulation(cfg(), 1, empty);
    sim.debugPlacePlayer(300, 450, 0);
    sim.debugSpawnEnemy('chaser', 420, 450, Math.PI);
    sim.step(STEP);
    run(sim, 0.5);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.score).toBe(0);
    expect(sim.player.health).toBe(DEFAULT_GAMEPLAY.player.maxHealth - DEFAULT_GAMEPLAY.chaser.contactDamage);

    const sim2 = new Simulation(cfg(), 1, empty);
    sim2.debugPlacePlayer(300, 450, 0);
    sim2.debugSpawnEnemy('chaser', 900, 450, Math.PI);
    sim2.setInput({ fireFront: true });
    run(sim2, 2);
    expect(sim2.score).toBe(1);
  });

  it('spawns both enemy types far from the player, on a fixed interval', () => {
    const sim = new Simulation(cfg(), 7);
    const spawns: { kind: string; x: number; y: number; at: number }[] = [];
    for (let i = 0; i < Math.round(12.1 / STEP); i++) {
      sim.step(STEP);
      for (const ev of sim.drainEvents()) if (ev.type === 'enemySpawned') spawns.push({ kind: ev.kind, x: ev.x, y: ev.y, at: sim.elapsed });
    }
    expect(spawns.map((s) => s.kind)).toEqual(['chaser', 'shooter', expect.any(String)]);
    expect(spawns[0]!.at).toBeCloseTo(4, 1);
    expect(spawns[1]!.at).toBeCloseTo(8, 1);
    for (const s of spawns) {
      expect(Math.hypot(s.x - DEFAULT_GAMEPLAY.player.start.x, s.y - DEFAULT_GAMEPLAY.player.start.y)).toBeGreaterThan(400);
    }
  });

  it('ends on time and stops simulating', () => {
    const tough = { ...cfg(), player: { ...cfg().player, maxHealth: 1e6 } };
    const sim = new Simulation(tough, 3);
    run(sim, 61);
    expect(sim.status).toBe('ended');
    expect(sim.endReason).toBe('time_up');
    expect(sim.elapsed).toBe(60);
    const before = JSON.stringify(sim.snapshot());
    sim.setInput({ forward: true });
    run(sim, 2);
    expect(JSON.stringify(sim.snapshot())).toBe(before);
  });

  it('ends when the player is destroyed', () => {
    const sim = new Simulation({ ...cfg(), chaser: { ...cfg().chaser, contactDamage: 200 } }, 1, empty);
    sim.debugPlacePlayer(300, 450, 0);
    sim.debugSpawnEnemy('chaser', 400, 450, Math.PI);
    run(sim, 1);
    expect(sim.endReason).toBe('player_destroyed');
    expect(sim.score).toBe(0);
  });

  it('is deterministic for the same seed and inputs', () => {
    const play = () => {
      const s = new Simulation(cfg(), 42);
      s.setInput({ forward: true, turnRight: true, fireFront: true });
      run(s, 20);
      return JSON.stringify([s.snapshot(), s.enemies.map((e) => [e.x, e.y])]);
    };
    expect(play()).toBe(play());
  });

  it('is independent of how time is sliced into steps (fixed step)', () => {
    const a = new Simulation(cfg(), 5);
    const b = new Simulation(cfg(), 5);
    a.setInput({ forward: true });
    b.setInput({ forward: true });
    run(a, 3);
    for (let i = 0; i < 180; i++) b.step(STEP);
    expect(a.player.x).toBeCloseTo(b.player.x, 6);
  });
});
