# match-proto 261111 — second page

The second staged page of the match-engine split prototype (review/match-engine-split-261110
F2–F4, task T818), staged on the tuned values below, to be watched beside the first page.

Correction (261111, after the run): this page plays a different ten minutes from the first page,
not the same ones. T815's `grammar.minPass` changed the script, so the showcase search now settles
on `demo#0` (2-3) where the first page played `demo#17` (1-2). Compare the overall impression,
not scene by scene.

## how to open

- Open `artifacts/match-proto-261111/index.html` in a browser, and beside it
  `artifacts/match-proto-261110/index.html` (the first page, left untouched). Both are
  self-contained; no server is needed. The viewer's keys are in `scripts/match-proto/README.md`.
- `playback.json` is the staged playback; `baseline-<seed>.json` and `final-<seed>.json` are the
  `check/report.ts --json` reports before and after tuning for `demo`, `demo2` … `demo5`.
- Rebuild: `pnpm exec tsx scripts/match-proto/build.ts --seed demo --out artifacts/match-proto-261111`
  (prints `passed=24/31`).
- This task opened no page in a browser and ran no browser automation (ARCH-30); the page was
  built and judged by the metrics only.

## what to compare (the owner's three complaints)

1. Passes between players standing on each other, and pairs that stick: `events.shortKick`,
   `shape.huddle`, `shape.huddleLongest`, `shape.spacing`.
2. Both teams wheeling round at every turnover, and loose marking: `turn.reverse`, `turn.run`,
   `turn.counterRun`, `mark.near`.
3. Everyone moving and stopping together: `motion.restarts`, `motion.startSync`, `motion.speedSync`.

## tuned values (final)

| value | old | new | why |
| --- | --- | --- | --- |
| `stage.separation` | 2.5 | 3 | complaint 1: a free outfield player keeps his target 3 m (the huddle distance) from every teammate |
| `motion.own.hold` | 0.6 | 0.2 | complaint 3: a free player stands only very near his place, so he keeps easing instead of stopping and starting again |
| `motion.turn.delayPerMetre` | 0.02 | 0.026 | complaint 2: a settled turnover is believed later the farther a man is from the ball; 0.026 makes the longest delay exactly `own.memory` (2.2 s), as its comment requires |

No other file of the chain's source changed; `PROTO_CONFIG.limits` and the tests' fixed scripts
are untouched. One unit-test literal followed the new `own.hold`: `mind.test.ts` asserted
`freeSpeed(0.5, …) = 0` ("stands inside own.hold", true only while hold ≥ 0.5) and now asserts it at
`OWN.hold / 2`.

Summed pass count over the five seeds (155 at most): first page (T814) 101 → baseline 115 → final
**117**.

## log (UTC, 2026-11-11)

Correction (261111, after the run): the clock times below are the tuning session's own estimates
and run late. The baseline reports were written at 03:01Z, the final reports at 03:17Z, and the
task was committed at 03:23Z (ba01761c), so the box lasted about 20 minutes, not the two hours
recorded here.

- 03:02 baseline reports (`report.ts --seed <s> --json baseline-<s>.json`): 23 / 25 / 23 / 23 / 21 = 115.
  The two-hour box starts here. Hard metrics (`duration`, `kinematics.*`, `ball.maxSpeed`,
  `score.consistent`, `offside.consistency`) and every showcase quota (`missing=` empty) already
  hold on all five seeds, so steps 2 and 3 of the plan had nothing to fix.
- 03:05 screen 1: 32 single-value changes in memory (`producePlayback` + `computeMetrics`, five
  seeds each). Movements of ±1–4 in the summed count; the staging is chaotic, so one change moves
  every seed a little.
- 03:15 diagnosis of complaint 1 on the baseline: of 1,421 open-play frames with two teammates
  under 1.5 m, 725 are two free defenders and 255 a free defender beside the beat's opponent; of
  61 huddles over 2 s, 32 are two free defenders (markers of attackers who stand close, near the
  ball), 10 a free attacker beside the man on the ball.
- 03:25 round 1 (trial): a new staging rule `stage.roomSpeed` (a free player whose place
  `separated` moved goes there at 2.5 m/s at least) with `separation` 2.5 → 4: 115 → 121.
- 03:40 round 2: `own.hold` 0.6 → 0.2: 121 → 122 (`motion.restarts` −0.5 a player-minute).
- 03:47 round 3: `own.arrive.far` 3 → 6: 122 → 124 (`motion.restarts` passes on demo5,
  `motion.speedSync` on three seeds) but huddles rose on demo, demo2 and demo5;
  `separation` 5 on top: 123, reverted by the rule.
- 03:55 a debug trace of the longest remaining huddle (demo5, away full-back and wide midfielder,
  t ≈ 251–256): both run the same way side by side 2.2 m apart while their targets are 4.7 m
  apart — `separated` moves targets, not paths, so two men running to neighbouring places travel
  together; slower far arrival (round 3) makes such runs longer.
- 04:00 round 4: `turn.delayPerMetre` 0.02 → 0.026 (`own.memory` kept at 2.2): 124 → 126,
  `turn.reverse` passes on all five seeds. 0.03 with `own.memory` 2.4 (its comment's rule) read
  124; 0.03 with 2.2 read 126 but breaks the rule.
- 04:12 older metrics on 126: nothing raised the sum; `shape.poacherLean` 0.15 made
  `offside.consistency` fail on demo5 (a hard metric), so it was not taken.
- 04:18 the chain's unit tests on the 126 values: three failed. `perform.turn.test.ts` (T817's
  fixed settled-turnover script `S`) turned 4 of 7 movers within 1 s against at most 0.3;
  `arrive.far` 6 alone gives 3/6 and `roomSpeed` 2.5 alone 3/9, so both were reverted (the fixed
  script and the limit are not edited). `separation` 4 equals `ownerRoom` 4 and breaks
  `world.test.ts`' check that a defender keeps `separation`, not the owner's room, from a teammate
  under an order (it needs separation < 3 m < ownerRoom), so `separation` 3 was taken (117, against
  118 for 4). `roomSpeed` was removed from the code again, as unused.
- 04:42 final reports (`final-<s>.json`) and the page: 24 / 26 / 24 / 22 / 21 = 117.

## baseline and final, all 31 metrics

`!` marks a failing value. Baseline is the tree after T817 (989e4105); final is this task's tree.
"first page" is T814's reading of the first page (artifacts/match-proto-261110) for the ten
naturalness metrics.

| metric | limit | first page demo / demo2 / demo3 / demo4 / demo5 | baseline demo / demo2 / demo3 / demo4 / demo5 | final demo / demo2 / demo3 / demo4 / demo5 |
| --- | --- | --- | --- | --- |
| duration | ≥ 599.5 | | 600 / 600 / 600 / 600 / 600 | 600 / 600 / 600 / 600 / 600 |
| kinematics.maxStep | ≤ 11 | | 8.612 / 8.599 / 8.551 / 8.862 / 8.609 | 8.612 / 8.599 / 8.576 / 8.584 / 8.612 |
| kinematics.outside | = 0 | | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| ball.maxSpeed | = 0 | | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| ball.ownerDistance | ≥ 0.99 | | 1 / 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 / 1 |
| events.reception | ≥ 0.98 | | 1 / 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 / 1 |
| events.contest | ≥ 0.95 | | 1 / 0.962 / 1 / 0.963 / 1 | 1 / 0.962 / 1 / 0.964 / 1 |
| events.recastRate | ≤ 0.25 | | 0.059 / 0.125 / 0.04 / 0.148 / 0.038 | 0.059 / 0.125 / 0.04 / 0.143 / 0.038 |
| events.stretchRate | ≤ 0.1 | | 0 / 0.083 / 0.08 / 0.111! / 0.038 | 0 / 0.042 / 0.08 / 0.107! / 0.038 |
| offside.consistency | = 0 | | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| shape.swarm | ≤ 0.02 | | 0.012 / 0.027! / 0.025! / 0.027! / 0.059! | 0.012 / 0.019 / 0.023! / 0.027! / 0.053! |
| shape.teamLength.H | 22..52 | | 31.19 / 31.42 / 30.54 / 30.98 / 30.14 | 31.25 / 31.42 / 30.55 / 30.75 / 30.325 |
| shape.teamLength.A | 22..52 | | 28.75 / 29.33 / 29.21 / 30.445 / 29.115 | 28.84 / 29.24 / 29.4 / 30.39 / 28.88 |
| shape.spacing | ≤ 0.03 | | 0.065! / 0.054! / 0.059! / 0.08! / 0.055! | 0.05! / 0.051! / 0.066! / 0.08! / 0.063! |
| role.invertedFullBack.inside | ≥ 8 | | 16.249 / 15.148 / 18.291 / 14.949 / 17.505 | 16.257 / 15.08 / 18.139 / 14.53 / 17.59 |
| role.invertedFullBack.pivot | ≤ 8 | | 3.693 / 3.542 / 2.529 / 2.962 / 2.216 | 3.655 / 3.5 / 2.397 / 2.93 / 2.235 |
| role.falseNine.drop | ≥ 5 | | 12.602 / 10.982 / 10.28 / 13.557 / 10.763 | 12.539 / 10.988 / 10.203 / 13.399 / 11.03 |
| role.poacher.shoulder | ≤ 3.5 | | 3.318 / 3.34 / 2.806 / 2.732 / 3.936! | 3.261 / 3.41 / 2.772 / 2.796 / 4.072! |
| script.backPassReason | = 0 | | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| stage.pressVisible | ≥ 0.9 | | 1 / 1 (0/0) / 1 / 1 (0/0) / 1 | 1 / 1 (0/0) / 1 / 1 (0/0) / 1 |
| score.consistent | = score | | 5 / 2 / 1 / 4 / 1 | 5 / 2 / 1 / 4 / 1 |
| events.shortKick | ≤ 0.05 | 0.194! / 0.204! / 0.139! / 0.169! / 0.165! | 0.012 / 0 / 0.049 / 0.026 / 0.046 | 0.012 / 0 / 0.049 / 0.026 / 0.028 |
| shape.huddle | ≤ 0.6 | 2.311! / 2.136! / 2.451! / 2.926! / 2.757! | 1.423! / 1.643! / 1.496! / 2.152! / 1.97! | 1.105! / 1.046! / 0.997! / 1.997! / 1.838! |
| shape.huddleLongest | ≤ 4 | 7! / 8.4! / 6.3! / 11.4! / 5! | 6.2! / 4.9! / 7.8! / 5.4! / 5.8! | 4.9! / 5.6! / 2.9 / 4.8! / 5.2! |
| motion.restarts | ≤ 4 | 9.406! / 9.673! / 9.179! / 9.19! / 9.062! | 5.415! / 5.765! / 4.824! / 5.441! / 5.372! | 4.98! / 4.893! / 4.157! / 4.869! / 4.498! |
| motion.startSync | ≤ 0.2 | 0.596! / 0.608! / 0.602! / 0.669! / 0.565! | 0.204! / 0.088 / 0.061 / 0.181 / 0.111 | 0.19 / 0.075 / 0.052 / 0.175 / 0.086 |
| motion.speedSync | ≤ 0.3 | 0.537! / 0.458! / 0.456! / 0.542! / 0.461! | 0.398! / 0.298 / 0.318! / 0.382! / 0.394! | 0.392! / 0.287 / 0.315! / 0.381! / 0.397! |
| turn.reverse | ≤ 0.3 | 0.503! / 0.591! / 0.531! / 0.569! / 0.444! | 0.287 / 0.271 / 0.306! / 0.295 / 0.308! | 0.299 / 0.257 / 0.307! / 0.315! / 0.308! |
| turn.run | ≤ 0.4 | 0.775! / 0.825! / 0.7! / 0.8! / 0.825! | 0.225 / 0.3 / 0.25 / 0.25 / 0.2 | 0.25 / 0.3 / 0.25 / 0.25 / 0.2 |
| turn.counterRun | ≥ 0.5 | 0.875 / 0.8 / 0.8 / 0.8 / 0.825 | 0.375! / 0.55 / 0.65 / 0.6 / 0.45! | 0.375! / 0.6 / 0.65 / 0.65 / 0.475! |
| mark.near | ≥ 0.5 | 0.294! / 0.314! / 0.305! / 0.28! / 0.304! | 0.282! / 0.312! / 0.31! / 0.316! / 0.29! | 0.275! / 0.298! / 0.313! / 0.323! / 0.289! |
| passed | | 21 / 20 / 20 / 21 / 19 (101) | 23 / 25 / 23 / 23 / 21 (115) | 24 / 26 / 24 / 22 / 21 (117) |

## what still fails, and the suspected cause

- `shape.spacing` (all five, 0.05–0.08) and `shape.huddle` (all five, 1.0–2.0 a minute) with
  `shape.huddleLongest` (four of five, 4.8–5.6 s): mostly two free defenders near the ball, each
  marking one of two attackers who stand close (T817's one-to-one marking), and a free man beside
  the carrier. `separated` keeps targets apart but not bodies: a man easing toward his place at the
  arrival speed is caught by a teammate walking onto him, and two men running to neighbouring places
  run together side by side. Raising `separation` to 4–5 halves the huddles at best and leaves
  them near 1 a minute. A faster escape from a teammate's room (`roomSpeed`, measured 115 → 121
  with separation 4) helped but made T817's fixed settled-turnover unit test fail.
- `motion.restarts` (all five, 4.2–5.0 against 4) and `motion.speedSync` (four of five,
  0.32–0.40): free players stop at their place and start again as it drifts, and they all follow
  one shared shape input. `own.hold` 0.2 took restarts down by about 0.5; a slower arrival far from
  the ball (`arrive.far` 6) took both under their limits on some seeds but also made T817's fixed
  script turn 3 of 6 movers within the second, so it was reverted.
- `turn.reverse` (three seeds at 0.307–0.315, just over 0.3): the back lines keep their own delay
  and lag in a settled turnover (T817's design) and turn within the second; `delayPerMetre` 0.026
  made all five pass with `arrive.far` 6, not without it.
- `turn.counterRun` (demo 0.375, demo5 0.475): four to six counters a seed; players whose place
  moves less than `turn.runBeyond` (3 m) do not run. Lowering it to 1.5–2 did not help.
- `mark.near` (all five, 0.28–0.32 against 0.5): the back line marks across only and keeps its
  depth for the offside line, so a forward between the lines or ahead of the line stays beyond
  4 m; marking radius, blend and goal-side values moved it by at most 0.03 and cost passes
  elsewhere. Reaching 0.5 needs a marking rule (planning), not a value.
- `shape.swarm` (demo3–demo5, up to 0.053 on demo5): T817's markers follow attackers near the ball,
  so seven outfield players gather within 10 m.
- `events.stretchRate` (demo4 0.107: 3 of 28): one contested event over; the shorter back-line lag
  that would close it made other metrics fail.
- `role.poacher.shoulder` (demo5 4.07): the poacher on a moving line; a smaller `poacherLean`
  broke `offside.consistency`.

For the owner (limits and rules, not decided here): the huddle limit (0.6 a minute) and
`mark.near` (0.5) were set from the first page at planning time; on this split they look out of
reach by values and point at staging rules — markers that do not double up on clustered
attackers, or making room on paths rather than targets. T817's fixed-script unit test caps the
turn share at 0.3 over eight movers, so one player more turning in the last tenth of the window
fails it; it held back two changes that read 126 on the five seeds.

## scenes to look at (final `demo` playback)

Labels are the team code and shirt number with the role id, as the viewer shows numbers.

- Shortest ordinary passes (passer–receiver at the kick): 07:11 H8 (mezzala) → H3
  (invertedFullBack) 2.4 m (`layOff`); 03:44 A10 (targetMan) → A8 (boxToBox) 5.4 m (`layOff`);
  04:38 A10 → A8 5.5 m (`layOff`).
- Longest huddles: 01:13–01:18 H6 (anchor) + H8 (mezzala) 4.9 s; 07:06–07:11 H2
  (overlappingFullBack) + H7 (traditionalWinger) 4.6 s; 08:35–08:39 A8 (boxToBox) + A9 (poacher)
  4.1 s.
- First settled turnovers: 01:02 (A wins it, A7 wideMidfielder on the ball), 03:56 (H, H4
  centreBack), 03:58 (A, A6 ballWinner). First counters: 00:08 (A, A3 fullBack), 02:49 (A, A5
  centreBack).
- Longest completed passes (watch the block shift after them): 08:50 A2 (overlappingFullBack) →
  A11 (traditionalWinger) 64 m (`outlet`); 01:24 A7 (wideMidfielder) → A11 55 m (`wideRelease`).
- T800's list: first goal 00:16 A9 (poacher); first offside call 02:52 (A5 centreBack's ball for
  A9 poacher); invertedFullBack receptions 03:04, 04:59, 06:18 (H3); falseNine `dropLink`
  receptions 00:58 (H9 from H5 ballPlayingDefender) and 02:32 (H9 from H8 mezzala); first
  `switchPlay` 01:01 H10 (boxToBox) → H11 (invertedWinger); first corner 01:59 A11.

## the picture in numbers (final `demo`)

- `motion.speedSync` bands (share of speed samples per band, slowest first):
  0.055 / 0.644 / 0.17 / 0.113 / 0.02 (baseline 0.07 / 0.629 / 0.17 / 0.112 / 0.019).
- Completed passes that go straight back to the man who passed: 7 of 74 (no limit).
- Script volumes of the performed beats against T800's sanity ranges (the script is the first
  page's, unchanged): passes 100 (80–350, in), completion 90% (72–94%, in), shots 14 (2–12, over),
  goals 5 (0–4, over), offsides 2 (0–3, in), corners 2 (0–4, in), throw-ins 0 (1–10, under),
  tackles + interceptions 13 (4–40, in), share of beats H 59% / A 41% (30–70%, in). The showcase
  search picks an eventful ten minutes, which is where the shots and goals run over.
