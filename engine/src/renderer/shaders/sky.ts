import type { ShaderSource, VertexLayout } from '../backend';

/**
 * Sky (spec §12): an artist-controlled gradient, not atmospheric scattering.
 * One triangle covering the screen; for every pixel the fragment shader
 * rebuilds the view direction and colours it:
 *
 *   e      = direction.z                         (0 at the horizon, 1 straight up)
 *   k      = 1 − clamp(e, 0, 1)
 *   sky    = mix(horizon, zenith, 1 − k³)        (below the horizon: the horizon colour)
 *   d      = max(dot(direction, sun), 0)
 *   above  = clamp(40·e + 0.5, 0, 1)             (nothing of the sun below the horizon line)
 *   sky   += sunColour · d⁶⁴ · glow · above      (halo)
 *   disc   = clamp((d − cosOuter) · invEdge, 0, 1) · above
 *   colour = mix(sky, sunColour, disc)
 *
 * Only +, ×, clamp, mix and normalize: no pow(), so both backends compute the same thing.
 * The CPU twin of this formula is skyColourAt() in skyRender/sky.ts.
 *
 * Uniform block `Globals`, 8 vec4:
 *   right·tanHalfFovX | up·tanHalfFovY | forward | zenith | horizon | sun xyz, cosOuter | sunColour rgb, glow | invEdge, 0, 0, 0
 */
export const SKY_LAYOUT: VertexLayout = { stride: 8, attributes: [{ location: 0, format: 'float32x2', offset: 0 }] };
export const SKY_UNIFORM_FLOATS = 32;
export const SKY_UNIFORM_BYTES = SKY_UNIFORM_FLOATS * 4;
/** Clip-space triangle covering the whole screen, counter-clockwise. */
export const SKY_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

export const SKY_SHADER: ShaderSource = {
  wgsl: /* wgsl */ `
struct Globals {
  right: vec4<f32>,
  up: vec4<f32>,
  forward: vec4<f32>,
  zenith: vec4<f32>,
  horizon: vec4<f32>,
  sun: vec4<f32>,
  sunColor: vec4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globals: Globals;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};

@vertex
fn vs_main(@location(0) position: vec2<f32>) -> VsOut {
  var out: VsOut;
  out.position = vec4<f32>(position, 0.5, 1.0);
  out.ndc = position;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let dir = normalize(globals.forward.xyz + in.ndc.x * globals.right.xyz + in.ndc.y * globals.up.xyz);
  let e = dir.z;
  let k = 1.0 - clamp(e, 0.0, 1.0);
  var sky = mix(globals.horizon.rgb, globals.zenith.rgb, 1.0 - k * k * k);
  let d = max(dot(dir, globals.sun.xyz), 0.0);
  let above = clamp(40.0 * e + 0.5, 0.0, 1.0);
  let d2 = d * d;
  let d4 = d2 * d2;
  let d8 = d4 * d4;
  let d16 = d8 * d8;
  let d32 = d16 * d16;
  sky = sky + globals.sunColor.rgb * (d32 * d32 * globals.sunColor.a * above);
  let disc = clamp((d - globals.sun.w) * globals.params.x, 0.0, 1.0) * above;
  return vec4<f32>(mix(sky, globals.sunColor.rgb, disc), 1.0);
}
`,
  glslVertex: `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_ndc;
void main() {
  v_ndc = a_position;
  gl_Position = vec4(a_position, 0.5, 1.0);
}
`,
  glslFragment: `#version 300 es
precision highp float;
layout(std140) uniform Globals {
  vec4 u_right;
  vec4 u_up;
  vec4 u_forward;
  vec4 u_zenith;
  vec4 u_horizon;
  vec4 u_sun;
  vec4 u_sunColor;
  vec4 u_params;
};
in vec2 v_ndc;
out vec4 o_color;
void main() {
  vec3 dir = normalize(u_forward.xyz + v_ndc.x * u_right.xyz + v_ndc.y * u_up.xyz);
  float e = dir.z;
  float k = 1.0 - clamp(e, 0.0, 1.0);
  vec3 sky = mix(u_horizon.rgb, u_zenith.rgb, 1.0 - k * k * k);
  float d = max(dot(dir, u_sun.xyz), 0.0);
  float above = clamp(40.0 * e + 0.5, 0.0, 1.0);
  float d2 = d * d;
  float d4 = d2 * d2;
  float d8 = d4 * d4;
  float d16 = d8 * d8;
  float d32 = d16 * d16;
  sky = sky + u_sunColor.rgb * (d32 * d32 * u_sunColor.a * above);
  float disc = clamp((d - u_sun.w) * u_params.x, 0.0, 1.0) * above;
  o_color = vec4(mix(sky, u_sunColor.rgb, disc), 1.0);
}
`,
};
