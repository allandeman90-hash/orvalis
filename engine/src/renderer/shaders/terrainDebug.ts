import type { ShaderSource, VertexLayout } from '../backend';

/**
 * Terrain debug shader (P1.4). NOT a material system and NOT lighting: it only
 * shows raw vertex data.
 *   mode 0 « color »   → the per-vertex debug colour
 *   mode 1 « normals » → 0.5 + 0.5 · normal  (x → red, y → green, z → blue)
 *   mode 2 « solid »   → the colour in params.yzw (debug lines such as chunk bounds)
 * A flat ground (normal 0,0,1) is therefore rgb(128,128,255); an inverted
 * normal turns dark blue-less; a NaN shows as black.
 *
 * Vertex: position (xyz) · normal (xyz) · colour (rgb) — the same bytes on
 * WebGPU and WebGL2.
 */
export const TERRAIN_DEBUG_LAYOUT: VertexLayout = {
  stride: 36,
  attributes: [
    { location: 0, format: 'float32x3', offset: 0 },
    { location: 1, format: 'float32x3', offset: 12 },
    { location: 2, format: 'float32x3', offset: 24 },
  ],
};

/** Uniform block `Globals`: mat4 mvp, then vec4 params (x = mode, yzw = solid colour). */
export const TERRAIN_DEBUG_UNIFORM_FLOATS = 20;
export const TERRAIN_DEBUG_UNIFORM_BYTES = TERRAIN_DEBUG_UNIFORM_FLOATS * 4;

/** 'textured' is the normal rendering (terrainTextured shader); the two others are debug views drawn by this shader. */
export type TerrainDebugMode = 'color' | 'normals' | 'textured';
/** Value of params.x. A scene that cannot draw textures shows the debug colours instead. */
export const TERRAIN_DEBUG_MODE: Readonly<Record<TerrainDebugMode, number>> = { color: 0, normals: 1, textured: 0 };
/** Value of params.x for the solid-colour mode. */
export const TERRAIN_DEBUG_SOLID = 2;

export const TERRAIN_DEBUG_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  mvp: mat4x4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) color: vec3<f32>) -> VsOut {
  var out: VsOut;
  out.position = globals.mvp * vec4<f32>(position, 1.0);
  out.color = color;
  out.normal = normal;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (globals.params.x > 1.5) {
    return vec4<f32>(globals.params.yzw, 1.0);
  }
  if (globals.params.x > 0.5) {
    return vec4<f32>(0.5 + 0.5 * normalize(in.normal), 1.0);
  }
  return vec4<f32>(in.color, 1.0);
}
`,
  glslVertex: `#version 300 es
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_params;
};
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;
out vec3 v_color;
out vec3 v_normal;
void main() {
  v_color = a_color;
  v_normal = a_normal;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  mat4 u_mvp;
  vec4 u_params;
};
in vec3 v_color;
in vec3 v_normal;
out vec4 o_color;
void main() {
  if (u_params.x > 1.5) {
    o_color = vec4(u_params.yzw, 1.0);
  } else if (u_params.x > 0.5) {
    o_color = vec4(0.5 + 0.5 * normalize(v_normal), 1.0);
  } else {
    o_color = vec4(v_color, 1.0);
  }
}
`,
};
