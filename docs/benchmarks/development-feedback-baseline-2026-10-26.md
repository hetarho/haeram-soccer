# Development feedback baseline — 2026-10-26

> Historical reconstruction only; snapshot `2e61d6e97dc50d9de2c995c1e75ec4b5ba2079be`. Human-facing timestamps use Asia/Seoul (UTC+09:00). No benchmark, simulation, browser journey or test body was executed to produce this document.

## Purpose

Preserve a baseline for later architectural improvements and a technical-blog case study. The objective is to reduce avoidable rebuilds, repeated setup and verification coupling while retaining correctness. There is no one-hour completion target. Append later observations from normal work using the same definitions; do not silently replace these historical values.

## Evidence levels and limits

- **Git interval:** difference between the two explicitly named commit **committer** timestamps (`%cI`). It is an observed checkpoint interval, not active coding time. Work before the first commit, breaks, hand-offs and parallel work cannot be recovered from it. Author timestamps are not used.
- **Recorded command duration:** `finishedAt − startedAt` from a work snapshot already committed to Git. It measures the complete recorded shell command, including install/check/build/browser steps named by that command, not just test execution.
- **Artifact duration:** an existing runner’s `elapsedMs`/`elapsedSeconds`; its timer scope can differ from shell duration. Structured artifacts take precedence over rounded report prose.
- **Report value:** copied from an existing human-written result/report, with its rounding and uncertainty preserved. CI timings below were not fetched again.
- **Structural snapshot:** dependency counts preserved from the preceding read-only review at the same commit. These counts are not runtime measurements.
- Missing cold/warm cache information, failed attempts, exact active-model time and queue subdivisions are **unknown**, never assumed zero. Source files were read with `git show <snapshot>:<path>`, so concurrent uncommitted changes are excluded.
- The collection snapshot identifies which version of the historical records was read. It does not mean every benchmark executed on that commit; retain each artifact's own execution source and environment.

## Retained workflow sample

The [versioned work snapshot](../../spec/work/v9n4-release.json) was recorded at `2026-10-25T04:35:28.540Z`, source commit `a7135c1f1eb930840bb2a018a9be791d058cf4e4`. It retains 16 attempts: 15 integrated units and one released, non-integrated T427 attempt. T421/T422 form one unit. This is a bounded sample from Oct 24–25, not all project tasks; later T286/T457/T458 work is outside this snapshot. Worker/reviewer metadata records Claude Code 2.1.310 with no explicit model identifier. Do not infer model settings from the current Codex installation.

| Retained metric | Count / value | Meaning |
| --- | --- | --- |
| Integrated-unit elapsed median | 105.264 min; n=15 | Claim creation → recorded integration completion; includes implementation, checks, review and waiting |
| Retained task-check median | 125.339 s; n=15 | Latest retained successful command per integrated unit; not all historical retries |
| Full integration gate median | 1075.000 s (17.917 min); n=13 | Install + unit/contract/catalog/build + Chromium |
| Full integration gate total | 13991.299 s (233.188 min) | Sum of 13 recorded command durations, not one task’s time or claimed avoidable waste |
| Full integration gate range | 1008.747–1215.310 s | Same gate category, different source trees/workloads |
| Fast integration gate median | 30.077 s; n=2 | T444/T445: install + type/lint/format; full gate moved to group completion |

The full and fast gate cohorts execute different checks on different tasks. Their difference is **not** an apples-to-apples speedup, a measured removal of waste, or proof that full verification can be dropped. Task-check duration is contained in claim→submit; final-gate duration is contained in submit→completion. Do not sum a column with its containing interval.

### Per-unit intervals

Time values are calculated from retained timestamps; displayed clock times omit milliseconds. “Claim→submit” includes preparation, implementation, rework and checks. “Submit→complete” includes review, queueing, integration and its final gate.

| Unit | Claimed KST | Claim→submit (min) | Task check (s) | Submit→complete (min) | Final gate (s) | Total (min) | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T415 | 10-24 19:04:39 | 10.460 | 88.677 | 20.556 | 1027.704 | 31.016 | full + Chromium |
| T421, T422 | 10-24 19:04:40 | 126.540 | 31.051 | 45.784 | 1215.310 | 172.324 | full + Chromium |
| T416 | 10-24 19:35:42 | 92.744 | 51.189 | 19.858 | 1011.522 | 112.602 | full + Chromium |
| T417 | 10-24 19:35:44 | 12.045 | 58.671 | 20.378 | 1059.563 | 32.423 | full + Chromium |
| T418 | 10-24 19:35:46 | 33.441 | 56.604 | 22.432 | 1013.005 | 55.873 | full + Chromium |
| T419 | 10-24 19:47:48 | 23.272 | 73.643 | 42.116 | 1008.747 | 65.388 | full + Chromium |
| T420 | 10-24 21:28:21 | 117.109 | 125.339 | 25.717 | 1074.647 | 142.826 | full + Chromium |
| T426 | 10-24 23:51:13 | 151.773 | 411.476 | 31.282 | 1092.825 | 183.055 | full + Chromium |
| T436 | 10-25 01:13:30 | 14.101 | 172.914 | 19.011 | 1137.546 | 33.112 | full + Chromium |
| T431 | 10-25 02:54:23 | 22.864 | 235.111 | 55.315 | 1114.280 | 78.180 | full + Chromium |
| T441 | 10-25 03:17:15 | 105.974 | 146.485 | 26.269 | 1081.561 | 132.243 | full + Chromium |
| T442 | 10-25 05:29:32 | 79.392 | 148.912 | 24.831 | 1079.589 | 104.223 | full + Chromium |
| T443 | 10-25 07:13:48 | 117.191 | 31.562 | 27.676 | 1075.000 | 144.867 | full + Chromium |
| T444 | 10-25 09:38:43 | 104.225 | 154.034 | 8.144 | 30.613 | 112.368 | fast only |
| T445 | 10-25 11:31:05 | 96.745 | 152.471 | 8.518 | 29.541 | 105.264 | fast only |

Units overlap in time. Adding all task totals would double-count parallel work and would not yield elapsed project time. The latest retained review/check arrays may omit earlier attempts; this table is not a complete retry-cost ledger.

### Why commit timestamps alone miss verification

For T415, integration candidate `2737e84a` was committed at **2026-10-24 19:18:31 KST**; its recorded verification ran from **19:18:31.635 to 19:35:39.339**, and integration completed at **19:35:40.665**. Stopping at the merge-commit timestamp would omit approximately 17 minutes of verification. This creation-before-validation pattern is present in this work snapshot. An “Integrate” subject is not sufficient evidence that validation had finished at that timestamp.

## Git checkpoint intervals

These use only existing committer timestamps. The checkpoints have deliberately different meanings, shown in each row; do not average them as equivalent task durations.

| Observed window | Start commit | Start KST | End commit | End KST | Elapsed (min) |
| --- | --- | --- | --- | --- | --- |
| T426: planning → integration candidate | `90a2078a` | 10-24 22:24:28 | `60072b02` | 10-25 02:36:03 | 251.583 |
| T437: WIP → integration candidate | `c3651c5b` | 10-25 15:20:54 | `7daa6f77` | 10-25 15:25:17 | 4.383 |
| T457 (then T450): task creation → done note | `4a8c03dc` | 10-25 21:06:53 | `ba6e2a75` | 10-26 00:02:44 | 175.850 |
| T286: resumed branch → result note | `7abef41f` | 10-26 00:04:21 | `8a92cf7e` | 10-26 05:30:07 | 325.767 |
| T458: creation note → last observed fix | `8830010a` | 10-26 05:58:04 | `605e985f` | 10-26 09:12:04 | 194.000 |

- T426 begins at a planning change, before the retained work claim.
- T437’s 4.383-minute Git interval is a late WIP→integration window. Its [task result](../../spec/tasks/done/T437.recalibrate-after-carry.md) separately reports exploration from 13:18 to 15:05 KST (107 minutes); the short Git interval is not its implementation time.
- T457 was still named **T450** in these commits and its raw artifacts. It was renamed after a number collision; retain original IDs when resolving historical evidence.
- T286’s 325.767-minute interval covers a resumed release effort and its measurements/documentation, not one isolated command. Its result still left batch/CI items open.
- T458’s endpoint is the last fix visible at this snapshot, not final CI success. Its 194-minute interval can include hand-off, downtime and CI waiting.

## Existing simulation and storage timings

All durations below were already stored in Git. The T286 runner artifacts record Apple M1 Max, 10 logical CPUs, Darwin arm64, Node v26.8.1, pnpm 10.34.6, TypeScript 5.9.3 and tsx 4.23.15. The full runner uses 200 timing fixtures, 10 warm-ups, 3 repetitions and 100 seasons for each of two profiles. A runner’s complete elapsed duration is not a single-season time.

| Existing run | Artifact elapsed (s) | Artifact elapsed (min) | Source |
| --- | --- | --- | --- |
| T286 baseline runner, pre-change comparison source | 2235.121 | 37.252 | [baseline-9f69553-100.json](t286/baseline-9f69553-100.json) |
| T286 candidate before T457; noisy, budget failure | 4483.053 | 74.718 | [candidate-100-f5fc5c09.json](t286/candidate-100-f5fc5c09.json) |
| T286 first post-T457 candidate; noisy | 3444.644 | 57.411 | [candidate-100-cb64026c-1.json](t286/candidate-100-cb64026c-1.json) |
| T286 final candidate; quiet release evidence | 3186.089 | 53.101 | [candidate-100.json](t286/candidate-100.json) |
| T286 final storage benchmark; sum of phase timers | 5004.310 | 83.405 | [T286-full-model-storage.json](T286-full-model-storage.json) |

The final candidate records `load1Median=1.73`, `load1Max=3.33`; the earlier post-T457 run records `load1Max=25.42`. These runs establish historical costs and a rerun, but their timing difference is not a controlled optimization result because contention differed. The pre-T457 candidate also differs in source and records `load1Max=8.21`. The comparison baseline uses an older summary-model source; it is not an after-version of the candidate.

The T286 result prose records two `pnpm run benchmark` shell durations of **5,788 s** and **5,025 s**, with runner fingerprints `2012e0b33c36` and `cea9a6f52ea3`. The final structured storage artifact records **5,004.310 s** as the sum of phase timers. Preserve all three with their scopes rather than making them appear contradictory or treating the rounded shell time as the exact phase-time sum.

### Final storage benchmark phase breakdown

| Phase | Recorded internal elapsed (s) | Minutes |
| --- | --- | --- |
| retained | 53.980 | 0.900 |
| activation | 128.475 | 2.141 |
| baseline-1 | 642.103 | 10.702 |
| baseline-2 | 716.342 | 11.939 |
| baseline-checkpoints | 575.906 | 9.598 |
| active-management-1 | 611.072 | 10.185 |
| active-management-2 | 727.747 | 12.129 |
| active-management-checkpoints | 597.073 | 9.951 |
| era-1 | 453.047 | 7.551 |
| era-2 | 498.565 | 8.309 |

The ten phase timers sum to **5004.310 s**, exactly the artifact's `elapsedMs`. The [report assembler](../../scripts/benchmark.ts) computes this field by summing phase durations; it is not an independent whole-process wall timer and does not include gaps between separately executed phases. The published artifact labels its source verification as an uncommitted working tree; preserve its source fingerprint/provenance instead of presenting it as a clean committed execution.

### Existing parity measurement

| Measurement | Recorded duration | Source field |
| --- | --- | --- |
| T401 part B | 3636.5 s | provenance.parts[0].elapsedSeconds |
| T401 part T | 4040.8 s | provenance.parts[1].elapsedSeconds |
| T401 combined parts | 7677.3 s (127.955 min) | speed.elapsedSeconds |

Source: [match-parity.json](match-parity.json), source commit `5abb70a2`, Apple M1 Max, Node v26.8.1, jobs=8 in retained part commands. The artifact reports 26 conditions and 446,354 samples per path. The combined elapsed field sums parts; it is not proof of an identical continuous wall-clock window. Retained reports explicitly call this a shared, loaded machine.

## A previous optimization already has before/after evidence

This is historical **T457** optimization (original raw name T450), not a result of the architectural review or a future proposed fix. Raw [throughput.json](t450/throughput.json) retains per-season samples, commands, load data, source identities and digest comparisons. Reference machine: M1 Max, 10 logical CPUs, 32 GiB, Darwin arm64, Node v26.8.1.

| Metric | Historical before | Historical after | Calculated change |
| --- | --- | --- | --- |
| 80-season median engine time | 18,840 ms | 14,206 ms | 24.60% less time |
| 80-season p90 engine time | 22,899 ms | 15,204 ms | 33.60% less time |
| 80-season maximum engine time | 26,045 ms | 16,933 ms | 34.99% less time |
| 80-season command elapsed | 1490.992 s | 1107.187 s | 25.74% less time |
| Seasons over 15 s | 65 / 80 | 13 / 80 | Counts, not an independent gate verdict |
| NPC fixture median | 0.744812 ms | 0.681417 ms | 8.51% less time |

The series run metadata names engine `4a8c03dc` before and `0b50961f` after; the artifact’s broader commits metadata also names `3ab25c44`/`6b2d5e55`. Some before-run records describe restoring the old engine while other working-tree files were dirty. Do not collapse these identities into a claim that both measurements ran from clean Git trees. The retained artifact reports identical kept worlds (`series.keptWorldsIdentical`); world comparisons and record/digest checks are the correctness evidence. Load and process noise remain experimental limits. **14,206 ms**, not 18,840 ms, is the latest retained value from this experiment for future comparisons.

### Retained late-season profile

The [after profile](t450/profile-after.json) sampled season 61; total sampled profile duration was 15,773 ms. The following are **inclusive** times and overlap. Player attribution belongs inside aggregate processing, so adding these percentages is invalid.

| Function | Inclusive sampled time (ms) | Share of profile |
| --- | --- | --- |
| simulateSeason src/index.ts | 14662 | 93.0% |
| simulateAggregate aggregate/engine.ts | 8409 | 53.3% |
| playGrid grid/engine.ts | 4793 | 30.4% |
| attributePlayerFacts aggregate/players.ts | 4045 | 25.6% |

This identifies where computation was spent then; it neither proves all that work is avoidable nor measures hot paths at the current snapshot. Normal unobserved simulation already skips playback-frame construction.

## Existing CI/report observations

| Observation | Recorded value | Evidence and limit |
| --- | --- | --- |
| Chromium CI job before/after model release | 21.4 → 32.7 min | Run IDs 40214850068 → 40243569140; rounded report values, workload/source changed |
| Local Chromium journey run, T435 integrated | 274 passed; 15.7 min | Report associates this with group gate 4b8c42af; do not call this entire gate duration |
| Local unit stage, T458 integration | 2,141 passed + 4 skipped; 6.6 min | Report at 9e54c848; stage-specific, rounded |
| Local Chromium stage, T458 integration | 274 passed; 15.8 min | Same report; stage-specific, rounded |
| Changed-file checks, T435 | 226 files; 1,787 passed + 4 skipped | Count only; exact duration not retained in that report |

Source: [261026-k5n2 report](../../spec/reports/261026-k5n2.md), especially checks and parked sections. The report states that a later main CI run queued behind an earlier one; the queue duration is **not recorded here** and is not estimated from adjacent commits. Browser-job time includes browser/engine work and retries where applicable; it is not pure browser-rendering time.

## Test-suite coverage and latest retained duration records

Follow-up inspection on 2026-10-26; existing records only, with no new test execution. There is **no established latest whole-suite duration** for the current release plus all three browser projects. Keep the following scopes separate; they come from different executions and must not be added into a purported measured total.

| Scope | Latest relevant retained duration | Execution/source | Qualification |
| --- | --- | --- | --- |
| Complete unit suite | About 6.6 min (396 s) | Oct 26 report, integration candidate `9e54c848`; 2,141 passed + 4 skipped | Rounded report value on the M1 Max reference environment; includes integration-style cases currently classified as unit |
| Standalone integration suite | Not separately recorded | No `test:integration` script/project in the snapshot | Host/storage/progression integration cases currently run inside `test:unit`; `test:contract` is a different scope |
| Contract suite | Wrapper 32.941 s; Vitest 31.60 s | Local retained check recorded Oct 24 02:54:42.662 KST, tree `16ac4b99`; 3 files / 39 passed | Older source and environment than the Oct 26 M1 Max report; not a current same-machine timing |
| Complete Chromium E2E suite | About 15.8 min (948 s) | Same Oct 26 report and candidate `9e54c848`; 274 passed | One browser only, not all Playwright projects |
| Chromium CI job | About 32.7 min | Run `40243569140`, Oct 26 report | CI job/report scope; includes different machine/load/setup/retry conditions; not local E2E time |
| Firefox CI job | About 29.6 min | Same report; `season-flow:135` failed before the later fix | Not a complete successful all-browser baseline |
| Local unit + contract + catalog/build + Chromium batch | 17 min 55 s median; n=13 | Oct 24–25 archived work attempts above, before the final released-model runs | Historical gate median, not the latest `9e54c848` gate and not three-browser `verify` |
| All-browser E2E, older successful full run | About 19.2 min | Oct 17, T179, 545 passed + 4 skipped | Older engine/test scope; cannot stand in for the current three-browser total |
| Current complete `pnpm run verify` | Not found | No completed current-source one-command duration in the inspected records | Do not substitute a partial/failing run, an older run or a sum across machines |

The latest same-candidate report's rounded unit and Chromium stage times sum to **about 22.4 min (22 min 24 s)**. The configured local batch runs these stages sequentially, with contract/catalog/build and other checks in addition. This sum is a **partial subtotal derived from rounded stage reports**, not a measured whole-gate duration. It also excludes Firefox and WebKit. It explains why the earlier historical 17 min 55 s median must not be presented as the current complete test cost.

Command topology at the collection snapshot: `test:unit` runs Vitest excluding contract-named files; `test:contract` selects those contract files; `test:e2e` runs every Playwright project (Chromium, Firefox, WebKit); `verify` sequentially runs typecheck/lint/format, unit, contract, catalog/presentation validation, build, then `test:e2e`. CI instead runs checks, three unit shards and per-browser E2E jobs in parallel. CI wall time includes queue/setup and is governed by the slowest required job, not the sum of every job. Neither local `verify` nor the regular CI workflow includes the manually requested century storage benchmark.

### Additional retained raw-log evidence

The following successful standalone checks were found in the local runtime registry `.git/haeram/v1/checks.json`. They were not committed source artifacts when inspected, so their identifying metadata and summary excerpts are preserved here. The registry's `at` is reported as a recorded timestamp, not assumed to be the command's start. Machine details are absent from these entries; do not identify them with the M1 Max report by assumption.

| Command | Recorded timestamp KST | Wrapper duration | Test-runner duration | Result / source identity |
| --- | --- | --- | --- | --- |
| `pnpm run test:unit` | 2026-10-24 02:54:09.666 | 453.304 s | 451.83 s | 265 files; 1,967 passed + 4 skipped; tree `16ac4b99e72ec25bec89e755f3acea03609e3c21` |
| `pnpm run test:contract` | 2026-10-24 02:54:42.662 | 32.941 s | 31.60 s | 3 files; 39 passed; same tree |

Both entries identify batch scope for T384 and diff base `014e87b1f9a9e21fe90ecadb39531e7d7d2892be`. Their retained log summaries are:

```text
unit:     Test Files 265 passed (265)
          Tests      1967 passed | 4 skipped (1971)
          Duration   451.83s
contract: Test Files 3 passed (3)
          Tests      39 passed (39)
          Duration   31.60s
```

Local raw logs: `.git/haeram/v1/logs/check-bd9a110b-0cef-4b17-ad49-4d0f3fda56ba.log` (SHA-256 `bc9562cbf85bd36220eefc97720da8c7a2caf3274269f618ced69b29dfb00e1c`) and `.git/haeram/v1/logs/check-85fdbe1b-2afe-4fe0-8758-a344f63341c0.log` (SHA-256 `076c67e8571f074e5cc2433984dd4a558c1ed1c2e11b401741bff800f27abbef`). The 474-entry runtime registry at inspection contained no command with `pnpm run verify` and no complete unfiltered `test:e2e` record. That registry is not a complete inventory of all commands ever executed, so absence there does not establish that the suite was never run.

### Cold/warm unit experiment is a shard-duration sum

[T420's recorded result](../../spec/tasks/done/T420.release-on-unit-tier.md), at `1b6b9b57`, also retains four 8-shard runs on M1 Max / Node v26.8.1: switch-off cold **314.7 s**, switch-off warm **218.8 s**, release-on cold **577.7 s**, release-on warm **336.7 s**. The result explicitly calls these **sums of the eight Vitest Duration values**, not independently measured elapsed time for a parallel whole-suite invocation. Preserve the reported sums and rounding as written. Background load was 3–11 and cache state was explicitly controlled; these values should not be substituted for the newer unsharded 6.6-minute report.

The old all-browser result is versioned in [T179-rules3-integration.json](T179-rules3-integration.json), `localVerification.browserResult`: 545 passed, 4 skipped, zero failed, `elapsedMinutes=19.2`. Its non-browser `verify` stages had already completed when the default preview port was occupied, and the browser stage resumed separately. There is no single combined elapsed value there. Local `.tmp/full-e2e-final*.log` files also exist, but their Oct 16 runs were interrupted or failed; their short/partial durations were excluded as whole-suite success evidence.

## Structural baseline and future comparison ledger

The preceding [architectural review](../../spec/review/development-feedback-261026.md) analyzed committed snapshot `2e61d6e9`: 749 source files, 280 test files, 79 engine modules in the largest strongly connected value-import component; `grid/shape.ts` reaches 222 test files including 60 web files. Type-only and dynamic imports were excluded. A separate working-tree `vitest list` also selected 222 files; that changed set included multiple T432 files, so it must not be described as a single-file experiment. These are dependency/selection counts, not measured test-body runtimes. No new graph scan or test collection was run for this document.

| Improvement area | Retained baseline | Later value | Comparison rule |
| --- | --- | --- | --- |
| Movement-change dependency reach | 222 / 280 test files; 60 web | Not recorded | Same entry file and static graph algorithm; report total suite growth separately |
| Engine circular dependency component | 79 modules | Not recorded | Same value-import analysis, exclude type-only edges; retain exact source commit |
| Task verification duration | Per-unit table; aggregate median 125.339 s | Not recorded | Same command scope; record selected counts, cache condition and rework separately |
| Full integration gate duration | n=13; median 1,075.000 s | Not recorded | Retain equivalent required coverage; avoid comparing it directly with fast-only checks |
| UI-only edit invalidating simulation cache | Overbroad key confirmed in code; miss count/time unknown | Not recorded | Use naturally occurring run logs; record fixture-builder identity and cache hit/miss when available |
| Manager-history UI fixture setup | About 25 s in [existing test comment](../../tests/e2e/manager-history.spec.ts); repetitions not counted | Not recorded | Separate Node setup from browser actions; fixed fixture and browser/viewport scope |
| 100-season storage benchmark | 5,004.310 s sum of phase timers; phase table above | Not recorded | Same world seeds, workload, codec/data requirements and timer scope; compare provenance |
| Baseline-profile season engine median | 14,206 ms after the historical T457 optimization; 80 seasons | Not recorded | Same representative worlds, machine/toolchain and full-record behavior; preserve digest equality |

Recommended later observations can come from ordinary task execution and already-produced artifacts. This ledger does not require an immediate long rerun. Record a cache experiment as cold/warm only when those conditions were actually established. A source/data/version change needs an explicit comparability note. Never infer active coding time, model latency or cache savings by subtracting unrelated totals.

## Provenance and recalculation

Every versioned value above is frozen to `2e61d6e97dc50d9de2c995c1e75ec4b5ba2079be`. The following are SHA-256 hashes of the source bytes returned by `git show 2e61d6e97dc50d9de2c995c1e75ec4b5ba2079be:<path>`; relative links open current files for convenience, whereas the snapshot/hash identifies the historical evidence. The preceding architectural review was an uncommitted document when this baseline was assembled; its observations are labeled separately above.

| Versioned source | SHA-256 |
| --- | --- |
| `spec/work/v9n4-release.json` | `9490a4e4556ab226f7e7267c8e747abbdcff9051a8ad449d5be1801388695f82` |
| `docs/benchmarks/t450/throughput.json` | `bd09e9ada241b05f6ebc3cd59ff4f65d077b830ef481dd8dd09683bf4a7cc613` |
| `docs/benchmarks/t450/profile-after.json` | `3f03c9f35157201e8f7a9b3e0233622c9db94b7f4f50dfe37034772f06140c21` |
| `docs/benchmarks/match-parity.json` | `435df0583e9f22aabe4c84e275fc61da3597f88aaa4fa26efed05ba1398459b4` |
| `docs/benchmarks/t286/baseline-9f69553-100.json` | `f967bc97d45c8f363d2c2123f17fed0a2331cdb52b6ff452af2085e26b6d43ee` |
| `docs/benchmarks/t286/candidate-100-f5fc5c09.json` | `7a096d04c7738bd7ed00fe53715933a333fe8ded06fe050287b8d805920d8959` |
| `docs/benchmarks/t286/candidate-100-cb64026c-1.json` | `ac2239d00776df0558803633e877e55d9434c374985f00c2214726f870b30635` |
| `docs/benchmarks/t286/candidate-100.json` | `9395975ed1cc10d8ca3ec896889ae76950608a02f88cc3df3dba6dde36582701` |
| `docs/benchmarks/T286-full-model-storage.json` | `863108bacaaae9ec161ad72327755de365c868a47d7e26883b53bff2ad2c3f56` |
| `spec/reports/261026-k5n2.md` | `453db9cb35f5788a290d2039bb5494b2d92417183f85384c48f6a589a93ab5cd` |
| `spec/tasks/T286.full-model-activation-and-release-gates.md` | `10ab9839f21a20dc7913f018554a15f6f754da644abbbf3e31a5777e5d8cb347` |
| `scripts/benchmark.ts` | `f6f0ba1bf5f282aede989a492ffd095b4bd75d65109671fcd674d9126567ef0e` |
| `tests/e2e/manager-history.spec.ts` | `710d1167e5e3a137aac1e8654c32a77412b544f8267ca5ab1b215a931fe833a0` |
| `spec/tasks/done/T437.recalibrate-after-carry.md` | `353205f2a52e66f1d9053535b9fd0a07c74d5fca1035b30686fb2bcdcc6a0f63` |
| `spec/tasks/done/T420.release-on-unit-tier.md` | `574e0579b1ede97362e5e15511001198c9e22423db4935d9160d947f00192e5e` |
| `docs/benchmarks/T179-rules3-integration.json` | `60dbb7160b3e401151592cbfd5d72b6cb0b6866bd80a9f1ee496fde45535d323` |

### Unit-to-commit identities

| Unit | Attempt ID | Verified code commit | Integration candidate commit | Recorded completion KST |
| --- | --- | --- | --- | --- |
| T415 | `db179536-4a9f-4d6c-9eaa-d9c18b2af865` | `91d2f6c0` | `2737e84a` | 10-24 19:35:40 |
| T421, T422 | `3a125fec-eb81-49f4-8796-14688f5ff1d1` | `75c3e1b8` | `879f0432` | 10-24 21:57:00 |
| T416 | `cb8f4011-c362-4baa-9208-b06e471ca337` | `638407bb` | `18db8f59` | 10-24 21:28:18 |
| T417 | `138003fd-55f5-4585-989a-d711c6916372` | `ce152a9b` | `fada6e6d` | 10-24 20:08:10 |
| T418 | `3cbc46d9-86be-4097-9a47-ef920fe9b0b2` | `e04a04aa` | `e2f0dddc` | 10-24 20:31:38 |
| T419 | `12007006-d7e0-4fdc-8b46-31b557432d56` | `f3307678` | `58e259bd` | 10-24 20:53:11 |
| T420 | `bf1b0cf3-5b54-4080-be87-14a2f54141b8` | `1b6b9b57` | `2f8d95af` | 10-24 23:51:10 |
| T426 | `c5718a8f-acf7-488c-a840-7c23a953237d` | `1abaa250` | `60072b02` | 10-25 02:54:16 |
| T436 | `b44f488f-718a-42a6-825f-c1c9b2c21c21` | `352063a0` | `1e060b3b` | 10-25 01:46:36 |
| T431 | `c50d2e45-b255-4c43-9091-8f4c2729a66c` | `43a38481` | `8ac4426b` | 10-25 04:12:33 |
| T441 | `3ef6ccf6-e038-44fe-acd0-020b94749c2d` | `e117822d` | `8e67ed0b` | 10-25 05:29:29 |
| T442 | `f083e042-f29b-4190-813d-97d111a384fb` | `12c873be` | `09621a66` | 10-25 07:13:45 |
| T443 | `63ff57c1-3a73-48e0-a086-bdab973a7532` | `c9e2bb77` | `02d6355a` | 10-25 09:38:40 |
| T444 | `68434180-9531-4e3c-9d35-152266d150ed` | `07e71542` | `9c16eb1a` | 10-25 11:31:05 |
| T445 | `800de184-ec09-48a8-9ac4-a7efb3ae7b45` | `d546ef57` | `a7135c1f` | 10-25 13:16:21 |

### Exact Git checkpoint identities

- `90a2078acad577f42b0dbbd1fd58eb52ec456802` — 2026-10-24T22:24:28+09:00 — docs(spec): MATCH r25 the player on the ball takes it in stride; T426 before T286
- `60072b0223c9acfd78a4147d5a9c8a56118a09bf` — 2026-10-25T02:36:03+09:00 — Integrate T426 into v9n4-release
- `c3651c5bd6af6d094db8484f7bcfbda3b258842b` — 2026-10-25T15:20:54+09:00 — WIP T437: recalibrate the candidate's scoring after the carry and the final-third rework
- `7daa6f779a6f0d9ea893d1d5d6c47292b0428f74` — 2026-10-25T15:25:17+09:00 — Integrate T437 into v9n4-release
- `4a8c03dcb0a6227ab58028d5452e881173214891` — 2026-10-25T21:06:53+09:00 — docs(spec): create-task T450 (v9n4) — candidate season throughput before T286; T286 dep + T450
- `ba6e2a7597dd21da583a6ee491a5d147923caccf` — 2026-10-26T00:02:44+09:00 — docs(spec): T450 done — candidate seasons 18.84 → 14.21 s, digests unchanged; T286 resumes
- `7abef41f729ede196a7cc7e2d863e3f4dfe8bd0f` — 2026-10-26T00:04:21+09:00 — Merge work/v9n4-release into T286 (T437, T446, T447, T450)
- `8a92cf7e89f952c4cf668c2c50dc9531b33b5ad2` — 2026-10-26T05:30:07+09:00 — docs(spec): T286 result — released, gates pass quiet after T450; batch, CI and part T stay open
- `8830010a073de358dec3d20ebbb99ca7140e9c1d` — 2026-10-26T05:58:04+09:00 — docs(spec): v9n4 hand-off — T286 integrated, group gate failed 11 Chromium journeys; create-task T458 before T286 closes
- `605e985f1858408421d1059a0ffe4b7f4d0fd45e` — 2026-10-26T09:12:04+09:00 — T458: journeys survive a match eve opening mid-click on slow CI

### Minimal recalculation without running the application

```python
import json, statistics, subprocess
from datetime import datetime

ref = "2e61d6e97dc50d9de2c995c1e75ec4b5ba2079be"
data = json.loads(subprocess.check_output(
    ["git", "show", f"{ref}:spec/work/v9n4-release.json"], text=True))
def seconds(a, b):
    parse = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
    return (parse(b) - parse(a)).total_seconds()
full = []
for attempt in data["attempts"]:
    if not attempt.get("integratedAt"):
        continue
    entries = attempt.get("integrationVerification", [])
    if any("playwright" in entry["command"] for entry in entries):
        full.append(sum(seconds(entry["startedAt"], entry["finishedAt"])
                        for entry in entries if entry.get("finishedAt")))
print(len(full), round(sum(full), 3), statistics.median(full))
# 13 13991.299 1075.0
```

For a Git checkpoint: `git show -s --format='%H %cI %s' <sha>` and subtract the two parsed `%cI` timestamps. All calculations here are file/metadata processing. No new behavioral validation or performance claim is implied.
