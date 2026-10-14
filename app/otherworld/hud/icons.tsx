'use client';

import type { ReactNode } from 'react';
import { memo } from 'react';
import { ITEMS, type ItemId } from '../state/items';
import { skillById } from '../state/skills';
import type { SkillId } from '@/content/works';

/** Pixel art from a row-string sprite + palette, as crisp SVG rects. */
export const PixelSprite = memo(function PixelSprite({
  rows,
  palette,
  size = 32,
  className,
}: {
  rows: string[];
  palette: Record<string, string>;
  size?: number;
  className?: string;
}) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = palette[row[x]];
      if (fill) rects.push(<rect key={`${x},${y}`} x={x} y={y} width={1.04} height={1.04} fill={fill} />);
    }
  });
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden
      style={{ filter: 'drop-shadow(1px 1px 0 rgba(0,0,0,0.85))' }}
    >
      {rects}
    </svg>
  );
});

export function ItemIcon({ id, size = 34 }: { id: ItemId; size?: number }) {
  const def = ITEMS[id];
  return <PixelSprite rows={def.sprite} palette={def.palette} size={size} />;
}

export function SkillGlyph({ id, size = 22 }: { id: SkillId; size?: number }) {
  const def = skillById.get(id)!;
  return <PixelSprite rows={def.glyph.map((r) => r.replace(/#/g, 'a'))} palette={{ a: def.color }} size={size} />;
}

const TAB_ICONS: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  inventory: {
    rows: ['...bb...', '..b..b..', '.kkkkkk.', 'kbbbbbbk', 'kbbbbbbk', 'kbbyybbk', 'kbbbbbbk', '.kkkkkk.'],
    palette: { b: '#a16207', k: '#422006', y: '#facc15' },
  },
  skills: {
    rows: ['........', '......g.', '......g.', '....g.g.', '....g.g.', '..g.g.g.', '..g.g.g.', 'gggggggg'],
    palette: { g: '#a3e635' },
  },
  quests: {
    rows: ['.pppppp.', 'pwwwwwwp', '.wkkkkw.', '.wwwwww.', '.wkkkww.', '.wwwwww.', 'pwwwwwwp', '.pppppp.'],
    palette: { p: '#92400e', w: '#fef3c7', k: '#78716c' },
  },
  layers: {
    rows: ['...bb...', '.bbbbbb.', 'bbbbbbbb', '.lllll..', 'llllllll', '.ddddd..', 'dddddddd', '.dddddd.'],
    palette: { b: '#93c5fd', l: '#3b82f6', d: '#1d4ed8' },
  },
  effects: {
    rows: ['...m....', '..mmm...', 'mmmwmmm.', '..mmm..c', '...m..cc', '.....ccc', '..c...cc', '.......c'],
    palette: { m: '#e879f9', w: '#ffffff', c: '#22d3ee' },
  },
  lab: {
    rows: ['.g....g.', '..g..g..', '.pppppp.', 'pwkppwkp', 'pppppppp', 'pp.yy.pp', '.pppppp.', '.p.p.p.p'],
    palette: { g: '#a3e635', p: '#c084fc', w: '#fafafa', k: '#09090b', y: '#facc15' },
  },
  prayer: {
    rows: ['...w....', '.w.w.w..', '..www...', 'wwwcwww.', '..www...', '.w.w.w..', '...w....', '........'],
    palette: { w: '#e0f2fe', c: '#38bdf8' },
  },
  house: {
    rows: ['...rr...', '..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.wwwwww.', '.wbbwdw.', '.wbbwdw.', '.wwwwdw.'],
    palette: { r: '#b91c1c', w: '#e7e5e4', b: '#60a5fa', d: '#78350f' },
  },
  hammer: {
    rows: ['.kkkk...', '.kkkkk..', '.kkk....', '...w....', '....w...', '.....w..', '......w.', '.......w'],
    palette: { k: '#a1a1aa', w: '#b45309' },
  },
  music: {
    rows: ['....nnnn', '...nnnnn', '...n...n', '...n...n', '...n...n', '.nnn.nnn', 'nnnnnnnn', '.nn..nn.'],
    palette: { n: '#facc15' },
  },
  plugins: {
    rows: ['..k..k..', '..k..k..', '.zzzzzz.', '.zzzzzz.', '.zzzzzz.', '..zzzz..', '...zz...', '...kk...'],
    palette: { k: '#d4d4d8', z: '#71717a' },
  },
};

export function TabIcon({ tab, size = 26 }: { tab: string; size?: number }) {
  const icon = TAB_ICONS[tab];
  if (!icon) return null;
  return <PixelSprite rows={icon.rows} palette={icon.palette} size={size} />;
}

/** The player's own cursor-with-legs, for chat heads. */
export function CursorHead({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 28" aria-hidden>
      <path
        d="M4 2 L4 18 L8 14.5 L11 21 L13.6 20 L10.6 13.6 L15.5 13.5 Z"
        fill="#09090b"
        stroke="#fafafa"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="6.3" cy="10.3" r="1.3" fill="#fafafa" />
      <circle cx="8.9" cy="11.2" r="1.3" fill="#fafafa" />
      <circle cx="6.5" cy="10.5" r="0.6" fill="#09090b" />
      <circle cx="9.1" cy="11.4" r="0.6" fill="#09090b" />
      <path d="M7 19 L6 25 M11 21 L12 25" stroke="#18181b" strokeWidth="1.2" />
      <circle cx="6.4" cy="22" r="0.9" fill="#3b82f6" />
      <circle cx="11.6" cy="23" r="0.9" fill="#3b82f6" />
    </svg>
  );
}
