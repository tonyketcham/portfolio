/** The house, as the cat sees it: tiles it can walk on, and where its basket is. */
import { approachFor } from '../house/build';
import type { HouseLayout } from '../house/layout';
import { getHouse, house } from '../world/places';
import type { CatBasket, CatWorld } from './brain';

/** Cushion height inside the kitchen basket (see house/furniture/kitchen.ts). */
export const BASKET_CUSHION = 0.1;

export function basketIn(L: HouseLayout): CatBasket | null {
  const h = L.hotspots.find((x) => x.furniture === 'cat-basket' && x.rect[2] > 0);
  if (!h) return null;
  return { key: h.key, tile: [h.rect[0], h.rect[1]], x: h.x, z: h.z, y: BASKET_CUSHION, approach: approachFor(L, h) };
}

/** `withBasket`: only the basket's owner sees it (one cat fits). */
export function houseCatWorld(withBasket = true): CatWorld {
  let cached: { layout: HouseLayout; basket: CatBasket | null } | null = null;
  return {
    get width() {
      return house.width;
    },
    get height() {
      return house.height;
    },
    inBounds: (i, j) => house.inBounds(i, j),
    walkable: (i, j) => house.walkable(i, j),
    canStep: (i, j, di, dj) => house.canStep(i, j, di, dj),
    tileCenter: (i, j) => house.tileCenter(i, j),
    basket() {
      if (!withBasket) return null;
      const layout = getHouse().layout;
      if (cached?.layout !== layout) cached = { layout, basket: basketIn(layout) };
      return cached.basket;
    },
  };
}
