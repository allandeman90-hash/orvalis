import type { ShaderSource } from '../backend';

/**
 * Building shader (P6.1, spec §112, §115, §171): one group's geometry, placed by one model matrix.
 * Vertex: position, normal, uv, baked colour (BUILDING_VERTEX_LAYOUT).
 *
 * Light per vertex — the LIGHTING PATH of the batch (P6.7, spec §171–§173):
 *   0 sun        ambient + diffuse · max(dot(N, L), 0): every batch of an exterior or exterior-lit group, and the
 *                EXT batches of an interior group; the baked colour's alpha is ignored there
 *   1 interior   baked rgb × (1 + 4 × baked alpha): INT batches of a true interior group — the alpha is a
 *                self-illumination amount, NOT transparency
 *   2 trans      mix(sun, baked rgb, baked alpha): TRANS batches of a true interior group
 *   unlit material → 1, whatever the path
 * then texture × light, the alpha test of the material (0 = none), the distance fog.
 * The fog's distance is computed PER PIXEL from the interpolated position: a wall is one large quad, and a
 * distance interpolated between its far corners would be much too large in its middle (found in P6.7).
 * OUR CHOICES: which end of the TRANS blend is which (alpha 1 = fully baked) — the document says « approximately
 * a dynamic-lit ↔ baked-light blend factor »; the paths apply only in TRUE interior groups ((flags & 0x48) == 0).
 * Night glow (0x10) and window (0x20) materials have no rule in the document yet: the flags are stored, not drawn.
 *
 * Uniform block: mat4 mvp, mat4 model, vec4 light, vec4 ambient, vec4 diffuse, vec4 eye, vec4 fogColor,
 * vec4 fogRange (start, 1 / (end − start)), vec4 params (debug mode, lighting path 0 | 1 | 2, 1 = unlit, alpha reference),
 * vec4 debugColor.
 * Debug modes: 0 = lit · 1 = debugColor, flat (per group or per batch class) · 2 = the baked vertex colour.
 */
export const BUILDING_UNIFORM_FLOATS = 64;
export const BUILDING_UNIFORM_BYTES = BUILDING_UNIFORM_FLOATS * 4;
export const BUILDING_DEBUG_MODE = { lit: 0, groups: 1, classes: 1, colors: 2 } as const;
export type BuildingDebugMode = keyof typeof BUILDING_DEBUG_MODE;

export const BUILDING_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  light: vec4<f32>,
  ambient: vec4<f32>,
  diffuse: vec4<f32>,
  eye: vec4<f32>,
  fogColor: vec4<f32>,
  fogRange: vec4<f32>,
  params: vec4<f32>,
  debugColor: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var albedoSampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) light: vec3<f32>,
  @location(2) world: vec3<f32>,
  @location(3) baked: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>, @location(3) color: vec4<f32>) -> VsOut {
  var out: VsOut;
  let world = (globals.model * vec4<f32>(position, 1.0)).xyz;
  let n = normalize((globals.model * vec4<f32>(normal, 0.0)).xyz);
  let sun = globals.ambient.rgb + globals.diffuse.rgb * max(dot(n, globals.light.xyz), 0.0);
  // Lighting path (params.y): 0 = sun · 1 = baked colour, amplified by its alpha · 2 = sun ↔ baked, by its alpha.
  let interior = color.rgb * (1.0 + 4.0 * color.a);
  let trans = mix(sun, color.rgb, color.a);
  let lit = mix(mix(sun, interior, clamp(globals.params.y, 0.0, 1.0)), trans, clamp(globals.params.y - 1.0, 0.0, 1.0));
  out.position = globals.mvp * vec4<f32>(position, 1.0);
  out.uv = uv;
  out.light = mix(lit, vec3<f32>(1.0), globals.params.z);
  out.world = world;
  out.baked = color.rgb;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let texel = textureSample(albedo, albedoSampler, in.uv);
  if (texel.a < globals.params.w) {
    discard;
  }
  let fog = clamp((distance(in.world, globals.eye.xyz) - globals.fogRange.x) * globals.fogRange.y, 0.0, 1.0);
  var rgb = mix(texel.rgb * in.light, globals.fogColor.rgb, fog);
  if (globals.params.x > 1.5) {
    rgb = in.baked;
  } else if (globals.params.x > 0.5) {
    rgb = globals.debugColor.rgb;
  }
  return vec4<f32>(rgb, texel.a);
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_mvp;
  mat4 u_model;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
  vec4 u_params;
  vec4 u_debugColor;
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_color;
out vec2 v_uv;
out vec3 v_light;
out vec3 v_world;
out vec3 v_baked;
void main() {
  vec3 world = (u_model * vec4(a_position, 1.0)).xyz;
  vec3 n = normalize((u_model * vec4(a_normal, 0.0)).xyz);
  vec3 sun = u_ambient.rgb + u_diffuse.rgb * max(dot(n, u_light.xyz), 0.0);
  vec3 interior = a_color.rgb * (1.0 + 4.0 * a_color.a);
  vec3 trans = mix(sun, a_color.rgb, a_color.a);
  vec3 lit = mix(mix(sun, interior, clamp(u_params.y, 0.0, 1.0)), trans, clamp(u_params.y - 1.0, 0.0, 1.0));
  v_uv = a_uv;
  v_light = mix(lit, vec3(1.0), u_params.z);
  v_world = world;
  v_baked = a_color.rgb;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  mat4 u_mvp;
  mat4 u_model;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
  vec4 u_params;
  vec4 u_debugColor;
};
uniform sampler2D u_texture0;
in vec2 v_uv;
in vec3 v_light;
in vec3 v_world;
in vec3 v_baked;
out vec4 o_color;
void main() {
  vec4 texel = texture(u_texture0, v_uv);
  if (texel.a < u_params.w) discard;
  float fog = clamp((distance(v_world, u_eye.xyz) - u_fogRange.x) * u_fogRange.y, 0.0, 1.0);
  vec3 rgb = mix(texel.rgb * v_light, u_fogColor.rgb, fog);
  if (u_params.x > 1.5) {
    rgb = v_baked;
  } else if (u_params.x > 0.5) {
    rgb = u_debugColor.rgb;
  }
  o_color = vec4(rgb, texel.a);
}
`,
};
