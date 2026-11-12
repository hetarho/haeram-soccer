# The released model's verdict (T840, 261112)

The first full read of the released model, `scripted-aggregate-11` (→MATCH-2/16/23/28/38/39,
ARCH-31): the own club on the same curve as clubs nobody owns, a script's invention, the
staging's 31 picture limits and its clock, then a timeboxed tuning of the values that move the
picture without breaking exactness. Measured on the shared host (Intel Xeon Silver 4214, 12 cores,
Node v24.22.1) in worktree `hf12` from commit `c64c0fdb`; nothing here is a release gate (→ARCH-31).

Reads (all `scripts/model-verdict.ts`, measurement only):

| read | what | command |
|---|---|---|
| (a) | 608 own league fixtures (38 × 16 seeds) of the median-rated English top-flight club taken over in 2024, beside 5,472 sides of the same league's other fixtures (342 × 8 seeds) at the same prepared gaps | `model-verdict.ts curve --year 2024 --seeds 16 --ref-seeds 8` |
| (b) | the own club's league top-scorer share, 100 club-seasons (ENG top-flight clubs 0–4 taken over in 2024, 10 seeds, 2 seasons) | `scoring-season-share.ts --clubs 0,1,2,3,4 --seeds t840-share-<i> --seasons 2 --year 2024` |
| (c)/(d) | 40 own matches: the ten tactic pairings twice in 1975 and twice in 2024, the own club's tactic forced; the first of each pair (20) tunes, the other 20 are held out | `model-verdict.ts stage --set all\|tune` then `sum` |

`baseline.json` and `final.json` hold (a)–(d) as read; `curve-baseline.*`, `share-baseline/`,
`stage-baseline/`, `stage-final/` and the rounds' `stage-r<NN>-*/summary.json` the raw reads.

## Clock (UTC, 261112)

- 08:02:41 baseline starts: (b) launched; (c)/(d) 08:05–08:20; (a) 08:06–08:20; (b) done 08:37.
- 08:21–09:28 rounds 1–32 (log below); 09:28 final read of all 40; 09:40–09:45 rounds 33–34
  (writer bursts, reverted); 09:38 the final read repeated on the final tree (a lint fix replaced
  `Math.hypot` by the portable `dist` in the new onside rule) — the tables below are that read.
- Stopped at 09:45, 1 h 43 min after the baseline, before the three hours: every value the picture
  limits answer to was screened (34 rounds), and what still fails needs code or a planning call
  (causes below), not another value.

## (a) The own club on the same curve

The own club: ENG:0:0:4 (rated 74, the league's median), its own manager (ability 83, 실리 역습 —
counter tactic and style) and morale 60; its prepared gaps run −21.8 to +12.5 (mean −2.5). Each
own sample is compared with the reference mean of its gap bucket (`gapBucket`); MATCH-28's
margins: outcome rates ±3 pp, means ±max(5% of the reference mean, 0.1 reference SD); 95%
intervals. "Same tactic" compares with reference sides that also play counter (1,440 sides).

| row (per side a match) | own | ref., same tactic | diff [95%] | margin | verdict | ref., all tactics | diff [95%] | verdict |
|---|---|---|---|---|---|---|---|---|
| win | 0.363 | 0.354 | 0.010 [−0.038, 0.057] | ±0.03 | insufficient | 0.329 | 0.035 [−0.006, 0.075] | insufficient |
| draw | 0.204 | 0.234 | −0.030 [−0.071, 0.011] | ±0.03 | insufficient | 0.245 | −0.041 [−0.075, −0.006] | insufficient |
| loss | 0.433 | 0.412 | 0.021 [−0.028, 0.069] | ±0.03 | insufficient | 0.427 | 0.006 [−0.036, 0.048] | insufficient |
| points | 1.294 | 1.296 | −0.001 [−0.133, 0.131] | ±0.131 | insufficient | 1.231 | 0.064 [−0.049, 0.177] | insufficient |
| goals for | 1.285 | 1.333 | −0.048 [−0.174, 0.077] | ±0.128 | insufficient | 1.245 | 0.040 [−0.069, 0.148] | insufficient |
| goals against | 1.465 | 1.498 | −0.033 [−0.169, 0.104] | ±0.147 | insufficient | 1.518 | −0.053 [−0.170, 0.065] | insufficient |
| shots | 12.03 | 12.73 | −0.70 [−1.24, −0.17] | ±0.64 | insufficient | 11.75 | 0.28 [−0.18, 0.73] | insufficient |
| on target | 4.28 | 4.52 | −0.24 [−0.49, 0.01] | ±0.26 | insufficient | 4.23 | 0.05 [−0.17, 0.26] | insufficient |
| xG | 1.315 | 1.351 | −0.036 [−0.108, 0.036] | ±0.072 | insufficient | 1.302 | 0.012 [−0.051, 0.075] | insufficient |
| passes | 341.3 | 356.2 | −14.9 [−22.2, −7.5] | ±17.8 | insufficient | 453.8 | −112.5 [−119.3, −105.6] | different |
| completed | 262.7 | 274.3 | −11.6 [−18.4, −4.8] | ±13.7 | insufficient | 362.5 | −99.8 [−106.3, −93.4] | different |
| possession share | 0.380 | 0.394 | −0.014 [−0.023, −0.005] | ±0.020 | insufficient | 0.484 | −0.104 [−0.112, −0.096] | different |
| crosses | 13.20 | 13.77 | −0.58 [−1.06, −0.09] | ±0.69 | insufficient | 16.20 | −3.00 [−3.43, −2.58] | different |
| take-ons | 12.94 | 13.70 | −0.76 [−1.25, −0.27] | ±0.69 | insufficient | 17.71 | −4.77 [−5.21, −4.33] | different |
| tackles + interceptions | 28.12 | 26.64 | 1.48 [0.85, 2.10] | ±1.33 | insufficient | 25.06 | 3.06 [2.52, 3.60] | different |
| throw-ins | 19.23 | 18.55 | 0.68 [0.16, 1.20] | ±0.93 | insufficient | 17.23 | 2.00 [1.54, 2.46] | different |
| corners | 4.22 | 4.52 | −0.30 [−0.56, −0.03] | ±0.27 | insufficient | 4.56 | −0.33 [−0.56, −0.11] | insufficient |
| goal kicks | 10.04 | 9.50 | 0.54 [0.20, 0.88] | ±0.48 | insufficient | 8.59 | 1.45 [1.15, 1.74] | different |
| fouls | 10.90 | 10.94 | −0.05 [−0.37, 0.28] | ±0.55 | **equivalent** | 11.21 | −0.31 [−0.59, −0.03] | insufficient |
| offsides | 1.88 | 1.99 | −0.11 [−0.26, 0.03] | ±0.14 | insufficient | 1.72 | 0.16 [0.04, 0.28] | insufficient |
| yellow cards | 1.72 | 1.77 | −0.05 [−0.18, 0.08] | ±0.13 | insufficient | 1.86 | −0.14 [−0.25, −0.03] | insufficient |
| red cards | 0.046 | 0.051 | −0.005 [−0.027, 0.017] | ±0.024 | insufficient | 0.054 | −0.008 [−0.026, 0.010] | insufficient |

No row differs from clubs that play the same tactic; every point estimate of the outcome curve
lies within 3 pp of theirs. Equivalence is not shown for any outcome row: at 608 fixtures the
intervals are ±4–5 pp, against a ±3 pp margin. Read against every tactic, the rows that differ are
the counter tactic's own profile (fewer passes, crosses and take-ons, more tackles), not the own
club. No own-club term read differently from →MATCH-2 was found, so no code changed for (a).

Script failures in the same 608 own fixtures: 5 at the baseline (0.8%; seeds 3, 4, 10, 14, 15 —
`curve-baseline-problems/`), each a substitution waiting at the end of a minute with a pass in
flight; 0 after round 1's fix (`curve-final-problems/`). No result value changed (the place reach
stayed 11 m), so (a) is not re-read: the records are the same.

## (b) The own club's league top scorer

100 club-seasons (95 of them in the top flight; five clubs were relegated after their first
season): the club's league top scorer takes **25.2% [24.0, 26.4]** of its league goals (top
flight only: 25.2% [23.9, 26.4]), inside MATCH-23's 20–30%; 62 of the 95 lie inside it. Top
scorers score 13.5 league goals on average, at most 28; 69 of 95 are strikers. Goals 2.79 a
match; the ledger agrees with the scores in every season. Hat-tricks are not readable here: the
season records keep no per-player lines for own league fixtures (`share-baseline/pooled.json`).

## (c) The 40 own matches, baseline → final

Exactness held after every kept round: `fit.exact`, `fit.performed`, `fit.recast` are 0 and
`validateScript` is empty on all 40 matches, baseline and final.

**The script's invention a match** (unchanged by the kept rounds; the reverted rounds 19/20, 33
and 34 moved it):

| | baseline | final |
|---|---|---|
| linking carries | 420.3 | 420.3 |
| linking metres | 4,998 | 4,998 |
| heavy touches | 30.1 | 30.1 |
| restarts without a recorded delivery | 16.0 | 16.0 |
| set-piece passes kept in open play (`fit.orphans`) | 9.0 | 9.0 |

**MATCH-23's sequence rows read on the scripts** (a possession is a run of one side's beats; the
final equals the baseline, the scripts being unchanged):

| row | value | band (tolerant) | |
|---|---|---|---|
| possessions a team | 87.4 | 85–105 (71.3–118.8) | inside |
| median passes in one | 3.9 | 2–4 | inside, at its top |
| possessions ending in a shot | 13.0% | 10–15% | inside |
| mean shot distance | 21.1 m | 15–18 m (12.4–20.6) | **outside** |
| shots from 30 m+ | 27.5% | ≤10% (≤12.5%) | **outside** |

**The 31 picture limits** (matches failing / matches the limit applies to; mean value):

| limit | rule | baseline | mean | final | mean |
|---|---|---|---|---|---|
| duration | ≥ 599.5 | 0/40 | 6833.9 | 0/40 | 6822.2 |
| kinematics.maxStep | ≤ 11 | 0/40 | 10.58 | 0/40 | 10.55 |
| kinematics.outside | = 0 | 0/40 | 0 | 0/40 | 0 |
| ball.maxSpeed | = 0 | 0/40 | 0 | 0/40 | 0 |
| ball.ownerDistance | ≥ 0.99 | 0/40 | 1 | 0/40 | 1 |
| events.reception | ≥ 0.98 | 0/40 | 1 | 0/40 | 1 |
| events.contest | ≥ 0.95 | 34/40 | 0.912 | 32/40 | 0.917 |
| events.recastRate | ≤ 0.25 | 0/40 | 0 | 0/40 | 0 |
| events.stretchRate | ≤ 0.1 | 40/40 | 0.211 | 40/40 | 0.209 |
| offside.consistency | = 0 | 26/40 | 1.35 | 28/40 | 1.50 |
| shape.swarm | ≤ 0.02 | 23/40 | 0.024 | 9/40 | 0.013 |
| shape.teamLength.H | 22..52 | 0/40 | 31.0 | 0/40 | 31.9 |
| shape.teamLength.A | 22..52 | 0/40 | 30.6 | 0/40 | 31.6 |
| shape.spacing | ≤ 0.03 | 40/40 | 0.061 | 3/40 | 0.023 |
| role.invertedFullBack.inside | ≥ 8 | 1/16 | 10.39 | 1/16 | 10.26 |
| role.invertedFullBack.pivot | ≤ 8 | 0/16 | 3.34 | 0/16 | 3.64 |
| role.falseNine.drop | ≥ 5 | 5/16 | 7.96 | 2/16 | 8.44 |
| role.poacher.shoulder | ≤ 3.5 | 7/28 | 3.14 | 12/28 | 3.45 |
| script.backPassReason | = 0 | 40/40 | 29.8 | 40/40 | 29.8 |
| stage.pressVisible | ≥ 0.9 | 0/40 | 1 | 0/40 | 1 |
| score.consistent | = score | 0/40 | – | 0/40 | – |
| events.shortKick | ≤ 0.05 | 0/40 | 0.026 | 0/40 | 0.026 |
| shape.huddle | ≤ 0.6 | 40/40 | 1.49 | 1/40 | 0.34 |
| shape.huddleLongest | ≤ 4 | 40/40 | 8.17 | 34/40 | 5.80 |
| motion.restarts | ≤ 4 | 10/40 | 3.87 | 7/40 | 3.78 |
| motion.startSync | ≤ 0.2 | 10/40 | 0.160 | 0/40 | 0.121 |
| motion.speedSync | ≤ 0.3 | 3/40 | 0.235 | 0/40 | 0.214 |
| turn.reverse | ≤ 0.3 | 36/40 | 0.376 | 35/40 | 0.352 |
| turn.run | ≤ 0.4 | 0/40 | 0.237 | 0/40 | 0.223 |
| turn.counterRun | ≥ 0.5 | 0/40 | 1 | 0/40 | 1 |
| mark.near | ≥ 0.5 | 27/40 | 0.439 | 25/40 | 0.474 |
| **failing limits, all 40** | | **382** | | **269** | |
| tuning 20 / held-out 20 | | 188 / 194 | | 132 / 137 | |

The held-out 20 fell as much as the tuning 20 (−29% and −30%), so the kept values are not fitted
to the tuning matches alone.

**Fit lines** (means a match): `fit.stretch` 0.079 → 0.078, `fit.late` 13.3 → 14.5,
`fit.stagedSeconds` 6,834 → 6,822, `fit.clockRatio` (median live seconds a minute ÷ 60) 0.99 →
0.99.

**Clock rates between fixed moments** (`clockRates`; `limits.clockRate` 0.8–1.25): 2,161
stretches in the 40 matches, 1,259 outside at the baseline and 1,260 at the final, median rate
0.81 → 0.82, in every match. Of the final's 1,372 stretches at least 10 staged seconds long, 49%
lie outside, holding 40% of the staged time; their 5th, 50th and 95th percentile rates are 0.25,
0.87 and 2.03. The worst are bursts: up to 328 beats in two match minutes (rate 0.085–0.11).

## (d) The attribution's place numbers (own matches, unchanged)

Median metres from his role's place to the cell where a pass, carry or take-on starts: **12.5 m**
(target 13); beyond 20 m: **15.4%** (target 20%); ball winners beyond 20 m: **25.2%** (target
25%). T822's 21 m / 54% before the place rule are gone.

## Failing limits and their suspected causes

| limit | cause (measured) |
|---|---|
| clock rate (49% of long stretches) | the writer keeps a minute open until every touch expiring in it is played (`expiring[minute] === 0`). In 2024:ENG:0:0:10:2 both sides' centre-backs leave at 74', 16 of their deep touches were still unplayed at 73', and reaching them took 260 beats (162 recorded) in that one minute, after which minutes 74–80 held 1–4 beats each. A pull on touches about to expire (rounds 33–34) evens the minutes but adds 2–7% linking metres, so the trade is a writer rule to plan, not a value. Beside the bursts, staged play runs ~15% longer than the clock (median rate 0.87). |
| events.stretchRate, events.contest | blocked shots: of 406 blocks in the 40 matches 218 needed the lunge and 187 ended with the blocker beyond 1.6 m; saves 43 of 224 beyond 1.6 m; interceptions and tackles never beyond. The block's blocker is the script's invention (the record holds no blocker): `nearestBy` on nominal places, preferring a man with a touch left in the minute, so the staged blocker can stand 15–26 m from the shot. |
| script.backPassReason | the record-driven writer gives a reason only to cut-backs, while the limit (a prototype grammar cue) asks every pass played 8 m+ back from attack x 80 for one; labelling them would only satisfy the metric. |
| turn.reverse | players under an order or cue react at once to a turnover; the free players' delays (rounds 7, 8, 18) move it by 0.01–0.02 only. |
| shape.huddleLongest | the longest close pairs are players under orders (separation moves only free players): front two of the 4-2-3-1 in possession, centre-back pairs and anchor + centre-back out of possession, 10–13 s. |
| offside.consistency | ordinary passes kicked to a receiver already past the line (missed calls); making room pushed attackers offside until round 28; still 1.5 a match. |
| mark.near | attackers beyond 65 m of possession and press sides: the back line marks across only (`markSpot` keeps its depth), so a forward between the lines has nobody within 4 m. |
| role.poacher.shoulder | wider spacing (separation 8) holds the poacher off the line 3.45 m on average; seven of 28 over 3.5 at the baseline, twelve now. |
| mean shot distance, shots from 30 m+ | the script places a recorded outside shot anywhere in its 18.5 m-deep cell (attack x 70–88.5), so about a third start beyond 30 m. |

## Round log

Each round changes one named value (or fixes a bug with a test), re-reads the 20 tuning matches
and keeps the change only when their failing limits fall with linking metres and heavy touches
not rising. Summaries in `stage-r<NN>-*/summary.json`.

| round | ended | change | tuning failing | invention | kept |
|---|---|---|---|---|---|
| base | 08:20 | – | 188 | 420 / 4,993 m / 30.4 | – |
| 1 | 08:25 | writer: a substitution waiting at a minute's end with a pass in flight stops play once the pass is in (`late-entrant.test.ts`) | 188 (all 20 wrote already) | same | yes: 5 → 0 failed scripts of 608 |
| 2 | 08:28 | `clockRates` anchors a fixed beat at clock + hold (`frame-clock.test.ts`) | 188; long stretches outside 48.4% (47.7% in a later read without it), more guard splits and a zero-rate stretch | same | no |
| 3 | 08:30 | `stage.separation` 3 → 4 | 187 | same | yes |
| 4 | 08:33 | `shape.mark.radius` 10 → 14 | 195 | same | no |
| 5 | 08:35 | `shape.mark.blend.MF` 0.6 → 0.8 | 184 | same | yes |
| 6 | 08:37 | `shape.mark.blend.DF` 0.6 → 0.8 | 183 | same | yes |
| 7 | 08:39 | `motion.turn.delayPerMetre` 0.026 → 0.04 (`own.memory` 2.2 → 2.9 to keep the longest delay) | 179 | same | yes |
| 8 | 08:40 | `motion.turn.lag.settled` 2 → 3 | 183 | same | no |
| 9 | 08:42 | `stage.tackleRange` 1.2 → 1.5 | 178 | same | yes |
| 10 | 08:43 | `stage.cutMax` 0.92 → 0.97 | 179 | same | no |
| 11 | 08:47 | `stage.shot.blockMax` 8 → 12 | 178 | same | no (no gain) |
| 12 | 08:48 | `SCRIPT_CONFIG.restartPull` 300 → 30 | 184 | 4,924 m / 31.3 | no |
| 13 | 08:50 | `stage.shot.saveNudge` 0.25 → 0.5 | 178 | same | no |
| 14 | 08:52 | `shape.onsideGap` 0.5 → 1 | 184 | same | no |
| 15 | 08:53 | `stage.through.offsideGap` 0.6 → 1 | 178 | same | no |
| 16 | 08:55 | `stage.press.press.reach` 30 → 24 | 180 | same | no |
| 17 | 08:56 | `stage.separation` 4 → 5 | 178 | same | no (tie) |
| 18 | 08:58 | `motion.own.delay.base` 0.15 → 0.25 | 178 | same | no |
| 19 | 09:02 | `shape.oop.width` 0.9 → 1.0 | 176 | 420.7 / 4,968 m / 31.9 | reverted at 27: the writer's nominal places read `shape`, heavy touches rose |
| 20 | 09:03 | `shape.oop.width` 1.0 → 1.1 | 175 | 418.8 / 4,992 m / 32.3 | reverted at 27 |
| 21 | 09:05 | `shape.mark.goalSide` 1.5 → 1 | 172 | (as 20) | yes |
| 22 | 09:06 | `stage.lunge` 2 → 3 | 175 | (as 20) | no |
| 23–26 | 09:13 | `stage.separation` 4 → 5 → 6 → 7 → 8 | 166, 155, 139, 132 | (as 20) | yes |
| 27 | 09:15 | `shape.oop.width` back to 0.9 (19/20 reverted) | 147 | 420 / 4,993 m / 30.4 | yes |
| 28 | 09:18 | staging: room made for an onside attacker stays onside (`world.test.ts`) | 140 | same | yes |
| 29 | 09:19 | `stage.ownerRoom` 4 → 8 | 134 | same | yes |
| 30 | 09:22 | `shape.mark.blend.MF` 0.8 → 1 | 134 | same | no (tie) |
| 31 | 09:24 | `shape.mark.keep` 3 → 5 | 132 | same | yes |
| 32 | 09:25 | `stage.separation` 8 → 10 | 140 | same | no |
| 33 | 09:43 | `SCRIPT_CONFIG.duePull` 60 m within 15 min of a touch's window closing (new value), all 40 | 269 → 267 (all 40) | 432 / 5,334 m / 29.2 | no: linking metres +6.7%, long stretches outside 49% → 53% |
| 34 | 09:45 | the same pull within 6 min | 132 → 127 | 425.5 / 5,098 m / 30.5 | no: linking metres and heavy touches rose |

Kept: the writer fix (round 1), the onside rule for making room (round 28) and the values
`stage.separation` 8, `stage.ownerRoom` 8, `stage.tackleRange` 1.5, `shape.mark` goalSide 1, keep
5, blend DF 0.8 / MF 0.8, `motion.turn.delayPerMetre` 0.04, `motion.own.memory` 2.9.
`STAGING_CONFIG.limits`, the registry's bands and margins were not edited. The lab's tunable
catalog (`apps/web/src/lab/tunables.json`) was regenerated by `pnpm run lab:tunables` because its
test compares it with these values.

## Scenes to look at

Seeds `t840-stage-<year>` (`model-verdict.ts stage --only <index>` replays them: a fresh world of
that year, the median-rated English top-flight club taken over, its tactic set as listed).

| kind | fixture (index) | tactics own/opp. | minute | players |
|---|---|---|---|---|
| a block far from the shot | 2024:ENG:0:0:13:5 (#25) | counter/possession | 87' | Nicholas Jennings shoots; Harry Lawrence, credited with the block, 26.1 m from the ball |
| | 1975:ENG:0:0:0:7 (#4) | possession/counter | 78' | Gordon Moore; blocker Douglas Gardner 18.5 m away |
| | 1975:ENG:0:0:26:5 (#13) | balanced/press | 72' | Bernard Wilkinson; blocker Herbert Gibbs 15.2 m away |
| the clock crawling | 2024:ENG:0:0:10:2 (#24) | possession/counter | 73' | 271 beats staged in 823 s for 1.2 match minutes (rate 0.085), just before both sides' 74' substitutions |
| | 2024:ENG:0:0:0:8 (#29) | press/press | about 71' | 238 beats in 748 s (rate 0.088) |
| | 1975:ENG:0:0:4:8 (#9) | press/press | about 73'–74' | 328 beats in 1,053 s (rate 0.11) |
| two teammates stuck together | 1975:ENG:0:0:14:2 (#10) | press/counter | 90' | Bob Page (섀도 스트라이커) and Anthony Richards (컴플리트 포워드), 12.9 s, in possession |
| | 1975:ENG:0:0:16:4 (#12) | press/balanced | 38' | Clive Jones (스토퍼) and Freddie Baldwin (커버형 센터백), 11.1 s, defending |
| | 2024:ENG:0:0:14:6 (#26) | possession/balanced | 90' | Donald Lawson (앵커) and Bob James (커버형 센터백), 10 s, defending |

## Verdicts

- The own club against other clubs (→MATCH-28): within the margins on every point estimate and
  different on no row at the same tactic, but equivalence is shown only for fouls; the outcome
  rows need about 2.5× the 608 fixtures for their intervals to fit ±3 pp.
- The scorer share: inside 20–30% — 25.2% [24.0, 26.4] over 100 club-seasons.
- The invention a match: 420 linking carries over 5.0 km, 30 heavy touches and 16 restarts
  without a recorded delivery (MATCH-38's 261111 note: 381 carries, 5.4 km, 17 heavy touches, 11
  restarts on ten matches before the place rule).
- The picture's failing limits: the clock rate between fixed moments, events.stretchRate,
  events.contest, script.backPassReason, turn.reverse, shape.huddleLongest, offside.consistency,
  mark.near and role.poacher.shoulder still fail in most matches; spacing, swarm, huddles and the
  motion-sync limits now pass in most. 269 failing limits in 40 matches, from 382.
- Chains (T822's finding re-read on the placed attribution): yes. With the place rule the
  attribution is at its targets (12.5 m, 15% / 25% beyond 20 m), yet linking metres stayed 5.0 km
  a match and every scheduling lever tried (restartPull, duePull) raised them; what remains is the
  record's flows not chaining from one action's end to the next one's start, which only drawing
  the aggregate path's flows as chains (a result-model change, →MATCH-22) would remove.
