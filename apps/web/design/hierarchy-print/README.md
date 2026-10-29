# Matchday Print content hierarchy

This iteration covers page tabs, content panels, attribute lists and tables, following
[WEB-91 and WEB-104](../../../../spec/ssot/WEB.md) and the
[shared design-system guide](../DESIGN-SYSTEM.md). It extends the
[original print family](../home-print/README.md); the
[button-colour proposal](../controls-print/README.md) remains a separate pending review.

## Current treatment

| Level           | Resource and density treatment                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Page tabs       | Quiet printed baseline, distinct vermilion active mark and stronger selected label; preserve the touch target          |
| Section heading | Larger charcoal title with an adjacent quiet note; supporting action stays at the end                                  |
| Panel surface   | Light sheet material over the subdued canvas; brightest detail cards within it; neutral frames disabled                |
| Attributes      | Compact label/value rows, subordinate labels and thin resource separators; no accumulated list margin                  |
| Table heading   | Light oat paper band with charcoal column labels, subordinate to a section title                                       |
| Table body      | Fine printed row rules, restrained alternate-row tint and smaller badge edges; row links retain their interaction area |

The shared `Panel` exposes `content-panel`, `panel-header` and `panel-footer` semantic hooks.
Its existing body keeps one content inset. Desktop and mobile consume the same density roles;
mobile must not reintroduce fixed 16px body/header padding or an extra panel margin.
The exact spacing, type sizes and displayed edge widths live in the
[theme pack](../../public/presentation/themes/matchday-print.json), not this README.

Attribute rows also supply compact rating-chip dimensions through semantic context tokens.
The current-strength badge reuses its existing frame at the row's text scale instead of the
standalone card scale. Label and value wrappers share a primary-line height, so hints do not
pull the number down. The same alignment applies on desktop and mobile.
The [five-tier rating artwork](../rating-print/README.md) supplies the contrasting background,
frame and live foreground colours for those compact values and table chips.

## Material planes

The [three-level surface iteration](../surfaces-print/README.md) now owns neutral canvas, sheet
and detail materials. The earlier sheet-frame resource below remains retained for portable
handoff in its source/manifest, while the current pack disables the neutral frame alias and
omits that unused image from preloading. Controls,
rating frames and functional rules keep their separate treatments.

## Pinned table depth

The league table's rank and club columns remain pinned in the narrow layout. Once data has
scrolled underneath, a trailing edge/shadow separates the pinned paper from the moving cells.
The cue disappears at the origin and does not intercept pointer input. The legend and expansion
controls stay outside the horizontal scroller.

`image-art-table-sticky-shadow` is a small, deterministic
[SVG alpha-fade resource](../../public/art/matchday-print/ui/sticky-column-shadow.svg), mapped
through `image-table-sticky-shadow` in the theme pack. Geometry and visibility belong to the
shared table renderer; the portable image supplies the edge and depth treatment. This geometric
primitive does not require a generated bitmap or a CSS-painted substitute.

## Resource inventory

Files deploy under `public/art/matchday-print/hierarchy-v1/`. The
[generation manifest](../../public/art/matchday-print/hierarchy-v1/generation.json) owns source
crops, dimensions, modes, source-pixel caps, encoding settings and checksums.

| Role                      | File                    | Rendering                                               |
| ------------------------- | ----------------------- | ------------------------------------------------------- |
| `image-art-content-sheet` | `frame-panel.webp`      | Nine-slice edges around separately tiled paper          |
| `image-art-table-heading` | `frame-table-head.webp` | Light horizontal band behind live column labels         |
| `image-art-content-rule`  | `rule-content.webp`     | Low-emphasis divider stretched independently of content |
| `image-art-tab-active`    | `rule-tab-active.webp`  | Stronger vermilion selection stroke                     |

[prompts.json](prompts.json) records the four built-in image_gen prompts and references.
[revision-prompt.json](revision-prompt.json) records the panel extraction edit; the preparation
recipe isolates the actual paper rectangle so its generated exterior shadow never ships.
[rule-revision-prompt.json](rule-revision-prompt.json) records the lighter supporting-rule edit.
Originals remain in [sources/](sources/). Paper grain comes from the existing tiled resource,
rather than magnifying the centre of the sheet image into visible large spots.

From the repository root:

```sh
node apps/web/design/hierarchy-print/build.mjs
pnpm run art:check
pnpm run validate:presentation
```

The recipe reuses `createUiArtPipeline` and the repository encoding policy. It requires the
installed dependencies, Playwright Chromium, `ffmpeg` and `ffprobe`. Regeneration updates WebP
files and the manifest; synchronize the theme's resource metadata if geometry changes, as
described in [RESOURCE-SKINS.md](../RESOURCE-SKINS.md). Application verification follows ARCH-30.

Inspect real computed padding and resource URLs as well as the screenshot. The initial panel
combined 12px outer padding with separate header/body padding and 18px list margins. The new
roles remove that duplication. Keep disposable desktop/mobile captures under
`.tmp/print-hierarchy/`, and record measured outcomes in the task rather than treating captures
as permanent approved artwork.
