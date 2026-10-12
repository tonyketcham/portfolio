#!/usr/bin/env node
/**
 * Cross-platform dev runner (Windows / macOS / Linux).
 *
 *   pnpm dev:all
 *
 * Runs `next dev` and `tsc --noEmit --watch` side by side, prefixes their output
 * in this terminal, and tees each to `.dev-logs/<name>.log` so tooling (and
 * agents) can read type errors and server output without a TTY.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
mkdirSync('.dev-logs', { recursive: true });

const port = process.env.PORT ?? '3000';
const children = [];

function run(name, bin, args, color) {
  const log = createWriteStream(`.dev-logs/${name}.log`, { flags: 'w' });
  const child = spawn(process.execPath, [bin, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const forward = (chunk) => {
    const text = chunk.toString();
    log.write(text);
    process.stdout.write(
      text
        .split(/\r?\n/)
        .map((line) => (line ? tag + line : line))
        .join('\n')
    );
  };
  child.stdout.on('data', forward);
  child.stderr.on('data', forward);
  child.on('exit', (code) => log.write(`\n[${name} exited with ${code}]\n`));
  children.push(child);
  return child;
}

run('next', require.resolve('next/dist/bin/next'), ['dev', '-p', port], '36');
run(
  'tsc',
  require.resolve('typescript/bin/tsc'),
  ['--noEmit', '--watch', '--preserveWatchOutput', '--pretty', 'false'],
  '35'
);

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
