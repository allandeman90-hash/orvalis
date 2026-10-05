import { describe, expect, it } from 'vitest';
import { aabbIntersectsFrustum, createFrustum, frustumFromViewProjection, type LookAtCamera, pointInFrustum, viewProjectionMatrix, WORLD_UP } from '../../src/camera';
import { DepthRange, mat4, vec3 } from '../../src/math';

const RANGES = [['0..1 (WebGPU)', DepthRange.ZeroToOne], ['−1..1 (WebGL2)', DepthRange.NegOneToOne]] as const;
const camera: LookAtCamera = { eye: vec3.create(10, -20, 15), target: vec3.create(40, 30, 0), up: WORLD_UP, fovY: Math.PI / 3, near: 1, far: 200 };

function setup(range: DepthRange, cam = camera, aspect = 16 / 9) {
  const m = mat4.create();
  viewProjectionMatrix(m, cam, aspect, range);
  return { m, frustum: frustumFromViewProjection(createFrustum(), m, range) };
}

/** Independent reference: the clip-space definition of « inside ». */
function insideByClip(m: Float32Array, range: DepthRange, x: number, y: number, z: number): boolean {
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  const cz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!, cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const zMin = range === DepthRange.ZeroToOne ? 0 : -cw;
  return cx >= -cw && cx <= cw && cy >= -cw && cy <= cw && cz >= zMin && cz <= cw;
}

/** Small deterministic generator, so failures are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('frustum planes', () => {
  for (const [name, range] of RANGES) {
    it(`6 unit planes; target inside, eye-side and far points outside (depth ${name})`, () => {
      const { frustum } = setup(range);
      for (let p = 0; p < 6; p++) expect(Math.hypot(frustum[p * 4]!, frustum[p * 4 + 1]!, frustum[p * 4 + 2]!)).toBeCloseTo(1, 12);
      expect(pointInFrustum(frustum, 40, 30, 0)).toBe(true);
      expect(pointInFrustum(frustum, 10, -20, 15)).toBe(false); // the eye itself is before the near plane
      expect(pointInFrustum(frustum, -20, -70, 30)).toBe(false); // behind the camera
      expect(pointInFrustum(frustum, 400, 600, -180)).toBe(false); // beyond far
    });

    it(`agrees with the clip-space definition on 20 000 random points (depth ${name})`, () => {
      const { m, frustum } = setup(range);
      const r = rng(12345);
      let inside = 0, skipped = 0;
      for (let k = 0; k < 20000; k++) {
        const x = -150 + 400 * r(), y = -150 + 400 * r(), z = -100 + 200 * r();
        // Points within rounding distance of a plane may legitimately fall either way.
        let onPlane = false;
        for (let p = 0; p < 6; p++) if (Math.abs(frustum[p * 4]! * x + frustum[p * 4 + 1]! * y + frustum[p * 4 + 2]! * z + frustum[p * 4 + 3]!) < 1e-3) onPlane = true;
        if (onPlane) { skipped++; continue; }
        const want = insideByClip(m, range, x, y, z);
        expect(pointInFrustum(frustum, x, y, z)).toBe(want);
        if (want) inside++;
      }
      expect(inside).toBeGreaterThan(500); // the sample really covers the inside…
      expect(inside).toBeLessThan(15000); // …and the outside
      expect(skipped).toBeLessThan(50);
    });

    it(`near plane is at the camera's near distance, far plane at far (depth ${name})`, () => {
      const cam: LookAtCamera = { eye: vec3.create(0, 0, 100), target: vec3.create(0, 0, 0), up: vec3.create(0, 1, 0), fovY: Math.PI / 2, near: 10, far: 60 };
      const { frustum } = setup(range, cam, 1);
      expect(pointInFrustum(frustum, 0, 0, 100 - 9.9)).toBe(false);
      expect(pointInFrustum(frustum, 0, 0, 100 - 10.1)).toBe(true);
      expect(pointInFrustum(frustum, 0, 0, 100 - 59.9)).toBe(true);
      expect(pointInFrustum(frustum, 0, 0, 100 - 60.1)).toBe(false);
      // fov 90°, aspect 1: at depth 50 the half-width is 50.
      expect(pointInFrustum(frustum, 49.9, 0, 50)).toBe(true);
      expect(pointInFrustum(frustum, 50.1, 0, 50)).toBe(false);
      expect(pointInFrustum(frustum, 0, -49.9, 50)).toBe(true);
      expect(pointInFrustum(frustum, 0, -50.1, 50)).toBe(false);
    });
  }

  it('rejects a degenerate matrix', () => {
    expect(() => frustumFromViewProjection(createFrustum(), new Float32Array(16), DepthRange.ZeroToOne)).toThrow(/degenerate/);
  });
});

describe('box against frustum', () => {
  const box = (cx: number, cy: number, cz: number, h: number) => ({ minX: cx - h, minY: cy - h, minZ: cz - h, maxX: cx + h, maxY: cy + h, maxZ: cz + h });

  for (const [name, range] of RANGES) {
    it(`never rejects a box that contains a visible point (depth ${name})`, () => {
      const { m, frustum } = setup(range);
      const r = rng(777);
      let kept = 0, rejected = 0;
      for (let k = 0; k < 5000; k++) {
        const b = box(-150 + 400 * r(), -150 + 400 * r(), -100 + 200 * r(), 1 + 30 * r());
        const got = aabbIntersectsFrustum(frustum, b);
        if (got) kept++; else rejected++;
        if (got) continue;
        // Rejected → none of a dense sample of its points may be inside the frustum.
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let l = 0; l <= 4; l++) {
          const x = b.minX + ((b.maxX - b.minX) * i) / 4, y = b.minY + ((b.maxY - b.minY) * j) / 4, z = b.minZ + ((b.maxZ - b.minZ) * l) / 4;
          expect(insideByClip(m, range, x, y, z)).toBe(false);
        }
      }
      expect(kept).toBeGreaterThan(200);
      expect(rejected).toBeGreaterThan(200);
    });
  }

  it('a box fully inside, a box straddling a plane, a box fully outside, a box containing the whole frustum', () => {
    const { frustum } = setup(DepthRange.ZeroToOne);
    expect(aabbIntersectsFrustum(frustum, box(40, 30, 0, 2))).toBe(true);
    expect(aabbIntersectsFrustum(frustum, box(10, -20, 15, 5))).toBe(true); // around the eye: crosses the near plane
    expect(aabbIntersectsFrustum(frustum, box(-60, -120, 40, 5))).toBe(false); // behind
    expect(aabbIntersectsFrustum(frustum, box(0, 0, 0, 5000))).toBe(true);
    // A flat box (zero thickness) is still a valid box.
    expect(aabbIntersectsFrustum(frustum, { minX: 35, minY: 25, minZ: 0, maxX: 45, maxY: 35, maxZ: 0 })).toBe(true);
  });
});
