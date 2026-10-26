# T398 screen settings

Calibration round 58, `scripts/t328-counter-roles.ts --set all --per 60 --core 600 --gap 60` on T397's football with T398's neutral hooks; each run patches the candidate configs (`--patch`).

| run | patch |
|---|---|
| base | `{}` |
| a1 | `{"shape":{"candidate":{"boxRun":{"odds":2}}}}` |
| a2 | `{"shape":{"candidate":{"boxRun":{"odds":3,"from":4}}}}` |
| a3 | `{"shape":{"candidate":{"boxRun":{"odds":4}}}}` |
| b1 | `{"decide":{"candidate":{"arriving":1}},"duel":{"candidate":{"crossArriving":8}}}` |
| b2 | `{"decide":{"candidate":{"arriving":2}},"duel":{"candidate":{"crossArriving":16}}}` |
| c1 | `{"shape":{"candidate":{"secondStriker":{"drop":8}}}}` |
| c2 | `{"shape":{"candidate":{"secondStriker":{"drop":15}}}}` |
| p1 | `{"shape":{"candidate":{"boxRun":{"odds":1.3}}}}` |
| p2 | `{"shape":{"candidate":{"boxRun":{"odds":1.5}}},"decide":{"candidate":{"shotScale":0.45}}}` |
| p3 | `{"shape":{"candidate":{"boxRun":{"odds":1.5}}},"decide":{"candidate":{"shotScale":0.43}}}` |
| p4 | `{"shape":{"candidate":{"boxRun":{"odds":1.7}}},"decide":{"candidate":{"shotScale":0.42}}}` |
| p5 | `{"shape":{"candidate":{"boxRun":{"odds":1.5},"secondStriker":{"drop":8}}},"decide":{"candidate":{"shotScale":0.44}}}` |
| q1 | `{"shape":{"candidate":{"boxRun":{"odds":1.3}}},"decide":{"candidate":{"shotScale":0.43}}}` |
| q2 | `{"shape":{"candidate":{"boxRun":{"odds":1.3}}},"decide":{"candidate":{"shotScale":0.4}}}` |
| q3 | `{"shape":{"candidate":{"boxRun":{"odds":1.5}}},"decide":{"candidate":{"shotScale":0.4}}}` |
| q4 | `{"shape":{"candidate":{"boxRun":{"odds":1.4}}},"decide":{"candidate":{"shotScale":0.38}}}` |
| q5 | `{"shape":{"candidate":{"boxRun":{"odds":1.5}}},"decide":{"candidate":{"shotScale":0.42,"shotLine":{"GK":0,"DF":4.5,"MF":18,"FW":0.3}}}}` |
| r1 | `{"shape":{"candidate":{"boxRun":{"odds":1.3}}},"decide":{"candidate":{"shotScale":0.46,"longShotScale":3}}}` |
| r2 | `{"shape":{"candidate":{"boxRun":{"odds":1.3}}},"decide":{"candidate":{"shotScale":0.45,"longShotScale":2.8}}}` |
| r3 | `{"shape":{"candidate":{"boxRun":{"odds":1.4}}},"decide":{"candidate":{"shotScale":0.45,"longShotScale":2.8}}}` |
