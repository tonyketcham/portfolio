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
import { audioBus } from './sfx';
import { TRACKS, nextTrack } from './tracks';

/** Seconds of notes queued ahead of the clock (longer when the tab is hidden and timers slow down). */
const LOOKAHEAD = 0.3;
const HIDDEN_LOOKAHEAD = 1.5;
/** Seconds after the last note before the track counts as over (lets the reverb ring out). */
const TAIL = 2.5;
/** Silence between tracks. */
const GAP = 1.2;

interface Graph {
  ctx: AudioContext;
  music: GainNode;
  noise: AudioBuffer;
}

interface Playing {
  index: number;
  song: Song;
  start: number;
  cursor: number;
  out: GainNode;
  parts: AudioNode[];
}

let graph: Graph | null = null;
let playing: Playing | null = null;
let nextAt = 0;
let seq = -1;
let lastResume = 0;
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
  music.connect(send).connect(reverb).connect(bus);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  graph = { ctx, music, noise };
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

function voice(g: Graph, inst: Inst, dest: AudioNode, t: number, d: number, m: number, v: number) {
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
  }
}

// ── transport ────────────────────────────────────────────────────────────────
function partBus(g: Graph, def: PartDef, dest: AudioNode) {
  const gain = gainNode(g.ctx, dest, def.gain ?? 1);
  if (!def.pan) return gain;
  const pan = g.ctx.createStereoPanner();
  pan.pan.value = def.pan;
  pan.connect(gain);
  return pan;
}

function start(g: Graph, index: number) {
  const song = songFor(index);
  const out = gainNode(g.ctx, g.music, 1);
  playing = {
    index,
    song,
    start: g.ctx.currentTime + 0.1,
    cursor: 0,
    out,
    parts: song.parts.map((def) => partBus(g, def, out)),
  };
  gameState().hearTrack(index);
}

function stop(fade = 0.12) {
  if (!playing || !graph) return;
  const { out } = playing;
  out.gain.setTargetAtTime(0, graph.ctx.currentTime, fade);
  window.setTimeout(() => out.disconnect(), fade * 8000 + 200);
  playing = null;
}

function wanted() {
  const s = gameState();
  return s.plugins.sound && s.musicVolume > 0 && !s.musicPaused;
}

function tick() {
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
  const horizon = now + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  const { events, parts } = p.song;
  while (p.cursor < events.length && p.start + events[p.cursor].t < horizon) {
    const e = events[p.cursor++];
    const at = Math.max(now, p.start + e.t);
    try {
      voice(g, parts[e.p].inst, p.parts[e.p], at, e.d, e.m, e.v);
    } catch {
      /* a voice that fails to build just doesn't sound */
    }
  }
  if (p.cursor >= events.length && now > p.start + p.song.length + TAIL) {
    const s = gameState();
    const next = nextTrack(p.index, s.musicMode, 1, true);
    stop(0.3);
    nextAt = now + GAP;
    s.setMusicTrack(next);
  }
}

let installed = false;
export function installMusic() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  seq = gameState().musicSeq;
  const timer = window.setInterval(tick, 50);
  const unsubscribe = useGame.subscribe((s, prev) => {
    if (graph && s.musicVolume !== prev.musicVolume) {
      graph.music.gain.setTargetAtTime(volumeCurve(s.musicVolume), graph.ctx.currentTime, 0.05);
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
