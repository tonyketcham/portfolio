import { create } from 'zustand';
import type { ArtFx } from '@/content/works';

/** Live per-piece effect overrides from the inspector's mini stack. */
export const useArtFx = create<{
  overrides: Record<string, ArtFx>;
  patch: (slug: string, fx: ArtFx) => void;
  reset: (slug: string) => void;
}>((set) => ({
  overrides: {},
  patch: (slug, fx) => set((s) => ({ overrides: { ...s.overrides, [slug]: { ...s.overrides[slug], ...fx } } })),
  reset: (slug) =>
    set((s) => {
      const next = { ...s.overrides };
      delete next[slug];
      return { overrides: next };
    }),
}));
