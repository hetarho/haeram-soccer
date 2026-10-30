# Matchday Print control resources

This source set extends the [original print UI artwork](../home-print/README.md) with reusable
control skins. Read the [shared design-system guide](../DESIGN-SYSTEM.md) for cross-theme
principles and the [resource contract](../RESOURCE-SKINS.md) for portable media metadata.
The current product decisions remain [WEB-91 and WEB-104](../../../../spec/ssot/WEB.md).
For tabs, panel spacing and table hierarchy, see the separate
[content hierarchy iteration](../hierarchy-print/README.md).

## Identity and review status

The theme's established identity is warm newsprint, charcoal and vermilion, printed ticket
corners, restrained paper grain and stamped marks. The assets keep live labels and editable
values outside the artwork.

| Topic                    | Status                        | Treatment                                                                                                   |
| ------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Resource-backed controls | Implemented                   | Separate bitmap surfaces for supporting buttons, editable fields, dropdowns and checkbox states             |
| Primary                  | Established artwork           | Vermilion ticket using the existing stamp frame and material                                                |
| Secondary                | Implemented working treatment | Forest-green filled ticket; visual hierarchy is under review                                                |
| Tertiary                 | Implemented working treatment | Blue-grey filled ticket; visual hierarchy is under review                                                   |
| Quieter hierarchy        | Proposed, not applied         | Secondary in cream paper with charcoal frame/text; tertiary with minimal background/frame and charcoal text |

Do not copy the three current strong hues as the definition of primary/secondary/tertiary for
another theme. The shared concept is relative action emphasis. The proposed quieter print
variants require a later design decision and matching resource changes; documenting them does
not change the current UI or the current palette rule in WEB-91.

## Deployed resources

The [generation manifest](../../public/art/matchday-print/controls-v1/generation.json) owns exact
dimensions, source crops, insets, encoded sizes and checksums. The table below is the semantic
inventory; all files deploy under `public/art/matchday-print/controls-v1/`.

| Semantic image role              | File                     | Use                                      |
| -------------------------------- | ------------------------ | ---------------------------------------- |
| `image-art-control-secondary`    | `frame-secondary.webp`   | Filled supporting button                 |
| `image-art-control-tertiary`     | `frame-tertiary.webp`    | Filled additional-action button          |
| `image-art-control-input`        | `frame-input.webp`       | Text/number fields and text areas        |
| `image-art-control-dropdown`     | `frame-dropdown.webp`    | Select trigger and open list frame       |
| `image-art-control-checkbox-off` | `icon-checkbox-off.webp` | Complete unchecked box                   |
| `image-art-control-checkbox-on`  | `icon-checkbox-on.webp`  | Complete checked box, including its mark |
| `image-art-control-disabled`     | `frame-disabled.webp`    | Inactive buttons and fields              |

The five frame resources use nine-slice geometry with filled centres; the two checkbox
resources are complete square images. Checkbox bitmaps render at 20×20 CSS pixels within
labels that retain the larger interaction target. The dropdown indicator remains a separate
semantic icon. Disabled checkboxes currently reuse their checked/unchecked images; they do
not have separate disabled artwork in this source set.

The [theme pack](../../public/presentation/themes/matchday-print.json) maps these image roles to
the shared button, field, select and checkbox aliases. The
[shared control stylesheet](../../public/presentation/themes/image-ui-controls.css) draws them.
Review the rendered checked state: the unchecked selector must not override its image.

The transport's compact pace selector also uses `frame-dropdown.webp`, including its filled
centre, through the same shared aliases. Its wrapper adjusts sizing only; the surrounding
transport material does not replace the dropdown skin.

## Sources and regeneration

[prompts.json](prompts.json) records seven individual built-in image_gen edit prompts and the
existing frame used as each reference. Original generated PNGs remain in [sources/](sources/).
These originals are preparation inputs, not deployment resources.

From the repository root:

```sh
node apps/web/design/controls-print/build.mjs
```

The recipe reuses `createUiArtPipeline` from `scripts/ui-art-resources.mjs` for alpha bounds,
fixed-corner preparation and compact WebP encoding. It needs installed project dependencies,
Playwright Chromium, `ffmpeg` and `ffprobe`. It updates the seven deployed images and their
generation manifest; it does not automatically rewrite the theme JSON. If regenerated
dimensions or roles change, synchronize that metadata before validation using the procedure
in [RESOURCE-SKINS.md](../RESOURCE-SKINS.md).

```sh
pnpm run art:check
pnpm run validate:presentation
```

These checks validate resource delivery. Application checks and browser-suite scope remain
defined by ARCH-30. Existing `preview*.png` files are working review evidence, not approved
artwork or production assets; keep new disposable captures in ignored `.tmp/` and record the
review outcome in the task. Update this README when the hierarchy proposal is accepted,
rejected or implemented so another theme author can distinguish the current state.
