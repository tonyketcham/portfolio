import { Kit } from '../house/kit';

/** Shared silhouette for the rod on the bank and the one in the player's hand. */
export function fishingRodGeometry() {
  const k = new Kit(404);
  k.cyl(0.012, 0.025, 1.45, '#d6a35c', [0, 0.62, 0], 6);
  k.cyl(0.026, 0.027, 0.22, '#65452f', [0, -0.06, 0], 6);
  for (const y of [0.1, 0.45, 0.8, 1.15]) k.cyl(0.018, 0.018, 0.025, '#f5e6b3', [0, y, 0], 6);
  k.torus(0.065, 0.018, '#657888', [0.055, 0.06, 0], 4, 8, Math.PI * 2, { rot: [0, Math.PI / 2, 0] });
  return k.build(false)!;
}
