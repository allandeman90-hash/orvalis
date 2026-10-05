import {chromium} from './browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const ctx=await browser.newContext({viewport:{width:1000,height:700}}),errors=[],out={};
const pages=[await ctx.newPage(),await ctx.newPage()];
try {
 for(let i=0;i<2;i++) {
  const p=pages[i];p.on('pageerror',e=>errors.push(e.stack));
  await p.goto('http://127.0.0.1:8766/#mockroom');await p.waitForFunction(()=>window.__ready,null,{timeout:240000});
  await p.evaluate(i=>{__dbg.quick(i?'archer':'guerrier',0,20);__dbg.G.player.data.name=__dbg.G.player.name='Pair'+i;__dbg.tp(-1600+i*3,160);},i);
 }
 await pages[0].waitForFunction(()=>__dbg.G.net.remotes.size>=1,null,{timeout:30000});
 await pages[1].waitForFunction(()=>__dbg.G.net.remotes.size>=1,null,{timeout:30000});
 for(let i=0;i<2;i++)out['peer'+i]=await pages[i].evaluate(()=>({build:__build,peers:[...__dbg.G.net.remotes.values()].map(r=>({name:r.name,position:r.pos.toArray(),model:!!r.model,pet:!!r.pet}))}));
 await pages[0].evaluate(()=>__dbg.tp(-1570,170));
 await pages[1].waitForFunction(()=>[...__dbg.G.net.remotes.values()].some(r=>r.name==='Pair0'&&Math.abs(r.pos.x+1570)<2),null,{timeout:15000});out.movement=true;
 out.versionGuard=await pages[0].evaluate(()=>{const n=__dbg.G.net;n.upsert({peer:'old-world',presence:{worldVersion:1,n:'Ancien',p:[0,0,0]}});return !n.remotes.has('old-world');});assert(out.versionGuard);
 out.npc=await pages[0].evaluate(()=>{const G=__dbg.G,n=G.world.entities.find(e=>e.kind==='npc'&&e.model&&e.faction===G.player.faction);if(!n)throw Error('No NPC');__dbg.tp(n.pos.x+1,n.pos.z);G.ui.openNpc(n);return{name:n.name,model:!!n.model};});
 out.hunterPet=await pages[1].evaluate(()=>{const pet=__dbg.G.pets.active;return{pet:!!pet,model:!!pet?.model};});assert(out.hunterPet.pet&&out.hunterPet.model);
}catch(e){out.failure=e.stack;process.exitCode=1;console.error(e.stack);}
out.errors=errors;fs.mkdirSync(new URL('../validation/peers/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../validation/peers/results.json',import.meta.url),JSON.stringify(out,null,2));await browser.close();console.log(JSON.stringify(out));if(errors.length)process.exitCode=1;
