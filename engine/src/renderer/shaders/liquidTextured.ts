import type { ShaderSource, VertexLayout } from '../backend';

/**
 * Liquid shader: one animated texture frame per draw (spec §23, §42), tinted by
 * the light, with the terrain's distance fog and a constant alpha. The frame is
 * chosen on the CPU (see terrainRender/liquidAnimation.ts) and bound as the
 * draw's texture.
 *
 * Depth response (spec §24, §25, §42): the liquid's opacity grows with the depth of liquid over the ground,
 *     f     = min(depth · invScale, 1)             (the depth table: i / 42 for a river, i / 255 for an ocean)
 *     alpha = clamp(1.6 · f⁸, 0, 1)                (the opacity table)
 * evaluated per pixel from the per-vertex depth; f⁸ by three squarings (no pow, same on both backends).
 * params.z = 1 applies it, 0 leaves the alpha alone (classes without depth response, e.g. magma).
 *
 * The texture repeats over the world: uv = position.xy × params.x, so it is
 * continuous across chunks and tiles.
 *
 * Vertex: x, y, z, depth (liquid surface − ground, ≥ 0).
 * Uniform block: mat4 mvp, vec4 tint (light rgb, alpha), vec4 eye, vec4 fogColor,
 * vec4 fogRange (start, 1 / (end − start)), vec4 params (uv per world unit, 1 / depth scale, depth response 0|1, 0).
 */
export const LIQUID_LAYOUT: VertexLayout = { stride: 16, attributes: [{ location: 0, format: 'float32x4', offset: 0 }] };
export const LIQUID_UNIFORM_FLOATS = 36;
export const LIQUID_UNIFORM_BYTES = LIQUID_UNIFORM_FLOATS * 4;

export const LIQUID_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  mvp: mat4x4<f32>,
  tint: vec4<f32>,
  eye: vec4<f32>,
  fogColor: vec4<f32>,
  fogRange: vec4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var frame: texture_2d<f32>;
@group(0) @binding(2) var frameSampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) distance: f32,
  @location(2) depth: f32,
};

@vertex
fn vs_main(@location(0) vertex: vec4<f32>) -> VsOut {
  var out: VsOut;
  out.position = globals.mvp * vec4<f32>(vertex.xyz, 1.0);
  out.uv = vertex.xy * globals.params.x;
  out.distance = distance(vertex.xyz, globals.eye.xyz);
  out.depth = vertex.w;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let texel = textureSample(frame, frameSampler, in.uv).rgb;
  let fog = clamp((in.distance - globals.fogRange.x) * globals.fogRange.y, 0.0, 1.0);
  let f = min(in.depth * globals.params.y, 1.0);
  let f2 = f * f;
  let f4 = f2 * f2;
  let curve = clamp(1.6 * f4 * f4, 0.0, 1.0);
  return vec4<f32>(mix(texel * globals.tint.rgb, globals.fogColor.rgb, fog), globals.tint.a * mix(1.0, curve, globals.params.z));
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_tint;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
  vec4 u_params;
};
layout(location = 0) in vec4 a_vertex;
out vec2 v_uv;
out float v_distance;
out float v_depth;
void main() {
  v_depth = a_vertex.w;
  v_uv = a_vertex.xy * u_params.x;
  v_distance = distance(a_vertex.xyz, u_eye.xyz);
  gl_Position = u_mvp * vec4(a_vertex.xyz, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_tint;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
  vec4 u_params;
};
uniform sampler2D u_texture0;
in vec2 v_uv;
in float v_distance;
in float v_depth;
out vec4 o_color;
void main() {
  vec3 texel = texture(u_texture0, v_uv).rgb;
  float fog = clamp((v_distance - u_fogRange.x) * u_fogRange.y, 0.0, 1.0);
  float f = min(v_depth * u_params.y, 1.0);
  float f2 = f * f;
  float f4 = f2 * f2;
  float curve = clamp(1.6 * f4 * f4, 0.0, 1.0);
  o_color = vec4(mix(texel * u_tint.rgb, u_fogColor.rgb, fog), u_tint.a * mix(1.0, curve, u_params.z));
}
`,
};
