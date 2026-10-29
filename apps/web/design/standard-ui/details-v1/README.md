# Stadium Green component details

Current page-refresh resources supersede the rating family and shared icons/controller described below; see [active recipe](../../page-refresh-v1/README.md). This section retains the earlier detail-family provenance.

Implemented working artwork for T595, 2026-10-29. Read the [shared guide](../../DESIGN-SYSTEM.md),
[resource contract](../../RESOURCE-SKINS.md) and [original family](../README.md).
This extends the matte green controls and natural green materials, preserving Lucide geometry,
Pretendard and existing facility/trophy artwork.

The built-in image tool created the two originals in `sources/`. Exact prompts and references
are in [prompts.json](prompts.json). The component atlas is a 4×4 grid; unused heading/rule
cells remain in source while quieter tiled material and native constant-thickness rules ship.
The material atlas contains canvas, sheet, detail and navigation quadrants. The existing dark
navigation material is retained; the new sheet also supplies the table-heading plane.

| Role                                          | Runtime file in `art/standard/details-v1/`                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Supporting actions                            | `frame-secondary.webp`, `frame-tertiary.webp`                                  |
| Field / dropdown trigger and popup / disabled | `frame-input.webp`, `frame-dropdown.webp`, `frame-disabled.webp`               |
| Checkbox states                               | `icon-checkbox-off.webp`, `icon-checkbox-on.webp`                              |
| Canvas / sheet / detail                       | `canvas.webp`, `quiet.webp`, `ivory.webp`                                      |
| Table headings / quiet rules / active tab     | `table-heading.webp`, `rule-content.webp`, `rule-tab-active.webp`              |
| Rating tiers                                  | `frame-rating-{iron,bronze,silver,gold,elite}.webp`                            |
| Analysis / formation / pinned edge            | shared `quiet.webp`, `icon-formation-marker.webp`, `sticky-column-shadow.webp` |

Run `node scripts/prepare-theme-details.mjs` from the repository root. It prepares all three
alternative packs through `createUiArtPipeline` and updates their JSON metadata/manifests.
`--check` verifies output hashes without a browser. Preparation requires dependencies,
Chromium, ffmpeg and ffprobe. Runtime dimensions, caps, crops, source hashes and encoding
policy live in the generated manifest. Pixel uses its own lossless path in the same recipe.

The authored centre renders through nine-slice fill. Secondary uses muted sage and tertiary
a quieter deep green; primary keeps the pale-green plate. Hover, press and focus share artwork
with existing geometry and semantic feedback. Disabled buttons/fields/dropdowns share a
grey-green plate without fading text; disabled checkboxes intentionally share their corresponding
checked/unchecked image. Labels, hints and game facts stay live.

Neutral groups have no extra outline. Encoded mean RGB for canvas/sheet/detail is approximately
13/34/22, 31/62/38 and 47/83/50; cream body text contrasts at least 7.8:1. Fine pigment grain
remains visible at 256px tile scale. Ratings have five bright surfaces and dark live numbers,
separate from action priority. Analysis shares the sheet and readable pale-green primary,
preserving semantic heat maps.

Review covers desktop 1380px and phones 390/360px: controls, open dropdown, toggled/disabled
checkboxes, tabs/tables, cards, ratings, charts/formations, league, fixtures and home. No document
overflow or resource errors were observed. Disposable captures live under `.tmp/theme-detail-review/`.
These are implemented working treatments, not new approved product requirements. No unresolved
design decision blocks this coverage.
