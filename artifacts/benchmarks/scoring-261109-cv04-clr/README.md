# T689 cv04-clr — MATCH-16 r58's clear chance read against the keeper where he stands

**The screen fails; no scoring source is committed.** Both candidates improve the box's open-play chance but exceed this window's goals, goal-area shot share and box-entry limits. Neither earns the MATCH-29, concentration or full validation reads. T689 remains todo with its realism gate unchanged.

## Window and source

The ev09 unit opened at 2026-11-09T10:45Z (bound 12:45Z), measured its eleven jobs, then ended before finishing its evidence. The host stopped on the dirty tree at 11:01Z. Its experiment is retained unchanged as `analysis/cv04-clr-source.patch` and in the fixed checkpoint **16880b31**; the moving `origin/wip/ev09` ref subsequently advanced.

Session av11 finished this hand-off on 261109. It read the retained results, reapplied the saved patch on **458bcab6**, and confirmed that the engine, scripts, catalogs and declared package/config inputs have no diff from 16880b31. From **14:01:38Z to 14:05:13Z**, nine confirmation jobs ran on macOS arm64 with the pinned **Node v24.22.1**, at most four measurement processes. These additions live under `analysis/av11/` and `analysis/jobs/av11*`; no original result was overwritten. The experiment was reversed afterwards, leaving no engine diff.

Provenance correction: `analysis/fingerprint.ts` on this exact saved experiment prints **f9a3700b**, 208 files, with Node v24.22.1 (`analysis/av11/fingerprint.txt`); Node v26.8.1 prints c358ed92. The interim hand-off's claim that the experiment retained cv04-own's **78e71d47** fingerprint is not reproduced. That older value remains in the historical reports. Reuse here rests on the fixed source snapshot and actual comparisons: all seven confirmation shot-origin reports equal their earlier reports after excluding only the candidate-file path, including the switched-off `Bid`, `Perf` and `Pab` controls (300 matches each) and both 300-match halves of each candidate (600 each). The missing candidate band logs were regenerated at 400 matches and retained in `analysis/av11/bands/`.

## Lever

`Pab` is cv04-own's `Perf` with `boxShot.read` 1 and `boxShot.against` 1. One new default-off switch, `DECISION_CONFIG.candidate.clear.keeper`, implements MATCH-16 r58: when the keeper's narrowing at the decision leaves less than this share of the chance, the clear-chance shot floor no longer forces the carrier to strike. Chased or free, he weighs the existing round-the-keeper, square and carry options against that shot; with no better option he strikes. `c50` sets 0.5, `c25` 0.25. These are experimental settings, not a production activation or new SSOT band.

Commands executed for the hand-off:

```sh
node artifacts/benchmarks/scoring-261109-cv04-clr/analysis/screen.mjs Bid Perf Pab c50 c25
node artifacts/benchmarks/scoring-261109-cv04-own/analysis/own.mjs artifacts/benchmarks/scoring-261109-cv04-clr/chased/chased-c50-0-300.json artifacts/benchmarks/scoring-261109-cv04-clr/chased/chased-c25-0-300.json
npx --yes --package=node@24.22.1 -c 'pnpm exec tsx artifacts/benchmarks/scoring-261109-cv04-clr/analysis/fingerprint.ts'
npx --yes --package=node@24.22.1 -c 'node artifacts/benchmarks/scoring-261109-cv04-clr/analysis/run.mjs artifacts/benchmarks/scoring-261109-cv04-clr/analysis/jobs/av11.json 4'
```

The job manifest records every actual runner argument. It runs `grid-bands.ts --candidate --matches 400` for each candidate and `scoring-shot-origins.ts --start 0 --matches 300` for each control and candidate, plus `--start 300` for each candidate's second half. The existing screen script looks for transient band logs, so its `bands -` on another checkout does not mean those measures passed; the durable confirmation logs are the source of the following band columns.

## Results

Calibration only. Entries are per team from the retained 400-match box-entry diagnostic. The next five columns come from the confirmation 400-match band checks. Open-play box figures exclude the goal area and pool 600 shot-origin matches for each candidate. `Pab`'s reference band values are cv04-own's retained 400-match read, and its box read is 300 matches.

| candidate | entries | goals per match | shots per team | outside / box / goal area % | offsides | rows inside | open-play box: shots per team / conversion / xG per shot |
|---|---:|---:|---:|---|---:|---:|---|
| `Pab` reference | 26.57 | 2.55 | 12.36 | 22.4 / 62.8 / 14.8 | 2.19 | 28/37 | 6.31 / 7.3% / 0.061 |
| `c50` | 27.06 | 3.07 | 10.39 | 27.86 / 49.40 / 22.74 | 2.30 | 27/37 | 3.60 / 10.5% / 0.100 |
| `c25` | 27.06 | 3.03 | 10.49 | 27.71 / 49.98 / 22.31 | 2.27 | 25/37 | 3.67 / 10.4% / 0.098 |

The 300-match carried-shot diagnostic explains the improvement. With nobody between, `Pab` takes 2.45 carried box shots per team at xG 0.009; `c50` takes 0.27 at 0.071, `c25` 0.29 at 0.066. Their remaining carried clear chances are 0.18 / 0.21 per team at xG 0.077 / 0.069; the keeper's narrowing as struck leaves 75.1% / 68.8%, against cv04-own's `Perf` clear chances at 6.7%. This removes the forced poor strikes into a keeper already out. The replacement chances increase the goal area's shot volume: 2.43 / 2.42 open-play shots per team over 600 matches, against `Pab`'s 1.70 over 300.

## Gate

Both pass the box screen (conversion at least 7%, xG per shot at least 0.07 over 600 matches). Both fail the window's **2.35–2.9 goals**, **at most 16.0% goal-area shots**, and **at most 26.2 box entries** requirements. Their non-penalty set-piece goal shares are 16.12% / 15.61%. The generic band table's wider goal row reads pass; that does not satisfy this window's stricter screening condition.

No MATCH-29 press-versus-counter, 1,200-match concentration screen, held-out partition, season-share, striker stress-case or MATCH-28 core read was earned or run. The 33.3% ST goal share in each candidate's 600-match shot-origin report is not a club top-scorer share or a concentration verdict. The production scoring model and saves remain unchanged.

## Verification and limits

- All eleven original jobs and all nine confirmation jobs exited 0, with separate status files. Confirmation took 215 seconds; this is not a speed comparison with the original Linux Xeon run.
- The two regenerated band logs reproduce the interim figures. All seven shot-origin confirmation files match the originals, including both halves of each candidate. Original candidate diagnostic matches reconstructed 1,468/1,470 shots for `c50` and 1,538/1,540 for `c25` within its matching tolerance.
- Box-entry and carried-shot diagnostics were read from the retained files, not rerun. Original raw results and the engine patch remain unchanged. No new candidate or production tuning was introduced.
- The restored production source proceeds to the coordinator's release verification. A future scoring window must explain where the round/square alternatives add goal-area chances and box entries while preserving their improved chance quality; no goal cap, reassignment, target change or forced poor strike is implied by this finding.
