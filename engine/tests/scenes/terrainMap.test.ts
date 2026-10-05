import { describe, expect, it } from 'vitest';
import { NullBackend } from '../../src/renderer';
import { parseSceneRequest } from '../../src/scenes/select';
import { createTerrainMapScene } from '../../src/scenes/terrainMap';
import { buildFixtureWorld, ORVALIS_DEFAULT, TerrainMap } from '../../src/terrain';

const world = buildFixtureWorld(ORVALIS_DEFAULT, 'flat');
const draws = (backend: NullBackend) => backend.events.flatMap((e) => (e.type === 'draw' ? [e] : []));

describe('terrain map scene (backend-agnostic)', () => {
  it('draws the resident tiles only: 3 tiles → 768 chunks, one draw each', () => {
    const backend = new NullBackend();
    const scene = createTerrainMapScene(backend, { map: world.get('archipel')!, view: 'above' });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 768, triangles: 3 * 65536 });
    expect(scene.terrain).toEqual({ map: 'archipel', tiles: 3, chunks: 768, vertices: 3 * 37120, triangles: 3 * 65536, submittedChunks: 768, drawCalls: 768, culling: true, visibleChunks: 768, culledChunks: 0, holes: 0, wireframe: false, debugMode: 'color', chunkBounds: false, lit: true, sky: false });
    expect(new Set(draws(backend).map((d) => d.call.vertexBuffer)).size).toBe(768);
    // 768 vertex buffers + triangles + wire + bounds: the 3 absent tiles of the rectangle allocate nothing.
    expect(backend.liveBufferCount).toBe(768 + 3);
    scene.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });

  it('another map of the same world, far from the origin', () => {
    const backend = new NullBackend();
    const scene = createTerrainMapScene(backend, { map: world.get('bande')!, view: 'oblique' });
    expect(scene.render(16 / 9).drawCalls).toBe(512);
    expect(scene.terrain).toMatchObject({ map: 'bande', tiles: 2, chunks: 512, visibleChunks: 512 });
    expect(Array.from(draws(backend)[0]!.call.uniforms!).every(Number.isFinite)).toBe(true);
  });

  it('culling works across tiles; wireframe and bounds follow', () => {
    const backend = new NullBackend();
    const scene = createTerrainMapScene(backend, { map: world.get('archipel')!, view: 'above', zoom: 6 });
    // Rectangle 1536 × 1024 centred on (256, 512); zoom 6: half-height 277.1 → y in [234.9, 789.1] → chunk rows 7..24 (18);
    // half-width 492.7 → x in [−236.7, 748.7] → chunk columns −8..23 (32). Resident among them:
    //   tile (0,0): columns 0..15 × rows 7..15 = 144 ; tile (−1,0): columns −8..−1 × rows 7..15 = 72 ; tile (1,1): columns 16..23 × rows 16..24 = 72.
    scene.render(16 / 9);
    expect(scene.terrain).toMatchObject({ visibleChunks: 288, culledChunks: 480, submittedChunks: 288 });
    scene.toggleChunkBounds();
    scene.toggleWireframe();
    backend.events.length = 0;
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 576, triangles: 0 });
    expect(scene.toggleCulling()).toBe(false);
    backend.events.length = 0;
    expect(scene.render(16 / 9).drawCalls).toBe(1536);
    expect(scene.terrain.visibleChunks).toBeUndefined();
  });

  it('an empty map cannot be shown, and says so', () => {
    expect(() => createTerrainMapScene(new NullBackend(), { map: new TerrainMap('vide', ORVALIS_DEFAULT), view: 'above' })).toThrow(/no tile/);
  });
});

describe('scene request — map', () => {
  it('reads the map options', () => {
    expect(parseSceneRequest('?scene=map')).toEqual({ scene: 'map', paint: undefined, palette: 'procedural', layerRepeatsPerChunk: 4, lit: true, fog: 'off', sky: false, liquidLevel: 0, map: 'archipel', heightKind: undefined, view: 'oblique', zoom: 1, wireframe: false, debugMode: 'color', chunkBounds: false, culling: true });
    expect(parseSceneRequest('?scene=map&map=bande&height=flat&view=above&zoom=6&chunkBounds=on&culling=off')).toEqual({ scene: 'map', paint: undefined, palette: 'procedural', layerRepeatsPerChunk: 4, lit: true, fog: 'off', sky: false, liquidLevel: 0, map: 'bande', heightKind: 'flat', view: 'above', zoom: 6, wireframe: false, debugMode: 'color', chunkBounds: true, culling: false });
    expect(parseSceneRequest('?scene=map&map=atlantide&height=cliff')).toMatchObject({ map: 'archipel', heightKind: undefined });
  });
});
