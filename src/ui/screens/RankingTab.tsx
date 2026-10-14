import { useState } from 'react';
import { PAGE_SIZE } from '@/api/contracts';
import { useRankingQuery } from '@/api/queries';
import { configKey, type GameOptions } from '@/config/gameplay';
import { END_REASON_LABEL, formatDuration } from '@/lib/format';
import { getPlayer } from '@/state/player';
import { EmptyBox, ErrorBox, LoadingBox } from '../components/QueryStates';
import { Pager } from '../components/Pager';

export function RankingTab({ options }: { options: GameOptions }) {
  const key = configKey(options);
  const [page, setPage] = useState(1);
  const me = getPlayer().id;
  const q = useRankingQuery(key, page);


  return (
    <div className="tabpanel" data-testid="ranking-panel">
      <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
        Matches with the same settings only: <strong>{options.sessionSeconds}s</strong> sessions, an enemy every{' '}
        <strong>{options.spawnIntervalSeconds}s</strong>.
      </p>
      {q.isPending ? (
        <LoadingBox what="the ranking" />
      ) : q.isError && !q.data ? (
        <ErrorBox what="the ranking" error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && q.data.total === 0 ? (
        <EmptyBox>No scores yet for these settings. Be the first captain on the board!</EmptyBox>
      ) : q.data ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Ranking, page {q.data.page}</caption>
              <thead>
                <tr>
                  <th scope="col" className="num">#</th>
                  <th scope="col">Player</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col" className="num">Time</th>
                  <th scope="col">Ended by</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((e) => (
                  <tr key={e.matchId} className={e.playerId === me ? 'me' : undefined} data-testid="ranking-row">
                    <td className="num">{e.rank}</td>
                    <td>
                      {e.playerName}
                      {e.playerId === me ? ' (you)' : ''}
                    </td>
                    <td className="num">{e.score}</td>
                    <td className="num">{formatDuration(e.durationSeconds)}</td>
                    <td>{END_REASON_LABEL[e.endReason]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={q.data.page} totalPages={q.data.totalPages} onChange={setPage} label="Ranking" />
          <p className="muted" style={{ margin: 0 }}>
            {q.data.total} entries · {PAGE_SIZE} per page · ties: faster time wins
          </p>
        </>
      ) : null}
      {q.isError && q.data ? (
        <div className="banner error" role="alert">
          Couldn’t refresh the ranking — showing the last data.
          <button type="button" className="link-btn" onClick={() => void q.refetch()}>Retry</button>
        </div>
      ) : null}
      <div className="refreshing" aria-hidden={!q.isFetching || q.isPending}>
        {q.isFetching && !q.isPending ? 'Updating…' : ''}
      </div>
    </div>
  );
}
