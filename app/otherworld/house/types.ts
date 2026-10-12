/**
 * Player-owned house: shared types.
 *
 * Coordinates: a room is 8×8 tiles. Local tile (x, z) has x → east, z → south,
 * so the north wall is z = 0. Furniture is modelled facing +z (south) and a
 * hotspot's `facing` rotates it by facing × 90° about Y (0 S, 1 E, 2 N, 3 W).
 */
export type Side = 'n' | 'e' | 's' | 'w';
export type Facing = 0 | 1 | 2 | 3;

export type RoomId =
  | 'garden'
  | 'parlour'
  | 'kitchen'
  | 'dining'
  | 'workshop'
  | 'study'
  | 'questhall'
  | 'portals'
  | 'chapel'
  | 'achievements';

/** Hotspot kinds, named after OSRS "… space" objects (RuneLite gameval ObjectID javadoc). */
export type SpaceKind =
  | 'centrepiece'
  | 'big-tree'
  | 'tree'
  | 'big-plant'
  | 'small-plant'
  | 'chair'
  | 'rug'
  | 'fireplace'
  | 'bookcase'
  | 'curtains'
  | 'stove'
  | 'larder'
  | 'sink'
  | 'shelf'
  | 'barrel'
  | 'cat-basket'
  | 'kitchen-table'
  | 'dining-table'
  | 'seating'
  | 'bell-pull'
  | 'decoration'
  | 'workbench'
  | 'clockmaking'
  | 'tool'
  | 'heraldry'
  | 'lectern'
  | 'globe'
  | 'crystal-ball'
  | 'wall-chart'
  | 'telescope'
  | 'portrait'
  | 'landscape'
  | 'map'
  | 'sword'
  | 'guild-trophy'
  | 'stairs'
  | 'portal'
  | 'portal-focus'
  | 'altar'
  | 'lamp'
  | 'icon'
  | 'statue'
  | 'musical'
  | 'window'
  | 'display'
  | 'boss-lair'
  | 'jewellery-box'
  | 'adventure-log'
  | 'quest-list'
  | 'spell-altar';

export type FloorKind = 'planks' | 'stone' | 'grass' | 'marble' | 'carpet' | 'boards';

export interface HotspotDef {
  /** Unique within the room, e.g. "chair-2". */
  id: string;
  space: SpaceKind;
  /** Footprint in local tiles: [x, z, w, d]. */
  tiles: [number, number, number, number];
  facing: Facing;
  /** Wall-mounted: hangs on the wall behind its footprint, never blocks walking. */
  wall?: boolean;
  /** Floor decoration you can walk over (rugs). */
  walkable?: boolean;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Construction level + coins, as in the OSRS room creation menu. */
  level: number;
  cost: number;
  outdoor?: boolean;
  floor: FloorKind;
  doors: Side[];
  hotspots: HotspotDef[];
  /** What the room is for, in this house. */
  blurb: string;
}

/** A furniture choice per hotspot id. `null` / missing = empty hotspot. */
export type FurnitureChoices = Record<string, string | null>;

export interface RoomPlacement {
  room: RoomId;
  /** Room grid coordinates (each cell is 8×8 tiles). */
  at: [number, number];
  /** Quarter turns. */
  rot?: Facing;
  furniture: FurnitureChoices;
  /** Works shown by art hotspots in this room (portraits, portals, displays, windows…). */
  works?: Record<string, string>;
}

export type HouseStyleId = 'wood' | 'stone' | 'whitewash' | 'fremennik' | 'tropical' | 'fancy' | 'frame';

export interface HouseDesign {
  name: string;
  style: HouseStyleId;
  rooms: RoomPlacement[];
}
