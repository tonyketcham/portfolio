/**
 * The world's post-processing "Modyfi stack". Order matters, exactly like a
 * layer effect stack: each effect reads the result of the one above it.
 */
export type EffectId = 'halftone' | 'dither' | 'gradient' | 'posterize' | 'chroma' | 'crt' | 'kaleido';

export interface EffectDef {
  id: EffectId;
  /** Index in the shader's switch. Never reorder these numbers. */
  code: number;
  name: string;
  blurb: string;
}

export const EFFECTS: EffectDef[] = [
  { id: 'halftone', code: 0, name: 'Halftone', blurb: 'Rotated CMY dot screen.' },
  { id: 'dither', code: 1, name: 'Bayer dither', blurb: 'Ordered 4×4 dither down to a few levels.' },
  { id: 'gradient', code: 2, name: 'Gradient map', blurb: 'Luminance → three-stop palette.' },
  { id: 'posterize', code: 3, name: 'Posterize', blurb: 'Fewer colours, more opinions.' },
  { id: 'chroma', code: 4, name: 'Chromatic split', blurb: 'RGB drift toward the edges.' },
  { id: 'crt', code: 5, name: 'Scanlines', blurb: 'Phosphor rows and a little bloom.' },
  { id: 'kaleido', code: 6, name: 'Kaleidoscope', blurb: 'Six-fold mirror. Usually a mistake.' },
];

export const effectById = new Map(EFFECTS.map((e) => [e.id, e]));

export interface EffectLayer {
  id: EffectId;
  enabled: boolean;
  amount: number;
}

const layer = (id: EffectId, enabled: boolean, amount: number): EffectLayer => ({ id, enabled, amount });

export const EFFECT_PRESETS: Record<string, { label: string; stack: EffectLayer[] }> = {
  canvas: {
    label: 'Canvas',
    stack: [
      layer('chroma', true, 0.18),
      layer('dither', true, 0.22),
      layer('crt', true, 0.14),
      layer('halftone', false, 0.6),
      layer('gradient', false, 0.7),
      layer('posterize', false, 0.5),
      layer('kaleido', false, 0.5),
    ],
  },
  print: {
    label: 'Riso print',
    stack: [
      layer('halftone', true, 0.85),
      layer('chroma', true, 0.3),
      layer('dither', false, 0.3),
      layer('crt', false, 0.2),
      layer('gradient', false, 0.6),
      layer('posterize', false, 0.5),
      layer('kaleido', false, 0.5),
    ],
  },
  handheld: {
    label: 'Handheld',
    stack: [
      layer('gradient', true, 1),
      layer('dither', true, 0.8),
      layer('crt', true, 0.25),
      layer('posterize', false, 0.5),
      layer('halftone', false, 0.6),
      layer('chroma', false, 0.2),
      layer('kaleido', false, 0.5),
    ],
  },
  clean: {
    label: 'Clean',
    stack: [
      layer('chroma', false, 0.2),
      layer('dither', false, 0.3),
      layer('crt', false, 0.2),
      layer('halftone', false, 0.6),
      layer('gradient', false, 0.6),
      layer('posterize', false, 0.5),
      layer('kaleido', false, 0.5),
    ],
  },
};
