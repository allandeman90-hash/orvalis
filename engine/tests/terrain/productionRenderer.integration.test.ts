import { describe, expect, it } from 'vitest';
import { NullBackend } from '../../src/renderer';
import {
  applyDecodedTerrainMaterials,
  buildTerrainTile,
  decodeProductionTerrainTileMaterials,
  ORVALIS_DEFAULT,
  ORVALIS_TERRAIN_ALPHA_FORMAT,
  ORVALIS_TERRAIN_TEXTURE_FORMAT,
  TERRAIN_CHUNKS_PER_TILE,
  type ExternalTerrainAlphaAsset,
  type ExternalTerrainTextureAsset,
  type TerrainChunkMaterialContract,
  type TerrainTextureLibrary,
  type TerrainTileMaterialContract,
} from '../../src/terrain';
import { TerrainRenderer } from '../../src/terrainRender';

const grassUrl = '/terrain/grass.orvtexture.json';
const dirtUrl = '/terrain/dirt.orvtexture.json';
const alphaUrl = '/terrain/dirt.orvalpha.json';

const library: TerrainTextureLibrary = {
  grass: { id: 'grass', diffuseAsset: grassUrl },
  dirt: { id: 'dirt', diffuseAsset: dirtUrl },
};

const textures = new Map<string, ExternalTerrainTextureAsset>([
  [grassUrl, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: grassUrl, name: 'grass', width: 1, height: 1, data: new Uint8Array([40, 160, 60, 255]) }],
  [dirtUrl, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: dirtUrl, name: 'dirt', width: 1, height: 1, data: new Uint8Array([150, 100, 50, 255]) }],
]);
const alphas = new Map<string, ExternalTerrainAlphaAsset>([
  [alphaUrl, { format: ORVALIS_TERRAIN_ALPHA_FORMAT, sourceUrl: alphaUrl, width: 64, height: 64, data: new Uint8Array(64 * 64).fill(128) }],
]);

function materialTile(): TerrainTileMaterialContract {
  const blended: TerrainChunkMaterialContract = { textureIds: ['grass', 'dirt'], alphaMapAssets: [alphaUrl] };
  return { id: 'renderer-integration', chunks: Array.from({ length: TERRAIN_CHUNKS_PER_TILE }, () => blended) };
}

describe('V2.1 production terrain → renderer boundary', () => {
  it('uploads a production palette and one independent 64x64 mask per chunk through the existing TerrainRenderer', () => {
    const decoded = decodeProductionTerrainTileMaterials(materialTile(), library, textures, alphas);
    const source = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => 0);
    const tile = applyDecodedTerrainMaterials(source, decoded);

    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [1, 1, 1], 'v2-1-production', {
      palette: decoded.palette,
      layerRepeatsPerChunk: 4,
      lit: false,
    });
    renderer.addTile(tile);

    expect(renderer.totals.tiles).toBe(1);
    expect(renderer.totals.chunks).toBe(TERRAIN_CHUNKS_PER_TILE);
    // 2 shared layer textures + 1 shared default mask + one independent production mask per chunk.
    expect(backend.liveTextureCount).toBe(2 + 1 + TERRAIN_CHUNKS_PER_TILE);

    renderer.dispose();
    expect(backend.liveTextureCount).toBe(0);
  });
});
