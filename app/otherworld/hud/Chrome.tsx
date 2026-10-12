'use client';

/**
 * Design-tool chrome: the boot screen, the intro's editor shell (the flat
 * artboard you zoom out of), and the in-world toolbar.
 */
import { useEffect, useRef, useState } from 'react';
import { zoneById } from '@/content/zones';
import { replayIntro } from '../state/actions';
import { emit, sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { SelectionOverlay } from './Overlays';
import { isTouchDevice, useRaf } from './util';

const BOOT_LINES = [
  'Rasterising tiles…',
  'Brewing tea…',
  'Detaching instances…',
  'Teaching a cursor to walk…',
  'Compiling 41 shaders…',
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
        Untitled-1.canvas
      </div>
      <div className="ow-boot-bar">
        <i />
      </div>
      <div className="ow-boot-line">{BOOT_LINES[line]}</div>
    </div>
  );
}

/** The editor you start in: one selected artboard on an infinite canvas. */
export function IntroChrome() {
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
          <span className="ow-dim">— Edited</span>
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
          # Frame 1 (final)
        </div>
        <div className="ow-editor-layer ow-indent">✧ Tony (wordmark)</div>
        <div className="ow-editor-layer ow-indent">▣ Amanita</div>
        <div className="ow-editor-layer ow-indent">T Bio</div>
        <div className="ow-editor-layer ow-indent">◇ he / they</div>
        <div className="ow-editor-section">Pages</div>
        <div className="ow-editor-layer">Untitled-1</div>
      </aside>
      <aside className="ow-editor-right-panel ow-desktop-only">
        <div className="ow-editor-section">Frame</div>
        <dl className="ow-props">
          <dt>W</dt>
          <dd>1440</dd>
          <dt>H</dt>
          <dd>900</dd>
          <dt>Fill</dt>
          <dd>
            <i className="ow-swatch" style={{ background: '#09090b' }} /> 09090B
          </dd>
          <dt>Clip</dt>
          <dd>Off</dd>
        </dl>
        <div className="ow-editor-section">Effects</div>
        <dl className="ow-props">
          <dt>Unfold</dt>
          <dd>On zoom out</dd>
          <dt>Depth</dt>
          <dd>2.5D → 3D</dd>
        </dl>
      </aside>
      <SelectionOverlay forceId="fixture:hero" />
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
          {touch ? 'Pinch to zoom out' : 'Scroll to zoom out'} · or double-tap the frame
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
  const zone = zoneId ? zoneById.get(zoneId) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') setTool('move');
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
        <span style={{ color: zone?.color ?? '#a1a1aa' }}>#</span>
        <span className="ow-crumb-zone">{zone?.name ?? 'Canvas'}</span>
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
            Flatten to artboard
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
