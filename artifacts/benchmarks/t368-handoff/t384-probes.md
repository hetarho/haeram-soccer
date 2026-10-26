# T384 probes: offside by the receiver's 판단력 on both paths

`t384-probe.mts` plays `core:equal-top-tier` on the candidate grid and the aggregate path. Grid figures come from the engine's own offside draws (`GridSetup.offsideDraws`): every pass to a receiver in an offside position, a team a match. Quarters are of the receiver's 판단력 attribute over those receptions (cutoffs 61–62 / 67 / 72). The aggregate share uses the same cutoffs. The candidate runs patch the aggregate with `attribution.offsideCall` 2 and `aggregate.failed.offside` 0.063 / 0.315 (screens) or 0.064 / 0.32 (K). The base aggregate is the 01b91f91 tree (offsides by `pace`), read with `--cut 62,67,72`. A base-tree row has no grid draws.

| sample | setting | grid offsides | offside receptions | called | per reception Q1 … Q4 | Q1 ÷ Q4 | linebreaker | grid share Q1/Q2/Q3/Q4 % | aggregate offsides | aggregate share % |
|---|---|---|---|---|---|---|---|---|---|---|
| calibration 55, 600 core | base grid (01b91f91 rule, neutral on the T384 tree) | 1.708 | 32.37 | 5.28% [5.05, 5.50] | Q1 7.34% [6.86, 7.83] of 11209; Q2 5.28% [4.83, 5.73] of 9432; Q3 4.38% [3.97, 4.80] of 9217; Q4 3.61% [3.22, 3.99] of 8985 | 2.04 | 1.57% [1.28, 1.85] | 40.2 / 24.3 / 19.7 / 15.8 | – | – |
| calibration 55, 600 core | base aggregate (01b91f91 tree, pace role) | – | – | – | – | – | – | – | 1.657 | 31.3 / 22.2 / 21.5 / 25.0 |
| calibration 55, 600 core | k1 spread 13, base 0.052 | 1.744 | 32.27 | 5.41% [5.18, 5.63] | Q1 9.94% [9.39, 10.50] of 11255; Q2 5.06% [4.61, 5.50] of 9294; Q3 3.49% [3.12, 3.87] of 9158; Q4 2.04% [1.75, 2.33] of 9015 | 4.87 | 1.68% [1.38, 1.97] | 53.5 / 22.5 / 15.3 / 8.8 | 1.764 | 52.1 / 23.5 / 15.0 / 9.4 |
| calibration 55, 600 core | k2 spread 12, base 0.05 | 1.728 | 32.26 | 5.36% [5.13, 5.58] | Q1 10.19% [9.63, 10.75] of 11231; Q2 4.97% [4.53, 5.42] of 9309; Q3 3.30% [2.94, 3.67] of 9138; Q4 1.83% [1.55, 2.10] of 9029 | 5.57 | 1.68% [1.39, 1.97] | 55.2 / 22.3 / 14.6 / 8.0 | 1.764 | 53.2 / 23.8 / 14.9 / 8.1 |
| calibration 55, 600 core | k3 spread 15, base 0.053 | 1.745 | 32.33 | 5.40% [5.17, 5.62] | Q1 9.24% [8.71, 9.78] of 11293; Q2 5.25% [4.79, 5.70] of 9322; Q3 3.82% [3.43, 4.21] of 9140; Q4 2.35% [2.03, 2.66] of 9038 | 3.94 | 1.70% [1.40, 1.99] | 49.9 / 23.4 / 16.7 / 10.1 | 1.764 | 49.7 / 24.0 / 15.8 / 10.4 |
| calibration 55, 600 core | k4 spread 13, base 0.053, high line ×1.25 | 1.758 | 32.29 | 5.45% [5.22, 5.67] | Q1 9.93% [9.38, 10.48] of 11237; Q2 5.22% [4.77, 5.67] of 9326; Q3 3.51% [3.14, 3.89] of 9196; Q4 2.05% [1.76, 2.34] of 8985 | 4.85 | 1.70% [1.41, 2.00] | 52.9 / 23.1 / 15.3 / 8.7 | 1.764 | 52.1 / 23.5 / 15.0 / 9.4 |
| validation 55, 2,400 core | base grid | 1.675 | 32.17 | 5.21% [5.10, 5.32] | Q1 7.19% [6.94, 7.45] of 39949; Q2 5.15% [4.94, 5.36] of 43178; Q3 4.49% [4.28, 4.70] of 37402; Q4 3.73% [3.53, 3.93] of 33900 | 1.93 | 1.44% [1.31, 1.57] | 35.7 / 27.7 / 20.9 / 15.7 | – | – |
| validation 55, 2,400 core | base aggregate | – | – | – | – | – | – | – | 1.689 | 29.9 / 22.9 / 23.1 / 24.0 |
| validation 55, 2,400 core | **K** spread 15, base 0.055 | 1.785 | 32.20 | 5.54% [5.43, 5.66] | Q1 9.67% [9.38, 9.96] of 39409; Q2 5.65% [5.43, 5.87] of 42978; Q3 3.84% [3.64, 4.03] of 37689; Q4 2.55% [2.39, 2.72] of 34461 | 3.79 | 1.94% [1.79, 2.10] | 44.5 / 28.4 / 16.9 / 10.3 | 1.804 | 43.5 / 30.3 / 16.2 / 9.9 |
| validation 56, 2,400 core | base grid | 1.632 | 32.15 | 5.08% [4.97, 5.19] | Q1 7.13% [6.88, 7.39] of 39191; Q2 5.23% [5.02, 5.44] of 43282; Q3 4.12% [3.92, 4.32] of 37419; Q4 3.58% [3.39, 3.78] of 34434 | 1.99 | 1.28% [1.15, 1.40] | 35.7 / 28.9 / 19.7 / 15.8 | – | – |
| validation 56, 2,400 core | base aggregate | – | – | – | – | – | – | – | 1.714 | 28.9 / 23.4 / 23.4 / 24.3 |
| validation 56, 2,400 core | **K** spread 15, base 0.055 | 1.774 | 32.07 | 5.53% [5.42, 5.65] | Q1 9.50% [9.21, 9.79] of 38836; Q2 5.72% [5.50, 5.94] of 42859; Q3 3.95% [3.75, 4.14] of 37399; Q4 2.58% [2.41, 2.74] of 34829 | 3.69 | 1.82% [1.67, 1.97] | 43.3 / 28.8 / 17.3 / 10.5 | 1.823 | 43.0 / 30.0 / 16.7 / 10.3 |

## Quick screens (calibration 55, 300 core each; console readings)

On the duels' scale (`skill(…, 'decisions')` at the draw, 10/25/50/75/90% at 27 / 40 / 53 / 65 / 74) an exponential call with pivot 53 separated the duels' quarters (14.7× at spread 20) but not the attribute's. Today's linear rule already gives 8.9× on the duels' quarters and 1.73× (100 matches) to 2.04× (600) on the attribute's:

| call | offsides | attribute Q1 ÷ Q4 |
|---|---|---|
| duels' scale, spread 20, base 0.04 | 2.09 | 1.52 |
| duels' scale, spread 15, base 0.035 | 2.43 | 1.61 |
| duels' scale, spread 25, base 0.045 | 1.95 | 1.58 |
| attribute, spread 15, base 0.035 | 1.26 | 2.86 |
| attribute, spread 12, base 0.03 | 1.17 | 3.72 |
| attribute, spread 18, base 0.04 | 1.37 | 2.72 |
| attribute, spread 12, base 0.045 | 1.71 | 4.38 |
| attribute, spread 12, base 0.05 | 1.79 | 5.45 |
| attribute, spread 11, base 0.045 | 1.73 | 5.13 |
| attribute, spread 13, base 0.052 | 1.80 | 4.71 |
| attribute, spread 15, base 0.06 | 2.04 | 3.73 |
| attribute, spread 13, base 0.058, high line ×1.25 | 1.96 | 4.65 |

Aggregate lean (spread 13, base 0.052 on the grid, whose share was 50.8 / 24.4 / 15.3 / 9.5%): `offsideCall` 1 → 37 / 29 / 18 / 16%, 1.5 → 42.5 / 28.9 / 16.6 / 12.0%, **2 → 46.8 / 29.3 / 14.4 / 9.5%**, 2.5 → 50.4 / 30.2 / 13.5 / 6.0%. An earlier inverse power on the duels' scale (2) left it flat at 28 / 25 / 21 / 26% (100 matches).
