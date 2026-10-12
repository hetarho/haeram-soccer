# MATCH Observable match simulation
> r8 | Define the implemented browser-demo behavior for observable match simulation.

## decisions
- MATCH-1 [o] A match is 90 discrete simulated minutes; each minute's possession plays as a chain of duels between named players (→MATCH-11). Events and team/player counts share one seeded engine. Pitch playback does not change outcomes.
- MATCH-2 [o] Outcome factors include role attributes, club/manager quality, fatigue, home advantage, and the actually applied tactical preset. ← the own club must play on the same terms as the clubs it meets
  - every club's strength is its actual starting XI: average role rating minus (fatigue − 20)/6 for fatigue above 20; clubs nobody owns add 4 for their unmodelled manager, the own club (manager ability − 50)/4, morale, its manager style's strength (→STAFF-14) and at home its build's home strength (→ECON-22).
  - fatigue up to 20 is ordinary match fitness and costs nothing in ratings, duels or tactic fit; only the excess weakens a player.
  - clubs nobody owns do not track fatigue match by match, so a pressing club's squad carries fatigue 32.
  - a strength gap counts with diminishing returns (gap / ⁴√(1 + (gap/24)⁴): 20→18.1, 30→22.0, 40→23.3); each side then adds its match-day form, a seeded fat-tailed draw (sd 7, within ±21) from a stream of its own, so watched and unwatched runs agree. ← even a far stronger side has bad days; a +20 favourite wins about 79%, draws 14% and loses 7%, as in real league data
  - home, manager and morale points and the form move every player's skills too (half the difference between the sides to each), so a strength point counts the same wherever it comes from.
  - calibration target: Elo with 16 Elo per rating point (docs/CALIBRATION.md); measured 261011 the mean absolute error is 1.9 points (duel) and 1.6 (summary) across gaps −10 to +40, a +20 club wins the league 2.48 points per game and goes unbeaten in 7% of seasons.
- MATCH-3 [o] Provide possession, goals, assists, shots, shots on target, attempted/completed passes, tackles, interceptions, dribbles, saves, and player contributions.
- MATCH-4 [o] Display counts, denominators and defined ratios; no attempts means no defined percentage. Compare own match, season and career totals.
- MATCH-5 [o] Observed current fixtures expose event-backed positions, the duel chain, cumulative xG per minute, timeline and progressive statistics; historical matches retain outcomes, highlights and each side's match xG (from rules 1.5.0), not frame traces.
- MATCH-6 [o] Cup ties resolve draws with an explicit extra-time/penalty outcome; all scores are settled once.
- MATCH-7 [o] Fast and observed processing use the same match seed and football result path; animation speed, selected view and browser clock cannot reroll results.

- MATCH-8 [o] The four tactics have roster and opponent tradeoffs: possession uses midfield passing but fewer direct shots; counter uses defense/forwards and gains against press but sacrifices possession; press uses stamina and freshness to force chances at higher fatigue cost; balanced retains defensive stability. Shared engine profiles expose fit rather than guaranteed win probabilities.

- MATCH-9 [o] Midfield passing affects possession and pass completion; defender quality suppresses opposing shot creation; stamina and fatigue limit press effectiveness. The same profile and opponent tactic calculation serves simulation and pre-match UI.

- MATCH-10 [o] Mobile observation keeps score, pitch, latest event, pause/speed, live charts and the primary action visible together, including empty, live, finished, replay and new-match states. Stats, timeline, player inspection and full post-match league context open explicitly; presentation choices never reroll settled facts.

- MATCH-11 [o] Player duels decide every action; team rates stay anchored to the tactical profile so MATCH-8/9 hold. ← individual players matter without losing the calibrated tactic tradeoffs
  - the minute's possession side and its pass volume, base pass accuracy and chance rate keep the team formula (strength, home, manager, morale, profile modifiers).
  - pass: passer passing vs the marker from the opposing line facing that zone (FWD in build-up, MID in midfield, DEF in the final third), with in-match fatigue; a failed pass is intercepted by that marker or recovered as a loose ball.
  - dribble: carrier attack and pace vs marker defense; failure is a tackle by the marker.
  - shot: shooter weighted by role and attack; chance type (big chance, box, long range) sets its quality; blocker defense, shooter attack and keeper skill split goal, save, block and miss; the last completed pass before the shot is the key pass and earns the assist, unless the shooter beat his marker alone (then the shot is unassisted).
  - each tactic defends a line: pass success taken off the opponent in its own two thirds / in our final third: balanced 0/0, possession 2/0, counter −3/3.5, press 7/0 percentage points. ← pressing must show as a lower PPDA and more high turnovers, a low block as the opposite
  - a minute that starts with the ball just won in the opponent's third (a transition) has 1.25× the chance rate and 15 points more big-chance share.
  - key duels, big-chance share and finishing against the keeper use margins that flatten past about 15 points (30 × tanh(margin/30)); chances come at 1.7× the team rate (at most 0.75 a minute), about 12 shots a side at 0.12 xG each.
  - score effects: per goal of lead (up to two) the leading side gives up 5 points of possession and creates 20% less from what it keeps.
  - the team-level path uses the same chance model (shooter, creator, defender, key duel, finishing) and skips only the pass-by-pass build-up.
  - recorded xG is that chance's goal probability for the match level's average forward and keeper, so goals minus xG measures finishing and xGA minus goals against measures keeping.
  - player contributions record the actual passer, receiver, marker, shooter and keeper; in-match fatigue grows with minutes, faster for low stamina.
  - own-club fixtures and fixtures whose players are recorded (own-league scorers) play the duel chain; every other fixture resolves with the same team formula without named players. ← a world season simulates about 10,000 fixtures; duels everywhere cost about five times the time
  - both paths keep goals per match within 20% of each other at every tier, and a fixture always takes the same path whether observed or not.
- MATCH-12 [o] Observed playback follows the recorded duel chain: passes fly to the recorded receiver, interceptions and tackles go to the recorded marker, shots leave at their recorded moment. ← a ball that stops in open space and then jumps to an opponent reads as a bug, not football
  - speed: passes about 48, turnovers 44, restarts 60, shots 84 pitch units per motion second (cap 100) against a 5.8 player maximum; a kick starts fast and slows a little.
  - flight: a quadratic curve from launch to landing whose sideways bend grows with distance; passes of 18+ units rise with distance (up to 9, about 30% of long balls driven low), shots stay low; bend and height come from the motion stream only.
  - every open-play flight ends at a player: a pass re-aims each step at where its receiver will be; the interceptor steps into the passing lane and the ball bends to him; a tackler closes the carrier down and pokes the ball off his feet (a far-off recorded tackler gets a heavy touch instead); loose balls bounce to the teammate who recovers them; only kickoffs, goal kicks, throw-ins and corners rest on their spot.
  - the ball never passes to the other side without a duel: when a minute's possession goes to the side that did not end the last one with the ball, the chain opens with a restart — the ball went out off the last holder: after a shot behind off the keeper or a defender (corner), from the final third over the byline (goal kick), anywhere else over a touchline (throw-in); about 27 throw-ins, 7 goal kicks (plus those after shots wide) and 12 corners a match. ← a ball that leaves our forward for an opponent with no tackle reads as a pass to them
  - restarts are chosen from where the ball was, never drawn: results, counts and archives stay as they were.
  - on the pitch the ball runs out over the line, the keeper (goal kick) or the nearest teammate (throw-in, corner) walks to it for at most 0.9 s, and it is thrown (36 u/s, a low arc), crossed or kicked to the recorded player; a minute that opens with a restart shows it and its last three duels.
  - the next recorded duel waits until the ball has been received; the track records ground position and height every 0.1 motion seconds and the renderer draws the ball above its shadow, up to 35% larger when high.

- MATCH-13 [o] Every own-club match records advanced counters for both sides and every own player (rules 1.6.0); older matches stay without them and are labelled as such, never zero-filled. ← xG, xA, key passes and final-third passing are what football fans compare
  | counter | definition in this engine |
  |---|---|
  | key pass | last completed pass before a shot (assists included) |
  | xA | the xG of the shots a player's key passes set up |
  | big chance | a shot from the big-chance band; scored ones counted separately |
  | box shot | big-chance or box-band shot |
  | final-third pass | pass attempt that starts in the attacking third, and its completions |
  | progressive pass | completed pass into a higher zone |
  | take-on | attempted dribble past a marker (dribbles = successful ones) |
  | high turnover | ball won while the opponent had it in its defensive third |
  | PPDA | opponent pass attempts in its own two thirds ÷ own tackles+interceptions there |
  | field tilt | own final-third passes ÷ both sides' final-third passes |
  - a match carries detail for every saved player or for none; key passes ≤ shots, completions ≤ attempts, big chances scored ≤ big chances ≤ box shots, take-ons ≥ dribbles.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r8 261012 MATCH-12✎ none→restart (throw-in, goal kick, corner) whenever possession changes sides between minutes without a duel, played on the pitch with the ball out of play and a taker; outcomes unchanged
- r7 261011 MATCH-2✎ +gap with diminishing returns, match-day form, context points on player skills; MATCH-11✎ +flattened duel margins, shot volume 1×→1.7× (cap 0.6→0.75), score effects, summary path on the shared chance model; MATCH-12✎ ball 32/55→48/84 u/s on curved, lofted flights that always land at a player, track every 0.2→0.1 s
- r6 261010 MATCH-2✎ +own manager style and vision home strength; MATCH-11✎ last passer always assists→solo runs unassisted, +tactic defensive lines, +high-regain transitions; MATCH-13+ advanced counters (key passes, xA, big chances, box shots, final-third passes, progressive passes, take-ons, high turnovers, PPDA, field tilt)
- r5 261009 MATCH-2✎ NPC strength by club rating and raw fatigue→every club by its XI, fatigue above 20 only, pressing NPC load; MATCH-5✎ +match xG in archives; MATCH-11✎ raw chance xG→level-average finisher and keeper xG
- r4 261009 MATCH-1✎ minute dice with an abstract actor→duel chain between named players; MATCH-5✎ +duel chain and cumulative xG for observed fixtures; MATCH-10✎ play/pause/speed/result row→pause/speed, live charts, primary action; MATCH-11+ player duel model with team-level resolution outside own/own-league fixtures; MATCH-12+ playback follows the chain with a fast ball
- r3 261008 MATCH-10+ stacked pitch panels and hidden mobile paces→compact match theatre, explicit detail/settings and lifecycle pause
- r2 261008 MATCH-8+ MATCH-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
