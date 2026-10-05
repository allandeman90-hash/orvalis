import type { ShaderSource } from '../backend';

/**
 * Far terrain (spec §15, §262): « low material complexity » — one colour per
 * vertex, the same per-vertex light as the detailed terrain, the same fog.
 * No texture. Uses TERRAIN_DEBUG_LAYOUT (position · normal · colour).
 *
 * Uniform block: mat4 mvp, vec4 light (unit toLight, unused), vec4 ambient,
 * vec4 diffuse, vec4 eye, vec4 fogColor, vec4 fogRange (start, 1 / (end − start)).
 */
export const TERRAIN_FAR_UNIFORM_FLOATS = 40;
export const TERRAIN_FAR_UNIFORM_BYTES = TERRAIN_FAR_UNIFORM_FLOATS * 4;

export const TERRAIN_FAR_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  mvp: mat4x4<f32>,
  light: vec4<f32>,
  ambient: vec4<f32>,
  diffuse: vec4<f32>,
  eye: vec4<f32>,
  fogColor: vec4<f32>,
  fogRange: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) distance: f32,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) color: vec3<f32>) -> VsOut {
  var out: VsOut;
  out.position = globals.mvp * vec4<f32>(position, 1.0);
  out.color = color * (globals.ambient.rgb + globals.diffuse.rgb * max(dot(normal, globals.light.xyz), 0.0));
  out.distance = distance(position, globals.eye.xyz);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let fog = clamp((in.distance - globals.fogRange.x) * globals.fogRange.y, 0.0, 1.0);
  return vec4<f32>(mix(in.color, globals.fogColor.rgb, fog), 1.0);
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;
out vec3 v_color;
out float v_distance;
void main() {
  v_color = a_color * (u_ambient.rgb + u_diffuse.rgb * max(dot(a_normal, u_light.xyz), 0.0));
  v_distance = distance(a_position, u_eye.xyz);
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
};
in vec3 v_color;
in float v_distance;
out vec4 o_color;
void main() {
  float fog = clamp((v_distance - u_fogRange.x) * u_fogRange.y, 0.0, 1.0);
  o_color = vec4(mix(v_color, u_fogColor.rgb, fog), 1.0);
}
`,
};
