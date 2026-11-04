# T689 scoring — 261104 cv04-rec (MATCH-29's press v counter at the candidate's volume, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z) continues from cv04-sit's Next: MATCH-29 through how often counter's chances behind press's line arise. This window: **16:50Z–18:50Z**, measurements 16:51–@@END@@Z, on `codex/cv04` at 1d618ac5 (Apple M1 Max, 10 cores, at most 6 measurement workers at once; the host's load average was 16–19 from other processes during part of it, which slows runs but not their results). cv04's, cv04-hold's, cv04-sit's, nx04's and cf04's evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-sit's `sn01o08h25` (`candidates/sn01o08h25.json`, copied with cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-sit's patch re-applied; this window's new default-off switches, uncommitted in `analysis/cv04-rec-source.patch` with every earlier switch (the engine source is restored):

- `shape.candidate.drop` {`seconds`, `line`, `free`}: for `seconds` after losing the ball, with nobody of the side within `free` m of it, the back line drops to at most `line` m from its goal (`shapePlace`).
- `shape.candidate.sweepAll`: every keeper steps up behind a high line as a sweeper keeper does (`SHAPE_CONFIG.sweeperStep`, `keeperMax.sweeperKeeper`).
- `duel.candidate.crossBlockBehind`: a cross neither delivered nor overhit goes behind for a corner off the defender at the crosser's foot, this share × the pressure on him (`resolveCross`).
- `duel.candidate.headBehind`: a defender who wins a delivery's aerial duel heads it behind for a corner this share of the time (`aerialDelivery`).
- `shot.revision9.narrow.ahead` and `shape.candidate.revision9.keeperOut.ahead`: cv04-sit's situational narrowing and come-out count a defender as between the shooter (carrier) and the goal only `ahead` m or more goal-side of him along that line, so a man chasing level with him no longer relieves the keeper.

New diagnostic (committed, measurement only): `scripts/scoring-press-counter.ts` plays press v counter (real clubs within 2 rating points, both venues alternating, observed) and splits each side's shots by how long into the possession, how it began, how many defending outfielders stood goal-side, whether the possession held a received through ball (the trace's `through` kind, wider than MATCH-13's counter), and counts through passes received from an offside position the call's draw let stand (→MATCH-18).

Candidate names: `dr<s>l<m>[f<m>]` drop (seconds, line, free); `sw`, `sw5m28` sweepAll (step 0.3 / 0.5, at most 22 / 28 m); `cb<v>` crossBlockBehind v/10; `hb<v>` headBehind v/100; `ah<m>` ahead m; `s10` shotScale 0.1; `w0` the alone clause anywhere (cv04-sit's `within` 12 off); `a6`/`a7` its radius 6/7 m (MATCH-16's 5 m); `s05` shotScale 0.05; `a090` `shot.a` −0.9.

Commands (cv04's runner `../scoring-261104-cv04/analysis/run.mjs`, job lists `analysis/jobs/r*.json` by `analysis/make-jobs.mjs`): `scripts/scoring-press-counter.ts --start S --matches 200` (`pcd-*.json`, `analysis/pcd.mjs`); `scripts/grid-bands.ts --report --partition calibration --scale 2 --conditions tactics:press-counter,tactics:counter-press --jobs 2` (`pc-*.json`, 1,200 matches a venue, as cv04-sit's; `analysis/pcside.mjs`, whose gap reproduces cv04-sit's `tactics.mjs`); `scripts/grid-bands.ts --candidate --matches 400` (`bands/*.txt`, cv04's `analysis/table.mjs`); @@HELDOUT_COMMANDS@@ `analysis/collect.mjs` copies the band logs.

@@BODY@@
