/**
 * The player model: Tony, as an old-school player character rendered a bit
 * better than the game ever did. Long wavy hair with a centre part, round
 * wire glasses, tall and slim, in one of his actual outfits.
 *
 * Built procedurally as one continuous skinned mesh (no seams at the elbows
 * or knees) plus a few attached pieces: eyes that blink, glasses, a chest
 * print, a necklace, and a cloth cape with a painted emblem. Everything is
 * lofted from cross-sections around the bones in the rest pose (standing
 * straight, arms hanging) and skinned with soft weights across the joints.
 * Smooth shading, hard colour bands where the clothes change, baked
 * occlusion in the vertex colours, and procedural shirt patterns (polka
 * dots, embroidered stripes) evaluated in the shader.
 */
import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../house/kit';
import { DIM } from './poses';

export type HatId = 'none' | 'pointer';
export type OutfitId = 'croissant' | 'polka' | 'stripes' | 'classic';

export interface AvatarLook {
  skin: string;
  hair: string;
  outfit: OutfitId;
  glasses: boolean;
  cape: string;
  capeTrim: string;
  /** Wear the cape at all. */
  capeOn: boolean;
  hat: HatId;
}

export const TOE_KNEE: AvatarLook = {
  skin: '#e6b896',
  hair: '#ab8656',
  outfit: 'croissant',
  glasses: true,
  cape: '#2557d6',
  capeTrim: '#f4f4f5',
  capeOn: true,
  hat: 'none',
};

// ── outfits ──────────────────────────────────────────────────────────────────
type PatternId = 'none' | 'polka' | 'stripes';
interface Outfit {
  name: string;
  shirt: string;
  pattern: PatternId;
  /** Multiplies the shirt colour where the pattern is (dark dots, red stripes). */
  patternColor: string;
  sleeves: 'short' | 'long';
  /** Hem height: cropped shirts stop above the belt. */
  hem: number;
  collar: 'camp' | 'open' | 'crew' | 'point';
  /** An open jacket over the shirt. */
  jacket?: { color: string; collar: string };
  trousers: string;
  wide: boolean;
  belt: string;
  shoes: string;
  sneakers: boolean;
  print?: 'croissant';
  necklace?: boolean;
}

export const OUTFITS: Record<OutfitId, Outfit> = {
  // the conference look: a cropped sky-blue shirt with a croissant on a plate, wide black trousers, red sneakers
  croissant: {
    name: 'Croissant shirt',
    shirt: '#4ea3dc',
    pattern: 'none',
    patternColor: '#ffffff',
    sleeves: 'short',
    hem: 0.975,
    collar: 'camp',
    trousers: '#17171a',
    wide: true,
    belt: '#8a5a2b',
    shoes: '#c2412d',
    sneakers: true,
    print: 'croissant',
  },
  // night out: red polka-dot shirt open at the neck, a silver chain, the navy work jacket
  polka: {
    name: 'Polka dots & chore jacket',
    shirt: '#c8261f',
    pattern: 'polka',
    patternColor: '#151214',
    sleeves: 'long',
    hem: 0.9,
    collar: 'open',
    jacket: { color: '#2a3550', collar: '#a8865a' },
    trousers: '#1c1b1f',
    wide: false,
    belt: '#2a2018',
    shoes: '#1f1b18',
    sneakers: false,
    necklace: true,
  },
  // lunch: cream shirt with embroidered red stripes, long collar, dark trousers
  stripes: {
    name: 'Embroidered stripes',
    shirt: '#f1e9dc',
    pattern: 'stripes',
    patternColor: '#c4423a',
    sleeves: 'long',
    hem: 0.9,
    collar: 'point',
    trousers: '#1d1c22',
    wide: false,
    belt: '#7a5233',
    shoes: '#2a211b',
    sneakers: false,
  },
  // a fresh account: linen shirt, brown trousers, boots
  classic: {
    name: 'Fresh account',
    shirt: '#d8d0bf',
    pattern: 'none',
    patternColor: '#ffffff',
    sleeves: 'long',
    hem: 0.9,
    collar: 'crew',
    trousers: '#5c4632',
    wide: false,
    belt: '#3b2a1a',
    shoes: '#3a281b',
    sneakers: false,
  },
};

// ── skeleton ─────────────────────────────────────────────────────────────────
export const B = {
  root: 0,
  pelvis: 1,
  chest: 2,
  head: 3,
  thighL: 4,
  shinL: 5,
  footL: 6,
  thighR: 7,
  shinR: 8,
  footR: 9,
  upperL: 10,
  foreL: 11,
  handL: 12,
  upperR: 13,
  foreR: 14,
  handR: 15,
} as const;

/** Rest-pose joint positions (body space): standing straight, arms hanging. */
const P = DIM.pelvisY;
const REST = {
  pelvis: new THREE.Vector3(0, P, 0),
  hip: (s: number) => new THREE.Vector3(s * DIM.hip[0], P + DIM.hip[1], 0),
  knee: (s: number) => new THREE.Vector3(s * DIM.hip[0], P + DIM.hip[1] - DIM.thigh, 0),
  ankle: (s: number) => new THREE.Vector3(s * DIM.hip[0], P + DIM.hip[1] - DIM.thigh - DIM.shin, 0),
  shoulder: (s: number) => new THREE.Vector3(s * DIM.shoulder[0], P + DIM.shoulder[1], 0),
  elbow: (s: number) => new THREE.Vector3(s * DIM.shoulder[0], P + DIM.shoulder[1] - DIM.upper, 0),
  wrist: (s: number) => new THREE.Vector3(s * DIM.shoulder[0], P + DIM.shoulder[1] - DIM.upper - DIM.fore, 0),
  neck: new THREE.Vector3(0, P + DIM.neck[1], 0),
};

export function buildSkeleton() {
  const bone = (name: string, parent: THREE.Bone | null, at: THREE.Vector3, parentAt: THREE.Vector3) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(at).sub(parentAt);
    parent?.add(b);
    return b;
  };
  const O = new THREE.Vector3();
  const root = bone('root', null, O, O);
  const pelvis = bone('pelvis', root, REST.pelvis, O);
  const chest = bone('chest', pelvis, REST.pelvis, REST.pelvis);
  const head = bone('head', chest, REST.neck, REST.pelvis);
  const bones: THREE.Bone[] = [root, pelvis, chest, head];
  for (const s of [1, -1]) {
    const thigh = bone(s > 0 ? 'thighL' : 'thighR', pelvis, REST.hip(s), REST.pelvis);
    const shin = bone(s > 0 ? 'shinL' : 'shinR', thigh, REST.knee(s), REST.hip(s));
    const foot = bone(s > 0 ? 'footL' : 'footR', shin, REST.ankle(s), REST.knee(s));
    bones.push(thigh, shin, foot);
  }
  for (const s of [1, -1]) {
    const upper = bone(s > 0 ? 'upperL' : 'upperR', chest, REST.shoulder(s), REST.pelvis);
    const fore = bone(s > 0 ? 'foreL' : 'foreR', upper, REST.elbow(s), REST.shoulder(s));
    const hand = bone(s > 0 ? 'handL' : 'handR', fore, REST.wrist(s), REST.elbow(s));
    bones.push(upper, fore, hand);
  }
  return bones;
}

// ── a little skinned-mesh builder ────────────────────────────────────────────
type W = [number, number][];
/** Pattern coordinates: arc length around, height, and whether the pattern applies. */
type Pat = [number, number, number];
type ColorFn = (a: number, p: THREE.Vector3) => THREE.Color;

/**
 * Baked occlusion for the rest pose: light from above, and the creases a
 * real render would darken (crotch, armpits, under the belt, the throat).
 */
function occlusion(p: THREE.Vector3) {
  let k = 0.82 + 0.18 * THREE.MathUtils.smoothstep(p.y, 0, 1.5);
  const ax = Math.abs(p.x);
  if (p.y > 0.55 && p.y < 0.8 && ax < 0.06) k *= 0.76 + 0.24 * (ax / 0.06);
  if (p.y > 1.08 && p.y < 1.3 && ax > 0.13 && ax < 0.22) k *= 0.86;
  if (p.y > 1.37 && p.y < 1.45 && ax < 0.075) k *= 0.82;
  return k;
}

class SkinBuilder {
  pos: number[] = [];
  col: number[] = [];
  pat: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  vertex(p: THREE.Vector3, c: THREE.Color, w: W, pat: Pat = [0, 0, 0], ao = true) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    const k = ao ? occlusion(p) : 1;
    this.col.push(c.r * k, c.g * k, c.b * k);
    this.pat.push(...pat);
    const ws = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = ws.reduce((a, [, x]) => a + x, 0) || 1;
    for (let j = 0; j < 4; j++) {
      this.si.push(ws[j]?.[0] ?? 0);
      this.sw.push((ws[j]?.[1] ?? 0) / sum);
    }
    return i;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * A superellipse ring of `n` points around `c` in the plane of axes u, v
   * (`e` = 2 is an ellipse; higher is boxier). `shape` can push each point;
   * colour can vary around the ring; `pattern` marks shirt fabric.
   */
  ring(
    c: THREE.Vector3,
    u: THREE.Vector3,
    v: THREE.Vector3,
    ru: number,
    rv: number,
    n: number,
    e: number,
    color: THREE.Color | ColorFn,
    w: W,
    shape?: (a: number, p: THREE.Vector3) => void,
    pattern?: (a: number, p: THREE.Vector3) => number
  ) {
    const out: number[] = [];
    const r = (ru + rv) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * ru;
      const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * rv;
      const p = c.clone().addScaledVector(u, x).addScaledVector(v, y);
      shape?.(a, p);
      const col = typeof color === 'function' ? color(a, p) : color;
      const m = pattern?.(a, p) ?? 0;
      out.push(this.vertex(p, col, w, [fromFront(a) * r, p.y, m]));
    }
    return out;
  }
  /** Join two rings with quads (same point counts, same winding). */
  join(a: number[], b: number[]) {
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(a[i], a[j], b[j], b[i]);
    }
  }
  /** Close a ring with a fan to a point. `flip` reverses the winding. */
  cap(r: number[], p: THREE.Vector3, color: THREE.Color, w: W, flip = false) {
    const c = this.vertex(p, color, w);
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(c, r[j], r[i]);
      else this.tri(c, r[i], r[j]);
    }
  }
  /** A flat quad from four points. */
  flat(pts: THREE.Vector3[], c: THREE.Color, w: W) {
    const v = pts.map((q) => this.vertex(q, c, w, [0, 0, 0], false));
    this.quad(v[0], v[1], v[2], v[3]);
  }
  /** Append an existing indexed geometry with a colour and weights per vertex. */
  append(g: THREE.BufferGeometry, color: (p: THREE.Vector3) => THREE.Color, w: (p: THREE.Vector3) => W) {
    const base = this.pos.length / 3;
    const pa = g.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i);
      this.vertex(p, color(p), w(p));
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.pat, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
/**
 * Ring axes for a loft heading along `dir`: u × v = dir, so joined rings
 * face outward. (Lofts down a limb use X, Z; up the torso Z, X; along the
 * foot X, Y.)
 */
function frameFor(dir: THREE.Vector3) {
  const d = dir.clone().normalize();
  const u = Math.abs(d.y) > 0.9 ? X.clone() : Y.clone();
  u.addScaledVector(d, -u.dot(d)).normalize();
  const v = new THREE.Vector3().crossVectors(d, u).normalize();
  return { u, v };
}
const col = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const lerpW = (a: number, b: number, t: number): W => [
  [a, 1 - t],
  [b, t],
];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Angle from the front, folded to 0..π (torso rings start at +Z). */
const fromFront = (a: number) => Math.min(a, Math.PI * 2 - a);

// ── head ─────────────────────────────────────────────────────────────────────
/** Head shape, in head space (origin at the base of the neck, before HEAD_T). */
const HEAD_C = new THREE.Vector3(0, 0.205, 0.012);
const HEAD_R = new THREE.Vector3(0.104, 0.153, 0.12);
/**
 * Head space → body space: old-school heads are big, sit low on a short neck
 * and a little forward of the shoulders.
 */
export const HEAD_SCALE = 1.14;
export const HEAD_OFFSET = new THREE.Vector3(0, -0.042, 0.02);
const HEAD_T = new THREE.Matrix4().compose(REST.neck.clone().add(HEAD_OFFSET), new THREE.Quaternion(), new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));

/** Sculpt a point of the head ellipsoid: a long jaw, chin, flat face, brow, cheeks, skull. */
function sculpt(p: THREE.Vector3) {
  const rel = p.clone().sub(HEAD_C);
  const ny = rel.y / HEAD_R.y; // -1 chin … 1 crown
  const nz = rel.z / HEAD_R.z; // -1 back … 1 face
  // a slim jaw narrowing to a defined chin
  if (ny < 0.05) {
    const t = Math.min(1, (0.05 - ny) / 1.05);
    rel.x *= 1 - 0.46 * t * t;
    if (nz < 0.3) rel.z *= 1 - 0.35 * t; // under the jaw tucks in
    rel.y *= 1 - 0.08 * t;
  }
  // a flatter face, slightly forward
  if (rel.z > 0.075) rel.z = 0.075 + (rel.z - 0.075) * 0.55;
  // brow ridge
  if (nz > 0.55 && ny > 0.1 && ny < 0.45) rel.z += 0.008 * (1 - Math.abs(ny - 0.27) / 0.18);
  // cheekbones
  if (nz > 0.3 && ny > -0.25 && ny < 0.15) rel.x *= 1.04;
  // a fuller back of the skull
  if (nz < -0.2 && ny > -0.2) rel.z *= 1.06;
  p.copy(rel.add(HEAD_C));
  return p;
}

/** The face's surface point at (x, y) in head space. */
function facePoint(x: number, y: number, out = new THREE.Vector3()) {
  const nx = x / HEAD_R.x;
  const ny = (y - HEAD_C.y) / HEAD_R.y;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  out.set(x, y, HEAD_C.z + nz * HEAD_R.z);
  return sculpt(out);
}

function headGeometry() {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 16, 12);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pa = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    p.fromBufferAttribute(pa, i).multiply(HEAD_R).add(HEAD_C);
    sculpt(p);
    pa.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Is this point of the head under the hair? A high forehead, centre part, hair down the sides and back. */
function hairMask(p: THREE.Vector3) {
  const d = p.clone().sub(HEAD_C).divide(HEAD_R);
  const front = THREE.MathUtils.smoothstep(d.z, -0.35, 0.75);
  // the hairline sweeps up and back from the temples to the part
  let line = THREE.MathUtils.lerp(-0.6, 0.5 - 0.62 * Math.min(1, Math.abs(d.x) * 1.7), front);
  line += Math.sin(Math.atan2(d.x, d.z) * 9) * 0.02 * front;
  if (Math.abs(d.x) > 0.72 && d.z < 0.45) line = Math.min(line, -0.3);
  return d.y > line;
}

/** The hair over the scalp: a shell closed at its edge, with a centre part. */
function addScalp(sb: SkinBuilder, head: THREE.BufferGeometry, hair: string, T: THREE.Matrix4) {
  const pa = head.attributes.position;
  const na = head.attributes.normal;
  const ix = head.index!;
  const inHair = new Uint8Array(pa.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) inHair[i] = hairMask(p.fromBufferAttribute(pa, i)) ? 1 : 0;
  const outer = new Map<number, number>();
  const inner = new Map<number, number>();
  const base = new THREE.Color(hair);
  const w: W = [[B.head, 1]];
  const vOuter = (i: number) => {
    let o = outer.get(i);
    if (o === undefined) {
      p.fromBufferAttribute(pa, i);
      const n = new THREE.Vector3().fromBufferAttribute(na, i);
      const d = p.clone().sub(HEAD_C).divide(HEAD_R);
      // volume on top and at the sides, where the waves start
      const thick = 0.014 + Math.max(0, d.y) * 0.018 + Math.abs(d.x) * 0.014;
      const q = p.clone().addScaledVector(n, thick).applyMatrix4(T);
      // the part: a darker line from the forehead back over the crown
      const part = Math.abs(d.x) < 0.07 && d.y > 0.35 && d.z > -0.3;
      const k = (part ? 0.62 : 0.92 + ((i * 2654435761) % 97) / 97 * 0.18) * (0.95 + Math.max(0, d.y) * 0.1);
      o = sb.vertex(q, base.clone().multiplyScalar(k), w, [0, 0, 0], false);
      outer.set(i, o);
    }
    return o;
  };
  const vInner = (i: number) => {
    let o = inner.get(i);
    if (o === undefined) {
      p.fromBufferAttribute(pa, i);
      const n = new THREE.Vector3().fromBufferAttribute(na, i);
      o = sb.vertex(p.clone().addScaledVector(n, 0.002).applyMatrix4(T), base.clone().multiplyScalar(0.7), w, [0, 0, 0], false);
      inner.set(i, o);
    }
    return o;
  };
  const edges = new Map<string, [number, number, number]>();
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t);
    const b = ix.getX(t + 1);
    const c = ix.getX(t + 2);
    if (!(inHair[a] && inHair[b] && inHair[c])) continue;
    sb.tri(vOuter(a), vOuter(b), vOuter(c));
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      const e = edges.get(key);
      if (e) e[2]++;
      else edges.set(key, [x, y, 1]);
    }
  }
  for (const [x, y, count] of edges.values()) if (count === 1) sb.quad(vOuter(y), vOuter(x), vInner(x), vInner(y));
}

/**
 * Long, wavy hair falling past the shoulders: a curtain lofted round the head
 * from the temples down, open at the face, splitting at the shoulders into
 * locks that fall in front onto the chest and a mass down the back. Rooted
 * on the head, settling onto the chest as it falls.
 */
function addLongHair(sb: SkinBuilder, hair: string, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = new THREE.Color(hair);
  const tips = base.clone().lerp(new THREE.Color('#e3c48e'), 0.45);
  const rings = [
    { y: 1.665, rx: 0.13, rz: 0.142, zc: 0.03 },
    { y: 1.62, rx: 0.148, rz: 0.156, zc: 0.025 },
    { y: 1.56, rx: 0.162, rz: 0.164, zc: 0.018 },
    { y: 1.49, rx: 0.17, rz: 0.165, zc: 0.005 },
    { y: 1.42, rx: 0.188, rz: 0.165, zc: -0.008 },
    { y: 1.355, rx: 0.216, rz: 0.172, zc: -0.018 },
    { y: 1.26, rx: 0.212, rz: 0.178, zc: -0.024 },
    { y: 1.16, rx: 0.206, rz: 0.18, zc: -0.026 },
    { y: 1.06, rx: 0.2, rz: 0.178, zc: -0.026 },
  ];
  const COLS = 21;
  const TH = (140 * Math.PI) / 180;
  const theta = (i: number) => -TH + (i / (COLS - 1)) * 2 * TH;
  const deg = (r: number) => (Math.abs(r) * 180) / Math.PI;
  /** Below the shoulders only the back mass and the front locks continue. */
  const exists = (i: number, y: number) => y > 1.37 || deg(theta(i)) < 64 || deg(theta(i)) > 112;
  // each column ends at its own length, so the ends are ragged
  const length = Array.from({ length: COLS }, () => rand());
  const grid: (number | null)[][] = [];
  rings.forEach((r, k) => {
    const row: (number | null)[] = [];
    for (let i = 0; i < COLS; i++) {
      if (!exists(i, r.y)) {
        row.push(null);
        continue;
      }
      const th = theta(i);
      const front = THREE.MathUtils.smoothstep(deg(th), 100, 128) * THREE.MathUtils.smoothstep(1.45 - r.y, 0, 0.08);
      const wave = 1 + 0.085 * Math.sin(th * 5 + r.y * 24 + i * 1.3) + 0.04 * Math.sin(th * 11 - r.y * 13) + (i % 2) * 0.025;
      let x = Math.sin(th) * r.rx * wave * (1 - 0.32 * front);
      let z = r.zc - Math.cos(th) * r.rz * wave + front * 0.07;
      let y = r.y;
      if (k === rings.length - 1) {
        // ragged ends: shorter at the front locks
        y += (length[i] - 0.5) * 0.12 + front * 0.06;
        x *= 0.96;
        z *= 0.96;
      }
      const p = V(x, y, z);
      const fall = THREE.MathUtils.smoothstep(1.66 - y, 0, 0.6);
      const strand = (i % 2 ? 1.04 : 0.84) + (i % 3) * 0.04 + (rand() - 0.5) * 0.08;
      const c = base.clone().lerp(tips, fall).multiplyScalar(strand);
      const w: W = y > 1.47 ? [[B.head, 1]] : y > 1.36 ? lerpW(B.head, B.chest, (1.47 - y) / 0.11) : [[B.chest, 1]];
      row.push(sb.vertex(p, c, w, [0, 0, 0], false));
    }
    grid.push(row);
  });
  for (let k = 0; k < grid.length - 1; k++)
    for (let i = 0; i < COLS - 1; i++) {
      const a = grid[k][i];
      const b = grid[k][i + 1];
      const c = grid[k + 1][i + 1];
      const d = grid[k + 1][i];
      if (a === null || b === null || c === null || d === null) continue;
      sb.quad(a, b, c, d);
    }
}

/** The pointer helm: the cursor stood up on a black skullcap. */
function addPointerHelm(sb: SkinBuilder, T: THREE.Matrix4) {
  const w: W = [[B.head, 1]];
  const black = new THREE.Color('#121214');
  const white = new THREE.Color('#fafafa');
  const rings: number[][] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const y = 0.27 + t * 0.12;
    const r = Math.cos((t * Math.PI) / 2.2);
    rings.push(sb.ring(new THREE.Vector3(0, y, 0.005).applyMatrix4(T), Z, X, (0.15 * r + 0.004) * HEAD_SCALE, (0.135 * r + 0.004) * HEAD_SCALE, 14, 2.2, i === 0 ? col('#27272a') : black, w));
  }
  for (let i = 0; i < 4; i++) sb.join(rings[i], rings[i + 1]);
  sb.cap(rings[4], new THREE.Vector3(0, 0.405, 0.005).applyMatrix4(T), black, w);
  const pts: [number, number][] = [
    [0, 0],
    [0, 16],
    [4, 12.5],
    [7, 19],
    [9.6, 18],
    [6.6, 11.6],
    [11.5, 11.5],
  ];
  const fin = (scale: number, depth: number, color: THREE.Color) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 4) * scale, (14 - y) * scale)));
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    g.rotateZ(0.12);
    g.rotateX(-0.15);
    g.translate(0, 0.34, -0.01);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    g.applyMatrix4(T);
    sb.append(g, () => color, () => w);
  };
  fin(0.02, 0.05, white);
  fin(0.0168, 0.07, black);
}

/** Eyes on their own little mesh so they can blink; origin at the eye line (head space). */
export const EYE_Y = 0.205;
export function eyesGeometry() {
  const pos: number[] = [];
  const cl: number[] = [];
  const quad = (x0: number, y0: number, x1: number, y1: number, dz: number, c: THREE.Color) => {
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y0],
      [x1, y1],
      [x0, y1],
    ]) {
      const s = facePoint(x, EYE_Y + y);
      pos.push(x, y, s.z + dz);
      cl.push(c.r, c.g, c.b);
    }
  };
  const white = new THREE.Color('#e3ddd2');
  const iris = new THREE.Color('#6f8aa3');
  const pupil = new THREE.Color('#0c0a09');
  const lid = new THREE.Color('#5a3a26');
  for (const s of [1, -1]) {
    const cx = s * 0.042;
    quad(cx - 0.017, -0.008, cx + 0.017, 0.008, 0.003, white);
    quad(cx - s * 0.002 - 0.009, -0.008, cx - s * 0.002 + 0.009, 0.008, 0.005, iris);
    quad(cx - s * 0.002 - 0.0035, -0.0035, cx - s * 0.002 + 0.0035, 0.0045, 0.006, pupil);
    quad(cx - 0.019, 0.007, cx + 0.019, 0.011, 0.006, lid);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.computeVertexNormals();
  return g;
}

/** Round wire-rim glasses, in head space (attach with the head transform). */
export function glassesGeometry() {
  const k = new Kit(23);
  const wire = '#c9b78f';
  const fz = (x: number) => facePoint(x, EYE_Y).z + 0.016;
  for (const s of [1, -1]) {
    const cx = s * 0.043;
    k.torus(0.031, 0.0034, wire, [cx, EYE_Y, fz(cx)], 4, 18, Math.PI * 2, { jitter: 0 });
    // temple arm back to the ear
    const a = V(s * 0.073, EYE_Y + 0.006, fz(s * 0.07) - 0.004);
    const b = V(s * (HEAD_R.x + 0.006), EYE_Y + 0.004, -0.01);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    k.box(0.005, 0.005, len, wire, [mid.x, mid.y - 0.0025, mid.z], { rot: [0, yaw, 0], jitter: 0 });
  }
  // bridge
  k.tube(
    [
      [-0.014, EYE_Y + 0.006, fz(0.012)],
      [0, EYE_Y + 0.012, fz(0) + 0.002],
      [0.014, EYE_Y + 0.006, fz(0.012)],
    ],
    0.0032,
    wire,
    { seg: 6, radial: 4, jitter: 0 }
  );
  return k.build(false)!;
}

/** Faint lenses that catch the light. */
export function lensGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const cx = s * 0.043;
    const g = new THREE.CircleGeometry(0.029, 16);
    g.translate(cx, EYE_Y, facePoint(cx, EYE_Y).z + 0.016);
    parts.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const pos = parts.flatMap((g) => {
    const ng = g.toNonIndexed();
    return Array.from(ng.attributes.position.array as Float32Array);
  });
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

// ── the body ─────────────────────────────────────────────────────────────────
function buildBody(L: AvatarLook) {
  const O = OUTFITS[L.outfit];
  const sb = new SkinBuilder();
  const shirt = col(O.shirt);
  const shirtDark = col(O.shirt, 0.82);
  const trousers = col(O.trousers);
  const skin = col(L.skin);
  const belt = col(O.belt);
  const jacket = O.jacket ? col(O.jacket.color) : null;
  const patterned = O.pattern !== 'none' ? 1 : 0;
  const pel = B.pelvis;
  const ch = B.chest;

  // torso: lofted from the crotch to the collar. A jacket wraps everything
  // but a strip down the front; an open collar shows skin in a V.
  const openFront = (a: number) => fromFront(a) < 0.62;
  const torsoColor = (base: THREE.Color, y: number): ColorFn => (a) => {
    if (O.collar === 'open' && y > 1.29 && fromFront(a) < 0.3 + (y - 1.29) * 2.4) return skin;
    if (jacket && !openFront(a) && y > 0.78) return jacket;
    return base;
  };
  const isShirt = (base: THREE.Color) => base === shirt || base === shirtDark;
  type TRing = { y: number; rx: number; rz: number; z?: number; c: THREE.Color; w: W; e?: number };
  const hem = O.hem;
  const torso: TRing[] = [
    { y: 0.7, rx: 0.11, rz: 0.075, c: trousers, w: [[pel, 1]] },
    { y: 0.76, rx: 0.152, rz: 0.098, c: trousers, w: [[pel, 1]] },
    { y: 0.84, rx: 0.158, rz: 0.104, c: trousers, w: [[pel, 1]] },
    { y: hem - 0.065, rx: 0.157, rz: 0.104, c: trousers, w: [[pel, 1]] },
    { y: hem - 0.065, rx: 0.159, rz: 0.106, c: belt, w: [[pel, 1]] },
    { y: hem - 0.02, rx: 0.159, rz: 0.106, c: belt, w: [[pel, 0.85], [ch, 0.15]] },
    // a cropped, boxy shirt hangs loose at the hem
    { y: hem - 0.02, rx: hem > 0.95 ? 0.172 : 0.153, rz: hem > 0.95 ? 0.116 : 0.1, c: shirtDark, w: [[pel, 0.8], [ch, 0.2]] },
    { y: hem + 0.02, rx: hem > 0.95 ? 0.17 : 0.152, rz: hem > 0.95 ? 0.114 : 0.1, c: shirt, w: lerpW(pel, ch, 0.4) },
    { y: Math.max(hem + 0.07, 1.02), rx: 0.152, rz: 0.102, c: shirt, w: lerpW(pel, ch, 0.75) },
    { y: 1.1, rx: 0.156, rz: 0.108, z: 0.006, c: shirt, w: [[ch, 1]] },
    { y: 1.18, rx: 0.168, rz: 0.116, z: 0.01, c: shirt, w: [[ch, 1]] },
    { y: 1.26, rx: 0.185, rz: 0.11, z: 0.006, c: shirt, w: [[ch, 1]] },
    { y: 1.32, rx: 0.205, rz: 0.1, c: shirt, w: [[ch, 1]], e: 2.5 },
    { y: 1.36, rx: 0.16, rz: 0.088, c: shirt, w: [[ch, 1]], e: 2.3 },
    { y: 1.385, rx: 0.09, rz: 0.08, c: shirt, w: [[ch, 1]], e: 2 },
    { y: 1.408, rx: 0.08, rz: 0.074, c: shirtDark, w: [[ch, 1]], e: 2 },
    { y: 1.412, rx: 0.064, rz: 0.06, c: shirtDark, w: [[ch, 1]], e: 2 },
  ];
  // the jacket hangs past the waist: add its skirt as rings below the shirt hem
  let prev: number[] | null = null;
  let first: number[] | null = null;
  for (const r of torso) {
    const isTop = isShirt(r.c);
    const ring = sb.ring(
      V(0, r.y, r.z ?? 0),
      Z,
      X,
      r.rz + (jacket && r.y > 0.78 ? 0.008 : 0),
      r.rx + (jacket && r.y > 0.78 ? 0.01 : 0),
      16,
      r.e ?? 2.6,
      torsoColor(r.c, r.y),
      r.w,
      (a, p) => {
        // a slight chest and shoulder blades
        if (r.y > 1.1 && r.y < 1.3) p.z += Math.max(0, Math.cos(a)) * 0.006 - Math.max(0, -Math.cos(a)) * 0.004;
      },
      (a, p) => (isTop && patterned && torsoColor(r.c, r.y)(a, p) === r.c ? 1 : 0)
    );
    if (prev) sb.join(prev, ring);
    else first = ring;
    prev = ring;
  }
  sb.cap(first!, V(0, 0.69, 0), trousers, [[pel, 1]], true);

  // collar points, placket and buttons on the front
  const front = (x: number, y: number, lift = 0.004) => {
    // the torso's front surface at height y (good enough for details)
    const t = torso.reduce((best, r) => (Math.abs(r.y - y) < Math.abs(best.y - y) ? r : best));
    const zf = (t.z ?? 0) + t.rz * Math.sqrt(Math.max(0, 1 - (x / t.rx) ** 2)) + lift;
    return V(x, y, zf);
  };
  const collarC = O.collar === 'crew' ? null : O.jacket ? col(O.shirt, 0.9) : col(O.shirt, 0.95);
  if (collarC) {
    const long = O.collar === 'point' ? 0.09 : 0.06;
    for (const sx of [1, -1]) {
      const a = front(sx * 0.03, 1.405, 0.012);
      const b = front(sx * 0.075, 1.39, 0.01);
      const c = front(sx * (0.06 + long * 0.4), 1.4 - long - 0.02, 0.012);
      const d = front(sx * 0.012, 1.33 - (O.collar === 'open' ? 0.02 : 0), 0.012);
      sb.flat(sx > 0 ? [a, b, c, d] : [b, a, d, c], collarC, [[ch, 1]]);
    }
  }
  if (O.collar !== 'crew' && O.collar !== 'open') {
    for (let y = 1.3; y > hem + 0.02; y -= 0.075) {
      const c = front(0, y, 0.005);
      sb.flat([c.clone().add(V(-0.008, -0.008, 0)), c.clone().add(V(0.008, -0.008, 0)), c.clone().add(V(0.008, 0.008, 0)), c.clone().add(V(-0.008, 0.008, 0))], col(O.pattern === 'stripes' ? '#8f2a24' : '#f4f4f5'), [[ch, 1]]);
    }
  }
  // the jacket's collar: a band round the back of the neck, folded down
  if (O.jacket) {
    const jc = col(O.jacket.collar);
    const arc = (y: number, rx: number, rz: number, zc: number, lift: number) => {
      const out: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = THREE.MathUtils.lerp(0.95, Math.PI * 2 - 0.95, i / 12);
        const p = V(Math.sin(a) * rx, y + (Math.cos(a) > 0 ? -lift * Math.cos(a) : 0), zc + Math.cos(a) * rz);
        out.push(sb.vertex(p, jc, [[ch, 1]]));
      }
      return out;
    };
    const lo = arc(1.37, 0.118, 0.1, -0.01, 0.06);
    const hi = arc(1.43, 0.09, 0.085, -0.016, 0.02);
    for (let i = 0; i < 12; i++) sb.quad(lo[i], lo[i + 1], hi[i + 1], hi[i]);
  }
  // the belt buckle (only shows where the shirt is tucked in or cropped)
  const bc = front(0, hem - 0.042, 0.006);
  sb.flat([bc.clone().add(V(-0.028, -0.02, 0)), bc.clone().add(V(0.028, -0.02, 0)), bc.clone().add(V(0.028, 0.02, 0)), bc.clone().add(V(-0.028, 0.02, 0))], col('#c9a227'), [[pel, 1]]);

  // neck: skin, from inside the collar up under the jaw
  let nprev: number[] | null = null;
  for (const n of [
    { y: 1.37, r: 0.064, w: [[ch, 1]] as W },
    { y: 1.415, r: 0.062, w: lerpW(ch, B.head, 0.6) },
    { y: 1.455, r: 0.06, w: [[B.head, 1]] as W },
  ]) {
    const ring = sb.ring(V(0, n.y, -0.008), Z, X, n.r * 0.95, n.r, 10, 2, skin, n.w);
    if (nprev) sb.join(nprev, ring);
    nprev = ring;
  }

  // legs
  for (const s of [1, -1]) {
    const th = s > 0 ? B.thighL : B.thighR;
    const sh = s > 0 ? B.shinL : B.shinR;
    const ft = s > 0 ? B.footL : B.footR;
    const x = s * DIM.hip[0];
    const knee = REST.knee(s).y;
    const ankle = REST.ankle(s).y;
    const wide = O.wide ? 1 : 0;
    const rings: { y: number; r: number; c: THREE.Color; w: W; z?: number }[] = [
      { y: 0.83, r: 0.084, c: trousers, w: lerpW(pel, th, 0.4) },
      { y: 0.74, r: 0.082 + wide * 0.006, c: trousers, w: lerpW(pel, th, 0.85) },
      { y: 0.6, r: 0.07 + wide * 0.014, c: trousers, w: [[th, 1]] },
      { y: knee + 0.06, r: 0.062 + wide * 0.022, c: trousers, w: lerpW(th, sh, 0.25) },
      { y: knee, r: 0.061 + wide * 0.024, c: trousers, w: lerpW(th, sh, 0.5), z: 0.006 },
      { y: knee - 0.06, r: 0.058 + wide * 0.027, c: trousers, w: lerpW(th, sh, 0.8) },
      { y: knee - 0.17, r: 0.056 + wide * 0.03, c: trousers, w: [[sh, 1]], z: -0.006 },
    ];
    if (O.wide) {
      // wide legs fall straight over the shoes
      rings.push({ y: ankle + 0.03, r: 0.088, c: trousers, w: [[sh, 0.8], [ft, 0.2]] });
      rings.push({ y: ankle - 0.02, r: 0.09, c: col(O.trousers, 0.8), w: lerpW(sh, ft, 0.4) });
    } else {
      rings.push({ y: ankle + 0.08, r: 0.05, c: trousers, w: [[sh, 1]] });
      rings.push({ y: ankle + 0.05, r: 0.052, c: col(O.trousers, 0.8), w: [[sh, 0.8], [ft, 0.2]] });
      rings.push({ y: ankle + 0.05, r: 0.045, c: col(O.shoes, 0.8), w: [[sh, 0.7], [ft, 0.3]] });
      rings.push({ y: ankle + 0.01, r: 0.05, c: col(O.shoes), w: lerpW(sh, ft, 0.6) });
    }
    let lp: number[] | null = null;
    for (const r of rings) {
      const ring = sb.ring(V(x, r.y, r.z ?? 0), X, Z, r.r, r.r * 1.04, 10, 2.2, r.c, r.w);
      if (lp) sb.join(lp, ring);
      lp = ring;
    }
    // the shoe, lofted heel to toe: sneakers get white rubber soles and toe caps
    const shoe = col(O.shoes);
    const rubber = col('#f2efe8');
    const foot: { z: number; y0: number; y1: number; hw: number }[] = [
      { z: -0.08, y0: -0.07, y1: 0.0, hw: 0.05 },
      { z: -0.055, y0: -0.075, y1: 0.03, hw: 0.06 },
      { z: 0.035, y0: -0.075, y1: 0.02, hw: 0.064 },
      { z: 0.11, y0: -0.075, y1: -0.008, hw: 0.062 },
      { z: 0.165, y0: -0.072, y1: -0.025, hw: 0.054 },
      { z: 0.19, y0: -0.066, y1: -0.042, hw: 0.04 },
    ];
    let fp: number[] | null = null;
    let firstF: number[] | null = null;
    for (const f of foot) {
      const c = V(x, ankle + (f.y0 + f.y1) / 2, f.z);
      const ring = sb.ring(
        c,
        X,
        Y,
        f.hw,
        (f.y1 - f.y0) / 2,
        12,
        3,
        (a, p) => (O.sneakers && (p.y < ankle - 0.05 || f.z > 0.16) ? rubber : shoe),
        [[ft, 1]],
        (a, p) => {
          if (Math.sin(a) < -0.6) p.y = ankle + f.y0; // flat sole
        }
      );
      if (fp) sb.join(fp, ring);
      else firstF = ring;
      fp = ring;
    }
    sb.cap(firstF!, V(x, ankle - 0.035, -0.083), O.sneakers ? rubber : shoe, [[ft, 1]], true);
    sb.cap(fp!, V(x, ankle - 0.055, 0.198), O.sneakers ? rubber : shoe, [[ft, 1]]);
    const soleC = O.sneakers ? col('#d8d2c6') : col('#1a120c');
    sb.flat(
      [V(x - 0.064, ankle - 0.078, 0.19), V(x + 0.064, ankle - 0.078, 0.19), V(x + 0.066, ankle - 0.078, -0.08), V(x - 0.066, ankle - 0.078, -0.08)],
      soleC,
      [[ft, 1]]
    );
    if (O.sneakers)
      for (let i = 0; i < 3; i++) {
        // laces
        const z = 0.0 + i * 0.035;
        const y = ankle + 0.015 - i * 0.012;
        sb.flat([V(x - 0.03, y, z), V(x + 0.03, y, z), V(x + 0.03, y + 0.004, z + 0.012), V(x - 0.03, y + 0.004, z + 0.012)], rubber, [[ft, 1]]);
      }
  }

  // arms: long sleeves to the wrist, or short boxy ones over bare forearms
  for (const s of [1, -1]) {
    const up = s > 0 ? B.upperL : B.upperR;
    const fo = s > 0 ? B.foreL : B.foreR;
    const ha = s > 0 ? B.handL : B.handR;
    const x = s * DIM.shoulder[0];
    const sy = REST.shoulder(s).y;
    const el = REST.elbow(s).y;
    const wr = REST.wrist(s).y;
    const sleeve = jacket ?? shirt;
    const sleeveDark = jacket ? col(O.jacket!.color, 0.8) : shirtDark;
    const pat = (c: THREE.Color) => (c === shirt && patterned ? () => 1 : undefined);
    type ARing = { y: number; r: number; c: THREE.Color; w: W; rz?: number };
    const rings: ARing[] = [
      { y: sy + 0.02, r: 0.05, c: sleeve, w: lerpW(ch, up, 0.45) },
      { y: sy - 0.02, r: 0.066, c: sleeve, w: lerpW(ch, up, 0.65) },
      { y: sy - 0.09, r: 0.06, c: sleeve, w: [[up, 1]] },
    ];
    if (O.sleeves === 'short') {
      // a boxy short sleeve ending above the elbow, then the bare arm
      rings.push({ y: el + 0.1, r: 0.075, c: sleeve, w: lerpW(up, fo, 0.05) });
      rings.push({ y: el + 0.075, r: 0.077, c: sleeveDark, w: lerpW(up, fo, 0.1) });
      rings.push({ y: el + 0.075, r: 0.044, c: skin, w: lerpW(up, fo, 0.1) });
      rings.push({ y: el, r: 0.043, c: skin, w: lerpW(up, fo, 0.5) });
      rings.push({ y: el - 0.05, r: 0.041, c: skin, w: lerpW(up, fo, 0.85) });
      rings.push({ y: wr + 0.04, r: 0.034, c: skin, w: [[fo, 1]] });
    } else {
      rings.push({ y: el + 0.06, r: 0.053, c: sleeve, w: lerpW(up, fo, 0.2) });
      rings.push({ y: el, r: 0.052, c: sleeve, w: lerpW(up, fo, 0.5) });
      rings.push({ y: el - 0.05, r: 0.05, c: sleeve, w: lerpW(up, fo, 0.85) });
      rings.push({ y: wr + 0.07, r: 0.045, c: sleeve, w: [[fo, 1]] });
      rings.push({ y: wr + 0.035, r: 0.049, c: sleeveDark, w: [[fo, 1]] });
      rings.push({ y: wr + 0.005, r: 0.047, c: sleeveDark, w: lerpW(fo, ha, 0.3) });
    }
    rings.push({ y: wr + 0.005, r: 0.03, c: skin, w: lerpW(fo, ha, 0.3), rz: 0.04 });
    rings.push({ y: wr - 0.012, r: 0.031, c: skin, w: lerpW(fo, ha, 0.7), rz: 0.044 });
    let ap: number[] | null = null;
    for (const r of rings) {
      const ring = sb.ring(V(x, r.y, 0), X, Z, r.r, r.rz ?? r.r, 8, 2.1, r.c, r.w, undefined, pat(r.c));
      if (ap) sb.join(ap, ring);
      else sb.cap(ring, V(x, r.y + 0.02, 0), r.c, r.w, true);
      ap = ring;
    }
    // the hand: palm toward the leg, thumb forward; long fingers
    for (const h of [
      { y: wr - 0.035, hx: 0.031, hz: 0.048 },
      { y: wr - 0.08, hx: 0.03, hz: 0.052 },
      { y: wr - 0.125, hx: 0.027, hz: 0.049 },
      { y: wr - 0.16, hx: 0.021, hz: 0.036 },
    ]) {
      const ring = sb.ring(V(x, h.y, 0.004), X, Z, h.hx, h.hz, 8, 2.2, skin, [[ha, 1]]);
      sb.join(ap!, ring);
      ap = ring;
    }
    sb.cap(ap!, V(x, wr - 0.175, 0.004), skin, [[ha, 1]]);
    const ta = V(x - s * 0.006, wr - 0.045, 0.036);
    const tb = V(x - s * 0.011, wr - 0.088, 0.064);
    const tf = frameFor(tb.clone().sub(ta));
    const t0 = sb.ring(ta, tf.u, tf.v, 0.018, 0.015, 6, 2, skin, [[ha, 1]]);
    const t1 = sb.ring(tb, tf.u, tf.v, 0.014, 0.012, 6, 2, skin, [[ha, 1]]);
    sb.join(t0, t1);
    sb.cap(t1, tb.clone().add(V(-s * 0.002, -0.014, 0.008)), skin, [[ha, 1]]);
  }
  return sb;
}

/** The head, face, hair and hat, appended to the body builder. */
function addHead(sb: SkinBuilder, L: AvatarLook) {
  const T = HEAD_T;
  const head = headGeometry();
  const jawY = new THREE.Vector3(0, HEAD_C.y - 0.07, 0).applyMatrix4(T).y;
  const skin = col(L.skin);
  const stubble = skin.clone().lerp(col(L.hair, 0.7), 0.12);
  sb.append(
    head.clone().applyMatrix4(T),
    (p) => (p.y < jawY ? stubble.clone().multiplyScalar(0.94) : skin.clone()),
    () => [[B.head, 1]]
  );
  const w: W = [[B.head, 1]];
  const skinDark = col(L.skin, 0.86);
  // nose: a narrow bridge and a soft tip
  const n0 = facePoint(0, 0.212).applyMatrix4(T);
  const tip = facePoint(0, 0.164).add(V(0, -0.004, 0.024)).applyMatrix4(T);
  const wl = facePoint(0.016, 0.158).add(V(0, 0, 0.005)).applyMatrix4(T);
  const wr = facePoint(-0.016, 0.158).add(V(0, 0, 0.005)).applyMatrix4(T);
  const bl = facePoint(0.009, 0.206).applyMatrix4(T);
  const br = facePoint(-0.009, 0.206).applyMatrix4(T);
  const iv = [n0, tip, wl, wr, bl, br].map((p, i) => sb.vertex(p, i === 2 || i === 3 ? skinDark : skin, w));
  sb.tri(iv[4], iv[1], iv[2]);
  sb.tri(iv[5], iv[3], iv[1]);
  sb.tri(iv[4], iv[5], iv[1]);
  sb.tri(iv[2], iv[1], iv[3]);
  // ears (mostly under the hair)
  for (const s of [1, -1]) {
    const c = new THREE.Vector3(s * (HEAD_R.x - 0.006), 0.185, -0.005).applyMatrix4(T);
    const out = V(s, 0, -0.3);
    const f = frameFor(out);
    const r0 = sb.ring(c, f.u, f.v, 0.034, 0.022, 7, 2, skin, w);
    const r1 = sb.ring(c.clone().addScaledVector(out.normalize(), 0.02), f.u, f.v, 0.03, 0.018, 7, 2, skinDark, w);
    sb.join(r0, r1);
    sb.cap(r1, c.clone().addScaledVector(out, 0.022), skinDark, w);
  }
  // brows, and a small closed-mouth smile
  const stroke = (pts: [number, number][], hw: number, color: THREE.Color, lift = 0.004) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const q = [
        [x0, y0 - hw],
        [x1, y1 - hw],
        [x1, y1 + hw],
        [x0, y0 + hw],
      ].map(([x, y]) => sb.vertex(facePoint(x, y).add(V(0, 0, lift)).applyMatrix4(T), color, w, [0, 0, 0], false));
      sb.quad(q[0], q[1], q[2], q[3]);
    }
  };
  const brow = col(L.hair, 0.72);
  stroke(
    [
      [0.022, 0.232],
      [0.045, 0.238],
      [0.066, 0.232],
    ],
    0.0055,
    brow
  );
  stroke(
    [
      [-0.066, 0.232],
      [-0.045, 0.238],
      [-0.022, 0.232],
    ],
    0.0055,
    brow
  );
  stroke(
    [
      [-0.03, 0.124],
      [-0.012, 0.115],
      [0.012, 0.115],
      [0.03, 0.124],
    ],
    0.0042,
    col('#b06a5a')
  );
  addScalp(sb, head, L.hair, T);
  addLongHair(sb, L.hair);
  if (L.hat === 'pointer') addPointerHelm(sb, T);
}

export function buildAvatarGeometry(L: AvatarLook) {
  const sb = buildBody(L);
  addHead(sb, L);
  return sb.build();
}

/** A silver chain resting round the neck and onto the collarbones (chest-bone space). */
export function necklaceGeometry() {
  const k = new Kit(29);
  k.push([0, 1.395 - REST.pelvis.y, 0.012], [0.55, 0, 0]);
  k.torus(0.074, 0.0045, '#d9dde2', [0, 0, 0], 4, 22, Math.PI * 2, { rot: [Math.PI / 2, 0, 0], jitter: 0 });
  k.pop();
  return k.build(false)!;
}

// ── the chest print ──────────────────────────────────────────────────────────
/** A croissant on a toile plate, printed big on the front of the shirt. */
export function printTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  const c = S / 2;
  // the plate, with a blue toile rim of little flowers
  g.fillStyle = '#f3ecd8';
  g.beginPath();
  g.arc(c, c, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5574b3';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 53 + (i % 2) * 4;
    g.beginPath();
    g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3 + (i % 3), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#5574b3';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(c, c, 46, 0, Math.PI * 2);
  g.stroke();
  // the croissant: a fat crescent in segments
  g.save();
  g.translate(c, c + 6);
  g.rotate(-0.25);
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = (i / (segs - 1)) * 2 - 1;
    const x = t * 40;
    const y = -Math.cos(t * 1.3) * 16 + 6;
    const r = 19 - Math.abs(t) * 9;
    const grad = g.createRadialGradient(x - 3, y - 4, 1, x, y, r);
    grad.addColorStop(0, '#f6c766');
    grad.addColorStop(0.7, '#d9902e');
    grad.addColorStop(1, '#9a5a1c');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r * 0.75, r, t * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The front of the chest at (x, y) in body space (matches the torso rings there). */
function chestFront(x: number, y: number) {
  const rings = [
    { y: 1.02, rx: 0.152, rz: 0.102, z: 0 },
    { y: 1.1, rx: 0.156, rz: 0.108, z: 0.006 },
    { y: 1.18, rx: 0.168, rz: 0.116, z: 0.01 },
    { y: 1.26, rx: 0.185, rz: 0.11, z: 0.006 },
    { y: 1.32, rx: 0.205, rz: 0.1, z: 0 },
  ];
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].y < y) i++;
  const a = rings[i];
  const b = rings[i + 1];
  const t = THREE.MathUtils.clamp((y - a.y) / (b.y - a.y), 0, 1);
  const rx = THREE.MathUtils.lerp(a.rx, b.rx, t);
  const rz = THREE.MathUtils.lerp(a.rz, b.rz, t);
  const zc = THREE.MathUtils.lerp(a.z, b.z, t);
  const e = 2.6;
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / rx), e)), 1 / e);
  const bump = y > 1.1 && y < 1.3 ? 0.006 * k : 0;
  return zc + rz * k + bump;
}

/** The croissant print as a patch that follows the chest (chest-bone space). */
export function printGeometry() {
  const r = 0.085;
  const cy = 1.165;
  const g = new THREE.PlaneGeometry(r * 2, r * 2, 8, 8);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i) + cy;
    pa.setXYZ(i, x, y - REST.pelvis.y, chestFront(x, y) + 0.004);
  }
  g.computeVertexNormals();
  return g;
}

// ── the cape ─────────────────────────────────────────────────────────────────
export const CAPE_COLS = 8;
export const CAPE_ROWS = 12;
export const CAPE_LEN = 0.98;

/** The cape's rest shape: a flared panel that wraps the shoulders a little, with soft folds. */
function capeRest(u: number, v: number, out = new THREE.Vector3()) {
  const width = THREE.MathUtils.lerp(0.32, 0.5, Math.sqrt(v));
  const x = (u - 0.5) * width;
  const wrap = (1 - v) ** 4 * 0.06;
  const folds = Math.sin(u * Math.PI * 6) * 0.01 * Math.sqrt(v);
  out.set(x, -v * CAPE_LEN, (Math.abs(u - 0.5) * 2) ** 2 * wrap + folds);
  return out;
}

export function capeGeometry() {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= CAPE_ROWS; j++)
    for (let i = 0; i <= CAPE_COLS; i++) {
      const u = i / CAPE_COLS;
      const v = j / CAPE_ROWS;
      capeRest(u, v, p);
      pos.push(p.x, p.y, p.z);
      uv.push(u, 1 - v);
    }
  for (let j = 0; j < CAPE_ROWS; j++)
    for (let i = 0; i < CAPE_COLS; i++) {
      const a = j * (CAPE_COLS + 1) + i;
      const b = a + 1;
      const c = a + CAPE_COLS + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Paint the cape: colour, trim, and the emblem (a pointer in a roundel) on the back. */
export function capeTexture(L: AvatarLook) {
  const W = 128;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const hex = (c: THREE.Color) => '#' + c.getHexString();
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hex(col(L.cape, 1.08)));
  grad.addColorStop(1, hex(col(L.cape, 0.82)));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.06;
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = y % 4 ? '#000' : '#fff';
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;
  g.fillStyle = L.capeTrim;
  g.fillRect(0, 0, 7, H);
  g.fillRect(W - 7, 0, 7, H);
  g.fillRect(0, H - 16, W, 16);
  g.fillStyle = hex(col(L.cape, 0.6));
  g.fillRect(9, 0, 2, H - 18);
  g.fillRect(W - 11, 0, 2, H - 18);
  g.fillRect(9, H - 20, W - 18, 2);
  // emblem: a roundel with a pointer, upper back (mirrored, it's seen from behind)
  const cx = W / 2;
  const cy = 78;
  g.fillStyle = hex(col(L.cape, 0.55));
  g.beginPath();
  g.arc(cx, cy + 2, 27, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = L.capeTrim;
  g.beginPath();
  g.arc(cx, cy, 26, 0, Math.PI * 2);
  g.fill();
  const k = 2.3;
  g.save();
  g.translate(cx + 1, cy - 1);
  g.scale(-1, 1);
  g.beginPath();
  const arrow: [number, number][] = [
    [0, 0],
    [0, 16],
    [4, 12.5],
    [7, 19],
    [9.6, 18],
    [6.6, 11.6],
    [11.5, 11.5],
  ];
  arrow.forEach(([x, y], i) => (i ? g.lineTo((x - 5.2) * k, (y - 10) * k) : g.moveTo((x - 5.2) * k, (y - 10) * k)));
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = L.capeTrim;
  g.fillStyle = '#0c0a09';
  g.fill();
  g.stroke();
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
