import { AnimationPlayer, type BonePose, type ModelAnimation, type Sequence } from '../model';

/**
 * Character animation state machine (spec §39, §66 and the example of the « AnimationController » section).
 *
 * FROM THE SPEC:
 * - standard actions have numeric animation ids: 0 Stand, 1 Death, 4 Walk, 5 Run, 17 Attack1H, 37 JumpStart,
 *   38 Jump, 39 JumpEnd…;
 * - example state machine: Stand → (movement) Walk → (faster) Run; Run → (jump) JumpStart → Jump → JumpEnd;
 *   Any → (attack) Attack → previous locomotion;
 * - changing animation cross-fades (the blend time of the sequence).
 *
 * OUR CHOICES (the document gives an example, not rules):
 * - the machine is driven by an INTENT (stand / walk / run) and by events (jump, land, attack);
 * - a jump can start from any locomotion state, and from JumpEnd (jumping again right after landing: P8.2); JumpStart plays once, then Jump loops until land(), then JumpEnd
 *   plays once and the locomotion of the present intent resumes; a land() received during JumpStart is remembered;
 * - an attack starts only from a locomotion state (not in the air, not during another attack), plays once, then
 *   the locomotion of the PRESENT intent resumes (the intent may have changed during the swing);
 * - while a one-shot plays, a change of intent is remembered and applied when it ends;
 * - a one-shot ends when its whole duration has been played; the time left in the frame is not carried over.
 */
export const ANIMATION_ID = { stand: 0, death: 1, walk: 4, run: 5, attack1H: 17, jumpStart: 37, jump: 38, jumpEnd: 39 } as const;

export type Locomotion = 'stand' | 'walk' | 'run';
export type CharacterAnimationState = Locomotion | 'jumpStart' | 'jump' | 'jumpEnd' | 'attack';

const SEQUENCE_OF_STATE: Readonly<Record<CharacterAnimationState, number>> = {
  stand: ANIMATION_ID.stand, walk: ANIMATION_ID.walk, run: ANIMATION_ID.run,
  jumpStart: ANIMATION_ID.jumpStart, jump: ANIMATION_ID.jump, jumpEnd: ANIMATION_ID.jumpEnd, attack: ANIMATION_ID.attack1H,
};
const LOCOMOTION: readonly CharacterAnimationState[] = ['stand', 'walk', 'run'];

export class CharacterAnimator {
  readonly player: AnimationPlayer;
  private current: CharacterAnimationState = 'stand';
  private wanted: Locomotion = 'stand';
  private landed = false;
  private readonly indexOf = new Map<CharacterAnimationState, number>();

  constructor(readonly animation: ModelAnimation, start: Locomotion = 'stand') {
    for (const state of Object.keys(SEQUENCE_OF_STATE) as CharacterAnimationState[]) {
      const index = animation.sequences.findIndex((sequence) => sequence.id === SEQUENCE_OF_STATE[state]);
      if (index < 0) throw new Error(`character animator: the model has no sequence with animation id ${SEQUENCE_OF_STATE[state]} (${state})`);
      this.indexOf.set(state, index);
    }
    for (const state of ['jumpStart', 'jumpEnd', 'attack'] as const) if (this.sequenceOf(state).loop) throw new Error(`character animator: ${state} must not loop`);
    for (const state of ['stand', 'walk', 'run', 'jump'] as const) if (!this.sequenceOf(state).loop) throw new Error(`character animator: ${state} must loop`);
    this.player = new AnimationPlayer(animation);
    this.wanted = start;
    this.enter(start);
  }

  private sequenceOf(state: CharacterAnimationState): Sequence {
    return this.animation.sequences[this.indexOf.get(state)!]!;
  }

  private enter(state: CharacterAnimationState): void {
    this.current = state;
    this.player.play(this.indexOf.get(state)!);
  }

  get state(): CharacterAnimationState {
    return this.current;
  }

  /** What the character is trying to do on the ground. */
  get locomotion(): Locomotion {
    return this.wanted;
  }

  setLocomotion(locomotion: Locomotion): void {
    if (!LOCOMOTION.includes(locomotion)) throw new Error(`character animator: unknown locomotion "${String(locomotion)}"`);
    this.wanted = locomotion;
    if (LOCOMOTION.includes(this.current) && this.current !== locomotion) this.enter(locomotion);
  }

  /** @returns false when the jump was refused (already in the air — JumpStart or Jump —, or attacking) */
  jump(): boolean {
    if (!LOCOMOTION.includes(this.current) && this.current !== 'jumpEnd') return false;
    this.landed = false;
    this.enter('jumpStart');
    return true;
  }

  /** The feet are back on the ground. Ignored when not in a jump. */
  land(): void {
    if (this.current === 'jump') this.enter('jumpEnd');
    else if (this.current === 'jumpStart') this.landed = true;
  }

  /** @returns false when the attack was refused (in the air, or already attacking) */
  attack(): boolean {
    if (!LOCOMOTION.includes(this.current)) return false;
    this.enter('attack');
    return true;
  }

  /** Moves the clocks forward and makes the transitions that are due. */
  update(dtMs: number): void {
    this.player.advance(dtMs);
    const sequence = this.sequenceOf(this.current);
    if (sequence.loop || this.player.state.elapsed < sequence.end - sequence.start) return;
    // A one-shot has played to its end.
    if (this.current === 'jumpStart') this.enter(this.landed ? 'jumpEnd' : 'jump');
    else this.enter(this.wanted); // jumpEnd, attack
  }

  poses(): BonePose[] {
    return this.player.poses();
  }
}
