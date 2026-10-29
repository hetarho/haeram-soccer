# Shared design system and theme authoring

This is the reusable guide for building themes while reviewing real components at
`http://localhost:19500/design-system`. It applies to the shared interface and later native-app
adaptations. Theme-specific appearance belongs in each theme's source notes and portable pack.

Product decisions remain authoritative in [WEB-91, WEB-103 and WEB-104](../../../spec/ssot/WEB.md).
[ARCH-32](../../../spec/ssot/ARCH.md) owns the architecture. The
[resource-skin contract](RESOURCE-SKINS.md) explains media metadata, native adaptation and budgets;
this guide does not redefine those contracts.

## Resources carry the design

Author the visible surfaces, frames, texture and state marks as reusable image resources. A
complete theme covers supporting buttons, inputs, checkboxes and dropdowns as well as its main
action, illustrations and navigation. A CSS-coloured rectangle is not a substitute for a
requested artwork asset.

Shared CSS assembles artwork, positions live content and provides sizing, scrolling and
accessible interaction. A focus outline may remain an accessibility primitive. Readable fallback
colours protect against failed image loads; they do not count as a completed skin.

Keep text, numbers, field values, selected options and game facts live. Do not bake labels or
an entire screen into a bitmap. Continue an established vector or pixel family in its native
source format; raster generation is not a requirement to replace existing editable artwork.

For full-surface skins, render the authored centre as well as the frame. Nine-slice centre fill,
or a separate repeating material, preserves the actual artwork at different control sizes.
Registering an image without drawing its surface is incomplete.

## Button roles express emphasis

Primary, secondary and tertiary name action priority, not three mandatory hues. Use this as the
starting point for a theme review, rather than assigning every role an equally strong fill:

| Role      | Purpose                         | Starting visual treatment                                     |
| --------- | ------------------------------- | ------------------------------------------------------------- |
| Primary   | Main action in an action group  | Strongest filled artwork and clear label contrast             |
| Secondary | Supporting action               | Quieter paper or surface, restrained frame or lighter fill    |
| Tertiary  | Optional or low-priority action | Minimal surface and frame; text or an icon carries the action |

The precise treatment is a theme decision. A quiet or transparent variant still has an explicit
resource treatment where artwork is needed; it need not invent a visible rectangle. Compare the
three roles together so their relative weight survives the theme's material and texture.

Keep semantic status colours separate from action priority: a destructive action, a successful
result and a selected option have different meanings. Also distinguish button roles from the
existing `secondary-fill` surface tokens used by headers and the progression controller.

When an applied choice uses an explicit secondary or tertiary role, preserve that role's filled
artwork and contrasting text through the pressed state. Generic selection-frame rules must not
replace it with an outline. Keep unapplied choices quiet and retain `aria-pressed` for access.

Rating tiers are a separate ordered value scale. Their background and frame can change together
to identify rarity, while the live number stays readable. Do not reuse that colourful scale as
the definition of button priority. The current Matchday Print treatment and regeneration recipe
are in the [rating resource notes](rating-print/README.md); the shared `ovrTier` function owns the
presentation mapping used by both table chips and cards.

Compare actual surface brightness at the smallest rendered chip size. Different dark hues can
both read as black once reduced; a decorative frame cannot compensate for an indistinct fill.
Use a familiar action surface as the brightness reference and select the live foreground against
the encoded image, not only its fallback colour token.

## Component review coverage

### Content hierarchy and density

Read page navigation, section titles, body values and supporting metadata at different levels.
Use type size, weight, local contrast and resource treatment together; repeating the same dark
frame around every group removes that hierarchy. Tabs identify location, panels group related
facts, and tables make comparisons. Their edges need not carry equal emphasis.

Prefer a clear selected-tab mark over a row of competing button-like boxes. Let the section
title lead a quiet paper surface; keep its note and supporting action subordinate. In a table,
column labels orient the reader, body values stay readable, and row separators remain quieter
than both. An own-club mark may identify our row without turning every alternate row into a
large highlighted block.

Before reducing text or touch targets, inspect accumulated spacing: a panel's outer padding,
header/body padding, child-list margins and mobile overrides may all add to the same inset.
Give each boundary one spacing owner. Keep dense data rows and explanatory copy compact while
retaining reachable controls. The theme's density tokens own values; review their computed
desktop and mobile result rather than copying dimensions into this guide.

Match rating chips to their context. An attribute value uses the row's compact type and edge
weight; a standalone player/profile card can carry the larger presentation. Keep labels and
values on the primary line, with explanatory hints below that line. Avoid inline-card baseline
gaps that make one value appear lower or force the entire row to expand.

Use quiet image rules, reusable sheet edges and header materials for these distinctions. Tile
fine grain at its intended scale instead of stretching a few grain pixels across a large
panel. A section frame can surround a separate tiled material without filling its centre.

When a table scrolls under pinned columns, keep the pinned surface opaque and show a restrained
depth/edge resource at its trailing boundary after scrolling starts. Hide that cue at the origin
or when the pinned layout is inactive, and keep it pointer-transparent. Legends and footer
controls belong outside the horizontal scroller so they remain readable while data moves.

Related pinned controls share one opaque material plane and one sticky position. Put a compact
return, competition filters and view tabs inside that plane; separate sticky rows with fixed
offsets or margins can expose scrolling table rows between them when content wraps.

### Neutral material planes

Separate neutral content with three reusable material levels before adding outlines:

| Plane  | Responsibility                            | Shared image alias      |
| ------ | ----------------------------------------- | ----------------------- |
| Canvas | Recessive page backdrop                   | `image-canvas-material` |
| Sheet  | Main section or notebook content          | `image-quiet-material`  |
| Detail | Individual records, cards and inset facts | `image-detail-material` |

The light Matchday Print implementation gets brighter toward detail; another theme chooses its
own tonal direction and material family while preserving a clear grouping hierarchy. Review
actual encoded pixels and adjacent planes together: three registered textures that look equally
bright do not create hierarchy. Adjust small text and semantic foreground contrast when changing
the canvas. Texture scale stays independent of the content size. Inspect the final encoded tile at its
actual display size as well as the source: microscopic source grain can disappear when
downsampled or compressed. Preserve visible fibre/fleck structure in all three planes,
including the brightest detail card; do not accept an effectively flat surface just because
a texture file is registered.

Borderless groups still use real material resources. Keep enough existing spacing to reveal
the surrounding plane, with one padding owner. Reserve strong frames for actions, selected
navigation, badges or other meaningful emphasis. Do not turn every inner row into another
frame. The current three resources, measurements and regeneration recipe are in
[surfaces-print](surfaces-print/README.md).

Use the shared [Card](../src/ui/Card.tsx) for a compact record/summary: optional live metadata,
a title, body and actions on `sheet` or `detail`. The component owns spacing and theme roles own
appearance. A card does not become a button merely by containing actions. Compare body-only,
long-title and multi-action variants in the `cards` workbench story, then review a real consumer
such as the fixture notebook.

### States and component coverage

| Component             | Resource responsibilities                                                     | Cases to compare                                                                                       |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Buttons               | Main, supporting and quiet treatments; designed inactive surface where needed | Enabled, disabled, hover, pressed, keyboard focus, long label                                          |
| Inputs and text areas | Editable inset, readable paper/material and frame                             | Empty placeholder, value, number, disabled, focus, multiple lines                                      |
| Checkboxes            | Unchecked and checked artwork with a legible mark                             | Toggle both ways, disabled states, square visible box, label activation                                |
| Dropdowns             | Trigger frame, indicator resource, popup frame and option selection treatment | Closed/open, selected/highlighted/disabled option, hints, keyboard use, narrow viewport                |
| Tabs and panels       | Selected-navigation mark, quiet group surface and section rules               | Selected tab, keyboard navigation, title/note/action hierarchy, nested spacing, mobile overrides       |
| Tables                | Column-header material, subtle row rules and restrained badges                | Own row, alternating rows, long club names, narrow scrolling, readable numbers and reachable row links |

States may intentionally share artwork; record that choice. When a state changes the designed
surface or mark, provide the appropriate asset rather than treating a generic CSS fill as
finished artwork. Preserve accessible focus and the touch targets required by WEB-17. A small
checkbox image and its larger clickable label are separate geometries.

Inspect what is actually drawn. A checked image can be registered correctly yet remain hidden
by a more specific unchecked selector. Likewise, a `none` frame alias can silently discard the
resource. Check state changes and the resulting resource URL, not just the file inventory.

## Portable resource handoff

The [theme contract](../src/presentation/contracts.ts) is the schema, and the
[theme registry](../public/presentation/themes/index.json) is the available-theme inventory.

| Layer                                    | Owns                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `images.ui`                              | Resource path, source width/height, image/tile/nine-slice mode, source-pixel inset |
| `tokens.ui`                              | Semantic aliases, local text roles and rendering parameters                        |
| Shared skin styles                       | Assembly of those roles without a separate screen implementation per theme         |
| Component styles                         | Layout, responsive bounds and space for live content                               |
| Source directory and generation manifest | Editable originals, exact prompts/references, encoding recipe and hashes           |

Give roles stable names such as `image-art-control-input`; a filename or a colour name alone
does not describe where an asset belongs. Share resources when their meaning and treatment
really match, rather than copying the same file for every screen.

Keep source-pixel insets distinct from displayed edge width. Preserve transparent exterior
pixels, stretch regions and repeat behavior. Native clients can reuse this information and the
artwork, but still need their own layout and token adapter; the web renderer does not implement
the native app. See [RESOURCE-SKINS.md](RESOURCE-SKINS.md) for the existing handoff details.

## Work on one component group at a time

1. Read the shared rules and the target theme's source notes. Identify what is approved,
   implemented or still proposed before treating a screenshot as a reference.
2. Review the real component group in the workbench. List its missing variants and states;
   use the [catalog](../src/design-system/catalog.ts) as the current preview inventory.
3. Generate or author missing resources in the existing art family. Retain originals, exact
   prompts, reference paths and constraints. Keep labels and data out of the artwork.
4. Use the shared preparation pipeline, register metadata and connect semantic aliases. Follow
   the existing encoding policy instead of introducing a second media pipeline.
5. Inspect the actual component, including checked/open/disabled states, longer Korean text
   and mobile bounds. Follow the verification tiers in ARCH-30; retain review findings with
   the task and keep disposable captures under ignored `.tmp/`.
6. Update the common guide when a lesson applies across themes, and the theme notes when it
   concerns that theme's art or current coverage. A changed product decision goes through
   SSOT first. Keep documentation changes alongside the relevant implementation.

## Keep decisions and working output distinct

| Status                        | Meaning and recording location                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Approved rule                 | Current SSOT decision; the guide explains or links to it                                      |
| Implemented working treatment | What the current pack and renderer display; record in theme source notes                      |
| Proposed treatment            | A recommendation awaiting a design decision; do not present it as approved or already applied |
| Historical evidence           | Completed tasks, older prompts and captures; not a replacement for current rules              |

For each theme, keep a short source README covering its identity, component coverage, role-to-file
mapping, generation recipe and open design questions. Update the current guidance instead of
turning this document into a transcript. Link to the exact source for values that code or the
resource manifest already owns.

Current examples: [Matchday Print source family](home-print/README.md),
[Matchday Print control iteration](controls-print/README.md),
[Matchday Print content hierarchy](hierarchy-print/README.md),
[standard UI](standard-ui/README.md), [pixel UI](pixel-ui/README.md) and
[Sticker Football Club](sticker-club/README.md). The print control iteration includes a pending
button-hierarchy review; its current green and blue-grey fills are not a prescription for new themes.

The alternative-theme detail inventories are in [Stadium Green](standard-ui/details-v1/README.md),
[Pixel](pixel-ui/README.md#component-details-t595) and
[Sticker Football Club](sticker-club/details-v1/README.md). They cover supporting controls,
three material planes, rating skins and analysis resources in each existing art family. Keep
readable local foregrounds when carrying guidance between light and dark themes, including
the preview's supporting labels. Validate resource-backed centres as well as background images:
a nine-slice `fill` can supply the entire designed surface without a separate material layer.

## Charts and pitches

Use a theme's primary colour for the main data series, latest or selected datum and player
markers. Keep axes, contextual bands and field markings recessive. Preserve semantic colour
scales such as a continuous cold-to-hot heat map rather than recolouring every fact as an action.
Texture belongs in reusable paper and marker resources; numeric data and geometrical markings
remain live SVG or canvas.

Use the same physical coordinate ratio in the field viewBox and its displayed box when drawing
a proportional formation pitch. A width with an independent height cap distorts the field.
Centre circles use one radius, including where an established analysis projection is retained.
Small circular player marks should show a position and short name, with full facts reachable
outside the field. Check all formations at the narrowest supported size for label collisions.
The current source art and interaction choices are in [analysis-print](analysis-print/README.md).

## Applying the system throughout the app

See the [UI coverage inventory](UI-COVERAGE.md) for the module and preview audit. Reuse the
existing semantic control, tab, table and panel assembly. `data-surface="sheet"` is a skin-only
quiet group; `data-surface="inset"` is a secondary inset; neither adds padding. Use
`data-ui="disclosure"` for a collapsible group, retaining its existing summary/body layout.
Do not apply a padded panel role to every list item, pitch marker or inner wrapper. Components
own spacing once, while the shared skin owns materials, edges and states.

When a component needs a larger panel inset, its local `--surface-panel-padding` supplies that
same element's padding to the shared panel skin. The facility-parts component uses this to keep
its minimum content clearance without another wrapper or a selector-specific padding override.

When a resource disappears, inspect both the semantic role and computed styles: a module's
background shorthand can override a lower-specificity shared rule. Review native controls,
selected states, popovers and lazy sections, not only the default screenshot. Layout-only
wrappers, live graph facts and text links do not each need a decorative card.
