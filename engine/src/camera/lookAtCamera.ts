import { type DepthRange, mat4, type Mat4, type Vec3, vec3 } from '../math';

/**
 * Minimal perspective camera for test scenes: an eye, a target, an up vector.
 * This is only a tool to look at geometry; the real gameplay camera (spec
 * §186–§198) comes in phase 7.
 *
 * Engine coordinate system: right-handed, Z up, ground plane X/Y.
 */
export interface LookAtCamera {
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Must not be parallel to (target − eye). Use +Z, or +Y when looking straight down. */
  readonly up: Vec3;
  /** Vertical field of view, radians. */
  readonly fovY: number;
  readonly near: number;
  readonly far: number;
}

/** Engine "up" axis. */
export const WORLD_UP: Vec3 = vec3.create(0, 0, 1);

const view = mat4.create();
const projection = mat4.create();

/**
 * Writes projection × view into `out`.
 * @param aspect width / height of the drawing surface
 * @param depthRange clip-space depth convention of the backend in use (backend.info.depthRange)
 */
export function viewProjectionMatrix(out: Mat4, camera: LookAtCamera, aspect: number, depthRange: DepthRange): Mat4 {
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error(`camera: invalid aspect ratio ${aspect}`);
  if (!(camera.near > 0) || !(camera.far > camera.near)) throw new Error(`camera: invalid near/far ${camera.near}/${camera.far}`);
  mat4.lookAt(view, camera.eye, camera.target, camera.up);
  mat4.perspective(projection, camera.fovY, aspect, camera.near, camera.far, depthRange);
  return mat4.multiply(out, projection, view);
}
