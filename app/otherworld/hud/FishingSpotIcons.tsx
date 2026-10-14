'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { FISHING_SPOTS, POND } from '@/content/fishing';
import { revealScale } from '../scene/globals';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { ITEMS } from '../state/items';
import { ItemIcon } from './icons';
import { project, useRaf } from './util';

/** RuneLite-style catch icons: fixed CSS pixels, pinned just above each tile. */
export function FishingSpotIcons() {
  const icons = useRef<(HTMLDivElement | null)[]>([]);
  const anchor = useRef(new THREE.Vector3());
  useRaf(() => {
    const g = gameState();
    const show = g.location === 'island' && g.stage === 'world' && !g.loading && !g.inspecting &&
      !g.hidden['zone:pond'] && revealScale(...POND.center) > 0.99;
    FISHING_SPOTS.forEach((spot, i) => {
      const el = icons.current[i];
      if (!el) return;
      anchor.current.set(spot.x, POND.surfaceY + 0.42, spot.z);
      const p = show ? project(anchor.current) : null;
      const nearby = Math.hypot(runtime.player.pos.x - spot.x, runtime.player.pos.z - spot.z) < 16;
      el.style.opacity = p && nearby ? '1' : '0';
      if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    });
  });
  return <>{FISHING_SPOTS.map((spot, i) => (
    <div key={spot.id} ref={(el) => void (icons.current[i] = el)} className="ow-fishing-icon" aria-hidden title={ITEMS[spot.catch].name}>
      <ItemIcon id={spot.catch} size={24} />
    </div>
  ))}</>;
}
