/**
 * Construction: walking to a hotspot, building into it, removing from it.
 * Shared by the in-world right-click menu and the furniture creation menu.
 */
import { emit, sfx } from '../state/events';
import { levelForXp } from '../state/skills';
import { gameState } from '../state/store';
import { getHouse } from '../world/places';
import type { TilePos } from '../world/pathfinding';
import { FURNITURE } from './furniture';
import { houseEdgeOpen, houseTileCenter, houseWalkable, type HouseLayout, type PlacedHotspot } from './layout';

/** Building XP is boosted: this house is a training ground. */
export const XP_BOOST = 8;

export function constructionLevel() {
  return levelForXp(gameState().skills.construction ?? 0);
}

export function hotspotByKey(key: string) {
  return getHouse().layout.hotspots.find((h) => h.key === key);
}

/** The tile to stand on to use / build a hotspot: in front of it, walkable, reachable-looking. */
export function approachFor(L: HouseLayout, h: PlacedHotspot): TilePos {
  const [i0, j0, w, d] = h.rect;
  if (w === 0) {
    const r = h.room;
    return [r.i0 + 4, r.j0 + 4];
  }
  if (h.def.wall || h.def.walkable) {
    const ci = i0 + Math.floor(w / 2);
    const cj = j0 + Math.floor(d / 2);
    if (houseWalkable(L, ci, cj)) return [ci, cj];
  }
  // front direction from facing (0 S, 1 E, 2 N, 3 W)
  const front: [number, number] = [[0, 1], [1, 0], [0, -1], [-1, 0]][h.facing] as [number, number];
  const fx = i0 + w / 2 + front[0] * (w / 2 + 0.5);
  const fz = j0 + d / 2 + front[1] * (d / 2 + 0.5);
  let best: TilePos | null = null;
  let bestD = Infinity;
  for (let j = j0 - 1; j <= j0 + d; j++)
    for (let i = i0 - 1; i <= i0 + w; i++) {
      const di = i < i0 ? 1 : i >= i0 + w ? -1 : 0;
      const dj = j < j0 ? 1 : j >= j0 + d ? -1 : 0;
      // orthogonal neighbours only, walkable, with no wall between them and the piece
      if ((di === 0) === (dj === 0) || !houseWalkable(L, i, j) || !houseEdgeOpen(L, i, j, di, dj)) continue;
      const dd = Math.hypot(i + 0.5 - fx, j + 0.5 - fz);
      if (dd < bestD) {
        bestD = dd;
        best = [i, j];
      }
    }
  return best ?? [i0, j0];
}

function hotspotPoint(h: PlacedHotspot) {
  const L = getHouse().layout;
  const [x, z] = h.rect[2] ? [h.x, h.z] : houseTileCenter(L, h.room.i0 + 4, h.room.j0 + 4);
  return { x, z };
}

export function buildFurniture(key: string, id: string) {
  const g = gameState();
  const def = FURNITURE.get(id);
  const h = hotspotByKey(key);
  if (!def || !h) return;
  if (constructionLevel() < def.level) {
    g.say(`You need a Construction level of ${def.level} to build a ${def.name}.`);
    sfx('error');
    return;
  }
  g.setBuilding(null);
  g.walkTo(approachFor(getHouse().layout, h), () => {
    const { x, z } = hotspotPoint(h);
    sfx('hammer');
    emit({ type: 'burst', kind: 'sawdust', x, y: 0.6, z, count: 18 });
    window.setTimeout(() => {
      gameState().setFurniture(key, id);
      emit({ type: 'burst', kind: 'dust', x, y: 0.2, z, count: 22 });
      emit({ type: 'shake', amount: 0.15 });
      sfx('thunk');
      const first = !gameState().quests[`build:${id}`];
      gameState().addXp('construction', def.xp * XP_BOOST);
      gameState().say(`You build a ${def.name}.${first ? ' ' + def.examine : ''}`);
      if (first) gameState().markQuest(`build:${id}`, 'done');
    }, 700);
  });
}

export function removeFurniture(key: string) {
  const g = gameState();
  const h = hotspotByKey(key);
  if (!h || !h.furniture) return;
  const name = FURNITURE.get(h.furniture)?.name ?? 'thing';
  g.walkTo(approachFor(getHouse().layout, h), () => {
    const { x, z } = hotspotPoint(h);
    sfx('saw');
    emit({ type: 'burst', kind: 'sawdust', x, y: 0.5, z, count: 14 });
    window.setTimeout(() => {
      gameState().setFurniture(key, null);
      emit({ type: 'burst', kind: 'dust', x, y: 0.2, z, count: 16 });
      sfx('drop');
      gameState().say(`You remove the ${name}. The hotspot waits, patiently, for something better.`);
    }, 600);
  });
}
