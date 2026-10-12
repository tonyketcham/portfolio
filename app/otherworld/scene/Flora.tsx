'use client';

import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import {
  createGrassAssets,
  createRockAssets,
  createTreeAssets,
  groupTrees,
  layoutGrass,
  layoutRocks,
  layoutTrees,
  swayUniform,
} from '../shaders/flora';
import { getWorld, heightAt } from '../world/map';

function Trees() {
  const world = getWorld();
  const trees = world.props.trees;
  const trunks = useRef<THREE.InstancedMesh>(null);
  const round = useRef<THREE.InstancedMesh>(null);
  const pine = useRef<THREE.InstancedMesh>(null);
  const shader = useRef<THREE.InstancedMesh>(null);
  const groups = useMemo(() => groupTrees(trees), [trees]);
  const { geos, mats } = useMemo(createTreeAssets, []);

  useLayoutEffect(() => {
    layoutTrees(world, { trunks: trunks.current, round: round.current, pine: pine.current, shader: shader.current });
  }, [world]);

  return (
    <>
      <instancedMesh ref={trunks} args={[geos.trunk, mats.trunk, trees.length]} frustumCulled={false} />
      <instancedMesh ref={round} args={[geos.blob, mats.leaf, Math.max(1, groups.round.length)]} count={groups.round.length} frustumCulled={false} />
      <instancedMesh ref={pine} args={[geos.pine, mats.leaf, Math.max(1, groups.pine.length)]} count={groups.pine.length} frustumCulled={false} />
      <instancedMesh ref={shader} args={[geos.shaderBlob, mats.shader, Math.max(1, groups.shader.length)]} count={groups.shader.length} frustumCulled={false} />
      <RigidBody type="fixed" colliders={false}>
        {trees.map((t, i) => (
          <CylinderCollider key={i} args={[0.6, 0.18 * t.scale]} position={[t.x, heightAt(world, t.x, t.z) + 0.6, t.z]} />
        ))}
      </RigidBody>
    </>
  );
}

function Grass() {
  const world = getWorld();
  const count = world.props.grass.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material } = useMemo(createGrassAssets, []);

  useLayoutEffect(() => {
    if (mesh.current) layoutGrass(world, mesh.current);
  }, [world]);

  useFrame(() => {
    const t = tweaks();
    swayUniform.value = t.World.wind * t.Flora.sway;
    if (mesh.current) mesh.current.count = Math.floor(count * t.Flora.grass);
  });

  return <instancedMesh ref={mesh} args={[geometry, material, Math.max(1, count)]} frustumCulled={false} />;
}

function Rocks() {
  const world = getWorld();
  const count = world.props.rocks.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material } = useMemo(createRockAssets, []);
  useLayoutEffect(() => {
    if (mesh.current) layoutRocks(world, mesh.current);
  }, [world]);
  return <instancedMesh ref={mesh} args={[geometry, material, Math.max(1, count)]} count={count} frustumCulled={false} />;
}

export function Flora() {
  return (
    <>
      <Trees />
      <Grass />
      <Rocks />
    </>
  );
}
