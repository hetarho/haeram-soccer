# Persisted-world calibration (T866)

Measurement in progress. The original four-hour window began 2026-11-13T08:52:43.827Z and ended 12:52:43.827Z. Latest owner steering shortens measurement work to 12:00 UTC and finalization to 12:15 UTC, preserving the original start. Publication belongs to the host by 13:00 UTC. The host holds the clone-wide heavy lock. No target is claimed passing until its measured evidence is recorded here.

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

At 09:41 UTC, the first four initial worlds have only reached 1970. Their partial summaries already show 252 observed division/decade/seed cells outside ±5 from 1950 onward; this includes a partial 1970s decade and is not a complete 1930–2010 result. Actual books already include wages above revenue and after-summer wage-limit breaches in every country. Missing champions, cohort and run-completion fields in the inherited partial format are explicitly reported by the summary; zero comparable champions failures with zero complete seeds is **insufficient evidence**, never a pass.

The T865 historical profile completed on its exact exported 2d8f77e7 source with five real seasons, zero warm-up, and bundle prefix ffa269ab63996239 matching its paired candidate. `T865-profile.log`, the compressed CPU profile and the compressed runnable bundle preserve the evidence. An initial relative `--tree` argument was rejected by esbuild before any measurement; the corrected absolute argument completed. Profile scratch defaulted to `/tmp/haeram-perf-profile`; the completed evidence has been copied into this task's artifact directory.

The later partial-summary reader repair accepts inherited partial JSON that predates the champions fields. It has no edge in the century, capacity or simulation dependency closures, so those running measurements remain valid. The source's full fingerprint may differ; the exact computation fingerprints are preserved separately.
