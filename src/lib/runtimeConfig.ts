/**
 * Runtime knobs. Defaults come from Vite env vars (see `.env.example`); URL
 * parameters override them so tests and demos can tune behaviour without a rebuild.
 */
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

function num(urlKey: string, envValue: string | undefined, fallback: number): number {
  const raw = params.get(urlKey) ?? envValue;
  const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const runtimeConfig = {
  /** Axios timeout for every API call. */
  apiTimeoutMs: num('apiTimeout', import.meta.env.VITE_API_TIMEOUT_MS, 8000),
  /** Base delay of the retry back-off (doubles each attempt). 0 disables waiting. */
  retryBaseDelayMs: num('retryDelay', import.meta.env.VITE_RETRY_BASE_DELAY_MS, 800),
  /** Retries for queries and for the record-match mutation. */
  maxRetries: num('retries', import.meta.env.VITE_MAX_RETRIES, 2),
  /** Test instrumentation (`window.__PIRATE_TEST__`) and deterministic seed. */
  e2e: params.get('e2e') === '1',
  /** With e2e, the simulation only advances through `__PIRATE_TEST__.advance(ms)`. */
  manualClock: params.get('clock') === 'manual',
  seed: num('seed', undefined, 1),
  /** Test-only (needs e2e=1): overrides the player's max health so time-limit scenarios are deterministic. */
  playerHp: params.get('e2e') === '1' ? num('playerHp', undefined, 0) : 0,
  showPerf: params.get('perf') === '1',
} as const;
