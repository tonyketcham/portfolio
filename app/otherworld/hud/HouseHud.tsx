'use client';

/**
 * House UI: the House options tab, the furniture creation menu (Construction
 * meets a component picker), the portal loading box, and the blueprint's
 * frame labels during the intro.
 */
import { useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { buildFurniture, hotspotByKey, XP_BOOST } from '../house/build';
import { optionsFor } from '../house/furniture';
import { ringBell } from '../house/actions';
import { ROOM } from '../house/layout';
import { SPACE_NAMES } from '../house/rooms';
import { HOUSE_STYLES } from '../house/styles';
import type { HouseStyleId } from '../house/types';
import { toggleBuildMode, travel } from '../state/actions';
import { sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { levelForXp } from '../state/skills';
import { gameState, useGame } from '../state/store';
import { getHouse, onHouseChange } from '../world/places';
import { TabIcon } from './icons';
import { useRaf } from './util';

const useLayout = () => {
  useSyncExternalStore(onHouseChange, () => getHouse().version, () => 0);
  return getHouse().layout;
};

// ── House options tab ────────────────────────────────────────────────────────
export function HousePanel() {
  const L = useLayout();
  const buildMode = useGame((s) => s.buildMode);
  const location = useGame((s) => s.location);
  const style = useGame((s) => s.houseStyle) ?? L.design.style;
  const lv = levelForXp(useGame((s) => s.skills.construction ?? 0));
  const setHouseStyle = useGame((s) => s.setHouseStyle);
  const resetHouse = useGame((s) => s.resetHouse);

  const goRoom = (index: number) => {
    const r = L.rooms[index];
    sfx('click');
    const tile: [number, number] = [r.i0 + 4, r.j0 + 4];
    if (location !== 'house') travel('house', tile);
    else gameState().walkTo(tile);
  };
  const ring = () => {
    if (!L.hotspots.some((h) => h.def.space === 'bell-pull' && h.furniture))
      return gameState().say('You have no bell-pull. Build one in the dining room.');
    ringBell();
  };

  return (
    <div className="ow-house">
      <div className="ow-house-row">
        <button className="ow-btn ow-btn-primary" data-on={buildMode} onClick={() => toggleBuildMode()}>
          <TabIcon tab="hammer" size={18} /> Building mode: {buildMode ? 'On' : 'Off'}
        </button>
      </div>
      <div className="ow-house-row">
        {location === 'house' ? (
          <button className="ow-btn" onClick={() => travel('island')}>
            Leave house ↗
          </button>
        ) : (
          <button className="ow-btn" onClick={() => travel('house')}>
            Teleport inside
          </button>
        )}
        <button className="ow-btn" onClick={ring}>
          Call servant
        </button>
      </div>
      <div className="ow-house-meta">
        Construction <b>{lv}</b> · {L.rooms.length} rooms · {L.hotspots.filter((h) => h.furniture).length} / {L.hotspots.length} hotspots built
      </div>

      <div className="ow-editor-section">House style</div>
      <div className="ow-house-styles">
        {(Object.keys(HOUSE_STYLES) as HouseStyleId[]).map((id) => {
          const s = HOUSE_STYLES[id];
          const locked = lv < s.level;
          return (
            <button
              key={id}
              className="ow-house-style"
              data-active={style === id}
              data-locked={locked}
              title={s.examine}
              onClick={() => {
                if (locked) return gameState().say(`You need a Construction level of ${s.level} for ${s.name}.`);
                sfx('hammer');
                setHouseStyle(id);
              }}
            >
              <i style={{ background: s.wall[0], borderColor: s.trim }} />
              <span>{s.name}</span>
              <em>{s.level}</em>
            </button>
          );
        })}
      </div>

      <div className="ow-editor-section">Rooms</div>
      <div className="ow-house-rooms">
        {L.rooms.map((r) => (
          <button key={r.index} className="ow-layer" onClick={() => goRoom(r.index)} title={r.def.blurb}>
            <span className="ow-layer-kind">#</span>
            <span className="ow-layer-name">{r.def.name}</span>
            <em className="ow-dim">
              {r.place.at[0]},{r.place.at[1]}
            </em>
          </button>
        ))}
      </div>
      <button
        className="ow-btn ow-btn-quiet"
        onClick={() => {
          resetHouse();
          gameState().say('The house is back to how Tony left it.', 'system');
        }}
      >
        Reset furniture
      </button>
      <p className="ow-hint">
        In building mode, empty hotspots show as ghosts. Right-click (or long-press) to build into them or remove what&apos;s there. Building
        trains Construction (×{XP_BOOST} xp in this house).
      </p>
    </div>
  );
}

// ── Furniture creation menu ──────────────────────────────────────────────────
export function BuildMenu() {
  const key = useGame((s) => s.building);
  useLayout();
  const lv = levelForXp(useGame((s) => s.skills.construction ?? 0));
  if (!key) return null;
  const h = hotspotByKey(key);
  if (!h) return null;
  const options = optionsFor(h.def.space);
  return (
    <div className="ow-buildmenu ow-panel" role="dialog" aria-label="Furniture creation menu">
      <header className="ow-sidepanel-head">
        <span className="ow-title">Build: {SPACE_NAMES[h.def.space]}</span>
        <button className="ow-x" onClick={() => gameState().setBuilding(null)} aria-label="Close">
          ×
        </button>
      </header>
      <div className="ow-buildmenu-grid">
        {options.map((d) => {
          const locked = lv < d.level;
          const current = h.furniture === d.id;
          return (
            <button
              key={d.id}
              className="ow-buildcard"
              data-locked={locked}
              data-current={current}
              onClick={() => {
                if (current) return;
                sfx(locked ? 'error' : 'click');
                buildFurniture(key, d.id);
              }}
              title={d.examine}
            >
              <span className="ow-buildcard-name">{d.name}</span>
              <span className="ow-buildcard-level">Level {d.level}</span>
              <span className="ow-buildcard-mats">
                {d.materials.map(([m, n]) => (
                  <i key={m}>
                    {n} × {m}
                  </i>
                ))}
              </span>
              <span className="ow-buildcard-xp">{current ? 'Built' : `${d.xp * XP_BOOST} xp`}</span>
            </button>
          );
        })}
      </div>
      <p className="ow-hint">Your Construction level: {lv}. Red options need a higher level. ::max if you can&apos;t wait.</p>
    </div>
  );
}

// ── loading box ──────────────────────────────────────────────────────────────
export function LoadingBox() {
  const text = useGame((s) => s.loading);
  if (!text) return null;
  return (
    <div className="ow-loading" role="status">
      <div className="ow-loading-box">{text}</div>
      <div className="ow-loading-sub">Syncing 1 file · resolving instances</div>
    </div>
  );
}

// ── frame labels on the blueprint ────────────────────────────────────────────
const tmp = new THREE.Vector3();
export function RoomLabels() {
  const L = useLayout();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useRaf(() => {
    const cam = runtime.camera;
    const el = runtime.canvas;
    if (!cam || !el) return;
    const rect = el.getBoundingClientRect();
    L.rooms.forEach((r, i) => {
      const node = refs.current[i];
      if (!node) return;
      tmp.set(L.ox + r.i0 + 0.05, 0, L.oz + r.j0 - 0.05).project(cam);
      const x = rect.left + ((tmp.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - tmp.y) / 2) * rect.height;
      node.style.transform = `translate(${x.toFixed(1)}px, ${(y - 4).toFixed(1)}px) translateY(-100%)`;
      node.style.opacity = tmp.z < 1 ? '1' : '0';
    });
  });
  return (
    <div className="ow-roomlabels" aria-hidden>
      {L.rooms.map((r, i) => (
        <div key={r.index} ref={(n) => void (refs.current[i] = n)} className="ow-roomlabel">
          # {r.def.name}
          <span>
            {ROOM}×{ROOM}
          </span>
        </div>
      ))}
    </div>
  );
}
