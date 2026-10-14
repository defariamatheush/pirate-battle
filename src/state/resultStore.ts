import { create } from 'zustand';
import type { MatchRecord } from '@/api/contracts';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';

/** Result of the last completed match, persisted across refreshes. */
export interface LastResult {
  record: MatchRecord;
  registered: boolean;
}

const isLast = (v: unknown): v is LastResult | null =>
  v === null || (typeof v === 'object' && typeof (v as LastResult).record?.matchId === 'string');

interface ResultState {
  last: LastResult | null;
  setLast: (record: MatchRecord) => void;
  markRegistered: (matchId: string) => void;
}

export const useResultStore = create<ResultState>((set, get) => ({
  last: readJson<LastResult | null>(STORAGE_KEYS.lastResult, null, isLast),
  setLast: (record) => {
    const last = { record, registered: false };
    writeJson(STORAGE_KEYS.lastResult, last);
    set({ last });
  },
  markRegistered: (matchId) => {
    const cur = get().last;
    if (!cur || cur.record.matchId !== matchId) return;
    const last = { ...cur, registered: true };
    writeJson(STORAGE_KEYS.lastResult, last);
    set({ last });
  },
}));
