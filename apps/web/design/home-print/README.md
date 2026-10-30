# Matchday Print UI sources

These are the retained source assets for the shared Matchday Print interface, including the home,
navigation, controls, tables and overlays.

Read the [shared design-system guide](../DESIGN-SYSTEM.md) before extending this family.
The [control source notes](../controls-print/README.md) describe the current component assets
and the pending button-hierarchy review.
The [home/away badge notes](../matchday-print/home-away-badges/README.md) cover the home/away ticket resources.
The [content hierarchy notes](../hierarchy-print/README.md) cover tab marks, quiet panel surfaces,
table materials and compact spacing.
The [analysis notes](../analysis-print/README.md) cover chart paper and circular player markers;
the [surface notes](../surfaces-print/README.md) define the three neutral material planes and Card;
the [coverage inventory](../UI-COVERAGE.md) records their application across actual app views.

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
The preparation pipeline is shared with Sticker Football Club in `scripts/ui-art-resources.mjs`;
the print crops, encoding parameters and deployed artwork retain their existing output.

Review screenshots and comparison galleries are disposable. Store new captures in ignored
`.tmp/` and record their findings in the task result. Follow the
[shared theme contract](../../../../spec/ssot/ARCH.md) for the next theme.
