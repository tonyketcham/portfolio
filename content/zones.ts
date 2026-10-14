/**
 * Zones are the "frames" of the island. Every work lives in exactly one zone.
 * Coordinates are world tiles relative to the island centre (x → east, z → south).
 *
 * Add a zone: give it an id, a centre that doesn't overlap its neighbours
 * (|centre distance| > r1 + r2 + 3), a biome, and point some works at it.
 * A road (a fat node-graph cable) is laid from spawn to every zone automatically.
 */

import { POND } from './fishing';

export type Biome =
  | 'plaza' // flagstones, the spawn artboard lives here
  | 'grove' // mossy, dense shader trees
  | 'concrete' // poured concrete, underground venue vibes
  | 'garden' // tilled soil + grass
  | 'ruins' // cracked stone, broken frames
  | 'mushroom' // dark moss, fairy ring
  | 'canvas' // light-grey design canvas, multiplayer cursors
  | 'pond' // a tucked-away fishing backwater
  | 'summit'; // a terraced hill: grass ledges, stone cliffs, a ramp up the front

export interface Zone {
  id: string;
  /** Shown in the breadcrumb, minimap and layers panel. Named like design-file layers on purpose. */
  name: string;
  /** One-line flavour shown when you walk in. */
  arrival: string;
  center: [x: number, z: number];
  radius: number;
  biome: Biome;
  /** Accent used for its road, minimap blob and layer chip. */
  color: string;
  /** Discover on foot, without a road or a wire back to the hub. */
  secluded?: boolean;
  /**
   * Off-island zones live in another place (reached by ladder, not by road).
   * Their `center` and `radius` are ignored: that place lays them out.
   */
  place?: 'basement';
  /**
   * Raise the zone into a terraced hill this many units tall (the player is ~1.75).
   * Its road becomes a switchback ramp up the front; the cliffs can't be walked.
   */
  elevation?: number;
}

export const zones: Zone[] = [
  {
    id: 'spawn',
    name: 'Frame 1 (final)',
    arrival: 'The original artboard. Everything was flat here once.',
    center: [0, 0],
    radius: 7,
    biome: 'plaza',
    color: '#3b82f6',
  },
  {
    id: 'modyfi',
    name: 'Modyfi Grove',
    arrival: 'The trees here are running shaders. Some of them are art.',
    center: [-14, -9],
    radius: 7.5,
    biome: 'grove',
    color: '#e879f9',
  },
  {
    id: 'figma',
    name: 'Expressive Design',
    arrival: 'Every wire on the island ends up here eventually. Something is being orchestrated.',
    center: [16, -10],
    radius: 8.5,
    biome: 'canvas',
    color: '#a259ff',
  },
  {
    id: 'garden',
    name: 'Sketch Garden',
    arrival: 'Something recursive is growing in the soil.',
    center: [13, 12],
    radius: 6.5,
    biome: 'garden',
    color: '#f43f5e',
  },
  {
    id: 'ruins',
    name: 'Rectangle 12 Ruins',
    arrival: 'Half-finished frames. Detached instances. A vague sense of data.',
    center: [-13, 12],
    radius: 6.5,
    biome: 'ruins',
    color: '#a3a3a3',
  },
  {
    id: 'ring',
    name: 'Amanita Ring',
    arrival: 'The pixels here are breathing. Probably fine.',
    center: [0, -18],
    radius: 4.5,
    biome: 'mushroom',
    color: '#ef4444',
  },
  {
    id: 'pond',
    name: '404 Pond',
    arrival: 'A quiet backwater. Everything that went missing ends up here.',
    center: POND.center,
    radius: POND.radius,
    biome: 'pond',
    color: '#67b8c8',
    secluded: true,
  },
  {
    id: 'reset',
    name: 'The Underpass',
    arrival: 'You can feel a kick drum through the concrete.',
    center: [0, 0],
    radius: 0,
    biome: 'concrete',
    color: '#6366f1',
    place: 'basement',
  },
  {
    id: 'about',
    name: 'Toe Knee (Main component)',
    arrival: 'Every Toe Knee on this island is an instance of this one.',
    center: [0, 19.5],
    radius: 5.2,
    biome: 'summit',
    color: '#f59e0b',
    elevation: 4.2,
  },
];

export type ZoneId = (typeof zones)[number]['id'];

export const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

/** The zones laid out on the island itself (plateaus, roads, the signpost). */
export const islandZones = zones.filter((zone) => !zone.place);
