/** The infinite dot-grid canvas under everything, and the sky dome (TSL). */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  asin,
  atan,
  cross,
  dot,
  exp,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionLocal,
  positionView,
  positionWorld,
  pow,
  sin,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { ISLAND_RADIUS } from '../world/map';
import { globalUniforms } from '../scene/globals';
import { falloff, hash12, hueShift, v3 } from './common';

export const voidUniforms = {
  ripple: uniform(1),
  dotSize: uniform(1),
  /** Strength of the selection bounds drawn around `selCenter`. */
  sel: uniform(1),
  selCenter: uniform(new THREE.Vector2(0, 0)),
  /** Half extents of the bounds: square for the island, the plan's rectangle for the house. */
  selHalf: uniform(new THREE.Vector2(ISLAND_RADIUS + 2.5, ISLAND_RADIUS + 2.5)),
  /** Where the ripples emanate from (follows the active location). */
  origin: uniform(new THREE.Vector2(0, 0)),
};

export function createVoidMaterial() {
  const U = globalUniforms;
  const V = voidUniforms;
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const r = p.sub(V.origin).length();
    const f = fract(p.mul(2)).sub(0.5);
    const ripple = sin(r.mul(0.85).sub(U.uTime.mul(1.5))).mul(0.5).add(0.5);
    const wave = ripple.smoothstep(0.55, 1.0).mul(exp(max(r.sub(26), 0).mul(-0.035))).mul(V.ripple);
    const size = wave.mul(0.08).add(0.055).mul(V.dotSize);
    const dotMask = falloff(f.length(), size, size.add(0.035));
    const far = positionView.z.negate().smoothstep(26, 120);
    const dotCol = mix(vec3(0.022, 0.022, 0.027), v3(U.uAccent).mul(0.8), wave.mul(0.35)).toVar();
    dotCol.assign(mix(dotCol, hueShift(vec3(0.8, 0.04, 0.3), U.uTime.add(r.mul(0.2))), U.uMushroom.mul(0.7)));
    const col = mix(v3(U.uVoid), dotCol, dotMask.mul(far.oneMinus())).toVar();

    // A selected layer: dashed bounds + corner handles.
    const q = p.sub(V.selCenter);
    const a = abs(q);
    const H = V.selHalf;
    const e = a.sub(H);
    const onEdge = falloff(abs(max(e.x, e.y)), 0.04, 0.09);
    const along = e.x.greaterThan(e.y).select(q.y, q.x);
    const dash = step(0.5, fract(along.mul(0.5).sub(U.uTime.mul(0.25))));
    const corner = abs(a.sub(H));
    const cm = max(corner.x, corner.y);
    const handle = step(cm, 0.45).mul(float(1).sub(step(cm, 0.3)));
    const handleFill = step(cm, 0.3);
    col.assign(mix(col, v3(U.uAccent), onEdge.mul(dash).mul(V.sel)));
    col.assign(mix(col, v3(U.uAccent), handle.mul(V.sel)));
    col.assign(mix(col, vec3(0.96), handleFill.mul(V.sel)));
    return col;
  })();
  return m;
}

export function createSkyMaterial() {
  const U = globalUniforms;
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  m.colorNode = Fn(() => {
    const d = normalize(positionLocal);
    const y = d.y;
    const col = mix(v3(U.uSkyHorizon), v3(U.uSkyTop), pow(y.clamp(0, 1), 0.55)).toVar();
    // Below the horizon: the canvas.
    col.assign(mix(col, v3(U.uVoid), y.smoothstep(0.02, -0.12)));

    // Halftone sun / moon
    const s = normalize(U.uSunDir);
    const t1 = normalize(cross(s, vec3(0, 1, 0)));
    const t2 = cross(t1, s);
    const suv = vec2(dot(d, t1), dot(d, t2)).div(0.09);
    const facing = step(0, dot(d, s));
    const sr = suv.length();
    const cell = fract(suv.mul(4)).sub(0.5);
    const dotR = float(0.48).mul(falloff(sr, 0.2, 1.15));
    const sunDots = falloff(cell.length(), dotR, dotR.add(0.06)).mul(facing);
    const glow = exp(sr.mul(-0.9)).mul(0.35).mul(facing);
    const sunCol = mix(v3(U.uSunColor), vec3(1), 0.35);
    col.assign(mix(col, sunCol, sunDots.mul(U.uNight.mul(-0.4).add(1))));
    col.addAssign(sunCol.mul(glow).mul(U.uNight.mul(-0.6).add(1)));

    // Stars as design-tool crosshairs
    const sph = vec2(atan(d.z, d.x), asin(y.clamp(-1, 1))).mul(24);
    const sc = floor(sph);
    const sf = fract(sph).sub(0.5);
    const h = hash12(sc);
    const star = step(0.965, h).mul(step(0.05, y));
    const tw = sin(U.uTime.mul(h.mul(3).add(1.5)).add(h.mul(40))).mul(0.45).add(0.55);
    const cross1 = falloff(abs(sf.x), 0.02, 0.05).mul(falloff(abs(sf.y), 0.12, 0.2));
    const cross2 = falloff(abs(sf.y), 0.02, 0.05).mul(falloff(abs(sf.x), 0.12, 0.2));
    col.addAssign(vec3(0.7, 0.78, 1.0).mul(star).mul(max(cross1, cross2)).mul(tw).mul(U.uNight));

    col.assign(mix(col, hueShift(col, U.uTime.mul(0.5).add(y.mul(4))), U.uMushroom.mul(0.6)));
    return vec4(col, 1);
  })();
  return m;
}
