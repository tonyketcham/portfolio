'use client';

/**
 * Every work in content/works.ts, standing in the world: upright frames on
 * easels for projects, and "art trees" whose canopy is the piece itself.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Work } from '@/content/works';
import { tweaks } from '../debug/tweaks';
import { damp } from '../lib/random';
import { loadArt } from '../lib/textures';
import { useMuxVideoTexture } from '../lib/video';
import { createArtMaterial, type ArtMaterial } from '../shaders/art';
import { inspectWork } from '../state/actions';
import { useArtFx } from '../state/artfx';
import { emit } from '../state/events';
import { registerInteractable, runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getWorld, seedOf, type WorkPlacement } from '../world/map';
import { revealScale } from './globals';
import { Label } from './Label';
import { Revealed } from './Revealed';

const MAX_W = 3.5;
const MAX_H = 2.5;

function fitSize(aspect: number) {
  let w = MAX_W;
  let h = w / aspect;
  if (h > MAX_H) {
    h = MAX_H;
    w = h * aspect;
  }
  return { w, h };
}

/** Frame a piece face-on, leaving room for the inspector panel. */
export function focusOn(center: THREE.Vector3, yaw: number, w: number, h: number) {
  const fov = THREE.MathUtils.degToRad(tweaks().Camera.fov);
  const tanHalf = Math.tan(fov / 2);
  const el = runtime.canvas;
  const aspect = el ? el.clientWidth / Math.max(1, el.clientHeight) : 1;
  const mobile = aspect < 0.85;
  const target = center.clone();
  let distance: number;
  if (mobile) {
    distance = Math.max((w * 1.12) / (2 * tanHalf * aspect), (h * 1.15) / (0.4 * 2 * tanHalf));
    const vh = 2 * distance * tanHalf;
    target.y -= vh * 0.26;
  } else {
    distance = Math.max((w * 1.12) / (0.6 * 2 * tanHalf * aspect), (h * 1.2) / (0.86 * 2 * tanHalf));
    const vw = 2 * distance * tanHalf * aspect;
    target.x += Math.cos(yaw) * vw * 0.19;
    target.z += -Math.sin(yaw) * vw * 0.19;
  }
  emit({ type: 'focus-camera', x: target.x, y: target.y, z: target.z, distance, yaw, pitch: 0.06 });
}

function useArtMaterial(work: Work, circle = false) {
  const cover = work.media[0];
  const material = useMemo(
    () =>
      createArtMaterial({
        seed: seedOf(work.slug),
        pattern: cover.kind === 'procedural' ? cover.pattern : undefined,
        palette: cover.kind === 'procedural' ? cover.palette : work.fx?.palette,
        fx: work.fx,
        circle,
      }),
    [work, cover, circle]
  );
  const [aspect, setAspect] = useState<number | null>(cover.kind === 'procedural' ? (circle ? 1 : 1.5) : null);
  const [natural, setNatural] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (cover.kind === 'procedural') return;
    const src = cover.kind === 'image' ? cover.src : cover.poster;
    let alive = true;
    loadArt(src)
      .then((tex) => {
        if (!alive) return;
        material.uniforms.map.value = tex;
        material.uniforms.uHasMap.value = 1;
        const nw = tex.userData.naturalWidth as number;
        const nh = tex.userData.naturalHeight as number;
        material.uniforms.uTexAspect.value = nw / nh;
        setNatural([nw, nh]);
        setAspect(circle ? 1 : nw / nh);
      })
      .catch(() => alive && setAspect(1.5));
    return () => {
      alive = false;
    };
  }, [cover, material, circle]);

  useEffect(() => () => material.dispose(), [material]);
  return { material, aspect, natural };
}

function applyFx(material: ArtMaterial, work: Work, hover: number, selected: number) {
  const t = tweaks();
  const o = useArtFx.getState().overrides[work.slug];
  const fx = { ...work.fx, ...o };
  const u = material.uniforms;
  u.uHalftone.value = fx.halftone ?? 0;
  u.uDotScale.value = fx.dotScale ?? 6;
  u.uGradient.value = fx.gradient ?? 0;
  u.uDisplace.value = fx.displace ?? 0;
  u.uDither.value = fx.dither ?? 0;
  u.uChromaFx.value = fx.chroma ?? 0;
  u.uScan.value = fx.scan ?? 0;
  u.uFx.value = t.Artboards.fx;
  u.uBreathe.value = t.Artboards.breathe;
  u.uHover.value = hover;
  u.uSelected.value = selected;
  u.uAccent.value.set(t.Artboards.selection);
}

// ── upright frame ────────────────────────────────────────────────────────────
export function WorkArtboard({ placement }: { placement: WorkPlacement }) {
  const { work } = placement;
  const id = `work:${work.slug}`;
  const { material, aspect, natural } = useArtMaterial(work);
  const inspecting = useGame((s) => s.inspecting === work.slug);
  const hidden = useGame((s) => !!s.hidden[id]);
  const cover = work.media[0];
  const video = useMuxVideoTexture(inspecting && cover.kind === 'mux' ? cover.playbackId : null);
  const root = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Mesh>(null);
  const hover = useRef(0);
  const { w, h } = fitSize(aspect ?? 1.5);
  const standH = 0.5;

  useEffect(() => {
    const u = material.uniforms;
    if (video) {
      const prev = u.map.value;
      u.map.value = video;
      u.uHasMap.value = 1;
      return () => {
        u.map.value = prev;
      };
    }
  }, [video, material]);

  useEffect(() => {
    material.uniforms.uSize.value.set(w, h);
  }, [material, w, h]);

  useEffect(
    () =>
      registerInteractable({
        id,
        name: work.title,
        catchTarget: 'frame',
        tone: 'work',
        layer: id,
        object: () => plane.current,
        examine: work.examine,
        approach: () => placement.approach,
        dimensions: () => (natural ? `${natural[0]} × ${natural[1]}` : `${Math.round(w * 400)} × ${Math.round(h * 400)}`),
        actions: [
          {
            verb: 'Inspect',
            approach: true,
            run: () => {
              inspectWork(work.slug);
              const center = new THREE.Vector3(placement.x, placement.y + standH + h / 2, placement.z);
              focusOn(center, placement.yaw, w, h);
            },
          },
          ...(work.links?.[0]
            ? [
                {
                  verb: 'Visit',
                  run: () => {
                    window.open(work.links![0].href, '_blank', 'noopener');
                  },
                },
              ]
            : []),
        ],
      }),
    [id, work, placement, w, h, natural]
  );

  useFrame((_, dt) => {
    const g = gameState();
    const t = tweaks();
    const isHover = runtime.hoverId === id && g.plugins.boundingBoxes;
    const isSelected = g.selected === id || g.inspecting === work.slug;
    hover.current = damp(hover.current, isHover || isSelected ? 1 : 0, 10, dt);
    applyFx(material, work, isHover ? 1 : 0, isSelected ? 1 : 0);
    if (lift.current) lift.current.position.y = standH + h / 2 + hover.current * t.Artboards.hoverLift;
    if (root.current) {
      const s = revealScale(placement.x, placement.z);
      root.current.scale.setScalar(Math.max(0.0001, s));
      root.current.visible = s > 0.001 && !hidden;
    }
  });

  return (
    <group ref={root} position={[placement.x, placement.y, placement.z]} rotation-y={placement.yaw}>
      {/* easel */}
      <mesh position={[-w * 0.32, standH / 2, -0.06]}>
        <boxGeometry args={[0.07, standH + 0.1, 0.07]} />
        <meshLambertMaterial color="#27272a" />
      </mesh>
      <mesh position={[w * 0.32, standH / 2, -0.06]}>
        <boxGeometry args={[0.07, standH + 0.1, 0.07]} />
        <meshLambertMaterial color="#27272a" />
      </mesh>
      <mesh position={[0, 0.03, -0.06]}>
        <boxGeometry args={[w * 0.8, 0.06, 0.4]} />
        <meshLambertMaterial color="#18181b" />
      </mesh>
      {/* node port, where the cables plug in */}
      <mesh position={[0, 0.06, 0.55]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.08, 0.14, 16]} />
        <meshBasicMaterial color="#fafafa" />
      </mesh>
      <group ref={lift} position-y={standH + h / 2}>
        <mesh ref={plane} material={material} userData={{ interactable: id }}>
          <planeGeometry args={[w, h]} />
        </mesh>
        <mesh position-z={-0.045}>
          <boxGeometry args={[w + 0.04, h + 0.04, 0.07]} />
          <meshLambertMaterial color="#111113" />
        </mesh>
        <Label
          text={work.title}
          height={0.17}
          position={[-w / 2, h / 2 + 0.15, 0.001]}
          options={{ color: '#a1a1aa', size: 64 }}
          opacity={tweaks().Artboards.labels}
        />
        {work.placeholder && (
          <Label
            text="placeholder"
            height={0.13}
            anchor="right"
            position={[w / 2, h / 2 + 0.15, 0.001]}
            options={{ color: '#fafafa', background: '#3b82f6', padding: 10, radius: 10, size: 48 }}
          />
        )}
      </group>
      <Revealed>
        <RigidBody type="fixed" colliders={false} position={[0, standH + h / 2, 0]}>
          <CuboidCollider args={[w / 2, h / 2 + standH / 2, 0.08]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

// ── art tree: the canopy is the piece ────────────────────────────────────────
function ArtTree({ placement }: { placement: WorkPlacement }) {
  const { work } = placement;
  const id = `work:${work.slug}`;
  const { material, natural } = useArtMaterial(work, true);
  const hidden = useGame((s) => !!s.hidden[id]);
  const root = useRef<THREE.Group>(null);
  const canopy = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const size = 2.1;
  const trunkH = 1.7;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seed = seedOf(work.slug);

  useEffect(() => {
    material.uniforms.uSize.value.set(size, size);
  }, [material]);

  useEffect(
    () =>
      registerInteractable({
        id,
        name: work.title,
        tone: 'work',
        layer: id,
        object: () => canopy.current,
        examine: work.examine,
        approach: () => placement.approach,
        dimensions: () => (natural ? `${natural[0]} × ${natural[1]}` : '1080 × 1080'),
        actions: [
          {
            verb: 'Inspect',
            approach: true,
            run: () => {
              inspectWork(work.slug);
              const center = new THREE.Vector3(placement.x, placement.y + trunkH + size / 2, placement.z);
              const yaw = Math.atan2(camera.position.x - placement.x, camera.position.z - placement.z);
              focusOn(center, yaw, size, size);
            },
          },
          {
            verb: 'Shake',
            approach: true,
            run: () => {
              emit({ type: 'burst', kind: 'sparkle', x: placement.x, y: placement.y + trunkH + 0.6, z: placement.z, count: 24 });
              gameState().say('You shake the tree. A few pixels fall out of the canopy.');
              gameState().addXp('shaders', 6);
            },
          },
        ],
      }),
    [id, work, placement, natural, camera]
  );

  useFrame((state, dt) => {
    const g = gameState();
    const isHover = runtime.hoverId === id && g.plugins.boundingBoxes;
    const isSelected = g.selected === id || g.inspecting === work.slug;
    applyFx(material, work, isHover ? 1 : 0, isSelected ? 1 : 0);
    if (root.current) {
      const s = revealScale(placement.x, placement.z);
      root.current.scale.setScalar(Math.max(0.0001, s));
      root.current.visible = s > 0.001 && !hidden;
    }
    if (canopy.current) {
      // Billboard around Y so the piece always faces you.
      const target = Math.atan2(camera.position.x - placement.x, camera.position.z - placement.z);
      canopy.current.rotation.y = target;
      const sway = Math.sin(state.clock.elapsedTime * 0.9 + seed) * 0.04 * tweaks().Flora.sway;
      canopy.current.rotation.z = sway;
    }
    if (leaves.current) {
      const t = state.clock.elapsedTime;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + t * 0.4 + seed;
        const r = size * 0.56 + Math.sin(t * 1.3 + i) * 0.06;
        dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.05);
        dummy.rotation.set(0, 0, a);
        dummy.scale.setScalar(0.07 + 0.03 * Math.sin(t * 2 + i));
        dummy.updateMatrix();
        leaves.current.setMatrixAt(i, dummy.matrix);
      }
      leaves.current.instanceMatrix.needsUpdate = true;
    }
    void dt;
  });

  const palette = work.media[0].kind === 'procedural' ? work.media[0].palette?.[1] ?? '#e879f9' : '#e879f9';

  return (
    <group ref={root} position={[placement.x, placement.y, placement.z]}>
      <mesh position-y={trunkH / 2}>
        <cylinderGeometry args={[0.07, 0.13, trunkH, 6]} />
        <meshLambertMaterial color="#5b4636" flatShading />
      </mesh>
      <group ref={canopy} position-y={trunkH + size / 2 - 0.1}>
        <mesh ref={disc} material={material} userData={{ interactable: id }}>
          <circleGeometry args={[size / 2, 40]} />
        </mesh>
        <mesh position-z={-0.03}>
          <circleGeometry args={[size / 2 + 0.03, 40]} />
          <meshBasicMaterial color="#111113" side={THREE.DoubleSide} />
        </mesh>
        <instancedMesh ref={leaves} args={[undefined, undefined, 9]}>
          <boxGeometry args={[1, 1, 0.3]} />
          <meshBasicMaterial color={palette} />
        </instancedMesh>
      </group>
      <Revealed>
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[trunkH / 2, 0.14]} position={[0, trunkH / 2, 0]} />
        </RigidBody>
      </Revealed>
    </group>
  );
}

export function Artboards() {
  const world = getWorld();
  return (
    <>
      {world.placements.map((p) =>
        p.display === 'tree' ? (
          <ArtTree key={p.work.slug} placement={p} />
        ) : (
          <WorkArtboard key={p.work.slug} placement={p} />
        )
      )}
    </>
  );
}
