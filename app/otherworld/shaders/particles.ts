/** Particle shaders: burst sprites (handles, hearts, plus-signs) and GPU-only ambient motes. */
import * as THREE from 'three';
import { globalUniforms } from '../scene/globals';
import { glslCommon, glslGlobals } from './common';

export const burstVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vShape = aShape;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

export const burstFragment = /* glsl */ `
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
float heart(vec2 p) {
  p.y = -p.y + 0.15;
  p *= 1.25;
  float a = atan(p.x, p.y) / 3.14159;
  float r = length(p);
  float h = abs(a);
  float d = (13.0 * h - 22.0 * h * h + 10.0 * h * h * h) / (6.0 - 5.0 * h);
  return step(r, d * 0.5);
}
void main() {
  if (vAlpha <= 0.0) discard;
  vec2 p = gl_PointCoord - 0.5;
  float m = 1.0;
  vec3 col = vColor;
  if (vShape < 0.5) {
    // design-tool handle: white fill, accent border
    float inner = step(max(abs(p.x), abs(p.y)), 0.28);
    col = mix(vColor, vec3(1.0), inner);
  } else if (vShape < 1.5) {
    m = step(length(p), 0.5);
  } else if (vShape < 2.5) {
    m = heart(p);
  } else {
    m = max(step(abs(p.x), 0.1) * step(abs(p.y), 0.45), step(abs(p.y), 0.1) * step(abs(p.x), 0.45));
  }
  if (m < 0.5) discard;
  gl_FragColor = vec4(pow(col, vec3(2.2)), vAlpha);
}
`;

export const ambientVertex = /* glsl */ `
${glslGlobals}
attribute float aPhase;
attribute float aKind;
uniform float uScale;
uniform float uFireflies;
uniform float uSpores;
varying float vAlpha;
varying float vKind;
void main() {
  vKind = aKind;
  vec3 p = position;
  float t = uTime * (0.4 + fract(aPhase * 7.1) * 0.5) + aPhase * 6.28;
  if (aKind < 0.5) {
    p += vec3(sin(t) * 0.8, sin(t * 1.7) * 0.35, cos(t * 0.8) * 0.8);
    float blink = 0.5 + 0.5 * sin(uTime * 3.0 + aPhase * 40.0);
    vAlpha = (0.15 + uNight) * blink * uFireflies;
  } else {
    float rise = fract(uTime * 0.05 + aPhase);
    p += vec3(sin(t) * 0.5, rise * 4.0, cos(t) * 0.5);
    vAlpha = sin(rise * 3.14159) * 0.8 * uSpores;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, (aKind < 0.5 ? 0.12 : 0.08) * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

export const ambientFragment = /* glsl */ `
${glslGlobals}
varying float vAlpha;
varying float vKind;
void main() {
  if (vAlpha <= 0.01) discard;
  vec2 p = gl_PointCoord - 0.5;
  vec3 col;
  if (vKind < 0.5) {
    float inner = step(max(abs(p.x), abs(p.y)), 0.25);
    col = mix(vec3(0.95, 0.85, 0.35), vec3(1.0), inner);
  } else {
    if (length(p) > 0.5) discard;
    col = vec3(0.98, 0.7, 0.85);
  }
  gl_FragColor = vec4(pow(col, vec3(2.2)), clamp(vAlpha, 0.0, 1.0));
}
`;

export function createBurstMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: burstVertex,
    fragmentShader: burstFragment,
    uniforms: { uScale: { value: 300 } },
    transparent: true,
    depthWrite: false,
  });
}

export function createAmbientMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: ambientVertex,
    fragmentShader: `${glslCommon}\n${ambientFragment}`,
    uniforms: { ...globalUniforms, uScale: { value: 300 }, uFireflies: { value: 1 }, uSpores: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
