/**
 * The pose library. A pose is a function of time that fills a PoseFrame:
 * where the pelvis sits, how the torso and head turn, and where the hands
 * and feet want to be. The rig solves elbows and knees with IK and blends
 * between frames, so a pose only has to describe its silhouette.
 *
 * The timing and silhouettes follow the old-school player animations: stiff
 * arms on the walk, elbows up on the run, a one-knee kneel to build, both
 * knees to pray.
 *
 * Local space: the character faces +z, up is +y, its left is +x. Units are
 * tiles; the character is about 1.75 tall (doors are 2.18). Index 0 is the
 * left limb, 1 the right (props go in the right hand).
 */

export type V3 = [number, number, number];

export type PropId = 'hammer' | 'saw' | 'book' | 'cup' | 'fishing-rod';

export type PoseKind =
  | 'stand'
  | 'fish'
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
  /** Eyes narrowed 0..1 (yawns, prayers, warming up). */
  squint: number;
}

// ── skeleton (shared with the rig) ───────────────────────────────────────────
export const DIM = {
  pelvisY: 0.86,
  hip: [0.095, -0.05, 0] as V3,
  thigh: 0.4,
  shin: 0.37,
  ankle: 0.07,
  shoulder: [0.205, 0.47, 0] as V3,
  upper: 0.29,
  fore: 0.27,
  neck: [0, 0.53, 0] as V3,
};

/** Hands hanging at rest, at the chest, at the chin, overhead. */
const HANG = 0.8;
const CHEST = 1.12;
const CHIN = 1.4;
const OVER = 1.95;

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

/** The idle stance: feet apart, arms a little out from the body, breathing. */
function stand(f: PoseFrame, t: number) {
  const breathe = Math.sin(t * 2) * 0.008;
  f.pelvis = [0, DIM.pelvisY + breathe * 0.4, 0];
  f.lean = 0.02;
  f.twist = 0;
  f.roll = 0;
  f.head = [0.02, 0, 0];
  f.hands = [
    [0.27, HANG + breathe, 0.02],
    [-0.27, HANG + breathe, 0.02],
  ];
  f.feet = [
    [0.12, 0, 0],
    [-0.12, 0, 0],
  ];
  f.toes = [0, 0];
  f.knees = [
    [0.1, 0.2, 1],
    [-0.1, 0.2, 1],
  ];
  f.elbows = [
    [0.5, -0.3, -1],
    [-0.5, -0.3, -1],
  ];
  f.prop = null;
  f.propRot = [0, 0, 0];
  f.squint = 0;
}

/**
 * Walking / running layered onto standing. `speed` is 0..2 (2 = run),
 * `phase` advances with distance. Walking swings straight arms from the
 * shoulder; running bends the elbows and pumps them.
 */
export function gait(f: PoseFrame, phase: number, speed: number, bounce = 1) {
  if (speed < 0.01) return;
  const s = Math.min(1, speed);
  const run = Math.max(0, Math.min(1, speed - 1));
  const stride = 0.22 + run * 0.1;
  const lift = 0.1 + run * 0.08;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const ph = phase + (i === 0 ? 0 : Math.PI);
    const foot = f.feet[i];
    foot[0] = side * 0.1;
    foot[1] = Math.max(0, Math.cos(ph)) * lift * s;
    foot[2] = Math.sin(ph) * stride * s;
    f.toes[i] = Math.max(0, Math.cos(ph)) * 0.3 * s - Math.max(0, -Math.sin(ph)) * 0.25 * s;
    f.knees[i] = [side * 0.1, 0.1, 1];
    const hand = f.hands[i];
    const swing = -Math.sin(ph);
    hand[0] = side * (0.26 - run * 0.04);
    hand[1] = HANG + Math.abs(swing) * 0.05 * s + run * (0.26 + Math.max(0, swing) * 0.1);
    hand[2] = 0.02 + swing * (0.22 - run * 0.04) * s + run * 0.12;
    f.elbows[i] = [side * 0.4, -0.4 + run * 0.2, -1];
  }
  f.pelvis[1] = DIM.pelvisY - 0.03 * s - run * 0.04 + Math.abs(Math.cos(phase)) * 0.035 * s * bounce;
  f.lean = 0.04 * s + run * 0.16;
  f.twist = Math.sin(phase) * 0.07 * s;
  f.roll = Math.sin(phase) * 0.02 * s;
  f.head[0] = 0.02 - run * 0.12;
}

interface PoseDef {
  /** Seconds before it ends by itself (Infinity: until you move). */
  dur: number;
  frame: (f: PoseFrame, t: number) => void;
}

/** A chair: settle back, tap a foot, look around the room. */
function sit(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.6, -0.09);
  f.lean = -0.05;
  f.head = [0.06, Math.sin(t * 0.4) * 0.3, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const tap = i === 1 ? Math.max(0, Math.sin(t * 5)) * 0.05 : 0;
    set(f.feet[i], side * 0.12, tap, 0.32);
    f.toes[i] = -tap * 3;
    set(f.knees[i], side * 0.1, 1, 0.6);
    set(f.hands[i], side * 0.17, 0.7, 0.2);
    set(f.elbows[i], side * 1, -0.3, -0.5);
  }
}

/** On the floor, knees up, leaning back on the hands. */
function sitFloor(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.14, -0.1);
  f.lean = -0.3;
  f.head = [-0.05, Math.sin(t * 0.3) * 0.45, 0.05];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.14, 0, 0.48);
    set(f.knees[i], side * 0.4, 1, 0.3);
    set(f.hands[i], side * 0.27, 0.05, -0.38);
    set(f.elbows[i], side * 0.3, 0, -1);
  }
}

/** Kneel on one knee and hammer: raise slowly, slam fast. */
export function hammerStrike(t: number) {
  const u = (t * 2.3) % 1;
  return u < 0.72 ? ease(u / 0.72) : 1 - ease((u - 0.72) / 0.28);
}
function build(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.5, -0.1);
  f.lean = 0.42;
  f.head = [0.3, 0, 0];
  // left foot planted ahead, right knee on the floor
  set(f.feet[0], 0.13, 0, 0.3);
  set(f.knees[0], 0.2, 1, 1);
  set(f.feet[1], -0.11, 0.0, -0.42);
  set(f.knees[1], 0, -1, 0.6);
  f.toes = [0, 1.2];
  set(f.hands[0], 0.17, 0.52, 0.44);
  const k = hammerStrike(t);
  set(f.hands[1], -0.12, 0.56 + k * 0.26, 0.48 - k * 0.08);
  set(f.elbows[1], -0.8, 0.2, -1);
  f.prop = 'hammer';
  // handle forward at impact (head on the work), up when raised
  f.propRot = [1.45 - k * 1.65, 0, 0];
}

function saw(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.8, -0.03);
  f.lean = 0.3;
  f.head = [0.35, 0, 0];
  set(f.feet[0], 0.13, 0, 0.12);
  set(f.feet[1], -0.11, 0, -0.16);
  const s = Math.sin(t * 10);
  set(f.hands[1], -0.1, 0.95, 0.45 + s * 0.13);
  set(f.hands[0], 0.2, 0.92, 0.4);
  f.twist = s * 0.05;
  f.prop = 'saw';
  f.propRot = [0.25, 0, 0];
}

function warm(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.78, -0.03);
  f.lean = 0.15;
  f.head = [0.12, 0, 0];
  f.squint = 0.6;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const rub = Math.sin(t * 7 + i * Math.PI) * 0.035;
    set(f.hands[i], side * 0.1 + rub, 1.0 + Math.abs(rub), 0.45);
    set(f.feet[i], side * 0.15, 0, 0.04);
  }
}

/** Reach up to a shelf, then pull a book out and read it. */
function search(f: PoseFrame, t: number) {
  if (t > 1.1) return read(f, t - 1.1);
  stand(f, t);
  const k = ease(t / 0.5);
  f.lean = -0.04;
  f.head = [-0.35 * k, 0.1, 0];
  set(f.hands[1], -0.12, HANG + k * 0.9 + Math.sin(t * 9) * 0.03 * k, 0.02 + k * 0.38);
  set(f.hands[0], 0.22, HANG + k * 0.6, 0.02 + k * 0.26);
}
function read(f: PoseFrame, t: number) {
  stand(f, t);
  f.head = [0.4, Math.sin(t * 1.5) * 0.12, 0];
  f.lean = 0.05;
  set(f.hands[0], 0.1, 1.06, 0.32);
  set(f.hands[1], -0.1, 1.06, 0.32);
  set(f.elbows[0], 1, -0.5, -0.4);
  set(f.elbows[1], -1, -0.5, -0.4);
  f.prop = 'book';
  f.propRot = [-0.9, 0, 0];
}

/** Both knees down, hands together. */
function pray(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.5 + Math.sin(t * 1.5) * 0.006, -0.04);
  f.lean = 0.05;
  f.head = [0.4, 0, 0];
  f.squint = 1;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.1, 0, -0.38);
    set(f.knees[i], side * 0.1, -1, 0.8);
    f.toes[i] = 1.25;
    set(f.hands[i], side * 0.022, 0.88, 0.2);
    set(f.elbows[i], side * 1, -0.6, -0.2);
  }
}

function pet(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.42, -0.1);
  f.lean = 0.5;
  f.head = [0.35, 0, 0.1];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.feet[i], side * 0.15, 0, 0.1);
    set(f.knees[i], side * 0.6, 1, 1);
  }
  const s = Math.sin(t * 5);
  set(f.hands[1], -0.04, 0.22 + Math.abs(s) * 0.05, 0.62 + s * 0.09);
  set(f.hands[0], 0.17, 0.5, 0.3);
}

function pour(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.12;
  f.head = [0.3, 0, 0];
  const tilt = ease(Math.min(1, t / 0.6)) * (0.6 + Math.sin(t * 3) * 0.1);
  set(f.hands[0], 0.08, 1.04, 0.4);
  set(f.hands[1], -0.15, 1.14, 0.42);
  f.prop = 'cup';
  f.propRot = [0, 0, -tilt];
}

function pump(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.2;
  f.head = [0.25, 0, 0];
  const s = Math.sin(t * 6);
  set(f.hands[1], -0.06, 0.96 + s * 0.18, 0.46);
  set(f.hands[0], 0.28, 0.9, 0.05);
  set(f.feet[0], 0.14, 0, 0.1);
  f.pelvis[1] -= Math.max(0, -s) * 0.04;
}

function swipe(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.12;
  f.head = [0.2, 0, 0];
  const u = ease((t * 1.4) % 1);
  set(f.hands[1], -0.4 + u * 0.6, 1.14, 0.44 + Math.sin(u * Math.PI) * 0.08);
  f.twist = -0.2 + u * 0.35;
}

function lookUp(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = -0.12;
  f.head = [-0.65, 0, 0];
  set(f.hands[0], 0.07, 1.48, 0.24);
  set(f.hands[1], -0.07, 1.48, 0.24);
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
    set(f.hands[i], side * (0.18 + Math.sin(t * 3 + i) * 0.05), 1.06 + Math.sin(t * 13 + i * 2) * 0.03, 0.45);
  }
  f.pelvis[1] += Math.abs(beat) * 0.015;
}

function think(f: PoseFrame, t: number) {
  stand(f, t);
  f.head = [0.05, 0.15, 0.16 + Math.sin(t * 1.1) * 0.05];
  set(f.hands[1], -0.03, CHIN - 0.04, 0.2);
  set(f.elbows[1], -0.3, -1, 0.1);
  set(f.hands[0], 0.03, 1.02, 0.2);
  set(f.elbows[0], 1, -0.3, 0.2);
}

function pull(f: PoseFrame, t: number) {
  stand(f, t);
  const u = (t * 1.3) % 1;
  const down = u < 0.35 ? ease(u / 0.35) : 1 - ease((u - 0.35) / 0.65);
  f.head = [-0.2 + down * 0.2, 0, 0];
  set(f.hands[1], -0.07, OVER - down * 0.45, 0.28);
  f.pelvis[1] -= down * 0.05;
}

function hover(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.16;
  f.head = [0.3, 0, 0];
  f.squint = 0.4;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const a = t * 2 + i * Math.PI;
    set(f.hands[i], side * 0.17 + Math.cos(a) * 0.04, CHEST + Math.sin(a) * 0.04, 0.42);
  }
}

function light(f: PoseFrame, t: number) {
  stand(f, t);
  set(f.pelvis, 0, 0.74, -0.04);
  f.lean = 0.3;
  f.head = [0.3, 0, 0];
  set(f.hands[1], -0.06, 0.9 + Math.sin(t * 4) * 0.01, 0.52);
  set(f.hands[0], 0.22, 0.82, 0.22);
}

function pick(f: PoseFrame, t: number) {
  stand(f, t);
  const down = t < 0.7 ? ease(t / 0.35) : 1 - ease((t - 0.7) / 0.4);
  f.pelvis[1] = DIM.pelvisY - down * 0.3;
  f.lean = down * 0.5;
  f.head = [0.2 + down * 0.25, 0, 0];
  set(f.hands[1], -0.08, HANG - down * 0.36 + (t > 0.7 ? 0.3 * (1 - down) : 0), 0.02 + down * 0.5);
  for (let i = 0; i < 2; i++) set(f.knees[i], (i === 0 ? 1 : -1) * 0.4, 0.6, 1);
}

function typeAt(f: PoseFrame, t: number) {
  stand(f, t);
  f.lean = 0.18;
  f.head = [0.3, Math.sin(t * 0.8) * 0.15, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const tap = Math.max(0, Math.sin(t * 17 + i * 1.7 + Math.sin(t * 3) * 2));
    set(f.hands[i], side * (0.15 + Math.sin(t * 2.3 + i) * 0.04), 1.06 + tap * 0.04, 0.46);
  }
}

function portal(f: PoseFrame, t: number) {
  stand(f, t);
  const k = ease(t / 0.3);
  f.head = [-0.3 * k, 0, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.27 + k * 0.06), HANG + k * (OVER - HANG), 0.02 + k * 0.08);
    set(f.elbows[i], side * 1, 0, -0.3);
  }
  f.pelvis[1] += Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.1;
}

function wave(f: PoseFrame, t: number) {
  stand(f, t);
  const k = ease(t / 0.25);
  f.head = [0, 0, 0.12 * k];
  set(f.hands[1], -0.3 - Math.sin(t * 13) * 0.08 * k, HANG + k * (OVER - 0.1 - HANG), 0.02 + k * 0.08);
  set(f.elbows[1], -1, -0.5, 0);
}

function cheer(f: PoseFrame, t: number) {
  stand(f, t);
  const hop = Math.max(0, Math.sin(t * 7));
  f.pelvis[1] += hop * 0.15;
  f.head = [-0.25, 0, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.38 + Math.sin(t * 14 + i) * 0.04), OVER, 0.06);
    set(f.elbows[i], side * 1, 0, 0);
    f.feet[i][1] = hop * 0.13;
  }
}

/** A jig: alternating arms up, heel taps, hips side to side. */
function dance(f: PoseFrame, t: number) {
  stand(f, t);
  const b = t * TAU * 1.03;
  f.pelvis[0] = Math.sin(b) * 0.05;
  f.pelvis[1] -= Math.abs(Math.sin(b)) * 0.05;
  f.roll = Math.sin(b) * 0.1;
  f.twist = Math.sin(b * 0.5) * 0.3;
  f.head = [0.05, Math.sin(b * 0.5) * -0.3, Math.sin(b) * -0.15];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const up = Math.max(0, Math.sin(b + i * Math.PI));
    set(f.hands[i], side * (0.3 + up * 0.1), 0.95 + up * 0.9, 0.08);
    set(f.feet[i], side * 0.12, up * 0.1, up * 0.1);
    f.toes[i] = -up * 0.5;
  }
}

function clap(f: PoseFrame, t: number) {
  stand(f, t);
  const c = Math.abs(Math.sin(t * 9));
  f.head = [0.05, 0, Math.sin(t * 2) * 0.08];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.025 + c * 0.14), CHEST, 0.32);
    set(f.elbows[i], side * 1, -0.6, -0.2);
  }
}

function shrug(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 0.9 ? ease(t / 0.3) : 1 - ease((t - 0.9) / 0.4);
  f.head = [-0.05 * k, 0, 0.22 * k];
  f.pelvis[1] += k * 0.02;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.27 + k * 0.16), HANG + k * 0.3, 0.02 + k * 0.16);
  }
}

function bow(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 1.2 ? ease(t / 0.4) : 1 - ease((t - 1.2) / 0.4);
  f.lean = k * 0.85;
  f.head = [k * 0.3, 0, 0];
  f.pelvis[2] = -k * 0.12;
  set(f.hands[1], -0.06, 1.0 - k * 0.1, 0.24 + k * 0.1);
  set(f.hands[0], 0.24, 0.85 - k * 0.05, -0.18 * k);
}

function yawn(f: PoseFrame, t: number) {
  stand(f, t);
  const k = t < 1.4 ? ease(t / 0.5) : 1 - ease((t - 1.4) / 0.5);
  f.lean = -0.16 * k;
  f.head = [-0.35 * k, 0, 0.1 * k];
  f.squint = k;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    set(f.hands[i], side * (0.25 + k * 0.08), HANG + k * (OVER + 0.05 - HANG), 0.02 - k * 0.12);
  }
}

function fish(f: PoseFrame, t: number) {
  stand(f, t);
  const cast = Math.max(0, 1 - t / 0.7);
  const bob = Math.sin(t * 1.8) * 0.015;
  f.lean = 0.06;
  f.head = [0.12, 0, 0];
  set(f.hands[1], -0.19, 1.05 + bob + cast * 0.2, 0.32);
  set(f.hands[0], 0.06, 1.02 + bob, 0.3);
  f.prop = 'fishing-rod';
  f.propRot = [0.9 - cast * 1.4, 0, -0.08];
}

export const POSES: Record<PoseKind, PoseDef> = {
  fish: { dur: Infinity, frame: fish },
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
