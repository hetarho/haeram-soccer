# Data sources and demo rules

The catalog ID is `2026-demo-1`. Its SHA-256 fingerprint covers canonical country profiles and price observations; new worlds and envelopes pin it. `pnpm run validate:catalogs` checks that fingerprint and eight-country/year coverage. Football rules and currency algorithms also belong to engine version `1.0.0`; changing semantics requires a reviewed version/migration decision.

## Domestic structures

Country profiles in `packages/catalogs/src/index.ts` contain source links and reference seasons. The demo uses 20/24/24/24 clubs in England, 20/22 in Spain, 18/18/20 in Germany, 20/20/three groups of 20 in Italy, 18/18/18 in France, 18/18 in Portugal, 18/20 in the Netherlands and 18/15 in Belgium (2026/27 reference).

Automatic promotion and playoffs simulate actual football ties. Regional grouping, reserve eligibility, licensing, Dutch period champions, Belgian special formats and the bottom professional boundary are normalized. The bottom boundary exchanges background clubs and retains the owned club in a lightweight return-challenge league. All groups conserve their declared capacities. Domestic cups use a single-match elimination draw.

Club names are generated from city/industry word banks, players from name banks, and outcomes from stable IDs and seeds. The original project's real-club roster is not copied. Fictional representative clubs support other European associations without simulating those countries' full domestic systems.

## Price observations

`packages/catalogs/data/prices.json` contains 528 national annual CPI observations (1960–2025, eight country series) from [World Bank FP.CPI.TOTL](https://data.worldbank.org/indicator/FP.CPI.TOTL) and 60 UK historical observations for 1901–1960 from [ONS long-run prices](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/cdko/mm23).

Before national coverage the index links UK historical prices to each national series; the non-UK estimate is explicitly labelled. After the last observation, prices project 2% annually and display that assumption. Currency-specific early wage/price scales are fictional calibration, not observed football salaries. Purchasing-power charts use these catalog indices and declared conversions.

The game labels historical UK linked data as observed, non-UK proxies as estimated and later years as projected. Existing fixed wages/sponsorship payments and cash do not automatically inflate. Indexed sponsorship behaves separately.

## Currencies

The game represents integer minor units with decimal strings and half-even rational rounding. It models pound decimalization, French redenomination, Portuguese reis/escudo and 1999 euro book-money conversion using [ECB irrevocable rates](https://www.ecb.europa.eu/euro/intro/html/index.en.html). German early marks and the 1948 boundary are simplified monetary periods; full hyperinflation, war/exchange controls and purchasing-power reconstruction are outside this demo.

Conversion changes current balances and contracts once. Archived transactions and season ledgers keep their original units. Missing/normalized historical data is not presented as a fully reconstructed national monetary history.

## European eras

European Cup: 1955/56; Champions League name: 1992/93. UEFA Cup: 1971/72; Europa League: 2009/10. Conference: 2021/22 and its 2024/25 rename. Cup Winners Cup: 1960–1998 seasons; summarized Super Cup: 1973 onward. Era profiles implement main field/group milestones and 2024 36-team league phases with 8/8/6 unique opponents, balanced home/away counts, top-eight qualification and 9–24 playoffs. [UEFA Champions League history](https://www.uefa.com/uefachampionsleague/history/), [Europa League history](https://www.uefa.com/uefaeuropaleague/history/), [Conference history](https://www.uefa.com/uefaconferenceleague/history/).

Access lists, countries' quotas, qualifying invitations, pots and opponent allocation are normalized. Knockouts use single matches with deterministic penalties and byes where necessary; complex historic multi-leg/drop-down exceptions are not reproduced. There is no 2024 league-phase drop to a lower competition. The displayed club coefficient is a five-year owned-match win/draw summary, not the official UEFA coefficient algorithm.

All results and honors come from the same game engine, rather than actual historical winners. European first/second phase standings and honors are archived; full historical NPC action traces are not collected.
