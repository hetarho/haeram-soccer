# Matchday Print source ownership

This directory owns new artwork sources specific to the `matchday-print` theme. Shared
components and locale messages live outside the theme; the pack supplies their print skins.

| Family                 | Source location                                            | Deployed location                                | Status                                                                                |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Home/away badges       | [home-away-badges](home-away-badges/README.md)             | `public/art/matchday-print/home-away-badges-v1/` | Registered; drawn by `HomeAwayBadge`                                                  |
| Result badges          | [result-badges](result-badges/README.md)                   | `public/art/matchday-print/result-badges-v1/`    | Registered; drawn by `ResultBadge`                                                    |
| Controller backgrounds | [controller-concepts-v1](controller-concepts-v1/README.md) | `public/art/matchday-print/controller-v1/`       | Selected P3 is the transport material; P1 and P2 remain alternatives                  |
| Dropdown plates        | [dropdown-v1](dropdown-v1/README.md)                       | `public/art/matchday-print/dropdown-v1/`         | Registered alternatives; the Select draws the ticket and stamp frames                 |
| Stadium exterior       | [stadium-exterior-v1](stadium-exterior-v1/README.md)       | `public/art/matchday-print/stadium-exterior-v1/` | Registered cover for the stadium investment destination; awaiting the owner's review  |
| Club briefing          | [club-briefing-v1](club-briefing-v1/README.md)             | `public/art/matchday-print/club-briefing-v1/`    | Prepared working art; not registered in a theme slot or connected to a page component |

Earlier print families still live at `../home-print`, `../controls-print`, `../hierarchy-print`,
`../analysis-print`, `../surfaces-print` and `../rating-print`. These are legacy source paths;
their manifests and build recipes still refer to those locations. See the
[ownership inventory](../README.md) for the current state, rather than treating their flat
layout as the pattern for another print-only resource.
