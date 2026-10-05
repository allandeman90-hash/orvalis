// Portraits : la tête du modèle 3D rendue dans une petite image (joueur, cible, PNJ, créatures).
import * as THREE from 'three';
import { createModel } from '../game/models.js';

let renderer = null, scene = null, cam = null, failed = false;
const cache = new WeakMap(); // modèle -> image
const byKey = new Map();
const SIZE = 128;

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE); renderer.setClearColor(0x000000, 0);
  } catch (e) { failed = true; return; }
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x6a5a4a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.1); sun.position.set(2.5, 3, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9); rim.position.set(-3, 2, -3); scene.add(rim);
  cam = new THREE.PerspectiveCamera(28, 1, 0.05, 80);
}

const _v = new THREE.Vector3(), _b = new THREE.Box3(), _s = new THREE.Vector3();
// model : modèle affiché en jeu (sa définition sert à en construire une copie au repos)
export function portraitUrl(model) {
  if (!model || !model.spec || failed) return null;
  let url = cache.get(model);
  if (url) return url;
  let key = null;
  try { key = JSON.stringify(model.spec); } catch (e) { key = null; }
  if (key && byKey.has(key)) { url = byKey.get(key); cache.set(model, url); return url; }
  if (!renderer) init();
  if (failed) return null;
  let m = null;
  try {
    m = createModel(model.spec);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.t = 0; m.phase = 0; m.update(0.016, 0);
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const head = m.parts.head;
    _b.setFromObject(m.root); _b.getSize(_s);
    let d, yaw = 0.42;
    if (head && m.rig === 'humanoid') {
      // tête et épaules
      _b.setFromObject(head); _b.getCenter(_v); _b.getSize(_s);
      d = Math.max(_s.x, _s.y, 0.3) * 3.4; _v.y -= _s.y * 0.12;
    } else if (head) {
      _b.setFromObject(head); _b.getCenter(_v); _b.getSize(_s);
      d = Math.max(_s.x, _s.y, _s.z, 0.3) * 3.6; yaw = 0.7;
    } else {
      _b.getCenter(_v); d = Math.max(_s.x, _s.y, _s.z, 0.4) * 2.3; yaw = 0.6;
    }
    cam.position.set(_v.x + Math.sin(yaw) * d, _v.y + d * 0.12, _v.z + Math.cos(yaw) * d);
    cam.lookAt(_v);
    renderer.render(scene, cam);
    url = renderer.domElement.toDataURL('image/png');
  } catch (e) { console.warn('portrait', e); url = null; }
  if (m) { scene.remove(m.root); m.dispose(); }
  if (url) { cache.set(model, url); if (key) { if (byKey.size > 160) byKey.clear(); byKey.set(key, url); } }
  return url;
}
