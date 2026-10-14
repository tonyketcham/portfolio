'use client';

/**
 * A slider you have to drive. The knob lives in an H-pattern gate and can only
 * travel along it: across the neutral rail, then up or down a slot. Getting
 * into (or out of) a gear without the clutch held grinds and fights you;
 * reverse has a lift collar you have to hold against before it lets you down.
 * Let go between gears and it springs back to neutral.
 *
 * It's tactile but stiff: the rubber boot necks as you pull the stick out of
 * centre, the knob gives a little along its motion, and pulling against the
 * gate stretches a band toward your finger. Smack the knob into an end stop
 * and the whole gate assembly bounces on its mounts, harder the faster you hit.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { sfx } from '../state/events';

export type Gear = 'R' | 'N' | 1 | 2 | 3 | 4 | 5;
/** Keyboard order. */
export const GEARS: Gear[] = ['R', 'N', 1, 2, 3, 4, 5];

const COLS = [60, 110, 160];
const RAIL = 84;
const TOP = 30;
const BOT = 138;
const CENTER = 110;
/** How close to a column the knob must be on the rail to turn into its slot. */
const SNAP = 9;
/** The last stretch of a slot, where the synchro fights you without the clutch. */
const SYNCHRO = 15;
const KNOB = 13;
const BASE = 21;

const SLOTS: { gear: Exclude<Gear, 'N'>; x: number; y: number }[] = [
  { gear: 1, x: 60, y: TOP },
  { gear: 2, x: 60, y: BOT },
  { gear: 3, x: 110, y: TOP },
  { gear: 4, x: 110, y: BOT },
  { gear: 5, x: 160, y: TOP },
  { gear: 'R', x: 160, y: BOT },
];

interface P {
  x: number;
  y: number;
}
const posOf = (g: Gear): P => (g === 'N' ? { x: CENTER, y: RAIL } : { ...SLOTS.find((s) => s.gear === g)! });
const gearAt = (p: P) => SLOTS.find((s) => Math.abs(p.x - s.x) < 1 && Math.abs(p.y - s.y) < 1.5)?.gear ?? null;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f = (n: number) => n.toFixed(2);

/**
 * A rubber hull between two circles that necks in the middle as it stretches:
 * tangent sides drawn as quadratics pulled toward the axis, round caps at both ends.
 */
function rubber(a: P, ra: number, b: P, rb: number, stretch: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return `M${f(a.x + ra)} ${f(a.y)} A${ra} ${ra} 0 1 0 ${f(a.x - ra)} ${f(a.y)} A${ra} ${ra} 0 1 0 ${f(a.x + ra)} ${f(a.y)} Z`;
  const nx = -dy / d;
  const ny = dx / d;
  const waist = ((ra + rb) / 2) * (1 - 0.55 * stretch);
  // a quadratic's midpoint sits halfway between its control point and the chord
  const cw = 2 * waist - (ra + rb) / 2;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const pt = (o: P, r: number, s: number) => `${f(o.x + nx * r * s)} ${f(o.y + ny * r * s)}`;
  return [
    `M${pt(a, ra, 1)}`,
    `Q${pt(m, cw, 1)} ${pt(b, rb, 1)}`,
    `A${rb} ${rb} 0 0 0 ${pt(b, rb, -1)}`,
    `Q${pt(m, cw, -1)} ${pt(a, ra, -1)}`,
    `A${ra} ${ra} 0 0 0 ${pt(a, ra, 1)}`,
    'Z',
  ].join(' ');
}

interface Sim {
  /** Where the knob is on the gate (always on the gate). */
  pos: P;
  /** Where it's drawn: springs after `pos`, so it overshoots and wobbles. */
  disp: P;
  vel: P;
  pointer: P | null;
  dragging: boolean;
  clutch: boolean;
  /** 0 → 1 reverse lift collar. */
  lift: number;
  /** 1 while the synchro is fighting you, decays. */
  grind: number;
  lastGrind: number;
  engaged: Gear;
  raf: number;
  last: number;
  /** Knob speed along the gate (smoothed), for how hard it hits an end stop. */
  pv: P;
  /** The gate assembly on its mounts: offset, velocity, twist (deg) and twist rate. */
  gate: P;
  gateVel: P;
  rot: number;
  rotVel: number;
  /** Which end stop the knob is resting against, so holding it there doesn't keep bouncing. */
  wall: string | null;
}

export function GearShift({ value, onChange, label = 'Gear' }: { value: Gear; onChange: (g: Gear) => void; label?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const sim = useRef<Sim>({
    pos: posOf(value),
    disp: posOf(value),
    vel: { x: 0, y: 0 },
    pointer: null,
    dragging: false,
    clutch: false,
    lift: 0,
    grind: 0,
    lastGrind: 0,
    engaged: value,
    raf: 0,
    last: 0,
    pv: { x: 0, y: 0 },
    gate: { x: 0, y: 0 },
    gateVel: { x: 0, y: 0 },
    rot: 0,
    rotVel: 0,
    wall: null,
  });
  const [, setTick] = useState(0);
  const [clutchDown, setClutchDown] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const engage = useCallback((g: Gear) => {
    const s = sim.current;
    if (s.engaged === g) return;
    s.engaged = g;
    if (g !== 'N') {
      sfx('clunk', g === 'R' ? 0.8 : 0.9 + Number(g) * 0.05);
      // the clunk knocks the knob into a wobble
      s.vel.y += (s.pos.y < RAIL ? -1 : 1) * 120;
    }
    onChangeRef.current(g);
  }, []);

  /** Knock the gate on its mounts: `force` in gate units per second, `dir` the direction it was hit. */
  const smack = useCallback((dir: P, force: number, at: P) => {
    const s = sim.current;
    const f = Math.min(force, 1000);
    s.gateVel.x += dir.x * f * 0.32;
    s.gateVel.y += dir.y * f * 0.32;
    // off-centre hits twist it a little
    const lever = (at.x - CENTER) / 50;
    s.rotVel += (dir.y * lever - dir.x * ((at.y - RAIL) / 54)) * f * 0.07;
  }, []);

  const frame = useCallback(
    (now: number) => {
      const s = sim.current;
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000) || 1 / 60;
      s.last = now;
      const pos = s.pos;
      let wantsReverse = false;
      const before = { ...pos };
      let hit: { dir: P; key: string } | null = null;

      if (s.dragging && s.pointer) {
        // walk the knob along the gate toward the pointer, a little at a time
        for (let i = 0; i < 16; i++) {
          let dx = s.pointer.x - pos.x;
          let dy = s.pointer.y - pos.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.3) break;
          const k = Math.min(1, 2.5 / len);
          dx *= k;
          dy *= k;
          const inSlot = Math.abs(pos.y - RAIL) > 0.5;
          if (inSlot) {
            const toEnd = Math.min(Math.abs(pos.y - TOP), Math.abs(pos.y - BOT));
            if (toEnd < SYNCHRO && !s.clutch) {
              dy *= 0.16;
              s.grind = 1;
            }
            const ny = clamp(pos.y + dy, TOP, BOT);
            if ((ny === TOP || ny === BOT) && pos.y + dy !== ny) hit = { dir: { x: 0, y: Math.sign(dy) }, key: `${pos.x},${ny}` };
            // crossing the rail is allowed, but stop on it so the next step can turn
            pos.y = (pos.y - RAIL) * (ny - RAIL) < 0 ? RAIL : ny;
            if (Math.abs(dy) < 0.05) break;
          } else {
            const col = COLS.find((c) => Math.abs(pos.x - c) < SNAP);
            if (col !== undefined && Math.abs(dy) > Math.abs(dx) * 0.8) {
              if (col === 160 && dy > 0 && s.lift < 1) {
                wantsReverse = true;
                pos.x = col;
                break;
              }
              pos.x = col;
              pos.y = clamp(pos.y + dy, TOP, BOT);
            } else {
              const nx = clamp(pos.x + dx, COLS[0], COLS[2]);
              if (nx !== pos.x + dx && Math.abs(dx) > 0.05) hit = { dir: { x: Math.sign(dx), y: 0 }, key: `${nx},rail` };
              pos.x = nx;
              pos.y = RAIL;
            }
          }
        }
        if (hit && hit.key !== s.wall) {
          const force = Math.abs(s.pv.x * hit.dir.x + s.pv.y * hit.dir.y);
          if (force > 30) {
            smack(hit.dir, force, pos);
            if (hit.dir.x !== 0 && force > 120) sfx('thunk', 1.4);
          }
          s.wall = hit.key;
        } else if (!hit && Math.hypot(pos.x - before.x, pos.y - before.y) > 0.5) s.wall = null;
        const g = gearAt(pos);
        if (g) engage(g);
        else if (s.engaged !== 'N' && Math.hypot(pos.x - posOf(s.engaged).x, pos.y - posOf(s.engaged).y) > 6) engage('N');
      } else {
        // let go: snap into a gear if it's nearly there, otherwise spring back to neutral
        const near = SLOTS.find((sl) => sl.x === pos.x && Math.abs(pos.y - sl.y) < 5);
        if (near) {
          if (pos.y !== near.y) smack({ x: 0, y: Math.sign(near.y - pos.y) }, 160, pos);
          pos.y = near.y;
          engage(near.gear);
        } else if (Math.abs(pos.y - RAIL) > 0.5) {
          const step = 260 * dt;
          pos.y = Math.abs(pos.y - RAIL) <= step ? RAIL : pos.y + Math.sign(RAIL - pos.y) * step;
        } else if (Math.abs(pos.x - CENTER) > 0.3) {
          const step = 200 * dt;
          pos.x = Math.abs(pos.x - CENTER) <= step ? CENTER : pos.x + Math.sign(CENTER - pos.x) * step;
        }
        if (!gearAt(pos)) engage('N');
      }

      s.lift = wantsReverse ? Math.min(1, s.lift + dt * 1.6) : pos.x === 160 && pos.y > RAIL ? s.lift : Math.max(0, s.lift - dt * 3);
      if (s.grind > 0.5 && now - s.lastGrind > 85) {
        s.lastGrind = now;
        sfx('grind', 0.8 + Math.random() * 0.4);
      }
      s.grind = Math.max(0, s.grind - dt * 6);

      // how fast the knob is travelling along the gate, smoothed
      const k = 1 - Math.exp(-dt * 30);
      s.pv.x += ((pos.x - before.x) / dt - s.pv.x) * k;
      s.pv.y += ((pos.y - before.y) / dt - s.pv.y) * k;

      // the gate on its rubber mounts: stiff, quick to settle
      const GK = 1400;
      const GD = 20;
      s.gateVel.x += (-s.gate.x * GK - s.gateVel.x * GD) * dt;
      s.gateVel.y += (-s.gate.y * GK - s.gateVel.y * GD) * dt;
      s.gate.x += s.gateVel.x * dt;
      s.gate.y += s.gateVel.y * dt;
      s.rotVel += (-s.rot * GK - s.rotVel * GD) * dt;
      s.rot += s.rotVel * dt;

      // the knob: a stiff, slightly underdamped spring from where it's drawn to where it is
      const K = 900;
      const D = 32;
      s.vel.x += ((pos.x - s.disp.x) * K - s.vel.x * D) * dt;
      s.vel.y += ((pos.y - s.disp.y) * K - s.vel.y * D) * dt;
      s.disp.x += s.vel.x * dt;
      s.disp.y += s.vel.y * dt;

      setTick((t) => t + 1);
      const settled =
        !s.dragging && s.grind === 0 && s.lift === 0 && Math.hypot(s.vel.x, s.vel.y) < 0.4 &&
        Math.hypot(s.gate.x, s.gate.y, s.gateVel.x / 40, s.gateVel.y / 40) < 0.03 && Math.abs(s.rot) + Math.abs(s.rotVel) / 40 < 0.02 &&
        Math.hypot(pos.x - s.disp.x, pos.y - s.disp.y) < 0.05 && (gearAt(pos) !== null || (pos.y === RAIL && pos.x === CENTER));
      if (settled) {
        s.disp = { ...pos };
        s.gate = { x: 0, y: 0 };
        s.rot = 0;
        s.raf = 0;
        s.last = 0;
      } else s.raf = requestAnimationFrame(frame);
    },
    [engage, smack]
  );

  const kick = useCallback(() => {
    const s = sim.current;
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  // someone else changed the gear (reroll, mutate): move the knob there
  useEffect(() => {
    const s = sim.current;
    if (s.dragging || s.engaged === value) return;
    s.engaged = value;
    s.pos = posOf(value);
    kick();
  }, [value, kick]);

  // Shift works as a clutch on desktop
  useEffect(() => {
    const set = (on: boolean) => (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      sim.current.clutch = on;
      setClutchDown(on);
    };
    const down = set(true);
    const up = set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toLocal = (e: PointerEvent) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const onDown = (e: PointerEvent<SVGRectElement>) => {
    const p = toLocal(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = sim.current;
    s.dragging = true;
    s.pointer = p;
    kick();
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const s = sim.current;
    if (!s.dragging) return;
    s.pointer = toLocal(e);
    kick();
  };
  const onUp = () => {
    const s = sim.current;
    s.dragging = false;
    s.pointer = null;
    kick();
  };

  const pedal = (on: boolean) => (e: PointerEvent<SVGGElement>) => {
    if (on) e.currentTarget.setPointerCapture(e.pointerId);
    sim.current.clutch = on;
    setClutchDown(on);
    if (on) sfx('click', 0.6);
  };

  const onKey = (e: KeyboardEvent) => {
    const i = GEARS.indexOf(sim.current.engaged);
    const next = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? GEARS[i + 1] : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? GEARS[i - 1] : undefined;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    sim.current.pos = posOf(next);
    if (next !== 'N') smack({ x: 0, y: posOf(next).y < RAIL ? -1 : 1 }, 260, posOf(next));
    engage(next);
    kick();
  };

  // ── draw ──
  const s = sim.current;
  const jitter = s.grind * 2.2;
  const knob = { x: s.disp.x + (Math.random() - 0.5) * jitter, y: s.disp.y + (Math.random() - 0.5) * jitter };
  const base = { x: CENTER, y: RAIL };
  const reach = Math.hypot(knob.x - base.x, knob.y - base.y);
  const bootStretch = clamp(reach / 70, 0, 1) * 0.65;
  const speed = Math.hypot(s.vel.x, s.vel.y);
  const toPointer = s.dragging && s.pointer ? { x: s.pointer.x - knob.x, y: s.pointer.y - knob.y } : null;
  const pull = toPointer ? Math.hypot(toPointer.x, toPointer.y) : 0;
  const tension = clamp((pull - 4) / 46, 0, 1);
  // squash along the pull when you're fighting the gate, else along the motion
  const axis = tension > 0.08 && toPointer ? Math.atan2(toPointer.y, toPointer.x) : Math.atan2(s.vel.y, s.vel.x);
  const squash = 1 + Math.min(0.14, speed / 2000) + tension * 0.16;
  const tip =
    toPointer && pull > 6
      ? { x: knob.x + (toPointer.x / pull) * Math.min(pull, 52), y: knob.y + (toPointer.y / pull) * Math.min(pull, 52) }
      : null;
  const ribs = [0.28, 0.5, 0.72].map((t) => {
    const nx = reach > 0.5 ? -(knob.y - base.y) / reach : 0;
    const ny = reach > 0.5 ? (knob.x - base.x) / reach : 1;
    const c = { x: base.x + (knob.x - base.x) * t, y: base.y + (knob.y - base.y) * t };
    const hw = (BASE + (KNOB + 2 - BASE) * t) * (1 - 0.55 * bootStretch * Math.sin(Math.PI * t)) * 0.86;
    const bulge = { x: c.x + (knob.x - base.x) * 0.06, y: c.y + (knob.y - base.y) * 0.06 };
    return `M${f(c.x + nx * hw)} ${f(c.y + ny * hw)} Q${f(bulge.x)} ${f(bulge.y)} ${f(c.x - nx * hw)} ${f(c.y - ny * hw)}`;
  });
  const shown = s.engaged;

  return (
    <div className="ow-gear">
      <svg
        ref={svg}
        className="ow-gear-svg"
        viewBox="0 0 280 172"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={shown === 'N' ? 'Neutral' : shown === 'R' ? 'Reverse' : `Gear ${shown}`}
        aria-valuemin={0}
        aria-valuemax={GEARS.length - 1}
        aria-valuenow={GEARS.indexOf(shown)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id="ow-gear-plate" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a3a42" />
            <stop offset="0.5" stopColor="#24242a" />
            <stop offset="1" stopColor="#18181c" />
          </linearGradient>
          <radialGradient id="ow-gear-knob" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#f4f4f5" />
            <stop offset="0.35" stopColor="#a1a1aa" />
            <stop offset="1" stopColor="#27272a" />
          </radialGradient>
          <radialGradient id="ow-gear-boot" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor="#2b2b31" />
            <stop offset="1" stopColor="#0e0e11" />
          </radialGradient>
        </defs>

        <g transform={`translate(${f(s.gate.x)} ${f(s.gate.y)}) rotate(${f(s.rot)} ${CENTER} ${RAIL})`}>
        {/* plate */}
        <rect x="6" y="6" width="190" height="160" rx="14" fill="url(#ow-gear-plate)" stroke="#52525b" />
        {[[18, 18], [184, 18], [18, 154], [184, 154]].map(([x, y]) => (
          <g key={`${x}${y}`}>
            <circle cx={x} cy={y} r="3.4" fill="#18181b" stroke="#71717a" strokeWidth="0.8" />
            <path d={`M${x - 2.2} ${y} H${x + 2.2}`} stroke="#71717a" strokeWidth="0.8" transform={`rotate(${(x * y) % 90} ${x} ${y})`} />
          </g>
        ))}

        {/* the gate */}
        <path
          d={`M${COLS[0]} ${RAIL} H${COLS[2]} ${COLS.map((c) => `M${c} ${TOP} V${BOT}`).join(' ')}`}
          stroke="#52525b"
          strokeWidth="19"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M${COLS[0]} ${RAIL} H${COLS[2]} ${COLS.map((c) => `M${c} ${TOP} V${BOT}`).join(' ')}`}
          stroke={s.grind > 0.2 ? '#3f0d0d' : '#050507'}
          strokeWidth="15"
          strokeLinecap="round"
          fill="none"
        />
        {SLOTS.map((sl) => (
          <text
            key={String(sl.gear)}
            className="ow-gear-label"
            x={sl.x}
            y={sl.y < RAIL ? sl.y - 14 : sl.y + 22}
            textAnchor="middle"
            data-on={shown === sl.gear}
            data-reverse={sl.gear === 'R'}
          >
            {sl.gear}
          </text>
        ))}

        {/* rubber boot from the pivot to the knob, and the band to your finger */}
        <path d={rubber(base, BASE, knob, KNOB + 2, bootStretch)} fill="url(#ow-gear-boot)" stroke="#000" strokeWidth="1" />
        {reach > 6 && ribs.map((d, i) => <path key={i} d={d} stroke="#3f3f46" strokeWidth="1.2" fill="none" strokeLinecap="round" />)}
        {tip && <path d={rubber(knob, 8, tip, 2.5, tension)} fill="#3f3f46" opacity={0.35 + tension * 0.45} stroke="#a1a1aa" strokeOpacity={0.4} strokeWidth="0.8" />}

        {/* reverse lift collar */}
        {s.lift > 0 && (
          <circle
            cx={knob.x}
            cy={knob.y}
            r={KNOB + 5}
            fill="none"
            stroke="#f87171"
            strokeWidth="2.4"
            strokeDasharray={`${s.lift * Math.PI * 2 * (KNOB + 5)} 999`}
            transform={`rotate(-90 ${knob.x} ${knob.y})`}
          />
        )}

        {/* the knob, squashed along whatever it's doing */}
        <g transform={`translate(${f(knob.x)} ${f(knob.y)}) rotate(${f((axis * 180) / Math.PI)}) scale(${f(squash)} ${f(1 / Math.sqrt(squash))})`}>
          <circle r={KNOB} fill="url(#ow-gear-knob)" stroke="#09090b" strokeWidth="1.2" />
        </g>
        <path
          d={`M${knob.x - 5} ${knob.y - 4} V${knob.y + 4} M${knob.x} ${knob.y - 4} V${knob.y + 4} M${knob.x + 5} ${knob.y - 4} V${knob.y + 4} M${knob.x - 5} ${knob.y} H${knob.x + 5}`}
          stroke="#18181b"
          strokeOpacity="0.55"
          strokeWidth="1.1"
          pointerEvents="none"
        />

        {/* catch every press on the plate: grab anywhere and the rubber reaches for you */}
        </g>
        <rect x="6" y="6" width="190" height="160" rx="14" fill="transparent" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ cursor: s.dragging ? 'grabbing' : 'grab' }} />

        {/* clutch pedal */}
        <g
          className="ow-gear-pedal"
          role="button"
          aria-label="Clutch (hold)"
          aria-pressed={clutchDown}
          onPointerDown={pedal(true)}
          onPointerUp={pedal(false)}
          onPointerCancel={pedal(false)}
          transform={clutchDown ? 'translate(0 5)' : undefined}
        >
          <rect x="210" y="14" width="58" height="104" rx="9" fill={clutchDown ? '#18181b' : '#27272a'} stroke="#52525b" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x="218" y={24 + i * 15} width="42" height="6" rx="3" fill={clutchDown ? '#0a0a0c' : '#3f3f46'} />
          ))}
          <text x="239" y="132" textAnchor="middle" className="ow-gear-pedal-label">
            CLUTCH
          </text>
        </g>
        {/* what gear you are in */}
        <text x="239" y="160" textAnchor="middle" className="ow-gear-readout" data-reverse={shown === 'R'}>
          {shown}
        </text>
      </svg>
      <p className="ow-hint ow-gear-hint">
        Drag the knob through the gate. Hold the clutch (or Shift) or it grinds; hold against reverse to lift the collar.
      </p>
    </div>
  );
}
