// Décors des lieux remarquables (moulin, camps, nid, mine, bastion, crypte, autel...).
import * as THREE from 'three';
import { GeoBuilder, vcMaterial, vcGlowMaterial, lambert } from '../engine/geom.js';
import { getHeight } from './terrain.js';
import { LANDMARKS } from '../data/zones.js';
import { mulberry32, hashStr } from '../core/rng.js';
import { addBox, addCircle } from './collide.js';

function ctx(lm) {
  return {
    lm, b: new GeoBuilder(), g: new GeoBuilder(), rnd: mulberry32(hashStr(lm.id)),
    x: (lx) => lm.x + lx, z: (lz) => lm.z + lz, y: (lx, lz) => getHeight(lm.x + lx, lm.z + lz),
    anim: [], fires: [],
  };
}

function hut(C, lx, lz, r, h, wall, roof) {
  const x = C.x(lx), z = C.z(lz), y = C.y(lx, lz);
  C.b.cyl(r, r * 1.05, h, 7, wall, x, y + h / 2, z);
  C.b.cone(r * 1.35, h * 0.9, 7, roof, x, y + h + h * 0.45, z);
  C.b.box(0.9, 1.5, 0.2, '#2a2220', x, y + 0.75, z + r);
  addCircle(x, z, r + 0.2);
}
function fire(C, lx, lz) {
  const x = C.x(lx), z = C.z(lz), y = C.y(lx, lz);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    C.b.dodeca(0.28, '#5d5a56', x + Math.cos(a) * 0.8, y + 0.12, z + Math.sin(a) * 0.8);
  }
  C.fires.push({ x, y: y + 0.3, z, s: 1 });
}
function tentL(C, lx, lz, c) {
  const x = C.x(lx), z = C.z(lz), y = C.y(lx, lz);
  C.b.cone(2.3, 2.6, 4, c, x, y + 1.3, z, 0, Math.PI / 4 + C.rnd(), 0);
  addCircle(x, z, 1.8);
}

const BUILDERS = {
  mill(C) {
    const y = C.y(0, 0);
    C.b.cyl(3.2, 4.0, 9, 8, '#d8d0bc', C.x(0), y + 4.5, C.z(0));
    C.b.cone(4.2, 3.6, 8, '#7a4a2e', C.x(0), y + 10.8, C.z(0));
    C.b.box(1.4, 2.2, 0.3, '#3a2a20', C.x(0), y + 1.1, C.z(3.9));
    addCircle(C.x(0), C.z(0), 4.2);
    // ailes animées
    const hub = new THREE.Group();
    const bl = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      bl.box(0.35, 7.5, 0.2, '#6b4a2e', Math.sin(a) * 3.75, Math.cos(a) * 3.75, 0, 0, 0, -a);
      bl.box(1.6, 6.0, 0.08, '#efe8d8', Math.sin(a) * 4.2 + Math.cos(a) * 0.8, Math.cos(a) * 4.2 - Math.sin(a) * 0.8, 0.1, 0, 0, -a);
    }
    bl.box(0.8, 0.8, 1.2, '#5a3e28', 0, 0, -0.4);
    const blades = new THREE.Mesh(bl.build(), vcMaterial());
    hub.add(blades);
    hub.position.set(C.x(0), y + 8.2, C.z(4.4));
    C.anim.push({ obj: blades, spin: 0.5 });
    C.extra = hub;
    // clôtures et bottes de foin
    for (let i = 0; i < 6; i++) C.b.box(0.2, 1.1, 3.2, '#7a5838', C.x(-12 + i * 0.1), C.y(-12, -8 + i * 3.2) + 0.55, C.z(-8 + i * 3.2));
    for (const [lx, lz] of [[8, -6], [10, -3], [7, 7]]) C.b.cyl(0.9, 0.9, 1.4, 8, '#d9b64a', C.x(lx), C.y(lx, lz) + 0.7, C.z(lz), Math.PI / 2, 0, 0);
    tentL(C, -6, 10, '#6a5a4a'); tentL(C, 4, 13, '#5a4a3a'); fire(C, -1, 9);
  },
  stones(C) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const lx = Math.cos(a) * 10, lz = Math.sin(a) * 10;
      const h = 4 + C.rnd() * 2;
      C.b.box(1.4, h, 0.9, '#8e8c86', C.x(lx), C.y(lx, lz) + h / 2 - 0.3, C.z(lz), 0, -a, 0.05);
      addCircle(C.x(lx), C.z(lz), 0.9);
    }
    C.b.box(3.2, 0.8, 2, '#7e7c76', C.x(0), C.y(0, 0) + 0.4, C.z(0));
    C.g.octa(0.5, '#9fe8ff', C.x(0), C.y(0, 0) + 1.6, C.z(0), 1, 1.5, 1);
  },
  banditcamp(C) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      tentL(C, Math.cos(a) * 11, Math.sin(a) * 11, i % 2 ? '#8a5a3a' : '#a0703a');
    }
    fire(C, 0, 0);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (i % 6 === 0) continue;
      const lx = Math.cos(a) * 18, lz = Math.sin(a) * 18;
      C.b.box(0.4, 2.2, 0.4, '#6e5238', C.x(lx), C.y(lx, lz) + 1, C.z(lz), 0.2 * Math.sin(a), 0, 0.2 * Math.cos(a));
    }
    C.b.box(1, 1, 1, '#8a6440', C.x(4), C.y(4, -3) + 0.5, C.z(-3));
    C.b.box(1, 1, 1, '#8a6440', C.x(5), C.y(5, -2) + 0.5, C.z(-2), 0, 0.5, 0);
  },
  nest(C) {
    // toiles géantes et œufs
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = Math.cos(a) * 14, lz = Math.sin(a) * 14;
      C.b.box(0.08, 6, 7, '#e8e8f0', C.x(lx), C.y(lx, lz) + 3, C.z(lz), 0, -a, 0.3);
    }
    for (let i = 0; i < 14; i++) {
      const a = C.rnd() * Math.PI * 2, r = 3 + C.rnd() * 12;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      C.b.ico(0.5 + C.rnd() * 0.3, '#e6e2d0', C.x(lx), C.y(lx, lz) + 0.4, C.z(lz), 1, 1.3, 1);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      C.b.cyl(0.4, 0.7, 7, 5, '#3f3a34', C.x(Math.cos(a) * 20), C.y(Math.cos(a) * 20, Math.sin(a) * 20) + 3.5, C.z(Math.sin(a) * 20), 0, 0, 0.2);
      addCircle(C.x(Math.cos(a) * 20), C.z(Math.sin(a) * 20), 0.7);
    }
  },
  goblincamp(C) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      hut(C, Math.cos(a) * 12, Math.sin(a) * 12, 2.2, 2.2, '#6a5a3a', '#4a6a2a');
    }
    // grande souche creuse
    C.b.cyl(4.5, 5.5, 5, 9, '#5a4030', C.x(0), C.y(0, 0) + 2.5, C.z(0));
    C.b.cyl(3.6, 3.6, 0.3, 9, '#2a1e16', C.x(0), C.y(0, 0) + 5.0, C.z(0));
    C.b.box(1.6, 2.4, 0.4, '#1a1410', C.x(0), C.y(0, 5.2) + 1.2, C.z(5.3));
    addCircle(C.x(0), C.z(0), 5.6);
    fire(C, 7, 6); fire(C, -8, -5);
    for (let i = 0; i < 4; i++) C.b.box(0.25, 3, 0.25, '#6e5238', C.x(-15 + i * 10), C.y(-15 + i * 10, 17) + 1.5, C.z(17));
  },
  mine(C) {
    // falaise + entrée étayée
    C.b.dodeca(1, '#6e4a40', C.x(0), C.y(0, -12) + 4, C.z(-12), 16, 9, 7);
    C.b.dodeca(1, '#7a5448', C.x(-10), C.y(-10, -8) + 3, C.z(-8), 7, 6, 6);
    C.b.dodeca(1, '#7a5448', C.x(10), C.y(10, -8) + 3, C.z(-8), 7, 6, 6);
    addBox(C.x(0), C.z(-12), 15, 6);
    addCircle(C.x(-10), C.z(-8), 6); addCircle(C.x(10), C.z(-8), 6);
    C.b.box(5, 5, 1, '#141010', C.x(0), C.y(0, -5) + 2.5, C.z(-5.2));
    C.b.box(0.6, 5.6, 0.6, '#6b4a2e', C.x(-2.8), C.y(-2.8, -4.6) + 2.8, C.z(-4.6));
    C.b.box(0.6, 5.6, 0.6, '#6b4a2e', C.x(2.8), C.y(2.8, -4.6) + 2.8, C.z(-4.6));
    C.b.box(6.6, 0.7, 0.7, '#6b4a2e', C.x(0), C.y(0, -4.6) + 5.6, C.z(-4.6));
    for (let i = 0; i < 8; i++) C.b.box(1.4, 0.12, 0.3, '#5a3e28', C.x(0), C.y(0, -4 + i * 1.6) + 0.1, C.z(-4 + i * 1.6));
    C.b.box(0.1, 0.1, 13, '#8a8a90', C.x(-0.5), C.y(0, 2) + 0.2, C.z(2));
    C.b.box(0.1, 0.1, 13, '#8a8a90', C.x(0.5), C.y(0, 2) + 0.2, C.z(2));
    C.b.box(1.4, 0.9, 1.8, '#5a5456', C.x(0), C.y(0, 5) + 0.7, C.z(5));
    C.b.box(1.2, 0.5, 1.6, '#ff9a3a', C.x(0), C.y(0, 5) + 1.2, C.z(5));
    C.g.box(0.4, 0.4, 0.4, '#ffb050', C.x(-3.4), C.y(-3.4, -4) + 3.4, C.z(-4));
    C.g.box(0.4, 0.4, 0.4, '#ffb050', C.x(3.4), C.y(3.4, -4) + 3.4, C.z(-4));
  },
  koboldcamp(C) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = 8 + (i % 2) * 6;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      C.b.ico(2.2, '#6a4a3a', C.x(lx), C.y(lx, lz) + 0.3, C.z(lz), 1.3, 0.7, 1.3);
      C.b.box(1.1, 1.1, 0.4, '#1a1210', C.x(lx), C.y(lx, lz) + 0.6, C.z(lz + 2.3));
      addCircle(C.x(lx), C.z(lz), 2.4);
    }
    fire(C, 0, 0);
    C.b.box(1.2, 0.8, 1.2, '#8a3a2a', C.x(3), C.y(3, 2) + 0.4, C.z(2));
    C.b.box(0.5, 0.5, 0.5, '#e0c040', C.x(3), C.y(3, 2) + 1.05, C.z(2));
  },
  frogvillage(C) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = 12 + (i % 2) * 5;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const x = C.x(lx), z = C.z(lz), y = Math.max(C.y(lx, lz), -0.6);
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) C.b.box(0.25, 3.4, 0.25, '#4a3f2e', x + ox, y + 1.2, z + oz);
      C.b.box(3.6, 0.3, 3.6, '#6b5a3a', x, y + 2.8, z);
      C.b.cyl(1.6, 1.7, 1.8, 6, '#6a7a3a', x, y + 3.8, z);
      C.b.cone(2.4, 2.0, 6, '#8a8a4a', x, y + 5.7, z);
      addCircle(x, z, 2.0);
    }
    fire(C, 0, 0);
    // totem crapaud
    const y = C.y(0, -5);
    C.b.box(1, 5, 1, '#5a4a30', C.x(0), y + 2.5, C.z(-5));
    C.b.box(2.2, 1.4, 1.6, '#4f7a3a', C.x(0), y + 5.4, C.z(-5));
    C.g.box(0.4, 0.4, 0.2, '#f0e050', C.x(-0.6), y + 5.7, C.z(-4.2));
    C.g.box(0.4, 0.4, 0.2, '#f0e050', C.x(0.6), y + 5.7, C.z(-4.2));
  },
  bog(C) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + C.rnd(), r = 12 + C.rnd() * 8;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      C.b.cyl(0.25, 0.45, 5, 5, '#3a3228', C.x(lx), C.y(lx, lz) + 2, C.z(lz), 0.2, 0, -0.15);
    }
    for (let i = 0; i < 8; i++) {
      const a = C.rnd() * Math.PI * 2, r = C.rnd() * 16;
      C.b.cyl(0.9, 0.9, 0.08, 8, '#4f7a3a', C.x(Math.cos(a) * r), 0.02, C.z(Math.sin(a) * r));
    }
  },
  bastion(C) {
    const y = C.y(0, 0);
    // tour en ruine centrale
    C.b.cyl(5.5, 6.5, 2, 10, '#9d978a', C.x(0), y + 1, C.z(0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i === 3 || i === 8) continue;
      const h = 6 + ((i * 7) % 5) * 1.6;
      C.b.box(3.2, h, 1.4, '#b5ae9e', C.x(Math.cos(a) * 9), y + h / 2, C.z(Math.sin(a) * 9), 0, -a + Math.PI / 2, 0);
      addBox(C.x(Math.cos(a) * 9), C.z(Math.sin(a) * 9), 1.6, 0.7, -a + Math.PI / 2, y + h);
    }
    C.b.cyl(1.2, 1.4, 8, 8, '#8e8878', C.x(0), y + 5, C.z(0));
    addCircle(C.x(0), C.z(0), 1.5);
    C.flagPos = { x: C.x(0), y: y + 9, z: C.z(0) };
    C.b.cyl(12, 12, 0.12, 24, '#c8c0a0', C.x(0), y + 2.05, C.z(0));
  },
  crypt(C) {
    const y = C.y(0, 0);
    C.b.box(14, 1, 12, '#8e8878', C.x(0), y + 0.5, C.z(0));
    C.b.box(11, 6, 9, '#a09a8a', C.x(0), y + 4, C.z(-1));
    C.b.roof(12, 3, 10, '#6d6a78', C.x(0), y + 7, C.z(-1), 0);
    for (const sx of [-4.5, -1.5, 1.5, 4.5]) C.b.cyl(0.45, 0.5, 5.5, 8, '#c4bdac', C.x(sx), y + 3.7, C.z(4.2));
    C.b.box(3, 3.4, 0.4, '#141016', C.x(0), y + 2.7, C.z(3.4));
    addBox(C.x(0), C.z(-1), 5.8, 4.8, 0, y + 8.5);
    C.g.box(0.5, 0.5, 0.2, '#b58cff', C.x(-2.4), y + 5.2, C.z(3.6));
    C.g.box(0.5, 0.5, 0.2, '#b58cff', C.x(2.4), y + 5.2, C.z(3.6));
    for (let i = 0; i < 10; i++) {
      const a = C.rnd() * Math.PI * 2, r = 12 + C.rnd() * 8;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      C.b.box(0.9, 1.4, 0.3, '#8e8c86', C.x(lx), C.y(lx, lz) + 0.6, C.z(lz), 0, a, 0.1);
    }
  },
  trollcamp(C) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      hut(C, Math.cos(a) * 13, Math.sin(a) * 13, 2.8, 2.6, '#8a7a6a', '#dfe8f0');
    }
    fire(C, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      C.b.box(0.3, 3.2, 0.3, '#e6dfcd', C.x(Math.cos(a) * 6), C.y(Math.cos(a) * 6, Math.sin(a) * 6) + 1.4, C.z(Math.sin(a) * 6), 0, 0, 0.35 * Math.cos(a));
    }
    C.b.dodeca(1.2, '#e6dfcd', C.x(0), C.y(0, -7) + 3.6, C.z(-7));
  },
  caldera(C) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const lx = Math.cos(a) * 24, lz = Math.sin(a) * 24;
      C.b.cone(2.4, 6 + (i % 3) * 2, 5, '#2b2830', C.x(lx), C.y(lx, lz) + 2.5, C.z(lz));
      addCircle(C.x(lx), C.z(lz), 2.0);
    }
    for (let i = 0; i < 12; i++) {
      const a = C.rnd() * Math.PI * 2, r = C.rnd() * 18;
      C.g.box(1.6, 0.1, 0.3, '#ff7a2a', C.x(Math.cos(a) * r), C.y(Math.cos(a) * r, Math.sin(a) * r) + 0.06, C.z(Math.sin(a) * r), 0, C.rnd() * 3, 0);
    }
  },
  altar(C) {
    const y = C.y(0, 0);
    C.b.cyl(34, 35, 0.6, 24, '#6d7482', C.x(0), y + 0.3, C.z(0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lx = Math.cos(a) * 36, lz = Math.sin(a) * 36;
      C.b.box(2, 9, 1.4, '#5d6474', C.x(lx), C.y(lx, lz) + 4.2, C.z(lz), 0, -a, 0);
      C.g.box(0.5, 1.4, 0.1, '#7fd1ff', C.x(lx * 0.975), C.y(lx, lz) + 5, C.z(lz * 0.975), 0, -a + Math.PI / 2, 0);
      addBox(C.x(lx), C.z(lz), 1.0, 0.7, -a, C.y(lx, lz) + 8.6);
    }
    C.b.cyl(4, 5, 2, 8, '#5d6474', C.x(0), y + 1, C.z(-26));
    C.b.box(1.6, 12, 1.6, '#4d5464', C.x(0), y + 8, C.z(-26));
    C.g.octa(1.4, '#9fe8ff', C.x(0), y + 15.5, C.z(-26), 1, 1.6, 1);
    addCircle(C.x(0), C.z(-26), 5);
  },
};

// Camp des Voilés : obélisque noir, cristaux violets, tentes sombres, cercle rituel
BUILDERS.cultcamp = (C) => {
  const y = C.y(0, 0);
  C.b.cyl(5.5, 6, 0.35, 10, '#2a2230', C.x(0), y + 0.17, C.z(0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lx = Math.cos(a) * 5, lz = Math.sin(a) * 5;
    C.b.box(0.6, 1.6 + (i % 2) * 0.8, 0.6, '#3a3044', C.x(lx), C.y(lx, lz) + 0.8, C.z(lz), 0, a, 0);
    C.g.box(0.18, 0.18, 0.18, '#c080ff', C.x(lx), C.y(lx, lz) + 2.1 + (i % 2) * 0.8, C.z(lz));
  }
  C.b.box(1.6, 7, 1.6, '#1e1826', C.x(0), y + 3.5, C.z(0), 0, Math.PI / 4, 0);
  C.b.cone(1.2, 1.8, 4, '#1e1826', C.x(0), y + 7.9, C.z(0), 0, Math.PI / 4, 0);
  C.g.octa(0.9, '#b060ff', C.x(0), y + 9.8, C.z(0), 1, 1.6, 1);
  C.g.box(0.3, 4.5, 0.08, '#9a50e0', C.x(0), y + 3.6, C.z(0.82));
  addCircle(C.x(0), C.z(0), 1.4);
  for (const [lx, lz] of [[-10, -6], [9, -8], [-8, 9], [10, 7]]) tentL(C, lx, lz, '#2a1a3a');
  for (const [lx, lz, s] of [[-4, -11, 1], [12, 0, 0.8], [-12, 2, 0.9], [3, 12, 1.1]]) C.g.octa(0.5 * s, '#a050f0', C.x(lx), C.y(lx, lz) + 0.7 * s, C.z(lz), 1, 1.8, 1);
  fire(C, 4, -3); fire(C, -3, 5);
};

BUILDERS.expedition = (C) => {
  const lm=C.lm || C.landmark;
  const biome=lm?.biome || 'ruins',variant=lm?.variant || 0;
  const stone=biome==='snow'?'#a8b8c4':biome==='volcanic'?'#51464b':biome==='canyon'?'#9e6d52':'#9b9781';
  const x=C.x(0),z=C.z(0),y=C.y(0,0);
  C.b.surfOverride=5;C.b.cyl(6,6.6,.5,16,stone,x,y+.25,z);
  if(variant===0){tentL(C,-6,2,biome==='snow'?'#748598':'#8b7655');tentL(C,5,-5,'#665344');fire(C,1,2);}
  else if(variant===1){
    for(let i=0;i<6;i++){const a=i*Math.PI/3,px=x+Math.cos(a)*4,pz=z+Math.sin(a)*4;C.b.cyl(.48,.65,6+(i%2),10,stone,px,y+3,pz);C.b.cyl(.75,.75,.35,10,stone,px,y+6,pz);}
    C.b.cyl(.6,.9,10,10,stone,x,y+5,z);C.g.octa(.6,'#adcfcd',x,y+11,z,1,1.4,1);
  }else{
    for(let i=0;i<3;i++){const a=i*2*Math.PI/3,px=x+Math.cos(a)*3.5,pz=z+Math.sin(a)*3.5;C.b.cyl(.9,1.15,3.5,8,stone,px,y+1.75,pz);C.b.roof(2.5,1,2.5,stone,px,y+3.5,pz,a);}
    C.b.cyl(2,2.3,.5,16,stone,x,y+.8,z);C.g.octa(.4,'#b4b997',x,y+2,z);
  }
  C.b.surfOverride=null;
};

export function buildLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const info = {};
  const anims = [];
  const fires = [];
  for (const lm of LANDMARKS) {
    const fn = BUILDERS[lm.kind];
    if (!fn) continue;
    const C = ctx(lm);
    fn(C);
    if (!C.b.empty) {
      const m = new THREE.Mesh(C.b.build(), vcMaterial());
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
    if (!C.g.empty) group.add(new THREE.Mesh(C.g.build(), vcGlowMaterial()));
    if (C.extra) group.add(C.extra);
    anims.push(...C.anim);
    fires.push(...C.fires);
    info[lm.id] = { flagPos: C.flagPos };
  }
  scene.add(group);
  return { group, info, anims, fires };
}

export function updateLandmarks(L, dt) {
  for (const a of L.anims) a.obj.rotation.z += a.spin * dt;
}
