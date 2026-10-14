import { useFrame } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { SkillId } from '@/content/works';
import { registerInteractable, type InteractAction, type Interactable } from '../state/runtime';
import { useGame } from '../state/store';
import type { Fixture } from '../world/map';
import { revealScale } from './globals';

/** Grow in with the island's reveal wave; hide with its layer. */
export function useReveal(fixture: Fixture, ref: RefObject<THREE.Group | null>) {
  const hidden = useGame((s) => !!s.hidden[`fixture:${fixture.id}`]);
  useFrame(() => {
    if (!ref.current) return;
    const s = revealScale(fixture.x, fixture.z);
    ref.current.scale.setScalar(Math.max(0.0001, s));
    ref.current.visible = s > 0.001 && !hidden;
  });
}

export function useFixture(
  fixture: Fixture,
  ref: RefObject<THREE.Object3D | null>,
  def: {
    name?: string;
    tone?: 'npc' | 'object';
    examine: string;
    examineXp?: { skill: SkillId; amount: number };
    actions: InteractAction[];
    level?: number;
    dims?: string;
    passive?: boolean;
  },
  deps: unknown[] = []
) {
  useEffect(() => {
    // so a ray hitting any mesh inside finds its way back here
    if (ref.current) ref.current.userData.interactable = `fixture:${fixture.id}`;
  });
  useEffect(() => {
    return registerInteractable({
      id: `fixture:${fixture.id}`,
      catchTarget: CATCH_TARGETS[fixture.kind],
      passive: def.passive,
      name: def.name ?? fixture.name,
      tone: def.tone ?? 'object',
      level: def.level,
      layer: `fixture:${fixture.id}`,
      object: () => ref.current,
      examine: def.examine,
      examineXp: def.examineXp,
      approach: () => fixture.approach,
      dimensions: def.dims ? () => def.dims! : undefined,
      actions: def.actions,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, ...deps]);
}

/** What a caught item does when used on a fixture of this kind. */
const CATCH_TARGETS: Partial<Record<Fixture['kind'], Interactable['catchTarget']>> = {
  'fallen-frame': 'frame',
  'house-portal': 'portal',
  ring: 'portal',
  stall: 'tea',
  'figma-hub': 'machine',
  agents: 'machine',
};

export const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
