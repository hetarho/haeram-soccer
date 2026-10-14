# HIST Durable metrics and history
> r9 | Define the implemented browser-demo behavior for durable metrics and history.

## decisions
- HIST-1 [o] Always retain own-club season/career metrics, own settled match scores/player contributions/highlights, personnel tenures and meaningful commercial decisions.
- HIST-2 [o] Always retain all implemented-country season standings/champions/cup outcomes and European standings/honors. NPC past per-frame/per-action traces and full individual match-stat archives are not collected.
- HIST-3 [o] NPC current-season stats and reproducible current roster support comparison. Career/season summaries, not duplicated object graphs, represent older NPC history.
- HIST-4 [o] Archive compact IDs and numeric aggregates; UI pagination or chart sampling never deletes source records.
- HIST-5 [o] Founding is the first history entry; promotion, relegation, tactics application/refusal, manager resignation, recruitment, retirement, campaigns, sponsors and currency changes append facts.
- HIST-6 [o] Metric scopes separate domestic, European, current season and own career; ratios expose denominators and sample size.
- HIST-7 [o] Statistical changes after an action are observations with markers, not proof of causality; show relevant period and actual applied changes.
- HIST-8 [o] No automatic expiry/pruning, data uploads or silent loss on save/import. Capacity errors keep the current save and offer export.
- HIST-9 [o] Validate 100-season own-club and global summary retention within the ARCH save budget.
- HIST-10 [o] Milestone completion derives from retained matches, events, player development, facility work (→ECON-32) and season archives. It grants no synthetic cash, performance multiplier or repeatable claim reward; viewing, importing and reloading the same career reproduce the same completed milestones.
- HIST-11 [o] Club news is derived from retained facts on every read and never stored: the same career always produces the same feed with stable item IDs. ← news must never contradict the record, and storing it would only duplicate facts
  - every own match yields one result line (comeback, ≥88′ winner or equaliser, a two-goal lead thrown away, rout, heavy defeat, clean win or the plain result, with possession, shots and xG), then at most 4 more items ranked by weight; major items and celebrations always stay.
  - sources: streaks across seasons, home/away runs, the opening five, possession and first-goal splits, xG against the result and finishing gaps, season highs and lows, player braces, hat-tricks, one-man shows, debut and academy first goals, scoring runs, droughts and milestones, keepers' saves, defensive actions and advanced counters; the round standings (top of the table, leads, promotion and relegation zones, three-place climbs); club events (official signings and departures, manager changes, academy, facilities, sponsor, vision, owner requests, cup rounds won and lost, retirement announcements and retirements, injuries, potential breakthroughs and stalls) and the closed season's honours.
  - a cup won during the season is celebrated on the day of its final; the closed season's honours repeat only cups without that event (older saves).
  - thresholds: unbeaten runs at 5/10/15…, wins at 3/5/7/10, defeats at 3/4/5/7, 5/8/10/15 without a win, a run of 5+ that ends; club records only against a record of at least 5 (unbeaten) or 3 (wins) set before the season; 60%+ possession win rates only at 70%+ or 20%− over 5+ matches; season highs from the fourth match; each finishing or keeping gap level once a season after 8 matches with xG.
  - achievements flagged for celebration: first win, club-record runs (8+ unbeaten, 5+ wins), record margin, hat-trick, an academy graduate's first goal, career goal hundreds, every hundredth club win, first time top of the table in a season, promotion, titles and cups.
  - headlines end on a noun, keep exclamation marks for major items and state facts and splits; they never claim a cause. A transfer window opening is never news.

- HIST-12 [o] Club ratings and values are recorded facts. ← fans follow a club's standing and worth over decades, not only its division
  - every club carries a Club Elo updated after every settled result in every competition: K 20, home advantage 60, margin weight 1 / 1.5 / (11 + margin)/8; it starts at 1350 + 16 × (strength − 60).
  - each season archive keeps the own club's Elo and its rank among all clubs, the squad value (sum of player values), the club value (squad value + half the build cost of the facility parts (→ECON-32) + a brand of one unit per 20 supporters × (1 + reputation/100) + cash) and how far it went in each cup.
  - views convert past money to today's prices and currency; the league position chart counts every club in the divisions above plus the rank.
- HIST-13 [o] A closed season keeps what its pages need to stay readable. ← a fan rereads old seasons, scorer races and draws, not only the final table
  - our league's top 10 scorers (name, club, position, goals, appearances; ties as the live table), our rank after every league round, and the Club Elo spread at the close (world lowest/highest, our league lowest/highest).
  - our country's cup and every continental competition except the Super Cup as a bracket from the first round of 32 or fewer clubs (qualifiers skipped) to the final: each tie its two clubs, both legs and how it was decided (penalties, away goals).
  - a field is written only when the season was tracked whole; seasons closed before rules 1.12.0 keep finals only. Scorers and brackets reach the screen through the season archive request, not every update.
  - derived on read, never stored: a cup run's stages from match ids and calendar slots, titles by club and nation, doubles, trebles and runs of titles from the archived champions and finals, the head-to-head with any club from every own match, and appearances as minutes / 90 (every starter plays the full match; there are no substitutions).

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r9 261015 HIST-13✎ scorers' role→position
- r8 261013 HIST-10✎ facilities→facility work; HIST-12✎ club value: half the facility build cost→of the three parts
- r7 261012 HIST-13✎ none→derived cup stages, honours, head-to-head and appearances
- r6 261012 HIST-13+ closed seasons keep top scorers, per-round rank, Elo spread and cup brackets from the last 32
- r5 261011 HIST-11✎ none→cup rounds, retirements, injuries, potential changes as news, cups celebrated on the day of the final; HIST-12+ Club Elo, squad and club value, cup runs and finals in the season archive
- r4 261010 HIST-11+ derived club news with stable IDs, thresholds and celebrated achievements
- r3 261008 HIST-9✎ milestone completion→100-season retention gate; HIST-10+ fact-backed milestone completion
- r2 261008 HIST-9✎ 100-season retention gate→fact-backed milestone completion
- r1 261007 initial
