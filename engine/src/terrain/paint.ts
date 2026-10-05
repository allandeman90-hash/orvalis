import type { TerrainConfig } from './config';

/**
 * Terrain texturing data (spec §7): a chunk blends up to 4 texture layers.
 * Layer 0 is the base; layers 1..3 are laid over it, each with its own alpha
 * map. The alpha maps of a chunk are packed, with the baked shadow, in ONE
 * small RGBA texture per chunk (spec §7.4):
 *     R = baked shadow   G = alpha of layer 1   B = alpha of layer 2   A = alpha of layer 3
 * blended in this order:  mix(mix(mix(layer0, layer1, G), layer2, B), layer3, A).
 *
 * Mask resolution: 64 × 64 (spec §7.2).
 *
 * OUR CHOICES (the reference document does not settle them):
 * - Texel (i, j) of a chunk's mask sits at the world position
 *   chunkOrigin + (i / 63, j / 63) · chunkSize: the first and last texels lie ON
 *   the chunk border, so two adjacent chunks hold the same value there and the
 *   blend has no seam (the document only mentions a « duplicated edge » path).
 * - 8 bits per channel here; the 4-bit storage of the original is a file-format
 *   matter, not a rendering one.
 * - The shadow channel holds 255 = fully lit … 0 = fully in shadow (P1.10). The original stores 1 bit per
 *   sample (spec §7.3); 8 bits here allow soft edges and cost nothing more in an RGBA mask.
 */
export const MASK_SIZE = 64;
export const MAX_TERRAIN_LAYERS = 4;
/** R value meaning « no baked shadow ». */
export const MASK_LIT = 255;

/** Alphas (0..1) of layers 1, 2 and 3 at a world position. Must be deterministic. */
export type LayerAlphaFunction = (worldX: number, worldY: number, height: number) => readonly [number, number, number];

export interface TerrainPaint {
  /** Texture index (into the renderer's palette) of each of the 4 layers. */
  readonly layers: readonly [number, number, number, number];
  readonly alphaAt: LayerAlphaFunction;
  /**
   * false = alphaAt ignores its `height` argument, so the mask builder does not
   * compute the ground height for each of its 4096 texels (it passes 0).
   * Default true.
   */
  readonly usesHeight?: boolean;
  /**
   * Baked shadow at a world position: 0 = fully lit, 1 = fully in shadow.
   * Absent = no baked shadow. (Computing real shadows from the relief and the
   * sun is a job for the world builder; fixtures only provide test patterns.)
   */
  readonly shadowAt?: (worldX: number, worldY: number) => number;
}

export interface ChunkMaterial {
  readonly layers: readonly [number, number, number, number];
  /** MASK_SIZE × MASK_SIZE × 4 bytes, row j = world y growing. */
  readonly mask: Uint8Array;
}

const toByte = (alpha: number): number => Math.round(Math.min(1, Math.max(0, alpha)) * 255);

/**
 * Mask of one chunk. `worldAt(t)` gives the world coordinate at fraction t
 * (0..1) of the chunk along an axis; it is passed in so that the caller can use
 * the same exact expression as for the vertices.
 */
export function buildChunkMask(paint: TerrainPaint, xAt: (t: number) => number, yAt: (t: number) => number, heightAt: (x: number, y: number) => number): Uint8Array {
  const mask = new Uint8Array(MASK_SIZE * MASK_SIZE * 4);
  const last = MASK_SIZE - 1;
  const needsHeight = paint.usesHeight ?? true;
  // The x of a column is the same on every row: computed once.
  const xs = Array.from({ length: MASK_SIZE }, (_, i) => xAt(i / last));
  for (let j = 0; j < MASK_SIZE; j++) {
    const y = yAt(j / last);
    for (let i = 0; i < MASK_SIZE; i++) {
      const x = xs[i]!;
      const [a1, a2, a3] = paint.alphaAt(x, y, needsHeight ? heightAt(x, y) : 0);
      const at = (j * MASK_SIZE + i) * 4;
      mask[at] = paint.shadowAt ? MASK_LIT - toByte(paint.shadowAt(x, y)) : MASK_LIT;
      mask[at + 1] = toByte(a1);
      mask[at + 2] = toByte(a2);
      mask[at + 3] = toByte(a3);
    }
  }
  return mask;
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Synthetic paints for tests and debug scenes. Not world data. */
export type PaintKind = 'quadrants' | 'natural' | 'edge' | 'shadow';

/**
 * - quadrants: each tile is split in four: south-west = layer 0 only, south-east
 *   = layer 1, north-west = layer 2, north-east = layer 3, with a blend one
 *   chunk wide between them. Made for exact pixel checks.
 * - natural: irregular patches of layers 1 and 2 and a winding band of layer 3,
 *   with wave lengths that are not multiples of the chunk size.
 * - edge: layer 1 appears along a straight north-south line placed a quarter of a chunk east of each tile's
 *   centre, over a ramp two mask texels wide. Made to check WHERE the mask is sampled (to a fraction of a texel).
 * - shadow: base layer only; the east half of each tile is in full baked shadow, the west half fully lit, with a
 *   ramp one chunk wide in the middle. A test pattern, not a shadow computed from the relief.
 */
export function paintFixture(config: TerrainConfig, kind: PaintKind): TerrainPaint {
  const s = config.chunkSize, T = config.tileSize;
  const layers = [0, 1, 2, 3] as const;
  if (kind === 'quadrants') {
    const local = (w: number): number => w - Math.floor(w / T) * T;
    return {
      layers,
      usesHeight: false,
      alphaAt: (x, y) => {
        const east = smoothstep(T / 2 - s / 2, T / 2 + s / 2, local(x)), north = smoothstep(T / 2 - s / 2, T / 2 + s / 2, local(y));
        return [east * (1 - north), (1 - east) * north, east * north];
      },
    };
  }
  if (kind === 'shadow') {
    const local = (w: number): number => w - Math.floor(w / T) * T;
    return { layers, usesHeight: false, alphaAt: () => [0, 0, 0], shadowAt: (x) => smoothstep(T / 2 - s / 2, T / 2 + s / 2, local(x)) };
  }
  if (kind === 'edge') {
    const texel = s / (MASK_SIZE - 1);
    return {
      layers,
      usesHeight: false,
      alphaAt: (x) => [Math.min(1, Math.max(0, (x - Math.floor(x / T) * T - (T / 2 + s / 4)) / (2 * texel) + 0.5)), 0, 0],
    };
  }
  return {
    layers,
    usesHeight: false,
    alphaAt: (x, y) => {
      const a = Math.sin(x / (1.7 * s)) * Math.cos(y / (2.3 * s)), b = Math.sin((x + y) / (3.1 * s)) * Math.sin((x - y) / (1.3 * s));
      const path = Math.abs(y - 2.2 * s * Math.sin(x / (2.9 * s)) - 6.5 * s - Math.floor(y / T) * T);
      return [smoothstep(0.1, 0.5, a), smoothstep(0.35, 0.6, b), 1 - smoothstep(0.1 * s, 0.22 * s, path)];
    },
  };
}
