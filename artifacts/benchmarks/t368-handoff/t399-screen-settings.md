# T399 screen settings

Calibration round 59, `scripts/t328-counter-roles.ts --set all` on T398's football with T399's neutral hooks; each run patches the configs (`--patch`). `base` and `f1`–`s1` ran `--per 60 --core 600 --gap 60`, `B`, `k1`–`k4` and `p1`–`p4` `--per 200 --core 600 --gap 60`. Validation rounds 61 and 62 ran `--per 600 --core 2400 --gap 600` for the base, p4 and p5 with the same seeds.

| run | patch |
|---|---|
| base | `{}` |
| f1 | `{"shape":{"candidate":{"flank":{"follow":0.3,"channel":3}}}}` |
| f2 | `{"shape":{"candidate":{"flank":{"follow":0.5,"channel":5}}}}` |
| f3 | `{"shape":{"candidate":{"flank":{"follow":0.7,"channel":8}}}}` |
| f4 | `{"shape":{"candidate":{"flank":{"follow":0.5,"channel":0}}}}` |
| f5 | `{"shape":{"candidate":{"flank":{"follow":0,"channel":6}}}}` |
| t1 | `{"coordination":{"transition":{"seconds":10,"odds":{"counter":3.5}}}}` |
| t2 | `{"decide":{"direct":{"forward":{"counter":4}}},"coordination":{"transition":{"odds":{"counter":3.5}}}}` |
| s1 | `{"shape":{"candidate":{"secondStriker":{"drop":8,"roles":["poacher"]}}}}` |
| B | `{}` |
| k1 | `{"shape":{"candidate":{"flank":{"tuck":0.5}}}}` |
| k2 | `{"shape":{"candidate":{"flank":{"tuck":0.8}}}}` |
| k3 | `{"shape":{"candidate":{"flank":{"follow":0.3,"channel":3,"tuck":0.6}}}}` |
| k4 | `{"shape":{"candidate":{"flank":{"follow":0.3,"channel":3}}}}` |
| p1 | `{"duel":{"candidate":{"crossPressure":0.1}}}` |
| p2 | `{"duel":{"candidate":{"crossPressure":0.1}},"shape":{"candidate":{"flank":{"follow":0.5}}}}` |
| p3 | `{"duel":{"candidate":{"crossPressure":0.2}},"shape":{"candidate":{"flank":{"follow":0.5}}}}` |
| p4 | `{"duel":{"candidate":{"crossPressure":0.2}},"shape":{"candidate":{"flank":{"follow":0.5,"channel":3}}}}` |
| p5 (validation only) | `{"duel":{"candidate":{"crossPressure":0.15}},"shape":{"candidate":{"flank":{"follow":0.4,"channel":3}}}}` |
