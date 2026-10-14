/**
 * What the club pulses to: the music's live levels when something is
 * playing, otherwise a 124 bpm clock so the place never sits still. Sampled
 * once per frame however many things ask.
 */
import { musicLevels } from '../audio/levels';

const BPS = 2.066;

export interface Beat {
  /** Onset envelope, spikes to ~1 on each kick. */
  kick: number;
  bass: number;
  mid: number;
  high: number;
  /** True when these come from the music rather than the clock. */
  live: boolean;
}

const out: Beat = { kick: 0, bass: 0, mid: 0, high: 0, live: false };
let sampledAt = -1;

export function beat(t: number): Beat {
  if (t === sampledAt) return out;
  sampledAt = t;
  const m = musicLevels();
  if (m.playing) {
    out.kick = m.kick;
    out.bass = m.bass;
    out.mid = m.mid;
    out.high = m.high;
    out.live = true;
    return out;
  }
  // no music: the clock, plus any kick sound effects (the monoliths' Listen)
  const kick = Math.max(Math.pow(1 - ((t * BPS) % 1), 4), m.kick);
  out.kick = kick;
  out.bass = 0.35 + kick * 0.45;
  out.mid = 0.3 + Math.sin(t * 1.7) * 0.1;
  out.high = 0.25 + Math.pow(1 - ((t * BPS * 2 + 0.5) % 1), 6) * 0.3;
  out.live = false;
  return out;
}
