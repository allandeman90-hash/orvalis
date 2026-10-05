import { describe, expect, it } from 'vitest';
import {
  accumulateFaceNormals,
  buildChunkGeometry,
  buildChunkIndices,
  centerVertexIndex,
  computeVertexNormals,
  createTerrainConfig,
  FALLBACK_NORMAL,
  normalizeNormalSums,
  ORVALIS_DEFAULT,
  outerVertexIndex,
  sampleChunkHeights,
  syntheticChunkHeights,
  VANILLA_REFERENCE,
  VERTICES_PER_CHUNK,
} from '../../src/terrain';

const CONFIGS = [ORVALIS_DEFAULT, VANILLA_REFERENCE, createTerrainConfig(1), createTerrainConfig(100)];
const normalAt = (normals: Float32Array, v: number): [number, number, number] => [normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!];
const length = (n: readonly number[]): number => Math.hypot(n[0]!, n[1]!, n[2]!);

/** Vertices used by at least one triangle. */
function usedVertices(indices: Uint16Array): Set<number> {
  return new Set(indices);
}

function expectAllUnitAndFinite(normals: Float32Array): void {
  expect(normals.length).toBe(VERTICES_PER_CHUNK * 3);
  for (let v = 0; v < VERTICES_PER_CHUNK; v++) {
    const [nx, ny, nz] = normalAt(normals, v);
    expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
    expect(Math.abs(length([nx, ny, nz]) - 1)).toBeLessThan(1e-5);
  }
}

describe('chunk normals — flat ground (Z-up)', () => {
  for (const config of CONFIGS) {
    it(`z = constant → N = (0, 0, +1) on all 145 vertices (cellSize ${config.cellSize})`, () => {
      for (const z of [0, 12.5, -300]) {
        const { normals } = buildChunkGeometry(config, sampleChunkHeights(config, () => z), 1000, -2000);
        for (let v = 0; v < VERTICES_PER_CHUNK; v++) {
          const [nx, ny, nz] = normalAt(normals, v);
          expect(Math.abs(nx)).toBeLessThan(1e-6);
          expect(Math.abs(ny)).toBeLessThan(1e-6);
          expect(nz).toBeGreaterThan(0); // winding: never pointing down
          expect(nz).toBeCloseTo(1, 6);
        }
      }
    });
  }
});

describe('chunk normals — winding', () => {
  it('the chunk indices give n.z > 0 on flat ground; reversed triangles give n.z < 0 (so a flip is detectable)', () => {
    const geometry = buildChunkGeometry(ORVALIS_DEFAULT, syntheticChunkHeights(ORVALIS_DEFAULT, 'flat', 0));
    for (let v = 0; v < VERTICES_PER_CHUNK; v++) expect(geometry.normals[v * 3 + 2]).toBeGreaterThan(0.999);

    const reversed = Uint16Array.from(geometry.indices);
    for (let t = 0; t < reversed.length; t += 3) [reversed[t + 1], reversed[t + 2]] = [reversed[t + 2]!, reversed[t + 1]!];
    const flipped = computeVertexNormals(geometry.positions, reversed);
    for (let v = 0; v < VERTICES_PER_CHUNK; v++) expect(flipped[v * 3 + 2]).toBeLessThan(-0.999);
  });
});

describe('chunk normals — regular slope z = a·x + b·y', () => {
  for (const config of CONFIGS) {
    for (const [a, b] of [[0.375, 0], [0, -0.5], [0.3, -0.2], [-2, 1.5]] as const) {
      it(`every normal equals the analytic (−a, −b, 1)/‖…‖ (cellSize ${config.cellSize}, a ${a}, b ${b})`, () => {
        const { normals } = buildChunkGeometry(config, sampleChunkHeights(config, (x, y) => a * x + b * y));
        const l = Math.hypot(a, b, 1);
        const want = [-a / l, -b / l, 1 / l];
        for (let v = 0; v < VERTICES_PER_CHUNK; v++) {
          const n = normalAt(normals, v);
          for (let k = 0; k < 3; k++) expect(Math.abs(n[k]! - want[k]!)).toBeLessThan(1e-4);
        }
        expectAllUnitAndFinite(normals);
      });
    }
  }
});

describe('chunk normals — hill', () => {
  for (const config of CONFIGS) {
    it(`unit, finite, pointing up and away from the summit (cellSize ${config.cellSize})`, () => {
      const amplitude = 0.375 * config.chunkSize;
      const { normals } = buildChunkGeometry(config, syntheticChunkHeights(config, 'hill', amplitude));
      expectAllUnitAndFinite(normals);
      for (let v = 0; v < VERTICES_PER_CHUNK; v++) expect(normals[v * 3 + 2]).toBeGreaterThan(0);
      // Summit (outer vertex 4,4): the surface is symmetric there → straight up.
      const top = normalAt(normals, outerVertexIndex(4, 4));
      expect(Math.abs(top[0])).toBeLessThan(1e-5);
      expect(Math.abs(top[1])).toBeLessThan(1e-5);
      expect(top[2]).toBeCloseTo(1, 5);
      // On each side of the summit the normal leans outwards.
      expect(normalAt(normals, outerVertexIndex(2, 4))[0]).toBeLessThan(-0.1);
      expect(normalAt(normals, outerVertexIndex(6, 4))[0]).toBeGreaterThan(0.1);
      expect(normalAt(normals, outerVertexIndex(4, 2))[1]).toBeLessThan(-0.1);
      expect(normalAt(normals, outerVertexIndex(4, 6))[1]).toBeGreaterThan(0.1);
      // Mirror symmetry of the hill.
      const l = normalAt(normals, outerVertexIndex(2, 4)), r = normalAt(normals, outerVertexIndex(6, 4));
      expect(l[0]).toBeCloseTo(-r[0], 5);
      expect(l[2]).toBeCloseTo(r[2], 5);
      // The normals really vary (not one constant vector).
      expect(Math.abs(l[0] - top[0])).toBeGreaterThan(0.1);
    });
  }

  it('centre vertices take part: moving ONE cell-centre height changes the normals of its 4 corners', () => {
    const config = ORVALIS_DEFAULT;
    const heights = sampleChunkHeights(config, () => 0);
    heights[centerVertexIndex(3, 3)] = 2;
    const { normals } = buildChunkGeometry(config, heights);
    // A 9 × 9 gradient would still see a flat grid here.
    expect(normalAt(normals, outerVertexIndex(3, 3))[0]).toBeLessThan(-0.01);
    expect(normalAt(normals, outerVertexIndex(4, 4))[0]).toBeGreaterThan(0.01);
    expect(normalAt(normals, outerVertexIndex(6, 6))).toEqual([0, 0, 1]);
    expectAllUnitAndFinite(normals);
  });
});

describe('vertex normals — area weighting', () => {
  it('sums raw cross products: a large triangle outweighs a tiny one', () => {
    // Vertex 0 is shared by a big horizontal triangle (area 50) and a tiny vertical one (area 0.005).
    // prettier-ignore
    const positions = [0, 0, 0,  10, 0, 0,  0, 10, 0,   0, 0.1, 0,  0, 0, 0.1];
    const normals = computeVertexNormals(positions, [0, 1, 2, 0, 3, 4]);
    // cross sums: (0,0,100) + (0.01,0,0) → almost straight up. An average of unit normals would give (0.707, 0, 0.707).
    const l = Math.hypot(0.01, 100);
    expect(normals[0]).toBeCloseTo(0.01 / l, 6);
    expect(normals[2]).toBeCloseTo(100 / l, 6);
    expect(normals[0]).toBeLessThan(0.001);
  });

  it('accumulate + normalise are separable (two half meshes give the same result as the whole)', () => {
    const config = ORVALIS_DEFAULT;
    const geometry = buildChunkGeometry(config, syntheticChunkHeights(config, 'hill', 12));
    const half = (geometry.indices.length / 6) * 3;
    const sums = new Float64Array(VERTICES_PER_CHUNK * 3);
    accumulateFaceNormals(sums, geometry.positions, geometry.indices.subarray(0, half));
    accumulateFaceNormals(sums, geometry.positions, geometry.indices.subarray(half));
    expect(Array.from(normalizeNormalSums(sums))).toEqual(Array.from(geometry.normals));
  });

  it('rejects malformed input', () => {
    expect(() => computeVertexNormals([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1])).toThrow(/multiple of 3/);
    expect(() => computeVertexNormals([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], { extraSums: [1, 2, 3] })).toThrow(/extraSums/);
  });
});

describe('chunk normals — holes', () => {
  const config = ORVALIS_DEFAULT;
  const slope = sampleChunkHeights(config, (x) => 0.5 * x);
  const tilted = [-0.5 / Math.hypot(0.5, 1), 0, 1 / Math.hypot(0.5, 1)];

  it('vertices left without any triangle get the documented fallback (0, 0, 1)', () => {
    const holes = 1; // cells 0..1 × 0..1
    const geometry = buildChunkGeometry(config, slope, 0, 0, holes);
    const used = usedVertices(geometry.indices);
    const orphans = [centerVertexIndex(0, 0), centerVertexIndex(1, 0), centerVertexIndex(0, 1), centerVertexIndex(1, 1), outerVertexIndex(1, 1), outerVertexIndex(0, 0), outerVertexIndex(1, 0), outerVertexIndex(0, 1)];
    for (const v of orphans) {
      expect(used.has(v)).toBe(false);
      expect(normalAt(geometry.normals, v)).toEqual([...FALLBACK_NORMAL]);
    }
    // Every vertex still in use keeps the slope's normal (remaining faces only, all coplanar).
    for (const v of used) {
      const n = normalAt(geometry.normals, v);
      for (let k = 0; k < 3; k++) expect(Math.abs(n[k]! - tilted[k]!)).toBeLessThan(1e-5);
    }
    expect(used.size + orphans.length).toBe(VERTICES_PER_CHUNK);
    expectAllUnitAndFinite(geometry.normals);
  });

  it('heights inside a hole do not influence any normal around it', () => {
    const holes = 1 << 5; // hx 1, hy 1 → cells 2..3 × 2..3, in the middle of the chunk
    const calm = syntheticChunkHeights(config, 'hill', 12);
    const spiky = Float32Array.from(calm);
    // Vertices strictly inside the hole block: 4 centres + the middle outer vertex.
    for (const v of [centerVertexIndex(2, 2), centerVertexIndex(3, 2), centerVertexIndex(2, 3), centerVertexIndex(3, 3), outerVertexIndex(3, 3)]) spiky[v] = 500;

    const a = buildChunkGeometry(config, calm, 0, 0, holes);
    const b = buildChunkGeometry(config, spiky, 0, 0, holes);
    expect(Array.from(b.normals)).toEqual(Array.from(a.normals));
    // Control: without the hole the very same spike DOES change the normals around it.
    const c = buildChunkGeometry(config, calm), d = buildChunkGeometry(config, spiky);
    expect(Array.from(d.normals)).not.toEqual(Array.from(c.normals));
  });

  it('a vertex on the rim of a hole only receives the remaining faces', () => {
    const holes = 1 << 5;
    const heights = syntheticChunkHeights(config, 'hill', 12);
    const withHole = buildChunkGeometry(config, heights, 0, 0, holes);
    const without = buildChunkGeometry(config, heights);
    const rim = outerVertexIndex(3, 2); // middle of the hole block's lower edge: the 4 triangles above it are gone
    // (the corner (2,2) would be a poor witness: by symmetry of this hill its normal happens not to change)
    expect(normalAt(withHole.normals, rim)).not.toEqual(normalAt(without.normals, rim));
    // Recomputed by hand from the triangles that are left around that vertex.
    const sum = [0, 0, 0];
    const p = withHole.positions, idx = buildChunkIndices(holes);
    let faces = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      if (!tri.includes(rim)) continue;
      faces++;
      const [i0, i1, i2] = tri.map((v) => v * 3) as [number, number, number];
      const e1 = [p[i1]! - p[i0]!, p[i1 + 1]! - p[i0 + 1]!, p[i1 + 2]! - p[i0 + 2]!];
      const e2 = [p[i2]! - p[i0]!, p[i2 + 1]! - p[i0 + 1]!, p[i2 + 2]! - p[i0 + 2]!];
      sum[0]! += e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      sum[1]! += e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      sum[2]! += e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    }
    expect(faces).toBe(4); // 8 around an inner outer-vertex, minus 2 in each of the two holed cells above
    const l = length(sum);
    const n = normalAt(withHole.normals, rim);
    for (let k = 0; k < 3; k++) expect(n[k]).toBeCloseTo(sum[k]! / l, 6);
  });

  it('a fully holed chunk does not crash: 145 fallback normals, no NaN', () => {
    const geometry = buildChunkGeometry(config, syntheticChunkHeights(config, 'hill', 12), 0, 0, 0xffff);
    expect(geometry.indices.length).toBe(0);
    expectAllUnitAndFinite(geometry.normals);
    for (let v = 0; v < VERTICES_PER_CHUNK; v++) expect(normalAt(geometry.normals, v)).toEqual([...FALLBACK_NORMAL]);
  });

  it('every hole mask bit, on the hill: always unit and finite', () => {
    for (let bit = 0; bit < 16; bit++) expectAllUnitAndFinite(buildChunkGeometry(config, syntheticChunkHeights(config, 'hill', 12), 0, 0, 1 << bit).normals);
  });
});

describe('chunk normals — border hook for adjacent chunks (FUTURE use)', () => {
  const config = ORVALIS_DEFAULT;
  const heights = sampleChunkHeights(config, (x) => Math.max(0, x - config.chunkSize / 2)); // flat, then rising

  it('alone, a border vertex only knows its own chunk (documented CURRENT limit)', () => {
    const west = buildChunkGeometry(config, sampleChunkHeights(config, () => 0)); // flat chunk
    // Its east border is perfectly vertical-normal, even if the neighbour to the east rises steeply.
    expect(normalAt(west.normals, outerVertexIndex(8, 4))).toEqual([0, 0, 1]);
  });

  it('extraSums lets the faces of a neighbour be added before normalisation', () => {
    const base = buildChunkGeometry(config, heights);
    const extra = new Float64Array(VERTICES_PER_CHUNK * 3);
    const v = outerVertexIndex(8, 4);
    extra[v * 3] = -1000; // a neighbour face leaning towards −x
    const joined = buildChunkGeometry(config, heights, 0, 0, 0, { extraSums: extra });
    expect(normalAt(joined.normals, v)[0]).toBeLessThan(normalAt(base.normals, v)[0]);
    expectAllUnitAndFinite(joined.normals);
    // Other vertices are untouched, and zero extra sums change nothing.
    expect(normalAt(joined.normals, outerVertexIndex(4, 4))).toEqual(normalAt(base.normals, outerVertexIndex(4, 4)));
    const same = buildChunkGeometry(config, heights, 0, 0, 0, { extraSums: new Float64Array(VERTICES_PER_CHUNK * 3) });
    expect(Array.from(same.normals)).toEqual(Array.from(base.normals));
  });
});
