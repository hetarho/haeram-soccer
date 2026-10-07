# EURO Historical European competitions
> r1 | Define the implemented browser-demo behavior for historical european competitions.

## decisions
- EURO-1 [o] European Cup starts 1955; Champions League name starts 1992. UEFA Cup starts 1971; Europa League name starts 2009. Conference starts 2021 and drops Europa from its name in 2024.
- EURO-2 [o] Cup Winners Cup runs 1960-1998; companion Super Cup is an optional summarized tie from 1973. Fairs/Intertoto/regional and pandemic exceptional formats are excluded from the demo.
- EURO-3 [o] Era profiles preserve main field/format milestones: Cup16 then32; 1991 two groups after knockout; 1994 groups16; 1997 groups24; 1999 groups32 twice; 2003 groups32 then knockout; UEFA Cup64 then2004 groups40 then2009 groups48 then2021 groups32.
- EURO-4 [o] From 2024, UCL/UEL/Conference use 36-team league phases with 8/8/6 matches, top8 direct and 9-24 playoff; no league-phase drop to a lower competition.
- EURO-5 [o] Implemented-country last-season league/cup results choose eligible clubs. Additional fictional representatives fill era field capacity; duplicate memberships are prevented.
- EURO-6 [o] Demo national quotas, draw pots, initial invitation and background representatives are normalized allocations and clearly labelled, not claimed to reproduce every historical UEFA access list.
- EURO-7 [o] All ties use the same seeded football model, affect recorded coefficient/honor/revenue, and archive own-club matches. Qualification occurs before the world calendar schedules Europe.
- EURO-8 [o] Display locked competitions before founding date, current historical name/format, qualification cause, standings/bracket and own results.
- EURO-9 [o] European Cup/Champions League and UEFA Cup/Europa League share lineage history; discontinued cups retain prior records.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
