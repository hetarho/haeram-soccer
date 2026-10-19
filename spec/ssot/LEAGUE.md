# LEAGUE Domestic seasons and relegation
> r10 | Define the browser-demo rules for domestic seasons and relegation.

## decisions
- LEAGUE-1 [o] Every group uses a home/away round robin with odd-team byes. Rank by points (3/1/0), goal difference, goals, then stable ID.
- LEAGUE-2 [o] Country profiles carry automatic promotion, promotion-playoff and relegation places; capacity is conserved across tier/group exchanges.
- LEAGUE-3 [o] ENG boundaries move 3/3/4 clubs, ESP 3, GER 2 plus upper/lower playoff, ITA 3 then 4 (three group winners plus playoff), FRA 2 plus playoff, POR/NED 2 plus playoff, BEL 2 plus playoff. Complex regional/reserve/licensing exceptions are normalized.
- LEAGUE-4 [o] Promotion playoffs actually simulate ties and archive the player club ties; no arbitrary ranking promotion when a playoff is specified.
- LEAGUE-5 [o] Each implemented association runs a single-elimination domestic cup through the season; cup winner qualification is distinct from league qualification. ← cup ties belong between league weekends, not after the last round
  - entrants: every professional and amateur club of the country, seeded by division then strength; a first round brings the field to a power of two and the top seeds wait for the next round.
  - an open draw from the world's stream pairs each round once the previous one is complete; the first club drawn is at home; a level tie goes to extra time and penalties.
  - midweek rounds (league round × 7 − 3 days): the last N of 5, 11, 16, 23, 28, 35, 42, so the final is in late May; the own club's draw is an inbox item (→WEB-42).
  - own prize per tie won by rounds left after it: semi-final 40, quarter-final 20, round of 16 10, earlier 5; the title 150 (1901 units).
  - the season archive keeps each country's final: runner-up, score and a shoot-out.
- LEAGUE-6 [o] The amateur level swaps places with the last professional division: each of its groups relegates its bottom two of the season just played and as many amateur clubs go up, the own club taking one of those places like any other club. ← one exchange for every club; a promotion never needs an extra place
  - while the own club plays in the amateur league (→WORLD-9) — a 30-game, 16-club season it was founded in or relegated to, keeping its history and control — that table decides who goes up: every place but the last by rank, the last by a playoff of the next four clubs.
  - where no amateur league is played, the strongest amateur clubs go up.
- LEAGUE-7 [o] Global rounds spread shorter schedules across the world season; domestic cup and European ties are played midweek in rounds the other never uses (→LEAGUE-5, →EURO-10). Completed fixtures settle once.
- LEAGUE-8 [o] Close a season only after its fixtures/cups/Europe and financial settlement; archive standings, renew personnel and fixtures, then advance the season.

- LEAGUE-9 [o] A season closes on the day after its final round (day 323 counted from 1 August); the empty summer is skipped and the next season starts on 1 August. ← nothing happens after the final round, so waiting through it only delays the season review and the summer window
- LEAGUE-10 [o] Between seasons every club nobody owns rises or falls. ← fixed strengths let one well-run club pull away forever; real leagues see clubs rise and fall, while a few stay on top
  - it closes 20% of the gap to its level: its division's midpoint + its stature + last season's success; promotion closes 35% more of the gap at once and relegation 15%.
  - stature is stable per club: each country has three giants (+13, +11, +9) and four big clubs (+6, +5, +5, +4), drawn mostly from its upper divisions; of the rest 45% are ordinary (−1 to +1) and the others small (−3 to −5).
  - success: last season's top-flight champion +3, the rest of the top four +1.5, a continental winner +2.
  - a rare project (a new owner, a golden generation; 0.4% a club a summer, from its own stream) adds 8–18 to its level, fading 15% a summer; a project in the owner's country within one division is reported. ← any club can become as strong as the owner's, by chance
  - strengths stay within 15–99, the very best an owner can build ← a cap below the owner's best would leave one club unbeatable
  - a normal summer's luck (sum of three uniforms, sd ≈ 1.5) and, each year, a 1.5% takeover (+4 to +8) or a 1.5% crisis (−4 to −8); reputation follows →LEAGUE-14.
  - measured 261011 (30 seasons, eight countries): 5–9 different champions per country, the most successful club 8–15 titles, champions average 2.15 points per game.
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
- LEAGUE-13 [o] Balance is measured on reference careers with all business responsibilities delegated (the historical intervention level 4) and 기본 방향 (→ECON-29's runs: 1950–2009, four countries × difficulty level × 5 seeds), and holds these bands; tuning changes the rules and constants for every level alike, never one level's own. ← reaching the top should take long and holding it stay hard, with room for a lucky career
  | level | first top-flight title | share of top-flight titles after the first | bankrupt | measured 261015 (rules 2.0.0, 40 careers a level: ENG ESP FRA GER × 10 seeds, default direction, 1950–2009) |
  |---|---|---|---|---|
  | 쉬움 | most careers; median 35–50 seasons, the fastest within about 25 | 20–35% | none | 60% win; median 51.5, fastest 27; 21.2% after; 1 bankrupt (ESP, 47 amateur seasons) |
  | 보통 | about a third of careers | 20% or less | none | 62.5% win, outside the band; median 49, fastest 27; 22.4% after; none bankrupt |
  | 어려움 | 1 in 5 careers or fewer | - | 1 in 20 or fewer | 57.5% win, outside the band; median 49, fastest 24; 20.7% after; 1 bankrupt |
  | 최상 | half the careers reach the top flight or fewer | - | 1 in 5 or fewer | 37 of 40 reach the top flight and 70% win, outside the band; 1 bankrupt |
  - the levels do not separate: a level sets only the start (→WEB-3, CLUB-1), and over 60 seasons from the amateur league the start's cash and XI wash out, so every level wins about 60% of careers near season 50; a global constant moves every level alike, so meeting 보통·어려움·최상 needs a lasting level rule.

- LEAGUE-14 [o] Every club's reputation (0–100; a new club 12) follows its standing, the owner's club and clubs nobody owns alike: at each season close it closes 20% of the gap to the level of the division it will play in next, plus its league finish; honours add at once. ← standing is relative: decades in a lower division never make a giant, and a fallen giant's name fades over seasons, not at once
  - division level: top flight 75, then 15 less per tier (second 60, third 45, fourth 30), at least 8; the amateur league 8.
  - league finish: 3 × (1 − 2 × (rank − 1) / (clubs − 1)) in the club's own league or group: champion +3, middle 0, last −3; a club that played no league season adds nothing.
  - honours: a domestic cup won +2 (→LEAGUE-5); each continental match played +0.2, a continental title +8.
  - the same results season after season settle it 5 × the finish term from its level, within ±15 of it (top-flight champion 90, middle 76; third-division middle 46); continental honours lift a top club toward 100.
  - continental opponents from countries not played keep their reputation.
  - measured 261016 for the owner's club (domestic cup term not included; ENG, 보통, all business delegated, 3 seeds): mostly third-division careers stand at 44–50 with 30–33k supporters in 2000, and a club relegated from the second division fell from 49 to 43 and from 59k to 30k supporters over eleven seasons.

- LEAGUE-15 [o] Players of clubs nobody owns are injured (→CLUB-23) and suspended (→MATCH-19) like own players, on whichever engine path their fixture takes (→MATCH-22); their club's XI and bench skip them while they are out. ← an opponent can really be weakened, and the owner's club is not the only one that loses players
  - each club keeps a short list of its unavailable players (who, until when, how many matches banned); it clears when the club's squad is generated for a new season (→WORLD-6), while an unserved ban carries over by person.
  - every league keeps a discipline table: each player's yellow and red cards and current bans by competition.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
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
