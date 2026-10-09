# MATCH Observable match simulation
> r4 | Define the implemented browser-demo behavior for observable match simulation.

## decisions
- MATCH-1 [o] A match is 90 discrete simulated minutes; each minute's possession plays as a chain of duels between named players (→MATCH-11). Events and team/player counts share one seeded engine. Pitch playback does not change outcomes.
- MATCH-2 [o] Outcome factors include role attributes, club/manager quality, fatigue, home advantage, and the actually applied tactical preset.
- MATCH-3 [o] Provide possession, goals, assists, shots, shots on target, attempted/completed passes, tackles, interceptions, dribbles, saves, and player contributions.
- MATCH-4 [o] Display counts, denominators and defined ratios; no attempts means no defined percentage. Compare own match, season and career totals.
- MATCH-5 [o] Observed current fixtures expose event-backed positions, the duel chain, cumulative xG per minute, timeline and progressive statistics; historical matches retain outcomes and highlights, not frame traces or xG.
- MATCH-6 [o] Cup ties resolve draws with an explicit extra-time/penalty outcome; all scores are settled once.
- MATCH-7 [o] Fast and observed processing use the same match seed and football result path; animation speed, selected view and browser clock cannot reroll results.

- MATCH-8 [o] The four tactics have roster and opponent tradeoffs: possession uses midfield passing but fewer direct shots; counter uses defense/forwards and gains against press but sacrifices possession; press uses stamina and freshness to force chances at higher fatigue cost; balanced retains defensive stability. Shared engine profiles expose fit rather than guaranteed win probabilities.

- MATCH-9 [o] Midfield passing affects possession and pass completion; defender quality suppresses opposing shot creation; stamina and fatigue limit press effectiveness. The same profile and opponent tactic calculation serves simulation and pre-match UI.

- MATCH-10 [o] Mobile observation keeps score, pitch, latest event, pause/speed, live charts and the primary action visible together, including empty, live, finished, replay and new-match states. Stats, timeline, player inspection and full post-match league context open explicitly; presentation choices never reroll settled facts.

- MATCH-11 [o] Player duels decide every action; team rates stay anchored to the tactical profile so MATCH-8/9 hold. ← individual players matter without losing the calibrated tactic tradeoffs
  - the minute's possession side and its pass volume, base pass accuracy and chance rate keep the team formula (strength, home, manager, morale, profile modifiers).
  - pass: passer passing vs the marker from the opposing line facing that zone (FWD in build-up, MID in midfield, DEF in the final third), with in-match fatigue; a failed pass is intercepted by that marker or recovered as a loose ball.
  - dribble: carrier attack and pace vs marker defense; failure is a tackle by the marker.
  - shot: shooter weighted by role and attack; chance type (big chance, box, long range) sets xG; blocker defense, shooter attack and keeper skill split goal, save, block and miss; the last passer earns the assist.
  - player contributions record the actual passer, receiver, marker, shooter and keeper; in-match fatigue grows with minutes, faster for low stamina.
  - own-club fixtures and fixtures whose players are recorded (own-league scorers) play the duel chain; every other fixture resolves with the same team formula without named players. ← a world season simulates about 10,000 fixtures; duels everywhere cost about five times the time
  - both paths keep goals per match within 20% of each other at every tier, and a fixture always takes the same path whether observed or not.
- MATCH-12 [o] Observed playback follows the recorded duel chain: passes fly to the recorded receiver, interceptions and tackles go to the recorded marker, shots leave at their recorded moment. The ball travels about 5–10 times faster than players (passes about 32, shots about 55 pitch units per second against a 5.8 player maximum) and its track is sampled every 0.2 simulated seconds.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r4 261009 MATCH-1✎ minute dice with an abstract actor→duel chain between named players; MATCH-5✎ +duel chain and cumulative xG for observed fixtures; MATCH-10✎ play/pause/speed/result row→pause/speed, live charts, primary action; MATCH-11+ player duel model with team-level resolution outside own/own-league fixtures; MATCH-12+ playback follows the chain with a fast ball
- r3 261008 MATCH-10+ stacked pitch panels and hidden mobile paces→compact match theatre, explicit detail/settings and lifecycle pause
- r2 261008 MATCH-8+ MATCH-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
