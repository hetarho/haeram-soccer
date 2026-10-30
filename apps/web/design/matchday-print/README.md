# Matchday Print source ownership

This directory owns new artwork sources specific to the `matchday-print` theme. Shared
components and locale messages live outside the theme; the pack supplies their print skins.

| Family           | Source location                                | Deployed location                                |
| ---------------- | ---------------------------------------------- | ------------------------------------------------ |
| Home/away badges | [home-away-badges](home-away-badges/README.md) | `public/art/matchday-print/home-away-badges-v1/` |
| Result badges    | [result-badges](result-badges/README.md)       | `public/art/matchday-print/result-badges-v1/`    |

Earlier print families still live at `../home-print`, `../controls-print`, `../hierarchy-print`,
`../analysis-print`, `../surfaces-print` and `../rating-print`. These are legacy source paths;
their manifests and build recipes still refer to those locations. See the
[ownership inventory](../README.md) for the current state, rather than treating their flat
layout as the pattern for another print-only resource.
