# PLAYER Player model
> r9 | What a player is and how he grows: attributes, positions and roles, traits, OVR, adaptation to his club and manager, development and ageing.

## decisions
- PLAYER-1 [o] Every player in the world — the own club's, the academy's and other clubs' — carries the same model: 16 attributes, positions with levels, personality and play traits, potential. Other clubs' match squads use seasonal generation from club strength (→WORLD-6, →LEAGUE-10); cross-role person continuity and retirement eligibility are →WORLD-10/11. Development, adaptation and attribute ageing below continue to apply to the own club's players and academy; this does not apply own-club development to every NPC squad. ← one model means one OVR scale and one match engine for both sides (→MATCH-2)

- PLAYER-2 [o] A player has 16 attributes, 1–99, each feeding the match actions and choices it names (→MATCH-11, →MATCH-16); every player has all 16, an outfielder's goalkeeping three sit at 8–20. Generated attributes top out at 99. ← maps one-to-one onto the stats the game reports, and fits one card
  | group | attribute | what it decides |
  |---|---|---|
  | 공격 | 슈팅 | shot quality and conversion |
  | 공격 | 드리블 | carrying the ball past a man |
  | 공격 | 크로스 | crosses, cut-backs and set-piece deliveries |
  | 패스 | 패스 | pass completion |
  | 패스 | 시야 | key and progressive passes |
  | 수비 | 태클 | winning the ball in a duel |
  | 수비 | 위치선정 | interceptions and being where the play goes, at either end |
  | 수비 | 공중볼 | headers and aerial duels |
  | 신체 | 속도 | runs in behind, recovery, counters |
  | 신체 | 체력 | in-match drain and pressing, fatigue cost |
  | 신체 | 몸싸움 | shoulder duels, holding the ball up and aerial challenges |
  | 정신 | 판단력 | choosing the better option: the free teammate, the higher-threat cell, the moment of a run |
  | 정신 | 침착성 | keeping that choice and its execution under pressure, at big chances and from the spot |
  | GK | 선방 | saves |
  | GK | 공중볼 처리 | claiming crosses and set pieces |
  | GK | 발밑 | a keeper's passing and sweeping |
  - generated 판단력 and 침착성 follow the position's weights like the others, about 5 lower for players aged 21 or younger, who grow into them (→PLAYER-17).
- PLAYER-3 [o] Positions are 14, left and right apart: GK, CB, LB, RB, LWB, RWB, DM, CM, LM, RM, AM, LW, RW, ST. ← sides are real for players: a left winger may play the right as well, a little worse or not at all
  - they group into four lines: GK; DF (CB, LB, RB, LWB, RWB); MF (DM, CM, LM, RM, AM); FW (LW, RW, ST). A player's line is his main position's; rules that count a squad by line (needs, limits, filters, synergies) use it.
- PLAYER-4 [o] A player plays 1–6 positions, each at a level; any other position is 미숙. ← versatile players (a full back who also plays centre back, defensive midfield and the wing) exist and are worth more to a manager
  | level | plays at | e.g. |
  |---|---|---|
  | 최상 | 100% | his main position; a two-footed winger on the other side |
  | 준수 | 92% | a central midfielder at DM |
  | 어색 | 80% | a left-footed winger on the right |
  | 미숙 | 60% | any position not listed (a striker at CB) |
  - his main position is always 최상; generated players hold 1 (25%), 2 (35%), 3 (22%), 4 (10%), 5 (5%) or 6 (3%) positions; a side position's mirror is listed 최상 15%, 준수 35%, 어색 50% of the time; other listed positions are 최상 15%, 준수 50%, 어색 35%.
  - starts at a position raise its level: 미숙 → 어색 after 20 starts there, 어색 → 준수 after 40, 준수 → 최상 after 60 (counted from the last change). ← managers retrain players, as full backs became centre backs and midfielders full backs
- PLAYER-5 [o] Each position is played in a role named as Korean football media name it; a manager's formation asks a role of every slot (→STAFF). A player's fit for a role is read from his attributes and play traits, never stored. A role also sets where its player stands and moves in each phase and which actions he favours (→MATCH-16, →MATCH-17), as football media describe it (docs/MATCH-BASELINES.md).
  | position | roles |
  |---|---|
  | GK | 스위퍼 키퍼, 슈팅 스토퍼 |
  | CB | 스토퍼, 커버형 센터백, 볼 플레잉 디펜더 |
  | LB, RB | 수비형 풀백, 오버래핑 풀백, 인버티드 풀백 |
  | LWB, RWB | 수비형 윙백, 공격형 윙백 |
  | DM | 앵커, 볼 위닝 미드필더, 레지스타 |
  | CM | 박스투박스, 메짤라, 딥라잉 플레이메이커 |
  | LM, RM | 와이드 미드필더, 와이드 플레이메이커 |
  | AM | 공격형 미드필더, 섀도 스트라이커, 트레콰르티스타 |
  | LW, RW | 전통형 윙어, 인버티드 윙어 |
  | ST | 타겟맨, 포처, 펄스 나인, 컴플리트 포워드 |
- PLAYER-6 [o] OVR is the weighted average of a position's attributes — primary ×3, secondary ×2, tertiary ×1, others 0 — so every position reads on one 1–99 scale; a role moves each attribute it names up one tier (none → tertiary → secondary → primary; a primary one stays). ← one scale ends goalkeepers reading 93 beside outfielders in the 60s
  | position | primary | secondary | tertiary |
  |---|---|---|---|
  | GK | 선방 | 공중볼 처리, 위치선정 | 발밑, 판단력 |
  | CB | 태클, 위치선정, 공중볼 | 몸싸움, 판단력 | 속도, 패스 |
  | LB, RB | 태클, 속도 | 위치선정, 체력, 크로스 | 패스, 판단력 |
  | LWB, RWB | 속도, 체력, 크로스 | 태클, 드리블 | 패스, 판단력 |
  | DM | 태클, 위치선정 | 패스, 체력, 몸싸움, 판단력 | 시야 |
  | CM | 패스, 체력 | 시야, 태클, 판단력 | 드리블, 슈팅, 침착성 |
  | LM, RM | 크로스, 체력 | 패스, 속도 | 드리블, 태클, 판단력 |
  | AM | 시야, 패스 | 드리블, 슈팅, 판단력 | 위치선정, 침착성 |
  | LW, RW | 드리블, 속도 | 크로스, 슈팅 | 패스, 침착성 |
  | ST | 슈팅 | 위치선정, 속도, 몸싸움, 침착성 | 드리블, 공중볼 |
  | role | moves up |
  |---|---|
  | 스위퍼 키퍼 | 발밑, 속도 |
  | 슈팅 스토퍼 | none (the position's weights) |
  | 스토퍼 | 몸싸움 |
  | 커버형 센터백 | 속도 |
  | 볼 플레잉 디펜더 | 패스, 시야 |
  | 수비형 풀백 | 위치선정 |
  | 오버래핑 풀백 | 크로스, 체력 |
  | 인버티드 풀백 | 패스, 시야 |
  | 수비형 윙백 | 태클, 위치선정 |
  | 공격형 윙백 | 드리블 |
  | 앵커 | 판단력 |
  | 볼 위닝 미드필더 | 체력, 몸싸움 |
  | 레지스타 | 패스, 시야 |
  | 박스투박스 | 태클, 슈팅 |
  | 메짤라 | 드리블, 슈팅 |
  | 딥라잉 플레이메이커 | 시야, 판단력 |
  | 와이드 미드필더 | 태클 |
  | 와이드 플레이메이커 | 패스, 시야 |
  | 공격형 미드필더 | 슈팅 |
  | 섀도 스트라이커 | 슈팅, 위치선정 |
  | 트레콰르티스타 | 드리블 |
  | 전통형 윙어 | 크로스 |
  | 인버티드 윙어 | 슈팅 |
  | 타겟맨 | 공중볼, 몸싸움 |
  | 포처 | 위치선정, 침착성 |
  | 펄스 나인 | 패스, 시야 |
  | 컴플리트 포워드 | 드리블, 공중볼 |
  - a player's OVR on his card, in the market and in market wages and values (→CLUB-25) is his OVR at his main position in his best role there.
  - in a lineup slot he plays at 실효 OVR = the slot's position and role OVR × his level there (→PLAYER-4) × his adaptation multiplier (→PLAYER-10), less 3 when unhappy (→CLUB-27); the lineup and the match show both numbers.
- PLAYER-7 [o] Every player has three personality traits, each one of five grades — 매우 낮음, 낮음, 보통, 높음, 매우 높음 — drawn 8% / 22% / 40% / 22% / 8% and fixed for his career. ← the per-player rates read as football words, as professionalism and adaptability do in football management games
  | trait | 매우 낮음 | 낮음 | 보통 | 높음 | 매우 높음 | decides |
  |---|---|---|---|---|---|---|
  | 프로의식 | ×0.70 | ×0.85 | ×1.00 | ×1.15 | ×1.30 | his development rate (→PLAYER-15) |
  | 적응력 | ×0.60 | ×0.80 | ×1.00 | ×1.20 | ×1.40 | his adaptation rate (→PLAYER-12) and his start after a transfer (→PLAYER-11) |
  | 야망 | never | never | never | 25% | 50% | unhappiness when a bigger club's offer is declined (→PLAYER-8) |
- PLAYER-8 [o] 야망 decides whether a declined offer from a bigger club makes him unhappy (→CLUB-27).
- PLAYER-9 [o] Play traits, 0–3 per player (most have 1–2, stars up to 3, some none), bend his match decisions toward their action and his runs toward their space (→MATCH-16, →MATCH-17) and are what schools of football prefer (→STAFF): ← the way he plays, not only how well
  | trait | does |
  |---|---|
  | 활동량 | covers ground and presses without stopping |
  | 테크니션 | dribbles and escapes pressure in tight spaces |
  | 플레이메이커 | looks for the key and progressive pass |
  | 스피드스터 | runs in behind and leads counters |
  | 라인 브레이커 | times runs on the offside line |
  | 타겟맨 | holds the ball up with his back to goal and links play |
  | 중거리 슈터 | shoots from outside the box |
  | 크로스 전문가 | crosses and cuts back from wide |
  | 공중 장악 | wins aerial duels |
  | 태클러 | tackles hard and wins the ball |
  | 빌드업 | carries and passes forward from deep |
  | 리더 | steadies the squad's morale (→CLUB-19) |
- PLAYER-10 [o] Adaptation (적응도) is how well a player fits his club under its manager: one value per player, 0.3–1.0, shown with its multiplier. ← the same OVR performs differently at different clubs
  | adaptation | 1.0 | 0.9 | 0.8 | 0.6 | 0.4 | 0.3 |
  |---|---|---|---|---|---|---|
  | multiplier | ×1.05 | ×1.025 | ×1.00 | ×0.88 | ×0.76 | ×0.70 |
  - linear between the points: gentle above 0.8, steep below. ← a failure must show, and a long-settled squad must not grow 10% stronger than every rival
  - other clubs' players play at their club's 조직력 instead (→LEAGUE).
- PLAYER-11 [o] Where adaptation starts:
  | how he joined | start |
  |---|---|
  | the founding squad, academy promotion (→CLUB-16) | 0.80 |
  | a transfer, a loan or a free signing from the same country, the close-of-season refill (→CLUB-3) included | 적응력 매우 낮음 0.45, 낮음 0.50, 보통 0.55, 높음 0.60, 매우 높음 0.65 |
  | from another country | 0.10 below the same-country start |
  - ← failed moves abroad are football news, and home-grown players know the club's way
- PLAYER-12 [o] Adaptation rises with matches and training (→CLUB-11): ← resting a player while hard-training him must not be the quickest way to settle him
  - each match in any competition: a start +0.020, a substitute appearance +0.008; each settled round's training: 하드 +0.007, 균형 +0.004, 회복 +0.002, and training alone never lifts it past 0.80;
  - above 0.80 every gain is halved;
  - every gain × his 적응력 rate (→PLAYER-7) × his level at the position he played (최상 1.0, 준수 0.8, 어색 0.5, 미숙 0.2; training counts his main position) × his manager's school preference for his attributes and traits (0.8–1.3, →STAFF);
  - it does not fall while he is rested or injured.
  - e.g. a 보통 same-country signing starting every match at his main position under a neutral manager reaches 0.80 in about 13 starts and 1.0 in about 20 more.
- PLAYER-13 [o] A new manager costs the squad adaptation the day he starts: every player above 0.50 loses 30% of the distance to 0.50 when the new manager's school differs from his predecessor's, 10% when it is the same (an interim or the founding manager has no school, so differs). ← a manager change has a price, and the same school costs little
- PLAYER-14 [o] A player still below 0.50 after 23 settled rounds at the club has failed to settle (적응 실패): an event and news, once per player per club. He keeps playing at his multiplier and can still settle.
- PLAYER-15 [o] Development is driven by the gap to potential, age (growth under 27, +0.3 a season at 27–30), the manager's youth work, the training ground, the coaches, squad investment and the training focus (→CLUB-11) — multiplied by his 프로의식 rate (→PLAYER-7). ← two players of the same potential grow at different speeds
  - potential is the OVR at his main position he grows toward; growth spreads over his attributes by that position's weights (→PLAYER-6), so primary attributes grow fastest.
  - each coaching department scales the attributes it owns (→STAFF-11): the assistant 패스, 시야, 판단력 and 침착성, the attack coach 슈팅, 드리블 and 크로스, the defence coach 태클, 위치선정 and 공중볼, the goalkeeping coach the three GK attributes, the fitness coach 속도, 체력 and 몸싸움.
  - each summer a player aged 23 or younger may break through (5%: potential +5 to +9) or stall (5%: −4 to −7); otherwise potential moves by at most 2; never below his OVR or above 99. Changes of 4+ are events and news.
- PLAYER-16 [o] With his adaptation at 0.90 or more a player grows past his potential, with no cap but 99, on a curve that flattens sharply: growth at +1 over potential runs ×0.25 of the rate below it, +3 ×0.10, +5 ×0.05, +10 ×0.02 (log-like between); the age rules still hold. ← a player who suits his manager can outgrow his potential, rarely and slowly
  - "the rate below it" is his rate 2 under potential: a settled player's round growth never falls below that rate, nearing potential or past it; an unsettled player's still shrinks with the gap and stops at potential.
- PLAYER-17 [o] Attributes age by group: ← veterans drop back into playmaking or centre back as their legs go
  | attributes | grow until about | from | per season after |
  |---|---|---|---|
  | 속도, 체력 | 26 | 29 | −2 |
  | 몸싸움, 공중볼 | 27 | 31 | −1 |
  | 슈팅, 드리블, 크로스 | 27 | 31 | −1.5 |
  | 패스, 태클 | 28 | 32 | −1 |
  | 시야, 위치선정, 판단력, 침착성 | 32 | 33 | −0.5 |
  | 선방, 공중볼 처리, 발밑 | 30 | 33 | −1 |
  - between growth and decline an attribute holds; every seasonal change carries noise of ±0.5.
- PLAYER-18 [o] The owner sees his own players' attributes, positions and levels, traits, adaptation, multiplier and 실효 OVR exactly; for any other player attributes, positions and play traits are exact and personality grades show as a range by the chief scout's ability (→STAFF-11): 80+ exact, 60–79 ±1 grade, below 60 or no chief scout ±2. ← the scout earns his place, and a signing's settling is a stated gamble
- PLAYER-19 [o] Match attributes are the 16 of →PLAYER-2; on the pitch 판단력 and 침착성 are the mental attributes, and the personality traits (→PLAYER-7) do not act in a match. Separate coaching aptitude and football understanding (→PLAYER-21) concern the later staff career, not a match modifier: 판단력 is on-pitch decision-making, football understanding the off-pitch reading of the game (→PLAYER-22). Nothing here changes by difficulty level (→WEB-3).

- PLAYER-20 [o] This model starts with new careers; a save made before it does not open in it, and its export file is kept (→SAVE). The 16 attributes likewise start with the grid engine's new careers (→SAVE-19); no earlier player gains invented 판단력 or 침착성. ← a clean model beats converting five attributes into fourteen guesses

- PLAYER-21 [o] Players across clubs have a separate coaching-aptitude assessment, informed by professionalism/work ethic, football understanding and ability to teach.
  - aptitude is independent of playing OVR: an ordinary player can have strong coaching promise. Do not equate physical work rate or a position-weighted playing attribute with work ethic or intelligence.
  - eligibility is not restricted by service at the owner's club; playing fame does not guarantee suitability or a fixed coaching-potential bonus.
  - the active-player profile shows qualitative grades/evaluations, never an exact aptitude number (→WEB-78), before retirement. Coaching/managerial entry follows →STAFF-23/24.
  - assessment generation/calculation is →PLAYER-22, grades and visibility are →PLAYER-23/24, and fixed aptitude versus learned ability is →PLAYER-25; existing match/development coefficients remain as specified.

- PLAYER-22 [o] Overall coaching aptitude equally weights existing professionalism, separate football understanding and teaching ability; managerial aptitude equally weights football understanding and separate team-management judgement.
  - football understanding is reading football/tactical principles, teaching is explaining and developing others, and team-management judgement concerns running a team and making managerial decisions. They are off-pitch qualities, not match attributes.
  - represent each component on the existing five-grade scale. Generate the three new qualities independently using →PLAYER-7's grade distribution and a person-specific aptitude stream, leaving existing playing/profile draws unchanged. Reuse the person's existing professionalism.
  - each aptitude grade is its components' arithmetic mean rounded to the nearest grade, with halves rounded upward, bounded to the five-grade scale (→PLAYER-23). Coaching uses thirds and management uses halves; neither includes playing OVR, fame or physical work rate.
  - assignment is at new-career player generation (→SAVE-18) and remains fixed (→PLAYER-25). No assignment to legacy careers or invented historical observations is required. Display/scouting follows →PLAYER-23/24.

- PLAYER-23 [o] Coaching aptitude and the separate managerial aptitude use five ordered qualitative grades: 매우 낮음, 낮음, 보통, 높음, 매우 높음.
  - profiles expose the grade and evaluation, not an exact aptitude score (→WEB-78). Coaching/managerial eligibility uses the applicable true grade under →STAFF-38/39.

- PLAYER-24 [o] The owner sees the actual aptitude grades of own players; another club's player's aptitude evaluation uses the same chief-scout accuracy rules as personality assessment (→PLAYER-18).
  - chief-scout ability 80+ shows the actual grade; 60–79 shows ±1 grade; below 60 or no chief scout shows ±2, bounded by the five-grade scale (→PLAYER-23).
  - scouting uncertainty affects the displayed estimate, not the person's true aptitude or eligibility. Retained historical evaluations remain historical facts rather than invented current observations (→HIST-14).

- PLAYER-25 [o] Coaching and managerial aptitude are fixed qualities assigned when the player is generated; they persist with the same person through clubs and roles (→WORLD-10).
  - match appearances, training, owner encouragement, coaching employment and managerial appointment do not raise or reroll aptitude.
  - actual coach/manager ability develops after employment under the existing staff growth/ageing rules (→STAFF-16). Aptitude and currently learned staff ability are distinct; these rules do not change the existing playing model.

## flow
- a player's season: joins (start by PLAYER-11) → starts and training raise adaptation (PLAYER-12) and attributes (PLAYER-15) → a manager change costs adaptation (PLAYER-13) → still below 0.50 after 23 rounds: 적응 실패 (PLAYER-14) → past potential only at 0.90+ (PLAYER-16) → ageing by group (PLAYER-17)
- in a match: slot position and role → OVR (PLAYER-6) × level (PLAYER-4) × adaptation multiplier (PLAYER-10) = 실효 OVR; role and play traits shape his choices and runs (PLAYER-5, PLAYER-9); each choice and action reads its attributes (PLAYER-2)

## chg
- r9 261019 PLAYER-1✎ PLAYER-2✎ 14→16 attributes, +정신 판단력 and 침착성 (young players about 5 lower at generation), 몸싸움 +aerial challenges, 크로스 +set-piece deliveries; PLAYER-5✎ +roles set positions, movement and favoured actions; PLAYER-6✎ +판단력/침착성 in every position's weights, 앵커 none→판단력, 딥라잉 시야→시야/판단력, 포처 위치선정→위치선정/침착성; PLAYER-9✎ attempt their action more often→bend decisions and runs; PLAYER-15✎ assistant 패스/시야→+판단력/침착성; PLAYER-17✎ +판단력/침착성 in the 32/33/−0.5 group; PLAYER-19✎ match attributes 14 with personality as the mental model→16 with 판단력/침착성, personality off-pitch; PLAYER-20✎ +the 16 attributes start new careers (→SAVE-19)
- r8 261016 PLAYER-22✎ initial components/calculation open→equal professionalism/understanding/teaching mean for coaching and understanding/team-judgement mean for management, existing five-grade generation distribution, fixed person-specific qualities
- r7 261016 PLAYER-21/22✎ aptitude evolution open→fixed under PLAYER-25, initial calculation remains open; PLAYER-25+ fixed generation-time aptitude distinct from actual staff ability growth
- r6 261016 PLAYER-21/22✎ grade/visibility open→PLAYER-23/24, calculation/evolution remain open; PLAYER-23/24+ five aptitude grades, exact own-player grades and existing chief-scout accuracy for others
- r5 261016 PLAYER-22✎ legacy aptitude assignment open→new-career generation only under SAVE-18; assessment/scouting parameters remain open
- r4 261016 PLAYER-1✎ seasonal NPC roster only→cross-role continuity reference; PLAYER-19✎ no other mental attributes→separate off-pitch coaching aptitude, playing model unchanged; PLAYER-21+ cross-club aptitude and qualitative profile evaluation; PLAYER-22+ open assessment/scouting rules
- r3 261015 PLAYER-16✎ unspecified rate below potential→the rate 2 under it, a settled player's floor
- r2 261015 PLAYER-3✎ +four lines (GK, DF, MF, FW) for rules that count by line; PLAYER-8✎ [?]→[o] 야망: a declined bigger club's offer makes 높음 25% and 매우 높음 50% unhappy (→CLUB-27)
- r1 261015 initial
