'use client';

/**
 * Amanitas. The fairy ring's big ones are bouncy physics props (throw a
 * rectangle at one); the loose ones can be picked, and eaten, unwisely.
 */
import { useFrame } from '@react-three/fiber';
import { BallCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { buildShroom, shroomMaterial } from '../shaders/props';
import { emit, sfx } from '../state/events';
import { registerInteractable } from '../state/runtime';
import { gameState } from '../state/store';
import { getWorld, heightAt, worldToTile } from '../world/map';
import { revealScale } from './globals';

function BigShroom({ id, x, z, scale, index }: { id: string; x: number; z: number; scale: number; index: number }) {
  const world = getWorld();
  const geometry = useMemo(() => buildShroom(index * 31 + 7), [index]);
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const wobble = useRef(0);
  const lastBoing = useRef(0);
  const y = heightAt(world, x, z);

  const poke = () => {
    wobble.current = 1;
    const now = performance.now();
    if (now - lastBoing.current > 150) {
      lastBoing.current = now;
      sfx('boing', 0.7 + Math.random() * 0.6);
    }
  };

  useEffect(
    () =>
      registerInteractable({
        id: `shroom:${id}`,
        name: 'Giant amanita',
        tone: 'object',
        layer: 'fixture:ring',
        object: () => mesh.current,
        examine: 'A giant amanita. Spongy, springy, structurally a trampoline.',
        approach: () => worldToTile(x, z + 1),
        actions: [
          {
            verb: 'Poke',
            approach: true,
            run: () => {
              poke();
              emit({ type: 'burst', kind: 'spores', x, y: y + 0.8 * scale, z, count: 18 });
              gameState().addXp('mycology', 4);
            },
          },
        ],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, x, z, scale, y]
  );

  useFrame((state, dt) => {
    wobble.current = Math.max(0, wobble.current - dt * 1.6);
    if (group.current) {
      const s = revealScale(x, z) * scale;
      const w = Math.sin(state.clock.elapsedTime * 22) * wobble.current * 0.18;
      group.current.scale.set(s * (1 + w), s * (1 - w), s * (1 + w));
      group.current.visible = s > 0.001;
    }
  });

  const bounce = tweaks().Physics.shroomBounce;
  return (
    <group position={[x, y, z]}>
      <group ref={group}>
        <mesh ref={mesh} geometry={geometry} material={shroomMaterial} userData={{ interactable: `shroom:${id}` }} />
      </group>
      <RigidBody type="fixed" colliders={false} onCollisionEnter={poke}>
        <BallCollider
          args={[0.4 * scale]}
          position={[0, 0.42 * scale, 0]}
          restitution={bounce}
          restitutionCombineRule={3 as never}
        />
        <CylinderCollider args={[0.25 * scale, 0.14 * scale]} position={[0, 0.25 * scale, 0]} />
      </RigidBody>
    </group>
  );
}

function LooseShroom({ id, x, z, scale, index }: { id: string; x: number; z: number; scale: number; index: number }) {
  const world = getWorld();
  const geometry = useMemo(() => buildShroom(index * 17 + 101), [index]);
  const mesh = useRef<THREE.Mesh>(null);
  const [pickedAt, setPickedAt] = useState(0);
  const y = heightAt(world, x, z);

  useEffect(() => {
    if (!pickedAt) return;
    const timer = window.setTimeout(() => setPickedAt(0), 90_000);
    return () => window.clearTimeout(timer);
  }, [pickedAt]);

  useEffect(() => {
    if (pickedAt) return;
    return registerInteractable({
      id: `shroom:${id}`,
      name: 'Amanita',
      tone: 'object',
      object: () => mesh.current,
      examine: 'Amanita muscaria. Gorgeous. Almost certainly a bad idea.',
      approach: () => worldToTile(x, z),
      actions: [
        {
          verb: 'Pick',
          approach: true,
          run: () => {
            const g = gameState();
            if (g.addItem({ id: 'amanita' })) {
              g.say('You pick the amanita. Probably shouldn’t eat it.');
              g.addXp('mycology', 12);
              emit({ type: 'burst', kind: 'spores', x, y: y + 0.3, z, count: 10 });
              setPickedAt(performance.now());
            }
          },
        },
      ],
    });
  }, [id, x, z, y, pickedAt]);

  useFrame(() => {
    if (!mesh.current) return;
    const s = revealScale(x, z) * scale;
    mesh.current.scale.setScalar(Math.max(0.0001, s));
    mesh.current.visible = !pickedAt && s > 0.001;
  });

  return (
    <mesh
      ref={mesh}
      position={[x, y, z]}
      geometry={geometry}
      material={shroomMaterial}
      userData={{ interactable: `shroom:${id}` }}
    />
  );
}

export function Shrooms() {
  const world = getWorld();
  return (
    <>
      {world.props.shrooms.map((s, i) =>
        s.big ? (
          <BigShroom key={s.id} id={s.id} x={s.x} z={s.z} scale={s.scale} index={i} />
        ) : (
          <LooseShroom key={s.id} id={s.id} x={s.x} z={s.z} scale={s.scale * 1.4} index={i} />
        )
      )}
    </>
  );
}
