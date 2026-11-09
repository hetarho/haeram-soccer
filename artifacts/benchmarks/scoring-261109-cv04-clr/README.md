# T689 cv04-clr — MATCH-16 r58's clear chance read against the keeper where he stands (ev09, 261109) — interim

**Interim hand-off, not a finished window.** The cv04-clr window opened at 10:45Z (bound 12:45Z) in the ev09 run's sixth unit on `ev09/work`. The unit ended `blocked` before it wrote this README or T689's note, with the engine experiment uncommitted; the loop then stopped on the dirty tree at 11:01Z. The coordinating session saved the whole engine diff as `analysis/cv04-clr-source.patch` (`git diff -- packages/engine`, reversible with `git apply -R`), restored the engine source and committed the evidence as the unit left it. The same dirty tree is also on `origin/wip/ev09` (16880b31).

What the unit reported before it stopped (its own words, not re-read here):

- all 11 `analysis/jobs/r1.json` jobs exited 0 (`r1.status.json`);
- `Pab`'s switched-off shot origins 0–299 equal cv04-own's row for row (`../scoring-261109-cv04-own/analysis/same.mjs`), and the computation fingerprint (`analysis/fingerprint.ts`) is 78e71d47, equal to cv04-own's `pc-*` files, so cv04-own's `Bid`, `Perf` and `Pab` reads are reused rather than re-run;
- `c50` (`clear.keeper` 0.5) and `c25` (0.25) meet the box bar: open-play box conversion 10.5% / 10.4% and xG a shot 0.100 / 0.098 over 600 matches; the carried clear chances fall to 0.18 / 0.21 a team at xG 0.077 / 0.069;
- both fail goals (3.07 / 3.03 a match against 2.35–2.9), the goal-area shot share (22.7% / 22.3% against `Perf`'s 16.0%) and box entries (27.06 against 26.2), so neither earns the MATCH-29 press v counter read and **the gate is unmet**. No scoring source is committed.

Next, in the T689 session that resumes this window: read the results with `analysis/screen.mjs Bid Perf Pab c50 c25` and cv04-own's `analysis/own.mjs` on `chased/*`, check the figures above against the files, finish this README in cv04-own's form (levers, commands, tables, limits) and write T689's note. T689 stays todo.
