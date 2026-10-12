'use client';

import { useFrame } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import { tweaks } from '../debug/tweaks';
import { buildTerrainGeometry, createTerrainMaterial, terrainUniforms } from '../shaders/terrain';

export function Terrain() {
  const { geometry, positions } = useMemo(buildTerrainGeometry, []);
  const indices = useMemo(() => Uint32Array.from({ length: positions.length / 3 }, (_, k) => k), [positions]);
  const material = useMemo(createTerrainMaterial, []);

  useFrame(() => {
    const t = tweaks();
    terrainUniforms.grid.value = t.World.tileGrid;
    terrainUniforms.coast.value = t.World.coastDissolve;
  });

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} receiveShadow name="terrain" />
      <RigidBody type="fixed" colliders={false} friction={0.9}>
        <TrimeshCollider args={[positions, indices]} />
      </RigidBody>
    </>
  );
}

export { TileChannel, clearShadow, setShadow, tileState } from '../shaders/terrain';
