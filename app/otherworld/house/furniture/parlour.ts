/** Parlour: chairs, rugs, fireplaces, bookcases, curtains. */
import * as THREE from 'three/webgpu';
import { Kit, UI, WOOD } from '../kit';
import { fireMaterial } from '../materials';
import { anchor, books, canvasTexture, handle } from './common';
import type { BuildCtx, Extra, FurnitureDef, LightSpec } from './types';

const SIT = [{ verb: 'Sit-on', id: 'sit' }];

// ── chairs ───────────────────────────────────────────────────────────────────
function plainChair(k: Kit, wood: string, opts: { cushion?: string; arms?: boolean; slats?: number; wonky?: number } = {}) {
  const wob = opts.wonky ?? 0;
  const seatY = 0.42;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lh = seatY + (k.r() - 0.5) * wob;
      k.box(0.06, lh, 0.06, wood, [sx * 0.22, 0, sz * 0.2]);
    }
  k.box(0.56, 0.06, 0.52, wood, [0, seatY, 0], { rot: [(k.r() - 0.5) * wob, 0, (k.r() - 0.5) * wob] });
  if (opts.cushion) k.box(0.48, 0.07, 0.44, opts.cushion, [0, seatY + 0.06, 0.01]);
  // back posts + slats
  for (const sx of [-1, 1]) k.box(0.06, 0.62, 0.06, wood, [sx * 0.24, seatY, -0.23]);
  const slats = opts.slats ?? 3;
  for (let i = 0; i < slats; i++) k.box(0.44, 0.06, 0.04, wood, [0, seatY + 0.18 + i * 0.15, -0.23]);
  if (opts.arms) for (const sx of [-1, 1]) {
    k.box(0.06, 0.26, 0.06, wood, [sx * 0.27, seatY, 0.18]);
    k.box(0.08, 0.05, 0.5, wood, [sx * 0.27, seatY + 0.26, -0.02]);
  }
}

const crudeChair: FurnitureDef = {
  id: 'crude-chair',
  space: 'chair',
  name: 'Crude wooden chair',
  level: 1,
  xp: 58,
  materials: [['Plank', 2], ['Nails', 2]],
  examine: 'Every leg is a different length. Very indie.',
  actions: SIT,
  model: (k) => plainChair(k, WOOD.crude, { wonky: 0.12, slats: 2 }),
};

const rockingChair: FurnitureDef = {
  id: 'rocking-chair',
  space: 'chair',
  name: 'Rocking chair',
  level: 14,
  xp: 87,
  materials: [['Plank', 3], ['Nails', 3]],
  examine: 'It rocks whether or not anyone is sitting in it.',
  actions: SIT,
  model: (k) => {
    const r = k.sub('rock', [0, 0, 0]);
    // rockers: two shallow arcs
    for (const sx of [-1, 1]) r.torus(1.2, 0.03, WOOD.oak, [sx * 0.22, 1.24, 0], 4, 14, 0.7, { rot: [0, Math.PI / 2, -Math.PI / 2 - 0.35] });
    r.push([0, 0.05, 0]);
    plainChair(r, WOOD.oak, { slats: 5, cushion: '#b45309' });
    r.pop();
  },
};

const oakArmchair: FurnitureDef = {
  id: 'oak-armchair',
  space: 'chair',
  name: 'Oak armchair',
  level: 26,
  xp: 180,
  materials: [['Oak plank', 3]],
  examine: 'Upholstered in the colour of a merge conflict.',
  actions: SIT,
  model: (k) => {
    plainChair(k, WOOD.oakDark, { arms: true, cushion: WOOD.cloth, slats: 0 });
    k.box(0.46, 0.5, 0.08, WOOD.cloth, [0, 0.52, -0.2], { rot: [-0.08, 0, 0] });
  },
};

/** The frame is a set of pen-tool paths, anchors and handles left visible. */
const bezierChair: FurnitureDef = {
  id: 'bezier-chair',
  space: 'chair',
  name: 'Bézier chair',
  level: 33,
  xp: 240,
  materials: [['Vector', 4], ['Anchor point', 8]],
  examine: "Nobody closed the path. It's load-bearing anyway.",
  actions: SIT,
  model: (k) => {
    const c = '#0a0a0a';
    const r = 0.022;
    // seat outline + back as smooth curves
    k.tube([[-0.25, 0.42, 0.22], [0, 0.4, 0.27], [0.25, 0.42, 0.22], [0.27, 0.43, -0.2], [0, 0.45, -0.24], [-0.27, 0.43, -0.2]], r, c, { closed: true, seg: 40 });
    k.tube([[-0.24, 0.43, -0.22], [-0.3, 0.75, -0.3], [-0.12, 1.02, -0.32], [0.12, 1.02, -0.32], [0.3, 0.75, -0.3], [0.24, 0.43, -0.22]], r, c, { seg: 40 });
    // legs as S-curves
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.tube([[sx * 0.22, 0.42, sz * 0.18], [sx * 0.3, 0.22, sz * 0.24], [sx * 0.18, 0.0, sz * 0.2]], r, c, { seg: 10 });
    k.box(0.5, 0.025, 0.46, '#e4e4e7', [0, 0.41, 0], { jitter: 0.01 });
    anchor(k, [-0.12, 1.06, -0.3]);
    anchor(k, [0.3, 0.79, -0.28]);
    anchor(k, [0.25, 0.46, 0.25]);
    handle(k, [-0.12, 1.02, -0.3], [-0.34, 1.12, -0.24]);
    handle(k, [-0.12, 1.02, -0.3], [0.1, 0.92, -0.36]);
    handle(k, [0.25, 0.42, 0.25], [0.42, 0.5, 0.12]);
  },
};

/** Duplicated twice and nudged, the way it happens at 2am. */
const chairCopy: FurnitureDef = {
  id: 'chair-copy',
  space: 'chair',
  name: 'Chair (Copy) (Copy)',
  level: 40,
  xp: 300,
  materials: [['Oak plank', 2], ['Clipboard', 1]],
  examine: 'Two of these are not real. Nobody knows which.',
  actions: SIT,
  model: (k) => plainChair(k, WOOD.teak, { slats: 4, cushion: '#1d4ed8' }),
  extras: () =>
    [1, 2].map((i) => {
      const k = new Kit(i * 77);
      plainChair(k, '#ffffff', { slats: 4 });
      const m = new THREE.Mesh(k.build(false)!, ghostCopyMaterial);
      m.position.set(0.09 * i, 0, 0.09 * i);
      return { object: m };
    }),
};

const ghostCopyMaterial = new THREE.MeshBasicNodeMaterial({ color: '#60a5fa', transparent: true, opacity: 0.22, depthWrite: false });

/** A flat vector chair: two-dimensional, strictly front-on. */
const svgChair: FurnitureDef = {
  id: 'svg-chair',
  space: 'chair',
  name: 'chair.svg',
  level: 47,
  xp: 380,
  materials: [['Path', 1], ['Stroke', 1]],
  examine: 'Exported at 1x. Looks great from exactly one angle.',
  actions: SIT,
  model: (k) => {
    const outline: [number, number][] = [
      [-0.28, 0], [-0.22, 0], [-0.2, 0.38], [0.2, 0.38], [0.22, 0], [0.28, 0], [0.25, 0.46], [0.26, 1.05], [0.18, 1.08], [0.16, 0.48],
      [-0.16, 0.48], [-0.18, 1.08], [-0.26, 1.05], [-0.25, 0.46],
    ];
    k.extrude(outline, 0.03, '#0a0a0a', [0, 0, 0.0]);
    const inner: [number, number][] = [[-0.12, 0.55], [0.12, 0.55], [0.12, 0.98], [-0.12, 0.98]];
    k.extrude(inner, 0.035, '#fafafa', [0, 0, 0]);
    k.extrude([[-0.16, 0.4], [0.16, 0.4], [0.16, 0.46], [-0.16, 0.46]], 0.035, '#f472b6', [0, 0, 0]);
  },
};

// ── rugs ─────────────────────────────────────────────────────────────────────
/** A rug as a grid of cells coloured by `cell(i, j, ni, nj)`. */
function cellRug(k: Kit, w: number, d: number, n: number, cell: (i: number, j: number, ni: number, nj: number) => string) {
  const ni = Math.max(1, Math.round(w * n));
  const nj = Math.max(1, Math.round(d * n));
  const cw = (w - 0.2) / ni;
  const cd = (d - 0.2) / nj;
  for (let j = 0; j < nj; j++)
    for (let i = 0; i < ni; i++)
      k.box(cw, 0.02, cd, cell(i, j, ni, nj), [-(w - 0.2) / 2 + (i + 0.5) * cw, 0.005, -(d - 0.2) / 2 + (j + 0.5) * cd], { jitter: 0.03 });
}

const brownRug: FurnitureDef = {
  id: 'brown-rug',
  space: 'rug',
  name: 'Brown rug',
  level: 2,
  xp: 30,
  materials: [['Bolt of cloth', 2]],
  examine: 'Brown. Aggressively brown.',
  model: (k, c) =>
    cellRug(k, c.w, c.d, 3, (i, j, ni, nj) => (i === 0 || j === 0 || i === ni - 1 || j === nj - 1 ? '#5b3a1e' : (i + j) % 5 === 0 ? '#8b5a2b' : '#7a4a22')),
};

const opulentRug: FurnitureDef = {
  id: 'opulent-rug',
  space: 'rug',
  name: 'Opulent rug',
  level: 65,
  xp: 360,
  materials: [['Bolt of cloth', 4], ['Gold leaf', 1]],
  examine: 'Hand-knotted. By hand. Each knot is a commit.',
  model: (k, c) =>
    cellRug(k, c.w, c.d, 5, (i, j, ni, nj) => {
      const e = Math.min(i, j, ni - 1 - i, nj - 1 - j);
      if (e === 0) return '#3b0a0a';
      if (e === 1) return (i + j) % 2 ? '#d4a72c' : '#7f1d1d';
      const cx = Math.abs(i - (ni - 1) / 2) / ni;
      const cz = Math.abs(j - (nj - 1) / 2) / nj;
      const dm = cx + cz;
      return dm < 0.12 ? '#d4a72c' : dm < 0.2 ? '#1e3a8a' : Math.floor(dm * 18) % 2 ? '#7f1d1d' : '#991b1b';
    }),
};

/** The PNG transparency checkerboard, as a rug, with its selection box still on. */
const transparentRug: FurnitureDef = {
  id: 'transparent-rug',
  space: 'rug',
  name: 'Transparent rug',
  level: 20,
  xp: 140,
  materials: [['Alpha channel', 1]],
  examine: "There's nothing here. It's 100% transparent. Mind your step.",
  model: (k, c) => {
    cellRug(k, c.w, c.d, 4, (i, j) => ((i + j) % 2 ? '#d4d4d8' : '#fafafa'));
    // dashed selection rectangle + handles
    const hw = c.w / 2 - 0.08;
    const hd = c.d / 2 - 0.08;
    const dash = 0.16;
    for (let x = -hw; x < hw; x += dash * 2) {
      k.box(Math.min(dash, hw - x), 0.03, 0.03, UI.blue, [x + dash / 2, 0.012, -hd], { jitter: 0 });
      k.box(Math.min(dash, hw - x), 0.03, 0.03, UI.blue, [x + dash / 2, 0.012, hd], { jitter: 0 });
    }
    for (let z = -hd; z < hd; z += dash * 2) {
      k.box(0.03, 0.03, Math.min(dash, hd - z), UI.blue, [-hw, 0.012, z + dash / 2], { jitter: 0 });
      k.box(0.03, 0.03, Math.min(dash, hd - z), UI.blue, [hw, 0.012, z + dash / 2], { jitter: 0 });
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.box(0.16, 0.035, 0.16, UI.blue, [sx * hw, 0.01, sz * hd], { jitter: 0 });
        k.box(0.11, 0.04, 0.11, UI.white, [sx * hw, 0.012, sz * hd], { jitter: 0 });
      }
  },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dither from deep teal to warm cream across the rug. */
const ditherRug: FurnitureDef = {
  id: 'dither-rug',
  space: 'rug',
  name: 'Dithered rug',
  level: 28,
  xp: 190,
  materials: [['Bolt of cloth', 2], ['Bayer matrix', 1]],
  examine: 'A gradient, if you squint. Two colours, if you don\'t.',
  model: (k, c) =>
    cellRug(k, c.w, c.d, 6, (i, j, ni, nj) => {
      const t = (i / ni) * 0.6 + (j / nj) * 0.4;
      return t * 16 > BAYER[(i % 4) + (j % 4) * 4] + 0.5 ? '#f5e6c8' : '#134e4a';
    }),
};

// ── fireplaces ───────────────────────────────────────────────────────────────
function fireExtras(c: BuildCtx, palette?: [string, string, string], y = 0.08): Extra[] {
  const fz = c.wallZ + 0.3;
  const group = new THREE.Group();
  const mat = fireMaterial(palette);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.72), mat);
    m.position.set((i - 1) * 0.12, y + 0.36, fz);
    m.rotation.y = (i - 1) * 0.9;
    m.renderOrder = 3;
    group.add(m);
  }
  return [{ object: group }];
}
const fireLight = (c: BuildCtx, color = '#fb923c'): LightSpec[] => [
  { pos: [0, 0.6, c.wallZ + 0.8], color, intensity: 3.2, distance: 6.5, flicker: 0.35 },
];

function hearth(k: Kit, c: BuildCtx, body: string, trim: string, opts: { tall?: number; logs?: boolean } = {}) {
  const z = c.wallZ;
  const H = opts.tall ?? 1.25;
  // chimney breast
  k.box(1.7, H, 0.5, body, [0, 0, z + 0.25]);
  k.box(1.9, 0.1, 0.62, trim, [0, H, z + 0.3]);
  k.box(1.2, 2.6 - H - 0.1, 0.38, body, [0, H + 0.1, z + 0.19]);
  // opening
  k.box(0.84, 0.72, 0.36, '#140c08', [0, 0.04, z + 0.33], { jitter: 0.02 });
  // hearth stone
  k.box(1.5, 0.06, 0.4, trim, [0, 0, z + 0.62]);
  if (opts.logs !== false) {
    k.cyl(0.06, 0.06, 0.6, '#3b2414', [0, 0.06, z + 0.32], 6, { rot: [0, 0, Math.PI / 2] });
    k.cyl(0.05, 0.05, 0.55, '#2a1a0e', [0, 0.06, z + 0.26], 6, { rot: [0.3, 0.6, Math.PI / 2] });
  }
}

const LIGHT = [{ verb: 'Warm-hands', id: 'warm' }];

const clayFireplace: FurnitureDef = {
  id: 'clay-fireplace',
  space: 'fireplace',
  name: 'Clay fireplace',
  level: 3,
  xp: 30,
  materials: [['Soft clay', 3]],
  examine: 'Handmade. It shows.',
  actions: LIGHT,
  model: (k, c) => hearth(k, c, '#a5694b', '#8a5038', { tall: 1.1 }),
  extras: (c) => fireExtras(c),
  lights: (c) => fireLight(c),
};

const stoneFireplace: FurnitureDef = {
  id: 'stone-fireplace',
  space: 'fireplace',
  name: 'Stone fireplace',
  level: 33,
  xp: 40,
  materials: [['Limestone brick', 2]],
  examine: 'Warm. Solid. Unopinionated.',
  actions: LIGHT,
  model: (k, c) => {
    hearth(k, c, '#8b8a86', '#6b6a66');
    // a few proud stones
    for (let i = 0; i < 9; i++) k.box(0.2 + k.r() * 0.15, 0.12, 0.05, '#9c9a95', [(k.r() - 0.5) * 1.5, 0.15 + k.r() * 0.95, c.wallZ + 0.51]);
  },
  extras: (c) => fireExtras(c),
  lights: (c) => fireLight(c),
};

const marbleFireplace: FurnitureDef = {
  id: 'marble-fireplace',
  space: 'fireplace',
  name: 'Marble fireplace',
  level: 63,
  xp: 500,
  materials: [['Marble block', 1]],
  examine: 'It cost more than the rest of the room. It knows.',
  actions: LIGHT,
  model: (k, c) => {
    hearth(k, c, WOOD.marble, '#cbc3b4');
    for (const sx of [-1, 1]) k.cyl(0.08, 0.09, 1.2, '#f5f2ea', [sx * 0.62, 0, c.wallZ + 0.52], 8);
  },
  extras: (c) => fireExtras(c, ['#1e3a8a', '#38bdf8', '#f0f9ff']),
  lights: (c) => fireLight(c, '#7dd3fc'),
};

/** The flames are a gradient map; the stops float above the mantel, draggable-looking. */
const gradientFireplace: FurnitureDef = {
  id: 'gradient-fireplace',
  space: 'fireplace',
  name: 'Gradient-mapped fireplace',
  level: 21,
  xp: 160,
  materials: [['Limestone brick', 2], ['Gradient stop', 3]],
  examine: 'Burns luminance. Outputs orange. Adjust the stops at your own risk.',
  actions: LIGHT,
  model: (k, c) => {
    hearth(k, c, '#57534e', '#44403c');
    const z = c.wallZ + 0.62;
    const y = 1.62;
    // gradient bar
    const stops = ['#7c2d12', '#c2410c', '#f97316', '#fbbf24', '#fde68a'];
    stops.forEach((s, i) => k.box(0.24, 0.12, 0.04, s, [-0.48 + i * 0.24, y, z], { jitter: 0 }));
    k.box(1.26, 0.16, 0.03, '#0a0a0a', [0, y - 0.02, z - 0.02], { jitter: 0 });
    for (const [x, col] of [[-0.55, '#7c2d12'], [0.0, '#f97316'], [0.55, '#fde68a']] as const) {
      k.box(0.11, 0.11, 0.05, UI.white, [x, y - 0.2, z + 0.01], { jitter: 0 });
      k.box(0.07, 0.07, 0.06, col, [x, y - 0.18, z + 0.01], { jitter: 0 });
      k.cone(0.05, 0.06, UI.white, [x, y - 0.1, z + 0.01], 3, { jitter: 0, rot: [Math.PI, 0, 0] });
    }
  },
  extras: (c) => fireExtras(c, ['#7c2d12', '#f97316', '#fde68a']),
  lights: (c) => fireLight(c),
};

// ── bookcases ────────────────────────────────────────────────────────────────
function bookcase(k: Kit, c: BuildCtx, wood: string, shelves = 4) {
  const w = c.w * 0.92;
  const z = c.wallZ + 0.2;
  const H = 1.9;
  k.box(w, H, 0.04, wood, [0, 0, c.wallZ + 0.02]);
  for (const sx of [-1, 1]) k.box(0.06, H, 0.38, wood, [sx * (w / 2 - 0.03), 0, z]);
  for (let s = 0; s <= shelves; s++) k.box(w, 0.05, 0.38, wood, [0, s * (H / shelves) - (s === shelves ? 0.05 : 0), z]);
  for (let s = 0; s < shelves; s++) books(k, -w / 2 + 0.07, w / 2 - 0.07, s * (H / shelves) + 0.05, z + 0.02, H / shelves - 0.12);
}
const SEARCH = [{ verb: 'Search', id: 'search-books' }];

const woodenBookcase: FurnitureDef = {
  id: 'wooden-bookcase',
  space: 'bookcase',
  name: 'Wooden bookcase',
  level: 4,
  xp: 115,
  materials: [['Plank', 4], ['Nails', 4]],
  examine: 'Mostly design books. Two are about bread.',
  actions: SEARCH,
  model: (k, c) => bookcase(k, c, WOOD.wood),
};

const mahoganyBookcase: FurnitureDef = {
  id: 'mahogany-bookcase',
  space: 'bookcase',
  name: 'Mahogany bookcase',
  level: 40,
  xp: 420,
  materials: [['Mahogany plank', 3]],
  examine: 'The good books. The ones with bookmarks in them.',
  actions: SEARCH,
  model: (k, c) => {
    bookcase(k, c, WOOD.mahogany, 5);
    k.box(c.w * 0.98, 0.12, 0.46, '#3d1a10', [0, 1.9, c.wallZ + 0.22]);
  },
};

/** The shelves are a layers panel: every row has an eye, a swatch and a name bar. */
const layersBookcase: FurnitureDef = {
  id: 'layers-bookcase',
  space: 'bookcase',
  name: 'Bookcase (Layers panel)',
  level: 29,
  xp: 260,
  materials: [['Plank', 3], ['Layer', 12]],
  examine: 'Twelve layers, all named "Rectangle". One of them is selected. You can tell.',
  actions: SEARCH,
  model: (k, c) => {
    const w = c.w * 0.92;
    const z = c.wallZ;
    k.box(w + 0.08, 2.0, 0.06, '#27272a', [0, 0, z + 0.03], { jitter: 0.01 });
    const rows = 12;
    const rh = 1.86 / rows;
    const swatches = ['#f43f5e', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#fb923c', '#14b8a6', '#e879f9'];
    for (let i = 0; i < rows; i++) {
      const y = 0.08 + i * rh;
      const sel = i === 8;
      const indent = i % 4 === 1 || i % 4 === 2 ? 0.12 : 0;
      k.box(w - 0.04, rh - 0.025, 0.1, sel ? '#1d4ed8' : i % 2 ? '#3f3f46' : '#34343b', [0, y, z + 0.11], { jitter: 0.01 });
      // eye
      k.box(0.07, 0.035, 0.03, sel ? '#ffffff' : '#a1a1aa', [-w / 2 + 0.1, y + rh / 2 - 0.03, z + 0.17], { jitter: 0 });
      // swatch + name
      k.box(0.08, 0.08, 0.03, swatches[i % swatches.length], [-w / 2 + 0.24 + indent, y + rh / 2 - 0.055, z + 0.17], { jitter: 0 });
      k.box(0.25 + ((i * 37) % 7) * 0.05, 0.03, 0.03, sel ? '#dbeafe' : '#d4d4d8', [-w / 2 + 0.5 + indent + (0.12 + ((i * 37) % 7) * 0.025), y + rh / 2 - 0.03, z + 0.17], { jitter: 0 });
      if (i % 5 === 3) k.box(0.06, 0.06, 0.03, '#a1a1aa', [w / 2 - 0.12, y + rh / 2 - 0.045, z + 0.17], { jitter: 0 }); // lock
    }
  },
};

// ── curtains (built once per window; c.w is the window width) ─────────────────
function curtainPair(k: Kit, c: BuildCtx, cloth: string, rod: string, folds = 5) {
  const w = c.w;
  k.cyl(0.025, 0.025, w + 0.5, rod, [0, 2.12, c.wallZ + 0.1], 6, { rot: [0, 0, Math.PI / 2] });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < folds; i++) {
      const x = sx * (w / 2 + 0.05 - i * 0.07);
      k.box(0.08, 1.45, 0.06 + (i % 2) * 0.03, cloth, [x, 0.62, c.wallZ + 0.12 + (i % 2) * 0.02], { jitter: 0.08 });
    }
    k.box(0.1, 0.06, 0.12, rod, [sx * (w / 2 - 0.1), 1.05, c.wallZ + 0.14]);
  }
}

const curtains: FurnitureDef = {
  id: 'curtains',
  space: 'curtains',
  name: 'Curtains',
  level: 18,
  xp: 225,
  materials: [['Bolt of cloth', 3]],
  examine: 'They keep the light out of the screens.',
  model: (k, c) => curtainPair(k, c, '#7f1d1d', WOOD.oakDark),
};

const opulentCurtains: FurnitureDef = {
  id: 'opulent-curtains',
  space: 'curtains',
  name: 'Opulent curtains',
  level: 40,
  xp: 315,
  materials: [['Bolt of cloth', 3], ['Gold leaf', 1]],
  examine: 'Velvet. The tassels have tassels.',
  model: (k, c) => {
    curtainPair(k, c, '#4c1d95', WOOD.gilded, 7);
    k.box(c.w + 0.5, 0.22, 0.1, '#5b21b6', [0, 2.0, c.wallZ + 0.16]);
  },
};

/** The fabric is a marquee: the text scrolls, forever, at 1999 speed. */
const marqueeCurtains: FurnitureDef = {
  id: 'marquee-curtains',
  space: 'curtains',
  name: 'Marquee curtains',
  level: 31,
  xp: 260,
  materials: [['Bolt of cloth', 2], ['<marquee>', 1]],
  examine: 'Deprecated in 1997. Still going.',
  model: (k, c) => curtainPair(k, c, '#111827', '#9ca3af', 3),
  extras: (c) => {
    const tex = canvasTexture(512, 64, (g, w, h) => {
      g.fillStyle = '#111827';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#facc15';
      g.font = 'bold 34px monospace';
      g.textBaseline = 'middle';
      g.fillText('★ WELCOME TO MY HOUSE ★ UNDER CONSTRUCTION ', 6, h / 2);
    });
    tex.wrapS = THREE.RepeatWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w + 0.4, 0.22), new THREE.MeshBasicNodeMaterial({ map: tex }));
    m.position.set(0, 2.0, c.wallZ + 0.17);
    return [{ object: m, tick: (t) => { tex.offset.x = (t * 0.12) % 1; } }];
  },
};

export const PARLOUR: FurnitureDef[] = [
  crudeChair,
  rockingChair,
  oakArmchair,
  bezierChair,
  chairCopy,
  svgChair,
  brownRug,
  transparentRug,
  ditherRug,
  opulentRug,
  clayFireplace,
  gradientFireplace,
  stoneFireplace,
  marbleFireplace,
  woodenBookcase,
  layersBookcase,
  mahoganyBookcase,
  curtains,
  marqueeCurtains,
  opulentCurtains,
];

