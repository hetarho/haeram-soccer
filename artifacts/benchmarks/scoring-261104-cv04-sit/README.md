# T689 scoring — 261104 cv04-sit (the keeper's narrowing kept for 1v1s, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z) continues from cv04-hold's Next: MATCH-29 with the narrowing relieved, and hat-tricks against the share. This window: **15:49Z–17:49Z**, measurements 15:50–16:45Z, on `codex/cv04` at adfa7374 (Apple M1 Max, 10 cores, at most 6 measurement workers at once). cv04's, cv04-hold's, nx04's and cf04's evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-hold's `best_ar10f50` (`candidates/` here are written by `analysis/make-candidates.mjs` on cv04-hold's candidate files and applied by `scripts/scoring-candidate-patch.ts`, every name checked). cv04-hold's patch re-applied; this window's new default-off switches, uncommitted in `analysis/cv04-sit-source.patch` with every earlier switch (the engine source is restored):

- `shot.revision9.narrow.set` / `corridor` / `crowd`: the keeper's narrowing keeps its released `reach` (1.5 m) against a shooter through on goal — no outfield opponent within `corridor` m of the line from him to the goal's middle, between them — and uses `set` m only against one with at least `crowd` defenders there (`keeperNarrowing`, `resolve.ts`).
- `shape.candidate.revision9.keeperOut.crowd`: cv04-hold's situational come-out (`set`, `corridor`) counts `crowd` defenders the same way.

Candidate names: `sn` = released narrowing and half-way come-out for a 1v1, reach 1.0 m and a quarter of the way with a defender between; `sn<r>` reach r/10 m between (`sn01` 0.01 m, none); `a<v>` `shot.a` −v/100; `o10` offside `base` 0.1, `o08h25` `base` 0.08 with `highLineFactor` 2.5 (MATCH-18's calls restored); `an16`/`an20` the alone clause within 16/20 m; `snA` the control's arrivals (14 m from 60 m); `snW` the alone clause anywhere; `snK`/`soK` without the keeper's release; `snR` without the between-relief; `snC3` a 3 m corridor; `snc2` relief only with two or more between; `soVol` the control's shot volume (alone clause anywhere, `shotScale` 0.1). `ctl` is cv04's control, copied for this window's MATCH-29 reads.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/s*.json` by `analysis/make-jobs.mjs`): `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, cv04's `analysis/table.mjs`); `scripts/scoring-concentration.ts --matches 2400 --seeds t689-val-1..4` (held-out, cv04-hold's `analysis/conc.mjs`); `scripts/scoring-striker-stress.ts` (cf04-stress-val-1..3, cv04's `analysis/stress.mjs`); `scripts/grid-bands.ts --report --partition calibration --scale 0.25 --only tactics` (`tactics-*.json`), `--scale 2 --conditions tactics:press-counter,tactics:counter-press` (`pc-*.json`, 1,200 matches a venue) and `--partition validation --scale 1 --only core` (`core-*.json`); MATCH-29 rows by `analysis/tactics.mjs` (press v counter pooled over both venues from the two conditions' outcome shares; it reproduces the reports' own row exactly), MATCH-28's core by `analysis/core.mjs`; `analysis/collect.mjs` copies the band logs. Every report (19 files, 162 conditions, 42,000 matches) has no invariant or full-record failure, and every stress record is valid (0 invalid in 1,824 matches).

## 1. Calibration screens (`grid-bands.ts --candidate --matches 400`)

| candidate | shots a team | xG a shot | goal area / box / outside % | poss. ending in a shot % | goals | pen. goals % | FW / MF goals % | rows inside | unopposed a team (scored) |
|---|---:|---:|---|---:|---:|---:|---|---:|---|
| ctl (cv04) | 17.00✗ | 0.08✗ | 14.68✗ / 74.58✗ / 10.73✗ | 20.14✗ | 2.89 | 11.59✗ | 69.38✗ / 20.16✗ | 23/37 | 8.34 (9.1%) |
| best_ar10f50 (cv04-hold) | 12.22 | 0.11 | 19.11✗ / 70.78✗ / 10.11✗ | 14.95 | 2.76 | 7.51 | 66.52 / 26.24 | 24/37 | 5.03 (15.9%) |
| sn | 11.88 | 0.08 | 19.41✗ / 70.60✗ / 9.98✗ | 14.62 | 2.10 | 10.86✗ | 65.16 / 25.18 | 25/37 | 5.03 (10.7%) |
| sna110 | 12.13 | 0.09 | 19.76✗ / 70.36✗ / 9.88✗ | 14.87 | 2.25 | 8.57 | 67.93 / 22.27✗ | 25/37 | 5.16 (11.4%) |
| sna100 | 12.21 | 0.09 | 19.71✗ / 70.56✗ / 9.74✗ | 14.96 | 2.39 | 8.16 | 66.53 / 24.27 | 26/37 | 5.20 (12.0%) |
| sn08a110 | 12.13 | 0.09 | 19.59✗ / 70.37✗ / 10.04✗ | 14.86 | 2.29 | 8.75 | 67.94 / 23.19✗ | 25/37 | 5.15 (11.3%) |
| sna085 | 12.22 | 0.09 | 19.57✗ / 70.79✗ / 9.65✗ | 14.90 | 2.44 | 7.38 | 68.14 / 22.85✗ | 25/37 | 5.14 (11.8%) |
| sn05a100 | 12.23 | 0.10 | 19.53✗ / 70.76✗ / 9.71✗ | 14.93 | 2.53 | 8.40 | 67.29 / 26.09 | 24/37 | 5.18 (11.8%) |
| sn05a085 | 12.23 | 0.10 | 19.39✗ / 70.50✗ / 10.11✗ | 14.93 | 2.59 | 7.25 | 68.60 / 23.77✗ | 24/37 | 5.09 (11.9%) |
| **sn01a100** | 12.11 | 0.10 | 19.23✗ / 70.82✗ / 9.95✗ | 14.81 | 2.62 | 7.72 | 67.49 / 26.31 | 24/37 | 5.09 (11.5%) |
| sn01a090 | 12.26 | 0.11 | 19.03✗ / 70.95✗ / 10.02✗ | 15.01 | 2.76 | 7.43 | 67.27 / 26.29 | 24/37 | 5.07 (12.0%) |
| snA | 11.68 | 0.09 | 18.06✗ / 71.45✗ / 10.49✗ | 14.44 | 2.19 | 9.83✗ | 70.06✗ / 21.60✗ | 23/37 | 4.80 (10.9%) |
| sn01an16 | 12.75 | 0.10 | 17.27✗ / 73.05✗ / 9.69✗ | 15.62 | 2.74 | 8.12 | 68.98✗ / 25.00 | 24/37 | 5.54 (11.2%) |
| sn01an20 | 14.01 | 0.09 | 14.73✗ / 74.72✗ / 10.55✗ | 17.13✗ | 2.66 | 8.46 | 63.82 / 29.70 | 25/37 | 6.32 (9.9%) |
| sn01o10 | 11.90 | 0.10 | 19.41✗ / 70.63✗ / 9.95✗ | 14.46 | 2.58 | 8.34 | 65.66 / 27.74 | 25/37 | 4.94 (10.8%) |
| **sn01o08h25** | 11.85 | 0.10 | 19.47✗ / 70.61✗ / 9.93✗ | 14.49 | 2.51 | 7.88 | 67.00 / 25.92 | 25/37 | 5.06 (11.1%) |
| snC3 | 11.96 | 0.10 | 19.09✗ / 71.18✗ / 9.73✗ | 14.66 | 2.46 | 8.55 | 65.89 / 28.00 | 25/37 | 4.99 (11.0%) |
| snc2 | 11.78 | 0.09 | 18.96✗ / 70.64✗ / 10.40✗ | 14.49 | 2.21 | 8.73 | 69.39✗ / 24.04 | 24/37 | 4.98 (11.7%) |
| snc2a090 | 11.84 | 0.09 | 18.64✗ / 71.31✗ / 10.04✗ | 14.52 | 2.27 | 8.16 | 69.68✗ / 24.15 | 24/37 | 4.94 (12.1%) |
| soK | 12.47 | 0.11 | 21.81✗ / 68.99✗ / 9.20✗ | 14.88 | 2.88 | 7.90 | 67.71 / 27.17 | 25/37 | 5.39 (13.1%) |
| soVol | 16.17✗ | 0.09 | 13.26✗ / 76.40✗ / 10.34✗ | 19.56✗ | 3.17 | 7.42 | 66.59 / 26.54 | 25/37 | 7.63 (10.1%) |

Readings:

- Keeping the released narrowing for a shooter through on goal takes goals 2.76 → 2.10 at the same `shot.a`: the 1v1s carried about a quarter of best_ar10f50's goals, and the unopposed chances' conversion falls 15.9 → 10.7% (the control's 9.1%). `shot.a` −1 with no narrowing where a defender stands between (`sn01a100`) brings goals back to 2.62.
- MATCH-18's offside calls have read about 0.9 a team since cv04 (band 1.35–2.25 with tolerance): `o10` reads 1.95 and `o08h25` 1.70, inside, with 25/37 rows.
- The alone clause within 20 m (`an20`) takes the goal-area share 19 → 14.7% and MF goals to 29.7% but shots to 14.0 a team and possessions ending in a shot to 17.1%.
- With a defender between, a single defender carries the relief: `crowd` 2 costs about 0.3 goals a match.

## 2. Held-out concentration (`scoring-concentration.ts --matches 2400 --seeds t689-val-1..4`)

| read | matches | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | top scorer goals / 38 | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---:|---|---:|---|---:|---|---|
| ctl (cv04) | 2400 | 2.83 | 16.9 | 0.060 | 37.5 [36.4, 38.6] | 25.4 | 12.6 / 7.1 | 20.4 | 3.97, 35.2, 45.4 | 1.91, 13.0 |
| best_ar10f50 (cv04-hold) | 2400 | 2.82 | 12.4 | 0.065 | 30.6 [30.3, 31.0] | 23.1 | 15.9 / 10.4 | 16.5 | 2.74, 33.1, 39.2 | 1.64, 19.5 |
| sit20a100 (cv04-hold) | 2400 | 2.69 | 12.4 | 0.048 | 32.0 [31.6, 32.5] | 23.5 | 15.2 / 10.0 | 16.9 | 2.75, 33.3, 40.5 | 1.61, 17.0 |
| **sn01a100** | 2400 | 2.69 | 12.3 | 0.043 | 29.8 [29.0, 30.6] | 22.5 | 15.1 / 10.3 | 15.6 | 2.73, 33.2, 37.7 | 1.60, 19.4 |
| **sn01o08h25** | 2400 | 2.59 | 12.1 | 0.038 | 29.2 [27.9, 30.5] | 23.8 | 13.5 / 10.1 | 14.4 | 2.68, 33.4, 37.7 | 1.57, 19.1 |

**The first held-out reads in T689 with goals, shots a team, the club top-scorer share and hat-tricks inside MATCH-23 together**: `sn01a100` 2.69 / 12.3 / 29.8% [29.0, 30.6] / 0.043, `sn01o08h25` 2.59 / 12.1 / 29.2% [27.9, 30.5] / 0.038 (goals 2.6–2.9 with tolerance to 2.06; the share's window to 31.25%; hat-tricks 0.02–0.05). The top scorer's conversion edge is 1.47× and 1.34× (control 1.77×), the ST slot's goal share 37.7% (control 45.4%). The interval's seed clusters: the share reads two clusters with 20-goal clubs (`seeds 2` in the files).

## 3. Striker stress case (cf04-stress-val-1..3, 456 matches an arm; every record valid)

| variant | arm | goals / match | own goals / match | own shots | club top-scorer share [95%] | top scorer goals / 38 | largest / 38 | hat-tricks / own match | FW goals | star goals / 38 | star shots / match |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| ctl (nx04) | normal | 3.11 | 1.63 | 17.7 | 42.2% [40.6, 43.8] | 26.1 | 38 | 0.053 | 63% | - | - |
| ctl (nx04) | stress | 3.43 | 1.56 | 16.8 | 56.4% [52.9, 60.0] | 33.5 | 52 | 0.068 | 73% | 33.5 | 5.40 |
| best_ar10f50 (cv04-hold) | stress | 3.36 | 1.48 | 12.3 | 44.2% [42.1, 46.4] | 24.5 | 32 | 0.050 | 63% | 24.5 | 3.80 |
| sn01a100 | normal | 2.99 | 1.48 | 13.1 | 32.3% [27.5, 37.2] | 18.3 | 30 | 0.026 | 57% | - | - |
| sn01a100 | stress | 3.06 | 1.41 | 12.0 | 40.3% [35.7, 44.8] | 21.6 | 27 | 0.039 | 61% | 21.6 | 3.72 |
| sn01o08h25 | normal | 2.90 | 1.46 | 12.8 | 32.7% [30.7, 34.6] | 18.3 | 35 | 0.024 | 58% | - | - |
| sn01o08h25 | stress | 3.08 | 1.34 | 11.7 | 43.9% [40.7, 47.0] | 22.3 | 33 | 0.033 | 64% | 22.3 | 3.65 |

The peak striker 56.4% → 40.3–43.9% of his club's goals and 33.5 → 21.6–22.3 goals a 38-game run (largest 52 → 27–33); normal squads' top scorer 42.2% → 32.3–32.7%.

## 4. MATCH-29: press v counter

The 150-match reads (`tactics-*.json`, calibration, all 16 pairings, scale 0.25) put every situational-narrowing candidate near −0.26 against the control's −0.12, with intervals of ±0.095; the resolving reads (`pc-*.json`, press v counter only, 1,200 matches a venue) settle it.

| read | matches | press win share − counter's [95%] | press points vs the mean | counter points vs the mean | MATCH-29 inside / outside / insufficient | goals a match (pairings run) | hat-tricks a match (pairings run) |
|---|---:|---|---:|---:|---|---:|---:|
| tactics-ctl | 300 | −0.123 [−0.222, −0.025] | −0.079 | +0.152 | 4 / 2 / 19 | 3.17 | 0.072 |
| tactics-sna110 | 300 | −0.263 [−0.358, −0.169] | −0.183 | +0.346 | 3 / 5 / 17 | 2.56 | 0.033 |
| tactics-sn01a100 | 300 | −0.270 [−0.364, −0.176] | −0.173 | +0.383 | 3 / 6 / 16 | 3.02 | 0.055 |
| tactics-snA | 300 | −0.260 [−0.353, −0.167] | −0.096 | +0.276 | 3 / 5 / 17 | 2.42 | 0.027 |
| tactics-snW | 300 | −0.200 [−0.296, −0.104] | −0.150 | +0.261 | 3 / 3 / 19 | 2.85 | 0.041 |
| tactics-snK | 300 | −0.203 [−0.298, −0.109] | −0.161 | +0.320 | 3 / 6 / 16 | 2.93 | 0.057 |
| tactics-snR | 300 | −0.277 [−0.371, −0.183] | −0.131 | +0.274 | 4 / 5 / 16 | 2.32 | 0.025 |
| tactics-sn01an16 | 300 | −0.287 [−0.381, −0.192] | −0.142 | +0.326 | 5 / 5 / 15 | 3.15 | 0.070 |
| tactics-sn01an20 | 300 | −0.250 [−0.346, −0.154] | −0.154 | +0.313 | 4 / 5 / 16 | 3.14 | 0.066 |
| **pc-ctl** | 2400 | −0.148 [−0.183, −0.114] | - | - | - | 3.08 | 0.062 |
| **pc-sn01a100** | 2400 | −0.241 [−0.275, −0.207] | - | - | - | 3.14 | 0.068 |
| pc-sn01o10 | 2400 | −0.231 [−0.265, −0.197] | - | - | - | 3.06 | 0.072 |
| **pc-sn01o08h25** | 2400 | −0.233 [−0.268, −0.199] | - | - | - | 3.08 | 0.066 |
| pc-snC3 | 2400 | −0.246 [−0.280, −0.212] | - | - | - | 3.00 | 0.063 |
| pc-snc2 | 2400 | −0.209 [−0.243, −0.175] | - | - | - | 2.62 | 0.043 |
| pc-soK | 2400 | −0.258 [−0.291, −0.224] | - | - | - | 3.43 | 0.091 |
| **pc-soVol** | 2400 | −0.166 [−0.200, −0.132] | - | - | - | 3.50 | 0.078 |

Per side, pooled over both venues (goals, shots, xG a shot a match):

| read | press | counter |
|---|---|---|
| pc-ctl | 1.33, 13.67, 0.10 | 1.75, 25.15, 0.07 |
| pc-sn01a100 | 1.22, 9.21, 0.14 | 1.92, 22.39, 0.08 |
| pc-sn01o08h25 | 1.20, 8.92, 0.14 | 1.88, 21.71, 0.08 |
| pc-soK | 1.33, 9.33, 0.14 | 2.10, 22.49, 0.09 |
| pc-soVol | 1.52, 13.26, 0.12 | 1.99, 24.99, 0.08 |
| pc-snc2 | 1.05, 8.62, 0.12 | 1.57, 21.87, 0.07 |

Readings:

- **The regression is real and smaller than cv04-hold's**: −0.148 → −0.233 to −0.241 at the resolving size (cv04-hold's best −0.48 at 150 matches). The control itself reads outside MATCH-29's 12-point band at this size.
- **The cause is the shot-volume cut, not the keeper**: with the control's volume (`soVol`: the alone clause anywhere, `shotScale` 0.1) press v counter returns to −0.166 [−0.200, −0.132], level with the control; without the keeper's release (`soK`) it reads −0.258. Counter takes 22–25 shots a match against press even in the control, most of them MATCH-16 clear chances behind press's line that neither the volume scale nor the 12 m alone clause reaches, while both take press's shots against counter's deep block (13.7 → 8.9–9.3 a match). Any volume lever that suppresses shot choices therefore favours counter.
- Arrivals (`snA`), the alone clause at 16 or 20 m, MATCH-18's offside calls restored (`o10`, `o08h25`, offsides 1.70–1.95 inside), a 3 m corridor (`snC3`) and relief only in a crowd (`snc2`, −0.209 at the cost of 0.4 goals) leave it at −0.21 to −0.29.

## 5. MATCH-28's core condition (validation, scale 1, 600 matches)

`analysis/core.mjs` on `core-*-validation-1.json` (the condition's own statuses with intervals; no invariant or full-record failure in either):

| read | goals | MATCH-23 inside / outside / unresolved | MATCH-23 rows outside | MATCH-30 counters outside |
|---|---:|---|---|---|
| ctl | 3.07 | 22 / 11 / 5 | back passes 19.3%, possessions ending in a shot 20.9%, shots 17.6, goal area / box / outside 14.4 / 75.1 / 10.5%, shot distance 11.0 m, throw-ins 8.8, offsides 0.85, FW / MF goals 71.3 / 20.2% | key passes 13.1, box shots 15.7, box entries 32.9, front-of-box entries 56.1, xT added 5.05, through balls 0.79, progressive carries 98.7 |
| sn01o08h25 | 2.72 | 25 / 10 / 3 | back passes 20.0%, goal area / box / outside 17.8 / 71.9 / 10.2%, shot distance 9.2 m, throw-ins 9.3, corners 3.56, set-piece goals 10.6%, headed goals 11.0%, DF goals 5.3% | box shots 11.1, box entries 31.9, front-of-box entries 57.9, xT added 5.18, through balls 0.79, progressive carries 102.8 |

Shots, possessions ending in a shot, offsides, FW and MF goals and key passes move inside; corners, set-piece goals, headed goals and the defenders' goals become new misses (fewer shots blocked behind for corners, fewer corners to head in), so the goal-area share is not the only shot-place miss left.

## Gate

Unmet; no scoring source is committed. The held-out reads of `sn01a100` and `sn01o08h25` are the first in T689 to hold goals, shots a team, the club top-scorer share and hat-tricks inside together, with the largest stress-case movement yet. But press v counter regresses from −0.148 to −0.233/−0.241 at 1,200 matches a venue, a material new regression; MATCH-28's core read on validation gains corners, set-piece, headed and DF goals as new misses; and the goal-area share stays at 18–19% (6–9%). The rules they need are not in any SSOT: the narrowing and come-out by situation (MATCH-35 states half of the way to any carrier and no situational narrowing), the keeper's release (MATCH-12), the alone clause within 12 m (MATCH-16), the arrivals (MATCH-17/33), then a prospective model revision (SAVE-23). The switches stay uncommitted in `analysis/cv04-sit-source.patch` (`git apply --check` clean on adfa7374); the engine source is restored.

## Next

1. MATCH-29 through how often counter's chances arise, not their shot choice: the shot-volume cut must reach the clear chances behind press's high line (22–25 counter shots a press match in the control too). Levers named by the SSOTs: press's back line recovering goal-side on a turnover (MATCH-17's recover intention, MATCH-32's screening), the keeper sweeping behind a high line (MATCH-11's 스위퍼 키퍼 against a through ball). Read on `pc-*` at 1,200 matches a venue beside `pc-ctl`.
2. With MATCH-29 restored, re-read `sn01o08h25` (or its successor) on held-out seeds, the stress case, MATCH-28's core and tactics on both partitions; then the goal-area share (18–19%) and the set-piece rows (corners 3.6, set-piece goals 10.6%, headed 11.0%, DF goals 5.3%).
3. Before any commit: update-ssot of MATCH-35 (narrowing and come-out by situation), MATCH-12 (keeper's release), MATCH-16 (alone clause), MATCH-17/33 (arrivals), MATCH-18's call values if `o08h25` is kept, then a prospective model revision (SAVE-23) measured at a resolving size.

## Limits

- Timing: the window ran 15:49–17:49Z; measurements 15:50–16:45Z, then the evidence. Measurement wall-clock about 55 minutes, not two hours.
- Band checks are 400 matches on the calibration seeds; rows inside count pass/fail, not MATCH-28's statuses.
- Held-out concentration is 2,400 matches over four world seeds; the share's interval is over the seed clusters with 20-goal clubs (two in these files), normal approximation: an observed result for these seeds, not population-level significance; hat-tricks are counts with no interval.
- The stress case is fixed-squad (fitness reset, no season), three seeds.
- MATCH-29: the 16-pairing reads are 150 matches a condition (calibration); the resolving reads cover press v counter only (1,200 matches a venue, calibration seeds); no validation MATCH-29 read, no other pairing at a resolving size; MATCH-28's core read is one condition on validation at scale 1; no whole-career season, no league top-scorer distribution (MATCH-23's 22–32 goals a season).
- No regain diagnostic this window (cv04-hold's keeper-release rows are unchanged by these switches' base).
