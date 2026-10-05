/**
 * Terrain lighting (spec §8): old-style, evaluated PER VERTEX and interpolated
 * over the triangles — no per-pixel lighting, no PBR.
 *     light = ambient + diffuse · max(dot(normal, toLight), 0)
 *     colour = texture colour · light · shadow
 * `shadow` comes from the baked-shadow channel of the chunk's mask (R):
 * 255 = lit → × 1, 0 = shadowed → × shadowFactor, linear in between.
 *
 * The NUMBERS below are ours: the reference document gives the formula, not
 * the colours (those will come from the day/night keyframes, Phase 2) nor how
 * dark a baked shadow is. They are plain configuration.
 */
export interface TerrainLighting {
  /** Direction FROM the ground TOWARDS the light. Need not be unit length. */
  readonly toLight: readonly [number, number, number];
  readonly ambient: readonly [number, number, number];
  readonly diffuse: readonly [number, number, number];
  /** Brightness left where the baked shadow is full (0 = black, 1 = shadows have no effect). */
  readonly shadowFactor: number;
}

/**
 * A sun in the south-west, fairly high: compass azimuth 225°, elevation 60° — exactly the lighting sun at noon
 * (environment/sun.ts), so that a scene without day/night cycle looks like noon.
 */
export const DEFAULT_TERRAIN_LIGHTING: TerrainLighting = {
  toLight: [-0.5 * Math.SQRT1_2, -0.5 * Math.SQRT1_2, Math.sqrt(3) / 2],
  ambient: [0.36, 0.39, 0.46],
  diffuse: [0.84, 0.8, 0.7],
  shadowFactor: 0.55,
};

/** What « lighting off » means: every texel is shown as it is. */
export const UNLIT_TERRAIN_LIGHTING: TerrainLighting = { toLight: [0, 0, 1], ambient: [1, 1, 1], diffuse: [0, 0, 0], shadowFactor: 1 };

export function validateTerrainLighting(lighting: TerrainLighting): void {
  const all = [...lighting.toLight, ...lighting.ambient, ...lighting.diffuse, lighting.shadowFactor];
  if (!all.every(Number.isFinite)) throw new Error('terrain lighting: every value must be finite');
  if (Math.hypot(...lighting.toLight) === 0) throw new Error('terrain lighting: toLight must not be the zero vector');
  if (lighting.shadowFactor < 0 || lighting.shadowFactor > 1) throw new Error(`terrain lighting: shadowFactor must be in 0..1 (got ${lighting.shadowFactor})`);
}

/** The 12 floats the shader receives: unit toLight + shadowFactor, ambient, diffuse (each padded to a vec4). */
export function lightingUniforms(lighting: TerrainLighting, out = new Float32Array(12)): Float32Array {
  validateTerrainLighting(lighting);
  const length = Math.hypot(...lighting.toLight);
  out.set([lighting.toLight[0] / length, lighting.toLight[1] / length, lighting.toLight[2] / length, lighting.shadowFactor], 0);
  out.set([...lighting.ambient, 0], 4);
  out.set([...lighting.diffuse, 0], 8);
  return out;
}

/**
 * The same formula as the shader, on the CPU: light received by a vertex with
 * unit normal `normal`, and by a texel whose baked-shadow value is `lit` (0..1,
 * 1 = no shadow). Used by tests to predict pixels.
 */
export function terrainLight(lighting: TerrainLighting, normal: readonly [number, number, number], lit = 1): [number, number, number] {
  const length = Math.hypot(...lighting.toLight);
  const nDotL = Math.max(0, (normal[0] * lighting.toLight[0] + normal[1] * lighting.toLight[1] + normal[2] * lighting.toLight[2]) / length);
  const shadow = lighting.shadowFactor + (1 - lighting.shadowFactor) * lit;
  return [0, 1, 2].map((k) => (lighting.ambient[k]! + lighting.diffuse[k]! * nDotL) * shadow) as [number, number, number];
}

/**
 * Linear distance fog (spec §13):
 *     fogFactor = clamp((distance − start) / (end − start), 0, 1)
 *     colour    = mix(colour, fogColour, fogFactor)
 * « fogColour ≈ horizon colour »: the scene is cleared with the fog colour, so
 * that distant terrain fades into the background instead of being cut off.
 *
 * OUR CHOICES: `distance` is the straight-line distance from the camera to the
 * vertex (computed per vertex, interpolated; the factor is evaluated per pixel);
 * the colour and the two distances are configuration — the reference document
 * derives them from day/night values that do not exist yet (Phase 2).
 */
export interface TerrainFog {
  readonly color: readonly [number, number, number];
  /** Distance at which the fog begins, world units. */
  readonly start: number;
  /** Distance from which everything has the fog colour. Must be > start. */
  readonly end: number;
}

/** A pale day-time horizon. */
export const DEFAULT_FOG_COLOR: readonly [number, number, number] = [0.62, 0.72, 0.82];

export function validateTerrainFog(fog: TerrainFog): void {
  if (![...fog.color, fog.start, fog.end].every(Number.isFinite)) throw new Error('terrain fog: every value must be finite');
  if (fog.start < 0 || !(fog.end > fog.start)) throw new Error(`terrain fog: need 0 ≤ start < end (got ${fog.start}, ${fog.end})`);
}

/** The shader's fog factor, on the CPU (used by tests to predict pixels). */
export function fogFactor(fog: TerrainFog, distance: number): number {
  return Math.min(1, Math.max(0, (distance - fog.start) / (fog.end - fog.start)));
}
