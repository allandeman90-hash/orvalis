import { describe, expect, it } from 'vitest';
import { COTTAGE } from '../../src/building';
import { CAPSULE_MAX_PASSES, capsuleAxis, closestPointOnTriangle, closestVerticalSegmentTriangle, defaultCapsule, MOVEMENT, type MovementCollider, type MovementIntent, NO_INTENT, PlayerMovement, resolveCapsule, type SegmentTriangleClosest, type TriangleQuery, type Vec3 } from '../../src/movement';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_RAMPS, type CameraScene, createCameraScene } from '../../src/scenes/cameraScene';

const STEP = 1000 / 60;
const intent = (change: Partial<MovementIntent>): MovementIntent => ({ ...NO_INTENT, ...change });
const SHAPE = defaultCapsule(), REACH = SHAPE.radius + SHAPE.skin;
type Triangle = readonly [Vec3, Vec3, Vec3];
const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Triangle[] => [[a, b, c], [a, c, d]];
const query = (triangles: readonly Triangle[]): TriangleQuery => (_min, _max, visit) => triangles.forEach(([a, b, c]) => visit(a, b, c));
/** A wall on the plane x = 1, from y = −5 to 5, `height` high. */
const wallX = (height = 3): Triangle[] => quad([1, -5, 0], [1, 5, 0], [1, 5, height], [1, -5, height]);
const wallY = (): Triangle[] => quad([-5, 1, 0], [5, 1, 0], [5, 1, 3], [-5, 1, 3]);
const closest = (): SegmentTriangleClosest => ({ z: 0, point: [0, 0, 0], distance: 0 });

describe('capsule shape (spec §203, §206)', () => {
  it('uses the fallback radius 1/3 and height 2.0277777, a skin of 0.02, and starts 0.2 above the feet', () => {
    expect(SHAPE).toEqual({ radius: 1 / 3, height: 2.0277777, lift: 0.2, skin: 0.02 });
    expect(defaultCapsule(2).radius).toBeCloseTo(2 / 3, 12);
    const axis = capsuleAxis(10, SHAPE);
    expect(axis.bottom).toBeCloseTo(10 + 0.2 + 1 / 3, 12);
    expect(axis.top).toBeCloseTo(10 + 2.0277777 - 1 / 3, 12);
    expect(CAPSULE_MAX_PASSES).toBe(4);
  });
});

describe('closest points', () => {
  const a: Vec3 = [0, 0, 0], b: Vec3 = [2, 0, 0], c: Vec3 = [0, 2, 0];
  it('point to triangle: face, edges and corners', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(closestPointOnTriangle(out, [0.5, 0.5, 3], a, b, c)).toEqual([0.5, 0.5, 0]);
    expect(closestPointOnTriangle(out, [1, -1, 0], a, b, c)).toEqual([1, 0, 0]);
    expect(closestPointOnTriangle(out, [-1, -1, 5], a, b, c)).toEqual([0, 0, 0]);
    expect(closestPointOnTriangle(out, [5, -1, 0], a, b, c)).toEqual([2, 0, 0]);
    expect(closestPointOnTriangle(out, [-1, 5, 0], a, b, c)).toEqual([0, 2, 0]);
    expect(closestPointOnTriangle(out, [2, 2, 0], a, b, c)).toEqual([1, 1, 0]);
  });

  it('vertical segment to triangle: crossing, above, beside', () => {
    const out = closest();
    expect(closestVerticalSegmentTriangle(out, 0.5, 0.5, -1, 1, a, b, c).distance).toBe(0);
    expect(closestVerticalSegmentTriangle(out, 0.5, 0.5, 1, 2, a, b, c)).toMatchObject({ distance: 1, z: 1, point: [0.5, 0.5, 0] });
    expect(closestVerticalSegmentTriangle(out, -1, 1, -3, 3, a, b, c)).toMatchObject({ distance: 1, z: 0, point: [0, 1, 0] });
    // A wall: the nearest point of the segment is anywhere along it; the distance is the horizontal gap.
    const [t1] = wallX();
    expect(closestVerticalSegmentTriangle(out, 0.25, 0, 0.5, 1.5, ...t1!).distance).toBeCloseTo(0.75, 12);
  });

  it('agrees with a brute-force search on random segments and triangles', () => {
    let seed = 12345;
    const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 4 - 2;
    const out = closest();
    for (let n = 0; n < 60; n++) {
      const p: Vec3 = [random(), random(), random()], q: Vec3 = [random(), random(), random()], r: Vec3 = [random(), random(), random()];
      const x = random(), y = random(), z0 = random(), z1 = z0 + Math.abs(random());
      const exact = closestVerticalSegmentTriangle(out, x, y, z0, z1, p, q, r).distance;
      let brute = Infinity;
      const N = 40;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
        const u = i / N, v = j / N, w = 1 - u - v;
        const tx = p[0] * u + q[0] * v + r[0] * w, ty = p[1] * u + q[1] * v + r[1] * w, tz = p[2] * u + q[2] * v + r[2] * w;
        const z = Math.max(z0, Math.min(z1, tz));
        brute = Math.min(brute, Math.hypot(tx - x, ty - y, tz - z));
      }
      expect(exact).toBeLessThanOrEqual(brute + 1e-9); // never farther than any sampled pair
      expect(exact).toBeGreaterThan(brute - 0.15); // and the samples (a grid of 1/40) come close to it
    }
  });
});

describe('resolveCapsule', () => {
  it('is pushed out of a wall to radius + skin, and left alone farther away', () => {
    const pushed = resolveCapsule([0.9, 0, 0], SHAPE, query(wallX()), { horizontalOnly: true });
    expect(pushed.touched).toBe(true);
    expect(pushed.position[0]).toBeCloseTo(1 - REACH, 9);
    expect(pushed.position[1]).toBeCloseTo(0, 12);
    expect(pushed.position[2]).toBe(0);
    expect(pushed.normals[0]![0]).toBeCloseTo(-1, 9);
    const free = resolveCapsule([1 - REACH - 0.01, 0, 0], SHAPE, query(wallX()), { horizontalOnly: true });
    expect(free.touched).toBe(false);
    expect(free.position).toEqual([1 - REACH - 0.01, 0, 0]);
  });

  it('a corner: out of both walls', () => {
    const r = resolveCapsule([0.9, 0.95, 0], SHAPE, query([...wallX(), ...wallY()]), { horizontalOnly: true });
    expect(r.position[0]).toBeCloseTo(1 - REACH, 6);
    expect(r.position[1]).toBeCloseTo(1 - REACH, 6);
  });

  it('the ground and walkable slopes under the capsule are not obstacles', () => {
    const floor = quad([-5, -5, 0], [5, -5, 0], [5, 5, 0], [-5, 5, 0]);
    const slope = quad([0, -5, -0.2], [5, -5, 4.8], [5, 5, 4.8], [0, 5, -0.2]); // 45°, passing 0.2 under the feet
    for (const triangles of [floor, slope]) expect(resolveCapsule([0.2, 0, 0], SHAPE, query(triangles), { horizontalOnly: true }).touched).toBe(false);
  });

  it('what is lower than the ground snap (0.2) is left to the ground probe', () => {
    expect(resolveCapsule([1, 0, 0], SHAPE, query(wallX(0.15)), { horizontalOnly: true }).touched).toBe(false);
    expect(resolveCapsule([0.9, 0, 0], SHAPE, query(wallX(0.6)), { horizontalOnly: true }).touched).toBe(true);
  });

  it('a ceiling: nothing sideways on the ground; pushed down in the air', () => {
    const ceiling = quad([-5, -5, 1.9], [-5, 5, 1.9], [5, 5, 1.9], [5, -5, 1.9]);
    expect(resolveCapsule([0, 0, 0], SHAPE, query(ceiling), { horizontalOnly: true }).touched).toBe(false);
    const air = resolveCapsule([0, 0, 0], SHAPE, query(ceiling), { horizontalOnly: false });
    expect(air.touched).toBe(true);
    expect(air.position[2]).toBeCloseTo(1.9 - REACH - (SHAPE.height - SHAPE.radius), 9);
    expect(air.normals[0]![2]).toBeCloseTo(-1, 9);
  });

  it('a capsule whose axis crosses a wall is pushed out on the side its middle is', () => {
    const r = resolveCapsule([1.0001, 0, 0], SHAPE, query(wallX()), { horizontalOnly: true });
    expect(r.position[0]).toBeGreaterThanOrEqual(1 + REACH - 1e-6);
  });
});

describe('PlayerMovement with a collider (spec §207: the slide)', () => {
  const collider = (triangles: readonly Triangle[]): MovementCollider => (feet, horizontalOnly, lift) => resolveCapsule(feet, lift === undefined ? SHAPE : { ...SHAPE, lift }, query(triangles), { horizontalOnly });

  it('walking straight into a wall: stops radius + skin from it', () => {
    const m = new PlayerMovement([0, 0, 0], 90, 1, undefined, collider(wallX()));
    for (let k = 0; k < 60; k++) m.step(STEP, intent({ forward: 1 }));
    expect(m.state.position[0]).toBeCloseTo(1 - REACH, 6);
    expect(m.state.position[1]).toBeCloseTo(0, 9);
    expect(m.state.touching).toBe(true);
    expect(m.speed).toBe(0);
    expect(m.moving).toBe(false);
  });

  it('walking into a wall at 45°: slides along it at 7 × cos 45°', () => {
    const m = new PlayerMovement([0, 0, 0], 45, 1, undefined, collider(wallX()));
    for (let k = 0; k < 30; k++) m.step(STEP, intent({ forward: 1 }));
    const y0 = m.state.position[1];
    for (let k = 0; k < 30; k++) m.step(STEP, intent({ forward: 1 }));
    expect(m.state.position[0]).toBeCloseTo(1 - REACH, 6);
    expect((m.state.position[1] - y0) / 0.5).toBeCloseTo(7 * Math.SQRT1_2, 6);
    expect(m.speed).toBeCloseTo(7 * Math.SQRT1_2, 6);
    expect(m.state.touching).toBe(true);
  });

  it('never ends inside the wall, whatever the angle', () => {
    for (let heading = 10; heading <= 170; heading += 10) {
      const m = new PlayerMovement([0, 0, 0], heading, 1, undefined, collider(wallX()));
      for (let k = 0; k < 40; k++) {
        m.step(STEP, intent({ forward: 1 }));
        expect(m.state.position[0]).toBeLessThanOrEqual(1 - REACH + 1e-6);
      }
    }
  });

  it('a running jump into a wall: stopped in the air, and the speed into the wall is gone', () => {
    const m = new PlayerMovement([0, 0, 0], 90, 1, undefined, collider(wallX()));
    m.step(STEP, intent({ forward: 1, jump: true }));
    while (!m.grounded) {
      m.step(STEP, NO_INTENT);
      expect(m.state.position[0]).toBeLessThanOrEqual(1 - REACH + 1e-6);
    }
    expect(m.state.position[0]).toBeCloseTo(1 - REACH, 6);
    expect(m.state.velocity[0]).toBeCloseTo(0, 9);
    expect(m.state.apexHeight).toBeGreaterThan(1.63); // the wall did not shorten the jump
  });

  it('jumping under a low ceiling: the head stops, the fall starts', () => {
    const ceiling = quad([-5, -5, 2.6], [-5, 5, 2.6], [5, 5, 2.6], [5, -5, 2.6]);
    const m = new PlayerMovement([0, 0, 0], 0, 1, undefined, collider(ceiling));
    m.step(STEP, intent({ jump: true }));
    while (!m.grounded) m.step(STEP, NO_INTENT);
    // The top of the capsule stays a skin under the ceiling.
    expect(m.state.apexHeight).toBeLessThanOrEqual(2.6 - MOVEMENT.collisionSkin - MOVEMENT.collisionHeight + 1e-6);
    expect(m.state.apexHeight).toBeGreaterThan(0.4);
    expect(m.state.airSeconds).toBeLessThan(0.75); // shorter than a free jump (0.83)
  });
});

describe('camera scene: the buildings stop the character', () => {
  const R = CAMERA_SCENE_RAMPS, FRONT = -COTTAGE.halfY;
  const facing = (scene: CameraScene, degrees: number): void => {
    scene.pointer(2, 0, 0);
    scene.pointer(2, (degrees * 800) / 180, 0);
    scene.releasePointer();
  };
  const walk = (scene: CameraScene, steps: number, keys = ['KeyW']): void => {
    for (let k = 0; k < steps; k++) scene.fixedStep(STEP, new Set(keys));
  };

  it('the front wall of the cottage stops it, radius + skin outside', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([-2.5, -8, 0]);
    walk(scene, 120);
    const c = scene.cameraStats;
    expect(c.position[1]).toBeCloseTo(FRONT - REACH, 4);
    expect(c.position[0]).toBeCloseTo(-2.5, 6);
    expect(c).toMatchObject({ touching: true, speed: 0, mode: 'grounded' });
    expect(c.capsuleRadius).toBeCloseTo(1 / 3, 12);
    scene.dispose();
  });

  it('walking into that wall at an angle slides along it', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([-3.5, -5, 0]);
    facing(scene, 45);
    walk(scene, 24); // reaches the wall after 20 steps, well west of the door
    const a = scene.cameraStats.position;
    expect(a[1]).toBeCloseTo(FRONT - REACH, 4);
    walk(scene, 6);
    const b = scene.cameraStats;
    expect(b.position[1]).toBeCloseTo(FRONT - REACH, 4);
    expect((b.position[0] - a[0]) / 0.1).toBeCloseTo(7 * Math.SQRT1_2, 3);
    expect(b.speed).toBeCloseTo(7 * Math.SQRT1_2, 3);
    scene.dispose();
  });

  it('goes through the door (1.2 wide) and is then stopped by the back wall, inside', () => {
    const scene = createCameraScene(new NullBackend());
    walk(scene, 200);
    const c = scene.cameraStats;
    expect(c.position[0]).toBeCloseTo(0, 6);
    expect(c.position[1]).toBeCloseTo(COTTAGE.halfY - COTTAGE.wall - REACH, 3);
    expect(c.position[2]).toBeCloseTo(0.02, 6);
    scene.dispose();
  });

  it('three times as large, it no longer fits through the door', () => {
    const scene = createCameraScene(new NullBackend(), { characterScale: 3 });
    walk(scene, 200);
    const c = scene.cameraStats;
    expect(c.capsuleRadius).toBeCloseTo(1, 12);
    expect(c.position[1]).toBeLessThan(FRONT - 0.9);
    scene.dispose();
  });

  it('nobody walks under the ramps any more: from behind, and from the side', () => {
    const behind = createCameraScene(new NullBackend());
    behind.placeCharacter([R.endX + 2, -20.5, 0]);
    facing(behind, 270);
    walk(behind, 120);
    expect(behind.cameraStats.position[0]).toBeCloseTo(R.endX + REACH, 4);
    behind.dispose();
    const side = createCameraScene(new NullBackend());
    side.placeCharacter([18, -17, 0]);
    facing(side, 180);
    walk(side, 120);
    expect(side.cameraStats.position[1]).toBeCloseTo(-19 + REACH, 4);
    side.dispose();
  });

  it('the walkable lanes are still climbed in their middle AND along their edges', () => {
    for (const y of [-20.5, -19.05, -21.95]) {
      const scene = createCameraScene(new NullBackend());
      scene.placeCharacter([R.startX - 0.5, y, 0]);
      facing(scene, 90);
      walk(scene, 72);
      expect(scene.cameraStats.position[2]).toBeCloseTo(R.height, 5);
      expect(scene.cameraStats.position[1]).toBeCloseTo(y, 6); // not pushed sideways by the lane's own side wall
      expect(scene.cameraStats.touching).toBe(false);
      scene.dispose();
    }
  });
});

describe('regressions found by the browser test', () => {
  it('the diagonal between the two triangles of a flat wall is not a bump: the slide keeps a constant speed', () => {
    const scene = createCameraScene(new NullBackend());
    scene.placeCharacter([-0.9, -4, 0]);
    const keys = new Set(['KeyW', 'KeyQ']); // north-west, into the front wall, then west along it
    let onWall = 0;
    for (let k = 0; k < 90; k++) {
      scene.fixedStep(STEP, keys);
      const c = scene.cameraStats;
      expect(c.speed).toBeLessThanOrEqual(7 + 1e-9); // never faster than the input, even round the corner
      if (c.touching && c.position[0] > -3.9) {
        onWall++;
        if (onWall > 1) expect(c.speed).toBeCloseTo(7 * Math.SQRT1_2, 6);
      }
    }
    expect(onWall).toBeGreaterThan(20);
    scene.dispose();
  });
});
