# Local web verification

## Grid engine rebuild, final verification (T233) — 2026-10-20

The rebuild's final source is `bba748577743a488f149d220ce0934b100f896b4` (rules 4.0.0); T233 changes only documentation after it. `pnpm exec tsx scripts/update-golden.ts --write` on that source rewrites the seven portable scenarios to the committed `tests/fixtures/portable-v1.json` unchanged.

The ARCH-30 batch ran once on that commit in a clean detached worktree (Node 26.8.1, macOS arm64, Apple M1 Max, 695,793 ms):

| command | result |
|---|---|
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass |
| `pnpm run test:unit` | 203 files, 1,271 passed, 4 skipped (192.9 s) |
| `pnpm run test:contract` | 3 files, 37 passed |
| `pnpm run validate:catalogs` | pass |
| `pnpm run build` | pass |
| `PREVIEW_BUILD=1 pnpm exec playwright test --project=chromium` | 186 passed (8.1 min) |

The four skipped unit cases are the rebuild's tactic-balance skips: the grid path's equal-side draw share (`calibration.grid-favourite.test.ts`, T216; the summary path runs it in `calibration.test.ts`) and the three non-press preferences of `build.tradeoffs.test.ts` (T218), both waiting on the grid tactic-balance follow-up in STATE next (press beats every other grid tactic, docs/CALIBRATION.md). The other skips in the repository are the browser and preview gates of `contract-talks`, `preview` and `large-codec` journeys, which predate the rebuild.

[CI 39419491861](https://github.com/hetarho/haeram-soccer/actions/runs/39419491861) passed every job on that commit (pinned Node 24.12.0): checks (type/lint/format, contract tests, catalogs, production build), unit tests in three shards, and the built-preview journeys on Chromium, Firefox and WebKit (two shards). The storage evidence is T232's local `pnpm run benchmark` below; `benchmark.yml` was not dispatched.

## Rules 4.0.0 century storage (T232) — 2026-10-20

`pnpm run benchmark` passed locally at committed `fbd018c8b6848a3cec43db70723d113b45259def` (clean tree), source SHA-256 `f3c510eea708a128ba0d4a12f6305f5908c5c5334857534e5e4862efab9c6a41`, engine rules 4.0.0, on Node 26.8.1, macOS arm64, Apple M1 Max, in 3,071,890 ms. Both century careers, the settled active round 23, every lossless round trip, both resumed-season replays, the retained workload and the 1950–2025 era probe pass under SAVE-4 (3,145,728 B a checkpoint, 3,670,016 B total; only the active copy counts toward the total since T231).

| checkpoint | checkpoint B | compressed payload B | canonical world B | encode ms | own matches |
|---|---|---|---|---|---|
| retained career and cross-season promise | 284,910 | 248,715 | 4,165,674 | 135 | 152 |
| retained workload after season close | 203,126 | 177,154 | 3,684,895 | 99 | 177 |
| baseline founding | 65,258 | 56,521 | 2,237,465 | 36 | 0 |
| baseline mid-career active round | 1,215,516 | 1,205,324 | 35,466,371 | 96,931 | 2,248 |
| **baseline century (worst)** | **2,382,876** | 2,363,512 | 88,795,795 | 194,627 | 4,481 |
| active-management founding | 65,154 | 56,428 | 2,237,957 | 38 | 0 |
| active-management mid-career active round | 1,082,526 | 1,073,349 | 34,351,710 | 92,293 | 1,885 |
| active-management century | 1,964,446 | 1,948,308 | 84,845,581 | 183,486 | 3,426 |
| active-management century active round 23 | 2,052,254 | 2,035,431 | 86,320,752 | 183,987 | 3,442 |

The worst checkpoint uses 75.7% of the checkpoint limit (762,852 B headroom); its total is 2,383,388 B. T271 measured 2,378,780 B for T218's century, a different career (4,704 own matches, own league on the grid, no discipline, material or heat), so the two do not compare like for like. The largest packed streams of that checkpoint, each compressed alone with the checkpoint's brotli settings (they compress jointly in the payload, so these rank them and do not sum to it):

| stream | canonical B | brotli alone B |
|---|---|---|
| `matchDetail.players` | 1,328,584 | 490,257 |
| `statBits.data` | 872,554 | 298,037 |
| `careers.jobs` | 4,509,526 | 200,923 |
| `matchIncidents.rows` | 352,115 | 176,885 |
| `standings` | 444,718 | 171,861 |
| `matchDetail.teams` | 282,553 | 170,734 |
| `careers.people` | 2,777,332 | 157,019 |
| `world.players` | 872,509 | 93,651 |
| `dict` | 474,188 | 69,048 |
| `careers.mentors` | 1,308,393 | 64,016 |
| `seasonHeat.rows` | 137,633 | 55,073 |

Season engine time without codec or replay checks: baseline 8.46 s and active management 8.24 s a season on this host (T224 measured 8.4 s on the summary path and 42.7 s with the own league on the grid, rules 3.0.0 5.1 s), so MATCH-22's own league stays on the probabilistic path. The baseline career retains 20,606 people, the active one 20,422; peak checkpoint-sampled heap 2,038,461,672 B.

Raw [rules-4 storage report](benchmarks/T232-rules4-storage.json), identical to [T010-storage.json](benchmarks/T010-storage.json), which `first-play.mjs` reads. The run used the local Node 26.8.1, not the pinned 24.12.0; the manually dispatched `benchmark.yml` runs the same benchmark on the pinned toolchain when the owner starts it. No codec, retention or limit changed. These representative seeds do not guarantee every career fits.

## Rules 3.0.0 integration — 2026-10-17

[CI 38970812465](https://github.com/hetarho/haeram-soccer/actions/runs/38970812465) passed at application commit `6df81fa31e88c981b74212ab0ee9ad44c2789bdd`, source SHA-256 `63ef01ba2666d94841b8683b890987bf44d2f929f2bfe70b4ee412e10348c1b0` (535 files). The closing documentation commits preserve that exact source.

- Node 24.12.0/pnpm 10.34.6: type/lint/format, 1018 unit tests, 15 contract tests, catalog validation and production build pass.
- Chromium 183, Firefox 181 and WebKit 180 cases pass; one further WebKit mobile pace case passes on its configured retry. Four existing browser skips remain.
- Both complete 100-season seeds, active round 23, exact canonical round trips, resumed-season replay, retained playing-coach/manager/mentor and cross-season promise workloads, eight-country archives and the separate 1950–2025 era probe pass. Maximum checkpoint 1,564,446/1,572,864 bytes; total 3,129,404/3,670,016. The active profile retains 20,586 people/174,980 jobs/162,119 mentor spells. Peak checkpoint-sampled heap 1,743,679,856 bytes; full benchmark 2,572,420ms. Large writes take roughly two minutes on this CI host.
- Built Chromium reference: entry 255,150/256,000 gzip bytes; desktop/mobile founding 2372/2377ms; input p95 51/27ms; pitch 61/60FPS; century restore 3445ms. Served build bytes match; no page errors or mobile overflow.

Raw [storage](benchmarks/T178-rules3-storage.json) and [performance](benchmarks/T010-first-play.json) artifacts are copied unchanged from CI. [Integration provenance](benchmarks/T179-rules3-integration.json) records the artifact/run and source match. The performance artifact's dirty Git flag results from the preceding storage report writing a tracked documentation file; both source fingerprints remain identical. These measured representative seeds do not guarantee indefinite capacity for every career.

The seven portable scenarios retain four historical definitions and add current responsibility/manual, combined-contract and mediation/promise facts. The final gate regenerates no golden facts. Production-call audit confirms UI uses settings/responsibilities and public mode-specific actions; only internal worker/client compatibility and historical portable scenarios retain old season/advance commands. The live host excludes lifetime `people` from per-tick projections; explicit export and selected-person requests preserve full facts. Domain queries own business stopping; no second UI business-stop table or new authority store was added. No balance coefficients, retention, storage budgets or CSP changed during final verification.

Local Node 24.12.0 verification also passes type/lint/format, 1018 unit/15 contract tests, catalogs/build and 545 built-preview browser cases (four existing skips, no failures or retry passes). The initial `pnpm run verify` browser startup found port4173 occupied; rerunning only `pnpm run test:e2e` with `CI=1 BROWSER_TEST_PORT=4289` passed in19.2minutes. This is an infrastructure continuation, not a changed assertion or source. Spec lint passes with34 existing document-quality hints.

Earlier results below are historical and are superseded for the current source by this section. Deployment, hall of fame, Flutter and balance experiments remain outside this batch.

## Latest integration review — 2026-10-08

The save-lineage, goalkeeper-retirement, historical regional-group and European-coefficient fixes were integrated on top of `f530702`. The reviewed code was committed as `0e3d4f2` before these evidence updates; its source fingerprint is unchanged by the documentation/benchmark-record update.

- `npm run verify` passed typecheck, lint, formatting, catalog validation, production build, **199 unit tests, 5 contract tests and 165 Chromium/Firefox/WebKit cases**. The historical Italy A/B/C filters and country reset pass at 390px in each browser.
- `npm run benchmark` passed complete century workloads, active round 23, lossless/resumed replay and the era probe. Maximum checkpoint: **1,453,872 bytes**; conservative two-checkpoint estimate: **2,908,256 bytes**, within the unchanged budgets.
- `npm run benchmark:browser` **did not pass** the desktop input target on this Linux host: pointer-to-second-frame p95 **120ms**, above the strict `<100ms` budget. A diagnostic repeat with per-control timings also failed at **289ms**, including a late club-journal navigation spike. No application edits were made between these runs; desktop response profiling remains a follow-up.
- Other reference gates passed: mobile input p95 **41ms**, desktop/mobile founding **436/430ms**, actual pitch paints **61/60 FPS**, entry/all-JS-CSS gzip **133,801/220,951 bytes**, century restore **2,457ms**, matching served-build hashes, no page errors and no mobile horizontal overflow.

Environment: Node 24.12.0, Linux x64, Intel Xeon Silver 4214, Playwright 1.63.0, Chromium 153.0.8010.12. The current [storage](benchmarks/T010-storage.json) and [browser-performance](benchmarks/T010-first-play.json) artifacts preserve these measurements, including the failed desktop gate. Source SHA-256: `1a4095bb648ac1e6a47ff7e184a823a1f365e0b0f541e9e1e2d877b68784acf1`; build SHA-256: `9c170427cb4d9b25c980836a70ec7255e2b16d6fd66e33835dbbe7ae0c9366b2`.

This host uses browser libraries and fonts extracted under `/tmp/haeram-browser-libs`. The first browser run was interrupted after Firefox could not read those fonts and rendered missing-glyph boxes, causing layout failures and timeouts. The complete passing rerun used `LD_LIBRARY_PATH`, `FONTCONFIG_FILE`, `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` and `MOZ_DISABLE_CONTENT_SANDBOX=1` so Firefox could access the temporary fonts. These are local test-process settings; CI installs dependencies in their standard locations. The new commit's remote CI result has not yet been measured.

## Earlier improvement verification

The 12 gameplay improvement cycles and existing local release-verification task are complete. Verification ran before committing. Source/build fingerprints identify the checked content; Git metadata preserves the state at measurement time. The local evidence is supplemented by successful Linux CI for T027; no public deployment is claimed. See [the improvement report](IMPROVEMENT-REPORT.md) and [remaining external work](REMAINING.md).

Verified on 2026-10-08 KST using Node **24.12.0**, macOS arm64, Apple M1 Max, Playwright 1.63.0 and Chromium 153.0.8010.12 for the performance trace.

| Executed gate | Result |
|---|---|
| `BROWSER_TEST_PORT=4187 npm run verify` | type/lint/format/catalog/build passed; 193 unit, 5 contract and 162 built-preview Chromium/Firefox/WebKit tests passed |
| `npm run benchmark` | both century profiles, active round 23, lossless/resumed replay, eight-country archive/capacity and 124-season era checks passed |
| `BENCHMARK_ORIGIN=http://127.0.0.1:4180 npm run benchmark:browser` | served-build hashes, page 4xCPU/Fast4G, input/FPS/initialization and compressed asset budgets passed |
| Additional reduced-motion/keyboard probe | all three browser families start paused, accept keyboard observation/result actions and preserve the save |
| Spec lint and installed skill synchronization | passed |

[Full verification output](improvement/verification.txt), [storage measurements](benchmarks/T010-storage.json), [performance measurements](benchmarks/T010-first-play.json) and [accessibility probe](improvement/reduced-motion.json) retain actual results. Screenshots are linked in the improvement report.

Storage maximum: 1,453,872 conservative UTF-16 bytes, below 1.5MiB with 7.6% headroom. Mobile input p95: 30ms; actual pitch paints: 60FPS. Initial JS/CSS: 133,809 gzip bytes; conservative all-JS/CSS inventory: 220,899 bytes, both below250KiB. Mobile founding:209ms. The separate 100-season restore measured1,356ms without CPU/network throttling.

Source SHA-256: `b3db7c49af2ce3ccadaf73f436682561bdca8dca98b0f8d146b46222ef38b684`. Build SHA-256: `dbc12b031885da51feea327be13625afff9ac10bf21ecfb64688256beeaf70c8`. Both measurement scripts have identical source coverage and reject changed inputs; the performance script checks the measured origin against local build bytes.

Reference fixtures are synthetic. Browser layout checks are not physical-device testing, human fun/retention validation, native Flutter release, remote GitHub CI or a live Netlify smoke test. Page-target transfer totals may omit dedicated-worker requests; the conservative asset inventory includes them. No unlimited storage or App Store ranking claim is made.

T027 corrects the six Linux CI founding-overflow failures from run37699063758. The real WenQuanYi font probe reproduces the old794px height and verifies all browser/viewport pairs at740/844px after correction. A permanent wrapped-text regression retains strict viewport/control/import/footer checks. Local162-browser verification and refreshed matching source/build benchmark artifacts passed; pushed Linux CI passed on eb1c759 (run37701628149).

[Linux CI run37701628149](https://github.com/hetarho/haeram-soccer/actions/runs/37701628149) completed successfully for commit `eb1c759aa513d5fa6ec31807bab5fd44f923fc11`: full verify, century storage, throttled browser performance and artifact upload all passed. [Run metadata](improvement/t027-ci-result.json) preserves the exact tested commit and step results.
