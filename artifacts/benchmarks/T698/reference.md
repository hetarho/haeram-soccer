# T698 — the champions part's reference: the real leagues 1980/81–2009/10

CLUB-48 r57 reads LEAGUE-10 r17's real spread: 4–9 different top-flight champions per country and the most titles
of one club 7–17 in the 30 seasons 1980/81–2009/10, titles not awarded left out (Italy 2004/05, France 1992/93).

## The official lists: not read in this unit

This unit has no web access (no download or web tool is permitted in the headless unit), so none of the eight
official champions lists could be read: Premier League / English Football League honours (ENG), LaLiga (ESP), Lega
Serie A's albo d'oro (ITA), DFL / bundesliga.com's Deutsche Meister (GER), LFP's palmarès (FRA), KNVB / Eredivisie
landskampioenen (NED), Liga Portugal's campeões (POR), Pro League (BEL). They stay named in the task's limits.

In their place, and only as a consistency check of LEAGUE-10's recalled table, each league's 30 seasons were recalled
again season by season in this unit. This is still recall, not a read of a primary list; it found no season that
contradicts a band end, so the task goes on to the noise (the stop the acceptance names applies to a **read** list).

| country | seasons awarded | champions 1980/81–2009/10 (titles) | different | most | LEAGUE-10 r17 |
|---|---:|---|---:|---:|---|
| ENG | 30 | Manchester United 11, Liverpool 6, Arsenal 5, Chelsea 3, Everton 2, Aston Villa 1, Leeds United 1, Blackburn Rovers 1 | 8 | 11 | 8 / 11 |
| ESP | 30 | Real Madrid 11, Barcelona 11, Real Sociedad 2, Athletic Club 2, Valencia 2, Atlético Madrid 1, Deportivo 1 | 7 | 11 | 7 / 11 |
| ITA | 29 (2004/05 not awarded) | Juventus 9, Milan 7, Internazionale 6 (2005/06 assigned), Roma 2, Napoli 2, Verona 1, Sampdoria 1, Lazio 1 | 8 | 9 | 8 / 9 |
| GER | 30 | Bayern München 16, Werder Bremen 3, VfB Stuttgart 3, Hamburger SV 2, Kaiserslautern 2, Borussia Dortmund 3, VfL Wolfsburg 1 | 7 | 16 | 7 / 16 |
| FRA | 29 (1992/93 not awarded) | Lyon 7, Bordeaux 5, Marseille 5, Monaco 4, Nantes 3, Paris Saint-Germain 2, Saint-Étienne 1, Auxerre 1, Lens 1 | 9 | 7 | 9 / 7 |
| NED | 30 | PSV 14, Ajax 10, Feyenoord 3, AZ 2, Twente 1 | 5 | 14 | 5 / 14 |
| POR | 30 | Porto 17, Benfica 9, Sporting 3, Boavista 1 | 4 | 17 | 4 / 17 |
| BEL | 30 | Anderlecht 14, Club Brugge 7, Standard Liège 4, Genk 2, Beveren 1, KV Mechelen 1, Lierse 1 | 7 | 14 | 7 / 14 |

The band's ends are the table's extremes (different: POR 4, FRA 9; most: FRA's Lyon 7, POR's Porto 17);
`scripts/era-wage-spread.ts` checks that `CHAMPION_BAND` equals the extremes of `REAL_CHAMPIONS` before any reading.

A model of the same giants and big clubs in every country is read against the one range, not against each country's
own values (LEAGUE-10 r17); each country's real values are printed beside its reading as context.
