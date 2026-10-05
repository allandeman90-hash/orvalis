import {chromium} from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const meta=JSON.parse(fs.readFileSync(new URL('../../outputs/latest-release.json',import.meta.url)));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],out={};
page.on('pageerror',e=>errors.push(e.stack));
await page.route(/^https?:/,r=>r.abort());
try {
 await page.goto(pathToFileURL(path.join(meta.extracted,'dist/Jouer-Orvalis.html')).href);
 await page.waitForFunction(()=>window.__ready,null,{timeout:240000});
 out.build=await page.evaluate(()=>window.__build);assert.equal(out.build.sourceHash,meta.sourceHash);
 await page.locator('#tl-acct').fill('Archive');await page.locator('#tl-go').click();
 await page.evaluate(()=>__dbg.quick('guerrier',0,10));
 await page.waitForTimeout(4000);
 out.state=await page.evaluate(()=>({mode:__dbg.G.mode,world:__dbg.G.player.worldId,model:!!__dbg.G.player.model.root.children.find(o=>o.isSkinnedMesh),sectors:__dbg.G.terrainSectors.stats.resident,offline:!window.claude}));
 assert.equal(out.state.mode,'game');assert(out.state.model&&out.state.sectors>0);
 out.forms=await page.evaluate(()=>{const p=__dbg.G.player;p.setPoly(true);p.polyModel.update(.1,5);p.setPoly(false);return !p.polyModel;});assert(out.forms);
 await page.evaluate(()=>{__dbg.G.ui.closeAll?.();document.getElementById('announce').innerHTML='';});
 await page.screenshot({path:path.join(path.dirname(meta.release),'archive-verified.png')});
}catch(e){out.failure=e.stack;process.exitCode=1;console.error(e.stack);}
out.errors=errors;out.archive=meta.zip;fs.writeFileSync(new URL('../../outputs/archive-test.json',import.meta.url),JSON.stringify(out,null,2));await browser.close();console.log(JSON.stringify(out));if(errors.length)process.exitCode=1;
