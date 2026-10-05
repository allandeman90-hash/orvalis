// Les espaces ont une identité et des limites propres. Les anciennes coordonnées
// de sauvegarde sont converties une seule fois, indépendamment des donjons actifs.
export const WORLD_VERSION = 2;
export const WORLD_SCALE = 4;
export const WORLD_HALF = 2048;
export const CONTINENT = 'orvalis';
export const INSTANCE = 'instance';
export const INSTANCE_ORIGIN = 6000;
export function worldAtPoint(x, z = 0) {
  return Math.abs(x - INSTANCE_ORIGIN) <= 300 && Math.abs(z) <= 300 ? INSTANCE : CONTINENT;
}
export const isInstancePoint = (x, z = 0) => worldAtPoint(x, z) === INSTANCE;
export const validWorldPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < WORLD_HALF - 14 && Math.abs(p.z) < WORLD_HALF - 14;
export function migratePosition(data) {
  if ((data.worldVersion || 1) < WORLD_VERSION && data.pos) {
    const p = data.pos;
    data.pos = Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < 500 && Math.abs(p.z) < 500
      ? { x: p.x * WORLD_SCALE, z: p.z * WORLD_SCALE } : null;
  }
  if (!validWorldPoint(data.pos)) data.pos = null;
  data.worldVersion = WORLD_VERSION;
  data.worldId = CONTINENT;
}
