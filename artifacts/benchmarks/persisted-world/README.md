# Persisted-world calibration (T866)

Measurement in progress. The original four-hour window began 2026-11-13T08:52:43.827Z, with its original end at 12:52:43.827Z. Latest owner steering shortens measurement work to 12:00 UTC and finalization to 12:15 UTC, preserving the original start. Publication belongs to the host by 13:00 UTC. The host holds the clone-wide heavy lock. No target is claimed passing until its measured evidence is recorded here.

The immutable comparison is `T286-before.json`, copied before any century phase. Historical throughput uses pre-T861 `b41b8978774506a0344aafd100bf4237ce70046d`, the owner's specified stage commits and ARCH-34's paired main-thread CPU estimator. Historical T863 evidence includes its subsequently corrected growth/XI-reselection behavior; it is not evidence for the final growth contract.

All world probes are ownerless `historyWorld`/`liveHistory` lives of every playable association. Calendar years 1930–2010 include the seven-season war gap: they do not constitute 80 played seasons. Values extended through 2025 are labeled separately. LEAGUE-13 reference careers are **not re-measured** in this task.

The founding draw remains `flat`. WORLD-6 requires MATCH-2, MATCH-23 season scoring, CLUB-46, CLUB-48 and LEAGUE-10 together; an unmeasured or failing part cannot authorize `spread`.

The latest test policy is **unit-only**. Non-browser numerical measurements remain authorized. Browser generation and the benchmark activation/host-writer integration probe are deferred; no integration/contract/e2e, mixed/full suite or CI command is run by this continuation. Commands listed below are reproduction instructions, not evidence of execution.

## Reproduction

Use pinned Node v24.22.1 and pnpm 10.34.6. Every command below is a calibration measurement, not an isolated unit test. The host's held heavy lock covers these commands. Invoke each through the installed CLI's `vibe check --tier task --task T866 --diff-base 3c07ec2d8a46e9d868a9864750c892aa5b86ca22 --timeout-ms 14400000 -- <command>`; the task-tier label does not change its actual isolation/dependencies.

- `pnpm exec tsx scripts/persisted-world-read.ts --seed persisted-world-viability --until 1980 --out artifacts/benchmarks/persisted-world/initial-1980.json`
- `pnpm exec tsx scripts/persisted-world-read.ts --seed persisted-world-viability --until 2010 --extend 2025 --out artifacts/benchmarks/persisted-world/initial-2010.json`
- `pnpm exec tsx scripts/season-throughput.ts --paired-base b41b8978774506a0344aafd100bf4237ce70046d --json artifacts/benchmarks/persisted-world/final-seasons.json`
- `node scripts/perf/ab.mjs --base b41b8978774506a0344aafd100bf4237ce70046d --workload creation-1990 --json artifacts/benchmarks/persisted-world/final-creation.json`
- `pnpm exec tsx scripts/persisted-size.ts --seasons 10 --reps 3 --out artifacts/benchmarks/persisted-world/squads-10.json`
- `pnpm exec tsx scripts/persisted-size.ts --records --seasons 20 --reps 3 --out artifacts/benchmarks/persisted-world/records-20.json`
- `pnpm exec tsx scripts/update-golden.ts --write` (inherited generation completed, confirmed by golden-generation.log and six complete expected scenarios; not re-run here)
- `pnpm run build` (reference build deferred with the browser probe)
- `pnpm exec tsx scripts/generation-budget.ts --task T866 --decades 2000 --modes process-x4,x1 --out artifacts/benchmarks/persisted-world/generation-2000.json` (not executed under the latest unit-only policy)
- `pnpm exec tsx scripts/benchmark.ts --phase <phase> --out artifacts/benchmarks/persisted-world/century.json` in ordered independent chains: retained; activation; baseline-1 → baseline-2 → baseline-checkpoints; active-management-1 → active-management-2 → active-management-checkpoints; era-1 → era-2; then report.

Keep simulation/config/workload/codec closure fixed throughout the final throughput, generation and century measurements. Benchmark phases have a computation dependency hash and execution identity, and reject incompatible phase reuse. JSON outputs retain source, closure, machine, load, seeds and individual observations.

## Bounds and interpretation

Original limits are unchanged: checkpoint 6 MiB conservative UTF-16, portable file 8 MiB actual UTF-8, decompressed packed JSON 32 MiB; compressed shares `PERSISTED_BUDGET.squads = 500000` and `records = 450000`. Streams compressed alone are nonadditive. A straight-line 100-season estimate from 20 seasons is not actual century evidence. Generation's canonical reference budget is at most 5000 ms per played season; the harness's older 90000 ms trace field is reported beside it, not substituted for it.

Host-owned final `pnpm run verify:batch`, browser suite, main publication and CI have not run here. Fast static checks and affected isolated units are recorded separately from the measurements.

## Historical stage evidence (in progress)

These are the owner-specified historical candidates, not final-candidate measurements. Changed output hashes are model changes, not result-identical speedups. CPU ratios use four alternating paired processes, each with one five-season measurement and no warm-up; wall and per-process samples remain in JSON.

| Owner stage | Candidate | Cumulative allowance | CPU ratio (95% interval) | Status |
|---|---|---:|---|---|
| T867 | affbd6c6846c | 1.25 | 0.9121 (0.8119–0.9985) | within allowance |
| T862 | 4afa1fa1bad7 | 1.60 | 3.4404 (3.1400–3.8058) | above allowance |
| T863 | 935a91df96fb | 1.60 | 13.4380 (12.6768–14.5468) | above allowance; historical reselection regression |
| T864 | a85d3b99ab76 | 1.90 | 31.1927 (28.4459–33.1910) | above allowance |
| T865 | 2d8f77e7118c | 2.10 | 38.5731 (34.5776–43.0303) | above allowance; four raw pairs complete, wrapper receipt unavailable |

The historical 4afa1fa1 growth profile spends 46.1% inclusive in settleNpcGrowth (17.1% self in growAttributes); the 935a91df profile spends 51.7% inclusive in refreshFreeAgents, 25.9% in settleNpcGrowth and 20.2% in invalidateNpcSquad. These measured hot paths do not justify changing growth cadence, reselecting the held XI on growth, or dropping signings. Current T866 authority tunes only the named configs. Result-identical batching/caching of free-agent need and fixed player-weight reads are future engineering suggestions; no such cut has been implemented or claimed measured here. The historical reselection behavior was corrected in T864.

## Production controls and validation so far

`configs-in-force.json` records every named production control and the simulation dependency hash. Production packages are unchanged by T866: `source-provenance.json` records their identical Git tree at af821030 and 43859269. Trial `stable-levels.config.json` reduces investment from 0.5 to 0.02 and decay from 0.05 to 0.005, and uses youth potential ranges 38–59 / 48–69 / 58–79 / 68–89 / 73–95 / 78–99. Its interrupted 1950 ENG division deltas are +1.25 / +6.46 / +13.58 / +18.71, still outside the target in three divisions. It is partial evidence, not a completed candidate gate. `slow-levels.config.json` has no completed measurement and is not claimed measured. No production control was changed.

The CLI decision is inbox 314e28d9: retain current production controls while preserving the trial and its residuals; do not ship a partial fit or start an algorithm repair. Founding remains flat: WORLD-6's complete MATCH-2, MATCH-23, CLUB-46, CLUB-48 and LEAGUE-10 gate has not passed on these worlds. Reference careers under LEAGUE-13 are not re-measured.

Seven isolated unit cases passed in `scripts/lib/persisted-world-facts.test.ts` and `scripts/perf/stats.test.ts`; the cohort cases use eight prepared player observations, with no world simulation. Typecheck, lint, all 12 locale packs, and the final format check passed. The first format check found the inherited generated portable JSON unformatted; formatting was fixed before the successful recheck. Spec lint has no errors; its two existing warnings concern T859's old ARCH base and an unrelated review, with 75 existing editorial hints. Full logs are the adjacent `unit-facts.log`, `typecheck.log`, `lint.log`, `i18n.log`, `format.log` and `spec-lint.log`.

The inherited golden writer reached its final Wrote-six-scenarios log. `golden-review.json` statically compares every expected-fact field. The only command-input change selects the current first loanable club player (index 2 becomes 0); every other scenario definition is unchanged. Expected changes cover persisted players, real NPC dealings, books and retained career facts. This static review and generation completion do not constitute a portable contract test pass; that test was not run under the latest policy.

At 11:05 UTC, the four initial worlds have complete final JSON through the 2010 core boundary and the labeled 2025 value extension. Each records 88 played seasons including the extension, not eighty core played seasons. `summary.json`, `world-facts.md`, `division-levels.csv` and `peak-ages.csv` now summarize those four complete worlds; the required fifth world is still missing. All 588 observed division/decade/seed cells from 1950 are outside ±5, and all 32 completed country/seed champions windows miss the target. Wages exceed revenue in 10748 of 131692 observed closed club-seasons, with 47223 after-summer breaches. Counts describe the observed four worlds, never five completed worlds. The full files preserve every array fact from their obsolete temporary partials; `superseded-partials.json` records prefix-equality checks and hashes before those duplicate partial files were removed. The interrupted parent left no wrapper receipt for the four completed raw files, so no receipt is invented.

The T865 historical profile completed on its exact exported 2d8f77e7 source with five real seasons, zero warm-up, and bundle prefix ffa269ab63996239 matching its paired candidate. `T865-profile.log`, the compressed CPU profile and the compressed runnable bundle preserve the evidence. An initial relative `--tree` argument was rejected by esbuild before any measurement; the corrected absolute argument completed. Profile scratch defaulted to `/tmp/haeram-perf-profile`; the completed evidence has been copied into this task's artifact directory.

The later partial-summary reader repair accepts inherited partial JSON that predates the champions fields. It has no edge in the century, capacity or simulation dependency closures, so those running measurements remain valid. The source's full fingerprint may differ; the exact computation fingerprints are preserved separately.

## Interrupted capacity attempt

The first `squads-10` command finished its ten ownerless seasons, then failed in career-column context validation: `historyWorld` has no owned playerClub in the clubs registry, whereas a saved career must. No post/encode or checkpoint-size pass is claimed from it. This diagnoses the probe's state preparation, not a produced owned-save codec defect. Its exact receipt/log are preserved; the repair will use the real takeover API after those lived seasons, without relaxing codec assertions or inventing an owner club. The already-running owned `records-20` probe keeps its source untouched until completion.

## 10:00 UTC failures and diagnostic follow-up

The inherited owned `records-20` probe and the active-management century first half both stop at their original completed-season archive assertions, before their requested horizons. Their exact logs/receipts are retained. The first-half active profile measured only its founding checkpoint (631042 conservative UTF-16 bytes); it did **not** complete 50 or 100 seasons. The logs do not establish the end cause or exact last completed year, so neither is invented here.

Once records-20 ended, the squads-only harness was repaired to invoke `takeOver` after ten actual ownerless seasons and preserve its prepared world under `.tmp/pw86`. This is the normal history-to-owned-career boundary: all clubs, records and real acquired players remain, with the bought club's squad moved into the owner's players by the production API. It changes neither the production engine nor the already-running century/performance closures. The failed squads command is retained as such, and a separate squads-10-owned output names the repair.

A separate same-seed records-20 diagnostic repeats only that failed numerical request to retain the exact last completed season, career-end state, actual record components, kept retirees and a clearly labeled estimate from the **observed** horizon. It preserves its world and exits with the original archive assertion. It cannot turn a shorter life into a 20-season or actual-century pass. The loaded runner fingerprint is now captured before simulation; partial measurements are not labeled complete.

## Completed ten-season save-cost measurement

`squads-10-owned.json` is the repaired measurement, not a retry hidden as the original pass. It lives ten actual ownerless seasons from 1930 to 1947 (the war gap remains), takes the regular ENG lowest-tier club over through `takeOver`, and then samples the full owned world and its diagnostic squads-omitted counterpart in alternating order, three repetitions. It retains 16397 NPC squad players. The standalone squad stream is **996226 compressed bytes**, **496226 above** its unchanged 500000 budget. The actual checkpoint increment is 997205 compressed bytes, a separately measured nonadditive quantity. Full payload is 1666652 bytes; conservative UTF-16 checkpoint 1905382 bytes; UTF-8 file 2857433 bytes. These ten-season whole-save sizes fit their respective 6/8 MiB limits; they do not establish century capacity.

Full-world post samples are 353.37 / 320.36 / 300.54 ms (median 320.36); encode samples 2197.62 / 1961.08 / 2043.82 ms (median 2043.82). Squads-omitted post samples are 184.20 / 198.03 / 199.53 ms (median 198.03); encode 1628.40 / 1320.70 / 1130.12 ms (median 1320.70). Every raw sample and machine/load/closure is in the JSON; successful command completion does not mean the squad-stream budget passed.

## Records diagnostic: five actual seasons, not twenty

`records-20-diagnostic.json.partial.json` retains the exact stopped life. It closes 1950–1954, then stops in 1955 with `careerEnded: true`, `ended: fans`, despite the original full business stake. No owner state was reset. The completed horizon is **5/20 seasons**; the original archive assertion still fails. Actual record stream 319223 compressed bytes; independently compressed components: moves 69248, season lines 212945, retired profiles 25174, retained links 49467 bytes. Components do not add up to their jointly compressed stream. Kept retirees by actual season are 24 / 24 / 52 / 116 / 155 (371 total).

The diagnostic's **5-season LINEAR ESTIMATE** is 7420 kept retirees and 6384460 compressed record bytes at 100 seasons, 5934460 above the unchanged 450000 record budget. It is not the required 20-season estimate and not actual century evidence. No checkpoint-increment estimate is available, so that field is null rather than zero. The full stopped world is preserved locally at `.tmp/pw86/records-20-diagnostic.world.json` for a later authorized repair; no extra facts were pruned to encode it.

## Remaining named-config trial

The product closure remains frozen. Inbox decision 3cb34554 adds one **separate, same-seed trial**, not a production change: `residual-trial.config.json` uses investment 0.02, decay 0.005 and academy intake/potential pairs 1:[28,49], 1:[40,61], 2:[52,73], 2:[64,85], 3:[76,96], 3:[82,99]. Lower tiers' measured inflation motivates lower potential; the 496226-byte squad-stream gap motivates fewer intake places, still retaining the standing-size/minimum/line safeguards and academy-dependent intake. The trial keeps NPC_SQUAD, NPC_MARKET and flat founding unchanged, uses persisted-world-viability through 2010 with the labeled 2025 value extension, and has a timeout before 12:00 UTC. One seed cannot pass the required five-seed gate. Its measured configuration and residuals will be preserved, without invalidating the default-source century/performance evidence or silently applying a partial fit.

The baseline century first half also fails, after its 10-season progress marker: the original aggregate-XI assertion rejects fixture `1960:ENG:3:0:0:9` for the owned club `ENG:3:0:0`. Its founding checkpoint is 627158 UTF-16 bytes. No fabricated starting eleven is added, and no second half, century checkpoint, round-23 size or century stream share is claimed. The active-management first half fails separately at its archive assertion; the five-season fans exit is established only for the separately seeded records diagnostic, not assumed to explain the active profile.


## Host publication check and remaining measurement at 11:09 UTC

The repaired source is c0768c7ec900fa8f1efb2b3789741514b27cfd26 (T872 plus whitespace-only formatting). Final UNIT project: 344 files / 2941 tests passed, zero failures, 469057 ms wrapper. Typecheck, ESLint, all twelve locale packs and formatting passed. Spec lint has zero errors, one existing warning and 76 editorial hints. Exact commands, commits/trees and log hashes are in `publication-checks.json`; the original nineteen-unit-failure log remains beside the successful final log. No integration, contract, e2e/browser, build, verify:batch or CI command ran.

`final-seasons.json` completed four CPU/wall pairs on pre-T872 source: CPU ratio 37.876 (95% interval 34.7735–41.6456), wall ratio 34.0185 (29.5458–38.3334). Command success does not pass its performance allowance. Its exact bundles, hashes, load observations and source are retained. These and all previous numerical outputs keep their original source; the academy/takeover repair invalidates automatic reuse for any closure that consumes it, especially owned capacity. No old result is relabeled as a measurement of c0768c7e.

The retained workload failed validation at year1953/round21 with duplicate player IDs, before its first requested measurement completed. Its complete error and receipt are retained. T872 subsequently fixes academy prospects entering the first team; that does not establish this workload's result without a fresh authorized measurement. Baseline and active-management century failures remain distinct and unresolved; no full century checkpoint, file size or component share is claimed.

At 11:05 UTC, the host checked only this worktree's exact measurement commands. Creation1990 still ran; the old fifth-world and residual trial commands had ended without final artifacts. Their last partials are 1990 and 1950 respectively, with no completed gate or manufactured exit receipt. One final fifth-core attempt began 11:06 UTC on c0768c7e, seed persisted-world-viability, until2010 without a 2025 extension, under the shared heavy lock and a 3200000 ms timeout ending before12:00 UTC. Its output is `publication-seed-5-core.json`; it preserves the original task clock and is not a new exploration budget. The earlier interrupted partial is retained under its original name. No simultaneous duplicate world is launched.

Distribution medians use the upper middle observation for even populations. The initial four complete observers retain outfield peak cohorts; the fifth observer separately reports outfield, goalkeeper and all-player populations. A keeper/all-player result is never inferred from the outfield-only files. Full per-run source and computation fingerprints remain in the summary.
