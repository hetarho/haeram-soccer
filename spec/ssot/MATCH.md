# MATCH Observable match simulation
> r12 | Define the implemented browser-demo behavior for observable match simulation: a grid engine where every touch is a player's role-, place- and situation-based decision.

## decisions
- MATCH-1 [o] A match is played touch by touch: two halves of 45 minutes plus added time, each action taking its own few seconds of match time; the ball changes sides only through an event on the pitch — a tackle, an interception, a loose ball won, the ball out of play, a shot that ends, a foul or an offside. Events and team/player counts share one seeded engine. Pitch playback does not change outcomes. ← every change of possession has a cause the owner can see
  - added time is the time each half lost to goals, substitutions, injuries, cards and set-piece delays, announced as the half ends; the modern era plays about 6–12 minutes a match in all (EPL 2023-24 11:39, the five seasons before about 7:20).
  - at half-time the sides change ends and the manager may substitute (→MATCH-20).
- MATCH-2 [o] Outcome factors include the players' attributes at their slots, club/manager quality, fatigue, home advantage, and the actually applied tactical preset. ← the own club must play on the same terms as the clubs it meets
  - every club's strength is its actual starting XI in its formation (→STAFF-22): the average 실효 OVR at the slots (→PLAYER-6) minus (fatigue − 20)/6 for fatigue above 20; an own player's 실효 OVR carries his adaptation multiplier (→PLAYER-10), a player of a club nobody owns his club's 조직력 multiplier (→LEAGUE-12); clubs nobody owns add 4 for their unmodelled manager, the own club (manager ability − 50)/4, morale, its manager style's strength (→STAFF-14) and at home its build's home strength (→ECON-22).
  - fatigue up to 20 is ordinary match fitness and costs nothing in ratings, duels or tactic fit; only the excess weakens a player.
  - clubs nobody owns do not track fatigue match by match, so a pressing club's squad carries fatigue 32.
  - a strength gap counts with diminishing returns (gap / ⁴√(1 + (gap/24)⁴): 20→18.1, 30→22.0, 40→23.3); each side then adds its match-day form, a seeded fat-tailed draw (sd 7, within ±21) from a stream of its own, so watched and unwatched runs agree. ← even a far stronger side has bad days; a +20 favourite wins about 79%, draws 14% and loses 7%, as in real league data
  - home, manager and morale points and the form move every player's skills too (half the difference between the sides to each), so a strength point counts the same wherever it comes from.
  - calibration target: Elo with 16 Elo per rating point (docs/CALIBRATION.md); the grid engine and the probabilistic path (→MATCH-22) each hold it across gaps −10 to +40, and each calibration records its measured error there.
- MATCH-3 [o] Provide possession, goals, assists, shots, shots on target, attempted/completed passes, tackles, interceptions, dribbles, saves, fouls, yellow and red cards, corners, offsides, minutes played, substitutions, injuries and player contributions.
- MATCH-4 [o] Display counts, denominators and defined ratios; no attempts means no defined percentage. Compare own match, season and career totals.
- MATCH-5 [o] Observed current fixtures expose every touch at its place, the action chain, cumulative xG per minute, timeline and progressive statistics. Own matches of the current season keep their post-match material (→MATCH-25) until the season close; then each own player keeps one season heat map and the matches keep outcomes, highlights, each side's match xG and counters, never frame traces or per-match maps. ← bounded retention protects long careers (measured 261017, 100-season checkpoint: 1,564,446 bytes, about 99.5% of the then 1.5 MiB limit; current budget →SAVE-4)
- MATCH-6 [o] A cup match that must produce a winner and is level after 90 minutes plays extra time, two halves of 15 minutes on the same engine, then a penalty shootout kick by kick: five each, then sudden death. All scores are settled once.
  - each kick is the taker's 슈팅 and 침착성 against the keeper's 선방 (→PLAYER-2); the manager orders the takers best first.
- MATCH-7 [o] Fast and observed processing use the same match seed and football result path; animation speed, selected view and browser clock cannot reroll results.

- MATCH-8 [o] The four tactics are the owner's only tactical control, applied through the manager (→STAFF-22); each sets real behaviour on the pitch, and their tradeoffs keep: possession uses the midfielders' 패스 and 시야 but fewer direct shots; counter uses the defenders' 위치선정 and the forwards' 속도 and gains against press but sacrifices possession; press uses 체력 and freshness to force chances at higher fatigue cost; balanced retains defensive stability. ← the owner shapes the club through staff
  | tactic | formation | out of possession | in possession |
  |---|---|---|---|
  | possession | 4-3-3 | high line, mid-to-high block, counter-press after a loss | short passing, patient recycling, width held by the wingers, the inverted full-back steps into midfield |
  | press | 4-2-3-1 | high line, presses the opponent's build-up, counter-press after a loss | quick vertical passing after a regain |
  | counter | 4-4-2 | deep line, low-to-mid block, engages around halfway | direct forward passes and runs in behind straight after a regain |
  | balanced | 3-5-2 | mid block, engages in the middle third | mixed passing, wing-backs give the width |
  - no detailed instructions (line height, width, tempo, pressing intensity) are offered.
  - shared engine profiles expose fit rather than guaranteed win probabilities.

- MATCH-9 [o] The midfielders' 패스 affects possession and pass completion; the defenders' 태클, 위치선정 and 공중볼 suppress opposing shot creation; 체력 and fatigue limit press effectiveness. The pre-match laboratory's tactic fit reads the same attributes and tactic behaviour the engine plays, never a separate formula.

- MATCH-10 [o] Mobile observation keeps score, pitch, latest event, pause/speed, live charts and the primary action visible together, including empty, live, finished, replay and new-match states. Stats, timeline, player inspection and full post-match league context open explicitly; presentation choices never reroll settled facts.

- MATCH-11 [o] A duel between named players resolves every action the carrier chooses (→MATCH-16). ← individual players matter on the ball and against it
  - every attribute a duel reads is the player's own (→PLAYER-2) × his level at the slot (→PLAYER-4) × his adaptation or his club's 조직력 multiplier, with in-match fatigue; in-match fatigue grows with minutes, faster for low 체력 and under press.
  | action | attacker | against |
  |---|---|---|
  | short or long pass, switch of play | passer 패스; 시야 for a line-breaking or through ball | the defender nearest the lane on 위치선정 |
  | through ball | passer 시야 and 패스; runner 속도 | defender 위치선정 and 속도; a 스위퍼 키퍼's 속도 and 발밑 |
  | cross, cut-back | 크로스; the receiver's 공중볼 and 몸싸움 for a header | defender 공중볼 and 몸싸움; keeper 공중볼 처리 |
  | take-on, carry under pressure | 드리블 and 속도; 몸싸움 in a shoulder duel | 태클 and 속도 |
  | hold-up play, lay-off | 몸싸움 | 몸싸움 and 태클 |
  | aerial duel | 공중볼 and 몸싸움 | 공중볼 and 몸싸움 |
  | shot, header | 슈팅 (공중볼 for a header) and 침착성 | blocker 위치선정; keeper 선방 |
  | keeper distribution | 발밑 | the defender nearest the lane |
  - key duels and finishing against the keeper use margins that flatten past about 15 points (30 × tanh(margin/30)).
  - shot quality is the chance's place and situation: its cell and distance, the angle, pressure, a header or a foot, a cut-back or a cross.
  - recorded xG is that chance's goal probability for the match level's average finisher and keeper, so goals minus xG measures finishing and xGA minus goals against measures keeping.
  - the last completed pass before the shot is the key pass and earns the assist, unless the shooter beat his marker alone (then the shot is unassisted).
  - player contributions record the actual passer, receiver, marker, shooter, keeper, fouler, carded player and substitute.
- MATCH-12 [o] Observed playback draws the engine's own positions for every touch: the ball flies along the recorded actions and players stand where the engine puts them. ← a ball that stops in open space and then jumps to an opponent reads as a bug, not football
  - pacing is automatic: quick through build-up in the own half, slower near the box, at chances and at set pieces; pause and the speed choices keep, and a match lasts about 720 motion seconds (8 a match minute on average).
  - speed: passes about 48, turnovers 44, restarts 60, shots 84 pitch units per motion second (cap 100) against a 5.8 player maximum; a kick starts fast and slows a little.
  - flight: a quadratic curve from launch to landing whose sideways bend grows with distance; passes of 18+ units rise with distance (up to 9, about 30% of long balls driven low), shots stay low; bend and height come from the motion stream only.
  - every flight ends where the engine recorded it: at the receiver, the interceptor, the tackler, out of play or in the net; restarts rest on their real spot and the taker walks to it for at most 0.9 s.
  - the track records ground position and height every 0.1 motion seconds and the renderer draws the ball above its shadow, up to 35% larger when high.

- MATCH-13 [o] Every own-club match records advanced counters for both sides and every own player; they add up to season and career totals for own players (→HIST). ← xG, xA, key passes and where the ball goes are what football fans compare
  | counter | definition in this engine |
  |---|---|
  | key pass | last completed pass before a shot (assists included) |
  | xA | the xG of the shots a player's key passes set up |
  | big chance | a shot of 0.30 xG or more |
  | box shot | a shot from inside the penalty box (the half-space and central cells of the box and goal-area bands) |
  | final-third pass | pass attempt that starts in the attacking third, and its completions |
  | progressive pass | completed pass into a higher band |
  | take-on | attempted dribble past a marker (dribbles = successful ones) |
  | high turnover | ball won while the opponent had it in its defensive third |
  | PPDA | opponent pass attempts in its own two thirds ÷ own tackles+interceptions there |
  | field tilt | own final-third passes ÷ both sides' final-third passes |
  | box entry | a completed pass or carry that ends in the box |
  | front-of-box entry | a completed pass or carry that ends in the band in front of the box |
  | line-breaking pass | a completed pass played beyond the deepest player of an opponent line |
  | xT added | the expected-threat value gained by a player's completed passes and carries, on the cells' values (→docs/MATCH-BASELINES.md) |
  | cut-back | a completed pass from the cut-back zones back into the box |
  | cross | attempted crosses and completions |
  | through ball | attempted passes into the space in behind and completions |
  | progressive carry | a carry into a higher band |
  - a match carries detail for every saved player or for none; key passes ≤ shots, completions ≤ attempts, big chances scored ≤ big chances ≤ box shots, take-ons ≥ dribbles.

- MATCH-14 [o] The pitch is 40 named cells aligned with its markings: 5 lanes × 8 bands on a 105 × 68 m pitch, in the attacking direction. Every player and the ball stand at a pitch position; the cell containing it is what decision tables, statistics and commentary read. ← every cell has a football name, and 40 cells stay within what real event data supports
  | lane (m from the left touchline) | name |
  |---|---|
  | 0–13.84 | 왼쪽 측면 |
  | 13.84–24.84 | 왼쪽 하프스페이스 |
  | 24.84–43.16 | 중앙 |
  | 43.16–54.16 | 오른쪽 하프스페이스 |
  | 54.16–68 | 오른쪽 측면 |
  | band (m from the own goal line) | name |
  |---|---|
  | 0–5.5 | 우리 골 에어리어 |
  | 5.5–16.5 | 우리 박스 |
  | 16.5–35 | 수비 지역 |
  | 35–52.5 | 우리 진영 중원 |
  | 52.5–70 | 상대 진영 중원 |
  | 70–88.5 | 박스 앞 (the central cell is 아크 정면, Zone 14) |
  | 88.5–99.5 | 박스 안 (the central cell is 페널티 스폿 부근) |
  | 99.5–105 | 골 에어리어 (the half-space cells are the 컷백 구역; the central cell splits at the goal's middle into 니어 포스트 and 파 포스트 by the ball's side) |
  - wide lanes beside the box and goal-area bands are outside the box (박스 옆 측면, 코너 부근).
- MATCH-15 [o] Every touch carries tags computed from the players' positions: ← relational spaces move with the opponents, so they are read each touch, not fixed as cells
  - phase: build-up, progression, final third, counter-attack, counter-press, settled attack, set piece, loose ball in contest.
  - pressure: the opponents within about 4.6 m of the carrier, one in front weighing more than one behind.
  - body orientation: facing play, on the half-turn, back to goal.
  - space: between the lines (between the opponent's midfield and defensive lines), in behind (beyond the deepest outfield defender), the CB–FB channel, overload or isolation around the ball.
  - match state: score, minute, men on the pitch.
- MATCH-16 [o] The carrier chooses his action and its target by probability from a decision table. ← realism is measurable against real data instead of feel; roles, traits and attributes make players differ
  - actions: short pass, long pass, switch of play, through ball, cross, cut-back, carry, take-on, shot, header, hold-up or lay-off, clearance, keeper distribution, set-piece delivery.
  - the base probabilities are real football's for the cell and the player's position (→docs/MATCH-BASELINES.md); his role's spatial habit (→PLAYER-5), his play traits (→PLAYER-9), the tactic's behaviour (→MATCH-8) and the tags bend them.
  - pressure shortens the options, back to goal favours hold-up and lay-offs, in behind favours a shot or a through ball; a side ahead sits deeper and risks less, more so late, a side behind pushes up and risks more.
  - the target is weighed among teammates by the threat value of their cell, how free they are and the distance; 판단력 sharpens the choice toward the best option and 침착성 keeps that sharpness and the execution under pressure (→PLAYER-2).
  - shots follow real per-cell rates: almost none outside the attacking quarter, rising to most touches in the central cells near goal.
- MATCH-17 [o] Off the ball every player moves toward a target position: his slot's place in the formation's shape for the phase (in possession, out of possession, transition), moved by his role's habit (e.g. the inverted full-back into midfield, the false nine into the pocket) and the tactic's block and line height, and shifted toward the ball. Runs in behind, overlaps and late runs into the box follow role, traits and tags; markers track their men; the side in possession keeps players behind the ball as its tactic's rest defence.
- MATCH-18 [o] Fouls, set pieces, restarts and offside are real scenes at their real spot. ← set pieces and penalties score about a quarter to a third of real goals
  - a challenge may be a foul, more often for a reckless 태클, under the press tactic and when stopping a counter, less often by a booked player; a foul gives a free kick at its spot, inside the box a penalty.
  - ball out of play: a throw-in at its touchline spot, a goal kick, or a corner when the defending side touched it last over its byline.
  - free kicks within shooting range may be shot directly or crossed; corners and wide free kicks are delivered into the box for aerial duels and second balls.
  - a penalty is the taker's 슈팅 and 침착성 against the keeper's 선방.
  - offside: a receiving teammate in the opponent's half and beyond both the ball and the second-last opponent when the pass is played is offside; an indirect free kick restarts play. A high line can catch runners; a runner's 판단력 times his run.
  - the manager names the set-piece and penalty takers by their attributes.
- MATCH-19 [o] Cards and suspensions follow one English-style rule in every league and every era (→MATCH-23 for rates). ← realistic and explainable with one rule
  - a yellow card for a reckless foul, a tactical foul stopping a counter or dissent; a red card for serious foul play or violent conduct, for denying an obvious goal-scoring opportunity, or for a second yellow; a sent-off player leaves his side a man short.
  - before 1970 there are no cards on show; cautions and sendings-off apply the same way.
  | red card for | matches banned |
  |---|---|
  | violent conduct, serious foul play | 3 |
  | offensive language or dissent | 2 |
  | a second yellow, denying an obvious goal-scoring opportunity | 1 |
  | league yellows reached | matches banned |
  |---|---|
  | 5 within the first half of the league rounds | 1 |
  | 10 within the first 84% of the rounds | 2 |
  | 15 in the season | 3 |
  - in a cup competition, domestic or continental, every 3 yellows in it ban the player for its next match.
  - a red-card ban counts the club's next matches in every domestic competition; yellow accumulation counts per competition and resets at the season close; an unserved ban carries into the next season.
- MATCH-20 [o] The manager makes the substitutions: injuries first, then fatigue, the score and minute, and red cards, at half-time or in play; his style (→STAFF-14) shows in their timing. A substituted player does not return. ← the owner shapes the club through staff
  | from the season starting | named substitutes | may be used |
  |---|---|---|
  | before 1965 | 0 | 0 |
  | 1965 | 1 | 1, for an injury only |
  | 1967 | 1 | 1 |
  | 1987 | 2 | 2 |
  | 1995 | 3 | 3 |
  | 1996 | 5 | 3 |
  | 2008 | 7 | 3 |
  | 2022 | 9 | 5, in at most three stoppages plus half-time |
  - without a substitute left, an injured player who cannot continue leaves his side a man short.
- MATCH-21 [o] Injuries happen during the match: the per-match probability of →CLUB-23 strikes at a moment of play, more likely late and under press, and replaces the separate draw after the match; the injured player leaves the pitch (→MATCH-20) and the severity bands of →CLUB-23 apply. Players of clubs nobody owns are injured by the same rule. ← the →CLUB-23 frequency holds, now visible when it happens
- MATCH-22 [o] Which engine plays a fixture:
  - the own club's matches always play the grid engine.
  - fixtures between other clubs in a league whose players are recorded (the own league) play the grid engine while a season's processing stays within 125% of the rules 3.0.0 baseline on the century benchmark (→ARCH-28; about 10 s a season on CI); beyond that they take the probabilistic path.
  - every other fixture takes the probabilistic path: team-level and fast, on the same scoring curve (goals per match within 20% of the grid engine at every tier, the same MATCH-2 calibration), naming scorers and assisters where players are recorded and drawing cards, suspensions and injuries for named players at the grid engine's rates. ← a world season simulates about 10,000 fixtures
  - a fixture always takes the same path whether observed or not.
- MATCH-23 [o] The grid engine holds real football's distributions for equal top-tier sides, measured over own matches (sources and per-cell tables →docs/MATCH-BASELINES.md). ← the decision tables are anchored to real data, so their output must read like it
  | measure (a team a match unless noted) | band |
  |---|---|
  | passes attempted / completed | 430–520 / 76–84% |
  | pass direction forward / lateral / back | 30–40 / 45–55 / 12–18% |
  | possessions / median passes in one | 85–105 / 2–4 |
  | possessions ending in a shot | 10–15% |
  | shots / on target / xG per shot | 11–14 / 30–37% / 0.09–0.12 |
  | shot place: goal area / rest of the box / outside | 6–9 / 48–58 / 32–42% |
  | mean shot distance / shots from 30 m+ / from the own half | 15–18 m / at most 10% / at most 0.5% |
  | crosses / completed | 13–20 / 20–30% |
  | take-ons / successful | 14–20 / 40–60% |
  | tackles + interceptions | 22–30 |
  | throw-ins / corners / goal kicks | 17–23 / 4–6 / 7–9 |
  | fouls / offsides | 10–13 / 1.5–2.5 |
  | yellow / red cards (a match, both sides, modern era) | 3.3–4.3 / 0.08–0.15 |
  | goals (a match, both sides) | 2.6–2.9 |
  | goals from set pieces without penalties / from penalties / headed | 20–28 / 6–9 / 14–20% |
  | goals by line FW / MF / DF | 50–60 / 27–37 / 8–15% |
  | ball in play (a match) | 54–58 min |
- MATCH-24 [o] The live event line narrates notable actions with their cell and tags in Korean football media's terms (하프스페이스, 라인 사이, 뒷공간, 아크 정면, 컷백, 니어/파 포스트, 레스트 디펜스, 세컨드 볼, 수적 우위, 라인 브레이킹, 역습, 게겐프레싱 and the like), derived from recorded events only; it never changes outcomes and uses no invented zone names.
- MATCH-25 [o] After an own match its post-match material is shown and kept as →MATCH-5 allows: a shot map (place, xG, outcome, header or foot), heat maps for each player and side, a pass network (average positions and passes between pairs) and a tactical report — where attacks came from by lane and band, entries, where the ball was won and lost, set pieces and decisive duels. ← it gives the owner grounds for manager and signing decisions
- MATCH-26 [?] Players on the probabilistic path have no grid-only counters (box entries, xT added, line-breaking passes and the like): leave them absent, or estimate them by position at real rates — settled once the grid engine's cost is measured (→MATCH-22).

## flow
- Play: squads and tactics → kickoff → carrier's cell and tags → decision → duel → event (pass | loss | out | foul | offside | shot) → restart or play on → half-time → full time (→ extra time and shootout in a cup tie) → recorded facts → visible feedback.

## constraints
- The grid engine starts new careers; earlier careers follow its activation rule (→SAVE-19).

## chg
- r12 261019 MATCH-18✎ offside beyond the second-last defender in the opponent's half→receiving teammate beyond both the ball and the second-last opponent when the pass is played; restart unchanged
- r11 261019 constraints✎ a running career keeps the rules it plays→the grid engine starts new careers, earlier careers follow →SAVE-19
- r10 261019 MATCH-1✎ one possession chain a minute→touch-by-touch halves plus added time, sides change only on events; MATCH-2✎ measured duel/summary error→both paths hold the target; MATCH-3✎ +fouls, cards, corners, offsides, minutes, substitutions, injuries; MATCH-5✎ +current-season post-match material, season heat maps; MATCH-6✎ extra-time/penalty outcome→extra time 2×15 and a kick-by-kick shootout; MATCH-8✎ profile tradeoffs→tactic behaviour, four presets only; MATCH-9✎ shared profile→the engine's attributes and behaviour; MATCH-11✎ zone pools, team pass/chance rates, tactic line and transition factors→per-action duels; MATCH-12✎ a minute's last duels with invented restarts→the engine's positions every touch, automatic pacing; MATCH-13✎ big chance band→0.30 xG or more, box band→penalty box, +8 spatial counters, season/career totals; MATCH-14+ 40-cell grid; MATCH-15+ tags; MATCH-16+ decision tables; MATCH-17+ off-ball movement; MATCH-18+ fouls, set pieces, offside; MATCH-19+ cards and suspensions; MATCH-20+ substitutions by era; MATCH-21+ in-match injuries; MATCH-22+ engine paths, 125% season budget; MATCH-23+ real-football bands; MATCH-24+ spatial commentary; MATCH-25+ post-match material; MATCH-26+ open: grid-only counters off the grid
- r9 261015 MATCH-2✎ average role rating→average 실효 OVR at the formation's slots, own players by adaptation, others by their club's 조직력; MATCH-8✎ MATCH-9✎ passing/defense/stamina→the named attributes (패스, 시야, 태클, 위치선정, 공중볼, 속도, 체력); MATCH-11✎ +attributes × slot level × adaptation in every duel, roles and play traits shift actions, +crosses and headers, FWD/MID/DEF→FW/MF/DF lines; MATCH-12✎ +players at their formation's positions
- r8 261012 MATCH-12✎ none→restart (throw-in, goal kick, corner) whenever possession changes sides between minutes without a duel, played on the pitch with the ball out of play and a taker; outcomes unchanged
- r7 261011 MATCH-2✎ +gap with diminishing returns, match-day form, context points on player skills; MATCH-11✎ +flattened duel margins, shot volume 1×→1.7× (cap 0.6→0.75), score effects, summary path on the shared chance model; MATCH-12✎ ball 32/55→48/84 u/s on curved, lofted flights that always land at a player, track every 0.2→0.1 s
- r6 261010 MATCH-2✎ +own manager style and vision home strength; MATCH-11✎ last passer always assists→solo runs unassisted, +tactic defensive lines, +high-regain transitions; MATCH-13+ advanced counters (key passes, xA, big chances, box shots, final-third passes, progressive passes, take-ons, high turnovers, PPDA, field tilt)
- r5 261009 MATCH-2✎ NPC strength by club rating and raw fatigue→every club by its XI, fatigue above 20 only, pressing NPC load; MATCH-5✎ +match xG in archives; MATCH-11✎ raw chance xG→level-average finisher and keeper xG
- r4 261009 MATCH-1✎ minute dice with an abstract actor→duel chain between named players; MATCH-5✎ +duel chain and cumulative xG for observed fixtures; MATCH-10✎ play/pause/speed/result row→pause/speed, live charts, primary action; MATCH-11+ player duel model with team-level resolution outside own/own-league fixtures; MATCH-12+ playback follows the chain with a fast ball
- r3 261008 MATCH-10+ stacked pitch panels and hidden mobile paces→compact match theatre, explicit detail/settings and lifecycle pause
- r2 261008 MATCH-8+ MATCH-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
