# T689 scoring — 261104 nx04 (structural continuation of cf04)

Continues cf04's run (`../scoring-261104-cf04/`, unchanged) inside the same 2 h timebox (2026-11-04T00:42Z–02:42Z), on the nv04 worktree (`codex/nv04`, HEAD e15eaad4, released grid source), host hq-dev1-pve2-vm2 (Linux VM, 12 cores; load 5–12 while the runs below ran beside each other). cf04's 15 screens and control are not rerun. **No candidate meets the realism gate; no scoring source is committed.**

cf04 left one question: who stands in the scoring positions when the chance comes. The released shape (`packages/engine/src/grid/shape.ts`, `shapeTarget`) puts every outfielder of the side on the ball at his formation spot pushed up the pitch, capped only by the offside line (`x ≤ offside − 0.5`), so the striker waits on the last defender — inside the goal area once the back line drops — while the attacking midfielders and wingers wait 10–25 m further out. Two structural candidates test that directly, each a default-off experiment switch in `SHAPE_CONFIG.candidate` (kept uncommitted in `.tmp/nx04/nx04-source.patch`; the engine source is restored):

- `hold.out` — in possession a forward with no run waits no deeper than `out` m from the goal line instead of on the offside line, so he reaches the goal area only on a run (MATCH-33: each run timed to arrive as the ball is delivered rather than to wait there). Runs, box-scene jobs and every other intention keep their own targets.
- `arrive` {`from`, `out`, `narrow`} — in possession with the ball `from` m up, an AM, a winger or a box-run role (`BOX_ROLES`, `boxRun.extra`) waits at least as far up as `out` m from the goal line and `narrow` of the way in toward the centre (MATCH-17/33: support arriving), so the carrier finds several men in scoring positions; the offside cap still applies.

Both are behaviour patches through `scripts/scoring-candidate-patch.ts` (it throws on a setting the configs do not hold); `candidates/` keeps every JSON. `earlyZones` is nv04's earlySupport without its delivery zones (cf04 found earlySupport's near/far post at 9/11 m collapsing open-play cross finishes from xG 0.085 to 0.012), so the volume base keeps the released zones.

## 1. Calibration screens (`scripts/scoring-concentration.ts --matches 1200`, grid-bands-1..4)

Same design and seeds as cf04's screens (equal top-tier pairs, tactics rotated, both venues; 1,200 matches reach 2–3 of four world seeds, so top-scorer intervals over seed clusters are wide). Band for the club top-scorer share 20–30% (MATCH-23 window to 31.25%).

| candidate | goals / match | shots a team | hat-tricks / match | clubs 20+ | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST slot: shots an app., shot share, goal share | FW line goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---:|---|---:|---|---|---:|---|
| released (nv04) | 3.754 | 20.08 | 0.197 | 77 | 42.3% [37.1, 47.4] | 35.0% | 10.7 / 7.9% | 6.24, 46.6%, 53.8% | 64.9% | 0.77, 5.1% |
| earlySupport (cf04 earlyCtl) | 2.607 | 15.70 | 0.073 | 75 | 40.8% [33.7, 48.0] | 29.5% | 14.3 / 9.0% | 4.24, 40.5%, 50.5% | 61.4% | 1.13, 9.0% |
| holdRel11 | 3.589 | 19.84 | 0.168 | 77 | 48.0% [45.0, 51.0] | 34.2% | 13.2 / 7.4% | 6.13, 46.4%, 53.8% | 65.0% | 0.75, 5.0% |
| holdRel14 | 3.453 | 19.84 | 0.169 | 78 | 42.1% [39.1, 45.0] | 34.2% | 10.5 / 7.4% | 6.08, 46.0%, 54.1% | 65.1% | 0.77, 4.9% |
| holdRel18 | 3.267 | 19.60 | 0.117 | 77 | 36.8% [25.1, 48.5] | 32.0% | 10.3 / 8.5% | 5.91, 45.2%, 51.3% | 63.0% | 0.77, 5.1% |
| earlyZones (control) | 2.863 | 16.05 | 0.096 | 76 | 37.5% [28.1, 46.9] | 26.9% | 13.5 / 8.0% | 4.37, 40.9%, 49.7% | 60.7% | 1.12, 8.6% |
| holdEZ11 | 2.733 | 15.83 | 0.072 | 73 | 44.8% [41.1, 48.5] | 31.0% | 12.1 / 6.7% | 4.29, 40.6%, 51.1% | 62.3% | 1.11, 8.5% |
| holdEZ14 | 2.681 | 15.88 | 0.083 | 73 | 40.1% [28.6, 51.5] | 30.8% | 12.1 / 7.7% | 4.29, 40.5%, 49.2% | 60.7% | 1.11, 8.6% |
| arrRel | 4.082 | 21.66 | 0.199 | 76 | 40.8% [39.4, 42.2] | 31.9% | 12.4 / 8.3% | 6.11, 42.3%, 51.1% | 63.1% | 1.65, 8.7% |
| arrHoldRel | 3.822 | 21.29 | 0.151 | 76 | 37.6% [28.0, 47.2] | 31.4% | 11.0 / 8.4% | 5.82, 41.0%, 48.1% | 60.2% | 1.70, 10.4% |
| arrHoldRelB | 3.939 | 21.82 | 0.139 | 77 | 42.6% [34.0, 51.3] | 31.3% | 12.9 / 7.9% | 5.83, 40.0%, 44.6% | 58.2% | 1.87, 11.3% |
| arrEZ | 3.158 | 16.86 | 0.095 | 76 | 41.9% [35.4, 48.3] | 28.9% | 13.6 / 7.6% | 4.28, 38.1%, 48.7% | 59.7% | 1.63, 12.2% |
| arrHoldEZ | 2.777 | 16.48 | 0.059 | 74 | 33.4% [19.1, 47.7] | 27.7% | 10.4 / 7.4% | 4.04, 36.8%, 46.4% | 58.3% | 1.67, 11.9% |
| arrHoldEZ60 | 2.874 | 16.85 | 0.069 | 75 | 32.8% [25.1, 40.5] | 25.3% | 11.7 / 8.3% | 4.00, 35.6%, 45.8% | 56.7% | 1.97, 14.4% |
| arrHoldEZ55s (arrive from 55, out 12, narrow 0.4; hold 12) | 3.073 | 17.18 | 0.075 | 74 | 35.7% [29.0, 42.3] | 25.4% | 12.3 / 7.4% | 4.02, 35.1%, 45.0% | 57.1% | 2.07, 14.9% |
| arrHoldEZ60h11 (arrHoldEZ60 with hold 11) | 3.055 | 17.05 | 0.078 | 76 | 39.3% [32.3, 46.3] | 27.2% | 13.6 / 7.7% | 4.15, 36.5%, 46.9% | 58.4% | 1.92, 12.8% |

`holdRel*`/`holdEZ*` = `hold.out` on the released source / on earlyZones; `arr*` = `arrive` {from 70, out 14, narrow 0.3} unless named (`arrHoldRelB`: hold 12, arrive out 12 narrow 0.5; `arrHoldEZ60`: arrive from 60), with `hold.out` 14 where `Hold` is named. FW line goal share = ST + LW + RW slots of all goals in this design (not the MATCH-28 core row).

Reading: `hold` alone does not move the allocation — the striker slot keeps 45–46% of the shots (released base) and 40.5–40.6% (earlyZones base), and goals fall a little only because his goal-area waiting goes (holdRel18 3.27 a match). Waiting on the last line is not why he gets the ball. `arrive` puts other men in the scoring positions and is the first lever in T689's runs that moves the striker slot: on the earlyZones base his shot share falls 40.9 → 35.6% and his goal share 49.7 → 45.8% (arrHoldEZ60), central midfielders' goals 8.6 → 14.4% and shots 1.12 → 1.97 an appearance, the FW line 60.7 → 56.7%; cf04's 15 screens on the earlySupport family stayed at 40.4–40.9%. The club top-scorer share's point estimate falls to 32.8% [25.1, 40.5], with the seed-cluster interval still wide and reaching above the 31.25% window. Without the volume base (`arrRel`, `arrHoldRel*`) the same shift costs goals: 3.8–4.1 a match, shots 21.3–21.8.

## 1b. Held-out validation (`scripts/scoring-concentration.ts --matches 1200 --seeds t689-val-1..4`)

The least-bad screen, arrHoldEZ60, beside its control on nv04's validation seeds (independent of every calibration seed):

| candidate | goals / match | shots a team | hat-tricks / match | clubs 20+ | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST slot: shots an app., shot share, goal share | FW line goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---:|---|---:|---|---|---:|---|
| released (nv04) | 3.647 | 20.20 | 0.177 | 77 | 44.4% [43.6, 45.1] | 32.6% | 12.2 / 7.3% | 6.22, 46.2%, 53.7% | 64.8% | 0.74, 4.7% |
| earlyZones (control) | 2.817 | 15.88 | 0.093 | 75 | 42.9% [42.7, 43.1] | 29.0% | 12.8 / 7.0% | 4.29, 40.6%, 51.9% | 63.3% | 1.07, 7.0% |
| arrHoldEZ60 | 2.765 | 16.81 | 0.049 | 75 | 36.2% [34.5, 37.9] | 24.5% | 12.2 / 7.0% | 3.94, 35.1%, 44.4% | 57.3% | 1.89, 13.2% |

Reading: on held-out seeds the shift holds and is resolved — the club top-scorer share falls 42.9% [42.7, 43.1] → 36.2% [34.5, 37.9], his shot share 29.0 → 24.5%, the striker slot's goal share 51.9 → 44.4%, hat-tricks 0.093 → 0.049 a match (inside 0.02–0.05), central midfielders' goals 7.0 → 13.2%, goals 2.77 a match (inside) — but the top-scorer share stays above the 31.25% window and shots rise 15.88 → 16.81 a team (window to 15.625).

## 1c. MATCH-28 core report, calibration (`scripts/grid-bands.ts --report --partition calibration --scale 0.25 --only core,tactics --jobs 5`)

The same partition, scale and seeds as nv04's released calibration row (17 conditions × 150 = 2,550 matches; `report-*-calibration.json`, the switches applied and off for earlyZones). MATCH-23 core rows that differ in status (150 matches, so many rows are unresolved; `analysis/report-core.py` prints all 38):

| core row (window) | released (nv04) | earlyZones | arrHoldEZ60 |
|---|---|---|---|
| goals a match (2.06–3.44) | 4.03 outside | 2.73 inside | 3.24 unresolved |
| shots a team (9.4–15.6) | 21.6 outside | 16.7 outside | 18.0 outside |
| possessions ending in a shot (9.4–15.6%) | 24.4 outside | 19.9 outside | 21.3 outside |
| goal-area / box / outside shots (5.6–9.4 / 39.8–66.3 / 27.8–46.3%) | 15.3 out / 66.2 unres. / 18.4 out | 15.5 out / 74.3 out / 10.2 out | 14.9 out / 74.4 out / 10.7 out |
| back passes (11.3–18.8%) | 16.9 inside | 20.0 outside | 19.4 outside |
| penalty goals (5.6–9.4%) | 7.9 unresolved | 12.7 unresolved | 12.1 outside |
| goals by FW / MF (41.3–68.8 / 24–40%) | 78.3 out / 12.4 out | 78.0 out / 14.4 out | 67.5 unres. / 24.3 unres. |
| goal kicks (6–10) | 11.6 outside | 8.8 inside | 9.5 inside |
| rows inside / outside / unresolved | 20 / 11 / 7 | 19 / 11 / 8 | 17 / 10 / 11 |
| MATCH-29 verdicts inside / outside / insufficient | 4 / 7 / 14 | 4 / 3 / 18 | 4 / 2 / 19 |
| invariant failures (all 17 conditions) | 0 | 0 | 0 |

Reading: `arrive` takes the line shares out of "outside" for the first time in T689 (FW goals 78 → 67.5%, MF 14 → 24.3%, both just inside their windows' edges and unresolved at 150 matches), but it raises shots (16.7 → 18.0 a team) and goals (2.73 → 3.24) on calibration, keeps earlySupport's back-pass miss and adds penalty goals outside (12.1%). This is a 150-match core read on calibration only; no validation report was run.

## 2. Striker stress case (`scripts/scoring-striker-stress.ts`, validation seeds cf04-stress-val-1..3)

Same design as cf04 §2 (each seed × four own tactics × normal/stress arm × 38 fixtures, 456 matches an arm; fixed squads, fitness reset each match — stress measurements, not season totals). Intervals over the three seeds. Every record passed `validateFullMatchRecord` and its scorer total against the score (0 invalid).

| variant | arm | goals / match | own goals / match | own shots | club top-scorer share [95%] | top scorer goals / 38 | largest / 38 | hat-tricks / own match | FW goals | star goals / 38 [95%] | star shots / match |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---|---:|
| released (cf04) | normal | 3.97 | 1.97 | 21.8 | 41.2% [39.1, 43.3] | 31.9 | 62 | 0.094 | 65% | - | - |
| released (cf04) | stress | 4.51 | 2.15 | 20.2 | 61.9% [61.1, 62.6] | 51.8 | 100 | 0.184 | 79% | 51.8 [47.6, 55.9] | 7.88 |
| holdRel11 | normal | 3.83 | 1.92 | 21.3 | 44.3% [40.5, 48.2] | 32.4 | 48 | 0.083 | 66% | - | - |
| holdRel11 | stress | 4.36 | 2.09 | 20.0 | 61.7% [59.1, 64.3] | 49.9 | 93 | 0.171 | 79% | 49.9 [46.1, 53.8] | 7.73 |
| earlyZones (control) | normal | 3.01 | 1.54 | 17.1 | 41.3% [36.7, 46.0] | 24.7 | 41 | 0.055 | 60% | - | - |
| earlyZones (control) | stress | 3.50 | 1.61 | 16.0 | 58.6% [54.3, 62.9] | 36.7 | 62 | 0.103 | 77% | 36.7 [33.0, 40.3] | 5.69 |
| holdEZ11 | normal | 2.89 | 1.47 | 16.9 | 41.0% [36.2, 45.8] | 22.9 | 35 | 0.037 | 65% | - | - |
| holdEZ11 | stress | 3.29 | 1.62 | 16.1 | 56.9% [53.0, 60.9] | 35.7 | 60 | 0.086 | 75% | 35.7 [31.4, 40.0] | 5.82 |
| arrHoldEZ60 | normal | 3.11 | 1.63 | 17.7 | 42.2% [40.6, 43.8] | 26.1 | 38 | 0.053 | 63% | - | - |
| arrHoldEZ60 | stress | 3.42 | 1.56 | 16.8 | 56.5% [52.9, 60.0] | 33.5 | 52 | 0.068 | 73% | 33.5 [30.6, 36.4] | 5.40 |

Reading: the stress case does not follow the grid-bands shift. On the fixed 38-fixture squads the normal arm's top scorer keeps 41–44% of his club's goals on every variant, and the peak striker 56.5–58.6% on the earlyZones family (61.7–61.9% at released volume); arrHoldEZ60 lowers his run to 33.5 goals and the largest to 52, but against its control the shares sit inside the three-seed intervals. Summary file: `stress-summary-validation.json`.

## 3. Shot origins (`scripts/scoring-shot-origins.ts --start 600 --matches 240`, calibration seeds)

Open play as cf04 §3 (penalties and direct restarts left out, their second phases kept), the same matches 600–839; `analysis/shots-open.py` reproduces cf04's released column exactly.

| open play, matches 600–839 | released (cf04) | holdRel18 | holdEZ11 | arrHoldEZ60 |
|---|---:|---:|---:|---:|
| shots a team / goals a team | 17.8 / 1.32 | 17.6 / 1.27 | 13.9 / 1.00 | 14.8 / 1.00 |
| shot place goal area / rest of box / outside (all shots' band 6–9 / 48–58 / 32–42%) | 18.6 / 62.4 / 19.0% | 16.1 / 64.1 / 19.8% | 16.1 / 73.2 / 10.7% | 16.4 / 74.5 / 9.2% |
| conversion goal area / rest of box / outside | 26.2 / 3.2 / 2.6% | 27.0 / 3.9 / 2.2% | 25.8 / 3.6 / 3.6% | 25.2 / 3.1 / 2.9% |
| share of open-play goals from goal-area shots | 66.0% | 59.9% | 57.7% | 61.3% |
| ST slot's share of goal-area / box / outside shots | 55.9 / 42.7 / 51.7% | 53.6 / 42.0 / 48.9% | 54.4 / 35.9 / 43.1% | 46.2 / 30.4 / 43.3% |
| ST slot's open-play goal share; his goal-area goals of all open-play goals | 57.3%; 40.5% | 53.8%; 34.2% | 53.6%; 32.6% | 48.3%; 31.2% |
| delivery finishes (`pass-cross`): shots a team, xG a shot, conversion | 0.76, 0.085, 8.3% | 0.78, 0.078, 7.0% | 0.72, 0.085, 8.7% | 0.70, 0.080, 8.3% |
| shot straight after a won interception: shots a team, conversion, share of open-play goals, ST's share of these shots | 0.84, 19.7%, 12.5%, 61% | 0.79, 22.4%, 13.9%, 60% | 0.69, 22.4%, 15.5%, 63% | 0.76, 19.0%, 14.4%, 60% |

Reading: `arrive` is the first change that takes goal-area and box shots off the striker slot (55.9 → 46.2% and 42.7 → 30.4%), and the released delivery zones keep cross finishes alive (xG 0.080 a shot, against earlySupport's 0.012). Untouched: the goal-area share itself (16% against 6–9%, still 61% of open-play goals at 25% conversion), box conversion at about 3% (a third of real football's), outside shots at 9% (32–42%) on the earlyZones base, and the shot after a high regain (60–63% the striker's, 19–22% conversion) — `arrive` and `hold` act only with the ball, not on regains.

## Gate

Unmet; no scoring source is committed. The best candidate, arrHoldEZ60 (earlyZones volume base + `hold` 14 + `arrive` from 60), is the first in T689 to move the striker slot beyond the noise on held-out seeds, but it misses MATCH-23's club top-scorer row (36.2% [34.5, 37.9] against the 20–30% band, window to 31.25%), shots a team (16.81 against 11–14, window to 15.625), outside shots (about 9% against 32–42%) and goal-area shots (16% against 6–9%), and the owner-profile stress case does not move (normal 42.2%, peak striker 56.5%). On MATCH-28's calibration core read (150 matches) it also keeps its volume base's back-pass miss (19.4%) and adds penalty goals outside (12.1%), with shots 18.0 a team and goals 3.24 unresolved. The two default-off switches stay uncommitted in `.tmp/nx04/nx04-source.patch` (copy `analysis/nx04-source.patch`, `git apply` clean on e15eaad4); the engine source is restored.

What the next attempt needs, from these measurements: `arrive`'s direction (more men in the scoring positions when the ball is in front of the box) is the first lever that redistributes, so the next step builds on it rather than on box-scene knobs — measured on MATCH-28's core report on both partitions at full scale (this run reached only calibration at scale 0.25), without raising shots; then the goal-area share and box conversion (too many goal-area chances, box chances at a third of real conversion) and the regains (a striker taking 60% of the shots straight after a won interception), which no ball-side shape change reaches.

Limits: calibration screens are 1,200 matches on 2–3 of four world seeds (wide seed-cluster intervals); the held-out read is one 1,200-match run of the best screen and its control; the stress case is fixed-squad, 3 seeds × 4 tactics × 38 fixtures, not season totals; shot origins are 240 observed matches a variant; MATCH-28's core/tactics report ran only for arrHoldEZ60 and earlyZones on calibration at scale 0.25 (150 matches a condition: most MATCH-29 verdicts insufficient), with no validation report and no whole-career season for any nx04 candidate; no proof that every knob a candidate names is read on revision 10 beyond the preload's existence check. Run times on this host (6–11 jobs side by side): a 1,200-match screen 540–603 s, a stress seed 143–156 s, 240 observed matches about 5 min, a 2,550-match calibration report with 5 jobs 348 s.
