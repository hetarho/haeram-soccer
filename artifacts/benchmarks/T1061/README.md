# T1061 — skip encoding unchanged save rows (Node host)

Measured 261124 on hq-dev1-pve2-vm2 (Intel Xeon Silver 4214, 12 cores, Node 24.22.1), with other
sessions loading the host (each run's 1-minute load is in its JSON and each summary's `loads`).
Node `Host` with a `node:sqlite` in-memory game database; OPFS and the browser are not measured.

Baseline: the diff base 9ffcc70c5 extracted with `git archive` (the worktree's `node_modules`
linked). Candidate: b2b0b80ef (a tracked `RowSaver` reusing the committed text of world fields the
host did not touch; five audited owner decisions touch only their own fields).

Workload: `scripts/perf/waits.ts` as T1058 describes it (`artifacts/benchmarks/T1058/README.md`):
manual-mode 다음 이벤트 stops, each followed by a save and a `stopped-reads` read, an owner decision
(ticket price) and its save every fifth stop, then close, open, export and import. The 2000 takeover
runs through a copy of `waits.ts` and `waits-pair.ts` with a `--world` flag (`waits-fixture.diff`):
the world from `pnpm exec tsx scripts/save-db-bench.ts build takeover-2000` (built once,
79,379,486 bytes, sha256 prefix in the task result) is handed to the host as the storage bench does.

| directory | input | rounds × steps | own matches a run |
|---|---|---|---|
| `pair-final-1930` | 1930 e2e start, seed `records-room-journey` | 6 × 100 | 50 |
| `pair-2000` | takeover-2000 | 6 × 20 | 10 |
| `pair-2000-open` | takeover-2000, open/export recheck | 10 × 5 | 2–3 |

Each directory holds every run's JSON, `summary.json` (paired calls, `scripts/perf/stats.ts`) and
`parts.txt` (`parts.cjs.txt`: medians of `ms`, `rowSave`, `sqlite` and rows put, and a check that
every matched request's posted reply hash — an export's file bytes included — and rows put agree).
