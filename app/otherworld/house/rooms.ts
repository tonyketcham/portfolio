/**
 * Room catalog for the player-owned house.
 *
 * Reference: OSRS's POH as described by RuneLite's open-source gameval tables
 * (runelite-api/.../gameval/ObjectID.java, BSD-2). Room ids, hotspot names and
 * which spaces live in which room come from the POH_* constants and their
 * javadoc ("Chair space", "Larder space", "Portal space", "Centrepiece space"…),
 * e.g. POH_PARLOUR_1..7, POH_KITCHEN_1..7, POH_STUDY_1..6, POH_TELEROOM_1..7,
 * POH_HALL2_2..7 (quest hall), POH_CHAPEL_1..7, POH_ACHIEVEMENT_HOTSPOT_*.
 * Levels / costs follow the OSRS room creation menu. Positions inside the 8×8
 * room are laid out for this house (doors always sit on the middle two tiles).
 *
 * Nothing here is game data you'd recognise on sight: the furniture is all
 * modelled from scratch in ./furniture, and plenty of it is wrong on purpose.
 */
import type { HotspotDef, RoomDef, RoomId } from './types';

const h = (
  id: string,
  space: HotspotDef['space'],
  tiles: HotspotDef['tiles'],
  facing: HotspotDef['facing'],
  extra: Partial<HotspotDef> = {}
): HotspotDef => ({ id, space, tiles, facing, ...extra });

/** Room-wide hotspots (curtains, chapel windows) have no footprint. */
const roomWide = (id: string, space: HotspotDef['space']) => h(id, space, [0, 0, 0, 0], 0, { walkable: true });

export const ROOMS: Record<RoomId, RoomDef> = {
  // POH_CRUDE_GARDEN_*: Centrepiece / Big tree / Tree / Big plant / Small plant spaces
  garden: {
    id: 'garden',
    name: 'Garden',
    level: 1,
    cost: 1000,
    outdoor: true,
    floor: 'grass',
    doors: ['n', 'e', 's', 'w'],
    blurb: 'The way in and out. The exit portal exports you to the island.',
    hotspots: [
      h('centrepiece', 'centrepiece', [3, 3, 2, 2], 0),
      h('big-tree', 'big-tree', [0, 0, 2, 2], 0),
      h('tree', 'tree', [6, 0, 2, 2], 0),
      h('big-plant-1', 'big-plant', [0, 6, 1, 1], 0),
      h('big-plant-2', 'big-plant', [7, 6, 1, 1], 0),
      h('small-plant-1', 'small-plant', [2, 6, 1, 1], 0),
      h('small-plant-2', 'small-plant', [5, 6, 1, 1], 0),
    ],
  },
  // POH_PARLOUR_1..7: Chair ×3, Rug, Bookcase, Fireplace, Curtain spaces
  parlour: {
    id: 'parlour',
    name: 'Parlour',
    level: 1,
    cost: 1000,
    floor: 'planks',
    doors: ['n', 'e', 's', 'w'],
    blurb: 'Sit down. The fire burns a gradient map.',
    hotspots: [
      h('fireplace', 'fireplace', [5, 0, 2, 1], 0),
      h('bookcase-1', 'bookcase', [0, 0, 2, 1], 0),
      h('bookcase-2', 'bookcase', [7, 5, 1, 2], 3),
      h('rug', 'rug', [2, 2, 4, 4], 0, { walkable: true }),
      h('chair-1', 'chair', [5, 2, 1, 1], 2),
      h('chair-2', 'chair', [2, 5, 1, 1], 1),
      h('chair-3', 'chair', [5, 5, 1, 1], 3),
      roomWide('curtains', 'curtains'),
    ],
  },
  // POH_KITCHEN_1..7: Stove, Shelf, Barrel, Cat basket, Larder, Sink, Table spaces
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    level: 5,
    cost: 5000,
    floor: 'stone',
    doors: ['n', 'e'],
    blurb: 'Tea, mostly. The larder is stocked with shader nodes.',
    hotspots: [
      h('stove', 'stove', [0, 2, 1, 2], 1),
      h('sink', 'sink', [0, 5, 1, 1], 1),
      h('larder', 'larder', [5, 0, 2, 1], 0),
      h('shelf-1', 'shelf', [1, 0, 1, 1], 0, { wall: true }),
      h('shelf-2', 'shelf', [0, 6, 1, 1], 1, { wall: true }),
      h('barrel', 'barrel', [7, 7, 1, 1], 3),
      h('cat-basket', 'cat-basket', [1, 7, 1, 1], 2),
      h('table', 'kitchen-table', [3, 4, 2, 2], 0),
    ],
  },
  // POH_DINING_ROOM_1..7: Table, Seating ×2, Fireplace, Curtains, Decoration, Bell-pull spaces
  dining: {
    id: 'dining',
    name: 'Dining room',
    level: 10,
    cost: 5000,
    floor: 'boards',
    doors: ['n', 'e', 'w'],
    blurb: 'Ring the bell-pull. Someone is always viewing this file.',
    hotspots: [
      h('table', 'dining-table', [2, 4, 4, 2], 0),
      h('seating-1', 'seating', [2, 3, 4, 1], 0),
      h('seating-2', 'seating', [2, 6, 4, 1], 2),
      h('fireplace', 'fireplace', [5, 0, 2, 1], 0),
      h('bell-pull', 'bell-pull', [7, 0, 1, 1], 0, { wall: true }),
      h('decoration', 'decoration', [0, 0, 3, 1], 0, { wall: true }),
      roomWide('curtains', 'curtains'),
    ],
  },
  // POH_WORKSHOP_1..5: Workbench, Clockmaking, Tool ×5, Repair, Heraldry spaces
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    level: 15,
    cost: 10000,
    floor: 'boards',
    doors: ['n', 's', 'w'],
    blurb: 'Where the tools get made. Modyfi lives on the workbench.',
    hotspots: [
      h('workbench', 'workbench', [5, 3, 2, 2], 3),
      h('clockmaking', 'clockmaking', [6, 0, 2, 1], 0),
      h('heraldry', 'heraldry', [1, 5, 1, 1], 1),
      h('tool-1', 'tool', [0, 1, 1, 1], 1, { wall: true }),
      h('tool-2', 'tool', [1, 0, 1, 1], 0, { wall: true }),
      h('tool-3', 'tool', [0, 6, 1, 1], 1, { wall: true }),
      h('tool-4', 'tool', [7, 6, 1, 1], 3, { wall: true }),
      h('tool-5', 'tool', [6, 7, 1, 1], 2, { wall: true }),
    ],
  },
  // POH_STUDY_1..6: Lectern, Globe, Crystal ball, Wall chart, Telescope, Bookcase spaces
  study: {
    id: 'study',
    name: 'Study',
    level: 40,
    cost: 50000,
    floor: 'carpet',
    doors: ['n', 'e', 's'],
    blurb: 'Make teleport tablets to anything in the portfolio.',
    hotspots: [
      h('lectern', 'lectern', [2, 3, 1, 1], 1),
      h('globe', 'globe', [1, 1, 1, 1], 0),
      h('crystal-ball', 'crystal-ball', [6, 6, 1, 1], 3),
      h('wall-chart', 'wall-chart', [0, 4, 1, 2], 1, { wall: true }),
      h('telescope', 'telescope', [6, 1, 1, 1], 0),
      h('bookcase', 'bookcase', [1, 7, 2, 1], 2),
    ],
  },
  // POH_HALL2_2..7 (quest hall): Portrait, Landscape, Guild trophy, Sword, Map, Bookcase spaces
  questhall: {
    id: 'questhall',
    name: 'Quest hall',
    level: 35,
    cost: 25000,
    floor: 'marble',
    doors: ['n', 'e', 's', 'w'],
    blurb: 'The gallery. Every frame here is a piece of the work.',
    hotspots: [
      // art hangs on the north + west walls: the ones the camera faces
      h('portrait-1', 'portrait', [1, 0, 2, 1], 0, { wall: true }),
      h('landscape-1', 'landscape', [5, 0, 2, 1], 0, { wall: true }),
      h('portrait-2', 'portrait', [0, 1, 1, 2], 1, { wall: true }),
      h('landscape-2', 'landscape', [0, 5, 1, 2], 1, { wall: true }),
      h('map', 'map', [7, 1, 1, 2], 3, { wall: true }),
      h('sword', 'sword', [7, 5, 1, 2], 3, { wall: true }),
      h('guild-trophy', 'guild-trophy', [5, 5, 1, 1], 3),
      h('bookcase', 'bookcase', [1, 7, 2, 1], 2),
      h('rug', 'rug', [3, 1, 2, 6], 0, { walkable: true }),
    ],
  },
  // POH_TELEROOM_1..3, 7: Portal ×3 + Centrepiece spaces
  portals: {
    id: 'portals',
    name: 'Portal chamber',
    level: 50,
    cost: 100000,
    floor: 'stone',
    doors: ['s'],
    blurb: 'Each portal is directed at a project. Step through.',
    hotspots: [
      h('portal-1', 'portal', [3, 0, 2, 1], 0),
      h('portal-2', 'portal', [0, 3, 1, 2], 1),
      h('portal-3', 'portal', [7, 3, 1, 2], 3),
      h('focus', 'portal-focus', [3, 3, 2, 2], 0),
    ],
  },
  // POH_CHAPEL_1..7: Icon, Altar, Lamp ×2, Statue ×2, Musical spaces + POH_CHAPELWINDOW_HOTSPOT
  chapel: {
    id: 'chapel',
    name: 'Chapel',
    level: 45,
    cost: 50000,
    floor: 'marble',
    doors: ['e', 's'],
    blurb: 'Pray at the altar of undo. The windows are stained with the work.',
    hotspots: [
      h('altar', 'altar', [3, 1, 2, 1], 0),
      h('icon', 'icon', [3, 0, 2, 1], 0, { wall: true }),
      h('lamp-1', 'lamp', [1, 1, 1, 1], 0),
      h('lamp-2', 'lamp', [6, 1, 1, 1], 0),
      h('statue-1', 'statue', [1, 5, 1, 1], 1),
      h('statue-2', 'statue', [6, 5, 1, 1], 3),
      h('musical', 'musical', [7, 7, 1, 1], 3),
      h('rug', 'rug', [3, 2, 2, 6], 0, { walkable: true }),
      roomWide('windows', 'window'),
    ],
  },
  // POH_ACHIEVEMENT_HOTSPOT_*: Altar, Adventure log, Jewellery box, Boss lair, Display, Quest list spaces
  achievements: {
    id: 'achievements',
    name: 'Achievement gallery',
    level: 80,
    cost: 500000,
    floor: 'carpet',
    doors: ['s'],
    blurb: 'Trophies, logs and a display case for the big ones.',
    hotspots: [
      h('display', 'display', [3, 3, 2, 2], 0),
      h('boss-lair', 'boss-lair', [3, 0, 2, 1], 0, { wall: true }),
      h('jewellery-box', 'jewellery-box', [6, 1, 1, 1], 3),
      h('adventure-log', 'adventure-log', [1, 1, 1, 1], 1),
      h('quest-list', 'quest-list', [0, 5, 1, 1], 1, { wall: true }),
      h('altar', 'spell-altar', [6, 5, 1, 1], 3),
    ],
  },
};

/** OSRS hotspot names, as the right-click menu shows them. */
export const SPACE_NAMES: Record<HotspotDef['space'], string> = {
  centrepiece: 'Centrepiece space',
  'big-tree': 'Big Tree space',
  tree: 'Tree space',
  'big-plant': 'Big plant space',
  'small-plant': 'Small plant space',
  chair: 'Chair space',
  rug: 'Rug space',
  fireplace: 'Fireplace space',
  bookcase: 'Bookcase space',
  curtains: 'Curtain space',
  stove: 'Stove space',
  larder: 'Larder space',
  sink: 'Sink space',
  shelf: 'Shelf space',
  barrel: 'Barrel space',
  'cat-basket': 'Cat basket space',
  'kitchen-table': 'Table space',
  'dining-table': 'Table space',
  seating: 'Seating space',
  'bell-pull': 'Bell pull space',
  decoration: 'Decoration space',
  workbench: 'Workbench space',
  clockmaking: 'Clockmaking space',
  tool: 'Tool space',
  heraldry: 'Heraldry space',
  lectern: 'Lectern space',
  globe: 'Globe space',
  'crystal-ball': 'Crystal ball space',
  'wall-chart': 'Wall chart space',
  telescope: 'Telescope space',
  portrait: 'Portrait space',
  landscape: 'Landscape space',
  map: 'Map space',
  sword: 'Sword space',
  'guild-trophy': 'Guild trophy space',
  stairs: 'Stair Space',
  portal: 'Portal space',
  'portal-focus': 'Centrepiece space',
  altar: 'Altar space',
  lamp: 'Lamp space',
  icon: 'Icon space',
  statue: 'Statue space',
  musical: 'Musical space',
  window: 'Window space',
  display: 'Display space',
  'boss-lair': 'Boss lair space',
  'jewellery-box': 'Jewellery box space',
  'adventure-log': 'Adventure log space',
  'quest-list': 'Quest list space',
  'spell-altar': 'Altar space',
};
