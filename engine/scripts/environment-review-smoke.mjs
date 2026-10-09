import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(engineDir, 'dist');
const pageFile = path.join(dist, 'environment-review.html');
const outputDir = path.join(engineDir, 'artifacts');
const screenshotFile = path.join(outputDir, 'environment-review.png');
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

if (!existsSync(pageFile)) throw new Error('environment-review smoke: dist/environment-review.html missing — run the engine build first');
mkdirSync(outputDir, { recursive: true });
const TYPES = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp' };
const server=createServer((req,res)=>{const url=decodeURIComponent((req.url??'/').split('?')[0]);let file=path.join(dist,url==='/'?'environment-review.html':url);if(!file.startsWith(dist)||!existsSync(file))return void res.writeHead(404).end('not found');res.writeHead(200,{'content-type':TYPES[path.extname(file)]??'application/octet-stream'});res.end(readFileSync(file));});
await new Promise((resolve,reject)=>server.once('error',reject).listen(PORT,'127.0.0.1',resolve));
const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/google-chrome';if(!existsSync(executablePath))throw new Error(`environment-review smoke: Chrome not found at ${executablePath}`);
const problems=[];let browser,page;
try{
 browser=await chromium.launch({executablePath,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('console',m=>{if(m.type()==='error')problems.push(`console.error: ${m.text()}`)});page.on('pageerror',e=>problems.push(`pageerror: ${e.message}`));page.on('requestfailed',r=>problems.push(`requestfailed: ${r.url()} · ${r.failure()?.errorText??'unknown'}`));
 const response=await page.goto(`${BASE_URL}environment-review.html`,{waitUntil:'load',timeout:30000});if(!response?.ok())problems.push(`HTTP ${response?.status()??'no response'}`);
 await page.waitForFunction(()=>document.body.dataset.state!=='loading',null,{timeout:45000}).catch(()=>problems.push('page stayed in loading state'));await page.waitForTimeout(1800);
 const state=await page.evaluate(()=>({state:document.body.dataset.state??'',loaded:Number(document.body.dataset.loaded??0),failed:Number(document.body.dataset.failed??0),status:document.getElementById('status')?.textContent??'',canvas:(()=>{const r=document.getElementById('game')?.getBoundingClientRect();return r?{width:r.width,height:r.height}:null})(),review:window.__orvalisEnvironmentReview??null}));
 if(state.state!=='ready')problems.push(`state=${state.state||'<empty>'}: ${state.status}`);if(state.loaded!==22)problems.push(`loaded=${state.loaded}; expected 22 existing CC0 GLB assets`);if(state.failed!==0)problems.push(`failed=${state.failed}`);if(!state.review?.ready)problems.push('window.__orvalisEnvironmentReview.ready missing');if((state.review?.objects??0)<100)problems.push(`scene object count suspiciously low: ${state.review?.objects}`);if(!state.canvas||state.canvas.width<1000||state.canvas.height<600)problems.push(`canvas size invalid: ${JSON.stringify(state.canvas)}`);
 await page.screenshot({path:screenshotFile,fullPage:true});console.log(`environment-review smoke: ${state.loaded} assets · ${state.review?.objects??0} scene objects · ${state.status}`);console.log(`environment-review smoke: screenshot ${screenshotFile}`);
}finally{await page?.close().catch(()=>{});await browser?.close().catch(()=>{});server.close()}
if(problems.length){console.error(`environment-review smoke failed:\n- ${problems.join('\n- ')}`);process.exit(1)}console.log('environment-review smoke: PASS');
