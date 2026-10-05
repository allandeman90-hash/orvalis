import { describe, expect, it } from 'vitest';
import { NullBackend, TERRAIN_TEXTURED_SHADER } from '../../src/renderer';
import { createTerrainTileScene } from '../../src/scenes/terrainTile';
import { buildFarTile, buildTerrainTile, farCenterIndex, ORVALIS_DEFAULT, paintFixture, tileHeightFixture } from '../../src/terrain';
import { DEFAULT_FOG_COLOR, DEFAULT_TERRAIN_LIGHTING, fogFactor, lightingUniforms, meanColour, proceduralPalette, SOLID_PALETTE_COLOURS, solidPalette, terrainLight, TerrainRenderer, UNLIT_TERRAIN_LIGHTING } from '../../src/terrainRender';

const config = ORVALIS_DEFAULT;
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const draws = (backend: NullBackend) => backend.events.flatMap((e) => (e.type === 'draw' ? [e] : []));
const options = { wireframe: false, chunkBounds: false, culling: false } as const;
const frame = (backend: NullBackend, renderer: TerrainRenderer, debugMode: 'color' | 'normals' | 'textured', wireframe = false) => {
  backend.events.length = 0;
  backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
  renderer.draw(identity, { ...options, debugMode, wireframe });
  backend.endFrame();
  return draws(backend);
};

describe('layer textures made by code', () => {
  it('procedural palette: 4 square power-of-two RGBA textures, opaque, deterministic, with distinct average colours', () => {
    const a = proceduralPalette(), b = proceduralPalette();
    expect(a.map((t) => t.name)).toEqual(['grass', 'dirt', 'rock', 'path']);
    for (let i = 0; i < 4; i++) {
      expect([a[i]!.width, a[i]!.height, a[i]!.data.length]).toEqual([128, 128, 128 * 128 * 4]);
      expect(Array.from(a[i]!.data)).toEqual(Array.from(b[i]!.data));
      for (let k = 3; k < a[i]!.data.length; k += 4 * 97) expect(a[i]!.data[k]).toBe(255);
      expect(new Set(a[i]!.data.filter((_, k) => k % 4 === 1)).size).toBeGreaterThan(30); // it is a texture, not a flat colour
    }
    const means = a.map(meanColour);
    expect(means[0]![1]).toBeGreaterThan(means[0]![0] + 30); // grass is green
    expect(means[1]![0]).toBeGreaterThan(means[1]![2] + 30); // dirt is brown
    expect(Math.abs(means[2]![0] - means[2]![2])).toBeLessThan(15); // rock is grey
    expect(means[3]![0]).toBeGreaterThan(180); // the path is light
  });

  it('procedural textures tile: the left and right columns continue each other', () => {
    for (const t of proceduralPalette(64)) {
      let jump = 0, inside = 0;
      for (let y = 0; y < 64; y++) {
        jump += Math.abs(t.data[(y * 64 + 63) * 4 + 1]! - t.data[y * 64 * 4 + 1]!); // wrap-around neighbours
        inside += Math.abs(t.data[(y * 64 + 31) * 4 + 1]! - t.data[(y * 64 + 32) * 4 + 1]!); // ordinary neighbours
      }
      expect(jump).toBeLessThan(inside * 2 + 64);
    }
  });

  it('solid palette: exact flat colours', () => {
    const p = solidPalette();
    expect(p.length).toBe(4);
    p.forEach((t, i) => expect(meanColour(t)).toEqual([...SOLID_PALETTE_COLOURS[i]!]));
  });
});

describe('TerrainRenderer — textured mode', () => {
  const material = { palette: solidPalette(), layerRepeatsPerChunk: 4 };
  const painted = buildTerrainTile(config, { x: -2, y: 3 }, tileHeightFixture(config, 'flat'), { paint: paintFixture(config, 'quadrants') });

  it('each chunk is drawn with its 4 layer textures and ITS OWN mask, and with its own origin in the uniforms', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    expect(backend.liveTextureCount).toBe(4 + 1); // palette + default mask
    renderer.addTile(painted);
    expect(backend.liveTextureCount).toBe(5 + 256);
    const all = frame(backend, renderer, 'textured');
    expect(all.length).toBe(256);
    expect(all.every((d) => d.call.textures?.length === 5 && backend.pipelineState(d.call.pipeline)?.textureCount === 5)).toBe(true);
    expect(new Set(all.map((d) => d.call.textures![4])).size).toBe(256); // 256 different masks
    expect(new Set(all.flatMap((d) => d.call.textures!.slice(0, 4))).size).toBe(4); // the same 4 layers everywhere
    // Mask: 64 × 64, clamped, not mip-mapped. Layers: repeating, mip-mapped.
    expect(backend.textureInfo(all[0]!.call.textures![4]!)).toMatchObject({ width: 64, height: 64, wrap: 'clamp', filter: 'linear' });
    expect(backend.textureInfo(all[0]!.call.textures![4]!).levels.length).toBe(1);
    expect(backend.textureInfo(all[0]!.call.textures![0]!)).toMatchObject({ wrap: 'repeat', filter: 'linear' });
    expect(backend.textureInfo(all[0]!.call.textures![0]!).levels.length).toBeGreaterThan(1);
    // The mask uploaded for a chunk is that chunk's mask.
    all.forEach((d, c) => expect(backend.textureInfo(d.call.textures![4]!).levels[0]).toBe(painted.chunks[c]!.material!.mask));
    // Uniforms: matrix, then (origin x, origin y, 1 / chunkSize, repeats / chunkSize).
    all.forEach((d, c) => {
      const chunk = painted.chunks[c]!;
      expect(d.call.uniforms!.byteLength).toBe(176);
      expect(Array.from(d.call.uniforms!.slice(16, 20))).toEqual([chunk.origin.x, chunk.origin.y, 1 / 32, 4 / 32]);
    });
    expect(painted.chunks[0]!.origin).toEqual({ x: -1024, y: 1536 });
  });

  it('removing a tile frees its 256 masks; dispose frees everything', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(painted);
    renderer.removeTile(painted.coord);
    expect(backend.liveTextureCount).toBe(5);
    renderer.addTile(painted);
    renderer.dispose();
    expect([backend.liveTextureCount, backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('a tile without material is drawn with the shared default mask (base layer only), not skipped', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(buildTerrainTile(config, { x: 0, y: 0 }, () => 0));
    expect(backend.liveTextureCount).toBe(5); // no mask of its own
    const all = frame(backend, renderer, 'textured');
    expect(all.length).toBe(256);
    expect(new Set(all.map((d) => d.call.textures![4])).size).toBe(1);
    const mask = backend.textureInfo(all[0]!.call.textures![4]!);
    expect([mask.width, mask.height, Array.from(mask.levels[0]!)]).toEqual([1, 1, [255, 0, 0, 0]]);
  });

  it('debug views and wireframe still use the debug shader, without textures', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(painted);
    for (const mode of ['color', 'normals'] as const) expect(frame(backend, renderer, mode).every((d) => d.call.textures === undefined)).toBe(true);
    const wire = frame(backend, renderer, 'textured', true);
    expect(wire.every((d) => d.call.textures === undefined && backend.pipelineState(d.call.pipeline)?.topology === 'line-list')).toBe(true);
  });

  it('a layer id outside the palette falls back to texture 0; bad material options are refused', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(buildTerrainTile(config, { x: 0, y: 0 }, () => 0, { paint: { layers: [0, 9, 2, 3], alphaAt: () => [0, 0, 0] } }));
    const t = frame(backend, renderer, 'textured')[0]!.call.textures!;
    expect(t[1]).toBe(t[0]);
    expect(() => new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', { palette: [], layerRepeatsPerChunk: 4 })).toThrow(/palette/);
    expect(() => new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', { palette: solidPalette(), layerRepeatsPerChunk: 0 })).toThrow(/layerRepeatsPerChunk/);
  });

  it('the shader pair declares the same 5 textures on both sides', () => {
    for (let i = 0; i < 5; i++) expect(TERRAIN_TEXTURED_SHADER.glslFragment).toContain(`uniform sampler2D u_texture${i};`);
    for (let binding = 1; binding <= 10; binding++) expect(TERRAIN_TEXTURED_SHADER.wgsl).toContain(`@binding(${binding})`);
    expect(TERRAIN_TEXTURED_SHADER.wgsl).not.toContain('@binding(11)');
  });

  it('tile scene in textured mode: 256 textured draws, same statistics', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { config, tile: { x: 0, y: 0 }, heightKind: 'hills', view: 'oblique', debugMode: 'textured', paint: 'natural' });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 256, triangles: 65536 });
    expect(scene.terrain).toMatchObject({ debugMode: 'textured', chunks: 256, submittedChunks: 256 });
    expect(draws(backend).every((d) => d.call.textures?.length === 5)).toBe(true);
    scene.dispose();
    expect([backend.liveTextureCount, backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});

describe('terrain lighting (P1.10)', () => {
  const material = { palette: solidPalette(), layerRepeatsPerChunk: 4 };
  const tile = buildTerrainTile(config, { x: 0, y: 0 }, tileHeightFixture(config, 'flat'), { paint: paintFixture(config, 'shadow') });
  const lightOf = (backend: NullBackend, renderer: TerrainRenderer): number[] => Array.from(frame(backend, renderer, 'textured')[0]!.call.uniforms!.slice(20, 32));
  const close = (got: number[], want: number[]): void => got.forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 6));

  it('the formula: ambient + diffuse · max(N·L, 0), times the baked shadow', () => {
    const l = { toLight: [0, 0, 2] as const, ambient: [0.2, 0.3, 0.4] as const, diffuse: [0.5, 0.4, 0.3] as const, shadowFactor: 0.5 };
    close(terrainLight(l, [0, 0, 1]), [0.7, 0.7, 0.7]); // facing the light (toLight is normalised)
    close(terrainLight(l, [1, 0, 0]), [0.2, 0.3, 0.4]); // edge-on: ambient only
    close(terrainLight(l, [0, 0, -1]), [0.2, 0.3, 0.4]); // facing away: never negative
    close(terrainLight(l, [0, 0.6, 0.8]), [0.6, 0.62, 0.64]); // N·L = 0.8
    close(terrainLight(l, [0, 0, 1], 0), [0.35, 0.35, 0.35]); // full baked shadow → × shadowFactor
    close(terrainLight(l, [0, 0, 1], 0.5), [0.525, 0.525, 0.525]); // half shadow → × 0.75
    close(terrainLight(UNLIT_TERRAIN_LIGHTING, [0.6, 0, 0.8], 0), [1, 1, 1]); // « off » changes nothing
  });

  it('uniforms: unit toLight + shadowFactor, ambient, diffuse — after the matrix and the chunk vector', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(tile);
    const d = DEFAULT_TERRAIN_LIGHTING, len = Math.hypot(...d.toLight);
    close(lightOf(backend, renderer), [d.toLight[0] / len, d.toLight[1] / len, d.toLight[2] / len, d.shadowFactor, ...d.ambient, 0, ...d.diffuse, 0]);
    expect(Math.hypot(...lightOf(backend, renderer).slice(0, 3))).toBeCloseTo(1, 6);
    // Every chunk of the frame gets the same light.
    const all = frame(backend, renderer, 'textured');
    expect(new Set(all.map((x) => Array.from(x.call.uniforms!.slice(20, 32)).join())).size).toBe(1);
    renderer.setLighting({ toLight: [0, 3, 4], ambient: [0.1, 0.1, 0.1], diffuse: [1, 1, 1], shadowFactor: 0.25 });
    close(lightOf(backend, renderer), [0, 0.6, 0.8, 0.25, 0.1, 0.1, 0.1, 0, 1, 1, 1, 0]);
  });

  it('setEnvironment (day/night) replaces the light colours and the fog colour, and nothing else', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(tile);
    renderer.setFog({ color: [0.1, 0.2, 0.3], start: 50, end: 150 });
    renderer.setEnvironment({ ambient: [0.11, 0.12, 0.13], diffuse: [0.5, 0.6, 0.7], fogColor: [0.9, 0.8, 0.7] });
    const d = DEFAULT_TERRAIN_LIGHTING, len = Math.hypot(...d.toLight);
    // Direction and shadow factor kept; colours replaced.
    close(lightOf(backend, renderer), [d.toLight[0] / len, d.toLight[1] / len, d.toLight[2] / len, d.shadowFactor, 0.11, 0.12, 0.13, 0, 0.5, 0.6, 0.7, 0]);
    // Fog: colour replaced (and the clear colour with it), distances kept.
    expect(renderer.fogBackground({ debugMode: 'textured', wireframe: false })).toEqual({ r: 0.9, g: 0.8, b: 0.7, a: 1 });
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: false, eye: [1, 2, 3] });
    backend.endFrame();
    const draw = backend.events.find((e) => e.type === 'draw');
    if (draw?.type !== 'draw') throw new Error('no draw');
    close(Array.from(draw.call.uniforms!.slice(36, 39)), [0.9, 0.8, 0.7]);
    close(Array.from(draw.call.uniforms!.slice(40, 42)), [50, 1 / 100]);
    // With a direction (the lighting sun): it replaces toLight, normalised; the shadow factor is still kept.
    renderer.setEnvironment({ ambient: [0.11, 0.12, 0.13], diffuse: [0.5, 0.6, 0.7], fogColor: [0.9, 0.8, 0.7], toLight: [0, 3, 4] });
    close(lightOf(backend, renderer), [0, 0.6, 0.8, d.shadowFactor, 0.11, 0.12, 0.13, 0, 0.5, 0.6, 0.7, 0]);
    // …and a later call without direction leaves it where it is.
    renderer.setEnvironment({ ambient: [0.2, 0.2, 0.2], diffuse: [0.5, 0.6, 0.7], fogColor: [0.9, 0.8, 0.7] });
    close(lightOf(backend, renderer).slice(0, 3), [0, 0.6, 0.8]);
    // Without a fog, only the light changes; unlit stays unlit.
    renderer.setFog(null);
    renderer.setEnvironment({ ambient: [0.2, 0.2, 0.2], diffuse: [0.3, 0.3, 0.3], fogColor: [0, 0, 0] });
    expect(renderer.hasFog).toBe(false);
    renderer.lit = false;
    close(lightOf(backend, renderer), [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(() => renderer.setEnvironment({ ambient: [Number.NaN, 0, 0], diffuse: [0, 0, 0], fogColor: [0, 0, 0] })).toThrow(/finite/);
  });

  it('lighting off = ambient 1, no diffuse, shadows without effect; and it can be switched at run time', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', { ...material, lit: false });
    renderer.addTile(tile);
    expect(renderer.lit).toBe(false);
    close(lightOf(backend, renderer), [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    renderer.lit = true;
    expect(lightOf(backend, renderer)[3]).toBeCloseTo(DEFAULT_TERRAIN_LIGHTING.shadowFactor, 6);
  });

  it('bad lighting is refused', () => {
    const base = DEFAULT_TERRAIN_LIGHTING;
    expect(() => lightingUniforms({ ...base, toLight: [0, 0, 0] })).toThrow(/zero vector/);
    expect(() => lightingUniforms({ ...base, shadowFactor: 1.5 })).toThrow(/shadowFactor/);
    expect(() => lightingUniforms({ ...base, ambient: [Number.NaN, 0, 0] })).toThrow(/finite/);
    expect(() => new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', { ...material, lighting: { ...base, shadowFactor: -1 } })).toThrow(/shadowFactor/);
  });

  it('the baked shadow is the R channel of the mask: 255 lit, 0 in shadow, and it has no seam between chunks', () => {
    const r = (cx: number, cy: number, i: number, j: number): number => tile.chunks[cy * 16 + cx]!.material!.mask[(j * 64 + i) * 4]!;
    expect(r(3, 5, 32, 32)).toBe(255); // west half: lit
    expect(r(12, 5, 32, 32)).toBe(0); // east half: shadow
    expect(r(8, 5, 0, 10)).toBe(127); // exactly on the middle line: half (255 − round(127.5))
    for (let cy = 0; cy < 16; cy += 5) for (let cx = 0; cx < 15; cx++) for (let k = 0; k < 64; k += 9) expect(r(cx, cy, 63, k)).toBe(r(cx + 1, cy, 0, k));
    // The other paints have no baked shadow at all.
    const natural = buildTerrainTile(config, { x: 0, y: 0 }, tileHeightFixture(config, 'flat'), { paint: paintFixture(config, 'natural') });
    expect(natural.chunks[77]!.material!.mask.filter((_, k) => k % 4 === 0).every((v) => v === 255)).toBe(true);
  });

  it('the shader pair computes the light in the vertex shader, on both sides', () => {
    for (const source of [TERRAIN_TEXTURED_SHADER.glslVertex, TERRAIN_TEXTURED_SHADER.wgsl.split('@fragment')[0]!]) {
      expect(source).toMatch(/max\(dot\((a_)?normal, (u_light|globals\.light)\.xyz\), 0\.0\)/);
    }
    expect(TERRAIN_TEXTURED_SHADER.glslFragment).not.toContain('dot(');
    expect(TERRAIN_TEXTURED_SHADER.wgsl.split('@fragment')[1]).not.toContain('dot(');
  });

  it('scenes: lighting is on by default, and L toggles it', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { config, tile: { x: 0, y: 0 }, heightKind: 'flat', view: 'above', debugMode: 'textured', paint: 'shadow' });
    scene.render(1);
    expect(scene.terrain.lit).toBe(true);
    expect(scene.toggleLighting()).toBe(false);
    backend.events.length = 0;
    scene.render(1);
    expect(scene.terrain.lit).toBe(false);
    close(Array.from(draws(backend)[0]!.call.uniforms!.slice(24, 28)), [1, 1, 1, 0]);
  });
});

describe('terrain fog (P1.11)', () => {
  const material = { palette: solidPalette(), layerRepeatsPerChunk: 4 };
  const fog = { color: [0.2, 0.4, 0.6] as const, start: 100, end: 300 };
  const tile = buildTerrainTile(config, { x: 0, y: 0 }, tileHeightFixture(config, 'flat'));
  const fogOf = (backend: NullBackend, renderer: TerrainRenderer, eye?: number[]): number[] => {
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { ...options, debugMode: 'textured', ...(eye ? { eye } : {}) });
    backend.endFrame();
    return Array.from(draws(backend)[0]!.call.uniforms!.slice(32, 44));
  };

  it('the formula: 0 before start, 1 from end, linear in between', () => {
    expect([0, 99, 100, 150, 200, 299.9999, 300, 5000].map((d) => fogFactor(fog, d))).toEqual([0, 0, 0, 0.25, 0.5, expect.closeTo(1, 5), 1, 1]);
  });

  it('uniforms: camera position, fog colour, (start, 1 / (end − start))', () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', { ...material, fog });
    renderer.addTile(tile);
    expect(renderer.hasFog).toBe(true);
    const u = fogOf(backend, renderer, [10, -20, 30]);
    [10, -20, 30, 0, 0.2, 0.4, 0.6, 0, 100, 1 / 200, 0, 0].forEach((v, k) => expect(u[k]).toBeCloseTo(v, 6));
  });

  it('no fog configured, fog switched off, or no camera position → range (0, 0): the factor is 0 everywhere', () => {
    const backend = new NullBackend();
    const plain = new TerrainRenderer(backend, () => [0, 0, 0], 'plain', material);
    plain.addTile(tile);
    expect(plain.hasFog).toBe(false);
    expect(fogOf(backend, plain, [1, 2, 3])).toEqual(new Array(12).fill(0));
    const fogged = new TerrainRenderer(backend, () => [0, 0, 0], 'fogged', { ...material, fog });
    fogged.addTile(buildTerrainTile(config, { x: 1, y: 0 }, tileHeightFixture(config, 'flat')));
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    fogged.draw(identity, { ...options, debugMode: 'textured' }); // no eye
    backend.endFrame();
    expect(Array.from(draws(backend)[0]!.call.uniforms!.slice(32, 44))).toEqual(new Array(12).fill(0));
    fogged.fogged = false;
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    fogged.draw(identity, { ...options, debugMode: 'textured', eye: [1, 2, 3] });
    backend.endFrame();
    expect(Array.from(draws(backend)[0]!.call.uniforms!.slice(32, 44))).toEqual(new Array(12).fill(0));
  });

  it('the background takes the fog colour only when the fog really applies', () => {
    const renderer = new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'test', { ...material, fog });
    const bg = renderer.fogBackground({ debugMode: 'textured', wireframe: false })!;
    [bg.r, bg.g, bg.b, bg.a].forEach((v, k) => expect(v).toBeCloseTo([0.2, 0.4, 0.6, 1][k]!, 6));
    expect(renderer.fogBackground({ debugMode: 'color', wireframe: false })).toBeNull(); // debug views are never fogged
    expect(renderer.fogBackground({ debugMode: 'textured', wireframe: true })).toBeNull();
    renderer.fogged = false;
    expect(renderer.fogBackground({ debugMode: 'textured', wireframe: false })).toBeNull();
    renderer.fogged = true;
    renderer.setFog(null);
    expect(renderer.fogBackground({ debugMode: 'textured', wireframe: false })).toBeNull();
  });

  it('bad fog is refused', () => {
    expect(() => new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', { ...material, fog: { ...fog, end: 100 } })).toThrow(/start < end/);
    expect(() => new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', { ...material, fog: { ...fog, start: -1 } })).toThrow(/start < end/);
    const renderer = new TerrainRenderer(new NullBackend(), () => [0, 0, 0], 'x', material);
    expect(() => renderer.setFog({ ...fog, color: [Number.NaN, 0, 0] })).toThrow(/finite/);
  });

  it('scenes: the tile scene has no fog unless asked; with fog the frame is cleared with the fog colour, and F toggles it', () => {
    const backend = new NullBackend();
    const plain = createTerrainTileScene(backend, { config, tile: { x: 0, y: 0 }, heightKind: 'flat', view: 'above', debugMode: 'textured' });
    plain.render(1);
    expect(plain.terrain.fog).toBeUndefined();
    const scene = createTerrainTileScene(backend, { config, tile: { x: 0, y: 0 }, heightKind: 'flat', view: 'above', debugMode: 'textured', fog: { start: 900, end: 1100 } });
    const clearOf = (): number[] => {
      backend.events.length = 0;
      scene.render(1);
      const begin = backend.events[0]!;
      return begin.type === 'beginFrame' ? [begin.clear.r, begin.clear.g, begin.clear.b] : [];
    };
    clearOf().forEach((v, k) => expect(v).toBeCloseTo(DEFAULT_FOG_COLOR[k]!, 6));
    expect(scene.terrain.fog).toBe(true);
    // The camera of the « above » view is 960 above the flat ground.
    const u = draws(backend)[0]!.call.uniforms!;
    expect(Array.from(u.slice(32, 35))).toEqual([256, 256, 960]);
    expect([u[40], u[41]]).toEqual([900, Math.fround(1 / 200)]);
    expect(scene.toggleFog()).toBe(false);
    expect(clearOf()).not.toEqual([...DEFAULT_FOG_COLOR].map(Math.fround));
    expect(scene.terrain.fog).toBe(false);
  });
});

describe('far terrain rendering (P1.12)', () => {
  const material = { palette: solidPalette(), layerRepeatsPerChunk: 4 };
  const far = buildFarTile(config, { x: 1, y: 0 }, tileHeightFixture(config, 'flat'), paintFixture(config, 'quadrants'));
  const detailed = buildTerrainTile(config, { x: 0, y: 0 }, tileHeightFixture(config, 'flat'), { paint: paintFixture(config, 'quadrants') });
  const setup = () => {
    const backend = new NullBackend();
    const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
    renderer.addTile(detailed);
    renderer.addFarTile(far);
    return { backend, renderer };
  };

  it('one draw of 1024 triangles per far tile, BEFORE the detailed chunks, in the back slice of the depth buffer', () => {
    const { backend, renderer } = setup();
    expect(renderer.farTileCount).toBe(1);
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, { ...options, debugMode: 'textured' });
    backend.endFrame();
    const all = draws(backend);
    expect(result).toEqual({ visibleChunks: 256, submittedChunks: 256, farTilesDrawn: 1, liquidChunksDrawn: 0, liquidFrame: 0 });
    expect(all.length).toBe(257);
    expect([all[0]!.call.indexCount, all[0]!.triangles]).toEqual([3072, 1024]);
    expect(backend.pipelineState(all[0]!.call.pipeline)).toMatchObject({ depthRange: [0.955, 0.96], depthTest: true, depthWrite: true, textureCount: 0 });
    // Everything detailed is mapped in front of that slice.
    for (const d of all.slice(1)) expect(backend.pipelineState(d.call.pipeline)!.depthRange).toEqual([0, 0.955]);
    expect((backend.bufferData(all[0]!.call.vertexBuffer) as Float32Array).length).toBe(545 * 9);
  });

  it('vertex colours are the layers\' average colours blended like the textures; same light and fog uniforms as the detailed terrain', () => {
    const { backend, renderer } = setup();
    renderer.setFog({ color: [0.1, 0.2, 0.3], start: 50, end: 150 });
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { ...options, debugMode: 'textured', eye: [1, 2, 3] });
    backend.endFrame();
    const [farDraw, firstChunk] = draws(backend);
    const data = backend.bufferData(farDraw!.call.vertexBuffer) as Float32Array;
    const colourAt = (i: number, j: number): number[] => Array.from(data.subarray(farCenterIndex(i, j) * 9 + 6, farCenterIndex(i, j) * 9 + 9)).map((v) => Math.round(v * 255));
    expect(colourAt(3, 3)).toEqual([...SOLID_PALETTE_COLOURS[0]!]);
    expect(colourAt(12, 3)).toEqual([...SOLID_PALETTE_COLOURS[1]!]);
    expect(colourAt(3, 12)).toEqual([...SOLID_PALETTE_COLOURS[2]!]);
    expect(colourAt(12, 12)).toEqual([...SOLID_PALETTE_COLOURS[3]!]);
    const f = Array.from(farDraw!.call.uniforms!), d = Array.from(firstChunk!.call.uniforms!);
    expect(farDraw!.call.uniforms!.byteLength).toBe(160);
    expect(f.slice(16, 19)).toEqual(d.slice(20, 23)); // unit toLight
    expect(f.slice(20, 40)).toEqual(d.slice(24, 44)); // ambient, diffuse, eye, fog colour, fog range
    expect(f.slice(28, 31)).toEqual([1, 2, 3]);
  });

  it('own projection matrix and own frustum culling', () => {
    const { backend, renderer } = setup();
    const farMatrix = new Float32Array(identity);
    farMatrix[0] = 0.5;
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    // With the identity matrix the visible volume is the cube −1..1: tile (1,0) starts at x = 512 → culled.
    const culled = renderer.draw(identity, { ...options, debugMode: 'textured', culling: true });
    backend.endFrame();
    expect(culled.farTilesDrawn).toBe(0);
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { ...options, debugMode: 'textured', farViewProjection: farMatrix });
    backend.endFrame();
    expect(draws(backend)[0]!.call.uniforms![0]).toBe(0.5);
    expect(draws(backend)[1]!.call.uniforms![0]).toBe(1);
  });

  it('not drawn in the debug views, in wireframe, or when switched off; removed without leak', () => {
    const { backend, renderer } = setup();
    const count = (debugMode: 'color' | 'normals' | 'textured', wireframe = false): number => frame(backend, renderer, debugMode, wireframe).filter((d) => d.call.indexCount === 3072).length;
    expect([count('textured'), count('color'), count('normals'), count('textured', true)]).toEqual([1, 0, 0, 0]);
    renderer.farVisible = false;
    expect(count('textured')).toBe(0);
    renderer.farVisible = true;
    expect(() => renderer.addFarTile(far)).toThrow(/already uploaded/);
    const before = backend.liveBufferCount;
    expect(renderer.removeFarTile(far.coord)).toBe(true);
    expect(renderer.removeFarTile(far.coord)).toBe(false);
    expect(backend.liveBufferCount).toBe(before - 1);
    expect(count('textured')).toBe(0);
    renderer.addFarTile(far);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});
