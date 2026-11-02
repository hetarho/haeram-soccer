# Staff role badge resources

Implemented working artwork for the manager and all eight staff posts. These are nine actual
SVG skins shared by all registered themes, with one stable colour per job. The clipped corners
and inset keyline keep the compact badges distinct on both light and dark surfaces.

| Job         | Colour | Resource                |
| ----------- | ------ | ----------------------- |
| Manager     | Navy   | `frame-manager.svg`     |
| Director    | Purple | `frame-director.svg`    |
| Assistant   | Teal   | `frame-assistant.svg`   |
| Attack      | Coral  | `frame-attack.svg`      |
| Defence     | Blue   | `frame-defense.svg`     |
| Goalkeeping | Gold   | `frame-goalkeeping.svg` |
| Fitness     | Orange | `frame-fitness.svg`     |
| Youth       | Green  | `frame-youth.svg`       |
| Scout       | Rose   | `frame-scout.svg`       |

`source.mjs` is the editable native artwork and palette; no raster generation is involved.
Run `node apps/web/design/staff-role-badges/build.mjs` from the repository root to regenerate
`public/art/shared/staff-role-badges-v1/`, its hashes and every registered theme's image metadata.
Each 96×40 skin has an 8px source cap. The shared skin CSS draws its filled centre with a 4px
display frame; CSS fallback colours do not replace the image.

`StaffRoleBadge` keeps the full localized job label live and is informational, including on
vacant posts. The team coach list and detailed coaching staff page use the same resources.
The `badges` design-system story previews all nine jobs together. The artwork awaits the
owner's screen review; this records implementation, not an approved new theme direction.
