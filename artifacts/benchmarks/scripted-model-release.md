# Scripted model release — partial preparation (T838)

Source: db16b8f2a595a8a8289f7956d9d35f3ad5bc6c72, clean tree 40e63f52c537b731902d7a0ac9fef7d19b455208. Machine: Apple M1 Max, darwin arm64, Node v26.8.1. These measurements precede production activation; they are not a completed release or capacity verdict.

## Exactness audit

The fixed synthetic sample contains 200 own league fixtures, 40 in each of 1930, 1950, 1975, 1995 and 2024. Squads are frozen within each world; this is not a lived-season or capacity workload. Revision 11 is requested explicitly while the declared production release is revision 10. The production record guard and own-playback script validator/recount are unchanged. Every result retains its source seed, fixture ID, record digest and validation details in [the raw audit](T838/pre-activation-own-fixtures-200.json).

Attempted: 200; record failures: 0; script failures: 0 (0%); exceptions: 0.

```sh
pnpm exec tsx scripts/scripted-release-audit.ts .tmp/own-fixtures-200.json
```

## Throughput reread before activation

The existing paired runner measures identical copies of this source (A/A), seed perf-261027, with its workload defaults. All five workloads have byte-identical bundles and identical output hashes on both sides. This checks repeatability and reports current cost; no speed-up over the prior release is claimed. Grid contexts are explicitly pinned to revision 10; own settlement and production staging use revision 11. World construction is outside timing. Absolute medians below use every raw B-side sample; the runner’s A/A ratio excludes pairs below its existing 5 ms CPU cutoff. The fixture ratio therefore describes only that filtered subset. Each JSON retains raw pairs, hashes, bundle identity, loads, warm-ups and repetitions.

| Workload | CPU median ms | Wall median ms | Raw samples | Same hash | A/A CPU ratio [95%] |
|---|---:|---:|---:|---|---|
| own-match | 43.92 | 44.31 | 96 | true | 1.0011 [0.9787, 1.0266] |
| grid-own | 103.53 | 103.92 | 48 | true | 1.0002 [0.9905, 1.0188] |
| grid-observed | 198.42 | 200.92 | 48 | true | 1.0016 [0.9889, 1.0133] |
| fixture | 3.60 | 3.64 | 96 | true | 1.0445 [0.632, 1.5962] |
| staging | 3840.53 | 3877.93 | 24 | true | 1.0031 [0.9832, 1.0228] |

Full production staging now completes, including its prefix counters; the historical T837 prefix-ledger failure is repaired by T850 and validated with T849. Historical T837 reports are unchanged.

```sh
node scripts/perf/ab.mjs --workload own-match --base . --cand . --json .tmp/own-match-aa.json
node scripts/perf/ab.mjs --workload grid-own --base . --cand . --json .tmp/grid-own-aa.json
node scripts/perf/ab.mjs --workload grid-observed --base . --cand . --json .tmp/grid-observed-aa.json
node scripts/perf/ab.mjs --workload fixture --base . --cand . --json .tmp/fixture-aa.json
node scripts/perf/ab.mjs --workload staging --base . --cand . --json .tmp/staging-aa.json
```

## Remaining release work

The handoff candidate now implements revision-11 activation and removes SCRIPTED_RELEASE; 1756 affected units and all fast static/build checks pass. Both activation regressions, refreshed result digests and prepared checkpoints are implemented and validated as detailed below. Remaining integration failures, complete-season revision-10/revision-11 ratios and the unchanged lossless century capacity gate are still open. Repository-pinned Node 24.22.1 was unavailable; the actual toolchain above is context, not pinned-toolchain release evidence. Repeat the affected measurements on the final activation source. Browser migration is T839, the three-hour model verdict T840, and cleanup T841–T845. T849’s successful full batch at 64d30c26 is evidence for the repaired runtime before activation, not this incomplete release.

## Activation candidate and deadline handoff

Candidate 4e3d88fbe7aef5d883fc03033541f2bbbb67e507 activates revision 11, removes SCRIPTED_RELEASE, and regenerates the three prepared checkpoints. Both engine and Host revision-10-to-11 activation regressions pass, preserving settled records; historical grid digests are unchanged. The updated full-model digest case also passes in the broader run. Fast checks pass: typecheck, lint, format:check, validate:i18n and build; the affected unit selection passes 188 files / 1756 tests.

The [post-activation audit](T838/post-activation-own-fixtures-200.json) passes all 200 fixtures with zero record/script failures or exceptions; all 200 record hashes equal the pre-activation audit. This is final-candidate exactness evidence, not a century capacity or complete-season throughput run.

The broader unit/integration/contract run was stopped by its explicit 09:26 KST deadline after 444811 ms. It is incomplete and observed 13 failures; additional failures may remain. [The receipt and failed cases](T838/post-activation-engine-check.json) and [raw output](T838/post-activation-engine-output.txt) are preserved for the next owner. Some checks still expect grid frames; others require investigation. No guard, sample or threshold was weakened to clear them.

Release acceptance remains open: resolve these cases and rerun the engine gate, run the unchanged lossless century benchmark, and repeat required throughput on final source/toolchain. Browser migration remains T839, then T840–T845. The owner authorized incomplete work on wip/cc12-handoff by 09:30 KST; main is unchanged.

## Final source on the pinned toolchain (hf12, 261112)

Machine: Intel Xeon Silver 4214 @ 2.20GHz, 12 logical CPUs, 31 GiB, Linux 5.15.0-164, Node **v24.22.1** (the repository's pinned release), pnpm 10.34.6. The century benchmark's phases, the engine suite and these measurements shared the host, so every timing names its load. The engine source equals the audited candidate 4e3d88fb: since then only tests, `scripts/` measurement workloads and reports changed, so the [post-activation audit](T838/post-activation-own-fixtures-200.json) is this source's — 200 own fixtures, record (→MATCH-27) failures **0**, script count failures **0 (0%)**, exceptions 0.

### Engine suite

`pnpm exec vitest run --project unit --project integration --project contract` on the final test sources (01:26–02:05 UTC, load 7–27): 532 files, 4,482 tests — **4,472 passed, 4 skipped (declared), 6 failed, every one a time limit** under the shared load (`staff.hiring` 34 s against 30 s; `calendar.progression-eng`, `detail`, `fixtureHelpers.integration`, `staging/incidents` against 300 s; `persistence.long-career` against 600 s), no assertion failed. Those six files then pass with `--testTimeout=2400000` and nothing else changed (02:08–02:17 UTC, load about 25): `staging/incidents` 441 s, `calendar.progression-eng` 510 s, `fixtureHelpers.integration` 512 s, `staff.hiring` 29 s, `persistence.long-career` 9 s and `detail` 4 s. The handoff's 13 failures were tests that took a released own match for a grid match: viewer charts and moments, world, fast-path, season dispatch and client reload now read the script/staging (`stagedPlayback` where frames are needed), the grid's own dispatch is kept by an explicit revision-10 world, and `export-settled`'s ten prototype files are reproduced from the revision-10 worlds that exported them (the exporter now names the settling world's revision rather than the release constant).

### Complete season, revision 10 against revision 11

`pnpm exec tsx scripts/season-throughput.ts --ab rev10=.@10 rev11=.@11 --seasons 2 --reps 2` — the same tree, the century benchmark's two profile worlds pinned to each revision, interleaved with the order rotated each repetition ([raw](T838/season-rev10-rev11.json)). Sum of per-season medians, seconds:

| Profile | Revision 10 | Revision 11 | Revision 11 / 10 | Load 1 min |
|---|---:|---:|---:|---|
| baseline | 142.6 (81.7, 61.0) | 252.1 (134.1, 118.0) | **1.768** | 6.9–23.5 |
| active-management | 114.5 (66.3, 48.2) | 161.6 (85.0, 76.7) | **1.411** | 7.3–23.5 |

On this Xeon host, under that load, a complete season on revision 11 takes about 1.4–1.8× revision 10's engine time. Two repetitions give no interval; the direction held in every pair. Throughput is reported, not a gate (→ARCH-31); revision 11 also credits every fixture's actions with the players' places (→MATCH-16), not only the own match.

### Century workloads

The first two benchmark runs exposed two workload faults older than this task, both in the benchmark's owner actions: the active-management profile loaned the scout's first listed player, now a free agent whom the game refuses to loan (→CLUB-49/50), and it adopted a new design every season, whose −20 팬 민심 (→KIT-9, OWNER-12) forced the owner out (구단주 퇴진, →OWNER-13) in season 3 on revision 10 and before season 20 on revision 11 (a scratch replay of the same workload printed 팬 민심 by season). The owner now bids for the scout's first club player on loan and adopts a design only while 팬 민심 is at least 50, twice the floor after the drop; the scope line reports the edits made. `scripts/season-throughput.ts` and `scripts/match-model-baseline.ts` carried the same loan.

A third fault ended every long career on revision 11: an owner who moves no money pays living costs that grow with prices out of a fortune that does not (→OWNER-8), so both centuries and the era probe ended in 구단주 파산 between their 31st and 40th seasons (the benchmark then threw "Missing completed season archive", and the era probe failed its 2024 gate). A scratch replay of the baseline century ended `owner` at its 36th close (1986): fortune 5.0 B → −77.8 M, falling 44–51 M a season at first and 134–190 M a season in the 1980s, while the club held 324 M in cash and 팬 민심 stood at 64. No checkpoint exceeded a limit before that. Both centuries and the era probe now stake the owner's whole fortune in his business from the takeover through the real `owner-stake` command (→OWNER-7), which keeps the fortune near prices without the 팬 민심 a dividend costs (→OWNER-12); the stake adds eleven business events a season, so the checkpoints measured are larger, not smaller. Limits, retained facts and the material kept are unchanged.

### Settlement, staging, grid and fixture re-read

`node scripts/perf/ab.mjs --workload <w> --base . --cand . --json artifacts/benchmarks/T838/final-<w>-aa.json` with the runner's defaults and seed perf-261027, A/A on this commit (`TMPDIR` in the session's scratch). Both sides bundle byte-identically and give identical output hashes in every workload. Medians are main-thread CPU and wall in ms; the wall/CPU gap is the shared load. These are this machine's figures; T837's M1 Max figures above are context only (→ARCH-34).

| Workload | CPU median A / B | Wall median A / B | Pairs | A/A CPU ratio [95%] | Load 1 min |
|---|---:|---:|---:|---|---|
| own-match (revision-11 settlement: record, script, material) | 140.69 / 139.25 | 265.36 / 294.05 | 96 | 0.9941 [0.9655, 1.0276] | 13.9–20.9 |
| grid-own (the grid's own match, revision 10) | 463.32 / 444.89 | 1252.03 / 1109.52 | 48 | 0.9931 [0.9511, 1.0248] | 23.4–30.8 |
| fixture (one aggregate fixture) | 11.86 / 12.00 | 32.57 / 32.26 | 96 | 1.0659 [0.9600, 1.1706] | 20.9–23.4 |
| staging (full production `stageAll`, the whole match) | 13350.36 / 13728.39 | 20997.96 / 22857.55 | 24 | 1.0242 [0.9866, 1.0803] | 16.6–35.9 |

### Capacity, partial (→SAVE-4, ARCH-31)

`pnpm run benchmark --phase <name>`, its five independent phase chains side by side (`retained`, `activation`, `baseline-1 → -2 → -checkpoints`, `active-management-1 → -2 → -checkpoints`, `era-1 → era-2`), on the staking workload at ffd270b5 (state `.tmp/benchmark/38f7f2b7f5794756`, started 04:20 UTC; the earlier run on state `029821328bb12dd4` is superseded by the workload fix above). Finished when this section was written: `retained` (361 s, worst checkpoint 837,206 bytes, "marked synthetic retained career and cross-season promise") and `activation` (447 s, a pre-release career taken over in 1950 and activated by the worker host's writer load mid-season after ten seasons, worst 1,284,556 bytes two seasons later), both within the 6 MiB checkpoint and 8 MiB portable limits, and `era-1` (3,251 s, 1950–1988). At 05:19 UTC both centuries had passed their 40th season, beyond the old failure window (baseline 7,984 retained people, active-management 8,160 and 16 tenures), and `era-2` was running. The century halves, their checkpoints, the era probe's second half and the report were still running under the shared load (15–17 minutes per ten seasons); **no capacity verdict is claimed**. Once every chain has ended, `pnpm run benchmark --phase report` assembles them.
