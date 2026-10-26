# T408 screen settings

Calibration round 61, `scripts/t328-counter-roles.ts --set all --per 60 --core 600 --gap 60` on a4371391 with T408's neutral hooks (`DECISION_CONFIG.candidate.finalThird`); each run patches the candidate configs (`--patch`). Validation rounds 65 and 66 ran base, g2 and g4 with `--per 600 --core 2400 --gap 600`.

| run | patch |
|---|---|
| base | `{}` |
| f1 | `{"decide":{"candidate":{"finalThird":{"lateral":0.6}}}}` |
| f2 | `{"decide":{"candidate":{"finalThird":{"lateral":0.6,"back":1.5}}}}` |
| f3 | `{"decide":{"candidate":{"finalThird":{"lateral":0.6,"back":1.5,"entry":0.6}}}}` |
| f4 | `{"decide":{"candidate":{"finalThird":{"lateral":0.4,"back":2,"entry":0.5}}}}` |
| c1 | `{"decide":{"candidate":{"finalThird":{"carry":1.3}}}}` |
| c2 | `{"decide":{"candidate":{"finalThird":{"carry":1.6}}}}` |
| b1 | `{"decide":{"candidate":{"boxCarry":10}}}` |
| k1 | `{"decide":{"candidate":{"finalThird":{"lateral":0.6,"back":1.5,"entry":0.6,"carry":1.3},"boxCarry":10}}}` |
| a1 | `{"decide":{"candidate":{"finalThird":{"pass":0.8}}}}` |
| a2 | `{"decide":{"candidate":{"finalThird":{"pass":0.65}}}}` |
| a3 | `{"decide":{"candidate":{"finalThird":{"pass":0.5}}}}` |
| a4 | `{"decide":{"candidate":{"finalThird":{"pass":0.65},"shotScale":0.4}}}` |
| a5 | `{"decide":{"candidate":{"finalThird":{"pass":0.65,"carry":1.15}}}}` |
| a6 | `{"decide":{"candidate":{"finalThird":{"pass":0.65,"lateral":0.6,"entry":0.7}}}}` |
| a7 | `{"decide":{"candidate":{"finalThird":{"pass":0.65,"carry":1.15},"shotScale":0.4}}}` |
| e1 | `{"decide":{"candidate":{"finalThird":{"entry":0.5}}}}` |
| e2 | `{"decide":{"candidate":{"finalThird":{"entry":0.3}}}}` |
| e3 | `{"decide":{"candidate":{"finalThird":{"entry":0.3,"lateral":0.8}}}}` |
| e4 | `{"decide":{"candidate":{"finalThird":{"entry":0.4,"pass":0.85}}}}` |
| e5 | `{"decide":{"candidate":{"finalThird":{"entry":0.3,"pass":0.85,"carry":1.1}}}}` |
| g1 | `{"decide":{"candidate":{"finalThird":{"entry":0.3},"shotScale":0.47}}}` |
| g2 | `{"decide":{"candidate":{"finalThird":{"entry":0.2},"shotScale":0.47}}}` |
| g3 | `{"decide":{"candidate":{"finalThird":{"entry":0.2},"shotScale":0.5}}}` |
| g4 | `{"decide":{"candidate":{"finalThird":{"entry":0.2,"carry":1.1},"shotScale":0.47}}}` |
| g5 | `{"decide":{"candidate":{"finalThird":{"entry":0.3,"lateral":0.8},"shotScale":0.47,"cutBackShare":0.7}}}` |
