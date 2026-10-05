/**
 * Terrain layer textures made by code. ORIGINAL content: nothing here comes
 * from any game. They are placeholders until real Orvalis textures exist.
 *
 * Every texture is square, power-of-two and tiles seamlessly (the noise is
 * periodic). Generation is deterministic.
 */
export interface TextureImage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits per channel. */
  readonly data: Uint8Array;
}

export type Rgb = readonly [number, number, number];

/** A texture of one flat colour. Used by tests that need exact pixel values. */
export function solidTexture(name: string, colour: Rgb, size = 4): TextureImage {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([colour[0], colour[1], colour[2], 255], i * 4);
  return { name, width: size, height: size, data };
}

/** Exact colours of the solid palette, in layer order. */
export const SOLID_PALETTE_COLOURS: readonly Rgb[] = [
  [40, 160, 60],
  [150, 100, 50],
  [128, 128, 136],
  [220, 200, 140],
];

export function solidPalette(): TextureImage[] {
  return SOLID_PALETTE_COLOURS.map((colour, i) => solidTexture(`solid-${i}`, colour));
}

/** Deterministic hash of a lattice point → 0..1. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise with `cells` lattice cells across the texture, periodic so the texture tiles. */
function periodicNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells, y = v * cells;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (ix: number, iy: number): number => hash(((ix % cells) + cells) % cells, ((iy % cells) + cells) % cells, seed);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** A few octaves of periodic noise, 0..1. */
function fractal(u: number, v: number, cells: number, seed: number): number {
  let sum = 0, weight = 0, amplitude = 1;
  for (let octave = 0; octave < 4; octave++) {
    sum += amplitude * periodicNoise(u, v, cells << octave, seed + octave * 17);
    weight += amplitude;
    amplitude *= 0.5;
  }
  return sum / weight;
}

function noiseTexture(name: string, size: number, seed: number, cells: number, dark: Rgb, light: Rgb, contrast = 1): TextureImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.min(1, Math.max(0, (fractal((x + 0.5) / size, (y + 0.5) / size, cells, seed) - 0.5) * contrast + 0.5));
      const at = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[at + c] = Math.round(dark[c]! + (light[c]! - dark[c]!) * n);
      data[at + 3] = 255;
    }
  }
  return { name, width: size, height: size, data };
}

/** Grass, dirt, rock, sandy path — in layer order. */
export function proceduralPalette(size = 128): TextureImage[] {
  return [
    noiseTexture('grass', size, 11, 8, [38, 92, 34], [96, 160, 62], 1.6),
    noiseTexture('dirt', size, 23, 6, [84, 58, 34], [150, 112, 70], 1.5),
    noiseTexture('rock', size, 37, 5, [78, 78, 84], [168, 166, 160], 2.2),
    noiseTexture('path', size, 53, 10, [168, 146, 100], [226, 208, 158], 1.3),
  ];
}

/** Average colour of a texture (what it looks like from far away). */
export function meanColour(image: TextureImage): Rgb {
  const sum = [0, 0, 0];
  const n = image.width * image.height;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sum[c]! += image.data[i * 4 + c]!;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}
