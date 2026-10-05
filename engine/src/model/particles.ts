import type { BlendMode } from '../renderer';

/**
 * Particle emitters of a model (spec §89–§91).
 *
 * FROM THE SPEC:
 * - an emitter is attached to a bone, at a local position; its parameters: emission speed, speed variation,
 *   vertical / horizontal spread, lifespan, emission rate, emission area, gravity, texture, blend mode;
 * - emitter kinds: plane, sphere, spline;
 * - each update: age the particles, kill those past their lifespan, emit new ones, move them, depth-sort where
 *   needed, expand them into textured quads facing the camera;
 * - blend modes: opaque, alpha key, alpha blend, additive, modulate.
 *
 * OUR CHOICES (the document does not settle them):
 * - only the PLANE emitter exists here: particles start on a rectangle (length along the emitter's local x,
 *   width along its local y) and leave along its local +z; sphere and spline are not done;
 * - vertical spread tilts the direction away from +z by up to that angle, horizontal spread turns the tilt
 *   around z by up to ± that angle (π = any direction around);
 * - speed = emissionSpeed × (1 + speedVariation × r), r uniform in −1..1;
 * - once emitted a particle lives in WORLD space: it does not follow its bone any more;
 * - gravity is an acceleration along world −z (a negative value makes particles rise faster);
 * - size, colour and alpha go linearly from a start to an end value over the particle's life — the document
 *   lists none of them;
 * - emission is exact in time: a particle due in the middle of a step is created with the age it should have
 *   at the end of the step, so the result does not depend on the frame rate;
 * - at most `capacity` particles = ⌈rate × lifespan⌉ + 1 live at once (enough for a steady emitter);
 * - random numbers come from a small seeded generator: the same seed gives the same particles.
 */
export interface ParticleEmitter {
  readonly name: string;
  readonly bone: number;
  /** Where the emitter is, in model space, at rest. */
  readonly position: readonly [number, number, number];
  /** Particles per second. */
  readonly emissionRate: number;
  /** Seconds a particle lives. */
  readonly lifespan: number;
  /** World units per second. */
  readonly emissionSpeed: number;
  /** 0..1. */
  readonly speedVariation: number;
  /** Radians, 0..π. */
  readonly verticalSpread: number;
  /** Radians, 0..π. */
  readonly horizontalSpread: number;
  readonly areaLength: number;
  readonly areaWidth: number;
  readonly gravity: number;
  /** Side of the square, at birth and at death. */
  readonly size: readonly [number, number];
  /** r, g, b, a in 0..1, at birth and at death. */
  readonly colorStart: readonly [number, number, number, number];
  readonly colorEnd: readonly [number, number, number, number];
  readonly blend: Exclude<BlendMode, 'mod2x' | 'addNoAlpha'>;
}

export function validateParticleEmitter(e: ParticleEmitter, boneCount: number): void {
  const fail = (message: string): never => {
    throw new Error(`particle emitter "${e.name}": ${message}`);
  };
  if (!Number.isInteger(e.bone) || e.bone < 0 || e.bone >= boneCount) fail(`is on bone ${e.bone} but the model has ${boneCount} bone(s)`);
  const numbers = [...e.position, e.emissionRate, e.lifespan, e.emissionSpeed, e.speedVariation, e.verticalSpread, e.horizontalSpread, e.areaLength, e.areaWidth, e.gravity, ...e.size, ...e.colorStart, ...e.colorEnd];
  if (!numbers.every(Number.isFinite)) fail('every value must be finite');
  if (!(e.emissionRate > 0)) fail(`emission rate must be > 0 (got ${e.emissionRate})`);
  if (!(e.lifespan > 0)) fail(`lifespan must be > 0 (got ${e.lifespan})`);
  if (particleCapacity(e) > MAX_PARTICLES) fail(`would keep ${particleCapacity(e)} particles alive, the limit is ${MAX_PARTICLES}`);
  if (e.speedVariation < 0 || e.speedVariation > 1) fail(`speed variation must be in 0..1 (got ${e.speedVariation})`);
  if (e.verticalSpread < 0 || e.verticalSpread > Math.PI || e.horizontalSpread < 0 || e.horizontalSpread > Math.PI) fail('spreads must be in 0..π radians');
  if (e.areaLength < 0 || e.areaWidth < 0 || e.size[0] < 0 || e.size[1] < 0) fail('area and sizes must be ≥ 0');
  if ([...e.colorStart, ...e.colorEnd].some((c) => c < 0 || c > 1)) fail('colours must be in 0..1');
  if (!['opaque', 'alpha', 'add', 'mod'].includes(e.blend)) fail(`unknown blend "${String(e.blend)}"`);
}

/** OUR CHOICE: 16-bit indices, 4 vertices per particle. */
export const MAX_PARTICLES = 16384;

export function particleCapacity(e: ParticleEmitter): number {
  return Math.ceil(e.emissionRate * e.lifespan) + 1;
}

const AGE_EPSILON = 1e-5;
/** Floats per live particle in ParticleSystem.particles: position xyz, velocity xyz, age. */
const STRIDE = 7;

/** Vertex of an expanded particle: position xyz, uv, colour rgba — 9 floats. */
export const PARTICLE_VERTEX_FLOATS = 9;

export class ParticleSystem {
  readonly capacity: number;
  /** Live particles, packed: position, velocity, age. Oldest first. */
  private readonly particles: Float32Array;
  private live = 0;
  /** Fraction of a particle not yet emitted (0..1). */
  private pending = 0;
  private state: number;

  constructor(readonly emitter: ParticleEmitter, seed = 1) {
    this.capacity = particleCapacity(emitter);
    this.particles = new Float32Array(this.capacity * STRIDE);
    this.state = seed >>> 0 || 1;
  }

  get count(): number {
    return this.live;
  }

  /** Uniform in 0..1 (never 1). */
  private random(): number {
    // xorshift32
    let s = this.state;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.state = s;
    return s / 4294967296;
  }

  /**
   * One step of `dt` seconds (spec §89: age, kill, emit, move).
   * @param emitterMatrix emitter space → world for this moment: instance matrix × bone matrix (16 floats)
   */
  update(dt: number, emitterMatrix: ArrayLike<number>): void {
    if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error(`particles: the time step must be finite and ≥ 0 (got ${dt})`);
    if (dt === 0) return;
    const e = this.emitter, p = this.particles;
    // 1–2. Age and move the particles already there; drop the dead ones (they are the oldest: at the front).
    let kept = 0;
    for (let k = 0; k < this.live; k++) {
      const at = k * STRIDE, age = p[at + 6]! + dt;
      // Ages are 32-bit sums of steps: without the small margin a particle exactly at its lifespan could survive a step.
      if (age >= e.lifespan - AGE_EPSILON) continue;
      integrate(p, at, dt, e.gravity);
      p[at + 6] = age;
      if (kept !== k) p.copyWithin(kept * STRIDE, at, at + STRIDE);
      kept++;
    }
    this.live = kept;
    // 3–4. Emit: one particle every 1 / rate seconds, each already aged by what is left of the step.
    // Counted in particles (not in seconds) so that whole steps such as « 1 s at 10 per second » come out exact.
    this.pending += dt * e.emissionRate;
    while (this.pending >= 1) {
      this.pending -= 1;
      const age = this.pending / e.emissionRate; // born that long before the end of this step
      // Consume the random numbers even when the particle is not kept, so a skipped one does not shift the others.
      const born = this.spawn(emitterMatrix);
      if (age >= e.lifespan) continue;
      if (this.live === this.capacity) {
        p.copyWithin(0, STRIDE, this.live * STRIDE);
        this.live--;
      }
      const at = this.live * STRIDE;
      p.set(born, at);
      p[at + 6] = 0;
      integrate(p, at, age, e.gravity);
      p[at + 6] = age;
      this.live++;
    }
  }

  private readonly scratch = new Float32Array(STRIDE);

  private spawn(m: ArrayLike<number>): Float32Array {
    const e = this.emitter, out = this.scratch;
    const lx = e.position[0] + (this.random() - 0.5) * e.areaLength, ly = e.position[1] + (this.random() - 0.5) * e.areaWidth, lz = e.position[2];
    const tilt = this.random() * e.verticalSpread, around = (this.random() * 2 - 1) * e.horizontalSpread;
    const speed = e.emissionSpeed * (1 + e.speedVariation * (this.random() * 2 - 1));
    const dx = Math.sin(tilt) * Math.cos(around), dy = Math.sin(tilt) * Math.sin(around), dz = Math.cos(tilt);
    out[0] = m[0]! * lx + m[4]! * ly + m[8]! * lz + m[12]!;
    out[1] = m[1]! * lx + m[5]! * ly + m[9]! * lz + m[13]!;
    out[2] = m[2]! * lx + m[6]! * ly + m[10]! * lz + m[14]!;
    // Direction: through the matrix as a direction, then back to unit length (the matrix may scale).
    const wx = m[0]! * dx + m[4]! * dy + m[8]! * dz, wy = m[1]! * dx + m[5]! * dy + m[9]! * dz, wz = m[2]! * dx + m[6]! * dy + m[10]! * dz;
    const length = Math.hypot(wx, wy, wz) || 1;
    out[3] = (wx / length) * speed;
    out[4] = (wy / length) * speed;
    out[5] = (wz / length) * speed;
    out[6] = 0;
    return out;
  }

  /** Position, age and life fraction (0 at birth, 1 at death) of live particle `index` (0 = oldest). */
  particle(index: number): { position: [number, number, number]; age: number; life: number } {
    if (!Number.isInteger(index) || index < 0 || index >= this.live) throw new Error(`particles: no live particle ${index}`);
    const at = index * STRIDE, p = this.particles;
    return { position: [p[at]!, p[at + 1]!, p[at + 2]!], age: p[at + 6]!, life: p[at + 6]! / this.emitter.lifespan };
  }

  /**
   * Expands the live particles into camera-facing quads (spec §90): 4 vertices each, PARTICLE_VERTEX_FLOATS
   * floats per vertex, in world space. Farthest first when `sort` (needed for alpha blending, spec §89 step 5).
   * @returns the number of particles written
   */
  writeQuads(out: Float32Array, cameraRight: ArrayLike<number>, cameraUp: ArrayLike<number>, sort?: { readonly eye: ArrayLike<number> }): number {
    if (out.length < this.live * 4 * PARTICLE_VERTEX_FLOATS) throw new Error(`particles: the vertex array holds ${out.length} floats, ${this.live * 4 * PARTICLE_VERTEX_FLOATS} are needed`);
    const e = this.emitter, p = this.particles;
    const order = Array.from({ length: this.live }, (_, k) => k);
    if (sort) {
      const eye = sort.eye, distance = (k: number): number => (p[k * STRIDE]! - eye[0]!) ** 2 + (p[k * STRIDE + 1]! - eye[1]!) ** 2 + (p[k * STRIDE + 2]! - eye[2]!) ** 2;
      order.sort((a, b) => distance(b) - distance(a));
    }
    let v = 0;
    for (const k of order) {
      const at = k * STRIDE, t = p[at + 6]! / e.lifespan, half = (e.size[0] + (e.size[1] - e.size[0]) * t) / 2;
      const colour = [0, 1, 2, 3].map((c) => e.colorStart[c]! + (e.colorEnd[c]! - e.colorStart[c]!) * t);
      for (const [sx, sy, u, w] of CORNERS) {
        out[v++] = p[at]! + (cameraRight[0]! * sx + cameraUp[0]! * sy) * half;
        out[v++] = p[at + 1]! + (cameraRight[1]! * sx + cameraUp[1]! * sy) * half;
        out[v++] = p[at + 2]! + (cameraRight[2]! * sx + cameraUp[2]! * sy) * half;
        out[v++] = u;
        out[v++] = w;
        out[v++] = colour[0]!; out[v++] = colour[1]!; out[v++] = colour[2]!; out[v++] = colour[3]!;
      }
    }
    return this.live;
  }
}

/** Corners of a quad, counter-clockwise seen from the camera: bottom left, bottom right, top right, top left. */
const CORNERS: ReadonlyArray<readonly [number, number, number, number]> = [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]];

/** Constant acceleration −gravity along z for `dt` seconds: exact, whatever the step. */
function integrate(p: Float32Array, at: number, dt: number, gravity: number): void {
  p[at] = p[at]! + p[at + 3]! * dt;
  p[at + 1] = p[at + 1]! + p[at + 4]! * dt;
  p[at + 2] = p[at + 2]! + p[at + 5]! * dt - 0.5 * gravity * dt * dt;
  p[at + 5] = p[at + 5]! - gravity * dt;
}

/** Indices of `count` quads (two triangles each), for the vertices of writeQuads(). */
export function particleQuadIndices(count: number): Uint16Array {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTICLES) throw new Error(`particles: quad count must be 1..${MAX_PARTICLES} (got ${count})`);
  const out = new Uint16Array(count * 6);
  for (let k = 0; k < count; k++) out.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  return out;
}
