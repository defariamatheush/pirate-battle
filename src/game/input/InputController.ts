import type { InputState } from '../sim/types';
import { EMPTY_INPUT } from '../sim/types';

export type Control = keyof InputState;

const KEY_MAP: Record<string, Control> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowLeft: 'turnLeft',
  KeyA: 'turnLeft',
  ArrowRight: 'turnRight',
  KeyD: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

/**
 * Collects keyboard and touch input into a single "held controls" state.
 * Listeners exist only between `attach()` and `detach()` — i.e. while the
 * gameplay context is active — so keys are never captured on menus.
 */
export class InputController {
  readonly state: InputState = { ...EMPTY_INPUT };
  private keysHeld = new Map<string, Control>();
  private touchHeld = new Map<Control, Set<number>>();
  private taps = new Set<Control>();
  private attached = false;
  /** When false (paused) only the pause keys are handled, so dialogs keep normal keyboard behaviour. */
  capture = true;
  /** Callbacks for non-held actions. */
  onPauseToggle?: () => void;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.reset();
  }

  /** Releases every held control (pause, blur, match end…). */
  reset(): void {
    this.taps.clear();
    this.keysHeld.clear();
    this.touchHeld.clear();
    Object.assign(this.state, EMPTY_INPUT);
  }

  /**
   * Input for the next simulation frame: held controls plus anything pressed since the
   * previous poll, so a tap shorter than one frame still fires once.
   */
  poll(): InputState {
    const out = { ...this.state };
    for (const c of this.taps) out[c] = true;
    this.taps.clear();
    return out;
  }

  /** Touch / on-screen button support: `pointerId` lets several fingers hold the same control. */
  press(control: Control, pointerId: number): void {
    let set = this.touchHeld.get(control);
    if (!set) this.touchHeld.set(control, (set = new Set()));
    set.add(pointerId);
    this.taps.add(control);
    this.recompute();
  }

  release(control: Control, pointerId: number): void {
    this.touchHeld.get(control)?.delete(pointerId);
    this.recompute();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) this.onPauseToggle?.();
      e.preventDefault();
      return;
    }
    if (!this.capture) return;
    const control = KEY_MAP[e.code];
    if (!control || e.ctrlKey || e.metaKey || e.altKey) return;
    // Keep Space / arrows from scrolling or activating focused buttons while playing.
    e.preventDefault();
    this.keysHeld.set(e.code, control);
    this.taps.add(control);
    this.recompute();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.keysHeld.delete(e.code)) this.recompute();
  };

  private recompute(): void {
    const next = { ...EMPTY_INPUT } as InputState;
    for (const control of this.keysHeld.values()) next[control] = true;
    for (const [control, ids] of this.touchHeld) if (ids.size > 0) next[control] = true;
    Object.assign(this.state, next);
  }
}
