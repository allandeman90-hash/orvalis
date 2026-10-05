import { type BoneTracks, type ModelAnimation, type Track } from '../model';
import { ANIMATION_ID } from './animator';
import { MANNEQUIN_BONE, MANNEQUIN_SKELETON } from './mannequin';

/**
 * ORIGINAL animations of the mannequin, written in code (P5.4): stand, walk, run, jump (start / air / end) and a
 * one-handed attack — all on ONE timeline, each sequence in its own window (spec §35). Simple swings of the
 * limbs: enough to drive and test the state machine, not final animation.
 *
 * Angles are in degrees around the character's x axis (its left–right axis): for a limb hanging down, a positive
 * angle swings it FORWARD (+y), a negative one backward. The chest may also twist around z (the vertical).
 */
type Key = readonly [time: number, x: number, z?: number];
const B = MANNEQUIN_BONE;

/** Quaternion of « turn x degrees around x, then z degrees around z ». */
function turn(xDegrees: number, zDegrees = 0): [number, number, number, number] {
  const hx = (xDegrees * Math.PI) / 360, hz = (zDegrees * Math.PI) / 360;
  const sx = Math.sin(hx), cx = Math.cos(hx), sz = Math.sin(hz), cz = Math.cos(hz);
  // qz × qx
  return [cz * sx, sz * sx, sz * cx, cz * cx];
}

export interface MannequinSequenceSpec {
  readonly name: string;
  readonly id: number;
  readonly start: number;
  readonly duration: number;
  readonly loop: boolean;
  readonly blendTime: number;
  /** Per bone: keys with times RELATIVE to the start of the sequence. */
  readonly keys: Readonly<Partial<Record<keyof typeof MANNEQUIN_BONE, readonly Key[]>>>;
}

/** A swing between −a and +a over one period, starting at 0 going forward; `phase` 0.5 = the opposite limb. */
const swing = (period: number, amplitude: number, phase = 0, offset = 0): Key[] => [0, 0.25, 0.5, 0.75, 1].map((f) => [f * period, offset + amplitude * Math.sin((f + phase) * 2 * Math.PI)] as const);
/** The knee: straight when the leg is in front or behind, bent while it passes under the body going forward. */
const knee = (period: number, bend: number, phase = 0): Key[] => [0, 0.25, 0.5, 0.75, 1].map((f) => [f * period, -bend * Math.max(0, Math.cos((f + phase) * 2 * Math.PI))] as const);
const hold = (duration: number, angle: number, z = 0): Key[] => [[0, angle, z], [duration, angle, z]];

export const MANNEQUIN_SEQUENCES: readonly MannequinSequenceSpec[] = [
  {
    name: 'stand', id: ANIMATION_ID.stand, start: 0, duration: 2000, loop: true, blendTime: 150,
    // Breathing: the chest leans a little back and forth; the right forearm is raised (it holds the weapon).
    keys: { chest: [[0, 0], [1000, 2], [2000, 0]], rightForearm: hold(2000, 20), leftForearm: hold(2000, 6) },
  },
  {
    name: 'walk', id: ANIMATION_ID.walk, start: 3000, duration: 1000, loop: true, blendTime: 150,
    keys: {
      leftThigh: swing(1000, 25), rightThigh: swing(1000, 25, 0.5),
      leftShin: knee(1000, 35), rightShin: knee(1000, 35, 0.5),
      leftUpperArm: swing(1000, 20, 0.5), rightUpperArm: swing(1000, 20),
      leftForearm: hold(1000, 15), rightForearm: hold(1000, 25),
    },
  },
  {
    name: 'run', id: ANIMATION_ID.run, start: 5000, duration: 600, loop: true, blendTime: 150,
    keys: {
      chest: hold(600, 8),
      leftThigh: swing(600, 45), rightThigh: swing(600, 45, 0.5),
      leftShin: knee(600, 70), rightShin: knee(600, 70, 0.5),
      leftUpperArm: swing(600, 40, 0.5), rightUpperArm: swing(600, 40),
      leftForearm: hold(600, 70), rightForearm: hold(600, 70),
    },
  },
  {
    name: 'jumpStart', id: ANIMATION_ID.jumpStart, start: 7000, duration: 200, loop: false, blendTime: 80,
    // Crouch, arms back.
    keys: { leftThigh: [[0, 0], [200, 45]], rightThigh: [[0, 0], [200, 45]], leftShin: [[0, 0], [200, -80]], rightShin: [[0, 0], [200, -80]], leftUpperArm: [[0, 0], [200, -35]], rightUpperArm: [[0, 0], [200, -35]], chest: [[0, 0], [200, 12]] },
  },
  {
    name: 'jump', id: ANIMATION_ID.jump, start: 8000, duration: 400, loop: true, blendTime: 80,
    // In the air: legs tucked a little, arms up.
    keys: { leftThigh: hold(400, 30), rightThigh: hold(400, 15), leftShin: hold(400, -45), rightShin: hold(400, -30), leftUpperArm: [[0, 60], [200, 70], [400, 60]], rightUpperArm: [[0, 60], [200, 70], [400, 60]] },
  },
  {
    name: 'jumpEnd', id: ANIMATION_ID.jumpEnd, start: 9000, duration: 250, loop: false, blendTime: 80,
    // Landing: a deep crouch that straightens.
    keys: { leftThigh: [[0, 55], [250, 0]], rightThigh: [[0, 55], [250, 0]], leftShin: [[0, -95], [250, 0]], rightShin: [[0, -95], [250, 0]], chest: [[0, 15], [250, 0]] },
  },
  {
    name: 'attack1H', id: ANIMATION_ID.attack1H, start: 10000, duration: 500, loop: false, blendTime: 80,
    // The right arm is raised behind the shoulder, swings down in front, and comes back; the chest twists with it.
    keys: {
      rightUpperArm: [[0, 0], [150, 160], [300, 50], [500, 0]],
      rightForearm: [[0, 20], [150, 60], [300, 10], [500, 20]],
      chest: [[0, 0, 0], [150, 0, -20], [300, 6, 25], [500, 0, 0]],
      leftUpperArm: [[0, 0], [150, -15], [300, 20], [500, 0]],
    },
  },
];

/** The mannequin's animation data: every sequence above turned into rotation tracks on one timeline. */
export function mannequinAnimation(): ModelAnimation {
  const perBone = new Map<number, Array<{ time: number; quaternion: number[] }>>();
  for (const sequence of MANNEQUIN_SEQUENCES) {
    for (const [name, keys] of Object.entries(sequence.keys) as Array<[keyof typeof MANNEQUIN_BONE, readonly Key[]]>) {
      const list = perBone.get(B[name]) ?? [];
      perBone.set(B[name], list);
      for (const [time, x, z] of keys) list.push({ time: sequence.start + time, quaternion: turn(x, z ?? 0) });
    }
  }
  // A bone that a sequence does not mention must be at rest during that sequence: add rest keys at its two ends,
  // otherwise the track would interpolate between its keys of the sequences before and after.
  for (const [bone, list] of perBone) {
    for (const sequence of MANNEQUIN_SEQUENCES) {
      const name = (Object.keys(B) as Array<keyof typeof MANNEQUIN_BONE>).find((k) => B[k] === bone)!;
      if (sequence.keys[name]) continue;
      list.push({ time: sequence.start, quaternion: turn(0) }, { time: sequence.start + sequence.duration, quaternion: turn(0) });
    }
    list.sort((a, b) => a.time - b.time);
  }
  const boneTracks: Array<BoneTracks | undefined> = MANNEQUIN_SKELETON.bones.map((_, bone) => {
    const list = perBone.get(bone);
    if (!list) return undefined;
    const rotation: Track = { interpolation: 'linear', timestamps: Uint32Array.from(list.map((k) => k.time)), values: Float32Array.from(list.flatMap((k) => k.quaternion)) };
    return { rotation };
  });
  return {
    sequences: MANNEQUIN_SEQUENCES.map((s) => ({ name: s.name, id: s.id, start: s.start, end: s.start + s.duration, loop: s.loop, blendTime: s.blendTime })),
    boneTracks,
    globalSequences: [],
  };
}
