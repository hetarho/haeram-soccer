# T689 scoring — 261104 cv04-hold (the owner's resumed automatic run, a 2 h window)

The owner resumed automatic work at 2026-11-04T14:25Z with a main-merge deadline of 2026-11-05T00:00Z and asked for structural keeper-release timing and chance allocation rather than more setting screens. This window: **14:31Z–16:31Z**, measurements 14:35–15:43Z, on `codex/cv04` at 153819a0 (Apple M1 Max, 10 cores, at most 6 measurement workers at once). cv04's, cf04's and nx04's evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04's `ctl` (nx04's arrHoldEZ60), with cv04's experiment switches re-applied from its retained patch; the regain diagnostic's `ctl` re-run here reproduces cv04's rows exactly (348 shots after an opponent's action, 219 after the keeper's ball, 42 goals). Every candidate is `ctl` plus what its JSON adds (`candidates/`, written by `analysis/make-candidates.mjs`, applied by `scripts/scoring-candidate-patch.ts`, every name checked). New default-off experiment switches, uncommitted in `analysis/cv04-hold-source.patch` (cv04's and nx04's switches included; the engine source is restored):

- `decide.keeper.hold` (seconds) with `GridState.hands`: a keeper with the ball in his hands — a save he held, a delivery he claimed — holds it that long while everyone moves on their intentions, then chooses his ball by where they stand and plays it at once (`engine.ts`, an in-place carry of that length).
- `shape.candidate.handsOff` (m): while he holds it in his hands his presser stands off that far goal-side of him (nobody may challenge him).
- `decide.keeper.quick`: a keeper with the ball at his feet plays it as he chooses it (a zero-length carry), instead of standing on it for the action's wind-up while the man closing him arrives.
- `shape.candidate.revision9.keeperOut.set` / `corridor`: the keeper comes half of the way out (the released `share`) only to a carrier through on goal — no outfield teammate of his within `corridor` m of the line from the ball to the goal's middle — and `set` of the way to one with a defender between him and the goal.

Released values varied as settings: `duel.candidate.boxFoul` (0.046), `shot.revision9.narrow.reach` (1.5 m), `shape.candidate.revision9.keeperOut.share` (0.5), `shot.a` (the position model's logit offset, −1), `decide.candidate.revision4.shotScale` (ctl 0.1) and `shotLine.MF` (0.8), with cv04's `revision9.clear.within` and nx04's `arrive`. Candidate names: `h<s>o<m>` hold s seconds with handsOff m; `kq` quick; `pf` boxFoul 0.03; `nr<r>` reach r/10 m; `ko<p>` come-out share p/100; `s<v>` shotScale v/100; `an12` the clear chance's alone clause within 12 m; `a<v>` `shot.a` −v/100; `m1` shotLine.MF 1; `best` = `nr10ko25an12s07a130` on `h6o20kqpf`; `ar<m>` / `f<x>` / `n5` arrive out m / from x / narrow 0.5; `sit20` keeperOut set 0.2 (share 0.5); `nokq_ar10f50` best_ar10f50 without hold, handsOff and quick.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs` with this window's job lists `analysis/jobs/w*.json`, written by `analysis/make-jobs.mjs`): `scripts/scoring-regain-shots.ts --start 600 --matches 120` (its new `gkGot` rows: how the keeper had the ball), `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`; the table below by cv04's `analysis/table.mjs`), `scripts/scoring-concentration.ts --matches 2400 --seeds t689-val-1..4` (held-out; `analysis/conc.mjs`), `scripts/scoring-striker-stress.ts` (cf04-stress-val-1..3; cv04's `analysis/stress.mjs`), `scripts/grid-bands.ts --report --partition calibration --scale 0.25 --only core,tactics` (`report-*.json`) or `--only tactics` (`tactics-*.json`).

## 1. The keeper's release (`scoring-regain-shots.ts`, 120 observed matches, 600–719)

| variant | all shots | after an opponent's action | after the keeper's ball | won within 5 m of him | struck within 3 s | keeper had it from a teammate's pass | keeper had it in his hands | struck by the ST slot |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ctl | 3966 | 348 (68) | 219 (42) | 136 (33) | 208 (41) | 108 (22) | 78 (10) | 188 (35) |
| h4 | 3934 | 263 (56) | 134 (28) | 73 (24) | 132 (27) | 85 (19) | 19 (5) | 149 (36) |
| h4o16 | 3902 | 268 (43) | 138 (22) | 78 (18) | 134 (22) | 94 (18) | 18 (0) | 153 (28) |
| h6o20 | 3931 | 276 (49) | 142 (30) | 81 (24) | 138 (29) | 90 (19) | 18 (4) | 136 (29) |
| kq | 3783 | 176 (22) | 57 (7) | 29 (7) | 52 (7) | 28 (4) | 17 (3) | 76 (11) |
| h6o20kq | 3820 | 163 (27) | 45 (8) | 22 (7) | 43 (7) | 26 (5) | 8 (0) | 75 (10) |

Shots (goals). "In his hands" counts the losses whose previous entry was the other side's shot (a save he held) or a cross, corner or free kick he claimed. Readings:

- Holding the ball in his hands while the opponents leave him removes those losses (78 → 18–19) but not the ones at his feet after a teammate's pass (108 → 85–94), about half of cv04's 219.
- Playing the ball at his feet as he chooses it (`quick`) removes those: keeper-loss shots 219 → 45–57 and their goals 42 → 7–8 a 120-match run, the striker slot's shots after an opponent's action 188 → 75. It is the structural form of cv04's resolution-side `kl6kc8` (which halved the goals), and needs no rule that a defender cannot reach a ball he could.
- On the band check (400 matches) the keeper fix alone takes goals 2.89 → 2.35–2.40 and shots 17.0 → 15.9–16.0 a team; on held-out seeds it leaves the club top-scorer share inside its noise (37.5% [36.4, 38.6] → 37.0% [34.9, 39.1]; with `boxFoul` 0.03, which takes penalty goals 11.5 → 7.3%, 36.3% [34.4, 38.0]), hat-tricks 0.060 → 0.037–0.039. Fewer goals for everyone again does not spread them.

## 2. Calibration screens (`grid-bands.ts --candidate --matches 400`)

| candidate | band matches | shots a team | xG a shot | goal area / box / outside % | poss. ending in a shot % | goals | pen. goals % | FW / MF goals % | rows inside | unopposed a team (scored) |
|---|---:|---:|---:|---|---:|---:|---:|---|---:|---|
| ctl (cv04) | 400 | 17.00✗ | 0.08✗ | 14.68✗ / 74.58✗ / 10.73✗ | 20.14✗ | 2.89 | 11.59✗ | 69.38✗ / 20.16✗ | 23/37 | 8.34 (9.1%) |
| h4o16 | 400 | 16.71✗ | 0.07✗ | 13.54✗ / 75.81✗ / 10.65✗ | 19.95✗ | 2.82 | 11.61✗ | 70.39✗ / 18.62✗ | 23/37 | 8.19 (8.9%) |
| h6o20 | 400 | 16.57✗ | 0.07✗ | 13.66✗ / 75.36✗ / 10.98✗ | 19.85✗ | 2.76 | 11.42✗ | 69.99✗ / 18.50✗ | 23/37 | 8.16 (9.0%) |
| kq | 400 | 15.88✗ | 0.07✗ | 13.32✗ / 76.42✗ / 10.27✗ | 19.21✗ | 2.40 | 14.03✗ | 71.10✗ / 17.78✗ | 22/37 | 7.50 (7.5%) |
| h6o20kq | 400 | 15.99✗ | 0.07✗ | 12.76✗ / 76.33✗ / 10.91✗ | 19.40✗ | 2.35 | 11.48✗ | 69.39✗ / 19.87✗ | 21/37 | 7.61 (7.5%) |
| h6o20kqpf | 400 | 15.98✗ | 0.07✗ | 12.86✗ / 76.19✗ / 10.95✗ | 19.37✗ | 2.27 | 7.28 | 70.42✗ / 18.76✗ | 22/37 | 7.64 (7.7%) |
| h6o20kqpfan12 | 400 | 12.14 | 0.08 | 17.14✗ / 70.66✗ / 12.20✗ | 14.96 | 2.12 | 10.38✗ | 68.51 / 19.46✗ | 25/37 | 4.75 (11.0%) |
| h6o20kqpfan12s14 | 400 | 13.08 | 0.08✗ | 16.20✗ / 71.38✗ / 12.42✗ | 16.01✗ | 2.10 | 8.94 | 70.08✗ / 18.47✗ | 24/37 | 4.89 (10.9%) |
| h6o20kqpfan12m1 | 400 | 12.23 | 0.08 | 16.83✗ / 71.52✗ / 11.65✗ | 15.04 | 2.15 | 11.86✗ | 70.00✗ / 18.37✗ | 24/37 | 4.78 (11.2%) |
| h6o20kqpfan12s14m1 | 400 | 13.32 | 0.07✗ | 15.56✗ / 71.87✗ / 12.57✗ | 16.19✗ | 2.19 | 8.79 | 69.75✗ / 18.72✗ | 23/37 | 4.81 (11.1%) |
| nr10 | 400 | 16.04✗ | 0.08 | 12.69✗ / 75.96✗ / 11.35✗ | 19.50✗ | 2.75 | 6.17 | 71.14✗ / 19.69✗ | 24/37 | 7.69 (10.4%) |
| nr05 | 400 | 16.24✗ | 0.10 | 12.74✗ / 75.84✗ / 11.42✗ | 19.58✗ | 3.52✗ | 5.68 | 69.82✗ / 23.08✗ | 21/37 | 7.83 (13.5%) |
| ko25 | 400 | 16.46✗ | 0.09 | 12.66✗ / 76.44✗ / 10.90✗ | 19.82✗ | 3.49✗ | 5.30✗ | 68.32 / 23.15✗ | 23/37 | 7.69 (12.6%) |
| nr10ko25 | 400 | 16.42✗ | 0.10 | 12.71✗ / 76.60✗ / 10.69✗ | 19.73✗ | 3.72✗ | 4.77✗ | 67.52 / 25.08 | 21/37 | 7.66 (14.0%) |
| nr05s07 | 400 | 15.36 | 0.10 | 12.28✗ / 77.77✗ / 9.95✗ | 18.58✗ | 3.18 | 6.37 | 68.92✗ / 24.23 | 24/37 | 7.66 (12.4%) |
| nr10ko25s07 | 400 | 15.51 | 0.11 | 12.78✗ / 76.92✗ / 10.30✗ | 18.80✗ | 3.60✗ | 4.51✗ | 67.13 / 26.21 | 23/37 | 7.54 (13.9%) |
| nr10ko25s06 | 400 | 15.40 | 0.11 | 12.40✗ / 77.93✗ / 9.67✗ | 18.74✗ | 3.58✗ | 5.24✗ | 66.92 / 25.94 | 23/37 | 7.65 (13.8%) |
| nr10ko25s05 | 400 | 15.12 | 0.11 | 12.55✗ / 78.18✗ / 9.27✗ | 18.54✗ | 3.51✗ | 5.70 | 68.45 / 24.64 | 24/37 | 7.59 (13.6%) |
| ko25s06 | 400 | 15.34 | 0.10 | 12.48✗ / 77.54✗ / 9.98✗ | 18.70✗ | 3.13 | 6.80 | 67.84 / 23.76✗ | 26/37 | 7.68 (11.7%) |
| nr05s06 | 400 | 15.30 | 0.10 | 12.14✗ / 78.05✗ / 9.81✗ | 18.52✗ | 3.31 | 7.11 | 69.21✗ / 24.36 | 24/37 | 7.63 (13.3%) |
| nr10s08 | 400 | 15.59 | 0.08 | 12.33✗ / 77.02✗ / 10.65✗ | 18.93✗ | 2.63 | 7.52 | 72.76✗ / 19.71✗ | 24/37 | 7.61 (10.2%) |
| ko25s04 | 400 | 14.96 | 0.10 | 12.03✗ / 78.81✗ / 9.16✗ | 18.33✗ | 3.17 | 6.71 | 67.40 / 23.60✗ | 26/37 | 7.70 (12.1%) |
| ko30s06 | 400 | 15.32 | 0.09 | 13.08✗ / 76.72✗ / 10.21✗ | 18.61✗ | 2.96 | 6.94 | 68.02 / 23.27✗ | 25/37 | 7.61 (11.2%) |
| ko35s06 | 400 | 15.22 | 0.08 | 12.64✗ / 78.04✗ / 9.31✗ | 18.54✗ | 2.71 | 8.78 | 70.70✗ / 19.69✗ | 25/37 | 7.60 (10.1%) |
| nr10ko25an12 | 400 | 12.86 | 0.12 | 17.44✗ / 70.65✗ / 11.91✗ | 15.77✗ | 3.26 | 6.29 | 69.48✗ / 23.85✗ | 23/37 | 4.94 (17.2%) |
| nr10ko25an12s07 | 400 | 12.01 | 0.12 | 17.19✗ / 72.18✗ / 10.63✗ | 14.73 | 3.10 | 7.02 | 69.65✗ / 24.21 | 23/37 | 4.95 (17.8%) |
| nr10an12 | 400 | 12.29 | 0.09 | 16.67✗ / 71.54✗ / 11.79✗ | 15.09 | 2.50 | 9.32 | 70.84✗ / 20.44✗ | 24/37 | 4.81 (13.7%) |
| nr05an12 | 400 | 12.43 | 0.11 | 16.97✗ / 71.38✗ / 11.65✗ | 15.29 | 3.12 | 7.38 | 72.41✗ / 21.81✗ | 22/37 | 4.83 (17.6%) |
| ko25an12s07 | 400 | 11.92 | 0.11 | 17.41✗ / 71.87✗ / 10.72✗ | 14.63 | 2.91 | 7.13 | 69.93✗ / 22.08✗ | 23/37 | 4.98 (16.7%) |
| nr10ko25a135 | 400 | 16.18✗ | 0.09 | 12.83✗ / 76.44✗ / 10.73✗ | 19.54✗ | 3.02 | 6.05 | 69.84✗ / 23.78✗ | 21/37 | 7.63 (11.6%) |
| nr10ko25a150 | 400 | 15.84✗ | 0.08 | 13.48✗ / 75.53✗ / 10.98✗ | 19.17✗ | 2.77 | 6.06 | 68.99✗ / 24.05 | 23/37 | 7.51 (10.8%) |
| ko25s06a120 | 400 | 15.31 | 0.09 | 12.70✗ / 77.16✗ / 10.14✗ | 18.71✗ | 2.90 | 7.69 | 67.70 / 22.88✗ | 26/37 | 7.64 (11.0%) |
| ko25s06a135 | 400 | 15.42 | 0.08 | 12.84✗ / 77.37✗ / 9.79✗ | 18.82✗ | 2.72 | 8.17 | 69.88✗ / 21.30✗ | 25/37 | 7.74 (10.3%) |
| nr10ko25an12s07a115 | 400 | 11.98 | 0.11 | 17.09✗ / 72.42✗ / 10.49✗ | 14.71 | 2.94 | 7.39 | 70.71✗ / 23.60✗ | 22/37 | 5.00 (16.9%) |
| nr10ko25an12s07a130 (best) | 400 | 11.90 | 0.11 | 17.25✗ / 71.97✗ / 10.77✗ | 14.60 | 2.81 | 7.22 | 69.25✗ / 24.24 | 23/37 | 4.92 (16.4%) |
| nr0an12s07a150 | 400 | 11.50 | 0.10 | 16.89✗ / 71.95✗ / 11.15✗ | 14.25 | 2.62 | 7.83 | 70.58✗ / 24.64 | 23/37 | 4.80 (16.1%) |
| nr0an12s07a170 | 400 | 11.52 | 0.10 | 17.02✗ / 72.06✗ / 10.92✗ | 14.26 | 2.45 | 8.87 | 71.15✗ / 24.16 | 23/37 | 4.87 (14.8%) |
| nr0s06a170 | 400 | 14.98 | 0.08 | 12.25✗ / 77.60✗ / 10.16✗ | 18.21✗ | 2.70 | 8.70 | 70.00✗ / 23.70✗ | 23/37 | 7.62 (10.6%) |
| best_h18 | 400 | 11.71 | 0.11 | 17.28✗ / 72.21✗ / 10.50✗ | 14.44 | 2.68 | 6.82 | 70.87✗ / 23.90✗ | 22/37 | 4.82 (15.4%) |
| best_ar10 | 400 | 11.93 | 0.11 | 19.46✗ / 70.54✗ / 10.00✗ | 14.61 | 2.89 | 7.79 | 67.10 / 26.15 | 23/37 | 4.91 (16.1%) |
| best_ar08 | 400 | 12.36 | 0.11 | 19.50✗ / 69.89✗ / 10.61✗ | 15.11 | 2.97 | 7.75 | 67.90 / 25.86 | 24/37 | 5.07 (16.1%) |
| best_ar10f50 | 400 | 12.22 | 0.11 | 19.11✗ / 70.78✗ / 10.11✗ | 14.95 | 2.76 | 7.51 | 66.52 / 26.24 | 24/37 | 5.03 (15.9%) |
| best_ar10n5 | 400 | 12.11 | 0.10 | 18.45✗ / 70.93✗ / 10.62✗ | 14.92 | 2.75 | 5.91 | 68.82✗ / 24.82 | 22/37 | 4.89 (16.1%) |
| sit20 | 400 | 11.94 | 0.09 | 18.85✗ / 70.83✗ / 10.31✗ | 14.70 | 2.31 | 7.58 | 67.71 / 25.14 | 24/37 | 4.97 (12.9%) |
| sit20nr15 | 400 | 11.99 | 0.08 | 19.06✗ / 70.53✗ / 10.41✗ | 14.80 | 2.12 | 9.42✗ | 68.32 / 22.85✗ | 23/37 | 4.93 (11.1%) |
| sit20a115 | 400 | 12.05 | 0.09 | 18.90✗ / 70.72✗ / 10.37✗ | 14.79 | 2.42 | 7.55 | 67.32 / 24.82 | 24/37 | 4.99 (13.6%) |
| sit20nr15a115 | 400 | 12.07 | 0.08 | 18.77✗ / 70.72✗ / 10.51✗ | 14.86 | 2.17 | 9.45✗ | 65.44 / 23.96✗ | 24/37 | 4.92 (11.0%) |
| sit20a100 | 400 | 12.20 | 0.10 | 19.22✗ / 70.61✗ / 10.17✗ | 14.98 | 2.73 | 7.14 | 67.70 / 24.34 | 25/37 | 4.99 (15.3%) |
| sit20a090 | 400 | 12.23 | 0.11 | 19.39✗ / 70.44✗ / 10.17✗ | 15.04 | 2.79 | 7.26 | 67.38 / 24.28 | 26/37 | 4.98 (15.2%) |

From `h6o20kqpf` on, every candidate carries the keeper fix and `boxFoul` 0.03; from `nr10` on, its base is `h6o20kqpf`. Readings:

- **The keeper's narrowing is the concentration lever.** Revision 9 scales a shot's xG by the share of the goal mouth the keeper leaves open against a keeper on his goal line's middle (`keeperNarrowing`), and he comes half of the way out to any carrier in his box: a carried shot from about 14 m keeps about 30% of its place xG, while a first-time finish from a delivery, with the keeper set nearer his line, keeps nearly all of it — so goals gather on the goal-area finishers (cf04: goal-area shots 60–66% of open-play goals, the rest of the box converting 2.6–3.2%). Relieving it (`reach` 1.0 m, a quarter of the way out) raises the midfield's goal share 18.8 → 25.1% at the same shot volume, FW goals inside for the first time on these checks, and the unopposed chances' conversion 7.7 → 14.0%.
- The midfield line's shot weight (`shotLine.MF` 1) changes nothing: the line weights do not bind.
- The volume scale moves shots little (`s05`–`s07`: 15.1–15.5 a team): about half of all shots are MATCH-16 clear chances it does not reach; the 12 m alone clause takes shots to 11.5–12.9.
- A lower `shot.a` brings goals down but cuts low-xG shots harder than goal-area ones, so it re-concentrates (MF goals 23.8 → 21.3% on `ko25s06a135`).
- Arrivals 10 m from goal (`ar10`, nx04's `arrive`) put FW and MF goal shares inside together (66.5–67.9 / 25.9–26.2%) but raise the goal-area share to 19%.
- The situational come-out (`sit20`) narrows 1v1s again, so the released `shot.a` −1 lands goals at 2.73 (`sit20a100`).

## 3. Held-out concentration (`scoring-concentration.ts --matches 2400 --seeds t689-val-1..4`)

| read | matches | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | top scorer goals / 38 | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---:|---|---:|---|---:|---|---|
| ctl (cv04) | 2400 | 2.83 | 16.9 | 0.060 | 37.5 [36.4, 38.6] | 25.4 | 12.6 / 7.1 | 20.4 | 3.97, 35.2, 45.4 | 1.91, 13.0 |
| kl6kc8 (cv04) | 2400 | 2.64 | 16.7 | 0.048 | 35.0 [34.5, 35.5] | 24.5 | 11.6 / 7.0 | 18.0 | 3.81, 34.3, 43.4 | 1.90, 13.5 |
| h6o20kq | 2400 | 2.52 | 16.1 | 0.039 | 37.0 [34.9, 39.1] | 24.4 | 12.0 / 6.6 | 18.0 | 3.63, 33.9, 43.9 | 1.86, 12.9 |
| h6o20kqpf | 2400 | 2.43 | 16.1 | 0.037 | 36.3 [34.4, 38.0] | 24.3 | 11.7 / 6.5 | 17.5 | 3.61, 33.7, 43.3 | 1.86, 12.8 |
| nr10ko25 | 2400 | 3.68 | 16.5 | 0.109 | 31.4 [30.9, 31.8] | 24.1 | 14.7 / 10.2 | 21.9 | 3.73, 33.9, 40.5 | 1.90, 17.3 |
| nr10ko25a135 | 2400 | 3.09 | 16.4 | 0.065 | 32.4 [31.8, 33.1] | 24.9 | 12.6 / 8.6 | 19.5 | 3.74, 34.1, 41.0 | 1.90, 16.6 |
| ko25s06 | 2400 | 3.33 | 15.6 | 0.091 | 33.2 [31.7, 34.8] | 24.2 | 14.8 / 9.4 | 21.2 | 3.52, 33.9, 41.3 | 1.82, 15.5 |
| ko25s06a135 | 2400 | 2.77 | 15.4 | 0.055 | 34.1 [32.0, 36.2] | 24.2 | 12.9 / 7.9 | 18.4 | 3.49, 33.9, 41.6 | 1.83, 15.5 |
| ko30s06 | 2400 | 3.02 | 15.4 | 0.079 | 34.5 [33.3, 35.8] | 24.6 | 13.8 / 8.5 | 19.9 | 3.47, 33.7, 42.5 | 1.80, 14.6 |
| ko25an12s07 | 2400 | 2.90 | 12.1 | 0.065 | 33.4 [33.1, 33.7] | 25.8 | 15.7 / 10.9 | 18.6 | 2.88, 35.6, 42.6 | 1.39, 14.4 |
| nr10ko25an12s07 | 2400 | 3.13 | 12.1 | 0.075 | 32.5 [31.8, 33.1] | 25.5 | 16.4 / 11.7 | 19.3 | 2.86, 35.4, 41.7 | 1.38, 16.0 |
| best (nr10ko25an12s07a130) | 2400 | 2.74 | 12.0 | 0.050 | 32.0 [30.1, 33.9] | 26.1 | 14.1 / 10.6 | 17.0 | 2.86, 35.8, 41.7 | 1.35, 15.6 |
| best_ar10 | 2400 | 2.80 | 12.2 | 0.069 | 30.0 [27.8, 32.2] | 25.1 | 14.0 / 10.8 | 16.2 | 2.82, 34.6, 40.2 | 1.41, 16.1 |
| best_ar10f50 | 2400 | 2.82 | 12.4 | 0.065 | 30.6 [30.3, 31.0] | 23.1 | 15.9 / 10.4 | 16.5 | 2.74, 33.1, 39.2 | 1.64, 19.5 |
| best_ar12f50 | 2400 | 2.83 | 12.3 | 0.056 | 30.8 [30.6, 31.0] | 23.5 | 15.0 / 10.4 | 16.5 | 2.73, 33.2, 39.9 | 1.61, 19.0 |
| sit20a100 | 2400 | 2.69 | 12.4 | 0.048 | 32.0 [31.6, 32.5] | 23.5 | 15.2 / 10.0 | 16.9 | 2.75, 33.3, 40.5 | 1.61, 17.0 |
| sit20a090 | 2400 | 2.81 | 12.5 | 0.047 | 32.8 [30.9, 34.6] | 23.4 | 16.0 / 10.0 | 17.7 | 2.75, 33.1, 40.1 | 1.63, 17.4 |

The 1,200-match calibration reads of the first screens (`conc-*-calibration.json`, 2–3 seed clusters) could not separate candidates — the control's 32.8% [25.1, 40.5] against h4o16's 39.0% [36.5, 41.5] — so every comparison above is held-out; they are kept as files only.

Readings: the narrowing relief is the first change in T689 to take the share near MATCH-23's window, through the top scorer's conversion edge (12.6 / 7.1 → 14.7 / 10.2, 1.77× → 1.44×) while his shot share stays 24–26%; the arrivals then take his shot share to 23% and the share to **30.6% [30.3, 31.0] (`best_ar10f50`) and 30.8% [30.6, 31.0] (`best_ar12f50`), the first held-out reads whose interval lies inside the 31.25% window**, with goals 2.82–2.83 and shots 12.3–12.4 a team inside — but hat-tricks 0.056–0.065 against 0.02–0.05. The situational come-out brings hat-tricks inside (`sit20a100` 0.048) and sends the share back to 32.0% [31.6, 32.5]. No read holds goals, shots, the share and hat-tricks inside together.

## 4. Striker stress case (cf04-stress-val-1..3, 456 matches an arm; every record valid)

| variant | arm | goals / match | own goals / match | own shots | club top-scorer share [95%] | top scorer goals / 38 | largest / 38 | hat-tricks / own match | FW goals | star goals / 38 | star shots / match |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| arrHoldEZ60 = ctl (nx04) | normal | 3.11 | 1.63 | 17.7 | 42.2% [40.6, 43.8] | 26.1 | 38 | 0.053 | 63% | - | - |
| arrHoldEZ60 = ctl (nx04) | stress | 3.43 | 1.56 | 16.8 | 56.4% [52.9, 60.0] | 33.5 | 52 | 0.068 | 73% | 33.5 | 5.40 |
| best | normal | 2.91 | 1.52 | 12.6 | 32.6% [26.2, 39.0] | 19.0 | 29 | 0.042 | 54% | - | - |
| best | stress | 3.41 | 1.56 | 12.0 | 43.4% [42.5, 44.3] | 26.0 | 41 | 0.048 | 67% | 25.9 | 3.98 |
| best_ar10 | normal | 3.23 | 1.61 | 13.0 | 32.5% [30.6, 34.3] | 20.3 | 30 | 0.042 | 58% | - | - |
| best_ar10 | stress | 3.40 | 1.50 | 12.2 | 47.4% [44.6, 50.3] | 27.0 | 37 | 0.048 | 69% | 27.0 | 4.05 |
| best_ar10f50 | normal | 3.15 | 1.63 | 13.0 | 32.3% [31.2, 33.3] | 20.0 | 32 | 0.044 | 57% | - | - |
| best_ar10f50 | stress | 3.36 | 1.48 | 12.3 | 44.2% [42.1, 46.4] | 24.5 | 32 | 0.050 | 63% | 24.5 | 3.80 |
| sit20a100 | normal | 2.90 | 1.49 | 12.6 | 34.3% [27.6, 41.0] | 19.4 | 33 | 0.024 | 59% | - | - |
| sit20a100 | stress | 3.14 | 1.41 | 11.9 | 44.6% [43.8, 45.4] | 23.8 | 34 | 0.033 | 64% | 23.8 | 3.67 |

The largest stress-case movement in T689: the peak striker 56.4% → 43.4–47.4% of his club's goals, his 38-game run 33.5 → 23.8–27.0 goals (largest 52 → 32–41), normal squads' top scorer 42.2% → 32.3–34.3%.

## 5. MATCH-28's core report and MATCH-29 (calibration, scale 0.25, 150 matches a condition)

`best_ar10` core (`report-best_ar10-calibration.json`): 20/38 rows inside (ctl's calibration 17, kl6kc8's 19); outside: back passes 19.5%, goal-area / box / outside shots 18.6 / 71.0 / 10.4%, shot distance 9.1 m, throw-ins 9.3, offsides 1.0; MATCH-30: box shots 11.6, box entries 31.3, front-of-box entries 58.7, xT added 5.18, through balls 0.92, progressive carries 102 outside. No invariant or full-record failure in any of the five reports (17 + 4 × 16 conditions, 12,150 matches).

MATCH-29 (`tactics-*.json`; ctl and kl6kc8 rows from cv04's reports):

| read | press win share − counter's, press v counter | press points vs the mean | counter points vs the mean | press–press / counter–press goals | MATCH-29 inside / outside / insufficient |
|---|---|---|---|---|---|
| ctl (cv04, validation) | −0.123 [−0.222, −0.025] | +0.012 | +0.191 | - | 4 / 4 / 17 |
| kl6kc8 (cv04, calibration) | −0.170 [−0.265, −0.075] | −0.092 | +0.181 | - | 4 / 2 / 19 |
| best_ar10 | −0.457 [−0.545, −0.368] | −0.369 | +0.416 | 5.11 / 3.95 | 4 / 9 / 12 |
| best_ar10f50 | −0.480 [−0.570, −0.390] | −0.435 | +0.540 | 5.09 / 4.18 | 4 / 9 / 12 |
| nokq_ar10f50 (no keeper fix) | −0.463 [−0.552, −0.374] | −0.387 | +0.474 | 5.76 / 4.30 | 4 / 9 / 12 |
| sit20 | −0.293 [−0.389, −0.198] | −0.206 | +0.359 | 4.39 / 3.16 | 4 / 5 / 16 |
| sit20a100 | −0.363 [−0.456, −0.270] | −0.243 | +0.461 | 4.80 / 3.65 | 4 / 8 / 13 |

**A material new regression**: with the narrowing relieved, press's high line concedes far more (press–press 4.4–5.8 goals a match) and counter beats press in 72–81% of their matches. It is not the keeper fix (`nokq_ar10f50` reads the same); it is the relief of 1v1s behind press's line that MATCH-35's half-way rule exists for. The situational come-out halves it but does not restore the control.

## Gate

Unmet; no scoring source is committed. The best held-out reads hold goals (2.7–2.8), shots (12.0–12.4 a team) and either the club top-scorer share (`best_ar10f50` 30.6% [30.3, 31.0]) or hat-tricks (`sit20a100` 0.048), never both, and every narrowing candidate brings a material MATCH-29 regression (press v counter −0.29 to −0.48 against the control's −0.12) and a higher goal-area share (17–19% against 14.7%). Shipping any of them would also need a model revision and SSOT changes: the keeper's release (MATCH-12 has him standing on the ball as he distributes it), the come-out by situation (MATCH-35's "about half of the way"), the alone clause within 12 m (MATCH-16) and the arrivals (MATCH-17/33). The experiment switches stay uncommitted in `analysis/cv04-hold-source.patch` (`git apply --check` clean on 153819a0); the engine source is restored.

## Next

1. MATCH-29 with the narrowing relieved: press's high line must stop conceding the extra chances — the come-out by situation (`set`, `corridor`) at other values, the keeper's narrowing kept for 1v1s only (relief only where a defender stands between), or press's line and offside trap; read with `--only tactics` beside the control.
2. Hat-tricks against the share: the arrivals spread the goals but raise the goal-area share to 19% and hat-tricks to 0.056–0.069; the situational come-out brings hat-tricks inside and the share back to 32%. Their combination (`sit` with `ar12f50` and a `set` between 0.2 and 0.5) is the next read, on held-out seeds and the stress case.
3. Before any commit: gusta-update-ssot of MATCH-12 (keeper's release), MATCH-35 (come-out by situation), MATCH-16 (alone clause within 12 m, if kept) and MATCH-17/33 (arrivals), then a prospective model revision (SAVE-23) with the chosen values, re-measured on both partitions, the stress case and MATCH-28/29 at a resolving size.

## Limits

- Timing: the window ran 14:31–16:31Z; measurements 14:35–15:43Z, the rest writing this evidence. Measurement wall-clock about 70 minutes, not two hours.
- Band checks are 400 matches on the calibration seeds (goals ±0.15 and FW goals ±2 points between near-identical candidates); rows inside count pass/fail, not MATCH-28's statuses with intervals.
- Held-out concentration is 2,400 matches over four world-seed clusters (normal-approximation intervals over four values): an interval inside the window is an observed result for these seeds, not population-level significance; hat-tricks are counts with no interval.
- The stress case is fixed-squad (fitness reset, no season), three seeds; MATCH-28/29 reports are calibration-only at scale 0.25 (150 matches a condition), core for `best_ar10` only, tactics for `best_ar10f50`, `nokq_ar10f50`, `sit20`, `sit20a100`; no validation report, no MATCH-29 resolving-size verdict, no whole-career season, no league top-scorer distribution (MATCH-23's 22–32 goals a season).
- The regain diagnostic is 120 observed matches a variant and classifies how the keeper had the ball by the trace entry before his distribution.
- The keeper's hold advances everyone with `advance` before his choice and plays as an in-place carry: observed playback samples no frames during the hold (no MATCH-12 continuity check was made); `quick` keeps the action's time with the ball in flight.
