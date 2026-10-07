# LEAGUE Domestic seasons and relegation
> r1 | Define the implemented browser-demo behavior for domestic seasons and relegation.

## decisions
- LEAGUE-1 [o] Every group uses a home/away round robin with odd-team byes. Rank by points (3/1/0), goal difference, goals, then stable ID.
- LEAGUE-2 [o] Country profiles carry automatic promotion, promotion-playoff and relegation places; capacity is conserved across tier/group exchanges.
- LEAGUE-3 [o] ENG boundaries move 3/3/4 clubs, ESP 3, GER 2 plus upper/lower playoff, ITA 3 then 4 (three group winners plus playoff), FRA 2 plus playoff, POR/NED 2 plus playoff, BEL 2 plus playoff. Complex regional/reserve/licensing exceptions are normalized.
- LEAGUE-4 [o] Promotion playoffs actually simulate ties and archive the player club ties; no arbitrary ranking promotion when a playoff is specified.
- LEAGUE-5 [o] Each implemented association runs a single-elimination domestic cup; cup winner qualification is distinct from league qualification.
- LEAGUE-6 [o] Own-club relegation below the supported pyramid enters a lightweight lower-tier season, retains history/control, and can return through a promotion challenge. A background entrant fills the professional vacancy.
- LEAGUE-7 [o] Global rounds spread shorter schedules across the world season; domestic cup and European ties occupy separate slots. Completed fixtures settle once.
- LEAGUE-8 [o] Close a season only after its fixtures/cups/Europe and financial settlement; archive standings, renew personnel and fixtures, then advance the season.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
