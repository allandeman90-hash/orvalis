import { describe, expect, it } from 'vitest';
import { formatOverlay } from '../../src/debug';
import { groundMotion, groundSpeedOf, intentFromDevices, MOVEMENT, MOVEMENT_CHOICES, type MovementIntent, NO_INTENT, PlayerMovement } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, createCameraScene } from '../../src/scenes/cameraScene';

const intent = (change: Partial<MovementIntent>): MovementIntent => ({ ...NO_INTENT, ...change });
const keys = (...codes: string[]): Set<string> => new Set(codes);
const devices = (codes: string[], steering = false, bothButtons = false) => ({ keys: keys(...codes), steering, bothButtons });
const STEP = 1000 / 60;

describe('movement constants (spec §199–§212): one place, the document’s values', () => {
  it('speeds, jump, gravity', () => {
    expect([MOVEMENT.runForwardSpeed, MOVEMENT.runBackwardSpeed, MOVEMENT.walkSpeed, MOVEMENT.swimForwardSpeed, MOVEMENT.swimBackwardSpeed]).toEqual([7, 4.5, 2.5, 4.722222, 2.5]);
    expect([MOVEMENT.jumpSpeed, MOVEMENT.gravity, MOVEMENT.terminalSpeed, MOVEMENT.slowFallTerminalSpeed]).toEqual([7.955547, 19.291105, 60.148003, 7]);
    expect(MOVEMENT.maxIntegrationStep).toBe(0.25);
  });
  it('the jump figures the document derives follow from those constants', () => {
    const apex = MOVEMENT.jumpSpeed / MOVEMENT.gravity;
    expect(apex).toBeCloseTo(0.412, 3);
    expect(2 * apex).toBeCloseTo(0.825, 3);
    expect(MOVEMENT.jumpSpeed ** 2 / (2 * MOVEMENT.gravity)).toBeCloseTo(1.64, 2);
  });
  it('collision, slopes, steps, probes, swimming, hover', () => {
    expect([MOVEMENT.collisionRadius, MOVEMENT.collisionHeight]).toEqual([1 / 3, 2.0277777]);
    expect(MOVEMENT.walkableSlopeDegrees).toBe(50);
    expect(Math.cos((MOVEMENT.walkableSlopeDegrees * Math.PI) / 180)).toBeCloseTo(0.642788, 6);
    expect([MOVEMENT.playerStepHeight, MOVEMENT.creatureStepHeight, MOVEMENT.groundSnap, MOVEMENT.landingProbe, MOVEMENT.collisionSkin]).toEqual([1, 2, 0.2, 0.05, 0.02]);
    expect([MOVEMENT.fallingFarDropAfterJump, MOVEMENT.fallingFarSecondsOffEdge, MOVEMENT.airControlSpeed]).toEqual([1 / 9, 0.5, 2.5]);
    expect([MOVEMENT.swimDepthRatio, MOVEMENT.swimExitHysteresis, MOVEMENT.swimJumpSpeed]).toEqual([0.75, 1 / 36, 9.096748]);
    expect((MOVEMENT.waterWalkPitchDegrees * Math.PI) / 180).toBeCloseTo(-0.645772, 6);
    expect([MOVEMENT.hoverHeight, MOVEMENT.hoverCorrectionSpeed]).toEqual([1, 7]);
  });
  it('our own two: keyboard turn 180° per second, strafe at the run speed', () => {
    expect(MOVEMENT_CHOICES).toEqual({ keyboardTurnDegreesPerSecond: 180, strafeSpeed: 7, swimSurfaceBand: 0.05 });
  });
});

describe('intent from the keyboard and the mouse buttons', () => {
  it('W / S forward and backward, A / D turn, Q / E strafe; the arrows like WASD; Shift walks', () => {
    expect(intentFromDevices(devices(['KeyW']))).toEqual({ forward: 1, strafe: 0, turn: 0, walk: false, jump: false, pitch: 0 });
    expect(intentFromDevices(devices(['KeyS']))).toMatchObject({ forward: -1 });
    expect(intentFromDevices(devices(['KeyA']))).toMatchObject({ turn: -1, strafe: 0 });
    expect(intentFromDevices(devices(['KeyD']))).toMatchObject({ turn: 1, strafe: 0 });
    expect(intentFromDevices(devices(['KeyQ']))).toMatchObject({ strafe: -1, turn: 0 });
    expect(intentFromDevices(devices(['KeyE']))).toMatchObject({ strafe: 1, turn: 0 });
    expect(intentFromDevices(devices(['ArrowUp', 'ArrowRight']))).toMatchObject({ forward: 1, turn: 1 });
    expect(intentFromDevices(devices(['KeyW', 'ShiftLeft']))).toMatchObject({ forward: 1, walk: true });
  });
  it('opposite keys cancel; nothing held is no intent', () => {
    expect(intentFromDevices(devices(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE']))).toEqual(NO_INTENT);
    expect(intentFromDevices(devices([]))).toEqual(NO_INTENT);
  });
  it('while the right button steers, A / D strafe instead of turning', () => {
    expect(intentFromDevices(devices(['KeyA'], true))).toMatchObject({ strafe: -1, turn: 0 });
    expect(intentFromDevices(devices(['KeyD', 'KeyE'], true))).toMatchObject({ strafe: 1, turn: 0 }); // never more than 1
  });
  it('both mouse buttons: forward (spec §189); with S held they cancel', () => {
    expect(intentFromDevices(devices([], true, true))).toMatchObject({ forward: 1 });
    expect(intentFromDevices(devices(['KeyW'], true, true))).toMatchObject({ forward: 1 });
    expect(intentFromDevices(devices(['KeyS'], true, true))).toMatchObject({ forward: 0 });
  });
});

describe('ground speeds (spec §200)', () => {
  it('run forward 7, run backward 4.5, walk 2.5; nothing asked = 0', () => {
    expect(groundSpeedOf(intent({ forward: 1 }))).toBe(7);
    expect(groundSpeedOf(intent({ forward: -1 }))).toBe(4.5);
    expect(groundSpeedOf(intent({ forward: 1, walk: true }))).toBe(2.5);
    expect(groundSpeedOf(intent({ forward: -1, walk: true }))).toBe(2.5);
    expect(groundSpeedOf(NO_INTENT)).toBe(0);
    expect(groundSpeedOf(intent({ turn: 1 }))).toBe(0); // turning on the spot is not moving
  });
  it('our rule for the rest: sideways and forward diagonals at 7, anything with a backward part at 4.5', () => {
    expect(groundSpeedOf(intent({ strafe: 1 }))).toBe(7);
    expect(groundSpeedOf(intent({ forward: 1, strafe: -1 }))).toBe(7);
    expect(groundSpeedOf(intent({ forward: -1, strafe: 1 }))).toBe(4.5);
  });
  it('a diagonal is NORMALIZED: forward + strafe is exactly as fast as forward alone', () => {
    for (const [forward, strafe] of [[1, 0], [1, 1], [1, -1], [0, 1], [0, -1]] as const) {
      const { velocity } = groundMotion(intent({ forward, strafe }), 37);
      expect(Math.hypot(velocity[0], velocity[1])).toBeCloseTo(7, 9);
    }
    expect(Math.hypot(...groundMotion(intent({ forward: -1, strafe: 1 }), 0).velocity)).toBeCloseTo(4.5, 9);
  });
  it('directions: heading 0 = north (+y), 90 = east (+x); strafe right is 90° clockwise of forward', () => {
    const v = (i: Partial<MovementIntent>, heading: number) => groundMotion(intent(i), heading).velocity.map((x) => Math.round(x * 1e6) / 1e6);
    expect(v({ forward: 1 }, 0)).toEqual([0, 7]);
    expect(v({ forward: 1 }, 90)).toEqual([7, 0]);
    expect(v({ forward: -1 }, 0)).toEqual([0, -4.5]);
    expect(v({ strafe: 1 }, 0)).toEqual([7, 0]);
    expect(v({ strafe: 1 }, 90)).toEqual([0, -7]);
    expect(v({ strafe: -1 }, 0)).toEqual([-7, 0]);
    const diagonal = groundMotion(intent({ forward: 1, strafe: 1 }), 0).velocity;
    expect(diagonal[0]).toBeCloseTo(7 * Math.SQRT1_2, 9);
    expect(diagonal[1]).toBeCloseTo(7 * Math.SQRT1_2, 9);
  });
  it('a partial intent (half a stick) is kept as it is; unitsPerYard scales the speed', () => {
    expect(Math.hypot(...groundMotion(intent({ forward: 0.5 }), 0).velocity)).toBeCloseTo(3.5, 9);
    expect(groundMotion(intent({ forward: 1 }), 0, 2).velocity).toEqual([0, 14]);
  });
});

describe('PlayerMovement: fixed steps', () => {
  it('one second forward at 60 steps per second: exactly 7 yards', () => {
    const player = new PlayerMovement([0, 0, 0]);
    for (let k = 0; k < 60; k++) player.step(STEP, intent({ forward: 1 }));
    expect(player.state.position[1]).toBeCloseTo(7, 9);
    expect(player.state.position[0]).toBeCloseTo(0, 9);
    expect([player.moving, player.speed]).toEqual([true, 7]);
  });
  it('deterministic: the same intents give the same path, whatever the size of the steps', () => {
    const fine = new PlayerMovement([1, 2, 3], 30), coarse = new PlayerMovement([1, 2, 3], 30);
    for (let k = 0; k < 120; k++) fine.step(STEP, intent({ forward: 1, strafe: 1 }));
    coarse.step(2000, intent({ forward: 1, strafe: 1 })); // cut into 250 ms pieces
    expect(coarse.state.position[0]).toBeCloseTo(fine.state.position[0], 9);
    expect(coarse.state.position[1]).toBeCloseTo(fine.state.position[1], 9);
    expect(coarse.state.position[2]).toBe(3);
  });
  it('turning with the keys: 180° per second, the move follows the new heading', () => {
    const player = new PlayerMovement([0, 0, 0], 0);
    for (let k = 0; k < 30; k++) player.step(STEP, intent({ turn: 1 }));
    expect(player.state.heading).toBeCloseTo(90, 9);
    expect(player.moving).toBe(false);
    expect(player.state.position).toEqual([0, 0, 0]);
    for (let k = 0; k < 60; k++) player.step(STEP, intent({ forward: 1 }));
    expect(player.state.position[0]).toBeCloseTo(7, 6); // east
    for (let k = 0; k < 45; k++) player.step(STEP, intent({ turn: -1 }));
    expect(player.state.heading).toBeCloseTo(315, 9); // wrapped
  });
  it('turning while running traces a circle: after a full turn the character is back where it started', () => {
    const player = new PlayerMovement([0, 0, 0], 0);
    for (let k = 0; k < 120; k++) player.step(STEP, intent({ forward: 1, turn: 1 })); // 2 s = 360°
    expect(Math.hypot(player.state.position[0], player.state.position[1])).toBeLessThan(0.01);
  });
  it('stopping: the velocity is 0 on the next step', () => {
    const player = new PlayerMovement([0, 0, 0]);
    player.step(STEP, intent({ forward: 1 }));
    player.step(STEP, NO_INTENT);
    expect([player.moving, player.speed]).toEqual([false, 0]);
  });
  it('rejects bad values', () => {
    expect(() => new PlayerMovement([0, NaN, 0])).toThrow(/finite/);
    expect(() => new PlayerMovement([0, 0, 0], 0, 0)).toThrow(/unitsPerYard/);
    expect(() => new PlayerMovement([0, 0, 0]).step(-1, NO_INTENT)).toThrow(/time step/);
  });
});

describe('scene=camera: the character moves', () => {
  const [x0, y0] = CAMERA_SCENE_CHARACTER;
  const run = (scene: ReturnType<typeof createCameraScene>, codes: string[], steps: number): void => {
    const held = keys(...codes);
    for (let k = 0; k < steps; k++) scene.fixedStep(STEP, held);
  };
  it('W for one second: 7 yards north, and the camera’s pivot goes with the character', () => {
    const scene = createCameraScene(new NullBackend(), {});
    run(scene, ['KeyW'], 60);
    scene.advance(16);
    scene.render(16 / 9);
    const stats = scene.cameraStats;
    expect(stats.position[1]).toBeCloseTo(y0 + 7, 6);
    expect(stats.position[0]).toBeCloseTo(x0, 6);
    expect([stats.speed, stats.moving]).toEqual([7, true]);
    expect(stats.travelled).toBeCloseTo(7, 6);
    expect(stats.movingMs).toBeCloseTo(1000, 6);
    expect(stats.pivot[1]).toBeCloseTo(y0 + 7, 5);
    expect([scene.characterMatrix[12], scene.characterMatrix[13]]).toEqual([expect.closeTo(x0, 5), expect.closeTo(y0 + 7, 5)]);
    const [px, py] = scene.projectWorldToScreen([stats.pivot[0], stats.pivot[1], stats.pivot[2]]);
    expect(px).toBeCloseTo(0.5, 4);
    expect(py).toBeCloseTo(0.5, 4);
    scene.dispose();
  });
  it('S goes back at 4.5; Shift + W walks at 2.5; W + E is a diagonal at 7, not 9.9', () => {
    const back = createCameraScene(new NullBackend(), {});
    run(back, ['KeyS'], 60);
    expect(back.cameraStats.position[1]).toBeCloseTo(y0 - 4.5, 6);
    back.dispose();
    const walk = createCameraScene(new NullBackend(), {});
    run(walk, ['KeyW', 'ShiftLeft'], 60);
    expect(walk.cameraStats.position[1]).toBeCloseTo(y0 + 2.5, 6);
    walk.dispose();
    const diagonal = createCameraScene(new NullBackend(), {});
    run(diagonal, ['KeyW', 'KeyE'], 60);
    expect(diagonal.cameraStats.travelled).toBeCloseTo(7, 6);
    expect(diagonal.cameraStats.position[0] - x0).toBeCloseTo(7 * Math.SQRT1_2, 6);
    expect(diagonal.cameraStats.position[1] - y0).toBeCloseTo(7 * Math.SQRT1_2, 6);
    diagonal.dispose();
  });
  it('A / D turn the character, and the camera with it; with the left button held the camera stays', () => {
    const scene = createCameraScene(new NullBackend(), { followMode: 'never' });
    run(scene, ['KeyD'], 30); // 90° to the right
    expect(scene.cameraStats.characterYaw).toBeCloseTo(90, 6);
    expect(scene.cameraStats.yaw).toBeCloseTo(90, 6);
    expect(scene.cameraStats.speed).toBe(0);
    scene.pointer(1, 0, 0); // left button held: the camera is the player's
    run(scene, ['KeyA'], 30);
    expect(scene.cameraStats.characterYaw).toBeCloseTo(0, 6);
    expect(scene.cameraStats.yaw).toBeCloseTo(90, 6);
    scene.dispose();
  });
  it('right button held: the character runs where the camera looks, and A / D strafe', () => {
    const scene = createCameraScene(new NullBackend(), {});
    scene.pointer(2, 400, 0); // camera and character to 90° (east)
    run(scene, ['KeyW'], 60);
    expect(scene.cameraStats.position[0]).toBeCloseTo(x0 + 7, 5);
    run(scene, ['KeyA'], 30); // strafe left of east = north (not farther: the shed's low eave is there, P8.4)
    expect(scene.cameraStats.characterYaw).toBe(90);
    expect(scene.cameraStats.position[1]).toBeCloseTo(y0 + 3.5, 5);
    scene.dispose();
  });
  it('both mouse buttons: forward, with no key', () => {
    const scene = createCameraScene(new NullBackend(), {});
    scene.pointer(3, 0, 0);
    run(scene, [], 60);
    expect(scene.cameraStats.position[1]).toBeCloseTo(y0 + 7, 6);
    expect(scene.cameraStats.intent).toMatchObject({ forward: 1 });
    scene.releasePointer();
    run(scene, [], 1);
    expect(scene.cameraStats.speed).toBe(0);
    scene.dispose();
  });
  it('moving is what tells the Smart follow; the overlay shows position and speed', () => {
    const scene = createCameraScene(new NullBackend(), {});
    scene.pointer(1, 400, 0); // camera 90° off
    scene.releasePointer();
    run(scene, ['KeyW'], 30);
    scene.advance(500);
    expect(scene.cameraStats.recentering).toBe(true);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Movement:'))).toBe('Movement: at 0.00, -4.50, 0.00 · 7.00 per second · on the ground (slope 0°, 0 step-ups) (last flight 0.00 s, +0.00) · animation run · Space jump, W/S forward-back, A/D turn (strafe with right button), Q/E strafe, Shift walk');
    scene.dispose();
  });
});

describe('PlayerMovement.teleport', () => {
  it('moves the feet at once and stops the character', () => {
    const m = new PlayerMovement([0, 0, 0], 90);
    m.step(1000, { ...NO_INTENT, forward: 1 });
    expect(m.moving).toBe(true);
    m.teleport([3, -4, 5]);
    expect(m.state.position).toEqual([3, -4, 5]);
    expect(m.moving).toBe(false);
    expect(m.state.heading).toBe(90);
    expect(() => m.teleport([0, Number.NaN, 0])).toThrow(/finite/);
  });
});

describe('camera scene: one heading for the mouse and the movement (regression)', () => {
  it('a right drag made entirely between two simulation steps still decides where W goes', () => {
    const scene = createCameraScene(new NullBackend());
    // Press, drag by 400 px (+90°) and release, with no simulation step in between.
    scene.pointer(2, 0, 0);
    scene.pointer(2, 400, 0);
    scene.releasePointer();
    expect(scene.cameraStats.characterYaw).toBeCloseTo(90, 9);
    scene.fixedStep(1000, new Set(['KeyW']));
    const p = scene.cameraStats.position;
    // Heading 90° = east: +x. (The bug: the movement had kept its own heading, 0°, and went north.)
    expect(p[0] - CAMERA_SCENE_CHARACTER[0]).toBeCloseTo(7, 6);
    expect(p[1] - CAMERA_SCENE_CHARACTER[1]).toBeCloseTo(0, 6);
    scene.dispose();
  });
});
