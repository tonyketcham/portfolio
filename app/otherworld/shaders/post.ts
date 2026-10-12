/** The Modyfi stack: one full-screen pass of ordered effects over the low-res world. */
import * as THREE from 'three';
import type { Tweaks } from '../debug/tweaks';
import { globalUniforms, srgbCached } from '../scene/globals';
import { effectById, type EffectLayer } from '../state/effects';
import { glslCommon } from './common';

export const SLOTS = 5; // ordered colour effects: halftone, dither, gradient, posterize, crt

export const postFragment = /* glsl */ `
${glslCommon}
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec2 uSceneRes;
uniform float uTime;
uniform float uDpr;
uniform int uOrder[${SLOTS}];
uniform float uAmount[${SLOTS}];
uniform float uChroma;
uniform float uKaleido;
uniform float uGrain;
uniform float uVignette;
uniform float uGlitch;
uniform float uRewind;
uniform float uFlash;
uniform float uMushroom;
uniform float uCell;
uniform float uAngle;
uniform float uDitherLevels;
uniform float uPosterLevels;
uniform float uScan;
uniform float uSpread;
uniform vec3 uGradA;
uniform vec3 uGradB;
uniform vec3 uGradC;
varying vec2 vUv;

vec3 scene(vec2 uv) { return toSRGB(texture2D(tScene, clamp(uv, 0.001, 0.999)).rgb); }

float dotScreen(vec2 px, float angle, float value) {
  vec2 q = rot2(angle) * px / uCell;
  vec2 f = fract(q) - 0.5;
  float r = sqrt(clamp(value, 0.0, 1.0)) * 0.7;
  return 1.0 - smoothstep(r - 0.08, r + 0.08, length(f));
}

void main() {
  vec2 uv = vUv;

  // Unfold glitch: torn rows.
  if (uGlitch > 0.001) {
    float rows = 18.0 + 30.0 * hash12(vec2(floor(uTime * 12.0), 3.0));
    float row = floor(uv.y * rows);
    float n = hash12(vec2(row, floor(uTime * 24.0)));
    uv.x += (n - 0.5) * 0.18 * uGlitch * step(0.78, n);
  }
  // VHS rewind: wobble + tracking band.
  if (uRewind > 0.001) {
    uv.x += sin(uv.y * 48.0 + uTime * 40.0) * 0.003 * uRewind;
    float band = smoothstep(0.0, 0.04, abs(fract(uv.y - uTime * 1.7) - 0.5) - 0.42);
    uv.x += (1.0 - band) * 0.02 * uRewind;
  }
  // Mushroom: the pixels breathe.
  if (uMushroom > 0.001) {
    vec2 c = uv - 0.5;
    float r = length(c);
    uv += c * sin(uTime * 1.3 - r * 9.0) * 0.025 * uMushroom;
    uv += vec2(sin(uv.y * 11.0 + uTime * 1.7), cos(uv.x * 9.0 - uTime * 1.2)) * 0.006 * uMushroom;
  }
  // Kaleidoscope (sampling-time).
  if (uKaleido > 0.001) {
    vec2 c = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float a = atan(c.y, c.x);
    float r = length(c);
    float seg = 3.14159265 / 3.0;
    a = abs(mod(a + uTime * 0.05, seg * 2.0) - seg);
    vec2 k = vec2(cos(a), sin(a)) * r / vec2(uRes.x / uRes.y, 1.0) + 0.5;
    uv = mix(uv, k, uKaleido);
  }

  // Chromatic split (sampling-time), stronger toward the edges.
  vec2 off = (uv - 0.5) * 0.009 * uSpread * (uChroma + uMushroom * 0.6 + uRewind * 0.8);
  vec3 col = vec3(scene(uv + off).r, scene(uv).g, scene(uv - off).b);

  vec2 px = gl_FragCoord.xy / uDpr;
  vec2 spx = floor(uv * uSceneRes);
  for (int i = 0; i < ${SLOTS}; i++) {
    int id = uOrder[i];
    float a = uAmount[i];
    if (a <= 0.0) continue;
    if (id == 0) {
      vec3 h = vec3(
        dotScreen(px, uAngle, col.r),
        dotScreen(px, uAngle + 0.52, col.g),
        dotScreen(px, uAngle + 1.05, col.b)
      );
      col = mix(col, h * (0.6 + 0.4 * col) + col * 0.15, a);
    } else if (id == 1) {
      float L = uDitherLevels - 1.0;
      vec3 d = floor(col * L + bayer4(spx)) / L;
      col = mix(col, d, a);
    } else if (id == 2) {
      vec3 g = gradient3(clamp(luma(col), 0.0, 1.0), uGradA, uGradB, uGradC);
      col = mix(col, g, a);
    } else if (id == 3) {
      vec3 p = floor(col * uPosterLevels + 0.5) / uPosterLevels;
      col = mix(col, p, a);
    } else if (id == 4) {
      float line = 0.5 + 0.5 * sin(px.y * 3.14159 * uScan);
      float mask = 0.5 + 0.5 * sin(px.x * 3.14159 * 0.66 + vec3(0.0, 2.1, 4.2).x);
      col *= 1.0 - a * 0.3 * line;
      col *= 1.0 - a * 0.08 * mask;
      col += a * 0.04 * col * col;
    }
  }

  float vig = smoothstep(0.35, 1.05, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 1.15);
  col *= 1.0 - uVignette * vig;
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
  col = mix(col, vec3(1.0), uFlash);
  if (uRewind > 0.001) col = mix(col, vec3(luma(col)) * vec3(0.85, 0.95, 1.1), uRewind * 0.35);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const postVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function createPostMaterial(scene: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: postVertex,
    fragmentShader: postFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: scene },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSceneRes: { value: new THREE.Vector2(1, 1) },
      uTime: globalUniforms.uTime,
      uDpr: { value: 1 },
      uOrder: { value: [0, 1, 2, 3, 4] },
      uAmount: { value: [0, 0, 0, 0, 0] },
      uChroma: { value: 0 },
      uKaleido: { value: 0 },
      uGrain: { value: 0.05 },
      uVignette: { value: 0.3 },
      uGlitch: { value: 0 },
      uRewind: { value: 0 },
      uFlash: { value: 0 },
      uMushroom: globalUniforms.uMushroom,
      uCell: { value: 5 },
      uAngle: { value: 0.4 },
      uDitherLevels: { value: 6 },
      uPosterLevels: { value: 5 },
      uScan: { value: 1 },
      uSpread: { value: 1 },
      uGradA: { value: new THREE.Vector3() },
      uGradB: { value: new THREE.Vector3() },
      uGradC: { value: new THREE.Vector3() },
    },
  });
}

/** Scene render target: low-res, nearest-filtered, sRGB-encoded (hardware-decoded on read). */
export function createSceneTarget() {
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    colorSpace: THREE.SRGBColorSpace,
  });
  rt.texture.generateMipmaps = false;
  return rt;
}

export function createPostPass(scene: THREE.Texture) {
  const material = createPostMaterial(scene);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const s = new THREE.Scene();
  s.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { material, scene: s, camera };
}

/** Write the visitor's ordered effect stack + tweak params into the post uniforms. */
export function writeStackUniforms(
  material: THREE.ShaderMaterial,
  effects: EffectLayer[],
  worldness: number,
  stack: Tweaks['Modyfi stack']
) {
  const u = material.uniforms;
  const order: number[] = [];
  const amount: number[] = [];
  let chroma = 0;
  let kaleido = 0;
  for (const layer of effects) {
    const value = layer.enabled ? layer.amount * worldness : 0;
    if (layer.id === 'chroma') chroma = value;
    else if (layer.id === 'kaleido') kaleido = value;
    else {
      const code = effectById.get(layer.id)!.code;
      // shader slots: halftone 0, dither 1, gradient 2, posterize 3, crt 4
      order.push(code === 5 ? 4 : code);
      amount.push(value);
    }
  }
  for (let i = 0; i < SLOTS; i++) {
    (u.uOrder.value as number[])[i] = order[i] ?? 0;
    (u.uAmount.value as number[])[i] = amount[i] ?? 0;
  }
  u.uChroma.value = chroma;
  u.uKaleido.value = kaleido;
  u.uGrain.value = stack.grain * (0.4 + 0.6 * worldness);
  u.uVignette.value = stack.vignette * worldness;
  u.uCell.value = stack.halftone.cell;
  u.uAngle.value = stack.halftone.angle;
  u.uDitherLevels.value = stack.dither.levels;
  u.uPosterLevels.value = stack.posterize.levels;
  u.uScan.value = stack.scanlines.density;
  u.uSpread.value = stack.chroma.spread;
  (u.uGradA.value as THREE.Vector3).copy(srgbCached(stack.gradientMap.dark));
  (u.uGradB.value as THREE.Vector3).copy(srgbCached(stack.gradientMap.mid));
  (u.uGradC.value as THREE.Vector3).copy(srgbCached(stack.gradientMap.light));
}
