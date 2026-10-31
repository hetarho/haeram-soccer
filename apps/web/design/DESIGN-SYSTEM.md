# Shared design system and theme authoring

This is the reusable guide for building themes while reviewing real components at
`http://localhost:19500/design-system`. It applies to the shared interface and later native-app
adaptations. Theme-specific appearance belongs in each theme's source notes and portable pack.

Product decisions remain authoritative in [WEB-91, WEB-103 and WEB-104](../../../spec/ssot/WEB.md).
[ARCH-32](../../../spec/ssot/ARCH.md) owns the architecture. The
[resource-skin contract](RESOURCE-SKINS.md) explains media metadata, native adaptation and budgets;
this guide does not redefine those contracts.

## Workbench and preview styling

The workbench's navigation, search, theme selector and inspection controls have a fixed appearance,
independent of the theme under review. Its document loads the validated theme registry only;
game styles, fonts and artwork are installed by the shared presentation bootstrap inside preview
documents, including independent preview windows. Preserve this document boundary instead of
adding selector overrides to fight game skins in the surrounding workbench.

Keep home summary slots concise enough to survive a phone width: the cup slot shows the live
count, while the overview uses actual Card components for competition status and entry actions.
Adjacent slots share one continuous material plane and have square internal joins. Team sheets
reuse sheet/detail materials for identity, facts and results; outcome marks occupy centred fixed
columns and scores align at the trailing edge. Metric navigation uses the shared keyboard TabList.
Menu actions use the same tertiary resources as other supporting actions. The transport combines
its mode label and change action in one MODE button beside approval settings.
Menu labels, supporting copy and trailing icons inherit the action's local foreground roles;
the page's muted ink may not contrast with a filled tertiary skin.

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

In candidate lists, a player's name opens their record with the `link` role; it must not inherit
the generic framed-button skin. Keep comparison toggles equally quiet and render their checked
state with the theme's checkbox artwork. Explicit table columns reserve room for identity,
ratings and money instead of inheriting the shared leading rank column's narrow width.
Candidate details follow the report pattern below; comparison actions keep the plain button
skin, the loan action takes the secondary role and the bid or signing the primary role.

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

### Detail pages read as reports

A detail page serves one decision. The recruitment candidate detail (WEB-109, CLUB-47) is the
reference; apply the same order to other person, offer and facility details.

1. **Conclusion first.** Under the identity head, one framed verdict plate gives the answer: a
   grade or headline value, one line with the numbers behind it, and at most two facts for and
   two against. Reasons add what the headline does not already say.
2. **Sections in question order.** Who it is → what it does for us → what it costs → everything
   else. Each section heading carries its answer on the same line, so a closed section still
   reads; the sections the decision needs start open, reference material starts closed.
3. **One disclosure level.** A section opens or closes; nothing inside it opens again. Do not
   nest a full profile card, with its own head, inside a detail.
4. **Each fact in one place.** A heading's answer summarizes only its own section. A rating chip,
   trait list or personality read appears once.
5. **Size marks importance.** The verdict plate is the only framed plate; sections are separated
   by quiet rules, with muted labels and one bold value per fact.
6. **Actions dock at the foot.** The transaction bar stays at the dialog's bottom edge while the
   detail scrolls and covers the body's bottom padding. Notes use the note tone; the warning
   tone marks only what blocks an action. The dialog's close icon is its only close control.
7. **Money in weeks or months.** Runway reads through `runwayText`, never in rounds.

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

`ticket` and `dark` wear the home's next-match and season plates. A screen built like the
next-match report leads with one `ticket` (the memo, or the owner office's pending-work tray) and
keeps `dark` for a single summary band; the remaining records use `detail`.

Owner-office rooms ([OfficeDesk](../src/ui/OfficeDesk.tsx)) show their facility artwork with
only the room's name and pending count on it. Figures (`stat-tile`, one row of four on every
width), actions and the tray sit outside the artwork so it is never covered (→WEB-39).

Spend colour on meaning, not decoration. A change reads by sign: a rise in `--danger` red, a fall
in `--cool` blue (`+3`, `-3`). Closing and comparing controls stay plain buttons; the primary
colour marks the one main action. A detail that already fills its dialog needs no plate of its
own: drop the outer card and keep its grouped facts on light `detail` cards. Labels such as
이적료 or 성향 리포트 stay small but bold; the values they name are larger and heavier.
[PlayerCompare](../src/ui/PlayerCompare.tsx) sets two players side by side on every width, the
better value marked by weight.

On phones every [Dialog](../src/ui/Dialog.tsx) opens as a bottom sheet with a grab handle and the
dimmed page visible above it; `picker` is the only centered exception, kept for the small theme
and language pickers (→WEB-106).

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

Compact dropdowns inside the transport retain the shared select artwork and local field ink.
Limit transport overrides to geometry and type sizing: resetting `border-image` or inheriting
the transport's foreground discards the resource or makes dark-theme field values unreadable.

Dropdown focus rings follow `:focus-visible`. Opening a list with a pointer does not force a
focus ring; keyboard navigation retains its visible focus cue alongside the existing artwork.

Dropdowns use separate trigger, popup and selected-row plates; an input's inset frame is too
heavy around a floating list. Render each authored centre with nine-slice fill and keep live
labels, chevrons and checks outside the bitmap. Use the shared Select typography tokens rather
than inheriting a nearby heading's size or weight. The working compact treatment uses a 36px
desktop trigger, 44px closed-control touch targets, compact 32px desktop/36px mobile option rows,
and no extra margins between options; hinted options grow naturally. Border and padding share
one 6px popup inset per side. Long lists scroll within their 280px limit. See the [dropdown resource family](dropdown-v1/README.md)
for sources, exact prompts, geometry and theme-specific colours.

Product screens reuse that Select treatment for settings, season/history scopes, competition
filters, tactics, analysis, recruitment and transport pace. Screen styles may set its width,
flex behavior and placement, but do not replace its resource frame, typography or height with
local field rules. There are no separate unframed season or presentation-choice skins.

A control that becomes unavailable only briefly while it may hold keyboard focus, such as the
goal-scene replay shortcut and its picker's goals during a goal's hold, uses `aria-disabled`
with a guarded handler rather than native `disabled`, which would drop focus out of a dialog.
Give it the theme's disabled filter variables so it reads as unavailable without fading copy.

## Portable resource handoff

Keep shared components, locale copy and theme ownership distinct. New theme-only originals
live in `design/<theme-id>/<resource-group>/`; compact output lives in
`public/art/<theme-id>/<resource-group>/`. The theme JSON maps those assets to shared semantic
roles. See the [ownership inventory](README.md) for legacy directories still awaiting migration.
Reusable UI labels use `useLocale().t(...)`, with keys in every registered locale pack, rather
than Korean literals in components or copy embedded in a theme image. Existing feature copy
is still only partially localized under WEB-90; this guidance does not claim it is complete.

Home/away badges are informational resources, separate from action emphasis and result status.
The shared `HomeAwayBadge` keeps home/away labels live, and `match-{home,away}-badge-{frame,slice,fill,text}`
selects each theme's full-surface artwork and readable ink. Preview both variants together in
the `badges` story. Explicit aliases let another family reuse its own compatible skins without
inheriting the default theme's artwork. The print sources are in [Matchday Print home/away badges](matchday-print/home-away-badges/README.md).

Review fine rules at the badge's actual size: a large source cap drawn only a few CSS pixels
wide can reduce its keyline below a visible pixel. `match-badge-frame-width` controls the displayed
art frame independently of its native source caps. Keep fallback fills inside the content
box when the silhouette has transparent corners.

Match outcomes use the shared `ResultBadge`, with compact and score-bearing variants in the
`badges` story. Give win, draw and loss explicit `result-{win,draw,loss}-badge-{frame,slice,fill,text}`
roles instead of plain bordered boxes. Keep these meanings separate from venue, action and
rating roles. Outcome labels and accessible names belong in locale packs; keep scores live
and preserve their team order in right-to-left layouts. The current print artwork and exact
regeneration prompts are in [Matchday Print result badges](matchday-print/result-badges/README.md).

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

Compact identity marks can reuse `data-ui="badge" data-compact`. Keep their primary material
and `image-on-primary` foreground paired through the shared skin; a readable chart-ink accent
is not necessarily a safe filled surface behind the old `on-accent` text.

`chart-primary` supplies a readable series/analysis ink independently of the existing
`accent`/`on-accent` fill pair; themes without it retain their normal accent. Changing a plot's
ink must not recolour legacy filled labels or controls that use that pair.

When a resource disappears, inspect both the semantic role and computed styles: a module's
background shorthand can override a lower-specificity shared rule. Review native controls,
selected states, popovers and lazy sections, not only the default screenshot. Layout-only
wrappers, live graph facts and text links do not each need a decorative card.

The [current page-refresh family](page-refresh-v1/README.md) records the bronze-to-ruby scale,
European cartoon icon atlas, smooth yellow clay stickers and theme-specific controllers.
Preserve grass, clay and native pixel materials instead of sharing an unrelated cloth texture.
Full-colour illustrated icons render their colours rather than a monochrome mask. Material
changes must cover the main page planes and controls together, with matching text contrast.
