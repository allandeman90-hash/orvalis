import { CELLS_PER_TILE, type TerrainConfig } from './config';
import type { TileCoord } from './coords';
import type { TerrainPaint } from './paint';
import type { WorldHeightFunction } from './tile';

/**
 * A « grid zone »: a rectangle of ground given as a regular grid of heights,
 * plus a few 8-bit weight channels at the same nodes (what the ground is made
 * of). It is the simplest possible terrain SOURCE: tiles are built from it
 * through the same height-function path as the synthetic fixtures.
 *
 * It exists for technical test zones (M1.1). It is NOT the tile file format
 * of the final world and says nothing about its geography.
 *
 * Everything here is OUR CHOICE (the reference document has no such format).
 *
 * Node (i, j), i in 0..cols and j in 0..rows, sits at
 *     (originX + i · cellSize, originY + j · cellSize)      — engine axes, ground = X/Y
 * and is stored at index j · (cols + 1) + i.
 *
 * Between nodes a cell is two flat triangles, split along one diagonal:
 *   'rising'  : from (x0, y0) to (x1, y1)
 *   'falling' : from (x0, y1) to (x1, y0)
 * The centre of a cell therefore lies ON that diagonal. The engine's chunk
 * mesh puts a vertex at every cell centre and fans 4 triangles around it:
 * with the centre on the diagonal, those 4 triangles are coplanar two by two
 * with the zone's 2 triangles — the rendered surface is exactly the source
 * surface when the zone's cellSize equals the terrain's.
 *
 * Outside the rectangle, coordinates are clamped to its border.
 */
export type GridDiagonal = 'rising' | 'falling';

export interface GridZone {
  readonly id: string;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly diagonal: GridDiagonal;
  /** (cols + 1) · (rows + 1) heights. */
  readonly heights: Float32Array;
  /** Names of the weight channels, in storage order. */
  readonly channels: readonly string[];
  /** (cols + 1) · (rows + 1) · channels.length bytes, node after node; 0 = none, 255 = full. */
  readonly weights: Uint8Array;
}

export const GRID_ZONE_MAGIC = 'OVZ1';
const MAX_SIDE = 4096;

function fail(message: string): never {
  throw new Error(`grid zone: ${message}`);
}

/** Checks every field; a zone that passes can be sampled without further checks. */
export function validateGridZone(zone: GridZone): void {
  if (typeof zone.id !== 'string' || zone.id.length === 0) fail('id must be a non-empty string');
  for (const [value, name] of [[zone.originX, 'originX'], [zone.originY, 'originY']] as const) {
    if (!Number.isFinite(value)) fail(`${name} must be finite (got ${value})`);
  }
  if (!(zone.cellSize > 0) || !Number.isFinite(zone.cellSize)) fail(`cellSize must be a finite number > 0 (got ${zone.cellSize})`);
  for (const [value, name] of [[zone.cols, 'cols'], [zone.rows, 'rows']] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_SIDE) fail(`${name} must be an integer in 1..${MAX_SIDE} (got ${value})`);
  }
  if (zone.diagonal !== 'rising' && zone.diagonal !== 'falling') fail(`diagonal must be 'rising' or 'falling' (got ${String(zone.diagonal)})`);
  const nodes = (zone.cols + 1) * (zone.rows + 1);
  if (zone.heights.length !== nodes) fail(`expected ${nodes} heights, got ${zone.heights.length}`);
  if (!Array.isArray(zone.channels) || zone.channels.length > 16 || zone.channels.some((c) => typeof c !== 'string' || c.length === 0)) fail('channels must be at most 16 non-empty names');
  if (new Set(zone.channels).size !== zone.channels.length) fail('channel names must be unique');
  if (zone.weights.length !== nodes * zone.channels.length) fail(`expected ${nodes * zone.channels.length} weight bytes, got ${zone.weights.length}`);
  for (let k = 0; k < nodes; k++) if (!Number.isFinite(zone.heights[k]!)) fail(`height ${k} is not finite`);
}

/**
 * File layout (little-endian):
 *   4 bytes   'OVZ1'
 *   u32       N = byte length of the header text
 *   N bytes   header, JSON in UTF-8: { id, originX, originY, cellSize, cols, rows, diagonal, channels }
 *   0..3      zero padding up to a multiple of 4
 *   f32 × nodes                 heights
 *   u8  × nodes × channels      weights
 */
export function encodeGridZone(zone: GridZone): Uint8Array {
  validateGridZone(zone);
  const header = new TextEncoder().encode(
    JSON.stringify({ id: zone.id, originX: zone.originX, originY: zone.originY, cellSize: zone.cellSize, cols: zone.cols, rows: zone.rows, diagonal: zone.diagonal, channels: zone.channels }),
  );
  const heightsAt = 8 + Math.ceil(header.length / 4) * 4;
  const out = new Uint8Array(heightsAt + zone.heights.length * 4 + zone.weights.length);
  const view = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = GRID_ZONE_MAGIC.charCodeAt(k);
  view.setUint32(4, header.length, true);
  out.set(header, 8);
  for (let k = 0; k < zone.heights.length; k++) view.setFloat32(heightsAt + k * 4, zone.heights[k]!, true);
  out.set(zone.weights, heightsAt + zone.heights.length * 4);
  return out;
}

/** Reads a file written by encodeGridZone(). Anything unexpected is an error: no silent repair. */
export function decodeGridZone(bytes: ArrayBuffer | Uint8Array): GridZone {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 8) fail('file too short');
  for (let k = 0; k < 4; k++) if (data[k] !== GRID_ZONE_MAGIC.charCodeAt(k)) fail(`not a grid zone file (magic ${GRID_ZONE_MAGIC} expected)`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(4, true);
  const heightsAt = 8 + Math.ceil(headerLength / 4) * 4;
  if (headerLength === 0 || heightsAt > data.length) fail('header length out of range');
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(8, 8 + headerLength))) as Record<string, unknown>;
  } catch {
    fail('header is not valid JSON');
  }
  if (typeof header !== 'object' || header === null) fail('header is not an object');
  const cols = header.cols, rows = header.rows, channels = header.channels;
  if (typeof cols !== 'number' || typeof rows !== 'number' || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > MAX_SIDE || rows > MAX_SIDE) fail('cols / rows missing or out of range');
  if (!Array.isArray(channels)) fail('channels missing');
  const nodes = (cols + 1) * (rows + 1);
  const expected = heightsAt + nodes * 4 + nodes * channels.length;
  if (data.length !== expected) fail(`file is ${data.length} bytes, ${expected} expected`);
  const heights = new Float32Array(nodes);
  for (let k = 0; k < nodes; k++) heights[k] = view.getFloat32(heightsAt + k * 4, true);
  const zone: GridZone = {
    id: header.id as string,
    originX: header.originX as number,
    originY: header.originY as number,
    cellSize: header.cellSize as number,
    cols,
    rows,
    diagonal: header.diagonal as GridDiagonal,
    heights,
    channels: channels as string[],
    weights: data.slice(heightsAt + nodes * 4),
  };
  validateGridZone(zone);
  return zone;
}

export interface GridZoneSampler {
  readonly heightAt: WorldHeightFunction;
  /** Weight 0..1 of channel `channel` (index into zone.channels) at a world position. */
  weightAt(channel: number, x: number, y: number): number;
}

/** Height and weights anywhere, by the zone's own two-triangles-per-cell rule. */
export function gridZoneSampler(zone: GridZone): GridZoneSampler {
  validateGridZone(zone);
  const { originX, originY, cellSize, cols, rows, heights, weights } = zone;
  const side = cols + 1, channels = zone.channels.length, rising = zone.diagonal === 'rising';
  // Cell and position inside it, shared by the last lookup (kept in closure variables: no allocation per sample).
  let at = 0, u = 0, v = 0;
  const locate = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`position must be finite (got ${x}, ${y})`);
    const fx = Math.min(cols, Math.max(0, (x - originX) / cellSize)), fy = Math.min(rows, Math.max(0, (y - originY) / cellSize));
    const i = Math.min(cols - 1, Math.floor(fx)), j = Math.min(rows - 1, Math.floor(fy));
    at = j * side + i;
    u = fx - i;
    v = fy - j;
  };
  const blend = (h00: number, h10: number, h01: number, h11: number): number => {
    if (rising) return u > v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  return {
    heightAt(x, y) {
      locate(x, y);
      return blend(heights[at]!, heights[at + 1]!, heights[at + side]!, heights[at + side + 1]!);
    },
    weightAt(channel, x, y) {
      if (!Number.isInteger(channel) || channel < 0 || channel >= channels) fail(`channel must be an integer in 0..${channels - 1} (got ${channel})`);
      locate(x, y);
      return blend(weights[at * channels + channel]!, weights[(at + 1) * channels + channel]!, weights[(at + side) * channels + channel]!, weights[(at + side + 1) * channels + channel]!) / 255;
    },
  };
}

/**
 * The tiles a zone fills, in row order (y, then x). The zone must cover whole
 * tiles of `config` exactly — same cell size, borders on tile borders — so that
 * no tile is half defined.
 */
export function gridZoneTiles(config: TerrainConfig, zone: GridZone): TileCoord[] {
  if (zone.cellSize !== config.cellSize) fail(`cellSize ${zone.cellSize} differs from the terrain's ${config.cellSize}`);
  if (zone.cols % CELLS_PER_TILE !== 0 || zone.rows % CELLS_PER_TILE !== 0) fail(`${zone.cols} × ${zone.rows} cells is not a whole number of tiles (${CELLS_PER_TILE} cells each)`);
  const tx = zone.originX / config.tileSize, ty = zone.originY / config.tileSize;
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) fail(`origin ${zone.originX}, ${zone.originY} is not on a tile corner`);
  const tiles: TileCoord[] = [];
  for (let y = 0; y < zone.rows / CELLS_PER_TILE; y++) for (let x = 0; x < zone.cols / CELLS_PER_TILE; x++) tiles.push({ x: tx + x + 0, y: ty + y + 0 });
  return tiles;
}

/**
 * Turns weight channels into the alphas of texture layers 1..3.
 * `layers` = palette texture of each of the 4 layers; `sources[k]` = names of
 * the channels feeding layer k + 1 (their maximum is used; none = always 0).
 */
export function gridZonePaint(zone: GridZone, layers: readonly [number, number, number, number], sources: readonly [readonly string[], readonly string[], readonly string[]]): TerrainPaint {
  const sampler = gridZoneSampler(zone);
  const indices = sources.map((names) =>
    names.map((name) => {
      const index = zone.channels.indexOf(name);
      if (index < 0) fail(`zone "${zone.id}" has no channel "${name}" (it has: ${zone.channels.join(', ')})`);
      return index;
    }),
  );
  const alpha = (k: number, x: number, y: number): number => {
    let a = 0;
    for (const channel of indices[k]!) a = Math.max(a, sampler.weightAt(channel, x, y));
    return a;
  };
  return { layers, usesHeight: false, alphaAt: (x, y) => [alpha(0, x, y), alpha(1, x, y), alpha(2, x, y)] };
}
