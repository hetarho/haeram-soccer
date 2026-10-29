# Matchday Print rating tiers

The active five-level scale is bronze below 50, silver 50–64, gold 65–74, platinum 75–84
and ruby from 85. It is presentation only; football ratings and simulation are unchanged.
The shared `ovrTier` function supplies the same tiers to OVR/POT cards and table chips.

| Tier     | Surface                                    | Live text  |
| -------- | ------------------------------------------ | ---------- |
| Bronze   | Copper with brown engraved edges           | Dark brown |
| Silver   | Cool pale silver with slate edges          | Dark navy  |
| Gold     | Saturated yellow gold with amber edges     | Dark umber |
| Platinum | Icy cyan with teal engraved edges          | Dark teal  |
| Ruby     | Crimson with restrained gold corner detail | White      |

The current source is `../page-refresh-v1/sources/rating-frames.png`. It supplies five filled
nine-slice resources, with source caps recorded in the theme/manifest. Small chips retain their
compact typography and large cards retain their own size; the artwork never contains numbers.
The shared guide and WEB-91 own the display and accessibility rules.

Run `node scripts/prepare-page-refresh.mjs` from the repository root to regenerate and register
the active resources; `--ratings-only` prepares only the rating families. Run with `--check` to
verify their hashes without conversion. Exact built-in image prompts and retained originals
are in [page-refresh-v1](../page-refresh-v1/README.md). The earlier source files and `build.mjs`
remain historical recipes; regenerating an older base family must be followed by the active
page-refresh recipe. Do not restore its superseded iron/elite scale into current packs.
