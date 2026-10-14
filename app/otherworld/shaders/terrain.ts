/**
 * Terrain: tile-state texture (hover / destination / markers / path), blob
 * shadows, the heightmap geometry builder and the terrain node material.
 * Pure three.js (WebGPU / TSL), no React, so it renders headless.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  Loop,
  attribute,
  float,
  floor,
  fract,
  mix,
  output,
  positionLocal,
  positionView,
  positionWorld,
  screenCoordinate,
  sin,
  step,
  texture,
  uniform,
  uniformArray,
  vec3,
  vec4,
} from 'three/tsl';
import { fbm, hashString } from '../lib/random';
import { HALF, SIZE, T, getWorld, tileIndex, type TileKind } from '../world/map';
import { bayer4, falloff, hueShift, type C3, type V2, type V3, type V4, v3 } from './common';
import { globalUniforms } from '../scene/globals';

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
export const blobShadows = uniformArray<'vec4'>(shadowSlots, 'vec4');
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

/** Multiply factor for the blob shadows at a world xz. */
export const blobShadowAt = Fn(([xz]: [V2]) => {
  const k = float(1).toVar();
  Loop(12, ({ i }) => {
    const s = blobShadows.element(i);
    const d = xz.sub(s.xy).length().div(s.z);
    k.mulAssign(float(1).sub(s.w.mul(falloff(d, 0.35, 1.0))));
  });
  return k;
});

// ── palette (sRGB hex; converted per-vertex) ─────────────────────────────────
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
  [T.Canvas]: ['#d4d4d8', '#dcdce0'], // the design canvas
  [T.Water]: ['#173943', '#214b53'], // pond bed, beneath the water surface
  [T.Rock]: ['#6b645a', '#7a7266'], // cliff faces
};
const paletteSRGB = Object.fromEntries(
  Object.entries(PALETTE).map(([k, [a, b]]) => [
    k,
    [new THREE.Color(a).convertLinearToSRGB(), new THREE.Color(b).convertLinearToSRGB()],
  ])
) as unknown as Record<TileKind, [THREE.Color, THREE.Color]>;

export function buildTerrainGeometry() {
  const world = getWorld();
  const { heights, land, tiles } = world;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tileAttr: number[] = [];
  const landAttr: number[] = [];
  const c = new THREE.Color();
  const base = new THREE.Color();
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
      const [ca, cb] = paletteSRGB[kind];
      const x0 = i - HALF;
      const z0 = j - HALF;
      const v = fbm(x0 * 0.18, z0 * 0.18, 5, 2);
      if (kind === T.Plaza) base.copy((i + j) % 2 === 0 ? ca : cb);
      else if (kind === T.Soil) base.copy(j % 2 === 0 ? ca : cb);
      else base.copy(ca).lerp(cb, v);
      const jitter = ((hashString(`${i},${j}`) % 1000) / 1000 - 0.5) * 0.05;
      base.r += jitter;
      base.g += jitter;
      base.b += jitter;

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
          // higher ground reads a touch lighter
          c.copy(base).multiplyScalar(1 + (p[1] - 0.2) * 0.04).convertSRGBToLinear();
          colors.push(c.r, c.g, c.b);
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

export const terrainUniforms = {
  grid: uniform(0.25),
  coast: uniform(1),
};

/** Shared tile-overlay compositor (hover / destination / marker / path) for any tiled floor. */
export const tileOverlay = (
  col: V3,
  st: V4,
  cellUv: V2,
  accentColor: C3
) => {
  const accent = v3(accentColor);
  const ge = cellUv.min(cellUv.oneMinus());
  const edge = ge.x.min(ge.y);
  const outline = falloff(edge, 0.035, 0.075);
  const pulse = sin(globalUniforms.uTime.mul(6)).mul(0.25).add(0.75);
  let c = mix(col, accent.mul(1.25), st.g.mul(outline).mul(pulse));
  c = mix(c, vec3(0.9), st.r.mul(outline).mul(0.65));
  c = mix(c, vec3(1.0, 0.7, 0.03), st.b.mul(outline.mul(0.78).add(0.22)));
  const pd = cellUv.sub(0.5).length();
  return mix(c, accent, st.a.mul(falloff(pd, 0.05, 0.085)).mul(0.9));
};

export function createTerrainMaterial() {
  const U = globalUniforms;
  const m = new THREE.MeshLambertNodeMaterial();
  const aColor = attribute<'vec3'>('aColor', 'vec3');
  const aTile = attribute<'vec2'>('aTile', 'vec2');
  const aLand = attribute<'float'>('aLand', 'float');

  // The heightfield rises out of the flat canvas as the reveal wave passes.
  const rise = float(1).sub(positionLocal.xz.length().smoothstep(U.uReveal.sub(7), U.uReveal));
  m.positionNode = vec3(positionLocal.x, positionLocal.y.mul(rise), positionLocal.z);

  // Ragged dithered coastline.
  const th = bayer4(screenCoordinate.xy);
  m.maskNode = aLand.greaterThanEqual(mix(float(0), th.mul(0.62).add(0.18), terrainUniforms.coast));

  // Albedo: vertex palette + a faint tile grid close to the camera.
  const cell = fract(positionWorld.xz.add(HALF));
  const ge = cell.min(cell.oneMinus());
  const gridLine = falloff(ge.x.min(ge.y), 0.0, 0.03);
  const near = falloff(positionView.z.negate(), 10, 34);
  m.colorNode = mix(aColor, aColor.mul(0.78), gridLine.mul(terrainUniforms.grid).mul(near));

  // After lighting + fog: tile overlays, blob shadows, the canvas, mushrooms.
  m.outputNode = Fn(() => {
    const st = texture(stateTexture, floor(aTile.add(0.5)).add(0.5).div(SIZE));
    const col = tileOverlay(output.rgb, st, cell, U.uAccent).toVar();
    col.mulAssign(blobShadowAt(positionWorld.xz));

    // The flat design canvas the island unfolds out of.
    const dc = positionWorld.xz.length();
    const canvas = float(1).sub(step(dc.add(th.mul(2.5)), U.uReveal));
    const dg = fract(positionWorld.xz.mul(2)).sub(0.5);
    const dotMask = falloff(dg.length(), 0.055, 0.09);
    const canvasCol = mix(v3(U.uVoid), vec3(0.022, 0.022, 0.027), dotMask);
    col.assign(mix(col, canvasCol, canvas));

    col.assign(mix(col, hueShift(col, sin(U.uTime.mul(0.7).add(dc.mul(0.35))).mul(2.6)), U.uMushroom.mul(0.8)));
    return vec4(col, output.a);
  })();
  return m;
}

