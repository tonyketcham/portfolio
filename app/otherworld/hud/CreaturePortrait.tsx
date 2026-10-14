'use client';

import { memo, useId, type ReactNode } from 'react';
import type { CreatureSpec } from '../creatures/spec';

/** A flat little portrait of a creature, from the same spec as its mesh: chat heads and lab thumbnails. */
export const CreaturePortrait = memo(function CreaturePortrait({ spec, size = 40 }: { spec: CreatureSpec; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const [bodyHex, accent, glow] = spec.colors;
  const legH = spec.gait === 'slither' || !spec.legs ? 0 : 3 + spec.legLength * 5;
  const h = Math.min(30 - legH, 13 + spec.height * 16);
  const w = Math.min(30, 13 + spec.girth * 15);
  const cx = 20;
  const bottom = 40 - legH;
  const cy = bottom - h / 2;
  const top = bottom - h;

  const fill =
    spec.skin === 'void' ? '#0b0716' : spec.skin === 'missing' ? `url(#${uid}c)` : spec.skin === 'holo' || spec.skin === 'iridescent' ? `url(#${uid}g)` : bodyHex;
  const stroke = spec.skin === 'void' || spec.skin === 'holo' ? glow : '#0a0a0c';
  const common = { fill, stroke, strokeWidth: 1.2, strokeLinejoin: 'round' as const };

  let body: ReactNode;
  switch (spec.body) {
    case 'box':
      body = <rect x={cx - w / 2} y={top} width={w} height={h} rx={2} {...common} />;
      break;
    case 'bean':
      body = <rect x={cx - w / 2} y={top} width={w} height={h} rx={Math.min(w, h) / 2} {...common} />;
      break;
    case 'noodle':
      body = <rect x={cx - w * 0.28} y={top} width={w * 0.56} height={h} rx={w * 0.28} {...common} />;
      break;
    case 'cone':
      body = <polygon points={`${cx},${top} ${cx + w / 2},${bottom} ${cx - w / 2},${bottom}`} {...common} />;
      break;
    case 'gem':
      body = <polygon points={`${cx},${top} ${cx + w / 2},${cy} ${cx},${bottom} ${cx - w / 2},${cy}`} {...common} />;
      break;
    case 'ico':
      body = (
        <polygon
          points={[0, 60, 120, 180, 240, 300].map((a) => `${cx + Math.sin((a * Math.PI) / 180) * (w / 2)},${cy - Math.cos((a * Math.PI) / 180) * (h / 2)}`).join(' ')}
          {...common}
        />
      );
      break;
    case 'torus':
      body = <ellipse cx={cx} cy={cy} rx={w / 2 - 2.5} ry={h / 2 - 2.5} {...common} fill="none" stroke={fill === bodyHex ? bodyHex : glow} strokeWidth={5} />;
      break;
    case 'totem':
      body = (
        <>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={cx} cy={bottom - (h / 3) * (i + 0.5)} r={Math.min(w / 2, h / 5) * (1 - i * 0.1)} {...common} />
          ))}
        </>
      );
      break;
    default:
      body = <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...common} />;
  }

  // face
  const eyeY = spec.body === 'torus' ? top + 2 : cy - h * 0.16;
  const n = spec.eyes;
  const er = (1.4 + spec.eyeSize * 2.2) * (n > 3 ? 0.7 : 1);
  const spread = Math.min(w * 0.7, n * er * 2.4);
  const eyes: ReactNode[] = [];
  if (spec.eyeStyle === 'visor') {
    eyes.push(<rect key="v" x={cx - w * 0.36} y={eyeY - 1.6} width={w * 0.72} height={3.2} rx={1.2} fill={glow} stroke="#0a0a0c" strokeWidth={0.6} />);
  } else {
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? cx : cx - spread / 2 + (spread * i) / (n - 1);
      const y = spec.eyeStyle === 'stalk' ? top - 5 : eyeY + (n > 2 ? ((i * 37) % 5) - 2 : 0);
      if (spec.eyeStyle === 'stalk') eyes.push(<line key={`s${i}`} x1={cx + (x - cx) * 0.4} y1={top + 1} x2={x} y2={y} stroke="#0a0a0c" strokeWidth={1} />);
      const dark = spec.eyeStyle === 'void';
      eyes.push(
        <g key={i}>
          <circle cx={x} cy={y} r={er} fill={dark ? '#0a0a0c' : '#fafafa'} stroke="#0a0a0c" strokeWidth={0.6} />
          <circle cx={x + er * 0.15} cy={y + er * 0.1} r={er * (dark ? 0.3 : 0.5)} fill={dark ? glow : '#0a0a0c'} />
        </g>
      );
    }
  }

  const my = eyeY + Math.max(er * 1.8, h * 0.2);
  let mouth: ReactNode = null;
  switch (spec.mouth) {
    case 'smile':
      mouth = <path d={`M${cx - 3} ${my} Q${cx} ${my + 3} ${cx + 3} ${my}`} fill="none" stroke="#0a0a0c" strokeWidth={1.1} strokeLinecap="round" />;
      break;
    case 'o':
      mouth = <circle cx={cx} cy={my + 0.5} r={1.4} fill="none" stroke="#0a0a0c" strokeWidth={1} />;
      break;
    case 'zigzag':
      mouth = <polyline points={`${cx - 4},${my} ${cx - 2},${my + 1.5} ${cx},${my} ${cx + 2},${my + 1.5} ${cx + 4},${my}`} fill="none" stroke="#0a0a0c" strokeWidth={1} />;
      break;
    case 'beak':
      mouth = <polygon points={`${cx - 2.4},${my - 1} ${cx + 2.4},${my - 1} ${cx},${my + 3}`} fill={accent} stroke="#0a0a0c" strokeWidth={0.7} />;
      break;
    case 'fangs':
      mouth = (
        <>
          <rect x={cx - 3.5} y={my - 0.6} width={7} height={1.3} fill="#0a0a0c" />
          <polygon points={`${cx - 2.5},${my + 0.6} ${cx - 1.5},${my + 0.6} ${cx - 2},${my + 2.6}`} fill="#fafafa" />
          <polygon points={`${cx + 1.5},${my + 0.6} ${cx + 2.5},${my + 0.6} ${cx + 2},${my + 2.6}`} fill="#fafafa" />
        </>
      );
      break;
  }

  let topper: ReactNode = null;
  switch (spec.topper) {
    case 'antennae':
      topper = (
        <>
          <line x1={cx - 2} y1={top + 1} x2={cx - 5} y2={top - 6} stroke="#0a0a0c" strokeWidth={0.9} />
          <line x1={cx + 2} y1={top + 1} x2={cx + 5} y2={top - 6} stroke="#0a0a0c" strokeWidth={0.9} />
          <circle cx={cx - 5} cy={top - 6.5} r={1.5} fill={glow} />
          <circle cx={cx + 5} cy={top - 6.5} r={1.5} fill={glow} />
        </>
      );
      break;
    case 'horns':
      topper = (
        <>
          <polygon points={`${cx - 5},${top + 2} ${cx - 2},${top + 1} ${cx - 6},${top - 4}`} fill={accent} stroke="#0a0a0c" strokeWidth={0.6} />
          <polygon points={`${cx + 5},${top + 2} ${cx + 2},${top + 1} ${cx + 6},${top - 4}`} fill={accent} stroke="#0a0a0c" strokeWidth={0.6} />
        </>
      );
      break;
    case 'halo':
      topper = <ellipse cx={cx} cy={top - 3} rx={6} ry={1.6} fill="none" stroke={glow} strokeWidth={1.3} />;
      break;
    case 'cap':
      topper = (
        <>
          <path d={`M${cx - w * 0.5} ${top + 2} Q${cx} ${top - 9} ${cx + w * 0.5} ${top + 2} Z`} fill={accent} stroke="#0a0a0c" strokeWidth={0.8} />
          <circle cx={cx - 3} cy={top - 1.5} r={0.9} fill="#fafafa" />
          <circle cx={cx + 2.5} cy={top - 2.5} r={0.8} fill="#fafafa" />
        </>
      );
      break;
    case 'sprout':
      topper = (
        <>
          <line x1={cx} y1={top + 1} x2={cx} y2={top - 4} stroke={accent} strokeWidth={0.9} />
          <ellipse cx={cx - 2.4} cy={top - 4.5} rx={2.4} ry={1} fill={accent} />
          <ellipse cx={cx + 2.4} cy={top - 4.5} rx={2.4} ry={1} fill={accent} />
        </>
      );
      break;
    case 'flame':
      topper = <path d={`M${cx - 3} ${top + 1} Q${cx - 4} ${top - 4} ${cx} ${top - 8} Q${cx + 4} ${top - 4} ${cx + 3} ${top + 1} Z`} fill={glow} />;
      break;
    case 'cursor':
      topper = <path d={`M${cx - 2} ${top - 10} L${cx - 2} ${top - 2} L${cx} ${top - 4} L${cx + 1.6} ${top - 1} L${cx + 2.6} ${top - 1.6} L${cx + 1.2} ${top - 4.4} L${cx + 3.6} ${top - 4.4} Z`} fill="#0a0a0c" stroke="#fafafa" strokeWidth={0.6} />;
      break;
    case 'tophat':
      topper = (
        <>
          <rect x={cx - 5} y={top - 0.5} width={10} height={1.2} fill="#0a0a0c" />
          <rect x={cx - 3.2} y={top - 7} width={6.4} height={6.6} fill="#0a0a0c" />
          <rect x={cx - 3.2} y={top - 2} width={6.4} height={1} fill={accent} />
        </>
      );
      break;
  }

  const legs: ReactNode[] = [];
  const nl = legH ? Math.min(spec.legs, 6) : 0;
  for (let i = 0; i < nl; i++) {
    const x = nl === 1 ? cx : cx - w * 0.3 + (w * 0.6 * i) / (nl - 1);
    legs.push(<line key={i} x1={x} y1={bottom - 1} x2={x + (x - cx) * 0.25} y2={40} stroke="#0a0a0c" strokeWidth={1.3} strokeLinecap="round" />);
  }
  const arms: ReactNode[] = [];
  for (let i = 0; i < Math.min(spec.arms, 4); i++) {
    const side = i % 2 ? 1 : -1;
    const y = cy + Math.floor(i / 2) * 3;
    const x = cx + side * (spec.body === 'noodle' ? w * 0.28 : w * 0.46);
    arms.push(<line key={i} x1={x} y1={y} x2={x + side * 4} y2={y + 4} stroke="#0a0a0c" strokeWidth={1.1} strokeLinecap="round" />);
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 44" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bodyHex} />
          <stop offset="1" stopColor={glow} />
        </linearGradient>
        <pattern id={`${uid}c`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#0a0a0c" />
          <rect width="3" height="3" fill={bodyHex} />
          <rect x="3" y="3" width="3" height="3" fill={bodyHex} />
        </pattern>
      </defs>
      <g transform="translate(0 2)">
        {legs}
        {arms}
        {body}
        {topper}
        {eyes}
        {mouth}
      </g>
    </svg>
  );
});
