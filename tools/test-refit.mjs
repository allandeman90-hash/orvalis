import { chromium } from './browser.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'validation','refit');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::'))errors.push(m.text());});
await page.goto(new URL('../dist/test.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
const result={build:await page.evaluate(()=>window.__build)};
result.catalogue=await page.evaluate(()=>{
 const checks=[];for(const [id,def]of Object.entries(window.__mobs)){
  const a=__art.createModel(def.model),b=__art.createModel(def.model);const before=JSON.stringify(b.parts.body.rotation.toArray());let mesh; a.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
  if(!mesh||!mesh.geometry.attributes.uv)throw Error(id+' missing skin/UV');
  for(const action of ['attack','attack2','cast','hit','slam','roar']){a.play(action);for(let i=0;i<12;i++)a.update(1/30,5);}
  a.die();a.update(.3);a.revive();a.setStealth(.2);a.setStealth(1);a.root.updateMatrixWorld(true);
  if(mesh.skeleton.bones.some(b=>b.matrixWorld.elements.some(v=>!Number.isFinite(v))))throw Error(id+' invalid pose');
  if(JSON.stringify(b.parts.body.rotation.toArray())!==before)throw Error(id+' shared pose');checks.push({id,rig:def.model.rig,...a.root.userData.art});a.dispose();b.dispose();
 }return checks;
});console.log('catalogue',result.catalogue.length);
await page.evaluate(()=>{__dbg.quick('guerrier',0,30);__dbg.G.player.god=true;__dbg.G.flags.fixedTime=.42;__dbg.G.settings.autoPerf=false;document.getElementById('announce').innerHTML='';});
result.regions=[];
for(const id of ['val','terres','bois','canyon','marais','coeur','pics','desolation','cime']){
 const r=await page.evaluate(id=>{
  const z=__zones.ZONE_BY_ID[id],h=__zones.HUBS.find(h=>h.zone===id&&h.type!=='sanctuary');__dbg.tp(h.x,h.z+85);const G=__dbg.G;G.cam.yaw=.7;G.cam.pitch=.3;G.cam.dist=G.cam.targetDist=12;G.cam.first=true;
  return {id,position:[h.x,h.z+85],zone:__terrain.zoneAt(h.x,h.z+85).id,spawns:G.world.spawns.filter(s=>s.zone===id).length};
 },id);await page.waitForTimeout(3000);await page.screenshot({path:path.join(out,id+'.png')});result.regions.push(r);console.log('region',id,r.spawns);
}
result.instances=[];
for(const id of ['meche','englouti','catacombes','givre','creuset','tempetes','cendre','abime']){
 try{
  const entry=await page.evaluate(id=>{if(__dbg.G.inst.active)__dbg.G.inst.leave();__dbg.G.player.combatT=99;const key=__dbg.inst(id,{fill:false});if(!key)throw Error('instance entry failed '+id);return {key,position:__dbg.G.player.pos.toArray(),zone:__terrain.zoneAt(__dbg.G.player.pos.x,__dbg.G.player.pos.z).id};},id);
  await page.waitForTimeout(1400);await page.screenshot({path:path.join(out,'instance_'+id+'.png')});result.instances.push({id,...entry});console.log('instance',id,entry.key);
 }catch(e){errors.push(id+': '+e.message);}
}
await page.evaluate(()=>{if(__dbg.G.inst.active)__dbg.G.inst.leave();});
const glb=await page.evaluate(async()=>{
 const buf=await __art.exportModel(__mobs.loup_pres.model),gltf=await __art.loadModel(buf);let bones=0;gltf.scene.traverse(o=>{if(o.isBone)bones++;});if(!bones||gltf.animations.length<6)throw Error('GLB roundtrip failed');return {bytes:[...new Uint8Array(buf)],bones,clips:gltf.animations.map(a=>a.name)};
});fs.mkdirSync(path.join(root,'assets','models'),{recursive:true});fs.writeFileSync(path.join(root,'assets','models','wolf-original.glb'),Buffer.from(glb.bytes));result.glb={bytes:glb.bytes.length,bones:glb.bones,clips:glb.clips};
await page.setViewportSize({width:900,height:800});await page.screenshot({path:path.join(out,'narrow.png')});
result.errors=[...new Set(errors)];fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));await browser.close();if(errors.length){console.error(result.errors.slice(0,8));process.exitCode=1;}
