import { type CharacterAnimationState, CharacterAnimator, type Locomotion, mannequinAnimation, EQUIPMENT_SLOTS, applyEquipmentTextures, type AttachedModelKey, buildAttachedModel, type CharacterEquipment, equipmentAttachments, equipmentGeometry, equipmentOf, type ItemKey, itemTexture, CHARACTER_ATTACHMENTS, OUTFITS, VANGUARD_OUTFIT, applyCharacterSkin, type CharacterDirtyGroup, CharacterComposite, type CharacterSkin, DEFAULT_SKIN, FACE_COUNT, HAIR_COLOURS, SKIN_TONES, buildMannequinModel, characterGeosetSelection, GEOSET_GROUP, type GeosetGroupName, geosetId, geosetVariantsOf, hiddenGeosetsOf, MANNEQUIN_SKELETON } from '../character';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, type Mat4, vec3 } from '../math';
import { DEFAULT_UNITS_PER_YARD, RibbonTrail, ribbonTexture, TREE_RIBBON, validateRibbonEmitter, ParticleSystem, particleTexture, TREE_PARTICLE_EMITTERS, validateParticleEmitter, ATTACHMENT_ID, attachmentMatrix, billboardCameraIn, buildOrnamentModel, findAttachment, ORNAMENT, ORNAMENT_SKELETON, ornamentTexture, TREE_ATTACHMENTS, validateAttachments, AnimationPlayer, type BonePose, buildSwatchModel, buildTreeModel, type ModelAnimation, NO_PARENT, type Skeleton, swatchTexture, computeBoneMatrices, modelBounds, skeletonLines, TREE_POSES, TREE_SKELETON, treeAnimation, treeTexture, validateModelAnimation, validateSkinning } from '../model';
import { type ModelId, type ModelInstance, ModelRenderer, ParticleRenderer, RibbonRenderer } from '../modelRender';
import { type BufferHandle, type FrameStats, type ModelDebugMode, POSITION_COLOR_LAYOUT, POSITION_COLOR_MVP_SHADER, POSITION_COLOR_MVP_UNIFORM_BYTES, type RendererBackend } from '../renderer';
import type { Scene } from './firstTriangle';
import { TERRAIN_CHUNK_CLEAR } from './terrainChunk';

export type ModelLayout = 'single' | 'grove' | 'row';

/**
 * Distances (camera → nearest point of the bounding sphere) of the five trees of the 'row' layout: one before the
 * fade of its size class starts (150), three inside it, one beyond its end (200).
 */
export const ROW_DISTANCES = [140, 162.5, 175, 187.5, 205] as const;
/** Directions of the five trees seen from the camera, in degrees right of north. */
export const ROW_BEARINGS = [-8, -4, 0, 4, 8] as const;

/**
 * How long a jumping character stays in the air in this scene before it lands by itself. A stand-in: real jumps
 * will be ended by the movement code when the feet touch the ground (Phase 8).
 */
export const CHARACTER_AIR_MS = 500;

export type ModelKind = 'tree' | 'swatches' | 'character';

/** The variant shown for each geoset group of the character (1 = baseline). */
export type CharacterLook = Readonly<Record<GeosetGroupName, number>>;
export const DEFAULT_CHARACTER_LOOK: CharacterLook = { hair: 1, facialHair: 1, gloves: 1, boots: 1 };

export interface ModelSceneOptions {
  /**
   * 'tree' (default): the skinned, animated tree. 'swatches': the material test card (one swatch per blend mode).
   * 'character': the mannequin, whose sections are switched by geoset (P5.1).
   */
  readonly model?: ModelKind | undefined;
  /**
   * Tree only: hangs an ornament (a camera-facing card on a billboard bone) on the tree's « top » socket.
   * Default false.
   */
  readonly attach?: boolean | undefined;
  /**
   * Tree only: a particle emitter at the tip of each tree. 'sparkles': golden sparks; 'jet': a test pattern
   * without randomness. Default 'off'.
   */
  readonly particles?: ModelParticles | undefined;
  /** Tree only: a ribbon trail left by the tip of each tree as it moves. Default false. */
  readonly ribbon?: boolean | undefined;
  /** Fades models out with distance by size (spec §94). Default true. */
  readonly distanceFade?: boolean | undefined;
  /** Character only: the variant of each geoset group. Default: all baseline. */
  readonly look?: Partial<CharacterLook> | undefined;
  /**
   * Character only: 'stand' (default), 'walk' or 'run' start its animation state machine in that state;
   * 'off' leaves the character in its rest pose, without animation.
   */
  readonly animation?: Locomotion | 'off' | undefined;
  /** Character only: one of the ready-made outfits (0 = nothing, 1 = clothes, 2 = clothes, leather and arms). Default 0. */
  readonly outfit?: number | undefined;
  /** Character only: a visual-convergence preset. 'vanguard' is the first exaggerated endgame/transmog proof. */
  readonly preset?: 'vanguard' | undefined;
  /** Character only: skin tone, face, hair colour, underwear — what its composite texture is made of. */
  readonly skin?: Partial<CharacterSkin> | undefined;
  /** Character only: false = no 5-6-5 reduction and dithering of the composite texture. Default true. */
  readonly dither?: boolean | undefined;
  /** Geoset ids not drawn. */
  readonly hiddenGeosets?: readonly number[] | undefined;
  /**
   * 'single': one tree at the origin. 'grove': three trees, turned and scaled differently. 'row': five trees far
   * away, at the distances ROW_DISTANCES, seen by a level camera looking north — to look at the distance fade.
   * Default 'single'.
   */
  readonly layout?: ModelLayout | undefined;
  readonly debugMode?: ModelDebugMode | undefined;
  /** Default 'procedural'. 'solid' = flat bark and leaf colours, for exact pixel checks. */
  readonly palette?: 'procedural' | 'solid' | undefined;
  /** Degrees below the horizontal the camera looks (negative = from underneath). −89..89, default 15. */
  readonly pitchDegrees?: number | undefined;
  /** Compass direction the camera looks towards (0 = north, 90 = east). Default 30. */
  readonly headingDegrees?: number | undefined;
  /** ≥ 1; larger = closer. Default 1 (everything in view). */
  readonly zoom?: number | undefined;
  /** Draws the skeleton as lines over the model (never hidden by it). Default false. */
  readonly skeleton?: boolean | undefined;
  /**
   * Pose of the model: 'rest' and 'bend' are still, 'sway' and 'gust' are animation sequences.
   * The mesh follows (GPU skinning). Default 'rest'.
   */
  readonly pose?: ModelPose | undefined;
  /**
   * Freezes the animation: its clocks start at this many milliseconds and no longer follow real time
   * (stepAnimation() still moves them). Default: not frozen.
   */
  readonly animTimeMs?: number | undefined;
}

export type ModelParticles = 'off' | 'sparkles' | 'jet';

export const MODEL_POSES = ['rest', 'bend', 'sway', 'gust'] as const;
export type ModelPose = (typeof MODEL_POSES)[number];

export interface ModelAnimationStats {
  /** Name of the sequence playing. */
  readonly sequence: string;
  /** Milliseconds since it started. */
  readonly elapsed: number;
  /** Name of the sequence being faded out, if any, and how far the fade is (1 = done). */
  readonly previous: string | null;
  readonly lambda: number;
  readonly globalTime: number;
  readonly frozen: boolean;
}

export interface ModelStats {
  readonly models: number;
  readonly instances: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly debugMode: ModelDebugMode;
  readonly bones: number;
  readonly skeleton: boolean;
  readonly pose: ModelPose;
  /** Models hung on sockets of other models. */
  readonly attached: number;
  /** Present for the character: the variant shown for each geoset group. */
  readonly look?: CharacterLook;
  /** Present for the character: its texture choices, and what the last change of them made the composite rebuild. */
  readonly skin?: CharacterSkin;
  readonly textureRebuilt?: readonly CharacterDirtyGroup[];
  /** Present for the character: the outfit number (−1 when the items were set one by one) and the ids of what it wears. */
  readonly outfit?: number;
  readonly equipment?: readonly string[];
  /** Present for an animated character: the state of its animation machine and what it is trying to do. */
  readonly characterState?: CharacterAnimationState;
  readonly locomotion?: Locomotion;
  /** Regions of the composite repainted since the scene started. */
  readonly textureRegionsRebuilt?: number;
  /** Which emitter runs, and how many particles are alive in all. */
  readonly particles: ModelParticles;
  readonly liveParticles: number;
  /** Ribbon on / off, and how many committed edges are alive in all. */
  readonly ribbon: boolean;
  readonly ribbonEdges: number;
  /** Present while a sequence plays. */
  readonly animation?: ModelAnimationStats;
}

export interface ModelScene extends Scene {
  readonly models: ModelStats;
  /** lit → normals → weights → bones → lit. */
  cycleDebugMode(): ModelDebugMode;
  /** Skeleton lines on / off. */
  toggleSkeleton(): boolean;
  /** rest → bend → sway → gust → rest. Going from one sequence to another cross-fades. */
  cyclePose(): ModelPose;
  /** off → sparkles → off (tree only). Starting again begins with no particle. */
  toggleParticles(): ModelParticles;
  /** Live particle `index` (0 = oldest) of the first tree: world position and age in seconds — for tests. */
  particleAt(index: number): { position: [number, number, number]; age: number } | null;
  /** Character only: next skin tone, face or hair colour (after the last, back to the first). Returns the new value. */
  cycleSkin(what: 'skinColor' | 'faceType' | 'hairColor'): number;
  /** Animated character only: stand → walk → run → stand. Returns the new intent. */
  cycleLocomotion(): Locomotion;
  setLocomotion(locomotion: Locomotion): void;
  /** Animated character only: jump (it lands by itself after CHARACTER_AIR_MS in the air), attack, land now. */
  characterJump(): boolean;
  characterAttack(): boolean;
  characterLand(): void;
  /** Character only: the next ready-made outfit (after the last, back to none). Returns its number. */
  cycleOutfit(): number;
  /** Character only: wears exactly these items (at most one per slot). */
  setEquipment(items: readonly ItemKey[]): void;
  /** Character only: texel (x, y from the top left) of the composite texture as last rebuilt: [r, g, b, a]. */
  characterTexel(x: number, y: number): number[] | null;
  /** Character only: shows the next variant of a geoset group (after the last one, back to the first). Returns the variant now shown. */
  cycleLook(group: GeosetGroupName): number;
  /** Ribbon on / off (tree only). Starting again begins with no edge. */
  toggleRibbon(): boolean;
  /** Committed edge `index` (0 = oldest) of the first tree's ribbon — for tests. */
  ribbonEdgeAt(index: number): { top: [number, number, number]; bottom: [number, number, number]; age: number } | null;
  /** Ornament on / off (tree only). */
  toggleAttachments(): boolean;
  /** Called once per frame with the real time elapsed; does nothing when the animation is frozen. */
  advanceAnimation(dtMs: number): void;
  /** Moves the animation clocks by `dtMs`, frozen or not. */
  stepAnimation(dtMs: number): void;
  /** The camera of the last frame and the instance matrices, for tests. */
  readonly camera: LookAtCamera;
  readonly instances: readonly ModelInstance[];
  /** Where a WORLD point fell on the screen in the last frame (fractions 0..1 from the top left). */
  projectWorldToScreen(point: readonly [number, number, number]): [number, number];
  /** Per tree instance: the centre of its bounding sphere in the world and its distance fade (1 = fully visible). */
  readonly fades: ReadonlyArray<{ readonly center: [number, number, number]; readonly fade: number }>;
  /** Where a model-space point of the first instance fell on the screen in the last frame: fractions 0..1 from the top left. */
  projectToScreen(point: readonly [number, number, number]): [number, number];
}

/** Model → world: a turn of `yawDegrees` around z (counter-clockwise seen from above), a uniform scale, then a translation. */
export function placementMatrix(x: number, y: number, z: number, yawDegrees: number, scale: number): Mat4 {
  if (!(scale > 0) || ![x, y, z, yawDegrees, scale].every(Number.isFinite)) throw new Error(`placement: values must be finite and the scale > 0 (got ${x}, ${y}, ${z}, ${yawDegrees}, ${scale})`);
  const a = (yawDegrees * Math.PI) / 180, c = Math.cos(a) * scale, s = Math.sin(a) * scale;
  const m = mat4.create();
  m.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, scale, 0, x, y, z, 1]);
  return m;
}

const DEBUG_ORDER: readonly ModelDebugMode[] = ['lit', 'normals', 'weights', 'bones'];

/**
 * P4.1 test scene: the engine's first model (an original low-poly tree, built in code), drawn by ModelRenderer
 * with the terrain's light. Nothing else in the scene: no ground, no sky.
 */
export function createModelScene(backend: RendererBackend, options: ModelSceneOptions = {}): ModelScene {
  const pitch = options.pitchDegrees ?? 15, heading = options.headingDegrees ?? 30, zoom = options.zoom ?? 1;
  if (!(pitch > -90 && pitch < 90)) throw new Error(`scene: pitch must be in −90..90 degrees, both excluded (got ${pitch})`);
  if (!Number.isFinite(heading)) throw new Error(`scene: heading must be finite (got ${heading})`);
  if (!(zoom >= 1) || !Number.isFinite(zoom)) throw new Error(`scene: zoom must be a finite number ≥ 1 (got ${zoom})`);

  const kind = options.model ?? 'tree';
  const mesh = kind === 'tree' ? buildTreeModel() : kind === 'character' ? buildMannequinModel() : buildSwatchModel();
  const skeleton: Skeleton = kind === 'tree' ? TREE_SKELETON : kind === 'character' ? MANNEQUIN_SKELETON : { bones: [{ name: 'root', parent: NO_PARENT, pivot: [0, 0, 0] }] };
  // Geosets not drawn: those asked for, plus — for the character — every section its look does not select.
  // The set is shared by the instances and refilled in place when the look changes.
  const hiddenGeosets = new Set<number>();
  let look: CharacterLook = { ...DEFAULT_CHARACTER_LOOK, ...options.look };
  const variantsOf = (group: GeosetGroupName): number[] => {
    const offered = geosetVariantsOf(mesh, GEOSET_GROUP[group]);
    // Variant 1 always exists as a choice, even when it shows nothing (« no beard »).
    return offered.includes(1) ? offered : [1, ...offered];
  };
  const preset = kind === 'character' ? options.preset : undefined;
  let outfit = kind === 'character' && preset === undefined ? (options.outfit ?? 0) : -1;
  if (kind === 'character' && preset === undefined && !OUTFITS[outfit]) throw new Error(`scene: no outfit ${outfit} (there are ${OUTFITS.length})`);
  let equipment: CharacterEquipment = kind === 'character' && preset === 'vanguard' ? equipmentOf(...VANGUARD_OUTFIT) : equipmentOf(...OUTFITS[Math.max(0, outfit)]!);
  const refreshHidden = (): void => {
    hiddenGeosets.clear();
    for (const id of options.hiddenGeosets ?? []) hiddenGeosets.add(id);
    if (kind !== 'character') return;
    // Geometry: what the equipment needs, or the variant asked for by hand when it is higher.
    const worn = equipmentGeometry(equipment);
    const selection = characterGeosetSelection({ hairStyle: look.hair, facialHair: look.facialHair }, { gloves: Math.max(look.gloves, worn.gloves), boots: Math.max(look.boots, worn.boots) });
    for (const id of hiddenGeosetsOf(mesh, selection)) hiddenGeosets.add(id);
    // Full helmets can explicitly hide the currently selected hair geoset instead of relying on clipping.
    if (equipment.head?.hideHair) hiddenGeosets.add(geosetId(GEOSET_GROUP.hair, look.hair));
  };
  if (kind === 'character') {
    for (const group of Object.keys(DEFAULT_CHARACTER_LOOK) as GeosetGroupName[]) {
      if (!variantsOf(group).includes(look[group])) throw new Error(`scene: the character has no ${group} variant ${look[group]} (it has: ${variantsOf(group).join(', ')})`);
    }
  }
  refreshHidden();
  validateSkinning(mesh, skeleton);
  const bounds = modelBounds(mesh);
  const renderer = new ModelRenderer(backend);
  // The character's texture is a composite of source sections, rebuilt region by region when its look changes.
  const composite = kind === 'character' ? new CharacterComposite({ dither: options.dither ?? true }) : null;
  let skin: CharacterSkin = { ...DEFAULT_SKIN, ...options.skin };
  let textureRebuilt: CharacterDirtyGroup[] = [];
  if (composite) {
    applyCharacterSkin(composite, skin);
    applyEquipmentTextures(composite, equipment);
    textureRebuilt = composite.rebuild();
  }
  const tree = renderer.addModel(mesh, kind === 'tree' ? treeTexture(options.palette ?? 'procedural') : composite ? composite.texture() : swatchTexture());
  // One palette for the scene: every instance shows the same pose. It is refreshed in place when the pose changes.
  const palette = new Float32Array(skeleton.bones.length * 16);
  const layout = options.layout ?? 'single';
  // 'row': the camera stands at the origin, at mid-height of the model, looking north; each tree is placed so that
  // the nearest point of its bounding sphere is at its ROW_DISTANCES entry.
  const rowEye = [0, 0, bounds.center[2]] as const;
  const place = (x: number, y: number, yaw: number, scale: number): ModelInstance => ({ model: tree, matrix: placementMatrix(x, y, 0, yaw, scale), palette, hiddenGeosets });
  const instances: ModelInstance[] =
    layout === 'grove'
      ? [place(0, 0, 0, 1), place(6, 2, 40, 0.8), place(-5, 3, 200, 1.2)]
      : layout === 'row'
        ? ROW_DISTANCES.map((distance, k) => {
            const bearing = (ROW_BEARINGS[k]! * Math.PI) / 180, toCentre = distance + bounds.radius;
            return place(Math.sin(bearing) * toCentre - bounds.center[0], Math.cos(bearing) * toCentre - bounds.center[1], 0, 1);
          })
        : [place(0, 0, 0, 1)];
  const fadeOptions = (options.distanceFade ?? true) ? { unitsPerYard: DEFAULT_UNITS_PER_YARD } : undefined;
  // Ornaments: one per tree, on its « top » socket. Their matrices and palettes are refreshed with the pose
  // (the socket moves with its bone) — each has its own palette because a billboard depends on how its own
  // instance is turned.
  if (kind === 'tree') validateAttachments(TREE_ATTACHMENTS, skeleton.bones.length);
  const socket = findAttachment(TREE_ATTACHMENTS, ATTACHMENT_ID.top);
  const treeCount = instances.length;
  let attach = (options.attach ?? false) && kind === 'tree';
  const ornamentMesh = buildOrnamentModel();
  validateSkinning(ornamentMesh, ORNAMENT_SKELETON);
  let ornament: ModelId | null = null;
  const ornaments: Array<{ model: ModelId; matrix: Mat4; palette: Float32Array }> = [];
  const drawn: ModelInstance[] = [...instances];
  const socketMatrix = mat4.create();
  // Character gear: the attached models of its equipment (category C), one set per instance, each on its socket.
  if (kind === 'character') validateAttachments(CHARACTER_ATTACHMENTS, skeleton.bones.length);
  const gearModels = new Map<AttachedModelKey, ModelId>();
  let gear: Array<{ model: ModelId; matrix: Mat4; socket: (typeof CHARACTER_ATTACHMENTS)[number]; instance: number }> = [];
  const refreshDrawn = (): void => {
    drawn.length = treeCount;
    if (attach) drawn.push(...ornaments);
    drawn.push(...gear);
  };
  const refreshGear = (): void => {
    gear = [];
    if (kind !== 'character') return;
    for (const wanted of equipmentAttachments(equipment)) {
      let model = gearModels.get(wanted.model);
      if (model === undefined) {
        model = renderer.addModel(buildAttachedModel(wanted.model), itemTexture());
        gearModels.set(wanted.model, model);
      }
      for (let k = 0; k < treeCount; k++) gear.push({ model, matrix: mat4.create(), socket: findAttachment(CHARACTER_ATTACHMENTS, wanted.socket), instance: k });
    }
    refreshDrawn();
  };
  const setAttached = (on: boolean): void => {
    attach = on && kind === 'tree';
    if (attach && ornament === null) {
      ornament = renderer.addModel(ornamentMesh, ornamentTexture());
      for (let k = 0; k < treeCount; k++) ornaments.push({ model: ornament, matrix: mat4.create(), palette: new Float32Array(ORNAMENT_SKELETON.bones.length * 16) });
    }
    refreshDrawn();
  };
  setAttached(attach);
  refreshGear();
  // Particles: one system per tree, fed by the top bone of ITS tree.
  let particles: ModelParticles = kind === 'tree' ? (options.particles ?? 'off') : 'off';
  let emitters: ParticleRenderer[] = [];
  const emitterMatrix = mat4.create();
  const setParticles = (which: ModelParticles): void => {
    for (const item of emitters) item.dispose();
    particles = kind === 'tree' ? which : 'off';
    if (particles === 'off') {
      emitters = [];
      return;
    }
    const emitter = TREE_PARTICLE_EMITTERS[particles];
    validateParticleEmitter(emitter, skeleton.bones.length);
    emitters = instances.map((_, k) => new ParticleRenderer(backend, new ParticleSystem(emitter, k + 1), particleTexture(particles === 'jet' ? 'solid' : 'soft'), `particles-${k}`));
  };
  setParticles(particles);
  // Ribbons: one trail per tree, following the top bone of ITS tree.
  let ribbons: RibbonRenderer[] = [];
  const setRibbon = (on: boolean): void => {
    for (const item of ribbons) item.dispose();
    ribbons = [];
    if (!on || kind !== 'tree') return;
    validateRibbonEmitter(TREE_RIBBON, skeleton.bones.length);
    ribbons = instances.map((_, k) => new RibbonRenderer(backend, new RibbonTrail(TREE_RIBBON), ribbonTexture(options.palette === 'solid' ? 'solid' : 'fade'), `ribbon-${k}`));
  };
  setRibbon(options.ribbon ?? false);
  let debugMode: ModelDebugMode = options.debugMode ?? 'lit';
  let showSkeleton = options.skeleton ?? false;
  let pose: ModelPose = options.pose ?? 'rest';
  if (!MODEL_POSES.includes(pose)) throw new Error(`scene: unknown pose "${String(pose)}"`);
  const animTime = options.animTimeMs;
  if (animTime !== undefined && (!(animTime >= 0) || !Number.isFinite(animTime))) throw new Error(`scene: animTime must be a finite number ≥ 0 (got ${animTime})`);
  const frozen = animTime !== undefined;
  // Only the tree is animated; the test card has one bone that never moves.
  const animated = kind === 'character' && (options.animation ?? 'stand') !== 'off';
  const animation: ModelAnimation = kind === 'tree' ? treeAnimation() : animated ? mannequinAnimation() : { sequences: [], boneTracks: skeleton.bones.map(() => undefined), globalSequences: [] };
  validateModelAnimation(animation, skeleton.bones.length);
  // The character is driven by its state machine; the tree by a plain sequence player.
  const animator = animated ? new CharacterAnimator(animation, (options.animation ?? 'stand') as Locomotion) : null;
  const player = animator ? animator.player : new AnimationPlayer(animation);
  if (animator) animator.update(animTime ?? 0);
  const sequenceOf = (name: ModelPose): number => animation.sequences.findIndex((sequence) => sequence.name === name);
  if (sequenceOf(pose) >= 0) {
    player.play(sequenceOf(pose));
    player.advance(animTime ?? 0);
  }
  // The test poses are the tree's: any other model stays at rest.
  const currentPoses = (): ReadonlyArray<BonePose | undefined> => (animator ? animator.poses() : kind !== 'tree' ? [] : pose === 'rest' || pose === 'bend' ? TREE_POSES[pose] : player.poses());

  // Skeleton lines: one small buffer for the current pose (model space), drawn once per instance, on top of everything.
  const linePipeline = backend.createPipeline({ shader: POSITION_COLOR_MVP_SHADER, vertexLayout: POSITION_COLOR_LAYOUT, uniformBytes: POSITION_COLOR_MVP_UNIFORM_BYTES, topology: 'line-list', depthTest: false, depthWrite: false, label: 'skeleton-lines' });
  let lineBuffer: BufferHandle | null = null, lineVertices = 0;
  const lineMvp = mat4.create();
  // One line buffer, created at the first use and updated in place when the pose changes (its size never does).
  let linesStale = true, paletteStale = true;
  const refreshPalette = (): void => {
    computeBoneMatrices(skeleton, currentPoses(), palette);
    paletteStale = false;
    // Gear follows its socket: child → world = instance × (bone × socket position).
    for (const item of gear) mat4.multiply(item.matrix, instances[item.instance]!.matrix, attachmentMatrix(socketMatrix, item.socket, palette));
    if (!attach) return;
    // child model → world = tree instance × (bone × socket position); then its billboard bone faces the camera.
    const forward = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), camera.target, camera.eye));
    const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), forward, camera.up));
    const up = vec3.cross(vec3.create(), right, forward);
    const axes = [right, up, forward].map((v) => [v[0]!, v[1]!, v[2]!] as const);
    attachmentMatrix(socketMatrix, socket, palette);
    ornaments.forEach((item, k) => {
      mat4.multiply(item.matrix, instances[k]!.matrix, socketMatrix);
      computeBoneMatrices(ORNAMENT_SKELETON, [], item.palette, billboardCameraIn(item.matrix, axes[0]!, axes[1]!, axes[2]!));
    });
  };
  const rebuildLines = (): void => {
    const data = skeletonLines(skeleton, palette);
    if (lineBuffer === null) lineBuffer = backend.createBuffer({ usage: 'vertex', data, label: 'skeleton-lines' });
    else backend.updateBuffer(lineBuffer, data);
    lineVertices = data.length / 6;
    linesStale = false;
  };
  const step = (dtMs: number): void => {
    if (animator) {
      animator.update(dtMs);
      // Stand-in for the ground: after a while in the air (time spent in the Jump loop itself), the character lands.
      if (animator.state === 'jump' && animator.player.state.elapsed >= CHARACTER_AIR_MS) animator.land();
      if (dtMs > 0) linesStale = paletteStale = true;
    } else {
      player.advance(dtMs);
      if (pose !== 'rest' && pose !== 'bend' && dtMs > 0) linesStale = paletteStale = true;
    }
    if ((emitters.length === 0 && ribbons.length === 0) || !(dtMs > 0)) return;
    // Emitters are where their bone is NOW (at the end of the step).
    if (paletteStale) refreshPalette();
    const feed = (bone: number, k: number): Mat4 => mat4.multiply(emitterMatrix, instances[k]!.matrix, palette.subarray(bone * 16, bone * 16 + 16));
    emitters.forEach((item, k) => item.system.update(dtMs / 1000, feed(item.system.emitter.bone, k)));
    ribbons.forEach((item, k) => item.trail.update(dtMs / 1000, feed(item.trail.emitter.bone, k)));
  };

  // The camera looks at the centre of the first tree, from far enough to see everything.
  // With an ornament asked for from the start, the view also has to hold it (it sits above the tree's own bounds).
  const ornamentReach = Math.hypot(socket.position[0] - bounds.center[0], socket.position[1] - bounds.center[1], socket.position[2] - bounds.center[2]) + Math.SQRT2 * ORNAMENT.halfSize;
  // Likewise for particles asked for from the start: they travel up to about 2.2 above the tip (OUR framing margin).
  const particleReach = particles === 'off' ? 0 : Math.hypot(0, 0, TREE_PARTICLE_EMITTERS[particles].position[2] - bounds.center[2]) + 2.2;
  // The character's view always leaves room for what it may hold (a sword reaches 0.9 in front of the hand).
  const reach = (instances.length > 1 ? 3.2 : 1.35) * Math.max(bounds.radius, attach ? ornamentReach : 0, particleReach, kind === 'character' ? 1.7 : 0);
  const distance = (reach / Math.tan(Math.PI / 6)) / zoom;
  const p = (pitch * Math.PI) / 180, h = (heading * Math.PI) / 180;
  const target = layout === 'row' ? vec3.create(rowEye[0], rowEye[1] + 1, rowEye[2]) : vec3.create(bounds.center[0], bounds.center[1], bounds.center[2]);
  const eye = layout === 'row' ? vec3.create(rowEye[0], rowEye[1], rowEye[2]) : vec3.create(target[0]! - Math.cos(p) * Math.sin(h) * distance, target[1]! - Math.cos(p) * Math.cos(h) * distance, target[2]! + Math.sin(p) * distance);
  // 'row': a narrow view (the trees are far and small) reaching past the last tree.
  const camera: LookAtCamera = layout === 'row' ? { eye, target, up: WORLD_UP, fovY: Math.PI / 12, near: 1, far: 400 } : { eye, target, up: WORLD_UP, fovY: Math.PI / 3, near: distance / 100, far: distance * 10 };
  const mvp = mat4.create();
  let lastTriangles = 0;
  // A frozen start time also applies to the particles: they are the ones emitted during that time.
  if (emitters.length > 0 && animTime !== undefined && animTime > 0) {
    const elapsed = animTime;
    refreshPalette();
    const bone = emitters[0]!.system.emitter.bone;
    emitters.forEach((item, k) => {
      mat4.multiply(emitterMatrix, instances[k]!.matrix, palette.subarray(bone * 16, bone * 16 + 16));
      item.system.update(elapsed / 1000, emitterMatrix);
    });
  }

  return {
    camera,
    instances,
    get models(): ModelStats {
      const state = player.state;
      const playing = state.sequence < 0 ? undefined : { sequence: animation.sequences[state.sequence]!.name, elapsed: state.elapsed, previous: state.previous < 0 ? null : animation.sequences[state.previous]!.name, lambda: state.lambda, globalTime: state.globalTime, frozen };
      return { models: renderer.modelCount, instances: drawn.length, triangles: lastTriangles, vertices: mesh.vertexCount, debugMode, bones: skeleton.bones.length, skeleton: showSkeleton, pose, attached: (attach ? ornaments.length : 0) + gear.length, ...(composite ? { look, skin, textureRebuilt, textureRegionsRebuilt: composite.regionsRebuilt, outfit, equipment: EQUIPMENT_SLOTS.flatMap((slot) => (equipment[slot] ? [equipment[slot].id] : [])) } : {}), particles, liveParticles: emitters.reduce((sum, item) => sum + item.system.count, 0), ribbon: ribbons.length > 0, ribbonEdges: ribbons.reduce((sum, item) => sum + item.trail.count, 0), ...(animator ? { characterState: animator.state, locomotion: animator.locomotion } : {}), ...(playing ? { animation: playing } : {}) };
    },
    cycleDebugMode(): ModelDebugMode {
      debugMode = DEBUG_ORDER[(DEBUG_ORDER.indexOf(debugMode) + 1) % DEBUG_ORDER.length]!;
      return debugMode;
    },
    toggleSkeleton(): boolean {
      showSkeleton = !showSkeleton;
      return showSkeleton;
    },
    cyclePose(): ModelPose {
      pose = MODEL_POSES[(MODEL_POSES.indexOf(pose) + 1) % MODEL_POSES.length]!;
      if (sequenceOf(pose) >= 0) player.play(sequenceOf(pose));
      else player.stop();
      linesStale = paletteStale = true;
      return pose;
    },
    cycleSkin(what: 'skinColor' | 'faceType' | 'hairColor'): number {
      if (!composite) return 0;
      const count = what === 'skinColor' ? SKIN_TONES.length : what === 'faceType' ? FACE_COUNT : HAIR_COLOURS.length;
      skin = { ...skin, [what]: (skin[what] + 1) % count };
      applyCharacterSkin(composite, skin);
      // Only the dirty groups are repainted; the GPU texture is then replaced as a whole (the backend has no
      // partial texture update).
      textureRebuilt = composite.rebuild();
      if (textureRebuilt.length > 0) renderer.setModelTexture(tree, composite.texture());
      return skin[what];
    },
    cycleLocomotion(): Locomotion {
      if (!animator) return 'stand';
      const order: Locomotion[] = ['stand', 'walk', 'run'];
      animator.setLocomotion(order[(order.indexOf(animator.locomotion) + 1) % order.length]!);
      linesStale = paletteStale = true;
      return animator.locomotion;
    },
    setLocomotion(locomotion: Locomotion): void {
      animator?.setLocomotion(locomotion);
      linesStale = paletteStale = true;
    },
    characterJump(): boolean {
      linesStale = paletteStale = true;
      return animator?.jump() ?? false;
    },
    characterAttack(): boolean {
      linesStale = paletteStale = true;
      return animator?.attack() ?? false;
    },
    characterLand(): void {
      animator?.land();
      linesStale = paletteStale = true;
    },
    cycleOutfit(): number {
      if (!composite) return 0;
      const next = (Math.max(outfit, -1) + 1) % OUTFITS.length;
      this.setEquipment(OUTFITS[next]!);
      outfit = next;
      return outfit;
    },
    setEquipment(items: readonly ItemKey[]): void {
      if (!composite) return;
      equipment = equipmentOf(...items);
      outfit = -1;
      // A: painted regions — only the groups that changed are repainted. B: sections of the model. C: attached models.
      applyEquipmentTextures(composite, equipment);
      textureRebuilt = composite.rebuild();
      if (textureRebuilt.length > 0) renderer.setModelTexture(tree, composite.texture());
      refreshHidden();
      refreshGear();
      paletteStale = true;
    },
    characterTexel(x: number, y: number) {
      const texels = composite?.texels;
      if (!texels || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= composite.size || y >= composite.size) return null;
      return Array.from(texels.subarray((y * composite.size + x) * 4, (y * composite.size + x) * 4 + 4));
    },
    cycleLook(group: GeosetGroupName): number {
      if (kind !== 'character') return 1;
      const offered = variantsOf(group);
      look = { ...look, [group]: offered[(offered.indexOf(look[group]) + 1) % offered.length]! };
      refreshHidden();
      return look[group];
    },
    toggleRibbon(): boolean {
      setRibbon(ribbons.length === 0);
      return ribbons.length > 0;
    },
    ribbonEdgeAt(index: number) {
      const trail = ribbons[0]?.trail;
      return trail && index >= 0 && index < trail.count ? trail.edge(index) : null;
    },
    toggleParticles(): ModelParticles {
      setParticles(particles === 'off' ? 'sparkles' : 'off');
      return particles;
    },
    particleAt(index: number) {
      const system = emitters[0]?.system;
      if (!system || index < 0 || index >= system.count) return null;
      const { position, age } = system.particle(index);
      return { position, age };
    },
    toggleAttachments(): boolean {
      setAttached(!attach);
      paletteStale = true;
      return attach;
    },
    advanceAnimation(dtMs: number): void {
      if (!frozen) step(dtMs);
    },
    stepAnimation(dtMs: number): void {
      step(dtMs);
    },
    render(aspect: number): FrameStats {
      viewProjectionMatrix(mvp, camera, aspect, backend.info.depthRange);
      if (paletteStale) refreshPalette();
      backend.beginFrame(TERRAIN_CHUNK_CLEAR);
      lastTriangles = renderer.draw(mvp, drawn, { debugMode, eye, distanceFade: fadeOptions }).triangles;
      if (emitters.length > 0) {
        const forward = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), camera.target, camera.eye));
        const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), forward, camera.up));
        const up = vec3.cross(vec3.create(), right, forward);
        for (const item of emitters) lastTriangles += item.draw(mvp, right, up, eye) * 2;
      }
      for (const item of ribbons) lastTriangles += item.draw(mvp) * 2;
      if (showSkeleton && linesStale) rebuildLines();
      if (showSkeleton && lineBuffer !== null) {
        for (const instance of instances) {
          mat4.multiply(lineMvp, mvp, instance.matrix);
          backend.draw({ pipeline: linePipeline, vertexBuffer: lineBuffer, vertexCount: lineVertices, uniforms: lineMvp });
        }
      }
      return backend.endFrame();
    },
    projectWorldToScreen(point) {
      const w = mvp[3]! * point[0] + mvp[7]! * point[1] + mvp[11]! * point[2] + mvp[15]!;
      return [((mvp[0]! * point[0] + mvp[4]! * point[1] + mvp[8]! * point[2] + mvp[12]!) / w + 1) / 2, (1 - (mvp[1]! * point[0] + mvp[5]! * point[1] + mvp[9]! * point[2] + mvp[13]!) / w) / 2];
    },
    get fades() {
      return instances.map((instance) => {
        const m = instance.matrix, c = bounds.center;
        const center: [number, number, number] = [m[0]! * c[0] + m[4]! * c[1] + m[8]! * c[2] + m[12]!, m[1]! * c[0] + m[5]! * c[1] + m[9]! * c[2] + m[13]!, m[2]! * c[0] + m[6]! * c[1] + m[10]! * c[2] + m[14]!];
        return { center, fade: renderer.fadeOf(instance, { eye, distanceFade: fadeOptions }) };
      });
    },
    projectToScreen(point) {
      const m = mat4.multiply(mat4.create(), mvp, instances[0]!.matrix);
      const w = m[3]! * point[0] + m[7]! * point[1] + m[11]! * point[2] + m[15]!;
      return [((m[0]! * point[0] + m[4]! * point[1] + m[8]! * point[2] + m[12]!) / w + 1) / 2, (1 - (m[1]! * point[0] + m[5]! * point[1] + m[9]! * point[2] + m[13]!) / w) / 2];
    },
    dispose() {
      for (const item of emitters) item.dispose();
      for (const item of ribbons) item.dispose();
      renderer.dispose();
      if (lineBuffer !== null) backend.destroyBuffer(lineBuffer);
      backend.destroyPipeline(linePipeline);
    },
  };
}
