# IDEATION owner-wealth-and-takeover
> st:converted@261103 | Difficulty is the owner's starting wealth (six tiers) and how many traits he takes (0 hard … 5 easy); he picks the decade, buys any club at its value, stakes his own business at a rate he sets, funds the club from his pocket, takes dividends from it, and can lose by the club's bankruptcy, his own, or 팬 민심 turning on him.

## vision
- Problem (owner, 261102): difficulty is four levels that only scale starting cash and the starting XI (WEB-3); the owner's money and the club's money are one pot, and 구단주 추가 출자 is free money capped at three a season with reputation −2 (ECON build `ownerCapital`).
- Problem (owner, 261102): the owner can put money in but never take it out, so his own fortune never matters.
- Today's rules (read 261102): the world starts in 1950; the owner founds a new club in his country's amateur league (WEB-2, WORLD-5); the only game over is club bankruptcy (ECON-24); balance bands are measured per difficulty level on reference careers (LEAGUE-13, ECON-29).
- Target: owners who play long careers and want the owner's seat itself — his money, his patience, the fans' mood — to be the game.
- Core value: difficulty is how rich the owner is when he walks in and how much help he takes, and every pound moved between his pocket and the club is a decision with a cost — to his business, to the club's books, to the fans.

## explored
- [o] Difficulty is set by the owner's wealth, not by a level menu. ← owner 261102
- [o] Club money (구단 자금) and owner money (구단주 자금) are separate pots. ← owner 261102
- [x] No difficulty choice: the game generates the world ("세계를 생성중…") and draws the owner — 1) current wealth, 2) average business return, 3) a year between the 1930s and 1970s — and the owner takes over a club at that point. ← owner 261102: superseded the same day — the starting wealth is chosen, the business return is the owner's own running decision
- [x] Rerolling a drawn owner (three rerolls, unlimited, or none) ← owner 261102: there is no draw
- [o] The start sets difficulty first by the owner's starting wealth, in six tiers: the richest (석유 재벌, an oil fortune) can buy up to a top-flight upper-table club and spends almost without limit; the hardest is a self-made football fan. ← owner 261102
- [o] The six tiers, richest first, with the clubs each can reach: 석유 재벌 (a top-flight upper-table club, spending almost without limit), 재벌 총수 (top-flight mid-table), 산업 자본가 (top-flight lower table or second-tier top), 중견 사업가 (second or third tier), 지역 유지 (lower professional tiers), 자수성가 축구팬 (the lowest tier). ← owner 261102
- [x] 오일 머니 → 자수성가 축구팬 ← 오일 머니 is a 2000s word and reads wrong in the 1930s; 업종 names (석유왕, 선박왕 …) ← owner 261102 chose 석유 재벌 →
- [o] The owner picks traits at the start, e.g. 성공한 사업가 (business success chance up), a lucky one (win chance a little up), 협상의 달인 (signing chance up). ← owner 261102
- [o] Traits are the second step of difficulty: taking none is the hardest, taking five the easiest. ← owner 261102; difficulty = wealth tier × number of traits
- [x] One trait, or two ← owner 261102 made the count a difficulty step
- [x] More traits the poorer the owner ← owner 261102 made the count the owner's own choice
- [o] Eight traits, of which the owner takes 0 to 5 (so even five leaves three out): 성공한 사업가 (business success 50% → 60%), 승리의 부적 (the club's win chance a little up), 협상의 달인 (signing and renewal talks succeed more), 팬들의 친구 (팬 민심 falls less), 마당발 (better manager and coach candidates), 원석 감별사 (more prospects found, scouting more exact), 마케팅 귀재 (more sponsor offers), 정치력 (stadium and facility works cost less). ← owner 261102; names may change
- [x] Exactly five traits ← taking five would leave no choice
- [o] 승리의 부적 raises the owner's club's win chance a little: a stated exception, taken by the owner's own choice at the start, to own-club-match-edge (our club wins what its strength earns) and MATCH-2 (same terms for both sides). ← owner 261102
- [x] Luck off the pitch only (prospects, injuries, sponsors), or no lucky trait ← owner 261102 chose a small win-chance rise
- [o] The owner's business runs at a risk he sets and can change at any time, from high return and high risk to low return and low risk, applied as time runs. ← owner 261102; the owner manages his own fortune, it is not dealt to him
- [o] The business either succeeds or fails at each settlement, 50/50 unless 성공한 사업가 raises the chance; the owner sets the rate at stake, up to 100%: success adds that share of his fortune, failure takes it away (at 100% a failure wipes him out). ← owner 261102; replaces average returns and a separate collapse chance — a failure at a high rate is the collapse
  - consequence (planner, 261102): an even bet at ±r leaves (1+r)(1−r) = 1−r² after one win and one loss, so without a business trait the business is a pure gamble that shrinks the fortune over time; dividends are then the only steady way to grow it, and a desperate owner can still gamble
- [o] The business settles each quarter (four times a year); the rate at stake is a slider from 0 to 100%. ← owner 261102; news from the business during the season feels live, and a single ruin needs a high rate
- [x] Five risk steps with average returns (+3% … +18%), loss frequency and a yearly collapse chance ← owner 261102 chose a 50/50 bet at a rate he sets
- [x] A yearly settlement; a monthly one with five capped steps ← owner 261102 chose quarterly with a slider
- [x] The owner's business return moves from year to year around the level his risk setting gives, with loss-making years; a business can rarely collapse outright, more likely the higher its return (Parma and Parmalat 2003, Lazio and Cirio). ← owner 261102 chose it first, then replaced it the same day with the 50/50 bet at a set rate
- [x] Return and fixed outgoings only, no collapse; a wealth floor relative to the takeover ← owner 261102 chose a business that can fail
- [o] The owner pays fixed living costs each quarter, set by his wealth tier; an owner who has sunk everything into the club falls below zero and has to cover it with dividends. ← owner 261102; without them a failed bet only reaches zero at 100% and owner bankruptcy would be self-chosen
- [x] No fixed outgoings ← owner bankruptcy only from an all-in bet
- [o] The owner may put any amount of his own money into the club at any time. ← owner 261102
- [o] The dividend is a share of the season's profit taken at the season close, set on a dial of 0/25/50/75/100%; a loss-making season pays none; what is taken lowers 팬 민심. ← owner 261102; real dividends are yearly
- [x] A monthly share, or a share plus withdrawals at any time ← owner 261102 chose the season close
- [o] From the 2011/12 season UEFA's financial fair play (FFP) limits how much the owner may put into the club, as it did for real clubs (Málaga excluded from Europe 2013; Manchester City and PSG settlements 2014); its scope and figures are set in the SSOT. ← owner 261102; the oil fortune's near-unlimited spending meets the limit of its time
- [o] Three ways to lose: the club goes bankrupt, the owner goes bankrupt, or 팬 민심 falls to the floor (taking money out keeps lowering it). ← owner 261102
- [o] The supporters' approval of the owner is 팬 민심 (Korean football media's word: 팬 민심 폭발); at the floor the owner is forced out (구단주 퇴진). ← owner 261102
- [x] 구단주 지지율, 시민 지지율, 서포터 여론 ← owner 261102 chose 팬 민심
- [o] Besides dividends, 팬 민심 moves with results (wins, titles and promotion raise it; losing runs, relegation and finishing bottom lower it), the owner putting his own money in and big signings (raise), the ticket price (a high price keeps wearing it down), and selling a star or changing the club's identity — name, kits, crest (lower it sharply; Cardiff City's red kits 2012, Hull City's "Hull Tigers"). ← owner 261102
- [o] Crises are shown, never stopped for: 구단 파산 위기, 구단주 파산 위기 and 퇴진 압박 appear as a status on screen, not a modal that halts play; the club's bankruptcy UX changes the same way. ← owner 261102; today 파산 위기 still halts play as an alert in practice (WEB-56 already says money trouble is shown, not stopped)
- [o] 구단주 파산 위기 runs to the season close: a fortune below zero cannot be staked, so the dividend is the only way back, and an owner still below zero after it goes bankrupt; 퇴진 압박 runs 8 league rounds like the club's bankruptcy countdown (ECON-24), turned back by results and spending. ← owner 261102
- [x] Game over at once on touching the floor ← no room to respond
- [x] Eight rounds for all three, or the season close for all three ← an owner below zero has no way back before the dividend; a whole season takes the edge off 퇴진 압박
- [o] The owner chooses the takeover year by decade — 1930, 1940, 1950, 1960, 1970, 1980, 1990 or 2000 — each with a line on the football of its time (e.g. 1930: the early days of league football). ← owner 261102; the start stays a choice, not a draw
- [x] A random year between the 1930s and 1970s, or a random default the owner may change ← owner 261102 chose a direct choice by decade
- [o] The world is generated and runs up to the chosen decade before the takeover ("세계를 생성중…"). ← owner 261102
- [o] Wartime: league football stops from 1939/40 to 1945/46, in the generated world as for an owner who took over in the 1930s (no league income through the war); choosing the 1940s takes over at the 1946 restart. ← owner 261102; the decades differ as they did
- [x] No war in the fictional world ← the 1940s would read like any other decade
- [o] Every club carries a price, set by its club value (구단 가치); the owner may buy any club he can afford. ← owner 261102
- [o] A high club value does not mean a high profit: a valuable club may be spending heavily, so its new owner may have to keep putting money in. ← owner 261102; the strongest affordable club is not automatically the right buy
- [x] Choosing from 3–5 clubs for sale within the owner's means; one club assigned at random ← owner 261102 chose a price on every club
- [o] The buyer takes over the club's cash and debts as they stand; club value counts its players, stadium, following and league place less its debts, so an indebted big club comes cheap and has to be paid down from the first day (Abramovich took over Chelsea's debts in 2003). ← owner 261102
- [x] A clean takeover (price only, no debts) ← owner 261102 chose inheriting cash and debts
- [x] Borrowing part of the price and loading it onto the club (the Glazers at Manchester United, 2005) ← owner 261102 chose inheriting cash and debts
- [o] Founding a new club goes, and the amateur club system with it: no amateur leagues, every club is a professional club with a price; the 자수성가 축구팬 buys a club in the lowest professional tier. ← owner 261102; one way to start
- [x] Keeping founding beside the takeover ← owner 261102: two ways to start
- [o] The last professional division relegates nobody; finishing bottom costs 팬 민심. ← owner 261102; with no amateur level there is nowhere to go down to
- [x] Re-election (the Football League until 1987), our club voted out ending the career ← owner 261102 chose no relegation
- [o] The new rules start with new careers; older saves do not open in them (their export files stay). ← owner 261102; pre-release, a clean model beats estimating a fortune, traits and 팬 민심 for old careers
- [x] Converting older saves ← estimated owner state and a converter kept forever
- [x] Selling the club as an exit or goal ← owner 261102: not in v1
- [x] Owners at other clubs (sugar daddies) ← owner 261102: not in v1, as in difficulty-and-adaptation
- [o] Feasibility: clubs nobody owns keep season books settled once a season from the same scales as the owner's club, keeping the current and last season (→ECON-36). ← books per round for every club through seven decades would cost too much time and storage
- [o] Feasibility: world generation has a budget of 5 s for a 1930 takeover and 90 s for a 2000 takeover with the season reached on screen (→ARCH-28), measured before release. ← a 2000 start runs seventy seasons first

## shape
- flow: choose the owner's wealth tier → his traits (0 = hard … 5 = easy) → the takeover decade (1930–2000, each with its line) → "세계를 생성중…" runs the world to that decade → every club priced by its club value (assets less debts); the owner buys one he can afford and takes over its cash and debts → seasons: the owner sets the rate he stakes on his business (slider 0–100%), it succeeds or fails each quarter (50/50, 60% with 성공한 사업가) and he pays his living costs; he puts money in at any time (within FFP from 2011/12) and takes a share of each season's profit at its close; 팬 민심 moves → crises show as a status (구단 파산 위기 8 rounds, 구단주 파산 위기 to the season close, 퇴진 압박 8 rounds) → career ends on club bankruptcy, owner bankruptcy or 구단주 퇴진
- start screen: tier cards (석유 재벌 … 자수성가 축구팬, each with the clubs it reaches) → trait picks with the count read as difficulty → decade cards with their lines → generation progress → club list with price, cash, debts, last season's books and squad
- v1: six wealth tiers; eight traits, 0–5 taken; decade choice 1930–2000; world from 1930 with the wartime stop; club value and takeover with cash and debts; books for every club; owner fortune, quarterly business stake and living costs; injection at any time; season-close dividend dial; FFP from 2011/12; 팬 민심 and its drivers including identity changes; crises as a status with their countdowns; no amateur level, no relegation from the last division; new careers only
- not: selling the club; owners at other clubs; borrowing to buy; a random draw or rerolls; converting older saves

## domains
- [o] OWNER: new domain — owner fortune separate from club cash; six wealth tiers and what each reaches; eight traits, 0–5 taken; business stake slider and quarterly 50/50 settlement (60% with 성공한 사업가); quarterly living costs by tier; injection at any time; season-close dividend dial; FFP limit from 2011/12; 팬 민심 and its drivers; 구단주 파산 위기 to the season close and 퇴진 압박 over 8 rounds →OWNER
- [o] WEB: WEB-2 WEB-3 WEB-15 start flow of tier → traits → decade with its line → generation → priced club list and takeover; the four difficulty levels and starting-XI offsets go →WEB
- [o] WEB: WEB-56 crises shown as a status, never a halting modal, for the club's bankruptcy, the owner's and 퇴진 압박 →WEB
- [o] ECON: club value (players, stadium, following, league place, less debts); takeover with cash and debts; books for clubs nobody owns; 구단주 추가 출자 and the 구단주 투자/회원제 운영 card effects replaced by owner injection; ECON-24 joined by owner bankruptcy; ECON-29 reference careers rethought →ECON
- [o] WORLD: WORLD-5 WORLD-8 WORLD-9 the world starts in 1930 and runs to the chosen decade, league football stopped 1939/40–1945/46; the owner's club is an existing club; amateur leagues and the amateur exchange go →WORLD
- [o] LEAGUE: the last professional division relegates nobody; LEAGUE-13 balance bands per wealth tier × trait count →LEAGUE
- [o] MATCH: MATCH-2 승리의 부적's stated exception →MATCH
- [o] KIT: changing an inherited club's name, kits and crest after the takeover, at a 팬 민심 cost →KIT
- [o] SAVE: the new rules start with new careers only →SAVE

## open
- -
