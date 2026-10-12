/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE HOUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tony's player-owned house: which rooms go where, what's built in each
 * hotspot, and which piece of work hangs on which hook. Everything else
 * (walls, doors, windows, lighting, walking) is derived from this.
 *
 *  • rooms sit on a grid of 8×8-tile cells: `at: [column, row]`, row 0 is north
 *  • `rot` turns a room in quarter turns (doors and furniture rotate with it)
 *  • `furniture` maps hotspot ids (see app/otherworld/house/rooms.ts) to a
 *    furniture id from the catalog (app/otherworld/house/furniture/*). Leave a
 *    hotspot out to leave it empty; visitors can build into it in build mode
 *  • `works` hangs portfolio pieces (slugs from content/works.ts) on art
 *    hotspots: portraits, landscapes, portals, the display case, chapel windows…
 *
 * Doors connect where both neighbouring rooms have a door on the shared side.
 * The garden sits in the middle as an open courtyard: every room around it
 * opens onto it, and their windows look into it.
 */
import type { HouseDesign } from '@/app/otherworld/house/types';

export const house: HouseDesign = {
  name: 'Untitled-1 (House)',
  style: 'fancy',
  rooms: [
    {
      room: 'garden',
      at: [1, 1],
      furniture: {
        centrepiece: 'exit-portal',
        'big-tree': 'art-oak',
        tree: 'pixel-pine',
        'big-plant-1': 'node-shrub',
        'big-plant-2': 'fern',
        'small-plant-1': 'potted-cursor',
        'small-plant-2': 'rosemary',
      },
      works: { 'big-tree': 'modyfi-piece-01' },
    },
    {
      room: 'parlour',
      at: [1, 2],
      furniture: {
        fireplace: 'gradient-fireplace',
        'bookcase-1': 'layers-bookcase',
        'bookcase-2': 'wooden-bookcase',
        rug: 'transparent-rug',
        'chair-1': 'rocking-chair',
        'chair-2': 'bezier-chair',
        'chair-3': 'chair-copy',
        curtains: 'marquee-curtains',
      },
    },
    {
      room: 'kitchen',
      at: [0, 2],
      furniture: {
        stove: 'kettle-range',
        sink: 'pump-tub',
        larder: 'node-larder',
        'shelf-1': 'tea-shelves',
        'shelf-2': 'wood-shelves',
        barrel: 'pixel-barrel',
        'cat-basket': 'cat-basket',
        table: 'autolayout-table',
      },
    },
    {
      room: 'dining',
      at: [2, 2],
      furniture: {
        table: 'oak-dining-table',
        'seating-1': 'oak-bench',
        'seating-2': 'oak-bench',
        fireplace: 'stone-fireplace',
        'bell-pull': 'bell-pull',
        decoration: 'mood-board',
        curtains: 'opulent-curtains',
      },
      works: { decoration: 'reset-presents' },
    },
    {
      room: 'questhall',
      at: [1, 3],
      furniture: {
        'portrait-1': 'figma-frame',
        'landscape-1': 'gilded-frame-wide',
        'portrait-2': 'oak-frame',
        'landscape-2': 'figma-frame-wide',
        map: 'island-map',
        sword: 'mounted-pen',
        'guild-trophy': 'rectangle-trophy',
        bookcase: 'mahogany-bookcase',
        rug: 'opulent-rug',
      },
      works: {
        'portrait-1': 'amanita',
        'landscape-1': 'modyfi',
        'portrait-2': 'modyfi-piece-02',
        'landscape-2': 'p5-svelte',
      },
    },
    {
      room: 'study',
      at: [0, 1],
      furniture: {
        lectern: 'cursor-lectern',
        globe: 'island-globe',
        'crystal-ball': 'crystal-ball',
        'wall-chart': 'burndown-chart',
        telescope: 'telescope',
        bookcase: 'wooden-bookcase',
      },
      works: { 'crystal-ball': 'modyfi' },
    },
    {
      room: 'workshop',
      at: [2, 1],
      furniture: {
        workbench: 'node-bench',
        clockmaking: 'clockmakers-bench',
        heraldry: 'swatch-easel',
        'tool-1': 'tool-rack',
        'tool-2': 'tool-rack',
        'tool-3': 'tool-rack',
        'tool-4': 'tool-rack',
        'tool-5': 'tool-rack',
      },
    },
    {
      room: 'portals',
      at: [1, 0],
      furniture: {
        'portal-1': 'marble-portal',
        'portal-2': 'teak-portal',
        'portal-3': 'teak-portal',
        focus: 'scrying-pool',
      },
      works: { 'portal-1': 'modyfi', 'portal-2': 'p5-svelte', 'portal-3': 'reset-presents' },
    },
    {
      room: 'chapel',
      at: [0, 0],
      furniture: {
        altar: 'altar-of-undo',
        icon: 'hamburger-icon',
        'lamp-1': 'incense-burner',
        'lamp-2': 'incense-burner',
        'statue-1': 'cursor-bust',
        'statue-2': 'cursor-bust',
        musical: 'monolith-organ',
        rug: 'brown-rug',
        windows: 'stained-glass',
      },
      works: { windows: 'amanita' },
    },
    {
      room: 'achievements',
      at: [2, 0],
      furniture: {
        display: 'display-case',
        'boss-lair': 'mounted-deadline',
        'jewellery-box': 'swatch-box',
        'adventure-log': 'adventure-log',
        'quest-list': 'quest-scroll',
        altar: 'preset-altar',
      },
      works: { display: 'vague-data' },
    },
  ],
};
