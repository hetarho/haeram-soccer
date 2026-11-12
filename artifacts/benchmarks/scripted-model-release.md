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
