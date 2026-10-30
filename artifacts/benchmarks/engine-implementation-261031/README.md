# Production engine optimization — 2026-10-31

T617 adopts incremental fixture-helper replicas; T618 adopts packed **JavaScript** movement with the existing scalar path as its oracle/fallback. Save, model and RNG versions are unchanged. Earlier exploration is preserved in `../engine-opt-261030/README.md`.

## Final measurements

Candidate production source: checkpoint `fcd511673d89705b99d638d200f6201548d8dd0b` (tree `b557cda04bd58f938073a2cd4de4040eb31aa278`). Host: Apple M1 Max, macOS arm64, 10 logical cores, 32 GiB, Node v26.8.1 / V8 14.6.202.34-node.28. Same-machine alternating AB/BA pairs, fresh process groups, existing caches retained, no concurrent test/build workload. Intervals are the repository's deterministic 95% process-bootstrap intervals; ratios are candidate/baseline. A CPU gain requires the complete interval below 1.

| Workload | Baseline | Processes / measured work | Main CPU ratio [95% interval] | Result hash |
|---|---|---|---|---|
| Detailed grid, final JavaScript phase | `833d0711` (T617, scalar movement) | 16 × 18 reps, 6 warm reps | **0.9633 [0.9583, 0.9683]** | equal, `36c04541d86ef24c` |
| Aggregate, confirmation | `833d0711` | 16 × 20 reps of 150 fixtures, 4 warm reps | 1.0055 [0.9992, 1.0106], inconclusive | equal |
| Serial campaign, own days | `833d0711` | 8 × 120 completed days after 28 warm days; 104 own-day pairs | **0.9861 [0.9762, 0.9934]** | equal final worlds |
| Serial campaign, timed other days | `833d0711` | same campaign; 56 pairs at least 5 ms | 1.0017 [0.9802, 1.0243], inconclusive | equal final worlds |

The aggregate screen's wall interval was slightly slower; the default 16-process confirmation is inconclusive for both CPU and wall (wall 1.0059 [0.9997, 1.0113]). No aggregate improvement or universal no-regression claim is made. The serial `day` harness now provides synthetic funding, explicitly acknowledges critical messages as the host does, and asserts actual calendar advancement. It never measures repeatedly blocked days. Both sides receive this same harness; historical research artifacts remain unchanged.

**Combined production-code real-worker run**, compared directly against `8b0032ee633941d76bab78b128525fcc9f749ab6` (before either implementation):

| Metric | Ratio [95% interval] |
|---|---|
| Total wall time | **0.8744 [0.8641, 0.8983]** |
| Total process CPU (main + real helpers) | **0.7910 [0.7687, 0.8157]** |
| Total main-thread CPU | 0.9825 [0.9771, 0.9856] |
| Own-day latency | **0.8120 [0.8004, 0.8494]** |
| Own-day process CPU | 0.7641 [0.7343, 0.7851] |
| Own-day main-thread CPU | 0.9750 [0.9713, 0.9795] |

Eight fresh processes, 28 warm + 120 completed days per process, two real helpers per side, alternating AB/BA. Full world SHA-256 on all runs: `0461491c6421159e2a1cd06961d7d38cdb02142b2d6535027235bccc5f527b2e`. Load1 3.69–4.55; peak process RSS 1,240,514,560 bytes includes both worlds and four helpers in the paired process, not a one-world/browser memory estimate. Independent F1-only and F2-only percentages are **not added together**. These are fixed-seed workstation measurements, not mobile/browser throughput estimates.

## Selection and safety

The helper protocol keeps immutable record fingerprints on the owner and resident per-port replicas on helpers. It transfers changed/deleted records and ordering, validates sessions/requests/bases/revisions and retains unchanged generated NPC squads. Reloads, identity/year changes and missed bases resnapshot; all failures preserve the existing deterministic serial fallback and fixture order.

For movement, one bounded 64 KiB numeric slab per realm packs fixed targets once, applies the original scalar expressions across substeps, then commits positions/velocities once. Short phases and per-step observers retain `stepToward`. Non-finite inputs, allocation/execution failure and capacity overflow fall back without committing partial numeric work; a busy guard prevents reentrant scratch use. Seven focused unit cases include 128 groups × 22 movers × four durations, exact scalar comparisons, signed zero, absent velocity, standing/arrival/turn/brake/snap/hold/fractional cases and failure replay.

Guarded Wasm also qualifies locally: CPU 0.9512 [0.9479, 0.9542], 16 × 18. Wasm minimum-step screens (4 × 8) gave 2: 0.9515, 4: 0.9550, 8: 0.9531, all equal hashes. The intervals overlap; four steps is a conservative amortization threshold, not a claimed optimum. A JavaScript packed phase at that threshold independently qualified at 0.9563 [0.9519, 0.9606] before the final production-source confirmation above.

The shipped [`_headers`](../../../apps/web/public/_headers) has `script-src 'self'`; Wasm compilation is restricted by the [CSP3 editor draft's WebAssembly integration](https://w3c.github.io/webappsec-csp/#integration-with-webassembly), a work-in-progress specification. The JavaScript phase supplies a measured gain under the existing policy. It avoids a second production backend and security-policy expansion. `guarded-wasm-candidate.patch` preserves the 1,103-byte candidate, readable generator and independent unit vectors. Apply it to a separate checkout of `833d0711`, then run `node scripts/generate-movement-kernel.mjs --check` to reproduce the archived bytes. The prior per-step SIMD candidate remains rejected (CPU ×1.0220); a faster microkernel did not imply a faster match.

## Validation and reproduction

Final backend gate on production commit `fa72a098`: typecheck, lint, format, **1,824 unit / 1,267 integration / 48 contract cases**, catalogs, presentation and build all passed. This includes the full-season serial/helper transfer/reload/rollover comparison, ten-season codec checkpoint and existing deterministic match traces.

The movement browser worker passed on Chromium, Firefox and WebKit under actual shipped CSP, comparing complete observed facts and raw typed coordinate traces for normal, missing-Wasm, allocation-failure and mid-step-failure execution. `browser-helper-probe.mjs` additionally runs production fixture helpers on real sibling browser workers through transferred MessagePorts. Each browser completed 43 days, reloaded at day 22, used 4 snapshots and 4 patches with helpers still active, and matched the serial world every day. All three final SHA-256 hashes are `2cad0ff5fb2f52581369068a5bc1dfaa963aae5b153cf2536b9bda6a30232303`.

**Full application gate remains unsuccessful.** Its Chromium stage was interrupted after repeated existing UI journey failures, including tests that expect preparation tabs before clicking the report's `의견 전달`. The original `8b0032ee` was independently archived, rebuilt and run on another local port: the 390×844 `builds.spec.ts` case fails with exactly the same error. Its UI/test bytes equal the candidate's; `verification/baseline-control.json` records source fingerprints and error equality. No old assertion, timeout or UI flow was changed. Full-browser coverage and successful CI are not claimed. The owner subsequently explicitly accepts these reproduced baseline failures and requests main publication of the unchanged engine implementation; this supersedes the earlier publication hold. The original failed-gate receipt is historical evidence, not a statement that the gate passed.

`verification/receipt.json` indexes the executed checks. Compressed raw backend results, cross-browser results, baseline control and full-batch log are retained there. The interrupted batch did not finalize its Playwright JSON; a stale earlier `--list` JSON was discarded. The full log and representative contexts document those failures. Large original traces remain at `.tmp/ei31-verification-attempt01` in this worktree.

Reproduce the additional protocol check with `node artifacts/benchmarks/engine-implementation-261031/browser-helper-probe.mjs --json .tmp/browser-helpers.json`.

```sh
node scripts/perf/ab.mjs --base 833d0711 --workload grid --json .tmp/grid.json
node scripts/perf/ab.mjs --base 833d0711 --workload aggregate --json .tmp/aggregate.json
node scripts/perf/ab.mjs --base 833d0711 --workload day --procs 8 --reps 120 --warm 28 --json .tmp/day.json
node scripts/perf/helpers.mjs --base 8b0032ee --procs 8 --days 120 --warm 28 --json .tmp/helpers.json
```

`grid-final.json`, `aggregate-confirm.json`, `day-final.json` and `combined-final.json` contain final raw pairs and summaries. Earlier screens, both guarded-backend confirmations and the F1-only helper comparison remain alongside them. Do not replace this final-source result with a more favourable screening result.
