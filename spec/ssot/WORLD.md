# WORLD Fictional world and catalogs
> r13 | Define the browser-demo rules for fictional world and catalogs.

## decisions
- WORLD-1 [o] Playable associations: ENG ESP GER ITA FRA POR NED BEL. Other UEFA associations appear as representative clubs only.
- WORLD-2 [o] Use modern reference structures: ENG 20/24/24/24; ESP 20/22; GER 18/18/20; ITA 20/20/(3 groups of 20); FRA 18/18/18; POR 18/18; NED 18/20; BEL 18/15. Catalogs state source season and normalization.
- WORLD-3 [o] All generated clubs are independent fictional senior clubs. Reserve eligibility and special national subcompetitions are normalized and explicitly disclosed as demo simplifications.
- WORLD-4 [o] Names combine country cities and cultural word banks; no fixed real-club roster, real players, or mapped real-club strengths.
- WORLD-5 [o] The owner's club is an existing professional club he buys (→!ECON-38); no club is added for him and every professional group keeps its full capacity. ← the owner joins football as it stands
- WORLD-6 [o] Club and player identities are stable. Every player of a club of the eight playable associations is a persisted person from the world's first season (→!WORLD-16); a representative club (→WORLD-1) fields a squad generated each season from club, seed and birth cohorts. Cross-role person continuity follows →WORLD-10/11.
  - a generated squad — every club's founding squad in 1930 and a representative club's each season — carries the player model (→PLAYER-1) and fills the formation of its club's tactic (→STAFF-22) with a player at 최상 in every slot and a bench covering each line.
  - a generated squad holds one player of each age from 18 to 35 as birth cohorts; each club's age ladder starts at its own point and orders its places its own way, both fixed by the seed and the club, so clubs of one tactic do not field the same ages in the same places. ← one shared ladder turned every 4-3-3 club's striker 27 in the same season and stood keepers only at 24 and 35
  - a representative club's place a sale emptied is refilled until the next summer by a player 2–6 below the club's strength at an age within 4 of the departed's, drawn from the place's own stream, the same person until his cohort ends; the next summer's squad is drawn at strength again. ← a refill at the seller's strength and the departed's age let a club sell the owner the same player four times in a season, and a refill drawn per year became a new person every season
  - a generated squad holds stars, regulars and a bench as real squads do: each generated player carries his own class, drawn once from his own stream, and an age term, and his potential headroom narrows with age; the starters' mean is the club's founding or representative strength (→!WORLD-15) and the bench sits below them. Starting values, estimated (real XIs span about 8–12 OVR points, outfielders peak at about 25–29): ← flat squads put each ability band inside 3–5 clubs (measured 261110: players aged 18–30 at OVR 83–85 in 3–5 clubs, none at the four strongest), so a delegated club's signings bunched on one seller and the strongest club's eleven were the world's best
    | term | value |
    |---|---|
    | class | symmetric, within ±6 of the place's level |
    | bench | 3–8 below the starters' mean |
    | age | −7 at 18, −4 at 20, −1 at 22, 0 at 24–29, −1 at 31, −3 at 33, −5 at 35, linear between |
    | potential headroom | 10–35 at 20 or younger, narrowing linearly to 0–4 at 27 and older |
    - it enters production only when worlds lived with it hold MATCH-2's curve, MATCH-23's season scoring rows on the aggregate path, CLUB-46's value targets, CLUB-48's books and LEAGUE-10's champions (→!MATCH-2, →!MATCH-23, →!CLUB-46, →!CLUB-48); until then every place is drawn at the club's strength.

- WORLD-7 [o] Generation seed, catalog version and PRNG contract are saved. Reopening does not regenerate a different world.
- WORLD-8 [o] The world's background before the takeover is the seasons it actually played since 1930 (→WORLD-13); no season, honour or European record beyond them is fabricated.
- WORLD-9 [x] Every country has 15 amateur clubs one step below its last professional division; with the player's club they form a 16-club amateur league, and they are the pool that swaps places with clubs relegated out of the professional game.

- WORLD-10 [o] Second-career opportunities apply across clubs, not only to the owner's retirees (→STAFF-23/24).
  - a player who enters coaching and later management stays the same recognisable person, retaining his actual birth year, name and genuinely retained playing history (→HIST-14).
  - a playing coach (→STAFF-31) holds concurrent player/coach roles as one person; the two profiles and employment history must not create separate identities or duplicate the same period of coaching service.
  - seasonal squad generation must not rename, rejuvenate or duplicate that person as a new staff member. Missing other-club appearances or honours remain unavailable, never invented.
  - a persisted player's lifecycle is →WORLD-16 and his continuity →WORLD-11.

- WORLD-11 [o] A persisted player keeps one continuing identity across clubs, roles and seasons (→WORLD-6/16).
  - retain name, birth year, fixed qualities, current club/career status and actual recorded career events; the same person can retire, enter coaching and later qualify for management (→STAFF-25/30/38/39). Coaching eligibility follows his aptitude wherever he played; a low-aptitude former own player remains recognisable without gaining it.
  - age and retirement follow →CLUB-3's age/chance rules and →STAFF-34's accepted playing-coach deferral for every persisted player.
  - a recorded signing, sale, release, loan or return updates his affiliation/status, never his identity, age, attributes or history: he plays for his new club as the player he was. Reappearance in a squad, candidate pool or staff role resolves the same person; never create a duplicate across clubs or roles (→WORLD-10).
  - he is held in one place at a time: the owner's squad, one club's squad or the free agents (→CLUB-49). The row a departed player of ours leaves with us is his record with the club (→WEB-59), never a second player.
  - actual playing retirement ends active-player availability while retaining real career facts (→HIST-14, →HIST-23); a playing coach remains active only until his deferred retirement date (→STAFF-34). Keep existing lossless career/storage requirements (→SAVE-13/17).

- WORLD-12 [o] A generated person — player, prospect, coach or manager — is named one given name and one surname of his country, each drawn evenly from the catalog's pools of at least 100 given names and 200 surnames per country, written in the country's own spelling with its accents. ← 6–8 of each gave 315 distinct names to 13,178 players and repeated full names inside 2,300 squads (measured 261102); 20,000+ combinations per country keep a repeat rare
  - the 18 players of a generated squad (→WORLD-6) never share a surname. Youth (→WORLD-16), a vacancy's new person, signings and staff draw freely, so a squad can still hold two of one surname.
  - the pools are common names of the country, not real footballers (→WORLD-4).
  - drawing a name never shifts the draws behind the person's other attributes, so a change of pools renames generated people without changing their play or any match.
  - a stored name is never redrawn: own players, retained people and recorded facts keep the name they carry (→=SAVE-10).

- WORLD-13 [o] Every world is made in 1930 and lives from the 1930/31 season to the chosen decade's first season (→WEB-2) by the same day order (→LEAGUE-11), with nobody owning a club, behind a progress screen naming the season reached; the same seed and decade make the same world. ← the bought club arrives with a real past
  - every fixture before the takeover takes the results-only path (→MATCH-22); standings, cups, European results and honours are archived as in play (→HIST-2).
- WORLD-14 [o] League football stops for the war: after the 1938/39 close the world moves to 1 August 1946 without playing 1939/40–1945/46. People age through the gap, contracts and books stand still (no income, no wages, no costs), each skipped summer ages, develops and retires players and brings youth, with no transfer window (→WORLD-16), and the owner's business keeps settling and paying living costs on its monthly dates (→OWNER-7/8). A takeover in the 1940s happens at the 1946 restart. ← the decades differ as they did
- WORLD-15 [o] A club's founding strength in 1930 — the level its founding squad is drawn at (→WORLD-6) — is its division's level (professional tier t: 77−11t) + its stature (→LEAGUE-10) ± 3, within 15–92; from then on its strength is its squad's (→LEAGUE-10).

- WORLD-16 [o] Every persisted player lives one career, as the owner's players do: he enters through a founding squad (→WORLD-6) or a youth intake, develops and ages, plays on a contract, moves in the transfer windows and retires (→CLUB-3). ← the world's players are people with careers, not squads redrawn from a club's level each summer
  - youth: each summer every club nobody owns takes in youngsters from its own stream, more and better with its academy level (→WORLD-17) and never fewer than bring its squad back to its standing size (NPC_SQUAD.size); chance alone makes a golden generation.
  - development and ageing: the own players' rules (→PLAYER-15/16/17), with the club's training ground and coaching levels (→WORLD-17) in place of the owner's facilities, staff and squad investment, its manager's youth work and the default training focus.
    - round growth (→PLAYER-15/16) settles every 4 league rounds and at the close, each settlement carrying the rounds since the last; the season's own development and ageing (→PLAYER-15/17) once at the close. ← settled for every club each round, growth and the XI choice it forces cost 4.5 times a whole season's time (measured 261113, one shared host: 9,922 players of 451 clubs, 28 ms a growth pass and 106 ms an XI pass, 46 rounds, against a 1.36 s season)
  - contracts: each player has a wage (→CLUB-25/48) and an end season as own players do (→CLUB-26); at the close a club nobody owns renews whom it still needs and lets the rest join the free agents (→CLUB-49).
  - transfers: in the windows of →CLUB-17 clubs nobody owns buy, sell and loan among themselves, settled at once without negotiation, at market value (→CLUB-46) within their books (→WORLD-17) and for squad need; their bids for our players come from the same need (→CLUB-22). Every completed move is recorded with its clubs, fee and date.
  - a player two clubs want joins the one of higher stature (→LEAGUE-10), then the higher wage.
  - squads keep →CLUB-5's minimum, the registration limit (→CLUB-44) and a goalkeeper, and open every season at their standing size or more; every club's XI and bench follow →CLUB-6, chosen again when its players change, on a season's first day and at each window's close, an unavailable player giving way for his fixture alone (→LEAGUE-15).
  - the summer runs in one order for every club nobody owns, in a world with or without an owner:
    - 1 April: each player's retirement decision (→CLUB-3), one decision a player a season.
    - the close, in this order: season lines (→HIST-23), books (→ECON-36), promotion and relegation, the season's development and ageing, retirements, contracts renewed or ended, free agents signed for need, youth intake; the free agents' cap (→CLUB-49) applies after those signings.
    - the summer window (→CLUB-17); on its last day a club still below →CLUB-5's minimum or without a goalkeeper takes generated youth.
  - the war gap's skipped summers (→WORLD-14) each age, develop and retire players and bring youth, with no window; a running contract keeps the seasons it had left.

- WORLD-17 [o] A club nobody owns runs on its books and its stature; no scripted event raises or lowers it. ← clubs rise and fall from money, standing and chance, as the owner's club does; a rise rare in history still happens by luck
  - money: its wages and fees come from its books (→ECON-36): its wage bill is its players' contracts, and it signs no player whose wage would take the bill above its last closed season's income less operating expenses (→ECON-30); before its first close the limit reads its opening books' season income.
    - a club whose bill already stands above the limit lists its highest-paid players in the next window until it fits, keeping →CLUB-5's minimum and a goalkeeper. ← a limit on signings alone leaves a relegated club paying a top-flight squad on written-off debt for as long as its contracts run, outside →CLUB-48's books gate
    - a stored wage follows its country's money: at a currency change it converts as the books' cash does (→ECON-6).
  - stature (→LEAGUE-10) adds nothing to its strength: it raises its gate and commercial income (→ECON-8/9) and wins a contested player (→WORLD-16).
  - its academy, training ground and coaching levels start at its division's and stature's level in 1930, rise when its books spend cash on the club (→ECON-36) and fall slowly when they do not.
  - no project, takeover or crisis changes a club nobody owns; a rare rise comes from chance in its youth, its results and the market.

## flow

- Player career: founding squad or youth intake → development and ageing → contracts and transfer windows → retirement → kept when a record links him (→HIST-23), or coaching → the same person in staff/manager candidacy → linked actual career facts.

## chg
- r13 261113 WORLD-11✎ a move never changes identity, age or history→nor attributes, and a player is held in one place at a time (a departed own row is a record, not a second player); WORLD-16✎ youth by academy level→and never fewer than bring the squad to its standing size; growth cadence unstated→round growth every 4 league rounds and the close, annual development and ageing at the close; XI and bench by CLUB-6→chosen again on a change of players, a season's first day and each window's close; summer order unstated→1 April decisions, the close's fixed order, the window, last-day youth for a short squad; war gap→+a running contract keeps its seasons left; WORLD-17✎ wage limit stops signings only→a club above it lists its highest-paid players until it fits; +limit before the first close from the opening books; +stored wages convert at a currency change
- r12 261113 WORLD-6✎ NPC squads reproducible each season from club/seed/cohorts→every playable-country player persisted from 1930, generated squads only for founding and representative clubs; WORLD-11✎ continuity only for coaching prospects and former own players, no persistent NPC lifetimes→every persisted player one continuing identity; WORLD-12✎ an NPC club's season 18 and founding squad share no surname→a generated squad's 18; WORLD-14✎ clubs rise or fall once through the war→each skipped summer ages, develops, retires and brings youth, no window; WORLD-15✎ a generated club's strength→its founding strength, then its squad's; WORLD-16+ persisted player lifecycle (youth, development, contracts, two windows, retirement); WORLD-17+ clubs nobody owns run on books and stature, no scripted rise or fall
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
