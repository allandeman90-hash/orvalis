import { type GridZone, gridZonePaint } from './gridZone';
import type { TerrainPaint } from './paint';

/**
 * M1.1 — the technical test zone: a piece of the OLD Orvalis terrain (the
 * Three.js prototype), exported once by `npm run zone:export` and rendered by
 * the new terrain. It is a test bed. It does NOT define the geography of the
 * new Orvalis world.
 *
 * Axes. The legacy game is Y-up: ground = (x, z), height = y. The engine is
 * Z-up: ground = (x, y), height = z. Both are right-handed, so the conversion
 * is a rotation, not a mirror:
 *     engine (x, y, z) = legacy (x, −z, y)
 * (keeping « y = +z » would mirror the map). This is the migration boundary:
 * nothing else in the engine knows about the legacy axes.
 */
export function legacyToEngine(legacyX: number, legacyZ: number): { readonly x: number; readonly y: number } {
  return { x: legacyX + 0, y: -legacyZ + 0 };
}

export const TEST_ZONE = {
  id: 'val-azur-test',
  /** Relative to the page, like every engine asset. */
  url: 'assets/zones/val-azur-test.ovz',
  /**
   * Extent in LEGACY coordinates: x −2048..0, z −1024..1024 — the west half of
   * the old world's middle band: 4 × 4 tiles of 512.
   */
  legacy: { minX: -2048, maxX: 0, minZ: -1024, maxZ: 1024 },
  /** Where the camera starts: the old capital Havrebleu (legacy x −1632, z 72). */
  focus: legacyToEngine(-1632, 72),
  /** Weight channels exported from the legacy ground mix, in file order. */
  channels: ['rock', 'dirt', 'sand', 'snow', 'cobble'],
} as const;

/**
 * How the legacy ground mix maps onto the 4 texture layers of the placeholder
 * palette (grass, dirt, rock, sandy path). OUR CHOICE, and deliberately rough:
 * - layer 1 (dirt)  ← dirt roads and cobbled town ground;
 * - layer 2 (rock)  ← steep slopes;
 * - layer 3 (sand)  ← shores.
 * Not carried over: snow (no snow texture in the placeholder palette, and a
 * chunk has 4 layers at most) and the per-biome ground colours of the old game.
 */
export function testZonePaint(zone: GridZone): TerrainPaint {
  return gridZonePaint(zone, [0, 1, 2, 3], [['dirt', 'cobble'], ['rock'], ['sand']]);
}
