/**
 * Live levels for visuals that dance: bass / mid / high band energy and a kick
 * envelope, read from an analyser on the music mix (before the volume slider,
 * so turning the music down doesn't still the lights). Kicks are also known
 * ahead of time: the music player and `sfx('kick')` report exactly when they
 * land, so the pulse is sample-accurate rather than guessed from the spectrum.
 *
 * Standalone on purpose: `music.ts` and `sfx.ts` both feed it, and visuals can
 * import it without pulling in either.
 */

export interface MusicLevels {
  /** ≈ 20–150 Hz, smoothed, roughly 0 … 1. */
  bass: number;
  /** ≈ 150 Hz – 2 kHz. */
  mid: number;
  /** ≈ 2 kHz and up. */
  high: number;
  /** Spikes to ~1 on each kick, gone within ~150 ms. What most things should pulse on. */
  kick: number;
  /** A track is actually sounding. */
  playing: boolean;
}

/** Kick envelope time constant: 3.3τ ≈ 150 ms to fade. */
const KICK_TAU = 0.045;
/** Band smoothing (seconds): quick up, slower down. */
const RISE = 0.03;
const FALL = 0.16;
/** Auto-gain: each band's running peak relaxes over a few seconds, so levels stay ~0 … 1 for any track. */
const PEAK_FALL = 4;
const PEAK_FLOOR = 0.12;

let analyser: AnalyserNode | null = null;
let clock: BaseAudioContext | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let ranges: [number, number][] = [];
let musicPlaying = false;

// A small ring of upcoming / recent kicks: [audio time, strength].
const KICKS = 16;
const kickAt = new Float64Array(KICKS).fill(-1);
const kickAmp = new Float32Array(KICKS);
let kickHead = 0;

const out: MusicLevels = { bass: 0, mid: 0, high: 0, kick: 0, playing: false };
const smooth = new Float32Array(3);
const peak = new Float32Array(3).fill(PEAK_FLOOR);
let slowBass = 0;
let onset = 0;
let lastSample = -1;

/** Called by the music player once its graph exists. */
export function attachAnalyser(node: AnalyserNode) {
  analyser = node;
  clock = node.context;
  bins = new Uint8Array(node.frequencyBinCount);
  const hz = node.context.sampleRate / node.fftSize;
  const bin = (f: number) => Math.max(1, Math.min(node.frequencyBinCount - 1, Math.round(f / hz)));
  ranges = [
    [bin(20), bin(150)],
    [bin(150) + 1, bin(2000)],
    [bin(2000) + 1, bin(14000)],
  ];
}

/** The music player says whether a track is sounding right now. */
export function setMusicPlaying(on: boolean) {
  musicPlaying = on;
}

/** A kick lands at `time` (seconds on `ctx`'s clock, may be in the near future). */
export function noteKick(ctx: BaseAudioContext, time: number, strength = 1) {
  clock = ctx;
  kickAt[kickHead] = time;
  kickAmp[kickHead] = strength;
  kickHead = (kickHead + 1) % KICKS;
}

/** Forget scheduled kicks after `time` (a track was cut off). */
export function clearKicksAfter(time: number) {
  for (let i = 0; i < KICKS; i++) if (kickAt[i] > time) kickAt[i] = -1;
}

function zero() {
  out.bass = out.mid = out.high = 0;
  out.playing = false;
  smooth.fill(0);
  onset = 0;
  slowBass = 0;
}

/**
 * Current levels. Allocation-free and cheap: the analyser is read at most once
 * per frame however many callers ask. Returns the same object every time, so
 * read the numbers out rather than keeping it. All zeros (and `playing: false`)
 * when nothing is playing, except `kick`, which still answers `sfx('kick')`.
 */
export function musicLevels(): MusicLevels {
  const now = performance.now();
  if (now - lastSample < 6) return out;
  const dt = lastSample < 0 ? 1 / 60 : Math.min(0.25, (now - lastSample) / 1000);
  lastSample = now;

  const ctx = clock;
  if (!ctx || ctx.state !== 'running') {
    zero();
    out.kick = 0;
    return out;
  }
  const t = ctx.currentTime;

  // Scheduled kicks (music and sfx): instant attack, exponential fall.
  let kick = 0;
  for (let i = 0; i < KICKS; i++) {
    const age = t - kickAt[i];
    if (kickAt[i] < 0 || age < 0 || age > 0.4) continue;
    const e = kickAmp[i] * Math.exp(-age / KICK_TAU);
    if (e > kick) kick = e;
  }

  if (!musicPlaying || !analyser || !bins) {
    zero();
    out.kick = Math.min(1, kick);
    return out;
  }

  analyser.getByteFrequencyData(bins);
  const rise = 1 - Math.exp(-dt / RISE);
  const fall = 1 - Math.exp(-dt / FALL);
  const relax = Math.exp(-dt / PEAK_FALL);
  let rawBass = 0;
  for (let b = 0; b < 3; b++) {
    const [lo, hi] = ranges[b];
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += bins[i];
    const raw = sum / ((hi - lo + 1) * 255);
    if (b === 0) rawBass = raw;
    peak[b] = Math.max(PEAK_FLOOR, raw, peak[b] * relax);
    const v = Math.min(1, raw / peak[b]);
    smooth[b] += (v - smooth[b]) * (v > smooth[b] ? rise : fall);
  }
  out.bass = smooth[0];
  out.mid = smooth[1];
  out.high = smooth[2];
  out.playing = true;

  // Tracks without a kick part still thump: a sudden jump in the low band counts as one.
  const flux = (rawBass - slowBass) / peak[0];
  slowBass += (rawBass - slowBass) * (1 - Math.exp(-dt / 0.12));
  onset *= Math.exp(-dt / KICK_TAU);
  if (flux > 0.12) onset = Math.max(onset, Math.min(1, flux * 3));

  out.kick = Math.min(1, Math.max(kick, onset));
  return out;
}
