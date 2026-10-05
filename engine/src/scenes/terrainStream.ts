import { createSceneSky } from './sceneSky';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, vec3 } from '../math';
import type { FrameStats, RendererBackend, TerrainDebugMode } from '../renderer';
import { buildFarTile, FarTerrainWindow, fixtureTileProvider, heightFieldTileProvider, liquidFixture, type LiquidSource, STREAM_FIXTURE, type StreamingConfig, type TerrainConfig, TerrainMap, type TerrainPaint, TerrainStreamer, type TileCoord, type TileHeightKind, type WorldHeightFunction } from '../terrain';
import { TerrainRenderer } from '../terrainRender';
import { sceneMaterial, type SceneMaterialOptions } from './terrainMaterial';
import { TERRAIN_CHUNK_CLEAR, type TerrainStats } from './terrainChunk';
import type { TerrainEnvironment, TerrainTileScene } from './terrainTile';

/** A map to stream instead of the synthetic fixture: its name, its tiles and what its ground is painted with. */
export interface StreamWorld {
  readonly id: string;
  /** The tiles that exist. */
  readonly tiles: readonly TileCoord[];
  readonly heightAt: WorldHeightFunction;
  /** Where the map has liquid; undefined = none. */
  readonly liquid?: LiquidSource | undefined;
  /** Built into the tiles only when the scene shows textures (options.paint set); undefined = base layer only. */
  readonly paint?: TerrainPaint | undefined;
}

export interface TerrainStreamSceneOptions extends SceneMaterialOptions {
  /** Default: the synthetic fixture map « continent ». When given, `heightKind` and the kind of `paint` are ignored. */
  readonly world?: StreamWorld | undefined;
  /** true = a given world is built without its liquid (test control). */
  readonly liquidOff?: boolean | undefined;
  readonly config: TerrainConfig;
  /** Start position of the focus, world units. */
  readonly focus: { readonly x: number; readonly y: number };
  readonly streaming: StreamingConfig;
  readonly view: 'oblique' | 'above';
  /** 1 = about one tile in view around the focus; larger = closer. Default 4. */
  readonly zoom?: number;
  /**
   * Oblique view only — where the debug camera stands around the focus, at an unchanged distance:
   * `pitchDegrees` = how far below the horizontal it looks (0 < pitch < 90; small = towards the horizon, so the
   * sky shows), `headingDegrees` = compass direction it looks towards (0 = north, 90 = east).
   * Default: the historical view, from the south-west corner above (pitch 35.26°, heading 45°).
   */
  readonly pitchDegrees?: number | undefined;
  readonly headingDegrees?: number | undefined;
  /** Overrides the relief of the fixture map. */
  readonly heightKind?: TileHeightKind | undefined;
  /** false = test control: tiles keep their stand-alone normals, so seams between tiles show. Default true. */
  readonly stitchTileBorders?: boolean;
  readonly wireframe?: boolean;
  readonly debugMode?: TerrainDebugMode;
  readonly chunkBounds?: boolean;
  readonly culling?: boolean;
  /**
   * Milliseconds per frame that streaming may spend on building tiles and on GPU uploads / frees. The work
   * that does not fit continues at the next frame. Infinity = everything at once (one long frame per tile).
   * Default 4.
   */
  readonly frameBudgetMs?: number;
  /**
   * Far terrain: low-detail tiles in a window of ± this many tiles around the focus tile, drawn behind the
   * detailed terrain (spec §17.2 uses ±3). 0 or undefined = no far terrain.
   */
  readonly farRadius?: number;
  /** Clock used for the budget; injectable for tests. Default performance.now. */
  readonly now?: () => number;
}

/** Frames over which the overlay's « max » streaming work is taken. */
const WORK_WINDOW_FRAMES = 240;

export interface TerrainStreamScene extends TerrainTileScene {
  /** The streamed map, for inspection. */
  readonly map: TerrainMap;
  readonly focus: { readonly x: number; readonly y: number };
  setFocus(x: number, y: number): void;
  moveFocus(dx: number, dy: number): void;
}

/**
 * P1.8 test scene: the sparse fixture map « continent », streamed around a
 * focus point that the camera follows. Every frame: the streamer decides which
 * tiles are resident (at most a few builds per frame), its events are applied
 * to the terrain renderer, then the resident tiles are drawn with culling.
 */
export function createTerrainStreamScene(backend: RendererBackend, options: TerrainStreamSceneOptions): TerrainStreamScene {
  const { config } = options;
  const zoom = options.zoom ?? 4;
  if (!(zoom >= 1) || !Number.isFinite(zoom)) throw new Error(`scene: zoom must be a finite number ≥ 1 (got ${zoom})`);
  const reach = config.tileSize / zoom;
  // Distance from the camera to the focus it looks at (see the camera placement in render()).
  const eyeDistance = (options.view === 'above' ? 1.875 : 1.1 * Math.sqrt(3)) * reach;
  // Default fog. Tiles are guaranteed to be resident up to `guaranteed` around the focus; the fog is measured
  // from the camera, which is `eyeDistance` away from the focus, so it starts a little beyond the focus and is
  // complete well before the guaranteed distance: the edge of the loaded world dissolves instead of showing.
  // (With a very distant camera — zoom 1 — the sides of the view can still show that edge: the fog is radial.)
  const guaranteed = Math.max(1, options.streaming.loadRadius) * config.tileSize;
  const farRadius = options.farRadius ?? 0;
  // With far terrain the landscape continues beyond the detailed tiles, so the fog can reach much further:
  // it is complete a little before the edge of the far window, and the detailed → far transition happens
  // inside the fog (spec §16: « fog hiding the transition »).
  const fogReach = farRadius > 0 ? Math.max(0.6 * guaranteed, 0.85 * farRadius * config.tileSize) : 0.6 * guaranteed;
  const scenePaint = sceneMaterial(config, options, { start: eyeDistance + 0.15 * guaranteed, end: eyeDistance + fogReach });
  const material = scenePaint.material;
  // A given world brings its own paint; it is only built into the tiles when the scene would have painted the fixture.
  const paint = options.world ? (scenePaint.paint ? options.world.paint : undefined) : scenePaint.paint;
  const provider = options.world
    ? heightFieldTileProvider(config, options.world.id, options.world.tiles, options.world.heightAt, paint, options.liquidOff ? undefined : options.world.liquid)
    : fixtureTileProvider(config, STREAM_FIXTURE, options.heightKind, paint, options.liquid ? liquidFixture(config.tileSize, options.liquid, options.liquidLevel ?? 0) : undefined);
  const map = new TerrainMap(options.world?.id ?? STREAM_FIXTURE.id, config, options.stitchTileBorders ?? true);
  const streamer = new TerrainStreamer(map, provider, options.streaming);

  // Camera placement when a pitch or a heading is asked for; otherwise the historical expression is used as it is.
  let orbit: { x: number; y: number; z: number } | null = null;
  if (options.pitchDegrees !== undefined || options.headingDegrees !== undefined) {
    const pitch = options.pitchDegrees ?? (Math.atan(Math.SQRT1_2) * 180) / Math.PI, heading = options.headingDegrees ?? 45;
    if (!(pitch > 0 && pitch < 90)) throw new Error(`scene: pitch must be in 0..90 degrees, both excluded (got ${pitch})`);
    if (!Number.isFinite(heading)) throw new Error(`scene: heading must be finite (got ${heading})`);
    const p = (pitch * Math.PI) / 180, h = (heading * Math.PI) / 180;
    orbit = { x: Math.cos(p) * Math.sin(h), y: Math.cos(p) * Math.cos(h), z: Math.sin(p) };
  }

  let wireframe = options.wireframe ?? false;
  let debugMode: TerrainDebugMode = options.debugMode ?? 'color';
  let chunkBounds = options.chunkBounds ?? false;
  let culling = options.culling ?? true;
  let last = { visibleChunks: 0, submittedChunks: 0, liquidChunksDrawn: 0, liquidFrame: 0 };
  let focusX = options.focus.x, focusY = options.focus.y;
  const frameBudgetMs = options.frameBudgetMs ?? 4;
  if (!(frameBudgetMs > 0)) throw new Error(`scene: frameBudgetMs must be > 0 (got ${frameBudgetMs})`);
  const now = options.now ?? (() => performance.now());
  let workLast = 0, workAt = 0;
  const workWindow = new Float64Array(WORK_WINDOW_FRAMES);

  const tileSize = config.tileSize, heightRange = 8 * config.chunkSize;
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  // Colours restart in every tile (red with x, green with y), so tiles can be told apart; blue follows the height.
  const terrain = new TerrainRenderer(
    backend,
    (x, y, z, tile) => [0.15 + 0.7 * ((x - tile.origin.x) / tileSize), 0.15 + 0.7 * ((y - tile.origin.y) / tileSize), 0.2 + 0.6 * clamp01(z / heightRange + 0.5)],
    'stream',
    material,
  );
  const sky = createSceneSky(backend, options.sky ?? false);

  const eye = vec3.create(0, 0, 0), target = vec3.create(0, 0, 0);
  const camera: LookAtCamera = { eye, target, up: options.view === 'above' ? vec3.create(0, 1, 0) : WORLD_UP, fovY: Math.PI / 3, near: reach / 64, far: reach * 16 };
  const mvp = mat4.create();
  // The far terrain has its own projection: same camera, but a far plane beyond the whole far window
  // (its depth lives in its own slice of the depth buffer, so the two matrices need not agree).
  const farMvp = mat4.create();
  const farCamera: LookAtCamera = { ...camera, near: reach / 8, far: eyeDistance + (farRadius + 2) * config.tileSize * 1.5 };
  const far = farRadius > 0 ? new FarTerrainWindow(config, (coord) => provider.has(coord), (coord) => buildFarTile(config, coord, provider.heightAt, paint), farRadius) : null;
  let lastFarDrawn = 0;

  return {
    map,
    get focus() {
      return { x: focusX, y: focusY };
    },
    setFocus(x: number, y: number): void {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`scene: focus must be finite (got ${x}, ${y})`);
      focusX = x;
      focusY = y;
    },
    moveFocus(dx: number, dy: number): void {
      this.setFocus(focusX + dx, focusY + dy);
    },
    get terrain(): TerrainStats {
      const totals = terrain.totals;
      return {
        map: map.id,
        tiles: totals.tiles,
        chunks: totals.chunks,
        vertices: totals.vertices,
        triangles: totals.triangles,
        submittedChunks: last.submittedChunks,
        drawCalls: last.submittedChunks,
        culling,
        ...(culling ? { visibleChunks: last.visibleChunks, culledChunks: totals.chunks - last.visibleChunks } : {}),
        holes: totals.holes,
        wireframe,
        debugMode,
        chunkBounds,
        lit: terrain.lit,
        sky: sky.enabled,
        ...(totals.liquidChunks > 0 ? { liquid: { visible: terrain.liquidVisible, chunks: totals.liquidChunks, cells: totals.liquidCells, drawn: last.liquidChunksDrawn, byType: totals.liquidCellsByType, frame: last.liquidFrame } } : {}),
        ...(terrain.hasFog ? { fog: terrain.fogged } : {}),
        ...(far ? { far: { visible: terrain.farVisible, tiles: terrain.farTileCount, drawn: lastFarDrawn, radius: farRadius } } : {}),
        streaming: {
          focus: { x: focusX, y: focusY },
          focusTile: streamer.focusTile ?? { x: 0, y: 0 },
          loadRadius: streamer.config.loadRadius,
          unloadRadius: streamer.config.unloadRadius,
          pending: streamer.pending + streamer.pendingUnloads,
          gpuQueue: terrain.pendingWork,
          workMs: workLast,
          workMaxMs: Math.max(...workWindow),
          loadedTotal: streamer.loadedTotal,
          unloadedTotal: streamer.unloadedTotal,
        },
      };
    },
    setWireframe(on: boolean): void {
      wireframe = on;
    },
    toggleWireframe(): boolean {
      wireframe = !wireframe;
      return wireframe;
    },
    setDebugMode(mode: TerrainDebugMode): void {
      debugMode = mode;
    },
    toggleCulling(): boolean {
      culling = !culling;
      return culling;
    },
    setEnvironment(environment: TerrainEnvironment): void {
      terrain.setEnvironment(environment);
      sky.setEnvironment(environment);
    },
    toggleSky(): boolean {
      return sky.toggle();
    },
    toggleLiquid(): boolean {
      terrain.liquidVisible = !terrain.liquidVisible;
      return terrain.liquidVisible;
    },
    setAnimationTime(timeMs: number): void {
      terrain.liquidTimeMs = timeMs;
    },
    toggleLighting(): boolean {
      terrain.lit = !terrain.lit;
      return terrain.lit;
    },
    toggleFog(): boolean {
      terrain.fogged = !terrain.fogged;
      return terrain.fogged;
    },
    toggleFar(): boolean {
      terrain.farVisible = !terrain.farVisible;
      return terrain.farVisible;
    },
    toggleChunkBounds(): boolean {
      chunkBounds = !chunkBounds;
      return chunkBounds;
    },
    render(aspect: number): FrameStats {
      // 1. Residency, then the same changes on the GPU side. Order matters: free first, then upload, then refresh.
      // Both halves are time-sliced: half of the frame budget for building tiles, the rest for the GPU queue.
      // Each half always makes some progress, so nothing starves.
      const start = now();
      const budgeted = Number.isFinite(frameBudgetMs);
      const events = streamer.update(focusX, focusY, budgeted ? () => now() - start >= frameBudgetMs / 2 : undefined);
      for (const coord of events.unloaded) terrain.removeTile(coord, true);
      for (const coord of events.loaded) terrain.addTile(map.get(coord)!.tile, true);
      for (const coord of events.refreshed) terrain.refreshTileBorder(coord, true);
      if (far) {
        const farEvents = far.update(focusX, focusY);
        for (const coord of farEvents.removed) terrain.removeFarTile(coord);
        for (const tile of farEvents.added) terrain.addFarTile(tile);
      }
      terrain.processPending(budgeted ? () => now() - start >= frameBudgetMs : undefined);
      // What streaming cost on the main thread this frame (kept for the overlay: last value and recent maximum).
      workLast = now() - start;
      workWindow[workAt] = workLast;
      workAt = (workAt + 1) % workWindow.length;

      // 2. The camera follows the focus, at the height of the ground there.
      const z = provider.heightAt(focusX, focusY);
      vec3.set(target, focusX, focusY, z);
      if (options.view === 'above') vec3.set(eye, focusX, focusY, z + 1.875 * reach);
      else if (orbit) vec3.set(eye, focusX - orbit.x * eyeDistance, focusY - orbit.y * eyeDistance, z + orbit.z * eyeDistance);
      else vec3.set(eye, focusX - 1.1 * reach, focusY - 1.1 * reach, z + 1.1 * reach);
      viewProjectionMatrix(mvp, camera, aspect, backend.info.depthRange);

      backend.beginFrame(terrain.fogBackground({ debugMode, wireframe }) ?? TERRAIN_CHUNK_CLEAR);
      sky.draw(camera, aspect, { debugMode, wireframe });
      if (far) viewProjectionMatrix(farMvp, farCamera, aspect, backend.info.depthRange);
      const drawn = terrain.draw(mvp, { wireframe, debugMode, chunkBounds, culling, eye, ...(far ? { farViewProjection: farMvp } : {}) });
      last = drawn;
      lastFarDrawn = drawn.farTilesDrawn;
      return backend.endFrame();
    },
    dispose() {
      terrain.dispose();
      sky.dispose();
    },
  };
}
