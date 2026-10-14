import type { GameplayConfig, WeaponConfig } from '@/config/gameplay';
import { angleDiff, normalizeAngle, segmentCircleHit, steerTowards, type Circle } from './geometry';
import { DEFAULT_MAP, type ArenaMap } from './map';
import { Rng } from './rng';
import {
  EMPTY_INPUT,
  type EndReason,
  type InputState,
  type MatchStatus,
  type Projectile,
  type Ship,
  type ShipKind,
  type SimEvent,
  type SimSnapshot,
  type Team,
} from './types';

/** Fixed simulation step (seconds). The renderer interpolates between steps. */
export const STEP = 1 / 60;

const AVOID_LOOKAHEAD = 150;

/**
 * Deterministic, renderer-agnostic game rules. `step(dt)` advances simulated time;
 * nothing here depends on wall-clock time or frame rate.
 */
export class Simulation {
  readonly config: GameplayConfig;
  readonly map: ArenaMap;

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  elapsed = 0;
  score = 0;
  player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];
  input: InputState = { ...EMPTY_INPUT };

  private events: SimEvent[] = [];
  private rng: Rng;
  private nextId = 1;
  private spawnTimer = 0;
  private spawnCount = 0;

  constructor(config: GameplayConfig, seed = 1, map: ArenaMap = DEFAULT_MAP) {
    this.config = config;
    this.map = map;
    this.rng = new Rng(seed);
    const p = config.player;
    this.player = this.makeShip('player', p.start.x, p.start.y, p.start.heading, p.maxHealth, p.radius);
  }

  // ---------------------------------------------------------------- public

  setInput(input: Partial<InputState>): void {
    Object.assign(this.input, input);
  }

  clearInput(): void {
    this.input = { ...EMPTY_INPUT };
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(): SimSnapshot {
    return {
      status: this.status,
      endReason: this.endReason,
      elapsed: this.elapsed,
      timeLeft: Math.max(0, this.config.sessionSeconds - this.elapsed),
      score: this.score,
      health: Math.max(0, Math.ceil(this.player.health)),
      maxHealth: this.player.maxHealth,
      enemies: this.enemies.length,
    };
  }

  step(dt: number): void {
    if (this.status !== 'running') return;
    this.elapsed += dt;

    this.snapshotPrev();
    this.updatePlayer(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateSpawns(dt);
    this.updateProjectiles(dt);
    this.resolveShipContacts();
    this.cleanup();

    if (!this.player.alive) this.end('player_destroyed');
    else if (this.elapsed >= this.config.sessionSeconds - 1e-6) {
      this.elapsed = this.config.sessionSeconds;
      this.end('time_up');
    }
  }

  /** Test/setup helper: spawns an enemy at an exact spot (rules still apply afterwards). */
  debugSpawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, heading = 0): Ship {
    const ship = this.createEnemy(kind, x, y, heading);
    this.enemies.push(ship);
    return ship;
  }

  /** Test/setup helper: places the player. */
  debugPlacePlayer(x: number, y: number, heading: number): void {
    const p = this.player;
    p.x = p.prevX = x;
    p.y = p.prevY = y;
    p.heading = p.prevHeading = heading;
    p.speed = 0;
  }

  // ---------------------------------------------------------------- setup

  private makeShip(kind: ShipKind, x: number, y: number, heading: number, hp: number, radius: number): Ship {
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      heading,
      speed: 0,
      health: hp,
      maxHealth: hp,
      radius,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
      prevX: x,
      prevY: y,
      prevHeading: heading,
    };
  }

  private createEnemy(kind: 'chaser' | 'shooter', x: number, y: number, heading: number): Ship {
    const c = this.config;
    const def = kind === 'chaser' ? c.chaser : c.shooter;
    const ship = this.makeShip(kind, x, y, heading, def.maxHealth, def.radius);
    // Shooters start with a small delay so they never fire on the spawn frame.
    if (kind === 'shooter') ship.cooldowns.front = c.shooter.weapon.cooldown * 0.6;
    return ship;
  }

  private snapshotPrev(): void {
    for (const s of [this.player, ...this.enemies]) {
      s.prevX = s.x;
      s.prevY = s.y;
      s.prevHeading = s.heading;
    }
    for (const p of this.projectiles) {
      p.prevX = p.x;
      p.prevY = p.y;
    }
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number): void {
    const cfg = this.config.player;
    const p = this.player;
    const inp = this.input;

    const turn = (inp.turnRight ? 1 : 0) - (inp.turnLeft ? 1 : 0);
    p.heading = normalizeAngle(p.heading + turn * cfg.turnRate * dt);

    if (inp.forward) p.speed = Math.min(cfg.maxSpeed, p.speed + cfg.acceleration * dt);
    else p.speed = Math.max(0, p.speed - cfg.drag * dt);

    this.moveShip(p, p.speed, dt);

    tickCooldowns(p, dt);
    if (inp.fireFront && p.cooldowns.front <= 0) {
      p.cooldowns.front = cfg.front.cooldown;
      this.fireFront(p, 'player', cfg.front);
    }
    if (inp.fireLeft && p.cooldowns.left <= 0) {
      p.cooldowns.left = cfg.broadside.cooldown;
      this.fireBroadside(p, -1);
    }
    if (inp.fireRight && p.cooldowns.right <= 0) {
      p.cooldowns.right = cfg.broadside.cooldown;
      this.fireBroadside(p, 1);
    }
  }

  private fireFront(ship: Ship, team: Team, weapon: WeaponConfig): void {
    const dx = Math.cos(ship.heading);
    const dy = Math.sin(ship.heading);
    const muzzle = ship.radius + weapon.projectileRadius + 2;
    this.spawnProjectile(team, ship.x + dx * muzzle, ship.y + dy * muzzle, dx, dy, weapon);
    this.events.push({ type: 'shot', team, weapon: 'front', x: ship.x + dx * muzzle, y: ship.y + dy * muzzle, heading: ship.heading });
  }

  /** `side`: -1 = port (left of the ship), +1 = starboard (right). */
  private fireBroadside(ship: Ship, side: -1 | 1): void {
    const cfg = this.config.player.broadside;
    const hx = Math.cos(ship.heading);
    const hy = Math.sin(ship.heading);
    const aim = ship.heading + (side * Math.PI) / 2;
    const dx = Math.cos(aim);
    const dy = Math.sin(aim);
    const offsetSide = ship.radius * 0.6 + cfg.projectileRadius;
    for (let i = 0; i < cfg.count; i++) {
      const along = (i - (cfg.count - 1) / 2) * cfg.spacing;
      this.spawnProjectile('player', ship.x + hx * along + dx * offsetSide, ship.y + hy * along + dy * offsetSide, dx, dy, cfg);
    }
    this.events.push({
      type: 'shot',
      team: 'player',
      weapon: 'broadside',
      x: ship.x + dx * offsetSide,
      y: ship.y + dy * offsetSide,
      heading: aim,
    });
  }

  private spawnProjectile(team: Team, x: number, y: number, dx: number, dy: number, w: WeaponConfig): void {
    this.projectiles.push({
      id: this.nextId++,
      team,
      x,
      y,
      vx: dx * w.projectileSpeed,
      vy: dy * w.projectileSpeed,
      damage: w.damage,
      radius: w.projectileRadius,
      ttl: w.projectileLifetime,
      alive: true,
      prevX: x,
      prevY: y,
    });
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemy(e: Ship, dt: number): void {
    if (!e.alive) return;
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    tickCooldowns(e, dt);

    if (e.kind === 'chaser') {
      const cfg = this.config.chaser;
      const desired = this.avoidIslands(e, toPlayer);
      e.heading = steerTowards(e.heading, desired, cfg.turnRate * dt);
      e.speed = cfg.speed;
    } else {
      const cfg = this.config.shooter;
      const desired = this.avoidIslands(e, toPlayer);
      e.heading = steerTowards(e.heading, desired, cfg.turnRate * dt);
      e.speed = dist > cfg.preferredRange ? cfg.speed : 0;
      const aimError = Math.abs(angleDiff(e.heading, toPlayer));
      if (dist <= cfg.attackRange && aimError <= cfg.aimTolerance && e.cooldowns.front <= 0) {
        e.cooldowns.front = cfg.weapon.cooldown;
        this.fireFront(e, 'enemy', cfg.weapon);
      }
    }
    this.moveShip(e, e.speed, dt);
  }

  /** Steers around island colliders ahead of the ship. Returns a heading. */
  private avoidIslands(ship: Ship, desired: number): number {
    const dirX = Math.cos(desired);
    const dirY = Math.sin(desired);
    let adjust = 0;
    for (const isl of this.map.islands) {
      const rx = isl.x - ship.x;
      const ry = isl.y - ship.y;
      const along = rx * dirX + ry * dirY;
      if (along <= 0 || along > AVOID_LOOKAHEAD + isl.radius) continue;
      const lateral = rx * -dirY + ry * dirX; // signed distance of the island centre from the path
      const clearance = isl.radius + ship.radius + 24;
      if (Math.abs(lateral) >= clearance) continue;
      const urgency = 1 - Math.min(1, Math.max(0, along - isl.radius) / AVOID_LOOKAHEAD);
      const side = lateral >= 0 ? -1 : 1; // island on the left of the path -> veer right
      adjust += side * (0.6 + 0.9 * urgency);
    }
    return desired + Math.max(-1.6, Math.min(1.6, adjust));
  }

  // ---------------------------------------------------------------- movement

  private moveShip(ship: Ship, speed: number, dt: number): void {
    const arena = this.config.arena;
    ship.x += Math.cos(ship.heading) * speed * dt;
    ship.y += Math.sin(ship.heading) * speed * dt;

    // Arena bounds.
    const r = ship.radius;
    if (ship.x < r) ship.x = r;
    else if (ship.x > arena.width - r) ship.x = arena.width - r;
    if (ship.y < r) ship.y = r;
    else if (ship.y > arena.height - r) ship.y = arena.height - r;

    // Island blocking: push the ship out along the contact normal.
    for (const isl of this.map.islands) {
      const dx = ship.x - isl.x;
      const dy = ship.y - isl.y;
      const min = isl.radius + ship.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      ship.x = isl.x + nx * min;
      ship.y = isl.y + ny * min;
      // Lose speed in proportion to how head-on the impact was.
      const headOn = Math.max(0, -(Math.cos(ship.heading) * nx + Math.sin(ship.heading) * ny));
      ship.speed *= 1 - 0.85 * headOn;
    }
  }

  /** Soft push between ships, and Chaser impacts. */
  private resolveShipContacts(): void {
    const p = this.player;
    const all = [p, ...this.enemies];
    for (let i = 0; i < all.length; i++) {
      const a = all[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]!;
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;

        // Chaser rams the player: damage, explode, no score.
        const chaser = a.kind === 'chaser' ? a : b.kind === 'chaser' ? b : null;
        const isPlayerPair = a === p || b === p;
        if (chaser && isPlayerPair) {
          this.events.push({ type: 'shipCollision', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          this.damageShip(p, this.config.chaser.contactDamage, 'collision', false);
          this.destroyShip(chaser, 'collision', false);
          continue;
        }

        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const ny = dy / d;
        const push = min - d;
        const aw = a === p ? 0.3 : 0.5;
        const bw = b === p ? 0.3 : 0.5;
        const total = aw + bw;
        a.x -= nx * push * (aw / total);
        a.y -= ny * push * (aw / total);
        b.x += nx * push * (bw / total);
        b.y += ny * push * (bw / total);
        this.keepInArena(a);
        this.keepInArena(b);
      }
    }
  }

  private keepInArena(s: Ship): void {
    const { width, height } = this.config.arena;
    s.x = Math.min(width - s.radius, Math.max(s.radius, s.x));
    s.y = Math.min(height - s.radius, Math.max(s.radius, s.y));
  }

  // ---------------------------------------------------------------- spawns

  private updateSpawns(dt: number): void {
    const cfg = this.config.spawn;
    this.spawnTimer += dt;
    if (this.spawnTimer < cfg.intervalSeconds) return;
    if (this.enemies.length >= cfg.maxAlive) {
      this.spawnTimer = cfg.intervalSeconds; // hold until there is room
      return;
    }
    const kind = this.pickKind();
    const pos = this.findSpawnPoint(kind);
    if (!pos) return; // try again next step; the timer stays armed
    this.spawnTimer -= cfg.intervalSeconds;
    this.spawnCount++;
    const heading = Math.atan2(this.player.y - pos.y, this.player.x - pos.x);
    const ship = this.createEnemy(kind, pos.x, pos.y, heading);
    this.enemies.push(ship);
    this.events.push({ type: 'enemySpawned', id: ship.id, kind, x: ship.x, y: ship.y });
  }

  private pickKind(): 'chaser' | 'shooter' {
    const { weights, guaranteeEachType } = this.config.spawn;
    if (guaranteeEachType && this.spawnCount < 2) return this.spawnCount === 0 ? 'chaser' : 'shooter';
    const total = weights.chaser + weights.shooter;
    return this.rng.next() * total < weights.chaser ? 'chaser' : 'shooter';
  }

  private findSpawnPoint(kind: 'chaser' | 'shooter'): { x: number; y: number } | null {
    const { arena, spawn } = this.config;
    const radius = kind === 'chaser' ? this.config.chaser.radius : this.config.shooter.radius;
    const m = Math.max(spawn.margin, radius + 4);
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = this.rng.range(m, arena.width - m);
      const y = this.rng.range(m, arena.height - m);
      if (Math.hypot(x - this.player.x, y - this.player.y) < spawn.minDistanceFromPlayer) continue;
      if (this.map.islands.some((i) => Math.hypot(x - i.x, y - i.y) < i.radius + radius + spawn.margin)) continue;
      if (this.enemies.some((e) => Math.hypot(x - e.x, y - e.y) < e.radius + radius + 40)) continue;
      return { x, y };
    }
    return null;
  }

  // ---------------------------------------------------------------- projectiles

  private updateProjectiles(dt: number): void {
    const { width, height } = this.config.arena;
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      const x1 = pr.x + pr.vx * dt;
      const y1 = pr.y + pr.vy * dt;
      let bestT = Infinity;
      let hitShip: Ship | null = null;
      let hitIsland = false;

      for (const isl of this.map.islands) {
        const t = segmentCircleHit(pr.x, pr.y, x1, y1, isl as Circle, pr.radius * 0.5);
        if (t !== null && t < bestT) {
          bestT = t;
          hitShip = null;
          hitIsland = true;
        }
      }
      const targets = pr.team === 'player' ? this.enemies : [this.player];
      for (const s of targets) {
        if (!s.alive) continue;
        const t = segmentCircleHit(pr.x, pr.y, x1, y1, s, pr.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          hitShip = s;
          hitIsland = false;
        }
      }

      if (bestT !== Infinity) {
        const hx = pr.x + (x1 - pr.x) * bestT;
        const hy = pr.y + (y1 - pr.y) * bestT;
        pr.x = hx;
        pr.y = hy;
        pr.alive = false;
        if (hitShip) {
          this.events.push({ type: 'projectileImpact', x: hx, y: hy, target: 'ship' });
          this.damageShip(hitShip, pr.damage, 'projectile', pr.team === 'player');
        } else if (hitIsland) {
          this.events.push({ type: 'projectileImpact', x: hx, y: hy, target: 'island' });
        }
        continue;
      }

      pr.x = x1;
      pr.y = y1;
      pr.ttl -= dt;
      if (x1 < 0 || x1 > width || y1 < 0 || y1 > height) {
        pr.alive = false;
      } else if (pr.ttl <= 0) {
        pr.alive = false;
        this.events.push({ type: 'projectileImpact', x: x1, y: y1, target: 'expired' });
      }
    }
  }

  // ---------------------------------------------------------------- damage

  private damageShip(ship: Ship, amount: number, cause: 'projectile' | 'collision', byPlayer: boolean): void {
    if (!ship.alive || this.status !== 'running') return;
    ship.health = Math.max(0, ship.health - amount);
    this.events.push({ type: 'shipDamaged', id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, damage: amount, health: ship.health });
    if (ship.health <= 0) this.destroyShip(ship, cause, byPlayer);
  }

  private destroyShip(ship: Ship, cause: 'projectile' | 'collision', byPlayer: boolean): void {
    if (!ship.alive) return;
    ship.alive = false;
    ship.health = Math.max(0, ship.health);
    ship.speed = 0;
    const scores = byPlayer && cause === 'projectile' && ship.kind !== 'player' && this.player.alive;
    this.events.push({ type: 'shipDestroyed', id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, heading: ship.heading, cause, byPlayer: scores });
    if (scores) {
      this.score += 1;
      this.events.push({ type: 'scoreChanged', score: this.score });
    }
  }

  private cleanup(): void {
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    this.input = { ...EMPTY_INPUT };
    this.events.push({ type: 'ended', reason });
  }
}

function tickCooldowns(ship: Ship, dt: number): void {
  const c = ship.cooldowns;
  c.front = Math.max(0, c.front - dt);
  c.left = Math.max(0, c.left - dt);
  c.right = Math.max(0, c.right - dt);
}
