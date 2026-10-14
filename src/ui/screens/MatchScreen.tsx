import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncStore } from '@/api/syncStore';
import { buildGameplayConfig, type GameOptions, type GameplayConfig } from '@/config/gameplay';
import { GameSession } from '@/game/GameSession';
import { loadGameTextures } from '@/game/render/assets';
import { runtimeConfig } from '@/lib/runtimeConfig';
import { useAppStore } from '@/state/appStore';
import { useMatchStore } from '@/state/matchStore';
import { useOptionsStore } from '@/state/optionsStore';
import { useResultStore } from '@/state/resultStore';
import { Button } from '../components/Button';
import { Hud } from '../components/Hud';
import { PauseDialog } from '../components/PauseDialog';
import { TouchControls } from '../components/TouchControls';
import { Panel } from '../components/Panel';

function matchConfig(options: GameOptions): GameplayConfig {
  const config = buildGameplayConfig(options);
  if (runtimeConfig.playerHp > 0) return { ...config, player: { ...config.player, maxHealth: runtimeConfig.playerHp } };
  return config;
}

function useTouchUi(): boolean {
  const [touch, setTouch] = useState(() => new URLSearchParams(window.location.search).get('touch') === '1' || window.matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setTouch(new URLSearchParams(window.location.search).get('touch') === '1' || mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

export function MatchScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const [attempt, setAttempt] = useState(0);
  const go = useAppStore((s) => s.go);
  const phase = useMatchStore((s) => s.phase);
  const loaded = useMatchStore((s) => s.loaded);
  const total = useMatchStore((s) => s.total);
  const loadError = useMatchStore((s) => s.loadError);
  const touchUi = useTouchUi();
  const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 820);

  // Orientation: matches are played in landscape. Portrait pauses the simulation.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => {
      const p = mq.matches && window.innerWidth <= 820;
      setPortrait(p);
      if (p) sessionRef.current?.pause('orientation');
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ui = useMatchStore.getState();
    ui.reset();
    ui.patch({ phase: 'loading' });
    let cancelled = false;
    let session: GameSession | null = null;

    void (async () => {
      try {
        const textures = await loadGameTextures((p) => {
          if (!cancelled) useMatchStore.getState().patch({ loaded: p.loaded, total: p.total });
        });
        if (cancelled) return;
        const options = useOptionsStore.getState().options;
        session = new GameSession({
          host,
          textures,
          config: matchConfig(options),
          options,
          seed: runtimeConfig.seed,
          onFinished: (record) => {
            useSyncStore.getState().enqueue(record);
            useResultStore.getState().setLast(record);
            useAppStore.getState().go('result');
          },
        });
        sessionRef.current = session;
        await session.init();
        if (!cancelled && window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 820) session.pause('orientation');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        useMatchStore.getState().patch({ phase: 'loadError', loadError: message });
      }
    })();

    return () => {
      cancelled = true;
      session?.dispose();
      sessionRef.current = null;
      useMatchStore.getState().reset();
    };
  }, [attempt]);

  const resume = useCallback(() => sessionRef.current?.resume(), []);
  const pause = useCallback(() => sessionRef.current?.pause('manual'), []);
  const press = useCallback((c: Parameters<GameSession['pressControl']>[0], id: number) => sessionRef.current?.pressControl(c, id), []);
  const release = useCallback((c: Parameters<GameSession['releaseControl']>[0], id: number) => sessionRef.current?.releaseControl(c, id), []);

  const ready = phase === 'playing' || phase === 'paused' || phase === 'ended';

  return (
    <main className="match" data-testid="match-screen" data-phase={phase}>
      <div className="arena-box" ref={boxRef}>
        <div className="arena-host" ref={hostRef} />
        {ready && <Hud onPause={pause} boxRef={boxRef} />}
        {ready && touchUi && <TouchControls onPress={press} onRelease={release} />}
        {runtimeConfig.showPerf && <PerfOverlay sessionRef={sessionRef} />}

        {(phase === 'loading' || phase === 'idle') && (
          <div className="match-overlay" role="status" data-testid="loading-overlay">
            <div>
              <h2>Preparing the fleet…</h2>
              <div className="progress" role="progressbar" aria-label="Loading game assets" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={loaded}>
                <span style={{ width: `${total ? (loaded / total) * 100 : 0}%` }} />
              </div>
              <p className="muted">{loaded} / {total || '…'} assets</p>
            </div>
          </div>
        )}
        {phase === 'loadError' && (
          <div className="match-overlay" data-testid="load-error">
            <Panel aria-label="Loading failed">
              <h2>Couldn’t load the game</h2>
              <p role="alert" style={{ margin: 0, textAlign: 'center' }}>
                Some game files didn’t load. Check your connection and try again.
                <br />
                <span className="muted">{loadError}</span>
              </p>
              <div className="form-actions">
                <Button onClick={() => setAttempt((n) => n + 1)} data-testid="retry-assets">Try again</Button>
                <Button variant="secondary" onClick={() => go('menu')}>Main Menu</Button>
              </div>
            </Panel>
          </div>
        )}
        <div className="rotate-guard" data-active={portrait} role="alert" aria-hidden={!portrait} data-testid="rotate-guard">
          <div>
            <div className="phone" aria-hidden="true">📱</div>
            <h2>Rotate your device</h2>
            <p>Pirate Battle is played in landscape. The match is paused.</p>
          </div>
        </div>
        <PauseDialog onResume={resume} onQuit={() => go('menu')} />
      </div>
    </main>
  );
}

function PerfOverlay({ sessionRef }: { sessionRef: React.RefObject<GameSession | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = sessionRef.current?.perf.summary();
      if (s && ref.current) ref.current.textContent = `fps ${s.avgFps.toFixed(1)}  p95 ${s.p95FrameMs.toFixed(1)}ms  max-entities ${s.maxEntities}`;
    }, 500);
    return () => window.clearInterval(t);
  }, [sessionRef]);
  return <div ref={ref} className="perf-overlay" />;
}
