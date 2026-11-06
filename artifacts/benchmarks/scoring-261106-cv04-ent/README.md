# T689 cv04-ent — MATCH-16 r50/r51's entry on a box that scores (cv07, 261106)

The cv04-ent window of the owner's renewed cv07 run, as T689's impl notes plan it after the 19:42Z planning note: MATCH-16 r50 (from in front of the box an entry is worth the chance it leads to, otherwise the shot from distance with a view, the ball wide or the recycle) and r51 (the forward ball to a runner timed onside, not to a man already standing past the line) already state which entries a side makes, and their switches were read only on `B`, whose box converted 3%. This window reads them on cv04-kpr's `t15s3fpc110` (`P`), where the box beyond the goal area converted 7.4% in open play on its 300-match screen. **From 19:47Z** (unit start; window bound 20:30Z, cv07's research cutoff), on `codex/cv04` at 8649ee48 (Apple M1 Max, 10 cores, at most 6 measurement processes at once). Measurements ran 19:50–20:10Z, then the evidence. **No candidate meets every screen bar, so none earned the full read; the gate is unmet and no scoring source is committed.**

Source: cv04-kpr's switches re-applied from `../scoring-261106-cv04-kpr/analysis/cv04-kpr-source.patch` (`git apply --check` clean on 8649ee48). The computation fingerprint with the patch applied was **1e9ada38**, cv04-kpr's (`analysis/fingerprint.ts`, the identity `scripts/grid-bands.ts` records), so cv04-kpr's `P` and `B` band checks, shot-origin files, MATCH-29 read and concentration screen are reused unchanged. **No new switch**: every lever is a setting of a switch already in the patch, and the working tree's engine diff equalled cv04-kpr's patch byte for byte before it was reversed (`analysis/collect.mjs --same-diff`). The engine source is restored.

Levers (`analysis/make-candidates.mjs`, applied by `scripts/scoring-candidate-patch.ts`, every name checked):

- `e` — cv04-att's entry, `DECISION_CONFIG.candidate.entry` as `../scoring-261104-cv04-att/candidates/e8p8pp03r5w30fa.json` sets it (`from` 70, `reach` 8, `pass` 8, `carry` 1, `ref` 0.1, `through` 0): from 70 m up, outside the box and not in a clear chance, a carry heading or a pass ending in the box is worth `chanceXg` at its arrival, nothing with a defender goal-side within 8 m (MATCH-16 r50).
- `r` — its `rest` part (`worth` 0.3, `shot` 5, `view` 0.5): with no entry worth 0.3, the shot from distance with half its path open weighs ×5 (MATCH-16 r50's alternatives).
- `f` — cv04-chc's offside receiver, `past.flag` 0.7 (a pass to a man past the second-last opponent as it is played weighs ×(1 − 0.7 × the carrier's 판단력/99), MATCH-16 r51), with MATCH-18's call `base` 0.12 (`Pf`, `Perf`), 0.10 (`Perf10…`) or `P`'s own 0.08 (`Perf8…`, `Pef8`).
- `p` — cv04-att's blind `past.prior` 0.3, read beside only (`Perp`).
- `a1`/`a105` — the shot model's `a` −1.0 / −1.05 in place of `P`'s −1.1.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/*.json` by `analysis/make-jobs.mjs` — cv04-kpr's with this window's paths and cv04-att's `entries` kind — each with its `.status.json`; `analysis/collect.mjs` copies the band logs; `../scoring-261106-cv04-kpr/analysis/wait.mjs` awaits a run in one call): the box-entry diagnostic `scripts/scoring-box-entries.ts --start 0 --matches 400` (`entries/*.json`); the band check `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`); the shot-origin diagnostic `scripts/scoring-shot-origins.ts --start 0 --matches 300` (`origins/*.json`; matches 300–599 for `P`, `Perf` and `Perf8`); `analysis/screen.py` reads the three into one line a candidate; MATCH-29's press v counter `scripts/grid-bands.ts --report --partition calibration --scale 2 --conditions tactics:press-counter,tactics:counter-press --jobs 3` (1,200 matches a venue, `pc-*.json`, read by `../scoring-261104-cv04-sit/analysis/tactics.mjs`); the concentration screen `scripts/scoring-concentration.ts --matches 1200` (read by `../scoring-261104-cv04/analysis/summary.mjs`). `B` (`Bid`) and `P` were read by the box-entry diagnostic here for the first time on this source.

## 1. The screens (calibration seeds)

Box entries, entering possessions and entries an entering possession a team a match, the share of entries a shot or a goal follows and entries by kind (400 matches); goals a match, shots a team, shot places, possessions, possessions ending in a shot, offsides a team, the set-piece goal share and MATCH-23 rows inside (400 matches); the box beyond the goal area's open-play shots a team and conversion (300 matches).

| read | entries | entering poss. | per poss. | shot / goal follows | carry / short / in behind | goals | shots | outside / box / goal area % | poss. ending in a shot % | offsides | set-piece goals % | rows | open-play box |
|---|---:|---:|---:|---|---|---:|---:|---|---:|---:|---:|---:|---|
| `Bid` (`B`) | 32.40 | 22.87 | 1.42 | 39.9 / 4.1% | 11.90 / 8.49 / 8.54 | 2.49 | 12.95 | 11.0 / 72.1 / 17.0 | 16.01 | 1.64 | 23.8 | 26/37 | 7.70 / 2.9% |
| `P` (`t15s3fpc110`) | 32.30 | 22.98 | 1.41 | 40.6 / 5.6% | 11.93 / 8.28 / 8.80 | 2.88 | 12.92 | 11.8 / 71.3 / 16.9 | 16.11 | 1.79 | 16.1 | 27/37 | 7.93 / 7.4% |
| `Pe` | 29.11 | 21.81 | 1.33 | 42.1 / 5.5% | 10.73 / 6.15 / 8.87 | 2.94 | 13.03 | 11.6 / 70.7 / 17.7 | 16.27 | 1.70 | 18.3 | 28/37 | 7.69 / 6.5% |
| `Per` | 28.43 | 21.31 | 1.33 | 42.9 / 5.5% | 10.23 / 5.86 / 8.92 | 2.96 | 14.51 | 21.0 / 63.5 / 15.5 | 18.03 | 1.64 | 16.5 | 29/37 | 7.59 / 6.4% |
| `Pf` | 29.87 | 21.50 | 1.39 | 39.9 / 5.2% | 11.49 / 8.16 / 7.06 | 2.60 | 12.14 | 11.5 / 71.1 / 17.4 | 15.25 | 2.32 | 17.9 | 27/37 | 7.30 / 5.9% |
| `Perf` | 26.18 | 19.81 | 1.32 | 42.7 / 5.9% | 9.81 / 5.61 / 7.33 | 2.63 | 13.34 | 21.1 / 62.9 / 16.0 | 16.75 | 2.21 | 19.5 | 28/37 | 6.92 / 6.8% |
| `Perp` (beside) | 25.39 | 19.22 | 1.32 | 41.4 / 5.3% | 9.66 / 5.96 / 6.45 | 2.60 | 12.87 | 22.8 / 61.9 / 15.4 | 16.37 | 1.29 | 16.9 | 28/37 | 6.51 / 6.3% |
| `Perf8` | 26.61 | 20.11 | 1.32 | 42.7 / 5.9% | 9.89 / 5.82 / 7.45 | 2.82 | 13.47 | 20.8 / 63.5 / 15.8 | 16.96 | 1.45 | 18.5 | 30/37 | 7.04 / 6.6% |
| `Perf10` | 26.31 | 19.89 | 1.32 | 42.8 / 5.9% | 9.72 / 5.67 / 7.43 | 2.79 | 13.43 | 20.5 / 63.5 / 16.0 | 16.88 | 1.86 | 19.6 | 30/37 | 6.96 / 6.6% |
| `Pef8` | 27.81 | 20.80 | 1.34 | 41.6 / 5.5% | 10.72 / 5.95 / 7.77 | 2.77 | 12.35 | 11.7 / 70.3 / 18.0 | 15.51 | 1.53 | 17.8 | 28/37 | 7.28 / 6.1% |
| `Perf8a1` | 27.24 | 20.47 | 1.33 | 42.3 / 6.0% | 10.22 / 6.05 / 7.62 | 2.95 | 13.64 | 20.2 / 63.7 / 16.1 | 17.11 | 1.49 | 18.7 | 29/37 | 7.21 / 7.0% |
| `Perf10a105` | 26.86 | 20.19 | 1.33 | 42.7 / 5.8% | 10.13 / 5.81 / 7.50 | 2.96 | 13.45 | 20.1 / 64.1 / 15.8 | 16.77 | 1.85 | 18.3 | 29/37 | 7.02 / 6.8% |

`P`'s band check, shot origins and MATCH-29 read are cv04-kpr's (fingerprint unchanged); `B`'s shot-origin rows are cv04-kpr's `Bid`.

MATCH-29's press v counter (calibration, 1,200 matches a venue; press win share − counter's, pooled, [95%]; goals a match in those matches; hat-tricks a match): `B` −0.135 [−0.170, −0.100] (cv04-cha), `P` −0.128 [−0.163, −0.094] 3.20 / 0.068 (cv04-kpr), `Perf` **−0.168 [−0.202, −0.134]** 2.90 / 0.048, `Perf8` −0.171 [−0.205, −0.137] 2.99 / 0.058, `Pef8` −0.191 [−0.225, −0.157] 3.05 / 0.063, `Pf` −0.149 [−0.184, −0.114] 2.96 / 0.065. Not read (goals 2.35–2.9 too, the time to 20:30Z spent on the box's noise, §2): `Perp` (beside only), `Perf10`.

Concentration screen (1,200 calibration matches): `Perf` goals 2.70, shots 13.29, hat-tricks 0.043, the ST slot's goal share **36.4%** (`B` 39.0%, `P` 33.4%), the club top-scorer share 38.6% [27.0, 50.1] against `P`'s 30.7% [24.8, 36.5] (unresolved over 2–3 world seeds), the top scorer converting 14.2% against the rest's 7.7% (`P` 15.0 / 10.6%).

## 2. What it shows

- **The entry choice takes the volume r50/r51 hold, without touching the box's chance.** `e` alone takes box entries 32.3 → 29.1 a team and entering possessions 23.0 → 21.8 (short passes into the box 8.3 → 6.2), with `f` 26.2 and 19.8, with `p` beside 25.4; re-entries fall in step (1.41 → 1.32 entries an entering possession), and a shot follows an entry a little more often (40.6 → 42–43%). Goals stay 2.60–2.96 a match and shots 12.1–14.5 a team. `r` doubles the share from outside 11.8 → 20–23% (32–42%, held to 27.8) and with it possessions ending in a shot 16.1 → 16.8–18.0% (10–15%); `f` with MATCH-18's call `base` 0.10 holds offsides at 1.86 a team (`Perf10`), 0.12 takes them to 2.21–2.32, `P`'s 0.08 to 1.45–1.53. Rows inside 27 → 28–30/37. Every candidate stays about twice MATCH-30's 13–16 entries (held to 18.1).
- **The box bar sits inside the 300-match noise.** On matches 0–299 the box beyond the goal area converts 5.9–7.0% in open play on every candidate against `P`'s 7.4%, but its chance does not move: xG a shot there is 0.057 on `P`, `Perf` and `Perf8` over 600 matches (an xG-implied 5.7%), and on matches 300–599 `P` itself converts 6.6% (7.0% over 600; `Perf` 6.5 / 6.7%, `Perf8` 6.4 / 6.5%). `P`'s 7.4% on the screen seeds rested on its through balls' finishing (2.15 a team scoring 15.5% at xG 0.126; 12.7–13.1% on the candidates at the same xG). A 300-match read of about 4,000–4,800 box shots carries a standard error of about 0.4 points, so the bar's 7% does not resolve `P` from `Perf`.
- **The box's open-play shots are still mostly the carrier's own.** Of `P`'s 7.93 a team, 3.46 follow the shooter's own carry at xG 0.019 (2.7% scored) and 0.58 his take-on (0.045); on `Perf` 3.04 at 0.019, beside 1.86 through-ball finishes at 0.128 and 0.76 received passes at 0.074. The entry rule weighs a carry heading by `chanceXg` at its arrival, but the shot that ends such a carry is recorded at about a sixth of the box's level, so fewer entries leave the box's mix, and its conversion, where it was.
- **MATCH-29 holds only at its edge.** `Perf` (−0.168) sits inside `B`'s interval by 0.002, `Perf8` (−0.171) 0.001 beyond it, `Pef8` (−0.191) outside; `Pf` (−0.149) holds, without `e`. Fewer entries lower press's goals against counter's deep block more than counter's against press's high line, as every volume lever since cv04-sit.
- **No candidate meets every screen bar.** `Perf` meets four of five — entries below `P`'s, goals 2.35–2.9 (2.63), MATCH-29 inside `B`'s interval, the ST slot at 36.4% (at most 39.0%) — and misses the box (6.8%, 6.7% over 600); `Perf8a1` and `Perf10a105` reach 7.0 / 6.8% with goals 2.95–2.96 (above 2.9); `Pe`, `Per` and `Pef8` miss the box at 6.1–6.5%. So none earned the full read (held-out 2,400, season share, stress case, MATCH-28's core).

## 3. Gate

Unmet. MATCH-23's goals and the club top-scorer share were not read held out for any cv04-ent candidate. The candidates' calibration reads beside: `Perf`'s club top-scorer share 38.6% on the concentration screen (unresolved), the shot places outside (outside shots 21% against 32–42%, goal area 16% against 6–9%), possessions ending in a shot 16.8% (10–15%), set-piece goals 19.5% (20–28%, held to 18).

## Next

1. **Read the box bar on its chance as well as its goals.** The box beyond the goal area's open-play xG a shot is 0.057 on `P` and on every entry candidate (real football's box chance about 0.11, MATCH-11 r51), and its conversion on one 300-match read moves ±0.8 points with the finishing draw. A screen bar on goals alone passes or fails `P`-like candidates by noise; reading the conversion over 600 matches beside xG a shot would tell a lever that moves the chance from one that moves the draw. A planning refresh of T689's screen bar (no SSOT band changes).
2. **The carrier's own box shot.** After the entry choice, 3.0–3.5 of the box's 6.9–7.9 open-play shots a team still follow the shooter's own carry at xG 0.016–0.020, a sixth of the box's level, and they are why entries given up take the box's goals with them rather than leaving better ones: a MATCH-16/11 planning question — once a carrier is in the box (not in a clear chance), when he shoots from where his carry ended, carries on or plays it, and what a chance he made with his own carry is worth against a set defence — before more measurement.
3. `Perf` is the base for both: entries 26.2, goals 2.63, MATCH-29 −0.168, the ST slot 36.4%. Its switches are cv04-kpr's patch with `entry`, `rest`, `past.flag` 0.7 and call `base` 0.12; `Perf10` (call `base` 0.10) keeps offsides inside at 1.86.

## Verification

- Every runner job exited 0 (`analysis/jobs/*.status.json`); the working tree's engine diff equalled cv04-kpr's patch before it was reversed; the patch reverse-applies to restore the source and applies cleanly on 8649ee48 (`git apply --check`); the computation fingerprint with the patch applied was 1e9ada38 (cv04-kpr's).
- On the restored source `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run validate:i18n` pass and `vitest --project unit --changed 8649ee48` finds no affected test (exit 0). Every runner job exited 0 (39 jobs).
- No integration, contract or e2e run; no held-out, season, stress-case or MATCH-28 read (none earned).

## Limits

- The window ran from 19:47Z (bound 20:30Z), measurements 19:50–20:10Z.
- Screens on the calibration seeds: box-entry diagnostic and band checks 400 matches (goals about ±0.15), shot origins 300 matches (600 for `P`, `Perf`, `Perf8`; the box's conversion about ±0.4 points on 300); MATCH-29 press v counter only, calibration, 1,200 matches a venue; the concentration screen 1,200 matches on 2–3 world seeds (the club top-scorer share's interval 23 points wide).
- The band check prints no front-of-box entries (MATCH-30 42.5–45.5), which only MATCH-28's core report reads; none was run here.
- `entry`'s `reach`/`pass`/`carry`/`ref`, `rest`'s `worth`/`shot`/`view`, `flag` and the call `base` are cv04-att's and cv04-chc's screen settings, no SSOT fixes them; `ctl` was not re-read (cv04-cha's rows stand).
