import { describe, expect, it } from 'vitest';
import { LIQUID_UNIFORM_BYTES, NullBackend } from '../../src/renderer';
import { parseSceneRequest } from '../../src/scenes/select';
import { createTerrainStreamScene } from '../../src/scenes/terrainStream';
import { createTerrainTileScene } from '../../src/scenes/terrainTile';
import { buildTerrainTile, liquidFixture, ORVALIS_DEFAULT, tileChunkIndex } from '../../src/terrain';
import { DEFAULT_TERRAIN_LIGHTING, LIQUID_MATERIALS, LIQUID_PASS_ORDER, LIQUID_ANIMATION_FRAMES, LIQUID_ANIMATION_PERIOD_MS, liquidFrameAt, liquidFrames, type LiquidMaterial, liquidTint, liquidAlphaTable, liquidDepthAlpha, OCEAN_DEPTH_SCALE, oceanDepthTable, RIVER_DEPTH_SCALE, riverDepthTable, solidFrameFactor, solidPalette, terrainLight, TerrainRenderer, validateLiquidMaterials } from '../../src/terrainRender';

/** The lake fixture is river-class. */
const RIVER_ALPHA = LIQUID_MATERIALS.river.alpha;

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const close = (a: readonly number[], b: readonly number[], digits = 6): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};
const ground = (x: number, y: number): number => 6 * Math.sin(x / 40) * Math.cos(y / 55);
const lake = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, ground, { liquid: liquidFixture(512, 'lake', 20) });
const classes = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, () => -1, { liquid: liquidFixture(512, 'classes', 0) });
const dry = buildTerrainTile(ORVALIS_DEFAULT, { x: 0, y: 0 }, ground);
const material = { palette: solidPalette(), layerRepeatsPerChunk: 4, lit: true };

function setup(tile = lake) {
  const backend = new NullBackend();
  const renderer = new TerrainRenderer(backend, () => [0, 0, 0], 'test', material);
  renderer.addTile(tile);
  return { backend, renderer };
}
function liquidDraws(backend: NullBackend, renderer: TerrainRenderer, options: Partial<Parameters<TerrainRenderer['draw']>[1]> = {}) {
  backend.events.length = 0;
  backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
  const result = renderer.draw(identity, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: false, ...options });
  backend.endFrame();
  const draws = backend.events.filter((e) => e.type === 'draw');
  const liquid = draws.filter((e) => e.type === 'draw' && backend.pipelineState(e.call.pipeline)?.blend === 'alpha');
  return { result, draws, liquid };
}

describe('liquid rendering (P3.1)', () => {
  it('uploads one vertex buffer and one index buffer per liquid class for each chunk that has liquid', () => {
    const wet = lake.chunks.filter((c) => c.liquid).length;
    const { backend, renderer } = setup();
    const dryBackend = new NullBackend();
    new TerrainRenderer(dryBackend, () => [0, 0, 0], 'test', material).addTile(dry);
    expect(backend.liveBufferCount).toBe(dryBackend.liveBufferCount + 2 * wet);
    expect(renderer.totals).toMatchObject({ liquidChunks: wet, liquidCells: lake.chunks.reduce((n, c) => n + (c.liquid?.cellCount ?? 0), 0) });
    // Four classes in the 4 chunks around the tile centre → more index buffers there.
    const four = setup(classes);
    const centre = classes.chunks[tileChunkIndex(8, 8)]!;
    expect(centre.liquid!.cellCount).toBe(64);
    expect(four.renderer.totals).toMatchObject({ liquidChunks: 256, liquidCells: 256 * 64 });
  });

  it('draws the liquids LAST, blended, depth-tested but not depth-written, in the detailed depth slice', () => {
    const { backend, renderer } = setup();
    const wet = lake.chunks.filter((c) => c.liquid).length;
    const { result, draws, liquid } = liquidDraws(backend, renderer);
    expect(result.liquidChunksDrawn).toBe(wet);
    expect(liquid.length).toBe(wet); // one class per chunk here
    // Every liquid draw comes after every terrain draw.
    const firstLiquid = draws.indexOf(liquid[0]!);
    expect(firstLiquid).toBe(draws.length - wet);
    const first = liquid[0]!;
    if (first.type !== 'draw') throw new Error('no draw');
    expect(backend.pipelineState(first.call.pipeline)).toMatchObject({ blend: 'alpha', depthTest: true, depthWrite: false, cullMode: 'none', depthRange: [0, 0.955], uniformBytes: LIQUID_UNIFORM_BYTES, textureCount: 1 });
    // The terrain pipelines stay opaque.
    const terrainDraw = draws[0]!;
    if (terrainDraw.type !== 'draw') throw new Error('no draw');
    expect(backend.pipelineState(terrainDraw.call.pipeline)).toMatchObject({ blend: 'opaque', depthWrite: true });
    // A full chunk: 64 cells × 2 triangles; vertices: 81 × (x, y, z, depth).
    const fullChunk = liquid.find((e) => e.type === 'draw' && e.triangles === 128);
    if (fullChunk?.type !== 'draw') throw new Error('no full chunk');
    expect((backend.bufferData(fullChunk.call.vertexBuffer) as Float32Array).length).toBe(81 * 4);
  });

  it('gives the shader the light on flat ground as tint, the class alpha, and the terrain\'s fog', () => {
    const { backend, renderer } = setup();
    renderer.setFog({ color: [0.1, 0.2, 0.3], start: 50, end: 150 });
    const uniformsOf = (options = {}): number[] => {
      const { liquid } = liquidDraws(backend, renderer, options);
      const d = liquid[0]!;
      if (d.type !== 'draw') throw new Error('no draw');
      return Array.from(d.call.uniforms!);
    };
    const light = terrainLight(DEFAULT_TERRAIN_LIGHTING, [0, 0, 1]);
    let u = uniformsOf({ eye: [1, 2, 3] });
    close(u.slice(0, 16), Array.from(identity));
    close(u.slice(16, 20), [light[0], light[1], light[2], RIVER_ALPHA]); // the tint multiplies the texture
    expect(u[32]).toBeCloseTo(1 / 16, 6); // one texture repeat every 16 world units
    close(u.slice(20, 23), [1, 2, 3]);
    close(u.slice(24, 27), [0.1, 0.2, 0.3]);
    close(u.slice(28, 30), [50, 1 / 100]);
    // Lighting off, or the colour debug view: the raw colour; debug view: no fog either.
    renderer.lit = false;
    close(uniformsOf({ eye: [1, 2, 3] }).slice(16, 20), [1, 1, 1, RIVER_ALPHA]);
    renderer.lit = true;
    u = uniformsOf({ eye: [1, 2, 3], debugMode: 'color' });
    close(u.slice(16, 20), [1, 1, 1, RIVER_ALPHA]);
    close(u.slice(28, 30), [0, 0]);
    // Night light darkens the liquid too.
    renderer.setEnvironment({ ambient: [0.1, 0.1, 0.1], diffuse: [0, 0, 0], fogColor: [0, 0, 0] });
    close(uniformsOf({ eye: [1, 2, 3] }).slice(16, 19), [0.1, 0.1, 0.1]);
  });

  it('is not drawn in wireframe, in the normals view, or when switched off', () => {
    const { backend, renderer } = setup();
    expect(liquidDraws(backend, renderer, { wireframe: true }).liquid).toHaveLength(0);
    expect(liquidDraws(backend, renderer, { debugMode: 'normals' }).liquid).toHaveLength(0);
    expect(liquidDraws(backend, renderer, { debugMode: 'color' }).liquid.length).toBeGreaterThan(0);
    renderer.liquidVisible = false;
    const off = liquidDraws(backend, renderer);
    expect(off.liquid).toHaveLength(0);
    expect(off.result.liquidChunksDrawn).toBe(0);
  });

  it('is culled with its chunk, whose box contains the liquid', () => {
    const { backend, renderer } = setup();
    // A view that sees nothing: a projection that pushes everything outside the clip volume.
    const away = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1e9, 0, 0, 1]);
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(away, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: true });
    backend.endFrame();
    expect(result).toMatchObject({ visibleChunks: 0, liquidChunksDrawn: 0 });
  });

  it('frees the liquid buffers with the tile', () => {
    const { backend, renderer } = setup();
    const before = backend.liveBufferCount;
    renderer.removeTile({ x: 0, y: 0 });
    expect(backend.liveBufferCount).toBeLessThan(before - 256);
    expect(renderer.totals).toMatchObject({ liquidChunks: 0, liquidCells: 0 });
    renderer.dispose();
    expect([backend.liveBufferCount, backend.livePipelineCount]).toEqual([0, 0]);
  });
});

describe('liquid classes = distinct material behaviours (P3.2, spec §26)', () => {
  it('river and ocean are blended, lit and fogged; magma is opaque and full-bright; all four differ', () => {
    validateLiquidMaterials(LIQUID_MATERIALS);
    expect(LIQUID_MATERIALS.river).toMatchObject({ blend: 'alpha', lit: true, fogged: true });
    expect(LIQUID_MATERIALS.ocean).toMatchObject({ blend: 'alpha', lit: true, fogged: true });
    expect(LIQUID_MATERIALS.magma).toMatchObject({ blend: 'opaque', lit: false });
    expect(LIQUID_MATERIALS.slime.blend).toBe('alpha');
    expect(new Set(Object.values(LIQUID_MATERIALS).map((m) => m.color.join())).size).toBe(4);
    expect(LIQUID_MATERIALS.ocean.alpha).toBeGreaterThan(LIQUID_MATERIALS.river.alpha);
    expect(LIQUID_PASS_ORDER).toEqual(['magma', 'river', 'ocean', 'slime']);
  });

  it('shades a lit class with the light and leaves a full-bright one alone', () => {
    const night = [0.1, 0.12, 0.2] as const;
    close(liquidTint(LIQUID_MATERIALS.ocean, night), [0.1, 0.12, 0.2, 0.75]);
    close(liquidTint(LIQUID_MATERIALS.magma, night), [1, 1, 1, 1]);
  });

  it('refuses broken materials, and an opaque class placed after a blended one', () => {
    const bad = (change: Partial<LiquidMaterial>) => ({ ...LIQUID_MATERIALS, ocean: { ...LIQUID_MATERIALS.ocean, ...change } });
    expect(() => validateLiquidMaterials(bad({ alpha: 1.5 }))).toThrow(/ocean.alpha/);
    expect(() => validateLiquidMaterials(bad({ color: [2, 0, 0] }))).toThrow(/ocean.color/);
    expect(() => validateLiquidMaterials(bad({ blend: 'opaque', depthScale: 0 }))).toThrow(/opaque classes must come before/);
    expect(() => validateLiquidMaterials(bad({ blend: 'opaque' }))).toThrow(/ocean is opaque, it cannot have a depth response/);
    expect(() => validateLiquidMaterials(bad({ depthScale: -1 }))).toThrow(/ocean.depthScale/);
    expect(() => validateLiquidMaterials({ ...LIQUID_MATERIALS, slime: undefined as unknown as LiquidMaterial })).toThrow(/"slime" has no material/);
  });

  it('draws one pass per class: magma first with the opaque pipeline, then river, ocean, slime blended', () => {
    const { backend, renderer } = setup(classes);
    renderer.setEnvironment({ ambient: [0.1, 0.12, 0.2], diffuse: [0, 0, 0], fogColor: [0, 0, 0] }); // a night: lit classes go dark
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: false });
    backend.endFrame();
    expect(result.liquidChunksDrawn).toBe(256);
    const draws = backend.events.filter((e) => e.type === 'draw').slice(256); // after the 256 terrain chunks
    const kinds = draws.map((e) => {
      if (e.type !== 'draw') throw new Error('no draw');
      const state = backend.pipelineState(e.call.pipeline)!;
      return `${state.blend}/${state.depthWrite ? 'write' : 'nowrite'}/${Array.from(e.call.uniforms!.slice(16, 20)).map((v) => v.toFixed(3)).join(',')}`;
    });
    const runs = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]);
    expect(runs).toEqual([
      'opaque/write/1.000,1.000,1.000,1.000', // magma: full-bright in the night, opaque, writes depth
      'alpha/nowrite/0.100,0.120,0.200,0.600', // river: the night light, its alpha
      'alpha/nowrite/0.100,0.120,0.200,0.750', // ocean
      'alpha/nowrite/0.100,0.120,0.200,0.850', // slime
    ]);
    // 64 chunks per quadrant are wholly of one class, plus the chunks straddling the quadrant borders.
    expect(renderer.totals.liquidCellsByType).toEqual({ river: 4096, ocean: 4096, magma: 4096, slime: 4096 });
    expect(draws.length).toBe(4 * 64 + 4 * 0 + 0); // quadrant borders fall on chunk borders (256 = 16 × 16 chunks, split at chunk 8)
  });

  it('skips the passes of classes that are not there, and accepts other materials', () => {
    const { backend, renderer } = setup(); // lake: river only
    expect(renderer.totals.liquidCellsByType).toMatchObject({ ocean: 0, magma: 0, slime: 0 });
    renderer.setLiquidMaterials({ ...LIQUID_MATERIALS, river: { color: [1, 1, 1], alpha: 0.25, blend: 'alpha', lit: false, fogged: false, depthScale: 0 } });
    renderer.setFog({ color: [0.1, 0.2, 0.3], start: 50, end: 150 });
    const { liquid } = liquidDraws(backend, renderer, { eye: [1, 2, 3] });
    const d = liquid[0]!;
    if (d.type !== 'draw') throw new Error('no draw');
    close(Array.from(d.call.uniforms!.slice(16, 20)), [1, 1, 1, 0.25]);
    // The frames are rebuilt with the new colour.
    expect(Array.from((backend.textureInfo(d.call.textures![0]!).levels[0]!).subarray(0, 4))).toEqual([255, 255, 255, 255]);
    close(Array.from(d.call.uniforms!.slice(28, 30)), [0, 0]); // not fogged
    expect(() => renderer.setLiquidMaterials({ ...LIQUID_MATERIALS, river: { ...LIQUID_MATERIALS.river, alpha: -1 } })).toThrow(/river.alpha/);
  });
});

describe('liquid animation (P3.3, spec §23)', () => {
  it('is 30 frames in 1250 ms, i.e. 24 frames per second', () => {
    expect(LIQUID_ANIMATION_FRAMES).toBe(30);
    expect(LIQUID_ANIMATION_PERIOD_MS).toBe(1250);
    expect((LIQUID_ANIMATION_FRAMES / LIQUID_ANIMATION_PERIOD_MS) * 1000).toBe(24);
  });

  it('selects frame = floor(((t mod 1250) / 1250) · 30)', () => {
    expect(liquidFrameAt(0)).toBe(0);
    expect(liquidFrameAt(41)).toBe(0);
    expect(liquidFrameAt(42)).toBe(1); // 1250 / 30 = 41.67 ms per frame
    expect(liquidFrameAt(625)).toBe(15);
    expect(liquidFrameAt(1249.999)).toBe(29);
    expect(liquidFrameAt(1250)).toBe(0); // loops
    expect(liquidFrameAt(1250 * 7 + 100)).toBe(2);
    for (let t = 0; t < 5000; t += 3.7) expect(liquidFrameAt(t)).toBe(Math.floor(((t % 1250) / 1250) * 30));
  });

  it('shows every frame for the same time, in order, and stays in 0..29 for any finite time', () => {
    const shown = new Array<number>(30).fill(0);
    let previous = 0;
    for (let t = 0; t < 1250; t += 0.5) {
      const f = liquidFrameAt(t);
      expect(f === previous || f === previous + 1).toBe(true);
      previous = f;
      shown[f]!++;
    }
    expect(Math.max(...shown) - Math.min(...shown)).toBeLessThanOrEqual(1);
    for (const t of [-1, -0.0001, -1250, -1e-13, 1e12, 1e15 + 0.5]) {
      const f = liquidFrameAt(t);
      expect(Number.isInteger(f) && f >= 0 && f <= 29).toBe(true);
    }
    expect(liquidFrameAt(-1)).toBe(29); // just before the loop point
    expect(() => liquidFrameAt(Number.NaN)).toThrow(/finite/);
  });

  it('generates 30 frames per class that tile and loop: the class colour modulated by waves', () => {
    for (const type of LIQUID_PASS_ORDER) {
      const frames = liquidFrames(type, LIQUID_MATERIALS[type], 'procedural', 32);
      expect(frames).toHaveLength(30);
      expect(new Set(frames.map((f) => f.data.join())).size).toBe(30); // every frame differs
      const colour = LIQUID_MATERIALS[type].color;
      // Mean over one frame ≈ the class colour (a whole number of waves averages out); clamped channels excepted.
      const f0 = frames[0]!;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let i = 0; i < 32 * 32; i++) sum += f0.data[i * 4 + c]!;
        const mean = sum / (32 * 32) / 255;
        if (colour[c]! * 1.22 <= 1) expect(Math.abs(mean - colour[c]!)).toBeLessThan(0.01);
        else expect(mean).toBeLessThanOrEqual(1);
      }
      expect(f0.data[3]).toBe(255);
      // Loop: the step from the last frame back to the first is no larger than the step between two frames.
      const step = (a: Uint8Array, b: Uint8Array): number => {
        let worst = 0;
        for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
        return worst;
      };
      let largest = 0;
      for (let k = 1; k < 30; k++) largest = Math.max(largest, step(frames[k - 1]!.data, frames[k]!.data));
      expect(step(frames[29]!.data, frames[0]!.data)).toBeLessThanOrEqual(largest);
      expect(largest).toBeGreaterThan(0);
    }
  });

  it('solid frames are flat: the class colour × a factor that names the frame', () => {
    expect(solidFrameFactor(0)).toBe(1);
    expect(solidFrameFactor(29)).toBeCloseTo(0.71, 12);
    const frames = liquidFrames('ocean', LIQUID_MATERIALS.ocean, 'solid', 4);
    expect(Array.from(frames[0]!.data.subarray(0, 4))).toEqual([26, 77, 140, 255]); // 0.1, 0.3, 0.55
    expect(Array.from(frames[10]!.data.subarray(0, 4))).toEqual([23, 69, 126, 255]); // × 0.9
    expect(new Set(frames[10]!.data.filter((_, i) => i % 4 === 1)).size).toBe(1);
  });

  it('the renderer binds the frame of the current time, per class, and makes frames only for classes present', () => {
    const { backend, renderer } = setup(); // river only
    expect(backend.liveTextureCount).toBe(setup(dry).backend.liveTextureCount + 30);
    const frameTexture = (timeMs: number) => {
      renderer.liquidTimeMs = timeMs;
      const { result, liquid } = liquidDraws(backend, renderer);
      const d = liquid[0]!;
      if (d.type !== 'draw') throw new Error('no draw');
      expect(new Set(liquid.map((e) => (e.type === 'draw' ? e.call.textures![0] : -1))).size).toBe(1); // one frame for the whole pass
      return { frame: result.liquidFrame, texture: d.call.textures![0]! };
    };
    const a = frameTexture(0), b = frameTexture(625), c = frameTexture(1250), e = frameTexture(41);
    expect([a.frame, b.frame, c.frame, e.frame]).toEqual([0, 15, 0, 0]);
    expect(b.texture).not.toBe(a.texture);
    expect(c.texture).toBe(a.texture);
    expect(e.texture).toBe(a.texture);
    expect(backend.textureInfo(a.texture)).toMatchObject({ width: 64, height: 64, wrap: 'repeat', filter: 'linear' });
    expect(backend.textureInfo(a.texture).levels.length).toBe(7); // mip-mapped
    // Four classes → 120 frames, each class its own texture at a given time.
    const four = setup(classes);
    expect(four.backend.liveTextureCount).toBe(setup(dry).backend.liveTextureCount + 120);
    four.renderer.liquidTimeMs = 300;
    const { liquid } = liquidDraws(four.backend, four.renderer);
    const all = four.backend.events.filter((x) => x.type === 'draw' && x.call.textures?.length === 1);
    expect(liquid.length).toBeLessThan(all.length); // the blended passes, without the opaque magma
    expect(new Set(all.map((x) => (x.type === 'draw' ? x.call.textures![0] : -1))).size).toBe(4);
    four.renderer.dispose();
    expect([four.backend.liveBufferCount, four.backend.liveTextureCount, four.backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});

describe('liquid depth response (P3.4, spec §24, §25, §42)', () => {
  it('has the tables of the spec: ocean i/255, river i/42, alpha 1.6 · (i/63)⁸, all clamped', () => {
    expect(oceanDepthTable(0)).toBe(0);
    expect(oceanDepthTable(51)).toBeCloseTo(0.2, 12);
    expect(oceanDepthTable(255)).toBe(1);
    expect(oceanDepthTable(400)).toBe(1);
    expect(riverDepthTable(21)).toBe(0.5);
    expect(riverDepthTable(42)).toBe(1);
    expect(riverDepthTable(255)).toBe(1);
    // « Saturates roughly six times faster ».
    expect(255 / 42).toBeCloseTo(6.07, 2);
    expect(liquidAlphaTable(0)).toBe(0);
    expect(liquidAlphaTable(63)).toBe(1); // 1.6 clamped
    expect(liquidAlphaTable(32)).toBeCloseTo(1.6 * (32 / 63) ** 8, 12); // ≈ 0.007: shallow stays transparent
    expect(liquidAlphaTable(32)).toBeLessThan(0.01);
    expect(liquidAlphaTable(56)).toBeCloseTo(1.6 * (56 / 63) ** 8, 12); // ≈ 0.62: opaque quickly near the top
    // Fully opaque from (1 / 1.6)^(1/8) of the range.
    expect(liquidAlphaTable(63 * 0.943)).toBeCloseTo(1, 2);
    for (let i = 1; i <= 63; i++) expect(liquidAlphaTable(i)).toBeGreaterThanOrEqual(liquidAlphaTable(i - 1));
  });

  it('the shader formula is those tables put together: alpha(depth) = clamp(1.6 · min(depth / scale, 1)⁸)', () => {
    for (const scale of [OCEAN_DEPTH_SCALE, RIVER_DEPTH_SCALE, 100]) {
      for (let depth = 0; depth <= scale * 1.5; depth += scale / 37) {
        // Ocean table index for this depth (255 steps over the scale), then the alpha table (63 steps over 0..1).
        const viaTables = liquidAlphaTable(oceanDepthTable((depth / scale) * 255) * 63);
        expect(liquidDepthAlpha(depth, scale)).toBeCloseTo(viaTables, 12);
      }
    }
    expect(liquidDepthAlpha(0, 8)).toBe(0);
    expect(liquidDepthAlpha(-3, 8)).toBe(0);
    expect(liquidDepthAlpha(4, 8)).toBeCloseTo(1.6 / 256, 12);
    expect(liquidDepthAlpha(8, 8)).toBe(1);
    expect(liquidDepthAlpha(1e6, 8)).toBe(1);
    expect(liquidDepthAlpha(0.5, 0)).toBe(1); // no depth response
  });

  it('keeps the spec ratio between river and ocean, and none for the opaque magma', () => {
    expect(OCEAN_DEPTH_SCALE / RIVER_DEPTH_SCALE).toBeCloseTo(255 / 42, 12);
    expect(LIQUID_MATERIALS.ocean.depthScale).toBe(OCEAN_DEPTH_SCALE);
    expect(LIQUID_MATERIALS.river.depthScale).toBe(RIVER_DEPTH_SCALE);
    expect(LIQUID_MATERIALS.magma.depthScale).toBe(0);
    // At 2 units of depth a river is already fully there, an ocean hardly shows.
    expect(liquidDepthAlpha(2, RIVER_DEPTH_SCALE)).toBe(1);
    expect(liquidDepthAlpha(2, OCEAN_DEPTH_SCALE)).toBeLessThan(0.001);
  });

  it('gives the shader 1 / scale and the switch, per class; the vertices carry the depth', () => {
    const { backend, renderer } = setup(classes);
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: false });
    backend.endFrame();
    const params = new Map<number, string>();
    for (const e of backend.events) {
      if (e.type !== 'draw' || e.call.textures?.length !== 1) continue;
      params.set(e.call.uniforms![19]!, Array.from(e.call.uniforms!.slice(33, 35)).map((v) => v.toFixed(4)).join());
    }
    // Keyed by the class alpha (magma 1, river 0.6, ocean 0.75, slime 0.85).
    expect(Object.fromEntries([...params].map(([alpha, p]) => [alpha.toFixed(2), p]))).toEqual({
      '1.00': '0.0000,0.0000',
      '0.60': `${(1 / RIVER_DEPTH_SCALE).toFixed(4)},1.0000`,
      '0.75': '0.1250,1.0000',
      '0.85': `${(1 / RIVER_DEPTH_SCALE).toFixed(4)},1.0000`,
    });
    // Ground at −1, liquid at 0 → every vertex is 1 unit deep.
    const draw = backend.events.find((e) => e.type === 'draw' && e.call.textures?.length === 1);
    if (draw?.type !== 'draw') throw new Error('no draw');
    const vertices = backend.bufferData(draw.call.vertexBuffer) as Float32Array;
    for (let v = 0; v < 81; v++) expect(vertices[v * 4 + 3]).toBe(1);
    // Debug switch: full class opacity whatever the depth.
    renderer.liquidDepthResponse = false;
    backend.events.length = 0;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, { wireframe: false, debugMode: 'textured', chunkBounds: false, culling: false });
    backend.endFrame();
    for (const e of backend.events) if (e.type === 'draw' && e.call.textures?.length === 1) expect(e.call.uniforms![34]).toBe(0);
  });
});

describe('liquid in the scenes', () => {
  it('is chosen by the URL', () => {
    expect(parseSceneRequest('?scene=tile')).toMatchObject({ liquid: undefined });
    expect(parseSceneRequest('?scene=tile&liquid=lake')).toMatchObject({ liquid: 'lake' });
    expect(parseSceneRequest('?scene=stream&liquid=sea')).toMatchObject({ liquid: 'sea', liquidOff: false });
    expect(parseSceneRequest('?scene=zone')).toMatchObject({ liquid: undefined, liquidOff: false });
    expect(parseSceneRequest('?scene=zone&liquid=off')).toMatchObject({ liquid: undefined, liquidOff: true });
    expect(parseSceneRequest('?scene=tile&liquid=soup')).toMatchObject({ liquid: undefined });
    expect(parseSceneRequest('?scene=tile&liquid=classes&liquidLevel=2.5')).toMatchObject({ liquid: 'classes', liquidLevel: 2.5 });
    expect(parseSceneRequest('?scene=tile&liquid=sea&liquidLevel=-3')).toMatchObject({ liquidLevel: -3 });
    expect(parseSceneRequest('?scene=tile&liquidLevel=1e9')).toMatchObject({ liquidLevel: 0 });
  });

  it('tile scene: reports its liquid, adds its draws, and O hides it', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { config: ORVALIS_DEFAULT, tile: { x: 0, y: 0 }, heightKind: 'hills', view: 'above', liquid: 'sea' });
    const dryScene = createTerrainTileScene(new NullBackend(), { config: ORVALIS_DEFAULT, tile: { x: 0, y: 0 }, heightKind: 'hills', view: 'above' });
    expect(dryScene.terrain.liquid).toBeUndefined();
    const stats = scene.render(16 / 9);
    const liquid = scene.terrain.liquid!;
    expect(liquid.visible).toBe(true);
    expect(liquid.chunks).toBeGreaterThan(0);
    expect(liquid.chunks).toBeLessThan(256); // the hills rise above the sea
    expect(liquid.drawn).toBe(liquid.chunks);
    expect(stats.drawCalls).toBe(256 + liquid.chunks);
    expect(stats.triangles).toBe(65536 + liquid.cells * 2);
    expect(scene.toggleLiquid()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(256);
    expect(scene.terrain.liquid).toMatchObject({ visible: false, drawn: 0 });
  });

  it('stream scene: tiles arrive with their liquid; a given world can be built without it', () => {
    const base = { config: ORVALIS_DEFAULT, focus: { x: 256, y: 256 }, streaming: { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 }, view: 'above', frameBudgetMs: Number.POSITIVE_INFINITY } as const;
    const scene = createTerrainStreamScene(new NullBackend(), { ...base, liquid: 'lake' });
    scene.render(1);
    expect(scene.terrain.liquid!.chunks).toBeGreaterThan(40);
    const world = { id: 'w', tiles: [{ x: 0, y: 0 }], heightAt: () => -2, liquid: liquidFixture(512, 'sea') };
    const wet = createTerrainStreamScene(new NullBackend(), { ...base, world });
    wet.render(1);
    expect(wet.terrain.liquid).toMatchObject({ chunks: 256, cells: 256 * 64 });
    const off = createTerrainStreamScene(new NullBackend(), { ...base, world, liquidOff: true });
    off.render(1);
    expect(off.terrain.liquid).toBeUndefined();
  });
});
