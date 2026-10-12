'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
/**
 * The navigator: an old-school minimap that rotates with the camera (tap to
 * walk, tap the compass to face north), and the orbs beside it.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { FURNITURE } from '../house/furniture';
import { emit, sfx } from '../state/events';
import { place, runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { HALF, SIZE, T, getWorld, tileIndex, type TileKind } from '../world/map';
import { getHouse, onHouseChange } from '../world/places';
import { useRaf } from './util';

const PX = 3; // pixels per tile in the base image
const tmp = new THREE.Vector3();

const MAP_COLORS: Record<TileKind, string> = {
  [T.Void]: 'transparent',
  [T.Grass]: '#4f7d33',
  [T.Dirt]: '#7d5f3e',
  [T.Sand]: '#bfa874',
  [T.Plaza]: '#9ea1ab',
  [T.Moss]: '#3a6143',
  [T.Concrete]: '#62656e',
  [T.Soil]: '#5e402c',
  [T.Ruin]: '#77736a',
  [T.DarkMoss]: '#2b3f30',
};

function useBaseImage() {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const world = getWorld();
    const c = document.createElement('canvas');
    c.width = c.height = SIZE * PX;
    const ctx = c.getContext('2d')!;
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) {
        const k = tileIndex(i, j);
        const kind = world.tiles[k] as TileKind;
        if (kind === T.Void) continue;
        ctx.fillStyle = world.blocked[k] ? shade(MAP_COLORS[kind]) : MAP_COLORS[kind];
        ctx.fillRect(i * PX, j * PX, PX, PX);
      }
    // the web
    ctx.lineCap = 'round';
    for (const e of world.edges) {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.kind === 'road' ? 2 : 1;
      ctx.globalAlpha = e.kind === 'road' ? 0.9 : 0.7;
      ctx.beginPath();
      e.points.forEach(([x, z], n) => {
        const px = (x + HALF) * PX;
        const pz = (z + HALF) * PX;
        if (n === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // works as little frames
    for (const p of world.placements) {
      ctx.fillStyle = p.display === 'tree' ? '#e879f9' : '#fafafa';
      ctx.fillRect((p.x + HALF) * PX - 2, (p.z + HALF) * PX - 2, 4, 4);
    }
    return c;
  }, []);
}

const FLOOR_COLORS: Record<string, string> = {
  planks: '#8a5a34',
  boards: '#5e3f27',
  stone: '#77736a',
  marble: '#d6d3d1',
  carpet: '#4c1d33',
  grass: '#4f7d33',
};

/** The house plan: floors, furniture footprints, walls with their door gaps. */
function useHouseImage() {
  const version = useSyncExternalStore(onHouseChange, () => getHouse().version, () => 0);
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const L = getHouse().layout;
    const c = document.createElement('canvas');
    c.width = L.width * PX;
    c.height = L.height * PX;
    const ctx = c.getContext('2d')!;
    for (const r of L.rooms) {
      ctx.fillStyle = FLOOR_COLORS[r.def.floor] ?? '#71717a';
      ctx.fillRect(r.i0 * PX, r.j0 * PX, 8 * PX, 8 * PX);
    }
    for (const h of L.hotspots) {
      if (!h.furniture || h.def.wall || h.def.walkable || !h.rect[2]) continue;
      ctx.fillStyle = FURNITURE.get(h.furniture)?.showsWork ? '#e879f9' : 'rgba(9,9,11,0.55)';
      ctx.fillRect(h.rect[0] * PX + 0.5, h.rect[1] * PX + 0.5, h.rect[2] * PX - 1, h.rect[3] * PX - 1);
    }
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 1;
    for (const s of L.sides) {
      if (s.kind === 'hedge') continue;
      const tx = (s.b[0] - s.a[0]) / 8;
      const tz = (s.b[1] - s.a[1]) / 8;
      let u = 0;
      const gaps = s.openings.filter((o) => o.kind === 'door').sort((a, b) => a.u0 - b.u0);
      for (const o of [...gaps, { u0: 8, u1: 8 }]) {
        ctx.beginPath();
        ctx.moveTo((s.a[0] + tx * u) * PX, (s.a[1] + tz * u) * PX);
        ctx.lineTo((s.a[0] + tx * o.u0) * PX, (s.a[1] + tz * o.u0) * PX);
        ctx.stroke();
        u = o.u1;
      }
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}

function shade(hex: string) {
  if (hex === 'transparent') return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.65;
  const g = ((n >> 8) & 255) * 0.65;
  const b = (n & 255) * 0.65;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const compass = useRef<HTMLButtonElement>(null);
  const islandImage = useBaseImage();
  const houseImage = useHouseImage();
  const enabled = useGame((s) => s.plugins.minimap);
  const frame = useRef(0);
  const zoom = 1.25;

  const angle = () => {
    // rotate so the camera's forward is up
    const yaw = runtime.cam.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    return -Math.PI / 2 - Math.atan2(fz, fx);
  };

  useRaf(() => {
    if (!enabled) return;
    frame.current++;
    if (frame.current % 2) return;
    const c = canvas.current;
    const inHouse = runtime.location === 'house';
    const base = inHouse ? houseImage : islandImage;
    if (!c || !base) return;
    const L = getHouse().layout;
    const originX = inHouse ? -L.ox : HALF;
    const originZ = inHouse ? -L.oz : HALF;
    const ctx = c.getContext('2d')!;
    const size = c.width;
    const r = size / 2;
    const theta = angle();
    const p = runtime.player.pos;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, size, size);
    // dot grid
    ctx.fillStyle = '#27272a';
    for (let y = 4; y < size; y += 8) for (let x = 4; x < size; x += 8) ctx.fillRect(x, y, 1, 1);
    ctx.translate(r, r);
    ctx.rotate(theta);
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, -(p.x + originX) * PX, -(p.z + originZ) * PX);

    // dots: npcs yellow, items red, other players white
    for (const it of runtime.interactables.values()) {
      const o = it.object();
      if (!o || !o.visible) continue;
      let color: string | null = null;
      if (it.tone === 'npc') color = '#ffff00';
      else if (it.tone === 'item') color = '#ff3b30';
      if (!color) continue;
      const wp = o.getWorldPosition(tmp);
      ctx.fillStyle = '#000';
      ctx.fillRect((wp.x - p.x) * PX - 1.5, (wp.z - p.z) * PX - 1.5, 3.5, 3.5);
      ctx.fillStyle = color;
      ctx.fillRect((wp.x - p.x) * PX - 1, (wp.z - p.z) * PX - 1, 2.5, 2.5);
    }
    // destination flag
    const dest = gameState().destination;
    if (dest && runtime.player.moving) {
      const [tx, tz] = place().tileCenter(dest.tile[0], dest.tile[1]);
      const dx = (tx - p.x) * PX;
      const dz = (tz - p.z) * PX;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(dx, dz - 6, 1.5, 7);
      ctx.fillRect(dx + 1.5, dz - 6, 4, 3);
    }
    ctx.restore();

    // the player: a tiny cursor at the centre, pointing where we face
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(theta + Math.PI - runtime.player.yaw);
    ctx.fillStyle = '#fafafa';
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    if (compass.current) compass.current.style.transform = `rotate(${theta}rad)`;
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = c.clientWidth;
    c.width = Math.round(css * dpr);
    c.height = Math.round(css * dpr);
  }, [enabled]);

  if (!enabled) return null;

  const onClick = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const rect = c.getBoundingClientRect();
    const scale = c.width / rect.width;
    const x = (e.clientX - rect.left) * scale - c.width / 2;
    const y = (e.clientY - rect.top) * scale - c.height / 2;
    if (Math.hypot(x, y) > c.width / 2) return;
    const theta = -angle();
    const rx = (x * Math.cos(theta) - y * Math.sin(theta)) / (PX * zoom);
    const rz = (x * Math.sin(theta) + y * Math.cos(theta)) / (PX * zoom);
    const wx = runtime.player.pos.x + rx;
    const wz = runtime.player.pos.z + rz;
    const tile = place().worldToTile(wx, wz);
    if (!place().inBounds(tile[0], tile[1])) return;
    emit({ type: 'cross', x: e.clientX, y: e.clientY, color: 'yellow' });
    sfx('click');
    gameState().walkTo(tile);
  };

  return (
    <div className="ow-minimap">
      <canvas ref={canvas} className="ow-minimap-canvas" onPointerDown={onClick} aria-label="Minimap: tap to walk" />
      <button
        ref={compass}
        className="ow-compass"
        aria-label="Face north"
        onClick={() => {
          runtime.cam.yaw = 0;
          sfx('click');
        }}
      >
        N
      </button>
      <Orbs />
    </div>
  );
}

function Orb({
  label,
  value,
  fill,
  color,
  active,
  onClick,
  icon,
}: {
  label: string;
  value: string;
  fill: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
  icon: ReactNode;
}) {
  return (
    <button className="ow-orb" data-active={active} onClick={onClick} aria-label={label} title={label}>
      <span className="ow-orb-value">{value}</span>
      <span className="ow-orb-ball" style={{ '--fill': `${Math.round(fill * 100)}%`, '--orb': color } as CSSProperties}>
        {icon}
      </span>
    </button>
  );
}

function Orbs() {
  const caffeine = useGame((s) => s.caffeine);
  const running = useGame((s) => s.running);
  const toggleRun = useGame((s) => s.toggleRun);
  const sound = useGame((s) => s.plugins.sound);
  const togglePlugin = useGame((s) => s.togglePlugin);
  const mushroomUntil = useGame((s) => s.mushroomUntil);
  const zoomRef = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    if (!zoomRef.current) return;
    const pct = Math.round((15 / runtime.cam.distance) * 100);
    const text = `${pct}%`;
    if (zoomRef.current.textContent !== text) zoomRef.current.textContent = text;
  });
  const shroom = Math.max(0, mushroomUntil - performance.now());
  return (
    <div className="ow-orbs">
      <Orb
        label={running ? 'Walk (caffeine)' : 'Run (caffeine)'}
        value={`${Math.round(caffeine)}`}
        fill={caffeine / 100}
        color="#a3e635"
        active={running}
        onClick={() => {
          toggleRun();
          sfx('click');
        }}
        icon={<span aria-hidden>☕︎</span>}
      />
      <Orb
        label={sound ? 'Mute' : 'Sound on'}
        value={sound ? 'on' : 'off'}
        fill={sound ? 1 : 0}
        color="#60a5fa"
        active={sound}
        onClick={() => {
          togglePlugin('sound');
          window.setTimeout(() => sfx('pop'), 30);
        }}
        icon={<span aria-hidden>{sound ? '♪' : '♩'}</span>}
      />
      <button
        className="ow-orb ow-orb-zoom"
        aria-label="Reset zoom"
        title="Reset zoom"
        onClick={() => {
          runtime.cam.distance = 15;
          sfx('click');
        }}
      >
        <span className="ow-orb-value" ref={zoomRef}>
          100%
        </span>
        <span className="ow-orb-ball" style={{ '--fill': '100%', '--orb': '#e4e4e7' } as CSSProperties}>
          <span aria-hidden>⌕</span>
        </span>
      </button>
      {shroom > 0 && (
        <span className="ow-orb ow-orb-shroom" title="Mushroom mode">
          <span className="ow-orb-ball" style={{ '--fill': '100%', '--orb': '#ef4444' } as CSSProperties}>
            <span aria-hidden>✺</span>
          </span>
        </span>
      )}
    </div>
  );
}
