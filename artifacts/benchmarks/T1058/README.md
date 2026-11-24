# T1058 — player-facing worker waits (Node host)

Measured 261124 on hq-dev1-pve2-vm2 (Intel Xeon Silver 4214, 12 cores, Node 24.22.1), with other
sessions loading the host (1-minute load average 3–20; each run's load is in its JSON and each
summary's `loads`). Node `Host` with a `node:sqlite` in-memory game database and no fixture
helpers; OPFS and the browser are not measured.

Workload (`scripts/perf/waits.ts`): the e2e start (석유 재벌, no traits, seed
`records-room-journey`), the first affordable club, manual mode, every business responsibility
delegated, match eve on. Each step is 다음 이벤트 (or one day on a match eve, as the e2e helper
plays it), then a save and a `stopped-reads` read; every fifth stop an owner decision (ticket price
0.08/0.05) and its save. Then close, open, export and import as a new game. Each request records
its parts: `publish` (projection + delta), `projection`, `slowReads` (→WEB-119), `delta`, `cloneMs`
(structured clone of the posted reply), `save`, `rowSave` (row diff and write), `sqlite`.

Pairs (`scripts/perf/waits-pair.ts`): baseline and candidate trees in alternating processes, the
side run first alternating by round, the same seed and steps. A kind's call is the per-round median
log-ratio (candidate ÷ baseline) of its matched requests; over rounds a trimmed mean with a 95%
bootstrap interval (`scripts/perf/stats.ts`). `hashes` lists each side's `worldFacts` hash at the
end of the steps and after reopening.

| directory | baseline | candidate | rounds × steps | decade |
|---|---|---|---|---|
| `pair-cut1` | 6ac1d761 | cut 1 (arrival XI) | 8 × 20 | 1930 |
| `pair-cut2` | cut 1 | cut 1 + discipline-names skip (not kept) | 7 × 20 (8th stopped) | 1930 |
| `pair-final-1930` | 6ac1d761 | final tree (cut 1) | 6 × 12 | 1930 |
| `pair-1970` | 6ac1d761 | final tree (cut 1) | 4 × 12 (stopped at its 55-minute limit) | 1970 |

`replies/` holds one baseline and one final run (10 steps, 1930) whose rows carry `replyHash`, the
hash of each reply as posted to the client (an export's file bytes included): all 38 are equal.
The pair runs above predate that field.

Rerun a summary from the kept runs: `tsx scripts/perf/waits-pair.ts --out <dir> --analyse`.
