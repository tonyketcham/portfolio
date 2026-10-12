/**
 * The artboard material. One shader for every framed piece:
 *  - cover-fits a texture (image / video poster / live video), or renders a
 *    seeded procedural pattern when there's no art yet
 *  - applies the piece's own mini "Modyfi stack" (displace, chroma, gradient
 *    map, halftone, dither, scanlines), all live-tweakable from the inspector
 *  - draws the design-tool frame border and hover/selection state
 *  - optional circular leafy mask for art-tree canopies
 */
import * as THREE from 'three';
import type { ArtFx, ProceduralPattern } from '@/content/works';
import { globalUniforms, srgb } from '../scene/globals';
import { glslCommon, glslGlobals } from './common';

export const PATTERN_CODES: Record<ProceduralPattern, number> = {
  'halftone-bloom': 0,
  contour: 1,
  moire: 2,
  flow: 3,
  kaleido: 4,
  dots: 5,
  fractal: 6,
};

const vertex = /* glsl */ `
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
${glslGlobals}
${glslCommon}
uniform sampler2D map;
uniform float uHasMap;
uniform float uTexAspect;
uniform vec2 uSize;
uniform float uSeed;
uniform int uPattern;
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform float uHalftone;
uniform float uDotScale;
uniform float uGradient;
uniform float uDisplace;
uniform float uDither;
uniform float uChromaFx;
uniform float uScan;
uniform float uFx;
uniform float uHover;
uniform float uSelected;
uniform float uCircle;
uniform float uBreathe;
uniform vec3 uAccent;
varying vec2 vUv;
varying float vDist;

float procedural(vec2 p, float seed) {
  float t = uTime * 0.15 * uBreathe;
  p += seed * 0.137;
  if (uPattern == 0) {
    // halftone bloom
    vec2 c = p - vec2(uSize.x / uSize.y * 0.5, 0.5);
    float r = length(c);
    float f = fbm(p * 2.0 + t);
    vec2 cell = fract(p * 14.0) - 0.5;
    float size = clamp(0.55 - r * 0.6 + f * 0.35, 0.0, 0.5);
    return (1.0 - smoothstep(size - 0.05, size + 0.05, length(cell))) * (0.6 + f * 0.6);
  } else if (uPattern == 1) {
    // contours
    float h = fbm(p * 2.2 + vec2(t, -t * 0.7));
    return smoothstep(0.42, 0.5, abs(fract(h * 9.0) - 0.5) * 2.0) * 0.8 + h * 0.3;
  } else if (uPattern == 2) {
    // moire
    float a = sin((rot2(0.1 + t * 0.2) * p).x * 60.0);
    float b = sin((rot2(-0.12) * p).x * 62.0 + t * 2.0);
    return 0.5 + 0.25 * (a + b);
  } else if (uPattern == 3) {
    // domain-warped flow
    vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.0));
    return fbm(p * 1.8 + q * 2.4);
  } else if (uPattern == 4) {
    // kaleido
    vec2 c = p - vec2(uSize.x / uSize.y * 0.5, 0.5);
    float a = atan(c.y, c.x);
    float r = length(c);
    float seg = 6.2831 / 8.0;
    a = abs(mod(a + t, seg) - seg * 0.5);
    vec2 k = vec2(cos(a), sin(a)) * r;
    return fbm(k * 6.0 + t);
  } else if (uPattern == 5) {
    // dots field
    vec2 g = p * 10.0;
    vec2 cell = fract(g) - 0.5;
    float w = 0.5 + 0.5 * sin(floor(g.x) * 0.6 + floor(g.y) * 0.4 + uTime * 1.2 * uBreathe);
    return 1.0 - smoothstep(0.12 + w * 0.25, 0.16 + w * 0.25, length(cell));
  }
  // julia orbit trap
  vec2 z = (p - vec2(uSize.x / uSize.y * 0.5, 0.5)) * 2.6;
  vec2 c = vec2(-0.75 + 0.08 * sin(t * 2.0), 0.12 + 0.06 * cos(t * 1.7));
  float trap = 10.0;
  for (int i = 0; i < 22; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(z.y) + abs(z.x) * 0.2);
    if (dot(z, z) > 16.0) break;
  }
  return clamp(1.0 - trap * 1.6, 0.0, 1.0);
}

vec2 cover(vec2 uv) {
  float planeAspect = uSize.x / uSize.y;
  float r = planeAspect / uTexAspect;
  if (r > 1.0) uv.y = (uv.y - 0.5) / r + 0.5;
  else uv.x = (uv.x - 0.5) * r + 0.5;
  return uv;
}

void main() {
  vec2 uv = vUv;
  float fx = uFx;
  float alpha = 1.0;

  if (uCircle > 0.5) {
    vec2 c = uv - 0.5;
    float a = atan(c.y, c.x);
    float edge = 0.47 + 0.035 * sin(a * 9.0 + uSeed) + 0.025 * sin(a * 23.0 - uTime * 0.6 * uBreathe);
    float d = length(c);
    float th = bayer4(gl_FragCoord.xy);
    if (d > edge + (th - 0.5) * 0.03) discard;
  }

  uv += (vec2(vnoise(uv * 5.0 + uTime * 0.3), vnoise(uv * 5.0 - uTime * 0.27 + 9.0)) - 0.5) * 0.05 * uDisplace * fx;

  vec3 col;
  if (uHasMap > 0.5) {
    vec2 cu = cover(uv);
    vec2 off = vec2(0.006, 0.0) * uChromaFx * fx;
    col = toSRGB(vec3(texture2D(map, cu + off).r, texture2D(map, cu).g, texture2D(map, cu - off).b));
  } else {
    float v = procedural(uv * vec2(uSize.x / uSize.y, 1.0), uSeed);
    col = gradient3(clamp(v, 0.0, 1.0), uPalA, uPalB, uPalC);
  }

  col = mix(col, gradient3(clamp(luma(col), 0.0, 1.0), uPalA, uPalB, uPalC), uGradient * fx);

  if (uHalftone > 0.0) {
    vec2 g = rot2(0.5) * (uv * uSize) * (40.0 / max(1.0, uDotScale));
    vec2 cell = fract(g) - 0.5;
    float r = sqrt(clamp(luma(col), 0.0, 1.0)) * 0.62;
    float dotMask = 1.0 - smoothstep(r - 0.07, r + 0.07, length(cell));
    col = mix(col, col * dotMask * 1.25, uHalftone * fx);
  }
  if (uDither > 0.0) {
    vec2 dp = floor(uv * uSize * 90.0);
    vec3 d = floor(col * 4.0 + bayer4(dp)) / 4.0;
    col = mix(col, d, uDither * fx);
  }
  if (uScan > 0.0) {
    col *= 1.0 - uScan * fx * 0.35 * (0.5 + 0.5 * sin(uv.y * uSize.y * 220.0));
  }

  // Frame border (design-tool style), thicker + accent when hovered / selected.
  vec2 e2 = min(uv, 1.0 - uv) * uSize;
  float e = min(e2.x, e2.y);
  float sel = max(uHover, uSelected);
  if (uCircle < 0.5) {
    float bw = mix(0.018, 0.045, sel);
    float border = 1.0 - smoothstep(bw - 0.006, bw, e);
    col = mix(col, mix(vec3(0.16, 0.16, 0.18), uAccent, sel), border);
  } else {
    float d = length(vUv - 0.5);
    col = mix(col, uAccent, smoothstep(0.38, 0.47, d) * sel * 0.9);
  }

  // Screens glow a touch at night; fog pulls them into the distance.
  col *= 1.0 + uNight * 0.15;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog * 0.9);
  col = mix(col, hueShift(col, sin(uTime + uSeed) * 2.0), uMushroom * 0.6);
  gl_FragColor = vec4(toLinear(col), alpha);
}
`;

export interface ArtMaterialOptions {
  seed: number;
  pattern?: ProceduralPattern;
  palette?: [string, string, string];
  fx?: ArtFx;
  circle?: boolean;
}

export function createArtMaterial(opts: ArtMaterialOptions) {
  const pal = opts.palette ?? opts.fx?.palette ?? ['#09090b', '#3b82f6', '#fafafa'];
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
    uniforms: {
      ...globalUniforms,
      map: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
      uTexAspect: { value: 1.5 },
      uSize: { value: new THREE.Vector2(3, 2) },
      uSeed: { value: opts.seed },
      uPattern: { value: PATTERN_CODES[opts.pattern ?? 'flow'] },
      uPalA: { value: srgb(pal[0]) },
      uPalB: { value: srgb(pal[1]) },
      uPalC: { value: srgb(pal[2]) },
      uHalftone: { value: opts.fx?.halftone ?? 0 },
      uDotScale: { value: opts.fx?.dotScale ?? 6 },
      uGradient: { value: opts.fx?.gradient ?? 0 },
      uDisplace: { value: opts.fx?.displace ?? 0 },
      uDither: { value: opts.fx?.dither ?? 0 },
      uChromaFx: { value: opts.fx?.chroma ?? 0 },
      uScan: { value: opts.fx?.scan ?? 0 },
      uFx: { value: 1 },
      uHover: { value: 0 },
      uSelected: { value: 0 },
      uCircle: { value: opts.circle ? 1 : 0 },
      uBreathe: { value: 1 },
      uAccent: { value: srgb('#3b82f6') },
    },
  });
}

export type ArtMaterial = ReturnType<typeof createArtMaterial>;
