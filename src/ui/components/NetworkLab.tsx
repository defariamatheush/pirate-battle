import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SCENARIOS, getMockSettings, subscribeMockSettings, updateMockSettings, type ScenarioId } from '@/mocks/scenarios';
import { resetMocks } from '@/mocks/browser';
import { useSyncStore } from '@/api/syncStore';
import { Button } from './Button';
import { Panel } from './Panel';
import { useResultStore } from '@/state/resultStore';

/** Dialog to pick the simulated network scenario and reset mock data. Works in production builds too. */
export function NetworkLab({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const settings = useSyncExternalStore(subscribeMockSettings, getMockSettings);
  const queryClient = useQueryClient();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const choose = (id: ScenarioId) => {
    updateMockSettings({ scenario: id });
    void queryClient.invalidateQueries();
  };

  return (
    <dialog ref={ref} aria-labelledby="lab-title" data-testid="network-lab" onClose={onClose} onCancel={onClose}>
      <Panel>
        <h2 id="lab-title">Network scenarios</h2>
        <p className="muted" style={{ margin: 0 }}>
          Simulates the ranking / history API (MSW). The selection is saved and also available as <code>?scenario=&lt;id&gt;</code>.
        </p>
        <fieldset className="radio-list">
          <legend>Scenario</legend>
          {SCENARIOS.map((s) => (
            <label key={s.id} className="radio-item">
              <input type="radio" name="scenario" value={s.id} checked={settings.scenario === s.id} onChange={() => choose(s.id)} />
              <span>
                {s.label}
                <small>{s.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <Button
            variant="secondary"
            small
            data-testid="reset-mocks"
            onClick={() => {
              resetMocks();
              useSyncStore.setState({ pending: [] });
              try { window.localStorage.removeItem('pb.pending.v1'); window.localStorage.removeItem('pb.lastResult.v1'); } catch { /* ignore */ }
              useResultStore.setState({ last: null });
              void queryClient.resetQueries();
            }}
          >
            Reset
          </Button>
          <Button small onClick={onClose} data-autofocus data-testid="close-lab">Close</Button>
        </div>
        <p className="muted" style={{ margin: 0 }}>Reset clears confirmed mock records, queued matches, the last result and restores the “Success” scenario.</p>
      </Panel>
    </dialog>
  );
}
