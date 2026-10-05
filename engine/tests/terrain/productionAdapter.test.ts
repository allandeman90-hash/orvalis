import { describe, expect, it } from 'vitest';
import { AssetManager, type AssetHandle } from '../../src/assets';
import {
  applyDecodedTerrainMaterials,
  buildTerrainTile,
  decodeProductionTerrainTileMaterials,
  externalTerrainAlphaLoader,
  externalTerrainTextureLoader,
  MASK_LIT,
  ORVALIS_DEFAULT,
  ORVALIS_TERRAIN_ALPHA_ASSET_TYPE,
  ORVALIS_TERRAIN_ALPHA_FORMAT,
  ORVALIS_TERRAIN_TEXTURE_ASSET_TYPE,
  ORVALIS_TERRAIN_TEXTURE_FORMAT,
  TERRAIN_CHUNKS_PER_TILE,
  type ExternalTerrainAlphaAsset,
  type ExternalTerrainTextureAsset,
  type TerrainChunkMaterialContract,
  type TerrainTextureLibrary,
  type TerrainTileMaterialContract,
} from '../../src/terrain';

const textureUrls = {
  grass: '/terrain/grass.orvtexture.json',
  dirt: '/terrain/dirt.orvtexture.json',
  rock: '/terrain/rock.orvtexture.json',
  road: '/terrain/road.orvtexture.json',
} as const;
const alphaUrls = {
  dirt: '/terrain/a-dirt.orvalpha.json',
  rock: '/terrain/a-rock.orvalpha.json',
  road: '/terrain/a-road.orvalpha.json',
} as const;

const library: TerrainTextureLibrary = {
  grass: { id: 'grass', diffuseAsset: textureUrls.grass },
  dirt: { id: 'dirt', diffuseAsset: textureUrls.dirt },
  rock: { id: 'rock', diffuseAsset: textureUrls.rock },
  road: { id: 'road', diffuseAsset: textureUrls.road },
};

const encoded = (value: unknown): ArrayBuffer => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const textureJson = (name: string, rgba: readonly number[]): unknown => ({
  format: ORVALIS_TERRAIN_TEXTURE_FORMAT,
  name,
  width: 1,
  height: 1,
  data: rgba,
});

const alphaJson = (value: number): unknown => ({
  format: ORVALIS_TERRAIN_ALPHA_FORMAT,
  width: 64,
  height: 64,
  data: new Array<number>(64 * 64).fill(value),
});

async function settle(manager: AssetManager, handles: readonly AssetHandle<unknown>[]): Promise<void> {
  const deadline = Date.now() + 5000;
  while (handles.some((handle) => manager.state(handle) === 'requested' || manager.state(handle) === 'downloading')) {
    if (Date.now() > deadline) throw new Error('terrain test assets did not decode in time');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  manager.pump();
}

function authoredTile(): TerrainTileMaterialContract {
  const one: TerrainChunkMaterialContract = { textureIds: ['grass'], alphaMapAssets: [] };
  const two: TerrainChunkMaterialContract = { textureIds: ['grass', 'dirt'], alphaMapAssets: [alphaUrls.dirt] };
  const three: TerrainChunkMaterialContract = { textureIds: ['grass', 'dirt', 'rock'], alphaMapAssets: [alphaUrls.dirt, alphaUrls.rock] };
  const four: TerrainChunkMaterialContract = { textureIds: ['grass', 'dirt', 'rock', 'road'], alphaMapAssets: [alphaUrls.dirt, alphaUrls.rock, alphaUrls.road] };
  const chunks = Array.from({ length: TERRAIN_CHUNKS_PER_TILE }, () => one);
  chunks[1] = two;
  chunks[2] = three;
  chunks[3] = four;
  return { id: 'v2-1-test-tile', chunks };
}

describe('V2.1 external terrain assets', () => {
  it('loads strict diffuse and 64x64 alpha resources through AssetManager', async () => {
    const payloads = new Map<string, ArrayBuffer>([
      [textureUrls.grass, encoded(textureJson('grass', [40, 160, 60, 255]))],
      [alphaUrls.dirt, encoded(alphaJson(96))],
    ]);
    const manager = new AssetManager(async (url) => {
      const bytes = payloads.get(url);
      if (!bytes) throw new Error(`missing test payload ${url}`);
      return bytes;
    });
    const Texture = manager.registerLoader<ExternalTerrainTextureAsset, ExternalTerrainTextureAsset>(ORVALIS_TERRAIN_TEXTURE_ASSET_TYPE, externalTerrainTextureLoader());
    const Alpha = manager.registerLoader<ExternalTerrainAlphaAsset, ExternalTerrainAlphaAsset>(ORVALIS_TERRAIN_ALPHA_ASSET_TYPE, externalTerrainAlphaLoader());
    const texture = manager.request(Texture, textureUrls.grass);
    const alpha = manager.request(Alpha, alphaUrls.dirt);
    await settle(manager, [texture, alpha]);

    expect(manager.state(texture)).toBe('ready');
    expect(manager.state(alpha)).toBe('ready');
    expect(manager.get(texture)).toMatchObject({ sourceUrl: textureUrls.grass, name: 'grass', width: 1, height: 1 });
    expect(manager.get(alpha)?.data).toHaveLength(64 * 64);
    expect(manager.get(alpha)?.data[0]).toBe(96);
  });

  it('rejects malformed diffuse byte counts and non-64x64 alpha maps', async () => {
    const badTexture = new AssetManager(async () => encoded({ ...textureJson('bad', [1, 2, 3, 255]) as object, width: 2 }));
    const Texture = badTexture.registerLoader<ExternalTerrainTextureAsset, ExternalTerrainTextureAsset>(ORVALIS_TERRAIN_TEXTURE_ASSET_TYPE, externalTerrainTextureLoader());
    const texture = badTexture.request(Texture, '/bad-texture.json');
    await settle(badTexture, [texture]);
    expect(badTexture.state(texture)).toBe('failed');
    expect(badTexture.error(texture)?.message).toMatch(/exactly 8 bytes/);

    const badAlpha = new AssetManager(async () => encoded({ format: ORVALIS_TERRAIN_ALPHA_FORMAT, width: 32, height: 64, data: [] }));
    const Alpha = badAlpha.registerLoader<ExternalTerrainAlphaAsset, ExternalTerrainAlphaAsset>(ORVALIS_TERRAIN_ALPHA_ASSET_TYPE, externalTerrainAlphaLoader());
    const alpha = badAlpha.request(Alpha, '/bad-alpha.json');
    await settle(badAlpha, [alpha]);
    expect(badAlpha.state(alpha)).toBe('failed');
    expect(badAlpha.error(alpha)?.message).toMatch(/64×64/);
  });
});

describe('V2.1 production terrain material adapter', () => {
  const textures = new Map<string, ExternalTerrainTextureAsset>([
    [textureUrls.grass, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: textureUrls.grass, name: 'grass', width: 1, height: 1, data: new Uint8Array([40, 160, 60, 255]) }],
    [textureUrls.dirt, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: textureUrls.dirt, name: 'dirt', width: 1, height: 1, data: new Uint8Array([150, 100, 50, 255]) }],
    [textureUrls.rock, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: textureUrls.rock, name: 'rock', width: 1, height: 1, data: new Uint8Array([128, 128, 136, 255]) }],
    [textureUrls.road, { format: ORVALIS_TERRAIN_TEXTURE_FORMAT, sourceUrl: textureUrls.road, name: 'road', width: 1, height: 1, data: new Uint8Array([220, 200, 140, 255]) }],
  ]);
  const alphas = new Map<string, ExternalTerrainAlphaAsset>([
    [alphaUrls.dirt, { format: ORVALIS_TERRAIN_ALPHA_FORMAT, sourceUrl: alphaUrls.dirt, width: 64, height: 64, data: new Uint8Array(64 * 64).fill(64) }],
    [alphaUrls.rock, { format: ORVALIS_TERRAIN_ALPHA_FORMAT, sourceUrl: alphaUrls.rock, width: 64, height: 64, data: new Uint8Array(64 * 64).fill(128) }],
    [alphaUrls.road, { format: ORVALIS_TERRAIN_ALPHA_FORMAT, sourceUrl: alphaUrls.road, width: 64, height: 64, data: new Uint8Array(64 * 64).fill(255) }],
  ]);

  it('decodes independent 1..4 layer chunks into the existing RGBA mask convention', () => {
    const decoded = decodeProductionTerrainTileMaterials(authoredTile(), library, textures, alphas);
    expect(decoded.palette.map((texture) => texture.name)).toEqual(['dirt', 'grass', 'road', 'rock']);

    const grass = 1, dirt = 0, road = 2, rock = 3;
    expect(decoded.chunks[0]!.layers).toEqual([grass, grass, grass, grass]);
    expect(decoded.chunks[1]!.layers).toEqual([grass, dirt, grass, grass]);
    expect(decoded.chunks[2]!.layers).toEqual([grass, dirt, rock, grass]);
    expect(decoded.chunks[3]!.layers).toEqual([grass, dirt, rock, road]);

    expect([...decoded.chunks[0]!.mask.slice(0, 4)]).toEqual([MASK_LIT, 0, 0, 0]);
    expect([...decoded.chunks[1]!.mask.slice(0, 4)]).toEqual([MASK_LIT, 64, 0, 0]);
    expect([...decoded.chunks[2]!.mask.slice(0, 4)]).toEqual([MASK_LIT, 64, 128, 0]);
    expect([...decoded.chunks[3]!.mask.slice(0, 4)]).toEqual([MASK_LIT, 64, 128, 255]);
  });

  it('keeps baked shadow/vertex colour deferred to V2.2 and rejects unloaded source assets', () => {
    const tile = authoredTile();
    const chunks = [...tile.chunks];
    chunks[0] = { ...chunks[0]!, bakedShadowAsset: '/terrain/shadow.bin', vertexColorAsset: '/terrain/mccv.bin' };
    const decoded = decodeProductionTerrainTileMaterials({ ...tile, chunks }, library, textures, alphas);
    expect(decoded.chunks[0]!.mask[0]).toBe(MASK_LIT);

    expect(() => decodeProductionTerrainTileMaterials(tile, library, new Map(), alphas)).toThrow(/unloaded diffuse texture/);
    expect(() => decodeProductionTerrainTileMaterials(tile, library, textures, new Map())).toThrow(/unloaded alpha map/);
  });

  it('attaches all 256 decoded materials to an existing tile without rebuilding its geometry', () => {
    const plain = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => 0);
    expect(plain.chunks[0]!.material).toBeUndefined();
    const decoded = decodeProductionTerrainTileMaterials(authoredTile(), library, textures, alphas);
    const materialized = applyDecodedTerrainMaterials(plain, decoded);

    expect(materialized.chunks).toHaveLength(TERRAIN_CHUNKS_PER_TILE);
    expect(materialized.chunks[0]!.geometry).toBe(plain.chunks[0]!.geometry);
    expect(materialized.chunks[1]!.material?.layers).toEqual([1, 0, 1, 1]);
    expect(plain.chunks[1]!.material).toBeUndefined();
  });
});
