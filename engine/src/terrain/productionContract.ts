import { CHUNKS_PER_TILE } from './config';

/**
 * Production-facing terrain material contract.
 *
 * The renderer's current TerrainPaint is intentionally a procedural fixture API. Real Orvalis world data must
 * instead describe each chunk independently, matching the Vanilla/OpenWow architecture where every MCNK owns its
 * own MCLY/MCAL/MCSH/MCCV inputs. This contract keeps authored asset references separate from the decoded GPU
 * representation (ChunkMaterial), so V1 loaders can choose their own original file format.
 *
 * Primary reference: master 1.12.1 spec §§7–9.
 * Secondary reference: OpenWow MapChunk / MapTile material loading.
 */

export const MIN_TERRAIN_LAYERS = 1;
export const MAX_PRODUCTION_TERRAIN_LAYERS = 4;
export const TERRAIN_CHUNKS_PER_TILE = CHUNKS_PER_TILE * CHUNKS_PER_TILE;

/** One reusable ground surface in the world material library. */
export interface TerrainTextureDefinition {
  readonly id: string;
  /** Original Orvalis diffuse/albedo image; deliberately non-PBR. */
  readonly diffuseAsset: string;
  /** Optional weak sheen/specular mask for the old-school terrain highlight path. */
  readonly sheenAsset?: string;
}

export type TerrainTextureLibrary = Readonly<Record<string, TerrainTextureDefinition>>;

/**
 * Visual inputs owned by one terrain chunk.
 *
 * `textureIds[0]` is the base. Every following layer has exactly one 64×64 alpha-map asset in the same order.
 * The source asset encoding is intentionally unspecified: loaders may use compact authoring data and normalize it
 * to 8-bit weights before building the renderer's combined mask.
 *
 * Baked shadow and vertex colour stay separate here even though a renderer may pack shadow + alphas together.
 * That preserves the source concepts and lets V2.2 consume MCCV-like vertex colours without changing world data.
 */
export interface TerrainChunkMaterialContract {
  readonly textureIds: readonly string[];
  readonly alphaMapAssets: readonly string[];
  /** Optional 64×64 baked shadow source. */
  readonly bakedShadowAsset?: string;
  /** Optional per-vertex colour source for the chunk's 145 terrain vertices. */
  readonly vertexColorAsset?: string;
}

/** 256 chunk-material records, y-major: index = chunkY * 16 + chunkX. */
export interface TerrainTileMaterialContract {
  readonly id: string;
  readonly chunks: readonly TerrainChunkMaterialContract[];
}

export interface ResolvedTerrainChunkMaterialContract {
  readonly tileId: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly textures: readonly TerrainTextureDefinition[];
  readonly alphaMapAssets: readonly string[];
  readonly bakedShadowAsset?: string;
  readonly vertexColorAsset?: string;
}

function fail(message: string): never {
  throw new Error(`terrain contract: ${message}`);
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
}

function validateOptionalAsset(value: string | undefined, label: string): void {
  if (value !== undefined) nonEmpty(value, label);
}

export function validateTerrainTextureDefinition(texture: TerrainTextureDefinition): void {
  nonEmpty(texture.id, 'texture id');
  nonEmpty(texture.diffuseAsset, `texture "${texture.id}" diffuseAsset`);
  validateOptionalAsset(texture.sheenAsset, `texture "${texture.id}" sheenAsset`);
}

export function validateTerrainTextureLibrary(library: TerrainTextureLibrary): void {
  for (const [key, texture] of Object.entries(library)) {
    validateTerrainTextureDefinition(texture);
    if (key !== texture.id) fail(`texture library key "${key}" does not match texture id "${texture.id}"`);
  }
}

export function validateTerrainChunkMaterialContract(material: TerrainChunkMaterialContract, library: TerrainTextureLibrary, label = 'chunk material'): void {
  const count = material.textureIds.length;
  if (!Number.isInteger(count) || count < MIN_TERRAIN_LAYERS || count > MAX_PRODUCTION_TERRAIN_LAYERS) {
    fail(`${label} must have ${MIN_TERRAIN_LAYERS}..${MAX_PRODUCTION_TERRAIN_LAYERS} texture layers (got ${count})`);
  }
  if (material.alphaMapAssets.length !== count - 1) {
    fail(`${label} with ${count} texture layer(s) needs exactly ${count - 1} alpha map(s) (got ${material.alphaMapAssets.length})`);
  }
  for (const [index, id] of material.textureIds.entries()) {
    nonEmpty(id, `${label} textureIds[${index}]`);
    if (!library[id]) fail(`${label} references unknown terrain texture "${id}"`);
  }
  for (const [index, asset] of material.alphaMapAssets.entries()) nonEmpty(asset, `${label} alphaMapAssets[${index}]`);
  validateOptionalAsset(material.bakedShadowAsset, `${label} bakedShadowAsset`);
  validateOptionalAsset(material.vertexColorAsset, `${label} vertexColorAsset`);
}

export function terrainChunkMaterialIndex(chunkX: number, chunkY: number): number {
  if (!Number.isInteger(chunkX) || chunkX < 0 || chunkX >= CHUNKS_PER_TILE || !Number.isInteger(chunkY) || chunkY < 0 || chunkY >= CHUNKS_PER_TILE) {
    fail(`chunk coordinates must be integers in 0..${CHUNKS_PER_TILE - 1} (got ${chunkX}, ${chunkY})`);
  }
  return chunkY * CHUNKS_PER_TILE + chunkX;
}

export function validateTerrainTileMaterialContract(tile: TerrainTileMaterialContract, library: TerrainTextureLibrary): void {
  nonEmpty(tile.id, 'tile id');
  validateTerrainTextureLibrary(library);
  if (tile.chunks.length !== TERRAIN_CHUNKS_PER_TILE) {
    fail(`tile "${tile.id}" needs exactly ${TERRAIN_CHUNKS_PER_TILE} chunk materials (got ${tile.chunks.length})`);
  }
  for (let chunkY = 0; chunkY < CHUNKS_PER_TILE; chunkY++) {
    for (let chunkX = 0; chunkX < CHUNKS_PER_TILE; chunkX++) {
      const index = terrainChunkMaterialIndex(chunkX, chunkY);
      validateTerrainChunkMaterialContract(tile.chunks[index]!, library, `tile "${tile.id}" chunk ${chunkX},${chunkY}`);
    }
  }
}

export function resolveTerrainChunkMaterialContract(
  tile: TerrainTileMaterialContract,
  chunkX: number,
  chunkY: number,
  library: TerrainTextureLibrary,
): ResolvedTerrainChunkMaterialContract {
  const index = terrainChunkMaterialIndex(chunkX, chunkY);
  if (tile.chunks.length !== TERRAIN_CHUNKS_PER_TILE) {
    fail(`tile "${tile.id}" needs exactly ${TERRAIN_CHUNKS_PER_TILE} chunk materials before resolution`);
  }
  const material = tile.chunks[index]!;
  validateTerrainChunkMaterialContract(material, library, `tile "${tile.id}" chunk ${chunkX},${chunkY}`);
  const textures = material.textureIds.map((id) => library[id]!);
  return {
    tileId: tile.id,
    chunkX,
    chunkY,
    textures,
    alphaMapAssets: material.alphaMapAssets,
    ...(material.bakedShadowAsset !== undefined ? { bakedShadowAsset: material.bakedShadowAsset } : {}),
    ...(material.vertexColorAsset !== undefined ? { vertexColorAsset: material.vertexColorAsset } : {}),
  };
}
