/**
 * Places: the island (the town), the player-owned house and the basement
 * under the Figma zone. All expose the same tile-grid interface so the player, the pathfinder, picking and the HUD
 * don't care which one they're in.
 */
import { house as baseHouse } from '@/content/house';
import { zoneById } from '@/content/zones';
import { createHouseTileState, type HouseTileState } from '../house/architecture';
import { buildLayout, houseCanStep, houseInside, houseTileCenter, houseWalkable, houseWorldToTile, roomOf, HOUSE_ORIGIN, type HouseLayout } from '../house/layout';
import type { HouseDesign } from '../house/types';
import { tileState } from '../shaders/terrain';
import { BASEMENT, basementCentre, basementInBounds, basementTileCenter, basementWalkable, basementWorldToTile, getBasement } from './basement';
import { SIZE, getWorld, heightAt, inBounds, isWalkable, tileCenter, worldToTile, zoneAt } from './map';
import type { Grid, TilePos } from './pathfinding';

export type PlaceId = 'island' | 'house' | 'basement';

export interface TileOverlay {
  set(i: number, j: number, channel: number, on: boolean): void;
  clear(channel: number): void;
}

export interface Area {
  id: string;
  name: string;
  arrival?: string;
}

export interface Place extends Grid {
  id: PlaceId;
  name: string;
  spawn: TilePos;
  /** World xz of the place's centre. */
  centre: [number, number];
  tileCenter(i: number, j: number): [number, number];
  worldToTile(x: number, z: number): TilePos;
  heightAt(x: number, z: number): number;
  tiles: TileOverlay;
  /** The zone / room at a world position (arrival messages, layers, minimap). */
  area(x: number, z: number): Area | undefined;
}

// ── island ───────────────────────────────────────────────────────────────────
export const island: Place = {
  id: 'island',
  name: 'The island',
  width: SIZE,
  height: SIZE,
  get spawn() {
    return [...getWorld().spawn] as TilePos;
  },
  centre: [0, 0],
  inBounds,
  walkable: (i, j) => isWalkable(getWorld(), i, j),
  canStep(i, j, di, dj) {
    const w = getWorld();
    if (!isWalkable(w, i + di, j + dj)) return false;
    if (di !== 0 && dj !== 0) return isWalkable(w, i + di, j) && isWalkable(w, i, j + dj);
    return true;
  },
  tileCenter,
  worldToTile,
  heightAt: (x, z) => heightAt(getWorld(), x, z),
  tiles: tileState,
  area(x, z) {
    const zone = zoneAt(getWorld(), x, z);
    return zone ? { id: zone.id, name: zone.name, arrival: zone.arrival } : undefined;
  },
};

// ── house ────────────────────────────────────────────────────────────────────
/** Visitor edits to the house: hotspot key → furniture id (null = removed). */
export type HouseEdits = Record<string, string | null>;

export function designWithEdits(base: HouseDesign, edits: HouseEdits): HouseDesign {
  return {
    ...base,
    rooms: base.rooms.map((r, index) => {
      const furniture = { ...r.furniture };
      for (const h of Object.keys(edits)) {
        const [room, idx, id] = h.split(':');
        if (room === r.room && Number(idx) === index) furniture[id] = edits[h];
      }
      return { ...r, furniture };
    }),
  };
}

interface HouseState {
  layout: HouseLayout;
  tiles: HouseTileState;
  version: number;
}
let houseState: HouseState | null = null;
const listeners = new Set<() => void>();

export function getHouse(): HouseState {
  if (!houseState) {
    const layout = buildLayout(baseHouse);
    houseState = { layout, tiles: createHouseTileState(layout), version: 0 };
  }
  return houseState;
}

/** Re-resolve the house after furniture changes (walkability moves with it). */
export function rebuildHouse(edits: HouseEdits) {
  const prev = getHouse();
  const layout = buildLayout(designWithEdits(baseHouse, edits));
  houseState = { layout, tiles: prev.tiles, version: prev.version + 1 };
  listeners.forEach((l) => l());
}
export function onHouseChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const house: Place = {
  id: 'house',
  name: 'Your house',
  get width() {
    return getHouse().layout.width;
  },
  get height() {
    return getHouse().layout.height;
  },
  get spawn() {
    return [...getHouse().layout.spawn] as TilePos;
  },
  centre: [HOUSE_ORIGIN.x, HOUSE_ORIGIN.z],
  inBounds: (i, j) => houseInside(getHouse().layout, i, j),
  walkable: (i, j) => houseWalkable(getHouse().layout, i, j),
  canStep: (i, j, di, dj) => houseCanStep(getHouse().layout, i, j, di, dj),
  tileCenter: (i, j) => houseTileCenter(getHouse().layout, i, j),
  worldToTile: (x, z) => houseWorldToTile(getHouse().layout, x, z),
  heightAt: () => 0,
  get tiles() {
    return getHouse().tiles;
  },
  area(x, z) {
    const L = getHouse().layout;
    const [i, j] = houseWorldToTile(L, x, z);
    const r = roomOf(L, i, j);
    return r ? { id: `room:${r.index}`, name: r.def.name, arrival: r.def.blurb } : undefined;
  },
};

// ── basement ─────────────────────────────────────────────────────────────────
export const basementTiles = createHouseTileState({ width: BASEMENT.w, height: BASEMENT.h });

export const basement: Place = {
  id: 'basement',
  name: 'The Underpass',
  width: BASEMENT.w,
  height: BASEMENT.h,
  get spawn() {
    return [...getBasement().spawn] as TilePos;
  },
  centre: basementCentre,
  inBounds: basementInBounds,
  walkable: basementWalkable,
  canStep(i, j, di, dj) {
    if (!basementWalkable(i + di, j + dj)) return false;
    if (di !== 0 && dj !== 0) return basementWalkable(i + di, j) && basementWalkable(i, j + dj);
    return true;
  },
  tileCenter: basementTileCenter,
  worldToTile: basementWorldToTile,
  heightAt: () => 0,
  tiles: basementTiles,
  area() {
    const zone = zoneById.get('reset')!;
    return { id: zone.id, name: zone.name, arrival: zone.arrival };
  },
};

export const PLACES: Record<PlaceId, Place> = { island, house, basement };

/** Which place a world position belongs to (the house and the basement sit far from the island). */
export function placeAt(x: number, z: number): Place {
  if (Math.hypot(x - basementCentre[0], z - basementCentre[1]) < 40) return basement;
  return Math.hypot(x - HOUSE_ORIGIN.x, z - HOUSE_ORIGIN.z) < 60 ? house : island;
}

/** Where a work hangs: the island's placements, or the basement's. */
export function findPlacement(slug: string) {
  const onIsland = getWorld().placements.find((p) => p.work.slug === slug);
  if (onIsland) return { place: 'island' as PlaceId, placement: onIsland };
  const below = getBasement().placements.find((p) => p.work.slug === slug);
  return below ? { place: 'basement' as PlaceId, placement: below } : null;
}

