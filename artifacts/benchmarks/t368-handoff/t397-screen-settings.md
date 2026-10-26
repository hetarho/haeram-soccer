# T397 screen settings

Calibration round 57, `scripts/t328-counter-roles.ts --set all --per 60 --core 600 --gap 60` on the counting-fixed tree; each run patches the candidate configs (`--patch`). `base` and the neutral reruns (n0, d0, e0) set nothing and read identically.

| run | patch |
|---|---|
| n0 | `{}` |
| a1 | `{"decide":{"candidate":{"past":{"prior":0.5,"through":0}}}}` |
| a2 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0}}}}` |
| a3 | `{"decide":{"candidate":{"past":{"prior":0.1,"through":0}}}}` |
| c1 | `{"decide":{"candidate":{"cutBackShare":0.3}}}` |
| c2 | `{"decide":{"candidate":{"cutBackShare":0.5}}}` |
| b1 | `{"decide":{"candidate":{"firstTouch":{"carry":2,"pressure":1}}}}` |
| b2 | `{"decide":{"candidate":{"firstTouch":{"carry":4,"pressure":1}}}}` |
| g1 | `{"decide":{"candidate":{"gain":0.7}}}` |
| g2 | `{"decide":{"candidate":{"gain":0.4}}}` |
| o1 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0}}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| t1 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1}}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| t2 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":2}}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| k1 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"gain":0.7,"shotScale":0.513,"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| k2 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"gain":0.6,"shotScale":0.53,"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| d0 | `{}` |
| d1 | `{"decide":{"candidate":{"boxCarry":5}}}` |
| d2 | `{"decide":{"candidate":{"boxCarry":10}}}` |
| d3 | `{"decide":{"candidate":{"boxCarry":20}}}` |
| m1 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":10,"shotScale":0.52}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| m2 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":10,"shotScale":0.52,"cutBackShare":0.5,"firstTouch":{"carry":4,"pressure":1}}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| x1 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":20,"shotScale":0.56}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| x2 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":15,"shotScale":0.54}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| x3 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":20,"shotScale":0.56,"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| x4 | `{"decide":{"candidate":{"past":{"prior":0.25,"through":0},"through":{"score":1},"boxCarry":20,"shotScale":0.58,"gain":0.85}},"restart":{"offside":{"candidate":{"base":0.092}}}}` |
| x5 | `{"decide":{"candidate":{"boxCarry":20,"shotScale":0.54}}}` |
| y1 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1}}}}` |
| y2 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}}}` |
| y3 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"boxCarry":8,"shotQuality":{"ref":0.3,"power":0.75,"most":1},"shotScale":0.52}}}` |
| y4 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"boxCarry":12,"shotQuality":{"ref":0.3,"power":1,"most":1},"shotScale":0.56}}}` |
| y5 | `{"decide":{"candidate":{"shotQuality":{"ref":0.3,"power":1,"most":1},"shotScale":0.53}}}` |
| z1 | `{"decide":{"candidate":{"gain":0.5,"shotScale":0.58}}}` |
| z2 | `{"decide":{"candidate":{"gain":0.4,"shotScale":0.62}}}` |
| z3 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"boxCarry":10,"gain":0.4,"shotScale":0.64}}}` |
| z4 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"boxCarry":10,"gain":0.3,"shotScale":0.7}}}` |
| e0 | `{}` |
| e1 | `{"decide":{"candidate":{}},"duel":{"candidate":{"boxTackle":0.3}}}` |
| e2 | `{"decide":{"candidate":{}},"duel":{"candidate":{"boxTackle":0.6}}}` |
| f1 | `{"decide":{"candidate":{"inBoxCarry":0.5}}}` |
| f2 | `{"decide":{"candidate":{"inBoxCarry":0.25}}}` |
| ef | `{"decide":{"candidate":{"inBoxCarry":0.4}},"duel":{"candidate":{"boxTackle":0.5}}}` |
| efy | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"inBoxCarry":0.4}},"duel":{"candidate":{"boxTackle":0.5}}}` |
| w1 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.064}}}}` |
| w2 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1.5},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.066}}}}` |
| w3 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1.5},"firstTouch":{"carry":4,"pressure":1},"cutBackShare":0.5,"boxCarry":5,"shotScale":0.5}},"restart":{"offside":{"candidate":{"base":0.066}}}}` |
| w4 | `{"decide":{"candidate":{"past":{"prior":1,"through":0},"through":{"score":1.5},"firstTouch":{"carry":6,"pressure":1},"cutBackShare":0.5}},"restart":{"offside":{"candidate":{"base":0.066}}}}` |
