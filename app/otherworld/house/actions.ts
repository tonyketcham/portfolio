/**
 * What furniture does when you use it. Each FurnitureDef lists action ids;
 * this maps them to verbs that touch the rest of the game.
 */
import { CAT } from '@/content/cat';
import { profile } from '@/content/profile';
import { works } from '@/content/works';
import { examine, giveTea, inspectWork, mushroomMode, travel, travelToWork } from '../state/actions';
import { EFFECT_PRESETS } from '../state/effects';
import type { PoseKind } from '../avatar/poses';
import { catInBasket, petCat } from '../pet/actions';
import { emit, sfx, type GameEvent } from '../state/events';
import { playPose, runtime, sayOverhead } from '../state/runtime';
import { gameState } from '../state/store';
import type { PieceInstance } from './assemble';

const BOOKS = [
  'Grid Systems in Graphic Design',
  'The Elements of Typographic Style',
  'Interaction of Color',
  'The Book of Shaders (printed, somehow)',
  'Flour Water Salt Yeast',
  'Designing Data-Intensive Applications',
  'Thinking with Type',
  'A Pattern Language',
  'The Art of Fermentation',
  'Generative Design',
];

const BUTLER = [
  'Anonymous Axolotl joined the file.',
  'Anonymous Axolotl: you rang? I was just leaving a comment on the fireplace.',
  'Anonymous Axolotl: shall I tidy the layers? No? Very good.',
  'Anonymous Axolotl: tea is in the kitchen. The Kettle has opinions.',
  'Anonymous Axolotl: I renamed "Rectangle 12". Just kidding. I would never.',
  'Anonymous Axolotl left the file.',
];

let presetIndex = 0;
let butlerLine = 0;

type BurstKind = Extract<GameEvent, { type: 'burst' }>['kind'];

function burst(kind: BurstKind, p: PieceInstance, y = 1, count = 14) {
  emit({ type: 'burst', kind, x: p.group.position.x, y, z: p.group.position.z, count });
}

/** Turn to the piece and do something with your hands. */
function act(kind: PoseKind, p: PieceInstance, dur?: number) {
  playPose(kind, { face: { x: p.group.position.x, z: p.group.position.z }, dur });
}

/** Sit on a chair, or on the end of a bench nearest you. */
function sitOn(p: PieceInstance) {
  const g = p.group;
  const yaw = g.rotation.y;
  let x = g.position.x;
  let z = g.position.z;
  const len = Math.max(p.hotspot.rect[2], p.hotspot.rect[3]);
  if (len > 1) {
    const ax = Math.cos(yaw);
    const az = -Math.sin(yaw);
    const reach = len / 2 - 0.5;
    const off = Math.max(-reach, Math.min(reach, (runtime.player.pos.x - x) * ax + (runtime.player.pos.z - z) * az));
    x += ax * off;
    z += az * off;
  }
  playPose('sit', { seat: { x, z, yaw } });
}

/** The servant: a multiplayer cursor that is always somewhere in the file. */
export function ringBell() {
  sfx('bell');
  const line = BUTLER[butlerLine % BUTLER.length];
  butlerLine++;
  gameState().say(line, 'npc');
}

export function runFurnitureAction(id: string, piece: PieceInstance) {
  const g = gameState();
  const name = piece.def.name;
  const slug = piece.hotspot.work?.slug;
  switch (id) {
    case 'sit':
      sitOn(piece);
      g.say(`You sit on the ${name.toLowerCase()} for a moment. It holds.`);
      sayOverhead('*sits*', 2);
      break;
    case 'warm':
      act('warm', piece);
      g.say('You warm your hands by the fire. The gradient stops drift a little warmer.');
      burst('embers', piece, 0.9, 10);
      break;
    case 'search-books': {
      act('search', piece);
      const pick = BOOKS[Math.floor(Math.random() * BOOKS.length)];
      g.say(`You pull out a book: "${pick}". You put it back exactly where it was.`);
      g.addXp('curiosity', 4);
      break;
    }
    case 'brew':
      act('pour', piece);
      sfx('kettle');
      burst('steam', piece, 1.6, 16);
      window.setTimeout(() => {
        if (giveTea()) {
          gameState().say('The Kettle clicks off. You pour a cup of tea.');
          gameState().addXp('tea', 12);
        }
      }, 900);
      break;
    case 'larder':
      act('pick', piece);
      g.say(
        ['You find a Perlin loaf. It is mostly noise.', 'A wedge of Voronoi cheese. All cells, no holes.', 'A jar of gradient jam, labelled "#ef4444 → #3b82f6".'][
          Math.floor(Math.random() * 3)
        ]
      );
      break;
    case 'pump':
      act('pump', piece);
      g.say('You pump some water. It comes out in exactly 4 colours.');
      burst('sparkle', piece, 0.8, 8);
      break;
    case 'take-pixel':
      act('pick', piece);
      if (g.addItem({ id: 'pixel' })) g.say('You take a loose pixel. It is warm.');
      break;
    case 'pet-cat':
      // the cat (scene/PetCat.tsx) naps here; pet it if it's in, otherwise pat the cushion
      if (catInBasket()) petCat();
      else {
        act('pet', piece);
        g.say(`The basket is empty. The cushion is still warm; ${CAT.name} can't be far.`);
      }
      break;
    case 'ring-bell':
      act('pull', piece);
      ringBell();
      break;
    case 'inspect-work':
    case 'crystal':
      act(id === 'crystal' ? 'hover' : 'think', piece);
      if (slug) inspectWork(slug);
      else g.say('Nothing hangs here yet. A good spot for something new.');
      break;
    case 'workbench':
      act('saw', piece, 2.4);
      g.say('You work at the bench. Flatpacks, mostly.');
      break;
    case 'node-bench':
      act('type', piece);
      g.setTab('effects');
      g.say('You plug into the node bench. The world\'s own effect stack opens: drag the layers around.', 'fx');
      g.addXp('shaders', 10);
      break;
    case 'tool-store':
      act('search', piece, 1.2);
      examine(piece.def.examine, piece.def.examineXp);
      break;
    case 'tablets':
      act('read', piece);
      g.setTab('quests');
      g.say('You prepare a tablet. Pick a piece in your quest list and you\'ll be taken straight to it.');
      g.addXp('curiosity', 5);
      break;
    case 'spin-globe':
      act('swipe', piece);
      g.say('You spin the globe. It lands on the island. It always lands on the island.');
      break;
    case 'telescope':
      act('look-up', piece);
      emit({ type: 'focus-camera', x: piece.group.position.x, y: 6, z: piece.group.position.z - 4, distance: 6, pitch: -0.35 });
      window.setTimeout(() => emit({ type: 'release-camera' }), 3500);
      g.say('You look up. The stars are crosshairs. Of course they are.');
      break;
    case 'portal':
      act('portal', piece);
      sfx('portal');
      if (slug) travelToWork(slug);
      else g.say('The portal is not directed anywhere yet.');
      break;
    case 'exit-portal':
      act('portal', piece);
      sfx('portal');
      travel('island');
      break;
    case 'scry':
      act('hover', piece);
      g.say(`The pool shows: ${works.slice(0, 5).map((w) => w.title).join(', ')}… and more, all at once.`, 'fx');
      break;
    case 'pray-undo':
      act('pray', piece);
      g.say('You pray at the altar of undo. The last few seconds of physics go back where they came from.', 'fx');
      emit({ type: 'rewind' });
      break;
    case 'incense':
      act('light', piece);
      g.say('You light the incense. The room goes a bit soft around the edges.');
      burst('magic', piece, 1.3, 10);
      mushroomMode(8);
      break;
    case 'organ':
      act('play', piece);
      g.say('The monolith organ plays the only song it knows. 124 BPM. Forever.');
      for (let i = 0; i < 8; i++) window.setTimeout(() => sfx('kick'), i * 484);
      break;
    case 'admire':
      act('think', piece);
      g.say('You admire the cursor. It points at you, a little accusingly.');
      break;
    case 'adventure-log':
      act('read', piece);
      g.say(`${profile.name}: ${profile.lines.join(' · ')}.`, 'fx');
      for (const w of works.filter((x) => x.role).slice(0, 3)) g.say(`${w.title}: ${w.role}.`);
      break;
    case 'quest-list':
      act('read', piece);
      g.setTab('quests');
      break;
    case 'preset-altar': {
      act('pray', piece);
      const names = Object.keys(EFFECT_PRESETS);
      presetIndex = (presetIndex + 1) % names.length;
      g.applyPreset(names[presetIndex]);
      g.say(`You pray at the preset altar. The world switches to ${EFFECT_PRESETS[names[presetIndex]].label}.`, 'fx');
      burst('magic', piece, 1.6, 18);
      break;
    }
    default:
      act('shrug', piece);
      g.say('Nothing interesting happens.');
  }
}
