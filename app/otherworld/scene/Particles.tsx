'use client';

/**
 * Pooled burst particles (dust, hearts, confetti, steam, spores, sparkles) and
 * the ambient fireflies + spores that drift around at night. Selection-handle
 * squares, because everything here is a little bit of a design tool.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { mulberry32 } from '../lib/random';
import { createAmbientMaterial, createBurstMaterial } from '../shaders/particles';
import { on } from '../state/events';
import { getWorld, heightAt, ISLAND_RADIUS } from '../world/map';
import { globalUniforms } from './globals';
import { postState } from './PostStack';

const POOL = 600;
const SHAPE = { square: 0, circle: 1, heart: 2, plus: 3 } as const;




interface Kind {
  shape: number;
  colors: string[];
  life: [number, number];
  size: [number, number];
  speed: number;
  up: number;
  gravity: number;
  drag: number;
  grow: number;
}

const KINDS: Record<string, Kind> = {
  dust: { shape: SHAPE.circle, colors: ['#a8a29e', '#d6d3d1'], life: [0.4, 0.8], size: [0.12, 0.22], speed: 1.6, up: 0.8, gravity: -2, drag: 3, grow: 0.6 },
  hearts: { shape: SHAPE.heart, colors: ['#f472b6', '#fb7185', '#f9a8d4'], life: [0.9, 1.4], size: [0.22, 0.3], speed: 0.6, up: 1.6, gravity: 0.6, drag: 1.5, grow: 0 },
  confetti: { shape: SHAPE.square, colors: ['#3b82f6', '#f472b6', '#facc15', '#22c55e', '#a855f7', '#fb923c'], life: [1.2, 2], size: [0.12, 0.2], speed: 4, up: 5, gravity: -7, drag: 1.2, grow: 0 },
  steam: { shape: SHAPE.circle, colors: ['#e4e4e7', '#fafafa'], life: [1.2, 2], size: [0.1, 0.16], speed: 0.15, up: 0.6, gravity: 0.25, drag: 0.5, grow: 1.4 },
  spores: { shape: SHAPE.plus, colors: ['#fde68a', '#f9a8d4', '#fca5a5'], life: [1.8, 3], size: [0.08, 0.14], speed: 0.4, up: 0.5, gravity: 0.15, drag: 0.4, grow: 0 },
  sparkle: { shape: SHAPE.square, colors: ['#3b82f6', '#60a5fa'], life: [0.5, 0.9], size: [0.12, 0.18], speed: 2.6, up: 1.2, gravity: -1, drag: 2.5, grow: -0.5 },
};

export function Particles() {
  const { camera } = useThree();
  const points = useRef<THREE.Points>(null);
  const sim = useMemo(
    () => ({
      vel: new Float32Array(POOL * 3),
      life: new Float32Array(POOL),
      max: new Float32Array(POOL),
      base: new Float32Array(POOL),
      grow: new Float32Array(POOL),
      gravity: new Float32Array(POOL),
      drag: new Float32Array(POOL),
      cursor: 0,
    }),
    []
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(POOL), 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(POOL), 1));
    g.setAttribute('aShape', new THREE.BufferAttribute(new Float32Array(POOL), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
    return g;
  }, []);

  const material = useMemo(createBurstMaterial, []);

  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'burst') return;
        const kind = KINDS[e.kind];
        if (!kind) return;
        const count = e.count ?? 12;
        const pos = geometry.attributes.position.array as Float32Array;
        const size = geometry.attributes.aSize.array as Float32Array;
        const shape = geometry.attributes.aShape.array as Float32Array;
        const col = geometry.attributes.aColor.array as Float32Array;
        const c = new THREE.Color();
        for (let n = 0; n < count; n++) {
          const i = sim.cursor;
          sim.cursor = (sim.cursor + 1) % POOL;
          pos[i * 3] = e.x + (Math.random() - 0.5) * 0.2;
          pos[i * 3 + 1] = e.y + (Math.random() - 0.5) * 0.2;
          pos[i * 3 + 2] = e.z + (Math.random() - 0.5) * 0.2;
          const a = Math.random() * Math.PI * 2;
          const sp = kind.speed * (0.4 + Math.random() * 0.8);
          sim.vel[i * 3] = Math.cos(a) * sp;
          sim.vel[i * 3 + 1] = kind.up * (0.6 + Math.random() * 0.8);
          sim.vel[i * 3 + 2] = Math.sin(a) * sp;
          sim.max[i] = sim.life[i] = kind.life[0] + Math.random() * (kind.life[1] - kind.life[0]);
          sim.base[i] = kind.size[0] + Math.random() * (kind.size[1] - kind.size[0]);
          sim.grow[i] = kind.grow;
          sim.gravity[i] = kind.gravity;
          sim.drag[i] = kind.drag;
          size[i] = sim.base[i];
          shape[i] = kind.shape;
          c.set(kind.colors[Math.floor(Math.random() * kind.colors.length)]);
          c.convertLinearToSRGB();
          col.set([c.r, c.g, c.b], i * 3);
        }
        geometry.attributes.aShape.needsUpdate = true;
        geometry.attributes.aColor.needsUpdate = true;
      }),
    [geometry, sim]
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const persp = camera as THREE.PerspectiveCamera;
    material.uniforms.uScale.value = postState.sceneHeight / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2));
    const pos = geometry.attributes.position.array as Float32Array;
    const size = geometry.attributes.aSize.array as Float32Array;
    const alpha = geometry.attributes.aAlpha.array as Float32Array;
    let any = false;
    for (let i = 0; i < POOL; i++) {
      if (sim.life[i] <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      sim.life[i] -= dt;
      const k = Math.exp(-sim.drag[i] * dt);
      sim.vel[i * 3] *= k;
      sim.vel[i * 3 + 2] *= k;
      sim.vel[i * 3 + 1] = sim.vel[i * 3 + 1] * k + sim.gravity[i] * dt;
      pos[i * 3] += sim.vel[i * 3] * dt;
      pos[i * 3 + 1] += sim.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt;
      const u = 1 - sim.life[i] / sim.max[i];
      size[i] = Math.max(0.01, sim.base[i] * (1 + sim.grow[i] * u));
      alpha[i] = Math.min(1, (1 - u) * 2.2) * (sim.life[i] > 0 ? 1 : 0);
    }
    if (any) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
    }
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

// ── ambient fireflies + drifting spores (GPU-only animation) ─────────────────



export function Ambient() {
  const { camera } = useThree();
  const geometry = useMemo(() => {
    const world = getWorld();
    const rand = mulberry32(99);
    const pos: number[] = [];
    const phase: number[] = [];
    const kind: number[] = [];
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (ISLAND_RADIUS - 4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.push(x, heightAt(world, x, z) + 0.6 + rand() * 1.6, z);
      phase.push(rand());
      kind.push(0);
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
      pos.push(x, heightAt(world, x, z), z);
      phase.push(rand());
      kind.push(1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    return g;
  }, []);
  const material = useMemo(createAmbientMaterial, []);
  useFrame(() => {
    const persp = camera as THREE.PerspectiveCamera;
    material.uniforms.uScale.value = postState.sceneHeight / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2));
    const t = tweaks();
    material.uniforms.uFireflies.value = t.Flora.fireflies * (globalUniforms.uReveal.value > 60 ? 1 : 0);
    material.uniforms.uSpores.value = t.Flora.spores * (globalUniforms.uReveal.value > 60 ? 1 : 0);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}
