'use client';

/**
 * The web: node-graph wires lying on the ground between related works, fat
 * "bus" cables from spawn to every zone, and the Figma harness (which all lights
 * up while you stand in it). One merged mesh, one draw call; pulses
 * flow along every wire and the ones touching what you're looking at light up.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { MAX_EDGES, buildCableGeometry, createCableMaterial, hiData, hiTexture } from '../shaders/cables';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { getWorld } from '../world/map';

export function Cables() {
  const world = getWorld();
  const geometry = useMemo(() => buildCableGeometry(world), [world]);
  const material = useMemo(createCableMaterial, []);

  useFrame((_, dt) => {
    const g = gameState();
    const focus = new Set<string>();
    const hover = runtime.hoverId?.startsWith('work:') ? runtime.hoverId.slice(5) : null;
    if (hover) focus.add(hover);
    // timeline stones light their wires too
    if (runtime.hoverId?.startsWith('fixture:')) focus.add(runtime.hoverId);
    if (g.selected?.startsWith('fixture:')) focus.add(g.selected);
    if (g.inspecting) focus.add(g.inspecting);
    if (g.selected?.startsWith('work:')) focus.add(g.selected.slice(5));
    let dirty = false;
    const rate = Math.min(1, dt * 8);
    world.edges.slice(0, MAX_EDGES).forEach((edge, i) => {
      const on =
        focus.has(edge.a) || focus.has(edge.b) || (edge.kind === 'road' && g.zoneId && edge.b === `zone:${g.zoneId}`) || (edge.kind === 'harness' && g.zoneId === 'figma')
          ? 255
          : 0;
      const k = i * 4;
      const cur = hiData[k];
      const delta = on - cur;
      if (delta === 0) return;
      hiData[k] = cur + Math.sign(delta) * Math.min(Math.abs(delta), Math.max(1, Math.round(Math.abs(delta) * rate)));
      dirty = true;
    });
    if (dirty) hiTexture.needsUpdate = true;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} receiveShadow name="cables" />;
}
