import type { ShaderSource, VertexLayout } from '../backend';

/**
 * Particle quads (P4.8, spec §90): « small textured cards + blend mode + camera-facing orientation ».
 * The quads arrive already expanded and turned towards the camera, in world space: the shader only projects
 * them and multiplies the texture by the particle's colour and alpha. No lighting, no fog.
 *
 * Vertex: position xyz, uv, colour rgba — 9 floats. Uniform block: mat4 view-projection.
 */
export const PARTICLE_VERTEX_LAYOUT: VertexLayout = {
  stride: 36,
  attributes: [
    { location: 0, format: 'float32x3', offset: 0 },
    { location: 1, format: 'float32x2', offset: 12 },
    { location: 2, format: 'float32x4', offset: 20 },
  ],
};
export const PARTICLE_UNIFORM_BYTES = 64;

export const PARTICLE_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  viewProjection: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var albedoSampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>, @location(2) color: vec4<f32>) -> VsOut {
  var out: VsOut;
  out.position = globals.viewProjection * vec4<f32>(position, 1.0);
  out.uv = uv;
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  return textureSample(albedo, albedoSampler, in.uv) * in.color;
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_viewProjection;
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
out vec2 v_uv;
out vec4 v_color;
void main() {
  v_uv = a_uv;
  v_color = a_color;
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
uniform sampler2D u_texture0;
in vec2 v_uv;
in vec4 v_color;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_uv) * v_color;
}
`,
};
