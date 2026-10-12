/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE ART REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything in the world that is "a piece of Tony's work" comes from this list.
 * Add an entry and the world does the rest:
 *
 *   • it gets placed in its zone (artboard, art-tree canopy or floor painting)
 *   • it's wired to related works with glowing node-graph cables (shared tags
 *     + explicit `connects`)
 *   • it shows up in the Quests tab, the Layers panel, the minimap and the
 *     inspector, and inspecting it grants XP
 *
 * Media goes in /public/art/<slug>/... (or anywhere in /public) and is referenced
 * by absolute path. Mux videos only need the playbackId (see /videos/*.json).
 * No art yet? Use `{ kind: 'procedural' }` and set `placeholder: true`, the frame
 * renders a seeded live shader so it never looks broken.
 *
 * See content/README.md for the full field reference.
 */

import type { ZoneId } from './zones';

export type ProceduralPattern =
  | 'halftone-bloom'
  | 'contour'
  | 'moire'
  | 'flow'
  | 'kaleido'
  | 'dots'
  | 'fractal';

export type Media =
  | { kind: 'image'; src: string; alt: string }
  | {
      kind: 'mux';
      playbackId: string;
      /** A local still used in-world (and while the stream warms up). */
      poster: string;
      alt: string;
    }
  | {
      kind: 'procedural';
      pattern: ProceduralPattern;
      seed?: number;
      /** sRGB hex triplet used by the pattern's gradient map. */
      palette?: [string, string, string];
    };

/**
 * Per-artboard "Modyfi stack". Each value is 0..1 strength.
 * Visitors can tweak these live in the inspector; these are the defaults.
 */
export interface ArtFx {
  halftone?: number;
  /** Halftone cell size in texture pixels at 1024px width. */
  dotScale?: number;
  gradient?: number;
  palette?: [string, string, string];
  displace?: number;
  dither?: number;
  chroma?: number;
  scan?: number;
}

export type SkillId =
  | 'tooling'
  | 'shaders'
  | 'tea'
  | 'mycology'
  | 'typography'
  | 'physics'
  | 'wandering'
  | 'curiosity'
  | 'generative'
  | 'prompting'
  | 'construction'
  | 'cats';

export interface Work {
  /** Unique, url-safe. Also the seed for anything procedural about this work. */
  slug: string;
  title: string;
  year?: string;
  role?: string;
  /** 1–3 sentences shown in the inspector. */
  summary: string;
  /** Old-school examine text. One line, a little bit of a joke. */
  examine: string;
  zone: ZoneId;
  /**
   * artboard: an upright frame (default, for projects)
   * tree: grows as a shader tree whose canopy is the art (for single pieces)
   * floor: a painting laid into the ground (only the spawn hero uses this)
   */
  display?: 'artboard' | 'tree' | 'floor';
  /** Drive the web: works sharing tags get cabled together. */
  tags: string[];
  /** First item is the cover. */
  media: Media[];
  links?: { label: string; href: string }[];
  fx?: ArtFx;
  /** Explicit edges, by slug, on top of tag similarity. */
  connects?: string[];
  /** Which skill inspecting this trains. Defaults to tooling. */
  skill?: SkillId;
  /** Copy written as a stand-in; confirm or rewrite. */
  draft?: boolean;
  /** No real media yet. */
  placeholder?: boolean;
}

/** Cable + chip colours per tag. Unknown tags fall back to zinc. */
export const tagColors: Record<string, string> = {
  'design-tools': '#3b82f6',
  modyfi: '#e879f9',
  shaders: '#d946ef',
  motion: '#22d3ee',
  generative: '#f43f5e',
  'open-source': '#84cc16',
  svelte: '#ff3e00',
  web: '#f59e0b',
  music: '#6366f1',
  data: '#a3a3a3',
  photography: '#facc15',
};

export const works: Work[] = [
  {
    slug: 'modyfi',
    title: 'Modyfi',
    role: 'Founding team engineer',
    summary:
      'Founding team engineer of a next generation design workbench: procedural, GPU-native image editing and motion in the browser.',
    examine: 'A design workbench. It hums at sixty frames per second.',
    zone: 'modyfi',
    tags: ['design-tools', 'modyfi', 'shaders', 'motion'],
    media: [
      {
        kind: 'mux',
        playbackId: 'wWnK9R6aMQjvAN3D5Z1nHrErBIPUDO3DBSHytqGOmeg',
        poster: '/work/Modyfi_Motion_1.webp',
        alt: 'Modyfi motion editor with a layered, glitching type composition',
      },
    ],
    links: [{ label: 'modyfi.com', href: 'https://modyfi.com' }],
    fx: { halftone: 0.15, dotScale: 6, gradient: 0.1, displace: 0.05, chroma: 0.25 },
    skill: 'shaders',
  },
  {
    slug: 'reset-presents',
    title: 'RESET Presents',
    summary: "Presence for Chicago's premier underground event organizer.",
    examine: "Flyers for Chicago's underground. The bass is load-bearing.",
    zone: 'reset',
    tags: ['web', 'music'],
    media: [
      {
        kind: 'image',
        src: '/work/Reset Presents - Events Page-min.png',
        alt: 'RESET Presents events page: EVENTS BY YEAR, 2020, 2021, 2022',
      },
    ],
    links: [{ label: 'resetpresents.com', href: 'https://resetpresents.com' }],
    fx: { halftone: 0.0, dither: 0.25, scan: 0.35, chroma: 0.15 },
  },
  {
    slug: 'p5-svelte',
    title: 'p5-Svelte',
    summary: 'Easily add p5 sketches to a Svelte project 🍛 🌱',
    examine: 'Curry and sprouts. Also: p5 sketches, in Svelte.',
    zone: 'garden',
    tags: ['open-source', 'generative', 'svelte', 'design-tools'],
    media: [
      {
        kind: 'mux',
        playbackId: 'SE5bHO7aeC00Gxzg3DD1JAgu3oaMczTkJX6CSUEdWJtg',
        poster: '/work/p5_svelte.png',
        alt: 'A recursive red fractal tree with the p5.js and Svelte logos',
      },
    ],
    links: [
      { label: 'github.com/tonyketcham/p5-svelte', href: 'https://github.com/tonyketcham/p5-svelte' },
    ],
    fx: { displace: 0.08, chroma: 0.2 },
    skill: 'generative',
  },
  {
    slug: 'vague-data',
    title: 'Vague Data',
    summary: 'A data tool.',
    examine: "It's definitely data. Vaguely.",
    zone: 'ruins',
    tags: ['data', 'design-tools'],
    media: [{ kind: 'procedural', pattern: 'contour', palette: ['#09090b', '#52525b', '#e4e4e7'] }],
    placeholder: true,
    draft: true,
  },
  {
    slug: 'amanita',
    title: 'Amanita',
    summary:
      'A self-portrait with a fly agaric, the background pushed through a procedural halftone warp until it started breathing.',
    examine: 'A man and his mushroom. The background is breathing.',
    zone: 'ring',
    tags: ['generative', 'shaders', 'photography', 'motion'],
    media: [
      {
        kind: 'mux',
        playbackId: 'tu9pLHjxufawXa3cv38PafY5crj14AFv02U7VHFOzgi8',
        poster: '/Amanita.webp',
        alt: 'Tony in a beanie holding a red amanita mushroom in front of a psychedelic dot pattern',
      },
    ],
    fx: { halftone: 0.0, chroma: 0.3, displace: 0.04 },
    skill: 'mycology',
    draft: true,
  },

  // ── Modyfi art pieces: drop real pieces in and flip placeholder off ─────────
  ...(
    [
      ['halftone-bloom', ['#1e1b4b', '#e879f9', '#fde68a']],
      ['moire', ['#020617', '#22d3ee', '#f0abfc']],
      ['flow', ['#0c0a09', '#f43f5e', '#fef3c7']],
      ['kaleido', ['#082f49', '#a3e635', '#fdf4ff']],
      ['dots', ['#18181b', '#3b82f6', '#fafafa']],
      ['fractal', ['#1a2e05', '#facc15', '#fff7ed']],
    ] as const
  ).map(
    ([pattern, palette], index): Work => ({
      slug: `modyfi-piece-${String(index + 1).padStart(2, '0')}`,
      title: `Modyfi piece ${String(index + 1).padStart(2, '0')}`,
      summary: 'Placeholder: a piece made in Modyfi goes here.',
      examine: 'An unhung piece. The canopy is just a shader for now.',
      zone: 'modyfi',
      display: 'tree',
      tags: ['modyfi', 'generative', 'shaders'],
      media: [{ kind: 'procedural', pattern, palette: [...palette] }],
      skill: 'shaders',
      placeholder: true,
    })
  ),

  // ── Empty frames in the ruins: slots for future projects ────────────────────
  {
    slug: 'untitled-project',
    title: 'Untitled Project',
    summary: 'Placeholder frame for the next project.',
    examine: 'Frame 404. Detached from its component.',
    zone: 'ruins',
    tags: ['design-tools'],
    media: [{ kind: 'procedural', pattern: 'dots', palette: ['#09090b', '#3b82f6', '#e4e4e7'] }],
    placeholder: true,
  },
];

export const workBySlug = new Map(works.map((work) => [work.slug, work]));
