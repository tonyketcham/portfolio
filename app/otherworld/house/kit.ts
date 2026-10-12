/**
 * A tiny modelling kit for low-poly, vertex-coloured, flat-shaded furniture.
 *
 * Every primitive is baked into one merged BufferGeometry per piece (one
 * draw call), with a per-face shade jitter (that hand-painted old-school
 * look) and a contact-darkening pass near the floor. Named sub-kits become
 * separate meshes for parts that animate (a rocking chair, a globe).
 *
 * Units: 1 = one tile. Local space faces +z (south / toward the room).
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../lib/random';

export type V3 = [number, number, number];

export interface PrimOpts {
  /** Euler rotation in radians (applied before translation). */
  rot?: V3;
  /** Per-face shade jitter (0 = none). Default 0.05. */
  jitter?: number;
  /** Keep UVs (for parts that get their own textured material). */
  uv?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpP = new THREE.Vector3();

export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private rand: () => number;
  readonly subs = new Map<string, { kit: Kit; pivot: THREE.Vector3 }>();

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
  }

  /** Random in [0, 1) from the piece's seed (deterministic per hotspot). */
  r() {
    return this.rand();
  }

  // ── transform stack ──────────────────────────────────────────────────────
  push(pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 | number = 1) {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    tmpM.compose(tmpP.set(...pos), tmpQ.setFromEuler(tmpE.set(...rot)), tmpS.set(s[0], s[1], s[2]));
    this.stack.push(this.top.clone().multiply(tmpM));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  private get top() {
    return this.stack[this.stack.length - 1];
  }

  /** A separately-meshed part pivoting at `pivot` (in the current space). */
  sub(name: string, pivot: V3 = [0, 0, 0]) {
    let entry = this.subs.get(name);
    if (!entry) {
      const kit = new Kit(Math.floor(this.r() * 1e9));
      entry = { kit, pivot: new THREE.Vector3(...pivot).applyMatrix4(this.top) };
      this.subs.set(name, entry);
    }
    return entry.kit;
  }

  // ── primitives (positions are the primitive's centre unless noted) ───────
  add(geo: THREE.BufferGeometry, color: string | THREE.Color, pos: V3 = [0, 0, 0], opts: PrimOpts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!opts.uv && g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const jitter = opts.jitter ?? 0.05;
    for (let f = 0; f < n; f += 3) {
      const k = 1 + (this.r() - 0.5) * 2 * jitter;
      for (let v = f; v < Math.min(n, f + 3); v++) arr.set([c.r * k, c.g * k, c.b * k], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    tmpM.compose(tmpP.set(...pos), tmpQ.setFromEuler(tmpE.set(...(opts.rot ?? [0, 0, 0]))), tmpS.set(1, 1, 1));
    g.applyMatrix4(this.top.clone().multiply(tmpM));
    this.parts.push(g);
    return this;
  }

  /** Box with its base at `pos.y`. */
  box(w: number, h: number, d: number, color: string, pos: V3 = [0, 0, 0], opts?: PrimOpts) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, [pos[0], pos[1] + h / 2, pos[2]], opts);
  }
  /** Cylinder with its base at `pos.y`. */
  cyl(rTop: number, rBottom: number, h: number, color: string, pos: V3 = [0, 0, 0], seg = 8, opts?: PrimOpts) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, [pos[0], pos[1] + h / 2, pos[2]], opts);
  }
  cone(r: number, h: number, color: string, pos: V3 = [0, 0, 0], seg = 8, opts?: PrimOpts) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, [pos[0], pos[1] + h / 2, pos[2]], opts);
  }
  sphere(r: number, color: string, pos: V3 = [0, 0, 0], w = 8, hseg = 6, opts?: PrimOpts) {
    return this.add(new THREE.SphereGeometry(r, w, hseg), color, pos, opts);
  }
  ico(r: number, color: string, pos: V3 = [0, 0, 0], detail = 0, opts?: PrimOpts) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, pos, opts);
  }
  dodeca(r: number, color: string, pos: V3 = [0, 0, 0], opts?: PrimOpts) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), color, pos, opts);
  }
  torus(R: number, r: number, color: string, pos: V3 = [0, 0, 0], radial = 6, tubular = 12, arc = Math.PI * 2, opts?: PrimOpts) {
    return this.add(new THREE.TorusGeometry(R, r, radial, tubular, arc), color, pos, opts);
  }
  /** Lathe from [radius, y] pairs, base at `pos.y`. */
  lathe(profile: [number, number][], color: string, pos: V3 = [0, 0, 0], seg = 10, opts?: PrimOpts) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    return this.add(new THREE.LatheGeometry(pts, seg), color, pos, opts);
  }
  /** Extrude a 2D outline (x, y) by `depth` along z (centred). */
  extrude(outline: [number, number][], depth: number, color: string, pos: V3 = [0, 0, 0], opts?: PrimOpts & { bevel?: number }) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: !!opts?.bevel,
      bevelSize: opts?.bevel ?? 0,
      bevelThickness: opts?.bevel ?? 0,
      bevelSegments: 1,
      curveSegments: 6,
    });
    geo.translate(0, 0, -depth / 2);
    return this.add(geo, color, pos, opts);
  }
  /** A tube along a polyline / curve. */
  tube(points: V3[], radius: number, color: string, opts?: PrimOpts & { closed?: boolean; seg?: number; radial?: number }) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), opts?.closed ?? false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, opts?.seg ?? Math.max(6, points.length * 6), radius, opts?.radial ?? 5, opts?.closed ?? false);
    return this.add(geo, color, [0, 0, 0], opts);
  }
  /** Flat quad facing +z, centred at pos. */
  plane(w: number, h: number, color: string, pos: V3 = [0, 0, 0], opts?: PrimOpts) {
    return this.add(new THREE.PlaneGeometry(w, h), color, pos, opts);
  }

  // ── output ───────────────────────────────────────────────────────────────
  /**
   * Merge everything. `ground` darkens vertices close to y = 0 (contact
   * shadow), measured in the piece's own space.
   */
  build(ground = true): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (!merged) return null;
    if (ground) {
      const pos = merged.attributes.position;
      const col = merged.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.min(1, Math.max(0, y / 0.45));
        const k = 0.7 + 0.3 * (t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Handy palette for furniture (sRGB hex). Materials come in OSRS tiers. */
export const WOOD = {
  crude: '#8a6a4a',
  wood: '#7a5636',
  oak: '#9a6b3c',
  oakDark: '#6e4a28',
  teak: '#6b4026',
  mahogany: '#5a2a1c',
  gilded: '#d4a72c',
  marble: '#e7e3da',
  limestone: '#cfc6b0',
  stone: '#8b8a86',
  stoneDark: '#5f5e5b',
  iron: '#4a4d55',
  steel: '#9aa1ab',
  cloth: '#9f1d2b',
  rope: '#c2a36b',
  paper: '#f2ead8',
  ink: '#18181b',
};

/** Design-tool accents. */
export const UI = {
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  pink: '#f472b6',
  violet: '#a855f7',
  yellow: '#facc15',
  green: '#22c55e',
  white: '#fafafa',
  grey: '#71717a',
  dark: '#18181b',
};
