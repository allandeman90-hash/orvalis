import type { BuildingDebugMode, ModelDebugMode, TerrainDebugMode } from '../renderer';
import type { BuildingView } from './buildingScene';
import type { CharacterLook, ModelKind, ModelLayout, ModelParticles, ModelPose } from './modelScene';
import { TEST_ZONE } from '../terrain';
import type { LiquidFixtureKind, MapFixtureId, PaintKind, StreamingConfig, SyntheticHeightKind, TileCoord, TileHeightKind, TileNormalMode } from '../terrain';
import type { ChunkView } from './terrainChunk';
import type { PaletteKind, SceneFog } from './terrainMaterial';
import type { TileChunkHoles } from './terrainTile';

/**
 * Test-scene selection from the URL (development only):
 *   ?scene=tile (default) | stream | zone | map | chunk | model | building | camera | triangle
 * Common to tile and chunk:
 *   &view=oblique (default) | above | below
 *   &wireframe=on | off (default)
 *   &terrainDebug=color | normals | textured     (default: color; textured for the stream scene)
 *   &paint=natural | quadrants    alpha maps of the texture layers (default natural when textured, none otherwise)
 *   &textures=procedural (default) | solid       solid = flat colours, for exact pixel checks
 *   &layerRepeats=<1..64>         texture repeats across one chunk (default 4)
 *   &lighting=on (default) | off  per-vertex light and baked shadow in textured mode (key L)
 *   &fog=on | off                 distance fog in textured mode (key F; default: on for the stream scene, off elsewhere)
 *   &fogStart=<n>&fogEnd=<n>      fog distances in world units (both needed; default: derived from the scene)
 *   &liquidLevel=<n>              height of the synthetic liquid's surface (default 0)
 *   &liquid=sea | lake | classes | off   synthetic liquid over the fixture relief (default: none); the zone scene has its own sea (off removes it); key O hides / shows
 *   &sky=on | off                 sky gradient and sun disc behind the textured terrain (key K; default: on for the stream and zone scenes, off elsewhere)
 * Tile only:
 *   &tile=<x>,<y>             tile coordinates, any integers (default 0,0)
 *   &height=hills (default) | slope | flat
 *   &zoom=<1..64>             camera closer to the tile centre (default 1)
 *   &chunkBounds=on | off (default)
 *   &culling=on (default) | off     frustum culling per chunk
 *   &holeChunks=<cx>:<cy>:<mask>[,…]   hole mask of individual chunks
 *   &tileNormals=seamless (default) | isolated   (isolated = test control, shows the seams)
 * Stream only (sparse map « continent », tiles loaded and unloaded around a moving focus):
 *   &focus=<x>,<y>            start position in world units (default 256,256)
 *   &loadRadius=<0..4> (default 1)  &unloadRadius=<0..6> (default loadRadius + 1)   in tiles
 *   &view=oblique (default) | above ; &zoom (default 4 here) ; &height ; &chunkBounds ; &culling
 *   &pitch=<1..89> degrees below the horizontal (default 35 ; 20 for the zone scene) ; &heading=<0..359> compass direction looked at (default 45)
 *   &frameBudget=<1..100> ms per frame for tile building and GPU uploads (default 4) | off (everything at once)
 *   &far=on (default) | off ; &farRadius=<0..5> (default 3)   low-detail far terrain, ± that many tiles (key T)
 *   &tileBorders=stitched (default) | raw     (raw = test control, shows the seams between tiles)
 * Zone (M1.1: the technical test zone, a piece of the old Orvalis terrain, streamed like the scene above):
 *   same options as stream, except &height (the relief comes from the zone) and &paint (only on | off matters:
 *   any value = the zone's own ground mix); &focus defaults to the old capital.
 * Model (P4.1: the engine's first model, an original tree built in code):
 *   &models=single (default) | grove | row     one tree, three turned and scaled differently, or five far away at
 *                                              increasing distances (to look at the distance fade)
 *   &modelFade=on (default) | off   models fade out with distance, by size
 *   &modelDebug=lit (default) | normals | weights | bones     (key M cycles)
 *   &skeleton=on | off (default)   the bones as lines over the model (key N) ; &pose=rest (default) | bend | sway | gust   (key J; sway and gust are animations)
 *   &model=tree (default) | swatches | character   the animated tree, the material test card (one swatch per blend
 *                                                  mode), or the mannequin whose sections are switched by geoset
 *   &anim=stand (default) | walk | run | off   character only: its animation state at the start; off = rest pose
 *                                              (key 9: stand → walk → run, Space: jump, X: attack)
 *   &outfit=0..2   character only: nothing, clothes, or clothes + leather + sword and shield (key 8: the next one)
 *   &preset=vanguard   character only: first exaggerated endgame/transmog visual-convergence showcase
 *   &skin=0..2 &face=0..1 &hairColor=0..2 &underwear=on|off   character only: what its composite texture is made of
 *                                                             (keys 5, 6, 7: next skin tone, face, hair colour)
 *   &dither=on (default) | off   character only: 5-6-5 reduction with dithering of the composite texture
 *   &hair=1..3 &facialHair=1..2 &gloves=1..2 &boots=1..2   character only: the variant of each section (1 = baseline;
 *                                                          keys 1, 2, 3, 4 show the next one)
 *   &attach=on | off (default)   tree only: an ornament hung on the tree's top socket, always facing the camera (key H)
 *   &particles=off (default) | sparkles | jet   tree only: an emitter at the tip (key G: sparkles on / off); jet = test pattern
 *   &ribbon=on | off (default)   tree only: a trail left by the tip as the tree moves (key R) — see it with pose=sway
 *   &hideGeosets=<id,id,…>   sections of the model not drawn (ids 0..65535)
 *   &animTime=<ms>   freezes the animation at that time (0..3600000)
 *   &textures=procedural (default) | solid ; &pitch=<-89..89> (default 15) ; &heading=<0..359> (default 30) ; &zoom
 * Camera (Phase 7: the gameplay camera, around a character standing in front of the cottage):
 *   &yaw=<0..359> compass heading the camera looks towards (default 0) · &pitch=<−99..99> degrees above the pivot,
 *   clamped to ±89 (default 20) · &distance=<0..15> (default 8; 0 = first person) · &textures=procedural | solid
 *   &size=1 | 2 (default) | 3   the character small (× 0.5), as built, large (× 3) — keys 1, 2, 3: the pivot follows
 *   &follow=never | smart (default) | always   (key F) the camera comes back behind the character: never, only
 *     while it moves, or always
 *   Keys: W / S forward / backward, A / D turn (strafe while the right button is held), Q / E strafe, Shift = walk
 *   &cameraCollision=on (default) | off   (key C) walls and ground stop the camera: it snaps in, and eases back out
 *   Left drag turns the camera alone; right drag turns camera and character; both buttons = move forward (intent);
 *   the mouse wheel zooms by 1-yard steps.
 * Building (P6.1: the engine's first building, an original cottage made of three separate groups):
 *   &view=outside (default) | inside   the camera turns around the building, or stands in its room
 *   &doodads=on (default) | off        the props placed in the building (key V)
 *   &doodadSet=0 (default) | 1 | 2     the set of props shown with the always-present set 0 (key N: next set)
 *   &doodadDebug=lit (default) | normals   the props' normals as colours
 *   &building=cottage (default) | basin   basin = two basins whose groups carry a liquid surface (P6.4)
 *   &liquids=on (default) | off         the groups' liquid surfaces (key L); &liquidTime=<ms> freezes their animation
 *   &eye=<x>,<y>,<z>                    inside view: where the camera stands (default the middle of the room)
 *   &visibility=portals (default) | all  (key I) the groups drawn: those seen through the portals from the camera's room, or all
 *   &interiorFog=on (default) | off     the building's own fog while the camera is in a room (4-second transition)
 *   &portals=off (default) | on         (key O) the portal polygons, in magenta; the overlay names the current room
 *   &collision=off (default) | player | camera   (key C cycles) shows a collision face set, one colour per group
 *   &buildingDebug=lit (default) | groups | classes | colors   (key M cycles) one flat colour per group, per batch
 *                                                              class, or the baked vertex colours
 *   &hideGroups=<i,i,…>   groups not drawn (keys 1, 2, 3 show / hide group 0, 1, 2)
 *   &textures=procedural (default) | solid ; &pitch ; &heading ; &zoom
 * Map only (a sparse TerrainMap, several tiles):
 *   &map=archipel (default) | bande
 *   &height=hills | slope | flat    overrides the map fixture's own relief
 *   &zoom, &chunkBounds, &culling as for the tile
 * Chunk only:
 *   &height=hill (default) | slope | flat
 *   &underlay=on | off (default)
 *   &holes=<0..65535> 4×4 hole mask, decimal or 0x… (default 0)
 */
export type SceneRequest =
  | { readonly scene: 'triangle' }
  | {
      readonly scene: 'camera';
      readonly followMode: 'never' | 'smart' | 'always';
      readonly collision: boolean;
      readonly characterScale: number;
      readonly yawDegrees: number;
      readonly pitchDegrees: number;
      readonly distance: number;
      readonly palette: 'procedural' | 'solid';
    }
  | {
      readonly scene: 'building';
      readonly fixture: 'cottage' | 'basin';
      readonly visibility: 'portals' | 'all';
      readonly interiorFog: boolean;
      readonly eye: readonly [number, number, number] | undefined;
      readonly portals: boolean;
      readonly liquids: boolean;
      readonly view: BuildingView;
      readonly debugMode: BuildingDebugMode;
      readonly hiddenGroups: readonly number[];
      readonly palette: 'procedural' | 'solid';
      readonly pitchDegrees: number | undefined;
      readonly headingDegrees: number;
      readonly zoom: number;
      readonly doodads: boolean;
      readonly doodadSet: number;
      readonly doodadDebug: 'lit' | 'normals';
      readonly collisionView: 'off' | 'player' | 'camera';
    }
  | {
      readonly scene: 'model';
      readonly skeleton: boolean;
      readonly pose: ModelPose;
      readonly model: ModelKind;
      readonly look: CharacterLook;
      readonly skin: { readonly skinColor: number; readonly faceType: number; readonly hairColor: number; readonly underwear: boolean };
      readonly dither: boolean;
      readonly outfit: number;
      readonly preset: 'vanguard' | undefined;
      readonly animation: 'stand' | 'walk' | 'run' | 'off';
      readonly attach: boolean;
      readonly particles: ModelParticles;
      readonly ribbon: boolean;
      readonly hiddenGeosets: readonly number[];
      readonly animTimeMs: number | undefined;
      readonly layout: ModelLayout;
      readonly distanceFade: boolean;
      readonly debugMode: ModelDebugMode;
      readonly palette: PaletteKind;
      readonly pitchDegrees: number;
      readonly headingDegrees: number;
      readonly zoom: number;
    }
  | {
      readonly scene: 'chunk';
      readonly heightKind: SyntheticHeightKind;
      readonly view: ChunkView;
      readonly underlay: boolean;
      readonly holes: number;
      readonly wireframe: boolean;
      readonly debugMode: TerrainDebugMode;
    }
  | {
      readonly scene: 'stream' | 'zone';
      readonly paint: PaintKind | undefined;
      readonly palette: PaletteKind;
      readonly layerRepeatsPerChunk: number;
      readonly lit: boolean;
      readonly fog: SceneFog | undefined;
      readonly sky: boolean;
      readonly liquid: LiquidFixtureKind | undefined;
      readonly liquidLevel: number;
      readonly focus: { readonly x: number; readonly y: number };
      readonly streaming: StreamingConfig;
      readonly heightKind: TileHeightKind | undefined;
      readonly view: 'oblique' | 'above';
      /** Zone scene: true = the zone is built without its water. */
      readonly liquidOff: boolean;
      readonly zoom: number;
      readonly pitchDegrees: number | undefined;
      readonly headingDegrees: number | undefined;
      readonly stitchTileBorders: boolean;
      readonly frameBudgetMs: number;
      readonly farRadius: number;
      readonly wireframe: boolean;
      readonly debugMode: TerrainDebugMode;
      readonly chunkBounds: boolean;
      readonly culling: boolean;
    }
  | {
      readonly scene: 'map';
      readonly paint: PaintKind | undefined;
      readonly palette: PaletteKind;
      readonly layerRepeatsPerChunk: number;
      readonly lit: boolean;
      readonly fog: SceneFog | undefined;
      readonly sky: boolean;
      readonly liquid: LiquidFixtureKind | undefined;
      readonly liquidLevel: number;
      readonly map: MapFixtureId;
      /** undefined = the fixture's own relief. */
      readonly heightKind: TileHeightKind | undefined;
      readonly view: ChunkView;
      readonly zoom: number;
      readonly wireframe: boolean;
      readonly debugMode: TerrainDebugMode;
      readonly chunkBounds: boolean;
      readonly culling: boolean;
    }
  | {
      readonly scene: 'tile';
      readonly paint: PaintKind | undefined;
      readonly palette: PaletteKind;
      readonly layerRepeatsPerChunk: number;
      readonly lit: boolean;
      readonly fog: SceneFog | undefined;
      readonly sky: boolean;
      readonly liquid: LiquidFixtureKind | undefined;
      readonly liquidLevel: number;
      readonly tile: TileCoord;
      readonly heightKind: TileHeightKind;
      readonly view: ChunkView;
      readonly zoom: number;
      readonly holes: readonly TileChunkHoles[];
      readonly wireframe: boolean;
      readonly debugMode: TerrainDebugMode;
      readonly chunkBounds: boolean;
      readonly culling: boolean;
      readonly normals: TileNormalMode;
    };

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const v = (value ?? '').toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Anything that is not an integer in 0..0xFFFF means « no hole »: a typo must not punch the terrain. */
export function parseHoleMask(value: string | null): number {
  if (value === null || !/^(0x[0-9a-f]{1,4}|[0-9]{1,5})$/i.test(value.trim())) return 0;
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 0 && n <= 0xffff ? n : 0;
}

/** "x,y" with any (also negative) integers; anything else is tile 0,0. */
export function parseTileCoord(value: string | null): TileCoord {
  const m = /^\s*(-?\d{1,7})\s*,\s*(-?\d{1,7})\s*$/.exec(value ?? '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

/** "cx:cy:mask,cx:cy:mask…"; entries that are malformed or out of range are dropped. */
export function parseHoleChunks(value: string | null): TileChunkHoles[] {
  const out: TileChunkHoles[] = [];
  for (const part of (value ?? '').split(',')) {
    const m = /^\s*(\d{1,2}):(\d{1,2}):(0x[0-9a-f]{1,4}|\d{1,5})\s*$/i.exec(part);
    if (!m) continue;
    const chunkX = Number(m[1]), chunkY = Number(m[2]), mask = parseHoleMask(m[3]!);
    if (chunkX > 15 || chunkY > 15 || mask === 0) continue;
    out.push({ chunkX, chunkY, mask });
  }
  return out;
}

/** "x,y" in world units (decimals allowed); anything else gives the fallback. */
export function parseWorldPoint(value: string | null, fallback: { x: number; y: number }): { x: number; y: number } {
  const m = /^\s*(-?\d{1,9}(?:\.\d{1,6})?)\s*,\s*(-?\d{1,9}(?:\.\d{1,6})?)\s*$/.exec(value ?? '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : fallback;
}

function parseIntegerIn(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || !/^\d{1,3}$/.test(value.trim())) return fallback;
  const n = Number(value.trim());
  return n >= min && n <= max ? n : fallback;
}

/** 'off', explicit distances, 'on' (scene default distances), or undefined (scene default behaviour). */
function parseFog(params: URLSearchParams, onByDefault: boolean): SceneFog | undefined {
  const choice = oneOf(params.get('fog'), ['on', 'off', ''] as const, '');
  if (choice === 'off' || (choice === '' && !onByDefault)) return 'off';
  const start = Number(params.get('fogStart')), end = Number(params.get('fogEnd'));
  if (params.get('fogStart') !== null && params.get('fogEnd') !== null && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) return { start, end };
  return 'on';
}

/** Height of a fixture liquid: any number in −1000..1000, else 0. */
function parseLevel(value: string | null): number {
  if (value === null || !/^\s*-?\d{1,4}(\.\d{1,3})?\s*$/.test(value)) return 0;
  const n = Number(value);
  return n >= -1000 && n <= 1000 ? n + 0 : 0;
}

function parseZoom(value: string | null): number {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n >= 1 && n <= 64 ? n : 1;
}

export function parseSceneRequest(search: string): SceneRequest {
  const params = new URLSearchParams(search);
  const scene = oneOf(params.get('scene'), ['tile', 'stream', 'zone', 'map', 'chunk', 'model', 'building', 'camera', 'triangle'] as const, 'tile');
  if (scene === 'triangle') return { scene };
  if (scene === 'camera') {
    const pitch = /^\s*-?\d{1,2}\s*$/.test(params.get('pitch') ?? '') ? Number(params.get('pitch')) : 20;
    return {
      scene,
      yawDegrees: parseIntegerIn(params.get('yaw'), 0, 359, 0),
      pitchDegrees: pitch,
      distance: parseIntegerIn(params.get('distance'), 0, 15, 8),
      followMode: oneOf(params.get('follow'), ['never', 'smart', 'always'] as const, 'smart'),
      collision: oneOf(params.get('cameraCollision'), ['on', 'off'] as const, 'on') === 'on',
      characterScale: [0.5, 1, 3][parseIntegerIn(params.get('size'), 1, 3, 2) - 1]!,
      palette: oneOf(params.get('textures'), ['procedural', 'solid'] as const, 'procedural'),
    };
  }
  if (scene === 'building') {
    const pitch = /^\s*-?\d{1,2}\s*$/.test(params.get('pitch') ?? '') ? Number(params.get('pitch')) : undefined;
    const fixture = oneOf(params.get('building'), ['cottage', 'basin'] as const, 'cottage');
    return {
      scene,
      fixture,
      visibility: oneOf(params.get('visibility'), ['portals', 'all'] as const, 'portals'),
      interiorFog: oneOf(params.get('interiorFog'), ['on', 'off'] as const, 'on') === 'on',
      eye: /^-?\d{1,3}(\.\d{1,3})?(,-?\d{1,3}(\.\d{1,3})?){2}$/.test(params.get('eye') ?? '') ? ((params.get('eye') ?? '').split(',').map(Number) as [number, number, number]) : undefined,
      portals: oneOf(params.get('portals'), ['on', 'off'] as const, 'off') === 'on',
      liquids: oneOf(params.get('liquids'), ['on', 'off'] as const, 'on') === 'on',
      // The inside view is the cottage's room.
      view: fixture === 'cottage' ? oneOf(params.get('view'), ['outside', 'inside'] as const, 'outside') : 'outside',
      debugMode: oneOf(params.get('buildingDebug'), ['lit', 'groups', 'classes', 'colors'] as const, 'lit'),
      hiddenGroups: /^\d{1,3}(,\d{1,3}){0,31}$/.test(params.get('hideGroups') ?? '') ? [...new Set((params.get('hideGroups') ?? '').split(',').map(Number))].filter((index) => index < 3) : [],
      palette: oneOf(params.get('textures'), ['procedural', 'solid'] as const, 'procedural'),
      pitchDegrees: pitch !== undefined && pitch >= -89 && pitch <= 89 ? pitch + 0 : undefined,
      headingDegrees: parseIntegerIn(params.get('heading'), 0, 359, 30),
      zoom: parseZoom(params.get('zoom')),
      doodads: oneOf(params.get('doodads'), ['on', 'off'] as const, 'on') === 'on',
      doodadSet: parseIntegerIn(params.get('doodadSet'), 0, 2, 0),
      doodadDebug: oneOf(params.get('doodadDebug'), ['lit', 'normals'] as const, 'lit'),
      collisionView: oneOf(params.get('collision'), ['off', 'player', 'camera'] as const, 'off'),
    };
  }
  if (scene === 'model') {
    const pitch = /^\s*-?\d{1,2}\s*$/.test(params.get('pitch') ?? '') ? Number(params.get('pitch')) : 15;
    return {
      scene,
      skeleton: oneOf(params.get('skeleton'), ['on', 'off'] as const, 'off') === 'on',
      pose: oneOf(params.get('pose'), ['rest', 'bend', 'sway', 'gust'] as const, 'rest'),
      model: oneOf(params.get('model'), ['tree', 'swatches', 'character'] as const, 'tree'),
      look: { hair: parseIntegerIn(params.get('hair'), 1, 3, 1), facialHair: parseIntegerIn(params.get('facialHair'), 1, 2, 1), gloves: parseIntegerIn(params.get('gloves'), 1, 2, 1), boots: parseIntegerIn(params.get('boots'), 1, 2, 1) },
      skin: { skinColor: parseIntegerIn(params.get('skin'), 0, 2, 0), faceType: parseIntegerIn(params.get('face'), 0, 1, 0), hairColor: parseIntegerIn(params.get('hairColor'), 0, 2, 0), underwear: oneOf(params.get('underwear'), ['on', 'off'] as const, 'on') === 'on' },
      dither: oneOf(params.get('dither'), ['on', 'off'] as const, 'on') === 'on',
      outfit: parseIntegerIn(params.get('outfit'), 0, 2, 0),
      preset: oneOf(params.get('preset'), ['vanguard', ''] as const, '') === 'vanguard' ? 'vanguard' : undefined,
      animation: oneOf(params.get('anim'), ['stand', 'walk', 'run', 'off'] as const, 'stand'),
      attach: oneOf(params.get('attach'), ['on', 'off'] as const, 'off') === 'on',
      particles: oneOf(params.get('particles'), ['off', 'sparkles', 'jet'] as const, 'off'),
      ribbon: oneOf(params.get('ribbon'), ['on', 'off'] as const, 'off') === 'on',
      hiddenGeosets: /^\d{1,5}(,\d{1,5}){0,31}$/.test(params.get('hideGeosets') ?? '') ? [...new Set((params.get('hideGeosets') ?? '').split(',').map(Number).filter((id) => id <= 0xffff))] : [],
      animTimeMs: /^\d{1,7}$/.test(params.get('animTime') ?? '') && Number(params.get('animTime')) <= 3_600_000 ? Number(params.get('animTime')) : undefined,
      layout: oneOf(params.get('models'), ['single', 'grove', 'row'] as const, 'single'),
      distanceFade: oneOf(params.get('modelFade'), ['on', 'off'] as const, 'on') === 'on',
      debugMode: oneOf(params.get('modelDebug'), ['lit', 'normals', 'weights', 'bones'] as const, 'lit'),
      palette: oneOf(params.get('textures'), ['procedural', 'solid'] as const, 'procedural'),
      pitchDegrees: pitch >= -89 && pitch <= 89 ? pitch + 0 : 15,
      headingDegrees: parseIntegerIn(params.get('heading'), 0, 359, 30),
      zoom: parseZoom(params.get('zoom')),
    };
  }
  const view = oneOf(params.get('view'), ['oblique', 'above', 'below'] as const, 'oblique');
  const wireframe = oneOf(params.get('wireframe'), ['on', 'off'] as const, 'off') === 'on';
  const streamed = scene === 'stream' || scene === 'zone';
  const debugMode = oneOf(params.get('terrainDebug'), ['color', 'normals', 'textured'] as const, streamed ? 'textured' : 'color');
  const paintChoice = oneOf(params.get('paint'), ['natural', 'quadrants', 'edge', 'shadow', ''] as const, '');
  const liquidChoice = oneOf(params.get('liquid'), ['sea', 'lake', 'classes', 'off', ''] as const, '');
  // Building alpha maps costs time: only when they are shown, or asked for.
  const material = {
    paint: paintChoice !== '' ? paintChoice : debugMode === 'textured' ? ('natural' as const) : undefined,
    palette: oneOf(params.get('textures'), ['procedural', 'solid'] as const, 'procedural'),
    layerRepeatsPerChunk: parseIntegerIn(params.get('layerRepeats'), 1, 64, 4),
    lit: oneOf(params.get('lighting'), ['on', 'off'] as const, 'on') === 'on',
    fog: parseFog(params, streamed),
    sky: oneOf(params.get('sky'), ['on', 'off'] as const, streamed ? 'on' : 'off') === 'on',
    liquid: liquidChoice === '' || liquidChoice === 'off' ? undefined : liquidChoice,
    liquidLevel: parseLevel(params.get('liquidLevel')),
  };
  if (scene === 'chunk') {
    return {
      scene,
      heightKind: oneOf(params.get('height'), ['hill', 'slope', 'flat'] as const, 'hill'),
      view,
      underlay: oneOf(params.get('underlay'), ['on', 'off'] as const, 'off') === 'on',
      holes: parseHoleMask(params.get('holes')),
      wireframe,
      debugMode,
    };
  }
  if (scene === 'stream' || scene === 'zone') {
    const height = oneOf(params.get('height'), ['hills', 'dunes', 'slope', 'flat', ''] as const, '');
    const loadRadius = parseIntegerIn(params.get('loadRadius'), 0, 4, 1);
    return {
      scene,
      ...material,
      focus: parseWorldPoint(params.get('focus'), scene === 'zone' ? { ...TEST_ZONE.focus } : { x: 256, y: 256 }),
      // One tile per frame: building a tile takes a few milliseconds.
      streaming: { loadRadius, unloadRadius: Math.max(loadRadius, parseIntegerIn(params.get('unloadRadius'), 0, 6, loadRadius + 1)), maxLoadsPerUpdate: 1 },
      heightKind: height === '' || scene === 'zone' ? undefined : height,
      view: view === 'above' ? 'above' : 'oblique',
      liquidOff: liquidChoice === 'off',
      zoom: params.get('zoom') === null ? 4 : parseZoom(params.get('zoom')),
      // The zone looks towards the horizon by default, so that the sky shows; the synthetic stream scene keeps its historical view.
      pitchDegrees: params.get('pitch') === null ? (scene === 'zone' ? 20 : undefined) : parseIntegerIn(params.get('pitch'), 1, 89, 20),
      headingDegrees: params.get('heading') === null ? undefined : parseIntegerIn(params.get('heading'), 0, 359, 45),
      farRadius: oneOf(params.get('far'), ['on', 'off'] as const, 'on') === 'off' ? 0 : parseIntegerIn(params.get('farRadius'), 0, 5, 3),
      frameBudgetMs: params.get('frameBudget') === 'off' ? Number.POSITIVE_INFINITY : parseIntegerIn(params.get('frameBudget'), 1, 100, 4),
      stitchTileBorders: oneOf(params.get('tileBorders'), ['stitched', 'raw'] as const, 'stitched') === 'stitched',
      wireframe,
      debugMode,
      chunkBounds: oneOf(params.get('chunkBounds'), ['on', 'off'] as const, 'off') === 'on',
      culling: oneOf(params.get('culling'), ['on', 'off'] as const, 'on') === 'on',
    };
  }
  if (scene === 'map') {
    const height = oneOf(params.get('height'), ['hills', 'dunes', 'slope', 'flat', ''] as const, '');
    return {
      scene,
      ...material,
      map: oneOf(params.get('map'), ['archipel', 'bande'] as const, 'archipel'),
      heightKind: height === '' ? undefined : height,
      view,
      zoom: parseZoom(params.get('zoom')),
      wireframe,
      debugMode,
      chunkBounds: oneOf(params.get('chunkBounds'), ['on', 'off'] as const, 'off') === 'on',
      culling: oneOf(params.get('culling'), ['on', 'off'] as const, 'on') === 'on',
    };
  }
  return {
    scene,
    ...material,
    tile: parseTileCoord(params.get('tile')),
    heightKind: oneOf(params.get('height'), ['hills', 'dunes', 'slope', 'flat'] as const, 'hills'),
    view,
    zoom: parseZoom(params.get('zoom')),
    holes: parseHoleChunks(params.get('holeChunks')),
    wireframe,
    debugMode,
    chunkBounds: oneOf(params.get('chunkBounds'), ['on', 'off'] as const, 'off') === 'on',
    culling: oneOf(params.get('culling'), ['on', 'off'] as const, 'on') === 'on',
    normals: oneOf(params.get('tileNormals'), ['seamless', 'isolated'] as const, 'seamless'),
  };
}
