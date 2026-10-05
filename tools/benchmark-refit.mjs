import {chromium} from './browser.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=new URL('../validation/final/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1920,height:1080},...(process.env.VIDEO?{recordVideo:{dir:fileURLToPath(new URL('video/',out)),size:{width:1280,height:720}}}:{})});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::'))errors.push(m.text());});
const result={scenes:[]};
await page.goto(new URL('../dist/Jouer-Orvalis.html',import.meta.url).href);await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
result.build=await page.evaluate(()=>window.__build);
await page.evaluate(()=>{__dbg.quick('mage',0,30);const G=__dbg.G;G.player.god=true;G.flags.fixedTime=.42;G.settings.autoPerf=false;document.getElementById('announce').innerHTML='';});
result.gpu=await page.evaluate(()=>{const gl=__dbg.G.renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
for(const [name,x,z]of [['village',-1632,157],['foret',-1250,1240],['montagne',-1500,-980],['combat',-1500,200]]){
 await page.evaluate(({x,z,name})=>{__dbg.tp(x,z);const G=__dbg.G;G.cam.yaw=.7;G.cam.pitch=.32;G.cam.dist=G.cam.targetDist=11;G.cam.first=true;document.getElementById('announce').innerHTML='';if(name==='combat'){const m=G.world.spawnTemp('ours',x+8,z+9,null);G.player.setTarget(m);G.player.engaged=m;window.__fightTimer=setInterval(()=>G.player.useSkillById('m_trait'),1300);}},{x,z,name});
 await page.waitForTimeout(5500);await page.evaluate(()=>__dbg.G.perf.samples.length=0);
 const sample=await page.evaluate(async()=>{const a=[];await new Promise(resolve=>{let last=performance.now();const tick=now=>{a.push(now-last);last=now;if(a.length<240)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});a.sort((a,b)=>a-b);return{...__dbg.G.perf.snapshot(),medianMs:a[120],p95Ms:a[228],p99Ms:a[237],heapBytes:performance.memory?.usedJSHeapSize};});
 result.scenes.push({name,x,z,...sample});await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});
 await page.evaluate(()=>clearInterval(window.__fightTimer));console.log(name,JSON.stringify(sample));
}
await page.evaluate(()=>{const G=__dbg.G;G.settings.quality=0;G.settings.shadows=false;G.settings.viewDist=240;G.applyGraphics();G.perf.samples.length=0;});await page.waitForTimeout(6000);result.reduced=await page.evaluate(()=>__dbg.G.perf.snapshot());
result.reducedScenes=[];
for(const [name,x,z]of [['village',-1632,157],['foret',-1250,1240],['montagne',-1500,-980]]){
 await page.evaluate(({x,z})=>{__dbg.tp(x,z);__dbg.G.cam.first=true;},{x,z});await page.waitForTimeout(5000);await page.evaluate(()=>__dbg.G.perf.samples.length=0);await page.waitForTimeout(5000);
 const stats=await page.evaluate(()=>__dbg.G.perf.snapshot());result.reducedScenes.push({name,...stats});console.log('reduced',name,JSON.stringify(stats));
}
await page.setViewportSize({width:900,height:800});await page.waitForTimeout(1000);await page.screenshot({path:fileURLToPath(new URL('narrow.png',out))});
result.layout=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};};const b=rect('bottom'),chat=rect('chat'),menu=rect('menubar'),hit=(a,b)=>a.x<b.right&&b.x<a.right&&a.y<b.bottom&&b.y<a.bottom;return{chatOverlap:hit(b,chat),menuOverlap:hit(b,menu)};});
result.errors=errors;fs.writeFileSync(new URL('results.json',out),JSON.stringify(result,null,2));const video=page.video();await context.close();if(video)await video.saveAs(fileURLToPath(new URL('parcours.webm',out)));await browser.close();
if(errors.length||result.layout.chatOverlap||result.layout.menuOverlap)process.exitCode=1;

