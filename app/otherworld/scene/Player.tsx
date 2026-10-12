'use client';

/**
 * Toe Knee (Tony), the player: an old-school player model in a cursor skillcape (see ../avatar/rig). This
 * component moves it on the tile grid at old-school tick speed, plays poses
 * when it uses furniture (sitting on chairs, hammering, praying…), handles
 * cut/paste teleports and the intro drop, and keeps a kinematic body so it
 * can shove physics props around.
 */
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { works } from '@/content/works';
import { zones } from '@/content/zones';
import { hammerStrike, type PoseKind } from '../avatar/poses';
import { Avatar } from '../avatar/rig';
import { tweaks } from '../debug/tweaks';
import { damp, dampAngle } from '../lib/random';
import { emit, sfx } from '../state/events';
import { houseUniforms } from '../house/materials';
import { clearPose, place, playPose, registerInteractable, runtime, sayOverhead } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { findPath, type TilePos } from '../world/pathfinding';
import { revealScale } from './globals';
import { TileChannel, setShadow } from './Terrain';

const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

/** Has the ground under the player appeared yet (island reveal wave / house build)? */
function groundReady(x: number, z: number) {
  if (runtime.location === 'island') return revealScale(x, z);
  return houseUniforms.built.value >= 0.98 ? 1 : 0;
}

const tmpLook = new THREE.Vector3();
const tmpHand = new THREE.Vector3();

/** Emotes on the player's own right-click menu. */
const EMOTES: { verb: string; pose?: PoseKind; say?: string }[] = [
  { verb: 'Wave', pose: 'wave', say: 'o/' },
  { verb: 'Dance', pose: 'dance' },
  { verb: 'Cheer', pose: 'cheer', say: 'Ship it!' },
  { verb: 'Think', pose: 'think', say: 'Hmm…' },
  { verb: 'Clap', pose: 'clap' },
  { verb: 'Shrug', pose: 'shrug', say: '¯\\_(ツ)_/¯' },
  { verb: 'Bow', pose: 'bow' },
  { verb: 'Yawn', pose: 'yawn' },
  { verb: 'Spin' },
  { verb: 'Hop' },
];

export function Player() {
  const root = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const avatar = useMemo(() => new Avatar(), []);
  useEffect(() => () => avatar.dispose(), [avatar]);

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
    blink: 0,
    nextBlink: 2,
    emote: null as null | { name: 'spin' | 'hop'; t: number },
    ringCooldown: 0,
    /** Where the body is drawn when it settles off-tile (a chair), and how far it has settled. */
    seat: new THREE.Vector3(),
    seatYaw: 0,
    seatK: 0,
    lastStrike: 0,
    look: '',
  });

  // spawn
  useEffect(() => {
    const P = place();
    const spawn = P.spawn;
    const [sx, sz] = P.tileCenter(spawn[0], spawn[1]);
    runtime.player.pos.set(sx, P.heightAt(sx, sz), sz);
    runtime.player.tile = spawn;
    runtime.player.yaw = Math.PI;
    runtime.player.pose = null;
    sim.current.from.copy(runtime.player.pos);
    sim.current.to.copy(runtime.player.pos);
  }, []);

  // destination requests from the store
  useEffect(() => {
    const unsub = useGame.subscribe((state) => {
      const d = state.destination;
      if (!d || d.seq === sim.current.destSeq) return;
      sim.current.destSeq = d.seq;
      const s = sim.current;
      const P = place();
      clearPose();
      if (d.instant) {
        // portal arrival: just be there
        s.path = [];
        s.teleport = null;
        s.seatK = 0;
        const [x, z] = P.tileCenter(d.tile[0], d.tile[1]);
        runtime.player.pos.set(x, P.heightAt(x, z), z);
        runtime.player.tile = [...d.tile] as TilePos;
        s.from.copy(runtime.player.pos);
        s.to.copy(runtime.player.pos);
        s.stepT = 1;
        s.lastZone = null;
        P.tiles.clear(TileChannel.Destination);
        P.tiles.clear(TileChannel.Path);
        d.onArrive?.();
        return;
      }
      if (d.teleport) {
        s.path = [];
        s.teleport = { t: 0, to: d.tile, onArrive: d.onArrive, moved: false };
        sfx('cut');
        emit({ type: 'burst', kind: 'sparkle', x: runtime.player.pos.x, y: runtime.player.pos.y + 0.6, z: runtime.player.pos.z, count: 16 });
        gameState().say('Cut (⌘X)…', 'system');
        return;
      }
      // Start pathing from the tile we're stepping into, so we never snap back.
      const startTile = s.stepT < 1 ? P.worldToTile(s.to.x, s.to.z) : runtime.player.tile;
      const path = findPath(P, startTile, d.tile);
      P.tiles.clear(TileChannel.Destination);
      P.tiles.clear(TileChannel.Path);
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
        P.tiles.set(last[0], last[1], TileChannel.Destination, true);
        for (const [i, j] of path.slice(0, -1)) P.tiles.set(i, j, TileChannel.Path, true);
      }
    });
    return unsub;
  }, []);

  // levelling up is worth a cheer (unless you're mid-walk)
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.levelUp && s.levelUp.seq !== prev.levelUp?.seq && !runtime.player.moving && !runtime.player.pose?.seat) playPose('cheer');
      }),
    []
  );

  // self as an interactable, with emotes (hits on any limb resolve to 'player')
  useEffect(() => {
    avatar.group.userData.interactable = 'player';
    return registerInteractable({
      id: 'player',
      name: 'Toe Knee',
      tone: 'player',
      object: () => avatar.group,
      examine: "That's you, Toe Knee. Tony, if you say it fast. The Cat cape means 99 Cats; the tail means it.",
      actions: EMOTES.map((e) => ({
        verb: e.verb,
        run: () => {
          if (e.pose) playPose(e.pose);
          else sim.current.emote = { name: e.verb === 'Spin' ? 'spin' : 'hop', t: 0 };
          if (e.say) sayOverhead(e.say, 2);
        },
      })),
      dimensions: () => '1 × 1 tile',
    });
  }, [avatar]);

  const finishStep = (s: typeof sim.current) => {
    const P = place();
    runtime.player.tile = P.worldToTile(s.to.x, s.to.z);
    P.tiles.set(runtime.player.tile[0], runtime.player.tile[1], TileChannel.Path, false);
    s.tilesWalked++;
    sfx('step', 0.9 + Math.random() * 0.2);
    if (s.tilesWalked % 30 === 0) gameState().addXp('wandering', 30);

    const g = gameState();
    if (g.running) g.setCaffeine(g.caffeine - 0.9 * tweaks().Player.caffeineDrain);

    const zone = P.area(s.to.x, s.to.z);
    const zid = zone?.id ?? null;
    if (zid !== s.lastZone) {
      s.lastZone = zid;
      g.setZone(zid);
      if (zone && !s.seenZones.has(zone.id)) {
        s.seenZones.add(zone.id);
        if (zone.arrival) g.say(`${zone.name}: ${zone.arrival}`, 'game');
        for (const w of works) if (w.zone === zone.id) g.markQuest(w.slug, 'seen');
      }
    }
    // Fairy ring: standing in the middle is a choice.
    const ringZone = runtime.location === 'island' ? zones.find((z) => z.id === 'ring') : undefined;
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
          const [x, z] = place().tileCenter(s.teleport.to[0], s.teleport.to[1]);
          P.pos.set(x, place().heightAt(x, z), z);
          s.from.copy(P.pos);
          s.to.copy(P.pos);
          s.stepT = 1;
          s.seatK = 0;
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
      const [x, z] = place().tileCenter(next[0], next[1]);
      s.from.copy(P.pos);
      s.to.set(x, place().heightAt(x, z), z);
      s.stepT = 0;
    }
    let moving = false;
    let moved = 0;
    if (s.stepT < 1) {
      moving = true;
      s.stepT = Math.min(1, s.stepT + dt / s.stepDur);
      const k = t.Player.snapToTicks ? Math.round(s.stepT * 2) / 2 : s.stepT;
      const px = P.pos.x;
      const pz = P.pos.z;
      P.pos.lerpVectors(s.from, s.to, k);
      P.pos.y = place().heightAt(P.pos.x, P.pos.z);
      moved = Math.hypot(P.pos.x - px, P.pos.z - pz);
      const dx = s.to.x - s.from.x;
      const dz = s.to.z - s.from.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) P.yaw = dampAngle(P.yaw, Math.atan2(dx, dz), 14, dt);
      if (s.stepT >= 1) {
        finishStep(s);
        if (!s.path.length) {
          place().tiles.clear(TileChannel.Destination);
          place().tiles.clear(TileChannel.Path);
          const cb = s.onArrive;
          s.onArrive = undefined;
          cb?.();
        }
      }
    }
    P.moving = moving;
    if (!g.running) g.caffeine < 100 && Math.random() < dt * 2 && g.setCaffeine(g.caffeine + 0.5);

    // ── poses: what the body is doing ───────────────────────────────────────
    if (moving && P.pose) clearPose();
    P.idle = moving || P.pose ? 0 : P.idle + dt;
    let kind: PoseKind = 'stand';
    let poseT = 0;
    const pose = P.pose;
    if (pose) {
      pose.t += dt;
      if (pose.t >= pose.dur) clearPose();
      else {
        kind = pose.kind;
        poseT = pose.t;
        if (pose.face) P.yaw = dampAngle(P.yaw, Math.atan2(pose.face.x - P.pos.x, pose.face.z - P.pos.z), 10, dt);
        if (pose.seat) {
          s.seat.set(pose.seat.x, P.pos.y, pose.seat.z);
          s.seatYaw = pose.seat.yaw;
        }
      }
    } else if (P.idle > 40 && g.prayer !== 'sleep') {
      kind = 'sit-floor';
      poseT = P.idle - 40;
      if (P.idle - dt <= 40) g.say(runtime.location === 'house' ? 'You sit down on the floor for a moment. Nice floor.' : 'You sit down on the canvas for a moment.');
    }
    const seated = !!P.pose?.seat;
    s.seatK = damp(s.seatK, seated ? 1 : 0, seated ? 7 : 12, dt);
    if (seated) P.yaw = dampAngle(P.yaw, s.seatYaw, 9, dt);

    // the hammer lands: tap, and a little sawdust
    if (kind === 'build') {
      const k = hammerStrike(poseT);
      if (s.lastStrike > 0.25 && k < 0.1) {
        sfx('hammer', 0.9 + Math.random() * 0.25);
        avatar.rightHand(tmpHand);
        emit({ type: 'burst', kind: 'sawdust', x: tmpHand.x, y: tmpHand.y, z: tmpHand.z, count: 4 });
      }
      s.lastStrike = k;
    } else s.lastStrike = 0;

    // look at the pointer when idle
    const lookTarget = runtime.lookActive > 0 && !moving && kind === 'stand' ? tmpLook : null;

    // ── intro drop ─────────────────────────────────────────────────────────
    const reveal = groundReady(P.pos.x, P.pos.z);
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

    // ── movement feel ───────────────────────────────────────────────────────
    const speedTarget = moving ? (g.running ? 2 : 1) : 0;
    s.speed = damp(s.speed, speedTarget, 10, dt);
    // advance the gait by distance so feet don't skate
    const stepLen = 0.3 + Math.max(0, s.speed - 1) * 0.14;
    s.phase += (moved / stepLen) * Math.PI;
    s.squash = damp(s.squash, 0, 7, dt);
    const scale = t.Player.scale * teleScale * (reveal > 0 ? 1 : 0);

    let emoteYaw = 0;
    let emoteHop = 0;
    if (s.emote) {
      s.emote.t += dt;
      const e = s.emote;
      if (e.name === 'spin') emoteYaw = Math.min(1, e.t / 0.8) * Math.PI * 4;
      if (e.name === 'hop') emoteHop = Math.max(0, Math.sin(Math.min(1, e.t / 0.5) * Math.PI)) * 0.6;
      if (e.t > (e.name === 'spin' ? 0.8 : 0.5)) s.emote = null;
    }

    if (root.current) {
      const x = P.pos.x + (s.seat.x - P.pos.x) * s.seatK;
      const z = P.pos.z + (s.seat.z - P.pos.z) * s.seatK;
      root.current.position.set(x, P.pos.y + dropY + emoteHop, z);
      root.current.rotation.y = P.yaw + emoteYaw;
      root.current.scale.setScalar(scale);
      if (lookTarget) {
        lookTarget.copy(runtime.lookTarget).sub(root.current.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -root.current.rotation.y);
        lookTarget.divideScalar(Math.max(0.01, scale));
      }
    }

    // blink
    s.nextBlink -= dt;
    if (s.nextBlink < 0) {
      s.blink = 1;
      s.nextBlink = 2 + Math.random() * 4;
    }
    s.blink = Math.max(0, s.blink - dt * 8);

    // appearance from the Player panel (the make-over mage, basically)
    const tp = t.Player;
    const look = `${tp.skin}|${tp.hair}|${tp.outfit}|${tp.glasses}|${tp.capeColor}|${tp.capeTrim}|${tp.cape}|${tp.hat}`;
    if (look !== s.look) {
      s.look = look;
      avatar.setLook({
        skin: tp.skin,
        hair: tp.hair,
        outfit: (['croissant', 'polka', 'stripes', 'classic'] as const).find((o) => o === tp.outfit) ?? 'croissant',
        glasses: tp.glasses,
        cape: tp.capeColor,
        capeTrim: tp.capeTrim,
        capeOn: tp.cape,
        hat: tp.hat === 'pointer' ? 'pointer' : 'none',
      });
    }

    avatar.update({
      dt,
      time: state.clock.elapsedTime,
      kind,
      t: poseT,
      speed: s.speed,
      phase: s.phase,
      bounce: t.Player.bounce,
      blink: s.blink,
      look: lookTarget,
      squash: s.squash,
      stepFps: tp.animFps,
    });

    // physics proxy so we can shove things around
    body.current?.setNextKinematicTranslation({ x: P.pos.x, y: P.pos.y + 0.85 + dropY, z: P.pos.z });
    setShadow('player', P.pos.x, P.pos.z, 0.5 * scale, 0.42 * Math.min(1, scale) * (1 - Math.min(1, dropY / 6)));
  });

  return (
    <>
      <group ref={root} name="player">
        <primitive object={avatar.group} />
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -10, 0]}>
        <CapsuleCollider args={[0.55, 0.3]} />
      </RigidBody>
    </>
  );
}
