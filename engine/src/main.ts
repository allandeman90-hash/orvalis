import { AssetManager, httpFetchBytes } from './assets';
import { DEFAULT_FIXED_STEPPER_CONFIG } from './core/fixedStepper';
import { browserScheduler, MainLoop } from './core/mainLoop';
import { DebugOverlay, FrameTimeStats } from './debug';
import { bootBanner } from './engineInfo';
import { azimuthElevationOf, DEFAULT_WORLD_CLOCK_CONFIG, type Direction, type EnvironmentSample, lightingSunDirection, ORVALIS_DAY_CYCLE, parseWorldClockRequest, sampleDayCycle, UNITS_PER_HOUR, visibleSunDirection, WorldClock } from './environment';
import {
  BACKEND_DISPLAY_NAME,
  createRendererBackend,
  parseRendererRequest,
  type RendererBackend,
  type RendererDebug,
  RendererUnavailableError,
  WebGL2Backend,
  WebGPUBackend,
} from './renderer';
import { createFirstTriangleScene, type Scene } from './scenes/firstTriangle';
import { type BuildingScene, createBuildingScene } from './scenes/buildingScene';
import { bindCameraPointer } from './input/cameraPointer';
import { CAMERA_SCENE_CHARACTER_SCALES, type CameraScene, createCameraScene } from './scenes/cameraScene';
import { createModelScene, type ModelScene } from './scenes/modelScene';
import { parseSceneRequest } from './scenes/select';
import { createTerrainChunkScene, type TerrainChunkScene } from './scenes/terrainChunk';
import { createTerrainMapScene } from './scenes/terrainMap';
import { sceneMaterial } from './scenes/terrainMaterial';
import { createTerrainStreamScene, type StreamWorld, type TerrainStreamScene } from './scenes/terrainStream';
import { testZoneWorld } from './scenes/testZone';
import { createTerrainTileScene, type TerrainTileScene } from './scenes/terrainTile';
import { buildFixtureWorld, ORVALIS_DEFAULT, TEST_ZONE } from './terrain';

type Backend = RendererBackend & RendererDebug;

/** Debug camera: how fast the streaming focus moves while a movement key is held. */
const FOCUS_SPEED_TILES_PER_SECOND = 0.5;
/** Number keys that change what the character's texture is made of. */
const SKIN_KEYS: Readonly<Record<string, 'skinColor' | 'faceType' | 'hairColor'>> = { Digit5: 'skinColor', Digit6: 'faceType', Digit7: 'hairColor' };
/** Number keys that show the next variant of a character section. */
const LOOK_KEYS: Readonly<Record<string, 'hair' | 'facialHair' | 'gloves' | 'boots'>> = { Digit1: 'hair', Digit2: 'facialHair', Digit3: 'gloves', Digit4: 'boots' };
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Space']);

/** Time of day used when the day/night cycle is switched off. */
const NOON_UNITS = 1440;

/** Upload budget per frame, so a burst of finished downloads cannot stall one frame. */
const MAX_ASSET_UPLOADS_PER_FRAME = 2;

/** Starts the new engine in the current document. Called by the bootstrap in `new` mode. */
export async function startEngine(): Promise<void> {
  const status = document.getElementById('boot-status');
  const overlayElement = document.getElementById('debug-overlay');
  let canvas = document.getElementById('game');
  if (!status || !overlayElement || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('engine: #boot-status, #debug-overlay or #game canvas missing from index.html');
  }

  const request = parseRendererRequest(window.location.search);
  let selection;
  try {
    selection = await createRendererBackend<HTMLCanvasElement, Backend>(request, {
      canvas: () => canvas as HTMLCanvasElement,
      resetCanvas: () => {
        // A canvas that was asked for one kind of context cannot provide another.
        const fresh = (canvas as HTMLCanvasElement).cloneNode(false) as HTMLCanvasElement;
        (canvas as HTMLCanvasElement).replaceWith(fresh);
        canvas = fresh;
      },
      log: (message) => console.warn(message),
      factories: { webgpu: (c) => WebGPUBackend.create(c), webgl2: (c) => WebGL2Backend.create(c) },
    });
  } catch (e) {
    if (!(e instanceof RendererUnavailableError)) throw e;
    // Visible failure: never pretend a backend is running.
    const reasons = e.attempts.map((a) => `${BACKEND_DISPLAY_NAME[a.kind]} : ${a.reason ?? 'erreur inconnue'}`).join('\n');
    status.textContent = `Renderer: indisponible\n${reasons}\n${bootBanner()}`;
    status.dataset.rendererError = e.message;
    status.dataset.state = 'backend-error';
    console.error(`[renderer] ${e.message}`);
    return;
  }

  const { backend, kind, fellBack, attempts } = selection;
  const view = canvas;
  const sceneRequest = parseSceneRequest(window.location.search);
  let scene: Scene;
  let chunkScene: TerrainChunkScene | undefined;
  let tileScene: TerrainTileScene | undefined;
  let streamScene: TerrainStreamScene | undefined;
  let modelScene: ModelScene | undefined;
  let buildingScene: BuildingScene | undefined;
  let cameraScene: CameraScene | undefined;
  if (sceneRequest.scene === 'triangle') {
    scene = createFirstTriangleScene(backend);
  } else if (sceneRequest.scene === 'camera') {
    cameraScene = createCameraScene(backend, sceneRequest);
    scene = cameraScene;
  } else if (sceneRequest.scene === 'building') {
    buildingScene = createBuildingScene(backend, sceneRequest);
    scene = buildingScene;
  } else if (sceneRequest.scene === 'model') {
    modelScene = createModelScene(backend, sceneRequest);
    scene = modelScene;
  } else if (sceneRequest.scene === 'tile') {
    tileScene = createTerrainTileScene(backend, { config: ORVALIS_DEFAULT, ...sceneRequest });
    chunkScene = tileScene;
    scene = tileScene;
  } else if (sceneRequest.scene === 'map') {
    // Two maps exist in the world; the scene shows the one that was asked for.
    const { paint, material } = sceneMaterial(ORVALIS_DEFAULT, sceneRequest);
    const map = buildFixtureWorld(ORVALIS_DEFAULT, sceneRequest.heightKind, paint).get(sceneRequest.map);
    if (!map) throw new Error(`engine: unknown map "${sceneRequest.map}"`);
    tileScene = createTerrainMapScene(backend, { ...sceneRequest, map, material });
    chunkScene = tileScene;
    scene = tileScene;
  } else if (sceneRequest.scene === 'chunk') {
    chunkScene = createTerrainChunkScene(backend, { config: ORVALIS_DEFAULT, ...sceneRequest });
    scene = chunkScene;
  } else {
    // 'stream' or 'zone'
    let world: StreamWorld | undefined;
    if (sceneRequest.scene === 'zone') {
      // Boot-time load (before the main loop starts): the zone is the map itself. A failure is shown, never hidden.
      try {
        world = testZoneWorld(ORVALIS_DEFAULT, await httpFetchBytes()(TEST_ZONE.url));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        status.textContent = `Zone de test : chargement impossible\n${message}\n${bootBanner()}`;
        status.dataset.zoneError = message;
        status.dataset.state = 'zone-error';
        console.error(`[zone] ${message}`);
        return;
      }
    }
    streamScene = createTerrainStreamScene(backend, { config: ORVALIS_DEFAULT, ...sceneRequest, world });
    tileScene = streamScene;
    chunkScene = streamScene;
    scene = streamScene;
  }

  const fitCanvas = (): void => {
    const dpr = window.devicePixelRatio || 1;
    backend.resize(Math.max(1, Math.round(view.clientWidth * dpr)), Math.max(1, Math.round(view.clientHeight * dpr)));
  };
  const renderFrame = () => {
    fitCanvas();
    return scene.render(view.width / view.height);
  };

  const failed = attempts.filter((a) => !a.ok);
  const fallbackNote = fellBack ? failed.map((a) => `${BACKEND_DISPLAY_NAME[a.kind]} indisponible : ${a.reason}`).join(' ; ') : '';

  // Assets: downloads run in the background, GPU uploads are spread over frames.
  const assets = new AssetManager(httpFetchBytes());
  const TextAsset = assets.registerLoader('text', {
    decode: (bytes: ArrayBuffer) => new TextDecoder().decode(bytes),
    upload: (text: string) => text,
  });

  // World clock (P2.1). No server yet: it starts from the URL (or noon) and advances locally; a time sync
  // re-anchors it (test hook below). The day/night cycle (P2.2) is sampled from it every frame and gives the
  // terrain its light colours and its fog colour.
  const clockRequest = parseWorldClockRequest(window.location.search);
  const worldClock = new WorldClock(clockRequest.startUnits, performance.now(), { ...DEFAULT_WORLD_CLOCK_CONFIG, daySeconds: clockRequest.daySeconds }, clockRequest.speed);

  let environment: EnvironmentSample | undefined;
  let lightingSun: Direction | undefined, visibleSun: Direction | undefined;
  let pausedSpeed: number | undefined; // speed to return to when the clock was paused with P

  const overlay = new DebugOverlay(overlayElement);
  const frameTimes = new FrameTimeStats();
  let lastStats = { drawCalls: 0, triangles: 0 };
  let readyAnnounced = false;

  // Keys currently held, for moving the streaming focus.
  const held = new Set<string>();
  // Keys pressed since the last simulation step. A tap shorter than a frame (pressed AND released between two
  // steps) would otherwise never be seen by the simulation: a jump would be lost.
  const tapped = new Set<string>();
  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) {
      if (streamScene || (cameraScene && (event.code.startsWith('Arrow') || event.code === 'Space'))) event.preventDefault(); // the arrows and Space must not scroll the page
      held.add(event.code);
      tapped.add(event.code);
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    tapped.clear();
  });

  const loop = new MainLoop(browserScheduler(), {
    // First real use of the fixed-step simulation: the streaming focus moves at a constant world speed.
    fixedUpdate: () => {
      // Movement (Phase 8) runs on the fixed simulation step, from the keys held now.
      if (cameraScene) {
        if (tapped.size === 0) cameraScene.fixedStep(DEFAULT_FIXED_STEPPER_CONFIG.stepMs, held);
        else {
          cameraScene.fixedStep(DEFAULT_FIXED_STEPPER_CONFIG.stepMs, new Set([...held, ...tapped]));
          tapped.clear();
        }
      }
      if (!streamScene) return;
      const dx = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      const dy = (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0) - (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const step = (FOCUS_SPEED_TILES_PER_SECOND * ORVALIS_DEFAULT.tileSize * DEFAULT_FIXED_STEPPER_CONFIG.stepMs) / 1000;
        streamScene.moveFocus(dx * step, dy * step);
      }
    },
    render: (frame) => {
      assets.pump(MAX_ASSET_UPLOADS_PER_FRAME);
      // Liquid animation (spec §23): real time, not game time — the water does not speed up with the day.
      tileScene?.setAnimationTime(clockRequest.liquidTimeMs ?? performance.now());
      buildingScene?.setAnimationTime(clockRequest.liquidTimeMs ?? performance.now());
      if (tileScene && (clockRequest.dayCycle || !environment)) {
        // dayCycle=off: the environment is taken once, at noon, and never changes.
        const time = clockRequest.dayCycle ? worldClock.timeAt(performance.now()) : NOON_UNITS;
        environment = sampleDayCycle(ORVALIS_DAY_CYCLE, time);
        // Two suns (P2.3): the terrain is lit from the LIGHTING sun; the visible one is only computed for now
        // (the sky that will draw its disc is P2.4).
        lightingSun = lightingSunDirection(time);
        visibleSun = visibleSunDirection(time);
        tileScene.setEnvironment({ ...environment, toLight: lightingSun, sky: { zenith: environment.skyZenith, sunDirection: visibleSun, sunColor: environment.sunColor } });
      }
      // Model animation runs on real time, like the liquids.
      modelScene?.advanceAnimation(frame.frameDeltaMs);
      buildingScene?.advance(frame.frameDeltaMs);
      cameraScene?.advance(frame.frameDeltaMs);
      lastStats = renderFrame();
      frameTimes.push(frame.frameDeltaMs);
      overlay.update(performance.now(), () => ({
        engineMode: 'new',
        backend: kind,
        ...(fallbackNote ? { fallbackNote } : {}),
        fps: frameTimes.fps,
        frameMs: frameTimes.averageMs,
        frameMaxMs: frameTimes.maxMs,
        drawCalls: lastStats.drawCalls,
        triangles: lastStats.triangles,
        canvasWidth: view.width,
        canvasHeight: view.height,
        simulationHz: 1000 / DEFAULT_FIXED_STEPPER_CONFIG.stepMs,
        simulationSteps: loop.stepsSimulated,
        assets: assets.counts(),
        ...(environment && clockRequest.dayCycle ? { dayCycle: { from: environment.from, to: environment.to, blend: environment.blend } } : {}),
        ...(lightingSun && visibleSun ? { suns: { lighting: azimuthElevationOf(lightingSun), visible: azimuthElevationOf(visibleSun) } } : {}),
        worldTime: { units: worldClock.timeAt(performance.now()), daySeconds: worldClock.config.daySeconds, speed: worldClock.speedMultiplier, syncs: worldClock.syncCount },
        ...(chunkScene ? { terrain: chunkScene.terrain } : {}),
        ...(modelScene ? { models: modelScene.models } : {}),
        ...(buildingScene ? { building: buildingScene.building } : {}),
        ...(cameraScene ? { camera: cameraScene.cameraStats } : {}),
      }));
      // Machine-readable copy for the smoke test.
      status.dataset.frames = String(loop.framesRendered + 1);
      status.dataset.steps = String(loop.stepsSimulated);
      status.dataset.drawCalls = String(lastStats.drawCalls);
      status.dataset.triangles = String(lastStats.triangles);
      if (chunkScene) status.dataset.wireframe = chunkScene.terrain.wireframe ? 'on' : 'off';
      // « ready » is announced once the FIRST frame is drawn and the overlay filled — not when the loop is merely
      // started: whoever waits for it (the smoke tests) may read the overlay and the frame right away.
      if (!readyAnnounced) {
        readyAnnounced = true;
        status.dataset.state = 'ready';
      }
    },
  });

  // Camera scene: the mouse on the canvas (spec §189) — left drag = camera alone, right drag = camera + character,
  // both = move forward; wheel = zoom. See input/cameraPointer.ts for how a web page is kept from breaking a drag.
  if (cameraScene) {
    const controlled = cameraScene;
    canvas.style.touchAction = 'none';
    bindCameraPointer(canvas, window, document, {
      update: (buttons, dx, dy) => controlled.pointer(buttons, dx, dy),
      release: () => controlled.releasePointer(),
      wheel: (direction) => controlled.zoom(direction),
    });
  }

  // PageUp / PageDown move the world clock by one game hour, P pauses it.
  // F3 shows/hides the debug overlay, F4 switches the terrain between filled and wireframe, B shows chunk bounds, C switches frustum culling, L switches terrain lighting, F the fog, T the far terrain, K the sky, O the liquids, M the model debug views, N the skeleton lines, J the test pose, H the attached ornament, G the particles, R the ribbon, 1 / 2 / 3 / 4 the character's hair / facial hair / gloves / boots, 5 / 6 / 7 its skin tone / face / hair colour, 8 its outfit, 9 stand / walk / run, Space jump, X attack.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'F3') {
      event.preventDefault();
      overlay.toggle();
    } else if (event.code === 'F4' && chunkScene) {
      event.preventDefault();
      chunkScene.toggleWireframe();
      overlay.setVisible(overlay.visible); // forces an immediate refresh when visible
    } else if (event.code === 'KeyB' && tileScene) {
      tileScene.toggleChunkBounds();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyT' && tileScene) {
      tileScene.toggleFar();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyF' && tileScene) {
      tileScene.toggleFog();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyL' && tileScene) {
      tileScene.toggleLighting();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'PageUp' || event.code === 'PageDown') {
      // Debug: one game hour forward / back.
      event.preventDefault();
      const now = performance.now();
      worldClock.setTime(worldClock.timeAt(now) + (event.code === 'PageUp' ? UNITS_PER_HOUR : -UNITS_PER_HOUR), now);
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyP') {
      // Debug: pause / resume the world clock.
      const now = performance.now();
      if (pausedSpeed === undefined) {
        pausedSpeed = worldClock.speedMultiplier === 0 ? 1 : worldClock.speedMultiplier;
        worldClock.setSpeed(0, now);
      } else {
        worldClock.setSpeed(pausedSpeed, now);
        pausedSpeed = undefined;
      }
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyN' && modelScene) {
      modelScene.toggleSkeleton();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'Digit9' && modelScene) {
      modelScene.cycleLocomotion();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'Space' && modelScene) {
      event.preventDefault();
      modelScene.characterJump();
    } else if (event.code === 'KeyX' && modelScene) {
      modelScene.characterAttack();
    } else if (event.code === 'Digit8' && modelScene) {
      modelScene.cycleOutfit();
      overlay.setVisible(overlay.visible);
    } else if (modelScene && SKIN_KEYS[event.code]) {
      modelScene.cycleSkin(SKIN_KEYS[event.code]!);
      overlay.setVisible(overlay.visible);
    } else if (modelScene && LOOK_KEYS[event.code]) {
      modelScene.cycleLook(LOOK_KEYS[event.code]!);
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyR' && modelScene) {
      modelScene.toggleRibbon();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyG' && modelScene) {
      modelScene.toggleParticles();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyH' && modelScene) {
      modelScene.toggleAttachments();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyJ' && modelScene) {
      modelScene.cyclePose();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyF' && cameraScene) {
      cameraScene.cycleFollowMode();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyC' && cameraScene) {
      cameraScene.toggleCollision();
      overlay.setVisible(overlay.visible);
    } else if (cameraScene && /^Digit[1-3]$/.test(event.code)) {
      cameraScene.setCharacterScale(CAMERA_SCENE_CHARACTER_SCALES[Number(event.code.slice(5)) - 1]!);
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyN' && buildingScene) {
      buildingScene.cycleDoodadSet();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyI' && buildingScene) {
      buildingScene.toggleVisibility();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyO' && buildingScene) {
      buildingScene.togglePortals();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyL' && buildingScene) {
      buildingScene.toggleLiquids();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyC' && buildingScene) {
      buildingScene.cycleCollisionView();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyV' && buildingScene) {
      buildingScene.toggleDoodads();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyM' && buildingScene) {
      buildingScene.cycleDebugMode();
      overlay.setVisible(overlay.visible);
    } else if (buildingScene && /^Digit[1-9]$/.test(event.code)) {
      buildingScene.toggleGroup(Number(event.code.slice(5)) - 1);
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyM' && modelScene) {
      modelScene.cycleDebugMode();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyO' && tileScene) {
      tileScene.toggleLiquid();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyK' && tileScene) {
      tileScene.toggleSky();
      overlay.setVisible(overlay.visible);
    } else if (event.code === 'KeyC' && tileScene) {
      tileScene.toggleCulling();
      overlay.setVisible(overlay.visible);
    }
  });

  // Test hook: render synchronously, then read pixels before the browser presents.
  (window as unknown as { __orvalisEngine: unknown }).__orvalisEngine = {
    backend: kind,
    // Model scene only: where a model-space point is on the screen (fractions from the top left), in the last frame.
    projectModelPoint: (point: [number, number, number]) => modelScene?.projectToScreen(point) ?? null,
    // Character only: a texel of its composite texture ([r, g, b, a], x and y from the top left), and what the last
    // change of its look made the composite rebuild.
    getCharacterTexel: (x: number, y: number) => modelScene?.characterTexel(x, y) ?? null,
    getCharacterTexture: () => (modelScene?.models.skin ? { skin: modelScene.models.skin, rebuilt: modelScene.models.textureRebuilt, regionsRebuilt: modelScene.models.textureRegionsRebuilt, outfit: modelScene.models.outfit, equipment: modelScene.models.equipment, attached: modelScene.models.attached } : null),
    // Animated character only: its animation machine — what it is trying to do, events, and its present state.
    setCharacterLocomotion: (locomotion: 'stand' | 'walk' | 'run') => modelScene?.setLocomotion(locomotion),
    characterJump: () => modelScene?.characterJump() ?? false,
    characterAttack: () => modelScene?.characterAttack() ?? false,
    characterLand: () => modelScene?.characterLand(),
    getCharacterState: () => (modelScene?.models.characterState ? { state: modelScene.models.characterState, locomotion: modelScene.models.locomotion, animation: modelScene.models.animation ?? null } : null),
    // Character only: wears exactly these items of the test catalogue (keys of ITEMS, at most one per slot).
    setCharacterEquipment: (items: string[]) => modelScene?.setEquipment(items as never),
    // Model scene only: per tree, the world centre of its bounding sphere and its distance fade; and where a
    // world point is on the screen.
    getModelFades: () => modelScene?.fades ?? null,
    projectWorldPoint: (point: [number, number, number]) => modelScene?.projectWorldToScreen(point) ?? buildingScene?.projectWorldToScreen(point) ?? cameraScene?.projectWorldToScreen(point) ?? null,
    // Camera scene only: the gameplay camera's state, and a mouse drag in pixels (as a left-button drag does).
    getCamera: () => cameraScene?.cameraStats ?? null,
    cameraDrag: (dx: number, dy: number) => cameraScene?.drag(dx, dy),
    // Camera scene only: forces « the character is moving » for the follow (tests).
    setCameraMoving: (moving: boolean) => cameraScene?.setMoving(moving),
    // Camera scene only: puts the character's feet at a world position at once (tests).
    setCharacterPosition: (position: [number, number, number]) => cameraScene?.placeCharacter(position),
    // Camera scene only: the character's size (the pivot follows at 1.2 yards per second).
    setCharacterScale: (scale: number) => cameraScene?.setCharacterScale(scale),
    // Camera scene only: mouse-wheel steps (negative = closer).
    cameraZoom: (steps: number) => cameraScene?.zoom(steps),
    // Building scene only: what was drawn in the last frame.
    getBuilding: () => buildingScene?.building ?? null,
    // Building scene only, inside view: moves the camera (the room, the visible groups and the fog follow).
    setBuildingEye: (point: [number, number, number]) => buildingScene?.setEye(point),
    // Building scene only: the room(s) a point is in (0, 1 or 2 groups), with an optional terrain height under it.
    buildingRoomAt: (point: [number, number, number], terrainHeight?: number | null) => buildingScene?.roomAt(point, terrainHeight) ?? null,
    // Building scene only: a ray against a collision set ('player' | 'camera'), in world units.
    buildingRaycast: (origin: [number, number, number], direction: [number, number, number], maxDistance: number, kind: 'player' | 'camera') => buildingScene?.raycast(origin, direction, maxDistance, kind) ?? null,
    // Model scene only: live particle `index` of the first tree ({ position, age }) or null; and how many are alive.
    getModelParticle: (index: number) => modelScene?.particleAt(index) ?? null,
    getModelParticleCount: () => modelScene?.models.liveParticles ?? 0,
    // Model scene only: committed edge `index` of the first tree's ribbon ({ top, bottom, age }) or null; and the edge count.
    getModelRibbonEdge: (index: number) => modelScene?.ribbonEdgeAt(index) ?? null,
    getModelRibbonEdgeCount: () => modelScene?.models.ribbonEdges ?? 0,
    // Model scene only: the animation playing right now (or null), and a manual step of its clocks (works when frozen).
    getModelAnimation: () => modelScene?.models.animation ?? null,
    stepModelAnimation: (ms: number) => modelScene?.stepAnimation(ms),
    // Streaming scene only: teleports the focus (world units).
    setFocus: (x: number, y: number) => streamScene?.setFocus(x, y),
    // The focus right now (the overlay only refreshes a few times per second).
    getFocus: () => streamScene?.focus ?? null,
    // World clock: the time shown right now (units 0..2880, continuous), and a time sync as a server would send it.
    getWorldTime: () => worldClock.timeAt(performance.now()),
    // The two sun directions used for the last frame (unit vectors towards the sun), or null without day cycle.
    getSuns: () => (lightingSun && visibleSun ? { lighting: [...lightingSun], visible: [...visibleSun] } : null),
    syncWorldTime: (units: number, snap = false) => worldClock.sync(units, performance.now(), { snap }),
    // Loads a text asset through the engine's own manager and main loop, and
    // reports every state it went through. Used by the smoke test.
    loadText: (url: string) =>
      new Promise((resolve) => {
        const handle = assets.request(TextAsset, url);
        const states: string[] = [];
        const watch = (): void => {
          const state = assets.state(handle);
          if (states.at(-1) !== state) states.push(state);
          if (state === 'ready' || state === 'failed') {
            resolve({ states, text: assets.get(handle) ?? null, error: assets.error(handle)?.message ?? null });
            assets.release(handle);
            assets.evict();
            return;
          }
          requestAnimationFrame(watch);
        };
        watch();
      }),
    probe: async (points: ReadonlyArray<readonly [number, number]>) => {
      renderFrame();
      const coords = points.map(
        ([fx, fy]) => [Math.min(view.width - 1, Math.floor(fx * view.width)), Math.min(view.height - 1, Math.floor(fy * view.height))] as const,
      );
      const pixels = await backend.readPixels(coords); // called synchronously after the render
      const errors = await backend.drainErrors();
      return { width: view.width, height: view.height, pixels, errors };
    },
  };

  // The boot banner gives way to the overlay once a backend runs; it stays the
  // place where a renderer failure is shown.
  status.textContent = bootBanner();
  status.hidden = true;
  overlay.setVisible(true);
  status.dataset.backend = kind;
  status.dataset.fellBack = String(fellBack);
  status.dataset.scene = sceneRequest.scene;
  status.dataset.requested = request.preference + (request.forceWebGPU ? '+force' : '');
  loop.start();
}

