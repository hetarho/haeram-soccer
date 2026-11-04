# T689 scoring — 261104 cv04 (a newly authorized 2 h window)

The owner's automatic continuation request authorized one fresh exploration window for T689: 2026-11-04T11:36Z–13:36Z, on `codex/cv04` from main fb868d3d (Apple M1 Max, 10 cores, shared with other work: load 4–53; measurements ran 11:40–12:17Z, the evidence was written after). It is a new window, not the 00:42–02:42Z one reopened; cf04's and nx04's evidence (`../scoring-261104-cf04/`, `../scoring-261104-nx04/`) is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: nx04's best candidate arrHoldEZ60 (earlyZones volume base + `hold` 14 + `arrive` from 60), with nx04's two default-off switches re-applied from its retained patch. Every candidate here is arrHoldEZ60 plus the settings its JSON adds (`candidates/`, applied by `scripts/scoring-candidate-patch.ts`, every name checked); `ctl` is arrHoldEZ60 itself. New default-off experiment switches, all uncommitted in `analysis/cv04-source.patch` (nx04's switches included; the engine source is restored):

- `decide.keeper.safe` / `free` — the keeper's open-play distribution plays short only to a receiver nobody is within `safe` m of, along a lane nobody reaches cleanly (`free`: nobody reaches at all), else long, to such a receiver when one exists.
- `duel.pass.keeperClear` — nobody reaches the first `keeperClear` m of a keeper's distribution (`reachOnPath`'s second-ball `clear`).
- `duel.pass.keeperLeave` — an opponent within `keeperLeave` m of the keeper as he distributes does not reach his ball (he plays it past the man on him).
- `decide.candidate.revision9.clear.view` — MATCH-16's "nobody within 5 m" clear chance needs that share of the goal unblocked (MATCH-35). The first `view5`/`view7`/`view5ks5` runs (logs `*floor*`) gated only the shot floor in `actionMix`, not the clear chance itself.
- `decide.candidate.revision9.clear.within` — that clause holds only within `within` m of the goal centre.
- `shape.candidate.keeperOff` — a presser of the keeper on the ball stands off at least that far goal-side of him instead of closing him.
- `alone 0` (an existing setting) switches the clause off: a diagnostic, since MATCH-16 states it.

Measurement commands (the runner `analysis/run.mjs` sets `T689_PATCH_FILE` per job): `scripts/grid-bands.ts --candidate --matches N` (the MATCH-23 band check on the grid-bands pairs, calibration seeds; its output in `bands/*.txt`, as `*.log` is gitignored; `analysis/table.mjs` rebuilds §2's table from them), `scripts/scoring-concentration.ts --matches 1200|2400`, `scripts/scoring-striker-stress.ts`, `scripts/grid-bands.ts --report --scale 0.25 --only core,tactics --jobs 4` and the new `scripts/scoring-regain-shots.ts` (observed matches 600–719 of the shot-origin design).

## 1. Where the striker's regains come from (`scripts/scoring-regain-shots.ts`, ctl, 120 observed matches)

nx04 left "a striker taking 60% of the shots straight after a won interception" unexplained. The new diagnostic reads, for each shot whose previous entry is the other side's action, who on the losing side played the ball, from where, and how it ended:

| ctl, matches 600–719 (3,966 shots, penalties left out) | shots | goals | xG a shot |
|---|---:|---:|---:|
| every shot straight after an opponent's action | 348 | 68 | 0.185 |
| … after the opposing **keeper's** distribution was lost | 219 | 42 | 0.199 |
| … of which won within 5 m of the keeper | 136 | 33 | 0.242 |
| … of which won by the striker slot | 130 | 20 | 0.192 |
| … struck within 3 s of the keeper's kick | 208 | 41 | 0.204 |
| … after a centre-back's ball was lost | 58 | 12 | 0.135 |
| struck by the striker slot (all 348) | 188 | 35 | 0.192 |

So 0.91 shots a team a match and about 12% of all goals (42 of about 345) come from a keeper's open-play distribution cut out at his feet — mostly by the striker standing on him, who shoots within 3 s at xG 0.2. Real football has goals from keeper distribution errors at a small fraction of that. This, not the press, is the striker's "regain" share.

## 2. Calibration screens

Band check: `grid-bands.ts --candidate --matches 400` (calibration seeds grid-bands-1..4; 400 matches, so a row's status can flip within noise: goals move ±0.15 and FW goals ±2 points between near-identical candidates). Concentration: `scoring-concentration.ts --matches 1200` (2–3 of four world seeds; the club top-scorer interval is over seed clusters and wide). `unopposed` = shots from a MATCH-16 clear chance (`clearChance` at the shot) a team a match and their conversion.

| candidate | band matches | shots a team | xG a shot | goal area / box / outside % | poss. ending in a shot % | goals | pen. goals % | FW / MF goals % | rows inside | unopposed a team (scored) | conc. goals / shots | hat-tricks | club top-scorer share [95%] | ST shots, goals % | CM goals % |
|---|---:|---:|---:|---|---:|---:|---:|---|---:|---|---|---:|---|---|---:|
| ctl | 400 | 17.00✗ | 0.08✗ | 14.68✗ / 74.58✗ / 10.73✗ | 20.14✗ | 2.89 | 11.59✗ | 69.38✗ / 20.16✗ | 23/37 | 8.34 (9.1%) | 2.87 / 16.9 | 0.069 | 32.8 [25.1, 40.5] | 35.6, 45.8 | 14.4 |
| q10 | 400 | 16.47✗ | 0.08 | 15.30✗ / 73.86✗ / 10.84✗ | 19.60✗ | 3.11 | 12.31✗ | 70.31✗ / 20.51✗ | 24/37 | 8.26 (10.2%) | 2.96 / 16.7 | 0.073 | 37.4 [35.5, 39.4] | 35.8, 46.2 | 13.7 |
| q10s14 | 400 | 17.27✗ | 0.08✗ | 14.80✗ / 73.61✗ / 11.59✗ | 20.49✗ | 3.10 | 10.18✗ | 68.50 / 19.39✗ | 24/37 | 8.38 (9.9%) | 2.95 / 17.3 | 0.061 | 35.2 [31.4, 38.9] | 35.5, 45.9 | 13.8 |
| q15s20 | 400 | 17.85✗ | 0.08✗ | 15.82✗ / 71.16✗ / 13.02✗ | 21.19✗ | 3.06 | 9.73✗ | 70.48✗ / 18.72✗ | 23/37 | 8.46 (9.3%) | 3.08 / 18.0 | 0.082 | 37.4 [36.7, 38.1] | 36.0, 46.3 | 14.2 |
| q10s14L6 | 400 | 17.39✗ | 0.08✗ | 14.83✗ / 72.98✗ / 12.19✗ | 20.63✗ | 3.04 | 9.05 | 69.14✗ / 18.77✗ | 24/37 | 8.43 (9.7%) | 3.02 / 17.5 | 0.064 | 37.4 [32.6, 42.2] | 35.7, 45.9 | 13.9 |
| view5floor | 400 | 17.08✗ | 0.08✗ | 15.24✗ / 74.51✗ / 10.25✗ | 20.21✗ | 2.94 | 10.82✗ | 68.65 / 20.78✗ | 24/37 | 8.37 (9.4%) | - | - | - | - | - |
| view7floor | 400 | 16.43✗ | 0.08✗ | 15.07✗ / 75.09✗ / 9.85✗ | 19.50✗ | 2.76 | 9.95✗ | 70.32✗ / 19.55✗ | 23/37 | 8.10 (8.8%) | - | - | - | - | - |
| view3 | 400 | 17.09✗ | 0.08✗ | 14.50✗ / 74.84✗ / 10.66✗ | 20.23✗ | 2.93 | 12.12✗ | 69.37✗ / 20.82✗ | 23/37 | 8.38 (9.2%) | - | - | - | - | - |
| view5 | 400 | 16.71✗ | 0.08✗ | 14.68✗ / 75.08✗ / 10.24✗ | 19.92✗ | 2.94 | 11.05✗ | 70.75✗ / 17.94✗ | 23/37 | 8.17 (9.9%) | 2.86 / 16.8 | 0.070 | 37.5 [35.3, 39.7] | 35.9, 46.4 | 13.1 |
| view7 | 400 | 16.26✗ | 0.08✗ | 15.14✗ / 74.35✗ / 10.51✗ | 19.49✗ | 2.90 | 9.14 | 71.29✗ / 18.79✗ | 24/37 | 8.11 (9.9%) | - | - | - | - | - |
| alone0 | 400 | 12.94 | 0.09 | 20.86✗ / 68.38✗ / 10.76✗ | 15.48 | 2.67 | 12.65✗ | 72.54✗ / 18.37✗ | 26/37 | 5.15 (12.9%) | 2.56 / 12.7 | 0.066 | 39.4 [33.0, 45.8] | 38.1, 46.9 | 12.3 |
| an12 | 400 | 13.12 | 0.09 | 19.89✗ / 69.37✗ / 10.74✗ | 15.84✗ | 2.63 | 11.43✗ | 68.57 / 21.33✗ | 26/37 | 5.43 (12.3%) | - | - | - | - | - |
| an12s16 | 400 | 14.29 | 0.08 | 18.63✗ / 68.84✗ / 12.53✗ | 17.14✗ | 2.81 | 9.42✗ | 71.56✗ / 17.96✗ | 24/37 | 5.44 (12.6%) | - | - | - | - | - |
| an14s16 | 400 | 14.80 | 0.08 | 17.86✗ / 69.73✗ / 12.41✗ | 17.73✗ | 2.80 | 8.47 | 70.83✗ / 18.55✗ | 25/37 | 5.74 (12.8%) | - | - | - | - | - |
| a0s20 | 400 | 14.78 | 0.08 | 18.67✗ / 67.28✗ / 14.05✗ | 17.66✗ | 2.61 | 10.34✗ | 71.26✗ / 18.01✗ | 24/37 | 5.15 (12.8%) | - | - | - | - | - |
| clr6 | 400 | 16.36✗ | 0.07✗ | 14.33✗ / 75.20✗ / 10.48✗ | 19.14✗ | 2.63 | 11.67✗ | 70.30✗ / 19.35✗ | 23/37 | 7.92 (8.9%) | 2.71 / 16.4 | 0.057 | 32.8 [26.0, 39.5] | 34.7, 43.9 | 13.6 |
| ks3 | 400 | 16.85✗ | 0.08✗ | 14.73✗ / 74.71✗ / 10.56✗ | 20.01✗ | 2.82 | 10.91✗ | 70.28✗ / 19.25✗ | 23/37 | 8.29 (9.1%) | - | - | - | - | - |
| ks5 | 400 | 16.84✗ | 0.07✗ | 14.57✗ / 75.12✗ / 10.31✗ | 19.94✗ | 2.85 | 11.73✗ | 71.37✗ / 17.51✗ | 23/37 | 8.21 (8.7%) | - | - | - | - | - |
| kf5 | 400 | 16.73✗ | 0.08✗ | 15.16✗ / 74.25✗ / 10.58✗ | 19.95✗ | 3.01 | 10.79✗ | 71.20✗ / 18.76✗ | 22/37 | 8.38 (10.0%) | - | - | - | - | - |
| kc8 | 400 | 16.87✗ | 0.07✗ | 11.83✗ / 77.59✗ / 10.58✗ | 20.12✗ | 2.84 | 11.19✗ | 71.01✗ / 18.77✗ | 23/37 | 8.17 (9.0%) | 2.69 / 16.8 | 0.038 | 42.2 [30.0, 54.3] | 34.6, 44.1 | 13.2 |
| kc12 | 400 | 16.55✗ | 0.07✗ | 11.69✗ / 77.45✗ / 10.85✗ | 19.76✗ | 2.56 | 12.49✗ | 68.39 / 18.93✗ | 24/37 | 8.04 (7.8%) | - | - | - | - | - |
| kl6 | 400 | 16.79✗ | 0.07✗ | 13.04✗ / 76.29✗ / 10.67✗ | 19.98✗ | 2.72 | 11.29✗ | 70.34✗ / 18.55✗ | 23/37 | 8.20 (8.7%) | - | - | - | - | - |
| kl10 | 400 | 16.72✗ | 0.07✗ | 12.47✗ / 76.80✗ / 10.73✗ | 19.88✗ | 2.74 | 11.94✗ | 69.92✗ / 18.05✗ | 22/37 | 8.13 (8.6%) | - | - | - | - | - |
| kf5kc8 | 400 | 16.90✗ | 0.07✗ | 11.42✗ / 77.54✗ / 11.04✗ | 20.14✗ | 2.70 | 11.93✗ | 66.88 / 21.00✗ | 24/37 | 8.31 (7.9%) | - | - | - | - | - |
| kl6kc8 | 400 | 16.68✗ | 0.07✗ | 12.00✗ / 77.34✗ / 10.66✗ | 19.95✗ | 2.67 | 11.62✗ | 69.92✗ / 19.21✗ | 23/37 | 8.07 (8.6%) | 2.63 / 16.8 | 0.033 | 34.6 [32.9, 36.3] | 34.4, 42.8 | 12.8 |
| view5kc8 | 400 | 16.63✗ | 0.07✗ | 11.74✗ / 77.41✗ / 10.85✗ | 19.91✗ | 2.74 | 11.60✗ | 69.04✗ / 19.63✗ | 23/37 | 8.02 (8.8%) | - | - | - | - | - |
| a0kc8 | 400 | 12.24 | 0.08 | 17.09✗ / 71.06✗ / 11.85✗ | 14.89 | 2.27 | 13.75✗ | 70.52✗ / 18.92✗ | 24/37 | 4.77 (11.5%) | - | - | - | - | - |
| an12kl6kc8 | 1200 | 13.00 | 0.08 | 16.46✗ / 72.51✗ / 11.03✗ | 15.75✗ | 2.46 | 13.02✗ | 70.68✗ / 19.49✗ | 25/37 | 5.21 (11.6%) | 2.42 / 13.0 | 0.043 | 36.4 [35.5, 37.4] | 36.5, 44.5 | 13.9 |
| o1 | 400 | 13.35 | 0.08 | 17.06✗ / 68.62✗ / 14.32✗ | 16.16✗ | 2.65 | 12.18✗ | 69.03✗ / 19.45✗ | 25/37 | 5.28 (12.9%) | 2.53 / 13.6 | 0.051 | 34.2 [31.4, 37.0] | 37.1, 44.5 | 13.0 |
| o2 | 400 | 14.03 | 0.08 | 17.07✗ / 64.69 / 18.24✗ | 16.85✗ | 2.51 | 11.94✗ | 71.94✗ / 18.21✗ | 25/37 | 5.24 (12.2%) | 2.57 / 14.2 | 0.060 | 31.8 [26.4, 37.3] | 37.5, 45.1 | 12.8 |
| o3 | 400 | 17.39✗ | 0.07✗ | 12.67✗ / 74.38✗ / 12.95✗ | 20.64✗ | 2.88 | 9.01 | 68.63 / 20.10✗ | 25/37 | 8.29 (9.0%) | 2.79 / 17.4 | 0.054 | 35.5 [30.9, 40.2] | 35.0, 42.4 | 13.5 |
| o4 | 400 | 14.64 | 0.08 | 17.34✗ / 60.22 / 22.44✗ | 17.50✗ | 2.49 | 12.96✗ | 68.84✗ / 19.90✗ | 25/37 | 5.33 (11.4%) | 2.66 / 14.6 | 0.050 | 35.0 [30.6, 39.3] | 38.4, 44.5 | 13.5 |
| o5 | 400 | 14.28 | 0.08 | 16.95✗ / 62.15 / 20.90✗ | 17.07✗ | 2.57 | 10.30✗ | 69.87✗ / 17.20✗ | 26/37 | 5.34 (12.3%) | 2.64 / 14.4 | 0.048 | 33.8 [30.3, 37.3] | 37.4, 44.7 | 12.0 |
| o6 | 400 | 17.73✗ | 0.07✗ | 13.85✗ / 68.98✗ / 17.17✗ | 21.06✗ | 2.83 | 10.34✗ | 67.23 / 20.05✗ | 24/37 | 8.26 (8.6%) | 2.82 / 18.0 | 0.063 | 32.7 [24.3, 41.1] | 36.2, 45.3 | 13.4 |
| ko10 | 400 | 16.78✗ | 0.08✗ | 13.89✗ / 75.44✗ / 10.67✗ | 19.92✗ | 2.81 | 11.73✗ | 69.42✗ / 18.40✗ | 22/37 | 8.28 (8.6%) | - | - | - | - | - |
| ko16 | 400 | 17.03✗ | 0.07✗ | 12.52✗ / 76.70✗ / 10.77✗ | 20.24✗ | 2.86 | 11.62✗ | 69.34✗ / 19.30✗ | 22/37 | 8.41 (8.6%) | 2.72 / 16.9 | 0.054 | 34.0 [31.4, 36.6] | 35.3, 44.7 | 12.2 |
| ko16kl6kc8 | 400 | 16.84✗ | 0.07✗ | 11.21✗ / 78.15✗ / 10.64✗ | 20.01✗ | 2.63 | 9.69✗ | 67.05 / 19.94✗ | 23/37 | 8.23 (7.9%) | 2.67 / 16.8 | 0.048 | 33.4 [31.3, 35.4] | 34.5, 43.3 | 12.6 |

Candidates (each on ctl): `q*` shotQuality {ref 0.12, power 1 / 1.5, most 2} with shotScale 0.1 / 0.14 / 0.2, `L6` longShotScale 6; `view*` `clear.view` 0.3–0.7 (`*floor` the shot-floor-only version); `alone0` `clear.alone` 0; `an12`/`an14` `clear.within` 12 / 14, `s16`/`s20` shotScale 0.16 / 0.2; `clr6` pressure clearance 6; `ks*` keeper `safe` 3 / 5, `kf5` with `free`; `kc*` `keeperClear` 8 / 12; `kl*` `keeperLeave` 6 / 10; `o1`–`o6` the keeper fix (and `within` 12 for o1, o2, o4, o5) with shotScale 0.18–0.35, shotBox 0.3–0.12 and longShotScale 6–8; `ko*` `shape.candidate.keeperOff` 10 / 16 (a presser of the keeper on the ball stands off that far goal-side of him, the last switch added; `candidates/*.json` hold the exact values).

Readings:

- **Box shot quality is not the volume.** A sharper `shotQuality` (power 1–1.5, the released revision 4's was 1) leaves shots at 16.5–18.0 a team: about half of all shots (8.1–8.5 a team, converting 8–10%) come from MATCH-16's clear chance, whose floor and pass/carry restrictions the quality term does not reach. Real big chances are about one a team a match.
- **MATCH-16's "nobody within 5 m" clause carries the volume.** Off (`alone0`) or held to 12 m of goal (`an12`), shots fall 17.0 → 12.9–13.1 a team, possessions ending in a shot 20.1 → 15.5–15.8%, xG a shot 0.08 → 0.09 and goals stay 2.6–2.7: the volume rows come inside for the first time in T689. Gating it on an open view (`view` 0.3–0.7) changes nothing — the low-xG clear chances are not blocked views (their xG is low for distance, angle and the keeper's narrowing). But the shots it removes are midfielders' (CM shots 1.97 → 1.33 an appearance): the striker slot's shot share rises 35.6 → 38.1% and the club top-scorer share 32.8 → 39.4%; the goal-area share rises 14.7 → 19.9–20.9% (fewer edge shots, the same goal-area ones) and outside shots stay 10.7%. With the volume scale raised back (`an12s16`, `an14s16`, `a0s20`: 0.16–0.2) outside shots reach only 12.4–14.1% (32–42%).
- **The keeper's distribution is a fixable defect, but not by his choice.** `safe`/`free` (choosing only a receiver and lane nobody reaches at decision time) leave the keeper's lost balls unchanged (219 → 210–221): the man who wins it is not on the lane when the keeper chooses but closes him before the kick. `keeperClear` 8 m takes the losses at his feet away (within 5 m 136 → 2) but most move to 5–10 m (38 → 105); `keeperLeave` 6 m with `keeperClear` 8 m (`kl6kc8`) halves the keeper-loss goals (42 → 20 in 120 matches; striker slot's regain shots 188 → 121) and takes the goal-area share 14.7 → 12.0%, goals 2.89 → 2.67, with no other band row moved beyond noise. Telling the keeper's presser to stand off 10 / 16 m (`ko10`, `ko16`) leaves the losses at his feet nearly as they were (within 5 m 136 → 106 / 88, keeper losses 219 → 209 / 219): the man at the keeper's feet is mostly not pressing him but still standing where his own chance ended when the keeper releases the ball at once (shots on the keeper's ball within 3 s: 208 of 219).
- `clr6` (a pressed defender in his own box clears 6× as often) moves nothing beyond noise.
- **Outside shots have no knob.** Lowering the box band's extra shot weight (`shotBox` 0.56 → 0.3–0.12) with a larger volume scale (0.18–0.35) and a longer long-shot fall-off takes the box share inside for the first time (o2 64.7%, o4 60.2%) but outside shots only to 14–22% (32–42%), with the goal-area share at 17% and the striker slot's shot share up to 37–38%; without the 12 m clear chance (o3, o6) volume goes back to 17.4–17.7 shots a team. Real attacks stall in front of the box and shoot from there; this one reaches the box (T411's finding), so the miss is in how often the ball stays in band 5, not in the shot choice there.

## 3. The keeper candidate on held-out seeds, stress case and MATCH-28's report

`kl6kc8` (arrHoldEZ60 + `keeperLeave` 6 + `keeperClear` 8) beside its control on every held-out read; the control's 1,200-match calibration concentration was re-run here and is identical to nx04's (`conc-ctl-calibration.json`, `msPerMatch` aside), so the default-off switches and main's later non-grid engine changes leave the base's results as nx04 measured them, and nx04's control stress files are reused.

Concentration, held-out seeds (`--seeds t689-val-1..4 --matches 2400`, all four world seeds):

| validation, 2,400 matches | goals / match | shots a team | hat-tricks / match | clubs 20+ | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST slot: shots an app., shot share, goal share | FW line goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---:|---|---:|---|---|---:|---|
| ctl (arrHoldEZ60) | 2.830 | 16.93 | 0.060 | 78 | 37.5% [36.4, 38.6] | 25.4% | 12.6 / 7.1% | 3.97, 35.2%, 45.4% | 57.2% | 1.91, 13.0% |
| kl6kc8 | 2.639 | 16.70 | 0.048 | 78 | 35.0% [34.5, 35.5] | 24.5% | 11.6 / 7.0% | 3.82, 34.3%, 43.4% | 55.4% | 1.90, 13.5% |

Band check (calibration seeds, 1,200 matches): ctl 22/37, kl6kc8 23/37; goal-area shots 14.7 → 11.9%, goals 2.92 → 2.72, shots 17.0 → 16.8, outside shots 10.4 → 10.6%, unopposed 8.3 → 8.2 a team; `an12kl6kc8` (the 12 m clear chance as well) 25/37 with shots 13.0, goals 2.46, goal-area 16.5%, outside 11.0% and, on 1,200 calibration matches, a club top-scorer share of 36.4% [35.5, 37.4] against kl6kc8's 34.6% [32.9, 36.3].

Striker stress case (`scripts/scoring-striker-stress.ts`, cf04-stress-val-1..3, 456 matches an arm; every record valid):

| variant | arm | goals / match | own goals / match | own shots | club top-scorer share [95%] | top scorer goals / 38 | largest / 38 | hat-tricks / own match | FW goals | star goals / 38 | star shots / match |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| arrHoldEZ60 (nx04) | normal | 3.11 | 1.63 | 17.7 | 42.2% [40.6, 43.8] | 26.1 | 38 | 0.053 | 63% | - | - |
| arrHoldEZ60 (nx04) | stress | 3.43 | 1.56 | 16.8 | 56.4% [52.9, 60.0] | 33.5 | 52 | 0.068 | 73% | 33.5 | 5.40 |
| kl6kc8 | normal | 2.70 | 1.37 | 17.5 | 39.3% [38.6, 40.0] | 20.1 | 35 | 0.031 | 60% | - | - |
| kl6kc8 | stress | 3.19 | 1.46 | 16.5 | 52.4% [50.9, 53.9] | 28.8 | 38 | 0.048 | 70% | 28.8 | 5.25 |
| an12kl6kc8 | normal | 2.56 | 1.28 | 13.4 | 37.9% [31.1, 44.7] | 18.4 | 36 | 0.035 | 61% | - | - |
| an12kl6kc8 | stress | 2.93 | 1.34 | 12.7 | 55.5% [53.9, 57.1] | 28.3 | 37 | 0.055 | 73% | 28.3 | 4.16 |

MATCH-28 core report (`grid-bands.ts --report --scale 0.25 --only core,tactics`, 17 conditions × 150 = 2,550 matches a partition; the control's calibration report is nx04's), rows whose status or value moved:

| core row (window) | ctl calibration | kl6kc8 calibration | ctl validation | kl6kc8 validation |
|---|---|---|---|---|
| goals a match (2.06–3.44) | 3.24 unresolved | 2.86 inside | 3.20 unresolved | 2.89 inside |
| shots a team (9.4–15.6) | 18.0 outside | 17.8 outside | 18.2 outside | 17.9 outside |
| goal-area / box / outside shots % | 14.9 / 74.4 / 10.7, all outside | 11.3 / 77.6 / 11.1, all outside | 14.2 / 75.4 / 10.4, all outside | 11.7 / 78.0 / 10.3, all outside |
| xG a shot (0.079–0.131) | 0.086 inside | 0.079 unresolved | 0.088 inside | 0.084 inside |
| penalty goals % (5.6–9.4) | 12.1 outside | 9.8 unresolved | 10.6 unresolved | 12.9 outside |
| goals by FW / MF % | 67.5 / 24.3 unresolved | 66.0 / 23.5 unresolved | 68.1 / 21.5 unresolved | 66.1 / 23.1 unresolved |
| back passes % (11.3–18.8) | 19.4 outside | 19.4 outside | 19.3 outside | 19.3 outside |
| rows inside / outside / unresolved (of 38) | 17 / 10 / 11 | 19 / 9 / 10 | 19 / 9 / 10 | 20 / 10 / 8 |
| MATCH-29 bands inside / outside / insufficient / unresolved; orderings hold / fail | 2 / 0 / 18 / 2; 9 / 2 | 2 / 0 / 18 / 2; 9 / 2 | 2 / 2 / 16 / 1; 10 / 2 | 1 / 0 / 19 / 1; 10 / 2 |
| invariant and full-record failures (17 conditions) | 0 | 0 | 0 | 0 |

Readings: on held-out seeds the keeper fix lowers the club top-scorer share 37.5% [36.4, 38.6] → 35.0% [34.5, 35.5], hat-tricks 0.060 → 0.048 (inside 0.02–0.05) and the striker slot's goal share 45.4 → 43.4%, and on the stress case the normal arm's top scorer 42.2 → 39.3% and the peak striker 56.4 → 52.4% (largest run 52 → 38) — the first stress-case movement in T689 beyond the control's interval on the normal arm. MATCH-28's core read brings goals inside on both partitions and the goal-area share from about 14–15% to 11–12%. Every other scoring row it misses stays missed (shots 17.8–17.9 a team, outside shots about 10%, box shots 78%, shot distance 11 m, back passes 19.3%), and the share stays above MATCH-23's 31.25% window. Adding the 12 m clear chance takes the volume rows inside but not the share (calibration 36.4%) nor the stress case (peak 55.5%).

## Gate

Unmet; no scoring source is committed. The best candidate, kl6kc8, is the first in T689 whose held-out concentration and stress case both move beyond the control's interval (club top-scorer share 37.5 → 35.0%, peak striker 56.4 → 52.4%), and it brings goals and hat-tricks inside, but it misses MATCH-23's club top-scorer row (35.0% [34.5, 35.5] against 20–30%, window to 31.25%), shots a team (17.9 against 11–14), outside shots (10% against 32–42%), the goal-area share (11–12% against 6–9%), box shots, shot distance and back passes; its two settings are resolution-side approximations no SSOT states. The experiment switches stay uncommitted in `analysis/cv04-source.patch` (nx04's included; `git apply --check` clean on fde988d5); the engine source is restored.

What the next attempt needs, from these measurements:

1. The keeper's open-play release as football: a keeper holding the ball after a save or a claim waits until the attackers near him have turned away (opponents retreat from a keeper with the ball in his hands) and chooses a lane by who can reach it at the kick, not at the decision — a timing and movement change in the engine's action loop (MATCH-12/17/31), measured with `scripts/scoring-regain-shots.ts`. Neither the keeper's choice (`safe`, `free`) nor his presser's stand-off (`keeperOff`) reaches it; the resolution-side switches halve the keeper-loss goals.
2. MATCH-16's "nobody within 5 m" clear chance: about half of all shots (8 a team a match, 9% conversion, against real football's one big chance a team) come from it. Holding it to 12 m of goal brings shots, xG a shot, possessions ending in a shot and goals inside, but the shots it removes are midfielders' and the goal-area share rises; any change is an update-ssot of MATCH-16 first, and it needs a companion that gives midfielders the chances it takes away.
3. Outside shots and box entries: the ball stays in band 5 too little for shots from distance (T411); no shot-choice knob reaches 32–42%.

## Limits

- Timing: measurements ran 11:40–12:17Z of the 11:36–13:36Z window; the rest was not spent on more screens, as the remaining levers (the keeper's release timing, MATCH-16's clause, how often the ball stays in front of the box) are engine or SSOT changes, not settings a screen can try. This is not two hours of measurement.
- Band checks are 400 matches (1,200 for the three in §3) on the calibration seeds: a row near its window's edge flips within noise, and "rows inside" counts the band check's pass/fail, not MATCH-28's statuses with intervals.
- Calibration concentration is 1,200 matches on 2–3 of four world seeds (seed-cluster intervals over 2–3 clusters, normal approximation); the held-out read is 2,400 matches and its interval is still over at most four seed clusters, so a decrease there is an observed change in these cases, not population-level significance.
- The stress case is fixed-squad (fitness reset each match, no season), three seeds, normal-approximation intervals over three values.
- The regain diagnostic is 120 observed matches a variant (matches 600–719), counts only the shot immediately after the opponent's action, and reads the loser's slot at kick-off (substitutes as SUB).
- `keeperClear` and `keeperLeave` are resolution-side approximations of a keeper who releases the ball only once nobody stands on him; they do not move players or delay the release, and MATCH-31/MATCH-12 state no such rule yet. `within` and `alone 0` change a clear chance MATCH-16 defines; none of these could ship without an update-ssot.
- No whole-career season, MATCH-29 verdict beyond the 150-match tactics family, or proof that every knob is read on revision 10 beyond the preload's existence check.
