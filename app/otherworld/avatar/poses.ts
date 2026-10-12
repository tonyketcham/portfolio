/**
 * The pose library. A pose is a function of time that fills a PoseFrame:
 * where the pelvis sits, how the torso and head turn, and where the hands
 * and feet want to be. The rig solves elbows and knees with IK and blends
 * between frames, so a pose only has to describe its silhouette.
 *
 * Local space: the character faces +z, up is +y, its left is +x. Units are
 * tiles. Index 0 is the left limb, 1 the right (props go in the right hand).
 */

export type V3 = [number, number, number];

export type PropId = 'hammer' | 'saw' | 'book' | 'cup';

export type PoseKind =
  | 'stand'
  | 'sit'
  | 'sit-floor'
  | 'build'
  | 'saw'
  | 'warm'
  | 'search'
  | 'read'
  | 'pray'
  | 'pet'
  | 'pour'
  | 'pump'
  | 'swipe'
  | 'look-up'
  | 'play'
  | 'think'
  | 'pull'
  | 'hover'
  | 'light'
  | 'pick'
  | 'type'
  | 'portal'
  | 'wave'
  | 'cheer'
  | 'dance'
  | 'clap'
  | 'shrug'
  | 'bow'
  | 'yawn';

export interface PoseFrame {
  /** Pelvis position. */
  pelvis: V3;
  /** Torso pitch (forward +), yaw, roll. */
  lean: number;
  twist: number;
  roll: number;
  /** Head pitch (nod down +), yaw, roll, relative to the torso. */
  head: V3;
  hands: [V3, V3];
  /** Sole positions. */
  feet: [V3, V3];
  /** Toe pitch per foot (toes down +). */
  toes: [number, number];
  /** Which way knees and elbows bend (pole vectors). */
  knees: [V3, V3];
  elbows: [V3, V3];
  /** Prop in the right hand, and its rotation in the character's frame. */
  prop: PropId | null;
  propRot: V3;
  /** Eye squint 0..1 (yawns, prayers). */
  squint: number;
}

// ── skeleton dimensions (shared with the rig) ───────────────────────────────
export const DIM = {
  pelvisY: 0.53,
  hip: [0.085, -0.03, 0] as V3,
  thigh: 0.24,
  shin: 0.23,
  ankle: 0.05,
  shoulder: [0.19, 0.35, 0] as V3,
  upper: 0.2,
  fore: 0.19,
  neck: [0, 0.44, 0] as V3,
};

export function newFrame(): PoseFrame {
  const f = {} as PoseFrame;
  stand(f, 0);
  return f;
}

const set = (v: V3, x: number, y: number, z: number) => {
  v[0] = x;
  v[1] = y;
  v[2] = z;
};
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const TAU = Math.PI * 2;

/** Neutral standing, breathing a little. Every pose starts from here. */
function stand(f: PoseFrame, t: number) {
  const breathe = Math.sin(t * 2.2) * 0.006;
  f.pelvis = [0, DIM.pelvisY + breathe * 0.5, 0];
  f.lean = 0.03;
  f.twist = 0;
  f.roll = 0;
  f.head = [0.04, 0, 0];
  f.hands = [
    [0.225, 0.56 + breathe, 0.035],
    [-0.225, 0.56 + breathe, 0.035],
  ];
  f.feet = [
    [0.1, 0, 0],
    [-0.1, 0, 0],
  ];
  f.toes = [0, 0];
  f.knees = [
    [0.15, 0.2, 1],
    [-0.15, 0.2, 1],
  ];
  f.elbows = [
    [0.6, -0.2, -1],
    [-0.6, -0.2, -1],
  ];
  f.prop = null;
  f.propRot = [0, 0, 0];
  f.squint = 0;
}

/**
 * Walking / running layered onto standing. `speed` is 0..2 (2 = run),
 * `phase` advances with distance.
 */
export function gait(f: PoseFrame, phase: number, speed: number, bounce = 1) {
  if (speed < 0.01) return;
  const s = Math.min(1, speed);
  const run = Math.max(0, Math.min(1, speed - 1));
  const stride = 0.15 + run * 0.07;
  const lift = 0.07 + run * 0.06;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const ph = phase + (i === 0 ? 0 : Math.PI);
    const foot = f.feet[i];
    foot[0] = side * 0.095;
    foot[1] = Math.max(0, Math.cos(ph)) * lift * s;
    foot[2] = Math.sin(ph) * stride * s;
    f.toes[i] = Math.max(0, Math.cos(ph)) * 0.35 * s - Math.max(0, -Math.sin(ph)) * 0.2 * s;
    // arms swing against the same-side leg; running bends the elbows up
    const hand = f.hands[i];
    hand[0] = side * (0.22 - run * 0.03);
    hand[1] = 0.56 + run * 0.13 + Math.max(0, -Math.sin(ph)) * 0.04 * s;
    hand[2] = 0.035 - Math.sin(ph) * (0.13 + run * 0.05) * s + run * 0.07;
  }
  f.pelvis[1] = DIM.pelvisY - 0.02 * s - run * 0.03 + Math.abs(Math.cos(phase)) * 0.028 * s * bounce;
  f.pelvis[0] = Math.sin(phase) * 0.012 * s;
  f.lean = 0.05 * s + run * 0.16;
  f.twist = Math.sin(phase) * 0.09 * s;
  f.roll = Math.sin(phase) * 0.03 * s;
  f.head[0] = 0.02 - run * 0.1;
}

interface PoseDef {
  /** Seconds before it ends by itself (Infinity: until you move). */
  dur: number;
  frame: (f: PoseFrame, t: number) => void;
}

/** A chair: settle back, tap a foot, look around the room. */
function sit(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.56, -0.07);
  f.lean = -0.06;
  f.head = [0.08, Math.sin(t * 0.4) * 0.25, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const tap = i === 1 ? Math.max(0, Math.sin(t * 5.2)) * 0.035 : 0;
    set(f.feet[i], side * 0.11, tap, 0.27);
    f.toes[i] = -tap * 4;
    set(f.knees[i], side * 0.1, 1, 0.6);
    set(f.hands[i], side * 0.15, 0.6, 0.12);
    set(f.elbows[i], side * 1, -0.3, -0.4);
  }
}

/** Cross-legged-ish on the floor, leaning back on the hands. */
function sitFloor(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.11, -0.05);
  f.lean = -0.28;
  f.head = [-0.05, Math.sin(t * 0.3) * 0.4, 0.05];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.12, 0, 0.3);
    set(f.knees[i], side * 0.4, 1, 0.3);
    set(f.hands[i], side * 0.21, 0.04, -0.22);
    set(f.elbows[i], side * 0.3, 0, -1);
  }
}

/** Kneel on one knee and hammer. Raise slowly, slam fast. */
export function hammerStrike(t: number) {
  const u = (t * 2.3) % 1;
  return u < 0.72 ? ease(u / 0.72) : 1 - ease((u - 0.72) / 0.28);
}
function build(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.31, -0.06);
  f.lean = 0.42;
  f.head = [0.3, 0, 0];
  // left foot planted ahead, right knee down
  set(f.feet[0], 0.11, 0, 0.17);
  set(f.knees[0], 0.2, 1, 1);
  set(f.feet[1], -0.1, 0.03, -0.3);
  set(f.knees[1], 0, -1, 0.7);
  f.toes = [0, 0.9];
  set(f.hands[0], 0.13, 0.18, 0.37);
  const k = hammerStrike(t);
  set(f.hands[1], -0.1, 0.3 + k * 0.16, 0.36 - k * 0.05);
  set(f.elbows[1], -0.8, 0.2, -1);
  f.prop = 'hammer';
  // handle forward at impact (head on the work), up when raised
  f.propRot = [1.45 - k * 1.65, 0, 0];
}

function saw(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.42, -0.02);
  f.lean = 0.3;
  f.head = [0.35, 0, 0];
  set(f.feet[0], 0.12, 0, 0.08);
  set(f.feet[1], -0.1, 0, -0.12);
  const s = Math.sin(t * 10);
  set(f.hands[1], -0.08, 0.6, 0.32 + s * 0.1);
  set(f.hands[0], 0.16, 0.56, 0.3);
  f.twist = s * 0.05;
  f.prop = 'saw';
  f.propRot = [0.25, 0, 0];
}

function warm(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.42, -0.02);
  f.lean = 0.16;
  f.head = [0.12, 0, 0];
  f.squint = 0.6;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const rub = Math.sin(t * 7 + i * Math.PI) * 0.025;
    set(f.hands[i], side * 0.08 + rub, 0.64 + Math.abs(rub), 0.36);
    set(f.feet[i], side * 0.13, 0, 0.03);
  }
}

/** Reach up to a shelf, then pull a book out and read it. */
function search(f: PoseFrame, t: number) {
  if (t > 1.1) return read(f, t - 1.1);
  stand(f, t);
  const k = ease(t / 0.5);
  f.lean = -0.05;
  f.head = [-0.3 * k, 0.1, 0];
  set(f.hands[1], -0.1, 0.56 + k * 0.5 + Math.sin(t * 9) * 0.02 * k, 0.04 + k * 0.28);
  set(f.hands[0], 0.17, 0.56 + k * 0.3, 0.04 + k * 0.2);
}
function read(f: PoseFrame, t: number) {
  stand(f, t);
  f.head = [0.38, Math.sin(t * 1.5) * 0.12, 0];
  f.lean = 0.06;
  set(f.hands[0], 0.08, 0.7, 0.24);
  set(f.hands[1], -0.08, 0.7, 0.24);
  set(f.elbows[0], 1, -0.5, -0.4);
  set(f.elbows[1], -1, -0.5, -0.4);
  f.prop = 'book';
  f.propRot = [-0.9, 0, 0];
}

function pray(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.29 + Math.sin(t * 1.5) * 0.005, -0.03);
  f.lean = 0.06;
  f.head = [0.38, 0, 0];
  f.squint = 1;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.09, 0.02, -0.25);
    set(f.knees[i], side * 0.1, -1, 0.8);
    f.toes[i] = 1.2;
    set(f.hands[i], side * 0.018, 0.72, 0.17);
    set(f.elbows[i], side * 1, -0.6, -0.2);
  }
}

function pet(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.25, -0.07);
  f.lean = 0.5;
  f.head = [0.35, 0, 0.1];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.13, 0, 0.06);
    set(f.knees[i], side * 0.6, 1, 1);
  }
  const s = Math.sin(t * 5);
  set(f.hands[1], -0.04, 0.17 + Math.abs(s) * 0.04, 0.42 + s * 0.07);
  set(f.hands[0], 0.14, 0.33, 0.22);
}

function pour(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.12;
  f.head = [0.3, 0, 0];
  const tilt = ease(Math.min(1, t / 0.6)) * (0.6 + Math.sin(t * 3) * 0.1);
  set(f.hands[0], 0.06, 0.74, 0.3);
  set(f.hands[1], -0.12, 0.84, 0.32);
  f.prop = 'cup';
  f.propRot = [0, 0, -tilt];
}

function pump(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.2;
  f.head = [0.25, 0, 0];
  const s = Math.sin(t * 6);
  set(f.hands[1], -0.05, 0.64 + s * 0.13, 0.34);
  set(f.hands[0], 0.2, 0.55, 0.06);
  set(f.feet[0], 0.12, 0, 0.06);
  f.pelvis[1] -= Math.max(0, -s) * 0.03;
}

function swipe(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.12;
  f.head = [0.2, 0, 0];
  const u = ease((t * 1.4) % 1);
  set(f.hands[1], -0.3 + u * 0.45, 0.86, 0.34 + Math.sin(u * Math.PI) * 0.06);
  f.twist = -0.2 + u * 0.35;
}

function lookUp(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = -0.14;
  f.head = [-0.65, 0, 0];
  set(f.hands[0], 0.06, 1.0, 0.2);
  set(f.hands[1], -0.06, 1.0, 0.2);
  f.squint = 0.5;
}

/** 124 BPM. */
function play(f: PoseFrame, t: number) {
  stand(f, t);
  const beat = Math.sin(t * TAU * 2.07);
  f.lean = 0.14;
  f.head = [0.18 + beat * 0.12, 0, Math.sin(t * TAU * 1.03) * 0.1];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.15 + Math.sin(t * 3 + i) * 0.04), 0.8 + Math.sin(t * 13 + i * 2) * 0.025, 0.34);
  }
  f.pelvis[1] += Math.abs(beat) * 0.012;
}

function think(f: PoseFrame, t: number) {
  stand(f, t);
  f.head = [0.05, 0.15, 0.18 + Math.sin(t * 1.1) * 0.05];
  set(f.hands[1], -0.03, 0.95, 0.19);
  set(f.elbows[1], -0.3, -1, 0.1);
  set(f.hands[0], 0.02, 0.7, 0.17);
  set(f.elbows[0], 1, -0.3, 0.2);
}

function pull(f: PoseFrame, t: number) {
  stand(f, t);
  const u = (t * 1.3) % 1;
  const down = u < 0.35 ? ease(u / 0.35) : 1 - ease((u - 0.35) / 0.65);
  f.head = [-0.2 + down * 0.2, 0, 0];
  set(f.hands[1], -0.06, 1.28 - down * 0.32, 0.22);
  f.pelvis[1] -= down * 0.04;
}

function hover(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.16;
  f.head = [0.3, 0, 0];
  f.squint = 0.4;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const a = t * 2 + i * Math.PI;
    set(f.hands[i], side * 0.14 + Math.cos(a) * 0.03, 0.82 + Math.sin(a) * 0.03, 0.33);
  }
}

function light(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.4, -0.03);
  f.lean = 0.28;
  f.head = [0.3, 0, 0];
  set(f.hands[1], -0.05, 0.62 + Math.sin(t * 4) * 0.01, 0.4);
  set(f.hands[0], 0.17, 0.56, 0.18);
}

function pick(f: PoseFrame, t: number) {
  stand(f, t);
  const down = t < 0.7 ? ease(t / 0.35) : 1 - ease((t - 0.7) / 0.4);
  f.pelvis[1] = DIM.pelvisY - down * 0.18;
  f.lean = down * 0.45;
  f.head = [0.2 + down * 0.25, 0, 0];
  set(f.hands[1], -0.07, 0.56 - down * 0.2 + (t > 0.7 ? 0.2 * (1 - down) : 0), 0.04 + down * 0.36);
  for (let i = 0; i < 2; i++) set(f.knees[i], (i === 0 ? 1 : -1) * 0.4, 0.6, 1);
}

function typeAt(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.18;
  f.head = [0.3, Math.sin(t * 0.8) * 0.15, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const tap = Math.max(0, Math.sin(t * 17 + i * 1.7 + Math.sin(t * 3) * 2));
    set(f.hands[i], side * (0.12 + Math.sin(t * 2.3 + i) * 0.03), 0.8 + tap * 0.03, 0.36);
  }
}

function portal(f: PoseFrame, t: number) {
  stand(f, t);
  const k = ease(t / 0.3);
  f.head = [-0.3 * k, 0, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.22 + k * 0.05), 0.56 + k * 0.8, 0.04 + k * 0.06);
    set(f.elbows[i], side * 1, 0, -0.3);
  }
  f.pelvis[1] += Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.08;
}

function wave(f: PoseFrame, t: number) {
  stand(f, t);
  const k = ease(t / 0.25);
  f.head = [0, 0, 0.12 * k];
  set(f.hands[1], -0.24 - Math.sin(t * 13) * 0.06 * k, 0.56 + k * 0.72, 0.04 + k * 0.06);
  set(f.elbows[1], -1, -0.5, 0);
}

function cheer(f: PoseFrame, t: number) {
  stand(f, t);
  const hop = Math.max(0, Math.sin(t * 7));
  f.pelvis[1] += hop * 0.12;
  f.head = [-0.25, 0, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.3 + Math.sin(t * 14 + i) * 0.03), 1.28, 0.05);
    set(f.elbows[i], side * 1, 0, 0);
    f.feet[i][1] = hop * 0.1;
  }
}

/** OSRS-ish jig: alternating arms up, heel taps, hips side to side. */
function dance(f: PoseFrame, t: number) {
  stand(f, t);
  const b = t * TAU * 1.03;
  f.pelvis[0] = Math.sin(b) * 0.04;
  f.pelvis[1] -= Math.abs(Math.sin(b)) * 0.04;
  f.roll = Math.sin(b) * 0.12;
  f.twist = Math.sin(b * 0.5) * 0.3;
  f.head = [0.05, Math.sin(b * 0.5) * -0.3, Math.sin(b) * -0.15];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const up = Math.max(0, Math.sin(b + i * Math.PI));
    set(f.hands[i], side * (0.24 + up * 0.08), 0.62 + up * 0.62, 0.06);
    set(f.feet[i], side * 0.11, up * 0.08, up * 0.08);
    f.toes[i] = -up * 0.5;
  }
}

function clap(f: PoseFrame, t: number) {
  stand(f, t);
  const c = Math.abs(Math.sin(t * 9));
  f.head = [0.05, 0, Math.sin(t * 2) * 0.08];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.02 + c * 0.11), 0.76, 0.24);
    set(f.elbows[i], side * 1, -0.6, -0.2);
  }
}

function shrug(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 0.9 ? ease(t / 0.3) : 1 - ease((t - 0.9) / 0.4);
  f.head = [-0.05 * k, 0, 0.22 * k];
  f.pelvis[1] += k * 0.015;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.22 + k * 0.12), 0.56 + k * 0.22, 0.04 + k * 0.12);
  }
}

function bow(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 1.2 ? ease(t / 0.4) : 1 - ease((t - 1.2) / 0.4);
  f.lean = k * 0.85;
  f.head = [k * 0.3, 0, 0];
  f.pelvis[2] = -k * 0.08;
  set(f.hands[1], -0.05, 0.6, 0.18 + k * 0.05);
  set(f.hands[0], 0.2, 0.55 - k * 0.05, -0.12 * k);
}

function yawn(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 1.4 ? ease(t / 0.5) : 1 - ease((t - 1.4) / 0.5);
  f.lean = -0.18 * k;
  f.head = [-0.35 * k, 0, 0.1 * k];
  f.squint = k;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.2 + k * 0.05), 0.56 + k * 0.72, 0.04 - k * 0.1);
  }
}

export const POSES: Record<PoseKind, PoseDef> = {
  stand: { dur: Infinity, frame: stand },
  sit: { dur: Infinity, frame: sit },
  'sit-floor': { dur: Infinity, frame: sitFloor },
  build: { dur: 0.9, frame: build },
  saw: { dur: 0.8, frame: saw },
  warm: { dur: 3, frame: warm },
  search: { dur: 3.2, frame: search },
  read: { dur: 3, frame: read },
  pray: { dur: 3.2, frame: pray },
  pet: { dur: 2.6, frame: pet },
  pour: { dur: 2.2, frame: pour },
  pump: { dur: 2, frame: pump },
  swipe: { dur: 1.6, frame: swipe },
  'look-up': { dur: 3.5, frame: lookUp },
  play: { dur: 4, frame: play },
  think: { dur: 2.6, frame: think },
  pull: { dur: 1.6, frame: pull },
  hover: { dur: 3, frame: hover },
  light: { dur: 1.6, frame: light },
  pick: { dur: 1.2, frame: pick },
  type: { dur: 3, frame: typeAt },
  portal: { dur: 1.2, frame: portal },
  wave: { dur: 1.6, frame: wave },
  cheer: { dur: 2.2, frame: cheer },
  dance: { dur: 4, frame: dance },
  clap: { dur: 2, frame: clap },
  shrug: { dur: 1.5, frame: shrug },
  bow: { dur: 1.8, frame: bow },
  yawn: { dur: 2.1, frame: yawn },
};

/** Fill `f` with pose `kind` at time `t` (seconds since it started). */
export function poseFrame(f: PoseFrame, kind: PoseKind, t: number) {
  POSES[kind].frame(f, t);
}
