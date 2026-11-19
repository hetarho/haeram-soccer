# T986 — the own script validated once, attribution copies only when traced

Machine: Apple M1 Max (shared, load1 10–21 during the runs). Base c1023944; candidate = working tree
(bundle 86f1d1be3ca174c7). `scripts/perf/ab.mjs --procs 6`, main-thread CPU ratio cand/base with its
95% interval.

| run | workload | CPU ratio (95%) | call | hashes |
|---|---|---|---|---|
| both parts vs base | own-match | 0.948 (0.918–0.976) | faster | equal (57d66f84b227afdb) |
| both parts vs base | aggregate | 0.960 (0.953–0.970) | faster | equal (09c4b698345ff9fc) |
| both parts vs base | day, own match days | 0.953 (0.933–0.973) | faster | equal (a56436ea3e565194) |
| both parts vs base | day, other days | 1.009 (0.985–1.034) | no difference | equal (a56436ea3e565194) |
| part 1 vs base + part 2 | own-match | 0.912 (0.879–0.948) | faster | equal (57d66f84b227afdb) |

Part 2 (timeline.ts, players.ts) is measured alone by the aggregate workload, which writes no
script. Part 1 (write.ts, playback.ts) is measured alone against a scratch copy of the base with
only part 2's two files applied. Both parts are kept: each interval is below 1 with equal hashes.
The day workload's other days (no own match, about 12 ms each) show no difference either way.
