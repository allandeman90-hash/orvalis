import type { LiquidType } from '../terrain';
import type { LiquidMaterial } from './liquidMaterials';
import type { TextureImage } from './terrainTextures';

/**
 * Liquid texture animation (spec §23): 30 frames played in 1250 ms — 24 frames
 * per second — and repeated for ever:
 *     frame = floor(((timeMs mod 1250) / 1250) · 30)
 * The two numbers are from the spec. Everything about the PICTURES is ours
 * (original, generated textures — no Blizzard asset).
 */
export const LIQUID_ANIMATION_FRAMES = 30;
export const LIQUID_ANIMATION_PERIOD_MS = 1250;

/** Frame 0..29 shown at a time in milliseconds. Any finite time, negative included, wraps into the period. */
export function liquidFrameAt(timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new Error(`liquid animation: time must be finite (got ${timeMs})`);
  const inPeriod = timeMs - Math.floor(timeMs / LIQUID_ANIMATION_PERIOD_MS) * LIQUID_ANIMATION_PERIOD_MS;
  // inPeriod can round up to exactly 1250 for a tiny negative time: stay inside 0..29.
  return Math.min(LIQUID_ANIMATION_FRAMES - 1, Math.floor((inPeriod / LIQUID_ANIMATION_PERIOD_MS) * LIQUID_ANIMATION_FRAMES));
}

/** How the frames of the liquid classes are made. */
export type LiquidFrameStyle = 'procedural' | 'solid';

/**
 * Brightness of a SOLID frame relative to the class colour: 1 for frame 0, falling linearly to 0.71 for frame 29.
 * Made for exact pixel checks: a pixel tells which frame is shown.
 */
export const solidFrameFactor = (frame: number): number => 1 - 0.01 * frame;

const toByte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

/**
 * Three travelling waves per class. Each has an INTEGER number of crests across the texture (so it tiles) and
 * runs an INTEGER number of cycles over the 30 frames (so the animation loops without a jump).
 * [crests along u, crests along v, cycles per loop, weight]
 */
const WAVES: Readonly<Record<LiquidType, ReadonlyArray<readonly [number, number, number, number]>>> = {
  river: [[2, 1, 1, 0.5], [-1, 3, -1, 0.3], [3, -2, 2, 0.2]],
  ocean: [[1, 1, 1, 0.55], [-2, 1, -1, 0.3], [1, -3, 1, 0.15]],
  magma: [[1, 2, 1, 0.5], [2, -1, -1, 0.35], [-3, -2, 1, 0.15]],
  slime: [[1, 1, -1, 0.6], [2, -2, 1, 0.25], [-1, 3, 1, 0.15]],
};

/**
 * The 30 frames of one liquid class.
 * - procedural: the class colour modulated by travelling waves, between 78 % and 122 % of it;
 * - solid: one flat colour per frame, the class colour × solidFrameFactor(frame).
 */
export function liquidFrames(type: LiquidType, material: LiquidMaterial, style: LiquidFrameStyle, size = 64): TextureImage[] {
  const frames: TextureImage[] = [];
  for (let frame = 0; frame < LIQUID_ANIMATION_FRAMES; frame++) {
    const data = new Uint8Array(size * size * 4);
    const phase = frame / LIQUID_ANIMATION_FRAMES;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let factor: number;
        if (style === 'solid') factor = solidFrameFactor(frame);
        else {
          const u = (x + 0.5) / size, v = (y + 0.5) / size;
          let wave = 0;
          for (const [a, b, cycles, weight] of WAVES[type]) wave += weight * Math.sin(2 * Math.PI * (a * u + b * v + cycles * phase));
          factor = 1 + 0.22 * wave; // weights sum to 1 → 0.78..1.22
        }
        const at = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) data[at + c] = toByte(material.color[c]! * factor);
        data[at + 3] = 255;
      }
    }
    frames.push({ name: `${type}-${frame}`, width: size, height: size, data });
  }
  return frames;
}
