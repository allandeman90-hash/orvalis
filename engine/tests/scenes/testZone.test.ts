import { describe, expect, it } from 'vitest';
import { readPublicAsset } from '../../scripts/readAsset.mjs';
import { NullBackend } from '../../src/renderer';
import { parseSceneRequest } from '../../src/scenes/select';
import { createTerrainStreamScene } from '../../src/scenes/terrainStream';
import { testZoneWorld } from '../../src/scenes/testZone';
import { decodeGridZone, gridZoneSampler, MASK_SIZE, ORVALIS_DEFAULT, TEST_ZONE, tileChunkIndex } from '../../src/terrain';

const bytes = readPublicAsset(TEST_ZONE.url);
const options = (search: string) => {
  const request = parseSceneRequest(search);
  if (request.scene !== 'zone') throw new Error('expected the zone scene');
  return { config: ORVALIS_DEFAULT, ...request, frameBudgetMs: Number.POSITIVE_INFINITY, world: testZoneWorld(ORVALIS_DEFAULT, bytes) };
};

describe('scene=zone (M1.1)', () => {
  it('is selected by the URL, starts on the old capital and keeps the stream options', () => {
    const r = parseSceneRequest('?scene=zone');
    expect(r).toMatchObject({ scene: 'zone', focus: { x: -1632, y: -72 }, debugMode: 'textured', paint: 'natural', fog: 'on', farRadius: 3, zoom: 4, heightKind: undefined, streaming: { loadRadius: 1, unloadRadius: 2 } });
    expect(parseSceneRequest('?scene=zone&height=flat&focus=-100,40&far=off&terrainDebug=normals')).toMatchObject({ scene: 'zone', heightKind: undefined, focus: { x: -100, y: 40 }, farRadius: 0, debugMode: 'normals', paint: undefined });
    // The synthetic stream scene is unchanged.
    expect(parseSceneRequest('?scene=stream')).toMatchObject({ scene: 'stream', focus: { x: 256, y: 256 } });
  });

  it('streams the zone under its own name: 6 tiles around the capital (the west side is outside the zone)', () => {
    const backend = new NullBackend();
    const scene = createTerrainStreamScene(backend, options('?scene=zone'));
    for (let k = 0; k < 20; k++) scene.render(16 / 9);
    expect(scene.terrain).toMatchObject({ map: 'val-azur-test', tiles: 6, chunks: 6 * 256, triangles: 6 * 65536 });
    expect(scene.terrain.streaming).toMatchObject({ focusTile: { x: -4, y: -1 }, pending: 0, gpuQueue: 0 });
    expect(scene.terrain.far).toMatchObject({ tiles: 16, radius: 3 });
    expect([...scene.map.tiles()].map((t) => `${t.tile.coord.x},${t.tile.coord.y}`).sort()).toEqual(['-3,-1', '-3,-2', '-3,0', '-4,-1', '-4,-2', '-4,0']);
  });

  it('builds tiles with the zone relief and the zone ground mix', () => {
    const scene = createTerrainStreamScene(new NullBackend(), options('?scene=zone'));
    for (let k = 0; k < 20; k++) scene.render(16 / 9);
    const tile = scene.map.get({ x: -4, y: -1 })!.tile;
    const { heightAt } = gridZoneSampler(decodeGridZone(bytes));
    // Chunk holding the capital centre (−1632, −72): local (416, 440) → chunk (13, 13).
    const chunk = tile.chunks[tileChunkIndex(13, 13)]!;
    expect(chunk.origin).toEqual({ x: -1632, y: -96 });
    expect(chunk.geometry.positions[2]).toBe(Math.fround(heightAt(-1632, -96)));
    expect(chunk.material?.layers).toEqual([0, 1, 2, 3]);
    // Mask texel (0, 48) is at world (−1632, −96 + 48/63 · 32) — inside the cobbled centre: full layer 1, lit.
    const at = (48 * MASK_SIZE + 0) * 4;
    expect([...chunk.material!.mask.subarray(at, at + 4)]).toEqual([255, 255, 0, 0]);
  });

  it('builds no masks when textures are not shown, and follows the ground height with the camera', () => {
    const scene = createTerrainStreamScene(new NullBackend(), options('?scene=zone&terrainDebug=color&far=off'));
    for (let k = 0; k < 20; k++) scene.render(16 / 9);
    expect(scene.map.get({ x: -4, y: -1 })!.tile.chunks[0]!.material).toBeUndefined();
    expect(scene.terrain.far).toBeUndefined();
    scene.setFocus(1e6, 1e6); // outside: nothing exists, nothing throws
    for (let k = 0; k < 20; k++) scene.render(16 / 9);
    expect(scene.terrain.tiles).toBe(0);
  });

  it('refuses a damaged asset with a clear error', () => {
    expect(() => testZoneWorld(ORVALIS_DEFAULT, bytes.subarray(0, 1000))).toThrow(/grid zone: file is 1000 bytes/);
  });
});
