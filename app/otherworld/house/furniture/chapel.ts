/** Portal chamber + chapel: portals aimed at projects, the altar of undo, stained-glass work. */
import * as THREE from 'three/webgpu';
import { WOOD, type Kit } from '../kit';
import { fireMaterial, glowMaterial, portalMaterial } from '../materials';
import { WALL_T } from '../layout';
import { canvasTexture, workArt, workPalette } from './common';
import { arch, portalSurface } from './garden';
import type { BuildCtx, FurnitureDef } from './types';

// ── portals ──────────────────────────────────────────────────────────────────
function titleChip(c: BuildCtx, y: number, z: number) {
  const tex = canvasTexture(320, 56, (g, w, h) => {
    g.fillStyle = '#18181b';
    g.beginPath();
    g.roundRect(0, 0, w, h, 14);
    g.fill();
    g.fillStyle = '#fafafa';
    g.font = 'bold 30px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`→ ${c.work?.title ?? 'Nowhere yet'}`, w / 2, h / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.19), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, alphaTest: 0.3 }));
  m.position.set(0, y, z);
  return { object: m };
}

function makePortal(id: string, name: string, level: number, stone: string, examine: string): FurnitureDef {
  return {
    id,
    space: 'portal',
    name,
    level,
    xp: level * 6,
    materials: [['Teleport focus', 1], [stone === WOOD.marble ? 'Marble block' : 'Teak plank', 3]],
    examine,
    showsWork: true,
    actions: [
      { verb: 'Enter', id: 'portal' },
      { verb: 'Inspect', id: 'inspect-work' },
    ],
    model: (k, c) => {
      k.push([0, 0, c.wallZ + 0.3]);
      arch(k, stone, 1.4, 1.9);
      k.pop();
    },
    extras: (c) => {
      const surface = portalSurface(c.seed, 1.4, 1.2, 0.24, workPalette(c.work));
      surface.object.position.z = c.wallZ + 0.3;
      return [surface, titleChip(c, 2.95, c.wallZ + 0.56)];
    },
    lights: (c) => {
      const [, mid] = workPalette(c.work);
      return [{ pos: [0, 1.2, c.wallZ + 1.0], color: mid, intensity: 2.2, distance: 5.5, flicker: 0.08 }];
    },
  };
}

const teakPortal = makePortal('teak-portal', 'Teak portal', 50, '#7c5a3c', 'Directed at a project. Step through and you arrive at it on the island.');
const marblePortal = makePortal('marble-portal', 'Marble portal', 80, WOOD.marble, 'The good portal. It hums in the key of the project it points at.');

/** A pool that previews wherever the portals go. */
const scryingPool: FurnitureDef = {
  id: 'scrying-pool',
  space: 'portal-focus',
  name: 'Scrying pool',
  level: 65,
  xp: 700,
  materials: [['Marble block', 4], ['Teleport focus', 1]],
  examine: 'Look in and you can see every project at once. It is a lot.',
  actions: [{ verb: 'Scry', id: 'scry' }],
  model: (k) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.box(0.36, 0.5, 0.2, i % 2 ? WOOD.marble : '#d6d0c4', [Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8], { rot: [0, -a + Math.PI / 2, 0] });
    }
    k.cyl(0.8, 0.85, 0.2, '#57534e', [0, 0, 0], 16);
  },
  extras: (c) => {
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.74, 28), portalMaterial(['#082f49', '#22d3ee', '#f0abfc'], c.seed % 11));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.42;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), glowMaterial('#a5f3fc', 1.5));
    orb.position.y = 1.2;
    return [{ object: water }, { object: orb, tick: (t) => { orb.position.y = 1.15 + Math.sin(t * 1.7) * 0.1; orb.rotation.y = t; } }];
  },
  lights: () => [{ pos: [0, 1.0, 0], color: '#67e8f9', intensity: 1.8, distance: 5 }],
};

// ── chapel ───────────────────────────────────────────────────────────────────
/** Pray to rewind the physics, like the keyboard shortcut engraved on the front. */
const altarOfUndo: FurnitureDef = {
  id: 'altar-of-undo',
  space: 'altar',
  name: 'Altar of undo',
  level: 64,
  xp: 1200,
  materials: [['Marble block', 2], ['Gold leaf', 1]],
  examine: 'Pray here and the last few seconds of physics go back where they came from.',
  actions: [{ verb: 'Pray', id: 'pray-undo' }],
  model: (k, c) => {
    const w = c.w * 0.85;
    k.box(w, 0.92, 0.7, WOOD.marble, [0, 0, 0]);
    k.box(w + 0.12, 0.08, 0.82, '#cbc3b4', [0, 0.92, 0]);
    k.box(w * 0.7, 0.01, 0.6, '#7f1d1d', [0, 1.0, 0]);
    k.box(w * 0.25, 0.02, 0.62, WOOD.gilded, [0, 0.98, 0.0]);
    for (const sx of [-1, 1]) {
      k.cyl(0.05, 0.06, 0.05, WOOD.gilded, [sx * (w / 2 - 0.15), 1.0, -0.1], 8);
      k.cyl(0.025, 0.025, 0.3, '#fef3c7', [sx * (w / 2 - 0.15), 1.05, -0.1], 6);
    }
  },
  extras: (c) => {
    const w = c.w * 0.85;
    const tex = canvasTexture(256, 96, (g, cw, ch) => {
      g.fillStyle = '#e7e3da';
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#a16207';
      g.font = 'bold 64px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('⌘ Z', cw / 2, ch / 2 + 4);
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.34), new THREE.MeshLambertNodeMaterial({ map: tex }));
    front.position.set(0, 0.5, 0.356);
    const flames = new THREE.Group();
    const fm = fireMaterial(['#9a3412', '#fb923c', '#fef9c3'], 3);
    for (const sx of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.13), fm);
        m.position.set(sx * (w / 2 - 0.15), 1.42, -0.1);
        m.rotation.y = i * (Math.PI / 2);
        flames.add(m);
      }
    return [{ object: front }, { object: flames }];
  },
  lights: () => [{ pos: [0, 1.5, 0.3], color: '#fde68a', intensity: 1.6, distance: 5, flicker: 0.2 }],
};

/** The icon above the altar: the hamburger menu, in gold. */
const hamburgerIcon: FurnitureDef = {
  id: 'hamburger-icon',
  space: 'icon',
  name: 'Icon of the menu',
  level: 52,
  xp: 300,
  materials: [['Gold leaf', 4]],
  examine: 'Three lines. Everything you ever lost is in here.',
  model: (k, c) => {
    const z = c.wallZ + 0.06;
    k.cyl(0.5, 0.5, 0.06, WOOD.gilded, [0, 2.0, z], 20, { rot: [Math.PI / 2, 0, 0] });
    k.cyl(0.42, 0.42, 0.07, '#7f1d1d', [0, 2.0, z], 20, { rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) k.box(0.42, 0.08, 0.04, WOOD.gilded, [0, 1.9 + (i - 1) * 0.15, z + 0.06]);
  },
};

const incenseBurner: FurnitureDef = {
  id: 'incense-burner',
  space: 'lamp',
  name: 'Incense burner',
  level: 49,
  xp: 280,
  materials: [['Oak plank', 4], ['Steel bar', 2]],
  examine: 'Smells of sandalwood and slightly of solder.',
  actions: [{ verb: 'Light', id: 'incense' }],
  model: (k) => {
    k.cyl(0.18, 0.24, 0.12, '#3f3f46', [0, 0, 0], 8);
    k.cyl(0.04, 0.06, 0.75, '#52525b', [0, 0.12, 0], 6);
    k.lathe([[0.0, 0], [0.12, 0], [0.24, 0.12], [0.26, 0.18], [0.0, 0.18]], '#a16207', [0, 0.85, 0], 10);
    for (let i = 0; i < 6; i++) k.dodeca(0.04, '#7c2d12', [(k.r() - 0.5) * 0.25, 1.03, (k.r() - 0.5) * 0.25]);
  },
  extras: () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), fireMaterial(['#7c2d12', '#ef4444', '#fde047'], 3));
    m.position.set(0, 1.15, 0);
    const m2 = m.clone();
    m2.rotation.y = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m, m2);
    return [{ object: g }];
  },
  lights: () => [{ pos: [0, 1.3, 0], color: '#fb923c', intensity: 1.4, distance: 4, flicker: 0.4 }],
};

const cursorBust: FurnitureDef = {
  id: 'cursor-bust',
  space: 'statue',
  name: 'Cursor statue',
  level: 49,
  xp: 300,
  materials: [['Limestone brick', 3]],
  examine: 'Patron saint of clicking on the wrong thing.',
  model: (k, c) => {
    k.box(0.6, 0.9, 0.6, '#cfc6b0', [0, 0, 0]);
    k.box(0.68, 0.06, 0.68, '#b8af98', [0, 0.9, 0]);
    const arrow: [number, number][] = [[0, 0], [0, -0.9], [0.22, -0.68], [0.38, -1.0], [0.5, -0.94], [0.34, -0.63], [0.62, -0.63]];
    k.push([-0.15, 1.95, 0], [0, c.index % 2 ? -0.5 : 0.5, -0.12]);
    k.extrude(arrow, 0.18, WOOD.marble, [0, 0, 0], { bevel: 0.02 });
    k.pop();
  },
};

/** A monolith organ: LED pipes pulse at 124 BPM, same as the ones on the island. */
const monolithOrgan: FurnitureDef = {
  id: 'monolith-organ',
  space: 'musical',
  name: 'Monolith organ',
  level: 69,
  xp: 500,
  materials: [['Obsidian', 2], ['LED', 8]],
  examine: 'One tempo. One key. It never stops.',
  actions: [{ verb: 'Play', id: 'organ' }],
  model: (k) => {
    k.box(0.85, 1.9, 0.5, '#0b0b0f', [0, 0, -0.05]);
    k.box(0.85, 0.08, 0.3, '#18181b', [0, 0.8, 0.3]);
    for (let i = 0; i < 9; i++) k.box(0.08, 0.04, 0.12, i % 2 ? '#18181b' : '#e4e4e7', [-0.36 + i * 0.09, 0.88, 0.32], { jitter: 0 });
  },
  extras: () => {
    const g = new THREE.Group();
    const bars: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.02), glowMaterial(['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'][i], 1.4));
      m.position.set(-0.3 + i * 0.12, 1.4, 0.21);
      bars.push(m);
      g.add(m);
    }
    return [
      {
        object: g,
        tick: (t) => {
          const beat = (t * 124) / 60;
          bars.forEach((b, i) => {
            const v = 0.25 + 0.75 * Math.max(0, Math.sin((beat + i * 0.17) * Math.PI)) ** 4;
            b.scale.y = v;
            b.position.y = 1.0 + 0.4 * v;
          });
        },
      },
    ];
  },
  lights: () => [{ pos: [0, 1.5, 0.6], color: '#a855f7', intensity: 1.4, distance: 4.5 }],
};

/** Every chapel window is a piece of the work, leaded like stained glass. */
const stainedGlass: FurnitureDef = {
  id: 'stained-glass',
  space: 'window',
  name: 'Stained glass',
  level: 47,
  xp: 300,
  materials: [['Molten glass', 8], ['Lead', 4]],
  examine: "Leaded from one of the pieces. The light comes through in the work's colours.",
  showsWork: true,
  actions: [{ verb: 'Inspect', id: 'inspect-work' }],
  model: (k: Kit, c) => {
    // a thin lead cross over the glass
    const z = c.wallZ - WALL_T / 2 + 0.02;
    k.box(0.03, 1.15, 0.04, '#1c1917', [0, 0.85, z]);
    k.box(c.w, 0.03, 0.04, '#1c1917', [0, 1.4, z]);
  },
  extras: (c) => [workArt(c.work, c.w, 1.15, [0, 1.425, c.wallZ - WALL_T / 2], { leaded: true, lit: false })],
};

export const CHAPEL: FurnitureDef[] = [teakPortal, marblePortal, scryingPool, altarOfUndo, hamburgerIcon, incenseBurner, cursorBust, monolithOrgan, stainedGlass];

