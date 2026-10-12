/**
 * Deterministic island generation. Everything here is pure data derived from
 * content/works.ts + content/zones.ts, so the island is identical on every
 * load and adding a work re-flows it predictably.
 *
 * Grid: SIZE×SIZE tiles of 1 world unit. Tile (i, j) covers world
 * x ∈ [i − HALF, i − HALF + 1], z ∈ [j − HALF, j − HALF + 1].
 * Corner heights live on a (SIZE+1)² lattice, like an old-school heightmap.
 */
import { works, tagColors, type Work } from '@/content/works';
import { zones, zoneById, type Zone } from '@/content/zones';
import { clamp, fbm, hashString, lerp, mulberry32, smoothstep } from '../lib/random';

export const SIZE = 72;
export const HALF = SIZE / 2;
export const ISLAND_RADIUS = 30;

export const T = {
  Void: 0,
  Grass: 1,
  Dirt: 2,
  Sand: 3,
  Plaza: 4,
  Moss: 5,
  Concrete: 6,
  Soil: 7,
  Ruin: 8,
  DarkMoss: 9,
} as const;
export type TileKind = (typeof T)[keyof typeof T];

export type Display = 'artboard' | 'tree' | 'floor';

export interface WorkPlacement {
  work: Work;
  index: number;
  display: Display;
  x: number;
  z: number;
  y: number;
  /** Rotation about Y. The artboard's front faces (sin yaw, cos yaw). */
  yaw: number;
  approach: [number, number];
  port: [number, number];
  portDir: [number, number];
}

export type FixtureKind =
  | 'house-portal'
  | 'stall'
  | 'tony'
  | 'sign'
  | 'hut'
  | 'monolith'
  | 'door'
  | 'fractal'
  | 'pot'
  | 'fallen-frame'
  | 'datapoints'
  | 'ring';

export interface Fixture {
  id: string;
  kind: FixtureKind;
  name: string;
  zone: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  label?: string;
  /** Tile to stand on when interacting. */
  approach: [number, number];
}

export interface Edge {
  id: number;
  kind: 'road' | 'link';
  a: string;
  b: string;
  color: string;
  weight: number;
  points: [number, number][];
}

export interface TreeProp {
  x: number;
  z: number;
  scale: number;
  rot: number;
  kind: 'round' | 'pine' | 'shader';
  hue: number;
}

export interface Props {
  trees: TreeProp[];
  rocks: { x: number; z: number; scale: number; rot: number }[];
  grass: { x: number; z: number; scale: number; rot: number }[];
  shrooms: { id: string; x: number; z: number; scale: number; big: boolean }[];
}

export interface LayerNode {
  id: string;
  name: string;
  kind: 'zone' | 'work' | 'fixture';
  color?: string;
  children?: LayerNode[];
}

export interface WorldMap {
  heights: Float32Array;
  land: Float32Array;
  tiles: Uint8Array;
  blocked: Uint8Array;
  zoneIndex: Int8Array;
  placements: WorkPlacement[];
  fixtures: Fixture[];
  edges: Edge[];
  props: Props;
  layers: LayerNode[];
  spawn: [number, number];
}

// ── coordinate helpers ──────────────────────────────────────────────────────

export const tileIndex = (i: number, j: number) => j * SIZE + i;
export const inBounds = (i: number, j: number) => i >= 0 && j >= 0 && i < SIZE && j < SIZE;
export const tileCenter = (i: number, j: number): [number, number] => [i - HALF + 0.5, j - HALF + 0.5];
export const worldToTile = (x: number, z: number): [number, number] => [
  Math.floor(x + HALF),
  Math.floor(z + HALF),
];
const cornerIndex = (ci: number, cj: number) => cj * (SIZE + 1) + ci;

export function heightAt(map: WorldMap, x: number, z: number) {
  const fx = clamp(x + HALF, 0, SIZE - 0.0001);
  const fz = clamp(z + HALF, 0, SIZE - 0.0001);
  const ci = Math.floor(fx);
  const cj = Math.floor(fz);
  const tx = fx - ci;
  const tz = fz - cj;
  const h = map.heights;
  const a = h[cornerIndex(ci, cj)];
  const b = h[cornerIndex(ci + 1, cj)];
  const c = h[cornerIndex(ci, cj + 1)];
  const d = h[cornerIndex(ci + 1, cj + 1)];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function isWalkable(map: WorldMap, i: number, j: number) {
  if (!inBounds(i, j)) return false;
  const k = tileIndex(i, j);
  return map.tiles[k] !== T.Void && map.blocked[k] === 0;
}

export function zoneAt(map: WorldMap, x: number, z: number): Zone | undefined {
  const [i, j] = worldToTile(x, z);
  if (!inBounds(i, j)) return undefined;
  const zi = map.zoneIndex[tileIndex(i, j)];
  return zi >= 0 ? zones[zi] : undefined;
}

// ── generation ──────────────────────────────────────────────────────────────

const SEED = 1337;

function bezier(
  p0: [number, number],
  c0: [number, number],
  c1: [number, number],
  p1: [number, number],
  step = 0.45
): [number, number][] {
  const approxLength = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 1.25;
  const n = Math.max(8, Math.ceil(approxLength / step));
  const out: [number, number][] = [];
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0];
    const z = u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1];
    out.push([x, z]);
  }
  return out;
}

function generate(): WorldMap {
  const corners = (SIZE + 1) * (SIZE + 1);
  const heights = new Float32Array(corners);
  const land = new Float32Array(corners);
  const tiles = new Uint8Array(SIZE * SIZE);
  const blocked = new Uint8Array(SIZE * SIZE);
  const zoneIndex = new Int8Array(SIZE * SIZE).fill(-1);
  const rand = mulberry32(SEED);

  // 1. Island silhouette + rolling hills
  for (let cj = 0; cj <= SIZE; cj++) {
    for (let ci = 0; ci <= SIZE; ci++) {
      const x = ci - HALF;
      const z = cj - HALF;
      const warp = (fbm(x * 0.055, z * 0.055, SEED + 11, 3) - 0.5) * 10;
      const d = Math.hypot(x, z) / (ISLAND_RADIUS + warp);
      let l = smoothstep(1.0, 0.84, d);
      // Zones are plateaus: guarantee solid ground under every frame.
      for (const zone of zones) {
        const dz = Math.hypot(x - zone.center[0], z - zone.center[1]);
        l = Math.max(l, smoothstep(zone.radius + 3.5, zone.radius + 0.5, dz));
      }
      const hills = (fbm(x * 0.075, z * 0.075, SEED + 3, 4) - 0.42) * 2.6;
      let h = hills * l + (l - 1) * 1.4;
      // Flatten each zone into a gentle pad so frames sit level.
      for (const zone of zones) {
        const dz = Math.hypot(x - zone.center[0], z - zone.center[1]);
        const f = smoothstep(zone.radius + 2.5, zone.radius - 1, dz);
        h = lerp(h, zone.biome === 'mushroom' ? 0.05 : 0.18, f);
      }
      heights[cornerIndex(ci, cj)] = h;
      land[cornerIndex(ci, cj)] = l;
    }
  }

  // 2. Tile kinds + zone membership
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const k = tileIndex(i, j);
      const minLand = Math.min(
        land[cornerIndex(i, j)],
        land[cornerIndex(i + 1, j)],
        land[cornerIndex(i, j + 1)],
        land[cornerIndex(i + 1, j + 1)]
      );
      if (minLand < 0.5) {
        tiles[k] = T.Void;
        continue;
      }
      const [x, z] = tileCenter(i, j);
      let kind: TileKind = minLand < 0.8 ? T.Sand : T.Grass;
      zones.forEach((zone, zi) => {
        const d = Math.hypot(x - zone.center[0], z - zone.center[1]);
        if (d < zone.radius + 0.5) {
          zoneIndex[k] = zi;
          const n = fbm(x * 0.4, z * 0.4, SEED + zi, 2);
          switch (zone.biome) {
            case 'plaza':
              kind = d < zone.radius - 0.8 ? T.Plaza : T.Grass;
              break;
            case 'grove':
              kind = n > 0.62 ? T.Grass : T.Moss;
              break;
            case 'concrete':
              kind = d < zone.radius - 1 ? T.Concrete : n > 0.5 ? T.Dirt : T.Grass;
              break;
            case 'garden':
              kind = d < zone.radius - 2 && n < 0.55 ? T.Soil : T.Grass;
              break;
            case 'ruins':
              kind = n > 0.5 ? T.Ruin : T.Grass;
              break;
            case 'mushroom':
              kind = T.DarkMoss;
              break;
          }
        }
      });
      tiles[k] = kind;
    }
  }

  const markBlocked = (x: number, z: number) => {
    const [i, j] = worldToTile(x, z);
    if (inBounds(i, j)) blocked[tileIndex(i, j)] = 1;
  };
  const tileOf = (x: number, z: number): [number, number] => worldToTile(x, z);
  const groundY = (x: number, z: number) =>
    heightAt({ heights } as WorldMap, x, z);

  // 3. Works → placements
  const placements: WorkPlacement[] = [];
  const spawnZone = zoneById.get('spawn')!;
  for (const zone of zones) {
    const inZone = works.filter((w) => w.zone === zone.id);
    if (!inZone.length) continue;
    const toSpawn: [number, number] =
      zone.id === 'spawn'
        ? [0, 1]
        : (() => {
            const dx = spawnZone.center[0] - zone.center[0];
            const dz = spawnZone.center[1] - zone.center[1];
            const len = Math.hypot(dx, dz) || 1;
            return [dx / len, dz / len];
          })();
    const perp: [number, number] = [-toSpawn[1], toSpawn[0]];
    const yaw = Math.atan2(toSpawn[0], toSpawn[1]);
    const boards = inZone.filter((w) => (w.display ?? 'artboard') === 'artboard');
    const trees = inZone.filter((w) => w.display === 'tree');
    const backOffset = zone.biome === 'mushroom' ? 3.9 : zone.biome === 'garden' ? 3.2 : 1.6;

    boards.forEach((work, k) => {
      const offset = (k - (boards.length - 1) / 2) * 4.6;
      const x = zone.center[0] - toSpawn[0] * backOffset + perp[0] * offset;
      const z = zone.center[1] - toSpawn[1] * backOffset + perp[1] * offset;
      for (let s = -1.7; s <= 1.7; s += 0.5) markBlocked(x + perp[0] * s, z + perp[1] * s);
      placements.push({
        work,
        index: works.indexOf(work),
        display: 'artboard',
        x,
        z,
        y: groundY(x, z),
        yaw,
        approach: tileOf(x + toSpawn[0] * 2.1, z + toSpawn[1] * 2.1),
        port: [x + toSpawn[0] * 0.55, z + toSpawn[1] * 0.55],
        portDir: toSpawn,
      });
    });

    const entranceAngle = Math.atan2(toSpawn[1], toSpawn[0]);
    trees.forEach((work, k) => {
      const spread = Math.PI * 1.45;
      const a =
        entranceAngle + Math.PI - spread / 2 + (trees.length === 1 ? spread / 2 : (k / (trees.length - 1)) * spread);
      const r = zone.radius * 0.72;
      const x = zone.center[0] + Math.cos(a) * r;
      const z = zone.center[1] + Math.sin(a) * r;
      markBlocked(x, z);
      const inward: [number, number] = [-Math.cos(a), -Math.sin(a)];
      placements.push({
        work,
        index: works.indexOf(work),
        display: 'tree',
        x,
        z,
        y: groundY(x, z),
        yaw: Math.atan2(inward[0], inward[1]),
        approach: tileOf(x + inward[0] * 1.5, z + inward[1] * 1.5),
        port: [x + inward[0] * 0.5, z + inward[1] * 0.5],
        portDir: inward,
      });
    });
  }

  // 4. Hand-placed fixtures per zone
  const fixtures: Fixture[] = [];
  const fixture = (
    f: Omit<Fixture, 'y' | 'approach'> & { approach?: [number, number]; block?: number }
  ) => {
    const { block = 0.6, ...rest } = f;
    if (block > 0) {
      for (let dx = -block; dx <= block; dx += 0.5)
        for (let dz = -block; dz <= block; dz += 0.5) markBlocked(f.x + dx, f.z + dz);
    }
    const ax = f.x + Math.sin(f.yaw) * (block + 1.1);
    const az = f.z + Math.cos(f.yaw) * (block + 1.1);
    fixtures.push({ ...rest, y: groundY(f.x, f.z), approach: f.approach ?? tileOf(ax, az) });
  };

  // spawn: the portal home, the tea stall, Tony, a signpost
  fixture({ id: 'house-portal', kind: 'house-portal', name: 'House portal', zone: 'spawn', x: 0.5, z: 0.5, yaw: 0, block: 1.1 });
  fixture({ id: 'stall', kind: 'stall', name: 'Tea stall', zone: 'spawn', x: -5.2, z: -3.4, yaw: Math.PI * 0.3, block: 0.9 });
  fixture({ id: 'tony', kind: 'tony', name: 'Tony', zone: 'spawn', x: -2.6, z: -4.6, yaw: Math.PI * 0.15, block: 0.2 });
  fixture({ id: 'sign', kind: 'sign', name: 'Signpost', zone: 'spawn', x: 3.5, z: -3.5, yaw: -Math.PI * 0.2, block: 0.2 });

  const z = (id: string) => zoneById.get(id)!.center;
  const [mx, mz] = z('modyfi');
  fixture({ id: 'hut', kind: 'hut', name: 'Minky Hut Jr.', zone: 'modyfi', x: mx + 2.6, z: mz + 2.2, yaw: Math.PI * 0.8, block: 0.7 });

  const [rx, rz] = z('reset');
  ['2020', '2021', '2022'].forEach((year, k) => {
    fixture({
      id: `monolith-${year}`,
      kind: 'monolith',
      name: year,
      label: year,
      zone: 'reset',
      x: rx + 3.4 - k * 0.2,
      z: rz - 2.2 + k * 2.2,
      yaw: -Math.PI / 2 - 0.2,
      block: 0.4,
    });
  });
  fixture({ id: 'door', kind: 'door', name: 'Underpass door', zone: 'reset', x: rx + 1.5, z: rz - 4.6, yaw: 0, block: 0.6 });

  const [gx, gz] = z('garden');
  {
    const len = Math.hypot(gx, gz) || 1;
    const perp: [number, number] = [gz / len, -gx / len];
    fixture({ id: 'fractal', kind: 'fractal', name: 'Fractal tree', zone: 'garden', x: gx + perp[0] * 2.8, z: gz + perp[1] * 2.8, yaw: Math.atan2(-gx, -gz), block: 0.6 });
    fixture({ id: 'pot', kind: 'pot', name: 'Curry pot', zone: 'garden', x: gx - perp[0] * 2.6, z: gz - perp[1] * 2.6, yaw: Math.atan2(-gx, -gz), block: 0.4 });
  }

  const [ux, uz] = z('ruins');
  fixture({ id: 'fallen-a', kind: 'fallen-frame', name: 'Detached instance', zone: 'ruins', x: ux + 3, z: uz + 2.4, yaw: 0.6, block: 0.8 });
  fixture({ id: 'fallen-b', kind: 'fallen-frame', name: 'Frame 404', zone: 'ruins', x: ux - 3.2, z: uz + 1.6, yaw: -1.1, block: 0.8 });
  fixture({ id: 'datapoints', kind: 'datapoints', name: 'Vague data', zone: 'ruins', x: ux + 0.2, z: uz + 3.6, yaw: 0, block: 0.6 });

  const [ax, az] = z('ring');
  fixture({ id: 'ring', kind: 'ring', name: 'Fairy ring', zone: 'ring', x: ax, z: az + 0.6, yaw: 0, block: 0, approach: tileOf(ax, az + 0.6) });

  // 5. Roads: fat cables from spawn to every zone. Ground becomes dirt under them.
  const edges: Edge[] = [];
  let edgeId = 0;
  const paintDirt = (pts: [number, number][], width = 0.75) => {
    for (const [px, pz] of pts) {
      for (let ox = -width; ox <= width; ox += 0.5)
        for (let oz = -width; oz <= width; oz += 0.5) {
          const [i, j] = worldToTile(px + ox, pz + oz);
          if (!inBounds(i, j)) continue;
          const k = tileIndex(i, j);
          const kind = tiles[k];
          if (kind === T.Grass || kind === T.Moss || kind === T.Sand || kind === T.DarkMoss) tiles[k] = T.Dirt;
        }
    }
  };

  for (const zone of zones) {
    if (zone.id === 'spawn') continue;
    const dx = zone.center[0] - spawnZone.center[0];
    const dz = zone.center[1] - spawnZone.center[1];
    const len = Math.hypot(dx, dz);
    const dir: [number, number] = [dx / len, dz / len];
    const start: [number, number] = [dir[0] * (spawnZone.radius - 1.2), dir[1] * (spawnZone.radius - 1.2)];
    const end: [number, number] = [zone.center[0] - dir[0] * (zone.radius - 1.5), zone.center[1] - dir[1] * (zone.radius - 1.5)];
    const bend = (rand() - 0.5) * len * 0.5;
    const perp: [number, number] = [-dir[1], dir[0]];
    const c0: [number, number] = [lerp(start[0], end[0], 0.33) + perp[0] * bend, lerp(start[1], end[1], 0.33) + perp[1] * bend];
    const c1: [number, number] = [lerp(start[0], end[0], 0.66) - perp[0] * bend * 0.6, lerp(start[1], end[1], 0.66) - perp[1] * bend * 0.6];
    const points = bezier(start, c0, c1, end);
    paintDirt(points);
    edges.push({ id: edgeId++, kind: 'road', a: 'zone:spawn', b: `zone:${zone.id}`, color: zone.color, weight: 3, points });
  }

  // 6. Links: node-graph wires between related works (shared tags + explicit connects)
  const scoreOf = (a: Work, b: Work) => {
    let s = a.tags.filter((t) => b.tags.includes(t)).length;
    if (a.connects?.includes(b.slug) || b.connects?.includes(a.slug)) s += 3;
    if (a.zone === b.zone) s += a.display === 'tree' && b.display === 'tree' ? -3 : 1.5; // pieces plug into their zone's project
    return s;
  };
  const linked = new Set<string>();
  const degree = new Map<string, number>();
  const maxDegree = (p: WorkPlacement) => (p.display === 'tree' ? 2 : 8);
  const addLink = (pa: WorkPlacement, pb: WorkPlacement, s: number, color: string) => {
    const key = [pa.work.slug, pb.work.slug].sort().join('|');
    linked.add(key);
    degree.set(pa.work.slug, (degree.get(pa.work.slug) ?? 0) + 1);
    degree.set(pb.work.slug, (degree.get(pb.work.slug) ?? 0) + 1);
    const L = Math.hypot(pb.port[0] - pa.port[0], pb.port[1] - pa.port[1]) * 0.42;
    const c0: [number, number] = [pa.port[0] + pa.portDir[0] * L, pa.port[1] + pa.portDir[1] * L];
    const c1: [number, number] = [pb.port[0] + pb.portDir[0] * L, pb.port[1] + pb.portDir[1] * L];
    edges.push({
      id: edgeId++,
      kind: 'link',
      a: pa.work.slug,
      b: pb.work.slug,
      color,
      weight: s,
      points: bezier(pa.port, c0, c1, pb.port, 0.35),
    });
  };
  for (const pa of placements) {
    const ranked = placements
      .filter((pb) => pb !== pa)
      .map((pb) => ({ pb, s: scoreOf(pa.work, pb.work) }))
      .filter(({ pb, s }) => s > 0 && (degree.get(pb.work.slug) ?? 0) < maxDegree(pb))
      .sort((u, v) => v.s - u.s)
      .slice(0, pa.display === 'tree' ? 1 : 2);
    for (const { pb, s } of ranked) {
      const key = [pa.work.slug, pb.work.slug].sort().join('|');
      if (linked.has(key)) continue;
      if ((degree.get(pa.work.slug) ?? 0) >= maxDegree(pa) || (degree.get(pb.work.slug) ?? 0) >= maxDegree(pb)) continue;
      const shared = pa.work.tags.find((t) => pb.work.tags.includes(t));
      addLink(pa, pb, s, (shared && tagColors[shared]) || '#71717a');
    }
  }
  // Nothing is an island on the island: orphans get a loose grey wire to the nearest frame.
  for (const pa of placements) {
    if (degree.get(pa.work.slug)) continue;
    const nearest = placements
      .filter((pb) => pb !== pa && pb.display === 'artboard')
      .sort((u, v) => Math.hypot(u.x - pa.x, u.z - pa.z) - Math.hypot(v.x - pa.x, v.z - pa.z))[0];
    if (nearest) addLink(pa, nearest, 0.5, '#71717a');
  }

  // 7. Scatter: trees, rocks, grass tufts, amanitas
  const keepClear: [number, number, number][] = [
    ...placements.map((p) => [p.x, p.z, p.display === 'tree' ? 1.6 : 3] as [number, number, number]),
    ...fixtures.map((f) => [f.x, f.z, f.kind === 'house-portal' ? 3.2 : 2.2] as [number, number, number]),
  ];
  const nearRoad = (x: number, z: number, r: number) =>
    edges.some((e) => e.kind === 'road' && e.points.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < r * r));
  const isClear = (x: number, z: number) => keepClear.every(([cx, cz, r]) => (cx - x) ** 2 + (cz - z) ** 2 > r * r);

  const trees: TreeProp[] = [];
  const rocks: Props['rocks'] = [];
  const grass: Props['grass'] = [];
  for (let j = 1; j < SIZE - 1; j++) {
    for (let i = 1; i < SIZE - 1; i++) {
      const k = tileIndex(i, j);
      const kind = tiles[k];
      if (kind === T.Void) continue;
      const [cx, cz] = tileCenter(i, j);
      const x = cx + (rand() - 0.5) * 0.6;
      const zz = cz + (rand() - 0.5) * 0.6;
      const zi = zoneIndex[k];
      const zone = zi >= 0 ? zones[zi] : undefined;
      const coast = Math.hypot(x, zz) / ISLAND_RADIUS;
      const density = fbm(x * 0.09, zz * 0.09, SEED + 21, 3);

      // trees
      if (
        blocked[k] === 0 &&
        (kind === T.Grass || kind === T.Moss || kind === T.DarkMoss) &&
        coast < 0.9 &&
        zone?.biome !== 'plaza' &&
        isClear(x, zz) &&
        !nearRoad(x, zz, 1.6)
      ) {
        const grove = zone?.biome === 'grove' ? 0.08 : 0;
        const forestRing = !zone && coast > 0.6 ? 0.07 : 0;
        const p = smoothstep(0.46, 0.7, density) * 0.32 + grove + forestRing + (zone ? -0.05 : 0.02);
        if (rand() < p) {
          const r = rand();
          trees.push({
            x,
            z: zz,
            scale: 0.75 + rand() * 0.6,
            rot: rand() * Math.PI * 2,
            kind: zone?.biome === 'grove' ? 'shader' : r < 0.35 ? 'pine' : 'round',
            hue: rand(),
          });
          blocked[k] = 1;
          continue;
        }
      }
      // rocks near coast and in the ruins
      if (blocked[k] === 0 && (coast > 0.82 || zone?.biome === 'ruins') && isClear(x, zz) && rand() < 0.05) {
        rocks.push({ x, z: zz, scale: 0.3 + rand() * 0.5, rot: rand() * Math.PI * 2 });
        if (rocks[rocks.length - 1].scale > 0.55) blocked[k] = 1;
        continue;
      }
      // grass tufts
      if (kind === T.Grass || kind === T.Moss || kind === T.DarkMoss || kind === T.Soil) {
        const tufts = rand() < 0.55 ? 1 + Math.floor(rand() * 2) : 0;
        for (let t = 0; t < tufts && grass.length < 1400; t++) {
          grass.push({
            x: cx + (rand() - 0.5) * 0.9,
            z: cz + (rand() - 0.5) * 0.9,
            scale: 0.5 + rand() * 0.7,
            rot: rand() * Math.PI,
          });
        }
      }
    }
  }

  // amanitas: the fairy ring (big, bouncy) and a few loose ones to pick
  const shrooms: Props['shrooms'] = [];
  for (let s = 0; s < 9; s++) {
    const a = (s / 9) * Math.PI * 2 + 0.2;
    const x = ax + Math.cos(a) * 2.8;
    const zz = az + 0.6 + Math.sin(a) * 2.8;
    shrooms.push({ id: `ring-${s}`, x, z: zz, scale: 0.9 + rand() * 0.5, big: true });
    markBlocked(x, zz);
  }
  const looseSpots: [number, number][] = [
    [mx - 4.6, mz + 3.8],
    [mx + 5.2, mz - 2.4],
    [ax - 4.6, az + 4.2],
    [ax + 4.4, az + 3.4],
    [ux + 4.6, uz - 3.2],
    [-8.4, 6.6],
    [9.2, -5.4],
  ];
  looseSpots.forEach(([x, zz], s) => {
    const [i, j] = worldToTile(x, zz);
    if (!inBounds(i, j) || tiles[tileIndex(i, j)] === T.Void) return;
    shrooms.push({ id: `loose-${s}`, x, z: zz, scale: 0.32 + rand() * 0.1, big: false });
  });

  // 8. Layers: the scene as a design file
  const layers: LayerNode[] = zones.map((zone) => ({
    id: `zone:${zone.id}`,
    name: zone.name,
    kind: 'zone' as const,
    color: zone.color,
    children: [
      ...placements
        .filter((p) => p.work.zone === zone.id)
        .map((p) => ({ id: `work:${p.work.slug}`, name: p.work.title, kind: 'work' as const })),
      ...fixtures
        .filter((f) => f.zone === zone.id)
        .map((f) => ({ id: `fixture:${f.id}`, name: f.name, kind: 'fixture' as const })),
    ],
  }));

  // 9. Every approach tile must be standable: walk outwards to the nearest free tile.
  const free = (i: number, j: number) => inBounds(i, j) && tiles[tileIndex(i, j)] !== T.Void && blocked[tileIndex(i, j)] === 0;
  const nearestFree = ([i0, j0]: [number, number], towards: [number, number]): [number, number] => {
    if (free(i0, j0)) return [i0, j0];
    let best: [number, number] = [i0, j0];
    let bestScore = Infinity;
    for (let r = 1; r <= 4 && bestScore === Infinity; r++) {
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !free(i0 + di, j0 + dj)) continue;
          const [cx, cz] = tileCenter(i0 + di, j0 + dj);
          const score = Math.hypot(di, dj) + Math.hypot(cx - towards[0], cz - towards[1]) * 0.1;
          if (score < bestScore) {
            bestScore = score;
            best = [i0 + di, j0 + dj];
          }
        }
    }
    return best;
  };
  for (const p of placements) p.approach = nearestFree(p.approach, [0, 0]);
  for (const f of fixtures) f.approach = nearestFree(f.approach, [0, 0]);

  // arrive facing the house portal, just in front of it
  const spawn = nearestFree(worldToTile(0.5, 2.6), [0, 0]);

  return {
    heights,
    land,
    tiles,
    blocked,
    zoneIndex,
    placements,
    fixtures,
    edges,
    props: { trees, rocks, grass, shrooms },
    layers,
    spawn,
  };
}

let cached: WorldMap | null = null;
export function getWorld(): WorldMap {
  if (!cached) cached = generate();
  return cached;
}

/** Stable per-id seed, e.g. for procedural art. */
export const seedOf = (id: string) => hashString(id) % 10007;
