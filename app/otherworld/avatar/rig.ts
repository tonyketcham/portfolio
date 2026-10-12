/**
 * Toe Knee, rigged: a better-rendered old-school player model (see ./model)
 * on a procedural skeleton. Each frame a pose (./poses) gives targets for the
 * pelvis, torso, head, hands and feet; those are damped toward, the walk
 * cycle is layered on top, two-bone IK finds the elbows and knees, and the
 * bones of one continuous skinned mesh are aimed along the result. The cape
 * is cloth-ish: it bends, ripples, streams back as you move and drapes over
 * the hips instead of through them.
 *
 * React-free, so it renders headless too.
 */
import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, fract, frontFacing, max, mix, normalView, output, positionView, select, step, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { Kit } from '../house/kit';
import { v3 } from '../shaders/common';
import {
  B,
  CAPE_COLS,
  CAPE_LEN,
  CAPE_ROWS,
  EYE_Y,
  HEAD_OFFSET,
  HEAD_SCALE,
  OUTFITS,
  TOE_KNEE,
  buildAvatarGeometry,
  buildSkeleton,
  capeGeometry,
  capeTexture,
  eyesGeometry,
  glassesGeometry,
  lensGeometry,
  necklaceGeometry,
  printGeometry,
  printTexture,
  type AvatarLook,
} from './model';
import { DIM, gait, newFrame, poseFrame, type PoseFrame, type PoseKind, type PropId, type V3 } from './poses';


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

/**
 * Smooth-shaded, vertex-coloured, with shirt patterns drawn procedurally
 * (polka dots, embroidered stripes) and a soft rim so the silhouette reads.
 */
function bodyMaterial() {
  const m = new THREE.MeshLambertNodeMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const type = uniform(0);
  const tint = uniform(new THREE.Color('#ffffff'));
  const pat = attribute<'vec3'>('aPat', 'vec3');
  // polka: offset rows of round dots
  const q = vec2(pat.x, pat.y).div(0.078).toVar();
  const qx = q.x.add(floor(q.y).mul(0.5));
  const d = vec2(fract(qx), fract(q.y)).sub(0.5).length();
  const dots = float(1).sub(d.smoothstep(0.25, 0.29));
  // stripes: pairs of thin lines with an embroidered band of little diamonds between
  const u = fract(pat.x.div(0.075));
  const lines = max(step(u, 0.05), step(abs(u.sub(0.48)), 0.025));
  const diamond = step(abs(fract(pat.y.div(0.028)).sub(0.5)).add(abs(u.sub(0.24)).mul(2.6)), 0.3);
  const stripes = max(lines, diamond.mul(0.85));
  const shape = select(type.lessThan(1.5), dots, stripes).mul(step(0.5, type));
  m.colorNode = mix(vec3(1), v3(tint), shape.mul(pat.z));
  const rim = float(1).sub(normalView.dot(positionView.normalize().negate()).abs()).pow(3);
  m.outputNode = vec4(output.rgb.add(output.rgb.mul(rim).mul(0.3)), output.a);
  return Object.assign(m, { pattern: { type, tint } });
}

// ── maths ────────────────────────────────────────────────────────────────────
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tEnd = new THREE.Vector3();
const tDir = new THREE.Vector3();
const tPerp = new THREE.Vector3();
const tPole = new THREE.Vector3();
const tFront = new THREE.Vector3();
const tMid = new THREE.Vector3();
const tE = new THREE.Euler();
const tInv = new THREE.Quaternion();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const mB = new THREE.Matrix4();

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

/**
 * The rotation that takes a rest bone (pointing down −Y, front +Z) to point
 * along `down` with its front toward `front`.
 */
function aim(down: THREE.Vector3, front: THREE.Vector3, out: THREE.Quaternion) {
  by.copy(down).normalize().negate();
  bz.copy(front).addScaledVector(by, -front.dot(by));
  if (bz.lengthSq() < 1e-6) bz.set(0, 0, 1).addScaledVector(by, -by.z);
  if (bz.lengthSq() < 1e-6) bz.set(1, 0, 0);
  bz.normalize();
  bx.crossVectors(by, bz);
  return out.setFromRotationMatrix(mB.makeBasis(bx, by, bz));
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
  /** Look target in the avatar's local space (head follows). */
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
  private material = bodyMaterial();
  private mesh: THREE.SkinnedMesh;
  private bones: THREE.Bone[];
  private eyes: THREE.Mesh;
  private eyeMaterial = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  private glasses: THREE.Group = new THREE.Group();
  private lensMaterial = new THREE.MeshBasicNodeMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.16, depthWrite: false });
  private necklace: THREE.Mesh;
  private print: THREE.Mesh;
  private printMaterial = new THREE.MeshLambertNodeMaterial({ map: printTexture(), alphaTest: 0.5, transparent: false });
  private cape: THREE.Mesh;
  private capeMaterial: THREE.MeshLambertNodeMaterial;
  private capePivot = new THREE.Group();
  private capeAngle = 0.07;
  private capeRestPts: THREE.Vector3[] = [];
  private first = true;
  private stepAcc = 0;
  private props = new Map<PropId, THREE.Mesh>();
  private propMaterial = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  private pelvis = new THREE.Vector3();
  private torsoQ = new THREE.Quaternion();
  private hipQ = new THREE.Quaternion();
  private segQ = Array.from({ length: 16 }, () => new THREE.Quaternion());
  private hand = new THREE.Vector3();

  constructor(look: AvatarLook = TOE_KNEE) {
    this.look = { ...look };
    this.group.name = 'avatar';
    this.group.add(this.body);

    this.bones = buildSkeleton();
    this.mesh = new THREE.SkinnedMesh(buildAvatarGeometry(this.look), this.material);
    this.mesh.add(this.bones[B.root]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);

    this.eyes = new THREE.Mesh(eyesGeometry(), this.eyeMaterial);
    this.eyes.position.set(HEAD_OFFSET.x, EYE_Y * HEAD_SCALE + HEAD_OFFSET.y, HEAD_OFFSET.z);
    this.eyes.scale.setScalar(HEAD_SCALE);
    this.bones[B.head].add(this.eyes);

    // round wire glasses (and the faintest lenses)
    const frames = new THREE.Mesh(glassesGeometry(), this.propMaterial);
    frames.castShadow = true;
    const lenses = new THREE.Mesh(lensGeometry(), this.lensMaterial);
    lenses.renderOrder = 3;
    this.glasses.add(frames, lenses);
    this.glasses.position.copy(HEAD_OFFSET);
    this.glasses.scale.setScalar(HEAD_SCALE);
    this.bones[B.head].add(this.glasses);

    // outfit pieces on the chest: a silver chain, a printed croissant
    this.necklace = new THREE.Mesh(necklaceGeometry(), this.propMaterial);
    this.print = new THREE.Mesh(printGeometry(), this.printMaterial);
    this.bones[B.chest].add(this.necklace, this.print);
    this.dress();

    // the cape hangs from the back of the shoulders, on the chest bone; its inside is in shade
    this.capeMaterial = new THREE.MeshLambertNodeMaterial({ map: capeTexture(this.look), side: THREE.DoubleSide });
    this.capeMaterial.outputNode = vec4(output.rgb.mul(frontFacing.select(float(1), float(0.72))), output.a);
    this.cape = new THREE.Mesh(capeGeometry(), this.capeMaterial);
    this.cape.castShadow = true;
    this.cape.frustumCulled = false;
    const pa = this.cape.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) this.capeRestPts.push(new THREE.Vector3().fromBufferAttribute(pa, i));
    this.capePivot.position.set(0, DIM.shoulder[1] + 0.03, -0.128);
    this.capePivot.add(this.cape);
    this.bones[B.chest].add(this.capePivot);
    this.cape.visible = this.look.capeOn;

    for (const id of ['hammer', 'saw', 'book', 'cup'] as PropId[]) {
      const p = new THREE.Mesh(propGeometry(id), this.propMaterial);
      p.castShadow = true;
      p.visible = false;
      this.props.set(id, p);
      this.body.add(p);
    }
  }

  /** Accessories and the shirt pattern for the current look. */
  private dress() {
    const O = OUTFITS[this.look.outfit];
    this.glasses.visible = this.look.glasses;
    this.necklace.visible = !!O.necklace;
    this.print.visible = O.print === 'croissant';
    this.material.pattern.type.value = O.pattern === 'polka' ? 1 : O.pattern === 'stripes' ? 2 : 0;
    this.material.pattern.tint.value.set(O.patternColor);
  }

  setLook(look: Partial<AvatarLook>) {
    const next = { ...this.look, ...look };
    if ((Object.keys(next) as (keyof AvatarLook)[]).every((k) => next[k] === this.look[k])) return;
    const capeChanged = next.cape !== this.look.cape || next.capeTrim !== this.look.capeTrim;
    this.look = next;
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildAvatarGeometry(this.look);
    this.cape.visible = this.look.capeOn;
    this.dress();
    if (capeChanged) {
      this.capeMaterial.map?.dispose();
      this.capeMaterial.map = capeTexture(this.look);
      this.capeMaterial.needsUpdate = true;
    }
  }

  /** World position of the right hand (where props and sawdust go). */
  rightHand(out = new THREE.Vector3()) {
    return this.bones[B.handR].localToWorld(out.set(0, -0.07, 0));
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

    const bones = this.bones;
    const Q = this.segQ;

    // pelvis and torso
    v(cur.pelvis, this.pelvis);
    this.torsoQ.setFromEuler(tE.set(cur.lean, cur.twist, cur.roll, 'YXZ'));
    this.hipQ.setFromEuler(tE.set(0, cur.twist * 0.35, cur.roll * 0.4, 'YXZ'));
    bones[B.pelvis].position.copy(this.pelvis);
    bones[B.pelvis].quaternion.copy(this.hipQ);
    bones[B.chest].quaternion.copy(tInv.copy(this.hipQ).invert()).multiply(this.torsoQ);
    bones[B.head].quaternion.setFromEuler(tE.set(cur.head[0], cur.head[1], cur.head[2], 'YXZ'));

    // legs: IK, then aim thigh, shin and foot along the solution
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const [th, sh, ft] = i === 0 ? [B.thighL, B.shinL, B.footL] : [B.thighR, B.shinR, B.footR];
      const hip = tA.set(side * DIM.hip[0], DIM.hip[1], DIM.hip[2]).applyQuaternion(this.hipQ).add(this.pelvis);
      const ankle = v(cur.feet[i], tB);
      ankle.y += DIM.ankle;
      const pole = v(cur.knees[i], tPole);
      ik(hip, ankle, DIM.thigh, DIM.shin, pole, tMid, tEnd);
      aim(tDir.subVectors(tMid, hip), pole, Q[th]);
      aim(tDir.subVectors(tEnd, tMid), pole, Q[sh]);
      Q[ft].setFromEuler(tE.set(cur.toes[i], cur.twist * 0.2, 0));
      bones[th].quaternion.copy(tInv.copy(this.hipQ).invert()).multiply(Q[th]);
      bones[sh].quaternion.copy(tInv.copy(Q[th]).invert()).multiply(Q[sh]);
      bones[ft].quaternion.copy(tInv.copy(Q[sh]).invert()).multiply(Q[ft]);
    }

    // arms: elbows bend back, so the arm's front faces away from the pole
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const [up, fo, ha] = i === 0 ? [B.upperL, B.foreL, B.handL] : [B.upperR, B.foreR, B.handR];
      const sh = tA.set(side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]).applyQuaternion(this.torsoQ).add(this.pelvis);
      const pole = v(cur.elbows[i], tPole);
      ik(sh, v(cur.hands[i], tB), DIM.upper, DIM.fore, pole, tMid, tEnd);
      tFront.copy(pole).negate();
      aim(tDir.subVectors(tMid, sh), tFront, Q[up]);
      aim(tDir.subVectors(tEnd, tMid), tFront, Q[fo]);
      bones[up].quaternion.copy(tInv.copy(this.torsoQ).invert()).multiply(Q[up]);
      bones[fo].quaternion.copy(tInv.copy(Q[up]).invert()).multiply(Q[fo]);
      bones[ha].quaternion.identity();
      if (i === 1) this.hand.copy(tEnd).addScaledVector(tDir.subVectors(tEnd, tMid).normalize(), 0.07);
    }

    // prop in the right hand
    for (const [id, p] of this.props) {
      p.visible = cur.prop === id;
      if (!p.visible) continue;
      p.position.copy(this.hand);
      p.rotation.set(cur.propRot[0], cur.propRot[1], cur.propRot[2]);
    }

    // eyes: blink and squint
    this.eyes.scale.y = HEAD_SCALE * (1 - Math.max(o.blink, cur.squint * 0.75) * 0.9);

    if (this.cape.visible) this.updateCape(o, cur, snap);
  }

  /**
   * Cloth-ish cape: each column is a chain of segments whose angle grows down
   * the cape (stiff at the shoulders, loose at the hem), streaming back with
   * speed, rippling, and pushed out behind the hips.
   */
  private updateCape(o: AvatarInput, cur: PoseFrame, snap: boolean) {
    const run = Math.max(0, o.speed - 1);
    const s = Math.min(1, o.speed);
    // follow the torso about halfway, hang off the back, stream behind when moving
    const target = -cur.lean * 0.55 + 0.07 + s * 0.3 + run * 0.25;
    this.capeAngle = snap ? target : this.capeAngle + (target - this.capeAngle) * Math.min(1, o.dt * 5);

    // the hips, in the cape pivot's space (chest frame, offset to the pivot)
    const hips = tA.set(0, -0.08, -0.01).applyQuaternion(this.hipQ);
    hips.applyQuaternion(tInv.copy(this.torsoQ).invert()).sub(this.capePivot.position);
    const rx = 0.2;
    const ry = 0.2;
    const rz = 0.135;

    const pa = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const cols = CAPE_COLS + 1;
    const seg = CAPE_LEN / CAPE_ROWS;
    const t = o.time;
    const p = tEnd;
    for (let i = 0; i < cols; i++) {
      const u = i / CAPE_COLS;
      let y = 0;
      let z = 0;
      for (let j = 0; j <= CAPE_ROWS; j++) {
        const vv = j / CAPE_ROWS;
        const rest = this.capeRestPts[j * cols + i];
        if (j > 0) {
          const ripple = Math.sin(t * (2.2 + s * 5) - vv * 5 + u * 2.4) * (0.05 + s * 0.12) * vv;
          const ang = this.capeAngle * Math.pow(vv, 0.75) + ripple + (u - 0.5) * 0.05 * vv * s;
          y -= Math.cos(ang) * seg;
          z -= Math.sin(ang) * seg;
        }
        p.set(rest.x * (1 + vv * s * 0.08), y, z + rest.z);
        // drape over the hips rather than through them
        const qx = (p.x - hips.x) / rx;
        const qy = (p.y - hips.y) / ry;
        const inside = 1 - qx * qx - qy * qy;
        if (inside > 0) {
          const back = hips.z - rz * Math.sqrt(inside) - 0.012;
          if (p.z > back) {
            z += back - p.z;
            p.z = back;
          }
        }
        pa.setXYZ(j * cols + i, p.x, p.y, p.z);
      }
    }
    pa.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.eyes.geometry.dispose();
    this.cape.geometry.dispose();
    this.capeMaterial.map?.dispose();
    for (const p of this.props.values()) p.geometry.dispose();
    this.necklace.geometry.dispose();
    this.print.geometry.dispose();
    this.printMaterial.map?.dispose();
    for (const o of this.glasses.children) (o as THREE.Mesh).geometry.dispose();
    for (const m of [this.material, this.eyeMaterial, this.capeMaterial, this.propMaterial, this.lensMaterial, this.printMaterial]) m.dispose();
  }
}
