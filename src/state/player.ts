import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';

export interface PlayerIdentity {
  id: string;
  name: string;
}

export function newId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

const isPlayer = (v: unknown): v is PlayerIdentity =>
  typeof v === 'object' && v !== null && typeof (v as PlayerIdentity).id === 'string' && typeof (v as PlayerIdentity).name === 'string';

/** Anonymous, locally persisted identity of the (single) human player. */
export function getPlayer(): PlayerIdentity {
  const stored = readJson<PlayerIdentity | null>(STORAGE_KEYS.player, null, isPlayer as (v: unknown) => v is PlayerIdentity | null);
  if (stored) return stored;
  const created = { id: newId('player'), name: 'You' };
  writeJson(STORAGE_KEYS.player, created);
  return created;
}
