import { describe, expect, it } from 'vitest';
import {
  effectiveAppearanceId, resolveEquippedAppearance, resolveItemAppearance, validateCharacterBodyContract, validateCharacterRoster,
  type CharacterBodyContract, type ItemAppearanceDefinition, type ItemAppearanceRegistry,
} from '../../src/character';

const body = (id: string, gloveGroup = 4): CharacterBodyContract => ({
  id,
  modelAsset: `/characters/${id}/body.orvmodel`,
  rigId: 'humanoid-v1',
  compositeLayoutId: 'humanoid-256-v1',
  geosetGroups: { hair: 0, facialHair: 1, gloves: gloveGroup, boots: 5, robe: 13, cloak: 15 },
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

const vanguard: ItemAppearanceDefinition = {
  id: 'vanguard',
  textures: [{ region: 'torso', asset: '/appearances/vanguard/chest.rgba', alpha: 'key' }],
  geosets: { gloves: 2, boots: 2 },
  attached: [
    { socket: 'head', modelAsset: '/appearances/vanguard/helm.orvmodel' },
    { socket: 'leftShoulder', modelAsset: '/appearances/vanguard/shoulder-left.orvmodel' },
    { socket: 'rightShoulder', modelAsset: '/appearances/vanguard/shoulder-right.orvmodel' },
  ],
  hide: { hair: true, facialHair: true },
};

describe('production character body contract', () => {
  it('requires a complete semantic socket set and validates the eight-body roster', () => {
    const bodies = Array.from({ length: 8 }, (_, index) => body(`body-${index}`));
    expect(() => validateCharacterRoster(bodies)).not.toThrow();
    expect(() => validateCharacterRoster(bodies.slice(0, 7))).toThrow(/expected 8 base bodies/);
    expect(() => validateCharacterRoster([...bodies.slice(0, 7), bodies[0]!])).toThrow(/duplicate body id/);

    const complete = body('incomplete');
    const socketsWithoutBack = Object.fromEntries(Object.entries(complete.sockets).filter(([name]) => name !== 'back')) as CharacterBodyContract['sockets'];
    const incomplete = { ...complete, sockets: socketsWithoutBack };
    expect(() => validateCharacterBodyContract(incomplete)).toThrow(/missing required socket back/);
  });

  it('maps one shared appearance to body-specific geoset groups and sockets', () => {
    const broad = body('broad', 4);
    const compact: CharacterBodyContract = {
      ...body('compact', 7),
      sockets: {
        ...body('compact', 7).sockets,
        leftShoulder: { bone: 'UpperArm.L', position: [-0.22, 0.01, 1.37], scale: [0.85, 0.85, 0.85] },
      },
    };

    const a = resolveItemAppearance(vanguard, broad);
    const b = resolveItemAppearance(vanguard, compact);
    expect(a.geosets.find((entry) => entry.name === 'gloves')).toMatchObject({ group: 4, variant: 2 });
    expect(b.geosets.find((entry) => entry.name === 'gloves')).toMatchObject({ group: 7, variant: 2 });
    expect(a.attached.find((entry) => entry.socket === 'leftShoulder')!.bodySocket.position).toEqual([-0.3, 0, 1.5]);
    expect(b.attached.find((entry) => entry.socket === 'leftShoulder')!.bodySocket.position).toEqual([-0.22, 0.01, 1.37]);
  });

  it('allows exceptional body overrides without duplicating the whole appearance', () => {
    const appearance: ItemAppearanceDefinition = {
      ...vanguard,
      bodyOverrides: {
        compact: {
          attached: [{ socket: 'head', modelAsset: '/appearances/vanguard/helm-compact.orvmodel', scale: [0.9, 0.9, 0.9] }],
          geosets: { gloves: 3 },
          hide: { ears: true },
        },
      },
    };
    const resolved = resolveItemAppearance(appearance, body('compact'));
    expect(resolved.attached).toHaveLength(1);
    expect(resolved.attached[0]!.modelAsset).toContain('helm-compact');
    expect(resolved.geosets.find((entry) => entry.name === 'gloves')!.variant).toBe(3);
    expect(resolved.geosets.find((entry) => entry.name === 'boots')!.variant).toBe(2);
    expect(resolved.hide).toMatchObject({ hair: true, facialHair: true, ears: true });
  });
});

describe('item appearance and transmog separation', () => {
  it('chooses only the visual appearance id when a transmog override exists', () => {
    expect(effectiveAppearanceId({ itemAppearanceId: 'endgame' })).toBe('endgame');
    expect(effectiveAppearanceId({ itemAppearanceId: 'endgame', appearanceOverrideId: 'linen' })).toBe('linen');
  });

  it('resolves the override from a visual registry without mutating gameplay data', () => {
    const registry: ItemAppearanceRegistry = {
      endgame: vanguard,
      linen: { id: 'linen', textures: [{ region: 'torso', asset: '/appearances/linen/chest.rgba', alpha: 'key' }] },
    };
    const gameplayItem = { id: 'sword-of-testing', power: 9001, itemAppearanceId: 'endgame', appearanceOverrideId: 'linen' } as const;
    const resolved = resolveEquippedAppearance(gameplayItem, body('hero'), registry);
    expect(resolved.id).toBe('linen');
    expect(resolved.textures[0]!.asset).toContain('/linen/');
    expect(gameplayItem.power).toBe(9001);
  });

  it('refuses incompatible bodies and missing semantic geosets', () => {
    const onlyBroad: ItemAppearanceDefinition = { ...vanguard, compatibleBodyIds: ['broad'] };
    expect(() => resolveItemAppearance(onlyBroad, body('compact'))).toThrow(/not compatible/);

    const noGloves: CharacterBodyContract = { ...body('no-gloves'), geosetGroups: { hair: 0, facialHair: 1, boots: 5 } };
    expect(() => resolveItemAppearance(vanguard, noGloves)).toThrow(/no geoset group "gloves"/);
  });
});
