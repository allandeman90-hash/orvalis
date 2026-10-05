import { chromium } from './browser.mjs';
import fs from 'node:fs';
const out=new URL('../validation/soak/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto(new URL('../dist/test.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
await page.evaluate(()=>{__dbg.quick('guerrier',0,30);const G=__dbg.G;G.player.god=true;G.settings.autoPerf=false;G.flags.fixedTime=.42;G.player.data.hasMount=true;G.player.data.mountTier=2;G.player.mount();});
const cdp=await page.context().newCDPSession(page),samples=[],start=Date.now();
for(let i=0;i<40;i++){
 const region=['val','bois','pics','bois'][i%4];
 await page.evaluate(({region,i})=>{const G=__dbg.G,h=__zones.HUBS.find(h=>h.zone===region);__dbg.tp(h.x,h.z+70);G.cam.yaw=.7;G.cam.pitch=.3;G.cam.first=true;G.input.down.add('KeyW');window.__soakTimer=setInterval(()=>{G.cam.yaw+=.07;},150);},{region,i});
 await page.waitForTimeout(20000);
 await page.evaluate(()=>{clearInterval(window.__soakTimer);__dbg.G.input.down.delete('KeyW');});
 await page.waitForTimeout(10000);
 await cdp.send('HeapProfiler.collectGarbage');
 const heap=await cdp.send('Runtime.getHeapUsage');
 const sample=await page.evaluate(()=>{const G=__dbg.G,P=G.player;return {...G.perf.snapshot(),position:P.pos.toArray(),height:__terrain.getHeight(P.pos.x,P.pos.z),worldId:P.worldId,mounted:P.mounted,entities:G.world.entities.length};});
 samples.push({i,region,elapsedSeconds:(Date.now()-start)/1000,heap,...sample});
 fs.writeFileSync(new URL('results.json',out),JSON.stringify({durationSeconds:(Date.now()-start)/1000,samples,errors},null,2));
 console.log(JSON.stringify({i,region,elapsed:Math.round((Date.now()-start)/1000),heapMB:Math.round(heap.usedSize/1048576),geometries:sample.memory.geometries,textures:sample.memory.textures,sectors:sample.sectors.resident}));
}
await page.screenshot({path:new URL('end.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
await browser.close();if(errors.length)process.exitCode=1;
