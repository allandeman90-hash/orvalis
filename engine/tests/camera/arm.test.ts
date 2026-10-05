import { describe, expect, it } from 'vitest';
import { CAMERA_COLLISION_MIN_DISTANCE_YARDS, CAMERA_COLLISION_SKIN_YARDS, CAMERA_EASE_OUT_SPEED_YARDS, CameraArm } from '../../src/camera';
import { COTTAGE } from '../../src/building';
import { formatOverlay } from '../../src/debug';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, createCameraScene } from '../../src/scenes/cameraScene';
import { parseSceneRequest } from '../../src/scenes/select';

describe('camera arm: snap in, ease out (spec §192)', () => {
  it('our constants: a skin of 0.25, never nearer than 0.2, and the zoom’s 8.33 per second outwards', () => {
    expect([CAMERA_COLLISION_SKIN_YARDS, CAMERA_COLLISION_MIN_DISTANCE_YARDS, CAMERA_EASE_OUT_SPEED_YARDS]).toEqual([0.25, 0.2, 8.33]);
  });
  it('nothing in the way: the arm is what the zoom wants', () => {
    const arm = new CameraArm();
    expect(arm.update(8, null, 16)).toBe(8);
    expect(arm.state).toEqual({ distance: 8, wanted: 8, blocked: false });
    expect(arm.update(8, 20, 16)).toBe(8); // an obstacle beyond the wanted position does not matter
    expect(arm.state.blocked).toBe(false);
  });
  it('an obstacle appears: the arm is shortened AT ONCE, to the obstacle minus the skin — whatever the time step', () => {
    const arm = new CameraArm();
    arm.update(8, null, 16);
    expect(arm.update(8, 5, 0)).toBe(4.75);
    expect(arm.state).toEqual({ distance: 4.75, wanted: 8, blocked: true, obstacleDistance: 5 });
    expect(arm.update(8, 3, 1)).toBe(2.75); // nearer still: at once again
  });
  it('the obstacle clears: the arm returns at 8.33 per second, and stops exactly on the wanted length', () => {
    const arm = new CameraArm();
    arm.update(8, 3, 16);
    expect(arm.update(8, null, 100)).toBeCloseTo(2.75 + 0.833, 9);
    expect(arm.state.blocked).toBe(false);
    expect(arm.update(8, null, 500)).toBeCloseTo(2.75 + 0.833 + 4.165, 9);
    expect(arm.update(8, null, 1000)).toBe(8);
  });
  it('an obstacle that moves AWAY is followed outwards smoothly too, never past it', () => {
    const arm = new CameraArm();
    arm.update(8, 3, 16);
    expect(arm.update(8, 6, 100)).toBeCloseTo(3.583, 9); // eased, not jumped to 5.75
    expect(arm.update(8, 6, 1000)).toBe(5.75);
    expect(arm.update(8, 6, 1000)).toBe(5.75);
  });
  it('an obstacle within the skin of the wanted position already shortens the arm', () => {
    const arm = new CameraArm();
    expect(arm.update(8, 8.1, 16)).toBeCloseTo(7.85, 9); // the camera would be 0.1 from it: too close
    expect(arm.update(8, 8.25, 16)).toBeCloseTo(7.85 + 8.33 * 0.016, 9); // exactly a skin away: free again, easing out
  });
  it('an obstacle right at the pivot leaves the minimum arm, 0.2', () => {
    const arm = new CameraArm();
    expect(arm.update(8, 0.1, 16)).toBe(0.2);
    expect(arm.update(8, 0, 16)).toBe(0.2);
  });
  it('zooming in is followed at once; an obstacle never lengthens the arm beyond what the zoom wants', () => {
    const arm = new CameraArm();
    arm.update(8, null, 16);
    expect(arm.update(3, null, 16)).toBe(3);
    expect(arm.update(0.1, 5, 16)).toBe(0.1); // the zoom wants less than the minimum: the zoom decides
  });
  it('unitsPerYard scales the skin, the minimum and the speed', () => {
    const arm = new CameraArm(2);
    expect([arm.skin, arm.minDistance, arm.easeOutSpeed]).toEqual([0.5, 0.4, 16.66]);
  });
  it('rejects bad values', () => {
    const arm = new CameraArm();
    expect(() => arm.update(-1, null, 16)).toThrow(/wanted distance/);
    expect(arm.update(0, null, 16)).toBe(0); // first person: an arm of 0 is allowed
    expect(() => arm.update(8, -1, 16)).toThrow(/obstacle distance/);
    expect(() => arm.update(8, null, -1)).toThrow(/time step/);
    expect(() => new CameraArm(0)).toThrow(/unitsPerYard/);
  });
});

describe('scene=camera: the buildings and the ground stop the camera', () => {
  const [, cy] = CAMERA_SCENE_CHARACTER;
  const wallY = -COTTAGE.halfY; // the cottage's front wall, 5 north of the character
  it('reads &cameraCollision= from the URL', () => {
    expect(parseSceneRequest('?scene=camera&cameraCollision=off')).toMatchObject({ collision: false });
    expect(parseSceneRequest('?scene=camera')).toMatchObject({ collision: true });
  });
  it('camera south of the character, nothing behind it: free, the arm is the zoom’s', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 0, pitchDegrees: 0 });
    scene.advance(16);
    expect(scene.cameraStats).toMatchObject({ distance: 8, zoomDistance: 8, blocked: false, obstacleDistance: null });
    scene.dispose();
  });
  it('camera towards the cottage’s wall: it stops a skin in front of the wall, at once', () => {
    // Yaw 160: the camera is north-north-west of the character; the arm meets the front wall beside the door.
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 160, pitchDegrees: 0 });
    scene.advance(0);
    const toWall = (wallY - cy) / Math.cos((20 * Math.PI) / 180);
    expect(scene.cameraStats.blocked).toBe(true);
    expect(scene.cameraStats.obstacleDistance).toBeCloseTo(toWall, 4);
    expect(scene.cameraStats.distance).toBeCloseTo(toWall - 0.25, 4);
    expect(scene.cameraStats.eye[1]).toBeLessThan(wallY); // still outside
    expect(scene.cameraStats.zoomDistance).toBe(8);
    scene.dispose();
  });
  it('it is the CAMERA face set that is asked: the window’s lattice (DETAIL: not a player face) stops the arm', () => {
    // Yaw 205, pitch −3: from the pivot the arm goes through the window opening, where only the lattice stands.
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 205, pitchDegrees: -3 });
    scene.advance(0);
    const t = (COTTAGE.window.y - cy) / (Math.cos((3 * Math.PI) / 180) * Math.cos((25 * Math.PI) / 180));
    // The crossing is inside the opening.
    const x = t * Math.cos((3 * Math.PI) / 180) * Math.sin((25 * Math.PI) / 180), z = scene.cameraStats.pivotHeight - t * Math.sin((3 * Math.PI) / 180);
    expect(x).toBeGreaterThan(COTTAGE.window.x0);
    expect(x).toBeLessThan(COTTAGE.window.x1);
    expect(z).toBeGreaterThan(COTTAGE.window.z0);
    expect(z).toBeLessThan(COTTAGE.window.z1);
    expect(scene.cameraStats.blocked).toBe(true);
    expect(scene.cameraStats.obstacleDistance).toBeCloseTo(t, 3);
    scene.dispose();
  });
  it('straight through the open DOOR nothing blocks: a portal is not a wall', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 180, pitchDegrees: 0 });
    scene.advance(16);
    expect(scene.cameraStats).toMatchObject({ blocked: false, distance: 8 });
    expect(scene.cameraStats.eye[1]).toBeGreaterThan(wallY); // inside the house
    scene.dispose();
  });
  it('turning away from the wall: free at once, and the arm eases back out at 8.33 per second', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 160, pitchDegrees: 0 });
    scene.advance(0);
    const short = scene.cameraStats.distance;
    scene.drag((-160 * 800) / 180, 0); // back to yaw 0
    scene.advance(100);
    expect(scene.cameraStats.blocked).toBe(false);
    expect(scene.cameraStats.distance).toBeCloseTo(short + 0.833, 4);
    scene.advance(2000);
    expect(scene.cameraStats.distance).toBe(8);
    scene.dispose();
  });
  it('looking up from below: the ground stops the camera, it does not go under it', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 0, pitchDegrees: -30 });
    scene.advance(0);
    const pivotHeight = scene.cameraStats.pivotHeight;
    expect(scene.cameraStats.blocked).toBe(true);
    expect(scene.cameraStats.obstacleDistance).toBeCloseTo(pivotHeight / Math.sin(Math.PI / 6), 4);
    expect(scene.cameraStats.eye[2]).toBeGreaterThan(0);
    scene.dispose();
  });
  it('C turns the collision off: the camera goes through the wall again; the overlay tells', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 160, pitchDegrees: 0 });
    scene.advance(0);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    const line = () => formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Camera collision:'));
    expect(line()).toBe('Camera collision: BLOCKED at 5.32 from the pivot — arm 5.07 of 8.00 (C)');
    expect(scene.toggleCollision()).toBe(false);
    scene.advance(100);
    expect(line()).toBe('Camera collision: off (C)');
    scene.advance(5000);
    expect(scene.cameraStats.distance).toBe(8);
    expect(scene.toggleCollision()).toBe(true);
    scene.advance(0);
    expect(scene.cameraStats.distance).toBeCloseTo(5.0709, 3);
    scene.drag((-160 * 800) / 180, 0);
    scene.advance(100);
    expect(line()).toMatch(/^Camera collision: free — easing out, arm 5\.90 of 8\.00 \(C\)$/);
    scene.advance(5000);
    expect(line()).toBe('Camera collision: free (C)');
    scene.dispose();
  });
});
