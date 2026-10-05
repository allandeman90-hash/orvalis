import { describe, expect, it } from 'vitest';
import { DepthRange, mat4, quat, vec3 } from '../../src/math';

const EPS = 1e-5;
function expectVec(actual: Float32Array, expected: number[], eps = EPS): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((e, i) => expect(Math.abs(actual[i]! - e), `component ${i}: ${actual[i]} vs ${e}`).toBeLessThan(eps));
}

describe('vec3', () => {
  it('stores float32', () => {
    expect(vec3.create(1, 2, 3)).toBeInstanceOf(Float32Array);
  });
  it('add / sub / scale / dot', () => {
    const a = vec3.create(1, 2, 3), b = vec3.create(4, -5, 6);
    expectVec(vec3.add(vec3.create(), a, b), [5, -3, 9]);
    expectVec(vec3.sub(vec3.create(), a, b), [-3, 7, -3]);
    expectVec(vec3.scale(vec3.create(), a, 2), [2, 4, 6]);
    expect(vec3.dot(a, b)).toBe(12);
  });
  it('cross is right-handed and alias-safe', () => {
    const x = vec3.create(1, 0, 0), y = vec3.create(0, 1, 0);
    expectVec(vec3.cross(vec3.create(), x, y), [0, 0, 1]);
    expectVec(vec3.cross(x, x, y), [0, 0, 1]);
  });
  it('length / distance / normalize', () => {
    expect(vec3.length(vec3.create(3, 4, 0))).toBe(5);
    expect(vec3.distance(vec3.create(1, 1, 1), vec3.create(1, 4, 5))).toBe(5);
    expectVec(vec3.normalize(vec3.create(), vec3.create(0, 0, 9)), [0, 0, 1]);
  });
  it('normalize of zero vector is zero, not NaN', () => {
    expectVec(vec3.normalize(vec3.create(7, 7, 7), vec3.create()), [0, 0, 0]);
  });
  it('lerp endpoints and midpoint', () => {
    const a = vec3.create(0, 0, 0), b = vec3.create(2, 4, 6);
    expectVec(vec3.lerp(vec3.create(), a, b, 0), [0, 0, 0]);
    expectVec(vec3.lerp(vec3.create(), a, b, 1), [2, 4, 6]);
    expectVec(vec3.lerp(vec3.create(), a, b, 0.5), [1, 2, 3]);
  });
});

describe('mat4', () => {
  it('identity leaves points unchanged', () => {
    expectVec(mat4.transformPoint(vec3.create(), mat4.create(), vec3.create(1, 2, 3)), [1, 2, 3]);
  });
  it('translation is stored in column 3 (column-major)', () => {
    const m = mat4.fromTranslation(mat4.create(), vec3.create(10, 20, 30));
    expect([m[12], m[13], m[14]]).toEqual([10, 20, 30]);
    expectVec(mat4.transformPoint(vec3.create(), m, vec3.create(1, 2, 3)), [11, 22, 33]);
    expectVec(mat4.transformDirection(vec3.create(), m, vec3.create(1, 2, 3)), [1, 2, 3]);
  });
  it('multiply applies the right-hand matrix first', () => {
    const t = mat4.fromTranslation(mat4.create(), vec3.create(10, 0, 0));
    const s = mat4.fromScaling(mat4.create(), vec3.create(2, 2, 2));
    const ts = mat4.multiply(mat4.create(), t, s); // scale then translate
    const st = mat4.multiply(mat4.create(), s, t); // translate then scale
    expectVec(mat4.transformPoint(vec3.create(), ts, vec3.create(1, 0, 0)), [12, 0, 0]);
    expectVec(mat4.transformPoint(vec3.create(), st, vec3.create(1, 0, 0)), [22, 0, 0]);
  });
  it('multiply is alias-safe', () => {
    const t = mat4.fromTranslation(mat4.create(), vec3.create(1, 2, 3));
    const expected = mat4.multiply(mat4.create(), t, t);
    mat4.multiply(t, t, t);
    expectVec(t, Array.from(expected));
  });
  it('invert: M × M⁻¹ = I for a non-trivial matrix', () => {
    const r = quat.toMat4(mat4.create(), quat.fromAxisAngle(quat.create(), vec3.normalize(vec3.create(), vec3.create(1, 2, 3)), 0.7));
    const m = mat4.multiply(mat4.create(), mat4.fromTranslation(mat4.create(), vec3.create(5, -3, 8)), r);
    mat4.multiply(m, m, mat4.fromScaling(mat4.create(), vec3.create(2, 3, 0.5)));
    const inv = mat4.invert(mat4.create(), m);
    expect(inv).not.toBeNull();
    expectVec(mat4.multiply(mat4.create(), m, inv!), Array.from(mat4.create()), 1e-4);
  });
  it('invert returns null for a singular matrix and leaves out untouched', () => {
    const out = mat4.create();
    const singular = mat4.fromScaling(mat4.create(), vec3.create(1, 0, 1));
    expect(mat4.invert(out, singular)).toBeNull();
    expectVec(out, Array.from(mat4.create()));
  });
  it('lookAt: eye maps to origin, target lies on -Z, up stays +Y', () => {
    const eye = vec3.create(3, 4, 5), target = vec3.create(3, 4, -5);
    const v = mat4.lookAt(mat4.create(), eye, target, vec3.create(0, 1, 0));
    expectVec(mat4.transformPoint(vec3.create(), v, eye), [0, 0, 0]);
    expectVec(mat4.transformPoint(vec3.create(), v, target), [0, 0, -10]);
    expectVec(mat4.transformDirection(vec3.create(), v, vec3.create(0, 1, 0)), [0, 1, 0]);
  });
  it('lookAt with a Z-up world (spec uses Z as height)', () => {
    const v = mat4.lookAt(mat4.create(), vec3.create(0, -10, 0), vec3.create(0, 0, 0), vec3.create(0, 0, 1));
    expectVec(mat4.transformPoint(vec3.create(), v, vec3.create(0, 0, 0)), [0, 0, -10]);
    expectVec(mat4.transformDirection(vec3.create(), v, vec3.create(0, 0, 1)), [0, 1, 0]);
    expectVec(mat4.transformDirection(vec3.create(), v, vec3.create(1, 0, 0)), [1, 0, 0]);
  });
  it('lookAt degenerate inputs give identity, not NaN', () => {
    const p = vec3.create(1, 1, 1);
    expectVec(mat4.lookAt(mat4.create(), p, p, vec3.create(0, 1, 0)), Array.from(mat4.create()));
    expectVec(mat4.lookAt(mat4.create(), vec3.create(), vec3.create(0, 5, 0), vec3.create(0, 1, 0)), Array.from(mat4.create()));
  });
  it('perspective WebGL depth: near → -1, far → +1', () => {
    const p = mat4.perspective(mat4.create(), Math.PI / 2, 1, 1, 100, DepthRange.NegOneToOne);
    expect(mat4.transformPoint(vec3.create(), p, vec3.create(0, 0, -1))[2]).toBeCloseTo(-1, 5);
    expect(mat4.transformPoint(vec3.create(), p, vec3.create(0, 0, -100))[2]).toBeCloseTo(1, 5);
  });
  it('perspective WebGPU depth: near → 0, far → 1', () => {
    const p = mat4.perspective(mat4.create(), Math.PI / 2, 1, 1, 100, DepthRange.ZeroToOne);
    expect(mat4.transformPoint(vec3.create(), p, vec3.create(0, 0, -1))[2]).toBeCloseTo(0, 5);
    expect(mat4.transformPoint(vec3.create(), p, vec3.create(0, 0, -100))[2]).toBeCloseTo(1, 5);
  });
  it('perspective 90° fov: frustum edge maps to NDC ±1, aspect scales X', () => {
    const p = mat4.perspective(mat4.create(), Math.PI / 2, 2, 1, 100, DepthRange.ZeroToOne);
    const edge = mat4.transformPoint(vec3.create(), p, vec3.create(20, 10, -10));
    expect(edge[0]).toBeCloseTo(1, 5);
    expect(edge[1]).toBeCloseTo(1, 5);
  });
});

describe('quat', () => {
  const Z = vec3.create(0, 0, 1);
  it('identity by default', () => {
    expectVec(quat.create(), [0, 0, 0, 1]);
  });
  it('90° about Z rotates +X to +Y (right-handed)', () => {
    const q = quat.fromAxisAngle(quat.create(), Z, Math.PI / 2);
    expectVec(quat.rotateVec3(vec3.create(), q, vec3.create(1, 0, 0)), [0, 1, 0]);
  });
  it('toMat4 agrees with rotateVec3', () => {
    const q = quat.fromAxisAngle(quat.create(), vec3.normalize(vec3.create(), vec3.create(1, -2, 0.5)), 1.1);
    const v = vec3.create(0.3, -4, 2);
    const viaQ = quat.rotateVec3(vec3.create(), q, v);
    const viaM = mat4.transformDirection(vec3.create(), quat.toMat4(mat4.create(), q), v);
    expectVec(viaM, Array.from(viaQ));
  });
  it('multiply composes rotations, right operand first', () => {
    const a = quat.fromAxisAngle(quat.create(), Z, Math.PI / 2);
    const b = quat.fromAxisAngle(quat.create(), vec3.create(1, 0, 0), Math.PI / 2);
    const ab = quat.multiply(quat.create(), a, b);
    // b: +Y → +Z ; then a (about Z) leaves +Z unchanged
    expectVec(quat.rotateVec3(vec3.create(), ab, vec3.create(0, 1, 0)), [0, 0, 1]);
  });
  it('slerp endpoints, midpoint and unit length', () => {
    const a = quat.create();
    const b = quat.fromAxisAngle(quat.create(), Z, Math.PI / 2);
    expectVec(quat.slerp(quat.create(), a, b, 0), Array.from(a));
    expectVec(quat.slerp(quat.create(), a, b, 1), Array.from(b));
    const mid = quat.slerp(quat.create(), a, b, 0.5);
    expectVec(mid, Array.from(quat.fromAxisAngle(quat.create(), Z, Math.PI / 4)));
    expect(Math.hypot(...mid)).toBeCloseTo(1, 5);
  });
  it('slerp takes the shortest arc when the dot product is negative', () => {
    const a = quat.fromAxisAngle(quat.create(), Z, 0.2);
    const b = quat.fromAxisAngle(quat.create(), Z, 0.4);
    const negB = quat.set(quat.create(), -b[0]!, -b[1]!, -b[2]!, -b[3]!); // same rotation as b
    const mid = quat.slerp(quat.create(), a, negB, 0.5);
    const rotated = quat.rotateVec3(vec3.create(), mid, vec3.create(1, 0, 0));
    expectVec(rotated, [Math.cos(0.3), Math.sin(0.3), 0]);
  });
  it('slerp of identical quaternions is stable (no NaN)', () => {
    const a = quat.fromAxisAngle(quat.create(), Z, 0.5);
    expectVec(quat.slerp(quat.create(), a, a, 0.37), Array.from(a));
  });
  it('normalize of zero quaternion is identity', () => {
    expectVec(quat.normalize(quat.create(), new Float32Array(4)), [0, 0, 0, 1]);
  });
});
