import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '@/api/contracts';
import { compareRanking } from './db';
import { rankingFixtures } from './fixtures';

const rec = (over: Partial<MatchRecord>): MatchRecord => ({
  matchId: 'a',
  playerId: 'p',
  playerName: 'P',
  endedAt: '2026-01-01T00:00:00.000Z',
  score: 5,
  durationSeconds: 60,
  endReason: 'time_up',
  config: { sessionSeconds: 60, spawnIntervalSeconds: 4, configKey: 's60-i4' },
  ...over,
});

describe('ranking order', () => {
  it('sorts by score desc, then duration asc, then earlier end, then matchId', () => {
    const list = [
      rec({ matchId: 'd', score: 3 }),
      rec({ matchId: 'c', score: 5, durationSeconds: 60, endedAt: '2026-01-02T00:00:00.000Z' }),
      rec({ matchId: 'b', score: 5, durationSeconds: 40 }),
      rec({ matchId: 'a2', score: 5, durationSeconds: 60 }),
      rec({ matchId: 'a1', score: 5, durationSeconds: 60 }),
    ].sort(compareRanking);
    expect(list.map((r) => r.matchId)).toEqual(['b', 'a1', 'a2', 'c', 'd']);
  });

  it('is a total, stable order regardless of input order', () => {
    const fx = rankingFixtures('s90-i4');
    const a = [...fx].sort(compareRanking).map((r) => r.matchId);
    const b = [...fx].reverse().sort(compareRanking).map((r) => r.matchId);
    expect(a).toEqual(b);
  });

  it('fixtures are deterministic per configuration', () => {
    expect(rankingFixtures('s90-i4')).toEqual(rankingFixtures('s90-i4'));
    expect(rankingFixtures('s90-i4')).not.toEqual(rankingFixtures('s60-i2'));
  });
});
