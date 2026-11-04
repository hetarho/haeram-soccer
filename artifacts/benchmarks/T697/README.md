# T697 — competition money in the books, through CLUB-48's gate

Measured 261104, 11:48–12:01Z on hq-dev1-pve2-vm2 (four jobs at a time), on 702c20f1 with this task's source
changes: `BOOK_COMPETITIONS` (off) and `bookCompetitionMoney` in `packages/engine/src/books.ts`, the shared prize
helpers (`cupTiePrize`, `cupTitlePrize` in cups.ts; `europeMatchPrize`, `europeTiePrize`, `europeTitlePrize` in
europe.ts; `resultBonus` in finance.ts, read by the owner's credits and by the books), `meansLevel`'s `extra` (a
measurement counterfactual, 0 in play); `scripts/era-wage-spread.ts --cups / --observe-cups / --screen` and
`scripts/owner-balance.ts --cups`, measurement overrides only.

**Verdict: the screen passes, the fit and books parts pass, the champions part fails again, so nothing enters
production.** `STAR_SPREAD_CONFIG` stays s = 1 with no own anchor, `MEANS_LEVEL.inForce` and
`BOOK_COMPETITIONS.inForce` stay false; the careers were not run (the task runs them only after fit, books and
champions pass). Re-lived released worlds equal T696's released worlds (books, holds and champions), so the shared
helpers moved no released number.

| part | worlds read | result |
|---|---|---|
| screen | T696's four candidate worlds re-lived, competition money observed (equal to T696's) | go: top-flight holds released GER 15 / 29 (52%), POR 300 / 616 (49%), pooled over four worlds |
| fit | seeds 0/1 lived without the means level, competition money in force | least compression 1950 0.30, 1970 0.28, 1990 0.61, 2010 0.98 → `candidate.json`: 0.28 through 1970, 0.61 at 1990, 1 from 2008; England's own s = 0 through 1960/61 unchanged |
| books | four worlds lived with the table, the means level and competition money | pass: calibration 32 / 32 in the band; no club without a project above its revenue in 32 + 48 cases (held-out medians 46 / 48 ≤ 70%: POR 1980 seed 2 70.1%, FRA 2000 seed 2 74.0%) |
| champions | the same worlds against T696's released extras, 1980–2009 | **fail**: 29 of 32 country-seeds (T696 27); pooled per country GER 8 → 11 and POR 1 → 2 points outside LEAGUE-10's spread (T696: 12 and 2); BEL 11 → 4, ESP 23 → 9, FRA 9 → 7, ITA 6 → 3, ENG 4 → 2, NED 1 → 0 |
| careers | - | not run |
| cost | released, T696 candidate and T697 worlds lived here one set after another, four jobs each | 1.49 / 1.66 / 1.69 s a lived season: +13.1% against released, +1.7% against T696's candidate |

## Files

- `screen.md` — competition money's share of the three strongest top-flight clubs' income per country and decade,
  split into prizes with result bonuses and home gates; every hold of T696's candidate worlds with the level its book
  would have kept with that season's competition money in it (one-step counterfactual, `meansLevel`'s own search).
- `fit-calibration.md` — `--fit` on seeds 0/1 lived without the means level with competition money in force, and
  the candidate table on those books (30 of 32: the 2010 misses at the fixed s = 1, FRA:0:0:10 str 95 at 102.7% of its
  revenue, GER seed 1's median 71.0%).
- `candidate.json` — the table measured.
- `books-calibration.md`, `books-held-out.md` — the books of the worlds lived with the table, the means level and
  competition money, and where the means level bound (club-seasons sold down / strength points sold).
- `champions.md` — champions 1980–2009 per country and seed against T696's released worlds; seconds per lived season.
- `rows.tar.gz` — the gate and fit worlds' rows and extras, the screen worlds' extras (`competitions`: every
  top-flight book's money at every close; `sold` with `book`, `money`, `withMoney`), and the cost runs' extras.

Commands:

    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
      --countries ENG,ESP,FRA,GER --until 2010 --spread artifacts/benchmarks/T696/candidate.json --means \
      --observe-cups --out screen-0.json                     (seed 1 likewise; seeds 2/3: --years 1960,1980,2000
                                                              --countries ENG,ESP,GER,ITA,FRA,POR,NED,BEL --until 2009)
    pnpm exec tsx scripts/era-wage-spread.ts --screen screen-{0..3}.extra.json
    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 1950,1970,1990,2010 \
      --countries ENG,ESP,FRA,GER --cups --out fit-0.json   (seed 1 likewise)
    pnpm exec tsx scripts/era-wage-spread.ts --in fit-0.json,fit-1.json --fit --spread candidate.json
    pnpm exec tsx scripts/era-wage-spread.ts ... --spread artifacts/benchmarks/T697/candidate.json --means --cups \
      --out gate-0.json                                     (seeds 0–3 as the screen)
    pnpm exec tsx scripts/era-wage-spread.ts --in gate-0.json,gate-1.json --lived --extra gate-0.extra.json,gate-1.extra.json
    pnpm exec tsx scripts/era-wage-spread.ts --champions-released T696/released-{0..3}.extra.json \
      --champions-candidate gate-{0..3}.extra.json

## What a book counts

At each close a club nobody owns' competition money is what the owner's club is paid for the same matches
(`bookCompetitionMoney`): each cup tie won by the rounds left after it and the cup title; each continental phase
match with its draw or win, each knockout tie played (qualifiers and the Super Cup's included) and each continental
title but the Super Cup's; each cup and continental match's result bonus at its division's prestige; each home
match's gate at its division and reputation at scale 1 (the book's league gate a match without `leagueMatchFactor`).
The Super Cup, played out at the close without a match settlement, pays its tie only, as the owner's is paid.
Hosting costs stay outside the books. League matches add nothing.

## Screen

Competition money is 4–11% of the three strongest top-flight clubs' income in every country and decade, almost all of
it home gates: prizes with result bonuses are 0.0–0.4% of income (largest in the 2000s–2010s). That is the finding
the task foresaw for EURO-7/ECON-31: on each club's own broadcasting index the continental prizes read tiny beside a
league's distribution; a later update-ssot may price them on UEFA's published distributions.

One step, at T696's table: the money would release about half the top-flight holds in every country with holds (GER
15 of 29, POR 300 of 616, NED 332 of 671, BEL 351 of 869, FRA 97 of 149), above the quarter needed to go on.

## Fit and the lived worlds

Counting the money raises the giants' revenue, so the fit's least compression rises in every season (1950 0.26 →
0.30, 1970 0.22 → 0.28, 1990 0.57 → 0.61, 2010 0.94 → 0.98): the table pays the era's stars more. Lived with that
table, the means level binds about as often as in T696's worlds, not half as often: top-flight club-seasons sold down
(calibration + held-out seeds, the division after the close) POR 642 → 541, NED 704 → 627, BEL 905 → 816, ESP 38 → 33,
ENG 15 → 7, but GER 34 → 50, ITA 30 → 48 and FRA 159 → 182. The money a challenger earns is matched by the dearer
stars the refitted table prices.

## Champions

The two failing countries fail in one seed each, as champions concentrate:

- GER seed 0: released 4 different champions, the most titles 15; candidate 3 / 17. GER:0:0:14 wins 17 of 30 (T696's
  candidate 18); its challenger GER:0:0:15 is held in five summers of the 1990s (94 → 92–93) and wins 8 (released 10).
- POR seed 1: released 4 / 13; candidate 8 / 17. POR:0:0:5 wins 17 (released 12) while the released 13-title
  champion POR:0:0:10 is held in 14 summers 1975–2007 by 1–5 points and wins 3.

The cup and European money follows the titles, so the champion's book keeps its stars while its nearest challenger's
is held. Every other country ends closer to LEAGUE-10's spread than released, and pooled over all eight the
candidate is 38 points outside against released 63 (T696 39).

## Cost

Lived on this host one set after another (four jobs at a time): released 1.48 / 1.54 / 1.52 / 1.45 s a season (seeds
0–3), T696's candidate re-lived 1.67 / 1.68 / 1.68 / 1.63 s, T697's 1.64 / 1.71 / 1.70 / 1.71 s; means 1.49 / 1.66 /
1.69 s. T696's own figures (2.05 / 2.40 s) came from a more loaded host and are context only.
