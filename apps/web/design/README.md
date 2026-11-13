# Design resource ownership

Shared components, locale copy, theme mappings, editable artwork and deployed resources have
different owners. Read [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) and [RESOURCE-SKINS.md](RESOURCE-SKINS.md).

| Layer              | Location                                                       | Responsibility                                                    |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Shared UI          | FSD layers `src/app/` … `src/shared/` and `src/design-system/` | Semantic state, live content, layout and component previews       |
| Locale packs       | `public/presentation/locales/<locale>.json`                    | User-visible messages, independent of artwork and theme           |
| Theme packs        | `public/presentation/themes/<theme>.json`                      | Semantic role aliases, local ink, image paths and native metadata |
| Theme source art   | `design/<theme-id>/<resource-group>/`                          | Editable originals, exact prompts, generation recipes and notes   |
| Deployed theme art | `public/art/<theme-id>/<resource-group>/`                      | Compact production assets and generation manifests                |

The paths above are relative to `apps/web/`. `HomeAwayBadge` is a shared component: it selects
`fixture.home` or `fixture.away` from the current locale and its theme supplies the visual skin.
Its print artwork is owned by [matchday-print](matchday-print/README.md). No print-specific
file path or Korean label belongs in that component.

## Existing source locations

The source tree is still partly legacy. `home-print`, `controls-print`, `hierarchy-print`,
`analysis-print`, `surfaces-print` and `rating-print` belong to Matchday Print despite being
top-level folders. `standard-ui`, `pixel-ui` and `sticker-club` retain their earlier source
layouts; `page-refresh-v1` records a genuine multi-theme iteration. Their current paths remain
the regeneration inputs until each family and its references are migrated together.

New theme-owned artwork uses the theme-first source path above. Runtime resources already
use theme-owned directories; this does not imply that every legacy source directory has
been migrated. Shared preparation code remains in `scripts/`.

[Staff role badges](staff-role-badges/README.md) are shared native SVG resources with a stable
job palette across themes. Their editable source and build recipe live together; deployed
skins are in `public/art/shared/staff-role-badges-v1/` and registered by every theme pack.

## Localization status

The project has a working locale registry, message packs, fallback and formatting services.
Every shipped pack translates every default-pack message ID with its parameters (WEB-90,
ARCH-32); `pnpm run validate:i18n` and ESLint reject hardcoded Korean literals, missing keys,
incomplete packs and mismatched parameters. Saved prose remains unchanged; recognized source
labels and generated prose are translated at display boundaries.

Authored copy, including reusable UI labels such as the home/away badges, is a message ID in
`packages/contracts/src/source-messages.ts` with the same ID and parameters in every registered
pack. New copy resolves it with `displayMessage`, `localizeValue`, `richMessage` or
`LocalizedMessage` as the [repository guidance](../../../AGENTS.md) describes. Keep this copy outside theme JSON
and bitmap art.
