# CLUB Squad and growth
> r47 | Define the browser-demo rules for squad and growth.

## decisions
- CLUB-1 [o] A club starts with 20 players (→CLUB-40), a suitable manager, small facilities, 800 supporters, and a complete starting XI whose rating sits at its league's average club XI plus its difficulty level's offset (→WEB-3: 쉬움 0, 보통 −2, 어려움 −4, 최상 −6; ±1). ← a fixed founding strength left clubs in shallow pyramids 7–12 points below their league
  - the 20 cover the founding manager's formation (→STAFF-22): every slot has a player at 최상 or 준수 there, with two goalkeepers.
- CLUB-2 [o] Every player carries his birth year, wage, contract term and reputation beside the player model (→PLAYER-1).
- CLUB-3 [o] Players age using the game calendar, develop and decline by attribute (→PLAYER-15, →PLAYER-17) and are replaced by generated youth. On 1 April each veteran decides from his own stream whether the season is his last; announced players play on and retire at the close unless an accepted playing-coach deferral applies (→STAFF-34). At 41 everyone stops playing, including playing coaches.
  - chance by age at the season's end: 33 8%, 34 18%, 35 35%, 36 60%, 37 80%, 38+ 95%; keepers count a year younger; ×0.6 for a starter rated 60+, ×1.4 under 900 season minutes.
  - the announcement is an inbox item, an event and news; an announced player cannot be listed. Retiring from play does not erase the person: coaching and later management are →STAFF-23/24, linked by →HIST-14.
  - at the close the squad is topped up to 20 players (→CLUB-40) with a goalkeeper: with academy promotion delegated by call-ups in →CLUB-43's order, then by generated 18-year-olds of the line the formation lacks most rated five below the average strength of the division the club will play in, on that division's market wage (→CLUB-25). ← youths rated against an XI that had outgrown its division arrived on star wages and were sold on as unhappy players

- CLUB-4 [o] Recruitment offers immediate contributors, prospects, free agents, and short-term loans. Free agents sign instantly at any time; fee-bearing transfers are negotiated bids (→CLUB-18). A player leaves only when another club's offer is accepted (→CLUB-22); there is no instant sale. ← a sale needs a buyer
- CLUB-5 [o] Transfer price, recurring wage, and term are shown before acceptance. Keep at least 14 players and one goalkeeper; the maximum is the league's registration limit (→CLUB-44).
- CLUB-6 [o] The automatic starting lineup fills the manager's formation (→STAFF-22) slot by slot with the available player of the highest 실효 OVR there (→PLAYER-6) less his fatigue load and the manager's selection trait (→STAFF-12), unless a saved manual XI is selected. Strongest/rest presets require at most selection plus confirmation; substitutions pick by level at the slot. ← the manager picks the man who plays that slot best, not the best name
  - a manual XI may put any player in any slot; he plays there at his level (미숙 60%), shown before it is saved.
  - the manager also names the substitutes the era allows (→MATCH-20) — a goalkeeper first once three or more may be named, then cover for each line by 실효 OVR — and the set-piece and penalty takers by their attributes (→MATCH-18); injured and suspended players are never named.
- CLUB-7 [o] Promotion, supporters, facilities, managers, player generations and finance measure growth; history survives transfers and retirement.
- CLUB-8 [o] Facility investment has a stated price and improves development/reach; actions fail cleanly if cash is insufficient.

- CLUB-9 [o] Match fatigue retains a higher cost for pressing than other tactics, modified within bounded ranges by 체력. Rest selection trades immediate strength for lower fatigue; a saved manual lineup keeps its slots, and an unavailable player is replaced by the available player of the highest 실효 OVR at that slot.

- CLUB-10 [o] Match preparation separates tactic and lineup tabs, shows real current-versus-draft strength/fatigue, and keeps apply/close controls reachable while optional slot details scroll. The lineup tab draws the formation: each slot with its position and role, its player's level there, adaptation and 실효 OVR.

- CLUB-11 [o] The first team's training focus is 균형, 회복 or 하드 트레이닝, for the squad and, as an exception, for single players (→CLUB-13). It applies once at settled domestic round boundaries; selecting a focus, viewing it, or advancing idle days does not grant growth. 하드 trades fatigue, injuries and morale for faster growth and adaptation; 회복 trades growth for fresher players. ← hard work has to cost something a fan recognises
  | focus | growth (→PLAYER-15) | adaptation (→PLAYER-12) | fatigue recovered per round |
  |---|---|---|---|
  | 회복 | ×0.4 | +0.002 | 16 |
  | 균형 | ×1.0 | +0.004 | 11 |
  | 하드 | ×1.6 | +0.007 | 6 |
  - recovery before staff and policy bonuses. ← a regular starter's 10–13 per match then levels off under 균형; 하드 or pressing accumulates
  - a player's own focus replaces the squad's for him; 하드 also brings training injuries (→CLUB-23) and costs morale from its third round in a row (→CLUB-19).

- CLUB-12 [o] How a player develops is PLAYER-15–PLAYER-17. Record bounded cumulative actual positive development on the player, preserve retirement/history, and show current OVR, potential and earned growth.

- CLUB-13 [o] The training focus is always the coaches' call: each settled round the assistant (수석코치) sets the first team's, and any player's own, by his rules, unless a suggestion he accepted or an order the owner forced holds that round for that target (→STAFF-19). Nobody else chooses it and no business-responsibility setting hands it to the owner (→WEB-45). ← how a squad trains is the staff's job; an owner reaches it through them, at a cost
  - his squad rule: 회복 when the starters' average fatigue is 30 or more; else 하드 when it is under 15 and squad morale is 50 or more, with a developer assistant or three or more starters aged 21 or under (two under 데뷔 시점 빠른 데뷔 →CLUB-32); else 균형; the 훈련 tab (→WEB-70) states the focus in force, who set it and why.
  - his player rule: 회복 for a player whose fatigue is 40 or more; he sets no other exception himself.

- CLUB-14 [o] The market supports position, line and roster-fit filters with stable seeded candidates. Each candidate shows OVR, potential, positions with levels, traits (personality as the chief scout's range →PLAYER-18), his 실효 OVR at the slot he would take on arrival and once settled (→PLAYER-11), effect on the proposed XI/tactic fit, upfront transfer or loan fee, recurring annual wage and contract term before acceptance.
  - the list is drawn per season and per the settings that shape it (recruitment level →ECON-16, chief scout →STAFF-11, the 단장's negotiation →STAFF-20, strategy cards →ECON-22): the same settings always show the same candidates, so switching a setting away and back draws nothing new. ← a setting must not become a free reroll
  - one ID names one player: lists of different settings never share a candidate ID.
  - a bid concerns the player it was made for, on the terms it was made for, until it is answered or lapses (→CLUB-18), whatever the list shows meanwhile.

- CLUB-15 [o] Recruitment previews distinguish automatic starter selection from optional manual-lineup replacement, never promise a win or guaranteed selection, and show post-fee cash and wage-inclusive fixed-cost runway excluding future revenue. Disable unaffordable/full/already-signed offers; free transfers still disclose wages.

- CLUB-16 [o] The youth academy keeps prospects outside the first team in three age groups by their age in the season: U-17 (15–16), U-19 (17–18) and U-21 (19–20). Each season on 15 March 3–5 prospects aged 15–16 join U-17 (more with a strong youth director or academy facilities); they grow every settled round toward potential, faster the younger they are, can be promoted while the first team has room, or released; one who turns 21 unpromoted leaves at the season's close. ← real academies register boys from U-9, but a club's decisions start when he joins its U-16/U-17 group: groundstaff at 15 before 1972, scholars at 16 since
  - prospects carry the player model (→PLAYER-1); academy growth spreads over a prospect's attributes by his main position's weights (→PLAYER-15).
  - younger age groups are not tracked as players: academy investment (→ECON-16), the youth director and the academy facilities (→ECON-32) stand for them through the intake's size and potential.
  - growth per settled round: min(0.3, gap to potential / 150) × the youth director, academy facilities, academy investment, build and synergy factors × the age group's (U-17 ×1.2, U-19 ×1.0, U-21 ×0.8) × the youth focus (→CLUB-31).
  - promotion signs a first professional contract, from 16 (17 in England); a prospect must still be ready to be promoted by the staff (→STAFF-13), so debuts at 16–17 stay rare in strong divisions and commoner in weak ones. ← measured: about 0.3 under-18 debutants per big-five club a season, 2009–2023 (CIES); weaker leagues field more debutants
  - academy investment and 풀뿌리 유망주 투자 (→ECON-16), the bases with the 성골 유스 or 해외 유스 스카우트 card (→ECON-34), the club build (→ECON-22) and the pipeline synergy (→CLUB-21) add prospects, potential and growth.
  - the 방향 board (→WEB-60) shows the exact chance that the next intake brings a prospect of potential 80+, from the same uniform draws the intake uses.
- CLUB-17 [o] Fee-bearing purchases, loans and sales happen only in transfer windows: summer from the day the season closes (→LEAGUE-9) to 1 September and winter 1 January–1 February. ← the market opens as the season's review ends, not during its final rounds Free agents sign at any time. The market shows the window state and deadline.
- CLUB-18 [o] Bids are answered 2–4 days later with accept, reject or a counter; acceptance chance rises with the offered fee against the asking value and the 단장 (→STAFF-20).
  - The fee is paid on completion; unanswered bids lapse at the deadline.
  - During windows other clubs bid for our players (answered by the owner, or by the director when player sales are delegated) and lapse after 5 days; squad minimums still apply.
  - The bidder is a real club whose strength suits the player (4 below to 12 above his ability, stronger clubs more often, any country).
  - A delegated 단장 accepts an offer at or above his sale bar for a non-starter, or for a starter aged 30+ with a bench player of the same role within 3 ability (never a starter under 핵심 지키기).
  - The report names the bar and each step.
  - another club's offer is at least one whole currency unit, so no offer reads 0 (→WEB-67).
  - bar by the 매각 기조 card (→ECON-22), of value and for a prospect (aged 22 or under with potential at least 8 above ability): 셀링 클럽 110%/160%, 쇼케이스 120%/180%, standard 130%/200%, 강경 협상 150%/230%, 핵심 지키기 150%/250%
  - age 30–32 −15 points, 33+ −30; contract in its final season −20, one season after this −10
  - fixed-cost runway under the first 재정 기조 step (→ECON-33; 13 rounds at 표준) −20, under the second (30 rounds at 표준) −10; never below 80%

- CLUB-19 [o] Squad morale (0–100, new clubs 60) moves +6/+1/−6 after own wins/draws/defeats (±2 more for a two-goal margin; a motivator manager takes 2 off a defeat), drifts 15% per settled round toward a baseline of 58 + 4 per squad-investment level above standard + (manager trust − 50)/10 + the manager style, build and synergy terms + 1 for each 리더 in the last starting XI (at most 3, →PLAYER-9), within 30–80, falls 2 more per round while starters average fatigue ≥ 40, 1 more in each settled round from the squad's third 하드 round in a row (→CLUB-11), and 1 more in each settled round for each overdue owner approval, at most 3 (→STAFF-48). Match strength adds (morale − 60)/10; older saves without morale stay exactly unchanged.

- CLUB-20 [o] The owner does not run the dressing room: morale and fitness actions are requests to the manager or the staff, made once per cooldown (settled rounds since the last use). Every request exposes a concrete disadvantage as well as its possible gain: an expense/obligation, fatigue, morale/trust loss, or a real backfire outcome. Requests that depend on people can work, do little or backfire; every chance is stated before the request and drawn from the world's own stream for that request and round. ← a chairman paying random bonuses or treating the squad himself is not how football clubs work
  | request | by | cost (1901 units) | outcomes | cooldown |
  |---|---|---|---|---|
  | squad meeting | manager | free | works: morale +7 · nothing much: +2 · backfires: −3 and trust −2; works 0.5 + 0.2 for a motivator + (trust − 50)/200 + 0.1 when morale < 45 (0.2–0.9) | 4 |
  | team-building day | staff | 15 | morale +5 (75%) or +2 | 3 |
  | win bonus for the next 5 matches | owner | 8 per win, owed even when cash is short | morale +3 now, +2 after each win | 8 |
  | owner's dressing-room visit | owner | free | morale +4 (35%) / +1 (30%) / −3 and trust −3 (35%): an owner addressing the squad tends to undermine the manager | 4 |
  | public vote of confidence | owner | free | trust +8, morale −2 as discontented players see the manager protected; not while trust ≥ 85 or for an interim | 10 |
  | short training camp | staff | 60 | morale +5, every active player fatigue −8 | 12 |
  | rest days | manager | free | every active player fatigue −6, morale −2 from losing shared preparation | 4 |
  | recovery support | staff | 30 | every active player fatigue −10 | 2 |
  | friendly match | operations | income 12 + supporters/600 (max 60) | every active player fatigue +8 | 4 |
  - insufficient cash fails cleanly; older saves without morale start from 60 when a request changes it; no request touches past matches.
- CLUB-21 [o] Build synergies light up when the manager, staff, club choices and squad point the same way; each lists its conditions with what is met, and its bonus applies only while all are met. ← builds should be readable as combinations, like cards that work together
  | synergy | conditions | bonus |
  |---|---|---|
  | 게겐프레스 엔진 | gegenpress manager or press tactic · fitness coach 65+ or recovery trait · starters' 체력 60+ | fatigue −2 per match · opponent build-up pass success −1 point |
  | 점유의 미학 | positional manager or possession tactic · assistant 65+ or specialist · starting midfielders' 패스 62+ | pass +1, possession +1 point |
  | 철의 장막 | organizer or counter manager · defence coach 65+ or specialist · starting defenders' 태클 and 위치선정 62+ on average | opponent chances −1 point |
  | 유스 파이프라인 | academy investment 3+ · youth director developer or 70+ · developer manager or youth trait | academy growth ×1.15, intake potential +3 |
  | 머니볼 | 데이터 스카우팅 card · a spotter chief scout or a negotiator 단장 · recruitment level ≤ 2 | candidate potential +3, fees ×0.92 |
  | 상업 제국 | 상업 확장 revenue card · 해외 마케팅 4+ · a stadium of 30,000+ | new sponsor offers ×1.1 |
  | 원 팀 | motivator manager · squad investment 4+ · morale 65+ | morale baseline +3 |
  | 우리 동네 아이들 | 성골 유스 or 유소년 클럽 제휴 · 지역 밀착 · 가족 같은 클럽 | morale baseline +2, intake potential +2 |
  | 트레이딩 머신 | 데이터 스카우팅 · 데뷔 시점 빠른 데뷔 · 셀링 클럽 or 쇼케이스 | candidate potential +2, academy growth ×1.1 |
  | 글로벌 스카우팅 | 해외 유스 스카우트 card · 해외 스카우트망 3+ · chief scout spotter or 65+ | intake potential +2, candidate potential +2 |

- CLUB-22 [o] Every player has a transfer stance the owner switches any time; offers come only while a window is open and only from real clubs (→CLUB-18), and a sale happens only when one is accepted. ← one tap says how the club treats offers for him, instead of an asking price per listing
  - 이적 명단 (listed, 적극 매도): draws its own offers at 10% a window day × appeal, fee 85–105% of value × build sale fee; delegated staff accept them
  - 협상 가능 (open, default): only unsolicited bids; delegated staff apply the sale bar (→CLUB-18)
  - 이적 불가 (untouchable): any bid below 150% of value is refused unseen, whoever decides; from 150% the owner is asked, or with player sales delegated the staff and manager decide (→CLUB-24)
  - loaned players and announced retirements have no stance; a retirement announcement clears it
  - a 1.9 listing at an ask loads as listed
  - appeal is 0.6 + (ability − 35)/60, +0.25 aged ≤ 23, −0.2 aged 31+, within 0.35–1.5; the stance sheet shows the average days to a first offer.
  - each listed player has at most one open offer; listed players are not targets of unsolicited bids.
  - with player sales delegated (→WEB-45) the 단장 (→STAFF-20) sets stances at each window opening, by the direction, only for players at 협상 가능: 셀링 클럽 lists non-starters aged 30+, 판매용 육성 (→CLUB-32) lists non-starters aged 21 or under, and 핵심 지키기 marks the three best starters 이적 불가; each change is reported, and the owner may switch any stance back.

- CLUB-23 [o] Players are injured during a match (→MATCH-21): over a full match each player on the pitch has 1.8% × (1 + excess fatigue/25) × (1 + max(0, 55 − 체력)/150) × 1.15 when pressing, in proportion to his minutes, striking at a moment of play from the match's own stream (about one injury a side every five matches); players of clubs nobody owns follow the same rule (→LEAGUE-15).
  - training: each settled round a player training under 하드 (→CLUB-11) has 0.5% × (1 + excess fatigue/25) of an injury, from that round's own stream, drawn from the table below.
  | share | days out | examples |
  |---|---|---|
  | 60% | 5–14 | 근육 타박상, 가벼운 발목 염좌 |
  | 25% | 15–35 | 햄스트링, 종아리 |
  | 12% | 36–90 | 발목 인대, 중족골 골절 |
  | 3% | 120–240 | 전방 십자인대 파열, 아킬레스건 |
  - injured players are left out of the automatic and saved XI while eleven fit players exist; the medical report is an inbox item and an event; healed injuries clear.
- CLUB-24 [o] With player sales delegated, a bid of 150%+ for an untouchable player is decided by the staff with the manager: the build's market card sets the price (셀링 클럽 150%, 쇼케이스 175%, standard 200%, 강경 협상 225%, 핵심 지키기 never), a runway under the second 재정 기조 step (→ECON-33; 30 rounds at 표준) lowers it 25 points, a starter without a bench player who plays his slot within 3 of his 실효 OVR there raises it 25, and a runway under its first step (13 rounds at 표준) sells. The report states the price and each step. ← the owner's club identity and cash, not a fixed number, decide when a star is let go

- CLUB-25 [o] Every player has a market wage from his OVR (→PLAYER-6), age and potential, his club's division and the football index (→ECON-26); it rises steeply with OVR, so a star earns many times a squad player. ← players are paid what the market says they are worth
  - targets, calibrated with →ECON-29: in a top flight a player rated 80 earns 6–10× one rated 60; a second-tier squad earns 35–50% of a top-flight squad of the same ability. Measured 261013: 7.4× and 40%.
  - transfer values follow the same index, with their own slope and the era's transfer premium (→CLUB-46).
- CLUB-26 [o] Players negotiate contracts when a transfer window opens (summer as the season starts, winter on 1 January, →CLUB-17): one in the final season of his contract asks to renew, and one with at most three seasons left, this one included, who is paid 25% or more below his market wage asks for an improved contract, at most once a season. He names a demand (market wage × the build's player-wage effects →ECON-22 × his agent's premium →CLUB-30) and accepts any offer at or above his floor, demand × (1 − goodwill). ← a player is paid what he is worth when his contract comes up, as in real football, and how a club treats its players decides what he settles for
  - goodwill: squad investment (→ECON-16) −5/0/+5/+10/+15%; the 라커룸 문화 card: 가족 같은 클럽 +5, 스타 대우 +10 for players rated 70+, 철저한 경쟁 −5; 긴축 재정 −5; (morale − 60)/4 %; within −10 to +30%.
  - the owner offers the floor or more with a term, or declines; the talk shows demand, floor, the contract's clauses (→CLUB-29), yearly cost and runway before the choice (→WEB-68).
  - delegated (→STAFF-13): the 단장 (→STAFF-20) offers the floor for 2 seasons past this one (1 from age 32), never ending before the running contract, when 재계약 기조 keeps the player at that floor and 재정 기조 allows the raise (→ECON-33): cash after it keeps the runway, the wage bill after it stays at or below the ceiling of the club's revenue over the last 12 months, and the season's cash projection with it still ends the season keeping the runway; otherwise he declines and says why (→CLUB-27). ← the cash checks alone let a promoted club's staff agree raises its income could not carry
  - revenue over the last 12 months: this season's turnover so far (competition, matchday and commercial income; player trading and owner capital excluded, →ECON-30) plus last season's for the league rounds not yet played; a club without a completed season counts its season so far at its pace over a whole season.
  - 재계약 기조, whose area is defined in →ECON-25, says whom the staff keep and how far they go:
    | option | keeps | floor at most |
    |---|---|---|
    | 표준 (default) | everyone | 110% of his market wage |
    | 모두 붙잡기 | everyone | 140% |
    | 핵심만 붙잡기 | the starting XI as home shows it (→WEB-58); the rest are declined | 140% |
    | 짠물 | everyone | 100% |
    | 젊은 선수 우선 | players under 30 | 110% |
  - terms: a contract signed in the summer window runs 1–5 seasons, this one included; one signed in the winter window runs the rest of this season and 0–4 more (½ to 4½ years); every contract ends at a season's close (→CLUB-28). A talk answered after its opening, or an unhappy player's floor met later, takes the summer terms before 1 January and the winter terms from it.
  - an agreed wage is fixed for its term apart from its clauses (→CLUB-29); new terms run from the agreement and are never backdated; no player asks outside a window opening, and no contract renews itself.
- CLUB-27 [o] A declined player becomes unhappy (언해피) unless the manager talks him round. Unhappy, he plays 3 below his ability, costs squad morale 1 each settled round he starts, refuses to renew, and after 6 weeks hands in a transfer request: his stance becomes 이적 명단 and cannot be set to 이적 불가 (→CLUB-22). Meeting his floor later, or his sale, ends it. ← refusing a player what he is worth has a price, as in real football
  - talking him round: 15% + 45% for a motivator (동기부여형, →STAFF-14) + (trust − 50)/200 + (flexibility − 50)/400, within 5–85%, from the player's own stream for that talk; the outcome is an inbox item.
  - a declined offer from a bigger club (a higher division, or the same division and a higher reputation) of at least his value — declined by the owner, by the 단장 or unseen by his stance — makes a player of 야망 높음 unhappy with 25% and of 매우 높음 with 50% (→PLAYER-7), from his own stream for that offer, unless the manager talks him round as above; this unhappiness ends with his sale or at the next season's close. ← an ambitious player wants the bigger stage
  - the squad shows an 언해피 badge with its reason (→WEB-68).
- CLUB-28 [o] A player whose contract ends unrenewed leaves at the close: from 1996 on a free transfer; before, the club he joins pays compensation of 50% of his value. A retirement announcement (→CLUB-3) needs no renewal. ← the 1995 Bosman ruling changed what an expiring contract was worth
- CLUB-29 [o] Every player contract carries its own clauses, settled when it is signed (renewal, improved contract, transfer, free agent, academy promotion, the founding squad and the players who refill a squad at the close) from the player's stream for that signing and tilted by his agent (→CLUB-30): a promotion clause raises the wage from the first round after the club goes up, a relegation clause cuts it from the first round after it goes down. ← real contracts differ: some players secured a promotion rise and others none, and relegation cuts of 25–50% were common
  | clause | in contracts | size |
  |---|---|---|
  | promotion rise | 30% with a 1-rated agent to 80% with a 5-rated | +10% to +60% of the wage, larger with a stronger agent |
  | relegation cut | 80% with a 1-rated agent to 40% with a 5-rated | −25% to −50% of the wage, smaller with a stronger agent |
  - the shares and sizes are calibrated with the economy (→ECON-29) within these ranges; a clause applies once per move and changes nothing else in the contract.
  - the contract talk (→WEB-68) and the player sheet show his clauses.
- CLUB-30 [o] Every player has an agent rated 1–5, set when the player is created and never changing; better players more often have stronger agents. A stronger agent raises his client's demand by 1% per level above 1 (→CLUB-26) and tilts his contract clauses his way (→CLUB-29); the player sheet and the contract talk show the rating. Agent fees and agents steering transfers are not modelled. ← how well a player is represented decides his terms as much as his ability
  - the premium stays small so 재계약 기조 표준's 110% cap still renews a delegated squad at its market wage (measured 261013: 3% a level left ECON-29's wage bill at 43% of revenue, below its band).
- CLUB-31 [o] The youth director sets the academy's training focus each settled round by his rule, unless a suggestion he accepted or an order the owner forced holds that round (→STAFF-19). ← each age group needs different work: fundamentals early, first-team readiness late
  | focus | U-17 | U-19 | U-21 |
  |---|---|---|---|
  | 균형 | ×1.0 | ×1.0 | ×1.0 |
  | 기본기 집중 | ×1.3 | ×0.9 | ×0.9 |
  | 1군 준비 | ×0.9 | ×1.15 | ×1.25 |
  - his rule: 1군 준비 when a U-19 or U-21 prospect is within 5 OVR of being ready (→STAFF-13; within 10 under 데뷔 시점 빠른 데뷔, and only U-21 under 늦게 →CLUB-32); else 기본기 집중 when U-17 holds more prospects than U-19 and U-21 together; else 균형.
- CLUB-32 [o] Two rows of the 유소년 area (→ECON-25) say what the academy is for and how early its prospects go up; the delegated youth director promotes, releases and the staff list by them (→STAFF-13, →CLUB-22), and 데뷔 시점 also sets the coaches' focus rules (→CLUB-13, →CLUB-31). ← the owner's idea of his academy, not a fixed rule, decides what becomes of its boys
  | 육성 목표 | the youth director |
  |---|---|
  | 표준 (default) | releases a prospect of 19+ whose potential is below the weakest first-teamer of his line |
  | 1군 공급 | releases nobody before 21: every prospect stays until he is ready or leaves |
  | 판매용 육성 | as 표준; with player sales delegated the staff list non-starters aged 21 or under (→CLUB-22) |
  | 최소 운영 | releases a prospect of 18+ whose potential is below the starters' level of his line |
  | 데뷔 시점 | ready to be promoted (from the promotion age →CLUB-16) | also |
  |---|---|---|
  | 표준 (default) | at the weakest first-teamer of his line, or its starters' level minus 10 | - |
  | 빠른 데뷔 | at the weakest first-teamer minus 3, or the starters' level minus 15 | growth of players ≤ 21 ×1.2, morale baseline −1 |
  | 준비된 뒤 | at the starters' level of his line | - |
  | 늦게 | as 표준, but not before 19 | U-21 growth ×1.15 |

- CLUB-33 [o] Signings run through three people: the chief scout keeps a shortlist all season, the manager asks for lines and slots and names his pick from it, and whoever holds player recruitment decides — the owner, or with recruitment delegated (→STAFF-13) the 단장 (→STAFF-20) within 재정 기조 (→ECON-33); the owner's own bids are never the 단장's to answer. ← the list is ready before a window opens, and a manager's wishes cost something when nobody meets them
  - shortlist (스카우트 명단): on a season's first day, on each window's opening day and after every 4th league round, the chief scout lists up to three candidates per line (→PLAYER-3) from the market as 영입's rows shape it (→CLUB-14): free agents first, then by ability, potential and id. A listed player who joins us or leaves the market list drops off; 사람's 이적시장 shows the list, the day it was drawn and the next draw (→WEB-43).
  - requests (감독 요청), drawn with the shortlist: every short line (fewer than 2 GK, 6 DF, 6 MF or 4 FW, or under 20 players →CLUB-40), then the slot of his formation (→STAFF-22) whose starter a shortlisted candidate who plays its position at 준수 or better beats by the most at that slot (OVR there × level, adaptation left out), when by 5 or more; at most three. For each the manager names a pick among the shortlisted who fit it: the ablest, then potential; a 육성형 manager (→STAFF-14) or one with the youth trait (→STAFF-12) the highest potential among those aged 23 or under first. An interim asks for nothing.
  - at a window's close, a manager whose requests at its opening saw no player join in the window who fits one (of the short line, or playing the requested slot's position at 준수 or better) loses 3 trust (→STAFF-5), whoever held recruitment; a met request gains nothing.
  - the close is judged the day after the window's last day, so a deadline-day signing counts; a loan joining counts as joining; a manager appointed after the opening is not judged on his predecessor's requests; a club's founding day is its first summer window's opening.
  - with player recruitment delegated the 단장 looks on the window's opening day and every 7th day after it, and every day while a replacement need is open (→CLUB-42); a look makes at most one move, and none while one of his bids is pending.
  - needs, first met first: a short line, then a replacement (→CLUB-42), then an upgrade: a candidate who beats a slot's starter at that slot (as a request does) by the margin of 재정 기조 (표준 5, 적극 3, 공격적 2), while the squad has 24 players or fewer; 안정적 and 신중 never upgrade. Requests come before the others.
  - upgrades per window: 표준 1, 적극 2, 공격적 3; a short line has no cap.
  - the candidate who fits the need: the manager's pick, then the rest of the shortlist, then the market list; free agents before fee-bearing players, each by ability, then potential; never a player he bid for in this window before (a negotiator's raised bid excepted, →CLUB-41), never on loan.
  - for a request with an actual mediation decision, its support outcome in →CLUB-39 governs whether to defer or prioritize a qualifying alternative/the manager's pick. Ordinary recruitment timing, suitability, limits and money checks still apply.
  - he signs a free agent at once and bids for anyone else as his trait bids (→CLUB-41).
  - money: the fee is at most the 재정 기조 share of the cash above its runway, and with his wage the runway, the wage bill ceiling and the season's cash projection still hold, as for a raise (→ECON-33).
  - each move and each answer reaches the inbox as a 단장 report naming the need, the manager's request when it is one, the row behind it and the money check.

- CLUB-34 [o] Actual financial opposition by the director to an unmet manager reinforcement request produces a mediation event under →CLUB-38, with each person's actual explanation.
  - mediation belongs to player recruitment (→WEB-45): owner-held recruitment waits in the 결재함 for mediation without stopping either progression mode (→STAFF-48); delegated recruitment resolves it under →STAFF-26 and reports the result.
  - the owner can support the director, support the manager or use the standing balanced approach, and may make a recorded reinforcement promise (→CLUB-35).
  - a missed first-choice pick does not by itself prove a conflict; distinguish budget restrictions, failed bids, unavailable candidates and the owner's own decision. Current window-request evaluation remains →CLUB-33; mediation's interaction with it is →CLUB-36.

- CLUB-35 [o] A next-window reinforcement promise is a retained commitment with its player-position/role target, deadline and fulfilment result, linked to the mediation and relevant people.
  - judge whether the promised recruitment occurred by its deadline; keeping or breaking it changes the manager's response according to the rules specified under →CLUB-37.
  - dismissing an event, a menu detour or saving/reloading never silently clears the commitment. Record the promise and its resolution in →HIST-15.
  - a post-window free signing cannot silently rewrite the completed window's request evaluation; it can meet an outstanding promise within that promise's own interval (→CLUB-37). Numerical reactions are →CLUB-36.

- CLUB-36 [o] Mediation choices and promise creation, fulfilment, non-fulfilment or cancellation add zero numerical trust change.
  - retain →CLUB-33's existing window-request evaluation unchanged: when none of the opening requests was met by a qualifying arrival, the requesting manager loses 3 trust once for that window; a met request gains none. Do not add a per-promise penalty or defer/waive this evaluation because a promise exists.
  - show distinct factual manager reactions and retained outcomes for a kept, unfulfilled or cancelled promise (→CLUB-37, →HIST-15), without additional morale, trust or relationship bonuses/penalties. A later arrival never retroactively changes the completed window evaluation.

- CLUB-37 [o] A reinforcement promise targets the original request's position/slot or short line, not a mandatory named player, and has a fixed deadline at the end of the next transfer window after the one in which it was made (→CLUB-17).
  - retain the target and absolute deadline at creation. From the promise date through that deadline inclusive, one actual external arrival fitting the target under →CLUB-33's request-fit criteria meets it; permanent recruitment, an incoming loan or a free-agent signing can qualify. A bid, preliminary agreement, existing squad member or academy promotion is not an external arrival.
  - judge the promise on the day after the deadline so deadline-day arrivals count. Fulfilment uses retained actual arrival facts; a qualifying alternative can meet it without the original named pick. Arrival before the next window can qualify, including a free agent, but never rewrites an earlier window's settled request evaluation (→CLUB-36).
  - if the requesting manager leaves while the promise is outstanding, resolve it as cancelled and retain the reason; never transfer its judgement to his successor. A director change alone keeps the promise, target and deadline in force.
  - an outstanding promise for the same manager and target cannot be duplicated or have its deadline moved by making it again. A refreshed shortlist, support-policy change, menu action or reload does not reset it.
  | final status | condition and manager reaction |
  |---|---|
  | fulfilled | a qualifying arrival occurred in the interval; acknowledge that the promised reinforcement arrived |
  | unfulfilled | no qualifying arrival by the deadline; acknowledge the missed commitment and recorded cause, including lack of funds or suitable candidates |
  | cancelled | the requesting manager departed before resolution; record departure as the cancellation reason, separately from success or failure |
  - lack of funds or suitable candidates does not automatically cancel or extend the promise. A promise neither creates money nor bypasses recruitment constraints (→CLUB-39). Keep its final result available; numerical effects are →CLUB-36.

- CLUB-38 [o] During an open transfer window, mediation requires a manager request with a suitable available candidate, actual director opposition because existing financial criteria block the recruitment, and no qualifying arrival yet meeting that request (→CLUB-33).
  - emit at most once for the same manager, reinforcement request and transfer window. Retain that fact across daily checks, shortlist refreshes, screen changes and reloads; a different candidate for the same request does not renew the allowance.
  - a failed negotiation, no available suitable candidate or an owner refusal alone produces an ordinary factual report, not a financial-conflict mediation. The report must state the actual cause (→STAFF-8).
  - ownership and waiting behaviour remain →CLUB-34: recruitment direct waits in the 결재함 in either mode; recruitment delegated resolves/reports under →CLUB-39.

- CLUB-39 [o] Delegated mediation follows the standing support policy (→STAFF-26); direct mediation can choose another outcome for that case (→CLUB-34).
  | support policy | resolution of the disputed request |
  |---|---|
  | 단장 우선 | defer the opposed reinforcement without making a next-window promise |
  | 균형 | first seek a cheaper alternative meeting the existing reinforcement criteria; if none is available within those criteria, make a next-window reinforcement promise |
  | 감독 우선 | first pursue the manager's named player; if that cannot proceed, make a next-window reinforcement promise |
  - no support outcome authorizes delegated spending beyond the existing financial checks (→CLUB-33, →ECON-33), creates funding or guarantees a signing. Prioritizing a player still follows ordinary availability, bidding and contract rules.
  - promises retain their actual target and deadline (→CLUB-35); fulfilment, duplicate-commitment and cancellation rules are →CLUB-37. A support choice does not itself count as a fulfilled recruitment request.

- CLUB-40 [o] A first team aims at 20 players: the founding squad (→CLUB-1), the close's top-up (→CLUB-3), the 단장's short squad (→CLUB-33), replacements (→CLUB-42) and window-close call-ups (→CLUB-43) count to it; sales still stop only at →CLUB-5's minimum. ← real clubs start a season with 20 or more and cover gaps from their academy, so a thin squad lasts a window, not a season
- CLUB-41 [o] The 단장 bids by his trait (→STAFF-20) whenever he bids for a player, whatever the need. ← some directors haggle for weeks to save money, others pay over the odds to finish fast
  | 단장 | first bid, of the asking fee | refused | countered |
  |---|---|---|---|
  | 협상가 | 80% | 5 points more the day after the answer, up to 100%; refused at 100% → the next candidate | declines; 5 points more the next day, up to 100% |
  | no trait | 100% | the next candidate | accepts when it passes the money checks, else the next candidate |
  | 속전속결 | 110% | the next candidate | accepts when it passes the money checks, else the next candidate |
  - in a window's last 7 days a negotiator bids at least 100% and answers a counter as the others do. ← the deadline ends haggling
  - 재정 기조 공격적 adds 10 points to every bid; every bid and every acceptance passes →CLUB-33's money checks; the asking fee is the one he faces, a negotiator's ×0.9 included (→STAFF-20), and bids are answered as →CLUB-18.
- CLUB-42 [o] A departure opens a replacement need for the leaving player's line (→PLAYER-3) when he was in the starting XI as home shows it (→WEB-58) or the squad is under 20 after it (→CLUB-40), whoever decided it. ← a club that loses a starter or thins its squad buys again in the same window
  - departures: a sale (→CLUB-22), and at the close a contract run out (→CLUB-28) or a retirement (→CLUB-3); the close's top-up comes first, so after the close only a departed starter opens a need.
  - with player recruitment delegated the 단장 looks the day after it opens and every day after while it is open (→CLUB-33); candidates of the line come in →CLUB-33's order, and one the money checks rule out is passed over for the next, cheaper one.
  - a need comes after short lines and before upgrades, has no upgrade cap, and closes when a player of its line joins (a loan counts) or its window closes (→CLUB-43).
  - with recruitment held by the owner, the departure's report names the open need and the owner buys.
- CLUB-43 [o] At a window's close, judged the day after its last day (→CLUB-33), each replacement need still open and then each player the squad lacks below 20 is called up from the academy. ← an academy, not an empty bench, covers a failed window
  - with academy promotion delegated the youth director (→STAFF-13) calls up the ablest prospect of the need's line from the promotion age (→CLUB-16), else the ablest prospect of any line, else a generated 18-year-old as at the close (→CLUB-3); for a player the squad lacks, the line the formation lacks most.
  - a call-up ignores 데뷔 시점 readiness (→CLUB-32) and the promotion cash floor (→ECON-33), signs the first professional contract a promotion signs, and is reported.
  - with academy promotion held by the owner, the youth director's report recommends the same prospects and the owner promotes; no generated player joins before the close's top-up.
  - never above the registration limit (→CLUB-44).

- CLUB-44 [o] A club holds no more players than the registration rule of its league in that season allows, by country, division and year as the real leagues set them; where a league had no rule, the game's own ceiling of 40 players applies. ← real caps are recent (England's top flight from 2010) and some leagues never had one, so one fixed number fits no era
  | country | division | seasons | counted players at most | not counted |
  |---|---|---|---|---|
  | ENG | top flight | 2010– | 25 | aged 21 or under |
  | ENG | second | 2020– | 25 | aged 21 or under, except loan players |
  | ENG | third, fourth | 2020– | 22 | aged 21 or under; goalkeepers |
  | ESP | first, second | 2000– (start estimated) | 25 | academy graduates aged 22 or under |
  | ITA | top flight | 2015–2018 | 25 | aged 21 or under |
  | ITA | top flight | 2019– (switch estimated) | 25 | aged 22 or under |
  | ITA | second | 2013–2016 (estimated) | 22 | aged 21 or under |
  | ITA | second | 2017– | 18, plus 2 who have been at the club 4+ seasons | aged 21 or under |
  | ITA | third | 2020– (estimated) | 24 | - |
  | POR | first, second | 2013–2017 (estimated) | 27 | aged 22 or under |
  | POR | first, second | 2018– (switch estimated) | 30 | aged 22 or under |
  | BEL | first, second | 2012– (start estimated) | 25 | aged 20 or under |
  | GER, FRA, NED; any other league before its first row | every division, the amateur league | every season | 40 in all | - |
  - ages are by the season's start year: "aged 21 or under" is born in that year − 21 or later.
  - the 40-player ceiling counts everyone, exempt players included, under every rule. ← about the most a club carried with its reserves: some 30 professionals at an English club in the 1950s, about 35 players at a Ligue 1 club in 2022
  - the rule of the division the club plays in this season applies; a club over it (after a promotion, a new season's rule, or players ageing into the count) keeps its players and adds no counted player — no signing, loan, promotion or call-up — until it is under it.
  - the catalog keeps every row with its source, and a start or switch marked estimated shows as estimated (→ECON-3).
  - every squad count on screen shows counted players against the limit, and exempt players beside it.

- CLUB-45 [o] A suspended player (→MATCH-19) is unavailable for the matches his ban counts: left out of the automatic and saved XI and the bench, like an injured player. A ban is an inbox item and an event; a player one yellow short of a league ban carries a warning on the squad and lineup.

- CLUB-46 [o] A transfer value (→CLUB-25) follows its era's transfer market, not the wage curve alone: the year's transfer premium, on top of the football index (→ECON-26), reaches a value in proportion to how far its market points stand above the wage curve's pivot (70), in full from 10 points above it, so the stars' fees stand where real English football's stood in every era while a lower-division player's fee grows with football's income alone. ← fees grew with football's income until the late 1970s and far faster since at the top (British record £165,000 in 1969, £1.5m in 1979, £15m in 1996, £125m in 2025) but hardly in the lower divisions; on the wage curve and the index alone reference careers valued the top flight's dearest player at about a third of the record in the 1980s and at 0.14–0.24 of it from the late 1990s
  - the premium is a multiple by year, geometric between these anchors, flat before the first and after the last; every country uses it, its own football index and currency carrying the rest:
    | year | 1950 | 1957 | 1967 | 1977 | 1979 | 1993 | 1996 | 2008 | 2013 | 2025 |
    |---|---|---|---|---|---|---|---|---|---|---|
    | premium | 0.5 | 0.75 | 0.85 | 1.2 | 1.8 | 2 | 3.2 | 3.2 | 3.9 | 5.2 |
  - the steps follow the real market: the maximum wage's 1950s, the first £1m fees of 1979, the 1980s' stagnation, Bosman and pay-television from 1995–96, the broadcasting boom from 2009.
  - a better player is always dearer: no premium falls so low that its reach outweighs a point's wage step (at least 0.37 for a 10-point reach).
  - targets (ENG, every top-flight player's value each summer): the dearest at 0.5–1.0× the British record fee standing that year, since sales run up to 160% of value (→CLUB-22); the mean at 0.6–1.4× the Premier League's average fee where one is published (Transfer Price Index, free transfers excluded: £594,000 in 1992/93, £2.4m in 2002/03, £5.6m in 2013/14, £24m in 2025). Sources: the progression of the British transfer fee record; Tomkins Times' Transfer Price Index.
  - measured 261031 (scripts/calibrate-transfers.ts, ENG reference careers 1950–2029, summers within 2 years of the year; before = the same careers on the wage curve and the index alone, after = 8 careers, 4 of them seeds the anchors were not fitted on; the 4 unseen alone keep 13 of 15 years in band, 1993's mean 1.40 and 2025's dearest 1.01 just outside):
    | year | dearest / record, before → after | mean / average fee, before → after | after, unseen careers |
    |---|---|---|---|
    | 1952 | 1.58 → 0.86 | - | £29k |
    | 1957 | 0.99 → 0.78 | - | £53k |
    | 1962 | 0.73 → 0.59 | - | £67k |
    | 1967 | 0.93 → 0.84 | - | £96k |
    | 1972 | 0.65 → 0.70 | - | £166k |
    | 1977 | 0.61 → 0.80 | - | £429k |
    | 1982 | 0.39 → 0.76 | - | £1.19m |
    | 1987 | 0.32 → 0.64 | - | £2.12m |
    | 1993 | 0.35 → 0.81 | 0.71 → 1.34 | £4.89m, mean £832k |
    | 1997 | 0.21 → 0.74 | - | £11.7m |
    | 2003 | 0.21 → 0.69 | 0.49 → 1.33 | £20.3m, mean £3.29m |
    | 2008 | 0.24 → 0.86 | - | £30.3m |
    | 2013 | 0.14 → 0.56 | 0.43 → 1.28 | £46.7m, mean £7.23m |
    | 2018 | 0.15 → 0.59 | - | £62.1m |
    | 2025 | 0.17 → 0.93 | 0.19 → 0.74 | £126.5m, mean £19.0m |
  - the reference club's own fees, measured beside (the unseen careers): its dearest sale £1.2m in the 1980s, £57m in the 2000s and £130m in the 2020s; sales 7–14% of its turnover from the 1960s (2% in the 2010s–2020s before); 1950s lower-division fees as before (second-tier buys about £800, sales £200).
  - ECON-29 on ENG ESP FRA GER (default build, reference club, 60 seasons), before → after: operating result before player trading 8.1% → 5.0%, player sales 7.6% → 11.7% of revenue, net result with trading 15.7% → 16.8%, facility ladder 39.2 → 41.3 seasons, none bankrupt; CLUB-25's wages unchanged (80 earns 7.37× 60, the second tier 40%).

- CLUB-47 [o] Every market candidate not ours carries the scout's verdict (스카우트 판정): a grade A–E read against our current XI with the measures of the shortlist and the manager's requests (→!CLUB-33), and its reasons. ← the owner reads one answer before the detail, and it agrees with what the manager and the 단장 act on
  - the gap: at the slot he would take (→!CLUB-14), his OVR there × level minus that slot's starter's, adaptation left out, as a request measures it; both values are rounded first, so the gap is the difference the owner reads.
  - the first row that holds decides:
    | grade | label | when |
    |---|---|---|
    | A | 즉시 주전 | gap ≥ 10, twice the request margin |
    | B | 주전 보강 | gap ≥ 5, the request margin: the manager would ask for him |
    | C | 경쟁 보강 | gap ≥ 2 (공격적's upgrade margin, the smallest the 단장 acts on), his line is short (→CLUB-33), or he is 23 or under, the slot is his main position and his potential is at least 5 above the starter's value there |
    | D | 백업 | gap above −5 |
    | E | 보강 효과 없음 | otherwise |
  - the verdict names its slot, his value there and the starter's; its reasons add what the gap does not say, each a fact of the current world, at most two for and two against, in this order:
    - for: the manager's pick for an open request · he meets an open request · his line is short · growth room (potential − OVR) of 5 or more at 23 or under · a free agent, no fee · tactical fit up (→CLUB-14)
    - against: on arrival 3 or more below settled (→PLAYER-11) · 29 or older, pace and stamina falling each season (→PLAYER-17) · outside 재정 기조's money check for a signing (→ECON-33), with its reason
  - the verdict reads exact facts (→PLAYER-18) whoever holds the chief scout post, as the shortlist is drawn; it changes nothing in the world and never gates an approach (→WEB-43).

## flow

- Mediation: actual recruitment conflict → direct/automatic handling under recruitment responsibility → support choice and any recorded promise → deadline judgement → retained result.

## chg
- r47 261101 CLUB-47+ the scout's verdict: grade A–E from the slot gap of CLUB-33's request measure (A ≥10, B ≥5, C ≥2 or a short line or a prospect, D >−5, else E) with up to two reasons for and two against
- r46 261101 CLUB-19✎ +1 more morale lost a settled round per overdue owner approval, at most 3 (→STAFF-48); CLUB-34/38✎ owner-held mediation stops either progression mode→waits in the 결재함
- r45 261031 CLUB-46✎ value per ability point 1.125 everywhere→the wage's 1.105, the premium reaching a value by its points above 70 (in full from 80), lower-division values on the wage curve; premium anchors 0.3 (1950)…3.4 (2025)→0.5 (1950)…5.2 (2025), refit on dumped top-flight squads; measured 261031: 0 of 15 compared years outside the bands on 8 careers (10 before)
- r44 261031 CLUB-25✎ transfer values follow the same index→+their own slope and the era's transfer premium; CLUB-46+ transfer values by era: value per ability point 1.105→1.125, a premium over the football index from 0.3 (1950) to 3.4 (2025), targets against the British record fee and the Premier League's average fee
- r43 261029 CLUB-20✎ requests may be unopposed gains→all disclose a real cost/obligation/adverse outcome; backing morale +2→−2, rest-day morale +2→−2; existing paid requests and stochastic chances preserved
- r42 261019 CLUB-6✎ +the manager names the era's substitutes and the set-piece/penalty takers, never injured or suspended players; CLUB-23✎ own players after the match→every player during it, by minutes; CLUB-45+ suspended players unavailable, bans reported
- r41 261016 CLUB-5✎ maximum squad size 26→the league's registration limit; CLUB-43✎ squad maximum→registration limit; CLUB-44+ real registration rules by country, division and year (ENG 25/25/22 from 2010/2020, ESP 25, ITA 25 and Serie B 18+2, POR 27/30, BEL 25, age exemptions) and a 40-player ceiling where none applied
- r40 261016 CLUB-1✎ founding 18→20 players; CLUB-3✎ close top-up to 18 by generated youths→to 20, delegated academy call-ups first; CLUB-33✎ short squad under 18→under 20, +replacement needs before upgrades with daily looks, asking-fee bids (공격적 110%) accepting counters→bids by the 단장's trait; CLUB-40+ squad target 20; CLUB-41+ trait bidding (협상가 80% +5 a day to 100%, none 100%, 속전속결 110%); CLUB-42+ replacement need after a starter's departure or under 20; CLUB-43+ window-close academy call-ups
- r39 261016 CLUB-35/36/37/39✎ promise lifecycle/reactions open→target-fit external arrivals through next-window deadline, next-day judgement, manager departure cancels/director change retains, no duplicate or postponed commitments, zero additional numerical effects and unchanged window trust evaluation
- r38 261016 CLUB-33/34/36✎ broad conflict/open timing and resolution→financial-only mediation with scoped support priority, numerical reactions remain open; CLUB-38/39+ once per manager/request/window, director defers, balanced seeks cheaper fit, manager prioritizes pick, next-window promises without bypassing delegated financial limits
- r37 261016 CLUB-3✎ every announced player retires at the close→accepted playing-coach deferral under STAFF-34; age-41 limit and all retirement chances unchanged
- r36 261016 CLUB-3✎ player retirement only→linked later staff career; CLUB-13/18/22/24/32/33✎ intervention/combined transfers→separate responsibilities; CLUB-34/35+ recruitment-owned mediation and tracked promises; CLUB-36/37+ open mediation and promise-fulfilment/reaction rules
- r35 261015 CLUB-18✎ an offer's fee from value alone (could round below one currency unit)→at least one whole currency unit
- r34 261015 CLUB-1✎ XI at the league average→plus the level's offset (0/−2/−4/−6), +the founding 18 cover the formation; CLUB-2✎ attack/passing/defense/keeper/stamina and overall by role→the player model (→PLAYER); CLUB-3✎ decline after 30→by attribute, refill by the line the formation lacks; CLUB-6✎ role fit→the formation slot by slot by 실효 OVR, +any player in a manual slot; CLUB-9✎ role-safe→slots kept, replacement by 실효 OVR; CLUB-10✎ +the formation with level, adaptation and 실효 OVR; CLUB-11✎ balanced/youth/recovery→균형/회복/하드 with growth ×1/×0.4/×1.6 and recovery 11/16/6, +per-player focus; CLUB-12✎ development and potential revisions→PLAYER-15–17; CLUB-13✎ 유망주 집중→하드 under 15 fatigue and morale 50+, +player rule 회복 at fatigue 40+; CLUB-14✎ role filters→position and line, +positions, traits, arrival and settled 실효 OVR; CLUB-16✎ +prospects carry the model; CLUB-19✎ +1 per 리더 (≤3), −1 per round from the third 하드 round; CLUB-21✎ stamina/passing/defence→체력/패스/태클 and 위치선정; CLUB-23✎ stamina→체력, +하드 training injuries 0.5%; CLUB-25✎ ability→OVR; CLUB-27✎ +야망 unhappiness after a declined bigger club's offer (25%/50%); CLUB-24✎ a bench player of his role within 3 ability→one who plays his slot within 3 실효 OVR; CLUB-32✎ CLUB-33✎ role→line and formation slot
- r33 261014 CLUB-33✎ the window's close→judged the day after its last day; +a loan counts as joining, a manager appointed since is not judged, founding opens the first window
- r32 261014 CLUB-33✎ the chief scout signs→the scout's all-season shortlist, the manager's requests with his pick and −3 trust when none is met at a window's close, the 단장 decides when delegated; CLUB-14✎ CLUB-18✎ the chief scout's negotiation→the 단장's; CLUB-18✎ CLUB-22✎ CLUB-26✎ delegated staff→the 단장; CLUB-21✎ 머니볼 negotiator scout→negotiator 단장
- r31 261014 CLUB-21+ 글로벌 스카우팅 synergy (해외 유스 스카우트 · 해외 스카우트망 3+ · spotter or 65+ chief scout → intake and candidate potential +2)
- r30 261014 CLUB-33+ delegated signings at level 4: weekly looks in a window, short roles then upgrades by 재정 기조, free agents first, bids at the asking fee, within 재정 기조's money checks
- r29 261014 CLUB-21✎ 상업 제국 marketing 4+→해외 마케팅 4+; CLUB-16✎ +풀뿌리 유망주 투자 and the bases add prospects and potential
- r28 261014 CLUB-32+ 육성 목표 (표준, 1군 공급, 판매용 육성, 최소 운영) and 데뷔 시점 (표준, 빠른 데뷔, 준비된 뒤, 늦게) set the youth director's promotion, release and listing; CLUB-22✎ +staff set stances at window openings by 매각 기조 and 육성 목표; CLUB-21✎ 트레이딩 머신 1군 직행 경로→데뷔 시점 빠른 데뷔; CLUB-13✎ CLUB-31✎ focus rules read 데뷔 시점
- r27 261014 CLUB-18✎ sale bar 130%/200% of value→by 매각 기조 (셀링 클럽 110/160 … 핵심 지키기 150/250, never a starter), runway steps 13/30 rounds→the 재정 기조 steps; CLUB-24✎ runway 30 weeks / 13-week warning→the 재정 기조 steps; CLUB-26✎ the owner's talk rule (wage cap 90–140%, minimum OVR, maximum age)→재계약 기조 (표준 110%, 모두 붙잡기 140%, 핵심만 붙잡기 starters 140%, 짠물 100%, 젊은 선수 우선 under 30), cash checks 13 rounds and 65%→재정 기조
- r26 261013 CLUB-12✎ facilities→the training ground; CLUB-16✎ facilities→academy facilities; CLUB-21✎ 상업 제국 facilities 6+→stadium 30,000+
- r25 261013 CLUB-13✎ the owner's focus at intervention level 1, the assistant's otherwise→always the assistant's, owner suggestions or forced orders (→STAFF-19); CLUB-16✎ one academy→U-17/U-19/U-21 by age, growth ×1.2/1.0/0.8, leave at 21 (was 22, staff release at 19), promotion from 16 (17 in England); CLUB-31+ youth training focus by the youth director
- r24 261013 CLUB-13✎ choosing a focus took the decision back from the assistant→refused while the level delegates it
- r23 261013 CLUB-30✎ agent premium 3%→1% of the demand per level above 1
- r22 261013 CLUB-3✎ top-up youths at the close five below the club's XI→five below the division's average strength on its market wage; CLUB-25✎ measured ratios none→recorded; CLUB-26✎ delegated checks: talk rule, 13 rounds of cash and the season projection→+the yearly wage bill after the raise within 65% of the last 12 months' revenue
- r21 261013 CLUB-13✎ training view→the 훈련 tab, +the delegated assistant's rule; CLUB-16✎ odds on the academy dial and build board→on the operating board; CLUB-26✎ delegated within the squad investment's pay ceiling→within the owner's talk rule (wage cap 90–140% of market, minimum OVR, maximum age)
- r20 261013 CLUB-26✎ delegated offers for 2 seasons→2 seasons past this one (1 from age 32), never ending before the running contract; +terms of a talk answered after its opening by the half of the season; CLUB-29✎ +the founding squad and the close's refills settle clauses
- r19 261013 CLUB-26✎ talks on 1 January→when a transfer window opens (summer and winter), renewal in the final season plus an improved contract with at most three seasons left and 25%+ below market once a season, ×agent premium, terms by window (winter ½–4½ years), never backdated; CLUB-29+ promotion and relegation clauses per contract by chance, tilted by the agent; CLUB-30+ agents rated 1–5 (fees and transfer steering not modelled)
- r18 261013 CLUB-26✎ a player 25%+ below his market wage asks for a raise once a season→talks only at renewal, a running wage never changes mid-term; delegated offers +the season's cash projection with the raise still ends the season covering 13 rounds of costs
- r17 261012 CLUB-25+ market wages; CLUB-26+ contract talks with goodwill and a floor (silent 3-season renewal at the close removed); CLUB-27+ unhappy players and transfer requests, a motivator talking them round; CLUB-28+ expiring contracts, Bosman from 1996
- r16 261012 CLUB-14✎ +market list per season and settings (no reroll by switching back), one ID one player, a bid keeps its player and terms; CLUB-20✎ stream for that round and revision→for that request and round
- r15 261011 CLUB-22✎ transfer list at a 90/110/140% ask→a stance per player (listed 85–105% offers, open, untouchable refusing below 150%); CLUB-24+ delegated verdict on big offers for untouchable players
- r14 261011 CLUB-3✎ retire at 36→spring announcement with age chances, retirement at the close, 41 forced; CLUB-4✎ instant sale→sale only by an accepted offer; CLUB-12✎ +yearly potential breakthroughs and stalls, attributes capped at 99; CLUB-18✎ bidders from the same country and division→clubs suited to the player; CLUB-22+ transfer list; CLUB-23+ injuries
- r13 261010 CLUB-21✎ 머니볼/상업 제국 vision conditions→build cards, +우리 동네 아이들 +트레이딩 머신 cross-slot combos
- r12 261010 CLUB-18✎ delegated sales at a flat 130%→a sale bar of 130% (prospects 200%) lowered for age, contract and cash runway
- r11 261010 CLUB-16✎ +academy investment, vision and synergy terms, golden-prospect odds; CLUB-19✎ +manager style/vision/synergy baseline terms and a motivator's defeat cushion; CLUB-20✎ care actions (rest day, intensive care, team dinner, special bonus, owner's visit, friendly)→owner requests to the manager and staff with stated chances (special bonus removed, win bonus per win); CLUB-21+ build synergies
- r10 261009 CLUB-1✎ fixed founding strength→league-average XI; CLUB-11✎ recovery 8/4/13→11/7/16; CLUB-19✎ morale baseline 55→58
- r9 261009 CLUB-20+ care actions with costs and cooldowns
- r8 261009 CLUB-17✎ summer window 14 June–1 September→season close–1 September
- r7 261009 CLUB-19+ no morale→results- and support-driven squad morale affecting match strength
- r6 261008 CLUB-4✎ instant fee transfers→free agents instant, fee transfers by bids; CLUB-16+ youth academy; CLUB-17+ transfer windows; CLUB-18+ negotiation and incoming bids
- r5 261008 CLUB-14+ CLUB-15+ long unfiltered market attribute cards→role-focused candidates with tactical and budget previews
- r4 261008 CLUB-11+ CLUB-12+ CLUB-13+ annual-only opaque growth→visible per-round training choices and individual potential-based development
- r3 261008 CLUB-6✎ CLUB-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r2 261008 CLUB-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
