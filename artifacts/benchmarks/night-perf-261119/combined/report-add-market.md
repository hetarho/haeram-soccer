
### 10x after tonight's landing, and the market-day levers (measured on main cbd26188, 05:05–05:20 KST)
- A 10x week now costs 614 ms (1950 career) and 840 ms (1980 world) over the same summer window as above (732 / 1015 before T986–T988 and the market units): −16% / −17%. Over days 8–196: 585 / 800 ms; round days 65% [55%] (379 [442] ms each), settlement days 8% (254 [345] ms), ordinary days 26% [36%] (26 [49.5] ms, mostly view). The 1950 career keeps up with 10x on this machine; the 1980 world (800 ms > 700 ms) does not.
- The worst day of a year is now the season close: 1.16 s [1.43 s] of engine time (NPC summer close 0.64 s; re-picking a club's squad after every move 0.25–0.27 s), then round days at 0.49–0.53 [0.59–0.64] s.
- The run-ahead buffer (7 days at x10) absorbs single spikes when the week fits: simulated on the measured days, the 1950 week stalls at most 17–83 ms with six days ahead; a 1980 week never catches up, and the close needs about 12 days ahead or its own speed-up.

| id | removed or simplified | week CPU 1950 [1980] | worst day | what changes (measured, 4 seasons) |
|---|---|---|---|---|
| M1 | after the takeover the NPC market settles once per window on its close day | ×0.996 [×0.983] (noise) | worse: the close-day settlement 455–546 [597–726] ms | 12–17% fewer NPC transfers, all on deadline day; league spread −3 to −5% — not worth it |
| M2 | after the takeover only the owner's country trades in the NPC market | ×0.943 [×0.947] | settlement day 254→105 [345→148] ms | no foreign NPC transfers, loans, records or news (1,337 [1,809] a season); home transfers unchanged; foreign levels within ±0.2 |
| M3 | spread one settlement over the window's days with the same results | impossible: every buyer's turn reads cash, squads, injuries and days left, which change from day to day | — | — |
| c | D2 (cap 4) + D1k + D4 + D5a on the new code | ×0.522 [×0.515]: about 0.31 s [0.41 s] a week | a settlement day 279 [458] ms; close 1.09 [1.16] s | every result identical (scores, cups, tables, goals, minutes, discipline, squads, Elo); the losses listed for D1, D2, D4, D5 |
| c+M2 | | ×0.472 [×0.469]: about 0.28 s [0.37 s] | round day 230 [345] ms | as c and M2 |
A result-preserving candidate seen here: the eager squad re-pick per market move (`moveSquadPlayer` → `matchdaySquad`) is 22–34% of a settlement day and about 25% of the close; making it lazy keeps results only if the stored squad order is reproduced (unmeasured).
Raw: artifacts/benchmarks/night-perf-261119/remove-market/.
