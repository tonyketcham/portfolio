/**
 * Terrain: tile-state texture (hover / destination / markers / path), blob
 * shadows, the heightmap geometry builder and the terrain material.
 * Pure three.js, no React, so it can be rendered headless.
 */
import * as THREE from 'three';
import { fbm, hashString } from '../lib/random';
import { HALF, SIZE, T, getWorld, tileIndex, type TileKind } from '../world/map';
import { glslCommon, glslGlobals } from './common';
import { globalUniforms, srgb } from '../scene/globals';

// ── tile state texture: hover / destination / markers / path ─────────────────
const stateData = new Uint8Array(SIZE * SIZE * 4);
const stateTexture = new THREE.DataTexture(stateData, SIZE, SIZE, THREE.RGBAFormat);
stateTexture.magFilter = THREE.NearestFilter;
stateTexture.minFilter = THREE.NearestFilter;
stateTexture.needsUpdate = true;

export const TileChannel = { Hover: 0, Destination: 1, Marker: 2, Path: 3 } as const;

export const tileState = {
  set(i: number, j: number, channel: number, on: boolean) {
    if (i < 0 || j < 0 || i >= SIZE || j >= SIZE) return;
    const k = tileIndex(i, j) * 4 + channel;
    const v = on ? 255 : 0;
    if (stateData[k] !== v) {
      stateData[k] = v;
      stateTexture.needsUpdate = true;
    }
  },
  clear(channel: number) {
    let dirty = false;
    for (let k = channel; k < stateData.length; k += 4) {
      if (stateData[k]) {
        stateData[k] = 0;
        dirty = true;
      }
    }
    if (dirty) stateTexture.needsUpdate = true;
  },
};

// ── blob shadows (up to 12 casters) ──────────────────────────────────────────
const shadowSlots = Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 1, 0));
const shadowOwners = new Map<string, number>();
export function setShadow(id: string, x: number, z: number, radius: number, strength: number) {
  let slot = shadowOwners.get(id);
  if (slot === undefined) {
    slot = shadowSlots.findIndex((s, i) => s.w === 0 && ![...shadowOwners.values()].includes(i));
    if (slot === -1) return;
    shadowOwners.set(id, slot);
  }
  shadowSlots[slot].set(x, z, radius, strength);
}
export function clearShadow(id: string) {
  const slot = shadowOwners.get(id);
  if (slot === undefined) return;
  shadowSlots[slot].w = 0;
  shadowOwners.delete(id);
}

// ── palette ──────────────────────────────────────────────────────────────────
const PALETTE: Record<TileKind, [string, string]> = {
  [T.Void]: ['#c9b48a', '#b9a47a'],
  [T.Grass]: ['#5d8c3a', '#6f9c43'],
  [T.Dirt]: ['#8a6844', '#7b5b3a'],
  [T.Sand]: ['#d2bd8e', '#c5ae7d'],
  [T.Plaza]: ['#8e919b', '#a9acb5'], // the transparency checkerboard
  [T.Moss]: ['#3f6d48', '#4c7a4f'],
  [T.Concrete]: ['#6c6f78', '#73767f'],
  [T.Soil]: ['#6e4b32', '#5c3e29'],
  [T.Ruin]: ['#7f7b72', '#8b877c'],
  [T.DarkMoss]: ['#2c4434', '#344e3b'],
};
const paletteVec = Object.fromEntries(
  Object.entries(PALETTE).map(([k, [a, b]]) => [k, [srgb(a), srgb(b)]])
) as unknown as Record<TileKind, [THREE.Vector3, THREE.Vector3]>;

export function buildTerrainGeometry() {
  const world = getWorld();
  const { heights, land, tiles } = world;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tileAttr: number[] = [];
  const landAttr: number[] = [];
  const c = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();

  const corner = (ci: number, cj: number) => cj * (SIZE + 1) + ci;

  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const l00 = land[corner(i, j)];
      const l10 = land[corner(i + 1, j)];
      const l01 = land[corner(i, j + 1)];
      const l11 = land[corner(i + 1, j + 1)];
      if (Math.max(l00, l10, l01, l11) < 0.03) continue;
      const kind = tiles[tileIndex(i, j)] as TileKind;
      const [ca, cb] = paletteVec[kind];
      const x0 = i - HALF;
      const z0 = j - HALF;
      const v = fbm(x0 * 0.18, z0 * 0.18, 5, 2);
      let base: THREE.Vector3;
      if (kind === T.Plaza) base = (i + j) % 2 === 0 ? ca.clone() : cb.clone();
      else if (kind === T.Soil) base = (j % 2 === 0 ? ca : cb).clone();
      else base = ca.clone().lerp(cb, v);
      const jitter = ((hashString(`${i},${j}`) % 1000) / 1000 - 0.5) * 0.05;
      base.addScalar(jitter);

      const quad: [number, number, number][] = [
        [x0, heights[corner(i, j)], z0],
        [x0 + 1, heights[corner(i + 1, j)], z0],
        [x0, heights[corner(i, j + 1)], z0 + 1],
        [x0 + 1, heights[corner(i + 1, j + 1)], z0 + 1],
      ];
      const lands = [l00, l10, l01, l11];
      // Alternate the diagonal like an old heightmap renderer.
      const tris = (i + j) % 2 === 0 ? [[0, 2, 1], [1, 2, 3]] : [[0, 2, 3], [0, 3, 1]];
      for (const tri of tris) {
        const [p0, p1, p2] = tri.map((t) => quad[t]);
        a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
        n.crossVectors(b, a).normalize();
        if (n.y < 0) n.negate();
        for (const t of tri) {
          const p = quad[t];
          positions.push(p[0], p[1], p[2]);
          normals.push(n.x, n.y, n.z);
          // per-vertex shade: subtle AO from neighbours' height
          c.copy(base).multiplyScalar(1 + (p[1] - 0.2) * 0.04);
          colors.push(c.x, c.y, c.z);
          tileAttr.push(i, j);
          landAttr.push(lands[t]);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aTile', new THREE.Float32BufferAttribute(tileAttr, 2));
  geometry.setAttribute('aLand', new THREE.Float32BufferAttribute(landAttr, 1));
  geometry.computeBoundingSphere();
  return { geometry, positions: new Float32Array(positions) };
}

export const terrainVertex = /* glsl */ `
${glslGlobals}
uniform float uReveal;
attribute vec3 aColor;
attribute vec2 aTile;
attribute float aLand;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vLand;
varying vec2 vTile;
varying float vDist;
void main() {
  vec3 p = position;
  float rise = 1.0 - smoothstep(uReveal - 7.0, uReveal, length(p.xz));
  p.y *= rise;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vColor = aColor;
  vNormal = normal;
  vLand = aLand;
  vTile = aTile;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const terrainFragment = /* glsl */ `
${glslGlobals}
${glslCommon}
uniform float uReveal;
uniform sampler2D uTileState;
uniform float uSize;
uniform float uHalf;
uniform float uGrid;
uniform float uCoast;
uniform vec4 uShadows[12];
uniform vec3 uAccent;
uniform vec3 uVoid;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vLand;
varying vec2 vTile;
varying float vDist;

void main() {
  float th = bayer4(gl_FragCoord.xy);
  if (vLand < mix(0.0, 0.18 + th * 0.62, uCoast)) discard;

  vec3 col = vColor;
  float ndl = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  col *= uAmbient * 0.85 + uSunColor * (0.3 + ndl * 0.45);

  vec2 g = fract(vWorld.xz + uHalf);
  vec2 ge = min(g, 1.0 - g);
  float edge = min(ge.x, ge.y);
  float gridLine = 1.0 - smoothstep(0.0, 0.03, edge);
  col = mix(col, col * 0.78, gridLine * uGrid * (1.0 - smoothstep(10.0, 34.0, vDist)));

  vec4 st = texture2D(uTileState, (floor(vTile + 0.5) + 0.5) / uSize);
  float outline = 1.0 - smoothstep(0.035, 0.075, edge);
  float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
  col = mix(col, uAccent * 1.25, st.g * outline * pulse);
  col = mix(col, vec3(0.95), st.r * outline * 0.65);
  col = mix(col, vec3(1.0, 0.86, 0.18), st.b * (0.22 + outline * 0.78));
  float pd = length(g - 0.5);
  col = mix(col, uAccent, st.a * (1.0 - smoothstep(0.05, 0.085, pd)) * 0.9);

  for (int i = 0; i < 12; i++) {
    vec4 s = uShadows[i];
    if (s.w <= 0.0) continue;
    float d = length(vWorld.xz - s.xy) / s.z;
    col *= 1.0 - s.w * (1.0 - smoothstep(0.35, 1.0, d));
  }

  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog);

  // The flat design canvas the island unfolds out of.
  float dc = length(vWorld.xz);
  float canvas = 1.0 - step(dc + th * 2.5, uReveal);
  // Same grid as the void below, so the canvas reads as one infinite plane.
  vec2 dg = fract(vWorld.xz * 2.0) - 0.5;
  float dotMask = 1.0 - smoothstep(0.055, 0.09, length(dg));
  vec3 canvasCol = mix(uVoid, vec3(0.16, 0.16, 0.18), dotMask);
  col = mix(col, canvasCol, canvas);

  col = mix(col, hueShift(col, sin(uTime * 0.7 + dc * 0.35) * 2.6), uMushroom * 0.8);
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

export function createTerrainMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: {
      ...globalUniforms,
      uTileState: { value: stateTexture },
      uSize: { value: SIZE },
      uHalf: { value: HALF },
      uGrid: { value: 0.25 },
      uCoast: { value: 1 },
      uShadows: { value: shadowSlots },
      uAccent: { value: srgb('#3b82f6') },
    },
  });
}
