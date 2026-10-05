import { isInstancePoint } from '../data/world-space.js';
// Collisions statiques (troncs, rochers, bâtiments) dans une grille spatiale.
const CS = 8;
let grid = new Map();
const worldGrid = grid;
const key = (gx, gz) => gx * 4096 + gz;
// obstacles temporaires (donjon en cours) : grille séparée, vidée à la sortie
const tempGrid = new Map();
let tempMode = false;
export function beginTemp() { tempMode = true; }
export function endTemp() { tempMode = false; }
export function clearTemp() { tempGrid.clear(); }
const gridFor = (x, z) => (isInstancePoint(x, z) ? tempGrid : worldGrid);

// cercle : {x,z,r} ; boîte : {x,z,hw,hd,rot}
// `top` (facultatif) : altitude du sommet de l'obstacle, utilisée pour l'occlusion de la caméra.
export function addCircle(x, z, r, top) {
  const c = { t: 0, x, z, r, top };
  insert(c, x - r, z - r, x + r, z + r);
  return c;
}
export function addBox(x, z, hw, hd, rot = 0, top) {
  const c = { t: 1, x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top };
  const R = Math.hypot(hw, hd);
  insert(c, x - R, z - R, x + R, z + R);
  return c;
}
function insert(c, x0, z0, x1, z1) {
  const g = tempMode ? tempGrid : worldGrid;
  const gx0 = Math.floor(x0 / CS), gx1 = Math.floor(x1 / CS), gz0 = Math.floor(z0 / CS), gz1 = Math.floor(z1 / CS);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const k = key(gx, gz);
    let l = g.get(k);
    if (!l) g.set(k, (l = []));
    l.push(c);
  }
}

// Repousse un cercle mobile (x,z,rayon) hors des obstacles. Retourne [x,z].
const out = [0, 0];
export function resolve(x, z, r) {
  out[0] = x; out[1] = z;
  const grid = gridFor(x, z);
  const gx = Math.floor(x / CS), gz = Math.floor(z / CS);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const l = grid.get(key(gx + dx, gz + dz));
    if (!l) continue;
    for (const c of l) {
      if (c.t === 0) {
        const ex = out[0] - c.x, ez = out[1] - c.z;
        const d2 = ex * ex + ez * ez, R = c.r + r;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 0.001;
          out[0] = c.x + (ex / d) * R;
          out[1] = c.z + (ez / d) * R;
        }
      } else {
        // boîte orientée : passage en repère local
        const lx0 = out[0] - c.x, lz0 = out[1] - c.z;
        const lx = lx0 * c.cos - lz0 * c.sin, lz = lx0 * c.sin + lz0 * c.cos;
        const px = Math.max(-c.hw, Math.min(c.hw, lx)), pz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ex = lx - px, ez = lz - pz;
        const d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          let nx, nz;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            nx = lx + (ex / d) * (r - d); nz = lz + (ez / d) * (r - d);
          } else {
            // centre à l'intérieur : sortie par le côté le plus proche
            const dxp = c.hw - lx, dxn = lx + c.hw, dzp = c.hd - lz, dzn = lz + c.hd;
            const m = Math.min(dxp, dxn, dzp, dzn);
            nx = lx; nz = lz;
            if (m === dxp) nx = c.hw + r; else if (m === dxn) nx = -c.hw - r; else if (m === dzp) nz = c.hd + r; else nz = -c.hd - r;
          }
          // retour au repère monde (rotation inverse)
          out[0] = c.x + nx * c.cos + nz * c.sin;
          out[1] = c.z - nx * c.sin + nz * c.cos;
        }
      }
    }
  }
  return out;
}

// Test de ligne de vue grossier (obstacles hauts seulement : bâtiments)
export function blocked(x, z, r = 0.3) {
  const grid = gridFor(x, z);
  const gx = Math.floor(x / CS), gz = Math.floor(z / CS);
  const l = grid.get(key(gx, gz));
  if (!l) return false;
  for (const c of l) {
    if (c.t === 0) {
      const ex = x - c.x, ez = z - c.z;
      if (ex * ex + ez * ez < (c.r + r) * (c.r + r)) return true;
    } else {
      const lx0 = x - c.x, lz0 = z - c.z;
      const lx = lx0 * c.cos - lz0 * c.sin, lz = lx0 * c.sin + lz0 * c.cos;
      if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return true;
    }
  }
  return false;
}

// Occlusion de la caméra : fraction [0..1] du segment a→b parcourue avant de heurter un obstacle haut
// (seuls les obstacles dotés d'un sommet `top` comptent : maisons, remparts, tours, menhirs…).
export function segmentHit(ax, ay, az, bx, by, bz, step = 0.45) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return 1;
  const n = Math.ceil(len / step);
  const m = 0.3;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
    const l = gridFor(x, z).get(key(Math.floor(x / CS), Math.floor(z / CS)));
    if (!l) continue;
    for (const c of l) {
      if (c.top === undefined || y > c.top) continue;
      if (c.t === 0) {
        const ex = x - c.x, ez = z - c.z;
        if (ex * ex + ez * ez < (c.r + m) * (c.r + m)) return t;
      } else {
        const lx0 = x - c.x, lz0 = z - c.z;
        const lx = lx0 * c.cos - lz0 * c.sin, lz = lx0 * c.sin + lz0 * c.cos;
        if (Math.abs(lx) < c.hw + m && Math.abs(lz) < c.hd + m) return t;
      }
    }
  }
  return 1;
}
