# T689 scoring — 261104 cv04-rec (MATCH-29's press v counter at the candidate's volume, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z) continues from cv04-sit's Next: MATCH-29 through how often counter's chances behind press's line arise. This window: **16:50Z–18:50Z**, measurements 16:51–17:45Z, then the evidence, on `codex/cv04` at 1d618ac5 (Apple M1 Max, 10 cores, at most 6 measurement workers at once; the host's load average stood at 16–19 from other processes during part of it, which slows runs but not their results). cv04's, cv04-hold's, cv04-sit's, nx04's and cf04's evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sit's `sn01o08h25` (`candidates/sn01o08h25.json`, copied with cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-sit's patch re-applied; this window's new default-off switches, uncommitted in `analysis/cv04-rec-source.patch` with every earlier switch (`git apply --check` clean on 1d618ac5; the engine source is restored):

- `shape.candidate.drop` {`seconds`, `line`, `free`}: for `seconds` after losing the ball, with nobody of the side within `free` m of it, the back line drops to at most `line` m from its goal (`shapePlace`).
- `shape.candidate.sweepAll`: every keeper steps up behind a high line as a sweeper keeper does (`SHAPE_CONFIG.sweeperStep`, `keeperMax.sweeperKeeper`).
- `duel.candidate.crossBlockBehind`: a cross neither delivered nor overhit goes behind for a corner off the defender at the crosser's foot, this share × the pressure on him (`resolveCross`).
- `duel.candidate.headBehind`: a defender who wins a delivery's aerial duel heads it behind for a corner this share of the time (`aerialDelivery`).
- `shot.revision9.narrow.ahead` and `shape.candidate.revision9.keeperOut.ahead`: cv04-sit's situational narrowing and come-out count a defender as between the shooter (carrier) and the goal only `ahead` m or more goal-side of him along that line, so a man chasing level with him no longer relieves the keeper.

The default-off identity holds: `sn01o08h25`'s band check on this window's source reproduces cv04-sit's log line for line (`ms a match` aside).

New diagnostic (committed, measurement only): `scripts/scoring-press-counter.ts` plays press v counter (real clubs within 2 rating points, as `scoring-shot-origins.ts`, both venues alternating, observed) and splits each side's shots by how long into the possession, how it began, how many defending outfielders stood goal-side of the shooter, and whether the possession held a received through pass (the trace's `through` kind, wider than MATCH-13's counter); it counts through passes received from an offside position the call's draw let stand (→MATCH-18).

Candidate names: `dr<s>l<m>[f<m>]` drop (seconds, line, free); `sw5m28` sweepAll with step 0.5, at most 28 m; `cb<v>` crossBlockBehind v/10; `hb<v>` headBehind v/100; `ah<m>` ahead m; `s10` shotScale 0.1; `w0` the alone clause anywhere (cv04-sit's `within` 12 off); `a6`/`a7` its radius 6 / 7 m (MATCH-16's 5 m); `s05` shotScale 0.05; `a0x0` `shot.a` −0.x. `hb2`, `sw`, `dr10l25f10`, `cb5dr6l30` and `w0ah3s05hb35` were written but not measured.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/r*.json` by `analysis/make-jobs.mjs`; `r1` is the diagnostic's first run, `r3`'s first list was overwritten before it ran): `scripts/scoring-press-counter.ts --start S --matches 200` (`pcd-*.json`, `analysis/pcd.mjs`); `scripts/grid-bands.ts --report --partition calibration --scale 2 --conditions tactics:press-counter,tactics:counter-press --jobs 2` (`pc-*.json`, 1,200 matches a venue on the calibration seeds, as cv04-sit's; `analysis/pcside.mjs`, whose gap reproduces cv04-sit's `tactics.mjs`); `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, cv04's `analysis/table.mjs`); `scripts/scoring-concentration.ts --matches 2400 --seeds t689-val-1..4` (cv04-hold's `analysis/conc.mjs`); `scripts/scoring-striker-stress.ts` (cf04-stress-val-1..3, cv04's `analysis/stress.mjs`); `scripts/grid-bands.ts --report --partition validation --scale 1 --only core` (cv04-sit's `analysis/core.mjs`) and `--partition calibration --scale 0.25 --only tactics` (cv04-sit's `analysis/tactics.mjs`); `analysis/collect.mjs` copies the band logs. Every report (19 files, 50 conditions, 42,000 matches) has no invariant or full-record failure, and every stress record is valid (0 invalid in 1,824 matches). The first `pc-cb5` and `pc-dr6l30` runs stopped on the report's source check (a switch was added while they ran); their re-runs on the settled source read −0.233 and −0.232, as the stopped runs' logs did.

## 1. Where press v counter's shots come from (`scoring-press-counter.ts`, observed)

Per match: shots / goals / conversion / xG a shot. `ctl` and `sn01o08h25` pool three 200-match runs (600 matches), `w0` one (200); the through-pass rows read only the third run of each (200 matches).

| side, shots | ctl | sn01o08h25 | w0 |
|---|---|---|---|
| press: open play | 11.65 / 0.863 / 7.4% / 0.065 | 7.12 / 0.818 / 11.5% / 0.108 | 10.79 / 0.970 / 9.0% / 0.087 |
| press: set pieces | 2.16 / 0.492 / 22.7% / 0.213 | 1.37 / 0.243 / 17.8% / 0.168 | 1.71 / 0.305 / 17.9% / 0.185 |
| press: within 8 s of the possession | 1.94 / 0.220 / 11.3% / 0.101 | 0.89 / 0.137 / 15.3% / 0.119 | 1.48 / 0.165 / 11.2% / 0.088 |
| press: 25 s or more into it | 6.10 / 0.420 / 6.9% / 0.061 | 4.13 / 0.462 / 11.2% / 0.112 | 6.04 / 0.560 / 9.3% / 0.091 |
| press: three or more defenders goal-side | 5.78 / 0.138 / 2.4% / 0.019 | 2.49 / 0.135 / 5.4% / 0.055 | 5.37 / 0.275 / 5.1% / 0.050 |
| counter: open play | 20.20 / 0.968 / 4.8% / 0.043 | 17.14 / 1.267 / 7.4% / 0.070 | 20.47 / 1.455 / 7.1% / 0.060 |
| counter: set pieces | 2.72 / 0.425 / 15.6% / 0.140 | 2.39 / 0.303 / 12.7% / 0.109 | 2.52 / 0.245 / 9.7% / 0.087 |
| counter: within 8 s of the possession | 3.35 / 0.287 / 8.5% / 0.070 | 2.54 / 0.170 / 6.7% / 0.074 | 3.01 / 0.275 / 9.1% / 0.069 |
| counter: 25 s or more into it | 6.60 / 0.300 / 4.5% / 0.044 | 5.53 / 0.513 / 9.3% / 0.089 | 6.65 / 0.485 / 7.3% / 0.073 |
| counter: no defender goal-side | 4.94 / 0.228 / 4.6% / 0.048 | 4.24 / 0.218 / 5.2% / 0.059 | 5.01 / 0.285 / 5.7% / 0.052 |
| counter: one goal-side | 7.22 / 0.428 / 5.9% / 0.052 | 6.67 / 0.627 / 9.4% / 0.085 | 7.48 / 0.675 / 9.0% / 0.072 |
| counter: in a possession with a received through pass (third run) | 10.24 / 0.410 / 4.0% / 0.041 | 10.18 / 0.935 / 9.2% / 0.075 | 10.89 / 0.775 / 7.1% / 0.065 |
| counter: in a possession without (third run) | 11.12 / 0.600 / 5.4% / 0.048 | 7.49 / 0.500 / 6.7% / 0.061 | 9.58 / 0.680 / 7.1% / 0.053 |
| through passes, press: attempted / completed / completed from an offside position / called offside | 22.1 / 17.5 / 2.7 / 0.54 | 21.1 / 16.5 / 2.5 / 0.63 | 21.1 / 16.7 / 2.8 / 0.69 |
| through passes, counter: the same | 27.7 / 22.3 / 5.6 / 0.48 | 31.7 / 24.8 / 6.7 / 1.17 | 30.7 / 24.2 / 6.3 / 0.99 |

Readings:

- **The regression is an asymmetric volume cut under a symmetric quality rise.** `sn01o08h25` takes press's open-play shots 11.65 → 7.12 a match (−39%) but counter's only 20.2 → 17.1 (−15%), while both sides' xG a shot rises by about two-thirds (press 0.065 → 0.108, counter 0.043 → 0.070): counter's open-play goals rise 0.97 → 1.27 and press's stay at 0.86 → 0.82. Press's set-piece goals halve as well (0.49 → 0.24: fewer blocked shots, so fewer corners and penalties; counter's 0.43 → 0.30).
- Press's lost shots are its shots against counter's deep block: three or more defenders goal-side 5.78 → 2.49 a match.
- Counter's chances against press are not mainly fast breaks (within 8 s: 3.4 of 20.2 shots in the control, 2.5 of 17.1 on the candidate); half come in possessions with a received through pass, which on the candidate convert 9.2% against the control's 4.0%. Counter receives 5.6–6.7 through passes a match from an offside position the draw lets stand (press 2.5–2.8) and is called 0.5–1.2 times.

## 2. MATCH-29: press v counter at 1,200 matches a venue (calibration)

| read | press win share − counter's [95%] | press: goals, shots, xG a shot, possession | counter: goals, shots, xG a shot, MATCH-13 through balls (completed) | corners a team (the two conditions) |
|---|---|---|---|---|
| ctl (cv04-sit) | −0.148 [−0.183, −0.114] | 1.33, 13.7, 0.097, 63.1% | 1.75, 25.2, 0.065, 5.41 (4.44) | 4.71 / 5.06 |
| sn01o08h25 (cv04-sit) | −0.233 [−0.268, −0.199] | 1.20, 8.9, 0.137, 64.0% | 1.88, 21.7, 0.084, 5.10 (4.21) | 4.02 / 4.20 |
| soVol (cv04-sit) | −0.166 [−0.200, −0.132] | 1.52, 13.3, 0.115, 64.1% | 1.99, 25.0, 0.077, 5.01 (4.16) | 4.80 / 5.03 |
| dr6l30 | −0.232 [−0.266, −0.198] | 1.22, 8.9, 0.135, 63.8% | 1.92, 21.8, 0.085, 4.26 (3.46) | 4.04 / 4.27 |
| sw5m28 | −0.275 [−0.308, −0.242] | 1.17, 8.9, 0.135, 64.0% | 1.90, 21.9, 0.085, 5.14 (4.29) | 3.98 / 4.17 |
| cb5 | −0.233 [−0.267, −0.199] | 1.19, 8.9, 0.137, 64.0% | 1.87, 21.7, 0.084, 5.11 (4.21) | 4.04 / 4.22 |
| hb35cb8 | −0.257 [−0.291, −0.223] | 1.15, 8.9, 0.134, 64.1% | 1.89, 21.7, 0.085, 5.04 (4.17) | 4.70 / 4.94 |
| s10 | −0.246 [−0.280, −0.213] | 1.27, 10.0, 0.129, 64.0% | 1.92, 22.1, 0.083, 5.07 (4.20) | 4.24 / 4.46 |
| w0 | −0.181 [−0.216, −0.147] | 1.43, 12.3, 0.118, 64.2% | 1.98, 24.7, 0.078, 5.00 (4.13) | 4.58 / 4.81 |
| ah3 | −0.199 [−0.233, −0.165] | 1.10, 8.7, 0.123, 64.1% | 1.62, 21.8, 0.069, 5.11 (4.22) | 3.99 / 4.15 |
| ah6 | −0.226 [−0.260, −0.192] | 1.06, 8.7, 0.122, 64.0% | 1.62, 21.7, 0.070, 5.08 (4.19) | 3.95 / 4.16 |
| ah3hb35 | −0.211 [−0.245, −0.178] | 1.08, 8.7, 0.123, 64.1% | 1.57, 21.8, 0.069, 5.09 (4.20) | 4.66 / 4.90 |
| w0ah3 | −0.153 [−0.188, −0.119] | 1.28, 12.1, 0.109, 64.0% | 1.66, 24.9, 0.064, 5.04 (4.20) | 4.57 / 4.76 |
| w0ah3s05 | −0.155 [−0.189, −0.121] | 1.22, 11.2, 0.111, 64.2% | 1.62, 24.5, 0.064, 5.01 (4.16) | 4.36 / 4.58 |
| w0a6ah3 | −0.150 [−0.185, −0.116] | 1.19, 10.4, 0.113, 64.1% | 1.58, 23.0, 0.064, 5.04 (4.15) | 4.13 / 4.38 |
| **w0a7ah3** | **−0.141 [−0.175, −0.107]** | 1.12, 9.6, 0.116, 63.9% | 1.51, 22.3, 0.065, 5.02 (4.16) | 4.02 / 4.28 |
| w0a7ah3hb35 | −0.173 [−0.207, −0.139] | 1.13, 9.7, 0.115, 63.8% | 1.56, 22.3, 0.065, 5.05 (4.19) | 4.72 / 5.01 |
| w0a7ah3hb35a090 | −0.186 [−0.220, −0.152] | 1.17, 9.7, 0.118, 63.8% | 1.61, 22.3, 0.068, 5.05 (4.20) | 4.74 / 5.04 |
| w0a7ah3hb35a070 | −0.189 [−0.223, −0.155] | 1.25, 9.9, 0.123, 63.9% | 1.75, 22.3, 0.074, 4.99 (4.14) | 4.80 / 5.11 |

Press plays no MATCH-13 through ball against counter in any read (0.00).

Readings:

- **Counter's chances behind press's line are not the regression.** The back line's drop after a loss (`dr6l30`; `dr4l35`, `dr8l30f8` on the band check only), every keeper sweeping (`sw5m28`) and crosses or headers sent behind for corners (`cb5`, `hb35cb8`) leave press v counter at −0.23 to −0.28; `dr6l30` takes counter's completed through balls 4.21 → 3.46 a match with the same goals.
- **The 12 m limit on MATCH-16's alone clause carries it.** Raising the volume scale (`s10`: shotScale 0.07 → 0.1) returns press only 1.1 shots and leaves −0.246; the alone clause anywhere (`w0`) returns press's shots to 12.3 and the gap to −0.181. Press's chances against a deep block are carriers at the edge of the box with nobody within 5 m, which the 12 m limit removes.
- `ahead` 3 m keeps the keeper's narrowing against a shooter whose nearest "between" defender is only chasing him: counter's xG a shot 0.084 → 0.069 and the gap −0.199 (`ah6` −0.226, within noise of it).
- Together (`w0ah3`) the gap returns to the control's level (−0.153) but shots to 15.4 a team. A wider alone radius in place of the 12 m limit holds the volume: `w0a6ah3` −0.150 with 13.5 shots, **`w0a7ah3` −0.141 [−0.175, −0.107] with 12.8 shots** — the control's press v counter at the candidate's volume. The set-piece lever (`hb35`) and higher `shot.a` move it back toward −0.17 to −0.19, within about one interval of it.
- The control itself reads outside MATCH-29's 12-point band, so no read here passes the row; the regression cv04-sit found is what `w0a7ah3` removes.

## 3. Band checks (`grid-bands.ts --candidate --matches 400`, calibration seeds)

| candidate | shots a team | xG a shot | goal area / box / outside % | poss. ending in a shot % | goals | pen. goals % | FW / MF goals % | corners / set-piece / headed / DF goals | rows inside | unopposed a team (scored) |
|---|---:|---:|---|---:|---:|---:|---|---|---:|---|
| sn01o08h25 (cv04-sit) | 11.85 | 0.10 | 19.47✗ / 70.61✗ / 9.93✗ | 14.49 | 2.51 | 7.88 | 67.00 / 25.92 | 3.50✗ / 11.7✗ / 10.9✗ / 7.1✗ | 25/37 | 5.06 (11.1%) |
| cb3 / cb5 / cb8 | 11.76–11.77 | 0.10 | 19.1✗ / 70.8✗ / 10.1✗ | 14.4 | 2.47–2.50 | 8.1 | 65.8–66.0 / 26.7–27.1 | 3.54✗ (cb5) | 25/37 | 5.0 (11.0%) |
| dr4l35 / dr6l30 / dr8l30f8 | 11.95–12.17 | 0.10 | 18.9–19.5✗ / 70.6–71.3✗ / 9.9–10.1✗ | 14.6–14.9 | 2.44–2.65 | 7.0–8.7 | 64.6–68.0 / 25.8–28.4 | 3.54✗ (dr6l30) | 25/37 | 4.9–5.0 |
| sw5m28 | 11.97 | 0.10 | 17.98✗ / 72.17✗ / 9.85✗ | 14.62 | 2.50 | 8.32 | 63.13 / 30.06 | - | 25/37 | 4.84 (10.7%) |
| hb35 | 11.86 | 0.10 | 18.85✗ / 71.15✗ / 10.00✗ | 14.67 | 2.70 | 7.96 | 63.98 / 27.69 | 4.08 / 14.0✗ / 13.8 / 8.3 | 28/37 | 4.77 (12.0%) |
| hb35cb8 | 11.92 | 0.10 | 18.87✗ / 71.06✗ / 10.07✗ | 14.77 | 2.71 | 8.12 | 64.58 / 27.12 | 4.16 / 14.1✗ / 13.6 / 8.3 | 28/37 | 4.79 (12.1%) |
| s10 | 12.64 | 0.10 | 18.25✗ / 71.32✗ / 10.43✗ | 15.43 | 2.69 | 9.56✗ | 66.48 / 27.58 | - | 25/37 | 4.85 (11.6%) |
| w0 | 15.47 | 0.09 | 13.01✗ / 76.92✗ / 10.07✗ | 18.70✗ | 3.01 | 7.64 | 65.95 / 26.91 | - | 26/37 | 7.55 (9.4%) |
| w0ah3 | 15.43 | 0.08✗ | 12.98✗ / 76.98✗ / 10.05✗ | 18.62✗ | 2.53 | 8.69 | 65.35 / 26.46 | - | 26/37 | 7.42 (9.2%) |
| w0ah3s05 | 14.91 | 0.08✗ | 13.26✗ / 77.24✗ / 9.50✗ | 18.02✗ | 2.50 | 7.39 | 66.07 / 27.35 | - | 25/37 | 7.48 (9.3%) |
| w0a6ah3 | 13.48 | 0.08 | 16.24✗ / 72.88✗ / 10.89✗ | 16.53✗ | 2.37 | 9.41✗ | 63.85 / 26.74 | - | 26/37 | 6.10 (9.5%) |
| w0a7ah3 | 12.77 | 0.08 | 17.07✗ / 73.09✗ / 9.84✗ | 15.69✗ | 2.37 | 10.97✗ | 67.19 / 24.89 | 3.73✗ / 13.6✗ / 12.0✗ / 7.9✗ | 24/37 | 5.56 (10.3%) |
| w0a7ah3hb35 | 12.68 | 0.08 | 16.77✗ / 73.26✗ / 9.98✗ | 15.75✗ | 2.12 | 9.31 | 65.49 / 25.91 | inside / 16.0✗ / inside / inside | 27/37 | 5.49 (9.3%) |
| w0a7ah3hb35a090 | 12.66 | 0.08 | 16.64✗ / 73.60✗ / 9.76✗ | 15.66✗ | 2.17 | 10.05✗ | 67.78 / 23.90✗ | - / 16.1✗ / - / - | 25/37 | 5.37 (9.2%) |
| w0a7ah3hb35a080 | 12.75 | 0.08 | 16.52✗ / 73.48✗ / 10.00✗ | 15.79✗ | 2.35 | 9.27 | 66.99 / 23.96✗ | - | 27/37 | 5.41 (9.8%) |
| w0a7ah3hb35a070 | 12.79 | 0.09 | 16.70✗ / 73.23✗ / 10.07✗ | 15.76✗ | 2.37 | 8.32 | 66.49 / 24.55 | - | 28/37 | 5.43 (10.1%) |

A defender heading a delivery behind a third of the time (`hb35`) is the first lever in T689 to bring corners (3.5 → 4.1), headed goals (10.9 → 13.8%) and DF goals (7.1 → 8.3%) inside together; set-piece goals rise 11.7 → 14.0% (18–30%). The `w0a7*` reads hold the volume rows' shots but put possessions ending in a shot just above the window (15.7–15.8% against 15.6%).

## 4. Held-out reads

Concentration (`scoring-concentration.ts --matches 2400 --seeds t689-val-1..4`):

| read | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | top scorer goals / 38 | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---|---:|---|---:|---|---|
| ctl (cv04) | 2.83 | 16.9 | 0.060 | 37.5 [36.4, 38.6] | 25.4 | 12.6 / 7.1 | 20.4 | 3.97, 35.2, 45.4 | 1.91, 13.0 |
| sn01o08h25 (cv04-sit) | 2.59 | 12.1 | 0.038 | 29.2 [27.9, 30.5] | 23.8 | 13.5 / 10.1 | 14.4 | 2.68, 33.4, 37.7 | 1.57, 19.1 |
| w0a7ah3 | 2.23 | 12.9 | 0.028 | 30.7 [29.1, 32.4] | 23.5 | 11.6 / 8.0 | 13.2 | 2.81, 32.7, 40.8 | 1.66, 16.7 |
| w0a7ah3hb35 | 2.24 | 12.9 | 0.024 | 30.8 [29.7, 31.9] | 22.7 | 12.0 / 7.8 | 13.2 | 2.81, 32.7, 39.8 | 1.64, 16.9 |
| w0a7ah3hb35a070 | 2.52 | 13.1 | 0.034 | 31.2 [31.0, 31.4] | 23.4 | 13.5 / 8.9 | 15.2 | 2.84, 32.6, 39.1 | 1.66, 16.7 |

Striker stress case (cf04-stress-val-1..3, 456 matches an arm, every record valid):

| variant | arm | goals / match | own shots | club top-scorer share [95%] | top scorer / 38 | largest / 38 | hat-tricks / own match | FW goals |
|---|---|---:|---:|---|---:|---:|---:|---:|
| ctl (nx04) | normal / stress | 3.11 / 3.43 | 17.7 / 16.8 | 42.2% / 56.4% | 26.1 / 33.5 | 38 / 52 | 0.053 / 0.068 | 63% / 73% |
| sn01o08h25 (cv04-sit) | normal / stress | 2.90 / 3.08 | 12.8 / 11.7 | 32.7% / 43.9% | 18.3 / 22.3 | 35 / 33 | 0.024 / 0.033 | 58% / 64% |
| w0a7ah3 | normal / stress | 2.38 / 2.85 | 13.5 / 12.5 | 33.8% [29.8, 37.8] / 48.0% [44.6, 51.5] | 16.2 / 23.1 | 23 / 33 | 0.022 / 0.035 | 59% / 67% |
| w0a7ah3hb35 | normal / stress | 2.22 / 2.67 | 13.4 / 12.5 | 38.5% [37.6, 39.5] / 46.2% [44.5, 47.9] | 16.3 / 21.5 | 24 / 28 | 0.024 / 0.035 | 60% / 65% |

MATCH-28's core condition (validation, scale 1, 600 matches; no invariant or full-record failure):

| read | goals | MATCH-23 inside / outside / unresolved | MATCH-23 rows outside | MATCH-30 counters outside |
|---|---:|---|---|---|
| sn01o08h25 (cv04-sit) | 2.72 | 25 / 10 / 3 | back passes, goal area / box / outside shots, shot distance, throw-ins, corners 3.56, set-piece goals 10.6%, headed 11.0%, DF goals 5.3% | box shots, box entries, front-of-box entries, xT, through balls, progressive carries |
| w0a7ah3 | 2.44 | 24 / 9 / 5 | back passes 19.8%, possessions ending in a shot 16.1%, goal area / box / outside 17.1 / 73.1 / 9.8%, shot distance 10.0 m, throw-ins 9.1, red cards 0.053, set-piece goals 11.7% | box shots, box entries, front-of-box entries, xT, through balls, progressive carries |
| w0a7ah3hb35 | 2.41 | 25 / 8 / 5 | back passes 19.9%, possessions ending in a shot 16.3%, goal area / box / outside 16.3 / 74.3 / 9.4%, shot distance 9.9 m, throw-ins 9.2, set-piece goals 14.0% | box shots, box entries, xT, through balls, progressive carries |

MATCH-29's 16 pairings (calibration, scale 0.25, 150 matches a condition): `w0a7ah3` 4 inside / 2 outside / 19 insufficient, as the control (cv04-sit's `tactics-ctl`); press v counter −0.183 [−0.278, −0.089] at this size, counter's points against the mean +0.229 (control +0.152), goals 2.50 a match over the pairings (control 3.17).

## Gate

Unmet; no scoring source is committed. This window locates cv04-sit's MATCH-29 regression — the 12 m limit on MATCH-16's alone clause, which removes press's edge-of-box chances against counter's deep block while both sides' chances gain quality — and removes it at the candidate's volume: `w0a7ah3` (the alone clause anywhere with a 7 m radius, the keeper's narrowing relieved only by a defender at least 3 m goal-side) reads press v counter −0.141 [−0.175, −0.107] at 1,200 matches a venue (control −0.148, cv04-sit's best −0.233) with 12.8–12.9 shots a team. But it gives back goals and concentration: held-out goals 2.23 (band 2.6–2.9; inside only by MATCH-23's tolerance), the club top-scorer share 30.7% [29.1, 32.4] (window to 31.25%), the stress case's peak striker 48.0% (cv04-sit 43.9%), possessions ending in a shot 15.7–16.3% (window to 15.6%); restoring goals with `shot.a` (`a070`: 2.52) puts the share at 31.2% [31.0, 31.4] and press v counter back to −0.189. The goal-area share stays 16–17% (6–9%), outside shots 9–10% (32–42%), and set-piece goals 14–16% with `hb35` (18–30%). The rules these candidates need are in no SSOT (MATCH-16's alone clause radius, MATCH-35's narrowing by situation with `ahead`, MATCH-12's keeper release, MATCH-17/33's arrivals, MATCH-18's call values and headers behind), so none could ship without a gusta-update-ssot and a prospective model revision (SAVE-23). The switches stay uncommitted in `analysis/cv04-rec-source.patch`; the engine source is restored.

## Next

1. Goals and concentration on `w0a7ah3hb35`'s volume without moving MATCH-29: a symmetric goal lever (the narrowing's `reach`, or `ahead` between 3 and 0) rather than `shot.a`, read on press v counter at 1,200 a venue, held-out seeds and the stress case together; the striker's share needs the arrivals (`arrive`) or the box allocation, not volume.
2. Counter's 20–25 shots against press (6–7 through passes a match received from an offside position the draw lets stand, against press's 2.5–2.8) are the control's own MATCH-29 miss; the drawn call is the owner's T384 choice (MATCH-18), so any change there is a planning question first.
3. Before any commit: gusta-update-ssot of MATCH-16 (the alone clause's radius and reach), MATCH-35 (narrowing and come-out by situation, `ahead`), MATCH-12 (keeper's release), MATCH-17/33 (arrivals), MATCH-18 (call values; headers behind for corners), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions.

## Limits

- Timing: the window ran 16:50–18:50Z; measurements 16:51–17:45Z, then the evidence. Measurement wall-clock about 55 minutes, not two hours.
- MATCH-29 reads cover press v counter only, at 1,200 matches a venue on the calibration seeds (intervals about ±0.035, so reads within 0.05 of each other are not resolved apart); the 16-pairing read is 150 matches a condition for one candidate; no validation MATCH-29 read.
- Band checks are 400 matches on the calibration seeds; rows inside count pass/fail, not MATCH-28's statuses; goals swing about ±0.15 between neighbouring reads.
- The diagnostic plays real clubs within 2 rating points, not MATCH-28's equal top-tier sides, observed, 200–600 matches a variant; its through passes are the trace's kind, wider than MATCH-13's through-ball counter, and the offside position is read at the pass's trace entry (the actor's decision), not at the kick.
- Held-out concentration is 2,400 matches over four world seeds; the share's interval is over the seed clusters with 20-goal clubs, normal approximation: an observed result for these seeds, not population-level significance; hat-tricks have no interval. The stress case is fixed-squad, three seeds. MATCH-28's core is one condition on validation at scale 1. No whole-career season, no league top-scorer distribution.
