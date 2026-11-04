# LEAGUE Domestic seasons and relegation
> r16 | Define the browser-demo rules for domestic seasons and relegation.

## decisions
- LEAGUE-1 [o] Every group uses a home/away round robin with odd-team byes. Rank by points (3/1/0), goal difference, goals, then stable ID.
- LEAGUE-2 [o] Country profiles carry automatic promotion, promotion-playoff and relegation places; capacity is conserved across tier/group exchanges.
- LEAGUE-3 [o] ENG boundaries move 3/3/4 clubs, ESP 3, GER 2 plus upper/lower playoff, ITA 3 then 4 (three group winners plus playoff), FRA 2 plus playoff, POR/NED 2 plus playoff, BEL 2 plus playoff. Complex regional/reserve/licensing exceptions are normalized.
- LEAGUE-4 [o] Promotion playoffs actually simulate ties and archive the player club ties; no arbitrary ranking promotion when a playoff is specified.
- LEAGUE-5 [o] Each implemented association runs a single-elimination domestic cup through the season; cup winner qualification is distinct from league qualification. ← cup ties belong between league weekends, not after the last round
  - entrants: every professional club of the country, seeded by division then strength; a first round brings the field to a power of two and the top seeds wait for the next round.
  - an open draw from the world's stream pairs each round once the previous one is complete; the first club drawn is at home; a level tie goes to extra time and penalties.
  - midweek rounds (league round × 7 − 3 days): the last N of 5, 11, 16, 23, 28, 35, 42, so the final is in late May; the own club's draw is an inbox item (→WEB-42).
  - own prize per tie won by rounds left after it: semi-final 40, quarter-final 20, round of 16 10, earlier 5; the title 150 (1901 units).
  - the season archive keeps each country's final: runner-up, score and a shoot-out.
- LEAGUE-6 [x] The amateur level swaps places with the last professional division: each of its groups relegates its bottom two of the season just played and as many amateur clubs go up, the own club taking one of those places like any other club. ← one exchange for every club; a promotion never needs an extra place
- LEAGUE-7 [o] Global rounds spread shorter schedules across the world season; domestic cup and European ties are played midweek in rounds the other never uses (→LEAGUE-5, →EURO-10). Completed fixtures settle once.
- LEAGUE-8 [o] Close a season only after its fixtures/cups/Europe and financial settlement; archive standings, renew personnel and fixtures, then advance the season.

- LEAGUE-9 [o] A season closes on the day after its final round (day 323 counted from 1 August); the empty summer is skipped and the next season starts on 1 August. ← nothing happens after the final round, so waiting through it only delays the season review and the summer window
- LEAGUE-10 [o] Between seasons every club nobody owns rises or falls. ← fixed strengths let one well-run club pull away forever; real leagues see clubs rise and fall, while a few stay on top
  - it closes 20% of the gap to its level: its division's midpoint + its stature + last season's success; promotion closes 35% more of the gap at once and relegation 15%.
  - its means level (→!ECON-36): a club nobody owns that keeps books plays at most at the highest strength whose squad its last closed season's book pays: that squad's market wage bill (→CLUB-25, →CLUB-48), priced in the division and season the book was earned, at most the book's income less its operating expenses (→ECON-30). Its level is never above its means level, and a club above it after its summer change sells down to it at once. A club with a project, or in the summer of its takeover, is not held to it; a club without books has none. ← a club pays its stars from its own income, as small-league giants sell what their league's money cannot keep: a country's strongest club earns only 1.2–1.7× its top flight's median club (measured 261104)
  - the means level is in force only with CLUB-48's table and the books' competition money (→ECON-36), through CLUB-48's gate, never alone. ← at the modern spread it would sell the stars the 1950s market kept near a regular's pay, and on books without their cup and European nights it held the clubs those nights pay
  - stature is stable per club: each country has three giants (+13, +11, +9) and four big clubs (+6, +5, +5, +4), drawn mostly from its upper divisions; of the rest 45% are ordinary (−1 to +1) and the others small (−3 to −5).
  - success: last season's top-flight champion +3, the rest of the top four +1.5, a continental winner +2.
  - a rare project (a new owner, a golden generation; 0.4% a club a summer, from its own stream) adds 8–18 to its level, fading 15% a summer; a project in the owner's country within one division is reported. ← any club can become as strong as the owner's, by chance
  - strengths stay within 15–99, the very best an owner can build ← a cap below the owner's best would leave one club unbeatable
  - a normal summer's luck (sum of three uniforms, sd ≈ 1.5) and, each year, a 1.5% takeover (+4 to +8) or a 1.5% crisis (−4 to −8); reputation follows →LEAGUE-14.
  - measured 261011 (30 seasons, eight countries): 5–9 different champions per country, the most successful club 8–15 titles, champions average 2.15 points per game.
  - a takeover or project clears the club's debt (→ECON-36).
- LEAGUE-11 [o] The world season is lived one day at a time in one order, whatever advances it — an automatic day step, manual next-event advance, explicit round or an internal season simulation (public controls →WEB-5) — so every mode records the same facts (→ARCH-5). ← the control that advanced time must not change results
  - a midweek cup or continental tie plays on its own day, league round × 7 − 3 (→LEAGUE-5, →EURO-10), before that round's league matches.
  - a league match day plays the round's matches first, then the round's settlement (training, wages, supporters), then that day's club business — academy intake, market, delegated business, staff, retirement announcements, healed injuries — so a player healed or signed that day plays from his next match.
  - any other day plays its ties first, then its club business.
  - the season closes on the day after its final round (→LEAGUE-9).

- LEAGUE-12 [o] Every club nobody owns has a 조직력 (0.3–1.0) that its players play at, on the adaptation multipliers (→PLAYER-10); it is how settled its squad is under its manager. ← a club that changed its manager or its squad is not at full strength at once, and the owner's club pays for change by the same measure (→MATCH-2)
  - every club starts at 0.80 when the world is made.
  - each settled league round it rises 0.010 below 0.80 and 0.005 above, up to 1.0.
  - a new manager (→STAFF-17) takes 30% of the distance to 0.50 when his school differs from his predecessor's, 10% when it is the same.
  - between seasons a takeover or a project (→LEAGUE-10) takes 0.15, a promotion or a relegation 0.10, never below 0.30.
  - a rival's dossier and its league-table OVR show it (→WEB-58).
- LEAGUE-13 [o] Balance is measured on reference careers per wealth tier: a takeover in 1950 of the median-priced club of the tier's reach in each country (→OWNER-3; the nearest band holding a club of that country when its own holds none) with no traits and no owner money moved (stake 0%, no injection, dividend 0%), all business responsibilities delegated and 기본 방향, run to 2009 in four countries (ENG ESP FRA GER) × 5 seeds; tuning changes rules and constants for every tier alike, never one tier's own. ← reaching the top should take long and holding it stay hard, with room for a lucky career
  | tier | first top-flight title | share of top-flight titles after the first | bankrupt |
  |---|---|---|---|
  | 석유 재벌 | most careers, median within 10 seasons | 35% or less | none |
  | 재벌 총수 | about half the careers | 30% or less | none |
  | 산업 자본가 | about a third of careers | 25% or less | none |
  | 중견 사업가 | 1 in 5 or fewer; the top flight in most careers | - | 1 in 20 or fewer |
  | 지역 유지 | the top flight in about half the careers | - | 1 in 10 or fewer |
  | 자수성가 축구팬 | the top flight in 1 in 4 careers or fewer | - | 1 in 5 or fewer |
  - careers with five traits are measured beside each tier; the bands hold for no traits.
  - bankrupt counts the club's bankruptcy (→ECON-24); the owner's fortune is measured beside it on a 50% dividend, since the reference moves no owner money.
  - measured 261104 (no traits, 2 seeds × ENG ESP FRA GER, 1950–1969: a third of the bands' span, so later titles are unread; 자수성가 축구팬 can pay for no Spanish club in any band):
    | tier | careers | first top-flight title | reached the top flight (mean seasons there of 20) | club bankrupt |
    |---|---|---|---|---|
    | 석유 재벌 | 8 | none | 3 (4.6) | 6, in 1950–51 (ESP FRA GER): the strongest clubs pay 1.8–3.3× their income in wages |
    | 재벌 총수 | 8 | none | 8 (12.9) | none |
    | 산업 자본가 | 8 | 1, in its 2nd season, none in the 18 after | 8 (13.4) | none |
    | 중견 사업가 | 8 | 1, in its 14th season | 8 (9.4) | none |
    | 지역 유지 | 8 | none | 8 (8.5) | none |
    | 자수성가 축구팬 | 6 | none | 6 (7.8) | none |
    - on a 50% dividend (seed 0) no owner is bankrupt and 5 of 23 face 구단주 퇴진 in seasons 13–19 (→OWNER-13); on 25%, 1 of 19 in his 20th season.

- LEAGUE-14 [o] Every club's reputation (0–100) follows its standing, the owner's club and clubs nobody owns alike: at each season close it closes 20% of the gap to the level of the division it will play in next, plus its league finish; honours add at once. ← standing is relative: decades in a lower division never make a giant, and a fallen giant's name fades over seasons, not at once
  - division level: top flight 75, then 15 less per tier (second 60, third 45, fourth 30), at least 8.
  - league finish: 3 × (1 − 2 × (rank − 1) / (clubs − 1)) in the club's own league or group: champion +3, middle 0, last −3; a club that played no league season adds nothing.
  - honours: a domestic cup won +2 (→LEAGUE-5); each continental match played +0.2, a continental title +8.
  - the same results season after season settle it 5 × the finish term from its level, within ±15 of it (top-flight champion 90, middle 76; third-division middle 46); continental honours lift a top club toward 100.
  - continental opponents from countries not played keep their reputation.
  - measured 261016 for the owner's club (domestic cup term not included; ENG, 보통, all business delegated, 3 seeds): mostly third-division careers stand at 44–50 with 30–33k supporters in 2000, and a club relegated from the second division fell from 49 to 43 and from 59k to 30k supporters over eleven seasons.

- LEAGUE-15 [o] Players of clubs nobody owns are injured (→CLUB-23) and suspended (→MATCH-19) like own players, on whichever engine path their fixture takes (→MATCH-22); their club's XI and bench skip them while they are out. ← an opponent can really be weakened, and the owner's club is not the only one that loses players
  - each club keeps a short list of its unavailable players (who, until when, how many matches banned); it clears when the club's squad is generated for a new season (→WORLD-6), while an unserved ban carries over by person.
  - every league keeps a discipline table: each player's yellow and red cards and current bans by competition.

- LEAGUE-16 [o] The last professional division relegates nobody; its promotion places go up as before, and the division above relegates into it. Finishing last there costs 팬 민심 (→OWNER-12). ← with no amateur level there is nowhere to go down to

## chg
- r16 261104 LEAGUE-10✎ means level in force only with CLUB-48's table→with CLUB-48's table and the books' competition money (→ECON-36)
- r15 261104 LEAGUE-10✎ strength bounded by 15–99 only→also by a means level (the strength whose squad its last closed book pays at income − operating expenses; level never above it, sold down at once; projects and a takeover's summer exempt), in force only with CLUB-48's table
- r14 261104 LEAGUE-13✎ no measured line→measured 261104 on takeover careers (2 seeds × 4 countries, 1950–1969): titles, top-flight reach and club bankruptcies per tier, and 구단주 퇴진 on 50%/25% dividends
- r13 261103 LEAGUE-13✎ reference club at the tier's reach→the median-priced club of the tier's price band in each country, nearest band when none; bankrupt column→the club's bankruptcy (→ECON-24), the owner's purse measured beside it on a 50% dividend
- r12 261103 LEAGUE-5✎ entrants professional and amateur→professional only; LEAGUE-6- amateur exchange removed; LEAGUE-10✎ +a takeover or project clears the club's debt; LEAGUE-13✎ reference careers by difficulty level from the amateur league with level bands→per wealth tier from a 1950 takeover with tier bands; LEAGUE-14✎ a new club 12 and the amateur league's level 8→removed; LEAGUE-16+ the last professional division relegates nobody
- r11 261102 LEAGUE-13✎ reference careers named by the historical intervention level 4→all business responsibilities delegated only (the intervention level is removed)
- r10 261019 LEAGUE-15+ injuries and suspensions for clubs nobody owns, a retained unavailable list cleared at the seasonal squad generation, league discipline table
- r9 261016 LEAGUE-10✎ reputation of clubs nobody owns drifts 30% toward its division's→follows LEAGUE-14; LEAGUE-14+ every club's reputation: 20% of the gap to its next division's level (75/60/45/30, amateur 8) + league finish ±3, domestic cup +2, continental match +0.2 and title +8
- r8 261016 LEAGUE-11✎ progression examples→+manual next-event advance with identical daily order; LEAGUE-13✎ level 4 reference→equivalent all-delegated reference; balance bands, constants and measurements unchanged
- r7 261015 LEAGUE-13✎ unmeasured→measured 261015 column (rules 2.0.0, 160 careers): every level ≈60% titles near season 50, ≈21% after the first; 보통·어려움·최상 outside their bands
- r6 261015 LEAGUE-12+ 조직력 of clubs nobody owns (start 0.80, +0.010/+0.005 a round, new manager −30%/−10% of the distance to 0.50, takeover or project −0.15, promotion or relegation −0.10); LEAGUE-13+ balance bands per difficulty level on reference careers
- r5 261012 LEAGUE-6✎ worst last-division club dropped to make room for a promoted own club→one exchange: the bottom two of each last-division group for as many amateur clubs, chosen by the amateur table (playoff for the last place) while the own club plays in it; LEAGUE-11+ one day order for every progression mode
- r4 261012 LEAGUE-10✎ strength cap 92→99, +rare club projects adding 8–18 to a level and fading 15% a summer
- r3 261011 LEAGUE-5✎ season-close cup→midweek rounds with seeded byes, open draws, prizes and archived finals; LEAGUE-6✎ 8-club 14-game lower section with 2nd–4th playoff→16-club 30-game amateur league with 2nd–5th playoff; LEAGUE-7✎ separate cup and European midweeks; LEAGUE-10+ clubs nobody owns evolve between seasons
- r2 261009 LEAGUE-9+ season closed on 1 August→the day after the final round
- r1 261007 initial
