import { profile } from '@/content/profile';
import type { CreatureSpec } from '../creatures/spec';
import { gameState } from '../state/store';

export type Speaker = 'tony' | 'player' | 'card' | 'narrator' | 'creature';

export interface DialogueOption {
  label: string;
  next: string | null;
  run?: () => void;
}

export interface DialogueNode {
  speaker: Speaker;
  text: string;
  next?: string | null;
  options?: DialogueOption[];
  /** Runs once when the node is shown. */
  enter?: () => void;
  /** Overrides the speaker's name (visitor-made creatures). */
  name?: string;
  /** Draws the chat head for a creature speaker. */
  creature?: CreatureSpec;
}

const giveCard = () => {
  const g = gameState();
  if (g.hasItem('card')) {
    g.say('You already have one of his cards.');
    return;
  }
  if (g.addItem({ id: 'card' })) g.say('Tony hands you a business card.');
};

/** Static conversations, plus creature ones written in at talk time (see ../creatures/actions). */
export const DIALOGUE: Record<string, DialogueNode> = {
  tony: { speaker: 'tony', text: 'Oh! Same hair, same glasses. Is that my croissant shirt? Welcome to Untitled-1, I suppose.', next: 'tony-menu' },
  'tony-menu': {
    speaker: 'player',
    text: 'Select an option',
    options: [
      { label: 'Who are you?', next: 'tony-who' },
      { label: 'What is this place?', next: 'tony-place' },
      { label: 'How do I get around?', next: 'tony-controls' },
      { label: 'Can I get in touch?', next: 'tony-contact' },
      { label: 'Got any tea?', next: 'tony-tea' },
      { label: 'Bye.', next: 'tony-bye' },
    ],
  },
  'tony-who': {
    speaker: 'tony',
    text: `I'm ${profile.name.split(' ')[0]}: a design engineer who builds design tools. I was on the founding team at Modyfi, a next-generation design workbench.`,
    next: 'tony-who-2',
  },
  'tony-who-2': {
    speaker: 'tony',
    text: 'I also collect tea and make generative art. Sometimes at the same time, which is how the stall happened.',
    next: 'tony-menu',
  },
  'tony-place': {
    speaker: 'tony',
    text: "My portfolio. It started as a flat artboard, then it got opinions. Every project is a frame, and the wires show how they're related. Follow them.",
    next: 'tony-place-2',
  },
  'tony-place-2': {
    speaker: 'tony',
    text: "Most of the art isn't hung yet. The empty frames and shader trees are placeholders. Check back.",
    next: 'tony-menu',
  },
  'tony-controls': {
    speaker: 'tony',
    text: 'Tap to walk. Long-press, or right-click, anything for options. Drag to look around; pinch or scroll to zoom.',
    next: 'tony-controls-2',
  },
  'tony-controls-2': {
    speaker: 'tony',
    text: 'The Quests tab lists every project. Pick one and you get cut-and-pasted straight there. Oh, and ⌘Z undoes physics.',
    next: 'tony-menu',
  },
  'tony-contact': { speaker: 'tony', text: "Here's my card.", enter: giveCard, next: 'tony-menu' },
  'tony-tea': {
    speaker: 'tony',
    text: "There's a stall right there. Help yourself. I'll pretend not to notice.",
    next: 'tony-menu',
  },
  'tony-bye': { speaker: 'tony', text: 'Mind the primitives. They bite. Gently.', next: null },
  card: {
    speaker: 'card',
    text: `${profile.name.toUpperCase()}: ${profile.title}. ${profile.pronouns}.`,
    options: [
      ...profile.links.map((l) => ({
        label: `${l.label} ↗`,
        next: null,
        run: () => window.open(l.href, '_blank', 'noopener'),
      })),
      { label: 'Classic site', next: null, run: () => window.open('/classic', '_self') },
      { label: 'Put it away.', next: null },
    ],
  },
};
