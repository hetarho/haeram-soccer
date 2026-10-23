# T384 screens (calibration round 56, same seeds)

Base is T371's football (20da1ea2): `isOffside`'s linear rule, 0.03 − (판단력 − 60)/360 − linebreaker
0.1 + high line 0.05 clamped to [0.012, 0.7]. Each grid setting is the candidate-only ratio rule of
`RESTART_CONFIG.offside.candidate`: `base` × e^((60 − 판단력)/`decisions`) × linebreaker 0.3 × high
line 1.6, clamped to [0.002, 0.6], where 판단력 is the receiver's duel-scale skill the call reads
(his attribute at the slot with the day's shift and his drain, →MATCH-11).

Sizes: grid `t328-counter-roles.ts --set all --per 60 --core 600 --gap 60` (core 600, pairings
960, gap 960); offside readings pool core and pairings (`t384-table.mts`), the MATCH-23 row reads
core alone. Aggregate `t384-aggregate.mts --count 2400` on the same core fixtures.

| setting | grid patch | calls a team (core + pairings / core) | receptions from an offside position a team | call rate | duel-scale 판단력 quarter: lowest / highest [95%] | own 판단력 quarter: lowest / highest [95%] | linebreakers called |
|---|---|---|---|---|---|---|---|
| base | – | 1.631 / 1.644 | 32.64 | 5.00% | 10.9% / 1.3% = 8.53 [7.62, 9.55] | 7.1% / 3.6% = 2.01 [1.86, 2.17] | 1.33% |
| s1 | base 0.04, decisions 30 | 1.823 / – | 32.49 | 5.61% | 11.7% / 2.1% = 5.44 [4.98, 5.96] | 7.1% / 4.5% = 1.57 [1.46, 1.69] | 1.68% |
| s2 | base 0.0272, decisions 20 | 1.798 / 1.925 | 32.62 | 5.51% | 14.5% / 1.2% = 12.27 [10.92, 13.78] | 7.5% / 4.4% = 1.70 [1.58, 1.83] | 1.41% |
| s3 | base 0.048, decisions 40 | 1.876 / – | 32.46 | 5.78% | 10.3% / 3.0% = 3.44 [3.18, 3.73] | 7.0% / 5.0% = 1.41 [1.32, 1.52] | 1.78% |

Predicted from s1's joint tally (`t384-table.mts --predict`, the same receptions under another
setting; s1's own prediction 1.835 against 1.823 measured): decisions 10 at base 0.02 gives 3.80
calls a team and an own-판단력 ratio of only 1.94, decisions 15 at 0.022 gives 2.14 and 1.72,
decisions 45 at 0.045 gives 1.70 and a duel-scale ratio of 3.12.

The own 판단력 is a weak proxy of the skill the call reads: even a rule that puts 39% of the lowest
duel-scale quarter's receptions offside leaves the own-attribute ratio under 2, because a receiver's
slot level, the match level and his drain spread the duel-scale value as much as his attribute does.
The quarter measure of MATCH-18 r21 is therefore read on the duel scale; the own-attribute ratio is
listed as context.

Calls by own-판단력 quarter (the grid receivers' quarters, lowest … highest) and the aggregate on the
same quarters:

| setting | grid | aggregate | aggregate offsides a team | largest cumulative gap |
|---|---|---|---|---|
| base (aggregate `pace`, offside 0.06/0.3) | 36.4 / 26.5 / 22.2 / 14.9% | 26.1 / 22.7 / 28.2 / 23.1% | 1.709 | 14.2 pp |
| s2 with aggregate inverse 판단력 power 8, offside 0.0632/0.316 | 34.7 / 24.9 / 24.0 / 16.5% | 35.3 / 23.1 / 26.3 / 15.3% | 1.804 | 1.2 pp |
| s3 with aggregate power 4 | 31.1 / 26.6 / 24.3 / 18.1% | 32.0 / 24.1 / 26.0 / 17.9% | 1.804 | 1.5 pp |

The aggregate's role weight does not move its draws (the same 1.804 at powers 4 and 8): only the
attribution moves.

Validated: s2's slope with base 0.0255 (core 1.925 × 0.0255/0.0272 ≈ 1.80), with the aggregate's
power 8 and offside shares 0.0632/0.316.
