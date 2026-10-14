/** Keyboard + touch control reference, shown in the main menu and the pause dialog. */
export function ControlsHelp() {
  return (
    <div className="controls-card" data-testid="controls-help">
      <h3>Controls</h3>
      <dl className="controls-grid">
        <dt>Sail forward</dt>
        <dd><kbd>W</kbd> or <kbd>↑</kbd></dd>
        <dt>Turn</dt>
        <dd><kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd></dd>
        <dt>Fire forward</dt>
        <dd><kbd>Space</kbd></dd>
        <dt>Broadside</dt>
        <dd><kbd>Q</kbd> left · <kbd>E</kbd> right (3 cannonballs)</dd>
        <dt>Pause</dt>
        <dd><kbd>Esc</kbd> or <kbd>P</kbd></dd>
        <dt>Touch</dt>
        <dd>On-screen buttons: turn, sail, and three cannons. Hold several at once.</dd>
      </dl>
    </div>
  );
}
