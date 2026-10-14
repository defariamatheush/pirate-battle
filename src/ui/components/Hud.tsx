import { useEffect, useRef, type RefObject } from 'react';
import { formatClock } from '@/lib/format';
import { useMatchStore } from '@/state/matchStore';

/**
 * Sprite-based HUD. It re-renders only when score, whole seconds or health change
 * (the session throttles store updates), never once per frame.
 */
export function Hud({ onPause, boxRef }: { onPause: () => void; boxRef: RefObject<HTMLDivElement | null> }) {
  const score = useMatchStore((s) => s.score);
  const timeLeft = useMatchStore((s) => s.timeLeft);
  const health = useMatchStore((s) => s.health);
  const maxHealth = useMatchStore((s) => s.maxHealth);
  const announcement = useMatchStore((s) => s.announcement);
  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  const tone = ratio > 0.5 ? 'green' : ratio > 0.25 ? 'amber' : 'red';

  // Brief red vignette whenever the hull drops.
  const prev = useRef(health);
  useEffect(() => {
    if (health < prev.current && boxRef.current) {
      const el = boxRef.current;
      el.dataset.hit = 'false';
      void el.offsetWidth;
      el.dataset.hit = 'true';
    }
    prev.current = health;
  }, [health, boxRef]);

  return (
    <div className="hud" data-testid="hud">
      <div className="hud-health" aria-hidden="true">
        <div className="fill" data-tone={tone} style={{ ['--ratio' as string]: ratio }} />
        <div className="label">{health} / {maxHealth}</div>
      </div>
      <div className="hud-top-right">
        <div className="counter" aria-hidden="true" data-testid="hud-score"><img src="/assets/png/default/ui/hud/icon_score.png" alt="" />{score}</div>
        <div className="counter" aria-hidden="true" data-testid="hud-time"><img src="/assets/png/default/ui/hud/icon_time.png" alt="" />{formatClock(timeLeft)}</div>
        <button type="button" className="round-btn" onClick={onPause} aria-label="Pause" data-testid="pause-button">
          <img src="/assets/png/default/ui/controls/icon_pause.png" alt="" />
        </button>
      </div>

      {/* Semantic mirror of the HUD. Static values (not live) + a polite, event-driven message. */}
      <section className="sr-only" aria-label="Match status" data-testid="match-status">
        <dl>
          <dt>Score</dt><dd data-testid="sr-score">{score}</dd>
          <dt>Time left</dt><dd data-testid="sr-time">{formatClock(timeLeft)}</dd>
          <dt>Hull</dt><dd data-testid="sr-health">{health} of {maxHealth}</dd>
        </dl>
      </section>
      <p className="sr-only" role="status" aria-live="polite" data-testid="announcer">{announcement}</p>
    </div>
  );
}
