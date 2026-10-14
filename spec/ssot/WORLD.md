# WORLD Fictional world and catalogs
> r3 | Define the implemented browser-demo behavior for fictional world and catalogs.

## decisions
- WORLD-1 [o] Playable associations: ENG ESP GER ITA FRA POR NED BEL. Other UEFA associations appear as representative clubs only.
- WORLD-2 [o] Use modern reference structures: ENG 20/24/24/24; ESP 20/22; GER 18/18/20; ITA 20/20/(3 groups of 20); FRA 18/18/18; POR 18/18; NED 18/20; BEL 18/15. Catalogs state source season and normalization.
- WORLD-3 [o] All generated clubs are independent fictional senior clubs. Reserve eligibility and special national subcompetitions are normalized and explicitly disclosed as demo simplifications.
- WORLD-4 [o] Names combine country cities and cultural word banks; no fixed real-club roster, real players, or mapped real-club strengths.
- WORLD-5 [o] The player's club is founded as one more club in its country's amateur league (→WORLD-9), outside the professional pyramid; every professional group keeps its full capacity of clubs nobody owns. ← a new club starts in amateur football, not in a professional slot
- WORLD-6 [o] Club and player IDs are stable. NPC squads are reproducible from club/seed/birth cohorts; the active player squad and its mutations are persisted.
  - an NPC squad carries the player model (→PLAYER-1) and fills the formation of its club's tactic (→STAFF-22) with a player at 최상 in every slot and a bench covering each line.
- WORLD-7 [o] Generation seed, catalog version and PRNG contract are saved. Reopening does not regenerate a different world.
- WORLD-8 [o] NPC pre-start background contains no fabricated played season or European honors.
- WORLD-9 [o] Every country has 15 amateur clubs one step below its last professional division; with the player's club they form a 16-club amateur league, and they are the pool that swaps places with clubs relegated out of the professional game.
  - generated strength: the division's level (professional tier t: 77−11t; amateur level, t = professional depth: 76−11t) + the club's stature (→LEAGUE-10) ± 3, within 15–92.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r3 261015 WORLD-6✎ NPC squads of four roles→the player model filling their tactic's formation
- r2 261011 WORLD-5✎ reserved lowest-tier slot→player club founded in the amateur league; WORLD-9+ 15 amateur clubs per country and tier strength ranges
- r1 261007 initial
