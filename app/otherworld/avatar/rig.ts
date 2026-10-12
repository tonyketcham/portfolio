/**
 * Toe Knee, rigged: a cursor-headed designer in a hoodie, drawn with the pen
 * tool. Limbs are strokes, elbows and knees are anchor points, the hands are
 * cartoon gloves and the sneakers have toes. Knees and toes included.
 *
 * Fully procedural and React-free (it renders headless too). Each frame a
 * pose (./poses) gives targets for the pelvis, torso, head, hands and feet;
 * those are damped toward, the walk cycle is layered on top, and two-bone IK
 * places the elbows and knees. Every limb is a separate low-poly mesh, which
 * is about twenty draw calls: fine for a character or two.
 */
import * as THREE from 'three/webgpu';
import { Kit } from '../house/kit';
import { DIM, gait, newFrame, poseFrame, type PoseFrame, type PoseKind, type PropId, type V3 } from './poses';

export interface AvatarLook {
  head: string;
  outline: string;
  hoodie: string;
  pants: string;
  gloves: string;
  shoes: string;
  joints: string;
}

export const TOE_KNEE: AvatarLook = {
  head: '#09090b',
  outline: '#fafafa',
  hoodie: '#3b82f6',
  pants: '#27272a',
  gloves: '#fafafa',
  shoes: '#f4f4f5',
  joints: '#fafafa',
};

// ── geometry ─────────────────────────────────────────────────────────────────
// The classic pointer (x right, y down), 11.5 × 19 units.
const ARROW: [number, number][] = [
  [0, 0],
  [0, 16],
  [4, 12.5],
  [7, 19],
  [9.6, 18],
  [6.6, 11.6],
  [11.5, 11.5],
];
const HK = 0.027;
/** Where the neck meets the arrow, in arrow units. */
const NECK_AT: [number, number] = [4.2, 14.2];
const arrowLocal = (x: number, y: number) => new THREE.Vector2((x - NECK_AT[0]) * HK, (NECK_AT[1] - y) * HK);
const HEAD_DEPTH = 0.17;

function headGeometry(grow = 0) {
  const pts = ARROW.map(([x, y]) => arrowLocal(x, y));
  if (grow) {
    // push the outline out from the arrow's centroid for the white rim
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(pts.length);
    for (const p of pts) p.sub(c).multiplyScalar(1 + grow).add(c);
  }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: HEAD_DEPTH + grow * 0.25,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.016 + grow * 0.02,
    bevelSegments: 1,
  });
  geo.translate(0, 0.05, -(HEAD_DEPTH + grow * 0.25) / 2);
  geo.computeVertexNormals();
  return geo;
}

function torsoGeometry() {
  const k = new Kit(7);
  // the hoodie: a soft trapezoid, shoulders a touch wider than the hem
  k.extrude(
    [
      [-0.135, -0.07],
      [0.135, -0.07],
      [0.152, 0.18],
      [0.148, 0.31],
      [0.108, 0.385],
      [-0.108, 0.385],
      [-0.148, 0.31],
      [-0.152, 0.18],
    ],
    0.19,
    '#ffffff',
    [0, 0, 0],
    { bevel: 0.035, jitter: 0.025 }
  );
  k.box(0.31, 0.045, 0.27, '#d7d7d7', [0, -0.1, 0], { jitter: 0.02 }); // ribbed hem
  k.box(0.19, 0.085, 0.03, '#c9c9c9', [0, 0.0, 0.125], { jitter: 0.02 }); // kangaroo pocket
  k.box(0.012, 0.085, 0.032, '#b5b5b5', [0, 0.0, 0.127], { jitter: 0 }); // pocket seam
  // the hood, folded down behind the neck
  k.torus(0.095, 0.045, '#e8e8e8', [0, 0.39, -0.04], 6, 10, Math.PI, { rot: [-Math.PI / 2 - 0.35, 0, 0] });
  return k.build(false)!;
}

function detailGeometry() {
  const k = new Kit(9);
  // drawstrings with aglets (anchor points, naturally)
  for (const sx of [-1, 1]) {
    k.cyl(0.009, 0.009, 0.13, '#fafafa', [sx * 0.036, 0.24, 0.135], 5, { rot: [0.12, 0, sx * 0.08] });
    k.box(0.022, 0.022, 0.022, '#fafafa', [sx * 0.044, 0.225, 0.142], { jitter: 0 });
  }
  return k.build(false)!;
}

function gloveGeometry(side: number) {
  const k = new Kit(11);
  k.push([0, 0.05, 0], [0, 0, 0], [1, 1.12, 0.82]);
  k.sphere(0.058, '#ffffff', [0, 0, 0], 8, 6, { jitter: 0.03 });
  k.pop();
  k.sphere(0.026, '#ffffff', [side * 0.048, 0.035, 0.022], 6, 4, { jitter: 0.03 }); // thumb
  k.torus(0.04, 0.017, '#e4e4e7', [0, 0.004, 0], 5, 10, Math.PI * 2, { rot: [Math.PI / 2, 0, 0], jitter: 0.02 }); // cuff
  return k.build(false)!;
}

function shoeGeometry() {
  const k = new Kit(13);
  k.box(0.118, 0.026, 0.215, '#3f3f46', [0, 0, 0.035], { jitter: 0.02 }); // sole
  k.box(0.108, 0.07, 0.19, '#ffffff', [0, 0.022, 0.03], { jitter: 0.03 });
  k.box(0.07, 0.014, 0.08, '#3b82f6', [0, 0.09, 0.0], { jitter: 0 }); // laces
  for (const tx of [-0.033, 0, 0.033]) k.sphere(0.022, '#ffffff', [tx, 0.052, 0.128], 6, 4, { jitter: 0.03 }); // toes
  return k.build(false)!;
}

function propGeometry(id: PropId) {
  const k = new Kit(17);
  switch (id) {
    case 'hammer':
      k.cyl(0.018, 0.022, 0.32, '#b07a45', [0, -0.07, 0], 6);
      k.box(0.075, 0.075, 0.17, '#52525b', [0, 0.22, 0.03]);
      k.box(0.078, 0.078, 0.025, '#d4d4d8', [0, 0.22, 0.115], { jitter: 0 });
      k.box(0.02, 0.06, 0.06, '#d4d4d8', [0, 0.23, -0.07], { rot: [0.5, 0, 0], jitter: 0 }); // claw
      break;
    case 'saw':
      k.box(0.035, 0.085, 0.07, '#9a6b3c', [0, -0.045, 0]);
      k.box(0.008, 0.075, 0.3, '#9aa1ab', [0, -0.05, 0.18], { jitter: 0.01 });
      for (let i = 0; i < 9; i++) k.box(0.009, 0.014, 0.014, '#71717a', [0, -0.062, 0.05 + i * 0.03], { rot: [0.78, 0, 0], jitter: 0 });
      break;
    case 'book':
      for (const sx of [-1, 1]) {
        k.box(0.1, 0.012, 0.14, '#b91c1c', [sx * 0.05, 0, 0], { rot: [0, 0, sx * -0.22] });
        k.box(0.09, 0.016, 0.125, '#f2ead8', [sx * 0.046, 0.012, 0], { rot: [0, 0, sx * -0.18], jitter: 0.01 });
      }
      break;
    case 'cup':
      k.cyl(0.04, 0.034, 0.075, '#fafafa', [0, -0.02, 0.04], 8);
      k.cyl(0.0405, 0.04, 0.018, '#3b82f6', [0, 0.02, 0.04], 8, { jitter: 0 });
      k.torus(0.022, 0.007, '#fafafa', [0.04, 0.02, 0.04], 4, 8, Math.PI * 2, { rot: [0, Math.PI / 2, 0] });
      break;
  }
  return k.build(false)!;
}

// ── maths ────────────────────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tDir = new THREE.Vector3();
const tPerp = new THREE.Vector3();
const tPole = new THREE.Vector3();
const tE = new THREE.Euler();
const tQ = new THREE.Quaternion();

/** Two-bone IK: from `a` toward `target`, bending toward `pole`. */
function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  tDir.subVectors(target, a);
  const d = THREE.MathUtils.clamp(tDir.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
  tDir.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  tPerp.copy(pole).addScaledVector(tDir, -pole.dot(tDir));
  if (tPerp.lengthSq() < 1e-6) tPerp.set(0, 0, 1).addScaledVector(tDir, -tDir.z);
  tPerp.normalize();
  mid.copy(a).addScaledVector(tDir, x).addScaledVector(tPerp, h);
  end.copy(a).addScaledVector(tDir, d);
}

function placeBone(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  tDir.subVectors(b, a);
  const len = tDir.length();
  mesh.position.copy(a).addScaledVector(tDir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, tDir.normalize());
  mesh.scale.set(1, Math.max(1e-3, len), 1);
}

const v = (a: V3, out = new THREE.Vector3()) => out.set(a[0], a[1], a[2]);

function blend(cur: PoseFrame, to: PoseFrame, k: number) {
  const lv = (a: V3, b: V3) => {
    a[0] += (b[0] - a[0]) * k;
    a[1] += (b[1] - a[1]) * k;
    a[2] += (b[2] - a[2]) * k;
  };
  lv(cur.pelvis, to.pelvis);
  cur.lean += (to.lean - cur.lean) * k;
  cur.twist += (to.twist - cur.twist) * k;
  cur.roll += (to.roll - cur.roll) * k;
  lv(cur.head, to.head);
  for (let i = 0; i < 2; i++) {
    lv(cur.hands[i], to.hands[i]);
    lv(cur.feet[i], to.feet[i]);
    lv(cur.knees[i], to.knees[i]);
    lv(cur.elbows[i], to.elbows[i]);
    cur.toes[i] += (to.toes[i] - cur.toes[i]) * k;
  }
  lv(cur.propRot, to.propRot);
  cur.squint += (to.squint - cur.squint) * k;
  cur.prop = to.prop;
}

// ── the avatar ───────────────────────────────────────────────────────────────
interface Limb {
  a: THREE.Mesh;
  b: THREE.Mesh;
  joint: THREE.Mesh;
  end: THREE.Object3D;
}

export interface AvatarInput {
  dt: number;
  time: number;
  kind: PoseKind;
  /** Seconds since the pose started. */
  t: number;
  /** 0 idle, 1 walk, 2 run (damped by the caller). */
  speed: number;
  phase: number;
  bounce?: number;
  /** 0..1 eyelid closure. */
  blink: number;
  /** Look target in the avatar's local space (head and pupils follow). */
  look?: THREE.Vector3 | null;
  /** Landing squash, 0..1. */
  squash?: number;
}

export class Avatar {
  /** Position and yaw this; everything else is local. */
  readonly group = new THREE.Group();
  /** Scaled for squash & stretch. */
  readonly body = new THREE.Group();
  readonly mats: Record<keyof AvatarLook | 'detail' | 'eye' | 'pupil', THREE.Material & { color: THREE.Color }>;
  readonly frame = newFrame();
  private target = newFrame();
  private first = true;
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private shoes: THREE.Mesh[] = [];
  private props = new Map<PropId, THREE.Mesh>();
  private pupils: THREE.Mesh[] = [];
  private lids: THREE.Mesh[] = [];
  private pelvis = new THREE.Vector3();
  private torsoQ = new THREE.Quaternion();
  private hipQ = new THREE.Quaternion();
  private geos: THREE.BufferGeometry[] = [];

  constructor(look: AvatarLook = TOE_KNEE) {
    const lambert = (c: string, vc = false) => new THREE.MeshLambertNodeMaterial({ color: c, vertexColors: vc, flatShading: true });
    this.mats = {
      head: lambert(look.head),
      outline: new THREE.MeshBasicNodeMaterial({ color: look.outline, side: THREE.BackSide }),
      hoodie: lambert(look.hoodie, true),
      pants: lambert(look.pants),
      gloves: lambert(look.gloves, true),
      shoes: lambert(look.shoes, true),
      joints: lambert(look.joints),
      detail: lambert('#ffffff', true),
      eye: new THREE.MeshBasicNodeMaterial({ color: '#fafafa' }),
      pupil: new THREE.MeshBasicNodeMaterial({ color: '#09090b' }),
    };
    const geo = <G extends THREE.BufferGeometry>(g: G) => (this.geos.push(g), g);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = shadow;
      return o;
    };

    this.group.name = 'avatar';
    this.group.add(this.body);

    // torso + drawstrings
    this.torso = mesh(geo(torsoGeometry()), this.mats.hoodie);
    this.torso.add(mesh(geo(detailGeometry()), this.mats.detail, false));
    this.body.add(this.torso);

    // head: the pointer, its white rim, a neck, eyes with lids
    this.head.add(mesh(geo(headGeometry()), this.mats.head));
    this.head.add(mesh(geo(headGeometry(0.1)), this.mats.outline, false));
    const neck = mesh(geo(new THREE.CylinderGeometry(0.036, 0.042, 0.1, 7)), this.mats.head);
    neck.position.y = -0.01;
    this.head.add(neck);
    const eyeGeo = geo(new THREE.CircleGeometry(0.043, 12));
    const pupilGeo = geo(new THREE.CircleGeometry(0.021, 10));
    const lidGeo = geo(new THREE.PlaneGeometry(0.095, 0.05));
    const faceZ = HEAD_DEPTH / 2 + 0.021;
    for (const [ex, ey] of [
      [2.5, 8.7],
      [5.5, 9.8],
    ]) {
      const p = arrowLocal(ex, ey);
      const eye = new THREE.Group();
      eye.position.set(p.x, p.y + 0.05, faceZ);
      eye.add(new THREE.Mesh(eyeGeo, this.mats.eye));
      const pupil = new THREE.Mesh(pupilGeo, this.mats.pupil);
      pupil.position.z = 0.003;
      eye.add(pupil);
      const lid = new THREE.Mesh(lidGeo, this.mats.head);
      lid.position.set(0, 0.026, 0.006);
      eye.add(lid);
      this.pupils.push(pupil);
      this.lids.push(lid);
      this.head.add(eye);
    }
    this.body.add(this.head);

    // limbs: tapered strokes with an anchor point at the bend
    const jointGeo = geo(new THREE.BoxGeometry(0.075, 0.075, 0.075));
    const thighGeo = geo(new THREE.CylinderGeometry(0.05, 0.058, 1, 7));
    const shinGeo = geo(new THREE.CylinderGeometry(0.043, 0.05, 1, 7));
    const upperGeo = geo(new THREE.CylinderGeometry(0.044, 0.052, 1, 7));
    const foreGeo = geo(new THREE.CylinderGeometry(0.04, 0.046, 1, 7));
    const shoeGeo = geo(shoeGeometry());
    for (const side of [1, -1]) {
      const shoe = mesh(shoeGeo, this.mats.shoes);
      this.shoes.push(shoe);
      this.legs.push({
        a: mesh(thighGeo, this.mats.pants),
        b: mesh(shinGeo, this.mats.pants),
        joint: mesh(jointGeo, this.mats.joints),
        end: shoe,
      });
      const glove = mesh(geo(gloveGeometry(side)), this.mats.gloves);
      this.arms.push({
        a: mesh(upperGeo, this.mats.hoodie),
        b: mesh(foreGeo, this.mats.hoodie),
        joint: mesh(jointGeo, this.mats.joints),
        end: glove,
      });
    }
    for (const l of [...this.legs, ...this.arms]) this.body.add(l.a, l.b, l.joint, l.end);

    for (const id of ['hammer', 'saw', 'book', 'cup'] as PropId[]) {
      const p = mesh(geo(propGeometry(id)), this.mats.detail);
      p.visible = false;
      this.props.set(id, p);
      this.body.add(p);
    }
  }

  setLook(look: Partial<AvatarLook>) {
    for (const [k, c] of Object.entries(look) as [keyof AvatarLook, string][]) this.mats[k]?.color.set(c);
  }

  /** World position of the right hand (where props and sawdust go). */
  rightHand(out = new THREE.Vector3()) {
    return this.arms[1].end.getWorldPosition(out);
  }

  update(o: AvatarInput) {
    const f = this.target;
    const cur = this.frame;
    poseFrame(f, o.kind, o.t);
    if (o.kind === 'stand') gait(f, o.phase, o.speed, o.bounce ?? 1);

    // idle head follows the look target
    if (o.look && o.kind === 'stand' && o.speed < 0.3) {
      const yaw = THREE.MathUtils.clamp(Math.atan2(o.look.x, o.look.z), -0.7, 0.7);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(o.look.y - 1.1, Math.hypot(o.look.x, o.look.z)) * 0.6, -0.4, 0.4);
      f.head[1] = yaw;
      f.head[0] = pitch;
    }

    const k = this.first ? 1 : 1 - Math.exp(-(o.speed > 0.05 ? 16 : 10) * o.dt);
    this.first = false;
    blend(cur, f, k);

    // squash & stretch around the feet
    const sq = o.squash ?? 0;
    this.body.scale.set(1 + sq * 0.3, 1 - sq * 0.38, 1 + sq * 0.3);

    // pelvis + torso
    v(cur.pelvis, this.pelvis);
    this.torsoQ.setFromEuler(tE.set(cur.lean, cur.twist, cur.roll, 'YXZ'));
    this.hipQ.setFromEuler(tE.set(0, cur.twist * 0.35, cur.roll * 0.4, 'YXZ'));
    this.torso.position.copy(this.pelvis);
    this.torso.quaternion.copy(this.torsoQ);

    // head
    this.head.position.copy(v(DIM.neck, tA).applyQuaternion(this.torsoQ).add(this.pelvis));
    this.head.quaternion.copy(this.torsoQ).multiply(tQ.setFromEuler(tE.set(cur.head[0], cur.head[1], cur.head[2], 'YXZ')));

    // legs
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const L = this.legs[i];
      const hip = tA.set(side * DIM.hip[0], DIM.hip[1], DIM.hip[2]).applyQuaternion(this.hipQ).add(this.pelvis);
      const ankle = v(cur.feet[i], tB);
      ankle.y += DIM.ankle;
      const knee = L.joint.position;
      const end = new THREE.Vector3();
      ik(hip, ankle, DIM.thigh, DIM.shin, v(cur.knees[i], tPole), knee, end);
      placeBone(L.a, hip, knee);
      placeBone(L.b, knee, end);
      L.end.position.set(end.x, end.y - DIM.ankle, end.z);
      L.end.rotation.set(cur.toes[i], 0, 0);
      L.joint.quaternion.copy(this.hipQ);
    }

    // arms
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const A = this.arms[i];
      const sh = tA.set(side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]).applyQuaternion(this.torsoQ).add(this.pelvis);
      const elbow = A.joint.position;
      const end = new THREE.Vector3();
      ik(sh, v(cur.hands[i], tB), DIM.upper, DIM.fore, v(cur.elbows[i], tPole), elbow, end);
      placeBone(A.a, sh, elbow);
      placeBone(A.b, elbow, end);
      A.end.position.copy(end);
      A.end.quaternion.setFromUnitVectors(UP, tDir.subVectors(end, elbow).normalize());
      A.joint.quaternion.copy(this.torsoQ);
    }

    // prop in the right hand
    for (const [id, p] of this.props) {
      p.visible = cur.prop === id;
      if (!p.visible) continue;
      p.position.copy(this.arms[1].end.position);
      p.rotation.set(cur.propRot[0], cur.propRot[1], cur.propRot[2]);
    }

    // eyes: blink, squint, look
    const lid = Math.max(o.blink, cur.squint * 0.75);
    for (const l of this.lids) {
      l.scale.y = 0.08 + lid * 1.1;
      l.position.y = 0.026 - lid * 0.012;
    }
    const lx = o.look ? THREE.MathUtils.clamp(o.look.x * 0.05, -0.011, 0.011) : 0;
    const ly = o.look ? THREE.MathUtils.clamp((o.look.y - 1.1) * 0.03, -0.009, 0.009) : 0;
    for (const p of this.pupils) p.position.set(lx, ly - lid * 0.008, 0.003);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
