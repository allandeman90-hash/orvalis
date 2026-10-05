import {chromium} from './browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],samples=[],start=Date.now();page.on('pageerror',e=>errors.push(e.stack));
await page.goto(new URL('../dist/Jouer-Orvalis.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
const build=await page.evaluate(()=>window.__build);
await page.evaluate(()=>{__dbg.quick('guerrier',0,30);const G=__dbg.G;G.player.god=true;G.settings.quality=0;G.settings.shadows=false;G.settings.autoPerf=false;G.applyGraphics();});
const cdp=await page.context().newCDPSession(page);
for(let i=0;i<12;i++){
 const region=['val','bois','pics'][i%3];
 await page.evaluate(region=>{const G=__dbg.G,h=__zones.HUBS.find(h=>h.zone===region);__dbg.tp(h.x,h.z+80);G.cam.first=true;G.input.down.add('KeyW');window.__turn=setInterval(()=>G.cam.yaw+=.09,150);},region);
 await page.waitForTimeout(8000);await page.evaluate(()=>{clearInterval(window.__turn);__dbg.G.input.down.delete('KeyW');});await page.waitForTimeout(2000);
 await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');
 const state=await page.evaluate(()=>({...__dbg.G.perf.snapshot(),position:__dbg.G.player.pos.toArray()}));
 samples.push({i,region,heap,...state});console.log(region,Math.round(heap.usedSize/1048576),state.memory);
}
const growth=samples[11].heap.usedSize-samples[5].heap.usedSize;
const result={build,durationSeconds:(Date.now()-start)/1000,samples,sameRegionHeapGrowthBytes:growth,errors};
fs.mkdirSync(new URL('../validation/final-lifecycle/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../validation/final-lifecycle/results.json',import.meta.url),JSON.stringify(result,null,2));await browser.close();assert.equal(errors.length,0);assert(growth<16*1048576,'Unexpected heap growth across repeated region cycles');
