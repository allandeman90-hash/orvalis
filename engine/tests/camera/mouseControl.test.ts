import { describe, expect, it } from 'vitest';
import { CameraMouseControl, cameraMouseMode, MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, OrbitCamera } from '../../src/camera';
import { formatOverlay } from '../../src/debug';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, createCameraScene } from '../../src/scenes/cameraScene';

const LEFT = MOUSE_BUTTON_LEFT, RIGHT = MOUSE_BUTTON_RIGHT, BOTH = LEFT | RIGHT;

describe('mouse buttons (spec §189)', () => {
  it('the bitmask is the browser’s: 1 = left, 2 = right', () => {
    expect([LEFT, RIGHT]).toEqual([1, 2]);
    expect([0, LEFT, RIGHT, BOTH, 4, 4 | LEFT].map(cameraMouseMode)).toEqual(['none', 'orbit', 'steer', 'steer', 'none', 'orbit']);
  });
  it('left drag: the camera turns, the character does not', () => {
    const camera = new OrbitCamera(), mouse = new CameraMouseControl(camera, 30);
    mouse.update(LEFT, 400, 60);
    expect([camera.yaw, camera.pitch, mouse.characterYaw, mouse.mode, mouse.moveForward]).toEqual([90, 9, 30, 'orbit', false]);
  });
  it('right drag: camera and character turn together', () => {
    const camera = new OrbitCamera({ yawDegrees: 10 }), mouse = new CameraMouseControl(camera, 200);
    mouse.update(RIGHT, 200, 0);
    expect([camera.yaw, mouse.characterYaw, mouse.mode]).toEqual([55, 55, 'steer']);
    mouse.update(RIGHT, -400, 30);
    expect([camera.yaw, mouse.characterYaw]).toEqual([325, 325]);
    expect(camera.pitch).toBe(4.5); // the pitch is the camera's alone
  });
  it('pressing the right button turns the character to the camera’s heading at once, before any movement', () => {
    const camera = new OrbitCamera({ yawDegrees: 120 }), mouse = new CameraMouseControl(camera, 0);
    mouse.update(LEFT, 0, 0);
    expect(mouse.characterYaw).toBe(0);
    mouse.update(RIGHT, 0, 0);
    expect(mouse.characterYaw).toBe(120);
  });
  it('left + right: move forward, and a drag still steers', () => {
    const camera = new OrbitCamera(), mouse = new CameraMouseControl(camera, 0);
    mouse.update(BOTH, 0, 0);
    expect([mouse.mode, mouse.moveForward]).toEqual(['steer', true]);
    mouse.update(BOTH, 80, 0);
    expect(mouse.characterYaw).toBe(18);
    mouse.update(RIGHT, 0, 0); // the left button is let go: no longer forward
    expect(mouse.moveForward).toBe(false);
    mouse.update(LEFT, 0, 0);
    expect([mouse.mode, mouse.moveForward]).toEqual(['orbit', false]);
  });
  it('with no button held a movement turns nothing; after the release the character keeps its heading', () => {
    const camera = new OrbitCamera(), mouse = new CameraMouseControl(camera, 0);
    mouse.update(RIGHT, 100, 0);
    mouse.update(0, 500, 500);
    expect([camera.yaw, camera.pitch, mouse.characterYaw, mouse.mode]).toEqual([22.5, 0, 22.5, 'none']);
    mouse.update(LEFT, 100, 0); // the camera leaves, the character stays
    expect([camera.yaw, mouse.characterYaw]).toEqual([45, 22.5]);
  });
  it('release() lets go of every button', () => {
    const mouse = new CameraMouseControl(new OrbitCamera(), 0);
    mouse.update(BOTH, 0, 0);
    mouse.release();
    expect([mouse.mode, mouse.moveForward]).toEqual(['none', false]);
  });
  it('other buttons (middle = 4) are ignored', () => {
    const camera = new OrbitCamera(), mouse = new CameraMouseControl(camera, 0);
    mouse.update(4, 300, 300);
    expect([camera.yaw, mouse.mode]).toEqual([0, 'none']);
  });
});

describe('scene=camera: mouse buttons', () => {
  it('a right drag turns the mannequin: its matrix is the heading’s rotation at its place', () => {
    const scene = createCameraScene(new NullBackend(), {});
    scene.pointer(RIGHT, 400, 0); // 90°: looking east
    scene.render(16 / 9);
    expect(scene.cameraStats).toMatchObject({ yaw: 90, characterYaw: 90, mouseMode: 'steer', moveForward: false });
    scene.pointer(BOTH, 0, 0);
    expect(scene.cameraStats.moveForward).toBe(true);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Mouse:'))).toBe('Mouse: right — camera + character · BOTH: move forward · character faces 90.0°');
    scene.releasePointer();
    expect(formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Mouse:'))).toBe('Mouse: no button · character faces 90.0°');
    // The mannequin faces +y at heading 0: at heading 90 its forward axis points EAST, it stays upright and in place.
    const m = scene.characterMatrix;
    expect([m[4], m[5], m[6]].map((v) => Math.round(v! * 1e6) / 1e6)).toEqual([1, 0, 0]);
    expect([m[8], m[9], m[10]]).toEqual([0, 0, 1]);
    expect([m[12], m[13], m[14]]).toEqual([...CAMERA_SCENE_CHARACTER]);
    scene.pointer(RIGHT, 400, 0); // 180°: facing south
    scene.render(16 / 9);
    expect([scene.characterMatrix[4], scene.characterMatrix[5]].map((v) => Math.round(v! * 1e6) / 1e6)).toEqual([0, -1]);
    scene.dispose();
  });
});
