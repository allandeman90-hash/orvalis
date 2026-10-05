import type { AssetCounts } from '../assets';
import { DAY_UNITS, dayUnitsToClock, formatDayUnits } from '../environment';
import { BACKEND_DISPLAY_NAME, type BackendKind } from '../renderer';

/**
 * Everything the overlay can show. Fields are added as the systems that
 * produce them appear (player/camera position, tiles, chunks, network…);
 * a field that does not exist yet is simply not listed.
 */
export interface OverlayData {
  /** Which side of the Orvalis bootstrap is running. The overlay only exists in the new engine. */
  readonly engineMode: 'new';
  readonly backend: BackendKind;
  /** True when the backend in use is a fallback, with the reason. */
  readonly fallbackNote?: string;
  readonly fps: number;
  readonly frameMs: number;
  readonly frameMaxMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly simulationHz: number;
  readonly simulationSteps: number;
  readonly assets: AssetCounts;
  /** World clock: time in day units (0..2880, continuous), real seconds per game day, debug speed, syncs received. */
  /** Day/night cycle: the two keyframes the time lies between and how far towards the second (0..1). */
  readonly dayCycle?: { readonly from: string; readonly to: string; readonly blend: number };
  /** The two suns: compass azimuth and elevation, in degrees. */
  readonly suns?: { readonly lighting: { readonly azimuth: number; readonly elevation: number }; readonly visible: { readonly azimuth: number; readonly elevation: number } };
  readonly worldTime?: { readonly units: number; readonly daySeconds: number; readonly speed: number; readonly syncs: number };
  /** Present when the scene draws models. */
  /** Present in the camera scene: the gameplay camera. */
  readonly camera?: { readonly yaw: number; readonly pitch: number; readonly distance: number; readonly requestedDistance: number; readonly maxDistance: number; readonly eye: readonly [number, number, number]; readonly fovYDegrees: number; readonly mouseMode: string; readonly characterYaw: number; readonly moveForward: boolean; readonly pivotHeight: number; readonly pivotTargetHeight: number; readonly characterScale: number; readonly characterHeight: number; readonly position: readonly [number, number, number]; readonly speed: number; readonly animation: string; readonly mode: string; readonly verticalSpeed: number; readonly airSeconds: number; readonly apex: number; readonly slope: number; readonly blockedBySlope: boolean; readonly sliding: boolean; readonly touching: boolean; readonly stepUps: number; readonly waterDepth: number; readonly swimEnterDepth: number; readonly atSurface: boolean; readonly followMode: string; readonly moving: boolean; readonly recentering: boolean; readonly characterAlpha: number; readonly firstPerson: boolean; readonly zoomDistance: number; readonly blocked: boolean; readonly obstacleDistance: number | null; readonly collision: boolean };
  /** Present when the scene draws a building. */
  readonly building?: { readonly name: string; readonly groups: number; readonly groupsDrawn: number; readonly batchesDrawn: number; readonly triangles: number; readonly materials: number; readonly textures: number; readonly debugMode: string; readonly hiddenGroups: readonly number[]; readonly doodads: number; readonly doodadsDrawn: number; readonly doodadModels: number; readonly doodadsShown: boolean; readonly doodadSet: number; readonly doodadSetName: string; readonly doodadSets: number; readonly fog: { readonly source: string; readonly blend: number; readonly start: number; readonly end: number }; readonly visibility: string; readonly visibleGroups: readonly number[]; readonly portalsFollowed: number; readonly outsideVisible: boolean; readonly exteriorWindows: number; readonly room: { readonly groups: readonly number[]; readonly cause: string; readonly distance?: number | undefined; readonly portal?: number | undefined }; readonly roomNames: readonly string[]; readonly portals: number; readonly portalsShown: boolean; readonly liquidSurfaces: number; readonly liquidsDrawn: number; readonly liquidTriangles: number; readonly liquidFrame: number; readonly liquidsShown: boolean; readonly collisionView: string; readonly collisionTriangles: { readonly player: number; readonly camera: number }; readonly aim: { readonly player: { readonly group: number; readonly distance: number } | null; readonly camera: { readonly group: number; readonly distance: number } | null } };
  readonly models?: { readonly models: number; readonly instances: number; readonly triangles: number; readonly vertices: number; readonly debugMode: string; readonly bones?: number; readonly skeleton?: boolean; readonly pose?: string; readonly attached?: number; readonly particles?: string; readonly liveParticles?: number; readonly ribbon?: boolean; readonly ribbonEdges?: number; readonly look?: { readonly hair: number; readonly facialHair: number; readonly gloves: number; readonly boots: number }; readonly skin?: { readonly skinColor: number; readonly faceType: number; readonly hairColor: number }; readonly textureRebuilt?: readonly string[]; readonly outfit?: number; readonly equipment?: readonly string[]; readonly characterState?: string; readonly locomotion?: string; readonly animation?: { readonly sequence: string; readonly elapsed: number; readonly previous: string | null; readonly lambda: number; readonly globalTime: number; readonly frozen: boolean } };
  /** Present when the scene contains terrain. */
  readonly terrain?: {
    readonly map?: string;
    readonly tiles?: number;
    readonly tile?: { readonly x: number; readonly y: number };
    readonly chunks: number;
    readonly vertices: number;
    readonly triangles: number;
    readonly submittedChunks: number;
    readonly culling?: boolean;
    readonly visibleChunks?: number;
    readonly culledChunks?: number;
    readonly drawCalls: number;
    readonly holes: number;
    readonly wireframe: boolean;
    readonly debugMode: 'color' | 'normals' | 'textured';
    readonly chunkBounds?: boolean;
    readonly lit?: boolean;
    readonly fog?: boolean;
    readonly sky?: boolean;
    readonly liquid?: { readonly visible: boolean; readonly chunks: number; readonly cells: number; readonly drawn: number; readonly byType?: Readonly<Record<'river' | 'ocean' | 'magma' | 'slime', number>>; readonly frame?: number };
    readonly far?: { readonly visible: boolean; readonly tiles: number; readonly drawn: number; readonly radius: number };
    readonly streaming?: {
      readonly focus: { readonly x: number; readonly y: number };
      readonly focusTile: { readonly x: number; readonly y: number };
      readonly loadRadius: number;
      readonly unloadRadius: number;
      readonly pending: number;
      readonly gpuQueue: number;
      readonly workMs: number;
      readonly workMaxMs: number;
      readonly loadedTotal: number;
      readonly unloadedTotal: number;
    };
  };
}

/** " · river 12 · ocean 300": the classes present, in class order; empty when unknown. */
function liquidClasses(byType: Readonly<Record<'river' | 'ocean' | 'magma' | 'slime', number>> | undefined): string {
  if (!byType) return '';
  return (['river', 'ocean', 'magma', 'slime'] as const).filter((t) => byType[t] > 0).map((t) => ` · ${t} ${byType[t]}`).join('');
}

/** Turns the data into display lines. Pure, so the exact text is unit-tested. */
/** « group 1 "room" (collision 1.58 below) » · « groups 1 "room" + 0 "shell" (portal 0) » · « outside (exterior) ». */
function roomText(b: NonNullable<OverlayData['building']>): string {
  const named = b.room.groups.map((g, k) => `${g} "${b.roomNames[k] ?? '?'}"`);
  const why = b.room.cause === 'portal' ? `portal ${b.room.portal}` : b.room.cause === 'collision' ? `collision ${b.room.distance?.toFixed(2)} below` : b.room.cause;
  return named.length === 0 ? `outside (${why})` : `group${named.length > 1 ? 's' : ''} ${named.join(' + ')} (${why})`;
}

const aimText = (hit: { readonly group: number; readonly distance: number } | null): string => (hit ? `group ${hit.group} at ${hit.distance.toFixed(2)}` : 'nothing');

export function formatOverlay(d: OverlayData): string[] {
  const a = d.assets.byState;
  const lines = [`Renderer: ${BACKEND_DISPLAY_NAME[d.backend]}${d.fallbackNote ? ' (repli)' : ''}`];
  if (d.fallbackNote) lines.push(`  ${d.fallbackNote}`);
  lines.push(
    d.fps > 0 ? `FPS: ${d.fps.toFixed(0)}` : 'FPS: —',
    d.frameMs > 0 ? `Frame: ${d.frameMs.toFixed(1)} ms (max ${d.frameMaxMs.toFixed(1)})` : 'Frame: —',
    `Draw calls: ${d.drawCalls}`,
    `Triangles: ${d.triangles}`,
    `Canvas: ${d.canvasWidth}×${d.canvasHeight}`,
    ...(d.terrain
      ? [
          ...(d.terrain.map === undefined ? [] : [`Terrain map: ${d.terrain.map}`, `Terrain tiles: ${d.terrain.tiles ?? 0} (resident)`]),
          ...(d.terrain.tile ? [`Terrain tile: ${d.terrain.tile.x},${d.terrain.tile.y}`] : []),
          `Terrain chunks: ${d.terrain.chunks}`,
          `Terrain vertices: ${d.terrain.vertices}`,
          `Terrain triangles: ${d.terrain.triangles}`,
          ...(d.terrain.culling === undefined
            ? []
            : d.terrain.culling
              ? [`Terrain culling: on (C)`, `Terrain visible chunks: ${d.terrain.visibleChunks}`, `Terrain culled chunks: ${d.terrain.culledChunks}`]
              : [`Terrain culling: off (C)`, 'Terrain visible chunks: — (not tested)']),
          `Terrain submitted chunks: ${d.terrain.submittedChunks}`,
          `Terrain draw calls: ${d.terrain.drawCalls}`,
          `Terrain holes: ${d.terrain.holes}/${d.terrain.chunks * 16}`,
          `Terrain wireframe: ${d.terrain.wireframe ? 'on' : 'off'} (F4)`,
          `Terrain debug: ${d.terrain.debugMode}`,
          ...(d.terrain.chunkBounds === undefined ? [] : [`Terrain chunk bounds: ${d.terrain.chunkBounds ? 'on' : 'off'} (B)`]),
          ...(d.terrain.lit === undefined ? [] : [`Terrain lighting: ${d.terrain.lit ? 'on' : 'off'} (L)`]),
          ...(d.terrain.fog === undefined ? [] : [`Terrain fog: ${d.terrain.fog ? 'on' : 'off'} (F)`]),
          ...(d.terrain.sky === undefined ? [] : [`Sky: ${d.terrain.sky ? 'on' : 'off'} (K)`]),
          ...(d.terrain.liquid ? [`Liquid: ${d.terrain.liquid.visible ? 'on' : 'off'} (O) · ${d.terrain.liquid.chunks} chunks · ${d.terrain.liquid.cells} cells · ${d.terrain.liquid.drawn} drawn${liquidClasses(d.terrain.liquid.byType)}${d.terrain.liquid.frame === undefined ? '' : ` · frame ${d.terrain.liquid.frame}/30`}`] : []),
          ...(d.terrain.far ? [`Far terrain: ${d.terrain.far.visible ? 'on' : 'off'} (T) · ${d.terrain.far.tiles} tiles (±${d.terrain.far.radius}) · ${d.terrain.far.drawn} drawn`] : []),
          ...(d.terrain.streaming
            ? [
                `Focus: ${d.terrain.streaming.focus.x.toFixed(1)}, ${d.terrain.streaming.focus.y.toFixed(1)} (arrows / WASD)`,
                `Streaming: tile ${d.terrain.streaming.focusTile.x},${d.terrain.streaming.focusTile.y} · radius ${d.terrain.streaming.loadRadius}/${d.terrain.streaming.unloadRadius} · pending ${d.terrain.streaming.pending}`,
                `Streaming totals: ${d.terrain.streaming.loadedTotal} loaded · ${d.terrain.streaming.unloadedTotal} unloaded`,
                `Streaming GPU queue: ${d.terrain.streaming.gpuQueue}`,
                `Streaming work: ${d.terrain.streaming.workMs.toFixed(1)} ms/frame (max ${d.terrain.streaming.workMaxMs.toFixed(1)})`,
              ]
            : []),
        ]
      : []),
    ...(d.worldTime
      ? [`World time: ${formatDayUnits(d.worldTime.units)} · unit ${dayUnitsToClock(d.worldTime.units).unit}/${DAY_UNITS} · day ${d.worldTime.daySeconds} s${d.worldTime.speed === 1 ? '' : ` × ${d.worldTime.speed}`} · ${d.worldTime.syncs} sync`]
      : []),
    ...(d.camera ? [`Camera: yaw ${d.camera.yaw.toFixed(1)}° · pitch ${d.camera.pitch.toFixed(1)}° (±89) · distance ${d.camera.distance.toFixed(2)} → ${d.camera.requestedDistance.toFixed(0)} (wheel, max ${d.camera.maxDistance.toFixed(0)}) · eye ${d.camera.eye.map((v) => v.toFixed(2)).join(', ')} · fov ${d.camera.fovYDegrees.toFixed(1)}° vertical`, `Mouse: ${d.camera.mouseMode === 'orbit' ? 'left — camera alone' : d.camera.mouseMode === 'steer' ? 'right — camera + character' : 'no button'}${d.camera.moveForward ? ' · BOTH: move forward' : ''} · character faces ${d.camera.characterYaw.toFixed(1)}°`, `Pivot: ${d.camera.pivotHeight.toFixed(2)} → ${d.camera.pivotTargetHeight.toFixed(2)} above the feet · character × ${d.camera.characterScale} (1–3), ${d.camera.characterHeight.toFixed(2)} tall · ${d.camera.firstPerson ? 'FIRST PERSON (character hidden)' : `character opacity ${Math.round(d.camera.characterAlpha * 100)} %`}`, `Movement: at ${d.camera.position.map((v) => v.toFixed(2)).join(', ')} · ${d.camera.speed.toFixed(2)} per second · ${d.camera.sliding ? `SLIDING down a ${d.camera.slope.toFixed(0)}° slope, ` : ''}${d.camera.mode === 'swimming' ? `SWIMMING${d.camera.atSurface ? ' at the surface' : ''}, water ${d.camera.waterDepth.toFixed(2)} over the feet (swims above ${d.camera.swimEnterDepth.toFixed(2)}), ${d.camera.verticalSpeed.toFixed(2)} up` : d.camera.mode === 'grounded' ? `on the ground (slope ${d.camera.slope.toFixed(0)}°${d.camera.blockedBySlope ? ', TOO STEEP ahead' : ''}${d.camera.touching ? ', AGAINST AN OBSTACLE' : ''}, ${d.camera.stepUps} step-up${d.camera.stepUps === 1 ? '' : 's'})` : `${d.camera.mode === 'fallingFar' ? 'FALLING FAR' : 'in the air'} ${d.camera.verticalSpeed.toFixed(2)} up`} (last flight ${d.camera.airSeconds.toFixed(2)} s, +${d.camera.apex.toFixed(2)}) · animation ${d.camera.animation} · Space jump, W/S forward-back, A/D turn (strafe with right button), Q/E strafe, Shift walk`, `Follow: ${d.camera.followMode} (F) · character ${d.camera.moving ? 'moving' : 'standing'}${d.camera.recentering ? ' · RECENTRING behind it' : ''}`, `Camera collision: ${!d.camera.collision ? 'off' : d.camera.blocked ? `BLOCKED at ${d.camera.obstacleDistance?.toFixed(2)} from the pivot — arm ${d.camera.distance.toFixed(2)} of ${d.camera.zoomDistance.toFixed(2)}` : d.camera.distance < d.camera.zoomDistance - 1e-6 ? `free — easing out, arm ${d.camera.distance.toFixed(2)} of ${d.camera.zoomDistance.toFixed(2)}` : 'free'} (C)`] : []),
    ...(d.building ? [`Building: ${d.building.name} · ${d.building.groupsDrawn} of ${d.building.groups} groups drawn (1–${d.building.groups} show / hide) · ${d.building.batchesDrawn} batches · ${d.building.triangles} triangles · ${d.building.materials} materials, ${d.building.textures} textures · view ${d.building.debugMode} (M)`, `Props: ${d.building.doodadsShown ? `${d.building.doodadsDrawn} of ${d.building.doodads} drawn` : 'off'} (V) · ${d.building.doodadModels} models · set ${d.building.doodadSet} « ${d.building.doodadSetName} » of ${d.building.doodadSets} (N)`, `Room: ${roomText(d.building)} · ${d.building.portals} portals, shown ${d.building.portalsShown ? 'on' : 'off'} (O)`, `Fog: ${d.building.fog.source === 'off' ? 'off' : `${d.building.fog.source} · start ${d.building.fog.start.toFixed(1)} end ${d.building.fog.end.toFixed(1)} · transition ${Math.round(d.building.fog.blend * 100)} %`}`, `Visibility: ${d.building.visibility === 'portals' ? `portals (I) · groups ${d.building.visibleGroups.join(', ') || 'none'} · ${d.building.portalsFollowed} portal(s) followed · outside ${d.building.outsideVisible ? `visible${d.building.exteriorWindows > 0 ? ` through ${d.building.exteriorWindows} window(s)` : ''}` : 'hidden'}` : 'all groups (I)'}`, ...(d.building.liquidSurfaces > 0 ? [`Building liquid: ${d.building.liquidsShown ? `${d.building.liquidsDrawn} of ${d.building.liquidSurfaces} surfaces drawn` : 'off'} (L) · ${d.building.liquidTriangles} triangles · frame ${d.building.liquidFrame}/30`] : []), `Collision: view ${d.building.collisionView} (C) · ${d.building.collisionTriangles.player} player / ${d.building.collisionTriangles.camera} camera triangles · ahead: player ${aimText(d.building.aim.player)}, camera ${aimText(d.building.aim.camera)}`] : []),
    ...(d.models ? [`Models: ${d.models.models} model · ${d.models.instances} instance(s) · ${d.models.vertices} vertices · ${d.models.triangles} triangles · view ${d.models.debugMode} (M)`, ...(d.models.bones === undefined ? [] : [`Skeleton: ${d.models.bones} bones · lines ${d.models.skeleton ? 'on' : 'off'} (N) · pose ${d.models.pose ?? 'rest'} (J) · attached ${d.models.attached ?? 0} (H)`, ...(d.models.particles !== undefined && d.models.particles !== 'off' ? [`Particles: ${d.models.particles} · ${d.models.liveParticles ?? 0} alive (G)`] : []), ...(d.models.look ? [`Character: hair ${d.models.look.hair} (1) · facial hair ${d.models.look.facialHair} (2) · gloves ${d.models.look.gloves} (3) · boots ${d.models.look.boots} (4)`] : []), ...(d.models.skin ? [`Texture: 256 × 256 composite · skin ${d.models.skin.skinColor} (5) · face ${d.models.skin.faceType} (6) · hair colour ${d.models.skin.hairColor} (7) · last rebuild: ${d.models.textureRebuilt?.length ? d.models.textureRebuilt.join(', ') : 'nothing'}`] : []), ...(d.models.equipment ? [`Equipment: ${d.models.outfit !== undefined && d.models.outfit >= 0 ? `outfit ${d.models.outfit}` : 'custom'} (8) · ${d.models.equipment.length ? d.models.equipment.join(', ') : 'nothing'}`] : []), ...(d.models.characterState ? [`Character animation: ${d.models.characterState} · wants ${d.models.locomotion ?? 'stand'} (9) · Space jump · X attack`] : []), ...(d.models.ribbon ? [`Ribbon: ${d.models.ribbonEdges ?? 0} edges (R)`] : []), ...(d.models.animation ? [`Animation: ${d.models.animation.sequence} ${Math.round(d.models.animation.elapsed)} ms${d.models.animation.previous === null ? '' : ` · fading from ${d.models.animation.previous} ${Math.round(d.models.animation.lambda * 100)} %`}${d.models.animation.frozen ? ' · frozen' : ''}`] : [])])] : []),
    ...(d.dayCycle ? [`Day cycle: ${d.dayCycle.from} → ${d.dayCycle.to} ${Math.round(d.dayCycle.blend * 100)} % (PageUp / PageDown: ±1 h · P: pause)`] : []),
    ...(d.suns
      ? [`Suns: light az ${d.suns.lighting.azimuth.toFixed(0)}° el ${d.suns.lighting.elevation.toFixed(0)}° · visible az ${d.suns.visible.azimuth.toFixed(0)}° el ${d.suns.visible.elevation.toFixed(0)}°${d.suns.visible.elevation < 0 ? ' (set)' : ''}`]
      : []),
    `Simulation: ${d.simulationHz.toFixed(0)} Hz · ${d.simulationSteps} steps`,
    `Assets: ${a.ready + a.evictable} ready · ${a.requested + a.downloading + a.decoded + a['gpu-uploading']} loading · ${a.failed} failed`,
    `Engine: ${d.engineMode} (jeu actuel : ?engine=legacy)`,
  );
  return lines;
}

/** How often the text is rewritten; faster would be unreadable and wasteful. */
const REFRESH_INTERVAL_MS = 250;

/** DOM side of the overlay: one <pre>-like box, refreshed a few times per second. */
export class DebugOverlay {
  private lastRefreshMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly element: HTMLElement) {}

  get visible(): boolean {
    return !this.element.hidden;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) this.lastRefreshMs = Number.NEGATIVE_INFINITY; // refresh immediately when shown again
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  /** Call once per frame; the DOM is only touched every REFRESH_INTERVAL_MS and when visible. */
  update(nowMs: number, data: () => OverlayData): void {
    if (!this.visible || nowMs - this.lastRefreshMs < REFRESH_INTERVAL_MS) return;
    this.lastRefreshMs = nowMs;
    this.element.textContent = formatOverlay(data()).join('\n');
  }
}
