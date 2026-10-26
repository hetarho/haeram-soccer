# Readable pixel typography

Galmuri14 provides 15px reading text; Galmuri11 Regular/Bold provides compact labels, controls, headings and figures. Caption declarations have a 12px floor. The charcoal/grass-green surfaces, pixel scenes and icons remain in place.

Training uses 15px explanatory copy with 1.8 line height, larger card gaps, clear heading dividers, full-opacity focus options, separated values and natural Korean word wrapping. Shared supporting colours are brighter. Measured shared primary/muted/faint contrast over the four main surface colours ranges from 6.45:1 to 16.46:1. The phone pitch yields 20px to larger labels and the two-line match action; its 150px minimum is retained.

| Capture | Screen |
| --- | --- |
| [01](01-founding-390.png) | Founding, 390×844 |
| [02](02-home-390.png) | Club home, 390×844 |
| [03](03-training-390.png) | Training, 390×844 |
| [04](04-coach-rule-390.png) | Coach explanations and player training |
| [05](05-training-dialog-390.png) | Training suggestion dialog |
| [06](06-training-desktop.png) | Training, 1440×1000 |
| [07](07-training-360.png) | Training, 360×740 |

Verification: typecheck, lint, formatter, production build; 60 focused browser cases across Chromium, Firefox and WebKit covering founding, training, mobile shell/dialogs, the match loop, player profiles and long dropdowns. The separate native WebKit Tab-focus case fails identically on the unchanged baseline and is excluded from that focused final run. Existing spec quality hints remain unrelated.

Fonts are self-hosted with the unmodified source and license noted in apps/web/public/fonts/README.txt. Browser inspection confirmed all three font faces loaded and no rendered text below 12px in the inspected training view. Captures were taken after finite UI animations settled, in a separate browser context and preview origin.
