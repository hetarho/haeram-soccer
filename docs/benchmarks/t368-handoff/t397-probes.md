# T397 probes

## Where the attacking counters come from (t397-probe.mts, calibration round 57, 200 core matches, a team a match, counting-fixed base)

```
core, 200 matches, a team a match
after:carry out of box 0.070
after:carry within box 9.008
after:fouled           0.040
after:lost: tackled    1.242
after:other side passed 0.022
after:pass out of box  7.545
after:pass within box  4.130
after:restart corner   0.063
after:restart dropBall 0.003
after:restart freeKick 0.043
after:restart kickoff  0.018
after:restart throwIn  0.003
after:shot             3.660
box:carry              14.752
box:cross              2.640
box:onside             2.360
box:past               6.093
carries                125.035
carries:progressive    40.932
f3:attempts            165.015
f3:back                27.685
f3:band5               126.953
f3:band6               29.532
f3:band7               8.530
f3:forward             15.965
f3:lateral             121.365
front:carry            7.813
front:onside           45.498
front:past             9.502
receptions:past        33.725
restartPasses          38.563
xt:carry               1.987
xt:cross               0.362
xt:onside              1.251
xt:past                0.829
```

## Offside by 판단력 under the kept setting (t384-probe.mts, validation round 57, 2,400 core matches)

```
core:equal-top-tier validation r57: 2400 matches (41 s), patch {"decide":{"candidate":{"firstTouch":{"carry":6,"pressure":1},"cutBackShare":0.5,"through":{"score":2.0},"past":{"prior":1,"through":0.5}}},"restart":{"offside":{"candidate":{"base":0.05}}}}
  grid: offsides a team 1.847; receptions from an offside position a team 35.86, called 5.15% [5.05, 5.25]
  grid raw 판단력 quarters (cutoffs 61 / 67 / 72): Q1 8.72% [8.45, 8.98] of 43676; Q2 5.53% [5.33, 5.74] of 48313; Q3 3.58% [3.40, 3.76] of 41746; Q4 2.32% [2.17, 2.47] of 38404; lowest ÷ highest 3.76
  grid quarters of 판단력 at the draw (cutoffs 42.4 / 54.0 / 65.1): Q1 6.91% [6.67, 7.15] of 43035; Q2 6.03% [5.80, 6.25] of 43035; Q3 4.53% [4.33, 4.73] of 43034; Q4 3.13% [2.97, 3.30] of 43035; lowest ÷ highest 2.21 (mean chance 6.94 / 5.87 / 4.46 / 3.16%, ratio 2.20)
  grid 판단력 on the duels' scale at the draw: 28.4 / 42.4 / 54.0 / 65.1 / 74.7 (10/25/50/75/90%)
  grid linebreaker 1.74% [1.60, 1.88] of 33904, others 5.99% [5.86, 6.11]; share of calls by raw 판단력 quarter (cutoffs 61 / 67 / 72) 43.0 / 30.1 / 16.9 / 10.0%
  aggregate: offsides a team 1.825; share of calls by raw 판단력 quarter 43.7 / 29.2 / 17.0 / 10.1%
  throughBalls: outside [2, 2.2] 0.81 (0.77–0.85)
  throughBallsCompleted: inside [0.6, 0.85] 0.67 (0.63–0.70)
  grid core 35/38 inside
    unresolved   shotsGoalArea: 8.956 [8.733, 9.178] band 6–9
    inside       offsides: 1.847 [1.796, 1.898] band 1.7–1.9
    unresolved   setPieceGoals: 20.424 [19.454, 21.394] band 20–28
    outside      goalsFW: 61.272 [60.051, 62.493] band 50–60
```
