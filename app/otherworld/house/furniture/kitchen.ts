/** Kitchen + dining room. Tea, nodes in the larder, a bell-pull with someone on the other end. */
import * as THREE from 'three/webgpu';
import { TEAS } from '../../state/items';
import { UI, WOOD, type Kit } from '../kit';
import { fireMaterial } from '../materials';
import { canvasTexture, legs4, workArt } from './common';
import type { BuildCtx, Extra, FurnitureDef } from './types';

// ── stoves ───────────────────────────────────────────────────────────────────
const BREW = [{ verb: 'Brew-tea', id: 'brew' }];

function smallFire(c: BuildCtx, x: number, y: number, z: number, s = 0.5): Extra {
  const g = new THREE.Group();
  const mat = fireMaterial(['#7c2d12', '#ea580c', '#fde047'], 3);
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 1.1), mat);
    m.position.set(x, y + s * 0.5, z);
    m.rotation.y = i * (Math.PI / 2) + 0.4;
    g.add(m);
  }
  return { object: g };
}

const firepitPot: FurnitureDef = {
  id: 'firepit-pot',
  space: 'stove',
  name: 'Firepit with pot',
  level: 11,
  xp: 131,
  materials: [['Steel bar', 2], ['Soft clay', 2]],
  examine: 'Stew, probably. Or tea. Hard to say with a pot.',
  actions: BREW,
  model: (k) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.dodeca(0.12, '#6b6a66', [Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38 + 0.05]);
    }
    for (const sx of [-1, 1]) k.box(0.05, 1.0, 0.05, WOOD.iron, [sx * 0.42, 0, 0.05]);
    k.box(0.9, 0.05, 0.05, WOOD.iron, [0, 1.0, 0.05]);
    k.cyl(0.006, 0.006, 0.3, WOOD.iron, [0, 0.72, 0.05], 4);
    k.lathe([[0.0, 0], [0.18, 0.02], [0.24, 0.15], [0.22, 0.3], [0.0, 0.3]], '#27272a', [0, 0.42, 0.05], 10);
  },
  extras: (c) => [smallFire(c, 0, 0.02, 0.05)],
  lights: () => [{ pos: [0, 0.5, 0.4], color: '#fb923c', intensity: 2, distance: 5, flicker: 0.35 }],
};

const steelRange: FurnitureDef = {
  id: 'steel-range',
  space: 'stove',
  name: 'Steel range',
  level: 34,
  xp: 240,
  materials: [['Steel bar', 4], ['Soft clay', 2]],
  examine: 'Six burners. You have only ever used the front left one.',
  actions: BREW,
  model: (k, c) => {
    const w = c.w * 0.9;
    k.box(w, 0.9, 0.75, '#3f3f46', [0, 0, c.wallZ + 0.4]);
    k.box(w + 0.04, 0.05, 0.8, '#18181b', [0, 0.9, c.wallZ + 0.4]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.torus(0.1, 0.02, '#71717a', [-w / 3 + (i * w) / 3, 0.96, c.wallZ + 0.25 + j * 0.3], 4, 10, Math.PI * 2, { rot: [Math.PI / 2, 0, 0] });
    k.box(w * 0.7, 0.42, 0.04, '#18181b', [0, 0.2, c.wallZ + 0.79]);
    k.box(w * 0.5, 0.03, 0.04, '#d4d4d8', [0, 0.66, c.wallZ + 0.82]);
    k.box(w * 0.8, 1.2, 0.5, '#52525b', [0, 1.4, c.wallZ + 0.25]);
  },
};

/** A range that only does one thing, very well: a kettle the size of a dog. */
const kettleRange: FurnitureDef = {
  id: 'kettle-range',
  space: 'stove',
  name: 'The Kettle',
  level: 42,
  xp: 320,
  materials: [['Steel bar', 4], ['Loose leaf', 30]],
  examine: 'It has one setting: tea. Brew some and you can run.',
  actions: BREW,
  model: (k, c) => {
    const w = c.w * 0.92;
    const z = c.wallZ + 0.42;
    k.box(w, 0.88, 0.8, '#1f2937', [0, 0, z]);
    k.box(w + 0.05, 0.06, 0.86, '#111827', [0, 0.88, z]);
    k.box(w * 0.75, 0.38, 0.04, '#0b0f17', [0, 0.22, z + 0.41]);
    k.box(0.12, 0.12, 0.04, '#ef4444', [w / 2 - 0.15, 0.7, z + 0.42], { jitter: 0 });
    // the kettle
    k.lathe([[0.0, 0], [0.38, 0], [0.46, 0.18], [0.44, 0.42], [0.3, 0.58], [0.12, 0.62], [0.0, 0.62]], '#e5e7eb', [0, 0.94, z], 14, { jitter: 0.02 });
    k.cyl(0.04, 0.06, 0.08, '#111827', [0, 1.55, z], 8);
    k.tube([[0.4, 1.2, z], [0.62, 1.38, z], [0.74, 1.62, z]], 0.05, '#e5e7eb', { seg: 10 });
    k.torus(0.28, 0.035, '#111827', [0, 1.62, z], 5, 14, Math.PI, { rot: [0, 0, 0] });
    // a tag with a teabag string
    k.cyl(0.004, 0.004, 0.5, '#f5f5f4', [-0.3, 1.1, z + 0.3], 3);
    k.box(0.12, 0.09, 0.01, '#16a34a', [-0.3, 1.0, z + 0.32]);
  },
  lights: (c) => [{ pos: [0, 1.4, c.wallZ + 1.0], color: '#fde68a', intensity: 0.9, distance: 4 }],
};

// ── larders ──────────────────────────────────────────────────────────────────
const SEARCH_LARDER = [{ verb: 'Search', id: 'larder' }];

const oakLarder: FurnitureDef = {
  id: 'oak-larder',
  space: 'larder',
  name: 'Oak larder',
  level: 33,
  xp: 480,
  materials: [['Oak plank', 8]],
  examine: 'Cheese, mostly.',
  actions: SEARCH_LARDER,
  model: (k, c) => {
    const w = c.w * 0.9;
    const z = c.wallZ + 0.28;
    k.box(w, 2.0, 0.55, WOOD.oak, [0, 0, z]);
    for (const sx of [-1, 1]) {
      k.box(w / 2 - 0.06, 1.8, 0.04, WOOD.oakDark, [sx * (w / 4), 0.1, z + 0.28]);
      k.box(0.04, 0.16, 0.04, '#d4a72c', [sx * 0.08, 1.0, z + 0.32]);
    }
  },
};

/** Open shelves stocked with shader nodes, as groceries. */
const nodeLarder: FurnitureDef = {
  id: 'node-larder',
  space: 'larder',
  name: 'Larder of nodes',
  level: 45,
  xp: 520,
  materials: [['Oak plank', 6], ['Noise', 3]],
  examine: 'Perlin loaf. Voronoi cheese. A jar of gradient. Best before: never.',
  actions: SEARCH_LARDER,
  model: (k, c) => {
    const w = c.w * 0.92;
    const z = c.wallZ + 0.25;
    k.box(w, 2.1, 0.04, WOOD.oakDark, [0, 0, c.wallZ + 0.02]);
    for (const sx of [-1, 1]) k.box(0.06, 2.1, 0.48, WOOD.oak, [sx * (w / 2 - 0.03), 0, z]);
    for (let s = 0; s < 4; s++) k.box(w, 0.05, 0.48, WOOD.oak, [0, 0.05 + s * 0.62, z]);
    // shelf 1: perlin loaves (lumpy)
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 0.3 + i * 0.5;
      k.push([x, 0.1, z], [0, (k.r() - 0.5) * 0.4, 0]);
      for (let j = 0; j < 5; j++) k.sphere(0.12 + k.r() * 0.03, '#c2843a', [-0.16 + j * 0.08, 0.1 + k.r() * 0.03, 0], 6, 4);
      k.pop();
    }
    // shelf 2: voronoi cheese wedges (yellow with dark holes)
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 0.3 + i * 0.5;
      k.extrude([[0, 0], [0.34, 0], [0, 0.2]], 0.26, '#facc15', [x - 0.1, 0.72, z], { rot: [0, k.r() * 0.6, 0] });
      for (let j = 0; j < 3; j++) k.sphere(0.03, '#a16207', [x + k.r() * 0.15 - 0.05, 0.76 + k.r() * 0.06, z + 0.13], 5, 3);
    }
    // shelf 3: gradient jam jars (glowing tops)
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.22 + i * 0.4;
      k.cyl(0.1, 0.1, 0.24, ['#f43f5e', '#a855f7', '#3b82f6', '#22c55e'][i], [x, 1.33, z], 8);
      k.cyl(0.105, 0.105, 0.05, '#fafafa', [x, 1.57, z], 8);
    }
    // shelf 4: a noise jar, labelled
    k.cyl(0.16, 0.16, 0.36, '#bfdbfe', [0.2, 1.95, z], 10, { jitter: 0.02 });
  },
  extras: (c) => {
    const tex = canvasTexture(64, 64, (g) => {
      const img = g.createImageData(64, 64);
      for (let i = 0; i < 64 * 64; i++) {
        const v = Math.random() * 255;
        img.data.set([v, v, v, 255], i * 4);
      }
      g.putImageData(img, 0, 0);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.24), new THREE.MeshBasicNodeMaterial({ map: tex }));
    m.position.set(0.2, 2.13, c.wallZ + 0.25 + 0.165);
    let acc = 0;
    return [
      {
        object: m,
        tick: (_t, dt) => {
          acc += dt;
          if (acc < 0.1) return;
          acc = 0;
          tex.offset.set(Math.random(), Math.random());
        },
      },
    ];
  },
};

// ── sinks ────────────────────────────────────────────────────────────────────
const pumpTub: FurnitureDef = {
  id: 'pump-tub',
  space: 'sink',
  name: 'Pump and tub',
  level: 7,
  xp: 200,
  materials: [['Steel bar', 5]],
  examine: 'Works by enthusiasm.',
  actions: [{ verb: 'Pump', id: 'pump' }],
  model: (k, c) => {
    const z = c.wallZ + 0.3;
    k.cyl(0.3, 0.26, 0.5, '#78716c', [0, 0, z + 0.05], 10);
    k.cyl(0.26, 0.26, 0.02, '#38bdf8', [0, 0.44, z + 0.05], 10, { jitter: 0.01 });
    k.cyl(0.06, 0.06, 1.2, WOOD.iron, [0.18, 0, z - 0.15], 6);
    k.box(0.36, 0.05, 0.05, WOOD.iron, [0.18 - 0.15, 1.15, z - 0.15], { rot: [0, 0, -0.4] });
    k.cyl(0.03, 0.03, 0.2, WOOD.iron, [0.18, 0.95, z - 0.05], 6, { rot: [Math.PI / 2, 0, 0] });
  },
};

const sink: FurnitureDef = {
  id: 'sink',
  space: 'sink',
  name: 'Sink',
  level: 47,
  xp: 300,
  materials: [['Steel bar', 5]],
  examine: 'Cups from 2019 live here now.',
  model: (k, c) => {
    const z = c.wallZ + 0.3;
    k.box(0.9, 0.85, 0.6, '#e7e5e4', [0, 0, z]);
    k.box(0.7, 0.06, 0.45, '#0c4a6e', [0, 0.8, z]);
    k.cyl(0.03, 0.03, 0.35, '#a1a1aa', [0, 0.85, z - 0.22], 6);
    k.cyl(0.025, 0.025, 0.2, '#a1a1aa', [0, 1.18, z - 0.12], 6, { rot: [Math.PI / 2, 0, 0] });
  },
};

// ── shelves ──────────────────────────────────────────────────────────────────
function wallShelves(k: Kit, c: BuildCtx, wood: string, rows = 2) {
  const w = c.w * 0.86;
  for (let r = 0; r < rows; r++) {
    const y = 1.05 + r * 0.45;
    k.box(w, 0.04, 0.24, wood, [0, y, c.wallZ + 0.12]);
    for (const sx of [-1, 1]) k.box(0.03, 0.12, 0.2, wood, [sx * (w / 2 - 0.08), y - 0.12, c.wallZ + 0.1]);
  }
  return w;
}

const woodShelves: FurnitureDef = {
  id: 'wood-shelves',
  space: 'shelf',
  name: 'Wooden shelves',
  level: 6,
  xp: 87,
  materials: [['Plank', 3], ['Soft clay', 6]],
  examine: 'Mugs. One says "WORLD\'S OKAYEST DEV".',
  model: (k, c) => {
    const w = wallShelves(k, c, WOOD.wood);
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 0.15 + i * 0.22;
      k.cyl(0.06, 0.05, 0.12, ['#fafafa', '#1d4ed8', '#dc2626'][i], [x, 1.09, c.wallZ + 0.13], 8);
      k.lathe([[0.0, 0], [0.12, 0], [0.13, 0.03], [0.0, 0.03]], '#e7e5e4', [x, 1.54, c.wallZ + 0.13], 10);
    }
  },
};

/** Ten tins, one per tea Tony keeps. Each is a different colour and a different opinion. */
const teaShelves: FurnitureDef = {
  id: 'tea-shelves',
  space: 'shelf',
  name: 'Tea shelves',
  level: 23,
  xp: 147,
  materials: [['Oak plank', 2], ['Loose leaf', 10]],
  examine: 'Ten teas. Steal one from the stall on the island; it tastes better stolen.',
  model: (k, c) => {
    const w = wallShelves(k, c, WOOD.oak, 2);
    const tins = ['#14532d', '#7c2d12', '#1e3a8a', '#a16207', '#7f1d1d', '#365314', '#4c1d95', '#0f766e', '#9a3412', '#334155'];
    tins.slice(0, Math.max(1, TEAS.length)).forEach((col, i) => {
      const row = i < 5 ? 0 : 1;
      const x = -w / 2 + 0.1 + (i % 5) * ((w - 0.2) / 4.5);
      k.cyl(0.055, 0.055, 0.17, col, [x, 1.09 + row * 0.45, c.wallZ + 0.13], 8);
      k.cyl(0.058, 0.058, 0.03, '#d4a72c', [x, 1.26 + row * 0.45, c.wallZ + 0.13], 8);
    });
  },
};

// ── barrels ──────────────────────────────────────────────────────────────────
function barrel(k: Kit, wood = WOOD.oak) {
  k.lathe([[0.0, 0], [0.26, 0], [0.32, 0.35], [0.26, 0.72], [0.0, 0.72]], wood, [0, 0, 0], 12);
  for (const y of [0.1, 0.36, 0.62]) k.torus(y === 0.36 ? 0.322 : 0.29, 0.018, WOOD.iron, [0, y, 0], 4, 14, Math.PI * 2, { rot: [Math.PI / 2, 0, 0] });
}

const beerBarrel: FurnitureDef = {
  id: 'beer-barrel',
  space: 'barrel',
  name: 'Cold brew barrel',
  level: 7,
  xp: 87,
  materials: [['Plank', 3]],
  examine: 'Steeped for 18 hours. Do not ask what in.',
  model: (k) => {
    barrel(k);
    k.cyl(0.03, 0.03, 0.12, '#a1a1aa', [0, 0.18, 0.3], 6, { rot: [Math.PI / 2, 0, 0] });
  },
};

/** A barrel overflowing with loose pixels. Some are subpixels. */
const pixelBarrel: FurnitureDef = {
  id: 'pixel-barrel',
  space: 'barrel',
  name: 'Barrel of loose pixels',
  level: 19,
  xp: 120,
  materials: [['Plank', 3], ['Pixel', 400]],
  examine: 'Spilled from a canvas resize. Keep away from vectors.',
  actions: [{ verb: 'Take-pixel', id: 'take-pixel' }],
  model: (k) => {
    barrel(k, WOOD.teak);
    const cols = ['#ef4444', '#22c55e', '#3b82f6', '#fafafa', '#facc15', '#e879f9'];
    for (let i = 0; i < 60; i++) {
      const a = k.r() * Math.PI * 2;
      const r = Math.sqrt(k.r()) * 0.27;
      const s = 0.05 + k.r() * 0.03;
      k.box(s, s, s, cols[i % cols.length], [Math.cos(a) * r, 0.68 + k.r() * 0.14, Math.sin(a) * r], { rot: [k.r(), k.r(), k.r()], jitter: 0 });
    }
    for (let i = 0; i < 9; i++) {
      const a = k.r() * Math.PI * 2;
      const r = 0.35 + k.r() * 0.35;
      k.box(0.06, 0.06, 0.06, cols[i % cols.length], [Math.cos(a) * r, 0, Math.sin(a) * r], { rot: [0, k.r(), 0], jitter: 0 });
    }
  },
};

// ── cat basket ───────────────────────────────────────────────────────────────
/**
 * Just the basket and its cushion: the cat (scene/PetCat.tsx) curls up in it
 * when it naps, and brings its own z's.
 */
const catBasket: FurnitureDef = {
  id: 'cat-basket',
  space: 'cat-basket',
  name: 'Cushioned basket',
  level: 41,
  xp: 58,
  materials: [['Plank', 2], ['Wool', 2]],
  examine: 'A wicker basket with a red cushion. The dent in the middle is exactly cat-shaped.',
  actions: [{ verb: 'Pet', id: 'pet-cat' }],
  model: (k) => {
    k.lathe([[0.0, 0], [0.34, 0], [0.38, 0.18], [0.33, 0.2], [0.29, 0.06], [0.0, 0.06]], '#a16207', [0, 0, 0], 12);
    // the cushion, dipped in the middle where someone sleeps
    k.lathe([[0.0, 0.0], [0.29, 0.0], [0.29, 0.04], [0.24, 0.05], [0.14, 0.03], [0.0, 0.025]], '#dc2626', [0, 0.06, 0], 12);
  },
};

// ── kitchen tables ───────────────────────────────────────────────────────────
function table(k: Kit, w: number, d: number, h: number, wood: string, top = 0.06) {
  k.box(w, top, d, wood, [0, h - top, 0]);
  legs4(k, w, d, h - top, 0.08, wood, 0.08);
}

const oakKitchenTable: FurnitureDef = {
  id: 'oak-kitchen-table',
  space: 'kitchen-table',
  name: 'Oak kitchen table',
  level: 32,
  xp: 180,
  materials: [['Oak plank', 3]],
  examine: 'Teapot, two cups, one coaster. Someone is losing.',
  model: (k, c) => {
    table(k, c.w * 0.8, c.d * 0.7, 0.78, WOOD.oak);
    k.lathe([[0.0, 0], [0.11, 0], [0.14, 0.1], [0.1, 0.17], [0.0, 0.18]], '#fafafa', [0, 0.78, 0], 10);
    k.cyl(0.05, 0.04, 0.08, '#1d4ed8', [0.3, 0.78, 0.2], 8);
    k.cyl(0.05, 0.04, 0.08, '#fafafa', [-0.35, 0.78, -0.1], 8);
  },
};

/** Auto layout: the legs space themselves evenly, and the spacing is labelled in pink. */
const autoLayoutTable: FurnitureDef = {
  id: 'autolayout-table',
  space: 'kitchen-table',
  name: 'Table (Auto layout)',
  level: 38,
  xp: 260,
  materials: [['Oak plank', 3], ['Constraint', 4]],
  examine: 'Gap: 24. Padding: 12. Height: hug contents. It has never wobbled.',
  model: (k, c) => {
    const w = c.w * 0.86;
    const d = c.d * 0.7;
    k.box(w, 0.06, d, WOOD.oak, [0, 0.72, 0]);
    const n = 4;
    const gap = (w - 0.16) / (n - 1);
    for (let i = 0; i < n; i++)
      for (const sz of [-1, 1]) k.box(0.07, 0.72, 0.07, WOOD.oakDark, [-w / 2 + 0.08 + i * gap, 0, sz * (d / 2 - 0.08)]);
    // spacing indicators between legs (front)
    for (let i = 0; i < n - 1; i++) {
      const x = -w / 2 + 0.08 + (i + 0.5) * gap;
      k.box(gap - 0.12, 0.012, 0.012, UI.pink, [x, 0.38, d / 2 - 0.02], { jitter: 0 });
      k.box(0.16, 0.08, 0.012, UI.pink, [x, 0.42, d / 2 - 0.015], { jitter: 0 });
    }
    // a teacup and a mug, perfectly centred
    k.cyl(0.05, 0.04, 0.08, '#fafafa', [-0.25, 0.78, 0], 8);
    k.cyl(0.05, 0.04, 0.08, '#3b82f6', [0.25, 0.78, 0], 8);
  },
};

// ── dining ───────────────────────────────────────────────────────────────────
const oakDiningTable: FurnitureDef = {
  id: 'oak-dining-table',
  space: 'dining-table',
  name: 'Carved oak table',
  level: 31,
  xp: 360,
  materials: [['Oak plank', 6]],
  examine: 'Seats eight. Has seated two, plus a laptop.',
  model: (k, c) => {
    const w = c.w * 0.92;
    const d = c.d * 0.62;
    k.box(w, 0.08, d, WOOD.oak, [0, 0.72, 0]);
    k.box(w - 0.1, 0.05, d - 0.1, WOOD.oakDark, [0, 0.68, 0]);
    for (const sx of [-1, 1]) {
      k.lathe([[0.0, 0], [0.12, 0], [0.07, 0.08], [0.09, 0.3], [0.06, 0.5], [0.08, 0.68], [0.0, 0.68]], WOOD.oakDark, [sx * (w / 2 - 0.25), 0, 0], 8);
    }
    k.box(w - 0.5, 0.06, 0.06, WOOD.oakDark, [0, 0.2, 0]);
    // runner + candles + plates
    k.box(w * 0.85, 0.01, 0.28, '#7f1d1d', [0, 0.8, 0]);
    for (const x of [-0.6, 0, 0.6]) {
      k.cyl(0.05, 0.06, 0.04, WOOD.gilded, [x, 0.81, 0], 8);
      k.cyl(0.025, 0.025, 0.22, '#fef3c7', [x, 0.85, 0], 6);
    }
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.45 + (i % 3) * ((w - 0.9) / 2);
      const z = i < 3 ? -d / 2 + 0.2 : d / 2 - 0.2;
      k.cyl(0.13, 0.12, 0.015, '#fafafa', [x, 0.8, z], 12);
    }
  },
  extras: () => {
    const g = new THREE.Group();
    const mat = fireMaterial(['#9a3412', '#fb923c', '#fef9c3'], 3);
    for (const x of [-0.6, 0, 0.6]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), mat);
      m.position.set(x, 1.13, 0);
      g.add(m);
      const m2 = m.clone();
      m2.rotation.y = Math.PI / 2;
      g.add(m2);
    }
    return [{ object: g }];
  },
  lights: () => [{ pos: [0, 1.3, 0], color: '#fdba74', intensity: 1.6, distance: 5, flicker: 0.25 }],
};

const oakBench: FurnitureDef = {
  id: 'oak-bench',
  space: 'seating',
  name: 'Oak bench',
  level: 22,
  xp: 240,
  materials: [['Oak plank', 4]],
  examine: 'Long enough for a stand-up. Uncomfortable enough to keep it short.',
  actions: [{ verb: 'Sit-on', id: 'sit' }],
  model: (k, c) => {
    const w = c.w * 0.9;
    k.box(w, 0.06, 0.38, WOOD.oak, [0, 0.42, 0.05]);
    for (const sx of [-1, 0, 1]) k.box(0.07, 0.42, 0.32, WOOD.oakDark, [sx * (w / 2 - 0.15), 0, 0.05]);
    k.box(w, 0.42, 0.05, WOOD.oak, [0, 0.48, -0.17], { rot: [-0.12, 0, 0] });
  },
};

const BELL = [{ verb: 'Ring', id: 'ring-bell' }];
const bellPull: FurnitureDef = {
  id: 'bell-pull',
  space: 'bell-pull',
  name: 'Posh bell-pull',
  level: 60,
  xp: 420,
  materials: [['Teak plank', 1], ['Bolt of cloth', 2], ['Gold leaf', 1]],
  examine: 'Ring it. Someone is always viewing this file.',
  actions: BELL,
  model: (k, c) => {
    const z = c.wallZ + 0.06;
    k.box(0.12, 0.08, 0.1, WOOD.gilded, [0, 2.25, z]);
    k.box(0.07, 1.4, 0.03, '#7f1d1d', [0, 0.85, z + 0.02]);
    k.cone(0.07, 0.2, WOOD.gilded, [0, 0.6, z + 0.03], 6, { rot: [Math.PI, 0, 0] });
    for (let i = 0; i < 5; i++) k.box(0.072, 0.015, 0.032, WOOD.gilded, [0, 1.0 + i * 0.25, z + 0.025]);
  },
};

/** A cork board of pinned references, with red string. Shows one of the works big. */
const moodBoard: FurnitureDef = {
  id: 'mood-board',
  space: 'decoration',
  name: 'Mood board',
  level: 36,
  xp: 300,
  materials: [['Cork', 2], ['Push pin', 14], ['Red string', 1]],
  examine: 'Every great project starts here. Most of them end here too.',
  showsWork: true,
  actions: [{ verb: 'Inspect', id: 'inspect-work' }],
  model: (k, c) => {
    const w = c.w * 0.9;
    const z = c.wallZ + 0.04;
    k.box(w, 1.3, 0.05, '#b08458', [0, 0.95, z], { jitter: 0.08 });
    k.box(w + 0.08, 0.06, 0.07, WOOD.oakDark, [0, 0.92, z]);
    k.box(w + 0.08, 0.06, 0.07, WOOD.oakDark, [0, 2.25, z]);
    const cards = ['#fef3c7', '#fde68a', '#fafafa', '#fbcfe8', '#bfdbfe', '#bbf7d0'];
    const pins: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const x = -w / 2 + 0.3 + k.r() * (w - 0.6);
      const y = 1.1 + k.r() * 0.95;
      if (Math.abs(x) < 0.55 && y > 1.25 && y < 2.0) continue;
      k.box(0.22, 0.16, 0.01, cards[i % cards.length], [x, y, z + 0.035], { rot: [0, 0, (k.r() - 0.5) * 0.3] });
      k.sphere(0.022, '#dc2626', [x, y + 0.12, z + 0.05], 5, 3);
      pins.push([x, y + 0.12, z + 0.055]);
    }
    for (let i = 1; i < pins.length; i++) k.tube([pins[i - 1], pins[i]], 0.006, '#dc2626', { seg: 2, radial: 3, jitter: 0 });
  },
  extras: (c) => [workArt(c.work, 1.0, 0.66, [0, 1.62, c.wallZ + 0.075], { border: true })],
};

export const KITCHEN: FurnitureDef[] = [
  firepitPot,
  steelRange,
  kettleRange,
  oakLarder,
  nodeLarder,
  pumpTub,
  sink,
  woodShelves,
  teaShelves,
  beerBarrel,
  pixelBarrel,
  catBasket,
  oakKitchenTable,
  autoLayoutTable,
  oakDiningTable,
  oakBench,
  bellPull,
  moodBoard,
];
