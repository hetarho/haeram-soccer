# Design resource ownership

Shared components, locale copy, theme mappings, editable artwork and deployed resources have
different owners. Read [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) and [RESOURCE-SKINS.md](RESOURCE-SKINS.md).

| Layer              | Location                                    | Responsibility                                                    |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| Shared UI          | `src/ui/` and `src/design-system/`          | Semantic state, live content, layout and component previews       |
| Locale packs       | `public/presentation/locales/<locale>.json` | User-visible messages, independent of artwork and theme           |
| Theme packs        | `public/presentation/themes/<theme>.json`   | Semantic role aliases, local ink, image paths and native metadata |
| Theme source art   | `design/<theme-id>/<resource-group>/`       | Editable originals, exact prompts, generation recipes and notes   |
| Deployed theme art | `public/art/<theme-id>/<resource-group>/`   | Compact production assets and generation manifests                |

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

## Localization status

The project has a working locale registry, message packs, fallback and formatting services.
Its existing translated inventory covers the shell/navigation, saves, slots, presentation
settings, facility descriptions and extracted match cues (WEB-90). Many feature screens and
engine-authored details still contain Korean; the language picker is not evidence of complete
translation. Saved prose remains unchanged.

Reusable UI labels such as the new home/away badges use `useLocale().t(...)`, with the same
message IDs present in every registered pack. Keep this copy outside theme JSON and bitmap art.
