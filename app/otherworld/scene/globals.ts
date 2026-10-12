/**
 * Uniform objects shared (by reference) across every custom material, plus the
 * time-of-day model. One component (<WorldClock/>) writes these each frame.
 *
 * Colour convention for custom shaders: colours are passed as sRGB triples in
 * Vector3s, shading happens in sRGB, and each shader converts to linear on
 * output (the render target expects linear light).
 */
import * as THREE from 'three';

export const srgb = (hex: string) => {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace);
  const out = c.clone().convertLinearToSRGB();
  return new THREE.Vector3(out.r, out.g, out.b);
};

const srgbCache = new Map<string, THREE.Vector3>();
/** Read-only cached variant for per-frame `.copy()` calls. Never mutate the result. */
export const srgbCached = (hex: string) => {
  let v = srgbCache.get(hex);
  if (!v) {
    v = srgb(hex);
    srgbCache.set(hex, v);
  }
  return v;
};

export const globalUniforms = {
  uTime: { value: 0 },
  uFogColor: { value: srgb('#a5b4cf') },
  uFogNear: { value: 22 },
  uFogFar: { value: 70 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunColor: { value: srgb('#fff4d6') },
  uAmbient: { value: srgb('#6b7280') },
  uMushroom: { value: 0 },
  uUnfold: { value: 1 },
  /** Radius (world units) of the intro reveal wave. ≥ 80 = fully revealed. */
  uReveal: { value: 100 },
  uNight: { value: 0 },
  uSkyTop: { value: srgb('#2563eb') },
  uSkyHorizon: { value: srgb('#dbeafe') },
  uVoid: { value: srgb('#09090b') },
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
function mixHex(a: string, b: string, t: number, out: THREE.Vector3) {
  tmpA.setStyle(a, THREE.SRGBColorSpace).convertLinearToSRGB();
  tmpB.setStyle(b, THREE.SRGBColorSpace).convertLinearToSRGB();
  tmpA.lerp(tmpB, t);
  return out.set(tmpA.r, tmpA.g, tmpA.b);
}

export interface SkyState {
  top: THREE.Vector3;
  horizon: THREE.Vector3;
  fog: THREE.Vector3;
  sun: THREE.Vector3;
  ambient: THREE.Vector3;
  night: number;
  sunDir: THREE.Vector3;
  sunIntensity: number;
}

const state: SkyState = {
  top: new THREE.Vector3(),
  horizon: new THREE.Vector3(),
  fog: new THREE.Vector3(),
  sun: new THREE.Vector3(),
  ambient: new THREE.Vector3(),
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
  if (R >= 80) return 1;
  const t = Math.min(1, Math.max(0, (R - 6 - Math.hypot(x, z)) / 3));
  // ease-out-back for a little pop
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** GLSL twin of revealScale for instanced props (uses uReveal). */
export const glslReveal = /* glsl */ `
uniform float uReveal;
float revealScale(vec2 xz) {
  if (uReveal >= 80.0) return 1.0;
  float t = clamp((uReveal - 6.0 - length(xz)) / 3.0, 0.0, 1.0);
  if (t <= 0.0) return 0.0;
  float c1 = 1.70158; float c3 = c1 + 1.0; float u = t - 1.0;
  return 1.0 + c3 * u * u * u + c1 * u * u;
}
`;

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
