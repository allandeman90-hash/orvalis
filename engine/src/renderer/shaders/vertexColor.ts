import type { ShaderSource, VertexLayout } from '../backend';

/** Position (xyz, clip space) + color (rgb). Used by the first-triangle test scene. */
export const VERTEX_COLOR_LAYOUT: VertexLayout = {
  stride: 24,
  attributes: [
    { location: 0, format: 'float32x3', offset: 0 },
    { location: 1, format: 'float32x3', offset: 12 },
  ],
};

export const VERTEX_COLOR_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) color: vec3<f32>) -> VsOut {
  var out: VsOut;
  out.position = vec4<f32>(position, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
`,
  glslVertex: `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_color;
out vec3 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 o_color;
void main() {
  o_color = vec4(v_color, 1.0);
}
`,
};
