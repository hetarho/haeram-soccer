# HIST Durable metrics and history
> r15 | Define the browser-demo rules for durable metrics and history.

## decisions
- HIST-1 [o] Always retain own-club season/career metrics, own settled match scores/player contributions/highlights, personnel tenures and meaningful commercial decisions.
- HIST-2 [o] Always retain all implemented-country season standings/champions/cup outcomes and European standings/honors. NPC past per-frame/per-action traces and full individual match-stat archives are not collected.
- HIST-3 [o] NPC current-season stats and reproducible current roster support comparison. Career/season summaries, not duplicated object graphs, represent older NPC history.
- HIST-4 [o] Archive compact IDs and numeric aggregates; UI pagination or chart sampling never deletes source records.
- HIST-5 [o] Founding is the first history entry; promotion, relegation, tactics application/refusal, manager resignation, recruitment, retirement, campaigns, sponsors and currency changes append facts.
- HIST-6 [o] Metric scopes separate domestic, European, current season and own career; ratios expose denominators and sample size.
- HIST-7 [o] Statistical changes after an action are observations with markers, not proof of causality; show relevant period and actual applied changes.
- HIST-8 [o] No automatic expiry/pruning of retained facts, data uploads or silent loss on save/import; per-match maps and reports follow their defined lifetime (→HIST-16). Capacity errors keep the current save and offer export.
- HIST-9 [o] Validate 100-season own-club and global summary retention within the ARCH save budget.
- HIST-10 [o] Milestone completion derives from retained matches, events, player development, facility work (→ECON-32) and season archives. It grants no synthetic cash, performance multiplier or repeatable claim reward; viewing, importing and reloading the same career reproduce the same completed milestones.
- HIST-11 [o] Club news is derived from retained facts on every read and never stored: the same career always produces the same feed with stable item IDs. ← news must never contradict the record, and storing it would only duplicate facts
  - every own match yields one result line (comeback, ≥88′ winner or equaliser, a two-goal lead thrown away, rout, heavy defeat, clean win or the plain result, with possession, shots and xG), then at most 4 more items ranked by weight; major items and celebrations always stay.
  - sources: streaks across seasons, home/away runs, the opening five, possession and first-goal splits, xG against the result and finishing gaps, season highs and lows, player braces, hat-tricks, one-man shows, debut and academy first goals, scoring runs, droughts and milestones, keepers' saves, defensive actions and advanced counters;
  - round standings (top of the table, leads, promotion and relegation zones, three-place climbs);
  - club events (official signings and departures, manager changes, academy, facilities, sponsor, vision, owner requests, cup rounds won and lost, retirement announcements and retirements, injuries, potential breakthroughs and stalls) and the closed season's honours.
  - a cup won during the season is celebrated on the day of its final; the closed season's honours repeat only cups without that event (older saves).
  - thresholds: unbeaten runs at 5/10/15…, wins at 3/5/7/10, defeats at 3/4/5/7, 5/8/10/15 without a win, a run of 5+ that ends; club records only against a record of at least 5 (unbeaten) or 3 (wins) set before the season; 60%+ possession win rates only at 70%+ or 20%− over 5+ matches; season highs from the fourth match; each finishing or keeping gap level once a season after 8 matches with xG.
  - achievements flagged for celebration: first win, club-record runs (8+ unbeaten, 5+ wins), record margin, hat-trick, an academy graduate's first goal, career goal hundreds, every hundredth club win, first time top of the table in a season, promotion, titles and cups.
  - headlines end on a noun, keep exclamation marks for major items and state facts and splits; they never claim a cause. A transfer window opening is never news.

- HIST-12 [o] Club ratings and values are recorded facts. ← fans follow a club's standing and worth over decades, not only its division
  - every club carries a Club Elo updated after every settled result in every competition: K 20, home advantage 60, margin weight 1 / 1.5 / (11 + margin)/8; it starts at 1350 + 16 × (strength − 60).
  - each season archive keeps the own club's Elo and its rank among all clubs, the squad value (sum of player values), the club value (squad value + half the build cost of the facility parts (→ECON-32) + a brand of one unit per 20 supporters × (1 + reputation/100) + cash) and how far it went in each cup.
  - views convert past money to today's prices and currency; the league position chart counts every club in the divisions above plus the rank.
- HIST-13 [o] A closed season keeps what its pages need to stay readable. ← a fan rereads old seasons, scorer races and draws, not only the final table
  - live scorer totals keep one retained player identity across transfers within the tracked league, with actual per-club goals/appearances and the latest contributing club. Live and archived scorer displays name every contributing club when totals span clubs.
  - our league's top 10 scorers (name, club, position, goals, appearances; ties as the live table), our rank after every league round, and the Club Elo spread at the close (world lowest/highest, our league lowest/highest).
  - our country's cup and every continental competition except the Super Cup as a bracket from the first round of 32 or fewer clubs (qualifiers skipped) to the final: each tie its two clubs, both legs and how it was decided (penalties, away goals).
  - a field is written only when the season was tracked whole; seasons closed before rules 1.12.0 keep finals only. Scorers and brackets reach the screen through the season archive request, not every update.
  - derived on read, never stored: a cup run's stages from match ids and calendar slots, titles by club and nation, doubles, trebles and runs of titles from the archived champions and finals, the head-to-head with any club from every own match, and appearance counts from retained match participation.
  - an appearance counts one recorded match with minutes played > 0, whether starting or coming on as a substitute (→MATCH-20). Minutes / 90 is a denominator for per-90 rates, never the appearance count; a substitute who does not play gains no appearance.

- HIST-14 [o] Retain a person's linked playing, coaching and management career across role changes and clubs.
  - retirement from playing does not delete his playing totals or reset his age/name. Actual staff/manager appointments and coaching experience extend the same person's record.
  - retain the once-per-player encouragement and actual response (→STAFF-29), and dated coaching employment across clubs for →STAFF-30. Mark overlapping player/coach periods (→STAFF-31) without counting one coaching period twice.
  - during tracked coaching employment, retain the actual manager mentor, known school and dated shared service needed for →STAFF-44. Missing or pre-start mentor histories remain unavailable, never fabricated.
  - player profiles and subsequent candidate/staff/manager views can follow those links (→WEB-78); existing own-player totals and own-manager tenures remain available in records.
  - retain actual identity, dates, roles and observed facts; missing historical other-club statistics remain explicitly unavailable. Do not fabricate full NPC match archives or pre-start honours (→HIST-2/3, →WORLD-8).

- HIST-15 [o] Retain mediation facts and reinforcement commitments: participants, each actual explanation, applied support policy, direct case choice or delegated outcome, promise target/deadline, and later fulfilment/cancellation result (→CLUB-34/35/37).
  - prior decisions are not rewritten by later policy or personnel changes. A promise remains linked to the event that created it.
  - news about a second career or mediation derives only from these recorded facts (→HIST-11); no fabricated interviews, allegations or unperformed signings.

- HIST-16 [o] Own players keep season and career totals of the spatial counters and discipline — box entries, front-of-box entries, line-breaking passes, xT added, cut-backs, crosses, through balls, progressive carries, yellow and red cards, bans served (→MATCH-13, →MATCH-19). ← fans compare these across a career
  - per-match shot maps, heat maps, pass networks and tactical reports live for the current season only; at the season close they become one season heat map per own player, kept with the season (→MATCH-5).
  - other leagues' discipline tables are current-season facts (→LEAGUE-15); a closed season keeps none for players of clubs nobody owns.

## flow

- Career/mediation outcomes → retained person links and commitments → fact-backed profiles, decisions and derived news.

## chg
- r15 261019 HIST-13✎ appearances as minutes / 90 with no substitutions→one per recorded match with minutes > 0, starters and substitutes alike; per-90 rates remain separate
- r14 261019 HIST-8✎ no expiry/pruning→of retained facts, per-match maps follow their lifetime; HIST-16+ spatial counter and discipline totals, current-season maps reduced to season heat maps, NPC discipline current-season only
- r13 261017 HIST-13✎ single-club scorer attribution→one player total with actual per-club contributions across in-league transfers
- r12 261016 HIST-14✎ dated coaching service only→also actual mentor/school exposure for managerial school inheritance
- r11 261016 HIST-14✎ linked sequential careers→also retained encouragement/response, dated cross-club coaching service and overlapping player/coach periods
- r10 261016 HIST-14/15+ linked player/coach/manager careers and retained mediation/promise facts; no fabricated missing NPC statistics
- r9 261015 HIST-13✎ scorers' role→position
- r8 261013 HIST-10✎ facilities→facility work; HIST-12✎ club value: half the facility build cost→of the three parts
- r7 261012 HIST-13✎ none→derived cup stages, honours, head-to-head and appearances
- r6 261012 HIST-13+ closed seasons keep top scorers, per-round rank, Elo spread and cup brackets from the last 32
- r5 261011 HIST-11✎ none→cup rounds, retirements, injuries, potential changes as news, cups celebrated on the day of the final; HIST-12+ Club Elo, squad and club value, cup runs and finals in the season archive
- r4 261010 HIST-11+ derived club news with stable IDs, thresholds and celebrated achievements
- r3 261008 HIST-9✎ milestone completion→100-season retention gate; HIST-10+ fact-backed milestone completion
- r2 261008 HIST-9✎ 100-season retention gate→fact-backed milestone completion
- r1 261007 initial
