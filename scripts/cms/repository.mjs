import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyEdits, catalog, digest } from './catalog.mjs';

const execute = promisify(execFile);
export function repository(root) {
  const git = async (...args) => (await execute('git', args, {
    cwd: root, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  })).stdout.trim();
  let busy = false;
  async function locked(run) {
    if (busy) throw new Error('Another save or push is in progress. Try again when it finishes.');
    busy = true;
    try { return await run(); } finally { busy = false; }
  }
  async function status() {
    try {
      const branch = await git('branch', '--show-current');
      const head = await git('rev-parse', 'HEAD');
      const remote = await git('remote', 'get-url', 'origin').catch(() => null);
      let ahead = null, behind = null, commits = [];
      try {
        const counts = await git('rev-list', '--left-right', '--count', 'origin/main...HEAD');
        [behind, ahead] = counts.split(/\s+/).map(Number);
        const log = await git('log', '--format=%h %s', 'origin/main..HEAD');
        commits = log ? log.split('\n') : [];
      } catch { /* No fetched main yet. */ }
      return { branch, head, remote, ahead, behind, commits, ready: branch === 'main' && Boolean(remote), error: branch !== 'main' ? 'Switch to the main branch before saving or pushing copy.' : !remote ? 'Configure an origin remote first.' : null };
    } catch {
      return { ready: false, error: 'This project needs a Git repository with an initial commit and an origin remote.' };
    }
  }
  async function save({ changes, hashes, message }) {
    return locked(async () => {
      if (!Array.isArray(changes) || !changes.length || changes.length > 2000 || !hashes || typeof hashes !== 'object') throw new Error('No valid copy changes were supplied.');
      if (typeof message !== 'string' || message.length > 300 || message.includes('\0') || message.includes('\n')) throw new Error('Use a single-line commit message under 300 characters.');
      const state = await status();
      if (!state.ready) throw new Error(state.error);
      const records = await catalog(root);
      const owners = new Map(records.flatMap((record) => record.fields.map((field) => [field.id, record])));
      const grouped = new Map();
      for (const change of changes) {
        const record = owners.get(change.id);
        if (!record) throw new Error('Copy has changed since this editor loaded. Reload to pick up the latest source.');
        if (hashes[record.file] !== record.hash) throw new Error(`${record.file} changed outside the CMS. Reload before saving.`);
        const entries = grouped.get(record.file) ?? [];
        entries.push(change);
        grouped.set(record.file, entries);
      }
      const files = [...grouped.keys()];
      // Require clean target files: a copy commit must never scoop up other edits.
      for (const file of files) {
        await git('ls-files', '--error-unmatch', '--', file).catch(() => { throw new Error(`${file} is untracked. Commit its existing source before editing its copy.`); });
        await git('diff', '--quiet', 'HEAD', '--', file).catch(() => { throw new Error(`${file} has other uncommitted changes. Commit those changes first, or edit a different file.`); });
        await git('diff', '--cached', '--quiet', '--', file).catch(() => { throw new Error(`${file} has staged changes. Commit those changes first.`); });
      }
      const prepared = [];
      for (const [file, edits] of grouped) {
        const original = await readFile(path.join(root, file), 'utf8');
        if (digest(original) !== hashes[file]) throw new Error(`${file} changed outside the CMS. Reload before saving.`);
        const updated = applyEdits(file, original, edits);
        if (updated !== original) prepared.push({ file, original, updated });
      }
      if (!prepared.length) throw new Error('There are no copy changes to commit.');
      const written = [];
      try {
        for (const entry of prepared) {
          if (digest(await readFile(path.join(root, entry.file), 'utf8')) !== digest(entry.original)) throw new Error(`${entry.file} changed during save.`);
          await writeFile(path.join(root, entry.file), entry.updated);
          written.push(entry);
        }
        if (await git('rev-parse', 'HEAD') !== state.head || await git('branch', '--show-current') !== 'main') throw new Error('The Git branch changed during save. Try again.');
        for (const entry of written) {
          if (digest(await readFile(path.join(root, entry.file), 'utf8')) !== digest(entry.updated)) throw new Error(`${entry.file} changed during save.`);
        }
        // --only leaves every unrelated staged and unstaged file alone.
        await git('commit', '--only', '-m', message.trim() || `Edit experience copy (${changes.length} fields)`, '--', ...prepared.map((entry) => entry.file));
        return { message: `Saved and committed ${changes.length} copy fields.`, commit: await git('rev-parse', '--short', 'HEAD'), status: await status() };
      } catch (error) {
        // A hook can fail after a commit is made. Never undo committed content.
        if (await git('rev-parse', 'HEAD') === state.head) {
          for (const entry of written) {
            // Preserve edits from external writers that arrive during validation.
            if (digest(await readFile(path.join(root, entry.file), 'utf8')) === digest(entry.updated)) await writeFile(path.join(root, entry.file), entry.original);
          }
        }
        const detail = error.stdout || error.stderr || error.message;
        throw new Error(`Save failed: ${String(detail).slice(0, 3000)}`);
      }
    });
  }
  async function push({ expectedHead }) {
    return locked(async () => {
      const state = await status();
      if (!state.ready) throw new Error(state.error);
      if (expectedHead !== state.head) throw new Error('The pending commits changed. Refresh and review them before pushing.');
      await git('fetch', 'origin', 'main');
      const current = await status();
      if (current.branch !== 'main' || current.head !== state.head) throw new Error('The Git branch changed while preparing the push. Refresh before pushing.');
      if (current.behind) throw new Error('Remote main contains newer commits. Reconcile them in Git, then return here to push.');
      if (!current.ahead) return { message: 'Main is already up to date.', status: current };
      // Push the reviewed commit, never an unreviewed moving HEAD or a forced update.
      await git('push', 'origin', `${state.head}:refs/heads/main`);
      return { message: `Pushed ${current.ahead} commits to origin/main.`, status: await status() };
    });
  }
  async function copyState() {
    const source = await readFile(path.join(root, 'content/copy.json'), 'utf8').catch((error) => { if (error.code === 'ENOENT') return '{}\n'; throw error; });
    return { savedCopy: JSON.parse(source), copyHash: digest(source) };
  }
  async function saveCopy({ changes, hashes, copyHash, message = '' }) {
    return locked(async () => {
      if (!Array.isArray(changes) || !changes.length || changes.length > 2000 || !hashes || typeof message !== 'string' || message.length > 300 || /[\0\r\n]/.test(message)) throw new Error('Invalid copy revision.');
      if (new Set(changes.map((change) => change.key)).size !== changes.length) throw new Error('Duplicate copy fields.');
      const before = await status();
      if (!before.ready) throw new Error(before.error);
      const records = await catalog(root);
      const owners = new Map(records.flatMap((record) => record.fields.filter((field) => field.copy).map((field) => [field.key, { record, field }])));
      const previous = await copyState();
      if (copyHash !== previous.copyHash) throw new Error('Saved copy changed in another editor. Refresh copy to reconnect; your drafts are preserved.');
      const file = 'content/copy.json';
      const tracked = await git('ls-files', '--error-unmatch', '--', file).then(() => true).catch(() => false);
      if (tracked) {
        await git('diff', '--quiet', 'HEAD', '--', file).catch(() => { throw new Error('The copy data has other uncommitted edits. Commit them before saving this revision.'); });
        await git('diff', '--cached', '--quiet', '--', file).catch(() => { throw new Error('The copy data has staged edits. Commit them before saving this revision.'); });
      }
      else if (Object.keys(previous.savedCopy).length) throw new Error('Commit the existing copy data first.');
      const next = { ...previous.savedCopy };
      for (const change of changes) {
        const owner = owners.get(change.key);
        if (!owner || typeof change.value !== 'string' || change.value.length > 20000 || change.value.includes('\0')) throw new Error('A selected copy field no longer exists. Refresh copy to reconnect.');
        if (hashes[owner.record.file] !== owner.record.hash) throw new Error(`${owner.record.file} changed outside the editor. Refresh copy to reconnect; your draft is preserved.`);
        if (change.value === owner.field.value) delete next[change.key];
        else next[change.key] = { value: change.value };
      }
      const original = await readFile(path.join(root, file), 'utf8').catch(() => '{}\n');
      const updated = JSON.stringify(Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n';
      if (original === updated) throw new Error('No copy changes to commit.');
      let wrote = false;
      try {
        if ((await copyState()).copyHash !== copyHash) throw new Error('Copy changed during save. Reconnect and try again.');
        await writeFile(path.join(root, file), updated); wrote = true;
        if (!tracked) await git('add', '--intent-to-add', '--', file);
        if (await git('rev-parse', 'HEAD') !== before.head || await git('branch', '--show-current') !== 'main') throw new Error('The Git branch changed during save.');
        if (digest(await readFile(path.join(root, file), 'utf8')) !== digest(updated)) throw new Error('Copy changed during save.');
        await git('commit', '--only', '-m', message.trim() || `Edit in-game copy (${changes.length} fields)`, '--', file);
        return { commit: await git('rev-parse', '--short', 'HEAD'), status: await status(), ...await copyState() };
      } catch (error) {
        if (wrote && await git('rev-parse', 'HEAD') === before.head && digest(await readFile(path.join(root, file), 'utf8')) === digest(updated)) {
          await writeFile(path.join(root, file), original);
          if (!tracked) await git('rm', '--cached', '--', file).catch(() => {});
        }
        throw new Error(`Save failed: ${String(error.stderr || error.message).slice(0, 3000)}`);
      }
    });
  }
  return { status, save, push, copyState, saveCopy };
}
