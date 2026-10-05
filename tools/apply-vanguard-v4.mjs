import fs from 'node:fs';
await import('./apply-vanguard-v3.mjs');
const path = 'engine/tests/character/vanguard.test.ts';
let text = fs.readFileSync(path, 'utf8');
const from = "import { CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON, VANGUARD_OUTFIT, buildAttachedModel } from '../../src/character';";
const to = "import { CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON, buildAttachedModel } from '../../src/character';";
if (!text.includes(from)) throw new Error('Vanguard v4: unused import line not found');
fs.writeFileSync(path, text.replace(from, to));
console.log('Vanguard unused import removed.');
