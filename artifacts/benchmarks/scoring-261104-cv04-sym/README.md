# T689 scoring — 261104 cv04-sym (a symmetric goal lever on cv04-rec's volume, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-rec's Next 1: goals and concentration on `w0a7ah3hb35`'s volume with a goal lever that does not move MATCH-29's press v counter. This window: **17:53Z–19:53Z**, on `codex/cv04` (Apple M1 Max, 10 cores, at most 6 measurement workers at once). Its first unit ran 17:53–17:57Z and was ended by the host with `s1` running; the second unit (17:57Z on, at 9f04cd88) found `s1` finished and read it, then measured `s2`–`s12` from 17:59Z to 18:58Z, then the evidence. Other processes held the host's load average at 25–33 for part of it, which slows runs but not their results. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-rec's `w0a7ah3hb35` (`candidates/w0a7ah3hb35.json`, copied with cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-rec's patch re-applied; this window's new default-off switch, uncommitted in `analysis/cv04-sym-source.patch` with every earlier switch (`git apply --check` clean on 9f04cd88; the engine source is restored):

- `SHOT_CONFIG.candidate.setPieceHeader`: a set piece's delivered header (`resolveCross` with the set-piece phase: corners and delivered free kicks) takes this chance quality in place of `candidate.header` (0.42); open-play deliveries keep theirs.

The default-off identity holds: `s1`'s re-read of `w0a7ah3hb35` on this window's source reproduces cv04-rec's band log line for line (`ms a match` aside).

Candidate names: `sp<v>` setPieceHeader v/100; `ah<m>` the narrowing's and come-out's `ahead` (cv04-rec's 3 m); `rc<v>` the narrowing's `reach` v/10 m (the keeper's cover either side of him, 1.5 m); `hp<v>` every contested header's pressure v/10 (`headerPressure` 1); `a0x0` `shot.a` −0.x; `bx<v>` the box band's shot weight `decide.candidate.shotBox` v/100 (0.56); `s0xx` the revision-4 volume scale `decide.candidate.revision4.shotScale` 0.0xx (0.07); `ls<v>` `longShotScale` (3.5); `m10` the midfield line's revision-4 shot weight 1.0 (0.8; MATCH-16's forward ≥ midfielder holds at equality); `B` = `sp70bx40s10rc20`, and `Bss8` second strikers 8 m deeper once the ball is in front of the box (`secondStriker.drop`), `Bho18` a forward with no run waits 18 m out (`hold.out` 14), `Bar8` / `Baf40` arrivals 8 m from goal / from 40 m up (`arrive` out 10, from 50), `Bbo6` box runs 6 times as often (`boxRun.odds` 4).

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/s*.json` by `analysis/make-jobs.mjs`, each with its `.status.json`): `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, `analysis/bands.mjs`); `scripts/grid-bands.ts --report --partition calibration --scale 2 --conditions tactics:press-counter,tactics:counter-press --jobs 2` (`pc-*.json`, 1,200 matches a venue on the calibration seeds; cv04-rec's `analysis/pcside.mjs`); `scripts/scoring-concentration.ts --matches 2400 --seeds t689-val-1..4` (`conc-*-validation2400.json`, held-out) and `--matches 1200` on its default calibration seeds (`conc-*-calibration1200.json`, screens; cv04-hold's `analysis/conc.mjs`); `scripts/scoring-striker-stress.ts` (cf04-stress-val-1..3, cv04's `analysis/stress.mjs`); `scripts/scoring-season-share.ts --country ENG|ESP --clubs … --seeds t689-season-k --year 2024` (`season/*.json`, `analysis/season.mjs`); `scripts/grid-bands.ts --report --partition validation --scale 1 --only core --jobs 2` (`core-*.json`, cv04-sit's `analysis/core.mjs`); `analysis/collect.mjs` copies the band logs. Every stress record is valid (0 invalid in 1,824 matches), MATCH-28's core report has no invariant or full-record failure, and every season's ledger goals equal its fixtures' goals (0 mismatches in 260 club-seasons).

New diagnostic (committed, measurement only): `scripts/scoring-season-share.ts` reads MATCH-23's season definition on the grid engine. Each run takes over one top-flight club in 2024 (`careerWorld`, a fresh world) and plays its whole league season as a career does — the manager's selection, fatigue, injuries, suspensions, substitutions, the other clubs' strengths — then reads the own club's league top scorer's share of its league goals from the settled season ledger (→HIST-17), checked against its fixtures' scores. Only the own club's fixtures play the grid engine (→MATCH-22), so only its share is read; 20 clubs × a seed in about 2 minutes on 6 workers. Seeds `t689-season-1..4` belong to neither the calibration nor the validation partition.

## 1. Band checks (`grid-bands.ts --candidate --matches 400`, calibration seeds)

| candidate | shots | xG/shot | on target % | poss. → shot % | goal area % | goals | set-piece % | pen. % | headed % | FW % | MF % | DF % | corners | rows inside | unopposed (scored) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| w0a7ah3hb35 | 12.68 | 0.08 | 25.12✗ | 15.75✗ | 16.77✗ | 2.12 | 16.02✗ | 9.31 | 14.72 | 65.49 | 25.91 | 8.60 | 4.40 | 27/37 | 5.49 (9.3%) |
| sp55 | 12.65 | 0.08 | 25.05✗ | 15.70✗ | 16.91✗ | 2.17 | 20.14 | 8.29 | 18.87 | 64.33 | 24.86 | 10.82 | 4.36 | 28/37 | 5.48 (9.0%) |
| sp70 | 12.60 | 0.09 | 25.60 | 15.66✗ | 16.99✗ | 2.29 | 21.64 | 8.09 | 20.66 | 64.92 | 23.61✗ | 11.48 | 4.35 | 28/37 | 5.43 (9.5%) |
| sp90 | 12.64 | 0.09 | 26.15 | 15.66✗ | 17.09✗ | 2.46 | 25.97 | 8.45 | 24.85✗ | 64.15 | 22.91✗ | 12.93 | 4.40 | 27/37 | 5.44 (9.4%) |
| ah15 | 12.73 | 0.08 | 25.72 | 15.75✗ | 16.54✗ | 2.30 | 14.33✗ | 9.45✗ | 13.57 | 65.91 | 25.84 | 8.25 | 4.30 | 26/37 | 5.44 (10.0%) |
| rc12 | 12.81 | 0.09 | 25.76 | 15.91✗ | 16.77✗ | 2.26 | 14.60✗ | 9.85✗ | 13.27 | 66.59 | 25.00 | 8.41 | 4.45 | 27/37 | 5.51 (10.5%) |
| rc18 | 12.62 | 0.07✗ | 24.88✗ | 15.61 | 16.93✗ | 2.05✗ | 17.44✗ | 9.63✗ | 16.10 | 65.49 | 25.37 | 9.15 | 4.41 | 25/37 | 5.47 (8.7%) |
| rc20 | 12.62 | 0.07✗ | 24.92✗ | 15.59 | 17.03✗ | 2.02✗ | 17.74✗ | 9.80✗ | 16.63 | 65.76 | 25.19 | 9.06 | 4.43 | 25/37 | 5.48 (8.6%) |
| hp06 | 12.64 | 0.08 | 25.11✗ | 15.69✗ | 16.68✗ | 2.15 | 18.47 | 8.36 | 17.31 | 64.81 | 25.20 | 9.99 | 4.37 | 28/37 | 5.46 (9.2%) |
| sp70rc12ah15 | 12.72 | 0.10 | 26.96 | 15.71✗ | 16.73✗ | 2.69 | 20.95 | 7.91 | 20.11 | 65.18 | 23.93✗ | 10.89 | 4.33 | 27/37 | 5.41 (11.7%) |
| sp55rc12ah15 | 12.68 | 0.09 | 26.56 | 15.70✗ | 16.71✗ | 2.55 | 16.86✗ | 8.53 | 16.08 | 65.98 | 24.90 | 9.12 | 4.33 | 27/37 | 5.38 (11.5%) |
| sp70rc12 | 12.73 | 0.09 | 26.63 | 15.79✗ | 17.12✗ | 2.45 | 20.31 | 8.88 | 19.29 | 66.22 | 23.06✗ | 10.71 | 4.42 | 28/37 | 5.47 (10.4%) |
| sp70ah15 | 12.71 | 0.09 | 26.31 | 15.68✗ | 16.58✗ | 2.52 | 22.52 | 8.43 | 21.83✗ | 64.48 | 23.61✗ | 11.90 | 4.26 | 26/37 | 5.43 (10.1%) |
| sp70a085 | 12.68 | 0.09 | 26.19 | 15.71✗ | 16.78✗ | 2.46 | 24.13 | 9.57✗ | 23.22✗ | 64.56 | 22.71✗ | 12.73 | 4.42 | 26/37 | 5.36 (9.4%) |
| sp55a080 | 12.72 | 0.09 | 25.83 | 15.77✗ | 16.62✗ | 2.40 | 19.75 | 8.84 | 19.02 | 66.32 | 23.28✗ | 10.40 | 4.40 | 28/37 | 5.36 (10.0%) |
| sp70bx40 | 12.31 | 0.09 | 26.77 | 15.18 | 17.71✗ | 2.31 | 23.86 | 9.65✗ | 23.21✗ | 63.12 | 24.30 | 12.58 | 4.34 | 28/37 | 5.41 (9.0%) |
| sp70bx40s085 | 12.81 | 0.09 | 26.59 | 15.81✗ | 17.68✗ | 2.48 | 20.79 | 7.57 | 20.38 | 63.77 | 24.82 | 11.40 | 4.38 | 29/37 | 5.55 (10.5%) |
| sp70s085 | 13.04 | 0.08 | 26.24 | 16.01✗ | 16.70✗ | 2.45 | 20.94 | 7.97 | 20.02 | 67.82 | 22.17✗ | 10.01 | 4.53 | 28/37 | 5.47 (10.0%) |
| sp80bx40s085 | 12.81 | 0.09 | 26.61 | 15.79✗ | 17.65✗ | 2.55 | 23.45 | 7.46 | 23.16✗ | 63.89 | 23.75✗ | 12.37 | 4.37 | 26/37 | 5.52 (10.4%) |
| sp70ls6 | 12.70 | 0.09 | 25.46 | 15.72✗ | 17.19✗ | 2.32 | 21.10 | 8.61 | 20.02 | 65.12 | 23.90✗ | 10.98 | 4.41 | 28/37 | 5.48 (10.0%) |
| sp70m10 | 12.69 | 0.09 | 25.36 | 15.74✗ | 16.87✗ | 2.24 | 21.56 | 7.93 | 20.56 | 65.25 | 23.80✗ | 10.95 | 4.36 | 28/37 | 5.46 (9.4%) |
| sp70bx40s10 | 13.01 | 0.09 | 26.31 | 15.99✗ | 17.81✗ | 2.50 | 20.20 | 7.40 | 19.50 | 66.20 | 23.30✗ | 10.50 | 4.51 | 28/37 | 5.57 (10.6%) |
| sp70bx40s10rc18 | 12.96 | 0.08 | 26.08 | 15.93✗ | 17.66✗ | 2.40 | 20.25 | 8.46 | 19.42 | 65.55 | 23.70✗ | 10.75 | 4.48 | 28/37 | 5.51 (9.7%) |
| **sp70bx40s10rc20** | 12.98 | 0.08 | 26.12 | 15.94✗ | 17.42✗ | 2.39 | 21.13 | 8.58 | 20.50 | 64.75 | 24.06 | 11.19 | 4.50 | 29/37 | 5.50 (9.4%) |
| sp80bx40s10rc20 | 13.01 | 0.08 | 26.25 | 16.01✗ | 17.35✗ | 2.46 | 22.94 | 8.63 | 22.34✗ | 64.47 | 23.96✗ | 11.57 | 4.48 | 27/37 | 5.53 (9.5%) |
| sp70bx40s12rc20 | 13.31 | 0.08 | 26.14 | 16.32✗ | 17.45✗ | 2.47 | 23.18 | 6.48 | 21.66✗ | 63.87 | 23.99✗ | 12.15 | 4.71 | 26/37 | 5.50 (10.2%) |
| sp70bx40s12rc25 | 13.35 | 0.08✗ | 25.71 | 16.38✗ | 17.61✗ | 2.40 | 22.89 | 6.76 | 21.64✗ | 63.06 | 24.77 | 12.17 | 4.72 | 26/37 | 5.52 (10.0%) |
| sp70bx40s10rc25 | 12.96 | 0.08 | 26.08 | 15.90✗ | 17.76✗ | 2.39 | 21.88 | 9.11 | 21.05 | 63.98 | 24.50 | 11.52 | 4.56 | 29/37 | 5.50 (9.6%) |
| sp75bx40s12rc20 | 13.34 | 0.08 | 26.27 | 16.38✗ | 17.40✗ | 2.51 | 24.53 | 5.98 | 23.03✗ | 63.71 | 23.63✗ | 12.66 | 4.75 | 26/37 | 5.50 (10.2%) |

Shots from outside the box stay 10.2–10.6% (window 27.8–46.3%) and the mean shot distance 10.0–10.1 m (12.4–20.6) on every read: the box band's weight (`bx40`), the long-shot fall-off (`ls6`) and the midfield weight (`m10`) are mix weights, while about half of all shots are MATCH-16's clear chances, which they do not reach.

Readings:

- **The set-piece header is the goal lever MATCH-29 does not feel.** `sp55`–`sp90` add 0.05–0.34 goals a match, the goals going to set pieces (16 → 20–26%), headers (14.7 → 19–25%) and defenders (8.6 → 11–13%), so corners, set-piece, headed and DF goals sit inside together from `sp55` to `sp70`; past `sp70` headed goals leave their window (`sp90` 24.85%) and midfielders' goals fall under it (23–24% against 24–40%). Its share of the goals is capped by the headed row at about +0.2 goals.
- The volume scale (`s085`, `s10`) adds about 0.1–0.2 goals at 12.8–13.0 shots a team; with the box band's weight lowered (`bx40`) midfielders keep their share (24–25%). Possessions ending in a shot sit just past their window (15.8–16.0% against 15.6%) once the scale rises.
- The narrowing's relief (`rc12`, `ah15`) adds 0.14–0.18 goals each, through the 1v1s; a stronger narrowing (`rc18`, `rc20`) takes 0.07–0.10 away.

## 2. MATCH-29: press v counter at 1,200 matches a venue (calibration)

| read | press win share − counter's [95%] | press: goals, shots, xG a shot, possession | counter: goals, shots, xG a shot, MATCH-13 through balls (completed) | corners a team (the two conditions) |
|---|---|---|---|---|
| ctl (cv04-sit) | −0.148 [−0.183, −0.114] | 1.33, 13.7, 0.097, 63.1% | 1.75, 25.2, 0.065, 5.41 (4.44) | 4.71 / 5.06 |
| w0a7ah3hb35 (cv04-rec) | −0.173 [−0.207, −0.139] | 1.13, 9.7, 0.115, 63.8% | 1.56, 22.3, 0.065, 5.05 (4.19) | 4.72 / 5.01 |
| w0a7ah3hb35a070 (cv04-rec) | −0.189 [−0.223, −0.155] | 1.25, 9.9, 0.123, 63.9% | 1.75, 22.3, 0.074, 4.99 (4.14) | 4.80 / 5.11 |
| sp70 | −0.164 [−0.198, −0.129] | 1.22, 9.7, 0.124, 63.9% | 1.66, 22.3, 0.072, 5.07 (4.22) | 4.72 / 5.03 |
| sp90 | −0.181 [−0.215, −0.147] | 1.26, 9.8, 0.129, 63.8% | 1.77, 22.3, 0.076, 5.09 (4.23) | 4.71 / 5.06 |
| sp70bx40s085 | −0.181 [−0.215, −0.146] | 1.23, 9.7, 0.125, 63.8% | 1.70, 22.3, 0.071, 5.03 (4.17) | 4.75 / 4.99 |
| sp55rc12ah15 | −0.268 [−0.302, −0.235] | 1.21, 9.8, 0.124, 63.8% | 1.95, 22.4, 0.085, 4.99 (4.15) | 4.77 / 5.04 |
| sp70rc12ah15 | −0.278 [−0.311, −0.244] | 1.26, 9.9, 0.128, 63.8% | 2.03, 22.4, 0.088, 5.00 (4.16) | 4.82 / 5.04 |
| **sp70bx40s10rc20** | **−0.139 [−0.173, −0.105]** | 1.23, 10.0, 0.122, 63.9% | 1.51, 22.6, 0.060, 4.89 (4.08) | 4.81 / 5.09 |

Press plays no MATCH-13 through ball against counter in any read (0.00).

Readings:

- Counter takes 22.3–22.6 shots against press's 9.7–10.0 in every read, so **any lever that lifts the quality of a shot lifts counter's goals about twice as much as press's**: relieving the keeper's narrowing (`rc12`, `ah15`) takes counter's xG a shot 0.065 → 0.085–0.088 and the gap to −0.27/−0.28 (control −0.148).
- The set-piece header and the volume scale leave it in the base's noise (−0.164 to −0.181 against −0.173): corners are even (4.7–4.8 / 5.0–5.1 a team) and press's added shots are its own.
- A stronger narrowing on the 1v1s (`rc20`) takes counter's xG a shot 0.065 → 0.060 and, with the set-piece header and volume restoring press's goals, `sp70bx40s10rc20` reads −0.139 [−0.173, −0.105], the control's level: the first goal-restoring candidate in T689 that does not move MATCH-29.

## 3. Held-out concentration and the stress case

Concentration (`scoring-concentration.ts --matches 2400 --seeds t689-val-1..4`; the share's interval is over the seed clusters holding 20-goal clubs, two here):

| read | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | top scorer goals / 38 | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---|---:|---|---:|---|---|
| ctl (cv04) | 2.83 | 16.9 | 0.060 | 37.5 [36.4, 38.6] | 25.4 | 12.6 / 7.1 | 20.4 | 3.97, 35.2, 45.4 | 1.91, 13.0 |
| w0a7ah3hb35 (cv04-rec) | 2.24 | 12.9 | 0.024 | 30.8 [29.7, 31.9] | 22.7 | 12.0 / 7.8 | 13.2 | 2.81, 32.7, 39.8 | 1.64, 16.9 |
| w0a7ah3hb35a070 (cv04-rec) | 2.52 | 13.1 | 0.034 | 31.2 [31.0, 31.4] | 23.4 | 13.5 / 8.9 | 15.2 | 2.84, 32.6, 39.1 | 1.66, 16.7 |
| rc20 | 2.10 | 12.9 | 0.019 | 31.6 [31.3, 32.0] | 22.4 | 11.5 / 7.1 | 12.5 | 2.82, 32.8, 39.8 | 1.65, 16.8 |
| sp90 | 2.61 | 13.0 | 0.040 | 31.9 [31.2, 32.7] | 23.4 | 14.0 / 9.1 | 16.1 | 2.80, 32.4, 39.5 | 1.65, 15.0 |
| sp70bx40s085 | 2.46 | 12.9 | 0.029 | 33.0 [32.5, 33.4] | 24.2 | 13.3 / 8.6 | 15.8 | 2.84, 32.9, 40.3 | 1.61, 14.8 |
| sp70bx40s10rc20 | 2.44 | 13.3 | 0.030 | 32.8 [31.6, 33.9] | 23.9 | 13.1 / 8.3 | 15.7 | 2.91, 32.9, 40.2 | 1.68, 14.9 |
| sp55rc12ah15 | 2.62 | 12.9 | 0.041 | 31.9 [31.3, 32.5] | 23.3 | 14.3 / 9.2 | 16.4 | 2.81, 32.6, 39.7 | 1.64, 16.9 |
| sp70rc12ah15 | 2.71 | 13.0 | 0.045 | 32.4 [31.9, 32.9] | 23.5 | 14.8 / 9.4 | 17.2 | 2.81, 32.5, 40.0 | 1.65, 16.3 |

Striker stress case (cf04-stress-val-1..3, 456 matches an arm, every record valid):

| variant | arm | goals / match | own shots | club top-scorer share [95%] | top scorer / 38 | largest / 38 | hat-tricks / own match | FW goals |
|---|---|---:|---:|---|---:|---:|---:|---:|
| ctl (nx04) | normal / stress | 3.11 / 3.43 | 17.7 / 16.8 | 42.2% / 56.4% | 26.1 / 33.5 | 38 / 52 | 0.053 / 0.068 | 63% / 73% |
| w0a7ah3hb35 (cv04-rec) | normal / stress | 2.22 / 2.67 | 13.4 / 12.5 | 38.5% [37.6, 39.5] / 46.2% [44.5, 47.9] | 16.3 / 21.5 | 24 / 28 | 0.024 / 0.035 | 60% / 65% |
| sp70bx40s085 | normal / stress | 2.51 / 2.75 | 13.6 / 12.4 | 33.0% [31.2, 34.9] / 47.6% [44.9, 50.3] | 16.3 / 22.6 | 29 / 35 | 0.018 / 0.037 | 55% / 66% |

Readings:

- **The share follows the goal level whichever lever sets it**: 30.8% at 2.24 goals, 31.2–31.9% at 2.52–2.62, 32.4–33.0% at 2.44–2.71, and none of the levers moves the ST slot's 39.5–40.3% of the goals or 32.4–32.9% of the shots. `sp55rc12ah15` and `sp70rc12ah15` put goals (2.62 / 2.71), shots (12.9 / 13.0) and hat-tricks (0.041 / 0.045) inside together, but the share at 31.9–32.4% and press v counter at −0.27/−0.28.
- A stronger narrowing on the 1v1s does not spread the goals either: `rc20` lowers both conversions (12.0 → 11.5%, 7.8 → 7.1%) and leaves the share at 31.6% with fewer goals.
- Set-piece headers go to centre-backs (24% conversion on `sp90`) but also to the striker, whose conversion rises with them (12.0 → 14.0%).
- The stress case's normal squads' top scorer falls 38.5 → 33.0% on `sp70bx40s085`; the peak striker stays at 47.6% (46.2%).

The finalist on the stress case and MATCH-28's core (validation, scale 1, 600 matches):

| read | stress: normal / peak striker share | his run / 38 (largest) | normal hat-tricks / own match | MATCH-28 core goals | MATCH-23 inside / outside / unresolved | MATCH-23 rows outside |
|---|---|---|---|---:|---|---|
| ctl (nx04 / cv04-sit) | 42.2% / 56.4% | 33.5 (52) | 0.053 | - | 22 / 11 / 5 | - |
| w0a7ah3hb35 (cv04-rec) | 38.5% / 46.2% | 21.5 (28) | 0.024 | 2.41 | 25 / 8 / 5 | back passes 19.9%, possessions ending in a shot 16.3%, goal area / box / outside 16.3 / 74.3 / 9.4%, shot distance 9.9 m, throw-ins 9.2, set-piece goals 14.0% |
| **sp70bx40s10rc20** | 35.1% [33.1, 37.2] / 47.6% [46.5, 48.7] | 22.1 (30) | 0.015 | 2.62 | **26 / 7 / 5** | back passes 19.8%, possessions ending in a shot 16.8%, goal area / box / outside 17.0 / 72.0 / 11.0%, shot distance 10.1 m, throw-ins 9.1 |

Set-piece goals move inside on MATCH-28's core; the MATCH-30 counters outside are the base's (box shots, box entries, xT, through balls, progressive carries). No invariant or full-record failure.

## 4. Who gets the chances (1,200-match concentration screens, calibration seeds, on `B` = `sp70bx40s10rc20`)

| read | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---|---:|---|---|---|
| B | 2.35 | 13.1 | 0.031 | 34.7 [30.4, 39.0] | 24.9 | 13.1 / 8.3 | 2.91, 33.3, 40.5 | 1.70, 15.3 |
| Bss8 | 2.30 | 13.0 | 0.033 | 30.1 [25.5, 34.7] | 22.9 | 11.6 / 7.9 | 2.82, 32.6, 39.0 | 1.69, 15.1 |
| Bho18 | 2.39 | 13.0 | 0.034 | 36.7 [29.7, 43.7] | 24.3 | 11.9 / 6.9 | 2.84, 32.7, 39.7 | 1.71, 15.4 |
| Bar8 | 2.40 | 13.3 | 0.043 | 36.0 [30.1, 41.9] | 25.9 | 13.7 / 8.3 | 2.96, 33.5, 40.0 | 1.69, 14.3 |
| Bbo6 | 2.48 | 13.5 | 0.033 | 36.9 [28.0, 45.9] | 24.6 | 13.4 / 7.4 | 2.88, 32.0, 39.6 | 1.88, 15.6 |
| Baf40 | 2.39 | 13.2 | 0.037 | 30.2 [24.6, 35.8] | 20.4 | 15.7 / 8.8 | 2.86, 32.4, 39.2 | 1.83, 16.7 |

At 1,200 matches the share's interval spans 9–18 points, so these screens cannot rank the share; the ST slot's goal share, which they resolve, stays 39.0–40.5% under every one: second strikers dropping, the striker waiting deeper, arrivals nearer goal or earlier and more box runs do not take scoring positions from him.

## 5. MATCH-23's season share (`scoring-season-share.ts`, whole 2024 league seasons, own club)

| read | club-seasons | own goals / against a match | club top-scorer share [95%] | by seed | top scorer goals / 38 | his starts | top scorers by position |
|---|---:|---|---|---|---:|---:|---|
| released (no candidate) | 40 | 2.06 / 1.90 | 42.4 [39.8, 45.0] | 43.9 / 40.8 | 33.0 | 94.1% | ST 40 |
| ctl (cv04) | 40 | 1.61 / 1.51 | 35.8 [33.0, 38.5] | 35.0 / 36.5 | 21.6 | 95.3% | ST 37, CM 3 |
| w0a7ah3hb35 (cv04-rec) | 40 | 1.35 / 1.18 | 32.9 [30.8, 35.0] | 32.9 / 32.9 | 16.6 | 90.9% | ST 34, CM 4, RW 1, LW 1 |
| sp70rc12ah15 | 40 | 1.56 / 1.47 | 33.0 [30.8, 35.1] | 33.1 / 32.8 | 19.4 | 94.5% | ST 31, CM 7, LW 1, LM 1 |
| sp70bx40s10rc20, ENG (seeds 1–4) | 80 | 1.36 / 1.26 | 30.9 [29.4, 32.4] | 30.5 / 30.8 / 30.4 / 31.9 | 16.1 | 94.3% | ST 63, CM 7, CB 5, LW 4, RW 1 |
| sp70bx40s10rc20, ESP (seed 1) | 20 | 1.35 / 1.24 | 29.3 [26.1, 32.6] | 29.3 | 14.7 | 91.4% | ST 13, CM 4, LW 1, CB 1, AM 1 |
| **sp70bx40s10rc20, both** | 100 | 1.36 / 1.25 | **30.6 [29.2, 32.0]** | - | 15.8 | 93.8% | ST 76, CM 11, CB 6, LW 5, RW 1, AM 1 |

Readings:

- **The released model, on MATCH-23's own season definition**: an own top-flight club's matches carry 3.96 goals, its top scorer scores 33 league goals a season and takes 42.4% [39.8, 45.0] of its goals — the owner's complaint, measured where the band is defined.
- The season read and the fixed-XI held-out read agree within about two points either way (ctl 35.8 against 37.5%, `w0a7ah3hb35` 32.9 against 30.8%, `sp70bx40s10rc20` 30.6 against 32.8%): the top scorer starts 91–95% of the league matches, so selection, injuries and suspensions spread little, and the fixed-XI proxy is a fair gate read. Seasons play real strength gaps, so their goals run 0.1–0.3 a match above the equal pairs'.
- `sp70bx40s10rc20` over 100 club-seasons in two countries: 2.61 goals a match, the share 30.6% [29.2, 32.0] — the first season mean in T689 inside MATCH-23's 31.25%, with its interval still reaching 32.0%, and centre-backs (set-piece headers), wingers and midfielders now lead 24 of the 100 clubs.

## Gate

Unmet; no scoring source is committed. This window finds the goal lever MATCH-29 does not feel — a set piece's delivered header's chance quality (`setPieceHeader` 0.7), with the volume scale (0.1) and the box band's weight (0.4) — and a stronger narrowing on the 1v1s (`reach` 2 m) that takes counter's chances behind press's line back: `sp70bx40s10rc20` reads press v counter −0.139 [−0.173, −0.105] (control −0.148), held-out goals 2.44 with shots 13.3 and hat-tricks 0.030, MATCH-28's core 26 / 7 / 5 with goals 2.62 and set-piece goals inside, and 30.6% [29.2, 32.0] on MATCH-23's season share. It misses: the share's interval (to 32.0% on seasons; 32.8% [31.6, 33.9] on the fixed-XI held-out read), possessions ending in a shot (16.8% against 15.6%), the stress case (normal 35.1%, peak striker 47.6%, cv04-sit's 32.7 / 43.9%), and the shot places the released source already misses (goal area 17%, outside 11%, distance 10 m). Every lever that adds goals by a shot's quality — `shot.a`, the narrowing's relief — lifts counter's goals about twice as much as press's and the striker's conversion with everyone's; none of the nine setting levers measured (`setPieceHeader`, `ahead`, `reach`, `headerPressure`, `shot.a`, `shotBox`, the volume scale, `longShotScale`, the midfield weight), nor five allocation knobs, moves the ST slot's 39–40.5% of the goals. The rules these candidates need are in no SSOT (MATCH-16's alone clause radius, MATCH-35's narrowing by situation with `ahead` and the keeper's `reach`, MATCH-12's keeper release, MATCH-17/33's arrivals, MATCH-18's call values and headers behind, a set piece's header quality), so none could ship without a gusta-update-ssot and a prospective model revision (SAVE-23). The switches stay uncommitted in `analysis/cv04-sym-source.patch`; the engine source is restored.

## Next

1. The ST slot's ~40% of the goals is the remaining concentration lever, and no setting reaches it: decompose the striker's goals on `sp70bx40s10rc20` by origin (`scripts/scoring-shot-origins.ts`: goal area, through balls, crosses, rebounds, set pieces) to find which chances only he arrives at, then change who arrives there (MATCH-17/33), measured on `scoring-season-share.ts` at 100+ club-seasons, the held-out read and the stress case.
2. Possessions ending in a shot (16–17%) and the goal-area share (17%) come with the clear-chance volume; the mean shot distance (10 m against 15–18) says chances in the clear are carried too close before the shot (MATCH-16's carry, 6 m a step, and its 20 m line).
3. Before any commit: gusta-update-ssot of MATCH-16, MATCH-35 (`reach`, the narrowing by situation), MATCH-12, MATCH-17/33, MATCH-18 and MATCH-11's set-piece header quality, then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Limits

- Timing: the window ran 17:53–19:53Z; the first unit 17:53–17:57Z (no result read), measurements 17:59–18:58Z, then the evidence. Measurement wall-clock about an hour, not two.
- Band checks are 400 matches on the calibration seeds (goals swing about ±0.15); MATCH-29 reads cover press v counter only at 1,200 matches a venue on the calibration seeds (intervals about ±0.035), no 16-pairing or validation MATCH-29 read.
- Held-out concentration is 2,400 matches over four world seeds whose share interval rests on the two seed clusters with 20-goal clubs (normal approximation: an observed result for these seeds); hat-tricks have no interval. The 1,200-match screens cannot resolve the share.
- The season read covers the own club only (other clubs play the aggregate path), one season per takeover, ENG and ESP's top flights in 2024 on four and one seeds, with a normal interval over club-seasons; no hat-tricks (league records are not retained per fixture), no league top-scorer distribution, no later seasons of a career.
- The stress case is fixed-squad, three seeds; MATCH-28's core is one condition on validation at scale 1.
