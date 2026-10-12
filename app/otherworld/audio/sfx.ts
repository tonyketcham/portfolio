'use client';

/**
 * Every sound is synthesised on the fly with WebAudio. No samples, no
 * downloads. Silent until the Sound plugin is on and the page has had a gesture.
 */
import { on, type SfxName } from '../state/events';
import { gameState } from '../state/store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, when = 0) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, filter: BiquadFilterType, from: number, to: number, when = 0) {
  const c = audio();
  if (!c || !master || !noiseBuffer) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const lastPlayed = new Map<string, number>();

function play(name: SfxName, pitch = 1) {
  const now = performance.now();
  const minGap = name === 'step' ? 60 : name === 'xp' ? 40 : 25;
  if (now - (lastPlayed.get(name) ?? 0) < minGap) return;
  lastPlayed.set(name, now);
  const p = pitch;
  switch (name) {
    case 'click':
      tone('square', 880 * p, 700 * p, 0.035, 0.035);
      break;
    case 'menu':
      tone('square', 660, 660, 0.03, 0.03);
      tone('square', 990, 990, 0.04, 0.03, 0.035);
      break;
    case 'step':
      noise(0.05, 0.05, 'lowpass', 500 * p, 180 * p);
      break;
    case 'xp':
      tone('sine', 1318, 1318, 0.25, 0.05);
      tone('sine', 1975, 1975, 0.18, 0.025, 0.01);
      break;
    case 'levelup': {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => tone('triangle', f, f, 0.16, 0.08, i * 0.09));
      [523.25, 659.25, 783.99].forEach((f) => tone('triangle', f, f, 0.9, 0.05, notes.length * 0.09));
      break;
    }
    case 'pickup':
      tone('square', 440, 880, 0.07, 0.04);
      break;
    case 'drop':
      tone('square', 400, 140, 0.09, 0.04);
      break;
    case 'drink':
      for (let i = 0; i < 4; i++) noise(0.08, 0.05, 'bandpass', 700 + i * 120, 400, i * 0.09);
      break;
    case 'boing':
      tone('sine', 180 * p, 620 * p, 0.12, 0.08);
      tone('sine', 620 * p, 260 * p, 0.25, 0.06, 0.1);
      break;
    case 'cut':
      noise(0.2, 0.08, 'highpass', 6000, 400);
      tone('square', 600, 200, 0.12, 0.03);
      break;
    case 'paste':
      noise(0.18, 0.07, 'highpass', 400, 6000);
      tone('square', 200, 700, 0.12, 0.03);
      break;
    case 'rewind':
      for (let i = 0; i < 10; i++) tone('sawtooth', 900 - i * 60, 700 - i * 60, 0.09, 0.025, i * 0.1);
      noise(1.1, 0.04, 'bandpass', 3000, 600);
      break;
    case 'error':
      tone('square', 140, 110, 0.14, 0.05);
      break;
    case 'unfold':
      noise(2.4, 0.08, 'bandpass', 200, 4000);
      tone('sine', 110, 440, 2.2, 0.05);
      tone('triangle', 220, 880, 2.4, 0.03, 0.2);
      break;
    case 'kick':
      tone('sine', 160, 42, 0.14, 0.22);
      noise(0.015, 0.08, 'highpass', 2000, 2000);
      break;
    case 'pop':
      tone('sine', 600 * p, 1300 * p, 0.05, 0.06);
      break;
    case 'hammer':
      // tok… tok… tok: three wooden knocks
      for (let i = 0; i < 3; i++) {
        tone('square', 330 * p, 140 * p, 0.05, 0.06, i * 0.16);
        noise(0.04, 0.06, 'bandpass', 2200, 900, i * 0.16);
      }
      break;
    case 'saw':
      for (let i = 0; i < 4; i++) noise(0.12, 0.05, 'bandpass', 1800 + (i % 2) * 900, 1200, i * 0.13);
      break;
    case 'thunk':
      tone('sine', 120 * p, 50 * p, 0.18, 0.18);
      noise(0.06, 0.05, 'lowpass', 900, 200);
      break;
    case 'portal':
      tone('sine', 220, 880, 0.6, 0.05);
      tone('triangle', 330, 1320, 0.7, 0.03, 0.05);
      noise(0.8, 0.04, 'bandpass', 800, 5000);
      break;
    case 'bell':
      [1568, 2093, 1568].forEach((f, i) => tone('sine', f, f * 0.99, 0.6, 0.05, i * 0.22));
      break;
    case 'kettle':
      noise(1.6, 0.05, 'bandpass', 2400, 5200);
      tone('sine', 1400, 1900, 1.4, 0.015, 0.4);
      break;
  }
}

let installed = false;
export function installSfx() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const unlock = () => {
    if (gameState().plugins.sound) audio()?.resume().catch(() => undefined);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const off = on((e) => {
    if (e.type !== 'sfx' || !gameState().plugins.sound) return;
    const c = audio();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => undefined);
    try {
      play(e.name, e.pitch);
    } catch {
      /* never let a blip break the game */
    }
  });
  return () => {
    installed = false;
    off();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}
