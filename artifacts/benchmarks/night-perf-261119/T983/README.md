# T983 — place-weight fitting and attribution kernels (np19)

Machine: Apple M1 Max, 10 cores, Node v26.8.1, a shared host under heavy load (load1 10–110 during
these runs). Calls follow `scripts/perf/ab.mjs`'s paired CPU interval, not wall seconds. Base
9b3b3853 (T983 start). Every run kept its output hashes equal (aggregate `09c4b698345ff9fc`, day
`a56436ea3e565194`).

## Final (whole change against the base, 6 processes)

| workload | CPU ratio (95%) | call |
|---|---|---|
| aggregate (`ab-aggregate.json`) | 0.768 (0.758–0.783) | faster |
| day, own match days (`ab-day.json`) | 0.849 (0.836–0.866) | faster |
| day, other days | 0.997 (0.959–1.029) | no difference |

## Parts, each against the tree just before it (aggregate, 6 processes)

| part | file | CPU ratio (95%) | kept |
|---|---|---|---|
| 1 typed-array `fitPlaceWeights` with once-computed `count * placed` rows | `part1-typed-fit.json` | 1.000 (0.975–1.026), load 10→49 | yes, the task's prescribed form; its per-call Float64Arrays were then replaced by part 2c |
| 2a an index of distinct placed arrays, one normaliser each per iteration | `part2a-distinct-normaliser-restored.json` | 1.005 (0.994–1.015) | no, restored |
| 2b `attributeSide`'s `actorCounts` read from `failures` without building `failedLines` | `part2b-actor-counts.json` | 0.930 (0.912–0.948) | yes |
| 2c `fitPlaceWeights` rows in one process-wide scratch buffer (a Float64Array over 64 bytes is allocated off V8's heap) | `part2c-fit-scratch.json` | 0.927 (0.914–0.942) | yes |
| 2d `share` of each exposure computed once per period and role, read by `weights` and every cell's `weightsAt` | `part2d-exposure-shares.json` | 0.937 (0.931–0.944) | yes |
| 2e `playingSpan`/`commonSpan` as pairwise `Math.min`/`Math.max` loops | `part2e-span-loops.json` | 0.984 (0.978–0.994) | yes |

## Line profiles (`node scripts/perf/profile.mjs --workload aggregate --lines <fn>`)

- `fitPlaceWeights` (before 2c): `actual[p] += cp[p] * scale[p] / sum` 45.9%, `sum += placed[p] * scale[p]` 33.5%; the `counted` row allocation was a separate 4.2% self closure. After 2c the same two lines hold 49.6% / 31.2%: the fit is bound by its own arithmetic.
- `attributeSide` (before 2b): `failures.flatMap((k, line) => Array(k).fill(line))` 35.1%, `pinned.get(index)` 7.9%, the `actorWeights` lookup 6.7%, `failures = attempts.map(...)` 6.3%.
- `share`: `role.byLine[this.slotLines[slot]] * minutes` 23.1%, `terms[at]` 17.4%, `actionWeight` 15.7%. 2d removes the repeated calls: one per exposure and role instead of one per cell as well.
- `settleParticipation`: 2–3 self ticks (the `decisions` id string, `planParticipation`, the input spread); its cost is in its children.
- `generateTeamFacts`: 17–23 self ticks, top line `sideUnits(...)` 35–39%; its cost is spread over draw-bound children (`binomial`, `multinomial`, `passGroup`), and no repeated pure work was found to remove.
