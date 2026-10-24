# T409 screen settings

Calibration round 62 from 9fb8a0be with T409's neutral hooks (`AGGREGATE_CONFIG.addedSeconds`, `tactics.*.secondYellow`), each run's configs patched by `--patch` (`aggregate` is `AGGREGATE_CONFIG`), with the same arguments as T400's screens (`t400-screen-settings.md`) and `--round 62`. Validation round 67 ran the base, k1 and q2 with `--partition validation --round 67 --seasons 20 --stress 5000`.

| run | patch |
|---|---|
| base | `{}` |
| p1 | `{"aggregate":{"passes":{"perMatch":860},"completion":{"direction":{"forward":-0.06}}}}` |
| p2 | `{"aggregate":{"passes":{"perMatch":840},"completion":{"direction":{"forward":-0.04}}}}` |
| p3 | `{"aggregate":{"passes":{"perMatch":860},"forward":{"long":0.2}}}` |
| d1 | `{"aggregate":{"carries":{"lost":0.07}}}` |
| d2 | `{"aggregate":{"carries":{"lost":0.07},"failed":{"intercepted":0.16}}}` |
| k1 | `{"aggregate":{"addedSeconds":[20,30,0,0]}}` |
| t1 | `{"aggregate":{"tactics":{"counter":{"shot":1.3},"balanced":{"shot":1.1}}}}` |
| t2 | `{"aggregate":{"tactics":{"possession":{"guard":1.05},"press":{"guard":1.03}}}}` |
| t3 | `{"aggregate":{"tactics":{"counter":{"shot":1.3},"balanced":{"shot":1.1},"possession":{"guard":1.05},"press":{"guard":1.03}}}}` |
| y1 | `{"participation":{},"aggregate":{"tactics":{"press":{"secondYellow":0.75},"counter":{"secondYellow":1.4}}}}` |
| q1 | `{"aggregate":{"addedSeconds":[20,30,0,0],"carries":{"lost":0.06}}}` |
| q2 | `{"aggregate":{"addedSeconds":[20,30,0,0],"carries":{"lost":0.06},"failed":{"intercepted":0.16}}}` |
| q3 | `{"aggregate":{"addedSeconds":[20,30,0,0],"tactics":{"counter":{"shot":1.3},"balanced":{"shot":1.1},"possession":{"guard":1.05},"press":{"guard":1.03}}}}` |
| q4 | `{"aggregate":{"addedSeconds":[20,30,0,0],"carries":{"lost":0.06},"tactics":{"counter":{"shot":1.3},"balanced":{"shot":1.1},"possession":{"guard":1.05},"press":{"guard":1.03}}}}` |
| q5 | `{"aggregate":{"addedSeconds":[25,35,0,0],"tactics":{"counter":{"shot":1.3},"balanced":{"shot":1.1}}}}` |
| q6 | `{"aggregate":{"addedSeconds":[20,30,0,0],"tactics":{"counter":{"shot":1.3,"secondYellow":1.4},"balanced":{"shot":1.1},"possession":{"guard":1.05},"press":{"guard":1.03,"secondYellow":0.75}}}}` |
