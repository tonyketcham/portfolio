/**
 * Tony's cats. Each one is a coat: a palette and a pattern the pet model
 * (app/otherworld/pet/cat.ts) paints itself with, plus a name and a line for
 * Examine. Squim (`CAT`) is also the Cat cape (roundel, cloth, tail) and owns
 * the kitchen basket.
 *
 * Palette keys are by role, not by colour: `white` is the light undercoat
 * (chest, belly, muzzle), `grey` the main coat, `greyDark` the shading on the
 * tail base and hind legs, `tail` the tail and the ear tips, `smudge` the
 * accent (Squim's nose smudge, How Mow's pale tufts, Mingi's stripes).
 */
export type CatPattern =
  /** White face, chest and paws; a grey cap, a nose smudge, a patched saddle. */
  | 'bicolour'
  /** One colour all over, a paler ruff and belly; long hair (see `fluff`). */
  | 'solid'
  /** Mackerel tabby: stripes round the body, legs and tail, an "M" on the brow. */
  | 'tabby';

export interface CatCoat {
  /** Stable key: interactable ids, save data. */
  id: string;
  /** Shown in menus and chat. Rename freely. */
  name: string;
  pattern: CatPattern;
  examine: string;
  /** 0 sleek … 1 a dandelion. Thickens the body and tail, adds a ruff and cheek tufts. */
  fluff: number;
  /** Multiplies the Cat tweak's scale. */
  size: number;
  /** Naps in the kitchen basket (only one cat fits). */
  basket: boolean;
  white: string;
  grey: string;
  greyDark: string;
  tail: string;
  smudge: string;
  eyes: string;
  pupil: string;
  innerEar: string;
  nose: string;
  collar: string;
  tag: string;
  tagShape: 'heart' | 'disc';
  tongue: string;
  /** The little "z" that rises off it while it sleeps. */
  dream: string;
}

/**
 * Squim. Grey-and-white bicolour: white face, chest and paws; a grey cap over
 * the ears and the top of the head; a lopsided grey smudge down the nose
 * bridge; grey back with white patches and a darker grey tail; green-yellow
 * eyes; a red heart tag on the collar.
 */
export const CAT: CatCoat = {
  id: 'cat',
  name: 'Squim',
  pattern: 'bicolour',
  examine: 'Grey cap, white socks, and a smudge on the nose it refuses to discuss. Owns the house. Lets you stay.',
  fluff: 0,
  size: 1,
  basket: true,
  white: '#efece6',
  grey: '#80838b',
  greyDark: '#575a62',
  tail: '#4a4c53',
  smudge: '#8c8f97',
  eyes: '#b9c24a',
  pupil: '#141416',
  innerEar: '#e7a2a6',
  nose: '#1c1a1c',
  collar: '#b4232a',
  tag: '#e0252f',
  tagShape: 'heart',
  /** Out for grooming, and for the post-stretch yawn. */
  tongue: '#e8848f',
  dream: '#e0f2fe',
};

/**
 * How Mow. A fluffy grey lady: smoky blue-grey all over, long hair with a
 * big paler ruff and britches, pale tufts on her paws, a plume of a tail,
 * wide chartreuse eyes, a grey nose, and an orange heart tag.
 */
export const HOW_MOW: CatCoat = {
  id: 'how-mow',
  name: 'How Mow',
  pattern: 'solid',
  examine: 'A cloud with opinions. Mostly ruff. Somewhere in there is a lady, and she would like a word.',
  fluff: 1,
  size: 1,
  basket: false,
  white: '#a3a3ab',
  grey: '#7f8089',
  greyDark: '#6b6c75',
  tail: '#74757e',
  smudge: '#b9b8bd',
  eyes: '#c8d443',
  pupil: '#141416',
  innerEar: '#c9a1a6',
  nose: '#5d575c',
  collar: '#3a3b42',
  tag: '#f0a030',
  tagShape: 'heart',
  tongue: '#e8848f',
  dream: '#ede9fe',
};

/**
 * Mingi. A brown mackerel tabby: warm brown-grey with black stripes round
 * the body and legs, an "M" on the brow, a cream chin and belly, a ringed
 * tail with a dark tip, a brick-pink nose, green eyes, a green collar and a
 * silver tag.
 */
export const MINGI: CatCoat = {
  id: 'mingi',
  name: 'Mingi',
  pattern: 'tabby',
  examine: 'Stripes, a pink nose, and the stare of someone who heard the treat bag from three rooms away.',
  fluff: 0,
  size: 0.98,
  basket: false,
  white: '#d9ccb4',
  grey: '#8a7659',
  greyDark: '#5e5040',
  tail: '#7a6850',
  smudge: '#2c241d',
  eyes: '#a8b862',
  pupil: '#141416',
  innerEar: '#e3a093',
  nose: '#c7735f',
  collar: '#2f6a49',
  tag: '#c9ccd2',
  tagShape: 'disc',
  tongue: '#e8848f',
  dream: '#fef3c7',
};

export const CATS: readonly CatCoat[] = [CAT, HOW_MOW, MINGI];
