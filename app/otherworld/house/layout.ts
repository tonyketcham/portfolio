/**
 * Resolves a HouseDesign into tiles, walls, doors, windows and placed
 * hotspots. Pure data: the architecture builder, the pathfinder, the HUD and
 * the r3f components all read from this.
 */
import * as THREE from 'three/webgpu';
import { workBySlug, type Work } from '@/content/works';
import { ROOMS } from './rooms';
import type { Facing, HotspotDef, HouseDesign, RoomDef, RoomPlacement, Side } from './types';

export const ROOM = 8;
/** World position of the house's centre (far from the island; fog hides each from the other). */
export const HOUSE_ORIGIN = new THREE.Vector3(0, 0, -160);
export const WALL_H = 2.6;
export const WALL_T = 0.24;

export interface PlacedRoom {
  def: RoomDef;
  place: RoomPlacement;
  index: number;
  rx: number;
  rz: number;
  rot: Facing;
  /** NW tile of the room in house tile coords. */
  i0: number;
  j0: number;
  doors: Set<Side>;
}

export interface PlacedHotspot {
  key: string;
  room: PlacedRoom;
  def: HotspotDef;
  /** House tile rect [i, j, w, d]. */
  rect: [number, number, number, number];
  facing: Facing;
  /** World-space centre of the footprint (floor level). */
  x: number;
  z: number;
  furniture: string | null;
  work?: Work;
  /** The wall a wall-mounted piece hangs on (hidden when that wall is cut away). */
  side?: WallSide;
}

export type OpeningKind = 'door' | 'window' | 'closed-door';
export interface Opening {
  u0: number;
  u1: number;
  kind: OpeningKind;
}

export interface WallSide {
  id: number;
  /** Endpoints in house tile coords (on tile edges). */
  a: [number, number];
  b: [number, number];
  /** Unit normal pointing out of `room` (toward `other`). */
  n: [number, number];
  room: PlacedRoom;
  other?: PlacedRoom;
  kind: 'interior' | 'exterior' | 'hedge';
  openings: Opening[];
}

export interface WindowInfo {
  room: PlacedRoom;
  side: WallSide;
  /** World-space centre at sill level, inward-facing direction. */
  x: number;
  z: number;
  facing: Facing;
  width: number;
}

export interface HouseLayout {
  design: HouseDesign;
  rooms: PlacedRoom[];
  hotspots: PlacedHotspot[];
  sides: WallSide[];
  windows: WindowInfo[];
  width: number;
  height: number;
  /** World x/z of tile (0, 0)'s north-west corner. */
  ox: number;
  oz: number;
  walk: Uint8Array;
  wallE: Uint8Array;
  wallS: Uint8Array;
  roomAt: Int16Array;
  spawn: [number, number];
}

const SIDE_VEC: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const VEC_SIDE = (x: number, z: number): Side => (z < 0 ? 'n' : x > 0 ? 'e' : z > 0 ? 's' : 'w');
export const OPPOSITE: Record<Side, Side> = { n: 's', e: 'w', s: 'n', w: 'e' };

/** Rotate a direction by quarter turns, same sense as Object3D.rotation.y (+z → +x). */
function rotVec([x, z]: [number, number], r: number): [number, number] {
  let a = x;
  let b = z;
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) [a, b] = [b, -a];
  return [a, b];
}
export const rotSide = (s: Side, r: number) => VEC_SIDE(...rotVec(SIDE_VEC[s], r));

/** Rotate a local tile rect about the room centre. */
function rotRect([x, z, w, d]: HotspotDef['tiles'], r: number): [number, number, number, number] {
  const pts: [number, number][] = [
    [x, z],
    [x + w, z],
    [x, z + d],
    [x + w, z + d],
  ].map(([px, pz]) => {
    const [a, b] = rotVec([px - 4, pz - 4], r);
    return [a + 4, b + 4];
  });
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  return [Math.round(x0), Math.round(z0), Math.round(Math.max(...xs) - x0), Math.round(Math.max(...zs) - z0)];
}

export function buildLayout(design: HouseDesign): HouseLayout {
  const minX = Math.min(...design.rooms.map((r) => r.at[0]));
  const minZ = Math.min(...design.rooms.map((r) => r.at[1]));
  const rooms: PlacedRoom[] = design.rooms.map((place, index) => {
    const def = ROOMS[place.room];
    const rot = (place.rot ?? 0) as Facing;
    const rx = place.at[0] - minX;
    const rz = place.at[1] - minZ;
    return { def, place, index, rx, rz, rot, i0: rx * ROOM, j0: rz * ROOM, doors: new Set(def.doors.map((s) => rotSide(s, rot))) };
  });
  const cols = Math.max(...rooms.map((r) => r.rx)) + 1;
  const rows = Math.max(...rooms.map((r) => r.rz)) + 1;
  const width = cols * ROOM;
  const height = rows * ROOM;
  const ox = HOUSE_ORIGIN.x - width / 2;
  const oz = HOUSE_ORIGIN.z - height / 2;
  const idx = (i: number, j: number) => j * width + i;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < width && j < height;

  const grid = new Map<string, PlacedRoom>();
  for (const r of rooms) grid.set(`${r.rx},${r.rz}`, r);
  const neighbour = (r: PlacedRoom, s: Side) => {
    const [dx, dz] = SIDE_VEC[s];
    return grid.get(`${r.rx + dx},${r.rz + dz}`);
  };

  const roomAt = new Int16Array(width * height).fill(-1);
  const walk = new Uint8Array(width * height);
  for (const r of rooms)
    for (let j = 0; j < ROOM; j++)
      for (let i = 0; i < ROOM; i++) {
        roomAt[idx(r.i0 + i, r.j0 + j)] = r.index;
        walk[idx(r.i0 + i, r.j0 + j)] = 1;
      }

  // ── hotspots ─────────────────────────────────────────────────────────────
  const hotspots: PlacedHotspot[] = [];
  for (const r of rooms) {
    for (const def of r.def.hotspots) {
      const [lx, lz, w, d] = rotRect(def.tiles, r.rot);
      const rect: [number, number, number, number] = [r.i0 + lx, r.j0 + lz, w, d];
      const furniture = r.place.furniture[def.id] ?? null;
      const slug = r.place.works?.[def.id];
      hotspots.push({
        key: `${r.def.id}:${r.index}:${def.id}`,
        room: r,
        def,
        rect,
        facing: (((def.facing + r.rot) % 4) as Facing),
        x: ox + rect[0] + rect[2] / 2,
        z: oz + rect[1] + rect[3] / 2,
        furniture,
        work: slug ? workBySlug.get(slug) : undefined,
      });
    }
  }
  for (const h of hotspots) {
    if (!h.furniture || h.def.wall || h.def.walkable || h.rect[2] === 0) continue;
    for (let j = h.rect[1]; j < h.rect[1] + h.rect[3]; j++)
      for (let i = h.rect[0]; i < h.rect[0] + h.rect[2]; i++) if (inside(i, j)) walk[idx(i, j)] = 0;
  }

  // ── walls, doors, windows ────────────────────────────────────────────────
  const wallE = new Uint8Array(width * height);
  const wallS = new Uint8Array(width * height);
  const sides: WallSide[] = [];
  const windows: WindowInfo[] = [];
  /** Block the edge between tile (i, j) and its neighbour in direction s. */
  const blockEdge = (i: number, j: number, s: Side) => {
    if (s === 'e' && inside(i, j)) wallE[idx(i, j)] = 1;
    if (s === 'w' && inside(i - 1, j)) wallE[idx(i - 1, j)] = 1;
    if (s === 's' && inside(i, j)) wallS[idx(i, j)] = 1;
    if (s === 'n' && inside(i, j - 1)) wallS[idx(i, j - 1)] = 1;
  };

  /** Tiles along a side that have furniture against that wall (no windows there). */
  const busyAlong = (r: PlacedRoom, s: Side) => {
    const busy = new Set<number>();
    for (const h of hotspots) {
      if (h.room !== r || !h.furniture || h.rect[2] === 0) continue;
      const [i, j, w, d] = h.rect;
      const touches =
        (s === 'n' && j === r.j0) ||
        (s === 's' && j + d === r.j0 + ROOM) ||
        (s === 'w' && i === r.i0) ||
        (s === 'e' && i + w === r.i0 + ROOM);
      if (!touches) continue;
      if (s === 'n' || s === 's') for (let k = i; k < i + w; k++) busy.add(k - r.i0);
      else for (let k = j; k < j + d; k++) busy.add(k - r.j0);
    }
    return busy;
  };

  let sideId = 0;
  for (const r of rooms) {
    for (const s of ['n', 'e', 's', 'w'] as Side[]) {
      const other = neighbour(r, s);
      // Shared edges are emitted once, by the room on the north / west side of them.
      if (other && (s === 'n' || s === 'w')) continue;
      const a: [number, number] =
        s === 'n' ? [r.i0, r.j0] : s === 's' ? [r.i0, r.j0 + ROOM] : s === 'w' ? [r.i0, r.j0] : [r.i0 + ROOM, r.j0];
      const b: [number, number] = s === 'n' || s === 's' ? [a[0] + ROOM, a[1]] : [a[0], a[1] + ROOM];
      const doorHere = r.doors.has(s);
      const doorThere = other ? other.doors.has(OPPOSITE[s]) : false;
      const open = !!other && doorHere && doorThere;
      const bothOutdoor = !!other && !!r.def.outdoor && !!other.def.outdoor;
      const indoorRoom = !r.def.outdoor ? r : other && !other.def.outdoor ? other : undefined;
      const kind: WallSide['kind'] = !indoorRoom ? 'hedge' : other && !other.def.outdoor && !r.def.outdoor ? 'interior' : 'exterior';
      const openings: Opening[] = [];
      if (open) openings.push({ u0: 3, u1: 5, kind: 'door' });
      else if (doorHere && !other && !r.def.outdoor) openings.push({ u0: 3, u1: 5, kind: 'closed-door' });
      else if (other && doorThere && !doorHere && !other.def.outdoor && r.def.outdoor) openings.push({ u0: 3, u1: 5, kind: 'closed-door' });

      // windows on walls that face the outside (or the garden)
      const windowRoom = !other ? (!r.def.outdoor ? r : undefined) : r.def.outdoor !== !!other.def.outdoor ? indoorRoom : undefined;
      if (windowRoom && kind !== 'hedge') {
        const sideOfWindowRoom = windowRoom === r ? s : OPPOSITE[s];
        const busy = busyAlong(windowRoom, sideOfWindowRoom);
        for (const [u0, u1] of [
          [1, 3],
          [5, 7],
        ]) {
          if (busy.has(u0) || busy.has(u0 + 1)) continue;
          openings.push({ u0, u1, kind: 'window' });
        }
      }
      const n = SIDE_VEC[s];
      const side: WallSide = { id: sideId++, a, b, n, room: r, other, kind: bothOutdoor ? 'hedge' : kind, openings };
      if (!(bothOutdoor && open)) sides.push(side);

      // edge blocking (everything along the side except door openings)
      for (let u = 0; u < ROOM; u++) {
        if (open && u >= 3 && u < 5) continue;
        const ti = s === 'n' || s === 's' ? r.i0 + u : s === 'w' ? r.i0 : r.i0 + ROOM - 1;
        const tj = s === 'w' || s === 'e' ? r.j0 + u : s === 'n' ? r.j0 : r.j0 + ROOM - 1;
        blockEdge(ti, tj, s);
      }

      for (const o of openings) {
        if (o.kind !== 'window' || !windowRoom) continue;
        const mid = (o.u0 + o.u1) / 2;
        const wx = ox + a[0] + (b[0] - a[0]) * (mid / ROOM);
        const wz = oz + a[1] + (b[1] - a[1]) * (mid / ROOM);
        // inward = away from the window room's outside
        const out = windowRoom === r ? n : ([-n[0], -n[1]] as [number, number]);
        const facing = (out[1] < 0 ? 0 : out[0] > 0 ? 3 : out[1] > 0 ? 2 : 1) as Facing;
        windows.push({ room: windowRoom, side, x: wx, z: wz, facing, width: o.u1 - o.u0 });
      }
    }
  }

  // which wall each wall-mounted hotspot hangs on
  for (const h of hotspots) {
    if (!h.def.wall || h.rect[2] === 0) continue;
    const [i, j, w, d] = h.rect;
    const back: [number, number, number, number] =
      h.facing === 0 ? [i, j, i + w, j] : h.facing === 2 ? [i, j + d, i + w, j + d] : h.facing === 1 ? [i, j, i, j + d] : [i + w, j, i + w, j + d];
    h.side = sides.find((sd) => {
      const horiz = back[1] === back[3];
      if (horiz) return sd.a[1] === back[1] && sd.b[1] === back[1] && Math.min(sd.a[0], sd.b[0]) <= back[0] && Math.max(sd.a[0], sd.b[0]) >= back[2];
      return sd.a[0] === back[0] && sd.b[0] === back[0] && Math.min(sd.a[1], sd.b[1]) <= back[1] && Math.max(sd.a[1], sd.b[1]) >= back[3];
    });
  }

  const garden = rooms.find((r) => r.def.id === 'garden') ?? rooms[0];
  const spawnLocal = rotRect([4, 5, 1, 1], garden.rot);
  const spawn: [number, number] = [garden.i0 + spawnLocal[0], garden.j0 + spawnLocal[1]];

  return { design, rooms, hotspots, sides, windows, width, height, ox, oz, walk, wallE, wallS, roomAt, spawn };
}

// ── grid helpers ─────────────────────────────────────────────────────────────
export const houseTileCenter = (L: HouseLayout, i: number, j: number): [number, number] => [L.ox + i + 0.5, L.oz + j + 0.5];
export const houseWorldToTile = (L: HouseLayout, x: number, z: number): [number, number] => [Math.floor(x - L.ox), Math.floor(z - L.oz)];
export const houseInside = (L: HouseLayout, i: number, j: number) => i >= 0 && j >= 0 && i < L.width && j < L.height;
export const houseWalkable = (L: HouseLayout, i: number, j: number) => houseInside(L, i, j) && L.walk[j * L.width + i] === 1;

/** Is the edge between (i, j) and its orthogonal neighbour (i + di, j + dj) free of walls? */
export function houseEdgeOpen(L: HouseLayout, i: number, j: number, di: number, dj: number) {
  if (di === 1) return !L.wallE[j * L.width + i];
  if (di === -1) return i > 0 && !L.wallE[j * L.width + i - 1];
  if (dj === 1) return !L.wallS[j * L.width + i];
  if (dj === -1) return j > 0 && !L.wallS[(j - 1) * L.width + i];
  return true;
}

/** Can you step from (i, j) by (di, dj) (each −1..1) without crossing a wall? */
export function houseCanStep(L: HouseLayout, i: number, j: number, di: number, dj: number): boolean {
  const ortho = (ci: number, cj: number, oi: number, oj: number) => {
    if (!houseWalkable(L, ci + oi, cj + oj)) return false;
    if (oi === 1) return !L.wallE[cj * L.width + ci];
    if (oi === -1) return !L.wallE[cj * L.width + ci - 1];
    if (oj === 1) return !L.wallS[cj * L.width + ci];
    if (oj === -1) return !L.wallS[(cj - 1) * L.width + ci];
    return true;
  };
  if (di === 0 || dj === 0) return ortho(i, j, di, dj);
  return ortho(i, j, di, 0) && ortho(i + di, j, 0, dj) && ortho(i, j, 0, dj) && ortho(i, j + dj, di, 0);
}

export function roomOf(L: HouseLayout, i: number, j: number): PlacedRoom | undefined {
  if (!houseInside(L, i, j)) return undefined;
  const k = L.roomAt[j * L.width + i];
  return k >= 0 ? L.rooms[k] : undefined;
}
