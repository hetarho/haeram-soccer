# LEAGUE Domestic seasons and relegation
> r3 | Define the implemented browser-demo behavior for domestic seasons and relegation.

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
- LEAGUE-6 [o] The amateur league (→WORLD-9) is a 30-game, 16-club season. The own club in it, founded there or relegated to it, retains history/control; its champions go up, and second to fifth play off for the place when the own club is among them. The worst club of the last professional division drops to make room.
- LEAGUE-7 [o] Global rounds spread shorter schedules across the world season; domestic cup and European ties are played midweek in rounds the other never uses (→LEAGUE-5, →EURO-10). Completed fixtures settle once.
- LEAGUE-8 [o] Close a season only after its fixtures/cups/Europe and financial settlement; archive standings, renew personnel and fixtures, then advance the season.

- LEAGUE-9 [o] A season closes on the day after its final round (day 323 counted from 1 August); the empty summer is skipped and the next season starts on 1 August. ← nothing happens after the final round, so waiting through it only delays the season review and the summer window
- LEAGUE-10 [o] Between seasons every club nobody owns rises or falls. ← fixed strengths let one well-run club pull away forever; real leagues see clubs rise and fall, while a few stay on top
  - it closes 20% of the gap to its level: its division's midpoint + its stature + last season's success; promotion closes 35% more of the gap at once and relegation 15%.
  - stature is stable per club: each country has three giants (+13, +11, +9) and four big clubs (+6, +5, +5, +4), drawn mostly from its upper divisions; of the rest 45% are ordinary (−1 to +1) and the others small (−3 to −5).
  - success: last season's top-flight champion +3, the rest of the top four +1.5, a continental winner +2.
  - a normal summer's luck (sum of three uniforms, sd ≈ 1.5) and, each year, a 1.5% takeover (+4 to +8) or a 1.5% crisis (−4 to −8); strength stays within 15–92; reputation drifts 30% toward its division's.
  - measured 261011 (30 seasons, eight countries): 5–9 different champions per country, the most successful club 8–15 titles, champions average 2.15 points per game.
## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r3 261011 LEAGUE-5✎ season-close cup→midweek rounds with seeded byes, open draws, prizes and archived finals; LEAGUE-6✎ 8-club 14-game lower section with 2nd–4th playoff→16-club 30-game amateur league with 2nd–5th playoff; LEAGUE-7✎ separate cup and European midweeks; LEAGUE-10+ clubs nobody owns evolve between seasons
- r2 261009 LEAGUE-9+ season closed on 1 August→the day after the final round
- r1 261007 initial
