## 10x play removal experiments (base c1023944, measured 261119 03:00 KST, agent remove-day)
Base week (7 days main-thread CPU: engine advanceDays + host view + publish + posting clone; days 8–49):
- lived 1950: 732 ms/week (691–773); round days 60% (442 ms = 401 engine + 41 view), market days 18% (393 ms), cup 5%, ordinary 16% (21.6 ms: 2.2 engine + 19.5 view/publish).
- 1980 world: 1015 ms/week; +15 seasons (1965): 1099 ms/week. A/A noise ±3%.
- 10x shows a week in 700 ms: 1950 just fits on an M1 Max; 1980 needs 1.45x; a 3–5x slower device needs 2–7x.

| id | removed/simplified | round day ms | ordinary ms | week 1950 [1980] | game impact (measured) | effort/risk |
|---|---|---|---|---|---|---|
| D2t | place-weight fit tolerance 1e-10 → 1e-3 (NPC) | 428→376 (×0.876) | ≈ | −7.5% | results identical; NPC per-role per-90 means within 0.1% | one constant; match-model revision + goldens |
| D2i4 | place-weight fit capped at 4 iterations (128 now) | 457→376 (×0.828) | ≈ | −11.5% | results identical; role means shift ≤3.4% (ST interceptions 0.87→0.90/90, GK passes +2.4%) | one constant; code comment says convergence replaced a fixed count to remove a systematic bias → spec note |
| D2-0 | no fit (starting weights) | ×0.819 | ≈ | −11.4% [−9.8%] | distorted: GK passes ×1.97, ST tackles ×1.98, ST interceptions +69%, CB tackles −26% | not worth it |
| D1k | NPC player-fact attribution reduced to shots/goals/assists/xG/saves/cards/minutes/penalty fouls | 436→245 (×0.556) | ≈ | −28% [−23.5%]; season engine 19.5→10.5 s | season hashes identical (scores, tables, goals/assists/apps/minutes, discipline, squads, Elo); NPC players lose passes, tackles, interceptions, dribbles, progressive actions, crosses, xT, fouls, offsides… (league full-stats, PlayerComparison, CareerRecordBook, OwnPlayerSheet comparisons) | medium: MATCH-26 full-record contract, HIST-17 "untracked" columns, UI |
| D5a | manager/staff candidate lists recomputed weekly | ±0 | 21.2→15.2 [45.6→23.7] | −4.2% [−12.3%] | lists up to 6 days stale on 9/84 (1950), 12/84 (1980) days | low: refresh on clock stop/command |
| D5 | all view parts >5% weekly (candidates, offers, discipline names, office) | ±0 | 22.6→8.2 [47.8→16.0] | −12.4% [−18.7%] | plus stale discipline/injury names 12–21/84 days, office ledger 6/84, offers 9/84 | low–medium |
| D4 | own-match post-match material only when watched | 451→364 (×0.804) | ≈ | −13% [−9.1%] | season hashes identical; every 10x-played own match loses its shot map, heat map, pass network, tactical report and share of season heat-map tallies (MATCH-25) | low code; spec change MATCH-25 |
| D3 | NPC fixtures after takeover use the results-only engine | 446→127 (×0.278) | 21.4→19.1 | −48.5% [−39%] | results change: goals/match 2.57→2.85 (1950) / 2.92→2.86 (1980); points-per-game SD −12% (19–20 of 23 leagues tighter); home share 41.7→44.2%, draws 24.7→21.9% (1950); NPC yellow cards 31.6k→0, NPC injuries and substitutions vanish; all NPC per-player detail lost; assists drift to CM/AM | low code, high design risk (MATCH-22), recalibration |
| D6a | autosave every 120 s instead of 30 s | — | — | est. −0.6% [−2.0%] | clone freeze 251 ms (1950), 803 ms (1980) per save → 4× fewer freezes; crash window 30→120 s of running time | trivial (SAVE-8) |
| D6b | Brotli cliff | — | — | — | no measured save past it (+15: gzip 5.01 of 8.39 MB); cliff ≈ +35 seasons; codec CPU per save on the +10 bytes: gzip 0.28 s, Brotli q11 168.7 s, q9 48.2 s, q7 22.9 s, q5 7.6 s | policy: never q11 for autosaves |
| D7 | keep 10 seasons of retired people and records (+15 world) | −3% (noise) | ≈ | −1.5% (noise) | JSON 50.7→40.3 MB, clone 671→512 ms (1980: 62.2→46.3 MB, 803→516 ms); old NPC person pages and career lines lost | medium–high: retention policy, dangling ids |
| D8 | helpers on 2–3 cores (est.) | 0 helpers 442; 1 helper 535 (+21%); 2 helpers on 3 cores ≈351 (−21%), on 2 cores ≈392 (−11%); 1 helper + engine share ≈387 (−12%) | — | — | none | product: use helpers only when ≥2 fit, or engine thread shares jobs |
| c1 | D1+D4+D5 | 439→170 | 20.9→7.9 | −51.5% [−50.5%] | sum of impacts | — |
| c2 | D3+D4+D5 | 436→62.5 | 20.9→6.6 | −68% [−64%] | sum | — |
Ranking per game impact: D2 cap/tolerance; D1k; D5a; D6a; D4; D5; D7; D3. After c2, NPC market days are ~55% of what remains.
Raw: scratchpad/remove-day/out/*, tools/*, patched copies d1 d1k d2 d2b d2i4 d2i16 d2t d3 d4 d5 d5a c1 c2.
