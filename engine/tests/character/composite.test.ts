import { describe, expect, it } from 'vitest';
import {
  applyCharacterSkin, CHARACTER_DIRTY_GROUP_NAMES, CHARACTER_DIRTY_GROUPS, CHARACTER_REGIONS, type CharacterRegionName, type CharacterSection, CharacterComposite, DEFAULT_SKIN, ditherTo565, EYE_COLOURS,
  FACE_LAYOUT, faceSection, HAIR_COLOURS, type SectionAlpha, quantizeAlpha4, SKIN_TONES, skinSection, UNDERWEAR_COLOUR,
} from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { NullBackend } from '../../src/renderer';
import { createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

/** A section filled with one colour. */
const flat = (region: CharacterRegionName, rgba: readonly [number, number, number, number], alpha: SectionAlpha = 'opaque', name = 'flat'): CharacterSection => {
  const { width, height } = CHARACTER_REGIONS[region], data = new Uint8Array(width * height * 4);
  for (let k = 0; k < width * height; k++) data.set(rgba, k * 4);
  return { name, region, data, alpha };
};
const texel = (composite: CharacterComposite, x: number, y: number): number[] => Array.from(composite.texels!.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
const plain = (): CharacterComposite => new CharacterComposite({ dither: false });

describe('composite: created lazily, rebuilt by dirty group (spec §52, §53)', () => {
  it('has 10 rebuild groups covering every region exactly once', () => {
    expect(CHARACTER_DIRTY_GROUP_NAMES).toHaveLength(10);
    const covered = CHARACTER_DIRTY_GROUP_NAMES.flatMap((group) => [...CHARACTER_DIRTY_GROUPS[group]]);
    expect([...covered].sort()).toEqual(Object.keys(CHARACTER_REGIONS).sort());
  });

  it('has no texels before the first rebuild; the first rebuild paints all 10 groups of the 256 × 256 target', () => {
    const composite = plain();
    expect(composite.texels).toBeNull();
    composite.setSection('skin', 'torso', flat('torso', [200, 100, 50, 255]));
    expect(composite.rebuild()).toEqual(CHARACTER_DIRTY_GROUP_NAMES);
    expect(composite.texels!.length).toBe(256 * 256 * 4);
    expect(composite.regionsRebuilt).toBe(14);
    expect(texel(composite, 5, 5)).toEqual([200, 100, 50, 255]);
    expect(texel(composite, 130, 5)).toEqual([0, 0, 0, 255]); // head: nobody painted it
  });

  it('rebuilds nothing when nothing is dirty', () => {
    const composite = plain();
    composite.rebuild();
    const before = composite.regionsRebuilt;
    expect(composite.rebuild()).toEqual([]);
    expect(composite.regionsRebuilt).toBe(before);
  });

  it('a change marks only the group of its region, and only that group is repainted', () => {
    const composite = plain();
    composite.setSection('skin', 'torso', flat('torso', [200, 100, 50, 255]));
    composite.setSection('skin', 'leftArm', flat('leftArm', [10, 20, 30, 255]));
    composite.rebuild();
    const before = composite.texels!.slice(), painted = composite.regionsRebuilt;
    composite.setSection('skin', 'leftArm', flat('leftArm', [90, 90, 90, 255]));
    expect(composite.dirtyGroups).toEqual(['arms']);
    expect(composite.rebuild()).toEqual(['arms']);
    expect(composite.regionsRebuilt).toBe(painted + 2); // both arms belong to the group
    const after = composite.texels!;
    // Texels outside the two arm rectangles are untouched.
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const inArms = y >= 96 && y < 192 && x < 128;
      if (!inArms) expect(after[(y * 256 + x) * 4]).toBe(before[(y * 256 + x) * 4]);
    }
    expect(texel(composite, 10, 100)).toEqual([90, 90, 90, 255]);
  });

  it('setting the very same section again, or removing one that is not there, dirties nothing', () => {
    const composite = plain(), section = flat('head', [1, 2, 3, 255]);
    composite.setSection('skin', 'head', section);
    composite.rebuild();
    composite.setSection('skin', 'head', section);
    composite.setSection('face', 'head', null);
    expect(composite.dirtyGroups).toEqual([]);
    composite.setSection('skin', 'head', null);
    expect(composite.dirtyGroups).toEqual(['head']);
  });

  it('paints layers in order: skin, then overlays, then equipment on top', () => {
    const composite = plain();
    composite.setSection('equipment3', 'torso', flat('torso', [0, 0, 255, 255]));
    composite.setSection('skin', 'torso', flat('torso', [255, 0, 0, 255]));
    composite.setSection('underwear', 'torso', flat('torso', [0, 255, 0, 255]));
    composite.rebuild();
    expect(texel(composite, 5, 5)).toEqual([0, 0, 255, 255]);
    composite.setSection('equipment3', 'torso', null);
    composite.rebuild();
    expect(texel(composite, 5, 5)).toEqual([0, 255, 0, 255]);
  });

  it('rejects a section of the wrong size, for another region, or an unknown layer', () => {
    const composite = plain();
    expect(() => composite.setSection('skin', 'torso', { ...flat('torso', [0, 0, 0, 255]), data: new Uint8Array(16) })).toThrow(/must hold 128 × 96 texels/);
    expect(() => composite.setSection('skin', 'torso', flat('head', [0, 0, 0, 255]))).toThrow(/made for region head, not torso/);
    expect(() => composite.setSection('cloak' as never, 'torso', null)).toThrow(/unknown layer/);
  });
});

describe('overlay alpha modes (spec §57)', () => {
  const over = (alpha: SectionAlpha, a: number): number[] => {
    const composite = plain();
    composite.setSection('skin', 'head', flat('head', [0, 0, 0, 255]));
    composite.setSection('face', 'head', flat('head', [255, 150, 30, a], alpha));
    composite.rebuild();
    return texel(composite, 130, 5).slice(0, 3);
  };
  it('opaque replaces whatever its alpha', () => {
    expect(over('opaque', 0)).toEqual([255, 150, 30]);
  });
  it('1-bit alpha: replaces from 128 up, leaves the destination below', () => {
    expect(over('key', 127)).toEqual([0, 0, 0]);
    expect(over('key', 128)).toEqual([255, 150, 30]);
  });
  it('4-level alpha: the weights are 0, 1/3, 2/3 and 1', () => {
    expect([0, 42, 43, 127, 128, 212, 213, 255].map(quantizeAlpha4)).toEqual([0, 0, 1 / 3, 1 / 3, 2 / 3, 2 / 3, 1, 1]);
    expect(over('blend4', 20)).toEqual([0, 0, 0]);
    expect(over('blend4', 85)).toEqual([85, 50, 10]);
    expect(over('blend4', 170)).toEqual([170, 100, 20]);
    expect(over('blend4', 255)).toEqual([255, 150, 30]);
  });
});

describe('5-6-5 reduction with dithering (spec §57)', () => {
  const representable = (v: number, bits: number): boolean => {
    const q = v >> (8 - bits);
    return v === ((q << (8 - bits)) | (q >> (2 * bits - 8)));
  };
  it('leaves only values a 5-6-5 texture can hold', () => {
    const w = 32, h = 16, data = new Uint8Array(w * h * 4);
    for (let k = 0; k < w * h; k++) data.set([(k * 7) % 256, (k * 13) % 256, (k * 29) % 256, 200], k * 4);
    ditherTo565(data, w, h);
    for (let k = 0; k < w * h; k++) {
      expect(representable(data[k * 4]!, 5)).toBe(true);
      expect(representable(data[k * 4 + 1]!, 6)).toBe(true);
      expect(representable(data[k * 4 + 2]!, 5)).toBe(true);
      expect(data[k * 4 + 3]).toBe(200);
    }
  });
  it('keeps a colour that is already representable', () => {
    const data = new Uint8Array(8 * 8 * 4);
    for (let k = 0; k < 64; k++) data.set([255, 130, 0, 255], k * 4);
    ditherTo565(data, 8, 8);
    for (let k = 0; k < 64; k++) expect(Array.from(data.subarray(k * 4, k * 4 + 3))).toEqual([255, 130, 0]);
  });
  it('dithers: a colour between two levels becomes a mix of both whose average is the colour', () => {
    const w = 64, h = 64, data = new Uint8Array(w * h * 4);
    for (let k = 0; k < w * h; k++) data.set([100, 100, 100, 255], k * 4); // 100 is between the 5-bit levels 99 and 107
    ditherTo565(data, w, h);
    const reds = new Set<number>();
    let sum = 0;
    for (let k = 0; k < w * h; k++) { reds.add(data[k * 4]!); sum += data[k * 4]!; }
    expect([...reds].sort((a, b) => a - b)).toEqual([99, 107]);
    expect(sum / (w * h)).toBeCloseTo(100, 0);
  });
  it('the composite applies it per region: rebuilding one region gives the same texels as rebuilding everything', () => {
    const build = (): CharacterComposite => {
      const composite = new CharacterComposite();
      applyCharacterSkin(composite, DEFAULT_SKIN);
      composite.rebuild();
      return composite;
    };
    const stepwise = build();
    applyCharacterSkin(stepwise, { ...DEFAULT_SKIN, faceType: 1 });
    expect(stepwise.rebuild()).toEqual(['head']);
    const fresh = new CharacterComposite();
    applyCharacterSkin(fresh, { ...DEFAULT_SKIN, faceType: 1 });
    fresh.rebuild();
    let different = 0;
    for (let k = 0; k < fresh.texels!.length; k++) if (fresh.texels![k] !== stepwise.texels![k]) different++;
    expect(different).toBe(0);
  });
});

describe('character skin → sections → dirty groups', () => {
  const start = (): CharacterComposite => {
    const composite = plain();
    applyCharacterSkin(composite, DEFAULT_SKIN);
    composite.rebuild();
    return composite;
  };
  it('applying the same look twice dirties nothing', () => {
    const composite = start();
    applyCharacterSkin(composite, DEFAULT_SKIN);
    expect(composite.dirtyGroups).toEqual([]);
  });
  it('a new face dirties the head only', () => {
    const composite = start();
    applyCharacterSkin(composite, { ...DEFAULT_SKIN, faceType: 1 });
    expect(composite.dirtyGroups).toEqual(['head']);
  });
  it('a new skin tone dirties every skin group and none of the others', () => {
    const composite = start();
    applyCharacterSkin(composite, { ...DEFAULT_SKIN, skinColor: 2 });
    expect(composite.dirtyGroups).toEqual(['torso', 'head', 'arms', 'legs', 'hands', 'feet']);
  });
  it('a new hair colour dirties hair and facial hair; removing the underwear dirties torso and legs', () => {
    const composite = start();
    applyCharacterSkin(composite, { ...DEFAULT_SKIN, hairColor: 1 });
    expect(composite.dirtyGroups).toEqual(['hair', 'facialHair']);
    composite.rebuild();
    applyCharacterSkin(composite, { ...DEFAULT_SKIN, hairColor: 1, underwear: false });
    expect(composite.dirtyGroups).toEqual(['torso', 'legs']);
  });
  it('the head shows skin with the face on top: pupils, eye whites, mouth where FACE_LAYOUT says', () => {
    const composite = start(), head = CHARACTER_REGIONS.head, L = FACE_LAYOUT;
    expect(texel(composite, head.x + L.leftEyeX + 2, head.y + L.eyeY + 1).slice(0, 3)).toEqual([...EYE_COLOURS[0]]);
    expect(texel(composite, head.x + L.rightEyeX, head.y + L.eyeY + 1).slice(0, 3)).toEqual([235, 235, 230]);
    expect(texel(composite, head.x + L.mouthX + 3, head.y + L.mouthY).slice(0, 3)).toEqual([150, 70, 70]);
    // The back of the head (three quarters of the way round) is plain skin: within the painted variation of the tone.
    const back = texel(composite, head.x + 96, head.y + 30);
    for (let c = 0; c < 3; c++) expect(Math.abs(back[c]! - SKIN_TONES[0][c]!)).toBeLessThan(30);
    applyCharacterSkin(composite, { ...DEFAULT_SKIN, faceType: 1 });
    composite.rebuild();
    expect(texel(composite, head.x + L.leftEyeX + 2, head.y + L.eyeY + 1).slice(0, 3)).toEqual([...EYE_COLOURS[1]]);
  });
  it('underwear is a band at the bottom of the torso and the top of the legs', () => {
    const composite = start(), torso = CHARACTER_REGIONS.torso, leg = CHARACTER_REGIONS.leftLeg;
    const blueish = (p: number[]): boolean => p[2]! > p[0]! && Math.abs(p[2]! - UNDERWEAR_COLOUR[2]) < 25;
    expect(blueish(texel(composite, torso.x + 40, torso.y + 90))).toBe(true);
    expect(blueish(texel(composite, torso.x + 40, torso.y + 20))).toBe(false);
    expect(blueish(texel(composite, leg.x + 10, leg.y + 5))).toBe(true);
    expect(blueish(texel(composite, leg.x + 10, leg.y + 60))).toBe(false);
  });
  it('sections are built once: the same request gives the same object; unknown choices are refused', () => {
    expect(skinSection('torso', 1)).toBe(skinSection('torso', 1));
    expect(skinSection('torso', 1)).not.toBe(skinSection('torso', 2));
    expect(() => skinSection('torso', 9)).toThrow(/no skin tone 9/);
    expect(() => faceSection(5)).toThrow(/no face 5/);
    expect(HAIR_COLOURS).toHaveLength(3);
  });
});

describe('the character scene uses the composite', () => {
  it('reads the texture choices from the URL', () => {
    expect(parseSceneRequest('?scene=model&model=character&skin=2&face=1&hairColor=1&underwear=off&dither=off')).toMatchObject({ skin: { skinColor: 2, faceType: 1, hairColor: 1, underwear: false }, dither: false });
    expect(parseSceneRequest('?scene=model&model=character&skin=7')).toMatchObject({ skin: { skinColor: 0, faceType: 0, hairColor: 0, underwear: true }, dither: true });
  });
  it('gives the model a 256 × 256 texture and replaces it without leaking when the look changes', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character', dither: false });
    scene.render(16 / 9);
    expect(scene.models).toMatchObject({ skin: { skinColor: 0, faceType: 0, hairColor: 0, underwear: true }, textureRebuilt: CHARACTER_DIRTY_GROUP_NAMES, textureRegionsRebuilt: 14 });
    const textures = backend.liveTextureCount;
    const head = CHARACTER_REGIONS.head, L = FACE_LAYOUT;
    expect(scene.characterTexel(head.x + L.leftEyeX + 2, head.y + L.eyeY + 1)!.slice(0, 3)).toEqual([...EYE_COLOURS[0]]);
    // Key 6: the next face. Only the head group is rebuilt (1 region).
    expect(scene.cycleSkin('faceType')).toBe(1);
    expect(scene.models).toMatchObject({ textureRebuilt: ['head'], textureRegionsRebuilt: 15 });
    expect(scene.characterTexel(head.x + L.leftEyeX + 2, head.y + L.eyeY + 1)!.slice(0, 3)).toEqual([...EYE_COLOURS[1]]);
    expect(backend.liveTextureCount).toBe(textures);
    expect(scene.cycleSkin('faceType')).toBe(0);
    expect([scene.cycleSkin('skinColor'), scene.cycleSkin('skinColor'), scene.cycleSkin('skinColor')]).toEqual([1, 2, 0]);
    expect(scene.cycleSkin('hairColor')).toBe(1);
    expect(scene.models.textureRebuilt).toEqual(['hair', 'facialHair']);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Texture: 256 × 256 composite · skin 0 (5) · face 0 (6) · hair colour 1 (7) · last rebuild: hair, facialHair');
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('the tree has no composite', () => {
    const tree = createModelScene(new NullBackend(), {});
    expect(tree.models.skin).toBeUndefined();
    expect(tree.characterTexel(0, 0)).toBeNull();
    expect(tree.cycleSkin('faceType')).toBe(0);
    tree.dispose();
  });
});
