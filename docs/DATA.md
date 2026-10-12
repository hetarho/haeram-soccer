# Data sources and demo rules

The catalog ID is `2026-demo-2`. Its SHA-256 fingerprint covers canonical country profiles, price observations and the football index with its sponsor-slot eras; new worlds and envelopes pin it. A checkpoint pinned to `2026-demo-1` is still accepted by the fingerprint recorded with it, and its pin moves to `2026-demo-2` when a writer activates the save; prices did not change between the two, so no recorded fact changes. `pnpm run validate:catalogs` checks that fingerprint, eight-country/year coverage and the ordering and provenance of both football tables. Football rules and currency algorithms also belong to engine version `1.0.0`; changing semantics requires a reviewed version/migration decision.

## Domestic structures

Country profiles in `packages/catalogs/src/index.ts` contain source links and reference seasons. The demo uses 20/24/24/24 clubs in England, 20/22 in Spain, 18/18/20 in Germany, 20/20/three groups of 20 in Italy, 18/18/18 in France, 18/18 in Portugal, 18/20 in the Netherlands and 18/15 in Belgium (2026/27 reference).

Automatic promotion and playoffs simulate actual football ties. Regional grouping, reserve eligibility, licensing, Dutch period champions, Belgian special formats and the bottom professional boundary are normalized. The bottom boundary exchanges background clubs and retains the owned club in a lightweight return-challenge league. All groups conserve their declared capacities. Domestic cups use a single-match elimination draw.

Club names are generated from city/industry word banks, players from name banks, and outcomes from stable IDs and seeds. The original project's real-club roster is not copied. Fictional representative clubs support other European associations without simulating those countries' full domestic systems.

## Price observations

`packages/catalogs/data/prices.json` contains 528 national annual CPI observations (1960–2025, eight country series) from [World Bank FP.CPI.TOTL](https://data.worldbank.org/indicator/FP.CPI.TOTL) and 60 UK historical observations for 1901–1960 from [ONS long-run prices](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/cdko/mm23).

Before national coverage the index links UK historical prices to each national series; the non-UK estimate is explicitly labelled. After the last observation, prices project 2% annually and display that assumption. Currency-specific early wage/price scales are fictional calibration, not observed football salaries. Purchasing-power charts use these catalog indices and declared conversions.

The game labels historical UK linked data as observed, non-UK proxies as estimated and later years as projected. Existing fixed wages/sponsorship payments and cash do not automatically inflate. Indexed sponsorship behaves separately.

## Football index and sponsor eras

`packages/catalogs/data/football-index.json` holds a football index per country and year from 1901: the country's price index multiplied by a real multiple normalized to 1950 = 1. The multiple is flat until 1979, so the index tracks prices before commercialisation, and then grows geometrically between the era anchors 1992, 2005, 2020 and 2025. England reaches about 2, 6, 10 and 11; Spain, Germany and Italy reach 70% of England's real growth, France 50%, the Netherlands 35%, Portugal 30% and Belgium 25%.

Every index figure is this project's own estimate derived from published aggregates — [Deloitte Annual Review of Football Finance](https://www.deloitte.com), [UEFA club finance reports](https://www.uefa.com) and the national league archives named in the catalog — and never a reproduced national revenue series, so every era is labelled estimated and years after the 2025 coverage are labelled projected and follow projected prices.

The same file records the year each sponsor slot first existed in a country: local partners from 1901, then the kit supplier, the shirt front, stadium naming and the sleeve. England's years are 1970, 1979, 1997 and 2017. England's shirt-front, stadium-naming and sleeve years and the Bundesliga's 1973 shirt front are documented firsts and labelled observed; every other year rests on an era rather than a documented first and is labelled estimated.

`footballIndex(code, year)` and `sponsorSlotOpens(code, slot)` expose both tables with their status and sources. They are the scale the later economy work reads for league distributions, sponsor values, ticket presets and market wages; facility building and upkeep follow prices only. No game rule consumes the index yet.

## Currencies

The game represents integer minor units with decimal strings and half-even rational rounding. It models pound decimalization, French redenomination, Portuguese reis/escudo and 1999 euro book-money conversion using [ECB irrevocable rates](https://www.ecb.europa.eu/euro/intro/html/index.en.html). German early marks and the 1948 boundary are simplified monetary periods; full hyperinflation, war/exchange controls and purchasing-power reconstruction are outside this demo.

Conversion changes current balances and contracts once. Archived transactions and season ledgers keep their original units. Missing/normalized historical data is not presented as a fully reconstructed national monetary history.

## European eras

European Cup: 1955/56; Champions League name: 1992/93. UEFA Cup: 1971/72; Europa League: 2009/10. Conference: 2021/22 and its 2024/25 rename. Cup Winners Cup: 1960–1998 seasons; summarized Super Cup: 1973 onward. Era profiles implement main field/group milestones and 2024 36-team league phases with 8/8/6 unique opponents, balanced home/away counts, top-eight qualification and 9–24 playoffs. [UEFA Champions League history](https://www.uefa.com/uefachampionsleague/history/), [Europa League history](https://www.uefa.com/uefaeuropaleague/history/), [Conference history](https://www.uefa.com/uefaconferenceleague/history/).

Access lists, countries' quotas, qualifying invitations, pots and opponent allocation are normalized. Knockouts use single matches with deterministic penalties and byes where necessary; complex historic multi-leg/drop-down exceptions are not reproduced. There is no 2024 league-phase drop to a lower competition. The displayed club coefficient is a five-year owned-match win/draw summary, not the official UEFA coefficient algorithm.

All results and honors come from the same game engine, rather than actual historical winners. European first/second phase standings and honors are archived; full historical NPC action traces are not collected.
