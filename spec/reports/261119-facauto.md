# REPORT 261119-facauto
> mode:autopilot | host:ihaelam-ui-MacBookPro.local | from:2026-11-19T16:12:54.233Z | to:- | push:main

## done
- Published the facility plan in 7fc631632. The rules are ECON-43 at r65 and SAVE-33 at r73. The existing facility card scope is WEB-14 at r226.
- T1033 df1d3ebec persists each part's setting. T1034 8f5410d55 localizes the controls. T1035 f36f55b25 routes the setting command. T1036 64d9ebec5 continues work at daily settlement. T1037 9ee690a29 shows the checkbox on the shared work cards.
- b09e9feb4 prevents new charges in ended careers and clears prior authorization on takeover. It keeps the checkbox in the existing facility work areas.
- da8e95b8e prepares the compatible 0.8.18 patch from main at dfdd27301. The engine and all workspace manifests agree and 0.8.17 remains supported.

## decided
- Owners start the first work manually. A checked part can start its next stage on the completion day after ordinary club settlement. Waiting for funds survives a save. If more than one part is eligible, the settled order is stadium, training ground, academy.
- The stadium setting includes rebuilds. Disabling the setting stops further starts and lets active work finish. The setting turns off at the completed maximum.

## parked
- The existing browser failures from the earlier save storage release are tracked under T1038.

## checks
- Task checks passed typecheck, lint, formatting, i18n for all 12 locales, and the relevant unit tests. The final fix passed 2,938 affected unit tests.
- Independent Claude review found the ended-career charge in f26dbd1f and approved the fix at b09e9feb4.
- The planning-only loop attempted to submit browser observations before the feature existed. The published task scopes verification to deterministic checks and the existing browser CI. The planning gate was released and the release participant starts with the published requirements.

## next
- Run the shared batch gate on the prepared release candidate. Record its publication and the Chromium CI result on the exact pushed commit.
