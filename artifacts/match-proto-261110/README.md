# match-proto 261110: ten staged minutes

Delivery of T800 (review/match-engine-split-261110 F1). The prototype writes a probabilistic script
of on-ball beats and stages it afterwards as bounded movement. This folder holds the page to watch,
its playback and the measurements of the tuning run. Nothing here is production code or data.

## how to open

- Open `index.html` in this folder directly (playback and viewer are inline), or
- `pnpm exec tsx scripts/match-proto/build.ts --seed demo --serve`, then `http://localhost:4310/`
  (that command writes to `.tmp/match-proto`; add `--out artifacts/match-proto-261110` to rebuild
  this folder).
- Keys: `space` play, `1` `2` `3` speed, `←` `→` seek 5 s, `o` offside lines, `r` role ids, `t` the
  ball's trail.

Files: `index.html` (2,340,309 bytes) and `playback.json` from
`pnpm exec tsx scripts/match-proto/build.ts --seed demo --out artifacts/match-proto-261110` (seed
used `demo#17`, passed 20/21); `baseline-<seed>.json` and `final-<seed>.json` from
`pnpm exec tsx scripts/match-proto/check/report.ts --seed <seed> --json <file>` for `demo`, `demo2`,
`demo3`, `demo4`, `demo5`. The page was not opened in a browser by the task, and no browser
automation ran.

## scenes to look at (`demo`, staged clock)

| clock | scene |
| --- | --- |
| 00:34 | first corner: `H9` takes it for the home side (beat #8; the delivery is cut out) |
| 01:03 | `falseNine` `H9` drops and receives a `dropLink` from `H10` (beat #14) |
| 01:09 | first `recycle`: `H8` → `H3`, reason `reset` (beat #16) |
| 01:24 | first offside call: runner `A9` (`poacher`, `decisions` 32), played in by `A3` (beat #20) |
| 01:45 | `invertedFullBack` `H3` receives an `intoPivot` from `H5` (beat #24) |
| 01:53 | `H3` receives an `intoPivot` from `H1` (beat #27) |
| 02:02 | `H3` receives an `intoPivot` from `H5` (beat #29) |
| 02:18 | first `switchPlay`: `H11` → `H2` (beat #34) |
| 02:25 | first completed through ball to a runner with `decisions` ≥ 70: `H7` → `H11` (`decisions` 86, beat #36) |
| 02:28 | first goal: `H11` through on goal (`oneOnOne`, beat #37), 1-0 |
| 03:08 | `A2` scores, 1-1 |
| 04:57 | `A9` scores, 1-2 (final score) |
| 05:25 | `H9` receives a second `dropLink` from `H10` (beat #75) |

## pass counts

| seed | baseline (seed used) | final (seed used) |
| --- | --- | --- |
| demo | 16/21 (`demo#0`) | 20/21 (`demo#17`) |
| demo2 | 15/21 (`demo2#22`) | 19/21 (`demo2#4`) |
| demo3 | 15/21 (`demo3#1`) | 19/21 (`demo3#4`) |
| demo4 | 14/21 (`demo4#3`) | 20/21 (`demo4#8`) |
| demo5 | 14/21 (`demo5#3`) | 18/21 (`demo5#4`) |
| sum | 74/105 | 96/105 |

Failing at the baseline:

| seed | failing metrics (value) |
| --- | --- |
| demo | `events.contest` 0.846, `events.stretchRate` 0.214, `shape.swarm` 0.103, `shape.spacing` 0.155, `role.poacher.shoulder` 4.639 |
| demo2 | `events.contest` 0.875, `events.stretchRate` 0.13, `shape.swarm` 0.055, `shape.spacing` 0.132, `role.poacher.shoulder` 4.634, `stage.pressVisible` 0 |
| demo3 | `events.reception` 0.943, `events.contest` 0.852, `events.stretchRate` 0.154, `shape.swarm` 0.058, `shape.spacing` 0.185, `role.poacher.shoulder` 4.197 |
| demo4 | `events.reception` 0.943, `events.contest` 0.889, `events.recastRate` 0.278, `events.stretchRate` 0.167, `shape.swarm` 0.06, `shape.spacing` 0.16, `role.poacher.shoulder` 5.642 |
| demo5 | `events.contest` 0.826, `events.stretchRate` 0.182, `offside.consistency` 1, `shape.swarm` 0.079, `shape.spacing` 0.152, `role.poacher.shoulder` 4.581, `stage.pressVisible` 0.25 |

Failing at the end:

| seed | failing metrics (value, limit) |
| --- | --- |
| demo | `shape.spacing` 0.096 (≤ 0.03) |
| demo2 | `shape.swarm` 0.035 (≤ 0.02), `shape.spacing` 0.083 |
| demo3 | `shape.swarm` 0.035, `shape.spacing` 0.097 |
| demo4 | `shape.spacing` 0.114 |
| demo5 | `shape.swarm` 0.023, `shape.spacing` 0.124, `role.poacher.shoulder` 3.949 (≤ 3.5) |

## why they still fail (suspected causes)

- `shape.spacing` (every seed): two outfield teammates within 1.5 m in 8–12% of frames against 3%.
  Most crowded frames hold a pair the script put together: the passer and the next receiver on
  short `interior`, `layOff` and `circulate` passes, a carrier running past a teammate, a jockeying
  defender beside a teammate, two defenders converging on a carrier. A separation rule for free
  players at 2.5 m cut it by about a fifth; at 4–6 m it reaches 0.06–0.10 but pulls defenders off
  their contests (`events.contest`, `events.stretchRate` then fail). 3% looks out of reach while
  beats put teammates together; whether the limit should leave out the beat's own actors is a
  question for the owner.
- `shape.swarm` (demo2, demo3, demo5): seven or more outfield players within 10 m of the ball in
  2.3–3.5% of open-play frames against 2%, mostly in the final third with the ball just outside the
  box, most often three attackers and four defenders around a wide ball. The defensive shape (width,
  marking, cover) took it from 5.5–10.3% to 1.1–3.5%; a longer defensive block helps more but the
  shape's pinned reference test and a metric test fix `shape.oop.depth`.
- `role.poacher.shoulder` (demo5): off the ball the poacher stands 1.3 m inside the line on
  average (limit 3.5), but the metric averages every possession frame, including the frames he has
  the ball (10.0 m) or is the beat's actor (8.4 m), 260 of his 822 frames in demo5. No
  staging value can lift that average; the metric would have to leave out his on-ball frames, which
  is the owner's call.

## findings for the owner

- Nominal and staged places part after a turnover: the script casts a through-ball runner from his
  nominal spot, but on the pitch he can be 30 m behind the line, and the staging can only wait
  (`stage.through.maxWait` 5 s) and hold the defending line (the trap) without changing the beat.
  demo2's counter offside (beat 16) is now 0.9 m beyond the line (on halfway); nearby values
  (`shape.press.coverGap` 18) put the runner back onside. A script that knew roughly where players
  stand after a transition, or a rule letting staging delay a beat further, would remove this.
- The unit tests pin several tuning values: `shape.oop.depth`, `shape.oop.width` below about 0.93
  (the block must stay narrower than in possession), `shape.oop.lateral` from 0.2, a press
  `standoff` up to 3.5, `stage.cutSlack` up to about 0.35, `shape.shoulderGap` not below
  `shape.onsideGap`. Values beyond them were measured but not used.
- In demo3 the last performed beat is a goal cut by the ten-minute end: the report's script score is
  1-2 while the staged score is 1-1 (`score.consistent` passes on staged goals, detail
  `goalBeats=2/3`).
- Every fix keeps the script's outcome, actor and receiver; no metric needed a change of that rule.
  `PROTO_CONFIG.limits` and the tests' fixed scripts were not edited.

## script volumes (performed beats, both teams, per ten staged minutes)

| seed | passes | completion % | shots | goals | offsides | corners | throw-ins | tackles + interceptions | home share of beats % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| range | 80–350 | 72–94 | 2–12 | 0–4 | 0–3 | 0–4 | 1–10 | 4–40 | 30–70 |
| demo | 117 | 87.2 | 7 | 3 | 2 | 1 | 2 | 19 | 61.7 |
| demo2 | 119 | 84.0 | 11 | 1 | 4 | 1 | 4 | 19 | 58.5 |
| demo3 | 113 | 86.7 | 12 | 3 | 2 | 1 | 1 | 22 | 54.9 |
| demo4 | 104 | 79.8 | 9 | 2 | 3 | 2 | 2 | 21 | 66.0 |
| demo5 | 109 | 82.6 | 10 | 2 | 2 | 5 | 6 | 22 | 62.9 |

At the baseline demo had 6 goals and demo4 14 shots and 6 corners. At the end every volume lies in
its range except demo2's 4 offsides and demo5's 5 corners, one above the range each; neither is far
outside it, so no `grammar` value was changed for volumes. Every showcase quota stays met for
`demo` on its performed beats.

## tuned values

| value | old → new |
| --- | --- |
| `shape.oop.width` | 0.75 → 0.9 |
| `shape.oop.lateral` | 0.5 → 0.2 |
| `shape.shoulderGap` | 0.7 → 0.5 |
| `shape.press.standoff` | 3 → 3.5 |
| `shape.press.coverGap` | 8 → 14 |
| `shape.mark.radius` | 9 → 7 |
| `shape.mark.blend` | 0.45 → 0.2 |
| `stage.holdDrift` | 2.5 → 1.5 |
| `stage.maxExtraHold` | 2 → 1.5 |
| `stage.cutSlack` | 0.15 → 0.35 |
| `stage.through.maxWait` | 3 → 5 |
| `stage.boards` (new) | 2 (the target clamp `world.ts` already used) |
| `stage.separation` (new) | 2.5 |

Staging and script fixes, each with a unit test that failed before it:

- script: no through ball when the defending line leaves no room behind it before `through.maxX`
  (demo5 played one from the byline, and its runner could never be offside);
- a late interceptor or receiver collects the ball where it lies instead of it jumping to his feet
  (a cross cut out 6 m from the interceptor moved at 54.6 m/s);
- a through-ball runner chases a ball going out only as far as the line;
- a beat the script calls pressed is pressed wherever the ball is (the counter side never pressed
  deep, so pressed passes went unpressed);
- the shapes read a ball flying out at the line, and the boards stop a player 2 m outside it
  (braking from a sprint carried defenders 2.6 m off the pitch);
- the back line holds for an early offside runner (the trap);
- a restart pass's scripted interceptor waits on its lane during the dead ball;
- the last-shoulder role never jogs while his side has the ball;
- a shot blocked far out goes behind for a corner at deflection speed, not in the parry's time
  (56 m/s);
- an ordinary pass waits for its receiver to be back onside after the extra hold;
- a free outfield player keeps his target `stage.separation` from every outfield teammate.

## log (UTC, 261110)

The two-hour box ran from the baseline at 16:48; tuning stopped at 17:22, when the remaining
failures had been traced to the causes above and no screen raised the sum any more, and the
delivery was built at 17:23.

| round | change | sum (demo, demo2, demo3, demo4, demo5) | kept |
| --- | --- | --- | --- |
| 0 | baseline | 74 (16, 15, 15, 14, 14) | - |
| 1 | script: no through ball without room behind the line; stage: a late interceptor or receiver collects the ball; a through-ball runner chases a ball going out only to the line | 82 (18, 15, 15, 18, 16) | yes |
| 2 | `stage.through.maxWait` 3 → 5 | 84 | yes |
| 3 | stage: a beat the script calls pressed is pressed whatever the side's style | 89 (19, 17, 17, 18, 18) | yes |
| - | screens kept out: `stage.holdDrift` 2.5 → 1 (88), `grammar.showFor` 3 → 1.5 (89), a free-player separation rule (88), `motion.jogWithin` 10 → 5 (88), `stage.lunge` 2 → 3 (89) | - | no |
| 4 | stage: shapes read a flight going out at the line; bodies stop at the boards (`stage.boards` 2) | 89 | yes |
| 5 | `stage.cutSlack` 0.15 → 0.3, `shape.shoulderGap` 0.7 → 0.5 | 93 | yes |
| 6 | `shape.oop.width` 0.75 → 0.9, `shape.oop.lateral` 0.5 → 0.2, `shape.mark.blend` 0.45 → 0.2, `shape.mark.radius` 9 → 7, `shape.press.coverGap` 8 → 14, `shape.press.standoff` 3 → 3.5, `stage.cutSlack` 0.3 → 0.35 | 93 (swarm 0.05–0.12 → 0.014–0.044) | yes |
| 7 | stage: the back line holds for an early offside runner (the trap) | 93 | yes |
| 8 | stage: a restart pass's scripted interceptor waits on its lane during the dead ball | 94 (20, 18, 18, 20, 18) | yes |
| 9 | stage: the last-shoulder role never jogs while his side has the ball | 95 (20, 18, 19, 20, 18) | yes |
| - | screens kept out: `shape.oop.depth` 29/26 → 34/31 or 32/29 (96, but breaks the pinned shape reference and metric tests), `press.coverGap` 18 (94, an offside kick), `ip.lateral` 0.08 (92, a 56 m/s ball), `jogWithin` 8, `transitionSeconds` 4, `mark.goalSide` 2.5 (95 each), a far runner sprinting from the start (no effect) | - | no |
| 10 | stage: a shot blocked far out goes behind for a corner at `shot.deflectSpeed`, not in `shot.parryTime` | 95 | yes |
| 11 | `stage.maxExtraHold` 2 → 1.5, `stage.holdDrift` 2.5 → 1.5 | 96 (20, 19, 19, 20, 18) | yes |
| - | screens kept out: `holdDrift` 1 (96, no better), `maxExtraHold` 1.25 (94, an offside kick), `maxExtraHold` 1 (94), `grammar.showFor` 2 (93), `press.coverGap` 16 (95), `mark.blend` 0.1 (96, no better), `mark.radius` 6 (94), `ip.lateral` 0.12 (93) | - | no |
| 12 | stage: a free outfield player keeps his target `stage.separation` (new, 2.5) from every outfield teammate | 96 (spacing 0.086–0.144 → 0.083–0.124) | yes |
| 13 | stage: an ordinary pass is not kicked to a receiver still offside after the extra hold (waits up to `through.maxWait`) | 96 | yes |
| - | screens kept out: `stage.separation` 3 (95), 4 (94), 6 (93) | - | no |

Each round was measured on all five seeds with the same staging and metrics as `report.ts`; the
final reports above come from `report.ts` itself.
