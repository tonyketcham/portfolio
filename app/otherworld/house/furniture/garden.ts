/** Garden: the exit portal, trees, plants. */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UI, WOOD, type Kit } from '../kit';
import { portalMaterial } from '../materials';
import { anchor, canvasTexture, handle, workArt } from './common';
import type { Extra, FurnitureDef } from './types';

// ── centrepieces ─────────────────────────────────────────────────────────────
/** A stone arch whose opening is a design-tool frame labelled "Export". */
function arch(k: Kit, stone: string, w = 1.5, h = 2.1) {
  const t = 0.26;
  k.box(w + 0.7, 0.14, 0.9, '#6b6a66', [0, 0, 0]);
  k.box(w + 0.4, 0.1, 0.7, stone, [0, 0.14, 0]);
  for (const sx of [-1, 1]) {
    k.box(t, h, 0.42, stone, [sx * (w / 2 + t / 2), 0.24, 0]);
    k.box(t + 0.08, 0.12, 0.5, '#a8a29e', [sx * (w / 2 + t / 2), 0.24, 0]);
  }
  // voussoirs
  const segs = 9;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI;
    const r = w / 2 + t / 2;
    k.box(0.28, t, 0.44, i % 2 ? stone : '#a8a29e', [Math.cos(a) * r, 0.24 + h + Math.sin(a) * r * 0.55, 0], {
      rot: [0, 0, a - Math.PI / 2],
    });
  }
  k.box(0.3, 0.3, 0.46, '#d6d3d1', [0, 0.24 + h + (w / 2 + t / 2) * 0.55 - 0.12, 0]);
}

function portalSurface(seed: number, w: number, h: number, y: number, palette: [string, string, string]): Extra {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.absarc(0, h, w / 2, 0, Math.PI, false);
  shape.lineTo(-w / 2, 0);
  const geo = new THREE.ShapeGeometry(shape, 16);
  // ShapeGeometry uv = raw xy; normalise to 0..1 for the swirl
  const uv = geo.attributes.uv;
  const top = h + w / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, uv.getY(i) / top);
  const mesh = new THREE.Mesh(geo, portalMaterial(palette, seed % 17));
  mesh.position.set(0, y, 0);
  return { object: mesh };
}

const PORTAL_ACTIONS = [{ verb: 'Enter', id: 'exit-portal' }];

const exitPortal: FurnitureDef = {
  id: 'exit-portal',
  space: 'centrepiece',
  name: 'Exit portal',
  level: 1,
  xp: 100,
  materials: [['Iron bar', 10]],
  examine: 'File → Export → Island. Takes you back outside.',
  actions: PORTAL_ACTIONS,
  model: (k) => {
    arch(k, '#8b8a86');
    // frame label chip on the keystone: "Export ↗"
    k.box(0.9, 0.2, 0.04, UI.blue, [0, 2.95, 0.24], { jitter: 0 });
  },
  extras: (c) => {
    const surf = portalSurface(c.seed, 1.5, 1.35, 0.24, ['#1e1b4b', '#8b5cf6', '#f0abfc']);
    const label = canvasTexture(256, 56, (g, w, h) => {
      g.fillStyle = '#3b82f6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.font = 'bold 34px ui-sans-serif, system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('Export ↗', 26, h / 2 + 2);
    });
    const chip = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.19), new THREE.MeshBasicNodeMaterial({ map: label }));
    chip.position.set(0, 3.05, 0.265);
    return [surf, { object: chip }];
  },
  lights: () => [{ pos: [0, 1.2, 0.6], color: '#a78bfa', intensity: 2.6, distance: 6, flicker: 0.1 }],
};

/** A marble statue of a mouse cursor, on a plinth. Hand of the artist not included. */
const cursorStatue: FurnitureDef = {
  id: 'cursor-statue',
  space: 'centrepiece',
  name: 'Cursor statue',
  level: 25,
  xp: 300,
  materials: [['Marble block', 2]],
  examine: 'Commemorating the first click. It pointed at nothing in particular.',
  actions: [{ verb: 'Admire', id: 'admire' }],
  model: (k) => {
    k.box(1.3, 0.5, 1.3, '#9c9a95', [0, 0, 0]);
    k.box(1.1, 0.12, 1.1, '#b8b5ae', [0, 0.5, 0]);
    const arrow: [number, number][] = [[0, 0], [0, -1.45], [0.36, -1.1], [0.62, -1.62], [0.82, -1.52], [0.56, -1.02], [1.02, -1.02]];
    k.push([-0.28, 2.2, 0], [0, 0, -0.18]);
    k.extrude(arrow.map(([x, y]) => [x * 0.95, y * 0.95]), 0.32, WOOD.marble, [0, 0, 0], { bevel: 0.03 });
    k.pop();
  },
};

const decorativePond: FurnitureDef = {
  id: 'pond',
  space: 'centrepiece',
  name: 'Pond',
  level: 15,
  xp: 100,
  materials: [['Soft clay', 10]],
  examine: 'A pond. The koi are vector. One of them is a hamburger icon.',
  model: (k) => {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.dodeca(0.2 + k.r() * 0.06, '#8b8a86', [Math.cos(a) * 0.85, 0.06, Math.sin(a) * 0.85]);
    }
    k.cyl(0.82, 0.82, 0.04, '#1e40af', [0, 0.02, 0], 16, { jitter: 0.02 });
    for (let i = 0; i < 3; i++) {
      const a = k.r() * Math.PI * 2;
      k.box(0.16, 0.03, 0.06, i === 1 ? '#fafafa' : '#fb923c', [Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4], { rot: [0, a, 0] });
    }
  },
  extras: (c) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), portalMaterial(['#082f49', '#0ea5e9', '#e0f2fe'], c.seed % 7));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.065;
    return [{ object: m }];
  },
};

// ── trees ────────────────────────────────────────────────────────────────────
function trunk(k: Kit, h: number, r: number, color = '#5b4636') {
  k.cyl(r * 0.7, r, h, color, [0, 0, 0], 6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + k.r();
    k.cyl(0.02, r * 0.55, 0.35, color, [Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9], 4, { rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] });
  }
}

/** The canopy is one of the art pieces, like the shader trees on the island. */
const artOak: FurnitureDef = {
  id: 'art-oak',
  space: 'big-tree',
  name: 'Shader oak',
  level: 15,
  xp: 70,
  materials: [['Bagged oak tree', 1]],
  examine: 'An oak with a piece of the work for a canopy. It photosynthesises gradients.',
  showsWork: true,
  actions: [{ verb: 'Inspect', id: 'inspect-work' }],
  model: (k) => {
    trunk(k, 2.0, 0.2);
    k.cyl(0.08, 0.12, 0.8, '#5b4636', [0.15, 1.5, 0], 5, { rot: [0, 0, -0.6] });
    k.cyl(0.08, 0.12, 0.7, '#5b4636', [-0.12, 1.6, 0.05], 5, { rot: [0.2, 0, 0.7] });
  },
  extras: (c) => {
    const art = workArt(c.work, 2.4, 2.4, [0, 2.75, 0], { lit: true, geometry: canopyGeometry(c.seed, 2.4) });
    art.object.castShadow = true;
    const tick = (t: number) => {
      art.object.rotation.z = Math.sin(t * 0.7 + c.seed) * 0.025;
      art.object.rotation.x = Math.cos(t * 0.55 + c.seed) * 0.02;
    };
    return [{ ...art, tick }];
  },
};

/**
 * A puffy, low-poly canopy whose UVs are a top-down projection, so the
 * artwork reads across the whole crown from above (and the sides shade it).
 */
function canopyGeometry(seed: number, size: number) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts: THREE.BufferGeometry[] = [];
  const puffs: [number, number, number, number][] = [[0, 0.25, 0, 0.78]];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5;
    const d = 0.55 + r() * 0.2;
    puffs.push([Math.cos(a) * d, r() * 0.25 - 0.05, Math.sin(a) * d, 0.42 + r() * 0.16]);
  }
  for (const [x, y, z, rad] of puffs) {
    const g = new THREE.IcosahedronGeometry(rad, 1).toNonIndexed();
    g.scale(1, 0.78, 1);
    g.translate(x, y, z);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const pos = merged.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / size + 0.5;
    uv[i * 2 + 1] = 0.5 - pos.getZ(i) / size;
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeVertexNormals();
  return merged;
}

/** Branches are pen-tool paths, drooping, every anchor still selected. */
const bezierWillow: FurnitureDef = {
  id: 'bezier-willow',
  space: 'big-tree',
  name: 'Bézier willow',
  level: 30,
  xp: 160,
  materials: [['Path', 24], ['Anchor point', 60]],
  examine: 'Somebody selected every node and walked away.',
  model: (k) => {
    trunk(k, 1.9, 0.22, '#3f3f46');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + k.r() * 0.4;
      const r = 0.9 + k.r() * 0.5;
      const top: [number, number, number] = [Math.cos(a) * 0.3, 2.3 + k.r() * 0.4, Math.sin(a) * 0.3];
      const mid: [number, number, number] = [Math.cos(a) * r, 2.5 + k.r() * 0.2, Math.sin(a) * r];
      const end: [number, number, number] = [Math.cos(a) * (r + 0.25), 0.7 + k.r() * 0.5, Math.sin(a) * (r + 0.25)];
      k.tube([[0, 1.85, 0], top, mid, end], 0.028, '#18181b', { seg: 24 });
      anchor(k, mid, 0.06);
      handle(k, mid, [mid[0] + Math.cos(a + 1.6) * 0.3, mid[1] + 0.05, mid[2] + Math.sin(a + 1.6) * 0.3]);
      // leaves: little green diamonds along the end
      for (let j = 0; j < 5; j++) {
        const t = j / 5;
        k.box(0.08, 0.14, 0.02, j % 2 ? '#4d7c0f' : '#65a30d', [mid[0] + (end[0] - mid[0]) * t, mid[1] + (end[1] - mid[1]) * t, mid[2] + (end[2] - mid[2]) * t], {
          rot: [0, a, Math.PI / 4],
        });
      }
    }
  },
};

/** A pine tree built out of voxels, the way you'd draw one in 1989. */
const pixelPine: FurnitureDef = {
  id: 'pixel-pine',
  space: 'tree',
  name: 'Pixel pine',
  level: 5,
  xp: 40,
  materials: [['Pixel', 64]],
  examine: 'Each needle is exactly one pixel. They counted.',
  model: (k) => {
    k.box(0.22, 0.6, 0.22, '#5b3a1e', [0, 0, 0]);
    const s = 0.2;
    const greens = ['#14532d', '#166534', '#15803d', '#1a5e2e'];
    for (let layer = 0; layer < 7; layer++) {
      const rad = Math.max(1, 4 - Math.floor(layer * 0.6));
      for (let x = -rad; x <= rad; x++)
        for (let z = -rad; z <= rad; z++) {
          if (Math.abs(x) + Math.abs(z) > rad + (layer % 2)) continue;
          if (k.r() < 0.08) continue;
          k.box(s, s, s, greens[Math.floor(k.r() * greens.length)], [x * s, 0.6 + layer * s, z * s], { jitter: 0.02 });
        }
    }
    k.box(s, s, s, '#facc15', [0, 0.6 + 7 * s, 0]);
  },
};

const oakTree: FurnitureDef = {
  id: 'oak-tree',
  space: 'tree',
  name: 'Oak tree',
  level: 15,
  xp: 70,
  materials: [['Bagged oak tree', 1]],
  examine: 'A regular tree. In this house, that counts as a twist.',
  model: (k) => {
    trunk(k, 1.4, 0.16);
    for (let i = 0; i < 6; i++) k.ico(0.55 + k.r() * 0.25, i % 2 ? '#3f6212' : '#4d7c0f', [(k.r() - 0.5) * 0.9, 1.7 + k.r() * 0.7, (k.r() - 0.5) * 0.9]);
  },
};

// ── plants ───────────────────────────────────────────────────────────────────
const fern: FurnitureDef = {
  id: 'fern',
  space: 'big-plant',
  name: 'Fern',
  level: 1,
  xp: 31,
  materials: [['Bagged plant', 1]],
  examine: 'Prehistoric. Unbothered.',
  model: (k) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      k.push([0, 0, 0], [0, a, 0]);
      for (let j = 0; j < 5; j++) k.box(0.1, 0.02, 0.14, j % 2 ? '#15803d' : '#16a34a', [0, 0.1 + j * 0.09 - j * j * 0.012, 0.1 + j * 0.13], { rot: [-0.5 + j * 0.15, 0, 0] });
      k.pop();
    }
  },
};

/** A shrub that's a node graph: nodes as berries, noodles as branches. */
const nodeShrub: FurnitureDef = {
  id: 'node-shrub',
  space: 'big-plant',
  name: 'Node shrub',
  level: 22,
  xp: 110,
  materials: [['Node', 9], ['Noodle', 8]],
  examine: 'Output → Bush. Someone left the preview node plugged in.',
  model: (k) => {
    const nodes: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) nodes.push([(k.r() - 0.5) * 0.8, 0.25 + k.r() * 0.75, (k.r() - 0.5) * 0.8]);
    nodes.sort((a, b) => a[1] - b[1]);
    const cols = ['#f43f5e', '#3b82f6', '#22c55e', '#facc15', '#a855f7'];
    nodes.forEach((n, i) => {
      const parent = i === 0 ? ([0, 0, 0] as [number, number, number]) : nodes[Math.floor(k.r() * i)];
      k.tube([parent, [(parent[0] + n[0]) / 2, (parent[1] + n[1]) / 2 + 0.1, (parent[2] + n[2]) / 2], n], 0.018, '#14532d', { seg: 8 });
      k.box(0.18, 0.12, 0.1, '#27272a', [n[0], n[1] - 0.06, n[2]]);
      k.box(0.18, 0.035, 0.105, cols[i % cols.length], [n[0], n[1] + 0.03, n[2]], { jitter: 0 });
      k.sphere(0.022, '#fafafa', [n[0] - 0.09, n[1], n[2]], 6, 4);
    });
    k.cyl(0.18, 0.14, 0.2, '#78350f', [0, 0, 0], 8);
  },
};

const rosemary: FurnitureDef = {
  id: 'rosemary',
  space: 'small-plant',
  name: 'Rosemary',
  level: 6,
  xp: 66,
  materials: [['Bagged plant', 1]],
  examine: 'For the potatoes.',
  model: (k) => {
    for (let i = 0; i < 12; i++) {
      const a = k.r() * Math.PI * 2;
      k.box(0.03, 0.35 + k.r() * 0.2, 0.03, '#4d7c0f', [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], { rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] });
    }
    for (let i = 0; i < 5; i++) k.sphere(0.03, '#a78bfa', [(k.r() - 0.5) * 0.3, 0.4 + k.r() * 0.1, (k.r() - 0.5) * 0.3], 5, 3);
  },
};

/** A terracotta pot growing one large mouse cursor. */
const pottedCursor: FurnitureDef = {
  id: 'potted-cursor',
  space: 'small-plant',
  name: 'Potted cursor',
  level: 12,
  xp: 90,
  materials: [['Plant pot', 1], ['Seedling (pointer)', 1]],
  examine: 'Water it and it turns into a hand.',
  model: (k) => {
    k.lathe([[0.0, 0], [0.16, 0], [0.2, 0.28], [0.23, 0.3], [0.0, 0.3]], '#c2410c', [0, 0, 0], 10);
    k.cyl(0.015, 0.015, 0.25, '#166534', [0, 0.28, 0], 4);
    const arrow: [number, number][] = [[0, 0], [0, -0.5], [0.12, -0.38], [0.21, -0.56], [0.28, -0.53], [0.19, -0.35], [0.35, -0.35]];
    k.push([-0.08, 0.98, 0], [0, 0, -0.2]);
    k.extrude(arrow, 0.06, '#fafafa', [0, 0, 0]);
    k.extrude(arrow.map(([x, y]) => [x * 1.18 - 0.02, y * 1.12 + 0.03]), 0.04, '#0a0a0a', [0, 0, -0.012]);
    k.pop();
  },
};

export const GARDEN: FurnitureDef[] = [
  exitPortal,
  cursorStatue,
  decorativePond,
  artOak,
  bezierWillow,
  pixelPine,
  oakTree,
  fern,
  nodeShrub,
  rosemary,
  pottedCursor,
];

export { portalSurface, arch };
