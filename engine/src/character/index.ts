export { BASELINE_VARIANT, BODY_GEOSET, characterGeosetSelection, DEFAULT_APPEARANCE, GEOSET_GROUP, GEOSET_GROUP_COUNT, GEOSET_GROUP_SIZE, geosetGroup, geosetId, geosetVariant, geosetVariantsOf, hiddenGeosetsOf, NO_GEOMETRY_EQUIPMENT, visibleGeosets } from './geosets';
export type { CharacterAppearance, CharacterGeometryEquipment, GeosetGroupName, GeosetSelection } from './geosets';
export { buildMannequinModel, MANNEQUIN_BONE, MANNEQUIN_COLOURS, MANNEQUIN_SECTIONS, MANNEQUIN_SKELETON, mannequinTexture } from './mannequin';
export type { Loft } from './mannequin';
export { loftTriangleCount } from '../model';
export { CHARACTER_REGION_NAMES, CHARACTER_REGIONS, CHARACTER_TEXTURE_SIZE } from './textureLayout';
export type { CharacterRegionName, TextureRegion } from './textureLayout';
export { CHARACTER_DIRTY_GROUP_NAMES, CHARACTER_DIRTY_GROUPS, CHARACTER_LAYER_ORDER, CHARACTER_SECTION_TYPE, CharacterComposite, ditherTo565, EQUIPMENT_TEXTURE_LAYERS, quantizeAlpha4 } from './composite';
export type { CharacterDirtyGroup, CharacterLayer, CharacterSection, CharacterSectionType, CompositeOptions, SectionAlpha } from './composite';
export { applyCharacterSkin, DEFAULT_SKIN, EYE_COLOURS, EYE_WHITE, FACE_COUNT, FACE_LAYOUT, faceSection, HAIR_COLOURS, hairSection, LEATHER_COLOUR, leatherSection, MOUTH_COLOUR, SKIN_TONES, skinSection, UNDERWEAR_COLOUR, underwearSection } from './sections';
export type { CharacterSkin } from './sections';
export {
  applyEquipmentTextures, buildAttachedModel, CHARACTER_ATTACHMENTS, CHARACTER_SOCKET, EQUIPMENT_LAYER_OF_SLOT, EQUIPMENT_SLOTS, equipmentAttachments, equipmentGeometry, equipmentOf, ITEM_COLOURS, ITEMS, itemTexture, MANNEQUIN_ATTACHMENTS, OUTFITS, VANGUARD_OUTFIT,
  validateEquipment,
} from './equipment';
export type { AttachedModelKey, CharacterEquipment, EquipmentItem, EquipmentSlot, ItemKey } from './equipment';
export {
  CHARACTER_SOCKET_NAMES, REQUIRED_CHARACTER_SOCKETS, effectiveAppearanceId, resolveEquippedAppearance, resolveItemAppearance,
  validateCharacterBodyContract, validateCharacterRoster, validateItemAppearanceDefinition,
} from './productionContract';
export type {
  CharacterAttachedAppearancePart, CharacterBodyContract, CharacterCustomizationContract, CharacterSocketContract, CharacterSocketName,
  CharacterTextureAppearancePart, CharacterVisibilityRules, EquippedItemAppearanceRef, ItemAppearanceDefinition, ItemAppearancePayload,
  ItemAppearanceRegistry, Quat, ResolvedCharacterAttachment, ResolvedCharacterGeoset, ResolvedItemAppearance, Vec3,
} from './productionContract';
export { bindCharacterBodyAsset } from './assetAdapter';
export type { BoundCharacterBodyAsset, BoundCharacterSocket } from './assetAdapter';
export { ANIMATION_ID, CharacterAnimator } from './animator';
export type { CharacterAnimationState, Locomotion } from './animator';
export { MANNEQUIN_SEQUENCES, mannequinAnimation } from './mannequinAnimation';
export type { MannequinSequenceSpec } from './mannequinAnimation';
