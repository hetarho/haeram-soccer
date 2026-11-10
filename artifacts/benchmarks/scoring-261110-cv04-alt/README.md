# T689 cv04-alt — how clear chances arise and how the alternatives resolve

**No candidate earns the full read; no scoring source is committed.** A new diagnostic shows that about eight possessions a team a match reach MATCH-16's clear chance near goal on every base — eight times MATCH-30's big chances — mostly after a box entry that ends behind the deepest defending outfielder in settled play, with nobody goal-side of the carrier when he decides. `c50`'s round and open-angle alternatives then land in the goal area. Of eleven existing settings screened on `c50`, only the marker's goal-side distance (MATCH-34) moves the clear-chance volume, and it pushes box entries elsewhere while the goal-area share stays above 20%. T689 remains todo; the remaining levers are planning questions (Next).

## Window and source

The sc10 unit opened the window at **2026-11-10T04:41Z** (bound 06:41Z) at **08b8d40e** on `work/nx10` in `.tmp/nx10` (Linux, 12 logical CPUs, at most 6 measurement processes, Node v24.22.1). Measurements ran **04:42–05:21Z**, then this evidence.

cv04-clr's `analysis/cv04-clr-source.patch` applied cleanly and stayed uncommitted. No new engine switch was written, so `analysis/cv04-alt-source.patch` (saved before the restore) is byte-identical to it. The engine source was restored with `git apply -R`.

**Provenance.** `cv04-clr/analysis/fingerprint.ts` prints **eb3adfb9** (211 files) with the patch applied, not cv04-clr's f9a3700b (208), since `packages/contracts` changed. `B` (`Bid`), `Pab` and `c50` were therefore re-read at cv04-clr's sizes before any comparison (`analysis/jobs/r0.json`). Every read gives the earlier figures:

- the shot-origin reports for `c50` (both 300-match halves), `Pab` and `Bid`, `c50`'s 400-match box entries and its 300-match chased shots equal cv04-clr's files once the candidate-file path is left out (`analysis/same.mjs`);
- `c50`'s band log equals av11's line for line apart from the timing;
- `Pab`'s band log (2.55 goals, 12.36 shots, 14.78% goal-area shots, 28/37) and box entries (26.57) equal cv04-own's;
- `Bid`'s band log (2.49, 26/37) equals cv04-cha's.

So cv04-clr's reads stand on this source.

## Diagnostic

`scripts/scoring-clear-chances.ts` (committed) reads every **clear-chance decision near goal** on observed grid-bands matches. A decision counts when a carrier stands where `takesClearChance` holds (revision 7+: `clearChance` whoever chases him) in the box or within `revision6.clear.shootFrom` m of goal. It reads the decision live:

- **Hooks.** `Tracer.hold` runs right after `decide` and before the in-stride carry. The tally's state there is the one the carrier decided on, and the action's entry is the tracer's next one. A delivery's first-time finish, which takes no decision, is left out.
- **At the decision:** the keeper's narrowing, the chased state, the outfielders goal-side of the carrier, the deepest outfielder and `actionMix`'s shares.
- **How the possession reached it:** the regain's zone, the seconds and passes since, a through ball, and the possession's first box entry as `Tally.movement` counts it.
- **What it became,** then the possession's first shot (place, xG, goal) or how the possession ended.
- **Beside it:** every shot, split by whether it resolved a clear chance (MATCH-30's big chances are those of xG ≥ 0.30), and every box entry, split by whether a clear chance followed it.

**Checks on the diagnostic itself:**

- **It only observes.** On the same 300 matches it counts the same shots and goals as `scoring-shot-origins.ts` for all three bases (`analysis/totals.mjs`).
- **It runs on the released engine.** cv04-cha's `chasedState` and `squareTarget` exist only in the patch, so the script carries copies with their defaults. The copies reproduce the first run's three reports exactly (`clear/check/`, `analysis/jobs/r1b.json`).

## How clear chances arise (300 calibration matches each, a team a match)

| | `B` | `Pab` | `c50` |
|---|---:|---:|---:|
| possessions reaching a clear chance near goal | 8.71 | 8.01 | 8.29 |
| clear-chance decisions | 10.37 | 9.56 | 10.98 |
| the possession's first shot scores, % of those possessions | 5.1 | 8.9 | 11.2 |
| their goals, share of all goals | 41% | 54% | 62% |
| shots of xG ≥ 0.30 / scored (MATCH-30 0.80–1.05 / 0.40–0.55) | 0.66 / 0.34 | 0.76 / 0.39 | 1.03 / 0.54 |
| box entries leading to a clear chance / to none | 9.01 / 23.47 | 7.82 / 18.85 | 8.22 / 18.94 |

The pattern holds on every base:

- **Where:** 83% of the first decisions are in the box beyond the goal area, 9–10% in the goal area and 8% outside.
- **Nobody goal-side:** 77–80% of all decisions have no defending outfielder goal-side of the carrier. The deepest one stands 6–16.5 m from goal in 61%.
- **Box entry:** the possession's first entry was a carry in 42–43%, a through ball in 27–29% and a short pass in 7–8%. In 18–21% the possession had none, starting in the box or from a loose ball. **65–66% ended behind the deepest outfielder.** Of the entries leading to a clear chance, 74–77% end behind him; of the others, 41–45%.
- **Settled play, not breaks:** 39–41% come 30 s or more into the possession, 24–25% at 15–30 s, 17–19% within 8 s. The regain was in the own third 24–26%, the middle 32–33%, the final third 24–27%, a restart or loose ball 16–18%.
- **Who concedes:** sides facing press concede 43–45% of them (3.45–3.80 a team), those facing counter 0.92–1.12.
- **Who:** the ST slot makes 39–42% of the first decisions.

The volume, not each chance's value, carries the goals. A real big chance scores about 45% of the time. `c50`'s clear chances score 11.2% a possession, about eight a team, against MATCH-30's 0.80–1.05 big chances.

## How the alternatives resolve (`c50` beside `Pab`, a team a match)

- **The shut chances are replaced, not reduced.** Where the keeper's narrowing leaves less than half the chance, `c50`'s carrier strikes 0.02 times against `Pab`'s 2.81. Instead he goes round the keeper 1.72 times (0.18), carries 1.99 (0.78), passes into the box 0.37 (0.08), squares 0.21 (0.05) or passes out 0.18 (0.04). The first decisions of possessions with a shut chance stay about as many (3.40 against 3.17).
- **Rounds** (1.92): 34% reach a shot, 0.54 of them from the goal area, scoring 37% at xG 0.32. The keeper wins 44% (0.85 against `Pab`'s 0.06) and an outfielder 18%.
- **Carries** (3.22): 36% reach a shot, 0.87 from the goal area, scoring 36%. 45% are lost to an outfielder (1.45 against 0.61).
- **The first shot after an alternative:** 1.40 against 1.06, of which 0.98 against 0.36 from the goal area, and 0.37 against 0.13 goals. That is +0.62 goal-area shots and +0.24 goals a team: most of `c50`'s rise in goal-area share (14.8 → 22.7%) and goals (2.55 → 3.07). The clear-chance strike itself gives 3.70 shots at 14.4% against 6.06 at 10.1%.
- **Chains and re-entries:** 24% of `c50`'s possessions with a clear chance reach a second one (`Pab` 16%, `B` 16%). 14% of its decisions see the ball recycled outside the box (6%), so it makes more re-entries (27.06 against 26.57).
- **Per shut chance:** `c50`'s possession shoots 30% of the time and scores 8.8% (xG 0.25 a shot). `Pab`'s scores 3.0% at xG 0.02 a shot.

## Screens (existing settings on `c50`, then on `Pab`)

All screens are calibration reads, each beside `c50`:

- **Band columns:** 400-match band checks (`logs/bands-*`).
- **Clear-chance columns:** this diagnostic at 300 (`clear/`).
- **`c50mg3` only:** box entries at 400 (`entries/`) and both 300-match shot-origin halves (`origins/`).

| candidate | goals | shots | goal area % | rows | clear possessions | xG ≥ 0.30 / scored | entries (clear / none) | box open play conversion, xG a shot |
|---|---:|---:|---:|---:|---:|---|---|---|
| `c50` | 3.07 | 10.39 | 22.7 | 27/37 | 8.29 | 1.03 / 0.54 | 27.06 (8.22 / 18.94) | 10.5%, 0.10 |
| `c50dr6l30` back line drops after a loss | 2.85 | 10.47 | 23.0 | 28/37 | 8.22 | 1.07 / 0.53 | (8.07 / 19.52) | - |
| `c50sw5m28` every keeper sweeps | 2.94 | 10.26 | 22.7 | 28/37 | 8.42 | 1.08 / 0.56 | (8.37 / 19.03) | - |
| `c50cp1n3` carry stops before a man within 3 m of its path | 2.96 | 10.11 | 23.3 | 28/37 | 7.93 | 1.00 / 0.48 | (7.82 / 18.33) | - |
| `c50gl5` back line takes men 5 m in front of it | 3.34 | 11.29 | 22.6 | 27/37 | 9.77 | 1.19 / 0.57 | (9.42 / 18.06) | - |
| `c50mg3` marker 3 m goal-side (`markGoalSide`, 1.5) | **2.62** | 9.67 | 21.6 | **30/37** | 7.08 | 0.86 / 0.45 | 27.64 (7.13 / 20.65) | **10.2%, 0.09** |
| `c50mg3gl5` | 2.90 | 10.21 | 22.0 | 30/37 | 8.08 | 0.94 / 0.47 | (8.02 / 19.94) | - |
| `c50mg3dr` (`mg3` + `dr6l30`) | 2.60 | 9.63 | 21.1 | 30/37 | 6.90 | 0.87 / 0.41 | (6.83 / 20.81) | - |
| `c50mg5` marker 5 m goal-side | 2.31 | 8.98 | 20.1 | 28/37 | 5.74 | 0.78 / 0.38 | (5.71 / 22.81) | - |
| `Pab` | 2.55 | 12.36 | 14.8 | 28/37 | 8.01 | 0.76 / 0.39 | 26.57 (7.82 / 18.85) | 7.3%, 0.06 |
| `Pabmg3` | 2.27 | 11.21 | 14.8 | 30/37 | 6.86 | 0.74 / 0.39 | (6.78 / 20.10) | - |

Entries in parentheses are the diagnostic's own count on 300 matches. It reads `c50`'s 400-match 27.06 as 27.16.

What the screens show:

- **The defending settings named for the volume do not reach it.** The drop after a loss, every keeper sweeping and a carry stopped at a man on its path leave clear-chance possessions at 7.9–8.4. The back line taking men in front of it raises them to 9.8.
- **Only the marker's goal-side distance moves the volume:** −15% at 3 m, −31% at 5 m, on `Pab` too (−14%). Goals fall with the chances (3.07 → 2.62 → 2.31), big chances fall into and then out of MATCH-30's band, and the entries that lead to none rise (18.9 → 20.7 → 22.8). Total entries therefore stay at 27.6–28.5 (≤ 26.2 needed).
- **The goal-area share is set by the alternatives, not the volume.** It holds at 20–23% on `c50` at every volume and at 14.8% on `Pab` with or without `mg3`.

## Gate

cv04-clr's gate, unchanged. `c50mg3` is the closest candidate:

- **Passes:** goals 2.62 and the box bar (10.2% conversion, xG 0.09 a shot over 600 matches).
- **Fails:** box entries 27.64 (≤ 26.2 needed) and goal-area shots 21.6% (≤ 16.0% needed).

No candidate meets the screen. So no MATCH-29 press v counter read, 1,200-match concentration screen, held-out partition, season share, stress case or MATCH-28 core was earned or run. The production scoring model and saves are unchanged.

## Next (planning questions; T689 stays todo)

1. **Clear-chance volume (MATCH-16/30/34).** About eight possessions a team reach MATCH-16's clear chance near goal on every base, mostly in settled play, after an entry behind the deepest outfielder with nobody goal-side. Real football has about one big chance a team.
   - MATCH-34's goal-side marking keeps a marker beside a man near the box. No released or experimental rule keeps a covering defender goal-side of a carrier who runs past his marker or a receiver behind the line.
   - The marker's distance is the only setting that moves the volume, and the entries it removes from clear chances reappear as other entries.
   - **Question:** whether MATCH-16's clear chance is meant to be real football's big chance. If so, MATCH-34 needs a cover rule for the box in settled play; if not, MATCH-16 needs a narrower clear chance (for example, its 7 m alone clause anywhere).
2. **Where the alternatives end (MATCH-12/16 r58, MATCH-35).** `c50`'s round lands a metre past the keeper (cv04-cha's `roundPoint`), and its open-angle carry ends where `chanceXg` × narrowing is highest. Both end in the goal area: +0.62 goal-area shots a team at every volume screened.
   - **Question:** where a round of the keeper or a carry to an open angle takes the carrier, and how the keeper or a recovering defender challenges it. MATCH-23's goal-area share cannot be met with `c50`'s alternatives until this is answered.

## Files

- `analysis/cv04-alt-source.patch`: the engine experiment, uncommitted (identical to cv04-clr's).
- `analysis/run.mjs`, `analysis/jobs/*.json`: every job's runner arguments, with status files.
- `analysis/make-candidates.mjs` and `analysis/specs-s*.json`: the candidates (`candidates/`).
- `analysis/alt.mjs`, `analysis/screen.mjs`: the summaries above.
- `analysis/same.mjs`, `analysis/totals.mjs`: the equality checks.
- `logs/`: every job's output, kept as `.txt` because the repository ignores `*.log` (`analysis/keep-logs.mjs` renamed the first ones).

Commands, from the worktree:

```sh
pnpm exec tsx artifacts/benchmarks/scoring-261109-cv04-clr/analysis/fingerprint.ts
node artifacts/benchmarks/scoring-261110-cv04-alt/analysis/run.mjs artifacts/benchmarks/scoring-261110-cv04-alt/analysis/jobs/<r0|r1|r1b|s1|s2|s3|s4>.json 6
node artifacts/benchmarks/scoring-261110-cv04-alt/analysis/screen.mjs Bid Pab c50 c50mg3 …
node artifacts/benchmarks/scoring-261110-cv04-alt/analysis/alt.mjs artifacts/benchmarks/scoring-261110-cv04-alt/clear/clear-<name>-0-300.json …
```

## Limits

- Calibration seeds only; each clear-chance read is 300 matches, so differences under about 5% between candidates are within noise.
- The diagnostic's `chased`/`squareTarget` copies follow cv04-cha's defaults. A candidate changing `decide.candidate.chased` would need them read from the live configuration.
- MATCH-29, the concentration screen, held-out, season-share, stress-case and MATCH-28 reads were not run (not earned).
