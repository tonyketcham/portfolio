/**
 * The hill under a zone with `elevation`: three grass ledges stepped up like an
 * old heightmap, stone cliffs between them, and a switchback ramp cut into the
 * front that the road follows to the top. Pure data, like the rest of world/.
 *
 * Angles: x = cos a, z = sin a, so north (towards spawn) is a = −π/2.
 */
import type { Zone } from '@/content/zones';
import { fbm, lerp, smoothstep } from '../lib/random';

const N = -Math.PI / 2;

export interface Mountain {
  zone: Zone;
  cx: number;
  cz: number;
  /** Ledge outer radii, outermost first, and their heights. */
  tiers: { r: number; h: number }[];
  /** The ramp, sampled every ~0.25 tiles: x, z, height. Starts at the foot, ends on the summit. */
  ramp: [number, number, number][];
  /** The level stretch of ramp along each ledge (angle from → to, radius), where things stand. */
  ledges: { a0: number; a1: number; r: number }[];
  /** Where the hill blends back into the island. */
  footprint: number;
  /** Polar → world. */
  at(a: number, r: number): [number, number];
}

/** Ledge k's outer radius at angle a: wobbled, so the cliffs aren't perfect circles. */
export function tierRadius(m: Mountain, a: number, k: number) {
  return m.tiers[k].r * (1 + (fbm(Math.cos(a) * 1.4 + k * 3.1, Math.sin(a) * 1.4, 4242 + k, 2) - 0.5) * 0.14);
}

function catmull(p0: number[], p1: number[], p2: number[], p3: number[], t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return p1.map(
    (_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
  );
}

export function buildMountain(zone: Zone): Mountain {
  const [cx, cz] = zone.center;
  const top = zone.elevation ?? 4;
  const step = top / 3;
  const tiers = [
    { r: 8.6, h: step },
    { r: 6.0, h: step * 2 },
    { r: 3.2, h: top },
  ];
  const at = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];

  // A spiral, always turning the same way so the ramp never runs alongside
  // itself: up the front onto the low ledge, west along it, up onto the middle
  // ledge round the back, then onto the summit from the east.
  const mid = (k: number) => (tiers[k].r + tiers[k + 1].r) / 2;
  const ledges = [
    { a0: N - 0.75, a1: N - 2.3, r: mid(0) },
    { a0: N - 2.95, a1: N - 4.2, r: mid(1) },
  ];
  const along = (l: (typeof ledges)[number], h: number) => {
    const n = Math.ceil(Math.abs(l.a1 - l.a0) / 0.3);
    return Array.from({ length: n + 1 }, (_, s) => [lerp(l.a0, l.a1, s / n), l.r, h]);
  };
  const wp: [number, number, number][] = [
    [N, 10.8, 0.2],
    [N - 0.3, 9.6, step * 0.45],
    ...along(ledges[0], step),
    [N - 2.6, 6.2, step * 1.5],
    ...along(ledges[1], step * 2),
    [N - 4.5, 3.9, step * 2.5],
    [N - 4.85, 2.1, top],
  ].map(([a, r, h]) => {
    const [x, z] = at(a, r);
    return [x, z, h];
  });

  const ramp: [number, number, number][] = [];
  for (let i = 0; i < wp.length - 1; i++) {
    const p0 = wp[Math.max(0, i - 1)];
    const p1 = wp[i];
    const p2 = wp[i + 1];
    const p3 = wp[Math.min(wp.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
    for (let s = 0; s < n; s++) {
      const [x, z] = catmull(p0, p1, p2, p3, s / n);
      // heights stay monotonic: interpolate them linearly, not through the spline
      ramp.push([x, z, lerp(p1[2], p2[2], s / n)]);
    }
  }
  ramp.push(wp[wp.length - 1]);

  return { zone, cx, cz, tiers, ramp, ledges, footprint: tiers[0].r + 3, at };
}

/** Height of the bare ledges (no ramp) at a point, or `pad` off the hill. */
export function ledgeHeight(m: Mountain, x: number, z: number, pad = 0.2) {
  const d = Math.hypot(x - m.cx, z - m.cz);
  const a = Math.atan2(z - m.cz, x - m.cx);
  let h = pad;
  m.tiers.forEach((t, k) => {
    if (d < tierRadius(m, a, k)) h = t.h;
  });
  return h;
}

/** Closest ramp sample: distance to it and its height. */
export function nearestRamp(m: Mountain, x: number, z: number) {
  let best = Infinity;
  let h = 0;
  for (const [px, pz, ph] of m.ramp) {
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) {
      best = d;
      h = ph;
    }
  }
  return { d: Math.sqrt(best), h };
}

export const RAMP_HALF_WIDTH = 1.35;

/**
 * Final hill height, blended over whatever the island had there (`base`), and
 * how much of the hill there is (1 on it, 0 past the footprint).
 */
export function mountainHeight(m: Mountain, x: number, z: number, base: number) {
  const d = Math.hypot(x - m.cx, z - m.cz);
  if (d > m.footprint) return { h: base, w: 0 };
  let h = ledgeHeight(m, x, z);
  const r = nearestRamp(m, x, z);
  h = lerp(r.h, h, smoothstep(RAMP_HALF_WIDTH, RAMP_HALF_WIDTH + 0.8, r.d));
  const w = smoothstep(m.footprint, m.tiers[0].r + 0.6, d);
  return { h: lerp(base, h, w), w };
}
