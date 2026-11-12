# T689 scoring — 261104 cv04-ori (where the striker's goals come from, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-sym's Next 1: the striker slot's ~40% of the goals by where his chances come from, then who arrives there. This window: **19:03Z–21:03Z**, on `codex/cv04` at ad458d78 (Apple M1 Max, 10 cores, at most 6 measurement workers at once; other processes held the host's load average at 15–28). Measurements ran 19:03–19:29Z and then closed: the decomposition below puts the remaining lever in the defensive structure behind twice real football's box entries, which no setting or one-switch change reaches. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`candidates/sp70bx40s10rc20.json`, copied here as `B` beside cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-sym's patch re-applied (`git apply --check` clean on ad458d78); this window's one new default-off switch, uncommitted in `analysis/cv04-ori-source.patch` with every earlier switch (`git apply --check` clean on ad458d78; the engine source is restored):

- `DECISION_CONFIG.candidate.revision9.clear.far`: beyond `revision6.clear.shootFrom` (20 m) of goal and outside the box, only MATCH-16's nobody-ahead clause makes the carrier's clear chance; a man alone (nobody within `alone` m) with defenders ahead of him keeps his own shot/pass/carry choice and his recycling passes instead of carrying at goal (`takesClearChance`, so the decision mix, the pass filter and the carry heading alike; the recorded unopposed-chance flag is unchanged).

The default-off identity holds: `B`'s band check on this window's source (before `far` was added; `far` 0 evaluates exactly as before) reproduces cv04-sym's line for line (`ms a match` aside).

Candidate names: `f<v>` MATCH-16's clear-chance shot floor in the box `revision6.clear.shot` v/100 with `sharp` raised with it (0.6 / 0.85; `f80` 0.8 / 0.93, `f95` 0.95 / 0.99); `rc<v>` the keeper narrowing's `reach` v/10 m (`B` 2); `su<v>` MATCH-33's delivery weight for the ball suiting the runner's attributes `BOX_CONFIG.delivery.suit` v/10 (0.8), `fr<v>` for his arriving free `delivery.free` (1); `fa` this window's `far` switch on; `s12` the revision-4 volume scale 0.12 (0.1).

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs`, each with its `.status.json`): `scripts/scoring-shot-origins.ts --start S --matches 150` (`origins/*.json`, grid-bands pairs observed, summarised by the new `analysis/origins.py`); `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, `analysis/bands.mjs`, cv04-sym's with the shot-place rows); `scripts/scoring-concentration.ts --matches 1200` on its default calibration seeds (`conc-*-calibration1200.json`, cv04-hold's `analysis/conc.mjs`); `scripts/scoring-striker-stress.ts` (cf04-stress-val-1..3, cv04's `analysis/stress.mjs`); `analysis/collect.mjs` copies the band logs. Every stress record is valid (0 invalid in 912 matches).

## 1. The striker's goals by origin and place (`scoring-shot-origins.ts`, 600 matches of `B`, 300 of `ctl`)

The ST slot here is the kickoff XI's (substitutes read SUB: 14–15% of goals), so its shares sit below the concentration script's slot shares, which carry the substitute into the slot.

| read | shots a team | goals / match | ST slot: shots / goals | open play: goals in the goal area / box / outside | open-play conversion: goal area / box / outside | open-play xG a shot: goal area / box | ST's share of open-play goals: goal area / box / outside | of the ST's open-play goals from the goal area |
|---|---:|---:|---|---|---|---|---|---:|
| ctl (cv04) | 16.90 | 2.87 | 31.7 / 41.8% | 63.3 / 31.4 / 5.3% | 25.4 / 2.9 / 3.6% | 0.228 / 0.025 | 49.3 / 43.7 / 50.0% | 65.6% |
| B | 13.25 | 2.31 | 28.7 / 31.2% | 61.1 / 34.2 / 4.7% | 21.5 / 3.5 / 3.2% | 0.207 / 0.028 | 42.2 / 27.3 / 47.8% | 69.0% |
| fa | 12.82 | 2.38 | 28.7 / 31.5% | 64.7 / 30.2 / 5.2% | 23.9 / 3.4 / 3.7% | 0.215 / 0.028 | 40.2 / 28.3 / 50.0% | 70.1% |

`B` by origin (all shots; `analysis/origins.py`'s full output gives every origin × place × slot):

| origin | shots a team | share of goals | conversion | ST: share of its shots / goals | of the ST's goals |
|---|---:|---:|---:|---|---:|
| his own carry (`self-carry`) | 4.55 | 26.4% | 6.7% | 36.5 / 30.9% | 26.2% |
| corner (the delivered header) | 0.97 | 16.6% | 19.7% | 5.9 / 5.2% | 2.8% |
| through ball | 2.59 | 9.9% | 4.4% | 13.5 / 32.8% | 10.4% |
| his own take-on | 0.91 | 8.5% | 10.8% | 42.5 / 40.7% | 11.1% |
| pass | 1.43 | 7.6% | 6.1% | 25.0 / 21.0% | 5.1% |
| penalty | 0.12 | 7.2% | 68.5% | 45.9 / 49.0% | 11.3% |
| an opponent's pass run loose | 0.30 | 6.0% | 22.9% | 56.4 / 66.3% | 12.7% |
| cross | 0.85 | 6.0% | 8.2% | 42.8 / 47.0% | 9.0% |
| free kick | 0.69 | 5.9% | 9.8% | 13.3 / 8.5% | 1.6% |

Readings:

- **Goals sit in the goal area; the striker sits there.** On `B` open-play goal-area shots are 2.30 a team and carry 61% of the open-play goals at 21.5% conversion, while the rest of the box takes 7.97 shots a team at 3.5% (xG a shot 0.028), against cf04's reference conversions (goal area 0.30, box 0.11, outside 0.03 at a 7.5 / 53 / 37% place mix). The ST slot takes 42% of the goal-area goals but 27% of the box's, and 69% of his open-play goals come from the goal area.
- cf04's counterfactual on `B`: at that reference place mix and conversions, with the ST slot's own share of each place's shots (goal area 37.2%, box 28.0%, outside 42.8%) and every slot converting alike, his open-play goal share would be 32.0% against the actual 37.4% (`ctl` 35.5% against 47.6%): the place structure carries about five points on `B`, the allocation within each place the rest — less than on the released source (cf04: 57.3 → 47.0%), since `B` already spreads the box shots.
- No single origin carries the striker: his own carries (26% of his goals), an opponent's pass run loose (13%), penalties (11%), take-ons (11%), through balls (10%) and crosses (9%). His share of an origin's shots runs from 13.5% (through balls) to 56% (an opponent's pass run loose); the corner headers go to centre-backs (cv04-sym's `setPieceHeader`).
- Cut-back finishes are almost absent: 103 first-time shots from a delivered cut-back in 600 matches (0.09 a team, xG 0.05, 61 of them by CMs), although MATCH-13's cut-back counter reads 0.54 completed a team (inside its band): every delivery that reaches its runner is already struck first time (`resolveDelivery`), but the box scene rarely delivers to the spot or the edge and the box defence blocks what it does.
- `B`'s MATCH-28 core read on validation (cv04-sym, 600 matches) places the volume: **big chances 0.77 a team (0.80–1.05, inside its tolerance) and scored 0.44 (inside)**, but **box entries 32.6 a team (13–16) and box shots 12.1 (6.8–7.7)**, through balls 0.79 (2.0–2.2), possessions 73.8. The attack enters the box about twice as often as real football and shoots there 1.7 times as often at about a third of the reference conversion, so goals come from the chances carried into the goal area — the striker's.

## 2. Three levers on the decomposition (`grid-bands.ts --candidate --matches 400`, calibration seeds)

| candidate | shots | xG/shot | on target % | poss. → shot % | goal area % | outside % | distance m | goals | set-piece % | pen. % | headed % | FW % | MF % | DF % | corners | rows inside | unopposed (scored) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B | 12.98 | 0.08 | 26.12 | 15.94✗ | 17.42✗ | 11.44✗ | 10.14✗ | 2.39 | 21.13 | 8.58 | 20.50 | 64.75 | 24.06 | 11.19 | 4.50 | 29/37 | 5.50 (9.4%) |
| f80 | 13.80 | 0.08✗ | 25.89 | 16.88✗ | 15.64✗ | 11.34✗ | 10.47✗ | 2.40 | 24.17 | 8.44 | 23.75✗ | 64.27 | 21.35✗ | 14.38 | 4.75 | 26/37 | 5.96 (8.7%) |
| f95 | 14.36 | 0.07✗ | 25.50 | 17.56✗ | 14.48✗ | 11.32✗ | 10.68✗ | 2.35 | 23.80 | 8.50 | 22.21✗ | 65.25 | 21.68✗ | 13.07 | 4.84 | 26/37 | 6.39 (8.3%) |
| f95rc17 | 14.35 | 0.08✗ | 25.73 | 17.55✗ | 14.84✗ | 11.33✗ | 10.64✗ | 2.40 | 23.39 | 8.11 | 21.62✗ | 64.45 | 22.77✗ | 12.79 | 4.89 | 25/37 | 6.37 (8.5%) |
| f95rc15 | 14.29 | 0.08 | 26.16 | 17.39✗ | 15.33✗ | 11.30✗ | 10.58✗ | 2.55 | 22.37 | 6.48 | 20.71 | 65.06 | 22.77✗ | 12.17 | 4.89 | 27/37 | 6.31 (9.5%) |
| rc17 | 12.96 | 0.08 | 26.18 | 15.93✗ | 17.59✗ | 11.50✗ | 10.13✗ | 2.40 | 20.17 | 8.21 | 19.23 | 65.38 | 23.60✗ | 11.02 | 4.47 | 28/37 | 5.50 (9.8%) |
| su4 | 13.05 | 0.08 | 26.15 | 16.03✗ | 17.46✗ | 11.50✗ | 10.15✗ | 2.39 | 21.34 | 8.47 | 20.50 | 64.64 | 24.79 | 10.56 | 4.51 | 29/37 | 5.57 (9.6%) |
| su0 | 13.08 | 0.08 | 25.99 | 16.07✗ | 17.40✗ | 11.33✗ | 10.14✗ | 2.40 | 21.29 | 8.46 | 20.46 | 63.99 | 24.95 | 11.06 | 4.57 | 29/37 | 5.54 (9.5%) |
| su0fr2 | 13.07 | 0.08 | 25.85 | 16.06✗ | 17.51✗ | 11.11✗ | 10.11✗ | 2.37 | 21.52 | 8.23 | 20.78 | 63.19 | 25.11 | 11.71 | 4.59 | 29/37 | 5.57 (9.5%) |
| fa | 12.67 | 0.08 | 26.29 | 15.56 | 17.40✗ | 11.20✗ | 10.09✗ | 2.27 | 24.31 | 8.25 | 22.88✗ | 63.04 | 23.65✗ | 13.31 | 4.37 | 28/37 | 5.33 (9.2%) |
| fas12 | 12.98 | 0.08 | 26.31 | 15.96✗ | 17.49✗ | 11.88✗ | 10.18✗ | 2.34 | 22.89 | 8.45 | 21.39✗ | 65.35 | 23.32✗ | 11.34 | 4.48 | 27/37 | 5.42 (9.8%) |
| farc17 | 12.64 | 0.08 | 26.21 | 15.54 | 17.77✗ | 11.21✗ | 10.07✗ | 2.28 | 22.89 | 8.32 | 21.69✗ | 63.64 | 23.77✗ | 12.60 | 4.32 | 28/37 | 5.31 (9.6%) |

Concentration screens (`scoring-concentration.ts --matches 1200`, calibration seeds; the share's interval spans 3–14 points at this size, so only the ST slot's shares resolve) and the stress case:

| read | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST: shots an app., shot share, goal share | CM: shots an app., goal share |
|---|---:|---:|---:|---|---:|---|---|---|
| B (cv04-sym) | 2.35 | 13.1 | 0.031 | 34.7 [30.4, 39.0] | 24.9 | 13.1 / 8.3 | 2.91, 33.3, 40.5 | 1.70, 15.3 |
| su4 | 2.35 | 13.1 | 0.033 | 36.1 [29.0, 43.3] | 24.0 | 14.5 / 7.9 | 2.90, 33.2, 40.6 | 1.72, 14.8 |
| su0 | 2.34 | 13.1 | 0.031 | 36.1 [29.5, 42.7] | 23.8 | 14.6 / 7.9 | 2.90, 33.2, 41.0 | 1.71, 14.4 |
| su0fr2 | 2.33 | 13.1 | 0.033 | 33.5 [32.1, 35.0] | 22.6 | 14.0 / 7.8 | 2.90, 33.3, 41.2 | 1.71, 14.4 |
| fa | 2.40 | 12.8 | 0.030 | 36.0 [31.6, 40.5] | 24.4 | 15.2 / 8.2 | 2.92, 34.1, 41.5 | 1.58, 14.8 |

| variant | arm | goals / match | own shots | club top-scorer share [95%] | top scorer / 38 | largest / 38 | star's shots a match | FW goals |
|---|---|---:|---:|---|---:|---:|---:|---:|
| B (cv04-sym) | normal / stress | 2.52 / 2.76 | 13.8 / 12.8 | 35.1% [33.1, 37.2] / 47.6% [46.5, 48.7] | 17.6 / 22.1 | 27 / 30 | - / 3.93 | 58% / 67% |
| su0 | normal / stress | 2.55 / 2.81 | 13.9 / 12.8 | 35.4% [34.0, 36.7] / 48.0% [44.7, 51.2] | 17.8 / 22.3 | 27 / 31 | - / 3.94 | 57% / 66% |

Readings:

- **MATCH-16's clear-chance shot floor** (`f80`, `f95`): a carrier through on goal who strikes where the chance is rather than walking it in takes goal-area shots 17.4 → 14.5% and the mean distance 10.1 → 10.7 m, but his earlier shots meet `B`'s keeper narrowing (`reach` 2 m covers the whole mouth from 12–16 m once the keeper is half-way out), so shots rise to 14.4 a team, possessions ending in a shot to 17.6% and xG a shot below its window, forwards keep 64–65% of the goals and midfielders fall under theirs (21–23%); relieving the keeper (`rc15`) brings goals back (2.55) with the same shares.
- **MATCH-33's delivery weight** (`su4`, `su0`, `su0fr2`): taking the ball's suiting his attributes out of the runner's weight, or doubling his arriving free, moves nothing: the ST slot keeps 40.6–41.2% of the goals and the stress case's star 48.0% (3.94 shots of his side's 12.8) — the deliveries are not where the star's share comes from.
- **The `far` switch** (`fa`): an unpressed man alone 20–35 m out with defenders ahead no longer carries at goal; his own choice takes shots to 12.7 a team and possessions ending in a shot 15.94 → 15.56% (inside its window for the first time on `B`'s volume), but outside shots stay 11.2% — he passes rather than shoots from distance — and goals fall to 2.27 with the ST slot at 41.5% and midfielders under their window; the volume scale (`fas12`) or the keeper's reach (`farc17`) do not restore both.

## 3. A definition gap: own goals

The grid engine records no own goals: every goal is credited to a player of the scoring side (no own-goal fact in `packages/contracts` or the engine, and no SSOT names one). MATCH-23's season share is a real-football range whose denominator is a club's league goals, own goals included; Premier League seasons commonly record 25–40 own goals in about 1,000 goals (about 2.5–4%; an unsourced estimate — no repository source states it). Arithmetic context only, not a measurement and not a pass: if a share `r` of the goals were own goals with the total held, the top scorer's share would read ×(1 − r); at r = 3% `B`'s season share 30.6% [29.2, 32.0] would read 29.7% [28.3, 31.0] and its fixed-XI held-out share 32.8% [31.6, 33.9] 31.8% [30.7, 32.9]. Whether the engine should produce own goals (a deflection or a defender's touch into his own net, →MATCH-35) and how MATCH-27 attributes them is a planning question for gusta-update-ssot (MATCH-3, MATCH-23, MATCH-27), not a setting.

## Gate

Unmet; no scoring source is committed. The decomposition places the striker's share: goals concentrate in goal-area chances (61% of open-play goals), where the ST slot takes 42%, while rest-of-box shots convert at about a third of the reference rate and the attack enters the box twice as often as real football (MATCH-30's box entries 32.6 against 13–16, box shots 12.1 against 6.8–7.7); big chances themselves sit at real football's level. At the reference place mix that structure is worth about five points of the ST slot's open-play goal share (37.4 → 32.0%); the rest is who gets each place's shots. None of the three levers measured this window — the clear-chance shot floor, the delivery weight, the alone clause far out — moves the ST slot's 40.5–41.5% of the goals or the star's 48%; `B` (cv04-sym) remains the best read with its misses unchanged (held-out share 32.8% [31.6, 33.9], season share 30.6% [29.2, 32.0], possessions ending in a shot 16.8%, the stress case's star 47.6%). The `far` switch stays uncommitted in `analysis/cv04-ori-source.patch` with every earlier switch; the engine source is restored.

## Next

1. The box-entry volume (MATCH-30 box entries and box shots twice real football's, rest-of-box conversion about a third of the reference): a planned change to how the defending side denies entries and how the attack plays in front of a set defence (MATCH-16's carrier in front of the box, MATCH-17/32/34's block), T411's attacking-phase question, measured on MATCH-30's box entries and box shots, the open-play goal-area share of goals, the held-out share and the season share. It is beyond a switch: no setting moved box entries in T397, T408, T411 or this run. It is worth about five points of the ST slot's open-play goal share; the rest needs the box's shots shared more evenly (the striker slot takes 28% of them on `B`).
2. Own goals (§3): gusta-update-ssot on MATCH-3/23/27 — whether the engine produces them and how a season share counts them — before the share is judged against MATCH-23's real range.
3. Before any commit, as cv04-sym's Next 3: gusta-update-ssot of MATCH-16, MATCH-35, MATCH-12, MATCH-17/33, MATCH-18 and MATCH-11's set-piece header quality, then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Limits

- Timing: the window ran 19:03–21:03Z; measurements 19:03–19:29Z (about 26 minutes), then the evidence. They closed early because the remaining lever is a planned structural change, not a setting.
- Shot origins: 600 (`B`), 300 (`ctl`, `fa`) observed grid-bands matches on the calibration seeds; the slot is the kickoff XI's and substitutes read SUB; origins follow the script's one-entry look-back (a carry after a pass reads as `self-carry`).
- Band checks 400 matches on the calibration seeds (goals swing about ±0.15); concentration screens 1,200 matches (2–3 world seeds; the share does not resolve); the stress case fixed-squad, three seeds, one variant (`su0`); no held-out, MATCH-28/29 or season read for any candidate of this window, since none moved the ST slot.
- The core-report counters quoted for `B` are cv04-sym's (validation, one condition, 600 matches).
- The own-goal rate in §3 is an unsourced estimate; its arithmetic is context, not a result.
