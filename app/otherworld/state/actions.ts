/**
 * Game verbs shared by the world, the HUD, chat commands and DialKit actions.
 */
import { workBySlug } from '@/content/works';
import { tweaks } from '../debug/tweaks';
import { zoneById, zones } from '@/content/zones';
import { getWorld, worldToTile } from '../world/map';
import { emit, sfx } from './events';
import { ITEMS, TEAS, itemName, type ItemStack } from './items';
import { runtime, sayOverhead } from './runtime';
import { SKILLS, XP_TABLE } from './skills';
import { gameState } from './store';

export function giveTea(variant = Math.floor(Math.random() * TEAS.length)) {
  return gameState().addItem({ id: 'tea', variant });
}

export function teleportToZone(id: string) {
  const zone = zoneById.get(id);
  if (!zone) return;
  const world = getWorld();
  if (id === 'spawn') return gameState().teleportTo(world.spawn);
  // Land just inside the zone on the side facing spawn.
  const [cx, cz] = zone.center;
  const len = Math.hypot(cx, cz) || 1;
  gameState().teleportTo(worldToTile(cx - (cx / len) * (zone.radius - 2), cz - (cz / len) * (zone.radius - 2)));
}

export function mushroomMode(seconds = 25) {
  gameState().eatMushroom(seconds);
  sfx('pop');
}

export function maxSkills() {
  const s = gameState();
  for (const skill of SKILLS) {
    const missing = XP_TABLE[99] - (s.skills[skill.id] ?? 0);
    if (missing > 0) s.addXp(skill.id, missing);
  }
  s.say('Every skill is now 99. This feels like cheating. It is.', 'fx');
}

export function resetSave() {
  gameState().resetProgress();
  gameState().say('Save wiped. Untitled-1 has forgotten you.', 'system');
}

export function replayIntro() {
  const s = gameState();
  s.inspect(null);
  s.setDialogue(null);
  s.setStage('artboard');
}

export function inspectWork(slug: string) {
  const work = workBySlug.get(slug);
  if (!work) return;
  const s = gameState();
  const first = s.quests[slug] !== 'done';
  s.inspect(slug);
  s.markQuest(slug, 'done');
  s.addXp(work.skill ?? 'tooling', first ? 45 : 5);
  if (first) s.say(`You inspect ${work.title}. A new node lights up in your quest list.`);
}

export function examine(text: string) {
  gameState().say(text);
  gameState().addXp('curiosity', 3);
}

export function applyItem(slot: number, verb: string) {
  const s = gameState();
  const stack = s.inventory[slot];
  if (!stack) return;
  const def = ITEMS[stack.id];
  if (verb === 'Examine') return examine(def.examine);
  if (verb === 'Drop') return dropItem(slot);

  switch (stack.id) {
    case 'tea': {
      s.removeSlot(slot);
      const tea = TEAS[(stack.variant ?? 0) % TEAS.length];
      s.setCaffeine(s.caffeine + 45);
      s.say(`You drink the ${tea.name}. ${tea.note}`);
      s.addXp('tea', 9);
      sayOverhead('Ahh.', 2);
      sfx('drink');
      emit({ type: 'burst', kind: 'steam', x: runtime.player.pos.x, y: runtime.player.pos.y + 1.2, z: runtime.player.pos.z, count: 10 });
      return;
    }
    case 'amanita': {
      s.removeSlot(slot);
      s.say('You eat the amanita. The pixels start breathing.', 'fx');
      s.addXp('mycology', 20);
      sayOverhead('...oh no.', 3);
      mushroomMode(25);
      return;
    }
    case 'card':
      s.setDialogue('card');
      return;
    case 'handle':
      s.removeSlot(slot);
      s.say('You release the bezier handle. It flutters off to find its curve.');
      emit({ type: 'burst', kind: 'sparkle', x: runtime.player.pos.x, y: runtime.player.pos.y + 1, z: runtime.player.pos.z, count: 14 });
      return;
    case 'pixel':
      s.removeSlot(slot);
      s.say('You place the loose pixel. It snaps to the grid. Deeply satisfying.');
      s.addXp('curiosity', 15);
      emit({ type: 'burst', kind: 'sparkle', x: runtime.player.pos.x, y: runtime.player.pos.y + 0.2, z: runtime.player.pos.z, count: 20 });
      return;
    case 'leaves':
      s.say('You smell the leaves. Somewhere between a library and a forest.');
      s.addXp('tea', 2);
      return;
  }
}

export function dropItem(slot: number) {
  const s = gameState();
  const stack = s.removeSlot(slot);
  if (!stack) return;
  emit({ type: 'drop-item', item: stack });
  sfx('drop');
}

export function pickUp(stack: ItemStack) {
  const ok = gameState().addItem(stack);
  if (ok) gameState().say(`You pick up the ${itemName(stack).toLowerCase()}.`);
  return ok;
}

/** `::command` handling from the chat box. Returns true if it was a command. */
export function runChatCommand(raw: string): boolean {
  if (!raw.startsWith('::')) return false;
  const [cmd, ...args] = raw.slice(2).trim().split(/\s+/);
  const s = gameState();
  switch (cmd?.toLowerCase()) {
    case 'dial':
    case 'debug':
      s.setDialOpen(!s.dialOpen);
      s.say(s.dialOpen ? 'DialKit closed.' : 'DialKit opened. Tweak responsibly.', 'system');
      break;
    case 'tp':
    case 'tele': {
      const target = args[0] ?? 'spawn';
      const zone = zones.find((z) => z.id === target || z.name.toLowerCase().includes(target.toLowerCase()));
      if (zone) teleportToZone(zone.id);
      else s.say(`No zone called "${target}". Try: ${zones.map((z) => z.id).join(', ')}`, 'system');
      break;
    }
    case 'tea':
      giveTea();
      break;
    case 'shroom':
    case 'mushroom':
      mushroomMode(Number(args[0]) || 25);
      break;
    case 'max':
      maxSkills();
      break;
    case 'intro':
      replayIntro();
      break;
    case 'reset':
      resetSave();
      break;
    case 'rewind':
    case 'undo':
      emit({ type: 'rewind' });
      break;
    case 'type':
      emit({ type: 'spawn-letters', text: args.join(' ') || 'hello' });
      break;
    case 'target':
      if (!s.dialOpen) s.setDialOpen(true);
      window.setTimeout(() => emit({ type: 'dial-target', panel: args.join(' ') || 'Modyfi stack' }), 60);
      break;
    case 'classic':
      window.location.href = '/classic';
      break;
    case 'help':
      s.say('Commands: ::dial ::target <panel> ::tp <zone> ::tea ::shroom ::type <text> ::undo ::intro ::max ::reset ::classic', 'system');
      break;
    default:
      s.say(`Unknown command ::${cmd}. Try ::help`, 'system');
  }
  return true;
}

export function runDebugAction(panel: string, path: string) {
  const key = path.split('.').pop();
  switch (key) {
    case 'spawnLetters':
      emit({ type: 'spawn-letters', text: 'TONY' });
      break;
    case 'rewind':
      emit({ type: 'rewind' });
      break;
    case 'replay':
      replayIntro();
      break;
    case 'go': {
      // The select's live value lives in the tweak store.
      teleportToZone(tweaks().Debug.teleport);
      break;
    }
    case 'giveTea':
      giveTea();
      break;
    case 'mushroomMode':
      mushroomMode(25);
      break;
    case 'maxSkills':
      maxSkills();
      break;
    case 'resetSave':
      resetSave();
      break;
    default:
      console.info('[dialkit] unhandled action', panel, path);
  }
}


/** Cut & paste yourself to a work, then inspect it. */
export function travelToWork(slug: string) {
  const world = getWorld();
  const p = world.placements.find((pl) => pl.work.slug === slug);
  if (!p) return;
  const g = gameState();
  g.setTab(null);
  g.teleportTo(p.approach, () => {
    const it = runtime.interactables.get(`work:${slug}`);
    const inspect = it?.actions.find((a) => a.verb === 'Inspect');
    if (inspect) inspect.run();
    else inspectWork(slug);
  });
}
