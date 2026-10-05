import { describe, expect, it } from 'vitest';
import {
  buildFarTile,
  buildTerrainTile,
  FAR_TRIANGLES,
  FAR_VERTICES,
  farCenterIndex,
  farOuterIndex,
  FarTerrainWindow,
  type FarTile,
  farTileIndices,
  farVertexGridPosition,
  fixtureTileProvider,
  ORVALIS_DEFAULT,
  outerVertexIndex,
  paintFixture,
  STREAM_FIXTURE,
  tileChunkIndex,
  tileHeightFixture,
  VANILLA_REFERENCE,
} from '../../src/terrain';

const config = ORVALIS_DEFAULT;
const dunes = tileHeightFixture(config, 'dunes');
const at = (t: FarTile, v: number): number[] => Array.from(t.positions.subarray(v * 3, v * 3 + 3));
const normal = (t: FarTile, v: number): number[] => Array.from(t.normals.subarray(v * 3, v * 3 + 3));

describe('far tile — 545 heights, fan topology', () => {
  it('17 × 17 outer + 16 × 16 inner = 545 vertices, 1024 triangles, 3072 indices', () => {
    expect([FAR_VERTICES, FAR_TRIANGLES]).toEqual([17 * 17 + 16 * 16, 16 * 16 * 4]);
    expect([FAR_VERTICES, FAR_TRIANGLES]).toEqual([545, 1024]);
    const tile = buildFarTile(config, { x: 0, y: 0 }, dunes);
    expect([tile.positions.length, tile.normals.length, tile.layerAlphas.length]).toEqual([545 * 3, 545 * 3, 545 * 3]);
    const indices = farTileIndices();
    expect(indices.length).toBe(3072);
    expect(Math.max(...indices)).toBe(544);
    expect(new Set(indices).size).toBe(545); // every vertex is used
    expect(farTileIndices()).toBe(indices); // shared by all far tiles
  });

  it('vertex layout: outer vertices on chunk corners, centres in the middle of chunks', () => {
    expect(farVertexGridPosition(farOuterIndex(0, 0))).toEqual({ u: 0, v: 0 });
    expect(farVertexGridPosition(farOuterIndex(16, 16))).toEqual({ u: 16, v: 16 });
    expect(farVertexGridPosition(farCenterIndex(0, 0))).toEqual({ u: 0.5, v: 0.5 });
    expect(farVertexGridPosition(farCenterIndex(15, 15))).toEqual({ u: 15.5, v: 15.5 });
    expect(farOuterIndex(16, 16)).toBe(544);
    expect(() => farVertexGridPosition(545)).toThrow();
    const seen = new Set<string>();
    for (let v = 0; v < 545; v++) seen.add(JSON.stringify(farVertexGridPosition(v)));
    expect(seen.size).toBe(545);
  });

  it('every triangle is counter-clockwise seen from above (front face up)', () => {
    const tile = buildFarTile(config, { x: 0, y: 0 }, () => 0), idx = farTileIndices();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [at(tile, idx[t]!), at(tile, idx[t + 1]!), at(tile, idx[t + 2]!)];
      expect((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)).toBeGreaterThan(0);
    }
  });

  for (const c of [ORVALIS_DEFAULT, VANILLA_REFERENCE]) {
    for (const coord of [{ x: 0, y: 0 }, { x: -2, y: 3 }]) {
      it(`covers exactly its tile, and its outer vertices are the chunk corners of the detailed tile (cellSize ${c.cellSize}, tile ${coord.x},${coord.y})`, () => {
        const h = tileHeightFixture(c, 'dunes');
        const far = buildFarTile(c, coord, h), detailed = buildTerrainTile(c, coord, h);
        expect(far.origin).toEqual(detailed.origin);
        expect([far.bounds.minX, far.bounds.minY, far.bounds.maxX, far.bounds.maxY]).toEqual([coord.x * c.tileSize, coord.y * c.tileSize, (coord.x + 1) * c.tileSize, (coord.y + 1) * c.tileSize].map(Math.fround));
        for (let cy = 0; cy < 16; cy += 5) {
          for (let cx = 0; cx < 16; cx += 3) {
            const chunk = detailed.chunks[tileChunkIndex(cx, cy)]!;
            // Same position AND same height as the detailed chunk's corner: no gap between the two representations there.
            expect(at(far, farOuterIndex(cx, cy))).toEqual(Array.from(chunk.geometry.positions.subarray(0, 3)));
            expect(at(far, farOuterIndex(cx + 1, cy + 1))).toEqual(Array.from(chunk.geometry.positions.subarray(outerVertexIndex(8, 8) * 3, outerVertexIndex(8, 8) * 3 + 3)));
          }
        }
        let lo = Infinity, hi = -Infinity;
        for (let v = 0; v < 545; v++) { lo = Math.min(lo, at(far, v)[2]!); hi = Math.max(hi, at(far, v)[2]!); }
        expect([far.bounds.minZ, far.bounds.maxZ]).toEqual([lo, hi]);
      });
    }
  }

  it('two adjacent far tiles agree exactly on their border: positions AND normals', () => {
    const left = buildFarTile(config, { x: -1, y: 0 }, dunes), right = buildFarTile(config, { x: 0, y: 0 }, dunes), up = buildFarTile(config, { x: 0, y: 1 }, dunes);
    for (let k = 0; k <= 16; k++) {
      expect(at(left, farOuterIndex(16, k))).toEqual(at(right, farOuterIndex(0, k)));
      expect(normal(left, farOuterIndex(16, k))).toEqual(normal(right, farOuterIndex(0, k)));
      expect(at(right, farOuterIndex(k, 16))).toEqual(at(up, farOuterIndex(k, 0)));
      expect(normal(right, farOuterIndex(k, 16))).toEqual(normal(up, farOuterIndex(k, 0)));
    }
  });

  it('normals are unit, point up, and equal the analytic normal on a plane', () => {
    const tile = buildFarTile(config, { x: 2, y: -1 }, dunes);
    for (let v = 0; v < 545; v++) {
      const n = normal(tile, v);
      expect(Math.abs(Math.hypot(n[0]!, n[1]!, n[2]!) - 1)).toBeLessThan(1e-6);
      expect(n[2]).toBeGreaterThan(0);
    }
    const plane = buildFarTile(config, { x: 0, y: 0 }, tileHeightFixture(config, 'slope'));
    const l = Math.hypot(0.25, 0.125, 1);
    for (let v = 0; v < 545; v += 7) normal(plane, v).forEach((x, k) => expect(x).toBeCloseTo([-0.25 / l, -0.125 / l, 1 / l][k]!, 5));
    expect(normal(buildFarTile(config, { x: 0, y: 0 }, () => 5), 100)).toEqual([-0, -0, 1]);
  });

  it('carries the paint alphas of the layers (zero without paint), clamped', () => {
    const bare = buildFarTile(config, { x: 0, y: 0 }, dunes);
    expect(bare.layerAlphas.every((a) => a === 0)).toBe(true);
    expect(bare.layers).toEqual([0, 0, 0, 0]);
    const painted = buildFarTile(config, { x: 0, y: 0 }, () => 0, paintFixture(config, 'quadrants'));
    const alphas = (i: number, j: number): number[] => Array.from(painted.layerAlphas.subarray(farCenterIndex(i, j) * 3, farCenterIndex(i, j) * 3 + 3));
    expect(alphas(3, 3)).toEqual([0, 0, 0]); // south-west: base layer
    expect(alphas(12, 3)).toEqual([1, 0, 0]);
    expect(alphas(3, 12)).toEqual([0, 1, 0]);
    expect(alphas(12, 12)).toEqual([0, 0, 1]);
    expect(painted.layers).toEqual([0, 1, 2, 3]);
    const wild = buildFarTile(config, { x: 0, y: 0 }, () => 0, { layers: [0, 1, 2, 3], alphaAt: () => [-3, 0.5, 7] });
    expect(Array.from(wild.layerAlphas.subarray(0, 3))).toEqual([0, 0.5, 1]);
  });

  it('refuses bad input', () => {
    expect(() => buildFarTile(config, { x: 0.5, y: 0 }, dunes)).toThrow();
    expect(() => buildFarTile(config, { x: 0, y: 0 }, () => Number.NaN)).toThrow(/not finite/);
  });
});

describe('FarTerrainWindow — ±radius tiles around the focus', () => {
  const provider = fixtureTileProvider(config, STREAM_FIXTURE, 'flat');
  const T = config.tileSize;
  const make = (radius: number, budget = 100) => {
    let builds = 0;
    const window = new FarTerrainWindow(config, (c) => provider.has(c), (c) => (builds++, buildFarTile(config, c, provider.heightAt)), radius, budget);
    return { window, builds: () => builds };
  };
  const keys = (tiles: Array<{ coord: { x: number; y: number } }>): string[] => tiles.map((t) => `${t.coord.x},${t.coord.y}`).sort();

  it('±3 tiles = up to 7 × 7 = 49; only tiles that exist are built', () => {
    const { window } = make(3);
    const e = window.update(256, 256);
    // The fixture has 31 tiles in x −3..3, y −2..2: all of them are inside the window around (0,0).
    expect(e.added.length).toBe(31);
    expect(window.tileCount).toBe(31);
    expect(window.has({ x: 1, y: 1 })).toBe(false); // absent from the map
    expect(window.has({ x: 0, y: 3 })).toBe(false); // outside the map
    expect(window.has({ x: -3, y: -2 })).toBe(true);
    expect(window.update(300, 300).added).toEqual([]); // nothing to do while the focus stays in its tile
  });

  it('follows the focus: tiles entering the window are added, tiles leaving it are removed', () => {
    const { window } = make(1);
    expect(keys(window.update(256, 256).added)).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0']);
    const e = window.update(256 + T, 256);
    expect(keys(e.added)).toEqual(['2,-1', '2,0', '2,1']);
    expect(e.removed.map((c) => `${c.x},${c.y}`).sort()).toEqual(['-1,-1', '-1,0', '-1,1']);
    const gone = window.update(1e7, 1e7);
    expect(gone.removed.length).toBe(8);
    expect(window.tileCount).toBe(0);
  });

  it('builds at most maxBuildsPerUpdate tiles per update, nearest first', () => {
    const { window, builds } = make(3, 5);
    const first = window.update(256, 256);
    expect(first.added.length).toBe(5);
    expect(first.added[0]!.coord).toEqual({ x: 0, y: 0 });
    let updates = 1;
    while (window.tileCount < 31 && updates < 20) {
      expect(window.update(256, 256).added.length).toBeLessThanOrEqual(5);
      updates++;
    }
    expect([updates, builds()]).toEqual([7, 31]);
  });

  it('radius 0 and negative coordinates', () => {
    const { window } = make(0);
    expect(keys(window.update(-1, -1).added)).toEqual(['-1,-1']);
    expect(() => new FarTerrainWindow(config, () => true, (c) => buildFarTile(config, c, () => 0), -1)).toThrow(/radius/);
    expect(() => new FarTerrainWindow(config, () => true, (c) => buildFarTile(config, c, () => 0), 1, 0)).toThrow(/maxBuildsPerUpdate/);
  });
});
