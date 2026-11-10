# OWNER Owner fortune, takeover start, traits and standing
> r7 | Define the owner as a person with his own fortune, business and standing with the fans, set apart from the club he buys.

## decisions
- OWNER-1 [o] The owner's fortune (구단주 자금) and the club's cash (구단 자금) are separate pots; money moves between them only by an injection (→OWNER-9) or a dividend (→OWNER-11). From the takeover the fortune is kept in the club's currency and converts with it (→ECON-5/6). ← the owner's own money and the club's books are different stakes
- OWNER-2 [o] Difficulty comes from two start choices only: the owner's wealth tier (→OWNER-3) and how many traits he takes, 0 the hardest to 5 the easiest (→OWNER-5). Apart from the traits' own effects, every rule, coefficient and chance is the same for every start. There is no difficulty menu, draw or reroll. ← difficulty is how rich the owner is and how much help he takes, never changed dice
- OWNER-3 [o] Six wealth tiers, richest first, each starting with a fortune that reaches the clubs named; the owner may buy any club whose price his fortune pays, every club below his reach included. ← a rich owner chooses his project, he is not sent to the top
  | tier | reach: price rank among all clubs of the playable countries (OWNER_TIERS.band) | typical club | starting fortune (OWNER_TIERS) |
  |---|---|---|---|
  | 석유 재벌 | the dearest 8% | a top-flight upper-table club, spending almost without limit | 10 × anchor |
  | 재벌 총수 | 8–20% | a top-flight mid-table club | 1.6 × anchor |
  | 산업 자본가 | 20–35% | a top-flight lower-table or second-tier top club | 1.6 × anchor |
  | 중견 사업가 | 35–55% | a second- or third-tier club | 1.6 × anchor |
  | 지역 유지 | 55–80% | a club in the lower professional tiers | 1.6 × anchor |
  | 자수성가 축구팬 | the cheapest 20% | a club in the lowest professional tier | 1.6 × anchor |
  - the reach is a band of the price ranking, not of divisions, so every playable country holds clubs of most tiers whatever its number of professional divisions.
  - a tier's anchor is the median price (→ECON-37), in the takeover season, of the clubs in its reach across the playable countries, valued in pounds and converted into the bought club's currency at the takeover (→ECON-35).
  - the tier is fixed for the career; it never changes the rules, only the start.
  - the 1.6 multiple leaves the buyer of his country's median-priced club in the reach a fortune to live on (→OWNER-8): a country's band median costs up to 1.28× the anchor (measured 261104 on LEAGUE-13's reference careers), so at 1.3× its buyer kept 2–3% of his fortune.
- OWNER-4 [o] Wherever another rule speaks of founding, the founding moment is the takeover: the founding squad is the squad taken over, the founding direction uses standard defaults without a choice at the takeover (→WEB-15), and history starts there (→HIST-21). The club's manager at the takeover keeps his own school, style and level; the neutral founding manager of →STAFF-14/45 applies to no one. Each player taken over starts at an adaptation equal to the club's 조직력 at the takeover (→LEAGUE-12, →PLAYER-10). ← one meaning for every rule written for a founded club
- OWNER-5 [o] The owner picks 0 to 5 of eight traits at the start, fixed for the career:
  | trait | effect (OWNER_TRAITS) |
  |---|---|
  | 성공한 사업가 | business success chance 60% → 70% (→OWNER-7) |
  | 승리의 부적 | the own club's match strength +1 on the OVR scale (→OWNER-6) |
  | 협상의 달인 | player wage demands and asked transfer fees for the own club −10% |
  | 팬들의 친구 | every 팬 민심 drop ×0.7 (→OWNER-12) |
  | 마당발 | the manager and staff free-agent pools hold one more, and each new free agent comes +5 ability (→STAFF-17/49) |
  | 원석 감별사 | academy intake potential +3; scouting ranges of other clubs' players half as wide (→PLAYER-18) |
  | 마케팅 귀재 | sponsor offers ×1.15 (→ECON-8) |
  | 정치력 | operating expenses ×0.9 (→ECON-30) |
- OWNER-6 [o] 승리의 부적 is the one stated exception to the same-terms rule (→MATCH-2): taken by the owner's own choice at the start, it lifts only the own club's match strength. ← chosen openly as part of the start's difficulty, never a hidden edge
- OWNER-7 [o] The owner's business is a bet he sizes: a stake slider from 0% to 100% of his fortune, in whole percent, changeable at any time and applied at the next settlement.
  - settlements: the 1st of every month from September to June and the season's close day (→LEAGUE-9), eleven a season; the summer the close skips has none.
  - each settlement succeeds with 60% (70% with 성공한 사업가) and adds OWNER_BUSINESS.swing (5%) of the staked share of the fortune, or fails and takes it away; the draw comes from the world's stream, so a seed replays it.
  - a fortune at zero or below is not staked.
  - the slider states the success chance, the amount won or lost at the current fortune and the next settlement's date. ← a business succeeds more often than it fails, so a stake earns on average; the small monthly swing keeps a full stake near football's own price growth (about +10% a season, +23% with 성공한 사업가, against 4–13% a year for football values →ECON-2), so the dividend stays a steady way to grow the fortune
- OWNER-8 [o] Each season the owner pays living costs of OWNER_LIVING.season (0.8%) of his tier's starting fortune, grown with prices (→ECON-2), split evenly over the season's settlements (→OWNER-7); they are paid even below zero, deepening the debt. ← without outgoings a failed bet only reaches zero at 100% and owner bankruptcy would be self-chosen
  - an owner who moves no money (stake 0%, no injection, dividend 0%) is never bankrupt within 15 seasons, yet uses much of his fortune within a generation, so dividends stay the way to keep it.
  - measured 261104 (LEAGUE-13's reference careers, no traits, 2 seeds × ENG ESP FRA GER, 1950–1969): none bankrupt before his 17th season; the others had used 41–87% of their fortune by 1969. At 1.3× and 0.25%, 14 of 38 were bankrupt within 15 seasons, the earliest in his 3rd.
- OWNER-9 [o] The owner may put any amount of his fortune into the club's cash at any time (자금 투입), never more than his fortune above zero and within →OWNER-10. An injection is owner capital in the ledger, outside turnover (→ECON-10, →ECON-30), and raises 팬 민심 (→OWNER-12).
- OWNER-10 [o] From the 2011/12 season, while the club plays in its country's top flight, UEFA financial fair play caps injections: owner money put in over the current season and the two before may not exceed €45m until 2014/15 and €30m from 2015/16, in nominal euros converted at →ECON-35's rates. The injection control shows what remains and refuses beyond it; no later squad-cost rule replaces it. ← Málaga's European ban (2013) and the Manchester City and PSG settlements (2014) were the limit of their time
- OWNER-11 [o] The dividend is a dial of 0/25/50/75/100% (default 0%), set at any time and taken at the season close: that share of the season's net result when positive, never more than the club's cash above zero, moves from the club's cash into the fortune; a season with no profit pays nothing. What is taken lowers 팬 민심 (→OWNER-12). ← real dividends are yearly and come from profit
- OWNER-12 [o] 팬 민심 is the supporters' standing of the owner, 0–100, starting at FAN_MOOD.start (60) at the takeover; each settled league round it drifts 2% of the gap toward 60, and it moves with:
  | driver | change (FAN_MOOD) |
  |---|---|
  | own league result | win +1, draw 0, defeat −1 |
  | season close | a league or cup title +15, promotion +10, relegation −15, last place in the lowest professional division −10 |
  | injection | +1 per 1% of last season's turnover put in, at most +10 an injection |
  | big signing | a fee above the club's previous record +5 |
  | dividend | −0.5 per 1% of the season's turnover taken |
  | star sale | selling one of the club's three highest-OVR players −4, at most once a transfer window |
  | identity change | adopting a designer draft (→KIT-9) −20 |
  | ticket price | each home league match with a price above the era's default preset (→ECON-17) −0.2 per preset step above |
  - 팬들의 친구 multiplies every drop by 0.7 (→OWNER-5); rises are not scaled.
- OWNER-13 [o] 퇴진 압박: each settled league round with 팬 민심 below FAN_MOOD.floor (15) counts one, rising to the floor or above resets the count; at 8 in a row the owner is forced out (구단주 퇴진) and the career ends.
- OWNER-14 [o] 구단주 파산 위기: a fortune below zero after a settlement opens the crisis, which runs to the season close; a fortune below zero cannot be staked, so the season's dividend is the way back, and an owner still below zero after the close's dividend and living costs goes bankrupt (구단주 파산) and the career ends.
- OWNER-15 [o] Crises are shown: 구단 파산 위기 (→ECON-24), 구단주 파산 위기 and 퇴진 압박 appear as statuses with what remains of their count (→WEB-56). Only the start of a 파산 위기 (구단 or 구단주) stops a running automatic clock, once, behind a warning dialog (→!WEB-56); no other crisis opens a modal or halts the clock.
- OWNER-16 [o] A career ends on the club's bankruptcy (→ECON-24), the owner's bankruptcy (→OWNER-14) or 구단주 퇴진 (→OWNER-13); after it the game advances nothing and refuses every command but reading the inbox, and the game-over page names the cause (→WEB-56).
- OWNER-17 [o] Each season close records the owner's fortune, the season's business result, living costs, injections, dividend and 팬 민심 at the close (→HIST-21).
- OWNER-18 [o] Not in this version: selling the club, owners at other clubs, borrowing to buy, renaming the club, a draw or reroll of the owner, and converting careers made before the takeover rules (→SAVE-26).

## flow
- Start: wealth tier → traits (0–5) → takeover decade (→WEB-2) → world generation (→WORLD-13) → club list → takeover (→ECON-38)
- Season: stake set → monthly settlement (bet, living costs) → injections at will → league rounds move 팬 민심 → season close (dividend, business, living costs, crisis checks, record)
- End: club bankruptcy | owner bankruptcy | 구단주 퇴진 → game-over page

## chg
- r7 261110 OWNER-15✎ no crisis opens a modal or halts the clock→the start of a 구단/구단주 파산 위기 stops a running automatic clock once behind a warning dialog; 퇴진 압박 still never does
- r6 261109 OWNER-7✎ settlements 1 Nov/1 Feb/1 May + close, success 50%, the whole staked share won or lost→the 1st of each month September–June + close (eleven), success 60%, 5% of the staked share won or lost; OWNER-5✎ 성공한 사업가 50→60%→60→70%; OWNER-8✎ 0.2% of the starting fortune a settlement→0.8% a season split over its settlements
- r5 261104 OWNER-5✎ 마당발 candidate lists one longer, each candidate +5→free-agent pools one larger, each new free agent +5 (→STAFF-17/49)
- r4 261104 OWNER-4✎ founding direction chosen at takeover→standard defaults without a choice
- r3 261104 OWNER-3✎ starting fortune of the five tiers below 석유 재벌 1.3→1.6 × anchor, +the multiple's measured reason; OWNER-8✎ living costs 0.25%→0.2% a settlement, +no owner who moves no money bankrupt within 15 seasons, measured 261104
- r2 261103 OWNER-3✎ reach by divisions→a band of the price ranking (dearest 8%, 8–20, 20–35, 35–55, 55–80, cheapest 20%), any club the fortune pays may be bought; OWNER-8✎ living costs 1%→0.25% a settlement; OWNER-12✎ dividend −1→−0.5 per 1% of turnover, star sale −8→−4 at most once a window
- r1 261103 initial: owner fortune apart from club cash, six wealth tiers, eight traits taken 0–5, the takeover as founding, quarterly business bet and living costs, injections within FFP from 2011/12, season-close dividend dial, 팬 민심 with 퇴진 압박, 구단주 파산 위기, three game-over causes, season records
