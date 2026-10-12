'use client';

/**
 * Frame 1 (final): the original homepage hero, repainted onto the plaza floor.
 * It's the flat artboard the intro starts on, and it stays as the spawn floor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { replayIntro } from '../state/actions';
import { registerInteractable } from '../state/runtime';
import { HERO_CENTER, HERO_H, HERO_SIZE, HERO_W, paintHero } from '../lib/hero';
import { worldToTile } from '../world/map';
import { Label } from './Label';

export function Hero() {
  const mesh = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = HERO_W;
    canvas.height = HERO_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    let alive = true;
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready
      .then(() => paintHero(canvas))
      .then(() => {
        if (!alive) return;
        tex.needsUpdate = true;
        setTexture(tex);
      });
    return () => {
      alive = false;
      tex.dispose();
    };
  }, []);

  useEffect(
    () =>
      registerInteractable({
        id: 'fixture:hero',
        name: 'Frame 1 (final)',
        tone: 'work',
        layer: 'fixture:hero',
        object: () => mesh.current,
        examine: 'Frame 1 (final). It used to be the whole website.',
        approach: () => worldToTile(HERO_CENTER.x, HERO_CENTER.z - 3.4),
        dimensions: () => '1440 × 900',
        passive: true,
        actions: [
          { verb: 'Flatten', run: () => replayIntro() },
          { verb: 'Open classic', run: () => window.open('/classic', '_self') },
        ],
      }),
    []
  );

  const material = useMemo(
    () => new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 }),
    []
  );
  useEffect(() => {
    material.map = texture;
    material.needsUpdate = true;
  }, [material, texture]);

  return (
    <group position={[HERO_CENTER.x, HERO_CENTER.y + 0.025, HERO_CENTER.z]}>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} material={material} userData={{ interactable: 'fixture:hero' }}>
        <planeGeometry args={[HERO_SIZE.w, HERO_SIZE.h]} />
      </mesh>
      <Label
        text="Frame 1 (final)"
        height={0.24}
        position={[-HERO_SIZE.w / 2, 0.005, -HERO_SIZE.h / 2 - 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        options={{ color: '#a1a1aa', size: 64 }}
      />
      <Label
        text="1440 × 900"
        height={0.2}
        anchor="right"
        position={[HERO_SIZE.w / 2, 0.005, -HERO_SIZE.h / 2 - 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        options={{ color: '#71717a', size: 56 }}
      />
    </group>
  );
}
