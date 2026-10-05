import { buildBasin, buildCottage, type Building, FogTransition, type ResolvedFog, selectBuildingFog, floodPortals, type PortalFlood, type CurrentRoom, findCurrentRoom, resolveBuildingLiquidType, BuildingCollision, type CollisionHit, type CollisionKind, buildPropModel, isPropModelName, propTexture } from '../building';
import { BuildingDoodads, type BuildingInstance, BuildingRenderer } from '../buildingRender';
import { ModelRenderer } from '../modelRender';
import { type LookAtCamera, viewProjectionMatrix, WORLD_UP } from '../camera';
import { mat4, vec3 } from '../math';
import type { BuildingDebugMode, FrameStats, ModelDebugMode, RendererBackend } from '../renderer';
import type { Scene } from './firstTriangle';
import { TERRAIN_CHUNK_CLEAR } from './terrainChunk';

export type BuildingView = 'outside' | 'inside';

export type BuildingFixture = 'cottage' | 'basin';
export type BuildingVisibility = 'portals' | 'all';

export interface BuildingSceneOptions {
  /** Which fixture: the cottage (default), or the two basins with their liquids (outside view only). */
  readonly fixture?: BuildingFixture | undefined;
  /**
   * Which groups are drawn: 'portals' (default) = those the portal flood finds from the camera's room;
   * 'all' = every group. Groups hidden by hand stay hidden in both.
   */
  readonly visibility?: BuildingVisibility | undefined;
  /** The building's interior fog (spec §167–§170). Default on. */
  readonly interiorFog?: boolean | undefined;
  /** Inside view: where the camera stands (default INSIDE_EYE). */
  readonly eye?: readonly [number, number, number] | undefined;
  /** Shows the portal polygons as flat magenta shapes (debug). Default off. */
  readonly portals?: boolean | undefined;
  /** Liquid surfaces on (default) / off. */
  readonly liquids?: boolean | undefined;
  readonly debugMode?: BuildingDebugMode | undefined;
  /** 'procedural' (default) or 'solid' = flat colours, for exact pixel checks. */
  readonly palette?: 'procedural' | 'solid' | undefined;
  /**
   * 'outside' (default): the camera turns around the building (pitch, heading, zoom).
   * 'inside': the camera stands in the room, at eye height, and looks along `heading` (pitch applies too).
   */
  readonly view?: BuildingView | undefined;
  /** Degrees below the horizontal the camera looks. −89..89, default 20 outside, 0 inside. */
  readonly pitchDegrees?: number | undefined;
  /** Compass direction the camera looks towards (0 = north = +y, 90 = east). Default 30. */
  readonly headingDegrees?: number | undefined;
  /** ≥ 1; larger = closer (outside view only). Default 1. */
  readonly zoom?: number | undefined;
  /** Groups NOT drawn (indices). Default: none. */
  readonly hiddenGroups?: readonly number[] | undefined;
  /** Props on (default) / off. */
  readonly doodads?: boolean | undefined;
  /** The doodad set shown with the global set: 0 (default) = the global set alone. */
  readonly doodadSet?: number | undefined;
  /** How the props are drawn: 'lit' (default) or 'normals' (their normals as colours, for exact pixel checks). */
  readonly doodadDebug?: 'lit' | 'normals' | undefined;
  /** Shows a collision set instead of the building: 'off' (default), 'player' or 'camera'. Props are not drawn then (they have no collision yet). */
  readonly collisionView?: CollisionView | undefined;
}

export type CollisionView = 'off' | CollisionKind;
/** What a ray from the camera, straight ahead, meets in one collision set. */
export interface AimHit {
  readonly group: number;
  readonly distance: number;
  readonly flags: number;
}

export interface BuildingStats {
  readonly name: string;
  readonly groups: number;
  readonly groupsDrawn: number;
  readonly batchesDrawn: number;
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly debugMode: BuildingDebugMode;
  readonly hiddenGroups: readonly number[];
  /** Props: placed in the building, drawn in the last frame, models uploaded for them. */
  readonly doodads: number;
  readonly doodadsDrawn: number;
  readonly doodadModels: number;
  readonly doodadTriangles: number;
  readonly doodadsShown: boolean;
  readonly doodadSet: number;
  readonly doodadSetName: string;
  readonly doodadSets: number;
  /** The fog drawn in the last frame: where it comes from and how far its 4-second transition is (0..1). */
  readonly fog: { readonly source: 'interior' | 'outdoor' | 'off'; readonly blend: number; readonly start: number; readonly end: number; readonly color: readonly [number, number, number] };
  /** How the drawn groups are chosen, and what the portal flood found in the last frame. */
  readonly visibility: BuildingVisibility;
  readonly visibleGroups: readonly number[];
  readonly portalsFollowed: number;
  readonly outsideVisible: boolean;
  readonly exteriorWindows: number;
  /** The room(s) the camera is in (spec §145–§151), found again every frame. */
  readonly room: CurrentRoom;
  readonly roomNames: readonly string[];
  readonly portals: number;
  readonly portalsShown: boolean;
  /** Liquid: groups that carry a surface, surfaces drawn in the last frame, their triangles, the animation frame. */
  readonly liquidSurfaces: number;
  readonly liquidsDrawn: number;
  readonly liquidTriangles: number;
  readonly liquidFrame: number;
  readonly liquidsShown: boolean;
  readonly collisionView: CollisionView;
  readonly collisionTriangles: Readonly<Record<CollisionKind, number>>;
  /** Straight ahead of the camera, in each set (the whole building, whatever is hidden). null = nothing. */
  readonly aim: Readonly<Record<CollisionKind, AimHit | null>>;
}

export interface BuildingScene extends Scene {
  readonly building: BuildingStats;
  /** lit → groups → classes → colors → lit. */
  cycleDebugMode(): BuildingDebugMode;
  /** Shows / hides one group. Returns true when it is now visible. */
  toggleGroup(index: number): boolean;
  /** Next doodad set (0 → 1 → … → 0). Returns the new one. */
  cycleDoodadSet(): number;
  /** Props on / off. Returns true when they are now drawn. */
  toggleDoodads(): boolean;
  /** Advances what runs on real time (the fog transition). Call once per frame. */
  advance(dtMs: number): void;
  /** Inside view: moves the camera to a point, keeping its direction. */
  setEye(point: readonly [number, number, number]): void;
  /** portals → all → portals. */
  toggleVisibility(): BuildingVisibility;
  /** Portal polygons on / off (debug). */
  togglePortals(): boolean;
  /** The room(s) a point is in; `terrainHeight` = height of the ground under it, when there is some. */
  roomAt(point: readonly [number, number, number], terrainHeight?: number | null): CurrentRoom;
  /** Liquids on / off. Returns true when they are now drawn. */
  toggleLiquids(): boolean;
  /** Time of the liquid animation, in milliseconds; call it every frame. */
  setAnimationTime(timeMs: number): void;
  /** off → player → camera → off. */
  cycleCollisionView(): CollisionView;
  /** A ray against a collision set, in the building's space (= the world here: the building is not moved). */
  raycast(origin: readonly [number, number, number], direction: readonly [number, number, number], maxDistance: number, kind: CollisionKind): CollisionHit | null;
  readonly camera: LookAtCamera;
  /** Where a world point fell on the screen in the last frame (fractions 0..1 from the top left). */
  projectWorldToScreen(point: readonly [number, number, number]): [number, number];
}

const DEBUG_ORDER: readonly BuildingDebugMode[] = ['lit', 'groups', 'classes', 'colors'];
/** Where the inside camera stands: in the middle of the room, at eye height. */
export const INSIDE_EYE = [0, 0, 1.6] as const;

/** Building test scene: the cottage alone (no ground, no sky), each of its groups drawn separately (P6.1), with its props (P6.2). */
export function createBuildingScene(backend: RendererBackend, options: BuildingSceneOptions = {}): BuildingScene {
  const view = options.view ?? 'outside';
  const pitch = options.pitchDegrees ?? (view === 'inside' ? 0 : 20), heading = options.headingDegrees ?? 30, zoom = options.zoom ?? 1;
  if (!(pitch > -90 && pitch < 90)) throw new Error(`scene: pitch must be in −90..90 degrees, both excluded (got ${pitch})`);
  if (!Number.isFinite(heading)) throw new Error(`scene: heading must be finite (got ${heading})`);
  if (!(zoom >= 1) || !Number.isFinite(zoom)) throw new Error(`scene: zoom must be a finite number ≥ 1 (got ${zoom})`);

  const fixture = options.fixture ?? 'cottage';
  if (fixture !== 'cottage' && view === 'inside') throw new Error(`scene: the inside view is the cottage's (got fixture "${fixture}")`);
  const building: Building = fixture === 'basin' ? buildBasin(options.palette ?? 'procedural') : buildCottage(options.palette ?? 'procedural');
  // Flat textures also mean flat liquid frames: one colour per animation frame, for exact pixel checks.
  const renderer = new BuildingRenderer(backend, 'building', { liquidFrames: options.palette === 'solid' ? 'solid' : 'procedural' });
  const liquidSurfaces = building.groups.filter((group) => group.liquid && resolveBuildingLiquidType(group.liquid) !== null).length;
  let showLiquids = options.liquids ?? true, liquidTimeMs = 0;
  let lastLiquids = { surfaces: 0, draws: 0, triangles: 0, frame: 0 };
  const id = renderer.addBuilding(building);
  const hidden = new Set<number>();
  for (const index of options.hiddenGroups ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= building.groups.length) throw new Error(`scene: the building has no group ${index} (it has ${building.groups.length})`);
    hidden.add(index);
  }
  const visible = new Set<number>();
  let visibility: BuildingVisibility = options.visibility ?? 'portals';
  let flood: PortalFlood | null = null;
  /** The groups to draw: the flood's (or all of them), minus those hidden by hand. */
  const refreshVisible = (found: PortalFlood | null): void => {
    visible.clear();
    building.groups.forEach((_, index) => {
      if (!hidden.has(index) && (!found || found.visible[index] === 1)) visible.add(index);
    });
  };
  refreshVisible(null);
  const instance: BuildingInstance = { building: id, matrix: mat4.identity(mat4.create()), visibleGroups: visible };
  let debugMode: BuildingDebugMode = options.debugMode ?? 'lit';

  // Props: drawn by the model renderer, between the building's opaque and blended batches.
  const models = new ModelRenderer(backend, 'building-doodad');
  const doodads = new BuildingDoodads(models, building, (name) => {
    if (!isPropModelName(name)) throw new Error(`scene: no prop model "${name}"`);
    return { mesh: buildPropModel(name), texture: propTexture() };
  });
  const setCount = Math.max(1, building.doodadSets?.length ?? 0);
  let doodadSet = options.doodadSet ?? 0, showDoodads = options.doodads ?? true;
  if (!Number.isInteger(doodadSet) || doodadSet < 0 || doodadSet >= setCount) throw new Error(`scene: the building has no doodad set ${doodadSet} (it has ${setCount})`);
  const doodadDebug: ModelDebugMode = options.doodadDebug ?? 'lit';
  let lastDoodads = { instances: 0, triangles: 0, draws: 0 };

  // Collision (P6.3): the two face sets, and what is straight ahead of the camera in each.
  const collision = new BuildingCollision(building);
  const VIEWS: readonly CollisionView[] = ['off', 'player', 'camera'];
  let collisionView: CollisionView = options.collisionView ?? 'off';
  const collisionTriangles = { player: collision.triangleCount('player'), camera: collision.triangleCount('camera') };
  let showPortals = options.portals ?? false;
  const roomOf = (point: readonly [number, number, number], terrainHeight?: number | null): CurrentRoom => findCurrentRoom(building, collision, point, { terrainHeight });
  const aimOf = (kind: CollisionKind): AimHit | null => {
    const hit = collision.raycast([camera.eye[0]!, camera.eye[1]!, camera.eye[2]!], [camera.target[0]! - camera.eye[0]!, camera.target[1]! - camera.eye[1]!, camera.target[2]! - camera.eye[2]!], camera.far, kind);
    return hit && { group: hit.group, distance: hit.distance, flags: hit.flags };
  };

  // Bounds of the whole building, from its groups' boxes.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const group of building.groups) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, group.bounds.min[k]!);
    max[k] = Math.max(max[k]!, group.bounds.max[k]!);
  }
  const centre = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const radius = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  const p = (pitch * Math.PI) / 180, h = (heading * Math.PI) / 180;
  const forward = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
  let camera: LookAtCamera;
  if (view === 'inside') {
    const at = options.eye ?? INSIDE_EYE;
    if (![at[0], at[1], at[2]].every(Number.isFinite)) throw new Error('scene: the eye must be three finite numbers');
    const eye = vec3.create(at[0], at[1], at[2]);
    camera = { eye, target: vec3.create(eye[0]! + forward[0]!, eye[1]! + forward[1]!, eye[2]! + forward[2]!), up: WORLD_UP, fovY: Math.PI / 3, near: 0.05, far: 100 };
  } else {
    const distance = ((1.25 * radius) / Math.tan(Math.PI / 6)) / zoom;
    const target = vec3.create(centre[0], centre[1], centre[2]);
    camera = { eye: vec3.create(target[0]! - forward[0]! * distance, target[1]! - forward[1]! * distance, target[2]! - forward[2]! * distance), target, up: WORLD_UP, fovY: Math.PI / 3, near: distance / 100, far: distance * 10 };
  }
  // Fog (P6.7): the building's interior fog while the camera is in a true interior, else the scene's own — here a
  // far fog of the background colour, i.e. none within reach. The change takes 4 seconds.
  const OUTDOOR_FOG: ResolvedFog = { color: [TERRAIN_CHUNK_CLEAR.r, TERRAIN_CHUNK_CLEAR.g, TERRAIN_CHUNK_CLEAR.b], start: 400, end: 800 };
  const interiorFog = options.interiorFog ?? true;
  const fogTransition = new FogTransition();
  let fogSource: 'interior' | 'outdoor' | 'off' = 'off';
  const mvp = mat4.create();
  const currentRoom = (): CurrentRoom => roomOf([camera.eye[0]!, camera.eye[1]!, camera.eye[2]!]);
  let last = { groups: 0, draws: 0, triangles: 0 };

  return {
    camera,
    get building(): BuildingStats {
      return { name: building.name, groups: building.groups.length, groupsDrawn: last.groups, batchesDrawn: last.draws, triangles: last.triangles, materials: building.materials.length, textures: building.textures.length, debugMode, hiddenGroups: [...hidden].sort((a, b) => a - b), doodads: doodads.doodadCount, doodadsDrawn: lastDoodads.instances, doodadModels: doodads.modelCount, doodadTriangles: lastDoodads.triangles, doodadsShown: showDoodads, doodadSet, doodadSetName: building.doodadSets?.[doodadSet]?.name ?? 'none', doodadSets: setCount, fog: { source: fogSource, blend: fogTransition.blend, start: fogTransition.value?.start ?? 0, end: fogTransition.value?.end ?? 0, color: fogTransition.value?.color ?? [0, 0, 0] }, visibility, visibleGroups: [...visible].sort((a, b) => a - b), portalsFollowed: flood?.portalsFollowed ?? 0, outsideVisible: flood?.outsideVisible ?? true, exteriorWindows: flood?.exteriorWindows.length ?? 0, room: currentRoom(), roomNames: currentRoom().groups.map((g) => building.groups[g]!.name), portals: building.portals?.length ?? 0, portalsShown: showPortals, liquidSurfaces, liquidsDrawn: lastLiquids.surfaces, liquidTriangles: lastLiquids.triangles, liquidFrame: lastLiquids.frame, liquidsShown: showLiquids, collisionView, collisionTriangles, aim: { player: aimOf('player'), camera: aimOf('camera') } };
    },
    cycleDebugMode(): BuildingDebugMode {
      debugMode = DEBUG_ORDER[(DEBUG_ORDER.indexOf(debugMode) + 1) % DEBUG_ORDER.length]!;
      return debugMode;
    },
    toggleGroup(index: number): boolean {
      if (!Number.isInteger(index) || index < 0 || index >= building.groups.length) return false;
      if (hidden.has(index)) hidden.delete(index);
      else hidden.add(index);
      refreshVisible(flood);
      return !hidden.has(index);
    },
    cycleDoodadSet(): number {
      doodadSet = (doodadSet + 1) % setCount;
      return doodadSet;
    },
    toggleDoodads(): boolean {
      showDoodads = !showDoodads;
      return showDoodads;
    },
    advance(dtMs: number): void {
      fogTransition.advance(dtMs);
    },
    setEye(point): void {
      if (view !== 'inside') throw new Error('scene: the eye can be moved in the inside view only');
      if (![point[0], point[1], point[2]].every(Number.isFinite)) throw new Error('scene: the eye must be three finite numbers');
      for (let k = 0; k < 3; k++) {
        camera.target[k] = camera.target[k]! + point[k]! - camera.eye[k]!;
        camera.eye[k] = point[k]!;
      }
    },
    toggleVisibility(): BuildingVisibility {
      visibility = visibility === 'portals' ? 'all' : 'portals';
      return visibility;
    },
    togglePortals(): boolean {
      showPortals = !showPortals;
      return showPortals;
    },
    roomAt(point, terrainHeight) {
      return roomOf(point, terrainHeight);
    },
    toggleLiquids(): boolean {
      showLiquids = !showLiquids;
      return showLiquids;
    },
    setAnimationTime(timeMs: number): void {
      liquidTimeMs = timeMs;
    },
    cycleCollisionView(): CollisionView {
      collisionView = VIEWS[(VIEWS.indexOf(collisionView) + 1) % VIEWS.length]!;
      return collisionView;
    },
    raycast(origin, direction, maxDistance, kind) {
      return collision.raycast(origin, direction, maxDistance, kind);
    },
    projectWorldToScreen(point) {
      const w = mvp[3]! * point[0] + mvp[7]! * point[1] + mvp[11]! * point[2] + mvp[15]!;
      return [((mvp[0]! * point[0] + mvp[4]! * point[1] + mvp[8]! * point[2] + mvp[12]!) / w + 1) / 2, (1 - (mvp[1]! * point[0] + mvp[5]! * point[1] + mvp[9]! * point[2] + mvp[13]!) / w) / 2];
    },
    render(aspect: number): FrameStats {
      viewProjectionMatrix(mvp, camera, aspect, backend.info.depthRange);
      if (interiorFog) {
        const eye = [camera.eye[0]!, camera.eye[1]!, camera.eye[2]!] as const;
        const inside = selectBuildingFog(building, currentRoom().groups[0], eye);
        fogSource = inside ? 'interior' : 'outdoor';
        fogTransition.setTarget(inside ?? OUTDOOR_FOG);
        renderer.setFog(fogTransition.value);
        models.setFog(fogTransition.value);
      }
      // The portal flood (spec §152–§164) from the camera's room says which groups can be seen. The building is not
      // moved here, so its space is the world's. The collision view shows the sets whole.
      flood = visibility === 'portals' && collisionView === 'off' ? floodPortals(building, { viewProjection: mvp, eye: [camera.eye[0]!, camera.eye[1]!, camera.eye[2]!], seeds: currentRoom().groups }) : null;
      refreshVisible(flood);
      backend.beginFrame(TERRAIN_CHUNK_CLEAR);
      if (collisionView !== 'off') {
        last = renderer.draw(mvp, [instance], { debugMode, eye: camera.eye, collision: collisionView });
        lastDoodads = { instances: 0, triangles: 0, draws: 0 };
        lastLiquids = { surfaces: 0, draws: 0, triangles: 0, frame: lastLiquids.frame };
        return backend.endFrame();
      }
      const opaque = renderer.draw(mvp, [instance], { debugMode, eye: camera.eye, pass: 'opaque' });
      // Only the props of the visible groups are submitted (spec §165).
      lastDoodads = models.draw(mvp, showDoodads ? doodads.instances(instance.matrix, doodadSet, visible) : [], { debugMode: doodadDebug, eye: camera.eye });
      if (showPortals) renderer.drawPortals(mvp, [instance]);
      // Liquids of the visible groups (spec §166), after everything opaque; not in the flat debug views.
      lastLiquids = showLiquids && debugMode === 'lit' ? renderer.drawLiquids(mvp, [instance], { timeMs: liquidTimeMs, eye: camera.eye }) : { surfaces: 0, draws: 0, triangles: 0, frame: lastLiquids.frame };
      const blended = renderer.draw(mvp, [instance], { debugMode, eye: camera.eye, pass: 'blended' });
      last = { groups: opaque.groups, draws: opaque.draws + blended.draws, triangles: opaque.triangles + blended.triangles };
      return backend.endFrame();
    },
    dispose() {
      doodads.dispose();
      models.dispose();
      renderer.dispose();
    },
  };
}
