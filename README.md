# Untitled-1

Tony Ketcham's portfolio: a design-tool canvas that thinks it's an old-school MMO.

You open what looks like a design file: the floor plan of a house, drawn as blueprint frames on an
infinite dot-grid canvas, with dotted hotspots where the furniture goes. Zoom out (or hit
**Present ▶**, or double-tap) and the plan builds itself: walls rise off the print, furniture
hammers in with puffs of sawdust, the editor chrome slides away, and you land in the garden
courtyard at the middle of the house as Toe Knee (Tony, said fast): an old-school player model of
Tony, long wavy hair, round wire glasses, the croissant shirt, and the Cat cape: the skillcape for
99 Cats, grey and white like Tony's cat, with the cat's face on the emblem, a red heart tag at the
collar and a tail.

The house is an Old School RuneScape player-owned house. Room types, hotspot names, the furniture
tiers and their level / material requirements follow the POH data in RuneLite's open-source
client, and every piece has a design-tool twist: a Bézier chair with its handles showing, a
rug with a transparency checkerboard, a fireplace that burns a gradient map, a larder full of
Perlin bread, portals that frame the work, a cat basket, a node-graph workbench.

Tony's cat lives here too (`app/otherworld/pet`): a grey-and-white bicolour with a smudge down
the nose, walking the house on the same tile grid as you. It wanders, sits, loafs, grooms,
stretches, naps in the kitchen basket, comes over to weave round your legs and meows when it
feels like it. Right-click it to Pet (Cats xp), Talk-to or Pick-up. It declines.

Every room opens onto the garden courtyard: stepping-stone paths from the four doors loop round the
exit portal, the lawn parts around you as you walk through it, and the beds are planted with
swatch tulips, radio-button daisies and pixel lavender (in building mode the path shows its vector
centre line and anchor points). Bézier-handle butterflies hang around and can be caught.

The garden's exit portal leads out to the island: a tile-based world with node-graph wires for
roads, where every project is a frame and every Modyfi piece is a tree whose canopy is the art.
The house portal by spawn takes you home.

- **Walk** with tap / click (600 ms ticks, 8-way A* pathing, run with caffeine). Walls between
  you and the camera cut away to knee height.
- **Toe Knee** is one continuous skinned mesh on a procedural skeleton (`app/otherworld/avatar`):
  two-bone IK, smooth shading with baked occlusion, a stiff old-school walk, elbows-up run, hair
  that settles from the head onto the shoulders, and a cloth-ish cape that streams behind you and
  drapes over the hips. There's a pose for each thing you can use: sitting in chairs and on
  benches, kneeling to hammer when you build, sawing when you remove, warming your hands, pulling
  a book off the shelf, praying, petting the cat, pumping water, playing the organ. Right-click
  yourself for emotes, or type `::dance`, `::wave`, `::cheer`, `::think`, `::clap`, `::shrug`,
  `::bow`, `::yawn`. The DialKit Player panel is the make-over mage: outfit (croissant shirt,
  polka dots and the chore jacket, embroidered stripes, or a fresh account), glasses, skin, hair,
  cape, the pointer helm, and `animFps` to hold frames like the game without animation smoothing.
  The Cat panel tunes the cat: speed, how much it wanders, idle times, nap and visit chances.
- **Long-press / right-click** anything for the "Choose Option" menu (Sit-on, Warm-hands,
  Search, Inspect, Examine, Steal-from…).
- **Building mode** (hammer button, the **B** key, or `::build`): empty hotspots show as ghosts.
  Right-click to open the furniture creation menu, build or remove pieces, and train
  Construction (xp is boosted ×8 here). Visitors start at level 90, unlocking every current
  furniture option; older saves are raised to at least 90 too. Edits and the house style persist per visitor.
- **House tab**: building mode, teleport inside / leave, call the servant (a multiplayer cursor
  called Anonymous Axolotl), seven house styles, a room list, and reset.
- **Inspect** a frame to get a design-tool properties panel with its own live shader stack, and
  wires that walk you to related work. Deep link any piece with `/?work=<slug>`.
- **Effects tab** is the world's Modyfi stack: reorderable halftone, dither, gradient map,
  posterize, chroma, scanlines and kaleido over a low-res render with pixel outlines.
- **Layers tab** is the island as a design file: hide or lock any layer.
- **Text tool (T)** drops physical 5×7 voxel letters. **Move tool (V)** lets you grab and throw
  props. **⌘Z** rewinds the physics with a VHS pass.
- Skills (with the classic XP curve; Cats starts at 99), inventory, quests, a tea stall to steal
  from, Tony to talk to, an amanita ring that makes the pixels breathe, bezier-handle butterflies, a fractal tree
  you can water, and a curry pot.
- **Music tab**: seven original tracks in the spirit of the old MIDI soundtrack (Dot Grid Dawn,
  Croissant Morning, Bézier Waltz, Pixel Lavender, Ninety-Nine Cats, Perlin Bread Shanty, Node
  Garden), played in order and looped once sound is on. Harp, flute, pizzicato and friends are
  all WebAudio synth voices; tracks are red until you've heard them. In order / shuffle / loop,
  skip, and a volume slider. Scores live in `app/otherworld/audio/tracks.ts` as chord charts and
  note strings (the notation is documented in `score.ts`).
- Chat commands: `::help`, `::dial`, `::target <panel>`, `::home`, `::island`, `::build`,
  `::tp <zone|house>`, `::tea`, `::type <text>`, `::music [track]`, `::next`, `::intro`, `::classic`.

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
Modyfi stack, Camera, Player, Cat, Physics, Artboards, Flora, HUD, Intro, Debug. The House panel
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

`pnpm dev` and `pnpm dev:all` run Next, the local copy CMS, and `tsc --watch`.
`pnpm typecheck` runs `tsc --noEmit`.

### Local copy CMS

In the running experience, click **Pause & edit copy**, or press **Ctrl/Cmd+Shift+E**.
The world, timers, physics, audio, video and animations freeze. Click a visible line,
dialogue, tooltip, 3D label, or world object to select its authored copy. Type in the
side panel to preview the change immediately in the frozen scene. Search finds copy
from other parts of the experience. **Resume** or **Escape** continues from the same
moment; unsaved drafts remain available. Discard restores the saved copy.

**Save & commit** (also Ctrl/Cmd+S) saves to `content/copy.json` and creates a local
commit containing only that file. Source files can have unrelated uncommitted work;
the editor never absorbs those edits. It rejects source or saved-copy changes made
since loading, keeps the draft for retrying, and restores its own writes if the
commit fails. Unrelated staged changes stay staged. Dynamic copy is edited in text
segments while its expressions remain intact.

**[localhost:3000/cms/](http://localhost:3000/cms/)** remains available as a searchable
copy desk, using the same saved copy and commit workflow. Additional technical strings
are visible there for reference and read only.

The adjacent **Push to main** button sends all pending commits to `origin/main`, including
commits made outside the CMS. The sidebar lists those commits before pushing. It requires
the local `main` branch and the machine's existing Git authentication, fetches first, and
refuses a divergent remote. It never force-pushes or auto-merges. Save drafts before pushing.

The CMS is a loopback-only companion under `scripts/cms/`. A build-time loader traces
copy ownership and connects pause controls only in development. Production uses only
the saved copy resolver: no editor UI, source metadata, pause code, or CMS endpoints.
The `/cms/` proxy exists only in development, and the companion refuses `NODE_ENV=production`.
`pnpm build` / `pnpm start` do not launch it. `pnpm cms` runs it separately at
`http://127.0.0.1:4318/cms/` (configure `CMS_PORT` and `PORT` together if needed).
Run `pnpm test:cms` for isolated copy-editing, commit, rollback, and push checks.

Useful URLs: `/?intro` forces the intro, `/?skip` skips it, `/?dial` shows DialKit,
`/?work=modyfi` deep-links to a piece, `/?webgl` forces the WebGL2 backend.

### Map of the code

```
content/            works, zones, profile, house, cat: the only files you need to touch to add art
app/otherworld/
  world/            island generation, places (island / house), A* pathfinding (pure TS)
  house/            the POH: room catalog, layout, walls + floors, garden courtyard, furniture
                    kit + catalog, construction, furniture actions
  avatar/           the player rig (procedural IK) and its pose library
  pet/              the cat: model + poses, behaviour (wander, nap, visit), right-click verbs
  shaders/          TSL materials, particles and the post pipeline (renderable headless)
  scene/            r3f components: house, terrain, player, artboards, cables, flora, fixtures,
                    physics props, intro + travel directors
  hud/              the OSRS × design-tool interface (DOM)
  state/            zustand store (persisted), per-frame runtime, events, actions, items, skills
  debug/            DialKit panels + tweak store
  audio/            WebAudio synth sfx and the soundtrack: score notation, tracks, player (no samples)
```

Stack: Next 15, React 19, three.js (WebGPU + TSL), @react-three/fiber 9, @react-three/rapier 2,
zustand, DialKit 2, hls.js (Mux streams on inspect).

### Deploying

Sign in with Vercel's CLI (`vercel login`), `vercel env pull .env.local`, and deploy as before.
