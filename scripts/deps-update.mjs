#!/usr/bin/env node
/**
 * Dependency refresh runner (written for Windows 11 + PowerShell, runs anywhere).
 *
 *   node scripts/deps-update.mjs            (or: pnpm deps:update)
 *   node scripts/deps-update.mjs --dry-run  copy only, print the plan, run no pnpm
 *
 * Copies this project to a sibling folder (`../portfolio-deps`) and runs the whole
 * install / audit / update / typecheck / build cycle THERE, so the folder you launch
 * it from is never touched. Each step is teed to `<copy>/.deps-logs/NN-<name>.log`
 * and `.deps-logs/summary.json` collects exit codes, audit counts and the version diff.
 * Re-runs wipe the previous copy but keep its node_modules for a faster install.
 *
 * Pinned packages: pnpm's docs show `!pkg` exclusions only for plain `pnpm update`,
 * not `--latest`, so we update everything and then re-pin the 3D stack afterwards.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const copy = path.resolve(root, '..', 'portfolio-deps');
const logDir = path.join(copy, '.deps-logs');
const dryRun = process.argv.includes('--dry-run') || process.env.DEPS_DRY_RUN === '1';

// Never copied (matched by name at any depth). The copy folder itself is skipped by path.
const SKIP = new Set(['node_modules', '.next', '.dev-logs', '.git', '.deps-logs']);

// The 3D rewrite is developed against these, so they are put back after the blanket update.
const PINNED = { three: '^0.185.1', '@react-three/fiber': '^9.8.1', '@react-three/rapier': '^2.2.0', dialkit: '^2.0.1' };
const PINNED_DEV = { '@types/three': '^0.185.0' };

// Specs are double-quoted: on Windows `shell: true` runs through cmd.exe, where a bare ^ is
// the escape character and would silently turn ^0.185.1 into 0.185.1. `-w` is only added
// when pnpm-workspace.yaml exists (pnpm 10 audit --fix may create it), as pnpm can refuse
// to add to a workspace root without it.
const rootFlag = () => (fs.existsSync(path.join(copy, 'pnpm-workspace.yaml')) ? ' -w' : '');
const add = (dev, pins) => () =>
  `pnpm add${dev ? ' -D' : ''}${rootFlag()} ${Object.entries(pins).map(([n, r]) => `"${n}@${r}"`).join(' ')}`;

// CI=1 makes pnpm imply --frozen-lockfile, which would reject the stale lockfile.
const INSTALL = 'pnpm install --no-frozen-lockfile';

// install: 'baseline' | 'final'  records whether that install worked.
// needs:   'baseline' | 'final'  skips the step unless that install worked.
// okNonZero: audit/outdated exit non-zero when they find something; that is not a failure.
// save:    also write raw stdout (no stderr noise) to .deps-logs/<save>.
const STEPS = [
  { name: 'env-pnpm', cmd: 'pnpm --version' },
  { name: 'env-node', cmd: 'node --version' },
  { name: 'install-baseline', cmd: INSTALL, install: 'baseline' },
  { name: 'audit-before', cmd: 'pnpm audit --json', needs: 'baseline', okNonZero: true, save: 'audit-before.json' },
  { name: 'outdated-before', cmd: 'pnpm outdated --format json', needs: 'baseline', okNonZero: true, save: 'outdated-before.json' },
  { name: 'audit-fix', cmd: 'pnpm audit --fix', needs: 'baseline', okNonZero: true },
  { name: 'update-latest', cmd: 'pnpm update --latest', needs: 'baseline' },
  { name: 'repin-deps', cmd: add(false, PINNED), needs: 'baseline' },
  { name: 'repin-dev', cmd: add(true, PINNED_DEV), needs: 'baseline' },
  { name: 'install-final', cmd: INSTALL, needs: 'baseline', install: 'final' },
  { name: 'audit-after', cmd: 'pnpm audit --json', needs: 'final', okNonZero: true, save: 'audit-after.json' },
  { name: 'outdated-after', cmd: 'pnpm outdated --format json', needs: 'final', okNonZero: true, save: 'outdated-after.json' },
  { name: 'tsc', cmd: 'pnpm exec tsc --noEmit', needs: 'final' },
  { name: 'lint', cmd: 'pnpm lint', needs: 'final' },
  { name: 'build', cmd: 'pnpm build', needs: 'final' },
];

const env = {
  ...process.env,
  CI: '1', // no prompts
  FORCE_COLOR: '0',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  npm_config_confirm_modules_purge: 'false', // a reused node_modules may need purging and there is no TTY to confirm
};

const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const readJson = (file) => { try { return JSON.parse(readText(file)); } catch { return null; } };
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;

// ---- 1. copy -------------------------------------------------------------------------------
function prepareCopy() {
  if (path.relative(root, copy) === '') throw new Error(`Refusing to run: ${root} is its own copy target`);
  if (fs.existsSync(copy)) {
    // Wipe the old copy but keep node_modules so reinstalls are fast.
    for (const entry of fs.readdirSync(copy)) {
      if (entry === 'node_modules') continue;
      fs.rmSync(path.join(copy, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  const skipped = [];
  let files = 0;
  fs.cpSync(root, copy, {
    recursive: true,
    filter: (src) => {
      if (path.resolve(src) === root) return true;
      if (SKIP.has(path.basename(src)) || path.resolve(src) === copy) {
        skipped.push(path.relative(root, src));
        return false;
      }
      if (fs.lstatSync(src).isFile()) files++;
      return true;
    },
  });
  console.log(`Copied ${files} files\n  from ${root}\n  to   ${copy}\nSkipped: ${skipped.join(', ') || '(nothing)'}`);
}

// ---- 2. run one step -----------------------------------------------------------------------
function run(step, n) {
  const cmd = typeof step.cmd === 'function' ? step.cmd() : step.cmd;
  const log = path.join(logDir, `${n}-${step.name}.log`);
  fs.writeFileSync(log, `$ ${cmd}\n\n`);
  console.log(`\n\x1b[36m==> [${n}] ${cmd}\x1b[0m`);
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const finish = (exitCode, note) => {
      if (settled) return;
      settled = true;
      const durationMs = Date.now() - started;
      if (step.save) fs.writeFileSync(path.join(logDir, step.save), stdout);
      const status = exitCode === 0 ? 'ok' : exitCode !== null && step.okNonZero ? 'ok-nonzero' : 'failed';
      fs.appendFileSync(log, `\n[exit ${exitCode}${note ? `, ${note}` : ''}, ${sec(durationMs)}]\n`);
      resolve({ stdout, record: { n, name: step.name, cmd, status, exitCode, durationMs, log: path.relative(copy, log) } });
    };
    const child = spawn(cmd, { cwd: copy, shell: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text) => { stdout += text; fs.appendFileSync(log, text); process.stdout.write(text); });
    child.stderr.on('data', (text) => { fs.appendFileSync(log, text); process.stderr.write(text); });
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code, signal) => finish(code, signal ?? ''));
  });
}

// ---- 3. parsing helpers (all defensive: pnpm's JSON shape differs between versions) ---------
function parseJsonLoose(text) {
  for (const candidate of [text, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]) {
    try { return JSON.parse(candidate); } catch { /* try the next candidate */ }
  }
  return null;
}

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
function auditCounts(file) {
  const data = parseJsonLoose(readText(path.join(logDir, file)) ?? '');
  if (!data || data.error) return { parsed: false, error: data?.error?.message ?? 'missing or unparseable JSON' };
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const meta = data.metadata?.vulnerabilities;
  if (meta && typeof meta === 'object') {
    for (const s of SEVERITIES) counts[s] = Number(meta[s]) || 0;
  } else {
    // No metadata block: count advisories (pnpm/npm 6 shape) or vulnerabilities (npm 7+ shape).
    for (const item of Object.values(data.advisories ?? data.vulnerabilities ?? {})) {
      const s = String(item?.severity ?? '').toLowerCase();
      if (s in counts) counts[s]++;
    }
  }
  return { parsed: true, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

function outdatedMap(...files) {
  for (const file of files) {
    const data = parseJsonLoose(readText(path.join(logDir, file)) ?? '');
    if (data) return { source: file, map: Array.isArray(data) ? Object.fromEntries(data.map((e) => [e.packageName ?? e.name, e])) : data };
  }
  return { source: null, map: {} };
}

// Overrides can live in package.json (`pnpm.overrides` / `overrides`) or, with pnpm 10+, in
// pnpm-workspace.yaml. The YAML side is a tiny line parser for the top-level `overrides:` map.
function readOverrides() {
  const pkg = readJson(path.join(copy, 'package.json')) ?? {};
  const out = { ...pkg.overrides, ...pkg.pnpm?.overrides };
  let inBlock = false;
  for (const line of (readText(path.join(copy, 'pnpm-workspace.yaml')) ?? '').split(/\r?\n/)) {
    if (/^overrides:\s*$/.test(line)) { inBlock = true; continue; }
    if (inBlock && /^[^\s#]/.test(line)) inBlock = false;
    const m = inBlock && line.match(/^\s+(["']?)(.+?)\1:\s+(["']?)(.+?)\3\s*$/);
    if (m) out[m[2]] = m[4];
  }
  return out;
}

function diffMaps(a = {}, b = {}) {
  const d = { added: {}, removed: {}, changed: {} };
  for (const [name, to] of Object.entries(b)) {
    if (!(name in a)) d.added[name] = to;
    else if (a[name] !== to) d.changed[name] = { from: a[name], to };
  }
  for (const name of Object.keys(a)) if (!(name in b)) d.removed[name] = a[name];
  return d;
}

// ---- 4. main -------------------------------------------------------------------------------
prepareCopy();

if (dryRun) {
  console.log('\n--dry-run: no pnpm commands were run. Plan:');
  STEPS.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2, '0')} ${s.name.padEnd(17)} ${typeof s.cmd === 'function' ? s.cmd() : s.cmd}${s.needs ? `   [needs ${s.needs} install]` : ''}`));
  process.exit(0);
}

fs.mkdirSync(logDir, { recursive: true });
fs.copyFileSync(path.join(copy, 'package.json'), path.join(logDir, 'package.before.json'));
const pkgBefore = readJson(path.join(copy, 'package.json')) ?? {};
const overridesBefore = readOverrides();
let overridesAfterFix = null;
let pnpmVersion = null;
const ok = { baseline: false, final: false };
const records = [];

for (const [i, step] of STEPS.entries()) {
  const n = String(i + 1).padStart(2, '0');
  if (step.needs && !ok[step.needs]) {
    console.log(`\n\x1b[33m==> [${n}] ${step.name}: SKIPPED (needs a successful ${step.needs} install)\x1b[0m`);
    records.push({ n, name: step.name, status: 'skipped', exitCode: null, durationMs: 0, reason: `${step.needs} install did not succeed` });
    continue;
  }
  const { stdout, record } = await run(step, n);
  records.push(record);
  if (step.install) ok[step.install] = record.exitCode === 0;
  if (step.name === 'env-pnpm') pnpmVersion = stdout.trim();
  if (step.name === 'audit-fix') overridesAfterFix = readOverrides();
}

fs.copyFileSync(path.join(copy, 'package.json'), path.join(logDir, 'package.after.json'));
const pkgAfter = readJson(path.join(copy, 'package.json')) ?? {};
const overridesFinal = readOverrides();

// Did the re-pin stick, and do the pinned packages have newer releases we deliberately skipped?
const pinTargets = [
  ...Object.entries(PINNED).map(([name, range]) => ({ name, range, section: 'dependencies' })),
  ...Object.entries(PINNED_DEV).map(([name, range]) => ({ name, range, section: 'devDependencies' })),
];
const outdated = outdatedMap('outdated-after.json', 'outdated-before.json');
const pins = { mismatches: [], newerAvailable: [], outdatedSource: outdated.source };
for (const { name, range, section } of pinTargets) {
  const actual = pkgAfter[section]?.[name];
  if (actual !== range) pins.mismatches.push({ name, expected: range, actual: actual ?? null });
  const o = outdated.map[name];
  if (o?.latest && o.latest !== o.current) pins.newerAvailable.push({ name, pinned: range, current: o.current, latest: o.latest });
}

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  pnpm: pnpmVersion,
  copy,
  steps: records,
  audit: { before: auditCounts('audit-before.json'), after: auditCounts('audit-after.json') },
  dependencies: {
    dependencies: diffMaps(pkgBefore.dependencies, pkgAfter.dependencies),
    devDependencies: diffMaps(pkgBefore.devDependencies, pkgAfter.devDependencies),
  },
  overrides: { before: overridesBefore, afterAuditFix: overridesAfterFix, final: overridesFinal, added: diffMaps(overridesBefore, overridesFinal) },
  pins,
};
fs.writeFileSync(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2));

// ---- 5. human summary ----------------------------------------------------------------------
const fmt = (a) => (a.parsed ? `${SEVERITIES.slice().reverse().map((s) => `${s} ${a.counts[s]}`).join(', ')} (total ${a.total})` : `n/a (${a.error})`);
const changedCount = (d) => Object.keys(d.added).length + Object.keys(d.removed).length + Object.keys(d.changed).length;
console.log('\n===== deps-update summary =====');
for (const r of records) console.log(`${r.n} ${r.name.padEnd(17)} ${r.status.padEnd(10)} exit ${String(r.exitCode ?? '-').padEnd(4)} ${sec(r.durationMs)}`);
console.log(`\nAudit before: ${fmt(summary.audit.before)}\nAudit after:  ${fmt(summary.audit.after)}`);
console.log(`Dependency changes: ${changedCount(summary.dependencies.dependencies)} deps, ${changedCount(summary.dependencies.devDependencies)} devDeps`);
console.log(`Overrides added: ${Object.entries(summary.overrides.added.added).map(([k, v]) => `${k} -> ${v}`).join(', ') || 'none'}`);
console.log(`Pins that did not stick: ${pins.mismatches.map((m) => `${m.name} (${m.actual})`).join(', ') || 'none'}`);
console.log(`Pinned but newer exists: ${pins.newerAvailable.map((p) => `${p.name} ${p.current} -> ${p.latest}`).join(', ') || 'none'}`);
console.log(`\nLogs and summary.json: ${logDir}`);
process.exitCode = records.some((r) => r.status === 'failed') ? 1 : 0;
