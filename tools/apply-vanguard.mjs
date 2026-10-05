import fs from 'node:fs';

function patch(path, edits) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(`${path}: expected text not found:\n${from.slice(0, 180)}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('engine/src/scenes/modelScene.ts', [
  [
    "itemTexture, MANNEQUIN_ATTACHMENTS, OUTFITS, applyCharacterSkin",
    "itemTexture, CHARACTER_ATTACHMENTS, OUTFITS, VANGUARD_OUTFIT, applyCharacterSkin",
  ],
  [
    "GEOSET_GROUP, type GeosetGroupName, geosetVariantsOf, hiddenGeosetsOf",
    "GEOSET_GROUP, type GeosetGroupName, geosetId, geosetVariantsOf, hiddenGeosetsOf",
  ],
  [
    "  /** Character only: one of the ready-made outfits (0 = nothing, 1 = clothes, 2 = clothes, leather and arms). Default 0. */\n  readonly outfit?: number | undefined;",
    "  /** Character only: one of the ready-made outfits (0 = nothing, 1 = clothes, 2 = clothes, leather and arms). Default 0. */\n  readonly outfit?: number | undefined;\n  /** Character only: a visual-convergence preset. 'vanguard' is the first exaggerated endgame/transmog proof. */\n  readonly preset?: 'vanguard' | undefined;",
  ],
  [
    "  let outfit = kind === 'character' ? (options.outfit ?? 0) : 0;\n  if (!OUTFITS[outfit]) throw new Error(`scene: no outfit ${outfit} (there are ${OUTFITS.length})`);\n  let equipment: CharacterEquipment = equipmentOf(...OUTFITS[outfit]!);",
    "  const preset = kind === 'character' ? options.preset : undefined;\n  let outfit = kind === 'character' && preset === undefined ? (options.outfit ?? 0) : -1;\n  if (preset === undefined && !OUTFITS[outfit]) throw new Error(`scene: no outfit ${outfit} (there are ${OUTFITS.length})`);\n  let equipment: CharacterEquipment = kind === 'character' && preset === 'vanguard' ? equipmentOf(...VANGUARD_OUTFIT) : equipmentOf(...OUTFITS[Math.max(0, outfit)]!);",
  ],
  [
    "    for (const id of hiddenGeosetsOf(mesh, selection)) hiddenGeosets.add(id);\n  };",
    "    for (const id of hiddenGeosetsOf(mesh, selection)) hiddenGeosets.add(id);\n    // Full helmets can explicitly hide the currently selected hair geoset instead of relying on clipping.\n    if (equipment.head?.hideHair) hiddenGeosets.add(geosetId(GEOSET_GROUP.hair, look.hair));\n  };",
  ],
  ["MANNEQUIN_ATTACHMENTS, skeleton.bones.length", "CHARACTER_ATTACHMENTS, skeleton.bones.length"],
  ["findAttachment(MANNEQUIN_ATTACHMENTS, wanted.socket)", "findAttachment(CHARACTER_ATTACHMENTS, wanted.socket)"],
  ["kind === 'character' ? 1.25 : 0", "kind === 'character' ? 1.7 : 0"],
]);

patch('engine/src/scenes/select.ts', [
  [
    " *   &outfit=0..2   character only: nothing, clothes, or clothes + leather + sword and shield (key 8: the next one)\n",
    " *   &outfit=0..2   character only: nothing, clothes, or clothes + leather + sword and shield (key 8: the next one)\n *   &preset=vanguard   character only: first exaggerated endgame/transmog visual-convergence showcase\n",
  ],
  [
    "      readonly outfit: number;\n      readonly animation: 'stand' | 'walk' | 'run' | 'off';",
    "      readonly outfit: number;\n      readonly preset: 'vanguard' | undefined;\n      readonly animation: 'stand' | 'walk' | 'run' | 'off';",
  ],
  [
    "      outfit: parseIntegerIn(params.get('outfit'), 0, 2, 0),\n      animation: oneOf(params.get('anim'), ['stand', 'walk', 'run', 'off'] as const, 'stand'),",
    "      outfit: parseIntegerIn(params.get('outfit'), 0, 2, 0),\n      preset: oneOf(params.get('preset'), ['vanguard', ''] as const, '') === 'vanguard' ? 'vanguard' : undefined,\n      animation: oneOf(params.get('anim'), ['stand', 'walk', 'run', 'off'] as const, 'stand'),",
  ],
]);

const testPath = 'engine/tests/character/vanguard.test.ts';
fs.writeFileSync(testPath, `import { describe, expect, it } from 'vitest';
import { CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON, VANGUARD_OUTFIT, buildAttachedModel } from '../../src/character';
import { validateAttachments, validateModelMesh } from '../../src/model';
import { NullBackend } from '../../src/renderer';
import { createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

describe('Vanguard endgame appearance proof', () => {
  it('has valid head, shoulder, back and combat sockets', () => {
    expect(() => validateAttachments(CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON.bones.length)).not.toThrow();
    expect(CHARACTER_ATTACHMENTS.map((a) => a.name)).toEqual(['rightHand', 'leftForearm', 'head', 'leftShoulder', 'rightShoulder', 'back']);
  });

  it('builds every unique attached Vanguard model', () => {
    for (const key of ['vanguardHelm', 'vanguardPauldron', 'vanguardCape', 'runeblade', 'towerShield'] as const) {
      expect(() => validateModelMesh(buildAttachedModel(key))).not.toThrow();
    }
  });

  it('selects the preset from the URL and renders a six-piece attached silhouette', () => {
    expect(parseSceneRequest('?scene=model&model=character&preset=vanguard&anim=stand')).toMatchObject({ scene: 'model', model: 'character', preset: 'vanguard' });
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character', preset: 'vanguard', animation: 'off' });
    const frame = scene.render(16 / 9);
    expect(frame.drawCalls).toBe(9); // body + gloves + boots + 6 attached pieces; hair hidden by helm
    expect(scene.models).toMatchObject({ outfit: -1, attached: 6, models: 6 });
    expect(new Set(scene.models.equipment)).toEqual(new Set(VANGUARD_OUTFIT.map((key) => ({
      linenShirt: 'linen-shirt', clothTrousers: 'cloth-trousers', belt: 'belt', leatherBoots: 'leather-boots', leatherVest: 'leather-vest', leatherGloves: 'leather-gloves',
      vanguardHelm: 'vanguard-helm', vanguardShoulders: 'vanguard-shoulders', vanguardCape: 'vanguard-cape', runeblade: 'runeblade', towerShield: 'tower-shield',
    } as const)[key])));
    expect(scene.instances[0]!.hiddenGeosets!.has(1)).toBe(true); // selected hair hidden under full helm
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});
`);

console.log('Vanguard patch applied.');
