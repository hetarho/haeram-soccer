# MATCH Observable match simulation
> r6 | Define the implemented browser-demo behavior for observable match simulation.

## decisions
- MATCH-1 [o] A match is 90 discrete simulated minutes; each minute's possession plays as a chain of duels between named players (→MATCH-11). Events and team/player counts share one seeded engine. Pitch playback does not change outcomes.
- MATCH-2 [o] Outcome factors include role attributes, club/manager quality, fatigue, home advantage, and the actually applied tactical preset. ← the own club must play on the same terms as the clubs it meets
  - every club's strength is its actual starting XI: average role rating minus (fatigue − 20)/6 for fatigue above 20; clubs nobody owns add 4 for their unmodelled manager, the own club (manager ability − 50)/4, morale, its manager style's strength (→STAFF-14) and at home its build's home strength (→ECON-22).
  - fatigue up to 20 is ordinary match fitness and costs nothing in ratings, duels or tactic fit; only the excess weakens a player.
  - clubs nobody owns do not track fatigue match by match, so a pressing club's squad carries fatigue 32.
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
  - recorded xG is that chance's goal probability for the match level's average forward and keeper, so goals minus xG measures finishing and xGA minus goals against measures keeping.
  - player contributions record the actual passer, receiver, marker, shooter and keeper; in-match fatigue grows with minutes, faster for low stamina.
  - own-club fixtures and fixtures whose players are recorded (own-league scorers) play the duel chain; every other fixture resolves with the same team formula without named players. ← a world season simulates about 10,000 fixtures; duels everywhere cost about five times the time
  - both paths keep goals per match within 20% of each other at every tier, and a fixture always takes the same path whether observed or not.
- MATCH-12 [o] Observed playback follows the recorded duel chain: passes fly to the recorded receiver, interceptions and tackles go to the recorded marker, shots leave at their recorded moment. The ball travels about 5–10 times faster than players (passes about 32, shots about 55 pitch units per second against a 5.8 player maximum) and its track is sampled every 0.2 simulated seconds.

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
- r6 261010 MATCH-2✎ +own manager style and vision home strength; MATCH-11✎ last passer always assists→solo runs unassisted, +tactic defensive lines, +high-regain transitions; MATCH-13+ advanced counters (key passes, xA, big chances, box shots, final-third passes, progressive passes, take-ons, high turnovers, PPDA, field tilt)
- r5 261009 MATCH-2✎ NPC strength by club rating and raw fatigue→every club by its XI, fatigue above 20 only, pressing NPC load; MATCH-5✎ +match xG in archives; MATCH-11✎ raw chance xG→level-average finisher and keeper xG
- r4 261009 MATCH-1✎ minute dice with an abstract actor→duel chain between named players; MATCH-5✎ +duel chain and cumulative xG for observed fixtures; MATCH-10✎ play/pause/speed/result row→pause/speed, live charts, primary action; MATCH-11+ player duel model with team-level resolution outside own/own-league fixtures; MATCH-12+ playback follows the chain with a fast ball
- r3 261008 MATCH-10+ stacked pitch panels and hidden mobile paces→compact match theatre, explicit detail/settings and lifecycle pause
- r2 261008 MATCH-8+ MATCH-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
