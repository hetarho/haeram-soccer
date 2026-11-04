# T696 — LEAGUE-10's means level with CLUB-48's table, through CLUB-48's gate

Measured 261104, 10:25–11:30Z on hq-dev1-pve2-vm2 (12 cores, at most 10 jobs), on 44a341ee with this task's source
changes: `MEANS_LEVEL` (off), `meansLevel` and `squadCostAt` in `packages/engine/src/dynamics.ts`, read by production
`evolveClubs`; `scripts/era-wage-spread.ts --means` and `scripts/owner-balance.ts --means` turn it on beside a
`--spread` table, measurement overrides only. The table measured: `candidate.json` — shared s 0.22 through 1970, 0.57
at 1990, 1 from 2008 (linear, flat outside); England's own s = 0 through 1960/61.

**Verdict: the gate fails on its champions part, so nothing enters production.** `STAR_SPREAD_CONFIG` stays s = 1 with
no own anchor and `MEANS_LEVEL.inForce` stays false; the mechanism, its unit tests and both overrides stay in the
tree.

| gate part (CLUB-48 r55) | worlds read | result |
|---|---|---|
| fit | T694's books (worlds without the means level) | pass: least compression 1950 0.26, 1970 0.22, 1990 0.57, 2010 0.94 → never falling, 0.22 through 1970, 0.57 at 1990, 1 from 2008 |
| books | four worlds lived with the table and the means level | pass: 32 of 32 calibration cases meet the strongest-three median ≤ 70%; no club without a project above its revenue in any of 32 + 48 cases |
| champions | four released and four candidate worlds, 1980–2009 | **fail**: 27 of 32 country-seeds pass; per country over its four seeds GER (8 → 12 points outside the band) and POR (1 → 2) end further out than released |
| careers (task check) | 16 careers on the candidate | see below |

## Files

- `candidate.json` — the table measured.
- `fit-calibration.md`, `fit-held-out.md` — `--fit` and the table on T694's books (worlds without the means level). The
  `exact = formula` column there compares T694's rows, priced at T693's 0.23, with this table's 0.22, so its `no`
  cells say only that the tables differ.
- `books-calibration.md`, `books-held-out.md` — the books of the worlds lived with the table and the means level, the
  gap between each book's wage bill and its generated squad's at the same strength, and where the means level bound
  (club-seasons sold down / strength points sold, per country and decade).
- `champions.md` — champions 1980–2009 per country and seed, released against candidate, and per country pooled;
  seconds per lived season.
- `books-rows.tar.gz` — the eight worlds' rows and `.extra.json` (each season's champions, every club the means level
  sold down, seconds per season).
- `careers.md`, `careers-careers.json` — the 16 careers on the candidate.

Commands (each world one job, eight in parallel beside two 1950-world jobs):

    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
      --countries ENG,ESP,FRA,GER --until 2010 --spread artifacts/benchmarks/T696/candidate.json --means \
      --out candidate-0.json                      (seed 1 likewise; released: the same without --spread/--means)
    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-2 --years 1960,1980,2000 \
      --countries ENG,ESP,GER,ITA,FRA,POR,NED,BEL --until 2009 ... (seed 3 likewise)
    pnpm exec tsx scripts/era-wage-spread.ts --in candidate-0.json,candidate-1.json --lived \
      --extra candidate-0.extra.json,candidate-1.extra.json
    pnpm exec tsx scripts/era-wage-spread.ts --champions-released released-{0..3}.extra.json \
      --champions-candidate candidate-{0..3}.extra.json
    pnpm exec tsx scripts/era-wage-spread.ts --in T694/books-cal-{0,1}.json --fit --spread candidate.json
    pnpm exec tsx scripts/owner-balance.ts --tiers oil --countries ENG --seeds 1 --first-seed 0 --until 1969 \
      --purse-apart --spread candidate.json --means --world-dir DIR --out oil-ENG-0.json   (16 jobs)

## Fit (worlds without the means level, T694's books)

Least compression per season over the calibration cases: 1950 0.26, 1970 0.22, 1990 0.57, 2010 0.94 (England's 1950
cases left out, at its own anchor). Never falling with time and 1 from 2008: 0.22 through 1970, 0.57 at 1990, 1 from
2008 — the table measured, each shared anchor estimated (no primary record); England's own anchor is the EFL's
official timeline of the maximum wage (£20 a week, abolished 18 January 1961), s = 0 through 1960/61. On those books
the table meets the band in 30 of 32 calibration cases, the two 2010 misses at the fixed s = 1 (FRA:0:0:10 str 95 at
111.0% of its revenue; GER seed 1's median 77.6%, GER:1:0:12 at 100.3%), as T694 read them. Held out (diagnosis): least
compression 1960 0.12, 1980 0.32, 2000 0.42; 31 of 48 cases meet the median.

## Books (worlds lived with the table and the means level)

Calibration, seeds 0/1 × ENG ESP FRA GER × 1950/1970/1990/2010: 32 of 32 cases meet CLUB-48's band, no club without a
project above its revenue. The two 2010 misses are gone: FRA's strongest club plays at 90 (57.0% of its revenue)
where it played at 95 (111.0%); GER seed 1's strongest pays 98.1% and the median is 64.4% (77.6%).

Held out, seeds 2/3 × the eight countries × 1960/1980/2000: no club without a project above its revenue in any of the
48 cases (the gate); the strongest-three median (diagnosis) meets 70% in 46 (POR 1960 seed 3 80.0%, FRA 2000 seed 2
70.6%). Every club above 100% in these tables has a project (ITA 2000 seed 2 str 99 106.0%, NED 2000 seed 2 str 93
101.9%, GER 2000 seed 3 str 94 100.7%, BEL 2000 seed 3 str 96 163.8%).

Gap: a book's wage bill against its generated squad's at the same strength, median 1.000 in every case, 0.989–1.020
over every club: the books' squad (`continuousSquad`, retained people included) and the generated squad the means
level prices are the same squad within 2%.

Where it bound (club-seasons sold down / strength points sold, summed over two worlds, every division):

| | POR | NED | BEL | FRA | ESP | GER | ITA | ENG |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| calibration seeds, 1930–2010 | 304 / 598 | 325 / 662 | 434 / 951 | 80 / 140 | 20 / 41 | 18 / 41 | 14 / 24 | 8 / 14 |
| held-out seeds, 1930–2009 | 338 / 677 | 379 / 763 | 471 / 1023 | 79 / 140 | 18 / 36 | 16 / 30 | 16 / 31 | 7 / 8 |

Nearly every hold is a top-flight club (the table's last column in the books files); in POR NED BEL most summers hold
two or three of the giants by 1–4 points, in every decade; in ENG ESP GER ITA it binds only from the 1990s, on one or
two clubs a season.

## Champions 1980–2009 (LEAGUE-10: 5–9 different champions, the most titles of one club 8–15)

27 of 32 country-seeds stay within the band or no further out than released; failing: BEL seed 0 (9 / 11 → 10 / 7),
GER seed 0 (4 / 15 → 3 / 18), POR seed 2 (7 / 12 → 10 / 13), ITA seed 3 (3 / 14 → 3 / 17), NED seed 3 (6 / 16 →
4 / 11). Per country over its four seeds (points outside the band summed): BEL 11 → 3, ENG 4 → 2, ESP 23 → 10, FRA
9 → 5, GER 8 → 12, ITA 6 → 4, NED 1 → 1, POR 1 → 2. Over all 32 country-seeds the candidate is nearer the band (63 → 39
points outside, 12 → 20 country-seeds inside), but the gate reads each country, and GER and POR end further out.

The failures are the mechanism's, not only the worlds' divergence (`.tmp`-free reading of the extras):

- the big leagues concentrate: the means level holds the challenger whose book cannot pay and leaves the richest
  giant its stars — GER seed 0 held GER:0:0:15 at 92 four times in 1994–99 while GER:0:0:14 went from 15 to 18
  titles; ITA seed 3 held ITA:0:0:7 and ITA:0:0:4 while ITA:0:0:15 went from 12 to 17.
- the small leagues level out: every giant is held nearly every summer — POR seed 2 held 36 club-seasons in 1979–2009
  (32 of them champions of the window), and ten clubs won the title where seven did.

## Cost

Seconds per lived season, 1930–2010 worlds (calibration seeds, the same host and the same eight parallel jobs):
released 2.05 / 2.06 s, candidate 2.40 / 2.41 s (+17%); held-out worlds to 2009 2.09 / 2.03 against 2.40 / 2.38 s.
The candidate run also prices each book-keeping club's squad twice at the four row seasons (under 1% of the run).

## Careers

(filled below)

## Proposed next mechanism

The books' income (ECON-36: league distribution, gate, commercial) leaves out the continental prizes (EURO-7) and
domestic cup prizes (LEAGUE-5) the same clubs earn on the owner's scales, which in real football fund the small
leagues' giants and the big leagues' challengers alike. Counting them in a book is earned income, not a subsidy;
screen it first on the lived books (re-read who would be held with each club's season prize money) before living any
world, then re-run this gate unchanged.
