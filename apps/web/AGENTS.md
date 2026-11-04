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

# Source layers (feature-sliced, migrating)

`src/` is moving from the flat `ui/` folder into feature-sliced layers, lowest first. ESLint
(`eslint.config.mjs`) enforces the direction; the UI engine-import guard covers every layer.

| Layer       | Holds                                         | Today                                                                  |
| ----------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `shared/`   | game-free helpers and styles                  | `lib` (`useRead` for worker reads), `ui/TextLink.module.css`           |
| `entities/` | one domain noun: its link, store, small views | `club` (`ClubLink`, `openClub`), `player` (`PlayerLink`, `openPlayer`) |
| `features/` | one user action                               | —                                                                      |
| `widgets/`  | a composed block used on many screens         | `club-detail`, `player-detail`                                         |
| `pages/`    | a routed screen                               | — (screens are still in `ui/`)                                         |
| `ui/`       | legacy screens and helpers, above every layer | everything not yet moved                                               |

- A layer imports only layers below it; `ui/` may import any layer. Slices of one layer never
  import each other.
- Outside a slice, import its `index.ts` only. Each index opens with what the slice is for and
  what it exports, so read the index before the files.
- To show any club or player, use `ClubLink` / `PlayerLink` (or `openClub` / `openPlayer`). One
  host per widget, mounted in `ui/App.tsx`, opens the detail; never build another club or player
  dialog. Worker data comes from `client.clubProfile` / `client.playerProfile`
  (`runtime/clubProfile.ts`), and from `client.startClubProfile` before a takeover.
- When touching a legacy file, move it into its layer if the change is about that slice anyway;
  otherwise leave it.
