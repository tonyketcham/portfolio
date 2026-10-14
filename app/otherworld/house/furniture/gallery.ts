/** Quest hall + achievement gallery: the frames that hang the work, and the trophies. */
import * as THREE from 'three/webgpu';
import { works } from '@/content/works';
import { getWorld, SIZE, T, tileIndex } from '../../world/map';
import { UI, WOOD, type Kit } from '../kit';
import { glassMaterial, glowMaterial } from '../materials';
import { anchor, canvasTexture, workArt } from './common';
import type { BuildCtx, Extra, FurnitureDef } from './types';

const INSPECT = [{ verb: 'Inspect', id: 'inspect-work' }];

/** Art size for a frame hotspot: portraits are 3:4, landscapes 16:10. */
function artSize(c: BuildCtx, space: 'portrait' | 'landscape') {
  return space === 'portrait' ? { w: 1.05, h: 1.4 } : { w: 1.7, h: 1.06 };
}
const ART_Y = 1.45;

function frameRim(k: Kit, c: BuildCtx, w: number, h: number, t: number, color: string, depth = 0.08) {
  const z = c.wallZ + depth / 2;
  k.box(w + t * 2, t, depth, color, [0, ART_Y + h / 2, z]);
  k.box(w + t * 2, t, depth, color, [0, ART_Y - h / 2 - t, z]);
  k.box(t, h, depth, color, [-w / 2 - t / 2, ART_Y - h / 2, z]);
  k.box(t, h, depth, color, [w / 2 + t / 2, ART_Y - h / 2, z]);
  k.box(w, h, 0.02, '#111111', [0, ART_Y - h / 2, c.wallZ + 0.01]);
}

function makeFrames(space: 'portrait' | 'landscape'): FurnitureDef[] {
  const oak: FurnitureDef = {
    id: space === 'portrait' ? 'oak-frame' : 'oak-frame-wide',
    space,
    name: 'Oak frame',
    level: 25,
    xp: 270,
    materials: [['Oak plank', 2]],
    examine: 'A plain frame. Lets the work do the talking.',
    showsWork: true,
    actions: INSPECT,
    model: (k, c) => {
      const { w, h } = artSize(c, space);
      frameRim(k, c, w, h, 0.07, WOOD.oak);
    },
    extras: (c) => {
      const { w, h } = artSize(c, space);
      return [workArt(c.work, w, h, [0, ART_Y, c.wallZ + 0.03])];
    },
  };
  const gilded: FurnitureDef = {
    id: space === 'portrait' ? 'gilded-frame' : 'gilded-frame-wide',
    space,
    name: 'Gilded frame',
    level: 45,
    xp: 420,
    materials: [['Teak plank', 2], ['Gold leaf', 2]],
    examine: 'Gold leaf, hand applied. The plaque has the title on it, which helps.',
    showsWork: true,
    actions: INSPECT,
    model: (k, c) => {
      const { w, h } = artSize(c, space);
      frameRim(k, c, w, h, 0.11, WOOD.gilded, 0.1);
      frameRim(k, c, w - 0.02, h - 0.02, 0.03, '#a16207', 0.12);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.sphere(0.07, WOOD.gilded, [sx * (w / 2 + 0.06), ART_Y + sy * (h / 2 + 0.06) - (sy < 0 ? 0.0 : 0), c.wallZ + 0.1], 6, 4);
      k.box(0.5, 0.12, 0.03, '#a16207', [0, ART_Y - h / 2 - 0.34, c.wallZ + 0.02]);
    },
    extras: (c) => {
      const { w, h } = artSize(c, space);
      const plaque = canvasTexture(256, 60, (g, cw, ch) => {
        g.fillStyle = '#d4a72c';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#3f2a06';
        g.font = 'bold 28px Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText((c.work?.title ?? 'Untitled').slice(0, 18), cw / 2, ch / 2 + 2);
      });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.11), new THREE.MeshLambertNodeMaterial({ map: plaque }));
      pm.position.set(0, ART_Y - h / 2 - 0.28, c.wallZ + 0.04);
      return [workArt(c.work, w, h, [0, ART_Y, c.wallZ + 0.03]), { object: pm }];
    },
  };
  /** A design-tool frame: hairline border, a name tag, handles and a size badge. */
  const figma: FurnitureDef = {
    id: space === 'portrait' ? 'figma-frame' : 'figma-frame-wide',
    space,
    name: 'Frame 1',
    level: 33,
    xp: 330,
    materials: [['Frame', 1], ['Constraint', 4]],
    examine: 'Selected. Has been since 2021.',
    showsWork: true,
    actions: INSPECT,
    model: (k, c) => {
      const { w, h } = artSize(c, space);
      const z = c.wallZ + 0.03;
      const t = 0.015;
      k.box(w + t * 2, t, 0.02, UI.blue, [0, ART_Y + h / 2, z], { jitter: 0 });
      k.box(w + t * 2, t, 0.02, UI.blue, [0, ART_Y - h / 2 - t, z], { jitter: 0 });
      k.box(t, h, 0.02, UI.blue, [-w / 2 - t / 2, ART_Y - h / 2, z], { jitter: 0 });
      k.box(t, h, 0.02, UI.blue, [w / 2 + t / 2, ART_Y - h / 2, z], { jitter: 0 });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) anchor(k, [sx * (w / 2), ART_Y + sy * (h / 2) + 0.035, z + 0.02], 0.06);
    },
    extras: (c) => {
      const { w, h } = artSize(c, space);
      const name = canvasTexture(256, 40, (g, cw, ch) => {
        g.clearRect(0, 0, cw, ch);
        g.fillStyle = '#93c5fd';
        g.font = '24px ui-sans-serif, system-ui, sans-serif';
        g.textBaseline = 'middle';
        g.fillText(`# ${c.work?.title ?? 'Frame 1'}`, 2, ch / 2);
      });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.14), new THREE.MeshBasicNodeMaterial({ map: name, transparent: true, alphaTest: 0.3 }));
      nm.position.set(-w / 2 + 0.45, ART_Y + h / 2 + 0.12, c.wallZ + 0.04);
      const dims = canvasTexture(160, 40, (g, cw, ch) => {
        g.fillStyle = '#3b82f6';
        g.beginPath();
        g.roundRect(0, 0, cw, ch, 12);
        g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 22px ui-sans-serif, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(space === 'portrait' ? '1080 × 1440' : '1920 × 1200', cw / 2, ch / 2 + 1);
      });
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicNodeMaterial({ map: dims, transparent: true, alphaTest: 0.3 }));
      dm.position.set(0, ART_Y - h / 2 - 0.16, c.wallZ + 0.04);
      return [workArt(c.work, w, h, [0, ART_Y, c.wallZ + 0.025], { lit: false }), { object: nm }, { object: dm }];
    },
  };
  return [oak, gilded, figma];
}

/** The island, as a parchment map, painted from the real tile data. */
const islandMap: FurnitureDef = {
  id: 'island-map',
  space: 'map',
  name: 'Island map',
  level: 38,
  xp: 211,
  materials: [['Oak plank', 2], ['Parchment', 1]],
  examine: 'You are here. Well, you were. The island is through the exit portal.',
  model: (k, c) => {
    k.box(c.w * 0.86 + 0.1, 1.15, 0.05, WOOD.oakDark, [0, 0.95, c.wallZ + 0.025]);
  },
  extras: (c) => {
    const tex = canvasTexture(SIZE * 3, SIZE * 3, (g, w, h) => {
      g.fillStyle = '#e9dcb8';
      g.fillRect(0, 0, w, h);
      const world = getWorld();
      const colours: Record<number, string> = {
        [T.Grass]: '#8fae5f',
        [T.Dirt]: '#a77c4f',
        [T.Sand]: '#d8c38f',
        [T.Plaza]: '#b9b2a3',
        [T.Moss]: '#5f8a59',
        [T.Concrete]: '#8b8a86',
        [T.Soil]: '#7c5a3c',
        [T.Ruin]: '#9c968a',
        [T.DarkMoss]: '#3f5f45',
        [T.Canvas]: '#e4e4e7',
        [T.Rock]: '#7d7364',
      };
      for (let j = 0; j < SIZE; j++)
        for (let i = 0; i < SIZE; i++) {
          const t = world.tiles[tileIndex(i, j)];
          const land = world.land[j * (SIZE + 1) + i];
          if (land < 0.3) continue;
          g.fillStyle = colours[t] ?? '#8fae5f';
          g.fillRect(i * 3, j * 3, 3, 3);
        }
      g.strokeStyle = '#7f1d1d';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w / 2 - 6, h / 2 - 6);
      g.lineTo(w / 2 + 6, h / 2 + 6);
      g.moveTo(w / 2 + 6, h / 2 - 6);
      g.lineTo(w / 2 - 6, h / 2 + 6);
      g.stroke();
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w * 0.86, 1.05), new THREE.MeshLambertNodeMaterial({ map: tex }));
    m.position.set(0, 1.52, c.wallZ + 0.055);
    return [{ object: m }];
  },
};

/** The pen tool, mounted like a sword over a shield. */
const mountedPen: FurnitureDef = {
  id: 'mounted-pen',
  space: 'sword',
  name: 'Mounted pen tool',
  level: 44,
  xp: 300,
  materials: [['Teak plank', 2], ['Pen tool', 1]],
  examine: 'Retired after drawing ten thousand perfect curves and one bad one.',
  model: (k, c) => {
    const z = c.wallZ + 0.05;
    k.extrude([[-0.38, 0.4], [0.38, 0.4], [0.32, -0.1], [0, -0.42], [-0.32, -0.1]], 0.06, '#1e3a8a', [0, 1.5, z]);
    k.extrude([[-0.3, 0.33], [0.3, 0.33], [0.25, -0.06], [0, -0.33], [-0.25, -0.06]], 0.07, '#3b82f6', [0, 1.5, z + 0.01]);
    k.push([0, 1.5, z + 0.07], [0, 0, 0.6]);
    k.extrude([[0, 0.55], [0.12, 0.12], [0.07, -0.25], [-0.07, -0.25], [-0.12, 0.12]], 0.05, '#18181b', [0, 0, 0]);
    k.sphere(0.035, '#fafafa', [0, 0.12, 0.03], 6, 4);
    k.box(0.16, 0.2, 0.05, '#71717a', [0, -0.47, 0]);
    k.box(0.06, 0.4, 0.04, '#27272a', [0, -0.87, 0]);
    k.pop();
  },
};

/** A trophy cup holding a perfect rectangle, still selected. */
const rectangleTrophy: FurnitureDef = {
  id: 'rectangle-trophy',
  space: 'guild-trophy',
  name: 'Mounted Rectangle 12',
  level: 38,
  xp: 300,
  materials: [['Gold leaf', 2], ['Rectangle', 1]],
  examine: "The first shape ever drawn in this file. Nobody renamed it. Nobody will.",
  model: (k) => {
    k.box(0.5, 0.7, 0.5, '#3f3f46', [0, 0, 0]);
    k.box(0.56, 0.06, 0.56, '#27272a', [0, 0.7, 0]);
    k.lathe([[0.0, 0], [0.14, 0], [0.05, 0.08], [0.05, 0.22], [0.2, 0.32], [0.24, 0.5], [0.0, 0.5]], WOOD.gilded, [0, 0.76, 0], 10);
    k.box(0.42, 0.28, 0.06, '#d4d4d8', [0, 1.3, 0], { rot: [0, 0.3, 0] });
    for (const sx of [-1, 1]) for (const sy of [0, 1]) anchor(k, [sx * 0.2, 1.33 + sy * 0.28, 0.06], 0.05);
  },
};

// ── achievement gallery ──────────────────────────────────────────────────────
/** A glass case on a plinth; the work floats inside, turning slowly. */
const displayCase: FurnitureDef = {
  id: 'display-case',
  space: 'display',
  name: 'Display case',
  level: 80,
  xp: 800,
  materials: [['Mahogany plank', 4], ['Molten glass', 4]],
  examine: 'The case is the most finished thing about this project.',
  showsWork: true,
  actions: INSPECT,
  model: (k) => {
    k.box(1.3, 0.8, 1.3, WOOD.mahogany, [0, 0, 0]);
    k.box(1.4, 0.06, 1.4, WOOD.gilded, [0, 0.8, 0]);
    k.box(1.3, 0.06, 1.3, WOOD.gilded, [0, 2.2, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 1.36, 0.05, WOOD.gilded, [sx * 0.63, 0.86, sz * 0.63]);
  },
  extras: (c) => {
    const art = workArt(c.work, 0.9, 0.62, [0, 1.5, 0], { lit: false, border: true });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.34, 1.24), glassMaterial('#e0f2fe', 0.16));
    glass.position.set(0, 1.53, 0);
    const back = art.object.clone();
    back.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(art.object, back);
    return [{ object: holder, tick: (t) => (holder.rotation.y = t * 0.35) }, { object: glass }];
  },
  lights: () => [{ pos: [0, 2.6, 0.4], color: '#fef3c7', intensity: 1.4, distance: 4 }],
};

/** Mounted head of The Deadline: an alarm clock with teeth. */
const mountedDeadline: FurnitureDef = {
  id: 'mounted-deadline',
  space: 'boss-lair',
  name: 'Mounted Deadline',
  level: 81,
  xp: 700,
  materials: [['Oak plank', 2], ['Deadline head', 1]],
  examine: 'Defeated, eventually. It still ticks.',
  model: (k, c) => {
    const z = c.wallZ + 0.05;
    k.extrude([[-0.55, 0.45], [0.55, 0.45], [0.45, -0.4], [-0.45, -0.4]], 0.06, WOOD.oakDark, [0, 1.55, z]);
    k.push([0, 1.6, z + 0.2]);
    k.cyl(0.36, 0.36, 0.22, '#b91c1c', [0, -0.11, 0], 16, { rot: [Math.PI / 2, 0, 0] });
    k.cyl(0.29, 0.29, 0.02, '#fef3c7', [0, 0.11, 0], 16, { rot: [Math.PI / 2, 0, 0] });
    for (const sx of [-1, 1]) {
      k.sphere(0.13, '#d4a72c', [sx * 0.26, 0.34, -0.02], 8, 5);
      k.box(0.05, 0.16, 0.05, '#7f1d1d', [sx * 0.25, -0.5, 0], { rot: [0, 0, sx * 0.3] });
      // angry eyes
      k.box(0.08, 0.06, 0.02, '#18181b', [sx * 0.1, 0.08, 0.13]);
      k.box(0.12, 0.02, 0.02, '#18181b', [sx * 0.1, 0.15, 0.13], { rot: [0, 0, sx * -0.4] });
    }
    for (let i = 0; i < 6; i++) k.cone(0.025, 0.06, '#fafafa', [-0.12 + i * 0.05, -0.12, 0.13], 3, { rot: [Math.PI, 0, 0] });
    k.box(0.4, 0.03, 0.02, '#18181b', [0, -0.1, 0.13]);
    k.pop();
    const hands = k.sub('tick', [0, 1.6, z + 0.33]);
    hands.box(0.02, 0.18, 0.01, '#18181b', [0, 1.6, z + 0.33]);
  },
};

const swatchBox: FurnitureDef = {
  id: 'swatch-box',
  space: 'jewellery-box',
  name: 'Swatch box',
  level: 81,
  xp: 500,
  materials: [['Teak plank', 2], ['Colour token', 24]],
  examine: 'Jewellery, but each gem is a hex code. Teleports you nowhere; looks great.',
  model: (k) => {
    k.box(0.6, 0.7, 0.5, WOOD.teak, [0, 0, 0]);
    k.box(0.62, 0.3, 0.06, WOOD.teak, [0, 0.95, -0.24], { rot: [-0.4, 0, 0] });
    k.box(0.52, 0.04, 0.42, '#7f1d1d', [0, 0.7, 0]);
    const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#fafafa', '#18181b'];
    cols.forEach((col, i) => k.box(0.08, 0.04, 0.08, col, [-0.2 + (i % 5) * 0.1, 0.74, -0.08 + Math.floor(i / 5) * 0.16], { jitter: 0 }));
  },
};

const adventureLog: FurnitureDef = {
  id: 'adventure-log',
  space: 'adventure-log',
  name: 'Adventure log',
  level: 83,
  xp: 300,
  materials: [['Oak plank', 2], ['Parchment', 4]],
  examine: 'A record of every place this house has been. Mostly: the same place.',
  actions: [{ verb: 'Read', id: 'adventure-log' }],
  model: (k) => {
    k.cyl(0.08, 0.16, 0.9, WOOD.oak, [0, 0, 0], 8);
    k.box(0.62, 0.05, 0.44, WOOD.oak, [0, 0.95, 0], { rot: [-0.3, 0, 0] });
    for (const sx of [-1, 1]) {
      k.box(0.27, 0.03, 0.36, WOOD.paper, [sx * 0.14, 1.0, 0.02], { rot: [-0.3, 0, sx * -0.08] });
      for (let i = 0; i < 6; i++) k.box(0.18, 0.005, 0.012, '#71717a', [sx * 0.14, 1.03 - i * 0.017, -0.1 + i * 0.05], { rot: [-0.3, 0, sx * -0.08], jitter: 0 });
    }
  },
};

const questScroll: FurnitureDef = {
  id: 'quest-scroll',
  space: 'quest-list',
  name: 'Quest list',
  level: 82,
  xp: 300,
  materials: [['Parchment', 2]],
  examine: 'Everything in the portfolio, as quests. Some are green.',
  actions: [{ verb: 'Read', id: 'quest-list' }],
  model: (k, c) => {
    k.cyl(0.04, 0.04, 0.8, WOOD.oakDark, [0, 2.1, c.wallZ + 0.06], 6, { rot: [0, 0, Math.PI / 2] });
    k.cyl(0.04, 0.04, 0.8, WOOD.oakDark, [0, 0.95, c.wallZ + 0.06], 6, { rot: [0, 0, Math.PI / 2] });
  },
  extras: (c) => {
    const tex = canvasTexture(160, 240, (g, w, h) => {
      g.fillStyle = '#efe2c0';
      g.fillRect(0, 0, w, h);
      g.font = 'bold 15px Georgia, serif';
      g.fillStyle = '#3f2a06';
      g.fillText('Quests', 12, 24);
      g.font = '12px ui-sans-serif, system-ui, sans-serif';
      works.slice(0, 12).forEach((wk, i) => {
        g.fillStyle = i % 3 === 0 ? '#15803d' : i % 3 === 1 ? '#a16207' : '#b91c1c';
        g.fillText(wk.title.slice(0, 20), 12, 46 + i * 16);
      });
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshLambertNodeMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.set(0, 1.53, c.wallZ + 0.065);
    return [{ object: m }];
  },
};

/** An altar that swaps the world's effect stack, the way the occult altar swaps spellbooks. */
const presetAltar: FurnitureDef = {
  id: 'preset-altar',
  space: 'spell-altar',
  name: 'Preset altar',
  level: 90,
  xp: 1000,
  materials: [['Marble block', 3], ['Preset', 5]],
  examine: 'Pray here to switch the whole world to another preset.',
  actions: [{ verb: 'Pray', id: 'preset-altar' }],
  model: (k) => {
    k.box(1.0, 0.9, 0.7, '#3f3f46', [0, 0, 0]);
    k.box(1.1, 0.08, 0.8, '#18181b', [0, 0.9, 0]);
    for (let i = 0; i < 5; i++) k.box(0.14, 0.02, 0.14, ['#22d3ee', '#e879f9', '#a3e635', '#facc15', '#fb7185'][i], [-0.36 + i * 0.18, 0.98, 0.1], { jitter: 0 });
    const r = k.sub('spin', [0, 1.6, 0]);
    r.torus(0.32, 0.03, '#a855f7', [0, 1.6, 0], 5, 20, Math.PI * 2, { rot: [Math.PI / 2, 0, 0] });
    r.torus(0.22, 0.02, '#22d3ee', [0, 1.6, 0], 5, 16, Math.PI * 1.5, { rot: [0.4, 0, 0] });
  },
  extras: () => {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glowMaterial('#f0abfc', 1.6));
    core.position.set(0, 1.6, 0);
    return [{ object: core, tick: (t) => { core.rotation.y = t * 1.3; core.position.y = 1.6 + Math.sin(t * 2) * 0.05; } } as Extra];
  },
  lights: () => [{ pos: [0, 1.6, 0.3], color: '#e879f9', intensity: 1.6, distance: 4.5 }],
};

export const GALLERY: FurnitureDef[] = [
  ...makeFrames('portrait'),
  ...makeFrames('landscape'),
  islandMap,
  mountedPen,
  rectangleTrophy,
  displayCase,
  mountedDeadline,
  swatchBox,
  adventureLog,
  questScroll,
  presetAltar,
];
