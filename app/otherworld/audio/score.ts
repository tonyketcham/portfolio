/**
 * A tiny score language for the soundtrack, so tunes read like sheet music
 * rather than arrays of numbers. Pure TS, no WebAudio: tracks compile to a flat
 * list of note events that `music.ts` plays.
 *
 * A song is a list of sections. Each section has a chord chart (bars split by
 * `|`, chords inside a bar share it equally) and layers that play over it:
 *
 *   - melody layers spell every note: `D5 - B4 G4 | A4 - - r`, one token per
 *     `unit` beats, `-` holds the previous note, `r` rests, `A4+C5` is a dyad.
 *   - pattern layers follow the chords: one character per `unit`, tiled over
 *     the section. `R` bass (slash-aware), `F` fifth, `O` octave, `T` third,
 *     `0`-`7` arpeggio tones, `c` the whole chord, `x` / `X` a soft / hard hit
 *     (drums), `-` hold, `.` rest. Held notes re-strike when the chord changes.
 */

export type Inst =
  | 'harp'
  | 'lute'
  | 'pizz'
  | 'glock'
  | 'flute'
  | 'clarinet'
  | 'fiddle'
  | 'strings'
  | 'accordion'
  | 'horn'
  | 'bass'
  | 'timpani'
  | 'drum'
  | 'shaker'
  | 'tick'
  // the club kit, for the track under the grove
  | 'kick'
  | 'rumble'
  | 'sub'
  | 'acid'
  | 'dub'
  | 'hat'
  | 'ride'
  | 'rim';

export interface PartDef {
  inst: Inst;
  gain?: number;
  /** -1 left … 1 right. */
  pan?: number;
  /** Skip the hall reverb (kicks and sub-bass turn to mud in it). */
  dry?: boolean;
  /** 0 … 1: how far this part ducks under each kick, for that pumping sidechain feel. */
  duck?: number;
  /** 0 … 1: push every off-beat sixteenth late by this much of a sixteenth (shuffle). */
  swing?: number;
}

/** A note, in seconds. `p` indexes the song's parts. */
export interface NoteEvent {
  t: number;
  d: number;
  m: number;
  v: number;
  p: number;
}

export interface Song {
  bpm: number;
  parts: PartDef[];
  events: NoteEvent[];
  /** Seconds until the last note is released (reverb tail not included). */
  length: number;
}

type Layer =
  | { part: string; mel: string; unit: number; shift?: number; vel?: number }
  | { part: string; pat: string; unit: number; oct: number; vel?: number };

interface Chord {
  sym: string;
  root: number;
  bass: number;
  intervals: number[];
  t: number;
  end: number;
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  add9: [0, 4, 7, 14],
};

function pitchClass(name: string) {
  const pc = PC[name[0]];
  if (pc === undefined) throw new Error(`[music] bad note ${name}`);
  return (pc + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
}

/** `F#4` → 66. */
export function midi(name: string) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`[music] bad note ${name}`);
  return 12 * (Number(m[2]) + 1) + pitchClass(m[1]);
}

function parseChord(symbol: string, t: number, end: number): Chord {
  const m = /^([A-G][#b]?)(maj7|m7|m|7|sus2|sus4|dim|add9)?(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error(`[music] bad chord ${symbol}`);
  const root = pitchClass(m[1]);
  return { sym: symbol, root, bass: m[3] ? pitchClass(m[3]) : root, intervals: QUALITIES[m[2] ?? ''], t, end };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export class SongBuilder {
  private parts: PartDef[] = [];
  private index = new Map<string, number>();
  private events: NoteEvent[] = [];
  private cursor = 0;
  private sections = 0;
  private name: string;
  private bpm: number;
  private beatsPerBar: number;

  constructor(name: string, bpm: number, beatsPerBar: number, parts: Record<string, PartDef>) {
    this.name = name;
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    for (const [key, def] of Object.entries(parts)) {
      this.index.set(key, this.parts.length);
      this.parts.push(def);
    }
  }

  section(chart: string, layers: Layer[], times = 1) {
    for (let i = 0; i < times; i++) this.addSection(chart, layers);
    return this;
  }

  private addSection(chart: string, layers: Layer[]) {
    const bpb = this.beatsPerBar;
    const bars = chart.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
    const chords: Chord[] = [];
    bars.forEach((bar, i) => {
      const step = bpb / bar.length;
      bar.forEach((sym, j) => chords.push(parseChord(sym, i * bpb + j * step, i * bpb + (j + 1) * step)));
    });
    const length = bars.length * bpb;
    const at = (t: number) => chords.find((c) => t >= c.t - 1e-6 && t < c.end - 1e-6) ?? chords[chords.length - 1];
    const label = `${this.name} §${this.sections + 1}`;

    for (const layer of layers) {
      const p = this.index.get(layer.part);
      if (p === undefined) throw new Error(`[music] ${label}: no part "${layer.part}"`);
      const vel = layer.vel ?? 0.8;
      if ('mel' in layer) this.melody(p, layer.mel, layer.unit, layer.shift ?? 0, vel, length, label);
      else this.pattern(p, layer.pat, layer.unit, layer.oct, vel, length, at);
    }
    this.cursor += length;
    this.sections++;
  }

  private push(p: number, t: number, d: number, m: number, v: number) {
    // Downbeats lean a little, like a player would.
    const accent = near(t % this.beatsPerBar, 0) || near(t % this.beatsPerBar, this.beatsPerBar) ? 1.1 : 1;
    this.events.push({ t: this.cursor + t, d, m, v: Math.min(1, v * accent), p });
  }

  private melody(p: number, src: string, unit: number, shift: number, vel: number, length: number, label: string) {
    let t = 0;
    let held: { t: number; d: number; notes: number[] } | null = null;
    const flush = () => {
      if (held) for (const m of held.notes) this.push(p, held.t, held.d, m + shift, vel);
      held = null;
    };
    for (const tok of src.split(/\s+/).filter(Boolean)) {
      if (tok === '|') {
        if (!near(t % this.beatsPerBar, 0)) console.warn(`[music] ${label}: bar line at beat ${t}`);
        continue;
      }
      if (tok === '-') {
        if (held) held.d += unit;
      } else if (tok === 'r' || tok === '.') {
        flush();
      } else {
        flush();
        held = { t, d: unit, notes: tok.split('+').map(midi) };
      }
      t += unit;
    }
    flush();
    if (!near(t, length)) console.warn(`[music] ${label}: melody is ${t} beats, section is ${length}`);
  }

  private pattern(p: number, src: string, unit: number, oct: number, vel: number, length: number, at: (t: number) => Chord) {
    const steps = src.replace(/[\s|]/g, '');
    let held: { t: number; d: number; sym: string; chord: Chord } | null = null;
    const flush = () => {
      if (!held) return;
      for (const m of this.resolve(held.sym, held.chord, oct)) this.push(p, held.t, held.d, m, held.sym === 'X' ? vel * 1.25 : held.sym === 'x' ? vel * 0.7 : vel);
      held = null;
    };
    for (let i = 0, t = 0; t < length - 1e-6; i++, t += unit) {
      const sym = steps[i % steps.length];
      const chord = at(t);
      if (sym === '-') {
        if (!held) continue;
        if (held.chord.sym === chord.sym) {
          held.d += unit;
          continue;
        }
        // The harmony moved under a held note: strike it again in the new chord.
        const again: string = held.sym;
        flush();
        held = { t, d: unit, sym: again, chord };
      } else if (sym === '.') {
        flush();
      } else {
        flush();
        held = { t, d: unit, sym, chord };
      }
    }
    flush();
  }

  private resolve(sym: string, c: Chord, oct: number): number[] {
    const base = 12 * (oct + 1);
    const root = base + c.root;
    const [, third, fifth, seventh] = c.intervals;
    switch (sym) {
      case 'R':
        return [base + c.bass];
      case 'F':
        return [root + fifth];
      case 'O':
        return [root + 12];
      case 'T':
        return [root + third];
      case 'c':
        return c.intervals.map((i) => root + i);
      case 'x':
      case 'X':
        return [60];
    }
    const arp = [root, root + fifth, root + 12, root + 12 + third, root + 12 + fifth, seventh ? root + 12 + seventh : root + 24, root + 24 + third, root + 24 + fifth];
    const n = Number(sym);
    if (Number.isInteger(n) && n >= 0 && n < arp.length) return [arp[n]];
    throw new Error(`[music] bad pattern step "${sym}"`);
  }

  build(): Song {
    const spb = 60 / this.bpm;
    const events = this.events
      .map((e) => ({ ...e, t: e.t * spb, d: e.d * spb }))
      .sort((a, b) => a.t - b.t);
    return { bpm: this.bpm, parts: this.parts, events, length: this.cursor * spb };
  }
}
