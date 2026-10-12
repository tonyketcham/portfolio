import { zoneById } from '@/content/zones';

export type ItemId =
  | 'tea'
  | 'amanita'
  | 'card'
  | 'handle'
  | 'pixel'
  | 'leaves'
  | 'teapot'
  | 'puer'
  | 'coins'
  | 'phone'
  | 'tinderbox'
  | 'tablet';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Primary verb shown first, and used on tap. */
  primary: string;
  examine: string;
  /** 8×8 pixel sprite. Palette keys map to colours below. */
  sprite: string[];
  palette: Record<string, string>;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  tea: {
    id: 'tea',
    name: 'Cup of tea',
    primary: 'Drink',
    examine: 'Loose-leaf, properly brewed. Restores caffeine.',
    sprite: ['..s.s...', '...s.s..', '........', 'wwwwww..', 'wttttwww', 'wttttw.w', 'wttttwww', '.wwww...'],
    palette: { s: '#d4d4d8', w: '#fafafa', t: '#a16207' },
  },
  amanita: {
    id: 'amanita',
    name: 'Amanita',
    primary: 'Eat',
    examine: 'Fly agaric. Gorgeous. Almost certainly a bad idea.',
    sprite: ['..rrrr..', '.rwrrwr.', 'rrrrrrwr', 'rwrrrrrr', '........', '...cc...', '...cc...', '..cccc..'],
    palette: { r: '#dc2626', w: '#fafafa', c: '#f5f5f4' },
  },
  card: {
    id: 'card',
    name: 'Business card',
    primary: 'Read',
    examine: "Tony's card. It has a tiny cursor embossed on it.",
    sprite: ['........', 'wwwwwwww', 'wbwwwwww', 'wbbwkkkw', 'wbbbwwww', 'wbwwkkkw', 'wwwwwwww', '........'],
    palette: { w: '#f4f4f5', b: '#3b82f6', k: '#3f3f46' },
  },
  handle: {
    id: 'handle',
    name: 'Bezier handle',
    primary: 'Release',
    examine: "You caught one. It's still twitching.",
    sprite: ['bb......', 'bb......', '..l.....', '...l....', '....o...', '.....l..', '......bb', '......bb'],
    palette: { b: '#3b82f6', l: '#93c5fd', o: '#fafafa' },
  },
  pixel: {
    id: 'pixel',
    name: 'Loose pixel',
    primary: 'Place',
    examine: 'A single #ff00ff pixel. Someone forgot to snap it to the grid.',
    sprite: ['........', '........', '..mmmm..', '..mmmm..', '..mmmm..', '..mmmm..', '........', '........'],
    palette: { m: '#ff00ff' },
  },
  leaves: {
    id: 'leaves',
    name: 'Tea leaves',
    primary: 'Smell',
    examine: 'A twist of dark leaves. Smells like a library.',
    sprite: ['........', '...gg...', '..gddg..', '.gdddg..', '.gddgg..', '..ggg...', '...g....', '........'],
    palette: { g: '#4d7c0f', d: '#365314' },
  },
  teapot: {
    id: 'teapot',
    name: 'Hongni Shuiping',
    primary: 'Brew',
    examine: '1960s Factory One Yixing. Sixty years of seasoning. Do not wash it with soap.',
    sprite: ['...rr...', '..rrrr..', 'r.hhhh..', '.rrrrrr.', 'rrrrrrrr', 'rrrrrrr.', '.rrrrr..', '..dddd..'],
    palette: { r: '#b4532a', h: '#7c2d12', d: '#5b1f0a' },
  },
  puer: {
    id: 'puer',
    name: '2018 Yiwu Gouyoulin',
    primary: 'Smell',
    examine: 'A 357g cake of Yiwu sheng from Gouyoulin. Honeyed, thick, patient.',
    sprite: ['........', '..wwww..', '.wggggw.', 'wgdggdgw', 'wggrrggw', 'wgdggdgw', '.wggggw.', '..wwww..'],
    palette: { w: '#e7e5e4', g: '#65a30d', d: '#3f6212', r: '#b91c1c' },
  },
  coins: {
    id: 'coins',
    name: 'Coins',
    primary: 'Count',
    examine: 'Lovely money!',
    sprite: ['........', '...yy...', '..yooy..', '.yyyy...', 'yooyyy..', 'yyyyoy..', '.yyyyy..', '........'],
    palette: { y: '#facc15', o: '#ca8a04' },
  },
  phone: {
    id: 'phone',
    name: 'iPhone 16 Pro',
    primary: 'Check',
    examine: 'Desert titanium. Absolutely no signal in a design file.',
    sprite: ['..kkkk..', '.kssssk.', '.kbbbbk.', '.kbbbbk.', '.kbbbbk.', '.kbbbbk.', '.kssssk.', '..kkkk..'],
    palette: { k: '#a8a29e', s: '#18181b', b: '#2563eb' },
  },
  tinderbox: {
    id: 'tinderbox',
    name: 'Tinderbox',
    primary: 'Light',
    examine: 'Useful for lighting a fire.',
    sprite: ['........', '........', '.gggggg.', 'gwwwwwwg', 'gddddddg', 'gddddddg', '.gggggg.', '........'],
    palette: { g: '#78716c', w: '#d6d3d1', d: '#57534e' },
  },
  tablet: {
    id: 'tablet',
    name: 'Teleport tablet',
    primary: 'Break',
    examine: 'A tablet of enchanted clay. Break it to teleport.',
    sprite: ['........', '.cccccc.', 'cmmmmmmc', 'cmwmmwmc', 'cmmwwmmc', 'cmwmmwmc', 'cmmmmmmc', '.cccccc.'],
    palette: { c: '#a8a29e', m: '#7c3aed', w: '#c4b5fd' },
  },
};

/** Zone ids a teleport tablet can point at; the tablet's `variant` indexes this. */
export const TABLET_ZONES = ['house', 'spawn', 'modyfi', 'reset', 'garden', 'ruins', 'ring'] as const;

export function tabletZone(stack: ItemStack) {
  return TABLET_ZONES[(stack.variant ?? 0) % TABLET_ZONES.length];
}

/** What a fresh save starts carrying. */
export const STARTER_KIT: ItemStack[] = [
  { id: 'teapot' },
  { id: 'puer' },
  { id: 'coins', quantity: 96 },
  { id: 'phone' },
  { id: 'tinderbox' },
  ...TABLET_ZONES.map((_, variant) => ({ id: 'tablet' as const, variant })),
];

/** Drop the starter kit into the first free slots, skipping anything already carried. */
export function withStarterKit(inventory: (ItemStack | null)[]) {
  const next = inventory.slice();
  for (const stack of STARTER_KIT) {
    if (next.some((s) => s?.id === stack.id && s.variant === stack.variant)) continue;
    const slot = next.indexOf(null);
    if (slot === -1) break;
    next[slot] = { ...stack };
  }
  return next;
}

export const TEAS: { name: string; note: string }[] = [
  { name: 'sheng pu-erh', note: 'It tastes like a forest floor after rain.' },
  { name: 'shou pu-erh', note: 'Earthy and deep. Like drinking a very cosy cellar.' },
  { name: 'Tieguanyin', note: 'Orchids. Somewhere, a goddess of mercy nods.' },
  { name: 'Dan Cong', note: 'Honey and stone fruit. One leaf, eight fragrances.' },
  { name: 'Da Hong Pao', note: 'Roasty and mineral. Big red robe energy.' },
  { name: 'jasmine pearl', note: 'The pearls unfurl. So do you.' },
  { name: 'genmaicha', note: 'Toasted rice. A snack disguised as a tea.' },
  { name: 'sencha', note: 'Grassy and bright. You feel briefly productive.' },
  { name: 'Darjeeling', note: 'Muscatel. Very first flush of you.' },
  { name: 'Bai Mudan', note: 'Soft, white and floral. A pillow made of hay.' },
];

export interface ItemStack {
  id: ItemId;
  /** e.g. which tea is in the cup */
  variant?: number;
  /** Stackables (coins). Absent means 1. */
  quantity?: number;
}

export function itemName(stack: ItemStack) {
  if (stack.id === 'tea' && stack.variant != null) return `Cup of ${TEAS[stack.variant % TEAS.length].name}`;
  if (stack.id === 'tablet') {
    const id = tabletZone(stack);
    return `${id === 'house' ? 'House' : zoneById.get(id)?.name ?? id} teleport`;
  }
  return ITEMS[stack.id].name;
}
