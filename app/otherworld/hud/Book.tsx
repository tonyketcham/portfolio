'use client';

import { useEffect, useMemo, useState } from 'react';
import { profile } from '@/content/profile';
import { roleYears, timeline } from '@/content/timeline';
import { sfx } from '../state/events';
import { gameState, useGame } from '../state/store';
import { buildBook, chapterKey, chapters, readableKeys, roleKey, type BookPage } from './bookPages';

/** One page per view on phones, a two-page spread otherwise. */
function useSpread() {
  const [two, setTwo] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 760px)');
    const update = () => setTwo(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return two ? 2 : 1;
}

function Contents({ go, read }: { go: (key: string) => void; read: Record<string, true> }) {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  return (
    <>
      <h2 className="ow-book-title">{profile.name}</h2>
      <p className="ow-book-subtitle">{profile.lines.join(' · ')}</p>
      <ol className="ow-book-contents">
        {chapters.map((c) => (
          <li key={c.id}>
            <button onClick={() => go(chapterKey(c))}>
              {c.title}
              {read[chapterKey(c)] && <span className="ow-book-tick"> ✓</span>}
            </button>
          </li>
        ))}
        {first && (
          <li>
            <button onClick={() => go(roleKey(first))}>
              Timeline, {first.start.slice(0, 4)}–{last.end ? last.end.slice(0, 4) : 'now'}
            </button>
            <ol className="ow-book-contents-sub">
              {timeline.map((r) => (
                <li key={r.id}>
                  <button onClick={() => go(roleKey(r))}>
                    {roleYears(r)} {r.org}
                    {read[roleKey(r)] && <span className="ow-book-tick"> ✓</span>}
                  </button>
                </li>
              ))}
            </ol>
          </li>
        )}
        <li>
          <button onClick={() => go('contact')}>Get in touch</button>
        </li>
      </ol>
    </>
  );
}

function Contact() {
  return (
    <>
      <h2 className="ow-book-title">Get in touch</h2>
      <p>Pick a link and it opens in a new tab. The mailbox at the foot of the hill takes letters too.</p>
      <ul className="ow-book-links">
        {profile.links.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          </li>
        ))}
        <li>
          <a href="/classic">The classic site</a>
        </li>
      </ul>
    </>
  );
}

function Page({ page, n, go, read }: { page?: BookPage; n: number; go: (key: string) => void; read: Record<string, true> }) {
  return (
    <section className="ow-book-page">
      {page?.kind === 'contents' && <Contents go={go} read={read} />}
      {page?.kind === 'contact' && <Contact />}
      {page?.kind === 'text' && (
        <>
          {page.title && <h2 className="ow-book-title">{page.title}</h2>}
          {page.subtitle && <p className="ow-book-subtitle">{page.subtitle}</p>}
          {page.draft && page.first && <p className="ow-book-draft">draft copy</p>}
          {page.paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </>
      )}
      {page && <span className="ow-book-folio">{n}</span>}
    </section>
  );
}

export function Book() {
  const at = useGame((s) => s.book);
  const read = useGame((s) => s.bookRead);
  const close = useGame((s) => s.closeBook);
  const pages = useMemo(buildBook, []);
  const per = useSpread();
  const [index, setIndex] = useState(0);
  const open = at !== null;

  // open at the page asked for, on the spread that holds it
  useEffect(() => {
    if (at === null) return;
    const i = Math.max(0, pages.findIndex((p) => p.key === at));
    setIndex(i - (i % per));
  }, [at, pages, per]);

  const shown = pages.slice(index, index + per);

  // reading a chapter's first page counts as reading it
  useEffect(() => {
    if (!open) return;
    const g = gameState();
    for (const p of shown) {
      if (p.kind !== 'text' || !p.first || !g.markRead(p.key)) continue;
      g.addXp('curiosity', 12);
      if (readableKeys.every((k) => gameState().bookRead[k])) {
        g.say(`You have read all of ${profile.handle}'s README. You know him slightly too well now.`, 'fx');
        g.addXp('curiosity', 60);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, per]);

  const turn = (dir: 1 | -1) => {
    const next = index + dir * per;
    if (next < 0 || next >= pages.length) return;
    sfx('page', dir > 0 ? 1 : 0.9);
    setIndex(next);
  };
  const go = (key: string) => {
    const i = pages.findIndex((p) => p.key === key);
    if (i < 0) return;
    sfx('page');
    setIndex(i - (i % per));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') turn(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // capture, so the camera's arrow keys and Escape's other jobs wait their turn
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;
  return (
    <>
      <div className="ow-book-backdrop" onPointerDown={close} />
      <div className="ow-book" role="dialog" aria-modal="true" aria-label={`${profile.handle}'s README`} data-per={per}>
        <div className="ow-book-spread">
          {shown.map((p, i) => (
            <Page key={index + i} page={p} n={index + i + 1} go={go} read={read} />
          ))}
          {shown.length < per && <Page n={0} go={go} read={read} />}
        </div>
        <button className="ow-book-turn ow-book-prev" onClick={() => turn(-1)} disabled={index === 0} aria-label="Previous page">
          ◀
        </button>
        <button className="ow-book-turn ow-book-next" onClick={() => turn(1)} disabled={index + per >= pages.length} aria-label="Next page">
          ▶
        </button>
        <button className="ow-book-close" onClick={close} aria-label="Close book">
          ✕
        </button>
      </div>
    </>
  );
}
