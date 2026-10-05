import fs from 'node:fs';
await import('./apply-vanguard-fix.mjs');

{
  const path = 'engine/src/scenes/modelScene.ts';
  let text = fs.readFileSync(path, 'utf8');
  const from = 'socket: (typeof MANNEQUIN_ATTACHMENTS)[number]';
  const to = 'socket: (typeof CHARACTER_ATTACHMENTS)[number]';
  if (!text.includes(from)) throw new Error('Vanguard v3: stale gear socket type not found');
  fs.writeFileSync(path, text.replace(from, to));
}

{
  const path = 'engine/tests/character/vanguard.test.ts';
  let text = fs.readFileSync(path, 'utf8');
  const pattern = /    expect\(new Set\(scene\.models\.equipment\)\)\.toEqual\(new Set\(VANGUARD_OUTFIT\.map\(\(key\) => \(\{[\s\S]*?\} as const\)\[key\]\)\)\);/;
  if (!pattern.test(text)) throw new Error('Vanguard v3: typed equipment expectation not found');
  text = text.replace(pattern, "    expect(new Set(scene.models.equipment)).toEqual(new Set(['linen-shirt', 'cloth-trousers', 'leather-vest', 'leather-boots', 'leather-gloves', 'belt', 'vanguard-helm', 'vanguard-shoulders', 'vanguard-cape', 'runeblade', 'tower-shield']));");
  fs.writeFileSync(path, text);
}

console.log('Vanguard TypeScript fixes applied.');
