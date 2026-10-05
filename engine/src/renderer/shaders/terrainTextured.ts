import type { ShaderSource } from '../backend';

/**
 * Textured terrain (spec §7.4 / §41, splatting part only): 4 layers blended by
 * the chunk's mask texture.
 *     color = mix(mix(mix(layer0, layer1, mask.g), layer2, mask.b), layer3, mask.a)
 * then lit (spec §8, P1.10):
 *     light  = ambient + diffuse · max(dot(normal, toLight), 0)      — in the VERTEX shader, interpolated
 *     color *= light · mix(shadowFactor, 1, mask.r)                  — mask.r = baked shadow, 1 = lit
 * then fogged (spec §13, P1.11):
 *     color = mix(color, fogColor, clamp((distance − fogStart) / (fogEnd − fogStart), 0, 1))
 * with distance = camera-to-vertex distance, interpolated. No specular, no point lights.
 *
 * Same vertex buffers as the terrain debug shader (TERRAIN_DEBUG_LAYOUT):
 * position and normal are used, the debug colour is not. Texture coordinates come from the world position:
 * - layers: world xy × chunk.w                    → continuous across chunks and tiles
 * - mask:   (xy − chunk origin) × chunk.z in 0..1, then mapped so that the first
 *           and last texels sit exactly on the chunk border (see terrain/paint.ts)
 *
 * Uniform block: mat4 mvp, vec4 chunk = (originX, originY, 1 / chunkSize, layer uv scale),
 * vec4 light = (unit toLight xyz, shadowFactor), vec4 ambient (rgb), vec4 diffuse (rgb),
 * vec4 eye = (camera xyz, 0), vec4 fogColor (rgb), vec4 fogRange = (start, 1 / (end − start), 0, 0).
 * Fog off = fogRange (0, 0): the factor is then 0 everywhere.
 * Textures 0..3 = layers (repeat), texture 4 = mask (clamp).
 */
export const TERRAIN_TEXTURED_UNIFORM_FLOATS = 44;
export const TERRAIN_TEXTURED_UNIFORM_BYTES = TERRAIN_TEXTURED_UNIFORM_FLOATS * 4;
export const TERRAIN_TEXTURED_TEXTURES = 5;

export const TERRAIN_TEXTURED_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  mvp: mat4x4<f32>,
  chunk: vec4<f32>,
  light: vec4<f32>,
  ambient: vec4<f32>,
  diffuse: vec4<f32>,
  eye: vec4<f32>,
  fogColor: vec4<f32>,
  fogRange: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var layer0: texture_2d<f32>;
@group(0) @binding(2) var layer0Sampler: sampler;
@group(0) @binding(3) var layer1: texture_2d<f32>;
@group(0) @binding(4) var layer1Sampler: sampler;
@group(0) @binding(5) var layer2: texture_2d<f32>;
@group(0) @binding(6) var layer2Sampler: sampler;
@group(0) @binding(7) var layer3: texture_2d<f32>;
@group(0) @binding(8) var layer3Sampler: sampler;
@group(0) @binding(9) var mask: texture_2d<f32>;
@group(0) @binding(10) var maskSampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) layerUv: vec2<f32>,
  @location(1) maskUv: vec2<f32>,
  @location(2) light: vec3<f32>,
  @location(3) distance: f32,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VsOut {
  var out: VsOut;
  out.position = globals.mvp * vec4<f32>(position, 1.0);
  out.layerUv = position.xy * globals.chunk.w;
  let inChunk = (position.xy - globals.chunk.xy) * globals.chunk.z;
  out.maskUv = (inChunk * 63.0 + 0.5) / 64.0;
  out.light = globals.ambient.rgb + globals.diffuse.rgb * max(dot(normal, globals.light.xyz), 0.0);
  out.distance = distance(position, globals.eye.xyz);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let m = textureSample(mask, maskSampler, in.maskUv);
  var color = textureSample(layer0, layer0Sampler, in.layerUv).rgb;
  color = mix(color, textureSample(layer1, layer1Sampler, in.layerUv).rgb, m.g);
  color = mix(color, textureSample(layer2, layer2Sampler, in.layerUv).rgb, m.b);
  color = mix(color, textureSample(layer3, layer3Sampler, in.layerUv).rgb, m.a);
  color = color * in.light * mix(globals.light.w, 1.0, m.r);
  let fog = clamp((in.distance - globals.fogRange.x) * globals.fogRange.y, 0.0, 1.0);
  color = mix(color, globals.fogColor.rgb, fog);
  return vec4<f32>(color, 1.0);
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_chunk;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
out vec2 v_layerUv;
out vec2 v_maskUv;
out vec3 v_light;
out float v_distance;
void main() {
  v_distance = distance(a_position, u_eye.xyz);
  v_light = u_ambient.rgb + u_diffuse.rgb * max(dot(a_normal, u_light.xyz), 0.0);
  v_layerUv = a_position.xy * u_chunk.w;
  vec2 inChunk = (a_position.xy - u_chunk.xy) * u_chunk.z;
  v_maskUv = (inChunk * 63.0 + 0.5) / 64.0;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_chunk;
  vec4 u_light;
  vec4 u_ambient;
  vec4 u_diffuse;
  vec4 u_eye;
  vec4 u_fogColor;
  vec4 u_fogRange;
};
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;
uniform sampler2D u_texture4;
in vec2 v_layerUv;
in vec2 v_maskUv;
in vec3 v_light;
in float v_distance;
out vec4 o_color;
void main() {
  vec4 m = texture(u_texture4, v_maskUv);
  vec3 color = texture(u_texture0, v_layerUv).rgb;
  color = mix(color, texture(u_texture1, v_layerUv).rgb, m.g);
  color = mix(color, texture(u_texture2, v_layerUv).rgb, m.b);
  color = mix(color, texture(u_texture3, v_layerUv).rgb, m.a);
  color = color * v_light * mix(u_light.w, 1.0, m.r);
  float fog = clamp((v_distance - u_fogRange.x) * u_fogRange.y, 0.0, 1.0);
  color = mix(color, u_fogColor.rgb, fog);
  o_color = vec4(color, 1.0);
}
`,
};
