'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { runtime } from '../state/runtime';
import type { Tone } from '../state/store';

const v = new THREE.Vector3();

/** World → CSS pixels relative to the canvas. */
export function project(p: THREE.Vector3) {
  const cam = runtime.camera;
  const el = runtime.canvas;
  if (!cam || !el) return null;
  v.copy(p).project(cam);
  if (v.z > 1) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z };
}

/** requestAnimationFrame loop for DOM overlays that track the 3D world. */
export function useRaf(callback: (dt: number) => void) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      try {
        cb.current(dt);
      } catch (error) {
        console.error('[otherworld] overlay loop', error);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

export const TONE_COLOR: Record<Tone, string> = {
  npc: '#ffff00',
  object: '#00ffff',
  item: '#ff9040',
  work: '#60a5fa',
  player: '#ffffff',
  plain: '#ffffff',
  zone: '#ff981f',
};

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

/** Long-press (touch) or right-click (mouse) on a DOM element. */
export function longPressHandlers(onLong: (x: number, y: number) => void, onTap?: () => void) {
  let timer = 0;
  let fired = false;
  let sx = 0;
  let sy = 0;
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      fired = false;
      sx = e.clientX;
      sy = e.clientY;
      if (e.button === 2) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fired = true;
        navigator.vibrate?.(10);
        onLong(sx, sy);
      }, 450);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) window.clearTimeout(timer);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      window.clearTimeout(timer);
      if (e.button === 2) return;
      if (!fired) onTap?.();
    },
    onPointerCancel: () => window.clearTimeout(timer),
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      window.clearTimeout(timer);
      onLong(e.clientX, e.clientY);
    },
  };
}
