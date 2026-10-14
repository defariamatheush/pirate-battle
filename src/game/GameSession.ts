import { Application, type Ticker } from 'pixi.js';
import type { MatchRecord } from '@/api/contracts';
import { configKey, type GameOptions, type GameplayConfig } from '@/config/gameplay';
import { runtimeConfig } from '@/lib/runtimeConfig';
import { getPlayer, newId } from '@/state/player';
import { useMatchStore } from '@/state/matchStore';
import { audio } from './audio';
import { InputController, type Control } from './input/InputController';
import { PerfMonitor } from './perf';
import type { GameTextures } from './render/assets';
import { GameRenderer } from './render/GameRenderer';
import { STEP, Simulation } from './sim/simulation';
import type { SimEvent } from './sim/types';
import { installTestHooks, removeTestHooks } from './testHooks';

/** Real-time pause after the match ends so the final explosion stays visible. */
const END_LINGER_MS = 1300;
/** Largest frame time simulated in one go (protects against long stalls). */
const MAX_FRAME_MS = 100;

export interface SessionOptions {
  host: HTMLElement;
  textures: GameTextures;
  config: GameplayConfig;
  options: GameOptions;
  seed: number;
  /** Called once when the match is over and the result should be shown. */
  onFinished: (record: MatchRecord) => void;
}

/**
 * Glue between the simulation, the Pixi renderer, input, audio and the UI store.
 * Lifecycle: `init()` → running (ticker) → `dispose()`. `dispose()` is idempotent and
 * safe to call while `init()` is still awaiting (React Strict Mode mounts twice).
 */
export class GameSession {
  readonly sim: Simulation;
  readonly input = new InputController();
  readonly perf = new PerfMonitor();

  private app: Application | null = null;
  private renderer: GameRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private paused = false;
  private accumulator = 0;
  private endedAtMs: number | null = null;
  private finished = false;
  private lastTimeLeft = -1;
  private lowHealthAnnounced = false;
  private timeWarned = false;

  constructor(private opts: SessionOptions) {
    this.sim = new Simulation(opts.config, opts.seed);
    this.input.onPauseToggle = () => (this.paused ? this.resume() : this.pause('manual'));
  }

  async init(): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: this.opts.host,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    if (this.disposed) {
      // Unmounted while the renderer was initialising (Strict Mode, fast navigation).
      app.destroy(true, { children: true, texture: false, textureSource: false });
      return;
    }
    this.app = app;
    const canvas = app.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.testid = 'game-canvas';
    this.opts.host.appendChild(canvas);

    this.renderer = new GameRenderer(app, this.opts.textures, this.sim);
    this.renderer.resize(app.screen.width, app.screen.height);
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.app || this.disposed) return;
      this.app.resize();
      this.renderer?.resize(this.app.screen.width, this.app.screen.height);
    });
    this.resizeObserver.observe(this.opts.host);

    this.input.attach();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);

    audio.preload(['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3', 'cannon_broadside', 'ship_explosion_1', 'ship_wood_hit_1', 'score_point']);
    audio.play('game_start', 0.5);
    audio.loop('ocean_ambience_loop', 0.2);

    const store = useMatchStore.getState();
    store.patch({
      phase: 'playing',
      pauseReason: null,
      score: 0,
      health: this.sim.player.health,
      maxHealth: this.sim.player.maxHealth,
      timeLeft: this.opts.config.sessionSeconds,
      announcement: 'Match started.',
    });

    if (runtimeConfig.e2e) installTestHooks(this);
    app.ticker.add(this.tick);
    this.renderer.render(0, 0);
    this.syncUi(true);
  }

  // ------------------------------------------------------------------ loop

  private tick = (ticker: Ticker): void => {
    const renderer = this.renderer;
    if (!renderer || this.disposed) return;
    const frameMs = Math.min(ticker.deltaMS, MAX_FRAME_MS);
    this.perf.record(ticker.deltaMS, this.entityCount());

    if (runtimeConfig.manualClock) {
      renderer.render(1, 0);
      return;
    }
    if (this.paused) {
      renderer.render(1, 0);
      return;
    }
    this.accumulator += frameMs / 1000;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 12) {
      // Taps shorter than a frame only count for the first step of the frame.
      this.sim.setInput(steps === 0 ? this.input.poll() : this.input.state);
      this.sim.step(STEP);
      this.accumulator -= STEP;
      steps++;
      this.consumeEvents();
    }
    if (steps === 12) this.accumulator = 0; // drop backlog instead of spiralling
    renderer.render(this.accumulator / STEP, frameMs / 1000);
    this.syncUi(false);
    this.checkFinished(performance.now());
  };

  /** Deterministic stepping for tests: advances `ms` of simulated time, then renders once. */
  advance(ms: number): void {
    if (this.disposed || !this.renderer || this.paused) return;
    this.accumulator += ms / 1000;
    let first = true;
    while (this.accumulator >= STEP - 1e-9) {
      this.sim.setInput(first ? this.input.poll() : this.input.state);
      first = false;
      this.sim.step(STEP);
      this.accumulator -= STEP;
      this.consumeEvents();
    }
    this.renderer.render(1, ms / 1000);
    this.syncUi(false);
    if (this.sim.status === 'ended') this.finish();
  }

  private consumeEvents(): void {
    const events = this.sim.drainEvents();
    if (events.length === 0) return;
    this.renderer?.handleEvents(events);
    for (const ev of events) this.reactTo(ev);
  }

  private reactTo(ev: SimEvent): void {
    const ui = useMatchStore.getState();
    switch (ev.type) {
      case 'shot':
        if (ev.team === 'player') audio.play(ev.weapon === 'broadside' ? 'cannon_broadside' : (['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'] as const)[Math.floor(Math.random() * 3)]!, 0.45);
        else audio.play('cannon_fire_2', 0.25);
        break;
      case 'projectileImpact':
        audio.play(ev.target === 'ship' ? 'ship_wood_hit_1' : 'cannonball_water_hit_1', 0.35);
        break;
      case 'shipCollision':
        audio.play('ship_collision', 0.5);
        break;
      case 'shipDestroyed':
        audio.play(ev.kind === 'player' ? 'ship_sinking' : 'ship_explosion_1', 0.55);
        break;
      case 'scoreChanged':
        audio.play('score_point', 0.5);
        ui.patch({ announcement: `Enemy ship sunk. Score ${ev.score}.` });
        break;
      case 'ended':
        this.input.reset();
        this.endedAtMs = performance.now();
        audio.stopAllLoops();
        audio.play(ev.reason === 'time_up' ? 'game_complete' : 'game_over', 0.6);
        ui.patch({
          announcement: ev.reason === 'time_up' ? `Time is up. Final score ${this.sim.score}.` : `Your ship was destroyed. Final score ${this.sim.score}.`,
        });
        break;
      default:
        break;
    }
  }

  /** Pushes values to React only when something visible changed. */
  private syncUi(force: boolean): void {
    const snap = this.sim.snapshot();
    const timeLeft = Math.ceil(snap.timeLeft - 1e-6);
    const ui = useMatchStore.getState();
    const patch: Parameters<typeof ui.patch>[0] = {};
    if (force || ui.score !== snap.score) patch.score = snap.score;
    if (force || ui.health !== snap.health) patch.health = snap.health;
    if (force || timeLeft !== this.lastTimeLeft) {
      this.lastTimeLeft = timeLeft;
      patch.timeLeft = timeLeft;
      if (timeLeft === 10 && !this.timeWarned && snap.status === 'running') {
        this.timeWarned = true;
        audio.play('time_warning', 0.5);
        patch.announcement = '10 seconds left.';
      }
    }
    if (snap.health / snap.maxHealth <= 0.3 && snap.health > 0 && !this.lowHealthAnnounced) {
      this.lowHealthAnnounced = true;
      audio.play('health_low', 0.5);
      patch.announcement = `Hull low: ${snap.health} of ${snap.maxHealth}.`;
    }
    if (Object.keys(patch).length > 0) ui.patch(patch);
  }

  private checkFinished(now: number): void {
    if (this.sim.status === 'ended' && this.endedAtMs !== null && now - this.endedAtMs >= END_LINGER_MS) this.finish();
  }

  private finish(): void {
    if (this.finished || this.disposed) return;
    this.finished = true;
    this.input.reset();
    const snap = this.sim.snapshot();
    const { options } = this.opts;
    const player = getPlayer();
    const record: MatchRecord = {
      matchId: newId('match'),
      playerId: player.id,
      playerName: player.name,
      endedAt: new Date().toISOString(),
      score: snap.score,
      durationSeconds: Math.round(snap.elapsed * 10) / 10,
      endReason: snap.endReason ?? 'time_up',
      config: { sessionSeconds: options.sessionSeconds, spawnIntervalSeconds: options.spawnIntervalSeconds, configKey: configKey(options) },
    };
    useMatchStore.getState().patch({ phase: 'ended' });
    this.opts.onFinished(record);
  }

  // ------------------------------------------------------------------ pause

  pause(reason: 'manual' | 'focus' | 'orientation'): void {
    if (this.paused || this.disposed || this.sim.status !== 'running') return;
    this.paused = true;
    this.input.capture = false;
    this.input.reset();
    this.sim.clearInput();
    audio.play('game_pause', 0.5);
    audio.suspend();
    useMatchStore.getState().patch({ phase: 'paused', pauseReason: reason, announcement: 'Game paused.' });
  }

  /** Requires an explicit player action (button / key). Nothing from the paused period carries over. */
  resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.accumulator = 0;
    this.input.capture = true;
    this.input.reset();
    this.sim.clearInput();
    audio.resume();
    audio.play('game_resume', 0.5);
    useMatchStore.getState().patch({ phase: 'playing', pauseReason: null, announcement: 'Game resumed.' });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private onVisibility = (): void => {
    if (document.hidden) this.pause('focus');
  };
  private onBlur = (): void => this.pause('focus');

  // ------------------------------------------------------------------ input (touch)

  pressControl(control: Control, pointerId: number): void {
    if (!this.paused) this.input.press(control, pointerId);
  }
  releaseControl(control: Control, pointerId: number): void {
    this.input.release(control, pointerId);
  }

  // ------------------------------------------------------------------ misc

  private entityCount(): number {
    return 1 + this.sim.enemies.length + this.sim.projectiles.length;
  }

  rendererStats() {
    return this.renderer?.stats() ?? null;
  }

  setDebugOverlay(on: boolean): void {
    this.renderer?.setDebug(on);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    removeTestHooks(this);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    this.input.detach();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    audio.stopAllLoops();
    const app = this.app;
    this.app = null;
    if (app) {
      app.ticker.remove(this.tick);
      this.renderer?.destroy();
      this.renderer = null;
      // Textures are shared across matches, so they are intentionally kept.
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    }
  }
}
