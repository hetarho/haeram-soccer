# Pixel UI sources

`source.mjs` is the editable native source for the refreshed night-broadcast interface. It uses
flat charcoal/grass materials, stepped fixed corners and the existing semantic pixel glyph paths.
The small boot, manager, shirt, supporters and heart glyphs extend that same integer grid.
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

Keep review galleries, profiles and one-off capture scripts under ignored `.tmp/`; record outcomes
in the task and remove those disposable files. Follow the
[shared theme contract](../../../../spec/ssot/ARCH.md).
