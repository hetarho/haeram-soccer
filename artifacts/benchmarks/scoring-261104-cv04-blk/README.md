# T689 scoring — 261104 cv04-blk (a body takes a chance down once, the place's usual bodies; MATCH r52, a bounded window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-chc's Next, now a rule: MATCH r52 (MATCH-35) has a body take a chance down once — a man in the shot's path or closing it down acts through his block, never also through the chance's pressure — and, since a place's level counts its blocked shots, a chance with the bodies its place usually holds keeps that level over its blocks and the keeper together, while the keeper stays set with a defender between and comes out only to a carrier with nobody between. This window: **from 21:56Z**, bounded at 22:30Z (the owner's stop), on `codex/cv04` at 41e6e667 (Apple M1 Max, 10 cores, at most 6 measurement processes at once). Measurements ran 21:58–22:09Z (about 11 minutes), then the evidence. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`B`), copied from cv04-att's candidates; `analysis/make-candidates.mjs` writes every candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-chc's patch re-applied (`git apply` clean on 41e6e667); this window's switches, uncommitted in `analysis/cv04-blk-source.patch` with every earlier switch (the engine source is restored), both in `resolveShot` (`grid/resolve.ts`) and read only when set:

- `SHOT_CONFIG.candidate.oneTake` (0 = off; MATCH-35 r52's first clause, the plan's (a)): a foot shot's pressure (MATCH-15's count within 4.6 m, one in front 1, behind ½, from the shooter where he strikes it) reads only the opponents who are neither in its path (`shotBlockers`) nor closing it (`closingBlockers`, 6 m), those acting through their block alone. Since the closing radius takes every outfielder within the pressure radius, only the keeper within 4.6 m is left as pressure; a header keeps its aerial duel's pressure.
- `SHOT_CONFIG.candidate.usual` (0 = off; the plan's (b), an unsourced screen setting): with at least one body in the shot's path, the chance before the blocks (and the keeper's part, `goalChance`) is the chance ÷ `usual`, the share of a shot from its place that usually gets through, capped at `maxXg`; the narrowing and a shot with nobody in its path (the 1v1) stay as `B` has them. No local copy of SB16's blocked shots by MATCH-14 cell exists in the repository, so `usual` was screened at 0.70–0.80 as the plan allows.

The shot-origin diagnostic gains two row kinds (`scripts/scoring-shot-origins.ts`, committed): `originPlaceBetween|origin|place|between|alone`, whether a defending outfielder stood within 6 m of the line from the shooter to the goal's middle and at least 3 m nearer the goal (the narrowing's `corridor` and `B`'s `ahead`) as the shot's entry was traced, and `originPlaceSituation|…|keeperOut|keeperSet|chased|free`, the same split by whether the keeper stood more than 3 m off his line and whether a defending outfielder was within 4.6 m of the shooter (round 3); `analysis/between.py` reads open-play conversion by place and by both splits. Every earlier row kind is unchanged (§ Verified).

Default-off identity: `Bid` (`B` unchanged) reproduces cv04-chc's `Bid` shot-origin file on matches 0–149 exactly (rows equal), and on 0–299 every one of cv04-ori's `B` rows (605 keys, its two 150-match files merged).

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs` — cv04-chc's with this window's paths — each with its `.status.json`): the shot-origin diagnostic `scripts/scoring-shot-origins.ts --start 0 --matches 300` (`origins/*.json`, summarised by `../scoring-261104-cv04-ori/analysis/origins.py` into `origins/summary.txt` and by `analysis/between.py` into `origins/between.txt`; `B`'s place rows are cv04-ori's first 300 matches, its split this window's `Bid` 0–299); the band check `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, read by `../scoring-261104-cv04-ori/analysis/bands.mjs`; `B`'s is cv04-ori's).

## 1. The box chance with r52's levers (shot origins, 300 calibration matches each)

Open play for the box and goal-area columns (penalties and direct restarts out, `origins.py`'s reading); "box" is the box beyond the goal area. The ST slot is the kickoff XI's (substitutes read SUB).

| read | on | shots a team | goals a match | box shots a team / conversion / xG a shot | goal-area conversion | corners' conversion | ST slot's share of goals (all / open play) |
|---|---|---:|---:|---|---:|---:|---|
| `B` (cv04-ori, 0–299; `Bid` reproduces it) | - | 13.32 | 2.32 | 7.99 / 3.1% / 0.029 | 22.0% | 20.5% | 31.1% / 38.9% |
| `t1` (`oneTake`) | `B` | 13.28 | 3.39 | 7.97 / 4.9% / 0.045 | 38.6% | 21.0% | 31.2% / 35.2% |
| `u75` (`usual` 0.75) | `B` | 13.26 | 2.91 | 7.95 / 4.2% / 0.035 | 26.7% | 27.2% | 29.3% / 37.3% |
| `u70` (`usual` 0.70) | `B` | 13.27 | 3.02 | 8.01 / 4.1% / 0.037 | 28.2% | 28.6% | 29.6% / 38.2% |
| `t1u75` | `B` | 13.25 | 3.75 | 8.00 / 5.6% / 0.056 | 41.1% | 26.3% | 30.4% / 34.8% |
| `t1u80` | `B` | 13.19 | 3.67 | 7.94 / 5.6% / 0.054 | 40.0% | 24.1% | 31.2% / 35.9% |
| `t1u75a135` (+ `shot.a` −1.35) | `B` | 13.19 | 3.46 | 7.85 / 5.4% / 0.046 | 38.0% | - | 31.1% / 35.7% |
| `u75a110` (+ `shot.a` −1.1) | `B` | 13.13 | 2.80 | 7.87 / 4.0% / 0.033 | 26.4% | 24.8% | 29.3% / 36.3% |

(a) lifts the goal area most: its shots are carriers with a chaser within the pressure radius (2.02 of `B`'s 2.08 open-play goal-area shots with nobody between, §2), whose chaser `B` takes off twice (pressure and closing block). (b) lifts the box's shots with a body in their path and every set piece's (corners 20.5 → 27–29%), and the ST slot's share of the goals falls a point or two, but neither nor both take the box beyond the goal area past 5.6%.

## 2. Why the box stops short: the shots with nobody between (`between.py`, the same files)

Open play here also leaves out a set piece's second phase (`between.py`), so its shot counts sit a little below §1's. "Alone": no defending outfielder within 6 m of the line to the goal's middle and 3 m or more nearer the goal as the shot's entry was traced.

| read | box alone: shots a team / conversion / xG a shot | box with a defender between | goal area alone | goal area with a defender between |
|---|---|---|---|---|
| `Bid` | 4.85 / 2.4% / 0.016 | 2.89 / 4.1% / 0.049 | 2.08 / 22.7% / 0.219 | 0.13 / 2.6% |
| `u75` | 4.84 / 2.3% / 0.018 | 2.91 / 6.8% / 0.063 | 2.04 / 27.5% / 0.262 | 0.11 / 7.8% |
| `t1` | 4.92 / 2.7% / 0.022 | 2.84 / 8.6% / 0.083 | 2.08 / 39.5% / 0.386 | 0.10 / 18.3% |
| `t1u75a135` | 4.86 / 2.9% / 0.021 | 2.79 / 9.5% / 0.088 | 2.09 / 39.0% / 0.390 | 0.11 / 17.9% |

The shots with nobody between, by the keeper (out: more than 3 m off his line) and a chaser (a defending outfielder within 4.6 m, MATCH-15's pressure radius), as their entries were traced (round 3's re-runs; shots a team / conversion / xG a shot):

| read | box: keeper out, chased | box: keeper set, chased | box: free (nobody within 4.6 m) | goal area: keeper set, chased | goal area: free |
|---|---|---|---|---|---|
| `Bid` | 2.34 / 1.7% / 0.007 | 2.28 / 3.2% / 0.024 | 0.23 / 1.5% / 0.023 | 2.02 / 21.9% / 0.209 | 0.06 / 51.4% / 0.575 |
| `u75` | 2.38 / 1.2% / 0.008 | 2.23 / 3.7% / 0.030 | 0.23 / 1.5% / 0.021 | 1.98 / 27.1% / 0.256 | 0.06 / 45.5% / 0.501 |
| `u75a110` | 2.33 / 1.3% / 0.007 | 2.25 / 3.6% / 0.027 | 0.25 / 1.4% / 0.021 | 1.98 / 26.4% / 0.254 | 0.06 / 47.2% / 0.489 |
| `t1` | 2.37 / 1.3% / 0.012 | 2.30 / 4.3% / 0.032 | 0.25 / 0.6% / 0.031 | 2.03 / 39.1% / 0.382 | 0.05 / 56.7% / 0.566 |

Nearly all of `B`'s box shots with nobody between are chased (4.62 of 4.85 a team): the carrier MATCH-16's clear chance sends to shoot with a man chasing from behind or beside, half of them against a keeper already out to him. Such a chance is taken down three times on `B` — the chaser as the chance's pressure, the chaser again as a closing block, and the keeper half of the way out with `B`'s 2 m reach — and keeps xG 0.007 with the keeper out, 0.024 with him set.

Five of every eight of `B`'s open-play box shots have nobody between, and they convert 2.4% at xG 0.016 — about a fifth of SB16's whole-box 11%, though a shot with nobody between is the box's best chance in real football — while those with a defender between convert 4.1%. r52's levers move only the second class: `usual` 0.75 takes it 4.1 → 6.8% and `oneTake` to 8.6%, the "alone" class staying at 2.3–2.9%. With the alone class held where `B` has it, the box reaches 7% only if the class with a defender between converts (0.07 × 7.74 − 0.024 × 4.85) / 2.89 ≈ 14.7%, above SB16's whole-box 11%: the gate's box conversion cannot come from the non-1v1 chance while `B` takes 4.85 box shots a team with nobody between at 2.4%. (a) also lifts the goal area's chances with nobody between 22.7 → 39.5% (their chaser no longer counts as pressure), which the plan's "1v1s convert no more than on `B`" rules out; (b) holds the box's alone class (2.3% against 2.4%) but lifts the goal area's 22.7 → 27.5%, since the engine's path (any body within 2 m of the shot's triangle, beside the shooter included) is wider than the diagnostic's corridor.

## 3. Band checks (`grid-bands.ts --candidate`, 400 calibration matches)

| candidate | shots | xG/shot | on target % | poss. → shot % | goal area % | outside % | distance m | goals | set-piece % | pen. % | headed % | FW % | MF % | DF % | corners | rows inside | unopposed (scored) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `B` (cv04-ori) | 12.98 | 0.08 | 26.12 | 15.94✗ | 17.42✗ | 11.44✗ | 10.14✗ | 2.39 | 21.13 | 8.58 | 20.50 | 64.75 | 24.06 | 11.19 | 4.50 | 29/37 | 5.50 (9.4%) |
| `u75a110` | 12.91 | 0.09 | 27.28 | 15.90✗ | 17.35✗ | 11.71✗ | 10.25✗ | 2.72 | 23.42 | 7.25 | 22.13✗ | 63.64 | 25.07 | 11.29 | 4.49 | 28/37 | 5.50 (10.6%) |
| `t1u75a135` | 12.80 | 0.12 | 28.69 | 15.89✗ | 17.66✗ | 11.81✗ | 10.29✗ | 3.30 | 16.89✗ | 6.67 | 15.83 | 64.39 | 27.27 | 8.33 | 4.31 | 28/37 | 5.46 (13.9%) |

`u75a110` holds goals at 2.72 with headed goals a new miss (22.1%, the set pieces' path bodies lifted with the rest); `t1u75a135` overshoots at 3.30 with unopposed chances scoring 9.4 → 13.9% and set-piece goals a new miss.

## 4. The concentration screen (`scoring-concentration.ts --matches 1200`, calibration)

| read | goals a match | shots a team | hat-tricks a match | club top-scorer share [95%] | top scorer's conversion v the rest's | ST slot's goal share | FW line's goals |
|---|---:|---:|---:|---|---|---:|---:|
| `B` (cv04-sym's file) | 2.35 | 13.13 | 0.031 | 34.7% [30.4, 39.0] | 13.1 v 8.3% | 40.5% | 54.3% |
| `u75a110` | 2.77 | 12.98 | 0.056 | 32.1% [32.1, 32.1] | 16.0 v 9.6% | 40.6% | 54.6% |

Read by `../scoring-261104-cv04/analysis/summary.mjs`. `u75a110` was screened for information though it fails the box gate (4.0%): it leaves the ST slot's share of the goals where `B` has it (40.6% against 40.5%) and raises hat-tricks 0.031 → 0.056 with more goals; its share interval collapses to one seed cluster with 20-goal clubs, so 32.1% against 34.7% is unresolved.

## Gate

Unmet; no scoring source is committed and no candidate earned the full read (MATCH-29, held-out, season share, stress case, MATCH-28 core): none takes the box beyond the goal area to 7% (best 5.4–5.6%, with goals 3.5–3.8), `oneTake` lifts the chances with nobody between (goal area 22.7 → 39.5%), and `usual` alone reaches 4.2% with goals 2.9 (4.0% at 2.72 once `shot.a` holds them). `B` (cv04-sym) remains the best read with its misses unchanged. The switches stay uncommitted in `analysis/cv04-blk-source.patch` with every earlier switch; the engine source is restored.

## Next

1. The box's volume is the chance with nobody between: 4.85 of `B`'s 7.74 open-play box shots a team, converting 2.4% at xG 0.016, far below the box's 11% — not real 1v1s but chased carriers (4.62 of the 4.85 have a defender within 4.6 m, beside or behind) whom MATCH-16's clear-chance rule sends to shoot, half of them against a keeper already out to them (xG 0.007), each chance taken down by its chaser as pressure, by the same chaser as a closing block and by the keeper half of the way out with `B`'s 2 m reach. Relieving their narrowing gives counter's chances behind press's line back (cv04-hold, cv04-sit, cv04-chc); scoring the others at their place's level cannot carry the box (§2). A planning question for MATCH-16/35 before more measurement: when a carrier with nobody between has a defender at his shoulder and a keeper already out to him, does he shoot from there, carry on, go round the keeper or square it — so that the box's chances with nobody between are fewer and real (MATCH-30's big chances, 0.80–1.05 a team), not 4.6 a team at a fifth of the box's level — and what the chaser and the keeper together take from such a chance once (r52's one take extended to the keeper's narrowing), with MATCH-29's counter, whose chances behind press's line are mostly these, measured beside it.
2. r52's two clauses read as switches: `usual` (b) is the safer half — it holds the box's alone class and spreads goals a little (ST slot's open-play share 38.9 → 37.3%) — but it lifts every set piece with it (corners 20.5 → 27%, headed goals past their window) and needs a sourced `usual` by place (SB16's blocked shots by MATCH-14 cell; no local copy) before it could ship; `oneTake` (a) as written lifts every chased chance, the 1v1's included, so r52's first clause needs the chased 1v1's pressure kept apart from its closing block if it is to hold MATCH-35's 1v1.
3. As before: before any commit, gusta-update-ssot of every rule `B` changes (MATCH-12/17/18/32/33/34; MATCH-11/16/35 beyond r52; `usual`'s source), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Verified

- `Bid` (`B` unchanged) reproduces cv04-chc's `Bid` shot-origin file on matches 0–149 exactly, and on 0–299 every one of cv04-ori's `B` rows (605 keys, merged from its two 150-match files) with the new switches off.
- `u75` and `t1` re-run with the diagnostic's new row kinds reproduce their first runs' rows exactly (the new `originPlaceBetween` rows added only); the third runs of `Bid`, `u75`, `t1` and `t1u75a135`, with the keeper/chaser rows, reproduce their second runs' rows exactly (the `originPlaceSituation` rows added only).
- `pnpm run typecheck` passed with the switches and the diagnostic change applied; the diagnostic passes `eslint` and `prettier --check`; the saved patch equals the applied engine diff (`cmp`), reverse-applies to restore the source and applies cleanly on 41e6e667 (`git apply --check`); and on the restored source `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` pass and `vitest --project unit --changed 41e6e667` finds no affected test (exit 0). No integration, contract or e2e run.

## Limits

- Timing: the window ran from 21:56Z (bounded at 22:30Z, the owner's stop); measurements 21:58–22:09Z (about 11 minutes: the shot-origin screens 21:58–22:00Z, the between split re-runs and band checks 22:01–22:03Z, the keeper/chaser re-runs and the concentration screen 22:04–22:09Z, on a host at load 20–32 from other processes), then the evidence. It closed with no candidate earning the full read.
- Shot-origin screens 300 calibration matches a candidate (`B` cv04-ori's first 300); round 1's files (`t1u75`, `t1u80`, `u70`, `Bid` 0–149) carry neither split, `t1u75a135`'s and `u75a110`'s place rows are their round-2/3 runs; kickoff-XI slots, the script's one-entry look-back; the between/alone split and the keeper/chaser split read positions as the shot's entry was traced, with the narrowing's corridor (6 m) and `B`'s `ahead` (3 m), not the engine's path test; band checks 400 matches (goals swing about ±0.15); the concentration screen 1,200 matches on 2–3 world seeds (the share's interval spans 12–22 points); no held-out, MATCH-29, season, stress-case or MATCH-28 read since no candidate earned it; `ctl` was not re-read (cv04-ori's rows stand).
- `usual` is a setting no source fixes (no local SB16 blocked-shot table by MATCH-14 cell); `oneTake` recomputes pressure from the shooter where he strikes the ball, while `B`'s pressure is the decision's tag.
