/** The infinite dot-grid canvas under the island, and the sky dome. */
import * as THREE from 'three';
import { ISLAND_RADIUS } from '../world/map';
import { globalUniforms, srgb } from '../scene/globals';
import { glslCommon, glslGlobals } from './common';

const SELECTION_HALF = ISLAND_RADIUS + 2.5;

export const voidVertex = /* glsl */ `
varying vec3 vWorld;
varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const voidFragment = /* glsl */ `
${glslGlobals}
${glslCommon}
uniform vec3 uVoid;
uniform vec3 uAccent;
uniform float uRipple;
uniform float uDotSize;
uniform float uSel;
uniform float uReveal;
varying vec3 vWorld;
varying float vDist;
void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  vec2 f = fract(p * 2.0) - 0.5;
  float ripple = sin(r * 0.85 - uTime * 1.5) * 0.5 + 0.5;
  float wave = smoothstep(0.55, 1.0, ripple) * exp(-max(r - 26.0, 0.0) * 0.035) * uRipple;
  float size = (0.055 + 0.08 * wave) * uDotSize;
  float dotMask = 1.0 - smoothstep(size, size + 0.035, length(f));
  float far = smoothstep(26.0, 120.0, vDist);
  vec3 dotCol = mix(vec3(0.16, 0.16, 0.18), uAccent * 0.9, wave * 0.35);
  dotCol = mix(dotCol, hueShift(vec3(0.9, 0.2, 0.6), uTime + r * 0.2), uMushroom * 0.7);
  vec3 col = mix(uVoid, dotCol, dotMask * (1.0 - far));

  // The island is a selected layer: dashed bounds + corner handles.
  float H = ${SELECTION_HALF.toFixed(1)};
  vec2 a = abs(p);
  float onEdge = (1.0 - smoothstep(0.04, 0.09, abs(max(a.x, a.y) - H)));
  float along = (a.x > a.y ? p.y : p.x);
  float dash = step(0.5, fract(along * 0.5 - uTime * 0.25));
  vec2 corner = abs(a - vec2(H));
  float handle = step(max(corner.x, corner.y), 0.45) * (1.0 - step(max(corner.x, corner.y), 0.3));
  float handleFill = step(max(corner.x, corner.y), 0.3);
  float sel = uSel * step(uReveal, 79.0) ;
  sel = max(sel, uSel * 0.65);
  col = mix(col, uAccent, onEdge * dash * sel);
  col = mix(col, uAccent, handle * sel);
  col = mix(col, vec3(0.98), handleFill * sel);
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const skyFragment = /* glsl */ `
${glslGlobals}
${glslCommon}
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uVoid;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(clamp(y, 0.0, 1.0), 0.55));
  // Below the horizon: the canvas.
  col = mix(col, uVoid, smoothstep(0.02, -0.12, y));

  // Halftone sun / moon
  vec3 s = normalize(uSunDir);
  vec3 t1 = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(t1, s);
  vec2 suv = vec2(dot(d, t1), dot(d, t2)) / 0.09;
  float facing = step(0.0, dot(d, s));
  float sr = length(suv);
  vec2 cell = fract(suv * 4.0) - 0.5;
  float dotR = 0.48 * (1.0 - smoothstep(0.2, 1.15, sr));
  float sunDots = (1.0 - smoothstep(dotR, dotR + 0.06, length(cell))) * facing;
  float glow = exp(-sr * 0.9) * 0.35 * facing;
  vec3 sunCol = mix(uSunColor, vec3(1.0), 0.35);
  col = mix(col, sunCol, sunDots * (1.0 - uNight * 0.4));
  col += sunCol * glow * (1.0 - uNight * 0.6);

  // Stars as design-tool crosshairs
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(y, -1.0, 1.0))) * vec2(24.0, 24.0);
  vec2 sc = floor(sph);
  vec2 sf = fract(sph) - 0.5;
  float h = hash12(sc);
  float star = step(0.965, h) * step(0.05, y);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
  float cross1 = (1.0 - smoothstep(0.02, 0.05, abs(sf.x))) * (1.0 - smoothstep(0.12, 0.2, abs(sf.y)));
  float cross2 = (1.0 - smoothstep(0.02, 0.05, abs(sf.y))) * (1.0 - smoothstep(0.12, 0.2, abs(sf.x)));
  col += vec3(0.85, 0.9, 1.0) * star * max(cross1, cross2) * tw * uNight;

  col = mix(col, hueShift(col, uTime * 0.5 + y * 4.0), uMushroom * 0.6);
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

export function createVoidMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: voidVertex,
    fragmentShader: voidFragment,
    uniforms: {
      ...globalUniforms,
      uAccent: { value: srgb('#3b82f6') },
      uRipple: { value: 1 },
      uDotSize: { value: 1 },
      uSel: { value: 1 },
    },
  });
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: { ...globalUniforms },
    side: THREE.BackSide,
    depthWrite: false,
  });
}
