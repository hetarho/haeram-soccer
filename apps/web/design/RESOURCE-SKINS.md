# Shared resource skins

The registered theme JSON files in `public/presentation/themes/` own visual data.
`src/presentation/contracts.ts` validates it and `theme.ts` resolves local resource URLs.
`image-ui-shell.css` and `image-ui-controls.css` assemble the same semantic roles for every theme.
Component styles own layout, not copies of a selected theme's appearance.

`tokens.ui` contains visual tokens and aliases. `images.ui` maps those roles to images with
`resource`, `width`, `height`, and `mode`. A `nine-slice` resource also has `slice`, measured in
source pixels from every edge. A `tile` repeats independently of its surrounding frame. Images
containing text, numbers, entire panels or one background per screen are unnecessary: the HTML
supplies the live content. `preload: false` reserves large shell decoration for browser demand.

These source images and dimensions can be reused by native renderers. Nine-slice metadata maps
to Flutter `Image.centerSlice` (the centre rectangle starts at `slice,slice` and ends at
`width-slice,height-slice`), UIKit resizable-image cap insets, or an Android nine-patch generated
from the same stretch region. Native rendering still needs a token/alias adapter and layout
implementation; a browser stylesheet is not a native renderer. Preserve source pixels, alpha,
repeat regions and the shared semantic roles during that adaptation.

Facilities declare optional `images.facility.variants`, each with its own dimensions, pattern
and office overrides. The image component measures its slot before starting its request and
supplies `srcset`/`sizes`; the theme-change collector chooses the same representation from the
mounted slot's pixel demand. Offscreen scenes remain lazy. The installer preflights shared UI
skins and mounted semantic needs, rather than every trophy variant in the icon inventory.

Preparation uses compact encodings: smooth frames up to 192px wide, pictograms 64px, material
tiles 256px, and facilities 960×320 with 480×160 variants. Pixel resources keep their native
lossless grid. `scripts/art-resources.mjs` and `scripts/ui-art-resources.mjs` apply generation
limits. After replacing source art, run `node scripts/optimize-presentation-art.mjs --write`
to synchronize manifests, JSON dimensions and responsive files. It records the input hash and
skips already optimized records, avoiding repeated lossy encoding. Run it without `--write` for
a read-only hash and byte-budget check. UI raster budgets are 35KB (65KB for sidebar decoration);
facility budgets are 180KB and 55KB. The unit tests protect the declared bounds, insets and
responsive selection; `pnpm run validate:presentation` checks every declared resource exists.

Original editable art and prompts remain under `design/` and generation manifests. Earlier
full-size deployed encodings remain recoverable through Git; do not ship duplicate originals.
The measured file-size comparison is in `artifacts/benchmarks/design-resources-261027.json`.
