/**
 * Overhead prayers: one at a time, shown floating above the player's head,
 * the way protection prayers are. These protect from the workday instead.
 */
export type PrayerId = 'sleep' | 'slack' | 'zoom';

export interface PrayerDef {
  id: PrayerId;
  name: string;
  level: number;
  blurb: string;
  /** Pixel sprite for the overhead icon and the prayer book. */
  sprite: string[];
  palette: Record<string, string>;
}

/** Wrap a sprite in a hard 1px black outline (`k`), like every overhead icon. */
function outlined(rows: string[]): string[] {
  const h = rows.length + 2;
  const w = rows[0].length + 2;
  const at = (x: number, y: number) => {
    const c = rows[y - 1]?.[x - 1];
    return c !== undefined && c !== '.';
  };
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (at(x, y)) return rows[y - 1][x - 1];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) return 'k';
      return '.';
    }).join('')
  );
}

/** Paint rectangles onto a blank grid; `cut` knocks out corner pixels to round them off. */
function paint(w: number, h: number, shapes: { c: string; x: number; y: number; w: number; h: number; cut?: [number, number][] }[]) {
  const grid = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  for (const s of shapes) {
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) grid[y][x] = s.c;
    for (const [x, y] of s.cut ?? []) grid[y][x] = '.';
  }
  return grid.map((r) => r.join(''));
}

/**
 * The Slack pinwheel on a 4×4 grid of 3px units with 1px gaps: each colour is
 * one long bar plus a nub, rotating around the middle.
 */
const SLACK = paint(15, 15, [
  // blue: bar pointing left, nub above
  { c: 'b', x: 0, y: 4, w: 7, h: 3, cut: [[0, 4], [0, 6]] },
  { c: 'b', x: 4, y: 0, w: 3, h: 3, cut: [[4, 0], [6, 0]] },
  // green: bar pointing up, nub to the right
  { c: 'g', x: 8, y: 0, w: 3, h: 7, cut: [[8, 0], [10, 0]] },
  { c: 'g', x: 12, y: 4, w: 3, h: 3, cut: [[14, 4], [14, 6]] },
  // yellow: bar pointing right, nub below
  { c: 'y', x: 8, y: 8, w: 7, h: 3, cut: [[14, 8], [14, 10]] },
  { c: 'y', x: 8, y: 12, w: 3, h: 3, cut: [[8, 14], [10, 14]] },
  // red: bar pointing down, nub to the left
  { c: 'r', x: 4, y: 8, w: 3, h: 7, cut: [[4, 14], [6, 14]] },
  { c: 'r', x: 0, y: 8, w: 3, h: 3, cut: [[0, 8], [0, 10]] },
]);

/** The Zoom app icon: a blue rounded square around a white camera. */
const ZOOM = paint(15, 15, [
  {
    c: 'b',
    x: 0,
    y: 0,
    w: 15,
    h: 15,
    cut: [[0, 0], [1, 0], [0, 1], [14, 0], [13, 0], [14, 1], [0, 14], [1, 14], [0, 13], [14, 14], [13, 14], [14, 13]],
  },
  { c: 'w', x: 2, y: 4, w: 8, h: 7, cut: [[2, 4], [9, 4], [2, 10], [9, 10]] },
  { c: 'w', x: 11, y: 6, w: 1, h: 3 },
  { c: 'w', x: 12, y: 5, w: 1, h: 5 },
]);

/** No logo for sleep, so: the moon and a Z. */
const SLEEP = [
  '..........zzzz.',
  '...mmm......z..',
  '..mmm......z...',
  '.mmm......zzzz.',
  '.mmm...........',
  'mmmm...........',
  'mmmm...........',
  'mmmmm..........',
  'dmmmmm.......m.',
  '.dmmmmmm...mmm.',
  '.dmmmmmmmmmmmm.',
  '..ddmmmmmmmmm..',
  '...dddmmmmmd...',
  '.....ddddd.....',
];

export const PRAYERS: PrayerDef[] = [
  {
    id: 'sleep',
    name: 'Protect from Sleep',
    level: 37,
    blurb: 'You no longer sit down on the floor when left alone.',
    sprite: outlined(SLEEP),
    palette: { m: '#fde68a', d: '#d4a72c', z: '#e0f2fe', k: '#000000' },
  },
  {
    id: 'slack',
    name: 'Protect from Slack',
    level: 40,
    blurb: 'Messages bounce off. Your status is set to “in the zone”.',
    sprite: outlined(SLACK),
    palette: { b: '#36c5f0', g: '#2eb67d', y: '#ecb22e', r: '#e01e5a', k: '#000000' },
  },
  {
    id: 'zoom',
    name: 'Protect from Zoom',
    level: 43,
    blurb: 'Every meeting could have been an email. Now it is.',
    sprite: outlined(ZOOM),
    palette: { b: '#0b5cff', w: '#ffffff', k: '#000000' },
  },
];

export const prayerById = new Map(PRAYERS.map((p) => [p.id, p]));
