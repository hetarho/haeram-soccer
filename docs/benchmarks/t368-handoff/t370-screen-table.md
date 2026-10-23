# T370 screens (calibration round 51)

Each row is `scripts/t328-counter-roles.ts --variant base --partition calibration --round 51 --set all --per 60 --core 600 --gap 60` on T373's football with the levers of 1ed76714 / 573c4662 / 91bdfec7 (neutral by default) and the patch below; table by `t370-table.mts`. Readings are a team a match unless noted, [95%] intervals; ✗ outside, ~ unresolved or insufficient, no mark inside. MATCH-29 rows are mostly insufficient at 60 matches a pairing, so the screen reads press's, balanced's and possession's points only as a direction.

Settings (all candidate-only):

- (a) chance quality, `DECISION_CONFIG.candidate.shotQuality` {ref, power, most, upTo}: a box shot's weight × min(most, (chance xG / ref)^power) below `upTo` m. a05/a10/a20 power 0.5/1/2 (ref 0.15); a05u power 0.5 with upTo 99.5 (box band only); a05s power 0.5 with `shotScale` 0.39; a05us both; a03s power 0.3 with `shotScale` 0.4; q1 ref 0.3 power 1 most 1 (weak shots only); qm ref 0.3 power 0.5 most 1 with `shotScale` 0.45. k3: `candidate.cutBackShare` 0.3 (0.1 before); q1k3 both.
- (b) carries after reception, `DECISION_CONFIG.candidate.carry` {upTo, open, length}: unpressured below `upTo` m a carrier carries `open` × as often and `length` [base, spread] m. b12 [12, 8]; b18 [18, 8]; b12o [12, 8] open 1.5; b52 [12, 8] upTo 52.5; b9 [9, 6].
- (c) pressing in the build-up, `DUEL_CONFIG.candidate.intercept.share` by the defending tactic (failed passes from below 70 m; 0.07 before, taken from the loose balls): c15/c17/c22 uniform; ct possession 0.2, press 0.24, counter 0.12, balanced 0.16; ctac 0.18/0.2/0.16/0.18; c175 (validation only) 0.175/0.195/0.155/0.175.
The rows are in `t370-screen-rows.md` (`t370-table.mts --out`).

- combinations: h1 ctac + a03s; h2 h1 + b9; h3 ctac + qm + b9; h4 ctac + qm; h5 ctac + qm at power 0.4 and `shotScale` 0.44; h6 c175 + qm + `longShotScale` 3.5; h7 c175 + qm at `shotScale` 0.46 + `longShotScale` 3.2.

