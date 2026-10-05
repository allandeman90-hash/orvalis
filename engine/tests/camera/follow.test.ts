import { describe, expect, it } from 'vitest';
import { CAMERA_FOLLOW_MODE_CODE, CAMERA_FOLLOW_MODES, CameraFollow, OrbitCamera, RECENTER_MAX_SECONDS, RECENTER_MIN_SECONDS, recenterDuration, recenterEase, shortestTurn } from '../../src/camera';
import { formatOverlay } from '../../src/debug';
import { NullBackend } from '../../src/renderer';
import { createCameraScene } from '../../src/scenes/cameraScene';
import { parseSceneRequest } from '../../src/scenes/select';

const input = (cameraYaw: number, characterYaw: number, moving = false, userTurning = false) => ({ cameraYaw, characterYaw, moving, userTurning });

describe('camera follow (spec §190)', () => {
  it('the modes are 0 Never, 1 Smart, 2 Always; the timing is bounded by 0.1 s and 2.0 s', () => {
    expect(CAMERA_FOLLOW_MODES).toEqual(['never', 'smart', 'always']);
    expect(CAMERA_FOLLOW_MODE_CODE).toEqual({ never: 0, smart: 1, always: 2 });
    expect([RECENTER_MIN_SECONDS, RECENTER_MAX_SECONDS]).toEqual([0.1, 2]);
    expect(new CameraFollow().mode).toBe('smart');
  });
  it('the easing is e(t) = (1 − cos(π·t)) / 2', () => {
    expect([0, 0.5, 1].map(recenterEase)).toEqual([0, expect.closeTo(0.5, 12), 1]);
    expect(recenterEase(0.25)).toBeCloseTo((1 - Math.SQRT1_2) / 2, 12);
    expect(recenterEase(0.75)).toBeCloseTo((1 + Math.SQRT1_2) / 2, 12);
    expect([recenterEase(-1), recenterEase(2)]).toEqual([0, 1]);
  });
  it('the shortest turn between two headings', () => {
    expect([shortestTurn(10, 50), shortestTurn(50, 10), shortestTurn(350, 10), shortestTurn(10, 350), shortestTurn(0, 180)]).toEqual([40, -40, 20, -20, -180]);
  });
  it('the duration grows with the angle: 2 s for half a turn, never under 0.1 s', () => {
    expect([180, 90, 45, 9, 1, 0].map(recenterDuration)).toEqual([2, 1, 0.5, 0.1, 0.1, 0.1]);
    expect(recenterDuration(-90)).toBe(1);
  });
});

describe('recentring', () => {
  it('Always: 90° takes 1 s, along the cosine easing, and ends exactly behind the character', () => {
    const follow = new CameraFollow('always');
    expect(follow.update(250, input(90, 0))).toBeCloseTo(90 * (1 - recenterEase(0.25)), 9);
    expect([follow.recentering, follow.progress]).toEqual([true, 0.25]);
    expect(follow.update(250, input(77, 0))).toBeCloseTo(45, 9); // half-way in time = half-way in angle
    expect(follow.update(250, input(45, 0))).toBeCloseTo(90 * (1 - recenterEase(0.75)), 9);
    expect(follow.update(250, input(13, 0))).toBe(0);
    expect(follow.recentering).toBe(false);
    expect(follow.update(16, input(0, 0))).toBeNull(); // nothing left to do
  });
  it('it starts and ends slowly: the first and last tenths of the time cover little of the angle', () => {
    const follow = new CameraFollow('always');
    const first = follow.update(200, input(180, 0))!;
    expect(180 - first).toBeLessThan(180 * 0.03); // 10 % of the time, under 3 % of the way
    expect(follow.update(800, input(first, 0))).toBeCloseTo(90, 9);
  });
  it('by the shortest way, across 0', () => {
    const follow = new CameraFollow('always');
    const yaw = follow.update(100, input(350, 20))!; // +30°, not −330°
    expect(yaw > 350 || yaw < 20).toBe(true);
    follow.update(1000, input(yaw, 20));
    expect(follow.update(1000, input(20, 20))).toBeNull();
  });
  it('Never: the camera is left alone', () => {
    const follow = new CameraFollow('never');
    expect(follow.update(1000, input(90, 0, true))).toBeNull();
    expect(follow.recentering).toBe(false);
  });
  it('Smart: only while the character moves', () => {
    const follow = new CameraFollow('smart');
    expect(follow.update(100, input(90, 0, false))).toBeNull(); // standing: look around freely
    expect(follow.update(100, input(90, 0, true))).not.toBeNull();
    expect(follow.recentering).toBe(true);
    expect(follow.update(100, input(80, 0, false))).toBeNull(); // it stops: the recentring is dropped
    expect(follow.recentering).toBe(false);
  });
  it('never while a mouse button turns the camera, in any mode; released, it starts afresh from where the camera is', () => {
    const follow = new CameraFollow('always');
    follow.update(500, input(90, 0));
    expect(follow.update(100, input(45, 0, true, true))).toBeNull();
    expect(follow.recentering).toBe(false);
    // The player left the camera at 60°: a new recentring of 60° (0.667 s), from its start.
    const yaw = follow.update(0, input(60, 0))!;
    expect(yaw).toBe(60);
    expect(follow.progress).toBe(0);
    expect(follow.update(333.3333, input(60, 0))).toBeCloseTo(30, 3);
  });
  it('the character turns during the recentring: the camera ends on its new heading', () => {
    const follow = new CameraFollow('always');
    follow.update(500, input(90, 0)); // half of 1 s
    expect(follow.update(500, input(45, 30))).toBe(30);
  });
  it('rejects a negative time step', () => {
    expect(() => new CameraFollow().update(-1, input(0, 0))).toThrow(/time step/);
  });
});

describe('OrbitCamera.setYaw', () => {
  it('sets the heading, wrapped; the pitch stays', () => {
    const camera = new OrbitCamera({ pitchDegrees: 30 });
    camera.setYaw(370);
    expect([camera.yaw, camera.pitch]).toEqual([10, 30]);
    camera.setYaw(-90);
    expect(camera.yaw).toBe(270);
    expect(() => camera.setYaw(NaN)).toThrow(/yaw/);
  });
});

describe('scene=camera: follow', () => {
  const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
  const line = (scene: ReturnType<typeof createCameraScene>) => formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Follow:'));
  it('reads &follow= from the URL', () => {
    expect(parseSceneRequest('?scene=camera&follow=always')).toMatchObject({ followMode: 'always' });
    expect(parseSceneRequest('?scene=camera&follow=x')).toMatchObject({ followMode: 'smart' });
  });
  it('Smart: after a left drag the camera stays where it was put; when the character moves it comes back behind it', () => {
    const scene = createCameraScene(new NullBackend(), {});
    scene.pointer(1, 400, 0); // left drag: camera at 90°, character still at 0°
    scene.releasePointer();
    scene.advance(3000);
    expect(scene.cameraStats).toMatchObject({ yaw: 90, characterYaw: 0, followMode: 'smart', recentering: false });
    expect(line(scene)).toBe('Follow: smart (F) · character standing');
    scene.setMoving(true);
    scene.advance(500);
    expect(scene.cameraStats.yaw).toBeCloseTo(45, 6);
    expect(scene.cameraStats).toMatchObject({ recentering: true, moving: true });
    expect(line(scene)).toBe('Follow: smart (F) · character moving · RECENTRING behind it');
    scene.advance(500);
    expect(scene.cameraStats).toMatchObject({ yaw: 0, recentering: false });
    scene.dispose();
  });
  it('holding the left button keeps the camera where the player puts it, even while moving', () => {
    const scene = createCameraScene(new NullBackend(), { followMode: 'always' });
    scene.pointer(1, 400, 0);
    scene.setMoving(true);
    scene.advance(3000);
    expect(scene.cameraStats).toMatchObject({ yaw: 90, recentering: false });
    scene.releasePointer();
    scene.advance(1000);
    expect(scene.cameraStats.yaw).toBe(0);
    scene.dispose();
  });
  it('F cycles never → smart → always; Never leaves the camera alone while moving', () => {
    const scene = createCameraScene(new NullBackend(), { followMode: 'never' });
    scene.pointer(1, 400, 0);
    scene.releasePointer();
    scene.setMoving(true);
    scene.advance(3000);
    expect(scene.cameraStats.yaw).toBe(90);
    expect([scene.cycleFollowMode(), scene.cycleFollowMode(), scene.cycleFollowMode()]).toEqual(['smart', 'always', 'never']);
    scene.dispose();
  });
  it('the recentring turns the camera only: pitch, distance and the character’s heading do not change', () => {
    const scene = createCameraScene(new NullBackend(), { followMode: 'always', pitchDegrees: 35 });
    scene.pointer(2, 200, 0); // right drag: both at 45°
    scene.pointer(1, 400, 0); // then left: camera at 135°, character at 45°
    scene.releasePointer();
    scene.advance(5000);
    expect(scene.cameraStats).toMatchObject({ yaw: 45, characterYaw: 45, pitch: 35, distance: 8 });
    scene.dispose();
  });
});
