/**
 * What creatures say. Lines are assembled from a mood's phrasebook plus facts
 * about the creature itself, so two blobs made the same minute still disagree.
 */
import { LABELS, type CreatureSpec, type Mood } from './spec';

type R = () => number;
const pick = <T>(r: R, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];

/** Things on this island a creature might have opinions about. */
const NOUNS = [
  'the wires', 'the tea stall', 'the cat', 'Tony', 'the fairy ring', 'the pond', 'undo', 'the layers panel', 'the kick drum under the concrete',
  'the empty frames', 'the shader trees', 'gravity', 'the cursor people', 'the minimap', 'the primitives', 'the void at the edge',
];

const IDLE: Record<Mood, string[]> = {
  cheerful: ['Hiii!', 'Nice pixels today!', 'I love it here. I love everything.', 'Have you seen {noun}? Wonderful.', 'Wheee.', '★ ★ ★'],
  cryptic: ['The frame remembers.', '{noun} is not what it seems.', 'Seven layers down, something is hidden.', 'Ask the pond.', '…', 'You are being rendered.'],
  grumpy: ['Hmph.', 'Who made me like this?', '{noun}. Ugh.', 'Stop clicking me.', "I didn't ask to be instantiated.", 'Too many polygons. Not enough respect.'],
  dramatic: ['Behold me!', 'Alas, {noun}!', 'Tonight, I become legend.', 'My {part}! My glorious {part}!', 'I was born for this frame.', '*poses*'],
  anxious: ['Is {noun} okay?', 'Did I leave the oven on? Do I have an oven?', 'Am I clipping?', "Don't look at my {part}.", 'What if they hit undo?', 'Breathe in. Breathe out. Render.'],
  philosophical: ['If a shader runs and no one looks, does it compile?', 'Am I the mesh or the material?', '{noun} is just {noun2} with extra steps.', 'We are all instances of something.', 'What is a frame, really?', 'Every pixel is a choice.'],
};

const GREETINGS: Record<Mood, string[]> = {
  cheerful: ["Oh! A visitor! Hi! I'm {name}!", "{name} here! You look great. Very low-poly."],
  cryptic: ['You found {name}. Or {name} found you.', 'I am {name}. I have been waiting since {when}.'],
  grumpy: ["What. It's {name}. What do you want.", "{name}. Don't wear it out."],
  dramatic: ['I. AM. {NAME}!', 'Kneel before {name}, sculpted at {when}!'],
  anxious: ["Oh! Hi. Sorry. I'm {name}. Is that okay?", "Um. {name}. That's me. I think."],
  philosophical: ['Greetings. I am {name}, or at least I am currently being called that.', '{name}, they call me. Names are just labels on layers.'],
};

const WANTS: Record<Mood, string[]> = {
  cheerful: ['To make a friend! You count!', 'More confetti. Always more confetti.', 'To hug the cat. It refuses.'],
  cryptic: ['To reach the bottom of the layers panel.', 'The key under {noun}.', 'Nothing you can carry.'],
  grumpy: ['Fewer visitors.', 'A smaller head. Or a bigger body. Something.', 'For {noun} to stop.'],
  dramatic: ['A stage! A spotlight! A second spotlight!', 'To be hung in a frame, like the great works.', 'Revenge on whoever named me.'],
  anxious: ['For nobody to press reset.', 'Reassurance. Mostly reassurance.', "To know if my {part} looks weird. Don't answer."],
  philosophical: ['To understand {noun}.', 'Nothing. Wanting is just a shader for disappointment.', 'To know what renders us.'],
};

const SECRETS = [
  'The pond takes things. It gives back stranger things.',
  'Long-press almost anything. Most things have more than one verb.',
  '⌘Z undoes physics. Not choices. Mostly not choices.',
  'There is a trapdoor in Expressive Design. You can hear the kick drum through it.',
  'The effects tab has a Fever dream preset. Do not drive.',
  'Try ASCII and Neon edges together. I dare you.',
  'Eat an amanita and watch the pixels breathe.',
  'The cat has 99 lives here. That is a lot of lives.',
  'Every road leads back to the first artboard.',
  'Some music only plays if you find where it lives.',
  'The house portal goes to everyone’s house. It is the same house.',
];

const WHO: Record<Mood, string> = {
  cheerful: 'and honestly? I love it.',
  cryptic: 'Make of that what you will.',
  grumpy: 'Nobody consulted me.',
  dramatic: 'A masterpiece, some say. I say it.',
  anxious: "I hope that's normal.",
  philosophical: 'But are any of us more than our parameters?',
};

function partOf(s: CreatureSpec, r: R) {
  const parts = ['body'];
  if (s.legs) parts.push('legs');
  if (s.arms) parts.push('arms');
  if (s.topper !== 'none') parts.push(LABELS[s.topper].toLowerCase());
  if (s.eyeStyle === 'visor') parts.push('visor');
  else parts.push(s.eyes === 1 ? 'eye' : 'eyes');
  return pick(r, parts);
}

function when(s: CreatureSpec) {
  const d = new Date(s.born);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fill(text: string, s: CreatureSpec, r: R) {
  return text
    .replaceAll('{name}', s.name)
    .replaceAll('{NAME}', s.name.toUpperCase())
    .replaceAll('{when}', when(s))
    .replace('{noun2}', pick(r, NOUNS))
    .replaceAll('{noun}', pick(r, NOUNS))
    .replaceAll('{part}', partOf(s, r));
}

export const idleLine = (s: CreatureSpec, r: R = Math.random) => fill(pick(r, IDLE[s.mood]), s, r);
export const greeting = (s: CreatureSpec, r: R = Math.random) => fill(pick(r, GREETINGS[s.mood]), s, r);
export const want = (s: CreatureSpec, r: R = Math.random) => fill(pick(r, WANTS[s.mood]), s, r);
export const secret = (r: R = Math.random) => pick(r, SECRETS);

export function whoAmI(s: CreatureSpec) {
  const eyes = s.eyeStyle === 'visor' ? 'a visor' : `${s.eyes} eye${s.eyes === 1 ? '' : 's'}`;
  const legs = s.gait === 'slither' ? 'no legs to speak of' : s.legs ? `${s.legs} leg${s.legs === 1 ? '' : 's'}` : 'no legs';
  return `A visitor made me at ${when(s)}: one ${LABELS[s.body].toLowerCase()}, ${eyes}, ${legs} and a ${LABELS[s.skin].toLowerCase()} shader, ${WHO[s.mood]}`;
}

export function pokeLine(s: CreatureSpec, r: R = Math.random) {
  const lines: Record<Mood, string[]> = {
    cheerful: ['Hehe!', 'Again!', 'Boop!'],
    cryptic: ['You have disturbed the pattern.', 'Interesting.'],
    grumpy: ['OW.', 'Do that again and see.', 'Rude.'],
    dramatic: ['I have been STRUCK!', 'Unhand me!'],
    anxious: ['Eep!', 'Was that on purpose?!', 'Sorry! Sorry.'],
    philosophical: ['Was that you, or the physics?', 'Contact. How novel.'],
  };
  return pick(r, lines[s.mood]);
}
