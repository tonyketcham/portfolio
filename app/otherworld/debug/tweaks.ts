/**
 * Every tunable in the experience, declared once as DialKit panel configs.
 * <DialBridge/> mounts these as DialKit panels and mirrors their live values
 * into `useTweaks`. Without the panel mounted (production, no ?dial), the
 * defaults below are what ships.
 *
 * Syntax (DialKit): [default, min, max, step?] slider · boolean toggle ·
 * '#hex' colour · { type: 'select', options, default } · { type: 'action' } ·
 * nested object = folder (`_collapsed: true` to start closed).
 */
import { create } from 'zustand';
import { zones } from '@/content/zones';

export const PANELS = {
  World: {
    timeOfDay: [0.72, 0, 1, 0.001],
    followLocalTime: true,
    fogNear: [24, 0, 120],
    fogFar: [78, 10, 240],
    wind: [1, 0, 3],
    tileGrid: [0.22, 0, 1],
    coastDissolve: [1, 0, 1],
    voidRipples: [1, 0, 3],
    voidDotSize: [1, 0.2, 3],
    clouds: [6, 0, 16, 1],
  },
  'Modyfi stack': {
    pixelScale: [0.5, 0.15, 1, 0.05],
    grain: [0.05, 0, 0.3],
    vignette: [0.32, 0, 1],
    mushroom: [0, 0, 1],
    glitch: [1, 0, 2],
    halftone: { _collapsed: true, cell: [5, 2, 16], angle: [0.4, 0, 1.6] },
    dither: { _collapsed: true, levels: [6, 2, 16, 1] },
    gradientMap: { _collapsed: true, dark: '#0b1020', mid: '#e879f9', light: '#fef3c7' },
    posterize: { _collapsed: true, levels: [5, 2, 12, 1] },
    scanlines: { _collapsed: true, density: [1, 0.25, 3] },
    chroma: { _collapsed: true, spread: [1, 0, 4] },
  },
  Camera: {
    fov: [38, 20, 80],
    pitchMin: [0.32, 0.05, 1.2],
    pitchMax: [1.32, 0.5, 1.55],
    zoomMin: [5, 2, 20],
    zoomMax: [32, 10, 80],
    follow: [7, 1, 20],
    rotateSpeed: [1, 0.2, 3],
    shake: [1, 0, 2],
  },
  Player: {
    tickMs: [600, 150, 1200, 10],
    walkTiles: [1, 0.25, 3],
    runTiles: [2, 1, 5],
    snapToTicks: false,
    scale: [1, 0.5, 2.5],
    bounce: [1, 0, 2.5],
    legs: [1, 0.4, 2],
    body: '#09090b',
    outline: '#fafafa',
    caffeineDrain: [1, 0, 4],
  },
  Physics: {
    gravity: [-22, -60, 0],
    critters: [7, 0, 24, 1],
    hop: [1, 0, 3],
    restitution: [0.25, 0, 1.2],
    shroomBounce: [1.35, 0, 2.5],
    rewindSeconds: [5, 1, 10],
    colliders: false,
    spawnLetters: { type: 'action' },
    rewind: { type: 'action' },
  },
  HUD: {
    skin: { type: 'select', options: ['hybrid', 'game', 'tool'], default: 'hybrid' },
    scale: [1, 0.7, 1.4],
    accent: '#3b82f6',
    chatLines: [5, 2, 12, 1],
    selectionBoxes: true,
  },
  Intro: {
    skip: false,
    autoUnfold: [10, 2, 40],
    unfoldSeconds: [3.6, 1, 10],
    replay: { type: 'action' },
  },
  Artboards: {
    hoverLift: [0.14, 0, 0.6],
    fx: [1, 0, 2],
    labels: [0.85, 0, 1],
    selection: '#3b82f6',
    breathe: [1, 0, 3],
  },
  Flora: {
    grass: [1, 0, 1],
    butterflies: [7, 0, 20, 1],
    fireflies: [1, 0, 3],
    spores: [1, 0, 3],
    sway: [1, 0, 3],
  },
  Debug: {
    walkable: false,
    showFps: false,
    teleport: { type: 'select', options: zones.map((z) => z.id), default: 'spawn' },
    go: { type: 'action' },
    giveTea: { type: 'action' },
    mushroomMode: { type: 'action' },
    maxSkills: { type: 'action' },
    resetSave: { type: 'action' },
  },
} as const;

type Widen<T> = T extends readonly [infer D, ...unknown[]]
  ? D extends number
    ? number
    : D
  : T extends { type: 'action' }
    ? never
    : T extends { type: 'select'; default: infer D }
      ? D extends string
        ? string
        : D
      : T extends boolean
        ? boolean
        : T extends string
          ? string
          : T extends number
            ? number
            : T extends object
              ? { -readonly [K in keyof T as K extends '_collapsed' ? never : T[K] extends { type: 'action' } ? never : K]: Widen<T[K]> }
              : T;

export type Tweaks = { -readonly [P in keyof typeof PANELS]: Widen<(typeof PANELS)[P]> };

function defaultsOf(config: unknown): unknown {
  if (Array.isArray(config)) return config[0];
  if (config && typeof config === 'object') {
    const c = config as Record<string, unknown>;
    if (c.type === 'select') return c.default;
    if (c.type === 'action') return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === '_collapsed') continue;
      const d = defaultsOf(v);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  return config;
}

export const TWEAK_DEFAULTS = Object.fromEntries(
  Object.entries(PANELS).map(([name, config]) => [name, defaultsOf(config)])
) as Tweaks;

export const useTweaks = create<Tweaks>(() => structuredClone(TWEAK_DEFAULTS));
export const tweaks = () => useTweaks.getState();
