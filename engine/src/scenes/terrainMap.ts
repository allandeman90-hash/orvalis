import { createSceneSky } from './sceneSky';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, vec3 } from '../math';
import type { FrameStats, RendererBackend, TerrainDebugMode } from '../renderer';
import type { TerrainMap } from '../terrain';
import { type TerrainMaterialOptions, TerrainRenderer } from '../terrainRender';
import { type ChunkView, TERRAIN_CHUNK_CLEAR, type TerrainStats } from './terrainChunk';
import type { TerrainEnvironment, TerrainTileScene } from './terrainTile';

export interface TerrainMapSceneOptions {
  /** Layer textures and their scale; the alpha maps come with the tiles of the map. */
  readonly material?: TerrainMaterialOptions;
  readonly map: TerrainMap;
  readonly view: ChunkView;
  /** 1 = all resident tiles in view; larger values move the camera closer to the centre of their bounding rectangle. */
  readonly zoom?: number;
  readonly wireframe?: boolean;
  readonly debugMode?: TerrainDebugMode;
  readonly chunkBounds?: boolean;
  readonly culling?: boolean;
  /** Sky behind the textured terrain. Default false. */
  readonly sky?: boolean | undefined;
}

/**
 * P1.7 test scene: every resident tile of one sparse TerrainMap, still one
 * vertex buffer and one draw per chunk, culled per chunk. Absent tiles cost
 * nothing: the scene only walks map.tiles().
 *
 * The map is read ONCE, when the scene is created (no streaming yet, P1.8).
 * The drawing itself is done by TerrainRenderer.
 */
export function createTerrainMapScene(backend: RendererBackend, options: TerrainMapSceneOptions): TerrainTileScene {
  const { map } = options;
  const coordBounds = map.coordBounds();
  if (!coordBounds) throw new Error(`scene: map "${map.id}" has no tile to show`);
  const tileSize = map.config.tileSize;
  const minX = coordBounds.minX * tileSize, minY = coordBounds.minY * tileSize;
  const width = (coordBounds.maxX - coordBounds.minX + 1) * tileSize, height = (coordBounds.maxY - coordBounds.minY + 1) * tileSize;

  let wireframe = options.wireframe ?? false;
  let debugMode: TerrainDebugMode = options.debugMode ?? 'color';
  let chunkBounds = options.chunkBounds ?? false;
  let culling = options.culling ?? true;
  let last = { visibleChunks: 0, submittedChunks: 0, liquidChunksDrawn: 0, liquidFrame: 0 };

  let minHeight = Number.POSITIVE_INFINITY, maxHeight = Number.NEGATIVE_INFINITY;
  for (const { tile } of map.tiles()) {
    minHeight = Math.min(minHeight, tile.minHeight);
    maxHeight = Math.max(maxHeight, tile.maxHeight);
  }
  const heightSpan = maxHeight - minHeight || 1;
  // Colours span the rectangle of resident tiles: red with x, green with y, blue with height.
  const terrain = new TerrainRenderer(backend, (x, y, z) => [0.15 + 0.7 * ((x - minX) / width), 0.15 + 0.7 * ((y - minY) / height), 0.2 + 0.6 * ((z - minHeight) / heightSpan)], 'map', options.material);
  const sky = createSceneSky(backend, options.sky ?? false);
  for (const { tile } of map.tiles()) terrain.addTile(tile);

  const zoom = options.zoom ?? 1;
  if (!(zoom >= 1) || !Number.isFinite(zoom)) throw new Error(`scene: zoom must be a finite number ≥ 1 (got ${zoom})`);
  const cx = minX + width / 2, cy = minY + height / 2;
  // The centre of the rectangle may be over an absent tile: aim at the middle height of the map instead of sampling the ground.
  const target = vec3.create(cx, cy, (minHeight + maxHeight) / 2);
  const reach = Math.max(width, height) / zoom;
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
      return false; // this scene has no far terrain
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
