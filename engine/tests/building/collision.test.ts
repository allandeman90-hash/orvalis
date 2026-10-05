import { describe, expect, it } from 'vitest';
import {
  BUILDING_TRIANGLE_FLAG, buildCottage, BuildingCollision, BuildingGroupBuilder, COTTAGE, COTTAGE_GROUP, COTTAGE_MATERIAL, collisionIndices, collisionTriangles, rayTriangle, triangleCollides, validateBuilding,
} from '../../src/building';
import { BuildingRenderer, GROUP_DEBUG_COLOURS } from '../../src/buildingRender';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { NullBackend } from '../../src/renderer';
import { createBuildingScene } from '../../src/scenes/buildingScene';
import { parseSceneRequest } from '../../src/scenes/select';

const cottage = buildCottage('solid');
const G = COTTAGE_GROUP, F = BUILDING_TRIANGLE_FLAG;
const collision = new BuildingCollision(cottage);
const trianglesOf = (group: number, material: number): number[] => {
  const out: number[] = [];
  for (const batch of cottage.groups[group]!.batches) if (batch.material === material) for (let i = batch.firstIndex; i < batch.firstIndex + batch.indexCount; i += 3) out.push(i / 3);
  return out;
};

describe('triangle flags (spec §122–§123)', () => {
  it('the flag values are the document’s', () => {
    expect(F).toEqual({ noCamCollide: 0x02, detail: 0x04, collision: 0x08 });
  });
  it('the player keeps the non-DETAIL faces; the camera keeps DETAIL but drops NOCAMCOLLIDE', () => {
    const sets = (flags: number) => [triangleCollides(flags, 'player'), triangleCollides(flags, 'camera')];
    expect(sets(0)).toEqual([true, true]);
    expect(sets(F.detail)).toEqual([false, true]); // a camera-only face
    expect(sets(F.noCamCollide)).toEqual([true, false]);
    expect(sets(F.detail | F.noCamCollide)).toEqual([false, false]);
    expect(sets(F.collision)).toEqual([true, true]); // OUR CHOICE: 0x08 is stored, not consulted
  });
  it('the cottage: the lattice is DETAIL, the glass screen NOCAMCOLLIDE, the glow panel both, everything else 0', () => {
    const lattice = trianglesOf(G.shell, COTTAGE_MATERIAL.lattice), glass = trianglesOf(G.room, COTTAGE_MATERIAL.glass);
    expect([lattice.length, glass.length]).toEqual([2, 2]);
    cottage.groups.forEach((group, g) => {
      group.triangleFlags!.forEach((flags, t) => {
        // The glow panel: the two triangles after the back wall's (the plaster batch starts with the front wall's 6 pieces).
        const glow = g === G.room && group.positions[group.indices[t * 3]! * 3 + 1] === Math.fround(COTTAGE.halfY - COTTAGE.wall - 0.01);
        expect(flags).toBe(g === G.shell && lattice.includes(t) ? F.detail : g === G.room && glass.includes(t) ? F.noCamCollide : glow ? F.detail | F.noCamCollide : 0);
      });
    });
  });
  it('a group needs one flag byte per triangle', () => {
    const broken = { ...cottage, groups: cottage.groups.map((group, g) => (g === 0 ? { ...group, triangleFlags: new Uint8Array(3) } : group)) };
    expect(() => validateBuilding(broken)).toThrow(/triangleFlags must hold one byte per triangle/);
  });
  it('the builder stamps the current flags on each triangle; a group without flags has them all at 0', () => {
    const b = new BuildingGroupBuilder('g', 0);
    b.batch(0, 'exterior');
    b.quad([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
    b.faceFlags(F.detail);
    b.quad([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]);
    const group = b.build();
    expect(Array.from(group.triangleFlags!)).toEqual([0, 0, 4, 4]);
    expect(collisionTriangles({ ...group, triangleFlags: undefined }, 'player')).toEqual([0, 1, 2, 3]);
    expect(() => b.faceFlags(256)).toThrow(/one byte/);
  });
});

describe('separate index arrays over the same vertices (spec §124)', () => {
  it('each set is the render triangles minus the excluded ones, in order', () => {
    const shell = cottage.groups[G.shell]!, room = cottage.groups[G.room]!;
    expect(collisionIndices(shell, 'camera')).toEqual(shell.indices);
    expect(collisionIndices(shell, 'player').length).toBe(shell.indices.length - 6);
    expect(collisionIndices(room, 'player').length).toBe(room.indices.length - 6); // without the glow panel
    expect(collisionIndices(room, 'camera').length).toBe(room.indices.length - 12); // without the glass and the glow panel
    // The glass is the room's first batch: the camera set starts right after it.
    expect(Array.from(collisionIndices(room, 'camera').subarray(0, 3))).toEqual(Array.from(room.indices.subarray(6, 9)));
  });
  it('the indices refer to the group’s own vertices: nothing is copied', () => {
    for (const group of cottage.groups) for (const kind of ['player', 'camera'] as const) for (const index of collisionIndices(group, kind)) expect(index).toBeLessThan(group.vertexCount);
  });
  it('counts the triangles of each set over the building', () => {
    const total = cottage.groups.reduce((sum, group) => sum + group.indices.length / 3, 0);
    expect([collision.triangleCount('player'), collision.triangleCount('camera')]).toEqual([total - 4, total - 4]);
  });
});

describe('rayTriangle', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  it('gives the distance to the triangle, from either side', () => {
    expect(rayTriangle([0.25, 0.25, 2], [0, 0, -1], positions, 0, 1, 2)).toBeCloseTo(2, 6);
    expect(rayTriangle([0.25, 0.25, -3], [0, 0, 1], positions, 0, 1, 2)).toBeCloseTo(3, 6);
  });
  it('misses outside the triangle, behind the origin and when parallel', () => {
    expect(rayTriangle([0.8, 0.8, 2], [0, 0, -1], positions, 0, 1, 2)).toBe(Infinity);
    expect(rayTriangle([0.25, 0.25, 2], [0, 0, 1], positions, 0, 1, 2)).toBe(Infinity);
    expect(rayTriangle([0.25, 0.25, 2], [1, 0, 0], positions, 0, 1, 2)).toBe(Infinity);
  });
});

describe('raycast in the cottage', () => {
  const { halfX: X, halfY: Y, wall: T, screen } = COTTAGE;
  const eye = [0, 0, 1.6] as const;
  it('down from the middle of the room: the floor, 1.58 below, normal up', () => {
    const hit = collision.raycast(eye, [0, 0, -1], 100, 'player')!;
    expect(hit.group).toBe(G.room);
    expect(hit.distance).toBeCloseTo(1.58, 5);
    expect(hit.point[2]).toBeCloseTo(0.02, 5);
    expect(hit.normal.map((v) => Math.round(v))).toEqual([0, 0, 1]);
  });
  it('north: the room’s back wall at its inner face', () => {
    const hit = collision.raycast(eye, [0, 5, 0], 100, 'player')!; // the direction need not be unit length
    expect([hit.group, hit.distance]).toEqual([G.room, expect.closeTo(Y - T, 5)]);
  });
  it('east: the glass screen stops the player, not the camera (NOCAMCOLLIDE)', () => {
    const player = collision.raycast(eye, [1, 0, 0], 100, 'player')!, camera = collision.raycast(eye, [1, 0, 0], 100, 'camera')!;
    expect([player.group, player.flags, player.distance]).toEqual([G.room, F.noCamCollide, expect.closeTo(screen.x, 5)]);
    expect([camera.group, camera.flags, camera.distance]).toEqual([G.room, 0, expect.closeTo(X - T, 5)]);
  });
  it('through the window from outside: the lattice stops the camera, not the player (DETAIL)', () => {
    const from = [2.4, -6, 1.5] as const;
    const camera = collision.raycast(from, [0, 1, 0], 100, 'camera')!, player = collision.raycast(from, [0, 1, 0], 100, 'player')!;
    expect([camera.group, camera.flags, camera.point[1]]).toEqual([G.shell, F.detail, expect.closeTo(COTTAGE.window.y, 5)]);
    expect([player.group, player.point[1]]).toEqual([G.room, expect.closeTo(Y - T, 5)]); // on to the room's back wall
  });
  it('a wall is hit from behind too: from inside the shell’s outer face is beyond the room’s inner face', () => {
    const hit = collision.raycast(eye, [-1, 0, 0], 100, 'player', { groups: new Set([G.shell]) })!;
    expect([hit.group, hit.distance]).toEqual([G.shell, expect.closeTo(X, 5)]);
    expect(hit.normal.map((v) => Math.round(v))).toEqual([-1, 0, 0]); // the geometric normal, facing outside
  });
  it('respects the maximum distance and the group filter', () => {
    expect(collision.raycast(eye, [0, 0, -1], 1.5, 'player')).toBeNull();
    expect(collision.raycast(eye, [0, 0, -1], 1.58001, 'player')).not.toBeNull();
    expect(collision.raycast(eye, [0, 0, -1], 100, 'player', { groups: new Set([G.shed]) })).toBeNull();
  });
  it('misses the building altogether without testing a triangle', () => {
    expect(collision.raycast([50, 50, 50], [0, 0, 1], 1000, 'player')).toBeNull();
    expect(collision.lastTested).toBe(0);
    expect(collision.raycast([0, -20, 30], [1, 0, 0], 1000, 'camera')).toBeNull();
    expect(collision.lastTested).toBe(0);
  });
  it('rejects a zero direction, a non-finite origin and a negative distance', () => {
    expect(() => collision.raycast(eye, [0, 0, 0], 1, 'player')).toThrow(/direction/);
    expect(() => collision.raycast([NaN, 0, 0], [1, 0, 0], 1, 'player')).toThrow(/origin/);
    expect(() => collision.raycast(eye, [1, 0, 0], -1, 'player')).toThrow(/maximum distance/);
    expect(() => new BuildingCollision(cottage, 0)).toThrow(/cell size/);
  });
});

describe('broad phase (spec §125)', () => {
  // A deterministic stream of rays: origins around and inside the building, directions all over the sphere.
  let seed = 12345;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const rays = Array.from({ length: 4000 }, () => {
    const origin: [number, number, number] = [random() * 20 - 9, random() * 16 - 8, random() * 9 - 2];
    const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return { origin, direction: [r * Math.cos(a), r * Math.sin(a), z] as [number, number, number], max: random() < 0.2 ? random() * 6 : 100 };
  });
  it.each([0.5, 2, 50])('the grid (cells of %s) gives exactly the brute-force answer for 4000 rays, both sets', (cellSize) => {
    const grid = new BuildingCollision(cottage, cellSize);
    let hits = 0;
    for (const kind of ['player', 'camera'] as const) for (const ray of rays) {
      const fast = grid.raycast(ray.origin, ray.direction, ray.max, kind), slow = grid.raycastBruteForce(ray.origin, ray.direction, ray.max, kind);
      if (slow === null) {
        expect(fast).toBeNull();
        continue;
      }
      hits++;
      expect(fast).not.toBeNull();
      expect(fast!.distance).toBe(slow.distance);
    }
    expect(hits).toBeGreaterThan(1000);
  });
  it('tests far fewer triangles than the whole set', () => {
    const grid = new BuildingCollision(cottage, 2), all = grid.triangleCount('player');
    let tested = 0;
    for (const ray of rays) {
      grid.raycast(ray.origin, ray.direction, ray.max, 'player');
      tested += grid.lastTested;
    }
    expect(tested / rays.length).toBeLessThan(all / 4);
  });
  it('a group whose box the ray misses costs nothing', () => {
    // Straight down through the shed only: the shell and the room are not touched.
    collision.raycast([5.5, 0, 10], [0, 0, -1], 100, 'player');
    const shedOnly = collision.lastTested;
    expect(shedOnly).toBeGreaterThan(0);
    expect(shedOnly).toBeLessThanOrEqual(cottage.groups[G.shed]!.indices.length / 3);
  });
});

describe('collision view', () => {
  const identity = mat4.identity(mat4.create());
  function drawSet(kind: 'player' | 'camera', visible?: number[]) {
    const backend = new NullBackend(), renderer = new BuildingRenderer(backend), id = renderer.addBuilding(cottage);
    const seen: Array<{ vertexBuffer: number; indexBuffer: number; indexCount: number; cullMode: string; colour: number[] }> = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array;
      seen.push({ vertexBuffer: call.vertexBuffer, indexBuffer: call.indexBuffer as number, indexCount: call.indexCount ?? 0, cullMode: backend.pipelineState(call.pipeline)!.cullMode, colour: Array.from(u.subarray(60, 63)) });
      return original(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ building: id, matrix: identity, ...(visible ? { visibleGroups: new Set(visible) } : {}) }], { debugMode: 'lit', collision: kind });
    const normal = renderer.draw(identity, [{ building: id, matrix: identity }], { debugMode: 'lit' });
    backend.endFrame();
    renderer.dispose();
    return { seen: seen.slice(0, result.draws), all: seen, result, normal };
  }
  it('draws ONE call per group with the set’s own index buffer over the group’s vertex buffer, two-sided, one colour per group', () => {
    const { seen, all, result } = drawSet('player');
    expect(result).toEqual({ groups: 3, draws: 3, triangles: collision.triangleCount('player') });
    expect(seen.map((s) => s.indexCount)).toEqual(cottage.groups.map((group) => collisionIndices(group, 'player').length));
    expect(seen.map((s) => s.cullMode)).toEqual(['none', 'none', 'none']);
    expect(seen.map((s) => s.colour)).toEqual(GROUP_DEBUG_COLOURS.slice(0, 3).map((c) => [...c]));
    // Same vertex buffers as the render batches, other index buffers.
    const render = all.slice(3);
    expect(new Set(seen.map((s) => s.vertexBuffer))).toEqual(new Set(render.map((s) => s.vertexBuffer)));
    for (const s of seen) expect(render.map((r) => r.indexBuffer)).not.toContain(s.indexBuffer);
  });
  it('the two sets differ where the flags say: the shell loses its lattice for the player, the room its glass for the camera', () => {
    const player = drawSet('player').seen.map((s) => s.indexCount), camera = drawSet('camera').seen.map((s) => s.indexCount);
    expect(camera[0]! - player[0]!).toBe(6);
    expect(player[1]! - camera[1]!).toBe(6);
    expect(player[2]).toBe(camera[2]);
  });
  it('still draws only the visible groups', () => {
    expect(drawSet('camera', [2]).result.draws).toBe(1);
  });
  it('scene: &collision= and key C show a set; the overlay tells what is ahead in each set', () => {
    expect(parseSceneRequest('?scene=building&collision=camera')).toMatchObject({ collisionView: 'camera' });
    expect(parseSceneRequest('?scene=building&collision=x')).toMatchObject({ collisionView: 'off' });
    const backend = new NullBackend(), scene = createBuildingScene(backend, { view: 'inside', headingDegrees: 90 });
    expect(scene.render(16 / 9).drawCalls).toBe(9 + 3);
    // Looking east from the middle of the room: the glass for the player, the wall behind it for the camera.
    expect(scene.building.aim.player).toMatchObject({ group: G.room, flags: F.noCamCollide });
    expect(scene.building.aim.player!.distance).toBeCloseTo(COTTAGE.screen.x, 5);
    expect(scene.building.aim.camera!.distance).toBeCloseTo(COTTAGE.halfX - COTTAGE.wall, 5);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 12, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    const total = collision.triangleCount('player');
    expect(formatOverlay({ ...base, building: scene.building }).join('\n')).toContain(`Collision: view off (C) · ${total} player / ${total} camera triangles · ahead: player group 1 at 1.00, camera group 1 at 3.70`);
    expect(scene.cycleCollisionView()).toBe('player');
    expect(scene.render(16 / 9).drawCalls).toBe(3); // one per group; the props are not drawn
    expect(scene.building).toMatchObject({ collisionView: 'player', doodadsDrawn: 0, batchesDrawn: 3, triangles: total });
    expect([scene.cycleCollisionView(), scene.cycleCollisionView()]).toEqual(['camera', 'off']);
    expect(scene.raycast([0, 0, 1.6], [0, 0, -1], 10, 'player')).toMatchObject({ group: G.room });
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
  it('with nothing ahead the overlay says so', () => {
    const scene = createBuildingScene(new NullBackend(), {});
    scene.render(16 / 9);
    expect(scene.raycast([0, 0, 20], [0, 0, 1], 100, 'camera')).toBeNull();
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 12, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, building: { ...scene.building, aim: { player: null, camera: null } } }).join('\n')).toContain('ahead: player nothing, camera nothing');
    scene.dispose();
  });
});

describe('trianglesInBox (P8.4: what a volume has to be tested against)', () => {
  const cottage = buildCottage('solid'), collision = new BuildingCollision(cottage);
  /** The triangles of the set whose own box overlaps the query box, by testing every one. */
  const bruteForce = (min: readonly number[], max: readonly number[], kind: 'player' | 'camera'): Set<string> => {
    const found = new Set<string>();
    cottage.groups.forEach((group, g) => {
      for (const t of collisionTriangles(group, kind)) {
        let overlaps = true;
        for (let k = 0; k < 3; k++) {
          const values = [0, 1, 2].map((corner) => group.positions[group.indices[t * 3 + corner]! * 3 + k]!);
          if (Math.min(...values) > max[k]! || Math.max(...values) < min[k]!) overlaps = false;
        }
        if (overlaps) found.add(`${g}:${group.indices[t * 3]},${group.indices[t * 3 + 1]},${group.indices[t * 3 + 2]}`);
      }
    });
    return found;
  };
  const query = (min: readonly [number, number, number], max: readonly [number, number, number], kind: 'player' | 'camera'): string[] => {
    const seen: string[] = [];
    collision.trianglesInBox(min, max, kind, (positions, a, b, c) => seen.push(`${cottage.groups.findIndex((group) => group.positions === positions)}:${a},${b},${c}`));
    return seen;
  };

  it('returns every triangle that overlaps the box, each one once', () => {
    const boxes: Array<[[number, number, number], [number, number, number]]> = [
      [[-0.4, -3.4, 0.2], [0.4, -2.6, 2.1]], [[-4.5, -3.5, 0], [-3.5, -2.5, 2]], [[-10, -10, -1], [10, 10, 6]], [[0.6, -1.5, 0], [1.4, 1.5, 2]], [[2, -3.2, 0.9], [2.8, -2.6, 2.1]],
    ];
    for (const kind of ['player', 'camera'] as const) for (const [min, max] of boxes) {
      const seen = query(min, max, kind);
      expect(new Set(seen).size).toBe(seen.length); // no triangle twice
      for (const key of bruteForce(min, max, kind)) expect(seen).toContain(key); // none missed
    }
  });

  it('returns nothing away from the building', () => {
    expect(query([50, 50, 0], [51, 51, 2], 'player')).toEqual([]);
  });

  it('the whole building: exactly the set', () => {
    for (const kind of ['player', 'camera'] as const) expect(query([-100, -100, -100], [100, 100, 100], kind).length).toBe(collision.triangleCount(kind));
  });
});
