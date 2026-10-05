import { describe, expect, it } from 'vitest';
import { viewProjectionMatrix } from '../../src/camera';
import { DepthRange, mat4 } from '../../src/math';
import { modelBounds, RibbonTrail, ribbonTexture, TREE_RIBBON, RIBBON_VERTEX_FLOATS, ParticleSystem, particleTexture, TREE_PARTICLE_EMITTERS, PARTICLE_VERTEX_FLOATS, ATTACHMENT_ID, findAttachment, ORNAMENT, TREE_ATTACHMENTS, ALPHA_KEY_REFERENCE, buildSwatchModel, buildTreeModel, computeBoneMatrices, SWATCHES, swatchTexture, MODEL_VERTEX_BYTES, samplePoses, treeAnimation, TREE_POSES, TREE_SKELETON, treeTexture } from '../../src/model';
import { ModelRenderer, ParticleRenderer, RibbonRenderer } from '../../src/modelRender';
import { MODEL_MATERIAL_OFFSET_FLOATS, MODEL_PALETTE_BONES, MODEL_PALETTE_OFFSET_FLOATS, MODEL_SHADER, MODEL_UNIFORM_BYTES, NullBackend } from '../../src/renderer';
import { createModelScene, placementMatrix, ROW_BEARINGS, ROW_DISTANCES } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';
import { DEFAULT_TERRAIN_LIGHTING } from '../../src/terrainRender';
import { formatOverlay } from '../../src/debug';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 6): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits);
};
const identity = mat4.identity(mat4.create());
const tree = buildTreeModel();

function setup() {
  const backend = new NullBackend();
  const renderer = new ModelRenderer(backend);
  const id = renderer.addModel(tree, treeTexture('solid'));
  return { backend, renderer, id };
}
function drawsOf(backend: NullBackend) {
  return backend.events.filter((e) => e.type === 'draw').map((e) => {
    if (e.type !== 'draw') throw new Error('unreachable');
    return e;
  });
}

describe('placementMatrix', () => {
  it('turns around z, scales uniformly, then translates', () => {
    const m = placementMatrix(10, 20, 30, 90, 2);
    // Model +x → world +y, model +y → world −x, model +z → world +z; all × 2.
    close(m, [0, 2, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 10, 20, 30, 1]);
    close(placementMatrix(0, 0, 0, 0, 1), identity);
    expect(() => placementMatrix(0, 0, 0, 0, 0)).toThrow(/scale/);
    expect(() => placementMatrix(Number.NaN, 0, 0, 0, 1)).toThrow(/finite/);
  });
});

describe('ModelRenderer (P4.1)', () => {
  it('uploads one packed vertex buffer, one index buffer and one mip-mapped texture per model', () => {
    const { backend, renderer, id } = setup();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount, renderer.modelCount]).toEqual([2, 1, 1, 1]);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ model: id, matrix: identity }], { debugMode: 'lit' });
    expect(backend.endFrame()).toEqual({ drawCalls: 1, triangles: 44 });
    expect(result).toEqual({ instances: 1, triangles: 44, draws: 1 });
    const [draw] = drawsOf(backend);
    expect((backend.bufferData(draw!.call.vertexBuffer) as Uint8Array).byteLength).toBe(tree.vertexCount * MODEL_VERTEX_BYTES);
    expect(backend.bufferData(draw!.call.vertexBuffer)).toBeInstanceOf(Uint8Array);
    expect(draw!.call.indexCount).toBe(132);
    expect(backend.pipelineState(draw!.call.pipeline)).toMatchObject({ depthTest: true, depthWrite: true, cullMode: 'back', blend: 'opaque', textureCount: 1, uniformBytes: MODEL_UNIFORM_BYTES });
    expect(backend.textureInfo(draw!.call.textures![0]!)).toMatchObject({ width: 64, height: 64, wrap: 'repeat' });
    expect(backend.textureInfo(draw!.call.textures![0]!).levels.length).toBe(7);
  });

  it('gives each instance its own matrices: mvp = view-projection × model', () => {
    const { backend, renderer, id } = setup();
    const camera = { eye: new Float32Array([5, -20, 8]), target: new Float32Array([0, 0, 3.5]), up: new Float32Array([0, 0, 1]), fovY: 1, near: 0.1, far: 100 };
    const vp = viewProjectionMatrix(mat4.create(), camera, 16 / 9, DepthRange.ZeroToOne);
    const a = placementMatrix(0, 0, 0, 0, 1), b = placementMatrix(6, 2, 0, 40, 0.8);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(renderer.draw(vp, [{ model: id, matrix: a }, { model: id, matrix: b }], { debugMode: 'lit' })).toEqual({ instances: 2, triangles: 88, draws: 2 });
    backend.endFrame();
    const draws = drawsOf(backend);
    expect(draws).toHaveLength(2);
    close(draws[0]!.call.uniforms!.slice(0, 16), vp);
    close(draws[0]!.call.uniforms!.slice(16, 32), a);
    close(draws[1]!.call.uniforms!.slice(0, 16), mat4.multiply(mat4.create(), vp, b), 4);
    close(draws[1]!.call.uniforms!.slice(16, 32), b);
    expect(draws[0]!.call.vertexBuffer).toBe(draws[1]!.call.vertexBuffer); // the mesh is shared
  });

  it('lights models like the terrain, takes the fog, and passes the debug mode', () => {
    const { backend, renderer, id } = setup();
    const uniforms = (options: Parameters<ModelRenderer['draw']>[2]): number[] => {
      backend.events.length = 0;
      backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
      renderer.draw(identity, [{ model: id, matrix: identity }], options);
      backend.endFrame();
      return Array.from(drawsOf(backend)[0]!.call.uniforms!);
    };
    const d = DEFAULT_TERRAIN_LIGHTING;
    let u = uniforms({ debugMode: 'lit' });
    close(u.slice(32, 44), [...d.toLight, 0, ...d.ambient, 0, ...d.diffuse, 0]);
    close(u.slice(44, 56), new Array<number>(12).fill(0)); // no fog configured
    expect(u[56]).toBe(0);
    renderer.setLighting({ toLight: [0, 3, 4], ambient: [0.1, 0.2, 0.3], diffuse: [1, 0.9, 0.8], shadowFactor: 0.5 });
    renderer.setFog({ color: [0.5, 0.6, 0.7], start: 10, end: 60 });
    u = uniforms({ debugMode: 'weights', eye: [1, 2, 3] });
    close(u.slice(32, 44), [0, 0.6, 0.8, 0, 0.1, 0.2, 0.3, 0, 1, 0.9, 0.8, 0]);
    close(u.slice(44, 54), [1, 2, 3, 0, 0.5, 0.6, 0.7, 0, 10, 1 / 50]);
    expect(u[56]).toBe(2);
    expect(uniforms({ debugMode: 'normals' })[56]).toBe(1);
    expect(uniforms({ debugMode: 'bones' })[56]).toBe(3);
    close(uniforms({ debugMode: 'lit' }).slice(52, 54), [0, 0]); // no eye → no fog
    expect(() => renderer.setFog({ color: [0, 0, 0], start: 5, end: 5 })).toThrow(/start < end/);
  });

  it('refuses an invalid mesh and an unknown model, and frees everything', () => {
    const { backend, renderer, id } = setup();
    expect(() => renderer.addModel({ ...tree, boneCount: 2 }, treeTexture('solid'))).toThrow(/refers to bone 2/);
    expect(backend.liveBufferCount).toBe(2); // nothing was uploaded for the refused mesh
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(() => renderer.draw(identity, [{ model: 99 as typeof id, matrix: identity }], { debugMode: 'lit' })).toThrow(/unknown model 99/);
    backend.endFrame();
    expect(renderer.removeModel(id)).toBe(true);
    expect(renderer.removeModel(id)).toBe(false);
    expect([backend.liveBufferCount, backend.liveTextureCount]).toEqual([0, 0]);
    renderer.dispose();
    expect(backend.livePipelineCount).toBe(0);
  });
});

describe('GPU skinning: the matrix palette (P4.5)', () => {
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const paletteOf = (uniforms: ArrayLike<number> | undefined, bones: number): number[] => Array.from((uniforms as Float32Array).subarray(MODEL_PALETTE_OFFSET_FLOATS, MODEL_PALETTE_OFFSET_FLOATS + bones * 16));

  it('the uniform block is 256 bytes of scene and material values plus 128 matrices, in a size every WebGL2 accepts', () => {
    expect(MODEL_PALETTE_OFFSET_FLOATS * 4).toBe(256);
    expect(MODEL_UNIFORM_BYTES).toBe(256 + MODEL_PALETTE_BONES * 64);
    expect(MODEL_UNIFORM_BYTES).toBeLessThanOrEqual(16384);
    expect(MODEL_UNIFORM_BYTES % 16).toBe(0);
  });

  it('declares the same palette in WGSL and in both GLSL stages', () => {
    expect(MODEL_SHADER.wgsl).toContain(`bones: array<mat4x4<f32>, ${MODEL_PALETTE_BONES}>`);
    expect(MODEL_SHADER.glslVertex).toContain(`mat4 u_bones[${MODEL_PALETTE_BONES}];`);
    expect(MODEL_SHADER.glslFragment).toContain(`mat4 u_bones[${MODEL_PALETTE_BONES}];`);
  });

  it('without a palette an instance is drawn at rest: identity matrices for its bones', () => {
    const { backend, renderer, id } = setup();
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, [{ model: id, matrix: identity }], { debugMode: 'lit' });
    backend.endFrame();
    const draw = drawsOf(backend)[0]!;
    expect((draw.call.uniforms as Float32Array).byteLength).toBe(MODEL_UNIFORM_BYTES);
    expect(paletteOf(draw.call.uniforms, 3)).toEqual([...IDENTITY, ...IDENTITY, ...IDENTITY]);
    renderer.dispose();
  });

  it('sends each instance its own palette, right after the other uniforms', () => {
    const { backend, renderer, id } = setup();
    const bend = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend);
    const seen: number[][] = [];
    // The uniform array is reused between draws: copy what each draw was given at the time it was issued.
    const draw = backend.draw.bind(backend);
    backend.draw = (call) => {
      seen.push(paletteOf(call.uniforms, 3));
      return draw(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, [{ model: id, matrix: identity, palette: bend }, { model: id, matrix: identity }], { debugMode: 'lit' });
    backend.endFrame();
    expect(seen[0]).toEqual(Array.from(bend));
    expect(seen[1]).toEqual([...IDENTITY, ...IDENTITY, ...IDENTITY]);
    renderer.dispose();
  });

  it('rejects a palette of the wrong size and a model with more bones than the palette holds', () => {
    const { backend, renderer, id } = setup();
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(() => renderer.draw(identity, [{ model: id, matrix: identity, palette: new Float32Array(32) }], { debugMode: 'lit' })).toThrow(/palette of 48 floats \(got 32\)/);
    backend.endFrame();
    expect(() => renderer.addModel({ ...tree, boneCount: MODEL_PALETTE_BONES + 1 }, treeTexture('solid'))).toThrow(/129 bones, the palette holds 128/);
    renderer.dispose();
  });

  it('the scene gives every instance the palette of the pose being shown, and updates it as the animation runs', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { layout: 'grove', pose: 'bend' });
    scene.render(16 / 9);
    const bend = Array.from(computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend));
    for (const instance of scene.instances) close(instance.palette!, bend);
    scene.dispose();

    const animated = createModelScene(new NullBackend(), { pose: 'sway', animTimeMs: 0 });
    animated.stepAnimation(500);
    animated.render(16 / 9);
    const animation = treeAnimation();
    close(animated.instances[0]!.palette!, computeBoneMatrices(TREE_SKELETON, samplePoses(animation.boneTracks, 500, { time: 500, durations: animation.globalSequences })));
    animated.dispose();
  });
});

describe('scene=model', () => {
  it('is selected by the URL with its options', () => {
    expect(parseSceneRequest('?scene=model')).toEqual({ scene: 'model', skeleton: false, pose: 'rest', model: 'tree', look: { hair: 1, facialHair: 1, gloves: 1, boots: 1 }, skin: { skinColor: 0, faceType: 0, hairColor: 0, underwear: true }, dither: true, outfit: 0, animation: 'stand', attach: false, particles: 'off', ribbon: false, hiddenGeosets: [], layout: 'single', distanceFade: true, debugMode: 'lit', palette: 'procedural', pitchDegrees: 15, headingDegrees: 30, zoom: 1 });
    expect(parseSceneRequest('?scene=model&skeleton=on&pose=bend')).toMatchObject({ skeleton: true, pose: 'bend' });
    expect(parseSceneRequest('?scene=model&pose=dance')).toMatchObject({ pose: 'rest' });
    expect(parseSceneRequest('?scene=model&models=grove&modelDebug=bones&textures=solid&pitch=-40&heading=200&zoom=2')).toEqual({ scene: 'model', skeleton: false, pose: 'rest', model: 'tree', look: { hair: 1, facialHair: 1, gloves: 1, boots: 1 }, skin: { skinColor: 0, faceType: 0, hairColor: 0, underwear: true }, dither: true, outfit: 0, animation: 'stand', attach: false, particles: 'off', ribbon: false, hiddenGeosets: [], layout: 'grove', distanceFade: true, debugMode: 'bones', palette: 'solid', pitchDegrees: -40, headingDegrees: 200, zoom: 2 });
    expect(parseSceneRequest('?scene=model&pitch=95&modelDebug=x&models=forest')).toMatchObject({ pitchDegrees: 15, debugMode: 'lit', layout: 'single' });
    expect(Object.is(parseSceneRequest('?scene=model&pitch=0').scene === 'model' && (parseSceneRequest('?scene=model&pitch=0') as { pitchDegrees: number }).pitchDegrees, 0)).toBe(true);
  });

  it('draws one tree, or a grove of three sharing one mesh', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, {});
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 1, triangles: 44 });
    expect(scene.models).toEqual({ models: 1, instances: 1, triangles: 44, vertices: 68, debugMode: 'lit', bones: 3, skeleton: false, pose: 'rest', attached: 0, particles: 'off', liveParticles: 0, ribbon: false, ribbonEdges: 0 });
    const grove = createModelScene(new NullBackend(), { layout: 'grove' });
    expect(grove.render(16 / 9)).toEqual({ drawCalls: 3, triangles: 132 });
    expect(grove.models).toMatchObject({ models: 1, instances: 3 });
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('places the camera from pitch and heading, looking at the middle of the tree', () => {
    const scene = createModelScene(new NullBackend(), { pitchDegrees: 0, headingDegrees: 90 });
    close(scene.camera.target, [0, 0, 3.5]);
    expect(scene.camera.eye[1]).toBeCloseTo(0, 5); // looking east: the eye is due west of the tree
    expect(scene.camera.eye[0]!).toBeLessThan(-5);
    expect(scene.camera.eye[2]).toBeCloseTo(3.5, 5);
    const below = createModelScene(new NullBackend(), { pitchDegrees: -60 });
    expect(below.camera.eye[2]!).toBeLessThan(0);
    const near = createModelScene(new NullBackend(), { pitchDegrees: 0, headingDegrees: 90, zoom: 2 });
    expect(near.camera.eye[0]).toBeCloseTo(scene.camera.eye[0]! / 2, 4);
    expect(() => createModelScene(new NullBackend(), { pitchDegrees: 90 })).toThrow(/pitch/);
  });

  it('cycles the debug views and reports them', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, {});
    expect([scene.cycleDebugMode(), scene.cycleDebugMode(), scene.cycleDebugMode(), scene.cycleDebugMode()]).toEqual(['normals', 'weights', 'bones', 'lit']);
    scene.cycleDebugMode();
    scene.render(1);
    const draw = backend.events.find((e) => e.type === 'draw');
    if (draw?.type !== 'draw') throw new Error('no draw');
    expect(draw.call.uniforms![56]).toBe(1);
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 17, drawCalls: 1, triangles: 44, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Models: 1 model · 1 instance(s) · 68 vertices · 44 triangles · view normals (M)');
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Skeleton: 3 bones · lines off (N) · pose rest (J) · attached 0 (H)');
  });

  it('draws the skeleton as lines over each instance, never hidden by the model, and follows the pose', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { layout: 'grove', skeleton: true });
    expect(scene.render(16 / 9).drawCalls).toBe(3 + 3);
    const lines = backend.events.filter((e) => e.type === 'draw' && backend.pipelineState(e.call.pipeline)?.topology === 'line-list');
    expect(lines).toHaveLength(3);
    const first = lines[0]!;
    if (first.type !== 'draw') throw new Error('no draw');
    expect(backend.pipelineState(first.call.pipeline)).toMatchObject({ depthTest: false, depthWrite: false });
    expect(first.call.vertexCount).toBe(22);
    const rest = Array.from(backend.bufferData(first.call.vertexBuffer) as Float32Array);
    // Lines come after the models.
    const draws = backend.events.filter((e) => e.type === 'draw');
    expect(draws.indexOf(first)).toBe(3);
    // J: bend. The line buffer is replaced (the old one freed), the top joint has moved.
    const buffers = backend.liveBufferCount;
    expect(scene.cyclePose()).toBe('bend');
    expect(backend.liveBufferCount).toBe(buffers);
    backend.events.length = 0;
    scene.render(16 / 9);
    const bent = backend.events.find((e) => e.type === 'draw' && backend.pipelineState(e.call.pipeline)?.topology === 'line-list');
    if (bent?.type !== 'draw') throw new Error('no draw');
    expect(Array.from(backend.bufferData(bent.call.vertexBuffer) as Float32Array)).not.toEqual(rest);
    expect(scene.models).toMatchObject({ skeleton: true, pose: 'bend', bones: 3 });
    // N: lines off.
    expect(scene.toggleSkeleton()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(3);
    expect(scene.cyclePose()).toBe('sway');
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  /** Skeleton line vertices of the frame just drawn; the upper link's far end (bone 2's pivot) is vertex 5 → floats 30..32. */
  const topJoint = (backend: NullBackend, scene: ReturnType<typeof createModelScene>): number[] => {
    backend.events.length = 0;
    scene.render(16 / 9);
    const draw = backend.events.find((e) => e.type === 'draw' && backend.pipelineState(e.call.pipeline)?.topology === 'line-list');
    if (draw?.type !== 'draw') throw new Error('no skeleton draw');
    const data = backend.bufferData(draw.call.vertexBuffer) as Float32Array;
    const links: number[][] = [];
    for (let v = 0; v < data.length / 6; v += 2) if (data[v * 6 + 3] === 1 && data[v * 6 + 4] === 1 && data[v * 6 + 5] === 0) links.push([...data.subarray((v + 1) * 6, (v + 1) * 6 + 3)]);
    return links[1]!; // links: [lower ← trunk, top ← lower]; each ends on the child's pivot
  };
  const RAD = Math.PI / 180;
  /** Where bone 2's pivot goes when both foliage bones lean `degrees` around +x and the top bobs up by `bob`. */
  const predicted = (degrees: number, bob: number): number[] => [0, -(1.8 + bob) * Math.sin(degrees * RAD), 2.2 + (1.8 + bob) * Math.cos(degrees * RAD)];

  it('reads the animation options from the URL', () => {
    expect(parseSceneRequest('?scene=model&pose=sway&animTime=1000')).toMatchObject({ pose: 'sway', animTimeMs: 1000 });
    expect(parseSceneRequest('?scene=model&pose=gust')).toMatchObject({ pose: 'gust', animTimeMs: undefined });
    for (const bad of ['-5', '1.5', 'abc', '99999999']) expect(parseSceneRequest(`?scene=model&animTime=${bad}`)).toMatchObject({ animTimeMs: undefined });
  });

  it('frozen at 1000 ms, the sway puts the top where the tracks say (20° lean, bob at its highest)', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { skeleton: true, pose: 'sway', animTimeMs: 1000 });
    close(topJoint(backend, scene), predicted(20, 0.3), 5);
    expect(scene.models.animation).toEqual({ sequence: 'sway', elapsed: 1000, previous: null, lambda: 1, globalTime: 1000, frozen: true });
    // Frozen: real time does nothing…
    scene.advanceAnimation(500);
    close(topJoint(backend, scene), predicted(20, 0.3), 5);
    // …a manual step does: 1500 ms → 10° lean, bob half-way down.
    scene.stepAnimation(500);
    close(topJoint(backend, scene), predicted(10, 0.15), 5);
    scene.dispose();
  });

  it('not frozen, the animation follows the time given each frame and replaces its line buffer without leaking', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { skeleton: true, pose: 'sway' });
    close(topJoint(backend, scene), predicted(0, 0), 5);
    const buffers = backend.liveBufferCount;
    for (let frame = 0; frame < 50; frame++) {
      scene.advanceAnimation(10);
      scene.render(16 / 9);
    }
    close(topJoint(backend, scene), predicted(10, 0.15), 4);
    expect(backend.liveBufferCount).toBe(buffers);
    expect(scene.models.animation).toMatchObject({ sequence: 'sway', frozen: false });
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('J from sway to gust cross-fades, then J returns to the rest pose and stops the animation', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { skeleton: true, pose: 'sway', animTimeMs: 1000 });
    expect(scene.cyclePose()).toBe('gust');
    expect(scene.models.animation).toMatchObject({ sequence: 'gust', previous: 'sway', lambda: 0 });
    close(topJoint(backend, scene), predicted(20, 0.3), 5); // lambda 0: still the sway's pose
    scene.stepAnimation(150);
    // Half-way through the fade: lean 13.75° (see the player's test), bob 0.3 × (1 − 0.15).
    close(topJoint(backend, scene), predicted(13.75, 0.255), 4);
    scene.stepAnimation(150);
    expect(scene.models.animation).toMatchObject({ sequence: 'gust', previous: null, lambda: 1 });
    expect(scene.cyclePose()).toBe('rest');
    expect(scene.models.animation).toBeUndefined();
    close(topJoint(backend, scene), predicted(0, 0), 6);
    scene.dispose();
  });

  it('shows the animation in the overlay', () => {
    const scene = createModelScene(new NullBackend(), { skeleton: true, pose: 'sway', animTimeMs: 1000 });
    const base = { engineMode: 'new' as const, backend: 'webgl2' as const, fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 2, triangles: 44, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } } };
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Animation: sway 1000 ms · frozen');
    scene.cyclePose();
    scene.stepAnimation(75);
    expect(formatOverlay({ ...base, models: scene.models })).toContain('Animation: gust 75 ms · fading from sway 25 % · frozen');
    expect(formatOverlay({ ...base, models: scene.models }).join('\n')).toContain('pose gust (J) · attached 0 (H)');
  });

  it('rejects a bad freeze time', () => {
    expect(() => createModelScene(new NullBackend(), { animTimeMs: -1 })).toThrow(/animTime/);
  });
});

describe('materials and submeshes in the renderer (P4.6)', () => {
  interface Seen { blend: string; cullMode: string; depthWrite: boolean; firstIndex: number; indexCount: number; material: number[]; fog: number[] }
  function drawSwatches(options: { hidden?: number[]; fog?: boolean; alpha?: number } = {}) {
    const backend = new NullBackend();
    const renderer = new ModelRenderer(backend);
    const id = renderer.addModel(buildSwatchModel(), swatchTexture());
    if (options.fog) renderer.setFog({ color: [0.2, 0.4, 0.6], start: 10, end: 110 });
    const seen: Seen[] = [];
    const draw = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array, state = backend.pipelineState(call.pipeline)!;
      seen.push({ blend: state.blend, cullMode: state.cullMode, depthWrite: state.depthWrite, firstIndex: call.firstIndex ?? 0, indexCount: call.indexCount ?? 0, material: Array.from(u.subarray(MODEL_MATERIAL_OFFSET_FLOATS, MODEL_MATERIAL_OFFSET_FLOATS + 4)), fog: Array.from(u.subarray(48, 56)) });
      return draw(call);
    };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, [{ model: id, matrix: identity, ...(options.hidden ? { hiddenGeosets: new Set(options.hidden) } : {}), ...(options.alpha === undefined ? {} : { alpha: options.alpha }) }], { debugMode: 'lit', eye: [0, -10, 1] });
    backend.endFrame();
    return { backend, renderer, seen, result };
  }
  // Submesh k of the test card: the backdrop is 6 indices, each swatch 12.
  const firstIndexOf = (geoset: number): number => (geoset === 0 ? 0 : 6 + (geoset - 1) * 12);

  it('draws one batch per submesh: opaque and cutout ones first, then the blended ones, each with its index range', () => {
    const { seen, result, renderer } = drawSwatches();
    expect(result).toEqual({ instances: 1, triangles: 2 + 9 * 4, draws: 10 });
    // Opaque pass: backdrop, opaque, alpha key, lit opaque, two-sided. Then alpha, no-alpha add, add, mod, mod2x.
    expect(seen.map((s) => s.firstIndex)).toEqual([0, 1, 2, 8, 9, 3, 4, 5, 6, 7].map(firstIndexOf));
    expect(seen.map((s) => s.indexCount)).toEqual([6, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    expect(seen.map((s) => s.blend)).toEqual(['opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'alpha', 'addNoAlpha', 'add', 'mod', 'mod2x']);
    renderer.dispose();
  });

  it('depth: opaque and cutout write it, blended surfaces only test it; two-sided turns culling off', () => {
    const { seen, renderer } = drawSwatches();
    expect(seen.map((s) => s.depthWrite)).toEqual([true, true, true, true, true, false, false, false, false, false]);
    expect(seen.map((s) => s.cullMode)).toEqual(['back', 'back', 'back', 'back', 'none', 'back', 'back', 'back', 'back', 'back']);
    renderer.dispose();
  });

  it('material uniforms: unlit flag, alpha-key reference 224 / 255 only for the cutout, instance alpha', () => {
    const { seen, renderer } = drawSwatches({ alpha: 0.5 });
    const byIndex = (geoset: number): Seen => seen.find((s) => s.firstIndex === firstIndexOf(geoset))!;
    expect(byIndex(1).material).toEqual([1, 0, 0.5, 0]);
    expect(byIndex(2).material[1]).toBeCloseTo(ALPHA_KEY_REFERENCE, 6);
    expect(byIndex(2).material[1]).toBeCloseTo(0.878431, 5);
    expect(byIndex(8).material).toEqual([0, 0, 0.5, 0]); // lit
    // Mod and Mod2x have no UNLIT flag in the fixture and are full-bright all the same (spec §82).
    expect(SWATCHES.find((s) => s.geosetId === 6)!.renderFlags).toBe(0);
    expect(byIndex(6).material[0]).toBe(1);
    expect(byIndex(7).material[0]).toBe(1);
    renderer.dispose();
  });

  it('fog policy per material: scene colour, black for the additive modes, white for mod, grey for mod2x', () => {
    const { seen, renderer } = drawSwatches({ fog: true });
    const fogOf = (geoset: number): number[] => seen.find((s) => s.firstIndex === firstIndexOf(geoset))!.fog;
    const range = [10, Math.fround(1 / 100), 0, 0];
    close(fogOf(1), [0.2, 0.4, 0.6, 0, ...range]);
    close(fogOf(3), [0.2, 0.4, 0.6, 0, ...range]);
    close(fogOf(4), [0, 0, 0, 0, ...range]);
    close(fogOf(5), [0, 0, 0, 0, ...range]);
    close(fogOf(6), [1, 1, 1, 0, ...range]);
    close(fogOf(7), [0.5, 0.5, 0.5, 0, ...range]);
    renderer.dispose();
  });

  it('hidden geosets are not drawn', () => {
    const { seen, result, renderer } = drawSwatches({ hidden: [3, 9] });
    expect(result.draws).toBe(8);
    expect(seen.map((s) => s.firstIndex)).not.toContain(firstIndexOf(3));
    expect(seen.map((s) => s.firstIndex)).not.toContain(firstIndexOf(9));
    renderer.dispose();
  });

  it('shares pipelines between equal render states and frees them all', () => {
    const { backend, renderer } = drawSwatches();
    // opaque/back/write, opaque/none/write, and one per blended mode.
    expect(backend.livePipelineCount).toBe(7);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('a mesh without submeshes is one opaque, lit batch — the tree is drawn as before', () => {
    const { backend, renderer, id } = setup();
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(renderer.draw(identity, [{ model: id, matrix: identity }], { debugMode: 'lit' })).toEqual({ instances: 1, triangles: 44, draws: 1 });
    backend.endFrame();
    const draw = drawsOf(backend)[0]!;
    expect(backend.pipelineState(draw.call.pipeline)).toMatchObject({ blend: 'opaque', cullMode: 'back', depthWrite: true });
    expect(Array.from((draw.call.uniforms as Float32Array).subarray(MODEL_MATERIAL_OFFSET_FLOATS, MODEL_MATERIAL_OFFSET_FLOATS + 4))).toEqual([0, 0, 1, 0]);
    renderer.dispose();
  });

  it('rejects an instance alpha outside 0..1', () => {
    expect(() => drawSwatches({ alpha: 1.5 })).toThrow(/alpha must be in 0..1/);
  });

  it('the scene shows the test card and hides the geosets asked for', () => {
    expect(parseSceneRequest('?scene=model&model=swatches&hideGeosets=3,9,3')).toMatchObject({ model: 'swatches', hiddenGeosets: [3, 9] });
    expect(parseSceneRequest('?scene=model&hideGeosets=abc')).toMatchObject({ model: 'tree', hiddenGeosets: [] });
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'swatches', hiddenGeosets: [3, 9], pitchDegrees: 0, headingDegrees: 0 });
    expect(scene.render(16 / 9).drawCalls).toBe(8);
    // The camera looks north at the middle of the card: its centre projects to the middle of the screen.
    close(scene.projectToScreen([0, 0.25, 1]), [0.5, 0.5], 5);
    expect(scene.projectToScreen([-4, 0, 1])[0]).toBeLessThan(0.5);
    expect(scene.projectToScreen([0, 0, 2])[1]).toBeLessThan(0.5);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});

describe('attachments and billboard bones in the scene (P4.7)', () => {
  const RAD = Math.PI / 180;
  const apply = (m: ArrayLike<number>, p: readonly number[]): number[] => [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
  const socket = findAttachment(TREE_ATTACHMENTS, ATTACHMENT_ID.top).position;

  it('reads attach from the URL; off by default', () => {
    expect(parseSceneRequest('?scene=model&attach=on')).toMatchObject({ attach: true });
    expect(parseSceneRequest('?scene=model')).toMatchObject({ attach: false });
  });

  it('adds one ornament per tree, placed on the socket of ITS tree', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { layout: 'grove', attach: true });
    expect(scene.render(16 / 9).drawCalls).toBe(6);
    expect(scene.models).toMatchObject({ models: 2, instances: 6, attached: 3 });
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  /** Captures, per draw, the model matrix and the palette of bone 1 (the ornament's card). */
  function capture(options: Parameters<typeof createModelScene>[1]) {
    const backend = new NullBackend();
    const seen: Array<{ model: number[]; card: number[]; indexCount: number }> = [];
    const draw = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array;
      seen.push({ model: Array.from(u.subarray(16, 32)), card: Array.from(u.subarray(MODEL_PALETTE_OFFSET_FLOATS + 16, MODEL_PALETTE_OFFSET_FLOATS + 32)), indexCount: call.indexCount ?? 0 });
      return draw(call);
    };
    const scene = createModelScene(backend, options);
    scene.render(16 / 9);
    return { scene, ornaments: seen.filter((s) => s.indexCount === 6) };
  }

  it('the ornament follows the socket: at rest above the tip, in the bend pose where the top bone carries it', () => {
    const rest = capture({ attach: true });
    close(apply(rest.ornaments[0]!.model, [0, 0, 0]), socket, 5);
    rest.scene.dispose();
    const bent = capture({ attach: true, pose: 'bend' });
    // Top bone: 20° about (0, 0, 4), then its parent: 20° about (0, 0, 2.2) — both around +x.
    const turn = (p: number[], pivotZ: number): number[] => { const c = Math.cos(20 * RAD), s = Math.sin(20 * RAD), z = p[2]! - pivotZ; return [p[0]!, p[1]! * c - z * s, pivotZ + p[1]! * s + z * c]; };
    close(apply(bent.ornaments[0]!.model, [0, 0, 0]), turn(turn([...socket], 4), 2.2), 4);
    bent.scene.dispose();
  });

  it('the card faces the camera whatever the view and however its tree is turned or bent', () => {
    for (const options of [{ headingDegrees: 30, pitchDegrees: 15 }, { headingDegrees: 90, pitchDegrees: 0 }, { headingDegrees: 200, pitchDegrees: 60, pose: 'bend' as const }, { headingDegrees: 300, pitchDegrees: -40, layout: 'grove' as const, pose: 'bend' as const }]) {
      const { scene, ornaments } = capture({ attach: true, ...options });
      const { eye, target } = scene.camera;
      const f = [target[0]! - eye[0]!, target[1]! - eye[1]!, target[2]! - eye[2]!], length = Math.hypot(f[0]!, f[1]!, f[2]!);
      for (const item of ornaments) {
        // World direction of the card's normal (local −y through the card bone, then the instance): it must point
        // back along the view direction. Directions: w = 0.
        const dir = (v: number[]): number[] => { const a = apply(item.card, v), o = apply(item.card, [0, 0, 0]), l = [a[0]! - o[0]!, a[1]! - o[1]!, a[2]! - o[2]!]; const b = apply(item.model, l), z = apply(item.model, [0, 0, 0]); return [b[0]! - z[0]!, b[1]! - z[1]!, b[2]! - z[2]!]; };
        const normal = dir([0, -1, 0]), scale = Math.hypot(normal[0]!, normal[1]!, normal[2]!);
        close(normal.map((c) => c / scale), f.map((c) => -c / length), 4);
        // And its « up » (local +z) is the camera's up: no roll. Camera up is perpendicular to the view direction
        // and has no sideways part: up · (forward × worldUp) = 0.
        const up = dir([0, 0, 1]), side = [f[1]!, -f[0]!, 0];
        expect((up[0]! * side[0]! + up[1]! * side[1]!) / scale / length).toBeCloseTo(0, 4);
        expect(up[2]! / scale).toBeGreaterThan(0);
        // The card keeps its size: 1.2 × the tree's scale.
        expect(Math.hypot(...dir([1, 0, 0])) / scale).toBeCloseTo(1, 4);
      }
      scene.dispose();
    }
    expect(ORNAMENT.halfSize).toBe(0.6);
  });

  it('the view holds the whole ornament when it is asked for from the start (it sits above the tree)', () => {
    for (const [pitchDegrees, headingDegrees] of [[20, 90], [35, 200], [-30, 0], [0, 45]] as const) {
      const scene = createModelScene(new NullBackend(), { attach: true, pitchDegrees, headingDegrees });
      scene.render(16 / 9);
      // Whatever way the card is turned, it stays within 0.6 × √2 of the socket.
      for (const [dx, dy, dz] of [[0.85, 0, 0], [-0.85, 0, 0], [0, 0.85, 0], [0, -0.85, 0], [0, 0, 0.85], [0, 0, -0.85]] as const) {
        const [x, y] = scene.projectToScreen([socket[0] + dx, socket[1] + dy, socket[2] + dz]);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
      scene.dispose();
    }
  });

  it('H hangs and removes the ornament; the test card never has one', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, {});
    expect(scene.render(16 / 9).drawCalls).toBe(1);
    expect(scene.toggleAttachments()).toBe(true);
    expect(scene.render(16 / 9).drawCalls).toBe(2);
    expect(scene.toggleAttachments()).toBe(false);
    expect(scene.render(16 / 9).drawCalls).toBe(1);
    scene.dispose();
    const card = createModelScene(new NullBackend(), { model: 'swatches', attach: true });
    expect(card.models.attached).toBe(0);
    expect(card.toggleAttachments()).toBe(false);
    card.dispose();
  });
});

describe('particles: renderer and scene (P4.8)', () => {
  const RIGHT = [1, 0, 0], UP = [0, 0, 1];

  it('keeps ONE vertex buffer sized for the emitter and updates it each frame; one draw of 6 indices per particle', () => {
    const backend = new NullBackend();
    const system = new ParticleSystem(TREE_PARTICLE_EMITTERS.jet);
    const renderer = new ParticleRenderer(backend, system, particleTexture('solid'));
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([2, 1, 1]);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(renderer.draw(identity, RIGHT, UP, [0, -10, 0])).toBe(0); // nothing alive: no draw, no update
    system.update(0.35, identity);
    expect(renderer.draw(identity, RIGHT, UP, [0, -10, 0])).toBe(3);
    system.update(0.2, identity);
    expect(renderer.draw(identity, RIGHT, UP, [0, -10, 0])).toBe(5);
    expect(backend.endFrame()).toEqual({ drawCalls: 2, triangles: 6 + 10 });
    expect(backend.bufferUpdates).toBe(2);
    expect(backend.liveBufferCount).toBe(2);
    const draws = drawsOf(backend);
    expect(draws.map((d) => d.call.indexCount)).toEqual([18, 30]);
    expect((backend.bufferData(draws[0]!.call.vertexBuffer) as Float32Array).length).toBe(system.capacity * 4 * PARTICLE_VERTEX_FLOATS);
    expect(backend.pipelineState(draws[0]!.call.pipeline)).toMatchObject({ blend: 'alpha', cullMode: 'none', depthTest: true, depthWrite: false, textureCount: 1 });
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('additive sparkles use the additive pipeline', () => {
    const backend = new NullBackend();
    const renderer = new ParticleRenderer(backend, new ParticleSystem(TREE_PARTICLE_EMITTERS.sparkles), particleTexture('soft'));
    renderer.system.update(0.5, identity);
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, RIGHT, UP, [0, -10, 0]);
    backend.endFrame();
    expect(backend.pipelineState(drawsOf(backend)[0]!.call.pipeline)).toMatchObject({ blend: 'add', depthWrite: false });
    renderer.dispose();
  });

  it('reads particles from the URL', () => {
    expect(parseSceneRequest('?scene=model&particles=jet')).toMatchObject({ particles: 'jet' });
    expect(parseSceneRequest('?scene=model&particles=smoke')).toMatchObject({ particles: 'off' });
  });

  it('the jet leaves the tip of the tree along the top bone: straight up at rest', () => {
    const scene = createModelScene(new NullBackend(), { particles: 'jet', animTimeMs: 1000 });
    expect(scene.models).toMatchObject({ particles: 'jet', liveParticles: 10 });
    // Born at 0.1, 0.2 … 1.0 s; the one born at 0.1 s is 0.9 s old and 1.8 above the tip (2 units per second).
    for (let k = 0; k < 10; k++) {
      const p = scene.particleAt(k)!;
      expect(p.age).toBeCloseTo(0.9 - k * 0.1, 5);
      close(p.position, [0, 0, 7 + 2 * p.age], 4);
    }
    expect(scene.particleAt(10)).toBeNull();
    scene.dispose();
  });

  it('in the bend pose the jet leans with the top bone (40°) and starts from the skinned tip', () => {
    const scene = createModelScene(new NullBackend(), { particles: 'jet', pose: 'bend', animTimeMs: 1000 });
    const palette = computeBoneMatrices(TREE_SKELETON, TREE_POSES.bend).subarray(32, 48);
    const tip = [palette[8]! * 7 + palette[12]!, palette[9]! * 7 + palette[13]!, palette[10]! * 7 + palette[14]!];
    const direction = [0, -Math.sin((40 * Math.PI) / 180), Math.cos((40 * Math.PI) / 180)];
    const p = scene.particleAt(0)!;
    close(p.position, tip.map((c, k) => c + direction[k]! * 2 * p.age), 4);
    scene.dispose();
  });

  it('draws the particles after the models, frozen time stops them, a manual step moves them', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { particles: 'jet', animTimeMs: 500 });
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 2, triangles: 44 + 5 * 2 });
    const draws = drawsOf(backend);
    expect(backend.pipelineState(draws[1]!.call.pipeline)?.blend).toBe('alpha');
    scene.advanceAnimation(100); // frozen
    expect(scene.models.liveParticles).toBe(5);
    scene.stepAnimation(100);
    expect(scene.models.liveParticles).toBe(6);
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('each tree of the grove has its own emitter, at ITS tip', () => {
    const scene = createModelScene(new NullBackend(), { particles: 'jet', layout: 'grove', animTimeMs: 300 });
    expect(scene.models.liveParticles).toBe(9);
    scene.dispose();
  });

  it('G turns the sparkles on and off, freeing everything; the test card has no particles', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, {});
    const before = [backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount];
    expect(scene.toggleParticles()).toBe('sparkles');
    scene.advanceAnimation(500);
    expect(scene.models.liveParticles).toBe(20);
    expect(formatOverlay({ engineMode: 'new', backend: 'webgl2', fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 2, triangles: 44, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } }, models: scene.models })).toContain('Particles: sparkles · 20 alive (G)');
    expect(scene.toggleParticles()).toBe('off');
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual(before);
    scene.dispose();
    const card = createModelScene(new NullBackend(), { model: 'swatches', particles: 'jet' });
    expect(card.models.particles).toBe('off');
    card.dispose();
  });
});

describe('ribbons: renderer and scene (P4.8b)', () => {
  const RAD = Math.PI / 180;
  const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  /** Tip of the swaying tree `ms` into the sway (first second): both foliage bones lean 20° × ms / 1000, the top bobs up 0.3 × ms / 1000. */
  const swayTip = (ms: number): { node: number[]; axis: number[] } => {
    const d = (20 * ms) / 1000, bob = (0.3 * ms) / 1000, c = Math.cos(d * RAD), s = Math.sin(d * RAD);
    const turn = (p: number[], pivotZ: number): number[] => [p[0]!, p[1]! * c - (p[2]! - pivotZ) * s, pivotZ + p[1]! * s + (p[2]! - pivotZ) * c];
    const top = turn([0, 0, 7], 4);
    return { node: turn([top[0]!, top[1]!, top[2]! + bob], 2.2), axis: [0, -Math.sin(2 * d * RAD), Math.cos(2 * d * RAD)] };
  };

  it('keeps one vertex buffer and draws the strip in one call: 2 triangles per quad between edges', () => {
    const backend = new NullBackend();
    const trail = new RibbonTrail(TREE_RIBBON);
    const renderer = new RibbonRenderer(backend, trail, ribbonTexture('solid'));
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    expect(renderer.draw(identity)).toBe(0); // nothing yet
    trail.update(0.05, at(0, 0, 0));
    trail.update(0.05, at(1, 0, 0));
    trail.update(0.05, at(2, 0, 0));
    expect(renderer.draw(identity)).toBe(3); // 3 committed edges + the head
    expect(backend.endFrame()).toEqual({ drawCalls: 1, triangles: 6 });
    const draw = drawsOf(backend)[0]!;
    expect(draw.call.indexCount).toBe(18);
    expect(backend.pipelineState(draw.call.pipeline)).toMatchObject({ blend: 'alpha', cullMode: 'none', depthTest: true, depthWrite: false });
    expect((backend.bufferData(draw.call.vertexBuffer) as Float32Array).length).toBe((trail.capacity + 1) * 2 * RIBBON_VERTEX_FLOATS);
    expect(backend.bufferUpdates).toBe(1);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('reads ribbon from the URL', () => {
    expect(parseSceneRequest('?scene=model&ribbon=on')).toMatchObject({ ribbon: true });
    expect(parseSceneRequest('?scene=model')).toMatchObject({ ribbon: false });
  });

  it('the trail follows the tip of the swaying tree: each edge is where the top bone was when it was committed', () => {
    const scene = createModelScene(new NullBackend(), { ribbon: true, pose: 'sway', animTimeMs: 0 });
    for (let k = 0; k < 20; k++) scene.stepAnimation(50); // one edge per step (20 per second)
    expect(scene.models).toMatchObject({ ribbon: true, ribbonEdges: 20 });
    for (const k of [0, 5, 12, 19]) {
      const edge = scene.ribbonEdgeAt(k)!, { node, axis } = swayTip((k + 1) * 50);
      expect(edge.age).toBeCloseTo((19 - k) * 0.05, 5);
      close(edge.top, node.map((c, i) => c + axis[i]! * 0.25), 4);
      close(edge.bottom, node.map((c, i) => c - axis[i]! * 0.25), 4);
    }
    expect(scene.ribbonEdgeAt(20)).toBeNull();
    scene.dispose();
  });

  it('is drawn after the model, stays on screen, and edges expire after 1.5 s', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { ribbon: true, pose: 'sway', animTimeMs: 0 });
    expect(scene.render(16 / 9).drawCalls).toBe(1); // no edge yet
    for (let k = 0; k < 20; k++) scene.stepAnimation(50);
    expect(scene.render(16 / 9)).toEqual({ drawCalls: 2, triangles: 44 + 20 * 2 });
    for (const k of [0, 10, 19]) for (const point of [scene.ribbonEdgeAt(k)!.top, scene.ribbonEdgeAt(k)!.bottom]) {
      const [x, y] = scene.projectToScreen(point);
      expect(x > 0 && x < 1 && y > 0 && y < 1).toBe(true);
    }
    for (let k = 0; k < 40; k++) scene.stepAnimation(50);
    expect(scene.models.ribbonEdges).toBe(30); // ages 0, 0.05 … 1.45 s: the one that reached 1.5 s is gone
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('R turns the ribbon on and off, freeing everything; the grove has one trail per tree; the test card has none', () => {
    const backend = new NullBackend();
    const scene = createModelScene(backend, { layout: 'grove', pose: 'sway' });
    const before = [backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount];
    expect(scene.toggleRibbon()).toBe(true);
    scene.advanceAnimation(100);
    expect(scene.models.ribbonEdges).toBe(6);
    expect(formatOverlay({ engineMode: 'new', backend: 'webgl2', fps: 60, frameMs: 16, frameMaxMs: 16, drawCalls: 2, triangles: 44, canvasWidth: 1, canvasHeight: 1, simulationHz: 60, simulationSteps: 0, assets: { total: 0, byState: { unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0 } }, models: scene.models })).toContain('Ribbon: 6 edges (R)');
    expect(scene.toggleRibbon()).toBe(false);
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual(before);
    scene.dispose();
    const card = createModelScene(new NullBackend(), { model: 'swatches', ribbon: true });
    expect(card.models.ribbon).toBe(false);
    card.dispose();
  });
});

describe('distance fade in the renderer and the scene (P4.9)', () => {
  const radius = modelBounds(tree).radius, centreZ = modelBounds(tree).center[2];
  /** A tree whose bounding sphere's nearest point is `d` north of a camera at the origin. */
  const treeAt = (id: ReturnType<ModelRenderer['addModel']>, d: number) => ({ model: id, matrix: placementMatrix(0, d + radius, 0, 0, 1) });
  interface Seen { blend: string; depthWrite: boolean; alpha: number; reference: number }
  function draw(mesh: Parameters<ModelRenderer['addModel']>[0], distances: number[], fade = true) {
    const backend = new NullBackend();
    const renderer = new ModelRenderer(backend);
    const id = renderer.addModel(mesh, treeTexture('solid'));
    const seen: Seen[] = [];
    const original = backend.draw.bind(backend);
    backend.draw = (call) => {
      const u = call.uniforms as Float32Array, state = backend.pipelineState(call.pipeline)!;
      seen.push({ blend: state.blend, depthWrite: state.depthWrite, alpha: u[MODEL_MATERIAL_OFFSET_FLOATS + 2]!, reference: u[MODEL_MATERIAL_OFFSET_FLOATS + 1]! });
      return original(call);
    };
    const r = modelBounds(mesh).radius;
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    const result = renderer.draw(identity, distances.map((d) => ({ model: id, matrix: placementMatrix(0, d + r - modelBounds(mesh).center[1], 0, 0, 1) })), { debugMode: 'lit', eye: [0, 0, centreZ], ...(fade ? { distanceFade: { unitsPerYard: 1 } } : {}) });
    backend.endFrame();
    return { backend, renderer, seen, result, id };
  }

  it('the tree (radius 3.5) is in the 150 → 200 class', () => {
    expect(radius).toBeGreaterThan(2.5);
    expect(radius).toBeLessThan(7);
  });

  it('before the fade starts: the normal opaque pipeline, alpha 1', () => {
    const { seen, renderer } = draw(tree, [140]);
    expect(seen).toEqual([{ blend: 'opaque', depthWrite: true, alpha: 1, reference: 0 }]);
    renderer.dispose();
  });

  it('while fading: alpha = fade, drawn with alpha blending, still writing depth', () => {
    const { seen, renderer } = draw(tree, [162.5, 175, 187.5]);
    expect(seen.map((s) => s.blend)).toEqual(['alpha', 'alpha', 'alpha']);
    expect(seen.map((s) => s.depthWrite)).toEqual([true, true, true]);
    close(seen.map((s) => s.alpha), [0.75, 0.5, 0.25]);
    renderer.dispose();
  });

  it('beyond the end of the fade the instance is not drawn at all', () => {
    const { result, renderer } = draw(tree, [140, 205, 1000]);
    expect(result).toEqual({ instances: 3, triangles: 44, draws: 1 });
    renderer.dispose();
  });

  it('fading instances are drawn after the fully visible ones, whatever their order in the list', () => {
    const { seen, renderer } = draw(tree, [175, 140]);
    close(seen.map((s) => s.alpha), [1, 0.5]);
    renderer.dispose();
  });

  it('without the option nothing fades, however far', () => {
    const { seen, result, renderer } = draw(tree, [175, 5000], false);
    expect(result.draws).toBe(2);
    expect(seen.map((s) => [s.blend, s.alpha])).toEqual([['opaque', 1], ['opaque', 1]]);
    renderer.dispose();
  });

  it('cutout: the alpha test keeps its 224 / 255 reference while alpha drops with the fade — edges go first (spec §95)', () => {
    const card = buildSwatchModel(); // radius ≈ 5.2: same class
    const { seen, renderer } = draw(card, [160]);
    const cutout = seen.find((s) => s.reference > 0)!;
    expect(cutout.reference).toBeCloseTo(ALPHA_KEY_REFERENCE, 6);
    expect(cutout.alpha).toBeCloseTo(0.8, 5);
    expect(cutout.blend).toBe('alpha');
    // A texel of alpha 230 passes at full visibility (230 ≥ 224) and fails at fade 0.8 (184 < 224).
    expect((230 / 255) * 1).toBeGreaterThanOrEqual(ALPHA_KEY_REFERENCE);
    expect((230 / 255) * cutout.alpha).toBeLessThan(ALPHA_KEY_REFERENCE);
    renderer.dispose();
  });

  it('the fade multiplies the instance alpha', () => {
    const backend = new NullBackend(), renderer = new ModelRenderer(backend), id = renderer.addModel(tree, treeTexture('solid'));
    let alpha = -1;
    const original = backend.draw.bind(backend);
    backend.draw = (call) => { alpha = (call.uniforms as Float32Array)[MODEL_MATERIAL_OFFSET_FLOATS + 2]!; return original(call); };
    backend.beginFrame({ r: 0, g: 0, b: 0, a: 1 });
    renderer.draw(identity, [{ ...treeAt(id, 175), alpha: 0.5 }], { debugMode: 'lit', eye: [0, 0, 0], distanceFade: { unitsPerYard: 1 } });
    backend.endFrame();
    expect(alpha).toBeCloseTo(0.25, 5);
    expect(() => renderer.draw(identity, [treeAt(id, 10)], { debugMode: 'lit', distanceFade: { unitsPerYard: 1 } })).toThrow(/needs the camera position/);
    renderer.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });

  it('the row layout puts five trees at the test distances, and the scene fades them', () => {
    expect(parseSceneRequest('?scene=model&models=row&modelFade=off')).toMatchObject({ layout: 'row', distanceFade: false });
    const backend = new NullBackend();
    const scene = createModelScene(backend, { layout: 'row' });
    expect(scene.instances).toHaveLength(5);
    expect(scene.render(16 / 9).drawCalls).toBe(4); // the last one is gone
    close(scene.fades.map((f) => f.fade), [1, 0.75, 0.5, 0.25, 0], 4);
    scene.fades.forEach((f, k) => {
      expect(Math.hypot(f.center[0], f.center[1]) - radius).toBeCloseTo(ROW_DISTANCES[k]!, 3);
      expect((Math.atan2(f.center[0], f.center[1]) * 180) / Math.PI).toBeCloseTo(ROW_BEARINGS[k]!, 4);
      // Every tree is in view, left to right.
      const [x, y] = scene.projectWorldToScreen(f.center);
      void y;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    });
    const xs = scene.fades.map((f) => scene.projectWorldToScreen(f.center)[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    scene.dispose();
    const plain = createModelScene(new NullBackend(), { layout: 'row', distanceFade: false });
    expect(plain.render(16 / 9).drawCalls).toBe(5);
    close(plain.fades.map((f) => f.fade), [1, 1, 1, 1, 1]);
    plain.dispose();
  });
});
