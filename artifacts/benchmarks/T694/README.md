# T694 — CLUB-48's W80 at the player's own potential, T693's candidate re-read

Measured 261104, 09:38–09:41Z on hq-dev1-pve2-vm2 (12 cores, four jobs), on 44f68bf9 with this task's source
changes (production `marketWageUnits` W80 through `ordinaryWageUnits`, the player's own age and potential, CLUB-48
r53). Script: `scripts/era-wage-spread.ts`. Production is unchanged at s = 1 (the table in force: s = 1 in every
country and season, no own anchor), so the lived worlds are T693's.

## What changed

Under a spread s below 1 a star's wage is W80 × (W / W80)^s. T693 priced W80 at OVR 80 with his potential lowered
alike (potential − (OVR − 80)), which paid an 18-year-old of potential 99 1,055.9 units at OVR 81 against 1,077.2 at
80 (s = 0; 1,067.0 at s = 0.1). CLUB-48 r53 prices W80 at OVR 80 with his own age and potential: at every s a wage
never falls as OVR or potential rises (unit tests over ages 15–36, divisions 0/1/2/4, spreads 0–0.99, which fail on
the lowered W80). Only players under 24 carry promise in their wage (`MARKET_CONFIG.promise`), so every star aged
24+ keeps T693's W80; a young star's compressed wage rises by (W80 r53 / W80 T693)^(1 − s).

## Files

- `books-calibration.md` — seeds `owner-balance-0`/`-1` × ENG ESP FRA GER × 1950/1970/1990/2010: the books at the
  released curve (each star's wage split into its ordinary part, points above 80, scarcity premium and top-flight
  terms), the least compression per case beside T693's W80 (`--fit`), and T693's candidate per case beside T693's
  reading.
- `books-held-out.md` — seeds `owner-balance-2`/`-3` × the eight playable countries × 1960/1980/2000, the same tables
  (its least-compression column is a diagnosis, never used to move an anchor).
- `books-rows.tar.gz` — every row of the four freshly lived worlds; each star holds [W, W80 r53, T693's W80, age].
- Candidate: `artifacts/benchmarks/T693/candidate.json`, unchanged (shared [1970, 0.23], [1990, 0.57], [2008, 1];
  England's own s = 0 through 1960/61).

Commands:

    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
      --countries ENG,ESP,FRA,GER --spread artifacts/benchmarks/T693/candidate.json --out books-cal-0.json
    (owner-balance-1 likewise; owner-balance-2/-3 with --years 1960,1980,2000 and all eight countries)
    pnpm exec tsx scripts/era-wage-spread.ts --in books-cal-0.json,books-cal-1.json --books --fit \
      --spread artifacts/benchmarks/T693/candidate.json --label "T693's candidate, unchanged"
    (held-out likewise)

## Checks

- Fresh worlds equal T693's: all 4,658 rows (976 + 976 + 1,353 + 1,353) carry the same books (income, wages, costs),
  squad repricing, strength, tier and project, and all 11,737 stars the same W and T693's W80 as T693's archived rows.
  W80 moved for 3,843 stars, none aged 24 or more.
- `repriced = book` in every row shown (128 calibration, 192 held-out): the split of each star's wage sums to the
  settled wage bill.
- `exact = formula` in every case (32 + 48): each squad priced through the production function at the candidate
  equals the formula on the rows within a minor unit a star.

## Calibration — least compression per case (largest s, steps of 0.01, meeting the band)

| season | shared s, r53's W80 | T693's W80 |
|---|---:|---:|
| 1950 | 0.26 | 0.27 |
| 1970 | 0.22 | 0.23 |
| 1990 | 0.57 | 0.57 |
| 2010 | 0.94 | 0.94 |

Per case the largest s falls by 0–0.01 (every case's row is in `books-calibration.md`). Never falling with time now
puts 1950 and 1970 at 0.22, against the candidate's 0.23.

## T693's candidate on r53's W80

| | calibration (32 cases) | held out (48 cases) |
|---|---:|---:|
| T693's reading (lowered W80) | 30 meet the band | 31 |
| r53's W80, same books | 29 | 31 |

Calibration: FRA seed 1, 1970/71 (s 0.23) moves from ok to OUT, its strongest-three median 69.2% → 70.5%; the two
2010 misses stay (s = 1, both readings identical: FRA:0:0:10 str 95 at 111.0% of its revenue; GER seed 1's median
77.6%, GER:1:0:12 at 100.3%). Held out: no verdict moves; the same 17 misses, and the same five clubs without a
project above their revenue in 2000, a little higher: POR:0:0:0 102.8% (T693 102.3%), BEL:0:0:5 109.1% (108.5%),
NED:0:0:0 103.0% (102.5%), BEL:0:0:7 120.3% (119.6%), BEL:0:0:14 144.7% (144.1%). Held-out least compression
(diagnosis): 1960 0.12 (T693 0.14), 1980 0.32 (0.33), 2000 0.42 (0.43).

Change against T693's reading, at the candidate's s per case:

| season (s) | strongest-three median | case wage bill (all clubs) | largest rise of one star's wage | under-24 share of the change |
|---|---|---|---:|---:|
| 1950 (ENG 0, else 0.23) | +0.5 to +1.6 pp | +0.4 to +0.6% | 29.6% | 100% |
| 1960 held out (ENG 0, else 0.23) | +0.3 to +1.7 pp | +0.3 to +0.8% | 34.9% | 100% |
| 1970 (0.23) | +0.4 to +1.4 pp | +0.4 to +0.7% | 24.0% | 100% |
| 1980 held out (0.40) | +0.3 to +1.3 pp | +0.4 to +0.7% | 19.7% | 100% |
| 1990 (0.57) | +0.3 to +0.8 pp | +0.3 to +0.5% | 13.7% | 100% |
| 2000 held out (0.81) | +0.1 to +0.6 pp | +0.1 to +0.3% | 5.9% | 100% |
| 2010 (1) | none | none | none | - |

About a third of the stars are under 24 (young stars / stars per case in the tables). The largest single rises are
the youngest stars of the highest OVR: r53's W80 counts the promise of his potential above 80, T693's only the
headroom left above his OVR, so the two differ by 0.2 × (OVR − 80) points at 18 — at most 1.105^3 ≈ ×1.35 at
s = 0 (OVR 95, age 18), ×1.26 at 0.23. That is larger than the task's grid estimate (up to 8% at 0.23); these
squads' 18–19-year-old stars of OVR 90+ reach it. A case's wage bill moves far less (under 1%), as most stars are
24 or older.

## Verdict

The correction leaves T693's reading in place: the spread alone meets CLUB-48's band in 1950–1990 on the big
leagues' books (now 23 of 24 calibration cases 1950–1990 at the candidate, FRA 1970 seed 1 just over at 70.5%),
not in 2010 at the fixed s = 1, not for POR NED BEL in any era and not in 2000. No anchor moved, no table committed:
production stays at s = 1. The second-mechanism slice re-fits the table on these books (1950/1970 at 0.22 on the
spread alone).

Not re-run: careers on the candidate (LEAGUE-13's grid) — the candidate is not in force and the next slice re-fits
the table with its second mechanism; T693's careers (`artifacts/benchmarks/T693/careers-*.md`) priced young stars on
the lowered W80.
