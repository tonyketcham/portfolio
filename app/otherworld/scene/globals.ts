/**
 * TSL uniforms shared (by reference) across every node material, plus the
 * time-of-day model. One component (<WorldClock/>) writes these each frame.
 *
 * Colour convention: everything is in three's linear working space. Hex
 * strings go through THREE.Color (sRGB → linear) and the render pipeline does
 * the final linear → sRGB conversion once, in the post stack.
 */
import * as THREE from 'three';
import { float, select, uniform, vec2 } from 'three/tsl';
import type { F, V2 } from '../shaders/common';

const lin = (hex: string) => new THREE.Color(hex);

export const globalUniforms = {
  uTime: uniform(0),
  uFogColor: uniform(lin('#a5b4cf')),
  uFogNear: uniform(22),
  uFogFar: uniform(70),
  uSunDir: uniform(new THREE.Vector3(0.4, 0.8, 0.3).normalize()),
  uSunColor: uniform(lin('#fff4d6')),
  uAmbient: uniform(lin('#6b7280')),
  uMushroom: uniform(0),
  uUnfold: uniform(1),
  /** Radius (world units) of the island's reveal wave. ≥ 80 = fully revealed. */
  uReveal: uniform(100),
  uNight: uniform(0),
  uSkyTop: uniform(lin('#2563eb')),
  uSkyHorizon: uniform(lin('#dbeafe')),
  uVoid: uniform(lin('#09090b')),
  uAccent: uniform(lin('#3b82f6')),
};

interface SkyKey {
  t: number;
  top: string;
  horizon: string;
  fog: string;
  sun: string;
  ambient: string;
  night: number;
}

const KEYS: SkyKey[] = [
  { t: 0.0, top: '#03040b', horizon: '#1a1d3a', fog: '#121528', sun: '#7c8cc7', ambient: '#2b3150', night: 1 },
  { t: 0.2, top: '#0b0b24', horizon: '#3b2a5a', fog: '#22203b', sun: '#9a8cd6', ambient: '#352e4f', night: 0.85 },
  { t: 0.26, top: '#312e81', horizon: '#fb923c', fog: '#6b4b5e', sun: '#ffb37a', ambient: '#5b4a5c', night: 0.3 },
  { t: 0.36, top: '#3b82f6', horizon: '#c7ddf7', fog: '#9fb8d6', sun: '#fff1d0', ambient: '#7e8aa0', night: 0 },
  { t: 0.5, top: '#2563eb', horizon: '#dbeafe', fog: '#b4cbe6', sun: '#ffffff', ambient: '#8a96aa', night: 0 },
  { t: 0.66, top: '#3730a3', horizon: '#fcd9a8', fog: '#c3a397', sun: '#ffd9a8', ambient: '#8a7f8a', night: 0 },
  { t: 0.74, top: '#2e1065', horizon: '#f472b6', fog: '#7a4a6e', sun: '#ff9a7a', ambient: '#5e4560', night: 0.25 },
  { t: 0.8, top: '#0f0a2e', horizon: '#6d28d9', fog: '#2e2347', sun: '#a78bfa', ambient: '#3b2f55', night: 0.7 },
  { t: 1.0, top: '#03040b', horizon: '#1a1d3a', fog: '#121528', sun: '#7c8cc7', ambient: '#2b3150', night: 1 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
/** Mix two hex colours perceptually (in sRGB), store the linear result. */
function mixHex(a: string, b: string, t: number, out: THREE.Color) {
  tmpA.setStyle(a, THREE.SRGBColorSpace).convertLinearToSRGB();
  tmpB.setStyle(b, THREE.SRGBColorSpace).convertLinearToSRGB();
  tmpA.lerp(tmpB, t);
  return out.copy(tmpA).convertSRGBToLinear();
}

export interface SkyState {
  top: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  ambient: THREE.Color;
  night: number;
  sunDir: THREE.Vector3;
  sunIntensity: number;
}

const state: SkyState = {
  top: new THREE.Color(),
  horizon: new THREE.Color(),
  fog: new THREE.Color(),
  sun: new THREE.Color(),
  ambient: new THREE.Color(),
  night: 0,
  sunDir: new THREE.Vector3(),
  sunIntensity: 1,
};

/** t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export function skyAt(t: number): SkyState {
  const tt = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t < tt) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = (tt - a.t) / Math.max(1e-6, b.t - a.t);
  const s = f * f * (3 - 2 * f);
  mixHex(a.top, b.top, s, state.top);
  mixHex(a.horizon, b.horizon, s, state.horizon);
  mixHex(a.fog, b.fog, s, state.fog);
  mixHex(a.sun, b.sun, s, state.sun);
  mixHex(a.ambient, b.ambient, s, state.ambient);
  state.night = a.night + (b.night - a.night) * s;

  const angle = (tt - 0.25) * Math.PI * 2;
  const elevation = Math.sin(angle);
  // By night the "sun" is the moon, opposite and dimmer.
  const isNight = elevation < 0;
  const az = isNight ? angle + Math.PI : angle;
  const el = Math.max(0.22, Math.abs(elevation) * 0.95);
  state.sunDir.set(-Math.cos(az) * 0.9, el, 0.45).normalize();
  state.sunIntensity = isNight ? 0.45 : 0.65 + 0.3 * Math.min(1, elevation * 2.5);
  return state;
}

export function localTimeOfDay() {
  const d = new Date();
  return (d.getHours() + d.getMinutes() / 60) / 24;
}

/** 0 → 1 pop-in scale for a prop at (x, z) as the reveal wave passes it. */
export function revealScale(x: number, z: number) {
  const R = globalUniforms.uReveal.value;
  // only the island takes part in the reveal wave (not the house or the basement)
  if (R >= 80 || Math.hypot(x, z) > 60) return 1;
  const t = Math.min(1, Math.max(0, (R - 6 - Math.hypot(x, z)) / 3));
  // ease-out-back for a little pop
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** TSL twin of revealScale for instanced props. */
export const revealScaleNode = (xz: V2): F => {
  const R = globalUniforms.uReveal;
  const t = R.sub(6).sub(vec2(xz).length()).div(3).clamp(0, 1);
  const u = t.sub(1);
  const c1 = 1.70158;
  const back = float(1).add(u.mul(u).mul(u).mul(c1 + 1)).add(u.mul(u).mul(c1));
  return select(R.greaterThanEqual(80), float(1), select(t.lessThanEqual(0), float(0), back));
};

/** Push a time of day into every shared uniform. Returns the sky state for lights/fog. */
export function applyTimeOfDay(tod: number) {
  const sky = skyAt(tod);
  globalUniforms.uSkyTop.value.copy(sky.top);
  globalUniforms.uSkyHorizon.value.copy(sky.horizon);
  globalUniforms.uFogColor.value.copy(sky.fog);
  globalUniforms.uSunColor.value.copy(sky.sun).multiplyScalar(sky.sunIntensity);
  globalUniforms.uAmbient.value.copy(sky.ambient);
  globalUniforms.uSunDir.value.copy(sky.sunDir);
  globalUniforms.uNight.value = sky.night;
  return sky;
}
