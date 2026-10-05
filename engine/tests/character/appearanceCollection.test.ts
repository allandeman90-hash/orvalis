import { describe, expect, it } from 'vitest';
import {
  isAppearanceUnlocked,
  resolveAppearanceState,
  resolveCollectedEquippedAppearance,
  unlockAppearance,
  validateAppearanceCollection,
  type AppearanceCollectionSnapshot,
  type CharacterBodyContract,
  type EquippedAppearanceState,
  type ItemAppearanceDefinition,
  type ItemAppearanceRegistry,
} from '../../src/character';

const body = (id = 'hero'): CharacterBodyContract => ({
  id,
  modelAsset: `/characters/${id}/body.orvmodel`,
  rigId: 'humanoid-v1',
  compositeLayoutId: 'humanoid-256-v1',
  geosetGroups: { hair: 0, facialHair: 1, gloves: 4, boots: 5, robe: 13, cloak: 15 },
  sockets: {
    head: { bone: 'Head', position: [0, 0, 1.7] },
    leftShoulder: { bone: 'UpperArm.L', position: [-0.3, 0, 1.5] },
    rightShoulder: { bone: 'UpperArm.R', position: [0.3, 0, 1.5] },
    mainHand: { bone: 'Hand.R', position: [0.25, 0, 0.9] },
    offHand: { bone: 'Hand.L', position: [-0.25, 0, 0.9] },
    shield: { bone: 'Forearm.L', position: [-0.3, -0.02, 1.0] },
    back: { bone: 'Chest', position: [0, -0.1, 1.4] },
  },
  customization: {
    skinIds: ['skin-0'],
    faceIds: ['face-0'],
    hairStyleIds: ['hair-0'],
    hairColorIds: ['brown'],
    facialHairStyleIds: ['none'],
  },
});

const endgame: ItemAppearanceDefinition = {
  id: 'endgame',
  textures: [{ region: 'torso', asset: '/appearances/endgame/chest.orvsection.json', alpha: 'key' }],
  geosets: { gloves: 2, boots: 2 },
};

const linen: ItemAppearanceDefinition = {
  id: 'linen',
  textures: [{ region: 'torso', asset: '/appearances/linen/chest.orvsection.json', alpha: 'key' }],
  bodyOverrides: {
    compact: {
      textures: [{ region: 'torso', asset: '/appearances/linen/chest-compact.orvsection.json', alpha: 'key' }],
    },
  },
};

const sword: ItemAppearanceDefinition = {
  id: 'sword',
  attached: [{ socket: 'mainHand', modelAsset: '/appearances/sword/model.orvmodel.json' }],
};

const registry: ItemAppearanceRegistry = { endgame, linen, sword };
const empty: AppearanceCollectionSnapshot = { unlockedAppearanceIds: [] };

describe('V1.3 unlocked appearance collection', () => {
  it('keeps a minimal serializable id list and rejects malformed duplicate/empty ids', () => {
    expect(() => validateAppearanceCollection(empty)).not.toThrow();
    expect(() => validateAppearanceCollection({ unlockedAppearanceIds: ['linen', 'old-retired-id'] })).not.toThrow();
    expect(() => validateAppearanceCollection({ unlockedAppearanceIds: ['linen', 'linen'] })).toThrow(/duplicate appearance id/);
    expect(() => validateAppearanceCollection({ unlockedAppearanceIds: [''] })).toThrow(/must not be empty/);
  });

  it('unlocks only known current appearances, idempotently, without mutating the persisted snapshot', () => {
    const unlocked = unlockAppearance(empty, 'linen', registry);
    expect(unlocked).toEqual({ unlockedAppearanceIds: ['linen'] });
    expect(empty.unlockedAppearanceIds).toEqual([]);
    expect(isAppearanceUnlocked(unlocked, 'linen')).toBe(true);
    expect(unlockAppearance(unlocked, 'linen', registry)).toBe(unlocked);
    expect(() => unlockAppearance(unlocked, 'missing', registry)).toThrow(/cannot unlock unknown appearance/);
  });
});

describe('V1.3 equipped appearance / transmog policy', () => {
  it('always permits the equipped item native appearance when it exists, even if the collection is empty', () => {
    const resolved = resolveCollectedEquippedAppearance({ itemAppearanceId: 'endgame' }, body(), registry, empty);
    expect(resolved.id).toBe('endgame');
    expect(resolved.textures[0]!.asset).toContain('/endgame/');
  });

  it('requires a transmog override to be both known and unlocked', () => {
    const ref = { itemAppearanceId: 'endgame', appearanceOverrideId: 'linen' } as const;
    expect(() => resolveCollectedEquippedAppearance(ref, body(), registry, empty)).toThrow(/transmog appearance "linen" is locked/);

    const collection = unlockAppearance(empty, 'linen', registry);
    const resolved = resolveCollectedEquippedAppearance(ref, body(), registry, collection);
    expect(resolved.id).toBe('linen');
    expect(resolved.textures[0]!.asset).toContain('/linen/');

    expect(() => resolveCollectedEquippedAppearance({ itemAppearanceId: 'endgame', appearanceOverrideId: 'missing' }, body(), registry, collection)).toThrow(/unknown transmog appearance/);
    expect(() => resolveCollectedEquippedAppearance({ itemAppearanceId: 'missing' }, body(), registry, collection)).toThrow(/unknown item appearance/);
  });

  it('still applies the selected appearance body-specific override after collection authorization', () => {
    const collection = unlockAppearance(empty, 'linen', registry);
    const resolved = resolveCollectedEquippedAppearance(
      { itemAppearanceId: 'endgame', appearanceOverrideId: 'linen' },
      body('compact'),
      registry,
      collection,
    );
    expect(resolved.bodyId).toBe('compact');
    expect(resolved.textures[0]!.asset).toContain('chest-compact');
  });

  it('resolves a visual-only multi-slot equipment state without importing gameplay stats', () => {
    const collection = unlockAppearance(empty, 'linen', registry);
    const state: EquippedAppearanceState = {
      chest: { itemAppearanceId: 'endgame', appearanceOverrideId: 'linen' },
      mainHand: { itemAppearanceId: 'sword' },
    };
    const resolved = resolveAppearanceState(state, body(), registry, collection);
    expect(resolved.chest?.id).toBe('linen');
    expect(resolved.mainHand?.id).toBe('sword');
    expect(resolved.mainHand?.attached[0]?.socket).toBe('mainHand');
    expect(Object.keys(resolved).sort()).toEqual(['chest', 'mainHand']);

    const invalidRuntimeState = { ...state, ring: { itemAppearanceId: 'endgame' } } as unknown as EquippedAppearanceState;
    expect(() => resolveAppearanceState(invalidRuntimeState, body(), registry, collection)).toThrow(/unknown equipment slot "ring"/);
  });
});
