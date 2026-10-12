/**
 * TSL helpers shared by every node material in the world. These compile to
 * real WGSL / GLSL functions (via setLayout) so they're emitted once per shader.
 */
import { Color, type Node } from 'three/webgpu';
import {
  Fn,
  abs,
  cos,
  cross,
  dot,
  float,
  floor,
  fract,
  int,
  mat2,
  mix,
  mod,
  select,
  sin,
  sqrt,
  vec2,
  vec3,
} from 'three/tsl';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;
/** Anything colour-like: vec3 nodes or THREE.Color uniforms. Wrap with vec3() before maths. */
export type C3 = V3 | Node<'color'>;
/** A constant linear-space colour from an sRGB hex string. */
export const hex3 = (hex: string) => {
  const c = new Color(hex);
  return vec3(c.r, c.g, c.b);
};

/** Colour uniforms are vec3s in the shader; this only narrows the TS type. */
export const v3 = (c: C3) => c as V3;

export const hash12 = Fn(([p]: [V2]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}).setLayout({ name: 'hash12', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

export const hash22 = Fn(([p]: [V2]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(vec2(p3.x, p3.x).add(p3.yz).mul(p3.zy));
}).setLayout({ name: 'hash22', type: 'vec2', inputs: [{ name: 'p', type: 'vec2' }] });

export const vnoise = Fn(([p]: [V2]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash12(i);
  const b = hash12(i.add(vec2(1, 0)));
  const c = hash12(i.add(vec2(0, 1)));
  const d = hash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}).setLayout({ name: 'vnoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

export const fbm = Fn(([p0]: [V2]) => {
  const p = vec2(p0).toVar();
  const s = float(0).toVar();
  const a = float(0.5).toVar();
  for (let i = 0; i < 4; i++) {
    s.addAssign(a.mul(vnoise(p)));
    p.assign(p.mul(2.03).add(vec2(17.1, 9.2)));
    a.mulAssign(0.5);
  }
  return s;
}).setLayout({ name: 'fbm', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

export const luma = (c: V3) => dot(c, vec3(0.299, 0.587, 0.114));

/** Ordered 4×4 Bayer threshold in (0, 1) for an integer-ish pixel coordinate. */
export const bayer4 = Fn(([p]: [V2]) => {
  const q = mod(floor(p), 4);
  // Bit-interleave formulation of the 4×4 matrix (no array lookups needed).
  const x = int(q.x);
  const y = int(q.y);
  const xy = x.bitXor(y);
  const v = xy
    .bitAnd(1)
    .shiftLeft(3)
    .bitOr(y.bitAnd(1).shiftLeft(2))
    .bitOr(xy.bitAnd(2))
    .bitOr(y.bitAnd(2).shiftRight(1));
  return float(v).add(0.5).div(16);
}).setLayout({ name: 'bayer4', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

export const gradient3 = (t: F, a: V3, b: V3, c: V3) =>
  select(t.lessThan(0.5), mix(a, b, t.mul(2)), mix(b, c, t.mul(2).sub(1)));

export const hueShift = Fn(([color, shift]: [V3, F]) => {
  const k = vec3(0.57735);
  const c = cos(shift);
  return color.mul(c).add(cross(k, color).mul(sin(shift))).add(k.mul(dot(k, color)).mul(c.oneMinus()));
}).setLayout({
  name: 'hueShift',
  type: 'vec3',
  inputs: [
    { name: 'color', type: 'vec3' },
    { name: 'shift', type: 'float' },
  ],
});

export const rot2 = (a: F | number) => {
  const c = cos(a);
  const s = sin(a);
  return mat2(c, s.negate(), s, c);
};

/** Smooth 0..1 falloff: 1 inside r0, 0 beyond r1. */
export const falloff = (d: F, r0: number | F, r1: number | F) => float(1).sub(d.smoothstep(r0, r1));

export const absMax2 = (p: V2) => abs(p.x).max(abs(p.y));

export const sqrt01 = (v: F) => sqrt(v.clamp(0, 1));
