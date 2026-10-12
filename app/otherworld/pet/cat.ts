/**
 * Tony's cat as an old-school pet: a chunky, faceted, vertex-coloured model
 * on a small skeleton (a spine in two halves, neck, head, ears, eyes, four
 * two-bone legs with paws, a six-bone tail). Every part is rigidly weighted
 * to one bone, so the whole cat is one skinned mesh and one draw call.
 *
 * A pose describes a silhouette: how high the body sits and how it tilts,
 * where each paw wants to be, which way the head looks, how the tail curls.
 * The rig solves the legs with two-bone IK, keeps the head level when the
 * body pitches, and lays the tail along the floor instead of through it.
 * Frames can be held old-school style (`stepFps`), like the player.
 *
 * Markings follow the real cat (see content/cat.ts): white face, chest,
 * belly and paws; a grey cap over the ears down to just above the eyes; a
 * lopsided smudge down the nose to one side; a grey saddle with white
 * patches; a darker tail; a red collar with a plain heart tag.
 *
 * React-free, so it renders headless too. Local space: faces +z, up is +y,
 * its left is +x. 1 = one tile.
 */
import * as THREE from 'three/webgpu';
import { CAT } from '@/content/cat';
import { mulberry32 } from '../lib/random';

type V3 = [number, number, number];
type V2 = [number, number];

// ── skeleton ─────────────────────────────────────────────────────────────────
export const BONE = {
  root: 0,
  chest: 1,
  hips: 2,
  neck: 3,
  head: 4,
  eyeL: 5,
  eyeR: 6,
  earL: 7,
  earR: 8,
  tongue: 9,
  /** Legs: upper, lower, paw for FL, FR, HL, HR (index 10 + leg * 3). */
  legs: 10,
  /** Tail segments, base to tip. */
  tail: 22,
} as const;
export const TAIL_N = 6;
const BONE_COUNT = BONE.tail + TAIL_N;

/** Spine height when standing. */
const REST_Y = 0.225;
/** Upper and lower leg lengths (front, hind). */
const LEG_LEN: [V2, V2] = [
  [0.1, 0.1],
  [0.098, 0.11],
];
/** Hip / shoulder pivots in the chest (front) and hips (hind) frames. */
const PIVOT: V3[] = [
  [0.052, -0.045, 0.13],
  [-0.052, -0.045, 0.13],
  [0.058, -0.03, -0.13],
  [-0.058, -0.03, -0.13],
];
const NECK: V3 = [0, 0.065, 0.16];
const HEAD: V3 = [0, 0.08, 0.07];
const TAIL_BASE: V3 = [0, 0.05, -0.2];
const TAIL_SEG = 0.064;
/** Head scale: old-school pets are mostly head. */
const HS = 1.2;
/** The face plate: a flat front on the head that the markings are drawn on (head space, unscaled). */
const FACE_Z = 0.078;
const EYE: V3 = [0.035, 0.006, FACE_Z];
const EAR: V3 = [0.056, 0.062, -0.022];
const hs = (v: V3): V3 => [v[0] * HS, v[1] * HS, v[2] * HS];
/** Lowest a tail segment may go (the floor, plus its own radius). */
const TAIL_FLOOR = 0.02;

const legLen = (leg: number) => LEG_LEN[leg < 2 ? 0 : 1];

function buildSkeleton() {
  const b = Array.from({ length: BONE_COUNT }, (_, i) => {
    const bone = new THREE.Bone();
    bone.name = `cat-${i}`;
    return bone;
  });
  const link = (child: number, parent: number, pos: V3) => {
    b[parent].add(b[child]);
    b[child].position.set(...pos);
  };
  b[BONE.root].position.set(0, REST_Y, 0);
  link(BONE.chest, BONE.root, [0, 0, 0]);
  link(BONE.hips, BONE.root, [0, 0, 0]);
  link(BONE.neck, BONE.chest, NECK);
  link(BONE.head, BONE.neck, HEAD);
  link(BONE.eyeL, BONE.head, hs(EYE));
  link(BONE.eyeR, BONE.head, hs([-EYE[0], EYE[1], EYE[2]]));
  link(BONE.earL, BONE.head, hs(EAR));
  link(BONE.earR, BONE.head, hs([-EAR[0], EAR[1], EAR[2]]));
  link(BONE.tongue, BONE.head, hs([0, -0.05, 0.1]));
  for (let leg = 0; leg < 4; leg++) {
    const up = BONE.legs + leg * 3;
    const [l1, l2] = legLen(leg);
    link(up, leg < 2 ? BONE.chest : BONE.hips, PIVOT[leg]);
    link(up + 1, up, [0, -l1, 0]);
    link(up + 2, up + 1, [0, -l2, 0]);
  }
  link(BONE.tail, BONE.hips, TAIL_BASE);
  for (let k = 1; k < TAIL_N; k++) link(BONE.tail + k, BONE.tail + k - 1, [0, 0, -TAIL_SEG]);
  return b;
}

// ── geometry ─────────────────────────────────────────────────────────────────
/** Colour for a triangle from its centroid (in the part's bone space) and normal. */
type Paint = string | ((c: THREE.Vector3, n: THREE.Vector3) => string);
/** A ring of a loft: [z, rx, ry, cy]. */
type Ring = [number, number, number, number];

const colourCache = new Map<string, THREE.Color>();
const colour = (hex: string) => {
  let c = colourCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colourCache.set(hex, c);
  }
  return c;
};

const tA = new THREE.Vector3();
const tN = new THREE.Vector3();
const tCen = new THREE.Vector3();
const tE1 = new THREE.Vector3();
const tE2 = new THREE.Vector3();

/**
 * Collects triangles per bone in bone space, bakes them into model space
 * with the bone's rest matrix, and paints each face (with a little jitter,
 * like the furniture kit, and a touch of shade underneath).
 */
class CatBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private skin: number[] = [];
  private rand = mulberry32(81);
  private bone = 0;
  private M = new THREE.Matrix4();
  tris = 0;

  constructor(private rest: THREE.Matrix4[]) {}

  /** Following primitives belong to `bone`, optionally through a local transform. */
  on(bone: number, local?: THREE.Matrix4) {
    this.bone = bone;
    this.M.copy(this.rest[bone]);
    if (local) this.M.multiply(local);
    return this;
  }

  /** One triangle in the current local space, counter-clockwise from outside. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, paint: Paint, jitter = 0.04) {
    tE1.subVectors(b, a);
    tE2.subVectors(c, a);
    tN.crossVectors(tE1, tE2).normalize();
    tCen.copy(a).add(b).add(c).divideScalar(3);
    const hex = typeof paint === 'string' ? paint : paint(tCen, tN);
    const base = colour(hex);
    const shade = (1 + (this.rand() - 0.5) * 2 * jitter) * (tN.y < -0.55 ? 0.84 : 1);
    for (const v of [a, b, c]) {
      tA.copy(v).applyMatrix4(this.M);
      this.pos.push(tA.x, tA.y, tA.z);
      this.col.push(base.r * shade, base.g * shade, base.b * shade);
      this.skin.push(this.bone);
    }
    this.tris++;
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, paint: Paint, jitter?: number) {
    this.tri(a, b, c, paint, jitter);
    this.tri(a, c, d, paint, jitter);
  }

  /**
   * A loft along +z through rings of `sides` vertices. Ends can be left open,
   * closed flat, or closed to a point.
   */
  loft(rings: Ring[], sides: number, paint: Paint, opts: { phase?: number; start?: 'flat' | V3; end?: 'flat' | V3; jitter?: number } = {}) {
    const phase = opts.phase ?? Math.PI / sides;
    const pts = rings.map(([z, rx, ry, cy]) =>
      Array.from({ length: sides }, (_, s) => {
        const a = phase + (s / sides) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * rx, cy + Math.sin(a) * ry, z);
      })
    );
    for (let k = 0; k < rings.length - 1; k++)
      for (let s = 0; s < sides; s++) {
        const s1 = (s + 1) % sides;
        this.quad(pts[k][s], pts[k][s1], pts[k + 1][s1], pts[k + 1][s], paint, opts.jitter);
      }
    const cap = (ring: THREE.Vector3[], spec: 'flat' | V3, front: boolean) => {
      if (spec === 'flat') {
        for (let s = 1; s < sides - 1; s++) {
          if (front) this.tri(ring[0], ring[s], ring[s + 1], paint, opts.jitter);
          else this.tri(ring[0], ring[s + 1], ring[s], paint, opts.jitter);
        }
        return;
      }
      const tip = new THREE.Vector3(...spec);
      for (let s = 0; s < sides; s++) {
        const s1 = (s + 1) % sides;
        if (front) this.tri(tip, ring[s], ring[s1], paint, opts.jitter);
        else this.tri(tip, ring[s1], ring[s], paint, opts.jitter);
      }
    };
    if (opts.start) cap(pts[0], opts.start, false);
    if (opts.end) cap(pts[pts.length - 1], opts.end, true);
    return this;
  }

  /** A flat polygon facing +z at depth z (convex or not; triangulated). */
  poly(points: V2[], z: number, paint: Paint, back = false) {
    const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of faces) {
      const a = new THREE.Vector3(points[i][0], points[i][1], z);
      let b = new THREE.Vector3(points[j][0], points[j][1], z);
      let c = new THREE.Vector3(points[k][0], points[k][1], z);
      const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
      if (ccw === back) [b, c] = [c, b];
      this.tri(a, b, c, paint, 0);
    }
    return this;
  }

  /** Any three.js primitive, painted per face. */
  geo(g: THREE.BufferGeometry, paint: Paint, local?: THREE.Matrix4) {
    const src = g.index ? g.toNonIndexed() : g;
    if (local) src.applyMatrix4(local);
    const p = src.attributes.position;
    for (let i = 0; i < p.count; i += 3)
      this.tri(new THREE.Vector3().fromBufferAttribute(p, i), new THREE.Vector3().fromBufferAttribute(p, i + 1), new THREE.Vector3().fromBufferAttribute(p, i + 2), paint);
    src.dispose();
    if (src !== g) g.dispose();
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    const n = this.skin.length;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = this.skin[i];
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const mat4 = (pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
/** Lofts run along +z; this turns +z into −y (legs hang from their pivot, front stays +z). */
const DOWN = mat4([0, 0, 0], [Math.PI / 2, 0, 0]);

/** Clip a convex polygon to the half-plane a·x + b·y + c ≥ 0. */
function clip(points: V2[], a: number, b: number, c: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const dp = a * p[0] + b * p[1] + c;
    const dq = a * q[0] + b * q[1] + c;
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const ring2 = (rx: number, ry: number, cy: number, sides: number, phase = Math.PI / sides): V2[] =>
  Array.from({ length: sides }, (_, s) => {
    const a = phase + (s / sides) * Math.PI * 2;
    return [Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** The heart on the tag: plain, no lettering. */
function heart(w: number, cx: number, cy: number): V2[] {
  const pts: V2[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + (x / 32) * w, cy + (y / 32) * w]);
  }
  return pts;
}

// Irregular white patches on the grey saddle: (x, z, radius) in spine space.
const PATCHES: V3[] = [
  [0.05, 0.07, 0.05],
  [-0.075, -0.065, 0.05],
  [0.03, -0.165, 0.035],
];

function bodyPaint(c: THREE.Vector3, n: THREE.Vector3) {
  if (n.y < -0.3) return CAT.white;
  if (c.z > 0.15 && c.y < 0.055) return CAT.white;
  const back = c.y > 0.012 || (c.y > -0.035 && Math.abs(n.x) > 0.55 && c.z < 0.12);
  if (!back) return CAT.white;
  for (const [x, z, r] of PATCHES) if ((c.x - x) ** 2 + (c.z - z) ** 2 < r * r && c.y > -0.02) return CAT.white;
  return CAT.grey;
}

function headPaint(c: THREE.Vector3) {
  if (c.y > 0.022) return CAT.grey;
  if (c.z < -0.035 && c.y > -0.03) return CAT.grey;
  return CAT.white;
}

function buildCatGeometry(bones: THREE.Bone[]) {
  bones[0].updateMatrixWorld(true);
  const rest = bones.map((b) => b.matrixWorld.clone());
  const k = new CatBuilder(rest);

  // body: two lofts overlapping at the waist, so the spine can bend
  k.on(BONE.chest).loft(
    [
      [-0.07, 0.086, 0.088, 0],
      [0.0, 0.097, 0.1, 0],
      [0.08, 0.1, 0.101, 0.004],
      [0.15, 0.088, 0.096, 0.008],
      [0.2, 0.06, 0.072, 0.006],
    ],
    8,
    bodyPaint,
    { end: [0, 0.004, 0.222] }
  );
  k.on(BONE.hips).loft(
    [
      [-0.205, 0.066, 0.07, 0.01],
      [-0.16, 0.094, 0.094, 0.004],
      [-0.08, 0.1, 0.1, 0],
      [0.0, 0.097, 0.1, 0],
      [0.07, 0.086, 0.088, 0],
    ],
    8,
    bodyPaint,
    { start: [0, 0.012, -0.232] }
  );

  // head: a chunky loft with a bevelled face plate the markings are drawn on
  const S = mat4([0, 0, 0], [0, 0, 0], [HS, HS, HS]);
  const plate = ring2(0.074, 0.056, -0.006, 8);
  k.on(BONE.head, S).loft(
    [
      [-0.085, 0.06, 0.052, 0.014],
      [-0.045, 0.098, 0.078, 0.008],
      [0.012, 0.108, 0.08, -0.002],
      [0.062, 0.094, 0.07, -0.007],
      [FACE_Z, 0.074, 0.056, -0.006],
    ],
    8,
    headPaint,
    { start: [0, 0.014, -0.1] }
  );
  k.poly(plate, FACE_Z, CAT.white);
  // the grey cap comes down the forehead to just above the eyes
  const CAP_Y = 0.028;
  k.poly(clip(plate, 0.06, 1, -CAP_Y), FACE_Z + 0.0012, CAT.grey);
  // the smudge: from the cap down the nose bridge, off to its left, lopsided
  k.poly(
    [
      [-0.003, 0.032],
      [0.022, 0.032],
      [0.024, 0.016],
      [0.02, 0.0],
      [0.017, -0.012],
      [0.006, -0.016],
      [0.004, -0.002],
      [0.0, 0.016],
    ],
    FACE_Z + 0.0018,
    CAT.smudge
  );
  // closed-eye lines under the irises (they show when the eyes shut)
  for (const s of [1, -1]) {
    const x = s * EYE[0];
    k.poly(
      [
        [x - 0.019, EYE[1] - 0.004],
        [x, EYE[1] + 0.005],
        [x + 0.019, EYE[1] - 0.004],
        [x + 0.017, EYE[1] - 0.009],
        [x, EYE[1] - 0.001],
        [x - 0.017, EYE[1] - 0.009],
      ],
      FACE_Z + 0.0015,
      CAT.pupil
    );
  }
  // muzzle, nose, and the smudge carrying on beside the nose
  k.loft(
    [
      [FACE_Z - 0.02, 0.046, 0.03, -0.031],
      [FACE_Z + 0.02, 0.04, 0.025, -0.033],
    ],
    6,
    (c, n) => (n.y > 0.3 && c.x > 0.004 ? CAT.smudge : CAT.white),
    { phase: 0, end: 'flat' }
  );
  k.poly(
    [
      [-0.015, -0.0115],
      [0.015, -0.0115],
      [0.003, -0.025],
      [-0.003, -0.025],
    ],
    FACE_Z + 0.0212,
    CAT.nose
  );

  // eyes: iris, slit pupil, a glint (blink by scaling the bone)
  for (const [bone, s] of [
    [BONE.eyeL, 1],
    [BONE.eyeR, -1],
  ] as const) {
    k.on(bone, mat4([0, 0, 0], [0, 0, s * 0.16], [HS, HS, HS]));
    k.poly(ring2(0.019, 0.0155, 0, 6, 0), 0.0028, CAT.eyes);
    k.poly(
      [
        [0, 0.0145],
        [0.0042, 0],
        [0, -0.0145],
        [-0.0042, 0],
      ],
      0.0034,
      CAT.pupil
    );
    k.poly(
      [
        [s * 0.0075 - 0.0026, 0.005],
        [s * 0.0075 + 0.0026, 0.005],
        [s * 0.0075 + 0.0026, 0.0098],
        [s * 0.0075 - 0.0026, 0.0098],
      ],
      0.004,
      CAT.white
    );
  }

  // ears: grey, dark tips, pink inside, tilted out
  for (const [bone, s] of [
    [BONE.earL, 1],
    [BONE.earR, -1],
  ] as const) {
    k.on(bone, mat4([0, 0, 0], [0.12, 0, -s * 0.26], [HS, HS, HS]));
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const B = [V(-0.036, 0, 0.02), V(0.036, 0, 0.02), V(0.036, 0, -0.02), V(-0.036, 0, -0.02)];
    const M = [V(-0.017, 0.05, 0.004), V(0.017, 0.05, 0.004), V(0.017, 0.05, -0.013), V(-0.017, 0.05, -0.013)];
    const tip = V(0, 0.088, -0.01);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      k.quad(B[i], B[j], M[j], M[i], CAT.grey);
      k.tri(M[i], M[j], tip, CAT.tail);
    }
    const front = (y: number) => 0.02 - 0.33 * y + 0.0035;
    k.tri(V(-0.022, 0.007, front(0.007)), V(0.022, 0.007, front(0.007)), V(0, 0.066, front(0.066) - 0.002), CAT.innerEar, 0);
  }

  // tongue (hidden unless grooming)
  k.on(BONE.tongue, S).geo(new THREE.BoxGeometry(0.022, 0.006, 0.03).translate(0, 0, 0.015), CAT.tongue);

  // collar around the neck, the heart tag hanging under the chin
  const tiltCollar = mat4([0, -0.004, 0.006], [-0.95, 0, 0]);
  k.on(BONE.neck, tiltCollar).loft(
    [
      [-0.012, 0.083, 0.08, 0],
      [0.012, 0.083, 0.08, 0],
    ],
    10,
    CAT.collar,
    { jitter: 0.02 }
  );
  k.on(BONE.neck, mat4([0, -0.06, 0.085], [0.25, 0, 0]));
  k.poly(heart(0.05, 0, 0), 0.003, CAT.tag);
  k.poly(heart(0.05, 0, 0), -0.003, CAT.tag, true);
  k.geo(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 4).translate(0, 0.026, 0), CAT.collar);

  // legs: hexagonal, white socks; the hind thighs carry the grey down a little
  for (let leg = 0; leg < 4; leg++) {
    const front = leg < 2;
    const up = BONE.legs + leg * 3;
    const [l1, l2] = legLen(leg);
    const upper: Ring[] = front
      ? [
          [-0.025, 0.04, 0.044, 0],
          [l1 + 0.006, 0.031, 0.032, 0],
        ]
      : [
          [-0.035, 0.05, 0.066, 0.008],
          [0.035, 0.045, 0.056, 0.0],
          [l1 + 0.006, 0.03, 0.032, 0],
        ];
    k.on(up, DOWN).loft(upper, 6, front ? CAT.white : (c) => (c.z < 0.05 ? CAT.grey : CAT.white), { phase: 0 });
    k.on(up + 1).geo(new THREE.OctahedronGeometry(front ? 0.031 : 0.03, 0), CAT.white);
    k.on(up + 1, DOWN).loft(
      [
        [0, 0.03, 0.031, 0],
        [l2 - 0.014, 0.026, 0.027, 0],
      ],
      6,
      CAT.white,
      { phase: 0 }
    );
    k.on(up + 2).geo(new THREE.BoxGeometry(0.058, 0.032, 0.072).translate(0, 0.016, 0.014), CAT.white);
  }

  // tail: darker grey, tapering, a point at the tip
  for (let i = 0; i < TAIL_N; i++) {
    const r0 = 0.04 - i * 0.0036;
    const r1 = r0 - 0.0036;
    const last = i === TAIL_N - 1;
    k.on(BONE.tail + i).loft(
      [
        [-(TAIL_SEG + 0.012), r1, r1, 0],
        [0.012, r0, r0, 0],
      ],
      6,
      i === 0 ? CAT.greyDark : CAT.tail,
      { phase: 0, start: last ? [0, 0, -(TAIL_SEG + 0.04)] : undefined }
    );
  }

  return { geometry: k.build(), tris: k.tris };
}

// ── poses ────────────────────────────────────────────────────────────────────
export type CatPose = 'stand' | 'sit' | 'loaf' | 'groom' | 'stretch' | 'sleep' | 'petted' | 'purr' | 'hop';

/** Everything a pose says about the silhouette. Blendable, number by number. */
export interface CatFrame {
  /** Spine height, forward shift, pitch (nose up +), roll (+ = onto its right side). */
  y: number;
  z: number;
  pitch: number;
  roll: number;
  /** C-curl: the chest turns left by this, the hips turn the other way. */
  bend: number;
  /** Head pitch (up +), yaw (left +, relative to the chest), roll; pitch and roll are level with the floor. */
  head: V3;
  /** Each paw (FL, FR, HL, HR): [forward of its pivot, height above the floor]. */
  feet: [V2, V2, V2, V2];
  /** Extra paw curl (tucked under, raised to lick). */
  paws: [number, number, number, number];
  /** Tail: base elevation (up +), elevation added per segment, base yaw, yaw added per segment (wraps to its left), swish amplitude. */
  tail: [number, number, number, number, number];
  /** 0 shut … 1 open. */
  eyes: number;
  /** 0 up … 1 flat back. */
  ears: number;
  tongue: number;
  breathe: number;
}

const newFrame = (): CatFrame => ({
  y: REST_Y,
  z: 0,
  pitch: 0,
  roll: 0,
  bend: 0,
  head: [0, 0, 0],
  feet: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  paws: [0, 0, 0, 0],
  tail: [0.5, 0.1, 0, 0, 0.2],
  eyes: 1,
  ears: 0,
  tongue: 0,
  breathe: 0.3,
});

function blend(cur: CatFrame, to: CatFrame, k: number) {
  const l = (a: number, b: number) => a + (b - a) * k;
  cur.y = l(cur.y, to.y);
  cur.z = l(cur.z, to.z);
  cur.pitch = l(cur.pitch, to.pitch);
  cur.roll = l(cur.roll, to.roll);
  cur.bend = l(cur.bend, to.bend);
  for (let i = 0; i < 3; i++) cur.head[i] = l(cur.head[i], to.head[i]);
  for (let i = 0; i < 4; i++) {
    cur.feet[i][0] = l(cur.feet[i][0], to.feet[i][0]);
    cur.feet[i][1] = l(cur.feet[i][1], to.feet[i][1]);
    cur.paws[i] = l(cur.paws[i], to.paws[i]);
  }
  for (let i = 0; i < 5; i++) cur.tail[i] = l(cur.tail[i], to.tail[i]);
  cur.eyes = l(cur.eyes, to.eyes);
  cur.ears = l(cur.ears, to.ears);
  cur.tongue = l(cur.tongue, to.tongue);
  cur.breathe = l(cur.breathe, to.breathe);
}

const setFeet = (f: CatFrame, fl: V2, fr: V2, hl: V2, hr: V2) => {
  f.feet = [
    [...fl],
    [...fr],
    [...hl],
    [...hr],
  ];
};
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function stand(f: CatFrame) {
  Object.assign(f, newFrame());
  f.head = [0.06, 0, 0];
  setFeet(f, [0.005, 0], [0.005, 0], [-0.01, 0], [-0.01, 0]);
  f.tail = [0.5, 0.2, 0, 0, 0.22];
}

function sit(f: CatFrame) {
  stand(f);
  f.y = 0.165;
  f.z = -0.03;
  f.pitch = 0.55;
  f.head = [0.04, 0, 0];
  setFeet(f, [0.02, 0], [0.02, 0], [0.12, 0], [0.12, 0]);
  // tail down to the floor, then round the front paws
  f.tail = [-1.1, 0.0, 0.3, 0.42, 0.05];
}

function loaf(f: CatFrame) {
  stand(f);
  f.y = 0.1;
  f.pitch = 0.02;
  f.head = [0.02, 0, 0];
  setFeet(f, [-0.02, 0.0], [-0.02, 0.0], [0.03, 0], [0.03, 0]);
  f.paws = [1.3, 1.3, 0.4, 0.4];
  f.tail = [-0.6, 0.0, 0.45, 0.36, 0.03];
  f.eyes = 0.5;
  f.breathe = 0.7;
}

function groom(f: CatFrame, t: number) {
  sit(f);
  const lick = Math.sin(t * 8.5);
  const up = smooth(t / 0.35);
  // left forepaw up to the mouth, head down to meet it
  f.feet[0] = [0.02 + 0.09 * up, 0.24 * up + lick * 0.006 * up];
  f.paws[0] = -1.1 * up;
  f.head = [-0.5 * up + lick * 0.07 * up, 0.22 * up, 0.18 * up];
  f.tongue = up * (lick > 0.1 ? 1 : 0.15);
  f.eyes = 1 - 0.75 * up;
  f.tail[4] = 0.08;
}

function stretch(f: CatFrame, t: number) {
  stand(f);
  // a long bow: forelegs out in front, rump up, tail up, then back
  const k = smooth(t / 0.6) * (1 - smooth((t - 1.9) / 0.6));
  f.y = REST_Y - 0.05 * k;
  f.z = 0.05 * k;
  f.pitch = -0.36 * k;
  f.head = [0.06 + 0.3 * k, 0, 0];
  setFeet(f, [0.005 + 0.19 * k, 0], [0.005 + 0.19 * k, 0], [-0.01 - 0.02 * k, 0], [-0.01 - 0.02 * k, 0]);
  f.tail = [0.5 + 0.7 * k, 0.2 - 0.16 * k, 0, 0, 0.22 * (1 - k)];
  f.eyes = 1 - 0.8 * k;
  f.ears = 0.35 * k;
  f.tongue = 0.8 * smooth((t - 0.7) / 0.25) * (1 - smooth((t - 1.6) / 0.25));
}

function sleep(f: CatFrame) {
  stand(f);
  // curled up: a C of a cat, nose tucked toward the tail, tail round the front
  f.y = 0.09;
  f.pitch = -0.1;
  f.roll = 0.22;
  f.bend = 0.95;
  f.head = [-0.25, 1.1, 0.35];
  setFeet(f, [0.02, 0.0], [0.02, 0.0], [0.06, 0], [0.06, 0]);
  f.paws = [1.2, 1.2, 0.5, 0.5];
  f.tail = [-0.7, 0.0, -0.2, -0.62, 0];
  f.eyes = 0;
  f.ears = 0.15;
  f.breathe = 1;
}

function petted(f: CatFrame, t: number) {
  sit(f);
  // leans into the hand, eyes shut, ears soft
  f.head = [0.24 + Math.sin(t * 3) * 0.05, 0.1, 0.2 + Math.sin(t * 1.5) * 0.08];
  f.eyes = 0.08;
  f.ears = 0.2;
  f.tail = [-0.8, 0.0, 0.1, 0.3, 0.18];
  f.breathe = 0.6;
}

function purr(f: CatFrame, t: number) {
  loaf(f);
  f.head = [0.18 + Math.sin(t * 3) * 0.04, 0.05, 0.16];
  f.eyes = 0.08;
  f.ears = 0.15;
}

function hop(f: CatFrame, t: number) {
  stand(f);
  // the hop takes ~0.45 s: crouch, stretch out, land
  const u = Math.min(1, t / 0.45);
  f.y = REST_Y - 0.05 * Math.sin(Math.PI * Math.min(1, u * 2.2));
  f.pitch = 0.3 * Math.sin(Math.PI * u) - 0.1 * u;
  setFeet(f, [0.06, 0.05 * Math.sin(Math.PI * u)], [0.07, 0.05 * Math.sin(Math.PI * u)], [-0.07, 0.02], [-0.07, 0.02]);
  f.tail = [0.7, 0.05, 0, 0, 0];
}

const POSES: Record<CatPose, (f: CatFrame, t: number) => void> = { stand, sit, loaf, groom, stretch, sleep, petted, purr, hop };

/** Fill `f` with pose `kind`, `t` seconds in. */
export function catPoseFrame(f: CatFrame, kind: CatPose, t: number) {
  POSES[kind](f, t);
}

/** Lateral-sequence walk: left hind, left fore, right hind, right fore. */
const GAIT_OFFSET = [Math.PI / 2, (3 * Math.PI) / 2, 0, Math.PI];

// ── the rig ──────────────────────────────────────────────────────────────────
export interface CatInput {
  dt: number;
  time: number;
  kind: CatPose;
  /** Seconds since the pose started. */
  t: number;
  /** 0 idle, 1 walk, 1.5 trot (damped by the caller). */
  speed: number;
  /** Gait phase in radians; one cycle per CAT_STRIDE tiles (see ./brain). */
  phase: number;
  /** Something to look at, in the cat's own space (x left, z forward). */
  look?: { x: number; y: number; z: number } | null;
  /** Hold each frame for 1/fps seconds like the game without animation smoothing. 0 = smooth. */
  stepFps?: number;
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qRoot = new THREE.Quaternion();
const qChest = new THREE.Quaternion();
const qHips = new THREE.Quaternion();
const qNeck = new THREE.Quaternion();
const qHead = new THREE.Quaternion();
const qPrev = new THREE.Quaternion();
const qSeg = new THREE.Quaternion();
const eul = new THREE.Euler();
const vRoot = new THREE.Vector3();
const vPivot = new THREE.Vector3();
const vFwd = new THREE.Vector3();
const vT = new THREE.Vector3();
const vP = new THREE.Vector3();
const vD = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);

export class CatModel {
  /** Position and yaw this; scale it for size. */
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly tris: number;
  readonly frame = newFrame();
  private target = newFrame();
  private material = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  private first = true;
  private stepAcc = 0;
  private blink = 0;
  private nextBlink = 2;
  private flickT = 9;
  private flickSide = 1;
  private twitchT = 9;
  private twitchSide = 1;

  constructor() {
    this.group.name = 'pet-cat';
    this.bones = buildSkeleton();
    const { geometry, tris } = buildCatGeometry(this.bones);
    this.tris = tris;
    this.mesh = new THREE.SkinnedMesh(geometry, this.material);
    this.mesh.add(this.bones[BONE.root]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  /** A quick flick of the tail tip. */
  flick() {
    this.flickT = 0;
    this.flickSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** An ear twitch. */
  twitch() {
    this.twitchT = 0;
    this.twitchSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** World position of a point on the head (for speech, z's, hearts). */
  headPoint(out = new THREE.Vector3(), up = 0.1) {
    return this.bones[BONE.head].localToWorld(out.set(0, up, 0.02));
  }

  update(o: CatInput) {
    let dt = o.dt;
    let k = this.first ? 1 : 1 - Math.exp(-8 * dt);
    if (o.stepFps && !this.first) {
      // old-school: hold the frame, then jump toward the next one
      this.stepAcc += o.dt;
      const step = 1 / o.stepFps;
      if (this.stepAcc < step) return;
      this.stepAcc %= step;
      dt = step;
      k = 1 - Math.exp(-8 * step);
    }
    this.first = false;

    const f = this.target;
    catPoseFrame(f, o.kind, o.t);
    // idle heads follow something interesting
    if (o.look && (o.kind === 'stand' || o.kind === 'sit' || o.kind === 'loaf') && o.speed < 0.3) {
      f.head[1] = THREE.MathUtils.clamp(Math.atan2(o.look.x, o.look.z), -0.9, 0.9);
      f.head[0] += THREE.MathUtils.clamp(Math.atan2(o.look.y - 0.4, Math.hypot(o.look.x, o.look.z)) * 0.6, -0.3, 0.5);
    }
    blend(this.frame, f, k);

    // blinks, flicks, twitches
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 1;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    this.flickT += dt;
    this.twitchT += dt;
    this.apply(o);
  }

  private apply(o: CatInput) {
    const c = this.frame;
    const b = this.bones;
    const walk = Math.min(1, o.speed);
    const trot = Math.max(0, o.speed - 1);
    const breath = Math.sin(o.time * 2.3) * c.breathe;

    // root and spine
    vRoot.set(0, c.y + Math.abs(Math.sin(o.phase)) * 0.008 * walk + breath * 0.003, c.z);
    qRoot.setFromEuler(eul.set(-c.pitch, 0, c.roll, 'YXZ'));
    b[BONE.root].position.copy(vRoot);
    b[BONE.root].quaternion.copy(qRoot);
    b[BONE.chest].quaternion.setFromEuler(eul.set(0, c.bend, 0));
    b[BONE.hips].quaternion.setFromEuler(eul.set(0, -c.bend, 0));
    b[BONE.chest].scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1);
    qChest.copy(qRoot).multiply(b[BONE.chest].quaternion);
    qHips.copy(qRoot).multiply(b[BONE.hips].quaternion);

    // legs: aim each paw at its target with two-bone IK in the leg's plane
    // (a quarter of CAT_STRIDE, so planted paws keep pace with the ground)
    const stride = 0.125 + trot * 0.05;
    for (let leg = 0; leg < 4; leg++) {
      const qP = leg < 2 ? qChest : qHips;
      const [l1, l2] = legLen(leg);
      let [dz, fy] = c.feet[leg];
      if (walk > 0.01) {
        const th = o.phase + GAIT_OFFSET[leg];
        dz += Math.cos(th) * stride * walk;
        fy += Math.max(0, -Math.sin(th)) * 0.055 * walk;
      }
      vPivot.set(...PIVOT[leg]).applyQuaternion(qP).add(vRoot);
      vFwd.set(0, 0, 1).applyQuaternion(qP).setY(0);
      if (vFwd.lengthSq() < 1e-6) vFwd.set(0, 0, 1);
      vFwd.normalize();
      vT.set(vPivot.x + vFwd.x * dz, fy, vPivot.z + vFwd.z * dz).sub(vRoot).applyQuaternion(qa.copy(qP).invert());
      const ry = vT.y - PIVOT[leg][1];
      const rz = vT.z - PIVOT[leg][2];
      const dist = THREE.MathUtils.clamp(Math.hypot(ry, rz), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
      const len = Math.max(1e-5, Math.hypot(ry, rz));
      const dy = ry / len;
      const dzn = rz / len;
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      // the joint bends backward (elbows and hocks point behind)
      const jy = dy * a - dzn * h;
      const jz = dzn * a + dy * h;
      const alpha = Math.atan2(-jz, -jy);
      const beta = Math.atan2(-(dzn * dist - jz), -(dy * dist - jy)) - alpha;
      const up = BONE.legs + leg * 3;
      b[up].quaternion.setFromAxisAngle(X, alpha);
      b[up + 1].quaternion.setFromAxisAngle(X, beta);
      b[up + 2].quaternion.setFromAxisAngle(X, c.pitch - alpha - beta + c.paws[leg]);
    }

    // head stays level with the floor; the neck takes half the turn
    qHead.setFromEuler(eul.set(-c.head[0] - Math.abs(Math.sin(o.phase)) * 0.04 * walk, c.bend + c.head[1], c.head[2], 'YXZ'));
    qNeck.copy(qChest).slerp(qHead, 0.45);
    b[BONE.neck].quaternion.copy(qa.copy(qChest).invert().multiply(qNeck));
    b[BONE.head].quaternion.copy(qa.copy(qNeck).invert().multiply(qHead));

    const eyes = Math.max(0.07, c.eyes * (1 - this.blink * (c.eyes > 0.4 ? 1 : 0)));
    b[BONE.eyeL].scale.set(1, eyes, 1);
    b[BONE.eyeR].scale.set(1, eyes, 1);
    const tw = this.twitchT < 0.35 ? Math.sin((this.twitchT / 0.35) * Math.PI) * 0.5 : 0;
    b[BONE.earL].rotation.set(-0.55 * c.ears - (this.twitchSide > 0 ? tw : 0), 0, 0.45 * c.ears);
    b[BONE.earR].rotation.set(-0.55 * c.ears - (this.twitchSide < 0 ? tw : 0), 0, -0.45 * c.ears);
    b[BONE.tongue].scale.setScalar(Math.max(0.001, c.tongue));

    // tail: absolute directions, laid along the floor where it reaches it
    const [elev, curl, yaw0, wrap, swish] = c.tail;
    const lift = walk * 0.75;
    vP.set(...TAIL_BASE).applyQuaternion(qHips).add(vRoot);
    qPrev.copy(qHips);
    const flick = this.flickT < 0.55 ? Math.sin(this.flickT * 26) * Math.exp(-this.flickT * 6) * 0.7 * this.flickSide : 0;
    for (let i = 0; i < TAIL_N; i++) {
      const u = i / (TAIL_N - 1);
      const sw = Math.sin(o.time * 1.7 - i * 0.6) * swish * (0.35 + u) + Math.sin(o.phase * 0.5 - i * 0.5) * 0.12 * walk * u;
      const psi = -c.bend + yaw0 + wrap * i + sw + flick * u * u;
      let eps = elev + lift + curl * i * (0.4 + u) + walk * 0.06 * i;
      vD.set(0, 0, -1).applyQuaternion(qSeg.setFromEuler(eul.set(eps, psi, 0, 'YXZ')));
      if (vP.y + vD.y * TAIL_SEG < TAIL_FLOOR) {
        eps = Math.asin(THREE.MathUtils.clamp((TAIL_FLOOR - vP.y) / TAIL_SEG, -1, 1));
        qSeg.setFromEuler(eul.set(eps, psi, 0, 'YXZ'));
        vD.set(0, 0, -1).applyQuaternion(qSeg);
      }
      b[BONE.tail + i].quaternion.copy(qb.copy(qPrev).invert().multiply(qSeg));
      qPrev.copy(qSeg);
      vP.addScaledVector(vD, TAIL_SEG);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
