/**
 * The cats' right-click verbs (Pet, Talk-to, Pick-up), shared by the cats
 * themselves and the kitchen basket. Each live cat registers itself here
 * (scene/PetCat.tsx) so the basket can tell whether its owner is home.
 */
import type * as THREE from 'three';
import { CAT, type CatCoat } from '@/content/cat';
import { POSES } from '../avatar/poses';
import { emit } from '../state/events';
import { npcSay, playPose, runtime, sayOverhead } from '../state/runtime';
import { gameState } from '../state/store';
import type { TilePos } from '../world/pathfinding';
import type { CatBrain, CatPlayer } from './brain';

/** Squim keeps the original id. */
export const catId = (coat: CatCoat) => (coat.id === CAT.id ? 'pet:cat' : `pet:${coat.id}`);

const petLines = (name: string) => [
  `You pet ${name}. It purrs at 60fps.`,
  `You pet ${name}. It looks at your cape, then at you, and approves.`,
  `You scratch ${name} behind the ears. Somewhere, a frame rate goes up.`,
  `You pet ${name}. It leans into your hand like it's the only thing holding it up.`,
];
const PURRS = ['*purr*', 'Prrrrr…', '*purrs at 60fps*', 'Mrrrrrr.'];

/** You say, it says, the game adds. */
const talk = (name: string): [string, string, string][] => [
  ["Who's a good cat?", 'Mrrp.', 'It does not answer the question. It does not have to.'],
  ['Have you been fed?', 'Mrrrrow.', `According to ${name}: never. Not once. Not in its whole life.`],
  ['What are you working on?', '…', 'It blinks slowly at you. In cat, that is an approved code review.'],
  ['Get off the keyboard.', 'Mew.', 'It was never on the keyboard. It is now, somehow, on the keyboard.'],
  ['Nice cape, right?', 'Prrt.', `${name} looks at the Cat cape, then at you. It has 99 Cats too. It is a cat.`],
  ['Want to see a shader?', 'Meow?', 'Only if there is a red dot in it.'],
];

interface CatLink {
  coat: CatCoat;
  brain: CatBrain;
  /** Above its head, for speech. */
  anchor: () => THREE.Vector3 | null;
}
const links = new Map<string, CatLink>();
const petLine = new Map<string, number>();
const talkLine = new Map<string, number>();
const next = (m: Map<string, number>, id: string) => {
  const n = m.get(id) ?? 0;
  m.set(id, n + 1);
  return n;
};

export function linkCat(l: CatLink) {
  const id = catId(l.coat);
  links.set(id, l);
  return () => {
    if (links.get(id) === l) links.delete(id);
  };
}

export function catPlayer(): CatPlayer {
  const P = runtime.player;
  return { x: P.pos.x, z: P.pos.z, tile: [P.tile[0], P.tile[1]], moving: P.moving };
}

const home = (l: CatLink | undefined): l is CatLink => !!l && runtime.location === 'house' && l.brain.present;

/** Is the basket's owner home and curled up in it right now? */
export function catInBasket() {
  const l = links.get(catId(CAT));
  return home(l) && l.brain.inBasket;
}

/**
 * The pond fish is an unusually convincing snack. Goes to cat `id`, or the
 * nearest one in reach. Caller consumes it only if a cat took it.
 */
export function feedCat(id?: string) {
  const P = runtime.player.pos;
  const dist = (l: CatLink) => Math.hypot(P.x - l.brain.px, P.z - l.brain.pz);
  const l = [...links.entries()]
    .filter(([k, l]) => (!id || k === id) && home(l) && dist(l) <= 1.8)
    .map(([, l]) => l)
    .sort((a, b) => dist(a) - dist(b))[0];
  if (!l) return false;
  l.brain.pet(6, catPlayer());
  l.brain.events.push({ type: 'twitch' });
  emit({ type: 'burst', kind: 'hearts', x: l.brain.px, y: l.brain.y + 0.55, z: l.brain.pz, count: 10 });
  return true;
}

/** Where to stand to reach cat `id` (and asks it to wait for you). */
export function catApproach(id: string): TilePos | null {
  const l = links.get(id);
  if (!l) return null;
  const p = catPlayer();
  l.brain.hold(10, p);
  return l.brain.approachTile(p);
}

/** Close enough to touch? If it wandered off while you walked over, follow it (a couple of times). */
function reach(id: string, retry: () => void, tries: number) {
  const l = links.get(id);
  if (!l) return false;
  const P = runtime.player;
  if (Math.hypot(P.pos.x - l.brain.px, P.pos.z - l.brain.pz) <= 1.6) return true;
  const tile = tries > 0 ? catApproach(id) : null;
  if (tile) gameState().walkTo(tile, retry);
  else gameState().say(`${l.coat.name} has somewhere to be.`);
  return false;
}

export function petCat(id = catId(CAT), tries = 2) {
  const l = links.get(id);
  if (!l || !reach(id, () => petCat(id, tries - 1), tries)) return;
  const b = l.brain;
  const g = gameState();
  const lines = petLines(l.coat.name);
  playPose('pet', { face: { x: b.px, z: b.pz } });
  b.pet(POSES.pet.dur, catPlayer());
  g.say(lines[next(petLine, id) % lines.length]);
  g.addXp('cats', 40);
  npcSay(id, PURRS[Math.floor(Math.random() * PURRS.length)], l.anchor, 2.6, '#f9a8d4');
  emit({ type: 'burst', kind: 'hearts', x: b.px, y: b.y + 0.55, z: b.pz, count: 6 });
}

export function talkToCat(id = catId(CAT), tries = 2) {
  const l = links.get(id);
  if (!l || !reach(id, () => talkToCat(id, tries - 1), tries)) return;
  const lines = talk(l.coat.name);
  const [you, cat, aside] = lines[next(talkLine, id) % lines.length];
  const g = gameState();
  l.brain.listen(6, catPlayer());
  sayOverhead(you, 2.4);
  g.say(you, 'public', 'Toe Knee');
  window.setTimeout(() => {
    npcSay(id, cat, l.anchor, 3);
    gameState().say(cat, 'npc', l.coat.name);
  }, 1100);
  window.setTimeout(() => gameState().say(aside), 2000);
}

export function pickUpCat(id = catId(CAT), tries = 2) {
  const l = links.get(id);
  if (!l || !reach(id, () => pickUpCat(id, tries - 1), tries)) return;
  const b = l.brain;
  const name = l.coat.name;
  playPose('pick', { face: { x: b.px, z: b.pz }, dur: 1 });
  gameState().say(`You try to pick up ${name}. ${name} declines.`);
  b.decline(catPlayer());
  npcSay(id, 'Mrrrow!', l.anchor, 2);
}
