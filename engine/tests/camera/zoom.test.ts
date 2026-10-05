import { describe, expect, it } from 'vitest';
import { CAMERA_DISTANCE_HARD_CAP_YARDS, CAMERA_DISTANCE_MAX_FACTOR, CAMERA_DISTANCE_MAX_YARDS, CAMERA_DISTANCE_MIN_YARDS, CAMERA_DISTANCE_MOVE_SPEED_YARDS, CAMERA_ZOOM_STEP_YARDS, CameraZoom } from '../../src/camera';
import { NullBackend } from '../../src/renderer';
import { createCameraScene } from '../../src/scenes/cameraScene';

describe('camera zoom (spec §187)', () => {
  it('the constants are the document’s', () => {
    expect([CAMERA_DISTANCE_MAX_YARDS, CAMERA_DISTANCE_MAX_FACTOR, CAMERA_DISTANCE_HARD_CAP_YARDS, CAMERA_ZOOM_STEP_YARDS, CAMERA_DISTANCE_MOVE_SPEED_YARDS]).toEqual([15, 1, 50, 1, 8.33]);
    expect(CAMERA_DISTANCE_MIN_YARDS).toBe(0); // ours: all the way to first person
  });
  it('starts at the largest distance, 15 × 1.0, unless told otherwise', () => {
    const zoom = new CameraZoom();
    expect([zoom.requestedDistance, zoom.actualDistance, zoom.maxDistance, zoom.minDistance]).toEqual([15, 15, 15, 0]);
    expect(new CameraZoom({ distance: 8 }).actualDistance).toBe(8);
    expect(new CameraZoom({ distance: 99 }).actualDistance).toBe(15);
    expect(new CameraZoom({ distance: 0 }).actualDistance).toBe(0);
    expect(new CameraZoom({ distance: -3 }).actualDistance).toBe(0);
  });
  it('the wheel moves the REQUESTED distance by 1-yard steps; the actual one does not jump', () => {
    const zoom = new CameraZoom({ distance: 8 });
    zoom.wheel(-120);
    zoom.wheel(-3); // one step per event, whatever the delta
    expect([zoom.requestedDistance, zoom.actualDistance]).toEqual([6, 8]);
    zoom.wheel(100);
    expect(zoom.requestedDistance).toBe(7);
    zoom.wheel(0);
    expect(zoom.requestedDistance).toBe(7);
  });
  it('the actual distance approaches at 8.33 yards per second, and stops exactly on the request', () => {
    const zoom = new CameraZoom({ distance: 15 });
    zoom.zoomBy(-10);
    expect(zoom.update(100)).toBeCloseTo(15 - 0.833, 9);
    expect(zoom.update(500)).toBeCloseTo(15 - 0.833 - 4.165, 9);
    expect(zoom.update(1000)).toBe(5); // 5.002 left to go, 8.33 available: no overshoot
    expect(zoom.update(1000)).toBe(5);
    zoom.zoomBy(2);
    expect(zoom.update(120)).toBeCloseTo(5 + 0.9996, 9);
    // 10 yards take 10 / 8.33 seconds.
    const far = new CameraZoom({ distance: 15 });
    far.zoomBy(-10);
    let ms = 0;
    while (far.actualDistance !== 5) {
      far.update(1);
      ms++;
    }
    expect(ms).toBe(Math.ceil((10 / 8.33) * 1000));
  });
  it('a new request while moving is followed from where the camera is', () => {
    const zoom = new CameraZoom({ distance: 10 });
    zoom.zoomBy(-5);
    zoom.update(240); // 2 yards done (1.9992)
    zoom.zoomBy(8);
    expect(zoom.requestedDistance).toBe(13);
    const before = zoom.actualDistance;
    expect(zoom.update(100)).toBeCloseTo(before + 0.833, 9);
  });
  it('limits: 0 at the nearest (first person), min(max × factor, 50) at the farthest', () => {
    const zoom = new CameraZoom({ distance: 3 });
    zoom.zoomBy(-10);
    expect(zoom.requestedDistance).toBe(0);
    zoom.zoomBy(100);
    expect(zoom.requestedDistance).toBe(15);
    expect(new CameraZoom({ distanceMaxFactor: 2 }).maxDistance).toBe(30);
    expect(new CameraZoom({ distanceMaxFactor: 4 }).maxDistance).toBe(50); // 60 asked for: the absolute cap
    expect(new CameraZoom({ distanceMaxYards: 80 }).maxDistance).toBe(50);
  });
  it('unitsPerYard scales the limits, the step and the speed', () => {
    const zoom = new CameraZoom({ unitsPerYard: 2 });
    expect([zoom.minDistance, zoom.maxDistance, zoom.step, zoom.moveSpeed]).toEqual([0, 30, 2, 16.66]);
  });
  it('rejects bad values', () => {
    expect(() => new CameraZoom({ distanceMaxFactor: 0 })).toThrow(/> 0/);
    expect(() => new CameraZoom({ distance: NaN })).toThrow(/finite/);
    expect(() => new CameraZoom().update(-1)).toThrow(/time step/);
    expect(() => new CameraZoom().zoomBy(NaN)).toThrow(/finite/);
  });
});

describe('scene=camera: zoom', () => {
  it('wheel steps are requested at once and reached over time; the eye stays on the same line through the pivot', () => {
    const scene = createCameraScene(new NullBackend(), { yawDegrees: 0, pitchDegrees: 0 });
    const pivot = scene.cameraStats.pivot;
    scene.zoom(-3);
    expect(scene.cameraStats).toMatchObject({ distance: 8, requestedDistance: 5, maxDistance: 15 });
    scene.advance(120);
    expect(scene.cameraStats.distance).toBeCloseTo(8 - 0.9996, 9);
    expect(scene.cameraStats.eye[1]).toBeCloseTo(pivot[1] - (8 - 0.9996), 5);
    expect(scene.cameraStats.eye[0]).toBeCloseTo(pivot[0], 5);
    expect(scene.cameraStats.eye[2]).toBeCloseTo(pivot[2], 5);
    scene.advance(1000);
    expect(scene.cameraStats.distance).toBe(5);
    scene.zoom(40);
    scene.advance(5000);
    expect(scene.cameraStats).toMatchObject({ distance: 15, requestedDistance: 15 });
    scene.dispose();
  });
});
