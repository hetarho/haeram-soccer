# Haeram Football Archives

**Release verification is unfinished.** See [remaining work](docs/REMAINING.md) before treating this snapshot as release-ready.

A Korean, account-free football management web game. Found a fictional club in 1901, watch simplified football, experiment with people and business, compare statistics and preserve a long club history.

Playable associations: England, Spain, Germany, Italy, France, Portugal, Netherlands and Belgium. Modern domestic pyramids coexist with an early-1900s fictional setting. European competitions, inflation and currencies evolve over the game calendar. See [the PRD](docs/PRD.md), [architecture](spec/ssot/ARCH.md) and [Korean development narrative](spec/NARRATIVE.md).

## Run

Use Node **24.12.0**, matching `.node-version` and CI.

```sh
npm ci
npm run dev
```

Open the printed **localhost** URL. For the finished static build:

```sh
npm run build
npm run preview
```

The static preview serves `http://localhost:4173`, application routes, module workers, security headers and real 404s. Production uses **Netlify** with the committed [netlify.toml](netlify.toml). No database, API keys or login are required. HTTPS or localhost is required for browser saving and exclusive-tab ownership.

## Play

Choose a country, club identity, seed and starting capital. Difficulty changes only capital: 2, 1 or 0.5 times the founding annual operating budget. Watch the next game, advance rounds or finish seasons. Statistics and results come from the seeded engine.

Negotiate tactics with the manager, compare candidates, buy/sell/loan players, sign a sponsor, run marketing, change ticket prices and improve facilities. Personality affects acceptance and resignation. Financial warnings and manager departures interrupt unattended progression.

The archive includes every owned match's player/team statistics and highlights, all domestic season standings, European phase standings/honors, personnel changes and meaningful business events. Historical animation reconstructs recorded goals; its final statistics are exact. Raw historical movement/pass frames are not stored.

## Saves and recovery

One active world and its previous checkpoint live in localStorage. Export a `.haeram-save.json` file for backup or another browser/origin. New-world replacement and imports are explicit choices with an export option.

Two-slot writes commit the manifest last. Corruption may recover the previous validated checkpoint. Quota failures retain the last committed save and in-memory progress; export or retry without closing the tab. A failed worker can reload the last committed save. A second tab is read-only; reload it after closing the writer to take ownership. Other applications' storage keys are untouched.

The encoded checkpoint limit is **1.5 MiB**, and the two-checkpoint budget is **3.5 MiB**, using conservative UTF-16 accounting. Measured 100-season scenarios pass; this does not promise unlimited storage for every play style. Capacity errors offer export and do not prune history. Checksum and version/catalog checks detect corruption/incompatibility, not cheating.

## Verify

```sh
npx playwright install --with-deps
npm run verify
npm run benchmark
```

`verify` runs type/lint/format, unit/property/portable-contract tests, real catalog validation, build and Chromium/Firefox/WebKit flows. CI runs the built-preview tests; adding the final benchmark gates is remaining work. [Verification notes](docs/VERIFICATION.md) record the tested environment and limits. [Netlify deployment](docs/DEPLOYMENT.md) explains protected production deployment, previews, caching and rollback.

The installed `haeram-spec-creator` skills are project files, not a package dependency:

```sh
npx -y haeram-spec-creator@latest check
npx -y haeram-spec-creator@latest lint
```

## Data and future releases

[Data sources and simplifications](docs/DATA.md) identify observed, estimated and projected prices and normalized football rules. The game generates fictional clubs/players locally; it does not run an LLM or fetch external APIs during play.

The Supabase hall-of-fame flag is disabled; only its adapter contract exists. Flutter is a later native Dart port, using the same specifications, data, exported saves and [portable golden scenarios](tests/fixtures/portable-v1.json). See [the transition plan](docs/FUTURE.md). No cloud infrastructure, live Netlify site or Flutter application has been created by this checkout.
