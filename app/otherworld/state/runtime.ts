/**
 * Mutable per-frame state that would be wasteful to push through React:
 * positions, camera orbit, pointer, hover, and the registry of everything you
 * can click on in the world.
 */
import * as THREE from 'three';
import { POSES, type PoseKind } from '../avatar/poses';
import type { TilePos } from '../world/pathfinding';
import { PLACES, type Place, type PlaceId } from '../world/places';
import type { Tone } from './store';
import type { XpReward } from './skills';

export interface InteractAction {
  verb: string;
  run: () => void;
  /** Walk to the target's approach tile before running. */
  approach?: boolean;
}

export interface Interactable {
  id: string;
  name: string;
  tone: Tone;
  level?: number;
  /** The object to raycast against and to draw selection bounds around. */
  object: () => THREE.Object3D | null;
  /** First action is the default (tap / left-click). */
  actions: InteractAction[];
  examine: string;
  examineXp?: XpReward;
  approach?: () => TilePos | null;
  /** Layer id used by the Layers panel (hide/lock). */
  layer?: string;
  /** Pressing and dragging moves it (physics props). */
  drag?: {
    begin: () => void;
    move: (point: THREE.Vector3) => void;
    end: (velocity: THREE.Vector3) => void;
  };
  /** Optional design-tool dimension label for the selection box. */
  dimensions?: () => string;
  /** Only reachable from the long-press / right-click menu (floors, big surfaces). */
  passive?: boolean;
}

/** What the player's body is doing besides walking (sitting, hammering, praying…). */
export interface ActivePose {
  kind: PoseKind;
  /** Seconds since it started. */
  t: number;
  /** Seconds it lasts; Infinity holds it until the player moves. */
  dur: number;
  /** Turn to face this world point. */
  face?: { x: number; z: number };
  /** Settle here instead of on the tile (chairs, benches), facing `yaw`. */
  seat?: { x: number; z: number; yaw: number };
}

export interface Overhead {
  text: string;
  until: number;
  anchor: () => THREE.Vector3 | null;
  color?: string;
}

export const runtime = {
  player: {
    pos: new THREE.Vector3(),
    yaw: 0,
    tile: [0, 0] as TilePos,
    moving: false,
    /** Seconds since last step, for the idle sit-down. */
    idle: 0,
    landed: false,
    pose: null as ActivePose | null,
  },
  overhead: { text: '', until: 0 },
  /** Speech above NPCs and objects. */
  overheads: new Map<string, Overhead>(),
  cam: {
    yaw: 0.55,
    pitch: 0.82,
    distance: 15,
    /** When set, the camera frames this instead of following the player. */
    focus: null as null | { target: THREE.Vector3; distance: number; yaw: number; pitch: number },
    shake: 0,
    /** Jump straight to the target next frame (portal arrivals). */
    snap: false,
  },
  camera: null as THREE.PerspectiveCamera | null,
  canvas: null as HTMLCanvasElement | null,
  pointer: { x: 0, y: 0, inside: false, isTouch: false },
  hoverId: null as string | null,
  hoverTile: null as TilePos | null,
  interactables: new Map<string, Interactable>(),
  draggingId: null as string | null,
  intro: {
    /** 0 → 1 while the flat artboard becomes the world. */
    unfold: 1,
    /** Camera distance at "100%" during the artboard stage. */
    baseDistance: 9,
  },
  fps: 60,
  physicsReady: false,
  /** Which renderer backend is drawing ('WebGPU' or 'WebGL2'). */
  backend: '' as string,
  /** Where the player is. Mirrors the store, readable every frame. */
  location: 'house' as PlaceId,
  /** Where the player creature is looking (pointer on the ground). */
  lookTarget: new THREE.Vector3(),
  lookActive: 0,
};

/** The place the player is currently in. */
export const place = (): Place => PLACES[runtime.location];

export function registerInteractable(item: Interactable) {
  runtime.interactables.set(item.id, item);
  return () => {
    if (runtime.interactables.get(item.id) === item) runtime.interactables.delete(item.id);
  };
}

/** Walk up the parent chain to find which interactable an intersected mesh belongs to. */
export function interactableFor(object: THREE.Object3D | null): Interactable | undefined {
  let o: THREE.Object3D | null = object;
  while (o) {
    const id = o.userData?.interactable as string | undefined;
    if (id) return runtime.interactables.get(id);
    o = o.parent;
  }
  return undefined;
}

/** Play a pose on the player. Walking anywhere cancels it. */
export function playPose(kind: PoseKind, opts: { face?: { x: number; z: number }; seat?: ActivePose['seat']; dur?: number } = {}) {
  runtime.player.pose = { kind, t: 0, dur: opts.dur ?? POSES[kind].dur, face: opts.face, seat: opts.seat };
}

export function clearPose() {
  runtime.player.pose = null;
}

export function sayOverhead(text: string, seconds = 4) {
  runtime.overhead.text = text;
  runtime.overhead.until = performance.now() + seconds * 1000;
}

export function npcSay(id: string, text: string, anchor: () => THREE.Vector3 | null, seconds = 4, color?: string) {
  runtime.overheads.set(id, { text, until: performance.now() + seconds * 1000, anchor, color });
}
