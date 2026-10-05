// Scène d'accueil (sélection et création de personnage) : le héros sur une estrade de pierre,
// arche, braseros, bannières et horizon aux couleurs de sa faction.
import { texturizeProps } from '../engine/textures.js';
import * as THREE from 'three';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';

const PAL = {
  0: {
    skyTop: '#050a18', skyHor: '#23406e', fog: 0x121e36, ground: '#232a3a', stone: '#8a93a6', stone2: '#6a7284', dark: '#3a4254', trim: '#cfd6e2',
    banner: '#2a4f94', emblem: '#f4ecd8', glow: '#9fd0ff', flame: '#ffe6a8', torch: 0xffdca8, rim: 0x7aa4ff, key: 0xe6eeff, hemi: [0xb8ccff, 0x1a1c24], mote: 0xcfe3ff, mtn: '#141e36', up: false,
  },
  1: {
    skyTop: '#100302', skyHor: '#5e1e0c', fog: 0x2a0e07, ground: '#261a16', stone: '#6a564c', stone2: '#54443c', dark: '#2e2420', trim: '#c8843a',
    banner: '#7a2214', emblem: '#ffc080', glow: '#ffb050', flame: '#ffc070', torch: 0xff9a50, rim: 0xff6a3a, key: 0xffe2c4, hemi: [0xffc0a0, 0x1c1210], mote: 0xffb050, mtn: '#2a0f08', up: true,
  },
};

function emblem(b, kind, color, x, y, z, s) {
  if (kind === 0) {
    b.box(0.2 * s, 0.2 * s, 0.03, color, x, y, z, 0, 0, Math.PI / 4);
    b.box(0.09 * s, 0.09 * s, 0.035, '#4f8dff', x, y, z + 0.004, 0, 0, Math.PI / 4);
    b.box(0.03 * s, 0.36 * s, 0.03, color, x, y, z - 0.002);
  } else {
    b.box(0.08 * s, 0.3 * s, 0.03, color, x, y, z);
    b.box(0.06 * s, 0.2 * s, 0.03, color, x - 0.09 * s, y - 0.04 * s, z, 0, 0, 0.35);
    b.box(0.06 * s, 0.2 * s, 0.03, color, x + 0.09 * s, y - 0.04 * s, z, 0, 0, -0.35);
    b.box(0.22 * s, 0.04 * s, 0.035, '#ff5a36', x, y - 0.15 * s, z + 0.004);
  }
}

export const Stage = {
  scene: null,
  camera: null,
  env: null,
  hero: null,
  faction: -1,
  mode: 'select',
  rot: 0.35,
  t: 0,

  init() {
    const S = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 600);
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    S.fog = new THREE.Fog(0x121e36, 30, 150);
    this.hemi = new THREE.HemisphereLight(0xb8ccff, 0x1a1c24, 0.8);
    this.key = new THREE.DirectionalLight(0xffffff, 1.55);
    this.key.position.set(4.5, 10, 7);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 7; sc.bottom = -3; sc.near = 1; sc.far = 30;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0006;
    this.rim = new THREE.DirectionalLight(0x7aa4ff, 1.1);
    this.rim.position.set(-6, 5, -7);
    this.torchL = new THREE.PointLight(0xffdca8, 6, 16, 1.4);
    this.torchR = new THREE.PointLight(0xffdca8, 6, 16, 1.4);
    this.torchL.position.set(-4.0, 3.1, -1.9);
    this.torchR.position.set(4.0, 3.1, -1.9);
    S.add(this.hemi, this.key, this.key.target, this.rim, this.torchL, this.torchR);
    // poussières lumineuses (braises qui montent ou lueurs qui tombent)
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = Math.random() * 10; pos[i * 3 + 2] = -6 + (Math.random() - 0.5) * 16; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({ size: 0.07, color: 0xcfe3ff, transparent: true, opacity: 0.85, depthWrite: false, fog: true });
    this.motes = new THREE.Points(g, this.moteMat);
    S.add(this.motes);
    this.flames = [];
    this.setFaction(0);
  },

  setFaction(f) {
    f = f === 1 ? 1 : 0;
    if (f === this.faction) return;
    this.faction = f;
    const P = PAL[f];
    const S = this.scene;
    if (this.env) {
      S.remove(this.env);
      this.env.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (m.material !== vcGlowMaterial() && m.material !== this.stoneMat) m.material.dispose?.(); } });
    }
    S.fog.color.setHex(P.fog);
    this.hemi.color.setHex(P.hemi[0]); this.hemi.groundColor.setHex(P.hemi[1]);
    this.key.color.setHex(P.key);
    this.rim.color.setHex(P.rim);
    this.torchL.color.setHex(P.torch); this.torchR.color.setHex(P.torch);
    this.moteMat.color.setHex(P.mote);
    const env = (this.env = new THREE.Group());
    // ciel en dégradé
    const sky = new THREE.SphereGeometry(300, 32, 16);
    const col = [], c1 = new THREE.Color(P.skyTop), c2 = new THREE.Color(P.skyHor), c = new THREE.Color();
    const a = sky.attributes.position;
    for (let i = 0; i < a.count; i++) { const k = Math.max(0, Math.min(1, a.getY(i) / 300)); c.copy(c2).lerp(c1, Math.pow(k, 0.55)); col.push(c.r, c.g, c.b); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    // décor
    const b = new GeoBuilder(), gl = new GeoBuilder();
    b.cyl(80, 80, 0.2, 48, P.ground, 0, -0.1, 0);
    for (let i = 0; i < 26; i++) { const an = (i / 26) * Math.PI * 2; b.box(1.6, 0.08, 1.1, i % 2 ? P.stone2 : P.dark, Math.sin(an) * 4.4, 0.02, Math.cos(an) * 4.4, 0, an, 0); }
    // estrade
    b.cyl(3.0, 3.2, 0.36, 12, P.stone2, 0, 0.18, 0);
    b.cyl(2.35, 2.55, 0.36, 12, P.stone, 0, 0.54, 0);
    b.cyl(2.36, 2.36, 0.06, 12, P.trim, 0, 0.73, 0);
    gl.cyl(2.08, 2.08, 0.03, 36, P.glow, 0, 0.745, 0);
    b.cyl(1.94, 1.94, 0.04, 36, P.stone, 0, 0.75, 0);
    b.box(1.8, 0.36, 0.9, P.stone2, 0, 0.18, 3.25);
    // arche
    for (const sx of [-1, 1]) {
      b.box(1.0, 6.2, 1.0, P.stone2, sx * 3.7, 3.1, -3.4);
      b.box(1.3, 0.5, 1.3, P.trim, sx * 3.7, 0.25, -3.4);
      b.box(1.3, 0.4, 1.3, P.trim, sx * 3.7, 6.3, -3.4);
      // braseros
      b.cyl(0.42, 0.28, 0.9, 6, P.dark, sx * 4.0, 2.1, -1.9);
      b.cyl(0.7, 0.45, 0.35, 6, P.stone2, sx * 4.0, 2.7, -1.9);
      b.cyl(0.14, 0.14, 2.2, 6, P.dark, sx * 4.0, 0.9, -1.9);
    }
    b.box(8.8, 0.9, 1.2, P.stone2, 0, 6.9, -3.4);
    b.box(9.2, 0.25, 1.4, P.trim, 0, 7.45, -3.4);
    b.roof(3.2, 1.2, 1.0, P.stone, 0, 7.55, -3.4);
    gl.box(0.5, 0.5, 0.06, P.glow, 0, 6.9, -2.78, 0, 0, Math.PI / 4);
    // bannières
    for (const sx of [-1, 1]) {
      b.box(0.12, 5.4, 0.12, P.dark, sx * 2.25, 2.7, -2.7);
      b.box(1.5, 0.1, 0.1, P.trim, sx * 2.25, 5.2, -2.7);
      b.box(1.3, 2.8, 0.06, P.banner, sx * 2.25, 3.75, -2.68);
      b.box(1.3, 0.14, 0.07, P.trim, sx * 2.25, 2.4, -2.66);
      emblem(b, f, P.emblem, sx * 2.25, 4.05, -2.63, 4);
    }
    // horizon : montagnes et silhouettes
    const rnd = mulberry(7 + f * 13);
    for (let i = 0; i < 22; i++) {
      const an = Math.PI + (rnd() - 0.5) * Math.PI * 1.7;
      const r = 70 + rnd() * 50;
      const h = 22 + rnd() * 34;
      b.cone(10 + rnd() * 14, h, 5, P.mtn, Math.sin(an) * r, h / 2 - 1, Math.cos(an) * r, 0, rnd() * 3, 0);
    }
    if (f === 0) {
      // cité blanche lointaine
      for (let i = 0; i < 7; i++) {
        const x = -26 + i * 8 + (rnd() - 0.5) * 3, z = -58 - rnd() * 8, h = 8 + rnd() * 12;
        b.box(3.2, h, 3.2, '#2a3656', x, h / 2, z);
        b.cone(2.6, 4, 4, '#1c2744', x, h + 2, z, 0, Math.PI / 4, 0);
        gl.box(0.5, 0.8, 0.1, '#ffd890', x, h * 0.6, z + 1.62);
      }
    } else {
      // volcan et coulées
      b.cone(34, 44, 7, '#240c06', 18, 21, -92);
      gl.cyl(7, 7, 0.4, 8, '#ff6a1a', 18, 43, -92);
      for (let i = 0; i < 5; i++) gl.box(1.2, 30, 0.4, '#ff5a1a', 12 + i * 3, 18, -80 + i, 0.5, 0, 0.1 * i);
      for (let i = 0; i < 6; i++) { const x = -30 + i * 10, z = -50 - rnd() * 10, h = 6 + rnd() * 9; b.box(2.5, h, 2.5, '#2a1410', x, h / 2, z); b.cone(1.8, 5, 4, '#1a0c08', x, h + 2.5, z); }
    }
    const stone = new THREE.Mesh(b.build(), texturizeProps(new THREE.MeshLambertMaterial({ vertexColors: true })));
    stone.receiveShadow = true;
    stone.castShadow = true;
    env.add(stone);
    env.add(new THREE.Mesh(gl.build(), vcGlowMaterial()));
    // flammes animées
    this.flames = [];
    for (const sx of [-1, 1]) {
      const fg = new GeoBuilder();
      fg.octa(0.32, P.flame, 0, 0, 0, 1, 1.9, 1);
      fg.octa(0.2, '#ffffff', 0, 0.1, 0, 1, 1.5, 1);
      const fm = new THREE.Mesh(fg.build(), vcGlowMaterial());
      fm.position.set(sx * 4.0, 3.25, -1.9);
      env.add(fm);
      this.flames.push(fm);
    }
    S.add(env);
    this.P = P;
  },

  setHero(model) {
    if (this.hero) { this.scene.remove(this.hero.root); this.hero.dispose(); }
    this.hero = model;
    if (!model) return;
    model.root.position.set(0, 0.77, 0);
    model.root.scale.setScalar(1.12);
    model.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(model.root);
  },

  update(dt) {
    this.t += dt;
    const cam = this.camera;
    // cadrage : héros à gauche du panneau (sélection) ou au centre (création)
    // cadrage : le héros au centre de l'espace libre entre les panneaux
    const sel = this.mode === 'select';
    const narrow = innerWidth < 900;
    const dist = narrow ? 12.5 : 10.4;
    const vw = 2 * dist * Math.tan((cam.fov / 2) * Math.PI / 180) * cam.aspect;
    const mpp = vw / Math.max(1, innerWidth);
    const lx = narrow ? 0 : sel ? 173 * mpp : -35 * mpp;
    const sway = Math.sin(this.t * 0.25) * 0.15;
    cam.position.set(lx * 0.4 + sway, 2.75, dist);
    cam.lookAt(lx, 1.75, 0);
    if (this.hero) {
      this.hero.root.rotation.y += (this.rot - this.hero.root.rotation.y) * Math.min(1, dt * 8);
      this.hero.update(dt, 0);
    }
    for (const [i, f] of this.flames.entries()) {
      const k = 1 + Math.sin(this.t * 9 + i * 2) * 0.1 + Math.sin(this.t * 23 + i) * 0.05;
      f.scale.set(1, k, 1);
      f.rotation.y += dt * 1.5;
    }
    this.torchL.intensity = 6 + Math.sin(this.t * 11) * 0.6;
    this.torchR.intensity = 6 + Math.sin(this.t * 13 + 1) * 0.6;
    // poussières
    const a = this.motes.geometry.attributes.position;
    const up = this.P?.up;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + (up ? 0.6 : -0.25) * dt * (0.6 + (i % 7) * 0.1);
      if (y > 10) y = 0; if (y < 0) y = 10;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(this.t + i) * dt * 0.08);
    }
    a.needsUpdate = true;
  },
};

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
