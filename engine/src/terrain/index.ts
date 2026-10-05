export {
  CELLS_PER_CHUNK,
  CELLS_PER_TILE,
  CHUNKS_PER_TILE,
  createTerrainConfig,
  MAX_TRIANGLES_PER_CHUNK,
  ORVALIS_DEFAULT,
  VANILLA_REFERENCE,
  VERTICES_PER_CHUNK,
} from './config';
export type { TerrainConfig } from './config';
export { chunkOrigin, tileOrigin, worldToChunk, worldToTile } from './coords';
export type { ChunkAddress, TileCoord, WorldPoint } from './coords';
export {
  buildChunkGeometry,
  buildChunkIndices,
  buildChunkWireIndices,
  CELLS_PER_HOLE,
  HOLE_GRID,
  holeBit,
  holeCount,
  isCellHole,
  NO_HOLES,
  centerVertexIndex,
  chunkVertexGridPosition,
  outerVertexIndex,
  sampleChunkHeights,
  syntheticChunkHeights,
} from './chunkMesh';
export type { ChunkGeometry, SyntheticHeightKind } from './chunkMesh';
export { accumulateFaceNormals, computeVertexNormals, FALLBACK_NORMAL, normalizeNormalSums } from './chunkNormals';
export type { VertexNormalOptions } from './chunkNormals';
export { buildChunkBorderLineIndices, buildTerrainTile, TILE_BUILD_UNITS, TileBuildJob, TILE_OUTER_NODES, tileChunkIndex, tileHeightFixture, tileOuterNodeIndex } from './tile';
export { TerrainMap, TerrainWorld } from './terrainMap';
export type { MapId, MapTile, TileCoordBounds, TileKind } from './terrainMap';
export { buildFixtureWorld, fixtureTileProvider, heightFieldTileProvider, MAP_FIXTURES, STREAM_FIXTURE } from './mapFixtures';
export type { FixtureTileProvider, MapFixture, MapFixtureId } from './mapFixtures';
export { TerrainStreamer, validateStreamingConfig } from './streaming';
export type { StreamingConfig, StreamingEvents, TileBuild, TileProvider } from './streaming';
export type { TileEdgeSums } from './tile';
export { buildFarTile, FAR_CELLS, FAR_OUTER, FAR_TRIANGLES, FAR_VERTICES, farCenterIndex, farOuterIndex, FarTerrainWindow, farTileIndices, farVertexGridPosition } from './farTerrain';
export type { FarTile, FarWindowEvents } from './farTerrain';
export { buildChunkMask, MASK_LIT, MASK_SIZE, MAX_TERRAIN_LAYERS, paintFixture } from './paint';
export type { ChunkMaterial, LayerAlphaFunction, PaintKind, TerrainPaint } from './paint';
export type { ChunkBounds, TerrainChunk, TerrainTile, TerrainTileOptions, TileHeightKind, TileNormalMode, WorldHeightFunction } from './tile';
export { decodeGridZone, encodeGridZone, GRID_ZONE_MAGIC, gridZonePaint, gridZoneSampler, gridZoneTiles, validateGridZone } from './gridZone';
export type { GridDiagonal, GridZone, GridZoneSampler } from './gridZone';
export { legacyToEngine, TEST_ZONE, testZonePaint } from './testZone';
export { buildChunkLiquidGeometry, LIQUID_CELL_NONE, LIQUID_CELLS, LIQUID_TYPE_CODE, LIQUID_TYPES, LIQUID_VERTEX_FLOATS, LIQUID_VERTICES, LIQUID_VERTICES_PER_SIDE, liquidCellIndex, liquidFixture, liquidTypeOfCell, liquidVertexIndex, sampleChunkLiquid } from './liquid';
export type { ChunkLiquid, ChunkLiquidGeometry, LiquidFixtureKind, LiquidSource, LiquidType } from './liquid';
