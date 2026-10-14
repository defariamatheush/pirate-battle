/**
 * Central, typed gameplay configuration. Every balancing number lives here;
 * the simulation systems only read from a `GameplayConfig` snapshot.
 *
 * World units: the arena is 1600x900 units. Speeds are units/second, angles are
 * radians, turn rates are radians/second, times are seconds.
 */

export interface WeaponConfig {
  damage: number;
  /** Minimum time between two shots of this weapon. */
  cooldown: number;
  projectileSpeed: number;
  /** Projectile life span; range = speed * lifetime. */
  projectileLifetime: number;
  projectileRadius: number;
}

export interface BroadsideConfig extends WeaponConfig {
  /** Number of parallel projectiles fired per broadside. */
  count: number;
  /** Distance between two neighbouring projectiles, along the hull. */
  spacing: number;
}

export interface GameplayConfig {
  sessionSeconds: number;
  arena: { width: number; height: number };
  player: {
    maxHealth: number;
    maxSpeed: number;
    acceleration: number;
    /** Deceleration applied when the throttle is released. */
    drag: number;
    turnRate: number;
    radius: number;
    start: { x: number; y: number; heading: number };
    front: WeaponConfig;
    broadside: BroadsideConfig;
  };
  spawn: {
    intervalSeconds: number;
    maxAlive: number;
    /** Spawn points must be at least this far from the player. */
    minDistanceFromPlayer: number;
    /** Distance to keep from arena borders, islands and other ships. */
    margin: number;
    weights: { chaser: number; shooter: number };
    /** Force the first two spawns to be one Chaser and one Shooter. */
    guaranteeEachType: boolean;
  };
  chaser: {
    maxHealth: number;
    speed: number;
    turnRate: number;
    radius: number;
    contactDamage: number;
  };
  shooter: {
    maxHealth: number;
    speed: number;
    turnRate: number;
    radius: number;
    /** The Shooter fires when the player is closer than this. */
    attackRange: number;
    /** The Shooter stops approaching at this distance. */
    preferredRange: number;
    /** Max angle (rad) between heading and target for the Shooter to fire. */
    aimTolerance: number;
    weapon: WeaponConfig;
  };
}

/** Player-editable options (the Options screen). */
export interface GameOptions {
  sessionSeconds: number;
  spawnIntervalSeconds: number;
}

export const OPTION_LIMITS = {
  sessionSeconds: { min: 60, max: 180, step: 1 },
  spawnIntervalSeconds: { min: 1, max: 15, step: 0.5 },
} as const;

export const DEFAULT_OPTIONS: GameOptions = {
  sessionSeconds: 90,
  spawnIntervalSeconds: 4,
};

export const DEFAULT_GAMEPLAY: GameplayConfig = {
  sessionSeconds: DEFAULT_OPTIONS.sessionSeconds,
  arena: { width: 1600, height: 900 },
  player: {
    maxHealth: 100,
    maxSpeed: 210,
    acceleration: 260,
    drag: 180,
    turnRate: 2.1,
    radius: 34,
    start: { x: 170, y: 700, heading: -0.35 },
    front: { damage: 25, cooldown: 0.5, projectileSpeed: 620, projectileLifetime: 0.95, projectileRadius: 5 },
    broadside: {
      damage: 14,
      cooldown: 1.6,
      projectileSpeed: 520,
      projectileLifetime: 0.8,
      projectileRadius: 5,
      count: 3,
      spacing: 22,
    },
  },
  spawn: {
    intervalSeconds: DEFAULT_OPTIONS.spawnIntervalSeconds,
    maxAlive: 8,
    minDistanceFromPlayer: 480,
    margin: 60,
    weights: { chaser: 1, shooter: 1 },
    guaranteeEachType: true,
  },
  chaser: { maxHealth: 30, speed: 150, turnRate: 1.7, radius: 32, contactDamage: 20 },
  shooter: {
    maxHealth: 60,
    speed: 105,
    turnRate: 1.5,
    radius: 34,
    attackRange: 420,
    preferredRange: 300,
    aimTolerance: 0.14,
    weapon: { damage: 8, cooldown: 1.7, projectileSpeed: 400, projectileLifetime: 1.3, projectileRadius: 5 },
  },
};

export interface OptionsValidation {
  ok: boolean;
  errors: Partial<Record<keyof GameOptions, string>>;
}

export function validateOptions(raw: { sessionSeconds: unknown; spawnIntervalSeconds: unknown }): OptionsValidation {
  const errors: OptionsValidation['errors'] = {};
  const lim = OPTION_LIMITS;
  const session = typeof raw.sessionSeconds === 'number' ? raw.sessionSeconds : Number(raw.sessionSeconds);
  if (raw.sessionSeconds === '' || !Number.isFinite(session) || !Number.isInteger(session)) {
    errors.sessionSeconds = 'Enter a whole number of seconds.';
  } else if (session < lim.sessionSeconds.min || session > lim.sessionSeconds.max) {
    errors.sessionSeconds = `Must be between ${lim.sessionSeconds.min} and ${lim.sessionSeconds.max} seconds.`;
  }
  const spawn = typeof raw.spawnIntervalSeconds === 'number' ? raw.spawnIntervalSeconds : Number(raw.spawnIntervalSeconds);
  if (raw.spawnIntervalSeconds === '' || !Number.isFinite(spawn)) {
    errors.spawnIntervalSeconds = 'Enter a number of seconds.';
  } else if (spawn < lim.spawnIntervalSeconds.min || spawn > lim.spawnIntervalSeconds.max) {
    errors.spawnIntervalSeconds = `Must be between ${lim.spawnIntervalSeconds.min} and ${lim.spawnIntervalSeconds.max} seconds.`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Snapshot of the configuration a match runs with (options applied on top of defaults). */
export function buildGameplayConfig(options: GameOptions): GameplayConfig {
  return {
    ...DEFAULT_GAMEPLAY,
    sessionSeconds: options.sessionSeconds,
    spawn: { ...DEFAULT_GAMEPLAY.spawn, intervalSeconds: options.spawnIntervalSeconds },
  };
}

/** Stable key used to compare ranking entries that share a configuration. */
export function configKey(options: GameOptions): string {
  return `s${options.sessionSeconds}-i${options.spawnIntervalSeconds}`;
}
