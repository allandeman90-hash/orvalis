import { describe, expect, it } from 'vitest';
import { type GroundProbe, isWalkable, levelGround, MOVEMENT, type MovementIntent, NO_INTENT, PlayerMovement, slopeDegrees } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_RAMPS, type CameraScene, createCameraScene, rampTopX } from '../../src/scenes/cameraScene';

const STEP = 1000 / 60, RAD = Math.PI / 180;
const intent = (change: Partial<MovementIntent>): MovementIntent => ({ ...NO_INTENT, ...change });
const EAST = intent({ forward: 1 }); // with heading 90
const normalOf = (degrees: number): [number, number, number] => [-Math.sin(degrees * RAD), 0, Math.cos(degrees * RAD)];

/** Level ground at 0 for x < 0, a slope rising towards +x up to `height`, then a platform up to x = `end`, then ground at 0 again. */
function ramp(degrees: number, height = 2.4, end = 20): GroundProbe {
  const top = height / Math.tan(degrees * RAD);
  return (x, _y, fromZ, maxDrop) => {
    const onSlope = x >= 0 && x < top;
    const z = x < 0 || x > end ? 0 : onSlope ? x * Math.tan(degrees * RAD) : height;
    return z <= fromZ && fromZ - z <= maxDrop ? { height: z, normal: onSlope ? normalOf(degrees) : [0, 0, 1] } : null;
  };
}

describe('walkable slopes (spec §204)', () => {
  it('50° is the limit', () => {
    expect(MOVEMENT.walkableSlopeDegrees).toBe(50);
    expect(Math.cos(50 * RAD)).toBeCloseTo(0.642788, 6);
    expect(isWalkable([0, 0, 1])).toBe(true);
    expect(isWalkable(normalOf(49.9))).toBe(true);
    expect(isWalkable(normalOf(50))).toBe(true);
    expect(isWalkable(normalOf(50.1))).toBe(false);
    expect(isWalkable([1, 0, 0])).toBe(false);
    expect(slopeDegrees(normalOf(30))).toBeCloseTo(30, 9);
    expect(slopeDegrees([0, 0, 1])).toBe(0);
  });

  for (const degrees of [30, 45, 50]) {
    it(`walks up a ${degrees}° slope: the feet follow it, at 7 per second on the horizontal`, () => {
      const m = new PlayerMovement([-0.5, 0, 0], 90, 1, ramp(degrees));
      for (let k = 1; k <= 20; k++) {
        m.step(STEP, EAST);
        const x = -0.5 + (7 * k) / 60;
        expect(m.state.position[0]).toBeCloseTo(x, 9);
        expect(m.state.position[2]).toBeCloseTo(Math.max(0, Math.min(2.4, x * Math.tan(degrees * RAD))), 9);
        expect(m.state.mode).toBe('grounded');
        expect(m.speed).toBeCloseTo(7, 9);
      }
      expect(m.state.blockedBySlope).toBe(false);
    });
  }

  it('reports the slope under the feet', () => {
    const m = new PlayerMovement([-0.5, 0, 0], 90, 1, ramp(30));
    for (let k = 0; k < 12; k++) m.step(STEP, EAST);
    expect(slopeDegrees(m.state.groundNormal)).toBeCloseTo(30, 9);
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(slopeDegrees(m.state.groundNormal)).toBe(0); // on the platform
    expect(m.state.position[2]).toBe(2.4);
  });

  it('cannot walk up a 55° slope: the step is refused and the character stays at its foot', () => {
    const m = new PlayerMovement([-0.5, 0, 0], 90, 1, ramp(55));
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeLessThanOrEqual(0);
    expect(m.state.position[0]).toBeGreaterThan(-7 / 60);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.blockedBySlope).toBe(true);
    expect(m.speed).toBe(0);
    expect(m.state.mode).toBe('grounded');
    // Turning away frees it at once.
    m.step(STEP, intent({ forward: -1 }));
    expect(m.state.blockedBySlope).toBe(false);
    expect(m.speed).toBe(4.5);
  });

  it('walks DOWN a slope without leaving the ground (the probe reaches 0.2 under the feet)', () => {
    const m = new PlayerMovement([3, 0, 2.4], 270, 1, ramp(45));
    for (let k = 0; k < 40; k++) {
      m.step(STEP, EAST); // forward, heading west
      expect(m.state.mode).toBe('grounded');
    }
    expect(m.state.position[2]).toBe(0);
    expect(m.state.position[0]).toBeLessThan(0);
  });
});

describe('ground and landing probes (spec §206)', () => {
  it('the ground snap is 0.2 and the landing probe 0.05', () => {
    expect(MOVEMENT.groundSnap).toBe(0.2);
    expect(MOVEMENT.landingProbe).toBe(0.05);
  });

  it('a drop of more than 0.2 is a fall; a drop of less is followed', () => {
    const stepDown = (drop: number): PlayerMovement => {
      const m = new PlayerMovement([0, -0.05, drop], 0, 1, levelGround((_x, y) => (y < 0 ? drop : 0)));
      m.step(STEP, intent({ forward: 1 }));
      return m;
    };
    const small = stepDown(0.19);
    expect(small.state.mode).toBe('grounded');
    expect(small.state.position[2]).toBe(0);
    const large = stepDown(0.21);
    expect(large.state.mode).toBe('falling');
    expect(large.state.position[2]).toBe(0.21);
  });

  it('a rise of less than 0.2 is followed too (higher ones are the step-up of P8.5)', () => {
    const m = new PlayerMovement([0, -0.05, 0], 0, 1, levelGround((_x, y) => (y < 0 ? 0 : 0.15)));
    m.step(STEP, intent({ forward: 1 }));
    expect(m.state.position[2]).toBe(0.15);
    expect(m.state.mode).toBe('grounded');
  });

  it('lands as soon as the feet are within 0.05 of the ground', () => {
    // Dropped from h: after 20 steps the feet are h − g·(1/3)² / 2 above the ground.
    const fallen = 0.5 * MOVEMENT.gravity * (1 / 3) ** 2;
    const landingStep = (h: number): number => {
      const m = new PlayerMovement([0, 0, h], 0, 1, levelGround(() => 0));
      m.step(STEP, NO_INTENT); // nothing within 0.2: the fall starts
      expect(m.state.mode).toBe('falling');
      let steps = 0;
      while (!m.grounded) {
        m.step(STEP, NO_INTENT);
        steps++;
      }
      expect(m.state.position[2]).toBe(0);
      return steps;
    };
    expect(landingStep(fallen + 0.04)).toBe(20); // 0.04 above after 20 steps: within the probe
    expect(landingStep(fallen + 0.06)).toBe(21); // 0.06 above: one more step
  });
});

describe('too steep to stand on: sliding (spec §204, §207)', () => {
  it('dropped on a 55° slope, the character slides down it and stops on the level ground', () => {
    const m = new PlayerMovement([1, 0, 3], 90, 1, ramp(55));
    let slid = 0, steps = 0;
    const tan = Math.tan(55 * RAD);
    do {
      m.step(STEP, NO_INTENT);
      steps++;
      if (m.state.sliding) {
        slid++;
        expect(m.state.mode).not.toBe('grounded');
        expect(m.state.position[2]).toBeCloseTo(m.state.position[0] * tan, 9); // on the surface
        expect(m.state.velocity[0]).toBeLessThan(0); // going down, towards −x
      }
    } while (!m.grounded && steps < 600);
    expect(slid).toBeGreaterThan(5);
    expect(m.state.mode).toBe('grounded');
    expect(m.state.position[2]).toBe(0);
    expect(m.state.position[0]).toBeLessThan(0);
    expect(m.state.sliding).toBe(false);
  });

  it('the slide follows the plane: the velocity has no part into the surface', () => {
    const m = new PlayerMovement([1, 0, 3], 90, 1, ramp(55));
    const n = normalOf(55);
    for (let k = 0; k < 600 && !m.state.sliding; k++) m.step(STEP, NO_INTENT);
    expect(m.state.sliding).toBe(true);
    expect(m.state.velocity[0] * n[0] + m.state.verticalVelocity * n[2]).toBeCloseTo(0, 9);
  });

  it('dropped on a 45° slope, the character simply lands', () => {
    const m = new PlayerMovement([1, 0, 3], 90, 1, ramp(45));
    for (let k = 0; k < 120; k++) {
      m.step(STEP, NO_INTENT);
      expect(m.state.sliding).toBe(false);
    }
    expect(m.state.mode).toBe('grounded');
    expect(m.state.position).toEqual([1, 0, 1 * Math.tan(45 * RAD)]);
  });
});

describe('camera scene: the real ground (rays against the collision faces)', () => {
  const R = CAMERA_SCENE_RAMPS;
  const middleOf = (degrees: number): number => {
    const lane = R.lanes.find((l) => l.degrees === degrees)!;
    return (lane.y[0] + lane.y[1]) / 2;
  };
  /** A scene with the character at the foot of a lane, facing it (east). */
  const atLane = (degrees: number): CameraScene => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([R.startX - 0.5, middleOf(degrees), 0]);
    scene.pointer(2, 0, 0);
    scene.pointer(2, 400, 0); // +90°: east
    scene.releasePointer();
    return scene;
  };
  const walk = (scene: CameraScene, steps: number, keys = ['KeyW']): void => {
    for (let k = 0; k < steps; k++) scene.fixedStep(STEP, new Set(keys));
  };

  for (const degrees of [30, 45, 50]) {
    it(`walks up the ${degrees}° lane to its platform`, () => {
      const scene = atLane(degrees);
      walk(scene, 12);
      const mid = scene.cameraStats;
      expect(mid.position[2]).toBeCloseTo((mid.position[0] - R.startX) * Math.tan(degrees * RAD), 4);
      expect(mid.slope).toBeCloseTo(degrees, 3);
      walk(scene, 60);
      expect(scene.cameraStats.position[2]).toBeCloseTo(R.height, 5);
      expect(scene.cameraStats.position[0]).toBeGreaterThan(rampTopX(degrees));
      expect(scene.cameraStats).toMatchObject({ mode: 'grounded', flights: 0, blockedBySlope: false });
      scene.dispose();
    });
  }

  it('is stopped at the foot of the 55° lane', () => {
    const scene = atLane(55);
    walk(scene, 90);
    const c = scene.cameraStats;
    // (Since P8.4 the collision capsule meets the slope a little before the feet do.)
    expect(c.blockedBySlope || c.touching).toBe(true);
    expect(c.position[2]).toBe(0);
    expect(c.position[0]).toBeLessThanOrEqual(R.startX + 1e-6);
    expect(c.speed).toBe(0);
    scene.dispose();
  });

  it('walks off the far end of a platform, falls 2.4 and lands on the ground', () => {
    const scene = atLane(30);
    scene.placeCharacter([R.endX - 1, middleOf(30), R.height]);
    walk(scene, 60);
    const c = scene.cameraStats;
    expect(c).toMatchObject({ mode: 'grounded', flights: 1, jumped: false, respawns: 0 });
    expect(c.position[2]).toBe(0);
    expect(c.position[0]).toBeGreaterThan(R.endX);
    // 2.4 at g = 19.29: 0.499 s, seen at the first step where the feet are within 0.05 of the ground.
    expect(c.airSeconds).toBeCloseTo(30 / 60, 9);
    scene.dispose();
  });

  it('jumping onto the 55° lane from its side: slides back down to the ground', () => {
    const scene = atLane(55);
    scene.placeCharacter([R.startX + 0.6, middleOf(55), 3]);
    let slid = false;
    for (let k = 0; k < 300; k++) {
      scene.fixedStep(STEP, new Set());
      slid ||= scene.cameraStats.sliding;
    }
    expect(slid).toBe(true);
    expect(scene.cameraStats.mode).toBe('grounded');
    expect(scene.cameraStats.position[2]).toBe(0);
    expect(scene.cameraStats.position[0]).toBeLessThan(R.startX);
    scene.dispose();
  });

  it('inside the cottage the feet are on its floor (0.02 above the ground outside)', () => {
    const scene = createCameraScene(new NullBackend());
    walk(scene, 60); // 7 north from y = −8: through the door (no wall collision yet), to y = −1
    expect(scene.cameraStats.position[1]).toBeCloseTo(-1, 6);
    expect(scene.cameraStats.position[2]).toBeCloseTo(0.02, 6);
    expect(scene.cameraStats.mode).toBe('grounded');
    scene.dispose();
  });

  it('beyond the edge of the ground there is nothing: the fall starts', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([0, 39.95, 0]);
    walk(scene, 2);
    expect(scene.cameraStats).toMatchObject({ mode: 'falling', jumped: false });
    scene.dispose();
  });
});
