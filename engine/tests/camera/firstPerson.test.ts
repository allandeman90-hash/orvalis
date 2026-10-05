import { describe, expect, it } from 'vitest';
import { FIRST_PERSON_FADE_YARDS, FIRST_PERSON_HIDDEN_YARDS, firstPersonAlpha } from '../../src/camera';
import { buildMannequinModel, mannequinTexture } from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { mat4 } from '../../src/math';
import { ModelRenderer } from '../../src/modelRender';
import { NullBackend } from '../../src/renderer';
import { createCameraScene } from '../../src/scenes/cameraScene';

describe('first-person fade (spec §194)', () => {
  it('the constants are the document’s', () => {
    expect([FIRST_PERSON_FADE_YARDS, FIRST_PERSON_HIDDEN_YARDS]).toEqual([1.8315, 0.00278]);
  });
  it('alpha = (1 − cos(π × D / 1.8315)) / 2 with D = camera distance − near clip', () => {
    const near = 0.1;
    expect(firstPersonAlpha(near + 1.8315 / 2, near)).toBeCloseTo(0.5, 9); // half the window: half opaque
    expect(firstPersonAlpha(near + 1.8315 / 3, near)).toBeCloseTo(0.25, 9);
    expect(firstPersonAlpha(near + (1.8315 * 2) / 3, near)).toBeCloseTo(0.75, 9);
    expect(firstPersonAlpha(1, 0)).toBeCloseTo((1 - Math.cos(Math.PI / 1.8315)) / 2, 12);
  });
  it('fully opaque from 1.8315 on; completely hidden at 0.00278 and below', () => {
    expect(firstPersonAlpha(0.1 + 1.8315, 0.1)).toBe(1);
    expect(firstPersonAlpha(15, 0.1)).toBe(1);
    expect(firstPersonAlpha(0.00278, 0)).toBe(0); // exactly at the threshold
    expect(firstPersonAlpha(0.1, 0.1)).toBe(0);
    expect(firstPersonAlpha(0, 0.1)).toBe(0); // nearer than the near clip
    const justAbove = firstPersonAlpha(0.1 + 0.003, 0.1);
    expect(justAbove).toBeGreaterThan(0);
    expect(justAbove).toBeLessThan(1e-4);
  });
  it('rises steadily: the nearer the camera, the more transparent the character', () => {
    let last = -1;
    for (let d = 0; d <= 2; d += 0.01) {
      const alpha = firstPersonAlpha(d, 0);
      expect(alpha).toBeGreaterThanOrEqual(last);
      last = alpha;
    }
    expect(last).toBe(1);
  });
  it('unitsPerYard scales the window', () => {
    expect(firstPersonAlpha(1.8315, 0, 2)).toBeCloseTo(0.5, 9);
    expect(() => firstPersonAlpha(-1, 0)).toThrow(/camera distance/);
    expect(() => firstPersonAlpha(1, 0, 0)).toThrow(/unitsPerYard/);
  });
});

describe('ModelRenderer: a partly transparent instance', () => {
  function draw(alpha: number | undefined) {
    const backend = new NullBackend(), renderer = new ModelRenderer(backend), identity = mat4.identity(mat4.create());
    const model = renderer.addModel(buildMannequinModel(), mannequinTexture());
    const seen: Array<{ blend: string; alpha: number }> = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      seen.push({ blend: backend.pipelineState(call.pipeline)!.blend, alpha: (call.uniforms as Float32Array)[62]! });
      return original(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ model, matrix: identity, ...(alpha === undefined ? {} : { alpha }) }], { debugMode: 'lit' });
    backend.endFrame();
    renderer.dispose();
    return { seen, result };
  }
  it('alpha 1 (or none): drawn as its materials say — opaque', () => {
    expect(draw(undefined).seen.every((s) => s.blend === 'opaque' && s.alpha === 1)).toBe(true);
    expect(draw(1).seen.every((s) => s.blend === 'opaque')).toBe(true);
  });
  it('alpha below 1: every submesh is drawn blended, with that alpha', () => {
    const { seen, result } = draw(0.4);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.blend === 'alpha' && Math.abs(s.alpha - 0.4) < 1e-6)).toBe(true);
    expect(result.draws).toBe(draw(1).result.draws);
  });
  it('alpha 0: not drawn at all', () => {
    expect(draw(0).result.draws).toBe(0);
  });
});

describe('scene=camera: zooming into first person', () => {
  const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
  const line = (scene: ReturnType<typeof createCameraScene>) => formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Pivot:'))!;
  it('from afar the character is opaque; inside the window it fades; at the pivot it is not drawn', () => {
    const backend = new NullBackend(), scene = createCameraScene(backend, { distance: 8 });
    scene.advance(0);
    const withCharacter = scene.render(16 / 9).drawCalls;
    expect(scene.cameraStats).toMatchObject({ characterAlpha: 1, firstPerson: false });
    scene.zoom(-7); // → 1
    scene.advance(5000);
    expect(scene.cameraStats.distance).toBe(1);
    expect(scene.cameraStats.characterAlpha).toBeCloseTo(firstPersonAlpha(1, 0.1), 9);
    expect(scene.cameraStats.characterAlpha).toBeGreaterThan(0.4);
    expect(scene.cameraStats.characterAlpha).toBeLessThan(0.6);
    expect(scene.render(16 / 9).drawCalls).toBe(withCharacter); // still drawn, blended
    expect(line(scene)).toContain(`character opacity ${Math.round(firstPersonAlpha(1, 0.1) * 100)} %`);
    scene.zoom(-1); // → 0: first person
    scene.advance(5000);
    expect(scene.cameraStats).toMatchObject({ distance: 0, requestedDistance: 0, characterAlpha: 0, firstPerson: true });
    expect(scene.render(16 / 9).drawCalls).toBeLessThan(withCharacter); // the character is no longer submitted
    expect(line(scene)).toContain('FIRST PERSON (character hidden)');
    // The eye is at the pivot (a hair behind it), looking the same way.
    const { eye, pivot } = scene.cameraStats;
    expect(Math.hypot(eye[0] - pivot[0], eye[1] - pivot[1], eye[2] - pivot[2])).toBeCloseTo(1e-3, 5);
    scene.zoom(3);
    scene.advance(5000);
    expect(scene.cameraStats).toMatchObject({ distance: 3, characterAlpha: 1, firstPerson: false });
    scene.dispose();
  });
  it('pressed against a wall, the camera comes close and the character fades by the ARM drawn, not by the zoom', () => {
    // Looking up from below: the ground stops the arm close to the character.
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 0, pitchDegrees: -80, distance: 8 });
    scene.advance(0);
    expect(scene.cameraStats.blocked).toBe(true);
    expect(scene.cameraStats.distance).toBeLessThan(1.8);
    expect(scene.cameraStats.zoomDistance).toBe(8);
    expect(scene.cameraStats.characterAlpha).toBeCloseTo(firstPersonAlpha(scene.cameraStats.distance, 0.1), 9);
    expect(scene.cameraStats.characterAlpha).toBeLessThan(1);
    scene.dispose();
  });
});
