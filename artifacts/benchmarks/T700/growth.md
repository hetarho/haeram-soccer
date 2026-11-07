# T700 — where a delegated club's rise below the top flight comes from (22 careers)

Read at each close of a season the owner's club played below the top flight (`--growth`, read-only). Rating: `rating` (world.ts) of the club and of its league's clubs nobody owns (its division and group). Points above the median: the XI's rating less the league's NPC median, attributed to each XI player pro rata to his slot value (as `rating` reads it: level × adaptation, less the fatigue load) above the division's typical strength (`tierLevel`), players below it carrying none. Discounted: `divisionFor(code, OVR)` above the club's division (a lower index). Ability-fit wage: `marketWageAt` at min(club division, `divisionFor`), the era's spread as in force. Origin: the latest `in` transfer fact after the takeover (fee 0 = free; a loan apart), else in the squad at the takeover, else the graduate mark (academy promotions, call-ups and the close's generated youngsters), else other.

## Rating against the league

| tier | careers | seasons below the top flight | XI rating − NPC median: median (p10–p90) | − NPC best: median | seasons above the median |
|---|---:|---:|---|---:|---:|
| midsize | 8 | 19 | 9 (1–16) | 1 | 18 |
| local | 8 | 23 | 8 (1–20) | -1 | 21 |
| selfmade | 6 | 27 | 10 (0–15) | 0 | 24 |

## Who carries the XI's points above the league's NPC median (pooled over the seasons below the top flight)

| tier | points above the median (seasons) | in the squad at the takeover | academy (graduate mark) | signed free by the 단장, discounted | signed for a fee, discounted | a free agent at the close, discounted | signed free by the 단장, at his ability's price | signed for a fee, at his ability's price | a free agent at the close, at his ability's price | other | on loan (apart) | discounted signings together |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| midsize | 168 (18) | 26.8% | 0.0% | 16.5% | 56.8% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 73.2% |
| local | 206 (21) | 14.0% | 0.0% | 28.3% | 57.7% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 86.0% |
| selfmade | 234 (24) | 4.8% | 1.5% | 38.5% | 55.1% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 93.7% |
| 지역 유지 + 자수성가 (the screen) | 440 (45) | 9.1% | 0.8% | 33.8% | 56.3% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 90.1% |

## The XI by origin and price (median season)

| tier | discounted share of the XI | takeover | academy | free | pool | fee | loan | other | discounted XI players: paid / ability-fit wage (median) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| midsize | 90.9% | 63.6% | 0.0% | 9.1% | 0.0% | 27.3% | 0.0% | 0.0% | 0.47 (154) |
| local | 81.8% | 54.5% | 0.0% | 9.1% | 0.0% | 36.4% | 0.0% | 0.0% | 0.41 (170) |
| selfmade | 72.7% | 36.4% | 0.0% | 18.2% | 0.0% | 36.4% | 0.0% | 0.0% | 0.4 (201) |

## Wage bill over revenue (seasons below the top flight)

| tier | paid: median / p90 | ability-fit priced: median / p90 | squad's annual wages at the close / the season's paid player wages: median (min–max) |
|---|---|---|---|
| midsize | 28.4% / 52.2% | 50.4% / 91.5% | 1.07 (0.99–1.21) |
| local | 28.5% / 50.5% | 57.8% / 104.8% | 1.07 (1–1.22) |
| selfmade | 33.5% / 50.9% | 76.0% / 107.9% | 1.07 (1–1.23) |

## The 단장's discounted signings on 재정 기조 표준's checks at the ability-fit wage

Replayed at the first round boundary after each signing (the state after that round, his fee added back to the cash and the ability-fit wage in place of his paid one; the season's cash projection not replayed); the same replay at his paid wage is printed beside as the replay's own error.

| tier | discounted signings (free / fee) | OVR (median) / division his ability suits (median) | paid / ability-fit wage (median) | refused at the ability-fit wage | by reason | refused at his paid wage (replay error) |
|---|---:|---|---:|---:|---|---:|
| midsize | 45 (7 / 38) | 85 / 0 | 0.4 | 0 | - | 0 |
| local | 61 (17 / 44) | 84 / 0 | 0.4 | 1 | fee share 1 | 1 |
| selfmade | 60 (23 / 37) | 83 / 0 | 0.4 | 6 | fee share 2, wage bill 4 | 0 |

## Who the scout's list offered (each player once a season, as drawn; `divisionFor` against the club's division)

| tier | players offered a season (median) | OVR: median (p10–p90) | division's typical strength (median) | above it | suiting a higher division | free agents |
|---|---:|---|---:|---:|---:|---:|
| midsize | 19 | 84 (77–85) | 66 | 100.0% | 100.0% | 37.2% |
| local | 19 | 83 (77–85) | 66 | 100.0% | 100.0% | 38.4% |
| selfmade | 17 | 83 (76–85) | 66 | 100.0% | 100.0% | 39.0% |

## The means level's hold on the league at the summer change (clubs nobody owns of the league the club plays next)

| tier | summers read | means level below its level (share of the league's clubs) | cut to it that summer | league median strength taken: median (max) | the hold against the XI's excess (pooled, capped) |
|---|---:|---:|---:|---|---:|
| midsize | 11 | 0.0% | 0.0% | 0 (0) | 0.0% |
| local | 15 | 0.0% | 0.0% | 0 (0) | 0.0% |
| selfmade | 21 | 0.0% | 0.0% | 0 (0) | 0.0% |

## Top-flight reach against LEAGUE-13's band

| tier | careers | reached the top flight | first top-flight season (median) | band |
|---|---:|---:|---:|---|
| midsize | 8 | 8 (100.0%) | 3 | 1 in 5 or fewer win; the top flight in most careers; 1 in 20 or fewer bankrupt |
| local | 8 | 8 (100.0%) | 3 | the top flight in about half the careers; 1 in 10 or fewer bankrupt |
| selfmade | 6 | 6 (100.0%) | 4 | the top flight in 1 in 4 careers or fewer; 1 in 5 or fewer bankrupt |

## Screen verdict

**go** for the ability-fit wage price: discounted signings carry 90.1% of the XI's points above the league's NPC median (pooled over 지역 유지 and 자수성가 축구팬's 50 seasons below the top flight; at least half needed).

Read beside, for the next slice (price against who is offered):

- Who is offered: the scout's list at a second- or third-tier club offers players of OVR 83–84
  (p10–p90 76–85) against its division's typical strength 66, every one of them suiting a higher
  division and 37–39% of them free agents: CLUB-51's home reach takes in the divisions above, and
  the list ranks by ability. A price alone leaves this supply as it is; the screen's points are
  carried by who is signed from it.
- What they cost: the 단장's discounted signings (OVR 83–85, suiting the top flight) are paid 40% of
  their ability-fit wage. Priced at it, the squad's wage bill over revenue goes from 28–34% (median)
  to 50–76% (p90 92–108%), while 재정 기조 표준's checks at the signing would have refused only 0 of
  45 (중견 사업가), 1 of 61 (지역 유지) and 6 of 60 (자수성가 축구팬): the price binds through the wage
  bill a season later rather than through the 단장's checks at the signing.
- The means level holds none of these leagues' clubs nobody owns (0 of every summer read): their
  books pay their level, so it is no source of the lower tiers' rise.
- The takeover squad's growth carries 9.1% and the academy 0.8% of the screen's points.

## Consistency

- Inert: the control, 중견 사업가 ENG `owner-balance-0` lived on production without `--growth`,
  equals the same career with it in all 20 season rows (`--compare`: 0 differing fields). The
  second run (origins read as each player arrives) equals the first in all 22 × 20 season rows.
- Against T699 (`artifacts/benchmarks/T699/careers-candidate.json`, lived on 40ef1a2e with the
  three as overrides): every one of the 8 중견 사업가 careers differs in every season row from 1950
  (rank, the income sources, expense, wages, cash, fortune, 팬 민심, the living-cost share; the
  division from the first promotion), and the difference precedes the first season: the 1950 world
  itself differs (each tier's anchor and fortune, 56,735.77 → 57,032.75 and 56,416.59 → 56,235.91
  units for the two seeds; the club's place in its band, the books' last wages, and for ENG seed 1
  and FRA seed 1 the club bought, ENG:2:0:3 → ENG:3:0:20 and FRA:2:0:16 → FRA:2:0:14). With the
  control equal, the difference is the tree's (the recruitment of T701–T705 and the recovery of
  T708–T710 on the 1930–1950 world and the careers), not the measurement's; the readings are kept
  on the production run.
- Squad wages: the squad's annual wages at each close are 1.07× (median; 0.99–1.23) the season's
  paid player wage bill, never equal, since the bill is paid round by round on the squad of that
  round: players signed and sold during the season, clause changes and the close's arrivals make
  the difference.
