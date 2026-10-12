# Untitled-1

Tony Ketcham's portfolio: a design-tool canvas that thinks it's an old-school MMO.

You open what looks like a design file: the floor plan of a house, drawn as blueprint frames on an
infinite dot-grid canvas, with dotted hotspots where the furniture goes. Zoom out (or hit
**Present ▶**, or double-tap) and the plan builds itself: walls rise off the print, furniture
hammers in with puffs of sawdust, the editor chrome slides away, and a cursor with legs is standing
in the parlour.

The house is an Old School RuneScape player-owned house. Room types, hotspot names, the furniture
tiers and their level / material requirements follow the POH data in RuneLite's open-source
client, and every piece has a design-tool twist: a Bézier chair with its handles showing, a
rug with a transparency checkerboard, a fireplace that burns a gradient map, a larder full of
Perlin bread, portals that frame the work, a cat basket, a node-graph workbench.

The garden's exit portal leads out to the island: a tile-based world with node-graph wires for
roads, where every project is a frame and every Modyfi piece is a tree whose canopy is the art.
The house portal by spawn takes you home.

- **Walk** with tap / click (600 ms ticks, 8-way A* pathing, run with caffeine). Walls between
  you and the camera cut away to knee height.
- **Long-press / right-click** anything for the "Choose Option" menu (Sit-on, Warm-hands,
  Search, Inspect, Examine, Steal-from…).
- **Building mode** (hammer button, the **B** key, or `::build`): empty hotspots show as ghosts.
  Right-click to open the furniture creation menu, build or remove pieces, and train
  Construction (xp is boosted ×8 here). Edits and the house style persist per visitor.
- **House tab**: building mode, teleport inside / leave, call the servant (a multiplayer cursor
  called Anonymous Axolotl), seven house styles, a room list, and reset.
- **Inspect** a frame to get a design-tool properties panel with its own live shader stack, and
  wires that walk you to related work. Deep link any piece with `/?work=<slug>`.
- **Effects tab** is the world's Modyfi stack: reorderable halftone, dither, gradient map,
  posterize, chroma, scanlines and kaleido over a low-res render with pixel outlines.
- **Layers tab** is the island as a design file: hide or lock any layer.
- **Text tool (T)** drops physical 5×7 voxel letters. **Move tool (V)** lets you grab and throw
  props. **⌘Z** rewinds the physics with a VHS pass.
- Skills (with the classic XP curve), inventory, quests, a tea stall to steal from, Tony to talk
  to, an amanita ring that makes the pixels breathe, bezier-handle butterflies, a fractal tree
  you can water, and a curry pot.
- Chat commands: `::help`, `::dial`, `::target <panel>`, `::home`, `::island`, `::build`,
  `::tp <zone|house>`, `::tea`, `::type <text>`, `::intro`, `::classic`.

The previous homepage lives at **`/classic`** (also the fallback without WebGPU or WebGL2).

## Rendering

three.js `WebGPURenderer` with TSL node materials throughout: terrain, flora, cables, walls,
floors, furniture, particles and the post stack are all node graphs, so the same code runs on
WebGPU and falls back to WebGL2 automatically where WebGPU isn't available. Add `?webgl` to force
the fallback. The FPS counter (Debug → showFps, or the FPS plugin) shows which backend is running.

## Adding art

See [`content/README.md`](content/README.md). In short, append an entry to `content/works.ts` and
the world places it, wires it, lists it in Quests and Layers, and makes it inspectable. To hang a
piece in the house (on a wall, in a portal, in the chapel windows), add its slug to a room's
`works` in `content/house.ts`.

## Tuning it: DialKit 2

Every tunable lives in `app/otherworld/debug/tweaks.ts` as DialKit panel configs: World, House,
Modyfi stack, Camera, Player, Physics, Artboards, Flora, HUD, Intro, Debug. The House panel
covers the style, the wall cutaway, lamps and interior light; Modyfi stack includes the pixel
outline and crease lines. The panel shows in dev
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
`/?work=modyfi` deep-links to a piece, `/?webgl` forces the WebGL2 backend.

### Map of the code

```
content/            works, zones, profile, house: the only files you need to touch to add art
app/otherworld/
  world/            island generation, places (island / house), A* pathfinding (pure TS)
  house/            the POH: room catalog, layout, walls + floors, furniture kit + catalog,
                    construction, furniture actions
  shaders/          TSL materials, particles and the post pipeline (renderable headless)
  scene/            r3f components: house, terrain, player, artboards, cables, flora, fixtures,
                    physics props, intro + travel directors
  hud/              the OSRS × design-tool interface (DOM)
  state/            zustand store (persisted), per-frame runtime, events, actions, items, skills
  debug/            DialKit panels + tweak store
  audio/            WebAudio synth sfx (no samples)
```

Stack: Next 15, React 19, three.js (WebGPU + TSL), @react-three/fiber 9, @react-three/rapier 2,
zustand, DialKit 2, hls.js (Mux streams on inspect).

### Deploying

Sign in with Vercel's CLI (`vercel login`), `vercel env pull .env.local`, and deploy as before.
