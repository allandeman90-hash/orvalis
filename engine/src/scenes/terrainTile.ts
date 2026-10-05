import { createSceneSky } from './sceneSky';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, vec3 } from '../math';
import type { FrameStats, RendererBackend, TerrainDebugMode } from '../renderer';
import { buildTerrainTile, liquidFixture, type TerrainConfig, type TileCoord, type TileHeightKind, tileChunkIndex, tileHeightFixture, type TileNormalMode } from '../terrain';
import { CHUNK_BOUNDS_COLOR, TerrainRenderer } from '../terrainRender';
import { sceneMaterial, type SceneMaterialOptions } from './terrainMaterial';
import { type ChunkView, TERRAIN_CHUNK_CLEAR, type TerrainChunkScene, type TerrainStats } from './terrainChunk';

export { CHUNK_BOUNDS_COLOR };

export interface TileChunkHoles {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly mask: number;
}

export interface TerrainTileSceneOptions extends SceneMaterialOptions {
  readonly config: TerrainConfig;
  readonly tile: TileCoord;
  readonly heightKind: TileHeightKind;
  readonly view: ChunkView;
  /** 1 = the whole tile in view; larger values move the camera closer to the tile centre. */
  readonly zoom?: number;
  readonly holes?: readonly TileChunkHoles[];
  readonly wireframe?: boolean;
  readonly debugMode?: TerrainDebugMode;
  /** Draws the border of every chunk as lines, on top of the terrain. Geometry is untouched. */
  readonly chunkBounds?: boolean;
  /** 'isolated' is a test control only (shows the seams). Default 'seamless'. */
  readonly normals?: TileNormalMode;
  /** Frustum culling per chunk. Default true. */
  readonly culling?: boolean;
}

/** What the day/night cycle gives the terrain. */
export interface TerrainEnvironment {
  readonly ambient: readonly [number, number, number];
  readonly diffuse: readonly [number, number, number];
  readonly fogColor: readonly [number, number, number];
  /** Direction towards the lighting sun; absent = the direction is left as it is. */
  readonly toLight?: readonly [number, number, number] | undefined;
  /** Sky: zenith colour, unit direction towards the VISIBLE sun and its colour. The horizon is `fogColor`. */
  readonly sky?: { readonly zenith: readonly [number, number, number]; readonly sunDirection: readonly [number, number, number]; readonly sunColor: readonly [number, number, number] } | undefined;
}

export interface TerrainTileScene extends TerrainChunkScene {
  toggleChunkBounds(): boolean;
  toggleCulling(): boolean;
  /** Lighting and baked shadows of the textured mode. */
  toggleLighting(): boolean;
  /** Distance fog of the textured mode (no effect when the scene has no fog). */
  toggleFog(): boolean;
  /** Far terrain (no effect when the scene has none). */
  toggleFar(): boolean;
  /** Day/night light colours and fog colour, typically every frame (see TerrainRenderer.setEnvironment). */
  setEnvironment(environment: TerrainEnvironment): void;
  /** Sky gradient and sun disc behind the textured terrain. */
  toggleSky(): boolean;
  /** Liquids (no effect when the scene has none). */
  toggleLiquid(): boolean;
  /** Time driving the liquid texture animation, in milliseconds; typically every frame. */
  setAnimationTime(timeMs: number): void;
}

/**
 * P1.5 test scene: one TerrainTile, 16 × 16 chunks, each chunk with its own
 * vertex buffer and its own draw call (256 terrain draw calls — deliberately
 * not merged: frustum culling will submit chunks one by one).
 * Index buffers are shared between chunks that have the same hole mask.
 * The drawing itself is done by TerrainRenderer (shared with the map and streaming scenes).
 */
export function createTerrainTileScene(backend: RendererBackend, options: TerrainTileSceneOptions): TerrainTileScene {
  const { config } = options;
  const heightAt = tileHeightFixture(config, options.heightKind);
  const holeMasks = new Map<number, number>();
  for (const h of options.holes ?? []) holeMasks.set(tileChunkIndex(h.chunkX, h.chunkY), h.mask);
  const { paint, material } = sceneMaterial(config, options);
  const tile = buildTerrainTile(config, options.tile, heightAt, {
    holes: (cx, cy) => holeMasks.get(tileChunkIndex(cx, cy)) ?? 0,
    normals: options.normals ?? 'seamless',
    ...(paint ? { paint } : {}),
    ...(options.liquid ? { liquid: liquidFixture(config.tileSize, options.liquid, options.liquidLevel ?? 0) } : {}),
  });

  let wireframe = options.wireframe ?? false;
  let debugMode: TerrainDebugMode = options.debugMode ?? 'color';
  let chunkBounds = options.chunkBounds ?? false;
  let culling = options.culling ?? true;
  // Results of the last rendered frame.
  let last = { visibleChunks: 0, submittedChunks: 0, liquidChunksDrawn: 0, liquidFrame: 0 };

  const size = config.tileSize;
  const heightSpan = tile.maxHeight - tile.minHeight || 1;
  // Colours span the TILE: red with x, green with y, blue with height.
  const terrain = new TerrainRenderer(backend, (x, y, z) => [0.15 + 0.7 * ((x - tile.origin.x) / size), 0.15 + 0.7 * ((y - tile.origin.y) / size), 0.2 + 0.6 * ((z - tile.minHeight) / heightSpan)], 'tile', material);
  const sky = createSceneSky(backend, options.sky ?? false);
  terrain.addTile(tile);

  const zoom = options.zoom ?? 1;
  if (!(zoom >= 1) || !Number.isFinite(zoom)) throw new Error(`scene: zoom must be a finite number ≥ 1 (got ${zoom})`);
  const cx = tile.origin.x + size / 2, cy = tile.origin.y + size / 2;
  const target = vec3.create(cx, cy, heightAt(cx, cy));
  const reach = size / zoom;
  const distance = 1.875 * reach;
  const common = { target, fovY: Math.PI / 3, near: reach / 64, far: reach * 16 };
  const camera: LookAtCamera =
    options.view === 'above'
      ? { ...common, eye: vec3.create(cx, cy, target[2]! + distance), up: vec3.create(0, 1, 0) }
      : options.view === 'below'
        ? { ...common, eye: vec3.create(cx, cy, target[2]! - distance), up: vec3.create(0, 1, 0) }
        : { ...common, eye: vec3.create(cx - 1.1 * reach, cy - 1.1 * reach, target[2]! + 1.1 * reach), up: WORLD_UP };

  const mvp = mat4.create();

  return {
    get terrain(): TerrainStats {
      const totals = terrain.totals;
      return {
        tile: tile.coord,
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
    toggleLighting(): boolean {
      terrain.lit = !terrain.lit;
      return terrain.lit;
    },
    toggleFog(): boolean {
      terrain.fogged = !terrain.fogged;
      return terrain.fogged;
    },
    toggleFar(): boolean {
      return false; // this scene has no far terrain
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
    toggleChunkBounds(): boolean {
      chunkBounds = !chunkBounds;
      return chunkBounds;
    },
    render(aspect: number): FrameStats {
      viewProjectionMatrix(mvp, camera, aspect, backend.info.depthRange);
      backend.beginFrame(terrain.fogBackground({ debugMode, wireframe }) ?? TERRAIN_CHUNK_CLEAR);
      sky.draw(camera, aspect, { debugMode, wireframe });
      last = terrain.draw(mvp, { wireframe, debugMode, chunkBounds, culling, eye: camera.eye });
      return backend.endFrame();
    },
    dispose() {
      terrain.dispose();
      sky.dispose();
    },
  };
}
