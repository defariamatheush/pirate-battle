import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';

const BASE = import.meta.env.BASE_URL;

export type SoundName =
  | 'cannon_fire_1' | 'cannon_fire_2' | 'cannon_fire_3' | 'cannon_broadside'
  | 'cannonball_water_hit_1' | 'cannonball_water_hit_2'
  | 'ship_wood_hit_1' | 'ship_wood_hit_2' | 'ship_explosion_1' | 'ship_explosion_2'
  | 'ship_collision' | 'ship_sinking' | 'score_point' | 'health_low' | 'time_warning'
  | 'game_start' | 'game_over' | 'game_complete' | 'game_pause' | 'game_resume'
  | 'ui_click' | 'ui_hover' | 'ui_back' | 'ui_open' | 'ui_close'
  | 'ocean_ambience_loop' | 'ship_sailing_loop';

/**
 * Tiny WebAudio wrapper. Loading is lazy and best-effort: audio failures never
 * block gameplay. Looping sounds are tracked so `stopAll` can release them.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
  private loops = new Map<SoundName, AudioBufferSourceNode>();
  private master: GainNode | null = null;
  muted = readJson<boolean>(STORAGE_KEYS.muted, false, (v): v is boolean => typeof v === 'boolean');

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Call from a user gesture (e.g. pressing Play) so browsers allow playback. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeJson(STORAGE_KEYS.muted, muted);
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  private load(name: SoundName): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ensure();
      p = ctx
        ? fetch(`${BASE}assets/sounds/${name}.wav`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(name, p);
    }
    return p;
  }

  preload(names: SoundName[]): void {
    for (const n of names) void this.load(n);
  }

  play(name: SoundName, volume = 0.6): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    void this.load(name).then((buffer) => {
      if (!buffer || !this.master) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buffer;
      src.connect(gain).connect(this.master);
      src.start();
    });
  }

  loop(name: SoundName, volume = 0.25): void {
    const ctx = this.ensure();
    if (!ctx || this.loops.has(name)) return;
    // Reserve the slot synchronously so repeated calls do not stack loops.
    const placeholder = {} as AudioBufferSourceNode;
    this.loops.set(name, placeholder);
    void this.load(name).then((buffer) => {
      if (!buffer || !this.master || this.loops.get(name) !== placeholder) {
        if (this.loops.get(name) === placeholder) this.loops.delete(name);
        return;
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain).connect(this.master);
      src.start();
      this.loops.set(name, src);
    });
  }

  stopLoop(name: SoundName): void {
    const src = this.loops.get(name);
    this.loops.delete(name);
    try {
      src?.stop?.();
    } catch {
      /* already stopped */
    }
  }

  stopAllLoops(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
  }

  suspend(): void {
    void this.ctx?.suspend().catch(() => undefined);
  }
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }
}

export const audio = new AudioManager();

export function playUiClick(): void {
  audio.play('ui_click', 0.4);
}
