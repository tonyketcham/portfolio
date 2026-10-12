'use client';

/**
 * Bezier-handle butterflies (catchable), and clouds that are just dashed
 * bounding boxes with layer names, drifting over the island.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTweaks } from '../debug/tweaks';
import { mulberry32 } from '../lib/random';
import { emit, sfx } from '../state/events';
import { registerInteractable, runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getWorld, heightAt, worldToTile } from '../world/map';
import { globalUniforms } from './globals';
import { Label } from './Label';

const knobGeo = new THREE.CircleGeometry(0.07, 10);
const anchorGeo = new THREE.PlaneGeometry(0.12, 0.12);
const knobMat = new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide });
const anchorMat = new THREE.MeshBasicMaterial({ color: '#fafafa', side: THREE.DoubleSide });
const lineMat = new THREE.MeshBasicMaterial({ color: '#93c5fd', side: THREE.DoubleSide });
const lineGeo = new THREE.PlaneGeometry(1, 0.025).translate(0.5, 0, 0);

const HOMES: [number, number][] = [
  [-6, 5],
  [7, -4],
  [-13, -4],
  [10, 9],
  [-9, 12],
  [3, -12],
  [14, -2],
  [-4, -14],
  [0, 8],
  [-17, 3],
];

function Butterfly({ index }: { index: number }) {
  const id = `butterfly:${index}`;
  const group = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group[]>([]);
  const [caughtAt, setCaughtAt] = useState(0);
  const world = getWorld();
  const rand = useMemo(() => mulberry32(index * 13 + 5), [index]);
  const params = useMemo(
    () => ({ home: HOMES[index % HOMES.length], r: 1.5 + rand() * 2.5, speed: 0.25 + rand() * 0.35, phase: rand() * 10, h: 1 + rand() * 1.2 }),
    [index, rand]
  );

  useEffect(() => {
    if (!caughtAt) return;
    const timer = window.setTimeout(() => setCaughtAt(0), 45_000);
    return () => window.clearTimeout(timer);
  }, [caughtAt]);

  useEffect(() => {
    if (caughtAt) return;
    return registerInteractable({
      id,
      name: 'Bezier handle',
      tone: 'npc',
      level: 1,
      layer: 'wildlife',
      object: () => group.current,
      examine: 'A bezier handle, loose in the wild. Beautifully smooth tangents.',
      approach: () => (group.current ? worldToTile(group.current.position.x, group.current.position.z) : null),
      actions: [
        {
          verb: 'Catch',
          approach: true,
          run: () => {
            const g = gameState();
            const p = group.current?.position;
            if (!p) return;
            const d = Math.hypot(p.x - runtime.player.pos.x, p.z - runtime.player.pos.z);
            if (d > 2.4) {
              g.say('The handle flutters just out of reach.');
              return;
            }
            if (g.addItem({ id: 'handle' })) {
              g.say('You catch a bezier handle. Its tangents are still smooth.');
              g.addXp('curiosity', 12);
              emit({ type: 'burst', kind: 'sparkle', x: p.x, y: p.y, z: p.z, count: 12 });
              sfx('pop', 1.6);
              setCaughtAt(performance.now());
            }
          },
        },
      ],
      dimensions: () => '2 handles',
    });
  }, [id, caughtAt]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime * params.speed + params.phase;
    const x = params.home[0] + Math.sin(t) * params.r + Math.sin(t * 2.3) * 0.4;
    const z = params.home[1] + Math.cos(t * 0.8) * params.r;
    const y = heightAt(world, x, z) + params.h + Math.sin(t * 3.1) * 0.25;
    const dx = x - g.position.x;
    const dz = z - g.position.z;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(dx, dz);
    g.visible = !caughtAt && globalUniforms.uReveal.value > 50;
    const flap = Math.sin(state.clock.elapsedTime * 16 + params.phase) * 0.9;
    wings.current.forEach((w, i) => {
      w.rotation.x = (i === 0 ? 1 : -1) * (0.4 + flap * 0.5);
    });
  });

  return (
    <group ref={group}>
      <mesh geometry={anchorGeo} material={anchorMat} rotation-z={Math.PI / 4} userData={{ interactable: id }} />
      {[0, 1].map((i) => (
        <group key={i} ref={(w: THREE.Group | null) => void (w && (wings.current[i] = w))} rotation-y={i === 0 ? 0 : Math.PI}>
          <mesh geometry={lineGeo} material={lineMat} scale={[0.42, 1, 1]} userData={{ interactable: id }} />
          <mesh geometry={knobGeo} material={knobMat} position-x={0.42} userData={{ interactable: id }} />
        </group>
      ))}
    </group>
  );
}

export function Butterflies() {
  const count = useTweaks((t) => t.Flora.butterflies);
  const stage = useGame((s) => s.stage);
  if (stage === 'boot' || stage === 'artboard') return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Butterfly key={i} index={i} />
      ))}
    </>
  );
}

// ── clouds: dashed bounding boxes ────────────────────────────────────────────
function Cloud({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const rand = useMemo(() => mulberry32(index * 71 + 11), [index]);
  const p = useMemo(
    () => ({
      w: 3 + rand() * 4,
      h: 0.6 + rand() * 0.8,
      d: 2 + rand() * 2.5,
      r: 10 + rand() * 18,
      a: rand() * Math.PI * 2,
      y: 9 + rand() * 5,
      s: 0.008 + rand() * 0.01,
    }),
    [rand]
  );
  const lines = useMemo(() => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w, p.h, p.d));
    const mat = new THREE.LineDashedMaterial({ color: '#fafafa', dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.7 });
    const seg = new THREE.LineSegments(geo, mat);
    seg.computeLineDistances();
    return seg;
  }, [p]);
  useFrame((state) => {
    if (!group.current) return;
    const a = p.a + state.clock.elapsedTime * p.s;
    group.current.position.set(Math.cos(a) * p.r, p.y + Math.sin(state.clock.elapsedTime * 0.2 + index) * 0.3, Math.sin(a) * p.r);
    group.current.visible = globalUniforms.uReveal.value > 70;
  });
  return (
    <group ref={group}>
      <primitive object={lines} />
      <Label text={`Cloud ${index + 1}`} height={0.3} position={[-p.w / 2, p.h / 2 + 0.25, p.d / 2]} options={{ color: '#fafafa', size: 64 }} opacity={0.8} />
    </group>
  );
}

export function Clouds() {
  const count = useTweaks((t) => t.World.clouds);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Cloud key={i} index={i} />
      ))}
    </>
  );
}

