# Sticker Football Club component details

Implemented working artwork for T595, 2026-10-29. Read the [shared guide](../../DESIGN-SYSTEM.md),
[resource contract](../../RESOURCE-SKINS.md) and [original family](../README.md).
New controls retain cream die-cut rims, forest contours, flat faces and restrained graphic
shadows. Original facilities, colourful pictograms, trophies and Pretendard remain.

The built-in image tool created `sources/components.png` and `sources/materials.png`.
[prompts.json](prompts.json) contains exact prompts and the reference. The 4×4 component atlas
separates controls, marks and rating surfaces; unused heading/rule cells remain in source.
Four material quadrants supply canvas, sheet, detail and a pale-sage table heading.

| Role                                          | Runtime file in `art/sticker-club/details-v1/`                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Supporting actions                            | `frame-secondary.webp`, `frame-tertiary.webp`                                  |
| Field / dropdown trigger and popup / disabled | `frame-input.webp`, `frame-dropdown.webp`, `frame-disabled.webp`               |
| Unchecked / checked                           | `icon-checkbox-off.webp`, `icon-checkbox-on.webp`                              |
| Canvas / sheet / detail                       | `canvas.webp`, `quiet.webp`, `ivory.webp`                                      |
| Heading / quiet rule / active tab             | `table-heading.webp`, `rule-content.webp`, `rule-tab-active.webp`              |
| Rating tiers                                  | `frame-rating-{iron,bronze,silver,gold,elite}.webp`                            |
| Analysis / formation / pinned edge            | shared `quiet.webp`, `icon-formation-marker.webp`, `sticky-column-shadow.webp` |

Reproduce with `node scripts/prepare-theme-details.mjs` from the root. The shared pipeline
extracts silhouettes, preserves alpha, encodes WebP and registers dimensions, source-pixel
caps, repeat modes and aliases. It requires dependencies, Chromium, ffmpeg and ffprobe.
`--check` verifies shipped hashes without conversion. The generated manifest owns exact
dimensions, crops, source/output hashes and byte counts.

Primary keeps burnt orange; secondary uses quiet sage and tertiary near-ivory. Five bright
rating faces carry dark live numbers, separate from action priority. Fields use an ivory inset;
dropdown trigger/popup share that family while indicators/options remain live. Disabled controls
share beige art with readable text. Disabled checkboxes intentionally share their corresponding
checked/unchecked state. Hover, press and focus reuse art with shared geometry and feedback.

Canvas, sheet and detail brighten progressively with visible fibre/flecks at the 256px scale.
Their encoded mean RGB is approximately 232/215/180, 243/234/216 and 252/247/233; dark-green
body contrast is at least 9:1. Quiet rules and heading materials establish hierarchy without
repeated outline cards. Analysis shares the sheet; the main series and formation marker use
burnt orange while heat maps retain their semantic scale.

Small accent text uses darker burnt orange `#9b3617`: the action/series colour `#b84620`
does not reach 4.5:1 on the recessed canvas. The darker text exceeds 5:1 on that encoded plane;
the graph line, marker and filled primary action retain their existing colour.

Review covers 1380px desktop and 390/360px phones: controls/states, open dropdown, tabs/tables,
three-plane cards, all tiers, charts/formations, league, fixtures and home. No overflow or missing
resource was observed. Disposable captures live under `.tmp/theme-detail-review/`. These are
working resources, not new approved product rules; no unresolved design question blocks coverage.
