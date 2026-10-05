import { describe, expect, it } from 'vitest';
import { airVelocity, levelGround, MOVEMENT, type MovementIntent, NO_INTENT, PlayerMovement } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, CAMERA_SCENE_GROUND_HALF_SIZE, createCameraScene } from '../../src/scenes/cameraScene';

const STEP = 1000 / 60;
const intent = (change: Partial<MovementIntent>): MovementIntent => ({ ...NO_INTENT, ...change });
const V = MOVEMENT.jumpSpeed, G = MOVEMENT.gravity;

/** Steps until the character is back on the ground; returns the number of steps in the air. */
function flight(m: PlayerMovement, during: MovementIntent, first: MovementIntent, stepMs = STEP): number {
  m.step(stepMs, first);
  let steps = 1;
  while (!m.grounded && steps < 100000) {
    m.step(stepMs, during);
    steps++;
  }
  return steps;
}

describe('jump and gravity (spec §201)', () => {
  it('follows the ideal ballistic formula exactly at every step', () => {
    const m = new PlayerMovement([0, 0, 5]);
    m.step(STEP, intent({ jump: true }));
    expect(m.state.mode).toBe('falling');
    for (let k = 1; k <= 20; k++) {
      const t = (k * STEP) / 1000;
      expect(m.state.position[2]).toBeCloseTo(5 + V * t - 0.5 * G * t * t, 9);
      expect(m.state.verticalVelocity).toBeCloseTo(V - G * t, 9);
      m.step(STEP, NO_INTENT);
    }
  });

  it('gains about 1.64 yards, peaks after about 0.412 s and lands after about 0.825 s', () => {
    const m = new PlayerMovement([0, 0, 0]);
    const steps = flight(m, NO_INTENT, intent({ jump: true }));
    expect(V / G).toBeCloseTo(0.4124, 4);
    expect((V * V) / (2 * G)).toBeCloseTo(1.6404, 4);
    // Sampled every 1/60 s, the highest sample is within g·(dt/2)²/2 of the true apex.
    expect(m.state.apexHeight).toBeGreaterThan(1.6404 - 0.001);
    expect(m.state.apexHeight).toBeLessThanOrEqual((V * V) / (2 * G) + 1e-9);
    // The true flight lasts 2v/g = 0.8248 s: the landing is seen at the first step after it.
    expect(steps).toBe(Math.ceil(((2 * V) / G) * 60));
    expect(m.state.airSeconds).toBeCloseTo(steps / 60, 9);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.verticalVelocity).toBe(0);
    expect(m.state.mode).toBe('grounded');
  });

  it('the same jump whatever the step length (the formula is exact, not an approximation)', () => {
    const fine = new PlayerMovement([0, 0, 0]), coarse = new PlayerMovement([0, 0, 0]);
    fine.step(10, intent({ jump: true }));
    for (let k = 1; k < 30; k++) fine.step(10, NO_INTENT);
    coarse.step(100, intent({ jump: true }));
    coarse.step(200, NO_INTENT);
    expect(coarse.state.position[2]).toBeCloseTo(fine.state.position[2], 9);
    expect(coarse.state.verticalVelocity).toBeCloseTo(fine.state.verticalVelocity, 9);
  });

  it('cannot jump again in the air; held, jumps again once landed', () => {
    const m = new PlayerMovement([0, 0, 0]);
    const held = intent({ jump: true });
    const steps = flight(m, held, held);
    expect(steps).toBe(50);
    expect(m.state.apexHeight).toBeLessThan(1.65); // no second impulse on the way
    m.step(STEP, held);
    expect(m.state.mode).toBe('falling');
    expect(m.state.verticalVelocity).toBeCloseTo(V - G / 60, 9);
  });

  it('never falls faster than the terminal speed', () => {
    const m = new PlayerMovement([0, 0, 0], 0, 1, levelGround(() => null));
    m.step(STEP, NO_INTENT);
    expect(m.state.mode).toBe('falling'); // no ground: falls at once, without a jump
    for (let k = 0; k < 60 * 6; k++) m.step(STEP, NO_INTENT);
    expect(m.state.verticalVelocity).toBe(-MOVEMENT.terminalSpeed);
    const z = m.state.position[2];
    m.step(1000, NO_INTENT);
    expect(z - m.state.position[2]).toBeCloseTo(MOVEMENT.terminalSpeed, 9);
  });

  it('scales with unitsPerYard', () => {
    const m = new PlayerMovement([0, 0, 0], 0, 2);
    flight(m, NO_INTENT, intent({ jump: true }));
    expect(m.state.apexHeight).toBeGreaterThan(2 * 1.639);
    expect(m.state.apexHeight).toBeLessThan(2 * 1.641);
  });
});

describe('falling states (spec §202)', () => {
  it('a jump becomes a far fall once 1/9 yard under where it started', () => {
    // Jump from a ledge at height 3: the ground is at 0 beyond y = 1.
    const m = new PlayerMovement([0, 0, 3], 0, 1, levelGround((_x, y) => (y < 1 ? 3 : 0)));
    const go = intent({ forward: 1 });
    m.step(STEP, intent({ forward: 1, jump: true }));
    let farAt: number | null = null;
    while (!m.grounded) {
      const before = m.state.mode;
      m.step(STEP, go);
      if (before === 'falling' && m.state.mode === 'fallingFar') farAt = m.state.position[2];
    }
    expect(farAt).not.toBeNull();
    expect(farAt!).toBeLessThan(3 - 1 / 9);
    expect(farAt!).toBeGreaterThan(3 - 1 / 9 - 0.2); // seen at the first step under the line
    expect(m.state.position[2]).toBe(0);
  });

  it('an ordinary jump on flat ground never becomes a far fall', () => {
    const m = new PlayerMovement([0, 0, 0]);
    m.step(STEP, intent({ jump: true }));
    while (!m.grounded) {
      expect(m.state.mode).toBe('falling');
      m.step(STEP, NO_INTENT);
    }
  });

  it('walking off an edge: no vertical speed at first, a far fall after 0.5 s', () => {
    const m = new PlayerMovement([0, 0, 10], 0, 1, levelGround((_x, y) => (y < 1 ? 10 : null)));
    const go = intent({ forward: 1 });
    while (m.grounded) m.step(STEP, go);
    expect(m.state.jumped).toBe(false);
    expect(m.state.verticalVelocity).toBe(0);
    expect(m.state.position[2]).toBe(10);
    expect(m.state.velocity[1]).toBeCloseTo(7, 9);
    let steps = 0;
    while (m.state.mode === 'falling') {
      m.step(STEP, go);
      steps++;
    }
    expect(m.state.mode).toBe('fallingFar');
    expect(steps).toBe(30); // 0.5 s
    expect(m.state.position[2]).toBeCloseTo(10 - 0.5 * G * 0.25, 9);
  });

  it('does not land on a ground it is already under', () => {
    // Falls off a ledge at height 5 and passes UNDER another one, of the same height, that starts at y = 15.
    const m = new PlayerMovement([0, 0, 5], 0, 1, levelGround((_x, y) => (y < 1 || y > 15 ? 5 : null)));
    const go = intent({ forward: 1 });
    while (m.state.position[1] < 17) m.step(STEP, go);
    expect(m.grounded).toBe(false);
    expect(m.state.position[2]).toBeLessThan(0);
  });
});

describe('air control (spec §208)', () => {
  it('a running jump keeps its horizontal speed, with or without the key', () => {
    for (const during of [NO_INTENT, intent({ forward: 1 })]) {
      const m = new PlayerMovement([0, 0, 0], 0);
      const steps = flight(m, during, intent({ forward: 1, jump: true }));
      expect(m.state.position[1]).toBeCloseTo((7 * steps) / 60, 9);
      expect(m.state.position[0]).toBeCloseTo(0, 9);
    }
  });

  it('a standing jump can be steered at 2.5 only', () => {
    const m = new PlayerMovement([0, 0, 0], 90);
    const steps = flight(m, intent({ forward: 1 }), intent({ jump: true }));
    // The first step had no direction; the others drift east at 2.5.
    expect(m.state.position[0]).toBeCloseTo((2.5 * (steps - 1)) / 60, 9);
  });

  it('pulling back in a running jump only takes 2.5 off', () => {
    expect(airVelocity([0, 7], intent({ forward: -1 }), 0, 2.5)).toEqual([0, 4.5]);
    const side = airVelocity([0, 7], intent({ strafe: 1 }), 0, 2.5);
    expect(Math.hypot(side[0], side[1])).toBeCloseTo(7, 9); // never faster than it was
    expect(side[0]).toBeGreaterThan(2);
    expect(airVelocity([0, 7], NO_INTENT, 123, 2.5)).toEqual([0, 7]);
    const diagonal = airVelocity([0, 0], intent({ forward: 1, strafe: 1 }), 0, 2.5);
    expect(Math.hypot(diagonal[0], diagonal[1])).toBeCloseTo(2.5, 9);
  });

  it('turning in the air does not bend the path', () => {
    const m = new PlayerMovement([0, 0, 0], 0);
    flight(m, intent({ turn: 1 }), intent({ forward: 1, jump: true }));
    expect(m.state.position[0]).toBeCloseTo(0, 9);
    expect(m.state.heading).toBeGreaterThan(90);
  });
});

describe('camera scene: jump, edge and respawn', () => {
  it('Space jumps, the animation follows, and the pivot rises with the character', () => {
    const scene = createCameraScene(new NullBackend());
    scene.fixedStep(STEP, new Set(['Space']));
    scene.advance(STEP);
    expect(scene.cameraStats).toMatchObject({ mode: 'falling', jumped: true, flights: 1, animation: 'jumpStart' });
    let top = 0;
    for (let k = 0; k < 49; k++) {
      scene.fixedStep(STEP, new Set());
      scene.advance(STEP);
      top = Math.max(top, scene.cameraStats.pivot[2] - scene.cameraStats.pivotHeight);
    }
    expect(top).toBeGreaterThan(1.63);
    expect(scene.cameraStats).toMatchObject({ mode: 'grounded', flights: 1 });
    expect(scene.cameraStats.position[2]).toBe(0);
    for (let k = 0; k < 120; k++) scene.advance(STEP);
    expect(scene.cameraStats.animation).toBe('stand');
    scene.dispose();
  });

  it('falls off the edge of the ground and is put back at the start', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([0, CAMERA_SCENE_GROUND_HALF_SIZE - 0.05, 0]);
    const w = new Set(['KeyW']);
    let steps = 0;
    while (scene.cameraStats.respawns === 0 && steps < 2000) {
      scene.fixedStep(STEP, w);
      steps++;
      if (steps === 2) expect(scene.cameraStats).toMatchObject({ mode: 'falling', jumped: false });
    }
    expect(scene.cameraStats.respawns).toBe(1);
    expect(scene.cameraStats.position).toEqual([...CAMERA_SCENE_CHARACTER]);
    expect(scene.cameraStats.mode).toBe('grounded');
    scene.dispose();
  });
});

describe('camera scene: jumping again right after landing (regression)', () => {
  it('plays the jump animation even when the landing animation is not over', () => {
    const scene = createCameraScene(new NullBackend());
    const run = (keys: string[], steps: number): void => {
      for (let k = 0; k < steps; k++) {
        scene.fixedStep(STEP, new Set(keys));
        scene.advance(STEP);
      }
    };
    run(['Space'], 1);
    run([], 49);
    expect(scene.cameraStats).toMatchObject({ mode: 'grounded', animation: 'jumpEnd' });
    run(['Space'], 1);
    expect(scene.cameraStats).toMatchObject({ mode: 'falling', flights: 2, animation: 'jumpStart' });
    scene.dispose();
  });
});
