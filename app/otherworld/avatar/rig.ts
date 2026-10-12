/**
 * Toe Knee, rigged like an old-school player model: a low-poly, flat-shaded
 * person with a blocky head, square-section limbs, mitten hands and wedge
 * boots, in a linen shirt and brown trousers (a fresh account, basically)
 * wearing a skillcape whose emblem is a mouse cursor. Headgear slot: the
 * pointer helm, for when you want to be the cursor again.
 *
 * Fully procedural and React-free (it renders headless too). Each frame a
 * pose (./poses) gives targets for the pelvis, torso, head, hands and feet;
 * those are damped toward, the walk cycle is layered on top, and two-bone IK
 * places the elbows and knees. One vertex-coloured material; each bone is
 * its own mesh (about twenty draw calls). Colours rebuild the geometry.
 */
import * as THREE from 'three/webgpu';
import { Kit } from '../house/kit';
import { DIM, gait, newFrame, poseFrame, type PoseFrame, type PoseKind, type PropId, type V3 } from './poses';

export type HatId = 'none' | 'pointer';

export interface AvatarLook {
  skin: string;
  hair: string;
  top: string;
  legs: string;
  boots: string;
  cape: string;
  capeTrim: string;
  /** Wear the cape at all. */
  capeOn: boolean;
  hat: HatId;
}

export const TOE_KNEE: AvatarLook = {
  skin: '#c6936b',
  hair: '#3b2414',
  top: '#d8d0bf',
  legs: '#5c4632',
  boots: '#3a281b',
  cape: '#2557d6',
  capeTrim: '#f4f4f5',
  capeOn: true,
  hat: 'none',
};

const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

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
/** The pointer as an outline, `scale` per unit, tip at the top, centred; `mirror` for the back of things. */
function arrowOutline(scale: number, mirror = false, grow = 0): [number, number][] {
  const cx = 5.75;
  const cy = 9.5;
  return ARROW.map(([x, y]) => {
    const dx = (x - cx) * (1 + grow);
    const dy = (cy - y) * (1 + grow);
    return [(mirror ? -dx : dx) * scale, dy * scale];
  });
}

// ── geometry ─────────────────────────────────────────────────────────────────
function hipsGeometry(L: AvatarLook) {
  const k = new Kit(3);
  k.box(0.3, 0.17, 0.21, L.legs, [0, -0.13, 0]);
  k.box(0.315, 0.055, 0.225, '#3b2a1a', [0, -0.005, 0], { jitter: 0.02 }); // belt
  k.box(0.055, 0.045, 0.02, '#d4a72c', [0, 0.0, 0.115], { jitter: 0 }); // buckle
  return k.build(false)!;
}

function torsoGeometry(L: AvatarLook) {
  const k = new Kit(5);
  k.extrude(
    [
      [-0.15, 0.03],
      [0.15, 0.03],
      [0.168, 0.25],
      [0.198, 0.41],
      [0.168, 0.5],
      [-0.168, 0.5],
      [-0.198, 0.41],
      [-0.168, 0.25],
    ],
    0.2,
    L.top,
    [0, 0, 0],
    { bevel: 0.022 }
  );
  const dark = shade(L.top, 0.78);
  k.box(0.17, 0.035, 0.2, dark, [0, 0.49, 0], { jitter: 0.02 }); // collar
  for (const sx of [-1, 1]) k.box(0.016, 0.085, 0.02, dark, [sx * 0.022, 0.415, 0.118], { rot: [0, 0, sx * 0.5], jitter: 0 }); // the V of the neckline
  k.box(0.3, 0.03, 0.235, dark, [0, 0.03, 0], { jitter: 0.02 }); // hem
  return k.build(false)!;
}

function capeGeometry(L: AvatarLook) {
  const k = new Kit(7);
  const len = 0.95;
  k.extrude(
    [
      [-0.16, 0],
      [0.16, 0],
      [0.23, -len],
      [-0.23, -len],
    ],
    0.022,
    L.cape,
    [0, 0, 0],
    { jitter: 0.03 }
  );
  // trim: the bottom band and both edges
  k.box(0.47, 0.065, 0.03, L.capeTrim, [0, -len, 0], { jitter: 0.02 });
  for (const sx of [-1, 1]) {
    const a = Math.atan2(0.07, len);
    k.box(0.03, len, 0.03, L.capeTrim, [sx * 0.195, -len, 0], { rot: [0, 0, sx * a], jitter: 0.02 });
  }
  k.box(0.36, 0.05, 0.06, shade(L.cape, 0.7), [0, -0.035, 0.012], { jitter: 0.02 }); // clasp line at the shoulders
  // the emblem, on the back: a white disc with a black pointer on it
  k.push([0, -0.3, -0.013], [Math.PI / 2, 0, 0]);
  k.cyl(0.09, 0.09, 0.008, L.capeTrim, [0, 0, 0], 14, { jitter: 0 });
  k.pop();
  k.push([0, -0.3, -0.02]);
  k.extrude(arrowOutline(0.0105, true), 0.008, '#09090b', [0, 0, 0], { jitter: 0 });
  k.pop();
  return k.build(false)!;
}

function headGeometry(L: AvatarLook) {
  const k = new Kit(9);
  const skinDark = shade(L.skin, 0.82);
  k.cyl(0.055, 0.062, 0.1, L.skin, [0, -0.03, 0], 6); // neck
  // a blocky head: wide at the temples, narrowing to the chin
  k.push([0, 0, 0.012]);
  k.extrude(
    [
      [-0.055, 0.055],
      [0.055, 0.055],
      [0.102, 0.12],
      [0.114, 0.22],
      [0.102, 0.33],
      [-0.102, 0.33],
      [-0.114, 0.22],
      [-0.102, 0.12],
    ],
    0.225,
    L.skin,
    [0, 0, 0],
    { bevel: 0.014 }
  );
  const fz = 0.1125 + 0.014;
  k.box(0.036, 0.058, 0.042, skinDark, [0, 0.125, fz]); // nose
  k.box(0.055, 0.012, 0.01, '#6b2f25', [0, 0.098, fz + 0.002], { jitter: 0 }); // mouth
  for (const sx of [-1, 1]) {
    k.box(0.046, 0.014, 0.014, L.hair, [sx * 0.046, 0.232, fz + 0.002], { rot: [0, 0, sx * 0.14], jitter: 0 }); // brow
    k.box(0.026, 0.062, 0.04, L.skin, [sx * 0.12, 0.17, -0.01]); // ear
  }
  k.pop();
  // hair: a cap, the back, sides, a fringe and a tuft
  k.box(0.25, 0.07, 0.27, L.hair, [0, 0.305, 0.004]);
  k.box(0.245, 0.19, 0.055, L.hair, [0, 0.14, -0.112]);
  for (const sx of [-1, 1]) k.box(0.03, 0.11, 0.15, L.hair, [sx * 0.119, 0.2, -0.04]);
  k.box(0.21, 0.05, 0.045, L.hair, [0, 0.285, 0.122], { rot: [0.25, 0, 0] });
  k.box(0.08, 0.05, 0.09, shade(L.hair, 1.15), [0.04, 0.36, 0.05], { rot: [0, 0.3, 0.35] });
  if (L.hat === 'pointer') {
    // the pointer helm: a black skullcap with the cursor stood up on top, white rim and all
    k.box(0.262, 0.06, 0.282, '#18181b', [0, 0.315, 0.004]);
    k.push([0, 0.47, -0.01], [-0.12, 0, 0.08]);
    k.extrude(arrowOutline(0.0185, false, 0.12), 0.05, '#fafafa', [0, 0, 0], { jitter: 0 });
    k.extrude(arrowOutline(0.0185), 0.07, '#09090b', [0, 0, 0], { jitter: 0 });
    k.pop();
  }
  return k.build(false)!;
}

/** Eyes on their own so they can blink and squint. */
function eyesGeometry() {
  const k = new Kit(11);
  for (const sx of [-1, 1]) {
    k.box(0.036, 0.022, 0.01, '#f4f4f5', [sx * 0.046, -0.011, 0], { jitter: 0 });
    k.box(0.016, 0.02, 0.012, '#18181b', [sx * 0.04, -0.01, 0.002], { jitter: 0 });
  }
  return k.build(false)!;
}

/** Unit-length limb along +y with a square section (the low-poly look). */
function limbGeometry(rEnd: number, rStart: number, color: string) {
  const g = new THREE.CylinderGeometry(rEnd, rStart, 1, 4, 1).toNonIndexed();
  g.rotateY(Math.PI / 4);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 0.95 + ((i * 7919) % 11) / 110;
    for (let v = i; v < i + 3; v++) col.set([c.r * k, c.g * k, c.b * k], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function jointGeometry(size: number, color: string) {
  const k = new Kit(13);
  k.box(size, size, size, color, [0, -size / 2, 0], { jitter: 0.03 });
  return k.build(false)!;
}

function handGeometry(L: AvatarLook, side: number) {
  const k = new Kit(15);
  k.box(0.072, 0.105, 0.062, L.skin, [0, -0.005, 0], { jitter: 0.04 });
  k.box(0.03, 0.055, 0.032, shade(L.skin, 0.92), [side * 0.045, 0.01, 0.02], { rot: [0, 0, side * -0.3] }); // thumb
  k.box(0.08, 0.035, 0.07, shade(L.top, 0.85), [0, -0.035, 0]); // cuff
  return k.build(false)!;
}

function bootGeometry(L: AvatarLook) {
  const k = new Kit(17);
  k.box(0.13, 0.03, 0.25, '#1c140e', [0, 0, 0.04], { jitter: 0.02 }); // sole
  k.box(0.12, 0.13, 0.15, L.boots, [0, 0.025, -0.005]);
  k.box(0.118, 0.075, 0.11, L.boots, [0, 0.025, 0.11]); // toe
  k.box(0.132, 0.035, 0.165, shade(L.boots, 0.75), [0, 0.15, -0.005], { jitter: 0.02 }); // cuff
  return k.build(false)!;
}

function propGeometry(id: PropId) {
  const k = new Kit(19);
  k.push([0, 0, 0], [0, 0, 0], 1.45);
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
  k.pop();
  return k.build(false)!;
}

// ── maths ────────────────────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tEnd = new THREE.Vector3();
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
  end: THREE.Mesh;
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
  /** Look target in the avatar's local space (head and eyes follow). */
  look?: THREE.Vector3 | null;
  /** Landing squash, 0..1. */
  squash?: number;
  /** Hold each frame for 1/fps seconds, like the game without animation smoothing. 0 = smooth. */
  stepFps?: number;
}

export class Avatar {
  /** Position and yaw this; everything else is local. */
  readonly group = new THREE.Group();
  /** Scaled for squash & stretch. */
  readonly body = new THREE.Group();
  readonly frame = newFrame();
  private target = newFrame();
  private look: AvatarLook;
  private material = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  private first = true;
  private stepAcc = 0;
  private hips: THREE.Mesh;
  private torso: THREE.Mesh;
  private cape: THREE.Mesh;
  private capePivot = new THREE.Group();
  private capeAngle = 0;
  private head = new THREE.Group();
  private headMesh: THREE.Mesh;
  private eyes: THREE.Mesh;
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private props = new Map<PropId, THREE.Mesh>();
  private pelvis = new THREE.Vector3();
  private torsoQ = new THREE.Quaternion();
  private hipQ = new THREE.Quaternion();

  constructor(look: AvatarLook = TOE_KNEE) {
    this.look = { ...look };
    const mesh = () => {
      const o = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      o.castShadow = true;
      return o;
    };
    this.group.name = 'avatar';
    this.group.add(this.body);

    this.hips = mesh();
    this.torso = mesh();
    this.cape = mesh();
    this.capePivot.position.set(0, DIM.shoulder[1] - 0.005, -0.125);
    this.capePivot.add(this.cape);
    this.torso.add(this.capePivot);
    this.headMesh = mesh();
    this.eyes = mesh();
    this.eyes.castShadow = false;
    this.eyes.position.set(0, 0.2, 0.012 + 0.1125 + 0.014 + 0.004);
    this.head.add(this.headMesh, this.eyes);
    this.body.add(this.hips, this.torso, this.head);

    for (let i = 0; i < 2; i++) {
      this.legs.push({ a: mesh(), b: mesh(), joint: mesh(), end: mesh() });
      this.arms.push({ a: mesh(), b: mesh(), joint: mesh(), end: mesh() });
    }
    for (const l of [...this.legs, ...this.arms]) this.body.add(l.a, l.b, l.joint, l.end);

    for (const id of ['hammer', 'saw', 'book', 'cup'] as PropId[]) {
      const p = new THREE.Mesh(propGeometry(id), this.material);
      p.castShadow = true;
      p.visible = false;
      this.props.set(id, p);
      this.body.add(p);
    }
    this.rebuild();
  }

  private swap(m: THREE.Mesh, g: THREE.BufferGeometry) {
    m.geometry.dispose();
    m.geometry = g;
  }

  /** (Re)build every body part's geometry from the current look. */
  private rebuild() {
    const L = this.look;
    this.swap(this.hips, hipsGeometry(L));
    this.swap(this.torso, torsoGeometry(L));
    this.swap(this.cape, capeGeometry(L));
    this.cape.visible = L.capeOn;
    this.swap(this.headMesh, headGeometry(L));
    this.swap(this.eyes, eyesGeometry());
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const leg = this.legs[i];
      this.swap(leg.a, limbGeometry(0.066, 0.08, L.legs));
      this.swap(leg.b, limbGeometry(0.054, 0.066, L.legs));
      this.swap(leg.joint, jointGeometry(0.12, L.legs));
      this.swap(leg.end, bootGeometry(L));
      const arm = this.arms[i];
      this.swap(arm.a, limbGeometry(0.052, 0.064, L.top));
      this.swap(arm.b, limbGeometry(0.045, 0.054, L.top));
      this.swap(arm.joint, jointGeometry(0.1, L.top));
      this.swap(arm.end, handGeometry(L, side));
    }
  }

  setLook(look: Partial<AvatarLook>) {
    const next = { ...this.look, ...look };
    if ((Object.keys(next) as (keyof AvatarLook)[]).every((k) => next[k] === this.look[k])) return;
    this.look = next;
    this.rebuild();
  }

  /** World position of the right hand (where props and sawdust go). */
  rightHand(out = new THREE.Vector3()) {
    return this.arms[1].end.getWorldPosition(out);
  }

  update(o: AvatarInput) {
    const snap = this.first;
    let k = snap ? 1 : 1 - Math.exp(-(o.speed > 0.05 ? 16 : 10) * o.dt);
    if (o.stepFps && !snap) {
      // old-school: hold the frame, then jump to the next one
      this.stepAcc += o.dt;
      const step = 1 / o.stepFps;
      if (this.stepAcc < step) return;
      this.stepAcc %= step;
      k = 1;
    }
    this.first = false;

    const f = this.target;
    const cur = this.frame;
    poseFrame(f, o.kind, o.t);
    if (o.kind === 'stand') gait(f, o.phase, o.speed, o.bounce ?? 1);

    // idle head follows the look target, a little
    if (o.look && o.kind === 'stand' && o.speed < 0.3) {
      f.head[1] = THREE.MathUtils.clamp(Math.atan2(o.look.x, o.look.z), -0.55, 0.55);
      f.head[0] = THREE.MathUtils.clamp(-Math.atan2(o.look.y - 1.5, Math.hypot(o.look.x, o.look.z)) * 0.5, -0.35, 0.35);
    }
    blend(cur, f, k);

    // squash & stretch around the feet
    const sq = o.squash ?? 0;
    this.body.scale.set(1 + sq * 0.25, 1 - sq * 0.3, 1 + sq * 0.25);

    // pelvis, hips, torso
    v(cur.pelvis, this.pelvis);
    this.torsoQ.setFromEuler(tE.set(cur.lean, cur.twist, cur.roll, 'YXZ'));
    this.hipQ.setFromEuler(tE.set(0, cur.twist * 0.35, cur.roll * 0.4, 'YXZ'));
    this.hips.position.copy(this.pelvis);
    this.hips.quaternion.copy(this.hipQ);
    this.torso.position.copy(this.pelvis);
    this.torso.quaternion.copy(this.torsoQ);

    // the cape hangs straight down whatever the torso does, and streams back as you move
    const run = Math.max(0, o.speed - 1);
    const capeTarget = -cur.lean + 0.06 + Math.min(1, o.speed) * 0.28 + run * 0.22 + Math.sin(o.time * 2.4) * 0.025 * (0.4 + o.speed);
    this.capeAngle = snap ? capeTarget : this.capeAngle + (capeTarget - this.capeAngle) * Math.min(1, o.dt * 6);
    this.capePivot.rotation.x = this.capeAngle;

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
      ik(hip, ankle, DIM.thigh, DIM.shin, v(cur.knees[i], tPole), knee, tEnd);
      placeBone(L.a, hip, knee);
      placeBone(L.b, knee, tEnd);
      L.joint.quaternion.copy(L.b.quaternion);
      L.end.position.set(tEnd.x, tEnd.y - DIM.ankle, tEnd.z);
      L.end.rotation.set(cur.toes[i], cur.twist * 0.2, 0);
    }

    // arms
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const A = this.arms[i];
      const sh = tA.set(side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]).applyQuaternion(this.torsoQ).add(this.pelvis);
      const elbow = A.joint.position;
      ik(sh, v(cur.hands[i], tB), DIM.upper, DIM.fore, v(cur.elbows[i], tPole), elbow, tEnd);
      placeBone(A.a, sh, elbow);
      placeBone(A.b, elbow, tEnd);
      A.joint.quaternion.copy(A.a.quaternion);
      A.end.position.copy(tEnd);
      A.end.quaternion.setFromUnitVectors(UP, tDir.subVectors(tEnd, elbow).normalize());
    }

    // prop in the right hand
    for (const [id, p] of this.props) {
      p.visible = cur.prop === id;
      if (!p.visible) continue;
      p.position.copy(this.arms[1].end.position);
      p.rotation.set(cur.propRot[0], cur.propRot[1], cur.propRot[2]);
    }

    // eyes: blink and squint
    this.eyes.scale.y = 1 - Math.max(o.blink, cur.squint * 0.75) * 0.85;
  }

  dispose() {
    for (const m of [this.hips, this.torso, this.cape, this.headMesh, this.eyes, ...this.legs.flatMap((l) => [l.a, l.b, l.joint, l.end]), ...this.arms.flatMap((a) => [a.a, a.b, a.joint, a.end]), ...this.props.values()])
      m.geometry.dispose();
    this.material.dispose();
  }
}
