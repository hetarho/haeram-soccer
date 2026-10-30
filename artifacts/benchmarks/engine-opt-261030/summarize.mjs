import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(here, name), 'utf8'));
const ratio = (v) =>
  v
    ? `×${v.ratio.toFixed(4)} [${v.lo.toFixed(4)}, ${v.hi.toFixed(4)}] (${v.call})`
    : 'not measured';
const table = (heads, rows) =>
  `| ${heads.join(' | ')} |\n| ${heads.map(() => '---').join(' | ')} |\n${rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n')}`;
const env = read('environment.json');
const grid = existsSync(join(here, 'confirm-grid-simd-hypot-grid.json'))
  ? read('confirm-grid-simd-hypot-grid.json')
  : read('screen-grid-simd-hypot-grid.json');
const phase = existsSync(join(here, 'confirm-grid-wasm-phase-grid.json'))
  ? read('confirm-grid-wasm-phase-grid.json')
  : read('screen-grid-wasm-phase-grid.json');
const phaseDay = existsSync(join(here, 'confirm-grid-wasm-phase-day.json'))
  ? read('confirm-grid-wasm-phase-day.json')
  : undefined;
const current = read('progression-current-summary.json');
const workers = [...read('workers-summary.json'), ...read('workers-slim-summary.json')];
const simd = read('simd-summary.json');
const correctness = read('correctness.json');
const basic = readdirSync(here)
  .filter((n) => n.startsWith('screen-') && n.endsWith('-aggregate.json'))
  .map(read);
const lines = [
  '# Engine architecture optimization experiments',
  '',
  'Research started 2026-10-30 KST and completed 2026-10-31 KST. The owner requested one worktree, automatic decisions, multiple attempts and an active investigation of modern architectures/algorithms. This is an experimental review, with no production engine source change.',
  '',
  '## Findings that determine the recommendation',
  '',
  `The packed movement phase and record-level helper replication are the two recommended follow-ups. They remain isolated prototypes, pending browser, full-season and production-protocol validation.`,
  '',
  `The movement architecture packs the numerical state once per movement phase, executes the existing scalar f64 kinematics inside Wasm across its timesteps, and writes back once. It leaves callback-observed phases on the scalar oracle. Whole-grid CPU time: **${ratio(phase.grid.cpu)}**; same hash **${phase.sameHash}**; ${phase.procs} processes × ${phase.reps} reps.`,
  ...(phaseDay
    ? [
        `Packed-phase own-match-day CPU ${ratio(phaseDay.own?.cpu)} and other-day CPU ${ratio(phaseDay.other?.cpu)}; whole-world hash equal **${phaseDay.sameHash}**. Both day intervals include 1: no whole-day CPU speedup is claimed. These day measurements use serial progression; helper-protocol gains cannot be added without a combined run.`,
      ]
    : []),
  '',
  'Direct live-progression comparisons against the **already shipped two-helper JSON snapshot path**:',
  '',
  table(
    [
      'Candidate / 2 helpers',
      'Total wall time',
      'Own-match-day wall time',
      'Process CPU',
      'Same daily world hashes',
      'Invalidations per 12 batches',
    ],
    current.map((r) => [
      r.mode,
      ratio(r.wall),
      ratio(r.ownWall),
      ratio(r.processCpu),
      r.sameHash,
      r.epochChanges.join(', '),
    ]),
  ),
  '',
  'Record-level replication improves own-match latency and CPU; its total 120-day wall interval includes 1, so no overall elapsed-time gain is claimed. Large frozen-batch gains did not predict live progression. A full-snapshot epoch invalidated on every measured match day (12/12) and was slower than the current helpers. Neither naive delta snapshots nor smaller snapshots are recommended from the direct comparisons.',
  '',
  `The earlier strict f64x2 per-step candidate is rejected: whole-grid CPU ${ratio(grid.grid.cpu)}, same hash ${grid.sameHash}. Its faster numerical kernel did not offset packing and extra traversal.`,
  '',
  '## Baseline, environment and method',
  '',
  `- Production source baseline: \`${env.baseline}\`. CPU ${env.cpu}; ${env.cores} available cores; RAM ${(env.memory / 2 ** 30).toFixed(0)} GiB; Node ${env.node}; V8 ${env.v8}. This was a shared host: every result retains the observed load; there is no quiet-host or mobile-speed claim.`,
  '- Full engine candidates use the repository’s `ab.mjs`/`pair.mjs`: same esbuild pipeline, alternating AB/BA, alternated module-load order, warm-up, per-process median log-ratios and process-level bootstrap intervals. A screen uses 4 processes × 8 reps; a confirmed grid result uses the default 16 × 18, after 6 warm-ups. CPU is primary for a single-thread engine.',
  '- Worker probes use 4 fresh processes × 8 measured paired batches after 2 warm-ups. They include snapshot construction, serialization, transfer, worker preparation, complete result transfer and fixture-order assembly. Wall time measures latency; process CPU includes all threads. Earlier handler-only CPU estimates are preserved under `preliminary-` and are excluded from the final table.',
  '- Real progression uses 4 fresh processes, two seeds repeated with opposite AB/BA order, 120 paired days per process. Canonical whole-world equality is asserted after **every** day, outside the timed window. The current-helper baseline and candidate share a persistent pool, and each uses its own read copy; record settlement remains on one writer. This isolates the new protocol from the benefit of parallel helpers that already exists.',
  '- Four-process worker intervals are exploratory, with much less process diversity than the 16-process engine acceptance harness. They are not a browser/mobile or release acceptance.',
  '- Worker startup and first snapshot initialization are recorded separately. Live-day measurements include the candidate’s first snapshot initialization; initial pool creation is excluded from totals and reported. RSS is total process RSS with coordinator, helpers, paired worlds, hashes and result buffers; it is not an incremental browser memory estimate.',
  '- `wireBytes` is an estimated payload counter; resident bootstrap snapshots and message metadata are not fully included. It is not an exact IPC byte count and is not used for an optimization claim.',
  '',
  '## Engine-level alternatives',
  '',
  table(
    [
      'Candidate',
      'Aggregate CPU time / baseline, 95% interval',
      'Pairs',
      'Same record hash',
      'Decision',
    ],
    basic.map((r) => [
      r.cand.split('/').at(-1),
      ratio(r.aggregate.cpu),
      r.aggregate.pairs,
      r.sameHash,
      r.sameHash
        ? 'No confirmed improvement; do not adopt from this screen'
        : 'Model change; reject as a result-identical optimization',
    ]),
  ),
  '',
  '`float64-scratch`/`int32-scratch` replace only temporary split counters, not every engine object. `cdf-cache` keeps bounded, lazy inverse-CDF tables with identical floating operations and uniform draws. `sparse-weights` registers immutable role/taker distributions and scans only positive entries, in the original order. The alias variant uses the same count of uniforms but remaps outcomes; its changed record hash disqualifies it. Scalar and 64-value-buffered Wasm xorshift32 preserve each stream exactly but did not qualify on the aggregate screen.',
  '',
  '## Strict SIMD: packed numerical phase within the existing engine',
  '',
  '`advance` already fixes every mover’s target before anyone moves. The prototype packs each mover’s displacement and velocity into a small SoA slab, computes both norms with strict f64x2 operations, then executes the original scalar turning/braking/arrival arithmetic with those norms. Thus no target, RNG order, timestep, tie order or scalar integration formula changes. Other callers of `stepToward` remain scalar.',
  '',
  'The self-contained Wasm binary is generated in `simd.mjs`; no compiler download, new package, whole-engine port or relaxed SIMD is needed. The finite-pitch kernel preserves the portable norm’s operation order, including a zero-vector mask. Infinity/NaN handling is deliberately outside this prototype’s finite-state input domain. Production integration needs feature detection and a scalar fallback, explicit finite-input bounds, observed-playback parity across browsers/CPUs and the existing integration digests.',
  '',
  'The later `grid-wasm-phase` candidate uses `movement-wasm.mjs` to generate a 1,103-byte strict scalar Wasm module. It packs positions, velocities, targets, hold points, speed and hold deadlines once for an unobserved `advance` call, invokes numerical movement steps within that slab, and writes positions/velocities back once at the end. An `onStep` callback retains the original implementation. The phase port preserves expression grouping and branches; `movement-parity.json` checks standing/signed zero, arrival, turning, braking, snapping, hold deadlines, fractional steps and pitch bounds against the original `stepToward`.',
  '',
  table(
    ['Batch size', 'Input layout', 'Kernel CPU time / JS, 95% interval', 'Scope'],
    simd.map((r) => [r.count, r.packing, ratio(r.cpu), 'Kernel only; not a match speedup']),
  ),
  '',
  `Whole-grid comparison: ${grid.procs} processes × ${grid.reps} measured reps. CPU ${ratio(grid.grid.cpu)}; wall ${ratio(grid.grid.wall)}; result hashes ${grid.hashes.base.join(', ')} / ${grid.hashes.cand.join(', ')}; load range ${Math.min(...grid.load1).toFixed(2)}–${Math.max(...grid.load1).toFixed(2)}.`,
  '',
  '## Worker topology and communication matrix',
  '',
  table(
    [
      'Fixtures',
      'Helpers',
      'Protocol',
      'Wall time / serial, 95% interval',
      'Process CPU / serial',
      'Same hash',
    ],
    workers.map((r) => [r.count, r.workers, r.mode, ratio(r.wall), ratio(r.totalCpu), r.sameHash]),
  ),
  '',
  'Frozen-batch protocols: `json-full` is today’s full read-copy JSON; `clone-full` sends objects through structured clone; `json-shard` filters people by participant/origin identity but keeps clubs; `json-slim` also filters clubs and retains the owner club required by the manager fee quote; `transfer-shard` transfers UTF-8 bytes but still pays JSON encoding/parsing; `resident` is a frozen resident-copy lower bound with no updates; `delta` checks the full clubs/people epoch and transmits dynamic fields only while that epoch stays fixed. Initial snapshots, cold first calls, bytes, total RSS and per-run load are in each JSON file.',
  '',
  'The first slim-copy attempt failed because `clubManager` also reads the owner club to quote a manager’s fee (`staffQuote`). That dependency was restored before timing. Cutting a snapshot solely by the fixtures’ home/away IDs is insufficient.',
  '',
  'The live `record-delta` protocol keeps ordered per-ID text fingerprints, sends changed/deleted records and order changes, updates club objects without breaking cached club references, replaces changed people registries so registry indexes refresh, and invalidates generated squads when their roster input projection changes. It conservatively scans all records today; explicit mutation revisions and per-club roster invalidations are potential follow-up optimizations, not measurements made here. Session/revision checks, stale-result rejection, timeout/fallback, removed fields, arbitrary commands, transfers, year rollovers and long-career cost still need production-level tests.',
  '',
  '## Correctness and limits',
  '',
  table(
    [
      'Candidate',
      'Exact RNG draws',
      'Binomial outcomes',
      'Multinomial outcomes',
      'Aggregate seeds',
      'Observed full-playback seeds',
    ],
    correctness.map((r) => [
      r.name,
      r.randomChecks,
      r.binomialChecks,
      r.multinomialChecks,
      r.hashes.filter((h) => h.aggregate).length,
      r.hashes.filter((h) => h.observedPlayback).length,
    ]),
  ),
  '',
  'The focused checks compare the next unused RNG draw too, so equal sampled values cannot conceal changed draw counts. Aggregate parity covers 40 fixtures for each of four seeds per candidate. Observed grid parity deep-compares complete engine outputs, including typed coordinate traces and diagnostics, and hashes deterministic type-tagged values/raw typed-array bytes. Early harness encodings rejected internal non-finite diagnostics or encoded equal objects differently; the corrected check retains signed zero, non-finite sentinels and typed arrays. These finite cases do not prove all inputs or cross-engine bit identity. Live progression covers two seeds and the transitions reached in 120 days, not a complete season, transfer policy or 100-season save.',
  '',
  'No production source was adopted by this research branch. Browser tests, full integration/season parity, long-career capacity, first-play startup and mobile memory/power remain adoption gates. An isolated CPU win, a warm resident-snapshot bound or a process-CPU increase is not a general user-visible speedup claim.',
  '',
  '## Current primary-source research and unmeasured alternatives',
  '',
  '- [V8, June 2025: Wasm speculative inlining and deoptimization](https://v8.dev/blog/wasm-speculative-optimizations): current Wasm improvements include feedback-based indirect-call optimization, particularly for WasmGC. This is not evidence that porting the existing TypeScript engine wholesale would help; that inference was not made.',
  '- [WebKit, March 2026: JetStream 3](https://webkit.org/blog/17899/introducing-the-jetstream-3-benchmark-suite/): evaluates first, worst and average iterations. It supports retaining cold/setup measurements alongside sustained throughput instead of quoting only a hot kernel.',
  '- [Emscripten SIMD documentation](https://emscripten.org/docs/porting/simd.html): strict SIMD and relaxed SIMD have different arithmetic choices; strict multiplication/addition was used to preserve this engine’s rounding sequence. A GPU/f32 or fused-arithmetic replacement was not substituted for the portable f64 math.',
  '- [Node worker documentation](https://nodejs.org/api/worker_threads.html): persistent pools amortize thread creation, and clone/transfer/shared-memory mechanisms have distinct costs. Every transport result above is measured, rather than assuming that structured clone or transferred JSON bytes are faster.',
  '- [NumPy’s current binomial implementation](https://github.com/numpy/numpy/blob/main/numpy/random/src/distributions/distributions.c): uses inversion and BTPE regimes with cached parameters. BTPE/BTRD or a different Gaussian sampler would change the current RNG mapping/counts and sometimes its probability approximation; they require a model-version experiment and statistical calibration, not a result-identical optimization. BTPE was researched, not implemented or timed here.',
  '- [WGSL, October 2026 draft, floating-point/scalar types](https://gpuweb.github.io/gpuweb/wgsl/#floating-point-types): runtime floating types are f32/f16. WebGPU does not offer a direct f64 replacement for this engine’s portable outcome-critical math. WebGPU and a whole-engine ECS/Rust rewrite were not benchmarked. A GPU port would need an explicit numeric/model contract and a batching workload before it could be recommended.',
  '- Spatial hashing/k-d trees were examined in context, not implemented. The pitch has only 22 active players, and `spread` changes its query point as each teammate pushes it, in roster order. A static nearest-neighbor query can miss later neighbors or reorder effects; no speed gain or semantic parity is claimed.',
  '',
  '## Reproduction',
  '',
  'From this worktree, with the existing pinned dependencies installed:',
  '',
  '```sh',
  'node artifacts/benchmarks/engine-opt-261030/simd.mjs emit',
  'node artifacts/benchmarks/engine-opt-261030/movement-wasm.mjs',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs prepare',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs screen',
  'node artifacts/benchmarks/engine-opt-261030/workers.mjs',
  'node artifacts/benchmarks/engine-opt-261030/workers.mjs slim',
  'node artifacts/benchmarks/engine-opt-261030/simd.mjs',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs screen grid-simd-hypot grid',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-simd-hypot grid',
  'node artifacts/benchmarks/engine-opt-261030/movement-parity.mjs',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs screen grid-wasm-phase grid',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-wasm-phase grid',
  'node artifacts/benchmarks/engine-opt-261030/variants.mjs confirm grid-wasm-phase day',
  'node artifacts/benchmarks/engine-opt-261030/verify.mjs',
  'node artifacts/benchmarks/engine-opt-261030/progression.mjs',
  'node artifacts/benchmarks/engine-opt-261030/progression.mjs current',
  'node artifacts/benchmarks/engine-opt-261030/summarize.mjs',
  '```',
  '',
  'Run timing commands sequentially. `variants.mjs` creates isolated package copies under `.tmp/eo30-variants` and reviewable patches here. `run-receipts.json` retains the final runner’s command outcomes/timestamps; `environment.json` and `sources.json` record identities; raw JSON contains every sample and hash. Keep earlier `preliminary-*` evidence distinct from final process-CPU measurements. Do not apply the alias patch as a backwards-compatible speedup.',
  '',
];
writeFileSync(join(here, 'README.md'), lines.join('\n'));
console.log(
  JSON.stringify({
    engineCandidates: basic.length + 2,
    workerConfigurations: workers.length,
    simdKernelCases: simd.length,
    currentComparisons: current.length,
    correctnessCandidates: correctness.length,
  }),
);
