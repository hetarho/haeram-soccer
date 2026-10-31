# Pixel UI sources

The active page refresh adds a native integer-grid controller tile and bronze/silver/gold/platinum/ruby rating frames. See [current sources and regeneration](../page-refresh-v1/README.md). Run that recipe after the baseline recipes below to retain the current registered resources.

`source.mjs` is the editable native source for the refreshed night-broadcast interface. It uses
flat charcoal/grass materials and stepped fixed corners. `icons.mjs` owns the semantic glyphs
and the small boot, manager, shirt, supporters and heart glyphs on a shared 24px integer grid.
The wordmark and low terrace vignette are authored on the grid too; no generated smooth art is
substituted for this established pixel family. Existing facility scenes and bitmap fonts are retained.

Run `node scripts/prepare-pixel-ui.mjs` from the repository root. The shared UI media pipeline
rasterizes 31 resources to lossless PNG in `apps/web/public/art/pixel/ui/` and records checksums and
source fragments in `generation.json`. A 128px frame has a 16px fixed corner region; tiled 32px
materials remain independent from the frame and live HTML. PNG avoids softening pixel edges.
This preparation requires project dependencies and Playwright Chromium. `--check` verifies shipped
checksums using Node alone. Shared resource authorship/encoding lives in
`scripts/ui-art-resources.mjs`; the selected pixel stylesheet supplies dimensions and nearest-neighbor
rendering while leaving the live pitch alone.

Working icon refinement, 2026-10-30: glyphs use a 24px grid instead of 16px, with smaller
stair steps, finer two-pixel rules and more room for windows, handles and clothing details.
Displayed sizes and the filled pixel-art style are retained. The preparation script synchronizes
semantic SVG paths in the theme pack and the shell's PNG masks from the same editable source;
increasing PNG resolution alone does not add detail to the underlying silhouette.

Keep review galleries, profiles and one-off capture scripts under ignored `.tmp/`; record outcomes
in the task and remove those disposable files. Follow the
[shared theme contract](../../../../spec/ssot/ARCH.md).

## Component details (T595)

Implemented working treatment, 2026-10-29. `pixelDetailSources()` in `source.mjs` extends the
original stepped frames. Run `node scripts/prepare-theme-details.mjs` from the root to prepare
all alternative packs and register their images/tokens; `--check` verifies encoded hashes.
This writes the separate `public/art/pixel/details-v1/` family rather than the original `ui/`.

| Role                                    | Native file (`details-v1/`, lossless PNG)                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Supporting actions / field / disabled   | `frame-secondary`, `frame-tertiary`, `frame-input`, `frame-dropdown`, `frame-disabled` |
| Checked / unchecked                     | `icon-checkbox-on`, `icon-checkbox-off`                                                |
| Canvas / sheet / detail / table heading | `canvas`, `quiet`, `ivory`, `table-heading`                                            |
| Quiet rule / tab mark / pinned edge     | `rule-content`, `rule-tab-active`, `sticky-column-shadow`                              |
| Rating tiers                            | `frame-rating-{iron,bronze,silver,gold,elite}`                                         |
| Analysis / formation                    | shared `quiet`, `icon-formation-marker`                                                |

128px frames preserve 16px caps and draw their actual centre. Materials and marks stay on the
integer grid with nearest-neighbour rendering. The pinned edge uses discrete alpha steps.
Source hashes, dimensions, caps and output hashes live in the separate generation manifest.

Primary retains green broadcast art; supporting actions get progressively quieter. Disabled
controls share muted charcoal-green art with readable copy. Hover/press/focus reuse geometry
and art with shared feedback. Disabled checkboxes intentionally share their corresponding
checked/unchecked artwork. Five light steel/copper/silver/gold/violet rating faces carry dark
numbers separately from button priority. Canvas/sheet/detail have discrete texture and mean
RGB approximately 17/20/21, 28/39/32 and 44/60/47; body contrast stays above 10:1. Analysis
shares the sheet and readable pale-green series; formation discs have green centres and light rims.

1380px desktop and 390/360px phone inspection covers controls, checked/disabled states, dropdown,
tabs/tables, cards, tiers, charts/formations, league, fixtures and home. No overflow or missing
resources was observed. Captures are disposable under `.tmp/theme-detail-review/`. This records
implemented artwork, not a new product rule; no unresolved design question blocks coverage.
