import type { HistoryPage, MatchRecord, RankingEntry, RankingPage } from '@/api/contracts';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/lib/storage';
import { historyFixtures, rankingFixtures } from './fixtures';

interface DbShape {
  matches: MatchRecord[];
}

const isDb = (v: unknown): v is DbShape => typeof v === 'object' && v !== null && Array.isArray((v as DbShape).matches);

function load(): DbShape {
  return readJson<DbShape>(STORAGE_KEYS.mockDb, { matches: [] }, isDb);
}

/** Ranking order: score desc, duration asc (faster wins), earlier finish, then matchId (total order). */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return (
    b.score - a.score ||
    a.durationSeconds - b.durationSeconds ||
    a.endedAt.localeCompare(b.endedAt) ||
    a.matchId.localeCompare(b.matchId)
  );
}

function paginate<T>(all: T[], page: number, pageSize: number) {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { items: all.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageSize, total, totalPages };
}

export const db = {
  /** Idempotent insert. */
  insert(record: MatchRecord): { record: MatchRecord; created: boolean } {
    const state = load();
    const existing = state.matches.find((m) => m.matchId === record.matchId);
    if (existing) return { record: existing, created: false };
    state.matches.push(record);
    writeJson(STORAGE_KEYS.mockDb, state);
    return { record, created: true };
  },
  has(matchId: string): boolean {
    return load().matches.some((m) => m.matchId === matchId);
  },
  ranking(configKey: string, page: number, pageSize: number, fixtureCount: number): RankingPage {
    const rivals = fixtureCount > 0 ? rankingFixtures(configKey, fixtureCount) : [];
    const mine = load().matches.filter((m) => m.config.configKey === configKey);
    const sorted = [...rivals, ...mine].sort(compareRanking);
    const ranked: RankingEntry[] = sorted.map((m, i) => ({ ...m, rank: i + 1 }));
    return paginate(ranked, page, pageSize);
  },
  history(playerId: string, playerName: string, page: number, pageSize: number, fixtureCount: number): HistoryPage {
    const extra = fixtureCount > 0 ? historyFixtures(playerId, playerName, fixtureCount) : [];
    const mine = load().matches.filter((m) => m.playerId === playerId);
    const sorted = [...extra, ...mine].sort((a, b) => b.endedAt.localeCompare(a.endedAt) || a.matchId.localeCompare(b.matchId));
    return paginate(sorted, page, pageSize);
  },
  reset(): void {
    removeKey(STORAGE_KEYS.mockDb);
  },
  count(): number {
    return load().matches.length;
  },
};
