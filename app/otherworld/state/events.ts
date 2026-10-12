/**
 * Fire-and-forget events for things that shouldn't re-render React:
 * sound effects, particle bursts, camera shake, physics spawns.
 */
export type GameEvent =
  | { type: 'sfx'; name: SfxName; pitch?: number }
  | { type: 'burst'; kind: 'dust' | 'hearts' | 'confetti' | 'steam' | 'spores' | 'sparkle'; x: number; y: number; z: number; count?: number }
  | { type: 'shake'; amount: number }
  | { type: 'spawn-letters'; text: string }
  | { type: 'drop-item'; item: import('./items').ItemStack }
  | { type: 'rewind' }
  | { type: 'teleport'; x: number; z: number }
  | { type: 'focus-camera'; x: number; y: number; z: number; distance?: number; yaw?: number; pitch?: number }
  | { type: 'release-camera' }
  | { type: 'regrow' }
  | { type: 'cross'; x: number; y: number; color: 'yellow' | 'red' };

export type SfxName =
  | 'click'
  | 'menu'
  | 'step'
  | 'xp'
  | 'levelup'
  | 'pickup'
  | 'drop'
  | 'drink'
  | 'boing'
  | 'cut'
  | 'paste'
  | 'rewind'
  | 'error'
  | 'unfold'
  | 'kick'
  | 'pop';

type Listener = (event: GameEvent) => void;
const listeners = new Set<Listener>();

export function emit(event: GameEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('[otherworld] event listener failed', error);
    }
  }
}

export function on(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const sfx = (name: SfxName, pitch?: number) => emit({ type: 'sfx', name, pitch });
