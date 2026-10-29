# Sticker Football Club UI sources

The approved concept is `../home-themes/captures/sticker.png`. Source atlases in `sources/`
and exact prompts in `prompts.json` supply the shared image-built UI; live game text stays HTML.

Run `node scripts/prepare-sticker-ui.mjs` from the repository root to prepare 31 WebP resources
and their manifest in `apps/web/public/art/sticker-club/ui/`. Source atlases contain six frames,
sixteen pictograms, four material tiles and a sidebar vignette; the approved concept supplies
the fixed Latin masthead. Material crops also supply reusable rules.

Regeneration requires project dependencies, Playwright Chromium, `ffmpeg` and `ffprobe`.
`node scripts/prepare-sticker-ui.mjs --check` verifies deployed hashes without conversion tools
or a browser. The shared preparation helper isolates complete silhouettes before cropping so
imprecise generated grid gutters cannot cut sticker rims.

The resource contract is documented in
[Presentation pack contracts](../../../../apps/web/src/presentation/contracts.ts). Keep disposable review captures and
isolated browser profiles in ignored `.tmp/`, following the
[shared theme contract](../../../../spec/ssot/ARCH.md).

The [component-detail extension](details-v1/README.md) records current controls, material planes,
rating tiers, table/tab hierarchy and analysis resources, with its separate regeneration recipe.
