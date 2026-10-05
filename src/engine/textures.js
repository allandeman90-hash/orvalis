// Textures « peintes à la main » générées par le code (style des MMO du milieu des années 2000) :
// 512 × 512, répétables, rangées dans un tableau de textures. Elles multiplient la couleur des sommets
// (moyenne 0,5 → facteur 1) : les couleurs des biomes et des bâtiments restent celles du jeu, avec du détail en plus.
// Aucun fichier image : tout est dessiné ici, sans droits d'auteur tiers.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const S = 512;
// indices des couches (partagés avec les shaders et la géométrie)
export const SURF = {
  none: -1, grass: 0, dirt: 1, rock: 2, sand: 3, snow: 4, stone: 5, planks: 6, tiles: 7,
  leaves: 8, bark: 9, plaster: 10, cloth: 11, cobble: 12,
};
// mètres couverts par une répétition de texture, et force du détail
export const SURF_SCALE = [6, 5, 7, 4.5, 6, 2.4, 2.2, 2.4, 2.6, 1.6, 3, 1.4, 4.2];
export const SURF_STRENGTH = [0.5, 0.7, 1, 0.75, 0.55, 0.95, 0.95, 0.95, 0.9, 0.9, 0.85, 0.35, 0.9];

function makeCtx() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  return g;
}
const grey = (l, a = 1, tr = 0, tg = 0, tb = 0) => {
  const v = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return `rgba(${v(l * 255 + tr)},${v(l * 255 + tg)},${v(l * 255 + tb)},${a})`;
};
// dessine une forme en la répétant de part et d'autre des bords (texture sans couture)
function wrap(x, y, r, fn) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    const X = x + dx, Y = y + dy;
    if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue;
    fn(X, Y);
  }
}
function blotches(g, R, n, rmin, rmax, lmin, lmax, alpha, tint = [0, 0, 0]) {
  rmin *= 2; rmax *= 2;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin), l = lmin + R() * (lmax - lmin);
    wrap(x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r);
      gr.addColorStop(0, grey(l, alpha, ...tint));
      gr.addColorStop(1, grey(l, 0, ...tint));
      g.fillStyle = gr;
      g.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }
}
function speckles(g, R, n, lmin, lmax, size = 1.5) {
  n *= 4;
  for (let i = 0; i < n; i++) {
    g.fillStyle = grey(lmin + R() * (lmax - lmin), 0.8);
    const s = size * (0.5 + R());
    g.fillRect(R() * S, R() * S, s, s);
  }
}

// ---------------------------------------------------------------------------
// Peintres
const P = {
  grass(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    blotches(g, R, 26, 20, 60, 0.36, 0.62, 0.55, [4, 10, -10]);
    for (let i = 0; i < 12800; i++) {
      const x = R() * S, y = R() * S, len = 4 + R() * 9, a = -Math.PI / 2 + (R() - 0.5) * 0.9;
      const l = 0.3 + R() * 0.5, warm = R() < 0.25;
      g.strokeStyle = grey(l, 0.85, warm ? 18 : -4, warm ? 14 : 8, warm ? -18 : -8);
      g.lineWidth = 1 + R() * 1.4;
      wrap(x, y, len, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); g.stroke(); });
    }
    // petites fleurs et trèfles clairs
    for (let i = 0; i < 40; i++) { g.fillStyle = grey(0.78 + R() * 0.15, 0.9, 20, 20, -10); g.fillRect(R() * S, R() * S, 2, 2); }
  },
  dirt(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    blotches(g, R, 40, 14, 50, 0.35, 0.65, 0.5, [6, 2, -6]);
    // cailloux
    for (let i = 0; i < 110; i++) {
      const x = R() * S, y = R() * S, rx = 1.2 + R() * R() * 5, ry = rx * (0.5 + R() * 0.4), l = 0.42 + R() * 0.26;
      wrap(x, y, rx + 2, (X, Y) => {
        g.fillStyle = grey(l * 0.55, 0.7); g.beginPath(); g.ellipse(X + 1, Y + 1.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = grey(l, 1, 4, 2, -4); g.beginPath(); g.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = grey(Math.min(1, l + 0.18), 0.8); g.beginPath(); g.ellipse(X - rx * 0.3, Y - ry * 0.35, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2); g.fill();
      });
    }
    // fissures
    g.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      let x = R() * S, y = R() * S;
      g.strokeStyle = grey(0.25, 0.5);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; g.lineTo(x, y); }
      g.stroke();
    }
    speckles(g, R, 900, 0.3, 0.7);
  },
  rock(g, R) {
    g.fillStyle = grey(0.42); g.fillRect(0, 0, S, S);
    // grandes facettes irrégulières, éclairées par le haut
    for (let i = 0; i < 70; i++) {
      const x = R() * S, y = R() * S, r = 18 + R() * 34, n = 5 + Math.floor(R() * 3), l = 0.38 + R() * 0.3;
      const pts = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + R() * 0.5; pts.push([Math.cos(a) * r * (0.7 + R() * 0.4), Math.sin(a) * r * (0.5 + R() * 0.3)]); }
      wrap(x, y, r, (X, Y) => {
        const gr = g.createLinearGradient(X, Y - r, X, Y + r);
        gr.addColorStop(0, grey(l + 0.16)); gr.addColorStop(1, grey(l - 0.12));
        g.fillStyle = gr;
        g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(X + px, Y + py) : g.moveTo(X + px, Y + py))); g.closePath(); g.fill();
        g.strokeStyle = grey(0.16, 0.8); g.lineWidth = 2; g.stroke();
        g.strokeStyle = grey(0.8, 0.35); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(X + pts[0][0], Y + pts[0][1] - 1); g.lineTo(X + pts[1][0], Y + pts[1][1] - 1); g.stroke();
      });
    }
    blotches(g, R, 20, 20, 50, 0.3, 0.6, 0.25, [4, 4, 0]);
    speckles(g, R, 1400, 0.25, 0.75);
  },
  sand(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    blotches(g, R, 20, 20, 60, 0.42, 0.6, 0.4);
    // rides
    for (let row = 0; row < 16; row++) {
      const y0 = row * 16 + R() * 6, ph = R() * 6, amp = 2 + R() * 2;
      for (const [dy, l] of [[0, 0.62], [2.5, 0.38]]) {
        g.strokeStyle = grey(l, 0.55); g.lineWidth = 1.8;
        g.beginPath();
        for (let x = 0; x <= S; x += 4) { const y = y0 + dy + Math.sin((x / S) * Math.PI * 4 + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    }
    speckles(g, R, 2400, 0.3, 0.75, 1.2);
  },
  snow(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    blotches(g, R, 30, 25, 70, 0.4, 0.62, 0.5, [-6, -2, 8]);
    for (let i = 0; i < 160; i++) { g.fillStyle = grey(0.9, 0.9); g.fillRect(R() * S, R() * S, 1.5, 1.5); }
  },
  stone(g, R) {
    g.fillStyle = grey(0.22); g.fillRect(0, 0, S, S); // mortier
    const rows = 5, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 30 - 30 * R();
      while (x < S) {
        const w = 44 + R() * 44, l = 0.4 + R() * 0.28, y = r * rh, tn = R() < 0.35 ? [10, 5, -4] : R() < 0.5 ? [-5, -1, 6] : [0, 0, 0];
        const draw = (X) => {
          const gr = g.createLinearGradient(X, y, X + w * 0.4, y + rh);
          gr.addColorStop(0, grey(l + 0.14, 1, ...tn)); gr.addColorStop(1, grey(l - 0.1, 1, ...tn));
          g.fillStyle = gr;
          g.beginPath(); g.roundRect(X + 2.5, y + 2.5, w - 5, rh - 5, 5); g.fill();
          g.strokeStyle = grey(0.85, 0.35); g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(X + 5, y + 4); g.lineTo(X + w - 6, y + 4); g.stroke();
          // éclats et taches
          for (let k = 0; k < 4; k++) { g.fillStyle = grey(l - 0.18 + R() * 0.1, 0.5); g.beginPath(); g.arc(X + 6 + R() * (w - 12), y + 6 + R() * (rh - 12), 1 + R() * 3, 0, Math.PI * 2); g.fill(); }
        };
        draw(x); if (x + w > S) draw(x - S); if (x < 0) draw(x + S);
        x += w;
      }
    }
    speckles(g, R, 900, 0.3, 0.7);
  },
  planks(g, R) {
    let x = 0;
    while (x < S) {
      const w = S / 7 * (0.85 + R() * 0.3), l = 0.42 + R() * 0.22;
      const ww = Math.min(w, S - x);
      g.fillStyle = grey(l, 1, 6, 2, -6); g.fillRect(x, 0, ww, S);
      // veinage
      for (let k = 0; k < 7; k++) {
        const ox = x + 3 + R() * (ww - 6), ph = R() * 6;
        g.strokeStyle = grey(l - 0.16 + R() * 0.08, 0.55); g.lineWidth = 1 + R();
        g.beginPath();
        for (let y = 0; y <= S; y += 8) { const xx = ox + Math.sin((y / S) * Math.PI * 2 * (1 + Math.floor(R() * 2)) + ph) * 2; y ? g.lineTo(xx, y) : g.moveTo(xx, y); }
        g.stroke();
      }
      // nœud et clous
      if (R() < 0.6) { const ky = R() * S; g.fillStyle = grey(l - 0.22, 0.8); g.beginPath(); g.ellipse(x + ww / 2, ky, 4, 7, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = grey(0.18); g.fillRect(x, 0, 2.5, S); // joint
      g.fillStyle = grey(0.75, 0.25); g.fillRect(x + 2.5, 0, 1.5, S);
      for (const ny of [18, S - 18]) { g.fillStyle = grey(0.2); g.fillRect(x + ww / 2 - 2, ny, 4, 4); g.fillStyle = grey(0.7, 0.6); g.fillRect(x + ww / 2 - 2, ny, 2, 2); }
      x += w;
    }
    g.fillStyle = grey(0.2); g.fillRect(0, S / 2 - 1, S, 3); // raccord horizontal
  },
  tiles(g, R) {
    g.fillStyle = grey(0.2); g.fillRect(0, 0, S, S);
    const rows = 8, rh = S / rows, tw = S / 8;
    for (let r = rows; r >= -1; r--) {
      const off = (r % 2) * tw / 2;
      for (let i = -1; i <= 8; i++) {
        const x = i * tw + off, y = r * rh, l = 0.42 + R() * 0.24;
        const gr = g.createLinearGradient(x, y, x, y + rh * 1.3);
        gr.addColorStop(0, grey(l + 0.16)); gr.addColorStop(1, grey(l - 0.16));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x + 1.5, y); g.lineTo(x + tw - 1.5, y); g.lineTo(x + tw - 1.5, y + rh * 0.9);
        g.quadraticCurveTo(x + tw / 2, y + rh * 1.35, x + 1.5, y + rh * 0.9); g.closePath(); g.fill();
        g.strokeStyle = grey(0.12, 0.5); g.lineWidth = 1.2; g.stroke();
      }
    }
    speckles(g, R, 500, 0.3, 0.7);
  },
  leaves(g, R) {
    g.fillStyle = grey(0.32); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = R() * S, y = R() * S, r = 4 + R() * 7, a = R() * Math.PI, l = 0.35 + R() * 0.4, warm = R() < 0.2;
      wrap(x, y, r, (X, Y) => {
        g.fillStyle = grey(l * 0.6, 0.6); g.beginPath(); g.ellipse(X + 1.5, Y + 2, r, r * 0.55, a, 0, Math.PI * 2); g.fill();
        g.fillStyle = grey(l, 1, warm ? 14 : -4, warm ? 10 : 8, warm ? -14 : -6); g.beginPath(); g.ellipse(X, Y, r, r * 0.55, a, 0, Math.PI * 2); g.fill();
        g.fillStyle = grey(Math.min(1, l + 0.2), 0.55); g.beginPath(); g.ellipse(X - 1, Y - 1.5, r * 0.45, r * 0.22, a, 0, Math.PI * 2); g.fill();
      });
    }
  },
  bark(g, R) {
    g.fillStyle = grey(0.45); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      const x0 = R() * S, ph = R() * 6, l = R() < 0.5 ? 0.22 + R() * 0.1 : 0.58 + R() * 0.12, w = 1.5 + R() * 3.5;
      g.strokeStyle = grey(l, 0.75); g.lineWidth = w;
      g.beginPath();
      for (let y = -8; y <= S + 8; y += 8) { const x = x0 + Math.sin((y / S) * Math.PI * 2 + ph) * 5 + (R() - 0.5) * 2; y > -8 ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    blotches(g, R, 14, 10, 30, 0.3, 0.55, 0.35, [4, 6, -4]);
  },
  plaster(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    blotches(g, R, 36, 20, 70, 0.4, 0.6, 0.35, [6, 3, -4]);
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = R() * S, y = R() * S;
      g.strokeStyle = grey(0.3, 0.5); g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 16; y += R() * 14; g.lineTo(x, y); }
      g.stroke();
    }
    speckles(g, R, 700, 0.38, 0.62);
  },
  cloth(g, R) {
    g.fillStyle = grey(0.5); g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) { g.fillStyle = grey(0.44 + R() * 0.08, 0.6); g.fillRect(0, y, S, 2); }
    for (let x = 0; x < S; x += 4) { g.fillStyle = grey(0.5 + R() * 0.08, 0.35); g.fillRect(x, 0, 2, S); }
    blotches(g, R, 10, 20, 50, 0.4, 0.6, 0.3);
  },
  cobble(g, R) {
    g.fillStyle = grey(0.2); g.fillRect(0, 0, S, S);
    const n = 11, cs = S / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (R() - 0.5) * 0.25) * cs + (j % 2) * cs * 0.5, y = (j + 0.5 + (R() - 0.5) * 0.25) * cs;
      const rx = cs * (0.38 + R() * 0.12), ry = cs * (0.32 + R() * 0.12), l = 0.36 + R() * 0.32, rot = R() * Math.PI;
      const tint = R() < 0.3 ? [10, 4, -6] : R() < 0.5 ? [-4, 0, 6] : [0, 0, 0];
      const pts = [];
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; pts.push([Math.cos(a + rot) * rx * (0.82 + R() * 0.25), Math.sin(a + rot) * ry * (0.82 + R() * 0.25)]); }
      wrap(x, y, rx + 2, (X, Y) => {
        const gr = g.createLinearGradient(X - rx, Y - ry, X + rx * 0.6, Y + ry);
        gr.addColorStop(0, grey(l + 0.2, 1, ...tint)); gr.addColorStop(1, grey(l - 0.12, 1, ...tint));
        g.fillStyle = gr;
        g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(X + px, Y + py) : g.moveTo(X + px, Y + py))); g.closePath(); g.fill();
        g.strokeStyle = grey(0.12, 0.6); g.lineWidth = 1.5; g.stroke();
      });
    }
    blotches(g, R, 16, 20, 50, 0.35, 0.6, 0.25, [4, 4, 0]);
    speckles(g, R, 700, 0.3, 0.7);
  },
};
const ORDER = ['grass', 'dirt', 'rock', 'sand', 'snow', 'stone', 'planks', 'tiles', 'leaves', 'bark', 'plaster', 'cloth', 'cobble'];

let _tex = null;
export function surfaceTextures() {
  if (_tex) return _tex;
  const N = ORDER.length;
  const data = new Uint8Array(S * S * 4 * N);
  ORDER.forEach((name, li) => {
    const g = makeCtx();
    P[name](g, mulberry32(9100 + li * 131));
    const px = g.getImageData(0, 0, S, S).data;
    // moyenne ramenée à 0,5 : la texture ne fait qu'ajouter du détail, sans assombrir ni éclaircir la couleur
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const k = 128 / (sum / (S * S));
    const off = li * S * S * 4;
    for (let i = 0; i < px.length; i += 4) {
      data[off + i] = Math.min(255, px[i] * k); data[off + i + 1] = Math.min(255, px[i + 1] * k); data[off + i + 2] = Math.min(255, px[i + 2] * k); data[off + i + 3] = 255;
    }
  });
  const t = new THREE.DataArrayTexture(data, S, S, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  _tex = t;
  return t;
}

// ---------------------------------------------------------------------------
// Branchement dans les matériaux Lambert existants (projection triplanaire en coordonnées du monde)
const GLSL_COMMON = /* glsl */ `
uniform sampler2DArray uSurf;
uniform float uSurfOn;
uniform float uScale[13];
uniform float uStrength[13];
varying vec3 vWPos;
vec3 surfTri(float layer, vec3 p, vec3 w) {
  int li = int(layer + 0.5);
  float s = 1.0 / uScale[li];
  vec3 a = texture(uSurf, vec3(p.zy * s, layer)).rgb;
  vec3 b = texture(uSurf, vec3(p.xz * s, layer)).rgb;
  vec3 c = texture(uSurf, vec3(p.xy * s, layer)).rgb;
  return a * w.x + b * w.y + c * w.z;
}
vec3 surfTop(float layer, vec3 p) {
  int li = int(layer + 0.5);
  return texture(uSurf, vec3(p.xz / uScale[li], layer)).rgb;
}
vec3 surfMul(vec3 t, float layer) {
  int li = int(layer + 0.5);
  return mix(vec3(1.0), t * 2.0, uStrength[li] * uSurfOn);
}
`;
function worldPosVertex(extra = '') {
  return /* glsl */ `
  #include <begin_vertex>
  {
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    vWPos = (modelMatrix * wp).xyz;
  }
  ${extra}
  `;
}
const uniforms = () => ({
  uSurf: { value: surfaceTextures() },
  uSurfOn: SURF_ON,
  uScale: { value: SURF_SCALE },
  uStrength: { value: SURF_STRENGTH },
});
export const SURF_ON = { value: 1 };
export function setSurfaceDetail(on) { SURF_ON.value = on ? 1 : 0; }

// décor, bâtiments, lieux : une couche par sommet (attribut aSurf, -1 = sans texture)
export function texturizeProps(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms());
    sh.vertexShader = 'attribute float aSurf;\nvarying float vSurf;\nvarying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', worldPosVertex('vSurf = aSurf;'));
    sh.fragmentShader = GLSL_COMMON + 'varying float vSurf;\n' + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      if (vSurf > 7.5 && vSurf < 8.5) {
        diffuseColor.rgb *= surfMul(surfTop(vSurf, vWPos), vSurf);
      } else if (vSurf > -0.5) {
        vec3 fn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
        vec3 w = pow(abs(fn), vec3(4.0)); w /= (w.x + w.y + w.z);
        diffuseColor.rgb *= surfMul(surfTri(vSurf, vWPos, w), vSurf);
      }
    `);
  };
  mat.customProgramCacheKey = () => 'surf-props-leaf-top';
  return mat;
}

// terrain : mélange herbe / terre / roche / sable / neige / pavés selon l'attribut aMix (+ aCob)
export function texturizeTerrain(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms());
    sh.vertexShader = 'attribute vec4 aMix;\nattribute float aCob;\nvarying vec4 vMix;\nvarying float vCob;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', worldPosVertex('vMix = aMix; vCob = aCob; vWNrm = normalize(mat3(modelMatrix) * objectNormal);'));
    sh.fragmentShader = GLSL_COMMON + 'varying vec4 vMix;\nvarying float vCob;\nvarying vec3 vWNrm;\n' + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      {
        vec3 p = vWPos;
        float rockW = vMix.x, dirtW = vMix.y * (1.0 - rockW), sandW = vMix.z * (1.0 - rockW), snowW = vMix.w * (1.0 - rockW), cobW = vCob;
        float grassW = max(0.0, 1.0 - rockW - dirtW - sandW - snowW - cobW);
        vec3 t = vec3(0.0); float tw = 0.0;
        if (grassW > 0.01) { t += surfMul(surfTop(0.0, p), 0.0) * grassW; tw += grassW; }
        if (dirtW > 0.01) { t += surfMul(surfTop(1.0, p), 1.0) * dirtW; tw += dirtW; }
        if (sandW > 0.01) { t += surfMul(surfTop(3.0, p), 3.0) * sandW; tw += sandW; }
        if (snowW > 0.01) { t += surfMul(surfTop(4.0, p), 4.0) * snowW; tw += snowW; }
        if (cobW > 0.01) { t += surfMul(surfTop(12.0, p), 12.0) * cobW; tw += cobW; }
        if (rockW > 0.01) {
          vec3 n = normalize(vWNrm);
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          t += surfMul(surfTri(2.0, p, w), 2.0) * rockW; tw += rockW;
        }
        // grande variation lente pour casser la répétition
        float big = texture(uSurf, vec3(p.xz / 61.0, 1.0)).r * 2.0;
        diffuseColor.rgb *= (t / max(tw, 0.001)) * mix(1.0, 0.82 + 0.18 * big, uSurfOn);
      }
    `);
  };
  mat.customProgramCacheKey = () => 'surf-terrain';
  return mat;
}
