/**
 * RuneScape-style chat effects: `red:wave:hello`, `glow1:`, `flash2:scroll:`…
 * An optional colour prefix, then an optional motion prefix, then the text.
 */

export type ChatColor =
  | 'yellow'
  | 'red'
  | 'green'
  | 'cyan'
  | 'purple'
  | 'white'
  | 'flash1'
  | 'flash2'
  | 'flash3'
  | 'glow1'
  | 'glow2'
  | 'glow3';

export type ChatMotion = 'wave' | 'wave2' | 'shake' | 'scroll' | 'slide';

export interface ChatEffects {
  /** The text without its prefixes. */
  text: string;
  color?: ChatColor;
  motion?: ChatMotion;
  /** Length of the stripped prefixes, so callers can truncate the body only. */
  prefixLength: number;
}

const COLORS = new Set<string>(['yellow', 'red', 'green', 'cyan', 'purple', 'white', 'flash1', 'flash2', 'flash3', 'glow1', 'glow2', 'glow3']);
const MOTIONS = new Set<string>(['wave', 'wave2', 'shake', 'scroll', 'slide']);

export function parseChatEffects(raw: string): ChatEffects {
  let rest = raw;
  let color: ChatColor | undefined;
  let motion: ChatMotion | undefined;
  const m1 = /^([a-z0-9]+):/i.exec(rest);
  if (m1 && COLORS.has(m1[1].toLowerCase())) {
    color = m1[1].toLowerCase() as ChatColor;
    rest = rest.slice(m1[0].length);
  }
  const m2 = /^([a-z0-9]+):/i.exec(rest);
  if (m2 && MOTIONS.has(m2[1].toLowerCase())) {
    motion = m2[1].toLowerCase() as ChatMotion;
    rest = rest.slice(m2[0].length);
  }
  // A bare prefix with nothing after it is just text.
  if (!rest.trim()) return { text: raw, prefixLength: 0 };
  return { text: rest, color, motion, prefixLength: raw.length - rest.length };
}

const STATIC: Partial<Record<ChatColor, number>> = {
  yellow: 0xffff00,
  red: 0xff0000,
  green: 0x00ff00,
  cyan: 0x00ffff,
  purple: 0xff00ff,
  white: 0xffffff,
};

const FLASH: Partial<Record<ChatColor, [number, number]>> = {
  flash1: [0xff0000, 0xffff00],
  flash2: [0x0000ff, 0x00ffff],
  flash3: [0x00b000, 0x80ff80],
};

const GLOW: Partial<Record<ChatColor, number[]>> = {
  glow1: [0xff0000, 0xffff00, 0x00ff00, 0x00ffff],
  glow2: [0xff0000, 0xff00ff, 0x0000ff],
  glow3: [0xffffff, 0x00ff00, 0x00ffff],
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function lerpColor(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** CSS colour for `color` at `t` seconds since the line appeared. */
export function chatColorAt(color: ChatColor | undefined, t: number, fallback: string): string {
  if (!color) return fallback;
  const s = STATIC[color];
  if (s !== undefined) return hex(s);
  const f = FLASH[color];
  if (f) return hex(f[Math.floor(t / 0.2) % 2]);
  const g = GLOW[color]!;
  // One full cycle through the stops every 3s, like the 150-tick client loop.
  const u = ((t % 3) / 3) * g.length;
  const i = Math.floor(u);
  return hex(lerpColor(g[i], g[(i + 1) % g.length], u - i));
}

/** Per-character offset in px for the wave/wave2/shake motions. */
export function charOffset(motion: ChatMotion, i: number, t: number, progress: number): [number, number] {
  const c = t * 10; // client cycles / 5
  switch (motion) {
    case 'wave':
      return [0, Math.sin(i / 2 + c) * 4];
    case 'wave2':
      return [Math.sin(i / 5 + c) * 4, Math.sin(i / 3 + c) * 4];
    case 'shake':
      return [0, Math.sin(i / 1.5 + c * 2) * 6 * Math.max(0, 1 - progress * 1.5)];
    default:
      return [0, 0];
  }
}

export const isPerChar = (m?: ChatMotion) => m === 'wave' || m === 'wave2' || m === 'shake';
