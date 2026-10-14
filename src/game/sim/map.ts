/** Static arena layout. Islands are circular colliders with a visual description. */
export type IslandKind = 'grass' | 'sand' | 'rock' | 'rockMossy';

export interface Island {
  id: string;
  kind: IslandKind;
  x: number;
  y: number;
  /** Collision radius (world units). */
  radius: number;
  /** Visual scale of the tile art. */
  scale: number;
}

export interface ArenaMap {
  islands: Island[];
}

export const DEFAULT_MAP: ArenaMap = {
  islands: [
    { id: 'north-west', kind: 'grass', x: 430, y: 250, radius: 150, scale: 1.4 },
    { id: 'south-east', kind: 'grass', x: 1180, y: 650, radius: 150, scale: 1.4 },
    { id: 'centre', kind: 'sand', x: 800, y: 440, radius: 78, scale: 1.0 },
    { id: 'rock-ne', kind: 'rock', x: 1310, y: 190, radius: 30, scale: 1.0 },
    { id: 'rock-sw', kind: 'rockMossy', x: 640, y: 770, radius: 30, scale: 1.0 },
    { id: 'rock-mid', kind: 'rock', x: 1000, y: 260, radius: 26, scale: 0.9 },
  ],
};
