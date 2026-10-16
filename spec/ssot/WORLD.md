# WORLD Fictional world and catalogs
> r6 | Define the browser-demo rules for fictional world and catalogs.

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
  - a playing coach (→STAFF-31) holds concurrent player/coach roles as one person; the two profiles and employment history must not create separate identities or duplicate the same period of coaching service.
  - seasonal squad generation must not rename, rejuvenate or duplicate that person as a new staff member. Missing other-club appearances or honours remain unavailable, never invented.
  - the scope and lifecycle of other-club player continuity are →WORLD-11.

- WORLD-11 [o] Across other clubs' seasonal rosters, retain continuing person identity for players whose true coaching aptitude is 높음 or 매우 높음, and for every player who has belonged to the owner's club, regardless of aptitude.
  - retain name, birth year, fixed qualities, current club/career status and actual recorded career events across seasons; the same person can retire, enter coaching and later qualify for management (→STAFF-25/30/38/39). A low-aptitude former own player remains recognisable without gaining coaching eligibility.
  - track age and retirement using →CLUB-3's existing age/chance rules and →STAFF-34's accepted playing-coach deferral. Use genuinely available playing context; missing appearances/minutes are unknown, not fabricated zeros or a reason to apply an unsupported low-minutes modifier.
  - a recorded signing, sale, release, loan or return updates that person's actual affiliation/status, not his identity, age or history. Reappearance in a squad, candidate pool or staff role resolves the retained person; never create a duplicate across clubs or roles (→WORLD-10).
  - the scope does not require persistent individual lifetimes, own-player training/development or invented match archives for every other NPC. Other-club strength evolution and seasonal match-attribute generation remain →LEAGUE-10 and →PLAYER-1; retained identities do not grant a club-strength bonus.
  - actual playing retirement ends active-player availability while retaining real career facts (→HIST-14); a playing coach remains active only until his deferred retirement date (→STAFF-34). Keep existing lossless career/storage requirements (→SAVE-13/17).

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

- Person continuity: generated/retained player → qualifying retirement/coaching choice → the same person in staff/manager candidacy → linked actual career facts.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r6 261016 WORLD-11✎ NPC continuity scope open→retain high/very-high coaching prospects and all former own players, actual age/retirement/affiliation and unique cross-role identity; ordinary club-strength model unchanged
- r5 261016 WORLD-10✎ sequential role continuity→also one shared identity for concurrent player/coach roles
- r4 261016 WORLD-6✎ seasonal squad identities→cross-role continuity reference; WORLD-10+ cross-club second-career person continuity; WORLD-11+ open NPC continuity/retirement scope
- r3 261015 WORLD-6✎ NPC squads of four roles→the player model filling their tactic's formation
- r2 261011 WORLD-5✎ reserved lowest-tier slot→player club founded in the amateur league; WORLD-9+ 15 amateur clubs per country and tier strength ranges
- r1 261007 initial
