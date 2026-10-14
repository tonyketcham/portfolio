'use client';

/**
 * DOM overlays glued to the 3D world: design-tool selection boxes, overhead
 * speech, the yellow/red click crosses, mouseover text and the FPS counter.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTweaks } from '../debug/tweaks';
import { displayName } from '../scene/Interaction';
import { on } from '../state/events';
import { prayerById } from '../state/prayers';
import { runtime } from '../state/runtime';
import { itemName } from '../state/items';
import { gameState, useGame } from '../state/store';
import { charOffset, chatColorAt, isPerChar, parseChatEffects, type ChatEffects } from './chatEffects';
import { PixelSprite } from './icons';
import { project, TONE_COLOR, useRaf } from './util';

const box = new THREE.Box3();
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());

/** Screen-space bounding box of any interactable, with handles + labels. */
export function SelectionOverlay({ forceId }: { forceId?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const nameEl = useRef<HTMLSpanElement>(null);
  const dimEl = useRef<HTMLSpanElement>(null);
  const enabled = useTweaks((t) => t.HUD.selectionBoxes);
  const plugin = useGame((s) => s.plugins.boundingBoxes);

  useRaf(() => {
    const div = el.current;
    if (!div) return;
    const g = gameState();
    const id = forceId ?? runtime.draggingId ?? runtime.hoverId ?? (g.inspecting ? null : g.selected);
    const it = id ? runtime.interactables.get(id) : undefined;
    const obj = it?.object();
    if (!it || !obj || !obj.visible || !enabled || (!plugin && !forceId)) {
      div.style.opacity = '0';
      return;
    }
    box.setFromObject(obj);
    if (box.isEmpty()) {
      div.style.opacity = '0';
      return;
    }
    const { min, max } = box;
    corners[0].set(min.x, min.y, min.z);
    corners[1].set(max.x, min.y, min.z);
    corners[2].set(min.x, max.y, min.z);
    corners[3].set(max.x, max.y, min.z);
    corners[4].set(min.x, min.y, max.z);
    corners[5].set(max.x, min.y, max.z);
    corners[6].set(min.x, max.y, max.z);
    corners[7].set(max.x, max.y, max.z);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of corners) {
      const p = project(c);
      if (!p) {
        div.style.opacity = '0';
        return;
      }
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const pad = 4;
    div.style.opacity = '1';
    div.style.transform = `translate(${x0 - pad}px, ${y0 - pad}px)`;
    div.style.width = `${Math.max(8, x1 - x0 + pad * 2)}px`;
    div.style.height = `${Math.max(8, y1 - y0 + pad * 2)}px`;
    div.dataset.dragging = runtime.draggingId === id ? 'true' : 'false';
    if (nameEl.current) nameEl.current.textContent = displayName(it);
    if (dimEl.current) dimEl.current.textContent = it.dimensions?.() ?? `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`;
  });

  return (
    <div ref={el} className="ow-sel" aria-hidden>
      <span ref={nameEl} className="ow-sel-name" />
      <span ref={dimEl} className="ow-sel-dim" />
      {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => (
        <i key={h} className={`ow-sel-h ow-sel-${h}`} />
      ))}
    </div>
  );
}

interface OverheadSlot {
  raw: string;
  fx: ChatEffects;
  start: number;
  chars: HTMLSpanElement[];
}

/** Rebuild a pooled overhead div for new text: per-word, per-char spans when a motion needs them. */
function fillOverhead(div: HTMLDivElement, raw: string, now: number): OverheadSlot {
  const fx = parseChatEffects(raw);
  const chars: HTMLSpanElement[] = [];
  div.dataset.motion = fx.motion ?? '';
  if (isPerChar(fx.motion)) {
    div.textContent = '';
    for (const [w, word] of fx.text.split(' ').entries()) {
      if (w > 0) div.append(' ');
      const wordEl = document.createElement('span');
      wordEl.className = 'ow-overhead-word';
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'ow-overhead-char';
        c.textContent = ch;
        wordEl.append(c);
        chars.push(c);
      }
      div.append(wordEl);
    }
  } else {
    div.textContent = fx.text;
  }
  return { raw, fx, start: now, chars };
}

/** Yellow speech over the player, plus NPC / object lines. Supports `red:wave:` style prefixes. */
export function Overheads() {
  const pool = useRef<(HTMLDivElement | null)[]>([]);
  const slots = useRef<(OverheadSlot | null)[]>([]);
  const anchor = useRef(new THREE.Vector3());

  useRaf(() => {
    const now = performance.now();
    const items: { text: string; pos: THREE.Vector3 | null; color?: string; until: number; lift?: number }[] = [];
    if (runtime.overhead.until > now && runtime.overhead.text) {
      anchor.current.copy(runtime.player.pos).y += 2.1;
      // Speech sits above the overhead prayer when one is up.
      const lift = gameState().prayer ? PRAYER_PX : 0;
      items.push({ text: runtime.overhead.text, pos: anchor.current.clone(), until: runtime.overhead.until, lift });
    }
    for (const [id, o] of runtime.overheads) {
      if (o.until < now) {
        runtime.overheads.delete(id);
        continue;
      }
      items.push({ text: o.text, pos: o.anchor(), color: o.color, until: o.until });
    }
    pool.current.forEach((div, i) => {
      if (!div) return;
      const item = items[i];
      const p = item?.pos ? project(item.pos) : null;
      if (!item || !p) {
        div.style.opacity = '0';
        return;
      }
      let slot = slots.current[i];
      if (!slot || slot.raw !== item.text) slot = slots.current[i] = fillOverhead(div, item.text, now);
      const { fx } = slot;
      const t = (now - slot.start) / 1000;
      const total = Math.max(0.001, (item.until - slot.start) / 1000);
      const progress = Math.min(1, t / total);

      let dx = 0;
      let dy = -(item.lift ?? 0);
      let alpha = 1;
      if (fx.motion === 'scroll') {
        // Enters from the right, drifts through the anchor, exits left.
        dx = (1 - 2 * progress) * (div.offsetWidth / 2 + 60);
      } else if (fx.motion === 'slide') {
        const inT = Math.min(1, t / 0.3);
        const outT = Math.min(1, (total - t) / 0.3);
        dy -= (1 - inT) * 18 + (1 - outT) * 18;
        alpha = Math.min(inT, outT);
      } else if (isPerChar(fx.motion)) {
        slot.chars.forEach((c, ci) => {
          const [x, y] = charOffset(fx.motion!, ci, t, progress);
          c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        });
      }

      div.style.opacity = String(alpha);
      div.style.color = chatColorAt(fx.color, t, item.color ?? '#ffff00');
      div.style.transform = `translate(${p.x + dx}px, ${p.y + dy}px) translate(-50%, -100%)`;
    });
  });

  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} ref={(d) => void (pool.current[i] = d)} className="ow-overhead" aria-live="polite" />
      ))}
    </>
  );
}

/** Screen pixels the overhead prayer icon takes up above the head. */
const PRAYER_PX = 40;

/** The active overhead prayer, floating above the player's head. */
export function OverheadPrayer() {
  const id = useGame((s) => s.prayer);
  const el = useRef<HTMLDivElement>(null);
  const anchor = useRef(new THREE.Vector3());
  const prayer = id ? prayerById.get(id) : undefined;

  useRaf(() => {
    const div = el.current;
    if (!div) return;
    anchor.current.copy(runtime.player.pos).y += 2.1;
    const p = project(anchor.current);
    if (!p) {
      div.style.opacity = '0';
      return;
    }
    div.style.opacity = '1';
    div.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  });

  if (!prayer) return null;
  return (
    <div ref={el} className="ow-overhead-prayer" title={prayer.name} aria-label={prayer.name}>
      <PixelSprite rows={prayer.sprite} palette={prayer.palette} size={PRAYER_PX - 4} />
    </div>
  );
}

interface Cross {
  id: number;
  x: number;
  y: number;
  color: 'yellow' | 'red';
}

export function ClickCrosses() {
  const [crosses, setCrosses] = useState<Cross[]>([]);
  useEffect(() => {
    let seq = 0;
    return on((e) => {
      if (e.type !== 'cross') return;
      const c = { id: seq++, x: e.x, y: e.y, color: e.color };
      setCrosses((cs) => [...cs.slice(-3), c]);
      window.setTimeout(() => setCrosses((cs) => cs.filter((x) => x.id !== c.id)), 420);
    });
  }, []);
  return (
    <>
      {crosses.map((c) => (
        <svg
          key={c.id}
          className={`ow-cross ow-cross-${c.color}`}
          style={{ left: c.x, top: c.y }}
          width="18"
          height="18"
          viewBox="0 0 9 9"
          shapeRendering="crispEdges"
          aria-hidden
        >
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i}>
              <rect x={i} y={i} width={1} height={1} />
              <rect x={8 - i} y={i} width={1} height={1} />
            </g>
          ))}
        </svg>
      ))}
    </>
  );
}

/** Top-left "Inspect Modyfi / 3 more options", desktop only. */
export function MouseoverText() {
  const [text, setText] = useState<{ verb: string; target?: string; color?: string; more: number } | null>(null);
  const enabled = useGame((s) => s.plugins.mouseover);
  const last = useRef('');
  useRaf(() => {
    if (runtime.pointer.isTouch || !runtime.pointer.inside || gameState().stage !== 'world' || gameState().menu) {
      if (last.current) {
        last.current = '';
        setText(null);
      }
      return;
    }
    const it = runtime.hoverId ? runtime.interactables.get(runtime.hoverId) : undefined;
    const using = gameState().usingCatch;
    const next = it
      ? { verb: using ? `Use ${itemName(using.stack)} on` : it.actions[0]?.verb ?? 'Examine', target: displayName(it), color: TONE_COLOR[it.tone], more: using ? 0 : it.actions.length + 1 }
      : runtime.hoverTile
        ? { verb: 'Walk here', more: 0 }
        : null;
    const key = next ? `${next.verb}|${next.target}|${next.more}` : '';
    if (key !== last.current) {
      last.current = key;
      setText(next);
    }
  });
  if (!enabled || !text) return null;
  return (
    <div className="ow-mouseover">
      {text.verb}
      {text.target && <span style={{ color: text.color }}> {text.target}</span>}
      {text.more > 0 && <span className="ow-mouseover-more"> / {text.more} more options</span>}
    </div>
  );
}

export function Fps() {
  const plugin = useGame((s) => s.plugins.fps);
  const tweak = useTweaks((t) => t.Debug.showFps);
  const ref = useRef<HTMLDivElement>(null);
  const acc = useRef({ frames: 0, time: 0 });
  useRaf((dt) => {
    acc.current.frames++;
    acc.current.time += dt;
    if (acc.current.time > 0.5) {
      runtime.fps = Math.round(acc.current.frames / acc.current.time);
      acc.current = { frames: 0, time: 0 };
      if (ref.current) ref.current.textContent = `${runtime.fps} fps · ${runtime.backend}`;
    }
  });
  if (!plugin && !tweak) return null;
  return <div ref={ref} className="ow-fps" />;
}
