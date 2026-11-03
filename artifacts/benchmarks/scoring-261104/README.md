# T689 scoring on the released source — 261104 (nv04)

Measured on the released takeover source (main bc4f224e; worktree HEAD 2c8f2657, docs-only beyond it), match model `continuous-aggregate-10`, source fingerprint `6b3fd945f299118654a4b7b90071a7277b28deee793b1bb1b5e540d63536aa52` (scripts/lib/measurement-identity scope). M1 Max, 8 report jobs, ~160–190 ms a match. No engine source was changed; the first unit ran no scoring candidate (the second unit's candidates are below).

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

## bl03's candidates on the released source (second unit, 08:20–09:00 KST)

bl03's two validated behaviour settings, `room` and `earlySupport` (`candidates/*.json`, the JSON bl03's archive drives), played on the released source through a measurement preload, `scripts/scoring-candidate-patch.ts`: it applies the named JSON to the live engine configs before any match, every forked worker inheriting it, and throws on a setting the configs do not hold, so each knob named exists in the released source. No engine source changed (each run's computation fingerprint is the released one, `59438498`); the first two room files ran from an identical copy of the preload under `.tmp/`.

    env T689_PATCH_FILE=artifacts/benchmarks/scoring-261104/candidates/room.json \
      pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/grid-bands.ts \
      --report --partition validation --only core,tactics --jobs 8 --out ...

MATCH-28 report, core (equal top-tier) with the 16 tactic pairings; calibration 17 × 150, validation 17 × 600 matches, the same seeds as the released rows above:

| core row (band, tolerance window) | released cal / val | room cal / val | earlySupport cal / val |
|---|---|---|---|
| goals a match (2.6–2.9) | 4.03 / 3.83 out | 2.80 / 2.65 in | 2.74 / 2.68 in |
| shots a team (11–14) | 21.6 / 20.7 out | 17.5 / 16.6 out | 16.7 / 16.2 out |
| xG a shot (0.09–0.12) | 0.091 / 0.091 in | 0.079 unres. / 0.076 out | 0.083 unres. / 0.082 in |
| goal-area shots (6–9%) | 15.3 / 15.4 out | 10.5 out / 9.5 unres. | 12.2 / 12.2 out |
| box shots, rest of the box (48–58%) | 66.2 unres. / 66.4 unres. | 75.3 / 75.9 out | 77.2 / 77.1 out |
| shots from outside (32–42%) | 18.4 / 18.2 out | 14.2 / 14.6 out | 10.6 / 10.7 out |
| back passes (12–18%) | 16.9 / 16.9 in | 20.1 / 20.1 out | 20.0 / 19.9 out |
| goals by FW (50–60%) | 78.3 / 79.4 out | 74.0 / 76.1 out | 70.1 unres. / 73.7 out |
| goals by MF (27–37%) | 12.4 / 12.0 out | 16.0 / 13.6 out | 17.3 / 15.1 out |
| offsides (1.7–1.9) | 0.96 / 0.91 out | 0.50 / 0.44 out | 0.87 / 0.67 out |
| rows inside of 38 | 20 / 22 | 18 / 22 | 19 / 24 |
| hat-tricks a match (0.02–0.05) | 0.140 / 0.158 [0.129, 0.194] | 0.053 / 0.057 [0.040, 0.079] | 0.033 / 0.057 [0.040, 0.079] |
| club top-scorer share, clubs with 20+ goals (20–30%) | 38.8% (7) / 42.5% [40.1, 44.8] (56) | - (0) / 37.6% [34.4, 40.8] (41) | - (0) / 39.8% [36.7, 42.9] (39) |
| goals a match across the pairings (validation) | 2.44–6.33 | 1.80–4.17 | 1.84–4.76 |
| MATCH-29 inside / outside / insufficient (validation) | 7 / 10 / 8 | 11 / 7 / 7 | 8 / 3 / 14 |

Invariants hold in every run (no failures, no full-record failures). The calibration partition's 150-match conditions leave no club at 20+ goals once goals fall, so its share is unread there. Files: `candidate-room-calibration.json`, `candidate-room-validation.json`, `candidate-earlySupport-calibration.json`, `candidate-earlySupport-validation.json` (per-condition samples, seeds, targets, intervals, invariants, provenance), `candidate-room-concentration-calibration.json`, `candidate-room-concentration-validation.json`; the logs are gitignored.

Concentration split (`scripts/scoring-concentration.ts`, 1,200 matches, room only):

| partition | goals / match | shots a team | top scorer's goal share | his shot share | his conversion | the rest's | ST shots an appearance | CM shots an appearance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| calibration, released → room | 3.75 → 2.43 | 20.1 → 15.8 | 42.3% → 43.8% [26.9, 60.8] | 35.0 → 37.5% | 10.7 → 9.6% | 7.9 → 7.4% | 6.24 → 4.50 | 0.77 → 1.06 |
| validation, released → room | 3.65 → 2.35 | 20.2 → 15.8 | 44.4% → 43.2% [40.3, 46.2] | 32.6 → 28.5% | 12.2 → 11.4% | 7.3 → 5.9% | 6.22 → 4.44 | 0.74 → 1.05 |

Reading: both candidates bring the match total inside its band by taking chances away from everyone — fewer shots, a lower xG a shot, and the ones left pushed into the box (outside-the-box shots fall further from their band, box shots leave theirs) — with recycling back passes as a new miss. Midfielders shoot a little more, but the ST slot still takes 42–43% of the shots and the top scorer still converts 1.3–1.9× the rest of his side, so the club top scorer keeps 38–44% of the goals. Fewer goals do not spread them: the share needs the side's other players to reach scoring positions (MATCH-16's lines, MATCH-33's box occupation) rather than less volume for all. Neither candidate is a commit candidate: goals inside, but shots, shot places, line shares and the top-scorer share stay outside, with back passes, box-shot share and (room) xG a shot as material new misses.

## Gate

The owner's realism gate is unmet on the released source: goals, shot volume, shot places, line shares, hat-tricks and top-scorer share are all outside MATCH-23 on both partitions. No scoring source is changed or committed. bl03's room and earlySupport, re-run on the released source on both partitions, bring goals inside but leave shots, shot places, line shares and the top-scorer share outside with new misses, so neither passes. The owner-profile striker stress case and whole-career comparisons were not re-run here; bl03's (on identical grid code) stand.
