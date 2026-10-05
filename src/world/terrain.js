import { isInstancePoint } from '../data/world-space.js';
// Génération du relief d'Orvalis (champ de hauteurs déterministe) et des maillages de terrain.
import * as THREE from 'three';
import { makeNoise2D, fbm, ridged } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { hash2 } from '../core/rng.js';
import {
  WORLD_HALF, WORLD_SCALE, BORDER, ZONES, ZONE_GRID, PASSES, HUBS, LANDMARKS, LAKES, ROADS, HUB_BY_ID, LANDMARK_BY_ID,
} from '../data/zones.js';

const SEED = 7331;
const nA = makeNoise2D(SEED);
const nB = makeNoise2D(SEED + 1);
const nC = makeNoise2D(SEED + 2);
const nW = makeNoise2D(SEED + 3);
const nE = makeNoise2D(SEED + 4);

export const CELL = 4;
export const RES = (WORLD_HALF * 2) / CELL; // 1024 cellules par côté
export const VN = RES + 1; // sommets par côté
export const CHUNK_CELLS = 32;
export const CHUNKS = RES / CHUNK_CELLS; // 32x32 secteurs

// ---------------------------------------------------------------------------
// Frontières ondulées entre régions
export function borderV(line, z) {
  return line * BORDER + 16 * nW(z / 150, line * 7.3);
}
export function borderH(line, x) {
  return line * BORDER + 16 * nW(x / 150, line * 7.3 + 40);
}

export const passCenters = PASSES.map((p) =>
  p.dir === 'v' ? { x: borderV(p.line, p.at), z: p.at, hw: p.hw } : { x: p.at, z: borderH(p.line, p.at), hw: p.hw });

function passFactor(dir, line, along) {
  let f = 0;
  for (const p of PASSES) {
    if (p.dir !== dir || p.line !== line) continue;
    const d = Math.abs(along - p.at);
    f = Math.max(f, smoothstep(p.hw + 16, p.hw, d));
  }
  return f;
}

export function colRow(x, z) {
  const c = x < borderV(-1, z) ? 0 : x > borderV(1, z) ? 2 : 1;
  const r = z < borderH(-1, x) ? 0 : z > borderH(1, x) ? 2 : 1;
  return [c, r];
}

// Région extérieure au monde (donjons instanciés, placés loin à l'est : isInstancePoint(x, z))
// Compatibilité des imports ; ne pas utiliser pour déterminer un monde.
export const EXT_X = 5700;
let ext = null;
export function setExtRegion(r) { ext = r; }
export function getExtRegion() { return ext; }

export function zoneAt(x, z) {
  if (isInstancePoint(x, z)) return ext ? ext.zone : ZONE_GRID[1][1];
  const [c, r] = colRow(x, z);
  return ZONE_GRID[r][c];
}

// Poids de mélange entre régions (pour adoucir les transitions)
function weights(x, z, out) {
  const b0 = borderV(-1, z), b1 = borderV(1, z);
  const t0 = smoothstep(b0 - 26, b0 + 26, x), t1 = smoothstep(b1 - 26, b1 + 26, x);
  const cw0 = 1 - t0, cw1 = t0 * (1 - t1), cw2 = t1;
  const h0 = borderH(-1, x), h1 = borderH(1, x);
  const s0 = smoothstep(h0 - 26, h0 + 26, z), s1 = smoothstep(h1 - 26, h1 + 26, z);
  const rw0 = 1 - s0, rw1 = s0 * (1 - s1), rw2 = s1;
  const cw = [cw0, cw1, cw2], rw = [rw0, rw1, rw2];
  let n = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const w = cw[c] * rw[r];
    if (w > 0.002) out[n++] = [ZONE_GRID[r][c], w];
  }
  return n;
}

// ---------------------------------------------------------------------------
// Relief propre à chaque biome
function biomeHeight(b, x, z) {
  switch (b) {
    case 'meadow':
      return 6 + 5.5 * fbm(nA, x / 115, z / 115, 4) + 1.1 * fbm(nB, x / 24, z / 24, 2);
    case 'badlands': {
      let v = 10 + 10 * fbm(nA, x / 150, z / 150, 4);
      const step = 3.4, t = v / step, f = Math.floor(t), fr = t - f;
      v = (f + smoothstep(0.3, 0.7, fr)) * step;
      return v + 0.7 * fbm(nB, x / 22, z / 22, 2);
    }
    case 'forest':
      return 6.5 + 6 * fbm(nA, x / 95, z / 95, 4) + 1.4 * fbm(nB, x / 20, z / 20, 2);
    case 'canyon': {
      const r = 1 - ridged(nC, x / 130, z / 130, 3);
      return 6 + 11 * smoothstep(0.25, 0.85, r) + 1.2 * fbm(nB, x / 18, z / 18, 2);
    }
    case 'swamp':
      return 0.45 + 1.9 * fbm(nA, x / 48, z / 48, 3) + 0.35 * fbm(nB, x / 11, z / 11, 2);
    case 'ruins':
      return 8 + 5 * fbm(nA, x / 105, z / 105, 4) + 0.9 * fbm(nB, x / 20, z / 20, 2);
    case 'snow':
      return 17 + 12 * fbm(nA, x / 100, z / 100, 5) + 3 * ridged(nC, x / 55, z / 55, 3);
    case 'volcanic':
      return 12 + 9 * fbm(nA, x / 90, z / 90, 4) + 2.5 * ridged(nC, x / 38, z / 38, 3);
    case 'storm':
      return 24 + 8 * fbm(nA, x / 110, z / 110, 4) + 1.8 * fbm(nB, x / 25, z / 25, 2);
  }
  return 5;
}

const W = new Array(9);

// Hauteur "naturelle" avant aplanissement des lieux habités
function naturalHeight(x, z) {
  const n = weights(x, z, W);
  let h = 0;
  for (let i = 0; i < n; i++) h += W[i][1] * biomeHeight(W[i][0].biome, x, z);

  // Crêtes montagneuses le long des frontières, ouvertes aux cols
  const rn = ridged(nC, x / 45, z / 45, 3);
  let ridge = 0;
  for (const line of [-1, 1]) {
    const dv = Math.abs(x - borderV(line, z));
    if (dv < 34) ridge = Math.max(ridge, smoothstep(34, 5, dv) * (1 - passFactor('v', line, z)));
    const dh = Math.abs(z - borderH(line, x));
    if (dh < 34) ridge = Math.max(ridge, smoothstep(34, 5, dh) * (1 - passFactor('h', line, x)));
  }
  h += ridge * (24 + 22 * rn);

  // Bords du monde : mer à l'ouest (Val d'Azur, Bois-Murmure), montagnes ailleurs
  const bh0 = borderH(-1, x);
  const seaMask = x < -420 * WORLD_SCALE ? smoothstep(bh0 + 12, bh0 + 70, z) * (1 - smoothstep(425 * WORLD_SCALE, 470 * WORLD_SCALE, z)) : 0;
  if (seaMask > 0) {
    const seaEdge = -478 * WORLD_SCALE + 6 * nE(z / 60, 3);
    const t = smoothstep(seaEdge + 22, seaEdge - 10, x) * seaMask;
    h = lerp(h, -9, t);
  }
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > WORLD_HALF - 180) {
    const westOnly = Math.abs(x) >= Math.abs(z) && x < 0;
    const m = westOnly ? 1 - seaMask : 1;
    h += smoothstep(WORLD_HALF - 180, WORLD_HALF - 12, e) * (55 + 20 * rn) * m;
  }

  // Lacs
  for (const L of LAKES) {
    const dx = x - L.x, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dz * dz) + 3 * nE(x / 20, z / 20);
    if (d < L.r + 10) {
      const zn = zoneAt(L.x, L.z);
      if (zn.biome === 'snow') {
        h = lerp(h, 0.35, smoothstep(L.r + 10, L.r * 0.8, d));
      } else {
        const t = smoothstep(L.r + 8, L.r * 0.45, d);
        h = lerp(h, -L.depth, t);
      }
    }
  }
  return h;
}

// Aplanissement des villes et lieux remarquables
const FLATS = [];
function buildFlats() {
  for (const hub of HUBS) {
    let target = 0, cnt = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      target += naturalHeight(hub.x + Math.cos(ang) * hub.r * 0.5, hub.z + Math.sin(ang) * hub.r * 0.5);
      cnt++;
    }
    target = Math.max(2.2, target / cnt);
    hub.y = target;
    FLATS.push({ x: hub.x, z: hub.z, r: hub.r, target, soft: hub.type === 'capital' ? 24 : 16 });
  }
  for (const lm of LANDMARKS) {
    if (!lm.r) continue;
    let target = naturalHeight(lm.x, lm.z);
    if (lm.kind === 'bog') target = Math.min(target, 0.6);
    else target = Math.max(1.6, target);
    lm.y = target;
    FLATS.push({ x: lm.x, z: lm.z, r: lm.r, target, soft: 14 });
  }
}

function rawHeight(x, z) {
  let h = naturalHeight(x, z);
  for (const f of FLATS) {
    const dx = x - f.x, dz = z - f.z;
    const d2 = dx * dx + dz * dz;
    const R = f.r + f.soft;
    if (d2 < R * R) {
      const d = Math.sqrt(d2);
      h = lerp(h, f.target, smoothstep(R, f.r, d));
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Routes
export const roadSegs = []; // [x1,z1,x2,z2]
export const roadChains = []; // listes de points {x,z}
function resolveKey(key) {
  const h = HUB_BY_ID[key] || LANDMARK_BY_ID[key];
  return { x: h.x, z: h.z };
}
function resolveRoad(road) {
  const pts = [];
  for (let k = 0; k < road.length; k++) {
    const key = road[k];
    if (!key.startsWith('pass:')) { pts.push(resolveKey(key)); continue; }
    const idx = +key.slice(5);
    const pc = passCenters[idx], P = PASSES[idx];
    const prev = pts.length ? pts[pts.length - 1] : (k + 1 < road.length ? resolveKey(road[k + 1]) : pc);
    let a, b;
    if (P.dir === 'v') { a = { x: pc.x - 46, z: pc.z }; b = { x: pc.x + 46, z: pc.z }; }
    else { a = { x: pc.x, z: pc.z - 46 }; b = { x: pc.x, z: pc.z + 46 }; }
    const da = Math.hypot(prev.x - a.x, prev.z - a.z), db = Math.hypot(prev.x - b.x, prev.z - b.z);
    if (db < da) { const t = a; a = b; b = t; }
    if (pts.length) pts.push(a);
    pts.push({ x: pc.x, z: pc.z });
    if (k + 1 < road.length) pts.push(b);
  }
  return pts;
}
function buildRoads() {
  for (const road of ROADS) {
    const pts = resolveRoad(road);
    const chain = [{ x: pts[0].x, z: pts[0].z }];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const n = Math.max(1, Math.floor(len / 14));
      let px = a.x, pz = a.z;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        let x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
        if (k < n && len > 60) {
          const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
          const off = 8 * nE(x / 70, z / 70) * Math.sin(t * Math.PI);
          x += nx * off; z += nz * off;
        }
        roadSegs.push([px, pz, x, z]);
        chain.push({ x, z });
        px = x; pz = z;
      }
    }
    roadChains.push(chain);
  }
}

// Creuse un profil lissé le long des routes pour garantir qu'elles restent praticables
function carveRoads() {
  const best = new Float32Array(VN * VN).fill(99);
  const target = new Float32Array(VN * VN);
  for (const chain of roadChains) {
    const samples = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k < n; k++) {
        const x = lerp(a.x, b.x, k / n), z = lerp(a.z, b.z, k / n);
        samples.push({ x, z, h: rawHeight(x, z) });
      }
    }
    const last = chain[chain.length - 1];
    samples.push({ x: last.x, z: last.z, h: rawHeight(last.x, last.z) });
    // moyenne glissante puis limitation de pente
    const hs = samples.map((s) => s.h);
    const sm = hs.slice();
    const Wn = 9;
    for (let i = 0; i < hs.length; i++) {
      let acc = 0, c = 0;
      for (let k = -Wn; k <= Wn; k++) {
        const j = i + k;
        if (j < 0 || j >= hs.length) continue;
        acc += hs[j]; c++;
      }
      sm[i] = Math.max(acc / c, 0.4);
    }
    const maxStep = 0.9;
    for (let i = 1; i < sm.length; i++) sm[i] = clamp(sm[i], sm[i - 1] - maxStep, sm[i - 1] + maxStep);
    for (let i = sm.length - 2; i >= 0; i--) sm[i] = clamp(sm[i], sm[i + 1] - maxStep, sm[i + 1] + maxStep);
    for (let s = 0; s < samples.length; s++) {
      const { x, z } = samples[s];
      const ci = Math.round((x + WORLD_HALF) / CELL), cj = Math.round((z + WORLD_HALF) / CELL);
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= VN || j >= VN) continue;
        const vx = -WORLD_HALF + i * CELL, vz = -WORLD_HALF + j * CELL;
        const d = Math.hypot(vx - x, vz - z);
        const idx = j * VN + i;
        if (d < best[idx]) { best[idx] = d; target[idx] = sm[s]; }
      }
    }
  }
  for (let idx = 0; idx < VN * VN; idx++) {
    if (best[idx] > 10) continue;
    const w = smoothstep(10, 4.5, best[idx]);
    H[idx] = lerp(H[idx], target[idx], w);
  }
}
// Grille d'accélération pour les segments de route
const RG = 32, roadGrid = new Map();
function indexRoads() {
  for (let i = 0; i < roadSegs.length; i++) {
    const [x1, z1, x2, z2] = roadSegs[i];
    const minx = Math.floor((Math.min(x1, x2) - 6) / RG), maxx = Math.floor((Math.max(x1, x2) + 6) / RG);
    const minz = Math.floor((Math.min(z1, z2) - 6) / RG), maxz = Math.floor((Math.max(z1, z2) + 6) / RG);
    for (let gx = minx; gx <= maxx; gx++) for (let gz = minz; gz <= maxz; gz++) {
      const k = gx * 1000 + gz;
      if (!roadGrid.has(k)) roadGrid.set(k, []);
      roadGrid.get(k).push(i);
    }
  }
}
export function roadDist(x, z) {
  if (isInstancePoint(x, z)) return 99;
  const k = Math.floor(x / RG) * 1000 + Math.floor(z / RG);
  const list = roadGrid.get(k);
  if (!list) return 99;
  let best = 99;
  for (const i of list) {
    const [x1, z1, x2, z2] = roadSegs[i];
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
    const px = x1 + dx * t - x, pz = z1 + dz * t - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Grille de hauteurs
export const H = new Float32Array(VN * VN);
let ready = false;

export function initTerrainData() {
  if (ready) return;
  buildFlats();
  buildRoads();
  indexRoads();
  for (let j = 0; j < VN; j++) {
    const z = -WORLD_HALF + j * CELL;
    for (let i = 0; i < VN; i++) {
      const x = -WORLD_HALF + i * CELL;
      H[j * VN + i] = rawHeight(x, z);
    }
  }
  carveRoads();
  ready = true;
}

// Hauteur interpolée (identique au maillage : 2 triangles par cellule, diagonale i0j0-i1j1)
export function getHeight(x, z) {
  if (isInstancePoint(x, z)) return ext ? ext.height(x, z) : 0;
  const fx = (x + WORLD_HALF) / CELL, fz = (z + WORLD_HALF) / CELL;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0) i = 0; if (j < 0) j = 0; if (i > RES - 1) i = RES - 1; if (j > RES - 1) j = RES - 1;
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const h00 = H[j * VN + i], h10 = H[j * VN + i + 1], h01 = H[(j + 1) * VN + i], h11 = H[(j + 1) * VN + i + 1];
  if (u > v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
  return h00 + (h11 - h01) * u + (h01 - h00) * v;
}

export function getSlope(x, z) {
  const e = 1.5;
  const dx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
  const dz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}

export function waterDepth(x, z) {
  return -getHeight(x, z);
}

export function isLava(x, z) {
  if (isInstancePoint(x, z)) return ext ? !!ext.lava?.(x, z) : false;
  const zn = zoneAt(x, z);
  return zn.biome === 'volcanic' && getHeight(x, z) < -0.2;
}

// Peut-on marcher de (x1,z1) vers (x2,z2) ? (bloque les pentes trop raides et le bord du monde)
export function canWalk(x1, z1, x2, z2) {
  if (isInstancePoint(x2, z2) || isInstancePoint(x1, z1)) return !!ext && isInstancePoint(x1, z1) && isInstancePoint(x2, z2) && ext.walk(x2, z2) && Math.abs(ext.height(x2, z2) - ext.height(x1, z1)) < Math.max(0.9, Math.hypot(x2 - x1, z2 - z1) * 0.9);
  if (Math.abs(x2) > WORLD_HALF - 14 || Math.abs(z2) > WORLD_HALF - 14) return false;
  const h1 = getHeight(x1, z1), h2 = getHeight(x2, z2);
  const d = Math.hypot(x2 - x1, z2 - z1) || 0.001;
  if (h2 > h1 && (h2 - h1) / d > 1.05 && getSlope(x2, z2) > 0.95) return false;
  if (h2 < -7) return false; // eau trop profonde (large)
  return true;
}

// ---------------------------------------------------------------------------
// Couleurs du sol
const C = (hex) => new THREE.Color(hex);
const PAL = {
  meadow: { g: [C('#5fa83a'), C('#6cb842'), C('#52983a'), C('#7cc24c')], dirt: C('#a8824e'), rock: C('#8f8c84'), sand: C('#e6d08c'), road: C('#c9a56c') },
  badlands: { g: [C('#dc9440'), C('#cc7836'), C('#e8b05c'), C('#d48a3c')], dirt: C('#b06a3c'), rock: C('#a0603a'), sand: C('#f0c878'), road: C('#b07c48') },
  forest: { g: [C('#3f8a3a'), C('#4a9a40'), C('#367a36'), C('#58a846')], dirt: C('#7a5a38'), rock: C('#72786e'), sand: C('#a08a58'), road: C('#94744a') },
  canyon: { g: [C('#a8604a'), C('#96503e'), C('#bc7454'), C('#a45c48')], dirt: C('#6a4a40'), rock: C('#80503e'), sand: C('#d09a64'), road: C('#6a544a') },
  swamp: { g: [C('#56803a'), C('#4a7234'), C('#628c3e'), C('#507a38')], dirt: C('#665a38'), rock: C('#626a56'), sand: C('#786a42'), road: C('#7c6842') },
  ruins: { g: [C('#84b05c'), C('#94c066'), C('#78a454'), C('#a0c870')], dirt: C('#9c8660'), rock: C('#b0aa9c'), sand: C('#c8bc94'), road: C('#c4bca8') },
  snow: { g: [C('#eef4fa'), C('#e4eef8'), C('#f8fbff'), C('#dce8f6')], dirt: C('#bccce0'), rock: C('#7e8894'), sand: C('#ccdcec'), road: C('#d0c8b8') },
  volcanic: { g: [C('#544844'), C('#62524c'), C('#483e3c'), C('#5c4a44')], dirt: C('#3e3430'), rock: C('#2e2a32'), sand: C('#7a4a34'), road: C('#3a302e') },
  storm: { g: [C('#4e8c78'), C('#5a9a84'), C('#46806e'), C('#64a48c')], dirt: C('#5c645c'), rock: C('#6c7688'), sand: C('#8a9c90'), road: C('#868c84') },
};
const ICE = C('#bcd8ea');
const LAVA_EDGE = C('#8a3a1e');
const SNOWCAP = C('#eef2f7');
const HUB_GROUND = [C('#b8b09e'), C('#5d4f47')];
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

function biomeColor(b, x, z, h, slope, out) {
  const P = PAL[b];
  const nv = fbm(nB, x / 38, z / 38, 2) * 0.5 + 0.5;
  const nv2 = hash2(Math.floor(x / 4), Math.floor(z / 4), 11);
  const gi = Math.floor(clamp(nv * 3.6 + (nv2 - 0.5) * 0.45, 0, 3.99));
  out.copy(P.g[gi]);
  if (b === 'badlands') {
    const band = ((Math.floor(h / 3.4) % 3) + 3) % 3;
    out.lerp(P.g[band], 0.5);
  }
  if (b === 'snow' && slope > 0.7) out.copy(P.rock);
  else if (slope > 0.85) out.lerp(P.rock, smoothstep(0.85, 1.3, slope));
  else if (slope > 0.55) out.lerp(P.dirt, 0.45);
  if (h < 1.0 && b !== 'snow') out.lerp(P.sand, smoothstep(1.0, 0.1, h));
  if (b === 'volcanic' && h < 0.8) out.lerp(LAVA_EDGE, smoothstep(0.8, -0.5, h));
  if (b === 'snow' && h < 0.6 && h > 0.1 && slope < 0.2) out.copy(ICE);
  if (h > 42 && b !== 'volcanic') out.lerp(SNOWCAP, smoothstep(42, 52, h));
  // variation fine
  const v = (nv2 - 0.5) * 0.035;
  out.r = clamp(out.r + v, 0, 1); out.g = clamp(out.g + v, 0, 1); out.b = clamp(out.b + v, 0, 1);
  return out;
}

export function groundColor(x, z, h, slope, out) {
  const n = weights(x, z, W);
  out.setRGB(0, 0, 0);
  for (let i = 0; i < n; i++) {
    biomeColor(W[i][0].biome, x, z, h, slope, tmpC);
    out.r += tmpC.r * W[i][1]; out.g += tmpC.g * W[i][1]; out.b += tmpC.b * W[i][1];
  }
  // Routes
  const rd = roadDist(x, z);
  if (rd < 3.6 && slope < 0.9) {
    const zn = zoneAt(x, z);
    const t = smoothstep(3.6, 1.8, rd + (hash2(Math.floor(x), Math.floor(z), 5) - 0.5) * 1.2);
    out.lerp(PAL[zn.biome].road, t * 0.9);
  }
  // Sol des lieux habités
  for (const hub of HUBS) {
    const dx = x - hub.x, dz = z - hub.z;
    const r = hub.type === 'capital' ? hub.r - 8 : hub.r * 0.55;
    if (dx * dx + dz * dz < r * r) {
      tmpC2.copy(HUB_GROUND[hub.faction]);
      if (hub.type !== 'capital') tmpC2.copy(PAL[zoneAt(x, z).biome].road);
      const chk = (Math.floor(x / 2) + Math.floor(z / 2)) & 1;
      tmpC2.offsetHSL(0, 0, chk ? 0.015 : -0.015);
      out.lerp(tmpC2, 0.8);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Maillages

// Mélange des textures du sol en un point : x = roche, y = terre/chemin, z = sable, w = neige ; cob = pavés
const _W2 = [];
export function groundMix(x, z, h, slope, out) {
  const n = weights(x, z, _W2);
  let snow = 0, rockSlope = 0.85, rockEnd = 1.3;
  for (let i = 0; i < n; i++) if (_W2[i][0].biome === 'snow') snow += _W2[i][1];
  let rock = smoothstep(0.62, 1.05, slope);
  if (snow > 0.5 && slope > 0.55) rock = Math.max(rock, smoothstep(0.55, 0.8, slope));
  let dirt = slope > 0.4 ? smoothstep(0.4, 0.6, slope) * 0.6 : 0;
  const rd = roadDist(x, z);
  if (rd < 3.8 && slope < 0.9) dirt = Math.max(dirt, smoothstep(3.8, 1.6, rd));
  let cob = 0;
  for (const hub of HUBS) {
    const dx = x - hub.x, dz = z - hub.z;
    const r = hub.type === 'capital' ? hub.r - 8 : hub.r * 0.55;
    const d2 = dx * dx + dz * dz;
    if (d2 < (r + 2) * (r + 2)) {
      const t = smoothstep(r + 2, r - 1, Math.sqrt(d2));
      if (hub.type === 'capital' || hub.type === 'sanctuary') cob = Math.max(cob, t);
      else dirt = Math.max(dirt, t);
    }
  }
  const sand = h < 1.2 && snow < 0.5 ? smoothstep(1.2, 0.2, h) : 0;
  const snowW = Math.max(snow * (1 - rock), h > 42 ? smoothstep(42, 52, h) : 0);
  out[0] = rock; out[1] = Math.min(1, dirt); out[2] = sand; out[3] = snowW; out[4] = cob * (1 - rock);
  return out;
}

export function hubHeight(id) {
  const h = HUB_BY_ID[id] || LANDMARK_BY_ID[id];
  return h?.y ?? getHeight(h.x, h.z);
}
