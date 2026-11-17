# T950 — market rates and division levels

Measured with the T944 harness (`scripts/market-seasons.ts`) on the xf18 session head 50e541f9
(levels T946/T947, NPC pull market T944/T945, war-gap refills T952, value ranking T951). Each run
lives ownerless worlds on the results-only path. A measurement copy of the harness, kept outside
the repository, added per-season reads: per-tier paid/free/loan moves in and out, England's top
flight alone, country/tier strength cells, the strongest club outside a top flight, and new
prodigies. It changed no engine path. `summaries.json` holds every phase-3 run's inputs (command, start,
seeds, lucks 1, `--config`) and its per-season means over seeds. Raw per-seed outputs stayed in
the measurement scratch folder.

## Chosen constants

| constant | before | after | why |
|---|---|---|---|
| `CLUB_LEVELS.aboveTarget` (persisted-squads.ts) | 1 | **0** | Held levels lifted every lower division's intake. Divisions drifted 3–10 above their levels by 1965 (cells within ±3: 13% in 1965). |
| `NPC_YOUTH.warRefill.below` (npc-careers.ts) | 3 | **0** | Restarts 1946–1951 top divisions nearer their level. Every tier rises about 0.9. |
| `NPC_MARKET_ERA.anchors` (transfer-policy.ts) | 1950, 1965, 1980, 1995, 2010 | adds **[1960, {bids 3, buys 2, sales 2}]** | Interpolating toward 1965 lifted 1958–61 top-flight fee moves to 4.05–4.45 a club, above the 1946–61 band. With the anchor they stay at 2.87–3.07. |

Kept: `NPC_YOUTH.refillBelow` 10, `divisionCentre` 3 and `skew`. `SQUAD_SPREAD` stays 'flat'
(coordinator decision: WORLD-6 gates the spread table behind MATCH-2/MATCH-23/CLUB-46/CLUB-48/LEAGUE-10
measurements). `NPC_MARKET.upgrade` 4, `valueWeight` 0.5 and `valueYears` 3 are also kept, along
with the 1995 and 2010 anchors.

## Runs (phase 3, on 50e541f9)

| tag | start | seeds | config |
|---|---|---|---|
| L75-default | fresh:1930, burn-in 2, 37 seasons (to 1975) | market-0..2 | the old values written out (aboveTarget 1, war below 3, old era table) |
| L75-base | same | market-0..2 | aboveTarget 0, warRefill.below 0 |
| L51-* | lived:1951, 5 seasons | market-0..7 | base plus: era (1960 anchor, 1995 {6,3,3}, 2010 {7,4,3}), upgrade 2, valueWeight 0.75, valueYears 5 |
| F95-* | fresh:1995, burn-in 2, 5 seasons | market-0..7 | base plus: era, valueYears 5 |
| L51x10-final | lived:1951 (snapshot rebuilt on the final source), 10 seasons | market-0..3 | final source |

The lived:1951 snapshots of the L51-* sweeps were built with the then-default constants, and
`--config` applies after the snapshot. The 1930→1975 runs carry the level constants from founding.

Earlier phases measured the same harness on the lanes before T951 (8 seeds; 4 for the level sweeps).

- **Sweeps that moved nothing:** `targetsPerNeed` 8, `searchSlack` 0, `SALE_FACTOR_VALUES.aboveDivision` −0.3, `refillBelow` 0/5/15, `divisionCentre` 1. `divisionCentre` 1 and a skew 2–3 lower pull the top flights down as much as the lower tiers.
- **Founding headroom:** 'spread' with headroom {from 20, young [2,10], to 26, old [0,1]} brought the 1935–38 openings to 82/71–72/63–64/55–58. That is 65–83% of cells within ±3, with no club outside a top flight above 85. It is not adopted (see above).

## Division levels (1930→1975, 3 seeds; tier means t1/t2/t3/t4, share of country/tier cells within ±3)

| opening | before (50e541f9 defaults) | after (chosen) |
|---|---|---|
| 1935 | 84.2/76.6/67.3/59.4 (11%) | 84.2/76.3/67.4/59.1 (8%) |
| 1938 | 84.6/77.4/69.8/61.9 (6%) | 84.5/77.1/69.6/60.9 (6%) |
| 1946 (excepted) | 77.9/70.0/62.4/54.1 (83%) | 78.6/70.5/63.0/54.1 (86%) |
| 1951 | 77.5/68.9/61.5/54.9 (83%) | 77.6/69.0/61.9/54.8 (81%) |
| 1957 | 80.1/69.9/62.2/56.7 (94%) | 78.0/68.0/60.2/52.5 (84%) |
| 1965 | 83.5/75.7/68.2/61.8 (13%) | 80.0/71.7/63.8/56.1 (75%) |
| 1975 | 82.3/74.0/67.5/61.8 (37%) | 79.9/71.0/63.6/55.2 (81%) |
| cells within ±3, openings from 1935 (1946–48 excepted) | 42% | **72%** |
| clubs above 85 outside a top flight, per opening (max) | 0.35 (90) | 0.14 (88), all in the 1930s |

### 1951, chosen constants (3 seeds): country/tier mean (max)

- **BEL:** 76.7 (83) / 68.4 (77)
- **ENG:** 77.0 (85) / 69.0 (77) / 61.8 (68) / 54.8 (63)
- **ESP:** 78.8 (86) / 68.6 (77)
- **FRA:** 77.7 (85) / 69.1 (76) / 63.1 (71)
- **GER:** 78.8 (86) / 69.5 (81) / 62.3 (72)
- **ITA:** 77.6 (88) / 69.2 (80) / 61.4 (71)
- **NED:** 77.2 (85) / 69.0 (76)
- **POR:** 77.1 (84) / 69.5 (77)

Other reads at 1951:

- Academy means by tier: 2.96/1.55/0.44/0.00.
- Intake potential: 75.3/64.7/53.6/44.0.
- Prodigies: 1.42 a year (1949 on).

## Market bands (top flight, per club and season; England beside)

| era (run) | fee in/out | ENG in/out | XI lost (by fee) | lower-division top-3 moving up | loans a season |
|---|---|---|---|---|---|
| 1951–55 (L51-base) | 3.22/3.24 | 3.45/3.52 | 2.58 (1.79) | 9.1% | 138 |
| 1951–60 (L51x10-final) | 3.17/3.20; 1958–60 2.87–3.07 | 3.52/3.52 | 2.44 (1.77) | 8.4% | 142 |
| 1958–61 without the 1960 anchor (L75-base) | 4.05–4.45 | | 2.36–2.74 (1.95–2.21) | 7.6–10.6% | 193–218 |
| 1965–75 (L75-base) | 3.8–4.0 | | 2.5–2.7 (1.95–2.17) | 7.6–9.8% | 182–185 |
| 1997–2001 (F95-base) | 3.76/4.04 | 4.63/5.05 | 2.31 (1.75) | 8.1% | 215 |
| bands | 2–4 (1946–61), 3–5 (1961–78), 3–6 (1978–2010), 4–8 / 3–6 (2010–) | | 2–3 (0.8–1.5) 1950s, 2.5–3.5 (1.5–2.5) modern | 20–30% 1950s, 40–60% modern | |

Sweeps on the chosen level constants (8 seeds):
- **1995 {6,3,3}** (F95-era): 3.21/3.42, XI 2.14 (1.62). This is at the band's lower edge, so the 1995 anchor stays {6,4,4}.
- **`NPC_MARKET.upgrade` 2** (L51): upward share 9.1→10.0%, fee 3.47/3.40, XI by fee 1.89. Too small to adopt, and it pushes XI-by-fee further above its band.
- **`valueWeight` 0.75** (L51): loans 138→162 a season, upward share 10.1%.
- **`valueYears` 5:** loans 138→126 (L51) and 215→212 (F95). It does not tame the T951 loan surge.
  - The loan rise follows `valueWeight`, since value ranking rates cheap loan listings well.
  - The remaining levers are `NPC_MARKET.loanAge` (23, which listings become loans) and `MARKET_CONFIG.loan` (0.1, the loan fee share). Neither was measured here.
- **2010 anchor:** not re-measured on T951. Before T951, {8,5,5} gave 7.98/7.53 (out above 3–6) and {7,4,3} gave 5.42/4.99. T951 cut 1995 volumes from 5.29 to 3.76 at the same caps, so {8,5,5} is left for a 2010-start read.

## Missed bands and rule-change suggestions (for gusta-update-ssot)

1. **Lower-division stars moving up: 8–10%, against 20–30% and 40–60%.** No constant reaches the band.
   - targetsPerNeed, searchSlack, upgrade, the CLUB-52 above-division row and value weights reach about 10% at most.
   - Tighter sales caps raise the share only by removing lateral moves.
   - This needs a rule change in WORLD-16's target choice, for example:
     - a need served first from the division below;
     - lateral buys only from lower-stature clubs;
     - a stronger price term than T951's.
2. **Bottom tiers stay high.** England's fourth tier sits at +4 to +6 and third tiers at +2 to +4 in 1965–75; the 1930s are +4 to +11 with flat founding.
   - `warRefill.below`, `divisionCentre` and skew move every tier about alike.
   - A per-tier war margin or youth offset would be a rule change, and would cover only part of it.
   - The rest is structural: lower divisions keep their stars and absorb released players from above.
3. **1930s founding overshoot.** It stays until WORLD-6's spread table is gated in. With 'spread' and narrow headroom, the 1935–38 cells reach 65–83% within ±3.
4. **XI lost by fee in the 1950s: 1.8, above 0.8–1.5,** while the total (2.4–2.6) is in band. A 1950 sales cap of 1 a window halves all moves (fee in/out 2.2/1.7 before T951), so the cap is left at 2.
