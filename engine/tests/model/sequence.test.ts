import { describe, expect, it } from 'vitest';
import {
  AnimationPlayer, blendPose, type BonePose, crossFadeFactor, type ModelAnimation, REST_POSE, rotationPose, sampleBonePose, type Sequence, sequenceTime, type Track, trackTime,
  TREE_BLEND_MS, TREE_BOB_HEIGHT, TREE_SKELETON, treeAnimation, validateModelAnimation,
} from '../../src/model';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 5): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const X: readonly [number, number, number] = [1, 0, 0];
const lean = (degrees: number): number[] => [...rotationPose(X, degrees).rotation];
/** Rotation angle around +x of a pose, in degrees (signed). */
const leanOf = (pose: BonePose): number => (2 * Math.atan2(pose.rotation[0], pose.rotation[3]) * 180) / Math.PI;
const seq = (start: number, end: number, loop: boolean, blendTime = 0): Sequence => ({ name: 's', start, end, loop, blendTime });

describe('sequence time: absolute start / end timestamps (spec §64)', () => {
  it('starts at `start` and runs at real speed', () => {
    expect(sequenceTime(seq(5000, 6000, true), 0)).toBe(5000);
    expect(sequenceTime(seq(5000, 6000, true), 250)).toBe(5250);
  });
  it('a looping sequence wraps to its start after end − start milliseconds', () => {
    const s = seq(5000, 6000, true);
    expect(sequenceTime(s, 999)).toBe(5999);
    expect(sequenceTime(s, 1000)).toBe(5000);
    expect(sequenceTime(s, 3250)).toBe(5250);
  });
  it('a sequence that does not loop holds its end', () => {
    const s = seq(5000, 6000, false);
    expect(sequenceTime(s, 999)).toBe(5999);
    expect(sequenceTime(s, 1000)).toBe(6000);
    expect(sequenceTime(s, 1e7)).toBe(6000);
  });
  it('never leaves its own window, looping or not', () => {
    for (const loop of [true, false]) for (let e = 0; e < 5000; e += 37) {
      const t = sequenceTime(seq(700, 1900, loop), e);
      expect(t).toBeGreaterThanOrEqual(700);
      expect(t).toBeLessThanOrEqual(1900);
    }
  });
  it('a sequence of length 0 is a still pose; negative or non-finite elapsed time is refused', () => {
    expect(sequenceTime(seq(300, 300, true), 12345)).toBe(300);
    expect(() => sequenceTime(seq(0, 10, true), -1)).toThrow(/elapsed/);
    expect(() => sequenceTime(seq(0, 10, true), NaN)).toThrow(/elapsed/);
  });
});

describe('cross-fade (spec §66)', () => {
  it('lambda = clamp(elapsed / duration, 0..1); a duration of 0 is a cut', () => {
    expect(crossFadeFactor(0, 300)).toBe(0);
    expect(crossFadeFactor(75, 300)).toBe(0.25);
    expect(crossFadeFactor(300, 300)).toBe(1);
    expect(crossFadeFactor(900, 300)).toBe(1);
    expect(crossFadeFactor(0, 0)).toBe(1);
  });
  it('blends translation and scale linearly and rotation along the arc', () => {
    const from: BonePose = { translation: [0, 0, 0], rotation: lean(0) as never, scale: [1, 1, 1] };
    const to: BonePose = { translation: [4, -2, 8], rotation: lean(80) as never, scale: [3, 3, 3] };
    const half = blendPose(from, to, 0.25);
    close(half.translation, [1, -0.5, 2]);
    close(half.scale, [1.5, 1.5, 1.5]);
    expect(leanOf(half)).toBeCloseTo(20, 4);
  });
  it('gives exactly the ends at lambda 0 and 1', () => {
    const to: BonePose = { translation: [1, 2, 3], rotation: lean(50) as never, scale: [2, 2, 2] };
    close(blendPose(REST_POSE, to, 0).rotation, REST_POSE.rotation);
    close(blendPose(REST_POSE, to, 1).rotation, to.rotation);
    close(blendPose(REST_POSE, to, 1).translation, [1, 2, 3]);
  });
});

describe('global sequences (spec §69)', () => {
  const track: Track = { interpolation: 'linear', timestamps: Uint32Array.from([0, 1000]), values: Float32Array.from([0, 0, 0, 10, 0, 0]), globalSequence: 1 };
  it('an ordinary track uses the sequence time, a global one the global clock wrapped to its own length', () => {
    expect(trackTime({ ...track, globalSequence: undefined }, 123, { time: 9999, durations: [500, 800] })).toBe(123);
    expect(trackTime(track, 123, { time: 2000, durations: [500, 800] })).toBe(400);
  });
  it('samples the bone from the global clock, ignoring the sequence time', () => {
    for (const sequenceTimeMs of [0, 777, 123456]) close(sampleBonePose({ translation: track }, sequenceTimeMs, { time: 2000, durations: [500, 800] }).translation, [4, 0, 0]);
  });
  it('refuses a global sequence the model does not have, and a missing clock', () => {
    expect(() => trackTime(track, 0, { time: 0, durations: [500] })).toThrow(/global sequence 1/);
    expect(() => sampleBonePose({ translation: track }, 0)).toThrow(/global sequence 1/);
  });
  it('a global sequence of length 0 stays at its first key', () => {
    expect(trackTime(track, 50, { time: 999, durations: [0, 0] })).toBe(0);
  });
});

describe('AnimationPlayer on the tree', () => {
  const animation = treeAnimation();
  const SWAY = 0, GUST = 1;

  it('the fixture is valid for the tree skeleton', () => {
    expect(() => validateModelAnimation(animation, TREE_SKELETON.bones.length)).not.toThrow();
  });

  it('plays nothing at first: rest pose, apart from the global bob', () => {
    const player = new AnimationPlayer(animation);
    expect(player.state).toEqual({ sequence: -1, elapsed: 0, previous: -1, lambda: 1, globalTime: 0 });
    player.advance(1000);
    const poses = player.poses();
    expect(leanOf(poses[1]!)).toBeCloseTo(0, 6);
    expect(leanOf(poses[2]!)).toBeCloseTo(0, 6);
    close(poses[2]!.translation, [0, 0, TREE_BOB_HEIGHT]);
  });

  it('the first sequence starts without any fade', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    expect(player.state.lambda).toBe(1);
    player.advance(500);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(10, 4);
  });

  it('loops: 4000 ms later the sway shows the same pose', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    player.advance(1000);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(20, 4);
    player.advance(4000);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(20, 4);
    player.advance(2000);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(-20, 4);
  });

  it('the gust plays its own window of the timeline (5000..6000 ms)', () => {
    const player = new AnimationPlayer(animation);
    player.play(GUST);
    player.advance(500);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(35, 4);
    player.advance(750); // wrapped: 250 ms into the next loop
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(17.5, 4);
  });

  it('cross-fades from the sway to the gust over the blend time, the sway still running', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    player.advance(1000); // sway at +20°
    player.play(GUST);
    expect(player.state).toMatchObject({ sequence: GUST, previous: SWAY, lambda: 0, elapsed: 0 });
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(20, 4); // lambda 0: still the sway
    player.advance(TREE_BLEND_MS / 2);
    // sway at 1150 ms: 20 × (1 − 0.15) = 17° ; gust at 150 ms: 35 × 150 / 500 = 10.5° ; half-way: 13.75°
    expect(player.state.lambda).toBe(0.5);
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(13.75, 3);
    expect(leanOf(player.poses()[2]!)).toBeCloseTo(13.75, 3);
    player.advance(TREE_BLEND_MS / 2);
    expect(player.state).toMatchObject({ previous: -1, lambda: 1 });
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(21, 4); // gust alone at 300 ms: 35 × 300 / 500
  });

  it('the global bob is not disturbed by a change of sequence', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    player.advance(400);
    player.play(GUST);
    player.advance(100); // global clock: 500 ms → a quarter of the 2000 ms loop, half-way up
    close(player.poses()[2]!.translation, [0, 0, TREE_BOB_HEIGHT / 2]);
    player.advance(2000);
    close(player.poses()[2]!.translation, [0, 0, TREE_BOB_HEIGHT / 2]);
  });

  it('a new sequence during a fade fades from the one that was current', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    player.advance(1000);
    player.play(GUST);
    player.advance(100);
    player.play(SWAY);
    expect(player.state).toMatchObject({ sequence: SWAY, previous: GUST, lambda: 0 });
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(7, 4); // the gust alone at 100 ms: 35 × 100 / 500
  });

  it('stop returns to rest at once and keeps the global clock', () => {
    const player = new AnimationPlayer(animation);
    player.play(SWAY);
    player.advance(1000);
    player.stop();
    expect(player.state).toMatchObject({ sequence: -1, previous: -1, globalTime: 1000 });
    expect(leanOf(player.poses()[1]!)).toBeCloseTo(0, 6);
  });

  it('refuses an unknown sequence and a negative time step', () => {
    const player = new AnimationPlayer(animation);
    expect(() => player.play(7)).toThrow(/no sequence 7/);
    expect(() => player.advance(-1)).toThrow(/time step/);
  });
});

describe('model animation validation', () => {
  const good: ModelAnimation = treeAnimation();
  it('rejects a wrong number of bone track sets', () => {
    expect(() => validateModelAnimation(good, 4)).toThrow(/3 bone track set\(s\) for 4 bone/);
  });
  it('rejects a sequence that ends before it starts and a negative blend time', () => {
    expect(() => validateModelAnimation({ ...good, sequences: [seq(10, 5, true)] }, 3)).toThrow(/start ≤ end/);
    expect(() => validateModelAnimation({ ...good, sequences: [seq(0, 5, true, -1)] }, 3)).toThrow(/blend time/);
  });
  it('rejects a track on a global sequence the model does not have', () => {
    expect(() => validateModelAnimation({ ...good, globalSequences: [] }, 3)).toThrow(/follows global sequence 0, the model has 0/);
  });
});
