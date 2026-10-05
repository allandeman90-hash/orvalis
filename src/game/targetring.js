// Cercle au sol sous la cible : rouge (hostile), jaune (neutre), vert (allié).
import * as THREE from 'three';
import { G } from './state.js';
import { isHostile } from './combat.js';

let ring = null, mat = null, fill = null;
function build() {
  const pos = [], idx = [];
  const arc = (r0, r1, a0, a1, n) => {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a); pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1); }
    for (let i = 0; i < n; i++) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  };
  // quatre arcs épais séparés par de petites encoches, et une pointe tournée vers l'intérieur dans chaque encoche
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2;
    arc(0.86, 1, a + 0.16, a + Math.PI / 2 - 0.16, 14);
    const b = pos.length / 3, c = Math.cos(a), s = Math.sin(a), t = 0.11;
    pos.push(c * 1.02 - s * t, 0, s * 1.02 + c * t, c * 1.02 + s * t, 0, s * 1.02 - c * t, c * 0.72, 0, s * 0.72);
    idx.push(b, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  mat = new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  ring = new THREE.Group();
  const m = new THREE.Mesh(g, mat); m.renderOrder = 5; ring.add(m);
  const disc = new THREE.CircleGeometry(0.86, 32); disc.rotateX(-Math.PI / 2);
  fill = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.16, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  fill.renderOrder = 4; ring.add(fill);
  ring.userData.spin = m;
  ring.visible = false;
  G.scene.add(ring);
}

export function updateTargetRing(dt) {
  const P = G.player;
  if (!P || !G.scene) return;
  if (!ring) build();
  const T = P.target;
  if (!T || T === P || (T.dead && T.kind !== 'mob') || T.visible === false || !(T.model || T.kind === 'remote')) { ring.visible = false; return; }
  ring.visible = true;
  const m = T.formModel || T.model;
  const r = Math.max(0.75, (m?.radius || T.radius || 0.5) * 1.45 + 0.25);
  const gy = T.groundY ? T.groundY() : T.pos.y;
  // sous une créature volante ou un joueur en vol, le cercle reste au sol
  ring.position.set(T.pos.x, Math.max(gy, -1.15) + 0.09, T.pos.z);
  const pulse = 1 + Math.sin(G.time * 4) * 0.035;
  ring.scale.set(r * pulse, 1, r * pulse);
  ring.userData.spin.rotation.y += dt * 0.9;
  const col = T.dead ? 0x9a9aa0 : isHostile(P, T) ? (T.kind === 'mob' && T.passive ? 0xffd23a : 0xff3a2a) : 0x4fe05a;
  mat.color.setHex(col); fill.material.color.setHex(col);
}
