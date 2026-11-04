# T693 — the era's star pay spread on the giants' books (CLUB-48)

Measured 261104 from 07:10Z on hq-dev1-pve2-vm2 (12 cores, at most 10 jobs) on the released source
7241867b (code identical at 20e70405). Scripts: `scripts/era-wage-spread.ts` (books), `scripts/owner-balance.ts`
(careers; `--spread FILE` reads a candidate table as a measurement override of `STAR_SPREAD_CONFIG`).

A season Y is the one starting in Y (w.year = Y), its book settled at its close in the summer of Y + 1. Wage line:
the books' wage bill, the squad's alone (staff pay sits in operating expenses, →ECON-30), every player at his
market wage (→ECON-36). Each club's squad is also priced player by player the day before the close; that repricing
equals the settled book exactly in every row ("repriced = book"). A club's income, squad and strength do not depend
on wages before a takeover, so each candidate's wage bill is read on the same lived worlds (W80 × (W / W80)^s for
each star); its books' cash and debt would differ once history replays on the candidate, which the tables do not
read. In the held-out worlds every squad was also priced through the production function at the candidate table
(`exact = formula`: equal within a minor unit a star in every case).

## Files

- `books-calibration.md` — seeds `owner-balance-0`/`-1` × ENG ESP FRA GER × 1950/1970/1990/2010: the three
  strongest top-flight clubs and the top flight's median club at the released curve (revenue in millions of the
  season's minor units, wage bill / revenue split into the ordinary part and each star term), the least compression
  per case, and the candidate's verdict per case.
- `books-held-out.md` — seeds `owner-balance-2`/`-3` × the eight playable countries × 1960/1980/2000, the same
  tables; read after the anchors were set and not used to move them (its least-compression column is a diagnosis).
- `candidate.json` — the candidate table.
- `books-rows.tar.gz` — every row of the four lived worlds (each club's book, repricing and each star's W and W80).
- `careers-baseline.md`, `careers-candidate.md` (+ `-careers.json`) — LEAGUE-13's reference grid (six tiers ×
  ENG ESP FRA GER × seeds 0–1, no traits, 1950–1969, purse apart) on the released curve and on the candidate.

## Released curve (s = 1)

The strongest club's wage bill / revenue, and the band (median of the three strongest ≤ 70%, no club without a
project above 100%):

| | 1950 | 1970 | 1990 | 2010 |
|---|---|---|---|---|
| strongest-three median, calibration (8 cases a season) | 103.0–256.3% | 67.2–263.2% | 61.9–157.9% | 31.1–77.6% |
| cases meeting the band | 0 of 8 | 0 of 8 | 2 of 8 | 6 of 8 |

Held out at s = 1: 6 of 48 cases meet it (only 2000 cases in ENG, ESP, ITA, FRA).

Why: in every era the strongest club's income is only 1.2–1.7× its top flight's median club's (medians 1.34–1.51
by season, 56 cases), while its released wage bill is 2.6–10.5× the median club's (medians 6.0–7.8): an all-star
squad (18 players above OVR 80) pays the points above 80 (×1.105 a point) and the scarcity premium (up to ×2) in
full. The ordinary part alone (every star at his OVR-80 wage) is 30–56% of a giant's revenue in 1950 and 10–17% in
2010.

## Calibration — the least compression

Largest s (steps of 0.01) meeting the band per case; every case meets it at s = 0.

| season | ENG | ESP | GER | FRA | shared (least) |
|---|---|---|---|---|---:|
| 1950 | 0.64 / 0.59 (own anchor s = 0) | 0.52 / 0.46 | 0.49 / 0.43 | 0.28 / 0.27 | 0.27 |
| 1970 | 0.81 / 0.55 | 0.57 / 0.35 | 0.31 / 0.37 | 0.32 / 0.23 | 0.23 |
| 1990 | 0.70 / 1.00 | 1.00 / 0.85 | 0.58 / 0.72 | 0.62 / 0.57 | 0.57 |
| 2010 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.94 | 0.94 / 1.00 | 0.94 |

Never falling with time puts 1950 at 1970's 0.23. CLUB-48 sets s = 1 from 2008 at the latest, so 2010 is not an
anchor the band can set: at s = 1 two of its eight cases miss the band.

Candidate (`candidate.json`): shared [1970, 0.23], [1990, 0.57], [2008, 1], linear between and flat outside
(estimated: calibrated on the books, no primary record); England's own s = 0 through 1960/61 (the EFL's official
timeline: maximum wage £20 a week, abolished 18 January 1961). No other country's own anchor: no primary record of
a pay cap was read in this unit (no web access from the unit).

| | calibration (32 cases) | held out (48 cases) |
|---|---:|---:|
| released curve | 8 meet the band | 6 |
| candidate | 30 | 31 |

Calibration misses (2010, s = 1): FRA seed 0 — FRA:0:0:10 (str 95) pays 111.0% of its revenue; GER seed 1 — the
strongest-three median 77.6%, GER:1:0:12 (str 96) 100.3%.

Held-out misses (no anchor moved after reading them):

| season | cases meeting the band | misses |
|---|---:|---|
| 1960 (s 0.23, ENG 0) | 11 of 16 | NED ×2 (72.5, 75.0%), BEL ×2 (77.6, 73.4%), POR seed 3 (70.4%); no club above revenue |
| 1980 (s 0.40) | 13 of 16 | POR seed 2 (76.4%), BEL ×2 (70.5, 70.0%); no club above revenue |
| 2000 (s 0.81) | 7 of 16 | ITA seed 2 (93.5%), FRA seed 2 (91.9%), GER seed 3 (96.2%), POR ×2, NED ×2, BEL ×2; clubs without a project above revenue: POR:0:0:0 102.3%, BEL:0:0:5 108.5% (seed 2), NED:0:0:0 102.5%, BEL:0:0:7 119.6%, BEL:0:0:14 144.1% (seed 3) |

ENG, ESP, GER, ITA and FRA meet the band in all 20 held-out cases of 1960 and 1980; the 1960/1980 misses are the
three smaller leagues, whose missed cases would need s 0.14–0.22 in 1960 and 0.33–0.39 in 1980 (diagnosis only). In
2000 the ramp from 1990's 0.57 to 2008's 1 is too steep for 9 of the 16 cases (they would need 0.43–0.79).

Verdict: the candidate meets CLUB-48's band in 1950–1990 on the calibration books, but not in 2010 at the s = 1 the
SSOT fixes from 2008, and five held-out clubs without a project pay more than their revenue in 2000 — the exit's
commit condition fails, so the released curve stays (the tree's table is s = 1 everywhere, no own anchor).

## Careers — LEAGUE-13's reference grid, 1950–1969, no traits, purse apart

Wage line in these tables: the club's players, manager and staff (the operating costs' wage lines), as T686 read it.
Baseline: 46 careers (자수성가 pays for no Spanish club in any band). Candidate: worlds lived from 1930 on the
candidate table, 37 careers — 자수성가 and three 지역 유지 careers were not played within the timebox. Nothing else
was tuned. Each career took 14–16 minutes at 10 jobs on this host.

| tier | baseline: title / bankrupt / top-flight seasons (avg) | candidate | LEAGUE-13 |
|---|---|---|---|
| 석유 재벌 | 1 of 8 / 6 of 8 (ESP FRA GER, all in 1950) / 4.8 | 7 of 8 (median 2nd season, 18.4% after) / 0 / 19.6 | most win, median within 10; ≤35% after; none bankrupt |
| 재벌 총수 | 1 of 8 / 0 / 14.3 | 2 of 8 (3.7% after) / 0 / 19.1 | about half win; ≤30% after; none bankrupt |
| 산업 자본가 | 2 of 8 / 0 / 15.0 | 5 of 8 (9.6% after) / 0 / 19.9 | about a third win; ≤25% after; none bankrupt |
| 중견 사업가 | 1 of 8 / 0 / 10.6 | 3 of 8 / 0 / 15.5 | ≤1 in 5 win; top flight in most; ≤1 in 20 bankrupt |
| 지역 유지 | 0 of 8 / 0 / 11.0 | 0 of 5 / 0 / 15.2 | top flight in about half; ≤1 in 10 bankrupt |
| 자수성가 | 0 of 6 / 0 / 7.8 | not played | top flight in ≤1 in 4; ≤1 in 5 bankrupt |

Lower tiers on the baseline (the growth slice's readings): every 중견 사업가, 지역 유지 and 자수성가 reference reaches
the top flight (8/8, 8/8, 6/6; first top-flight season median 2, 4 and 5.5), with operating results of +19.7%,
+16.4% and +15.4% of revenue and wage bills of 44.2%, 46.4% and 44.0%.

ECON-29 on 중견 사업가 as played (160 seasons each):

| target | band | baseline | candidate |
|---|---|---|---|
| wage bill / revenue | 45–70% | 44.2% OUT | 39.0% OUT |
| operating result / revenue before trading | −5% to +10% | +19.7% OUT | +22.9% OUT |
| player sales / revenue (beside) | - | 9.0% | 5.3% |
| net result with sales (beside) | - | 28.7% | 28.3% |
| 1950s matchday / turnover | 60%+ | 70.7% ok | 70.5% ok |
| facility ladder in seasons of top-flight net | 25+ | 105.3 ok | 105.2 ok |
| bankrupt | none | 0 | 0 |

On the candidate no tier's club bankruptcies rise and 석유 재벌 meets its LEAGUE-13 row, but cheaper stars make
every club that buys them stronger: 중견 사업가 wins 3 of 8 (band ≤1 in 5), 산업 자본가 5 of 8, and the 중견
사업가 reference runs a larger surplus (ECON-29's operating row further out).
