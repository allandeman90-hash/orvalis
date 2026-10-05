import type { TerrainConfig } from './config';
import type { TileCoord } from './coords';
import type { LiquidSource } from './liquid';
import type { TerrainPaint } from './paint';
import type { TileProvider } from './streaming';
import type { TerrainTile } from './tile';
import { type TerrainMap, TerrainWorld, type TileKind } from './terrainMap';
import { buildTerrainTile, TileBuildJob, tileHeightFixture, type TileHeightKind, type WorldHeightFunction } from './tile';

/**
 * Synthetic maps for tests and for the `?scene=map` debug scene.
 * NOT the Orvalis world and NOT a world generator: a handful of tiles placed
 * by hand to exercise sparse maps (gaps, negative coordinates, several maps).
 */
export interface MapFixture {
  readonly id: string;
  readonly height: TileHeightKind;
  readonly tiles: ReadonlyArray<TileCoord & { readonly kind: TileKind }>;
}

export const MAP_FIXTURES: readonly MapFixture[] = [
  // Three tiles: two side by side across x = 0, one touching only by a corner; (0,1), (1,0), (−1,1) are absent.
  { id: 'archipel', height: 'hills', tiles: [{ x: 0, y: 0, kind: 'land' }, { x: -1, y: 0, kind: 'land' }, { x: 1, y: 1, kind: 'land' }] },
  // Two tiles far from the origin, in negative y.
  { id: 'bande', height: 'slope', tiles: [{ x: 5, y: -3, kind: 'land' }, { x: 5, y: -2, kind: 'land' }] },
];

export type MapFixtureId = 'archipel' | 'bande';

/** Builds every fixture map into one world. `height` overrides the fixtures' own height field. */
export function buildFixtureWorld(config: TerrainConfig, height?: TileHeightKind, paint?: TerrainPaint): TerrainWorld {
  const world = new TerrainWorld();
  for (const fixture of MAP_FIXTURES) fillFixtureMap(world.createMap(fixture.id, config), fixture, height, paint);
  return world;
}

function fillFixtureMap(map: TerrainMap, fixture: MapFixture, height?: TileHeightKind, paint?: TerrainPaint): void {
  const heightAt = tileHeightFixture(map.config, height ?? fixture.height);
  for (const t of fixture.tiles) map.set(buildTerrainTile(map.config, { x: t.x, y: t.y }, heightAt, paint ? { paint } : {}), t.kind);
}

/**
 * A larger sparse map for streaming tests: the 7 × 5 rectangle x −3..3, y −2..2
 * WITHOUT 4 tiles ((1,1), (−2,0), (3,−2), (−3,2)) — 31 tiles. Still a fixture.
 */
export const STREAM_FIXTURE: MapFixture = (() => {
  const absent = new Set(['1,1', '-2,0', '3,-2', '-3,2']);
  const tiles: Array<TileCoord & { kind: TileKind }> = [];
  for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) if (!absent.has(`${x},${y}`)) tiles.push({ x, y, kind: 'land' });
  return { id: 'continent', height: 'dunes', tiles };
})();

export interface FixtureTileProvider extends TileProvider {
  readonly heightAt: WorldHeightFunction;
  /** How many tile builds were started so far. */
  readonly builds: number;
  /** Convenience: builds a tile at once. */
  build(coord: TileCoord): { readonly tile: TerrainTile; readonly kind: TileKind };
}

/** Builds the tiles of a fixture on demand, from its world-space height function. */
export function fixtureTileProvider(config: TerrainConfig, fixture: MapFixture, height?: TileHeightKind, paint?: TerrainPaint, liquid?: LiquidSource): FixtureTileProvider {
  return heightFieldTileProvider(config, fixture.id, fixture.tiles, tileHeightFixture(config, height ?? fixture.height), paint, liquid);
}

/**
 * Builds tiles on demand from ANY world-space height function: the listed tiles exist, nothing else does.
 * Used by the fixtures and by grid zones (gridZone.ts).
 */
export function heightFieldTileProvider(
  config: TerrainConfig,
  id: string,
  tiles: ReadonlyArray<TileCoord & { readonly kind?: TileKind }>,
  heightAt: WorldHeightFunction,
  paint?: TerrainPaint,
  liquid?: LiquidSource,
): FixtureTileProvider {
  const kinds = new Map(tiles.map((t) => [`${t.x},${t.y}`, t.kind ?? 'land'] as const));
  let builds = 0;
  return {
    heightAt,
    get builds() {
      return builds;
    },
    has: (coord) => kinds.has(`${coord.x},${coord.y}`),
    begin(coord) {
      const kind = kinds.get(`${coord.x},${coord.y}`);
      if (kind === undefined) throw new Error(`map "${id}": tile ${coord.x},${coord.y} does not exist`);
      builds++;
      const job = new TileBuildJob(config, coord, heightAt, { ...(paint ? { paint } : {}), ...(liquid ? { liquid } : {}) });
      return {
        kind,
        advance: (shouldStop) => job.advance(shouldStop),
        get tile() {
          return job.tile;
        },
      };
    },
    build(coord) {
      const started = this.begin(coord);
      started.advance(() => false);
      return { tile: started.tile, kind: started.kind };
    },
  };
}
