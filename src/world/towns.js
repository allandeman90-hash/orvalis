// Villes, villages et avant-postes des deux factions, construits en blocs.
import * as THREE from 'three';
import { GeoBuilder, vcMaterial, vcGlowMaterial } from '../engine/geom.js';
import { getHeight } from './terrain.js';
import { HUBS, ZONE_BY_ID } from '../data/zones.js';
import { CLASSES } from '../data/classbase.js';
import { mulberry32, hashStr } from '../core/rng.js';
import { addBox, addCircle } from './collide.js';

const STYLE = [
  { wall: '#d6d0c2', wall2: '#c4bdac', trim: '#7a5838', roof: '#485d6c', roof2: '#657b89', banner: '#3b6fd8', banner2: '#f2d27a', stone: '#b9b3a5', dark: '#5d6a80', glow: '#ffe7a3' },
  { wall: '#6e5e54', wall2: '#564a44', trim: '#2e2a28', roof: '#865345', roof2: '#66443b', banner: '#c8321e', banner2: '#1c1414', stone: '#4a403b', dark: '#2a2220', glow: '#ffb05a' },
];

// Transformation locale -> monde pour un hub (rotation ry autour du centre)
class Site {
  constructor(hub) {
    this.hub = hub;
    this.cx = hub.x; this.cz = hub.z; this.y = hub.y ?? getHeight(hub.x, hub.z);
    this.b = new GeoBuilder();
    this.gl = new GeoBuilder();
    this.spots = { quest: [], guards: [], wander: [], fires: [], lights: [] };
    this.rnd = mulberry32(hashStr(hub.id));
  }
  wx(lx) { return this.cx + lx; }
  wz(lz) { return this.cz + lz; }
  gy(lx, lz) { return getHeight(this.cx + lx, this.cz + lz); }
}

function rot(lx, lz, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// Maison : centre local (lx,lz), orientée ry (la porte regarde +z local)
function house(S, st, lx, lz, w, d, h, ry, opts = {}) {
  const b = S.b, g = S.gl;
  const y = Math.min(S.gy(lx - w / 2, lz), S.gy(lx + w / 2, lz), S.gy(lx, lz - d / 2), S.gy(lx, lz + d / 2), S.y) - 0.3;
  const wx = S.wx(lx), wz = S.wz(lz);
  const put = (fn, ox, oy, oz, ...args) => {
    const [rx, rz] = rot(ox, oz, ry);
    fn(wx + rx, y + oy, wz + rz, ...args);
  };
  const wallC = opts.wall || st.wall;
  b.surfOverride=5;
  // soubassement + murs
  put((x, yy, z) => b.box(w + 0.4, 0.8, d + 0.4, st.stone, x, yy, z, 0, ry, 0), 0, 0.4, 0);
  b.surfOverride=10;
  put((x, yy, z) => b.box(w, h, d, wallC, x, yy, z, 0, ry, 0), 0, 0.8 + h / 2, 0);
  b.surfOverride=6;
  // colombages / coins
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put((x, yy, z) => b.box(0.35, h, 0.35, st.trim, x, yy, z, 0, ry, 0), sx * (w / 2), 0.8 + h / 2, sz * (d / 2));
  }
  put((x, yy, z) => b.box(w + 0.1, 0.3, d + 0.1, st.trim, x, yy, z, 0, ry, 0), 0, 0.8 + h, 0);
  b.surfOverride=7;
  // toit
  const rh = opts.flat ? 0.6 : Math.min(w, d) * 0.55;
  if (opts.flat) {
    put((x, yy, z) => b.box(w + 0.8, rh, d + 0.8, st.roof, x, yy, z, 0, ry, 0), 0, 0.8 + h + rh / 2, 0);
    for (const sx of [-1, 1]) put((x, yy, z) => b.box(0.4, 0.8, 0.4, st.roof2, x, yy, z, 0, ry, 0), sx * (w / 2), 0.8 + h + rh + 0.4, d / 2);
  } else {
    put((x, yy, z) => b.roof(w + 1.0, rh, d + 1.0, st.roof, x, yy, z, ry), 0, 0.8 + h + 0.15, 0);
  }
  b.surfOverride=6;
  // porte
  put((x, yy, z) => b.box(1.3, 2.2, 0.25, st.dark, x, yy, z, 0, ry, 0), 0, 0.8 + 1.1, d / 2 + 0.05);
  // fenêtres (lumineuses la nuit)
  for (const sx of [-1, 1]) {
    put((x, yy, z) => g.box(0.8, 0.8, 0.12, st.glow, x, yy, z, 0, ry, 0), sx * (w / 3.2), 0.8 + h * 0.6, d / 2 + 0.06);
  }
  put((x, yy, z) => g.box(0.12, 0.8, 0.8, st.glow, x, yy, z, 0, ry, 0), w / 2 + 0.06, 0.8 + h * 0.6, 0);
  // Encadrements, croisillons et contreventements donnent une échelle humaine aux façades.
  for(const side of [-1,1]) {
    for(const dx of [-.48,.48]) put((x,yy,z)=>b.box(.12,1.05,.18,st.trim,x,yy,z,0,ry,0),side*w/3.2+dx,.8+h*.6,d/2+.16);
    for(const dy of [-.49,.49,0]) put((x,yy,z)=>b.box(1.08,.10,.18,st.trim,x,yy,z,0,ry,0),side*w/3.2,.8+h*.6+dy,d/2+.16);
    put((x,yy,z)=>b.box(.14,h*.65,.15,st.trim,x,yy,z,0,ry,side*.38),side*(w*.32),.8+h*.32,d/2+.1);
  }
  for(const side of [-1,1]) put((x,yy,z)=>b.box(.18,2.45,.3,st.trim,x,yy,z,0,ry,0),side*.78,2,d/2+.12);
  put((x,yy,z)=>b.roof(2,.5,1,st.roof,x,yy,z,ry),0,3.25,d/2+.35);
  b.surfOverride=5;
  // cheminée
  if (!opts.flat) put((x, yy, z) => b.box(0.7, 2.2, 0.7, st.stone, x, yy, z, 0, ry, 0), w / 4, 0.8 + h + rh * 0.6, -d / 4);
  b.surfOverride=null;
  addBox(wx, wz, w / 2 + 0.3, d / 2 + 0.3, ry, y + 0.8 + h + rh);
  // position de la porte (pour placer un PNJ)
  const [dx, dz] = rot(0, d / 2 + 1.6, ry);
  return { x: wx + dx, z: wz + dz, ry };
}

function tower(S, st, lx, lz, r, h) {
  const b = S.b;
  const x = S.wx(lx), z = S.wz(lz);
  const y = S.gy(lx, lz) - 0.5;
  b.box(r * 2, h, r * 2, st.wall2, x, y + h / 2, z);
  b.box(r * 2 + 0.6, 0.6, r * 2 + 0.6, st.stone, x, y + h, z);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    b.box(0.7, 0.9, 0.7, st.stone, x + cx * r, y + h + 0.75, z + cz * r);
  }
  b.cone(r * 1.45, r * 2.2, 4, st.roof, x, y + h + 0.3 + r * 1.1, z, 0, Math.PI / 4, 0);
  S.gl.box(0.5, 0.9, 0.1, st.glow, x, y + h * 0.7, z + r + 0.06);
  addCircle(x, z, r * 1.2, y + h + 0.3 + r * 2.2);
}

function wallSeg(S, st, x1, z1, x2, z2, h) {
  const b = S.b;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ry = Math.atan2(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(len / 4));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const lx = x1 + (x2 - x1) * tm, lz = z1 + (z2 - z1) * tm;
    const y = S.gy(lx, lz) - 0.8;
    const sl = len / n + 0.15;
    b.box(1.8, h, sl, st.wall2, S.wx(lx), y + h / 2, S.wz(lz), 0, ry, 0);
    b.box(2.2, 0.4, sl, st.stone, S.wx(lx), y + h, S.wz(lz), 0, ry, 0);
    // créneaux
    b.box(0.5, 0.8, 0.9, st.stone, S.wx(lx) + Math.cos(ry) * 0.85, y + h + 0.6, S.wz(lz) - Math.sin(ry) * 0.85, 0, ry, 0);
    b.box(0.5, 0.8, 0.9, st.stone, S.wx(lx) - Math.cos(ry) * 0.85, y + h + 0.6, S.wz(lz) + Math.sin(ry) * 0.85, 0, ry, 0);
  }
  addBox(S.wx((x1 + x2) / 2), S.wz((z1 + z2) / 2), 1.1, len / 2, ry, Math.max(S.gy(x1, z1), S.gy(x2, z2), S.gy((x1 + x2) / 2, (z1 + z2) / 2)) - 0.8 + h + 1);
}

function banner(S, st, lx, lz, h = 5) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(0.2, h, 0.2, st.trim, x, y + h / 2, z);
  S.b.box(1.3, 2.2, 0.08, st.banner, x + 0.75, y + h - 1.3, z);
  S.b.box(1.3, 0.35, 0.1, st.banner2, x + 0.75, y + h - 0.35, z);
  S.b.box(0.5, 0.5, 0.1, st.banner2, x + 0.75, y + h - 1.4, z + 0.02);
}

function lamp(S, st, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(0.18, 3.2, 0.18, '#3a3430', x, y + 1.6, z);
  S.b.box(0.6, 0.12, 0.6, '#3a3430', x, y + 3.25, z);
  S.gl.box(0.4, 0.5, 0.4, st.glow, x, y + 3.55, z);
  S.b.box(0.55, 0.12, 0.55, '#3a3430', x, y + 3.85, z);
  S.spots.lights.push({ x, y: y + 3.5, z });
}

function brazier(S, lx, lz, big = false) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  const s = big ? 2.2 : 1;
  S.b.cyl(0.5 * s, 0.35 * s, 1.0 * s, 6, '#2e2a28', x, y + 0.5 * s, z);
  S.b.cyl(0.75 * s, 0.55 * s, 0.4 * s, 6, '#3a3230', x, y + 1.1 * s, z);
  S.gl.cyl(0.55 * s, 0.6 * s, 0.2 * s, 6, '#ff9a3a', x, y + 1.3 * s, z);
  S.spots.fires.push({ x, y: y + 1.35 * s, z, s });
  addCircle(x, z, 0.8 * s);
}

function travelStone(S, st, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.cyl(1.6, 1.9, 0.5, 8, st.stone, x, y + 0.25, z);
  S.b.box(0.9, 3.2, 0.9, '#6d6a78', x, y + 2.0, z, 0, Math.PI / 4, 0);
  S.gl.octa(0.55, S.hub.faction ? '#ff8a4a' : '#7fb8ff', x, y + 4.2, z, 1, 1.6, 1);
  addCircle(x, z, 1.0);
  S.spots.travel = { x, z: z + 2.4 };
}

function well(S, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.cyl(1.3, 1.4, 1.0, 8, '#9d978a', x, y + 0.5, z);
  S.b.cyl(1.0, 1.0, 0.1, 8, '#2a4a6a', x, y + 0.95, z);
  S.b.box(0.2, 2.4, 0.2, '#6b4a2e', x - 1.1, y + 1.2, z);
  S.b.box(0.2, 2.4, 0.2, '#6b4a2e', x + 1.1, y + 1.2, z);
  S.b.roof(3.0, 0.9, 1.8, '#7a5838', x, y + 2.4, z, 0);
  addCircle(x, z, 1.5);
}

function fountain(S, st, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.cyl(4.2, 4.5, 0.9, 10, st.stone, x, y + 0.45, z);
  S.b.cyl(3.8, 3.8, 0.1, 10, '#3f7fb8', x, y + 0.86, z);
  S.b.cyl(0.7, 0.9, 2.6, 8, st.stone, x, y + 1.6, z);
  S.b.cyl(1.6, 1.3, 0.4, 8, st.stone, x, y + 2.9, z);
  S.b.box(0.8, 1.6, 0.8, '#e8e2d4', x, y + 3.9, z);
  S.gl.octa(0.5, '#bfe0ff', x, y + 5.1, z, 1, 1.4, 1);
  addCircle(x, z, 4.6);
}

function anvilStatue(S, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.cyl(3.8, 4.2, 1.2, 8, '#3a3230', x, y + 0.6, z);
  S.b.box(3.2, 1.2, 1.6, '#2a2626', x, y + 1.8, z);
  S.b.box(1.4, 1.2, 1.0, '#2a2626', x, y + 1.0 + 0.6, z);
  S.b.box(4.2, 0.6, 1.8, '#3a3434', x, y + 2.6, z);
  brazier(S, lx - 3.2, lz + 3.2); brazier(S, lx + 3.2, lz + 3.2); brazier(S, lx - 3.2, lz - 3.2); brazier(S, lx + 3.2, lz - 3.2);
  addCircle(x, z, 4.3);
}

function stall(S, st, lx, lz, ry, c) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(3.2, 1.0, 1.6, '#7a5838', x, y + 0.5, z, 0, ry, 0);
  for (const sx of [-1.5, 1.5]) {
    const [ox, oz] = rot(sx, -0.7, ry);
    S.b.box(0.15, 2.6, 0.15, '#6b4a2e', x + ox, y + 1.3, z + oz);
  }
  S.b.roof(3.6, 0.8, 2.2, c, x, y + 2.6, z, ry);
  S.b.box(0.5, 0.35, 0.5, '#e0b050', x - 0.6, y + 1.2, z);
  S.b.box(0.4, 0.4, 0.4, '#9a3a3a', x + 0.5, y + 1.2, z);
  addBox(x, z, 1.7, 0.9, ry);
}

function tent(S, st, lx, lz, s = 1, c) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.cone(2.6 * s, 3.0 * s, 4, c || st.banner, x, y + 1.5 * s, z, 0, Math.PI / 4, 0);
  S.b.box(0.9 * s, 1.6 * s, 0.1, '#2a2020', x, y + 0.8 * s, z + 1.55 * s);
  S.b.box(0.12, 3.6 * s, 0.12, st.trim, x, y + 1.8 * s, z);
  addCircle(x, z, 2.0 * s);
}

function crates(S, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(1, 1, 1, '#9a7448', x, y + 0.5, z, 0, 0.3, 0);
  S.b.box(0.9, 0.9, 0.9, '#8a6440', x + 1.0, y + 0.45, z + 0.3, 0, -0.2, 0);
  S.b.box(0.8, 0.8, 0.8, '#a07a4c', x + 0.4, y + 1.4, z + 0.1, 0, 0.7, 0);
  S.b.cyl(0.4, 0.45, 1.0, 8, '#7a5838', x - 1.0, y + 0.5, z + 0.6);
  addCircle(x + 0.3, z + 0.2, 1.3);
}

function campfire(S, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    S.b.dodeca(0.3, '#6d6a66', x + Math.cos(a) * 0.9, y + 0.15, z + Math.sin(a) * 0.9);
  }
  S.b.box(1.2, 0.2, 0.2, '#5a3e28', x, y + 0.2, z, 0, 0.4, 0);
  S.b.box(1.2, 0.2, 0.2, '#5a3e28', x, y + 0.2, z, 0, -0.9, 0);
  S.spots.fires.push({ x, y: y + 0.3, z, s: 1 });
}

function palisade(S, st, r, gates) {
  const n = Math.round((r * Math.PI * 2) / 1.1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let skip = false;
    for (const g of gates) {
      let d = Math.abs(a - g); if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < 0.16 + 3 / r) skip = true;
    }
    if (skip) continue;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
    const h = 2.6 + (i % 3) * 0.3;
    S.b.box(0.55, h, 0.55, S.hub.faction ? '#5a4030' : '#7a5838', x, y + h / 2 - 0.2, z, 0, a, 0);
    S.b.cone(0.38, 0.6, 4, S.hub.faction ? '#4a3428' : '#6b4a2e', x, y + h + 0.1, z, 0, a, 0);
    addCircle(x, z, 0.45);
  }
  // tours de guet aux portes
  for (const g of gates) {
    for (const side of [-1, 1]) {
      const a = g + side * (0.2 + 3.4 / r);
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
      S.b.box(0.3, 4.6, 0.3, '#6b4a2e', x, y + 2.3, z);
      S.b.box(1.6, 0.2, 1.6, '#7a5838', x, y + 4.0, z);
      S.b.cone(1.3, 1.2, 4, st.roof, x, y + 5.1, z, 0, Math.PI / 4, 0);
      S.gl.box(0.3, 0.3, 0.3, st.glow, x, y + 4.4, z);
    }
  }
}

function fields(S, lx, lz, w, d, c1, c2) {
  for (let i = 0; i < Math.floor(w / 1.6); i++) {
    const x = lx - w / 2 + i * 1.6;
    for (let j = 0; j < Math.floor(d / 1.8); j++) {
      const z = lz - d / 2 + j * 1.8;
      const y = S.gy(x, z);
      S.b.box(0.9, 0.5 + ((i + j) % 2) * 0.2, 1.3, (i + j) % 3 ? c1 : c2, S.wx(x), y + 0.2, S.wz(z));
    }
  }
}

function boat(S, lx, lz) {
  const x = S.wx(lx), z = S.wz(lz);
  S.b.box(3.2, 1.4, 9, '#6b4a2e', x, 0.2, z);
  S.b.box(2.6, 0.3, 8.4, '#8a6440', x, 0.95, z);
  S.b.box(2.2, 1.2, 1.6, '#6b4a2e', x, 0.6, z + 4.6, 0.4, 0, 0);
  S.b.box(0.3, 8, 0.3, '#5a3e28', x, 4.8, z);
  S.b.box(0.12, 4.2, 3.6, '#ece6d6', x, 5.2, z + 0.2);
  S.b.box(0.14, 1.2, 1.2, '#2f5da8', x + 0.02, 5.8, z + 0.2);
}

// ---------------------------------------------------------------------------
function buildCapital(S, st) {
  const f = S.hub.faction;
  const R = S.hub.r - 7;
  // enceinte octogonale, 4 portes
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  for (let i = 0; i < 8; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % 8];
    const midA = Math.atan2(z1 + z2, x1 + x2);
    const isGate = [0, Math.PI / 2, Math.PI, -Math.PI / 2].some((g) => Math.abs(Math.atan2(Math.sin(midA - g), Math.cos(midA - g))) < 0.3);
    if (isGate) {
      // ouverture au centre du segment
      const t1 = 0.36, t2 = 0.64;
      wallSeg(S, st, x1, z1, x1 + (x2 - x1) * t1, z1 + (z2 - z1) * t1, 6.5);
      wallSeg(S, st, x1 + (x2 - x1) * t2, z1 + (z2 - z1) * t2, x2, z2, 6.5);
      // arche
      const gx = (x1 + x2) / 2, gz = (z1 + z2) / 2;
      const ry = Math.atan2(x2 - x1, z2 - z1);
      const y = S.gy(gx, gz);
      S.b.box(2.2, 1.6, (R * 2 * Math.sin(Math.PI / 8)) * 0.3, st.stone, S.wx(gx), y + 7.2, S.wz(gz), 0, ry, 0);
      banner(S, st, gx * 0.9, gz * 0.9, 7);
    } else {
      wallSeg(S, st, x1, z1, x2, z2, 6.5);
    }
  }
  for (const [x, z] of pts) tower(S, st, x, z, 2.4, 10);

  // centre
  if (f === 0) fountain(S, st, 0, 0); else anvilStatue(S, 0, 0);
  travelStone(S, st, 0, 12);

  // donjon au nord
  const keepZ = -R * 0.62;
  const k = house(S, st, 0, keepZ, 16, 10, 8, 0, { wall: st.wall2 });
  tower(S, st, -9, keepZ - 1, 2.2, 13);
  tower(S, st, 9, keepZ - 1, 2.2, 13);
  banner(S, st, -4, keepZ + 6.5, 6); banner(S, st, 4, keepZ + 6.5, 6);
  S.spots.leader = { x: k.x, z: k.z };

  // maisons en anneau (hors des rues N-S / E-O)
  const roles = ['vendor', 'smith', 'stable', 'auction', 'stash', 'trainer', 'quest', 'quest'];
  const doors = [];
  const ring = [
    [-14, -12], [14, -12], [-22, 6], [22, 6], [-14, 20], [14, 20], [-26, -8], [26, -8],
    [-28, 20], [28, 20], [-8, 30], [8, 30], [-30, -20], [30, -20],
  ];
  ring.forEach(([lx, lz], i) => {
    if (Math.hypot(lx, lz) > R - 6) return;
    const ry = Math.atan2(-lx, -lz); // porte vers le centre
    const w = 6.5 + S.rnd() * 2.5, d = 5.5 + S.rnd() * 1.5, h = 3.6 + S.rnd() * 1.8;
    doors.push(house(S, st, lx, lz, w, d, h, ry, { flat: f === 1 && i % 3 === 0 }));
  });
  doors.forEach((dr, i) => {
    const role = roles[i];
    if (!role) { S.spots.wander.push(dr); return; }
    if (role === 'quest') S.spots.quest.push(dr); else S.spots[role] = dr;
  });
  // émissaire des Huit Ordres et maître des métiers
  S.spots.order = S.spots.wander[0] || { x: S.wx(-8), z: S.wz(-4), ry: 0 };
  S.spots.profs = S.spots.wander[1] || { x: S.wx(8), z: S.wz(-4), ry: 0 };
  // étals de marché
  stall(S, st, -7, 6, 0.3, f ? '#c8321e' : '#3b6fd8');
  stall(S, st, 7, 6, -0.3, f ? '#e0a030' : '#e8e0c8');
  // lampadaires / braseros
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 16], [5, 16], [-16, 0], [16, 0], [0, -22], [0, 24], [-24, 12], [24, 12]]) {
    if (f === 0) lamp(S, st, lx, lz); else brazier(S, lx, lz);
  }
  // gardes aux portes et sur la place
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const side of [-1, 1]) {
      const r = R - 3;
      const [ox, oz] = [Math.cos(a) * r - Math.sin(a) * side * 3.2, Math.sin(a) * r + Math.cos(a) * side * 3.2];
      S.spots.guards.push({ x: S.wx(ox), z: S.wz(oz), ry: Math.atan2(Math.cos(a), Math.sin(a)) });
    }
  }
  S.spots.guards.push({ x: S.wx(-6), z: S.wz(-6), ry: 0, patrol: true }, { x: S.wx(6), z: S.wz(8), ry: 0, patrol: true });
  crates(S, -18, -2); crates(S, 18, 14); crates(S, -10, 26);
  if (f === 0) {
    // quais de Havrebleu (à l'ouest)
    const px = -R - 4;
    for (let i = 0; i < 6; i++) S.b.box(4, 0.4, 3.2, '#8a6440', S.wx(px - i * 3.6), 0.6, S.wz(0));
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) S.b.box(0.4, 3, 0.4, '#5a3e28', S.wx(px - i * 3.6), -0.6, S.wz(s * 1.6));
    boat(S, px - 14, 9);
  } else {
    // forges de Forge-Cendre
    brazier(S, -12, -24, true); brazier(S, 12, -24, true);
  }
}

function buildVillage(S, st) {
  const f = S.hub.faction;
  well(S, 0, 0);
  travelStone(S, st, 5, 5);
  const spots = [[-11, -6], [11, -7], [-10, 10], [12, 9], [0, -14], [-3, 16]];
  const doors = spots.map(([lx, lz]) => house(S, st, lx, lz, 6 + S.rnd() * 2, 5 + S.rnd(), 3.4 + S.rnd(), Math.atan2(-lx, -lz), { flat: f === 1 }));
  S.spots.quest.push(doors[0], doors[1]);
  S.spots.vendor = doors[2];
  S.spots.wander.push(doors[3], doors[4]);
  S.spots.guards.push({ x: S.wx(0), z: S.wz(-22), ry: Math.PI }, { x: S.wx(0), z: S.wz(22), ry: 0 });
  for (const [lx, lz] of [[-5, 5], [6, -5], [0, 20]]) (f ? brazier(S, lx, lz) : lamp(S, st, lx, lz));
  banner(S, st, 3, -4, 5);
  if (f === 0) { fields(S, 26, -4, 12, 14, '#d9b64a', '#8cbf5e'); fields(S, -27, 18, 10, 10, '#c9a43a', '#7cb95a'); }
  else { fields(S, 26, 6, 10, 12, '#8a6a3a', '#a8543a'); }
  crates(S, 8, 14);
}

function buildOutpost(S, st) {
  const r = S.hub.r - 5;
  palisade(S, st, r, [0, Math.PI]);
  campfire(S, 0, 0);
  travelStone(S, st, -6, -6);
  tent(S, st, 7, -6, 1);
  tent(S, st, -8, 6, 0.9, S.hub.faction ? '#6a2a1a' : '#e8e0c8');
  tent(S, st, 6, 8, 1.1);
  banner(S, st, 0, -8, 6);
  crates(S, -3, 10);
  S.spots.quest.push({ x: S.wx(3), z: S.wz(-3), ry: Math.PI }, { x: S.wx(-4), z: S.wz(2), ry: 0 });
  S.spots.vendor = { x: S.wx(4), z: S.wz(4), ry: 0 };
  S.spots.order = { x: S.wx(-7), z: S.wz(-1), ry: Math.atan2(7, 1) - Math.PI };
  S.spots.guards.push({ x: S.wx(r + 1.5), z: S.wz(-3.5), ry: -Math.PI / 2 }, { x: S.wx(-r - 1.5), z: S.wz(3.5), ry: Math.PI / 2 });
}

// ---------------------------------------------------------------------------
// Sanctuaire d'un Ordre (une classe) : autel du Sceau, bannières de l'Ordre et décor propre à la classe
function orderBanner(S, lx, lz, col, fac) {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(0.2, 5.2, 0.2, '#3a3430', x, y + 2.6, z);
  S.b.box(1.2, 2.4, 0.08, col, x + 0.7, y + 3.8, z);
  S.b.box(1.2, 0.3, 0.1, fac, x + 0.7, y + 4.95, z);
  S.b.box(0.46, 0.46, 0.1, '#e8e0c8', x + 0.7, y + 3.9, z + 0.02, 0, 0, Math.PI / 4);
}
function menhir(S, lx, lz, h, c = '#8a8a90') {
  const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
  S.b.box(0.9, h, 0.7, c, x, y + h / 2 - 0.2, z, 0, S.rnd() * 3, 0.06);
  addCircle(x, z, 0.6);
}
function buildSanctuary(S, st) {
  const hub = S.hub, f = hub.faction, cls = hub.cls;
  const col = CLASSES[cls]?.color || '#b58cff';
  const fac = f ? '#c8321e' : '#3b6fd8';
  const y0 = S.gy(0, 0);
  // parvis et autel du Sceau
  S.b.cyl(6.5, 7, 0.4, 12, f ? '#6a5a50' : '#b9b3a5', S.wx(0), y0 + 0.1, S.wz(0));
  S.b.cyl(1.4, 1.8, 1.2, 8, '#6d6a78', S.wx(0), y0 + 0.8, S.wz(0));
  S.b.box(0.7, 1.4, 0.7, '#5d5a68', S.wx(0), y0 + 2.0, S.wz(0), 0, Math.PI / 4, 0);
  S.gl.octa(0.7, col, S.wx(0), y0 + 3.6, S.wz(0), 1, 1.7, 1);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; S.gl.box(0.2, 0.2, 0.2, col, S.wx(Math.cos(a) * 2.2), y0 + 1.5, S.wz(Math.sin(a) * 2.2)); }
  addCircle(S.wx(0), S.wz(0), 1.9);
  orderBanner(S, -4, -7, col, fac); orderBanner(S, 4, -7, col, fac);
  travelStone(S, st, -9, 8);
  S.spots.mentor = { x: S.wx(0), z: S.wz(3.6), ry: Math.PI };
  S.spots.second = { x: S.wx(6.5), z: S.wz(3.5), ry: Math.atan2(-6.5, -3.5) - Math.PI };
  if (f) { brazier(S, -6, -3); brazier(S, 6, -3); } else { lamp(S, st, -6, -3); lamp(S, st, 6, -3); }
  crates(S, 9, 7);
  const r = S.rnd;
  switch (cls) {
    case 'guerrier': {
      for (const [lx, lz] of [[9, -5], [11, -1], [-10, -3]]) {
        const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
        S.b.box(0.25, 1.9, 0.25, '#6b4a2e', x, y + 0.95, z); S.b.box(1.4, 0.2, 0.2, '#6b4a2e', x, y + 1.5, z);
        S.b.box(0.6, 0.8, 0.45, '#c8b088', x, y + 1.6, z); S.b.box(0.42, 0.42, 0.42, '#c8b088', x, y + 2.25, z); addCircle(x, z, 0.5);
      }
      const x = S.wx(-11), z = S.wz(2), y = S.gy(-11, 2);
      S.b.box(3, 0.2, 0.3, '#5a3e28', x, y + 1.8, z); for (let i = 0; i < 3; i++) S.b.box(0.08, 1.6, 0.12, '#c9ced6', x - 1 + i, y + 1.0, z + 0.2, 0.15, 0, 0);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; S.b.dodeca(0.4, '#8a8578', S.wx(Math.cos(a) * 12.5), S.gy(Math.cos(a) * 12.5, Math.sin(a) * 12.5) + 0.2, S.wz(Math.sin(a) * 12.5)); }
      break;
    }
    case 'templier': {
      house(S, st, -10, -5, 6, 5, 4.2, Math.atan2(10, 5), { wall: '#e8e2d4' });
      const x = S.wx(10), z = S.wz(-5), y = S.gy(10, -5);
      S.b.cyl(1.2, 1.4, 1, 8, '#d8d0bc', x, y + 0.5, z); S.b.box(0.8, 2.2, 0.6, '#e8e2d4', x, y + 2.1, z); S.b.box(0.5, 0.5, 0.5, '#e8e2d4', x, y + 3.5, z);
      S.gl.cyl(0.9, 0.9, 0.08, 12, '#ffe68a', x, y + 4.2, z - 0.3, Math.PI / 2, 0, 0); addCircle(x, z, 1.4);
      break;
    }
    case 'mage': {
      tower(S, { ...st, roof: '#3a3a8a', wall2: '#8a86a8' }, -10, -6, 2.3, 13);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; S.gl.octa(0.35, i % 2 ? '#b8a8ff' : '#7fd1ff', S.wx(Math.cos(a) * 4.2), y0 + 4 + (i % 3) * 0.8, S.wz(Math.sin(a) * 4.2), 1, 1.8, 1); }
      const x = S.wx(10), z = S.wz(-5), y = S.gy(10, -5);
      S.b.box(0.3, 2.2, 0.3, '#5a4a3a', x, y + 1.1, z); S.b.cyl(0.35, 0.25, 2.4, 8, '#c9a441', x + 0.4, y + 2.6, z, 0, 0, -0.9); addCircle(x, z, 0.6);
      break;
    }
    case 'necro': {
      for (let i = 0; i < 9; i++) { const lx = -12 + (i % 3) * 2.6 + r() * 0.6, lz = -8 + Math.floor(i / 3) * 3 + r() * 0.6; S.b.box(0.9, 1.1 + r() * 0.5, 0.25, '#7a7a80', S.wx(lx), S.gy(lx, lz) + 0.5, S.wz(lz), r() * 0.2 - 0.1, 0.2, r() * 0.2 - 0.1); }
      const x = S.wx(10), z = S.wz(-6), y = S.gy(10, -6);
      S.b.box(1.4, 8, 1.4, '#2a2830', x, y + 4, z, 0, Math.PI / 4, 0); S.b.cone(1.1, 1.6, 4, '#2a2830', x, y + 8.8, z, 0, Math.PI / 4, 0);
      S.gl.box(0.25, 2.5, 0.05, '#b58cff', x, y + 4.5, z + 0.72); addCircle(x, z, 1.2);
      break;
    }
    case 'archer': {
      tent(S, st, -10, -5, 1.1, '#5a6a3a');
      for (const [lx, lz] of [[10, -6], [12, -1]]) {
        const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
        S.b.box(0.2, 1.8, 0.2, '#6b4a2e', x, y + 0.9, z);
        S.b.cyl(0.9, 0.9, 0.15, 12, '#efe6d0', x, y + 1.8, z, Math.PI / 2, 0, 0); S.b.cyl(0.6, 0.6, 0.17, 12, '#c83a2a', x, y + 1.8, z, Math.PI / 2, 0, 0); S.b.cyl(0.25, 0.25, 0.19, 12, '#efe6d0', x, y + 1.8, z, Math.PI / 2, 0, 0);
        addCircle(x, z, 0.6);
      }
      const x = S.wx(-11), z = S.wz(2), y = S.gy(-11, 2);
      S.b.box(2.6, 0.15, 0.15, '#6b4a2e', x, y + 2, z); S.b.box(1.2, 1.4, 0.05, '#9a7448', x - 0.6, y + 1.3, z); S.b.box(1, 1.2, 0.05, '#7a5838', x + 0.7, y + 1.4, z);
      break;
    }
    case 'assassin': {
      tent(S, st, -10, -4, 1, '#2a2226'); tent(S, st, 10, -7, 0.9, '#3a1a1a');
      const x = S.wx(-11), z = S.wz(3), y = S.gy(-11, 3);
      S.b.cyl(0.9, 1.1, 0.6, 8, '#3a3438', x, y + 0.3, z); S.b.box(0.8, 2.2, 0.6, '#2a2226', x, y + 1.7, z); S.b.cone(0.55, 0.9, 6, '#2a2226', x, y + 3.2, z);
      S.gl.box(0.3, 0.06, 0.05, '#e05a78', x, y + 2.95, z + 0.32); addCircle(x, z, 1);
      break;
    }
    case 'druide': {
      const x = S.wx(-10), z = S.wz(-6), y = S.gy(-10, -6);
      S.b.cyl(1.1, 1.5, 8, 8, '#5a4030', x, y + 4, z);
      S.b.ico(4.2, '#3f8a3a', x, y + 9.5, z, 1, 0.8, 1, 1); S.b.ico(3, '#4fa04a', x + 2.5, y + 8, z + 1.5, 1, 0.8, 1, 1); S.b.ico(2.8, '#3a7a3a', x - 2.2, y + 8.2, z - 1.2, 1, 0.8, 1, 1);
      for (let i = 0; i < 8; i++) S.gl.box(0.18, 0.18, 0.18, '#fff4a0', x + Math.cos(i) * 3.5, y + 8 + (i % 3), z + Math.sin(i) * 3.5);
      addCircle(x, z, 1.6);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; menhir(S, Math.cos(a) * 10.5, Math.sin(a) * 10.5, 2.4 + (i % 2) * 0.8, '#8a8a88'); }
      break;
    }
    case 'chaman': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4, lx = Math.cos(a) * 10, lz = Math.sin(a) * 10;
        const x = S.wx(lx), z = S.wz(lz), y = S.gy(lx, lz);
        S.b.box(0.5, 3.6, 0.5, '#6b4a2e', x, y + 1.8, z); S.b.box(0.8, 0.7, 0.8, ['#c83a2a', '#2ab5ff', '#6ab04a', '#e0c040'][i], x, y + 3.2, z);
        S.b.box(1.4, 0.15, 0.3, '#c9b28a', x, y + 2.6, z); S.gl.box(0.15, 0.15, 0.05, '#ffe68a', x + 0.2, y + 3.3, z + 0.41); S.gl.box(0.15, 0.15, 0.05, '#ffe68a', x - 0.2, y + 3.3, z + 0.41);
        addCircle(x, z, 0.5);
      }
      brazier(S, 10, -5, true);
      const x = S.wx(-10), z = S.wz(-5), y = S.gy(-10, -5);
      S.b.cyl(1, 1, 1.2, 10, '#8a6440', x, y + 0.6, z); S.b.cyl(1.05, 1.05, 0.1, 10, '#e8dcc0', x, y + 1.25, z); addCircle(x, z, 1.1);
      break;
    }
  }
}

export function buildTowns(scene) {
  const all = {};
  const group = new THREE.Group();
  group.name = 'towns';
  for (const hub of HUBS) {
    const biome=ZONE_BY_ID[hub.zone]?.biome;
    const kit={forest:{wall:'#acaa8c',roof:'#465849',trim:'#514631'},swamp:{wall:'#7d8064',roof:'#5d6549'},snow:{wall:'#aeb7bd',roof:'#b8c6ce',stone:'#7e8b96'},volcanic:{wall:'#655458',roof:'#4c4349',stone:'#51464b'},storm:{wall:'#a3acaf',roof:'#576975'},canyon:{wall:'#a07b62',roof:'#755346'},ruins:{wall:'#b2ab96',roof:'#667074'}};
    const st = {...STYLE[hub.faction],...(kit[biome]||{})};
    const S = new Site(hub);
    if (hub.type === 'capital') buildCapital(S, st);
    else if (hub.type === 'village') buildVillage(S, st);
    else if (hub.type === 'sanctuary') buildSanctuary(S, st);
    else buildOutpost(S, st);
    all[hub.id] = S.spots;
    const mesh = new THREE.Mesh(S.b.build(), vcMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'town_' + hub.id;
    group.add(mesh);
    if (!S.gl.empty) {
      const glow = new THREE.Mesh(S.gl.build(), vcGlowMaterial());
      glow.name = 'glow_' + hub.id;
      group.add(glow);
    }
  }
  scene.add(group);
  return { group, spots: all };
}
