# Matchday Print rating tiers

Five compact rating skins combine a filled surface with a game-item-style engraved frame.
They follow [WEB-91](../../../../spec/ssot/WEB.md) and the
[shared design-system guide](../DESIGN-SYSTEM.md), extending the existing printed-ticket family.
They are rating-value levels, separate from primary/secondary/tertiary action hierarchy.

## Tier scale and readable values

The shared [`ovrTier` function](../../src/ui/OvrBadge.tsx) supplies the same presentation tier to
rating cards, potential ratings and league-table chips. Football ratings and simulation are
unchanged.

| Tier   | Overall value | Surface and frame                                 | Live text  |
| ------ | ------------- | ------------------------------------------------- | ---------- |
| Iron   | Below 50      | Medium-light steel blue-grey with engraved edges  | Dark navy  |
| Bronze | 50–64         | Bright copper-orange with bronze bevels           | Dark brown |
| Silver | 65–74         | Pale blue-grey with layered silver edges          | Dark navy  |
| Gold   | 75–84         | Golden ivory with amber/gold frame                | Dark umber |
| Elite  | 85+           | Vivid light violet with amethyst and gold accents | Dark plum  |

The revised iron, bronze and elite surfaces use the primary button as a visible-brightness
reference. Dark slate and dark plum collapsed into similar near-black chips at compact sizes;
the current surfaces keep their hue visible, and live foregrounds are chosen against the actual
encoded artwork as well as the declared fill token. Silver and gold retain their light treatment.

Each bitmap contains the surface and complete frame, without numbers or labels. Shared skins
draw the nine-slice centre with `fill`; foreground tokens keep the number and position/POT
labels readable. Contrast checks cover the declared text/fill pairs. Inspect the actual image
and small rendered chip as well, since a fallback colour alone cannot prove image legibility.

The five image roles are `image-art-rating-iron`, `image-art-rating-bronze`,
`image-art-rating-silver`, `image-art-rating-gold` and `image-art-rating-elite`.
The [theme pack](../../public/presentation/themes/matchday-print.json) maps each to
`rating-<tier>-frame`, `rating-<tier>-slice`, fill and text roles. Existing packs can use the shared
fallback artwork until their own tier family is designed.

## Compact and card contexts

The [attribute hierarchy notes](../hierarchy-print/README.md) describe primary-line alignment
and compact dimensions. Attribute rows retain their smaller number, padding and displayed edge
width; standalone cards retain their regular/large sizes. Tables use a compact frame with clear
background colour so an OVR remains visible among the other columns. Resource source caps and
displayed frame width are separate values, both carried by the resource/theme data.

Inspect all five tiers in the workbench's badge preview, including its inline attribute example;
also inspect actual table values and the current-strength row in the tabs/panels preview. Keep
disposable captures in ignored `.tmp/print-hierarchy/`.

## Sources and regeneration

[prompts.json](prompts.json) records the five individual built-in image_gen edit prompts and
the existing stamp-frame reference. Originals remain in [sources/](sources/).
[brightness-prompts.json](brightness-prompts.json) records the three brightness revisions and
button benchmark. The preparation recipe selects the revised `*-bright.png` sources for iron,
bronze and elite and emits distinct `*-bright.webp` deployment names. Original sources remain
available; superseded deployment copies are omitted.
The [generation manifest](../../public/art/matchday-print/ratings-v1/generation.json) records
dimensions, source crops, source-pixel caps, encoding parameters and SHA-256 hashes for the five
WebP resources deployed under `public/art/matchday-print/ratings-v1/`.

```sh
node apps/web/design/rating-print/build.mjs
pnpm run art:check
pnpm run validate:presentation
```

Run from the repository root with installed dependencies, Playwright Chromium, `ffmpeg` and
`ffprobe`. The recipe reuses `createUiArtPipeline` and the repository encoding policy; it updates
assets and the manifest. Synchronize the theme metadata if geometry changes. Verification tiers
remain ARCH-30; tier-boundary tests and theme foreground/background contrast checks run at the
task tier.
