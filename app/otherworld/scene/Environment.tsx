'use client';

/**
 * Sky dome, the infinite dot-grid canvas the island floats on (with the island
 * itself drawn as a selected layer), lights, and the clock that drives all of it.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { createSkyMaterial, createVoidMaterial } from '../shaders/environment';
import { runtime } from '../state/runtime';
import { gameState } from '../state/store';
import { applyTimeOfDay, globalUniforms, localTimeOfDay, srgbCached } from './globals';

// ── the canvas ───────────────────────────────────────────────────────────────
function CanvasVoid() {
  const material = useMemo(createVoidMaterial, []);
  useFrame(() => {
    const t = tweaks();
    material.uniforms.uRipple.value = t.World.voidRipples;
    material.uniforms.uDotSize.value = t.World.voidDotSize;
    (material.uniforms.uAccent.value as THREE.Vector3).copy(srgbCached(t.HUD.accent));
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-1.1} material={material} renderOrder={-1} name="void">
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

// ── the clock: time of day → every uniform, fog and light ────────────────────
function WorldClock() {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fog = useMemo(() => new THREE.Fog('#a5b4cf', 24, 78), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame((state, dt) => {
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
    globalUniforms.uFogNear.value = t.World.fogNear + zoomOffset;
    globalUniforms.uFogFar.value = t.World.fogFar + zoomOffset * 1.4;
    fog.color.setRGB(sky.fog.x, sky.fog.y, sky.fog.z, THREE.SRGBColorSpace);
    fog.near = globalUniforms.uFogNear.value;
    fog.far = globalUniforms.uFogFar.value;

    if (hemi.current) {
      hemi.current.color.setRGB(sky.top.x * 0.5 + 0.5, sky.top.y * 0.5 + 0.5, sky.top.z * 0.5 + 0.5, THREE.SRGBColorSpace);
      hemi.current.groundColor.setRGB(sky.ambient.x * 0.6, sky.ambient.y * 0.6, sky.ambient.z * 0.5, THREE.SRGBColorSpace);
      hemi.current.intensity = 0.9 + (1 - sky.night) * 0.5;
    }
    if (sun.current) {
      tmp.setRGB(sky.sun.x, sky.sun.y, sky.sun.z, THREE.SRGBColorSpace);
      sun.current.color.copy(tmp);
      sun.current.intensity = sky.sunIntensity * 1.9;
      sun.current.position.copy(sky.sunDir).multiplyScalar(50);
    }
    void state;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbeafe', '#3f3f46', 1.4]} />
      <directionalLight ref={sun} position={[20, 40, 10]} intensity={2} />
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
