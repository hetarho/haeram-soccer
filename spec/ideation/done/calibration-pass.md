# IDEATION calibration-pass
> st:converted@261113 | Bring the released model's football to its measured targets, with no own-club edge in either direction.

## vision
- Problem (owner, 261026): ideation/own-club-match-edge was converted by autopilot q7m3 (choice C, MATCH r32, match-model revision 3, T466) without the owner, and T467 still measures the own club about 0.8 points a match below MATCH-2's curve at the founding's tier 4 on the detailed engine. T410's gameplay read named five follow-ups that wait for "the owner's calibration pass", which the owner had not heard of.
- Target: the owner, as the person who judges whether the world plays like football.
- Core value: the own club wins and loses exactly as the same strength would anywhere in the world, and league football looks like real football.

## explored
- [o] An own-club edge, for or against, must never appear; the rule is met when the measured figures match the targets ← owner 261026: "우리 팀 유리함 문제는 절대 나오면 안 되니까 결국 측정값만 맞으면 돼"; the target is MATCH-2's strength → outcome curve, which every club already shares
  - The owner's acceptance is the measurement, not a particular mechanism: revision 3's symmetric context (T466) stays only if the measured figures hold.
  - T467 (261026, revision 3, one 10-season world, 10 seeds a fixture): at the founding (1960 tier 4, prepared gap +12.2) the detailed engine gives the own club 1.52 points a match against the curve's 2.15 and stays flat from gap +5 to +20 (1.43–1.64); the aggregate path gives 2.33; at the top tier the own club sits on the curve (1.53 / 1.56 v 1.46). About 90% of T434's −0.9 remains, at tier 4. Suggested lever: the detailed engine's dependence on the tier.
- [x] T410's five follow-ups (261026, released model revision 2, indicative sizes: one 1950 ENG founding, 10 seasons, 80 observed detailed fixtures), each a place where the football looks wrong (below) ← two-path engine removed (T838–T845): every fixture now settles on one aggregate path (MATCH-1/22), held to MATCH-2's curve and MATCH-23/29/30's bands under MATCH-28's registry, so these revision-2 readings of two paths no longer describe any match
  - The detailed engine (own matches) scores too much: 3.39 goals, 3.33 xG and 29.9 shots a match, with its set-piece and headed share.
  - The aggregate path (other clubs) has a heavy margin tail: an 11–12 goal margin every season.
  - Home advantage and draws: home / draw / away 43.7 / 21.2 / 35.2%.
  - Top-club strength spread: champions average 2.32 points a match (max 2.88) and lead the runner-up by 10 or more in 22 of 80 league-seasons, so title races end early.
  - The detailed engine's counts of passes (819 a match), offsides, goal kicks and throw-ins.

## shape
- flow: (to settle) which gaps first → tune → re-measure against the targets
- v1: (to settle)
- Order of the follow-ups and the own-club gap (open until archive): replaced by T840's verdict on the released one-path model, `artifacts/benchmarks/scripted-model-calibration/README.md` (a): 608 own league fixtures beside the same league's other fixtures at the same prepared gaps, no row differs from clubs that play the same tactic and no own-club term reads differently from MATCH-2. Calibration continues from that README on the released model (MATCH-28: residual differences recorded and calibrated there).
- How large a measurement counts as matching (open until archive): MATCH-28's versioned registry fixes sample sizes, tolerances and 95% intervals before tuning; equivalence needs the interval inside the margin, and insufficient evidence is reported as such, never a pass.
- Revision 3's named-manager context (open until archive): kept in MATCH-2: every club adds (manager ability − 50)/4, a club nobody owns its named manager (STAFF-17), morale neutral at 60.
- Archived 261113: the two-path world this pass assumed was removed by T838–T845; MATCH-2/22/28 now hold every club, the own club's included, on one aggregate path and one registry, and calibration of that path continues from T840's verdict.

## domains
- [o] MATCH: MATCH-2 (the strength → outcome curve for every club, own included), MATCH-23 (football bands on both paths), MATCH-28 (parity of the two paths), MATCH-29/30 as the follow-ups touch them; after T838–T845 carried on one result path by MATCH-2/22/28 →MATCH

## open
- -
