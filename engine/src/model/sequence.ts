import { quat } from '../math';
import { type BoneTracks, type GlobalClock, samplePoses, validateBoneTracks } from './animation';
import type { BonePose } from './skeleton';

/**
 * Animation sequences, cross-fade and global sequences (spec §35, §64, §66, §69).
 *
 * FROM THE SPEC:
 * - a sequence is a window of the model's single timeline, given by ABSOLUTE start and end timestamps;
 *   its duration is end − start;
 * - a sequence stores a blend time; changing animation cross-fades between two sampled poses:
 *       lambda = clamp(transitionElapsed / transitionDuration, 0..1), then blend(previous, current, lambda);
 * - a track may follow a global sequence instead of the active sequence's clock.
 *
 * OUR CHOICES (the document does not settle them):
 * - a sequence either loops or holds its last pose (`loop`); the original record has `flags` whose bits the
 *   document does not describe;
 * - looping wraps at `end` back to `start` (the pose at `end` is never shown: authors make it equal to `start`);
 * - the cross-fade lasts the blend time of the sequence being ENTERED;
 * - during a cross-fade the previous sequence keeps running;
 * - starting a new sequence in the middle of a cross-fade fades from the sequence that was current
 *   (the older one is dropped: at most two poses are ever blended, as in the document's controller);
 * - poses are blended like keys: lerp for translation and scale, shortest-arc slerp for rotation;
 * - the global clock starts at 0 with the player and is never reset by a change of sequence.
 */
export interface Sequence {
  readonly name: string;
  /** Numeric animation id (spec §35, §39: sequences carry the id of the standard action they play). Optional. */
  readonly id?: number | undefined;
  /** Absolute timestamps on the model's timeline, in milliseconds; end ≥ start. */
  readonly start: number;
  readonly end: number;
  readonly loop: boolean;
  /** Cross-fade length when this sequence is started, in milliseconds (0 = cut). */
  readonly blendTime: number;
}

/** Everything that animates one model. */
export interface ModelAnimation {
  readonly sequences: readonly Sequence[];
  /** One entry per bone of the skeleton. */
  readonly boneTracks: ReadonlyArray<BoneTracks | undefined>;
  /** Length in milliseconds of each global sequence. */
  readonly globalSequences: readonly number[];
}

export function validateModelAnimation(animation: ModelAnimation, boneCount: number): void {
  if (animation.boneTracks.length !== boneCount) throw new Error(`animation: ${animation.boneTracks.length} bone track set(s) for ${boneCount} bone(s)`);
  animation.globalSequences.forEach((duration, index) => {
    if (!Number.isInteger(duration) || duration < 0) throw new Error(`animation: global sequence ${index} needs a whole length ≥ 0 ms (got ${duration})`);
  });
  animation.sequences.forEach((s, index) => {
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end < s.start) throw new Error(`animation: sequence ${index} ("${s.name}") needs whole timestamps with 0 ≤ start ≤ end (got ${s.start}..${s.end})`);
    if (!(s.blendTime >= 0) || !Number.isFinite(s.blendTime)) throw new Error(`animation: sequence ${index} ("${s.name}") needs a blend time ≥ 0 (got ${s.blendTime})`);
  });
  animation.boneTracks.forEach((tracks, bone) => {
    if (!tracks) return;
    validateBoneTracks(tracks, `bone ${bone}`);
    for (const track of [tracks.translation, tracks.rotation, tracks.scale]) {
      if (track?.globalSequence !== undefined && track.globalSequence >= animation.globalSequences.length) throw new Error(`animation: bone ${bone} follows global sequence ${track.globalSequence}, the model has ${animation.globalSequences.length}`);
    }
  });
}

/** The absolute track time shown `elapsed` milliseconds after a sequence was started. */
export function sequenceTime(sequence: Sequence, elapsed: number): number {
  if (!(elapsed >= 0) || !Number.isFinite(elapsed)) throw new Error(`animation: elapsed time must be finite and ≥ 0 (got ${elapsed})`);
  const duration = sequence.end - sequence.start;
  if (duration === 0) return sequence.start;
  return sequence.start + (sequence.loop ? elapsed % duration : Math.min(elapsed, duration));
}

/** lambda of the cross-fade (spec §66). A transition of length 0 is a cut. */
export function crossFadeFactor(transitionElapsed: number, transitionDuration: number): number {
  return transitionDuration > 0 ? Math.min(1, Math.max(0, transitionElapsed / transitionDuration)) : 1;
}

const qa = quat.create(), qb = quat.create(), qr = quat.create();

/** `from` at lambda 0, `to` at lambda 1. */
export function blendPose(from: BonePose, to: BonePose, lambda: number): BonePose {
  const mix = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * lambda, a[1]! + (b[1]! - a[1]!) * lambda, a[2]! + (b[2]! - a[2]!) * lambda];
  quat.slerp(qr, quat.set(qa, ...from.rotation), quat.set(qb, ...to.rotation), lambda);
  return { translation: mix(from.translation, to.translation), rotation: [qr[0]!, qr[1]!, qr[2]!, qr[3]!], scale: mix(from.scale, to.scale) };
}

export interface AnimationState {
  /** Index of the current sequence, or −1 when nothing plays (rest pose). */
  readonly sequence: number;
  readonly elapsed: number;
  /** Index of the sequence being faded out, or −1. */
  readonly previous: number;
  /** 1 when no cross-fade is running. */
  readonly lambda: number;
  readonly globalTime: number;
}

/** Plays the sequences of one model instance: the document's « recommended web controller ». */
export class AnimationPlayer {
  private current = -1;
  private elapsed = 0;
  private previous = -1;
  private previousElapsed = 0;
  private transitionElapsed = 0;
  private transitionDuration = 0;
  private globalTime = 0;

  constructor(readonly animation: ModelAnimation) {}

  /** Starts a sequence from its beginning, cross-fading from the one that was playing (if any). */
  play(index: number): void {
    const sequence = this.animation.sequences[index];
    if (!sequence) throw new Error(`animation: no sequence ${index}`);
    this.previous = this.current;
    this.previousElapsed = this.elapsed;
    this.current = index;
    this.elapsed = 0;
    this.transitionElapsed = 0;
    this.transitionDuration = this.previous < 0 ? 0 : sequence.blendTime;
  }

  /** Back to the rest pose, at once. The global clock keeps its time. */
  stop(): void {
    this.current = this.previous = -1;
    this.elapsed = this.previousElapsed = this.transitionElapsed = this.transitionDuration = 0;
  }

  /** Moves every clock forward by `dtMs` ≥ 0. */
  advance(dtMs: number): void {
    if (!(dtMs >= 0) || !Number.isFinite(dtMs)) throw new Error(`animation: the time step must be finite and ≥ 0 (got ${dtMs})`);
    this.globalTime += dtMs;
    if (this.current < 0) return;
    this.elapsed += dtMs;
    if (this.previous >= 0) {
      this.previousElapsed += dtMs;
      this.transitionElapsed += dtMs;
      if (this.transitionElapsed >= this.transitionDuration) this.previous = -1;
    }
  }

  get state(): AnimationState {
    return { sequence: this.current, elapsed: this.elapsed, previous: this.previous, lambda: this.previous < 0 ? 1 : crossFadeFactor(this.transitionElapsed, this.transitionDuration), globalTime: this.globalTime };
  }

  /** One pose per bone for the present moment. Tracks on a global sequence run even when no sequence plays. */
  poses(): BonePose[] {
    const { sequences, boneTracks, globalSequences } = this.animation;
    const globals: GlobalClock = { time: this.globalTime, durations: globalSequences };
    if (this.current < 0) {
      // No sequence: only the tracks that follow a global sequence move.
      return boneTracks.map((tracks) => samplePoses([tracks && onlyGlobal(tracks)], 0, globals)[0]!);
    }
    const now = samplePoses(boneTracks, sequenceTime(sequences[this.current]!, this.elapsed), globals);
    if (this.previous < 0) return now;
    const lambda = crossFadeFactor(this.transitionElapsed, this.transitionDuration);
    if (lambda >= 1) return now;
    const before = samplePoses(boneTracks, sequenceTime(sequences[this.previous]!, this.previousElapsed), globals);
    return now.map((pose, bone) => blendPose(before[bone]!, pose, lambda));
  }
}

function onlyGlobal(tracks: BoneTracks): BoneTracks {
  const keep = <T extends { globalSequence?: number | undefined }>(track: T | undefined): T | undefined => (track?.globalSequence === undefined ? undefined : track);
  return { translation: keep(tracks.translation), rotation: keep(tracks.rotation), scale: keep(tracks.scale) };
}
