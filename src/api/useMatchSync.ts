import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResultStore } from '@/state/resultStore';
import { describeError, postMatch } from './client';
import type { MatchRecord } from './contracts';
import { useSyncStore } from './syncStore';

/**
 * Mounted once at the app root. Sends queued matches through a TanStack Query
 * mutation (serialised via `scope`, retried with back-off) and keeps the durable
 * queue, the last-result flag and the Ranking/History caches in sync.
 */
export function useMatchSync(): { flush: () => void } {
  const queryClient = useQueryClient();
  const inFlight = useRef(new Set<string>());

  const mutation = useMutation({
    mutationKey: ['record-match'],
    scope: { id: 'record-match' },
    mutationFn: (record: MatchRecord) => postMatch(record),
  });
  const { mutateAsync } = mutation;

  const send = useCallback(
    async (record: MatchRecord) => {
      const id = record.matchId;
      if (inFlight.current.has(id)) return; // repeated clicks / effects never double-send
      inFlight.current.add(id);
      useSyncStore.getState().setStatus(id, 'sending');
      try {
        await mutateAsync(record);
        useSyncStore.getState().remove(id);
        useResultStore.getState().markRegistered(id);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['ranking'] }),
          queryClient.invalidateQueries({ queryKey: ['history'] }),
        ]);
      } catch (error) {
        useSyncStore.getState().setStatus(id, 'failed', describeError(error));
      } finally {
        inFlight.current.delete(id);
      }
    },
    [mutateAsync, queryClient],
  );

  const flush = useCallback(() => {
    for (const item of useSyncStore.getState().pending) {
      if (item.status !== 'sending') void send(item.record);
    }
  }, [send]);

  // New items (and items restored after a refresh) are picked up automatically.
  useEffect(() => {
    flush();
    return useSyncStore.subscribe((state, prev) => {
      if (state.pending.length > prev.pending.length) flush();
    });
  }, [flush]);

  // Recover when connectivity returns.
  useEffect(() => {
    const onOnline = () => {
      for (const i of useSyncStore.getState().pending) if (i.status === 'failed') useSyncStore.getState().setStatus(i.record.matchId, 'queued');
      flush();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  const retry = useCallback(() => {
    for (const i of useSyncStore.getState().pending) if (i.status === 'failed') useSyncStore.getState().setStatus(i.record.matchId, 'queued');
    flush();
  }, [flush]);

  return { flush: retry };
}
