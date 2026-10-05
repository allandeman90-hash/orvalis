import { describe, expect, it } from 'vitest';
import { DebugOverlay, formatOverlay, type OverlayData } from '../../src/debug';

const base: OverlayData = {
  engineMode: 'new',
  backend: 'webgpu',
  fps: 59.94,
  frameMs: 16.683,
  frameMaxMs: 21.04,
  drawCalls: 1,
  triangles: 1,
  canvasWidth: 1280,
  canvasHeight: 720,
  simulationHz: 60,
  simulationSteps: 345,
  assets: {
    total: 6,
    byState: { unrequested: 0, requested: 0, downloading: 1, decoded: 1, 'gpu-uploading': 0, ready: 2, evictable: 1, failed: 1 },
  },
};

describe('formatOverlay', () => {
  it('shows the renderer on the first line', () => {
    expect(formatOverlay(base)[0]).toBe('Renderer: WebGPU');
    expect(formatOverlay({ ...base, backend: 'webgl2' })[0]).toBe('Renderer: WebGL2');
  });
  it('produces the full nominal text', () => {
    expect(formatOverlay(base)).toEqual([
      'Renderer: WebGPU',
      'FPS: 60',
      'Frame: 16.7 ms (max 21.0)',
      'Draw calls: 1',
      'Triangles: 1',
      'Canvas: 1280×720',
      'Simulation: 60 Hz · 345 steps',
      'Assets: 3 ready · 2 loading · 1 failed',
      'Engine: new (jeu actuel : ?engine=legacy)',
    ]);
  });
  it('shows the world clock when there is one', () => {
    const line = (worldTime: NonNullable<OverlayData['worldTime']>) => formatOverlay({ ...base, worldTime }).find((l) => l.startsWith('World time'));
    expect(line({ units: 1740.7, daySeconds: 1440, speed: 1, syncs: 0 })).toBe('World time: 14:30 · unit 1740/2880 · day 1440 s · 0 sync');
    expect(line({ units: 2879.99, daySeconds: 60, speed: 0, syncs: 3 })).toBe('World time: 23:59 · unit 2879/2880 · day 60 s × 0 · 3 sync');
    const lines = formatOverlay({ ...base, worldTime: { units: 0, daySeconds: 1440, speed: 1, syncs: 0 } });
    expect(lines.indexOf('World time: 00:00 · unit 0/2880 · day 1440 s · 0 sync')).toBe(lines.indexOf('Simulation: 60 Hz · 345 steps') - 1);
  });
  it('shows the day cycle when it is applied', () => {
    const lines = formatOverlay({ ...base, dayCycle: { from: 'afternoon', to: 'sunset', blend: 0.374 } });
    expect(lines).toContain('Day cycle: afternoon → sunset 37 % (PageUp / PageDown: ±1 h · P: pause)');
    expect(formatOverlay(base).some((l) => l.startsWith('Day cycle'))).toBe(false);
  });
  it('shows the two suns when they are computed', () => {
    const suns = { lighting: { azimuth: 225, elevation: 47.5 }, visible: { azimuth: 90.4, elevation: 0.2 } };
    expect(formatOverlay({ ...base, suns })).toContain('Suns: light az 225° el 48° · visible az 90° el 0°');
    expect(formatOverlay({ ...base, suns: { ...suns, visible: { azimuth: 0, elevation: -60 } } })).toContain('Suns: light az 225° el 48° · visible az 0° el -60° (set)');
    expect(formatOverlay(base).some((l) => l.startsWith('Suns'))).toBe(false);
  });
  it('shows the liquid line when chunks have liquid', () => {
    const terrain = { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured' as const };
    expect(formatOverlay({ ...base, terrain: { ...terrain, liquid: { visible: true, chunks: 40, cells: 2100, drawn: 12 } } })).toContain('Liquid: on (O) · 40 chunks · 2100 cells · 12 drawn');
    expect(formatOverlay({ ...base, terrain: { ...terrain, liquid: { visible: false, chunks: 40, cells: 2100, drawn: 0 } } })).toContain('Liquid: off (O) · 40 chunks · 2100 cells · 0 drawn');
    expect(formatOverlay({ ...base, terrain: { ...terrain, liquid: { visible: true, chunks: 40, cells: 2100, drawn: 12, byType: { river: 100, ocean: 2000, magma: 0, slime: 0 } } } })).toContain('Liquid: on (O) · 40 chunks · 2100 cells · 12 drawn · river 100 · ocean 2000');
    expect(formatOverlay({ ...base, terrain }).some((l) => l.startsWith('Liquid'))).toBe(false);
  });
  it('marks a fallback and gives its reason', () => {
    const lines = formatOverlay({ ...base, backend: 'webgl2', fallbackNote: 'WebGPU indisponible : no adapter' });
    expect(lines[0]).toBe('Renderer: WebGL2 (repli)');
    expect(lines[1]).toBe('  WebGPU indisponible : no adapter');
    expect(lines[2]).toBe('FPS: 60');
  });
  it('lists terrain statistics only when the scene has terrain', () => {
    expect(formatOverlay(base).some((l) => l.startsWith('Terrain'))).toBe(false);
    const lines = formatOverlay({ ...base, terrain: { chunks: 1, vertices: 145, triangles: 240, submittedChunks: 1, drawCalls: 1, holes: 1, wireframe: false, debugMode: 'color' } });
    const at = lines.indexOf('Terrain chunks: 1');
    expect(lines.slice(at, at + 8)).toEqual(['Terrain chunks: 1', 'Terrain vertices: 145', 'Terrain triangles: 240', 'Terrain submitted chunks: 1', 'Terrain draw calls: 1', 'Terrain holes: 1/16', 'Terrain wireframe: off (F4)', 'Terrain debug: color']);
    const wired = formatOverlay({ ...base, terrain: { chunks: 1, vertices: 145, triangles: 256, submittedChunks: 1, drawCalls: 1, holes: 0, wireframe: true, debugMode: 'normals' } });
    expect(wired).toContain('Terrain debug: normals');
    expect(wired).toContain('Terrain wireframe: on (F4)');
    expect(wired).toContain('Terrain holes: 0/16');
    expect(lines[at - 1]).toBe('Canvas: 1280×720');
    expect(lines.some((l) => l.startsWith('Terrain tile') || l.startsWith('Terrain chunk bounds') || l.includes('visible') || l.includes('culling'))).toBe(false);
    const tile = formatOverlay({ ...base, terrain: { tile: { x: -2, y: 3 }, chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'color', chunkBounds: true } });
    const t = tile.indexOf('Terrain tile: -2,3');
    const mapped = formatOverlay({ ...base, terrain: { map: 'archipel', tiles: 3, chunks: 768, vertices: 111360, triangles: 196608, culling: true, visibleChunks: 768, culledChunks: 0, submittedChunks: 768, drawCalls: 768, holes: 0, wireframe: false, debugMode: 'color', chunkBounds: false } });
    const m = mapped.indexOf('Terrain map: archipel');
    expect(mapped.slice(m, m + 3)).toEqual(['Terrain map: archipel', 'Terrain tiles: 3 (resident)', 'Terrain chunks: 768']);
    expect(mapped).toContain('Terrain holes: 0/12288');
    expect(mapped.some((l) => l.startsWith('Terrain tile:'))).toBe(false);
    const streamed = formatOverlay({ ...base, terrain: { map: 'continent', tiles: 8, chunks: 2048, vertices: 296960, triangles: 524288, culling: true, visibleChunks: 300, culledChunks: 1748, submittedChunks: 300, drawCalls: 300, holes: 0, wireframe: false, debugMode: 'color', chunkBounds: false, streaming: { focus: { x: 256, y: -12.345 }, focusTile: { x: 0, y: -1 }, loadRadius: 1, unloadRadius: 2, pending: 3, gpuQueue: 120, workMs: 3.94, workMaxMs: 6.25, loadedTotal: 14, unloadedTotal: 6 } } });
    const st = streamed.indexOf('Focus: 256.0, -12.3 (arrows / WASD)');
    expect(streamed.slice(st, st + 5)).toEqual(['Focus: 256.0, -12.3 (arrows / WASD)', 'Streaming: tile 0,-1 · radius 1/2 · pending 3', 'Streaming totals: 14 loaded · 6 unloaded', 'Streaming GPU queue: 120', 'Streaming work: 3.9 ms/frame (max 6.3)']);
    expect(formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured', lit: true } })).toContain('Terrain lighting: on (L)');
    expect(formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured', lit: false } })).toContain('Terrain lighting: off (L)');
    expect(formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured', lit: true, fog: true } })).toContain('Terrain fog: on (F)');
    expect(formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured', lit: true } }).some((l) => l.startsWith('Terrain fog'))).toBe(false);
    expect(formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'textured', far: { visible: true, tiles: 31, drawn: 12, radius: 3 } } })).toContain('Far terrain: on (T) · 31 tiles (±3) · 12 drawn');
    const culled = formatOverlay({ ...base, terrain: { tile: { x: 0, y: 0 }, chunks: 256, vertices: 37120, triangles: 65536, culling: true, visibleChunks: 160, culledChunks: 96, submittedChunks: 159, drawCalls: 159, holes: 16, wireframe: false, debugMode: 'color', chunkBounds: false } });
    const c = culled.indexOf('Terrain culling: on (C)');
    expect(culled.slice(c, c + 5)).toEqual(['Terrain culling: on (C)', 'Terrain visible chunks: 160', 'Terrain culled chunks: 96', 'Terrain submitted chunks: 159', 'Terrain draw calls: 159']);
    const off = formatOverlay({ ...base, terrain: { chunks: 256, vertices: 37120, triangles: 65536, culling: false, submittedChunks: 256, drawCalls: 256, holes: 0, wireframe: false, debugMode: 'color' } });
    expect(off).toContain('Terrain culling: off (C)');
    expect(off).toContain('Terrain visible chunks: — (not tested)');
    expect(tile.slice(t, t + 10)).toEqual(['Terrain tile: -2,3', 'Terrain chunks: 256', 'Terrain vertices: 37120', 'Terrain triangles: 65536', 'Terrain submitted chunks: 256', 'Terrain draw calls: 256', 'Terrain holes: 0/4096', 'Terrain wireframe: off (F4)', 'Terrain debug: color', 'Terrain chunk bounds: on (B)']);
  });
  it('shows a dash instead of a fake number before the first measured frame', () => {
    const lines = formatOverlay({ ...base, fps: 0, frameMs: 0, frameMaxMs: 0 });
    expect(lines).toContain('FPS: —');
    expect(lines).toContain('Frame: —');
  });
});

/** Minimal stand-in for the DOM element the overlay writes into. */
function fakeElement() {
  let writes = 0;
  let text = '';
  const el = {
    hidden: false,
    get textContent() {
      return text;
    },
    set textContent(v: string) {
      text = v;
      writes++;
    },
  };
  return { el: el as unknown as HTMLElement, writes: () => writes, text: () => text };
}

describe('DebugOverlay', () => {
  it('writes on the first update, then at most every 250 ms', () => {
    const f = fakeElement();
    const o = new DebugOverlay(f.el);
    let calls = 0;
    const data = () => (calls++, base);
    o.update(1000, data);
    expect(f.writes()).toBe(1);
    expect(f.text().split('\n')[0]).toBe('Renderer: WebGPU');
    for (let t = 1016; t < 1250; t += 16) o.update(t, data);
    expect(f.writes()).toBe(1);
    expect(calls).toBe(1); // data is not even computed between refreshes
    o.update(1250, data);
    expect(f.writes()).toBe(2);
  });
  it('does nothing while hidden and refreshes immediately when shown again', () => {
    const f = fakeElement();
    const o = new DebugOverlay(f.el);
    o.update(0, () => base);
    o.toggle();
    expect(o.visible).toBe(false);
    o.update(5000, () => base);
    expect(f.writes()).toBe(1);
    o.toggle();
    expect(o.visible).toBe(true);
    o.update(5001, () => base); // well inside the 250 ms window of nothing: must still refresh
    expect(f.writes()).toBe(2);
  });
});
