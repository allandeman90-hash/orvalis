import { describe, expect, it } from 'vitest';
import { levelGround, MOVEMENT, type MovementIntent, type MovementWater, NO_INTENT, PlayerMovement, swimEnterDepth, swimExitDepth, swimSpeedOf, swimVelocity } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_POOL, CAMERA_SCENE_POOL_SLOPE_FOOT, type CameraScene, createCameraScene } from '../../src/scenes/cameraScene';

const STEP = 1000 / 60, RAD = Math.PI / 180;
const intent = (change: Partial<MovementIntent>): MovementIntent => ({ ...NO_INTENT, ...change });
const H = MOVEMENT.collisionHeight, ENTER = swimEnterDepth(H), EXIT = swimExitDepth(H);
/** Water everywhere, its surface at 0. */
const SEA: MovementWater = { surfaceAt: () => 0 };
/** A swimmer in open water 10 deep, starting `depth` under the surface (feet). */
const swimmer = (depth = 5, heading = 0): PlayerMovement => {
  const m = new PlayerMovement([0, 0, -depth], heading, 1, levelGround(() => -10), undefined, SEA);
  m.step(STEP, NO_INTENT);
  return m;
};

describe('swim thresholds (spec §209)', () => {
  it('swims when the water is deeper than 0.75 × the collision height; stops 1/36 yard shallower', () => {
    expect(MOVEMENT.swimDepthRatio).toBe(0.75);
    expect(MOVEMENT.swimExitHysteresis).toBeCloseTo(1 / 36, 15);
    expect(ENTER).toBeCloseTo(0.75 * 2.0277777, 12);
    expect(EXIT).toBeCloseTo(ENTER - 0.0277777, 6);
    expect(swimEnterDepth(6)).toBe(4.5);
    expect(swimExitDepth(6, 2)).toBeCloseTo(4.5 - 2 / 36, 12);
  });

  it('standing in water just under the threshold walks; just over it swims', () => {
    for (const [depth, mode] of [[ENTER - 0.001, 'grounded'], [ENTER + 0.001, 'swimming']] as const) {
      const m = new PlayerMovement([0, 0, -depth], 0, 1, levelGround(() => -depth), undefined, SEA);
      m.step(STEP, NO_INTENT);
      expect(m.state.mode).toBe(mode);
      expect(m.state.waterDepth).toBeCloseTo(depth, 9);
    }
  });

  it('hysteresis: a swimmer coming onto a shelf between the two depths keeps swimming; a walker there keeps walking', () => {
    const between = (ENTER + EXIT) / 2;
    // Bottom at −10 for y < 1, a shelf `between` under the surface beyond.
    const probe = levelGround((_x, y) => (y < 1 ? -10 : -between));
    const fromTheDeep = new PlayerMovement([0, 0, -ENTER - 0.5], 0, 1, probe, undefined, SEA);
    for (let k = 0; k < 60; k++) fromTheDeep.step(STEP, intent({ forward: 1, pitch: 30 }));
    expect(fromTheDeep.state.position[1]).toBeGreaterThan(1);
    expect(fromTheDeep.state.position[2]).toBeCloseTo(-between, 9); // standing on the shelf
    expect(fromTheDeep.state.mode).toBe('swimming');
    const onTheShelf = new PlayerMovement([0, 3, -between], 0, 1, probe, undefined, SEA);
    for (let k = 0; k < 30; k++) onTheShelf.step(STEP, intent({ forward: 1 }));
    expect(onTheShelf.state.mode).toBe('grounded');
    expect(onTheShelf.speed).toBe(7);
  });

  it('a shelf shallower than the exit depth: the swimmer stands up and walks', () => {
    const probe = levelGround((_x, y) => (y < 1 ? -10 : -(EXIT - 0.01)));
    const m = new PlayerMovement([0, 0, -ENTER - 0.5], 0, 1, probe, undefined, SEA);
    const modes: string[] = [];
    for (let k = 0; k < 90; k++) {
      m.step(STEP, intent({ forward: 1, pitch: 30 }));
      if (modes[modes.length - 1] !== m.state.mode) modes.push(m.state.mode);
    }
    expect(modes).toEqual(['swimming', 'grounded']); // once: no flicker
    expect(m.state.position[2]).toBeCloseTo(-(EXIT - 0.01), 9);
    expect(m.speed).toBe(7);
  });

  it('the threshold follows the collision height of the character', () => {
    const tall: MovementWater = { surfaceAt: () => 0, collisionHeight: () => 3 * H };
    const m = new PlayerMovement([0, 0, -2.5], 0, 1, levelGround(() => -2.5), undefined, tall);
    m.step(STEP, NO_INTENT);
    expect(m.state.mode).toBe('grounded'); // 2.5 deep: over the head of a normal character, not of this one
  });

  it('no water, no swimming', () => {
    const m = new PlayerMovement([0, 0, -5], 0, 1, levelGround(() => -5), undefined, { surfaceAt: () => null });
    m.step(STEP, intent({ forward: 1 }));
    expect(m.state.mode).toBe('grounded');
    expect(m.state.waterDepth).toBe(0);
  });
});

describe('swim speeds and direction (spec §200, §210)', () => {
  it('4.722222 forward, 2.5 backward', () => {
    expect(swimSpeedOf(intent({ forward: 1 }))).toBe(4.722222);
    expect(swimSpeedOf(intent({ forward: -1 }))).toBe(2.5);
    expect(swimSpeedOf(intent({ strafe: 1 }))).toBe(4.722222);
    expect(swimSpeedOf(intent({ forward: -1, strafe: 1 }))).toBe(2.5);
    expect(swimSpeedOf(intent({ forward: 1, walk: true }))).toBe(4.722222);
    expect(swimSpeedOf(intent({ jump: true }))).toBe(4.722222);
    expect(swimSpeedOf(NO_INTENT)).toBe(0);
  });

  it('forward3D = horizontalForward × cos(pitch) + up × sin(pitch); strafing stays horizontal', () => {
    const v = swimVelocity(intent({ forward: 1, pitch: -30 }), 90);
    expect(v[0]).toBeCloseTo(4.722222 * Math.cos(30 * RAD), 9);
    expect(v[1]).toBeCloseTo(0, 9);
    expect(v[2]).toBeCloseTo(-4.722222 * 0.5, 9);
    const side = swimVelocity(intent({ strafe: 1, pitch: -60 }), 0);
    expect(side[0]).toBeCloseTo(4.722222, 9);
    expect(side[2]).toBe(0);
    const diagonal = swimVelocity(intent({ forward: 1, strafe: 1 }), 0);
    expect(Math.hypot(...diagonal)).toBeCloseTo(4.722222, 9);
    expect(swimVelocity(intent({ forward: 1, pitch: 90 }), 0)[2]).toBeCloseTo(4.722222, 9);
    expect(swimVelocity(NO_INTENT, 0)).toEqual([0, 0, 0]);
  });

  it('no gravity: a swimmer who does nothing stays where it is', () => {
    const m = swimmer(5);
    for (let k = 0; k < 120; k++) m.step(STEP, NO_INTENT);
    expect(m.state.mode).toBe('swimming');
    expect(m.state.position).toEqual([0, 0, -5]);
    expect(m.state.verticalVelocity).toBe(0);
  });

  it('swims level at 4.722222; pitched down it dives, backwards it goes at 2.5', () => {
    const level = swimmer(5);
    for (let k = 0; k < 60; k++) level.step(STEP, intent({ forward: 1 }));
    expect(level.state.position[1]).toBeCloseTo(4.722222, 9);
    expect(level.state.position[2]).toBe(-5);
    expect(level.speed).toBeCloseTo(4.722222, 9);
    const diving = swimmer(5);
    for (let k = 0; k < 60; k++) diving.step(STEP, intent({ forward: 1, pitch: -30 }));
    expect(diving.state.position[2]).toBeCloseTo(-5 - 4.722222 * 0.5, 9);
    expect(diving.state.position[1]).toBeCloseTo(4.722222 * Math.cos(30 * RAD), 9);
    const back = swimmer(5);
    for (let k = 0; k < 60; k++) back.step(STEP, intent({ forward: -1 }));
    expect(back.state.position[1]).toBeCloseTo(-2.5, 9);
  });

  it('stops on the bottom, still swimming', () => {
    const m = swimmer(9);
    for (let k = 0; k < 120; k++) m.step(STEP, intent({ forward: 1, pitch: -60 }));
    expect(m.state.position[2]).toBe(-10);
    expect(m.state.mode).toBe('swimming');
  });
});

describe('the surface and the jump out (spec §211)', () => {
  it('going up through the surface becomes going along it: the feet stay 0.75 × height under it', () => {
    const m = swimmer(3);
    for (let k = 0; k < 120; k++) m.step(STEP, intent({ forward: 1, pitch: 45 }));
    expect(m.state.position[2]).toBeCloseTo(-ENTER, 12);
    expect(m.state.atSurface).toBe(true);
    expect(m.state.mode).toBe('swimming');
    expect(m.state.verticalVelocity).toBe(0);
    expect(m.speed).toBeCloseTo(4.722222 * Math.SQRT1_2, 9); // along the surface: the horizontal part of the stroke
  });

  it('the jump key under the surface swims up at 4.722222', () => {
    const m = swimmer(5);
    for (let k = 0; k < 30; k++) m.step(STEP, intent({ jump: true }));
    expect(m.state.position[2]).toBeCloseTo(-5 + 4.722222 / 2, 9);
    expect(m.state.mode).toBe('swimming');
    expect(m.state.jumped).toBe(false);
  });

  it('at the surface it is the jump out, at 9.096748 — stronger than on land', () => {
    expect(MOVEMENT.swimJumpSpeed).toBe(9.096748);
    expect(MOVEMENT.swimJumpSpeed).toBeGreaterThan(MOVEMENT.jumpSpeed);
    const m = swimmer(ENTER + 0.01); // within the surface band (0.05)
    m.step(STEP, intent({ forward: 1, jump: true }));
    expect(m.state.mode).toBe('falling');
    expect(m.state.jumped).toBe(true);
    expect(m.state.verticalVelocity).toBeCloseTo(9.096748 - MOVEMENT.gravity / 60, 9);
    let steps = 1;
    while (!m.swimming && steps < 600) {
      m.step(STEP, NO_INTENT);
      steps++;
    }
    // The hop: v² / 2g = 2.145 above the surface line, then back into the water.
    expect(m.state.apexHeight - m.state.launchHeight).toBeGreaterThan(2.14);
    expect(m.state.apexHeight - m.state.launchHeight).toBeLessThanOrEqual(9.096748 ** 2 / (2 * MOVEMENT.gravity) + 1e-9);
    expect(m.state.mode).toBe('swimming');
    expect(m.state.verticalVelocity).toBe(0);
    expect(m.state.position[1]).toBeCloseTo((4.722222 * steps) / 60, 6); // the swim speed is kept through the hop
  });

  it('jumping into deep water from above: the fall ends, the swim starts', () => {
    const m = new PlayerMovement([0, 0, 4], 0, 1, levelGround((_x, y) => (y < 0.5 ? 4 : -10)), undefined, SEA);
    for (let k = 0; k < 20; k++) m.step(STEP, intent({ forward: 1 }));
    expect(m.grounded).toBe(false);
    for (let k = 0; k < 240; k++) m.step(STEP, NO_INTENT);
    expect(m.state.mode).toBe('swimming');
    expect(m.state.waterDepth).toBeGreaterThan(ENTER);
    expect(m.state.waterDepth).toBeLessThan(ENTER + 0.4); // stopped within one step of the line
    expect(m.state.verticalVelocity).toBe(0);
  });
});

describe('camera scene: the pool', () => {
  const P = CAMERA_SCENE_POOL, midY = (P.y0 + P.y1) / 2, tan = Math.tan(P.slopeDegrees * RAD);
  /** x on the slope where the water over the feet reaches the swim depth. */
  const swimX = P.x1 - (ENTER - P.waterLevel) / tan;
  const facing = (scene: CameraScene, degrees: number): void => {
    scene.pointer(2, 0, 0);
    scene.pointer(2, ((degrees - scene.cameraStats.yaw) * 800) / 180, ((0 - scene.cameraStats.pitch) * 600) / 90); // level: the movement is not pitched
    scene.releasePointer();
  };
  const run = (scene: CameraScene, steps: number, keys = ['KeyW'], each?: () => void): void => {
    for (let k = 0; k < steps; k++) {
      scene.fixedStep(STEP, new Set(keys));
      scene.advance(STEP);
      each?.();
    }
  };

  it('is a pit in the ground: 3 deep, with a slope down from its east edge', () => {
    expect(P.x1 - P.x0).toBeCloseTo(12.5, 5);
    expect(CAMERA_SCENE_POOL_SLOPE_FOOT).toBeCloseTo(P.x1 - 3 / tan, 9);
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([P.x0 + 2, midY, -3]);
    run(scene, 1, []);
    expect(scene.cameraStats.position[2]).toBe(-3);
    expect(scene.cameraStats.waterDepth).toBeCloseTo(2.75, 6);
    expect(scene.cameraStats.mode).toBe('swimming');
    scene.dispose();
  });

  it('walking down the slope: walks, wades, then swims exactly where the water is 0.75 × height deep', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([P.x1 + 1, midY, 0]);
    facing(scene, 270);
    let lastWalking = Infinity, firstSwimming = -Infinity;
    run(scene, 90, ['KeyW'], () => {
      const c = scene.cameraStats;
      if (c.mode === 'grounded') lastWalking = Math.min(lastWalking, c.position[0]);
      if (c.mode === 'swimming') firstSwimming = Math.max(firstSwimming, c.position[0]);
    });
    expect(lastWalking).toBeGreaterThan(swimX - 7 / 60 - 1e-6);
    expect(lastWalking).toBeLessThan(swimX + 7 / 60);
    expect(firstSwimming).toBeLessThan(lastWalking);
    const c = scene.cameraStats;
    expect(c.mode).toBe('swimming');
    expect(c.swimEnterDepth).toBeCloseTo(ENTER, 12);
    expect(c.speed).toBeCloseTo(4.722222, 6);
    // It left the bottom where it started to swim — within one step's descent under the surface line — and stays
    // at that depth (no gravity, level stroke) while the slope goes on down under it.
    expect(c.position[2]).toBeLessThanOrEqual(P.waterLevel - ENTER);
    expect(c.position[2]).toBeGreaterThan(P.waterLevel - ENTER - (7 / 60) * tan - 1e-6);
    expect(c.animation).toBe('walk'); // the placeholder for a swim animation
    scene.dispose();
  });

  it('swims across to the far wall, and back out by the slope onto the ground', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([P.x1 + 1, midY, 0]);
    facing(scene, 270);
    run(scene, 400);
    expect(scene.cameraStats.position[0]).toBeCloseTo(P.x0 + 1 / 3 + 0.02, 3); // the capsule against the west wall
    expect(scene.cameraStats.mode).toBe('swimming');
    facing(scene, 90);
    const modes: string[] = [];
    run(scene, 400, ['KeyW'], () => {
      if (modes[modes.length - 1] !== scene.cameraStats.mode) modes.push(scene.cameraStats.mode);
    });
    expect(modes).toEqual(['swimming', 'grounded']); // once: no flicker on the way out
    expect(scene.cameraStats.position[2]).toBe(0);
    expect(scene.cameraStats.position[0]).toBeGreaterThan(P.x1);
    scene.dispose();
  });

  it('Space at the surface hops out of the water and falls back in', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([P.x0 + 4, midY, P.waterLevel - ENTER]);
    run(scene, 2, []);
    expect(scene.cameraStats).toMatchObject({ mode: 'swimming' });
    run(scene, 1, ['Space']);
    expect(scene.cameraStats).toMatchObject({ mode: 'falling', jumped: true });
    let top = -Infinity;
    run(scene, 120, [], () => (top = Math.max(top, scene.cameraStats.position[2])));
    expect(top - (P.waterLevel - ENTER)).toBeGreaterThan(2.1);
    expect(scene.cameraStats.mode).toBe('swimming');
    scene.dispose();
  });

  it('looking down with the right button held, forward dives; the bottom stops the dive', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([P.x0 + 5, midY, P.waterLevel - ENTER]);
    run(scene, 2, []);
    scene.pointer(2, 0, 0);
    scene.pointer(2, ((270 - scene.cameraStats.yaw) * 800) / 180, ((60 - scene.cameraStats.pitch) * 600) / 90); // camera pitch +60: looking down
    run(scene, 10);
    expect(scene.cameraStats.intent.pitch).toBeCloseTo(-60, 6);
    expect(scene.cameraStats.verticalSpeed).toBeCloseTo(-4.722222 * Math.sin(60 * RAD), 5);
    run(scene, 60);
    expect(scene.cameraStats.position[2]).toBe(-3);
    scene.releasePointer();
    // Without the button the movement is level again.
    run(scene, 5);
    expect(scene.cameraStats.intent.pitch).toBe(0);
    expect(scene.cameraStats.position[2]).toBe(-3);
    scene.dispose();
  });

  it('three times as tall, the character walks on the bottom of the pool: the water is not deep enough for it', () => {
    const scene = createCameraScene(new NullBackend(), { characterScale: 3 });
    scene.placeCharacter([P.x0 + 4, midY, -3]);
    run(scene, 5, []);
    expect(scene.cameraStats.swimEnterDepth).toBeCloseTo(3 * ENTER, 9);
    expect(scene.cameraStats.mode).toBe('grounded');
    scene.dispose();
  });
});
