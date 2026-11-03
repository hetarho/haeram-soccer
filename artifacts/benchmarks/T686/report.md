# T686 — owner balance on the new rules (LEAGUE-13 r13, ECON-36, ECON-29)

Measured 261104 00:42–02:45 KST on ihaelam-ui-MacBookPro (Apple M1 Max, 10 cores), at most 10 jobs at a time
(a 20-season career took 5–7 minutes a job, about 20 s a season). Script: `scripts/owner-balance.ts`.
Worlds lived from 1930 to 1950 (`generateHistory`, 4 s each) on seeds `owner-balance-0` and `owner-balance-1`;
a 1950 takeover in ENG ESP FRA GER, 기본 방향, every responsibility delegated, played to the 1969/70 close.

Files:
- `pass0.md`, `pass0-careers.json` — after the ECON-36 books fix, before tuning (OWNER_TIERS 1.3, living 0.25%):
  the reference (both seeds), the 50% dividend run (both seeds) and ECON-29's facility rule (중견 사업가).
- `pass1.md`, `pass1-reference-careers.json`, `pass1-dividend50-careers.json`, `pass1-dividend25-careers.json` —
  the tuned constants (OWNER_TIERS 1.6, living 0.2%): the reference (both seeds), 50% and 25% dividends (seed 0).
- `econ36-before.md` / `econ36-after.md` (+ careers) — the first owned season on the books before and after the fix.
- `top-books-1950-seed0.txt` / `-seed1.txt` — the ten strongest top-flight clubs' 1950 books per country.

## ECON-36 — the first owned season against the books

Before: a club nobody owns kept its founding following (18,000 in the top flight, 4,500 in the fourth tier, never
moved), while a buyer takes over the following its reputation commands (→CLUB-1; 360,000 at reputation 75). The
book read the stale figure for its gate (local supporters) and sponsors, so the owned club's first season earned
1.9–5.7× its books' last income at the top (6 of 23 probe careers within ±25%; the book's own lines at the owned
club's close were 2.4–4.6× its gate and 1.8–2.3× its commercial income at the takeover, while every line matched
the owned club's actual one within a few percent).

Fix (`packages/engine/src/books.ts`, `clubView`): the books read `clubFollowing` — the reputation's following —
for a club nobody owns; unit test `books.test.ts` (the lines do not move with the stored following).

After (41 reference careers that completed a season): 30 within ±25% — 석유 재벌 3/3, 재벌 총수 8/8, 중견 사업가 8/8,
자수성가 6/6, 산업 자본가 2/8, 지역 유지 3/8. Ten of the eleven outside changed division at the 1949 close (the
books' last season was played in the division before: promoted 2.3–2.9×, relegated 0.55–0.62); one English
third-division club stands at 1.34 (its gate 1.25× the book's neutral form). The 산업 자본가 band in 1950 is mostly
clubs just promoted to the top flight.

## LEAGUE-13 — reference careers, no traits, 2 seeds × 4 countries × 20 seasons

The club side is identical in pass 0 and pass 1 (only 지역 유지 ESP seed 0 changed club, from a substitute to the
band's median, once its fortune paid for it).

| tier | careers | first top-flight title | after the first | top flight reached | top-flight seasons | club bankrupt | target | verdict |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 석유 재벌 | 8 | 0 | - | 3 | 4.6 | 6 (ESP FRA GER, 1950–51) | most win, median within 10; ≤35% after; none bankrupt | OUT |
| 재벌 총수 | 8 | 0 | - | 8 | 12.9 | 0 | about half win; ≤30% after; none bankrupt | titles OUT |
| 산업 자본가 | 8 | 1 (2nd season) | 0 of 18 | 8 | 13.4 | 0 | about a third win; ≤25% after; none bankrupt | titles OUT |
| 중견 사업가 | 8 | 1 (14th season) | 0 of 6 | 8 | 9.4 | 0 | ≤1 in 5 win; top flight in most; ≤1 in 20 bankrupt | ok |
| 지역 유지 | 8 | 0 | - | 8 | 8.5 | 0 | top flight in about half; ≤1 in 10 bankrupt | reach OUT |
| 자수성가 | 6 | 0 | - | 6 | 7.8 | 0 | top flight in ≤1 in 4; ≤1 in 5 bankrupt | reach OUT |

자수성가 has no Spanish club its fortune pays for in any band (ESP holds no club among the cheapest 20%; its clubs in
지역 유지's band cost 1.7–2.2× a 자수성가 fortune), so it has six careers.

Why the bands miss (outside the named constants):
- 석유 재벌: the band's median club is often a giant whose wage bill exceeds its income: in 1950 the strongest club
  of each country (strength 92–98) pays 1.8–3.3× its income in wages and several more above 85 pay more than they
  earn (`top-books-*.txt`; CLUB-25's ×1.105 a point and the star premium, against a revenue that a giant's
  catchment and following lift by at most about half over a mid-table club's), so their books
  sit at the debt bound with no cash, and the owned club, inheriting the squad and its wages, runs out of cash in
  its first rounds whatever the books, the loan or the price.
- titles: a delegated club that moves no owner money rarely wins within 20 seasons (2 of 48 careers), and the
  재벌 총수 and 산업 자본가 clubs spend about a third of their seasons in the second tier.
- lower tiers rise in every career: the as-played club runs an operating surplus of 18.9% of revenue (ECON-29 below)
  with nothing to build (→ECON-32), which the 단장 spends on upgrades.

## Owner — passive bankruptcy (reference, living costs read from the fortune left) and dividends

| constants | bankrupt within 15 seasons | earliest | note |
|---|---:|---:|---|
| 1.3×, 0.25% (pass 0) | 14 of 38 | 3rd season (지역 유지 ESP, left 2–3% of his fortune) | chaebol 2, industrial 4, midsize 4, local 3, selfmade 1 |
| 1.6×, 0.2% (pass 1) | 0 of 38 | 17th (지역 유지 ESP ×2: 17, 18) | the others had used 41–87% of their fortune by 1969 |
| 석유 재벌 (10×) | 0 | - | - |

Dividends (seed 0, pass 1): 50% — no owner bankrupt, 퇴진 5 of 23 (seasons 13–19); the last close's fortune
(median, units) 석유 재벌 3.12M (4.58M left at the takeover), 재벌 총수 118k (132k), 산업 자본가 90k (94k),
중견 사업가 89k (33k), 지역 유지 53k (16k), 자수성가 45k (7k). 25% — 퇴진 1 of 19 (20th season); 재벌 총수 72k,
산업 자본가 63k, 중견 사업가 44k, 지역 유지 29k, 자수성가 27k.

## ECON-29 — 중견 사업가 reference, 8 careers, 160 seasons (1950–69)

| target | band | as played (builds nothing) | with ECON-29's facility rule |
|---|---|---|---|
| wage bill / revenue | 45–70% | 45.6% ok | 44.8% OUT |
| operating result / revenue before trading | −5% to +10% | +18.9% OUT | −5.6% OUT (before construction +16.5%) |
| player sales / revenue (beside) | - | 13.7% | 13.3% |
| net result with sales (beside) | - | 32.6% | 7.6% |
| 1950s matchday / turnover | 60%+ | 73.7% ok | 74.1% ok |
| facility ladder in seasons of top-flight net | 25+ | 88.1 ok | 92.5 ok |
| bankrupt | none | 0 | 0 |

The 2000s income mix is not reached in 20 seasons. Early-decade gates against wages (ECON-9 suggest): the wage bill
stays at 45% of revenue with matchday 74% of it in the 1950s.

## Constants (old → new), one tuning pass

- `OWNER_TIERS[재벌 총수, 산업 자본가, 중견 사업가, 지역 유지, 자수성가].multiple` 1.3 → 1.6
- `OWNER_LIVING.rate` 0.0025 → 0.002
- unchanged: `CLUB_BOOKS`, `TAKEOVER_DEBT`, `CLUB_VALUE`, the bands and 석유 재벌's 10×, `FAN_MOOD` — none of them
  moves a band above (the giants' deficit comes before any loan or opening cash; lower clubs rise on their own
  surplus; 퇴진 has no band).
