# Presentation packs

The application discovers presentation choices from JSON served with the static deployment.
The current product inventory is one locale, `ko-KR` (한국어), and one theme, `pixel` (픽셀아트).
These are the current contents, not a permanent limit or a supported-ID list in application code.
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
  `display`. Each body/display/score primary family must match a declared face. Family names are
  arbitrary; do not add a family-name switch. Stable installed aliases keep cached Canvas text
  stacks usable across concept changes. Cyclic aliases and undeclared primary faces fail validation.
- `images.facility`: a local `pattern` containing `{era}`, `{kind}`, `{stage}`, plus optional
  `overrides` keyed as `era.kind.stage`. Current roles are stadium, locker and training, across
  heritage, terraces and contemporary eras. Coverage follows completed facility stages from the
  engine's owning `partTop` helper. Pending construction targets never select artwork.
- `icons`: semantic roles from `THEME_ICON_ROLES`. Each has a `default` and optional named
  `variants`. Resources are SVG paths (`viewBox`, `layers`, optional `shapeRendering`) or local
  images (`resource`, optional dimensions). A missing variant uses that same role's default.
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

Browser adapters collect mounted semantic image needs and resolve them against the candidate
theme with `collectThemeImageResources`. A font, stylesheet, pack-declared image icon or mounted
scene failure discards the candidate, keeps the last usable theme and offers retry. This does
not preload all era/stage scenes: only pack-declared image icons and current mounted scene needs
are staged at runtime; unmounted facility scenes retain their normal lazy loading. The CLI
independently checks coverage for every declared stage before deployment without downloading or
decoding those images in a browser.

The selected theme supplies image treatment and paths, while common game-year/completed-stage
logic chooses the scene. Facility alt text combines the locale's era/description with the theme
registry label; the baseline therefore keeps the current Korean `픽셀아트` wording. Semantic status
meanings, accessibility, contrast, reduced motion and supported bounds must remain usable.
Themes do not replace live-pitch trajectories, playback timing, recorded shirts/crests or rules.

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
