import { describe, expect, it } from 'vitest';
import { ANIMATION_ID, buildAttachedModel, CharacterAnimator, MANNEQUIN_BONE, MANNEQUIN_SEQUENCES, MANNEQUIN_SKELETON, mannequinAnimation } from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { bonePivotPosition, computeBoneMatrices, type ModelAnimation, validateModelAnimation } from '../../src/model';
import { NullBackend } from '../../src/renderer';
import { CHARACTER_AIR_MS, createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

const animation = mannequinAnimation();
const B = MANNEQUIN_BONE;
/** Rotation angle around +x of a bone's pose, in degrees (the mannequin's limbs only turn around x). */
const angleOf = (animator: CharacterAnimator, bone: number): number => {
  const q = animator.poses()[bone]!.rotation;
  return (2 * Math.atan2(q[0], q[3]) * 180) / Math.PI;
};
const nameOf = (animator: CharacterAnimator): string => animation.sequences[animator.player.state.sequence]!.name;

describe('mannequin animation data', () => {
  it('is valid for the skeleton and has the standard animation ids (spec §39)', () => {
    expect(() => validateModelAnimation(animation, MANNEQUIN_SKELETON.bones.length)).not.toThrow();
    expect(animation.sequences.map((s) => [s.name, s.id])).toEqual([['stand', 0], ['walk', 4], ['run', 5], ['jumpStart', 37], ['jump', 38], ['jumpEnd', 39], ['attack1H', 17]]);
    expect(ANIMATION_ID).toMatchObject({ stand: 0, death: 1, walk: 4, run: 5, attack1H: 17, jumpStart: 37, jump: 38, jumpEnd: 39 });
  });
  it('every sequence has its own window of the single timeline: no overlap', () => {
    const windows = MANNEQUIN_SEQUENCES.map((s) => [s.start, s.start + s.duration]).sort((a, b) => a[0]! - b[0]!);
    for (let k = 1; k < windows.length; k++) expect(windows[k]![0]).toBeGreaterThan(windows[k - 1]![1]!);
  });
  it('looping sequences end on the pose they start with', () => {
    for (const spec of MANNEQUIN_SEQUENCES.filter((s) => s.loop)) {
      for (const keys of Object.values(spec.keys)) {
        expect(keys[0]![1]).toBeCloseTo(keys[keys.length - 1]![1], 9);
        expect(keys[keys.length - 1]![0]).toBe(spec.duration);
      }
    }
  });
  it('a bone that a sequence does not animate is at rest during it (no leak from the neighbouring sequences)', () => {
    // The thighs swing in walk (3000..4000) and run (5000..5600) but are not mentioned in stand (0..2000).
    const animator = new CharacterAnimator(animation);
    for (const t of [0, 700, 1300, 1999]) {
      const fresh = new CharacterAnimator(animation);
      fresh.update(t);
      expect(angleOf(fresh, B.leftThigh)).toBeCloseTo(0, 5);
    }
    expect(angleOf(animator, B.rightForearm)).toBeCloseTo(20, 4); // the weapon arm is raised while standing
  });
  it('walk: legs swing ±25° in opposition, the leading leg is straight, arms swing against the legs', () => {
    const animator = new CharacterAnimator(animation, 'walk');
    animator.update(250); // a quarter of the 1 s cycle
    expect(angleOf(animator, B.leftThigh)).toBeCloseTo(25, 3);
    expect(angleOf(animator, B.rightThigh)).toBeCloseTo(-25, 3);
    expect(angleOf(animator, B.leftShin)).toBeCloseTo(0, 3);
    expect(angleOf(animator, B.leftUpperArm)).toBeCloseTo(-20, 3);
    expect(angleOf(animator, B.rightUpperArm)).toBeCloseTo(20, 3);
    animator.update(500); // three quarters: mirrored
    expect(angleOf(animator, B.leftThigh)).toBeCloseTo(-25, 3);
    expect(angleOf(animator, B.rightThigh)).toBeCloseTo(25, 3);
    animator.update(250); // full cycle: knee of the left leg bent as it passes under the body
    expect(angleOf(animator, B.leftShin)).toBeCloseTo(-35, 3);
  });
  it('run swings wider and faster than walk', () => {
    const animator = new CharacterAnimator(animation, 'run');
    animator.update(150); // a quarter of the 0.6 s cycle
    expect(angleOf(animator, B.leftThigh)).toBeCloseTo(45, 3);
    expect(angleOf(animator, B.chest)).toBeCloseTo(8, 3);
  });
  it('the foot really moves: walking puts the left ankle 0.37 in front of the hip at the quarter cycle', () => {
    const animator = new CharacterAnimator(animation, 'walk');
    animator.update(250);
    const matrices = computeBoneMatrices(MANNEQUIN_SKELETON, animator.poses());
    const foot = bonePivotPosition(MANNEQUIN_SKELETON, matrices, B.leftFoot);
    // Hip at (−0.09, 0, 0.95), ankle 0.85 below it, leg turned 25° forward.
    expect(foot[0]).toBeCloseTo(-0.09, 5);
    expect(foot[1]).toBeCloseTo(0.85 * Math.sin((25 * Math.PI) / 180), 4);
    expect(foot[2]).toBeCloseTo(0.95 - 0.85 * Math.cos((25 * Math.PI) / 180), 4);
  });
});

describe('CharacterAnimator: the state machine (spec example: Stand → Walk → Run, jump, attack → locomotion)', () => {
  it('starts standing; the intent moves it between stand, walk and run with a cross-fade', () => {
    const animator = new CharacterAnimator(animation);
    expect([animator.state, nameOf(animator)]).toEqual(['stand', 'stand']);
    animator.setLocomotion('walk');
    expect([animator.state, nameOf(animator)]).toEqual(['walk', 'walk']);
    expect(animator.player.state).toMatchObject({ lambda: 0 });
    expect(animation.sequences[animator.player.state.previous]!.name).toBe('stand');
    animator.update(75);
    expect(animator.player.state.lambda).toBe(0.5);
    animator.update(75);
    expect(animator.player.state.previous).toBe(-1);
    animator.setLocomotion('run');
    expect(animator.state).toBe('run');
    animator.setLocomotion('stand');
    expect(animator.state).toBe('stand');
  });
  it('asking again for the present locomotion does not restart it', () => {
    const animator = new CharacterAnimator(animation, 'walk');
    animator.update(400);
    animator.setLocomotion('walk');
    expect(animator.player.state.elapsed).toBe(400);
  });
  it('jump: JumpStart once, Jump in a loop until landing, JumpEnd once, then back to the locomotion', () => {
    const animator = new CharacterAnimator(animation, 'run');
    expect(animator.jump()).toBe(true);
    expect(animator.state).toBe('jumpStart');
    animator.update(199);
    expect(animator.state).toBe('jumpStart');
    animator.update(1);
    expect(animator.state).toBe('jump');
    animator.update(1500); // stays in the air as long as nothing says otherwise (the loop is 400 ms)
    expect([animator.state, nameOf(animator)]).toEqual(['jump', 'jump']);
    animator.land();
    expect(animator.state).toBe('jumpEnd');
    animator.update(249);
    expect(animator.state).toBe('jumpEnd');
    animator.update(1);
    expect([animator.state, nameOf(animator)]).toEqual(['run', 'run']);
  });
  it('a landing during JumpStart is remembered: JumpEnd follows directly', () => {
    const animator = new CharacterAnimator(animation);
    animator.jump();
    animator.update(100);
    animator.land();
    expect(animator.state).toBe('jumpStart');
    animator.update(100);
    expect(animator.state).toBe('jumpEnd');
  });
  it('no second jump and no attack while in the air; landing on the ground does nothing', () => {
    const animator = new CharacterAnimator(animation);
    animator.land();
    expect(animator.state).toBe('stand');
    animator.jump();
    expect(animator.jump()).toBe(false);
    expect(animator.attack()).toBe(false);
    animator.update(200);
    expect(animator.attack()).toBe(false);
    expect(animator.state).toBe('jump');
  });
  it('attack: plays once from any locomotion, then returns to the locomotion', () => {
    for (const locomotion of ['stand', 'walk', 'run'] as const) {
      const animator = new CharacterAnimator(animation, locomotion);
      expect(animator.attack()).toBe(true);
      expect([animator.state, nameOf(animator)]).toEqual(['attack', 'attack1H']);
      expect(animator.attack()).toBe(false); // not during an attack
      animator.update(150);
      expect(angleOf(animator, B.rightUpperArm)).toBeGreaterThan(100); // the arm is raised (fading in from the locomotion)
      animator.update(349);
      expect(animator.state).toBe('attack');
      animator.update(1);
      expect(animator.state).toBe(locomotion);
    }
  });
  it('a change of intent during a one-shot is applied when it ends', () => {
    const animator = new CharacterAnimator(animation, 'stand');
    animator.attack();
    animator.setLocomotion('run');
    expect(animator.state).toBe('attack');
    expect(animator.locomotion).toBe('run');
    animator.update(500);
    expect(animator.state).toBe('run');
    animator.jump();
    animator.setLocomotion('walk');
    animator.update(200);
    animator.land();
    animator.update(250);
    expect(animator.state).toBe('walk');
  });
  it('refuses a model without the needed sequences, or with a one-shot that loops', () => {
    const missing: ModelAnimation = { ...animation, sequences: animation.sequences.filter((s) => s.id !== ANIMATION_ID.jump) };
    expect(() => new CharacterAnimator(missing)).toThrow(/no sequence with animation id 38 \(jump\)/);
    const looping: ModelAnimation = { ...animation, sequences: animation.sequences.map((s) => (s.id === ANIMATION_ID.attack1H ? { ...s, loop: true } : s)) };
    expect(() => new CharacterAnimator(looping)).toThrow(/attack must not loop/);
    expect(() => new CharacterAnimator(animation).setLocomotion('fly' as never)).toThrow(/unknown locomotion/);
  });
});

describe('the character scene is animated', () => {
  const leftFootOf = (scene: ReturnType<typeof createModelScene>): number[] => {
    scene.render(16 / 9);
    return bonePivotPosition(MANNEQUIN_SKELETON, scene.instances[0]!.palette!, B.leftFoot);
  };
  it('reads the starting animation from the URL', () => {
    expect(parseSceneRequest('?scene=model&model=character&anim=run')).toMatchObject({ animation: 'run' });
    expect(parseSceneRequest('?scene=model&model=character&anim=off')).toMatchObject({ animation: 'off' });
    expect(parseSceneRequest('?scene=model&model=character&anim=fly')).toMatchObject({ animation: 'stand' });
  });
  it('the palette sent to the GPU follows the animation: walking moves the foot', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character', animation: 'walk', animTimeMs: 250 });
    expect(scene.models).toMatchObject({ characterState: 'walk', locomotion: 'walk', animation: { sequence: 'walk', elapsed: 250, frozen: true } });
    expect(leftFootOf(scene)[1]).toBeCloseTo(0.85 * Math.sin((25 * Math.PI) / 180), 4);
    scene.stepAnimation(500);
    expect(leftFootOf(scene)[1]).toBeCloseTo(-0.85 * Math.sin((25 * Math.PI) / 180), 4);
    scene.dispose();
  });
  it('key 9 goes stand → walk → run → stand', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character' });
    expect([scene.cycleLocomotion(), scene.cycleLocomotion(), scene.cycleLocomotion()]).toEqual(['walk', 'run', 'stand']);
    scene.dispose();
  });
  it('a jump lands by itself after the scene’s air time; an attack returns to the locomotion', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character', animation: 'run' });
    expect(scene.characterJump()).toBe(true);
    scene.advanceAnimation(200);
    expect(scene.models.characterState).toBe('jump');
    scene.advanceAnimation(CHARACTER_AIR_MS - 1);
    expect(scene.models.characterState).toBe('jump');
    scene.advanceAnimation(1);
    expect(scene.models.characterState).toBe('jumpEnd');
    scene.advanceAnimation(250);
    expect(scene.models.characterState).toBe('run');
    expect(scene.characterAttack()).toBe(true);
    expect(scene.models.characterState).toBe('attack');
    scene.advanceAnimation(500);
    expect(scene.models.characterState).toBe('run');
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 4, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Character animation: run · wants run (9) · Space jump · X attack');
    scene.dispose();
  });
  it('the sword follows the hand: raised with the forearm while standing, swung by the attack', () => {
    const tip = (scene: ReturnType<typeof createModelScene>): number[] => {
      scene.render(16 / 9);
      // The gear instance is the last one drawn; its matrix puts the sword's tip (0, 0.86, 0) in the world.
      const m = swordMatrix!;
      return [m[4]! * 0.86 + m[12]!, m[5]! * 0.86 + m[13]!, m[6]! * 0.86 + m[14]!];
    };
    let swordMatrix: number[] | null = null;
    const SWORD_INDICES = buildAttachedModel('sword').indices.length;
    const backend = new NullBackend();
    const draw = backend.draw.bind(backend);
    backend.draw = (call) => { if (call.indexCount === SWORD_INDICES) swordMatrix = Array.from((call.uniforms as Float32Array).subarray(16, 32)); return draw(call); };
    const scene = createModelScene(backend, { model: 'character', animation: 'stand', animTimeMs: 0 });
    scene.setEquipment(['ironSword']);
    const standing = tip(scene);
    expect(standing[2]).toBeGreaterThan(0.84 + 0.2); // tilted up by the raised forearm (20°)
    scene.characterAttack();
    scene.stepAnimation(150);
    const raised = tip(scene);
    // Wind-up: the hand is above the head, the blade points back over the shoulder.
    expect(raised[1]).toBeLessThan(-0.2);
    expect(raised[2]).toBeGreaterThan(1.2);
    scene.stepAnimation(150);
    const struck = tip(scene);
    expect(struck[1]).toBeGreaterThan(0.6); // well in front of the body
    scene.dispose();
  });
  it('with anim=off the character keeps its rest pose and has no state', () => {
    const scene = createModelScene(new NullBackend(), { model: 'character', animation: 'off' });
    expect(scene.models.characterState).toBeUndefined();
    expect(scene.characterJump()).toBe(false);
    expect(scene.cycleLocomotion()).toBe('stand');
    close0(leftFootOf(scene));
    scene.dispose();
  });
  const close0 = (foot: number[]): void => {
    expect(foot[1]).toBeCloseTo(0, 6);
    expect(foot[2]).toBeCloseTo(0.1, 6);
  };
});
