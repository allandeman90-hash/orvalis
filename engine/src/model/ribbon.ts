import type { BlendMode } from '../renderer';

/**
 * Ribbon trails of a model (spec §92, §93).
 *
 * FROM THE SPEC: a ribbon is a stream of EDGES. Each update:
 *   emitter bone / local origin → current world node
 *   edge: top = node + axis × heightAbove, bottom = node − axis × heightBelow
 *   edges are committed at edgesPerSecond, old ones expire at edgeLifetime, gravity can sag stored edges,
 *   adjacent edges are drawn as quads; the texture U coordinate advances with the edge's age (so a texture
 *   with a transparent tail fades the trail). Colour, alpha, blend mode belong to the emitter.
 *
 * OUR CHOICES (the document does not settle them):
 * - the axis is the emitter's local +z, taken through its matrix;
 * - U = age / edgeLifetime (0 at the emitter, 1 where the trail ends), V = 0 on the top side, 1 on the bottom;
 * - besides the committed edges the strip always ends with a « head » edge at the emitter's present place
 *   (age 0), so the trail stays attached to what it follows between two commits;
 * - an edge due in the middle of a step is placed on the straight line between the emitter's previous and
 *   present position, at the right fraction, and gets the age it should have at the end of the step;
 * - sag: a stored edge has fallen by gravity × age² / 2 along world −z (it starts at rest);
 * - at most ⌈edgesPerSecond × edgeLifetime⌉ + 1 committed edges are kept;
 * - a ribbon is not lit, not fogged and visible from both sides. Animation-driven visibility and tracks for
 *   its colour and heights (spec §93) are NOT done.
 */
export interface RibbonEmitter {
  readonly name: string;
  readonly bone: number;
  /** Where the emitter is, in model space, at rest. */
  readonly position: readonly [number, number, number];
  readonly heightAbove: number;
  readonly heightBelow: number;
  readonly edgesPerSecond: number;
  /** Seconds an edge lives. */
  readonly edgeLifetime: number;
  readonly gravity: number;
  /** r, g, b, a in 0..1. */
  readonly color: readonly [number, number, number, number];
  readonly blend: Exclude<BlendMode, 'opaque' | 'mod' | 'mod2x' | 'addNoAlpha'>;
}

/** OUR CHOICE: 16-bit indices, 2 vertices per edge. */
export const MAX_RIBBON_EDGES = 4096;

export function ribbonCapacity(e: RibbonEmitter): number {
  return Math.ceil(e.edgesPerSecond * e.edgeLifetime) + 1;
}

export function validateRibbonEmitter(e: RibbonEmitter, boneCount: number): void {
  const fail = (message: string): never => {
    throw new Error(`ribbon emitter "${e.name}": ${message}`);
  };
  if (!Number.isInteger(e.bone) || e.bone < 0 || e.bone >= boneCount) fail(`is on bone ${e.bone} but the model has ${boneCount} bone(s)`);
  if (![...e.position, e.heightAbove, e.heightBelow, e.edgesPerSecond, e.edgeLifetime, e.gravity, ...e.color].every(Number.isFinite)) fail('every value must be finite');
  if (!(e.edgesPerSecond > 0)) fail(`edges per second must be > 0 (got ${e.edgesPerSecond})`);
  if (!(e.edgeLifetime > 0)) fail(`edge lifetime must be > 0 (got ${e.edgeLifetime})`);
  if (e.heightAbove < 0 || e.heightBelow < 0 || e.heightAbove + e.heightBelow === 0) fail('heights must be ≥ 0 and not both 0');
  if (ribbonCapacity(e) + 1 > MAX_RIBBON_EDGES) fail(`would keep ${ribbonCapacity(e) + 1} edges, the limit is ${MAX_RIBBON_EDGES}`);
  if (e.color.some((c) => c < 0 || c > 1)) fail('colour must be in 0..1');
  if (e.blend !== 'alpha' && e.blend !== 'add') fail(`unknown blend "${String(e.blend)}"`);
}

const AGE_EPSILON = 1e-5;
/** Floats per stored edge: top xyz, bottom xyz, age. */
const STRIDE = 7;
/** Vertex of the strip: position xyz, uv, colour rgba — the particle vertex. */
export const RIBBON_VERTEX_FLOATS = 9;

export class RibbonTrail {
  readonly capacity: number;
  /** Committed edges, oldest first, as they were when committed (the sag is applied when drawing). */
  private readonly edges: Float32Array;
  private live = 0;
  /** Fraction of an edge not yet committed (0..1). */
  private pending = 0;
  private readonly head = new Float32Array(6);
  private readonly previous = new Float32Array(6);
  private started = false;

  constructor(readonly emitter: RibbonEmitter) {
    this.capacity = ribbonCapacity(emitter);
    this.edges = new Float32Array(this.capacity * STRIDE);
  }

  /** Committed edges alive (the head edge is not counted). */
  get count(): number {
    return this.live;
  }

  /** Vertices writeStrip() will produce: two per committed edge, two for the head — 0 before the first update. */
  get vertexCount(): number {
    return this.started ? (this.live + 1) * 2 : 0;
  }

  /**
   * One step of `dt` seconds.
   * @param emitterMatrix emitter space → world for this moment: instance matrix × bone matrix (16 floats)
   */
  update(dt: number, emitterMatrix: ArrayLike<number>): void {
    if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error(`ribbon: the time step must be finite and ≥ 0 (got ${dt})`);
    const e = this.emitter, m = emitterMatrix, p = e.position;
    // Present node and axis (the emitter's +z as a world direction of length 1).
    const nx = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, ny = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, nz = m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!;
    const length = Math.hypot(m[8]!, m[9]!, m[10]!) || 1, ax = m[8]! / length, ay = m[9]! / length, az = m[10]! / length;
    if (this.started) this.previous.set(this.head);
    this.head.set([nx + ax * e.heightAbove, ny + ay * e.heightAbove, nz + az * e.heightAbove, nx - ax * e.heightBelow, ny - ay * e.heightBelow, nz - az * e.heightBelow]);
    if (!this.started) {
      this.previous.set(this.head);
      this.started = true;
    }
    if (dt === 0) return;
    // Age the stored edges; the expired ones are the oldest, at the front.
    const edges = this.edges;
    let kept = 0;
    for (let k = 0; k < this.live; k++) {
      const at = k * STRIDE, age = edges[at + 6]! + dt;
      // Ages are 32-bit sums of steps: without the small margin an edge exactly at its lifetime could survive a step.
      if (age >= e.edgeLifetime - AGE_EPSILON) continue;
      edges[at + 6] = age;
      if (kept !== k) edges.copyWithin(kept * STRIDE, at, at + STRIDE);
      kept++;
    }
    this.live = kept;
    // Commit new edges, counted in edges so that whole steps come out exact.
    this.pending += dt * e.edgesPerSecond;
    while (this.pending >= 1) {
      this.pending -= 1;
      const age = this.pending / e.edgesPerSecond;
      if (age >= e.edgeLifetime) continue;
      const t = 1 - age / dt; // where in the step it was committed: 0 = previous position, 1 = present
      if (this.live === this.capacity) {
        edges.copyWithin(0, STRIDE, this.live * STRIDE);
        this.live--;
      }
      const at = this.live * STRIDE;
      for (let k = 0; k < 6; k++) edges[at + k] = this.previous[k]! + (this.head[k]! - this.previous[k]!) * t;
      edges[at + 6] = age;
      this.live++;
    }
  }

  /** Committed edge `index` (0 = oldest) as drawn: top, bottom (with sag) and age. */
  edge(index: number): { top: [number, number, number]; bottom: [number, number, number]; age: number } {
    if (!Number.isInteger(index) || index < 0 || index >= this.live) throw new Error(`ribbon: no edge ${index}`);
    const at = index * STRIDE, e = this.edges, age = e[at + 6]!, sag = 0.5 * this.emitter.gravity * age * age;
    return { top: [e[at]!, e[at + 1]!, e[at + 2]! - sag], bottom: [e[at + 3]!, e[at + 4]!, e[at + 5]! - sag], age };
  }

  /**
   * Writes the strip: for each edge from the oldest to the head, its top then its bottom vertex
   * (RIBBON_VERTEX_FLOATS floats each). Use ribbonStripIndices() to draw it.
   * @returns the number of vertices written
   */
  writeStrip(out: Float32Array): number {
    const vertices = this.vertexCount;
    if (out.length < vertices * RIBBON_VERTEX_FLOATS) throw new Error(`ribbon: the vertex array holds ${out.length} floats, ${vertices * RIBBON_VERTEX_FLOATS} are needed`);
    const c = this.emitter.color;
    let v = 0;
    const put = (x: number, y: number, z: number, u: number, w: number): void => {
      out[v++] = x; out[v++] = y; out[v++] = z; out[v++] = u; out[v++] = w;
      out[v++] = c[0]; out[v++] = c[1]; out[v++] = c[2]; out[v++] = c[3];
    };
    for (let k = 0; k < this.live; k++) {
      const { top, bottom, age } = this.edge(k), u = age / this.emitter.edgeLifetime;
      put(top[0], top[1], top[2], u, 0);
      put(bottom[0], bottom[1], bottom[2], u, 1);
    }
    if (vertices > 0) {
      put(this.head[0]!, this.head[1]!, this.head[2]!, 0, 0);
      put(this.head[3]!, this.head[4]!, this.head[5]!, 0, 1);
    }
    return vertices;
  }
}

/** Indices of the quads between `edges` consecutive edges (2 vertices each): 6 per quad. */
export function ribbonStripIndices(edges: number): Uint16Array {
  if (!Number.isInteger(edges) || edges < 2 || edges > MAX_RIBBON_EDGES) throw new Error(`ribbon: edge count must be 2..${MAX_RIBBON_EDGES} (got ${edges})`);
  const out = new Uint16Array((edges - 1) * 6);
  for (let k = 0; k < edges - 1; k++) {
    const t0 = k * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
    out.set([t0, b0, b1, t0, b1, t1], k * 6);
  }
  return out;
}
