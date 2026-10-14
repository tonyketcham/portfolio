/**
 * Everything you can do to (and with) a creature: make one in the lab, spawn
 * it, talk to it, poke it, take it for a walk.
 */
import { DIALOGUE } from '../hud/dialogues';
import { emit, sfx } from '../state/events';
import { npcSay, runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { findPath } from '../world/pathfinding';
import { PLACES, type PlaceId } from '../world/places';
import { MAX_CREATURES, randomSpec, voicePitch, type CreatureSpec } from './spec';
import { greeting, pokeLine, secret, want, whoAmI } from './voice';

/** What the scene knows about a creature that's out in the world right now. */
export interface LiveCreature {
  following: boolean;
  place: PlaceId;
  x: number;
  z: number;
  anchor: () => import('three').Vector3 | null;
  poke: () => void;
}

export const live = new Map<string, LiveCreature>();
export const creatureId = (id: string) => `creature:${id}`;

const freshCopy = (spec: CreatureSpec): CreatureSpec => ({ ...spec, colors: [...spec.colors] });

/** Open the lab with a creature on the bench: a fresh random one, or one to edit. */
export function openLab(spec?: CreatureSpec) {
  const g = gameState();
  if (g.dialogue) g.setDialogue(null);
  g.setLabDraft(spec ? freshCopy(spec) : g.labDraft ?? randomSpec());
  g.setTab('lab');
  sfx('click');
}

export function closeLab() {
  const g = gameState();
  g.setLabDraft(null);
  if (g.tab === 'lab') g.setTab(null);
}

/** Nearest walkable tile to a world point in a place (spiral search). */
function walkableNear(place: PlaceId, x: number, z: number): [number, number] | null {
  const P = PLACES[place];
  const [ti, tj] = P.worldToTile(x, z);
  for (let r = 0; r <= 4; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (P.inBounds(ti + di, tj + dj) && P.walkable(ti + di, tj + dj)) return P.tileCenter(ti + di, tj + dj);
      }
    }
  }
  return null;
}

/** Where the lab's preview stands: beside you, toward the camera. */
export const preview = { x: 0, z: 0, yaw: 0, place: 'house' as PlaceId };

export function placePreview() {
  const yaw = runtime.cam.yaw;
  const p = runtime.player.pos;
  const P = PLACES[runtime.location];
  const from = runtime.player.tile;
  preview.yaw = yaw;
  preview.place = runtime.location;
  // Toward the camera and a little to screen-left (the panel lives on the right),
  // falling back round the player: the first open tile you could walk to in a few
  // steps, preferring one with nothing solid between it and the camera.
  const blocked = (x: number, z: number) => {
    const [i, j] = P.worldToTile(x, z);
    return P.inBounds(i, j) && !P.walkable(i, j);
  };
  let fallback: [number, number] | null = null;
  for (const r of [1.8, 2.4, 1.3]) {
    for (const a of [-0.5, 0, -1, 0.5, 1, -1.6, 1.6, Math.PI]) {
      const [i, j] = P.worldToTile(p.x + Math.sin(yaw + a) * r, p.z + Math.cos(yaw + a) * r);
      if ((i === from[0] && j === from[1]) || !P.inBounds(i, j) || !P.walkable(i, j)) continue;
      const path = findPath(P, from, [i, j], 200);
      const end = path[path.length - 1];
      if (!end || end[0] !== i || end[1] !== j || path.length > 4) continue;
      const [x, z] = P.tileCenter(i, j);
      if ([0.9, 1.8, 2.7].some((d) => blocked(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d))) {
        fallback ??= [x, z];
        continue;
      }
      [preview.x, preview.z] = [x, z];
      return;
    }
  }
  [preview.x, preview.z] = fallback ?? [p.x + Math.sin(yaw) * 1.6, p.z + Math.cos(yaw) * 1.6];
}

/** Bring the draft to life where the preview stands (or leave an edited one where it lives). */
export function spawnDraft() {
  const g = gameState();
  const draft = g.labDraft;
  if (!draft) return;
  const existing = g.creatures.find((c) => c.id === draft.id);
  if (!existing && g.creatures.length >= MAX_CREATURES) {
    g.say(`The world can only hold ${MAX_CREATURES} of these. Release one in the lab first.`);
    sfx('error');
    return;
  }
  let home = existing?.home;
  if (!home) {
    const spot = walkableNear(preview.place, preview.x, preview.z) ?? PLACES[runtime.location].tileCenter(...runtime.player.tile);
    home = { place: preview.place, x: spot[0], z: spot[1] };
  }
  const spec: CreatureSpec = { ...draft, name: draft.name.trim() || 'Untitled', home, born: existing?.born ?? Date.now() };
  g.upsertCreature(spec);
  g.setLabDraft(null);
  g.setTab(null);
  sfx('spawn');
  const y = PLACES[home.place].heightAt(home.x, home.z);
  emit({ type: 'burst', kind: 'confetti', x: home.x, y: y + 0.8, z: home.z, count: 40 });
  if (existing) g.say(`${spec.name} has been revised. It seems mostly fine about it.`, 'game');
  else {
    g.say(`You breathe life into ${spec.name}. It immediately has opinions.`, 'fx');
    g.addXp('generative', 45);
  }
}

export function releaseCreature(id: string) {
  const g = gameState();
  const spec = g.creatures.find((c) => c.id === id);
  if (!spec) return;
  const l = live.get(id);
  if (l) {
    const a = l.anchor();
    if (a) emit({ type: 'burst', kind: 'magic', x: a.x, y: a.y - 0.4, z: a.z, count: 30 });
  }
  g.removeCreature(id);
  sfx('portal');
  g.say(`${spec.name} wanders off into the void. It'll be fine. Probably.`);
}

export function pokeCreature(spec: CreatureSpec) {
  const l = live.get(spec.id);
  if (!l) return;
  l.poke();
  sfx('boing', voicePitch(spec));
  npcSay(creatureId(spec.id), pokeLine(spec), l.anchor, 2.6);
  const a = l.anchor();
  if (a) emit({ type: 'burst', kind: 'sparkle', x: a.x, y: a.y - 0.3, z: a.z, count: 10 });
}

export function setFollowing(spec: CreatureSpec, on: boolean) {
  const l = live.get(spec.id);
  if (!l) return;
  l.following = on;
  const g = gameState();
  if (on) g.say(`${spec.name} is following you.`);
  else {
    // it lives wherever you left it now
    g.upsertCreature({ ...spec, home: { place: l.place, x: l.x, z: l.z } });
    g.say(`${spec.name} settles in here.`);
  }
}

/** Build a conversation for this creature (fresh lines every time) and open it. */
export function talkToCreature(spec: CreatureSpec) {
  const id = creatureId(spec.id);
  const chirp = () => sfx('chirp', voicePitch(spec));
  const say = (key: string, text: string, next: string | null = `${id}:menu`) =>
    (DIALOGUE[`${id}:${key}`] = { speaker: 'creature', name: spec.name, creature: spec, text, next, enter: chirp });
  const menu = () => {
    const following = live.get(spec.id)?.following ?? false;
    DIALOGUE[`${id}:menu`] = {
      speaker: 'player',
      text: 'Select an option',
      options: [
        { label: 'Who are you?', next: `${id}:who` },
        { label: 'What do you want?', next: `${id}:want`, run: () => say('want', want(spec)) },
        { label: 'Know any secrets?', next: `${id}:secret`, run: () => say('secret', secret()) },
        following
          ? { label: 'Stay here.', next: `${id}:stay`, run: () => (setFollowing(spec, false), menu()) }
          : { label: 'Follow me!', next: `${id}:follow`, run: () => (setFollowing(spec, true), menu()) },
        { label: 'Can I change you?', next: null, run: () => openLab(spec) },
        { label: 'Bye.', next: `${id}:bye` },
      ],
    };
  };
  say('hello', greeting(spec));
  say('who', whoAmI(spec));
  say('follow', spec.mood === 'grumpy' ? 'Fine. Lead the way. Slowly.' : 'Right behind you!');
  say('stay', spec.mood === 'anxious' ? "Here? Alone? Okay. Okay. I'm okay." : 'I shall guard this spot with my life.');
  say('bye', spec.mood === 'dramatic' ? 'Farewell! Remember me!' : 'Bye!', null);
  menu();
  gameState().setDialogue(`${id}:hello`);
}
