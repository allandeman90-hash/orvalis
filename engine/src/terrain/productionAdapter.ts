import { CHUNKS_PER_TILE } from './config';
import { CHUNK_MASK_BYTES, MASK_LIT, MASK_SIZE, type ChunkMaterial, validateChunkMaterial } from './paint';
import {
  resolveTerrainChunkMaterialContract,
  terrainChunkMaterialIndex,
  validateTerrainTileMaterialContract,
  type TerrainTextureLibrary,
  type TerrainTileMaterialContract,
} from './productionContract';
import type { ExternalTerrainAlphaAsset, ExternalTerrainTextureAsset } from './productionAssets';
import type { TerrainTile } from './tile';

export type TerrainTextureAssetRegistry = ReadonlyMap<string, ExternalTerrainTextureAsset>;
export type TerrainAlphaAssetRegistry = ReadonlyMap<string, ExternalTerrainAlphaAsset>;

/** Renderer-ready material set for one authored material tile. */
export interface DecodedTerrainTileMaterials {
  readonly tileId: string;
  /** Stable palette shared by every chunk in the tile; entries are external original diffuse assets. */
  readonly palette: readonly ExternalTerrainTextureAsset[];
  /** Exactly 256 renderer-ready chunk materials in y-major order. */
  readonly chunks: readonly ChunkMaterial[];
}

function requireTexture(sourceUrl: string, assets: TerrainTextureAssetRegistry): ExternalTerrainTextureAsset {
  const asset = assets.get(sourceUrl);
  if (!asset) throw new Error(`terrain adapter: unloaded diffuse texture "${sourceUrl}"`);
  if (asset.sourceUrl !== sourceUrl) throw new Error(`terrain adapter: diffuse registry key "${sourceUrl}" contains asset from "${asset.sourceUrl}"`);
  return asset;
}

function requireAlpha(sourceUrl: string, assets: TerrainAlphaAssetRegistry): ExternalTerrainAlphaAsset {
  const asset = assets.get(sourceUrl);
  if (!asset) throw new Error(`terrain adapter: unloaded alpha map "${sourceUrl}"`);
  if (asset.sourceUrl !== sourceUrl) throw new Error(`terrain adapter: alpha registry key "${sourceUrl}" contains asset from "${asset.sourceUrl}"`);
  if (asset.width !== MASK_SIZE || asset.height !== MASK_SIZE || asset.data.length !== MASK_SIZE * MASK_SIZE) {
    throw new Error(`terrain adapter: alpha map "${sourceUrl}" must be ${MASK_SIZE}×${MASK_SIZE}`);
  }
  return asset;
}

/**
 * Converts one V0.2 production material tile into the existing P1 decoded renderer boundary.
 *
 * V2.1 intentionally writes R=255 (fully lit): authored baked shadow and MCCV stay untouched for V2.2.
 * G/B/A are the normalized 8-bit alpha maps of overlay layers 1/2/3.
 */
export function decodeProductionTerrainTileMaterials(
  tile: TerrainTileMaterialContract,
  library: TerrainTextureLibrary,
  textures: TerrainTextureAssetRegistry,
  alphas: TerrainAlphaAssetRegistry,
): DecodedTerrainTileMaterials {
  validateTerrainTileMaterialContract(tile, library);

  // The authored library is a set, not a palette order. Sort stable ids so the renderer indices are deterministic
  // across JSON/object construction order and across tiles built from the same library.
  const textureIds = Object.keys(library).sort();
  const palette = textureIds.map((id) => requireTexture(library[id]!.diffuseAsset, textures));
  const paletteIndex = new Map(textureIds.map((id, index) => [id, index] as const));
  const chunks: ChunkMaterial[] = new Array(CHUNKS_PER_TILE * CHUNKS_PER_TILE);

  for (let chunkY = 0; chunkY < CHUNKS_PER_TILE; chunkY++) {
    for (let chunkX = 0; chunkX < CHUNKS_PER_TILE; chunkX++) {
      const resolved = resolveTerrainChunkMaterialContract(tile, chunkX, chunkY, library);
      const baseIndex = paletteIndex.get(resolved.textures[0]!.id)!;
      const layers: [number, number, number, number] = [baseIndex, baseIndex, baseIndex, baseIndex];
      for (let layer = 0; layer < resolved.textures.length; layer++) layers[layer] = paletteIndex.get(resolved.textures[layer]!.id)!;

      const mask = new Uint8Array(CHUNK_MASK_BYTES);
      // V2.2 owns baked shadow. Until then every production chunk is fully lit in the R channel.
      for (let texel = 0; texel < MASK_SIZE * MASK_SIZE; texel++) mask[texel * 4] = MASK_LIT;
      for (let overlay = 0; overlay < resolved.alphaMapAssets.length; overlay++) {
        const alpha = requireAlpha(resolved.alphaMapAssets[overlay]!, alphas).data;
        const channel = overlay + 1;
        for (let texel = 0; texel < alpha.length; texel++) mask[texel * 4 + channel] = alpha[texel]!;
      }

      const material: ChunkMaterial = { layers, mask };
      validateChunkMaterial(material, `tile "${tile.id}" chunk ${chunkX},${chunkY}`);
      chunks[terrainChunkMaterialIndex(chunkX, chunkY)] = material;
    }
  }

  return { tileId: tile.id, palette, chunks };
}

/**
 * Attaches already-decoded production materials to an existing terrain tile without rebuilding positions/normals.
 * This is the seam that lets current topology/streaming stay unchanged while production world data stops using
 * one synthetic TerrainPaint for all 256 chunks.
 */
export function applyDecodedTerrainMaterials(tile: TerrainTile, decoded: DecodedTerrainTileMaterials): TerrainTile {
  if (decoded.chunks.length !== tile.chunks.length) {
    throw new Error(`terrain adapter: tile ${tile.coord.x},${tile.coord.y} has ${tile.chunks.length} chunks but material set has ${decoded.chunks.length}`);
  }
  const chunks = tile.chunks.map((chunk, index) => {
    const material = decoded.chunks[index];
    if (!material) throw new Error(`terrain adapter: missing decoded material for chunk index ${index}`);
    validateChunkMaterial(material, `chunk index ${index}`);
    return { ...chunk, material };
  });
  return { ...tile, chunks };
}
