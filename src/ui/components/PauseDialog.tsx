import { useEffect, useRef } from 'react';
import { useMatchStore } from '@/state/matchStore';
import { Button } from './Button';
import { ControlsHelp } from './Controls';
import { Panel } from './Panel';

const REASON_TEXT = {
  manual: 'The match is on hold.',
  focus: 'Paused because the game lost focus or the tab was hidden.',
  orientation: 'Paused because the screen was rotated to portrait.',
} as const;

/** Modal dialog (native `<dialog>`: focus trap, inert background, Esc). Resuming needs an explicit action. */
export function PauseDialog({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  const phase = useMatchStore((s) => s.phase);
  const reason = useMatchStore((s) => s.pauseReason);
  const ref = useRef<HTMLDialogElement>(null);
  const open = phase === 'paused';

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="pause-title"
      data-testid="pause-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onResume();
      }}
    >
      <Panel>
        <h2 id="pause-title">Paused</h2>
        <p style={{ margin: 0, textAlign: 'center' }}>{reason ? REASON_TEXT[reason] : ''}</p>
        <div className="form-actions">
          <Button onClick={onResume} data-autofocus data-testid="resume-button">Resume</Button>
          <Button variant="secondary" onClick={onQuit} data-testid="quit-button">Main Menu</Button>
        </div>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Quitting abandons the match; it won’t be recorded.</p>
        <ControlsHelp />
      </Panel>
    </dialog>
  );
}
