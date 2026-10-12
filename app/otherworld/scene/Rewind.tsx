'use client';

/**
 * ⌘Z for physics. Every dynamic prop's transform is recorded at 30 Hz into a
 * ring buffer; "undo" plays the last few seconds backwards (with a VHS pass),
 * then hands the bodies back to the simulation, perfectly still.
 */
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect } from 'react';
import { tweaks } from '../debug/tweaks';
import { on, sfx } from '../state/events';
import { gameState } from '../state/store';
import { postState } from './PostStack';

const HZ = 30;
const MAX_SECONDS = 10;
const FRAMES = HZ * MAX_SECONDS;

interface Track {
  body: RapierRigidBody;
  data: Float32Array;
  /** Number of valid frames recorded (≤ FRAMES). */
  count: number;
  head: number;
}

const tracks = new Map<string, Track>();
const state = { acc: 0, rewinding: false, t: 0, duration: 1.1, frames: 0 };

export const DYNAMIC = 0;
export const KINEMATIC = 2;

export function trackBody(id: string, body: RapierRigidBody) {
  tracks.set(id, { body, data: new Float32Array(FRAMES * 7), count: 0, head: 0 });
  return () => {
    tracks.delete(id);
  };
}

export const isRewinding = () => state.rewinding;

function sample(track: Track, back: number) {
  // back = 0 → newest frame
  const idx = (track.head - 1 - back + FRAMES * 2) % FRAMES;
  return track.data.subarray(idx * 7, idx * 7 + 7);
}

export function RewindRecorder() {
  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'rewind' || state.rewinding) return;
        const seconds = tweaks().Physics.rewindSeconds;
        const longest = Math.max(0, ...[...tracks.values()].map((t) => t.count));
        state.frames = Math.min(longest, Math.round(seconds * HZ));
        if (state.frames < 3) {
          gameState().say('Nothing to undo. The canvas is at peace.', 'system');
          return;
        }
        state.rewinding = true;
        state.t = 0;
        for (const t of tracks.values()) {
          try {
            t.body.setBodyType(KINEMATIC as never, true);
          } catch {
            /* body may be gone */
          }
        }
        sfx('rewind');
        gameState().say(`Undo (⌘Z): rewound ${Math.round(state.frames / HZ)}s of physics.`, 'system');
      }),
    []
  );

  useFrame((_, dt) => {
    if (state.rewinding) {
      state.t += dt;
      const u = Math.min(1, state.t / state.duration);
      postState.rewind = Math.sin(u * Math.PI) * 0.9 + 0.1;
      const back = Math.floor(u * state.frames);
      for (const t of tracks.values()) {
        const b = Math.min(back, t.count - 1);
        if (b < 0) continue;
        const s = sample(t, b);
        try {
          t.body.setNextKinematicTranslation({ x: s[0], y: s[1], z: s[2] });
          t.body.setNextKinematicRotation({ x: s[3], y: s[4], z: s[5], w: s[6] });
        } catch {
          /* ignore */
        }
      }
      if (u >= 1) {
        state.rewinding = false;
        postState.rewind = 0;
        for (const t of tracks.values()) {
          const b = Math.min(state.frames, t.count - 1);
          t.head = (t.head - b + FRAMES) % FRAMES;
          t.count = Math.max(1, t.count - b);
          try {
            t.body.setBodyType(DYNAMIC as never, true);
            t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
    state.acc += dt;
    if (state.acc < 1 / HZ) return;
    state.acc = 0;
    for (const t of tracks.values()) {
      try {
        const p = t.body.translation();
        const r = t.body.rotation();
        t.data.set([p.x, p.y, p.z, r.x, r.y, r.z, r.w], t.head * 7);
        t.head = (t.head + 1) % FRAMES;
        t.count = Math.min(FRAMES, t.count + 1);
      } catch {
        /* body removed mid-frame */
      }
    }
  });

  return null;
}
