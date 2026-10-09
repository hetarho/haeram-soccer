# Haeram Football Archives

**Local web verification passed after 12 improvement cycles.** See [the improvement report](docs/IMPROVEMENT-REPORT.md) and [remaining external release work](docs/REMAINING.md).

A Korean, account-free football club growing game. Found a fictional club in 1901, prepare your build, watch simplified football and preserve a long club history. The [improvement guideline](docs/IMPROVEMENT-GUIDE.md) and [cycle report](docs/IMPROVEMENT-REPORT.md) describe the mobile play loop and its verification.

Playable associations: England, Spain, Germany, Italy, France, Portugal, Netherlands and Belgium. Modern domestic pyramids coexist with an early-1900s fictional setting. Domestic cups, continental club competitions, inflation and currencies evolve over the game calendar. See [the PRD](docs/PRD.md), [architecture](spec/ssot/ARCH.md) and [Korean development narrative](spec/NARRATIVE.md).

## Run

Use Node **24.12.0**, matching `.node-version` and CI, and pnpm **10.34.6**, pinned by `packageManager` in `package.json` (`corepack enable` or any pnpm 10 install switches to it).

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open the printed **localhost** URL. For the finished static build:

```sh
pnpm run build
pnpm run preview
```

The static preview serves `http://localhost:4173`, application routes, module workers, security headers and real 404s. Production uses **Netlify** with the committed [netlify.toml](netlify.toml). No database, API keys or login are required. HTTPS or localhost is required for browser saving and exclusive-tab ownership.

## Play

Start with a name, country and starting capital; seed and color are optional advanced settings. Difficulty changes only capital: 2, 1 or 0.5 times the founding annual operating budget. The home shows the actual growing stadium, supporters, cash, team strength, fatigue, next goal and next match. Watch a game with one action; open details when needed. Statistics and results come from the seeded engine.

Follow the live league table, round-by-round rank graph, promotion/relegation point gaps, recent form and every result in your league's round. The calendar can run automatically at one day, three days, or the next owned match per second. While watching, automatic progression waits for full time and immediately starts the next match. Statistics tabs keep the calendar running without remounting the live pitch. League-wide goalscorer standings and trends use actual recorded goals. The match view includes individual player states, tendencies and movement targets; the observation engine has a central coefficient configuration for further tuning. See [this gameplay iteration](docs/GAMEPLAY-ITERATION.md), [motion model](docs/MATCH-MOTION.md) and [season progression](docs/SEASON-PROGRESSION.md).

Choose a role-valid starting XI or a strength/rest preset, negotiate tactics with the manager, compare candidates, buy/sell/loan players, sign a sponsor, run marketing, change ticket prices and improve facilities. Passing, defense, stamina, opponent style and fatigue create different strengths for balanced, possession, counter and pressing builds. Balanced, youth and recovery training trade future player growth against immediate readiness. Preview recruitment fit, upfront fees, wages and operating runway before acting. Facility, sponsor, marketing and ticket plans expose their actual costs and accounting. Personality affects acceptance and resignation. Financial warnings, manager departures, dialogs and hidden tabs stop unattended progression; closing a dialog or returning to a tab requires explicit restart.

Build the club like a deck of cards: hire a manager from eight schools of football (positional play, gegenpressing, pragmatic counter, defensive organizer, motivator, developer, firefighter, data-led head coach), commit to a season-long club vision (academy, selling club, commercial, community, promotion push), set academy investment, and watch synergies light up when manager, staff, policies and squad point the same way. The build board states the odds it sets, such as a golden prospect at the next intake. Morale and fitness are owner requests carried out by the manager or staff (squad meeting, team-building day, win bonus, training camp, a public vote of confidence), each with its chances shown before you ask. Every own match records advanced counters (key passes, xA, big chances, final-third passing, progressive passes, take-ons, high turnovers, PPDA, field tilt), shown in broadcast-style reports, player details and the season review, with a metrics glossary that gives the industry definition and this engine's count. Club news is derived from recorded facts (streaks, records, possession and xG splits, player milestones, table moves), and real achievements, never a transfer window opening, get a short celebration.

The archive includes every owned match's player/team statistics and highlights, all domestic season standings, European phase standings/honors, personnel changes and meaningful business events. Historical animation reconstructs recorded goals; its final statistics are exact. Raw historical movement/pass frames are not stored.

## Saves and recovery

One active world and its previous checkpoint live in localStorage. Export a `.haeram-save.json` file for backup or another browser/origin. New-world replacement and imports are explicit choices with an export option.

Two-slot writes commit the manifest last. Compatible corruption may recover the previous validated checkpoint. Version 1.0.0 careers upgrade to engine rules 1.1.0 in the writer tab without changing past facts; read-only tabs do not upgrade disk data. An incompatible selected future save stays protected and exportable. Quota failures retain the last committed save and in-memory progress; export or retry without closing the tab. A failed worker can reload the last committed save. A second tab is read-only; reload it after closing the writer to take ownership. Other applications' storage keys are untouched.

The encoded checkpoint limit is **1.5 MiB**, and the two-checkpoint budget is **3.5 MiB**, using conservative UTF-16 accounting. Measured 100-season scenarios pass; this does not promise unlimited storage for every play style. Capacity errors offer export and do not prune history. Checksum and version/catalog checks detect corruption/incompatibility, not cheating.

## Verify

```sh
pnpm exec playwright install --with-deps
pnpm run verify
pnpm run benchmark
```

`verify` runs type/lint/format, unit/property/portable-contract tests, real catalog validation, build and Chromium/Firefox/WebKit flows. CI runs the built-preview tests and the storage/browser performance gates; a remote run remains to be verified on an authorized pushed commit. [Verification notes](docs/VERIFICATION.md) record the tested environment and limits. [Netlify deployment](docs/DEPLOYMENT.md) explains protected production deployment, previews, caching and rollback.

The installed `haeram-spec-creator` skills are project files, not a package dependency:

```sh
npx -y haeram-spec-creator@latest check
npx -y haeram-spec-creator@latest lint
```

## Data and future releases

[Data sources and simplifications](docs/DATA.md) identify observed, estimated and projected prices and normalized football rules. The game generates fictional clubs/players locally; it does not run an LLM or fetch external APIs during play.

The Supabase hall-of-fame flag is disabled; only its adapter contract exists. Flutter is a later native Dart port, using the same specifications, data, exported saves and [portable golden scenarios](tests/fixtures/portable-v1.json). See [the transition plan](docs/FUTURE.md). No cloud infrastructure, live Netlify site or Flutter application has been created by this checkout.
