import { groundCover } from './ground-cover.js';
import { treeGeometry } from './trees.js';
// Végétation et rochers : modèles low-poly instanciés par tronçon, placés de façon déterministe.
import * as THREE from 'three';
import { GeoBuilder, vcMaterial, vcGlowMaterial } from '../engine/geom.js';
import { getHeight, getSlope, zoneAt, roadDist, CHUNKS, CHUNK_CELLS, CELL } from './terrain.js';
import { WORLD_HALF, HUBS, LANDMARKS } from '../data/zones.js';
import { makeNoise2D, fbm } from '../core/noise.js';
import { mulberry32 } from '../core/rng.js';
import { addCircle } from './collide.js';

const nD = makeNoise2D(4242);

// ---------------------------------------------------------------------------
// Modèles
function mkOak() { return treeGeometry('oak'); }
function mkPine(snow = false) { return treeGeometry(snow?'snowpine':'pine'); }
function mkDead() { return treeGeometry('dead'); }
function mkAcacia() { return treeGeometry('acacia'); }
function mkCactus() { return groundCover('cactus'); }
function mkSwampTree() { return treeGeometry('swamp'); }
function mkMushroom() { return groundCover('mushroom'); }
function mkCrystal(c1, c2) {
  const b = new GeoBuilder();
  b.octa(0.6, c1, 0, 1.4, 0, 0.8, 2.6, 0.8);
  b.octa(0.45, c2, 0.6, 0.9, 0.2, 0.8, 2.0, 0.8, 0, -0.4);
  b.octa(0.4, c2, -0.5, 0.8, -0.2, 0.8, 1.8, 0.8, 0, 0.5);
  b.octa(0.3, c1, 0.1, 0.6, 0.6, 0.8, 1.6, 0.8, 0.5, 0);
  return b.build();
}
function mkRock(c = '#8d8a7e') {
  const b = new GeoBuilder();
  b.dodeca(1, c, 0, 0.35, 0, 1.3, 0.8, 1.1);
  b.dodeca(0.55, c, 0.8, 0.25, 0.4, 1, 0.8, 1);
  return b.build();
}
function mkBoulder(c = '#8d8a7e') {
  const b = new GeoBuilder();
  b.dodeca(1, c, 0, 0.8, 0, 2.2, 1.7, 2.0);
  b.dodeca(1, c, 1.3, 0.5, 0.6, 1.2, 1.0, 1.1);
  return b.build();
}
function mkBush(c = '#4fa23c') { return groundCover('bush',c); }
function mkFlowers() { return groundCover('flowers'); }
function mkGrass(c = '#8fd65c') { return groundCover('grass',c); }
function mkReeds() { return groundCover('reeds'); }
function mkSpike(c1, c2) {
  const b = new GeoBuilder();
  b.cone(0.6, 3.2, 5, c1, 0, 1.6, 0);
  b.cone(0.4, 2.0, 5, c2, 0.7, 1.0, 0.3, 0, 0, -0.25);
  b.cone(0.35, 1.6, 5, c2, -0.6, 0.8, -0.2, 0, 0, 0.3);
  return b.build();
}
function mkPillar() {
  const b = new GeoBuilder();
  b.box(1.3, 0.4, 1.3, '#a8a294', 0, 0.2, 0);
  b.cyl(0.45, 0.5, 3.4, 8, '#b5ae9e', 0, 2.1, 0);
  b.box(1.1, 0.35, 1.1, '#a8a294', 0.1, 3.9, 0, 0, 0.3, 0.12);
  b.box(0.9, 0.6, 0.9, '#9d9788', 1.3, 0.3, 0.6, 0.2, 0.5, 0.1);
  return b.build();
}
function mkRuneStone() {
  const b = new GeoBuilder();
  b.box(1.1, 3.6, 0.7, '#5d6474', 0, 1.8, 0, 0, 0, 0.05);
  b.box(0.2, 0.9, 0.1, '#7fd1ff', 0, 2.2, 0.36);
  b.box(0.5, 0.15, 0.1, '#7fd1ff', 0, 2.9, 0.36);
  b.box(0.5, 0.15, 0.1, '#7fd1ff', 0, 1.5, 0.36);
  return b.build();
}
function mkFern() { return groundCover('fern'); }
function mkBones() { return groundCover('bones'); }

const MODELS = {};
function models() {
  if (MODELS.oak) return MODELS;
  Object.assign(MODELS, {
    oak: { geo: mkOak(), r: 0.5 },
    pine: { geo: mkPine(false), r: 0.4 },
    snowpine: { geo: mkPine(true), r: 0.4 },
    dead: { geo: mkDead(), r: 0.35 },
    acacia: { geo: mkAcacia(), r: 0.3 },
    cactus: { geo: mkCactus(), r: 0.45 },
    swamptree: { geo: mkSwampTree(), r: 0.55 },
    mushroom: { geo: mkMushroom(), r: 0.5 },
    crystalP: { geo: mkCrystal('#b58cff', '#8f6bff'), r: 0.5, glow: true },
    crystalB: { geo: mkCrystal('#7fe0ff', '#4fa8ff'), r: 0.5, glow: true },
    crystalO: { geo: mkCrystal('#ffb347', '#ff7a2f'), r: 0.5, glow: true },
    rock: { geo: mkRock(), r: 1.1 },
    boulder: { geo: mkBoulder(), r: 2.1 },
    bush: { geo: mkBush(), r: 0 },
    drybush: { geo: mkBush('#9a8a4a'), r: 0 },
    flowers: { geo: mkFlowers(), r: 0 },
    grass: { geo: mkGrass(), r: 0 },
    drygrass: { geo: mkGrass('#c0a85a'), r: 0 },
    reeds: { geo: mkReeds(), r: 0 },
    icespike: { geo: mkSpike('#bfe3f5', '#e4f4ff'), r: 0.6 },
    obsidian: { geo: mkSpike('#2b2438', '#4a2f5a'), r: 0.6 },
    pillar: { geo: mkPillar(), r: 0.7 },
    runestone: { geo: mkRuneStone(), r: 0.7 },
    fern: { geo: mkFern(), r: 0 },
    bones: { geo: mkBones(), r: 0 },
  });
  for(const [key,kind] of Object.entries({oak:'oak',pine:'pine',snowpine:'snowpine',dead:'dead',acacia:'acacia',swamptree:'swamp'})) MODELS[key].lod=[MODELS[key].geo,treeGeometry(kind,1),treeGeometry(kind,2)];
  return MODELS;
}

// Densités par biome : [type, probabilité par point de grille, échelle min, max, masque]
const TABLE = {
  meadow: [['oak', 0.045, 0.8, 1.25, 'patch'], ['bush', 0.05, 0.7, 1.3], ['flowers', 0.07, 0.8, 1.2], ['grass', 0.16, 0.8, 1.4], ['rock', 0.018, 0.5, 1.2], ['boulder', 0.004, 0.7, 1.2]],
  badlands: [['acacia', 0.02, 0.8, 1.2], ['cactus', 0.02, 0.7, 1.2], ['drybush', 0.05, 0.6, 1.2], ['drygrass', 0.1, 0.8, 1.3], ['rock', 0.03, 0.6, 1.4], ['boulder', 0.01, 0.8, 1.5], ['dead', 0.008, 0.8, 1.1]],
  forest: [['oak', 0.12, 0.9, 1.4, 'patch'], ['pine', 0.1, 0.9, 1.5], ['mushroom', 0.01, 0.8, 1.6], ['fern', 0.14, 0.8, 1.4], ['bush', 0.06, 0.8, 1.3], ['rock', 0.015, 0.6, 1.2]],
  canyon: [['dead', 0.018, 0.8, 1.2], ['rock', 0.04, 0.7, 1.6], ['boulder', 0.02, 0.8, 1.8], ['crystalO', 0.01, 0.7, 1.3], ['drybush', 0.03, 0.6, 1.1], ['bones', 0.005, 0.8, 1.2]],
  swamp: [['swamptree', 0.06, 0.8, 1.3, 'patch'], ['reeds', 0.14, 0.8, 1.3], ['dead', 0.02, 0.8, 1.2], ['bush', 0.03, 0.8, 1.2], ['grass', 0.08, 0.8, 1.3], ['mushroom', 0.004, 0.5, 0.9]],
  ruins: [['pillar', 0.012, 0.8, 1.3], ['oak', 0.02, 0.8, 1.2, 'patch'], ['dead', 0.015, 0.8, 1.2], ['crystalP', 0.008, 0.7, 1.4], ['rock', 0.03, 0.6, 1.3], ['grass', 0.1, 0.8, 1.3], ['bones', 0.004, 0.8, 1.2]],
  snow: [['snowpine', 0.09, 0.8, 1.5, 'patch'], ['rock', 0.03, 0.6, 1.4], ['boulder', 0.01, 0.8, 1.5], ['icespike', 0.012, 0.7, 1.4]],
  volcanic: [['obsidian', 0.03, 0.7, 1.6], ['dead', 0.02, 0.8, 1.3], ['rock', 0.04, 0.6, 1.5], ['boulder', 0.015, 0.8, 1.6], ['bones', 0.006, 0.8, 1.2]],
  storm: [['runestone', 0.008, 0.9, 1.3], ['crystalB', 0.014, 0.7, 1.5], ['rock', 0.04, 0.6, 1.5], ['boulder', 0.012, 0.8, 1.6], ['pine', 0.02, 0.8, 1.2, 'patch'], ['grass', 0.08, 0.8, 1.2]],
};
const ROCK_TINT = {
  meadow: '#9a9890', badlands: '#9a6a4a', forest: '#6f746a', canyon: '#7a5448', swamp: '#5d6152',
  ruins: '#a8a294', snow: '#8a909a', volcanic: '#3a3438', storm: '#6d7482',
};

export class Decor {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'decor';
    this.chunks = []; // {cx, cz, group}
    scene.add(this.group);
  }

  build() {
    const M = models();
    const rnd = mulberry32(777);
    const step = 5.5;
    // instances[chunkIndex][type] = [ {x,y,z,s,ry,color} ]
    const per = new Map();
    const exclusions = [
      ...HUBS.map((h) => ({ x: h.x, z: h.z, r: h.r + 6 })),
      ...LANDMARKS.filter((l) => l.r).map((l) => ({ x: l.x, z: l.z, r: l.r * 0.9 })),
    ];
    const col = new THREE.Color();
    for (let z = -WORLD_HALF + 3; z < WORLD_HALF - 3; z += step) {
      for (let x = -WORLD_HALF + 3; x < WORLD_HALF - 3; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
        if (Math.abs(px) > WORLD_HALF - 24 || Math.abs(pz) > WORLD_HALF - 24) continue;
        const h = getHeight(px, pz);
        const zone = zoneAt(px, pz);
        const biome = zone.biome;
        const tbl = TABLE[biome];
        let excluded = false;
        for (const e of exclusions) {
          const dx = px - e.x, dz = pz - e.z;
          if (dx * dx + dz * dz < e.r * e.r) { excluded = true; break; }
        }
        if (excluded) continue;
        const slope = getSlope(px, pz);
        const rd = roadDist(px, pz);
        const patch = fbm(nD, px / 60, pz / 60, 3);
        let acc = 0;
        for (const [type, p, s0, s1, mask] of tbl) {
          let pp = p;
          if (mask === 'patch') pp *= Math.max(0, 0.35 + patch * 1.8);
          if (h > 44) pp *= type === 'rock' || type === 'boulder' ? 1 : 0.15;
          acc += pp;
          if (r1 < acc) {
            const big = M[type].r > 0;
            if (rd < (big ? 5 : 3)) break;
            if (h < (biome === 'swamp' ? -0.3 : 0.35) && type !== 'reeds') break;
            if (type === 'reeds' && (h > 1.2 || h < -1.2)) break;
            if (slope > (type === 'rock' || type === 'boulder' ? 1.4 : 0.75)) break;
            const s = s0 + (s1 - s0) * r2;
            let tint = '#ffffff';
            if (type === 'rock' || type === 'boulder') tint = ROCK_TINT[biome];
            col.set(tint);
            if (type !== 'rock' && type !== 'boulder') col.offsetHSL((r4 - 0.5) * 0.05, 0, (r4 - 0.5) * 0.12);
            else { const base = new THREE.Color('#8d8a7e'); col.r /= base.r; col.g /= base.g; col.b /= base.b; col.offsetHSL(0, 0, (r4 - 0.5) * 0.08); }
            const ci = Math.floor((px + WORLD_HALF) / (CHUNK_CELLS * CELL)), cj = Math.floor((pz + WORLD_HALF) / (CHUNK_CELLS * CELL));
            const k = cj * CHUNKS + ci;
            let m = per.get(k);
            if (!m) per.set(k, (m = {}));
            (m[type] ||= []).push({ x: px, y: h - 0.05, z: pz, s, ry: r3 * Math.PI * 2, c: col.clone() });
            if (M[type].r > 0) addCircle(px, pz, M[type].r * s);
            break;
          }
        }
      }
    }
    this.placements = per; this.models = M;
  }

  materialize(k, types) {
    const M = this.models;
    const mat = vcMaterial(), glow = vcGlowMaterial();
    const dummy = new THREE.Object3D();
    {
      const cj = Math.floor(k / CHUNKS), ci = k % CHUNKS;
      const g = new THREE.Group();
      g.userData = { cx: -WORLD_HALF + (ci + 0.5) * CHUNK_CELLS * CELL, cz: -WORLD_HALF + (cj + 0.5) * CHUNK_CELLS * CELL };
      for (const type in types) {
        const list = types[type];
        const def = M[type];
        for(let level=0;level<(def.lod?3:1);level++){
        const im = new THREE.InstancedMesh(def.lod?.[level]||def.geo, def.glow ? glow : mat, list.length);
        list.forEach((it, i) => {
          dummy.position.set(it.x, it.y, it.z);
          dummy.rotation.set(0, it.ry, 0);
          dummy.scale.setScalar(it.s);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          im.setColorAt(i, it.c);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = def.r > 0.3;
        im.receiveShadow = false;
        im.userData.small = def.r === 0;
        im.userData.shadow = def.r > .3;
        if(def.lod) {im.userData.lodLevel=level;im.userData.placements=list;im.userData.sourceMatrices=im.instanceMatrix.array.slice();im.userData.sourceColors=im.instanceColor.array.slice();im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.count=0;}
        g.add(im);
        }
      }
      this.group.add(g);
      g.userData.key = k; this.chunks.push(g);
    }
  }

  // n'affiche que les tronçons proches (les petits éléments encore plus près)
  update(camPos, viewDist, quality=1) {
    const radius = viewDist + 160;
    const updateLod=performance.now()>(this.nextLod||0);if(updateLod)this.nextLod=performance.now()+180;
    const desired = [];
    for (const [key, types] of this.placements) {
      const x=-WORLD_HALF+(key%CHUNKS+.5)*128, z=-WORLD_HALF+(Math.floor(key/CHUNKS)+.5)*128;
      const distance=Math.hypot(x-camPos.x,z-camPos.z);
      if(distance<radius && !this.chunks.some(g=>g.userData.key===key)) desired.push({key,types,distance});
    }
    desired.sort((a,b)=>a.distance-b.distance);
    if(desired.length) this.materialize(desired[0].key,desired[0].types);
    for (const g of [...this.chunks]) {
      const d=Math.hypot(g.userData.cx-camPos.x,g.userData.cz-camPos.z);
      if(d>radius+160) { this.group.remove(g); for(const m of g.children) m.dispose(); this.chunks.splice(this.chunks.indexOf(g),1); continue; }
      g.visible=d<viewDist+90;
      for(const im of g.children) {
        if(im.userData.small) im.visible=d<170;
        const u=im.userData;
        if(u.placements && updateLod) {
          let count=0;
          for(let i=0;i<u.placements.length;i++) {
            const p=u.placements[i],range=Math.hypot(p.x-camPos.x,p.z-camPos.z);
            if(range>viewDist+25 || (range<(quality===0?28:42)?0:range<(quality===0?70:110)?1:2)!==u.lodLevel)continue;
            im.instanceMatrix.array.set(u.sourceMatrices.subarray(i*16,i*16+16),count*16);
            im.instanceColor.array.set(u.sourceColors.subarray(i*3,i*3+3),count*3);count++;
          }
          im.count=count;im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;
        }
        im.castShadow=u.shadow && (u.placements?u.lodLevel===0:d<100);
      }
    }
  }
}
