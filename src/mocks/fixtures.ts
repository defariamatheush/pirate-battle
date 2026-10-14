import type { MatchRecord } from '@/api/contracts';
import { Rng } from '@/game/sim/rng';

const NAMES = [
  'Captain Flint', 'Anne Bonny', 'Blackbeard', 'Calico Jack', 'Mary Read', 'Bartholomew',
  'Grace O\'Malley', 'Henry Avery', 'Ching Shih', 'Sam Bellamy', 'Stede Bonnet', 'Jean Lafitte',
  'Francis Drake', 'Black Caesar', 'Rackham', 'Morgan', 'Long Ben', 'Mad Dog',
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function parseConfigKey(key: string): { sessionSeconds: number; spawnIntervalSeconds: number } {
  const m = /^s(\d+)-i([\d.]+)$/.exec(key);
  return { sessionSeconds: m ? Number(m[1]) : 90, spawnIntervalSeconds: m ? Number(m[2]) : 4 };
}

/** Deterministic fake rivals for a configuration. Same key -> same list, always. */
export function rankingFixtures(key: string, count = 26): MatchRecord[] {
  const rng = new Rng(hash(key));
  const cfg = parseConfigKey(key);
  const maxScore = Math.max(4, Math.round(cfg.sessionSeconds / cfg.spawnIntervalSeconds));
  const out: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const score = Math.max(0, Math.round(maxScore * (1 - i / (count * 1.15)) - rng.range(0, 1.5)));
    const died = rng.next() < 0.35;
    const duration = died ? Math.round(rng.range(cfg.sessionSeconds * 0.5, cfg.sessionSeconds - 1)) : cfg.sessionSeconds;
    out.push({
      matchId: `fx-${key}-${i}`,
      playerId: `fx-player-${i}`,
      playerName: NAMES[i % NAMES.length]! + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
      endedAt: new Date(Date.UTC(2026, 8, 1 + (i % 28), 10 + (i % 9), (i * 7) % 60)).toISOString(),
      score,
      durationSeconds: duration,
      endReason: died ? 'player_destroyed' : 'time_up',
      config: { ...cfg, configKey: key },
    });
  }
  return out;
}

/** Extra history rows for the "many pages" scenario. */
export function historyFixtures(playerId: string, playerName: string, count: number): MatchRecord[] {
  const rng = new Rng(hash(playerId));
  const out: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const sessionSeconds = [60, 90, 120][i % 3]!;
    const spawnIntervalSeconds = [3, 4, 5][i % 3]!;
    const died = rng.next() < 0.4;
    out.push({
      matchId: `fx-history-${i}`,
      playerId,
      playerName,
      endedAt: new Date(Date.UTC(2026, 7, 1) + i * 3_600_000 * 7).toISOString(),
      score: Math.round(rng.range(1, 18)),
      durationSeconds: died ? Math.round(rng.range(20, sessionSeconds - 1)) : sessionSeconds,
      endReason: died ? 'player_destroyed' : 'time_up',
      config: { sessionSeconds, spawnIntervalSeconds, configKey: `s${sessionSeconds}-i${spawnIntervalSeconds}` },
    });
  }
  return out;
}
