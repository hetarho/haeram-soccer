# IDEATION own-club-match-edge
> st:converted@261026 | Our club should win only what its squad, manager and circumstances earn; on equal terms it should score like any other club of the same strength.

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
- [o] Re-measured on the released model (T434, 261026, `scripts/own-edge-probe.ts`): a 1950 쉬움 ENG founding (seed `own-edge`) simulated 10 seasons on match model `continuous-aggregate-2`, then its 1960 lower-league season's 30 own league fixtures replayed 10 times each by seed (300 matches a variant, 317 s in all) ← indicative only: low-OVR amateur football, not the 1995/96 OVR-82 top-tier save of 261023, and 300 matches resolve about ±0.1 points a match
  - inputs: own XI 41 v opponents 31 (25–36); manager 지도력 35 without a style, 사기 53, so the own context is −4.45 against the flat +4 every other club adds; effective gap about +1.5 as played and +10 neutral
  | variant | points a match (W/D/L %) | 261023 pre-feature |
  |---|---|---|
  | detailed engine, as played | 1.09 (25.3/32.7/42.0), goals 0.86–1.18 | 2.51 |
  | aggregate path other clubs play | 1.99 (58.3/23.7/18.0), goals 1.89–0.83 | 1.70 |
  | detailed, context +4 | 1.46 (36.7/35.7/27.7), goals 1.08–0.92 | 2.06 |
  | aggregate, context +4 | 2.44 (75.7/17.0/7.3), goals 2.46–0.56 | 1.35 |
  - engine path: still the larger cause but reversed — the detailed engine now gives the own club about 0.9 points a match less than the aggregate path on the same strengths (−0.90 as played, −0.98 neutral), where it gave 0.7–0.8 more before
  - one-sided context: still moves results by about 0.4 points a match (detailed +0.37, aggregate +0.45 when set to +4); its sign follows the own manager and morale — a 지도력 35 founding manager costs the own club here, a 지도력 83 manager helped it on the 1995 save
  - against MATCH-2's target (Elo, 16 a rating point, venues pooled) the expected scores would be about 0.53 as played and 0.72 neutral; the detailed engine gives 0.42 / 0.55 and the aggregate 0.70 / 0.84, so the two paths miss the curve on opposite sides rather than one holding it (a rough read that takes the shown XI ratings as the match strengths)
- [o] Recommendation (T434): C, both A and B ← both causes still move results on the released model; the engine gap only changed direction, so fixing context alone (B) or the path alone (A) leaves a ~0.4–0.9 point a match difference the owner cannot see; with A, calibrate both paths to MATCH-2's curve instead of one to the other, since on this read neither holds it. The choice stays with the owner.
- [x] Treat it as part of 쉬움 ← WEB-3: difficulty sets only the start; every rule is the same at every level
- [o] C: both A and B → MATCH r32 (MATCH-2), T466 (B as match-model revision 3), T467 (A: the own club's curve on revision 3 against MATCH-2's) ← T434: both causes still move results, so either alone leaves a gap the owner cannot see
  - B: a club nobody owns takes its named manager's ability (→STAFF-17) on the own club's formula, morale neutral (60) since it tracks none; manager styles stay own-only (→STAFF-14)
  - A: no path is the reference; both hold MATCH-2's curve, the own club's fixtures included; the tuning itself joins the calibration pass the owner orders (261026)
- [x] A alone: parity — on equal inputs our fixtures produce the same outcome curve as other clubs' fixtures ← leaves the one-sided context, about 0.4 points a match
- [x] B alone: symmetric context — other clubs' match context from their own manager's ability and their morale ← leaves the engine-path gap, about 0.9 points a match
- [x] D: keep the edge but show it — the owner sees "expected strength" including manager/morale/engine so 82 v 99 is not misleading ← does not fix balance

## shape
- flow: measure on the candidate model too → choose A/B/C → update MATCH/CLUB rules → recalibrate → re-measure on this save and reference careers
- v1: equal-terms parity of results and symmetric match context / not: changing difficulty levels, changing how strong NPC clubs are generated

## domains
- MATCH: parity of own and other fixtures' outcome curve (MATCH-2 curve, MATCH-22 paths)
- CLUB / STAFF: match context from manager ability and morale for every club (morale or a proxy for clubs nobody owns)
- LEAGUE: title-rate expectations for reference careers (how often a dominant club should win)

## open
- Does the reversed engine gap hold on a top-tier career with OVR near MATCH-23's equal top-tier sides? T434 read only 1960 amateur football (T467 reads a top-tier club).
- How often should a club that is genuinely the strongest win its league (a target band for reference careers)?
- Reproduce: `pnpm exec tsx scripts/own-edge-probe.ts --seeds 10 --seasons 10 --out <file.json>` (a cached 10-season world; each fixture with `w.seed = <seed>:probe<i>` on `simulateMatch` or `simulateAggregate`); for a save, `decode` from `apps/web/src/adapters/persistence.ts` gives the world instead.
