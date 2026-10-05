import { type TileCoord, worldToTile } from './coords';
import type { TerrainMap, TileKind } from './terrainMap';
import type { TerrainTile } from './tile';

/**
 * Streaming of terrain tiles around a focus point (the camera or the player):
 * tiles that come within `loadRadius` are loaded, tiles that get further than
 * `unloadRadius` are unloaded. Distances are counted in TILES from the tile
 * containing the focus, on the larger of the two axes (a square window), so
 * loadRadius 1 means the 3 × 3 tiles around the focus.
 *
 * The radii are NOT taken from the reference document (it does not give them:
 * spec §17.1 is marked uncertain). They are plain configuration.
 *
 * unloadRadius ≥ loadRadius: the gap is a hysteresis, so that walking back
 * and forth across a tile border does not load and unload the same tiles.
 *
 * TIME SLICING: a tile is built by a resumable job (TileBuild). update() can
 * be given a `shouldStop` function (typically « the frame's time budget is
 * spent »); the build in progress then continues at the next update. Without
 * it, tiles are built to the end at once. A tile becomes resident — and is
 * reported in `loaded` — only when its build is finished.
 *
 * WHAT THIS IS NOT YET: there is no tile file format, no background download
 * and no worker; those plug in behind TileProvider later without changing who
 * decides what is resident.
 */
export interface StreamingConfig {
  /** Tiles around the focus tile that must be resident (0 = only the focus tile). */
  readonly loadRadius: number;
  /** Resident tiles further than this are unloaded. Must be ≥ loadRadius. */
  readonly unloadRadius: number;
  /** Budget: tiles that may become resident per update() call, nearest first — and, likewise, tiles that may be unloaded per call. */
  readonly maxLoadsPerUpdate: number;
}

/** Where tiles come from. The provider says which tiles EXIST in the map: the world is sparse. */
export interface TileProvider {
  has(coord: TileCoord): boolean;
  /** Starts building a tile. Only called for coordinates for which has() is true. */
  begin(coord: TileCoord): TileBuild;
}

/** A tile being built, possibly over several calls. */
export interface TileBuild {
  /**
   * Works until the tile is finished or shouldStop() returns true; must do at
   * least one unit of work per call. Returns true when the tile is finished.
   */
  advance(shouldStop: () => boolean): boolean;
  /** The finished tile; only read after advance() returned true. */
  readonly tile: TerrainTile;
  readonly kind: TileKind;
}

export interface StreamingEvents {
  /** Tiles that became resident in this update, in loading order. */
  readonly loaded: TileCoord[];
  /** Tiles that stopped being resident in this update. */
  readonly unloaded: TileCoord[];
  /**
   * Tiles that were already resident, still are, and whose border normals
   * changed because a neighbour arrived or left (see TerrainMap). Whoever
   * holds GPU copies must refresh them.
   */
  readonly refreshed: TileCoord[];
}

const keyOf = (coord: TileCoord): string => `${coord.x},${coord.y}`;
const NEVER = (): boolean => false;

export function validateStreamingConfig(config: StreamingConfig): void {
  const { loadRadius, unloadRadius, maxLoadsPerUpdate } = config;
  if (!Number.isInteger(loadRadius) || loadRadius < 0) throw new Error(`streaming: loadRadius must be an integer ≥ 0 (got ${loadRadius})`);
  if (!Number.isInteger(unloadRadius) || unloadRadius < loadRadius) throw new Error(`streaming: unloadRadius must be an integer ≥ loadRadius (got ${unloadRadius} < ${loadRadius})`);
  if (!Number.isInteger(maxLoadsPerUpdate) || maxLoadsPerUpdate < 1) throw new Error(`streaming: maxLoadsPerUpdate must be an integer ≥ 1 (got ${maxLoadsPerUpdate})`);
}

/**
 * Keeps one TerrainMap in sync with a focus point. The streamer owns the
 * residency of the map: every resident tile outside the unload window is
 * removed, whoever put it there.
 */
export class TerrainStreamer {
  private focus: TileCoord | null = null;
  private pendingCount = 0;
  /** The build in progress, if any: at most one tile is being built at a time. */
  private current: { readonly coord: TileCoord; readonly build: TileBuild } | null = null;
  private cancelled = 0;
  private unloadsLeft = 0;
  private loaded = 0;
  private unloaded = 0;

  constructor(
    readonly map: TerrainMap,
    private readonly provider: TileProvider,
    readonly config: StreamingConfig,
  ) {
    validateStreamingConfig(config);
  }

  /** Tile containing the focus at the last update; null before the first one. */
  get focusTile(): TileCoord | null {
    return this.focus;
  }

  /** Existing tiles inside the load window that are not resident yet (after the last update). */
  get pending(): number {
    return this.pendingCount;
  }

  /** Tile whose build is in progress, or null. */
  get building(): TileCoord | null {
    return this.current?.coord ?? null;
  }

  /** Builds abandoned because the focus moved away before they finished. */
  get cancelledTotal(): number {
    return this.cancelled;
  }

  /** Resident tiles beyond the unload radius that are still waiting for their turn to be unloaded. */
  get pendingUnloads(): number {
    return this.unloadsLeft;
  }

  get loadedTotal(): number {
    return this.loaded;
  }

  get unloadedTotal(): number {
    return this.unloaded;
  }

  /**
   * @param shouldStop optional time budget: asked between units of build work. When it returns true the
   *   build in progress is left for the next update. Omitted = never stop (tiles are built at once).
   */
  update(focusWorldX: number, focusWorldY: number, shouldStop: () => boolean = NEVER): StreamingEvents {
    if (!Number.isFinite(focusWorldX) || !Number.isFinite(focusWorldY)) throw new Error(`streaming: focus must be finite (got ${focusWorldX}, ${focusWorldY})`);
    const { map, provider } = this;
    const { loadRadius, unloadRadius, maxLoadsPerUpdate } = this.config;
    const focus = worldToTile(map.config, focusWorldX, focusWorldY);
    this.focus = focus;
    const distance = (c: TileCoord): number => Math.max(Math.abs(c.x - focus.x), Math.abs(c.y - focus.y));

    const events: StreamingEvents = { loaded: [], unloaded: [], refreshed: [] };
    const touched = new Map<string, TileCoord>();

    // 1. Unload what is too far.
    const tooFar: TileCoord[] = [];
    for (const { tile } of map.tiles()) if (distance(tile.coord) > unloadRadius) tooFar.push(tile.coord);
    // Farthest first, and no more per update than tiles may be loaded: unloading also costs time
    // (the neighbours' border normals are recomputed), and the rest can wait for the next update.
    tooFar.sort((a, b) => distance(b) - distance(a) || a.y - b.y || a.x - b.x);
    this.unloadsLeft = Math.max(0, tooFar.length - maxLoadsPerUpdate);
    for (const coord of tooFar.slice(0, maxLoadsPerUpdate)) {
      for (const changed of map.delete(coord) ?? []) touched.set(keyOf(changed), changed);
      events.unloaded.push(coord);
    }

    // A build whose tile is now beyond the unload radius is pointless: drop it.
    if (this.current && distance(this.current.coord) > unloadRadius) {
      this.current = null;
      this.cancelled++;
    }

    // 2. Load what is missing, nearest first (then a fixed order, so runs are reproducible).
    const missing: TileCoord[] = [];
    for (let y = focus.y - loadRadius; y <= focus.y + loadRadius; y++) {
      for (let x = focus.x - loadRadius; x <= focus.x + loadRadius; x++) {
        const coord = { x, y };
        if (!map.has(coord) && provider.has(coord)) missing.push(coord);
      }
    }
    const squared = (c: TileCoord): number => (c.x - focus.x) ** 2 + (c.y - focus.y) ** 2;
    missing.sort((a, b) => distance(a) - distance(b) || squared(a) - squared(b) || a.y - b.y || a.x - b.x);
    const queue = [...missing];
    while (events.loaded.length < maxLoadsPerUpdate) {
      if (!this.current) {
        const next = queue.shift();
        if (!next) break;
        this.current = { coord: next, build: provider.begin(next) };
      } else {
        // The tile being built keeps its turn, even if the focus moved and another one is now nearer.
        const at = queue.findIndex((c) => c.x === this.current!.coord.x && c.y === this.current!.coord.y);
        if (at >= 0) queue.splice(at, 1);
      }
      const { coord, build } = this.current;
      if (!build.advance(shouldStop)) break; // budget spent: continue at the next update
      this.current = null;
      if (build.tile.coord.x !== coord.x || build.tile.coord.y !== coord.y) throw new Error(`streaming: the provider returned tile ${keyOf(build.tile.coord)} for ${keyOf(coord)}`);
      // The in-progress tile may have been started when it was wanted and finished after it left the load window; it is still inside the unload radius, so it is kept.
      for (const changed of map.set(build.tile, build.kind)) touched.set(keyOf(changed), changed);
      events.loaded.push(coord);
      if (shouldStop()) break;
    }
    this.pendingCount = missing.length - events.loaded.filter((c) => missing.some((m) => m.x === c.x && m.y === c.y)).length;
    this.loaded += events.loaded.length;
    this.unloaded += events.unloaded.length;

    // 3. Residents whose border normals changed, other than the tiles loaded just now.
    const fresh = new Set(events.loaded.map(keyOf));
    for (const [key, coord] of touched) if (!fresh.has(key) && map.has(coord)) events.refreshed.push(coord);
    return events;
  }
}
