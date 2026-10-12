import type { SkillId } from '@/content/works';

export interface SkillDef {
  id: SkillId;
  name: string;
  color: string;
  /** 7×7 pixel glyph, rows top→bottom, '#' = ink. */
  glyph: string[];
  blurb: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'cats',
    name: 'Cats',
    color: '#f59e0b',
    blurb: 'Pet cats. There is one in the kitchen. You are already 99; hence the cape.',
    glyph: ['#.....#', '##...##', '#######', '#.###.#', '###.###', '.#####.', '..###..'],
  },
  {
    id: 'construction',
    name: 'Construction',
    color: '#d6a35c',
    blurb: 'Build furniture in your house. Weirder pieces need higher levels.',
    glyph: ['..###..', '..#.#..', '..###..', '...#...', '...#...', '..#.#..', '.#...#.'],
  },
  {
    id: 'tooling',
    name: 'Tooling',
    color: '#60a5fa',
    blurb: 'Inspect projects. Every frame you open trains this.',
    glyph: ['#......', '##.....', '###....', '####...', '##.#...', '...#...', '.......'],
  },
  {
    id: 'shaders',
    name: 'Shaders',
    color: '#e879f9',
    blurb: 'Stack effects, inspect shader work, tend the grove.',
    glyph: ['.#.#.#.', '#.#.#.#', '.#.#.#.', '#.#.#.#', '.#.#.#.', '#.#.#.#', '.#.#.#.'],
  },
  {
    id: 'tea',
    name: 'Tea',
    color: '#a3e635',
    blurb: 'Steal from the stall. Drink what you steal.',
    glyph: ['..#.#..', '.#.#...', '.......', '#####..', '#####.#', '#####.#', '.###...'],
  },
  {
    id: 'mycology',
    name: 'Mycology',
    color: '#f87171',
    blurb: 'Pick amanitas. Possibly eat them.',
    glyph: ['.#####.', '##.#.##', '#######', '.......', '..###..', '..###..', '..###..'],
  },
  {
    id: 'typography',
    name: 'Typography',
    color: '#fbbf24',
    blurb: 'Use the Text tool. Letters have mass here.',
    glyph: ['#######', '#..#..#', '...#...', '...#...', '...#...', '...#...', '..###..'],
  },
  {
    id: 'physics',
    name: 'Physics',
    color: '#22d3ee',
    blurb: 'Throw primitives around. Undo is allowed.',
    glyph: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  },
  {
    id: 'wandering',
    name: 'Wandering',
    color: '#d4d4d8',
    blurb: 'Walk. Every tile counts.',
    glyph: ['...##..', '...##..', '..#....', '.###...', '..#.#..', '.#...#.', '#.....#'],
  },
  {
    id: 'curiosity',
    name: 'Curiosity',
    color: '#facc15',
    blurb: 'Examine everything.',
    glyph: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
  },
  {
    id: 'generative',
    name: 'Generative',
    color: '#fb7185',
    blurb: 'Water the fractal tree. Make things that make things.',
    glyph: ['#..#..#', '.#.#.#.', '..###..', '...#...', '...#...', '...#...', '..###..'],
  },
];

export const skillById = new Map(SKILLS.map((s) => [s.id, s]));

/** The classic curve: level 99 at 13,034,431 xp. */
export const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < 99; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

export function levelForXp(xp: number) {
  let level = 1;
  while (level < 99 && xp >= XP_TABLE[level + 1]) level++;
  return level;
}

export function progressToNext(xp: number) {
  const level = levelForXp(xp);
  if (level >= 99) return 1;
  const lo = XP_TABLE[level];
  const hi = XP_TABLE[level + 1];
  return (xp - lo) / (hi - lo);
}
