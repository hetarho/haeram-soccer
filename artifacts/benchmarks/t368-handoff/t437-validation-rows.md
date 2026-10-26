# T437 validation rows

Validation round 68 (`--partition validation --round 68 --per 600 --core 2400 --gap 600`, 21,600 matches a run; vbase is a7135c1f, vC the kept setting), read with `t437-table.mts`.

| setting | core | MATCH-30 | MATCH-29 | invalid | goals | xG (team) | shots | on target % | xG per shot | goal area % | headed goals % | set-piece goals % | tackles+interceptions | interceptions | PPDA | high turnovers | final-third passes | box entries | front-of-box entries | xT | progressive carries | offsides | passes | completion % | cross completion % | ball in play | MATCH-29 outside | curve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| vbase | 21/38 | 6/23 | 15/25 | 0 | 2.96 [2.89, 3.03]~ | 1.476 | 14.83 [14.70, 14.96]✗ | 24.2 [23.9, 24.5]✗ | 0.100 [0.098, 0.101] | 12.9 [12.6, 13.2]✗ | 5.8 [5.3, 6.4]✗ | 9.3 [8.6, 10.0]✗ | 23.2 [23.1, 23.3] | 7.79 | 18.21 [18.06, 18.35]✗ | 5.91 [5.81, 6.01] | 145.2 [144.5, 145.8]✗ | 32.2 [31.9, 32.4]✗ | 73.8 [73.3, 74.3]✗ | 5.58 [5.54, 5.62]✗ | 62.5 [62.2, 62.8] | 1.08 [1.05, 1.12]✗ | 413.6 [412.7, 414.5]✗ | 77.6 [77.5, 77.7] | 14.8 [14.5, 15.1]✗ | 57.3 [57.1, 57.4] | - | 2.13 |
| vA | 25/38 | 6/23 | 15/25 | 0 | 2.74 [2.67, 2.81] | 1.401 | 13.44 [13.32, 13.55] | 27.8 [27.5, 28.2]✗ | 0.104 [0.103, 0.105] | 6.6 [6.4, 6.8] | 13.7 [12.8, 14.5]~ | 17.1 [16.1, 18.0]✗ | 26.3 [26.1, 26.5] | 10.84 | 15.26 [15.14, 15.37]✗ | 7.08 [6.97, 7.19] | 147.5 [146.8, 148.2]✗ | 32.7 [32.4, 33.0]✗ | 73.6 [73.1, 74.1]✗ | 5.42 [5.39, 5.46]✗ | 60.3 [60.0, 60.6] | 1.11 [1.07, 1.15]✗ | 414.9 [413.9, 415.8]✗ | 77.7 [77.6, 77.8] | 13.9 [13.6, 14.2]✗ | 57.5 [57.3, 57.6] | atLeast:counter-press | 2.59 |
| vB | 25/38 | 6/23 | 12/25 | 0 | 2.77 [2.70, 2.84] | 1.398 | 13.48 [13.36, 13.59] | 27.9 [27.6, 28.3]✗ | 0.104 [0.103, 0.105] | 6.7 [6.5, 6.9] | 13.6 [12.7, 14.4]~ | 17.1 [16.2, 18.0]✗ | 26.3 [26.1, 26.4] | 10.77 | 15.30 [15.19, 15.42]✗ | 7.07 [6.96, 7.18] | 147.7 [147.0, 148.3]✗ | 32.6 [32.3, 32.9]✗ | 73.8 [73.3, 74.3]✗ | 5.42 [5.38, 5.45]✗ | 60.3 [60.0, 60.6] | 1.09 [1.06, 1.13]✗ | 415.2 [414.3, 416.2]✗ | 77.7 [77.6, 77.8] | 13.7 [13.4, 14.1]✗ | 57.5 [57.4, 57.6] | winShareGap:counter-balanced atLeast:counter-press points:counter | 2.19 |
| vC | 26/38 | 5/23 | 13/25 | 0 | 2.67 [2.61, 2.74] | 1.378 | 13.40 [13.28, 13.52] | 27.4 [27.1, 27.8]✗ | 0.103 [0.102, 0.104] | 6.6 [6.4, 6.9] | 13.8 [13.0, 14.7]~ | 17.4 [16.4, 18.3]✗ | 26.7 [26.6, 26.9] | 11.15 | 15.14 [15.03, 15.25]✗ | 7.13 [7.02, 7.24] | 147.8 [147.1, 148.4]✗ | 32.7 [32.4, 33.0]✗ | 74.0 [73.5, 74.5]✗ | 5.42 [5.39, 5.46]✗ | 60.5 [60.2, 60.8] | 1.12 [1.08, 1.15]✗ | 415.7 [414.7, 416.6]✗ | 77.7 [77.6, 77.7] | 13.9 [13.6, 14.2]✗ | 57.6 [57.5, 57.7] | atLeast:counter-press | 2.69 |

## Rows whose verdict moved against vbase

vC (kept):

```
30:bigChances: OUT → unresolved  1.230 [1.196, 1.264] → 0.807 [0.780, 0.835]
30:bigChancesScored: OUT → unresolved  0.620 [0.597, 0.643] → 0.392 [0.373, 0.411]
30:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.057 [12.897, 13.217]
23:shots: OUT → in  14.831 [14.703, 14.959] → 13.401 [13.283, 13.518]
23:shotsGoalArea: OUT → in  12.900 [12.624, 13.176] → 6.648 [6.441, 6.854]
23:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.057 [12.897, 13.217]
23:fouls: OUT → in  9.869 [9.787, 9.950] → 10.400 [10.316, 10.485]
23:yellowCards: unresolved → in  3.272 [3.206, 3.339] → 3.430 [3.362, 3.498]
23:redCards: unresolved → in  0.085 [0.073, 0.096] → 0.100 [0.088, 0.113]
23:goals: unresolved → in  2.964 [2.893, 3.035] → 2.672 [2.606, 2.739]
23:headedGoals: OUT → unresolved  5.834 [5.285, 6.382] → 13.829 [12.969, 14.689]
23:goalsFW: OUT → in  62.047 [60.849, 63.244] → 54.942 [53.660, 56.224]
23:goalsMF: in → unresolved  33.652 [32.484, 34.820] → 37.777 [36.556, 38.997]
29:winShareGap:press-counter: in → insuf  0.044 [-0.004, 0.092] → 0.112 [0.064, 0.159]
29:atLeast:counter-press: insuf → OUT  -0.044 [-0.092, 0.004] → -0.112 [-0.159, -0.064]
29:points:possession: insuf → in  -0.122 [-0.164, -0.081] → -0.080 [-0.121, -0.039]
29:points:press: in → insuf  0.098 [0.056, 0.140] → 0.125 [0.083, 0.168]
29:points:counter: in → insuf  -0.093 [-0.135, -0.052] → -0.141 [-0.183, -0.100]
29:points:balanced: insuf → in  0.117 [0.075, 0.160] → 0.096 [0.054, 0.138]
29:ordering:xgConceded: in → insuf  0.057 [0.030, 0.085] → 0.018 [-0.008, 0.044]
inside counts {"23":{"vbase":21,"vC":26},"29":{"vbase":15,"vC":13},"30":{"vbase":6,"vC":5}}
```

vA (the shares 0.35/0.39/0.31/0.35 and `boxFoul` 0.0554):

```
30:bigChances: OUT → in  1.230 [1.196, 1.264] → 0.840 [0.812, 0.868]
30:bigChancesScored: OUT → unresolved  0.620 [0.597, 0.643] → 0.414 [0.395, 0.432]
30:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.030 [12.868, 13.191]
23:shots: OUT → in  14.831 [14.703, 14.959] → 13.435 [13.316, 13.554]
23:shotsGoalArea: OUT → in  12.900 [12.624, 13.176] → 6.624 [6.417, 6.832]
23:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.030 [12.868, 13.191]
23:fouls: OUT → in  9.869 [9.787, 9.950] → 10.509 [10.426, 10.592]
23:yellowCards: unresolved → in  3.272 [3.206, 3.339] → 3.435 [3.366, 3.505]
23:redCards: unresolved → in  0.085 [0.073, 0.096] → 0.105 [0.092, 0.118]
23:goals: unresolved → in  2.964 [2.893, 3.035] → 2.740 [2.673, 2.807]
23:penaltyGoals: in → OUT  7.605 [6.988, 8.221] → 10.052 [9.319, 10.785]
23:headedGoals: OUT → unresolved  5.834 [5.285, 6.382] → 13.656 [12.806, 14.505]
23:goalsFW: OUT → in  62.047 [60.849, 63.244] → 54.653 [53.412, 55.894]
23:goalsMF: in → unresolved  33.652 [32.484, 34.820] → 38.032 [36.834, 39.231]
29:draws:possession-counter: insuf → in  0.285 [0.259, 0.311] → 0.272 [0.247, 0.297]
29:draws:press-press: insuf → in  0.215 [0.182, 0.248] → 0.237 [0.203, 0.271]
29:winShareGap:press-counter: in → insuf  0.044 [-0.004, 0.092] → 0.134 [0.087, 0.182]
29:atLeast:counter-press: insuf → OUT  -0.044 [-0.092, 0.004] → -0.134 [-0.182, -0.087]
29:points:possession: insuf → in  -0.122 [-0.164, -0.081] → -0.093 [-0.134, -0.051]
29:points:press: in → insuf  0.098 [0.056, 0.140] → 0.152 [0.110, 0.194]
29:points:counter: in → insuf  -0.093 [-0.135, -0.052] → -0.159 [-0.200, -0.118]
29:points:balanced: insuf → in  0.117 [0.075, 0.160] → 0.100 [0.058, 0.142]
29:ordering:xgConceded: in → insuf  0.057 [0.030, 0.085] → 0.010 [-0.016, 0.036]
inside counts {"23":{"vbase":21,"vA":25},"29":{"vbase":15,"vA":15},"30":{"vbase":6,"vA":6}}
```

vB (vA with the midfield line's shot weight 20 and `shotScale` 0.39):

```
30:bigChances: OUT → in  1.230 [1.196, 1.264] → 0.842 [0.815, 0.870]
30:bigChancesScored: OUT → unresolved  0.620 [0.597, 0.643] → 0.411 [0.393, 0.430]
30:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.066 [12.906, 13.227]
23:shots: OUT → in  14.831 [14.703, 14.959] → 13.477 [13.360, 13.594]
23:shotsGoalArea: OUT → in  12.900 [12.624, 13.176] → 6.723 [6.513, 6.933]
23:crosses: in → unresolved  14.074 [13.912, 14.236] → 13.066 [12.906, 13.227]
23:fouls: OUT → in  9.869 [9.787, 9.950] → 10.460 [10.376, 10.543]
23:yellowCards: unresolved → in  3.272 [3.206, 3.339] → 3.390 [3.323, 3.457]
23:redCards: unresolved → in  0.085 [0.073, 0.096] → 0.108 [0.095, 0.121]
23:goals: unresolved → in  2.964 [2.893, 3.035] → 2.771 [2.704, 2.838]
23:penaltyGoals: in → unresolved  7.605 [6.988, 8.221] → 9.053 [8.369, 9.737]
23:headedGoals: OUT → unresolved  5.834 [5.285, 6.382] → 13.579 [12.742, 14.416]
23:goalsFW: OUT → in  62.047 [60.849, 63.244] → 56.226 [54.970, 57.481]
23:goalsMF: in → unresolved  33.652 [32.484, 34.820] → 36.511 [35.306, 37.717]
29:draws:possession-possession: insuf → in  0.312 [0.275, 0.349] → 0.262 [0.226, 0.297]
29:draws:counter-balanced: in → insuf  0.262 [0.237, 0.287] → 0.277 [0.252, 0.303]
29:draws:balanced-balanced: in → insuf  0.245 [0.211, 0.279] → 0.222 [0.188, 0.255]
29:winShareGap:press-counter: in → insuf  0.044 [-0.004, 0.092] → 0.153 [0.106, 0.201]
29:winShareGap:counter-balanced: insuf → OUT  -0.133 [-0.181, -0.086] → -0.176 [-0.223, -0.129]
29:atLeast:counter-press: insuf → OUT  -0.044 [-0.092, 0.004] → -0.153 [-0.201, -0.106]
29:points:possession: insuf → in  -0.122 [-0.164, -0.081] → -0.068 [-0.109, -0.026]
29:points:press: in → insuf  0.098 [0.056, 0.140] → 0.172 [0.129, 0.214]
29:points:counter: in → OUT  -0.093 [-0.135, -0.052] → -0.198 [-0.239, -0.158]
29:points:balanced: insuf → in  0.117 [0.075, 0.160] → 0.094 [0.052, 0.136]
29:ordering:xgConceded: in → insuf  0.057 [0.030, 0.085] → 0.016 [-0.011, 0.043]
inside counts {"23":{"vbase":21,"vB":25},"29":{"vbase":15,"vB":12},"30":{"vbase":6,"vB":6}}
```

Calibration round 74 at 300 a pairing, y0 → y1 (the kept setting):

```
30:xa: unresolved → in  1.127 [1.091, 1.162] → 0.995 [0.966, 1.024]
30:bigChances: OUT → unresolved  1.310 [1.241, 1.379] → 0.840 [0.785, 0.895]
30:bigChancesScored: OUT → unresolved  0.645 [0.600, 0.690] → 0.408 [0.371, 0.446]
30:cutBacks: unresolved → OUT  0.319 [0.286, 0.352] → 0.255 [0.224, 0.286]
30:throughBalls: unresolved → OUT  1.808 [1.616, 2.000] → 1.773 [1.585, 1.962]
23:passForward: OUT → unresolved  40.621 [40.412, 40.830] → 40.169 [39.955, 40.383]
23:possessionShots: unresolved → in  14.876 [14.615, 15.136] → 13.425 [13.173, 13.678]
23:shots: OUT → in  15.165 [14.917, 15.413] → 13.616 [13.375, 13.857]
23:shotsGoalArea: OUT → in  12.935 [12.440, 13.431] → 6.849 [6.428, 7.269]
23:shotsBox: in → unresolved  51.511 [50.701, 52.322] → 57.525 [56.673, 58.377]
23:corners: unresolved → in  5.918 [5.763, 6.072] → 4.473 [4.346, 4.601]
23:fouls: unresolved → in  9.956 [9.792, 10.120] → 10.320 [10.157, 10.483]
23:redCards: unresolved → in  0.075 [0.053, 0.097] → 0.117 [0.089, 0.145]
23:goals: OUT → in  3.090 [2.953, 3.227] → 2.748 [2.610, 2.886]
23:penaltyGoals: in → unresolved  7.497 [6.216, 8.779] → 7.823 [6.494, 9.152]
23:headedGoals: OUT → unresolved  5.609 [4.546, 6.673] → 14.312 [12.516, 16.108]
23:goalsFW: unresolved → in  60.734 [58.406, 63.061] → 53.123 [50.624, 55.622]
23:goalsDF: OUT → unresolved  3.668 [2.817, 4.518] → 7.823 [6.461, 9.185]
29:draws:press-counter: in → insuf  0.253 [0.218, 0.288] → 0.293 [0.257, 0.330]
29:winShareGap:possession-counter: insuf → in  -0.087 [-0.153, -0.020] → -0.023 [-0.090, 0.044]
29:winShareGap:press-balanced: in → insuf  -0.030 [-0.101, 0.041] → -0.063 [-0.133, 0.006]
inside counts {"23":{"y0":18,"y1":24},"29":{"y0":8,"y1":7},"30":{"y0":5,"y1":6}}
```
