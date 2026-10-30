# Engine architecture optimization experiments

Research started 2026-10-30 KST and completed 2026-10-31 KST. The owner requested one worktree, automatic decisions, multiple attempts and an active investigation of modern architectures/algorithms. This is an experimental review, with no production engine source change.

## Findings that determine the recommendation

The packed movement phase and record-level helper replication are the two recommended follow-ups. They remain isolated prototypes, pending browser, full-season and production-protocol validation.

The movement architecture packs the numerical state once per movement phase, executes the existing scalar f64 kinematics inside Wasm across its timesteps, and writes back once. It leaves callback-observed phases on the scalar oracle. Whole-grid CPU time: **×0.9476 [0.9441, 0.9518] (faster)**; same hash **true**; 16 processes × 18 reps.
Packed-phase own-match-day CPU ×0.9762 [0.9459, 1.0075] (no difference) and other-day CPU ×1.0115 [0.9304, 1.0996] (no difference); whole-world hash equal **true**. Both day intervals include 1: no whole-day CPU speedup is claimed. These day measurements use serial progression; helper-protocol gains cannot be added without a combined run.

Direct live-progression comparisons against the **already shipped two-helper JSON snapshot path**:

| Candidate / 2 helpers | Total wall time | Own-match-day wall time | Process CPU | Same daily world hashes | Invalidations per 12 batches |
| --- | --- | --- | --- | --- | --- |
| record-delta | ×0.9862 [0.9477, 1.0262] (no difference) | ×0.9170 [0.8849, 0.9573] (faster) | ×0.8563 [0.7932, 0.9245] (faster) | true | 1, 1, 1, 1 |
| delta | ×1.0889 [1.0604, 1.1182] (slower) | ×1.0783 [1.0517, 1.1077] (slower) | ×1.0158 [0.9575, 1.0776] (no difference) | true | 12, 12, 12, 12 |
| json-slim | ×1.0457 [1.0228, 1.0691] (slower) | ×1.0928 [1.0430, 1.1332] (slower) | ×1.0121 [0.9458, 1.0831] (no difference) | true | 0, 0, 0, 0 |

Record-level replication improves own-match latency and CPU; its total 120-day wall interval includes 1, so no overall elapsed-time gain is claimed. Large frozen-batch gains did not predict live progression. A full-snapshot epoch invalidated on every measured match day (12/12) and was slower than the current helpers. Neither naive delta snapshots nor smaller snapshots are recommended from the direct comparisons.

The earlier strict f64x2 per-step candidate is rejected: whole-grid CPU ×1.0220 [1.0114, 1.0295] (slower), same hash true. Its faster numerical kernel did not offset packing and extra traversal.

## Baseline, environment and method

- Production source baseline: `64005ff137d63ba2540aa26ba12a7f4f12a695fb`. CPU Apple M1 Max; 10 available cores; RAM 32 GiB; Node v26.8.1; V8 14.6.202.34-node.28. This was a shared host: every result retains the observed load; there is no quiet-host or mobile-speed claim.
- Full engine candidates use the repository’s `ab.mjs`/`pair.mjs`: same esbuild pipeline, alternating AB/BA, alternated module-load order, warm-up, per-process median log-ratios and process-level bootstrap intervals. A screen uses 4 processes × 8 reps; a confirmed grid result uses the default 16 × 18, after 6 warm-ups. CPU is primary for a single-thread engine.
- Worker probes use 4 fresh processes × 8 measured paired batches after 2 warm-ups. They include snapshot construction, serialization, transfer, worker preparation, complete result transfer and fixture-order assembly. Wall time measures latency; process CPU includes all threads. Earlier handler-only CPU estimates are preserved under `preliminary-` and are excluded from the final table.
- Real progression uses 4 fresh processes, two seeds repeated with opposite AB/BA order, 120 paired days per process. Canonical whole-world equality is asserted after **every** day, outside the timed window. The current-helper baseline and candidate share a persistent pool, and each uses its own read copy; record settlement remains on one writer. This isolates the new protocol from the benefit of parallel helpers that already exists.
- Four-process worker intervals are exploratory, with much less process diversity than the 16-process engine acceptance harness. They are not a browser/mobile or release acceptance.
- Worker startup and first snapshot initialization are recorded separately. Live-day measurements include the candidate’s first snapshot initialization; initial pool creation is excluded from totals and reported. RSS is total process RSS with coordinator, helpers, paired worlds, hashes and result buffers; it is not an incremental browser memory estimate.
- `wireBytes` is an estimated payload counter; resident bootstrap snapshots and message metadata are not fully included. It is not an exact IPC byte count and is not used for an optimization claim.

## Engine-level alternatives

| Candidate | Aggregate CPU time / baseline, 95% interval | Pairs | Same record hash | Decision |
| --- | --- | --- | --- | --- |
| alias-model-change | ×1.1367 [1.1265, 1.1532] (slower) | 32 | false | Model change; reject as a result-identical optimization |
| cdf-cache | ×1.2609 [1.2452, 1.2845] (slower) | 32 | true | No confirmed improvement; do not adopt from this screen |
| float64-scratch | ×1.0886 [1.0826, 1.0946] (slower) | 32 | true | No confirmed improvement; do not adopt from this screen |
| int32-scratch | ×1.0092 [0.9956, 1.0188] (no difference) | 32 | true | No confirmed improvement; do not adopt from this screen |
| sparse-weights | ×1.0628 [1.0479, 1.0729] (slower) | 32 | true | No confirmed improvement; do not adopt from this screen |
| wasm-buffered-rng | ×1.0315 [1.0185, 1.0509] (slower) | 32 | true | No confirmed improvement; do not adopt from this screen |
| wasm-scalar-rng | ×1.0105 [0.9989, 1.0222] (no difference) | 32 | true | No confirmed improvement; do not adopt from this screen |

`float64-scratch`/`int32-scratch` replace only temporary split counters, not every engine object. `cdf-cache` keeps bounded, lazy inverse-CDF tables with identical floating operations and uniform draws. `sparse-weights` registers immutable role/taker distributions and scans only positive entries, in the original order. The alias variant uses the same count of uniforms but remaps outcomes; its changed record hash disqualifies it. Scalar and 64-value-buffered Wasm xorshift32 preserve each stream exactly but did not qualify on the aggregate screen.

## Strict SIMD: packed numerical phase within the existing engine

`advance` already fixes every mover’s target before anyone moves. The prototype packs each mover’s displacement and velocity into a small SoA slab, computes both norms with strict f64x2 operations, then executes the original scalar turning/braking/arrival arithmetic with those norms. Thus no target, RNG order, timestep, tie order or scalar integration formula changes. Other callers of `stepToward` remain scalar.

The self-contained Wasm binary is generated in `simd.mjs`; no compiler download, new package, whole-engine port or relaxed SIMD is needed. The finite-pitch kernel preserves the portable norm’s operation order, including a zero-vector mask. Infinity/NaN handling is deliberately outside this prototype’s finite-state input domain. Production integration needs feature detection and a scalar fallback, explicit finite-input bounds, observed-playback parity across browsers/CPUs and the existing integration digests.

The later `grid-wasm-phase` candidate uses `movement-wasm.mjs` to generate a 1,103-byte strict scalar Wasm module. It packs positions, velocities, targets, hold points, speed and hold deadlines once for an unobserved `advance` call, invokes numerical movement steps within that slab, and writes positions/velocities back once at the end. An `onStep` callback retains the original implementation. The phase port preserves expression grouping and branches; `movement-parity.json` checks standing/signed zero, arrival, turning, braking, snapping, hold deadlines, fractional steps and pitch bounds against the original `stepToward`.

| Batch size | Input layout | Kernel CPU time / JS, 95% interval | Scope |
| --- | --- | --- | --- |
| 22 | resident | ×0.1679 [0.1437, 0.1760] (faster) | Kernel only; not a match speedup |
| 22 | pack | ×0.4515 [0.3964, 0.5051] (faster) | Kernel only; not a match speedup |
| 128 | resident | ×0.1128 [0.0906, 0.1225] (faster) | Kernel only; not a match speedup |
| 128 | pack | ×0.3516 [0.2582, 0.4085] (faster) | Kernel only; not a match speedup |
| 4096 | resident | ×0.0604 [0.0595, 0.0608] (faster) | Kernel only; not a match speedup |
| 4096 | pack | ×0.2234 [0.2210, 0.2254] (faster) | Kernel only; not a match speedup |

Whole-grid comparison: 4 processes × 8 measured reps. CPU ×1.0220 [1.0114, 1.0295] (slower); wall ×1.0221 [1.0114, 1.0301] (slower); result hashes a4d0e6147cea36fe / a4d0e6147cea36fe; load range 4.31–4.59.

## Worker topology and communication matrix

| Fixtures | Helpers | Protocol | Wall time / serial, 95% interval | Process CPU / serial | Same hash |
| --- | --- | --- | --- | --- | --- |
| 8 | 2 | json-full | ×2.6399 [2.4641, 2.9112] (slower) | ×3.2599 [3.0986, 3.4295] (slower) | true |
| 8 | 2 | clone-full | ×3.5131 [3.2331, 3.8174] (slower) | ×3.7188 [3.2702, 4.2288] (slower) | true |
| 8 | 2 | json-shard | ×1.8280 [1.7601, 1.9415] (slower) | ×2.5641 [2.4903, 2.6540] (slower) | true |
| 8 | 2 | transfer-shard | ×1.9436 [1.9174, 1.9702] (slower) | ×2.5768 [2.4759, 2.6619] (slower) | true |
| 64 | 2 | json-full | ×1.1653 [1.0890, 1.2470] (slower) | ×2.1324 [1.9793, 2.2974] (slower) | true |
| 64 | 2 | json-shard | ×1.2892 [1.2033, 1.3430] (slower) | ×2.3506 [2.2644, 2.4400] (slower) | true |
| 64 | 4 | json-shard | ×0.9320 [0.8388, 0.9984] (faster) | ×3.0061 [2.6599, 3.3886] (slower) | true |
| 232 | 2 | json-shard | ×1.2029 [1.1377, 1.2564] (slower) | ×2.3198 [2.2383, 2.3949] (slower) | true |
| 232 | 4 | json-shard | ×0.7408 [0.7138, 0.7684] (faster) | ×2.8620 [2.7183, 2.9697] (slower) | true |
| 232 | 4 | resident | ×0.4656 [0.4319, 0.4932] (faster) | ×1.8042 [1.7718, 1.8289] (slower) | true |
| 8 | 2 | json-slim | ×1.3838 [1.3149, 1.4562] (slower) | ×1.9336 [1.6464, 2.2688] (slower) | true |
| 64 | 2 | json-slim | ×1.1704 [1.1123, 1.2555] (slower) | ×2.2592 [2.2012, 2.3187] (slower) | true |
| 64 | 4 | json-slim | ×0.7983 [0.7337, 0.8832] (faster) | ×2.8233 [2.6179, 3.0447] (slower) | true |
| 8 | 2 | delta | ×1.1875 [1.1195, 1.2596] (slower) | ×1.5789 [1.4691, 1.6959] (slower) | true |
| 64 | 2 | delta | ×0.7650 [0.7456, 0.7848] (faster) | ×1.4225 [1.2929, 1.5382] (slower) | true |
| 232 | 2 | delta | ×0.6264 [0.6141, 0.6389] (faster) | ×1.1868 [1.1465, 1.2330] (slower) | true |
| 232 | 4 | delta | ×0.4505 [0.3997, 0.5078] (faster) | ×1.7968 [1.6037, 2.0130] (slower) | true |

Frozen-batch protocols: `json-full` is today’s full read-copy JSON; `clone-full` sends objects through structured clone; `json-shard` filters people by participant/origin identity but keeps clubs; `json-slim` also filters clubs and retains the owner club required by the manager fee quote; `transfer-shard` transfers UTF-8 bytes but still pays JSON encoding/parsing; `resident` is a frozen resident-copy lower bound with no updates; `delta` checks the full clubs/people epoch and transmits dynamic fields only while that epoch stays fixed. Initial snapshots, cold first calls, bytes, total RSS and per-run load are in each JSON file.

The first slim-copy attempt failed because `clubManager` also reads the owner club to quote a manager’s fee (`staffQuote`). That dependency was restored before timing. Cutting a snapshot solely by the fixtures’ home/away IDs is insufficient.

The live `record-delta` protocol keeps ordered per-ID text fingerprints, sends changed/deleted records and order changes, updates club objects without breaking cached club references, replaces changed people registries so registry indexes refresh, and invalidates generated squads when their roster input projection changes. It conservatively scans all records today; explicit mutation revisions and per-club roster invalidations are potential follow-up optimizations, not measurements made here. Session/revision checks, stale-result rejection, timeout/fallback, removed fields, arbitrary commands, transfers, year rollovers and long-career cost still need production-level tests.

## Correctness and limits

| Candidate | Exact RNG draws | Binomial outcomes | Multinomial outcomes | Aggregate seeds | Observed full-playback seeds |
| --- | --- | --- | --- | --- | --- |
| float64-scratch | 40000 | 9900 | 2800 | 4 | 0 |
| int32-scratch | 40000 | 9900 | 2800 | 4 | 0 |
| cdf-cache | 40000 | 9900 | 2800 | 4 | 0 |
| sparse-weights | 40000 | 9900 | 2800 | 4 | 0 |
| wasm-scalar-rng | 40000 | 9900 | 2800 | 4 | 2 |
| wasm-buffered-rng | 40000 | 9900 | 2800 | 4 | 2 |
| grid-simd-hypot | 40000 | 9900 | 2800 | 4 | 2 |
| grid-wasm-phase | 40000 | 9900 | 2800 | 4 | 2 |

The focused checks compare the next unused RNG draw too, so equal sampled values cannot conceal changed draw counts. Aggregate parity covers 40 fixtures for each of four seeds per candidate. Observed grid parity deep-compares complete engine outputs, including typed coordinate traces and diagnostics, and hashes deterministic type-tagged values/raw typed-array bytes. Early harness encodings rejected internal non-finite diagnostics or encoded equal objects differently; the corrected check retains signed zero, non-finite sentinels and typed arrays. These finite cases do not prove all inputs or cross-engine bit identity. Live progression covers two seeds and the transitions reached in 120 days, not a complete season, transfer policy or 100-season save.

No production source was adopted by this research branch. Browser tests, full integration/season parity, long-career capacity, first-play startup and mobile memory/power remain adoption gates. An isolated CPU win, a warm resident-snapshot bound or a process-CPU increase is not a general user-visible speedup claim.

## Current primary-source research and unmeasured alternatives

- [V8, June 2025: Wasm speculative inlining and deoptimization](https://v8.dev/blog/wasm-speculative-optimizations): current Wasm improvements include feedback-based indirect-call optimization, particularly for WasmGC. This is not evidence that porting the existing TypeScript engine wholesale would help; that inference was not made.
- [WebKit, March 2026: JetStream 3](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/): evaluates first, worst and average iterations. It supports retaining cold/setup measurements alongside sustained throughput instead of quoting only a hot kernel.
- [Emscripten SIMD documentation](https://emscripten.org/docs/porting/simd.html): strict SIMD and relaxed SIMD have different arithmetic choices; strict multiplication/addition was used to preserve this engine’s rounding sequence. A GPU/f32 or fused-arithmetic replacement was not substituted for the portable f64 math.
- [Node worker documentation](https://nodejs.org/api/worker_threads.html): persistent pools amortize thread creation, and clone/transfer/shared-memory mechanisms have distinct costs. Every transport result above is measured, rather than assuming that structured clone or transferred JSON bytes are faster.
- [NumPy’s current binomial implementation](https://github.com/numpy/numpy/blob/main/numpy/random/src/distributions/distributions.c): uses inversion and BTPE regimes with cached parameters. BTPE/BTRD or a different Gaussian sampler would change the current RNG mapping/counts and sometimes its probability approximation; they require a model-version experiment and statistical calibration, not a result-identical optimization. BTPE was researched, not implemented or timed here.
- [WGSL, October 2026 draft, floating-point/scalar types](https://gpuweb.github.io/gpuweb/wgsl/#floating-point-types): runtime floating types are f32/f16. WebGPU does not offer a direct f64 replacement for this engine’s portable outcome-critical math. WebGPU and a whole-engine ECS/Rust rewrite were not benchmarked. A GPU port would need an explicit numeric/model contract and a batching workload before it could be recommended.
- Spatial hashing/k-d trees were examined in context, not implemented. The pitch has only 22 active players, and `spread` changes its query point as each teammate pushes it, in roster order. A static nearest-neighbor query can miss later neighbors or reorder effects; no speed gain or semantic parity is claimed.

## Reproduction

From this worktree, with the existing pinned dependencies installed:

```sh
node artifacts/benchmarks/engine-opt-261030/simd.mjs emit
node artifacts/benchmarks/engine-opt-261030/movement-wasm.mjs
node artifacts/benchmarks/engine-opt-261030/variants.mjs prepare
node artifacts/benchmarks/engine-opt-261030/variants.mjs screen
node artifacts/benchmarks/engine-opt-261030/workers.mjs
node artifacts/benchmarks/engine-opt-261030/workers.mjs slim
node artifacts/benchmarks/engine-opt-261030/simd.mjs
node artifacts/benchmarks/engine-opt-261030/variants.mjs screen grid-simd-hypot grid
node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-simd-hypot grid
node artifacts/benchmarks/engine-opt-261030/movement-parity.mjs
node artifacts/benchmarks/engine-opt-261030/variants.mjs screen grid-wasm-phase grid
node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-wasm-phase grid
node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-wasm-phase day
node artifacts/benchmarks/engine-opt-261030/verify.mjs
node artifacts/benchmarks/engine-opt-261030/progression.mjs
node artifacts/benchmarks/engine-opt-261030/progression.mjs current
node artifacts/benchmarks/engine-opt-261030/summarize.mjs
```

Run timing commands sequentially. `variants.mjs` creates isolated package copies under `.tmp/eo30-variants` and reviewable patches here. `run-receipts.json` retains the final runner’s command outcomes/timestamps; `environment.json` and `sources.json` record identities; raw JSON contains every sample and hash. Keep earlier `preliminary-*` evidence distinct from final process-CPU measurements. Do not apply the alias patch as a backwards-compatible speedup.
