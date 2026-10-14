import { Assets, Rectangle, Texture } from 'pixi.js';
import type { ShipKind } from '../sim/types';

const BASE = import.meta.env.BASE_URL;

/** Ship art: each kind has four damage stages at `base + 6 * stage` (intact → wreck). */
export const SHIP_BASE: Record<ShipKind, number> = { player: 5, chaser: 2, shooter: 3 };
export const MAX_SHIP_STAGE = 3;

export interface GameTextures {
  /** `ships[kind][stage]` */
  ships: Record<ShipKind, Texture[]>;
  explosion: Texture[];
  fire: Texture[];
  cannonBall: Texture;
  enemyBarFrame: Texture;
  enemyBarFillGreen: Texture;
  enemyBarFillRed: Texture;
  tiles: { sand: Texture; grass: Texture; rock: Texture; rockMossy: Texture; water: Texture };
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

/** Retina art is used on dense displays; the texture resolution keeps logical sizes identical. */
function variant(): { dir: 'default' | 'retina'; resolution: 1 | 2 } {
  const dense = typeof window !== 'undefined' && window.devicePixelRatio > 1.5;
  return dense ? { dir: 'retina', resolution: 2 } : { dir: 'default', resolution: 1 };
}

let cached: GameTextures | null = null;

/**
 * Loads (or reuses) every texture the arena needs. Resolves once everything is
 * ready, rejects if any file fails (Pixi drops failed entries from its cache, so
 * calling this again is a real retry). Loaded textures are shared by all matches.
 */
export async function loadGameTextures(onProgress?: (p: LoadProgress) => void): Promise<GameTextures> {
  if (cached) {
    onProgress?.({ loaded: 1, total: 1 });
    return cached;
  }
  const { dir, resolution } = variant();
  // Ship/effect art ships at the same size in both folders; only UI and tiles have 2x variants.
  const png = (path: string) => `${BASE}assets/png/default/${path}.png`;
  const uiPng = (path: string) => `${BASE}assets/png/${dir}/${path}.png`;

  const shipFiles: Record<ShipKind, string[]> = { player: [], chaser: [], shooter: [] };
  for (const kind of Object.keys(SHIP_BASE) as ShipKind[]) {
    for (let stage = 0; stage <= MAX_SHIP_STAGE; stage++) shipFiles[kind].push(png(`ships/ship_${SHIP_BASE[kind] + 6 * stage}`));
  }
  const explosionFiles = [1, 2, 3].map((n) => png(`effects/explosion_${n}`));
  const fireFiles = [1, 2].map((n) => png(`effects/fire_${n}`));
  const singles = {
    cannonBall: png('ship_parts/cannon_ball'),
    enemyBarFrame: uiPng('ui/hud/enemy_health_frame'),
    enemyBarFillGreen: uiPng('ui/hud/enemy_health_fill_green'),
    enemyBarFillRed: uiPng('ui/hud/enemy_health_fill_red'),
  };
  const tileSheet = `${BASE}assets/tiles/tiles_sheet${dir === 'retina' ? '_retina' : ''}.png`;

  const urls = [
    ...Object.values(shipFiles).flat(),
    ...explosionFiles,
    ...fireFiles,
    ...Object.values(singles),
    tileSheet,
  ];
  const total = urls.length;
  let loaded = 0;
  onProgress?.({ loaded, total });

  // Load each file separately so progress is exact and one failure names its file.
  const textures = new Map<string, Texture>();
  await Promise.all(
    urls.map(async (src) => {
      try {
        const dense = src.includes('/retina/') || src.includes('_retina');
        const tex = await Assets.load<Texture>({ src, data: { resolution: dense ? resolution : 1 } });
        textures.set(src, tex);
      } catch (error) {
        throw new Error(`Failed to load ${src.replace(BASE, '')}`, { cause: error });
      }
      loaded++;
      onProgress?.({ loaded, total });
    }),
  );

  const get = (src: string) => textures.get(src)!;
  const sheet = get(tileSheet);
  const crop = (x: number, y: number, w: number, h: number) => new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });

  cached = {
    ships: {
      player: shipFiles.player.map(get),
      chaser: shipFiles.chaser.map(get),
      shooter: shipFiles.shooter.map(get),
    },
    explosion: explosionFiles.map(get),
    fire: fireFiles.map(get),
    cannonBall: get(singles.cannonBall),
    enemyBarFrame: get(singles.enemyBarFrame),
    enemyBarFillGreen: get(singles.enemyBarFillGreen),
    enemyBarFillRed: get(singles.enemyBarFillRed),
    tiles: {
      sand: crop(0, 0, 192, 192),
      grass: crop(320, 0, 256, 256),
      rock: crop(64, 192, 64, 64),
      rockMossy: crop(64, 256, 64, 64),
      water: crop(512, 256, 64, 64),
    },
  };
  return cached;
}

/** Drops the shared cache (used by tests that need a clean load). */
export function resetTextureCache(): void {
  cached = null;
}
