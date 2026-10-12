# Untitled-1

Tony Ketcham's portfolio: a design-tool canvas that thinks it's an old-school MMO.

You open what looks like a design file: one selected artboard (the old homepage hero) on an
infinite dot-grid canvas. Zoom out far enough (or hit **Present ▶**, or double-tap the frame) and
the artboard tilts into 3D. The dot grid rises into an island, trees pop in on the reveal wave, the
editor chrome slides away, and a cursor with legs drops out of the sky.

From there it's a tile-based world with node-graph wires for roads. Every project is a frame,
every Modyfi piece is a tree whose canopy is the art, and the wires connect related work.

- **Walk** with tap / click (600 ms ticks, 8-way A* pathing, run with caffeine).
- **Long-press / right-click** anything for the "Choose Option" menu (Inspect, Examine, Steal-from…).
- **Inspect** a frame to get a design-tool properties panel with its own live shader stack, and
  wires that walk you to related work. Deep link any piece with `/?work=<slug>`.
- **Effects tab** is the world's Modyfi stack: reorderable halftone, dither, gradient map,
  posterize, chroma, scanlines and kaleido, applied in one full-screen pass over a low-res render.
- **Layers tab** is the island as a design file: hide or lock any layer.
- **Text tool (T)** drops physical 5×7 voxel letters. **Move tool (V)** lets you grab and throw
  props. **⌘Z** rewinds the physics with a VHS pass.
- Skills (with the classic XP curve), inventory, quests, a tea stall to steal from, Tony to talk
  to, an amanita ring that makes the pixels breathe, bezier-handle butterflies, a fractal tree
  you can water, and a curry pot.
- Chat commands: `::help`, `::dial`, `::target <panel>`, `::tp <zone>`, `::tea`, `::type <text>`, `::intro`, `::classic`.

The previous homepage lives at **`/classic`** (also the fallback without WebGL2).

## Adding art

See [`content/README.md`](content/README.md). In short, append an entry to `content/works.ts` and
the world places it, wires it, lists it in Quests and Layers, and makes it inspectable.

## Tuning it: DialKit 2

Every tunable lives in `app/otherworld/debug/tweaks.ts` as DialKit panel configs: World, Modyfi
stack, Camera, Player, Physics, Artboards, Flora, HUD, Intro, Debug. The panel shows in dev
automatically, in any build with `?dial`, or by typing `::dial` in chat.

**Targeting:** Alt-click anything in the world, or type `::target <panel>`, and the panel that
controls it opens while the rest collapse. Values persist per panel. Without the panel mounted,
the declared defaults are what ships.

## Development

```powershell
pnpm install
pnpm dev:all   # next dev + tsc --watch, both tee'd to .dev-logs/
```

`pnpm dev` is the original script (inspector + next-video sync). `pnpm typecheck` runs `tsc --noEmit`.

Useful URLs: `/?intro` forces the intro, `/?skip` skips it, `/?dial` shows DialKit,
`/?work=modyfi` deep-links to a piece.

### Map of the code

```
content/            works, zones, profile: the only files you need to touch to add art
app/otherworld/
  world/            deterministic island generation + A* pathfinding (pure TS)
  shaders/          every material + geometry builder (pure three.js, renderable headless)
  scene/            r3f components: terrain, player, artboards, cables, flora, fixtures, physics props
  hud/              the OSRS × design-tool interface (DOM)
  state/            zustand store (persisted), per-frame runtime, events, actions, items, skills
  debug/            DialKit panels + tweak store
  audio/            WebAudio synth sfx (no samples)
```

Stack: Next 15, React 19, three.js, @react-three/fiber, @react-three/rapier, zustand, DialKit 2,
hls.js (Mux streams on inspect).

### Deploying

Sign in with Vercel's CLI (`vercel login`), `vercel env pull .env.local`, and deploy as before.
