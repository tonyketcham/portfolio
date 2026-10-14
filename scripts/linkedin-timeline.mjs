// Turns a LinkedIn data export's Positions.csv into the generated block of content/timeline.ts.
//   node scripts/linkedin-timeline.mjs path/to/Positions.csv [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'content', 'timeline.ts');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** 'Jun 2021' → '2021-06', '2021' → '2021', '' → null. */
export function parseDate(raw) {
  const s = raw.trim();
  if (!s) return null;
  const year = /\d{4}/.exec(s)?.[0];
  if (!year) return null;
  const month = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return month >= 0 ? `${year}-${String(month + 1).padStart(2, '0')}` : year;
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function rolesFromCsv(text) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const at = { org: col('company name'), role: col('title'), body: col('description'), location: col('location'), start: col('started on'), end: col('finished on') };
  if (at.org < 0 || at.role < 0 || at.start < 0) throw new Error(`Not a LinkedIn Positions.csv (columns: ${header.join(', ')})`);
  const seen = new Map();
  return rows
    .map((r) => {
      const start = parseDate(r[at.start] ?? '');
      if (!start) return null;
      const base = slug(`${r[at.org]}-${start.slice(0, 4)}`);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const body = (r[at.body] ?? '').split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
      return {
        id: n > 1 ? `${base}-${n}` : base,
        start,
        end: parseDate(r[at.end] ?? ''),
        role: r[at.role].trim(),
        org: r[at.org].trim(),
        ...(at.location >= 0 && r[at.location]?.trim() ? { location: r[at.location].trim() } : {}),
        body,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start));
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function renderBlock(roles) {
  const lines = ['// <linkedin>', 'const imported: Role[] = ['];
  for (const r of roles) {
    lines.push('  {');
    lines.push(`    id: ${q(r.id)},`);
    lines.push(`    start: ${q(r.start)},`);
    lines.push(`    end: ${r.end ? q(r.end) : 'null'},`);
    lines.push(`    role: ${q(r.role)},`);
    lines.push(`    org: ${q(r.org)},`);
    if (r.location) lines.push(`    location: ${q(r.location)},`);
    lines.push(r.body.length ? `    body: [\n${r.body.map((p) => `      ${q(p)},`).join('\n')}\n    ],` : '    body: [],');
    lines.push('  },');
  }
  lines.push('];', '// </linkedin>');
  return lines.join('\n');
}

export function replaceBlock(source, block) {
  const re = /\/\/ <linkedin>[\s\S]*?\/\/ <\/linkedin>/;
  if (!re.test(source)) throw new Error('content/timeline.ts has no // <linkedin> … // </linkedin> block');
  return source.replace(re, block);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node scripts/linkedin-timeline.mjs path/to/Positions.csv [--dry]');
    process.exit(1);
  }
  const roles = rolesFromCsv(readFileSync(file, 'utf8'));
  const block = renderBlock(roles);
  if (flag === '--dry') console.log(block);
  else {
    writeFileSync(target, replaceBlock(readFileSync(target, 'utf8'), block));
    console.log(`Wrote ${roles.length} roles to content/timeline.ts`);
    for (const r of roles) console.log(`  ${r.start} – ${r.end ?? 'present'}  ${r.role}, ${r.org}`);
  }
}
