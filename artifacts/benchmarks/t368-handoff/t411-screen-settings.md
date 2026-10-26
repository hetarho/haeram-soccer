# T411 screen settings

Calibration round 63, `scripts/t328-counter-roles.ts --set all --per 60 --core 600 --gap 60` on cd2a1c3c with T411's neutral hooks; each run patches the candidate configs (`--patch`). No validation round was run: every screened setting that moved the final-third rows also took goals to 2.4–2.6 (MATCH-23 2.6–2.9) or offsides and tackles outside.

| run | patch |
|---|---|
| base | `{}` |
| w1 | `{"decide":{"candidate":{"patience":{"seconds":30,"pass":0.6,"shot":1,"cross":1}}}}` |
| w2 | `{"decide":{"candidate":{"patience":{"seconds":30,"pass":0.5,"shot":1.3,"cross":1.3}}}}` |
| w3 | `{"decide":{"candidate":{"patience":{"seconds":20,"pass":0.5,"shot":1.3,"cross":1.3}}}}` |
| m1 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.05}}}}` |
| m2 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.1}}}}` |
| c1 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.05}}},"decide":{"candidate":{"patience":{"seconds":30,"pass":0.5,"shot":1.3,"cross":1.3}}}}` |
| c2 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.1}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.5,"carry":1,"pass":1},"shotScale":0.46}}}` |
| c3 | `{"decide":{"candidate":{"patience":{"seconds":30,"pass":0.5,"shot":1.3,"cross":1.3},"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.5,"carry":1,"pass":1}}}}` |
| n1 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}}}` |
| n2 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.1}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.5,"carry":1,"pass":1},"shotScale":0.5}}}` |
| n3 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.1}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.5,"carry":1,"pass":1},"shotScale":0.5}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| n4 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.4,"carry":1,"pass":1},"shotScale":0.52}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| n5 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.1}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.6,"carry":1,"pass":1},"shotScale":0.48}},"restart":{"offside":{"candidate":{"base":0.055}}}}` |
| n6 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"shotScale":0.47}}}` |
| o1 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.4,"carry":1,"pass":1},"shotScale":0.57}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| o2 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.6,"carry":1,"pass":1},"shotScale":0.55}},"restart":{"offside":{"candidate":{"base":0.055}}}}` |
| o3 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.2}}},"decide":{"candidate":{"shotScale":0.55}},"restart":{"offside":{"candidate":{"base":0.055}}}}` |
| o4 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.2}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.6,"carry":1,"pass":1},"shotScale":0.58}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| r1 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.4,"carry":1,"pass":1},"shotScale":0.52,"cutBackShare":0.8}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| r2 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.4,"carry":1,"pass":1},"shotScale":0.52,"cutBackShare":1}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| r3 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.15}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.4,"carry":1,"pass":1},"shotScale":0.52,"cutBackShare":0.8,"shotQuality":{"ref":0.25,"power":0.5,"most":1}}},"restart":{"offside":{"candidate":{"base":0.06}}}}` |
| r4 | `{"duel":{"candidate":{"finalThirdPass":{"from":70,"malus":0.12}}},"decide":{"candidate":{"finalThird":{"from":70,"lateral":1,"back":1,"entry":0.5,"carry":1,"pass":1},"shotScale":0.52,"cutBackShare":0.8}},"restart":{"offside":{"candidate":{"base":0.058}}}}` |
