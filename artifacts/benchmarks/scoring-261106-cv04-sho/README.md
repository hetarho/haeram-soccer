# T689 scoring — 261106 cv04-sho (the chaser at the shoulder and the box's chances with nobody between, read at the kick; MATCH r54, a bounded window)

The owner's renewed automatic run (cv07: deadline 2026-11-06T22:00Z, research cutoff 20:30Z) measures MATCH r54 (MATCH-35): a man closes a shot down from where he can reach the ball's path as it is struck — level with the ball or goal-side of it within a stride; a chaser still behind the ball only from touching distance, his one take then the pressure on the finish — so a chased chance with nobody between, struck before the keeper is out to him, keeps about its place's level against a keeper set for it. This window: **from 17:37Z**, bounded at 19:37Z (2 h, before the 20:30Z cutoff), on `codex/cv04` at c924037d (no engine or script change since cv04-cha's 7a3a4f82; Apple M1 Max, 10 cores, at most 6 measurement processes at once). Measurements ran 17:40–18:01Z (about 21 minutes), then the evidence. Earlier windows' evidence is reused only as labelled context. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sym's finalist `sp70bx40s10rc20` (`B`), `ctl`, and cv04-cha's `c9` (`B` with `chased` `give` 0.9), copied from cv04-cha's candidates; `analysis/make-candidates.mjs` writes every candidate, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-cha's patch re-applied (`git apply` clean on c924037d); this window's switches, uncommitted in `analysis/cv04-sho-source.patch` with every earlier switch (the engine source is restored), read only when set:

- `SHOT_CONFIG.candidate.touch` (0 = off; the plan's (a), `closingBlockers` in `grid/resolve.ts`): a man closing a foot shot down who stands more than `level` 0.75 m behind the ball along the line from it to the goal's middle blocks only from within `touch` m of the shooter; level with it or goal-side he closes as `B` has him. A man it drops stays the chance's pressure, as `B` reads him (pressure already counts every opponent within 4.6 m, one behind weighing half).
- `SHOT_CONFIG.revision9.narrow.only` (0 = off; the plan's (b), `keeperNarrowing`): r51's set reference (`ref` m off his line toward the shot) with its `cap` and `floor` for a keeper within `only` m of his line alone; a keeper further out keeps `B`'s narrowing, so no relief reaches a carrier running at a keeper out to him. Screened at `ref` 3, `cap` 1 (no narrowing beyond a set keeper's), `only` 3.
- One more screen of cv04-cha's own switch, `decide.candidate.chased` with `reach` 99 and `near` 10 (`c9f`): r53's choice against a keeper out to him for a carrier with nobody chasing too (MATCH-12: facing the keeper he shoots, takes him on or carries past him), since the diagnostic finds the free carriers against a keeper out as many as the chased ones.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs` — cv04-cha's with this window's paths and a `chased` kind — each with its `.status.json`; `analysis/collect.mjs` copies the band logs and compares files; `analysis/wait.mjs` awaits a run in one call): the new diagnostic `scripts/scoring-chased-shots.ts --start 0 --matches 300` (`chased/*.json`, summarised by `analysis/chased.mjs` into `chased/summary.md`); the shot-origin diagnostic `scripts/scoring-shot-origins.ts --start 0 --matches 300` (`origins/*.json`, read by `../scoring-261104-cv04-blk/analysis/between.py`); the band check `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, read by `../scoring-261104-cv04-ori/analysis/bands.mjs`); MATCH-29's press v counter `scripts/grid-bands.ts --report --partition calibration --scale 2 --conditions tactics:press-counter,tactics:counter-press` (1,200 matches a venue, `pc-*.json`, read by `../scoring-261104-cv04-sit/analysis/tactics.mjs`). `B`, `c9` and `ctl`'s shot-origin, band-check and press v counter reads are cv04-cha's, on the same engine source.

## 1. The diagnostic: the box's chances with nobody between, as the shot is struck

`scripts/scoring-chased-shots.ts` (new, committed) takes the open-play shots a carrier strikes himself (`shot` entries; no header, penalty, restart or set piece's second phase) from the box beyond the goal area, as `scoring-shot-origins.ts` places them, and rebuilds each shot's state where the engine resolved it: every slot at the kick of an in-stride carry (the entry's `kick`), else the previous entry's snapshot (a shot struck at once), the clock for the drain, and the pressure read there (`play`'s tags, after the carry). On that state the engine's own functions give each factor of the recorded xG — the place curve before pressure (`chanceXg`), the pressure factor, the keeper's narrowing, the closing and path blocks' unblocked shares and the match's level factor — and their product reproduces the recorded xG within 1% for 3,359 of `B`'s 3,362 such shots (`c9` 2,468 of 2,471, `ctl` 4,505 of 4,506). "Nobody between", "chased" and "keeper out" are cv04-cha's definitions (no defending outfielder within 6 m of the line to the goal's middle and 3 m nearer the goal; one within 4.6 m; more than 3 m off his line), read at the kick. 300 calibration matches each.

| read | group | shots a team | conv. | xG a shot | place | pressure f. | narrowing | unblocked: close / path | dist m | SB16 g/shot there | blocked: close / path | keeper off m |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---:|
| `B` | chased, keeper set | 0.32 | 4.7% | 0.065 | 0.458 | 0.436 | 0.610 | 0.779 / 0.771 | 6.9 | 0.146 | 21.6% / 18.9% | 2.6 |
| `B` | chased, keeper out | 2.98 | 0.9% | 0.008 | 0.381 | 0.477 | 0.085 | 0.759 / 0.810 | 8.5 | 0.141 | 23.7% / 16.9% | 5.4 |
| `B` | free, keeper set | 0.27 | 6.7% | 0.072 | 0.150 | 0.962 | 0.832 | 0.987 / 0.979 | 13.9 | 0.089 | 0.0% / 1.8% | 1.9 |
| `B` | free, keeper out | 2.03 | 1.9% | 0.009 | 0.165 | 0.964 | 0.104 | 0.987 / 1.000 | 14.1 | 0.121 | 1.6% / 0.0% | 6.1 |
| `B` | all | 5.60 | 1.8% | 0.015 | 0.296 | 0.675 | 0.158 | 0.854 / 0.885 | 10.7 | 0.131 | 14.4% / 10.2% | 5.3 |
| `c9` | chased, keeper set | 0.32 | 6.2% | 0.061 | 0.442 | 0.433 | 0.628 | 0.741 / 0.770 | 7.2 | 0.144 | 25.8% / 15.5% | 2.6 |
| `c9` | chased, keeper out | 1.47 | 1.0% | 0.007 | 0.315 | 0.550 | 0.091 | 0.753 / 0.844 | 9.8 | 0.135 | 23.2% / 12.2% | 5.6 |
| `c9` | free, keeper out | 2.07 | 2.1% | 0.008 | 0.164 | 0.967 | 0.079 | 0.986 / 1.000 | 14.2 | 0.122 | 1.3% / 0.0% | 6.1 |
| `c9` | all | 4.12 | 2.6% | 0.016 | 0.238 | 0.776 | 0.175 | 0.883 / 0.925 | 12.1 | 0.127 | 11.0% / 5.7% | 5.4 |
| `ctl` | chased, keeper set | 0.30 | 9.4% | 0.075 | 0.414 | 0.527 | 0.745 | 0.842 / 0.806 | 8.0 | 0.140 | 17.1% / 17.1% | 2.6 |
| `ctl` | chased, keeper out | 3.75 | 1.9% | 0.014 | 0.357 | 0.502 | 0.131 | 0.752 / 0.827 | 9.1 | 0.138 | 24.7% / 13.4% | 5.5 |
| `ctl` | free, keeper out | 3.19 | 3.8% | 0.031 | 0.159 | 0.969 | 0.230 | 0.979 / 0.996 | 14.4 | 0.117 | 2.0% / 0.4% | 6.1 |
| `ctl` | all | 7.51 | 3.4% | 0.026 | 0.270 | 0.716 | 0.213 | 0.860 / 0.904 | 11.4 | 0.128 | 13.9% / 7.6% | 5.5 |

(`c9`'s and `ctl`'s free shots against a set keeper, 0.26–0.27 a team, are in `chased/summary.md`.)

**cv04-cha's premise does not hold at the kick.** Its 2.2–2.3 box chances a team "with nobody between, chased, against a keeper set" read the keeper where the shot's entry was traced, after the action; at the kick the keeper was out to the carrier in most of them. The cross-tab on `B` (shots a team):

| at the kick | keeper set at the entry | keeper out at the entry |
|---|---:|---:|
| chased, keeper out | 0.47 (xG 0.022) | 2.51 (xG 0.005) |
| chased, keeper set | 0.31 (xG 0.066) | 0.01 |
| free, keeper out | 1.58 (xG 0.009) | 0.45 (xG 0.009) |
| free, keeper set | 0.27 (xG 0.072) | - |

So the box's chances with nobody between are 5.0 a team (`B`; `ctl` 6.9) struck against a keeper already out to the carrier — 5.4 m off his line for a chased carrier 8.5 m out, 6.1 m for a free one 14 m out, as MATCH-35 sends him half of the way — where `B`'s narrowing (`reach` 2) leaves 8.5–10.4% of the chance (xG 0.008–0.009 against SB16's 0.12–0.14 a shot in those cells); only 0.6 a team are struck against a keeper still set, at xG 0.065–0.072. The chaser's closing block takes 22–24% of a chased chance and the path a further 19–23%: a third of what the narrowing of a keeper out takes.

Where the chaser stands as the shot is struck (`B`; behind = more than 0.75 m nearer his own end than the ball along the shot's line, goal-side = more than 0.75 m nearer the goal):

| group | chaser behind / level / goal-side | closers a shot: behind / level / goal-side | a closer behind: mean chance, within 1.2 m, blocks |
|---|---|---|---|
| chased, keeper set | 20% / 35% / 45% | 0.79 / 0.33 / 0.12 | 0.180, 6.6%, 17.9% |
| chased, keeper out | 32% / 56% / 12% | 0.88 / 0.27 / 0.03 | 0.194, 5.7%, 16.6% |

r54's lever is real but small: a closer behind the ball is the commonest (0.8–0.9 a chased shot), almost never within touching distance (6–7%), and blocks 17–18% of the shots he closes — about a sixth of a chased chance that he should not take; level men block 21–31%.

## 2. Screens (300 shot-origin and diagnostic, 400 band-check calibration matches each)

Open play, the box beyond the goal area (shot origins, `between.py`; "alone" = nobody between as the entry was traced, cv04-cha's reading, for comparison with its gate bars):

| read | on | box shots a team / conversion / xG | box alone: shots / conversion | goal area: shots / conversion | goals (band check) | shots a team | goal-area share of shots | poss. → shot | rows inside | unopposed (scored) |
|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| `Bid` (cv04-cha) | - | 7.70 / 2.9% / 0.028 | 4.82 / 1.9% | 2.23 / 19.8% | 2.49 | 12.95 | 16.95✗ | 16.01✗ | 26/37 | 5.48 (9.4%) |
| `c9` (cv04-cha) | `B` | 6.03 / 3.8% / 0.031 | 3.63 / 2.7% | 2.84 / 21.2% | 2.68 | 11.73 | 24.22✗ | 14.37 | 28/37 | 5.50 (11.8%) |
| `t10` (`touch` 1.0) | `B` | 7.62 / 3.8% / 0.031 | 4.78 / 2.6% | 2.23 / 24.4% | 2.50 | 13.01 | 17.93✗ | 16.08✗ | 27/37 | 5.65 (10.4%) |
| `t15` (`touch` 1.5) | `B` | 7.76 / 3.8% / 0.031 | 4.87 / 2.7% | 2.26 / 23.5% | 2.50 | 13.09 | 17.67✗ | 16.12✗ | 27/37 | 5.63 (10.1%) |
| `c9t10` | `c9` | 5.93 / 4.4% / 0.036 | 3.63 / 3.1% | 2.87 / 24.6% | 2.71 | 11.81 | 23.68✗ | 14.74 | 28/37 | 5.50 (12.2%) |
| `c9t15` | `c9` | 5.99 / 4.2% / 0.035 | 3.59 / 2.9% | 2.88 / 23.8% | 2.65 | 11.88 | 23.73✗ | 14.73 | 27/37 | 5.54 (11.8%) |
| `s3` (`ref` 3, `cap` 1, `only` 3) | `B` | 7.88 / 3.1% / 0.031 | 4.92 / 2.0% | 2.27 / 23.0% | 2.69 | 13.04 | 17.07✗ | 16.11✗ | 27/37 | 5.54 (10.1%) |
| `c9s3` | `c9` | 6.08 / 4.3% / 0.034 | 3.71 / 3.1% | 2.85 / 24.0% | 2.94 | 11.86 | 23.60✗ | 14.51 | 28/37 | 5.58 (12.6%) |
| `t15s3` | `B` | 7.74 / 4.2% / 0.033 | 4.92 / 3.1% | 2.28 / 27.4% | 2.65 | 13.06 | 17.83✗ | 16.09✗ | 28/37 | 5.62 (10.8%) |
| `c9t15s3` | `c9` | 6.00 / 4.9% / 0.038 | 3.54 / 3.4% | 2.78 / 28.0% | 2.93 | 11.79 | 23.31✗ | 14.65 | 28/37 | 5.47 (13.1%) |
| `c9f` (`chased` `reach` 99, `near` 10) | `c9` | 4.20 / 4.7% / 0.045 | 1.94 / 4.2% | 3.46 / 21.2% | 2.86 | 10.51 | 31.22✗ | 12.75 | 28/37 | 4.20 (17.2%) |

The diagnostic on the screens (`chased/summary.md`): (a) at 1.5 m takes the closers behind a chased shot 0.79–0.88 → 0.08–0.09 a shot and the chaser's block 22–24% → 12–13%, lifting the chased chances' xG only 0.065 → 0.067 against a keeper set and 0.008 → 0.010 against one out, since the narrowing is untouched; (b) takes the chased chances against a keeper set to xG 0.094 (narrowing 0.61 → 0.92), 0.33 a team; with both on `c9` those reach xG 0.110 (15.9% scored), still 0.34 a team. (a)'s relief lands most in the goal area (its conversion 19.8 → 23.5–24.4%), where closers behind stand nearer. `c9f` takes the box's chances with nobody between 4.82 → 1.94 a team, as many against a keeper out to a free carrier as to a chased one (2.07 → 0.62), but sends them, as `c9` did, to the goal area (goal-area share of shots 31%, MATCH-23's 6–9%; mean shot distance 9.4 m).

Where the keeper-out chances come from (`B`, shots a team; the shot-origin script's names, `self-carry-after-through` a carrier's own carry after he received a through ball):

| group | through ball, struck first time | own carry | own carry after a through ball | a pass | own take-on | the rest |
|---|---|---|---|---|---|---|
| chased, keeper out (2.98) | 1.34 (xG 0.003, 7.7 m out, keeper 5.3 m off his line) | 0.89 (xG 0.013, 9.4 m, 5.6 m) | 0.17 | 0.24 | 0.09 | 0.25 |
| free, keeper out (2.03) | 0.24 (xG 0.020, 10.8 m, 5.1 m) | 1.20 (xG 0.004, 14.9 m, 6.5 m) | 0.22 | 0.07 | 0.13 | 0.17 |

The two largest are a through ball's receiver striking first time with a man at his shoulder and the keeper already 5.3 m out, 2.4 m from him (MATCH-35 r51 meets a shot struck at once with the keeper "still set a couple of metres off his line"), and a free carrier striking from 15 m at a keeper 6.5 m out, who covers the whole mouth from 8.5 m at `B`'s 2 m reach. `ctl` has the same structure, larger (1.41 and 1.85 a team).

## 3. MATCH-29's press v counter

1,200 matches a venue, calibration (`grid-bands.ts --report --scale 2`, the reads `B`'s −0.135 came from), for the screens with goals 2.35–2.9 on the band check (`t15s3` at 2.65; `c9f` 2.86):

| read | press win share − counter's [95%] | goals / hat-tricks a press v counter match |
|---|---|---|
| `Bid` (cv04-cha) | −0.135 [−0.170, −0.100] | 2.67 / 0.041 |
| `c9` (cv04-cha) | −0.165 [−0.199, −0.131] | 2.98 / 0.052 |
| `t15` | −0.124 [−0.159, −0.090] | 2.80 / 0.039 |
| `c9t15` | −0.144 [−0.179, −0.109] | 3.12 / 0.060 |
| `t15s3` | −0.110 [−0.145, −0.076] | 3.02 / 0.050 |
| `c9f` | −0.307 [−0.340, −0.273] | 3.59 / 0.106 |

r54's closing block and the set reference for a keeper still set hold press v counter inside `B`'s interval (−0.110 to −0.144) — with cv04-sym's set-piece header, the only chance-value levers in T689 since cv04-hold not to move it toward counter: they leave the narrowing of a keeper out to the carrier — counter's 1v1s behind press's line — as `B` has it. Extending r53's choice to the free carrier (`c9f`) breaks it (−0.307, 0.106 hat-tricks a press v counter match): the rounds and squares it adds are counter's goal-area chances.

## Gate

Unmet; no scoring source is committed and no candidate earned the full read (held-out 2,400, season share, stress case, MATCH-28's core): none takes the box beyond the goal area's open-play conversion to 7% (best `c9t15s3` 4.9% with goals 2.93, past 2.9; `c9f` 4.7%; (a) or (b) alone 3.1–3.8%). The switches stay uncommitted in `analysis/cv04-sho-source.patch` with every earlier switch; the engine source is restored.

## Next

1. r54's two clauses (a), and r51's set reference for a keeper still set (b), are safe — MATCH-29 held, goals 2.50–2.69 on `B` — but small: they reach only the 0.6 box chances a team struck against a keeper still set. Even at SB16's place level those would add about 0.04 goals a team, taking the box from 2.9% to about 3.5%; the 7% bar cannot be reached through them.
2. The box's chances with nobody between are 5.0 a team (`B`) struck against a keeper already out to the carrier, at xG 0.008–0.009 against SB16's 0.12–0.14 a shot in those cells: five times MATCH-30's big chances (0.80–1.05 a team), each worth a fifteenth of its place. Removing them all would leave the box at about 6% (7.70 − 5.0 shots a team keeping all but 0.065 of its 0.22 goals), so the bar needs both their volume and their value. The released keeper reaches 5.3 m off his line for a through ball's receiver who strikes first time (1.34 a team, xG 0.003), against MATCH-35 r51's "a shot struck at once … meets him still set a couple of metres off his line", and covers the whole mouth for a free carrier 15 m out from 8.5 m (`reach` 2; 1.2 a team, xG 0.004).
3. A planning question before more measurement, MATCH-35/MATCH-12/MATCH-30: (i) where the keeper stands when a through ball's receiver strikes first time — r51's text says set, the engine has him 5.3 m out, moving out while the ball travels — and whether a keeper 2–3 m from the carrier is a shot at all or a smother he wins (MATCH-12, MATCH-31); (ii) what a keeper half of the way out leaves a free carrier who strikes from 15 m (real one-on-ones score about a third; the released narrowing's 2 m reach leaves a tenth of the chance), measured with MATCH-29 beside it since every relief of a keeper out has broken press v counter; (iii) why a carrier reaches the box with nobody between 5 times a team a match (MATCH-32/34's goal-side defending against the through ball and the carry), the volume half that `chased` alone only sends to the goal area.
4. As before: before any commit, update-ssot of every rule `B` changes (MATCH-12/17/18/32/33/34; MATCH-11/16/35 beyond r54; r51's set reference for a keeper out if (b) is used), then a prospective model revision (SAVE-23) measured at a resolving size on both partitions and the season read.

## Verified

- `B` with this window's switches in the source, all off, gives the same diagnostic rows on matches 0–299 as before they were added (`chased-Bid-pre-0-300.json`, read before the switches were added, against `chased-Bid-0-300.json`, read after them with the diagnostic's later `entry|` and `origin|` rows, which are left aside; `analysis/collect.mjs --same-chased`, after each addition), and the same shot-origin rows as cv04-cha's `Bid` (`analysis/collect.mjs --same`).
- The diagnostic's rebuilt factors reproduce the recorded xG within 1% for 99.9% of the shots it reads (above); its smoke run (4 matches, `B`) reproduces all 34.
- `pnpm run typecheck` passed with the switches applied; the saved patch reverse-applies to restore the source and applies cleanly on c924037d (`git apply --check`); on the restored source the committed diagnostic runs with no candidate (20 matches, 302 of 302 rebuilt shots within 1% of their recorded xG, `chased/chased-released-0-20.json`), and `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run validate:i18n` pass and `vitest --project unit --changed c924037d` finds no affected test (exit 0). No integration, contract or e2e run.

## Limits

- Timing: the window ran from 17:37Z (bounded at 19:37Z); measurements 17:40–18:01Z (the diagnostic's smoke runs 17:40–17:41Z, `B`, `c9`, `ctl` 17:41–17:43Z, round 1's 25 screens 17:45–17:51Z, the four MATCH-29 reads and `B`'s shot-origin identity 17:52–17:59Z, the origin rows on `B`, `ctl`, `c9`, `t15s3` 17:59–18:01Z), then the evidence. Closed early once no candidate reached the box bar and the diagnostic placed the remaining take in the narrowing of a keeper already out, which the plan holds as `B` has it.
- The diagnostic reads only the carrier's own `shot` entries (a delivery's finish and a header are out); its place is the entry's `from` as `scoring-shot-origins.ts` reads it, its cell the rebuilt kick position, so a few shots placed in the box read a goal-area cell (`chased/summary.md`); "nobody between", "chased" and "keeper out" are read at the kick, so its classes differ from `scoring-shot-origins.ts`'s entry-time ones (the cross-tab above); the in-match drain uses each player's first traced entry as his time on; the chaser's behind/level/goal-side split is this script's 0.75 m half-stride, a reading no SSOT fixes.
- Screens 300 shot-origin and diagnostic matches, 400 band-check matches (goals swing about ±0.15), MATCH-29 press v counter only, calibration, 1,200 matches a venue; no concentration, held-out, season, stress-case or MATCH-28 read since none earned it; `ctl` re-read only by the diagnostic.
- `touch`, `level`, `only` and `c9f`'s `reach`/`near` are screen settings no SSOT fixes.
