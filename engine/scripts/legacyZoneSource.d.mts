export function legacyHeight(x: number, z: number): number;
export function legacyVertexMix(x: number, z: number): number[];
export function sampleLegacyZone(zone: {
  readonly id: string;
  readonly legacy: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  readonly channels: readonly string[];
}): {
  id: string;
  originX: number;
  originY: number;
  cellSize: number;
  cols: number;
  rows: number;
  diagonal: 'falling';
  heights: Float32Array;
  channels: string[];
  weights: Uint8Array;
};
