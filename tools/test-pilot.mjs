import {chromium} from './browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=new URL('../validation/human-pilot/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto(new URL('../dist/Pilote-Humain.html',import.meta.url).href);await page.waitForFunction(()=>window.__pilot?.ready,null,{timeout:120000});
const result={lods:[],errors};
for(let i=0;i<3;i++){await page.locator(`[data-lod="${i}"]`).click();await page.waitForFunction(i=>window.__pilot?.level===i,i);await page.waitForTimeout(1000);const r=await page.evaluate(()=>({level:__pilot.level,triangles:__pilot.triangles,animations:__pilot.animations}));result.lods.push(r);await page.screenshot({path:fileURLToPath(new URL('lod'+i+'.png',out))});}
for(const action of ['Idle','Walk','Run','Attack','Hit','Death']){await page.locator(`[data-action="${action}"]`).click();await page.waitForTimeout(250);}
assert(result.lods[0].triangles>result.lods[1].triangles&&result.lods[1].triangles>result.lods[2].triangles);assert(result.lods.every(x=>x.animations.length>=6));assert.equal(errors.length,0);fs.writeFileSync(new URL('results.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
