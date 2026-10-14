import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/lib/storage';

export const SCENARIOS = [
  { id: 'success', label: 'Success', description: 'Everything works, with a short realistic latency.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history return no items.' },
  { id: 'many-pages', label: 'Many pages', description: 'Ranking with 200 entries and a 40-match history.' },
  { id: 'slow', label: 'Slow network', description: 'Every response takes ~2.5 s.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded random latency between 100 ms and 2 s.' },
  { id: 'out-of-order', label: 'Out-of-order responses', description: 'Every other GET is slow (~2.5 s), so newer replies overtake older ones.' },
  { id: 'timeout', label: 'Timeout (GET)', description: 'Ranking and history never answer; Axios times out.' },
  { id: 'network-error', label: 'Connection failure', description: 'Requests fail at the network level.' },
  { id: 'http-4xx', label: 'HTTP 4xx', description: 'Every call answers 400/404/429 style errors.' },
  { id: 'http-5xx', label: 'HTTP 5xx', description: 'Every call answers 500.' },
  { id: 'ranking-fail', label: 'Ranking fails', description: 'Only GET /ranking fails (500).' },
  { id: 'history-fail', label: 'History fails', description: 'Only GET /matches fails (500).' },
  {
    id: 'post-timeout-after-commit',
    label: 'Timeout after saving',
    description: 'First POST is stored but never answers; the retry must not duplicate it.',
  },
  {
    id: 'post-unavailable',
    label: 'Save unavailable',
    description: 'POST /matches answers 503 until you switch to another scenario.',
  },
  { id: 'assets-flaky', label: 'Flaky game assets', description: 'The first request for each ship image fails.' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export interface MockSettings {
  scenario: ScenarioId;
  /** Seed for variable latency. */
  seed: number;
  /** Multiplies every simulated delay (tests use 0). */
  latencyScale: number;
}

const DEFAULTS: MockSettings = { scenario: 'success', seed: 1, latencyScale: 1 };

const isSettings = (v: unknown): v is MockSettings =>
  typeof v === 'object' && v !== null && SCENARIOS.some((s) => s.id === (v as MockSettings).scenario);

let settings: MockSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export function initMockSettings(search = window.location.search): void {
  settings = { ...DEFAULTS, ...readJson<MockSettings>(STORAGE_KEYS.mockScenario, DEFAULTS, isSettings) };
  const p = new URLSearchParams(search);
  const scenario = p.get('scenario');
  if (scenario && SCENARIOS.some((s) => s.id === scenario)) settings.scenario = scenario as ScenarioId;
  if (p.has('mockSeed')) settings.seed = Number(p.get('mockSeed')) || 1;
  if (p.has('mockLatency')) settings.latencyScale = Math.max(0, Number(p.get('mockLatency')) || 0);
  persist();
}

function persist(): void {
  writeJson(STORAGE_KEYS.mockScenario, settings);
}

export function getMockSettings(): MockSettings {
  return settings;
}

export function updateMockSettings(patch: Partial<MockSettings>): void {
  settings = { ...settings, ...patch };
  persist();
  resetCounters();
  listeners.forEach((l) => l());
}

export function resetMockSettings(): void {
  settings = { ...DEFAULTS, latencyScale: settings.latencyScale };
  removeKey(STORAGE_KEYS.mockScenario);
  persist();
  resetCounters();
  listeners.forEach((l) => l());
}

export function subscribeMockSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- per-scenario counters (in memory; reset whenever the scenario changes) ----
const counters = new Map<string, number>();
export function bump(key: string): number {
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return n;
}
export function resetCounters(): void {
  counters.clear();
}
