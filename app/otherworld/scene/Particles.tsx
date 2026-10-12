'use client';

/**
 * Pooled burst particles (dust, sawdust, hearts, confetti, steam, spores,
 * sparkles, embers, magic) and the ambient fireflies + spores that drift
 * around the island at night. Instanced billboards: selection-handle squares,
 * because everything here is a little bit of a design tool.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { tweaks } from '../debug/tweaks';
import { mulberry32 } from '../lib/random';
import { ParticlePool, ambientUniforms, createAmbient } from '../shaders/particles';
import { on } from '../state/events';
import { runtime } from '../state/runtime';
import { getWorld, heightAt, ISLAND_RADIUS } from '../world/map';
import { globalUniforms } from './globals';

export function Particles() {
  const pool = useMemo(() => new ParticlePool(700), []);
  useEffect(
    () =>
      on((e) => {
        if (e.type === 'burst') pool.emit(e.kind, e.x, e.y, e.z, e.count ?? 12);
      }),
    [pool]
  );
  useFrame((_, dt) => pool.update(dt));
  return <primitive object={pool.sprite} />;
}

export function Ambient() {
  const sprite = useMemo(() => {
    const world = getWorld();
    const rand = mulberry32(99);
    const pts: { x: number; y: number; z: number; phase: number; kind: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (ISLAND_RADIUS - 4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pts.push({ x, y: heightAt(world, x, z) + 0.6 + rand() * 1.6, z, phase: rand(), kind: 0 });
    }
    const ring = world.fixtures.find((f) => f.kind === 'ring');
    const grove = world.placements.find((p) => p.work.slug === 'modyfi');
    for (let i = 0; i < 70; i++) {
      const c = i % 2 === 0 && ring ? ring : grove ?? ring;
      if (!c) break;
      const a = rand() * Math.PI * 2;
      const r = rand() * 4.5;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      pts.push({ x, y: heightAt(world, x, z), z, phase: rand(), kind: 1 });
    }
    return createAmbient(pts);
  }, []);
  useFrame(() => {
    const t = tweaks();
    const on = runtime.location === 'island' && globalUniforms.uReveal.value > 60 ? 1 : 0;
    ambientUniforms.fireflies.value = t.Flora.fireflies * on;
    ambientUniforms.spores.value = t.Flora.spores * on;
  });
  return <primitive object={sprite} />;
}
