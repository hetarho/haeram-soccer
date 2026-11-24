# T1064 — engine work on own match days (Node)

Measured 261124 on hq-dev1-pve2-vm2 (Intel Xeon Silver 4214, 12 cores, Node 24.22.1), a host shared
with other sessions (1-minute load 1–17; each run's load is in its JSON). Node `Host` with a
`node:sqlite` in-memory game database and no fixture helpers (→ARCH-6's helpers are a browser
path); OPFS and the browser are not measured. Baseline: the diff base `dab5e3b8d` extracted with
`git archive` into `.tmp/t1064-base` (the worktree's `node_modules` linked).

No variant was kept: every result-identical candidate stayed inside the noise.

## Workload (`day.ts`)

The e2e manual career of `scripts/perf/waits.ts` (석유 재벌, no traits, seed `records-room-journey`,
1930, the first affordable club, every business responsibility delegated, match eve on), played
through the real `Host`: 다음 이벤트 to each own match eve, where the next day is lived `--reps` times
on copies (`cloneWorld`, the same record store) by `advanceDays(w, 1, undefined, false)` — the
host's own day step without helpers — each timed and hashed (`canonical` world, the own playback's
record); then the host plays the same day as the client does (`advance-days 1`) and saves. `lived`
is the host world's hash after that step: on every eve measured it equals the copies' hash, so the
copy path is the host path.

`day-pair.mjs` alternates a baseline and a candidate tree in separate processes, the side run
first alternating by round; per round the median log-ratio of each eve's median time, over rounds a
trimmed mean with a 95% bootstrap interval; every eve's hashes are compared.

`under.mjs` reads a `.cpuprofile` and reports self and inclusive time under one function (here the
driver's `ownMatchDay`, so the host's other days and the view are left out).

## Where an own match day goes (`profile-own-match-day.txt`)

`node --cpu-prof --cpu-prof-interval 500 --import tsx day.ts --eves 6 --reps 2` (load ~16), 12 own
match days, 16.4 s under `ownMatchDay` (tsx; its `__name` wrappers add about 5–8%):

| part | share |
|---|---|
| the round's fixtures (`playFixture` → `simulateAggregate`): 225 fixtures (224 other clubs' + ours), one call each | 88.1% |
| — `attributePlayerFacts` (who made each action) | 61.2% |
| — — `fitMoves` (place fit per action class), of which `fitPlaceWeights` 19.4% | 30.2% |
| — `settleParticipation` (`generateTeamFacts` 15.2%, `planParticipation` 3.4%) | 19.1% |
| — `prepareMatch` (`startingSquad` 1.9%, `ratingOf` 1.0%) | 5.0% |
| recording (`recordMatch`: record check 1.4%, NPC season 1.2%, recent results 1.1%) | 5.4% |
| club day (`clubDay`, mostly `dailyMarket` 1.8%) | 2.0% |
| round settlement beyond matches (`settleNpcGrowth` 1.8%, `drawShortlist` 1.1%, rest < 0.5% each) | 4.2% |

Counted on three eves (instrumented copy, not kept): 225/225/218 fixtures, `simulateAggregate`,
`settleParticipation`, `planParticipation`, `generateTeamFacts` and `attributePlayerFacts` once per
fixture (no rebalance re-search or retry on those days), `startingSquad` and `ratingOf` twice per
fixture (once per club). No pure computation repeats on the same inputs within the day: the cost
is ~4.5 ms of aggregate settlement per fixture over every league in play.

Bundled (`node scripts/perf/profile.mjs --workload aggregate`, the A/B bench's esbuild bundle, no
tsx wrappers, load ~14): `attributePlayerFacts` 72.4%, `fitMoves` 44.0%, `fitPlaceWeights` 30.1%
(self 28.6%; 53.5% of its ticks on the accumulation `actual[p] += FIT[at + p] * scale[p] / sum`),
`settleParticipation` 21.7%, `generateTeamFacts` 17.7%.

## Candidates

| candidate | patch | measure | result |
|---|---|---|---|
| sum once per shared `placed` row in `fitPlaceWeights` | `candidate-sum-dedupe.diff` | `scripts/perf/ab.mjs --base HEAD --workload aggregate --procs 8` (`ab/aggregate-sum-dedupe.json`, load 15.6–17.1) | CPU 1.0007 (95% 0.990–1.011), no difference; hashes `d39ffa76c0a3ddc3` both |
| `fitMoves` classes by number in parallel lists | `candidate-fit-classes.diff` | the same (`ab/aggregate-fit-classes.json`, load 4.4–12.0) | CPU 0.9876 (95% 0.969–1.004), no difference; hashes `d39ffa76c0a3ddc3` both |
| the same | | `day-pair.mjs --rounds 6 --eves 6 --reps 2` (`day-pair-fit-classes/`) | see below |

`fitPlaceWeights` in isolation (`micro.mts.txt`, 2,791 calls captured from two own match days,
inputs sha256 `1d9e3885…`, kept outside Git): 52% of `placed` rows are shared within a call, but
only 16% of (row, count) pairs; iterations are 87% of its time; every bit-identical variant —
the shared sum (191 ms against 192 ms), a loop interchange with a local accumulator (206–211 ms),
all rows in one typed array (195–203 ms), plain per-group rows (215 ms), local buffer aliases (199
ms) — was no faster, and even replacing the division by a reciprocal multiply (not identical)
gained under 3%. Its iteration count is the fit's convergence and cannot change without changing
weights.

## Paired own match days and waits (the `fitMoves` candidate, the closest)

| measure | directory | load | result |
|---|---|---|---|
| engine own match day, `day-pair.mjs --rounds 6 --eves 6 --reps 2` | `day-pair-fit-classes/` | 1.3–1.7 | 0.9948 (95% 0.976–1.016), no difference; median 916 → 892 ms; 36 of 36 eves equal in copy, lived and playback hashes; final world hashes equal each round |
| request-to-reply, `scripts/perf/waits-pair.ts --rounds 4 --steps 10` (`.tmp/t1064-cand` = base + `candidate-fit-classes.diff`) | `waits-pair-fit-classes/` | 1.1–2.2 | advance-days (the own match day) 1.050 (1.010–1.091) "slower", median 995 → 1,047 ms; next-event 1.020 (0.958–1.111); open-game 1.188 (1.030–1.407) and export-game 1.041 (1.012–1.080) "slower" though the change cannot reach them, so four rounds do not separate the trees beyond their noise; world and reopened hashes `8e9033c3e3ae93af` on every run; 152 of 152 matched requests equal in `replyHash` and rows put (`replies.mjs`) |

The candidate was reverted: its engine interval straddles 1 and the end-to-end wait shows no gain.

## Rerun

```sh
node --import tsx artifacts/benchmarks/T1064/day.ts --eves 6 --reps 2 --out .tmp/day.json
node artifacts/benchmarks/T1064/day-pair.mjs --base <tree> --candidate <tree> --out <dir> [--analyse]
node --cpu-prof --cpu-prof-dir <dir> --import tsx artifacts/benchmarks/T1064/day.ts --eves 6 --reps 2
node artifacts/benchmarks/T1064/under.mjs <dir>/*.cpuprofile --root ownMatchDay [--children <function>]
node artifacts/benchmarks/T1064/replies.mjs <waits-pair out dir>
```

`micro.mts.txt` reads `.tmp/t1064/cap.json`, captured by a temporary hook at the top of
`fitPlaceWeights` that pushed one call in five (`count`, `weights`, `placed` and the shared row's
index) during `day.ts --eves 2 --reps 1`; the hook was removed.
