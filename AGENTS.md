# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a **Next.js 15 portfolio website** (single app, not a monorepo) for a design engineer. It uses the App Router, React 19, Tailwind CSS 4, and Mux-hosted videos via `next-video`.

### Development commands

| Action | Command |
|--------|---------|
| Dev server | `pnpm dev` (starts Next.js on port 3000 + `next-video sync -w`) |
| Lint | `pnpm lint` |
| Build | `pnpm build` |

### Key caveats

- **No env vars needed for dev**: The Mux video playback IDs are embedded in JSON files under `videos/`. The README mentions `vercel env pull .env.local`, but the dev server runs fine without it.
- **Pre-existing lint errors**: `pnpm lint` and `pnpm build` fail due to existing `@typescript-eslint/no-unused-vars` errors in `app/components/Header.tsx` and `app/editor/InteractiveCard.tsx`. These are not regressions — they exist on `main`.
- **No automated tests**: The project has no test framework or test files configured.
- **Dev script uses `&`**: The `dev` script runs `next dev` and `next-video sync -w` concurrently via shell `&`. Killing the pnpm process may leave orphaned child processes on port 3000; check with `lsof -i :3000` if the port appears busy.
- **Node.js 22.x**: The project targets Node 22 (`@types/node@22.14.0`). Ensure Node >= 18.17 at minimum.
