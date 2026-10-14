'use client';

/**
 * The soundtrack player. Tracks from `tracks.ts` are played on little WebAudio
 * synth voices that stand in for the old General MIDI bank: harp, flute,
 * pizzicato, a slightly-too-bright glockenspiel. A lookahead scheduler queues
 * notes a fraction of a second ahead; when a track ends the next one starts,
 * in order, forever. Silent unless the Sound plugin is on.
 */
import { gameState, useGame } from '../state/store';
import type { Inst, PartDef, Song } from './score';
import { attachAnalyser, clearKicksAfter, noteKick, setMusicPlaying } from './levels';
import { audioBus } from './sfx';
import { SECRET_TRACK, TRACKS, areaTracks, musicArea, nextTrack, trackLocked } from './tracks';

/** Seconds of notes queued ahead of the clock (longer when the tab is hidden and timers slow down). */
const LOOKAHEAD = 0.3;
const HIDDEN_LOOKAHEAD = 1.5;
/** Seconds after the last note before the track counts as over (lets the reverb ring out). */
const TAIL = 2.5;
/** Silence between tracks. */
const GAP = 1.2;
/** Milliseconds a new area has to last before the music follows. */
const AREA_SETTLE = 1500;

interface Graph {
  ctx: AudioContext;
  /** The volume slider. */
  music: GainNode;
  /** The track mix before the slider: parts land here, and the level analyser listens. */
  mix: GainNode;
  /** Into the hall: everything but `dry` parts. */
  room: GainNode;
  noise: AudioBuffer;
}

interface Playing {
  index: number;
  song: Song;
  start: number;
  cursor: number;
  /** Into the room (reverb). */
  out: GainNode;
  /** Straight to the mix, for parts that skip the reverb. */
  dry: GainNode;
  parts: AudioNode[];
  /** Each part's level, for sidechain ducking. */
  gains: GainNode[];
  /** Parts that duck under the kick: [part, depth]. */
  ducks: [number, number][];
}

let graph: Graph | null = null;
let playing: Playing | null = null;
let nextAt = 0;
let seq = -1;
let lastResume = 0;
let currentArea: string | null = null;
let pendingArea: { area: string; since: number } | null = null;
const songs = new Map<number, Song>();

export function songFor(index: number) {
  let song = songs.get(index);
  if (!song) {
    song = TRACKS[index].build();
    songs.set(index, song);
  }
  return song;
}

/** Where the current track is, for the Music tab's progress bar. */
export function musicPosition() {
  if (!playing || !graph) return null;
  const elapsed = Math.max(0, graph.ctx.currentTime - playing.start);
  return { index: playing.index, elapsed, length: playing.song.length };
}

const volumeCurve = (v: number) => 0.5 * v * v;

function ensureGraph(): Graph | null {
  if (graph) return graph;
  const audio = audioBus();
  if (!audio) return null;
  const { ctx, bus } = audio;
  const music = ctx.createGain();
  music.gain.value = volumeCurve(gameState().musicVolume);
  music.connect(bus);
  // mix → slider → out; the analyser taps the mix so the visuals don't care about volume.
  const mix = gainNode(ctx, music, 1);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.35;
  analyser.minDecibels = -85;
  analyser.maxDecibels = -15;
  mix.connect(analyser);
  attachAnalyser(analyser);
  const room = gainNode(ctx, mix, 1);

  // A small hall: decaying stereo noise as the impulse response.
  const seconds = 2.2;
  const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const send = ctx.createGain();
  send.gain.value = 0.28;
  room.connect(send).connect(reverb).connect(mix);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  graph = { ctx, music, mix, room, noise };
  return graph;
}

// ── voices ───────────────────────────────────────────────────────────────────
type Env = { attack: number; release: number };

function osc(ctx: AudioContext, type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(end);
  return o;
}

function gainNode(ctx: AudioContext, dest: AudioNode, value = 0) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

function filter(ctx: AudioContext, type: BiquadFilterType, f: number, dest: AudioNode, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}

/** Struck or plucked: up fast, ring down. Returns when it's inaudible. */
function pluck(g: GainNode, t: number, peak: number, ring: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, ring / 5);
  return t + ring;
}

/** Bowed or blown: swell in, hold for the note, fall away. */
function hold(g: GainNode, t: number, d: number, peak: number, { attack, release }: Env) {
  const off = t + Math.max(d, attack);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, off);
  g.gain.setTargetAtTime(0, off, release / 4);
  return off + release * 1.2;
}

function vibrato(ctx: AudioContext, oscs: OscillatorNode[], f: number, t: number, end: number, rate: number, depth: number, delay: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, t);
  amount.gain.setValueAtTime(0, t + delay);
  amount.gain.linearRampToValueAtTime(f * depth, t + delay + 0.35);
  lfo.connect(amount);
  for (const o of oscs) amount.connect(o.frequency);
  lfo.start(t);
  lfo.stop(end);
}

function noiseBurst(g: Graph, t: number, end: number, dest: AudioNode) {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  src.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(end);
}

/** An 808-ish cymbal: six detuned squares, only the shimmer above the highpass survives. */
function metal(g: Graph, t: number, end: number, dest: AudioNode, cut = 7200) {
  const hp = filter(g.ctx, 'highpass', cut, dest, 1);
  const bp = filter(g.ctx, 'bandpass', cut * 1.4, hp, 0.8);
  const mixer = gainNode(g.ctx, bp, 1 / 6);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) osc(g.ctx, 'square', f * 1.6, t, end, mixer);
  noiseBurst(g, t, end, gainNode(g.ctx, hp, 0.35));
}

function voice(g: Graph, inst: Inst, dest: AudioNode, t: number, d: number, m: number, v: number, beat = 0.5) {
  const { ctx } = g;
  const f = 440 * Math.pow(2, (m - 69) / 12);
  switch (inst) {
    case 'harp': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 3200, out);
      const ring = Math.min(2.4, Math.max(0.7, 2.6 - f / 500));
      const end = pluck(out, t, v * 0.2, ring);
      osc(ctx, 'triangle', f, t, end, lp);
      osc(ctx, 'sine', f * 2, t, end, gainNode(ctx, lp, 0.2));
      break;
    }
    case 'lute': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 3000, out, 1.6);
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.setTargetAtTime(700, t, 0.08);
      const end = pluck(out, t, v * 0.07, 0.9);
      osc(ctx, 'sawtooth', f, t, end, lp);
      break;
    }
    case 'pizz': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 1800, out);
      const end = pluck(out, t, v * 0.22, 0.4);
      osc(ctx, 'triangle', f, t, end, lp);
      break;
    }
    case 'glock': {
      // A bar's inharmonic partials, the upper ones dying first.
      const partials: [number, number, number][] = [
        [1, 0.13, 1.6],
        [2.76, 0.045, 0.45],
        [5.4, 0.02, 0.18],
      ];
      for (const [ratio, peak, ring] of partials) {
        const pg = gainNode(ctx, dest);
        osc(ctx, 'sine', f * ratio, t, pluck(pg, t, v * peak, ring), pg);
      }
      break;
    }
    case 'bass': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 700, out);
      const off = t + Math.max(d, 0.1);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(v * 0.32, t + 0.008);
      out.gain.setTargetAtTime(v * 0.12, t + 0.008, 0.18);
      out.gain.setTargetAtTime(0, off, 0.05);
      const end = off + 0.3;
      osc(ctx, 'triangle', f, t, end, lp);
      osc(ctx, 'sine', f, t, end, gainNode(ctx, lp, 0.6));
      break;
    }
    case 'flute': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 2800, out);
      const end = hold(out, t, d, v * 0.15, { attack: 0.06, release: 0.14 });
      const a = osc(ctx, 'sine', f, t, end, lp);
      const b = osc(ctx, 'triangle', f, t, end, gainNode(ctx, lp, 0.25));
      vibrato(ctx, [a, b], f, t, end, 5.2, 0.005, 0.22);
      const breath = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(breath, t, v * 0.025, 0.18), filter(ctx, 'bandpass', Math.min(8000, f * 2), breath, 1.2));
      break;
    }
    case 'clarinet': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', Math.min(3400, f * 3), out, 0.5);
      const end = hold(out, t, d * 0.92, v * 0.075, { attack: 0.03, release: 0.09 });
      const a = osc(ctx, 'square', f, t, end, lp);
      vibrato(ctx, [a], f, t, end, 4.8, 0.003, 0.3);
      break;
    }
    case 'fiddle': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 3200, out, 0.8);
      const end = hold(out, t, d, v * 0.06, { attack: 0.05, release: 0.14 });
      const a = osc(ctx, 'sawtooth', f, t, end, lp);
      const b = osc(ctx, 'sawtooth', f, t, end, lp, 5);
      vibrato(ctx, [a, b], f, t, end, 5.6, 0.007, 0.15);
      break;
    }
    case 'strings': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 1500, out);
      const end = hold(out, t, d, v * 0.04, { attack: 0.4, release: 0.6 });
      for (const detune of [-7, 0, 7]) osc(ctx, 'sawtooth', f, t, end, lp, detune);
      break;
    }
    case 'accordion': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 2400, out);
      const end = hold(out, t, d * 0.9, v * 0.045, { attack: 0.02, release: 0.06 });
      osc(ctx, 'square', f, t, end, lp);
      osc(ctx, 'sawtooth', f, t, end, lp, 9);
      break;
    }
    case 'horn': {
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 400, out, 0.7);
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.linearRampToValueAtTime(1700, t + 0.07);
      lp.frequency.setTargetAtTime(1100, t + 0.07, 0.2);
      const end = hold(out, t, d, v * 0.09, { attack: 0.06, release: 0.16 });
      const a = osc(ctx, 'sawtooth', f, t, end, lp);
      const b = osc(ctx, 'sine', f, t, end, gainNode(ctx, lp, 0.6));
      vibrato(ctx, [a, b], f, t, end, 4.6, 0.003, 0.4);
      break;
    }
    case 'timpani': {
      const out = gainNode(ctx, dest);
      const end = pluck(out, t, v * 0.4, 1.4);
      const o = osc(ctx, 'sine', f * 1.04, t, end, out);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
      const thud = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(thud, t, v * 0.12, 0.15), filter(ctx, 'lowpass', 320, thud));
      break;
    }
    case 'drum': {
      const out = gainNode(ctx, dest);
      const end = pluck(out, t, v * 0.42, 0.3);
      const o = osc(ctx, 'sine', 180, t, end, out);
      o.frequency.exponentialRampToValueAtTime(85, t + 0.1);
      const slap = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(slap, t, v * 0.08, 0.06), filter(ctx, 'bandpass', 900, slap));
      break;
    }
    case 'shaker': {
      const out = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(out, t, v * 0.07, 0.07), filter(ctx, 'highpass', 7000, out));
      break;
    }
    case 'tick': {
      const out = gainNode(ctx, dest);
      const end = pluck(out, t, v * 0.13, 0.06);
      const o = osc(ctx, 'sine', 1500, t, end, out);
      o.frequency.exponentialRampToValueAtTime(1100, t + 0.04);
      break;
    }

    // ── the club kit (dark warehouse techno) ──
    case 'kick': {
      // A long sine body dropping onto F1, with only a dull knock and a hint of click on top.
      const out = gainNode(ctx, dest);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(v * 0.48, t + 0.002);
      out.gain.setValueAtTime(v * 0.48, t + 0.05);
      out.gain.setTargetAtTime(0, t + 0.05, 0.12);
      const end = t + 0.65;
      const body = osc(ctx, 'sine', 160, t, end, out);
      body.frequency.exponentialRampToValueAtTime(58, t + 0.045);
      body.frequency.exponentialRampToValueAtTime(43.65, t + 0.16);
      const knock = gainNode(ctx, dest);
      const k = osc(ctx, 'triangle', 260, t, pluck(knock, t, v * 0.06, 0.08), filter(ctx, 'lowpass', 900, knock));
      k.frequency.exponentialRampToValueAtTime(80, t + 0.05);
      const click = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(click, t, v * 0.022, 0.01), filter(ctx, 'bandpass', 2400, click, 0.8));
      break;
    }
    case 'rumble': {
      // The kick's tail in a concrete room: a low swell that rolls in sixteenths and is
      // gone just before the next kick, like a reverb'd kick through a lowpass, sidechained.
      const out = gainNode(ctx, dest);
      const s16 = beat / 4;
      const peak = v * 0.14;
      out.gain.setValueAtTime(0, t);
      out.gain.setTargetAtTime(peak * 0.6, t + 0.03, 0.03);
      for (let k = 1; k < 4; k++) {
        const at = t + k * s16;
        out.gain.setTargetAtTime(peak * (1.05 - k * 0.15), at, 0.008);
        out.gain.setTargetAtTime(peak * 0.35, at + 0.03, 0.035);
      }
      out.gain.setTargetAtTime(0, t + beat * 0.92, 0.01);
      const end = t + beat + 0.05;
      const lp = filter(ctx, 'lowpass', 105, out, 1.5);
      osc(ctx, 'sine', f, t, end, lp);
      osc(ctx, 'triangle', f, t, end, gainNode(ctx, lp, 0.5));
      noiseBurst(g, t, end, gainNode(ctx, filter(ctx, 'lowpass', 90, out, 0.8), 2.2));
      break;
    }
    case 'sub': {
      // Nearly pure sine, soft attack, long and held; a saw underneath is low-passed to a growl.
      const out = gainNode(ctx, dest);
      const off = t + Math.max(d * 0.92, 0.06);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(v * 0.26, t + 0.012);
      out.gain.setTargetAtTime(v * 0.2, t + 0.012, 0.2);
      out.gain.setTargetAtTime(0, off, 0.03);
      const end = off + 0.18;
      osc(ctx, 'sine', f, t, end, out);
      osc(ctx, 'sawtooth', f, t, end, filter(ctx, 'lowpass', f * 2.5, gainNode(ctx, out, 0.15), 0.7));
      break;
    }
    case 'acid': {
      // A menacing 303 kept in a box: low saw, gentle resonance, a filter that only creeps
      // open as the velocity rises and never gets past a growl. Drifts slowly in time.
      const out = gainNode(ctx, dest);
      const off = t + Math.max(d * 0.85, 0.05);
      const amp = 0.1 * (0.7 + 0.3 * v);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(amp, t + 0.004);
      out.gain.setValueAtTime(amp, off);
      out.gain.setTargetAtTime(0, off, 0.02);
      const end = off + 0.12;
      const drift = 0.8 + 0.2 * Math.sin(t * 0.3);
      const base = 110 + v * v * 380 * drift;
      const peak = base + v * v * 900 * drift;
      const lp = filter(ctx, 'lowpass', peak, out, 6);
      lp.frequency.setValueAtTime(peak, t);
      lp.frequency.setTargetAtTime(base, t + 0.004, 0.07);
      osc(ctx, 'sawtooth', f, t, end, lp);
      break;
    }
    case 'dub': {
      // One dark minor chord far down the tunnel, smeared through a tape echo: every repeat
      // a dotted eighth later, quieter, duller, and a little out of tune.
      const hit = (at: number, level: number, cutoff: number, wow: number) => {
        const out = gainNode(ctx, dest);
        const lp = filter(ctx, 'lowpass', cutoff, out, 1.2);
        lp.frequency.setValueAtTime(cutoff, at);
        lp.frequency.setTargetAtTime(cutoff * 0.5, at, 0.12);
        out.gain.setValueAtTime(0, at);
        out.gain.linearRampToValueAtTime(level, at + 0.012);
        out.gain.setTargetAtTime(0, at + 0.03, 0.12);
        const end = at + 0.8;
        osc(ctx, 'sawtooth', f, at, end, lp, wow - 6);
        osc(ctx, 'sawtooth', f, at, end, lp, wow + 6);
      };
      for (let k = 0; k < 6; k++) hit(t + k * beat * 0.75, v * 0.03 * Math.pow(0.6, k), 700 * Math.pow(0.78, k), (k % 2 ? -1 : 1) * k * 2.5);
      break;
    }
    case 'hat': {
      // Closed and tight, tucked well under the kick.
      const out = gainNode(ctx, dest);
      metal(g, t, pluck(out, t, v * 0.06, 0.04), out);
      break;
    }
    case 'ride': {
      // A dark ride on the offbeat: lower shimmer, longer wash.
      const out = gainNode(ctx, dest);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(v * 0.05, t + 0.003);
      out.gain.setTargetAtTime(0, t + 0.003, 0.12);
      metal(g, t, t + 0.6, out, 5000);
      break;
    }
    case 'rim': {
      // A rimshot in a dark room: a woody knock and a short snap, low-passed.
      const out = gainNode(ctx, dest);
      const lp = filter(ctx, 'lowpass', 2200, out, 0.8);
      const end = pluck(out, t, v * 0.11, 0.07);
      osc(ctx, 'triangle', 820, t, end, lp);
      osc(ctx, 'square', 1650, t, end, gainNode(ctx, lp, 0.2));
      const snap = gainNode(ctx, dest);
      noiseBurst(g, t, pluck(snap, t, v * 0.07, 0.03), filter(ctx, 'bandpass', 1800, snap, 2));
      break;
    }
  }
}

// ── transport ────────────────────────────────────────────────────────────────
function partBus(g: Graph, def: PartDef, dest: AudioNode) {
  const gain = gainNode(g.ctx, dest, def.gain ?? 1);
  if (!def.pan) return { input: gain as AudioNode, gain };
  const pan = g.ctx.createStereoPanner();
  pan.pan.value = def.pan;
  pan.connect(gain);
  return { input: pan as AudioNode, gain };
}

function start(g: Graph, wantedIndex: number) {
  const s = gameState();
  let index = wantedIndex;
  if (!TRACKS[index] || trackLocked(index, s.musicSecrets)) {
    // A secret track you haven't found yet (or a stale save): play something you have.
    index = nextTrack(index, s.musicMode, 1, false, musicArea(s.location, s.zoneId), s.musicSecrets);
    s.setMusicTrack(index);
  }
  const song = songFor(index);
  const out = gainNode(g.ctx, g.room, 1);
  const dry = gainNode(g.ctx, g.mix, 1);
  const buses = song.parts.map((def) => partBus(g, def, def.dry ? dry : out));
  playing = {
    index,
    song,
    start: g.ctx.currentTime + 0.1,
    cursor: 0,
    out,
    dry,
    parts: buses.map((b) => b.input),
    gains: buses.map((b) => b.gain),
    ducks: song.parts.flatMap((def, i) => (def.duck ? [[i, def.duck] as [number, number]] : [])),
  };
  s.hearTrack(index);
}

function stop(fade = 0.12) {
  if (!playing || !graph) return;
  const { out, dry } = playing;
  const now = graph.ctx.currentTime;
  out.gain.setTargetAtTime(0, now, fade);
  dry.gain.setTargetAtTime(0, now, fade);
  window.setTimeout(() => {
    out.disconnect();
    dry.disconnect();
  }, fade * 8000 + 200);
  clearKicksAfter(now);
  setMusicPlaying(false);
  playing = null;
}

/** Sidechain: every part with `duck` dips under the kick and swells back. */
function duckUnder(p: Playing, at: number) {
  for (const [i, depth] of p.ducks) {
    const g = p.gains[i].gain;
    const base = p.song.parts[i].gain ?? 1;
    g.setTargetAtTime(base * (1 - depth), at, 0.004);
    g.setTargetAtTime(base, at + 0.03, 0.08);
  }
}

function wanted() {
  const s = gameState();
  return s.plugins.sound && s.musicVolume > 0 && !s.musicPaused;
}

function tick() {
  followArea();
  if (!wanted()) {
    stop();
    return;
  }
  const g = ensureGraph();
  if (!g) return;
  if (g.ctx.state !== 'running') {
    // Browsers let audio start once the page has had a gesture; ask again now and then.
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
    if (active && performance.now() - lastResume > 1000) {
      lastResume = performance.now();
      g.ctx.resume().catch(() => undefined);
    }
    return;
  }
  const now = g.ctx.currentTime;
  if (!playing) {
    if (now >= nextAt) start(g, gameState().musicTrack);
    return;
  }
  const p = playing;
  setMusicPlaying(true);
  const horizon = now + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  const { events, parts } = p.song;
  while (p.cursor < events.length && p.start + events[p.cursor].t < horizon) {
    const e = events[p.cursor++];
    const def = parts[e.p];
    const inst = def.inst;
    let when = p.start + e.t;
    if (def.swing) {
      // Shuffle: the second and fourth sixteenth of each beat land a little late.
      const s16 = 15 / p.song.bpm;
      if (Math.round(e.t / s16) % 2 === 1) when += def.swing * s16;
    }
    const at = Math.max(now, when);
    if (inst === 'kick' || inst === 'drum') {
      noteKick(g.ctx, at, Math.min(1, e.v * (inst === 'kick' ? 1.15 : 0.9)));
      if (p.ducks.length) duckUnder(p, at);
    }
    try {
      voice(g, inst, p.parts[e.p], at, e.d, e.m, e.v, 60 / p.song.bpm);
    } catch {
      /* a voice that fails to build just doesn't sound */
    }
  }
  if (p.cursor >= events.length && now > p.start + p.song.length + TAIL) {
    const s = gameState();
    const next = nextTrack(p.index, s.musicMode, 1, true, musicArea(s.location, s.zoneId), s.musicSecrets);
    stop(0.3);
    nextAt = now + GAP;
    s.setMusicTrack(next);
  }
}

/**
 * Area mode: crossing into somewhere with its own music fades over to it. The
 * area has to hold still for a moment first, so a portal arrival (place first,
 * zone a beat later) or a wobble along a border doesn't flick between tunes.
 */
function followArea(immediate = false) {
  const s = gameState();
  const area = musicArea(s.location, s.zoneId);
  if (area === currentArea) {
    pendingArea = null;
    return;
  }
  const now = performance.now();
  if (!immediate) {
    if (pendingArea?.area !== area) pendingArea = { area, since: now };
    if (now - pendingArea.since < AREA_SETTLE) return;
  }
  pendingArea = null;
  currentArea = area;
  if (s.musicMode !== 'area') return;
  const pool = areaTracks(area, s.musicSecrets);
  if (!pool.length || pool.includes(s.musicTrack)) return;
  // Somewhere new: start with a tune you haven't heard yet, if there is one.
  s.setMusicTrack(pool.find((i) => !s.musicHeard[TRACKS[i].id]) ?? pool[0]);
  if (playing && graph) {
    stop(0.5);
    nextAt = graph.ctx.currentTime + 1.2;
  }
}

let installed = false;
export function installMusic() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  seq = gameState().musicSeq;
  currentArea = null;
  followArea(true);
  const timer = window.setInterval(tick, 50);
  const unsubscribe = useGame.subscribe((s, prev) => {
    if (graph && s.musicVolume !== prev.musicVolume) {
      graph.music.gain.setTargetAtTime(volumeCurve(s.musicVolume), graph.ctx.currentTime, 0.05);
    }
    if (s.musicMode !== prev.musicMode) {
      currentArea = null;
      followArea(true);
    }
    if (s.musicSeq !== seq) {
      // Picked from the Music tab: cut to it now.
      seq = s.musicSeq;
      stop();
      nextAt = 0;
    }
  });
  return () => {
    installed = false;
    window.clearInterval(timer);
    unsubscribe();
    stop();
  };
}

/**
 * Drop the secret club track now (the basement's DJ decks): unlocks it if it
 * isn't yet, turns the sound on, and cuts to it. If it's already playing it
 * carries on rather than restarting. Returns the track's index.
 */
export function playSecretTrack(id: string = SECRET_TRACK) {
  const index = TRACKS.findIndex((t) => t.id === id);
  if (index < 0) return -1;
  gameState().unlockTrack(id);
  const s = gameState();
  const audible = s.plugins.sound && s.musicVolume > 0 && !s.musicPaused;
  if (!(audible && s.musicTrack === index && playing?.index === index)) s.playTrack(index);
  return index;
}
