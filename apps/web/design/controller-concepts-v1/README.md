# Controller material studies

Twelve controller studies, prepared on 2026-10-31. The owner selected **P3, G1, X2 and S1**;
they ship as `image-art-controller-background`, the transport material of the Matchday Print,
Stadium Green, Pixel and Sticker Football Club packs. The other eight remain development
alternatives.

Open the real component in `/design-system?story=controller-backgrounds` and choose
a theme.

| Theme                 | Candidates                                         | Saved original sources                                             | Exact prompt set                                                  |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Matchday Print        | P1 butter paper, P2 sage press, P3 burgundy cover  | [sources](../matchday-print/controller-concepts-v1/sources/)       | [prompts](../matchday-print/controller-concepts-v1/prompts.json)  |
| Stadium Green         | G1 forest bench, G2 sage turf, G3 clubhouse enamel | [sources](../standard/controller-concepts-v1/sources/)             | [prompts](../standard/controller-concepts-v1/prompts.json)        |
| Pixel                 | X1 olive LCD, X2 midnight board, X3 jade arcade    | [editable native grid](../pixel/controller-concepts-v1/source.mjs) | [source directions](../pixel/controller-concepts-v1/prompts.json) |
| Sticker Football Club | S1 butter clay, S2 pistachio clay, S3 apricot clay | [sources](../sticker-club/controller-concepts-v1/sources/)         | [prompts](../sticker-club/controller-concepts-v1/prompts.json)    |

The nine raster originals were generated with the built-in `image_gen` tool.
The three Pixel materials extend the existing integer-grid source family.
`node scripts/prepare-controller-concepts.mjs` prepares review tiles with the shared
UI-art pipeline: 256px WebP for raster families, 32px lossless PNG displayed at 64px
for Pixel. Each theme's `tiles/generation.json` records source/output hashes, tile
dimensions and repeat metadata. Candidate IDs and local text roles live in
`src/design-system/controllerBackgroundOptions.ts`.

Visual review covered all twelve actual controls in automatic and manual mode at
wide and 390px preview widths. No clipping or missing resources was observed.

## Selected material deployment

`node scripts/prepare-controller-backgrounds.mjs` prepares the four selected sources with
the shared UI-art pipeline, records source hashes and selection metadata, and registers
`image-art-controller-background` in every theme pack. Matching transport fill, foreground
and muted tokens reproduce the chosen treatment with normal material blending. Output is
`public/art/<theme>/controller-v1/material.webp` (Pixel: `material.png`). Pixel retains its
32px native grid displayed at 64px; the other materials repeat at 256px.

Run `node scripts/optimize-presentation-art.mjs --write` after preparation to synchronize
the standard deployment encoding and manifests. Run the selected-controller recipe last
when rebuilding older theme/page-refresh families, which retain historical controller tokens.
Preparation uses the shared browser encoder; the optimizer's write pass needs an FFmpeg build
with `libwebp`.
