import React, { useEffect, useSyncExternalStore } from 'react';
import { useFrame as fiberFrame, useStore } from '@react-three/fiber';
import * as THREE from 'three';
import { createGameClock } from './pause.mjs';
import { mountEditor } from './in-game.mjs';
import './in-game.css';

const state = globalThis.__OTHERWORLD_COPY_DEV__ ??= {
  paused: false, version: 0, listeners: new Set(), fields: new Map(), drafts: new Map(), saved: {}, roots: new Set(),
  clock: createGameClock(), contexts: new Set(), videos: new Set(), animations: new Set(), runtime: null, picker: null,
  capture: [], rendering: false, mounted: false, rafs: new Map(),
};
export const editorState = state;
state.media ??= new Set();
state.textOrigins ??= new Map();
state.rootCounts ??= new Map();
state.textures ??= new Map();
export function changed() {
  for (const [texture, entry] of state.textures) {
    const revision = JSON.stringify(entry.keys.map(current));
    if (revision !== entry.revision) {
      entry.paint(); texture.needsUpdate = true; entry.revision = revision;
      texture.userData.owText = entry.keys.map(current).join(' · ');
    }
  }
  state.version++; for (const listener of state.listeners) listener();
}
export function subscribe(listener) { state.listeners.add(listener); return () => state.listeners.delete(listener); }
export function usePause() { return useSyncExternalStore(subscribe, () => state.paused, () => false); }
function useRevision() { return useSyncExternalStore(subscribe, () => state.version, () => 0); }
export function copy(key, fallback, descriptor) {
  if (descriptor) state.fields.set(key, descriptor);
  for (const reads of state.capture) reads.add(key);
  return state.drafts.has(key) ? state.drafts.get(key) : Object.hasOwn(state.saved, key) ? state.saved[key].value : fallback;
}
export function current(key) { const descriptor = state.fields.get(key); return descriptor ? copy(key, descriptor.fallback) : ''; }
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
export function matches(text) {
  const origin = state.textOrigins.get(text);
  if (origin) return origin.keys;
  const wanted = normalize(text);
  if (!wanted) return [];
  const fields = [...state.fields.values()];
  const live = fields.filter((field) => normalize(current(field.key)) === wanted);
  return (live.length ? live : fields.filter((field) => normalize(field.fallback) === wanted)).map((field) => field.key);
}
export function template(evaluate) {
  const reads = new Set(); state.capture.push(reads);
  let text;
  try { text = evaluate(); } finally { state.capture.pop(); }
  state.textOrigins.set(text, { keys: [...reads], segments: [...reads].map((key) => [key, current(key)]) });
  // Bound history while retaining the messages from this play session.
  if (state.textOrigins.size > 2000) state.textOrigins.delete(state.textOrigins.keys().next().value);
  return text;
}
export function previewText(text) {
  const origin = state.textOrigins.get(text);
  if (!origin) return text;
  const segments = origin.segments.filter(([, value]) => value).sort((a, b) => b[1].length - a[1].length);
  if (!segments.length) return text;
  const pattern = new RegExp(segments.map(([, value]) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return text.replace(pattern, (part) => current(segments.find(([, value]) => value === part)[0]));
}
function CopyValue({ text, keys }) {
  useRevision();
  const ownership = React.useMemo(() => {
    const exact = keys?.length ? keys : typeof text === 'string' ? matches(text) : [];
    const field = exact.length === 1 ? state.fields.get(exact[0]) : null;
    return { keys: exact, whole: field && (text === field.fallback || text === current(field.key)) };
  }, [text, keys?.join(' ')]);
  if (typeof text !== 'string') return text;
  const exact = ownership.keys;
  const visible = ownership.whole ? current(exact[0]) : previewText(text);
  return exact.length ? React.createElement('span', { 'data-ow-copy': exact.join(' ') }, visible) : text;
}
export const value = (text, keys) => React.createElement(CopyValue, { text, keys });
function CapturedValue({ evaluate }) {
  useRevision();
  const reads = new Set(); state.capture.push(reads);
  let result;
  try { result = evaluate(); } finally { state.capture.pop(); }
  return value(result, [...reads]);
}
export function captured(evaluate) {
  const reads = new Set(); state.capture.push(reads);
  let result;
  try { result = evaluate(); } finally { state.capture.pop(); }
  // Keep structural JSX exactly where React expects it. Only text subscribes to drafts.
  return typeof result === 'string' ? React.createElement(CapturedValue, { evaluate }) : result;
}
// Canvas labels keep the same mesh and replace only their text texture.
export function labelProps(evaluate) {
  const reads = new Set(); state.capture.push(reads);
  let text;
  try { text = evaluate(); } finally { state.capture.pop(); }
  return { text, __copyKeys: reads.size ? [...reads] : matches(text) };
}
export function paint(evaluate) {
  const reads = new Set(); state.capture.push(reads);
  try { evaluate(); } finally { state.capture.pop(); }
  return [...reads];
}
export function registerCanvas(texture, keys, repaint) {
  if (!keys.length) return;
  texture.userData.owCopy = keys; texture.userData.owText = keys.map(current).join(' · ');
  state.textures.set(texture, { keys, paint: repaint, revision: JSON.stringify(keys.map(current)) });
  texture.addEventListener('dispose', () => state.textures.delete(texture));
}
export function useLabel(text, ownedKeys) {
  useRevision();
  const ownership = React.useMemo(() => {
    const keys = ownedKeys ?? matches(text), field = keys.length === 1 ? state.fields.get(keys[0]) : null;
    return { keys, whole: field && (text === field.fallback || text === current(field.key)) };
  }, [text, ownedKeys?.join(' ')]);
  return { text: ownership.whole ? current(ownership.keys[0]) : previewText(text), keys: ownership.keys };
}
export function setDraft(key, text) {
  const field = state.fields.get(key);
  const original = Object.hasOwn(state.saved, key) ? state.saved[key].value : field?.fallback ?? '';
  if (text === original) state.drafts.delete(key); else state.drafts.set(key, text);
  changed();
}
export function bindRuntime(runtime) { state.runtime = runtime; }
export function bindPicker(picker) { state.picker = picker; }
export const now = () => state.clock.now();
export const setTimeout = (...args) => state.clock.timeout(...args);
export const setInterval = (...args) => state.clock.interval(...args);
export const clearTimer = (id) => state.clock.clear(id);
export function raf(callback) {
  const id = state.clock.timeout(() => callback(now()), 1000 / 60);
  return id;
}
export const cancelRaf = clearTimer;
export function audio(context) { state.contexts.add(context); return context; }
export function video(element) {
  state.media.add(element);
  element.addEventListener('play', () => {
    if (state.paused) { state.videos.add(element); element.pause(); }
  });
  element.addEventListener('emptied', () => { if (!element.getAttribute('src')) state.media.delete(element); });
  return element;
}
export function useFrame(callback, priority) {
  const root = useStore();
  useEffect(() => {
    state.roots.add(root); state.rootCounts.set(root, (state.rootCounts.get(root) ?? 0) + 1);
    if (state.paused) pauseRoot(root, true);
    return () => {
      const count = state.rootCounts.get(root) - 1;
      if (count) state.rootCounts.set(root, count);
      else { state.rootCounts.delete(root); state.roots.delete(root); }
    };
  }, [root]);
  fiberFrame((frame, delta, xr) => {
    if (!state.paused || (state.rendering && priority === 1)) callback(frame, state.paused ? 0 : delta, xr);
  }, priority);
}
function pauseRoot(root, paused) {
  const frame = root.getState();
  if (paused && !root.__copyClock) {
    root.__copyClock = { elapsed: frame.clock.elapsedTime, frameloop: frame.frameloop };
    const nodeFrame = frame.gl._nodes?.nodeFrame;
    if (nodeFrame) {
      root.__copyClock.nodeUpdate = nodeFrame.update;
      nodeFrame.update = function frozenNodeFrame() { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); };
    }
    frame.clock.stop(); root.setState({ frameloop: 'never' });
  } else if (!paused && root.__copyClock) {
    frame.clock.start(); frame.clock.elapsedTime = root.__copyClock.elapsed;
    const nodeFrame = frame.gl._nodes?.nodeFrame;
    if (nodeFrame) { nodeFrame.update = root.__copyClock.nodeUpdate; nodeFrame.lastTime = performance.now(); }
    root.setState({ frameloop: root.__copyClock.frameloop }); frame.invalidate(); delete root.__copyClock;
  }
}
export function pause(paused) {
  if (state.paused === paused) return;
  if (paused) {
    // Finish captured pointer gestures before blocking the game's input handlers.
    state.runtime?.canvas?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
  }
  state.paused = paused; state.clock.pause(paused);
  for (const root of state.roots) pauseRoot(root, paused);
  if (paused) {
    for (const context of state.contexts) if (context.state === 'running') { context.__copyResume = true; context.suspend().catch(() => {}); }
    for (const video of new Set([...state.media, ...document.querySelectorAll('video')])) if (!video.paused) { state.videos.add(video); video.pause(); }
    for (const animation of document.getAnimations()) if (animation.playState === 'running') { state.animations.add(animation); animation.pause(); }
  } else {
    for (const context of state.contexts) if (context.__copyResume) { delete context.__copyResume; context.resume().catch(() => {}); }
    for (const video of state.videos) if (video.isConnected || state.media.has(video)) video.play().catch(() => {});
    state.videos.clear(); for (const animation of state.animations) animation.play(); state.animations.clear();
  }
  document.documentElement.toggleAttribute('data-copy-paused', paused); changed();
}
export function worldKeys(x, y) {
  const runtime = state.runtime;
  if (!runtime?.camera || !runtime.canvas) return { keys: [], name: '' };
  const rect = runtime.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), runtime.camera);
  for (const root of state.roots) {
    for (const hit of ray.intersectObjects(root.getState().scene.children, true)) {
      let visible = true;
      for (let parent = hit.object; parent; parent = parent.parent) if (!parent.visible) visible = false;
      if (!visible) continue;
      const provenance = hit.object.userData.owCopy?.length ? hit.object.userData : hit.object.material?.map?.userData;
      if (provenance?.owCopy?.length) return { keys: provenance.owCopy, name: provenance.owText };
      if (hit.object.material && !hit.object.material.transparent && hit.object.material.opacity > 0) break;
    }
  }
  const item = state.picker?.(x, y, 1, true)?.[0];
  if (!item) return { keys: [], name: '' };
  const reads = new Set(); state.capture.push(reads);
  let values;
  try { values = [item.name, item.examine, ...(item.actions ?? []).map((action) => action.verb)]; } finally { state.capture.pop(); }
  const keys = reads.size ? [...reads] : [...new Set(values.flatMap(matches))];
  return { keys, name: item.name };
}
export function renderFrozen() {
  if (!state.paused) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    state.rendering = true;
    try { for (const root of state.roots) { const frame = root.getState(); const elapsed = root.__copyClock?.elapsed ?? frame.clock.elapsedTime; frame.advance(elapsed, false); frame.clock.elapsedTime = elapsed; } }
    finally { state.rendering = false; }
  }));
}
export function mount() {
  if (typeof window === 'undefined' || state.mounted) return;
  state.mounted = true;
  window.setTimeout(() => mountEditor(), 0);
}
