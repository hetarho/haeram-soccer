# T689 scoring — 261104 cv04-att (an entry worth its chance, MATCH-16 r50, a bounded window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-box's Next 1, now a rule: MATCH r50 (MATCH-16) weighs a pass or carry from in front of the box into it by the chance it leads to — its receiver or the carrier arriving able to shoot or set one up, facing goal with no defender goal-side within reach — never by its cell's threat value, and without such an entry the carrier shoots from distance with a view of goal, plays it wide or recycles. This window: **from 20:04Z**, bounded at the earlier of 22:04Z and 22:30Z, on `codex/cv04` at 163f0a0a (Apple M1 Max, 10 cores, at most 6 measurement workers at once). Measurements ran 20:08–21:00Z and then closed: the rule's choice alone moves box entries 32.0 → 28.3 a team; with fewer passes to a man already past the line they reach 24–25, and two candidates earned the full read, which both fail. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`B`, copied from cv04-box's candidates beside cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on `B`, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-box's patch re-applied (`git apply` clean on 163f0a0a); this window's switch, uncommitted in `analysis/cv04-att-source.patch` with every earlier switch (`git apply --check` clean on 163f0a0a; the engine source is restored):

- `DECISION_CONFIG.candidate.entry` (`from` 0 = off; `reach`, `carry`, `pass`, `ref`, `through`, `lead`, `rest`): from at least `from` m up, outside the box and not in a clear chance, a carry heading or a pass ending in the box is worth the chance at its arrival — `chanceXg` there (MATCH-11's shot quality), 0 when an opposing outfielder stands goal-side of the arrival point within `reach` m — never its cell's xT: a carry heading scores (chance − the carrier's cell xT) × 100 × `carry` (`chooseCarry`), a pass the same at the pass gain's weight less `pass` × (1 − chance / `ref`, at least 0) (`passOptions`). `through` reads a ball in behind where it lands (`throughPoint`), `lead` a moving receiver `lead` s along his velocity. `rest` (`worth` 0 = off; `shot`, `view`, `pass`, `carry`): with no entry worth `worth` — no teammate in the box within pass reach, nor the carry straight at goal, arriving with that chance — his shot weight × `shot` when at least `view` of the shot's path is unblocked, his pass and carry weights × `pass` and `carry` (`actionMix`).

Default-off identity: `Bid` (`B` unchanged) reproduces cv04-box's `B` diagnostic on the 200 matches from 0 byte for byte (the report's `patch` path aside), and its 4-match smoke run (`jobs/smoke.json`) cv04-box's smoke file likewise. Candidates written before `through` and `lead` existed were regenerated with them at their default 0; the reads are those of the files as measured.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs`, each with its `.status.json`): cv04-box's diagnostic `scripts/scoring-box-entries.ts --start S --matches 200` (`entries/*.json`), summarised by `analysis/table.mjs` (one row a candidate; `box:NAME` reads cv04-box's retained rows) and `analysis/rows.mjs` (one group's rows, per candidate); the band check `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, read by `../scoring-261104-cv04-ori/analysis/bands.mjs`; `B`'s is cv04-ori's); the full read with the earlier windows' scripts and summarisers (`../scoring-261104-cv04/analysis/summary.mjs`, `stress.mjs`, `../scoring-261104-cv04-sym/analysis/season.mjs`).

## 1. The entry by its chance (the diagnostic, 400 matches each beside `B`)

| read | matches | shots a team | goals a match | box entries a team | entering possessions | carry / short / in behind | behind the deepest % | <2 goal-side % | <2 in the box % | shot follows % |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| B | 400 | 13.11 | 2.30 | 32.03 | 22.70 | 11.8 / 8.4 / 8.4 | 50.0 | 67.5 | 43.3 | 39.9 |
| ctl | 200 | 16.91 | 2.90 | 32.99 | 23.39 | 12.8 / 8.8 / 8.2 | 51.1 | 66.8 | 43.7 | 48.8 |
| Bid | 200 | 13.42 | 2.36 | 32.26 | 22.84 | 12.0 / 8.5 / 8.5 | 50.0 | 67.1 | 43.2 | 40.5 |
| e4 | 400 | 13.47 | 2.43 | 32.00 | 22.75 | 11.4 / 7.8 / 9.3 | 52.0 | 68.4 | 43.0 | 41.2 |
| e4p2 | 400 | 13.30 | 2.35 | 31.78 | 22.67 | 11.6 / 7.5 / 9.2 | 52.5 | 69.2 | 44.2 | 41.1 |
| e4p4 | 400 | 13.55 | 2.41 | 31.45 | 22.63 | 11.6 / 7.2 / 9.0 | 53.0 | 69.3 | 44.9 | 41.9 |
| e6p2 | 400 | 13.46 | 2.35 | 30.94 | 22.37 | 10.9 / 7.0 / 9.5 | 54.0 | 69.8 | 44.9 | 41.8 |
| e4p2c2 | 400 | 13.55 | 2.34 | 31.82 | 22.80 | 11.7 / 7.3 / 9.3 | 52.7 | 69.6 | 44.7 | 41.7 |
| e4p2r2 | 400 | 13.48 | 2.26 | 31.73 | 22.66 | 11.5 / 7.5 / 9.3 | 52.8 | 69.2 | 44.1 | 41.0 |
| e4p2r3 | 400 | 13.63 | 2.26 | 31.75 | 22.67 | 11.5 / 7.5 / 9.2 | 52.7 | 69.3 | 44.1 | 41.1 |
| fa | 400 | 12.71 | 2.40 | 31.03 | 22.10 | 11.3 / 7.7 / 8.5 | 51.3 | 68.2 | 44.2 | 39.4 |
| e4p2fa | 400 | 13.02 | 2.33 | 30.54 | 22.10 | 10.9 / 6.8 / 9.2 | 53.8 | 70.4 | 45.2 | 41.3 |
| e6p4fa | 400 | 12.63 | 2.21 | 29.34 | 21.46 | 10.5 / 6.3 / 9.2 | 56.2 | 72.2 | 47.2 | 41.1 |
| e6p4t | 400 | 13.29 | 2.28 | 30.47 | 22.24 | 11.2 / 6.8 / 9.0 | 54.2 | 70.1 | 45.2 | 41.7 |
| e6p4tfa | 400 | 12.63 | 2.21 | 29.34 | 21.46 | 10.5 / 6.3 / 9.2 | 56.2 | 72.2 | 47.2 | 41.1 |
| e8p4tfa | 400 | 12.69 | 2.31 | 28.48 | 21.24 | 10.1 / 5.8 / 9.1 | 57.4 | 73.5 | 48.3 | 41.8 |
| e6p4tfar3w15 | 400 | 13.05 | 2.26 | 29.24 | 21.36 | 10.3 / 6.3 / 9.2 | 55.8 | 71.9 | 47.0 | 41.0 |
| e8p8fa | 400 | 12.80 | 2.31 | 28.29 | 21.20 | 10.2 / 5.4 / 9.0 | 58.1 | 73.6 | 48.4 | 42.6 |
| e8p8l1fa | 400 | 13.09 | 2.30 | 29.07 | 21.70 | 10.0 / 5.8 / 9.6 | 58.5 | 74.4 | 48.7 | 42.3 |
| e8p8l2fa | 400 | 13.37 | 2.33 | 29.77 | 21.99 | 9.8 / 6.5 / 9.8 | 58.3 | 74.1 | 48.2 | 43.0 |
| bk35e16e6p4fa | 400 | 10.84 | 2.27 | 30.63 | 21.96 | 10.5 / 8.2 / 8.3 | 46.7 | 64.6 | 21.9 | 35.0 |
| bk35e16e8p4fa | 400 | 10.81 | 2.36 | 29.95 | 21.77 | 9.9 / 7.9 / 8.6 | 48.2 | 65.6 | 22.5 | 35.3 |
| bk35e13e6p4fa | 400 | 10.61 | 2.33 | 32.07 | 22.69 | 10.6 / 10.2 / 7.8 | 35.6 | 51.8 | 18.1 | 34.0 |
| bk45e16e8p4fa | 400 | 10.98 | 2.60 | 31.76 | 22.90 | 10.4 / 9.2 / 8.5 | 44.9 | 63.0 | 16.0 | 34.2 |
| bk35e16e8p4c2fa | 400 | 10.86 | 2.27 | 29.85 | 21.74 | 10.1 / 7.8 / 8.5 | 47.3 | 65.2 | 22.6 | 35.7 |
| bk35e16e8p8fa | 400 | 10.90 | 2.33 | 29.53 | 21.52 | 9.9 / 7.6 / 8.4 | 48.9 | 66.4 | 23.0 | 36.4 |
| bk35e16e8p8l1fa | 400 | 11.04 | 2.42 | 29.93 | 21.73 | 9.7 / 8.1 / 8.4 | 48.7 | 66.5 | 22.9 | 36.3 |

Names: `e<reach>[p<pass>][c<carry>]` the `entry` switch at `from` 70, `ref` 0.1; `t` `through` 1; `l<s>` `lead` <s>; `r<shot>[w<worth>]` `rest` at `view` 0.5 (`worth` 0.08 unless named, ×100); `fa` cv04-ori's default-off `revision9.clear.far` 1 (beyond 20 m and outside the box only the nobody-ahead clause makes a clear chance, so a man alone out there is not sent at goal past the switch); `bk<from>e<edge>` cv04-box's `block`.

Readings:

- **Weighed by its chance, an entry is still made.** At its tightest (a defender goal-side within 8 m of the arrival takes its worth to nothing, 8 points off a weak pass) the choice takes entries 32.0 → 28.3 a team: front-of-box central entries 13.8 → 11.4, short passes in 8.4 → 5.4. By r50's own test most entries are worth their chance: they arrive with no defender goal-side within reach. At `e8p8fa` 14.1 of 28.3 end beyond the deepest defending outfielder — carries past the back line 6.8 and passes to men already past it 7.3 a team (`rows.mjs howBehind`), each free by definition.
- **Where the receiver lands** changes nothing: a ball in behind from in front of the box goes to feet (`through.depth` 88 m leaves no room behind the line), so `t` reads the same as without it (`e6p4tfa` = `e6p4fa`); reading a moving receiver where he arrives (`l1`, `l2`) adds entries (29.1–29.8).
- **On cv04-box's block**, which puts defenders goal-side in the box, the weighing takes back what the block added (35.9 → 29.5–32.1), not more: the passes to men in front of the deeper line still arrive free of a defender goal-side within reach.
- **The shot from distance** (`rest`) rarely applies while some teammate in the box arrives free (`r2`, `r3` at `worth` 0.08 read as without it).

## 2. The entries beyond the line, and goals back (400 matches each)

| read | matches | shots a team | goals a match | box entries a team | entering possessions | carry / short / in behind | behind the deepest % | <2 goal-side % | <2 in the box % | shot follows % |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| e8p8pp03fa | 400 | 11.45 | 2.10 | 25.14 | 18.98 | 9.5 / 5.5 / 6.6 | 55.1 | 72.2 | 46.8 | 42.2 |
| e8p8pp01fa | 400 | 10.36 | 1.91 | 22.76 | 17.31 | 9.1 / 5.6 / 4.7 | 52.4 | 70.8 | 45.8 | 41.5 |
| e8p8cp2n4fa | 400 | 11.89 | 2.12 | 27.02 | 20.31 | 9.3 / 5.4 / 8.8 | 56.3 | 72.6 | 47.8 | 40.9 |
| e8p8cp2n5fa | 400 | 12.01 | 2.25 | 26.90 | 20.18 | 9.1 / 5.4 / 9.0 | 56.7 | 73.1 | 48.0 | 41.0 |
| e8p8pp03cp2n4fa | 400 | 10.69 | 2.08 | 23.77 | 18.03 | 8.8 / 5.4 / 6.3 | 54.6 | 71.3 | 46.5 | 40.9 |
| e8p8pp03r3w15fa | 400 | 11.64 | 2.16 | 24.76 | 18.81 | 9.4 / 5.3 / 6.5 | 55.2 | 71.9 | 46.7 | 41.8 |
| e8p8pp03r5w15fa | 400 | 12.11 | 2.08 | 24.61 | 18.67 | 9.2 / 5.4 / 6.4 | 55.0 | 71.7 | 47.3 | 41.9 |
| e8p8pp03r3w30fa | 400 | 11.82 | 2.12 | 24.61 | 18.69 | 9.3 / 5.4 / 6.4 | 55.1 | 71.9 | 46.9 | 41.8 |
| e8p8pp03r5w30fa | 400 | 12.54 | 2.19 | 24.04 | 18.25 | 8.8 / 5.4 / 6.2 | 54.3 | 71.0 | 46.3 | 43.1 |
| e8p8pp03r5w30sp90fa | 400 | 12.54 | 2.28 | 24.06 | 18.30 | 8.9 / 5.4 / 6.2 | 54.1 | 71.0 | 46.6 | 43.0 |
| e8p8pp03r5w30a085fa | 400 | 12.72 | 2.42 | 24.93 | 18.75 | 9.2 / 5.6 / 6.6 | 53.9 | 70.6 | 45.8 | 42.9 |
| e8p8pp03r5w30a085o12fa | 400 | 12.60 | 2.26 | 24.42 | 18.53 | 9.3 / 5.3 / 6.4 | 54.4 | 70.9 | 46.3 | 43.2 |
| e8p8pp05r5w30sp90fa | 400 | 13.17 | 2.29 | 25.64 | 19.30 | 9.3 / 5.4 / 7.2 | 55.0 | 71.7 | 47.3 | 43.2 |

Band checks (`grid-bands.ts --candidate`, 400 matches; `B` cv04-ori's):

| candidate | shots | xG/shot | on target % | poss. → shot % | goal area % | outside % | distance m | goals | set-piece % | pen. % | headed % | FW % | MF % | DF % | corners | rows inside | unopposed (scored) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B | 12.98 | 0.08 | 26.12 | 15.94✗ | 17.42✗ | 11.44✗ | 10.14✗ | 2.39 | 21.13 | 8.58 | 20.50 | 64.75 | 24.06 | 11.19 | 4.50 | 29/37 | 5.50 (9.4%) |
| e8p8fa | 12.57 | 0.08 | 26.02 | 15.66✗ | 17.99✗ | 11.57✗ | 9.83✗ | 2.31 | 23.62 | 9.43✗ | 23.08✗ | 65.11 | 22.43✗ | 12.46 | 4.39 | 25/37 | 5.39 (9.7%) |
| bk35e16e8p8fa | 10.88 | 0.10 | 27.17 | 13.69 | 22.81✗ | 12.18✗ | 9.51✗ | 2.29 | 21.48 | 9.38✗ | 20.94 | 64.99 | 23.23✗ | 11.78 | 4.12 | 26/37 | 4.22 (12.6%) |
| e8p8pp03fa | 11.27 | 0.08 | 26.75 | 14.37 | 18.15✗ | 11.63✗ | 9.96✗ | 2.23 | 22.76 | 9.19 | 22.20✗ | 65.81 | 20.63✗ | 13.57 | 4.01 | 24/37 | 4.81 (10.2%) |
| e8p8pp03cp2n4fa | 10.65 | 0.08 | 25.93 | 13.52 | 17.69✗ | 12.37✗ | 10.12✗ | 1.90✗ | 25.73 | 9.23 | 24.27✗ | 69.00✗ | 20.18✗ | 10.82 | 3.76 | 25/37 | 4.42 (9.3%) |
| e8p8pp03r5w30fa | 12.43 | 0.08✗ | 25.95 | 15.76✗ | 15.72✗ | 22.33✗ | 11.68✗ | 2.22 | 22.72 | 9.45✗ | 21.26✗ | 63.89 | 21.93✗ | 14.17 | 4.36 | 25/37 | 4.68 (10.4%) |
| e8p8pp03r5w30sp90fa | 12.48 | 0.08 | 26.33 | 15.80✗ | 15.52✗ | 22.71✗ | 11.75✗ | 2.42 | 28.78 | 8.70 | 28.05✗ | 63.56 | 19.25✗ | 17.08✗ | 4.42 | 26/37 | 4.70 (10.2%) |
| e8p8pp03r5w30a085fa | 12.55 | 0.08 | 25.82 | 15.83✗ | 14.99✗ | 21.45✗ | 11.73✗ | 2.27 | 23.19 | 8.35 | 22.31✗ | 63.30 | 23.30✗ | 13.41 | 4.40 | 27/37 | 4.78 (9.9%) |
| e8p8pp03r5w30a085o12fa | 12.35 | 0.08 | 25.85 | 15.57 | 15.34✗ | 20.99✗ | 11.69✗ | 2.28 | 23.77 | 7.89 | 23.44✗ | 62.76 | 23.77✗ | 13.47 | 4.40 | 27/37 | 4.82 (10.5%) |
| e8p8pp05r5w30sp90fa | 13.05 | 0.08✗ | 25.17 | 16.45✗ | 15.28✗ | 21.74✗ | 11.63✗ | 2.26 | 29.72 | 5.52✗ | 28.07✗ | 63.76 | 21.44✗ | 14.81 | 4.62 | 24/37 | 5.00 (9.8%) |

Offsides a team: `B` 1.62, `e8p8fa` 1.68, `e8p8pp03fa` 1.34✗ (possessions 71.25✗), the `r5w30` reads 1.38–1.42, `o12` 1.99.

Names: `pp<x>` the prior of a pass to a receiver already past the offside line as it is played (`DECISION_CONFIG.candidate.past.prior`, 1 in `B`) ×0.<x>; `cp2n<m>` cv04-box's `carryPath` (an unpressed carry stops 2 m short of the first opposing outfielder within <m> m of its path); `sp90` a set piece's header quality 0.9 (`B` 0.7); `a085` the shot model's `a` −0.85 (`B` −1); `o12` MATCH-18's offside call `base` 0.12 (`B` 0.08).

Readings:

- **The passes to a man already past the line carry the volume the choice leaves.** `pp03` takes passes in behind 9.0 → 6.6 and entries to 25.1 (`pp01` 22.8): the decision's `through` kind is mostly a ball to a teammate standing past the line whom MATCH-18's draw lets stand, while the record's through balls (MATCH-13) are 0.79 attempted a team on `B`'s core read (MATCH-30 2.0–2.2). With fewer such receptions offsides fall to 1.34 a team.
- **Fewer entries, fewer goals**: 2.10 (`pp03`), 1.91 (`pp01`), 2.08–2.12 with the carry stopped by a man on its path (`cp2n4`, which also takes entries to 27.0 alone).
- **The shot from distance** at `worth` 0.3 and `shot` ×5 (`r5w30`) doubles the outside share, 11.4 → 21.0–22.7% (MATCH-23 32–42%), shots 11.3 → 12.4–12.6 a team, entries 24.0, goals 2.19–2.22.
- **Goals back**: a set piece's header (`sp90`) or the shot scale (`a085`) bring goals to `B`'s level — `sp90` 2.28 / 2.42 on the two reads (`B` 2.30 / 2.39), `a085` 2.42 / 2.27, 2.35 and 2.35 pooled against `B`'s 2.35. These two meet the window's bar for the full read on the pooled reads (entries at most 26, goals at least `B`'s, outside shots rising); each read alone swings about ±0.15.

## 3. The full read (`e8p8pp03r5w30sp90fa`, `e8p8pp03r5w30a085fa`)

| read | `B` | `…sp90fa` | `…a085fa` |
|---|---|---|---|
| held-out 2,400 (four seed clusters): goals a match / shots a team | 2.44 / 13.27 | 2.25 / 12.62 | 2.27 / 12.85 |
| held-out: club top-scorer share [95%] | 32.8% [31.6, 33.9] | 33.5% [32.1, 34.9] | 33.1% [29.7, 36.5] |
| held-out: hat-tricks a match / ST goal share / top scorer's conversion against the rest's | 0.030 / 40.2% / 13.1 v 8.3% | 0.028 / 41.8% / 11.7 v 7.8% | 0.031 / 42.4% / 12.4 v 8.0% |
| season share, 100 club-seasons (ENG seeds 1–4, ESP 1) [95%] | 30.6% [29.2, 32.0] | 33.3% [31.4, 35.2] | 32.2% [30.6, 33.8] |
| stress case: normal squads' top scorer / peak striker | 35.1% / 47.6% | 34.2% / 54.8% [51.9, 57.7] | 34.4% / 49.8% [47.7, 51.8] |
| stress case: the star's 38-game run (largest) | 22.1 (30) | 27.7 (44) | 24.3 (39) |
| MATCH-28 core on validation (600 matches): MATCH-23 rows inside / outside / unresolved | 26 / 7 / 5 | - | 26 / 10 / 2 |
| core: every banded row inside / outside / unresolved | 41 / 12 / 6 | - | 37 / 18 / 4 |
| core: box entries / front-of-box entries / box shots a team | 32.57 / 55.85 / 12.15 | - | 24.82 / 57.10 / 10.38 |
| core: goals / possessions ending in a shot % / offsides / through balls attempted | 2.62 / 16.75 / 1.51 / 0.79 | - | 2.46 / 16.71 / 1.22✗ / 0.49 |

`B`'s held-out, season, stress and core reads are cv04-sym's (the same seeds and scripts). Both candidates fail on held-out seeds: goals fall 2.44 → 2.25–2.27, the club top-scorer share does not move (33.1–33.5%), the season share rises 30.6 → 32.2–33.3% and the stress case's star 47.6 → 49.8–54.8%. On the record the entries are where the diagnostic put them (24.8 a team on validation), but MATCH-28's core gains misses — take-ons 12.3, offsides 1.22, through balls, big chances unresolved at 0.69 — and front-of-box entries stay 57.1 (42.5–45.5). MATCH-29's press v counter was not read: the held-out read already fails the gate, so a 1,200-match-a-venue MATCH-29 read would decide nothing.

## Gate

Unmet; no scoring source is committed. MATCH r50's entry choice, implemented as the window's default-off switch, moves box entries 32.0 → 28.3 a team at its tightest: most of the engine's entries arrive with no defender goal-side within reach, half of them beyond the deepest defending outfielder, and are worth their chance by the rule's own test. Passing less often to a man already past the line takes them to 24–25, and with the shot from distance and a goal lever goals reach `B`'s level on the calibration reads, but on held-out seeds goals fall to 2.25–2.27, the share and the season share do not improve (33.1–33.5%, 32.2–33.3%), the stress case's star rises to 50–55% and MATCH-28's core loses four rows. `B` (cv04-sym) remains the best read with its misses unchanged. The switch stays uncommitted in `analysis/cv04-att-source.patch` with every earlier switch; the engine source is restored.

## Next

1. Fewer entries take goals with them and concentrate the rest: the scoring per entry is the gap — the rest of the box's conversion (3.5% on `B`, about a third of cf04's reference, cv04-ori) and big chances (0.69–0.77 a team), not the entry count. A rule for what makes a box chance (MATCH-11/35: the bodies, the keeper's narrowing, the receiver's control under a goal-side defender) is the planning question before more measurement.
2. The passes to a teammate already past the line (the decision's `through` kind, 7.3 entries a team on `e8p8fa`, while MATCH-13's through balls are 0.79 attempted) are a MATCH-16/18 question: whether the carrier plays to a receiver standing offside, whom MATCH-18's draw lets stand, and how often attackers stand there (MATCH-17/33).
3. As before: before any commit, gusta-update-ssot of every rule `B` changes (MATCH-11/12/16/17/18/32/33/34/35), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Limits

- Timing: the window ran from 20:04Z (bounded at 22:04Z); measurements 20:08–21:00Z (about 52 minutes: the entry screens 20:08–20:24Z, the beyond-the-line and goal screens 20:24–20:35Z, the full read 20:37–21:00Z), then the evidence. It closed early because the full read failed and the remaining levers are planning questions.
- The diagnostic and band checks are on the calibration seeds, 400 matches a candidate (`Bid` 200), goals swinging about ±0.15 at that size; the full-read bar was judged on the two reads pooled. Held-out reads 2,400 matches over four seed clusters (observed results for these seeds); the stress case fixed-squad, three seeds; the season read one season per takeover in 2024, own club only, ENG on four seeds and ESP on one; MATCH-28's core one condition on validation for one candidate; no MATCH-29 read.
- `rest`'s view is the shot path's unblocked share at the carrier's spot; `entry` reads defenders where they stand at the decision and the arrival at the receiver's spot (`lead` aside); the diagnostic's `pass-through` is the decision's kind, not MATCH-13's through ball.
