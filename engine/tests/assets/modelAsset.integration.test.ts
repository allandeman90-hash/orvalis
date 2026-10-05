import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetManager, type AssetHandle, httpFetchBytes } from '../../src/assets';
import { AnimationPlayer, computeBoneMatrices, externalModelAssetLoader, ORVALIS_MODEL_ASSET_TYPE, type ExternalModelAsset } from '../../src/model';
import { ModelRenderer } from '../../src/modelRender';
import { mat4 } from '../../src/math';
import { NullBackend } from '../../src/renderer';

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
  server = await createServer({ logLevel: 'silent', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite dev server did not report a local URL');
  baseUrl = url;
});

afterAll(async () => {
  await server.close();
});

async function untilSettled(assets: AssetManager, handle: AssetHandle<unknown>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (assets.state(handle) === 'requested' || assets.state(handle) === 'downloading') {
    if (Date.now() > deadline) throw new Error('external model still downloading after 10 s');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('V1.1 external model asset over real HTTP', () => {
  it('downloads, decodes, validates, animates and renders one original Orvalis model through the existing pipeline', async () => {
    const assets = new AssetManager(httpFetchBytes(baseUrl));
    const ModelAsset = assets.registerLoader<ExternalModelAsset, ExternalModelAsset>(ORVALIS_MODEL_ASSET_TYPE, externalModelAssetLoader());
    const handle = assets.request(ModelAsset, 'assets/models/v1-1-crystal.orvmodel.json');

    expect(assets.state(handle)).toBe('downloading');
    await untilSettled(assets, handle);
    expect(assets.state(handle)).toBe('decoded');
    expect(assets.pump()).toBe(1);
    expect(assets.state(handle)).toBe('ready');

    const asset = assets.get(handle);
    expect(asset).toBeDefined();
    expect(asset!.sourceUrl).toBe('assets/models/v1-1-crystal.orvmodel.json');
    expect(asset!.mesh.name).toBe('v1-1-orvalis-crystal');
    expect(asset!.mesh.vertexCount).toBe(6);
    expect(asset!.mesh.indices.length / 3).toBe(8);
    expect(asset!.skeleton.bones).toHaveLength(1);
    expect(asset!.animation.sequences[0]?.name).toBe('idle');
    expect(asset!.texture).toMatchObject({ width: 2, height: 2 });

    const player = new AnimationPlayer(asset!.animation);
    player.play(0);
    player.advance(1000);
    const palette = computeBoneMatrices(asset!.skeleton, player.poses());
    expect(palette).toHaveLength(16);
    expect(palette[0]).not.toBe(1); // the idle sequence has turned the root slightly around Z

    const backend = new NullBackend();
    const renderer = new ModelRenderer(backend, 'external-model-v1-1');
    const model = renderer.addModel(asset!.mesh, asset!.texture);
    const identity = mat4.identity(mat4.create());

    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ model, matrix: identity, palette }], { debugMode: 'lit' });
    const frame = backend.endFrame();

    expect(result).toEqual({ instances: 1, triangles: 8, draws: 1 });
    expect(frame).toEqual({ drawCalls: 1, triangles: 8 });
    expect(backend.liveBufferCount).toBe(2);
    expect(backend.liveTextureCount).toBe(1);
    renderer.dispose();
    expect(backend.liveBufferCount).toBe(0);
    expect(backend.liveTextureCount).toBe(0);
  });

  it('fails the asset instead of accepting malformed external model data', async () => {
    const malformed = new TextEncoder().encode(JSON.stringify({ format: 'orvalis-model-1', mesh: {} })).buffer as ArrayBuffer;
    const assets = new AssetManager(async () => malformed);
    const ModelAsset = assets.registerLoader<ExternalModelAsset, ExternalModelAsset>(ORVALIS_MODEL_ASSET_TYPE, externalModelAssetLoader());
    const handle = assets.request(ModelAsset, 'broken.orvmodel.json');
    await untilSettled(assets, handle);
    expect(assets.state(handle)).toBe('failed');
    expect(assets.error(handle)?.message).toMatch(/mesh\.positions|mesh\.name|must be an array/);
    expect(assets.pump()).toBe(0);
  });
});
