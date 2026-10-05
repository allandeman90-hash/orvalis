// Donjons procéduraux : salles reliées par des couloirs (tracé en serpent sur une grille de cases),
// grille de marche au mètre, hauteurs de sol (rampes entre salles), maillages et décors par thème.
// Tout est déterministe à partir d'une graine : deux joueurs d'un même groupe obtiennent le même donjon.
import * as THREE from 'three';
import { texturizeProps } from '../engine/textures.js';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';
import { mulberry32 } from '../core/rng.js';
import { addBox, addCircle, beginTemp, endTemp, clearTemp } from './collide.js';
import { clamp, lerp } from '../core/util.js';

export const OX = 6000, OZ = 0; // origine de l'espace des donjons (loin à l'est du monde)
const N = 600; // cases (1 m) par côté
const X0 = OX - N / 2, Z0 = OZ - N / 2;

// 0 : vide, 1 : sol, 3 : lave (praticable mais brûlante), 4 : barrière temporaire
export const THEMES = {
  mine: {
    floor: ['#5a4a3e', '#63523f', '#544536', '#6a5846'], wall: ['#4a3a30', '#553f33', '#3e3028', '#5e4a3a'], trim: '#2e241e', wallH: 4.4,
    accent: '#c8872e', glow: '#ffb050', props: 'mine', lavaFloor: false,
  },
  swamp: {
    floor: ['#3e4a38', '#46523e', '#384432', '#4e5a44'], wall: ['#4e5a4a', '#56624e', '#44503f', '#5e6a54'], trim: '#2a3326', wallH: 4.6,
    accent: '#6aa05a', glow: '#b8ff90', props: 'swamp',
  },
  crypt: {
    floor: ['#4a4652', '#524e5a', '#44404c', '#585462'], wall: ['#5a5664', '#625e6c', '#524e5c', '#6a6674'], trim: '#2e2a36', wallH: 4.8,
    accent: '#8f7bff', glow: '#b8a8ff', props: 'crypt',
  },
  ice: {
    floor: ['#b8c8d8', '#c4d4e2', '#aabbcc', '#d0dde8'], wall: ['#8aa4bc', '#96b0c8', '#7e98b0', '#a2bcd2'], trim: '#e8f2fa', wallH: 4.6,
    accent: '#7fd1ff', glow: '#bff0ff', props: 'ice',
  },
  fire: {
    floor: ['#3a2a26', '#42302a', '#342420', '#4a3630'], wall: ['#2a2226', '#32282c', '#241e22', '#3a2e32'], trim: '#1a1214', wallH: 4.6,
    accent: '#ff7a2a', glow: '#ffb040', props: 'fire', lava: true,
  },
  sky: {
    floor: ['#d8d2c4', '#e2dccf', '#cec8ba', '#ebe4d6'], wall: ['#c8c0ae', '#d2cab8', '#bcb4a2', '#ddd4c2'], trim: '#d9a441', wallH: 1.3,
    accent: '#7fb8ff', glow: '#dff0ff', props: 'sky', open: true,
  },
  abyss: {
    floor: ['#2a2024', '#32262a', '#261c20', '#3a2c30'], wall: ['#1e181c', '#262024', '#1a1418', '#2e2428'], trim: '#6a1e14', wallH: 5.2,
    accent: '#ff5a2a', glow: '#ff8a40', props: 'fire', lava: true,
  },
  void: {
    floor: ['#2e2840', '#342e48', '#2a243a', '#3a3450'], wall: ['#3e3656', '#463e60', '#383050', '#4e466a'], trim: '#1a1428', wallH: 4.6,
    accent: '#b58cff', glow: '#e0c8ff', props: 'void',
  },
};

// ---------------------------------------------------------------------------
// Grille
function makeGrid() {
  return { walk: new Uint8Array(N * N), h: new Float32Array(N * N), room: new Int16Array(N * N).fill(-1) };
}
const idx = (i, j) => j * N + i;
const toI = (x) => Math.floor(x - X0), toJ = (z) => Math.floor(z - Z0);

// ---------------------------------------------------------------------------
// Tracé : serpent de salles sur des cases de SLOT m
function planRooms(rnd, seq, slot, bossHalf) {
  const maxS = Math.floor((N / 2 - 30) / slot);
  for (let attempt = 0; attempt < 60; attempt++) {
    const path = [[0, 0]];
    const seen = new Set(['0,0']);
    let dir = [1, 0];
    let ok = true;
    for (let k = 1; k < seq.length; k++) {
      const [cx, cz] = path[path.length - 1];
      const dirs = [[1, 0], [0, 1], [0, -1], [-1, 0]];
      const cands = dirs.filter(([dx, dz]) => !seen.has(`${cx + dx},${cz + dz}`) && Math.abs(cx + dx) <= maxS && Math.abs(cz + dz) <= maxS);
      if (!cands.length) { ok = false; break; }
      let nd = cands.find((d) => d[0] === dir[0] && d[1] === dir[1]);
      if (!nd || rnd() < 0.45) nd = cands[Math.floor(rnd() * cands.length)];
      // éviter les impasses : on préfère une case qui garde des voisins libres
      const free = (x, z) => [[1, 0], [0, 1], [0, -1], [-1, 0]].filter(([a, b]) => !seen.has(`${x + a},${z + b}`) && Math.abs(x + a) <= maxS && Math.abs(z + b) <= maxS).length;
      if (free(cx + nd[0], cz + nd[1]) === 0 && k < seq.length - 1) { const alt = cands.find((d) => free(cx + d[0], cz + d[1]) > 0); if (alt) nd = alt; }
      dir = nd;
      path.push([cx + nd[0], cz + nd[1]]);
      seen.add(`${cx + nd[0]},${cz + nd[1]}`);
    }
    if (!ok) continue;
    return path.map(([sx, sz], k) => {
      const kind = seq[k];
      const half = kind === 'boss' ? bossHalf : kind === 'entry' ? 8 : kind === 'exit' ? 9 : 9 + Math.floor(rnd() * 5);
      const hw = kind === 'boss' ? half : half + Math.floor(rnd() * 3) - 1;
      const hd = kind === 'boss' ? half : half + Math.floor(rnd() * 3) - 1;
      const j = Math.max(0, slot / 2 - Math.max(hw, hd) - 6);
      return { kind, sx, sz, x: OX + sx * slot + (rnd() - 0.5) * 2 * j, z: OZ + sz * slot + (rnd() - 0.5) * 2 * j, hw, hd, round: kind === 'boss' && rnd() < 0.5 };
    });
  }
  throw new Error('plan de donjon impossible');
}

// ---------------------------------------------------------------------------
export function buildDungeon(def, o = {}) {
  const rnd = mulberry32(o.seed >>> 0 || 1);
  const theme = THEMES[o.theme || def.theme] || THEMES.crypt;
  const raid = def.kind === 'raid';
  const seq = o.seq || def.layout;
  const slot = raid ? 86 : 66;
  const bossHalf = raid ? 24 : 17;
  const rooms = planRooms(rnd, seq, slot, bossHalf);
  const G = makeGrid();
  // hauteurs de sol : on descend dans les profondeurs (ou on monte vers le ciel)
  const dirH = theme.props === 'sky' ? 1 : -1;
  rooms.forEach((r, k) => { r.h = k === 0 ? 0 : rooms[k - 1].h + dirH * (rnd() * 2.2) * (rnd() < 0.3 ? 0 : 1); r.i = k; });
  // couloirs (tracé en Z entre les centres)
  const cw = raid ? 3.4 : 2.7;
  const corridors = [];
  for (let k = 0; k < rooms.length - 1; k++) {
    const A = rooms[k], B = rooms[k + 1];
    const pts = [];
    if (A.sx !== B.sx) { const mx = (A.x + B.x) / 2 + (rnd() - 0.5) * 8; pts.push({ x: A.x, z: A.z }, { x: mx, z: A.z }, { x: mx, z: B.z }, { x: B.x, z: B.z }); }
    else { const mz = (A.z + B.z) / 2 + (rnd() - 0.5) * 8; pts.push({ x: A.x, z: A.z }, { x: A.x, z: mz }, { x: B.x, z: mz }, { x: B.x, z: B.z }); }
    corridors.push({ a: k, b: k + 1, pts, w: cw });
  }
  // --- rasterisation : couloirs puis salles
  const inRoom = (r, x, z) => r.round ? Math.hypot(x - r.x, z - r.z) <= r.hw : Math.abs(x - r.x) <= r.hw && Math.abs(z - r.z) <= r.hd;
  for (const c of corridors) {
    const A = rooms[c.a], B = rooms[c.b];
    let L = 0;
    const segL = [];
    for (let i = 0; i < c.pts.length - 1; i++) { const l = Math.hypot(c.pts[i + 1].x - c.pts[i].x, c.pts[i + 1].z - c.pts[i].z); segL.push(l); L += l; }
    // abscisses de sortie de A et d'entrée de B
    let sa = 0, sb = L;
    { let acc = 0; for (let i = 0; i < c.pts.length - 1; i++) { const p0 = c.pts[i], p1 = c.pts[i + 1]; for (let t = 0; t <= 1; t += 0.02) { const x = lerp(p0.x, p1.x, t), z = lerp(p0.z, p1.z, t); const s = acc + segL[i] * t; if (inRoom(A, x, z)) sa = Math.max(sa, s); } acc += segL[i]; } }
    { let acc = 0; for (let i = 0; i < c.pts.length - 1; i++) { const p0 = c.pts[i], p1 = c.pts[i + 1]; for (let t = 0; t <= 1; t += 0.02) { const x = lerp(p0.x, p1.x, t), z = lerp(p0.z, p1.z, t); const s = acc + segL[i] * t; if (inRoom(B, x, z) && s < sb && s > sa) sb = s; } acc += segL[i]; } }
    let acc = 0;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const p0 = c.pts[i], p1 = c.pts[i + 1], l = segL[i];
      const minx = Math.min(p0.x, p1.x) - c.w - 1, maxx = Math.max(p0.x, p1.x) + c.w + 1;
      const minz = Math.min(p0.z, p1.z) - c.w - 1, maxz = Math.max(p0.z, p1.z) + c.w + 1;
      for (let j = toJ(minz); j <= toJ(maxz); j++) for (let ii = toI(minx); ii <= toI(maxx); ii++) {
        if (ii < 1 || j < 1 || ii >= N - 1 || j >= N - 1) continue;
        const x = X0 + ii + 0.5, z = Z0 + j + 0.5;
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const t = clamp(((x - p0.x) * dx + (z - p0.z) * dz) / (l * l || 1), 0, 1);
        const px = p0.x + dx * t, pz = p0.z + dz * t;
        if (Math.hypot(x - px, z - pz) > c.w) continue;
        const s = acc + l * t;
        const k = clamp((s - sa) / Math.max(1, sb - sa), 0, 1);
        const id = idx(ii, j);
        const hh = lerp(A.h, B.h, k * k * (3 - 2 * k));
        if (G.walk[id] && G.room[id] === -2) G.h[id] = Math.min(G.h[id], hh);
        else if (!G.walk[id]) { G.walk[id] = 1; G.h[id] = hh; G.room[id] = -2; }
      }
      acc += l;
    }
  }
  for (const r of rooms) {
    const ext = Math.max(r.hw, r.hd) + 1;
    for (let j = toJ(r.z - ext); j <= toJ(r.z + ext); j++) for (let ii = toI(r.x - ext); ii <= toI(r.x + ext); ii++) {
      const x = X0 + ii + 0.5, z = Z0 + j + 0.5;
      if (!inRoom(r, x, z)) continue;
      const id = idx(ii, j);
      G.walk[id] = 1; G.h[id] = r.h; G.room[id] = r.i;
    }
  }
  // lave (thèmes de feu) : rigoles le long de certaines salles, jamais sur le passage central
  if (theme.lava) {
    for (const r of rooms) {
      if (r.kind === 'entry' || r.kind === 'boss' || r.round || rnd() < 0.4) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      for (let j = toJ(r.z - r.hd + 2); j <= toJ(r.z + r.hd - 2); j++) for (let ii = toI(r.x - r.hw + 1); ii <= toI(r.x + r.hw - 1); ii++) {
        const x = X0 + ii + 0.5, z = Z0 + j + 0.5;
        const band = side * (x - r.x);
        if (band > r.hw - 4.5 && band < r.hw - 1.5 && Math.abs(z - r.z) < r.hd - 3) { const id = idx(ii, j); if (G.walk[id] === 1 && G.room[id] === r.i) G.walk[id] = 3; }
      }
    }
  }
  // hauteurs des cases vides : celle du sol voisin (pour les murs et l'interpolation)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const id = idx(i, j);
      if (G.walk[id]) continue;
      let s = 0, n = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = idx(i + a, j + b); if (G.walk[k] || G.room[k] === -3) { s += G.h[k]; n++; } }
      if (n) { G.h[id] = s / n; if (pass === 0) G.room[id] = -3; }
    }
  }
  // au-delà : hauteur du sol le plus proche (parcours en largeur), pour que la caméra ne saute jamais au-dessus des murs
  {
    const seen = new Uint8Array(N * N), queue = new Int32Array(N * N);
    let qh = 0, qt = 0;
    for (let id = 0; id < N * N; id++) if (G.walk[id] || G.room[id] === -3) { seen[id] = 1; queue[qt++] = id; }
    while (qh < qt) {
      const id = queue[qh++];
      const i = id % N, j = (id - i) / N;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + a, nj = j + b;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const k = idx(ni, nj);
        if (seen[k]) continue;
        seen[k] = 1; G.h[k] = G.h[id]; queue[qt++] = k;
      }
    }
  }

  // --- maillages
  const group = new THREE.Group();
  const mats = [];
  const vcMat = texturizeProps(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false }));
  mats.push(vcMat);
  const floorGeo = buildFloor(G, theme, rnd);
  const floor = new THREE.Mesh(floorGeo, vcMat);
  floor.receiveShadow = true;
  group.add(floor);
  const wb = new GeoBuilder(), gb = new GeoBuilder();
  beginTemp();
  const colliders = buildWalls(G, theme, wb, rnd);
  buildProps(G, rooms, corridors, theme, wb, gb, rnd, def);
  endTemp();
  const walls = new THREE.Mesh(wb.build(), vcMat);
  walls.castShadow = true; walls.receiveShadow = true;
  group.add(walls);
  if (!gb.empty) group.add(new THREE.Mesh(gb.build(), vcGlowMaterial()));
  // lave : surface lumineuse
  if (theme.lava) {
    const lg = buildLava(G);
    if (lg) { const lm = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xff6a1a })); lm.userData.lava = true; group.add(lm); mats.push(lm.material); }
  }
  // ciel ouvert : mer de nuages sous les plateformes
  if (theme.open) {
    const cg = new THREE.PlaneGeometry(1400, 1400);
    cg.rotateX(-Math.PI / 2);
    const cm = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.85, fog: true }));
    cm.position.set(OX, Math.min(...rooms.map((r) => r.h)) - 60, OZ);
    group.add(cm);
    mats.push(cm.material);
  }

  // --- carte
  const map = drawMap(G, rooms, theme);

  // --- points utiles
  const entry = { x: rooms[0].x, z: rooms[0].z };
  return {
    G, rooms, corridors, group, colliders, map, entry, theme,
    x0: X0, z0: Z0, size: N,
    dispose() {
      group.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
      for (const m of mats) m.dispose();
      clearTemp();
    },
  };
}

// ---------------------------------------------------------------------------
// Accès à la grille (région extérieure du terrain)
export function gridHeight(D, x, z) {
  const G = D.G;
  const fx = x - X0 - 0.5, fz = z - Z0 - 0.5;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
  const u = fx - i, v = fz - j;
  const h00 = G.h[idx(i, j)], h10 = G.h[idx(i + 1, j)], h01 = G.h[idx(i, j + 1)], h11 = G.h[idx(i + 1, j + 1)];
  return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
}
export function gridWalk(D, x, z) {
  const i = toI(x), j = toJ(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return false;
  const w = D.G.walk[idx(i, j)];
  return w === 1 || w === 3;
}
export function gridLava(D, x, z) {
  const i = toI(x), j = toJ(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return false;
  return D.G.walk[idx(i, j)] === 3;
}
export function roomAt(D, x, z) {
  const i = toI(x), j = toJ(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return D.G.room[idx(i, j)];
}
// ligne de vue sur la grille (pas de mur entre a et b)
export function gridLos(D, ax, az, bx, bz, pad = 0) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 0.5);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (!gridWalk(D, x, z)) return false;
    if (pad) {
      const ox = -(bz - az) / (d || 1) * pad, oz = (bx - ax) / (d || 1) * pad;
      if (!gridWalk(D, x + ox, z + oz) || !gridWalk(D, x - ox, z - oz)) return false;
    }
  }
  return true;
}
// cases de passage d'une salle (anneau extérieur praticable) : utilisées pour les barrières de boss
export function roomDoorCells(D, r) {
  const out = [];
  const G = D.G;
  const ext = Math.max(r.hw, r.hd) + 3;
  for (let j = toJ(r.z - ext); j <= toJ(r.z + ext); j++) for (let i = toI(r.x - ext); i <= toI(r.x + ext); i++) {
    const id = idx(i, j);
    if (G.walk[id] !== 1 || G.room[id] !== -2) continue;
    const x = X0 + i + 0.5, z = Z0 + j + 0.5;
    const dd = r.round ? Math.hypot(x - r.x, z - r.z) - r.hw : Math.max(Math.abs(x - r.x) - r.hw, Math.abs(z - r.z) - r.hd);
    if (dd > 0.2 && dd < 2.4) out.push(id);
  }
  return out;
}
export function cellCenter(id) { return { x: X0 + (id % N) + 0.5, z: Z0 + Math.floor(id / N) + 0.5 }; }

// ---------------------------------------------------------------------------
// Recherche de chemin A* (cases de 2 m, préférence pour le milieu des couloirs)
// grille grossière (cases de 2 m) mise en cache : 0 bloquée, 1 libre, 2 lave ; near = murs voisins
export function invalidateNav(D) { D.nav = null; }
function navGrid(D) {
  if (D.nav) return D.nav;
  const G = D.G, M = N / 2;
  const cw = new Uint8Array(M * M), near = new Uint8Array(M * M);
  for (let cj = 0; cj < M; cj++) for (let ci = 0; ci < M; ci++) {
    // case praticable si au moins 3 des 4 sous-cases le sont
    let n = 0, lava = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const w = G.walk[idx(ci * 2 + a, cj * 2 + b)]; if (w === 1 || w === 3) n++; if (w === 3) lava++; }
    cw[cj * M + ci] = n >= 3 ? (lava ? 2 : 1) : 0;
  }
  for (let cj = 1; cj < M - 1; cj++) for (let ci = 1; ci < M - 1; ci++) {
    const k = cj * M + ci;
    if (!cw[k]) continue;
    near[k] = (!cw[k + 1]) + (!cw[k - 1]) + (!cw[k + M]) + (!cw[k - M]);
  }
  D.nav = { cw, near, M };
  return D.nav;
}
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
export function findPath(D, ax, az, bx, bz, maxNodes = 5000) {
  const S = 2;
  const { cw, near, M } = navGrid(D);
  const si = Math.floor((ax - X0) / S), sj = Math.floor((az - Z0) / S);
  let ti = Math.floor((bx - X0) / S), tj = Math.floor((bz - Z0) / S);
  if (si < 1 || sj < 1 || ti < 1 || tj < 1 || si >= M - 1 || ti >= M - 1 || sj >= M - 1 || tj >= M - 1) return null;
  // cible dans un mur (bord de salle) : case libre voisine
  if (!cw[tj * M + ti]) {
    let best = null, bd = 9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const k = (tj + b) * M + ti + a; if (cw[k] && Math.abs(a) + Math.abs(b) < bd) { bd = Math.abs(a) + Math.abs(b); best = [ti + a, tj + b]; } }
    if (!best) return null;
    [ti, tj] = best;
  }
  const key = (i, j) => j * M + i;
  const gS = new Map(), came = new Map();
  const open = [[0, si, sj]];
  gS.set(key(si, sj), 0);
  const hf = (i, j) => Math.hypot(i - ti, j - tj);
  let found = false, nodes = 0;
  const push = (it) => { open.push(it); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0]; const last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
  while (open.length && nodes++ < maxNodes) {
    const [, i, j] = pop();
    if (i === ti && j === tj) { found = true; break; }
    const k0 = key(i, j);
    const g0 = gS.get(k0);
    for (const [a, b, c] of NB) {
      const ni = i + a, nj = j + b;
      if (ni < 1 || nj < 1 || ni >= M - 1 || nj >= M - 1) continue;
      const k = key(ni, nj);
      const w = cw[k];
      if (!w) continue;
      if (a && b && (!cw[key(i + a, j)] || !cw[key(i, j + b)])) continue;
      // pénalité près des murs et sur la lave
      const ng = g0 + c + near[k] * 0.6 + (w === 2 ? 6 : 0);
      if (ng < (gS.get(k) ?? 1e9)) { gS.set(k, ng); came.set(k, k0); push([ng + hf(ni, nj), ni, nj]); }
    }
  }
  if (!found) return null;
  const pts = [];
  let k = key(ti, tj);
  while (k !== key(si, sj)) { const i = k % M, j = Math.floor(k / M); pts.push({ x: X0 + i * S + 1, z: Z0 + j * S + 1 }); k = came.get(k); if (k === undefined) break; }
  pts.reverse();
  // lissage : on saute les points visibles
  const out = [];
  let cx = ax, cz = az, i = 0;
  while (i < pts.length) {
    let far = i;
    for (let k2 = pts.length - 1; k2 > i; k2--) if (gridLos(D, cx, cz, pts[k2].x, pts[k2].z, 0.6)) { far = k2; break; }
    out.push(pts[far]);
    cx = pts[far].x; cz = pts[far].z;
    i = far + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sol : un quadrilatère par case, hauteurs aux sommets moyennées, dalles colorées
function buildFloor(G, theme, rnd) {
  const pos = [], col = [];
  const c = new THREE.Color();
  const pal = theme.floor.map((h) => new THREE.Color(h));
  const vh = (i, j) => {
    let s = 0, n = 0;
    for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const id = idx(i + a, j + b); if (G.walk[id]) { s += G.h[id]; n++; } }
    return n ? s / n : G.h[idx(i, j)];
  };
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const id = idx(i, j);
    const w = G.walk[id];
    if (!w || w === 3) continue;
    const x0 = X0 + i, z0 = Z0 + j;
    const h00 = vh(i, j), h10 = vh(i + 1, j), h01 = vh(i, j + 1), h11 = vh(i + 1, j + 1);
    // dalles de 2 m, bords assombris près des murs
    const tile = ((Math.floor(i / 2) * 73856093) ^ (Math.floor(j / 2) * 19349663)) >>> 0;
    c.copy(pal[tile % pal.length]);
    let near = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!G.walk[idx(i + a, j + b)]) near++;
    c.multiplyScalar((near ? 0.72 : 1) * (0.94 + ((tile >> 8) % 12) / 100));
    if (G.room[id] === -2) c.multiplyScalar(0.9);
    const quad = [[x0, h00, z0], [x0, h01, z0 + 1], [x0 + 1, h10, z0], [x0 + 1, h10, z0], [x0, h01, z0 + 1], [x0 + 1, h11, z0 + 1]];
    for (const [x, y, z] of quad) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function buildLava(G) {
  const pos = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const id = idx(i, j);
    if (G.walk[id] !== 3) continue;
    const x0 = X0 + i, z0 = Z0 + j, y = G.h[id] - 0.12;
    pos.push(x0, y, z0, x0, y, z0 + 1, x0 + 1, y, z0, x0 + 1, y, z0, x0, y, z0 + 1, x0 + 1, y, z0 + 1);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Murs : faces entre sol et vide fusionnées en segments, blocs de pierre de 2 à 4 m
function buildWalls(G, theme, b, rnd) {
  const colliders = [];
  const H = theme.wallH;
  const pal = theme.wall;
  const solid = (i, j) => !G.walk[idx(i, j)];
  const emit = (x0, z0, x1, z1, base, top, alongX) => {
    // un collisionneur par segment, des blocs pour l'aspect
    const len = alongX ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    colliders.push(addBox(cx, cz, alongX ? len / 2 : 0.5, alongX ? 0.5 : len / 2, 0, top));
    let s = 0;
    while (s < len - 0.01) {
      const l = Math.min(len - s, 2 + Math.floor(rnd() * 3));
      const hh = top - base + (rnd() - 0.5) * 0.6;
      const col = pal[Math.floor(rnd() * pal.length)];
      const mx = alongX ? x0 + s + l / 2 : cx, mz = alongX ? cz : z0 + s + l / 2;
      b.box(alongX ? l : 1.02, hh, alongX ? 1.02 : l, col, mx, base + hh / 2, mz);
      if (!theme.open) b.box(alongX ? l + 0.02 : 1.2, 0.22, alongX ? 1.2 : l + 0.02, theme.trim, mx, base + hh + 0.1, mz);
      else b.box(alongX ? l : 0.5, 0.18, alongX ? 0.5 : l, theme.trim, mx, base + hh + 0.09, mz);
      s += l;
    }
  };
  // faces nord/sud (le long de x)
  for (const dj of [-1, 1]) {
    for (let j = 1; j < N - 1; j++) {
      let run = -1, mn = 1e9, mx = -1e9;
      for (let i = 1; i < N; i++) {
        const on = i < N - 1 && G.walk[idx(i, j)] && solid(i, j + dj);
        if (on) { if (run < 0) { run = i; mn = 1e9; mx = -1e9; } const h = G.h[idx(i, j)]; mn = Math.min(mn, h); mx = Math.max(mx, h); }
        else if (run >= 0) {
          const zc = Z0 + j + 0.5 + dj;
          emit(X0 + run, zc, X0 + i, zc, mn - 0.3, mx + H, true);
          run = -1;
        }
      }
    }
  }
  // faces est/ouest (le long de z)
  for (const di of [-1, 1]) {
    for (let i = 1; i < N - 1; i++) {
      let run = -1, mn = 1e9, mx = -1e9;
      for (let j = 1; j < N; j++) {
        const on = j < N - 1 && G.walk[idx(i, j)] && solid(i + di, j);
        if (on) { if (run < 0) { run = j; mn = 1e9; mx = -1e9; } const h = G.h[idx(i, j)]; mn = Math.min(mn, h); mx = Math.max(mx, h); }
        else if (run >= 0) {
          const xc = X0 + i + 0.5 + di;
          emit(xc, Z0 + run, xc, Z0 + j, mn - 0.3, mx + H, false);
          run = -1;
        }
      }
    }
  }
  return colliders;
}

// ---------------------------------------------------------------------------
// Décors
function buildProps(G, rooms, corridors, theme, b, g, rnd, def) {
  const T = theme.props;
  const hAt = (x, z) => G.h[idx(toI(x), toJ(z))];
  const walkAt = (x, z) => G.walk[idx(toI(x), toJ(z))] === 1;
  const torch = (x, z, y, face) => {
    b.box(0.16, 0.5, 0.16, '#4a3a2a', x, y + 2.3, z);
    b.box(0.26, 0.14, 0.26, '#2e241e', x, y + 2.58, z);
    g.octa(0.16, theme.glow, x, y + 2.8, z, 1, 1.6, 1);
    void face;
  };
  const brazier = (x, z) => {
    const y = hAt(x, z);
    b.cyl(0.45, 0.3, 0.9, 6, '#2e2622', x, y + 0.45, z);
    b.cyl(0.7, 0.5, 0.35, 6, '#3a302a', x, y + 1.05, z);
    g.cyl(0.5, 0.55, 0.16, 6, theme.glow, x, y + 1.2, z);
    addCircle(x, z, 0.8, y + 1.3);
  };
  const pillar = (x, z, h) => {
    const y = hAt(x, z);
    const c = theme.wall[Math.floor(rnd() * theme.wall.length)];
    b.box(1.8, 0.6, 1.8, theme.trim, x, y + 0.3, z);
    b.box(1.3, h, 1.3, c, x, y + h / 2 + 0.6, z);
    b.box(1.8, 0.5, 1.8, theme.trim, x, y + h + 0.85, z);
    addCircle(x, z, 1.0, y + h + 1);
  };
  for (const r of rooms) {
    const big = Math.min(r.hw, r.hd) >= 11;
    // piliers
    if (big && !theme.open && !r.round) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pillar(r.x + sx * (r.hw - 4.5), r.z + sz * (r.hd - 4.5), theme.wallH + 1.5);
    }
    if (r.round && !theme.open) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pillar(r.x + Math.sin(a) * (r.hw - 3.5), r.z + Math.cos(a) * (r.hw - 3.5), theme.wallH + 2); }
    // torches murales
    const per = 2 * (r.hw + r.hd);
    const nT = Math.max(4, Math.floor(per / 9));
    for (let k = 0; k < nT; k++) {
      const a = (k / nT) * Math.PI * 2;
      let x = r.x + Math.sin(a) * (r.hw - 0.8), z = r.z + Math.cos(a) * (r.hd - 0.8);
      if (!r.round) { x = clamp(x, r.x - r.hw + 0.8, r.x + r.hw - 0.8); z = clamp(z, r.z - r.hd + 0.8, r.z + r.hd - 0.8); }
      if (!walkAt(x, z)) continue;
      torch(x, z, hAt(x, z));
    }
    // salle du boss : estrade et braseros
    if (r.kind === 'boss') {
      const y = r.h;
      b.cyl(r.hw * 0.38, r.hw * 0.42, 0.3, 12, theme.trim, r.x, y + 0.02, r.z);
      g.cyl(r.hw * 0.36, r.hw * 0.36, 0.05, 24, theme.accent, r.x, y + 0.2, r.z);
      b.cyl(r.hw * 0.33, r.hw * 0.33, 0.12, 24, theme.floor[0], r.x, y + 0.24, r.z);
      for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) brazier(r.x + sx * (r.hw - 6), r.z + sz * (r.hd - 6));
    }
    if (r.kind === 'entry') {
      // portail d'entrée (décor), contre le mur opposé au premier couloir
      const nx = rooms[1] ? rooms[1].x - r.x : 0, nz = rooms[1] ? rooms[1].z - r.z : 1;
      const alongX = Math.abs(nz) >= Math.abs(nx); // portail parallèle à l'axe x
      const y = r.h;
      const x = alongX ? r.x : r.x - Math.sign(nx) * (r.hw - 1.6), z = alongX ? r.z - Math.sign(nz || 1) * (r.hd - 1.6) : r.z;
      const ox = alongX ? 2.4 : 0, oz = alongX ? 0 : 2.4;
      b.box(0.8, 5, 0.8, theme.trim, x - ox, y + 2.5, z - oz);
      b.box(0.8, 5, 0.8, theme.trim, x + ox, y + 2.5, z + oz);
      b.box(alongX ? 5.6 : 0.8, 0.8, alongX ? 0.8 : 5.6, theme.trim, x, y + 5.2, z);
      g.box(alongX ? 4 : 0.12, 4.4, alongX ? 0.12 : 4, theme.accent, x, y + 2.6, z);
      addBox(x, z, alongX ? 2.9 : 0.5, alongX ? 0.5 : 2.9, 0, y + 5.6);
    }
    // décors de thème
    const n = Math.floor((r.hw * r.hd) / 45);
    for (let k = 0; k < n; k++) {
      const x = r.x + (rnd() - 0.5) * 2 * (r.hw - 2.5), z = r.z + (rnd() - 0.5) * 2 * (r.hd - 2.5);
      if (!walkAt(x, z) || Math.hypot(x - r.x, z - r.z) < 6) continue;
      // les décors restent en bordure pour ne pas gêner les combats
      const edge = r.round ? Math.hypot(x - r.x, z - r.z) / r.hw : Math.max(Math.abs(x - r.x) / r.hw, Math.abs(z - r.z) / r.hd);
      if (edge < 0.62) continue;
      themeProp(T, b, g, x, hAt(x, z), z, rnd, theme);
    }
  }
  // couloirs : poutres (mine), arches, bannières
  for (const c of corridors) {
    for (let i = 0; i < c.pts.length - 1; i++) {
      const p0 = c.pts[i], p1 = c.pts[i + 1];
      const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const alongX = Math.abs(p1.x - p0.x) > Math.abs(p1.z - p0.z);
      for (let s = 6; s < l - 4; s += 11) {
        const x = lerp(p0.x, p1.x, s / l), z = lerp(p0.z, p1.z, s / l);
        if (G.room[idx(toI(x), toJ(z))] !== -2) continue;
        const y = hAt(x, z);
        const w = c.w + 0.3;
        if (T === 'mine') {
          for (const sd of [-1, 1]) b.box(0.35, 3.6, 0.35, '#6b4a2e', x + (alongX ? 0 : sd * w), y + 1.8, z + (alongX ? sd * w : 0));
          b.box(alongX ? 0.4 : w * 2 + 0.4, 0.4, alongX ? w * 2 + 0.4 : 0.4, '#5a3e24', x, y + 3.7, z);
          g.octa(0.12, theme.glow, x, y + 3.3, z, 1, 1.4, 1);
        } else if (T !== 'sky') {
          for (const sd of [-1, 1]) torch(x + (alongX ? 0 : sd * (w - 0.5)), z + (alongX ? sd * (w - 0.5) : 0), y);
        }
      }
    }
  }
  void def;
}

function themeProp(T, b, g, x, y, z, rnd, theme) {
  const r = rnd();
  switch (T) {
    case 'mine':
      if (r < 0.35) { b.box(1.2, 1.0, 1.2, '#7a5838', x, y + 0.5, z, 0, rnd(), 0); b.box(1.25, 0.1, 1.25, '#4a3420', x, y + 1.02, z, 0, rnd(), 0); }
      else if (r < 0.65) { g.octa(0.35, '#ffcf70', x, y + 0.45, z, 1, 1.6, 1); b.dodeca(0.6, '#5a4a3e', x + 0.4, y + 0.3, z, 1, 0.7, 1); }
      else { b.dodeca(0.9, '#6a5846', x, y + 0.4, z, 1.2, 0.7, 1, rnd() * 3); }
      break;
    case 'swamp':
      if (r < 0.4) { b.cyl(1.4, 1.6, 0.05, 8, '#2a3a24', x, y + 0.03, z); g.cyl(1.2, 1.2, 0.02, 8, '#3a5a3a', x, y + 0.07, z); }
      else if (r < 0.7) { b.box(0.9, 2.4, 0.9, '#5a6a54', x, y + 1.2, z, 0, 0, (rnd() - 0.5) * 0.4); b.box(1.1, 0.4, 1.1, '#3a4a34', x, y + 2.5, z); }
      else { for (let k = 0; k < 3; k++) b.cone(0.18, 0.9 + rnd() * 0.8, 4, '#4a7a3a', x + (rnd() - 0.5), y + 0.5, z + (rnd() - 0.5)); g.ico(0.12, '#c8ff90', x, y + 1.2, z); }
      break;
    case 'crypt':
      if (r < 0.35) { b.box(1.1, 0.8, 2.3, '#6a6674', x, y + 0.4, z, 0, rnd() * 3, 0); b.box(1.2, 0.2, 2.4, '#7a7684', x, y + 0.9, z, 0, rnd() * 3, 0); }
      else if (r < 0.6) { for (let k = 0; k < 5; k++) b.box(0.4, 0.14, 0.14, '#e6dfcd', x + (rnd() - 0.5), y + 0.07, z + (rnd() - 0.5), 0, rnd() * 3, 0); b.box(0.34, 0.3, 0.34, '#e6dfcd', x, y + 0.15, z); }
      else { for (let k = 0; k < 3; k++) { const cx = x + (rnd() - 0.5) * 0.8, cz = z + (rnd() - 0.5) * 0.8, ch = 0.3 + rnd() * 0.4; b.box(0.12, ch, 0.12, '#e8e0cc', cx, y + ch / 2, cz); g.box(0.08, 0.12, 0.08, '#ffd070', cx, y + ch + 0.08, cz); } }
      break;
    case 'ice':
      if (r < 0.5) { for (let k = 0; k < 3; k++) b.cone(0.3 + rnd() * 0.3, 1.2 + rnd() * 1.6, 5, '#cfe8ff', x + (rnd() - 0.5) * 1.4, y + 0.8, z + (rnd() - 0.5) * 1.4); }
      else if (r < 0.75) { g.octa(0.4, '#9fe0ff', x, y + 0.7, z, 1, 1.8, 1); }
      else { b.dodeca(1.0, '#e8f2fa', x, y + 0.3, z, 1.4, 0.5, 1.2, rnd() * 3); }
      break;
    case 'fire':
      if (r < 0.35) { for (let k = 0; k < 3; k++) b.cone(0.28, 1.4 + rnd() * 1.4, 4, '#1a1418', x + (rnd() - 0.5) * 1.2, y + 0.9, z + (rnd() - 0.5) * 1.2); }
      else if (r < 0.6) { b.box(1.4, 0.6, 0.7, '#2a2a30', x, y + 0.7, z); b.box(0.6, 0.4, 0.5, '#2a2a30', x, y + 0.2, z); g.box(0.3, 0.08, 0.3, '#ff9a40', x + 0.3, y + 1.02, z); }
      else { b.cyl(0.4, 0.3, 0.8, 6, '#2e2622', x, y + 0.4, z); g.cyl(0.35, 0.35, 0.1, 6, '#ff7a2a', x, y + 0.85, z); }
      break;
    case 'sky':
      if (r < 0.5) { b.box(0.14, 3.2, 0.14, '#d9a441', x, y + 1.6, z); b.box(0.9, 1.6, 0.05, theme.accent, x + 0.5, y + 2.4, z); }
      else { g.octa(0.45, '#dff0ff', x, y + 1.8 + rnd(), z, 1, 1.8, 1); }
      break;
    case 'void':
      if (r < 0.6) { g.octa(0.35 + rnd() * 0.3, rnd() < 0.5 ? '#b58cff' : '#7fd1ff', x, y + 0.9 + rnd() * 1.4, z, 1, 1.8, 1); }
      else { b.dodeca(0.8, '#3e3656', x, y + 0.3, z, 1.2, 0.6, 1, rnd() * 3); }
      break;
  }
}

// ---------------------------------------------------------------------------
// Carte : image de la grille (sol, salles de boss, lave)
function drawMap(G, rooms, theme) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#07080c';
  c.fillRect(0, 0, S, S);
  const img = c.getImageData(0, 0, S, S);
  const k = N / S;
  const base = new THREE.Color(theme.floor[1]).lerp(new THREE.Color('#ffffff'), 0.18);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(x * k), j = Math.floor(y * k);
    const id = idx(i, j);
    const w = G.walk[id];
    if (!w) continue;
    const p = (y * S + x) * 4;
    let r = base.r, gg = base.g, bb = base.b;
    const room = G.room[id];
    if (w === 3) { r = 1; gg = 0.45; bb = 0.1; }
    else if (room >= 0 && rooms[room].kind === 'boss') { r *= 1.15; gg *= 0.85; bb *= 0.85; }
    img.data[p] = Math.min(255, r * 255); img.data[p + 1] = Math.min(255, gg * 255); img.data[p + 2] = Math.min(255, bb * 255); img.data[p + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}
