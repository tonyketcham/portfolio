import * as THREE from 'three';
import { CATCH_GAGS, CATCH_RECIPES } from '@/content/catch-gags';
import type { PoseKind } from '../avatar/poses';
import { feedCat } from '../pet/actions';
import { emit, sfx } from './events';
import { ITEMS, isCatch, type CatchId } from './items';
import { npcSay, playPose, runtime, type Interactable } from './runtime';
import { gameState, useGame } from './store';
import { placeAt } from '../world/places';
import { stopFishing } from './fishing';

const variants = new Map<string, number>();
function nextVariant(key: string) {
  const previous = variants.get(key);
  const next = previous == null ? Math.floor(Math.random() * 3) : (previous + 1 + Math.floor(Math.random() * 2)) % 3;
  variants.set(key, next);
  return next;
}

export function cancelCatchUse() {
  useGame.setState({ usingCatch: null });
}

export function beginCatchUse(slot: number) {
  const g = gameState();
  const stack = g.inventory[slot];
  if (!stack || !isCatch(stack.id) || g.stage !== 'world' || g.loading) return;
  stopFishing();
  g.closeMenu();
  useGame.setState({ usingCatch: { slot, stack } });
}

const box = new THREE.Box3();
const point = new THREE.Vector3();
function targetObject(it: Interactable) {
  const g = gameState();
  if (runtime.interactables.get(it.id) !== it || (it.layer && (g.hidden[it.layer] || g.locked[it.layer]))) return null;
  const object = it.object();
  if (!object) return null;
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return null;
  object.getWorldPosition(point);
  if (it.id !== 'player' && placeAt(point.x, point.z).id !== g.location) return null;
  return object;
}

function withinReach(it: Interactable) {
  const object = targetObject(it);
  if (!object) return false;
  if (it.catchTarget === 'cat') {
    object.getWorldPosition(point);
    return Math.hypot(runtime.player.pos.x - point.x, runtime.player.pos.z - point.z) <= 1.6;
  }
  box.setFromObject(object);
  if (box.isEmpty()) return false;
  const p = runtime.player.pos;
  return Math.hypot(p.x - THREE.MathUtils.clamp(p.x, box.min.x, box.max.x),
    p.z - THREE.MathUtils.clamp(p.z, box.min.z, box.max.z)) <= 2;
}

/** Consume only on a successful action; Examine, invalid targets and cancelled walks keep the catch. */
export function consumeCatch(slot: number, target?: Interactable) {
  const g = gameState();
  const stack = g.inventory[slot];
  if (!stack || !isCatch(stack.id) || g.stage !== 'world' || g.loading || g.inspecting || g.dialogue) return false;
  const id = stack.id;
  const recipe = CATCH_RECIPES[id];
  if (target && (target.catchTarget !== recipe.target || !withinReach(target))) return false;
  if (target?.catchTarget === 'cat' && !feedCat(target.id)) return false;
  stopFishing();
  g.removeSlot(slot);
  // Future stackable catches still spend one fish, never the entire stack.
  if ((stack.quantity ?? 1) > 1) {
    const inventory = gameState().inventory.slice();
    inventory[slot] = { ...stack, quantity: stack.quantity! - 1 };
    useGame.setState({ inventory });
  }
  const variant = nextVariant(`${id}:${target ? 'object' : 'self'}`);
  const gag = target ? recipe : CATCH_GAGS[id];
  g.say(gag.lines[variant], 'fx');
  const poses: Record<CatchId, PoseKind[]> = {
    'missing-texture': ['bow', 'cheer', 'shrug'], 'broken-link': ['think', 'shrug', 'look-up'],
    'old-jpeg': ['warm', 'yawn', 'shrug'], 'undefined-fish': ['wave', 'look-up', 'clap'],
    'flash-site': ['dance', 'dance', 'cheer'],
  };
  playPose(target?.catchTarget === 'cat' ? 'pet' : poses[id][variant], { dur: 4 });
  if (target?.catchTarget === 'tea') g.addItem({ id: 'tea', variant: 6 });
  const sounds = { 'missing-texture': 'pop', 'broken-link': 'portal', 'old-jpeg': 'thunk', 'undefined-fish': 'boing', 'flash-site': 'bell' } as const;
  sfx(sounds[id], 0.85 + variant * 0.22);
  emit({ type: 'catch-gag', item: id, variant, label: gag.labels[variant], target: target?.id ?? null, location: g.location });
  return true;
}

/** Route a Use-on click through the normal approach walk, rechecking its exact item on arrival. */
export function useCatchOn(target: Interactable) {
  const g = gameState();
  const selection = g.usingCatch;
  g.closeMenu();
  if (!selection || g.inventory[selection.slot] !== selection.stack || !isCatch(selection.stack.id)) return cancelCatchUse();
  if (target.id === 'player') { consumeCatch(selection.slot); return; }
  if (!targetObject(target)) { cancelCatchUse(); return; }
  if (target.catchTarget !== CATCH_RECIPES[selection.stack.id].target) {
    g.say(`The ${ITEMS[selection.stack.id].name.toLowerCase()} has no ideas about ${target.name}. ${ITEMS[selection.stack.id].examine}`);
    return;
  }
  const location = g.location;
  const apply = () => {
    const current = gameState();
    if (current.usingCatch !== selection || current.inventory[selection.slot] !== selection.stack || current.location !== location) return;
    if (!consumeCatch(selection.slot, target)) {
      current.say(`You can't reach ${target.name}. Your catch stays in your inventory.`);
      cancelCatchUse();
    }
  };
  if (withinReach(target)) return apply();
  const tile = target.approach?.();
  if (tile) g.walkTo(tile, apply);
  else {
    g.say(`Get a little closer to ${target.name} first.`);
    cancelCatchUse();
  }
}

/** Speech uses the existing object overlay without altering authored object copy. */
export function catchSpeech(target: string | null, label: string, anchor: () => THREE.Vector3 | null) {
  npcSay(`catch:${target ?? 'player'}`, label, anchor, 5.5, '#fef08a');
  return runtime.overheads.get(`catch:${target ?? 'player'}`);
}
