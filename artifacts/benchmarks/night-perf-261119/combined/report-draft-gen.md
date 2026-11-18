## Generation removal experiments (base c9fde08e = T982+T983+T984; agent remove-gen, 261119 ~03:00–03:35 KST)
Base 1950 generation (generation-reference): 36.5 s CPU (6 runs 35.3–37.1; wall 66–115 s at load 15–40). Per season 2.2 s (1930/31) → 3.0 s (1949/50); 1938/39 + war gap 3.9 s. 1950 world: 451 NPC clubs, 11,215 squad players, 16,206 people, JSON 22.8 MB, 1,517 transfers a season. 1990 takeover: 202 s CPU (53 seasons; 2.2 → 5.4 s a season while squads stay flat; people 60k, JSON 75 MB; coaching-staff market grows 3.4% → 10.4% of a season with the people registry).
Corrections: squads do not drift (median 25, p90 26–27, max 31–36 to 1990; the 261116 "median 40" no longer reproduces). Control G0 (same rules, reseeded market tie-breaks) already changes 61 of 104 titles, mean table shift 3.1 places: champion/table differences are noise; only distributions count (±0.1–0.3 on division means).

| id | removed/simplified | season CPU | 1950 gen CPU s | impact at 1950 (3 seeds) | rule touched |
|---|---|---|---|---|---|
| G1 | no NPC market before the takeover | gen ×0.47–0.49; hist ×0.459 | 36.6→17.6 | 0 transfers (base 1,515/season); divisions compress (top flight −1.1 strength, tier 3 +1.6); no pre-takeover move histories; JSON −1.8 MB | WORLD-16 transfers |
| G2 | market settles once per window (6 settlements → 2) | gen ×0.83; hist ×0.821 | 36.6→30.6 | transfers −19%; distributions within noise | WORLD-16, NPC_MARKET.days (T950); gate to history or the owned game changes too |
| G3/G3b | squads trimmed to 25 / 22 | ×1.02 / ×1.04 (slower) | 37.4 / 38.5 | depth cut, clubs refill; slower | drop |
| G4 | no in-season NPC growth every 4 rounds (all at close) | gen ×0.94; hist ×0.955 | 36.6→34.5 | nothing measurable; strengths frozen within a season | WORLD-16 round growth |
| G5 | lazy re-selection (choose at next squad read) | gen ×0.95; hist ×0.944 | 36.6→34.8 | selections −30%; identical 2 seasons, then G0-level divergence; no distribution change | WORLD-16 "chosen again when its players change"; flush before save/digest/takeover |
| G6 | world starts 1946 / 1936 instead of 1930 | per season ≈ base | 36.5→9.9 (1946) / 18.5 (1936); 1990 takeover 202→12.3 (start 1986) | no titles/tables/archives before the start; people 16.2k→5.5k; world unsettled (top flight +6.2 strength, top club 84→90.75 for 1946; +2.9 for 1936) | WORLD-13 (made in 1930), WORLD-15 |
| G7 | free agents only at window closes | ×0.99 (noise; h5 slower) | 36.5 | none | drop |
| G8 | G4+G5+G7 | gen ×0.87 | 31.7 | nothing measurable | parts |
| G8b | G2+G4+G5+G7 | gen ×0.68; hist ×0.669 | 25.2 | transfers −19%, else noise | parts |
| G8c | G1+G4+G5+G7 | gen ×0.34–0.35 | 12.8 | as G1 | parts |
| G9 | market off only before the 1946 restart | gen ×0.66 | 36.2→23.9 | pre-war transfers 0, post-war 1,686 vs 1,670; 1950 world within 0.5–0.9 of base; all titles/records kept | WORLD-16 |
Estimate: G9+G4+G5 ≈ ×0.59.
Ranking: G4, G5, G2 (G8b −32%), G9 (−34%), G1 (−52%), G6, then drop G7/G3.
Raw: scratchpad/remove-gen/out/{full,speed,seeds,seeds9,ab,g5u}, tools/p-*.mjs, gstats.mts, cmp/seedsum/diverge.mjs.
