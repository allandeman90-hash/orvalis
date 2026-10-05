// Caméra 3e personne orbitale (glisser pour tourner, molette pour zoomer), évite le relief.
import * as THREE from 'three';
import { getHeight } from '../world/terrain.js';
import { segmentHit } from '../world/collide.js';
import { clamp, lerp } from '../core/util.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // regarde vers -z
    this.pitch = 0.32;
    this.dist = 11;
    this.targetDist = 11;
    this.focus = new THREE.Vector3();
    this.smoothFocus = new THREE.Vector3();
    this.shake = 0;
    this.first = true;
  }

  // yaw : angle horizontal ; direction "avant" de la caméra = (sin yaw, cos yaw)
  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  update(dt, input, target, settings) {
    const sens = 0.0045 * (settings?.sensitivity || 1);
    if (input && (input.mouse.left || input.mouse.right)) {
      this.yaw -= input.mouse.dx * sens;
      this.pitch += input.mouse.dy * sens * (settings?.invertY ? -1 : 1);
    }
    if (input && input.mouse.wheel) this.targetDist = clamp(this.targetDist + input.mouse.wheel * 1.4, 3, 30);
    this.pitch = clamp(this.pitch, -0.35, 1.35);
    this.dist = lerp(this.dist, this.targetDist, Math.min(1, dt * 10));

    this.focus.set(target.x, target.y + (target.eye || 1.7), target.z);
    if (this.first) { this.smoothFocus.copy(this.focus); this.first = false; this.occD = undefined; }
    this.smoothFocus.lerp(this.focus, Math.min(1, dt * 14));
    const f = this.smoothFocus;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let d = this.dist;
    // recul de la caméra en arrière de la direction regardée
    let cx = f.x - Math.sin(this.yaw) * cp * d;
    let cz = f.z - Math.cos(this.yaw) * cp * d;
    let cy = f.y + sp * d;
    // collision avec le relief : on rapproche la caméra si nécessaire
    for (let i = 0; i < 6; i++) {
      const gh = getHeight(cx, cz) + 0.6;
      if (cy >= gh) break;
      d *= 0.8;
      cx = f.x - Math.sin(this.yaw) * cp * d;
      cz = f.z - Math.cos(this.yaw) * cp * d;
      cy = f.y + sp * d;
    }
    // occlusion par les bâtiments : la caméra se rapproche aussitôt, puis recule en douceur
    const hit = segmentHit(f.x, f.y, f.z, cx, cy, cz);
    const want = hit < 1 ? Math.max(1.2, d * hit - 0.45) : d;
    if (this.occD === undefined || want < this.occD) this.occD = want;
    else this.occD = lerp(this.occD, want, Math.min(1, dt * 3));
    if (this.occD < d - 0.01) {
      d = this.occD;
      cx = f.x - Math.sin(this.yaw) * cp * d;
      cz = f.z - Math.cos(this.yaw) * cp * d;
      cy = f.y + sp * d;
    }
    const gh = getHeight(cx, cz) + 0.6;
    if (cy < gh) cy = gh;
    this.camera.position.set(cx, cy, cz);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.camera.lookAt(f.x, f.y, f.z);
  }
}
