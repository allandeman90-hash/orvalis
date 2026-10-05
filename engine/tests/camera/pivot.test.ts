import { describe, expect, it } from 'vitest';
import { CAMERA_PIVOT_HEIGHT_RATIO, CAMERA_PIVOT_MAX_YARDS, CAMERA_PIVOT_MIN_YARDS, CAMERA_PIVOT_MOVE_SPEED_YARDS, CameraPivot, pivotHeightForModel } from '../../src/camera';
import { buildMannequinModel } from '../../src/character';
import { formatOverlay } from '../../src/debug';
import { NullBackend } from '../../src/renderer';
import { CAMERA_SCENE_CHARACTER, CAMERA_SCENE_CHARACTER_SCALES, createCameraScene } from '../../src/scenes/cameraScene';
import { parseSceneRequest } from '../../src/scenes/select';

describe('camera pivot (spec §191)', () => {
  it('the constants are the document’s', () => {
    expect([CAMERA_PIVOT_MIN_YARDS, CAMERA_PIVOT_MAX_YARDS, CAMERA_PIVOT_MOVE_SPEED_YARDS]).toEqual([5 / 6, 15, 1.2]);
    expect(CAMERA_PIVOT_MIN_YARDS).toBeCloseTo(0.833333, 6);
    expect(CAMERA_PIVOT_HEIGHT_RATIO).toBe(0.9); // ours
  });
  it('the height comes from the model: 0.9 of its height, clamped to 5/6 .. 15', () => {
    expect(pivotHeightForModel(2)).toBeCloseTo(1.8, 9);
    expect(pivotHeightForModel(0.5)).toBe(5 / 6); // a small creature: not lower than the minimum
    expect(pivotHeightForModel(0)).toBe(5 / 6);
    expect(pivotHeightForModel(40)).toBe(15); // a giant: not higher than the maximum
    expect(pivotHeightForModel(2, 2)).toBeCloseTo(1.8, 9); // the clamp scales with the units, the model is already in units
    expect(pivotHeightForModel(0.5, 2)).toBeCloseTo(5 / 3, 9);
    expect(() => pivotHeightForModel(-1)).toThrow(/model height/);
    expect(() => pivotHeightForModel(2, 0)).toThrow(/unitsPerYard/);
  });
  it('the first model places the pivot at once; a change is followed at 1.2 yards per second, without overshoot', () => {
    const pivot = new CameraPivot();
    pivot.setModelHeight(2);
    expect([pivot.height, pivot.targetHeight]).toEqual([1.8, 1.8]);
    pivot.setModelHeight(6); // a mount: 5.4
    expect([pivot.height, pivot.targetHeight]).toEqual([1.8, 5.4]);
    expect(pivot.update(1000)).toBeCloseTo(3.0, 9);
    expect(pivot.update(500)).toBeCloseTo(3.6, 9);
    expect(pivot.update(2000)).toBe(5.4); // 1.8 left, 2.4 available
    expect(pivot.update(1000)).toBe(5.4);
    pivot.setModelHeight(2);
    expect(pivot.update(250)).toBeCloseTo(5.1, 9); // back down at the same speed
  });
  it('a new model while moving is followed from where the pivot is', () => {
    const pivot = new CameraPivot();
    pivot.setModelHeight(2);
    pivot.setModelHeight(10);
    pivot.update(1000);
    pivot.setModelHeight(1);
    expect(pivot.targetHeight).toBeCloseTo(0.9, 9);
    expect(pivot.update(1000)).toBeCloseTo(1.8, 9); // 3.0 − 1.2
  });
  it('rejects a negative time step', () => {
    expect(() => new CameraPivot().update(-1)).toThrow(/time step/);
    expect(() => new CameraPivot(0)).toThrow(/unitsPerYard/);
  });
});

describe('scene=camera: the pivot follows the character’s size', () => {
  const mesh = buildMannequinModel();
  let top = 0;
  for (let v = 0; v < mesh.vertexCount; v++) top = Math.max(top, mesh.positions[v * 3 + 2]!);
  it('reads &size= from the URL', () => {
    expect(CAMERA_SCENE_CHARACTER_SCALES).toEqual([0.5, 1, 3]);
    expect(parseSceneRequest('?scene=camera&size=3')).toMatchObject({ characterScale: 3 });
    expect(parseSceneRequest('?scene=camera&size=1')).toMatchObject({ characterScale: 0.5 });
    expect(parseSceneRequest('?scene=camera&size=9')).toMatchObject({ characterScale: 1 });
  });
  it('at the start the pivot is at 0.9 of the mannequin’s height above its feet', () => {
    const scene = createCameraScene(new NullBackend(), {});
    expect(scene.cameraStats.characterHeight).toBeCloseTo(top, 6);
    expect(scene.cameraStats.pivotHeight).toBeCloseTo(top * 0.9, 6);
    expect(scene.cameraStats.pivot[2]).toBeCloseTo(CAMERA_SCENE_CHARACTER[2] + top * 0.9, 6);
    scene.dispose();
  });
  it('growing the character: it is drawn larger at once, the pivot rises at 1.2 per second and the camera with it', () => {
    const scene = createCameraScene(new NullBackend(), { pitchDegrees: 0 });
    const start = scene.cameraStats.pivotHeight;
    scene.setCharacterScale(3);
    scene.render(16 / 9);
    expect(scene.cameraStats).toMatchObject({ characterScale: 3, pivotHeight: start });
    expect(scene.cameraStats.pivotTargetHeight).toBeCloseTo(top * 3 * 0.9, 6);
    expect(Math.hypot(scene.characterMatrix[0]!, scene.characterMatrix[1]!, scene.characterMatrix[2]!)).toBeCloseTo(3, 6);
    expect(scene.characterMatrix[10]).toBeCloseTo(3, 6);
    scene.advance(1000);
    expect(scene.cameraStats.pivotHeight).toBeCloseTo(start + 1.2, 6);
    expect(scene.cameraStats.eye[2]).toBeCloseTo(start + 1.2, 5); // pitch 0: the eye is at the pivot's height
    scene.advance(60000);
    expect(scene.cameraStats.pivotHeight).toBeCloseTo(top * 2.7, 6);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 1, triangles: 1, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, camera: scene.cameraStats }).find((l) => l.startsWith('Pivot:'))).toBe(`Pivot: ${(top * 2.7).toFixed(2)} → ${(top * 2.7).toFixed(2)} above the feet · character × 3 (1–3), ${(top * 3).toFixed(2)} tall · character opacity 100 %`);
    scene.dispose();
  });
  it('a very small character keeps the minimum pivot height, 5/6', () => {
    const scene = createCameraScene(new NullBackend(), { characterScale: 0.25 });
    expect(top * 0.25 * 0.9).toBeLessThan(5 / 6);
    expect(scene.cameraStats.pivotHeight).toBe(5 / 6);
    expect(() => scene.setCharacterScale(0)).toThrow(/character scale/);
    scene.dispose();
  });
});
