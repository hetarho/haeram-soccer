# Translation is required

- All interface copy, accessibility labels, errors, commentary, explanations and generated news
  belong in message resources. This includes development screens, Canvas labels and empty states.
- Never add Korean string/template literals or JSX text to executable application/package code.
  Use `message(id, parameters)` with an entry in `packages/contracts/src/source-messages.ts` and
  the same ID and placeholders in **every** registered locale pack. Reuse an existing ID first.
  New English or other-language user-facing prose follows the same resource-only rule.
- Keep whole sentences together, including units and counts. Use `richMessage` (in a subscribed component) or `LocalizedMessage` for sentences
  containing links or emphasis, so translators can reorder their parameters. Never join translated
  sentence fragments. Use shared locale number/date formatters.
- Simulation produces locale-independent source prose. Translate at display boundaries with
  `localizeValue`, including text attributes and Canvas text. Components reading source labels
  subscribe with `useTextLocale`; changing language must update memoized views too. Never translate
  IDs, user-entered names, stored facts, event keys or comparison operands inside the engine.
- `pnpm run validate:i18n` and ESLint must pass. There is no baseline or per-file exemption for
  production copy. Tests and type-only literals may describe source facts; comments are not copy.
- Do not bypass these checks with lint disables, new exclusions or Korean fallback literals.
  Missing keys/translations/parameters must be fixed in resources before a change is complete.

# Design-system documentation

For visual or theme work, read [the shared design-system guide](design/DESIGN-SYSTEM.md),
[the resource-skin contract](design/RESOURCE-SKINS.md) and the target theme's source README.
Product decisions and architecture remain authoritative in `spec/ssot/WEB.md` and
`spec/ssot/ARCH.md` at the repository root.

Record reusable design lessons while implementing the relevant change. Keep cross-theme
guidance in the shared guide, and artwork inventory, regeneration details and current review
status in the theme's source notes. Update SSOT when an approved product decision changes.

Clearly distinguish approved decisions, implemented working artwork and proposed alternatives.
Do not promote an unconfirmed recommendation into a shared requirement or claim a documented
proposal is already implemented. Preserve the resource-backed design contract and native
handoff metadata when changing a control. Use the existing ARCH verification scopes.

# Source layers (feature-sliced)

`src/` follows Feature-Sliced Design (→ARCH-3/4), highest layer first. ESLint enforces the
direction with `scripts/lib/layer-rules.mjs`, which resolves every import (static, type-only,
re-export, `import()`) from the importing file's own path; the UI engine-import guard covers every
layer.

| Layer       | Holds                                                     | Slices or segments                                                                                                                                                           |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`      | the shell: root component, navigation, app-wide overlays  | `ui` (App, menu, HUD, glossary, outcome overlays), `model`, `office` (the owner-office overlay)                                                                              |
| `pages/`    | one routed screen per slice                               | `club` (Rich: team, people, operations, business, records), `journal`, `clubhouse`, `cups`, `start`, `slots`, `game-over`                                                    |
| `widgets/`  | a composed block shown on several screens                 | `club-detail`, `player-detail`, `club-overview`, `event-center`, `progress-controls`, `league-insights`, `away-summary`, `play-guide`, `presentation-settings`, `cash-alarm` |
| `features/` | one user interaction                                      | `match-viewer`, `match-prep`, `approvals`, `news-feed`, `person-career`                                                                                                      |
| `entities/` | one domain noun: its views, Canvas painting, view helpers | `club`, `player`, `league`, `match`, `office`                                                                                                                                |
| `shared/`   | game-free UI kit, shared styles, navigation state         | `ui` (controls; `styles/` for CSS modules several slices use), `lib`, `routing` (navigation and task state)                                                                  |

`runtime/`, `adapters/` and `presentation/` (locale, theme, `format`) sit below every layer and
import none of them; `lab/`, `constants/` and `design-system/` are separate tool entries that import
slices through their index. Inside a slice, components live in `ui/`, stores and hooks in `model/`,
framework-free helpers in `lib/`. A test sits beside its subject, or in the layer of the highest
module it renders.

- A layer imports only layers below it. Slices of one layer never import each other; an entity
  names another only through that entity's `@x/<consumer>.ts` file.
- Outside a slice, import its `index.ts` only. Each index opens with what the slice is for and
  what it exports, so read the index before the files; it exports exactly what is used outside.
- Layer modules are built free of import side effects (ARCH-4 r34): an index brings into a chunk
  only the modules that chunk uses. Top-level work in a layer module (a store subscription, a
  document listener) therefore runs only in a chunk that uses one of that module's exports, as
  `shared/routing/state.ts` and `shared/ui/Dialog.tsx` do; never rely on work a module does just
  by being imported. ESLint rejects a side-effect-only import (`import './x'`) inside `app`,
  `pages`, `widgets`, `features`, `entities` and `shared`, since the build would drop it. A
  dynamic `import()` names the module file, not the index, so the lazy screen keeps its own chunk.
- Move modules with `scripts/move-modules.ts`: write a `{ "from", "to" }` manifest and run
  `pnpm exec tsx scripts/move-modules.ts <manifest.json>`; it moves the files and rewrites every
  reference, so no import is edited by hand.
- To show any club or player, use `ClubLink` / `PlayerLink` (or `openClub` / `openPlayer`). One
  host per widget, mounted in `app/ui/App.tsx`, opens the detail; never build another club or
  player dialog. Worker data comes from `client.clubProfile` / `client.playerProfile`
  (`runtime/clubProfile.ts`), and from `client.startClubProfile` before a takeover.
