import * as THREE from 'three';
import { WORLD_HALF, isInstancePoint } from '../data/world-space.js';
import { getHeight, getSlope, groundColor, groundMix } from './terrain.js';

export const SECTOR_SIZE = 128;
const COUNT = WORLD_HALF * 2 / SECTOR_SIZE;
// Les données de collision restent indépendantes du niveau de détail graphique.
// Des jupes masquent les jonctions entre les grilles de 4, 8 et 32 mètres.
export class TerrainSectors extends THREE.Group {
  constructor(material) {
    super(); this.name = 'terrain'; this.material = material; this.loaded = new Map();
    this.far = new THREE.Group(); this.add(this.far);
    for (let z = 0; z < COUNT; z++) for (let x = 0; x < COUNT; x++) this.far.add(this.make(x, z, 32));
    this.stats = { resident: 0, pending: 0, generated: 0 };
  }
  make(ix, iz, step) {
    const n = SECTOR_SIZE / step, side = n + 1, positions = [], normals = [], colors = [], mixes = [], cobble = [], indices = [];
    const color = new THREE.Color(), mix = [];
    const x0 = -WORLD_HALF + ix * SECTOR_SIZE, z0 = -WORLD_HALF + iz * SECTOR_SIZE;
    const add = (x, z, skirt = 0) => {
      const h = getHeight(x,z), e = 4;
      const dx = (getHeight(x+e,z)-getHeight(x-e,z))/(2*e), dz = (getHeight(x,z+e)-getHeight(x,z-e))/(2*e);
      const normal = new THREE.Vector3(-dx,1,-dz).normalize();
      groundColor(x,z,h,Math.hypot(dx,dz),color); groundMix(x,z,h,Math.hypot(dx,dz),mix);
      positions.push(x,h-skirt,z); normals.push(normal.x,normal.y,normal.z); colors.push(color.r,color.g,color.b); mixes.push(...mix.slice(0,4)); cobble.push(mix[4]);
      return positions.length / 3 - 1;
    };
    for(let z=0;z<=n;z++) for(let x=0;x<=n;x++) add(x0+x*step,z0+z*step);
    for(let z=0;z<n;z++) for(let x=0;x<n;x++){const a=z*side+x; indices.push(a,a+side+1,a+1,a,a+side,a+side+1);}
    const edge = [];
    for(let i=0;i<=n;i++) edge.push(i);
    for(let i=1;i<=n;i++) edge.push(i*side+n);
    for(let i=n-1;i>=0;i--) edge.push(n*side+i);
    for(let i=n-1;i>0;i--) edge.push(i*side);
    const bottom = edge.map(i=>add(positions[i*3],positions[i*3+2],step === 32 ? 14 : 5));
    for(let i=0;i<edge.length;i++){ const j=(i+1)%edge.length; indices.push(edge[i],bottom[i],edge[j],edge[j],bottom[i],bottom[j]); }
    const g=new THREE.BufferGeometry();
    for(const [name,values,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['aMix',mixes,4],['aCob',cobble,1]]) g.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    g.setIndex(indices); g.computeBoundingSphere();
    const m=new THREE.Mesh(g,this.material); m.receiveShadow=true; m.matrixAutoUpdate=false; m.name=`sector_${ix}_${iz}_${step}`; return m;
  }
  update(position, viewDistance, speed = 0) {
    this.visible = !isInstancePoint(position.x, position.z); if (!this.visible) return;
    const radius = viewDistance + Math.max(128, speed * 2), pending=[];
    for(let z=0;z<COUNT;z++) for(let x=0;x<COUNT;x++) {
      const key=z*COUNT+x, distance=Math.hypot(-WORLD_HALF+(x+.5)*128-position.x,-WORLD_HALF+(z+.5)*128-position.z);
      const step=distance < 230 ? 4 : 8, old=this.loaded.get(key);
      if(distance>radius+150) { if(old){this.remove(old.mesh);old.mesh.geometry.dispose();this.loaded.delete(key);} }
      else if(distance<radius && (!old || old.step!==step)) pending.push({key,x,z,step,distance});
      this.far.children[key].visible=!this.loaded.has(key);
    }
    pending.sort((a,b)=>a.distance-b.distance);
    const start=performance.now(); let created=0;
    for(const p of pending) {
      // Au moins un secteur par frame, travail distant annulé après téléportation.
      if(created && performance.now()-start>5) break;
      const mesh=this.make(p.x,p.z,p.step),old=this.loaded.get(p.key);
      if(old){this.remove(old.mesh);old.mesh.geometry.dispose();}
      this.add(mesh);this.loaded.set(p.key,{step:p.step,mesh});this.far.children[p.key].visible=false;created++;
    }
    this.stats={resident:this.loaded.size,pending:pending.length-created,generated:this.stats.generated+created};
  }
}
