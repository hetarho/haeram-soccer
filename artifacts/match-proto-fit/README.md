# match-proto fit verdict (T822)

A script written from the aggregate path's settled result, for ten real settled matches
(`scripts/match-proto/fixtures/settled/s01` … `s10`), staged in full: whether it still counts back
to the record exactly, what it had to invent between the recorded events, what it costs, and what
the aggregate path would have to hand over or change. Measured 261111 on this host
(hq-dev1-pve2-vm2, Node 24.22.1); the chain is `scripts/match-proto/` (T791's rules), nothing
under `packages/`, `apps/` or `tests/` changed.

## how to open

- `index.html` here is self-contained: open it directly in a browser. It plays `s01` fitted and
  staged from kick-off to the final whistle (every `viewer.matchStride` = 2nd staged frame), the HUD
  shows the record's match clock (`mm:ss`), the score from goal events and the beat identifiers;
  `▶`/`❚❚`, speeds `1×` `5×` `20×` (`viewer.matchSpeeds`), the seek bar, `←`/`→` 5 s, `o` offside
  lines, `r` role ids, `t` the ball's trail. `playback.json` is the same playback as data.
- Rebuild: `pnpm exec tsx scripts/match-proto/build.ts --match s01 --out artifacts/match-proto-fit`
  (`bytes=13166559`, `seed=s01:fit`, `passed=19/30`).
- Every report: `pnpm exec tsx scripts/match-proto/check/report.ts --match sNN --json <file>`;
  `baseline-sNN.json` and `final-sNN.json` here are those files before and after this task.
- This task did not open the page in a browser and ran no browser automation (ARCH-30).

## verdict, one line per open question (measured, ten matches)

1. **What the script invents, and whether it reads as football.** Per match 381 link carries
   (5,401 m, 14.2 m each, longest 90.9 m), 17.2 heavy touches and 11.4 restarts no recorded pass
   delivers (74.1 delivered by recorded rows), against 1,022 carries (26,183 m), 196 heavy touches
   and 60.3 / 25.2 restarts for the greedy writer of T820. The record's own flows leave 243–337 rows a
   match starting where the ball never arrives (about 4.5–8.3 km of carrying by a greedy transport),
   so the link metres now sit at that floor; the heavy touches follow the gap between the two sides'
   possession-ending rows (mean 12.8 a match). The staging reads at T818's grammar level
   (`motion.*`, `shape.*`, `turn.*`), worse only where the record's choice of player is far from his
   role (`events.contest`, `events.stretchRate`) and where the record names no reason
   (`script.backPassReason`).
2. **Can the staging perform a real result's density without strain.** Yes, to the last beat and
   exactly: `fit.exact`, `fit.performed`, `fit.recast` are 0 on all ten. A minute of the record takes
   1.03–1.18 staged minutes (`fit.clockRatio`; 1.58–1.92 before), late winners 3–15 a match (11–19),
   contests won where the record says by a man within reach 563 of 614 (91.7%; 558, 90.9% before;
   limit 95%), the busiest minute 26–40 beats against a median of 15–21, the most a minute needed
   beyond sixty seconds 42–102 s (108–163 s before).
3. **What it costs.** `writeFitted` median 246 ms (worst 289), `performScript` median 7,969 ms
   (worst 8,625) for ninety minutes on this host (237 / 272 ms and 12,744 / 14,961 ms before); the
   page 13,166,559 bytes at `matchStride` 2 (21,104,038 before: fewer staged seconds).
4. **What should change upstream.** The attribution chooses its players without the pitch: a
   recorded actor stands a median 21 m from where his role stands for that cell, 54% of rows more
   than 20 m (a grammar script's: 9.9 m, 5.8%). The flows are counted per move group, not drawn as
   chains: wing lanes release 1,459 more rows than reach them over the ten (throw-ins excepted, about
   330 of them), the half-spaces receive 985 more than they release. The two sides' possession-ending
   rows differ by 1–32 a match, each unit a heavy touch the script must invent. Free kicks: 18–30 a
   match against 3–9 rows flagged as free-kick deliveries.

## what changed (final state)

- `fit/touches.ts`: `dealFixed` and `FLOATING` — only shots, their sources and booked fouls keep
  the record's minute; every other row floats. A floating completed carry joins the release of its
  player whose start (its first carry's `from`, else its release's cell) is nearest where the carry
  ends (`fit.carryJoin` 1000: every carry joins).
- `fit/write.ts` (`writeFitted`): the next touch is taken from the whole match, not a dealt minute:
  this minute's fixed touches and every floating one, the cheapest by `touchCost` (metres from the
  ball's cell to where the touch starts; `fit.fixedPull` 20 m off for a touch fixed to this minute,
  `fit.fixedPush` 300 m once the minute's share is played; a possession-ending touch up to
  `fit.paceBias` 15 m cheaper the further its side is ahead, `fit.paceSlack` 0.02). A minute ends
  with its even share of all touches played (`quota`) and nothing fixed to it left. When the minute
  waits only on the other side's fixed touch and the side on the ball has no possession-ending touch
  left (or that touch is a goal nobody's pass made), the holder loses the ball to it by a heavy
  touch. A side spending its possession-ending rows more than `fit.endsSlack` 0.03 ahead of the other
  side loses the ball by a heavy touch instead (floating own touches only), so the heavy touches the
  record's imbalance needs are spread over the match. A won corner (pass or shot) no longer counts
  as possession-ending. A pass's receiver plays the touch he was chosen for. At a half's end an owed
  restart is delivered before a pass in flight is received (with floating rows the restart's delivery
found a recorded pass whose reception the half-time kick-off then dropped: s07's row 530). A
  goal kick is never delivered to the keeper who takes it (s09's ball jumped 16 m in a frame).
- `fit/count.ts`: `fitCost`'s `movedCarries` reads the writer's dealing.
- `stage/pass.ts`: an intercepted through ball without a named runner is cut out as an ordinary pass
  (s08 stopped at beat 1592, `through ball without runner`).
- `core/config.ts`: `fit.fixedPull`, `fixedPush`, `fixedRamp` (0), `paceBias`, `paceSlack`,
  `endsSlack`, `placeWeight` (0), `carryJoin` (1000), `setPieceWait` (0); the measured-but-off
  values say in their comments what they cost.
- Not changed: `PROTO_CONFIG.limits`, the settled files, the tests' fixed scripts, any `stage.*`
  value. No connective pass in open play, no recorded event dropped, moved off its recorded minute or
  given to another player.
- Unit tests: `stage/perform.bound.test.ts` `an intercepted through ball without a runner is cut out
  by the scripted man` (failed before the fix); `fit/write.test.ts` `every settled match is written
  exactly, a restart owed at the whistle included`, `nobody passes to himself, a restart included`
  (failed before the fix on s09), `a completed pass is mostly received where the next touch starts`,
  `every minute holds its share of the recorded rows`, `both sides spend their possession-ending rows
  at one pace, so neither runs out`; `fit/touches.test.ts` `dealFixed keeps the minutes the record
  states and floats every other row`, `a floating carry runs into the release of his whose start it
  meets`.

## round log (UTC; the clock read with `date -u` and the reports' file times)

Each round changes one writer rule or value, reruns `s01`–`s05` and is kept only when the sum of
`fit.linkMetres` and `fit.miscontrols` goes down with the contests and receptions won as recorded
(summed over the five) not fewer and the worst `kinematics.maxStep` of the five not higher.

| time | round | s01–s05 linkMetres + miscontrols | other numbers | kept |
| --- | --- | --- | --- | --- |
| 05:41–05:42 | baseline, all ten (`baseline-sNN.json`) | 123,544 + 927 | `s08` stopped at beat 1592: through ball without runner | - |
| 05:44–05:45 | step 2: the intercepted through ball without a runner, with its unit test; `s08` re-read (its `baseline-s08.json` is the fixed staging) | - | `s08` staged to the end | yes |
| 05:46–05:53 | 1: rows the record gives no minute float; the order of play deals them | 25,780 + 77 | clockRatio 1.58–1.73 → 1.02–1.09; contests 259 → 257 of 285; `motion.restarts` 3.3 → 5.0 | yes (contest −2 inside its noise; the step this task exists for) |
| 05:53 | 1b: a pass's receiver plays the touch he was chosen for | unchanged | - | yes (no effect) |
| 05:54–05:56 | 2: interceptions and tackles at the point of their cell nearest the winner's place | 25,671 + 77 | late 52 → 43; contests 257 → 254 | no |
| 05:57 | 3 (step 4): `placeWeight` 0.05 / 0.5 (a receiver near where the pass lands) | 26,882 / 29,144 (writer only) | receivers 19.0 → 17.0 / 15.5 m from their places | no |
| 05:58–05:59 | 4 (step 5): `fit.hold` [0.4, 5] → [0.4, 2.6] | unchanged | clockRatio 0.95–1.07; `motion.restarts` 5.0 → 4.93; contests −1 | no |
| 06:00 | 5 (step 5): `fixedRamp` 80 (the fixed pull grows as the minute fills) | 26,056 (writer only) | busiest minute over ten 84 → 39 beats | no |
| 06:01–06:03 | 6: `carryJoin` 0 (a carry joins a release only in its exact cell) | 25,405 + 81 | contests −1; maxStep lower on all five | no |
| 06:04–06:06 | 7: possession-ending rows spent at one pace by both sides (`endsSlack` 0.03); a won corner keeps the ball | 24,970 + 79 | contests 257 → 260; maxStep worst 10.554 → 10.439; no empty minute; s06's 25 of 33 heavy touches in its last ten minutes → spread every ~3 minutes | yes |
| 06:06–06:07 | 8: `paceBias` 15 → 5 | 24,546 + 82 | contests 260 → 256; s04 got an empty minute and a 58-beat minute | no |
| 06:07–06:08 | final read, all ten | 24,970 + 79 | - | - |
| 06:10–06:12 | step 2: a goal kick never to its own keeper, with its unit test; final read again, all ten | 24,970 + 79 (s01–s05 unchanged) | s09 `ball.maxSpeed` 1 → 0 | yes |
| 06:18–06:19 | 9: `endsSlack` 0.03 → 0.015 / 0.05 | 25,312 / 25,262 (writer only) | - | no |
| 06:19–06:21 | 10: `setPieceWait` 30 (a flagged corner or free-kick delivery waits for its restart) | 25,906 (writer only) | orphan set pieces s03–s05 36 → 25 | no |

"Writer only": the script was written and validated on all ten and its cost read on `s01`–`s05`
without staging; a round whose written cost already rose was not staged. Every written script of
every round, kept or not, had `validateFitted` problems 0 and the record counted back from its beats
exactly on all ten (`countScript`, the writer's own count); the staged count (`fit.exact`) was read on
`s01`–`s05` each staged round and on all ten at the baseline and the final reads.

`events.contest` moves by one to three contests a match under any reordering (a different order
casts the same recorded winners into different moments), so its sum over the five, not each match,
decides; three of the rejected rounds (2, 6, 8) lowered the score and lost one to four contests.

## findings

### what the script invents per match (ninety minutes)

Baseline: the greedy writer of T820 (rows dealt to minutes by a shuffle, joined by the nearest cell).

| match | beats | links | link m | mean m | longest m | heavy touches | minutes with one | restarts connective / by a recorded row | orphan set pieces + free-kick shots | maxOverrun s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01 | 2499 → 1618 | 1036 → 368 | 26538 → 5080 | 25.6 → 13.8 | 97.6 → 68.7 | 180 → 20 | 90 → 19 | 63/19 → 10/72 | 16 → 11 | 131.8 → 57.3 |
| s02 | 2285 → 1527 | 962 → 383 | 24161 → 5037 | 25.1 → 13.2 | 92.3 → 67.5 | 168 → 24 | 87 → 18 | 47/21 → 12/56 | 14 → 9 | 108.5 → 86.7 |
| s03 | 2182 → 1391 | 884 → 340 | 24038 → 5017 | 27.2 → 14.8 | 89.1 → 68.6 | 203 → 11 | 88 → 10 | 63/23 → 8/78 | 18 → 12 | 140.5 → 60.5 |
| s04 | 2267 → 1433 | 923 → 319 | 23754 → 4821 | 25.7 → 15.1 | 86.7 → 73.6 | 190 → 5 | 88 → 5 | 59/23 → 14/68 | 17 → 8 | 122.6 → 59.1 |
| s05 | 2408 → 1568 | 988 → 355 | 25053 → 5015 | 25.4 → 14.1 | 103.5 → 76.1 | 186 → 19 | 85 → 17 | 57/24 → 17/64 | 19 → 15 | 162.8 → 47.2 |
| s06 | 2516 → 1618 | 1043 → 350 | 25965 → 4796 | 24.9 → 13.7 | 89.3 → 90.9 | 197 → 34 | 86 → 29 | 51/20 → 9/62 | 8 → 7 | 125.2 → 42.4 |
| s07 | 2586 → 1713 | 1034 → 425 | 27103 → 6209 | 26.2 → 14.6 | 96.3 → 74.9 | 231 → 27 | 88 → 23 | 69/34 → 9/94 | 15 → 10 | 150.8 → 71.1 |
| s08 | 2732 → 1835 | 1146 → 474 | 29926 → 6743 | 26.1 → 14.2 | 97.0 → 86.0 | 191 → 7 | 86 → 5 | 53/31 → 12/72 | 18 → 12 | 146.8 → 65.2 |
| s09 | 2763 → 1779 | 1144 → 402 | 28643 → 5575 | 25.0 → 13.9 | 96.3 → 53.8 | 201 → 13 | 86 → 12 | 63/29 → 9/83 | 14 → 7 | 142.5 → 49.8 |
| s10 | 2627 → 1693 | 1060 → 394 | 26647 → 5721 | 25.1 → 14.5 | 97.9 → 77.7 | 216 → 12 | 87 → 11 | 78/28 → 14/92 | 19 → 14 | 144.0 → 102.2 |
| mean | 2487 → 1618 | 1022 → 381 | 26183 → 5401 | 25.6 → 14.2 | max 103.5 → 90.9 | 196.3 → 17.2 | - | 60.3/25.2 → 11.4/74.1 | 15.8 → 10.5 | 137.6 → 64.2 |

Restart beats by kind over the ten, connective / delivered by a recorded row: baseline kick-off
13/28, free kick 116/120, goal kick 139/15, throw-in 252/79, corner 83/10; final kick-off 0/41,
free kick 8/228, goal kick 32/122, throw-in 47/284, corner 27/66. `s01`–`s05` (tuned on): link
metres 123,544 → 24,970, heavy touches 927 → 79; `s06`–`s10` (never tuned on): 138,284 → 29,044,
1,036 → 93.

### where the invention comes from in the record

A row starts where its cell says; the ball reaches a cell only by a row that ends there for the same
side (a completed or kept pass, a completed carry) or by a turnover into it (an interception, a
recovered loose ball, a tackle, a save or block). Counted per side and cell over the record alone
(restart spots not counted):

| match | rows | rows starting where the ball arrives less often | arrivals left over | greedy transport, m |
| --- | --- | --- | --- | --- |
| s01 | 1220 | 271 | 197 | 4,841 |
| s02 | 1108 | 243 | 185 | 5,845 |
| s03 | 1032 | 243 | 163 | 5,899 |
| s04 | 1095 | 265 | 192 | 4,463 |
| s05 | 1177 | 277 | 202 | 4,770 |
| s06 | 1225 | 271 | 203 | 4,875 |
| s07 | 1252 | 337 | 243 | 6,640 |
| s08 | 1342 | 291 | 214 | 8,256 |
| s09 | 1355 | 292 | 203 | 6,621 |
| s10 | 1273 | 298 | 199 | 6,343 |

- Departures minus arrivals over the ten, by lane from each side's own left: +699, −477, +313,
  −508, +760; by band from its own goal: +20, −19, +312, +497, +112, +200, −393, +58. The wings
  release more than reaches them (throw-ins, about 330 over the ten, explain a part), the half-spaces
  and the band in front of the box receive more than they release. The final link metres (4.8–6.7 km
  a match) sit on that transport: the remaining invention is the record's, not the order's.
- The aggregate ledger counts a move group as N attempts of one kind from one cell to one cell by
  the side; nothing says which attempt follows which. A natural script would need the flows drawn as
  chains (each arrival paired with a departure from the same cell, as a possession is), or at least
  each cell's arrivals and departures balanced per side.
- Possession-ending rows (a failed pass that is not a won corner, a lost carry, a shot not won as a
  corner) per side, home / away: s01 48/63, s02 43/56, s03 63/55, s04 57/56, s05 71/54, s06 77/45,
  s07 91/70, s08 63/65, s09 74/64, s10 66/75; differences 15, 13, 8, 1, 17, 32, 21, 2, 10, 9 (mean
  12.8). Possessions alternate, so each unit of difference is a turnover the record does not hold:
  the final heavy touches (20, 24, 11, 5, 19, 34, 27, 7, 13, 12) follow it. Minutes holding a heavy
  touch: 85–90 of 90 before, 5–29 now.

### recorded actors far from where their role stands

The distance from a player's place for that ball (`core/shape.ts` `nominalSpot`, ball at the cell's
centre, his side's phase) to the centre of the cell the record puts him in, for every attempt's
actor, contest winner, shooter, fouled man and fouler:

| match | rows read | median m | over 20 m | over 30 m | over 40 m | contest winners over 20 m |
| --- | --- | --- | --- | --- | --- | --- |
| s01 | 1290 | 20.9 | 667 | 283 | 108 | 29 / 46 |
| s02 | 1166 | 20.9 | 631 | 295 | 123 | 24 / 41 |
| s03 | 1090 | 21.2 | 619 | 347 | 146 | 25 / 38 |
| s04 | 1148 | 22.5 | 613 | 276 | 104 | 18 / 37 |
| s05 | 1248 | 20.1 | 626 | 311 | 123 | 23 / 50 |
| s06 | 1285 | 20.9 | 664 | 302 | 125 | 30 / 47 |
| s07 | 1340 | 21.1 | 742 | 394 | 171 | 37 / 62 |
| s08 | 1409 | 21.2 | 783 | 447 | 167 | 30 / 52 |
| s09 | 1433 | 20.9 | 752 | 355 | 136 | 27 / 54 |
| s10 | 1339 | 20.7 | 726 | 409 | 164 | 18 / 42 |

- By row: attempts 6,260 of 11,641 over 20 m (53.8%), contest winners 261 of 469 (55.7%), shooters
  83 of 238 (34.9%), fouled 103 of 200, foulers 116 of 200. By role the wide men most
  (traditional winger 496 of 669, wide midfielders 707 of 958 and 744 of 1,039), among outfield
  men box-to-box midfielders and centre-backs least (1,113 of 2,787; 540 of 1,264).
- The worst ten are all 57.9 m: a right winger acting in the lane along his own left touchline
  (cell 10: band 2, lane 0) in s01 (three), s04 (two) and s06; a left winger in the lane along his
  right (cell 14) in s01, s02 (fouled) and s05; s04's left winger winning the ball in band 5, lane 0
  of the passer's frame (along his own right).
- Reference: the prototype's grammar scripts (`demo`, `demo#1`–`#3`, 910 beats) put the man on the
  ball a median 9.9 m from his place, 5.8% over 20 m, none over 40 m.
- So most of the contests the stage wins only with a lunge (`events.stretchRate` 0.16–0.30) and
  the 51 of 614 it cannot win within reach are cast by the record, not by the order: the
  attribution would need the pitch in mind (who stands in or beside the cell) for the picture to
  hold its winners near the ball.

### restarts: what the record implies against the rows that could deliver them

| match | throw-ins | goal kicks | free kicks | corners | rows flagged corner / free kick | direct free-kick shots | outs: touch / byline / corner won | offsides | fouls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01 | 25 | 16 | 27 | 10 | 10 / 6 | 2 | 25 / 9 / 4 | 3 | 24 |
| s02 | 25 | 10 | 18 | 12 | 12 / 3 | 0 | 25 / 8 / 4 | 1 | 17 |
| s03 | 34 | 13 | 24 | 10 | 10 / 8 | 0 | 34 / 8 / 6 | 4 | 20 |
| s04 | 32 | 17 | 19 | 11 | 11 / 6 | 0 | 32 / 13 / 4 | 3 | 16 |
| s05 | 31 | 14 | 22 | 10 | 10 / 9 | 1 | 31 / 7 / 6 | 1 | 21 |
| s06 | 32 | 15 | 18 | 2 | 2 / 6 | 0 | 32 / 12 / 1 | 5 | 13 |
| s07 | 49 | 12 | 30 | 9 | 9 / 6 | 0 | 49 / 8 / 2 | 4 | 26 |
| s08 | 32 | 11 | 21 | 12 | 12 / 6 | 0 | 32 / 9 / 7 | 6 | 15 |
| s09 | 34 | 20 | 28 | 7 | 7 / 8 | 1 | 34 / 14 / 6 | 4 | 24 |
| s10 | 37 | 26 | 29 | 10 | 10 / 9 | 2 | 37 / 18 / 5 | 5 | 24 |

- Throw-ins equal the passes out over the touchline and corners the rows flagged as corners: each
  has a recorded row to deliver it when one starts beside its spot. Goal kicks and throw-ins have no
  flag; any recorded pass from a cell beside the spot delivers them (final: 122 of 154 goal kicks,
  284 of 331 throw-ins).
- Free kicks (fouls plus offsides) are 18–30 a match against 3–9 rows flagged as free-kick
  deliveries; the rest are delivered by ordinary rows from a cell beside the spot (final: 228 of 236
  free kicks by a recorded row). The orphans (7–15 a match) are flagged deliveries the order plays in
  open play because no restart of their kind is owed beside them when they are next.

### cost

- `fit.writeMs` median 245.5 ms, worst 289; `fit.stageMs` median 7,969 ms, worst 8,625 (baseline
  237 / 272 ms and 12,744 / 14,961 ms); five matches at a time on this host, so single runs are
  likely a little faster.
- `fit.stagedSeconds` 6,150–6,968 (baseline 9,491–11,285): the staging produces 1.03–1.18 seconds
  per match second, every frame at `hz` 10.
- The page at `matchStride` 2: 13,166,559 bytes (`index.html`, playback inline) and 13,149,250
  (`playback.json`).

### what the ten matches did not contain, and production must add

Substitutions, dismissals and second yellows, injuries, penalties (shots and fouls with penalties),
extra time and shoot-outs were all skipped by the export (T819), and every side plays 4-3-3
possession or 4-4-2 counter: three of the ten are 4-3-3 against 4-3-3 (s01, s04, s06), four 4-4-2
against 4-4-2 (s03, s07, s08, s10) and three mixed (s02, s05, s09). Yellow cards 1–5 a match, added
time 1–3 and 2–5 minutes. Other formations and roles, set-piece takers, era rules and a change of
ends are not staged by the prototype either.

## s01: the record beside the staged count, and scenes

score 1-1 (staged 1-1); H 4-3-3 possession, A 4-3-3 possession. Scorers (record minute): H11 77'
(assist H10), A11 82' (assist A9). Each cell is `record / staged`; cells that differ: 0.

| side | goals | shots | onTarget | passes | completed | corners | offsides | throwIns | goalKicks | freeKicks | fouls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H | 1 / 1 | 14 / 14 | 8 / 8 | 481 / 481 | 420 / 420 | 5 / 5 | 0 / 0 | 17 / 17 | 6 / 6 | 18 / 18 | 9 / 9 |
| A | 1 / 1 | 10 / 10 | 3 / 3 | 427 / 427 | 342 / 342 | 5 / 5 | 3 / 3 | 8 / 8 | 10 / 10 | 9 / 9 | 15 / 15 |

| player | role | goals | assists | shots | onTarget | passes | completed | tackles | interceptions | takeOns | offsides | fouls | foulsWon | yellowCards | saves |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | GK sweeperKeeper | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 1 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 |
| H2 | LB invertedFullBack | 0 / 0 | 0 / 0 | 2 / 2 | 1 / 1 | 50 / 50 | 40 / 40 | 1 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| H3 | CB ballPlayingDefender | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 25 / 25 | 21 / 21 | 1 / 1 | 2 / 2 | 0 / 0 | 0 / 0 | 1 / 1 | 2 / 2 | 1 / 1 | 0 / 0 |
| H4 | CB centreBack | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 31 / 31 | 27 / 27 | 1 / 1 | 1 / 1 | 1 / 1 | 0 / 0 | 2 / 2 | 0 / 0 | 1 / 1 | 0 / 0 |
| H5 | RB overlappingFullBack | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 40 / 40 | 37 / 37 | 3 / 3 | 2 / 2 | 0 / 0 | 0 / 0 | 2 / 2 | 1 / 1 | 0 / 0 | 0 / 0 |
| H6 | DM anchor | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 81 / 81 | 75 / 75 | 4 / 4 | 2 / 2 | 1 / 1 | 0 / 0 | 2 / 2 | 1 / 1 | 0 / 0 | 0 / 0 |
| H7 | CM mezzala | 0 / 0 | 0 / 0 | 3 / 3 | 2 / 2 | 81 / 81 | 72 / 72 | 1 / 1 | 1 / 1 | 2 / 2 | 0 / 0 | 0 / 0 | 3 / 3 | 0 / 0 | 0 / 0 |
| H8 | CM boxToBox | 0 / 0 | 0 / 0 | 2 / 2 | 2 / 2 | 56 / 56 | 51 / 51 | 1 / 1 | 0 / 0 | 1 / 1 | 0 / 0 | 2 / 2 | 3 / 3 | 0 / 0 | 0 / 0 |
| H9 | LW invertedWinger | 0 / 0 | 0 / 0 | 2 / 2 | 1 / 1 | 22 / 22 | 19 / 19 | 1 / 1 | 2 / 2 | 6 / 6 | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 0 / 0 |
| H10 | ST falseNine | 0 / 0 | 1 / 1 | 3 / 3 | 1 / 1 | 41 / 41 | 35 / 35 | 0 / 0 | 2 / 2 | 2 / 2 | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 0 / 0 |
| H11 | RW traditionalWinger | 1 / 1 | 0 / 0 | 1 / 1 | 1 / 1 | 53 / 53 | 42 / 42 | 1 / 1 | 1 / 1 | 4 / 4 | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 0 / 0 |
| A1 | GK sweeperKeeper | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 3 / 3 | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 7 / 7 |
| A2 | LB invertedFullBack | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 31 / 31 | 21 / 21 | 6 / 6 | 1 / 1 | 1 / 1 | 0 / 0 | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 |
| A3 | CB ballPlayingDefender | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 24 / 24 | 19 / 19 | 0 / 0 | 0 / 0 | 3 / 3 | 0 / 0 | 2 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| A4 | CB centreBack | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 36 / 36 | 32 / 32 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 3 / 3 | 2 / 2 | 0 / 0 | 0 / 0 |
| A5 | RB overlappingFullBack | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 30 / 30 | 25 / 25 | 2 / 2 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 0 / 0 |
| A6 | DM anchor | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 68 / 68 | 58 / 58 | 2 / 2 | 2 / 2 | 2 / 2 | 0 / 0 | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 |
| A7 | CM mezzala | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 71 / 71 | 51 / 51 | 1 / 1 | 0 / 0 | 4 / 4 | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | 0 / 0 |
| A8 | CM boxToBox | 0 / 0 | 0 / 0 | 1 / 1 | 1 / 1 | 50 / 50 | 46 / 46 | 0 / 0 | 0 / 0 | 3 / 3 | 0 / 0 | 1 / 1 | 2 / 2 | 0 / 0 | 0 / 0 |
| A9 | LW invertedWinger | 0 / 0 | 1 / 1 | 2 / 2 | 0 / 0 | 38 / 38 | 24 / 24 | 0 / 0 | 2 / 2 | 6 / 6 | 1 / 1 | 0 / 0 | 2 / 2 | 0 / 0 | 0 / 0 |
| A10 | ST falseNine | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 35 / 35 | 32 / 32 | 1 / 1 | 0 / 0 | 1 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| A11 | RW traditionalWinger | 1 / 1 | 0 / 0 | 2 / 2 | 2 / 2 | 41 / 41 | 31 / 31 | 0 / 0 | 0 / 0 | 2 / 2 | 1 / 1 | 2 / 2 | 1 / 1 | 0 / 0 | 0 / 0 |

Scenes to look at (match clock where each beat starts; `H`/`A` and the shirt number on the page):

- goal 76:10 H11 (record minute 77), assist H10: the cut-back H10 → H11 at 76:10
- goal 81:57 A11 (record minute 82), assist A9: the cut-back A9 → A11 at 81:54
- first three shots: 04:57 H8 saved; 13:16 H10 blocked; 18:57 H10 wide
- first corner: 02:32 H2 → H8 (short)
- first offside: 03:17 A2 → A9
- the three longest link carries: 21:42 A5 68.7 m; 42:52 H11 59.0 m; 28:48 H6 58.3 m
- the first three heavy touches: 10:36 H11 → A7; 16:24 H5 → A8; 21:31 H6 → A3
- the minute with the most beats: 42:00–42:59, 29 beats (median 18)

## exactness of the ten matches (final)

| match | score | fit.exact | fit.performed | fit.recast | `validateFitted` problems |
| --- | --- | --- | --- | --- | --- |
| s01 | 1-1 | 0 | 0 | 0 | 0 |
| s02 | 1-0 | 0 | 0 | 0 | 0 |
| s03 | 3-0 | 0 | 0 | 0 | 0 |
| s04 | 1-0 | 0 | 0 | 0 | 0 |
| s05 | 1-1 | 0 | 0 | 0 | 0 |
| s06 | 2-0 | 0 | 0 | 0 | 0 |
| s07 | 1-0 | 0 | 0 | 0 | 0 |
| s08 | 2-4 | 0 | 0 | 0 | 0 |
| s09 | 1-0 | 0 | 0 | 0 | 0 |
| s10 | 2-0 | 0 | 0 | 0 | 0 |

## fit lines, baseline → final

| match | stretch | late | links | linkMetres | miscontrols | connectiveRestarts | orphans | stagedSeconds | clockRatio | writeMs | stageMs | passed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01 | 0.057 → 0.068 | 13 → 7 | 1036 → 368 | 26538 → 5080 | 180 → 20 | 63 → 10 | 16 → 11 | 10326.7 → 6407 | 1.73 → 1.08 | 245 → 248 | 12823 → 7921 | 19/30 → 19/30 |
| s02 | 0.04 → 0.099 | 11 → 15 | 962 → 383 | 24161 → 5037 | 168 → 24 | 47 → 12 | 14 → 9 | 9491.5 → 6305.4 | 1.63 → 1.09 | 201 → 200 | 11900 → 8087 | 20/31 → 20/31 |
| s03 | 0.052 → 0.069 | 11 → 3 | 884 → 340 | 24038 → 5017 | 203 → 11 | 63 → 8 | 18 → 12 | 9599.2 → 6150.4 | 1.62 → 1.03 | 183 → 189 | 11478 → 8006 | 20/28 → 19/28 |
| s04 | 0.033 → 0.109 | 15 → 8 | 923 → 319 | 23754 → 4821 | 190 → 5 | 59 → 14 | 17 → 8 | 9513.5 → 6230.6 | 1.58 → 1.04 | 203 → 197 | 11873 → 7932 | 20/30 → 20/30 |
| s05 | 0.059 → 0.085 | 13 → 10 | 988 → 355 | 25053 → 5015 | 186 → 19 | 57 → 17 | 19 → 15 | 9848.9 → 6234.9 | 1.69 → 1.04 | 216 → 229 | 12173 → 7925 | 21/31 → 22/31 |
| s06 | 0.047 → 0.062 | 15 → 14 | 1043 → 350 | 25965 → 4796 | 197 → 34 | 51 → 9 | 8 → 7 | 10014.3 → 6438 | 1.77 → 1.12 | 229 → 289 | 12749 → 8188 | 20/30 → 20/30 |
| s07 | 0.069 → 0.114 | 19 → 12 | 1034 → 425 | 27103 → 6209 | 231 → 27 | 69 → 9 | 15 → 10 | 10694.8 → 6755.5 | 1.8 → 1.06 | 252 → 250 | 12739 → 7814 | 20/28 → 19/28 |
| s08 | 0.063 → 0.128 | 15 → 15 | 1146 → 474 | 29926 → 6743 | 191 → 7 | 53 → 12 | 18 → 12 | 11285.4 → 6967.7 | 1.92 → 1.18 | 272 → 279 | 14635 → 8625 | 20/28 → 19/28 |
| s09 | 0.035 → 0.077 | 13 → 7 | 1144 → 402 | 28643 → 5575 | 201 → 13 | 63 → 9 | 14 → 7 | 11068.2 → 6771.8 | 1.87 → 1.11 | 262 → 271 | 14961 → 8505 | 22/31 → 19/31 |
| s10 | 0.04 → 0.083 | 11 → 9 | 1060 → 394 | 26647 → 5721 | 216 → 12 | 78 → 14 | 19 → 14 | 10667.2 → 6609 | 1.76 → 1.08 | 252 → 243 | 12913 → 7681 | 20/28 → 19/28 |

`s08`'s baseline is the run after the step-2 fix; the unfixed staging stopped at its beat 1592.
`fit.stretch` is a share of the contested events (`intercept`, `tackle`, `foul`, `loose`, `block`,
`save`), and the final writer has 90% fewer heavy touches (`loose`), most of which the stage wins
easily, so the share rose while the count of stretched contests fell or held.

## the staging metrics per match, baseline → final (`!` fails its limit)

The report prints 28–31 metrics: the role metrics only for a side that fields the role.

| metric | limit | s01 | s02 | s03 | s04 | s05 | s06 | s07 | s08 | s09 | s10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| duration | >= 599.5 | 10326.7 → 6407 | 9491.5 → 6305.4 | 9599.2 → 6150.4 | 9513.5 → 6230.6 | 9848.9 → 6234.9 | 10014.3 → 6438 | 10694.8 → 6755.5 | 11285.4 → 6967.7 | 11068.2 → 6771.8 | 10667.2 → 6609 |
| kinematics.maxStep | <= 11 | 10.417 → 10.316 | 10.161 → 10.439 | 10.348 → 10.265 | 10.422 → 10.456 | 10.198 → 10.323 | 10.593 → 10.538 | 10.259 → 10.246 | 10.386 → 10.512 | 10.265 → 10.5 | 10.431 → 10.456 |
| kinematics.outside | = 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| ball.maxSpeed | = 0 | 1! → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| ball.ownerDistance | >= 0.99 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| events.reception | >= 0.98 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| events.contest | >= 0.95 | 0.932! → 0.915! | 0.912! → 0.877! | 0.863! → 0.902! | 0.945! → 0.909! | 0.889! → 0.952 | 0.981 → 0.981 | 0.845! → 0.917! | 0.928! → 0.899! | 0.956 → 0.912! | 0.857! → 0.911! |
| events.recastRate | <= 0.25 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| events.stretchRate | <= 0.1 | 0.27! → 0.176! | 0.191! → 0.265! | 0.303! → 0.197! | 0.18! → 0.262! | 0.266! → 0.203! | 0.276! → 0.19! | 0.298! → 0.269! | 0.299! → 0.299! | 0.157! → 0.18! | 0.236! → 0.25! |
| offside.consistency | = 0 | 0 → 1! | 1! → 2! | 2! → 1! | 0 → 0 | 1! → 0 | 1! → 3! | 1! → 2! | 3! → 3! | 3! → 2! | 3! → 5! |
| shape.swarm | <= 0.02 | 0.061! → 0.065! | 0.042! → 0.048! | 0.013 → 0.016 | 0.067! → 0.082! | 0.038! → 0.045! | 0.069! → 0.074! | 0.012 → 0.018 | 0.012 → 0.012 | 0.038! → 0.041! | 0.011 → 0.015 |
| shape.teamLength.H | 22..52 | 29.86 → 29.97 | 30.47 → 30.26 | 34.71 → 34.27 | 29.9 → 30.18 | 31.62 → 31.49 | 29.88 → 29.74 | 34.28 → 33.42 | 30.56 → 29.2 | 31.23 → 31.22 | 33.67 → 32.53 |
| shape.teamLength.A | 22..52 | 29.56 → 29.44 | 30.64 → 30.62 | 33.06 → 31.63 | 29.11 → 29.42 | 27.89 → 27.29 | 29.2 → 29.17 | 33.79 → 32.42 | 35.54 → 35.49 | 28.45 → 27.26 | 33.8 → 33.04 |
| shape.spacing | <= 0.03 | 0.083! → 0.079! | 0.074! → 0.079! | 0.063! → 0.068! | 0.083! → 0.092! | 0.076! → 0.078! | 0.086! → 0.077! | 0.059! → 0.062! | 0.061! → 0.06! | 0.072! → 0.069! | 0.057! → 0.063! |
| role.invertedFullBack.inside | >= 8 | 15.557 → 14.827 | 16.401 → 15.496 | - → - | 15.354 → 15.006 | 15.9 → 15.41 | 16.126 → 15.065 | - → - | - → - | 15.699 → 15.281 | - → - |
| role.invertedFullBack.pivot | <= 8 | 2.811 → 2.896 | 3.121 → 3.009 | - → - | 3.032 → 2.875 | 2.821 → 2.798 | 2.729 → 2.555 | - → - | - → - | 2.532 → 2.212 | - → - |
| role.falseNine.drop | >= 5 | 5.363 → 5.221 | 9.675 → 9.939 | - → - | 5.168 → 5.296 | 9.884 → 9.913 | 5.789 → 6.192 | - → - | - → - | 10.106 → 10.441 | - → - |
| script.backPassReason | = 0 | 21! → 32! | 25! → 30! | 23! → 23! | 25! → 33! | 31! → 32! | 25! → 34! | 32! → 20! | 32! → 25! | 22! → 27! | 34! → 34! |
| stage.pressVisible | >= 0.9 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| score.consistent | = score | 2 → 2 | 1 → 1 | 3 → 3 | 1 → 1 | 2 → 2 | 2 → 2 | 1 → 1 | 6 → 6 | 1 → 1 | 2 → 2 |
| events.shortKick | <= 0.05 | 0.055! → 0.036 | 0.051! → 0.036 | 0.034 → 0.031 | 0.059! → 0.046 | 0.043 → 0.05 | 0.055! → 0.049 | 0.049 → 0.041 | 0.031 → 0.046 | 0.043 → 0.054! | 0.034 → 0.034 |
| shape.huddle | <= 0.6 | 2.315! → 1.833! | 2.087! → 1.956! | 1.352! → 1.421! | 2.1! → 2.13! | 1.813! → 1.426! | 2.216! → 1.85! | 1.279! → 1.221! | 1.439! → 1.213! | 1.634! → 1.382! | 1.336! → 1.198! |
| shape.huddleLongest | <= 4 | 9.5! → 10.7! | 6.9! → 9.3! | 10.4! → 7.7! | 11! → 7.9! | 7.3! → 7.3! | 8! → 7.2! | 6.3! → 15.8! | 6.3! → 7.4! | 7.8! → 5.6! | 6.5! → 8.7! |
| motion.restarts | <= 4 | 3.336 → 4.966! | 3.394 → 5.291! | 3.509 → 4.923! | 3.312 → 4.945! | 3.257 → 4.942! | 3.339 → 4.868! | 3.491 → 4.731! | 3.334 → 5.062! | 3.228 → 4.926! | 3.527 → 4.835! |
| motion.startSync | <= 0.2 | 0.039 → 0.105 | 0.063 → 0.135 | 0.069 → 0.177 | 0.037 → 0.118 | 0.071 → 0.166 | 0.04 → 0.119 | 0.075 → 0.164 | 0.076 → 0.156 | 0.06 → 0.149 | 0.071 → 0.181 |
| motion.speedSync | <= 0.3 | 0.125 → 0.178 | 0.168 → 0.214 | 0.215 → 0.259 | 0.129 → 0.186 | 0.186 → 0.238 | 0.119 → 0.183 | 0.227 → 0.274 | 0.216 → 0.252 | 0.163 → 0.211 | 0.228 → 0.259 |
| turn.reverse | <= 0.3 | 0.344! → 0.307! | 0.377! → 0.377! | 0.433! → 0.421! | 0.319! → 0.347! | 0.386! → 0.373! | 0.352! → 0.355! | 0.453! → 0.419! | 0.436! → 0.392! | 0.387! → 0.406! | 0.468! → 0.435! |
| turn.run | <= 0.4 | 0.25 → 0.275 | 0.25 → 0.3 | 0.25 → 0.3 | 0.25 → 0.25 | 0.25 → 0.3 | 0.25 → 0.25 | 0.25 → 0.3 | 0.25 → 0.3 | 0.25 → 0.3 | 0.25 → 0.3 |
| turn.counterRun | >= 0.5 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| mark.near | >= 0.5 | 0.307! → 0.333! | 0.371! → 0.402! | 0.564 → 0.527 | 0.303! → 0.339! | 0.33! → 0.361! | 0.31! → 0.339! | 0.555 → 0.526 | 0.558 → 0.536 | 0.35! → 0.37! | 0.564 → 0.508 |
| role.poacher.shoulder | <= 3.5 | - → - | 2.287 → 2.19 | 2.633 → 2.488 | - → - | 2.513 → 2.397 | - → - | 2.831 → 2.832 | 2.631 → 2.317 | 2.212 → 2.08 | 2.696 → 2.208 |

Read against T818's final values on grammar scripts (`artifacts/match-proto-261111`): there
`motion.restarts` 4.2–5.0, `shape.huddle` 1.0–2.0, `shape.spacing` 0.05–0.08, `turn.reverse`
0.26–0.32, `mark.near` 0.28–0.32, `motion.speedSync` 0.29–0.40, `events.contest` 0.96–1,
`events.stretchRate` 0–0.11, `offside.consistency` 0, `script.backPassReason` 0. A fitted match
now reads at that level for movement and shape (`mark.near` and `speedSync` better), worse for
contests, stretch, offside consistency and back-pass reasons.

## what still reads wrong, and the suspected cause

- `events.contest` (0.88–0.98) and `events.stretchRate` (0.16–0.30): the recorded winner of a
  tackle or interception stands far from the cell more than half the time (above). The order cannot
  move him; the stage lunges him in (`stretch`) or the ball waits for him (`late`).
- `motion.restarts` (4.7–5.3, against 4; 3.2–3.5 before): a minute's time is now shared by about
  18 beats instead of 28 (the invented carries kept the carrier and his neighbours running), so
  each touch holds the ball longer and free players reach their places and stop, as on grammar
  scripts (4.2–5.0). Capping holds at 2.6 s (round 4) took it only to 4.93.
- `shape.huddle`, `shape.huddleLongest`, `shape.spacing`, `shape.swarm`: T818's staging limits
  (two free defenders marking two close attackers, a free man beside the carrier); the order does
  not reach them.
- `offside.consistency` (0–5 a match; 15 → 19 over the ten, of about 850 kicks a match): offside
  beats whose named runner was not beyond the line at the kick 10 → 9, ordinary passes kicked to a
  man beyond it 5 → 10. The stage waits for a receiver to come back onside, or for the runner to
  get beyond the line, at most `stage.through.maxWait`, then kicks; the record's offside man and
  receivers are not chosen with the line in mind. Not worked on.
- `script.backPassReason` (20–34): the record's backward passes carry no reason; the writer names
  none rather than inventing one.
- `turn.reverse` (0.31–0.44): the back lines' turn after a settled turnover, as on grammar scripts
  (0.26–0.32), a little worse with real turnovers' places.
- Minutes: a fixed shot or booked foul pulls play toward it, so the busiest minute holds about twice
  the median (26–40 beats against 15–21) and needs up to 102 s, pressed into sixty; a smoother
  share (round 5) cost link metres and was rejected.

## limits

- Measured on one host with five reports in parallel (timings are wall clock under that load).
- The three-hour box started at the baseline (05:41 UTC); the rounds ran 05:44–06:21 (ten
  rounds and two fixes), and stopped there, well inside the box, because the order sat at
  the record's own transport floor, the last three candidates raised its cost and the one before
  them lost contests, and the remaining
  failures are the record's attribution or the staging's own limits (T818's grammar level); the
  findings and the delivery followed.
- The page was not opened in a browser (ARCH-30); its HUD clock and controls are T821's.
- `script.backPassReason`, `offside.consistency` and `turn.reverse` were not worked on.
