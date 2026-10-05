import run from './d1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
export default async function(ctx){
 await run(ctx);
 const result=await ctx.ev(()=>{const A=__dbg.G.inst.active;return{done:A?.done,kills:A?.kills,total:A?.total,encounters:A?.encounters.map(e=>({name:e.name,state:e.state,duration:e.dur})),position:__dbg.G.player.pos.toArray()};});
 fs.mkdirSync(new URL('../validation/dungeon/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../validation/dungeon/results.json',import.meta.url),JSON.stringify(result,null,2));
 assert(result.done,'Full dungeon run did not complete');
}
