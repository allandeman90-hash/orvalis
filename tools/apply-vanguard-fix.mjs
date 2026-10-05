import fs from 'node:fs';
await import('./apply-vanguard.mjs');
const path = 'engine/src/scenes/modelScene.ts';
let text = fs.readFileSync(path, 'utf8');
const from = "  if (preset === undefined && !OUTFITS[outfit]) throw new Error(`scene: no outfit ${outfit} (there are ${OUTFITS.length})`);";
const to = "  if (kind === 'character' && preset === undefined && !OUTFITS[outfit]) throw new Error(`scene: no outfit ${outfit} (there are ${OUTFITS.length})`);";
if (!text.includes(from)) throw new Error('Vanguard fix: expected outfit guard not found');
fs.writeFileSync(path, text.replace(from, to));
console.log('Vanguard non-character regression fixed.');
