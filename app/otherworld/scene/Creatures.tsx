'use client';

/**
 * Visitor-made creatures, out in the world: each one wanders near home, turns
 * to look at you, mutters in its own mood and can be talked to, poked or taken
 * for a walk (between places too). While the lab is open its draft stands
 * beside you on a turntable, with the camera framing it.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { creatureId, live, openLab, placePreview, pokeCreature, preview, setFollowing, talkToCreature } from '../creatures/actions';
import { CreatureRig } from '../creatures/model';
import { LABELS, examineText, type CreatureSpec } from '../creatures/spec';
import { idleLine } from '../creatures/voice';
import { damp, dampAngle } from '../lib/random';
import { npcSay, registerInteractable, runtime, type InteractAction } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { findPath, type TilePos } from '../world/pathfinding';
import { PLACES, placeAt, type PlaceId } from '../world/places';

const tmpLook = new THREE.Vector3();

interface Brain {
  place: PlaceId;
  x: number;
  z: number;
  yaw: number;
  path: TilePos[];
  idle: number;
  repath: number;
  chatter: number;
  moving: number;
  following: boolean;
  /** Seconds to stand still for someone walking over to it. */
  hold: number;
}

/** A free tile next to the creature that you could step onto it from, nearest you. */
function approachTile(b: Brain): TilePos {
  const P = PLACES[b.place];
  const c = P.worldToTile(b.x, b.z);
  const me = runtime.player.tile;
  let best: TilePos = c;
  let bestD = Infinity;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const t: TilePos = [c[0] + di, c[1] + dj];
      if (!P.inBounds(...t) || !P.walkable(...t) || !P.canStep(t[0], t[1], -di, -dj)) continue;
      const d = Math.hypot(t[0] - me[0], t[1] - me[1]) + (di && dj ? 0.5 : 0);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
  }
  return best;
}

const stepRate = (spec: CreatureSpec) =>
  ({ waddle: 5, hop: 3.2, float: 2, scuttle: 10, slither: 4 })[spec.gait] * (0.7 + spec.speed * 0.8);
const walkSpeed = (spec: CreatureSpec) => (0.7 + spec.speed * 1.8) * (spec.gait === 'scuttle' ? 1.3 : spec.gait === 'float' ? 0.8 : 1);

function useRig(spec: CreatureSpec) {
  const rig = useMemo(() => new CreatureRig(spec), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => rig.setSpec(spec), [rig, spec]);
  useEffect(() => () => rig.dispose(), [rig]);
  return rig;
}

function Creature({ spec }: { spec: CreatureSpec }) {
  const rig = useRig(spec);
  const specRef = useRef(spec);
  specRef.current = spec;
  const brain = useRef<Brain>({
    place: spec.home?.place ?? 'island',
    x: spec.home?.x ?? 0,
    z: spec.home?.z ?? 0,
    yaw: Math.random() * Math.PI * 2,
    path: [],
    idle: Math.random() * 2,
    repath: 0,
    chatter: 6 + Math.random() * 10,
    moving: 0,
    following: false,
    hold: 0,
  });
  const id = creatureId(spec.id);
  const anchor = useMemo(() => () => (rig.root.visible ? rig.headPoint(new THREE.Vector3()) : null), [rig]);

  // what the actions module can reach while it's out
  useEffect(() => {
    const b = brain.current;
    const entry = {
      get following() {
        return b.following;
      },
      set following(v: boolean) {
        b.following = v;
        b.path = [];
        b.repath = 0;
      },
      get place() {
        return b.place;
      },
      get x() {
        return b.x;
      },
      get z() {
        return b.z;
      },
      anchor,
      poke: () => rig.pokeIt(),
    };
    live.set(spec.id, entry);
    return () => {
      if (live.get(spec.id) === entry) live.delete(spec.id);
    };
  }, [spec.id, rig, anchor]);

  useEffect(() => {
    rig.root.userData.interactable = id;
    const s = spec;
    const b = brain.current;
    const approach = () => {
      b.hold = 10;
      b.path = [];
      return approachTile(b);
    };
    /** Close enough? If it shuffled off while you walked over, follow it (a couple of times). */
    const reach = (run: () => void, tries = 2) => {
      if (Math.hypot(runtime.player.pos.x - b.x, runtime.player.pos.z - b.z) <= 2) return run();
      if (tries > 0) gameState().walkTo(approach(), () => reach(run, tries - 1));
      else gameState().say(`${specRef.current.name} has somewhere to be.`);
    };
    return registerInteractable({
      id,
      name: s.name,
      tone: 'npc',
      level: 1 + s.eyes * 3 + s.legs * 2 + s.arms * 2 + (s.topper === 'none' ? 0 : 7),
      object: () => rig.root,
      examine: examineText(s),
      approach,
      get actions(): InteractAction[] {
        return [
          { verb: 'Talk-to', approach: true, run: () => reach(() => talkToCreature(specRef.current)) },
          { verb: 'Poke', approach: true, run: () => reach(() => pokeCreature(specRef.current)) },
          b.following
            ? { verb: 'Dismiss', run: () => setFollowing(specRef.current, false) }
            : { verb: 'Follow-me', run: () => setFollowing(specRef.current, true) },
          { verb: 'Edit', run: () => openLab(specRef.current) },
        ];
      },
      dimensions: () => `${rig.height.toFixed(1)}m · ${LABELS[s.skin]} shader`,
    });
  }, [id, rig, spec]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = brain.current;
    const g = gameState();
    const s = specRef.current;
    const inWorld = g.stage === 'world';
    // a follower hops places with you once you've arrived
    if (inWorld && b.following && b.place !== runtime.location && placeAt(runtime.player.pos.x, runtime.player.pos.z).id === runtime.location) {
      b.place = runtime.location;
      b.x = runtime.player.pos.x + (Math.random() - 0.5) * 1.2;
      b.z = runtime.player.pos.z + (Math.random() - 0.5) * 1.2;
      b.path = [];
    }
    const visible = inWorld && b.place === runtime.location;
    rig.root.visible = visible;
    if (!visible) return;

    const P = PLACES[b.place];
    const player = runtime.player.pos;
    const dxp = player.x - b.x;
    const dzp = player.z - b.z;
    const distP = Math.hypot(dxp, dzp);
    const talking = g.dialogue?.startsWith(id) ?? false;
    const here = P.worldToTile(b.x, b.z);

    // decide where to go
    if (talking || b.hold > 0) {
      b.hold -= dt;
      b.path = [];
    } else if (b.following) {
      b.repath -= dt;
      if (distP > 2.2 && b.repath <= 0) {
        b.repath = 0.6;
        const path = findPath(P, here, runtime.player.tile, 1500);
        b.path = path.slice(0, Math.max(0, path.length - 1));
      } else if (distP < 1.4) b.path = [];
    } else if (!b.path.length && s.gear !== 'N') {
      b.idle -= dt;
      if (b.idle <= 0) {
        const home = s.home && s.home.place === b.place ? P.worldToTile(s.home.x, s.home.z) : here;
        const target: TilePos = [home[0] + Math.round((Math.random() - 0.5) * 8), home[1] + Math.round((Math.random() - 0.5) * 8)];
        b.path = P.inBounds(...target) && P.walkable(...target) ? findPath(P, here, target, 600) : [];
        b.idle = b.path.length ? 2 + Math.random() * 5 : 0.8;
      }
    }

    // walk the path
    let walking = false;
    let faceYaw = b.yaw;
    if (b.path.length) {
      const [tx, tz] = P.tileCenter(...b.path[0]);
      const dx = tx - b.x;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dz);
      const step = walkSpeed(s) * (b.following && distP > 4 ? 1.6 : 1) * dt;
      if (d <= step) {
        b.x = tx;
        b.z = tz;
        b.path.shift();
      } else {
        b.x += (dx / d) * step;
        b.z += (dz / d) * step;
      }
      // in reverse it faces the way it came: a moonwalk
      if (d > 0.001) faceYaw = Math.atan2(dx, dz) + (s.gear === 'R' ? Math.PI : 0);
      walking = true;
    } else if (distP < 3.4 || talking || b.hold > 0) {
      faceYaw = Math.atan2(dxp, dzp);
    }
    b.yaw = dampAngle(b.yaw, faceYaw, walking ? 10 : 4, dt);
    b.moving = damp(b.moving, walking ? 1 : 0, 8, dt);

    rig.root.position.set(b.x, P.heightAt(b.x, b.z), b.z);
    rig.root.rotation.y = b.yaw;
    rig.root.updateMatrixWorld();

    // mutter when you're nearby
    b.chatter -= dt;
    if (b.chatter <= 0) {
      b.chatter = 14 + Math.random() * 22;
      if (distP < 6 && !g.dialogue) npcSay(id, idleLine(s), anchor, 4);
    }

    const look = distP < 5 || talking ? tmpLook.copy(player).setY(player.y + 1.4) : null;
    rig.update({ dt, time: state.clock.elapsedTime, moving: b.moving, talking, look }, s.gait, stepRate(s));
  });

  return <primitive object={rig.root} />;
}

/** The lab's draft, on a glowing turntable next to you. */
function Preview({ spec }: { spec: CreatureSpec }) {
  const rig = useRig(spec);
  const specRef = useRef(spec);
  specRef.current = spec;
  const ring = useMemo(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#3b82f6' }));
    m.renderOrder = 1;
    return m;
  }, []);
  const focused = useRef(false);

  useEffect(() => {
    placePreview();
    return () => {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      if (focused.current) runtime.cam.focus = null;
    };
  }, [ring]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = gameState();
    const visible = g.stage === 'world' && preview.place === runtime.location;
    rig.root.visible = ring.visible = visible;
    if (!visible) return;
    const P = PLACES[preview.place];
    const y = P.heightAt(preview.x, preview.z);
    const t = state.clock.elapsedTime;
    rig.root.position.set(preview.x, y, preview.z);
    rig.root.rotation.y = preview.yaw + Math.sin(t * 0.6) * 0.65;
    rig.root.updateMatrixWorld();
    ring.position.set(preview.x, y + 0.03, preview.z);
    ring.scale.setScalar(Math.max(0.8, rig.height * 0.75));

    // frame it; on phones the panel covers the bottom half, so aim lower
    const narrow = typeof window !== 'undefined' && window.innerWidth < 760;
    const h = rig.height;
    runtime.cam.focus ??= { target: new THREE.Vector3(), distance: 5, yaw: preview.yaw, pitch: 0.3 };
    const distance = (4.5 + h * 1.8) * (narrow ? 1.7 : 1);
    runtime.cam.focus.target.set(preview.x, y + h * 0.55 - (narrow ? distance * 0.15 : 0), preview.z);
    runtime.cam.focus.distance = distance;
    runtime.cam.focus.yaw = preview.yaw;
    // high enough to see over the furniture
    runtime.cam.focus.pitch = 0.55;
    focused.current = true;

    const cam = runtime.camera;
    rig.update({ dt, time: t, moving: 0, talking: false, look: cam ? cam.position : null }, specRef.current.gait, stepRate(specRef.current));
  });

  return (
    <>
      <primitive object={rig.root} />
      <primitive object={ring} />
    </>
  );
}

export function Creatures() {
  const creatures = useGame((s) => s.creatures);
  const draft = useGame((s) => s.labDraft);
  const labOpen = useGame((s) => s.tab === 'lab' && s.stage === 'world');
  const editing = labOpen && draft ? draft.id : null;
  return (
    <>
      {creatures.map((c) => (c.id === editing ? null : <Creature key={c.id} spec={c} />))}
      {labOpen && draft && <Preview spec={draft} />}
    </>
  );
}
