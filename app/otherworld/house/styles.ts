/**
 * House styles, after the OSRS estate-agent list (the RIMMINGTON / LUMBRIDGE /
 * POLLNIVNEACH / RELLEKKA / BRIMHAVEN / YANILLE suffixes on RuneLite's POH door
 * and window objects), plus one that only exists here.
 */
import type { HouseStyleId } from './types';

export interface HouseStyle {
  id: HouseStyleId;
  name: string;
  level: number;
  /** Wall surface colours (sRGB hex): base, accent (beams / mortar / band). */
  wall: [string, string];
  trim: string;
  /** Pattern id in the wall shader. */
  pattern: number;
  /** Outer face of the house + foundation. */
  plinth: string;
  examine: string;
}

export const HOUSE_STYLES: Record<HouseStyleId, HouseStyle> = {
  wood: {
    id: 'wood',
    name: 'Basic wood',
    level: 1,
    wall: ['#d9cdb2', '#5f4128'],
    trim: '#5f4128',
    pattern: 0,
    plinth: '#6b6458',
    examine: 'Wattle, daub, and a lot of optimism. (Rimmington)',
  },
  stone: {
    id: 'stone',
    name: 'Basic stone',
    level: 10,
    wall: ['#9a958c', '#7d786f'],
    trim: '#5e5a53',
    pattern: 1,
    plinth: '#57534e',
    examine: 'Grey stone. Grey mortar. Grey area. (Taverley)',
  },
  whitewash: {
    id: 'whitewash',
    name: 'Whitewashed stone',
    level: 20,
    wall: ['#efe8da', '#b9ab92'],
    trim: '#8f7d60',
    pattern: 2,
    plinth: '#a8977a',
    examine: 'Cool in the desert sun. (Pollnivneach)',
  },
  fremennik: {
    id: 'fremennik',
    name: 'Fremennik-style wood',
    level: 30,
    wall: ['#7a5130', '#5a3a20'],
    trim: '#3f2814',
    pattern: 3,
    plinth: '#4a4038',
    examine: 'Whole logs, stacked by someone who does not believe in nails. (Rellekka)',
  },
  tropical: {
    id: 'tropical',
    name: 'Tropical wood',
    level: 40,
    wall: ['#cdb07a', '#9c7f48'],
    trim: '#6b5430',
    pattern: 4,
    plinth: '#7c6a4a',
    examine: 'Bamboo. It grew back while you were reading this. (Brimhaven)',
  },
  fancy: {
    id: 'fancy',
    name: 'Fancy stone',
    level: 50,
    wall: ['#d9ccb2', '#b8a888'],
    trim: '#7a6a4f',
    pattern: 5,
    plinth: '#8a7d66',
    examine: 'Dressed ashlar with a trim you could lose a weekend to. (Yanille)',
  },
  frame: {
    id: 'frame',
    name: 'Frame',
    level: 70,
    wall: ['#f4f4f5', '#3b82f6'],
    trim: '#d4d4d8',
    pattern: 6,
    plinth: '#27272a',
    examine: 'Auto layout, 0 gap, clip content off. It shows.',
  },
};
