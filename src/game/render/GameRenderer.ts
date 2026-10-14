import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite, type Application } from 'pixi.js';
import { normalizeAngle } from '../sim/geometry';
import type { Island } from '../sim/map';
import type { Simulation } from '../sim/simulation';
import type { Projectile, Ship, SimEvent } from '../sim/types';
import type { GameTextures } from './assets';
import { MAX_SHIP_STAGE } from './assets';

const SHIP_SCALE = 1.05;
/** Source art points "down"; heading 0 points east. */
const SPRITE_FORWARD_OFFSET = -Math.PI / 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + normalizeAngle(b - a) * t;

/** Damage stage 0..2 from the remaining health fraction. */
export function damageStage(health: number, maxHealth: number): number {
  const f = health / maxHealth;
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Ship views
// ---------------------------------------------------------------------------

class HealthBar {
  readonly container = new Container();
  private fill: Sprite;
  private fillTexture: Texture;
  private fillSource: Texture;
  private ratio = -1;

  constructor(tex: GameTextures, friendly: boolean) {
    const frame = new Sprite(tex.enemyBarFrame);
    this.fillSource = friendly ? tex.enemyBarFillGreen : tex.enemyBarFillRed;
    this.fillTexture = this.fillSource;
    this.fill = new Sprite(this.fillTexture);
    this.container.addChild(frame, this.fill);
    this.container.pivot.set(this.fillSource.width / 2, this.fillSource.height / 2);
    this.container.scale.set(0.62);
    this.set(1);
  }

  set(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    if (r === this.ratio) return;
    this.ratio = r;
    // The fill art lives at x 24..136 of its 160x40 canvas; reveal it from the left.
    const src = this.fillSource;
    const visible = Math.max(1, Math.round(24 + 112 * r));
    const next = r >= 1 ? src : new Texture({ source: src.source, frame: new Rectangle(src.frame.x, src.frame.y, visible, src.height) });
    if (this.fillTexture !== src) this.fillTexture.destroy(false);
    this.fillTexture = next;
    this.fill.texture = next;
    this.fill.visible = r > 0;
  }

  destroy(): void {
    if (this.fillTexture !== this.fillSource) this.fillTexture.destroy(false);
    this.container.destroy({ children: true });
  }
}

class ShipView {
  readonly body = new Container();
  readonly bar: HealthBar;
  private sprite: Sprite;
  private fire: Sprite;
  private stage = -1;
  private flash = 0;
  private fireClock = Math.random() * 1;

  constructor(
    readonly id: number,
    private kind: Ship['kind'],
    private tex: GameTextures,
    shipLayer: Container,
    barLayer: Container,
  ) {
    this.sprite = new Sprite(tex.ships[kind][0]);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(SHIP_SCALE);
    this.fire = new Sprite(tex.fire[0]);
    this.fire.anchor.set(0.5);
    this.fire.scale.set(0.6);
    this.fire.visible = false;
    this.body.addChild(this.sprite);
    shipLayer.addChild(this.body);
    this.bar = new HealthBar(tex, kind === 'player');
    barLayer.addChild(this.bar.container);
    shipLayer.addChild(this.fire);
  }

  hit(): void {
    this.flash = 0.18;
  }

  update(ship: Ship, alpha: number, dt: number): void {
    const x = lerp(ship.prevX, ship.x, alpha);
    const y = lerp(ship.prevY, ship.y, alpha);
    this.body.position.set(x, y);
    this.body.rotation = lerpAngle(ship.prevHeading, ship.heading, alpha) + SPRITE_FORWARD_OFFSET;

    const stage = damageStage(ship.health, ship.maxHealth);
    if (stage !== this.stage) {
      this.stage = stage;
      this.sprite.texture = this.tex.ships[this.kind][Math.min(stage, MAX_SHIP_STAGE)]!;
      this.fire.visible = stage >= 2;
    }
    if (this.fire.visible) {
      this.fireClock += dt;
      this.fire.texture = this.tex.fire[Math.floor(this.fireClock * 8) % this.tex.fire.length]!;
      this.fire.position.set(x + Math.cos(ship.heading) * 4, y + Math.sin(ship.heading) * 4);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.sprite.tint = this.flash > 0 ? 0xff6a5a : 0xffffff;
    }
    this.bar.set(ship.health / ship.maxHealth);
    this.bar.container.position.set(x, y - ship.radius - 34);
  }

  destroy(): void {
    this.bar.destroy();
    this.fire.destroy();
    this.body.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------
// Short-lived effects
// ---------------------------------------------------------------------------

interface Effect {
  sprite: Sprite;
  age: number;
  life: number;
  update(e: Effect, t: number): void;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Draws a `Simulation`. Owns every Pixi display object it creates and releases
 * them in `destroy()`. It never mutates simulation state.
 */
export class GameRenderer {
  readonly world = new Container();
  private water: TilingSprite;
  private islandLayer = new Container();
  private projectileLayer = new Container();
  private shipLayer = new Container();
  private effectLayer = new Container();
  private barLayer = new Container();

  private ships = new Map<number, ShipView>();
  private projectiles = new Map<number, { sprite: Sprite; trail: Sprite }>();
  private projectilePool: { sprite: Sprite; trail: Sprite }[] = [];
  private effects: Effect[] = [];
  private ringTexture: Texture;

  private clock = 0;
  private shake = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private debugOverlay: Graphics | null = null;

  constructor(
    private app: Application,
    private tex: GameTextures,
    private sim: Simulation,
  ) {
    const { width, height } = sim.config.arena;
    this.water = new TilingSprite({ texture: tex.tiles.water, width, height });
    this.world.addChild(this.water, this.islandLayer, this.projectileLayer, this.shipLayer, this.effectLayer, this.barLayer);
    // Anything outside the arena is hidden so the playable area is unambiguous.
    const mask = new Graphics().rect(0, 0, width, height).fill(0xffffff);
    this.world.addChild(mask);
    this.world.mask = mask;
    this.app.stage.addChild(this.world);

    const ring = new Graphics().circle(32, 32, 28).stroke({ width: 4, color: 0xffffff, alpha: 1 });
    this.ringTexture = app.renderer.generateTexture({ target: ring, resolution: 2 });
    ring.destroy();

    this.buildIslands(sim.map.islands);
  }

  /** Fit the arena (16:9) inside the canvas, preserving proportions. */
  resize(canvasWidth: number, canvasHeight: number): void {
    const { width, height } = this.sim.config.arena;
    this.scale = Math.min(canvasWidth / width, canvasHeight / height);
    this.offsetX = (canvasWidth - width * this.scale) / 2;
    this.offsetY = (canvasHeight - height * this.scale) / 2;
    this.applyCamera();
  }

  private applyCamera(): void {
    const amp = this.shake > 0 ? this.shake * 10 : 0;
    const sx = amp ? (Math.random() - 0.5) * amp : 0;
    const sy = amp ? (Math.random() - 0.5) * amp : 0;
    this.world.scale.set(this.scale);
    this.world.position.set(this.offsetX + sx * this.scale, this.offsetY + sy * this.scale);
  }

  /** Pixel position of an arena point inside the canvas (useful for tests). */
  worldToCanvas(x: number, y: number): { x: number; y: number } {
    return { x: this.offsetX + x * this.scale, y: this.offsetY + y * this.scale };
  }

  private buildIslands(islands: Island[]): void {
    for (const isl of islands) {
      const tex =
        isl.kind === 'grass' ? this.tex.tiles.grass : isl.kind === 'sand' ? this.tex.tiles.sand : isl.kind === 'rock' ? this.tex.tiles.rock : this.tex.tiles.rockMossy;
      // Shallow-water halo.
      const halo = new Graphics().circle(isl.x, isl.y, isl.radius + 26).fill({ color: 0xbff4ff, alpha: 0.22 });
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(isl.scale);
      sprite.position.set(isl.x, isl.y);
      this.islandLayer.addChild(halo, sprite);
    }
  }

  /** Toggle collision outlines (debug / screenshots for review). */
  setDebug(on: boolean): void {
    if (!on) {
      this.debugOverlay?.destroy();
      this.debugOverlay = null;
      return;
    }
    if (this.debugOverlay) return;
    const g = new Graphics();
    for (const i of this.sim.map.islands) g.circle(i.x, i.y, i.radius).stroke({ width: 2, color: 0xff00ff });
    this.world.addChild(g);
    this.debugOverlay = g;
  }

  // ----------------------------------------------------------- events -> effects

  handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.spawnBurst(ev.x, ev.y, 0.28, 0.14, 0);
          break;
        case 'projectileImpact':
          if (ev.target === 'ship') this.spawnBurst(ev.x, ev.y, 0.4, 0.22, 1);
          else this.spawnRing(ev.x, ev.y, ev.target === 'island' ? 0.5 : 0.7);
          break;
        case 'shipDamaged':
          this.ships.get(ev.id)?.hit();
          if (ev.kind === 'player') this.shake = Math.min(1, this.shake + 0.5);
          break;
        case 'shipDestroyed':
          this.spawnDestruction(ev.x, ev.y, ev.heading, ev.kind);
          this.shake = Math.min(1, this.shake + (ev.kind === 'player' ? 1 : 0.35));
          break;
        case 'shipCollision':
          this.spawnBurst(ev.x, ev.y, 0.7, 0.3, 1);
          break;
        default:
          break;
      }
    }
  }

  private addEffect(effect: Effect): void {
    this.effectLayer.addChild(effect.sprite);
    this.effects.push(effect);
  }

  private spawnBurst(x: number, y: number, scale: number, life: number, frame: number): void {
    const sprite = new Sprite(this.tex.explosion[frame % this.tex.explosion.length]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = Math.random() * Math.PI * 2;
    this.addEffect({
      sprite,
      age: 0,
      life,
      update: (e, t) => {
        e.sprite.scale.set(scale * (0.6 + t * 0.7));
        e.sprite.alpha = 1 - t * t;
      },
    });
  }

  private spawnRing(x: number, y: number, scale: number): void {
    const sprite = new Sprite(this.ringTexture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.addEffect({
      sprite,
      age: 0,
      life: 0.45,
      update: (e, t) => {
        e.sprite.scale.set(scale * (0.3 + t * 0.9));
        e.sprite.alpha = 0.8 * (1 - t);
      },
    });
  }

  /** Explosion sequence plus a sinking wreck. */
  private spawnDestruction(x: number, y: number, heading: number, kind: Ship['kind']): void {
    const frames = this.tex.explosion;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.addEffect({
      sprite,
      age: 0,
      life: 0.7,
      update: (e, t) => {
        e.sprite.texture = frames[Math.min(frames.length - 1, Math.floor(t * frames.length))]!;
        e.sprite.scale.set(0.8 + t * 0.9);
        e.sprite.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      },
    });
    const wreck = new Sprite(this.tex.ships[kind][MAX_SHIP_STAGE]);
    wreck.anchor.set(0.5);
    wreck.position.set(x, y);
    wreck.rotation = heading + SPRITE_FORWARD_OFFSET;
    this.addEffect({
      sprite: wreck,
      age: 0,
      life: 1.4,
      update: (e, t) => {
        e.sprite.scale.set(SHIP_SCALE * (1 - t * 0.35));
        e.sprite.alpha = 1 - t;
        e.sprite.rotation += 0.004;
      },
    });
  }

  // ----------------------------------------------------------- per-frame

  /** `alpha` interpolates between the previous and current simulation step. */
  render(alpha: number, dtSeconds: number): void {
    this.clock += dtSeconds;
    this.water.tilePosition.set(this.clock * 9, this.clock * 5);

    this.syncShips(alpha, dtSeconds);
    this.syncProjectiles(alpha);
    this.updateEffects(dtSeconds);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dtSeconds * 2.5);
      this.applyCamera();
    }
  }

  private syncShips(alpha: number, dt: number): void {
    const live = new Set<number>();
    const visit = (s: Ship) => {
      live.add(s.id);
      let view = this.ships.get(s.id);
      if (!view) {
        view = new ShipView(s.id, s.kind, this.tex, this.shipLayer, this.barLayer);
        this.ships.set(s.id, view);
      }
      view.update(s, alpha, dt);
    };
    visit(this.sim.player);
    for (const e of this.sim.enemies) visit(e);
    if (!this.sim.player.alive) live.delete(this.sim.player.id);
    for (const [id, view] of this.ships) {
      if (!live.has(id)) {
        view.destroy();
        this.ships.delete(id);
      }
    }
  }

  private syncProjectiles(alpha: number): void {
    const live = new Set<number>();
    for (const p of this.sim.projectiles) {
      live.add(p.id);
      let view = this.projectiles.get(p.id);
      if (!view) {
        view = this.acquireProjectile(p);
        this.projectiles.set(p.id, view);
      }
      const x = lerp(p.prevX, p.x, alpha);
      const y = lerp(p.prevY, p.y, alpha);
      view.sprite.position.set(x, y);
      view.trail.position.set(x, y);
    }
    for (const [id, view] of this.projectiles) {
      if (!live.has(id)) {
        this.releaseProjectile(view);
        this.projectiles.delete(id);
      }
    }
  }

  private acquireProjectile(p: Projectile) {
    let view = this.projectilePool.pop();
    if (!view) {
      const sprite = new Sprite(this.tex.cannonBall);
      sprite.anchor.set(0.5);
      sprite.scale.set(1.3);
      const trail = new Sprite(Texture.WHITE);
      trail.anchor.set(1, 0.5);
      trail.height = 3;
      trail.width = 46;
      trail.alpha = 0.55;
      view = { sprite, trail };
      this.projectileLayer.addChild(trail, sprite);
    }
    view.sprite.visible = true;
    view.trail.visible = true;
    view.trail.rotation = Math.atan2(p.vy, p.vx);
    view.trail.tint = p.team === 'player' ? 0xffffff : 0xffd9c8;
    return view;
  }

  private releaseProjectile(view: { sprite: Sprite; trail: Sprite }): void {
    view.sprite.visible = false;
    view.trail.visible = false;
    this.projectilePool.push(view);
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.age += dt;
      const t = Math.min(1, e.age / e.life);
      e.update(e, t);
      if (t >= 1) {
        e.sprite.destroy();
        this.effects.splice(i, 1);
      }
    }
  }

  /** Counts display objects owned by the renderer (leak checks in tests). */
  stats(): { ships: number; projectiles: number; pooledProjectiles: number; effects: number; stageChildren: number } {
    return {
      ships: this.ships.size,
      projectiles: this.projectiles.size,
      pooledProjectiles: this.projectilePool.length,
      effects: this.effects.length,
      stageChildren: countDescendants(this.app.stage),
    };
  }

  destroy(): void {
    for (const v of this.ships.values()) v.destroy();
    this.ships.clear();
    this.projectiles.clear();
    this.projectilePool.length = 0;
    this.effects.length = 0;
    this.ringTexture.destroy(true);
    this.world.destroy({ children: true });
  }
}

function countDescendants(c: Container): number {
  let n = 0;
  for (const child of c.children) n += 1 + countDescendants(child as Container);
  return n;
}
