/**
 * The world's post-processing "Modyfi stack". Order matters, exactly like a
 * layer effect stack: each effect reads the result of the one above it.
 */
export type EffectId =
  | 'halftone'
  | 'dither'
  | 'gradient'
  | 'posterize'
  | 'chroma'
  | 'crt'
  | 'kaleido'
  | 'echo'
  | 'melt'
  | 'liquify'
  | 'pixelsort'
  | 'ascii'
  | 'neon'
  | 'thermal';

export interface EffectDef {
  id: EffectId;
  /** Index in the shader's switch. Never reorder these numbers. */
  code: number;
  name: string;
  blurb: string;
  /** Default amount when the layer first appears in someone's stack. */
  amount: number;
}

export const EFFECTS: EffectDef[] = [
  { id: 'halftone', code: 0, name: 'Halftone', blurb: 'Rotated CMY dot screen.', amount: 0.6 },
  { id: 'dither', code: 1, name: 'Bayer dither', blurb: 'Ordered 4×4 dither down to a few levels.', amount: 0.3 },
  { id: 'gradient', code: 2, name: 'Gradient map', blurb: 'Luminance → three-stop palette.', amount: 0.6 },
  { id: 'posterize', code: 3, name: 'Posterize', blurb: 'Fewer colours, more opinions.', amount: 0.5 },
  { id: 'chroma', code: 4, name: 'Chromatic split', blurb: 'RGB drift toward the edges.', amount: 0.2 },
  { id: 'crt', code: 5, name: 'Scanlines', blurb: 'Phosphor rows and a little bloom.', amount: 0.2 },
  { id: 'kaleido', code: 6, name: 'Kaleidoscope', blurb: 'Six-fold mirror. Usually a mistake.', amount: 0.5 },
  { id: 'echo', code: 7, name: 'Echo', blurb: 'The last few frames refuse to leave. Walk around.', amount: 0.6 },
  { id: 'melt', code: 8, name: 'Melt', blurb: 'Columns of the frame drip like wet paint.', amount: 0.5 },
  { id: 'liquify', code: 9, name: 'Liquify', blurb: 'Noise flow, plus a ripple out from you.', amount: 0.5 },
  { id: 'pixelsort', code: 10, name: 'Pixel sort', blurb: 'Bright pixels bleed downward in streaks.', amount: 0.6 },
  { id: 'ascii', code: 11, name: 'ASCII', blurb: 'The world as text, a glyph per cell.', amount: 0.85 },
  { id: 'neon', code: 12, name: 'Neon edges', blurb: 'Silhouettes become hue-cycling tubes.', amount: 0.7 },
  { id: 'thermal', code: 13, name: 'Thermal', blurb: 'Heat camera. Near and bright runs hot.', amount: 0.8 },
];

export const effectById = new Map(EFFECTS.map((e) => [e.id, e]));

export interface EffectLayer {
  id: EffectId;
  enabled: boolean;
  amount: number;
}

/**
 * A full stack from the layers a preset cares about (in order, enabled);
 * every other effect follows, switched off at its default amount.
 */
function stackOf(on: [EffectId, number][], off: [EffectId, number][] = []): EffectLayer[] {
  const listed = new Set([...on, ...off].map(([id]) => id));
  return [
    ...on.map(([id, amount]) => ({ id, enabled: true, amount })),
    ...off.map(([id, amount]) => ({ id, enabled: false, amount })),
    ...EFFECTS.filter((e) => !listed.has(e.id)).map((e) => ({ id: e.id, enabled: false, amount: e.amount })),
  ];
}

/**
 * Saves outlive code: keep a saved stack's order and settings, drop layers that
 * no longer exist and append any new ones (off) at the bottom.
 */
export function reconcileStack(saved: unknown, fallback: EffectLayer[]): EffectLayer[] {
  if (!Array.isArray(saved)) return fallback;
  const seen = new Set<EffectId>();
  const out: EffectLayer[] = [];
  for (const l of saved as Partial<EffectLayer>[]) {
    if (!l || !l.id || !effectById.has(l.id) || seen.has(l.id)) continue;
    seen.add(l.id);
    out.push({ id: l.id, enabled: !!l.enabled, amount: typeof l.amount === 'number' ? Math.min(1, Math.max(0, l.amount)) : effectById.get(l.id)!.amount });
  }
  if (!out.length) return fallback;
  for (const e of EFFECTS) if (!seen.has(e.id)) out.push({ id: e.id, enabled: false, amount: e.amount });
  return out;
}

export const EFFECT_PRESETS: Record<string, { label: string; stack: EffectLayer[]; palette?: [string, string, string] }> = {
  canvas: {
    label: 'Canvas',
    stack: stackOf([['chroma', 0.18], ['dither', 0.22], ['crt', 0.14]]),
  },
  print: {
    label: 'Riso print',
    stack: stackOf([['halftone', 0.85], ['chroma', 0.3]]),
  },
  handheld: {
    label: 'Handheld',
    palette: ['#1b2a17', '#7d9a3c', '#e6f1c4'],
    stack: stackOf([['gradient', 1], ['dither', 0.8], ['crt', 0.25]]),
  },
  ultraviolet: {
    label: 'Ultraviolet',
    palette: ['#0b1020', '#e879f9', '#fef3c7'],
    stack: stackOf([['gradient', 0.75], ['halftone', 0.45], ['chroma', 0.35], ['crt', 0.2]]),
  },
  terminal: {
    label: 'Terminal',
    palette: ['#020a04', '#16a34a', '#d9f99d'],
    stack: stackOf([['ascii', 0.95], ['gradient', 1], ['crt', 0.35]]),
  },
  synthwave: {
    label: 'Synthwave',
    stack: stackOf([['neon', 0.8], ['echo', 0.55], ['chroma', 0.4], ['crt', 0.3]]),
  },
  fever: {
    label: 'Fever dream',
    stack: stackOf([['liquify', 0.6], ['melt', 0.45], ['echo', 0.7], ['thermal', 0.55], ['posterize', 0.4]]),
  },
  glitch: {
    label: 'Corrupted',
    stack: stackOf([['pixelsort', 0.85], ['melt', 0.25], ['chroma', 0.6], ['dither', 0.35]]),
  },
  predator: {
    label: 'Heat vision',
    stack: stackOf([['thermal', 1], ['dither', 0.4], ['crt', 0.2]]),
  },
  clean: {
    label: 'Clean',
    stack: stackOf([]),
  },
};
