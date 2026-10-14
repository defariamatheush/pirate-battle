import { useRef, useState, type PointerEvent } from 'react';
import type { Control } from '@/game/input/InputController';

interface Props {
  onPress: (control: Control, pointerId: number) => void;
  onRelease: (control: Control, pointerId: number) => void;
}

const ICONS: Record<Control, string> = {
  forward: 'icon_forward',
  turnLeft: 'icon_turn_left',
  turnRight: 'icon_turn_right',
  fireFront: 'icon_fire_front',
  fireLeft: 'icon_fire_left',
  fireRight: 'icon_fire_right',
};
const LABELS: Record<Control, string> = {
  forward: 'Sail forward',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  fireFront: 'Fire forward',
  fireLeft: 'Fire left broadside',
  fireRight: 'Fire right broadside',
};

function HoldButton({ control, onPress, onRelease, className }: Props & { control: Control; className?: string }) {
  const [down, setDown] = useState(false);
  const active = useRef(new Set<number>());
  const end = (e: PointerEvent) => {
    if (!active.current.delete(e.pointerId)) return;
    onRelease(control, e.pointerId);
    if (active.current.size === 0) setDown(false);
  };
  return (
    <button
      type="button"
      className={`round-btn ${className ?? ''}`}
      data-testid={`touch-${control}`}
      data-down={down}
      aria-label={LABELS[control]}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic or already-released pointer: still treat as a press */
        }
        active.current.add(e.pointerId);
        setDown(true);
        onPress(control, e.pointerId);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={`/assets/png/default/ui/controls/${ICONS[control]}.png`} alt="" draggable={false} />
    </button>
  );
}

/** On-screen controls. Each button is an independent pointer target, so multi-touch works. */
export function TouchControls({ onPress, onRelease }: Props) {
  const p = { onPress, onRelease };
  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="cluster move">
        <HoldButton control="turnLeft" {...p} />
        <HoldButton control="forward" {...p} className="fwd" />
        <HoldButton control="turnRight" {...p} />
      </div>
      <div className="cluster fire">
        <HoldButton control="fireLeft" {...p} />
        <HoldButton control="fireFront" {...p} className="front" />
        <HoldButton control="fireRight" {...p} />
      </div>
    </div>
  );
}
