// Génère l'image de la carte du monde (vue du dessus) à partir du relief.
import * as THREE from 'three';
import { groundColor, zoneAt, getSlope } from './terrain.js';
import { H, VN, RES, CELL } from './terrain.js';
import { WORLD_HALF } from '../data/zones.js';

export function renderWorldMap(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const k = RES / size;
  const color = new THREE.Color();
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = Math.min(RES - 1, Math.floor(px * k)), j = Math.min(RES - 1, Math.floor(py * k));
      const wx=-WORLD_HALF+i*CELL, wz=-WORLD_HALF+j*CELL;
      groundColor(wx,wz,H[j*VN+i],getSlope(wx,wz),color);
      let r=color.r, g=color.g, b=color.b;
      const h = H[j * VN + i];
      // ombrage (lumière venant du nord-ouest)
      const hW = H[j * VN + Math.max(0, i - 1)], hN = H[Math.max(0, j - 1) * VN + i];
      let shade = 1 + ((h - hW) + (h - hN)) * 0.045;
      shade = Math.max(0.55, Math.min(1.35, shade));
      r = Math.sqrt(r) * shade; g = Math.sqrt(g) * shade; b = Math.sqrt(b) * shade;
      if (h < -0.05) {
        const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
        const depth = Math.min(1, -h / 6);
        if (zoneAt(x,z).biome === 'volcanic') { r = 0.95; g = 0.45 + 0.1 * depth; b = 0.1; }
        else if (zoneAt(x,z).biome === 'swamp') { r = 0.3 - depth * 0.08; g = 0.36 - depth * 0.08; b = 0.2; }
        else { r = 0.22 - depth * 0.1; g = 0.48 - depth * 0.14; b = 0.72 - depth * 0.12; }
      }
      const o = (py * size + px) * 4;
      img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, g * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
