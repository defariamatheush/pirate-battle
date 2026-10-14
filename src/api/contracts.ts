import type { EndReason } from '@/game/sim/types';

/** Gameplay configuration a match was played with (ranking compares only equal `configKey`s). */
export interface MatchConfigSnapshot {
  sessionSeconds: number;
  spawnIntervalSeconds: number;
  configKey: string;
}

/** A completed match as stored by the (mocked) backend. */
export interface MatchRecord {
  matchId: string;
  playerId: string;
  playerName: string;
  /** ISO-8601 timestamp of the match end. */
  endedAt: string;
  score: number;
  /** Effective seconds of active play. */
  durationSeconds: number;
  endReason: EndReason;
  config: MatchConfigSnapshot;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RankingEntry extends MatchRecord {
  /** 1-based position across the whole ranking, not just this page. */
  rank: number;
}

export type RankingPage = Page<RankingEntry>;
export type HistoryPage = Page<MatchRecord>;

/** `POST /api/matches` — idempotent on `matchId`. */
export interface RecordMatchResponse {
  record: MatchRecord;
  /** false when the record already existed (retry / repeated submit). */
  created: boolean;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export const PAGE_SIZE = 8;
