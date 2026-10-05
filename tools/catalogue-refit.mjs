import {chromium} from './browser.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=new URL('../validation/catalogue/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage();await page.goto(new URL('../dist/test.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
const shots=await page.evaluate(()=>{
 const G=__dbg.G,r=new G.renderer.constructor({antialias:true,preserveDrawingBuffer:true});r.setSize(320,320);r.setPixelRatio(1);
 const camera=new G.camera.constructor(34,1,.1,100);camera.position.set(0,2.55,9);camera.lookAt(0,1.8,0);
 const out=[];
 for(const [id,def]of Object.entries(__mobs)){
  const m=__art.createModel(def.model);if(def.model.weapon)m.setWeapon(def.model.weapon,def.model.weaponColors);if(def.model.offhand)m.setOffhand(def.model.offhand,def.model.offhandColors);
  G.stage.setHero(m);m.root.scale.setScalar(2.15/(m.height/(def.model.scale||1)));m.root.rotation.y=.30;m.update(.01,0);
  r.render(G.stage.scene,camera);out.push({id,name:def.name,rig:def.model.rig,image:r.domElement.toDataURL('image/png'),...m.root.userData.art});
 }
 G.stage.setHero(null);r.dispose();return out;
});
for(const shot of shots)fs.writeFileSync(new URL(shot.id+'.png',out),Buffer.from(shot.image.split(',')[1],'base64'));
fs.writeFileSync(new URL('manifest.json',out),JSON.stringify(shots.map(({image,...s})=>s),null,2));
for(let k=0;k<Math.ceil(shots.length/20);k++){
 const cards=shots.slice(k*20,k*20+20).map(s=>`<figure><img src="${s.id}.png"><figcaption>${s.name}<small>${s.id} · ${s.rig} · ${s.triangles} triangles</small></figcaption></figure>`).join('');
 const html=`<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#141923;color:#e3d7bb;font:16px system-ui}main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;background:#202a36}img{width:100%}figcaption{padding:8px;font-weight:600}small{display:block;font-size:11px;font-weight:400;color:#adbdc8}</style><h1>Orvalis — catalogue original ${k+1}</h1><main>${cards}</main>`;
 fs.writeFileSync(new URL('planche-'+(k+1)+'.html',out),html);
 await page.setViewportSize({width:1500,height:1540});await page.goto(new URL('planche-'+(k+1)+'.html',out).href);await page.screenshot({path:fileURLToPath(new URL('planche-'+(k+1)+'.png',out)),fullPage:true});
}
await browser.close();console.log('Catalogue:',shots.length);
