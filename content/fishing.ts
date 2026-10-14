import type { ItemId } from '@/app/otherworld/state/items';

/** A quiet backwater between the grove and the ruins. No node-graph road. */
export const POND = {
  center: [-24, 2] as [number, number],
  radius: 5,
  waterRadius: [3.6, 2.8] as [number, number],
  surfaceY: 0.04,
  rod: [-19.5, 1.5] as [number, number],
  entry: [-18.5, 2.5] as [number, number],
};

export interface FishingSpot {
  id: string;
  catch: ItemId;
  x: number;
  z: number;
  /** Adjacent dry bank tile, in world coordinates. */
  bank: [number, number];
  color: string;
}

export const FISHING_SPOTS: FishingSpot[] = [
  { id: 'missing-textures', catch: 'missing-texture', x: -22.5, z: 0.5, bank: [-21.5, -0.5], color: '#e879f9' },
  { id: 'broken-links', catch: 'broken-link', x: -20.5, z: 2.5, bank: [-19.5, 2.5], color: '#7dd3fc' },
  { id: 'old-jpegs', catch: 'old-jpeg', x: -22.5, z: 4.5, bank: [-21.5, 5.5], color: '#fbbf24' },
];

/** Common catch matches the spot icon; every spot can also hold a rare fish. */
export function fishingCatch(spot: FishingSpot, roll: number): ItemId {
  if (roll < 0.025) return 'flash-site';
  if (roll < 0.1) return 'undefined-fish';
  return spot.catch;
}

export const FISHING_SECONDS = 4.8; // eight old-school ticks per catch
