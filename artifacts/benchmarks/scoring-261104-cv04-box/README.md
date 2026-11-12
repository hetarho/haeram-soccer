# T689 scoring — 261104 cv04-box (where the box entries come from, a bounded window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-ori's Next 1: the box-entry volume (MATCH-30 box entries 32.6 a team against 13–16, box shots 12.1 against 6.8–7.7) as a structural change, not a setting. This window: **from 19:41Z**, bounded at the earlier of 21:41Z and 22:30Z, on `codex/cv04` at 7f51c615 (Apple M1 Max, 10 cores, at most 6 measurement workers at once). Measurements ran 19:42–19:55Z and then closed: the diagnostic and every structural switch below leave box entries at 30–38 a team, so no candidate earned the full read. Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`B`, copied from cv04-ori beside cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on `B`, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-ori's patch re-applied (`git apply` clean on 7f51c615); this window's three new default-off switches, uncommitted in `analysis/cv04-box-source.patch` with every earlier switch (`git apply --check` clean on 7f51c615; the engine source is restored):

- `SHAPE_CONFIG.candidate.block` (`from` 0 = off; `wide`, `edge`, `mid`): out of possession, with the ball at most `from` m from his goal and at most `wide` m off the centre line, a back-line man's shape place is at most `edge` m out and a midfielder's at most `mid` m — the back line holding the box's edge instead of standing `deepLine.behindBall` (4) m goal-side of a ball upfield (`shapePlace`, →MATCH-32/34).
- `DECISION_CONFIG.candidate.setDefence` (`set` 0 = off; `from`, `carry`, `pass`, `free`): a carrier outside the box at least `from` m up, not in a clear chance, with at least `set` opposing outfielders in the box, weighs a carry heading ending in the box `carry` xT points less and a pass into the box to a receiver with an opponent within `free` m `pass` less (`chooseCarry`, `passOptions`, →MATCH-16's carrier in front of a set defence).
- `DUEL_CONFIG.candidate.carryPath` (`stop` 0 = off; `near`, `from`): an unpressed carry ending at least `from` m up stops `stop` m short of the first opposing outfielder within `near` m of its path, where he meets the carrier (`resolveCarry`, →MATCH-11/16); the released carry is contested only when the carrier is pressed at its start.

Default-off identity: `Bid` (`B` unchanged) reproduces `B`'s 200-match diagnostic on the source before this window's switches byte for byte (the report's `patch` path aside), read twice: after `block` and `setDefence` were added (`jobs/s2.json`) and, after the measurements, with all three applied from the saved patch (`jobs/id.json`, the file kept here); the 4-match smoke run (`jobs/smoke.json`) gives the same 248 entries, 116 shots and 7 goals before and after `block` and `setDefence`.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs`, each with its `.status.json`): the new diagnostic `scripts/scoring-box-entries.ts --start S --matches 200` (`entries/*.json`), summarised by `analysis/entries.mjs` (rows by group) and `analysis/table.mjs` (one row a candidate). Every read is on the calibration seeds (grid-bands pairs, observed, all four tactics rotated, both venues). The committed script differs from the one measured only in its trace hook holding the tracer's entries array rather than the tracer (a lint fix); its smoke run reproduces the measured one exactly.

## 1. The diagnostic (`scripts/scoring-box-entries.ts`)

It reads MATCH-13's box entry exactly where `grid/record.ts` counts it: the tally's `movement` is wrapped, so every completed pass or carry ending in the box from outside it is read with the match state at that moment — how it was made (a carry, a restart, or the pass's decided kind; `pass-through` is the decision's kind, a pass to a runner in behind or a man past the line, not MATCH-13's through-ball classification), where it started, whether it ends beyond the defending side's deepest outfielder, the defending outfielders goal-side of the ball and in the box, the back line's mean depth, the possession's age, and what follows in the possession from the trace (a shot and its xG, a loss, a recycle out of the box, a restart). Its count agrees with the record: `B` 32.0 a team here, 32.6 in cv04-sym's MATCH-28 core read.

`B`, 400 matches (`ctl`, 200 matches, reads the same within a point everywhere):

| read | value |
|---|---|
| shots a team / goals a match | 13.11 / 2.30 (`ctl` 16.91 / 2.90) |
| box entries a team | **32.03** (`ctl` 32.99; MATCH-30 13–16) in 22.70 possessions, 1.41 an entering possession |
| made by | carry 11.8 (37%), short pass 8.4 (26%), pass in behind 8.4 (26%), cross 2.5 (8%), long 0.5, restart 0.4 |
| started | in front of the box centrally 13.8 (43%), in its half-spaces 9.3 (29%), on its flanks 3.0, beside the box 2.5, deeper 3.4 |
| ends behind the deepest defending outfielder | 50.0% (carries 6.8, passes in behind 6.7, short passes 1.7 a team) |
| fewer than two defending outfielders goal-side of the ball | **67.5%** |
| fewer than two defending outfielders in the box | **43.3%** |
| possession older than 30 s / under 8 s | 55.1% / 9.2% — settled attacks, not breaks |
| what follows first | a shot 33.5% (80% of the goals after an entry), a recycle out of the box 37.3%, a loss 27.0% |

MATCH-30's front-of-box entries read 53–58 a team on `B` (cv04-sym's core read; 42.5–45.5): real football turns about a third of its front-of-box entries into a box entry, `B` about 58%. The excess is the step into the box, made against a defence that is mostly not between the ball and its goal: the back line stands `deepLine.behindBall` 4 m goal-side of a ball in front of the box (`lineFloor`), so a 6–12 m carry or a pass in behind passes it.

## 2. Structural switches on it (the diagnostic, 400 matches each beside `B`)

| read | matches | shots a team | goals a match | box entries a team | entering possessions | carry / short / in behind | behind the deepest % | <2 goal-side % | <2 in the box % | shot follows % |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ctl | 200 | 16.91 | 2.90 | 32.99 | 23.39 | 12.8 / 8.8 / 8.2 | 51.1 | 66.8 | 43.7 | 48.8 |
| B | 400 | 13.11 | 2.30 | 32.03 | 22.70 | 11.8 / 8.4 / 8.4 | 50.0 | 67.5 | 43.3 | 39.9 |
| Bid | 200 | 13.42 | 2.36 | 32.26 | 22.84 | 12.0 / 8.5 / 8.5 | 50.0 | 67.1 | 43.2 | 40.5 |
| bk35e16 | 400 | 11.59 | 2.46 | 35.89 | 24.41 | 13.1 / 11.3 / 7.9 | 40.4 | 58.4 | 18.5 | 34.1 |
| bk35e13 | 400 | 11.23 | 2.46 | 38.08 | 25.60 | 14.3 / 13.4 / 7.1 | 28.7 | 44.2 | 15.6 | 32.3 |
| bk45e16 | 400 | 11.74 | 2.55 | 38.42 | 25.84 | 14.1 / 12.7 / 8.2 | 37.7 | 56.5 | 13.4 | 33.1 |
| bk35e16m24 | 400 | 10.71 | 2.21 | 33.69 | 23.32 | 12.1 / 10.6 / 7.8 | 40.4 | 58.4 | 19.1 | 33.1 |
| bk35e16w10 | 400 | 12.22 | 2.44 | 34.53 | 23.71 | 12.6 / 10.1 / 8.4 | 43.9 | 61.9 | 28.2 | 37.2 |
| sd4 | 400 | 12.85 | 2.23 | 31.36 | 22.43 | 11.1 / 8.1 / 8.5 | 50.5 | 68.2 | 43.9 | 39.3 |
| sd4x | 400 | 12.72 | 2.27 | 30.86 | 22.30 | 10.8 / 8.0 / 8.4 | 51.6 | 69.3 | 45.3 | 39.3 |
| sd5 | 400 | 12.94 | 2.23 | 31.53 | 22.51 | 11.3 / 8.2 / 8.5 | 50.8 | 68.0 | 43.8 | 39.9 |
| sd6 | 200 | 13.15 | 2.36 | 31.64 | 22.62 | 11.4 / 8.2 / 8.6 | 50.2 | 67.6 | 43.1 | 40.0 |
| bk35e16sd4 | 400 | 11.33 | 2.47 | 34.20 | 23.90 | 12.2 / 10.6 / 7.8 | 41.9 | 60.8 | 20.1 | 34.2 |
| bk35e16sd4x | 400 | 11.25 | 2.32 | 33.51 | 23.49 | 11.2 / 10.9 / 7.9 | 41.8 | 60.6 | 20.7 | 33.8 |
| cp2 | 400 | 12.81 | 2.40 | 31.79 | 22.41 | 11.2 / 8.4 / 8.6 | 49.5 | 67.0 | 42.8 | 39.8 |
| cp2f70 | 400 | 12.90 | 2.26 | 31.48 | 22.50 | 11.2 / 8.2 / 8.5 | 50.4 | 67.6 | 43.8 | 39.6 |
| cp1n3 | 400 | 12.81 | 2.32 | 31.34 | 22.18 | 11.5 / 8.2 / 8.4 | 49.8 | 67.0 | 43.1 | 39.8 |
| cp2bk | 400 | 11.30 | 2.30 | 34.56 | 23.51 | 12.1 / 10.9 / 8.0 | 40.0 | 58.4 | 19.4 | 34.3 |
| ao17 | 400 | 12.99 | 2.30 | 32.34 | 22.35 | 13.1 / 7.8 / 8.4 | 51.2 | 67.6 | 43.3 | 40.4 |
| ho17ao17 | 400 | 12.78 | 2.23 | 31.85 | 21.98 | 13.9 / 6.7 / 8.2 | 52.1 | 68.2 | 43.5 | 40.3 |
| ho20ao20 | 400 | 12.72 | 2.27 | 30.16 | 21.39 | 13.4 / 5.6 / 8.2 | 54.6 | 70.6 | 47.5 | 41.4 |
| gs10 | 400 | 14.77 | 2.70 | 33.81 | 23.58 | 12.6 / 7.7 / 10.2 | 55.4 | 70.3 | 45.7 | 44.5 |

Names: `bk<from>e<edge>[m<mid>][w<wide>]` the `block` switch (`wide` 20.2, the central lane and both half-spaces; `w10` the central lane only); `sd<set>` the `setDefence` switch at `from` 70, `carry` 10, `pass` 1.5, `free` 4 (`x`: 20 and 3); `cp<stop>[n<near>][f<from>]` the `carryPath` switch (`near` 2); `ao<m>` / `ho<m>` where `B`'s attackers wait in possession, nx04's `arrive.out` (10 in `B`) and `hold.out` (14) at the box's edge; `gs10` `B`'s goal-side marking (`revision10.goalSide` 60/45/30/1/0, `revision9.markRadius` 24) at revision 10's released values (40/30/12/0.8/8, 14).

Readings:

- **The block holding the box's edge puts the defence in its box and raises the entries.** With the back line at most 13–16 m out in front of a central ball, entries with fewer than two defenders in the box fall 43 → 13–20% and behind the deepest defender 50 → 29–40%, but box entries rise 32.0 → 33.7–38.4 a team: the passes to men in front of the deeper line now land in the box (short passes 8.4 → 10.1–13.4), shots fall to 10.7–11.7 a team and goals rise to 2.21–2.55. A midfield held at 24 m (`m24`) or the switch only in the central lane (`w10`) does not reverse it.
- **The carrier in front of a set defence** (`sd4`–`sd6`, `sd4x`) moves entries by at most a point (30.9–31.6): before an entry the opposing box rarely holds four or more outfielders, so the switch rarely applies; on the block, where it does, entries stay 33.5–34.2.
- **A carry stopped by a man on its path** (`cp2`, `cp2f70`, `cp1n3`) moves carry entries 11.8 → 11.2–11.5: the carries into the box go past the defenders, beside them, not through them.
- **Where the attackers wait**: at the box's edge instead of inside it (`ao17`, `ho17ao17`, `ho20ao20`), passes in front of the box replace passes into it and the receivers carry in (short-pass entries 8.4 → 5.6, carries 11.8 → 13.4–13.9): 30.2–32.3 entries.
- **The marking**: `B`'s man-to-man goal-side marks are not the cause — at the released marking (`gs10`) entries are 33.8, shots 14.8 and goals 2.70.

Every structure tried leaves the volume at 30–38 entries a team while it moves where they are made: the attack enters the box from in front of it whatever the defence's places, and after a recycle enters again (1.40–1.49 entries an entering possession). The volume sits in the attacking side's choices near the box — carries and passes chosen for the threat they gain, made by 22–26 possessions a team in about 73 (MATCH-23's possessions 85–105) — not in the defending shape.

## Gate

Unmet; no scoring source is committed. The box-entry diagnostic places `B`'s 32 entries a team (MATCH-30 13–16): settled attacks from in front of the box — carries (37%), short passes (26%) and passes in behind (26%) — half of them beyond the deepest defender and two-thirds with fewer than two defenders goal-side. No structural switch of this window — the block holding the box's edge, the carrier respecting a set defence, a carry stopped by a man on its path — nor the attackers' waiting places or `B`'s marking moves box entries toward 13–16 (30.2–38.4), so none earned the held-out, season, stress-case, MATCH-29 or MATCH-28 read, and `B` (cv04-sym) remains the best read with its misses unchanged (held-out share 32.8% [31.6, 33.9], season share 30.6% [29.2, 32.0], possessions ending in a shot 16.8%, the stress case's star 47.6%). The three switches stay uncommitted in `analysis/cv04-box-source.patch` with every earlier switch; the engine source is restored.

## Next

1. The box-entry volume is the attacking phase's, not the defending block's: MATCH-16's choices in front of the box — the xT-driven carry heading and pass gain that make an entry the best option from 70–88.5 m, re-entries after a recycle — and the possession count behind them (73 against 85–105). It is T411's planning question (an entry worth the chance it leads to) for gusta-update-ssot on MATCH-16/30 before any implementation; no further structural switch of the defending shape is indicated.
2. As cv04-sym's and cv04-ori's Next: before any commit, gusta-update-ssot of every rule `B` changes (MATCH-11/12/16/17/18/33/35), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Limits

- Timing: the window ran from 19:41Z (bounded at 21:41Z); measurements 19:42–19:55Z (about 13 minutes), then the evidence. They closed early because every structural lever of the decision was read and none moved the entries; the remaining lever is a planning question, not a switch.
- Every read is the diagnostic on the calibration seeds: 400 observed matches a candidate (200 for `ctl`, `Bid` and `sd6`), goals a match swinging about ±0.15 at this size; no band check, concentration screen, held-out, stress-case, season, MATCH-28 or MATCH-29 read for any candidate of this window, since none moved box entries.
- The diagnostic reads defenders where they stand when the tally counts the entry (after the pass or carry resolved, before anyone moves on); `pass-through` is the decision's kind, not MATCH-13's through-ball classification; what follows is read from the trace up to 40 entries on, stopping at the first opposing action; goals after an entry count once for each entry of their possession.
- The front-of-box conversion quoted for `B` divides cv04-sym's core-read counters (validation, one condition, 600 matches).
