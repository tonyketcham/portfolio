/**
 * Mutable per-frame state that would be wasteful to push through React:
 * positions, camera orbit, pointer, hover, and the registry of everything you
 * can click on in the world.
 */
import * as THREE from 'three';
import type { TilePos } from '../world/pathfinding';
import type { Tone } from './store';

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
  /** Where the player creature is looking (pointer on the ground). */
  lookTarget: new THREE.Vector3(),
  lookActive: 0,
};

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

export function sayOverhead(text: string, seconds = 4) {
  runtime.overhead.text = text;
  runtime.overhead.until = performance.now() + seconds * 1000;
}

export function npcSay(id: string, text: string, anchor: () => THREE.Vector3 | null, seconds = 4, color?: string) {
  runtime.overheads.set(id, { text, until: performance.now() + seconds * 1000, anchor, color });
}
