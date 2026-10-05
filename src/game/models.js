// Modèles procéduraux "en blocs" : humanoïdes, quadrupèdes, insectes, gelées, volants, flottants, vers, drakes.
// Chaque membre est un maillage à couleurs par sommet ; un seul matériau par modèle (pour les flashs de dégâts).
import * as THREE from 'three';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';
import { clamp, lerp } from '../core/util.js';

const PI = Math.PI;

// Boîte chanfreinée : volumes plus doux que des cubes, facettes nettes sous la lumière.
const RBOX = (() => {
  const b = 0.16, v = [], P = (sx, sy, sz, ax) => [ax === 0 ? sx * 0.5 : sx * (0.5 - b), ax === 1 ? sy * 0.5 : sy * (0.5 - b), ax === 2 ? sz * 0.5 : sz * (0.5 - b)];
  const tri = (a, c, d) => {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a)));
    const m = new THREE.Vector3(a[0] + c[0] + d[0], a[1] + c[1] + d[1], a[2] + c[2] + d[2]);
    if (n.dot(m) < 0) v.push(...a, ...d, ...c); else v.push(...a, ...c, ...d);
  };
  const quad = (a, c, d, e) => { tri(a, c, d); tri(a, d, e); };
  const S = [-1, 1];
  for (let ax = 0; ax < 3; ax++) for (const s of S) { // faces
    const c = (u, w) => { const k = [0, 0, 0]; k[ax] = s; k[(ax + 1) % 3] = u; k[(ax + 2) % 3] = w; return P(k[0], k[1], k[2], ax); };
    quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));
  }
  for (let ax = 0; ax < 3; ax++) { const bx = (ax + 1) % 3, cx = (ax + 2) % 3; // arêtes entre les faces ax et bx
    for (const s of S) for (const t of S) { const k = (w) => { const q = [0, 0, 0]; q[ax] = s; q[bx] = t; q[cx] = w; return q; };
      quad(P(...k(-1), ax), P(...k(1), ax), P(...k(1), bx), P(...k(-1), bx)); } }
  for (const x of S) for (const y of S) for (const z of S) tri(P(x, y, z, 0), P(x, y, z, 1), P(x, y, z, 2));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
})();
const _hc = new THREE.Color(), _hs = { h: 0, s: 0, l: 0 }, _vivid = new Map();
// Couleurs plus franches : on relève les tons sombres et on sature légèrement.
function vivid(color) {
  if (color === null || color === undefined) return color;
  let r = _vivid.get(color);
  if (r === undefined) {
    _hc.set(color).getHSL(_hs, THREE.SRGBColorSpace);
    const l = _hs.l < 0.5 ? _hs.l * 0.68 + 0.16 : _hs.l, sat = _hs.s < 0.08 ? _hs.s : Math.min(1, _hs.s * 1.22 + 0.05);
    r = '#' + _hc.setHSL(_hs.h, sat, l, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
    _vivid.set(color, r);
  }
  return r;
}
class ModelBuilder extends GeoBuilder {
  add(geo, color, ...rest) { return super.add(geo, vivid(color), ...rest); }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (Math.min(w, h, d) < 0.075) return super.box(w, h, d, color, x, y, z, rx, ry, rz);
    return this.add(RBOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
}
function part(parent, builder, mat, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (builder && !builder.empty) {
    const geo = builder.build();
    // dégradé vertical discret (bas plus sombre) : aspect peint à la main
    const bb = geo.boundingBox, hgt = bb.max.y - bb.min.y, pos = geo.attributes.position, col = geo.attributes.color;
    if (hgt > 0.12) for (let i = 0; i < pos.count; i++) { const k = 0.8 + 0.24 * (pos.getY(i) - bb.min.y) / hgt; col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k)); }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    g.userData.mesh = m;
  }
  parent.add(g);
  return g;
}
const B = () => new ModelBuilder();
const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
};

// ---------------------------------------------------------------------------
// Armes et accessoires (géométries attachées aux mains)
export function weaponGeo(type, c = {}) {
  const b = B();
  const metal = c.metal || '#c9ced6', wood = c.wood || '#6b4a2e', gem = c.gem || '#7fd1ff', accent = c.accent || '#d9a441';
  switch (type) {
    case 'sword':
      b.box(0.07, 0.24, 0.07, wood, 0, 0.0, 0);
      b.box(0.36, 0.07, 0.1, accent, 0, 0.13, 0);
      b.box(0.1, 0.95, 0.04, metal, 0, 0.64, 0);
      b.box(0.06, 0.12, 0.03, metal, 0, 1.16, 0);
      break;
    case 'greatsword':
      b.box(0.08, 0.34, 0.08, wood, 0, 0.0, 0);
      b.box(0.5, 0.08, 0.12, accent, 0, 0.18, 0);
      b.box(0.15, 1.35, 0.05, metal, 0, 0.9, 0);
      break;
    case 'axe':
      b.box(0.07, 1.0, 0.07, wood, 0, 0.35, 0);
      b.box(0.08, 0.42, 0.34, metal, 0, 0.72, 0.16);
      b.box(0.06, 0.3, 0.12, metal, 0, 0.72, -0.08);
      break;
    case 'mace':
      b.box(0.07, 0.8, 0.07, wood, 0, 0.3, 0);
      b.box(0.24, 0.24, 0.24, metal, 0, 0.78, 0);
      b.box(0.34, 0.08, 0.08, metal, 0, 0.78, 0);
      b.box(0.08, 0.08, 0.34, metal, 0, 0.78, 0);
      break;
    case 'club':
      b.box(0.1, 0.9, 0.1, wood, 0, 0.35, 0);
      b.box(0.22, 0.4, 0.22, shade(wood, 0.85), 0, 0.8, 0);
      break;
    case 'dagger':
      b.box(0.06, 0.16, 0.06, wood, 0, 0, 0);
      b.box(0.2, 0.05, 0.07, accent, 0, 0.09, 0);
      b.box(0.07, 0.42, 0.03, metal, 0, 0.32, 0);
      break;
    case 'spear':
      b.box(0.06, 1.9, 0.06, wood, 0, 0.5, 0);
      b.box(0.1, 0.34, 0.04, metal, 0, 1.6, 0);
      break;
    case 'staff':
      b.box(0.08, 1.9, 0.08, wood, 0, 0.45, 0);
      b.box(0.2, 0.2, 0.2, shade(wood, 0.8), 0, 1.42, 0);
      b.octa(0.16, gem, 0, 1.66, 0, 1, 1.5, 1);
      break;
    case 'scepter':
      b.box(0.07, 0.8, 0.07, wood, 0, 0.25, 0);
      b.box(0.24, 0.1, 0.24, accent, 0, 0.66, 0);
      b.ico(0.14, gem, 0, 0.8, 0);
      b.box(0.05, 0.3, 0.05, '#5a8a3a', 0.1, 0.8, 0, 0, 0, -0.4);
      b.box(0.05, 0.3, 0.05, '#5a8a3a', -0.1, 0.8, 0, 0, 0, 0.4);
      break;
    case 'bow': {
      const w = wood;
      b.box(0.06, 0.5, 0.07, w, 0, 0.28, 0.04, 0.35, 0, 0);
      b.box(0.06, 0.5, 0.07, w, 0, -0.28, 0.04, -0.35, 0, 0);
      b.box(0.07, 0.16, 0.08, accent, 0, 0, 0);
      b.box(0.015, 1.02, 0.015, '#e8e8e8', 0, 0, -0.06);
      break;
    }
    case 'claws':
      for (let i = -1; i <= 1; i++) b.box(0.03, 0.22, 0.03, '#e8e2d0', i * 0.05, 0.05, 0.12, 0.6, 0, 0);
      break;
    case 'torch':
      b.box(0.07, 0.6, 0.07, wood, 0, 0.2, 0);
      b.box(0.14, 0.12, 0.14, '#ffb050', 0, 0.55, 0);
      break;
    case 'pick':
      b.box(0.07, 0.9, 0.07, wood, 0, 0.3, 0);
      b.box(0.08, 0.08, 0.6, metal, 0, 0.72, 0, 0.2, 0, 0);
      break;
    case 'warhammer':
      b.box(0.07, 1.0, 0.07, wood, 0, 0.35, 0);
      b.box(0.11, 0.12, 0.11, accent, 0, -0.1, 0);
      b.box(0.4, 0.24, 0.24, metal, 0, 0.86, 0);
      b.box(0.46, 0.08, 0.28, accent, 0, 0.86, 0);
      b.box(0.12, 0.14, 0.12, metal, 0, 1.04, 0);
      break;
    case 'scythe':
      b.box(0.06, 1.95, 0.06, wood, 0, 0.45, 0);
      b.box(0.09, 0.1, 0.09, accent, 0, 1.38, 0);
      b.box(0.04, 0.13, 0.44, metal, 0, 1.36, 0.22, 0.2, 0, 0);
      b.box(0.04, 0.11, 0.36, metal, 0, 1.22, 0.54, 0.7, 0, 0);
      b.box(0.04, 0.08, 0.24, metal, 0, 1.03, 0.7, 1.25, 0, 0);
      break;
    case 'totemmace':
      b.box(0.08, 0.95, 0.08, wood, 0, 0.3, 0);
      b.box(0.24, 0.32, 0.24, shade(wood, 1.25), 0, 0.84, 0);
      b.box(0.26, 0.05, 0.26, accent, 0, 0.7, 0);
      b.box(0.1, 0.06, 0.06, '#1a1410', 0, 0.78, 0.12);
      for (const sx of [-1, 1]) b.box(0.05, 0.2, 0.05, '#efe6d0', sx * 0.16, 1.02, 0, 0, 0, -sx * 0.5);
      break;
  }
  return b;
}

// Parties lumineuses des armes (runes, gemmes) : matériau non éclairé, visible de nuit
export function weaponGlowGeo(type, c = {}) {
  const b = B();
  const g = c.glow;
  if (!g) return b;
  switch (type) {
    case 'sword': b.box(0.035, 0.72, 0.05, g, 0, 0.62, 0); break;
    case 'greatsword': b.box(0.045, 1.0, 0.06, g, 0, 0.9, 0); break;
    case 'axe': b.box(0.09, 0.3, 0.045, g, 0, 0.72, 0.3); break;
    case 'mace': b.box(0.26, 0.05, 0.26, g, 0, 0.78, 0); break;
    case 'warhammer': b.box(0.42, 0.05, 0.26, g, 0, 0.96, 0); break;
    case 'staff': b.octa(0.1, g, 0, 1.66, 0, 1, 1.6, 1); break;
    case 'scepter': b.ico(0.1, g, 0, 0.8, 0); break;
    case 'dagger': b.box(0.035, 0.3, 0.035, g, 0, 0.32, 0); break;
    case 'scythe': b.box(0.045, 0.05, 0.4, g, 0, 1.3, 0.3, 0.4, 0, 0); break;
    case 'totemmace': b.box(0.05, 0.05, 0.03, g, 0.06, 0.9, 0.125); b.box(0.05, 0.05, 0.03, g, -0.06, 0.9, 0.125); break;
    case 'bow': b.box(0.02, 0.9, 0.02, g, 0, 0, -0.06); break;
  }
  return b;
}

export function offhandGeo(type, c = {}) {
  const b = B();
  const metal = c.metal || '#c9ced6', accent = c.accent || '#d9a441', col = c.color || '#3b6fd8';
  switch (type) {
    case 'shield':
      b.box(0.08, 0.66, 0.54, col, 0, 0, 0);
      b.box(0.1, 0.72, 0.08, accent, 0, 0, 0);
      b.box(0.1, 0.08, 0.6, accent, 0, 0.05, 0);
      b.box(0.1, 0.16, 0.16, metal, 0.02, 0.05, 0);
      break;
    case 'buckler':
      b.cyl(0.26, 0.26, 0.07, 8, col, 0, 0, 0, 0, 0, PI / 2);
      b.box(0.09, 0.12, 0.12, metal, 0.02, 0, 0);
      break;
    case 'orb':
      b.ico(0.15, c.gem || '#b58cff', 0, 0.12, 0.08);
      break;
    case 'relic':
      b.box(0.14, 0.26, 0.14, '#6b4a2e', 0, 0.05, 0.05);
      b.box(0.2, 0.08, 0.2, accent, 0, 0.2, 0.05);
      b.octa(0.07, '#8fe88a', 0, 0.3, 0.05);
      break;
    case 'tome':
      b.box(0.06, 0.34, 0.26, '#e8dcc0', 0, 0.02, 0.06);
      b.box(0.08, 0.37, 0.03, c.cover || '#3a2438', 0, 0.02, 0.2);
      b.box(0.08, 0.37, 0.03, c.cover || '#3a2438', 0, 0.02, -0.08);
      b.box(0.03, 0.37, 0.3, c.cover || '#3a2438', -0.045, 0.02, 0.06);
      b.box(0.09, 0.08, 0.07, accent, 0.0, 0.02, 0.22);
      break;
    case 'skull':
      b.box(0.22, 0.2, 0.24, '#e6dfcd', 0, 0.12, 0.06);
      b.box(0.16, 0.08, 0.16, '#d0c8b4', 0, 0.0, 0.1);
      b.box(0.06, 0.05, 0.03, '#1a1418', 0.05, 0.12, 0.19);
      b.box(0.06, 0.05, 0.03, '#1a1418', -0.05, 0.12, 0.19);
      break;
    case 'fetish':
      b.box(0.05, 0.42, 0.05, '#6b4a2e', 0, 0.1, 0.04);
      b.box(0.18, 0.18, 0.12, '#9a7a54', 0, 0.36, 0.04);
      b.box(0.1, 0.04, 0.03, '#1a1410', 0, 0.36, 0.11);
      b.box(0.03, 0.2, 0.08, '#c83a2a', 0.1, 0.22, 0.04, 0, 0, -0.5);
      b.box(0.03, 0.2, 0.08, '#2a8ac8', -0.1, 0.22, 0.04, 0, 0, 0.5);
      b.box(0.04, 0.04, 0.04, '#efe6d0', 0, 0.06, 0.08);
      break;
    case 'dagger':
      return weaponGeo('dagger', c);
  }
  return b;
}
export function offhandGlowGeo(type, c = {}) {
  const b = B();
  const g = c.glow;
  if (!g) return b;
  if (type === 'orb') b.ico(0.09, g, 0, 0.12, 0.08);
  else if (type === 'skull') { b.box(0.05, 0.04, 0.035, g, 0.05, 0.12, 0.2); b.box(0.05, 0.04, 0.035, g, -0.05, 0.12, 0.2); }
  else if (type === 'tome') b.box(0.02, 0.2, 0.14, g, 0.05, 0.02, 0.06);
  else if (type === 'relic') b.octa(0.05, g, 0, 0.3, 0.05);
  else if (type === 'fetish') b.box(0.1, 0.035, 0.035, g, 0, 0.36, 0.115);
  else if (type === 'shield') b.box(0.105, 0.14, 0.14, g, 0.02, 0.05, 0);
  else if (type === 'dagger') return weaponGlowGeo('dagger', c);
  return b;
}

// ---------------------------------------------------------------------------
// Humanoïde
function buildHumanoid(spec, mat) {
  const root = new THREE.Group();
  const s = spec;
  const skin = s.skin || '#e0b48a', shirt = s.body || '#6b7a8a', pants = s.legs || '#4a4038', sleeves = s.arms || shirt;
  const boots = s.boots || '#3a2e24', gloves = s.gloves || skin;
  const head = s.head || 'human';
  const P = {
    legH: 0.78, legW: 0.24, hipY: 0.8, torsoW: 0.58, torsoH: 0.62, torsoD: 0.34, headS: 0.46, armL: 0.6, armW: 0.18,
    ...(s.hero ? { legH: 0.82, hipY: 0.84, legW: 0.25, torsoW: 0.62, torsoH: 0.64, torsoD: 0.36, headS: 0.47, armL: 0.63, armW: 0.19 } : {}),
    ...(s.prop || {}),
  };
  const bodyG = new THREE.Group();
  bodyG.position.y = P.hipY;
  root.add(bodyG);
  const parts = { root, body: bodyG };

  // bassin
  const hb = B();
  if (!s.floating) hb.box(P.torsoW * 0.9, 0.2, P.torsoD * 0.9, pants, 0, 0.02, 0);
  if (s.tail) {
    for (let i = 0; i < 4; i++) hb.box(0.14 - i * 0.02, 0.14 - i * 0.02, 0.22, s.tailColor || skin, 0, 0.04 - i * 0.05, -0.2 - i * 0.2);
  }
  parts.hips = part(bodyG, hb, mat, 0, 0, 0);
  if (s.skirt) {
    const sb = B();
    const sc = s.skirt.color || shirt, st = s.skirt.style;
    const len = st === 'short' ? 0.3 : 0.52;
    sb.box(P.torsoW * 1.02, len, P.torsoD * 1.08, sc, 0, -len / 2 + 0.06, 0);
    if (st === 'tattered') for (let i = 0; i < 5; i++) sb.box(P.torsoW * 0.18, 0.16 + (i % 2) * 0.1, P.torsoD * 1.1, shade(sc, 0.85), -P.torsoW * 0.4 + i * P.torsoW * 0.2, -len - 0.02 - (i % 2) * 0.05, 0);
    else sb.box(P.torsoW * 1.04, 0.05, P.torsoD * 1.1, s.skirt.trim || shade(sc, 0.7), 0, -len + 0.08, 0);
    parts.skirt = part(bodyG, sb, mat, 0, 0, 0);
  }

  // jambes
  if (!s.floating) {
    for (const side of [-1, 1]) {
      const lb = B();
      if (s.bone) {
        lb.box(0.09, P.legH * 0.95, 0.09, skin, 0, -P.legH / 2, 0);
        lb.box(0.16, 0.08, 0.26, skin, 0, -P.legH + 0.04, 0.05);
      } else {
        lb.box(P.legW, P.legH * 0.62, P.legW * 1.05, pants, 0, -P.legH * 0.31, 0);
        lb.box(P.legW * 1.05, P.legH * 0.4, P.legW * 1.1, boots, 0, -P.legH * 0.8, 0);
        lb.box(P.legW * 1.1, 0.12, P.legW * 1.5, boots, 0, -P.legH + 0.06, 0.06);
        if (s.birdLegs) lb.box(P.legW * 1.5, 0.06, P.legW * 2, '#d9a441', 0, -P.legH + 0.03, 0.12);
      }
      parts[side < 0 ? 'legL' : 'legR'] = part(bodyG, lb, mat, side * P.torsoW * 0.24, 0, 0);
    }
  } else {
    // robe flottante des spectres
    const rb = B();
    rb.box(P.torsoW * 0.95, 0.5, P.torsoD * 0.95, shirt, 0, -0.2, 0);
    rb.box(P.torsoW * 0.7, 0.4, P.torsoD * 0.7, shade(shirt, 0.8), 0, -0.6, 0);
    rb.box(P.torsoW * 0.4, 0.3, P.torsoD * 0.4, shade(shirt, 0.6), 0, -0.9, 0);
    parts.robe = part(bodyG, rb, mat, 0, 0, 0);
  }

  // torse
  const tb = B();
  const tY = 0.1 + P.torsoH / 2;
  if (s.bone) {
    tb.box(0.1, P.torsoH, 0.1, skin, 0, tY, -0.06);
    for (let i = 0; i < 4; i++) tb.box(P.torsoW * 0.75, 0.06, P.torsoD * 0.8, skin, 0, tY - 0.18 + i * 0.13, 0);
    if (s.armor) tb.box(P.torsoW * 0.8, P.torsoH * 0.5, P.torsoD * 0.9, s.armor, 0, tY + 0.1, 0);
  } else {
    tb.box(P.torsoW, P.torsoH, P.torsoD, shirt, 0, tY, 0);
    if (s.belt !== false) tb.box(P.torsoW * 1.02, 0.1, P.torsoD * 1.04, s.beltColor || '#3a2a1e', 0, 0.16, 0);
    if (s.tabard) tb.box(P.torsoW * 0.42, P.torsoH * 0.85, 0.04, s.tabard, 0, tY - 0.02, P.torsoD / 2 + 0.02);
    if (s.apron) tb.box(P.torsoW * 0.7, P.torsoH * 0.9, 0.04, s.apron, 0, tY - 0.12, P.torsoD / 2 + 0.02);
    if (s.pauldrons && !s.shoulders) for (const sx of [-1, 1]) tb.box(0.26, 0.14, 0.34, s.pauldrons, sx * (P.torsoW / 2 + 0.05), P.torsoH + 0.08, 0);
    if (s.shoulders) addShoulders(tb, P, s.shoulders);
    if (s.gorget) tb.box(P.torsoW * 0.62, 0.12, P.torsoD * 0.86, s.gorget, 0, 0.1 + P.torsoH + 0.02, 0);
    if (s.collar) {
      tb.box(P.torsoW * 0.82, 0.3, 0.07, s.collar, 0, 0.1 + P.torsoH + 0.12, -P.torsoD / 2 + 0.01);
      for (const sx of [-1, 1]) tb.box(0.07, 0.26, P.torsoD * 0.5, s.collar, sx * P.torsoW * 0.38, 0.1 + P.torsoH + 0.1, -P.torsoD * 0.2, 0, sx * 0.25, 0);
    }
    if (s.hoodDown) tb.box(0.4, 0.2, 0.16, s.hoodDown, 0, 0.1 + P.torsoH - 0.02, -P.torsoD / 2 - 0.07);
    if (s.pouches) for (const sx of [-1, 1]) tb.box(0.13, 0.13, 0.09, s.pouches, sx * P.torsoW * 0.33, 0.12, P.torsoD / 2 + 0.03);
    if (s.necklace) { tb.box(P.torsoW * 0.5, 0.03, 0.03, '#6b4a2e', 0, 0.1 + P.torsoH - 0.06, P.torsoD / 2 + 0.02); for (let i = -1; i <= 1; i++) tb.cone(0.03, 0.1, 4, '#efe6d0', i * 0.09, 0.1 + P.torsoH - 0.13, P.torsoD / 2 + 0.03, PI, 0, 0); }
    if (s.backItem) addBackItem(tb, P, s.backItem, s.backColors || {});
    if (s.tabardLong) tb.box(P.torsoW * 0.42, 0.34, 0.04, s.tabardLong, 0, -0.1, P.torsoD / 2 + 0.03);
    if (s.fur) tb.box(P.torsoW * 1.08, 0.18, P.torsoD * 1.1, s.fur, 0, P.torsoH + 0.06, 0);
    if (s.hunch) tb.box(P.torsoW * 0.8, 0.3, P.torsoD * 0.8, shirt, 0, P.torsoH + 0.1, -0.08);
    if (s.core) tb.box(0.2, 0.2, 0.06, s.core, 0, tY + 0.05, P.torsoD / 2 + 0.02);
    if (s.backSpikes) for (let i = 0; i < 3; i++) tb.cone(0.07, 0.22, 4, s.backSpikes, 0, tY + 0.2 - i * 0.18, -P.torsoD / 2 - 0.06, -1.2, 0, 0);
  }
  const torso = part(bodyG, tb, mat, 0, 0, 0);
  parts.torso = torso;
  if (s.hunch) torso.rotation.x = 0.25;

  // cape (simple couleur, ou objet {color, trim, emblem, emblemColor, len, style})
  if (s.cape) {
    const cb = B();
    const cc = typeof s.cape === 'string' ? { color: s.cape } : s.cape;
    const len = P.torsoH * (cc.len || 1.5);
    const w = P.torsoW * (cc.style === 'short' ? 0.8 : 0.94);
    if (cc.style === 'tattered') {
      cb.box(w, len * 0.8, 0.05, cc.color, 0, -len * 0.4, 0);
      for (let i = 0; i < 5; i++) cb.box(w / 5.2, len * (0.18 + (i % 2) * 0.12), 0.05, shade(cc.color, 0.85), -w * 0.4 + i * w * 0.2, -len * 0.8 - len * (0.09 + (i % 2) * 0.06), 0);
    } else if (cc.style === 'fur') {
      cb.box(w, len, 0.06, cc.color, 0, -len / 2, 0);
      cb.box(w * 1.08, 0.12, 0.1, shade(cc.color, 1.2), 0, -0.02, 0);
    } else {
      cb.box(w, len, 0.05, cc.color, 0, -len / 2, 0);
      if (cc.trim) cb.box(w * 1.01, 0.07, 0.055, cc.trim, 0, -len + 0.05, 0);
    }
    if (cc.trim && cc.style !== 'tattered') cb.box(w * 0.7, 0.05, 0.06, cc.trim, 0, -0.03, 0);
    if (cc.emblem) addEmblem(cb, cc.emblem, -len * 0.36, cc.emblemColor || '#f0e8d8', -0.035);
    parts.cape = part(torso, cb, mat, 0, 0.1 + P.torsoH, -P.torsoD / 2 - 0.04);
  }
  // écharpe flottante (assassin)
  if (s.scarf) {
    const sb2 = B();
    sb2.box(0.12, 0.42, 0.04, s.scarf, 0.06, -0.21, 0);
    sb2.box(0.1, 0.3, 0.04, shade(s.scarf, 0.85), -0.08, -0.15, 0.01);
    parts.scarf = part(torso, sb2, mat, 0.08, 0.1 + P.torsoH + 0.02, -P.torsoD / 2 - 0.02);
  }

  // ailes (gargouille, harpie, diablotin, drakônide)
  if (s.wings) {
    for (const side of [-1, 1]) {
      const wb = B();
      const wc = s.wings;
      wb.box(0.06, 0.08, 0.9, wc, side * 0.0, 0, -0.45);
      wb.box(0.04, 0.55, 0.8, shade(wc, 1.15), side * 0.0, -0.28, -0.5);
      wb.box(0.04, 0.35, 0.4, shade(wc, 1.15), side * 0.0, -0.18, -1.0);
      const w = part(torso, wb, mat, side * 0.2, 0.1 + P.torsoH * 0.9, -P.torsoD / 2);
      w.rotation.y = side * 0.6;
      parts[side < 0 ? 'wingL' : 'wingR'] = w;
    }
  }

  // tête
  const hs = P.headS;
  const hbld = B();
  const hy = hs / 2 + 0.02;
  const eye = s.eyes || '#1a1a22';
  switch (head) {
    case 'goblin':
      hbld.box(hs, hs * 0.9, hs * 0.9, skin, 0, hy, 0);
      hbld.box(0.34, 0.12, 0.05, eye === '#1a1a22' ? '#f0e050' : eye, 0, hy + 0.04, hs * 0.45 + 0.01);
      hbld.box(0.1, 0.16, 0.14, shade(skin, 0.9), 0, hy - 0.04, hs * 0.5);
      for (const sx of [-1, 1]) hbld.box(0.32, 0.1, 0.06, skin, sx * (hs / 2 + 0.14), hy + 0.06, 0, 0, 0, sx * 0.4);
      break;
    case 'kobold':
      hbld.box(hs * 0.9, hs * 0.85, hs * 0.9, skin, 0, hy, 0);
      hbld.box(hs * 0.5, hs * 0.35, 0.28, shade(skin, 0.9), 0, hy - 0.08, hs * 0.55);
      hbld.box(0.08, 0.06, 0.04, '#111', 0, hy - 0.02, hs * 0.55 + 0.14);
      for (const sx of [-1, 1]) {
        hbld.box(0.07, 0.07, 0.03, '#ffcc40', sx * 0.1, hy + 0.08, hs * 0.45 + 0.01);
        hbld.cone(0.06, 0.2, 4, '#e8dcc0', sx * 0.12, hy + hs * 0.5, -0.04, -0.4, 0, 0);
      }
      break;
    case 'frog':
      hbld.box(hs * 1.3, hs * 0.65, hs * 1.1, skin, 0, hy - 0.05, 0.02);
      hbld.box(hs * 1.2, 0.04, 0.04, '#2a3a1a', 0, hy - 0.16, hs * 0.56);
      for (const sx of [-1, 1]) {
        hbld.box(0.16, 0.16, 0.16, skin, sx * 0.2, hy + 0.2, 0.12);
        hbld.box(0.1, 0.1, 0.04, '#f0e050', sx * 0.2, hy + 0.22, 0.21);
        hbld.box(0.05, 0.07, 0.02, '#111', sx * 0.2, hy + 0.22, 0.235);
      }
      break;
    case 'skull':
      hbld.box(hs * 0.9, hs * 0.85, hs * 0.9, skin, 0, hy, 0);
      hbld.box(hs * 0.7, 0.14, hs * 0.7, shade(skin, 0.9), 0, hy - hs * 0.45, 0.04);
      for (const sx of [-1, 1]) hbld.box(0.1, 0.1, 0.04, s.glowEyes || '#7fe0ff', sx * 0.1, hy + 0.03, hs * 0.45 + 0.01);
      hbld.box(0.06, 0.08, 0.04, '#222', 0, hy - 0.08, hs * 0.45);
      break;
    case 'lizard':
      hbld.box(hs * 0.85, hs * 0.8, hs * 0.9, skin, 0, hy, 0);
      hbld.box(hs * 0.6, hs * 0.4, 0.32, skin, 0, hy - 0.06, hs * 0.55);
      for (const sx of [-1, 1]) hbld.box(0.07, 0.07, 0.04, s.glowEyes || '#ffcc40', sx * 0.14, hy + 0.08, hs * 0.45);
      for (let i = 0; i < 3; i++) hbld.cone(0.06, 0.18, 4, s.backSpikes || shade(skin, 0.7), 0, hy + hs * 0.4, -i * 0.12, -0.5, 0, 0);
      break;
    case 'imp':
      hbld.box(hs * 0.9, hs * 0.85, hs * 0.85, skin, 0, hy, 0);
      for (const sx of [-1, 1]) {
        hbld.box(0.08, 0.08, 0.04, '#ffe040', sx * 0.11, hy + 0.05, hs * 0.43);
        hbld.cone(0.07, 0.26, 4, '#2a1a1a', sx * 0.15, hy + hs * 0.55, 0, 0, 0, -sx * 0.3);
      }
      hbld.box(0.2, 0.05, 0.03, '#2a1010', 0, hy - 0.1, hs * 0.43);
      break;
    case 'troll':
      hbld.box(hs * 1.1, hs * 0.9, hs, skin, 0, hy, 0.05);
      hbld.box(hs * 0.5, 0.22, 0.2, shade(skin, 0.85), 0, hy - 0.02, hs * 0.55);
      for (const sx of [-1, 1]) {
        hbld.box(0.08, 0.06, 0.03, '#ffd040', sx * 0.14, hy + 0.1, hs * 0.51);
        hbld.cone(0.05, 0.2, 4, '#f0ead8', sx * 0.14, hy - 0.12, hs * 0.55, 0, 0, 0);
        hbld.box(0.2, 0.1, 0.05, skin, sx * (hs * 0.6), hy + 0.05, 0, 0, 0, sx * 0.5);
      }
      if (s.hair) hbld.box(hs * 0.3, 0.14, hs * 0.9, s.hair, 0, hy + hs * 0.5, 0);
      break;
    case 'yeti':
      hbld.box(hs * 1.1, hs, hs, skin, 0, hy, 0);
      hbld.box(hs * 0.7, hs * 0.5, 0.08, '#8aa4c0', 0, hy - 0.02, hs * 0.5);
      for (const sx of [-1, 1]) {
        hbld.box(0.08, 0.08, 0.03, '#1a2a3a', sx * 0.12, hy + 0.06, hs * 0.55);
        hbld.cone(0.08, 0.35, 5, '#e8e0d0', sx * 0.3, hy + hs * 0.5, -0.05, 0, 0, -sx * 0.9);
      }
      break;
    case 'ghost':
      hbld.box(hs * 0.9, hs * 0.95, hs * 0.9, skin, 0, hy, 0);
      hbld.box(hs * 1.05, hs * 0.6, hs * 1.05, shade(s.body || skin, 0.9), 0, hy + 0.12, -0.03);
      for (const sx of [-1, 1]) hbld.box(0.1, 0.06, 0.04, s.glowEyes || '#a0ffe0', sx * 0.1, hy, hs * 0.46);
      break;
    case 'treant':
      hbld.box(hs * 0.9, hs * 1.1, hs * 0.85, skin, 0, hy + 0.04, 0);
      for (const sx of [-1, 1]) hbld.box(0.08, 0.08, 0.03, '#c8ff70', sx * 0.1, hy + 0.06, hs * 0.44);
      hbld.box(0.06, 0.5, 0.06, skin, 0.14, hy + 0.45, 0, 0, 0, -0.4);
      hbld.box(0.06, 0.4, 0.06, skin, -0.14, hy + 0.42, 0.05, 0, 0, 0.5);
      hbld.ico(0.26, '#5e8a3a', 0.22, hy + 0.66, 0);
      hbld.ico(0.22, '#4f7a30', -0.2, hy + 0.58, 0.05);
      break;
    case 'golem':
      hbld.box(hs * 0.9, hs * 0.7, hs * 0.9, skin, 0, hy - 0.04, 0.05);
      hbld.box(0.3, 0.08, 0.04, s.core || '#ff9a3a', 0, hy, hs * 0.5);
      break;
    case 'harpy':
      hbld.box(hs * 0.85, hs * 0.85, hs * 0.85, skin, 0, hy, 0);
      hbld.box(hs, hs * 0.5, hs * 0.95, s.hair || '#4a5a8a', 0, hy + hs * 0.35, -0.04);
      hbld.box(0.1, 0.08, 0.14, '#d9a441', 0, hy - 0.04, hs * 0.5);
      for (const sx of [-1, 1]) hbld.box(0.07, 0.07, 0.03, '#ffe040', sx * 0.1, hy + 0.06, hs * 0.43);
      break;
    default: {
      // humain
      hbld.box(hs, hs * 0.95, hs * 0.92, skin, 0, hy, 0);
      for (const sx of [-1, 1]) {
        hbld.box(0.08, 0.09, 0.03, '#f4f4f4', sx * 0.11, hy + 0.02, hs * 0.46 + 0.005);
        hbld.box(0.05, 0.07, 0.03, eye, sx * 0.11, hy + 0.015, hs * 0.46 + 0.02);
      }
      hbld.box(0.07, 0.1, 0.06, shade(skin, 0.9), 0, hy - 0.05, hs * 0.46 + 0.02);
      const hair = s.hair;
      if (hair && !s.helmet && !s.hood) {
        const st = s.hairStyle || 0;
        if (st !== 3) {
          hbld.box(hs * 1.06, hs * 0.26, hs * 1.0, hair, 0, hy + hs * 0.44, -0.01);
          hbld.box(hs * 1.06, hs * 0.6, hs * 0.2, hair, 0, hy + hs * 0.18, -hs * 0.45);
        }
        if (st === 1) hbld.box(hs * 0.9, hs * 0.9, hs * 0.22, hair, 0, hy - 0.12, -hs * 0.52);
        if (st === 2) hbld.box(hs * 0.22, hs * 0.3, hs * 1.1, hair, 0, hy + hs * 0.62, 0);
        if (st === 3) hbld.box(hs * 0.5, hs * 0.08, hs * 0.5, shade(skin, 0.95), 0, hy + hs * 0.5, 0);
        if (st === 4) for (const sx of [-1, 1]) hbld.box(0.1, hs * 1.0, 0.1, hair, sx * hs * 0.46, hy - 0.2, -0.05);
      }
      if (s.beard && !s.faceMask) hbld.box(hs * 0.8, hs * 0.35, 0.12, s.beard, 0, hy - hs * 0.4, hs * 0.44);
      if (s.faceMask) hbld.box(hs * 1.03, hs * 0.4, hs * 0.97, s.faceMask, 0, hy - hs * 0.22, 0.01);
      if (s.circlet && !s.helmet) { hbld.box(hs * 1.08, 0.06, hs * 1.04, s.circlet, 0, hy + hs * 0.3, 0); hbld.box(0.08, 0.08, 0.04, s.circletGem || '#7fd1ff', 0, hy + hs * 0.32, hs * 0.53); }
      if (s.mask) hbld.box(hs * 1.02, hs * 0.3, hs * 0.96, s.mask, 0, hy - hs * 0.2, 0.01);
      break;
    }
  }
  if (s.hood) {
    hbld.box(hs * 1.12, hs * 0.55, hs * 1.08, s.hood, 0, hy + hs * 0.32, -0.02);
    hbld.box(hs * 1.12, hs * 0.9, hs * 0.3, s.hood, 0, hy, -hs * 0.45);
    hbld.box(0.08, hs * 0.8, hs * 0.9, s.hood, -hs * 0.53, hy, 0);
    hbld.box(0.08, hs * 0.8, hs * 0.9, s.hood, hs * 0.53, hy, 0);
  }
  if (s.helmet) addHelmet(hbld, s.helmet, hs, hy, s);
  if (s.horns) for (const sx of [-1, 1]) hbld.cone(0.08, 0.34, 4, s.horns, sx * hs * 0.4, hy + hs * 0.55, -0.02, -0.3, 0, -sx * 0.4);
  const neckY = 0.1 + P.torsoH;
  parts.head = part(torso, hbld, mat, 0, neckY, s.hunch ? 0.12 : 0);

  // bras
  for (const side of [-1, 1]) {
    const ab = B();
    const aw = P.armW;
    if (s.bone) {
      ab.box(0.08, P.armL, 0.08, skin, 0, -P.armL / 2, 0);
    } else if (s.wingArms) {
      ab.box(aw, P.armL * 0.9, aw, skin, 0, -P.armL * 0.45, 0);
      ab.box(0.05, P.armL * 1.2, 0.7, s.wingArms, 0, -P.armL * 0.5, -0.3);
    } else {
      ab.box(aw, P.armL * 0.55, aw * 1.05, sleeves, 0, -P.armL * 0.27, 0);
      ab.box(aw * 0.95, P.armL * 0.45, aw, s.bracers || sleeves, 0, -P.armL * 0.74, 0);
    }
    if (!s.wingArms) ab.box(aw * 0.95, 0.15, aw * 0.95, gloves, 0, -P.armL - 0.04, 0);
    if (s.bigHands) ab.box(aw * 1.6, 0.26, aw * 1.5, gloves, 0, -P.armL - 0.1, 0);
    if (s.claws) for (let i = -1; i <= 1; i++) ab.box(0.03, 0.14, 0.03, '#efe8d8', i * 0.05, -P.armL - 0.16, 0.05);
    const arm = part(torso, ab, mat, side * (P.torsoW / 2 + aw / 2), 0.1 + P.torsoH - 0.06, 0);
    parts[side < 0 ? 'armL' : 'armR'] = arm;
    const hand = new THREE.Group();
    hand.position.set(0, -P.armL - 0.05, 0.02);
    arm.add(hand);
    parts[side < 0 ? 'handL' : 'handR'] = hand;
  }
  parts.P = P;
  const H = (P.hipY + 0.1 + P.torsoH + hs + 0.05);
  return { parts, height: H, radius: P.torsoW * 0.75 };
}

function addHelmet(b, type, hs, hy, s) {
  const m = s.helmetColor || '#9aa2ae', a = s.helmetAccent || '#d9a441';
  switch (type) {
    case 'plate':
      b.box(hs * 1.12, hs * 0.62, hs * 1.08, m, 0, hy + hs * 0.2, 0);
      b.box(hs * 1.12, hs * 0.18, hs * 0.1, '#1a1a22', 0, hy + 0.02, hs * 0.5);
      b.box(hs * 1.14, hs * 0.08, hs * 1.1, a, 0, hy + hs * 0.44, 0);
      b.box(0.08, 0.26, 0.3, s.plume || '#c83a2a', 0, hy + hs * 0.62, -0.05);
      break;
    case 'horned':
      b.box(hs * 1.1, hs * 0.5, hs * 1.06, m, 0, hy + hs * 0.28, 0);
      for (const sx of [-1, 1]) b.cone(0.07, 0.32, 5, '#efe6d0', sx * hs * 0.6, hy + hs * 0.55, 0, 0, 0, -sx * 0.8);
      break;
    case 'wizard':
      b.cyl(hs * 0.85, hs * 0.85, 0.05, 10, m, 0, hy + hs * 0.4, 0);
      b.cone(hs * 0.48, hs * 1.3, 8, m, 0, hy + hs * 1.05, -0.04, -0.15, 0, 0);
      b.box(hs * 0.98, 0.06, hs * 0.98, a, 0, hy + hs * 0.46, 0);
      break;
    case 'hood':
      b.box(hs * 1.12, hs * 0.55, hs * 1.08, m, 0, hy + hs * 0.32, -0.02);
      b.box(hs * 1.12, hs * 0.9, hs * 0.3, m, 0, hy, -hs * 0.45);
      b.box(0.08, hs * 0.8, hs * 0.9, m, -hs * 0.53, hy, 0);
      b.box(0.08, hs * 0.8, hs * 0.9, m, hs * 0.53, hy, 0);
      break;
    case 'antlers':
      b.box(hs * 1.08, 0.08, hs * 1.04, '#6b4a2e', 0, hy + hs * 0.36, 0);
      for (const sx of [-1, 1]) {
        b.box(0.05, 0.3, 0.05, '#e6dcc4', sx * hs * 0.4, hy + hs * 0.6, 0, 0, 0, -sx * 0.4);
        b.box(0.05, 0.18, 0.05, '#e6dcc4', sx * hs * 0.56, hy + hs * 0.78, 0, 0, 0, -sx * 0.9);
        b.box(0.05, 0.16, 0.05, '#e6dcc4', sx * hs * 0.36, hy + hs * 0.86, 0.05, 0, 0, sx * 0.3);
      }
      b.box(0.1, 0.1, 0.05, '#8fe88a', 0, hy + hs * 0.36, hs * 0.52);
      break;
    case 'circlet':
      b.box(hs * 1.08, 0.07, hs * 1.04, a, 0, hy + hs * 0.3, 0);
      b.box(0.1, 0.1, 0.05, s.gem || '#7fd1ff', 0, hy + hs * 0.32, hs * 0.53);
      break;
    case 'crown':
      b.box(hs * 1.05, 0.14, hs * 1.02, a, 0, hy + hs * 0.52, 0);
      for (let i = 0; i < 5; i++) b.box(0.06, 0.14, 0.06, a, -0.16 + i * 0.08, hy + hs * 0.66, hs * 0.5);
      break;
    case 'bandana':
      b.box(hs * 1.08, hs * 0.22, hs * 1.04, m, 0, hy + hs * 0.35, 0);
      b.box(0.1, 0.2, 0.08, m, 0.08, hy + hs * 0.2, -hs * 0.56);
      break;
    case 'crest':
      b.box(hs * 1.12, hs * 0.66, hs * 1.08, m, 0, hy + hs * 0.2, 0);
      b.box(hs * 1.13, hs * 0.1, hs * 0.1, '#1a1a22', 0, hy + 0.04, hs * 0.5);
      b.box(0.06, hs * 0.46, hs * 0.1, a, 0, hy - 0.03, hs * 0.54);
      b.box(hs * 1.15, hs * 0.07, hs * 1.1, a, 0, hy + hs * 0.46, 0);
      for (let i = 0; i < 5; i++) {
        const k = Math.abs(i - 2);
        b.box(0.05, 0.3 - k * 0.05, 0.08, s.plume || a, 0, hy + hs * 0.64 + 0.12 - k * 0.03, -0.18 + i * 0.09, (i - 2) * 0.28, 0, 0);
      }
      for (const sx of [-1, 1]) b.box(0.04, 0.24, 0.12, a, sx * hs * 0.6, hy + hs * 0.34, -0.02, 0, 0, -sx * 0.55);
      break;
    case 'mask': {
      const d = shade(m, 0.62);
      b.box(hs * 1.12, hs * 0.55, hs * 1.08, m, 0, hy + hs * 0.32, -0.02);
      b.box(hs * 1.12, hs * 0.9, hs * 0.3, m, 0, hy, -hs * 0.45);
      b.box(0.08, hs * 0.8, hs * 0.9, m, -hs * 0.53, hy, 0);
      b.box(0.08, hs * 0.8, hs * 0.9, m, hs * 0.53, hy, 0);
      b.box(hs * 1.02, hs * 0.38, 0.06, d, 0, hy - hs * 0.2, hs * 0.47);
      b.box(hs * 0.5, hs * 0.08, hs * 0.2, a, 0, hy + hs * 0.56, hs * 0.44);
      break;
    }
    case 'cowl':
      b.box(hs * 1.16, hs * 0.6, hs * 1.12, m, 0, hy + hs * 0.34, -0.03);
      b.box(hs * 1.16, hs * 1.0, hs * 0.3, m, 0, hy - 0.02, -hs * 0.47);
      b.box(0.09, hs * 0.92, hs * 0.95, m, -hs * 0.56, hy - 0.02, 0);
      b.box(0.09, hs * 0.92, hs * 0.95, m, hs * 0.56, hy - 0.02, 0);
      b.cone(hs * 0.38, hs * 0.62, 4, m, 0, hy + hs * 0.72, -hs * 0.24, -0.6, 0, 0);
      b.box(hs * 0.98, hs * 0.14, 0.04, '#0a0a10', 0, hy + hs * 0.14, hs * 0.47);
      b.box(hs * 1.18, hs * 0.07, hs * 0.08, a, 0, hy + hs * 0.6, hs * 0.5);
      break;
    case 'pelt':
      b.box(hs * 1.14, hs * 0.4, hs * 1.12, m, 0, hy + hs * 0.42, -0.02);
      b.box(hs * 0.78, hs * 0.24, hs * 0.5, shade(m, 0.88), 0, hy + hs * 0.46, hs * 0.52);
      b.box(hs * 0.3, hs * 0.14, 0.04, '#1a1410', 0, hy + hs * 0.46, hs * 0.78);
      for (const sx of [-1, 1]) {
        b.cone(0.08, 0.22, 4, m, sx * hs * 0.32, hy + hs * 0.8, -0.02, 0, 0, sx * 0.15);
        b.box(0.04, 0.07, 0.04, '#f0ead8', sx * 0.08, hy + hs * 0.3, hs * 0.74);
        b.box(0.05, 0.05, 0.03, a, sx * 0.1, hy + hs * 0.56, hs * 0.76);
      }
      b.box(hs * 1.1, hs * 0.95, hs * 0.18, m, 0, hy + 0.0, -hs * 0.52);
      break;
  }
}

// ---------------------------------------------------------------------------
// Éléments « héroïques » des personnages joueurs : épaulières, cols, fourreaux, emblèmes
function addShoulders(tb, P, sh) {
  const y = 0.1 + P.torsoH - 0.02, x0 = P.torsoW / 2 + 0.06;
  const c = sh.color, a = sh.accent || '#d9a441';
  for (const sx of [-1, 1]) {
    const x = sx * x0;
    switch (sh.style) {
      case 'plate':
        tb.box(0.34, 0.18, 0.42, c, x, y, 0);
        tb.box(0.3, 0.1, 0.38, shade(c, 0.82), x + sx * 0.03, y - 0.13, 0);
        tb.box(0.36, 0.045, 0.44, a, x, y + 0.08, 0);
        break;
      case 'spiked':
        tb.box(0.34, 0.18, 0.42, c, x, y, 0);
        tb.box(0.3, 0.1, 0.38, shade(c, 0.8), x + sx * 0.03, y - 0.13, 0);
        tb.box(0.36, 0.045, 0.44, a, x, y + 0.08, 0);
        for (let i = -1; i <= 1; i++) tb.cone(0.05, 0.24, 4, '#e0d8c8', x + sx * 0.05, y + 0.2, i * 0.13, 0, 0, -sx * 0.4);
        break;
      case 'winged':
        tb.box(0.32, 0.16, 0.4, c, x, y, 0);
        tb.box(0.34, 0.045, 0.42, a, x, y + 0.07, 0);
        tb.box(0.28, 0.08, 0.36, shade(c, 0.85), x + sx * 0.03, y - 0.11, 0);
        for (let i = 0; i < 3; i++) tb.box(0.05, 0.32 - i * 0.07, 0.08, a, x + sx * (0.1 + i * 0.05), y + 0.2 - i * 0.03, -0.1 + i * 0.1, 0, 0, -sx * (0.55 + i * 0.18));
        break;
      case 'bone':
        tb.box(0.26, 0.22, 0.26, '#e6dfcd', x, y + 0.05, 0.02);
        tb.box(0.2, 0.08, 0.2, '#cdc4ae', x, y - 0.09, 0.04);
        tb.box(0.06, 0.06, 0.02, '#1a1020', x - 0.05, y + 0.07, 0.15);
        tb.box(0.06, 0.06, 0.02, '#1a1020', x + 0.05, y + 0.07, 0.15);
        tb.cone(0.045, 0.2, 4, '#e6dfcd', x + sx * 0.12, y + 0.2, -0.02, 0, 0, -sx * 0.6);
        tb.box(0.3, 0.06, 0.34, c, x, y - 0.15, 0);
        break;
      case 'fur':
        tb.box(0.36, 0.17, 0.46, c, x, y, 0);
        tb.box(0.38, 0.08, 0.48, shade(c, 1.18), x, y + 0.08, 0);
        tb.box(0.08, 0.1, 0.08, '#efe6d0', x, y - 0.1, 0.2);
        break;
      case 'leaf':
        tb.box(0.14, 0.1, 0.14, '#8a6440', x, y - 0.03, 0);
        for (let i = 0; i < 3; i++) tb.box(0.28, 0.04, 0.17, i % 2 ? '#5a9a3a' : '#7fbf4a', x + sx * 0.04, y + 0.03 + i * 0.03, -0.13 + i * 0.13, 0.2, 0, -sx * (0.3 + i * 0.12));
        break;
      case 'mantle':
        tb.box(0.3, 0.12, 0.4, c, x, y - 0.02, 0);
        tb.box(0.32, 0.045, 0.42, a, x, y + 0.045, 0);
        tb.box(0.26, 0.2, 0.36, shade(c, 0.85), x + sx * 0.04, y - 0.14, 0);
        break;
      case 'pads':
        tb.box(0.27, 0.12, 0.34, c, x, y - 0.02, 0);
        tb.box(0.29, 0.04, 0.36, a, x, y - 0.1, 0);
        break;
    }
  }
}

function addBackItem(tb, P, type, c = {}) {
  const zb = -P.torsoD / 2 - 0.07, ty = 0.1 + P.torsoH * 0.62;
  const a = c.accent || '#d9a441';
  switch (type) {
    case 'sundisc':
      tb.cyl(0.3, 0.3, 0.04, 12, a, 0, ty + 0.18, zb - 0.1, PI / 2, 0, 0);
      tb.cyl(0.16, 0.16, 0.05, 10, '#fff4c8', 0, ty + 0.18, zb - 0.12, PI / 2, 0, 0);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * PI * 2; tb.box(0.04, 0.16, 0.03, a, Math.sin(an) * 0.38, ty + 0.18 + Math.cos(an) * 0.38, zb - 0.1, 0, 0, -an); }
      break;
    case 'totem':
      tb.box(0.14, 0.7, 0.14, '#7a5838', 0.16, ty + 0.1, zb - 0.06, 0, 0, -0.35);
      tb.box(0.2, 0.18, 0.18, '#a07a4a', 0.28, ty + 0.44, zb - 0.06, 0, 0, -0.35);
      tb.box(0.26, 0.05, 0.08, '#c83a2a', 0.29, ty + 0.5, zb - 0.02, 0, 0, -0.35);
      tb.box(0.1, 0.06, 0.03, '#1a1410', 0.29, ty + 0.44, zb + 0.04, 0, 0, -0.35);
      break;
    case 'sheaths':
      for (const sx of [-1, 1]) {
        tb.box(0.07, 0.46, 0.05, '#3a2a22', sx * 0.1, ty - 0.2, zb, 0, 0, sx * 0.6);
        tb.box(0.12, 0.05, 0.07, a, sx * 0.19, ty - 0.02, zb, 0, 0, sx * 0.6);
      }
      break;
    case 'tomechain':
      tb.box(0.09, 0.26, 0.2, '#3a2438', P.torsoW / 2 + 0.05, 0.1, 0.04);
      tb.box(0.1, 0.06, 0.06, a, P.torsoW / 2 + 0.05, 0.1, 0.15);
      break;
  }
}

function addEmblem(cb, kind, y, color, z) {
  if (kind === 'azur') {
    cb.box(0.2, 0.2, 0.02, color, 0, y, z, 0, 0, PI / 4);
    cb.box(0.08, 0.08, 0.025, '#4f8dff', 0, y, z - 0.005, 0, 0, PI / 4);
    cb.box(0.03, 0.34, 0.02, color, 0, y, z + 0.002);
  } else {
    cb.box(0.08, 0.3, 0.02, color, 0, y, z);
    cb.box(0.06, 0.2, 0.02, color, -0.09, y - 0.04, z, 0, 0, 0.35);
    cb.box(0.06, 0.2, 0.02, color, 0.09, y - 0.04, z, 0, 0, -0.35);
    cb.box(0.22, 0.04, 0.025, '#ff5a36', 0, y - 0.15, z - 0.004);
  }
}

// ---------------------------------------------------------------------------
// Quadrupède
function buildQuadruped(spec, mat) {
  const s = spec;
  const main = s.color || '#7a7a80', belly = s.belly || shade(main, 1.2), dark = s.dark || shade(main, 0.7);
  const L = s.len || 1.2, Wd = s.wid || 0.5, Hb = s.hgt || 0.5, legH = s.legH || 0.5, legW = s.legW || 0.14;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = legH + Hb / 2;
  root.add(body);
  const parts = { root, body };
  const bb = B();
  bb.box(Wd, Hb, L, main, 0, 0, 0);
  bb.box(Wd * 0.9, Hb * 0.25, L * 0.8, belly, 0, -Hb * 0.4, 0);
  if (s.mane) bb.box(Wd * 1.1, Hb * 0.5, L * 0.35, s.mane, 0, Hb * 0.25, L * 0.3);
  if (s.spikes) for (let i = 0; i < 4; i++) bb.cone(0.07, 0.28, 4, s.spikes, 0, Hb / 2 + 0.1, L * 0.3 - i * L * 0.2);
  if (s.shell) bb.box(Wd * 1.1, Hb * 0.5, L * 0.9, s.shell, 0, Hb * 0.4, -L * 0.05);
  if (s.cracks) for (let i = 0; i < 3; i++) bb.box(Wd * 1.01, 0.05, 0.08, s.cracks, 0, -0.05 + i * 0.08, -L * 0.3 + i * L * 0.3);
  if (s.spots) for (let i = 0; i < 5; i++) bb.box(0.12, 0.02, 0.12, s.spots, (i % 2 ? 1 : -1) * Wd * 0.2, Hb / 2 + 0.005, -L * 0.35 + i * L * 0.17);
  if (s.saddle) {
    bb.box(Wd * 1.05, 0.12, L * 0.35, s.saddle, 0, Hb / 2 + 0.05, 0.02);
    bb.box(Wd * 1.1, Hb * 0.8, 0.05, s.saddle2 || s.saddle, 0, -0.05, 0.02);
  }
  parts.torso = part(body, bb, mat, 0, 0, 0);
  // tête
  const hb = B();
  const hsz = s.headS || 0.36;
  const hlen = s.headL || hsz * 1.1;
  hb.box(hsz, hsz * 0.9, hlen, main, 0, 0, hlen * 0.4);
  if (s.snout !== false) hb.box(hsz * 0.62, hsz * 0.5, s.snoutL || hsz * 0.6, s.snoutColor || belly, 0, -hsz * 0.15, hlen * 0.9 + (s.snoutL || hsz * 0.6) * 0.3);
  hb.box(hsz * 0.18, hsz * 0.14, 0.04, '#111', 0, -hsz * 0.05, hlen * 0.9 + (s.snoutL || hsz * 0.6) * 0.8);
  for (const sx of [-1, 1]) {
    hb.box(0.07, 0.07, 0.04, s.eyes || '#1a1a1a', sx * hsz * 0.34, hsz * 0.15, hlen * 0.88);
    if (s.ears === 'pointy') hb.cone(0.08, 0.22, 4, dark, sx * hsz * 0.3, hsz * 0.55, hlen * 0.2);
    if (s.ears === 'round') hb.box(0.12, 0.12, 0.06, dark, sx * hsz * 0.4, hsz * 0.48, hlen * 0.2);
    if (s.ears === 'long') hb.box(0.08, 0.36, 0.08, dark, sx * hsz * 0.22, hsz * 0.6, hlen * 0.1, -0.2, 0, sx * 0.15);
    if (s.tusks) hb.cone(0.04, 0.2, 4, '#efe6d0', sx * hsz * 0.28, -hsz * 0.05, hlen * 1.1, -0.9, 0, 0);
    if (s.horns) hb.cone(0.06, 0.34, 4, s.horns, sx * hsz * 0.3, hsz * 0.55, hlen * 0.3, -0.4, 0, -sx * 0.35);
  }
  if (s.horn) hb.cone(0.06, 0.3, 4, s.horn, 0, hsz * 0.55, hlen * 0.7, 0.3, 0, 0);
  const head = part(body, hb, mat, 0, Hb * (s.headUp ?? 0.25), L / 2);
  if (s.neck) head.position.y += s.neck;
  parts.head = head;
  // queue
  if (s.tail !== 'none') {
    const tb = B();
    const tl = s.tailL || 0.5;
    if (s.tail === 'short') tb.box(0.1, 0.1, 0.18, dark, 0, 0, -0.09);
    else if (s.tail === 'thick') { tb.box(0.26, 0.22, tl, main, 0, 0, -tl / 2); tb.box(0.16, 0.14, tl * 0.7, main, 0, -0.03, -tl * 1.2); }
    else tb.box(0.1, 0.1, tl, dark, 0, 0, -tl / 2);
    const tail = part(body, tb, mat, 0, Hb * 0.25, -L / 2);
    tail.rotation.x = s.tail === 'thick' ? 0.15 : -0.5;
    parts.tail = tail;
  }
  // pattes
  const lx = Wd / 2 - legW / 2, lz = L / 2 - legW;
  const legs = [];
  for (const [sx, sz, name] of [[-1, 1, 'legFL'], [1, 1, 'legFR'], [-1, -1, 'legBL'], [1, -1, 'legBR']]) {
    const lb = B();
    lb.box(legW, legH, legW * 1.1, s.legColor || main, 0, -legH / 2, 0);
    lb.box(legW * 1.1, legH * 0.18, legW * 1.3, s.feet || dark, 0, -legH + legH * 0.09, 0.02);
    const leg = part(body, lb, mat, sx * lx, -Hb * 0.3, sz * lz);
    leg.position.y = -Hb / 2 + 0.02;
    parts[name] = leg;
    legs.push(leg);
  }
  return { parts, height: legH + Hb + hsz, radius: Math.max(Wd, L) * 0.55 };
}

// ---------------------------------------------------------------------------
// Insectes (araignée / scorpion)
function buildInsect(spec, mat) {
  const s = spec;
  const main = s.color || '#3a2a2a', dark = s.dark || shade(main, 0.7), mark = s.mark || '#c83a2a';
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  const parts = { root, body, legsList: [] };
  const bb = B();
  bb.box(0.6, 0.4, 0.6, main, 0, 0, 0.2);
  if (s.scorpion) {
    bb.box(0.7, 0.28, 0.9, main, 0, -0.05, -0.4);
    for (let i = 0; i < 3; i++) bb.box(0.72, 0.05, 0.1, dark, 0, 0.1, -0.1 - i * 0.28);
  } else {
    bb.box(0.9, 0.8, 1.0, dark, 0, 0.18, -0.55);
    bb.box(0.3, 0.3, 0.05, mark, 0, 0.35, -1.06);
  }
  for (const sx of [-1, 1]) {
    bb.box(0.08, 0.08, 0.04, s.eyes || '#ff3030', sx * 0.12, 0.08, 0.51);
    bb.box(0.06, 0.06, 0.04, s.eyes || '#ff3030', sx * 0.2, 0.14, 0.5);
    bb.box(0.05, 0.18, 0.05, dark, sx * 0.12, -0.18, 0.5, 0.3, 0, 0);
  }
  parts.torso = part(body, bb, mat, 0, 0, 0);
  const n = s.scorpion ? 3 : 4;
  for (let i = 0; i < n; i++) {
    for (const sx of [-1, 1]) {
      const lb = B();
      lb.box(0.6, 0.07, 0.07, main, sx * 0.3, 0.1, 0, 0, 0, sx * -0.5);
      lb.box(0.07, 0.62, 0.07, dark, sx * 0.62, -0.18, 0, 0, 0, sx * 0.25);
      const leg = part(body, lb, mat, sx * 0.25, 0, 0.35 - i * (s.scorpion ? 0.4 : 0.22));
      leg.rotation.y = sx * (0.5 - i * 0.3);
      leg.userData.side = sx; leg.userData.i = i;
      parts.legsList.push(leg);
    }
  }
  if (s.scorpion) {
    // pinces
    for (const sx of [-1, 1]) {
      const cb = B();
      cb.box(0.1, 0.1, 0.5, main, 0, 0, 0.25);
      cb.box(0.22, 0.14, 0.28, dark, 0, 0, 0.6);
      cb.box(0.08, 0.1, 0.26, dark, sx * 0.07, 0, 0.82);
      const claw = part(body, cb, mat, sx * 0.35, 0, 0.45);
      claw.rotation.y = -sx * 0.4;
      parts[sx < 0 ? 'clawL' : 'clawR'] = claw;
    }
    // queue articulée
    let prev = body;
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const sb = B();
      sb.box(0.2 - i * 0.02, 0.2 - i * 0.02, 0.28, i === 4 ? dark : main, 0, 0, -0.14);
      if (i === 4) sb.cone(0.07, 0.28, 4, s.stinger || '#e0d040', 0, -0.1, -0.3, -2.2, 0, 0);
      const seg = part(prev, sb, mat, 0, i === 0 ? 0.05 : 0, i === 0 ? -0.85 : -0.28);
      seg.rotation.x = i === 0 ? 0.9 : 0.55;
      segs.push(seg);
      prev = seg;
    }
    parts.tailSegs = segs;
  }
  return { parts, height: 1.1, radius: 0.8 };
}

// ---------------------------------------------------------------------------
// Gelée (cube sautillant)
function buildBlob(spec, mat) {
  const s = spec;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bb = B();
  const c = s.color || '#5ad05a';
  bb.box(0.9, 0.8, 0.9, c, 0, 0.4, 0);
  bb.box(0.5, 0.45, 0.5, shade(c, 0.7), 0, 0.35, 0);
  for (const sx of [-1, 1]) {
    bb.box(0.14, 0.18, 0.04, '#111', sx * 0.18, 0.55, 0.46);
    bb.box(0.06, 0.06, 0.02, '#fff', sx * 0.16, 0.6, 0.48);
  }
  bb.box(0.3, 0.06, 0.03, '#113311', 0, 0.36, 0.46);
  if (s.leech) {
    for (let i = 0; i < 4; i++) bb.box(0.85, 0.05, 0.1, shade(c, 0.8), 0, 0.2 + i * 0.16, -0.46);
  }
  const m = part(body, bb, mat, 0, 0, 0);
  const parts = { root, body, torso: m, blob: true };
  if (s.transparent) { mat.transparent = true; mat.opacity = 0.82; }
  return { parts, height: 0.9, radius: 0.6 };
}

// ---------------------------------------------------------------------------
// Volants (chauve-souris, vautour)
function buildFlyer(spec, mat) {
  const s = spec;
  const c = s.color || '#4a3a4a', wc = s.wing || shade(c, 0.85);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = s.hover || 2.2;
  root.add(body);
  const bb = B();
  bb.box(0.45, 0.4, 0.6, c, 0, 0, 0);
  bb.box(0.36, 0.34, 0.3, c, 0, 0.1, 0.4);
  if (s.beak) bb.box(0.12, 0.1, 0.22, s.beak, 0, 0.05, 0.62);
  if (s.neck) bb.box(0.14, 0.2, 0.14, s.neck, 0, 0.3, 0.45);
  if (s.ears) for (const sx of [-1, 1]) bb.cone(0.07, 0.2, 4, c, sx * 0.12, 0.35, 0.4);
  for (const sx of [-1, 1]) bb.box(0.06, 0.06, 0.03, s.eyes || '#ff4040', sx * 0.1, 0.14, 0.56);
  bb.box(0.14, 0.14, 0.3, shade(c, 0.8), 0, -0.05, -0.4);
  const torso = part(body, bb, mat, 0, 0, 0);
  const parts = { root, body, torso };
  for (const side of [-1, 1]) {
    const wb = B();
    const span = s.span || 1.0;
    wb.box(span, 0.05, 0.5, wc, side * span / 2, 0, 0);
    wb.box(span * 0.7, 0.04, 0.3, shade(wc, 0.9), side * span * 1.15, 0, -0.08);
    const w = part(body, wb, mat, side * 0.2, 0.08, 0);
    parts[side < 0 ? 'wingL' : 'wingR'] = w;
  }
  return { parts, height: (s.hover || 2.2) + 0.4, radius: 0.6, flying: true };
}

// ---------------------------------------------------------------------------
// Flottants (feu-follet, élémentaires)
function buildFloater(spec, mat) {
  const s = spec;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = s.hover || 1.4;
  root.add(body);
  const parts = { root, body, orbit: [] };
  const bb = B();
  const c = s.color || '#7fe0ff';
  if (s.kind === 'wisp') {
    bb.ico(0.35, c, 0, 0, 0);
    bb.ico(0.22, '#ffffff', 0, 0, 0);
  } else if (s.kind === 'crystal') {
    bb.octa(0.55, c, 0, 0, 0, 1, 1.7, 1);
    bb.octa(0.3, shade(c, 1.2), 0.5, 0.2, 0, 1, 1.5, 1, 0, -0.5);
    bb.octa(0.3, shade(c, 1.2), -0.5, 0.1, 0, 1, 1.5, 1, 0, 0.5);
  } else {
    bb.box(0.9, 1.1, 0.7, c, 0, 0, 0);
    bb.box(0.5, 0.5, 0.2, s.core || '#ffffff', 0, 0.1, 0.36);
  }
  parts.torso = part(body, bb, mat, 0, 0, 0);
  const n = s.bits ?? 3;
  for (let i = 0; i < n; i++) {
    const ob = B();
    if (s.kind === 'wisp') ob.ico(0.08, c, 0, 0, 0);
    else ob.box(0.26, 0.26, 0.26, s.bitColor || c, 0, 0, 0);
    const o = part(body, ob, mat, 0, 0, 0);
    o.userData.a = (i / n) * PI * 2;
    parts.orbit.push(o);
  }
  if (s.kind === 'storm' || s.kind === 'crystal') mat.emissive = new THREE.Color(c).multiplyScalar(0.25);
  if (s.kind === 'wisp') mat.emissive = new THREE.Color(c).multiplyScalar(0.7);
  return { parts, height: (s.hover || 1.4) + 0.8, radius: 0.6, floating: true };
}

// ---------------------------------------------------------------------------
// Ver (sangsue)
function buildWorm(spec, mat) {
  const s = spec;
  const c = s.color || '#4a3a3a';
  const root = new THREE.Group();
  const parts = { root, segs: [] };
  const n = 7;
  for (let i = 0; i < n; i++) {
    const b = B();
    const w = 0.5 - Math.abs(i - 2) * 0.05;
    b.box(w, w * 0.8, 0.4, i % 2 ? c : shade(c, 1.15), 0, 0, 0);
    if (i === 0) {
      b.box(w * 0.7, w * 0.6, 0.1, '#2a1010', 0, 0, 0.22);
      for (let k = 0; k < 6; k++) b.box(0.04, 0.08, 0.04, '#efe6d0', Math.cos(k) * 0.14, Math.sin(k) * 0.12, 0.26);
    }
    const seg = part(root, b, mat, 0, w * 0.4, -i * 0.38);
    parts.segs.push(seg);
  }
  parts.body = parts.segs[0];
  parts.torso = parts.segs[0];
  return { parts, height: 0.6, radius: 0.6 };
}

// ---------------------------------------------------------------------------
// Drake / wyrm
function buildDrake(spec, mat) {
  const s = spec;
  const c = s.color || '#6a2a2a', belly = s.belly || '#c89a6a', wc = s.wing || shade(c, 0.8), horn = s.horn || '#e8e0d0';
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.2;
  root.add(body);
  const parts = { root, body, neck: [], tailSegs: [] };
  const bb = B();
  bb.box(1.2, 1.0, 2.2, c, 0, 0, 0);
  bb.box(1.0, 0.3, 2.0, belly, 0, -0.45, 0);
  for (let i = 0; i < 5; i++) bb.cone(0.12, 0.4, 4, horn, 0, 0.6, 0.8 - i * 0.45);
  parts.torso = part(body, bb, mat, 0, 0, 0);
  // cou
  let prev = body;
  for (let i = 0; i < 3; i++) {
    const nb = B();
    nb.box(0.55 - i * 0.05, 0.55 - i * 0.05, 0.6, c, 0, 0, 0.3);
    nb.cone(0.08, 0.26, 4, horn, 0, 0.3, 0.3);
    const seg = part(prev, nb, mat, 0, i === 0 ? 0.3 : 0.05, i === 0 ? 1.1 : 0.55);
    seg.rotation.x = i === 0 ? -0.5 : -0.15;
    parts.neck.push(seg);
    prev = seg;
  }
  const hb = B();
  hb.box(0.6, 0.5, 0.7, c, 0, 0, 0.3);
  hb.box(0.45, 0.28, 0.5, c, 0, -0.08, 0.85);
  hb.box(0.4, 0.1, 0.45, '#2a1010', 0, -0.2, 0.8);
  for (const sx of [-1, 1]) {
    hb.box(0.1, 0.08, 0.05, s.eyes || '#ffd040', sx * 0.22, 0.12, 0.62);
    hb.cone(0.08, 0.6, 5, horn, sx * 0.22, 0.35, 0.0, -1.1, 0, -sx * 0.2);
  }
  const head = part(prev, hb, mat, 0, 0.05, 0.6);
  head.rotation.x = 0.55;
  parts.head = head;
  // queue
  prev = body;
  for (let i = 0; i < 5; i++) {
    const tb = B();
    const w = 0.5 - i * 0.08;
    tb.box(w, w, 0.6, c, 0, 0, -0.3);
    if (i === 4) tb.cone(0.25, 0.5, 4, horn, 0, 0, -0.7, -PI / 2, 0, 0);
    const seg = part(prev, tb, mat, 0, i === 0 ? 0 : 0, i === 0 ? -1.05 : -0.58);
    seg.rotation.x = 0.15;
    parts.tailSegs.push(seg);
    prev = seg;
  }
  // pattes
  for (const [sx, sz, name] of [[-1, 1, 'legFL'], [1, 1, 'legFR'], [-1, -1, 'legBL'], [1, -1, 'legBR']]) {
    const lb = B();
    lb.box(0.32, 1.0, 0.36, c, 0, -0.5, 0);
    lb.box(0.4, 0.16, 0.52, shade(c, 0.8), 0, -1.0, 0.1);
    const leg = part(body, lb, mat, sx * 0.55, -0.3, sz * 0.75);
    leg.position.y = -0.2;
    parts[name] = leg;
  }
  // ailes
  for (const side of [-1, 1]) {
    const wb = B();
    wb.box(2.4, 0.08, 0.14, shade(c, 0.9), side * 1.2, 0, 0);
    wb.box(2.2, 0.04, 1.4, wc, side * 1.2, -0.02, -0.72);
    wb.box(1.2, 0.04, 0.7, wc, side * 2.6, -0.02, -0.5);
    const w = part(body, wb, mat, side * 0.45, 0.45, 0.3);
    parts[side < 0 ? 'wingL' : 'wingR'] = w;
  }
  return { parts, height: 3.4, radius: 1.5 };
}

const BUILDERS = { humanoid: buildHumanoid, quadruped: buildQuadruped, insect: buildInsect, blob: buildBlob, flyer: buildFlyer, floater: buildFloater, worm: buildWorm, drake: buildDrake };

// ---------------------------------------------------------------------------
// Modèle animé
export class Model {
  constructor(spec) {
    this.spec = spec;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    if (spec.opacity) { this.mat.transparent = true; this.mat.opacity = spec.opacity; this.mat.depthWrite = false; }
    if (spec.emissive) this.mat.emissive = new THREE.Color(spec.emissive);
    this.baseEmissive = this.mat.emissive.clone();
    this.baseOpacity = spec.opacity || 1;
    const r = BUILDERS[spec.rig || 'humanoid'](spec, this.mat);
    this.parts = r.parts;
    this.root = r.parts.root;
    this.flying = !!r.flying;
    this.floating = !!r.floating || !!spec.floating;
    const sc = spec.scale || 1;
    this.root.scale.setScalar(sc);
    this.height = r.height * sc;
    this.radius = r.radius * sc;
    this.rig = spec.rig || 'humanoid';
    this.phase = Math.random() * 10;
    this.action = null; // {name, t, dur}
    this.pose = 'idle';
    this.dead = false;
    this.deathT = 0;
    this.flashT = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
    this.t = Math.random() * 10;
    this.weapon = null;
    this.offhand = null;
    this.mounted = false;
    this.sitting = false;
    this.airborne = false;
  }

  setWeapon(type, colors = {}) {
    const h = this.parts.handR;
    if (!h) return;
    if (this.weapon) { this.weapon.parent?.remove(this.weapon); this.weapon.geometry.dispose(); this.weapon = null; }
    if (!type) return;
    const g = weaponGeo(type, colors);
    if (g.empty) return;
    this.weapon = new THREE.Mesh(g.build(), this.mat);
    this.weapon.castShadow = true;
    this.weaponType = type;
    const gl = weaponGlowGeo(type, colors);
    if (!gl.empty) this.weapon.add(new THREE.Mesh(gl.build(), vcGlowMaterial()));
    if (type === 'bow') {
      // l'arc est tenu dans la main gauche
      this.parts.handL.add(this.weapon);
      this.weapon.rotation.set(0, 0, 0);
      this.weapon.position.set(0, 0, 0.05);
    } else {
      h.add(this.weapon);
      this.weapon.rotation.x = PI / 2;
      this.weapon.position.set(0, -0.02, 0.02);
    }
  }

  setOffhand(type, colors) {
    const h = this.parts.handL;
    if (!h) return;
    if (this.offhand) { this.offhand.parent?.remove(this.offhand); this.offhand.geometry.dispose(); this.offhand = null; }
    if (!type) return;
    if (type === 'quiver') {
      const b = B();
      b.cyl(0.11, 0.11, 0.6, 6, '#6b4a2e', 0, 0, 0);
      for (let i = 0; i < 4; i++) b.box(0.03, 0.2, 0.03, '#e8e0d0', (i - 1.5) * 0.04, 0.38, 0);
      this.offhand = new THREE.Mesh(b.build(), this.mat);
      this.parts.torso.add(this.offhand);
      this.offhand.position.set(0.15, 0.55, -0.24);
      this.offhand.rotation.z = -0.5;
      return;
    }
    const g = offhandGeo(type, colors);
    if (g.empty) return;
    this.offhand = new THREE.Mesh(g.build(), this.mat);
    this.offhand.castShadow = true;
    const gl = offhandGlowGeo(type, colors || {});
    if (!gl.empty) this.offhand.add(new THREE.Mesh(gl.build(), vcGlowMaterial()));
    h.add(this.offhand);
    if (type === 'shield' || type === 'buckler') this.offhand.position.set(-0.08, 0.05, 0.05);
    if (type === 'dagger') { this.offhand.rotation.x = PI / 2; this.offhand.position.set(0, -0.02, 0.02); this.dual = true; }
  }

  play(name, dur = 0.5) {
    if (this.dead && name !== 'revive') return;
    this.action = { name, t: 0, dur };
  }
  flash(color = 0xffffff, t = 0.12) {
    this.flashColor.set(color);
    this.flashT = t;
  }
  die() {
    this.dead = true;
    this.deathT = 0;
    this.action = null;
  }
  revive() {
    this.dead = false;
    this.deathT = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.parts.body.position.x = 0;
  }

  // speed : vitesse horizontale actuelle (m/s)
  // camouflage : modèle translucide (k = opacité), éclats lumineux masqués
  setStealth(k) {
    if (this._stealth === k) return;
    this._stealth = k;
    const on = k < 1;
    this.mat.transparent = on || this.baseOpacity < 1;
    this.mat.opacity = on ? k : this.baseOpacity;
    this.mat.depthWrite = !this.mat.transparent;
    this.mat.needsUpdate = true;
    this.root.traverse((o) => { if (o.isMesh && o.material !== this.mat) { if (on) { o.userData.stealthHid = o.visible; o.visible = false; } else if (o.userData.stealthHid !== undefined) { o.visible = o.userData.stealthHid; delete o.userData.stealthHid; } } });
  }

  update(dt, speed = 0) {
    this.t += dt;
    const P = this.parts;
    // flash de dégâts
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.mat.emissive.copy(this.flashColor).multiplyScalar(Math.max(0, this.flashT) * 5);
      if (this.flashT <= 0) this.mat.emissive.copy(this.baseEmissive);
    }
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.55);
      const e = 1 - (1 - k) * (1 - k);
      if (this.rig === 'humanoid') {
        this.root.rotation.x = -e * PI / 2 * 0.95;
        P.body.position.y = lerp(P.body.position.y, (P.P?.hipY || 0.8) * 0.35, 0.2);
      } else if (this.rig === 'blob') {
        P.body.scale.set(1 + e * 0.5, 1 - e * 0.8, 1 + e * 0.5);
      } else if (this.flying || this.floating) {
        P.body.position.y = lerp(P.body.position.y, 0.3, Math.min(1, dt * 6));
        this.root.rotation.z = e * PI / 2;
      } else {
        this.root.rotation.z = e * PI / 2;
      }
      return;
    }
    const act = this.action;
    let actK = 0;
    if (act) {
      act.t += dt;
      actK = act.t / act.dur;
      if (actK >= 1) { this.action = null; actK = 0; }
    }
    const moving = speed > 0.3;
    const runF = clamp(speed / 7, 0, 1.4);
    if (moving) this.phase += dt * (4 + speed * 1.25);
    const ph = this.phase;
    const sw = moving ? Math.sin(ph) : 0;

    switch (this.rig) {
      case 'humanoid': this.animHumanoid(dt, act, actK, moving, runF, ph, sw); break;
      case 'quadruped': this.animQuad(dt, act, actK, moving, runF, ph); break;
      case 'insect': this.animInsect(dt, act, actK, moving, ph); break;
      case 'blob': this.animBlob(dt, act, actK, moving, ph); break;
      case 'flyer': this.animFlyer(dt, act, actK, moving); break;
      case 'floater': this.animFloater(dt, act, actK); break;
      case 'worm': this.animWorm(dt, act, actK, moving, ph); break;
      case 'drake': this.animDrake(dt, act, actK, moving, ph); break;
    }
  }

  animHumanoid(dt, act, k, moving, runF, ph, sw) {
    const P = this.parts;
    const hipY = P.P.hipY;
    const t = this.t;
    let legA = sw * 0.75 * runF, armA = -sw * 0.6 * runF;
    let bodyY = hipY + (moving ? Math.abs(Math.cos(ph)) * 0.06 * runF : Math.sin(t * 2) * 0.012);
    let torsoX = moving ? 0.08 * runF : 0, torsoY = 0;
    let aL = armA, aR = -armA, aLz = 0.08, aRz = -0.08, aLy = 0, aRy = 0;
    let headX = 0;
    const hasLegs = !!P.legL;
    if (this.sitting && hasLegs) {
      bodyY = hipY * 0.45;
      P.legL.rotation.x = -1.4; P.legR.rotation.x = -1.4;
      P.armL.rotation.x = -0.3; P.armR.rotation.x = -0.3;
      P.body.position.y = bodyY;
      return;
    }
    if (this.mounted && hasLegs) {
      legA = 0;
      P.legL.rotation.set(-1.1, 0, 0.35); P.legR.rotation.set(-1.1, 0, -0.35);
      aL = -0.4; aR = -0.4;
      bodyY = hipY;
    }
    if (this.airborne && !this.mounted && hasLegs) { legA = 0; P.legL.rotation.x = -0.6; P.legR.rotation.x = 0.3; aLz = 0.6; aRz = -0.6; }
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      switch (act.name) {
        case 'attack': { // coup de taille
          const a = k < 0.35 ? lerp(0, -2.4, k / 0.35) : lerp(-2.4, 0.5, Math.min(1, (k - 0.35) / 0.3));
          aR = a; aRz = -0.2; torsoY = k < 0.35 ? 0.35 * (k / 0.35) : lerp(0.35, -0.3, Math.min(1, (k - 0.35) / 0.3));
          break;
        }
        case 'attack2': { // estoc (main gauche pour les lames jumelles)
          if (this.dual) { aL = lerp(-0.4, -1.6, e); aLz = 0; torsoY = 0.2 * e; torsoX = 0.15 * e; }
          else { aR = lerp(-0.4, -1.5, e); aRz = 0; torsoY = -0.2 * e; torsoX = 0.15 * e; }
          break;
        }
        case 'slam': {
          const a = k < 0.5 ? lerp(0, -2.9, k / 0.5) : lerp(-2.9, -0.8, Math.min(1, (k - 0.5) / 0.25));
          aR = a; aL = a; torsoX = k > 0.5 ? 0.3 : -0.1;
          break;
        }
        case 'spin': {
          torsoY = k * PI * 2; aR = -1.4; aL = -1.4; aRz = -1.2; aLz = 1.2;
          break;
        }
        case 'cast': {
          aR = -1.6 * e - 0.2; aL = -1.6 * e - 0.2; aRz = -0.3 * e; aLz = 0.3 * e; headX = -0.15 * e;
          break;
        }
        case 'channel': {
          aR = -1.3 + Math.sin(t * 8) * 0.1; aL = -1.3 + Math.cos(t * 8) * 0.1; aRz = -0.4; aLz = 0.4;
          break;
        }
        case 'raise': {
          aR = -2.8 * e; aL = -2.8 * e; aRz = -0.2; aLz = 0.2;
          break;
        }
        case 'shoot': {
          aL = -1.55; aLy = 0; aLz = 0.05;
          aR = -1.5; aRy = lerp(0, 0.9, Math.min(1, k * 1.6)); aRz = 0;
          torsoY = -0.25;
          break;
        }
        case 'throw': {
          aR = k < 0.4 ? lerp(0, -2.6, k / 0.4) : lerp(-2.6, -0.6, (k - 0.4) / 0.6);
          break;
        }
        case 'hit': {
          torsoX = -0.25 * e; headX = -0.2 * e;
          break;
        }
        case 'block': {
          aL = -1.3; aLy = 0.6; aLz = 0.2;
          break;
        }
        case 'wave': {
          aR = -2.6; aRz = -0.3 + Math.sin(k * PI * 6) * 0.35;
          break;
        }
        case 'dance': {
          aR = -2.6 + Math.sin(k * PI * 8) * 0.5; aL = -2.6 + Math.cos(k * PI * 8) * 0.5; torsoY = Math.sin(k * PI * 4) * 0.4;
          legA = Math.sin(k * PI * 8) * 0.4;
          break;
        }
        case 'roar': {
          aR = -2.2 * e; aL = -2.2 * e; aRz = -0.7 * e; aLz = 0.7 * e; headX = -0.4 * e; torsoX = -0.2 * e;
          break;
        }
        case 'leap': {
          legA = 0; if (hasLegs) { P.legL.rotation.x = -0.9 * e; P.legR.rotation.x = -0.5 * e; } aR = -2.4 * e; aL = -1.2 * e;
          break;
        }
      }
    }
    P.body.position.y = lerp(P.body.position.y, bodyY, Math.min(1, dt * 20));
    if (hasLegs && !this.mounted && !(this.airborne && !act)) {
      P.legL.rotation.x = legA; P.legR.rotation.x = -legA;
      P.legL.rotation.z = 0; P.legR.rotation.z = 0;
    }
    P.torso.rotation.x = torsoX + (this.spec.hunch ? 0.25 : 0);
    P.torso.rotation.y = torsoY;
    P.head.rotation.x = headX;
    const s = Math.min(1, dt * 18);
    P.armL.rotation.x = lerp(P.armL.rotation.x, aL, s);
    P.armR.rotation.x = lerp(P.armR.rotation.x, aR, s);
    P.armL.rotation.z = lerp(P.armL.rotation.z, aLz, s);
    P.armR.rotation.z = lerp(P.armR.rotation.z, aRz, s);
    P.armL.rotation.y = lerp(P.armL.rotation.y, aLy, s);
    P.armR.rotation.y = lerp(P.armR.rotation.y, aRy, s);
    if (P.cape) P.cape.rotation.x = 0.1 + (moving ? 0.35 * runF : 0.05 * Math.sin(this.t * 1.5));
    if (P.wingL) {
      const f = this.spec.flapAlways || (this.airborne) ? Math.sin(this.t * 14) * 0.6 : Math.sin(this.t * 2) * 0.1;
      P.wingL.rotation.z = -0.3 + f; P.wingR.rotation.z = 0.3 - f;
    }
    if (P.robe) P.robe.rotation.x = moving ? -0.3 : 0;
    if (P.skirt) P.skirt.rotation.x = lerp(P.skirt.rotation.x, moving ? -0.18 * runF : Math.sin(this.t * 1.3) * 0.02, Math.min(1, dt * 8));
    if (P.scarf) P.scarf.rotation.x = 0.25 + (moving ? 0.6 * runF : 0.08 * Math.sin(this.t * 2.1));
    if (this.spec.floating) P.body.position.y = hipY + 0.35 + Math.sin(this.t * 2) * 0.12;
  }

  animQuad(dt, act, k, moving, runF, ph) {
    const P = this.parts;
    const a = moving ? Math.sin(ph) * 0.7 * Math.min(1, runF + 0.3) : 0;
    P.legFL.rotation.x = a; P.legBR.rotation.x = a;
    P.legFR.rotation.x = -a; P.legBL.rotation.x = -a;
    const baseY = P.body.userData.baseY ?? (P.body.userData.baseY = P.body.position.y);
    P.body.position.y = baseY + (moving ? Math.abs(Math.cos(ph)) * 0.05 : Math.sin(this.t * 2) * 0.01);
    let headX = moving ? 0.1 : Math.sin(this.t * 1.3) * 0.08, bodyX = 0, bodyZ = 0;
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      if (act.name === 'attack' || act.name === 'attack2' || act.name === 'bite') { headX = 0.5 * e; bodyX = 0.15 * e; P.body.position.z = 0.25 * e; }
      else if (act.name === 'roar' || act.name === 'cast') { headX = -0.6 * e; }
      else if (act.name === 'hit') { bodyX = -0.15 * e; }
      else if (act.name === 'charge' || act.name === 'slam') { bodyX = 0.2 * e; P.body.position.z = 0.4 * e; }
    } else P.body.position.z = 0;
    P.head.rotation.x = headX;
    P.body.rotation.x = bodyX;
    P.body.rotation.z = bodyZ;
    if (P.tail) P.tail.rotation.y = Math.sin(this.t * (moving ? 10 : 3)) * 0.3;
    if (this.mounted) { /* monture : rien de spécial */ }
  }

  animInsect(dt, act, k, moving, ph) {
    const P = this.parts;
    for (const leg of P.legsList) {
      const o = leg.userData.i * 1.3 + (leg.userData.side > 0 ? PI : 0);
      leg.rotation.x = moving ? Math.sin(ph * 1.4 + o) * 0.35 : 0;
      leg.rotation.z = moving ? Math.max(0, Math.cos(ph * 1.4 + o)) * 0.3 * leg.userData.side : 0;
    }
    P.body.position.y = 0.55 + (moving ? Math.sin(ph * 2.8) * 0.03 : 0);
    let bx = 0;
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      bx = (act.name === 'hit' ? -0.2 : 0.3) * e;
      if (P.tailSegs && (act.name === 'attack' || act.name === 'sting')) P.tailSegs[0].rotation.x = 0.9 + 0.6 * e;
      if (P.clawL && act.name !== 'sting') { P.clawL.rotation.y = 0.4 - 0.5 * e; P.clawR.rotation.y = -0.4 + 0.5 * e; }
    }
    P.body.rotation.x = -bx;
  }

  animBlob(dt, act, k, moving, ph) {
    const P = this.parts;
    const hop = moving ? Math.abs(Math.sin(ph * 0.8)) : 0;
    P.body.position.y = hop * 0.45;
    const sq = moving ? 1 - Math.cos(ph * 1.6) * 0.12 : 1 + Math.sin(this.t * 3) * 0.04;
    let sy = sq, sxz = 1 / Math.sqrt(sq);
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      sy *= 1 - 0.35 * e; sxz *= 1 + 0.25 * e;
    }
    P.body.scale.set(sxz, sy, sxz);
  }

  animFlyer(dt, act, k, moving) {
    const P = this.parts;
    const f = Math.sin(this.t * 13) * 0.7;
    P.wingL.rotation.z = f; P.wingR.rotation.z = -f;
    const hover = this.spec.hover || 2.2;
    let y = hover + Math.sin(this.t * 3) * 0.2;
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      if (act.name !== 'hit') y -= e * (hover - 1.0);
    }
    P.body.position.y = lerp(P.body.position.y, y, Math.min(1, dt * 10));
    P.body.rotation.x = moving ? 0.25 : 0;
  }

  animFloater(dt, act, k) {
    const P = this.parts;
    const hover = this.spec.hover || 1.4;
    P.body.position.y = hover + Math.sin(this.t * 2.2) * 0.18;
    P.torso.rotation.y += dt * (this.spec.kind === 'crystal' ? 0.8 : 0.3);
    let r = 0.9;
    if (act) r = 0.9 + Math.sin(Math.min(1, k) * PI) * 0.6;
    for (const o of P.orbit) {
      o.userData.a += dt * 2.2;
      o.position.set(Math.cos(o.userData.a) * r, Math.sin(this.t * 3 + o.userData.a) * 0.3, Math.sin(o.userData.a) * r);
      o.rotation.x += dt * 2; o.rotation.y += dt * 3;
    }
  }

  animWorm(dt, act, k, moving, ph) {
    const P = this.parts;
    const segs = P.segs;
    for (let i = 0; i < segs.length; i++) {
      const w = Math.sin(ph * 1.2 - i * 0.8) * (moving ? 0.22 : 0.06);
      segs[i].position.x = w;
      segs[i].position.y = 0.2 + Math.max(0, Math.sin(ph * 1.2 - i * 0.8)) * (moving ? 0.1 : 0.02);
    }
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      segs[0].position.y += e * 0.4; segs[0].position.z = e * 0.3;
    } else segs[0].position.z = 0;
  }

  animDrake(dt, act, k, moving, ph) {
    const P = this.parts;
    const a = moving ? Math.sin(ph * 0.8) * 0.5 : 0;
    P.legFL.rotation.x = a; P.legBR.rotation.x = a; P.legFR.rotation.x = -a; P.legBL.rotation.x = -a;
    const flap = Math.sin(this.t * (moving ? 5 : 1.5)) * (moving ? 0.5 : 0.12);
    P.wingL.rotation.z = 0.25 + flap; P.wingR.rotation.z = -0.25 - flap;
    for (let i = 0; i < P.tailSegs.length; i++) P.tailSegs[i].rotation.y = Math.sin(this.t * 2 - i * 0.6) * 0.18;
    let headX = 0.55 + Math.sin(this.t * 1.2) * 0.05, neckX = -0.5;
    if (act) {
      const e = Math.sin(Math.min(1, k) * PI);
      if (act.name === 'roar' || act.name === 'cast' || act.name === 'breath') { neckX = -0.9 * e - 0.5 * (1 - e); headX = 0.2 + 0.2 * e; P.wingL.rotation.z = 0.25 + 0.8 * e; P.wingR.rotation.z = -0.25 - 0.8 * e; }
      else { neckX = -0.5 + 0.5 * e; headX = 0.55 + 0.3 * e; }
    }
    P.neck[0].rotation.x = neckX;
    P.head.rotation.x = headX;
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.mat.dispose();
  }
}

export function createModel(spec) {
  return new Model(spec);
}
