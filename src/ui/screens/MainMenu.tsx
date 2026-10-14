import { useRef, type KeyboardEvent } from 'react';
import { useMatchSyncContext } from '../SyncContext';
import { useSyncStore } from '@/api/syncStore';
import { END_REASON_LABEL, formatDuration } from '@/lib/format';
import { audio } from '@/game/audio';
import { useAppStore, type MenuTab } from '@/state/appStore';
import { useOptionsStore } from '@/state/optionsStore';
import { useResultStore } from '@/state/resultStore';
import { Button } from '../components/Button';
import { ControlsHelp } from '../components/Controls';
import { Panel } from '../components/Panel';
import { HistoryTab } from './HistoryTab';
import { RankingTab } from './RankingTab';

const TABS: { id: MenuTab; label: string }[] = [
  { id: 'home', label: 'Play' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

export function MainMenu({ onOpenLab }: { onOpenLab: () => void }) {
  const tab = useAppStore((s) => s.menuTab);
  const setTab = useAppStore((s) => s.setMenuTab);
  const go = useAppStore((s) => s.go);
  const startMatch = useAppStore((s) => s.startMatch);
  const options = useOptionsStore((s) => s.options);
  const last = useResultStore((s) => s.last);
  const pending = useSyncStore((s) => s.pending);
  const { retry } = useMatchSyncContext();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = nextIndex[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = TABS[next]!;
    setTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  const failed = pending.filter((p) => p.status === 'failed');

  return (
    <main className="screen" data-testid="main-menu">
      <Panel aria-label="Main menu">
        <img className="title-img" src="/assets/png/default/ui/menu/title_pirate_battle.png" srcSet="/assets/png/retina/ui/menu/title_pirate_battle.png 2x" alt="Pirate Battle" />
        <p className="tagline">Set sail. Take command.</p>

        <div className="tabs" role="tablist" aria-label="Main menu sections">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel" tabIndex={-1}>
          {tab === 'home' && (
            <>
              <div className="menu-actions">
                <Button
                  onClick={() => {
                    audio.unlock();
                    startMatch();
                  }}
                  data-testid="play-button"
                >
                  Play
                </Button>
                <Button variant="primary" onClick={() => go('options')} data-testid="options-button">
                  Options
                </Button>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Match: {options.sessionSeconds}s · New enemy every {options.spawnIntervalSeconds}s
              </p>
              {pending.length > 0 && (
                <div className={`banner ${failed.length ? 'error' : ''}`} role="status" data-testid="pending-banner">
                  <span>
                    {pending.length} match{pending.length > 1 ? 'es' : ''} not saved yet
                    {failed.length ? ' — the last attempt failed.' : ' — saving…'}
                  </span>
                  <button type="button" className="link-btn" onClick={retry}>
                    Retry now
                  </button>
                </div>
              )}
              {last && (
                <div className="last-card" data-testid="last-result-card">
                  <span>
                    Last match: <strong>{last.record.score} pts</strong> · {formatDuration(last.record.durationSeconds)} · {END_REASON_LABEL[last.record.endReason]}
                  </span>
                  <button type="button" className="link-btn" onClick={() => go('result')} data-testid="view-last-result">
                    View result
                  </button>
                </div>
              )}
              <ControlsHelp />
            </>
          )}
          {tab === 'ranking' && <RankingTab options={options} />}
          {tab === 'history' && <HistoryTab />}
        </div>

        <div className="menu-footer">
          <button type="button" className="link-btn" onClick={onOpenLab} data-testid="open-lab">
            Network scenarios
          </button>
          <SoundToggle />
        </div>
      </Panel>
    </main>
  );
}

function SoundToggle() {
  // Audio state lives outside React; a local re-render key keeps the label in sync.
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className="link-btn"
      aria-pressed={audio.muted}
      onClick={() => {
        audio.setMuted(!audio.muted);
        if (ref.current) {
          ref.current.setAttribute('aria-pressed', String(audio.muted));
          ref.current.textContent = audio.muted ? 'Sound: off' : 'Sound: on';
        }
      }}
    >
      {audio.muted ? 'Sound: off' : 'Sound: on'}
    </button>
  );
}
