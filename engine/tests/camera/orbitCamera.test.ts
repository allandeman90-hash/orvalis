import { describe, expect, it } from 'vitest';
import { CAMERA_PITCH_LIMIT_DEGREES, CAMERA_PITCH_MOVE_SPEED, CAMERA_YAW_MOVE_SPEED, GAMEPLAY_FOV_Y, HISTORICAL_FOV, MOUSE_PITCH_DENOMINATOR, MOUSE_YAW_DENOMINATOR, OrbitCamera, viewProjectionMatrix } from '../../src/camera';
import { formatOverlay } from '../../src/debug';
import { DepthRange, mat4 } from '../../src/math';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, CAMERA_SCENE_DEFAULT_DISTANCE, createCameraScene } from '../../src/scenes/cameraScene';
import { parseSceneRequest } from '../../src/scenes/select';

const eyeOf = (camera: OrbitCamera): number[] => Array.from(camera.lookAt.eye);

describe('orbit camera constants (spec §186, §188)', () => {
  it('are the document’s', () => {
    expect([CAMERA_PITCH_LIMIT_DEGREES, CAMERA_YAW_MOVE_SPEED, CAMERA_PITCH_MOVE_SPEED, MOUSE_YAW_DENOMINATOR, MOUSE_PITCH_DENOMINATOR, HISTORICAL_FOV]).toEqual([89, 180, 90, 800, 600, 1.5708]);
    expect((89 * Math.PI) / 180).toBeCloseTo(1.553343, 6); // the document's ±1.553343 rad
  });
  it('the vertical field of view is that of a 90° horizontal view at 4:3 (our reading)', () => {
    expect((GAMEPLAY_FOV_Y * 180) / Math.PI).toBeCloseTo(73.74, 2);
    // At 4:3 the horizontal angle is 90° again.
    expect(2 * Math.atan(Math.tan(GAMEPLAY_FOV_Y / 2) * (4 / 3))).toBeCloseTo(HISTORICAL_FOV, 6);
  });
});

describe('orbit geometry', () => {
  it('yaw 0, pitch 0: the camera is south of the pivot, at its height, looking north', () => {
    const camera = new OrbitCamera({ pivot: [1, 2, 3], distance: 10 });
    expect(eyeOf(camera)).toEqual([1, -8, 3]);
    expect(Array.from(camera.lookAt.target)).toEqual([1, 2, 3]);
    expect(camera.forward).toEqual([0, 1, -0]);
  });
  it('yaw 90: the camera is west of the pivot, looking east', () => {
    const eye = eyeOf(new OrbitCamera({ pivot: [0, 0, 0], distance: 10, yawDegrees: 90 }));
    expect(eye[0]).toBeCloseTo(-10, 5);
    expect(eye[1]).toBeCloseTo(0, 5);
  });
  it('a positive pitch puts the camera above the pivot, looking down', () => {
    const camera = new OrbitCamera({ pivot: [0, 0, 0], distance: 10, pitchDegrees: 30 });
    const eye = eyeOf(camera);
    expect(eye[2]).toBeCloseTo(5, 5);
    expect(eye[1]).toBeCloseTo(-10 * Math.cos(Math.PI / 6), 5);
    expect(camera.forward[2]).toBeCloseTo(-0.5, 9);
  });
  it('the eye is always at the distance from the pivot, and the pivot projects to the centre of the screen', () => {
    const m = mat4.create();
    for (const [yaw, pitch] of [[0, 0], [37, 12], [181, -45], [300, 89], [45, -89]] as const) {
      const camera = new OrbitCamera({ pivot: [3, -2, 1.5], distance: 7, yawDegrees: yaw, pitchDegrees: pitch });
      const eye = eyeOf(camera);
      expect(Math.hypot(eye[0]! - 3, eye[1]! + 2, eye[2]! - 1.5)).toBeCloseTo(7, 4);
      viewProjectionMatrix(m, camera.lookAt, 16 / 9, DepthRange.NegOneToOne);
      const w = m[3]! * 3 + m[7]! * -2 + m[11]! * 1.5 + m[15]!;
      expect((m[0]! * 3 + m[4]! * -2 + m[8]! * 1.5 + m[12]!) / w).toBeCloseTo(0, 4);
      expect((m[1]! * 3 + m[5]! * -2 + m[9]! * 1.5 + m[13]!) / w).toBeCloseTo(0, 4);
    }
  });
  it('moving the pivot or changing the distance moves the eye with it', () => {
    const camera = new OrbitCamera({ distance: 10 });
    camera.setPivot(5, 5, 5);
    expect(eyeOf(camera)).toEqual([5, -5, 5]);
    camera.setDistance(2);
    expect(eyeOf(camera)).toEqual([5, 3, 5]);
    expect(() => camera.setDistance(-1)).toThrow(/distance/);
    // 0 = first person: the eye is at the pivot, a hair behind it so that the view keeps its direction.
    camera.setDistance(0);
    expect(camera.distance).toBe(0);
    expect(eyeOf(camera)[1]).toBeCloseTo(5 - 1e-3, 6);
    expect([eyeOf(camera)[0], eyeOf(camera)[2]]).toEqual([5, 5]);
    expect(() => new OrbitCamera({ distance: -1 })).toThrow(/distance/);
    expect(() => new OrbitCamera({ yawDegrees: NaN })).toThrow(/finite/);
  });
});

describe('rotation (spec §188)', () => {
  it('the pitch is clamped to −89° .. +89°, exactly', () => {
    const camera = new OrbitCamera({ pitchDegrees: 0 });
    camera.rotate(0, 500);
    expect(camera.pitch).toBe(89);
    camera.rotate(0, -1);
    expect(camera.pitch).toBe(88);
    camera.rotate(0, -1000);
    expect(camera.pitch).toBe(-89);
    expect(new OrbitCamera({ pitchDegrees: 95 }).pitch).toBe(89);
  });
  it('at the clamp the view never flips: the up vector stays usable', () => {
    const camera = new OrbitCamera({ pitchDegrees: 89, distance: 10 }), m = mat4.create();
    expect(() => viewProjectionMatrix(m, camera.lookAt, 16 / 9, DepthRange.NegOneToOne)).not.toThrow();
    expect(Array.from(m).every(Number.isFinite)).toBe(true);
    // The camera is still (slightly) south of the pivot: not straight above it.
    expect(camera.lookAt.eye[1]!).toBeLessThan(0);
  });
  it('the yaw has no limit and wraps into 0..360', () => {
    const camera = new OrbitCamera({ yawDegrees: 350 });
    camera.rotate(20, 0);
    expect(camera.yaw).toBeCloseTo(10, 9);
    camera.rotate(-30, 0);
    expect(camera.yaw).toBeCloseTo(340, 9);
    camera.rotate(720, 0);
    expect(camera.yaw).toBeCloseTo(340, 9);
    expect(new OrbitCamera({ yawDegrees: -90 }).yaw).toBe(270);
  });
  it('mouse: Δyaw = 180 × dx / 800, Δpitch = 90 × dy / 600', () => {
    const camera = new OrbitCamera();
    camera.rotateByMouse(800, 0);
    expect(camera.yaw).toBe(180);
    camera.rotateByMouse(-400, 0);
    expect(camera.yaw).toBe(90);
    camera.rotateByMouse(0, 600);
    expect(camera.pitch).toBe(89); // 90° asked for, clamped
    const other = new OrbitCamera();
    other.rotateByMouse(100, 100);
    expect([other.yaw, other.pitch]).toEqual([22.5, 15]);
  });
  it('yaw and pitch have separate speeds, and each can be inverted', () => {
    const camera = new OrbitCamera({ yawMoveSpeed: 90, pitchMoveSpeed: 180, invertYaw: true, invertPitch: true });
    camera.rotateByMouse(80, 60);
    expect(camera.yaw).toBe(351);
    expect(camera.pitch).toBe(-18);
  });
  it('there is no roll: the up vector is the world’s', () => {
    const camera = new OrbitCamera({ yawDegrees: 123, pitchDegrees: 45 });
    camera.rotateByMouse(333, -77);
    expect(Array.from(camera.lookAt.up)).toEqual([0, 0, 1]);
  });
});

describe('scene=camera', () => {
  it('is selected by the URL with its options', () => {
    expect(parseSceneRequest('?scene=camera')).toEqual({ scene: 'camera', followMode: 'smart', collision: true, characterScale: 1, yawDegrees: 0, pitchDegrees: 20, distance: 8, palette: 'procedural' });
    expect(parseSceneRequest('?scene=camera&yaw=90&pitch=-30&distance=15&textures=solid')).toEqual({ scene: 'camera', followMode: 'smart', collision: true, characterScale: 1, yawDegrees: 90, pitchDegrees: -30, distance: 15, palette: 'solid' });
    expect(parseSceneRequest('?scene=camera&distance=16&yaw=400')).toMatchObject({ distance: 8, yawDegrees: 0 });
  });
  it('the camera orbits a pivot above the character’s feet; a drag turns it; the overlay shows it', () => {
    const backend = new NullBackend(), scene = createCameraScene(backend, {});
    const [x, y, z] = CAMERA_SCENE_CHARACTER;
    expect(scene.cameraStats).toMatchObject({ yaw: 0, pitch: 20, distance: CAMERA_SCENE_DEFAULT_DISTANCE, pivot: [x, y, z + scene.cameraStats.pivotHeight] });
    const frame = scene.render(16 / 9);
    expect(frame.drawCalls).toBeGreaterThan(10); // ground, cottage, character
    const [px, py] = scene.projectWorldToScreen([x, y, z + scene.cameraStats.pivotHeight]);
    expect(px).toBeCloseTo(0.5, 4);
    expect(py).toBeCloseTo(0.5, 4);
    scene.drag(400, -60);
    expect(scene.cameraStats).toMatchObject({ yaw: 90, pitch: 11 });
    scene.render(16 / 9);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Camera:'))).toBe(`Camera: yaw 90.0° · pitch 11.0° (±89) · distance 8.00 → 8 (wheel, max 15) · eye -7.85, -8.00, ${(scene.cameraStats.pivotHeight + 8 * Math.sin((11 * Math.PI) / 180)).toFixed(2)} · fov 73.7° vertical`);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});
