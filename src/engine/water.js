import { WORLD_HALF, WORLD_SCALE } from '../data/world-space.js';
// Plan d'eau unique : couleur selon la région (mer, marais vaseux, lave dans la Désolation).
import * as THREE from 'three';

export function createWater() {
  const uniforms = {
    time: { value: 0 },
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
    night: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vW; varying float vFogDepth;
      uniform float time;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float time; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float night;
      varying vec3 vW; varying float vFogDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float w1 = vnoise(p*0.15 + vec2(time*0.35, time*0.21));
        float w2 = vnoise(p*0.4 - vec2(time*0.5, -time*0.3));
        float wave = w1*0.6 + w2*0.4;
        vec3 col; float alpha = 0.82;
        bool volcanic = p.x > 680.0 && p.y < -680.0;
        bool swamp = abs(p.x) < 680.0 && p.y > 680.0;
        bool snow = p.x < -680.0 && p.y < -680.0;
        if (volcanic) {
          float n = vnoise(p*0.25 + vec2(time*0.12, time*0.08)) * 0.7 + vnoise(p*0.9 - time*0.2)*0.3;
          col = mix(vec3(0.55,0.08,0.02), vec3(1.0,0.55,0.08), smoothstep(0.35, 0.85, n));
          col += vec3(1.0,0.8,0.3) * smoothstep(0.8, 0.95, n) * 0.6;
          alpha = 1.0;
        } else if (swamp) {
          col = mix(vec3(0.19,0.23,0.11), vec3(0.28,0.31,0.15), wave);
          alpha = 0.9;
        } else if (snow) {
          col = mix(vec3(0.35,0.5,0.62), vec3(0.6,0.75,0.85), wave);
        } else {
          col = mix(vec3(0.10,0.34,0.56), vec3(0.20,0.52,0.72), wave);
          col += vec3(0.9,0.95,1.0) * smoothstep(0.78, 0.92, w2) * 0.25;
        }
        if (!volcanic) col *= mix(1.0, 0.45, night);
        col = pow(col, vec3(2.2));
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        col = mix(col, fogColor, fogF);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(WORLD_HALF * 2 + 200, WORLD_HALF * 2 + 200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.04;
  mesh.renderOrder = 2;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
