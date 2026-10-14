/**
 * The soundtrack: original tunes in the spirit of the old MIDI score. Modal
 * melodies, harp arpeggios, a flute that can't stop being hopeful. They play in
 * this order and loop. Notation is described in `score.ts`.
 */
import { SongBuilder, type Song } from './score';

export interface TrackDef {
  id: string;
  name: string;
  /** Shown in the Music tab, like an unlock hint. */
  blurb: string;
  build: () => Song;
  /**
   * A secret: hidden from the Music tab (and skipping, shuffling, ::music) until
   * the player first walks into this place. Unlocks stick with the save.
   */
  secret?: string;
}

/** The club track under the Figma grove: unlocked by finding the basement. */
export const SECRET_TRACK = 'subpixel';

// ── Dot Grid Dawn ── G major, the login theme ───────────────────────────────
const DAWN_A = `
  D5 - B4 - G4 - B4 D5 | A4 - - - F#4 - A4 - | B4 - G4 - E4 - G4 B4 | E5 - D5 C5 - - r r |
  D5 - G5 - F#5 - E5 D5 | C5 - E5 - D5 - A4 - | B4 - - - G4 - A4 B4 | C5 - - - A4 - - - |`;
const DAWN_A2 = `
  D5 - B4 - G4 - B4 D5 | A4 - - - F#4 - A4 - | B4 - G4 - E4 - G4 B4 | E5 - D5 C5 - - r r |
  D5 - G5 - A5 - G5 F#5 | E5 - - - G5 - E5 - | D5 - C5 - B4 - A4 - | G4 - - - - - - - |`;
const DAWN_B = `
  G5 - F#5 E5 B4 - - - | C5 - D5 E5 G5 - - - | B5 - A5 G5 D5 - - - | F#5 - E5 F#5 A5 - - - |
  G5 - F#5 E5 B4 - E5 - | G5 - - - E5 - C5 - | E5 - D5 C5 A4 - B4 C5 | F#5 - E5 D5 C5 - A4 - |`;

function dotGridDawn() {
  const harp = { part: 'harp', pat: '01234321', unit: 0.5, oct: 3, vel: 0.55 };
  const bass = { part: 'bass', pat: 'R---F---', unit: 0.5, oct: 2, vel: 0.6 };
  const pad = { part: 'strings', pat: 'c-------', unit: 0.5, oct: 3, vel: 0.4 };
  const A = 'G | D/F# | Em | C | G | Am D | G | C D';
  const A2 = 'G | D/F# | Em | C | G | C | Am D | G';
  return new SongBuilder('Dot Grid Dawn', 88, 4, {
    flute: { inst: 'flute', gain: 0.9, pan: 0.1 },
    glock: { inst: 'glock', gain: 0.5, pan: 0.3 },
    harp: { inst: 'harp', pan: -0.3 },
    strings: { inst: 'strings', pan: 0.2 },
    bass: { inst: 'bass' },
  })
    .section('G | C', [harp])
    .section(A, [{ part: 'flute', mel: DAWN_A, unit: 0.5 }, harp, bass])
    .section(A2, [{ part: 'flute', mel: DAWN_A2, unit: 0.5 }, harp, bass, pad])
    .section('Em | C | G | D | Em | C | Am | D', [{ part: 'flute', mel: DAWN_B, unit: 0.5 }, harp, bass, pad])
    .section(A2, [{ part: 'flute', mel: DAWN_A2, unit: 0.5 }, { part: 'glock', mel: DAWN_A2, unit: 0.5, shift: 12, vel: 0.35 }, harp, bass, pad])
    .section('G | G', [
      { part: 'harp', pat: '01234567', unit: 0.5, oct: 3, vel: 0.5 },
      { part: 'strings', pat: 'c---------------', unit: 0.5, oct: 3, vel: 0.4 },
      { part: 'bass', pat: 'R---------------', unit: 0.5, oct: 2, vel: 0.5 },
    ])
    .build();
}

// ── Croissant Morning ── C major, breakfast in the kitchen ──────────────────
const CR_A = `
  E5 - G5 - C6 - G5 - | A5 - - G5 F5 - C5 - | D5 - G5 - B5 - A5 G5 | E5 - - - C5 - r r |
  C5 - E5 - A5 - G5 E5 | F5 - A5 - C6 - A5 F5 | G5 - F5 E5 D5 - B4 - | C5 - - - r r G4 - |`;
const CR_B = `
  A5 - A5 G5 F5 - A5 - | G5 - E5 - C5 - E5 - | F5 - A5 - C6 - D6 C6 | B5 - - - G5 - - - |
  E5 - G5 - B5 - G5 - | A5 - E5 - C5 - E5 - | D5 - F5 - A5 - F5 D5 | B4 - D5 - G5 - F5 - |`;

function croissantMorning() {
  const band = [
    { part: 'lute', pat: '.c.c.c.c', unit: 0.5, oct: 4, vel: 0.45 },
    { part: 'bass', pat: 'R.F.O.F.', unit: 0.5, oct: 2, vel: 0.6 },
    { part: 'shaker', pat: 'xXxXxXxX', unit: 0.5, oct: 4, vel: 0.35 },
    { part: 'drum', pat: 'X..x..x.', unit: 0.5, oct: 4, vel: 0.5 },
  ];
  const A = 'C | F | G | C | Am | F | G | C';
  const B = 'F | C | F | G | Em | Am | Dm | G7';
  return new SongBuilder('Croissant Morning', 116, 4, {
    clarinet: { inst: 'clarinet', pan: -0.15 },
    flute: { inst: 'flute', gain: 0.85, pan: 0.2 },
    lute: { inst: 'lute', pan: 0.35 },
    bass: { inst: 'bass' },
    shaker: { inst: 'shaker', pan: -0.4 },
    drum: { inst: 'drum', pan: 0.1 },
  })
    .section('C | G', band)
    .section(A, [{ part: 'clarinet', mel: CR_A, unit: 0.5 }, ...band])
    .section(B, [{ part: 'flute', mel: CR_B, unit: 0.5 }, ...band])
    .section(A, [{ part: 'clarinet', mel: CR_A, unit: 0.5 }, { part: 'flute', mel: CR_A, unit: 0.5, vel: 0.5 }, ...band])
    .section(B, [{ part: 'clarinet', mel: CR_B, unit: 0.5 }, ...band])
    .section(A, [{ part: 'clarinet', mel: CR_A, unit: 0.5 }, { part: 'flute', mel: CR_A, unit: 0.5, vel: 0.5 }, ...band])
    .section('C', [
      { part: 'clarinet', pat: 'c-------', unit: 0.5, oct: 4, vel: 0.5 },
      { part: 'lute', pat: 'c-------', unit: 0.5, oct: 4, vel: 0.5 },
      { part: 'bass', pat: 'R-------', unit: 0.5, oct: 2, vel: 0.6 },
      { part: 'drum', pat: 'X.......', unit: 0.5, oct: 4, vel: 0.5 },
    ])
    .build();
}

// ── Bézier Waltz ── A minor, 3/4 ─────────────────────────────────────────────
const WALTZ_A = `
  E5 - - | A5 G5 E5 | F5 - - | D5 E5 F5 | G5 - D5 | B4 - - | C5 D5 E5 | B4 - G#4 |
  A4 - - | C5 B4 A4 | D5 - F5 | A5 - F5 | C6 - A5 | B5 - G#5 | A5 - - | - - r |`;
const WALTZ_B = `
  E5 - - - G5 - | D5 - - - B4 - | C5 - E5 - A5 - | G5 - - - - - |
  A5 - G5 F5 C5 - | E5 - - - G5 - | F5 - E5 D5 A4 - | G#4 - B4 - E5 - |`;

function bezierWaltz() {
  const oompah = [
    { part: 'harp', pat: '.cc', unit: 1, oct: 3, vel: 0.45 },
    { part: 'bass', pat: 'R..', unit: 1, oct: 2, vel: 0.65 },
  ];
  const pad = { part: 'strings', pat: 'c--', unit: 1, oct: 3, vel: 0.35 };
  const A = 'Am | Am | Dm | Dm | G | G | C | E | Am | Am | Dm | Dm | F | E | Am | Am';
  const B = 'C | G/B | Am | Em | F | C | Dm | E';
  return new SongBuilder('Bézier Waltz', 150, 3, {
    fiddle: { inst: 'fiddle', pan: -0.1 },
    cello: { inst: 'fiddle', gain: 0.8, pan: -0.35 },
    flute: { inst: 'flute', gain: 0.85, pan: 0.2 },
    glock: { inst: 'glock', gain: 0.45, pan: 0.35 },
    harp: { inst: 'harp', pan: 0.25 },
    strings: { inst: 'strings', gain: 0.8 },
    bass: { inst: 'bass' },
  })
    .section('Am | Am', oompah)
    .section(A, [{ part: 'fiddle', mel: WALTZ_A, unit: 1 }, ...oompah])
    .section(B, [{ part: 'flute', mel: WALTZ_B, unit: 0.5 }, ...oompah, pad])
    .section(A, [{ part: 'flute', mel: WALTZ_A, unit: 1 }, { part: 'cello', mel: WALTZ_A, unit: 1, shift: -12, vel: 0.55 }, ...oompah])
    .section(B, [{ part: 'fiddle', mel: WALTZ_B, unit: 0.5 }, ...oompah, pad])
    .section(A, [{ part: 'fiddle', mel: WALTZ_A, unit: 1 }, { part: 'glock', mel: WALTZ_A, unit: 1, shift: 12, vel: 0.3 }, ...oompah, pad])
    .section('Am', [
      { part: 'harp', pat: '012345', unit: 0.5, oct: 3, vel: 0.5 },
      { part: 'strings', pat: 'c--', unit: 1, oct: 3, vel: 0.4 },
      { part: 'bass', pat: 'R--', unit: 1, oct: 2, vel: 0.6 },
    ])
    .build();
}

// ── Pixel Lavender ── E dorian, the courtyard at dusk ───────────────────────
const LAV_A = `
  E6 - - - B5 - - - | C#6 - - - A5 - E5 - | G5 - B5 - D6 - - - | C#6 - - - - - - - |
  B5 - - - G5 - E5 - | D6 - - - B5 - - - | C6 - B5 - A5 - G5 - | E5 - - - D#5 - - - |`;
const LAV_B = `
  G5 - - - - - E5 - | F#5 - - - A5 - - - | D5 - - - F#5 - B5 - | G5 - - - - - - - |
  E5 - - - G5 - C6 - | A5 - - - F#5 - - - | B5 - - - D6 - B5 - | A5 - - - F#5 - D#5 - |`;

function pixelLavender() {
  const harp = { part: 'harp', pat: '01243421', unit: 0.5, oct: 3, vel: 0.45 };
  const pad = { part: 'strings', pat: 'c-------', unit: 0.5, oct: 3, vel: 0.35 };
  const bass = { part: 'bass', pat: 'R-------', unit: 0.5, oct: 2, vel: 0.5 };
  const A = 'Em7 | A | Em7 | A | Cmaj7 | G | Am7 | Bsus4 B';
  const B = 'Cmaj7 | D | Bm7 | Em | Am7 | D | G | B7';
  return new SongBuilder('Pixel Lavender', 72, 4, {
    glock: { inst: 'glock', pan: 0.25 },
    flute: { inst: 'flute', gain: 0.85, pan: -0.1 },
    harp: { inst: 'harp', pan: -0.3 },
    strings: { inst: 'strings' },
    bass: { inst: 'bass', gain: 0.8 },
  })
    .section('Em7 | Em7', [harp])
    .section(A, [{ part: 'glock', mel: LAV_A, unit: 0.5 }, harp, pad])
    .section(B, [{ part: 'flute', mel: LAV_B, unit: 0.5 }, harp, pad, bass])
    .section(A, [{ part: 'glock', mel: LAV_A, unit: 0.5 }, { part: 'flute', mel: LAV_A, unit: 0.5, shift: -12, vel: 0.5 }, harp, pad, bass])
    .section('Em7 | Em7', [
      harp,
      { part: 'strings', pat: 'c---------------', unit: 0.5, oct: 3, vel: 0.35 },
      { part: 'glock', mel: 'B5 - - - E6 - - - | - - - - - - - - |', unit: 0.5, vel: 0.6 },
    ])
    .build();
}

// ── Ninety-Nine Cats ── F major, pizzicato paws ─────────────────────────────
const CATS_A = `
  C5 r F5 r A5 - G5 F5 | D5 r F5 r A5 - - - | Bb4 r D5 r G5 - F5 D5 | E5 - - - C5 - r r |
  C5 r F5 r A5 - C6 A5 | Bb5 - - - F5 - D5 - | E5 - G5 - Bb5 - G5 E5 | F5 - - - r r r r |`;
const CATS_B = `
  D6 - - C6 Bb5 - F5 - | A5 - - G5 F5 - C5 - | Bb5 - - A5 G5 - D5 - | G5 - - - E5 - - - |
  C6 - - B5 A5 - E5 - | F5 - - E5 D5 - A5 - | B5 - - A5 G5 - F5 - | E5 - - - G5 - Bb5 - |`;

function ninetyNineCats() {
  const band = [
    { part: 'bass', pat: 'R.T.F.T.', unit: 0.5, oct: 2, vel: 0.65 },
    { part: 'lute', pat: '.c.c.c.c', unit: 0.5, oct: 4, vel: 0.35 },
    { part: 'tick', pat: '..x...x.', unit: 0.5, oct: 4, vel: 0.4 },
  ];
  const A = 'F | Dm | Gm | C7 | F | Bb | C7 | F';
  const B = 'Bb | F | Gm | C | Am | Dm | G7 | C7';
  return new SongBuilder('Ninety-Nine Cats', 104, 4, {
    clarinet: { inst: 'clarinet', pan: -0.1 },
    glock: { inst: 'glock', pan: 0.25 },
    pizz: { inst: 'pizz', pan: 0.35 },
    lute: { inst: 'lute', pan: -0.35 },
    bass: { inst: 'bass' },
    tick: { inst: 'tick', pan: 0.15 },
  })
    .section('F | C7', band)
    .section(A, [{ part: 'clarinet', mel: CATS_A, unit: 0.5 }, ...band])
    .section(A, [{ part: 'clarinet', mel: CATS_A, unit: 0.5 }, { part: 'glock', mel: CATS_A, unit: 0.5, shift: 12, vel: 0.35 }, ...band])
    .section(B, [{ part: 'glock', mel: CATS_B, unit: 0.5 }, { part: 'pizz', pat: '0.2.4.2.', unit: 0.5, oct: 4, vel: 0.5 }, ...band])
    .section(A, [{ part: 'clarinet', mel: CATS_A, unit: 0.5 }, ...band])
    .section('F', [
      { part: 'clarinet', mel: 'F5 r C5 r A4 r F4 r', unit: 0.5 },
      { part: 'pizz', pat: 'c.......', unit: 0.5, oct: 4, vel: 0.5 },
      { part: 'bass', pat: 'R.......', unit: 0.5, oct: 2, vel: 0.65 },
    ])
    .build();
}

// ── Perlin Bread Shanty ── D dorian, 6/8 ─────────────────────────────────────
const SH_A = `
  D5 - A4 D5 E5 F5 | E5 - C5 G4 - C5 | D5 - F5 A5 - F5 | E5 - - C5 - - |
  D5 - A4 D5 E5 F5 | G5 - E5 C5 - E5 | D5 - B4 G4 A4 B4 | D5 - - - - r |`;
const SH_B = `
  A5 - - F5 - A5 | G5 - - E5 - C5 | D5 - G5 B5 - G5 | A5 - - F5 - D5 |
  C6 - - A5 - F5 | E5 - G5 C6 - G5 | A5 - E5 D5 - B4 | D5 - - - - r |`;

function perlinBreadShanty() {
  const band = [
    { part: 'accordion', pat: '.cc.cc', unit: 1, oct: 4, vel: 0.4 },
    { part: 'bass', pat: 'R..F..', unit: 1, oct: 2, vel: 0.7 },
    { part: 'drum', pat: 'X..x..', unit: 1, oct: 4, vel: 0.55 },
    { part: 'shaker', pat: '..x..x', unit: 1, oct: 4, vel: 0.35 },
  ];
  const A = 'Dm | C | Dm | Am | Dm | C | G | Dm';
  const B = 'F | C | G | Dm | F | C | Am G | Dm';
  // Beats are quavers here: six to the bar, two lilting groups of three.
  return new SongBuilder('Perlin Bread Shanty', 228, 6, {
    fiddle: { inst: 'fiddle', pan: -0.15 },
    whistle: { inst: 'flute', gain: 0.6, pan: 0.25 },
    accordion: { inst: 'accordion', pan: 0.3 },
    bass: { inst: 'bass' },
    drum: { inst: 'drum' },
    shaker: { inst: 'shaker', pan: -0.4 },
  })
    .section('Dm | Dm', band)
    .section(A, [{ part: 'fiddle', mel: SH_A, unit: 1 }, ...band])
    .section(A, [{ part: 'whistle', mel: SH_A, unit: 1, shift: 12 }, ...band])
    .section(B, [{ part: 'fiddle', mel: SH_B, unit: 1 }, { part: 'whistle', mel: SH_B, unit: 1, vel: 0.6 }, ...band])
    .section(A, [{ part: 'fiddle', mel: SH_A, unit: 1 }, ...band])
    .section(B, [{ part: 'fiddle', mel: SH_B, unit: 1 }, { part: 'whistle', mel: SH_B, unit: 1, shift: 12, vel: 0.5 }, ...band])
    .section('Dm', [
      { part: 'accordion', pat: 'c-----', unit: 1, oct: 4, vel: 0.45 },
      { part: 'bass', pat: 'R-----', unit: 1, oct: 2, vel: 0.7 },
      { part: 'drum', pat: 'X.....', unit: 1, oct: 4, vel: 0.6 },
      { part: 'fiddle', mel: 'D5 - - - - -', unit: 1 },
    ])
    .build();
}

// ── Node Garden ── D minor, wires across the water ──────────────────────────
const NG_A = `
  A4 - - - D5 - - - | F5 - - - D5 - Bb4 - | C5 - - - E5 - G5 - | F5 - - - - - - - |
  A4 - D5 - F5 - A5 - | Bb5 - - - A5 - F5 - | G5 - - - E5 - C5 - | C#5 - - - E5 - A4 - |`;
const NG_B = `
  C5 - F5 - A5 - - - | G5 - - - E5 - C5 - | D5 - F5 - Bb5 - - - | A5 - - - - - - - |
  G5 - Bb5 - D6 - - - | A5 - - - F5 - D5 - | F5 - - - D5 - Bb4 - | A4 - C#5 - E5 - - - |`;

function nodeGarden() {
  const pad = { part: 'strings', pat: 'c-------', unit: 0.5, oct: 3, vel: 0.4 };
  const pizz = { part: 'pizz', pat: '01210121', unit: 0.5, oct: 3, vel: 0.5 };
  const timp = { part: 'timpani', pat: 'R.......', unit: 0.5, oct: 2, vel: 0.6 };
  const A = 'Dm | Bb | C | Dm | Dm | Bb | C | A';
  const B = 'F | C | Bb | F | Gm | Dm | Bb | A';
  return new SongBuilder('Node Garden', 96, 4, {
    horn: { inst: 'horn', pan: -0.1 },
    flute: { inst: 'flute', gain: 0.6, pan: 0.3 },
    strings: { inst: 'strings', pan: 0.15 },
    pizz: { inst: 'pizz', pan: 0.35 },
    harp: { inst: 'harp', pan: -0.3 },
    bass: { inst: 'bass' },
    timpani: { inst: 'timpani' },
  })
    .section('Dm | Dm', [{ part: 'timpani', pat: 'RRRRRRRRRRRRRRRR', unit: 0.25, oct: 2, vel: 0.35 }, pad])
    .section(A, [{ part: 'horn', mel: NG_A, unit: 0.5 }, pizz, pad, timp])
    .section(B, [
      { part: 'horn', mel: NG_B, unit: 0.5 },
      { part: 'harp', pat: '01234321', unit: 0.5, oct: 3, vel: 0.45 },
      { part: 'bass', pat: 'R---F---', unit: 0.5, oct: 2, vel: 0.6 },
      pad,
      timp,
    ])
    .section(A, [{ part: 'horn', mel: NG_A, unit: 0.5 }, { part: 'flute', mel: NG_A, unit: 0.5, shift: 12, vel: 0.45 }, pizz, pad, timp])
    .section('Dm', [
      { part: 'horn', mel: 'D5 - - - - - - -', unit: 0.5 },
      { part: 'strings', pat: 'c-------', unit: 0.5, oct: 3, vel: 0.45 },
      { part: 'timpani', pat: 'RRRRRRRRRRRRRRRR', unit: 0.25, oct: 2, vel: 0.35 },
    ])
    .build();
}

// ── Subpixel ── F phrygian, 124 bpm, RESET's floor under the grove ──────────
// Dark and hypnotic, not a festival: a kick with a concrete rumble rolling off
// it, a sub that barely moves (the root, and the flat second when it turns), one
// acid note growling behind a filter that only ever half opens, and a dub chord
// somewhere far off down the tunnel. Things arrive and leave every 16 bars.
const ACID_A = 'F2 - r F2 r F2 F2 r F2 - r F2 r F2 Gb2 r';
const ACID_B = 'F2 - r F2 r F2 F1 r F2 - r F2 r Gb2 - F2';
const acidBars = (...bars: string[]) => bars.join(' | ') + ' |';

function subpixel() {
  const kick = { part: 'kick', pat: 'X...', unit: 0.25, oct: 4, vel: 0.72 };
  const rumble = (vel: number) => ({ part: 'rumble', pat: 'R...', unit: 0.25, oct: 1, vel });
  // Long offbeat sub: in on the "and", held to the next kick.
  const sub = (vel: number) => ({ part: 'sub', pat: '..R-', unit: 0.25, oct: 1, vel });
  const hats = (vel: number) => ({ part: 'hat', pat: 'x.xx', unit: 0.25, oct: 4, vel });
  const ride = (vel: number) => ({ part: 'ride', pat: '..x.', unit: 0.25, oct: 4, vel });
  const rim = (vel: number) => ({ part: 'rim', pat: '....x.......x...', unit: 0.25, oct: 4, vel });
  // One chord every two bars, left to echo.
  const dub = (vel: number) => ({ part: 'dub', pat: '..c.............................', unit: 0.25, oct: 3, vel });
  // Velocity is the acid's filter: it creeps open over the track and closes again.
  const acid = (vel: number) => ({ part: 'acid', mel: acidBars(ACID_A, ACID_A, ACID_A, ACID_B), unit: 0.25, vel });

  const PEDAL = 'Fm | Fm | Fm | Fm';
  // The only movement: half a bar on the flat second, every four.
  const TURN = 'Fm | Fm | Fm | Fm Gbsus2';
  return new SongBuilder('Subpixel', 124, 4, {
    kick: { inst: 'kick', dry: true },
    rumble: { inst: 'rumble', dry: true },
    sub: { inst: 'sub', dry: true },
    acid: { inst: 'acid', pan: -0.1, duck: 0.3 },
    dub: { inst: 'dub', pan: 0.25, duck: 0.4 },
    hat: { inst: 'hat', pan: 0.2, swing: 0.22 },
    ride: { inst: 'ride', pan: -0.25 },
    rim: { inst: 'rim', pan: 0.1 },
  })
    .section(PEDAL, [kick, rumble(0.55), hats(0.3)], 2)
    .section(PEDAL, [kick, rumble(0.7), hats(0.36), ride(0.3)], 2)
    .section(TURN, [kick, rumble(0.8), hats(0.4), ride(0.34), sub(0.5), acid(0.26)], 2)
    .section(TURN, [kick, rumble(0.8), hats(0.4), ride(0.36), sub(0.62), acid(0.34), dub(0.5)], 2)
    .section(TURN, [kick, rumble(0.8), hats(0.42), ride(0.4), sub(0.66), acid(0.42), dub(0.55), rim(0.45)], 2)
    .section(TURN, [kick, rumble(0.85), hats(0.45), ride(0.42), sub(0.7), acid(0.5), dub(0.6), rim(0.5)], 2)
    .section(TURN, [kick, rumble(0.8), hats(0.4), ride(0.36), sub(0.62), acid(0.4), dub(0.45), rim(0.42)], 2)
    .section(PEDAL, [kick, rumble(0.65), hats(0.3), ride(0.26), dub(0.35)], 2)
    .section('Fm', [
      { part: 'kick', pat: 'X...............', unit: 0.25, oct: 4, vel: 0.72 },
      { part: 'rumble', pat: 'R...............', unit: 0.25, oct: 1, vel: 0.6 },
    ])
    .build();
}

export const TRACKS: TrackDef[] = [
  { id: 'dot-grid-dawn', name: 'Dot Grid Dawn', blurb: 'Plays on login. A blank canvas and the whole day ahead.', build: dotGridDawn },
  { id: 'croissant-morning', name: 'Croissant Morning', blurb: 'Breakfast in the kitchen, crumbs on the shirt.', build: croissantMorning },
  { id: 'bezier-waltz', name: 'Bézier Waltz', blurb: 'Handles out. One, two, three.', build: bezierWaltz },
  { id: 'pixel-lavender', name: 'Pixel Lavender', blurb: 'The courtyard beds at dusk.', build: pixelLavender },
  { id: 'ninety-nine-cats', name: 'Ninety-Nine Cats', blurb: 'Skillcape not included. (It is.)', build: ninetyNineCats },
  { id: 'perlin-bread-shanty', name: 'Perlin Bread Shanty', blurb: 'Never the same loaf twice.', build: perlinBreadShanty },
  { id: 'node-garden', name: 'Node Garden', blurb: 'Wires across the water.', build: nodeGarden },
  { id: SECRET_TRACK, name: 'Subpixel', blurb: 'Felt through the concrete before you hear it. 124 bpm.', build: subpixel, secret: 'basement' },
];

/**
 * Where each track plays in Area mode, like the game's music regions. An island
 * zone with its own list takes over while you stand in it; off-zone (the roads,
 * the beach) the place's list carries on, so walking out of a grove doesn't cut
 * the tune. Every zone track is also in its place's list for the same reason.
 */
const AREA_MUSIC: Record<string, string[]> = {
  house: ['dot-grid-dawn', 'croissant-morning', 'ninety-nine-cats', 'perlin-bread-shanty'],
  island: ['node-garden', 'bezier-waltz', 'pixel-lavender'],
  'zone:spawn': ['node-garden'],
  'zone:modyfi': ['bezier-waltz'],
  'zone:garden': ['pixel-lavender'],
  'zone:ring': ['pixel-lavender'],
  basement: [SECRET_TRACK],
};

const AREA_NAMES: Record<string, string> = { house: 'the house', island: 'the island', basement: 'the basement' };

const indexById = new Map(TRACKS.map((t, i) => [t.id, i]));
const indices = (ids: string[]) => ids.flatMap((id) => (indexById.has(id) ? [indexById.get(id)!] : []));

/** The area key for a place and zone: an island zone with its own music, else the place. */
export function musicArea(location: string, zoneId: string | null) {
  return zoneId && AREA_MUSIC[`zone:${zoneId}`] ? `zone:${zoneId}` : location;
}

/** Unlocked secret tracks, by id (`musicSecrets` in the save). */
export type TrackUnlocks = Record<string, true>;

/** A secret track the player hasn't found yet: not listed, not playable, never skipped to. */
export function trackLocked(index: number, unlocked: TrackUnlocks) {
  const track = TRACKS[index];
  return !!track?.secret && !unlocked[track.id];
}

/** Track indices that belong to an area (locked secrets left out). Empty means "anything goes". */
export function areaTracks(area: string, unlocked: TrackUnlocks) {
  const ids = AREA_MUSIC[area] ?? AREA_MUSIC[area.startsWith('zone:') ? 'island' : area] ?? [];
  return indices(ids).filter((i) => !trackLocked(i, unlocked));
}

/** Where a track can be heard, for the Music tab: "the house", "Modyfi Grove". */
export function trackAreas(index: number, zoneName: (id: string) => string | undefined) {
  const id = TRACKS[index]?.id;
  return Object.entries(AREA_MUSIC)
    .filter(([, ids]) => ids.includes(id))
    .map(([area]) => (area.startsWith('zone:') ? zoneName(area.slice(5)) ?? area.slice(5) : AREA_NAMES[area] ?? area));
}

export type MusicMode = 'area' | 'sequence' | 'shuffle' | 'loop';

/**
 * The track after (or before) `index`. Loop only repeats when a track ends on
 * its own; Area cycles through the current area's tracks.
 */
export function nextTrack(index: number, mode: MusicMode, dir: 1 | -1 = 1, ended = false, area?: string, unlocked: TrackUnlocks = {}) {
  if (mode === 'loop' && ended && !trackLocked(index, unlocked)) return index;
  const pool = mode === 'area' && area ? areaTracks(area, unlocked) : [];
  const list = pool.length ? pool : TRACKS.flatMap((_, i) => (trackLocked(i, unlocked) ? [] : [i]));
  const n = list.length;
  const at = list.indexOf(index);
  if (mode === 'shuffle' && n > 1) {
    const r = Math.floor(Math.random() * (n - 1));
    return list[r >= at ? r + 1 : r];
  }
  if (at < 0) return list[0];
  return list[(at + dir + n) % n];
}
