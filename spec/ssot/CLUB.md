# CLUB Squad and growth
> r23 | Define the implemented browser-demo behavior for squad and growth.

## decisions
- CLUB-1 [o] A club starts with 18 players, a suitable manager, small facilities, 800 supporters, and a complete starting XI whose rating equals its league's average club XI (±1). ← a fixed founding strength left clubs in shallow pyramids 7–12 points below their league
- CLUB-2 [o] Player attributes include attack, passing, defense, keeper, stamina, potential, birth year, wage, contract term, and reputation; overall derives from role.
- CLUB-3 [o] Players age using the game calendar, develop through age/potential/manager ability, decline after 30 and are replaced by generated youth. On 1 April each veteran decides from his own stream whether the season is his last; announced players play on and retire at the close, and at 41 everyone stops.
  - chance by age at the season's end: 33 8%, 34 18%, 35 35%, 36 60%, 37 80%, 38+ 95%; keepers count a year younger; ×0.6 for a starter rated 60+, ×1.4 under 900 season minutes.
  - the announcement is an inbox item, an event and news; an announced player cannot be listed.
  - at the close the squad is topped up to 18 players with a goalkeeper by generated 18-year-olds rated five below the average strength of the division the club will play in, on that division's market wage (→CLUB-25). ← youths rated against an XI that had outgrown its division arrived on star wages and were sold on as unhappy players
- CLUB-4 [o] Recruitment offers immediate contributors, prospects, free agents, and short-term loans. Free agents sign instantly at any time; fee-bearing transfers are negotiated bids (→CLUB-18). A player leaves only when another club's offer is accepted (→CLUB-22); there is no instant sale. ← a sale needs a buyer
- CLUB-5 [o] Transfer price, recurring wage, and term are shown before acceptance. Keep at least 14 players and one goalkeeper; maximum squad size is 26.
- CLUB-6 [o] Automatic starting lineup uses available role fit and fatigue unless a saved manual XI is selected. Strongest/rest presets require at most selection plus confirmation; detailed role-safe substitutions are optional.
- CLUB-7 [o] Promotion, supporters, facilities, managers, player generations and finance measure growth; history survives transfers and retirement.
- CLUB-8 [o] Facility investment has a stated price and improves development/reach; actions fail cleanly if cash is insufficient.

- CLUB-9 [o] Match fatigue retains a higher cost for pressing than other tactics, modified within bounded ranges by stamina. Rest selection trades immediate strength for lower fatigue; saved manual lineups remain role-safe and unavailable players are automatically replaced.

- CLUB-10 [o] Match preparation separates tactic and lineup tabs, shows real current-versus-draft strength/fatigue, and keeps apply/close controls reachable while optional slot details scroll.

- CLUB-11 [o] Training focus is balanced, youth or recovery, defaulting to balanced for older saves. It applies once at settled domestic round boundaries; selecting a focus, viewing it, or advancing idle days does not grant growth. Youth trades reduced recovery for faster young-player development; recovery trades development opportunity for fresher players.
  - fatigue recovered per round: balanced 11, youth 7, recovery 16 (before staff and policy bonuses). ← a regular starter's 10–13 per match then levels off under balanced training; pressing or youth focus still accumulates

- CLUB-12 [o] Player development uses each player own potential gap, age, manager youth ability and facilities; young role-relevant skills grow only up to their current/potential ceiling. Record bounded cumulative actual positive development on the player, preserve retirement/history, and show current ability, potential and earned growth.
  - each summer a player aged 23 or younger may break through (5%: potential +5 to +9) or stall (5%: −4 to −7); otherwise potential moves by at most 2; never below current ability or above 99. Changes of 4+ are events and news.
  - generated attributes top out at 99.

- CLUB-13 [o] The 훈련 tab (→WEB-70) exposes the three focus choices and their recovery/development tradeoffs, the focus in force and the players still growing. Focus selection is a single saved game command; optional player and market details are explicit.
  - with the training focus delegated (→STAFF-13) the assistant picks it each round: 회복 집중 when the starters' average fatigue is 30 or more, else 유망주 집중 with a developer assistant or three or more starters aged 21 or under, else 균형; the tab states his pick and why.

- CLUB-14 [o] The market supports role and roster-fit filters with stable seeded candidates. Each candidate shows current ability, potential, effect on the proposed XI/tactic fit, upfront transfer or loan fee, recurring annual wage and contract term before acceptance.
  - the list is drawn per season and per the settings that shape it (recruitment level →ECON-16, chief scout →STAFF-11, strategy cards →ECON-22): the same settings always show the same candidates, so switching a setting away and back draws nothing new. ← a setting must not become a free reroll
  - one ID names one player: lists of different settings never share a candidate ID.
  - a bid concerns the player it was made for, on the terms it was made for, until it is answered or lapses (→CLUB-18), whatever the list shows meanwhile.

- CLUB-15 [o] Recruitment previews distinguish automatic starter selection from optional manual-lineup replacement, never promise a win or guaranteed selection, and show post-fee cash and wage-inclusive fixed-cost runway excluding future revenue. Disable unaffordable/full/already-signed offers; free transfers still disclose wages.

- CLUB-16 [o] The youth academy keeps prospects outside the first team. Each season on 15 March 3–5 prospects aged 15–16 join (more with a strong youth director or facilities); they grow every settled round toward potential and can be promoted while the first team has room, or released.
  - academy investment (→ECON-16), the club build (→ECON-22) and the pipeline synergy (→CLUB-21) add prospects, potential and growth.
  - the operating board (→WEB-60) shows the exact chance that the next intake brings a prospect of potential 80+, from the same uniform draws the intake uses.
- CLUB-17 [o] Fee-bearing purchases, loans and sales happen only in transfer windows: summer from the day the season closes (→LEAGUE-9) to 1 September and winter 1 January–1 February. ← the market opens as the season's review ends, not during its final rounds Free agents sign at any time. The market shows the window state and deadline.
- CLUB-18 [o] Bids are answered 2–4 days later with accept, reject or a counter; acceptance chance rises with the offered fee against the asking value and the chief scout. The fee is paid on completion; unanswered bids lapse at the deadline. During windows other clubs bid for our players (answered by the owner, or by the staff when delegated) and lapse after 5 days; squad minimums still apply. The bidder is a real club whose strength suits the player (4 below to 12 above his ability, stronger clubs more often, any country). Delegated staff accept an offer at or above their sale bar for a non-starter, or for a starter aged 30+ with a bench player of the same role within 3 ability. The report names the bar and each step.
  - bar: 130% of value, or 200% for a prospect (aged 22 or under with potential at least 8 above ability)
  - age 30–32 −15 points, 33+ −30; contract in its final season −20, one season after this −10
  - fixed-cost runway under 13 rounds (the cash warning) −20, under 30 rounds −10; never below 80%

- CLUB-19 [o] Squad morale (0–100, new clubs 60) moves +6/+1/−6 after own wins/draws/defeats (±2 more for a two-goal margin; a motivator manager takes 2 off a defeat), drifts 15% per settled round toward a baseline of 58 + 4 per squad-investment level above standard + (manager trust − 50)/10 + the manager style, build and synergy terms, within 30–80, and falls 2 more per round while starters average fatigue ≥ 40. Match strength adds (morale − 60)/10; older saves without morale stay exactly unchanged.

- CLUB-20 [o] The owner does not run the dressing room: morale and fitness actions are requests to the manager or the staff, made once per cooldown (settled rounds since the last use). Requests that depend on people can work, do little or backfire; every chance is stated before the request and drawn from the world's own stream for that request and round. ← a chairman paying random bonuses or treating the squad himself is not how football clubs work
  | request | by | cost (1901 units) | outcomes | cooldown |
  |---|---|---|---|---|
  | squad meeting | manager | free | works: morale +7 · nothing much: +2 · backfires: −3 and trust −2; works 0.5 + 0.2 for a motivator + (trust − 50)/200 + 0.1 when morale < 45 (0.2–0.9) | 4 |
  | team-building day | staff | 15 | morale +5 (75%) or +2 | 3 |
  | win bonus for the next 5 matches | owner | 8 per win, owed even when cash is short | morale +3 now, +2 after each win | 8 |
  | owner's dressing-room visit | owner | free | morale +4 (35%) / +1 (30%) / −3 and trust −3 (35%): an owner addressing the squad tends to undermine the manager | 4 |
  | public vote of confidence | owner | free | trust +8, morale +2; not while trust ≥ 85 or for an interim | 10 |
  | short training camp | staff | 60 | morale +5, every active player fatigue −8 | 12 |
  | rest days | manager | free | every active player fatigue −6, morale +2 | 4 |
  | recovery support | staff | 30 | every active player fatigue −10 | 2 |
  | friendly match | operations | income 12 + supporters/600 (max 60) | every active player fatigue +8 | 4 |
  - insufficient cash fails cleanly; older saves without morale start from 60 when a request changes it; no request touches past matches.
- CLUB-21 [o] Build synergies light up when the manager, staff, club choices and squad point the same way; each lists its conditions with what is met, and its bonus applies only while all are met. ← builds should be readable as combinations, like cards that work together
  | synergy | conditions | bonus |
  |---|---|---|
  | 게겐프레스 엔진 | gegenpress manager or press tactic · fitness coach 65+ or recovery trait · starters' stamina 60+ | fatigue −2 per match · opponent build-up pass success −1 point |
  | 점유의 미학 | positional manager or possession tactic · assistant 65+ or specialist · starting midfield passing 62+ | pass +1, possession +1 point |
  | 철의 장막 | organizer or counter manager · defence coach 65+ or specialist · starting defenders' defence 62+ | opponent chances −1 point |
  | 유스 파이프라인 | academy investment 3+ · youth director developer or 70+ · developer manager or youth trait | academy growth ×1.15, intake potential +3 |
  | 머니볼 | 데이터 스카우팅 card · scout spotter or negotiator · recruitment level ≤ 2 | candidate potential +3, fees ×0.92 |
  | 상업 제국 | 상업 확장 revenue card · marketing 4+ · facilities 6+ | new sponsor offers ×1.1 |
  | 원 팀 | motivator manager · squad investment 4+ · morale 65+ | morale baseline +3 |
  | 우리 동네 아이들 | 성골 유스 or 유소년 클럽 제휴 · 지역 밀착 · 가족 같은 클럽 | morale baseline +2, intake potential +2 |
  | 트레이딩 머신 | 데이터 스카우팅 · 1군 직행 경로 · 셀링 클럽 or 쇼케이스 | candidate potential +2, academy growth ×1.1 |

- CLUB-22 [o] Every player has a transfer stance the owner switches any time; offers come only while a window is open and only from real clubs (→CLUB-18), and a sale happens only when one is accepted. ← one tap says how the club treats offers for him, instead of an asking price per listing
  - 이적 명단 (listed, 적극 매도): draws its own offers at 10% a window day × appeal, fee 85–105% of value × build sale fee; delegated staff accept them
  - 협상 가능 (open, default): only unsolicited bids; delegated staff apply the sale bar (→CLUB-18)
  - 이적 불가 (untouchable): any bid below 150% of value is refused unseen, whoever decides; from 150% the owner is asked, or with transfers delegated the staff and manager decide (→CLUB-24)
  - loaned players and announced retirements have no stance; a retirement announcement clears it
  - a 1.9 listing at an ask loads as listed
  - appeal is 0.6 + (ability − 35)/60, +0.25 aged ≤ 23, −0.2 aged 31+, within 0.35–1.5; the stance sheet shows the average days to a first offer.
  - each listed player has at most one open offer; listed players are not targets of unsolicited bids.
- CLUB-23 [o] Own players can be injured in a match: each player who played has 1.8% × (1 + excess fatigue/25) × (1 + max(0, 55 − stamina)/150) × 1.15 when pressing, from the match's own stream (about one injury every five matches).
  | share | days out | examples |
  |---|---|---|
  | 60% | 5–14 | 근육 타박상, 가벼운 발목 염좌 |
  | 25% | 15–35 | 햄스트링, 종아리 |
  | 12% | 36–90 | 발목 인대, 중족골 골절 |
  | 3% | 120–240 | 전방 십자인대 파열, 아킬레스건 |
  - injured players are left out of the automatic and saved XI while eleven fit players exist; the medical report is an inbox item and an event; healed injuries clear.
- CLUB-24 [o] With transfers delegated, a bid of 150%+ for an untouchable player is decided by the staff with the manager: the build's market card sets the price (셀링 클럽 150%, 쇼케이스 175%, standard 200%, 강경 협상 225%, 핵심 지키기 never), a runway under 30 weeks lowers it 25 points, a starter without a bench player of his role within 3 ability raises it 25, and a runway under the 13-week warning sells. The report states the price and each step. ← the owner's club identity and cash, not a fixed number, decide when a star is let go

- CLUB-25 [o] Every player has a market wage from his ability, age and potential, his club's division and the football index (→ECON-26); it rises steeply with ability, so a star earns many times a squad player. ← players are paid what the market says they are worth
  - targets, calibrated with →ECON-29: in a top flight a player rated 80 earns 6–10× one rated 60; a second-tier squad earns 35–50% of a top-flight squad of the same ability. Measured 261013: 7.4× and 40%.
  - transfer values follow the same index.
- CLUB-26 [o] Players negotiate contracts when a transfer window opens (summer as the season starts, winter on 1 January, →CLUB-17): one in the final season of his contract asks to renew, and one with at most three seasons left, this one included, who is paid 25% or more below his market wage asks for an improved contract, at most once a season. He names a demand (market wage × the build's player-wage effects →ECON-22 × his agent's premium →CLUB-30) and accepts any offer at or above his floor, demand × (1 − goodwill). ← a player is paid what he is worth when his contract comes up, as in real football, and how a club treats its players decides what he settles for
  - goodwill: squad investment (→ECON-16) −5/0/+5/+10/+15%; the 라커룸 문화 card: 가족 같은 클럽 +5, 스타 대우 +10 for players rated 70+, 철저한 경쟁 −5; 긴축 재정 −5; (morale − 60)/4 %; within −10 to +30%.
  - the owner offers the floor or more with a term, or declines; the talk shows demand, floor, the contract's clauses (→CLUB-29), yearly cost and runway before the choice (→WEB-68).
  - delegated (→STAFF-13): the staff offer the floor for 2 seasons past this one (1 from age 32), never ending before the running contract, when the talk rule allows the player, cash after the raise still covers 13 rounds of costs, the yearly wage bill after the raise, staff included, stays at or below 65% of the club's revenue over the last 12 months, and the season's cash projection with the raise (→ECON-18) still ends the season covering 13 rounds of costs; otherwise they decline and say why (→CLUB-27). ← the cash checks alone let a promoted club's staff agree raises its income could not carry
  - revenue over the last 12 months: this season's turnover so far (competition, matchday and commercial income; player trading and owner capital excluded, →ECON-30) plus last season's for the league rounds not yet played; a club without a completed season counts its season so far at its pace over a whole season.
  - the talk rule, set by the owner in 사람's 선수 tab (→WEB-43): 연봉 상한, the floor at most 90/100/110/125/140% of his market wage (default 110%); 최소 OVR 0–99, players rated below are not kept (default 0); 최대 나이 none or 28–40, players that old or older are not kept (default none).
  - terms: a contract signed in the summer window runs 1–5 seasons, this one included; one signed in the winter window runs the rest of this season and 0–4 more (½ to 4½ years); every contract ends at a season's close (→CLUB-28). A talk answered after its opening, or an unhappy player's floor met later, takes the summer terms before 1 January and the winter terms from it.
  - an agreed wage is fixed for its term apart from its clauses (→CLUB-29); new terms run from the agreement and are never backdated; no player asks outside a window opening, and no contract renews itself.
- CLUB-27 [o] A declined player becomes unhappy (언해피) unless the manager talks him round. Unhappy, he plays 3 below his ability, costs squad morale 1 each settled round he starts, refuses to renew, and after 6 weeks hands in a transfer request: his stance becomes 이적 명단 and cannot be set to 이적 불가 (→CLUB-22). Meeting his floor later, or his sale, ends it. ← refusing a player what he is worth has a price, as in real football
  - talking him round: 15% + 45% for a motivator (동기부여형, →STAFF-14) + (trust − 50)/200 + (flexibility − 50)/400, within 5–85%, from the player's own stream for that talk; the outcome is an inbox item.
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
  - the premium stays small so the default talk rule's 110% cap still renews a delegated squad at its market wage (measured 261013: 3% a level left ECON-29's wage bill at 43% of revenue, below its band).
## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
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
