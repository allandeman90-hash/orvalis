import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, PARTICLE_VERTEX_FLOATS, particleCapacity, type ParticleEmitter, particleQuadIndices, ParticleSystem, particleTexture, TREE_PARTICLE_EMITTERS, validateParticleEmitter } from '../../src/model';
import { NullBackend } from '../../src/renderer';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 5): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** No randomness: one particle every 0.1 s, straight up at 2 units per second, 1 s of life. */
const JET: ParticleEmitter = { ...TREE_PARTICLE_EMITTERS.jet, position: [0, 0, 0] };
const all = (system: ParticleSystem) => Array.from({ length: system.count }, (_, k) => system.particle(k));

describe('particle emission and life (spec §89: age, kill, emit, move)', () => {
  it('emits at the emission rate: one particle every 1 / rate seconds', () => {
    const system = new ParticleSystem(JET);
    system.update(0.05, IDENTITY);
    expect(system.count).toBe(0);
    system.update(0.05, IDENTITY);
    expect(system.count).toBe(1);
    system.update(0.45, IDENTITY);
    expect(system.count).toBe(5);
  });

  it('a particle born in the middle of a step already has the age and the place it should have', () => {
    const system = new ParticleSystem(JET);
    system.update(0.35, IDENTITY); // born at 0.1, 0.2, 0.3 → 0.25, 0.15, 0.05 s old
    close(all(system).map((p) => p.age), [0.25, 0.15, 0.05]);
    close(all(system).map((p) => p.position[2]), [0.5, 0.3, 0.1]);
  });

  it('gives the same particles whatever the frame rate', () => {
    const one = new ParticleSystem(JET), many = new ParticleSystem(JET);
    one.update(0.73, IDENTITY);
    for (let k = 0; k < 73; k++) many.update(0.01, IDENTITY);
    expect(many.count).toBe(one.count);
    all(one).forEach((p, k) => {
      expect(many.particle(k).age).toBeCloseTo(p.age, 4);
      close(many.particle(k).position, p.position, 4);
    });
  });

  it('kills particles at the end of their lifespan: a steady emitter keeps rate × lifespan alive', () => {
    const system = new ParticleSystem(JET);
    for (let k = 0; k < 500; k++) system.update(0.01, IDENTITY);
    // Float steps do not land exactly on the 0.1 s marks: 9 or 10 are alive, never more than the capacity.
    expect(system.count).toBeGreaterThanOrEqual(9);
    expect(system.count).toBeLessThanOrEqual(10);
    // With steps that are exact (0.125 s, rate 8): the particle that reaches its lifespan dies on that very step.
    const exact = new ParticleSystem({ ...JET, emissionRate: 8 });
    for (let k = 0; k < 24; k++) exact.update(0.125, IDENTITY);
    expect(exact.count).toBe(8);
    expect(system.capacity).toBe(11);
    for (const p of all(system)) {
      expect(p.age).toBeLessThan(1);
      expect(p.position[2]).toBeCloseTo(2 * p.age, 4);
    }
    expect(all(system).map((p) => p.age)).toEqual([...all(system).map((p) => p.age)].sort((a, b) => b - a)); // oldest first
  });

  it('a step longer than the lifespan leaves only the particles that would still be alive', () => {
    const system = new ParticleSystem(JET);
    system.update(5.05, IDENTITY);
    expect(system.count).toBe(10);
    close(all(system).map((p) => p.age), [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.05], 4);
  });

  it('gravity pulls along world −z: z = v·t − g·t² / 2', () => {
    const system = new ParticleSystem({ ...JET, gravity: 4 });
    system.update(0.6, IDENTITY);
    for (const p of all(system)) expect(p.position[2]).toBeCloseTo(2 * p.age - 2 * p.age * p.age, 4);
  });

  it('starts from the emitter position and leaves along the emitter +z, through the emitter matrix', () => {
    // Emitter turned so that its +z is the world +x, doubled in size, moved to (10, 20, 30).
    const matrix = [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 10, 20, 30, 1];
    const system = new ParticleSystem({ ...JET, position: [0, 0, 1] });
    system.update(0.1, matrix);
    system.update(0.5, matrix);
    // Local (0, 0, 1) → world (12, 20, 30); speed stays 2 units per second whatever the scale of the matrix.
    for (const p of all(system)) close(p.position, [12 + 2 * p.age, 20, 30], 4);
  });

  it('once emitted a particle no longer follows the emitter', () => {
    const system = new ParticleSystem(JET);
    system.update(0.1, IDENTITY);
    system.update(0.05, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]);
    close(system.particle(0).position, [0, 0, 0.1], 5);
  });
});

describe('spread, variation and area', () => {
  const sparks = TREE_PARTICLE_EMITTERS.sparkles;
  it('the same seed gives the same particles, another seed gives others', () => {
    const a = new ParticleSystem(sparks, 7), b = new ParticleSystem(sparks, 7), c = new ParticleSystem(sparks, 8);
    for (const system of [a, b, c]) system.update(1, IDENTITY);
    expect(all(a)).toEqual(all(b));
    expect(all(a)).not.toEqual(all(c));
  });

  it('keeps every direction within the vertical spread of +z, speeds within the variation, starts within the area', () => {
    const still: ParticleEmitter = { ...sparks, position: [0, 0, 0], gravity: 0, emissionRate: 200, lifespan: 2 };
    const system = new ParticleSystem(still, 3);
    system.update(1, IDENTITY);
    expect(system.count).toBe(200);
    let widest = 0, slowest = Infinity, fastest = 0;
    const sides = new Set<string>();
    for (const p of all(system)) {
      if (p.age < 0.5) continue;
      // The start point is within ±0.15 of the axis: remove at most that from the sideways travel.
      const sideways = Math.max(0, Math.hypot(p.position[0], p.position[1]) - Math.hypot(0.15, 0.15)), up = p.position[2];
      widest = Math.max(widest, Math.atan2(sideways, up));
      const speed = p.position[2] / p.age; // vertical part only: a lower bound of the speed
      slowest = Math.min(slowest, Math.hypot(...p.position) / p.age);
      fastest = Math.max(fastest, speed);
      sides.add(`${Math.sign(p.position[0])},${Math.sign(p.position[1])}`);
    }
    expect(widest).toBeLessThanOrEqual(still.verticalSpread + 1e-6);
    expect(widest).toBeGreaterThan(still.verticalSpread * 0.5); // the spread is really used
    expect(fastest).toBeLessThanOrEqual(still.emissionSpeed * (1 + still.speedVariation) + 1e-4);
    expect(slowest).toBeGreaterThanOrEqual(still.emissionSpeed * (1 - still.speedVariation) - 0.45); // − the start offset / age
    expect(sides.size).toBe(4); // horizontal spread π: all around
  });
});

describe('expansion into camera-facing quads (spec §90)', () => {
  const RIGHT = [0, -1, 0], UP = [0, 0, 1]; // a camera looking along +x

  it('writes 4 vertices per particle around its position, along the camera right and up, with uv and colour', () => {
    const system = new ParticleSystem({ ...JET, size: [0.4, 0.4], colorStart: [1, 0.5, 0.25, 1], colorEnd: [1, 0.5, 0.25, 1] });
    system.update(0.1, IDENTITY);
    system.update(0.05, IDENTITY); // one particle, 0.05 s old, at z = 0.1
    const out = new Float32Array(system.capacity * 4 * PARTICLE_VERTEX_FLOATS);
    expect(system.writeQuads(out, RIGHT, UP)).toBe(1);
    const vertex = (k: number): number[] => Array.from(out.subarray(k * 9, k * 9 + 9));
    close(vertex(0), [0, 0.2, -0.1, 0, 1, 1, 0.5, 0.25, 1]); // bottom left: −right − up
    close(vertex(1), [0, -0.2, -0.1, 1, 1, 1, 0.5, 0.25, 1]);
    close(vertex(2), [0, -0.2, 0.3, 1, 0, 1, 0.5, 0.25, 1]);
    close(vertex(3), [0, 0.2, 0.3, 0, 0, 1, 0.5, 0.25, 1]);
  });

  it('size, colour and alpha go from their start to their end value over the life', () => {
    const system = new ParticleSystem({ ...JET, size: [1, 0], colorStart: [1, 1, 0, 1], colorEnd: [0, 1, 1, 0] });
    system.update(0.1, IDENTITY);
    system.update(0.25, IDENTITY); // oldest: a quarter of its life
    const out = new Float32Array(system.capacity * 36);
    system.writeQuads(out, RIGHT, UP);
    expect(out[1]! - out[9 + 1]!).toBeCloseTo(0.75, 5); // width of the oldest quad
    close(out.subarray(5, 9), [0.75, 1, 0.25, 0.75]);
  });

  it('sorts far to near when asked (alpha blending), keeps the emission order otherwise', () => {
    const system = new ParticleSystem(JET);
    system.update(0.35, IDENTITY); // z = 0.5, 0.3, 0.1
    const out = new Float32Array(system.capacity * 36);
    const heights = (): number[] => [0, 1, 2].map((k) => (out[k * 36 + 2]! + out[k * 36 + 18 + 2]!) / 2);
    system.writeQuads(out, RIGHT, UP);
    close(heights(), [0.5, 0.3, 0.1]);
    system.writeQuads(out, RIGHT, UP, { eye: [0, 0, 10] }); // from above: the lowest is the farthest
    close(heights(), [0.1, 0.3, 0.5]);
    system.writeQuads(out, RIGHT, UP, { eye: [0, 0, -10] });
    close(heights(), [0.5, 0.3, 0.1]);
  });

  it('quad indices: two counter-clockwise triangles per particle', () => {
    expect(Array.from(particleQuadIndices(2))).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(() => particleQuadIndices(0)).toThrow(/quad count/);
  });

  it('refuses a vertex array that is too small', () => {
    const system = new ParticleSystem(JET);
    system.update(0.5, IDENTITY);
    expect(() => system.writeQuads(new Float32Array(36), RIGHT, UP)).toThrow(/are needed/);
  });
});

describe('emitter validation and fixtures', () => {
  it('accepts the tree emitters', () => {
    for (const emitter of Object.values(TREE_PARTICLE_EMITTERS)) expect(() => validateParticleEmitter(emitter, 3)).not.toThrow();
    expect(particleCapacity(TREE_PARTICLE_EMITTERS.sparkles)).toBe(65);
  });
  it('rejects a bone outside the skeleton, a rate or lifespan ≤ 0, too many particles, a spread beyond π', () => {
    expect(() => validateParticleEmitter(JET, 2)).toThrow(/bone 2 but the model has 2/);
    expect(() => validateParticleEmitter({ ...JET, emissionRate: 0 }, 3)).toThrow(/emission rate/);
    expect(() => validateParticleEmitter({ ...JET, lifespan: 0 }, 3)).toThrow(/lifespan/);
    expect(() => validateParticleEmitter({ ...JET, emissionRate: MAX_PARTICLES }, 3)).toThrow(/the limit is 16384/);
    expect(() => validateParticleEmitter({ ...JET, verticalSpread: 4 }, 3)).toThrow(/spreads/);
    expect(() => validateParticleEmitter({ ...JET, gravity: NaN }, 3)).toThrow(/finite/);
  });
  it('the soft texture is opaque in the middle and transparent at the corners; the solid one is opaque everywhere', () => {
    const soft = particleTexture('soft'), solid = particleTexture('solid');
    expect(soft.data[(16 * 32 + 16) * 4 + 3]).toBeGreaterThan(220);
    expect(soft.data[3]).toBe(0);
    expect(Array.from(solid.data.subarray(0, 4))).toEqual([255, 255, 255, 255]);
  });
});

describe('RendererBackend.updateBuffer', () => {
  it('replaces the start of a buffer and keeps the rest; the backend keeps its own copy', () => {
    const backend = new NullBackend();
    const handle = backend.createBuffer({ usage: 'vertex', data: new Float32Array([1, 2, 3, 4]) });
    const update = new Float32Array([9, 8]);
    backend.updateBuffer(handle, update);
    update[0] = -1;
    expect(Array.from(backend.bufferData(handle) as Float32Array)).toEqual([9, 8, 3, 4]);
    expect(backend.bufferUpdates).toBe(1);
  });
  it('refuses data that does not fit, another kind of array, an empty update, an unknown buffer', () => {
    const backend = new NullBackend();
    const handle = backend.createBuffer({ usage: 'vertex', data: new Float32Array(4) });
    expect(() => backend.updateBuffer(handle, new Float32Array(5))).toThrow(/does not fit in a buffer of 16 bytes/);
    expect(() => backend.updateBuffer(handle, new Uint16Array(2))).toThrow(/same kind of array/);
    expect(() => backend.updateBuffer(handle, new Float32Array(0))).toThrow(/no data/);
    backend.destroyBuffer(handle);
    expect(() => backend.updateBuffer(handle, new Float32Array(1))).toThrow(/unknown or destroyed buffer/);
  });
});
