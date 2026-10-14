import type { CatchId } from '@/app/otherworld/state/items';
import type { Interactable } from '@/app/otherworld/state/runtime';

/** Small variations rotate without an immediate repeat; motion varies with them too. */
export const CATCH_GAGS: Record<CatchId, { lines: readonly string[]; labels: readonly string[] }> = {
  'missing-texture': {
    lines: [
      'You wear the missing texture. Your hat failed to load with remarkable confidence.',
      'You install skin_final_FINAL.png. It is a cube. Fashion has peaked.',
      'The texture appoints itself your emergency hat. It resigns shortly afterwards.',
    ],
    labels: ['hat not found', 'skin_final_FINAL.png', 'emergency fashion'],
  },
  'broken-link': {
    lines: [
      'You follow the link. A tiny portal opens to the exact place you are already standing.',
      'The link takes a scenic detour through nowhere, then redirects to nope.',
      'The destination sends a postcard: gone fishing. The link retires.',
    ],
    labels: ['404 → you are here', '301 → nope', 'destination: gone fishing'],
  },
  'old-jpeg': {
    lines: [
      'You crunch the JPEG. The sunset escapes as sixteen extremely crunchy pixels.',
      'You bite a compression artifact. For a moment, everything tastes like a 2006 holiday photo.',
      'You squeeze the JPEG. It sheds another generation of artifacts. They are somehow warm.',
    ],
    labels: ['quality: 3%', 'deep-fried sunset', 'IMG_0042_final.jpg'],
  },
  'undefined-fish': {
    lines: [
      'You release undefined. It swims through the air, returns nothing, and leaves.',
      'The fish discovers it was never told about gravity. It declines to learn.',
      'undefined swims a lap around your head. The type checker is taking a personal day.',
    ],
    labels: ['return undefined;', 'gravity is optional', 'typeof fish: wheee'],
  },
  'flash-site': {
    lines: [
      'You open the Flash site. It loads to 99%, demands a dance break, and finally crashes in confetti.',
      'A splash screen announces WELCOME TO MY HOMEPAGE. Its skip-intro button skips itself.',
      'The site promises a revolutionary mouse trail. The revolution lasts six seconds.',
    ],
    labels: ['LOADING… 99%', 'WELCOME TO MY HOMEPAGE', 'SKIP INTRO ▶'],
  },
};

export interface CatchRecipe {
  target: NonNullable<Interactable['catchTarget']>;
  lines: readonly string[];
  labels: readonly string[];
}

export const CATCH_RECIPES: Record<CatchId, CatchRecipe> = {
  'missing-texture': {
    target: 'frame',
    lines: [
      'You patch the frame with a missing texture. It exhibits the error as a bold new artistic direction.',
      'The frame accepts your emergency texture. The curator calls it Post-Assetism.',
      'Texture restored successfully. Texture is still missing. The frame seems proud.',
    ],
    labels: ['Post-Assetism', 'untitled (asset missing)', 'texture restored (?)'],
  },
  'broken-link': {
    target: 'portal',
    lines: [
      'You plug the broken link into the portal. It opens a smaller portal to itself. Very efficient.',
      'The portal redirects your redirect. You have invented the scenic round trip to nowhere.',
      'The portal tries HTTP 418 instead. Apparently it is a teapot now.',
    ],
    labels: ['redirect loop detected', 'you are still here', '418: I am a teapot'],
  },
  'old-jpeg': {
    target: 'tea',
    lines: [
      'The JPEG steeps into a cup of genmaicha. All the steam comes out in square pixels.',
      'You brew the JPEG at 8-bit depth. A cup of genmaicha emerges, lightly compressed.',
      'The kettle downsamples the sunset into toasted-rice tea. The aroma is aggressively rectangular.',
    ],
    labels: ['8-bit tea', 'steam.jpg', 'steep → export → drink'],
  },
  'undefined-fish': {
    target: 'cat',
    lines: [
      'The cat eats undefined. It has strong opinions about the missing type annotation.',
      'The cat accepts your fish, then pretends the entire transaction never happened.',
      'undefined is now inside a cat. Its whereabouts are finally well defined.',
    ],
    labels: ['typeof snack: delicious', 'transaction denied. *burp*', 'fish is defined now'],
  },
  'flash-site': {
    target: 'machine',
    lines: [
      'The machine boots the Flash site and becomes a tiny disco. Please do not update this plugin.',
      'The machine discovers autoplay. The dancing loading screen discovers you.',
      'You install one last Flash intro. The machine renders a suspiciously festive crash report.',
    ],
    labels: ['autoplay has entered the chat', 'plugin: party', 'fatal exception: disco'],
  },
};
