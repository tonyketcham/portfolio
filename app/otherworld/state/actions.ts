/**
 * Game verbs shared by the world, the HUD, chat commands and DialKit actions.
 */
import { workBySlug } from '@/content/works';
import { tweaks } from '../debug/tweaks';
import { zoneById, zones } from '@/content/zones';
import { getWorld, worldToTile } from '../world/map';
import type { TilePos } from '../world/pathfinding';
import { PLACES, type PlaceId } from '../world/places';
import { TRACKS } from '../audio/tracks';
import { emit, sfx } from './events';
import { ITEMS, TEAS, itemName, tabletZone, type ItemStack } from './items';
import { playPose, runtime, sayOverhead } from './runtime';
import { SKILLS, XP_TABLE, type XpReward } from './skills';
import { gameState } from './store';

export function giveTea(variant = Math.floor(Math.random() * TEAS.length)) {
  return gameState().addItem({ id: 'tea', variant });
}

/**
 * Go somewhere. Inside the same place it's a cut & paste; between the house
 * and the island it's a portal trip (dithered fade, loading box, arrival).
 */
export function travel(to: PlaceId, tile?: TilePos, onArrive?: () => void) {
  const g = gameState();
  if (g.location === to) {
    g.teleportTo(tile ?? PLACES[to].spawn, onArrive);
    return;
  }
  emit({ type: 'travel', to, tile, onArrive });
}

export function teleportToZone(id: string) {
  if (id === 'house') return travel('house');
  const zone = zoneById.get(id);
  if (!zone) return;
  const world = getWorld();
  if (id === 'spawn') return travel('island', world.spawn);
  // Land just inside the zone on the side facing spawn.
  const [cx, cz] = zone.center;
  const len = Math.hypot(cx, cz) || 1;
  travel('island', worldToTile(cx - (cx / len) * (zone.radius - 2), cz - (cz / len) * (zone.radius - 2)));
}

/** Build mode only makes sense at home. */
export function toggleBuildMode(force?: boolean) {
  const g = gameState();
  const next = force ?? !g.buildMode;
  if (next && g.location !== 'house') {
    g.say('You can only build in your own house. Head back through the house portal.', 'system');
    return;
  }
  g.setBuildMode(next);
  g.say(next ? 'Building mode on. Ghosts show the empty hotspots; right-click to build or remove.' : 'Building mode off.', 'system');
  sfx(next ? 'hammer' : 'click');
}

/** Read by DialBridge when it mounts, so ::target works before the panel has loaded. */
export const dialQueue = { panel: null as string | null };

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

export function examine(text: string, reward: XpReward = { skill: 'curiosity', amount: 3 }) {
  gameState().say(text);
  gameState().addXp(reward.skill, reward.amount);
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
    case 'teapot': {
      if (!s.hasItem('puer')) {
        s.say('The pot is empty. You admire the patina instead.');
        return;
      }
      if (!s.addItem({ id: 'tea', variant: 0 })) return;
      s.say('You pry a few grams off the Gouyoulin cake and brew it in the shuiping. Thick, honeyed, a long huigan.');
      s.addXp('tea', 12);
      sfx('kettle');
      emit({ type: 'burst', kind: 'steam', x: runtime.player.pos.x, y: runtime.player.pos.y + 1, z: runtime.player.pos.z, count: 12 });
      return;
    }
    case 'puer':
      s.say('You smell the cake. Dried apricot, wildflower honey, a whisper of forest.');
      s.addXp('tea', 2);
      return;
    case 'coins': {
      const n = stack.quantity ?? 1;
      s.say(`You count your coins. ${n} gp. Not quite party hat money.`);
      return;
    }
    case 'phone':
      s.say('No signal. One notification: "Your Figma trial has ended."');
      sayOverhead('*scrolls*', 2);
      return;
    case 'tinderbox':
      s.say("You strike the tinderbox. Sparks fly, but there's nothing here to burn.");
      emit({ type: 'burst', kind: 'embers', x: runtime.player.pos.x, y: runtime.player.pos.y + 0.6, z: runtime.player.pos.z, count: 10 });
      return;
    case 'tablet': {
      s.removeSlot(slot);
      s.say(`You break the ${itemName(stack).toLowerCase()} tablet.`);
      sfx('portal');
      teleportToZone(tabletZone(stack));
      return;
    }
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

const EMOTE_COMMANDS = ['wave', 'dance', 'cheer', 'think', 'clap', 'shrug', 'bow', 'yawn'] as const;

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
      if (target === 'house' || target === 'home') {
        travel('house');
        break;
      }
      const zone = zones.find((z) => z.id === target || z.name.toLowerCase().includes(target.toLowerCase()));
      if (zone) teleportToZone(zone.id);
      else s.say(`No zone called "${target}". Try: house, ${zones.map((z) => z.id).join(', ')}`, 'system');
      break;
    }
    case 'home':
    case 'house':
      travel('house');
      break;
    case 'island':
    case 'out':
    case 'outside':
      travel('island');
      break;
    case 'build':
      toggleBuildMode();
      break;
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
    case 'target': {
      const panel = args.join(' ') || 'Modyfi stack';
      if (!s.dialOpen) {
        dialQueue.panel = panel;
        s.setDialOpen(true);
      } else emit({ type: 'dial-target', panel });
      break;
    }
    case 'classic':
      window.location.href = '/classic';
      break;
    case 'music':
    case 'play': {
      const name = args.join(' ').toLowerCase();
      if (name) {
        const i = TRACKS.findIndex((t) => t.id.includes(name.replace(/\s+/g, '-')) || t.name.toLowerCase().includes(name));
        if (i < 0) s.say(`No track called "${name}". Try: ${TRACKS.map((t) => t.name).join(', ')}`, 'system');
        else s.playTrack(i);
      } else if (!s.plugins.sound || s.musicVolume === 0) s.playTrack(s.musicTrack);
      else {
        s.toggleMusicPaused();
        s.say(s.musicPaused ? `Now playing: ${TRACKS[s.musicTrack].name}` : 'Music paused.', 'system');
      }
      break;
    }
    case 'next':
    case 'skip':
      s.skipTrack(1);
      break;
    case 'prev':
      s.skipTrack(-1);
      break;
    case 'help':
      s.say(
        `Commands: ::home ::island ::build ::dial ::target <panel> ::tp <zone> ::tea ::shroom ::type <text> ::undo ::music [track] ::next ::intro ::max ::reset ::classic. Emotes: ${EMOTE_COMMANDS.map((e) => '::' + e).join(' ')}`,
        'system'
      );
      break;
    default:
      if (EMOTE_COMMANDS.includes(cmd?.toLowerCase() as (typeof EMOTE_COMMANDS)[number])) {
        playPose(cmd.toLowerCase() as (typeof EMOTE_COMMANDS)[number]);
        break;
      }
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
    case 'buildMode':
      toggleBuildMode();
      break;
    case 'resetFurniture':
      gameState().resetHouse();
      gameState().say('The house is back to how Tony left it.', 'system');
      break;
    default:
      console.info('[dialkit] unhandled action', panel, path);
  }
}


/** Cut & paste yourself to a work on the island (via the portal if you're home), then inspect it. */
export function travelToWork(slug: string) {
  const world = getWorld();
  const p = world.placements.find((pl) => pl.work.slug === slug);
  if (!p) return;
  const g = gameState();
  g.setTab(null);
  travel('island', p.approach, () => {
    const it = runtime.interactables.get(`work:${slug}`);
    const inspect = it?.actions.find((a) => a.verb === 'Inspect');
    if (inspect) inspect.run();
    else inspectWork(slug);
  });
}
