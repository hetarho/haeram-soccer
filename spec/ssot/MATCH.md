# MATCH Observable match simulation
> r1 | Define the implemented browser-demo behavior for observable match simulation.

## decisions
- MATCH-1 [o] A match is 90 discrete simulated minutes; events and team/player counts share one seeded engine. Pitch playback does not change outcomes.
- MATCH-2 [o] Outcome factors include role attributes, club/manager quality, fatigue, home advantage, and the actually applied tactical preset.
- MATCH-3 [o] Provide possession, goals, assists, shots, shots on target, attempted/completed passes, tackles, interceptions, dribbles, saves, and player contributions.
- MATCH-4 [o] Display counts, denominators and defined ratios; no attempts means no defined percentage. Compare own match, season and career totals.
- MATCH-5 [o] Observed current fixtures expose event-backed positions, timeline and progressive statistics; historical matches retain outcomes and highlights, not frame traces.
- MATCH-6 [o] Cup ties resolve draws with an explicit extra-time/penalty outcome; all scores are settled once.
- MATCH-7 [o] Fast and observed processing use the same match seed and football result path; animation speed, selected view and browser clock cannot reroll results.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
