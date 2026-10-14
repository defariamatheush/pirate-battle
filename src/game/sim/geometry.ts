export const TAU = Math.PI * 2;

export function normalizeAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r < -Math.PI) r += TAU;
  return r;
}

/** Shortest signed difference `to - from`. */
export function angleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/** Rotate `current` towards `target` by at most `maxDelta`. */
export function steerTowards(current: number, target: number, maxDelta: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(d) * maxDelta);
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * Swept test: first time t in [0,1] at which segment p0->p1 enters the circle,
 * or null. Prevents fast projectiles from tunnelling through targets.
 */
export function segmentCircleHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Circle,
  extraRadius = 0,
): number | null {
  const r = c.radius + extraRadius;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - c.x;
  const fy = y0 - c.y;
  const a = dx * dx + dy * dy;
  const cc = fx * fx + fy * fy - r * r;
  if (cc <= 0) return 0; // starts inside
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
