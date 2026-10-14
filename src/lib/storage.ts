/** Defensive localStorage helpers (private mode / blocked storage must not crash the game). */
export function readJson<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep running with in-memory state */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  options: 'pb.options.v1',
  lastResult: 'pb.lastResult.v1',
  pending: 'pb.pending.v1',
  player: 'pb.player.v1',
  muted: 'pb.muted.v1',
  mockDb: 'pb.mock.db.v1',
  mockScenario: 'pb.mock.scenario.v1',
} as const;
