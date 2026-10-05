import { addLoft, type Attachment, loftRing, type LoftShape, MODEL_BLEND, type ModelMesh, ModelMeshBuilder, type ModelTexture } from '../model';
import { type CharacterComposite, type CharacterSection, EQUIPMENT_TEXTURE_LAYERS } from './composite';
import { type CharacterGeometryEquipment, NO_GEOMETRY_EQUIPMENT } from './geosets';
import { MANNEQUIN_BONE } from './mannequin';
import { CHARACTER_REGION_NAMES, CHARACTER_REGIONS, type CharacterRegionName } from './textureLayout';

/**
 * Character equipment (spec §56, §70, §71).
 *
 * FROM THE SPEC: an item dresses a character in up to three ways, and most clothing is the first two:
 *   A. texture-only — painted onto regions of the character's composite texture (8 equipment texture layers);
 *   B. geoset-changing — switches sections of the base model (gloves, boots…);
 *   C. attached — a separate model fastened to an attachment socket (weapon in hand, shield…).
 * One item may combine them.
 *
 * OUR CHOICES (the document does not settle them): the slots and which texture layer each one paints (lower
 * layers are painted first); the socket ids; when two items ask for different variants of the same geoset group
 * the higher one wins; an attached model is authored in the frame of its bone at rest (a socket has no rotation
 * of its own).
 */
export const EQUIPMENT_SLOTS = ['shirt', 'legs', 'chest', 'feet', 'hands', 'belt', 'head', 'shoulders', 'back', 'mainHand', 'offHand'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Texture layer painted by each slot that paints: 0 is painted first. Weapons paint nothing. */
export const EQUIPMENT_LAYER_OF_SLOT: Readonly<Partial<Record<EquipmentSlot, number>>> = { shirt: 0, legs: 1, chest: 2, feet: 3, hands: 4, belt: 5 };

/** Our own socket ids on the mannequin. */
export const CHARACTER_SOCKET = { rightHand: 10, leftForearm: 11, head: 12, leftShoulder: 13, rightShoulder: 14, back: 15 } as const;
export const MANNEQUIN_ATTACHMENTS: readonly Attachment[] = [
  { id: CHARACTER_SOCKET.rightHand, name: 'rightHand', bone: MANNEQUIN_BONE.rightHand, position: [0.262, 0.02, 0.84] },
  { id: CHARACTER_SOCKET.leftForearm, name: 'leftForearm', bone: MANNEQUIN_BONE.leftForearm, position: [-0.3, 0, 1.05] },
];
/** Full equipment socket table. Kept separate so the original P5 fixture assertions remain stable. */
export const CHARACTER_ATTACHMENTS: readonly Attachment[] = [
  ...MANNEQUIN_ATTACHMENTS,
  { id: CHARACTER_SOCKET.head, name: 'head', bone: MANNEQUIN_BONE.head, position: [0, 0.012, 1.69] },
  { id: CHARACTER_SOCKET.leftShoulder, name: 'leftShoulder', bone: MANNEQUIN_BONE.leftUpperArm, position: [-0.205, 0, 1.44] },
  { id: CHARACTER_SOCKET.rightShoulder, name: 'rightShoulder', bone: MANNEQUIN_BONE.rightUpperArm, position: [0.205, 0, 1.44] },
  { id: CHARACTER_SOCKET.back, name: 'back', bone: MANNEQUIN_BONE.chest, position: [0, -0.105, 1.43] },
];

export type AttachedModelKey = 'sword' | 'shield' | 'vanguardHelm' | 'vanguardPauldron' | 'vanguardCape' | 'runeblade' | 'towerShield';
export interface AttachedEquipmentModel { readonly socket: number; readonly model: AttachedModelKey; }

export interface EquipmentItem {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  /** A: sections painted over regions of the composite, on the slot's layer. */
  readonly textures?: readonly CharacterSection[];
  /** B: geoset variants this item needs. */
  readonly geosets?: Partial<CharacterGeometryEquipment>;
  /** Appearance rule for headgear that fully covers the hair. */
  readonly hideHair?: boolean;
  /** C: one or more models fastened to sockets. A shoulder item, for example, owns both pauldrons. */
  readonly attached?: AttachedEquipmentModel | readonly AttachedEquipmentModel[];
}

/** What a character wears: at most one item per slot. */
export type CharacterEquipment = Readonly<Partial<Record<EquipmentSlot, EquipmentItem>>>;

export function validateEquipment(equipment: CharacterEquipment): void {
  for (const slot of Object.keys(equipment) as EquipmentSlot[]) {
    const item = equipment[slot];
    if (!EQUIPMENT_SLOTS.includes(slot)) throw new Error(`equipment: unknown slot "${slot}"`);
    if (!item) continue;
    if (item.slot !== slot) throw new Error(`equipment: "${item.id}" goes in slot ${item.slot}, not ${slot}`);
    const layer = EQUIPMENT_LAYER_OF_SLOT[slot];
    if (item.textures?.length && layer === undefined) throw new Error(`equipment: "${item.id}" paints textures but slot ${slot} has no texture layer`);
    if (layer !== undefined && layer >= EQUIPMENT_TEXTURE_LAYERS) throw new Error(`equipment: slot ${slot} uses layer ${layer}, there are ${EQUIPMENT_TEXTURE_LAYERS}`);
    const regions = new Set<string>();
    for (const section of item.textures ?? []) {
      if (regions.has(section.region)) throw new Error(`equipment: "${item.id}" paints region ${section.region} twice`);
      regions.add(section.region);
    }
  }
}

/**
 * A: puts every painted section of the equipment into the composite — and takes away what is no longer worn.
 * Only what differs from what is already there becomes dirty.
 */
export function applyEquipmentTextures(composite: CharacterComposite, equipment: CharacterEquipment): void {
  validateEquipment(equipment);
  for (const slot of EQUIPMENT_SLOTS) {
    const layer = EQUIPMENT_LAYER_OF_SLOT[slot];
    if (layer === undefined) continue;
    const sections = new Map<CharacterRegionName, CharacterSection>((equipment[slot]?.textures ?? []).map((section) => [section.region, section]));
    for (const region of CHARACTER_REGION_NAMES) composite.setSection(`equipment${layer}` as `equipment${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`, region, sections.get(region) ?? null);
  }
}

/** B: the geoset variants the equipment asks for (1 = bare when nothing asks). */
export function equipmentGeometry(equipment: CharacterEquipment): CharacterGeometryEquipment {
  let { gloves, boots } = NO_GEOMETRY_EQUIPMENT;
  for (const slot of EQUIPMENT_SLOTS) {
    const wanted = equipment[slot]?.geosets;
    gloves = Math.max(gloves, wanted?.gloves ?? 1);
    boots = Math.max(boots, wanted?.boots ?? 1);
  }
  return { gloves, boots };
}

/** C: the models to fasten, in slot order. */
export function equipmentAttachments(equipment: CharacterEquipment): Array<{ slot: EquipmentSlot; socket: number; model: AttachedModelKey }> {
  const out: Array<{ slot: EquipmentSlot; socket: number; model: AttachedModelKey }> = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const attached = equipment[slot]?.attached;
    if (!attached) continue;
    const parts: readonly AttachedEquipmentModel[] = Array.isArray(attached) ? attached : [attached as AttachedEquipmentModel];
    for (const part of parts) out.push({ slot, ...part });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// ORIGINAL items, painted and modelled in code: fixtures that exercise the three categories, not final art.
// ---------------------------------------------------------------------------------------------------------------

export const ITEM_COLOURS = { linen: [120, 150, 190], cloth: [70, 100, 60], leather: [96, 62, 36], belt: [40, 30, 24], buckle: [200, 180, 90], steel: [170, 175, 185], grip: [70, 45, 30], wood: [130, 92, 52], iron: [90, 90, 95], gold: [210, 166, 54], crimson: [128, 28, 42], darkSteel: [52, 61, 78] } as const;

/**
 * A section painted where `covers(s, t)` says so: s goes round the part from 0 to 1 (0.25 = the front), t goes up
 * the part from 0 (its lowest ring) to 1 (its highest). 1-bit alpha: painted texels are opaque, the rest is left.
 */
function paintedSection(name: string, region: CharacterRegionName, colour: readonly number[], covers: (s: number, t: number) => boolean, accent?: { readonly colour: readonly number[]; readonly covers: (s: number, t: number) => boolean }): CharacterSection {
  const { width, height } = CHARACTER_REGIONS[region], data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = x / (width - 1), t = 1 - y / (height - 1);
    if (!covers(s, t)) continue;
    const c = accent?.covers(s, t) ? accent.colour : colour, shade = 0.92 + 0.16 * (((x * 7 + y * 13) % 5) / 4); // a faint weave
    data.set([Math.min(255, c[0]! * shade), Math.min(255, c[1]! * shade), Math.min(255, c[2]! * shade), 255], (y * width + x) * 4);
  }
  return { name, region, data, alpha: 'key' };
}
const everywhere = (): boolean => true;

/** The catalogue of test items. */
export const ITEMS = {
  linenShirt: {
    id: 'linen-shirt', name: 'Linen shirt', slot: 'shirt',
    // The torso above the hips, and short sleeves (the upper part of each arm).
    textures: [paintedSection('linen-shirt-torso', 'torso', ITEM_COLOURS.linen, (_s, t) => t > 0.26 && t < 0.86), paintedSection('linen-shirt-left', 'leftArm', ITEM_COLOURS.linen, (_s, t) => t > 0.6), paintedSection('linen-shirt-right', 'rightArm', ITEM_COLOURS.linen, (_s, t) => t > 0.6)],
  },
  clothTrousers: {
    id: 'cloth-trousers', name: 'Cloth trousers', slot: 'legs',
    textures: [paintedSection('cloth-trousers-hips', 'torso', ITEM_COLOURS.cloth, (_s, t) => t <= 0.26), paintedSection('cloth-trousers-left', 'leftLeg', ITEM_COLOURS.cloth, everywhere), paintedSection('cloth-trousers-right', 'rightLeg', ITEM_COLOURS.cloth, everywhere)],
  },
  leatherVest: {
    id: 'leather-vest', name: 'Leather vest', slot: 'chest',
    // Open at the front: it leaves a strip down the middle of the chest.
    textures: [paintedSection('leather-vest', 'torso', ITEM_COLOURS.leather, (s, t) => t > 0.3 && t < 0.8 && Math.abs(s - 0.25) > 0.04)],
  },
  belt: {
    id: 'belt', name: 'Belt', slot: 'belt',
    textures: [paintedSection('belt', 'torso', ITEM_COLOURS.belt, (_s, t) => t > 0.24 && t < 0.31, { colour: ITEM_COLOURS.buckle, covers: (s) => Math.abs(s - 0.25) < 0.03 })],
  },
  leatherGloves: { id: 'leather-gloves', name: 'Leather gloves', slot: 'hands', geosets: { gloves: 2 } },
  leatherBoots: { id: 'leather-boots', name: 'Leather boots', slot: 'feet', geosets: { boots: 2 } },
  ironSword: { id: 'iron-sword', name: 'Iron sword', slot: 'mainHand', attached: { socket: CHARACTER_SOCKET.rightHand, model: 'sword' } },
  roundShield: { id: 'round-shield', name: 'Round shield', slot: 'offHand', attached: { socket: CHARACTER_SOCKET.leftForearm, model: 'shield' } },
  vanguardHelm: { id: 'vanguard-helm', name: 'Vanguard helm', slot: 'head', hideHair: true, attached: { socket: CHARACTER_SOCKET.head, model: 'vanguardHelm' } },
  vanguardShoulders: { id: 'vanguard-shoulders', name: 'Vanguard pauldrons', slot: 'shoulders', attached: [{ socket: CHARACTER_SOCKET.leftShoulder, model: 'vanguardPauldron' }, { socket: CHARACTER_SOCKET.rightShoulder, model: 'vanguardPauldron' }] },
  vanguardCape: { id: 'vanguard-cape', name: 'Crimson vanguard cape', slot: 'back', attached: { socket: CHARACTER_SOCKET.back, model: 'vanguardCape' } },
  runeblade: { id: 'runeblade', name: 'Runeblade', slot: 'mainHand', attached: { socket: CHARACTER_SOCKET.rightHand, model: 'runeblade' } },
  towerShield: { id: 'tower-shield', name: 'Vanguard tower shield', slot: 'offHand', attached: { socket: CHARACTER_SOCKET.leftForearm, model: 'towerShield' } },
} as const satisfies Record<string, EquipmentItem>;
export type ItemKey = keyof typeof ITEMS;

export function equipmentOf(...keys: ItemKey[]): CharacterEquipment {
  const out: Partial<Record<EquipmentSlot, EquipmentItem>> = {};
  for (const key of keys) {
    const item: EquipmentItem | undefined = ITEMS[key];
    if (!item) throw new Error(`equipment: no item "${String(key)}"`);
    if (out[item.slot]) throw new Error(`equipment: two items for slot ${item.slot} ("${out[item.slot]!.id}" and "${item.id}")`);
    out[item.slot] = item;
  }
  return out;
}

/** Ready-made outfits: 0 = nothing, 1 = clothes, 2 = clothes, leather and arms. */
export const OUTFITS: ReadonlyArray<readonly ItemKey[]> = [[], ['linenShirt', 'clothTrousers', 'belt', 'leatherBoots'], ['linenShirt', 'clothTrousers', 'belt', 'leatherBoots', 'leatherVest', 'leatherGloves', 'ironSword', 'roundShield']];

/** First visual-convergence proof: a deliberately exaggerated endgame silhouette, kept separate from the P5 test outfits. */
export const VANGUARD_OUTFIT: readonly ItemKey[] = ['linenShirt', 'clothTrousers', 'belt', 'leatherBoots', 'leatherVest', 'leatherGloves', 'vanguardHelm', 'vanguardShoulders', 'vanguardCape', 'runeblade', 'towerShield'];

const ITEM_TEXTURE_COLUMNS = ['steel', 'grip', 'wood', 'iron', 'gold', 'crimson', 'darkSteel', 'cloth'] as const;
const ITEM_TEXTURE_SIZE = 16;
const column = (name: (typeof ITEM_TEXTURE_COLUMNS)[number]): { x: number; y: number; width: number; height: number; textureSize: number } => ({ x: ITEM_TEXTURE_COLUMNS.indexOf(name) * 2, y: 0, width: 2, height: ITEM_TEXTURE_SIZE, textureSize: ITEM_TEXTURE_SIZE });
const ROOT = [[0, 255]] as const;
/** Lofts along +y (a blade pointing forward): rings stand in the z–x plane. */
const FORWARD = { u: [0, 0, 1], v: [1, 0, 0] } as const;
/** Lofts along −x (a disc facing the character's left): rings stand in the z–y plane. */
const LEFTWARD = { u: [0, 0, 1], v: [0, 1, 0] } as const;

/**
 * The attached models, in the frame of their socket: the sword is held in the right hand and points forward (+y);
 * the shield is a disc on the left forearm, facing left (−x). One bone each.
 */
export function buildAttachedModel(key: AttachedModelKey): ModelMesh {
  const b = new ModelMeshBuilder();
  b.submesh(0, b.material(0, MODEL_BLEND.opaque));
  const add = (loft: LoftShape, colour: (typeof ITEM_TEXTURE_COLUMNS)[number]): void => addLoft(b, loft, column(colour));
  if (key === 'sword') {
    add({ name: 'grip', sides: 6, ...FORWARD, rings: [loftRing(0, -0.07, 0, 0.018, 0.018, ...ROOT), loftRing(0, -0.05, 0, 0.013, 0.013, ...ROOT), loftRing(0, 0.07, 0, 0.013, 0.013, ...ROOT)] }, 'grip');
    add({ name: 'guard', sides: 6, ...FORWARD, rings: [loftRing(0, 0.07, 0, 0.07, 0.014, ...ROOT), loftRing(0, 0.09, 0, 0.07, 0.014, ...ROOT)] }, 'iron');
    add({ name: 'blade', sides: 6, ...FORWARD, rings: [loftRing(0, 0.09, 0, 0.028, 0.007, ...ROOT), loftRing(0, 0.75, 0, 0.022, 0.006, ...ROOT), loftRing(0, 0.86, 0, 0.003, 0.003, ...ROOT)] }, 'steel');
    return b.build('item-sword', 1);
  }
  if (key === 'shield') {
    // Listed towards −x: the back of the shield (against the arm) first, then its face.
    add({ name: 'shield', sides: 12, ...LEFTWARD, rings: [loftRing(0, 0, 0, 0.22, 0.22, ...ROOT), loftRing(-0.025, 0, 0, 0.22, 0.22, ...ROOT), loftRing(-0.045, 0, 0, 0.19, 0.19, ...ROOT)] }, 'wood');
    add({ name: 'boss', sides: 8, ...LEFTWARD, rings: [loftRing(-0.045, 0, 0, 0.06, 0.06, ...ROOT), loftRing(-0.075, 0, 0, 0.03, 0.03, ...ROOT)] }, 'iron');
    return b.build('item-shield', 1);
  }
  if (key === 'vanguardHelm') {
    add({ name: 'helm shell', sides: 12, rings: [loftRing(0, 0, -0.11, 0.128, 0.14, ...ROOT), loftRing(0, 0, 0.01, 0.148, 0.155, ...ROOT), loftRing(0, -0.002, 0.13, 0.112, 0.12, ...ROOT), loftRing(0, -0.01, 0.2, 0.035, 0.04, ...ROOT)] }, 'darkSteel');
    add({ name: 'helm crest', sides: 6, rings: [loftRing(0, -0.015, 0.12, 0.026, 0.075, ...ROOT), loftRing(0, -0.02, 0.27, 0.018, 0.055, ...ROOT), loftRing(0, -0.025, 0.34, 0.005, 0.015, ...ROOT)] }, 'crimson');
    return b.build('item-vanguard-helm', 1);
  }
  if (key === 'vanguardPauldron') {
    add({ name: 'pauldron', sides: 10, rings: [loftRing(0, 0, -0.06, 0.115, 0.095, ...ROOT), loftRing(0, 0, 0.035, 0.18, 0.135, ...ROOT), loftRing(0, -0.01, 0.13, 0.13, 0.095, ...ROOT), loftRing(0, -0.025, 0.205, 0.035, 0.035, ...ROOT)] }, 'darkSteel');
    add({ name: 'pauldron rim', sides: 10, rings: [loftRing(0, 0, 0.02, 0.184, 0.139, ...ROOT), loftRing(0, 0, 0.045, 0.16, 0.118, ...ROOT)] }, 'gold');
    return b.build('item-vanguard-pauldron', 1);
  }
  if (key === 'vanguardCape') {
    const uv = column('crimson'), tex = (u: number, v: number): [number, number] => [(uv.x + 0.5 + u * (uv.width - 1)) / uv.textureSize, (uv.y + 0.5 + v * (uv.height - 1)) / uv.textureSize];
    const v0 = b.vertex([-0.23, -0.02, 0.04], [0, -1, 0], tex(0, 0), ROOT);
    const v1 = b.vertex([0.23, -0.02, 0.04], [0, -1, 0], tex(1, 0), ROOT);
    const v2 = b.vertex([0.29, -0.07, -0.82], [0, -1, 0], tex(1, 1), ROOT);
    const v3 = b.vertex([-0.29, -0.07, -0.82], [0, -1, 0], tex(0, 1), ROOT);
    b.triangle(v0, v2, v1); b.triangle(v0, v3, v2);
    return b.build('item-vanguard-cape', 1);
  }
  if (key === 'runeblade') {
    add({ name: 'runeblade grip', sides: 8, ...FORWARD, rings: [loftRing(0, -0.12, 0, 0.025, 0.025, ...ROOT), loftRing(0, 0.09, 0, 0.021, 0.021, ...ROOT)] }, 'grip');
    add({ name: 'runeblade guard', sides: 8, ...FORWARD, rings: [loftRing(0, 0.08, 0, 0.17, 0.022, ...ROOT), loftRing(0, 0.12, 0, 0.17, 0.022, ...ROOT)] }, 'gold');
    add({ name: 'runeblade', sides: 6, ...FORWARD, rings: [loftRing(0, 0.12, 0, 0.055, 0.012, ...ROOT), loftRing(0, 1.15, 0, 0.04, 0.009, ...ROOT), loftRing(0, 1.34, 0, 0.004, 0.004, ...ROOT)] }, 'steel');
    return b.build('item-runeblade', 1);
  }
  if (key === 'towerShield') {
    add({ name: 'tower shield', sides: 14, ...LEFTWARD, rings: [loftRing(0, 0, 0, 0.43, 0.29, ...ROOT), loftRing(-0.035, 0, 0, 0.43, 0.29, ...ROOT), loftRing(-0.075, 0, 0, 0.37, 0.24, ...ROOT)] }, 'darkSteel');
    add({ name: 'tower shield boss', sides: 10, ...LEFTWARD, rings: [loftRing(-0.075, 0, 0, 0.105, 0.105, ...ROOT), loftRing(-0.125, 0, 0, 0.045, 0.045, ...ROOT)] }, 'gold');
    return b.build('item-tower-shield', 1);
  }
  throw new Error(`equipment: no attached model "${String(key)}"`);
}

/** 16 × 16 texture atlas for attached gear: eight flat 2-texel columns. */
export function itemTexture(): ModelTexture {
  const data = new Uint8Array(ITEM_TEXTURE_SIZE * ITEM_TEXTURE_SIZE * 4);
  for (let y = 0; y < ITEM_TEXTURE_SIZE; y++) for (let x = 0; x < ITEM_TEXTURE_SIZE; x++) data.set([...ITEM_COLOURS[ITEM_TEXTURE_COLUMNS[x >> 1]!], 255], (y * ITEM_TEXTURE_SIZE + x) * 4);
  return { name: 'items', width: ITEM_TEXTURE_SIZE, height: ITEM_TEXTURE_SIZE, data };
}
