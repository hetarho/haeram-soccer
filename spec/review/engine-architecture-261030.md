# REVIEW engine-architecture-261030
> st:open@261030 | scope:packages/engine/src scripts/perf apps/web/src/runtime/helperPool.ts | at:64005ff1 | base:ARCH@25

## summary
- Owner-requested, isolated optimization research: profile the current engine, run architectural prototypes, and record both successful and rejected experiments. Production engine sources remain unchanged at the end of this review.
- Existing T611/T612 micro-optimizations are the baseline. Compare full workloads and preserve output hashes; isolated kernels and parallel wall-time measurements are exploratory evidence, not an ARCH-34 production acceptance.

## findings

## notes
- Research artifacts and reproducible commands: artifacts/benchmarks/engine-opt-261030/. No production adoption or model revision is implied by an experiment.
- Investigate packed numeric storage, loop specialization, sampling algorithms, and persistent fixture-worker pools with transport costs included. Consult current primary sources on WebAssembly/SIMD, worker communication and sampling.
- Timing runs are sequential on this shared host. Preserve warm-up, paired samples, source and toolchain identity, load, memory and exact result comparisons. Browser and full-season parity remain necessary before any worker-topology adoption.
