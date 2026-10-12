'use client';

/**
 * The camera rig (old-school orbit around the player) and the intro director
 * that turns a flat design-tool artboard into the island.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { HERO_CENTER, HERO_SIZE } from '../lib/hero';
import { clamp, damp, dampAngle, lerp } from '../lib/random';
import { travelToWork } from '../state/actions';
import { emit, on, sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { globalUniforms } from './globals';


const ARTBOARD_PITCH = 1.535;
const WORLD_PITCH = 0.8;
const WORLD_YAW = 0.5;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function worldDistance(aspect: number) {
  return aspect < 0.8 ? 23 : 15;
}

const tmpTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const playerTarget = new THREE.Vector3();

export function CameraRig() {
  const { camera, size } = useThree();
  const cur = useRef({ yaw: 0, pitch: ARTBOARD_PITCH, distance: 9, target: HERO_CENTER.clone(), ready: false });

  useEffect(() => {
    runtime.camera = camera as THREE.PerspectiveCamera;
  }, [camera]);

  useEffect(
    () =>
      on((e) => {
        if (e.type === 'shake') runtime.cam.shake = Math.min(1, runtime.cam.shake + e.amount);
        if (e.type === 'focus-camera')
          runtime.cam.focus = {
            target: new THREE.Vector3(e.x, e.y, e.z),
            distance: e.distance ?? 6,
            yaw: e.yaw ?? runtime.cam.yaw,
            pitch: e.pitch ?? 0.25,
          };
        if (e.type === 'release-camera') runtime.cam.focus = null;
      }),
    []
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = tweaks();
    const g = gameState();
    const cam = runtime.cam;
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(persp.fov - t.Camera.fov) > 0.01) {
      persp.fov = t.Camera.fov;
      persp.updateProjectionMatrix();
    }
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2);
    runtime.intro.baseDistance = Math.max(
      (HERO_SIZE.h * 1.3) / (2 * tanHalf),
      (HERO_SIZE.w * 1.12) / (2 * tanHalf * aspect)
    );

    playerTarget.copy(runtime.player.pos).y += 0.7;
    let yaw: number;
    let pitch: number;
    let distance: number;
    const target = tmpTarget;
    let lambda = t.Camera.follow;

    if (g.stage === 'boot' || g.stage === 'artboard') {
      const base = runtime.intro.baseDistance;
      cam.distance = clamp(cam.distance, base * 0.45, base * 3.2);
      target.copy(HERO_CENTER);
      yaw = 0;
      pitch = ARTBOARD_PITCH;
      distance = cam.distance;
      lambda = 9;
    } else if (g.stage === 'unfolding') {
      const e = easeInOut(runtime.intro.unfold);
      target.lerpVectors(HERO_CENTER, playerTarget, e);
      yaw = lerp(0, cam.yaw, e);
      pitch = lerp(ARTBOARD_PITCH, cam.pitch, e);
      distance = lerp(runtime.intro.baseDistance * 2, cam.distance, e);
      lambda = 12;
    } else if (cam.focus) {
      target.copy(cam.focus.target);
      yaw = cam.focus.yaw;
      pitch = cam.focus.pitch;
      distance = cam.focus.distance;
      lambda = 4.5;
    } else {
      cam.pitch = clamp(cam.pitch, t.Camera.pitchMin, t.Camera.pitchMax);
      cam.distance = clamp(cam.distance, t.Camera.zoomMin, t.Camera.zoomMax);
      target.copy(playerTarget);
      yaw = cam.yaw;
      pitch = cam.pitch;
      distance = cam.distance;
    }

    const c = cur.current;
    if (!c.ready) {
      c.yaw = yaw;
      c.pitch = pitch;
      c.distance = distance;
      c.target.copy(target);
      c.ready = true;
    }
    c.yaw = dampAngle(c.yaw, yaw, lambda, dt);
    c.pitch = damp(c.pitch, pitch, lambda, dt);
    c.distance = damp(c.distance, distance, lambda * 0.8, dt);
    c.target.x = damp(c.target.x, target.x, lambda, dt);
    c.target.y = damp(c.target.y, target.y, lambda, dt);
    c.target.z = damp(c.target.z, target.z, lambda, dt);

    const cp = Math.cos(c.pitch);
    tmpPos.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp).multiplyScalar(c.distance).add(c.target);
    cam.shake = damp(cam.shake, 0, 6, dt);
    const shake = cam.shake * t.Camera.shake * 0.25;
    if (shake > 0.001) {
      tmpPos.x += (Math.random() - 0.5) * shake;
      tmpPos.y += (Math.random() - 0.5) * shake;
      tmpPos.z += (Math.random() - 0.5) * shake;
    }
    camera.position.copy(tmpPos);
    camera.lookAt(c.target);
    void state;
  });

  return null;
}

/** Drives boot → artboard → unfolding → world. */
export function IntroDirector() {
  const stage = useGame((s) => s.stage);
  const { size } = useThree();
  const timer = useRef(0);

  // Leaving boot: decide whether to play the intro.
  useEffect(() => {
    if (stage !== 'boot') return;
    const g = gameState();
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceIntro = params?.has('intro');
    const skip = !forceIntro && (g.introSeen || tweaks().Intro.skip || reduce || params?.has('skip') || params?.has('work'));
    const started = performance.now();
    const id = window.setInterval(() => {
      // Wait for physics (wasm) and a beat for the boot screen to read.
      if (!runtime.physicsReady || performance.now() - started < 700) return;
      window.clearInterval(id);
      if (skip) {
        enterWorld(true);
      } else {
        globalUniforms.uReveal.value = 0;
        runtime.cam.distance = runtime.intro.baseDistance;
        g.setStage('artboard');
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === 'artboard') {
      globalUniforms.uReveal.value = 0;
      runtime.intro.unfold = 0;
      runtime.cam.distance = runtime.intro.baseDistance;
      timer.current = 0;
      runtime.cam.focus = null;
    }
    if (stage === 'unfolding') {
      timer.current = 0;
      runtime.cam.yaw = WORLD_YAW;
      runtime.cam.pitch = WORLD_PITCH;
      runtime.cam.distance = worldDistance(size.width / Math.max(1, size.height));
      sfx('unfold');
    }
  }, [stage, size]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = gameState();
    const t = tweaks();
    if (g.stage === 'artboard') {
      timer.current += dt;
      const zoomedOut = runtime.cam.distance > runtime.intro.baseDistance * 1.9;
      if (zoomedOut || timer.current > t.Intro.autoUnfold || t.Intro.skip) g.setStage('unfolding');
    } else if (g.stage === 'unfolding') {
      timer.current += dt;
      const u = Math.min(1, timer.current / t.Intro.unfoldSeconds);
      runtime.intro.unfold = u;
      globalUniforms.uUnfold.value = u;
      globalUniforms.uReveal.value = easeInOut(Math.min(1, u * 1.15)) * 82;
      if (u > 0.12 && u - dt / t.Intro.unfoldSeconds <= 0.12) emit({ type: 'shake', amount: 0.6 });
      if (u >= 1) enterWorld(false);
    }
  });

  function enterWorld(skipped: boolean) {
    const g = gameState();
    globalUniforms.uReveal.value = 100;
    globalUniforms.uUnfold.value = 1;
    runtime.intro.unfold = 1;
    if (skipped) {
      runtime.cam.yaw = WORLD_YAW;
      runtime.cam.pitch = WORLD_PITCH;
      runtime.cam.distance = worldDistance(size.width / Math.max(1, size.height));
    }
    const first = !g.introSeen;
    g.setStage('world');
    if (first) {
      g.say('Welcome to Untitled-1.', 'fx');
      g.say(
        runtime.pointer.isTouch
          ? 'Tap to walk. Long-press anything for options. Drag to look around.'
          : 'Click to walk. Right-click anything for options. Drag to look around.',
        'system'
      );
      window.setTimeout(() => {
        if (gameState().addItem({ id: 'pixel' })) gameState().say('A loose pixel falls off the artboard and into your pocket.');
      }, 1800);
    } else {
      g.say('Welcome back to Untitled-1.', 'fx');
    }
    const deepLink = new URLSearchParams(window.location.search).get('work');
    if (deepLink) window.setTimeout(() => travelToWork(deepLink), 1100);
  }

  return null;
}
