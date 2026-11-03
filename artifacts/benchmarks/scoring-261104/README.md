# T689 scoring on the released source — 261104 (nv04)

Measured on the released takeover source (main bc4f224e; worktree HEAD 2c8f2657, docs-only beyond it), match model `continuous-aggregate-10`, source fingerprint `6b3fd945f299118654a4b7b90071a7277b28deee793b1bb1b5e540d63536aa52` (scripts/lib/measurement-identity scope). M1 Max, 8 report jobs, ~160–190 ms a match. No engine source was changed; no scoring candidate was run in this session.

The grid football code is unchanged since bl03's b6c27406 (`git diff b6c27406 HEAD -- packages/engine/src/grid` touches tests and the testkit only; `match.ts` adds the owner's 승리의 부적 term, the pre-takeover results-only path and a strength refactor), so bl03's candidate measurements in `spec/reports/261103-bl03/scoring.md` still describe this football.

## MATCH-28 report, core and tactic pairings (`scripts/grid-bands.ts --report --only core,tactics`)

| partition | matches | core goals / match | core rows inside | hat-tricks / match (core) | club top-scorer share (core, clubs with 20+ goals) |
|---|---:|---:|---:|---:|---:|
| calibration (scale 0.25) | 17 × 150 = 2,550 | 4.03 | 20/38 | 0.140 [0.091, 0.215] | 38.8% [35.1, 42.5] (7 clubs) |
| validation (scale 1) | 17 × 600 = 10,200 | 3.83 | 22/38 | 0.158 [0.129, 0.194] | 42.5% [40.1, 44.8] (56 clubs) |

Core rows outside on the validation partition (band → value): goals 2.6–2.9 → 3.83; shots a team 11–14 → 20.7; possessions ending in a shot 10–15% → 23.3%; goal-area shots 6–9% → 15.4%; shots from outside the box 32–42% → 18.2%; mean shot distance 15–18 m → 11.9 m; goals by FW 50–60% → 79.4%, MF 27–37% → 12.0%; also throw-ins 8.4, goal kicks 10.9, offsides 0.91, red cards 0.06. MATCH-30: box shots 6.8–7.7 → 16.9, box entries 13–16 → 30.8, big chances 0.80–1.05 → 1.46. Invariants: no failures, no full-record failures. MATCH-29 (validation, 9,600 matches): 7 inside, 10 outside, 8 insufficient of 25.

Goals a match by pairing (validation, 600 each): every pairing with press 4.30–6.33 (press–press 6.33, press–balanced 5.56, press–possession 5.22, balanced–press 5.16, possession–press 4.97, counter–press 4.31, press–counter 4.30); possession/balanced pairings 3.36–3.65; pairings with counter and no press 2.44–2.95 (counter–counter 2.44). So the volume excess sits mostly where press plays; why (its high line, its regains, or what it concedes behind) is not measured here and is a lead for the next run.

Files: `released-calibration.json`, `released-validation.json` (per-condition samples, seeds, targets, intervals, invariants, provenance); the console logs are gitignored and their content is in these files. Concentration: `concentration-calibration.json`, `concentration-validation.json` (per club and per slot).

## Where the top scorer's share comes from (`scripts/scoring-concentration.ts`)

Grid-bands design (equal top-tier pairs, rating gap ≤ 2, the four tactics rotated by override, both venues, 2024), 1,200 matches per partition, clubs with 20+ goals. Intervals are over world-seed clusters; pairs are played in order, so 1,200 matches reach only the first 2–3 of the four world seeds (a limit of this design, shared with `grid-bands.ts` band mode).

| partition (world seeds) | goals / match | shots a team | top scorer's goal share | his shot share | his conversion | the rest's conversion | top scorer = top shooter | top scorer at ST |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| calibration (grid-bands-1..4) | 3.75 | 20.1 | 42.3% [37.1, 47.4] | 35.0% [33.0, 37.1] | 10.7% | 7.9% | 76/77 | 76/77 |
| validation (t689-val-1..4) | 3.65 | 20.2 | 44.4% [43.6, 45.1] | 32.6% [31.8, 33.4] | 12.2% | 7.3% | 76/77 | 76/77 |

By slot (validation): ST 6.2 shots an appearance, 46% of all shots and 54% of goals at 10.5% conversion; wingers 2.5–3.6 shots, AM 4.5, CM 0.7; centre-backs convert 19% (set-piece headers). In a single match the top shooter takes 39% of his side's shots.

Reading: the concentration is mainly allocation — one striker takes a third of his side's shots, inside an already doubled shot volume — and is then amplified by his better chances (goal-area shots, 15% of all against 6–9%), not by finishing skill beyond his chances. MATCH-16 places the remedy in where and how often each line gets the ball in scoring positions: fewer box entries ending as a striker's close-range shot and more midfield arrivals (MATCH-33's box occupation, which assigns the posts to forwards first), never a suppressed shot choice or a goal cap.

## Gate

The owner's realism gate is unmet on the released source: goals, shot volume, shot places, line shares, hat-tricks and top-scorer share are all outside MATCH-23 on both partitions. No scoring source is changed or committed. The owner-profile striker stress case and whole-career comparisons were not re-run here; bl03's (on identical grid code) stand.
