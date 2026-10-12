'use client';

/**
 * Toe Knee: a mouse cursor that grew legs. Knees and toes included.
 * Click-to-move on the tile grid at old-school tick speed, with procedural
 * two-bone legs, squash & stretch, cut/paste teleports and an idle sit.
 */
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { works } from '@/content/works';
import { zones } from '@/content/zones';
import { tweaks } from '../debug/tweaks';
import { clamp, damp, dampAngle } from '../lib/random';
import { emit, sfx } from '../state/events';
import { registerInteractable, runtime, sayOverhead } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { findPath, type TilePos } from '../world/pathfinding';
import { getWorld, heightAt, tileCenter, worldToTile, zoneAt } from '../world/map';
import { revealScale } from './globals';
import { TileChannel, setShadow, tileState } from './Terrain';

// Classic pointer silhouette (x right, y down), 11.5 × 19 units.
const ARROW: [number, number][] = [
  [0, 0],
  [0, 16],
  [4, 12.5],
  [7, 19],
  [9.6, 18],
  [6.6, 11.6],
  [11.5, 11.5],
];
const K = 0.05;
const CX = 5.4;
const toLocal = (x: number, y: number) => new THREE.Vector2((x - CX) * K, (19 - y) * K);

function useCursorGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape(ARROW.map(([x, y]) => toLocal(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -0.07);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();
const tmpHip = new THREE.Vector3();
const tmpFoot = new THREE.Vector3();
const tmpKnee = new THREE.Vector3();
const tmpSitFoot = new THREE.Vector3();
function placeBone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  tmpDir.subVectors(b, a);
  const len = tmpDir.length();
  mesh.position.copy(a).addScaledVector(tmpDir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, tmpDir.normalize());
  mesh.scale.set(1, len, 1);
}

interface Leg {
  side: number;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  knee: THREE.Mesh;
  foot: THREE.Group;
}

const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

export function Player() {
  const world = getWorld();
  const root = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshLambertMaterial>(null);
  const outlineMat = useRef<THREE.MeshBasicMaterial>(null);
  const pupils = useRef<THREE.Group[]>([]);
  const lids = useRef<THREE.Mesh[]>([]);
  const legsRef = useRef<Leg[]>([]);
  const body = useRef<RapierRigidBody>(null);
  const cursorGeo = useCursorGeometry();

  const sim = useRef({
    path: [] as TilePos[],
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    stepT: 1,
    stepDur: 0.6,
    onArrive: undefined as undefined | (() => void),
    destSeq: 0,
    phase: 0,
    speed: 0,
    squash: 0,
    tilesWalked: 0,
    lastZone: null as string | null,
    seenZones: new Set<string>(),
    teleport: null as null | { t: number; to: TilePos; onArrive?: () => void; moved: boolean },
    dropT: 0,
    sit: 0,
    blink: 0,
    nextBlink: 2,
    emote: null as null | { name: 'spin' | 'wave' | 'hop'; t: number },
    ringCooldown: 0,
  });

  // spawn
  useEffect(() => {
    const [sx, sz] = tileCenter(world.spawn[0], world.spawn[1]);
    runtime.player.pos.set(sx, heightAt(world, sx, sz), sz);
    runtime.player.tile = [...world.spawn] as TilePos;
    runtime.player.yaw = Math.PI;
    sim.current.from.copy(runtime.player.pos);
    sim.current.to.copy(runtime.player.pos);
  }, [world]);

  // destination requests from the store
  useEffect(() => {
    const unsub = useGame.subscribe((state) => {
      const d = state.destination;
      if (!d || d.seq === sim.current.destSeq) return;
      sim.current.destSeq = d.seq;
      const s = sim.current;
      if (d.teleport) {
        s.path = [];
        s.teleport = { t: 0, to: d.tile, onArrive: d.onArrive, moved: false };
        sfx('cut');
        emit({ type: 'burst', kind: 'sparkle', x: runtime.player.pos.x, y: runtime.player.pos.y + 0.6, z: runtime.player.pos.z, count: 16 });
        gameState().say('Cut (⌘X)…', 'system');
        return;
      }
      // Start pathing from the tile we're stepping into, so we never snap back.
      const startTile = s.stepT < 1 ? worldToTile(s.to.x, s.to.z) : runtime.player.tile;
      const path = findPath(world, startTile, d.tile);
      tileState.clear(TileChannel.Destination);
      tileState.clear(TileChannel.Path);
      if (!path.length) {
        // Already there, or as close as we can get (e.g. next to a blocked target).
        s.path = [];
        if (s.stepT >= 1) {
          s.onArrive = undefined;
          d.onArrive?.();
        } else {
          s.onArrive = d.onArrive;
        }
        return;
      }
      s.path = path;
      s.onArrive = d.onArrive;
      const last = path[path.length - 1] ?? startTile;
      const p = gameState().plugins;
      if (p.destinationTile) {
        tileState.set(last[0], last[1], TileChannel.Destination, true);
        for (const [i, j] of path.slice(0, -1)) tileState.set(i, j, TileChannel.Path, true);
      }
    });
    return unsub;
  }, [world]);

  // self as an interactable
  useEffect(
    () =>
      registerInteractable({
        id: 'player',
        name: 'Toe Knee',
        tone: 'player',
        object: () => bodyGroup.current,
        examine: "That's you. A cursor that grew legs. Knees and toes included.",
        actions: [
          {
            verb: 'Wave',
            run: () => {
              sim.current.emote = { name: 'wave', t: 0 };
              sayOverhead('o/', 2);
            },
          },
          { verb: 'Spin', run: () => (sim.current.emote = { name: 'spin', t: 0 }) },
          { verb: 'Hop', run: () => (sim.current.emote = { name: 'hop', t: 0 }) },
        ],
        dimensions: () => '24 × 24 cursor',
      }),
    []
  );

  const finishStep = (s: typeof sim.current) => {
    runtime.player.tile = worldToTile(s.to.x, s.to.z);
    tileState.set(runtime.player.tile[0], runtime.player.tile[1], TileChannel.Path, false);
    s.tilesWalked++;
    sfx('step', 0.9 + Math.random() * 0.2);
    if (s.tilesWalked % 30 === 0) gameState().addXp('wandering', 30);

    const g = gameState();
    if (g.running) g.setCaffeine(g.caffeine - 0.9 * tweaks().Player.caffeineDrain);

    const zone = zoneAt(world, s.to.x, s.to.z);
    const zid = zone?.id ?? null;
    if (zid !== s.lastZone) {
      s.lastZone = zid;
      g.setZone(zid);
      if (zone && !s.seenZones.has(zone.id)) {
        s.seenZones.add(zone.id);
        g.say(`${zone.name}: ${zone.arrival}`, 'game');
        for (const w of works) if (w.zone === zone.id) g.markQuest(w.slug, 'seen');
      }
    }
    // Fairy ring: standing in the middle is a choice.
    const ringZone = zones.find((z) => z.id === 'ring');
    if (ringZone && performance.now() > s.ringCooldown) {
      const d = Math.hypot(s.to.x - ringZone.center[0], s.to.z - (ringZone.center[1] + 0.6));
      if (d < 1.1) {
        s.ringCooldown = performance.now() + 30000;
        g.say('You step into the fairy ring. The pixels lean in to look at you.', 'fx');
        g.addXp('mycology', 25);
        g.eatMushroom(20);
        sfx('pop');
      }
    }
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = sim.current;
    const t = tweaks();
    const g = gameState();
    const P = runtime.player;
    const tickSeconds = t.Player.tickMs / 1000;

    // ── teleport (cut → paste) ────────────────────────────────────────────
    let teleScale = 1;
    if (s.teleport) {
      s.teleport.t += dt;
      const tt = s.teleport.t;
      if (tt < 0.35) teleScale = 1 - tt / 0.35;
      else {
        if (!s.teleport.moved) {
          s.teleport.moved = true;
          const [x, z] = tileCenter(s.teleport.to[0], s.teleport.to[1]);
          P.pos.set(x, heightAt(world, x, z), z);
          s.from.copy(P.pos);
          s.to.copy(P.pos);
          s.stepT = 1;
          P.tile = [...s.teleport.to] as TilePos;
          s.lastZone = null;
          sfx('paste');
          g.say('Pasted (⌘V).', 'system');
          emit({ type: 'burst', kind: 'sparkle', x, y: P.pos.y + 0.6, z, count: 20 });
        }
        teleScale = Math.min(1, (tt - 0.35) / 0.3);
        if (tt > 0.65) {
          const cb = s.teleport.onArrive;
          s.teleport = null;
          finishStep(s);
          cb?.();
        }
      }
    }

    // ── tile stepping ────────────────────────────────────────────────────
    const tilesPerTick = g.running ? t.Player.runTiles : t.Player.walkTiles;
    s.stepDur = tickSeconds / Math.max(0.1, tilesPerTick);
    if (s.stepT >= 1 && s.path.length && !s.teleport) {
      const next = s.path.shift()!;
      const [x, z] = tileCenter(next[0], next[1]);
      s.from.copy(P.pos);
      s.to.set(x, heightAt(world, x, z), z);
      s.stepT = 0;
    }
    let moving = false;
    if (s.stepT < 1) {
      moving = true;
      s.stepT = Math.min(1, s.stepT + dt / s.stepDur);
      const k = t.Player.snapToTicks ? Math.round(s.stepT * 2) / 2 : s.stepT;
      P.pos.lerpVectors(s.from, s.to, k);
      P.pos.y = heightAt(world, P.pos.x, P.pos.z);
      const dx = s.to.x - s.from.x;
      const dz = s.to.z - s.from.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) P.yaw = dampAngle(P.yaw, Math.atan2(dx, dz), 14, dt);
      if (s.stepT >= 1) {
        finishStep(s);
        if (!s.path.length) {
          tileState.clear(TileChannel.Destination);
          tileState.clear(TileChannel.Path);
          const cb = s.onArrive;
          s.onArrive = undefined;
          cb?.();
        }
      }
    }
    P.moving = moving;
    if (!g.running) g.caffeine < 100 && Math.random() < dt * 2 && g.setCaffeine(g.caffeine + 0.5);

    // ── idle: look at the pointer, blink, eventually sit ────────────────────
    P.idle = moving ? 0 : P.idle + dt;
    s.sit = damp(s.sit, P.idle > 40 ? 1 : 0, 3, dt);
    if (P.idle > 40 && P.idle - dt <= 40) g.say('You sit down on the canvas for a moment.');
    if (!moving && runtime.lookActive > 0 && !s.emote) {
      const lx = runtime.lookTarget.x - P.pos.x;
      const lz = runtime.lookTarget.z - P.pos.z;
      if (lx * lx + lz * lz > 0.3) P.yaw = dampAngle(P.yaw, Math.atan2(lx, lz), 3, dt);
    }

    // ── intro drop ─────────────────────────────────────────────────────────
    const reveal = revealScale(P.pos.x, P.pos.z);
    if (reveal === 0) {
      s.dropT = 0;
      P.landed = false;
    }
    if (reveal > 0 && s.dropT < 1) s.dropT = Math.min(1, s.dropT + dt / 0.9);
    if (s.dropT >= 1 && !P.landed) {
      P.landed = true;
      s.squash = 0.5;
      sfx('boing', 0.8);
      emit({ type: 'burst', kind: 'dust', x: P.pos.x, y: P.pos.y + 0.05, z: P.pos.z, count: 14 });
    }
    const dropY = (1 - easeOutBounce(s.dropT)) * 7;

    // ── animation ─────────────────────────────────────────────────────────
    const speedTarget = moving ? (g.running ? 2 : 1) : 0;
    s.speed = damp(s.speed, speedTarget, 10, dt);
    s.phase += dt * (5.2 + s.speed * 3.2) * (s.speed > 0.05 ? 1 : 0);
    s.squash = damp(s.squash, 0, 7, dt);
    const scale = t.Player.scale * teleScale * (reveal > 0 ? 1 : 0);
    const legsK = t.Player.legs;

    let emoteYaw = 0;
    let emoteTilt = 0;
    let emoteHop = 0;
    if (s.emote) {
      s.emote.t += dt;
      const e = s.emote;
      if (e.name === 'spin') emoteYaw = Math.min(1, e.t / 0.8) * Math.PI * 4;
      if (e.name === 'wave') emoteTilt = Math.sin(e.t * 14) * 0.25 * (1 - Math.min(1, e.t / 1.2));
      if (e.name === 'hop') emoteHop = Math.max(0, Math.sin(Math.min(1, e.t / 0.5) * Math.PI)) * 0.6;
      if (e.t > (e.name === 'spin' ? 0.8 : e.name === 'wave' ? 1.2 : 0.5)) s.emote = null;
    }

    if (root.current) {
      root.current.position.set(P.pos.x, P.pos.y + dropY + emoteHop, P.pos.z);
      root.current.rotation.y = P.yaw + emoteYaw;
      root.current.scale.setScalar(scale);
    }

    const bob = Math.abs(Math.sin(s.phase)) * 0.045 * s.speed * t.Player.bounce;
    const hipY = 0.4 * legsK;
    const sitDrop = s.sit * hipY * 0.6;
    if (bodyGroup.current) {
      const breathe = Math.sin(state.clock.elapsedTime * 2.2) * 0.012 * (1 - s.speed);
      bodyGroup.current.position.y = hipY + bob - sitDrop;
      bodyGroup.current.rotation.x = s.speed * (g.running ? 0.22 : 0.1);
      bodyGroup.current.rotation.z = emoteTilt + Math.sin(s.phase) * 0.05 * s.speed;
      bodyGroup.current.scale.set(1 + s.squash * 0.35 - breathe, 1 - s.squash * 0.45 + breathe, 1 + s.squash * 0.35);
    }
    if (bodyMat.current) bodyMat.current.color.set(t.Player.body);
    if (outlineMat.current) outlineMat.current.color.set(t.Player.outline);

    // blink
    s.nextBlink -= dt;
    if (s.nextBlink < 0) {
      s.blink = 1;
      s.nextBlink = 2 + Math.random() * 4;
    }
    s.blink = Math.max(0, s.blink - dt * 8);
    for (const lid of lids.current) lid.scale.y = 0.05 + s.blink * 1.2;

    // pupils look toward the look target (or forward)
    const local = tmpLocal;
    if (runtime.lookActive > 0 && root.current) {
      local.copy(runtime.lookTarget).sub(root.current.position);
      local.applyAxisAngle(UP, -root.current.rotation.y);
    } else local.set(0, 0, 1);
    const px = clamp(local.x * 0.06, -0.012, 0.012);
    const py = clamp((local.y - 0.6) * 0.03, -0.01, 0.01);
    for (const p of pupils.current) p.position.set(px, py, 0);

    // legs: two-bone IK in each leg's sagittal plane
    const L1 = 0.2 * legsK;
    const L2 = 0.21 * legsK;
    const stride = 0.17 * Math.min(1.6, s.speed);
    const hip = tmpHip;
    const foot = tmpFoot;
    const knee = tmpKnee;
    for (const leg of legsRef.current) {
      const ph = s.phase + (leg.side > 0 ? Math.PI : 0);
      hip.set(leg.side * 0.085, hipY + bob - sitDrop, 0);
      const swing = Math.cos(ph);
      foot.set(leg.side * 0.1, Math.max(0, swing) * 0.1 * Math.min(1, s.speed), Math.sin(ph) * stride);
      if (s.sit > 0.01) foot.lerp(tmpSitFoot.set(leg.side * 0.12, 0, 0.24), s.sit);
      const dy = foot.y - hip.y;
      const dz = foot.z - hip.z;
      const d = Math.min(L1 + L2 - 0.001, Math.hypot(dy, dz));
      const alpha = Math.atan2(dz, -dy);
      const cosK = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
      const theta = Math.acos(clamp(cosK, -1, 1));
      const a = alpha + theta;
      knee.set(hip.x + (foot.x - hip.x) * 0.5, hip.y - Math.cos(a) * L1, hip.z + Math.sin(a) * L1);
      placeBone(leg.thigh, hip, knee);
      placeBone(leg.shin, knee, foot);
      leg.knee.position.copy(knee);
      leg.foot.position.copy(foot);
    }

    // physics proxy so we can shove things around
    body.current?.setNextKinematicTranslation({ x: P.pos.x, y: P.pos.y + 0.55 + dropY, z: P.pos.z });
    setShadow('player', P.pos.x, P.pos.z, 0.5 * scale, 0.42 * Math.min(1, scale) * (1 - Math.min(1, dropY / 6)));
  });

  const legMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#18181b' }), []);
  const kneeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#3b82f6' }), []);
  const toeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#fafafa' }), []);
  const boneGeo = useMemo(() => new THREE.CylinderGeometry(0.026, 0.022, 1, 6), []);
  const kneeGeo = useMemo(() => new THREE.SphereGeometry(0.042, 8, 6), []);
  const toeGeo = useMemo(() => new THREE.SphereGeometry(0.026, 6, 5), []);

  const eye = (x: number, y: number, k: number) => {
    const p = toLocal(x, y);
    return (
      <group position={[p.x, p.y, 0.1]} key={k}>
        <mesh>
          <circleGeometry args={[0.05, 12]} />
          <meshBasicMaterial color="#fafafa" />
        </mesh>
        <group ref={(g) => void (g && (pupils.current[k] = g))}>
          <mesh position-z={0.004}>
            <circleGeometry args={[0.026, 10]} />
            <meshBasicMaterial color="#09090b" />
          </mesh>
        </group>
        <mesh position={[0, 0.03, 0.008]} ref={(m) => void (m && (lids.current[k] = m))} scale={[1, 0.05, 1]}>
          <planeGeometry args={[0.11, 0.06]} />
          <meshBasicMaterial color="#09090b" />
        </mesh>
      </group>
    );
  };

  return (
    <>
      <group ref={root} name="player">
        <group ref={bodyGroup}>
          <mesh geometry={cursorGeo} castShadow={false}>
            <meshLambertMaterial ref={bodyMat} color="#09090b" flatShading />
          </mesh>
          <mesh geometry={cursorGeo} scale={[1.09, 1.07, 1.35]} position={[-0.012, -0.03, 0]}>
            <meshBasicMaterial ref={outlineMat} color="#fafafa" side={THREE.BackSide} />
          </mesh>
          {eye(2.6, 8.6, 0)}
          {eye(5.4, 9.6, 1)}
        </group>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              geometry={boneGeo}
              material={legMat}
              ref={(m) => {
                if (!m) return;
                const leg = legsRef.current.find((l) => l.side === side) ?? ({ side } as Leg);
                leg.thigh = m;
                if (!legsRef.current.includes(leg)) legsRef.current.push(leg);
              }}
            />
            <mesh
              geometry={boneGeo}
              material={legMat}
              ref={(m) => {
                if (!m) return;
                const leg = legsRef.current.find((l) => l.side === side);
                if (leg) leg.shin = m;
              }}
            />
            <mesh
              geometry={kneeGeo}
              material={kneeMat}
              ref={(m) => {
                if (!m) return;
                const leg = legsRef.current.find((l) => l.side === side);
                if (leg) leg.knee = m;
              }}
            />
            <group
              ref={(g) => {
                if (!g) return;
                const leg = legsRef.current.find((l) => l.side === side);
                if (leg) leg.foot = g;
              }}
            >
              <mesh position={[0, 0.02, 0.03]} scale={[0.07, 0.04, 0.1]} material={legMat}>
                <boxGeometry />
              </mesh>
              {[-0.025, 0, 0.025].map((tx) => (
                <mesh key={tx} geometry={toeGeo} material={toeMat} position={[tx, 0.02, 0.085]} />
              ))}
            </group>
          </group>
        ))}
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -10, 0]}>
        <CapsuleCollider args={[0.25, 0.3]} />
      </RigidBody>
    </>
  );
}
