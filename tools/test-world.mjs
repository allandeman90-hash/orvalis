import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/data/expeditions.js';
import { WORLD_HALF, HUBS, LANDMARKS, ZONES } from '../src/data/zones.js';
import { migratePosition, worldAtPoint, isInstancePoint } from '../src/data/world-space.js';
import { initTerrainData, getHeight, canWalk, roadChains, zoneAt } from '../src/world/terrain.js';
assert.equal(WORLD_HALF,2048);
for(const p of [{x:-408,z:18},{x:400,z:-18},{x:0,z:0}]){const d={pos:{...p}};migratePosition(d);assert.deepEqual(d.pos,{x:p.x*4,z:p.z*4});migratePosition(d);assert.deepEqual(d.pos,{x:p.x*4,z:p.z*4});}
for(const p of [{x:3000,z:0},{x:Infinity,z:0},{x:6000,z:0}]){const d={pos:p};migratePosition(d);assert.equal(d.pos,null);}
assert.equal(worldAtPoint(1900,100),'orvalis');assert.equal(worldAtPoint(6000,10),'instance');
initTerrainData();
const report={worldSide:WORLD_HALF*2,regions:ZONES.length,hubs:HUBS.length,landmarks:LANDMARKS.length,roads:[],migrations:'passed',badRegions:[],blockedRoads:[]};
for(const p of [...HUBS,...LANDMARKS]){assert(!isInstancePoint(p.x,p.z));if(zoneAt(p.x,p.z).id!==p.zone)report.badRegions.push(p.id);assert(Number.isFinite(getHeight(p.x,p.z)));}
for(const [index,chain] of roadChains.entries()){
 let length=0,blocked=0,wet=0;
 for(let i=1;i<chain.length;i++){
  const a=chain[i-1],b=chain[i],d=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(d/2);length+=d;
  let prev=a;for(let k=1;k<=n;k++){const p={x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n};if(!canWalk(prev.x,prev.z,p.x,p.z)||!canWalk(p.x,p.z,prev.x,prev.z))blocked++;if(getHeight(p.x,p.z)<-1.2)wet++;prev=p;}
 }
 report.roads.push({index,metres:Math.round(length),blocked,wet});if(blocked)report.blockedRoads.push(index);
}
fs.mkdirSync(new URL('../validation/world/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../validation/world/results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
assert.equal(report.badRegions.length,0,'places in wrong regions');assert.equal(report.blockedRoads.length,0,'roads blocked by terrain');
