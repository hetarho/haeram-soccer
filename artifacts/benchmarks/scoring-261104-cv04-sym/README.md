# T689 scoring — 261104 cv04-sym (a symmetric goal lever on cv04-rec's volume, a 2 h window)

The owner's resumed automatic run (deadline 2026-11-05T00:00Z, new exploration stops by 22:30Z) continues from cv04-rec's Next 1: goals and concentration on `w0a7ah3hb35`'s volume with a goal lever that does not move MATCH-29's press v counter. This window: **17:53Z–19:53Z**, on `codex/cv04` at 0e303e8d (Apple M1 Max, 10 cores, at most 6 measurement workers at once). Earlier windows' evidence is reused unchanged. **No candidate meets the realism gate; no scoring source is committed.**

Base: cv04-rec's `w0a7ah3hb35` (`candidates/w0a7ah3hb35.json`, copied with cv04's control `ctl`); `analysis/make-candidates.mjs` writes every other candidate on it, applied by `scripts/scoring-candidate-patch.ts` (every name checked). cv04-rec's patch re-applied; this window's new default-off switch, uncommitted in `analysis/cv04-sym-source.patch` with every earlier switch (the engine source is restored):

- `SHOT_CONFIG.candidate.setPieceHeader`: a set piece's delivered header (`resolveCross` with the set-piece phase: corners and delivered free kicks) takes this chance quality in place of `candidate.header` (0.42); open-play deliveries keep theirs.

**Status: interrupted.** The unit was ended by its host at about 17:57Z, two minutes into the first screen list (`analysis/jobs/s1.json`: `w0a7ah3hb35` re-read, `sp55`, `sp70`, `sp90`, `ah15`, `rc12`, `hp06`, `grid-bands.ts --candidate --matches 400`); no result was read, so this window has no measurement. The switch is saved in `analysis/cv04-sym-source.patch` (cv04-rec's switches plus `setPieceHeader`) and the engine source is restored; the next unit re-applies the patch and re-runs `s1` before anything else.

Candidate names: `sp<v>` setPieceHeader v/100; `ah<m>` the narrowing's and come-out's `ahead` (cv04-rec's 3 m); `rc<v>` the narrowing's `reach` v/10 m (1.5 m); `hp<v>` every contested header's pressure v/10 (`headerPressure` 1); `a0x0` `shot.a` −0.x.
