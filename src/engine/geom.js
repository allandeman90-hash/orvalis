// Outils de géométrie low-poly : primitives colorées fusionnées en un seul maillage (couleurs par sommet).
import * as THREE from 'three';
import { texturizeProps } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// Surface peinte (texture) déduite de la forme et de la couleur : pierre, bois, tuiles, feuillage…
// (indices de src/engine/textures.js ; -1 = pas de texture)
const _hsl = { h: 0, s: 0, l: 0 };
export function guessSurf(color, kind) {
  if (color === null || color === undefined) return -1;
  _c.set(color).getHSL(_hsl, THREE.SRGBColorSpace);
  const h = _hsl.h * 360, s = _hsl.s, l = _hsl.l;
  if (kind === 'roof') return 7; // tuiles
  const green = h > 65 && h < 170 && s > 0.2 && l < 0.7;
  const brown = h >= 12 && h <= 48 && s > 0.3 && l < 0.55;
  const neutral = s < 0.22;
  if (green) return kind === 'box' ? 11 : 8; // feuillage (tissu vert si boîte)
  if (brown) return kind === 'cyl' ? 9 : 6; // écorce ou planches
  if (neutral && l > 0.86) return 10; // enduit très clair
  if (neutral || (s < 0.35 && l < 0.62)) return kind === 'dodeca' || kind === 'ico' ? 2 : 5; // roche ou pierre taillée
  if (l > 0.86) return 10;
  return 11; // tissu / peinture
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.nor = [];
    this.uv = [];
    this.surf = [];
    this._kind = 'box';
    this.surfOverride = null; // forcer une surface (ex. 'none' pour un élément lisse)
  }
  // ajoute une géométrie (indexée ou non) transformée et colorée
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, colorFn = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const a = g.attributes.position;
    if(!g.attributes.normal) g.computeVertexNormals();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    const sf = this.surfOverride !== null ? this.surfOverride : guessSurf(color, this._kind);
    this._kind = 'box';
    if (color !== null && color !== undefined) _c.set(color);
    const v = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3().getNormalMatrix(_m);
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(_m);
      this.pos.push(v.x, v.y, v.z);
      normal.fromBufferAttribute(g.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
      this.nor.push(normal.x,normal.y,normal.z);
      // Real UVs for equipment using the same material atlas as the actor.
      // Buildings use world projection and ignore this attribute.
      const tile=this.atlasTile ?? 4,u=g.attributes.uv?.getX(i)??v.x,w=g.attributes.uv?.getY(i)??v.y;
      this.uv.push((tile%4+.035+((u%1+1)%1)*.93)/4,(Math.floor(tile/4)+.035+((w%1+1)%1)*.93)/2);
      if (colorFn) {
        const cc = colorFn(v, i);
        _c.set(cc);
      }
      this.col.push(_c.r, _c.g, _c.b);
      this.surf.push(sf);
    }
    if (g !== geo) g.dispose();
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
  // boîte posée au sol (y = base)
  block(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
    return this.add(BOX, color, x, y + h / 2, z, 0, ry, 0, w, h, d);
  }
  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this._kind = 'cyl';
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.add(g, color, x, y, z, rx, ry, rz);
    g.dispose();
    return this;
  }
  cone(r, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this._kind = 'cone';
    const g = new THREE.ConeGeometry(r, h, seg);
    this.add(g, color, x, y, z, rx, ry, rz);
    g.dispose();
    return this;
  }
  ico(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 0) { this._kind = 'ico';
    const g = new THREE.IcosahedronGeometry(r, detail);
    this.add(g, color, x, y, z, 0, 0, 0, sx, sy, sz);
    g.dispose();
    return this;
  }
  dodeca(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) { this._kind = 'dodeca';
    const g = new THREE.DodecahedronGeometry(r, 0);
    this.add(g, color, x, y, z, 0, ry, 0, sx, sy, sz);
    g.dispose();
    return this;
  }
  octa(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { this._kind = 'octa';
    const g = new THREE.OctahedronGeometry(r, 0);
    this.add(g, color, x, y, z, rx, 0, rz, sx, sy, sz);
    g.dispose();
    return this;
  }
  // prisme triangulaire (toit à deux pans) : largeur w (x), hauteur h, profondeur d (z)
  roof(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
    this._kind = 'roof';
    const g = ROOF;
    return this.add(g, color, x, y, z, 0, ry, 0, w, h, d);
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surf, 1));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
  get empty() {
    return this.pos.length === 0;
  }
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);
// Prisme de toit unitaire : base 1x1 en y=0, faîte à y=1
export const ROOF = (() => {
  const g = new THREE.BufferGeometry();
  const v = [
    // pignon avant (z=+0.5)
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    // pignon arrière
    0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    // pan gauche
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    // pan droit
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    // dessous
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

// Matériaux partagés
let _vcMat = null, _vcBasic = null;
export function vcMaterial() {
  if (!_vcMat) _vcMat = texturizeProps(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false }));
  return _vcMat;
}
export function vcGlowMaterial() {
  if (!_vcBasic) _vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
  return _vcBasic;
}

const matCache = new Map();
export function lambert(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}
const basicCache = new Map();
export function basic(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...opts });
    basicCache.set(key, m);
  }
  return m;
}
