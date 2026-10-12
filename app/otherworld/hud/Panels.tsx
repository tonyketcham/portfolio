'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { tagColors, works, workBySlug } from '@/content/works';
import { zones } from '@/content/zones';
import { useTweaks } from '../debug/tweaks';
import { applyItem, replayIntro, resetSave, travelToWork } from '../state/actions';
import { EFFECTS, EFFECT_PRESETS, effectById } from '../state/effects';
import { sfx } from '../state/events';
import { ITEMS, itemName } from '../state/items';
import { runtime } from '../state/runtime';
import { SKILLS, XP_TABLE, levelForXp, progressToNext } from '../state/skills';
import { PLUGIN_INFO, gameState, totalLevel, useGame, type Plugins, type Tab } from '../state/store';
import { getWorld } from '../world/map';
import { ItemIcon, SkillGlyph, TabIcon } from './icons';
import { longPressHandlers } from './util';

const TABS: { id: Tab; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'skills', label: 'Skills' },
  { id: 'quests', label: 'Quests' },
  { id: 'layers', label: 'Layers' },
  { id: 'effects', label: 'Effects' },
  { id: 'plugins', label: 'Plugins' },
];

export function TabBar() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  return (
    <nav className="ow-tabbar ow-panel" aria-label="Game panels">
      {TABS.map((t) => (
        <button
          key={t.id}
          className="ow-tab"
          data-active={tab === t.id}
          aria-pressed={tab === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => {
            sfx('click');
            setTab(tab === t.id ? null : t.id);
          }}
        >
          <TabIcon tab={t.id} />
        </button>
      ))}
    </nav>
  );
}

export function SidePanel() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  if (!tab) return null;
  const label = TABS.find((t) => t.id === tab)?.label;
  return (
    <section className="ow-sidepanel ow-panel" aria-label={label}>
      <header className="ow-sidepanel-head">
        <span className="ow-title">{label}</span>
        <button className="ow-x" onClick={() => setTab(null)} aria-label="Close panel">
          ×
        </button>
      </header>
      <div className="ow-sidepanel-body">
        {tab === 'inventory' && <Inventory />}
        {tab === 'skills' && <Skills />}
        {tab === 'quests' && <Quests />}
        {tab === 'layers' && <Layers />}
        {tab === 'effects' && <Effects />}
        {tab === 'plugins' && <PluginsPanel />}
      </div>
    </section>
  );
}

// ── inventory ────────────────────────────────────────────────────────────────
function Inventory() {
  const inventory = useGame((s) => s.inventory);
  const openMenu = useGame((s) => s.openMenu);
  return (
    <div className="ow-inv">
      {inventory.map((stack, slot) => {
        if (!stack)
          return <div key={slot} className="ow-inv-slot" data-empty />;
        const def = ITEMS[stack.id];
        const name = itemName(stack);
        const handlers = longPressHandlers(
          (x, y) =>
            openMenu({
              x,
              y,
              options: [
                { verb: def.primary, target: name, tone: 'item', run: () => (gameState().closeMenu(), applyItem(slot, def.primary)) },
                { verb: 'Drop', target: name, tone: 'item', run: () => (gameState().closeMenu(), applyItem(slot, 'Drop')) },
                { verb: 'Examine', target: name, tone: 'item', run: () => (gameState().closeMenu(), applyItem(slot, 'Examine')) },
                { verb: 'Cancel', tone: 'plain', run: () => gameState().closeMenu() },
              ],
            }),
          () => applyItem(slot, def.primary)
        );
        return (
          <button key={slot} className="ow-inv-slot" title={`${def.primary} ${name}`} {...handlers}>
            <ItemIcon id={stack.id} />
          </button>
        );
      })}
      <p className="ow-hint">Tap to use · long-press for options</p>
    </div>
  );
}

// ── skills ───────────────────────────────────────────────────────────────────
function Skills() {
  const skills = useGame((s) => s.skills);
  const [focus, setFocus] = useState(SKILLS[0].id);
  const f = SKILLS.find((s) => s.id === focus)!;
  const xp = skills[focus] ?? 0;
  const lvl = levelForXp(xp);
  return (
    <div className="ow-skills">
      <div className="ow-skills-grid">
        {SKILLS.map((s) => {
          const level = levelForXp(skills[s.id] ?? 0);
          return (
            <button key={s.id} className="ow-skill" data-active={focus === s.id} onClick={() => setFocus(s.id)}>
              <SkillGlyph id={s.id} size={22} />
              <span className="ow-skill-level">
                {level}
                <small>/{level}</small>
              </span>
              <i className="ow-skill-bar" style={{ width: `${progressToNext(skills[s.id] ?? 0) * 100}%`, background: s.color }} />
            </button>
          );
        })}
      </div>
      <div className="ow-pane">
        <div className="ow-pane-title" style={{ color: f.color }}>
          {f.name}
        </div>
        <dl className="ow-props">
          <dt>XP</dt>
          <dd>{Math.floor(xp).toLocaleString()}</dd>
          <dt>Next level</dt>
          <dd>{lvl >= 99 ? 'Max' : XP_TABLE[lvl + 1].toLocaleString()}</dd>
          <dt>Remaining</dt>
          <dd>{lvl >= 99 ? '—' : (XP_TABLE[lvl + 1] - Math.floor(xp)).toLocaleString()}</dd>
        </dl>
        <p className="ow-hint">{f.blurb}</p>
      </div>
      <div className="ow-total">Total level: {totalLevel(skills)}</div>
    </div>
  );
}

// ── quests: every work, by zone ──────────────────────────────────────────────
function Quests() {
  const quests = useGame((s) => s.quests);
  const done = works.filter((w) => quests[w.slug] === 'done').length;
  return (
    <div className="ow-quests">
      <div className="ow-qp">
        Quest points: <b>{done}</b> / {works.length}
      </div>
      {zones.map((zone) => {
        const list = works.filter((w) => w.zone === zone.id);
        if (!list.length) return null;
        return (
          <div key={zone.id} className="ow-quest-zone">
            <div className="ow-quest-zone-name" style={{ '--zone': zone.color } as CSSProperties}>
              {zone.name}
            </div>
            {list.map((w) => {
              const status = quests[w.slug] ?? 'new';
              return (
                <button key={w.slug} className="ow-quest" data-status={status} onClick={() => travelToWork(w.slug)}>
                  <span>{w.title}</span>
                  {w.placeholder && <em>placeholder</em>}
                </button>
              );
            })}
          </div>
        );
      })}
      <p className="ow-hint">Red: unseen · Yellow: nearby · Green: inspected. Tap to cut & paste yourself there.</p>
    </div>
  );
}

// ── layers: the island as a design file ──────────────────────────────────────
const LOOSE_LAYERS = [
  { id: 'critters', name: 'Primitives' },
  { id: 'letters', name: 'Type layers' },
  { id: 'wildlife', name: 'Bezier handles' },
];

function Layers() {
  const world = getWorld();
  const hidden = useGame((s) => s.hidden);
  const locked = useGame((s) => s.locked);
  const toggleHidden = useGame((s) => s.toggleHidden);
  const toggleLocked = useGame((s) => s.toggleLocked);
  const zoneId = useGame((s) => s.zoneId);
  const [open, setOpen] = useState<Record<string, boolean>>({ 'zone:spawn': true });

  const goTo = (id: string) => {
    const g = gameState();
    g.select(id);
    const it = runtime.interactables.get(id);
    const tile = it?.approach?.();
    if (tile) g.walkTo(tile);
    sfx('click');
  };

  return (
    <div className="ow-layers">
      <div className="ow-layers-page">
        <span>Page</span> Untitled-1
      </div>
      {world.layers.map((zone) => {
        const isOpen = open[zone.id] ?? false;
        const zoneHidden = zone.children?.every((c) => hidden[c.id]) ?? false;
        return (
          <div key={zone.id}>
            <div className="ow-layer ow-layer-zone" data-current={zoneId && zone.id === `zone:${zoneId}`}>
              <button className="ow-layer-caret" onClick={() => setOpen((o) => ({ ...o, [zone.id]: !isOpen }))} aria-label="Expand">
                {isOpen ? '▾' : '▸'}
              </button>
              <span className="ow-layer-swatch" style={{ background: zone.color }} />
              <span className="ow-layer-name"># {zone.name}</span>
              <button
                className="ow-layer-icon"
                data-off={zoneHidden}
                aria-label="Toggle visibility"
                onClick={() => zone.children?.forEach((c) => (!!hidden[c.id] === zoneHidden ? toggleHidden(c.id) : null))}
              >
                {zoneHidden ? '◌' : '◉'}
              </button>
            </div>
            {isOpen &&
              zone.children?.map((c) => (
                <div key={c.id} className="ow-layer" data-hidden={!!hidden[c.id]}>
                  <span className="ow-layer-kind">{c.kind === 'work' ? '▢' : '◇'}</span>
                  <button className="ow-layer-name" onClick={() => goTo(c.id)}>
                    {c.name}
                  </button>
                  <button className="ow-layer-icon" data-off={!!locked[c.id]} onClick={() => toggleLocked(c.id)} aria-label="Lock">
                    {locked[c.id] ? '🔒︎' : '·'}
                  </button>
                  <button className="ow-layer-icon" data-off={!!hidden[c.id]} onClick={() => toggleHidden(c.id)} aria-label="Visibility">
                    {hidden[c.id] ? '◌' : '◉'}
                  </button>
                </div>
              ))}
          </div>
        );
      })}
      <div className="ow-layers-page">
        <span>Loose layers</span>
      </div>
      {LOOSE_LAYERS.map((l) => (
        <div key={l.id} className="ow-layer" data-hidden={!!hidden[l.id]}>
          <span className="ow-layer-kind">◇</span>
          <span className="ow-layer-name">{l.name}</span>
          <button className="ow-layer-icon" data-off={!!locked[l.id]} onClick={() => toggleLocked(l.id)} aria-label="Lock">
            {locked[l.id] ? '🔒︎' : '·'}
          </button>
        </div>
      ))}
      <p className="ow-hint">◉ hides a layer in the world. Locked layers can’t be clicked. Tap a name to walk to it.</p>
    </div>
  );
}

// ── the Modyfi stack ─────────────────────────────────────────────────────────
const touched = new Set<string>();
function Effects() {
  const effects = useGame((s) => s.effects);
  const setEffect = useGame((s) => s.setEffect);
  const moveEffect = useGame((s) => s.moveEffect);
  const applyPreset = useGame((s) => s.applyPreset);
  const pixelScale = useTweaks((t) => t['Modyfi stack'].pixelScale);

  const reward = (id: string) => {
    if (touched.has(id)) return;
    touched.add(id);
    gameState().addXp('shaders', 10);
  };

  return (
    <div className="ow-fx">
      <div className="ow-chips">
        {Object.entries(EFFECT_PRESETS).map(([key, p]) => (
          <button
            key={key}
            className="ow-chip"
            onClick={() => {
              applyPreset(key);
              reward(`preset:${key}`);
              sfx('click');
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="ow-fx-row ow-fx-res">
        <span className="ow-fx-name">Pixel size</span>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={pixelScale}
          aria-label="Render resolution"
          onChange={(e) =>
            useTweaks.setState((t) => ({ 'Modyfi stack': { ...t['Modyfi stack'], pixelScale: Number(e.target.value) } }))
          }
        />
        <span className="ow-fx-val">{Math.round(1 / pixelScale)}×</span>
      </div>
      <ol className="ow-fx-stack">
        {effects.map((layer, i) => {
          const def = effectById.get(layer.id)!;
          return (
            <li key={layer.id} className="ow-fx-row" data-on={layer.enabled} title={def.blurb}>
              <button
                className="ow-fx-eye"
                aria-pressed={layer.enabled}
                aria-label={`Toggle ${def.name}`}
                onClick={() => {
                  setEffect(layer.id, { enabled: !layer.enabled });
                  reward(layer.id);
                  sfx('click');
                }}
              >
                {layer.enabled ? '◉' : '◌'}
              </button>
              <span className="ow-fx-name">{def.name}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.amount}
                aria-label={`${def.name} amount`}
                onChange={(e) => setEffect(layer.id, { amount: Number(e.target.value), enabled: true })}
              />
              <span className="ow-fx-move">
                <button disabled={i === 0} onClick={() => moveEffect(layer.id, -1)} aria-label="Move up">
                  ↑
                </button>
                <button disabled={i === effects.length - 1} onClick={() => moveEffect(layer.id, 1)} aria-label="Move down">
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="ow-hint">
        Every row is a real shader pass over the world, applied top to bottom. {EFFECTS.length} effects, one draw call.
      </p>
    </div>
  );
}

// ── plugins ──────────────────────────────────────────────────────────────────
function PluginsPanel() {
  const plugins = useGame((s) => s.plugins);
  const toggle = useGame((s) => s.togglePlugin);
  const dialOpen = useGame((s) => s.dialOpen);
  const setDialOpen = useGame((s) => s.setDialOpen);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="ow-plugins">
      {(Object.keys(PLUGIN_INFO) as (keyof Plugins)[]).map((key) => (
        <label key={key} className="ow-plugin">
          <span>
            <b>{PLUGIN_INFO[key].name}</b>
            <small>{PLUGIN_INFO[key].blurb}</small>
          </span>
          <input type="checkbox" checked={plugins[key]} onChange={() => toggle(key)} />
          <i className="ow-switch" aria-hidden />
        </label>
      ))}
      <div className="ow-plugin-actions">
        <button className="ow-btn" onClick={() => setDialOpen(!dialOpen)}>
          {dialOpen ? 'Close' : 'Open'} DialKit
        </button>
        <button className="ow-btn" onClick={() => replayIntro()}>
          Replay intro
        </button>
        <a className="ow-btn" href="/classic">
          Classic site
        </a>
        <button
          className="ow-btn ow-btn-danger"
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true);
            resetSave();
            setConfirmReset(false);
          }}
        >
          {confirmReset ? 'Really wipe?' : 'Reset save'}
        </button>
      </div>
    </div>
  );
}

/** Used by the inspector: works wired to this one. */
export function useConnections(slug: string) {
  return useMemo(() => {
    const world = getWorld();
    return world.edges
      .filter((e) => e.kind === 'link' && (e.a === slug || e.b === slug))
      .map((e) => {
        const other = e.a === slug ? e.b : e.a;
        const work = workBySlug.get(other)!;
        const shared = work.tags.find((t) => workBySlug.get(slug)?.tags.includes(t));
        return { work, color: (shared && tagColors[shared]) || e.color, tag: shared };
      });
  }, [slug]);
}

