import { useState } from 'react';
import { useHistoryQuery } from '@/api/queries';
import { useSyncStore } from '@/api/syncStore';
import { END_REASON_LABEL, formatDate, formatDuration } from '@/lib/format';
import { getPlayer } from '@/state/player';
import { EmptyBox, ErrorBox, LoadingBox } from '../components/QueryStates';
import { Pager } from '../components/Pager';

export function HistoryTab() {
  const player = getPlayer();
  const [page, setPage] = useState(1);
  const q = useHistoryQuery(player.id, page);
  const pending = useSyncStore((s) => s.pending);


  return (
    <div className="tabpanel" data-testid="history-panel">
      {pending.length > 0 ? (
        <div className="banner" role="status" data-testid="pending-banner">
          {pending.length} match{pending.length > 1 ? 'es' : ''} waiting to be saved — they will appear here once confirmed.
        </div>
      ) : null}
      {q.isPending ? (
        <LoadingBox what="your match history" />
      ) : q.isError && !q.data ? (
        <ErrorBox what="your match history" error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && q.data.total === 0 ? (
        <EmptyBox>No matches yet. Hit Play and write your first page of history!</EmptyBox>
      ) : q.data ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Your match history, page {q.data.page}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col" className="num">Duration</th>
                  <th scope="col">Ended by</th>
                  <th scope="col">Settings</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((m) => (
                  <tr key={m.matchId} data-testid="history-row">
                    <td>{formatDate(m.endedAt)}</td>
                    <td className="num">{m.score}</td>
                    <td className="num">{formatDuration(m.durationSeconds)}</td>
                    <td>{END_REASON_LABEL[m.endReason]}</td>
                    <td>{m.config.sessionSeconds}s / {m.config.spawnIntervalSeconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={q.data.page} totalPages={q.data.totalPages} onChange={setPage} label="Match history" />
        </>
      ) : null}
      {q.isError && q.data ? (
        <div className="banner error" role="alert">
          Couldn’t refresh your history — showing the last data.
          <button type="button" className="link-btn" onClick={() => void q.refetch()}>Retry</button>
        </div>
      ) : null}
      <div className="refreshing">{q.isFetching && !q.isPending ? 'Updating…' : ''}</div>
    </div>
  );
}
