'use client';

/**
 * The player-owned house in the scene: architecture, furniture, build-mode
 * ghosts, the lamp pool, colliders, and the right-click verbs on everything.
 * The data lives in house/* (pure three.js); this wires it to React, physics
 * and the interaction registry.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three/webgpu';
import { useTweaks, tweaks } from '../debug/tweaks';
import { runFurnitureAction } from '../house/actions';
import {
  archUniforms,
  buildFloors,
  buildHotspotOutlines,
  buildShadowDecals,
  buildWalls,
  buildWindowGlass,
  createFloorMaterial,
  createGlassMaterial,
  createWallMaterial,
  sideIsCut,
} from '../house/architecture';
import { buildGhost, buildPiece, type PieceInstance } from '../house/assemble';
import { approachFor, removeFurniture } from '../house/build';
import { buildGarden } from '../house/garden';
import { HOUSE_ORIGIN, ROOM, WALL_H, WALL_T, type HouseLayout } from '../house/layout';
import { houseUniforms } from '../house/materials';
import { SPACE_NAMES } from '../house/rooms';
import { HOUSE_STYLES } from '../house/styles';
import type { HouseStyleId } from '../house/types';
import { damp } from '../lib/random';
import { emit, sfx } from '../state/events';
import { registerInteractable, runtime, type InteractAction } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getHouse, onHouseChange } from '../world/places';
import { Butterfly } from './Wildlife';

const LAMPS = 8;

function useHouseLayout() {
  useSyncExternalStore(
    onHouseChange,
    () => getHouse().version,
    () => 0
  );
  return getHouse().layout;
}

function useStyle(L: HouseLayout): HouseStyleId {
  const override = useGame((s) => s.houseStyle);
  const tweak = useTweaks((t) => t.House.style);
  return (tweak !== 'house default' ? (tweak as HouseStyleId) : override) ?? L.design.style;
}

// ── architecture ─────────────────────────────────────────────────────────────
function Architecture({ L, styleId }: { L: HouseLayout; styleId: HouseStyleId }) {
  const tiles = getHouse().tiles;
  const style = HOUSE_STYLES[styleId];
  // floors + glass + decals depend on the layout; walls also on the style
  const floors = useMemo(() => {
    const m = new THREE.Mesh(buildFloors(L), createFloorMaterial(L, tiles));
    m.receiveShadow = true;
    m.name = 'house-floors';
    return m;
  }, [L, tiles]);
  const walls = useMemo(() => {
    const m = new THREE.Mesh(buildWalls(L, style), createWallMaterial(style.pattern, style.wall));
    m.receiveShadow = true;
    m.name = 'house-walls';
    return m;
  }, [L, style]);
  const glass = useMemo(() => {
    const filled = new Set(L.hotspots.filter((h) => h.def.space === 'window' && h.furniture).map((h) => h.room));
    const m = new THREE.Mesh(
      buildWindowGlass(L, (w) => filled.has(w.room)),
      createGlassMaterial()
    );
    m.renderOrder = 2;
    return m;
  }, [L]);
  const decals = useMemo(() => buildShadowDecals(L.hotspots), [L]);
  const outlines = useMemo(() => buildHotspotOutlines(L), [L]);
  useEffect(
    () => () => {
      for (const m of [floors, walls, glass, decals, outlines]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    },
    [floors, walls, glass, decals, outlines]
  );
  return (
    <>
      <primitive object={floors} />
      <primitive object={walls} />
      <primitive object={glass} />
      <primitive object={decals} />
      <primitive object={outlines} />
    </>
  );
}

// ── colliders: floors, solid wall spans, furniture blocks ─────────────────────
function Colliders({ L, pieces }: { L: HouseLayout; pieces: PieceInstance[] }) {
  const boxes = useMemo(() => {
    const out: { pos: [number, number, number]; half: [number, number, number]; yaw: number }[] = [];
    for (const r of L.rooms) {
      out.push({ pos: [L.ox + r.i0 + ROOM / 2, -0.2, L.oz + r.j0 + ROOM / 2], half: [ROOM / 2, 0.2, ROOM / 2], yaw: 0 });
    }
    for (const s of L.sides) {
      if (s.kind === 'hedge') continue;
      const ax = L.ox + s.a[0];
      const az = L.oz + s.a[1];
      const tx = (s.b[0] - s.a[0]) / ROOM;
      const tz = (s.b[1] - s.a[1]) / ROOM;
      const yaw = Math.atan2(-tz, tx);
      let u = 0;
      const spans: [number, number][] = [];
      for (const o of [...s.openings].sort((p, q) => p.u0 - q.u0)) {
        if (o.kind === 'window') continue;
        if (o.u0 > u) spans.push([u, o.u0]);
        u = o.kind === 'door' ? o.u1 : o.u0;
      }
      if (u < ROOM) spans.push([u, ROOM]);
      for (const [u0, u1] of spans) {
        const m = (u0 + u1) / 2;
        out.push({ pos: [ax + tx * m, WALL_H / 2, az + tz * m], half: [(u1 - u0) / 2, WALL_H / 2, WALL_T / 2], yaw });
      }
    }
    return out;
  }, [L]);
  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
      {boxes.map((b, i) => (
        <CuboidCollider key={`b${i}`} args={b.half} position={b.pos} rotation={[0, b.yaw, 0] as [number, number, number]} />
      ))}
      {pieces
        .filter((p) => !p.hotspot.def.wall && !p.hotspot.def.walkable && p.hotspot.rect[2] > 0)
        .map((p) => {
          const size = p.bounds.getSize(new THREE.Vector3());
          const centre = p.bounds.getCenter(new THREE.Vector3()).applyEuler(p.group.rotation).add(p.group.position);
          return (
            <CuboidCollider
              key={p.key}
              args={[Math.max(0.05, size.x / 2), Math.max(0.05, size.y / 2), Math.max(0.05, size.z / 2)]}
              position={[centre.x, centre.y, centre.z]}
              rotation={[0, p.group.rotation.y, 0] as [number, number, number]}
            />
          );
        })}
    </RigidBody>
  );
}

// ── furniture ────────────────────────────────────────────────────────────────
interface Spawned {
  piece: PieceInstance;
  born: number;
}

function Furniture({ L }: { L: HouseLayout }) {
  const root = useMemo(() => new THREE.Group(), []);
  const cache = useRef(new Map<string, Spawned[]>());
  const loaded = useRef(false);
  const [pieces, setPieces] = useState<PieceInstance[]>([]);

  // Diff by hotspot + furniture + work, so building one thing doesn't rebuild the house.
  useEffect(() => {
    const next = new Map<string, Spawned[]>();
    const now = performance.now();
    for (const h of L.hotspots) {
      const sig = `${h.key}|${h.furniture}|${h.work?.slug ?? ''}`;
      const prev = cache.current.get(sig);
      if (prev) {
        next.set(sig, prev);
        cache.current.delete(sig);
        continue;
      }
      // pieces built after the first load pop in; the initial house just appears
      const built = buildPiece(L, h).map((piece) => ({ piece, born: loaded.current ? now : 0 }));
      if (built.length) next.set(sig, built);
    }
    // whatever is left in the old cache was removed
    for (const list of cache.current.values()) for (const { piece } of list) root.remove(piece.group);
    for (const list of next.values()) for (const { piece } of list) if (piece.group.parent !== root) root.add(piece.group);
    cache.current = next;
    loaded.current = true;
    setPieces([...next.values()].flat().map((s) => s.piece));
  }, [L, root]);

  // right-click verbs
  const buildMode = useGame((s) => s.buildMode);
  useEffect(() => {
    const offs = pieces.map((p) => {
      const key = p.hotspot.key;
      const approach = () => approachFor(getHouse().layout, p.hotspot);
      const actions: InteractAction[] = buildMode
        ? [
            { verb: 'Remove', run: () => removeFurniture(key) },
            { verb: 'Build', run: () => gameState().setBuilding(key) },
          ]
        : (p.def.actions ?? []).map((a) => ({ verb: a.verb, run: () => runFurnitureAction(a.id, p), approach: true }));
      p.group.userData.interactable = `furn:${p.key}`;
      return registerInteractable({
        id: `furn:${p.key}`,
        name: p.def.name,
        tone: p.def.showsWork ? 'work' : 'object',
        level: buildMode ? p.def.level : undefined,
        object: () => p.group,
        examine: p.def.examine,
        examineXp: p.def.examineXp,
        approach,
        actions,
        dimensions: () => `${SPACE_NAMES[p.hotspot.def.space]} · ${p.hotspot.rect[2] || 1}×${p.hotspot.rect[3] || 1}`,
      });
    });
    return () => offs.forEach((off) => off());
  }, [pieces, buildMode]);

  // per-frame: animations, pop-in, build-in during the intro, wall pieces on cut walls
  const { camera } = useThree();
  const lastHammer = useRef(0);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const now = performance.now();
    const built = houseUniforms.built.value;
    for (const list of cache.current.values())
      for (const s of list) {
        const p = s.piece;
        for (const tick of p.ticks) tick(t, dt);
        if (built < 1) {
          // furniture follows the walls up, each piece landing in a puff of dust
          const d = Math.hypot(p.group.position.x - HOUSE_ORIGIN.x, p.group.position.z - HOUSE_ORIGIN.z);
          const rise = Math.min(1, Math.max(0, built * 1.7 - (d / 26) * 0.7));
          const k = Math.min(1, Math.max(0, (rise - 0.5) / 0.35));
          const was = p.group.userData.built ?? 0;
          if (k > 0 && was === 0) {
            emit({ type: 'burst', kind: 'dust', x: p.group.position.x, y: 0.3, z: p.group.position.z, count: 6 });
            if (now - lastHammer.current > 140) {
              lastHammer.current = now;
              sfx('hammer', 0.9 + Math.random() * 0.3);
            }
          }
          p.group.userData.built = k;
          const c1 = 1.70158;
          const e = k <= 0 ? 0 : 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
          p.group.scale.set(1, Math.max(0.001, e), 1);
          p.group.visible = k > 0;
          continue;
        } else if (p.group.userData.built !== undefined && p.group.userData.built < 1) {
          p.group.userData.built = 1;
          p.group.scale.set(1, 1, 1);
          p.group.visible = true;
        }
        if (s.born) {
          const u = Math.min(1, (now - s.born) / 450);
          const c1 = 1.70158;
          const k = 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
          p.group.scale.set(1, Math.max(0.001, k), 1);
          if (u >= 1) s.born = 0;
        }
        if (p.side) p.group.visible = !sideIsCut(L, p.side, camera.position, archUniforms.player.value);
      }
  });

  return (
    <>
      <primitive object={root} />
      <Colliders L={L} pieces={pieces} />
      <Lamps pieces={pieces} />
    </>
  );
}

// ── build-mode ghosts on empty hotspots ──────────────────────────────────────
function Ghosts({ L }: { L: HouseLayout }) {
  const buildMode = useGame((s) => s.buildMode);
  const group = useMemo(() => {
    const g = new THREE.Group();
    if (!buildMode) return g;
    for (const h of L.hotspots) {
      if (h.furniture) continue;
      const ghost = buildGhost(L, h);
      if (!ghost) continue;
      ghost.userData.interactable = `hotspot:${h.key}`;
      ghost.userData.key = h.key;
      g.add(ghost);
    }
    return g;
  }, [L, buildMode]);
  useEffect(() => {
    const offs = group.children.map((o) => {
      const key = o.userData.key as string;
      const h = L.hotspots.find((x) => x.key === key)!;
      return registerInteractable({
        id: `hotspot:${key}`,
        name: SPACE_NAMES[h.def.space],
        tone: 'zone',
        object: () => o,
        examine: `An empty ${SPACE_NAMES[h.def.space].toLowerCase()}. Build something into it.`,
        approach: () => approachFor(getHouse().layout, h),
        actions: [{ verb: 'Build', run: () => gameState().setBuilding(key) }],
        dimensions: () => `${h.rect[2] || 1}×${h.rect[3] || 1} tiles`,
      });
    });
    return () => offs.forEach((off) => off());
  }, [group, L]);
  return <primitive object={group} />;
}

// ── lamp pool: the nearest light sources get the real point lights ────────────
function Lamps({ pieces }: { pieces: PieceInstance[] }) {
  const lights = useMemo(() => Array.from({ length: LAMPS }, () => new THREE.PointLight('#ffffff', 0, 6, 1.7)), []);
  const all = useMemo(() => pieces.flatMap((p) => p.lights), [pieces]);
  const order = useRef<typeof all>([]);
  const timer = useRef(0);
  useFrame((state, dt) => {
    const t = tweaks();
    timer.current -= dt;
    const P = runtime.player.pos;
    if (timer.current <= 0) {
      timer.current = 0.3;
      order.current = [...all].sort((a, b) => a.world.distanceToSquared(P) - b.world.distanceToSquared(P));
    }
    const time = state.clock.elapsedTime;
    const inHouse = runtime.location === 'house';
    lights.forEach((l, i) => {
      const src = order.current[i];
      if (!src || i >= t.House.lampCount || !inHouse) {
        l.intensity = 0;
        return;
      }
      l.position.copy(src.world);
      l.color.set(src.color);
      l.distance = src.distance;
      const flicker = src.flicker ? 1 - src.flicker * 0.5 * (Math.sin(time * 13 + i * 3.1) * 0.5 + Math.sin(time * 7.3 + i) * 0.5 + 1) * 0.5 : 1;
      l.intensity = src.intensity * t.House.lamps * flicker * (0.75 + 0.6 * houseUniforms.built.value);
    });
  });
  return (
    <>
      {lights.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  );
}

// ── the garden courtyard: lawn, beds, flowers, Bézier-handle butterflies ─────
const GARDEN_RANGE: [number, number] = [1.2, 2.6];
const flatGround = () => 0;

function Garden({ L }: { L: HouseLayout }) {
  const layers = useMemo(() => L.rooms.filter((r) => r.def.id === 'garden').map((r) => buildGarden(L, r, r.index + 1)), [L]);
  useEffect(() => () => layers.forEach((g) => g.dispose()), [layers]);
  const visible = useCallback(() => runtime.location === 'house' && houseUniforms.built.value >= 1, []);
  return (
    <>
      {layers.map((g, i) => (
        <primitive key={`lawn:${i}`} object={g.group} />
      ))}
      {layers.flatMap((g, gi) =>
        [0, 1, 2].map((i) => (
          <Butterfly key={`fly:${gi}:${i}`} index={gi * 3 + i} prefix="garden-butterfly" home={g.centre} range={GARDEN_RANGE} ground={flatGround} visible={visible} />
        ))
      )}
    </>
  );
}

// ── the house ────────────────────────────────────────────────────────────────
export function House() {
  const L = useHouseLayout();
  const styleId = useStyle(L);
  const location = useGame((s) => s.location);
  const stage = useGame((s) => s.stage);
  const { camera } = useThree();
  const visible = location === 'house' || stage !== 'world';

  useEffect(() => {
    archUniforms.centre.value.set(HOUSE_ORIGIN.x, HOUSE_ORIGIN.z);
  }, []);

  useFrame((_, dt) => {
    const t = tweaks();
    const g = gameState();
    archUniforms.player.value.set(runtime.player.pos.x, runtime.player.pos.z);
    archUniforms.camera.value.copy(camera.position);
    archUniforms.cutMode.value = t.House.cutaway === 'walls up' ? 0 : t.House.cutaway === 'walls down' ? 2 : 1;
    archUniforms.cutHeight.value = t.House.cutHeight;
    archUniforms.cutRadius.value = t.House.cutRadius;
    houseUniforms.buildMode.value = damp(houseUniforms.buildMode.value, g.buildMode ? 1 : 0, 6, dt);
    houseUniforms.ghostColor.value.set(t.HUD.accent);
  });

  return (
    <group visible={visible} name="house">
      <Architecture L={L} styleId={styleId} />
      <Furniture L={L} />
      <Garden L={L} />
      <Ghosts L={L} />
    </group>
  );
}

