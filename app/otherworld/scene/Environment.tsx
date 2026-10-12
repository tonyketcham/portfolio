'use client';

/**
 * Sky dome, the infinite dot-grid canvas everything floats on (with the
 * current place drawn as a selected layer), the sun + sky light, fog, and the
 * clock that drives all of it.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { tweaks } from '../debug/tweaks';
import { getHouse } from '../world/places';
import { ISLAND_RADIUS } from '../world/map';
import { createSkyMaterial, createVoidMaterial, voidUniforms } from '../shaders/environment';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { applyTimeOfDay, globalUniforms, localTimeOfDay } from './globals';

// ── the canvas ───────────────────────────────────────────────────────────────
function CanvasVoid() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(createVoidMaterial, []);
  useFrame(({ camera }) => {
    const t = tweaks();
    voidUniforms.ripple.value = t.World.voidRipples;
    voidUniforms.dotSize.value = t.World.voidDotSize;
    globalUniforms.uAccent.value.set(t.HUD.accent);
    // The plane follows the camera in whole-dot steps, so it never ends.
    if (ref.current) {
      ref.current.position.x = Math.round(camera.position.x);
      ref.current.position.z = Math.round(camera.position.z);
    }
    if (runtime.location === 'house') {
      const L = getHouse().layout;
      voidUniforms.selCenter.value.set(L.ox + L.width / 2, L.oz + L.height / 2);
      voidUniforms.selHalf.value = Math.max(L.width, L.height) / 2 + 2;
      voidUniforms.origin.value.copy(voidUniforms.selCenter.value);
      voidUniforms.sel.value = gameState().buildMode ? 1 : 0.65;
    } else {
      voidUniforms.selCenter.value.set(0, 0);
      voidUniforms.selHalf.value = ISLAND_RADIUS + 2.5;
      voidUniforms.origin.value.set(0, 0);
      voidUniforms.sel.value = 0.65;
    }
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={-1.1} material={material} renderOrder={-1} name="void">
      <planeGeometry args={[480, 480, 1, 1]} />
    </mesh>
  );
}

// ── the sky ──────────────────────────────────────────────────────────────────
function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(createSkyMaterial, []);
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={material} renderOrder={-2} frustumCulled={false} name="sky">
      <sphereGeometry args={[300, 24, 16]} />
    </mesh>
  );
}

const white = new THREE.Color(1, 1, 1);

// ── the clock: time of day → every uniform, fog and light ────────────────────
function WorldClock() {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fog = useMemo(() => new THREE.Fog('#a5b4cf', 24, 78), []);

  useEffect(() => {
    scene.fog = fog;
    const s = sun.current;
    if (s) {
      s.shadow.mapSize.set(2048, 2048);
      const c = s.shadow.camera;
      c.left = -24;
      c.right = 24;
      c.top = 24;
      c.bottom = -24;
      c.near = 1;
      c.far = 140;
      s.shadow.bias = -0.0008;
      s.shadow.normalBias = 0.03;
      scene.add(s.target);
    }
    return () => {
      scene.fog = null;
      if (s) scene.remove(s.target);
    };
  }, [scene, fog]);

  useFrame((_, dt) => {
    const t = tweaks();
    const g = gameState();
    globalUniforms.uTime.value += Math.min(dt, 0.1);
    const tod = g.plugins.localSky && t.World.followLocalTime ? localTimeOfDay() : t.World.timeOfDay;
    const sky = applyTimeOfDay(tod);

    const mushroomTarget = Math.max(
      t['Modyfi stack'].mushroom,
      performance.now() < g.mushroomUntil ? Math.min(1, (g.mushroomUntil - performance.now()) / 3000) : 0
    );
    globalUniforms.uMushroom.value += (mushroomTarget - globalUniforms.uMushroom.value) * Math.min(1, dt * 2);

    // Fog rides with the zoom so the player's surroundings are always clear.
    const zoomOffset = Math.max(0, runtime.cam.distance - 15);
    const inHouse = runtime.location === 'house';
    globalUniforms.uFogNear.value = t.World.fogNear + zoomOffset + (inHouse ? 8 : 0);
    globalUniforms.uFogFar.value = t.World.fogFar + zoomOffset * 1.4 + (inHouse ? 20 : 0);
    fog.color.copy(sky.fog);
    fog.near = globalUniforms.uFogNear.value;
    fog.far = globalUniforms.uFogFar.value;

    const P = runtime.player.pos;
    if (hemi.current) {
      hemi.current.color.copy(sky.top).lerp(white, 0.55);
      hemi.current.groundColor.copy(sky.ambient).multiplyScalar(0.7);
      hemi.current.intensity = t.World.sky * (0.85 + (1 - sky.night) * 0.4);
    }
    if (sun.current) {
      const s = sun.current;
      s.color.copy(sky.sun);
      s.intensity = sky.sunIntensity * t.World.sun * (inHouse ? t.House.interiorSun : 1);
      // the shadow frustum follows the player
      s.target.position.set(P.x, 0, P.z);
      s.position.copy(s.target.position).addScaledVector(sky.sunDir, 60);
      s.castShadow = t.World.shadows;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbeafe', '#3f3f46', 1.2]} />
      <directionalLight ref={sun} position={[20, 40, 10]} intensity={2} castShadow />
    </>
  );
}

export function Environment() {
  return (
    <>
      <WorldClock />
      <Sky />
      <CanvasVoid />
    </>
  );
}
