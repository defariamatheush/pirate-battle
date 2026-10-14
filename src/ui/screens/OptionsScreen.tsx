import { useId, useState, type FormEvent } from 'react';
import { OPTION_LIMITS, DEFAULT_OPTIONS, validateOptions } from '@/config/gameplay';
import { useAppStore } from '@/state/appStore';
import { useOptionsStore } from '@/state/optionsStore';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';

export function OptionsScreen() {
  const go = useAppStore((s) => s.go);
  const saved = useOptionsStore((s) => s.options);
  const save = useOptionsStore((s) => s.save);
  const [session, setSession] = useState(String(saved.sessionSeconds));
  const [spawn, setSpawn] = useState(String(saved.spawnIntervalSeconds));
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState('');
  const id = useId();

  const { ok, errors } = validateOptions({ sessionSeconds: session.trim() === '' ? '' : Number(session), spawnIntervalSeconds: spawn.trim() === '' ? '' : Number(spawn) });
  const L = OPTION_LIMITS;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ok) {
      setMessage('');
      return;
    }
    save({ sessionSeconds: Number(session), spawnIntervalSeconds: Number(spawn) });
    setMessage('Options saved. They apply to your next match.');
  };

  return (
    <main className="screen" data-testid="options-screen">
      <Panel aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Options</h2>
        <form className="form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-session`}>Game session time (seconds)</label>
            <input
              id={`${id}-session`}
              name="sessionSeconds"
              inputMode="numeric"
              type="number"
              min={L.sessionSeconds.min}
              max={L.sessionSeconds.max}
              step={L.sessionSeconds.step}
              value={session}
              onChange={(e) => { setSession(e.target.value); setMessage(''); }}
              aria-invalid={touched && !!errors.sessionSeconds}
              aria-describedby={`${id}-session-hint ${id}-session-err`}
            />
            <span id={`${id}-session-hint`} className="hint">Whole seconds, {L.sessionSeconds.min}–{L.sessionSeconds.max}.</span>
            <span id={`${id}-session-err`} className="error" role={touched && errors.sessionSeconds ? 'alert' : undefined}>
              {touched ? errors.sessionSeconds : ''}
            </span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-spawn`}>Enemy spawn time (seconds)</label>
            <input
              id={`${id}-spawn`}
              name="spawnIntervalSeconds"
              inputMode="decimal"
              type="number"
              min={L.spawnIntervalSeconds.min}
              max={L.spawnIntervalSeconds.max}
              step={L.spawnIntervalSeconds.step}
              value={spawn}
              onChange={(e) => { setSpawn(e.target.value); setMessage(''); }}
              aria-invalid={touched && !!errors.spawnIntervalSeconds}
              aria-describedby={`${id}-spawn-hint ${id}-spawn-err`}
            />
            <span id={`${id}-spawn-hint`} className="hint">A new enemy appears every {L.spawnIntervalSeconds.min}–{L.spawnIntervalSeconds.max} seconds.</span>
            <span id={`${id}-spawn-err`} className="error" role={touched && errors.spawnIntervalSeconds ? 'alert' : undefined}>
              {touched ? errors.spawnIntervalSeconds : ''}
            </span>
          </div>
          <p className="saved-msg" role="status" data-testid="options-status">{message}</p>
          <div className="form-actions">
            <Button type="submit" data-testid="save-options">Save</Button>
            <Button variant="secondary" onClick={() => go('menu')} data-testid="back-button">Back</Button>
          </div>
          <div className="form-actions">
            <button type="button" className="link-btn" onClick={() => { setSession(String(DEFAULT_OPTIONS.sessionSeconds)); setSpawn(String(DEFAULT_OPTIONS.spawnIntervalSeconds)); setMessage(''); }}>
              Restore defaults
            </button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
