import { describe, expect, it } from 'vitest';
import {
  CHUNK_MASK_BYTES,
  MAX_PRODUCTION_TERRAIN_LAYERS,
  MIN_TERRAIN_LAYERS,
  resolveTerrainChunkMaterialContract,
  TERRAIN_CHUNKS_PER_TILE,
  terrainChunkMaterialIndex,
  validateChunkMaterial,
  validateTerrainChunkMaterialContract,
  validateTerrainTextureDefinition,
  validateTerrainTextureLibrary,
  validateTerrainTileMaterialContract,
  type TerrainChunkMaterialContract,
  type TerrainTextureLibrary,
  type TerrainTileMaterialContract,
} from '../../src/terrain';

const library: TerrainTextureLibrary = {
  grass: { id: 'grass', diffuseAsset: '/terrain/grass.png' },
  dirt: { id: 'dirt', diffuseAsset: '/terrain/dirt.png' },
  rock: { id: 'rock', diffuseAsset: '/terrain/rock.png', sheenAsset: '/terrain/rock-sheen.png' },
  road: { id: 'road', diffuseAsset: '/terrain/road.png' },
};

const base: TerrainChunkMaterialContract = { textureIds: ['grass'], alphaMapAssets: [] };
const roadBlend: TerrainChunkMaterialContract = {
  textureIds: ['grass', 'dirt', 'rock', 'road'],
  alphaMapAssets: ['/terrain/a-dirt.bin', '/terrain/a-rock.bin', '/terrain/a-road.bin'],
  bakedShadowAsset: '/terrain/shadow.bin',
  vertexColorAsset: '/terrain/vertex-colors.bin',
};

function tileWith(chunkIndex = 0, material: TerrainChunkMaterialContract = roadBlend): TerrainTileMaterialContract {
  const chunks = Array.from({ length: TERRAIN_CHUNKS_PER_TILE }, () => base);
  chunks[chunkIndex] = material;
  return { id: 'forest_0_0', chunks };
}

describe('V0.2 production terrain material contract', () => {
  it('keeps the Vanilla-like 1..4 layer envelope', () => {
    expect(MIN_TERRAIN_LAYERS).toBe(1);
    expect(MAX_PRODUCTION_TERRAIN_LAYERS).toBe(4);
    expect(() => validateTerrainChunkMaterialContract(base, library)).not.toThrow();
    expect(() => validateTerrainChunkMaterialContract(roadBlend, library)).not.toThrow();
  });

  it('requires exactly one alpha map for every overlay layer', () => {
    expect(() => validateTerrainChunkMaterialContract({ textureIds: ['grass', 'dirt'], alphaMapAssets: [] }, library)).toThrow(/needs exactly 1 alpha map/);
    expect(() => validateTerrainChunkMaterialContract({ textureIds: [], alphaMapAssets: [] }, library)).toThrow(/1\.\.4 texture layers/);
    expect(() => validateTerrainChunkMaterialContract({ textureIds: ['grass', 'dirt', 'rock', 'road', 'grass'], alphaMapAssets: ['a', 'b', 'c', 'd'] }, library)).toThrow(/1\.\.4 texture layers/);
  });

  it('rejects unknown textures and malformed asset ids', () => {
    expect(() => validateTerrainChunkMaterialContract({ textureIds: ['snow'], alphaMapAssets: [] }, library)).toThrow(/unknown terrain texture "snow"/);
    expect(() => validateTerrainTextureDefinition({ id: 'bad', diffuseAsset: '' })).toThrow(/diffuseAsset/);
    expect(() => validateTerrainTextureLibrary({ wrongKey: { id: 'grass', diffuseAsset: '/terrain/grass.png' } })).toThrow(/does not match texture id/);
  });

  it('models all 256 chunk materials independently inside one tile', () => {
    const index = terrainChunkMaterialIndex(3, 5);
    expect(index).toBe(5 * 16 + 3);
    const tile = tileWith(index);
    expect(tile.chunks).toHaveLength(256);
    expect(() => validateTerrainTileMaterialContract(tile, library)).not.toThrow();

    const resolved = resolveTerrainChunkMaterialContract(tile, 3, 5, library);
    expect(resolved.textures.map((texture) => texture.id)).toEqual(['grass', 'dirt', 'rock', 'road']);
    expect(resolved.alphaMapAssets).toHaveLength(3);
    expect(resolved.bakedShadowAsset).toBe('/terrain/shadow.bin');
    expect(resolved.vertexColorAsset).toBe('/terrain/vertex-colors.bin');

    const neighbour = resolveTerrainChunkMaterialContract(tile, 4, 5, library);
    expect(neighbour.textures.map((texture) => texture.id)).toEqual(['grass']);
    expect(neighbour.alphaMapAssets).toEqual([]);
  });

  it('requires exactly 16x16 chunk records and valid chunk coordinates', () => {
    expect(() => validateTerrainTileMaterialContract({ id: 'short', chunks: [base] }, library)).toThrow(/exactly 256 chunk materials/);
    expect(() => terrainChunkMaterialIndex(-1, 0)).toThrow(/chunk coordinates/);
    expect(() => terrainChunkMaterialIndex(16, 0)).toThrow(/chunk coordinates/);
  });

  it('validates the decoded renderer boundary separately from the authored contract', () => {
    const mask = new Uint8Array(CHUNK_MASK_BYTES);
    mask[0] = 255;
    expect(() => validateChunkMaterial({ layers: [0, 1, 2, 3], mask })).not.toThrow();
    expect(() => validateChunkMaterial({ layers: [0, 1, 2, 3], mask: new Uint8Array(8) })).toThrow(/exactly .* bytes/);
    expect(() => validateChunkMaterial({ layers: [0, -1, 2, 3], mask })).toThrow(/integer >= 0/);
  });
});
