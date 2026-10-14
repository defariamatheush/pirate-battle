import type { GameSession } from './GameSession';

/**
 * Test instrumentation, installed only with `?e2e=1`. It can observe state and drive
 * the simulation clock (`?clock=manual`), but every rule, input, collision and draw
 * still goes through the real code paths.
 */
export interface PirateTestApi {
  getState(): unknown;
  /** Advance simulated time (only meaningful with `?clock=manual`). */
  advance(ms: number): void;
  /** Setup helpers for scenarios; they do not bypass any rule afterwards. */
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, heading?: number): number;
  placePlayer(x: number, y: number, heading: number): void;
  setDebugOverlay(on: boolean): void;
  stats(): unknown;
  perf(): unknown;
}

declare global {
  interface Window {
    __PIRATE_TEST__?: PirateTestApi;
  }
}

export function installTestHooks(session: GameSession): void {
  const { sim } = session;
  const round = (n: number) => Math.round(n * 100) / 100;
  window.__PIRATE_TEST__ = {
    getState: () => ({
      status: sim.status,
      endReason: sim.endReason,
      paused: session.isPaused,
      elapsed: round(sim.elapsed),
      timeLeft: round(Math.max(0, sim.config.sessionSeconds - sim.elapsed)),
      score: sim.score,
      player: {
        x: round(sim.player.x),
        y: round(sim.player.y),
        heading: round(sim.player.heading),
        speed: round(sim.player.speed),
        health: sim.player.health,
        cooldowns: { ...sim.player.cooldowns },
      },
      enemies: sim.enemies.map((e) => ({ id: e.id, kind: e.kind, x: round(e.x), y: round(e.y), heading: round(e.heading), health: e.health })),
      projectiles: sim.projectiles.map((p) => ({ id: p.id, team: p.team, x: round(p.x), y: round(p.y), damage: p.damage })),
      islands: sim.map.islands,
      arena: sim.config.arena,
    }),
    advance: (ms) => session.advance(ms),
    spawnEnemy: (kind, x, y, heading = 0) => sim.debugSpawnEnemy(kind, x, y, heading).id,
    placePlayer: (x, y, heading) => sim.debugPlacePlayer(x, y, heading),
    setDebugOverlay: (on) => session.setDebugOverlay(on),
    stats: () => ({ renderer: session.rendererStats(), enemies: sim.enemies.length, projectiles: sim.projectiles.length }),
    perf: () => session.perf.summary(),
  };
}

export function removeTestHooks(_session: GameSession): void {
  delete window.__PIRATE_TEST__;
}
