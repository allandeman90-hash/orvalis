import type { LookAtCamera } from '../camera';
import { type BufferHandle, type PipelineHandle, type RendererBackend, SKY_LAYOUT, SKY_SHADER, SKY_TRIANGLE, SKY_UNIFORM_BYTES, SKY_UNIFORM_FLOATS } from '../renderer';

/**
 * Sky (spec §12): a gradient from the horizon colour to the zenith colour, plus
 * the disc of the VISIBLE sun (spec §11). « The horizon color is closely
 * integrated with fog »: the horizon colour given here is the fog colour, so
 * far terrain → fog → horizon → sky is one continuous fade.
 *
 * OUR CHOICES (the document describes the idea, not the numbers): the shape of
 * the gradient (1 − (1 − elevation)³), the size of the disc and of its halo.
 */
export type Rgb = readonly [number, number, number];

export interface SkyState {
  /** Colour at and below the horizon — the fog colour. */
  readonly horizon: Rgb;
  /** Colour straight up. */
  readonly zenith: Rgb;
  /** Unit direction towards the visible sun (z < 0 = below the horizon: no disc). */
  readonly sunDirection: Rgb;
  readonly sunColor: Rgb;
}

export interface SkySunShape {
  /** Angular radius of the disc, degrees. Much larger than the real sun (0.27°): a stylised disc. */
  readonly radiusDegrees: number;
  /** Width of the soft rim, degrees (half inside, half outside the radius). Must be > 0 and < 2 × radius. */
  readonly edgeDegrees: number;
  /** Strength of the halo around the disc (0 = none). */
  readonly glow: number;
}

export const DEFAULT_SKY_SUN: SkySunShape = { radiusDegrees: 2.5, edgeDegrees: 0.4, glow: 0.35 };

const RAD = Math.PI / 180;

export function validateSkyState(state: SkyState): void {
  const all = [...state.horizon, ...state.zenith, ...state.sunDirection, ...state.sunColor];
  if (!all.every(Number.isFinite)) throw new Error('sky: every value must be finite');
  if (Math.abs(Math.hypot(...state.sunDirection) - 1) > 1e-3) throw new Error('sky: sunDirection must be a unit vector');
}

export function validateSkySun(shape: SkySunShape): void {
  if (!(shape.radiusDegrees > 0 && shape.radiusDegrees < 45)) throw new Error(`sky: sun radius must be in 0..45 degrees, both excluded (got ${shape.radiusDegrees})`);
  if (!(shape.edgeDegrees > 0 && shape.edgeDegrees < 2 * shape.radiusDegrees)) throw new Error(`sky: sun edge must be > 0 and < 2 × radius (got ${shape.edgeDegrees})`);
  if (!(shape.glow >= 0) || !Number.isFinite(shape.glow)) throw new Error(`sky: glow must be a finite number ≥ 0 (got ${shape.glow})`);
}

/** cos of the outer rim and 1 / (cosInner − cosOuter), as the shader wants them. */
function sunEdge(shape: SkySunShape): { cosOuter: number; invEdge: number } {
  const cosOuter = Math.cos((shape.radiusDegrees + shape.edgeDegrees / 2) * RAD), cosInner = Math.cos((shape.radiusDegrees - shape.edgeDegrees / 2) * RAD);
  return { cosOuter, invEdge: 1 / (cosInner - cosOuter) };
}

/**
 * The three vectors from which the shader rebuilds a pixel's view direction:
 *     direction = normalize(forward + ndc.x · right + ndc.y · up)
 * with ndc in −1..1 (x to the right, y upwards). Same construction as mat4.lookAt + perspective, so the sky
 * lines up exactly with what the camera's view-projection matrix draws. Written into out[0..11] (3 × vec4).
 */
export function cameraRayBasis(camera: LookAtCamera, aspect: number, out: Float32Array = new Float32Array(12)): Float32Array {
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error(`sky: invalid aspect ratio ${aspect}`);
  const { eye, target, up } = camera;
  let fx = target[0]! - eye[0]!, fy = target[1]! - eye[1]!, fz = target[2]! - eye[2]!;
  let length = Math.hypot(fx, fy, fz);
  if (length === 0) throw new Error('sky: camera eye and target are the same point');
  fx /= length; fy /= length; fz /= length;
  // right = forward × up
  let rx = fy * up[2]! - fz * up[1]!, ry = fz * up[0]! - fx * up[2]!, rz = fx * up[1]! - fy * up[0]!;
  length = Math.hypot(rx, ry, rz);
  if (length === 0) throw new Error('sky: camera up is parallel to its view direction');
  rx /= length; ry /= length; rz /= length;
  // true up = right × forward
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const tanY = Math.tan(camera.fovY / 2), tanX = tanY * aspect;
  out.set([rx * tanX, ry * tanX, rz * tanX, 0, ux * tanY, uy * tanY, uz * tanY, 0, fx, fy, fz, 0]);
  return out;
}

/** View direction (unit) of the pixel at ndc (x, y), from a basis made by cameraRayBasis(). */
export function rayDirection(basis: ArrayLike<number>, ndcX: number, ndcY: number): [number, number, number] {
  const x = basis[8]! + ndcX * basis[0]! + ndcY * basis[4]!, y = basis[9]! + ndcX * basis[1]! + ndcY * basis[5]!, z = basis[10]! + ndcX * basis[2]! + ndcY * basis[6]!;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The shader's formula on the CPU: colour (0..1, clamped as the framebuffer does) seen in a unit direction. */
export function skyColourAt(state: SkyState, direction: Rgb, shape: SkySunShape = DEFAULT_SKY_SUN): [number, number, number] {
  const { cosOuter, invEdge } = sunEdge(shape);
  const e = direction[2];
  const k = 1 - clamp01(e), gradient = 1 - k * k * k;
  const d = Math.max(0, direction[0] * state.sunDirection[0] + direction[1] * state.sunDirection[1] + direction[2] * state.sunDirection[2]);
  const above = clamp01(40 * e + 0.5);
  const halo = d ** 64 * shape.glow * above;
  const disc = clamp01((d - cosOuter) * invEdge) * above;
  return [0, 1, 2].map((c) => {
    const sky = state.horizon[c]! + (state.zenith[c]! - state.horizon[c]!) * gradient + state.sunColor[c]! * halo;
    return clamp01(sky + (state.sunColor[c]! - sky) * disc);
  }) as [number, number, number];
}

/** Draws the sky. One pipeline, one tiny vertex buffer, one draw per frame; no depth test, no depth write. */
export class SkyRenderer {
  private readonly pipeline: PipelineHandle;
  private readonly vertexBuffer: BufferHandle;
  private readonly uniforms = new Float32Array(SKY_UNIFORM_FLOATS);
  private readonly shape: SkySunShape;

  constructor(private readonly backend: RendererBackend, shape: SkySunShape = DEFAULT_SKY_SUN) {
    validateSkySun(shape);
    this.shape = shape;
    this.pipeline = backend.createPipeline({ shader: SKY_SHADER, vertexLayout: SKY_LAYOUT, uniformBytes: SKY_UNIFORM_BYTES, depthTest: false, depthWrite: false, cullMode: 'none', label: 'sky' });
    this.vertexBuffer = backend.createBuffer({ usage: 'vertex', data: SKY_TRIANGLE, label: 'sky-triangle' });
  }

  /** Must be called between beginFrame() and endFrame(), BEFORE everything else: the sky is the background. */
  draw(camera: LookAtCamera, aspect: number, state: SkyState): void {
    validateSkyState(state);
    const u = this.uniforms, { cosOuter, invEdge } = sunEdge(this.shape);
    cameraRayBasis(camera, aspect, u);
    u.set([...state.zenith, 0, ...state.horizon, 0, ...state.sunDirection, cosOuter, ...state.sunColor, this.shape.glow, invEdge, 0, 0, 0], 12);
    this.backend.draw({ pipeline: this.pipeline, vertexBuffer: this.vertexBuffer, vertexCount: 3, uniforms: u });
  }

  dispose(): void {
    this.backend.destroyBuffer(this.vertexBuffer);
    this.backend.destroyPipeline(this.pipeline);
  }
}
