# IDEATION difficulty-and-adaptation
> st:ready@261015 | Difficulty set by the start alone, training the owner can act on, and players with real positions and attributes who adapt to their manager and grow at their own pace.

## vision
- Problem (owner, 261014): a delegated level-4 career at 기본 방향 takes about 40 years to win the top flight, then wins about half of the titles after that. Holding the top is too easy, not reaching it.
- Problem (owner, 261014): capital difficulty (WEB-3: 2, 1 and 0.5 times the founding budget) is the only difference between starts, and starting cash barely matters over a career.
- Problem (owner, 261014): the 훈련 tab gives the owner nothing to do.
- Problem (owner, 261014): a player's potential is only a ceiling. Every player of the same potential grows the same way, and a high-OVR signing performs the same at any club.
- Today's rules (read 261014): every other club's players are generated from one club strength and never develop; the own club adds its manager's (ability − 50)/4 to its match strength where every other club adds a flat +4; capital difficulty only scales starting cash (nothing else reads it); a player has one of four roles (GK, DEF, MID, FWD) and no finer position; growth stops hard at potential; there is no per-player growth rate.
- Target: owners who play long careers, including those who let the club run itself at level 4 and judge it by where it gets.
- Core value: the challenge comes from football itself (players who fail to settle, a manager change that costs a squad its understanding, hard work that tires and injures), never from changed dice; a lucky career can still rise fast.

## explored
- [o] Four difficulty levels; the easiest starts rich and plays easily, and each level up starts with less money and a weaker squad. ← owner 261014
- [o] A level sets only the starting cash and the starting squad's ability; every rule, coefficient and probability is the same at every level. ← owner 261014; the other mechanisms here (adaptation, 조직력, training) make the game hard enough
- [x] Difficulty strengthens the other clubs per level ← owner 261014: superseded — a level sets only the start; the same rules hold at every level
- [o] Even the easiest level is a little less favourable than today for a delegated level-4 career. ← owner 261014
- [o] Starts per level — 쉬움: cash 2×, starting XI at the league average (today's start); 보통: 1×, −2; 어려움: 0.5×, −4; 최상: 0.25×, −6. ← owner 261014; the easiest is today's start, made a little harder by the new rules alone (adaptation, 조직력, training costs)
- [x] 쉬움 starts above today (XI +3) ← its being a little less favourable than today would then rest on the new rules outweighing a better start
- [o] The game's balance (not a level) makes the top hard to hold: reaching the first title naturally takes long, a lucky career can get there sooner, and nobody wins half the titles for decades. ← owner 261014; the climb already takes about 40 years, the dominance after it is the problem
- [o] The balance is measured on delegated level-4 careers at 기본 방향, like ECON-29's reference careers, with target bands per level (seasons to the first top-flight title and its spread, share of titles after the first, bankruptcies). ← owner 261014; the bands say whether the build is tuned, the levels differ only by the start
- [o] Target bands (level 4, 기본 방향, 1950–2009, 4 countries × level × 5 seeds): ← owner 261015
  | level | first top-flight title | share of titles after the first | bankrupt |
  |---|---|---|---|
  | 쉬움 | most careers; median 35–50 seasons, the fastest within about 25 | 20–35% | none |
  | 보통 | about a third of careers | 20% or less | none |
  | 어려움 | 1 in 5 careers or fewer | - | 1 in 20 or fewer |
  | 최상 | half the careers reach the top flight or fewer | - | 1 in 5 or fewer |
- [x] A band for 쉬움 alone, the other levels only measured; or harder bands (쉬움 titles in half the careers, 10–20% after) ← owner 261015 chose the table
- [x] Sugar daddies (슈가대디): rich owners taking over other clubs now and then, drawn to a league one club keeps winning, bidding for the owner's stars, some staying and some collapsing (cf. Chelsea 2003, Manchester City 2008, Málaga) ← owner 261015: left out of this plan entirely for now; a per-level rate or a fixed share of rich clubs had already been dropped (one changes the game's probabilities, the other takes the randomness out)
- [o] No level changes the game's probabilities (match odds, injuries, growth, event chances): a level changes only the start, the dice stay the same. ← owner 261014
- [x] Raising the giants' stature per level ← owner 261014: a level changes no coefficient
- [x] Lowering every rival's growth or recovery rate per level ← spreads thin, does not target holding the top, and is a per-level coefficient
- [o] The preset 동네의 자부심 becomes 유스 순혈주의. ← owner 261014; its cards (성골 유스, 지역 인재 우선, 회원제 운영) are Athletic Club's local-only policy, which Korean media call 칸테라 정책 or 바스크 순혈주의; the Barcelona (La Masia) feel is already 유스 명가
- [x] 칸테라 정책, 홈그로운 중심, 원클럽 문화 ← owner chose 유스 순혈주의
- [o] First-team training focus becomes 균형, 회복 and 하드 트레이닝. ← owner 261014
- [o] Training can also be set per player. ← owner 261014
- [o] The coaches keep setting training; the owner instructs them from the 훈련 tab, for the team or a player — 제안 with its stated chance, 강행 at the coach's cost (STAFF-19 kept, its controls moved where training is). ← owner 261014; the owner acts through people, and the tab gets something to do
- [x] The owner sets training directly ← reverses STAFF-19, settled 261013
- [x] Team training intensity as a 방향 row, per-player exceptions through the coach ← one subject split across two places
- [o] Detailed positions replace the four roles; each manager plays his own formation and wants positions filled. ← owner 261014; 감독이 원하는 포지션 needs real positions
- [o] About 12 positions with left and right apart; each player plays 1 to about 6 of them, each at his own level — a left winger may play the right wing as well, a little worse or not at all, and a versatile player covers full back, centre back, defensive and central midfield and the wing. ← owner 261014; real players differ exactly there, and the four-role squad simplified it away
- [o] Each position is played in a role named as football media name it (메짤라, 딥라잉 플레이메이커, 인버티드 윙어, 타겟맨 …); the manager's formation asks a role of every slot. ← owner 261014; fans read the game in football's own words
- [x] Eight positions without sides, or nine with wing-backs ← owner 261014: a side is real for players, so it stays
- [o] Players carry traits of two kinds: personality (프로의식 sets his growth rate, 적응력 his adaptation rate, 야망 how a bigger club's offer pulls him) and play (활동량, 테크니션, 타겟맨, 스피드스터 …, which schools prefer). ← owner 261014; the per-player rates read as football words, as FM's professionalism and adaptability do
- [x] Play traits only, rates as separate numbers; or personality traits only ← owner 261014 chose both
- [o] Each school prefers attributes and traits, which raise how fast a player adapts to it (e.g. under gegenpress the higher his stamina, the faster he adapts). ← owner 261014
- [o] Every attribute exists on its own and decides match play; a player's OVR is the sum of his position's key attributes (one scale for every position). ← owner 261014; also answers the goalkeepers reading 93 beside outfielders in the 60s (STATE next, 261013)
- [o] 14 attributes: 슈팅, 드리블, 크로스 (attack); 패스, 시야 (passing); 태클, 위치선정, 공중볼 (defending); 속도, 체력, 몸싸움 (physical); 선방, 공중볼 처리, 발밑 (goalkeeping); every player has all 14, and each feeds the match actions it names. ← owner 261014; maps one-to-one onto the stats the game reports (xG, key passes, tackles), and fits one card
- [x] Six FIFA-card attributes ← too coarse for school preferences and position differences
- [x] Twenty or more FM attributes with mental ones ← too deep for an owner's view and for one mobile screen; personality traits carry the mental side
- [x] Adaptation judged only by today's tactic fit on four roles ← owner 261014: chose positions, traits and school preferences together
- [o] Adaptation (적응도): fitting the position the manager wants raises it, and a higher adaptation raises the player's ability step by step; 0.8 plays at ×1.0 of his OVR, higher plays above it and lower below it. ← owner 261014
- [o] The adaptation multiplier is gentle above 0.8 and steep below: 1.0 ×1.05, 0.9 ×1.025, 0.8 ×1.00, 0.6 ×0.88, 0.4 ×0.76, 0.3 ×0.70 (an OVR 80 player plays at 84 settled, 56 when he fails to settle). ← owner 261014; a failure must show, and a long-settled squad must not grow 10% stronger than every rival
- [x] One slope both ways, ±5% or ±2.5% per 0.1 ← the strong one lets a settled squad run away, the weak one hides a failure
- [o] Adaptation starts again: low after a transfer (how low is his 적응력), lower still after a move abroad, partly lost by the whole squad when a new manager brings another formation and roles; an academy graduate starts near 0.8. ← owner 261014; failed moves abroad are football news, a manager change has a price, and 유스 순혈주의 gains a real edge
- [o] Other clubs have a club-level 조직력 by the same rules: it drops after a manager change or a big change of squad (a takeover or a project, LEAGUE-10) and recovers with time. ← owner 261014; money buys players, not a team at once (Chelsea and Manchester City took two to three years to their first title); both sides play on the same terms (MATCH-2)
- [x] Other clubs always at 0.8 ← a club that changed its squad would be at full strength at once, and only the owner's club would pay for change
- [o] Training raises OVR and adaptation together, more under 하드 트레이닝; starting matches raises adaptation the most. ← owner 261014; resting a player while hard-training him must not be the quickest way to raise adaptation
- [o] 하드 트레이닝 costs three ways: less fatigue recovered (and accumulated fatigue lowers play and raises injury risk by today's rules), injuries in training, and morale that falls the longer it runs; 회복 still grows a little. 유망주 집중 folds into 하드 트레이닝; the academy keeps its own focuses (CLUB-31). ← owner 261015; hard work has to cost something a fan recognises
- [o] Training alone lifts adaptation only up to 0.8; above it comes from starting matches. ← planner proposal, owner 261015 with the training costs; closes the rest-and-hard-train loop
- [o] Each player has his own growth rate for ability and for adaptation, so two players of the same potential grow at different speeds. ← owner 261014
- [o] With a manager and coaches that suit him, a player can grow past his potential with no cap, on a log-like curve whose slope drops sharply once beyond it. ← owner 261014
- [x] +5 at most, or a cap set by the coach ← owner 261014: no cap, the curve itself keeps it rare
- [o] Own players' traits, adaptation and multiplier are shown exactly; another club's player's personality traits show as a range as wide as the chief scout's ability allows. ← owner 261015; the scout earns his place, and a signing's settling is a stated gamble
- [x] Everything shown exactly, or personality hidden ← owner 261015 chose the scout's range
- [o] The new player model starts with new careers; older saves do not open in it (their export files stay). ← owner 261015; pre-release, a clean model beats converting five attributes into fourteen guesses
- [x] Converting old players ← estimated attributes and a converter kept forever
- [o] Built as several bundles that can be developed in parallel, not one release. ← owner 261015
- [o] A player with a low adaptation rate who joins a club that does not suit him plays well below his OVR: an adaptation failure (적응 실패). ← owner 261014

## shape
- flow: founding (level → starting cash and starting XI) → the manager's formation asks a role of every slot → the coaches pick lineups by positions and roles → starts and training raise adaptation (and OVR toward and past potential) → match strength from the attributes each action uses × adaptation, the opponent's by its 조직력 → summers: other clubs that changed manager or squad lose 조직력 and win it back
- player card: position(s) with side and level, role fit, OVR on one scale, 14 attributes, personality and play traits, adaptation with its multiplier
- 훈련 tab: the team's 균형/회복/하드 and per-player exceptions, asked of the assistant as 제안 (stated chance) or 강행 (his cost); the focus in force, who set it and why
- v1: four levels by the start only; 14 attributes, ~12 sided positions with per-player levels, football-named roles, personality and play traits, OVR per position; adaptation for own players and 조직력 for other clubs; per-player growth and adaptation rates, growth past potential on a flattening curve; training 균형/회복/하드 for the team and per player; 동네의 자부심 → 유스 순혈주의; balance bands measured on reference careers
- not: sugar daddies; per-level coefficients or probabilities; the owner setting training directly; mental attributes beyond personality traits; converting old saves

## domains
- PLAYER (new): 14 attributes, sided positions with per-player levels, roles, personality and play traits, OVR per position, adaptation (multiplier, starts, resets, growth by starts and training), growth and adaptation rates, growth past potential, what is shown and what the scout estimates — takes over CLUB-2 and CLUB-12
- MATCH: each attribute feeds the actions it names (MATCH-11 duels), the formation and the slot roles, the adaptation multiplier and the other club's 조직력 in match strength (MATCH-2)
- STAFF: each school's formation, slot roles, preferred attributes and traits (STAFF-14); a manager change costs adaptation; STAFF-19's training controls move to the 훈련 tab and to single players
- CLUB: training 균형/회복/하드 and its costs (CLUB-11, CLUB-13), per-player training, lineups by positions (CLUB-6); the starting XI per level (CLUB-1); 야망 and other clubs' offers (CLUB-18, CLUB-22)
- LEAGUE: other clubs' 조직력 beside LEAGUE-10's rise and fall, the balance bands per level
- WORLD: other clubs' squads generated with positions, roles and traits (WORLD-6)
- ECON: ECON-22 preset 동네의 자부심 → 유스 순혈주의
- WEB: founding with four levels (WEB-2, WEB-3, WEB-15), the 훈련 tab, the player card
- SAVE: the new model starts new careers; older saves do not open in it

## open
- If the bands are not met without sugar daddies, which lever comes next (the dropped sugar-daddy idea stays recorded above)
- The ~12 positions (proposal: GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LW, RW, ST) and the roles of each; whether a preferred foot explains side levels
- The trait lists; how 야망 and a star's wish to leave work with CLUB-27's unhappiness
- Each school's formation, slot roles and preferred attributes and traits; how fast adaptation grows by position fit and school preference
- OVR weights per position and role
- Training injury chance and morale cost sizes; the cost of 제안 and 강행 for a single player
- Whether the synergy 우리 동네 아이들 (lit by the renamed preset) is renamed too
- [?] feasibility: save size with 14 attributes and position levels over 100+ seasons (SAVE-4 caps, a 116-season save already failed); match-engine rework and its calibration test; the desktop benchmark already has no headroom (ARCH-28)
