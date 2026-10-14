import { FISHING_SECONDS, POND, fishingCatch, type FishingSpot } from '@/content/fishing';
import { emit, sfx } from './events';
import { ITEMS } from './items';
import { clearPose, playPose, runtime, type ActivePose } from './runtime';
import { gameState } from './store';

interface FishingSession {
  spot: FishingSpot;
  elapsed: number;
  pose: ActivePose | null;
  destination: ReturnType<typeof gameState>['destination'];
}

/** Session-only; inventory and earned XP use the existing persisted store. */
export const fishing = { session: null as FishingSession | null };

export function stopFishing() {
  if (fishing.session?.pose === runtime.player.pose) clearPose();
  fishing.session = null;
}

export function startFishing(spot: FishingSpot) {
  stopFishing();
  const g = gameState();
  if (g.location !== 'island' || g.stage !== 'world') return;
  if (!g.hasItem('fishing-rod')) {
    g.say('You need a fishing rod. Someone left one on the bank.');
    sfx('error');
    return;
  }
  if (!g.inventory.includes(null)) {
    g.say('Your inventory is full. Make room for something lost.');
    return;
  }
  if (Math.hypot(runtime.player.pos.x - spot.bank[0], runtime.player.pos.z - spot.bank[1]) > 0.8) {
    g.say("You can't reach that fishing spot from here.");
    return;
  }
  playPose('fish', { face: spot, dur: Infinity });
  fishing.session = { spot, elapsed: 0, pose: runtime.player.pose, destination: g.destination };
  g.say(`You cast for ${ITEMS[spot.catch].name.toLowerCase()}s…`);
  sfx('drop', 1.4);
}

/** Called once per scene frame. No timers survive movement, travel or unmount. */
export function tickFishing(dt: number, roll = Math.random) {
  const session = fishing.session;
  if (!session) return;
  const g = gameState();
  if (g.stage !== 'world' || g.location !== 'island' || g.loading || g.inspecting || g.dialogue ||
      g.destination !== session.destination || runtime.player.pose !== session.pose ||
      !g.hasItem('fishing-rod') ||
      Math.hypot(runtime.player.pos.x - session.spot.bank[0], runtime.player.pos.z - session.spot.bank[1]) > 0.8) {
    stopFishing();
    return;
  }
  session.elapsed += Math.min(dt, 0.1);
  if (session.elapsed < FISHING_SECONDS) return;
  session.elapsed = 0;
  const id = fishingCatch(session.spot, roll());
  if (!g.addItem({ id })) {
    stopFishing();
    return;
  }
  g.say(`You reel in ${id === 'undefined-fish' ? 'an actual fish: undefined' : `a ${ITEMS[id].name.toLowerCase()}`}.`);
  g.addXp('fishing', id === 'flash-site' ? 80 : id === 'undefined-fish' ? 40 : 20);
  emit({ type: 'burst', kind: 'sparkle', x: session.spot.x, y: POND.surfaceY, z: session.spot.z, count: 8 });
  if (!gameState().inventory.includes(null)) {
    gameState().say('Your inventory is full. You put away the rod.');
    stopFishing();
  }
}
