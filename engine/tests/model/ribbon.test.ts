import { describe, expect, it } from 'vitest';
import { MAX_RIBBON_EDGES, RIBBON_VERTEX_FLOATS, ribbonCapacity, type RibbonEmitter, ribbonStripIndices, ribbonTexture, RibbonTrail, TREE_RIBBON, validateRibbonEmitter } from '../../src/model';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 5): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
/** 10 edges per second, 1 s of life, 0.5 above and 0.25 below, emitter at the origin of its bone. */
const BASE: RibbonEmitter = { name: 'test', bone: 0, position: [0, 0, 0], heightAbove: 0.5, heightBelow: 0.25, edgesPerSecond: 10, edgeLifetime: 1, gravity: 0, color: [1, 0.5, 0.25, 0.75], blend: 'alpha' };
const edges = (trail: RibbonTrail) => Array.from({ length: trail.count }, (_, k) => trail.edge(k));

describe('ribbon edges (spec §92)', () => {
  it('an edge is top = node + axis × heightAbove, bottom = node − axis × heightBelow', () => {
    const trail = new RibbonTrail(BASE);
    trail.update(0.1, at(3, 4, 5));
    expect(trail.count).toBe(1);
    close(trail.edge(0).top, [3, 4, 5.5]);
    close(trail.edge(0).bottom, [3, 4, 4.75]);
  });

  it('the axis is the emitter +z through its matrix, at unit length whatever the scale', () => {
    // Emitter +z = world +x, matrix doubled.
    const trail = new RibbonTrail({ ...BASE, position: [0, 0, 1] });
    trail.update(0.1, [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 10, 0, 0, 1]);
    close(trail.edge(0).top, [12.5, 0, 0]);
    close(trail.edge(0).bottom, [11.75, 0, 0]);
  });

  it('commits edges at edgesPerSecond', () => {
    const trail = new RibbonTrail(BASE);
    trail.update(0.05, at(0, 0, 0));
    expect(trail.count).toBe(0);
    trail.update(0.05, at(0, 0, 0));
    expect(trail.count).toBe(1);
    trail.update(0.4, at(0, 0, 0));
    expect(trail.count).toBe(5);
  });

  it('an edge due in the middle of a step lies between the previous and the present position, with its true age', () => {
    const trail = new RibbonTrail(BASE);
    trail.update(0.1, at(0, 0, 0)); // edge at x = 0, the emitter is at 0
    trail.update(0.25, at(10, 0, 0)); // edges due 0.1 and 0.2 s into this step: 40 % and 80 % of the way
    close(edges(trail).map((e) => e.top[0]), [0, 4, 8]);
    close(edges(trail).map((e) => e.age), [0.25, 0.15, 0.05]);
  });

  it('edges expire at edgeLifetime: a steady ribbon keeps rate × lifetime of them', () => {
    const trail = new RibbonTrail(BASE);
    for (let k = 0; k < 30; k++) trail.update(0.1, at(k, 0, 0));
    expect(trail.count).toBe(10);
    close(edges(trail).map((e) => e.age), [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0], 4);
    close(edges(trail).map((e) => e.top[0]), [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(trail.capacity).toBe(11);
  });

  it('stored edges stay where they were committed: the trail does not follow the emitter', () => {
    const trail = new RibbonTrail(BASE);
    trail.update(0.1, at(0, 0, 0));
    trail.update(0.05, at(100, 0, 0));
    close(trail.edge(0).top, [0, 0, 0.5]);
  });

  it('gravity sags stored edges by g × age² / 2, top and bottom alike', () => {
    const trail = new RibbonTrail({ ...BASE, gravity: 4 });
    for (let k = 0; k < 5; k++) trail.update(0.1, at(k, 0, 0));
    for (const edge of edges(trail)) {
      expect(edge.top[2]).toBeCloseTo(0.5 - 2 * edge.age * edge.age, 5);
      expect(edge.bottom[2]).toBeCloseTo(-0.25 - 2 * edge.age * edge.age, 5);
    }
  });
});

describe('ribbon strip', () => {
  it('writes top and bottom of every edge, oldest first, then a head edge at the emitter; U = age / lifetime', () => {
    const trail = new RibbonTrail(BASE);
    trail.update(0.1, at(0, 0, 0));
    trail.update(0.1, at(1, 0, 0));
    trail.update(0.05, at(1.5, 0, 0));
    expect(trail.vertexCount).toBe(6);
    const out = new Float32Array((trail.capacity + 1) * 2 * RIBBON_VERTEX_FLOATS);
    expect(trail.writeStrip(out)).toBe(6);
    const vertex = (k: number): number[] => Array.from(out.subarray(k * 9, k * 9 + 9));
    close(vertex(0), [0, 0, 0.5, 0.15, 0, 1, 0.5, 0.25, 0.75]); // oldest edge, top: 0.15 s old
    close(vertex(1), [0, 0, -0.25, 0.15, 1, 1, 0.5, 0.25, 0.75]);
    close(vertex(2), [1, 0, 0.5, 0.05, 0, 1, 0.5, 0.25, 0.75]);
    close(vertex(4), [1.5, 0, 0.5, 0, 0, 1, 0.5, 0.25, 0.75]); // head: where the emitter is now, age 0
    close(vertex(5), [1.5, 0, -0.25, 0, 1, 1, 0.5, 0.25, 0.75]);
  });

  it('is empty before the first update and refuses an array that is too small', () => {
    const trail = new RibbonTrail(BASE);
    expect(trail.vertexCount).toBe(0);
    expect(trail.writeStrip(new Float32Array(0))).toBe(0);
    trail.update(0.3, at(0, 0, 0));
    expect(() => trail.writeStrip(new Float32Array(9))).toThrow(/are needed/);
  });

  it('strip indices: two triangles per pair of neighbouring edges', () => {
    expect(Array.from(ribbonStripIndices(3))).toEqual([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
    expect(() => ribbonStripIndices(1)).toThrow(/edge count/);
  });
});

describe('ribbon emitter validation and fixtures', () => {
  it('accepts the tree ribbon', () => {
    expect(() => validateRibbonEmitter(TREE_RIBBON, 3)).not.toThrow();
    expect(ribbonCapacity(TREE_RIBBON)).toBe(31);
  });
  it('rejects a bone outside the skeleton, a rate or lifetime ≤ 0, no height, too many edges', () => {
    expect(() => validateRibbonEmitter(TREE_RIBBON, 2)).toThrow(/bone 2 but the model has 2/);
    expect(() => validateRibbonEmitter({ ...BASE, edgesPerSecond: 0 }, 1)).toThrow(/edges per second/);
    expect(() => validateRibbonEmitter({ ...BASE, edgeLifetime: 0 }, 1)).toThrow(/lifetime/);
    expect(() => validateRibbonEmitter({ ...BASE, heightAbove: 0, heightBelow: 0 }, 1)).toThrow(/heights/);
    expect(() => validateRibbonEmitter({ ...BASE, edgesPerSecond: MAX_RIBBON_EDGES }, 1)).toThrow(/the limit is 4096/);
  });
  it('the fade texture is opaque at the emitter end and transparent at the tail', () => {
    const fade = ribbonTexture('fade');
    expect(fade.data[3]).toBe(255);
    expect(fade.data[(fade.width - 1) * 4 + 3]).toBe(0);
    expect(ribbonTexture('solid').data[(fade.width - 1) * 4 + 3]).toBe(255);
  });
});
