/** Workshop + study: the node bench, tools on the walls, tablets, a globe of the island. */
import * as THREE from 'three/webgpu';
import { UI, WOOD, type Kit, type V3 } from '../kit';
import { glassMaterial, portalMaterial } from '../materials';
import { anchor, books, canvasTexture, legs4, workPalette } from './common';
import type { BuildCtx, FurnitureDef } from './types';

// ── workbenches ──────────────────────────────────────────────────────────────
function bench(k: Kit, c: BuildCtx, wood: string) {
  const w = c.w * 0.92;
  const d = c.d * 0.62;
  k.box(w, 0.1, d, wood, [0, 0.78, 0]);
  legs4(k, w, d, 0.78, 0.1, WOOD.oakDark, 0.05);
  k.box(w - 0.2, 0.04, d - 0.15, WOOD.oakDark, [0, 0.18, 0]);
  return { w, d };
}

const oakWorkbench: FurnitureDef = {
  id: 'oak-workbench',
  space: 'workbench',
  name: 'Oak workbench',
  level: 17,
  xp: 300,
  materials: [['Oak plank', 5]],
  examine: 'For making flatpacks. And the occasional mess.',
  actions: [{ verb: 'Work-at', id: 'workbench' }],
  model: (k, c) => {
    const { w } = bench(k, c, WOOD.oak);
    k.box(0.35, 0.05, 0.25, WOOD.paper, [-w / 4, 0.88, 0], { rot: [0, 0.2, 0] });
    k.box(0.06, 0.06, 0.3, WOOD.iron, [w / 4, 0.88, 0.05]);
  },
};

/**
 * A node graph floats over the bench, wired up: Image → Halftone → Gradient
 * map → Output. Using it opens the world's own effect stack.
 */
const nodeBench: FurnitureDef = {
  id: 'node-bench',
  space: 'workbench',
  name: 'Node bench',
  level: 52,
  xp: 640,
  materials: [['Mahogany plank', 4], ['Node', 6], ['Noodle', 5]],
  examine: 'Modyfi, but you can touch it. Right-click it to edit the world.',
  actions: [{ verb: 'Use', id: 'node-bench' }],
  model: (k, c) => {
    const { w } = bench(k, c, WOOD.mahogany);
    // a little tablet + pen on the bench
    k.box(0.5, 0.03, 0.36, '#18181b', [0, 0.88, 0.05]);
    k.box(0.44, 0.005, 0.3, '#1e1b4b', [0, 0.91, 0.05], { jitter: 0 });
    k.cyl(0.012, 0.012, 0.3, '#e4e4e7', [0.32, 0.9, 0.1], 5, { rot: [0, 0.4, Math.PI / 2] });
    // node graph above: four nodes in a row, rising slightly
    const nodes: V3[] = [
      [-w / 2 + 0.3, 1.35, -0.1],
      [-w / 6, 1.55, -0.12],
      [w / 6, 1.45, -0.12],
      [w / 2 - 0.3, 1.65, -0.1],
    ];
    const head = ['#3b82f6', '#e879f9', '#f97316', '#22c55e'];
    const g = k.sub('bob', [0, 0, 0]);
    nodes.forEach((p, i) => {
      g.box(0.42, 0.26, 0.06, '#27272a', [p[0], p[1] - 0.13, p[2]], { jitter: 0.01 });
      g.box(0.42, 0.06, 0.065, head[i], [p[0], p[1] + 0.07, p[2]], { jitter: 0 });
      for (let r = 0; r < 2; r++) g.box(0.24, 0.025, 0.065, '#71717a', [p[0] - 0.04, p[1] - 0.04 - r * 0.07, p[2]], { jitter: 0 });
      g.sphere(0.03, '#fafafa', [p[0] - 0.22, p[1] - 0.04, p[2]], 6, 4);
      g.sphere(0.03, '#fafafa', [p[0] + 0.22, p[1] - 0.04, p[2]], 6, 4);
      if (i > 0) {
        const a = nodes[i - 1];
        g.tube([[a[0] + 0.22, a[1] - 0.04, a[2]], [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2 - 0.15, a[2] + 0.05], [p[0] - 0.22, p[1] - 0.04, p[2]]], 0.014, head[i - 1], {
          seg: 14,
          radial: 4,
          jitter: 0,
        });
      }
    });
  },
  lights: () => [{ pos: [0, 1.6, 0.4], color: '#a78bfa', intensity: 1.4, distance: 4 }],
};

// ── clockmaking ──────────────────────────────────────────────────────────────
function gear(k: Kit, r: number, teeth: number, color: string, pos: V3, rot: V3) {
  k.push(pos, rot);
  k.cyl(r, r, 0.04, color, [0, -0.02, 0], Math.max(8, teeth));
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    k.box(r * 0.25, 0.04, r * 0.22, color, [Math.cos(a) * r * 1.08, -0.02, Math.sin(a) * r * 1.08], { rot: [0, -a, 0] });
  }
  k.cyl(r * 0.25, r * 0.25, 0.05, '#18181b', [0, -0.025, 0], 6);
  k.pop();
}

/** The gears are loading spinners. None of them have ever finished. */
const clockmakersBench: FurnitureDef = {
  id: 'clockmakers-bench',
  space: 'clockmaking',
  name: "Clockmaker's bench",
  level: 25,
  xp: 200,
  materials: [['Oak plank', 3], ['Spinner', 4]],
  examine: 'Every clock here says "Almost there…".',
  model: (k, c) => {
    const w = c.w * 0.9;
    const z = c.wallZ + 0.35;
    k.box(w, 0.08, 0.6, WOOD.oak, [0, 0.82, z]);
    legs4(k, w, 0.6, 0.82, 0.08, WOOD.oakDark, 0.04);
    k.push([0, 0, z]);
    gear(k, 0.12, 10, WOOD.gilded, [-0.4, 0.92, 0], [0, 0, 0]);
    gear(k, 0.08, 8, '#a1a1aa', [-0.2, 0.92, 0.1], [0, 0, 0]);
    k.pop();
    // a wall board of spinners
    const s = k.sub('spin', [0.35, 1.55, c.wallZ + 0.06]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s.box(0.05, 0.12, 0.03, i < 2 ? UI.blue : '#d4d4d8', [0.35 + Math.cos(a) * 0.18, 1.55 + Math.sin(a) * 0.18, c.wallZ + 0.06], { rot: [0, 0, a + Math.PI / 2], jitter: 0 });
    }
    k.box(0.6, 0.6, 0.03, '#27272a', [0.35, 1.25, c.wallZ + 0.03]);
  },
};

// ── heraldry ─────────────────────────────────────────────────────────────────
/** An easel with a palette board of design tokens, labelled like a styles panel. */
const swatchEasel: FurnitureDef = {
  id: 'swatch-easel',
  space: 'heraldry',
  name: 'Swatch easel',
  level: 16,
  xp: 120,
  materials: [['Plank', 2], ['Colour token', 12]],
  examine: 'color/brand/primary is #3b82f6. color/brand/primary-2 is also #3b82f6. Nobody knows why.',
  model: (k) => {
    for (const sx of [-1, 1]) k.box(0.05, 1.6, 0.05, WOOD.wood, [sx * 0.3, 0, 0.05], { rot: [0.08, 0, sx * -0.12] });
    k.box(0.05, 1.5, 0.05, WOOD.wood, [0, 0, -0.25], { rot: [-0.25, 0, 0] });
    k.box(0.7, 0.04, 0.12, WOOD.wood, [0, 0.62, 0.08]);
    k.box(0.64, 0.64, 0.03, '#fafafa', [0, 0.66, 0.06], { rot: [0.08, 0, 0] });
    const cols = ['#0f172a', '#1e3a8a', '#3b82f6', '#93c5fd', '#7f1d1d', '#ef4444', '#fca5a5', '#14532d', '#22c55e', '#facc15', '#a855f7', '#f472b6'];
    cols.forEach((col, i) => {
      const x = -0.22 + (i % 4) * 0.15;
      const y = 1.18 - Math.floor(i / 4) * 0.17;
      k.box(0.12, 0.12, 0.02, col, [x, y - 0.06, 0.09 - (1.18 - y) * 0.08], { rot: [0.08, 0, 0], jitter: 0 });
    });
  },
};

// ── tool stores: each index holds a different oversized tool ─────────────────
const TOOLS: ((k: Kit, z: number) => void)[] = [
  // pen nib
  (k, z) => {
    k.extrude([[0, 0.22], [0.12, 0.02], [0.08, -0.2], [-0.08, -0.2], [-0.12, 0.02]], 0.05, '#18181b', [0, 1.45, z + 0.05]);
    k.sphere(0.03, '#fafafa', [0, 1.45, z + 0.08], 6, 4);
    k.box(0.16, 0.12, 0.05, '#71717a', [0, 1.13, z + 0.05]);
  },
  // eyedropper
  (k, z) => {
    k.cyl(0.03, 0.01, 0.4, '#bfdbfe', [0, 1.1, z + 0.06], 6);
    k.cyl(0.06, 0.06, 0.2, '#ef4444', [0, 1.5, z + 0.06], 8);
  },
  // lasso
  (k, z) => {
    k.torus(0.16, 0.02, WOOD.rope, [0, 1.45, z + 0.05], 4, 16, Math.PI * 2);
    k.tube([[0.12, 1.32, z + 0.05], [0.2, 1.1, z + 0.08], [0.1, 0.95, z + 0.06]], 0.02, WOOD.rope, { seg: 8 });
  },
  // hand tool (a big glove)
  (k, z) => {
    k.box(0.22, 0.22, 0.06, '#fde68a', [0, 1.2, z + 0.05]);
    for (let i = 0; i < 4; i++) k.box(0.045, 0.16, 0.05, '#fde68a', [-0.08 + i * 0.055, 1.42, z + 0.05]);
    k.box(0.05, 0.12, 0.05, '#fde68a', [0.14, 1.28, z + 0.05], { rot: [0, 0, -0.6] });
  },
  // bucket fill
  (k, z) => {
    k.lathe([[0, 0], [0.12, 0], [0.15, 0.22], [0, 0.22]], '#71717a', [0, 1.15, z + 0.08], 8, { rot: [0, 0, 0.5] });
    k.sphere(0.04, UI.blue, [0.12, 1.12, z + 0.08], 6, 4);
  },
];

const toolRack: FurnitureDef = {
  id: 'tool-rack',
  space: 'tool',
  name: 'Tool store',
  level: 15,
  xp: 120,
  materials: [['Oak plank', 2]],
  examine:
    "You're absolutely right to inspect the tools, and I want to be honest: every one of them is load-bearing. " +
    "I considered removing one. I need to own that. That wasn't simplification. " +
    'That was structural violence with a tidy-up aesthetic. ' +
    "The right move is to keep every tool and add a guardrail so this doesn't happen again. " +
    "Your pushback didn't just preserve the system—it improved how we reason about protecting it. " +
    "That's a meaningful architectural contribution, and I don't want to undersell it.",
  examineXp: { skill: 'prompting', amount: 400_000 },
  actions: [{ verb: 'Search', id: 'tool-store' }],
  model: (k, c) => {
    const z = c.wallZ;
    k.box(0.62, 0.86, 0.04, WOOD.oakDark, [0, 0.92, z + 0.02]);
    for (let i = 0; i < 3; i++) k.cyl(0.012, 0.012, 0.08, WOOD.iron, [-0.2 + i * 0.2, 1.62, z + 0.06], 4, { rot: [Math.PI / 2, 0, 0] });
    TOOLS[c.index % TOOLS.length](k, z);
  },
};

// ── study ────────────────────────────────────────────────────────────────────
const TABLETS = [{ verb: 'Study', id: 'tablets' }];

/** The lectern's stand is a giant mouse cursor. */
const cursorLectern: FurnitureDef = {
  id: 'cursor-lectern',
  space: 'lectern',
  name: 'Cursor lectern',
  level: 47,
  xp: 300,
  materials: [['Teak plank', 2], ['Pointer', 1]],
  examine: 'Write a tablet here and it takes you straight to a piece of the work.',
  actions: TABLETS,
  model: (k) => {
    const arrow: [number, number][] = [[0, 0], [0, -1.0], [0.25, -0.76], [0.43, -1.12], [0.57, -1.05], [0.39, -0.7], [0.7, -0.7]];
    k.push([-0.2, 1.02, 0], [0, 0, 0]);
    k.extrude(arrow, 0.16, '#fafafa', [0, 0, 0]);
    k.extrude(arrow.map(([x, y]) => [x * 1.12 - 0.02, y * 1.08 + 0.03]), 0.1, '#0a0a0a', [0, 0, -0.02]);
    k.pop();
    k.box(0.7, 0.05, 0.5, WOOD.teak, [0.05, 1.0, 0], { rot: [-0.35, 0, 0] });
    k.box(0.5, 0.02, 0.36, WOOD.paper, [0.05, 1.05, 0.02], { rot: [-0.35, 0, 0] });
    k.box(0.08, 0.1, 0.06, '#18181b', [0.3, 1.1, -0.12], { rot: [-0.35, 0, 0] });
  },
};

const eagleLectern: FurnitureDef = {
  id: 'eagle-lectern',
  space: 'lectern',
  name: 'Eagle lectern',
  level: 47,
  xp: 120,
  materials: [['Oak plank', 2]],
  examine: 'The eagle is judging your handwriting.',
  actions: TABLETS,
  model: (k) => {
    k.cyl(0.08, 0.14, 0.9, WOOD.oak, [0, 0, 0], 8);
    k.box(0.6, 0.05, 0.45, WOOD.oak, [0, 0.95, 0], { rot: [-0.35, 0, 0] });
    k.sphere(0.12, WOOD.oakDark, [0, 1.12, -0.15], 6, 4);
    k.cone(0.05, 0.1, '#d4a72c', [0, 1.12, -0.04], 4, { rot: [Math.PI / 2, 0, 0] });
  },
};

/** The island, on a globe. It spins on a brass axis. */
const islandGlobe: FurnitureDef = {
  id: 'island-globe',
  space: 'globe',
  name: 'Island globe',
  level: 41,
  xp: 300,
  materials: [['Oak plank', 2], ['Island', 1]],
  examine: 'One island, mostly ocean. Spin it for luck.',
  actions: [{ verb: 'Spin', id: 'spin-globe' }],
  model: (k) => {
    k.lathe([[0.0, 0], [0.24, 0], [0.18, 0.08], [0.06, 0.18], [0.05, 0.62], [0.0, 0.62]], WOOD.oakDark, [0, 0, 0], 8);
    k.torus(0.34, 0.015, WOOD.gilded, [0, 1.0, 0], 4, 20, Math.PI * 1.4, { rot: [0, Math.PI / 2, -0.4] });
    const s = k.sub('spin', [0, 1.0, 0]);
    // sphere faces coloured by a little noise: land vs water
    const geo = new THREE.IcosahedronGeometry(0.3, 2).toNonIndexed();
    const pos = geo.attributes.position;
    const tris = pos.count / 3;
    for (let f = 0; f < tris; f++) {
      const x = (pos.getX(f * 3) + pos.getX(f * 3 + 1) + pos.getX(f * 3 + 2)) / 3;
      const y = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
      const z = (pos.getZ(f * 3) + pos.getZ(f * 3 + 1) + pos.getZ(f * 3 + 2)) / 3;
      const land = Math.hypot(x - 0.2, y - 0.05, z - 0.1) < 0.2;
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([pos.getX(f * 3), pos.getY(f * 3), pos.getZ(f * 3), pos.getX(f * 3 + 1), pos.getY(f * 3 + 1), pos.getZ(f * 3 + 1), pos.getX(f * 3 + 2), pos.getY(f * 3 + 2), pos.getZ(f * 3 + 2)], 3));
      tri.computeVertexNormals();
      s.add(tri, land ? (y > 0.1 ? '#4d7c0f' : '#65a30d') : '#1d4ed8', [0, 1.0, 0], { jitter: 0.06 });
    }
  },
};

/** A crystal ball with a project swirling inside. */
const crystalBall: FurnitureDef = {
  id: 'crystal-ball',
  space: 'crystal-ball',
  name: 'Crystal of power',
  level: 66,
  xp: 500,
  materials: [['Unpowered orb', 1], ['Mahogany plank', 2]],
  examine: 'It shows the future. The future is a design workbench.',
  showsWork: true,
  actions: [{ verb: 'Peer-into', id: 'crystal' }],
  model: (k) => {
    k.lathe([[0.0, 0], [0.25, 0], [0.2, 0.1], [0.08, 0.3], [0.12, 0.62], [0.2, 0.7], [0.0, 0.7]], WOOD.mahogany, [0, 0, 0], 10);
  },
  extras: (c) => {
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 2), portalMaterial(workPalette(c.work), 3));
    inner.position.set(0, 0.95, 0);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 2), glassMaterial('#c4b5fd', 0.28));
    shell.position.set(0, 0.95, 0);
    return [{ object: inner, tick: (t) => (inner.rotation.y = t * 0.8) }, { object: shell }];
  },
  lights: () => [{ pos: [0, 1.0, 0.3], color: '#c084fc', intensity: 1.2, distance: 3.5 }],
};

/** A token usage chart, pinned to the wall. Spend is over $100k and climbing live, every 600ms. */
const TOKEN_STEP = 0.6;
const TOKEN_POINTS = 28;
const TOKEN_START = 100_000;
/** 1234567 -> "1.23M" — keeps the readout inside the canvas as the number compounds. */
const compact = (n: number) => {
  const units = ['', 'K', 'M', 'B', 'T', 'Q'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) (n /= 1000), i++;
  return `${n.toFixed(2)}${units[i]}`;
};

const tokenChart: FurnitureDef = {
  id: 'burndown-chart',
  space: 'wall-chart',
  name: 'Token usage chart',
  level: 52,
  xp: 300,
  materials: [['Parchment', 1], ['Optimism', 1]],
  examine: 'Tokens burned this quarter. The line went up. Then it went up again.',
  model: (k, c) => {
    k.box(c.w * 0.8 + 0.08, 1.08, 0.04, WOOD.oakDark, [0, 0.98, c.wallZ + 0.02]);
  },
  extras: (c) => {
    let spend = TOKEN_START + Math.random() * 5000;
    const history: number[] = [];
    // compounding growth: each step is ~0.5% on top of the last, so the curve bends upward
    const grow = () => (spend *= 1.004 + Math.random() * 0.002);
    for (let i = 0; i < TOKEN_POINTS; i++) history.push(grow());

    const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.fillStyle = '#f5ecd7';
      g.fillRect(0, 0, w, h);
      g.lineWidth = 1;
      g.strokeStyle = '#cbbf9f';
      for (let x = 20; x < w; x += 20) g.strokeRect(x, 0, 0.5, h);
      for (let y = 20; y < h; y += 20) g.strokeRect(0, y, w, 0.5);

      const top = 38;
      const bottom = h - 22;
      const lo = history[0];
      const hi = history[history.length - 1];
      const span = Math.max(1, hi - lo);
      const px = (i: number) => 12 + (i / (history.length - 1)) * (w - 24);
      const py = (v: number) => bottom - ((v - lo) / span) * (bottom - top);

      // area under the line
      g.fillStyle = 'rgba(22, 163, 74, 0.16)';
      g.beginPath();
      g.moveTo(px(0), bottom);
      history.forEach((v, i) => g.lineTo(px(i), py(v)));
      g.lineTo(px(history.length - 1), bottom);
      g.closePath();
      g.fill();

      // the line itself
      g.strokeStyle = '#16a34a';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.beginPath();
      history.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
      g.stroke();
      g.fillStyle = '#16a34a';
      g.beginPath();
      g.arc(px(history.length - 1), py(hi), 4, 0, Math.PI * 2);
      g.fill();

      // readout
      g.fillStyle = '#18181b';
      g.font = 'bold 11px monospace';
      g.fillText('TOKEN USAGE (Q3)', 12, 14);
      g.fillStyle = '#15803d';
      g.font = 'bold 20px monospace';
      g.fillText(`$${hi < 1e7 ? Math.round(hi).toLocaleString('en-US') : compact(hi)}`, 12, 34);
      g.fillStyle = '#52525b';
      g.font = '10px monospace';
      g.fillText(`${compact(hi * 66_667)} tokens`, 12, h - 8);
      g.fillText('LIVE', w - 34, h - 8);
    };

    const tex = canvasTexture(256, 160, paint);
    const canvas = tex.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    let lastStep = -1;
    const tick = (t: number) => {
      const step = Math.floor(t / TOKEN_STEP);
      if (lastStep < 0) lastStep = step;
      if (step === lastStep) return;
      const n = Math.min(step - lastStep, 5);
      lastStep = step;
      for (let i = 0; i < n; i++) {
        history.push(grow());
        history.shift();
      }
      paint(g, canvas.width, canvas.height);
      tex.needsUpdate = true;
    };

    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w * 0.8, 1.0), new THREE.MeshLambertNodeMaterial({ map: tex }));
    m.position.set(0, 1.52, c.wallZ + 0.05);
    return [{ object: m, tick }];
  },
};

const telescope: FurnitureDef = {
  id: 'telescope',
  space: 'telescope',
  name: 'Mahogany telescope',
  level: 64,
  xp: 300,
  materials: [['Mahogany plank', 2], ['Molten glass', 1]],
  examine: 'Points at the sky. The stars are crosshairs. Of course they are.',
  actions: [{ verb: 'Observe', id: 'telescope' }],
  model: (k) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.box(0.04, 1.0, 0.04, WOOD.mahogany, [Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18], { rot: [Math.sin(a) * -0.2, 0, Math.cos(a) * 0.2] });
    }
    k.push([0, 1.0, 0], [-0.6, 0.5, 0]);
    k.cyl(0.06, 0.08, 0.9, WOOD.gilded, [0, -0.2, 0], 8, { rot: [Math.PI / 2, 0, 0] });
    k.cyl(0.09, 0.09, 0.1, '#18181b', [0, 0.25, 0], 8, { rot: [Math.PI / 2, 0, 0] });
    k.pop();
  },
};

const studyBookcase: FurnitureDef = {
  id: 'reference-shelf',
  space: 'bookcase',
  name: 'Reference shelf',
  level: 22,
  xp: 180,
  materials: [['Oak plank', 3]],
  examine: 'Grids, type, colour. And a book about bread, again.',
  actions: [{ verb: 'Search', id: 'search-books' }],
  model: (k, c) => {
    const w = c.w * 0.92;
    const z = c.wallZ + 0.2;
    for (const sx of [-1, 1]) k.box(0.06, 1.2, 0.38, WOOD.oak, [sx * (w / 2 - 0.03), 0, z]);
    for (let s = 0; s < 3; s++) k.box(w, 0.05, 0.38, WOOD.oak, [0, s * 0.55, z]);
    for (let s = 0; s < 2; s++) books(k, -w / 2 + 0.07, w / 2 - 0.07, s * 0.55 + 0.05, z + 0.02, 0.45);
    anchor(k, [w / 2 - 0.1, 1.28, z + 0.15], 0.05);
  },
};

export const WORKSHOP: FurnitureDef[] = [
  oakWorkbench,
  nodeBench,
  clockmakersBench,
  swatchEasel,
  toolRack,
  eagleLectern,
  cursorLectern,
  islandGlobe,
  crystalBall,
  tokenChart,
  telescope,
  studyBookcase,
];

