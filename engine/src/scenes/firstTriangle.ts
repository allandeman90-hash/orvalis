import { type ClearColor, type FrameStats, type RendererBackend, VERTEX_COLOR_LAYOUT, VERTEX_COLOR_SHADER } from '../renderer';

/** Clear colour of the empty scene (same dark blue as the page background). */
export const FIRST_TRIANGLE_CLEAR: ClearColor = { r: 11 / 255, g: 14 / 255, b: 20 / 255, a: 1 };

/** Clip-space positions + vertex colours: red on top, green bottom-left, blue bottom-right. */
// prettier-ignore
const TRIANGLE = new Float32Array([
  //  x     y    z     r  g  b
   0.0,  0.6, 0.0,     1, 0, 0,
  -0.6, -0.6, 0.0,     0, 1, 0,
   0.6, -0.6, 0.0,     0, 0, 1,
]);

export interface Scene {
  /**
   * Renders one frame and returns its statistics.
   * @param aspect width / height of the drawing surface
   */
  render(aspect: number): FrameStats;
  dispose(): void;
}

/**
 * Minimal workload shared by every backend: clear, one vertex buffer, one
 * pipeline, one draw. It only talks to RendererBackend, so the exact same code
 * runs on WebGPU, WebGL2 and the null backend.
 */
export function createFirstTriangleScene(backend: RendererBackend): Scene {
  const pipeline = backend.createPipeline({ shader: VERTEX_COLOR_SHADER, vertexLayout: VERTEX_COLOR_LAYOUT, label: 'vertexColor' });
  const vertexBuffer = backend.createBuffer({ usage: 'vertex', data: TRIANGLE, label: 'first-triangle' });
  return {
    render() {
      backend.beginFrame(FIRST_TRIANGLE_CLEAR);
      backend.draw({ pipeline, vertexBuffer, vertexCount: 3 });
      return backend.endFrame();
    },
    dispose() {
      backend.destroyBuffer(vertexBuffer);
      backend.destroyPipeline(pipeline);
    },
  };
}
