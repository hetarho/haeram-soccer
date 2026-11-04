# T689 scoring — 261104 cf04 (the owner's completion request)

Run start 2026-11-04T00:42Z, 2 h timebox to 02:42Z, on the nv04 worktree (`codex/nv04`, HEAD 44db4d10, released grid source as in `../scoring-261104/README.md`), host hq-dev1-pve2-vm2 (Linux VM, 12 cores, load under 3 before the runs). This directory adds to `../scoring-261104/` (nv04's three units), which it leaves unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Source candidates needed two default-off experiment switches in the engine, kept uncommitted under `.tmp/cf04/cf04-source.patch` (the worktree's engine source was restored by reverse-applying it): `BOX_CONFIG.rotate` (`boxScene` pairs the posts and the spot with the nearest arriving forward, box-run midfielder or far-side winger, without the forwards' priority — bl03's `rotate` idea) and `SHAPE_CONFIG.run.channel` (a run in behind from a wide lane bends that share of the way to its half-space's middle, the channel between centre-back and full-back). With both off the engine plays the released football: the released stress arm and shot-origin rows were measured with the switches present and off, and were replayed on the restored source (see "Replay").

Every candidate is a JSON behaviour patch applied by `scripts/scoring-candidate-patch.ts` (it throws on a setting the configs do not hold); `candidates/` keeps them. `earlySupport` is nv04's (`../scoring-261104/candidates/earlySupport.json`); `rotEarly` = earlySupport + `box.rotate`; `rotOccupy` = nv04's occupy + rotate; `*Outside` = the released outside-the-box shot scale on top (`analysis/make-candidates.py`); `ch*` add `shape.run.channel`; `tight*` raise MATCH-16's tight-receiver term (`decide.candidate.revision9.tight`). Analysis helpers: `analysis/*.py`.

## 1. Concentration screens (`scripts/scoring-concentration.ts --matches 1200`, calibration seeds)

Grid-bands design (equal top-tier pairs, tactics rotated, both venues), the same 1,200 matches for every row; 1,200 matches reach only 2–3 of the four world seeds, so the top-scorer intervals (seed clusters) are wide and differences of a few points are noise. Band for the club top-scorer share: 20–30% (MATCH-23 tolerance window to 31.25%).

| candidate | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST slot: shots an app., share of all goals | LW goals share |
|---|---:|---:|---:|---|---:|---|---|---:|
| released (nv04, `../scoring-261104/concentration-calibration.json`) | 3.754 | 20.08 | 0.197 | 42.3% [37.1, 47.4] | 35.0% | 10.7 / 7.9% | 6.24, 53.8% | 6.4% |
| earlySupport (control, `earlyCtl`) | 2.607 | 15.70 | 0.073 | 40.8% [33.7, 48.0] | 29.5% | 14.3 / 9.0% | 4.24, 50.5% | 7.3% |
| rotEarly | 2.596 | 15.76 | 0.063 | 38.7% [33.4, 44.0] | 30.2% | 11.4 / 7.6% | 4.17, 49.7% | 6.3% |
| rotOccupy | 2.662 | 15.69 | 0.075 | 42.2% [36.0, 48.4] | 29.9% | 12.0 / 6.8% | 4.15, 49.1% | 6.6% |
| rotOutside | 2.634 | 16.45 | 0.076 | 41.0% [31.8, 50.2] | 30.4% | 11.1 / 6.7% | 4.42, 51.5% | 5.9% |
| occupyOutside | 2.603 | 16.45 | 0.075 | 41.8% [36.1, 47.4] | 30.2% | 10.7 / 6.5% | 4.54, 51.3% | 6.7% |
| chRel10 (released + channel 1) | 3.731 | 20.26 | 0.203 | 41.2% [35.6, 46.9] | 33.7% | 11.5 / 8.1% | 6.19, 53.3% | 7.0% |
| chEarly6 | 2.517 | 15.67 | 0.065 | 46.9% [37.5, 56.4] | 30.7% | 13.0 / 6.4% | 4.26, 50.3% | 5.8% |
| chEarly10 | 2.558 | 15.87 | 0.081 | 42.6% [32.5, 52.6] | 30.8% | 11.7 / 7.2% | 4.31, 51.7% | 6.8% |
| chRot10 | 2.601 | 15.71 | 0.073 | 40.3% [27.9, 52.7] | 29.6% | 11.0 / 7.3% | 4.16, 50.6% | 6.3% |
| chRotZones10 (released box zones) | 2.826 | 15.97 | 0.081 | 38.3% [22.2, 54.5] | 26.3% | 12.6 / 7.1% | 4.24, 50.2% | 6.6% |

MATCH-16's tight-receiver term (a receiver with an opponent within `mark` m from 75 m up scores `score` less; the carrier with room and only tight men in the box passes `pass` × as often), on earlySupport unless named; released values mark 2.5, score 0.6, pass 0.5, `revision10.kick.closed` 1.5:

| candidate | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest's conversion | ST slot: shots an app., share of all goals | LW goals share |
|---|---:|---:|---:|---|---:|---|---|---:|
| tightA (mark 4, score 1.5) | 2.417 | 14.82 | 0.061 | 45.5% [40.1, 50.9] | 31.1% | 12.4 / 6.6% | 3.99, 51.5% | 6.7% |
| tightB (mark 4, score 3) | 2.392 | 14.57 | 0.068 | 39.4% [33.3, 45.5] | 28.8% | 12.8 / 7.6% | 3.92, 49.5% | 6.2% |
| tightC (mark 5, score 3, pass 0.3) | 2.076 | 13.67 | 0.038 | 41.4% [31.1, 51.7] | 26.6% | 13.4 / 6.6% | 3.70, 51.0% | 6.3% |
| tightD (tightB + kick.closed 3) | 2.351 | 14.49 | 0.066 | 41.7% [35.2, 48.2] | 31.3% | 10.5 / 6.7% | 3.90, 50.8% | 6.1% |
| tightRel (released + mark 4, score 3) | 3.489 | 18.64 | 0.168 | 40.1% [30.5, 49.8] | 34.1% | 10.9 / 8.4% | 5.67, 54.2% | 5.7% |
| tightZones (tightB, released box zones) | 2.538 | 14.80 | 0.073 | 43.0% [42.7, 43.4] | 31.9% | 11.6 / 7.1% | 4.00, 50.8% | 6.0% |

A marked receiver near the box weighed as a poorer target takes passes and shots from everyone alike: shots fall 0.9–2.0 a team, the ST slot's shot share stays at 40.4–40.6% (45.7% on released) and the top scorer's share inside the noise.

Reading: neither the post assignment (`rotate`), box occupation, more outside shooting nor diagonal channel runs moves the striker slot: in every row it keeps 4.2 shots an appearance (6.2 at released volume), 40% of the shots and half of the goals, and the top scorer plays ST in all but at most one of each row's 69–76 clubs. Differences between rows sit inside the seed-cluster intervals.

## 2. Owner-profile striker stress case (`scripts/scoring-striker-stress.ts`, validation seeds)

`cf04-stress-val-1..3` (independent of every calibration seed), each × the four own tactics × normal/stress arm × 38 fixtures (opponent tactic rotating, venue alternating every four), 456 matches per arm and variant; normal arm squad strength 80, stress arm 75 with bl03's peak profile of the owner's retired striker at ST; fitness reset each match, so these are stress measurements, not season totals. Intervals over the three seeds. Invariants: every record passed `validateFullMatchRecord` and its scorer total against the score (0 invalid).

| variant | arm | goals / match | own goals / match | own shots | club top-scorer share [95%] | top scorer goals / 38 | largest / 38 | hat-tricks / own match | FW goals | star goals / 38 [95%] | star shots / match |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---|---:|
| released | normal | 3.97 | 1.97 | 21.8 | 41.2% [39.1, 43.3] | 31.9 | 62 | 0.094 | 65% | - | - |
| released | stress | 4.51 | 2.15 | 20.2 | 61.9% [61.1, 62.6] | 51.8 | 100 | 0.184 | 79% | 51.8 [47.6, 55.9] | 7.88 |
| earlySupport | normal | 2.72 | 1.47 | 16.8 | 43.5% [42.0, 44.9] | 24.8 | 48 | 0.057 | 64% | - | - |
| earlySupport | stress | 3.07 | 1.47 | 15.4 | 59.2% [56.6, 61.7] | 34.1 | 59 | 0.086 | 76% | 34.1 [32.2, 36.0] | 5.57 |
| rotEarly | normal | 2.69 | 1.40 | 16.5 | 41.4% [37.0, 45.8] | 22.6 | 42 | 0.031 | 63% | - | - |
| rotEarly | stress | 3.02 | 1.43 | 15.5 | 58.7% [57.1, 60.2] | 33.0 | 64 | 0.075 | 75% | 33.0 [31.0, 35.0] | 5.45 |

Reading: on the released source a peak striker takes 62% of his club's goals and 52 goals a 38-game run (up to 100), as bl03 measured on the older founding worlds (61%, 120). Lower volume (earlySupport, rotEarly) brings him to 33–34 a 38-game run, near the league top scorer's 22–32 band, but his share stays at 59% and the ordinary squads' top scorer at 41–44%; the 20–30% band is missed on every variant and arm.

## 3. Where the striker's shots and goals come from (`scripts/scoring-shot-origins.ts`)

Observed grid-bands matches (MATCH-7: the same result path), each shot classed by the slot of its shooter, its origin (the trace entry before it) and its place (goal area, rest of the box, outside). Files: `shot-origins-rotEarly-0-600.json` (matches 0–599, slot × origin and slot × place only), `shot-origins-rotEarly-600-840.json` and `shot-origins-released-600-840.json` (matches 600–839, with origin × place, read below). A penalty or direct restart has no shooter position in the trace (its place reads the ball after the kick), so the place rows below are open play: penalties and direct restarts (corners and free kicks struck or headed at once) left out, their second phases kept.

| open play, matches 600–839 | released | rotEarly |
|---|---:|---:|
| shots a team / goals a team | 17.8 / 1.32 | 14.1 / 0.85 |
| shot place goal area / rest of box / outside (all shots' band 6–9 / 48–58 / 32–42%) | 18.6 / 62.4 / 19.0% | 14.0 / 76.0 / 10.0% |
| conversion goal area / rest of box / outside | 26.2 / 3.2 / 2.6% | 25.8 / 2.6 / 4.6% |
| share of open-play goals from goal-area shots | 66.0% | 59.8% |
| ST slot's share of goal-area / box / outside shots | 55.9 / 42.7 / 51.7% | 54.5 / 35.1 / 46.0% |
| ST slot's goal-area goals: of all open-play goals / of his own | 40.5 / 70.7% | 32.0 / 61.8% |
| delivery finishes (`pass-cross`, all in or by the box): shots a team, xG a shot, conversion | 0.76, 0.085, 8.3% | 0.76, 0.012, 0.8% |
| shot straight after a won interception (`opp-pass:intercepted`): shots a team, conversion, share of all goals, ST's share of these shots | 0.84, 19.7%, 9.1%, 61% | 0.71, 19.9%, 11.1%, 65% |

The striker slot's goals (rotEarly, matches 0–599, share of all goals): own carry then shot 12.6%, the shot after a won interception or loose ball 9.8%, through ball 6.3%, penalty 4.6%, take-on 2.9%, set-piece second phase 2.0%. Wingers and attacking midfielders take 1–3 shots an appearance, mostly from the rest of the box at xG 0.02–0.06; a through ball to a CM or LW ends in a shot of xG 0.02 against the ST's 0.11.

Counterfactual (`analysis/counterfactual.py`, the same open play): the ST slot's open-play goal share is 57.3% (released; rotEarly 51.7%); giving every slot the same conversion per place leaves 52.0% (47.5%); also moving the place mix and conversions to real football's (goal area 7.5% at 0.30, box 53% at 0.11, outside 37% at 0.03) still leaves 47.0% (41.2%). So the chance structure (too many goal-area chances, box chances at a third of real conversion) adds about 10 points, but most of the concentration is allocation within each place: the striker slot takes 35–43% of the box shots and 55% of the goal-area shots.

Two side findings: earlySupport's delivery zones (near post 9 m, far post 11 m out) drop open-play cross finishes from xG 0.085 to 0.012, a material new regression the candidate family carries that its goal total hides; and the shot straight after a won interception is a tenth of all goals at 20% conversion, the striker taking 61–65% of them.

## Replay

After the switches were reverse-applied, the committed `scripts/scoring-striker-stress.ts` (seed `cf04-stress-val-1`, released) and `scripts/scoring-shot-origins.ts` (matches 600–679, released) replayed the retained released results exactly (8 of 8 stress rows, 497 of 497 shot-origin cells equal), so the released rows here were not moved by the default-off switches (`replay-*.json` against `stress-released-val-1.json` and `shot-origins-released-600-680-part.json`, `analysis/compare-replay.py`). Run times on this host: a 1,200-match screen 520–580 s with six in parallel, a 38 × 8 stress seed 180–197 s, 80 observed matches 46–94 s.

## Gate

Unmet. Goals reach the band only by lowering volume for all (earlySupport family), which leaves shots a team 15.7–16.5 (11–14), outside shots 9–11% (32–42%), FW goals 74–76% (50–60%) and the top scorer's share at 38–47% on fixed squads and 41–44% (normal) / 59% (peak striker) on the stress case; no screened lever (post assignment, occupation, outside shooting, channel runs, tight-receiver weighting) moves the striker slot's allocation beyond noise. No scoring source is committed; `.tmp/cf04` keeps the uncommitted source patch, drivers and logs.

What the next attempt needs, from these measurements: the striker slot's share of the scoring positions themselves (a third of box shots, half of goal-area shots, 60% of the shots after a high regain) — who is in the goal area and in behind when the chance comes — with the delivery finishes alive (released zones) so arrivals elsewhere can score; a config patch on any single lever above does not reach it, and fewer shots for everyone does not spread the goals.
