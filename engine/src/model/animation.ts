import { quat } from '../math';
import type { BonePose } from './skeleton';

/**
 * Animation tracks of a bone (spec §34, §38, §65).
 *
 * FROM THE SPEC:
 * - a track is a list of timestamps and a list of values, with an interpolation type;
 * - translation and scale keys are 3 floats, rotation keys are float quaternions (4 floats);
 * - the surrounding keys are found by BINARY SEARCH on the timestamps, then an interpolation fraction is computed;
 * - translation and scale are interpolated linearly, rotation by normalized quaternion interpolation / slerp.
 *
 * OUR CHOICES (the document does not settle them):
 * - timestamps are whole milliseconds, strictly increasing;
 * - the interpolation types are 'linear' and 'step' (the value of the earlier key is held) — the document names
 *   the field but not its values;
 * - before the first key the first value is used, after the last key the last value (no extrapolation);
 * - a time exactly on a key gives exactly that key's value;
 * - rotation takes the shortest arc; a sampled rotation is always a unit quaternion;
 * - a bone without a track for translation / rotation / scale keeps its rest value.
 *
 * Sequences, looping and cross-fade are in sequence.ts. The per-track `ranges` field of the original format is
 * not reproduced: with absolute timestamps the binary search finds the keys of any sequence directly.
 */
export type TrackInterpolation = 'step' | 'linear';

export interface Track {
  readonly interpolation: TrackInterpolation;
  /** Key times in milliseconds, strictly increasing. */
  readonly timestamps: Uint32Array;
  /** `components` floats per key, key after key. */
  readonly values: Float32Array;
  /**
   * When set, the track does not follow the active sequence: it loops on its own, on global sequence number
   * `globalSequence` of the model (spec §69). See GlobalClock.
   */
  readonly globalSequence?: number | undefined;
}

/** Time source of the tracks that follow a global sequence: one shared clock, and the length of each sequence. */
export interface GlobalClock {
  /** Milliseconds since the model started; never reset by a change of animation. */
  readonly time: number;
  /** Length in milliseconds of each global sequence of the model. */
  readonly durations: readonly number[];
}

/**
 * The time at which a track must be sampled: `time` (the active sequence's clock) for an ordinary track,
 * or the global clock wrapped to the global sequence's length (OUR CHOICE: a length of 0 pins the track at 0).
 */
export function trackTime(track: Track, time: number, globals?: GlobalClock): number {
  if (track.globalSequence === undefined) return time;
  const duration = globals?.durations[track.globalSequence];
  if (globals === undefined || duration === undefined) throw new Error(`animation: a track follows global sequence ${track.globalSequence}, which the model does not have`);
  if (!(duration >= 0) || !Number.isFinite(globals.time) || globals.time < 0) throw new Error('animation: the global clock and the global sequence lengths must be finite and ≥ 0');
  return duration === 0 ? 0 : globals.time % duration;
}

/** The tracks of one bone; a missing track means « stays at rest ». */
export interface BoneTracks {
  readonly translation?: Track | undefined;
  readonly rotation?: Track | undefined;
  readonly scale?: Track | undefined;
}

export const TRANSLATION_COMPONENTS = 3;
export const ROTATION_COMPONENTS = 4;
export const SCALE_COMPONENTS = 3;

export function validateTrack(track: Track, components: number, what = 'track'): void {
  const keys = track.timestamps.length;
  if (track.interpolation !== 'step' && track.interpolation !== 'linear') throw new Error(`animation: ${what} has an unknown interpolation "${String(track.interpolation)}"`);
  if (keys < 1) throw new Error(`animation: ${what} needs at least one key`);
  if (track.values.length !== keys * components) throw new Error(`animation: ${what} has ${keys} key(s) and needs ${keys * components} values (got ${track.values.length})`);
  for (let k = 1; k < keys; k++) if (track.timestamps[k]! <= track.timestamps[k - 1]!) throw new Error(`animation: ${what} timestamps must be strictly increasing (key ${k})`);
  if (track.globalSequence !== undefined && (!Number.isInteger(track.globalSequence) || track.globalSequence < 0)) throw new Error(`animation: ${what} has an invalid global sequence ${track.globalSequence}`);
  for (let k = 0; k < track.values.length; k++) if (!Number.isFinite(track.values[k]!)) throw new Error(`animation: ${what} value ${k} is not finite`);
  if (components === ROTATION_COMPONENTS) {
    for (let k = 0; k < keys; k++) {
      if (!(Math.hypot(track.values[k * 4]!, track.values[k * 4 + 1]!, track.values[k * 4 + 2]!, track.values[k * 4 + 3]!) > 0)) throw new Error(`animation: ${what} key ${k} is a zero quaternion`);
    }
  }
}

export function validateBoneTracks(tracks: BoneTracks, what = 'bone'): void {
  if (tracks.translation) validateTrack(tracks.translation, TRANSLATION_COMPONENTS, `${what} translation`);
  if (tracks.rotation) validateTrack(tracks.rotation, ROTATION_COMPONENTS, `${what} rotation`);
  if (tracks.scale) validateTrack(tracks.scale, SCALE_COMPONENTS, `${what} scale`);
}

/** Result of a key search: the value is between key `k0` and key `k1`, at fraction `t` (0 = k0, 1 = k1). */
export interface KeySpan {
  k0: number;
  k1: number;
  t: number;
}

/**
 * Binary search of the keys around `time` (spec §65): k0 = last key at or before `time`, k1 = the next one.
 * Outside the track both are the nearest end and t = 0. `timestamps` must be strictly increasing and not empty.
 * At most ⌈log2(keys)⌉ + 1 timestamps are read.
 */
export function findKeys(timestamps: ArrayLike<number>, time: number, out: KeySpan = { k0: 0, k1: 0, t: 0 }): KeySpan {
  const keys = timestamps.length;
  if (keys < 1) throw new Error('animation: cannot search an empty track');
  if (!Number.isFinite(time)) throw new Error(`animation: time must be finite (got ${time})`);
  // Invariant: every key below `low` is ≤ time, every key from `high` on is > time.
  let low = 0, high = keys;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (timestamps[middle]! <= time) low = middle + 1;
    else high = middle;
  }
  if (low === 0 || low === keys) {
    // Before the first key, or on / after the last one.
    out.k0 = out.k1 = low === 0 ? 0 : keys - 1;
    out.t = 0;
  } else {
    const t0 = timestamps[low - 1]!;
    out.k0 = low - 1;
    out.k1 = low;
    out.t = (time - t0) / (timestamps[low]! - t0);
  }
  return out;
}

const span: KeySpan = { k0: 0, k1: 0, t: 0 };
const qa = quat.create(), qb = quat.create(), qr = quat.create();

/** Samples a 3-float track (translation or scale) into `out`. */
export function sampleVec3Track(track: Track, time: number, out: [number, number, number]): [number, number, number] {
  const { k0, k1, t } = findKeys(track.timestamps, time, span);
  const v = track.values, a = k0 * 3, b = k1 * 3, f = track.interpolation === 'linear' ? t : 0;
  out[0] = v[a]! + (v[b]! - v[a]!) * f;
  out[1] = v[a + 1]! + (v[b + 1]! - v[a + 1]!) * f;
  out[2] = v[a + 2]! + (v[b + 2]! - v[a + 2]!) * f;
  return out;
}

/** Samples a quaternion track into `out` (x, y, z, w): unit length, shortest arc. */
export function sampleQuatTrack(track: Track, time: number, out: [number, number, number, number]): [number, number, number, number] {
  const { k0, k1, t } = findKeys(track.timestamps, time, span);
  const v = track.values;
  quat.normalize(qa, quat.set(qa, v[k0 * 4]!, v[k0 * 4 + 1]!, v[k0 * 4 + 2]!, v[k0 * 4 + 3]!));
  if (track.interpolation === 'linear' && t > 0) {
    quat.normalize(qb, quat.set(qb, v[k1 * 4]!, v[k1 * 4 + 1]!, v[k1 * 4 + 2]!, v[k1 * 4 + 3]!));
    quat.slerp(qr, qa, qb, t);
  } else quat.set(qr, qa[0]!, qa[1]!, qa[2]!, qa[3]!);
  out[0] = qr[0]!; out[1] = qr[1]!; out[2] = qr[2]!; out[3] = qr[3]!;
  return out;
}

/**
 * The pose of one bone at `time` (milliseconds on the tracks' own timeline).
 * @param globals needed only when a track follows a global sequence
 */
export function sampleBonePose(tracks: BoneTracks | undefined, time: number, globals?: GlobalClock): BonePose {
  const translation: [number, number, number] = [0, 0, 0], rotation: [number, number, number, number] = [0, 0, 0, 1], scale: [number, number, number] = [1, 1, 1];
  if (tracks?.translation) sampleVec3Track(tracks.translation, trackTime(tracks.translation, time, globals), translation);
  if (tracks?.rotation) sampleQuatTrack(tracks.rotation, trackTime(tracks.rotation, time, globals), rotation);
  if (tracks?.scale) sampleVec3Track(tracks.scale, trackTime(tracks.scale, time, globals), scale);
  return { translation, rotation, scale };
}

/** One pose per bone, ready for computeBoneMatrices(). `boneTracks[i]` belongs to bone i. */
export function samplePoses(boneTracks: ReadonlyArray<BoneTracks | undefined>, time: number, globals?: GlobalClock): BonePose[] {
  return boneTracks.map((tracks) => sampleBonePose(tracks, time, globals));
}
