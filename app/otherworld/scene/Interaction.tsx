'use client';

/**
 * One input system for mouse, touch and pen:
 *  tap / left-click   → default action (walk, inspect, talk…)
 *  long-press / right → old-school "Choose Option" menu
 *  drag               → orbit camera (or throw a physics prop you pressed on)
 *  pinch / wheel      → zoom (in the intro: zoom out to unfold)
 *  double-tap (intro) → "enter" the frame
 *  arrows / WASD      → rotate camera, +/- zoom, ⌘Z rewind physics
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { tweaks } from '../debug/tweaks';
import { clamp } from '../lib/random';
import { examine } from '../state/actions';
import { emit, sfx } from '../state/events';
import { interactableFor, place, runtime, type InteractAction, type Interactable } from '../state/runtime';
import { gameState, type MenuOption } from '../state/store';
import { placeAt } from '../world/places';
import { TileChannel } from './Terrain';

const raycaster = new THREE.Raycaster();
const heldKeys = new Set<string>();
const ndc = new THREE.Vector2();
const groundPoint = new THREE.Vector3();
const objPos = new THREE.Vector3();

export function displayName(it: Interactable) {
  return it.level ? `${it.name} (level-${it.level})` : it.name;
}

export function runAction(it: Interactable, action: InteractAction) {
  const g = gameState();
  g.closeMenu();
  if (action.approach && it.approach) {
    const tile = it.approach();
    if (tile) {
      g.walkTo(tile, action.run);
      return;
    }
  }
  action.run();
}

function setRay(clientX: number, clientY: number) {
  const el = runtime.canvas;
  const cam = runtime.camera;
  if (!el || !cam) return false;
  const r = el.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  return true;
}

const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

export function pickInteractables(clientX: number, clientY: number, limit = 4, includePassive = false): Interactable[] {
  if (!setRay(clientX, clientY)) return [];
  const g = gameState();
  const objects: THREE.Object3D[] = [];
  for (const it of runtime.interactables.values()) {
    if (it.passive && !includePassive) continue;
    if (it.layer && (g.hidden[it.layer] || g.locked[it.layer])) continue;
    const o = it.object();
    if (!o || !o.visible) continue;
    // only things in the place you're standing in (the other place is hidden, not gone)
    if (it.id !== 'player' && placeAt(...xz(o.getWorldPosition(objPos))).id !== runtime.location) continue;
    objects.push(o);
  }
  const hits = raycaster.intersectObjects(objects, true);
  const out: Interactable[] = [];
  for (const hit of hits) {
    if (!hit.object.visible) continue;
    const it = interactableFor(hit.object);
    if (it && !out.includes(it)) out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

export function pickGround(clientX: number, clientY: number) {
  if (!setRay(clientX, clientY)) return null;
  const P = place();
  const { origin, direction } = raycaster.ray;
  if (direction.y > -0.01) return null;
  let h = 0.2;
  for (let i = 0; i < 5; i++) {
    const t = (h - origin.y) / direction.y;
    groundPoint.copy(origin).addScaledVector(direction, t);
    h = P.heightAt(groundPoint.x, groundPoint.z);
  }
  const tile = P.worldToTile(groundPoint.x, groundPoint.z);
  return { point: groundPoint.clone(), tile, valid: P.inBounds(tile[0], tile[1]) };
}

function openMenuAt(x: number, y: number) {
  const g = gameState();
  if (g.stage !== 'world') return;
  const hits = pickInteractables(x, y, 4, true);
  const ground = pickGround(x, y);
  const options: MenuOption[] = [];
  for (const it of hits) {
    for (const action of it.actions) {
      options.push({ verb: action.verb, target: displayName(it), tone: it.tone, run: () => runAction(it, action) });
    }
  }
  if (ground?.valid) {
    const tile = ground.tile;
    options.push({ verb: 'Walk here', tone: 'plain', run: () => g.walkTo(tile) });
    if (g.plugins.tileMarkers) {
      const key = `${tile[0]},${tile[1]}`;
      options.push({
        verb: g.markers[key] ? 'Unmark tile' : 'Mark tile',
        tone: 'plain',
        run: () => {
          gameState().toggleMarker(key);
          gameState().closeMenu();
        },
      });
    }
  }
  for (const it of hits) {
    options.push({
      verb: 'Examine',
      target: displayName(it),
      tone: it.tone,
      run: () => {
        gameState().closeMenu();
        examine(it.examine);
      },
    });
  }
  options.push({ verb: 'Cancel', tone: 'plain', run: () => gameState().closeMenu() });
  g.openMenu({ x, y, options });
}

/** Which DialKit panel tunes the thing under the pointer. */
function dialPanelFor(it: Interactable | undefined): string {
  if (!it) return 'World';
  if (it.id === 'player') return 'Player';
  if (it.id.startsWith('furn:') || it.id.startsWith('hotspot:')) return 'House';
  if (it.id.startsWith('work:')) return 'Artboards';
  if (it.id.startsWith('critter:') || it.id.startsWith('letter:') || it.id.startsWith('drop:') || it.id.startsWith('shroom:'))
    return 'Physics';
  if (it.id.startsWith('butterfly:') || it.id.startsWith('fixture:fractal')) return 'Flora';
  return 'Modyfi stack';
}

function handleTap(x: number, y: number, alt = false) {
  const g = gameState();
  if (alt) {
    const it = pickInteractables(x, y, 1, true)[0];
    if (!g.dialOpen) g.setDialOpen(true);
    window.setTimeout(() => emit({ type: 'dial-target', panel: dialPanelFor(it) }), 60);
    return;
  }
  if (g.menu) {
    g.closeMenu();
    return;
  }
  if (g.inspecting) {
    g.inspect(null);
    emit({ type: 'release-camera' });
    return;
  }
  if (g.stage !== 'world') return;
  if (g.dialogue) g.setDialogue(null);

  const hits = pickInteractables(x, y, 1);
  if (hits[0]) {
    const it = hits[0];
    g.select(it.id);
    emit({ type: 'cross', x, y, color: 'red' });
    sfx('click');
    runAction(it, it.actions[0]);
    return;
  }
  const ground = pickGround(x, y);
  if (ground?.valid) {
    g.select(null);
    emit({ type: 'cross', x, y, color: 'yellow' });
    sfx('click', 0.8);
    runtime.lookTarget.copy(ground.point);
    g.walkTo(ground.tile);
  }
}

export function Interaction() {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    runtime.canvas = el;
    el.style.touchAction = 'none';

    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let mode: 'none' | 'tap' | 'rotate' | 'pinch' | 'drag' = 'none';
    let longTimer = 0;
    let longFired = false;
    let yaw0 = 0;
    let pitch0 = 0;
    let dist0 = 0;
    let pinch0 = 1;
    let angle0 = 0;
    let mid0y = 0;
    let dragging: Interactable | null = null;
    let dragCandidate: Interactable | null = null;
    const history: { t: number; p: THREE.Vector3 }[] = [];
    let lastTap = 0;
    let hoverQueued = false;
    let lastHoverTile: [number, number] | null = null;

    const pinchMetrics = () => {
      const [a, b] = [...pointers.values()];
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        midY: (a.y + b.y) / 2,
      };
    };

    const updateHover = () => {
      hoverQueued = false;
      const g = gameState();
      if (!runtime.pointer.inside || runtime.pointer.isTouch || g.stage !== 'world' || mode === 'drag') return;
      const hits = pickInteractables(runtime.pointer.x, runtime.pointer.y, 1);
      runtime.hoverId = hits[0]?.id ?? null;
      const ground = pickGround(runtime.pointer.x, runtime.pointer.y);
      if (lastHoverTile) place().tiles.set(lastHoverTile[0], lastHoverTile[1], TileChannel.Hover, false);
      lastHoverTile = null;
      if (ground?.valid) {
        runtime.hoverTile = ground.tile;
        runtime.lookTarget.copy(ground.point);
        runtime.lookActive = 1;
        if (!hits[0] && g.plugins.destinationTile) {
          place().tiles.set(ground.tile[0], ground.tile[1], TileChannel.Hover, true);
          lastHoverTile = ground.tile;
        }
      } else {
        runtime.hoverTile = null;
      }
    };

    const onDown = (e: PointerEvent) => {
      runtime.pointer.isTouch = e.pointerType === 'touch';
      runtime.pointer.x = e.clientX;
      runtime.pointer.y = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      window.clearTimeout(longTimer);
      longFired = false;

      if (pointers.size === 2) {
        if (mode === 'drag' && dragging) {
          dragging.drag?.end(new THREE.Vector3());
          dragging = null;
          runtime.draggingId = null;
        }
        mode = 'pinch';
        const m = pinchMetrics();
        pinch0 = m.dist;
        angle0 = m.angle;
        mid0y = m.midY;
        dist0 = runtime.cam.distance;
        yaw0 = runtime.cam.yaw;
        pitch0 = runtime.cam.pitch;
        return;
      }
      if (pointers.size > 2) return;

      if (e.pointerType === 'mouse' && e.button === 2) {
        mode = 'none';
        openMenuAt(e.clientX, e.clientY);
        return;
      }
      if (e.pointerType === 'mouse' && e.button === 1) {
        mode = 'rotate';
        yaw0 = runtime.cam.yaw;
        pitch0 = runtime.cam.pitch;
        return;
      }
      mode = 'tap';
      const g = gameState();
      dragCandidate = null;
      if (g.stage === 'world' && g.tool === 'move') {
        const top = pickInteractables(e.clientX, e.clientY, 1)[0];
        if (top?.drag) dragCandidate = top;
      }
      longTimer = window.setTimeout(() => {
        if (mode !== 'tap') return;
        longFired = true;
        navigator.vibrate?.(12);
        openMenuAt(e.clientX, e.clientY);
      }, 480);
    };

    const onMove = (e: PointerEvent) => {
      runtime.pointer.x = e.clientX;
      runtime.pointer.y = e.clientY;
      runtime.pointer.inside = true;
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (!hoverQueued) {
          hoverQueued = true;
          requestAnimationFrame(updateHover);
        }
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      const t = tweaks();
      const g = gameState();

      if (mode === 'pinch' && pointers.size >= 2) {
        const m = pinchMetrics();
        runtime.cam.distance = dist0 * (pinch0 / Math.max(10, m.dist));
        if (g.stage === 'world') {
          runtime.cam.yaw = yaw0 - (m.angle - angle0);
          runtime.cam.pitch = pitch0 + (m.midY - mid0y) * 0.004;
        }
        return;
      }
      const dx = p.x - p.sx;
      const dy = p.y - p.sy;
      const threshold = e.pointerType === 'touch' ? 10 : 6;
      if (mode === 'tap' && Math.hypot(dx, dy) > threshold) {
        window.clearTimeout(longTimer);
        if (dragCandidate) {
          mode = 'drag';
          dragging = dragCandidate;
          runtime.draggingId = dragging.id;
          gameState().select(dragging.id);
          dragging.drag?.begin();
          history.length = 0;
        } else {
          mode = 'rotate';
          yaw0 = runtime.cam.yaw;
          pitch0 = runtime.cam.pitch;
        }
      }
      if (mode === 'rotate') {
        if (g.stage !== 'world') return;
        const speed = t.Camera.rotateSpeed;
        runtime.cam.yaw = yaw0 - (p.x - p.sx) * 0.0075 * speed;
        runtime.cam.pitch = pitch0 + (p.y - p.sy) * 0.005 * speed;
      } else if (mode === 'drag' && dragging) {
        const ground = pickGround(e.clientX, e.clientY);
        if (ground) {
          const target = ground.point.clone();
          target.y += 1.3;
          dragging.drag?.move(target);
          history.push({ t: performance.now(), p: target });
          if (history.length > 12) history.shift();
        }
      }
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      window.clearTimeout(longTimer);
      if (!p) return;
      if (mode === 'tap' && !longFired && !cancelled) {
        const g = gameState();
        const now = performance.now();
        if (g.stage === 'artboard' && now - lastTap < 350) g.setStage('unfolding');
        lastTap = now;
        handleTap(e.clientX, e.clientY, e.altKey);
      }
      if (mode === 'drag' && dragging) {
        const v = new THREE.Vector3();
        if (history.length >= 2) {
          const now = performance.now();
          const recent = history.filter((h) => now - h.t < 120);
          if (recent.length >= 2) {
            const a = recent[0];
            const b = recent[recent.length - 1];
            const dt = Math.max(0.016, (b.t - a.t) / 1000);
            v.subVectors(b.p, a.p).divideScalar(dt);
            v.clampLength(0, 18);
          }
        }
        dragging.drag?.end(v);
        if (v.length() > 6) gameState().addXp('physics', Math.round(v.length()));
        dragging = null;
        runtime.draggingId = null;
      }
      if (pointers.size === 0) mode = 'none';
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);
    const onLeave = () => {
      runtime.pointer.inside = false;
      runtime.hoverId = null;
      runtime.lookActive = 0;
      if (lastHoverTile) place().tiles.set(lastHoverTile[0], lastHoverTile[1], TileChannel.Hover, false);
      lastHoverTile = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      runtime.cam.distance *= Math.exp(clamp(delta, -120, 120) * 0.0016);
    };
    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
      window.clearTimeout(longTimer);
    };
  }, [gl]);

  // Keyboard camera, old-school arrows.
  useEffect(() => {
    const keys = heldKeys;
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        emit({ type: 'rewind' });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      keys.add(e.key.toLowerCase());
      if (e.key === '=' || e.key === '+') runtime.cam.distance *= 0.85;
      if (e.key === '-' || e.key === '_') runtime.cam.distance *= 1.18;
      if (e.key === 'Escape') {
        const g = gameState();
        if (g.menu) g.closeMenu();
        else if (g.inspecting) {
          g.inspect(null);
          emit({ type: 'release-camera' });
        } else if (g.dialogue) g.setDialogue(null);
        else if (g.tab) g.setTab(null);
        else g.select(null);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame((_, dt) => {
    const keys = heldKeys;
    if (!keys.size || gameState().stage !== 'world') return;
    const speed = 1.8 * tweaks().Camera.rotateSpeed * Math.min(dt, 0.05);
    if (keys.has('arrowleft') || keys.has('a')) runtime.cam.yaw -= speed;
    if (keys.has('arrowright') || keys.has('d')) runtime.cam.yaw += speed;
    if (keys.has('arrowup') || keys.has('w')) runtime.cam.pitch += speed * 0.6;
    if (keys.has('arrowdown') || keys.has('s')) runtime.cam.pitch -= speed * 0.6;
  });

  return null;
}
