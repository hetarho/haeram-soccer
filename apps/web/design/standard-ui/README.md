# Stadium Green UI sources

The active page refresh replaces shared Lucide glyphs with 32 full-colour European football-comic illustrations and uses organic grass in the light progression controller. See [current sources and regeneration](../page-refresh-v1/README.md); the baseline recipe below is retained and must be followed by the refresh recipe.

The refreshed interface retains the deep green hierarchy, Pretendard, official Lucide geometry
and painted sports-comic facility scenes. Six quiet matte frame plates and a supporting terrace
vignette add an image-built skin without cream sticker rims, print distress or raised cards.

- `sources/frames.png`: original generated six-plate atlas, with genuine alpha gutters and
  quiet rounded corners for nine-slice scaling.
- `sources/sidebar.png`: original generated terrace vignette; its quiet upper area stays below text.
- `prompts.json`: exact built-in `image_gen` prompts and the existing facility style reference.
- `scripts/prepare-standard-ui.mjs`: deterministic atlas slicing, pinned Lucide UI glyph imports,
  native wordmark/rules and material composition from the existing 160px static grain tile.

Run `node scripts/prepare-standard-ui.mjs` from the repository root to encode 31 WebP resources
and their provenance/checksums in `apps/web/public/art/standard/ui/`. Preparation uses the shared
`scripts/ui-art-resources.mjs` pipeline and requires project dependencies, Playwright Chromium,
`ffmpeg` and `ffprobe`. `--check` verifies deployed hashes using Node alone. Lucide paths and
optical weight remain unchanged; their license is retained at
`apps/web/public/presentation/themes/Lucide-LICENSE.txt`. The current facility set and registry IDs
are unchanged. Image materials never filter the live HTML labels or game-driven diagrams.

Store review captures/profiles in ignored `.tmp/` and remove them after recording verification.
Follow the [shared theme contract](../../../../spec/ssot/ARCH.md).

The [component-detail extension](details-v1/README.md) records current controls, neutral material
planes, ratings, table/tab hierarchy and analysis resources, with its separate regeneration recipe.
