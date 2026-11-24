# T1062 — less validation work on open and import (Node host)

Measured 261124 on hq-dev1-pve2-vm2 (Intel Xeon Silver 4214, 12 cores, Node v24.22.1), with other
sessions loading the host (each run's 1-minute load is in its JSON and each summary's `loads`).
Node `Host` with a `node:sqlite` in-memory game database; OPFS and the browser are not measured.

Baseline: the diff base f9f39065 extracted with `git archive` (the worktree's `node_modules`
linked). Candidate: the same tree with the task's `packages/contracts/src/schema.ts` (`zodParse`
and the job-overlap check reading each job's dates once).

| directory | what | command |
|---|---|---|
| `pair-1930` | open, import and every other wait, 1930 e2e start `records-room-journey`, final code | `tsx scripts/perf/waits-pair.ts --base <base> --candidate <cand> --rounds 8 --steps 10` |
| `pair-1930-first`, `pair-2000` | the same before accepted values were emptied after each parse; 2000 on the T1061 takeover-2000 world (79,379,486 bytes, sha256 12919eeaf269a431…) | as above; 2000 through T1061's `waits.ts --world` copy (`artifacts/benchmarks/T1061/waits-fixture.diff`), `--rounds 8 --steps 2` |
| `validate-1930`, `validate-2000` | `validateWorld` alone, paired in one process, final code | `bench-pair.ts --db <capture> --processes 6 --reps 6` (2000: `--reps 3`) |
| `parity` | seeded mutation parity, schema and world level | `fuzz.ts` (below) |

`parts.txt`: open/import medians of the host's parts (`parts.cjs.txt`) and a check that every
matched request's posted reply hash (open and import views, export file bytes) and rows put agree
between the sides (`replies.cjs.txt`).

The validation-alone and mutation inputs are game databases captured by `capture.ts` (the 1930 start
after 20 stops, sha256 e52d11acc5e86fa6…; the takeover-2000 world after 3 stops, bd831e55a99ecdc6…),
read into their stored world by `rowsToWorld` as the host's open does. `bench.ts` times baseline and
candidate `validateWorld` on fresh clones of that world with the load catalog and the database's
store (cold person rows), alternating the side first; `bench-pair.ts` gives each process's median
log-ratio and the trimmed mean with a 95% bootstrap interval (`scripts/perf/stats.ts`).

`fuzz.ts` (T1062-validation-parity, mutation part): seeded single-point mutations of random schema
nodes compared as `zodParse(node, v)` against `node.safeParse(v)` (verdict, output with key order,
explicit undefined and −0, Zod issues, and whether the fast path itself accepted), then whole mutated
worlds through the baseline's and the candidate's `validateWorld` (canonical hash, or error class,
message and issues). `--overlap` moves people's jobs to exercise the job-overlap check.

`parity/parity-hook.diff` is the temporary hook (never committed) that ran both `validateWorld`s on
every call of the existing schema, portable-save and host test files and logged whether they agreed.
