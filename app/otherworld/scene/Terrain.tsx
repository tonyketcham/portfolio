'use client';

import { useFrame } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { buildTerrainGeometry, createTerrainMaterial } from '../shaders/terrain';
import { srgbCached } from './globals';

export function Terrain() {
  const { geometry, positions } = useMemo(buildTerrainGeometry, []);
  const indices = useMemo(() => Uint32Array.from({ length: positions.length / 3 }, (_, k) => k), [positions]);

  const material = useMemo(createTerrainMaterial, []);

  useFrame(() => {
    const t = tweaks();
    material.uniforms.uGrid.value = t.World.tileGrid;
    material.uniforms.uCoast.value = t.World.coastDissolve;
    (material.uniforms.uAccent.value as THREE.Vector3).copy(srgbCached(t.HUD.accent));
  });

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} name="terrain" />
      <RigidBody type="fixed" colliders={false} friction={0.9}>
        <TrimeshCollider args={[positions, indices]} />
      </RigidBody>
    </>
  );
}

export { TileChannel, clearShadow, setShadow, tileState } from '../shaders/terrain';
