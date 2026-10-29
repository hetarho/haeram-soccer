# Shared page and theme refresh

Approved behavior and appearance follow WEB-11/18/55/58/69/91/96. Artwork in `sources/`
is implemented working output from the built-in image tool, not a separate source of policy.
[prompts.json](prompts.json) retains every exact prompt, alpha choice and style reference.

- `rating-frames.png`: bronze, silver, gold, platinum and ruby engraved frames for Print and Stadium Green.
- `sticker-components.png`, `sticker-ruby.png`: smooth clay controls, continuous rounded rims and five rating faces.
- `sticker-materials.png`: quiet oat/cream/vanilla material planes and sunny yellow primary/controller material.
- `stadium-icons.png`, `stadium-details.png`: 32 full-colour European football-comic icons; labels and facts remain HTML.
- `stadium-grass.png`: organic green turf for the light Stadium Green controller.
- Pixel rating/controller sources remain integer-grid SVG in `scripts/prepare-page-refresh.mjs`, encoded as lossless PNG.

Run `node scripts/prepare-page-refresh.mjs` from the repository root after regenerating older
base families. It reuses `createUiArtPipeline`, deterministic silhouette/cell cropping and the
shared compressed-image policy. Each pack's `art/<theme>/page-refresh-v1/generation.json`
records sources, SHA-256 hashes, dimensions, repeat modes and native nine-slice caps.
`--ratings-only` prepares only rating resources. `--check` verifies shipped hashes with Node.
Regeneration requires existing project dependencies, Chromium, ffmpeg and ffprobe.

Surfaces draw their authored centre as well as the frame. Rounded outside corners belong to
the containing plane; adjacent home summary slots have square internal joins. Keep live text,
keyboard/touch behavior, recorded club identity, game state and the workbench isolation boundary.
Review captures belong in ignored `.tmp/`; verification follows ARCH-30.

Review evidence: actual home, cup cards, settings and team sheets at 1380px and 390px across
all four packs; controller bounds, five rating roles and browser errors checked. Focused Chromium
checks confirm settings/transport text contrast in every theme, including menu hover, and settled
modal touch geometry. Source/runtime validation and the shared resource budgets pass. Existing
engine and legacy browser regressions remain tracked separately in T596–T598.
