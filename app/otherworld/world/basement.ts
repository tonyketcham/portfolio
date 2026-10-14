/**
 * The Underpass: RESET's basement, under the trapdoor in the Figma zone. A
 * small stone cellar with its own tile grid, far off the canvas from the
 * island and the house. Pure data, like map.ts.
 *
 * Grid: W×H tiles of 1 world unit. Tile (i, j) covers world
 * x ∈ [ox + i, ox + i + 1], z ∈ [oz + j, oz + j + 1]. The outer ring is wall.
 */
import { works } from '@/content/works';
import type { Fixture, WorkPlacement } from './map';
import type { TilePos } from './pathfinding';

export const BASEMENT = {
  w: 16,
  h: 14,
  ox: 140,
  oz: -7,
  /** Height of the far (north, west) walls; the near ones are cut down to knee height. */
  wall: 3,
  low: 0.55,
};

export interface Basement {
  blocked: Uint8Array;
  placements: WorkPlacement[];
  fixtures: Fixture[];
  spawn: TilePos;
}

const { w: W, h: H, ox, oz } = BASEMENT;

export const basementInBounds = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H;
export const basementTileCenter = (i: number, j: number): [number, number] => [ox + i + 0.5, oz + j + 0.5];
export const basementWorldToTile = (x: number, z: number): TilePos => [Math.floor(x - ox), Math.floor(z - oz)];
export const basementCentre: [number, number] = [ox + W / 2, oz + H / 2];

function generate(): Basement {
  const blocked = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) if (i === 0 || j === 0 || i === W - 1 || j === H - 1) blocked[j * W + i] = 1;
  const block = (x: number, z: number) => {
    const [i, j] = basementWorldToTile(x, z);
    if (basementInBounds(i, j)) blocked[j * W + i] = 1;
  };

  const fixtures: Fixture[] = [];
  const fixture = (f: Omit<Fixture, 'y' | 'zone' | 'approach'> & { approach: TilePos; block?: number }) => {
    const { block: b = 0, ...rest } = f;
    if (b > 0) for (let dx = -b; dx <= b; dx += 0.5) for (let dz = -b; dz <= b; dz += 0.5) block(f.x + dx, f.z + dz);
    fixtures.push({ ...rest, zone: 'reset', y: 0 });
  };

  // The way up, against the north wall. You arrive at its foot.
  fixture({ id: 'ladder', kind: 'ladder', name: 'Ladder', x: ox + 3.5, z: oz + 1.2, yaw: 0, approach: [3, 2], block: 0.2 });

  // RESET's events page, hung on the north wall like a flyer the size of a door.
  const placements: WorkPlacement[] = works
    .filter((work) => work.zone === 'reset')
    .map((work, k) => {
      const x = ox + 9 + k * 4.6;
      const z = oz + 1.7;
      for (let s = -1.7; s <= 1.7; s += 0.5) block(x + s, z);
      return {
        work,
        index: works.indexOf(work),
        display: 'artboard' as const,
        x,
        z,
        y: 0,
        yaw: 0,
        approach: [Math.floor(x - ox), 4] as TilePos,
        port: [x, z + 0.55] as [number, number],
        portDir: [0, 1] as [number, number],
      };
    });

  // EVENTS BY YEAR: the monoliths line the east wall.
  ['2020', '2021', '2022'].forEach((year, k) => {
    const j = 4 + k * 2.5;
    fixture({ id: `monolith-${year}`, kind: 'monolith', name: year, label: year, x: ox + 13.2, z: oz + j + 0.5, yaw: -Math.PI / 2, approach: [11, Math.floor(j)], block: 0.4 });
  });

  fixture({ id: 'door', kind: 'door', name: 'Underpass door', x: ox + 1.3, z: oz + 7, yaw: Math.PI / 2, approach: [2, 7], block: 0.6 });
  fixture({ id: 'decks', kind: 'decks', name: 'Decks', x: ox + 8, z: oz + 11, yaw: Math.PI, approach: [8, 9], block: 0.8 });
  fixture({ id: 'flyer-a', kind: 'flyer', name: 'Flyer', label: 'a', x: ox + 1.02, z: oz + 3.5, yaw: Math.PI / 2, approach: [2, 3] });
  fixture({ id: 'flyer-b', kind: 'flyer', name: 'Flyer', label: 'b', x: ox + 1.02, z: oz + 10.5, yaw: Math.PI / 2, approach: [2, 10] });
  fixture({ id: 'flyer-c', kind: 'flyer', name: 'Flyer', label: 'c', x: ox + 13, z: oz + 1.02, yaw: 0, approach: [13, 2] });

  return { blocked, placements, fixtures, spawn: [3, 2] };
}

let cached: Basement | null = null;
export function getBasement(): Basement {
  if (!cached) cached = generate();
  return cached;
}

export const basementWalkable = (i: number, j: number) => basementInBounds(i, j) && getBasement().blocked[j * W + i] === 0;
