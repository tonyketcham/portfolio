/**
 * Where things go in the garden courtyard: the paths (a cross from the four
 * doors, looping round the centrepiece) and the flower beds along the walls.
 * CPU versions place grass and flowers; the TSL twins paint the floor, so the
 * two always agree.
 *
 * Coordinates are room-local tiles, 0..8 on each axis (the room is square
 * and the plan is symmetric, so rotation doesn't matter).
 */
import { abs, float, max, min, vec2 } from 'three/tsl';
import type { F, V2 } from '../shaders/common';

export const PATH_HALF = 0.78;
export const RING_HALF = 1.6;
export const RING_RADIUS = 0.55;
export const RING_WIDTH = 0.32;
export const BED_DEPTH = 0.36;
/** Beds stop this far either side of a door's centre line. */
export const DOOR_CLEAR = 1.1;

function sdRoundBox(u: number, v: number, b: number, r: number) {
  const qx = Math.abs(u) - (b - r);
  const qy = Math.abs(v) - (b - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Is a room-local point on the path? `pad` widens it (keep grass off the edges). */
export function onGardenPath(lx: number, lz: number, pad = 0) {
  const u = lx - 4;
  const v = lz - 4;
  if (Math.abs(u) < PATH_HALF + pad || Math.abs(v) < PATH_HALF + pad) return true;
  return Math.abs(sdRoundBox(u, v, RING_HALF, RING_RADIUS)) < RING_WIDTH + pad;
}

/** Is it in a flower bed (a strip along the walls, clear of the doors)? */
export function inGardenBed(lx: number, lz: number) {
  const dx = Math.min(lx, 8 - lx);
  const dz = Math.min(lz, 8 - lz);
  if (Math.min(dx, dz) > BED_DEPTH) return false;
  const along = dx < dz ? lz : lx;
  return Math.abs(along - 4) > DOOR_CLEAR;
}

// ── TSL twins ────────────────────────────────────────────────────────────────
const sdRoundBoxN = (p: V2, b: number, r: number) => {
  const q = abs(p).sub(b - r);
  return max(q, vec2(0)).length().add(min(max(q.x, q.y), 0)).sub(r);
};

/** 1 on the path, 0 off it, with a short soft edge. */
export const gardenPathMask = (lp: V2): F => {
  const p = lp.sub(4);
  const cross = min(abs(p.x), abs(p.y)).sub(PATH_HALF);
  const ring = abs(sdRoundBoxN(p, RING_HALF, RING_RADIUS)).sub(RING_WIDTH);
  return float(1).sub(min(cross, ring).smoothstep(-0.02, 0.02));
};

/** Signed distance to the path's centre line (for the build-mode vector overlay). */
export const gardenPathCentre = (lp: V2): F => {
  const p = lp.sub(4);
  const cross = min(abs(p.x), abs(p.y));
  const ring = abs(sdRoundBoxN(p, RING_HALF, RING_RADIUS));
  return min(cross, ring);
};

export const gardenBedMask = (lp: V2): F => {
  const dx = min(lp.x, float(8).sub(lp.x));
  const dz = min(lp.y, float(8).sub(lp.y));
  const along = dx.lessThan(dz).select(lp.y, lp.x);
  const inStrip = float(1).sub(min(dx, dz).smoothstep(BED_DEPTH - 0.02, BED_DEPTH + 0.02));
  // x.step(edge) is step(edge, x): 1 once we're clear of the door
  return inStrip.mul(abs(along.sub(4)).sub(DOOR_CLEAR).step(0));
};
