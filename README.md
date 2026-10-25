# Haeram Football Archives

**Rules 4.0.0 (the grid match engine) passes the Linux CI on every browser and the 100-season storage benchmark; its browser-performance gate is measured again at the club-identity release gate.** See [verification](docs/VERIFICATION.md), [the improvement report](docs/IMPROVEMENT-REPORT.md) and [remaining external release work](docs/REMAINING.md).

A Korean, account-free football club growing game. Found a fictional club in 1950, prepare your build, watch your matches played out on a grid football engine and preserve a long club history. The [improvement guideline](docs/IMPROVEMENT-GUIDE.md) and [cycle report](docs/IMPROVEMENT-REPORT.md) describe the mobile play loop and its verification.

Playable associations: England, Spain, Germany, Italy, France, Portugal, Netherlands and Belgium. Modern domestic pyramids coexist with a fictional club history beginning in 1950. Domestic cups, continental club competitions, inflation and currencies evolve over the game calendar. See [the PRD](docs/PRD.md), [architecture](spec/ssot/ARCH.md) and [Korean development narrative](spec/NARRATIVE.md).

## Run

Use Node **24.12.0**, matching `.node-version` and CI, and pnpm **10.34.6**, pinned by `packageManager` in `package.json` (`corepack enable` or any pnpm 10 install switches to it).

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open http://localhost:19500 (the project's fixed dev port). For the finished static build:

```sh
pnpm run build
pnpm run preview
```

The static preview serves `http://localhost:4173`, application routes, module workers, security headers and real 404s. Production uses **Netlify** with the committed [netlify.toml](netlify.toml). No database, API keys or login are required. HTTPS or localhost is required for browser saving and exclusive-tab ownership.

## Play

Start with a name, country and starting capital; seed and color are optional advanced settings. Difficulty changes only capital: 2, 1 or 0.5 times the founding annual operating budget. The home shows the actual growing stadium, supporters, cash, team strength, fatigue, next goal and next match. Watch a game with one action; open details when needed. Statistics and results come from the seeded engine.

A new career plays the full match model from its founding (released in T286): players move continuously with their own intentions and team jobs, and every fixture between other clubs — league, cups and Europe — settles on an aggregate path that produces the same complete statistics (xG, passes, duels, cards, every player's line), so the league lenses and player comparisons read complete records for every club. A supported career saved before the release switches to the model at its next load from that day on: earlier results keep their recorded statistics and the league names where counting started; nothing is replayed or backfilled.

Follow the live league table, round-by-round rank graph, promotion/relegation point gaps, recent form and every result in your league's round. The calendar runs automatically at x1, x2, x5 or x10: one day every 1, 0.5, 0.2 or 0.1 seconds. A season close never stops it; each finished season's review and final table wait in the league page's season list. While watching, automatic progression waits for full time and immediately starts the next match. Statistics tabs keep the calendar running without remounting the live pitch. League-wide goalscorer standings and trends use actual recorded goals. Your club's matches play on the grid engine: 22 players on a 105 × 68 m pitch decide and contest every pass, carry, cross and shot against real-football distributions, and watching shows that same match minute by minute with Korean commentary, cards, substitutions and added time. Fixtures between other clubs take a faster probabilistic path on the same scoring curve. See [the engine design](docs/MATCH-ENGINE-DESIGN.md), [match playback](docs/MATCH-MOTION.md), [calibration](docs/CALIBRATION.md), [this gameplay iteration](docs/GAMEPLAY-ITERATION.md) and [season progression](docs/SEASON-PROGRESSION.md).

Choose who decides in seven independent categories: manager appointments, staff appointments, player contracts, recruitment, sales, academy moves and sponsors. The central settings also hold automatic/manual mode and match-eve/window-opening observations. Manual mode requires match eve and offers 다음 이벤트; automatic mode offers play/pause and x1/x2/x5/x10. Owner-held decisions stop either mode. Match preparation, watching and playing through remain available; public round/season jump tools are removed.

Build a formation-aware squad, compare recruitment candidates, negotiate tactics and set club policies. Coaches choose training; the owner can suggest or order a focus with its stated risks. Department policy sheets preserve the current task and other departments' unapplied drafts. Explicit apply transfers any disclosed pending work to its chosen decision-maker.

Players can be encouraged toward coaching, receive one combined playing-coach contract and later qualify for management through actual coaching service and aptitude. Their identity, age, employment and mentor history stay linked across roles and clubs. Recruitment mediation records the actual explanations, support choice and any fixed-deadline reinforcement promise. Reload/export/import preserve these records; unavailable historical NPC statistics are labelled rather than invented.

The archive includes every owned match's player/team statistics and highlights, all domestic season standings, European phase standings/honors, personnel changes and meaningful business events. Historical animation reconstructs recorded goals; its final statistics are exact. Raw historical movement/pass frames are not stored.

## Saves and recovery

One active world and its previous checkpoint live in localStorage. Export a `.haeram-save.json` file for backup or another browser/origin. New-world replacement and imports are explicit choices with an export option.

The game in play keeps one active checkpoint in localStorage and its previous copy in IndexedDB (two localStorage slots without IndexedDB); the manifest is written last. Compatible corruption may recover the previous validated checkpoint. Rules **4.0.0** start new careers: writer activation clears integrity-checked recognized legacy gameplay through 3.0.0, tells the owner once how many careers it cleared, while preserving device-owned strategies/preferences and protected future or unknown data. Legacy file imports are refused rather than converted. Quota failures retain the last committed save and in-memory progress for export/retry. A failed worker can reload the committed save. A second tab remains read-only and can take ownership after the writer closes. Unrelated storage is untouched.

Three game slots share one active two-slot localStorage save; parked game envelopes use IndexedDB. Switching validates the parked copy before activating another game. Large saves use a bounded background Brotli codec; small saves retain gzip and existing codec readers remain supported. Large encoding can take minutes.

The encoded checkpoint limit is **3 MiB** and namespaced localStorage use at most **3.5 MiB**, using conservative UTF-16 accounting. Measured 100-season scenarios pass; this does not promise unlimited storage for every play style. Capacity errors offer export and do not prune history. Checksum and version/catalog checks detect corruption/incompatibility, not cheating.

## Verify

```sh
pnpm exec playwright install --with-deps
pnpm run verify
pnpm run benchmark
```

`verify` runs type/lint/format, unit/property/portable-contract tests, real catalog validation, build and Chromium/Firefox/WebKit flows. CI runs the same checks as parallel jobs — static checks and unit tests, built-preview browser tests per browser (WebKit in two shards), and the storage/browser performance gates; [CI run 38970812465](https://github.com/hetarho/haeram-soccer/actions/runs/38970812465) verifies application commit `6df81fa`. [Verification notes](docs/VERIFICATION.md) record the tested environment and limits. [Netlify deployment](docs/DEPLOYMENT.md) explains protected production deployment, previews, caching and rollback.

The installed `haeram-spec-creator` skills are project files, not a package dependency:

```sh
npx -y haeram-spec-creator@latest check
npx -y haeram-spec-creator@latest lint
```

## Data and future releases

[Data sources and simplifications](docs/DATA.md) identify observed, estimated and projected prices and normalized football rules. The game generates fictional clubs/players locally; it does not run an LLM or fetch external APIs during play.

The Supabase hall-of-fame flag is disabled; only its adapter contract exists. Flutter is a later native Dart port, using the same specifications, data, exported saves and [portable golden scenarios](tests/fixtures/portable-v1.json). See [the transition plan](docs/FUTURE.md). No cloud infrastructure, live Netlify site or Flutter application has been created by this checkout.
