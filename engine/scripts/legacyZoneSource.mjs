// Reads the OLD Orvalis terrain (../src/world/terrain.js, the Three.js prototype) under Node, without
// modifying it, and samples the M1.1 test zone from it. Used by exportTestZone.ts (writes the asset)
// and by the tests (check that the asset and the engine agree with the legacy functions).
import { getHeight, groundMix, H, initTerrainData, CELL, VN } from '../../src/world/terrain.js';
import { WORLD_HALF } from '../../src/data/world-space.js';

let ready = false;
function init() {
  if (!ready) initTerrainData(); // about 2 s: the whole 1025 × 1025 height grid of the old world
  ready = true;
}

/** Legacy ground height at legacy (x, z). */
export function legacyHeight(x, z) {
  init();
  return getHeight(x, z);
}

/** Legacy ground mix at a mesh vertex, computed exactly as the legacy mesh builder does (src/world/sectors.js). */
export function legacyVertexMix(x, z) {
  init();
  const h = getHeight(x, z), e = 4;
  const dx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e), dz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
  return groundMix(x, z, h, Math.hypot(dx, dz), []).slice(0, 5); // rock, dirt, sand, snow, cobble
}

/**
 * Samples the legacy rectangle [minX, maxX] × [minZ, maxZ] on the legacy vertex grid and returns it in ENGINE
 * axes (x, y = −z): row j of the result is engine y = −maxZ + j · cell, i.e. legacy z = maxZ − j · cell.
 * The legacy mesh splits a cell along (x0, z0)–(x1, z1); seen in (x, y = −z) that is the 'falling' diagonal.
 */
export function sampleLegacyZone({ id, legacy, channels }) {
  init();
  const { minX, maxX, minZ, maxZ } = legacy;
  for (const v of [minX, maxX, minZ, maxZ]) if (!Number.isInteger(v / CELL) || Math.abs(v) > WORLD_HALF) throw new Error(`legacy zone: ${v} is not on the legacy grid`);
  if (channels.length !== 5) throw new Error('legacy zone: the legacy mix has exactly 5 channels');
  const cols = (maxX - minX) / CELL, rows = (maxZ - minZ) / CELL;
  const heights = new Float32Array((cols + 1) * (rows + 1)), weights = new Uint8Array((cols + 1) * (rows + 1) * 5);
  for (let j = 0; j <= rows; j++) {
    const z = maxZ - j * CELL;
    for (let i = 0; i <= cols; i++) {
      const x = minX + i * CELL, node = j * (cols + 1) + i;
      heights[node] = H[((z + WORLD_HALF) / CELL) * VN + (x + WORLD_HALF) / CELL];
      const mix = legacyVertexMix(x, z);
      for (let c = 0; c < 5; c++) weights[node * 5 + c] = Math.round(Math.min(1, Math.max(0, mix[c])) * 255);
    }
  }
  return { id, originX: minX, originY: -maxZ, cellSize: CELL, cols, rows, diagonal: 'falling', heights, channels: [...channels], weights };
}
