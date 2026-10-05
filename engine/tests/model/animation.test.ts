import { describe, expect, it } from 'vitest';
import {
  bonePivotPosition, type BoneTracks, computeBoneMatrices, findKeys, rotationPose, sampleBonePose, samplePoses, sampleQuatTrack, sampleVec3Track, type Track,
  TREE_POSES, TREE_SKELETON, TREE_SWAY_TIMES, treeSwayTracks, validateBoneTracks, validateTrack,
} from '../../src/model';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 6): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const vec3Track = (times: number[], values: number[], interpolation: Track['interpolation'] = 'linear'): Track => ({ interpolation, timestamps: Uint32Array.from(times), values: Float32Array.from(values) });
const turn = (axis: readonly [number, number, number], degrees: number): number[] => [...rotationPose(axis, degrees).rotation];
const quatTrack = (times: number[], keys: number[][], interpolation: Track['interpolation'] = 'linear'): Track => ({ interpolation, timestamps: Uint32Array.from(times), values: Float32Array.from(keys.flat()) });
/** The rotation angle of a unit quaternion, in degrees. */
const angleOf = (q: ArrayLike<number>): number => (2 * Math.atan2(Math.hypot(q[0]!, q[1]!, q[2]!), q[3]!) * 180) / Math.PI;

describe('findKeys: binary search of the surrounding keys (spec §65)', () => {
  const times = [100, 200, 400, 1000];

  it('finds the two keys around a time and the fraction between them', () => {
    expect(findKeys(times, 150)).toEqual({ k0: 0, k1: 1, t: 0.5 });
    expect(findKeys(times, 250)).toEqual({ k0: 1, k1: 2, t: 0.25 });
    expect(findKeys(times, 850)).toEqual({ k0: 2, k1: 3, t: 0.75 });
  });

  it('a time exactly on a key starts the span at that key with fraction 0', () => {
    expect(findKeys(times, 100)).toEqual({ k0: 0, k1: 1, t: 0 });
    expect(findKeys(times, 200)).toEqual({ k0: 1, k1: 2, t: 0 });
    expect(findKeys(times, 400)).toEqual({ k0: 2, k1: 3, t: 0 });
  });

  it('clamps before the first key and from the last key on', () => {
    expect(findKeys(times, 0)).toEqual({ k0: 0, k1: 0, t: 0 });
    expect(findKeys(times, 99.9)).toEqual({ k0: 0, k1: 0, t: 0 });
    expect(findKeys(times, 1000)).toEqual({ k0: 3, k1: 3, t: 0 });
    expect(findKeys(times, 1e9)).toEqual({ k0: 3, k1: 3, t: 0 });
  });

  it('handles a single key', () => {
    for (const time of [0, 5, 10]) expect(findKeys([5], time)).toEqual({ k0: 0, k1: 0, t: 0 });
  });

  it('agrees with a linear scan for every time, on tracks of 1 to 40 keys', () => {
    let seed = 12345;
    const random = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let keys = 1; keys <= 40; keys++) {
      const stamps: number[] = [];
      let at = Math.floor(random() * 5);
      for (let k = 0; k < keys; k++) stamps.push((at += 1 + Math.floor(random() * 50)));
      for (let time = stamps[0]! - 2; time <= stamps[keys - 1]! + 2; time += 0.5) {
        let last = -1;
        for (let k = 0; k < keys; k++) if (stamps[k]! <= time) last = k;
        const expected = last < 0 ? { k0: 0, k1: 0, t: 0 } : last === keys - 1 ? { k0: last, k1: last, t: 0 } : { k0: last, k1: last + 1, t: (time - stamps[last]!) / (stamps[last + 1]! - stamps[last]!) };
        expect(findKeys(stamps, time)).toEqual(expected);
      }
    }
  });

  it('reads a logarithmic number of timestamps, not all of them', () => {
    const keys = 4096, stamps = Uint32Array.from({ length: keys }, (_, k) => k * 10);
    let reads = 0;
    const counted = new Proxy(stamps, {
      get(target, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads++;
        return Reflect.get(target, property) as unknown;
      },
    });
    for (const time of [0, 5, 20475, 40949, 40950, 99999]) {
      reads = 0;
      findKeys(counted, time);
      expect(reads).toBeLessThanOrEqual(13 + 2); // ⌈log2(4096)⌉ + 1 probes, + 2 to compute the fraction
    }
  });

  it('fills and returns the object it is given (no allocation needed per sample)', () => {
    const out = { k0: 9, k1: 9, t: 9 };
    expect(findKeys(times, 300, out)).toBe(out);
    expect(out).toEqual({ k0: 1, k1: 2, t: 0.5 });
  });

  it('rejects an empty track and a non-finite time', () => {
    expect(() => findKeys([], 0)).toThrow(/empty/);
    expect(() => findKeys(times, NaN)).toThrow(/finite/);
  });
});

describe('vector tracks: translation and scale are interpolated linearly (spec §38)', () => {
  const track = vec3Track([0, 100, 300], [0, 0, 0, 10, -20, 4, 10, 0, 8]);

  it('gives the key values on the keys', () => {
    close(sampleVec3Track(track, 0, [9, 9, 9]), [0, 0, 0]);
    close(sampleVec3Track(track, 100, [9, 9, 9]), [10, -20, 4]);
    close(sampleVec3Track(track, 300, [9, 9, 9]), [10, 0, 8]);
  });

  it('interpolates each component between two keys', () => {
    close(sampleVec3Track(track, 25, [0, 0, 0]), [2.5, -5, 1]);
    close(sampleVec3Track(track, 250, [0, 0, 0]), [10, -5, 7]);
  });

  it('holds the end values outside the track', () => {
    const late = vec3Track([50, 60], [1, 2, 3, 4, 5, 6]);
    close(sampleVec3Track(late, 0, [0, 0, 0]), [1, 2, 3]);
    close(sampleVec3Track(late, 1000, [0, 0, 0]), [4, 5, 6]);
  });

  it("'step' holds the earlier key until the next one", () => {
    const step = vec3Track([0, 100], [1, 1, 1, 2, 2, 2], 'step');
    close(sampleVec3Track(step, 99, [0, 0, 0]), [1, 1, 1]);
    close(sampleVec3Track(step, 100, [0, 0, 0]), [2, 2, 2]);
  });
});

describe('rotation tracks: quaternion interpolation (spec §38)', () => {
  const Z: readonly [number, number, number] = [0, 0, 1];

  it('gives the key rotations on the keys', () => {
    const track = quatTrack([0, 100], [turn(Z, 0), turn(Z, 90)]);
    close(sampleQuatTrack(track, 0, [0, 0, 0, 0]), turn(Z, 0));
    close(sampleQuatTrack(track, 100, [0, 0, 0, 0]), turn(Z, 90));
  });

  it('turns at a constant rate between two keys (slerp, not a plain lerp)', () => {
    const track = quatTrack([0, 100], [turn(Z, 0), turn(Z, 120)]);
    // A plain normalised lerp would give 23.4° at one quarter; slerp gives exactly 30°.
    close(sampleQuatTrack(track, 25, [0, 0, 0, 0]), turn(Z, 30));
    close(sampleQuatTrack(track, 50, [0, 0, 0, 0]), turn(Z, 60));
    close(sampleQuatTrack(track, 75, [0, 0, 0, 0]), turn(Z, 90));
  });

  it('always returns a unit quaternion, even from keys that are not unit length', () => {
    const track = quatTrack([0, 100], [turn(Z, 0).map((c) => c * 3), turn(Z, 90).map((c) => c * 0.5)]);
    for (const time of [0, 10, 50, 90, 100]) {
      const q = sampleQuatTrack(track, time, [0, 0, 0, 0]);
      expect(Math.hypot(...q)).toBeCloseTo(1, 6);
    }
    close(sampleQuatTrack(track, 50, [0, 0, 0, 0]), turn(Z, 45));
  });

  it('takes the shortest arc when a key is stored with the opposite sign', () => {
    // −q is the same rotation as q: going from 0° to « −(20°) » must still pass through 10°, not the long way round.
    const track = quatTrack([0, 100], [turn(Z, 0), turn(Z, 20).map((c) => -c)]);
    expect(angleOf(sampleQuatTrack(track, 50, [0, 0, 0, 0]).map((c) => (c < 0 ? -c : c)))).toBeCloseTo(10, 4);
  });

  it("'step' holds the earlier rotation", () => {
    const track = quatTrack([0, 100], [turn(Z, 10), turn(Z, 90)], 'step');
    close(sampleQuatTrack(track, 99, [0, 0, 0, 0]), turn(Z, 10));
    close(sampleQuatTrack(track, 100, [0, 0, 0, 0]), turn(Z, 90));
  });
});

describe('bone pose from tracks', () => {
  it('a bone without tracks is at rest', () => {
    expect(sampleBonePose(undefined, 500)).toEqual({ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
    expect(sampleBonePose({}, 500)).toEqual({ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  });

  it('samples translation, rotation and scale independently, each on its own keys', () => {
    const tracks: BoneTracks = {
      translation: vec3Track([0, 100], [0, 0, 0, 4, 0, 0]),
      rotation: quatTrack([0, 200], [turn([0, 0, 1], 0), turn([0, 0, 1], 80)]),
      scale: vec3Track([50, 150], [1, 1, 1, 3, 3, 3]),
    };
    const pose = sampleBonePose(tracks, 100);
    close(pose.translation, [4, 0, 0]);
    close(pose.rotation, turn([0, 0, 1], 40));
    close(pose.scale, [2, 2, 2]);
  });

  it('gives one pose per bone, in bone order', () => {
    const poses = samplePoses([undefined, { translation: vec3Track([0], [1, 2, 3]) }], 0);
    expect(poses).toHaveLength(2);
    close(poses[0]!.translation, [0, 0, 0]);
    close(poses[1]!.translation, [1, 2, 3]);
  });
});

describe('track validation', () => {
  it('accepts a correct track', () => {
    expect(() => validateTrack(vec3Track([0, 10], [0, 0, 0, 1, 1, 1]), 3)).not.toThrow();
  });
  it('rejects no key, a wrong number of values, timestamps out of order or repeated, non-finite values', () => {
    expect(() => validateTrack(vec3Track([], []), 3)).toThrow(/at least one key/);
    expect(() => validateTrack(vec3Track([0, 10], [0, 0, 0]), 3)).toThrow(/needs 6 values/);
    expect(() => validateTrack(vec3Track([10, 0], [0, 0, 0, 1, 1, 1]), 3)).toThrow(/strictly increasing/);
    expect(() => validateTrack(vec3Track([5, 5], [0, 0, 0, 1, 1, 1]), 3)).toThrow(/strictly increasing/);
    expect(() => validateTrack(vec3Track([0], [0, NaN, 0]), 3)).toThrow(/not finite/);
  });
  it('rejects an unknown interpolation and a zero quaternion', () => {
    expect(() => validateTrack({ ...vec3Track([0], [0, 0, 0]), interpolation: 'cubic' as never }, 3)).toThrow(/unknown interpolation/);
    expect(() => validateTrack(quatTrack([0], [[0, 0, 0, 0]]), 4)).toThrow(/zero quaternion/);
  });
  it('names the faulty track of a bone', () => {
    expect(() => validateBoneTracks({ scale: vec3Track([0], [1, 1]) }, 'bone 2')).toThrow(/bone 2 scale/);
  });
});

describe('tree sway (fixture)', () => {
  const tracks = treeSwayTracks();
  const pivots = (time: number): number[][] => {
    const matrices = computeBoneMatrices(TREE_SKELETON, samplePoses(tracks, time));
    return TREE_SKELETON.bones.map((_, bone) => bonePivotPosition(TREE_SKELETON, matrices, bone));
  };

  it('has valid tracks, one entry per bone', () => {
    expect(tracks).toHaveLength(TREE_SKELETON.bones.length);
    tracks.forEach((bone, index) => bone && validateBoneTracks(bone, `bone ${index}`));
  });

  it('is upright at 0, 2000 and 4000 ms', () => {
    for (const time of [TREE_SWAY_TIMES[0], TREE_SWAY_TIMES[2], TREE_SWAY_TIMES[4]]) {
      pivots(time).forEach((p, bone) => close(p, TREE_SKELETON.bones[bone]!.pivot, 5));
    }
  });

  it('at 1000 ms puts the bones exactly where the hand-written « bend » pose puts them', () => {
    const bend = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    pivots(1000).forEach((p, bone) => close(p, bonePivotPosition(TREE_SKELETON, bend, bone), 5));
  });

  it('half-way to the first lean, each foliage bone has turned 10°: the top sits at the predicted point', () => {
    // Bone 1 turns 10° around +x about (0, 0, 2.2); the top's pivot is 1.8 above it.
    close(pivots(500)[2]!, [0, -1.8 * Math.sin(Math.PI / 18), 2.2 + 1.8 * Math.cos(Math.PI / 18)], 5);
  });

  it('leans the other way at 3000 ms (mirror of 1000 ms across the x–z plane)', () => {
    const a = pivots(1000)[2]!, b = pivots(3000)[2]!;
    close(b, [a[0]!, -a[1]!, a[2]!], 5);
    expect(Math.abs(a[1]!)).toBeGreaterThan(0.5);
  });

  it('the top swells to 1.1 at full lean and is back to 1 when upright', () => {
    close(sampleBonePose(tracks[2], 1000).scale, [1.1, 1.1, 1.1]);
    close(sampleBonePose(tracks[2], 500).scale, [1.05, 1.05, 1.05]);
    close(sampleBonePose(tracks[2], 2000).scale, [1, 1, 1]);
  });
});
