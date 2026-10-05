import { describe, expect, it } from 'vitest';
import {
  applyCharacterSkin, applyEquipmentTextures, buildAttachedModel, CHARACTER_REGIONS, CHARACTER_SOCKET, CharacterComposite, DEFAULT_SKIN, EQUIPMENT_LAYER_OF_SLOT, equipmentAttachments, equipmentGeometry, equipmentOf, ITEM_COLOURS, ITEMS,
  itemTexture, MANNEQUIN_ATTACHMENTS, MANNEQUIN_BONE, MANNEQUIN_SKELETON, OUTFITS, validateEquipment,
} from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { modelBounds, validateAttachments, validateModelMesh } from '../../src/model';
import { NullBackend } from '../../src/renderer';
import { createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

const dressed = (...keys: Parameters<typeof equipmentOf>): CharacterComposite => {
  const composite = new CharacterComposite({ dither: false });
  applyCharacterSkin(composite, DEFAULT_SKIN);
  applyEquipmentTextures(composite, equipmentOf(...keys));
  composite.rebuild();
  return composite;
};
/** Texel of a region at (s, t): s round the part (0.25 = front), t up the part. */
const at = (composite: CharacterComposite, region: keyof typeof CHARACTER_REGIONS, s: number, t: number): number[] => {
  const r = CHARACTER_REGIONS[region], x = r.x + Math.round(s * (r.width - 1)), y = r.y + Math.round((1 - t) * (r.height - 1));
  return Array.from(composite.texels!.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 3));
};
const isColour = (texel: number[], colour: readonly number[]): boolean => texel.every((v, c) => v >= colour[c]! * 0.9 && v <= Math.min(255, colour[c]! * 1.1));

describe('the three ways an item dresses a character (spec §56)', () => {
  it('the catalogue has texture-only, geoset-changing and attached items', () => {
    expect(ITEMS.linenShirt.textures).toHaveLength(3);
    expect(ITEMS.leatherBoots.geosets).toEqual({ boots: 2 });
    expect(ITEMS.ironSword.attached).toEqual({ socket: CHARACTER_SOCKET.rightHand, model: 'sword' });
    expect(() => validateEquipment(equipmentOf('linenShirt', 'clothTrousers', 'leatherVest', 'belt', 'leatherGloves', 'leatherBoots', 'ironSword', 'roundShield'))).not.toThrow();
  });
  it('at most one item per slot; unknown items are refused', () => {
    expect(equipmentOf('linenShirt', 'belt')).toEqual({ shirt: ITEMS.linenShirt, belt: ITEMS.belt });
    expect(() => equipmentOf('linenShirt', 'linenShirt')).toThrow(/two items for slot shirt/);
    expect(() => equipmentOf('crown' as never)).toThrow(/no item "crown"/);
    expect(() => validateEquipment({ belt: ITEMS.linenShirt })).toThrow(/goes in slot shirt, not belt/);
    expect(() => validateEquipment({ mainHand: { ...ITEMS.ironSword, textures: ITEMS.belt.textures } })).toThrow(/has no texture layer/);
  });
  it('the painting slots use distinct layers among the 8', () => {
    const layers = Object.values(EQUIPMENT_LAYER_OF_SLOT);
    expect(new Set(layers).size).toBe(layers.length);
    for (const layer of layers) expect(layer).toBeLessThan(8);
  });
});

describe('A. painted equipment', () => {
  it('the shirt covers the chest and the upper arms, not the hips nor the forearms', () => {
    const c = dressed('linenShirt');
    expect(isColour(at(c, 'torso', 0.25, 0.6), ITEM_COLOURS.linen)).toBe(true);
    expect(isColour(at(c, 'leftArm', 0.5, 0.9), ITEM_COLOURS.linen)).toBe(true);
    expect(isColour(at(c, 'rightArm', 0.5, 0.9), ITEM_COLOURS.linen)).toBe(true);
    expect(isColour(at(c, 'leftArm', 0.5, 0.2), ITEM_COLOURS.linen)).toBe(false);
    expect(isColour(at(c, 'torso', 0.25, 0.1), ITEM_COLOURS.linen)).toBe(false); // underwear shows there
  });
  it('trousers cover the legs and the hips (over the underwear)', () => {
    const c = dressed('clothTrousers');
    expect(isColour(at(c, 'leftLeg', 0.3, 0.5), ITEM_COLOURS.cloth)).toBe(true);
    expect(isColour(at(c, 'rightLeg', 0.3, 0.95), ITEM_COLOURS.cloth)).toBe(true);
    expect(isColour(at(c, 'torso', 0.25, 0.1), ITEM_COLOURS.cloth)).toBe(true);
    expect(isColour(at(c, 'torso', 0.25, 0.6), ITEM_COLOURS.cloth)).toBe(false);
  });
  it('layers stack in slot order: the vest over the shirt, open at the front; the belt and its buckle over both', () => {
    const c = dressed('leatherVest', 'linenShirt', 'belt');
    expect(isColour(at(c, 'torso', 0.75, 0.6), ITEM_COLOURS.leather)).toBe(true); // back: vest
    expect(isColour(at(c, 'torso', 0.25, 0.6), ITEM_COLOURS.linen)).toBe(true); // front strip: the shirt shows
    expect(isColour(at(c, 'torso', 0.75, 0.84), ITEM_COLOURS.linen)).toBe(true); // above the vest
    expect(isColour(at(c, 'torso', 0.75, 0.28), ITEM_COLOURS.belt)).toBe(true);
    expect(isColour(at(c, 'torso', 0.25, 0.28), ITEM_COLOURS.buckle)).toBe(true);
  });
  it('putting an item on or off dirties only the groups it paints', () => {
    const c = dressed();
    applyEquipmentTextures(c, equipmentOf('linenShirt'));
    expect(c.dirtyGroups).toEqual(['torso', 'arms']);
    c.rebuild();
    applyEquipmentTextures(c, equipmentOf('linenShirt', 'clothTrousers'));
    expect(c.dirtyGroups).toEqual(['torso', 'legs']);
    c.rebuild();
    applyEquipmentTextures(c, equipmentOf('linenShirt', 'clothTrousers'));
    expect(c.dirtyGroups).toEqual([]);
    applyEquipmentTextures(c, equipmentOf('clothTrousers'));
    expect(c.dirtyGroups).toEqual(['torso', 'arms']);
    c.rebuild();
    // The skin is back where the shirt was.
    expect(isColour(at(c, 'leftArm', 0.5, 0.9), ITEM_COLOURS.linen)).toBe(false);
  });
  it('geoset-only and attached items paint nothing', () => {
    const c = dressed();
    applyEquipmentTextures(c, equipmentOf('leatherBoots', 'leatherGloves', 'ironSword', 'roundShield'));
    expect(c.dirtyGroups).toEqual([]);
  });
});

describe('B. geoset-changing equipment', () => {
  it('nothing worn: bare hands and feet; boots and gloves ask for variant 2', () => {
    expect(equipmentGeometry({})).toEqual({ gloves: 1, boots: 1 });
    expect(equipmentGeometry(equipmentOf('leatherBoots'))).toEqual({ gloves: 1, boots: 2 });
    expect(equipmentGeometry(equipmentOf('leatherBoots', 'leatherGloves', 'linenShirt'))).toEqual({ gloves: 2, boots: 2 });
  });
});

describe('C. attached equipment', () => {
  it('lists the models to fasten and their sockets, in slot order', () => {
    expect(equipmentAttachments(equipmentOf('roundShield', 'ironSword', 'belt'))).toEqual([
      { slot: 'mainHand', socket: CHARACTER_SOCKET.rightHand, model: 'sword' },
      { slot: 'offHand', socket: CHARACTER_SOCKET.leftForearm, model: 'shield' },
    ]);
    expect(equipmentAttachments({})).toEqual([]);
  });
  it('the mannequin has a socket in the right hand and one on the left forearm', () => {
    expect(() => validateAttachments(MANNEQUIN_ATTACHMENTS, MANNEQUIN_SKELETON.bones.length)).not.toThrow();
    expect(MANNEQUIN_ATTACHMENTS.map((a) => [a.name, a.bone])).toEqual([['rightHand', MANNEQUIN_BONE.rightHand], ['leftForearm', MANNEQUIN_BONE.leftForearm]]);
    expect(MANNEQUIN_ATTACHMENTS[0]!.position[0]).toBeGreaterThan(0); // right = +x
    expect(MANNEQUIN_ATTACHMENTS[1]!.position[0]).toBeLessThan(0);
  });
  it('the sword points forward from the hand; the shield is a disc facing left', () => {
    const sword = buildAttachedModel('sword'), shield = buildAttachedModel('shield');
    for (const mesh of [sword, shield]) expect(() => validateModelMesh(mesh)).not.toThrow();
    const s = modelBounds(sword), d = modelBounds(shield);
    expect(s.max[1]).toBeCloseTo(0.86, 5);
    expect(s.max[1] - s.min[1]).toBeGreaterThan(5 * (s.max[0] - s.min[0])); // long along y
    expect(d.max[0]).toBeCloseTo(0, 6); // its back is on the socket
    expect(d.min[0]).toBeLessThan(-0.04); // it sticks out towards −x
    expect(d.max[2] - d.min[2]).toBeCloseTo(0.44, 5);
    expect(itemTexture().data.slice(0, 3)).toEqual(new Uint8Array(ITEM_COLOURS.steel));
    expect(() => buildAttachedModel('bow' as never)).toThrow(/no attached model/);
  });
});

describe('the character scene wears equipment', () => {
  it('reads the outfit from the URL', () => {
    expect(parseSceneRequest('?scene=model&model=character&outfit=2')).toMatchObject({ outfit: 2 });
    expect(parseSceneRequest('?scene=model&model=character&outfit=9')).toMatchObject({ outfit: 0 });
    expect(OUTFITS).toHaveLength(3);
  });
  it('outfit 1: painted clothes and boots — the boot section replaces the bare feet, no attached model', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character', outfit: 1 });
    expect(scene.render(16 / 9).drawCalls).toBe(4); // body, hair, hands, boots
    expect(scene.models).toMatchObject({ outfit: 1, equipment: ['linen-shirt', 'cloth-trousers', 'leather-boots', 'belt'], attached: 0, models: 1 });
    expect([...scene.instances[0]!.hiddenGeosets!].includes(501)).toBe(true);
    expect([...scene.instances[0]!.hiddenGeosets!].includes(502)).toBe(false);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('outfit 2: sword and shield are separate models placed on their sockets', () => {
    const backend = new NullBackend();
    const seen: number[][] = [];
    const draw = backend.draw.bind(backend);
    backend.draw = (call) => { seen.push(Array.from((call.uniforms as Float32Array).subarray(16, 32))); return draw(call); };
    const scene = createModelScene(backend, { model: 'character', outfit: 2, animation: 'off' });
    expect(scene.render(16 / 9).drawCalls).toBe(6);
    expect(scene.models).toMatchObject({ models: 3, attached: 2 });
    // The last two draws are the gear: their model matrices are translations to the sockets (rest pose).
    expect(seen[4]!.slice(12, 15).map((v) => Math.round(v * 1000) / 1000)).toEqual([0.262, 0.02, 0.84]);
    expect(seen[5]!.slice(12, 15).map((v) => Math.round(v * 1000) / 1000)).toEqual([-0.3, 0, 1.05]);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('key 8 goes through the outfits; the texture is rebuilt only where it changes; gear comes and goes', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character' });
    scene.render(16 / 9);
    expect(scene.cycleOutfit()).toBe(1);
    expect(scene.models.textureRebuilt).toEqual(['torso', 'arms', 'legs']);
    expect(scene.cycleOutfit()).toBe(2);
    expect(scene.models.textureRebuilt).toEqual(['torso']); // only the vest is new paint
    expect(scene.render(16 / 9).drawCalls).toBe(6);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models }).join('\n')).toContain('Equipment: outfit 2 (8) · linen-shirt, cloth-trousers, leather-vest, leather-boots, leather-gloves, belt, iron-sword, round-shield');
    expect(scene.cycleOutfit()).toBe(0);
    expect(scene.models).toMatchObject({ attached: 0, equipment: [] });
    expect(scene.render(16 / 9).drawCalls).toBe(4);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('items can be worn one by one; a glove variant chosen by hand stays when no item asks for less', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character', look: { gloves: 2 } });
    scene.setEquipment(['ironSword']);
    expect(scene.models).toMatchObject({ outfit: -1, equipment: ['iron-sword'], attached: 1 });
    expect(scene.instances[0]!.hiddenGeosets!.has(402)).toBe(false);
    expect(() => scene.setEquipment(['belt', 'belt'])).toThrow(/two items for slot belt/);
    scene.dispose();
  });
  it('the tree wears nothing', () => {
    const tree = createModelScene(new NullBackend(), {});
    expect(tree.models.equipment).toBeUndefined();
    expect(tree.cycleOutfit()).toBe(0);
    tree.dispose();
    expect(() => createModelScene(new NullBackend(), { model: 'character', outfit: 7 })).toThrow(/no outfit 7/);
  });
});
