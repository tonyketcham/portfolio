'use client';

/**
 * The camera rig (old-school orbit around the player), the intro director
 * that turns the house blueprint into a built house, and the travel director
 * that carries you between the house and the island.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { houseUniforms } from '../house/materials';
import { clamp, damp, dampAngle, lerp } from '../lib/random';
import { travelToWork } from '../state/actions';
import { emit, on, sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getHouse, PLACES, type PlaceId } from '../world/places';
import type { TilePos } from '../world/pathfinding';
import { globalUniforms } from './globals';
import { postState } from './PostStack';

const BLUEPRINT_PITCH = 1.53;
const WORLD_PITCH = 0.8;
const WORLD_YAW = 0.5;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function worldDistance(aspect: number) {
  return aspect < 0.8 ? 21 : 15;
}

/** Centre + size of the house plan, for framing the blueprint. */
function plan() {
  const L = getHouse().layout;
  return {
    centre: new THREE.Vector3(L.ox + L.width / 2, 0, L.oz + L.height / 2),
    w: L.width,
    h: L.height,
  };
}

const tmpTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const playerTarget = new THREE.Vector3();

export function CameraRig() {
  const { camera, size } = useThree();
  const cur = useRef({ yaw: 0, pitch: BLUEPRINT_PITCH, distance: 40, target: new THREE.Vector3(), ready: false });

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

  useFrame((_, rawDt) => {
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
    const P = plan();
    // the whole plan fits, with room for the editor chrome
    runtime.intro.baseDistance = Math.max((P.h * 1.25) / (2 * tanHalf), (P.w * 1.25) / (2 * tanHalf * aspect));

    playerTarget.copy(runtime.player.pos).y += 0.7;
    let yaw: number;
    let pitch: number;
    let distance: number;
    const target = tmpTarget;
    let lambda = t.Camera.follow;

    if (g.stage === 'boot' || g.stage === 'artboard') {
      const base = runtime.intro.baseDistance;
      cam.distance = clamp(cam.distance, base * 0.45, base * 3.2);
      target.copy(P.centre);
      yaw = 0;
      pitch = BLUEPRINT_PITCH;
      distance = cam.distance;
      lambda = 9;
    } else if (g.stage === 'unfolding') {
      const e = easeInOut(runtime.intro.unfold);
      target.lerpVectors(P.centre, playerTarget, e);
      yaw = lerp(0, cam.yaw, e);
      pitch = lerp(BLUEPRINT_PITCH, cam.pitch, e);
      distance = lerp(runtime.intro.baseDistance * 1.1, cam.distance, e);
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
    if (!c.ready || runtime.cam.snap) {
      runtime.cam.snap = false;
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
  });

  return null;
}

/** Drives boot → blueprint ('artboard') → unfolding (the house builds) → world. */
export function IntroDirector() {
  const stage = useGame((s) => s.stage);
  const { size } = useThree();
  const timer = useRef(0);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const aspect = () => sizeRef.current.width / Math.max(1, sizeRef.current.height);

  // Leaving boot: decide whether to play the intro.
  useEffect(() => {
    if (stage !== 'boot') return;
    const g = gameState();
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceIntro = params?.has('intro');
    const skip = !forceIntro && (g.introSeen || tweaks().Intro.skip || reduce || params?.has('skip') || params?.has('work'));
    const started = performance.now();
    // Every visit starts at home.
    runtime.location = 'house';
    g.setLocation('house');
    const id = window.setInterval(() => {
      // Wait for physics (wasm) and a beat for the boot screen to read.
      if (!runtime.physicsReady || performance.now() - started < 700) return;
      window.clearInterval(id);
      if (skip) enterWorld(true);
      else {
        houseUniforms.built.value = 0;
        runtime.cam.distance = runtime.intro.baseDistance;
        g.setStage('artboard');
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === 'artboard') {
      houseUniforms.built.value = 0;
      runtime.intro.unfold = 0;
      runtime.cam.distance = runtime.intro.baseDistance;
      timer.current = 0;
      runtime.cam.focus = null;
      runtime.location = 'house';
      gameState().setLocation('house');
      gameState().setBuildMode(false);
      const P = PLACES.house;
      gameState().appearAt(P.spawn);
    }
    if (stage === 'unfolding') {
      timer.current = 0;
      runtime.cam.yaw = WORLD_YAW;
      runtime.cam.pitch = WORLD_PITCH;
      runtime.cam.distance = worldDistance(aspect());
      sfx('unfold');
    }
  }, [stage]);

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
      houseUniforms.built.value = easeInOut(Math.min(1, u * 1.1));
      if (u > 0.1 && u - dt / t.Intro.unfoldSeconds <= 0.1) emit({ type: 'shake', amount: 0.5 });
      if (u >= 1) enterWorld(false);
    }
  });

  function enterWorld(skipped: boolean) {
    const g = gameState();
    houseUniforms.built.value = 1;
    globalUniforms.uUnfold.value = 1;
    runtime.intro.unfold = 1;
    runtime.location = 'house';
    g.setLocation('house');
    if (skipped) {
      runtime.cam.yaw = WORLD_YAW;
      runtime.cam.pitch = WORLD_PITCH;
      runtime.cam.distance = worldDistance(aspect());
      runtime.cam.snap = true;
      g.appearAt(PLACES.house.spawn);
    }
    const first = !g.introSeen;
    g.setStage('world');
    if (first) {
      g.say('Welcome to Untitled-1. This is your house.', 'fx');
      g.say(
        runtime.pointer.isTouch
          ? 'Tap to walk. Long-press anything for options. Drag to look around. The exit portal leads to the island.'
          : 'Click to walk. Right-click anything for options. Drag to look around. The exit portal leads to the island.',
        'system'
      );
      window.setTimeout(() => {
        if (gameState().addItem({ id: 'pixel' })) gameState().say('A loose pixel falls off the blueprint and into your pocket.');
      }, 1800);
    } else {
      g.say('Welcome home.', 'fx');
    }
    const deepLink = new URLSearchParams(window.location.search).get('work');
    if (deepLink) window.setTimeout(() => travelToWork(deepLink), 1100);
  }

  return null;
}

/**
 * Portal trips between the house and the island: dither the frame out to the
 * canvas, show the loading box, swap places, dither back in. The first time
 * you step onto the island it unfolds around you.
 */
export function TravelDirector() {
  const trip = useRef<null | { to: PlaceId; tile?: TilePos; onArrive?: () => void; t: number; swapped: boolean }>(null);

  useEffect(
    () =>
      on((e) => {
        if (e.type !== 'travel' || trip.current) return;
        trip.current = { to: e.to, tile: e.tile, onArrive: e.onArrive, t: 0, swapped: false };
        gameState().closeMenu();
        gameState().inspect(null);
      }),
    []
  );

  useFrame((_, rawDt) => {
    const tr = trip.current;
    if (!tr) return;
    const dt = Math.min(rawDt, 0.05);
    tr.t += dt;
    const OUT = 0.45;
    const HOLD = 0.5;
    const IN = 0.55;
    if (tr.t < OUT) {
      postState.fade = tr.t / OUT;
      return;
    }
    const g = gameState();
    if (!tr.swapped) {
      tr.swapped = true;
      postState.fade = 1;
      g.setLoading('Loading - please wait.');
      if (tr.to === 'island') g.setBuildMode(false);
      runtime.location = tr.to;
      g.setLocation(tr.to);
      const place = PLACES[tr.to];
      if (tr.to === 'island' && !g.islandVisited) {
        globalUniforms.uReveal.value = 0;
        g.setIslandVisited();
      }
      runtime.cam.focus = null;
      runtime.cam.snap = true;
      g.appearAt(tr.tile ?? place.spawn);
      return;
    }
    if (tr.t < OUT + HOLD) return;
    if (gameState().loading) g.setLoading(null);
    const u = Math.min(1, (tr.t - OUT - HOLD) / IN);
    postState.fade = 1 - u;
    // the island unfolds the first time you arrive
    if (tr.to === 'island' && globalUniforms.uReveal.value < 100) globalUniforms.uReveal.value = Math.min(100, globalUniforms.uReveal.value + dt * 34);
    if (u >= 1 && (tr.to !== 'island' || globalUniforms.uReveal.value >= 100)) {
      postState.fade = 0;
      const cb = tr.onArrive;
      trip.current = null;
      g.say(tr.to === 'island' ? 'You step out onto the island.' : 'You are home.', 'game');
      sfx('paste');
      cb?.();
    }
  });

  return null;
}
