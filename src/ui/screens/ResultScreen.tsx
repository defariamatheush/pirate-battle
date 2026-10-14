import { useSyncStore } from '@/api/syncStore';
import { END_REASON_LABEL, formatDate, formatDuration } from '@/lib/format';
import { useAppStore } from '@/state/appStore';
import { useResultStore } from '@/state/resultStore';
import { audio } from '@/game/audio';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';
import { useMatchSyncContext } from '../SyncContext';

export function ResultScreen() {
  const last = useResultStore((s) => s.last);
  const go = useAppStore((s) => s.go);
  const startMatch = useAppStore((s) => s.startMatch);
  const pendingItem = useSyncStore((s) => s.pending.find((p) => p.record.matchId === last?.record.matchId));
  const { retry } = useMatchSyncContext();

  if (!last) {
    return (
      <main className="screen" data-testid="result-screen">
        <Panel aria-label="Result">
          <h2>No result yet</h2>
          <p>Play a match to see your score here.</p>
          <Button onClick={() => go('menu')}>Main Menu</Button>
        </Panel>
      </main>
    );
  }
  const r = last.record;
  const won = r.endReason === 'time_up';

  let status: { text: string; tone: 'ok' | 'wait' | 'error'; retry?: boolean };
  if (last.registered) status = { text: 'Saved to your match history and the ranking.', tone: 'ok' };
  else if (pendingItem?.status === 'failed') status = { text: `Couldn’t save this match yet (${pendingItem.lastError ?? 'unknown error'}). It stays queued on this device.`, tone: 'error', retry: true };
  else status = { text: 'Saving your match…', tone: 'wait' };

  return (
    <main className="screen" data-testid="result-screen">
      <Panel aria-labelledby="result-title">
        <h2 id="result-title" data-testid="result-title">{won ? 'Voyage complete!' : 'Ship sunk!'}</h2>
        <dl className="result-grid">
          <div><dt>Score</dt><dd data-testid="result-score">{r.score}</dd></div>
          <div><dt>Time played</dt><dd data-testid="result-duration">{formatDuration(r.durationSeconds)}</dd></div>
          <div><dt>Ended by</dt><dd className="small" data-testid="result-reason">{END_REASON_LABEL[r.endReason]}</dd></div>
        </dl>
        <p className="muted" style={{ margin: 0 }}>
          {formatDate(r.endedAt)} · {r.config.sessionSeconds}s session · enemy every {r.config.spawnIntervalSeconds}s
        </p>
        <div className={`banner ${status.tone === 'error' ? 'error' : ''}`} role={status.tone === 'error' ? 'alert' : 'status'} data-testid="registration-status" data-state={last.registered ? 'saved' : (pendingItem?.status ?? 'queued')}>
          <span>{status.text}</span>
          {status.retry && <button type="button" className="link-btn" onClick={retry} data-testid="retry-save">Retry</button>}
        </div>
        <div className="form-actions">
          <Button onClick={() => { audio.unlock(); startMatch(); }} data-testid="play-again">Play Again</Button>
          <Button variant="secondary" onClick={() => go('menu')} data-testid="main-menu-button">Main Menu</Button>
        </div>
      </Panel>
    </main>
  );
}
