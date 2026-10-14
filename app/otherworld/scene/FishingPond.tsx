'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { color, mix, positionWorld, sin } from 'three/tsl';
import { FISHING_SPOTS, POND, type FishingSpot } from '@/content/fishing';
import { fishingRodGeometry } from '../avatar/fishingRod';
import { Kit } from '../house/kit';
import { fishing, startFishing, stopFishing, tickFishing } from '../state/fishing';
import { ITEMS } from '../state/items';
import { registerInteractable, runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { HALF, SIZE, T, getWorld, heightAt, tileIndex, worldToTile } from '../world/map';
import { globalUniforms, revealScale } from './globals';
import { Label } from './Label';

function waterGeometry() {
  const positions: number[] = [];
  const world = getWorld();
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    if (world.tiles[tileIndex(i, j)] !== T.Water) continue;
    const x = i - HALF;
    const z = j - HALF;
    const y = POND.surfaceY;
    positions.push(x, y, z, x, y, z + 1, x + 1, y, z,
      x + 1, y, z, x, y, z + 1, x + 1, y, z + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function GroundRod({ onTake }: { onTake: () => void }) {
  const root = useRef<THREE.Group>(null);
  const geometry = useMemo(fishingRodGeometry, []);
  const [x, z] = POND.rod;
  const y = heightAt(getWorld(), x, z);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => registerInteractable({
    id: 'pond:rod', name: 'Fishing rod', tone: 'item', layer: 'zone:pond',
    object: () => root.current,
    approach: () => worldToTile(x, z),
    examine: ITEMS['fishing-rod'].examine,
    actions: [{ verb: 'Take', approach: true, run: () => {
      const g = gameState();
      if (g.hasItem('fishing-rod')) return;
      if (Math.hypot(runtime.player.pos.x - x, runtime.player.pos.z - z) > 1) {
        g.say("You can't reach the rod from here.");
        return;
      }
      if (!g.addItem({ id: 'fishing-rod' })) return;
      onTake();
      g.say('You pick up the fishing rod. The bubbles look promising.');
    } }],
  }), [onTake, x, z]);
  return (
    <group ref={root} position={[x, y + 0.14, z]} userData={{ interactable: 'pond:rod' }}>
      <mesh geometry={geometry} rotation={[Math.PI / 2, 0, -0.65]} scale={1.25} castShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      {/* A forgiving target for a slender rod lying flat on the ground. */}
      <mesh position={[0.35, 0.08, 0.45]}>
        <boxGeometry args={[1.2, 0.24, 1.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function BubblingSpot({ spot, index }: { spot: FishingSpot; index: number }) {
  const root = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const bubbles = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(() => registerInteractable({
    id: `pond:${spot.id}`, name: `Fishing spot (${ITEMS[spot.catch].name})`, tone: 'npc', layer: 'zone:pond',
    object: () => root.current,
    approach: () => worldToTile(...spot.bank),
    examine: `Bubbles full of ${ITEMS[spot.catch].name.toLowerCase()}s. An actual fish or a Flash website might still be down there.`,
    actions: [
      { verb: 'Fish', approach: true, run: () => startFishing(spot) },
      { verb: 'Stop fishing', run: stopFishing },
    ],
  }), [spot]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + index * 0.7;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const u = (t * 0.6 + i / 3) % 1;
      ring.scale.setScalar(0.16 + u * 0.82);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.65;
    });
    bubbles.current.forEach((bubble, i) => {
      if (!bubble) return;
      const u = (t * 0.8 + i / 4) % 1;
      bubble.position.y = 0.04 + u * 0.25;
      bubble.scale.setScalar(Math.sin(u * Math.PI));
    });
  });
  return (
    <group ref={root} position={[spot.x, POND.surfaceY + 0.012, spot.z]} userData={{ interactable: `pond:${spot.id}` }}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.94, 0.94]} />
        <meshBasicMaterial color={spot.color} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={`r${i}`} ref={(m) => void (rings.current[i] = m)} rotation-x={-Math.PI / 2} position-y={0.005 + i * 0.002}>
          <ringGeometry args={[0.43, 0.455, 20]} />
          <meshBasicMaterial color="#c9f4ef" transparent depthWrite={false} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`b${i}`} ref={(m) => void (bubbles.current[i] = m)} position={[Math.sin(i * 2.4) * 0.22, 0.05, Math.cos(i * 2.4) * 0.22]}>
          <sphereGeometry args={[0.045, 6, 4]} />
          <meshBasicMaterial color="#d4faf5" />
        </mesh>
      ))}
      <mesh position-y={0.12}>
        <boxGeometry args={[1, 0.35, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FishingLine() {
  const root = useRef<THREE.Group>(null);
  const bobber = useRef<THREE.Group>(null);
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e3e1ce', transparent: true, opacity: 0.75 }));
  }, []);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); stopFishing(); }, [line]);
  useFrame(({ clock }, dt) => {
    if (!document.hidden) tickFishing(dt);
    const session = fishing.session;
    if (!root.current) return;
    root.current.visible = !!session;
    if (!session) return;
    const { spot } = session;
    const p = runtime.player.pos;
    const yaw = runtime.player.yaw;
    const bob = Math.sin(clock.elapsedTime * 4) * 0.025;
    const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, p.x + Math.sin(yaw) * 1.3 - Math.cos(yaw) * 0.1, p.y + 1.85, p.z + Math.cos(yaw) * 1.3 + Math.sin(yaw) * 0.1);
    positions.setXYZ(1, (positions.getX(0) + spot.x) / 2, POND.surfaceY + 0.65, (positions.getZ(0) + spot.z) / 2);
    positions.setXYZ(2, spot.x, POND.surfaceY + 0.09 + bob, spot.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    bobber.current?.position.set(spot.x, POND.surfaceY + 0.06 + bob, spot.z);
  });
  return (
    <group ref={root} visible={false}>
      <primitive object={line} />
      <group ref={bobber}>
        <mesh position-y={0.06}><sphereGeometry args={[0.075, 8, 6]} /><meshBasicMaterial color="#ef6657" /></mesh>
        <mesh position-y={0.015}><cylinderGeometry args={[0.06, 0.035, 0.075, 8]} /><meshBasicMaterial color="#f8f5df" /></mesh>
      </group>
    </group>
  );
}

export function FishingPond() {
  const root = useRef<THREE.Group>(null);
  const hidden = useGame((s) => !!s.hidden['zone:pond']);
  const carriesRod = useGame((s) => s.inventory.some((item) => item?.id === 'fishing-rod'));
  const [rodTaken, setRodTaken] = useState(() => carriesRod);
  const takeRod = useMemo(() => () => setRodTaken(true), []);
  const water = useMemo(waterGeometry, []);
  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    const waves = sin(positionWorld.x.mul(2.2).add(positionWorld.z.mul(1.6)).add(globalUniforms.uTime.mul(0.7))).mul(0.5).add(0.5);
    m.colorNode = mix(color('#235c68'), color('#3c8790'), waves.mul(0.45));
    return m;
  }, []);
  const bank = useMemo(() => {
    const k = new Kit(404);
    // Reeds and rounded stones frame the far bank, leaving the east bank open.
    for (let i = 0; i < 11; i++) {
      const a = 1.65 + i / 10 * 3;
      const x = POND.center[0] + Math.cos(a) * 4.15;
      const z = POND.center[1] + Math.sin(a) * 3.5;
      const y = heightAt(getWorld(), x, z);
      k.sphere(0.18 + k.r() * 0.14, '#758175', [x, y + 0.12, z], 6, 4);
      for (let r = 0; r < 3; r++) {
        const h = 0.5 + k.r() * 0.45;
        const rx = x + (k.r() - 0.5) * 0.5;
        const rz = z + (k.r() - 0.5) * 0.5;
        k.cyl(0.012, 0.02, h, '#65824c', [rx, y + h / 2, rz], 4);
        k.cyl(0.032, 0.032, 0.15, '#876541', [rx, y + h - 0.04, rz], 5);
      }
    }
    const [sx, sz] = [-19.5, 0.5];
    const sy = heightAt(getWorld(), sx, sz);
    k.box(0.07, 0.9, 0.07, '#755539', [sx, sy + 0.45, sz]);
    k.box(1, 0.48, 0.09, '#584933', [sx, sy + 0.95, sz]);
    return k.build(false)!;
  }, []);
  useEffect(() => () => { water.dispose(); material.dispose(); bank.dispose(); }, [water, material, bank]);
  useFrame(() => {
    if (root.current) root.current.visible = !hidden && revealScale(...POND.center) > 0.99;
    if (hidden) stopFishing();
  });
  return (
    <group ref={root} name="404-pond">
      <mesh geometry={water} material={material} />
      <mesh geometry={bank} castShadow><meshLambertMaterial vertexColors /></mesh>
      <Label text="404 POND" anchor="center" height={0.19} position={[-19.5, heightAt(getWorld(), -19.5, 0.5) + 0.98, 0.556]} options={{ color: '#f5e6b3', size: 64 }} />
      {!rodTaken && !carriesRod && <GroundRod onTake={takeRod} />}
      {FISHING_SPOTS.map((spot, index) => <BubblingSpot key={spot.id} spot={spot} index={index} />)}
      <FishingLine />
    </group>
  );
}
