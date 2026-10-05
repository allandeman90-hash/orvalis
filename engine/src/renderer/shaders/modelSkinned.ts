import type { ShaderSource } from '../backend';

/**
 * Model shader with GPU skinning (P4.5, spec §37, §60): linear blend skinning with up to 4 bones per vertex,
 *     skinned = Σ bones[index_i] × position × weight_i          (weights arrive as 0..1 and sum to 1)
 * then the vertex is placed by one model matrix. The matrix palette is an array of mat4 at the end of the
 * uniform block (the document's « uniform arrays for small skeletons »).
 * Normals go through the same blend (as directions) and are re-normalised: correct as long as bone matrices and
 * the model matrix are rotations, translations and UNIFORM scales.
 * Lighting is the terrain's (spec §8): per vertex,
 *     light = ambient + diffuse · max(dot(N, L), 0)
 * then texture × light, then the terrain's distance fog.
 *
 * Vertex layout: MODEL_VERTEX_LAYOUT (position, normal, uv, bone weights as 0..1, bone indices as integers).
 *
 * Uniform block: mat4 mvp, mat4 model, vec4 light (unit toLight), vec4 ambient, vec4 diffuse, vec4 eye,
 * vec4 fogColor, vec4 fogRange (start, 1 / (end − start)), vec4 params (debug mode, 0, 0, 0),
 * vec4 material (1 = unlit, alpha-test reference, material alpha, 0), mat4 bones[MODEL_PALETTE_BONES].
 *
 * Materials (P4.6, spec §78–§82): an unlit surface gets light = 1; the fragment's alpha is
 * texture alpha × material alpha and the fragment is discarded when it is below the reference (0 = no test);
 * that alpha is what the pipeline's blending mode uses. The fog colour is chosen per material by the renderer.
 * Debug modes: 0 = lit and textured · 1 = normal as colour · 2 = bone weights 0..2 as r, g, b ·
 * 3 = first bone index: bits 0, 1, 2 of (index + 1) as r, g, b.
 *
 * OUR CHOICE: MODEL_PALETTE_BONES = 128. The document gives no limit; 128 covers its 96-bone reference
 * character, and the block (8448 bytes) stays under the 16384 bytes every WebGL2 implementation must accept.
 * A larger skeleton will need a texture / storage-buffer palette (not done).
 */
export const MODEL_PALETTE_BONES = 128;
/** Floats before the palette in the uniform block. */
export const MODEL_PALETTE_OFFSET_FLOATS = 64;
/** Float offset of the `material` vector in the uniform block. */
export const MODEL_MATERIAL_OFFSET_FLOATS = 60;
export const MODEL_UNIFORM_FLOATS = MODEL_PALETTE_OFFSET_FLOATS + MODEL_PALETTE_BONES * 16;
export const MODEL_UNIFORM_BYTES = MODEL_UNIFORM_FLOATS * 4;
export const MODEL_DEBUG_MODE = { lit: 0, normals: 1, weights: 2, bones: 3 } as const;
export type ModelDebugMode = keyof typeof MODEL_DEBUG_MODE;

export const MODEL_SHADER: ShaderSource = {
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
  material: vec4<f32>,
  bones: array<mat4x4<f32>, ${MODEL_PALETTE_BONES}>,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var albedoSampler: sampler;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) light: vec3<f32>,
  @location(2) distance: f32,
  @location(3) debug: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>, @location(3) weights: vec4<f32>, @location(4) bones: vec4<u32>) -> VsOut {
  var out: VsOut;
  let skin = globals.bones[bones.x] * weights.x + globals.bones[bones.y] * weights.y + globals.bones[bones.z] * weights.z + globals.bones[bones.w] * weights.w;
  let skinned = vec4<f32>((skin * vec4<f32>(position, 1.0)).xyz, 1.0);
  let world = (globals.model * skinned).xyz;
  let n = normalize((globals.model * vec4<f32>((skin * vec4<f32>(normal, 0.0)).xyz, 0.0)).xyz);
  out.position = globals.mvp * skinned;
  out.uv = uv;
  out.light = mix(globals.ambient.rgb + globals.diffuse.rgb * max(dot(n, globals.light.xyz), 0.0), vec3<f32>(1.0), globals.material.x);
  out.distance = distance(world, globals.eye.xyz);
  let code = bones.x + 1u;
  let boneColour = vec3<f32>(f32(code & 1u), f32((code >> 1u) & 1u), f32((code >> 2u) & 1u));
  var debug = n * 0.5 + vec3<f32>(0.5);
  if (globals.params.x > 2.5) {
    debug = boneColour;
  } else if (globals.params.x > 1.5) {
    debug = weights.rgb;
  }
  out.debug = debug;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let texSample = textureSample(albedo, albedoSampler, in.uv);
  let texel = texSample.rgb;
  let alpha = texSample.a * globals.material.z;
  if (alpha < globals.material.y) {
    discard;
  }
  let fog = clamp((in.distance - globals.fogRange.x) * globals.fogRange.y, 0.0, 1.0);
  let lit = mix(texel * in.light, globals.fogColor.rgb, fog);
  return vec4<f32>(mix(lit, in.debug, step(0.5, globals.params.x)), alpha);
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
  vec4 u_material;
  mat4 u_bones[${MODEL_PALETTE_BONES}];
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_weights;
layout(location = 4) in uvec4 a_bones;
out vec2 v_uv;
out vec3 v_light;
out float v_distance;
out vec3 v_debug;
void main() {
  mat4 skin = u_bones[a_bones.x] * a_weights.x + u_bones[a_bones.y] * a_weights.y + u_bones[a_bones.z] * a_weights.z + u_bones[a_bones.w] * a_weights.w;
  vec4 skinned = vec4((skin * vec4(a_position, 1.0)).xyz, 1.0);
  vec3 world = (u_model * skinned).xyz;
  vec3 n = normalize((u_model * vec4((skin * vec4(a_normal, 0.0)).xyz, 0.0)).xyz);
  v_uv = a_uv;
  v_light = mix(u_ambient.rgb + u_diffuse.rgb * max(dot(n, u_light.xyz), 0.0), vec3(1.0), u_material.x);
  v_distance = distance(world, u_eye.xyz);
  uint code = a_bones.x + 1u;
  vec3 boneColour = vec3(float(code & 1u), float((code >> 1u) & 1u), float((code >> 2u) & 1u));
  vec3 debug = n * 0.5 + vec3(0.5);
  if (u_params.x > 2.5) {
    debug = boneColour;
  } else if (u_params.x > 1.5) {
    debug = a_weights.rgb;
  }
  v_debug = debug;
  gl_Position = u_mvp * skinned;
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
  vec4 u_material;
  mat4 u_bones[${MODEL_PALETTE_BONES}];
};
uniform sampler2D u_texture0;
in vec2 v_uv;
in vec3 v_light;
in float v_distance;
in vec3 v_debug;
out vec4 o_color;
void main() {
  vec4 texSample = texture(u_texture0, v_uv);
  vec3 texel = texSample.rgb;
  float alpha = texSample.a * u_material.z;
  if (alpha < u_material.y) discard;
  float fog = clamp((v_distance - u_fogRange.x) * u_fogRange.y, 0.0, 1.0);
  vec3 lit = mix(texel * v_light, u_fogColor.rgb, fog);
  o_color = vec4(mix(lit, v_debug, step(0.5, u_params.x)), alpha);
}
`,
};
