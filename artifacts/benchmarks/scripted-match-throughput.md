# Scripted-match throughput — T837

The retained writer changes reduce this own fixture’s settlement from 160.46 to 44.36 ms main-thread CPU; the paired ratio is 0.2735 [0.2653, 0.2827]. The record, script, material and frozen staging inputs have the same digest. Complete raw motion falls from 14762.10 to 3553.54 ms, ratio 0.2389 [0.2358, 0.2428], with every raw frame/event unchanged.

**Full production staging has no passing timing or digest:** `stageAll` throws on baseline and candidate while recounting a minute prefix. Raw motion is diagnostic evidence and does not satisfy that missing end-to-end measurement. The two-hour exploration exits with this release prerequisite explicitly open for T838.

## Final paired measurements

Times are milliseconds, median [95% interval]. CPU is the primary clock; wall is context. The last column is the sampled host load average over each run, not CPU utilization.

| Workload | Baseline CPU | Final CPU | Baseline wall | Final wall | Paired CPU ratio [95%] | Load 1 min |
|---|---|---|---|---|---|---|
| Own settlement | 160.46 [157.24, 163.11] | 44.36 [42.78, 45.26] | 161.47 [158.32, 164.70] | 45.43 [44.22, 46.15] | 0.2735 [0.2653, 0.2827] | 8.74–10.24 |
| Raw motion, diagnostic | 14762.10 [14573.35, 15019.24] | 3553.54 [3441.78, 3607.12] | 15317.27 [14911.88, 15994.31] | 3642.04 [3477.48, 3862.66] | 0.2389 [0.2358, 0.2428] | 4.76–78.03 |
| First production minute | 530.70 [518.18, 540.78] | 126.66 [123.60, 131.27] | 535.53 [520.37, 546.99] | 128.37 [124.26, 134.16] | 0.2360 [0.2327, 0.2401] | 7.22–15.46 |
| Grid own, unobserved | 106.26 [104.98, 107.85] | 106.80 [105.44, 110.14] | 106.53 [105.25, 108.14] | 107.07 [105.71, 110.48] | 1.0020 [0.9942, 1.0140] | 11.52–13.54 |
| Grid own, with buildFrames | 220.39 [210.34, 226.23] | 222.16 [212.14, 229.51] | 224.11 [214.67, 237.43] | 228.70 [215.50, 246.61] | 0.9928 [0.9458, 1.0342] | 10.57–15.12 |
| One aggregate fixture | 3.39 [3.26, 3.65] | 3.45 [3.29, 3.58] | 3.47 [3.31, 3.72] | 3.46 [3.34, 3.66] | 0.7084 [0.4761, 1.0953] | 14.14–14.15 |
| Production stageAll | unavailable: prefix ledger error | unavailable: same error | unavailable | unavailable | no verdict | see logs |

The picture has 94 represented match minutes: 90 regulation plus 2+2 added, 1,780 beats and 22 participating lines. Diagnostic raw motion costs **37.80 ms CPU / 38.75 ms wall per represented minute**; its CPU interval is [36.61, 38.37] ms/minute. For a 90-minute normalization it is 39.48 ms CPU/minute; that normalization includes the same added-time work. First-minute production latency is 126.66 [123.60, 131.27] ms CPU and 128.37 [124.26, 134.16] ms wall. Raw motion fits beneath the 750 real ms per match minute at 16x, but full staging throughput and later-minute readiness remain unmeasured because the adapter fails.

Today’s grid values above are measured on this fixture, machine, load and toolchain in the same session. The earlier approximately 0.7/1.2 s figures are historical context under different load/workload conditions, not substituted for these readings. The aggregate fixture is below the runner’s 5 ms timing filter: the table deliberately uses **all raw pairs** for its absolute median and interval. Its censored ratio is retained as emitted by the runner; no aggregate-fixture speed-up is claimed.

## Inputs, method and provenance

- Clock read with `date -u`: **2026-11-11T16:24:36Z**, exploration deadline **18:24:36Z**. Final comparisons began at 17:13:53 UTC with optimization sources frozen; no later performance cut was made. Final measurements ended at **2026-11-11T18:23:10Z**; closure was **2026-11-11T18:24:49Z**, 120.22 wall minutes after the baseline. All final measurements finished before the exploration deadline; only document closure followed it. [clock.json](T837/clock.json) preserves the start. All round times below are UTC on 2026-11-11 (local date 261112).
- Apple M1 Max, 10 logical CPUs, 32 GiB, darwin arm64 25.5.0. Actual Node **26.8.1**, V8 **14.6.202.34-node.28**, pnpm **10.34.6**, esbuild **0.28.2**. Initial load 1/5/15 min: 1.77/2.99/2.99. Full values: [environment.json](T837/environment.json). Repository Node **24.22.1** is not installed here; these measurements are not pinned-Node release evidence.
- Synthetic `careerWorld`, seed `perf-261027`, takeover of `ENG:0:0:0` in 1950, first own fixture `1950:ENG:0:0:0:0`, press against possession, score 0–0. World construction is outside timing. [dimensions.json](T837/dimensions.json) records the frozen inputs’ dimensions.
- `own-match` is revision-11 settlement: aggregate, participant attribution, transient detail, script, validation/recount and material. It retains the frozen staging inputs as an observed request does, but stages no frames; the same settlement is used for skipped matches. Staging workloads write the script before timing. Grid context is revision 10, with `buildFrames` included in the observed case. `fixture` is one aggregate fixture.
- `ab.mjs` bundles each side from its own tree with the same workload/digest harness, alternates A/B per pair and load order across processes. Main-thread CPU excludes waits for a core. Hashing occurs after timed reps. The decision is the runner’s trimmed mean of per-process median log ratios with a 95% bootstrap interval; only intervals wholly below 1 count as faster.
- Final own-match: 8 processes × 12 measured pairs, 4 warm-ups. Raw motion: 16 × 8, 2 warm-ups. First minute: 8 × 12, 4 warm-ups. Each grid context: 8 × 6, 2 warm-ups. Fixture: 8 × 12, 4 warm-ups. Seed identity runs and unchanged aggregate/day identities retain their actual counts in the JSON. All successful processes agree on each side’s digest.
- Absolute timing intervals use 10,000 percentile **process-cluster** bootstrap resamples, deterministic seed, all raw pairs without the 5 ms censor. This descriptive interval differs from the runner’s paired ratio estimator. [summarize.py](T837/summarize.py) reproduces [summary.json](T837/summary.json); each JSON retains raw paired CPU/wall samples, loads, hashes and bundle fingerprints.
- Baseline engine commit: `a453de2367488234d9a24ec23eb07f92e0979028`. The current performance harness is overlaid identically onto both trees. [provenance.json](T837/provenance.json) uses the repository’s dependency/source fingerprint helpers, with separate runtime computation and full-source scopes. Baseline computation `e28c06a54d558468252da282f3fc8e9310cd5083effdd3223560cb82e87217e7`; final computation `cd703bf65ef59aec37e8b012188842660ae4e078f7d7fc0b219dc328e4aa596f`. Baseline full source `3cea91ea9095488ca0c96d89a3a944b36afa67178b3e686733fa40907a6592f2`; final full source `36b5a89caf4c0a55a5752ba8b3909e83307f24163b278a60b790f905d37824ec`. No benchmark result is reused across a relevant source change.

To reproduce against the baseline, with this checked-out candidate and the same actual toolchain:

```sh
node scripts/perf/ab.mjs --workload own-match --base a453de2367488234d9a24ec23eb07f92e0979028 --cand . --procs 8 --reps 12 --warm 4 --json .tmp/T837/reproduced-own.json
node scripts/perf/ab.mjs --workload staging-core --base a453de2367488234d9a24ec23eb07f92e0979028 --cand . --procs 16 --reps 8 --warm 2 --json .tmp/T837/reproduced-motion.json
node scripts/perf/ab.mjs --workload staging --base a453de2367488234d9a24ec23eb07f92e0979028 --cand . --procs 1 --reps 1 --warm 0 --json .tmp/T837/reproduced-staging.json
python3 artifacts/benchmarks/T837/summarize.py
```

The third command is expected to expose the recorded prefix-count failure on this task’s source, not produce a successful timing. The raw JSON identifies all other exact run settings.

## Baseline A/A noise floor

Both sides use the baseline tree. Bundles and canonical hashes match; every ratio interval spans 1. Raw motion uses 8 × 3 pairs after 1 warm-up; the other counts match their final workload counts except the longer final motion read.

| Workload | A CPU ms [95%] | B CPU ms [95%] | CPU ratio [95%] |
|---|---|---|---|
| Own settlement | 154.52 [151.68, 157.20] | 154.94 [152.36, 158.18] | 1.0014 [0.9883, 1.0137] |
| Raw motion | 13828.92 [13569.89, 14125.94] | 13870.27 [13786.25, 14119.54] | 1.0016 [0.9843, 1.0151] |
| First minute | 507.29 [502.48, 513.44] | 506.90 [503.48, 509.48] | 0.9986 [0.9929, 1.0030] |
| Grid own | 106.85 [104.47, 109.48] | 105.35 [103.82, 107.45] | 0.9907 [0.9790, 1.0026] |
| Grid observed, tagged | 201.52 [199.85, 203.00] | 203.04 [201.19, 203.68] | 0.9926 [0.9826, 1.0063] |

A/A `staging` fails before a timing can be emitted. No noise floor or digest is invented for it.

## Experiments and round clocks

Each retained row clears the runner’s noise test and preserves its workload digest; each rejected row was reverted. Writer rows use complete own-settlement output, staging rows use diagnostic raw motion. Completion clocks below come from each raw result file’s filesystem timestamp; early round start times were not captured and are not estimated. [rounds.jsonl](T837/rounds.jsonl) preserves explicitly recorded start/end clocks for later rounds, the final comparisons and corpus checks. Interleaved writer/motion rounds use separate frozen tree snapshots; incremental ratios should not be multiplied into a combined claim.

| Round | Completion UTC | Change | CPU ms, before → after | CPU ratio [95%] | Decision |
|---|---|---|---|---|---|
| A1 | 16:27:35 | Index minute/side eligibility in original row order | 156.36 → 126.66 | 0.8144 [0.8044, 0.8247] | kept |
| A2 | 16:29:24 | Cache eligibility until playing/incident state changes | 129.18 → 88.95 | 0.6926 [0.6830, 0.7028] | kept |
| A3 | 16:31:36 | Maintain fixed/expiring touch counts | 90.98 → 82.58 | 0.8993 [0.8812, 0.9210] | kept |
| A4 | 16:34:26 | Skip entry checks without waiting substitutions | 80.29 → 60.16 | 0.7548 [0.7291, 0.7858] | kept |
| A5 | 16:48:18 | Skip zero-weight receiver-place work | 62.48 → 61.81 | 0.9909 [0.9751, 1.0116] | reverted |
| A6 | 16:49:39 | Compute unchanged quota/fill/pace terms once per search | 65.80 → 61.62 | 0.9639 [0.9557, 0.9763] | kept |
| A7 | 16:52:54 | Cache nearest-player ranks | 59.04 → 58.22 | 0.9991 [0.9861, 1.0118] | reverted |
| A8 | 16:54:27 | Index an actor’s remaining eligible turns | 58.11 → 54.86 | 0.9534 [0.9438, 0.9682] | kept |
| A9 | 16:58:06 | Visit only unplayed rows; retain blocked rows | 56.52 → 51.05 | 0.8775 [0.8624, 0.8928] | kept |
| A10 | 17:01:58 | Side/cell/cost-group floating-touch search with row ties | 50.37 → 43.86 | 0.8665 [0.8531, 0.8805] | kept |
| S1 | 16:32:54 | Prepare nominal shape once per movement/observation snapshot | 14115.56 → 3762.70 | 0.2690 [0.2620, 0.2761] | kept |
| S2 | 16:39:26 | Replace temporary distance vector with scalar calculation | 3720.45 → 3627.55 | 0.9819 [0.9367, 1.0340] | reverted |
| S3 | 16:53:10 | Build snapshot slot arrays in one pass | 3706.46 → 3265.12 | 0.8802 [0.8537, 0.9037] | kept |
| S4 | 17:01:15 | Cache present-player rosters by position snapshot | 3299.92 → 3303.86 | 0.9912 [0.9273, 1.0609] | reverted |
| S5 | 17:09:53 | Prepare observation shape lazily | 3281.19 → 3324.20 | 0.9974 [0.9421, 1.0586] | reverted |

[patches/index.json](T837/patches/index.json) records the ordered retained patches and their SHA-256 fingerprints. Applying them in order to the baseline reproduces all four changed engine files byte for byte; [patches/reproduction.json](T837/patches/reproduction.json) retains that check. The source keeps original row-ID ties, predecessor/entrant eligibility, fixed/expiring priority and floating operation order. Cell search is bounded only for safe integral costs; fractional/unsafe lab tunings retain the complete scan. Snapshot shape preparation is rebuilt for each movement/observation snapshot, retaining first-slot-holder and fallback semantics. No roster weak cache, lazy observation experiment or scalar-distance experiment remains.

Profiles were captured before the relevant experiments and retained as `profile-*.txt`. Their sample clock did not align with the timing window, so percentages include setup, warm-up and digest work; they are diagnostic hotspot reads, not exact timed-phase percentages. The next untried candidate is `stageFrames` sampling/frame-array allocation (and a marking cache only with an exact dependency key). First repair its prefix recount so any later optimization can hash the complete production picture. No further performance experiment starts after the timebox.

## Output identity

Digests are the runner’s first 16 SHA-256 hex digits. New-model settlement, first minute and raw motion use strict canonical finite values. The same output is produced on baseline and candidate for the main fixture and four additional fixed seeds; this finite corpus is not a proof over every possible match or tuning.

| Workload / seed | Baseline digest | Candidate digest | Equal |
|---|---|---|---|
| own-match | 318f9b6a609147e7 | 318f9b6a609147e7 | True |
| staging-core | 0e73f30ad40fb149 | 0e73f30ad40fb149 | True |
| staging-first | 8723b954a4913eaa | 8723b954a4913eaa | True |
| grid-own | 2a6a1b1bd8fa5e94 | 2a6a1b1bd8fa5e94 | True |
| grid-observed | e723d89a904386f4 | e723d89a904386f4 | True |
| fixture | 7ddd9edbdf7bbe93 | 7ddd9edbdf7bbe93 | True |
| aggregate | 9de04c296cd1e9fc | 9de04c296cd1e9fc | True |
| day | 569cd9bd26296b4b | 569cd9bd26296b4b | True |
| own-match, T831 | 2d65f83be4701f8f | 2d65f83be4701f8f | True |
| own-match, T837 | 157ad725e917d12b | 157ad725e917d12b | True |
| own-match, perf-script-1 | 2a62d2176ec2b020 | 2a62d2176ec2b020 | True |
| own-match, perf-script-2 | 326d9021791bfa85 | 326d9021791bfa85 | True |
| staging-core, T831 | 43f898e47f5763f2 | 43f898e47f5763f2 | True |
| staging-core, T837 | eb39eac7c43b42fb | eb39eac7c43b42fb | True |
| staging-core, perf-script-1 | da769463a3ecc12c | da769463a3ecc12c | True |
| staging-core, perf-script-2 | cfad61e8f5c949b3 | cfad61e8f5c949b3 | True |

Full `stageAll` has no output digest. The old grid’s interval-whistle events have eight NaN coordinates, listed in [grid-context.json](T837/grid-context.json). Only that context workload tags non-finite kinds before canonical hashing; NaN, infinities, null and literal strings remain distinguishable. Strict canonical hashing first rejected those coordinates. A diagnostic attempt using v8 byte serialization then gave different hashes for identical bundles; its JSON/log is retained as a failed hashing method, not a gameplay result difference. The tagged A/A and final grid digests agree. No game DTO, save field, seeded fact or locale behavior changes.

## Baseline staging failure and release handoff

[baseline-staging.log](T837/baseline-staging.log) records `side 0 delivered 0 of 1 corners`. Eight further seeds (`T831`, `T837`, `perf-script-1` through `perf-script-6`) fail on corner/free-kick counts too; their `probe-*.log` files retain the errors. The final source reproduces the failure in [final-staging.log](T837/final-staging.log). `staging/frames.ts` recounts a minute prefix through `countScript` → `recordOf` → `deriveTeamFacts`; that complete-ledger guard requires the restart and its cause together, while a valid time prefix may split them. Full-script recount/validation succeeds before staging starts. No guard is removed or loosened here.

T838 must repair that cumulative-counting boundary and remeasure `staging` before release. It already owns engine/scripts and the throughput re-read. When removing `SCRIPTED_RELEASE`, keep the benchmark revision-11 request explicit on both A/B trees and keep grid context at revision 10 instead of following the flipped production release flag. This task is done by its timeboxed exit, with missing end-to-end evidence preserved; it does not certify release readiness.

## Verification and limits

On the frozen candidate, all actually executed fast checks passed; [checks.json](T837/checks.json) and individual receipts preserve their source identity and logs:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run validate:i18n
pnpm exec vitest run --project unit --changed a453de2367488234d9a24ec23eb07f92e0979028 --passWithNoTests
```

The affected unit selection passed **173 files / 1,568 tests**. It includes small search tie/subset tests and diagnostic-hash kind/order tests. i18n passed **12 locales / 6,750 messages / 8,363 static references**. The installed spec linter also returned 0, with 8 existing freshness warnings and 67 editorial hints; [spec-lint.txt](T837/spec-lint.txt) and its JSON receipt retain them. No integration, contract, browser, build or full suite was run by this unit. Benchmark invocations above are explicit measurements, not integration test passes.

Deferred to the host’s one final integrated-candidate gate: `script/sample.test.ts`, `staging/perform.fixtures.test.ts`, `staging/pairings.test.ts`, `staging/incidents.test.ts`, `staging/frames.match.test.ts` and browser journeys `scripted-match`, `match-core`, `match-material`, `goal-replay`, `mobile-match-presentation`, `match-themes`, `live-state`. The host owns `pnpm run verify:batch`, push and CI. Pinned Node, full production staging, all-match identity, cross-platform picture identity, capacity and release acceptance are not claimed by these local measurements.
