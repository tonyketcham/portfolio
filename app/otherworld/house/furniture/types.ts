import type * as THREE from 'three/webgpu';
import type { Work } from '@/content/works';
import type { Kit, V3 } from '../kit';
import type { HouseStyleId, RoomId, SpaceKind } from '../types';

export interface BuildCtx {
  /** Footprint in the piece's own frame (it faces +z): w along x, d along z. */
  w: number;
  d: number;
  /** Local z of the wall face behind a wall-mounted piece. */
  wallZ: number;
  seed: number;
  room: RoomId;
  style: HouseStyleId;
  /** The portfolio piece assigned to this hotspot, if it shows one. */
  work?: Work;
  /** Index among hotspots of the same space in the room (chair-1, chair-2…). */
  index: number;
}

/** Live objects a piece adds next to its merged mesh (fire, portal surfaces, art). */
export interface Extra {
  object: THREE.Object3D;
  tick?: (t: number, dt: number) => void;
}

export interface LightSpec {
  /** In the piece's local frame. */
  pos: V3;
  color: string;
  intensity: number;
  distance: number;
  flicker?: number;
}

export interface FurnitureAction {
  verb: string;
  /** Handled in house/actions.ts. */
  id: string;
}

export interface FurnitureDef {
  id: string;
  space: SpaceKind;
  name: string;
  level: number;
  xp: number;
  /** What the creation menu says it costs. Planks, mostly lies. */
  materials: [string, number][];
  examine: string;
  model: (k: Kit, c: BuildCtx) => void;
  extras?: (c: BuildCtx) => Extra[];
  lights?: (c: BuildCtx) => LightSpec[];
  actions?: FurnitureAction[];
  /** Shows a portfolio work (gets `c.work`). */
  showsWork?: boolean;
}
