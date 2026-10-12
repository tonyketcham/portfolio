export type ItemId = 'tea' | 'amanita' | 'card' | 'handle' | 'pixel' | 'leaves';

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
};

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
}

export function itemName(stack: ItemStack) {
  if (stack.id === 'tea' && stack.variant != null) return `Cup of ${TEAS[stack.variant % TEAS.length].name}`;
  return ITEMS[stack.id].name;
}
