/** Sub-assemblies shared by furniture builders, plus art / label helpers. */
import * as THREE from 'three/webgpu';
import type { Work } from '@/content/works';
import { createArtMaterial } from '../../shaders/art';
import { loadArt } from '../../lib/textures';
import { seedOf } from '../../world/map';
import { UI, type Kit, type V3 } from '../kit';
import type { Extra } from './types';

/** Four legs under a rectangle of w × d, inset from the edges. */
export function legs4(k: Kit, w: number, d: number, h: number, t: number, color: string, inset = 0.06, y = 0) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box(t, h, t, color, [sx * (w / 2 - inset - t / 2), y, sz * (d / 2 - inset - t / 2)]);
}

const BOOK_COLOURS = ['#7f1d1d', '#1e3a8a', '#14532d', '#78350f', '#4c1d95', '#334155', '#9a3412', '#365314', '#0f766e', '#a16207'];

/** A row of books between x0 and x1 standing on y, spines facing +z at depth z. */
export function books(k: Kit, x0: number, x1: number, y: number, z: number, maxH: number, depth = 0.2, palette = BOOK_COLOURS) {
  let x = x0;
  while (x < x1 - 0.03) {
    const w = 0.035 + k.r() * 0.05;
    if (x + w > x1) break;
    const h = maxH * (0.62 + k.r() * 0.38);
    const lean = k.r() < 0.08 ? (k.r() - 0.5) * 0.5 : 0;
    k.box(w, h, depth * (0.85 + k.r() * 0.15), palette[Math.floor(k.r() * palette.length)], [x + w / 2, y, z], {
      rot: [0, 0, lean],
    });
    x += w + (k.r() < 0.1 ? 0.04 : 0.004);
  }
}

/** Design-tool anchor point: a white square with a blue rim, facing +z. */
export function anchor(k: Kit, pos: V3, size = 0.07) {
  k.box(size * 1.35, size * 1.35, size * 0.6, UI.blue, [pos[0], pos[1] - (size * 1.35) / 2, pos[2]], { jitter: 0 });
  k.box(size, size, size * 0.8, UI.white, [pos[0], pos[1] - size / 2, pos[2]], { jitter: 0 });
}

/** Bézier handle: a thin line from an anchor to a round knob. */
export function handle(k: Kit, from: V3, to: V3, r = 0.012) {
  k.tube([from, to], r, UI.blueSoft, { seg: 2, radial: 4, jitter: 0 });
  k.sphere(r * 3.2, UI.white, to, 6, 4, { jitter: 0 });
}

/** Paint a canvas into a texture (labels, spines, charts, scrolls). */
export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  paint(g, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const texMats = new Map<string, THREE.MeshLambertNodeMaterial>();
/** A lit, textured quad (cached material per key). */
export function texturedPlane(key: string, w: number, h: number, tex: () => THREE.Texture, pos: V3, rot: V3 = [0, 0, 0], lit = true) {
  let m = texMats.get(key);
  if (!m) {
    const map = tex();
    m = lit
      ? new THREE.MeshLambertNodeMaterial({ map, transparent: true, alphaTest: 0.5 })
      : (new THREE.MeshBasicNodeMaterial({ map, transparent: true, alphaTest: 0.5 }) as unknown as THREE.MeshLambertNodeMaterial);
    texMats.set(key, m);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}

export interface ArtOptions {
  lit?: boolean;
  leaded?: boolean;
  circle?: boolean;
  border?: boolean;
  /** Override the work's own fx. */
  fx?: Work['fx'];
  /** Draw it on this geometry instead of a plane (UVs should span the art). */
  geometry?: THREE.BufferGeometry;
}

/** A portfolio piece as a plane (w × h, facing +z), texture streamed in. */
export function workArt(work: Work | undefined, w: number, h: number, pos: V3, opts: ArtOptions = {}): Extra {
  const cover = work?.media[0];
  const mat = createArtMaterial({
    seed: seedOf(work?.slug ?? 'untitled'),
    pattern: cover?.kind === 'procedural' ? cover.pattern : 'flow',
    palette: cover?.kind === 'procedural' ? cover.palette : undefined,
    fx: opts.fx ?? work?.fx,
    lit: opts.lit ?? true,
    leaded: opts.leaded,
    circle: opts.circle,
  });
  mat.uniforms.uSize.value.set(w, h);
  mat.uniforms.uBorder.value = opts.border ? 1 : 0;
  const mesh = new THREE.Mesh(opts.geometry ?? new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(...pos);
  mesh.userData.work = work?.slug;
  const src = cover?.kind === 'image' ? cover.src : cover?.kind === 'mux' ? cover.poster : undefined;
  if (src)
    loadArt(src)
      .then((tex) => {
        mat.uniforms.map.value = tex;
        mat.uniforms.uHasMap.value = 1;
        mat.uniforms.uTexAspect.value = (tex.userData.naturalWidth || 1) / (tex.userData.naturalHeight || 1);
      })
      .catch(() => undefined);
  return { object: mesh };
}

/** The work's three-stop palette (procedural palette, else derived from its tags). */
export function workPalette(work: Work | undefined): [string, string, string] {
  const cover = work?.media[0];
  if (cover?.kind === 'procedural' && cover.palette) return cover.palette;
  if (work?.fx?.palette) return work.fx.palette;
  const byTag: Record<string, [string, string, string]> = {
    modyfi: ['#1e1b4b', '#e879f9', '#fde68a'],
    music: ['#0c0a09', '#6366f1', '#f5f5f4'],
    svelte: ['#1c1917', '#ff3e00', '#fde68a'],
    photography: ['#1a0f00', '#dc2626', '#fef3c7'],
    data: ['#09090b', '#71717a', '#f4f4f5'],
  };
  for (const t of work?.tags ?? []) if (byTag[t]) return byTag[t];
  return ['#0b1020', '#3b82f6', '#e0f2fe'];
}
