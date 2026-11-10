# WORLD Fictional world and catalogs
> r11 | Define the browser-demo rules for fictional world and catalogs.

## decisions
- WORLD-1 [o] Playable associations: ENG ESP GER ITA FRA POR NED BEL. Other UEFA associations appear as representative clubs only.
- WORLD-2 [o] Use modern reference structures: ENG 20/24/24/24; ESP 20/22; GER 18/18/20; ITA 20/20/(3 groups of 20); FRA 18/18/18; POR 18/18; NED 18/20; BEL 18/15. Catalogs state source season and normalization.
- WORLD-3 [o] All generated clubs are independent fictional senior clubs. Reserve eligibility and special national subcompetitions are normalized and explicitly disclosed as demo simplifications.
- WORLD-4 [o] Names combine country cities and cultural word banks; no fixed real-club roster, real players, or mapped real-club strengths.
- WORLD-5 [o] The owner's club is an existing professional club he buys (→!ECON-38); no club is added for him and every professional group keeps its full capacity. ← the owner joins football as it stands
- WORLD-6 [o] Club and player identities are stable. NPC match squads remain reproducible from club/seed/birth cohorts; the active player squad and its mutations are persisted. Cross-role person continuity follows →WORLD-10/11.
  - an NPC squad carries the player model (→PLAYER-1) and fills the formation of its club's tactic (→STAFF-22) with a player at 최상 in every slot and a bench covering each line.
  - a squad holds one player of each age from 18 to 35 as birth cohorts; each club's age ladder starts at its own point and orders its places its own way, both fixed by the seed and the club, so clubs of one tactic do not field the same ages in the same places. ← one shared ladder turned every 4-3-3 club's striker 27 in the same season and stood keepers only at 24 and 35
  - a place a sale emptied is refilled until the next summer by a player 2–6 below the club's strength at an age within 4 of the departed's, drawn from the place's own stream, the same person until his cohort ends; the next summer's squad is drawn at strength again. ← a refill at the seller's strength and the departed's age let a club sell the owner the same player four times in a season, and a refill drawn per year became a new person every season
  - a squad holds stars, regulars and a bench as real squads do: each generated player carries his own class, drawn once from his own stream, and an age term, and his potential headroom narrows with age; the starters' mean is the club's strength (→!LEAGUE-10) and the bench sits below them. Starting values, estimated (real XIs span about 8–12 OVR points, outfielders peak at about 25–29): ← flat squads put each ability band inside 3–5 clubs (measured 261110: players aged 18–30 at OVR 83–85 in 3–5 clubs, none at the four strongest), so a delegated club's signings bunched on one seller and the strongest club's eleven were the world's best
    | term | value |
    |---|---|
    | class | symmetric, within ±6 of the place's level |
    | bench | 3–8 below the starters' mean |
    | age | −7 at 18, −4 at 20, −1 at 22, 0 at 24–29, −1 at 31, −3 at 33, −5 at 35, linear between |
    | potential headroom | 10–35 at 20 or younger, narrowing linearly to 0–4 at 27 and older |
    - it enters production only when worlds lived with it hold MATCH-2's curve, MATCH-23's season scoring rows on the aggregate path, CLUB-46's value targets, CLUB-48's books and LEAGUE-10's champions (→!MATCH-2, →!MATCH-23, →!CLUB-46, →!CLUB-48); until then every place is drawn at the club's strength. A loaded save's generated players not yet retained (→WORLD-11) follow the rules in force, as new name pools did (→SAVE-10).

- WORLD-7 [o] Generation seed, catalog version and PRNG contract are saved. Reopening does not regenerate a different world.
- WORLD-8 [o] The world's background before the takeover is the seasons it actually played since 1930 (→WORLD-13); no season, honour or European record beyond them is fabricated.
- WORLD-9 [x] Every country has 15 amateur clubs one step below its last professional division; with the player's club they form a 16-club amateur league, and they are the pool that swaps places with clubs relegated out of the professional game.

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

- WORLD-12 [o] A generated person — player, prospect, coach or manager — is named one given name and one surname of his country, each drawn evenly from the catalog's pools of at least 100 given names and 200 surnames per country, written in the country's own spelling with its accents. ← 6–8 of each gave 315 distinct names to 13,178 players and repeated full names inside 2,300 squads (measured 261102); 20,000+ combinations per country keep a repeat rare
  - the 18 players generated for an NPC club in a season (→WORLD-6) never share a surname, nor do the players of the founding squad. A retained person (→WORLD-11), a vacancy's new person, youth, signings and staff draw freely, so an own squad can still hold two of one surname.
  - the pools are common names of the country, not real footballers (→WORLD-4).
  - drawing a name never shifts the draws behind the person's other attributes, so a change of pools renames generated people without changing their play or any match.
  - a stored name is never redrawn: own players, retained people and recorded facts keep the name they carry (→=SAVE-10).

- WORLD-13 [o] Every world is made in 1930 and lives from the 1930/31 season to the chosen decade's first season (→WEB-2) by the same day order (→LEAGUE-11), with nobody owning a club, behind a progress screen naming the season reached; the same seed and decade make the same world. ← the bought club arrives with a real past
  - every fixture before the takeover takes the results-only path (→MATCH-22); standings, cups, European results and honours are archived as in play (→HIST-2).
- WORLD-14 [o] League football stops for the war: after the 1938/39 close the world moves to 1 August 1946 without playing 1939/40–1945/46. People age through the gap, contracts and books stand still (no income, no wages, no costs), clubs nobody owns rise or fall once (→LEAGUE-10), and the owner's business keeps settling and paying living costs on its monthly dates (→OWNER-7/8). A takeover in the 1940s happens at the 1946 restart. ← the decades differ as they did
- WORLD-15 [o] A generated club's strength is its division's level (professional tier t: 77−11t) + its stature (→LEAGUE-10) ± 3, within 15–92.

## flow

- Person continuity: generated/retained player → qualifying retirement/coaching choice → the same person in staff/manager candidacy → linked actual career facts.

## chg
- r11 261110 WORLD-6✎ one shared age ladder (18 + (year + place) mod 18)→each club's own start and order; a sold place refilled at the club's strength and the departed's age, a new person each season→2–6 below at an age within 4, the same person to his cohort's end; every place drawn at the club's strength→players carry their own class and an age term, starters' mean at the club's strength, bench below, headroom narrowing with age, in production on its MATCH-2/23 CLUB-46/48 LEAGUE-10 gate
- r10 261109 WORLD-14✎ the owner's business settles through the war gap each quarter→on its monthly dates (→OWNER-7)
- r9 261103 WORLD-13✎ fixtures before the takeover on the path clubs nobody owns use→the results-only path (→MATCH-22)
- r8 261103 WORLD-5✎ the owner's club founded in the amateur league→an existing professional club he buys; WORLD-8✎ no fabricated pre-start background→the background is the seasons played since 1930; WORLD-9- amateur clubs and league removed; WORLD-13+ the world is made in 1930 and lives to the chosen decade; WORLD-14+ wartime stop 1939/40–1945/46; WORLD-15+ generated strength by tier and stature (from WORLD-9, amateur level dropped)
- r7 261102 WORLD-12+ person names: per-country pools 6–8 given × 6–8 surnames→at least 100 × 200 in the country's spelling, no shared surname within a generated NPC or founding squad, name draws never shift other attributes
- r6 261016 WORLD-11✎ NPC continuity scope open→retain high/very-high coaching prospects and all former own players, actual age/retirement/affiliation and unique cross-role identity; ordinary club-strength model unchanged
- r5 261016 WORLD-10✎ sequential role continuity→also one shared identity for concurrent player/coach roles
- r4 261016 WORLD-6✎ seasonal squad identities→cross-role continuity reference; WORLD-10+ cross-club second-career person continuity; WORLD-11+ open NPC continuity/retirement scope
- r3 261015 WORLD-6✎ NPC squads of four roles→the player model filling their tactic's formation
- r2 261011 WORLD-5✎ reserved lowest-tier slot→player club founded in the amateur league; WORLD-9+ 15 amateur clubs per country and tier strength ranges
- r1 261007 initial
