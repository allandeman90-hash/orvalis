import * as THREE from 'three';
import { GeoBuilder } from '../engine/geom.js';
import { mulberry32 } from '../core/rng.js';

// Arbres stylisés à gros volumes : tronc trapu, houppiers en masses facettées,
// couleurs franches. Trois niveaux de détail partagent la même silhouette.
const TRUNK = { oak: '#7a5234', pine: '#6a4630', snowpine: '#6a4630', dead: '#6f5a4a', swamp: '#5a4a30', acacia: '#8a6238' };
const LEAF = {
  oak: ['#3f8f34', '#56a83e', '#6fc04a', '#8ad458'],
  pine: ['#1f6a44', '#2a7c4c', '#379058', '#46a264'],
  snowpine: ['#2a6a52', '#34785a', '#eaf2f8', '#ffffff'],
  swamp: ['#4a6a2c', '#5a7c32', '#6c8e3a', '#7fa044'],
  acacia: ['#7a9a34', '#8eb03c', '#a4c448', '#b8d456'],
};
export function treeGeometry(kind = 'oak', detail = 0) {
  const b = new GeoBuilder(), rnd = mulberry32(kind === 'oak' ? 91 : kind === 'pine' ? 43 : kind === 'swamp' ? 77 : 124);
  const seg = detail === 2 ? 4 : detail === 1 ? 5 : 7, bark = TRUNK[kind] || TRUNK.oak, L = LEAF[kind];
  const trunk = (rt, rb, h, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { b.surfOverride = 9; b.cyl(rt, rb, h, seg, bark, x, y + h / 2, z, rx, 0, rz); };
  const blob = (r, c, x, y, z, sy = 0.82) => { b.surfOverride = -1; if (detail === 2) b.octa(r * 1.1, c, x, y, z, 1, sy, 1); else b.ico(r, c, x, y, z, 1, sy, 1, detail === 0 ? 1 : 0); };
  if (kind === 'pine' || kind === 'snowpine') {
    trunk(0.16, 0.34, 3.2);
    const tiers = detail === 2 ? 2 : 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1), r = 2.5 - t * 1.6, h = 3.0 - t * 0.6, y = 2.2 + i * (detail === 2 ? 3.2 : 1.75);
      b.surfOverride = -1;
      b.cone(r, h, seg + 1, L[Math.min(1 + (i > 1 ? 1 : 0), 2)], 0, y + h / 2, 0, 0, i * 0.7, 0);
      if (kind === 'snowpine' && detail < 2) b.cone(r * 0.62, h * 0.62, seg + 1, L[3], 0, y + h * 0.69 + 0.02, 0, 0, i * 0.7, 0);
    }
    if (detail === 2 && kind === 'snowpine') b.cone(0.9, 2, seg, L[3], 0, 8.2, 0);
  } else if (kind === 'dead') {
    trunk(0.14, 0.36, 4.6, 0, 0, 0, 0, 0.06);
    if (detail < 2) for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4, y = 2.2 + i * 0.6, len = 2.1 - i * 0.25;
      b.surfOverride = 9; b.cyl(0.04, 0.11, len, 4, bark, Math.cos(a) * len * 0.36, y + len * 0.33, Math.sin(a) * len * 0.36, Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
    }
  } else if (kind === 'acacia') {
    trunk(0.2, 0.32, 3.4, 0, 0, 0, 0, 0.1);
    if (detail < 2) { trunk(0.1, 0.17, 2.2, 0.75, 2.5, 0, 0, -0.75); trunk(0.1, 0.17, 2.0, -0.9, 2.6, 0.2, 0, 0.8); }
    blob(2.4, L[1], 0, 5.0, 0, 0.34); blob(1.8, L[2], 1.5, 5.2, 0.4, 0.34);
    if (detail < 2) { blob(1.7, L[0], -1.6, 4.9, -0.3, 0.34); blob(1.3, L[3], 0.2, 5.5, -0.6, 0.3); }
  } else {
    const swamp = kind === 'swamp';
    trunk(swamp ? 0.3 : 0.26, swamp ? 0.62 : 0.5, swamp ? 3.4 : 3.6, 0, 0, 0, 0, swamp ? 0.08 : 0);
    if (detail === 0) for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; b.surfOverride = 9; b.cone(0.26, 0.9, 4, bark, Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.42, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); }
    if (detail < 2) { trunk(0.1, 0.18, 1.8, 0.6, 2.5, 0.1, 0, -0.7); trunk(0.1, 0.18, 1.7, -0.6, 2.7, -0.2, 0, 0.75); }
    const y0 = swamp ? 4.3 : 5.0, sy = swamp ? 0.6 : 0.85;
    blob(2.3, L[1], 0, y0, 0, sy);
    blob(1.7, L[0], 1.5, y0 - 0.5, 0.5, sy); blob(1.6, L[0], -1.4, y0 - 0.4, -0.6, sy);
    if (detail < 2) {
      blob(1.5, L[2], 0.3, y0 + 1.3, -0.3, sy); blob(1.4, L[1], -0.4, y0 - 0.2, 1.5, sy); blob(1.3, L[2], 0.6, y0 + 0.2, -1.5, sy);
      if (detail === 0) blob(0.9, L[3], -0.5, y0 + 1.9, 0.4, sy);
      if (swamp) for (let i = 0; i < 6; i++) { const a = i * 1.05, r = 1.6 + rnd() * 0.9; b.surfOverride = -1; b.cone(0.16, 1.6 + rnd(), 4, L[0], Math.cos(a) * r, y0 - 1.5, Math.sin(a) * r, Math.PI, 0, 0); }
    }
  }
  b.surfOverride = null;
  return b.build();
}
