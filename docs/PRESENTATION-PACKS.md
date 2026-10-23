# Presentation packs

The application discovers presentation choices from JSON served with the static deployment.
The current product inventory is one locale, `ko-KR` (한국어), and four registered themes:
`matchday-print` (기본 · 매치데이 인쇄), the default, `standard` (스타디움 그린), `pixel` (픽셀아트),
and `sticker-club` (스티커 풋볼클럽). Existing valid browser
preferences remain selected. The standard theme uses self-hosted Pretendard and a deep
stadium-green palette: subdued page/navigation backgrounds, quieter content surfaces and stronger
green controls/selection. A fine static monochrome grain tile paints page and UI backgrounds;
it does not filter text/art, add an overlay layer or change layout. The active standard stylesheet
supplies optional `--surface-grain`, which shared background declarations compose with semantic
fill colours. Other themes fall back to `none`; the texture is not inherited from default JSON
tokens. One 160×160 grayscale/alpha PNG is reused instead of live turbulence filters or animated
noise. Retain page-only grain if surface texturing materially worsens rendering performance.
Surface luminance and saturation provide hierarchy. Decorative outlines are transparent; table
rows, selected navigation and keyboard focus remain clear.
Standard corners are semantic: controls 8px, panels 12px, badges 4px and dialogs 18px;
the home scene clips to the panel radius. Pixel retains its original angular values.
Edge-aligned mobile sheets and underlined bottom navigation use square corners.
Floating feedback uses optional `--feedback-shadow-filter` on its scrolling container and
`--feedback-edge-shadow` inside its existing surfaces. Standard supplies a soft drop shadow
and fine inset edge; neutral per-pack defaults keep pixel flat. Applying the filter outside
the scroll clip preserves the shadow without changing feedback dimensions or action reachability.
Secondary controls consume `--control-fill` and `--control-weight`. Floating mobile navigation
uses `--nav-surface`, `--nav-edge`, `--nav-shadow` and `--nav-radius`, keeping a separate dark
surface and persistent selected underline. Popovers use `--popover-edge` and `--popover-shadow`.
Neutral defaults preserve flat pixel effects and angular radii; shared layouts do not branch on theme IDs.
The viewport shell reserves `--mobile-nav-clearance` so scrolling content and sticky draft actions
end above the floating navigation, including its safe-area inset.
Shared optional `table-line`, `section-accent-line`, `warning-line`, `critical-line`, `running-line` and `secondary-control-line` tokens
fall back to existing styling in shared CSS; the pixel pack explicitly supplies its original
values so the registered default's optional tokens cannot replace them.

The standard pack uses official Lucide SVG icons, including independent trophy states, and 92
painted sports-comic facility illustrations. The selected art direction combines expressive brush
inking, layered gouache colour, warm natural light and tactile material detail. Each completed
stadium/locker, training and academy stage in each era has distinct generated artwork; manager
and staff offices use separate period-neutral interiors. Images remain in the existing 3:1 HTML
slots, with 1440×480 self-hosted WebP resources and automatic image rendering. The live pitch and
club identity retain their existing game-driven rendering.

`node scripts/generate-standard-icons.mjs` imports icon resources from the pinned `lucide-static`
development dependency. Original upstream paths and 2px round strokes are preserved; circles and
rounded rectangles are converted mechanically to equivalent paths. `--check` verifies the generated
pack and shipped `presentation/themes/Lucide-LICENSE.txt` against that distribution. The browser
loads the generated pack, without importing the icon library into application JavaScript.
Facility artwork is
created with the built-in image generation tool; `scripts/prepare-standard-art.mjs` validates and
encodes original generated sources for deployment. Prompts, source provenance and checksums live
in `apps/web/public/art/standard/generation.json`. Reviewed candidates and retired vector scenes
are removed after the selected production set is integrated.
These are the current contents, not a permanent limit or a supported-ID list in application code.

The print and sticker concepts replace complete resource sets rather than only accent colours.
Both retain licensed Pretendard for body, display and score roles and the common responsive layouts.
The print pack's imported shell/home and UI stylesheets reuse fixed-corner image frames, independently
tiled paper/ink/red materials and stamped pictograms across all screens. Generic `data-surface="panel"`
and `data-ui` roles mark reusable panels, primary actions, inline links, icon controls, dialogs, the
game shell and its sidebar; these attributes contain no theme IDs and do not affect alternative packs. Live text,
tables, inputs and engine-owned diagrams retain their HTML and game behavior. Shell-only artwork
targets the shell sidebar explicitly; it never matches event/feedback `aside` elements. Dialog
headers, bodies, action footers and popup lists keep independent scrolling and hit targets. Home-only
scrolling is scoped to the active home, while the shell and materials apply before founding too.
Raw artwork, exact prompts and actual captures live in `apps/web/design/home-print`; deployed
resources and provenance live in `apps/web/public/art/matchday-print/home`.
Small inset tiles, sticky toolbars and count/status badges use the same material inventory. Table
headers and pinned cells paint their own opaque ink/paper tiles so horizontal scrolling preserves
the print treatment and text contrast. Shared selected controls allow pack styles to supply their
frames instead of forcing a plain fill. Review galleries use WebP; the capture scripts regenerate
both galleries without adding raw PNG captures to the repository. WebKit retains PNG captures
locally when its canvas cannot encode WebP; its verification report is versioned beside the main
captures.
With the dev server on port 19501, run `node scripts/capture-print-home.mjs` first to prepare an
isolated review career, then `node scripts/capture-print-screens.mjs` for the complete gallery.
Prefix the latter with `PRINT_CAPTURE_BROWSER=webkit` for WebKit verification. `PRINT_HOME_ORIGIN`
can select another dev origin; these browser profiles never use the owner's browser save.
Matchday-print combines warm newsprint, charcoal and vermilion with woodcut/halftone facility scenes,
solid stamped pictograms and printed-ticket edges. Sticker-club combines flat cartoon facility scenes,
colourful filled pictograms with a cream die-cut outline, compact rounded badges and restrained offset
shadows. Each has 92 independently generated facility illustrations, including all completed stages in
all three eras and separate period-neutral manager/staff offices. Each replaces all 36 semantic icon
roles and supplies distinct earned/unearned trophy states. Club identities and the engine-owned pitch
retain their game facts. Background texture never filters HTML type.

`node scripts/generate-concept-themes.mjs` regenerates both JSON packs and their registry entries from original pictogram
geometry and token definitions; `--check` verifies them without writing. The generic `scripts/prepare-concept-art.mjs` plans and encodes their
built-in-image-tool sources; each deployed art directory contains `generation.json` with prompts,
source provenance and encoded checksums. The home caption's optional `scene-caption-surface`,
`scene-caption-text` and `scene-caption-icon` roles keep light concepts readable over art. CSS fallbacks
preserve the existing standard/pixel captions. Optional `team-state-fill` and `fixture-control-fill/text/edge`
roles keep light status cards and preparation actions readable. The standard and concept preparation
commands share `scripts/art-resources.mjs` for 3:1 validation and 1440×480 WebP encoding.
Inset rows, selected training focus, relegation badges and chart series also have optional semantic
fills/colours. New light packs supply these roles; literal CSS fallbacks preserve the existing dark packs.

`pnpm run validate:presentation` reports the actual deployed-source registry inventory and checks
every registered resource before the build/deployment gates. Local `pnpm run verify` and the CI
`checks` job both include that command.

## Registries and loading

The only discovery endpoints are:

- `apps/web/public/presentation/locales/index.json`
- `apps/web/public/presentation/themes/index.json`

Both use `{ "schemaVersion": 1, "defaultId": "<entry ID>", "entries": [...] }`.
Each entry has `id`, `label` and a relative `resource` URL. Locale entries also require
`direction: "ltr" | "rtl"`. A locale's ID is a valid Intl locale identifier, its label is its
self-name and its direction comes from the registry. Theme IDs are stable resource identifiers.
Defaults must belong to their registry, IDs must be unique, and registry/pack IDs must agree.

For example, a generic locale entry is
`{ "id": "fr-FR", "label": "Français", "direction": "ltr", "resource": "fr-FR.json" }`.
This example is not a shipped language catalog. The browser builds its settings options from the
returned registry entries, then fetches only the selected locale/theme packs and needed assets.
There is no runtime directory listing or executable pack module.

Registry resources resolve relative to the registry JSON URL; asset references resolve relative
to their declaring pack URL. Pack asset references can also begin at the deployment root.
Shared URL validation keeps references local and same-origin. Use these helpers instead of
joining paths or introducing another loader: `resolveRegistryUrl`, `resolvePackUrl` and
`resolveResourceUrl` in `apps/web/src/presentation/registry.ts`.

## Locale packs

The baseline resource is `apps/web/public/presentation/locales/ko-KR.json`:

```json
{
  "schemaVersion": 1,
  "id": "<registry locale ID>",
  "messages": {
    "shell.greeting": "Hello {name}",
    "shell.items": {
      "plural": "count",
      "forms": { "one": "{count} item", "other": "{count} items" }
    }
  }
}
```

Message IDs describe meaning rather than a particular language. Templates contain named
`{parameter}` placeholders and return plain text; React performs text escaping. Parameters are
strings or numbers. Substitution runs once, so inserted braces, markup and replacement tokens
remain literal data. Plural messages require `other`; optional forms are `zero`, `one`, `two`,
`few` and `many`, selected with the message pack's `Intl.PluralRules`. A missing translation uses
the default pack's grammar; messages present in the selected pack use that pack's locale.
The plural selector must
be a finite numeric parameter, even when its selected form does not print it. Other named
parameters must agree between forms.

The default pack is the message/parameter contract. Additional packs may omit optional messages;
those resolve to the registered default. Present keys must exist in that default and retain its
parameter set and plural-selector contract. Unknown keys and missing parameters produce readable
fallbacks with development diagnostics instead of stopping the game. Add a new semantic message
to the default resource when application behavior needs it, not to a per-language TypeScript list.

`createTranslator`, `createLocaleFormatters` and `createLoadedLocale` in
`apps/web/src/presentation/locale.ts` provide the shared services. Display counts retain the
existing `Math.round` behavior; game-calendar dates use UTC and the Gregorian calendar.
Locale formatting never changes exact money arithmetic, historical units, K/M/B thresholds,
toward-zero truncation or precision policy. The owning money/season helpers retain those rules.

## Theme packs

### Styling flow

`theme JSON → themeTokens.ts → ThemeResolver → root installation → CSS Modules`

`apps/web/src/presentation/themeTokens.ts` owns optional role defaults and namespace flattening.
The selected pack supplies values; common role defaults are resolved for each pack before any
registered-default fallback, so standard-only badge, scene and state styling cannot leak into
pixel or a resource-only third theme. Typography aliases still come from the font resolver.
Existing optional roles retain their registered-default fallback contract.
Browser installation stays in `adapters/themeResources.ts` and commits prepared resources and
`:root` variables in one synchronous transaction. The committed controller snapshot also sets
`html[data-theme]` for inspection.

`apps/web/src/presentation/theme.css` owns shared page texture and font treatment; optional pack
CSS only supplies concept-specific resources such as the grain URL. Existing CSS Modules own
layout and consume semantic roles, rather than reading theme identity:

```css
.control {
  border-radius: var(--control-radius);
  background: var(--surface-grain, none) var(--surface-2);
}
```

Use `--card-radius`, `--badge-radius`, `--dialog-radius` and `--scene-radius` for their respective
roles. Shared controls read `--control-hover-filter` and `--control-active-filter`; shape/state
values belong in the pack, not component literals. Preserve circular club/ball geometry and
physical pitch markers. A class-composition helper may combine UI states, but must not take a
theme ID or duplicate visual decisions. Adding a theme still requires resources/registry only.

This follows the shared design-token and root-selection principles documented in
[Tailwind theme variables](https://tailwindcss.com/docs/theme) and
[root theme attributes](https://tailwindcss.com/docs/dark-mode#using-a-data-attribute), using
the existing CSS Modules stack. It does not introduce Tailwind utilities or a build plugin.

### Resource contract

The baseline is `apps/web/public/presentation/themes/pixel.json` with optional `pixel.css`.
The exact shared schema and required semantic roles live in
`apps/web/src/presentation/contracts.ts`; use that source and the validator rather than copying
a second schema into tooling. A theme contains:

- `schemaVersion: 1`, matching `id`, and optional `colorScheme` (`dark`, `light`, `normal`).
- `tokens.palette`, `tokens.surfaces`, `tokens.typography` and `tokens.shape`: semantic CSS values.
  They cover background/text/status/accent colors, surfaces/dividers, font stacks, sizes and
  component radii/shadows. Required token roles come from `THEME_TOKEN_KEYS`; additional tokens
  can support shared styles. Typography aliases such as `var(--display)` are resolved centrally.
- `tokens.imageTreatment`: `objectFit`, `objectPosition`, `imageRendering`, `filter` and `overlay`.
- `fonts`: local URL faces with `family`, `resource`, `weight` and optional `format`, `style`,
  `display` and ordered `fallbacks`. Each fallback has `resource` and optional `format`, referring
  to another format of the same face, with the same glyphs, metrics, style and weight. Each
  body/display/score primary family must match a declared face. Family names are
  arbitrary; do not add a family-name switch. Stable installed aliases keep cached Canvas text
  stacks usable across concept changes. Cyclic aliases and undeclared primary faces fail validation.
- `images.facility`: a local `pattern` containing `{era}`, `{kind}`, `{stage}`, plus optional
  `overrides` keyed as `era.kind.stage`. Current roles are stadium, locker, training, manager,
  staff and academy, across heritage, terraces and contemporary eras.
  `facilityStageTop` and `facilityStage` share one semantic-to-engine part map. Stadium/locker,
  training and academy use the owning `partTop`/`partLevel` rules, including completed academy
  levels 0–5; pending construction never selects its target image. Manager/staff offices use
  stage 0 and explicit shared-era overrides. All pixel-pack environments use native 240×80
  artwork so the existing pixelated treatment keeps a consistent coarse logical grid.
- `icons`: semantic roles from `THEME_ICON_ROLES`. Each has a `default` and optional named
  `variants`. Resources are SVG paths (`viewBox`, `layers`, optional `shapeRendering`) or local
  images (`resource`, optional dimensions). A missing variant uses that same role's default.
  Path layers support `fill`, `fillRule`, `opacity` and optional `stroke`, `strokeWidth`,
  `strokeLinecap` and `strokeLinejoin`. Filled pixel paths and outlined standard paths share
  the same renderer; omitted stroke attributes retain their existing SVG defaults.
- An optional local `stylesheet`, staged before activation alongside font resources.

Each pack supplies its required tokens. Optional token values fall back by semantic key to the
theme declared as the registry default, with the selected theme's values taking precedence.
This is data composition, not a pixel-specific map. Only the selected theme's fonts, stylesheet,
images and icons are installed/resolved; optional-token fallback does not inherit another
theme's asset ownership or turn a missing required role into a valid pack.

`createThemeResolver` and `validateThemeTypography` in `apps/web/src/presentation/theme.ts`
own token/font/image/icon resolution. Structural shape checks come from `validateThemePack`;
the resolver and `validateThemeTypography` apply semantic requirements, including declared
primary font faces.

`getFontSources`, `resolveFontResource` and `fontSourceCss` in
`apps/web/src/presentation/fonts.ts` share the primary-then-fallback order, relative URL resolution
and source encoding. The browser tries each source with a separate detached `FontFace`, stopping
at the first successful load. It does not select formats by browser or font family. Separate
sequential attempts avoid WebKit stalling on a native combined source list after a failed WOFF2
decode. A face is required: if every source fails, preparation fails and preserves the prior theme.

`prepareThemeResources(theme, { ports?, requiredImages? })` asynchronously stages fonts, CSS,
pack-declared image icons and currently needed facility images without activating the candidate.
It returns a prepared handle with `theme`, synchronous `commit({ previous?, isCurrent? })` and
`dispose()`. Preparation failure cleans up successfully staged candidate resources and rejects.

The browser controller awaits preparation, then checks the latest request and current semantic
image needs. It disposes a stale candidate. A current request calls `commit` synchronously and
confirms locale/document metadata, preference IDs, installed ownership and the published snapshot
in the same uninterrupted call stack. There must be no `await` between the final freshness check,
commit and publication, and no post-commit stale return that leaves an activated theme outside
the controller's published state. Awaiting an already installed theme and then separately
checking or publishing controller state is not a valid selection transaction.

The prepared handle owns the inactive candidate resources until commit or disposal. A successful
commit transfers ownership to `InstalledTheme` and releases the previous installed resources.
`prepared.dispose()` then becomes a no-op; the active installed handle owns cleanup until a
later successful replacement or controller disposal. A stale commit returns `null`, disposes its
staging and preserves the previous theme. Commit activation failure also cleans the candidate
while preserving the previous theme. Disposal is idempotent. Commit is single-use: committing
an already committed, disposed or stale handle throws `ThemeInstallationError` without releasing
an already active installed handle.

`installThemeResources` remains a convenience wrapper around preparation and synchronous commit
for standalone callers such as the Node validator. The validator reuses these functions with
filesystem ports to check declared files, every required era/kind/stage image, fonts, stylesheets
and image icons, including optional variants/overrides. It validates file presence and contracts;
browsers still verify actual decoding, font loading, layout and resource installation.
Every declared primary and fallback font file must exist, even when a browser can load an earlier
source. A missing fallback therefore fails `pnpm run validate:presentation` before deployment.

Browser adapters collect mounted semantic image needs and resolve them against the candidate
theme with `collectThemeImageResources`. A font, stylesheet, pack-declared image icon or mounted
scene failure discards the candidate, keeps the last usable theme and offers retry. This does
not preload all era/stage scenes: only pack-declared image icons and current mounted scene needs
are staged at runtime; unmounted facility scenes retain their normal lazy loading. The CLI
independently checks coverage for every declared stage before deployment without downloading or
decoding those images in a browser.

The selected theme supplies image treatment and paths, while common game-year/completed-stage
logic chooses the scene. Facility alt text combines the locale's era/description with the theme
registry label, currently 픽셀아트. Semantic status
meanings, accessibility, contrast, reduced motion and supported bounds must remain usable.
Themes do not replace live-pitch trajectories, playback timing, recorded shirts/crests or rules.

## Theme transitions

`createBrowserThemeTransition` captures one composited root snapshot pair and reveals the new
presentation from top to bottom over 620 ms. Individual controls never receive snapshot names:
that would extract their pixels into transition-layer siblings, bypassing ancestor clipping and
raising buttons over the dialog/backdrop captured by the root. A root pair retains the page's
actual visual stacking. See the [View Transition painting model](https://www.w3.org/TR/css-view-transitions-1/#view-transition-painting-order).
The optional `theme-reveal-timing` shape token gives pixel a stepped cadence and smooth packs a
continuous easing. Previous fonts/icons remain in the old snapshot while resource installation
and controller publication happen together in a guarded callback. Presentation becomes usable
without waiting for the visual animation to finish.

Initial boot, locale-only/same-theme selections, hidden pages, reduced motion and unsupported
browsers update immediately. New selections cancel earlier visuals; stale update callbacks cannot
install resources or persist preferences. Temporary transition styles are removed on finish or cancellation.
A snapshot failure still applies the valid selection. Game workers and checkpoint storage do not
participate. View Transitions are a progressive enhancement, not a requirement for theme availability.

## Add a pack

1. Start from the shared contract or an existing pack, choose a stable new ID and author its JSON.
   Keep optional translations consistent with the registered default; supply every required theme
   role, completed-stage image and declared font/icon/stylesheet resource.
2. Add its entry to the corresponding registry. A locale requires its self-name and direction.
   A locale addition changes two configuration files: registry plus pack. A theme changes two,
   or three when an optional stylesheet is needed. Image/font binaries are outside this count.
3. Run `pnpm run validate:presentation`, focused unit checks and the production build. Check
   the browser at supported sizes, including keyboard/touch controls and a failed resource retry.
   Task work leaves browser-spec execution to the pre-push batch and CI under ARCH-30.
4. Deploy the registry, JSON and referenced assets together with the unchanged application build.
   No per-pack TSX component, supported-ID union, switch, provider or feature import list is added.

To add a font format alternative, keep the preferred `resource` and `format`, then append
`{ "resource": "./fonts/equivalent.woff", "format": "woff" }` to that face's `fallbacks` in order
of preference. Deploy the licensed equivalent-face file and update its provenance/license notice.
Check that conversion preserves glyph order, character mapping, metrics and outlines; a fallback
is another encoding of the same font rather than a substitute typeface. The current pixel pack
prefers its original WOFF2 files and supplies WOFF alternatives. Run the validator with every
declared source present and verify supported browsers; no loader or application code changes are
needed when another pack uses the same contract.

The existing static Netlify deployment and cache rules remain in force. Registries and pack JSON
are requested with `cache: "no-cache"`; successful loads are cached within the current resource
adapter. A fresh registry load discovers a data-only addition. Asset bytes still need deployment;
editing a registry alone cannot make a missing resource available. An unavailable saved selection
falls back to the registered default. A failed change retains the last usable selection; a failed
initial load offers retry. Stale completion cannot replace a newer selection.

Language/theme preferences use the small browser record `haeram-soccor:presentation`, independently
of checkpoints, slot ownership and worker commands. Denied storage keeps session selection usable.
Changing presentation preserves game facts, navigation, pending drafts, progression/playback and
stored prose. The initial namespaces cover shared shell/navigation/settings and facility image
descriptions; full extraction of remaining feature/engine source copy, production translations,
new artwork and retrospective translation are separate work. Saved titles, details and names
stay ordinary data; there is no translation-key migration or save-format change.

## Extension evidence

`tests/fixtures/presentation.ts` supplies private-use synthetic locale/theme resources only to
temporary validation trees and Playwright route responses. `tests/e2e/presentation-settings.spec.ts`
injects registries and packs unknown to the built app, checks actual resource requests and use,
and exercises preferences, retry and preserved game/draft/prose state. These fixtures are not
registered in `apps/web/public`, deployed, or imported by an application entry.
