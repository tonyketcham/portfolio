/**
 * A visitor-made creature is just this: a small bag of knobs. Everything else
 * (the mesh, the shader skin, the walk, the small talk) is grown from it, so a
 * creature survives in a save as a few hundred bytes.
 */
import { hashString, mulberry32 } from '../lib/random';
import type { PlaceId } from '../world/places';

/** The lab's gearbox. N parks it; R makes it moonwalk. */
export type Gear = 'R' | 'N' | 1 | 2 | 3 | 4 | 5;
const GEAR_LIST: Gear[] = ['R', 'N', 1, 2, 3, 4, 5];
/** Walking speed (0 … 1) for each gear. */
export const GEAR_SPEED: Record<string, number> = { R: 0.35, N: 0.3, 1: 0.05, 2: 0.3, 3: 0.5, 4: 0.75, 5: 1 };
export const gearForSpeed = (speed: number): Gear => (speed < 0.18 ? 1 : speed < 0.4 ? 2 : speed < 0.62 ? 3 : speed < 0.87 ? 4 : 5);

export const BODIES = ['blob', 'bean', 'box', 'cone', 'gem', 'torus', 'totem', 'noodle', 'ico'] as const;
export const EYE_STYLES = ['round', 'stalk', 'visor', 'void'] as const;
export const MOUTHS = ['none', 'smile', 'o', 'zigzag', 'beak', 'fangs'] as const;
export const TOPPERS = ['none', 'antennae', 'horns', 'halo', 'cap', 'sprout', 'flame', 'cursor', 'tophat'] as const;
export const SKINS = ['clay', 'toon', 'holo', 'iridescent', 'goo', 'static', 'missing', 'disco', 'void', 'glitch'] as const;
export const GAITS = ['waddle', 'hop', 'float', 'scuttle', 'slither'] as const;
export const MOODS = ['cheerful', 'cryptic', 'grumpy', 'dramatic', 'anxious', 'philosophical'] as const;

export type Body = (typeof BODIES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type Mouth = (typeof MOUTHS)[number];
export type Topper = (typeof TOPPERS)[number];
export type Skin = (typeof SKINS)[number];
export type Gait = (typeof GAITS)[number];
export type Mood = (typeof MOODS)[number];

export const LABELS: Record<string, string> = {
  blob: 'Blob', bean: 'Bean', box: 'Rectangle', cone: 'Cone', gem: 'Gem', torus: 'Donut', totem: 'Totem', noodle: 'Noodle', ico: 'Polyhedron',
  round: 'Googly', stalk: 'Stalks', visor: 'Visor', void: 'Void',
  none: 'None', smile: 'Smile', o: 'O', zigzag: 'Zigzag', beak: 'Beak', fangs: 'Fangs',
  antennae: 'Antennae', horns: 'Horns', halo: 'Halo', cap: 'Amanita', sprout: 'Sprout', flame: 'Flame', cursor: 'Cursor', tophat: 'Top hat',
  clay: 'Clay', toon: 'Toon', holo: 'Hologram', iridescent: 'Iridescent', goo: 'Goo', static: 'TV static', missing: 'Missing texture',
  disco: 'Disco', glitch: 'Glitch',
  waddle: 'Waddle', hop: 'Hop', float: 'Float', scuttle: 'Scuttle', slither: 'Slither',
  cheerful: 'Cheerful', cryptic: 'Cryptic', grumpy: 'Grumpy', dramatic: 'Dramatic', anxious: 'Anxious', philosophical: 'Philosophical',
};

/** One line on what each skin shader actually does, for the lab. */
export const SKIN_BLURBS: Record<Skin, string> = {
  clay: 'Flat-shaded and speckled, with a soft two-tone gradient.',
  toon: 'Three hard light bands and a glowing rim.',
  holo: 'Fresnel rainbow with scanlines crawling up it.',
  iridescent: 'Hue shifts with the viewing angle, like a beetle.',
  goo: 'Vertex-displaced jelly with drifting blobs inside.',
  static: 'Screen-space TV noise. It never finished rendering.',
  missing: 'The checkerboard of an asset that failed to load.',
  disco: 'Every facet flashes on its own beat.',
  void: 'A hole in the world full of stars, outlined in light.',
  glitch: 'Its slices tear sideways, a few frames at a time.',
};

export interface CreatureHome {
  place: PlaceId;
  x: number;
  z: number;
}

export interface CreatureSpec {
  id: string;
  name: string;
  seed: number;
  body: Body;
  /** 0 … 1 knobs, mapped to sizes in the model. */
  height: number;
  girth: number;
  size: number;
  legs: number;
  legLength: number;
  arms: number;
  eyes: number;
  eyeSize: number;
  eyeStyle: EyeStyle;
  mouth: Mouth;
  topper: Topper;
  skin: Skin;
  /** Body, accent, glow (sRGB hex). */
  colors: [string, string, string];
  wobble: number;
  gait: Gait;
  speed: number;
  gear: Gear;
  mood: Mood;
  /** Pitch of its chirp, 0 … 1. */
  voice: number;
  /** Where it lives, once it's been spawned. */
  home?: CreatureHome;
  born: number;
}

export const MAX_CREATURES = 8;

const PALETTES: [string, string, string][] = [
  ['#f472b6', '#fde047', '#22d3ee'],
  ['#a3e635', '#7c3aed', '#facc15'],
  ['#38bdf8', '#f97316', '#f0abfc'],
  ['#fb7185', '#1e293b', '#fef08a'],
  ['#e5e7eb', '#ef4444', '#60a5fa'],
  ['#c084fc', '#14b8a6', '#fde68a'],
  ['#fbbf24', '#7f1d1d', '#a5f3fc'],
  ['#34d399', '#f43f5e', '#e0e7ff'],
  ['#1f2937', '#a855f7', '#4ade80'],
  ['#fda4af', '#4338ca', '#fcd34d'],
  ['#67e8f9', '#be185d', '#fff7ed'],
  ['#d6a35c', '#3f6212', '#f472b6'],
];

const SYLLABLES = ['blor', 'zib', 'mup', 'quo', 'fen', 'gloop', 'snorp', 'vex', 'pib', 'wub', 'klax', 'nim', 'yor', 'drib', 'plon', 'tik', 'oon', 'hux', 'grib', 'mo', 'zan', 'pex', 'lum', 'skree'];
const ENDINGS = ['', 'ble', 'ster', 'o', 'ix', 'ling', 'ump', 'ette', 'zor', 'inkle', 'ius', 'oo', 'ap', 'eep'];
const PREFIXES = ['', '', '', '', 'Sir ', 'Dr. ', 'Lil ', 'Big ', 'Madame ', 'Old '];
const SUFFIXES = ['', '', '', '', '', ' Jr.', ' the Unrendered', ' v2', ' (copy)', ' final_final', ' III', ' of the Pond'];
const DESIGN_NAMES = ['Ellipse 3', 'Frame 47', 'Vector', 'Union', 'Group 12', 'Untitled', 'Rectangle 9', 'Component 1'];

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function randomName(r: () => number = Math.random) {
  if (r() < 0.08) return `${pick(r, DESIGN_NAMES)}${r() < 0.5 ? ' (copy)' : ''}`;
  const core = cap(pick(r, SYLLABLES) + (r() < 0.4 ? pick(r, SYLLABLES) : '') + pick(r, ENDINGS));
  return `${pick(r, PREFIXES)}${core}${pick(r, SUFFIXES)}`.slice(0, 28);
}

export const randomPalette = (r: () => number = Math.random): [string, string, string] => {
  const p = pick(r, PALETTES);
  // sometimes swap body and accent for variety
  return r() < 0.35 ? [p[1], p[0], p[2]] : [...p];
};

const newId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** A whole creature from a seed. */
export function randomSpec(seed = Math.floor(Math.random() * 2 ** 31)): CreatureSpec {
  const r = mulberry32(seed);
  const body = pick(r, BODIES);
  const gait = body === 'noodle' && r() < 0.6 ? 'slither' : pick(r, GAITS);
  return {
    id: newId(),
    name: randomName(r),
    seed,
    body,
    height: r(),
    girth: r(),
    size: 0.3 + r() * 0.5,
    legs: gait === 'float' || gait === 'slither' ? (r() < 0.6 ? 0 : 2) : gait === 'scuttle' ? 4 + Math.floor(r() * 5) : r() < 0.15 ? 0 : 2 + Math.floor(r() * 2) * 2,
    legLength: r(),
    arms: r() < 0.3 ? 0 : 2 + (r() < 0.2 ? 2 : 0),
    eyes: r() < 0.55 ? 2 : 1 + Math.floor(r() * 7),
    eyeSize: r(),
    eyeStyle: r() < 0.55 ? 'round' : pick(r, EYE_STYLES),
    mouth: pick(r, MOUTHS),
    topper: r() < 0.2 ? 'none' : pick(r, TOPPERS),
    skin: pick(r, SKINS),
    colors: randomPalette(r),
    wobble: r() * 0.8,
    gait,
    ...(() => {
      const gear: Gear = r() < 0.08 ? 'R' : r() < 0.06 ? 'N' : gearForSpeed(r());
      return { gear, speed: GEAR_SPEED[gear] };
    })(),
    mood: pick(r, MOODS),
    voice: r(),
    born: Date.now(),
  };
}

/** A few knobs nudged, the way evolution would if it were in a hurry. */
export function mutate(spec: CreatureSpec): CreatureSpec {
  const r = Math.random;
  const next: CreatureSpec = { ...spec, colors: [...spec.colors] };
  const jiggle = (v: number) => Math.min(1, Math.max(0, v + (r() - 0.5) * 0.35));
  next.height = jiggle(next.height);
  next.girth = jiggle(next.girth);
  next.eyeSize = jiggle(next.eyeSize);
  next.wobble = jiggle(next.wobble);
  const swaps: (() => void)[] = [
    () => (next.body = pick(r, BODIES)),
    () => (next.eyes = Math.max(1, Math.min(7, next.eyes + (r() < 0.5 ? -1 : 1)))),
    () => (next.legs = Math.max(0, Math.min(8, next.legs + (r() < 0.5 ? -2 : 2)))),
    () => (next.mouth = pick(r, MOUTHS)),
    () => (next.topper = pick(r, TOPPERS)),
    () => (next.skin = pick(r, SKINS)),
    () => (next.eyeStyle = pick(r, EYE_STYLES)),
    () => (next.colors = randomPalette(r)),
  ];
  for (let i = 0; i < 2; i++) pick(r, swaps)();
  return next;
}

const HEX = /^#[0-9a-f]{6}$/i;
const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T) => (list.includes(v as T) ? (v as T) : fallback);
const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : fallback;

/** Saves outlive code: rebuild a stored creature knob by knob, dropping anything nonsensical. */
export function sanitizeSpec(raw: unknown): CreatureSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<CreatureSpec>;
  if (typeof s.id !== 'string' || !s.id) return null;
  const base = randomSpec(typeof s.seed === 'number' ? s.seed : hashString(s.id));
  const colors = Array.isArray(s.colors) && s.colors.length === 3 && s.colors.every((c) => typeof c === 'string' && HEX.test(c))
    ? (s.colors as [string, string, string])
    : base.colors;
  const home = s.home && typeof s.home === 'object' && ['island', 'house', 'basement'].includes(s.home.place) &&
    Number.isFinite(s.home.x) && Number.isFinite(s.home.z) ? { place: s.home.place, x: s.home.x, z: s.home.z } : undefined;
  return {
    id: s.id,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 28) : base.name,
    seed: base.seed,
    body: oneOf(s.body, BODIES, base.body),
    height: unit(s.height, base.height),
    girth: unit(s.girth, base.girth),
    size: unit(s.size, base.size),
    legs: int(s.legs, 0, 8, base.legs),
    legLength: unit(s.legLength, base.legLength),
    arms: int(s.arms, 0, 4, base.arms),
    eyes: int(s.eyes, 1, 7, base.eyes),
    eyeSize: unit(s.eyeSize, base.eyeSize),
    eyeStyle: oneOf(s.eyeStyle, EYE_STYLES, base.eyeStyle),
    mouth: oneOf(s.mouth, MOUTHS, base.mouth),
    topper: oneOf(s.topper, TOPPERS, base.topper),
    skin: oneOf(s.skin, SKINS, base.skin),
    colors,
    wobble: unit(s.wobble, base.wobble),
    gait: oneOf(s.gait, GAITS, base.gait),
    speed: unit(s.speed, base.speed),
    gear: GEAR_LIST.includes(s.gear as Gear) ? (s.gear as Gear) : gearForSpeed(unit(s.speed, base.speed)),
    mood: oneOf(s.mood, MOODS, base.mood),
    voice: unit(s.voice, base.voice),
    home,
    born: typeof s.born === 'number' ? s.born : Date.now(),
  };
}

/** Changes to these rebuild the mesh; everything else is a uniform or a behaviour. */
export const shapeKey = (s: CreatureSpec) =>
  [s.body, s.height.toFixed(2), s.girth.toFixed(2), s.legs, s.legLength.toFixed(2), s.arms, s.eyes, s.eyeSize.toFixed(2), s.eyeStyle, s.mouth, s.topper, s.skin].join('|');

/** Pitch multiplier for sfx('chirp'). */
export const voicePitch = (s: CreatureSpec) => 0.55 + s.voice * 1.3;

export function examineText(s: CreatureSpec) {
  const eyes = s.eyeStyle === 'visor' ? 'a visor' : `${s.eyes} ${s.eyeStyle === 'void' ? 'void ' : ''}eye${s.eyes === 1 ? '' : 's'}`;
  const legs = s.legs ? `${s.legs} leg${s.legs === 1 ? '' : 's'}` : 'no legs';
  const drive = s.gear === 'R' ? ' Stuck in reverse.' : s.gear === 'N' ? ' Parked in neutral.' : '';
  return `A ${LABELS[s.mood].toLowerCase()} ${LABELS[s.body].toLowerCase()} with ${eyes}, ${legs} and a ${LABELS[s.skin].toLowerCase()} skin. Visitor-made.${drive}`;
}
