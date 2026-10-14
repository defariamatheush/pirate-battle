import type { EndReason } from '@/game/sim/types';

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
/** Dates are rendered in UTC so screenshots and tests are timezone independent. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${dateFmt.format(d)} UTC`;
}

export const END_REASON_LABEL: Record<EndReason, string> = {
  time_up: 'Time is up',
  player_destroyed: 'Ship destroyed',
};
