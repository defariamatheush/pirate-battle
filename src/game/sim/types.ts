export type ShipKind = 'player' | 'chaser' | 'shooter';
export type Team = 'player' | 'enemy';
export type EndReason = 'time_up' | 'player_destroyed';
export type MatchStatus = 'running' | 'ended';

export interface Ship {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  /** Radians. 0 = east, clockwise on screen (y grows downwards). */
  heading: number;
  speed: number;
  health: number;
  maxHealth: number;
  radius: number;
  alive: boolean;
  /** Seconds remaining until each weapon can fire again. */
  cooldowns: { front: number; left: number; right: number };
  /** Previous-step transform, used by the renderer for interpolation. */
  prevX: number;
  prevY: number;
  prevHeading: number;
}

export interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Seconds left before the projectile expires. */
  ttl: number;
  alive: boolean;
  prevX: number;
  prevY: number;
}

/** Held controls. Fire flags are "held" states; cooldowns gate the actual shots. */
export interface InputState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const EMPTY_INPUT: Readonly<InputState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

export type SimEvent =
  | { type: 'shot'; team: Team; weapon: 'front' | 'broadside'; x: number; y: number; heading: number }
  | { type: 'projectileImpact'; x: number; y: number; target: 'ship' | 'island' | 'expired' }
  | { type: 'shipDamaged'; id: number; kind: ShipKind; x: number; y: number; damage: number; health: number }
  | {
      type: 'shipDestroyed';
      id: number;
      kind: ShipKind;
      x: number;
      y: number;
      heading: number;
      cause: 'projectile' | 'collision';
      /** True when the player's attack caused the destruction (scores a point). */
      byPlayer: boolean;
    }
  | { type: 'enemySpawned'; id: number; kind: ShipKind; x: number; y: number }
  | { type: 'shipCollision'; x: number; y: number }
  | { type: 'scoreChanged'; score: number }
  | { type: 'ended'; reason: EndReason };

export interface SimSnapshot {
  status: MatchStatus;
  endReason: EndReason | null;
  elapsed: number;
  timeLeft: number;
  score: number;
  health: number;
  maxHealth: number;
  enemies: number;
}
