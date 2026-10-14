import { create } from 'zustand';

export type MatchPhase = 'idle' | 'loading' | 'loadError' | 'playing' | 'paused' | 'ended';
export type PauseReason = 'manual' | 'focus' | 'orientation' | null;

/**
 * Low-frequency mirror of the simulation for React (HUD, dialogs, screen-reader text).
 * The session writes to it only when a displayed value actually changes — never every frame.
 */
interface MatchUiState {
  phase: MatchPhase;
  pauseReason: PauseReason;
  loaded: number;
  total: number;
  loadError: string | null;
  score: number;
  /** Whole seconds, rounded up. */
  timeLeft: number;
  health: number;
  maxHealth: number;
  /** Latest polite screen-reader message. */
  announcement: string;
  patch: (p: Partial<Omit<MatchUiState, 'patch' | 'reset'>>) => void;
  reset: () => void;
}

const INITIAL = {
  phase: 'idle' as MatchPhase,
  pauseReason: null as PauseReason,
  loaded: 0,
  total: 0,
  loadError: null as string | null,
  score: 0,
  timeLeft: 0,
  health: 0,
  maxHealth: 1,
  announcement: '',
};

export const useMatchStore = create<MatchUiState>((set) => ({
  ...INITIAL,
  patch: (p) => set(p),
  reset: () => set({ ...INITIAL }),
}));
