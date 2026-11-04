# T689 scoring — 261104 cv04-chc (a box chance at its place's level, the offside receiver; MATCH r51, a bounded window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-att's Next, now rules: MATCH r51 reads a chance's place level as real football's per-cell goal probability, which already holds a set keeper and the place's usual bodies, so the keeper's position moves a chance only by how it differs from a keeper set for that shot (MATCH-11/35), and the carrier weighs a teammate standing offside as a ball the flag may stop, more surely with better 판단력 (MATCH-16). This window: **from 21:10Z**, bounded at 22:30Z (the earlier of 23:10Z and the owner's stop), on `codex/cv04` at 456cff32 (Apple M1 Max, 10 cores, at most 6 measurement processes at once). Measurements ran 21:12–21:50Z, then the evidence. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`B`) and cv04-att's full-read candidate `e8p8pp03r5w30a085fa` (`E`: MATCH-16 r50's entry, `past.prior` 0.3, the shot from distance, `shot.a` −0.85), both copied from cv04-att's candidates; `analysis/make-candidates.mjs` writes every other candidate on them, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-att's patch re-applied (`git apply` clean on 456cff32); this window's switches, uncommitted in `analysis/cv04-chc-source.patch` with every earlier switch (the engine source is restored):

- `SHOT_CONFIG.revision9.narrow.ref` (0 = off) and `cap`: `keeperNarrowing`'s reference keeper stands `ref` m off his line toward the shot, on the line from his goal's middle (at most half the way), in place of one on his line's middle (MATCH-11/35 r51); with `ref` set the factor is at most `cap`.
- `SHOT_CONFIG.revision9.narrow.floor` (0 = off): the least the narrowing factor falls to — a keeper out to a carrier still beaten by a finish past him. Not named in the window's plan; added once `ref` alone left the carried box shots near nothing (§1).
- `DECISION_CONFIG.candidate.past.flag` (0 = off): a pass to a receiver past the offside line as it is played has its prior × (1 − `flag` × the carrier's 판단력/99), the 판단력 form of cv04-att's blind `past.prior` (MATCH-16 r51); paired with MATCH-18's call `base` so offsides hold.

Default-off identity: `Bid` (`B` unchanged) reproduces cv04-ori's `B` shot-origin file on matches 0–149 exactly (the report's `patch` path aside).

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs`, each with its `.status.json`): the shot-origin diagnostic `scripts/scoring-shot-origins.ts --start 0 --matches 300` (`origins/*.json`, summarised by `../scoring-261104-cv04-ori/analysis/origins.py` into `origins/summary.txt`; `B`'s rows are cv04-ori's first 300 matches); the band check `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, read by `../scoring-261104-cv04-ori/analysis/bands.mjs`; `B`'s and `E`'s are cv04-ori's and cv04-att's); the concentration screen `scripts/scoring-concentration.ts --matches 1200` and the full read with the earlier windows' scripts and summarisers (`../scoring-261104-cv04/analysis/summary.mjs`, `stress.mjs`, `../scoring-261104-cv04-sit/analysis/tactics.mjs`, `core.mjs`, `../scoring-261104-cv04-sym/analysis/season.mjs`).

## 1. The box chance by the keeper's reference (shot origins, 300 calibration matches each)

Open play only for the box and goal-area columns (penalties and direct restarts out); "box" is the box beyond the goal area. The ST slot is the kickoff XI's (substitutes read SUB).

| read | on | shots a team | goals a match | box shots a team / conversion / xG a shot | goal-area conversion | ST slot's share of goals (all / open play) |
|---|---|---:|---:|---|---:|---|
| `B` (cv04-ori, 0–299) | - | 13.32 | 2.32 | 7.99 / 3.1% / 0.029 | 22.0% | 31.1% / 38.9% |
| `Eid` | `E` | 12.80 | 2.40 | 6.63 / 4.0% / 0.029 | 24.3% | 28.5% / 37.8% |
| `r2` (`ref` 2) | `B` | 13.39 | 2.62 | 7.99 / 4.3% / 0.043 | 24.4% | 31.9% / 37.9% |
| `r2c1` (`ref` 2, `cap` 1) | `B` | 13.41 | 2.48 | 8.00 / 3.3% / 0.030 | 24.6% | 31.5% / 38.6% |
| `r3c15` (`ref` 3, `cap` 1.5) | `B` | 13.52 | 2.69 | 8.04 / 4.5% / 0.043 | 25.1% | 30.9% / 36.3% |
| `r2rc15` (`ref` 2, `reach` 1.5) | `B` | 13.24 | 2.91 | 7.95 / 4.8% / 0.048 | 31.2% | 30.3% / 35.0% |
| `fl05` (`flag` 0.5, call `base` 0.10) | `B` | 12.81 | 2.36 | 7.50 / 3.5% / 0.029 | 22.9% | 33.0% / 40.2% |
| `f4` (`floor` 0.4) | `B` | 13.31 | 2.73 | 8.01 / 5.8% / 0.057 | 22.8% | 32.4% / 36.6% |
| `r3c15f3` (+ `floor` 0.3) | `B` | 13.35 | 2.90 | 7.96 / 6.1% / 0.060 | 25.4% | 32.4% / 36.3% |
| `r3c15f5` (+ `floor` 0.5) | `B` | 13.47 | 3.27 | 8.04 / 7.8% / 0.072 | 26.2% | 33.3% / 37.5% |
| `r3c1f4a115` (`cap` 1, `floor` 0.4, `shot.a` −1.15) | `B` | 13.28 | 2.82 | 7.98 / 6.0% / 0.058 | 25.2% | 29.9% / 32.1% |
| `r3c15f5a120` (`shot.a` −1.2) | `B` | 13.23 | 2.93 | 7.89 / 6.8% / 0.063 | 25.3% | 30.0% / 32.5% |
| `r3c15f6a130` (`floor` 0.6, `shot.a` −1.3) | `B` | 13.13 | 2.95 | 7.80 / 7.1% / 0.064 | 25.1% | 30.9% / 33.3% |
| `Er3c15` | `E` | 12.94 | 2.96 | 6.70 / 6.1% / 0.048 | 29.8% | 28.4% / 35.3% |
| `Er3c15f4` | `E` | 12.97 | 3.26 | 6.76 / 8.6% / 0.074 | 28.0% | 30.3% / 37.0% |
| `Er3c15f4a100` (`shot.a` −1.0) | `E` | 12.63 | 2.78 | 6.39 / 7.4% / 0.070 | 25.5% | 30.1% / 33.9% |
| `Er3c15f5a110` (`floor` 0.5, `shot.a` −1.1) | `E` | 12.47 | 2.66 | 6.22 / 7.4% / 0.071 | 27.0% | 32.7% / 38.7% |
| `Er3c1f5a110` (`cap` 1, `floor` 0.5, `shot.a` −1.1) | `E` | 12.47 | 2.63 | 6.22 / 7.0% / 0.069 | 27.1% | 31.6% / 37.6% |

- **MATCH r51's reference alone reaches about half the bar**: a set reference (`ref` 2–3 m) lifts the box's open-play conversion 3.1 → 4.3–4.8% and xG a shot 0.029 → 0.043–0.048, but lifts the goal area with it (22.0 → 24.4–31.2%) and goals to 2.6–2.9; capping it at 1 (no lift for a keeper less set than the reference) takes nearly all of it back (3.3%).
- **The box's own chances are carried 1v1s the keeper already covers**: on `B` the box's open-play shots are mostly the carrier's own (3.40 a team at xG 0.024) and balls in behind (2.04 at 0.017), against a keeper who comes half of the way out to a carrier running at him (`keeperOut` 0.5) and covers 2 m either side (`reach` 2): from 6–8 m he leaves almost none of the mouth, so no reference keeper changes the ratio. Only a floor on the factor (`floor` 0.3–0.6) moves the box to 6–8.6%, and with it goals to 2.7–3.3, which the shot model's `a` takes back proportionally across every place.
- Three candidates pass the screen (box at least 7%, goals 2.35–2.9), all on `E` with a floor and a lower `a`: `Er3c15f4a100`, `Er3c15f5a110`, `Er3c1f5a110`. On `B` no setting holds the box at 7% with goals at most 2.9 (`r3c15f6a130` 7.1% at 2.95).

## 2. The concentration screen and band checks (calibration, 1,200 and 400 matches)

| read | goals / shots a team | hat-tricks a match | club top-scorer share [95%] | top scorer's conversion v the rest's | ST slot's goal share | band rows inside | offsides a team |
|---|---|---:|---|---|---:|---:|---:|
| `B` (cv04-sym) | 2.35 / 13.13 | 0.031 | 34.7% [30.4, 39.0] | 13.1 v 8.3% | 40.5% | 29/37 | 1.62 |
| `E` (cv04-att, bands only) | 2.27 / 12.55 (bands) | - | - | - | - | 27/37 | - |
| `Er3c15f4a100` | 2.68 / 12.6 | 0.048 | 39.2% [33.3, 45.0] | 15.1 v 8.9% | 40.3% | 28/37 | - |
| `Er3c15f5a110` | 2.69 / 12.58 | 0.053 | 41.3% [30.4, 52.2] | 15.2 v 8.5% | 40.0% | 26/37 | - |
| `Er3c1f5a110` | 2.66 / 12.57 | 0.053 | 41.6% [30.8, 52.5] | 15.2 v 8.4% | 39.9% | 25/37 | 1.29✗ |
| `fl05` (bands only) | 2.34 / 12.31 (bands) | - | - | - | - | 28/37 | 1.96 |
| `Er3c1f5a110fl7` (bands only: `flag` 0.7 in place of `past.prior` 0.3, call `base` 0.12) | 2.84 / 13.02 (bands) | - | - | - | - | 26/37 | 2.14 |

The bands' xG a shot rises 0.08 → 0.10 (inside 0.09–0.12) and outside shots stay at `E`'s 22–23% (32–42%); goal-area shots 15.5–16.0% and possessions ending in a shot stay outside, and set-piece goals fall to 17.4–17.6% (20–28%). Only `Er3c1f5a110` puts the ST slot's goal share below 40% (39.9%), by a margin no 1,200-match read resolves; every candidate raises the club top-scorer share (39–42% against `B`'s 34.7%), hat-tricks (0.048–0.053 against 0.031) and the top scorer's conversion edge. By the window's bar `Er3c1f5a110` earned the full read.

## 3. The full read (`Er3c1f5a110`)

| read | `B` | `Er3c1f5a110` |
|---|---|---|
| held-out 2,400 (four seed clusters): goals a match / shots a team | 2.44 / 13.27 | 2.66 / 12.59 |
| held-out: club top-scorer share [95%] | 32.8% [31.6, 33.9] | 33.7% [32.0, 35.3] |
| held-out: hat-tricks a match / ST goal share / top scorer's conversion against the rest's | 0.030 / 40.2% / 13.1 v 8.3% | 0.048 / 41.0% / 14.1 v 9.6% |
| MATCH-29 press v counter, 1,200 matches a venue (calibration): press win share − counter's [95%] | −0.139 [−0.173, −0.105] | −0.364 [−0.396, −0.331] |
| press v counter: goals a match / hat-tricks a match | 2.74 / 0.048 | 3.45 / 0.105 |
| season share, 100 club-seasons (ENG seeds 1–4, ESP 1) [95%] | 30.6% [29.2, 32.0] | 30.9% [29.4, 32.4] |
| season: own goals for / against a match, top scorer's goals a 38-game season, ledger mismatches | 1.36 / 1.25, 15.8, 0 | 1.57 / 1.36, 18.1, 0 |
| stress case: normal squads' top scorer / peak striker | 35.1% / 47.6% | 33.3% [29.0, 37.6] / 48.8% [46.4, 51.2] |
| stress case: the star's 38-game run (largest) | 22.1 (30) | 26.7 (44) |
| MATCH-28 core on validation (600 matches): MATCH-23 rows inside / outside / unresolved, goals | 26 / 7 / 5, 2.62 | 23 / 8 / 7, 2.94 |
| core: box entries / front-of-box entries / box shots a team | 32.57 / 55.85 / 12.15 | 24.05 / 57.74 / 10.04 |
| core: offsides / through balls attempted / take-ons | 1.51 / 0.79 / - | 1.19✗ / 0.50 / 12.2✗ |

`B`'s held-out, season, stress and core reads are cv04-sym's, its press v counter cv04-sym's (the same seeds and scripts). The candidate fails every gate read: on held-out seeds goals 2.66 and shots 12.6 are inside, but the club top-scorer share rises 32.8 → 33.7%, hat-tricks 0.030 → 0.048 and the top scorer's conversion edge with them; MATCH-29's press v counter breaks (−0.36, press v counter matches at 3.45 goals), the season share holds `B`'s level (30.9% against 30.6%, its interval still past 31.25%) with more goals and an 18-goal top scorer, the stress case's star rises to 48.8% with a 44-goal largest run, and MATCH-28's core loses three MATCH-23 rows (core outside: back passes 20.8%, possessions ending in a shot 16.5%, the shot places, take-ons, throw-ins, offsides 1.19). The offside receiver does not repair MATCH-29: `Er3c1f5a110fl7` (`flag` 0.7 in place of `past.prior` 0.3, call `base` 0.12; offsides 2.14 a team) reads press v counter −0.360 [−0.392, −0.328] with 3.48 goals a match. No invariant or full-record failure in the core report, every stress record valid (0 invalid).

## Gate

Unmet; no scoring source is committed. MATCH r51's reference keeper, set off his line for the shot, lifts the box beyond the goal area from 3.1 to 4.3–4.8% (goals 2.6–2.9) but the goal area with it, since most box chances are carried 1v1s against a keeper half of the way out whom no reference changes. A floor under the narrowing takes the box to 7–8.6%, and on cv04-att's entry candidate with a lower `shot.a` goals hold at 2.63–2.78 — but every such candidate concentrates (club top-scorer share 39–42% on calibration, 33.7% held-out; hat-tricks 0.048–0.053), breaks MATCH-29 (press v counter −0.36: the floor gives back counter's 1v1s behind press's line, which cv04-sym's `reach` 2 had taken away) and loses MATCH-28 rows. `B` (cv04-sym) remains the best read with its misses unchanged. The switches stay uncommitted in `analysis/cv04-chc-source.patch` with every earlier switch; the engine source is restored.

## Next

1. The box's chance is the 1v1, and it is the striker's and counter's chance: any relief of the keeper's narrowing on a carrier running at him (a floor, `reach`, `ref` uncapped) lifts the striker's conversion and counter's goals before anyone else's. Real box conversion therefore needs box chances that are not 1v1s — receptions in the box with a defender near but not between, cut-backs (0.09 a team on `B`), second balls — at their place's level, with the 1v1 left where MATCH-35 puts it; a planning question for MATCH-11/35 (what the bodies and the blocks take from a box chance with a defender between, as `B` scores them at xG 0.045 for a pass received in the box) before more measurement.
2. The offside receiver (`flag`, MATCH-16 r51) holds offsides inside (1.96–2.14 a team with call `base` 0.10–0.12) without moving goals or the box, and does not take back counter's chances behind press's line once the narrowing is relieved (−0.360 against −0.364, §3): the 1v1's quality, not its count through offside receptions, carries the regression.
3. As before: before any commit, update-ssot of every rule `B` changes (MATCH-12/17/18/32/33/34; MATCH-11/16/35 beyond r51), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Limits

- Timing: the window ran from 21:10Z (bounded at 22:30Z); measurements 21:12–21:50Z (about 38 minutes: shot-origin screens 21:12–21:23Z, the concentration screens and band checks 21:24–21:31Z, the full read 21:31–21:48Z, the offside receiver's band checks 21:41–21:44Z and its press v counter read 21:44–21:50Z), then the evidence. It closed with the full read failed and the remaining lever a planning question.
- Shot-origin screens 300 calibration matches a candidate (`B` cv04-ori's first 300; `Bid` 150), kickoff-XI slots, the script's one-entry look-back; band checks 400 matches (goals swing about ±0.15); the concentration screen 1,200 matches on 2–3 world seeds (the share's interval spans 12–22 points); held-out 2,400 matches over four seed clusters (observed results for these seeds; hat-tricks have no interval); MATCH-29 press v counter only, calibration, 1,200 matches a venue; the season read one season per takeover in 2024, own club only (ENG seeds 1–4, ESP 1); the stress case fixed-squad, three seeds; MATCH-28's core one condition on validation.
- `ref` places the reference keeper on the line from the goal's middle at most half the way to the shooter; `floor` is a setting no SSOT states; `flag` reads the carrier's 판단력 only (the receiver's timing, MATCH-18's per-reception call, is the draw's); `ctl` was not re-read (cv04-ori's rows stand).
