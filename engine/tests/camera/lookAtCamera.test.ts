import { describe, expect, it } from 'vitest';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../../src/camera';
import { DepthRange, mat4, vec3 } from '../../src/math';

const project = (m: Float32Array, x: number, y: number, z: number) => mat4.transformPoint(vec3.create(), m, vec3.create(x, y, z));

describe('test camera — engine is right-handed, Z up, ground plane X/Y', () => {
  // Standing south of the origin, slightly above the ground, looking north (+y).
  const side: LookAtCamera = { eye: vec3.create(0, -10, 2), target: vec3.create(0, 0, 2), up: WORLD_UP, fovY: Math.PI / 2, near: 1, far: 100 };
  const m = viewProjectionMatrix(mat4.create(), side, 1, DepthRange.ZeroToOne);

  it('WORLD_UP is +Z', () => {
    expect(Array.from(WORLD_UP)).toEqual([0, 0, 1]);
  });
  it('the target is at the centre of the screen', () => {
    const p = project(m, 0, 0, 2);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(0, 6);
  });
  it('+Z (height) goes up on screen', () => {
    expect(project(m, 0, 0, 5)[1]).toBeGreaterThan(0);
    expect(project(m, 0, 0, 0)[1]).toBeLessThan(0);
  });
  it('+X goes right when looking along +Y (right-handed)', () => {
    expect(project(m, 3, 0, 2)[0]).toBeGreaterThan(0);
    expect(project(m, -3, 0, 2)[0]).toBeLessThan(0);
  });
  it('farther along +Y means deeper', () => {
    expect(project(m, 0, 20, 2)[2]).toBeGreaterThan(project(m, 0, 0, 2)[2]!);
  });

  it('depth range follows the backend convention', () => {
    const atNear = [0, -9, 2] as const, atFar = [0, 90, 2] as const;
    const zo = viewProjectionMatrix(mat4.create(), side, 1, DepthRange.ZeroToOne);
    expect(project(zo, ...atNear)[2]).toBeCloseTo(0, 5);
    expect(project(zo, ...atFar)[2]).toBeCloseTo(1, 5);
    const no = viewProjectionMatrix(mat4.create(), side, 1, DepthRange.NegOneToOne);
    expect(project(no, ...atNear)[2]).toBeCloseTo(-1, 5);
    expect(project(no, ...atFar)[2]).toBeCloseTo(1, 5);
  });

  it('x and y on screen are identical on both depth conventions', () => {
    const a = project(viewProjectionMatrix(mat4.create(), side, 16 / 9, DepthRange.ZeroToOne), 3, 4, 5);
    const b = project(viewProjectionMatrix(mat4.create(), side, 16 / 9, DepthRange.NegOneToOne), 3, 4, 5);
    expect(a[0]).toBeCloseTo(b[0]!, 6);
    expect(a[1]).toBeCloseTo(b[1]!, 6);
  });

  it('looking straight down with up = +Y: +X is right, +Y is up, higher ground is nearer', () => {
    const top: LookAtCamera = { eye: vec3.create(16, 16, 60), target: vec3.create(16, 16, 0), up: vec3.create(0, 1, 0), fovY: Math.PI / 3, near: 0.5, far: 500 };
    const t = viewProjectionMatrix(mat4.create(), top, 16 / 9, DepthRange.ZeroToOne);
    expect(project(t, 26, 16, 0)[0]).toBeGreaterThan(0);
    expect(project(t, 16, 26, 0)[1]).toBeGreaterThan(0);
    expect(project(t, 16, 16, 12)[2]).toBeLessThan(project(t, 16, 16, 0)[2]!);
  });

  it('a wider aspect squeezes x only', () => {
    const a = project(viewProjectionMatrix(mat4.create(), side, 1, DepthRange.ZeroToOne), 3, 0, 5);
    const b = project(viewProjectionMatrix(mat4.create(), side, 2, DepthRange.ZeroToOne), 3, 0, 5);
    expect(b[0]).toBeCloseTo(a[0]! / 2, 6);
    expect(b[1]).toBeCloseTo(a[1]!, 6);
  });

  it('rejects invalid aspect and clip planes', () => {
    expect(() => viewProjectionMatrix(mat4.create(), side, 0, DepthRange.ZeroToOne)).toThrow(/aspect/);
    expect(() => viewProjectionMatrix(mat4.create(), side, Number.NaN, DepthRange.ZeroToOne)).toThrow(/aspect/);
    expect(() => viewProjectionMatrix(mat4.create(), { ...side, near: 0 }, 1, DepthRange.ZeroToOne)).toThrow(/near/);
    expect(() => viewProjectionMatrix(mat4.create(), { ...side, far: 0.5 }, 1, DepthRange.ZeroToOne)).toThrow(/near/);
  });
});
