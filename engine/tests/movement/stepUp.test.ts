import { describe, expect, it } from 'vitest';
import { defaultCapsule, type GroundProbe, MOVEMENT, type MovementCollider, type MovementIntent, NO_INTENT, PlayerMovement, resolveCapsule, type TriangleQuery, type Vec3 } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_STEPS, type CameraScene, createCameraScene } from '../../src/scenes/cameraScene';

const STEP = 1000 / 60;
const EAST: MovementIntent = { ...NO_INTENT, forward: 1 }; // with heading 90
const SHAPE = defaultCapsule(), REACH = SHAPE.radius + SHAPE.skin;
type Triangle = readonly [Vec3, Vec3, Vec3];
const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Triangle[] => [[a, b, c], [a, c, d]];
interface Box { x0: number; x1: number; y0: number; y1: number; z0?: number; h: number }
/** Top, bottom (when it floats) and four sides. */
const boxTriangles = ({ x0, x1, y0, y1, z0 = 0, h }: Box): Triangle[] => [
  ...quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]),
  ...(z0 > 0 ? quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]) : []),
  ...quad([x0, y1, z0], [x0, y0, z0], [x0, y0, h], [x0, y1, h]), ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, h], [x1, y0, h]),
  ...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, h], [x0, y0, h]), ...quad([x1, y1, z0], [x0, y1, z0], [x0, y1, h], [x1, y1, h]),
];
/** A world of boxes on a level ground at 0: its collider and its ground probe (the highest top under the start of the ray). */
function world(boxes: readonly Box[], steepTop = false): { collider: MovementCollider; probe: GroundProbe } {
  const triangles = boxes.flatMap(boxTriangles);
  const query: TriangleQuery = (_min, _max, visit) => triangles.forEach(([a, b, c]) => visit(a, b, c));
  return {
    collider: (feet, horizontalOnly, lift) => resolveCapsule(feet, lift === undefined ? SHAPE : { ...SHAPE, lift }, query, { horizontalOnly }),
    probe: (x, y, fromZ, maxDrop) => {
      let best = 0, onBox = false;
      for (const b of boxes) if ((b.z0 ?? 0) === 0 && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && b.h <= fromZ && b.h > best) {
        best = b.h;
        onBox = true;
      }
      if (fromZ - best > maxDrop || best > fromZ) return null;
      const s = Math.sin((60 * Math.PI) / 180), c = Math.cos((60 * Math.PI) / 180);
      return { height: best, normal: onBox && steepTop ? [-s, 0, c] : [0, 0, 1] };
    },
  };
}
const block = (h: number, x1 = 16): Box => ({ x0: 12, x1, y0: -3, y1: 3, h });
const walker = (w: ReturnType<typeof world>, x = 11): PlayerMovement => new PlayerMovement([x, 0, 0], 90, 1, w.probe, w.collider);

describe('automatic step-up (spec §205)', () => {
  it('the player step height is 1.0', () => {
    expect(MOVEMENT.playerStepHeight).toBe(1.0);
    expect(MOVEMENT.creatureStepHeight).toBe(2.0);
  });

  for (const h of [0.3, 0.5, 1.0]) {
    it(`walks onto a block ${h} high without slowing down: the feet rise when they reach it`, () => {
      const m = walker(world([block(h)]));
      for (let k = 1; k <= 30; k++) {
        m.step(STEP, EAST);
        const x = 11 + (7 * k) / 60;
        expect(m.state.position[0]).toBeCloseTo(x, 9); // 7 per second all the way: no pause at the step
        expect(m.state.position[2]).toBe(x >= 12 ? h : 0);
        expect(m.state.mode).toBe('grounded');
      }
      expect(m.state.stepUps).toBe(1);
      expect(m.state.touching).toBe(false);
    });
  }

  it('reports the step it takes, once', () => {
    const m = walker(world([block(0.5)]));
    const flags: boolean[] = [];
    for (let k = 0; k < 20; k++) {
      m.step(STEP, EAST);
      flags.push(m.state.steppedUp);
    }
    expect(flags.filter(Boolean).length).toBe(1);
    expect(flags.indexOf(true)).toBe(8); // 9th step: x = 11 + 9 × 7/60 = 12.05
  });

  it('a block 1.05 high is a wall: the capsule stops radius + skin from it', () => {
    const m = walker(world([block(1.05)]));
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeCloseTo(12 - REACH, 6);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.stepUps).toBe(0);
    expect(m.state.touching).toBe(true);
    expect(m.speed).toBe(0);
  });

  it('no upward clearance: a ceiling over the character refuses the step', () => {
    // Standing height 2.03 + step 0.8 = 2.83 needed; the slab is at 2.5, over where the character walks.
    const m = walker(world([block(0.8), { x0: 8, x1: 20, y0: -3, y1: 3, z0: 2.5, h: 2.7 }]));
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeCloseTo(12 - REACH, 6);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.stepUps).toBe(0);
  });

  it('no room at the raised level: a ceiling over the step only refuses it too', () => {
    const m = walker(world([block(0.8), { x0: 12, x1: 20, y0: -3, y1: 3, z0: 2.5, h: 2.7 }]));
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeLessThan(12);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.stepUps).toBe(0);
  });

  it('no support: a top too steep to stand on is not a step', () => {
    const m = walker(world([block(0.6)], true));
    for (let k = 0; k < 60; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeCloseTo(12 - REACH, 6);
    expect(m.state.stepUps).toBe(0);
  });

  it('a staircase: four steps of 0.5, climbed at 7 per second on the horizontal', () => {
    const stair = [0, 1, 2, 3].map((k) => ({ x0: 12 + 0.8 * k, x1: 20, y0: -3, y1: 3, h: 0.5 * (k + 1) }));
    const m = walker(world(stair));
    for (let k = 1; k <= 48; k++) {
      m.step(STEP, EAST);
      const x = 11 + (7 * k) / 60;
      expect(m.state.position[0]).toBeCloseTo(x, 9);
      expect(m.state.position[2]).toBe(x < 12 ? 0 : 0.5 * Math.min(4, Math.floor((x - 12) / 0.8 + 1e-9) + 1));
    }
    expect(m.state.stepUps).toBe(4);
    expect(m.state.position[2]).toBe(2);
  });

  it('a low thin wall is stepped onto and off again', () => {
    const m = walker(world([{ x0: 12, x1: 12.4, y0: -3, y1: 3, h: 0.5 }]));
    let onTop = 0;
    for (let k = 0; k < 60; k++) {
      m.step(STEP, EAST);
      if (m.state.position[2] === 0.5 && m.grounded) onTop++;
    }
    expect(onTop).toBeGreaterThan(1);
    expect(m.state.position[0]).toBeGreaterThan(13);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.mode).toBe('grounded');
  });

  it('meeting a step at an angle: climbed too, without a sideways kick', () => {
    const w = world([block(0.5)]);
    const m = new PlayerMovement([11, 0, 0], 45, 1, w.probe, w.collider);
    for (let k = 0; k < 30; k++) {
      m.step(STEP, EAST);
      expect(m.speed).toBeCloseTo(7, 9);
    }
    expect(m.state.position[2]).toBe(0.5);
    expect(m.state.position[0]).toBeCloseTo(11 + 3.5 * Math.SQRT1_2, 9);
    expect(m.state.position[1]).toBeCloseTo(3.5 * Math.SQRT1_2, 9);
  });

  it('arriving on a step with no room for the capsule on it: the move is refused', () => {
    // Nothing ever stops the capsule sideways here (so nothing announces the step ahead), but nothing fits at
    // the height of the step: only the check made on arrival can refuse it.
    const w = world([block(0.5)]);
    const noRoomUp: MovementCollider = (feet, horizontalOnly) => ({ position: [feet[0], feet[1], feet[2]], normals: [], touched: !horizontalOnly && feet[2] >= 0.4, reach: REACH });
    const m = new PlayerMovement([11, 0, 0], 90, 1, w.probe, noRoomUp);
    for (let k = 0; k < 30; k++) m.step(STEP, EAST);
    expect(m.state.position[0]).toBeLessThan(12);
    expect(m.state.position[0]).toBeGreaterThan(12 - 7 / 60);
    expect(m.state.position[2]).toBe(0);
    expect(m.state.blockedBySlope).toBe(true);
    expect(m.state.stepUps).toBe(0);
  });

  it('a jump does not step: in the air the low capsule still meets the block', () => {
    const m = walker(world([block(1.0)]), 11.6);
    m.step(STEP, { ...EAST, jump: true });
    m.step(STEP, EAST);
    expect(m.state.stepUps).toBe(0);
    expect(m.grounded).toBe(false);
  });
});

describe('camera scene: the test steps', () => {
  const S = CAMERA_SCENE_STEPS;
  const at = (y: number): CameraScene => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([S.startX - 1, y, 0]);
    scene.pointer(2, 0, 0);
    scene.pointer(2, 400, 0); // east
    scene.releasePointer();
    return scene;
  };
  const walk = (scene: CameraScene, steps: number): void => {
    for (let k = 0; k < steps; k++) {
      scene.fixedStep(STEP, new Set(['KeyW']));
      scene.advance(STEP);
    }
  };

  it('climbs the staircase to the platform at 2.0, at 7 per second, in the run animation', () => {
    const scene = at(11.5);
    const animations = new Set<string>();
    for (let k = 1; k <= 54; k++) {
      walk(scene, 1);
      animations.add(scene.cameraStats.animation);
      expect(scene.cameraStats.position[0]).toBeCloseTo(S.startX - 1 + (7 * k) / 60, 5);
    }
    expect(scene.cameraStats.position[2]).toBeCloseTo(2, 5);
    expect(scene.cameraStats.stepUps).toBe(4);
    expect(scene.cameraStats.flights).toBe(0);
    expect([...animations]).toEqual(['run']);
    scene.dispose();
  });

  it('runs back DOWN the staircase: at 7 per second it leaves the first step and lands at the bottom, without the jump animation', () => {
    const scene = at(11.5);
    scene.placeCharacter([S.startX + 4, 11.5, 2]);
    scene.pointer(2, 0, 0);
    scene.pointer(2, 800, 0); // +180°: west
    scene.releasePointer();
    const animations = new Set<string>();
    for (let k = 0; k < 60; k++) {
      walk(scene, 1);
      animations.add(scene.cameraStats.animation);
    }
    expect(scene.cameraStats.position[2]).toBe(0);
    // Real gravity: a drop of 0.5 takes 0.23 s, in which the run covers 1.6 — two treads. The fall goes over the
    // steps (the document gives a ground snap of 0.2 only: there is no « step down »). Under 0.5 s: not a far fall.
    expect(scene.cameraStats.flights).toBe(1);
    expect(scene.cameraStats.airSeconds).toBeLessThan(0.5);
    expect([...animations].some((a) => a.startsWith('jump'))).toBe(false);
    scene.dispose();
  });

  it('climbs the block of exactly 1.0, and is stopped by the block of 1.2', () => {
    const low = at(15.5);
    walk(low, 30);
    expect(low.cameraStats.position[2]).toBeCloseTo(S.block.height, 6);
    expect(low.cameraStats.stepUps).toBe(1);
    low.dispose();
    const tall = at(19.5);
    walk(tall, 30);
    expect(tall.cameraStats.position[2]).toBe(0);
    expect(tall.cameraStats.position[0]).toBeCloseTo(S.startX - REACH, 4);
    expect(tall.cameraStats).toMatchObject({ stepUps: 0, touching: true });
    tall.dispose();
  });

  it('the cottage door still lets it in, and the walls are not steps', () => {
    const scene = createCameraScene(new NullBackend());
    walk(scene, 200);
    expect(scene.cameraStats.position[2]).toBeCloseTo(0.02, 6);
    expect(scene.cameraStats.stepUps).toBe(0);
    scene.dispose();
  });
});
