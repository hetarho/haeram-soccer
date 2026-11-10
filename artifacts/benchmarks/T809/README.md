# T809 — the search ceiling above our eleven and the takeover season's revenue (ECON-16, CLUB-26)

A measured result, not a gate. T785's two settings go in force: `SEARCH_CEILING` `xi` (영입 기조's
ability ceiling never below our starting XI's mean slot value + 5, ECON r54) and
`REVENUE_SINCE_TAKEOVER` `books` (a club bought this season reads last season from its books,
CLUB r67). The released readings (`fixed`, `released`) and `open` stay selectable only through
`scripts/record-fees.ts --setting`.

Verdict: the strongest careers now upgrade (석유 재벌 s0 and s2, XI 83–84: no upgrade in three
seasons released, 4 / 2 / 0 and 5 / 3 / 0 in force) and the wage-bill ceiling no longer passes
over the first season's candidates (released: every one of the list's five dearest on every day
from the takeover to round 1, revenue £0; in force: none, revenue £33–40m). The dearest signing stands at
0.21–0.28× the standing record in the first three seasons (0.14–0.16 released), 0.5× in 0 of 4
careers, as T785 measured `xi` alone; the target still waits on what the list ranks first among
equally able players (review F10).

- tree: `2bf91440` plus this task's change
- host: ihaelam-ui-MacBookPro (Apple silicon), one career at a time; careers 20–30 s a season
- worlds: `generateHistory(seed, 2000)` for `spread-0` (40 s), `spread-1` (39 s), `spread-2` (48 s),
  kept outside the tree
- careers: T785's — ENG, a takeover on 1 August 2000 of LEAGUE-13's reference club of the tier
  (석유 재벌 = `oil`, 재벌 총수 = `chaebol`), every responsibility delegated, recruitment's 재정 기조
  공격적, a quarter of the fortune put in on each season's first day, 2000/01–2002/03
- record: the British record standing that season (£22.5m / £28.1m / £29.1m, as T785)
- reads: T785's regular looks (every 7th day of an open window) and, new here, one read on the
  takeover day and on every day after it until the first league round is played; each reads the
  list's five dearest players through 재정 기조's checks, the first check that passes him over named
- upgrades: the 단장's completed upgrade signings (fee or free) each season, read from his bids
  every day; beside it, for T785's careers too, the upgrade bids made by each season's last look
- files: `force-*.json` the rules in force (`xi` · `books`), three seasons; `released-*-2000.json`
  the released readings (`fixed` · `released`), first season only, for the days to round 1;
  `report.md`: `--in … --brief` over these and T785's `base-`, `xi-` and `revenue-` careers

## Commands

```
pnpm exec tsx scripts/record-fees.ts --seed spread-0 --prepare --world-dir DIR
pnpm exec tsx scripts/record-fees.ts --seed spread-1 --tier oil --finance aggressive --inject 0.25 \
  --until 2002 --world-dir DIR --out force-s1-oil.json --brief
pnpm exec tsx scripts/record-fees.ts --seed spread-1 --tier oil --finance aggressive --inject 0.25 \
  --until 2000 --setting fixed+released --world-dir DIR --out released-s1-oil-2000.json --brief
pnpm exec tsx scripts/record-fees.ts --in a.json,b.json --brief > report.md
```

## Results

The dearest fee signing of each season against the record, the best of the first three seasons,
and the 단장's upgrades:

| career | XI at takeover → after 2002/03, in force | ceiling in force | released (T785 `base`) | in force (`xi` · `books`) | best, released → in force | upgrade bids a season, released → in force | upgrades completed in force |
|---|---|---|---|---|---|---|---|
| s0 석유 재벌, ENG:0:0:0 | 83 → 91 | 88 → 96 | - / - / 0.14 | 0.24 / 0.28 / - | 0.14 → 0.28 | 0 / 0 / 0 → 4 / 2 / 0 | 4 / 2 / 0 |
| s1 석유 재벌, ENG:0:0:9 | 81 → 87 | 86 → 92 | 0.14 / 0.15 / 0.14 | 0.14 / 0.15 / 0.26 | 0.15 → 0.26 | 4 / 3 / 1 → 4 / 3 / 3 | 4 / 3 / 3 |
| s2 석유 재벌, ENG:3:0:21 | 84 → 91 | 89 → 96 | 0.15 / - / - | 0.25 / 0.18 / - | 0.15 → 0.25 | 0 / 0 / 0 → 5 / 3 / 0 | 5 / 3 / 0 |
| s0 재벌 총수, ENG:2:0:8 | 72 → 86 | 85 → 91 | 0.16 / 0.14 / 0.16 | 0.14 / 0.14 / 0.21 | 0.16 → 0.21 | 5 / 2 / 2 → 4 / 3 / 2 | 4 / 3 / 2 |

On the released ceiling (85) the same XIs stood at 83 → 88, 81 → 85, 84 → 89 and 72 → 84 (T785's
`base` looks).

The first season's wage-bill ceiling (재정 기조 공격적, 75% of the revenue over the last 12 months):

| career | released: days to round 1 | in force: days to round 1 | regular looks, either |
|---|---|---|---|
| s0 석유 재벌 | 35 of 35 refused on 7 of 7 days, revenue £0 | 0 of 35, revenue £35.7m on the takeover day | 0 of 45 |
| s1 석유 재벌 | 35 of 35 on 7 of 7, £0 | 0 of 35, £39.7m | 0 of 45 |
| s2 석유 재벌 | 35 of 35 on 7 of 7, £0 | 0 of 35, £36.9m | 0 of 45 |
| s0 재벌 총수 | 35 of 35 on 7 of 7, £0 | 0 of 35, £33.0m | 0 of 45 |

- The released first seasons reproduce T785's `base` rows on this tree (dearest ×0.00 / 0.14 / 0.15
  / 0.16 in 2000/01), and the in-force s0 and s1 석유 재벌 careers repeat T785's `xi` rows exactly
  (0.24 / 0.28 / -, 0.14 / 0.15 / 0.26): for them the XI's ceiling is what moves the fees, and
  `books` changed none of their signings, as T785 found on s1.
- `xi` is what lets a strong club upgrade: s0 and s2 (XI 83–84) made no upgrade at all in three
  seasons on the released ceiling (85: no listed player beat a starter by 공격적's margin, 2) and 6
  and 8 in force. The ceiling follows the XI it lifts (s0 88 → 96 as the XI went 83 → 91), so the
  list's dearest player rose from £3.4–5.0m on the released ceiling to £6.5–10.6m by the end.
- `books` is what clears the first days: on the released reading the revenue over the last 12
  months is £0 from the takeover day until round 1 (7 days), so the wage-bill ceiling passes over
  every candidate; read from the books it is £33–40m, and none is passed over. From round 1 both
  readings rest on the season's own pace and no regular look refused a signing. It moved s2 and
  재벌 총수: s2's first fee signing came on day 16 (OVR 89) instead of day 168, 재벌 총수's on day 8
  (OVR 83) instead of day 15 (OVR 76); s0's first came on day 9 where the released season signed
  none.
- 재벌 총수 (XI 72) kept the band's own ceiling, 85, for two seasons, as the unit case's XI of 70
  does; by 2002/03 its XI stood at 82–84 and the ceiling followed to 87–89 (dearest 0.21).
- The record target (0.5× within the first three seasons) is met in 0 of 4, as T785 read `xi` alone
  (0.16–0.28): the list still ranks equally able young players first at a third to half of a
  prime-age star's fee (review F10, left open), so the 단장 buys OVR 88–91 for £5–8m.

## Not read

- Seasons after 2002/03, other countries, other 재정 기조 than 공격적, and a club without owner money.
- CLUB-46's value targets and CLUB-48's books: neither reading changes a price or a book.
- The gate's integration and browser suites, run by the batch on the integrated candidate.
