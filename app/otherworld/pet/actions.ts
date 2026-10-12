/**
 * The cat's right-click verbs (Pet, Talk-to, Pick-up), shared by the cat
 * itself and the kitchen basket. The live cat registers itself here
 * (scene/PetCat.tsx) so the basket can tell whether anyone's home.
 */
import type * as THREE from 'three';
import { CAT } from '@/content/cat';
import { POSES } from '../avatar/poses';
import { emit } from '../state/events';
import { npcSay, playPose, runtime, sayOverhead } from '../state/runtime';
import { gameState } from '../state/store';
import type { TilePos } from '../world/pathfinding';
import type { CatBrain, CatPlayer } from './brain';

export const CAT_ID = 'pet:cat';

export const CAT_EXAMINE = 'Grey cap, white socks, and a smudge on the nose it refuses to discuss. Owns the house. Lets you stay.';

const PET_LINES = [
  `You pet ${CAT.name}. It purrs at 60fps.`,
  `You pet ${CAT.name}. It looks at your cape, then at you, and approves.`,
  `You scratch ${CAT.name} behind the ears. Somewhere, a frame rate goes up.`,
  `You pet ${CAT.name}. It leans into your hand like it's the only thing holding it up.`,
];
const PURRS = ['*purr*', 'Prrrrr…', '*purrs at 60fps*', 'Mrrrrrr.'];

/** You say, it says, the game adds. */
const TALK: [string, string, string][] = [
  ["Who's a good cat?", 'Mrrp.', 'It does not answer the question. It does not have to.'],
  ['Have you been fed?', 'Mrrrrow.', `According to ${CAT.name}: never. Not once. Not in its whole life.`],
  ['What are you working on?', '…', 'It blinks slowly at you. In cat, that is an approved code review.'],
  ['Get off the keyboard.', 'Mew.', 'It was never on the keyboard. It is now, somehow, on the keyboard.'],
  ['Nice cape, right?', 'Prrt.', `${CAT.name} looks at the Cat cape, then at you. It has 99 Cats too. It is a cat.`],
  ['Want to see a shader?', 'Meow?', 'Only if there is a red dot in it.'],
];

interface CatLink {
  brain: CatBrain;
  /** Above its head, for speech. */
  anchor: () => THREE.Vector3 | null;
}
let link: CatLink | null = null;
let petLine = 0;
let talkLine = 0;

export function linkCat(l: CatLink) {
  link = l;
  return () => {
    if (link === l) link = null;
  };
}

export function catPlayer(): CatPlayer {
  const P = runtime.player;
  return { x: P.pos.x, z: P.pos.z, tile: [P.tile[0], P.tile[1]], moving: P.moving };
}

/** Is the cat home and curled up in its basket right now? */
export function catInBasket() {
  return !!link && runtime.location === 'house' && link.brain.present && link.brain.inBasket;
}

/** Where to stand to reach it (and asks it to wait for you). */
export function catApproach(): TilePos | null {
  if (!link) return null;
  const p = catPlayer();
  link.brain.hold(10, p);
  return link.brain.approachTile(p);
}

/** Close enough to touch? If it wandered off while you walked over, follow it (a couple of times). */
function reach(retry: () => void, tries: number) {
  const l = link;
  if (!l) return false;
  const P = runtime.player;
  if (Math.hypot(P.pos.x - l.brain.px, P.pos.z - l.brain.pz) <= 1.6) return true;
  const tile = tries > 0 ? catApproach() : null;
  if (tile) gameState().walkTo(tile, retry);
  else gameState().say(`${CAT.name} has somewhere to be.`);
  return false;
}

export function petCat(tries = 2) {
  const l = link;
  if (!l || !reach(() => petCat(tries - 1), tries)) return;
  const b = l.brain;
  const g = gameState();
  playPose('pet', { face: { x: b.px, z: b.pz } });
  b.pet(POSES.pet.dur, catPlayer());
  g.say(PET_LINES[petLine++ % PET_LINES.length]);
  g.addXp('cats', 40);
  npcSay(CAT_ID, PURRS[Math.floor(Math.random() * PURRS.length)], l.anchor, 2.6, '#f9a8d4');
  emit({ type: 'burst', kind: 'hearts', x: b.px, y: b.y + 0.55, z: b.pz, count: 6 });
}

export function talkToCat(tries = 2) {
  const l = link;
  if (!l || !reach(() => talkToCat(tries - 1), tries)) return;
  const [you, cat, aside] = TALK[talkLine++ % TALK.length];
  const g = gameState();
  l.brain.listen(6, catPlayer());
  sayOverhead(you, 2.4);
  g.say(you, 'public', 'Toe Knee');
  window.setTimeout(() => {
    npcSay(CAT_ID, cat, l.anchor, 3);
    gameState().say(cat, 'npc', CAT.name);
  }, 1100);
  window.setTimeout(() => gameState().say(aside), 2000);
}

export function pickUpCat(tries = 2) {
  const l = link;
  if (!l || !reach(() => pickUpCat(tries - 1), tries)) return;
  const b = l.brain;
  playPose('pick', { face: { x: b.px, z: b.pz }, dur: 1 });
  gameState().say(`You try to pick up ${CAT.name}. ${CAT.name} declines.`);
  b.decline(catPlayer());
  npcSay(CAT_ID, 'Mrrrow!', l.anchor, 2);
}
