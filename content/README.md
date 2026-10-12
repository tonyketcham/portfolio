# Content: hanging art in Untitled-1

Everything the world shows comes from three files:

| File | What it holds |
| --- | --- |
| `works.ts` | Every project / piece. Adding an entry is all it takes to put it in the world. |
| `zones.ts` | The island's regions (named like design-file layers). |
| `profile.ts` | Name, bio lines, contact links (Tony's dialogue + the business card). |

## Add a piece

1. Drop the media in `public/art/<slug>/` (any web image; big files are downscaled to 1280px in-world automatically).
2. Append to `works` in `works.ts`:

```ts
{
  slug: 'liquid-type-04',            // unique, url-safe, also the procedural seed
  title: 'Liquid Type 04',
  year: '2024',
  summary: 'One to three sentences for the inspector.',
  examine: 'One line, old-school examine text. A little joke is good.',
  zone: 'modyfi',                    // which zone it lives in
  display: 'tree',                   // 'artboard' (upright frame) | 'tree' (canopy is the art)
  tags: ['modyfi', 'shaders', 'type'],
  media: [{ kind: 'image', src: '/art/liquid-type-04/cover.webp', alt: '…' }],
  fx: { halftone: 0.2, chroma: 0.3 }, // default mini Modyfi stack for this frame
}
```

That's it. It now:

- gets a spot in its zone (frames line up facing spawn; trees ring the zone)
- is cabled to related works by shared `tags` (plus explicit `connects: ['other-slug']`)
- appears in **Quests** (tap to cut-and-paste there), **Layers**, the minimap and the inspector
- trains a skill when inspected (`skill: 'shaders'`, default `tooling`)
- is deep-linkable: `/?work=liquid-type-04`

## Media kinds

```ts
{ kind: 'image', src: '/art/x/cover.webp', alt }
{ kind: 'mux', playbackId, poster: '/art/x/poster.webp', alt }   // poster in-world, HLS stream when inspected
{ kind: 'procedural', pattern, palette?: [dark, mid, light] }    // live shader stand-in
```

Procedural patterns: `halftone-bloom`, `contour`, `moire`, `flow`, `kaleido`, `dots`, `fractal`.
Use them with `placeholder: true` for slots you haven't filled yet; the frame gets a blue
"placeholder" tag and the inspector says so.

Mux playback ids live in `/videos/*.json` (`providerMetadata.mux.playbackId`).

## Per-piece effect stack (`fx`)

All 0–1: `halftone` (+ `dotScale`), `gradient` (+ `palette`), `displace`, `dither`, `chroma`, `scan`.
Visitors can tweak these live in the inspector's **Stack** tab.

## Zones

Give a zone an `id`, a `center` (world tiles, island centre is `[0, 0]`, keep within ~18 of it),
a `radius`, a `biome` (`plaza | grove | concrete | garden | ruins | mushroom`) and a colour.
A road cable from spawn is laid automatically. Keep zones from overlapping:
`distance(a, b) > a.radius + b.radius + 3`.

Hand-built set pieces (tea stall, monoliths, the fractal tree…) are positioned in
`app/otherworld/world/map.ts` → "Hand-placed fixtures".

## Copy flags

- `draft: true`: the copy was written as a stand-in; the inspector shows a "draft copy" badge.
- `placeholder: true`: no real media yet.
