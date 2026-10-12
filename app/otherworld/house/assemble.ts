/**
 * Turns placed hotspots into scene objects: one merged mesh per piece, its
 * animated sub-parts, extras (fire, portal surfaces, art) and light specs in
 * world space. Pure three.js.
 */
import * as THREE from 'three/webgpu';
import { hashString } from '../lib/random';
import { FURNITURE } from './furniture';
import type { BuildCtx, FurnitureDef, LightSpec } from './furniture/types';
import { Kit } from './kit';
import { HOUSE_STYLES } from './styles';
import { furnitureMaterial, ghostMaterial } from './materials';
import { WALL_T, type HouseLayout, type PlacedHotspot, type WallSide, type WindowInfo } from './layout';
import type { Facing } from './types';

export interface WorldLight extends LightSpec {
  key: string;
  world: THREE.Vector3;
}

export interface PieceInstance {
  key: string;
  hotspot: PlacedHotspot;
  def: FurnitureDef;
  group: THREE.Group;
  lights: WorldLight[];
  ticks: ((t: number, dt: number) => void)[];
  /** Local-space bounds of the merged mesh, for picking and selection boxes. */
  bounds: THREE.Box3;
  /** Wall this piece hangs on, if any (hidden while that wall is cut away). */
  side?: WallSide;
}

const SUB_ANIMS: Record<string, (o: THREE.Object3D, t: number, seed: number) => void> = {
  rock: (o, t, s) => (o.rotation.x = Math.sin(t * 1.6 + s) * 0.12),
  spin: (o, t, s) => (o.rotation.y = t * 0.6 + s),
  spinFast: (o, t, s) => (o.rotation.y = t * 2.4 + s),
  bob: (o, t, s) => (o.position.y = o.userData.baseY + Math.sin(t * 2 + s) * 0.05),
  swing: (o, t, s) => (o.rotation.z = Math.sin(t * 1.3 + s) * 0.18),
  tick: (o, t) => (o.rotation.z = -Math.floor(t / 0.6) * (Math.PI / 30)),
  orbit: (o, t, s) => (o.rotation.y = -t * 0.9 + s),
};

const facingYaw = (f: Facing) => (f * Math.PI) / 2;

function contextFor(L: HouseLayout, h: PlacedHotspot, widthOverride?: number): BuildCtx {
  const sideways = h.facing === 1 || h.facing === 3;
  const w = widthOverride ?? (sideways ? h.rect[3] : h.rect[2]);
  const d = sideways ? h.rect[2] : h.rect[3];
  const sameSpace = h.room.def.hotspots.filter((x) => x.space === h.def.space);
  return {
    w,
    d,
    wallZ: -d / 2 + WALL_T / 2,
    seed: hashString(h.key) % 100000,
    room: h.room.def.id,
    style: L.design.style,
    work: h.work,
    index: Math.max(0, sameSpace.findIndex((x) => x.id === h.def.id)),
  };
}

function instantiate(
  L: HouseLayout,
  h: PlacedHotspot,
  def: FurnitureDef,
  at: { x: number; z: number; facing: Facing },
  ctx: BuildCtx,
  key: string,
  side?: WallSide
): PieceInstance {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = facingYaw(at.facing);
  group.userData.hotspot = h.key;
  const kit = new Kit(ctx.seed);
  def.model(kit, ctx);
  const geo = kit.build();
  const bounds = new THREE.Box3();
  if (geo) {
    const mesh = new THREE.Mesh(geo, furnitureMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    bounds.union(geo.boundingBox!);
  }
  const ticks: PieceInstance['ticks'] = [];
  for (const [name, { kit: sub, pivot }] of kit.subs) {
    const g = sub.build(false);
    if (!g) continue;
    g.translate(-pivot.x, -pivot.y, -pivot.z);
    const mesh = new THREE.Mesh(g, furnitureMaterial);
    mesh.castShadow = true;
    mesh.position.copy(pivot);
    mesh.userData.baseY = pivot.y;
    group.add(mesh);
    g.computeBoundingBox();
    bounds.union(g.boundingBox!.clone().translate(pivot));
    const anim = SUB_ANIMS[name.replace(/\d+$/, '')];
    if (anim) ticks.push((t) => anim(mesh, t, ctx.seed % 7));
  }
  for (const e of def.extras?.(ctx) ?? []) {
    group.add(e.object);
    e.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix));
      }
    });
    if (e.tick) ticks.push(e.tick);
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 1, 0.4));
  group.updateMatrixWorld(true);
  const lights = (def.lights?.(ctx) ?? []).map((l, i) => ({
    ...l,
    key: `${key}:${i}`,
    world: new THREE.Vector3(...l.pos).applyMatrix4(group.matrixWorld),
  }));
  return { key, hotspot: h, def, group, lights, ticks, bounds, side };
}

/** Build one hotspot's furniture. Room-wide spaces (curtains, windows) build once per window. */
export function buildPiece(L: HouseLayout, h: PlacedHotspot): PieceInstance[] {
  if (!h.furniture) return [];
  const def = FURNITURE.get(h.furniture);
  if (!def) return [];
  if (h.rect[2] === 0) {
    return L.windows
      .filter((w) => w.room === h.room)
      .map((w: WindowInfo, i) => {
        const ctx = { ...contextFor(L, h, w.width), d: 1, wallZ: -0.5 + WALL_T / 2 };
        // place on the inside face of the window's wall
        const dir = [Math.sin(facingYaw(w.facing)), Math.cos(facingYaw(w.facing))];
        return instantiate(L, h, def, { x: w.x + dir[0] * 0.5, z: w.z + dir[1] * 0.5, facing: w.facing }, ctx, `${h.key}#${i}`, w.side);
      });
  }
  return [instantiate(L, h, def, { x: h.x, z: h.z, facing: h.facing }, contextFor(L, h), h.key, h.side)];
}

/** A translucent preview of a space's first catalog entry, for build mode. */
export function buildGhost(L: HouseLayout, h: PlacedHotspot): THREE.Object3D | null {
  if (h.rect[2] === 0) return null;
  const def = [...FURNITURE.values()].find((d) => d.space === h.def.space);
  if (!def) return null;
  const ctx = contextFor(L, h);
  const kit = new Kit(ctx.seed);
  def.model(kit, ctx);
  const geo = kit.build(false);
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, ghostMaterial);
  mesh.position.set(h.x, 0, h.z);
  mesh.rotation.y = facingYaw(h.facing);
  mesh.userData.hotspot = h.key;
  mesh.renderOrder = 6;
  return mesh;
}

export function styleOf(L: HouseLayout) {
  return HOUSE_STYLES[L.design.style];
}
