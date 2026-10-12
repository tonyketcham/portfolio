'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { tagColors, workBySlug, type ArtFx } from '@/content/works';
import { zoneById } from '@/content/zones';
import { useArtFx } from '../state/artfx';
import { emit, sfx } from '../state/events';
import { runtime } from '../state/runtime';
import { gameState, useGame } from '../state/store';
import { getWorld } from '../world/map';
import { useConnections } from './Panels';

const FX_ROWS: { key: keyof ArtFx; label: string }[] = [
  { key: 'halftone', label: 'Halftone' },
  { key: 'gradient', label: 'Gradient map' },
  { key: 'displace', label: 'Displace' },
  { key: 'dither', label: 'Dither' },
  { key: 'chroma', label: 'Chroma' },
  { key: 'scan', label: 'Scanlines' },
];

function walkAlongWire(slug: string) {
  const world = getWorld();
  const p = world.placements.find((pl) => pl.work.slug === slug);
  if (!p) return;
  const g = gameState();
  g.inspect(null);
  emit({ type: 'release-camera' });
  g.say(`You follow the wire toward ${p.work.title}.`);
  g.walkTo(p.approach, () => {
    const it = runtime.interactables.get(`work:${slug}`);
    it?.actions.find((a) => a.verb === 'Inspect')?.run();
  });
}

export function Inspector() {
  const slug = useGame((s) => s.inspecting);
  const inspect = useGame((s) => s.inspect);
  const work = slug ? workBySlug.get(slug) : undefined;
  const overrides = useArtFx((s) => (slug ? s.overrides[slug] : undefined));
  const patch = useArtFx((s) => s.patch);
  const reset = useArtFx((s) => s.reset);
  const connections = useConnections(slug ?? '');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'design' | 'stack' | 'wires'>('design');

  useEffect(() => {
    setTab('design');
    setCopied(false);
  }, [slug]);

  if (!work) return null;
  const zone = zoneById.get(work.zone);
  const fx = { ...work.fx, ...overrides };
  const cover = work.media[0];
  const close = () => {
    inspect(null);
    emit({ type: 'release-camera' });
    sfx('click');
  };

  return (
    <aside className="ow-inspector ow-panel" aria-label={`${work.title} details`}>
      <header className="ow-insp-head">
        <div className="ow-insp-crumb">
          <span style={{ color: zone?.color }}>#</span> {zone?.name} <span className="ow-dim">/</span> ▢ {work.title}
        </div>
        <button className="ow-x" onClick={close} aria-label="Close inspector">
          ×
        </button>
      </header>
      <h2 className="ow-insp-title">{work.title}</h2>
      <div className="ow-insp-badges">
        {work.role && <span className="ow-badge">{work.role}</span>}
        {work.year && <span className="ow-badge">{work.year}</span>}
        {work.placeholder && <span className="ow-badge ow-badge-blue">placeholder</span>}
        {work.draft && <span className="ow-badge ow-badge-amber">draft copy</span>}
      </div>
      <p className="ow-insp-summary">{work.summary}</p>
      {!!work.links?.length && (
        <div className="ow-insp-links">
          {work.links.map((l) => (
            <a key={l.href} className="ow-btn ow-btn-primary" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      <div className="ow-insp-tabs" role="tablist">
        {(['design', 'stack', 'wires'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} data-active={tab === t} onClick={() => setTab(t)}>
            {t === 'design' ? 'Design' : t === 'stack' ? 'Stack' : `Wires · ${connections.length}`}
          </button>
        ))}
      </div>

      {tab === 'design' && (
        <dl className="ow-props ow-pane">
          <dt>Frame</dt>
          <dd>{work.slug}</dd>
          <dt>Zone</dt>
          <dd>{zone?.name}</dd>
          <dt>Media</dt>
          <dd>{cover.kind === 'mux' ? 'Video (HLS)' : cover.kind === 'image' ? 'Image' : `Procedural · ${cover.pattern}`}</dd>
          <dt>Tags</dt>
          <dd className="ow-tags">
            {work.tags.map((t) => (
              <span key={t} className="ow-tag" style={{ '--tag': tagColors[t] ?? '#71717a' } as CSSProperties}>
                {t}
              </span>
            ))}
          </dd>
          <dt>Examine</dt>
          <dd className="ow-dim">{work.examine}</dd>
        </dl>
      )}

      {tab === 'stack' && (
        <div className="ow-pane ow-insp-stack">
          {FX_ROWS.map((row) => (
            <label key={row.key} className="ow-fx-row" data-on={(fx[row.key] as number | undefined ?? 0) > 0}>
              <span className="ow-fx-name">{row.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={(fx[row.key] as number | undefined) ?? 0}
                onChange={(e) => {
                  patch(work.slug, { [row.key]: Number(e.target.value) });
                }}
                onPointerUp={() => gameState().addXp('shaders', 2)}
              />
              <span className="ow-fx-val">{Math.round(((fx[row.key] as number | undefined) ?? 0) * 100)}</span>
            </label>
          ))}
          <button className="ow-btn" onClick={() => reset(work.slug)}>
            Reset stack
          </button>
          <p className="ow-hint">This piece’s own Modyfi stack. Live, on the GPU, just for this frame.</p>
        </div>
      )}

      {tab === 'wires' && (
        <div className="ow-pane ow-insp-wires">
          {connections.length === 0 && <p className="ow-hint">No wires yet. Add shared tags or `connects` in content/works.ts.</p>}
          {connections.map((c) => (
            <button key={c.work.slug} className="ow-wire" onClick={() => walkAlongWire(c.work.slug)}>
              <i style={{ background: c.color }} />
              <span>{c.work.title}</span>
              <small>{c.tag ?? 'nearby'}</small>
            </button>
          ))}
          <p className="ow-hint">Tap a wire to walk it.</p>
        </div>
      )}

      <footer className="ow-insp-foot">
        <button
          className="ow-btn"
          onClick={() => {
            const url = `${window.location.origin}/?work=${work.slug}`;
            navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <span className="ow-dim ow-desktop-only">Esc to close</span>
      </footer>
    </aside>
  );
}
