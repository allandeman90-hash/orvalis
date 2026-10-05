// Effets visuels : particules radiales, projectiles, rayons et télégraphes.
import * as THREE from 'three';
import { G } from './state.js';
import { getHeight } from '../world/terrain.js';
import { GeoBuilder, vcGlowMaterial } from '../engine/geom.js';

const MAXP = 2600;
let scene = null;
let pMesh = null;
const P = []; // particules actives
const freeIdx = [];
const dummy = new THREE.Object3D();
const col = new THREE.Color();
const projectiles = [];
const beams = [];
const rings = [];
const decals = [];
const timed = []; // fonctions différées {t, fn}

export function initFX(sc) {
  scene = sc;
  const geo = new THREE.PlaneGeometry(1, 1);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.2,'rgba(255,255,255,.85)');gradient.addColorStop(.6,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending:THREE.AdditiveBlending });
  pMesh = new THREE.InstancedMesh(geo, mat, MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  pMesh.renderOrder = 5;
  for (let i = 0; i < MAXP; i++) {
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0); dummy.updateMatrix();
    pMesh.setMatrixAt(i, dummy.matrix);
    pMesh.setColorAt(i, col.set(0xffffff));
    freeIdx.push(i);
  }
  scene.add(pMesh);
}

export function after(t, fn) { timed.push({ t, fn }); }

// ---------------------------------------------------------------------------
// Particules
export function burst(x, y, z, o = {}) {
  const n = o.count ?? 10;
  const c1 = new THREE.Color(o.color || '#ffffff'), c2 = new THREE.Color(o.color2 || o.color || '#ffffff');
  for (let i = 0; i < n; i++) {
    const idx = freeIdx.pop();
    if (idx === undefined) return;
    const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
    const a = Math.random() * Math.PI * 2;
    const up = o.up ?? 0.6;
    const vy = (Math.random() * 0.8 + 0.2) * up * sp + (o.vy || 0);
    const spread = o.spread ?? 1;
    const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
    const rc = Math.random();
    P.push({
      idx, x: x + (Math.random() - 0.5) * (o.jitter || 0.3), y: y + (Math.random() - 0.5) * (o.jitter || 0.3), z: z + (Math.random() - 0.5) * (o.jitter || 0.3),
      vx: Math.cos(a) * sp * spread + (o.vx || 0), vy, vz: Math.sin(a) * sp * spread + (o.vz || 0),
      life, max: life, size: (o.size ?? 0.18) * (0.6 + Math.random() * 0.8), g: o.gravity ?? 6, drag: o.drag ?? 1.5,
      r: c1.r + (c2.r - c1.r) * rc, gg: c1.g + (c2.g - c1.g) * rc, b: c1.b + (c2.b - c1.b) * rc, spin: Math.random() * 6,
    });
  }
}

// Colonne de particules (montée de niveau, soin, téléportation)
export function pillar(x, y, z, color = '#ffe68a', n = 40, h = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.9;
    burst(x + Math.cos(a) * r, y + Math.random() * 0.4, z + Math.sin(a) * r, { count: 1, color, speed: 0.2, vy: h * (0.6 + Math.random()), gravity: -0.5, life: 1.1, size: 0.16, up: 0 });
  }
}

// ---------------------------------------------------------------------------
// Projectiles
const PGEO = {};
function projMesh(kind) {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  switch (kind) {
    case 'arrow': case 'bolt':
      b.box(0.05, 0.05, 0.8, '#8a6440', 0, 0, 0); b.box(0.09, 0.09, 0.16, '#c9ced6', 0, 0, 0.44); b.box(0.02, 0.12, 0.18, '#f0f0f0', 0, 0, -0.35);
      break;
    case 'javelin': case 'spear':
      b.box(0.06, 0.06, 1.4, '#6b4a2e', 0, 0, 0); b.box(0.1, 0.1, 0.26, '#d0d4da', 0, 0, 0.8);
      break;
    case 'fire': b.ico(0.28, '#ffb040', 0, 0, 0); b.ico(0.18, '#fff0a0', 0, 0, 0); break;
    case 'bigfire': b.ico(0.6, '#ff8a2a', 0, 0, 0); b.ico(0.4, '#fff0a0', 0, 0, 0); break;
    case 'frost': b.octa(0.26, '#bfeaff', 0, 0, 0, 1, 1, 1.8); break;
    case 'ice': b.octa(0.35, '#dff6ff', 0, 0, 0, 0.8, 0.8, 3.2); break;
    case 'nature': b.octa(0.16, '#8fe86a', 0, 0, 0, 1, 1, 2.6); b.box(0.06, 0.06, 0.5, '#4f7a30', 0, 0, -0.2); break;
    case 'shadow': b.ico(0.28, '#8a5aff', 0, 0, 0); b.ico(0.16, '#e0d0ff', 0, 0, 0); break;
    case 'arcane': b.octa(0.24, '#e0b0ff', 0, 0, 0); break;
    case 'wisp': b.ico(0.22, '#b0ffb0', 0, 0, 0); break;
    case 'swamp': b.ico(0.26, '#9ac040', 0, 0, 0); break;
    case 'bomb': b.ico(0.22, '#2a2a2a', 0, 0, 0); b.box(0.05, 0.2, 0.05, '#ffb050', 0, 0.2, 0); break;
    case 'poison': b.octa(0.12, '#b6e04a', 0, 0, 0, 1, 1, 2); b.box(0.04, 0.04, 0.7, '#6b4a2e', 0, 0, -0.3); break;
    case 'lightning': b.octa(0.22, '#dff0ff', 0, 0, 0, 1, 1, 2); break;
    case 'rock': b.dodeca(0.5, '#6a5a50', 0, 0, 0); break;
    case 'thorn': b.octa(0.15, '#a0e070', 0, 0, 0, 1, 1, 2.6); break;
    case 'holy': b.box(0.34, 0.2, 0.2, '#ffe68a', 0, 0, 0.1); b.box(0.06, 0.06, 0.5, '#fff4c8', 0, 0, -0.2); b.ico(0.16, '#ffffff', 0, 0, 0.1); break;
    case 'dagger': b.box(0.05, 0.03, 0.4, '#e8ecf0', 0, 0, 0.1); b.box(0.14, 0.04, 0.05, '#e05a78', 0, 0, -0.1); break;
    default: b.ico(0.2, '#ffffff', 0, 0, 0);
  }
  if (!PGEO[kind]) PGEO[kind] = b.build();
  const m = new THREE.Mesh(PGEO[kind], vcGlowMaterial());
  g.add(m);
  return g;
}
const TRAIL = {
  fire: ['#ffb040', '#ff5a1a'], bigfire: ['#ffb040', '#ff3a0a'], frost: ['#dff6ff', '#8fd8ff'], ice: ['#ffffff', '#bfeaff'], nature: ['#b0ff80', '#4f9a30'],
  shadow: ['#b58cff', '#5a2aa0'], arcane: ['#f0d0ff', '#b58cff'], wisp: ['#d0ffd0', '#6ad06a'], swamp: ['#c0e060', '#5a7a2a'], lightning: ['#ffffff', '#9fd0ff'],
  poison: ['#d0ff70', '#6a9a2a'], bomb: ['#ffb050', '#666666'], thorn: ['#c0ff90', '#5a9a3a'], holy: ['#fff4c8', '#ffd24a'], dagger: ['#ffd0dc', '#e05a78'],
};

// o: {from:{x,y,z}, target: entité ou point, kind, speed, onHit, arc}
export function projectile(o) {
  const mesh = projMesh(o.kind || 'arrow');
  mesh.position.set(o.from.x, o.from.y, o.from.z);
  scene.add(mesh);
  const p = { mesh, target: o.target, speed: o.speed || 30, onHit: o.onHit, kind: o.kind, arc: o.arc || 0, t: 0,
    sx: o.from.x, sy: o.from.y, sz: o.from.z, trailT: 0, maxT: 6 };
  if (o.arc) {
    const tp = targetPos(o.target);
    p.dist = Math.hypot(tp.x - p.sx, tp.z - p.sz);
    p.dur = Math.max(0.35, p.dist / p.speed);
  }
  projectiles.push(p);
  return p;
}
function targetPos(t) {
  if (t.pos) return { x: t.pos.x, y: t.pos.y + (t.aimY ?? (t.model ? t.model.height * 0.6 : 1)), z: t.pos.z };
  return t;
}

// ---------------------------------------------------------------------------
// Rayons (éclairs en chaîne, drains)
export function beam(a, b, color = '#bfe0ff', life = 0.25, jitter = 0.5, width = 1) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? 0 : jitter;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, linewidth: width }));
  scene.add(m);
  beams.push({ m, life, max: life });
}

// Anneau d'onde de choc
export function shockRing(x, z, r = 4, color = '#ffffff', life = 0.45) {
  const geo = new THREE.RingGeometry(0.85, 1, 32);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, getHeight(x, z) + 0.25, z);
  m.renderOrder = 4;
  scene.add(m);
  rings.push({ m, life, max: life, r });
}

// ---------------------------------------------------------------------------
// Disques au sol épousant le relief (zones d'effet et télégraphes)
const decalMat = (color, mode) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { color: { value: new THREE.Color(color) }, progress: { value: 0 }, opacity: { value: 1 }, time: { value: 0 }, mode: { value: mode } },
  vertexShader: `attribute float rr; varying float vR; void main(){ vR = rr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 color; uniform float progress; uniform float opacity; uniform float time; uniform float mode; varying float vR;
    void main(){
      float a = 0.0;
      float edge = smoothstep(0.9, 0.97, vR) * (1.0 - smoothstep(0.97, 1.0, vR));
      if (mode < 0.5) {
        a = 0.18 + edge * 0.7 + 0.08 * sin(vR * 18.0 - time * 4.0);
      } else {
        float fill = step(vR, progress) * 0.35;
        a = 0.12 + fill + edge * 0.85;
      }
      gl_FragColor = vec4(color, a * opacity);
      #include <colorspace_fragment>
    }`,
});

function conformDisc(x, z, r, angle = null, dir = 0) {
  const seg = r > 8 ? 48 : 32;
  const rings_ = r > 8 ? 8 : 5;
  const pos = [], rr = [], idx = [];
  // centre
  pos.push(x, getHeight(x, z) + 0.14, z); rr.push(0);
  const a0 = angle ? dir - angle / 2 : 0, span = angle || Math.PI * 2;
  const ns = angle ? Math.max(8, Math.round(seg * span / (Math.PI * 2)) + 1) : seg;
  for (let k = 1; k <= rings_; k++) {
    const rk = (k / rings_) * r;
    for (let i = 0; i < ns; i++) {
      const a = a0 + (angle ? (i / (ns - 1)) * span : (i / ns) * span);
      const px = x + Math.sin(a) * rk, pz = z + Math.cos(a) * rk;
      pos.push(px, getHeight(px, pz) + 0.14, pz);
      rr.push(k / rings_);
    }
  }
  for (let k = 0; k < rings_; k++) {
    for (let i = 0; i < ns; i++) {
      if (angle && i === ns - 1) continue;
      const i2 = angle ? i + 1 : (i + 1) % ns;
      if (k === 0) idx.push(0, 1 + i, 1 + i2);
      else {
        const a = 1 + (k - 1) * ns + i, b = 1 + (k - 1) * ns + i2, c = 1 + k * ns + i, d = 1 + k * ns + i2;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('rr', new THREE.Float32BufferAttribute(rr, 1));
  g.setIndex(idx);
  return g;
}

// Disque persistant (zone d'effet). Retourne un handle {remove()}.
export function groundDisc(x, z, r, color = '#ff8a3a', life = 5, opt = {}) {
  const m = new THREE.Mesh(conformDisc(x, z, r, opt.angle, opt.dir), decalMat(color, 0));
  m.renderOrder = 3;
  scene.add(m);
  const d = { m, life, max: life, kind: 'zone', removed: false };
  decals.push(d);
  return { remove() { d.life = 0; }, d };
}

// Télégraphe : se remplit pendant "delay" secondes puis déclenche onFire
export function telegraph(x, z, r, delay, onFire, opt = {}) {
  const m = new THREE.Mesh(conformDisc(x, z, r, opt.angle, opt.dir), decalMat(opt.color || '#ff3a2a', 1));
  m.renderOrder = 3;
  scene.add(m);
  decals.push({ m, life: delay, max: delay, kind: 'tele', onFire });
}

// ---------------------------------------------------------------------------
export function updateFX(dt) {
  // différés
  for (let i = timed.length - 1; i >= 0; i--) {
    timed[i].t -= dt;
    if (timed[i].t <= 0) { const f = timed[i].fn; timed.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
  }
  // particules
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) {
      dummy.position.set(0, -999, 0); dummy.scale.setScalar(0); dummy.updateMatrix();
      pMesh.setMatrixAt(p.idx, dummy.matrix);
      freeIdx.push(p.idx);
      P.splice(i, 1);
      continue;
    }
    p.vy -= p.g * dt;
    const dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vz *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.spin += dt * 4;
    const k = p.life / p.max;
    dummy.position.set(p.x, p.y, p.z);
    dummy.quaternion.copy(G.camera.quaternion);dummy.rotateZ(p.spin);
    dummy.scale.setScalar(p.size * (0.3 + 0.7 * k));
    dummy.updateMatrix();
    pMesh.setMatrixAt(p.idx, dummy.matrix);
    col.setRGB(p.r, p.gg, p.b);
    pMesh.setColorAt(p.idx, col);
  }
  if (pMesh) {
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }
  // projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    const tp = targetPos(p.target);
    const m = p.mesh;
    let hit = false;
    if (p.arc) {
      const k = Math.min(1, p.t / p.dur);
      const x = p.sx + (tp.x - p.sx) * k, z = p.sz + (tp.z - p.sz) * k;
      const y = p.sy + (tp.y - p.sy) * k + Math.sin(k * Math.PI) * p.arc;
      m.lookAt(x, y, z);
      m.position.set(x, y, z);
      m.rotation.x += p.t * 6;
      if (k >= 1) hit = true;
    } else {
      const dx = tp.x - m.position.x, dy = tp.y - m.position.y, dz = tp.z - m.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const step = p.speed * dt;
      if (d <= step + 0.2) hit = true;
      else {
        m.position.x += (dx / d) * step; m.position.y += (dy / d) * step; m.position.z += (dz / d) * step;
        m.lookAt(tp.x, tp.y, tp.z);
      }
    }
    // traînée
    p.trailT -= dt;
    const tr = TRAIL[p.kind];
    if (tr && p.trailT <= 0) {
      p.trailT = 0.03;
      burst(m.position.x, m.position.y, m.position.z, { count: 1, color: tr[0], color2: tr[1], speed: 0.4, life: 0.35, size: 0.14, gravity: 0, up: 0.2 });
    }
    if (hit || p.t > p.maxT) {
      scene.remove(m);
      projectiles.splice(i, 1);
      if (hit && p.onHit) { try { p.onHit(); } catch (e) { console.error(e); } }
    }
  }
  // rayons
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life -= dt;
    b.m.material.opacity = Math.max(0, b.life / b.max);
    if (b.life <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); beams.splice(i, 1); }
  }
  // anneaux
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    const k = 1 - r.life / r.max;
    r.m.scale.setScalar(0.3 + k * r.r);
    r.m.material.opacity = 0.8 * (1 - k);
    if (r.life <= 0) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
  // disques
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    d.life -= dt;
    const u = d.m.material.uniforms;
    u.time.value += dt;
    if (d.kind === 'tele') u.progress.value = 1 - Math.max(0, d.life) / d.max;
    else u.opacity.value = Math.min(1, d.life * 3, (d.max - d.life) * 6 + 0.2);
    if (d.life <= 0) {
      scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose();
      decals.splice(i, 1);
      if (d.kind === 'tele' && d.onFire) { try { d.onFire(); } catch (e) { console.error(e); } }
    }
  }
}
