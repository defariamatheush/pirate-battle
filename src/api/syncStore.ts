import { create } from 'zustand';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';
import type { MatchRecord } from './contracts';

export type SyncStatus = 'queued' | 'sending' | 'failed';

export interface PendingItem {
  record: MatchRecord;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
}

const isList = (v: unknown): v is PendingItem[] => Array.isArray(v) && v.every((i) => typeof (i as PendingItem)?.record?.matchId === 'string');

interface SyncState {
  pending: PendingItem[];
  enqueue: (record: MatchRecord) => void;
  setStatus: (matchId: string, status: SyncStatus, lastError?: string) => void;
  remove: (matchId: string) => void;
}

function save(pending: PendingItem[]) {
  writeJson(STORAGE_KEYS.pending, pending);
}

/**
 * Durable queue of completed matches that were not confirmed by the server yet.
 * Items survive refreshes; anything stuck in `sending` at boot is re-queued.
 */
export const useSyncStore = create<SyncState>((set, get) => ({
  pending: readJson<PendingItem[]>(STORAGE_KEYS.pending, [], isList).map((i) => ({ ...i, status: 'queued' as const })),
  enqueue: (record) => {
    // Idempotent: a match can only be queued once.
    if (get().pending.some((i) => i.record.matchId === record.matchId)) return;
    const pending = [...get().pending, { record, status: 'queued' as const, attempts: 0 }];
    save(pending);
    set({ pending });
  },
  setStatus: (matchId, status, lastError) => {
    const pending = get().pending.map((i) =>
      i.record.matchId === matchId ? { ...i, status, lastError, attempts: status === 'sending' ? i.attempts + 1 : i.attempts } : i,
    );
    save(pending);
    set({ pending });
  },
  remove: (matchId) => {
    const pending = get().pending.filter((i) => i.record.matchId !== matchId);
    save(pending);
    set({ pending });
  },
}));
