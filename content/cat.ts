/**
 * Tony's cat. One palette shared by the pet that wanders the house, the cat
 * in the kitchen basket, and the Cat cape (roundel, cloth, tail), so they all
 * read as the same animal.
 *
 * Grey-and-white bicolour: white face, chest and paws; a grey cap over the
 * ears and the top of the head; a lopsided grey smudge down the nose bridge;
 * grey back with white patches and a darker grey tail; green-yellow eyes; a
 * red heart tag on the collar.
 */
export const CAT = {
  /** Shown in menus and chat. Rename freely. */
  name: 'Cat',
  white: '#efece6',
  grey: '#80838b',
  greyDark: '#575a62',
  /** The tail and the tips of the ears. */
  tail: '#4a4c53',
  smudge: '#8c8f97',
  eyes: '#b9c24a',
  pupil: '#141416',
  innerEar: '#e7a2a6',
  nose: '#1c1a1c',
  collar: '#b4232a',
  tag: '#e0252f',
  /** Out for grooming, and for the post-stretch yawn. */
  tongue: '#e8848f',
  /** The little "z" that rises off it while it sleeps. */
  dream: '#e0f2fe',
} as const;
