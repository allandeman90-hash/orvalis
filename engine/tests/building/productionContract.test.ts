import { describe, expect, it } from 'vitest';
import {
  BUILDING_BLEND,
  BUILDING_MATERIAL_FLAG,
  resolveBuildingGroupContract,
  resolveEnvironmentMaterial,
  validateBuildingAssetContract,
  type BuildingAssetContract,
} from '../../src/building';

const building = (): BuildingAssetContract => ({
  id: 'inn-small',
  textures: [
    { id: 'wall', asset: '/environment/inn/wall.png' },
    { id: 'window-glow', asset: '/environment/inn/window.png', wrapS: 'clamp', wrapT: 'clamp' },
  ],
  materials: [
    { id: 'wall', flags: 0, blendMode: BUILDING_BLEND.opaque, textureIds: ['wall'] },
    { id: 'window', flags: BUILDING_MATERIAL_FLAG.nightGlow | BUILDING_MATERIAL_FLAG.unculled, blendMode: BUILDING_BLEND.alphaTest, textureIds: ['window-glow'], emissiveColor: [255, 190, 90, 255] },
  ],
  groups: [
    {
      id: 'main-room',
      geometryAsset: '/environment/inn/main-room.ovgroup',
      flags: 0,
      bounds: { min: [-5, -5, 0], max: [5, 5, 4] },
      batches: [
        { firstIndex: 0, indexCount: 6, materialId: 'wall', batchClass: 'interior' },
        { firstIndex: 6, indexCount: 6, materialId: 'window', batchClass: 'exterior' },
      ],
      vertexColorAsset: '/environment/inn/main-room-colors.bin',
      collisionAsset: '/environment/inn/main-room-collision.bin',
      doodadIds: ['chair-1'],
      fogIds: ['room-fog'],
    },
    {
      id: 'porch',
      geometryAsset: '/environment/inn/porch.ovgroup',
      flags: 0x08,
      bounds: { min: [-5, -8, 0], max: [5, -4, 3] },
      batches: [{ firstIndex: 0, indexCount: 6, materialId: 'wall', batchClass: 'exterior' }],
    },
  ],
  doodadModels: [{ id: 'chair', modelAsset: '/environment/props/chair.ovmodel' }],
  doodads: [{ id: 'chair-1', modelId: 'chair', position: [1, 1, 0], rotation: [0, 0, 0, 1], scale: 1, color: [180, 170, 150, 255] }],
  doodadSets: [{ id: 'global', doodadIds: ['chair-1'] }],
  portals: [{ id: 'door', fromGroupId: 'main-room', toGroupId: 'porch', asset: '/environment/inn/door.portal' }],
  fogs: [{ id: 'room-fog', asset: '/environment/inn/room.fog' }],
  localLights: [{ id: 'lamp', kind: 'omni', position: [0, 0, 2], color: [1, 0.8, 0.5], intensity: 1, attenuationStart: 1, attenuationEnd: 8 }],
});

describe('V0.3 production environment contract', () => {
  it('validates one root with independently referenced groups and doodad models', () => {
    expect(() => validateBuildingAssetContract(building())).not.toThrow();
  });

  it('resolves stable material ids to external textures without baking texels into the manifest', () => {
    const material = resolveEnvironmentMaterial(building(), 'window');
    expect(material.textures.map((texture) => texture.id)).toEqual(['window-glow']);
    expect(material.textures[0]!.asset).toBe('/environment/inn/window.png');
    expect(material.flags & BUILDING_MATERIAL_FLAG.nightGlow).not.toBe(0);
  });

  it('resolves a group while preserving ordered batches and material state', () => {
    const group = resolveBuildingGroupContract(building(), 'main-room');
    expect(group.geometryAsset).toContain('main-room.ovgroup');
    expect(group.batches.map((batch) => [batch.firstIndex, batch.batchClass, batch.material.id])).toEqual([
      [0, 'interior', 'wall'],
      [6, 'exterior', 'window'],
    ]);
  });

  it('rejects dangling root references instead of repairing them silently', () => {
    const source = building();
    expect(() => validateBuildingAssetContract({ ...source, materials: [{ ...source.materials[0]!, textureIds: ['missing'] }] })).toThrow(/unknown texture "missing"/);
    expect(() => validateBuildingAssetContract({ ...source, groups: [{ ...source.groups[0]!, batches: [{ firstIndex: 0, indexCount: 6, materialId: 'missing', batchClass: 'interior' }] }, source.groups[1]!] })).toThrow(/unknown material "missing"/);
    expect(() => validateBuildingAssetContract({ ...source, portals: [{ id: 'bad', fromGroupId: 'main-room', toGroupId: 'missing', asset: '/bad.portal' }] })).toThrow(/unknown toGroupId/);
  });

  it('keeps doodad sets and group visibility references data-driven', () => {
    const source = building();
    expect(() => validateBuildingAssetContract({ ...source, doodadSets: [{ id: 'global', doodadIds: ['missing'] }] })).toThrow(/unknown doodad "missing"/);
    expect(() => validateBuildingAssetContract({ ...source, groups: [{ ...source.groups[0]!, doodadIds: [] }, source.groups[1]!] })).toThrow(/listed by no group/);
  });

  it('keeps the WMO-like batch ordering invariant', () => {
    const source = building();
    const bad = {
      ...source.groups[0]!,
      batches: [
        { firstIndex: 0, indexCount: 6, materialId: 'wall', batchClass: 'exterior' as const },
        { firstIndex: 6, indexCount: 6, materialId: 'wall', batchClass: 'interior' as const },
      ],
    };
    expect(() => validateBuildingAssetContract({ ...source, groups: [bad, source.groups[1]!] })).toThrow(/out of class order/);
  });
});
