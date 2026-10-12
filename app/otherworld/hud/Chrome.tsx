'use client';

/**
 * Design-tool chrome: the boot screen, the intro's editor shell (the flat
 * artboard you zoom out of), and the in-world toolbar.
 */
import { useEffect, useRef, useState } from 'react';
import { zoneById } from '@/content/zones';
import { HOUSE_STYLES } from '../house/styles';
import { replayIntro, toggleBuildMode } from '../state/actions';
import { emit, sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getHouse } from '../world/places';
import { RoomLabels } from './HouseHud';
import { TabIcon } from './icons';
import { isTouchDevice, useRaf } from './util';

const BOOT_LINES = [
  'Requesting a GPU adapter…',
  'Measuring rooms…',
  'Brewing tea…',
  'Detaching instances…',
  'Teaching a cursor to walk…',
  'Compiling node materials…',
  'Planting fractals…',
];

export function Boot() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setLine((l) => (l + 1) % BOOT_LINES.length), 420);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="ow-boot" role="status">
      <div className="ow-boot-file">
        <span className="ow-boot-icon" aria-hidden>
          ▢
        </span>
        Untitled-1 / House plan
      </div>
      <div className="ow-boot-bar">
        <i />
      </div>
      <div className="ow-boot-line">{BOOT_LINES[line]}</div>
    </div>
  );
}

/** The editor you start in: the house plan, every room a frame, every hotspot a dotted box. */
export function IntroChrome() {
  const L = getHouse().layout;
  const style = HOUSE_STYLES[L.design.style];
  const stage = useGame((s) => s.stage);
  const setStage = useGame((s) => s.setStage);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);

  useRaf(() => {
    if (!zoomRef.current) return;
    const pct = Math.round((runtime.intro.baseDistance / Math.max(0.01, runtime.cam.distance)) * 100);
    const text = `${pct}%`;
    if (zoomRef.current.textContent !== text) zoomRef.current.textContent = text;
  });

  const present = () => {
    sfx('click');
    setStage('unfolding');
  };
  const zoomBy = (k: number) => {
    runtime.cam.distance *= k;
    sfx('click');
  };

  return (
    <div className="ow-intro" data-leaving={stage === 'unfolding'}>
      <header className="ow-editor-top">
        <div className="ow-editor-file">
          <span className="ow-editor-logo" aria-hidden>
            ◆
          </span>
          <span>Untitled-1</span>
          <span className="ow-dim">/ House plan — Edited</span>
        </div>
        <div className="ow-editor-tools" aria-hidden>
          <span data-active>V</span>
          <span>F</span>
          <span>T</span>
          <span>P</span>
          <span>H</span>
        </div>
        <div className="ow-editor-right">
          <span className="ow-avatar" aria-hidden>
            TK
          </span>
          <button className="ow-btn ow-btn-primary" onClick={present}>
            Present ▶
          </button>
        </div>
      </header>
      <aside className="ow-editor-left ow-desktop-only">
        <div className="ow-editor-section">Layers</div>
        <div className="ow-editor-layer" data-selected>
          ▦ House
        </div>
        {L.rooms.map((r) => (
          <div key={r.index} className="ow-editor-layer ow-indent">
            # {r.def.name} <span className="ow-dim">{r.def.hotspots.filter((h) => r.place.furniture[h.id]).length}</span>
          </div>
        ))}
        <div className="ow-editor-section">Pages</div>
        <div className="ow-editor-layer">House plan</div>
        <div className="ow-editor-layer ow-dim">Island (locked)</div>
      </aside>
      <aside className="ow-editor-right-panel ow-desktop-only">
        <div className="ow-editor-section">Plan</div>
        <dl className="ow-props">
          <dt>W</dt>
          <dd>{L.width} tiles</dd>
          <dt>H</dt>
          <dd>{L.height} tiles</dd>
          <dt>Rooms</dt>
          <dd>{L.rooms.length}</dd>
          <dt>Style</dt>
          <dd>
            <i className="ow-swatch" style={{ background: style.wall[0] }} /> {style.name}
          </dd>
        </dl>
        <div className="ow-editor-section">Construction</div>
        <dl className="ow-props">
          <dt>Walls</dt>
          <dd>Rise on zoom out</dd>
          <dt>Furniture</dt>
          <dd>{L.hotspots.filter((h) => h.furniture).length} pieces</dd>
        </dl>
      </aside>
      <RoomLabels />
      <div className="ow-editor-bottom">
        <div className="ow-zoom-pill">
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom out">
            −
          </button>
          <span ref={zoomRef}>100%</span>
          <button onClick={() => zoomBy(0.8)} aria-label="Zoom in">
            +
          </button>
        </div>
        <div className="ow-hint-pill">
          <span className="ow-hint-arrow" aria-hidden>
            ↘
          </span>
          {touch ? 'Pinch out to build it' : 'Scroll out to build it'} · or press Present
        </div>
      </div>
    </div>
  );
}

/** In-world toolbar: breadcrumb (layer path), tools, undo, file menu. */
export function TopBar() {
  const zoneId = useGame((s) => s.zoneId);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const dialOpen = useGame((s) => s.dialOpen);
  const setDialOpen = useGame((s) => s.setDialOpen);
  const sound = useGame((s) => s.plugins.sound);
  const togglePlugin = useGame((s) => s.togglePlugin);
  const setDialogue = useGame((s) => s.setDialogue);
  const [menu, setMenu] = useState(false);
  const location = useGame((s) => s.location);
  const buildMode = useGame((s) => s.buildMode);
  const zone = zoneId && !zoneId.startsWith('room:') ? zoneById.get(zoneId) : null;
  const room = zoneId?.startsWith('room:') ? getHouse().layout.rooms[Number(zoneId.slice(5))] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') setTool('move');
      if (e.key === 'b' || e.key === 'B') toggleBuildMode();
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTool('text');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  return (
    <header className="ow-topbar">
      <div className="ow-crumb ow-panel">
        <span className="ow-crumb-file">Untitled-1</span>
        <span className="ow-dim">›</span>
        <span className="ow-dim">{location === 'house' ? 'House' : 'Island'}</span>
        <span className="ow-dim">›</span>
        <span style={{ color: zone?.color ?? (room ? '#d6a35c' : '#a1a1aa') }}>#</span>
        <span className="ow-crumb-zone">{room?.def.name ?? zone?.name ?? 'Canvas'}</span>
      </div>
      <div className="ow-toolbar ow-panel" role="toolbar" aria-label="Tools">
        <button data-active={tool === 'move'} onClick={() => setTool('move')} title="Move (V): drag props to throw them" aria-label="Move tool">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
            <path d="M3 1.5v11l3-2.7 2.1 4.6 2-.9-2.1-4.5H12z" fill="currentColor" />
          </svg>
        </button>
        <button data-active={tool === 'text'} onClick={() => setTool(tool === 'text' ? 'move' : 'text')} title="Text (T): type, and letters fall from the sky" aria-label="Text tool">
          <span className="ow-tool-t">T</span>
        </button>
        <button onClick={() => emit({ type: 'rewind' })} title="Undo physics (⌘Z)" aria-label="Undo physics">
          ↶
        </button>
        {location === 'house' && (
          <button data-active={buildMode} onClick={() => toggleBuildMode()} title="Building mode (B)" aria-label="Building mode">
            <TabIcon tab="hammer" size={16} />
          </button>
        )}
        <span className="ow-toolbar-sep" />
        <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu" title="Menu">
          ≡
        </button>
      </div>
      {menu && (
        <div className="ow-filemenu ow-panel" role="menu" onClick={() => setMenu(false)}>
          <button role="menuitem" onClick={() => setDialogue('card')}>
            About Tony…
          </button>
          <button role="menuitem" onClick={() => togglePlugin('sound')}>
            Sound: {sound ? 'on' : 'off'}
          </button>
          <button role="menuitem" onClick={() => setDialOpen(!dialOpen)}>
            {dialOpen ? 'Hide' : 'Show'} DialKit
          </button>
          <button role="menuitem" onClick={() => replayIntro()}>
            Flatten to blueprint
          </button>
          <a role="menuitem" href="/classic">
            Classic site
          </a>
        </div>
      )}
      <TextPrompt />
    </header>
  );
}

function TextPrompt() {
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tool === 'text') window.setTimeout(() => input.current?.focus(), 30);
  }, [tool]);
  if (tool !== 'text') return null;
  return (
    <form
      className="ow-textprompt ow-panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) emit({ type: 'spawn-letters', text: text.trim() });
        setText('');
        setTool('move');
        gameState().setTab(null);
      }}
    >
      <span className="ow-tool-t" aria-hidden>
        T
      </span>
      <input
        ref={input}
        value={text}
        maxLength={24}
        placeholder="Type, then Enter. Letters have mass."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setTool('move');
        }}
        aria-label="Text tool"
      />
    </form>
  );
}
