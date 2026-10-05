// Ciel dégradé, soleil/lune, étoiles, nuages en blocs et cycle jour/nuit synchronisé sur l'horloge réelle.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { mulberry32 } from '../core/rng.js';

export const DAY_SECONDS = 24 * 60; // une journée d'Orvalis = 24 minutes réelles

const KEYS = [
  // t, skyTop, horizon, fog, sunColor, sunInt, hemiSky, hemiGround, hemiInt
  [0.0, '#0a1230', '#1a2849', '#1b2744', '#9fb4ff', 0.5, '#4a5f90', '#23232e', 0.78],
  [0.2, '#0f1a3d', '#2a3358', '#28304f', '#a8b8ff', 0.5, '#4a5c8c', '#23232e', 0.78],
  [0.26, '#3a5a9a', '#f0a070', '#d49a7e', '#ffb070', 1.0, '#9fb3d8', '#4a3e30', 0.75],
  [0.33, '#2f7fe0', '#bfe3ff', '#bfe0f8', '#fff0cc', 1.9, '#d8ecff', '#7c9a4a', 1.0],
  [0.5, '#2a78e0', '#c4e6ff', '#c2e2fa', '#fff4d8', 2.1, '#dcefff', '#84a24e', 1.05],
  [0.68, '#3478dc', '#c0e0f8', '#c4def2', '#ffe6b8', 1.85, '#d4e8ff', '#7c9448', 1.0],
  [0.75, '#2a3a78', '#ff8a5a', '#c47e70', '#ff8a50', 0.95, '#8f98c8', '#4a3a30', 0.75],
  [0.8, '#101a40', '#34365e', '#2c3050', '#a8b8ff', 0.5, '#4a5c8c', '#23232e', 0.78],
  [1.0, '#0a1230', '#1a2849', '#1b2744', '#9fb4ff', 0.5, '#4a5f90', '#23232e', 0.78],
].map((k) => ({
  t: k[0], top: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), fog: new THREE.Color(k[3]),
  sun: new THREE.Color(k[4]), sunI: k[5], hs: new THREE.Color(k[6]), hg: new THREE.Color(k[7]), hI: k[8],
}));

// Teinte d'ambiance par biome : [couleur de brume, force, densité (distance de brume)]
const BIOME_ATMO = {
  meadow: ['#bcd8f0', 0.0, 1.0],
  badlands: ['#e8c090', 0.28, 1.0],
  forest: ['#9fc4a0', 0.25, 0.85],
  canyon: ['#c09080', 0.3, 0.95],
  swamp: ['#8a9a70', 0.5, 0.6],
  ruins: ['#b8b0c8', 0.22, 0.95],
  snow: ['#dfe8f2', 0.45, 0.8],
  volcanic: ['#8a5a4a', 0.55, 0.7],
  storm: ['#7a8698', 0.5, 0.75],
};

// Ambiances intérieures (donjons, raids, Abîme) : ciel sombre, brume serrée, lumière de torche autour du groupe
const INDOOR = {
  mine: { top: '#140d08', hor: '#2a1a10', fog: '#1e140c', near: 22, far: 120, sun: '#ffb070', sunI: 0.6, hs: '#8a6a50', hg: '#2a1e16', hI: 0.8, torch: '#ffb070', torchI: 2.6 },
  swamp: { top: '#0a120c', hor: '#18261a', fog: '#1a2a1c', near: 18, far: 105, sun: '#a8d8a0', sunI: 0.55, hs: '#6a8a70', hg: '#1e261e', hI: 0.8, torch: '#c8ffb0', torchI: 2.2 },
  crypt: { top: '#0a0a14', hor: '#1a1628', fog: '#15121f', near: 18, far: 105, sun: '#b0a8ff', sunI: 0.55, hs: '#7a70a0', hg: '#1e1a26', hI: 0.78, torch: '#c8b8ff', torchI: 2.4 },
  ice: { top: '#0e1a2a', hor: '#3a5a78', fog: '#4a6a88', near: 26, far: 135, sun: '#dff0ff', sunI: 0.85, hs: '#b0d0f0', hg: '#3a4a5a', hI: 0.9, torch: '#dff0ff', torchI: 1.6 },
  fire: { top: '#1a0806', hor: '#3a120a', fog: '#2a0e08', near: 20, far: 115, sun: '#ff8a4a', sunI: 0.75, hs: '#a05a3a', hg: '#2a1410', hI: 0.8, torch: '#ff9a50', torchI: 2.2 },
  sky: { top: '#1a2a5a', hor: '#7a8ac0', fog: '#8090b8', near: 70, far: 320, sun: '#fff0d8', sunI: 1.45, hs: '#cfe0ff', hg: '#5a5a70', hI: 0.95, torch: '#ffffff', torchI: 0, stars: 0.35 },
  abyss: { top: '#05030a', hor: '#1a0a14', fog: '#140810', near: 16, far: 100, sun: '#ff6040', sunI: 0.55, hs: '#6a3a4a', hg: '#1a0e12', hI: 0.75, torch: '#ff8a6a', torchI: 2.4 },
  void: { top: '#06040e', hor: '#1c1030', fog: '#150c24', near: 18, far: 110, sun: '#c0a0ff', sunI: 0.6, hs: '#6a5a9a', hg: '#1a1426', hI: 0.78, torch: '#d0c0ff', torchI: 2.4, stars: 0.6 },
};
for (const k in INDOOR) { const t = INDOOR[k]; for (const c of ['top', 'hor', 'fog', 'sun', 'hs', 'hg', 'torch']) t[c] = new THREE.Color(t[c]); }

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      night: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(hor, top, pow(smoothstep(-0.05, 0.75, h), 0.75));
          float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunCol * (pow(sd, 350.0) * 1.4 + pow(sd, 12.0) * 0.18) * (1.0 - night*0.6);
          vec3 md = -normalize(sunDir);
          float mdd = max(dot(normalize(vDir), md), 0.0);
          c += vec3(0.85,0.9,1.0) * pow(mdd, 900.0) * 1.2 * night;
          if (vDir.y < -0.02) c = mix(c, hor*0.8, smoothstep(-0.02, -0.2, vDir.y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // étoiles
    const rnd = mulberry32(99);
    const sp = [];
    for (let i = 0; i < 1400; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(th) * r * 850, y * 850, Math.sin(th) * r * 850);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // Nuages alpha, regroupés en une seule silhouette douce par couche.
    this.clouds = new THREE.Group();
    const cloudCanvas=document.createElement('canvas');cloudCanvas.width=256;cloudCanvas.height=128;
    const ctx=cloudCanvas.getContext('2d');
    for(let i=0;i<30;i++){const x=40+rnd()*176,y=45+rnd()*40,r=18+rnd()*28;const grad=ctx.createRadialGradient(x,y,1,x,y,r);grad.addColorStop(0,'rgba(255,255,255,.6)');grad.addColorStop(.5,'rgba(245,247,250,.38)');grad.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,2*r,2*r);}
    const cloudMap=new THREE.CanvasTexture(cloudCanvas);cloudMap.colorSpace=THREE.SRGBColorSpace;
    const cmat=new THREE.MeshLambertMaterial({map:cloudMap,color:0xffffff,emissive:0x647080,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide,fog:false});this.cloudMat=cmat;
    const cloudPlane=new THREE.PlaneGeometry(1,1);cloudPlane.rotateX(-Math.PI/2);
    for(let i=0;i<38;i++){const cl=new THREE.Mesh(cloudPlane,cmat);cl.scale.set(110+rnd()*100,1,55+rnd()*60);cl.position.set((rnd()-.5)*1300,130+rnd()*65,(rnd()-.5)*1300);cl.userData.speed=1.5+rnd()*2.5;this.clouds.add(cl);}
    scene.add(this.clouds);

    // lumières
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(100, 200, 50);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // lumière de torche qui accompagne le joueur dans les donjons (toujours présente : pas de recompilation)
    this.torch = new THREE.PointLight(0xffc890, 0, 24, 1.5);
    scene.add(this.torch);
    this.indoor = null;

    this.fog = new THREE.Fog(0xb8d4ea, 90, 420);
    scene.fog = this.fog;
    this.t = 0.4;
    this.night = 0;
    this.atmo = { col: new THREE.Color('#bcd8f0'), f: 0, d: 1 };
    this.atmoTarget = { col: new THREE.Color('#bcd8f0'), f: 0, d: 1 };
    this.viewDist = 420;
    this.flash = 0;
    this._c = new THREE.Color();
  }

  static timeOfDay(now = Date.now()) {
    return ((now / 1000) / DAY_SECONDS + 0.35) % 1;
  }

  setIndoor(theme) { this.indoor = theme ? INDOOR[theme] || INDOOR.crypt : null; }

  setBiome(biome) {
    const a = BIOME_ATMO[biome] || BIOME_ATMO.meadow;
    this.atmoTarget.col.set(a[0]);
    this.atmoTarget.f = a[1];
    this.atmoTarget.d = a[2];
  }

  update(dt, focus, camera) {
    const t = this.t;
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].t <= t) k++;
    const A = KEYS[k], B = KEYS[k + 1];
    const f = clamp((t - A.t) / (B.t - A.t), 0, 1);

    // lissage de l'ambiance de région
    const s = 1 - Math.exp(-dt * 0.8);
    this.atmo.col.lerp(this.atmoTarget.col, s);
    this.atmo.f = lerp(this.atmo.f, this.atmoTarget.f, s);
    this.atmo.d = lerp(this.atmo.d, this.atmoTarget.d, s);

    const U = this.uniforms;
    U.top.value.copy(A.top).lerp(B.top, f);
    U.hor.value.copy(A.hor).lerp(B.hor, f);
    const fogC = this._c.copy(A.fog).lerp(B.fog, f);
    const dayness = smoothstep(0.2, 0.3, t) * (1 - smoothstep(0.72, 0.8, t));
    const af = this.atmo.f * (0.35 + 0.65 * dayness);
    fogC.lerp(this.atmo.col, af);
    U.hor.value.lerp(this.atmo.col, af * 0.8);
    this.fog.color.copy(fogC);
    this.fog.near = 60 * this.atmo.d;
    this.fog.far = this.viewDist * this.atmo.d;

    // soleil
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(elev, -0.3), 0.45).normalize();
    U.sunDir.value.copy(sunDir);
    U.sunCol.value.copy(A.sun).lerp(B.sun, f);
    this.night = 1 - smoothstep(-0.12, 0.12, elev);
    U.night.value = this.night;

    // la lumière directionnelle suit la lune la nuit
    const ld = elev > -0.05 ? sunDir : new THREE.Vector3(-sunDir.x, -sunDir.y * 0.8 + 0.5, sunDir.z).normalize();
    this.sun.color.copy(A.sun).lerp(B.sun, f);
    this.sun.intensity = lerp(A.sunI, B.sunI, f) + this.flash * 2.5;
    this.hemi.color.copy(A.hs).lerp(B.hs, f);
    this.hemi.groundColor.copy(A.hg).lerp(B.hg, f);
    this.hemi.intensity = lerp(A.hI, B.hI, f) + this.flash * 0.8;
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(ld, 160);
      this.dome.position.copy(camera.position);
      this.stars.position.copy(camera.position);
    }
    this.starMat.opacity = this.night * 0.9;
    this.cloudMat.color.copy(fogC).lerp(new THREE.Color(1, 1, 1), 0.6 * (1 - this.night * 0.8));
    this.cloudMat.emissive.copy(fogC).multiplyScalar(0.55 + 0.2 * (1 - this.night));
    for (const cl of this.clouds.children) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x > 700) cl.position.x -= 1400;
    }
    // intérieur : on remplace ciel, brume et lumières
    const I = this.indoor;
    this.clouds.position.set(camera.position.x,0,camera.position.z);
    this.clouds.visible = !I;
    if (I) {
      U.top.value.copy(I.top); U.hor.value.copy(I.hor);
      this.fog.color.copy(I.fog); this.fog.near = I.near; this.fog.far = I.far;
      this.sun.color.copy(I.sun); this.sun.intensity = I.sunI + this.flash * 2;
      this.hemi.color.copy(I.hs); this.hemi.groundColor.copy(I.hg); this.hemi.intensity = I.hI + this.flash * 0.6;
      this.starMat.opacity = I.stars || 0;
      U.night.value = 1;
      U.sunCol.value.setRGB(0, 0, 0);
      this.torch.color.copy(I.torch);
      this.torch.intensity = I.torchI;
      if (focus) this.torch.position.set(focus.x, focus.y + 3.4, focus.z);
    } else this.torch.intensity = 0;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
  }
}
