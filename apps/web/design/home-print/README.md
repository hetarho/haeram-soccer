# Matchday Print UI sources

These are the retained source assets for the shared Matchday Print interface, including the home,
navigation, controls, tables and overlays.

- `sources/frames.png`: six frames with fixed corners for nine-slice scaling.
- `sources/icons.png`: sixteen stamped navigation and state pictograms.
- `sources/materials.png`: independently tiled paper, quiet paper, charcoal and vermilion.
- `sources/sidebar.png`: the football terrace vignette.
- `prompts.json`: exact generation prompts and the approved reference path.

The original approved print and sticker concepts remain in `../home-themes/`. The print reference
also supplies the masthead and thin rules; it is an input to regeneration.

Run `node scripts/prepare-print-home.mjs` from the repository root to regenerate the 31 WebP
resources and their manifest in `apps/web/public/art/matchday-print/home/`. This requires the
installed project dependencies, Playwright Chromium, `ffmpeg` and `ffprobe`. Use the pinned
project toolchain when regenerating. `node scripts/prepare-print-home.mjs --check` verifies the
deployed hashes without requiring the image conversion tools or launching a browser.

Review screenshots and comparison galleries are disposable. Store new captures in ignored
`.tmp/` and record their findings in the task result. Follow the
[theme production checklist](../../../../docs/THEME-CHECKLIST.md) for the next theme.
