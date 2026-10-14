/**
 * Where Tony has worked, oldest first. Each role is a stone on the hill's lower
 * ledge, wired to the next one in date order, and a page in the book.
 *
 * The block between the `linkedin` markers is generated from a CSV in the shape
 * of LinkedIn's Positions.csv (Company Name, Title, Description, Location,
 * Started On, Finished On). Copy rows from your profile's Experience page into
 * one, or use the data export if your account has it:
 *
 *   node scripts/linkedin-timeline.mjs path/to/Positions.csv
 *
 * Re-running it replaces only that block. Everything outside it (which zone a
 * company wires to, extra paragraphs) is yours and survives the import.
 */
import type { ZoneId } from './zones';

export interface Role {
  id: string;
  /** 'YYYY-MM' or 'YYYY'. */
  start: string;
  /** null while it's current. */
  end: string | null;
  role: string;
  org: string;
  location?: string;
  body: string[];
  /** Copy written as a stand-in; confirm or rewrite. */
  draft?: boolean;
}

// <linkedin>
const imported: Role[] = [
  {
    id: 'karma-lies-2015',
    start: '2015-01',
    end: '2023-12',
    role: 'Creative Developer',
    org: 'Karma Lies',
    location: 'Valparaiso, Indiana, United States',
    body: [
      'Crafted multidisciplinary visual experiences through web, photo, and design',
    ],
  },
  {
    id: 'greatnews-life-2020',
    start: '2020-01',
    end: '2022-02',
    role: 'Full Stack Engineer & IT Manager',
    org: 'GreatNews.Life',
    location: 'Valparaiso, Indiana, United States',
    body: [
      'Cut platform load times by 95%, led an engineering team, launched a SaaS product, evidence-driven UX optimization',
    ],
  },
  {
    id: 'modyfi-2022',
    start: '2022-02',
    end: '2025-04',
    role: 'Founding Software Engineer',
    org: 'Modyfi',
    location: 'Los Angeles, California, United States',
    body: [
      'Next-gen design tools. Acquired by Figma',
    ],
  },
  {
    id: 'figma-2025',
    start: '2025-04',
    end: null,
    role: 'Software Engineer',
    org: 'Figma',
    location: 'Los Angeles, California, United States',
    body: [
      'Built Figma Motion\'s timeline!',
    ],
  },
];
// </linkedin>

/** Companies whose stone wires across the island to their zone's work. Matched case-insensitively. */
export const orgZones: Record<string, ZoneId> = {
  modyfi: 'modyfi',
};

/** Extra paragraphs per role id, added after the imported description. */
export const roleNotes: Record<string, string[]> = {};

const sortKey = (date: string) => (date.length === 4 ? `${date}-01` : date);

export const timeline: Role[] = imported
  .map((r) => ({ ...r, body: [...r.body, ...(roleNotes[r.id] ?? [])] }))
  .sort((a, b) => sortKey(a.start).localeCompare(sortKey(b.start)));

export const zoneForRole = (r: Role): ZoneId | undefined => orgZones[r.org.toLowerCase()];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (date: string) => {
  const [y, m] = date.split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
};

/** 'Jun 2021 – Present', for the book. */
export const roleDates = (r: Role) => `${pretty(r.start)} – ${r.end ? pretty(r.end) : 'Present'}`;

/** '2021–24', short enough to carve on a stone. */
export const roleYears = (r: Role) => {
  const a = r.start.slice(0, 4);
  if (!r.end) return `${a}–`;
  const b = r.end.slice(0, 4);
  return a === b ? a : `${a}–${b.slice(2)}`;
};
