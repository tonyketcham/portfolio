/**
 * Tony's README: the book every object on the hill opens. Contents, then the
 * chapters (content/profile.ts), the timeline (content/timeline.ts) and a
 * contact page, cut into pages that fit a spread.
 */
import { profile, type Chapter } from '@/content/profile';
import { roleDates, timeline, type Role } from '@/content/timeline';

export type BookPage =
  | { kind: 'contents'; key: '' }
  | { kind: 'text'; key: string; title?: string; subtitle?: string; paras: string[]; draft?: boolean; first: boolean }
  | { kind: 'contact'; key: 'contact' };

export const chapterKey = (c: Chapter) => `chapter:${c.id}`;
export const roleKey = (r: Role) => `role:${r.id}`;

/** Characters that fit on a page under a title, and on a page without one. */
const BUDGET = { titled: 600, plain: 820 };

function sentences(p: string) {
  return p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [p];
}

/** Paragraphs → pages, splitting long paragraphs between sentences. */
function paginate(paras: string[]) {
  const pages: string[][] = [[]];
  let room = BUDGET.titled;
  const push = (text: string) => {
    if (text.length > room && pages[pages.length - 1].length) {
      pages.push([]);
      room = BUDGET.plain;
    }
    pages[pages.length - 1].push(text);
    room -= text.length + 40; // a paragraph break costs about a line
  };
  for (const p of paras) {
    if (p.length <= Math.max(room, BUDGET.titled)) push(p);
    else {
      let chunk = '';
      for (const s of sentences(p)) {
        if (chunk && (chunk + ' ' + s).length > room) {
          push(chunk);
          chunk = s;
        } else chunk = chunk ? `${chunk} ${s}` : s;
      }
      if (chunk) push(chunk);
    }
  }
  return pages;
}

function section(key: string, title: string, paras: string[], extra: { subtitle?: string; draft?: boolean } = {}): BookPage[] {
  return paginate(paras).map((chunk, i) => ({
    kind: 'text',
    key,
    title: i === 0 ? title : undefined,
    subtitle: i === 0 ? extra.subtitle : undefined,
    paras: chunk,
    draft: extra.draft,
    first: i === 0,
  }));
}

const order: Chapter['at'][] = ['plinth', 'variant', 'note'];
export const chapters = [...profile.chapters].sort((a, b) => order.indexOf(a.at) - order.indexOf(b.at));

export function buildBook(): BookPage[] {
  const pages: BookPage[] = [{ kind: 'contents', key: '' }];
  for (const c of chapters) pages.push(...section(chapterKey(c), c.title, c.body, { draft: c.draft }));
  for (const r of timeline)
    pages.push(
      ...section(roleKey(r), r.role, r.body.length ? r.body : ['…'], {
        subtitle: [r.org, roleDates(r), r.location].filter(Boolean).join(' · '),
        draft: r.draft,
      })
    );
  pages.push({ kind: 'contact', key: 'contact' });
  return pages;
}

/** Everything that counts towards having read the whole book. */
export const readableKeys = [...chapters.map(chapterKey), ...timeline.map(roleKey)];
