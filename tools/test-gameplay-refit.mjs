import { chromium } from './browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=new URL('../validation/gameplay/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],result={};
page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::'))errors.push(m.text());});
const shot=async name=>page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});
try{
 await page.goto(new URL('../dist/test.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
 result.build=await page.evaluate(()=>window.__build);
 await page.locator('#tl-acct').fill('Validation');await page.locator('#tl-go').click();
 await page.waitForTimeout(1000);if(await page.locator('#cc-name').count()===0)await page.locator('#tt-new').click();
 await page.locator('#cc-name').fill('Arpenteur');await shot('creation');await page.locator('#cc-go').click();
 await page.waitForFunction(()=>__dbg.G.mode==='game');
 result.creation=await page.evaluate(()=>({name:__dbg.G.player.name,worldId:__dbg.G.player.worldId,pos:__dbg.G.player.pos.toArray(),version:__dbg.G.player.data.worldVersion}));assert.equal(result.creation.name,'Arpenteur');assert.equal(result.creation.worldId,'orvalis');
 result.movement=await page.evaluate(()=>{const G=__dbg.G,P=G.player,start=P.pos.clone();for(let i=0;i<90;i++)P.moveTowards(start.x+10,start.z+12,1/30);return P.pos.distanceTo(start);});assert(result.movement>1);
 result.classes=[];
 for(const cls of ['guerrier','templier','mage','necro','archer','assassin','druide','chaman']){
  result.classes.push(await page.evaluate(cls=>{__dbg.quick(cls,0,20);const P=__dbg.G.player;P.god=true;P.model.update(.16,5);let skin;P.model.root.traverse(o=>{if(o.isSkinnedMesh)skin=o;});if(!skin)throw Error(cls+' no skin');return{cls,bones:skin.skeleton.bones.length,triangles:skin.geometry.index.count/3,weapon:!!P.model.weapon,offhand:!!P.model.offhand};},cls));
 }
 result.forms=await page.evaluate(()=>{__dbg.quick('druide',0,20,'sp_gardien');const P=__dbg.G.player;P.useSkillById('d_ours');const bear=P.formKind;P.setSpec('sp_sauvage');P.cds={};P.useSkillById('d_felin');const cat=P.formKind;P.setPoly(true);const poly=!!P.polyModel;P.polyModel.update(.1,5);P.setPoly(false);P.setForm(null);return{bear,cat,poly};});assert.equal(result.forms.bear,'ours');assert.equal(result.forms.cat,'felin');assert(result.forms.poly);
 await page.evaluate(()=>{__dbg.quick('guerrier',0,20);const G=__dbg.G;G.player.god=true;document.getElementById('announce').innerHTML='';});
 result.equipment=await page.evaluate(()=>{const G=__dbg.G,P=G.player;const it=__mkGear({slot:'weapon',cls:'guerrier',ilvl:10,quality:70});const slot=P.data.bag.findIndex(x=>!x);P.data.bag[slot]=it;G.inv.equip(slot);return P.data.equip.weapon.id===it.id&&!!P.model.weapon;});assert(result.equipment);
 result.mount=await page.evaluate(()=>{const G=__dbg.G,P=G.player;__dbg.tp(-1350,60);P.combatT=99;P.mount();const start=P.pos.clone(),mounted=P.mounted;for(let i=0;i<120;i++)P.moveTowards(start.x+25,start.z,1/30);const distance=P.pos.distanceTo(start);P.dismount();return{mounted,distance,removed:!P.mountModel};});assert(result.mount.mounted);assert(result.mount.distance>2);assert(result.mount.removed);
 result.combat=await page.evaluate(()=>{const G=__dbg.G,P=G.player;P.god=true;const start=P.data.kills,gold=P.data.gold;const mob=G.world.spawnTemp('loup_pres',P.pos.x+2,P.pos.z,P);mob.temp=false;P.setTarget(mob);P.engaged=mob;G.world.rebuildGrid();for(let i=0;i<8&&!mob.dead;i++)__dbg.fight(3);return{dead:mob.dead,kills:P.data.kills-start,gold:P.data.gold-gold,hp:P.hp};});assert(result.combat.dead);assert(result.combat.kills>=1);assert(result.combat.gold>0);
 result.death=await page.evaluate(()=>{const G=__dbg.G,P=G.player;P.dead=true;P.model.die();P.onDeath(null);P.respawn();return{alive:!P.dead,modelAlive:!P.model.dead,hp:P.hp,world:P.worldId};});assert(result.death.alive&&result.death.modelAlive&&result.death.hp>0);
 result.survey=await page.evaluate(()=>{const G=__dbg.G,q='survey_val_0';G.quests.accept(q);for(let i=0;i<3;i++){const lm=__zones.LANDMARK_BY_ID['exp_val_'+i];__dbg.tp(lm.x,lm.z);__dbg.step(2);}const progress=[...G.player.data.quests.active[q].p];const completed=G.quests.complete(q);return{progress,completed};});assert(result.survey.completed);
 await page.keyboard.press('KeyM');await page.waitForTimeout(1500);await shot('map');await page.keyboard.press('KeyM');
 await page.evaluate(()=>{const G=__dbg.G;__dbg.tp(-1600,160);G.cam.yaw=3.5;G.cam.pitch=.24;G.cam.dist=G.cam.targetDist=7;G.flags.fixedTime=.42;G.saveNow();});await page.waitForTimeout(3000);await shot('hero');
 result.save=await page.evaluate(()=>{__dbg.G.saveNow();const data=JSON.parse(localStorage.getItem('orvalis.save.v1'));return{worldVersion:data.worldVersion,id:__dbg.G.player.data.id,position:__dbg.G.player.data.pos};});
 await page.reload();await page.waitForFunction(()=>window.__ready,null,{timeout:240000});await page.locator('#tl-go').click();await page.locator('#tt-play').click();await page.waitForFunction(()=>__dbg.G.mode==='game');
 result.reload=await page.evaluate(()=>({id:__dbg.G.player.data.id,position:__dbg.G.player.pos.toArray()}));assert.equal(result.reload.id,result.save.id);assert(Math.abs(result.reload.position[0]-result.save.position.x)<1);
 await page.setViewportSize({width:900,height:800});await page.waitForTimeout(1500);await shot('narrow');
 result.narrow=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}));assert(!result.narrow.overflow);
}catch(e){result.failure=e.stack;process.exitCode=1;console.error(e.stack);}
result.errors=errors;fs.writeFileSync(new URL('results.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();if(errors.length)process.exitCode=1;

