import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { applyEdits, catalog, extractFields } from './catalog.mjs';
import { repository } from './repository.mjs';
import { instrument } from './instrument.mjs';
import { createGameClock } from './pause.mjs';

const execute = promisify(execFile);
async function fixture(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'otherworld-cms-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const root = path.join(folder, 'work');
  const remote = path.join(folder, 'remote.git');
  await mkdir(path.join(root, 'content'), { recursive: true });
  await mkdir(path.join(root, 'app'));
  await writeFile(path.join(root, 'content/profile.ts'), "export const profile = { name: 'Tony', title: 'Design engineer' };\n");
  await writeFile(path.join(root, 'unrelated.txt'), 'initial');
  const git = async (...args) => (await execute('git', args, { cwd: root })).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'CMS test');
  await git('config', 'user.email', 'cms@example.invalid');
  await git('config', 'core.autocrlf', 'false');
  await git('add', '.');
  await git('commit', '-m', 'Initial fixture');
  await git('init', '--bare', '-b', 'main', remote);
  await git('remote', 'add', 'origin', remote);
  await git('push', '-u', 'origin', 'main');
  const repo = repository(root);
  async function payload(value = 'New name') {
    const records = await catalog(root);
    const record = records.find((record) => record.file === 'content/profile.ts');
    const field = record.fields.find((field) => field.context === 'name');
    return { changes: [{ id: field.id, value }], hashes: { [record.file]: record.hash }, message: 'Update name' };
  }
  return { root, remote, git, repo, payload };
}

test('discovers prose, one-word labels and JSX, while hiding identifiers/imports/type literals', () => {
  const source = `import x from 'external'; type Kind = 'Internal';
    const item = { id: 'identifier', name: 'Cat', examine: 'It is warm.' };
    const lines = ['Brewing tea…'];
    const view = <button className="button" title="Talk to Tony">Hello &amp; welcome</button>;`;
  const fields = extractFields('app/example.tsx', source);
  const copy = fields.filter((field) => field.copy).map((field) => field.value);
  assert.deepEqual(copy, ['Cat', 'It is warm.', 'Brewing tea…', 'Talk to Tony', 'Hello & welcome']);
  assert(!fields.some((field) => ['external', 'Internal'].includes(field.value)));
  assert(fields.some((field) => field.value === 'identifier' && !field.copy));
});

test('escapes text and keeps template expressions intact, including literal ${...}', () => {
  const source = "const text = `Hello ${profile.name}, welcome home.`;";
  const fields = extractFields('app/example.ts', source);
  const output = applyEdits('app/example.ts', source, fields.map((field) => ({ id: field.id, value: field.kind === 'head' ? 'Hi `${injected}` ' : '.\nHave tea.' })));
  assert(output.includes('${profile.name}'));
  assert(output.includes('\\${injected}'));
  assert.equal(ts.createSourceFile('example.ts', output, ts.ScriptTarget.Latest).parseDiagnostics.length, 0);
});

test('cleared copy fields remain editable on the next load', () => {
  const source = "const profile = { title: 'Designer' };";
  const field = extractFields('content/profile.ts', source)[0];
  const output = applyEdits('content/profile.ts', source, [{ id: field.id, value: '' }]);
  const reloaded = extractFields('content/profile.ts', output);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].value, '');
  assert.equal(reloaded[0].copy, true);
});

test('JSX text and attributes safely display quotes, entities, braces and newlines', () => {
  const source = '<button title="Old title">Old copy</button>';
  const fields = extractFields('app/example.tsx', source);
  const output = applyEdits('app/example.tsx', source, fields.map((field) => ({ id: field.id, value: 'A "quote" & <tag> {literal}\nnext line' })));
  const parsed = ts.createSourceFile('example.tsx', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length, 0);
  assert(output.includes('title={"A \\"quote\\"'.replaceAll('\\\\', '\\')));
  const values = extractFields('app/example.tsx', output).map((field) => field.value);
  assert.equal(values.length, 2);
  assert(values.every((value) => value === 'A "quote" & <tag> {literal}\nnext line'));
  assert(extractFields('app/example.tsx', '<button>{"OK"}</button>').every((field) => field.copy));
});

test('save creates one scoped commit and preserves unrelated staged changes', async (t) => {
  const { root, git, repo, payload } = await fixture(t);
  await writeFile(path.join(root, 'unrelated.txt'), 'staged by another writer');
  await git('add', 'unrelated.txt');
  const result = await repo.save(await payload("Tony's new title \\ test"));
  assert.match(result.commit, /^[a-f0-9]+$/);
  assert.equal(await git('show', '--format=', '--name-only', 'HEAD'), 'content/profile.ts');
  assert.equal(await git('diff', '--cached', '--name-only'), 'unrelated.txt');
  assert.match(await readFile(path.join(root, 'content/profile.ts'), 'utf8'), /Tony\\'s new title/);
  assert.equal(result.status.ahead, 1);
});

test('rejects stale source and dirty target files without writing over other work', async (t) => {
  const { root, git, repo, payload } = await fixture(t);
  const stale = await payload();
  const changed = "export const profile = { name: 'Someone else', title: 'Designer' };\n";
  await writeFile(path.join(root, 'content/profile.ts'), changed);
  await assert.rejects(repo.save(stale), /changed|Reload/);
  await assert.rejects(repo.save(await payload()), /other uncommitted changes/);
  assert.equal(await readFile(path.join(root, 'content/profile.ts'), 'utf8'), changed);
  assert.equal(await git('log', '-1', '--format=%s'), 'Initial fixture');
});

test('commit failure restores only the CMS edit and leaves unrelated staging alone', async (t) => {
  const { root, git, repo, payload } = await fixture(t);
  const original = await readFile(path.join(root, 'content/profile.ts'), 'utf8');
  await writeFile(path.join(root, 'unrelated.txt'), 'other work');
  await git('add', 'unrelated.txt');
  await git('config', 'user.name', '');
  await assert.rejects(repo.save(await payload()), /Save failed/);
  assert.equal(await readFile(path.join(root, 'content/profile.ts'), 'utf8'), original);
  assert.equal(await git('diff', '--cached', '--name-only'), 'unrelated.txt');
  assert.equal(await git('diff', '--name-only'), '');
});

test('push sends reviewed commits to main and refuses a changed head', async (t) => {
  const { remote, git, repo, payload } = await fixture(t);
  const initial = await repo.status();
  await repo.save(await payload());
  await assert.rejects(repo.push({ expectedHead: initial.head }), /pending commits changed/);
  const state = await repo.status();
  const result = await repo.push({ expectedHead: state.head });
  assert.equal(result.status.ahead, 0);
  const pushed = (await execute('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim();
  assert.equal(pushed, await git('rev-parse', 'HEAD'));
});

test('push fetches and rejects divergent main without a forced update', async (t) => {
  const { root, remote, git, repo, payload } = await fixture(t);
  const other = path.join(path.dirname(root), 'other');
  await git('clone', remote, other);
  const otherGit = async (...args) => execute('git', args, { cwd: other });
  await otherGit('config', 'user.name', 'Other writer');
  await otherGit('config', 'user.email', 'other@example.invalid');
  await writeFile(path.join(other, 'unrelated.txt'), 'new remote change');
  await otherGit('add', '.'); await otherGit('commit', '-m', 'Remote edit'); await otherGit('push');
  const remoteHead = (await otherGit('rev-parse', 'HEAD')).stdout.trim();
  await repo.save(await payload());
  const state = await repo.status();
  await assert.rejects(repo.push({ expectedHead: state.head }), /Remote main contains newer commits/);
  assert.equal((await execute('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim(), remoteHead);
});

test('production refuses to start the CMS', async () => {
  const server = fileURLToPath(new URL('./server.mjs', import.meta.url));
  await assert.rejects(execute(process.execPath, [server], { env: { ...process.env, NODE_ENV: 'production' } }), (error) => error.code === 1 && /development-only/.test(error.stderr));
});

test('production config has no CMS rewrites; development config targets the companion', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const code = `import { createRequire } from 'node:module';
    const loadConfig = createRequire(import.meta.url)('next/dist/server/config.js').default;
    const config = await loadConfig(process.env.NODE_ENV === 'development' ? 'phase-development-server' : 'phase-production-build', process.cwd());
    console.log('CMS_REWRITES=' + JSON.stringify(await config.rewrites()));`;
  for (const environment of ['production', 'development']) {
    const result = await execute(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env: { ...process.env, NODE_ENV: environment } });
    const rewrites = JSON.parse(result.stdout.split('CMS_REWRITES=')[1].trim());
    if (environment === 'production') assert.deepEqual(rewrites, []);
    else assert(rewrites.some((rewrite) => rewrite.source === '/cms/:path*' && rewrite.destination.includes('127.0.0.1')));
  }
});

test('in-game save commits only copy data even with dirty source and unrelated staging', async (t) => {
  const { root, git, repo } = await fixture(t);
  const authored = "export const profile = { name: 'Local authored name', title: 'Uncommitted design work' };\n";
  await writeFile(path.join(root, 'content/profile.ts'), authored);
  await writeFile(path.join(root, 'unrelated.txt'), 'other staged work'); await git('add', 'unrelated.txt');
  const records = await catalog(root), record = records.find((entry) => entry.file === 'content/profile.ts');
  const field = record.fields.find((entry) => entry.context === 'name');
  const previous = await repo.copyState();
  const result = await repo.saveCopy({ changes: [{ key: field.key, value: 'New in-game name' }], hashes: { [record.file]: record.hash }, copyHash: previous.copyHash, message: 'Test in-game revision' });
  assert.equal(await git('show', '--format=', '--name-only', 'HEAD'), 'content/copy.json');
  assert.equal(await readFile(path.join(root, 'content/profile.ts'), 'utf8'), authored);
  assert.equal(await git('diff', '--cached', '--name-only'), 'unrelated.txt');
  assert.equal(result.savedCopy[field.key].value, 'New in-game name');
  assert.deepEqual(Object.keys(result.savedCopy[field.key]), ['value']);
  await assert.rejects(repo.saveCopy({ changes: [{ key: field.key, value: 'Other name' }], hashes: { [record.file]: record.hash }, copyHash: previous.copyHash }), /another editor/);
  const reset = await repo.saveCopy({ changes: [{ key: field.key, value: field.value }], hashes: { [record.file]: record.hash }, copyHash: result.copyHash });
  assert.deepEqual(reset.savedCopy, {});
});

test('in-game commit failure rolls back copy data and preserves dirty source', async (t) => {
  const { root, git, repo } = await fixture(t);
  await writeFile(path.join(root, 'content/copy.json'), '{}\n');
  const records = await catalog(root), record = records[0], field = record.fields[0];
  const previous = await repo.copyState();
  await git('config', 'user.name', '');
  await assert.rejects(repo.saveCopy({ changes: [{ key: field.key, value: 'New title' }], hashes: { [record.file]: record.hash }, copyHash: previous.copyHash }), /Save failed/);
  assert.equal(await readFile(path.join(root, 'content/copy.json'), 'utf8'), '{}\n');
  assert.equal(await git('diff', '--cached', '--name-only'), '');
});

test('the game clock freezes outstanding callbacks and resumes their remaining duration', () => {
  let wall = 0, nextId = 0;
  const queued = new Map(), calls = [];
  const host = { setTimeout: (run, delay) => { const id = ++nextId; queued.set(id, { at: wall + delay, run }); return id; }, clearTimeout: (id) => queued.delete(id) };
  const advance = (ms) => { wall += ms; for (const [id, task] of [...queued]) if (task.at <= wall) { queued.delete(id); task.run(); } };
  const clock = createGameClock(host, () => wall);
  clock.timeout(() => calls.push('dialogue'), 100);
  const interval = clock.interval(() => calls.push('music'), 50);
  advance(20); clock.pause(true); const frozen = clock.now(); advance(5000);
  assert.equal(clock.now(), frozen); assert.deepEqual(calls, []);
  clock.pause(false); advance(29); assert.deepEqual(calls, []);
  advance(1); assert.deepEqual(calls, ['music']); clock.clear(interval);
  advance(50); assert.deepEqual(calls, ['music', 'dialogue']);
  assert.equal(clock.pending, 0);
});

test('copy identities survive unrelated source lines and values changing', () => {
  const before = extractFields('content/profile.ts', "const profile = { name: 'Tony' };");
  const after = extractFields('content/profile.ts', "// More documentation\nconst profile = { name: 'New authored name' };");
  assert.equal(before[0].key, after[0].key);
});

test('dev tracing keeps exact text ownership; production has only the content resolver', () => {
  const file = 'app/otherworld/hud/Example.tsx';
  const source = "'use client'; import { useFrame, useThree } from '@react-three/fiber'; const data = { title: 'Design tools' }; export function Example() { useFrame(() => {}); return <button title=\"A tooltip\">Save {data.title}</button>; }";
  const dev = instrument(file, source, true), prod = instrument(file, source, false);
  assert(dev.includes('__owCaptured(() => (data.title))'));
  assert(dev.includes('game-runtime.mjs'));
  assert(prod.includes('copy-runtime.mjs')); assert(!prod.includes('game-runtime') && !prod.includes('__owCaptured') && !prod.includes('data-ow-copy'));
  for (const output of [dev, prod]) assert.equal(ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
});

test('module specifiers and dialogue kinds stay technical; world text props are editable', () => {
  const source = `import('hls.js'); say('Welcome', 'npc'); const label = <Label text="Export ↗" />;`;
  const fields = extractFields('app/otherworld/hud/Example.tsx', source);
  assert.equal(fields.find((f) => f.value === 'hls.js').copy, false);
  assert.equal(fields.find((f) => f.value === 'npc').copy, false);
  assert.equal(fields.find((f) => f.value === 'Export ↗').copy, true);
  const output = instrument('app/otherworld/hud/Example.tsx', source, true);
  assert(output.includes("import('hls.js')"));
  assert(output.includes('__owLabelProps'));
});

test('painted signs carry copy provenance and repaint without replacing their texture', async () => {
  const source = await readFile(new URL('../../app/otherworld/house/furniture/common.ts', import.meta.url), 'utf8');
  const dev = instrument('app/otherworld/house/furniture/common.ts', source, true);
  const prod = instrument('app/otherworld/house/furniture/common.ts', source, false);
  assert(dev.includes('__owPaint(() => paint(g, w, h))') && dev.includes('__owCanvas(tex, __owCanvasCopy'));
  assert(!prod.includes('__owCanvas') && !prod.includes('__owPaint'));
  const fields = extractFields('app/otherworld/house/furniture/sign.ts', `g.font = 'bold 34px system-ui'; g.fillText('EXPORT', 0, 0);`);
  assert.equal(fields.find((f) => f.value === 'bold 34px system-ui').copy, false);
  assert.equal(fields.find((f) => f.value === 'EXPORT').copy, true);
});

test('saved overrides resolve in production without importing the editor', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'otherworld-copy-prod-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const source = "export const profile = { title: 'Authored title' }; export const read = () => profile.title;";
  const field = extractFields('content/profile.ts', source)[0];
  await writeFile(path.join(folder, 'copy.json'), JSON.stringify({ [field.key]: { value: 'Published title' } }));
  const resolver = await readFile(new URL('../../content/copy-runtime.mjs', import.meta.url), 'utf8');
  const transpile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  await writeFile(path.join(folder, 'copy-runtime.cjs'), transpile(resolver));
  const output = instrument('content/profile.ts', source, false);
  assert(!/game-runtime|owCopy|__owUsePause/.test(output.replaceAll('__owCopy', 'resolver')));
  await writeFile(path.join(folder, 'profile.cjs'), transpile(output).replace('@/content/copy-runtime.mjs', './copy-runtime.cjs'));
  const compiled = createRequire(import.meta.url)(path.join(folder, 'profile.cjs'));
  assert.equal(compiled.profile.title, 'Published title'); assert.equal(compiled.read(), 'Published title');
});

test('development copy runtime does not import saved data that would remount the world on save', async () => {
  const runtime = await readFile(new URL('./game-runtime.mjs', import.meta.url), 'utf8');
  assert(!/import .*copy-runtime|import .*copy\.json/.test(runtime));
  const label = await readFile(new URL('../../app/otherworld/scene/Label.tsx', import.meta.url), 'utf8');
  const dev = instrument('app/otherworld/scene/Label.tsx', label, true);
  assert(dev.includes('__owUseLabel(text, __copyKeys)') && dev.includes('owCopy: __owLabel.keys'));
});

test('copy save refuses staged dictionary changes even when the worktree matches HEAD', async (t) => {
  const { root, git, repo } = await fixture(t);
  const file = path.join(root, 'content/copy.json');
  await writeFile(file, '{}\n'); await git('add', 'content/copy.json'); await git('commit', '-m', 'Copy baseline');
  await writeFile(file, '{"other":{"value":"Staged work"}}\n'); await git('add', 'content/copy.json');
  await writeFile(file, '{}\n');
  const records = await catalog(root), record = records[0], field = record.fields[0], previous = await repo.copyState();
  await assert.rejects(repo.saveCopy({ changes: [{ key: field.key, value: 'New title' }], hashes: { [record.file]: record.hash }, copyHash: previous.copyHash }), /staged edits/);
  assert.equal(await git('show', ':content/copy.json'), '{"other":{"value":"Staged work"}}');
});

test('all current source files parse after both development and production transforms', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const record of await catalog(root)) {
    const source = await readFile(path.join(root, record.file), 'utf8');
    for (const dev of [true, false]) {
      const output = instrument(record.file, source, dev);
      const ast = ts.createSourceFile(record.file, output, ts.ScriptTarget.Latest, true, record.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      assert.equal(ast.parseDiagnostics.length, 0, record.file);
      if (!dev) assert(!output.includes('game-runtime.mjs') && !output.includes('__owCaptured') && !output.includes('__owUsePause'), record.file);
    }
  }
});
