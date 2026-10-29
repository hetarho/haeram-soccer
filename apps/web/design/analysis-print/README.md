# Matchday Print analysis resources

Implemented working artwork, 2026-10-29. Read the [shared guide](../DESIGN-SYSTEM.md) and
[resource contract](../RESOURCE-SKINS.md) before extending it. The current primary is vermilion
`#a63724`; paper and fine red markings support the main data rather than competing with it.

| Role             | Source                         | Deployment                               | Mode                   |
| ---------------- | ------------------------------ | ---------------------------------------- | ---------------------- |
| Analysis paper   | `sources/analysis-paper.png`   | `analysis-v1/paper-quiet.webp`           | 256px repeating tile   |
| Formation player | `sources/formation-marker.png` | `analysis-v1/icon-formation-marker.webp` | 64px transparent image |

Both originals were made with separate built-in `image_gen` calls. Exact prompts are retained in
[prompts.json](prompts.json). Run `node apps/web/design/analysis-print/build.mjs` from the root
to reproduce compact WebP encodings and their provenance manifest. This uses the existing
`createUiArtPipeline`; no text or field geometry is baked into the resources.

Charts keep their real season samples, optional context bands, pointer selection and keyboard
slider. The primary line and latest-value header carry emphasis; a quiet tint under an ordinary
series supports it. Rank charts omit that area so lower-is-better data is not implied as volume.
Heat maps retain the existing continuous cold-to-hot scale; the primary colour does not replace
its meaning. Analytical pitches retain the existing 1.9:1 projection and cell coordinates,
while the centre marking uses one radius on both axes.

Formation fields use a 68:105 SVG coordinate system and matching CSS aspect ratio. Height caps
must not squeeze a wide field into a shorter rectangle. Player discs and short names replace
large multi-line panels. On a full formation, each marker selects its complete role, player,
effective rating and adaptation below the field. All eleven facts remain mounted and each is
reachable by a labelled button. Mini formation cards keep static short labels and full-name
accessible group context. The existing PositionMap retains its separate portable resource role.

Manual inspection covers all four formations, chart keyboard/pointer selection, cell feedback,
full formation selection, and desktop/mobile bounds. Captures belong under ignored `.tmp/`.
