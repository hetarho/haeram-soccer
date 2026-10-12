# EURO Historical European competitions
> r3 | Define the implemented browser-demo behavior for historical european competitions.

## decisions
- EURO-1 [o] European Cup starts 1955; Champions League name starts 1992. UEFA Cup starts 1971; Europa League name starts 2009. Conference starts 2021 and drops Europa from its name in 2024.
- EURO-2 [o] Cup Winners Cup runs 1960-1998; companion Super Cup is an optional summarized tie from 1973. Fairs/Intertoto/regional and pandemic exceptional formats are excluded from the demo.
- EURO-3 [o] Era profiles preserve main field/format milestones: Cup16 then32; 1991 two groups after knockout; 1994 groups16; 1997 groups24; 1999 groups32 twice; 2003 groups32 then knockout; UEFA Cup64 then2004 groups40 then2009 groups48 then2021 groups32.
- EURO-4 [o] From 2024, UCL/UEL/Conference use 36-team league phases with 8/8/6 matches, top8 direct to the round of 16 and 9-24 in a seeded two-legged playoff (9th v 24th …); no league-phase drop to a lower competition.
- EURO-5 [o] Implemented-country last-season league/cup results choose eligible clubs. Additional fictional representatives fill era field capacity; duplicate memberships are prevented.
- EURO-6 [o] Demo national quotas, draw pots, initial invitation and background representatives are normalized allocations and clearly labelled, not claimed to reproduce every historical UEFA access list.
- EURO-7 [o] All ties use the same seeded football model, affect recorded coefficient/honor/revenue, and archive own-club matches. Qualification occurs before the world calendar schedules Europe.
- EURO-8 [o] Display locked competitions before founding date, current historical name/format, qualification cause, the live league-phase or group tables with their qualification zones, the bracket as it is drawn with both legs' dates, own results and the history of finals (→WEB-40).
- EURO-9 [o] European Cup/Champions League and UEFA Cup/Europa League share lineage history; discontinued cups retain prior records.
- EURO-10 [o] Continental competitions run through the season, stage by stage, three days before the league weekend. ← knockouts settled at season close could not be followed
  | stage | league rounds |
  |---|---|
  | league/group phase | 6 matchdays 7 9 12 14 17 19; 8 add 25 26; 5-club groups 9 12 14 17 19 |
  | 1999–2002 second group stage | 25 26 29 30 32 33 |
  | 1991–93 knockout to eight, then groups | 7/9, 12/14; groups 17 19 25 26 29 32 |
  | knockout-only eras (to 1990 European Cup, Cup Winners Cup, UEFA Cup to 2003) | from September 7/9, 12/14, 17/19; quarter 31/33, semi 36/38, final 43 |
  | after a phase before 2003 | quarter 31/33, semi 38/40; after the 1999–2002 second group stage quarter 36/38, semi 39/41; final 43 |
  | after a phase 2003–2023 | Champions League last 16 29/32; otherwise playoff/last 32 29/30, last 16 32/33; quarter 36/37, semi 39/40, final 43 |
  | after the league phase from 2024 | playoff 29/30, last 16 31/32, quarter 36/37, semi 39/40, final 43 |
  - every tie before the final is two legs on its era's gap — two weeks before 2003, then one, the Champions League's last 16 three weeks apart 2003–2023 — and no leg shares a domestic cup midweek (5 11 16 23 28 35 42); the final is one match. A level aggregate goes through on away goals before 2021, then extra time and penalties from the world's stream. ← real UEFA calendars: 1985–86 first round 18 Sep/2 Oct, 2022–23 last 16 14 Feb/7 Mar, 2024–25 rounds a week apart
  - a round drawn after its planned first leg (a save from before rules 1.14.0) moves past today with its gap; matches archived on the earlier calendar (every return a round later) keep their stage.
  - after a phase the qualifiers are seeded (group winners first, or league rank) and the first knockout round pairs best against worst; a field that is not a power of two gives its top seeds byes (the playoff); later rounds are open draws.
  - qualifiers per group: 3 in the 40-club UEFA Cup, 1 in the 1991–92 eight-club groups, 2 with 16 or 32+ clubs, otherwise 1 plus the two best runners-up (24 clubs).
  - the Super Cup stays a single match at the season close; the archive keeps each final's runner-up, score and shoot-out.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r3 261012 EURO-8✎ +both legs' dates; EURO-10✎ return a round later→each era's gap (2 weeks before 2003, then 1, UCL last 16 3 weeks 2003–23), knockout-only eras from September; rules 1.14.0
- r2 261011 EURO-4✎ +seeded two-legged playoff; EURO-8✎ +live phase tables with zones, drawn bracket and history of finals; EURO-10+ knockouts at season close→stage-by-stage calendar with two-legged ties and away goals before 2021
- r1 261007 initial
