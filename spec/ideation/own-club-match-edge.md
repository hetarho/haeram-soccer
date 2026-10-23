# IDEATION own-club-match-edge
> st:open@261023 | Our club should win only what its squad, manager and circumstances earn; on equal terms it should score like any other club of the same strength.

## vision
- Problem (owner, 261023, from a 1950–1995 쉬움 career): a squad of OVR ~78–82 keeps winning 1부 titles against rivals shown at 98–102. The owner asked why a weaker side beats far stronger ones season after season.
- Target: players who build a club over decades; a title should feel earned, and a 98–102 rival should be a real obstacle.
- Core value: strength numbers the owner sees predict results the same way for our club and for every other club.

## explored
- [o] Measured on the owner's save (1995/96, round 23, 1부, OVR 82 v rivals 72–99 at the XI, manager 지도력 83 게겐프레싱, 사기 89): our 19 remaining league fixtures replayed 40 times each by seed ← evidence before choosing a direction
  - own matches on the detailed engine (as played): 2.51 points a match (~95 a 38-round season), W/D/L 80/11/9
  - the same fixtures on the probabilistic path other clubs play: 1.70 (~65)
  - manager and morale set to what other clubs get (context +4): detailed 2.06 (~78), probabilistic 1.35 (~51)
  - 지도력 50 and 사기 60: detailed 1.84 (~70)
  - a rival of equal XI (Bristol Harbour, 82) has 21 points from 19 rounds this season (14th)
- [o] Two separate causes ← each moves results on its own
  - engine path: the same strengths give ~0.7–0.8 points a match more on the detailed engine than on the probabilistic one (~30 points a season)
  - one-sided context: our club adds (지도력 − 50)/4 + (사기 − 60)/10 (+11.2 here) while every other club adds a flat 4, so other clubs' managers and morale never count (~+0.45 points a match here)
- [x] Treat it as part of 쉬움 ← WEB-3: difficulty sets only the start; every rule is the same at every level
- [?] A: parity — on equal inputs our fixtures produce the same outcome curve as other clubs' fixtures (calibrate one path to the other, or play both on one path)
- [?] B: symmetric context — other clubs' match context from their own manager's ability and their morale, on the same formula as ours
- [?] C: both A and B
- [?] D: keep the edge but show it — the owner sees "expected strength" including manager/morale/engine so 82 v 99 is not misleading (does not fix balance)

## shape
- flow: measure on the candidate model too → choose A/B/C → update MATCH/CLUB rules → recalibrate → re-measure on this save and reference careers
- v1: equal-terms parity of results and symmetric match context / not: changing difficulty levels, changing how strong NPC clubs are generated

## domains
- MATCH: parity of own and other fixtures' outcome curve (MATCH-2 curve, MATCH-22 paths)
- CLUB / STAFF: match context from manager ability and morale for every club (morale or a proxy for clubs nobody owns)
- LEAGUE: title-rate expectations for reference careers (how often a dominant club should win)

## open
- Does the candidate model (MATCH_MODEL_RELEASE, T286, aggregate path for other fixtures) already close the engine gap? Re-run the same probe on the candidate before choosing.
- With A, which path is the reference: the detailed engine's football or the probabilistic curve's results?
- With B, what is "morale" for a club nobody owns — form over its last matches, a fixed baseline, or none?
- How often should a club that is genuinely the strongest win its league (a target band for reference careers)?
- Reproduce: decode a save with `decode` from `apps/web/src/adapters/persistence.ts`, then for each unplayed own league fixture set `w.seed` to `<seed>:probe<i>` and call `simulateMatch` (detailed) or `summaryMatch(prepareMatch(w, f))` (probabilistic; not exported, needs a temporary export).
