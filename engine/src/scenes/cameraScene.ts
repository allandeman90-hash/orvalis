import { buildCottage, type Building, BUILDING_GROUP_FLAG, BUILDING_LIQUID_CELL_STEP, BuildingCollision, BuildingGroupBuilder, type BuildingLiquid, buildingLiquidHeightAt } from '../building';
import { type BuildingInstance, BuildingRenderer } from '../buildingRender';
import { CAMERA_FOLLOW_MODES, CameraArm, CameraFollow, type CameraFollowMode, firstPersonAlpha, type CameraObstacleQuery, CameraMouseControl, type CameraMouseMode, CameraPivot, CameraZoom, OrbitCamera, viewProjectionMatrix } from '../camera';
import { buildMannequinModel, type CharacterAnimationState, CharacterAnimator, characterGeosetSelection, hiddenGeosetsOf, type Locomotion, MANNEQUIN_SKELETON, mannequinAnimation, mannequinTexture } from '../character';
import { mat4, quat } from '../math';
import { computeBoneMatrices } from '../model';
import { type ModelInstance, ModelRenderer } from '../modelRender';
import { type CapsuleShape, defaultCapsule, type GroundProbe, type MovementCollider, resolveCapsule, type TriangleQuery, intentFromDevices, type MovementIntent, type MovementMode, NO_INTENT, PlayerMovement, slopeDegrees, swimEnterDepth, swimExitDepth } from '../movement';
import type { FrameStats, RendererBackend } from '../renderer';
import { LIQUID_TYPE_CODE } from '../terrain';
import type { Scene } from './firstTriangle';
import { TERRAIN_CHUNK_CLEAR } from './terrainChunk';

export interface CameraSceneOptions {
  readonly yawDegrees?: number | undefined;
  readonly pitchDegrees?: number | undefined;
  readonly distance?: number | undefined;
  /** Size of the character (1 = the mannequin as built). The camera's pivot follows it. Default 1. */
  readonly characterScale?: number | undefined;
  /** How the camera comes back behind the character (P7.7). Default 'smart'. */
  readonly followMode?: CameraFollowMode | undefined;
  /** Camera collision (P7.5). Default on. */
  readonly collision?: boolean | undefined;
  /** 'procedural' (default) or 'solid' = flat colours, for exact pixel checks. */
  readonly palette?: 'procedural' | 'solid' | undefined;
}

export interface CameraStats {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  /** Where the zoom is heading; the distance follows at the zoom's speed. */
  readonly requestedDistance: number;
  readonly maxDistance: number;
  readonly eye: readonly [number, number, number];
  readonly pivot: readonly [number, number, number];
  readonly fovYDegrees: number;
  /** The arm (P7.5): the length the zoom wants, whether something blocks it and how far from the pivot. `distance` is the arm drawn. */
  readonly zoomDistance: number;
  readonly blocked: boolean;
  readonly obstacleDistance: number | null;
  readonly collision: boolean;
  /** Movement (P8.1): where the character's feet are, its speed on the ground, and the simulated time so far. */
  readonly position: readonly [number, number, number];
  readonly speed: number;
  readonly simulatedMs: number;
  /** Simulated time spent moving, and the distance covered in it: distance = speed × time, exactly. */
  readonly movingMs: number;
  readonly travelled: number;
  readonly intent: MovementIntent;
  /** The animation playing (P8.1b): stand when still, run when moving forward or sideways, walk when walking or backing. */
  readonly animation: CharacterAnimationState;
  /** Jump and fall (P8.2): on the ground / falling / far fall, the vertical speed, and the present (or last) flight. */
  readonly mode: MovementMode;
  readonly verticalSpeed: number;
  readonly airSeconds: number;
  /** Highest point of the present (or last) flight above where it started. */
  readonly apex: number;
  readonly jumped: boolean;
  /** Flights started (jumps and falls off an edge), and times the character was put back after falling out of the scene. */
  readonly flights: number;
  readonly respawns: number;
  /** The ground (P8.3): slope of the surface under the feet (degrees), a step refused by a slope too steep, sliding down one. */
  readonly slope: number;
  readonly blockedBySlope: boolean;
  readonly sliding: boolean;
  /** Collision (P8.4): the capsule was pushed out of an obstacle in the last step; its radius and height. */
  readonly touching: boolean;
  readonly capsuleRadius: number;
  readonly capsuleHeight: number;
  /** Automatic step-ups so far (P8.5). */
  readonly stepUps: number;
  /** Water (P8.6): depth over the feet, the depths at which swimming starts and stops, held at the surface line. */
  readonly waterDepth: number;
  readonly swimEnterDepth: number;
  readonly swimExitDepth: number;
  readonly atSurface: boolean;
  /** Follow (P7.7): the mode, whether the character is moving, and whether the camera is coming back behind it now. */
  readonly followMode: CameraFollowMode;
  readonly moving: boolean;
  readonly recentering: boolean;
  /** Opacity of the character (P7.6): 1 from afar, fading as the camera closes in, 0 = first person (not drawn). */
  readonly characterAlpha: number;
  readonly firstPerson: boolean;
  /** Height of the pivot above the character's feet now, and where it is heading (P7.4). */
  readonly pivotHeight: number;
  readonly pivotTargetHeight: number;
  readonly characterScale: number;
  /** Height of the character, feet to top, scale included. */
  readonly characterHeight: number;
  /** What the held mouse buttons are doing: nothing, turning the camera alone, or camera and character together. */
  readonly mouseMode: CameraMouseMode;
  /** Compass heading the character faces, degrees. */
  readonly characterYaw: number;
  /** Both buttons held: the character should move forward (the movement itself is Phase 8). */
  readonly moveForward: boolean;
}

export interface CameraScene extends Scene {
  readonly cameraStats: CameraStats;
  readonly orbit: OrbitCamera;
  /** Character → world, as drawn in the last frame. */
  readonly characterMatrix: Float32Array;
  /** A left-button drag in pixels (x to the right, y downwards): the camera alone. */
  drag(dx: number, dy: number): void;
  /** The mouse: buttons now held (1 = left, 2 = right, 3 = both) and the movement since the last event. */
  pointer(buttons: number, dx: number, dy: number): void;
  /** Every mouse button released. */
  releasePointer(): void;
  /**
   * One FIXED simulation step (P8.1): the keys held now (KeyboardEvent.code) and the mouse buttons give the
   * intent; the character turns and moves. Call it from the engine's fixed update.
   */
  fixedStep(stepMs: number, keys: ReadonlySet<string>): void;
  /** Puts the character's feet somewhere else at once (tests, later teleports). */
  placeCharacter(position: readonly [number, number, number]): void;
  /** never → smart → always → never. */
  cycleFollowMode(): CameraFollowMode;
  /** Forces « the character is moving » for the camera's follow, whatever the movement says (tests). */
  setMoving(moving: boolean): void;
  /** Camera collision on / off. Returns true when it is now on. */
  toggleCollision(): boolean;
  /** Changes the character's size (a shape change, a mount…): the pivot moves to its new height at 1.2 yards per second. */
  setCharacterScale(scale: number): void;
  /** Mouse-wheel steps: negative = closer, positive = farther (1 yard each). */
  zoom(steps: number): void;
  /** Advances what runs on real time (the zoom). Call once per frame. */
  advance(dtMs: number): void;
  /** Where a world point fell on the screen in the last frame (fractions 0..1 from the top left). */
  projectWorldToScreen(point: readonly [number, number, number]): [number, number];
}

/** Where the character stands: in front of the cottage's door, facing it (the mannequin faces +y). */
export const CAMERA_SCENE_CHARACTER: readonly [number, number, number] = [0, -8, 0];
/** Sizes the digit keys 1–3 give the character: small, as built, large. */
export const CAMERA_SCENE_CHARACTER_SCALES: readonly number[] = [0.5, 1, 3];
/** Half the side of the square of ground: beyond it there is nothing, the character falls. */
export const CAMERA_SCENE_GROUND_HALF_SIZE = 40;
/** OUR CHOICE (test scene only): fallen this far under the ground, the character is put back at its starting point. */
export const CAMERA_SCENE_RESPAWN_DEPTH = 60;
export const CAMERA_SCENE_GROUND_COLOUR = [70, 110, 60, 255] as const;
export const CAMERA_SCENE_DEFAULT_DISTANCE = 8;

/** A flat square of ground, as a one-group « building » (there is no terrain in this test scene). */
function buildGround(style: 'procedural' | 'solid'): Building {
  const size = 16, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const shade = style === 'solid' ? 1 : 0.85 + 0.3 * ((((x * 7 + y * 13) ^ (x * y)) & 7) / 7);
    data.set([Math.min(255, CAMERA_SCENE_GROUND_COLOUR[0] * shade), Math.min(255, CAMERA_SCENE_GROUND_COLOUR[1] * shade), Math.min(255, CAMERA_SCENE_GROUND_COLOUR[2] * shade), 255], (y * size + x) * 4);
  }
  const b = new BuildingGroupBuilder('ground', BUILDING_GROUP_FLAG.exterior);
  b.batch(0, 'exterior');
  // The square, with a rectangular hole where the pool is dug: four pieces around it.
  const h = CAMERA_SCENE_GROUND_HALF_SIZE, P = CAMERA_SCENE_POOL;
  const piece = (x0: number, x1: number, y0: number, y1: number): void => b.quad([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 4);
  piece(-h, h, -h, P.y0);
  piece(-h, h, P.y1, h);
  piece(-h, P.x0, P.y0, P.y1);
  piece(P.x1, h, P.y0, P.y1);
  return { name: 'fixture-ground', textures: [{ name: `ground-${style}`, width: size, height: size, data }], materials: [{ name: 'ground', flags: 0, blendMode: 0, textures: [0] }], groups: [b.build()] };
}

/**
 * Test ramps (P8.3): four lanes side by side, each a slope rising towards +x up to a platform, then a sheer drop.
 * 30° and 45° are walkable, 50° is exactly the limit (walkable), 55° is too steep.
 */
export const CAMERA_SCENE_RAMPS = {
  /** x where every slope starts, height of the platforms, x where they end. */
  startX: 12, height: 2.4, endX: 24,
  lanes: [{ degrees: 30, y: [-22, -19] }, { degrees: 45, y: [-26, -23] }, { degrees: 50, y: [-30, -27] }, { degrees: 55, y: [-34, -31] }],
} as const;

/** x where the slope of a lane reaches the platform. */
export function rampTopX(degrees: number): number {
  return CAMERA_SCENE_RAMPS.startX + CAMERA_SCENE_RAMPS.height / Math.tan((degrees * Math.PI) / 180);
}

/**
 * Test pool (P8.6), south-west of the cottage: a pit 3 deep dug in the ground, 3 × 3 liquid tiles wide, filled
 * with water up to 0.25 under the ground. From its east edge a 30° slope goes down to the bottom: walk in, walk out.
 */
const POOL_SIZE = 3 * BUILDING_LIQUID_CELL_STEP;
export const CAMERA_SCENE_POOL = { x0: -36, x1: -36 + POOL_SIZE, y0: -36, y1: -36 + POOL_SIZE, depth: 3, waterLevel: -0.25, slopeDegrees: 30 } as const;
/** x where the pool's slope reaches the bottom. */
export const CAMERA_SCENE_POOL_SLOPE_FOOT = CAMERA_SCENE_POOL.x1 - CAMERA_SCENE_POOL.depth / Math.tan((CAMERA_SCENE_POOL.slopeDegrees * Math.PI) / 180);

function buildPool(style: 'procedural' | 'solid'): Building {
  const size = 8, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const shade = style === 'solid' ? 1 : (x + y) % 2 === 0 ? 1 : 0.9;
    data.set([170 * shade, 160 * shade, 130 * shade, 255], (y * size + x) * 4);
  }
  const { x0, x1, y0, y1, depth: D, waterLevel } = CAMERA_SCENE_POOL, foot = CAMERA_SCENE_POOL_SLOPE_FOOT;
  const b = new BuildingGroupBuilder('pool', BUILDING_GROUP_FLAG.exterior);
  b.batch(0, 'exterior');
  b.quad([[x0, y0, -D], [foot, y0, -D], [foot, y1, -D], [x0, y1, -D]], 1); // the bottom
  b.quad([[foot, y0, -D], [x1, y0, 0], [x1, y1, 0], [foot, y1, -D]], 1); // the slope, up to the east edge
  b.quad([[x0, y0, -D], [x0, y1, -D], [x0, y1, 0], [x0, y0, 0]], 1); // west wall, facing +x
  // South and north walls (facing into the pit): a rectangle over the bottom, a triangle beside the slope.
  for (const [y, inward] of [[y0, 1], [y1, -1]] as const) {
    const corners = inward > 0 ? [[foot, y, -D], [x0, y, -D], [x0, y, 0], [x1, y, 0]] as const : [[x0, y, -D], [foot, y, -D], [x1, y, 0], [x0, y, 0]] as const;
    const v = corners.map((p) => b.vertex(p, [0, inward, 0], [p[0], p[2]]));
    b.triangle(v[0]!, v[1]!, v[2]!);
    b.triangle(v[0]!, v[2]!, v[3]!);
  }
  const liquid: BuildingLiquid = { xVerts: 4, yVerts: 4, base: [x0, y0, waterLevel], heights: new Float32Array(16), tiles: new Uint8Array(9).fill(LIQUID_TYPE_CODE.river) };
  return { name: 'fixture-pool', textures: [{ name: `pool-${style}`, width: size, height: size, data }], materials: [{ name: 'pool', flags: 0, blendMode: 0, textures: [0] }], groups: [b.build(undefined, undefined, liquid)] };
}

/**
 * Test steps (P8.5), north-east of the cottage, all met walking towards +x from x = 12: a staircase of four
 * steps 0.5 high and 0.8 deep up to a platform at 2.0; a block exactly 1.0 high (the limit: climbed); a block
 * 1.2 high (too high: a wall).
 */
export const CAMERA_SCENE_STEPS = {
  startX: 12,
  stair: { y: [10, 13], rise: 0.5, tread: 0.8, count: 4, endX: 20 },
  block: { y: [14, 17], height: 1.0, endX: 15 },
  tallBlock: { y: [18, 21], height: 1.2, endX: 15 },
} as const;

function buildSteps(style: 'procedural' | 'solid'): Building {
  const size = 8, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const shade = style === 'solid' ? 1 : (x + y) % 2 === 0 ? 1 : 0.88;
    data.set([120 * shade, 135 * shade, 160 * shade, 255], (y * size + x) * 4);
  }
  const b = new BuildingGroupBuilder('steps', BUILDING_GROUP_FLAG.exterior);
  b.batch(0, 'exterior');
  /** A box standing on the ground: its top and its four sides. */
  const box = (x0: number, x1: number, y0: number, y1: number, h: number): void => {
    b.quad([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]], 1);
    b.quad([[x0, y1, 0], [x0, y0, 0], [x0, y0, h], [x0, y1, h]], 1); // facing −x
    b.quad([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], 1); // facing +x
    b.quad([[x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]], 1); // facing −y
    b.quad([[x1, y1, 0], [x0, y1, 0], [x0, y1, h], [x1, y1, h]], 1); // facing +y
  };
  const S = CAMERA_SCENE_STEPS;
  for (let k = 0; k < S.stair.count; k++) box(S.startX + k * S.stair.tread, S.stair.endX, S.stair.y[0], S.stair.y[1], (k + 1) * S.stair.rise);
  box(S.startX, S.block.endX, S.block.y[0], S.block.y[1], S.block.height);
  box(S.startX, S.tallBlock.endX, S.tallBlock.y[0], S.tallBlock.y[1], S.tallBlock.height);
  return { name: 'fixture-steps', textures: [{ name: `steps-${style}`, width: size, height: size, data }], materials: [{ name: 'step', flags: 0, blendMode: 0, textures: [0] }], groups: [b.build()] };
}

function buildRamps(style: 'procedural' | 'solid'): Building {
  const size = 8, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const shade = style === 'solid' ? 1 : (x + y) % 2 === 0 ? 1 : 0.88;
    data.set([150 * shade, 140 * shade, 125 * shade, 255], (y * size + x) * 4);
  }
  const b = new BuildingGroupBuilder('ramps', BUILDING_GROUP_FLAG.exterior);
  b.batch(0, 'exterior');
  const { startX: x0, height: H, endX: x2 } = CAMERA_SCENE_RAMPS;
  for (const lane of CAMERA_SCENE_RAMPS.lanes) {
    const [y0, y1] = lane.y, x1 = rampTopX(lane.degrees);
    b.quad([[x0, y0, 0], [x1, y0, H], [x1, y1, H], [x0, y1, 0]], 1); // the slope
    b.quad([[x1, y0, H], [x2, y0, H], [x2, y1, H], [x1, y1, H]], 1); // the platform
    b.quad([[x2, y0, 0], [x2, y1, 0], [x2, y1, H], [x2, y0, H]], 1); // the drop at the far end
    // The two sides: a triangle under the slope and a rectangle under the platform.
    for (const [y, out] of [[y0, -1], [y1, 1]] as const) {
      const corners = out < 0 ? [[x0, y, 0], [x2, y, 0], [x2, y, H], [x1, y, H]] as const : [[x2, y, 0], [x0, y, 0], [x1, y, H], [x2, y, H]] as const;
      const v = corners.map((p) => b.vertex(p, [0, out, 0], [p[0], p[2]]));
      b.triangle(v[0]!, v[1]!, v[2]!);
      b.triangle(v[0]!, v[2]!, v[3]!);
    }
  }
  return { name: 'fixture-ramps', textures: [{ name: `ramps-${style}`, width: size, height: size, data }], materials: [{ name: 'ramp', flags: 0, blendMode: 0, textures: [0] }], groups: [b.build()] };
}

/**
 * Camera test scene (Phase 7): the character stands on a flat ground in front of the cottage, and the gameplay
 * camera orbits around a pivot above its feet. P7.1: yaw, pitch (±89°), mouse mapping, projection. P7.2: zoom. P7.3: mouse buttons. P7.4: the pivot's height follows the model. P7.5: the camera's arm is stopped by the buildings and the ground. P7.6: the character fades out near the camera. P7.7: follow modes.
 */
export function createCameraScene(backend: RendererBackend, options: CameraSceneOptions = {}): CameraScene {
  const style = options.palette ?? 'procedural';
  const buildings = new BuildingRenderer(backend, 'camera-scene');
  const identity = mat4.identity(mat4.create());
  const ground = buildGround(style), cottage = buildCottage(style), ramps = buildRamps(style), steps = buildSteps(style), pool = buildPool(style);
  const instances: BuildingInstance[] = [{ building: buildings.addBuilding(ground), matrix: identity }, { building: buildings.addBuilding(cottage), matrix: identity }, { building: buildings.addBuilding(ramps), matrix: identity }, { building: buildings.addBuilding(steps), matrix: identity }, { building: buildings.addBuilding(pool), matrix: identity }];
  // What can block the camera here: the CAMERA collision faces of the two buildings (neither is moved: their space
  // is the world's). The nearest of the two wins.
  const blockers = [new BuildingCollision(ground), new BuildingCollision(cottage), new BuildingCollision(ramps), new BuildingCollision(steps), new BuildingCollision(pool)];
  const firstObstacle: CameraObstacleQuery = (origin, direction, maxDistance) => {
    let nearest: number | null = null;
    for (const blocker of blockers) {
      const hit = blocker.raycast(origin, direction, nearest ?? maxDistance, 'camera');
      if (hit && (nearest === null || hit.distance < nearest)) nearest = hit.distance;
    }
    return nearest;
  };
  const arm = new CameraArm();
  const follow = new CameraFollow(options.followMode ?? 'smart');
  let moving = false;
  // The ground probe (P8.3): a ray straight down against the PLAYER collision faces of everything in the scene.
  const DOWN = [0, 0, -1] as const;
  const groundProbe: GroundProbe = (x, y, fromZ, maxDrop) => {
    let best: { height: number; normal: [number, number, number] } | null = null;
    for (const blocker of blockers) {
      const hit = blocker.raycast([x, y, fromZ], DOWN, maxDrop, 'player');
      if (!hit || (best !== null && hit.point[2] <= best.height)) continue;
      // The geometric normal follows the winding: make it point up, whichever side the triangle was built from.
      const up = hit.normal[2] < 0 ? -1 : 1;
      // On a LEVEL triangle the height is the triangle's own, exactly (origin − distance would carry a rounding
      // error of 1e-17: feet « at 0 » must be at 0).
      const group = blocker.building.groups[hit.group]!, corner = (k: number): number => group.positions[group.indices[hit.triangle * 3 + k]! * 3 + 2]!;
      const level = corner(0) === corner(1) && corner(1) === corner(2);
      best = { height: level ? corner(0) : hit.point[2], normal: [hit.normal[0] * up, hit.normal[1] * up, hit.normal[2] * up] };
    }
    return best;
  };
  // The collision capsule (P8.4): against the same PLAYER faces. Its size follows the character's (spec §203:
  // the dimensions depend on the model; here the document's fallback, times the character's scale — our choice).
  const nearTriangles: TriangleQuery = (min, max, visit) => {
    for (const blocker of blockers) blocker.trianglesInBox(min, max, 'player', (p, a, b, c) => visit([p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!], [p[b * 3]!, p[b * 3 + 1]!, p[b * 3 + 2]!], [p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!]));
  };
  let capsule: CapsuleShape = defaultCapsule();
  const collider: MovementCollider = (at, horizontalOnly, lift) => resolveCapsule(at, lift === undefined ? capsule : { ...capsule, lift }, nearTriangles, { horizontalOnly });
  // The water (P8.6): the pool's liquid surface; the swim threshold follows the capsule's height.
  const poolLiquid = pool.groups[0]!.liquid!;
  let liquidTimeMs = 0;
  const movement = new PlayerMovement(CAMERA_SCENE_CHARACTER, 0, 1, groundProbe, collider, { surfaceAt: (x, y) => buildingLiquidHeightAt(poolLiquid, x, y), collisionHeight: () => capsule.height });
  let flights = 0, respawns = 0;
  let simulatedMs = 0, movingMs = 0, travelled = 0, lastIntent: MovementIntent = NO_INTENT;
  let collide = options.collision ?? true;
  const models = new ModelRenderer(backend, 'camera-scene-model');
  const mesh = buildMannequinModel();
  const character: { -readonly [K in keyof ModelInstance]: ModelInstance[K] } = {
    model: models.addModel(mesh, mannequinTexture()),
    matrix: mat4.fromTranslation(mat4.create(), new Float32Array(CAMERA_SCENE_CHARACTER)),
    palette: new Float32Array(MANNEQUIN_SKELETON.bones.length * 16),
    hiddenGeosets: new Set(hiddenGeosetsOf(mesh, characterGeosetSelection({ hairStyle: 1, facialHair: 1 }, { gloves: 1, boots: 1 }))),
  };
  const feet = movement.state.position;
  // The animation follows the movement (P8.1b). OUR CHOICE: backing up plays the walk (there is no backwards run).
  const animator = new CharacterAnimator(mannequinAnimation());
  // (There is no swim animation yet: in the water the mannequin plays « walk » when it moves — a placeholder.)
  const locomotionNow = (): Locomotion => (movement.swimming ? (movement.moving || movement.state.verticalVelocity !== 0 ? 'walk' : 'stand') : !movement.moving ? 'stand' : lastIntent.walk || lastIntent.forward < 0 ? 'walk' : 'run');
  const pose = (): void => {
    computeBoneMatrices(MANNEQUIN_SKELETON, animator.poses(), character.palette);
  };
  pose();
  const zoom = new CameraZoom({ distance: options.distance ?? CAMERA_SCENE_DEFAULT_DISTANCE });
  // The pivot's height comes from the model: its top above its feet (rest pose), times the character's scale.
  let modelTop = 0;
  for (let v = 0; v < mesh.vertexCount; v++) modelTop = Math.max(modelTop, mesh.positions[v * 3 + 2]!);
  let characterScale = options.characterScale ?? 1;
  const checkScale = (scale: number): void => {
    if (!(scale > 0) || !Number.isFinite(scale)) throw new Error(`scene: the character scale must be finite and > 0 (got ${scale})`);
  };
  checkScale(characterScale);
  capsule = { ...capsule, radius: defaultCapsule().radius * characterScale, height: defaultCapsule().height * characterScale };
  const pivot = new CameraPivot();
  pivot.setModelHeight(modelTop * characterScale);
  const orbit = new OrbitCamera({ yawDegrees: options.yawDegrees ?? 0, pitchDegrees: options.pitchDegrees ?? 20, distance: zoom.actualDistance, pivot: [feet[0], feet[1], feet[2] + pivot.height] });
  const mouse = new CameraMouseControl(orbit, 0);
  // The mannequin faces +y (north): a compass heading turns it clockwise seen from above.
  const facing = quat.create(), turn = mat4.create();
  /** Rewrites the character's matrix every frame: its place (it moves), its heading and its size. */
  const faceCharacter = (): void => {
    quat.toMat4(turn, quat.fromAxisAngle(facing, new Float32Array([0, 0, 1]), (-mouse.characterYaw * Math.PI) / 180));
    for (let k = 0; k < 12; k++) turn[k] = turn[k]! * characterScale; // uniform scale
    turn[12] = feet[0];
    turn[13] = feet[1];
    turn[14] = feet[2];
    character.matrix.set(turn);
  };
  const mvp = mat4.create();

  return {
    orbit,
    get characterMatrix(): Float32Array {
      return character.matrix;
    },
    get cameraStats(): CameraStats {
      const eye = orbit.lookAt.eye;
      return { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance, requestedDistance: zoom.requestedDistance, maxDistance: zoom.maxDistance, eye: [eye[0]!, eye[1]!, eye[2]!], pivot: [orbit.pivot[0], orbit.pivot[1], orbit.pivot[2]], fovYDegrees: (orbit.lookAt.fovY * 180) / Math.PI, mouseMode: mouse.mode, characterYaw: mouse.characterYaw, moveForward: mouse.moveForward, position: [feet[0], feet[1], feet[2]], speed: movement.speed, simulatedMs, movingMs, travelled, intent: lastIntent, animation: animator.state, mode: movement.state.mode, verticalSpeed: movement.state.verticalVelocity, airSeconds: movement.state.airSeconds, apex: movement.state.apexHeight - movement.state.launchHeight, jumped: movement.state.jumped, flights, respawns, slope: slopeDegrees(movement.state.groundNormal), blockedBySlope: movement.state.blockedBySlope, sliding: movement.state.sliding, touching: movement.state.touching, capsuleRadius: capsule.radius, capsuleHeight: capsule.height, stepUps: movement.state.stepUps, waterDepth: movement.state.waterDepth, swimEnterDepth: swimEnterDepth(capsule.height), swimExitDepth: swimExitDepth(capsule.height), atSurface: movement.state.atSurface, followMode: follow.mode, moving: moving || movement.moving, recentering: follow.recentering, characterAlpha: character.alpha ?? 1, firstPerson: (character.alpha ?? 1) === 0, zoomDistance: zoom.actualDistance, blocked: arm.state.blocked, obstacleDistance: arm.state.obstacleDistance ?? null, collision: collide, pivotHeight: pivot.height, pivotTargetHeight: pivot.targetHeight, characterScale, characterHeight: modelTop * characterScale };
    },
    drag(dx: number, dy: number): void {
      orbit.rotateByMouse(dx, dy);
    },
    pointer(buttons: number, dx: number, dy: number): void {
      mouse.update(buttons, dx, dy);
    },
    releasePointer(): void {
      mouse.release();
    },
    zoom(steps: number): void {
      zoom.zoomBy(steps);
    },
    setCharacterScale(scale: number): void {
      checkScale(scale);
      characterScale = scale;
      capsule = { ...defaultCapsule(), radius: defaultCapsule().radius * scale, height: defaultCapsule().height * scale };
      pivot.setModelHeight(modelTop * scale);
    },
    fixedStep(stepMs: number, keys: ReadonlySet<string>): void {
      const steering = mouse.mode === 'steer';
      // Swimming, forward goes where the camera looks (spec §210): looking down (+pitch) dives.
      const intent = intentFromDevices({ keys, steering, bothButtons: mouse.moveForward, pitchDegrees: -orbit.pitch });
      lastIntent = intent;
      // ONE heading: the mouse control's (while the right button steers, the character faces where the camera
      // looks — spec §189 — and a quick right drag can turn it between two steps). The movement takes it every step.
      movement.setHeading(mouse.characterYaw);
      const before = movement.state.heading, modeBefore = movement.state.mode;
      movement.step(stepMs, intent);
      // The animation follows: leaving the ground (a jump or an edge) starts the jump, touching it again ends it.
      // (A jump shows at once; a drop off an edge only once it is a FAR fall — spec §202: 0.5 s —, so that going
      // down a stair, one small drop after another, does not flicker into the jump animation.)
      const wasFar = modeBefore === 'fallingFar', inAir = (mode: MovementMode): boolean => mode === 'falling' || mode === 'fallingFar';
      if (!inAir(modeBefore) && inAir(movement.state.mode)) {
        flights++; // from the ground, or out of the water
        if (movement.state.jumped) animator.jump();
      } else if (inAir(modeBefore) && !inAir(movement.state.mode)) animator.land(); // onto the ground, or into the water
      if (!wasFar && movement.state.mode === 'fallingFar' && !movement.state.jumped) animator.jump();
      if (feet[2] < CAMERA_SCENE_CHARACTER[2] - CAMERA_SCENE_RESPAWN_DEPTH) {
        movement.teleport(CAMERA_SCENE_CHARACTER);
        animator.land();
        respawns++;
      }
      simulatedMs += stepMs;
      if (movement.moving) {
        movingMs += stepMs;
        travelled += (movement.speed * stepMs) / 1000;
      }
      if (!steering && intent.turn !== 0) {
        // Turned with the keys: the camera turns with the character, unless the left button holds it elsewhere.
        const delta = ((((movement.state.heading - before) % 360) + 540) % 360) - 180;
        mouse.characterYaw = movement.state.heading;
        if (mouse.mode === 'none') orbit.rotate(delta, 0);
      }
    },
    placeCharacter(position: readonly [number, number, number]): void {
      movement.teleport(position);
    },
    cycleFollowMode(): CameraFollowMode {
      follow.mode = CAMERA_FOLLOW_MODES[(CAMERA_FOLLOW_MODES.indexOf(follow.mode) + 1) % CAMERA_FOLLOW_MODES.length]!;
      return follow.mode;
    },
    setMoving(value: boolean): void {
      moving = value;
    },
    toggleCollision(): boolean {
      collide = !collide;
      return collide;
    },
    advance(dtMs: number): void {
      liquidTimeMs += dtMs;
      animator.setLocomotion(locomotionNow());
      animator.update(dtMs);
      pose();
      // Follow (spec §190): the camera comes back behind the character, unless a button is turning it.
      const yaw = follow.update(dtMs, { cameraYaw: orbit.yaw, characterYaw: mouse.characterYaw, moving: moving || movement.moving, userTurning: mouse.mode !== 'none' });
      if (yaw !== null) orbit.setYaw(yaw);
      const wanted = zoom.update(dtMs);
      orbit.setPivot(feet[0], feet[1], feet[2] + pivot.update(dtMs));
      // The arm is traced from the pivot towards where the camera wants to be (spec §192).
      const f = orbit.forward, back: [number, number, number] = [-f[0], -f[1], -f[2]];
      const obstacle = collide ? firstObstacle([orbit.pivot[0], orbit.pivot[1], orbit.pivot[2]], back, wanted + arm.skin) : null;
      orbit.setDistance(arm.update(wanted, obstacle, dtMs));
      // The character fades out as the camera closes in, down to first person (spec §194).
      character.alpha = firstPersonAlpha(orbit.distance, orbit.lookAt.near);
    },
    projectWorldToScreen(point) {
      const w = mvp[3]! * point[0] + mvp[7]! * point[1] + mvp[11]! * point[2] + mvp[15]!;
      return [((mvp[0]! * point[0] + mvp[4]! * point[1] + mvp[8]! * point[2] + mvp[12]!) / w + 1) / 2, (1 - (mvp[1]! * point[0] + mvp[5]! * point[1] + mvp[9]! * point[2] + mvp[13]!) / w) / 2];
    },
    render(aspect: number): FrameStats {
      viewProjectionMatrix(mvp, orbit.lookAt, aspect, backend.info.depthRange);
      faceCharacter();
      backend.beginFrame(TERRAIN_CHUNK_CLEAR);
      buildings.draw(mvp, instances, { debugMode: 'lit', eye: orbit.lookAt.eye, pass: 'opaque' });
      models.draw(mvp, [character], { debugMode: 'lit', eye: orbit.lookAt.eye });
      buildings.drawLiquids(mvp, instances, { timeMs: liquidTimeMs, eye: orbit.lookAt.eye });
      buildings.draw(mvp, instances, { debugMode: 'lit', eye: orbit.lookAt.eye, pass: 'blended' });
      return backend.endFrame();
    },
    dispose() {
      models.dispose();
      buildings.dispose();
    },
  };
}
