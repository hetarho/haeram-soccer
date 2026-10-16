# WORLD Fictional world and catalogs
> r4 | Define the browser-demo rules for fictional world and catalogs.

## decisions
- WORLD-1 [o] Playable associations: ENG ESP GER ITA FRA POR NED BEL. Other UEFA associations appear as representative clubs only.
- WORLD-2 [o] Use modern reference structures: ENG 20/24/24/24; ESP 20/22; GER 18/18/20; ITA 20/20/(3 groups of 20); FRA 18/18/18; POR 18/18; NED 18/20; BEL 18/15. Catalogs state source season and normalization.
- WORLD-3 [o] All generated clubs are independent fictional senior clubs. Reserve eligibility and special national subcompetitions are normalized and explicitly disclosed as demo simplifications.
- WORLD-4 [o] Names combine country cities and cultural word banks; no fixed real-club roster, real players, or mapped real-club strengths.
- WORLD-5 [o] The player's club is founded as one more club in its country's amateur league (→WORLD-9), outside the professional pyramid; every professional group keeps its full capacity of clubs nobody owns. ← a new club starts in amateur football, not in a professional slot
- WORLD-6 [o] Club and player identities are stable. NPC match squads remain reproducible from club/seed/birth cohorts; the active player squad and its mutations are persisted. Cross-role person continuity follows →WORLD-10/11.
  - an NPC squad carries the player model (→PLAYER-1) and fills the formation of its club's tactic (→STAFF-22) with a player at 최상 in every slot and a bench covering each line.

- WORLD-7 [o] Generation seed, catalog version and PRNG contract are saved. Reopening does not regenerate a different world.
- WORLD-8 [o] NPC pre-start background contains no fabricated played season or European honors.
- WORLD-9 [o] Every country has 15 amateur clubs one step below its last professional division; with the player's club they form a 16-club amateur league, and they are the pool that swaps places with clubs relegated out of the professional game.
  - generated strength: the division's level (professional tier t: 77−11t; amateur level, t = professional depth: 76−11t) + the club's stature (→LEAGUE-10) ± 3, within 15–92.

- WORLD-10 [o] Second-career opportunities apply across clubs, not only to the owner's retirees (→STAFF-23/24).
  - a player who enters coaching and later management stays the same recognisable person, retaining his actual birth year, name and genuinely retained playing history (→HIST-14).
  - seasonal squad generation must not rename, rejuvenate or duplicate that person as a new staff member. Missing other-club appearances or honours remain unavailable, never invented.
  - the scope and lifecycle of other-club player continuity are →WORLD-11.

- WORLD-11 [?] Specify which other-club players retain continuing identities between seasonal rosters and how their retirement/coaching eligibility is determined. Resolve movement between our club and other clubs, rediscovery and cross-role uniqueness without claiming untracked full NPC lifetimes or fabricating past careers. Preserve →LEAGUE-10's existing club-strength evolution.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

- Person continuity: generated/retained player → qualifying retirement/coaching choice → the same person in staff/manager candidacy → linked actual career facts.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r4 261016 WORLD-6✎ seasonal squad identities→cross-role continuity reference; WORLD-10+ cross-club second-career person continuity; WORLD-11+ open NPC continuity/retirement scope
- r3 261015 WORLD-6✎ NPC squads of four roles→the player model filling their tactic's formation
- r2 261011 WORLD-5✎ reserved lowest-tier slot→player club founded in the amateur league; WORLD-9+ 15 amateur clubs per country and tier strength ranges
- r1 261007 initial
