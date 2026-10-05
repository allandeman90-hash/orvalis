import { describe, expect, it } from 'vitest';
import { type LookAtCamera, viewProjectionMatrix } from '../../src/camera';
import { DepthRange, vec3 } from '../../src/math';
import { NullBackend, SKY_UNIFORM_BYTES } from '../../src/renderer';
import { parseSceneRequest } from '../../src/scenes/select';
import { createTerrainStreamScene } from '../../src/scenes/terrainStream';
import { createTerrainTileScene } from '../../src/scenes/terrainTile';
import { cameraRayBasis, DEFAULT_SKY_SUN, rayDirection, skyColourAt, SkyRenderer, type SkyState, validateSkySun } from '../../src/skyRender';
import { ORVALIS_DEFAULT } from '../../src/terrain';

const close = (a: readonly number[], b: readonly number[], digits = 9): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};
const unit = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const camera: LookAtCamera = { eye: vec3.create(10, -20, 30), target: vec3.create(40, 60, 5), up: vec3.create(0, 0, 1), fovY: Math.PI / 3, near: 1, far: 1000 };
const state: SkyState = { horizon: [0.6, 0.7, 0.8], zenith: [0.2, 0.4, 0.8], sunDirection: unit(1, 0, 1), sunColor: [1, 0.9, 0.7] };

describe('camera ray basis', () => {
  it('rebuilds, for any pixel, the direction of the points the view-projection matrix puts there', () => {
    for (const aspect of [16 / 9, 1, 0.5]) {
      const basis = cameraRayBasis(camera, aspect);
      for (const depthRange of [DepthRange.ZeroToOne, DepthRange.NegOneToOne]) {
        const m = viewProjectionMatrix(new Float32Array(16), camera, aspect, depthRange);
        for (const [dx, dy, dz, distance] of [[0.3, 0.9, -0.2, 50], [0.5, 0.8, 0.3, 200], [0.1, 1, -0.5, 10], [0.6, 0.7, 0.1, 900]] as const) {
          const d = unit(dx, dy, dz);
          const p = [camera.eye[0]! + d[0] * distance, camera.eye[1]! + d[1] * distance, camera.eye[2]! + d[2] * distance];
          const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
          const ndcX = (m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!) / w, ndcY = (m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!) / w;
          expect(w).toBeGreaterThan(0); // in front of the camera
          close(rayDirection(basis, ndcX, ndcY), d, 5);
        }
      }
    }
  });

  it('looks along the camera axis at the centre of the screen, and widens with the aspect ratio', () => {
    const basis = cameraRayBasis(camera, 2);
    close(rayDirection(basis, 0, 0), unit(30, 80, -25), 6); // the basis is stored as 32-bit floats
    expect(Math.hypot(basis[0]!, basis[1]!, basis[2]!)).toBeCloseTo(2 * Math.tan(Math.PI / 6), 6);
    expect(Math.hypot(basis[4]!, basis[5]!, basis[6]!)).toBeCloseTo(Math.tan(Math.PI / 6), 6);
    expect(basis[2]).toBeCloseTo(0, 6); // « right » is horizontal when up is +z
    expect(basis[6]!).toBeGreaterThan(0); // « up » points upwards
  });

  it('refuses a degenerate camera', () => {
    expect(() => cameraRayBasis({ ...camera, target: camera.eye }, 1)).toThrow(/same point/);
    expect(() => cameraRayBasis({ ...camera, eye: vec3.create(0, 0, 0), target: vec3.create(0, 0, 5) }, 1)).toThrow(/parallel/);
    expect(() => cameraRayBasis(camera, 0)).toThrow(/aspect/);
  });
});

describe('sky colour (the shader formula, on the CPU)', () => {
  const noSun: SkyState = { ...state, sunDirection: [0, 0, -1] };

  it('is the horizon colour at and below the horizon, the zenith colour straight up', () => {
    close(skyColourAt(noSun, [1, 0, 0]), [0.6, 0.7, 0.8]);
    close(skyColourAt(noSun, unit(1, 1, -0.5)), [0.6, 0.7, 0.8]);
    close(skyColourAt(noSun, [0, 0, 1]), [0.2, 0.4, 0.8]);
  });

  it('follows 1 − (1 − elevation)³ in between, the same in every compass direction', () => {
    const z = 0.5, g = 1 - 0.5 ** 3;
    const want = [0.6 + (0.2 - 0.6) * g, 0.7 + (0.4 - 0.7) * g, 0.8];
    const h = Math.sqrt(1 - z * z);
    close(skyColourAt(noSun, [h, 0, z]), want);
    close(skyColourAt(noSun, [0, -h, z]), want);
    // Monotonic from horizon to zenith.
    let previous = 0.6;
    for (let e = 0.02; e <= 1; e += 0.02) {
      const red = skyColourAt(noSun, [Math.sqrt(1 - e * e), 0, e])[0];
      expect(red).toBeLessThan(previous);
      previous = red;
    }
  });

  it('shows the sun colour inside the disc, a soft rim, a halo around, and nothing far away', () => {
    const at = (degreesFromSun: number): [number, number, number] => {
      const a = Math.PI / 4 + (degreesFromSun * Math.PI) / 180; // elevation, in the vertical plane of the sun
      return skyColourAt(state, [Math.cos(a), 0, Math.sin(a)]);
    };
    close(at(0), [1, 0.9, 0.7]);
    close(at(2.2), [1, 0.9, 0.7]); // still inside (radius 2.5°, rim 2.3°..2.7°)
    const rim = at(2.5), outside = at(2.9), far = at(40);
    expect(rim[1]).toBeLessThan(0.9);
    expect(rim[1]).toBeGreaterThan(outside[1]);
    // Halo: brighter than the plain gradient just outside the disc, gone at 40°.
    const plainOutside = skyColourAt({ ...state, sunDirection: [0, 0, -1] }, [Math.cos(Math.PI / 4 + (2.9 * Math.PI) / 180), 0, Math.sin(Math.PI / 4 + (2.9 * Math.PI) / 180)]);
    expect(outside[0] - plainOutside[0]).toBeGreaterThan(0.25);
    close(far, skyColourAt({ ...state, sunDirection: [0, 0, -1] }, [Math.cos(Math.PI / 4 + (40 * Math.PI) / 180), 0, Math.sin(Math.PI / 4 + (40 * Math.PI) / 180)]), 6);
  });

  it('hides a sun that is below the horizon, and cuts the disc at the horizon line', () => {
    const set: SkyState = { ...state, sunDirection: unit(1, 0, -0.2) };
    close(skyColourAt(set, unit(1, 0, -0.2)), [0.6, 0.7, 0.8]);
    close(skyColourAt(set, [1, 0, 0]).slice(1), skyColourAt({ ...set, sunColor: [0, 0, 0] }, [1, 0, 0]).slice(1).map((v) => v), 1); // at most a faint trace on the line itself
    const onHorizon: SkyState = { ...state, sunDirection: [1, 0, 0] };
    expect(skyColourAt(onHorizon, unit(1, 0, 0.02))[1]).toBeCloseTo(0.9, 6); // upper half of the disc
    close(skyColourAt(onHorizon, unit(1, 0, -0.02)), [0.6, 0.7, 0.8]); // lower half: horizon colour
  });

  it('never leaves 0..1', () => {
    const bright: SkyState = { horizon: [1, 1, 1], zenith: [1, 1, 1], sunDirection: [0, 0, 1], sunColor: [1, 1, 1] };
    expect(skyColourAt(bright, unit(0.05, 0, 1))).toEqual([1, 1, 1]);
  });

  it('refuses a nonsensical sun shape', () => {
    validateSkySun(DEFAULT_SKY_SUN);
    expect(() => validateSkySun({ ...DEFAULT_SKY_SUN, radiusDegrees: 0 })).toThrow(/radius/);
    expect(() => validateSkySun({ ...DEFAULT_SKY_SUN, edgeDegrees: 0 })).toThrow(/edge/);
    expect(() => validateSkySun({ ...DEFAULT_SKY_SUN, edgeDegrees: 6 })).toThrow(/edge/);
    expect(() => validateSkySun({ ...DEFAULT_SKY_SUN, glow: -1 })).toThrow(/glow/);
  });
});

describe('SkyRenderer', () => {
  it('draws one triangle without touching the depth buffer, with the documented uniforms', () => {
    const backend = new NullBackend();
    const sky = new SkyRenderer(backend);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    sky.draw(camera, 16 / 9, state);
    expect(backend.endFrame()).toEqual({ drawCalls: 1, triangles: 1 });
    const draw = backend.events.find((e) => e.type === 'draw');
    if (draw?.type !== 'draw') throw new Error('no draw');
    expect(backend.pipelineState(draw.call.pipeline)).toMatchObject({ depthTest: false, depthWrite: false, textureCount: 0, uniformBytes: SKY_UNIFORM_BYTES });
    const u = Array.from(draw.call.uniforms!);
    close(u.slice(0, 12), Array.from(cameraRayBasis(camera, 16 / 9)), 6);
    close(u.slice(12, 20), [0.2, 0.4, 0.8, 0, 0.6, 0.7, 0.8, 0], 6);
    close(u.slice(20, 23), state.sunDirection, 6);
    expect(u[23]).toBeCloseTo(Math.cos((2.7 * Math.PI) / 180), 6);
    close(u.slice(24, 28), [1, 0.9, 0.7, 0.35], 6);
    expect(u[28]).toBeCloseTo(1 / (Math.cos((2.3 * Math.PI) / 180) - Math.cos((2.7 * Math.PI) / 180)), 0);
    expect(() => sky.draw(camera, 1, { ...state, sunDirection: [0, 0, 2] })).toThrow(/unit vector/);
    sky.dispose();
    expect(backend.liveBufferCount).toBe(0);
  });
});

describe('sky in the terrain scenes', () => {
  const env = { ambient: [0.3, 0.3, 0.3], diffuse: [0.5, 0.5, 0.5], fogColor: [0.6, 0.7, 0.8], sky: { zenith: [0.2, 0.4, 0.8], sunDirection: unit(0, -1, 1), sunColor: [1, 1, 1] } } as const;
  const skyDraws = (backend: NullBackend): number => backend.events.filter((e) => e.type === 'draw' && backend.pipelineState(e.call.pipeline)?.depthTest === false && e.call.vertexCount === 3).length;

  it('is on by default for the stream and zone scenes, off for the others, and follows &sky=', () => {
    expect(parseSceneRequest('?scene=stream')).toMatchObject({ sky: true });
    expect(parseSceneRequest('?scene=zone')).toMatchObject({ sky: true });
    expect(parseSceneRequest('?scene=stream&sky=off')).toMatchObject({ sky: false });
    expect(parseSceneRequest('?scene=tile')).toMatchObject({ sky: false });
    expect(parseSceneRequest('?scene=tile&sky=on')).toMatchObject({ sky: true });
    expect(parseSceneRequest('?scene=map&sky=on')).toMatchObject({ sky: true });
  });

  it('is drawn first, once per frame, in textured mode only, once the environment is known', () => {
    const backend = new NullBackend();
    const scene = createTerrainTileScene(backend, { config: ORVALIS_DEFAULT, tile: { x: 0, y: 0 }, heightKind: 'flat', view: 'oblique', debugMode: 'textured', paint: 'quadrants', sky: true });
    expect(scene.terrain.sky).toBe(true);
    scene.render(16 / 9);
    expect(skyDraws(backend)).toBe(0); // no environment yet
    scene.setEnvironment(env);
    backend.events.length = 0;
    const stats = scene.render(16 / 9);
    expect(skyDraws(backend)).toBe(1);
    expect(stats.triangles).toBe(scene.terrain.triangles + 1);
    const draws = backend.events.filter((e) => e.type === 'draw');
    const first = draws[0]!;
    if (first.type !== 'draw') throw new Error('no draw');
    expect(backend.pipelineState(first.call.pipeline)!.depthTest).toBe(false); // the sky is the background
    close(Array.from(first.call.uniforms!.slice(16, 19)), [0.6, 0.7, 0.8], 6); // horizon = fog colour
    // Debug views and wireframe keep their plain background.
    for (const change of [() => scene.setDebugMode('normals'), () => (scene.setDebugMode('textured'), scene.setWireframe(true))]) {
      change();
      backend.events.length = 0;
      scene.render(16 / 9);
      expect(skyDraws(backend)).toBe(0);
    }
    scene.setWireframe(false);
    // K: off, then on again.
    expect(scene.toggleSky()).toBe(false);
    backend.events.length = 0;
    scene.render(16 / 9);
    expect(skyDraws(backend)).toBe(0);
    expect(scene.toggleSky()).toBe(true);
    backend.events.length = 0;
    scene.render(16 / 9);
    expect(skyDraws(backend)).toBe(1);
    const buffers = backend.liveBufferCount;
    scene.dispose();
    expect(backend.liveBufferCount).toBeLessThan(buffers);
    expect(backend.liveBufferCount).toBe(0);
  });

  it('the stream camera can be pitched and turned around the focus without changing its distance', () => {
    expect(parseSceneRequest('?scene=zone')).toMatchObject({ pitchDegrees: 20, headingDegrees: undefined });
    expect(parseSceneRequest('?scene=stream')).toMatchObject({ pitchDegrees: undefined, headingDegrees: undefined });
    expect(parseSceneRequest('?scene=stream&pitch=5&heading=180')).toMatchObject({ pitchDegrees: 5, headingDegrees: 180 });
    expect(parseSceneRequest('?scene=zone&pitch=0&heading=400')).toMatchObject({ pitchDegrees: 20, headingDegrees: 45 }); // out of range → defaults
    const options = { config: ORVALIS_DEFAULT, focus: { x: 256, y: 256 }, streaming: { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 }, view: 'oblique', heightKind: 'flat', frameBudgetMs: Number.POSITIVE_INFINITY, debugMode: 'textured', paint: 'quadrants', sky: true } as const;
    const basisOf = (extra: object): number[] => {
      const backend = new NullBackend();
      const scene = createTerrainStreamScene(backend, { ...options, ...extra });
      scene.setEnvironment(env);
      scene.render(1);
      const draw = backend.events.find((e) => e.type === 'draw');
      if (draw?.type !== 'draw') throw new Error('no draw');
      return Array.from(draw.call.uniforms!.slice(0, 12));
    };
    // The explicit default (pitch 35.26°, heading 45°) is the historical view.
    close(basisOf({ pitchDegrees: (Math.atan(Math.SQRT1_2) * 180) / Math.PI, headingDegrees: 45 }), basisOf({}), 5);
    close(basisOf({}).slice(8, 11), unit(1, 1, -1), 5);
    // Looking south, 10° below the horizontal.
    close(basisOf({ pitchDegrees: 10, headingDegrees: 180 }).slice(8, 11), [0, -Math.cos(Math.PI / 18), -Math.sin(Math.PI / 18)], 5);
    expect(() => createTerrainStreamScene(new NullBackend(), { ...options, pitchDegrees: 90 })).toThrow(/pitch/);
  });

  it('costs nothing when it is off: no pipeline, no buffer, until it is switched on', () => {
    const off = new NullBackend(), on = new NullBackend();
    const a = createTerrainStreamScene(off, { config: ORVALIS_DEFAULT, focus: { x: 256, y: 256 }, streaming: { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 }, view: 'oblique', heightKind: 'flat', frameBudgetMs: Number.POSITIVE_INFINITY });
    const b = createTerrainStreamScene(on, { config: ORVALIS_DEFAULT, focus: { x: 256, y: 256 }, streaming: { loadRadius: 0, unloadRadius: 0, maxLoadsPerUpdate: 1 }, view: 'oblique', heightKind: 'flat', frameBudgetMs: Number.POSITIVE_INFINITY, sky: true });
    expect(a.terrain.sky).toBe(false);
    expect(on.liveBufferCount).toBe(off.liveBufferCount + 1);
    a.toggleSky();
    expect(off.liveBufferCount).toBe(on.liveBufferCount);
    b.dispose();
    a.dispose();
  });
});
